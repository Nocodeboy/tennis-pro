// A person on a phone, simulated for the bots (tools/bot.ts, tools/bot-doubles.ts): the game's own HumanController
// and Input, driven frame by frame at 60 Hz (like the game) by a virtual pair of thumbs, so the bots measure the real
// control code (assist, parking, the suggested circle, the golden ring, the aim mapping, the automatic reset).
//
//  · Left thumb: after a reaction time it pushes the stick towards the circle, a bit off at first and corrected on
//    the way; it lets go near the circle (the assist finishes) or keeps pushing until the player is there (the assist
//    parks him). Between shots it walks back to a waiting spot.
//  · Right thumb: on most balls it presses, drags to a target picked with a human rule of thumb (not the AI's choice)
//    and lets go around the golden ring with a timing error; the drag lands a few pixels off and takes the time a
//    finger takes (it is still on its way if the ball comes too soon). The other balls are left to the automatic
//    reset, and so is any ball that comes too fast to aim. The three gestures (docs/notas-08-ataque.md): on a ball the
//    game marks as attackable (the orange ring) it flicks, more or less often by level, and now and then it flicks one
//    that is not (impatience); an attack coming at him it blocks with a tap, if it reacts in time.
//  · The power of the gesture (docs/notas-03-simulacion.md): an aimed release is still (a placed ball) or, now and
//    then (`moving`), on the move (a plain one); a flick's stroke has its speed (the harder, the faster). Tennis: a
//    ball dug out at full stretch he slices now and then with a down-flick (`slice`); he serves flat (a flick), sliced
//    or with kick (a still release) as `serve` says, and comes in behind an approach or a serve as `netRush` says.
//  · A phone in between: what the thumbs react to is on screen a little late and the lift reaches the game a little
//    after it happens (DEVICE_LAG); the game dates releases back by its own estimate of that (Input LAG).

const g = globalThis as unknown as { window?: unknown };
g.window ??= { addEventListener() {} };

import { Input } from '../src/input';
import { AIM_D0, AIM_LOB, AIM_Z, HumanController, SERVE_PERIOD } from '../src/human';
import { AT_NET, DEPTH_Z, HL, NET_C, SERVICE, halfW } from '../src/sim/court';
import { HUMAN_MOVER, ballCue } from '../src/sim/brain';
import { IDEAL_RELEASE, type Match } from '../src/sim/match';
import { Rng } from '../src/sim/rng';

/** s from a frame of the game to the release of a thumb reacting to it reaching the game: display + touch latency */
export const DEVICE_LAG = 0.045;
import type { MatchEvent, Plan, Player } from '../src/sim/types';

/** How one level of player uses the thumbs, and what shots they look for. */
export interface Thumbs {
  /** s from the opponent's hit to the first push of the stick (mean and spread) */
  react: number;
  reactVar: number;
  /** rad: how far off the circle the first push points (halved every 0.2 s as they correct) */
  angErr: number;
  /** chance of pushing until the player is there (the assist parks him) rather than letting go near the circle */
  hold: number;
  /** m: lets go of the stick this close to the circle */
  letGo: number;
  /** chance of aiming a ball at all (otherwise the automatic reset) */
  aim: number;
  /** s from the opponent's hit until the right thumb is down and dragged */
  press: number;
  /** s: spread of the release around the middle of the golden ring, and its mean error (+ = late) */
  sigma: number;
  bias: number;
  /** px: how far the drag lands from the target they meant */
  aimPx: number;
  /** shot sense, 0 … 1: soft game (drop shots and volleys), attacking high balls, lobs, aiming wide and deep */
  touch: number;
  attack: number;
  lob: number;
  risk: number;
  /** how readily he comes in to the net (behind an approach, a serve; Mover.netRush of his controller) */
  netRush: number;
  /** the attack: chance of flicking a ball marked attackable, and of flicking one at the net that is not (impatience) */
  flick: number;
  rash: number;
  /** m over the tape: the lowest ball he flicks out of impatience (default −0.2; the attack's measure flicks any) */
  rashFloor?: number;
  /** m from the net: the furthest he flicks out of impatience (default AT_NET, the volleying position) */
  rashNear?: number;
  /** px/s: how fast the flick's stroke goes (mean, spread); under the game's FLICK.speed it is no flick, only a drag */
  flickV: number;
  flickVar: number;
  /** the block: chance of tapping when an attack comes at him, the earliest he can (s after the attack) and the tap's
   * timing error around the middle of the golden ring (spread, mean late) */
  block: number;
  blockReact: number;
  blockSigma: number;
  blockBias: number;
  /** an aimed release on the move (a plain power) rather than with the finger still (placed) */
  moving: number;
  /** a ball dug out at full stretch from the back: chance of a down-flick (a slice) */
  slice: number;
  /** the serve: chance of a flat first serve (a flick), and of a kick serve (a still release) on the second */
  flat: number;
  kick: number;
}

/** s from the finger's last move to the lift reaching the page (the pointerup repeats the last position) */
const LIFT_DT = 0.012;
/** px/s: how fast a finger drags the aim (a placing drag, well under a flick) */
const DRAG_V = Number(process.env.DRAG_V ?? 520);

export class ThumbBot {
  readonly input: Input;
  readonly ctl: HumanController;
  private m: Match | null = null;
  private rng: Rng;
  // the ball coming now
  private ball = '';
  private t0 = 0;
  private react = 0;
  private ang = 0;
  private angAt = 0;
  private holdUntil = 0;
  private arrived = -1;
  private wantAim = false;
  private pressAt = 0;
  private relE = 0;
  private pressed = false;
  private released = false;
  /** this ball: what the right thumb does (aim and drag, a flick, a tap to block, nothing) and where the drag goes */
  private act: 'aim' | 'flick' | 'tap' | 'none' | null = null;
  /** the flick's stroke goes down the screen (a down-flick: a slice) */
  private down = false;
  /** the aimed release is on the move (a plain power) */
  private moveRel = false;
  private goal = { dx: 0, dy: 0 };
  private cur = { dx: 0, dy: 0 };
  private strokeV = 0;
  private stroking = false;
  private tapE = 0;
  private wantBlock = false;

  // the serve
  private serveHow: 'flat' | 'slice' | 'kick' = 'slice';
  private serveKey = '';
  private serveAt = -1;
  private serveRel = -1;
  /** counts for the report: balls aimed, left to the automatic shot, flicked (attacks), tapped (blocks) */
  readonly stats = { aimed: 0, auto: 0, flicks: 0, taps: 0, slices: 0 };

  constructor(
    readonly level: Thumbs,
    assist: number,
    seed: number,
    readonly pid = 0,
  ) {
    const el = { addEventListener() {}, clientWidth: 390, setPointerCapture() {} } as unknown as HTMLElement;
    this.input = new Input(el, () => this.m?.t ?? 0);
    this.ctl = new HumanController(this.input);
    this.ctl.mode = 'assist';
    this.ctl.assist = assist;
    this.ctl.pxPerM = 33; // a 390 px wide phone
    // (how readily he comes in: the match reads it off his controller, afterHit)
    (this.ctl as unknown as { mover: typeof HUMAN_MOVER }).mover = { ...HUMAN_MOVER, netRush: level.netRush };
    this.rng = new Rng(seed);
  }

  attach(m: Match) {
    this.m = m;
  }

  private gauss() {
    return this.rng.gauss();
  }

  private stick(wx: number, wz: number) {
    // HumanController.steer: world = stick × viewSide
    this.input.stickX = wx * this.ctl.viewSide;
    this.input.stickY = wz * this.ctl.viewSide;
  }

  /** The finger lifts: as in the browser, the pointerup's own sample (the last position, a moment later) comes first. */
  private lift() {
    if (!this.input.pressing) return;
    const t = (this.m?.t ?? 0) + LIFT_DT;
    this.input.aimMove(this.input.dx, this.input.dy, t);
    this.input.aimUp(t);
  }

  private goTo(p: Player, x: number, z: number, tol: number) {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < tol) return this.stick(0, 0);
    const k = Math.min(1, d / 0.5);
    this.stick((dx / d) * k, (dz / d) * k);
  }

  /** Once a frame, before the match steps. */
  tick(m: Match) {
    const p = m.players[this.pid];
    if (m.phase === 'serve') return this.serveTick(m, p);
    const r = m.rally;
    if (m.phase !== 'rally' || !r || !r.last) {
      this.stick(0, 0);
      return;
    }
    if (r.last.team === p.team) {
      // our ball is on its way: finger off, walk to the waiting spot
      this.lift();
      this.ball = '';
      const w = this.waitSpot(m, p);
      this.goTo(p, w.x, w.z, 0.3);
      return;
    }
    const key = `${m.stats.rallies}:${r.shots}`;
    if (key !== this.ball) this.newBall(m, key);
    const el = m.t - this.t0;
    const tg = m.targetFor(p.id);
    const mine = m.owner === p.id || !!tg;
    // left thumb
    if (el < this.react) this.stick(0, 0);
    else if (tg) this.chase(m, p, tg);
    else this.goTo(p, p.homeX, p.homeZ, 0.3);
    // right thumb: once there is a circle (it shows what ball it is) it decides: block an attack, flick a ball that
    // sits up, aim (press and drag) or leave it to the automatic shot
    const L = this.level;
    if (mine && tg && this.act === null) {
      const cue = ballCue(m, p, tg);
      if (cue === 'block' && this.wantBlock) {
        this.act = 'tap';
        this.tapE = IDEAL_RELEASE + this.gauss() * L.blockSigma - L.blockBias;
      } else if (el >= this.pressAt && tg.t - m.t > 0.08) {
        const atNet = Math.abs(tg.fz) < (L.rashNear ?? AT_NET) && m.rally!.shots >= 2;
        const rash = cue !== 'attack' && atNet && tg.by > NET_C + (L.rashFloor ?? -0.2) && this.rng.chance(L.rash);
        this.down = false;
        // a ball dug out at full stretch from the back: a slice now and then (a down-flick)
        const far = Math.hypot(tg.fx - p.x, tg.fz - p.z) > 2.5;
        const dig = !tg.volley && Math.abs(tg.fz) > SERVICE && far && m.rally!.shots >= 2 && this.rng.chance(L.slice);
        if (dig) {
          this.act = 'flick';
          this.down = true;
          this.goal = this.choose(m, p, tg);
          this.strokeV = Math.max(780, L.flickV * 0.9 + this.gauss() * L.flickVar * 0.5);
          this.stats.slices++;
        } else if ((cue === 'attack' && this.rng.chance(L.flick)) || rash) {
          this.act = 'flick';
          // aimed now and then (the open side), otherwise the thumb stays put (at the body)
          this.goal = this.rng.chance(L.risk * 0.5) ? this.choose(m, p, tg) : { dx: this.gauss() * 3, dy: this.gauss() * 3 };
          this.strokeV = Math.max(150, L.flickV + this.gauss() * L.flickVar);
        } else if (this.wantAim) {
          this.act = 'aim';
          this.goal = this.choose(m, p, tg);
        } else this.act = 'none';
        if (this.act !== 'none') {
          this.input.aimDown(m.t);
          this.cur = { dx: 0, dy: 0 };
          this.pressed = true;
          if (this.act === 'aim') this.stats.aimed++;
        }
      }
    }
    const hp = m.humanPlan();
    const inReach = !!hp && hp.p.id === p.id && hp.plan.reach;
    const T = inReach ? hp!.plan.t : tg ? tg.t : null;
    if (this.act === 'tap' && !this.released && T !== null) {
      // the tap: down a few frames before it lifts, no sooner than he reacts to the attack
      const due = T - m.t <= this.tapE - DEVICE_LAG;
      if (!this.pressed && el >= L.blockReact - 0.07 && T - m.t <= this.tapE - DEVICE_LAG + 0.07) {
        this.input.aimDown(m.t);
        this.pressed = true;
      } else if (this.pressed && el >= L.blockReact && due) {
        this.released = true;
        this.stats.taps++;
        this.lift();
      }
    }
    if (this.pressed && !this.released && (this.act === 'aim' || this.act === 'flick')) {
      // the drag goes where it is going at a finger's pace; the flick's stroke starts a stroke's length before the lift
      const due = inReach && T !== null && T - m.t <= this.relE - DEVICE_LAG;
      if (this.act === 'flick' && T !== null && !this.stroking && T - m.t <= this.relE - DEVICE_LAG + 0.075) this.stroking = true;
      // an aimed release on the move: the finger drifts on (deeper) over the last moments (a plain power)
      const drift = this.act === 'aim' && this.moveRel && T !== null && T - m.t <= this.relE - DEVICE_LAG + 0.1;
      if (this.stroking) this.cur.dy += (this.down ? 1 : -1) * (this.strokeV / 60);
      else if (drift) this.cur.dy -= 260 / 60;
      else {
        const ex = this.goal.dx - this.cur.dx;
        const ey = this.goal.dy - this.cur.dy;
        const d = Math.hypot(ex, ey);
        const st = DRAG_V / 60;
        if (d <= st) this.cur = { ...this.goal };
        else this.cur = { dx: this.cur.dx + (ex / d) * st, dy: this.cur.dy + (ey / d) * st };
      }
      this.input.aimMove(this.cur.dx, this.cur.dy, m.t);
      if (due) {
        this.released = true;
        if (this.act === 'flick') this.stats.flicks++;
        this.lift();
      }
    }
  }

  /** The match's events of the last frame. */
  events(evs: MatchEvent[]) {
    for (const e of evs) {
      if (e.type === 'point') {
        this.input.clear();
        this.stick(0, 0);
        this.ball = '';
      }
      if (e.type === 'hit' && e.pid === this.pid && e.kind !== 'serve' && e.timing === 'auto') this.stats.auto++;
      // a new serve (the next point, a second serve after a fault, the same serve after a let): a new routine
      if (e.type === 'serveSetup') this.serveKey = '';
    }
  }

  private newBall(m: Match, key: string) {
    const L = this.level;
    this.ball = key;
    this.t0 = m.rally?.last?.lastHit?.t ?? m.t;
    this.react = Math.max(0.15, L.react + this.gauss() * L.reactVar);
    this.ang = this.gauss() * L.angErr;
    this.angAt = this.t0 + this.react;
    this.arrived = -1;
    // keeps pushing a while after getting there (or until the contact)
    this.holdUntil = this.rng.chance(L.hold) ? (this.rng.chance(0.35) ? Infinity : 0.1 + this.rng.next() * 0.35) : -1;
    this.wantAim = this.rng.chance(L.aim);
    this.pressAt = L.press + Math.abs(this.gauss()) * 0.06;
    this.relE = IDEAL_RELEASE + this.gauss() * L.sigma - L.bias;
    this.pressed = false;
    this.released = false;
    this.act = null;
    this.stroking = false;
    this.down = false;
    this.moveRel = this.rng.chance(L.moving);
    this.wantBlock = this.rng.chance(L.block);
    this.lift();
  }

  private chase(m: Match, p: Player, tg: Plan) {
    const dx = tg.fx - p.x;
    const dz = tg.fz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15 && this.arrived < 0) this.arrived = m.t;
    if (m.t - this.angAt > 0.2) {
      this.ang *= 0.5;
      this.angAt = m.t;
    }
    const push = this.holdUntil >= 0 ? this.arrived < 0 || m.t - this.arrived < this.holdUntil : d > this.level.letGo;
    if (!push) return this.stick(0, 0);
    const a = Math.atan2(dz, dx) + this.ang;
    this.stick(Math.cos(a), Math.sin(a));
  }

  /**
   * Where he waits while his side's ball is on the other side: across, the middle of the reply's angles (singles) or
   * his half (doubles) (Match.cover); in depth, where the match sent him after his shot (afterHit, by his netRush): back
   * behind the baseline, or up at the net behind an approach or a serve.
   */
  private waitSpot(_m: Match, p: Player): { x: number; z: number } {
    const z = p.depth === 2 ? p.side * DEPTH_Z[2] : p.homeZ;
    return { x: p.homeX, z };
  }

  /**
   * The target a person picks for this ball, from what is on screen: where the opponents stand, whether he is up at
   * the net and whether the ball comes high. Turned into a drag through the game's own mapping (HumanController.aim).
   */
  private choose(m: Match, p: Player, tg: Plan): { dx: number; dy: number } {
    const L = this.level;
    const rng = this.rng;
    const r = m.rally!;
    const opps = m.players.filter((o) => o.team !== p.team);
    const opp = opps[rng.chance(0.5) ? 0 : opps.length - 1];
    const oppNet = opps.some((o) => Math.abs(o.z) < AT_NET + 0.8);
    const meNet = Math.abs(tg.fz) < AT_NET;
    const high = tg.overhead || tg.by > NET_C + 0.3;
    const hw = halfW();
    const open = () => -Math.sign(opp.x || rng.next() - 0.5) * (1.6 + L.risk * 2.2 + rng.next() * 0.6);
    const cross = () => -(Math.sign(tg.bx) || 1) * (1.2 + L.risk * 2 + rng.next() * 0.8);
    const feet = () => opp.x + (rng.next() - 0.5) * 0.8;
    const deep = () => HL - 1.6 - rng.next() * 1.8 + L.risk * 0.6;
    let x: number;
    let d: number;
    let lob = false;
    if (r.shots === 1) {
      // the return: deep, cross-court or down the middle (a lob over a net player now and then in doubles)
      if (m.doubles && rng.chance(L.lob * 0.2)) {
        lob = true;
        x = (rng.next() - 0.5) * 2;
        d = 0;
      } else {
        x = rng.chance(0.5) ? cross() : (rng.next() - 0.5) * 2;
        d = deep() - 0.6;
      }
    } else if (tg.overhead) {
      // over the head: a smash deep to the open court or the middle (the flick is the hard one, see tick)
      x = rng.chance(0.6) ? open() : (rng.next() - 0.5) * 2;
      d = deep();
    } else if (high && meNet && rng.chance(L.attack)) {
      // a ball up at the net: the open side, short and angled or deep
      x = open();
      d = oppNet ? Math.min(HL - 1, Math.abs(opp.z) + 1 + rng.next() * 2) : rng.chance(0.4) ? 4 + rng.next() * 1.5 : deep();
    } else if (meNet) {
      // at the net: deep to the corners, now and then a drop volley
      if (rng.chance(L.touch * 0.25)) {
        x = open();
        d = 2.2 + rng.next() * 1.2;
      } else {
        x = rng.chance(0.5) ? open() : feet();
        d = oppNet ? Math.max(5, Math.abs(opp.z) + 1) : deep();
      }
    } else if (oppNet) {
      // from the back against a player at the net: a lob, a ball at his feet, or a passing shot
      const u = rng.next();
      if (u < L.lob * 0.7) {
        lob = true;
        x = open() * 0.5;
        d = 0;
      } else if (u < L.lob * 0.7 + L.touch * 0.4) {
        x = feet();
        d = Math.max(4, Math.abs(opp.z) + 1);
      } else {
        x = Math.sign(open()) * (hw - 0.6 - (1 - L.risk) * 0.6);
        d = deep();
      }
    } else if (Math.abs(tg.fz) < HL - 1.6 && tg.by > 0.6 && rng.chance(L.attack * 0.7)) {
      // a short ball: an approach (or a winner) deep into the open court
      x = open();
      d = deep();
    } else if (rng.chance(L.touch * 0.06)) {
      // a drop shot
      x = (rng.next() - 0.5) * 3;
      d = 2.4 + rng.next() * 1.2;
    } else {
      // the rally: deep, cross-court or to the open court
      x = rng.chance(0.55) ? cross() : rng.chance(0.5) ? open() : (rng.next() - 0.5) * 2;
      d = deep();
    }
    const px = this.ctl.pxPerM;
    // a lob: dragged past the baseline, further for a deeper (riskier) one; any other shot keeps a margin from the
    // lines that grows with how far off their drag tends to land
    const margin = L.aimPx / px;
    if (lob) d = HL + AIM_LOB + 0.3 + Math.min(1, 0.2 + rng.next() * 0.8 * (0.4 + L.risk)) * 1.6;
    else {
      d = Math.min(d, HL - 0.8 - margin / AIM_Z);
      x = Math.max(-(hw - 0.4 - margin), Math.min(hw - 0.4 - margin, x));
    }
    return { dx: x * p.side * px + this.gauss() * L.aimPx, dy: (AIM_D0 - d) * px * AIM_Z + this.gauss() * L.aimPx };
  }

  private serveTick(m: Match, p: Player) {
    this.stick(0, 0);
    if (m.server() !== p) return;
    const key = `${m.stats.rallies}`;
    if (key !== this.serveKey) {
      this.serveKey = key;
      this.ctl.serveSince = m.t;
      this.serveAt = m.t + 0.3 + this.rng.next() * 0.6;
      this.serveRel = -1;
    }
    const L = this.level;
    if (!this.input.pressing && this.serveRel < 0 && m.t >= this.serveAt) {
      // drag a little deeper than the middle of the box (towards the service line), to the T, the body or wide, a few
      // px off
      this.input.aimDown(m.t);
      const across = (this.rng.next() - 0.5) * 2.4 * this.ctl.pxPerM;
      // (the arc preview shows where it lands: a second serve is kept further inside the line)
      const inside = (m.serveNum === 2 ? 0.5 : 0.1) + this.rng.next() * 0.6;
      this.input.aimMove(across + this.gauss() * L.aimPx * 0.5, inside * this.ctl.pxPerM * AIM_Z + this.gauss() * L.aimPx * 0.3, m.t);
      // let go when the pulsing ring is at its smallest, with the timing error: a flick (flat), on the move (sliced)
      // or still (kick)
      const k = Math.ceil((m.t + 0.35) / SERVE_PERIOD);
      this.serveRel = k * SERVE_PERIOD + this.gauss() * L.sigma + L.bias;
      const second = m.serveNum === 2;
      this.serveHow = !second && this.rng.chance(L.flat) ? 'flat' : second && this.rng.chance(L.kick) ? 'kick' : 'slice';
    }
    if (this.input.pressing && this.serveRel >= 0) {
      // the stroke of a flat serve (a flick up), the drift of a sliced one (a plain release)
      const left = this.serveRel + DEVICE_LAG - m.t;
      if (this.serveHow === 'flat' && left < 0.075) this.input.aimMove(this.input.dx, this.input.dy - L.flickV / 60, m.t);
      else if (this.serveHow === 'slice' && left < 0.1) this.input.aimMove(this.input.dx, this.input.dy - 260 / 60, m.t);
    }
    if (this.input.pressing && this.serveRel >= 0 && m.t >= this.serveRel + DEVICE_LAG) this.lift();
  }
}
