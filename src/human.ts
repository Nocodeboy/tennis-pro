// The human's side: turns the drag into a target and a shot type, and the release time into contact quality.

import { ATTACK, BLOCK, HUMAN_ATTRS, HUMAN_MOVER, Q_AIMED, Q_AUTO, Q_FLOOR_HUMAN, Q_PERFECT, SHANK, TENNIS, attackRisk, attackTarget, attrQ, autoShot, ballCue, blockShot, cuedBlock, difficulty, humanSkill, kindForAim, LOB, lobClear, lobShape, popOf, powerShank, shankOf } from './sim/brain';
import type { Attributes } from './sim/attributes';
import { HL, NET_C, SERVICE, halfW, inHalf, inServiceCourt } from './sim/court';
import { IDEAL_RELEASE, Match, PERFECT_WINDOW, type Controller } from './sim/match';
import type { Plan, Player, ShotKind, ShotSpec, Timing } from './sim/types';
import { FLICK, strokeDeg, type Input, type Release } from './input';
import type { Vec3 } from './sim/ball';

export interface AimResult {
  x: number;
  z: number;
  kind: ShotKind;
  clear: number;
  pace?: number;
  /** the shot's own spin, when it has one (a slice, a flat attack) */
  spin?: number;
  ok: boolean;
}

/**
 * The serve by the gesture (HumanController.serve): a flick (power `flat` or more) is the big flat serve, low over the
 * net and fast; a plain release a sliced one; a placed release (still finger, power under `kick`) the kick serve, the
 * safe second serve (high over the net, heavy topspin), which is also what a second serve is unless it is flicked. The pace and heights are the CPU's (brain.ts, TENNIS.serve),
 * with the card's saq. The flat one is a gamble (`riskFlat` off the contact), the kick a safe ball (`safeKick` on it).
 */
export const SERVE_POWER = { min: 0.4, max: 1.0, flat: 0.72, kick: 0.4, riskFlat: 0.06, safeKick: 0.06 };

/** The serve's pulse: the ring is smallest (best contact) once a second. */
export const SERVE_PERIOD = 1.1;
export function servePulse(t: number): number {
  return Math.abs(Math.sin((Math.PI * t) / SERVE_PERIOD));
}
export function serveQuality(t: number): { q: number; timing: Timing } {
  const s = servePulse(t);
  if (s < 0.26) return { q: 1, timing: 'perfect' };
  if (s < 0.6) return { q: 0.9 - (s - 0.26) * 0.6, timing: 'good' };
  return { q: 0.72 - (s - 0.6) * 0.5, timing: 'early' };
}

/**
 * The drag → target mapping: a press that does not move aims at AIM_D0 m from the net (deep, 2.9 m inside the
 * baseline), down the middle; a drag of pxPerM px moves the target 1 m across, pxPerM × AIM_Z px 1 m deeper (screen up
 * = deeper). Past HL + AIM_LOB the target is past the baseline: a lob (lobShape, the further the deeper).
 */
export const AIM_D0 = 9.0;
export const AIM_Z = 0.7;
export const AIM_LOB = 0.4;

/** manual swing: a release this long before the contact no longer counts (press again) */
export const STALE = 0.75;

/**
 * The automatic reset (no aim), tuned so it gets the ball back but does not run a rally by itself:
 *  · off a hard ball it is a reflex block: from `reflexFrom` m/s of incoming pace (along the court) its contact gets
 *    rougher, up to `reflex` less quality at `reflexTo` m/s (a smash). An aimed block is not affected (a chosen shot);
 *  · it is the same ball every time (soft, to the middle): from the third automatic shot in a row the other side sees
 *    it coming, each one carries `read` more pressure (pop: it sits up for them), and the CPU attacks it more often
 *    (brain.ts, AUTO_PUNISH). A ball over the head at the net it puts away (brain.ts, autoShot).
 */
export const AUTO = { reflexFrom: 11, reflexTo: 18, reflex: 0.05, read: 0.1 };

/**
 * How the human swings:
 *  · assist (default): the player swings by himself once the ball is in reach (balls going out are left alone). The
 *    thumb aims; letting go in the golden window makes it perfect.
 *  · manual: nothing happens unless you let go in time (or hold through the contact).
 */
export type SwingMode = 'assist' | 'manual';

/** The across bend (m, world x from the hitter's view) of a flick's stroke: ATTACK.bend for a stroke 45° off straight up. */
function bendOf(g: Partial<Release> | null, p: Player): number {
  const fx = g?.fx ?? 0;
  const fy = g?.fy ?? -1;
  return Math.max(-1, Math.min(1, fx / Math.max(0.25, -fy))) * ATTACK.bend * p.side;
}

export class HumanController implements Controller {
  readonly mover = HUMAN_MOVER;
  mode: SwingMode = 'assist';
  /** help into position: 0 none · 1 a little · 2 a lot */
  assist = 1;
  /** between shots, with the thumb off the stick, jog back to a good spot by himself (Settings; off by default) */
  recover = false;
  /** px of drag per metre on the court (set from the screen size) */
  pxPerM = 34;
  /** feedback for the HUD: the last timing and shot */
  last: { timing: Timing; kind: ShotKind } | null = null;
  /** releases before this sim time do not serve (set when the server gets the ball) */
  serveSince = 0;

  /** the camera sits behind this side: screen up = towards the far end */
  viewSide: 1 | -1 = 1;

  /**
   * The player's card (attributes 0 … 99): it acts on this controller (brain.ts, humanSkill): his power ceiling, the
   * quality of his contacts and of each kind of shot (attrQ), his serve and how high he reaches over the head. His top
   * speed is the match's (main.ts sets it from HUMAN_SPEED, i.e. this card).
   */
  attrs: Attributes = HUMAN_ATTRS;

  /** the human is serving right now (the keyboard aim steps differ) */
  private serving = false;

  constructor(private input: Input) {
    input.keyAim = (ix, iy) => this.keyDrag(ix, iy);
  }

  /** the card (Controller.card) */
  get card(): Attributes {
    return this.attrs;
  }
  /** the highest ball he meets over the head (Controller.reachH, from the card's red) */
  get reachH(): number {
    return humanSkill(this.attrs).reachH;
  }
  /** a release's power on this player: the gesture's (0 … 1) up to his card's ceiling (pot) */
  private powerOf(r: Partial<Release> | null): number {
    const raw = r?.power ?? 0.5;
    return Math.max(0, Math.min(1.1, raw <= 0.5 ? raw : 0.5 + (raw - 0.5) * humanSkill(this.attrs).powerCap));
  }

  /** Where the stick (or the keys) points, turned into world space. */
  steer(_m: Match, p: Player): { x: number; z: number } {
    const v = this.input.move();
    void p;
    this.serving = false;
    return { x: v.x * this.viewSide, z: v.y * this.viewSide };
  }

  /**
   * Keyboard aim (Space held, the arrows): the drag that puts the target `ix` zones across and `iy` zones deeper.
   * Rally: ↓↓ a short drop shot, ↓ a ball around the service line, 0 deep, ↑ very deep, ↑↑ a lob, ↑↑↑ a deep lob;
   * across 1.8 m a step. Serve: around the middle of the box, 1.2 m a step across (the T, the body, wide) and 0.8 m
   * deeper or shorter.
   */
  keyDrag(ix: number, iy: number): { dx: number; dy: number } {
    const px = this.pxPerM;
    if (this.serving) return { dx: ix * 1.2 * px, dy: -Math.max(-1, Math.min(1, iy)) * 0.8 * px * AIM_Z };
    const depth: Record<number, number> = { [-2]: 2.8, [-1]: 6.0, 0: AIM_D0, 1: HL - 1.4, 2: HL + 0.8, 3: HL + 2.2 };
    const d = depth[Math.max(-2, Math.min(3, iy))];
    return { dx: Math.max(-2, Math.min(2, ix)) * 1.8 * px, dy: (AIM_D0 - d) * px * AIM_Z };
  }

  /** Releases older than this do not count for the coming ball. */
  private since(m: Match, plan: Plan): number {
    const opp = m.rally?.last?.lastHit?.t ?? -Infinity;
    return this.mode === 'assist' ? opp : Math.max(opp, plan.t - STALE);
  }

  /**
   * Assisted: swings at anything in reach, except a ball going out (holding the aim plays it anyway). Manual: a release
   * that is still fresh, or a press held through the contact.
   */
  swing(m: Match, _p: Player, plan: Plan): boolean {
    if (this.mode === 'assist') return !plan.oops && (!plan.out || this.input.active);
    const r = this.input.peek();
    return (!!r && r.t >= this.since(m, plan)) || this.input.active;
  }

  /**
   * Doubles: a ball that is the partner's is left to him, unless you hold the aim (assisted), or press or have just
   * released it (manual): then you take it if it is in reach (a poach).
   */
  poach(m: Match, _p: Player): boolean {
    if (this.input.active) return true;
    if (this.mode !== 'manual') return false;
    const r = this.input.peek();
    return !!r && r.t >= (m.rally?.last?.lastHit?.t ?? Infinity);
  }

  /**
   * Where a drag of (dx, dy) px sends the ball right now. `attack` (a flick, F, the right button): the attack, into
   * the open court unless the drag was aimed, bent `bend` m across by the stroke (brain.ts, ATTACK). `opts.slice` (a
   * down-flick, Shift+F): a slice.
   */
  aim(m: Match, p: Player, plan: Plan | null, dx: number, dy: number, attack = false, bend = 0, opts: { power?: number; slice?: boolean } = {}): AimResult {
    const gx = 1 / this.pxPerM;
    const gz = 1 / (this.pxPerM * AIM_Z);
    const serving = m.phase === 'serve';
    let x0 = 0;
    let d0 = AIM_D0;
    let half: 1 | -1 = 1;
    if (serving) {
      // the serve: from the middle of the diagonal box (the bot and the keys step from there)
      half = (-m.serveX(p.team)) as 1 | -1;
      x0 = half * 2.0 * p.side; // in the server's screen frame
      d0 = SERVICE - 1.0;
    }
    let sx = x0 + dx * gx;
    let d = d0 - dy * gz;
    sx = Math.max(-halfW() - 1.2, Math.min(halfW() + 1.2, sx));
    d = Math.max(0.6, Math.min(HL + 2.8, d));
    const tx = sx * p.side;
    const lob = !serving && d > HL + AIM_LOB;
    // the lob: the further past the baseline, the deeper and lower (see lobShape)
    const ls = lob ? lobShape((d - (HL + AIM_LOB)) / 2.2) : null;
    const tz = -p.side * (ls ? ls.depth : d);
    if (serving) {
      const ok = inServiceCourt(tx, tz, -p.side as 1 | -1, half);
      return { x: tx, z: tz, kind: 'serve', clear: 0.3, ok };
    }
    const pl = plan ?? { t: m.t, bx: p.x, by: 0.9, bz: p.z, fx: p.x, fz: p.z, volley: false, overhead: false, hand: 1, reach: true, oops: false };
    const aimed = Math.hypot(dx, dy) > ATTACK.aimed;
    if (attack && m.rally) {
      const k = kindForAim(m, p, pl, d, false, true, bend, opts);
      const at = attackTarget(m, p, pl, aimed ? { x: tx, z: -p.side * Math.min(d, HL - 0.5) } : null, bend);
      return { x: at.tx, z: at.tz, kind: k.kind, clear: k.clear, pace: k.pace, spin: k.spin, ok: inHalf(at.tx, at.tz, -p.side as 1 | -1) };
    }
    const k = kindForAim(m, p, pl, d, lob, false, 0, opts);
    // the lob: over the player at the net by a margin (brain.ts, lobClear; the shape's height when nobody is up there)
    const clear = ls && k.kind === 'lob' ? lobClear(m, p, this.contactPoint(m, p, plan), tx, tz, LOB.human, ls.clear) : ls ? ls.clear : k.clear;
    return { x: tx, z: tz, kind: k.kind, clear, pace: k.pace, spin: k.spin, ok: inHalf(tx, tz, -p.side as 1 | -1) };
  }

  /**
   * A release's attack (an up-flick: the aim before the stroke and the bend of its angle, world x from the hitter's
   * view) or a down-flick (a slice, aimed where the finger was before the stroke).
   */
  private attackAim(m: Match, p: Player, plan: Plan, r: Partial<Release> | null, power: number): AimResult {
    const ax = r ? r.ax ?? r.dx ?? this.input.dx : this.input.dx;
    const ay = r ? r.ay ?? r.dy ?? this.input.dy : this.input.dy;
    const down = r?.gesture === 'down';
    return this.aim(m, p, plan, ax, ay, !down, down ? 0 : bendOf(r, p), { power, slice: down });
  }

  /**
   * Is this gesture an attack on this ball? An up-flick within FLICK.cone of straight up, or over the head within
   * FLICK.wideCone; a flick bent further on any other ball is a hard shot aimed where the finger was before the stroke.
   */
  private isAttack(g: Partial<Release> | null, plan: Plan): boolean {
    return g?.gesture === 'attack' && (plan.overhead || strokeDeg(g) <= FLICK.cone);
  }

  /**
   * For the HUD (and the bots): what the coming ball asks of the human's player `p` right now: 'attack' (it sits up:
   * flick it), 'block' (an attack at him at the net: tap in the golden window) or null. Read from the circle, or from
   * the contact in reach. See brain.ts, ballCue.
   */
  cue(m: Match, p: Player): 'attack' | 'block' | null {
    return ballCue(m, p, m.targetFor(p.id) ?? p.plan);
  }

  /** The point the arc preview starts from. */
  contactPoint(m: Match, p: Player, plan: Plan | null): Vec3 {
    if (m.phase === 'serve') return Match.serveContact(p);
    if (plan) return { x: plan.bx, y: plan.by, z: plan.bz };
    return { x: p.x + 0.4 * p.side, y: 0.9, z: p.z - p.side * 0.3 };
  }

  serve(m: Match, p: Player): ShotSpec | null {
    this.serving = true;
    const r = this.input.take(this.serveSince);
    if (!r) return null;
    // (a flick on the serve: the aim before the stroke, so it does not sail long)
    const a = r.gesture === 'attack' ? this.aim(m, p, null, r.ax ?? r.dx, r.ay ?? r.dy) : this.aim(m, p, null, r.dx, r.dy);
    const { q, timing } = serveQuality(r.t);
    this.last = { timing, kind: 'serve' };
    const power = Math.max(SERVE_POWER.min, Math.min(SERVE_POWER.max, this.powerOf(r)));
    // the gesture's serve: flat (a flick), sliced (a plain release) or kick (a placed one), as the CPU's (TENNIS.serve)
    const S = TENNIS.serve;
    const sv = humanSkill(this.attrs).serve;
    // (a second serve is a kick unless it is flicked: the safe one is the default when a fault costs the point)
    const flat = power >= SERVE_POWER.flat;
    const kick = power < SERVE_POWER.kick || (m.serveNum === 2 && !flat);
    const pace = kick ? S.pace2 - sv * 0.08 : flat ? S.paceFlat - sv * S.paceSaq : S.paceSlice - sv * S.paceSaq * 0.8;
    const clear = (kick ? S.clear2 + 0.15 : flat ? S.clearFlat + 0.06 : S.clearSlice + 0.08) * (timing === 'perfect' ? 0.9 : 1);
    const spin = kick ? S.spin2 : flat ? S.spinFlat : S.spinSlice;
    const qq = q + humanSkill(this.attrs).q + attrQ(this.attrs, 'serve', null) - (flat ? SERVE_POWER.riskFlat : 0) + (kick ? SERVE_POWER.safeKick : 0);
    return { kind: 'serve', tx: a.x, tz: a.z, clear, pace, spin, q: Math.max(Q_FLOOR_HUMAN, Math.min(1, qq)), timing, power };
  }

  hit(m: Match, p: Player, plan: Plan): ShotSpec {
    // releases only count from the moment the opponent struck the ball (manual: and not long before the contact)
    const r = this.input.take(this.since(m, plan));
    const holding = !r && this.input.active;
    // a press still down: the gesture it was becoming (a flick's stroke: an attack; a young still press: a late tap)
    const held = holding ? this.input.gestureNow() : null;
    if (holding) this.input.spend();
    const s = plan.stretch ?? 0;
    // reaching for it at the end of a lunge, or a ball rushed at you, costs a bit of control
    const diff = difficulty(m, p, plan);
    const penalty = s * s * 0.22 + diff * 0.5;
    // the card: his control on every contact, and the shot's own attribute (attrQ) once the shot is known
    const hs = humanSkill(this.attrs);
    let spec: ShotSpec;
    if (!r && !holding && this.mode === 'assist') {
      // No aim: a safe reset of its own (never an attack at the opponent), a plain contact; aiming beats it. Off a hard
      // ball (a smash, a speed-up, a drive) it is a reflex block, the harder the ball the rougher; and from the third
      // one in a row it sits up more (the other side sees it coming). See AUTO.
      const auto = autoShot(m, p, plan);
      const v = m.ballVel();
      const pace = v ? Math.hypot(v.x, v.z) : 0;
      const reflex = Math.max(0, Math.min(1, (pace - AUTO.reflexFrom) / (AUTO.reflexTo - AUTO.reflexFrom))) * AUTO.reflex;
      const seen = Math.max(0, this.autoRun(m, true) - 2);
      const raw = Q_AUTO + hs.q + attrQ(this.attrs, auto.kind, plan) - penalty - reflex;
      const shank = shankOf(m, raw, Q_FLOOR_HUMAN, SHANK.human);
      spec = { ...auto, q: Math.max(Q_FLOOR_HUMAN, raw), timing: 'auto', late: 0, pop: popOf(m) + seen * AUTO.read, power: 0.5, ...(shank > 0 ? { shank } : {}) };
    } else if (r?.gesture === 'tap' || held?.gesture === 'tap' || (r?.quiet && cuedBlock(m, p.id))) {
      // A tap: a block, a soft ball low over the net, judged on the golden window (BLOCK); a finger still down at the
      // contact is a late one (a poor block: the window is for the lift, it stays a fair one)
      this.autoRun(m, false);
      spec = this.block(m, p, plan, r ? plan.t - r.t : -Infinity, penalty);
    } else {
      this.autoRun(m, false);
      const g = r ?? held;
      // the stroke: a fast one aims where the finger was before it (the stroke is the swing), a slow one where it lifts
      const dx = r ? r.ax ?? r.dx : this.input.dx;
      const dy = r ? r.ay ?? r.dy : this.input.dy;
      // a flick (or an attack press, F or the right button, released or held through the contact; or a finger in the
      // middle of a flick's stroke when the ball arrives): the attack. A down-flick (Shift+F): a slice
      const attack = this.isAttack(g, plan);
      const down = g?.gesture === 'down';
      // how hard (the speed of the stroke, up to the card's ceiling); a finger held through the contact is a plain one
      const power = this.powerOf(g);
      let tq: { timing: Timing; q: number; late: number };
      if (this.mode === 'assist') {
        const e = r ? plan.t - r.t : null;
        tq = e !== null && Math.abs(e - IDEAL_RELEASE) <= PERFECT_WINDOW ? { timing: 'perfect', q: 1, late: 0 } : { timing: 'good', q: Q_AIMED, late: 0 };
      } else tq = Match.timingOf(r ? plan.t - r.t : null, holding);
      // (a ball dug out at full stretch from the back, low: a slice by itself, the only shot there is)
      const dig = !plan.volley && Math.abs(plan.fz) > SERVICE && s > 0.8 && plan.by < 0.5;
      const a = attack || down ? this.attackAim(m, p, plan, g, power) : this.aim(m, p, plan, dx, dy, false, 0, { power, slice: dig });
      const risk = attackRisk(a.kind, plan) * (attack ? ATTACK.lowRisk : 1);
      const card = hs.q + attrQ(this.attrs, a.kind, plan);
      const raw = tq.q + card - penalty - risk - (attack && tq.timing !== 'perfect' ? ATTACK.rough : 0);
      let q = Math.max(Q_FLOOR_HUMAN, raw);
      let timing = tq.timing;
      if (timing === 'perfect') {
        // a perfect swing stays clean (only half the awkwardness gets to it), except a hard hit from below the tape
        // (never quite clean: capped, and the risk stays); if it still comes out poor, it is not called perfect (the
        // label never contradicts the result)
        const low = plan.by < NET_C;
        const cap = (a.kind === 'drive' || a.kind === 'speedup') && low ? Q_PERFECT - 0.05 : 1;
        q = Math.max(0.2, Math.min(cap, Math.max(low ? 0.78 : 0.88, Q_PERFECT - penalty * 0.5) + card) - risk);
        if (q < Q_AIMED - 0.02) timing = 'good';
      }
      // a long rally weighs on the human too (a perfect swing shrugs off part of it)
      const pop = popOf(m, timing === 'perfect' ? 0.7 : 1);
      spec = { kind: a.kind, tx: a.x, tz: a.z, clear: a.clear, pace: a.pace, q, timing, late: tq.late, pop, power, ...(a.spin !== undefined ? { spin: a.spin } : {}), ...(attack ? { intent: 'attack' as const } : {}) };
      // (a perfect release never shanks) a hard swing at an awkward ball goes off the frame more often (POWER)
      const shank = timing === 'perfect' ? 0 : shankOf(m, raw, Q_FLOOR_HUMAN, SHANK.human) + powerShank(power, diff);
      if (shank > 0) spec.shank = Math.min(SHANK.max, shank);
      // a perfect swing hits it a touch harder (not the soft balls, nor the slice: it is control)
      if (timing === 'perfect' && a.kind !== 'dink' && a.kind !== 'drop' && a.kind !== 'lob' && a.kind !== 'slice') spec.pace = (spec.pace ?? 1) * 0.9;
    }
    this.last = { timing: spec.timing, kind: spec.kind };
    return spec;
  }

  /**
   * The block (a tap released `e` s before the contact): at the net a soft volley, from the back a chip (brain.ts,
   * blockShot). In the
   * golden window it is clean whatever came at him (half the awkwardness gets to it, and a block takes the pace off:
   * Match.launch); within BLOCK.good s of it, a plain block that soaks up part of the awkwardness; further off, a
   * poor one, a little worse than the automatic reset (it was mistimed). The same in the assisted and manual swing.
   */
  private block(m: Match, p: Player, plan: Plan, e: number, penalty: number): ShotSpec {
    const off = e - IDEAL_RELEASE;
    const base = blockShot(m, p, plan);
    let timing: Timing;
    let raw: number;
    let late = 0;
    if (Math.abs(off) <= PERFECT_WINDOW) {
      timing = 'perfect';
      raw = Math.max(BLOCK.perfectMin, Q_PERFECT - penalty * 0.5);
    } else if (Math.abs(off) <= PERFECT_WINDOW + BLOCK.good) {
      timing = 'good';
      raw = Q_AIMED - penalty * BLOCK.soak;
    } else {
      timing = off > 0 ? 'early' : 'late';
      raw = Q_AUTO - penalty - BLOCK.miss;
      late = off > 0 ? -0.4 : 0.35;
    }
    const q = Math.max(Q_FLOOR_HUMAN, Math.min(1, raw + humanSkill(this.attrs).q + attrQ(this.attrs, base.kind, plan)));
    const spec: ShotSpec = { ...base, q, timing, late, pop: popOf(m, timing === 'perfect' ? 0.5 : 1), intent: 'block', power: 0.3 };
    const shank = timing === 'perfect' ? 0 : shankOf(m, raw, Q_FLOOR_HUMAN, SHANK.human);
    if (shank > 0) spec.shank = shank;
    return spec;
  }

  /** this point's run of automatic shots in a row (the rally it belongs to, how many) */
  private run = { rally: -1, n: 0 };
  /** Counts this shot into the run of automatic shots in a row (`auto`: it is one; otherwise the run ends). */
  private autoRun(m: Match, auto: boolean): number {
    if (this.run.rally !== m.stats.rallies) this.run = { rally: m.stats.rallies, n: 0 };
    this.run.n = auto ? this.run.n + 1 : 0;
    return this.run.n;
  }

  /** Will the player swing at this ball (for starting the animation in time)? */
  willSwing(m: Match, p: Player): boolean {
    // (or at the circle's contact while he is still getting there: the view starts the swing in time)
    const plan = p.plan ?? m.targetFor(p.id);
    if (!plan) return false;
    return this.swing(m, p, plan);
  }
}
