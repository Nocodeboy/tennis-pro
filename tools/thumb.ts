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
//  · A phone in between: what the thumbs react to is on screen a little late and the lift reaches the game a little
//    after it happens (DEVICE_LAG); the game dates releases back by its own estimate of that (Input LAG).

const g = globalThis as unknown as { window?: unknown };
g.window ??= { addEventListener() {} };

import { Input } from '../src/input';
import { HumanController, SERVE_PERIOD } from '../src/human';
import { AT_NET, DEPTH_Z, HL, NET_C, W } from '../src/sim/court';
import { ballCue } from '../src/sim/brain';
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
  /** shot sense, 0 … 1: soft game (dinks, drops), attacking high balls, lobs, aiming wide and deep */
  touch: number;
  attack: number;
  lob: number;
  risk: number;
  /** chance of moving up to the kitchen line after each of his own shots (from the return on) */
  netRush: number;
  /** the attack: chance of flicking a ball marked attackable, and of flicking one at the net that is not (impatience) */
  flick: number;
  rash: number;
  /** m over the tape: the lowest ball he flicks out of impatience (default −0.2; the attack's measure flicks any) */
  rashFloor?: number;
  /** m from the net: the furthest he flicks out of impatience (default 3.6, the kitchen line area) */
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
}

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
  private goal = { dx: 0, dy: 0 };
  private cur = { dx: 0, dy: 0 };
  private strokeV = 0;
  private stroking = false;
  private tapE = 0;
  private wantBlock = false;
  // the rally: has he moved up to the kitchen line (singles)
  private up = false;
  private lastShots = -1;
  // the serve
  private serveKey = '';
  private serveAt = -1;
  private serveRel = -1;
  /** counts for the report: balls aimed, left to the automatic shot, flicked (attacks), tapped (blocks) */
  readonly stats = { aimed: 0, auto: 0, flicks: 0, taps: 0 };

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

  private lift() {
    if (this.input.pressing) this.input.aimUp(this.m?.t ?? 0);
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
    const mine = !m.doubles || m.owner === p.id || !!tg;
    // left thumb
    if (el < this.react) this.stick(0, 0);
    else if (tg) this.chase(m, p, tg);
    else if (m.doubles) this.goTo(p, p.homeX, p.homeZ, 0.3);
    else this.stick(0, 0);
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
        if ((cue === 'attack' && this.rng.chance(L.flick)) || rash) {
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
      if (this.stroking) this.cur.dy -= this.strokeV / 60;
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
        this.up = false;
        this.lastShots = -1;
      }
      if (e.type === 'hit' && e.pid === this.pid && e.kind !== 'serve' && e.timing === 'auto') this.stats.auto++;
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

  /** Where he waits while the ball is on the other side: back until his return, then up if he goes up. */
  private waitSpot(m: Match, p: Player): { x: number; z: number } {
    if (m.doubles) return { x: p.homeX, z: p.homeZ };
    const r = m.rally!;
    if (r.shots !== this.lastShots) {
      this.lastShots = r.shots;
      if (r.shots >= 2 && !this.up && this.rng.chance(this.level.netRush)) this.up = true;
    }
    const z = this.up ? DEPTH_Z[2] : DEPTH_Z[0];
    return { x: Math.max(-1.6, Math.min(1.6, p.homeX)), z: p.side * z };
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
    const opp = opps.length > 1 ? opps[rng.chance(0.5) ? 0 : 1] : opps[0];
    const oppNet = opps.length > 1 ? opps.every((o) => Math.abs(o.z) < AT_NET) : Math.abs(opp.z) < AT_NET;
    const meNet = Math.abs(tg.fz) < AT_NET;
    const high = tg.overhead || tg.by > NET_C + 0.2;
    const open = () => -Math.sign(opp.x || rng.next() - 0.5) * (1.1 + L.risk * 1.4 + rng.next() * 0.4);
    const feet = () => opp.x + (rng.next() - 0.5) * 0.7;
    let x: number;
    let d: number;
    let lob = false;
    if (r.shots === 1) {
      // the return: deep
      x = (rng.next() - 0.5) * 2.6;
      d = HL - 0.9 - rng.next() * 1.2 + L.risk * 0.4;
    } else if (high && (tg.overhead || meNet) && rng.chance(tg.overhead ? 0.5 + L.attack * 0.5 : L.attack)) {
      // a ball up at the net: put it away through the body or to the open side (the arc preview shows a flat, fast
      // ball needs a spot behind them)
      x = rng.chance(0.5) ? feet() : open();
      d = oppNet ? Math.min(HL - 0.6, Math.abs(opp.z) + 0.3 + rng.next() * 1.8) : HL - 1.2 - rng.next();
    } else if (meNet && oppNet) {
      const u = rng.next();
      if (u < L.touch) {
        x = rng.chance(0.5) ? -opp.x * 0.8 + (rng.next() - 0.5) : (rng.next() - 0.5) * 3;
        d = 0.9 + rng.next();
      } else if (u < L.touch + L.lob * 0.4) {
        lob = true;
        x = open() * 0.5;
        d = 0;
      } else {
        x = feet();
        d = Math.max(DEPTH_Z[2], Math.abs(opp.z) - 0.5);
      }
    } else if (!meNet && oppNet) {
      const u = rng.next();
      if (u < L.lob) {
        lob = true;
        x = open() * 0.5;
        d = 0;
      } else if (u < L.lob + L.touch) {
        x = (rng.next() - 0.5) * 3;
        d = 1.0 + rng.next();
      } else {
        x = rng.chance(0.5) ? feet() : open();
        d = 4 + rng.next() * 2;
      }
    } else if (meNet) {
      // the opponent is back: deep to the open side, now and then a short one
      if (rng.chance(L.touch * 0.3)) {
        x = open() * 0.6;
        d = 1.0 + rng.next() * 0.8;
      } else {
        x = open();
        d = HL - 0.8 - rng.next() * 1.2;
      }
    } else if (r.shots === 2 && rng.chance(L.touch * 0.8)) {
      // both back, the third shot: a drop
      x = (rng.next() - 0.5) * 3;
      d = 1.0 + rng.next();
    } else {
      x = rng.chance(0.5) ? open() : (rng.next() - 0.5) * 2;
      d = HL - 0.8 - rng.next() * 1.4;
    }
    const px = this.ctl.pxPerM;
    // a lob: dragged past the baseline band, further for a deeper (riskier) one; any other shot keeps a margin from
    // the lines that grows with how far off their drag tends to land
    const margin = L.aimPx / px;
    if (lob) d = HL + 0.6 + Math.min(1, 0.2 + rng.next() * 0.8 * (0.4 + L.risk)) * 1.75;
    else {
      d = Math.min(d, HL - 0.5 - margin * 1.14);
      x = Math.max(-(W / 2 - 0.3 - margin), Math.min(W / 2 - 0.3 - margin, x));
    }
    return { dx: x * p.side * px + this.gauss() * L.aimPx, dy: (4.3 - d) * px * 0.88 + this.gauss() * L.aimPx };
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
      // drag a little deeper than the middle of the box, a few px off
      this.input.aimDown(m.t);
      this.input.aimMove(this.gauss() * L.aimPx * 0.6, -(0.3 + this.rng.next() * 0.6) * this.ctl.pxPerM * 0.88 + this.gauss() * L.aimPx, m.t);
      // let go when the pulsing ring is at its smallest, with the timing error
      const k = Math.ceil((m.t + 0.35) / SERVE_PERIOD);
      this.serveRel = k * SERVE_PERIOD + this.gauss() * L.sigma + L.bias;
    }
    if (this.input.pressing && this.serveRel >= 0 && m.t >= this.serveRel + DEVICE_LAG) this.lift();
  }
}
