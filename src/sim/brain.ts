// The CPU players: how they serve, which shot they pick, how well they read the ball and how cleanly they hit it.
// Each rival is a Skill made from a card (attributes 0 … 99) and a style. Also the human's automatic shot and the aim
// mapping shared with the view. Tennis tactics (docs/tenis/notas-01-simulacion.md):
//
// Singles (singlesShot, TENNIS):
//  · the serve: a first serve flat or sliced to the T, the body or wide; a safer kick second serve, deeper in the box;
//  · the return: deep, cross-court or down the middle; a hard first serve is blocked back; a second serve is attacked;
//    against a server coming in, low at his feet;
//  · the baseline rally: deep cross-court with topspin, a change down the line now and then, into the open court when
//    the other one is pulled wide; a short ball is attacked (an approach and in to the net, a winner, a drop shot);
//    stretched wide or pushed back, a slice or a high ball to buy time;
//  · against a player at the net: the passing shot (down the line or cross-court), the topspin lob, a dipping ball at
//    his feet;
//  · at the net: a ball that sits up is put away; otherwise a deep volley to the open corner or a drop volley;
//  · they wait on the bisector of the reply's angles (Match.cover) and come in behind an approach (placeSingles).
// Doubles (doublesShot): cross-court away from the net player, the lob over him, the ball at the feet of whoever is at
// the net, down the middle between the two; at the net, volleys down the middle or at the feet, a ball that sits up
// put away into the gap.

import { HUMAN_ATTRS, overall, type Attributes } from './attributes';
import { clearOver } from './ball';
import { AT_NET, HL, NET_C, SERVICE, W_S, halfW } from './court';
import type { Controller, Match, Mover } from './match';
import type { Plan, Player, ShotKind, ShotSpec, Timing } from './types';

export { HUMAN_ATTRS };

export interface Skill {
  /** m/s */
  speed: number;
  /** s before they start moving */
  reaction: number;
  /** mean contact quality and its spread */
  q: number;
  qVar: number;
  /** 0 … 1: plays the soft game (drop shots, drop volleys, blocks) when it is the right shot */
  touch: number;
  /** 0 … 1: goes for it: punishes a short ball or a ball that sits up, hits winners */
  attack: number;
  /** 0 … 1: how readily they lob a player at the net */
  lob: number;
  /** how close to the lines they aim (more winners, more errors) */
  risk: number;
  mover: Mover;
  /** seconds of routine before serving */
  serveDelay: number;
  /** how much an awkward ball or a long rally gets to them (1 = fully, 0.5 = half) */
  poise?: number;
  /**
   * m: how far off their first read of a fast or spinning ball can be (spread of the spot the feet head for, before
   * they see where it really goes). 0 = reads everything perfectly.
   */
  read?: number;
  /** the card (attributes 0 … 99) the rest came from (skillFrom): per-shot quality (attrQ) */
  attrs?: Attributes;
  /** 0 … 1: how hard they hit their firm shots (ShotSpec.power; 0.5 neutral). Attacks go a notch harder */
  power?: number;
  /** m: the highest ball they can meet over the head (the jump) */
  reachH?: number;
  /** 0 … 1: the serve (the card's saq): how fast the first serve is and how well it is placed */
  serve?: number;
  /** 0 … 1: how they serve first serves: flat and big (1) or sliced and kicked (0) */
  flat?: number;
  /** 0 … 1: court sense: into the open court rather than back down the middle */
  angle?: number;
  /** 0 … 1: how readily they slice (to defend, to approach, off the backhand) */
  slice?: number;
  /** 0 … 1: how much topspin on their groundstrokes (the rest: flatter, lower over the net, faster) */
  topspin?: number;
  /** m: how far behind the baseline they wait for a first serve (Medvédiev: a long way) */
  retBack?: number;
}

/**
 * A rival's style: what they like to play, independent of how well (the card). skillFrom scales each tendency by the
 * attribute behind it, so two players with the same style but different cards still play differently.
 */
export interface Style {
  touch: number;
  attack: number;
  lob: number;
  risk: number;
  netRush: number;
  serveDelay: number;
  angle?: number;
  slice?: number;
  topspin?: number;
  flat?: number;
  retBack?: number;
}

const lin = (v: number, a: number, b: number, ya: number, yb: number) => ya + ((v - a) / (b - a)) * (yb - ya);
/** a tendency scaled by the attribute behind it: 1 at 81, 0.86 at 56, 1.07 at 93 */
const tend = (v: number) => 0.55 + v / 180;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * THE mapping from a card (attributes 0 … 99) and a style to a CPU player's game. Every number of the card moves
 * something:
 *  · vel → speed (5.0 m/s at 55, 6.2 at 90), most of the lunge (0.45 … 0.9 m) and the time to set up a contact (CARD);
 *  · ref → reaction (0.30 s at 56, 0.22 at 90), the first read of a fast ball (read), how often they volley a ball
 *    going out (misjudge), the return of serve (attrQ) and a little of the poise;
 *  · con → contact quality q (0.78 at 55, 0.93 at 90), its spread qVar and fewer frame errors (CARD.shank);
 *  · pot → power of the firm shots (0.5 at 75, ±0.0045 a point; their pace and weight, CARD);
 *  · saq → the serve: pace of the first serve, its placement and how many go in (AIController.serve, attrQ);
 *  · red → volleys and smashes (attrQ, CARD), the reach over the head (2.95 … 3.1 m) and how readily they come in;
 *  · tq → the soft game: the touch and lob tendencies and the quality of drop shots, slices, lobs and low volleys.
 */
export function skillFrom(a: Attributes, st: Style): Skill {
  const c = (v: number, lo = 0, hi = 1) => clamp(v, lo, hi);
  const reflex = a.con * 0.7 + a.ref * 0.3;
  return {
    speed: lin(a.vel, 55, 90, 5.0, 6.2),
    reaction: c(lin(a.ref, 56, 90, 0.3, 0.22), 0.15, 0.4),
    q: c(lin(a.con, 55, 90, 0.78, 0.93), 0.6, 0.95),
    qVar: c(lin(a.con, 55, 90, 0.14, 0.085), 0.06, 0.18),
    touch: c(st.touch * tend(a.tq)),
    attack: c(st.attack * tend((a.pot + a.con) / 2)),
    lob: c(st.lob * tend(a.tq)),
    // (how close to the lines they aim is their style)
    risk: c(st.risk),
    mover: {
      netRush: c(st.netRush * tend(a.red)),
      misjudge: c(lin(a.ref, 56, 90, 0.25, 0.03), 0.02, 0.3),
      lunge: c(lin(a.vel * 0.7 + a.ref * 0.3, 55.5, 90, 0.45, 0.9), 0.35, 0.95),
      // (court sense keeps them on the bisector; the others lean towards the ball's side)
      shade: c(0.55 - (st.angle ?? 0.6) * 0.5, 0, 0.5),
    },
    serveDelay: st.serveDelay,
    poise: c(lin(reflex, 56, 89, 1, 0.5), 0.45, 1),
    read: c(lin(a.ref, 56, 90, 0.25, 0.12), 0.04, 0.35),
    attrs: a,
    power: c(0.5 + (a.pot - 75) * 0.0045, 0.3, 0.7),
    reachH: 2.75 + a.red * 0.0035,
    serve: c((a.saq - 50) / 45),
    flat: st.flat ?? 0.5,
    angle: st.angle ?? 0.6,
    slice: st.slice ?? 0.3,
    topspin: st.topspin ?? 0.6,
    retBack: st.retBack ?? 0,
  };
}

/**
 * The human's card on his controller (HumanController): `speed` (m/s: 5.7 at vel 76, ±0.025 a point), `powerCap`
 * (how hard his hardest flick is: × 1 at pot 74), `q` (added to his contact qualities: ±0.002 a point of con off 72),
 * `reachH` (m, the highest smash: 3.0 at red 72), `serve` (0 … 1, the card's saq: the pace of his serve). Through attrQ,
 * his serve (saq), volleys and smashes (red), soft game (tq) and return (ref). His reaction is his own thumb.
 */
export function humanSkill(a: Attributes = HUMAN_ATTRS): { speed: number; powerCap: number; q: number; reachH: number; serve: number } {
  return {
    speed: 5.7 + (a.vel - 76) * 0.025,
    powerCap: clamp(0.75 + a.pot * 0.0034, 0.85, 1.1),
    q: (a.con - 72) * 0.002,
    reachH: 2.75 + a.red * 0.0035,
    serve: clamp((a.saq - 50) / 45, 0, 1),
  };
}

/**
 * How a shot's own attribute moves its contact quality, against the player's control (con): `k` per point (about two
 * thirds of con's own slope). The serve rides on saq; volleys and smashes on red (a low volley on red and tq, a reflex
 * volley on red and ref); the return on ref and con; the soft game (drop shots, lobs, slices) on tq; the
 * groundstrokes on con.
 */
export const ATTR_Q = { k: 0.0042 };
export function attrQ(a: Attributes | undefined, kind: ShotKind, plan: Plan | null): number {
  if (!a) return 0;
  return (domainOf(a, kind, plan) - a.con) * ATTR_Q.k;
}
/** the card's attribute behind this shot on this ball (see attrQ) */
function domainOf(a: Attributes, kind: ShotKind, plan: Plan | null): number {
  const net = !!plan?.volley && Math.abs(plan.fz) < AT_NET;
  if (kind === 'serve') return a.saq;
  if (kind === 'smash') return a.red;
  if (kind === 'return') return (a.ref + a.con) / 2;
  if (kind === 'dink' || kind === 'drop' || kind === 'lob') return net ? (a.tq + a.red) / 2 : a.tq;
  if (kind === 'slice') return (a.tq + a.con) / 2;
  if (net && plan) return plan.by > NET_C + 0.3 ? a.red : plan.by < NET_C ? (a.red + a.tq) / 2 : (a.red + a.ref) / 2;
  if (plan?.volley) return (a.red + a.ref) / 2;
  return a.con;
}
/**
 * The card on a CPU contact beyond its quality (AIController.hit), per point over 70 (less under it):
 *  · pot: the firm shots fly sooner (pace × 1 − `pace`·Δ), with no more scatter: the other side is rushed;
 *  · red: volleys and smashes easier (`red` off the awkwardness) and the smash faster (`redPace`);
 *  · tq: a drop shot lower over the tape (× 1 − `tqClear`·Δ: harder to reach), a lob a touch higher;
 *  · vel: time to set up (the planner's spare time, Plan.spare): from `want` s in hand down to none, a contact goes
 *    from `mid` × `setup` easier to (1 − `mid`) × `setup` more awkward; and the defence on the run (`def`);
 *  · con: fewer frame errors (the shank margin, SHANK, × 1 − `shank`·Δ).
 * And the incoming ball: `weight` (weightOf) per point of the hitter's card (at most ± `wMax`), `perfect` more for a
 * shot released on the gold ring (the human's PERFECTO: his placed balls press the CPU).
 */
export const CARD = { pace: 0.0075, red: 0.012, redPace: 0.003, tqClear: 0.008, want: 0.6, mid: 0.45, setup: 0.5, def: 0.008, weight: { pot: 0.014, red: 0.009, tq: 0.008, saq: 0.012 }, wMax: 0.22, perfect: 0.03, shank: 0.01 };
/**
 * The weight of the coming ball (difficulty, for whoever plays it): the card behind it makes it harder to handle, per
 * point over 70 × CARD.weight of that attribute (easier under 70): saq on the serve, pot on the firm shots (a heavy
 * ball), red (and half pot) on a smash or a volley put away, tq on a drop shot, a slice or a lob.
 */
function weightOf(m: Match): number {
  const h = m.rally?.last;
  const k = h?.lastHit?.kind;
  const a = h ? m.controllers[h.id]?.card : undefined;
  if (!h || !k || !a) return 0;
  const w = CARD.weight;
  if (k === 'serve') return (a.saq - 70) * w.saq;
  if (k === 'smash' || k === 'speedup') return (a.red - 70) * w.red + (a.pot - 70) * w.pot * 0.5;
  if (k === 'dink' || k === 'drop' || k === 'lob' || k === 'slice' || k === 'auto') return (a.tq - 70) * w.tq;
  return (a.pot - 70) * w.pot;
}

/**
 * The power model (Match.launch): ShotSpec.power 0 … 1, 0.5 neutral. Harder is faster and flatter, and wilder:
 *  · pace × (1 − (power − 0.5) × `pace`): power 1 flies 18 % sooner, a placed ball (0.3) 7 % later;
 *  · a firm shot's height over the tape × (1 − (power − 0.5) × `clear`): flatter when hit harder (more net), higher
 *    and safer when placed;
 *  · the scatter of the target × (1 + (power − 0.5) × `spread`) above 0.5, × (1 − (0.5 − power) × `calm`) below;
 *  · soft shots (drop shot, drop volley, lob) feel it `soft` as much.
 * The shanks of hard swings at awkward balls are the controllers' (powerShank).
 */
export const POWER = { pace: 0.36, clear: 0.5, spread: 0.9, calm: 0.6, soft: 0.4, shank: 0.3 };
/** the fastest a shot flies, on average over its flight (m/s): a serve of about 215 km/h off the racket */
export const LAUNCH = { vmax: 52 };
/**
 * Extra chance of a shank from swinging hard at an awkward ball: power over 0.6 × how awkward it was (`hard`, the
 * difficulty), × POWER.shank. A clean ball hit hard is fine; a ball dug out of the corner hit hard is not.
 */
export function powerShank(power: number, hard: number): number {
  return Math.max(0, power - 0.6) * clamp(hard / 0.4, 0, 1.5) * POWER.shank;
}

/** Where on the receiver's half a target is: d = distance from the net, x across (inside the lines in play). */
function target(side: number, x: number, d: number) {
  const hw = halfW() - 0.15;
  return { tx: clamp(x, -hw, hw), tz: -side * clamp(d, 0.6, HL - 0.15) };
}

/** Speed (m/s, along the court) of the ball in flight right now. */
function ballSpeed(m: Match): number {
  const v = m.ballVel();
  return v ? Math.hypot(v.x, v.z) : 0;
}

/**
 * The kind of ball the opponent sent, as the receiver sees it when it leaves the racket: hard / soft / lob, at the
 * body, to one side or wide, low or not. The same key over and over is a pattern the AI picks up.
 */
function zoneOf(m: Match, p: Player, plan: Plan): string {
  const k = m.rally?.last?.lastHit?.kind ?? 'serve';
  const cls = k === 'lob' ? 'lob' : SOFT_KINDS.has(k) ? 'soft' : 'hard';
  const dx = (plan.bx - p.x) * p.side;
  const lat = Math.abs(dx) < 0.9 ? 'body' : `${Math.abs(dx) < 2.2 ? 'side' : 'wide'}${dx > 0 ? 'R' : 'L'}`;
  return `${cls}:${lat}:${plan.by < 0.6 ? 'low' : plan.by > 1.4 ? 'high' : 'mid'}`;
}
const SOFT_KINDS = new Set<ShotKind>(['dink', 'drop', 'auto', 'slice']);

/** What a CPU shot is for: it decides where the player goes next in singles (placeSingles) and how it is hit. */
export type Intent = 'serve' | 'return' | 'rally' | 'defend' | 'approach' | 'putaway' | 'pass' | 'lob' | 'drop' | 'volley' | 'block';
type Choice = { shot: Omit<ShotSpec, 'q' | 'timing'>; intent: Intent };

export class AIController implements Controller {
  readonly mover: Mover;
  constructor(readonly skill: Skill) {
    this.mover = skill.mover;
  }
  /** the card (Controller.card) */
  get card(): Attributes | undefined {
    return this.skill.attrs;
  }
  /** the highest ball they meet over the head (the card's red) */
  get reachH(): number {
    return this.skill.reachH ?? 3.0;
  }
  /** how far behind the baseline they wait for a first serve (Skill.retBack) */
  get retBack(): number {
    return this.skill.retBack ?? 0;
  }

  private waitUntil = -1;
  /** what their last shot was for (singles: where they go next, placeSingles) */
  private intent: Intent | null = null;
  /** the opponent's last balls at this player (zoneOf keys): a repeated one is read earlier and played calmer */
  private seen: string[] = [];
  /**
   * the read of the ball coming now: how familiar it is, how far off the first read was and how early it was fixed,
   * and how far from the net the player stood when it was struck (z0)
   */
  private cur: { plan: Plan; fam: number; off: number; lead: number; z0: number; x0: number } | null = null;

  /**
   * The serve (TENNIS.serve): a first serve flat (big, low over the net) or sliced, to the T, the body or wide, as fast
   * as the card's saq allows; a second serve with kick, slower, higher over the net and with a margin from the lines,
   * mostly to the backhand. The bolder they are, the closer to the lines.
   */
  serve(m: Match, p: Player): ShotSpec | null {
    if (this.waitUntil < 0 || this.waitUntil < m.t - 30) this.waitUntil = m.t + this.skill.serveDelay * (0.8 + m.rng.next() * 0.5);
    if (m.t < this.waitUntil) return null;
    this.waitUntil = -1;
    this.intent = 'serve';
    const s = this.skill;
    const rng = m.rng;
    const S = TENNIS.serve;
    const half = -m.serveX(p.team);
    const second = m.serveNum === 2;
    const sv = s.serve ?? 0.5;
    const flat = !second && rng.chance(s.flat ?? 0.5);
    // where in the box: the T (by the centre line), the body (the middle) or wide (by the singles sideline)
    const u = rng.next();
    const wide = second ? 0.2 : 0.3 + s.risk * 0.2;
    const tee = second ? 0.35 : 0.4;
    const margin = (second ? S.margin2 : S.margin) * (1.3 - s.risk * 0.6) + rng.next() * 0.25;
    const x = u < tee ? margin * 0.8 + rng.next() * 0.4 : u < 1 - wide ? 1.4 + rng.next() * 1.2 : W_S / 2 - margin;
    const depth = SERVICE - margin - rng.next() * (second ? 0.9 : 0.6);
    const pace = second ? S.pace2 - sv * 0.08 : flat ? S.paceFlat - sv * S.paceSaq : S.paceSlice - sv * S.paceSaq * 0.8;
    const clear = second ? S.clear2 + rng.next() * 0.3 : flat ? S.clearFlat + rng.next() * 0.15 : S.clearSlice + rng.next() * 0.2;
    const spin = second ? S.spin2 : flat ? S.spinFlat : S.spinSlice;
    const power = second ? 0.45 : clamp(0.55 + sv * 0.2, 0.5, 0.8);
    // (a first serve is a gamble: S.risk1 of extra roughness, less for a strong server)
    const hard = second ? S.risk2 * (1 - sv * 0.5) : S.risk1 * (1 - sv * 0.4) + (flat ? S.riskFlat : 0);
    return this.roll(m, { kind: 'serve', ...target(p.side, half * x, depth), clear, pace, spin, power }, hard);
  }

  /** Singles: where they go after their shot (Controller.place): the intent of the shot decides (placeSingles). */
  place(m: Match, p: Player, spec: ShotSpec): { depth: 0 | 1 | 2; x: number } | null {
    if (m.doubles) return null;
    return placeSingles(m, p, this.skill, this.intent, spec);
  }

  /**
   * The first read of the coming ball (the match calls it when this player sets off for it). A fast or spinning ball
   * is misjudged by a few centimetres to a few decimetres (less by better players, less on a pattern seen before);
   * the read is fixed shortly before the contact, a little earlier by better players. A ball they will have to slice
   * (stretched wide, low) is marked so now (Plan.kind), so the view can prepare the swing from high up.
   */
  read(m: Match, p: Player, plan: Plan): { dx: number; dz: number; at: number } | null {
    const s = this.skill;
    const key = zoneOf(m, p, plan);
    const fam = Math.min(1, this.seen.filter((k) => k === key).length / 3);
    this.seen.push(key);
    if (this.seen.length > 6) this.seen.shift();
    this.cur = { plan, fam, off: 0, lead: 9, z0: Math.abs(p.z), x0: p.x };
    if (!plan.volley && !plan.overhead && Math.abs(plan.fz) > AT_NET && (m.rally?.shots ?? 0) > 1) {
      const far = Math.hypot(plan.fx - p.x, plan.fz - p.z) > 3.2;
      const low = plan.by < 0.55;
      if (m.rng.chance((s.slice ?? 0.3) * (far ? 0.55 : low ? 0.3 : plan.hand === -1 ? TENNIS.sliceBh : 0.02))) plan.kind = 'slice';
    }
    const spin = Math.abs(m.rally?.seg.spin ?? 0);
    const tricky = clamp((ballSpeed(m) - 12) / 16, 0, 1.2) + spin * 0.4;
    const sd = (s.read ?? 0) * tricky * (1 - 0.6 * fam);
    if (sd < 0.01) return null;
    const dx = m.rng.gauss() * sd * 0.6;
    const dz = m.rng.gauss() * sd;
    // (never later than 0.22 s before the contact: the view picks the swing clip from the plan up to then)
    const lead = clamp(0.36 - (s.read ?? 0) * 0.6, 0.22, 0.34);
    const at = Math.max(m.t + p.reaction, plan.t - lead);
    this.cur.off = Math.hypot(dx, dz);
    this.cur.lead = plan.t - at;
    return { dx, dz, at };
  }

  hit(m: Match, p: Player, plan: Plan): ShotSpec {
    const s = this.skill;
    const poise = s.poise ?? 1;
    const c = this.cur && this.cur.plan === plan ? this.cur : null;
    this.cur = null;
    const fam = c?.fam ?? 0;
    // Poise takes the edge off an awkward ball, less so off a ball that leaves no time (a smash at the body is hard for
    // everybody). A familiar ball is played calmer; a read fixed late leaves the swing rushed.
    const rush = rushed(m, plan);
    let hard = ((difficulty(m, p, plan) - rush) * poise + rush * (0.6 + 0.4 * poise)) * (1 - 0.35 * fam);
    if (c) hard += c.off * clamp((0.45 - c.lead) / 0.3, 0, 1) * 0.5;
    // passed: a ball that went by and had to be chased back (a lob, a volley behind them) is played turning, on the run
    // (RUN_BACK; the faster get back in better shape)
    if (c) hard += clamp((Math.abs(plan.fz) - c.z0 - RUN_BACK.from) * RUN_BACK.per, 0, RUN_BACK.max) * (0.6 + 0.4 * poise) * (5.4 / Math.max(4.5, s.speed));
    // on the run: a ball they had to sprint across the court for is hit off balance (RUN_WIDE; quick legs less so)
    if (c && !plan.volley) hard += clamp((Math.abs(plan.fx - c.x0) - RUN_WIDE.from) * RUN_WIDE.per, 0, RUN_WIDE.max) * (5.6 / Math.max(4.5, s.speed));
    // the card on this ball (CARD): time to set up (vel), a volley or a smash (red), the defence on the run (vel)
    const a = s.attrs;
    if (a) {
      // (centred: a contact with the usual time in hand, CARD.mid of `want`, costs nothing; more time is easier)
      hard += (clamp((CARD.want - (plan.spare ?? CARD.want)) / CARD.want, 0, 1) - CARD.mid) * CARD.setup;
      if (plan.overhead || plan.volley) hard -= (a.red - 70) * CARD.red;
      if ((plan.stretch ?? 0) > 0.3) hard -= (a.vel - 70) * CARD.def;
      hard = Math.max(0, hard);
    }
    let { shot, intent } = chooseShot(m, p, plan, s, hard);
    let risk = attackRisk(shot.kind, plan) * poise;
    // A fast ball at the body at the net with no time: the safe answer is a block (a short punch that takes the pace
    // off), not a full swing. Players with touch see it more often, and more so on a pattern.
    const r = m.rally;
    const avail = r?.last?.lastHit ? plan.t - r.last.lastHit.t : 9;
    const block = plan.volley && ballSpeed(m) > 18 && plan.by < NET_C + 0.3 && avail < 0.55 && !plan.overhead && (r?.shots ?? 0) > 1;
    if (block && shot.kind !== 'lob' && m.rng.chance(clamp(0.3 + s.touch * 0.5 + fam * 0.2, 0, 0.9))) {
      shot = { kind: 'auto', ...target(p.side, (m.rng.next() - 0.5) * 3 - p.x * 0.3, 6 + m.rng.next() * 3.5), clear: 0.3 + (1 - s.touch) * 0.15 };
      intent = 'block';
      hard *= 0.7;
      risk = 0;
    }
    // The other side's automatic shot (the human's swing with no aim: the same ball every time): from the third in a
    // row they see it coming and, now and then, attack it away from the player (AUTO_PUNISH).
    const last = r?.last?.lastHit;
    if (this.autoSeen.rally !== m.stats.rallies) this.autoSeen = { rally: m.stats.rallies, n: 0 };
    this.autoSeen.n = last?.timing === 'auto' ? this.autoSeen.n + 1 : 0;
    if (this.autoSeen.n >= AUTO_PUNISH.from && (r?.shots ?? 0) > 2 && m.rng.chance(AUTO_PUNISH.base + AUTO_PUNISH.attack * s.attack)) {
      shot = punish(m, p, plan, s);
      intent = 'putaway';
      risk = attackRisk(shot.kind, plan) * poise;
    }
    this.intent = intent;
    // how hard: their usual power on the firm shots (the card's pot), a notch more on an attack, placed on the soft ones
    if (shot.power === undefined) shot = { ...shot, power: cpuPower(s, shot.kind, plan, intent) };
    // the card's pace (pot, red) and touch (tq), CARD
    if (a) shot = cardShot(shot, a);
    // the lob goes over a player at the net by a margin (LOB): the bolder, the tighter; chased back, a higher one
    if (shot.kind === 'lob' && (m.rally?.shots ?? 0) > 1) {
      const over = intent === 'defend' ? LOB.defOver : LOB.over + (1 - s.risk) * LOB.shy + m.rng.next() * LOB.vary;
      shot = { ...shot, clear: lobClear(m, p, { x: plan.bx, y: plan.by, z: plan.bz }, shot.tx, shot.tz, over, shot.clear) };
    }
    const spec = this.roll(m, shot, hard + risk, plan);
    // the rally weighs on them (less on the calm ones, and less against a pattern they have already read)
    spec.pop = popOf(m, poise * (1 - 0.5 * fam));
    // beaten: a hard ball at them with no time (a smash, a volley at the body, a big serve) now and then not even touched
    if (m.rng.chance(whiffOf(rush, s))) spec.whiff = true;
    // a hard swing at an awkward ball goes off the frame more often (POWER)
    const ps = powerShank(spec.power ?? 0.5, hard);
    if (ps > 0) spec.shank = Math.min(SHANK.max, (spec.shank ?? 0) + ps);
    return spec;
  }
  /** the other side's automatic shots in a row at this player, in this rally */
  private autoSeen = { rally: -1, n: 0 };

  /**
   * contact quality: the skill (and the card's attribute for this shot, attrQ), a bit of luck and how awkward the ball
   * was; a poor contact is also early or late
   */
  protected roll(m: Match, base: Omit<ShotSpec, 'q' | 'timing'>, hard: number, plan: Plan | null = null): ShotSpec {
    const s = this.skill;
    const raw = s.q + attrQ(s.attrs, base.kind, plan) + m.rng.gauss() * s.qVar - hard;
    const q = clamp(raw, Q_FLOOR, 1);
    const timing: Timing = q > 0.93 ? 'perfect' : q > 0.7 ? 'good' : 'early';
    const late = clamp(m.rng.gauss() * (1 - q) * 1.1, -1, 1);
    // (the better the control, the fewer frame errors: CARD.shank)
    const shank = shankOf(m, raw, Q_FLOOR, SHANK.margin * clamp(1 - ((s.attrs?.con ?? 70) - 70) * CARD.shank, 0.6, 1.3));
    return { ...base, q, timing, late, power: base.power ?? s.power ?? 0.5, ...(shank > 0 ? { shank } : {}) };
  }
}

/** A CPU shot with the card's pace and touch on it (CARD). */
function cardShot(shot: Omit<ShotSpec, 'q' | 'timing'>, a: Attributes): Omit<ShotSpec, 'q' | 'timing'> {
  const k = shot.kind;
  if (k === 'serve') return shot;
  if (k === 'dink' || k === 'drop') return { ...shot, clear: Math.max(0.06, shot.clear * (1 - (a.tq - 70) * CARD.tqClear)) };
  if (k === 'lob') return { ...shot, clear: shot.clear * (1 + (a.tq - 70) * 0.004) };
  let pace = (shot.pace ?? 1) * (1 - (a.pot - 70) * CARD.pace * (k === 'slice' ? 0.4 : 1));
  if (k === 'smash') pace *= 1 - (a.red - 70) * CARD.redPace;
  return { ...shot, pace };
}

/**
 * CPU players beaten by the pace: of the lack of time on a ball (rushed: a big serve, a volley at the body, a smash)
 * above `from`, `k` per unit is the chance the racket never meets it (ShotSpec.whiff: it goes past, a winner unless the
 * partner saves it), at most `max`; quicker reactions (the card's ref) are beaten less (`react` × reaction / 0.25),
 * quicker legs too (`legs`).
 */
export const WHIFF = { from: 0.2, k: 0.7, max: 0.3, react: 1, legs: 0.35 };
function whiffOf(rush: number, s: Skill): number {
  const legs = clamp(1 - WHIFF.legs * (s.speed - 5.4), 0.6, 1.4);
  return clamp((rush - WHIFF.from) * WHIFF.k * (1 - WHIFF.react + (WHIFF.react * s.reaction) / 0.25) * legs, 0, WHIFF.max);
}

/**
 * A CPU shot's power (ShotSpec.power) when the choice did not set one: placed on the soft game, their usual power
 * (Skill.power, from pot) on the firm shots, a notch more (`attack`) on a put-away, a notch less (`defend`) on a ball
 * played to buy time.
 */
export const CPU_POWER = { soft: 0.35, lob: 0.45, attack: 0.16, defend: -0.12 };
function cpuPower(s: Skill, kind: ShotKind, plan: Plan, intent: Intent): number {
  const base = s.power ?? 0.5;
  if (kind === 'dink' || kind === 'drop') return CPU_POWER.soft;
  if (kind === 'lob') return CPU_POWER.lob;
  if (kind === 'slice') return clamp(base - 0.08, 0, 1);
  if (intent === 'defend' || intent === 'block') return clamp(base + CPU_POWER.defend, 0, 1);
  if (intent === 'putaway' || kind === 'smash' || (intent === 'pass' && plan.by > 0.7)) return clamp(base + CPU_POWER.attack, 0, 1);
  return base;
}

/**
 * CPU players chased back: a ball met more than `from` m further from the net than where they stood when it was struck
 * (a lob over them, a deep ball that pushes them back) is `per` per metre harder, at most `max`.
 */
export const RUN_BACK = { from: 2.5, per: 0.07, max: 0.35 };
/** CPU players pulled wide: a groundstroke met more than `from` m across from where they stood is `per` per metre harder, at most `max` */
export const RUN_WIDE = { from: 2.2, per: 0.06, max: 0.28 };

/** the lowest contact quality of a CPU swing (a human's: Q_FLOOR_HUMAN) */
export const Q_FLOOR = 0.15;
export const Q_FLOOR_HUMAN = 0.2;
/**
 * A ball too awkward to play at all: below `margin` over the contact quality floor, what is left (`raw`: the quality
 * it would have had) becomes the chance of a shank, `k` per unit, at most `max`: into the net, long or off the frame
 * (Match.launch). A ball dug out at full stretch is then often an error, not one more lob at the floor that keeps the
 * point alive. The human's margin is smaller (`human`): his timing (the golden ring) already decides most of a contact.
 */
export const SHANK = { margin: 0.25, human: 0.1, k: 1.4, max: 0.7 };
export function shankOf(_m: Match, raw: number, floor: number, margin = SHANK.margin): number {
  return clamp((floor + margin - raw) * SHANK.k, 0, SHANK.max);
}

/**
 * The automatic shot read by the CPU (AIController.hit): from the `from`-th in a row at the same player, the chance of
 * attacking it is base + attack × the player's attack.
 */
export const AUTO_PUNISH = { from: 3, base: 0.12, attack: 0.5 };

/** An attack on a ball the player saw coming, into the open court, away from the opponents. */
function punish(m: Match, p: Player, plan: Plan, s: Skill): Omit<ShotSpec, 'q' | 'timing'> {
  const rng = m.rng;
  const opps = m.players.filter((o) => o.team !== p.team);
  const opp = opps[rng.chance(0.5) ? 0 : opps.length - 1];
  const way = Math.abs(opp.x) > 0.3 ? -Math.sign(opp.x) : rng.chance(0.5) ? 1 : -1;
  const x = opp.x + way * (2.2 + s.risk * 0.8 + rng.next() * 0.8);
  if (plan.overhead) return { kind: 'smash', ...target(p.side, x, 6 + rng.next() * 4), clear: 0.1, pace: 0.8 };
  const atNet = Math.abs(plan.fz) < AT_NET;
  return { kind: atNet ? 'speedup' : 'drive', ...target(p.side, x, atNet ? 5 + rng.next() * 3 : HL - 2 - rng.next() * 2), clear: atNet ? 0.15 : 0.45, pace: 0.88 };
}

/**
 * Long rallies: the pressure builds up from the `from`-th shot, `per` shot. It goes into how likely a shot is to sit
 * up (ShotSpec.pop, × `pop`: high and short, a ball to attack) and, × `contact`, into the contact itself
 * (difficulty): most points in tennis end in an error, more so the longer the rally.
 */
export const PRESSURE = { from: 4, per: 0.045, contact: 0.6, pop: 0.5 };
/** the rally pressure on this shot (0 …): `pop` of it is the chance-weight of the ball sitting up (ShotSpec.pop) */
export function pressure(m: Match): number {
  const r = m.rally;
  return r && r.shots > PRESSURE.from ? (r.shots - PRESSURE.from) * PRESSURE.per : 0;
}
/** ShotSpec.pop for a shot under the current rally pressure (scaled by `k`: poise, a perfect release…) */
export function popOf(m: Match, k = 1): number {
  return pressure(m) * PRESSURE.pop * k;
}

/**
 * The part of the difficulty that is lack of time: a hard-hit ball (a big serve, a heavy drive, a smash), little time
 * to react (a volley at the body, a passing shot at the net).
 */
function rushed(m: Match, plan: Plan): number {
  let d = clamp((ballSpeed(m) - 16) / 14, 0, 2.4) * 0.15;
  const r = m.rally;
  const last = r?.last?.lastHit;
  if (last) {
    const avail = plan.t - last.t;
    if (avail < 0.75) d += (0.75 - avail) * 1.0;
    if (avail < 0.5) d += (0.5 - avail) * 1.4;
  }
  // chased back by a lob: played on the run, the ball over the shoulder (a smash from deep is no put-away)
  if (last?.kind === 'lob') d += plan.overhead ? clamp((Math.abs(plan.fz) - 6.5) * 0.12, 0, 0.4) : clamp((Math.abs(plan.fz) - 9) * 0.08, 0, 0.3);
  return d;
}

/** A volley met below `below` m is `per` per metre of it harder (the ball has to be lifted over the net). */
export const LOW_VOLLEY = { below: 0.9, per: 0.25 };

/** How hard the incoming ball is to play well (0 = sitting up nicely). */
export function difficulty(m: Match, p: Player, plan: Plan): number {
  let d = rushed(m, plan);
  if (plan.by < 0.35) d += 0.12;
  // a high ball after the bounce (a heavy topspin kick above the shoulder) is awkward to drive
  if (!plan.volley && !plan.overhead && plan.by > 1.45) d += (plan.by - 1.45) * 0.25;
  // a volley at the feet (below the tape) has to be lifted: the low volley is the hard one
  if (plan.volley && plan.by < LOW_VOLLEY.below) d += (LOW_VOLLEY.below - plan.by) * LOW_VOLLEY.per;
  if (plan.hand === -1) d += 0.03;
  // long rallies: a little of the pressure gets into the contact (most of it makes the ball sit up, see pressure)
  d += pressure(m) * PRESSURE.contact;
  // the card of the one who hit it (CARD.weight), and a perfect shot (the human's gold ring) is a better ball
  d += clamp(weightOf(m), -CARD.wMax, CARD.wMax);
  if (m.rally?.last?.lastHit?.timing === 'perfect' && m.rally.last.team !== p.team) d += CARD.perfect;
  // reaching for it at full stretch
  const s = plan.stretch ?? 0;
  if (!p.human) d += s * s * 0.18;
  return d;
}

/**
 * Hitting hard from below the tape is a gamble, the more so the closer to the net (from the back the ball has room to
 * rise and dip with topspin): extra difficulty for an attack off a low ball.
 */
export function attackRisk(kind: ShotKind, plan: Plan): number {
  if ((kind !== 'speedup' && kind !== 'drive') || plan.by >= NET_C * 0.8) return 0;
  const near = clamp((9 - Math.abs(plan.fz)) / 5, 0.15, 1);
  return (NET_C * 0.8 - plan.by) * (kind === 'speedup' ? 0.6 : 0.45) * near;
}

/**
 * The tennis game plan (see the head of this file). The numbers are weights and chances; each one is multiplied by the
 * player's skill so each keeps a style (Rud grinds with topspin, de Miñor runs everything down, Medvédiev is flat and
 * deep, Siner hits early and hard, Alcarás does it all).
 */
export const TENNIS = {
  /**
   * The serve: first serve pace (× the fastest flight) flat `paceFlat` / sliced `paceSlice`, `paceSaq` less for a top
   * server; second serve `pace2`. Height over the tape: flat `clearFlat` (+ up to 0.15), sliced `clearSlice`, kick
   * `clear2` (+ up to 0.3). Spin: flat `spinFlat`, sliced `spinSlice`, kick `spin2`. Margin from the lines (m, × the
   * caution): first `margin`, second `margin2`. Roughness: a first serve `risk1` (+ `riskFlat` flat), a second `risk2`.
   */
  serve: { paceFlat: 0.66, paceSlice: 0.74, paceSaq: 0.1, pace2: 0.95, clearFlat: 0.14, clearSlice: 0.3, clear2: 0.85, spinFlat: 0.1, spinSlice: 0.35, spin2: 0.85, margin: 0.38, margin2: 0.7, risk1: 0.2, riskFlat: 0.05, risk2: 0.03 },
  /** the rally ball's height over the tape: `clear0` + topspin × `clearSpin` + up to `clearVary` (m) */
  clear0: 0.4,
  clearSpin: 0.6,
  clearVary: 0.45,
  /** how far inside the lines they aim: `edge` m from the sideline + (1 − risk) × `edgeShy`; `deep` m from the baseline + (1 − risk) × `deepShy` */
  edge: 0.35,
  edgeShy: 0.9,
  deep: 0.9,
  deepShy: 1.0,
  /** a change down the line: chance `line` + risk × `lineRisk` (off a ball they can attack, more) */
  line: 0.15,
  lineRisk: 0.25,
  /** a short ball (met `short` m or more inside the baseline, above `shortH` m): approach `approach` × rush, winner `winner` × attack, drop shot `dropShort` × touch */
  short: 1.6,
  shortH: 0.55,
  approach: 1.2,
  winner: 0.9,
  dropShort: 0.45,
  /** the other one pulled wide: a ball hit to finish it into the open court with chance attack × `openHit` */
  openHit: 0.7,
  /** from the baseline: a drop shot with chance touch × `rallyDrop` (× `deepOpp` when the other one is deep, × `clayDrop` on clay) */
  rallyDrop: 0.05,
  deepOpp: 2,
  clayDrop: 1.6,
  /** stretched (difficulty over `stretched`, or a full lunge): a slice with chance slice × `defSlice`, a high ball (a moonball or a lob) × `defHigh`; the rest a neutral ball */
  stretched: 0.45,
  defSlice: 1.4,
  defHigh: 0.5,
  /** off the backhand, a slice now and then (Skill.slice × `sliceBh`); a slice flies at `slicePace` × the fastest */
  sliceBh: 0.2,
  slicePace: 1.4,
  /** against a player at the net, the weights: passing shot pass + passAtk × attack, lob lob × lob (× lobbable), at his feet feet × touch */
  pass: 0.6,
  passAtk: 0.6,
  lob: 1.0,
  feet: 0.35,
  /** the passing shot goes by him gap (+ risk × 0.8 + up to 0.6) m to the side at his depth (passingShot) */
  gap: 1.5,
  /** at the net: a ball above the tape is put away with chance up × (attack + putAway) × putAwayMul; a drop volley with chance touch × dropVolley */
  putAway: 0.4,
  putAwayMul: 1.8,
  dropVolley: 0.3,
  /** in to the net behind an approach: rush + approachIn; behind a drop shot: rush × dropIn */
  approachIn: 0.55,
  dropIn: 0.6,
  /** the return: a first serve faster than `bigServe` m/s (along the court) is blocked back with chance `blockBig` (+ difficulty), a second serve attacked with chance attack × `attack2` */
  bigServe: 33,
  blockBig: 0.35,
  attack2: 0.6,
};

/**
 * How high the lobs go (m over the tape where they cross the net; the peak is about two metres more). `high` a
 * defensive lob (chased, stretched), `atk` the topspin lob over a player at the net, `ret` the return's. Over a player
 * at the net (lobClear) it passes `behind` m behind him (read `lead` s ahead if he moves) `over` m above his reach (plus
 * up to `shy` for a cautious player, `vary` of luck; `defOver` for a defensive one; `human` for the human's). Clamped to
 * `min` … `max`.
 */
export const LOB = { high: 6.0, atk: 4.2, ret: 4.5, spin: 0.5, behind: 1.8, over: 0.5, shy: 0.6, vary: 0.5, defOver: 1.6, lead: 0.3, min: 3.2, max: 8.5, human: 0.7 };
/**
 * The height of a lob over a player at the net: not a fixed height over the tape but over the opponent: it passes
 * LOB.behind m behind each one at the net `over` m above his reach, so he has to turn and run back (Match BACK). Nobody
 * at the net: `fallback`.
 */
export function lobClear(m: Match, p: Player, from: { x: number; y: number; z: number }, tx: number, tz: number, over: number, fallback: number): number {
  let c: number | null = null;
  for (const o of m.players) {
    if (o.team === p.team || Math.abs(o.z) >= AT_NET + 1) continue;
    const oz = o.z + o.vz * LOB.lead;
    const zp = o.side * (Math.abs(oz) + LOB.behind);
    const k = clearOver(from, tx, tz, zp, (m.controllers[o.id]?.reachH ?? 3.0) + over, LOB.spin, 0.9, 4.2);
    if (k !== null && (c === null || k > c)) c = k;
  }
  return clamp(c ?? fallback, LOB.min, LOB.max);
}

/**
 * How good a target for a lob a player is right now (0 … 1): close to the net (from 4 m in, fully at 2.5) or still
 * coming in (moving towards the net faster than 1 m/s inside the service line): he cannot get back in time.
 */
export function lobbable(o: Player): number {
  const oz = Math.abs(o.z);
  const pinned = clamp((4.2 - oz) / 1.7, 0, 1);
  const coming = clamp((-o.vz * o.side - 1) / 2.5, 0, 1) * clamp((SERVICE + 1 - oz) / 2, 0, 1);
  return clamp(pinned * 0.8 + coming, 0, 1);
}

/** The shot a sensible CPU player picks here (singles or doubles), and what it is for. */
export function chooseShot(m: Match, p: Player, plan: Plan, s: Skill, hard = 0): Choice {
  return m.doubles ? doublesShot(m, p, plan, s, hard) : singlesShot(m, p, plan, s, hard);
}

/** The rally ball's height over the tape for this player (TENNIS.clear0 …): topspin players play higher over the net. */
function rallyClear(m: Match, s: Skill, hard = 0): number {
  return TENNIS.clear0 + (s.topspin ?? 0.6) * TENNIS.clearSpin + m.rng.next() * TENNIS.clearVary + clamp(hard, 0, SAFE.max) * SAFE.clear;
}
/**
 * CPU players in trouble (the difficulty of the ball, up to `max`) play safer, as people do: `edge` m further inside the
 * sideline, `deep` m further inside the baseline and `clear` m higher over the net per unit of it.
 */
export const SAFE = { max: 0.6, edge: 1.0, deep: 1.4, clear: 0.6 };
/** the topspin of this player's drive (Skill.topspin: 0.3 flat … 0.9 heavy) */
function driveSpin(s: Skill): number {
  return 0.3 + (s.topspin ?? 0.6) * 0.6;
}

/** Singles: the shot a sensible CPU player picks here, and what it is for (see TENNIS). */
function singlesShot(m: Match, p: Player, plan: Plan, s: Skill, hard: number): Choice {
  const T = TENNIS;
  const r = m.rally!;
  const rng = m.rng;
  const opp = m.players.find((o) => o.team !== p.team)!;
  const side = p.side;
  const hw = halfW();
  const me = Math.abs(plan.fz);
  const meNet = me < AT_NET;
  // where the other one will be when the ball gets there: a player running in is read where he is going
  const oz = Math.max(0.5, Math.abs(opp.z + opp.vz * 0.35));
  const ox = opp.x + opp.vx * 0.3;
  const oppNet = oz < AT_NET + 1.2;
  // how attackable the ball is at the net: 0 at the height of the tape, 1 well above it
  const up = clamp((plan.by - NET_C - 0.1) / 0.6, 0, 1);
  const chased = r.last?.lastHit?.kind === 'lob' && me > SERVICE;
  const stretched = hard > T.stretched || (plan.stretch ?? 0) > 0.7;
  // the open court: away from where the opponent is (or is heading); right in the middle, either way
  const sgn = Math.abs(ox) > 0.4 ? -Math.sign(ox) : rng.chance(0.5) ? 1 : -1;
  // cross-court: across from where the ball is met (a ball met on the right goes to their right, the diagonal)
  const cross = -(Math.sign(plan.bx) || sgn);
  // (in trouble they play safer: further inside the lines and higher over the net, SAFE)
  const safe = clamp(hard, 0, SAFE.max);
  const edge = () => hw - (T.edge + (1 - s.risk) * T.edgeShy + rng.next() * 0.4 + safe * SAFE.edge);
  const deep = () => HL - (T.deep + (1 - s.risk) * T.deepShy + rng.next() * 1.0 + safe * SAFE.deep);
  const dropD = () => 1.8 + rng.next() * 2.2;
  const open = () => rng.chance(s.angle ?? 0.6);
  const out = (kind: ShotKind, x: number, d: number, clear: number, intent: Intent, pace?: number, spin?: number): Choice => ({ shot: { kind, ...target(side, x, d), clear, ...(pace !== undefined ? { pace } : {}), ...(spin !== undefined ? { spin } : {}) }, intent });
  const sliceIt = plan.kind === 'slice';

  if (r.shots === 1) return returnShot(m, p, plan, s, hard, [opp]);
  // over the head: a smash (out of the air, or a lob that bounced high), into the open court
  if (plan.overhead && (plan.volley || plan.by > 2.3)) {
    if (rng.chance(clamp(0.6 + s.attack * 0.45 - (me > 9 ? 0.35 : 0) - hard * 0.6, 0.15, 0.97))) {
      const x = open() ? sgn * edge() * 0.85 : (rng.next() - 0.5) * 2;
      return out('smash', x, me > 8 ? deep() : 5.5 + rng.next() * 4.5, 0.2, 'putaway', 0.78);
    }
    // a lob too deep to put away: a firm smash down the middle, deep, to start again
    return out('smash', (rng.next() - 0.5) * 2.2, deep(), 0.4, 'rally', 0.95);
  }
  if (meNet) {
    if (up > 0 && rng.chance(Math.min(0.95, up * (s.attack + T.putAway) * T.putAwayMul))) {
      // a ball that sits up at the net: put it away, into the open court (short and angled, or deep)
      const short = rng.chance(0.45);
      const x = sgn * (short ? hw - 0.5 - rng.next() * 0.8 : edge());
      return out('speedup', x, short ? 3.5 + rng.next() * 2 : deep(), 0.22, 'putaway', 0.85);
    }
    if (!oppNet) {
      // the opponent is back: a drop volley, short and angled (more so when he is deep), or deep to the open corner
      if (rng.chance(s.touch * T.dropVolley * (oz > HL ? 1.4 : 0.8))) return out('dink', sgn * (1.5 + rng.next() * 1.8), 1.5 + rng.next() * 1.5, 0.15 + (1 - s.touch) * 0.15, 'volley');
      return out('speedup', open() ? sgn * edge() : (rng.next() - 0.5) * 2.4, deep(), 0.3 + rng.next() * 0.15, 'volley', 1.0);
    }
    // both at the net: at his feet, or past him into the open court
    if (rng.chance(0.5)) return out('speedup', ox + (rng.next() - 0.5) * 0.6, Math.min(HL - 1, oz + 1 + rng.next()), 0.12, 'volley', 0.9);
    return out('dink', sgn * (hw - 0.8), 2.2 + rng.next() * 1.2, 0.14, 'volley');
  }
  if (oppNet && !chased) {
    // back against a player at the net: the passing game
    const lobW = s.lob * T.lob * lobbable(opp) * (me > HL - 1.5 ? 1 : 0.35) * clamp(1 - hard * 1.5, 0.2, 1);
    const feetW = s.touch * T.feet * (plan.by < NET_C ? 1.5 : 0.6);
    const passW = T.pass + s.attack * T.passAtk;
    let u = rng.next() * (lobW + feetW + passW);
    if ((u -= lobW) < 0) return out('lob', sgn * (0.8 + rng.next() * 1.6), HL - 1.4 - rng.next() * 1.4, LOB.atk, 'lob', undefined, 0.7);
    if ((u -= feetW) < 0) return out('drive', ox + (rng.next() - 0.5) * 0.8, Math.min(HL - 1.5, oz + 0.6 + rng.next() * 1.2), 0.15 + rng.next() * 0.1, 'pass', 1.05, 0.95);
    const pass = passingShot(plan, ox, oz, s, rng.next(), rng.next(), rng.next(), rng.next());
    return out('drive', pass.x, pass.d, 0.18 + (1 - s.risk) * 0.15 + rng.next() * 0.12, 'pass', 0.9 - s.attack * 0.06, driveSpin(s) + 0.1);
  }
  if (chased) {
    // a lob over him, run down after the bounce: a high ball back to buy time, or a passing shot if he is set
    if (rng.chance(0.6 - s.attack * 0.3)) return out('lob', (rng.next() - 0.5) * 2.4, HL - 2 - rng.next() * 2, LOB.high, 'defend', undefined, 0.3);
    return out('drive', sgn * edge(), deep(), 0.5, 'pass', 0.95, driveSpin(s));
  }
  // both back: the baseline rally
  if (stretched) {
    // pulled wide or pushed back: a slice (low, it stays low and buys time) or a high ball deep down the middle
    const sW = (s.slice ?? 0.3) * T.defSlice + (sliceIt ? 1 : 0);
    const hW = T.defHigh * (0.5 + (s.topspin ?? 0.6));
    const nW = 0.6 + s.attack * 0.6;
    let u = rng.next() * (sW + hW + nW);
    if ((u -= sW) < 0) return out('slice', (rng.next() - 0.5) * 2.4, deep() + 0.4, 0.35 + rng.next() * 0.2, 'defend', T.slicePace + 0.1);
    if ((u -= hW) < 0) return out('drive', (rng.next() - 0.5) * 2.2, deep(), 2.2 + rng.next(), 'defend', 1.2, driveSpin(s) + 0.15);
    // (or go for it from the stretch: a ball into the open court, a gamble)
    return out('drive', open() ? sgn * edge() : cross * edge() * 0.8, deep(), rallyClear(m, s, hard) * 0.85, 'rally', 1, driveSpin(s));
  }
  const short = me < HL - T.short && plan.by > T.shortH;
  if (short) {
    // a short ball: an approach and in, a winner into the open court, or a drop shot
    const apW = T.approach * (0.3 + (s.mover.netRush ?? 0.3));
    const wiW = T.winner * s.attack * (plan.by > 0.9 ? 1.3 : 0.7);
    const drW = T.dropShort * s.touch * (oz > HL ? 1.5 : 0.7) * (m.surface === 'clay' ? T.clayDrop : 1);
    const neW = 0.5;
    let u = rng.next() * (apW + wiW + drW + neW);
    if ((u -= apW) < 0) {
      // the approach: deep, mostly down the line (the side the ball is on); a slice off a low one
      const own = Math.sign(plan.bx) || sgn;
      const x = (rng.chance(0.65) ? own : sgn) * edge() * 0.9;
      if (sliceIt || (plan.by < 0.85 && rng.chance(s.slice ?? 0.3))) return out('slice', x, deep() + 0.3, 0.32, 'approach', T.slicePace - 0.1);
      return out('drive', x, deep(), 0.45 + rng.next() * 0.25, 'approach', 0.95, driveSpin(s));
    }
    if ((u -= wiW) < 0) return out('drive', sgn * (hw - 0.35 - (1 - s.risk) * 0.5 - rng.next() * 0.4), rng.chance(0.35) ? 5.5 + rng.next() * 2 : HL - 0.9 - rng.next() * 1.2, 0.3 + rng.next() * 0.2, 'putaway', 0.82, driveSpin(s) * 0.8);
    if ((u -= drW) < 0) return out('drop', sgn * (0.8 + rng.next() * 2), dropD(), 0.22 + (1 - s.touch) * 0.25, 'drop');
  }
  if (rng.chance(s.touch * T.rallyDrop * (oz > HL + 1 ? T.deepOpp : 1) * (m.surface === 'clay' ? T.clayDrop : 1))) return out('drop', sgn * (0.8 + rng.next() * 2), dropD(), 0.26 + (1 - s.touch) * 0.25, 'drop');
  // off the backhand, a slice now and then (or when the read said so)
  if (sliceIt || (plan.hand === -1 && rng.chance((s.slice ?? 0.3) * T.sliceBh))) return out('slice', cross * edge() * 0.7, deep(), 0.35 + rng.next() * 0.2, 'rally', T.slicePace);
  // the rally ball: into the open court when the other one is pulled wide (hit to finish it off a ball that lets
  // them, TENNIS.openHit), else deep cross-court with a change down the line now and then (more off a ball that sits up)
  if (Math.abs(ox) > hw * 0.55 && open()) {
    if (plan.by > 0.75 && hard < 0.3 && rng.chance(s.attack * T.openHit)) return out('drive', sgn * edge(), deep(), 0.45 + rng.next() * 0.2, 'putaway', 0.85, driveSpin(s));
    return out('drive', sgn * edge(), deep(), rallyClear(m, s, hard) * 0.9, 'rally', 0.95, driveSpin(s));
  }
  const line = rng.chance(T.line + s.risk * T.lineRisk + (plan.by > 1.0 ? 0.1 : 0));
  const x = line ? -cross * edge() * 0.9 : open() ? cross * edge() : cross * (1 + rng.next() * (edge() - 1));
  return out('drive', x, deep(), rallyClear(m, s, hard), 'rally', 1, driveSpin(s));
}

/**
 * The return of serve (both games): a big first serve is blocked back deep down the middle; a second serve is
 * attacked (deep, into a corner); a server coming in gets it low at his feet; otherwise a solid return deep, cross-court
 * (doubles: always cross-court, away from the net player, or a lob over him now and then).
 */
function returnShot(m: Match, p: Player, plan: Plan, s: Skill, hard: number, opps: Player[]): Choice {
  const T = TENNIS;
  const rng = m.rng;
  const side = p.side;
  const hw = halfW();
  const server = m.server();
  const second = m.serveNum === 2;
  const big = ballSpeed(m) > T.bigServe;
  const comes = server.depth === 2 || Math.abs(server.z + server.vz * 0.4) < HL - 2;
  const cross = -(Math.sign(plan.bx) || 1);
  const out = (x: number, d: number, clear: number, intent: Intent, pace?: number, spin?: number, kind: ShotKind = 'return'): Choice => ({ shot: { kind, ...target(side, x, d), clear, ...(pace !== undefined ? { pace } : {}), ...(spin !== undefined ? { spin } : {}) }, intent });
  const safe = clamp(hard, 0, SAFE.max);
  const deep = () => HL - 1.6 - (1 - s.risk) * 1.2 - rng.next() * 1.4 - safe * SAFE.deep;
  if (m.doubles) {
    const net = opps.find((o) => o !== server && Math.abs(o.z) < AT_NET + 0.5);
    // the lob over the server's partner at the net, now and then
    if (net && !big && rng.chance(s.lob * 0.12)) return out(-net.x * 0.4, HL - 2 - rng.next() * 1.5, LOB.ret, 'lob', undefined, 0.6, 'lob');
    // cross-court, away from the net player, low if the server is coming in
    const x = cross * (2.2 + rng.next() * 1.8);
    if (comes) return out(x * 0.8, SERVICE + rng.next() * 1.5, 0.25 + rng.next() * 0.15, 'return', 1.05, 0.8);
    return out(x, deep(), 0.45 + rng.next() * 0.35, 'return', big ? 1.1 : 1, 0.5);
  }
  if (comes) return out(server.x + (rng.next() - 0.5) * 1.2 + cross * 0.8, SERVICE - 1 + rng.next() * 2, 0.2 + rng.next() * 0.15, 'pass', 1.0, 0.8);
  if (!second && big && rng.chance(T.blockBig + hard)) return out((rng.next() - 0.5) * 2.4, deep() - 0.3, 0.9 + rng.next() * 0.4, 'block', 1.15, 0.25);
  if (second && rng.chance(s.attack * T.attack2)) {
    const x = (rng.chance(0.5) ? cross : -cross) * (hw - 0.6 - (1 - s.risk) * 0.8 - rng.next() * 0.5);
    return out(x, deep() + 0.4, 0.4 + rng.next() * 0.3, 'putaway', 0.9, 0.55);
  }
  return out(rng.chance(0.65) ? cross * (1 + rng.next() * 2 - safe) : (rng.next() - 0.5) * 2, deep(), 0.6 + rng.next() * 0.45 + safe * SAFE.clear, 'return', 1, 0.45);
}

/**
 * Singles, the passing shot from the contact of `plan` past a player at the net at (ox, oz from the net): down the
 * line (the side the ball is on) or cross-court, whichever leaves more room as the ball gets to him; it is aimed to go
 * by him `gap` m to that side at his depth (the bolder, the wider), landing deep, or short and angled when a deep one
 * would have to land outside the sideline. u1…u4: dice (0 … 1). Returns the landing spot: x across, d from the net.
 */
export function passingShot(plan: Plan, ox: number, oz: number, s: Skill, u1: number, u2: number, u3: number, u4: number): { x: number; d: number; line: boolean } {
  const hw = halfW();
  const bx = plan.bx;
  const zp = Math.abs(plan.bz);
  const own = Math.sign(bx) || (ox > 0 ? -1 : 1);
  // the room on each side of him
  const roomLine = hw - own * ox;
  const roomCross = hw + own * ox;
  const line = u1 < clamp(0.5 + (roomLine - roomCross) * 0.25, 0.15, 0.85);
  const dir = line ? own : -own;
  const lim = hw - (0.3 + (1 - s.risk) * 0.5 + u2 * 0.3);
  // how far past him it goes at his depth (never beyond what the sideline allows there)
  const gap = TENNIS.gap + s.risk * 0.8 + u3 * 0.6;
  const want = clamp(ox + dir * gap, -lim, lim);
  // deep first: where it lands follows from where it must be at his depth (straight over the court)
  let d = HL - 1.2 - u4 * 1.8;
  let x = bx + ((want - bx) * (zp + d)) / (zp + oz);
  if (Math.abs(x) > lim) {
    // too wide to land deep: shorter and angled, landing on the line it dares
    x = dir * lim;
    const k = (want - bx) / (zp + oz);
    d = Math.abs(k) > 1e-3 ? clamp((x - bx) / k - zp, Math.max(oz + 0.8, 3.5), HL - 1.2) : HL - 1.5;
  }
  return { x, d, line };
}

/**
 * Singles: where a CPU player goes after their own shot (Controller.place; the spot across is Match.cover's, the
 * bisector). Depth: the server stays back, or serves and volleys (rush, mostly on a first serve); the returner stays
 * back (a chip-and-charge now and then); up at the net they stay up; from the back they come in behind an approach
 * (rush + approachIn), a put-away or a drop shot (rush × dropIn) or an attacking lob (rush), and stay back after a
 * rally ball, a defensive one or a passing shot.
 */
function placeSingles(m: Match, p: Player, s: Skill, intent: Intent | null, spec: ShotSpec): { depth: 0 | 1 | 2; x: number } {
  const rng = m.rng;
  const za = Math.abs(p.z);
  const rush = s.mover.netRush;
  let depth: 0 | 2 = 0;
  if (intent === 'serve') depth = rng.chance(rush * (m.serveNum === 1 ? 0.4 : 0.08)) ? 2 : 0;
  else if (intent === 'return' || intent === 'block') depth = spec.q > 0.85 && rng.chance(rush * 0.12) ? 2 : 0;
  else if (za < AT_NET || intent === 'volley') depth = 2;
  else if (intent === 'approach') depth = rng.chance(Math.min(1, rush + TENNIS.approachIn)) ? 2 : 0;
  else if (intent === 'putaway') depth = za < HL - 1 && rng.chance(0.4 + rush * 0.5) ? 2 : 0;
  else if (intent === 'drop') depth = rng.chance(rush * TENNIS.dropIn) ? 2 : 0;
  else if (intent === 'lob' && spec.kind === 'lob') depth = rng.chance(rush * 0.6) ? 2 : 0;
  return { depth, x: 0 };
}

/**
 * Doubles: the shot a sensible CPU player picks here. The open court is the widest gap (often the middle, between the
 * two); from the back the ball goes cross-court to the other back player, away from the one at the net, or over him
 * (the lob); against two at the net, low at their feet down the middle; at the net, the volley goes down the middle or
 * at the feet of the one at the net, and a ball that sits up is put away into the gap.
 */
function doublesShot(m: Match, p: Player, plan: Plan, s: Skill, hard: number): Choice {
  const r = m.rally!;
  const rng = m.rng;
  const side = p.side;
  const hw = halfW();
  const opps = m.players.filter((o) => o.team !== p.team);
  if (r.shots === 1) return returnShot(m, p, plan, s, hard, opps);
  const me = Math.abs(plan.fz);
  const meNet = me < AT_NET;
  const near = opps.filter((o) => Math.abs(o.z) < AT_NET + 0.8);
  const back = opps.filter((o) => Math.abs(o.z) >= AT_NET + 0.8);
  const up = clamp((plan.by - NET_C - 0.1) / 0.6, 0, 1);
  const cross = -(Math.sign(plan.bx) || 1);
  const out = (kind: ShotKind, x: number, d: number, clear: number, intent: Intent, pace?: number, spin?: number): Choice => ({ shot: { kind, ...target(side, x, d), clear, ...(pace !== undefined ? { pace } : {}), ...(spin !== undefined ? { spin } : {}) }, intent });
  const deep = () => HL - 1.4 - (1 - s.risk) * 1.2 - rng.next() * 1.3;
  // the gap between the two (or beside one pulled wide)
  const xs = opps.map((o) => o.x).sort((a, b) => a - b);
  const gaps: [number, number][] = [
    [-hw + 0.3, xs[0]],
    [xs[0], xs[1]],
    [xs[1], hw - 0.3],
  ];
  let g = gaps[1];
  for (const c of gaps) if (c[1] - c[0] > g[1] - g[0] + 0.4) g = c;
  const gapX = (g[0] + g[1]) / 2;
  if (plan.overhead && (plan.volley || plan.by > 2.3)) {
    // a smash: into the gap, or at the feet of the one at the net
    const at = near.length && rng.chance(0.4) ? near[0].x : gapX;
    return out('smash', at + (rng.next() - 0.5) * 0.8, near.length ? 4.5 + rng.next() * 3 : deep(), 0.1, 'putaway', 0.78);
  }
  if (meNet) {
    if (up > 0 && rng.chance(Math.min(0.95, up * (s.attack + TENNIS.putAway) * TENNIS.putAwayMul))) return out('speedup', gapX + (rng.next() - 0.5) * 0.6, near.length ? 4 + rng.next() * 2.5 : deep(), 0.12, 'putaway', 0.85);
    // at the feet of the one at the net, or deep down the middle / cross-court to the one at the back
    if (near.length && rng.chance(0.55)) return out('speedup', near[0].x + (rng.next() - 0.5) * 0.5, Math.abs(near[0].z) + 1 + rng.next() * 1.5, 0.12, 'volley', 0.9);
    if (rng.chance(s.touch * 0.15)) return out('dink', gapX, 2.2 + rng.next() * 1.5, 0.15, 'volley');
    return out('speedup', back.length ? back[0].x * 0.5 + gapX * 0.5 : (rng.next() - 0.5) * 2, deep(), 0.3, 'volley', 1.0);
  }
  if (near.length === 2) {
    // both at the net: low at their feet down the middle, or a lob over them
    if (rng.chance(s.lob * 0.3 * clamp(1 - hard, 0.3, 1))) return out('lob', gapX, HL - 1.6 - rng.next() * 1.4, LOB.atk, 'lob', undefined, 0.7);
    return out('drive', gapX + (rng.next() - 0.5) * 0.6, SERVICE - 1 + rng.next() * 1.5, 0.15 + rng.next() * 0.1, 'pass', 1.0, 0.9);
  }
  if (near.length === 1 && back.length === 1) {
    // one up, one back: cross-court to the one at the back, away from the one at the net; the lob over the net player;
    // down the alley past him now and then (a gamble)
    const net = near[0];
    if (rng.chance(s.lob * 0.12)) return out('lob', -net.x * 0.5, HL - 1.5 - rng.next() * 1.5, LOB.atk, 'lob', undefined, 0.7);
    if (rng.chance(s.risk * 0.12) && plan.by > 0.6) return out('drive', Math.sign(net.x || 1) * (hw - 0.45), deep(), 0.25, 'pass', 0.9, 0.75);
    const x = back[0].x + (rng.next() - 0.5) * 1.6;
    const awayFromNet = Math.abs(x - net.x) < 2.2 ? net.x - Math.sign(net.x - back[0].x || 1) * 2.4 : x;
    return out('drive', awayFromNet, deep(), rallyClear(m, s) * 0.85, 'rally', 1, driveSpin(s));
  }
  // both back: deep down the middle, now and then a drop shot or an approach
  if (me < HL - TENNIS.short && plan.by > TENNIS.shortH && rng.chance(0.4 + s.mover.netRush * 0.4)) return out('drive', (rng.chance(0.5) ? cross : -cross) * (hw - 1.4), deep(), 0.45, 'approach', 0.95, driveSpin(s));
  if (rng.chance(s.touch * 0.06)) return out('drop', gapX, 2 + rng.next() * 1.5, 0.25, 'drop');
  return out('drive', gapX * 0.6 + cross * 0.8, deep(), rallyClear(m, s), 'rally', 1, driveSpin(s));
}

/** The rivals of the ladder, from the first round to the final (singles), and the pairs' players (doubles). */
export interface Rival {
  id: string;
  name: string;
  /** i18n key of the one-line description */
  tag: string;
  look: number;
  /** the card: attributes 0 … 99 (attributes.ts, overall()), shown on the player card; the skill comes from it */
  attrs: Attributes;
  skill: Skill;
}

/**
 * The players' cards and styles (skillFrom turns them into the game). In the manner of the unlicensed PES, each one
 * sounds like a touring pro (docs/tenis/contrato.md): Kasper Rud (heavy topspin from the back, better on clay), Álex de
 * Miñor (runs everything down, little power), Danil Medvédiev (flat and deep, a big serve, returns from far back), Yannik
 * Siner (hits early and hard), Carlos Alcarás (does it all: power, drop shots, the net). The human runs at HUMAN_SPEED
 * and reaches LUNGE with the racket.
 */
export const RIVAL_ATTRS: Record<string, Attributes> = {
  paco: { pot: 66, con: 64, vel: 62, ref: 60, saq: 64, red: 56, tq: 69 },
  lola: { pot: 60, con: 74, vel: 92, ref: 84, saq: 62, red: 66, tq: 66 },
  bruno: { pot: 82, con: 86, vel: 78, ref: 84, saq: 88, red: 66, tq: 76 },
  nuria: { pot: 92, con: 90, vel: 84, ref: 90, saq: 80, red: 72, tq: 73 },
  reina: { pot: 92, con: 87, vel: 93, ref: 89, saq: 84, red: 86, tq: 85 },
};
export const RIVAL_STYLES: Record<string, Style> = {
  paco: { touch: 0.3, attack: 0.3, lob: 0.45, risk: 0.18, netRush: 0.12, serveDelay: 1.3, angle: 0.45, slice: 0.2, topspin: 0.95, flat: 0.3 },
  lola: { touch: 0.4, attack: 0.35, lob: 0.5, risk: 0.22, netRush: 0.25, serveDelay: 1.0, angle: 0.6, slice: 0.35, topspin: 0.6, flat: 0.35 },
  bruno: { touch: 0.45, attack: 0.55, lob: 0.35, risk: 0.32, netRush: 0.2, serveDelay: 1.1, angle: 0.75, slice: 0.15, topspin: 0.3, flat: 0.75, retBack: 1.3 },
  nuria: { touch: 0.35, attack: 0.8, lob: 0.3, risk: 0.38, netRush: 0.3, serveDelay: 0.9, angle: 0.8, slice: 0.12, topspin: 0.6, flat: 0.6 },
  reina: { touch: 0.85, attack: 0.82, lob: 0.5, risk: 0.45, netRush: 0.5, serveDelay: 0.9, angle: 0.9, slice: 0.35, topspin: 0.75, flat: 0.55 },
};
export const SINGLES_SKILLS: Record<string, Skill> = Object.fromEntries(Object.keys(RIVAL_ATTRS).map((id) => [id, skillFrom(RIVAL_ATTRS[id], RIVAL_STYLES[id])]));
/**
 * Doubles: the same players come to the net much more (the doubles game is won there), slice and lob a little more,
 * and serve and volley behind the first serve. Their contact is `DOUBLES_Q` less clean than in singles (measured: with
 * two of them covering the court, the singles quality made the last pair unbeatable; docs/tenis/notas-01-simulacion.md).
 */
export const DOUBLES_Q = 0.035;
const doublesStyle = (st: Style): Style => ({ ...st, netRush: clamp(0.4 + st.netRush * 0.6, 0, 1), lob: st.lob * 1.1, slice: (st.slice ?? 0.3) + 0.1 });
const doublesSkill = (a: Attributes, st: Style): Skill => {
  const s = skillFrom(a, doublesStyle(st));
  return { ...s, q: s.q - DOUBLES_Q };
};
export const DOUBLES_SKILLS: Record<string, Skill> = Object.fromEntries(Object.keys(RIVAL_ATTRS).map((id) => [id, doublesSkill(RIVAL_ATTRS[id], RIVAL_STYLES[id])]));

/** The singles rivals (first names in the manner of the PES; the surnames are in tour.ts), the ladder's order. */
export const RIVALS: Rival[] = [
  { id: 'paco', name: 'Kasper', tag: 'rival.paco', look: 1, attrs: RIVAL_ATTRS.paco, skill: SINGLES_SKILLS.paco },
  { id: 'lola', name: 'Álex', tag: 'rival.lola', look: 2, attrs: RIVAL_ATTRS.lola, skill: SINGLES_SKILLS.lola },
  { id: 'bruno', name: 'Danil', tag: 'rival.bruno', look: 3, attrs: RIVAL_ATTRS.bruno, skill: SINGLES_SKILLS.bruno },
  { id: 'nuria', name: 'Yannik', tag: 'rival.nuria', look: 4, attrs: RIVAL_ATTRS.nuria, skill: SINGLES_SKILLS.nuria },
  { id: 'reina', name: 'Carlos', tag: 'rival.reina', look: 5, attrs: RIVAL_ATTRS.reina, skill: SINGLES_SKILLS.reina },
];

/**
 * The human's doubles partner: Marcel Granoyers, a doubles specialist (overall 78): sharp at the net and on the return,
 * not much power or pace; he plays the ad court and goes up and back with the game.
 */
export const PARTNER_ATTRS: Attributes = { pot: 70, con: 85, vel: 68, ref: 88, saq: 78, red: 90, tq: 69 };
export const PARTNER: Rival = {
  id: 'marta',
  name: 'Marcel',
  tag: 'partner.marta',
  look: 6,
  attrs: PARTNER_ATTRS,
  skill: skillFrom(PARTNER_ATTRS, { touch: 0.6, attack: 0.55, lob: 0.5, risk: 0.28, netRush: 0.9, serveDelay: 1.0, angle: 0.75, slice: 0.45, topspin: 0.5, flat: 0.45 }),
};

/** The doubles pairs, two rivals of the ladder each (with their doubles game), from the first round to the final. */
export interface Pair {
  id: string;
  a: Rival;
  b: Rival;
  /** i18n key of the one-line description */
  tag: string;
}
/** a rival with his doubles game (the same id, name and card: kits, names and cards are looked up by id) */
const dv = (id: string): Rival => {
  const r = RIVALS.find((x) => x.id === id)!;
  return { ...r, skill: DOUBLES_SKILLS[id] };
};
export const PAIRS: Pair[] = [
  { id: 'paco-lola', a: dv('paco'), b: dv('lola'), tag: 'pair.pacoLola' },
  { id: 'lola-bruno', a: dv('lola'), b: dv('bruno'), tag: 'pair.lolaBruno' },
  { id: 'bruno-nuria', a: dv('bruno'), b: dv('nuria'), tag: 'pair.brunoNuria' },
  { id: 'nuria-reina', a: dv('nuria'), b: dv('reina'), tag: 'pair.nuriaReina' },
];

/** The human's movement (Mover): he picks his own depth; netRush is what the partner reads. */
export const HUMAN_MOVER: Mover = { netRush: 0.5, misjudge: 0, lunge: 0 };
/** the human's top speed (m/s) from his card (humanSkill: 5.7 at vel 76) */
export const HUMAN_SPEED = humanSkill(HUMAN_ATTRS).speed;
export const HUMAN_REACTION = 0.1;

/**
 * The shot the human's player plays alone when the thumb gave no aim (assisted swing): a safe ball, never an attack on
 * a ball that does not ask for it. The return: deep down the middle. A ball over the head: a controlled smash deep down
 * the middle. Up at the net: a volley deep down the middle. From the back: a solid ball deep down the middle (high over
 * the net); against a player at the net, a lob over him. It gets the ball back, nothing more: aiming beats it.
 */
export function autoShot(m: Match, p: Player, plan: Plan): Omit<ShotSpec, 'q' | 'timing'> {
  const r = m.rally;
  const rng = m.rng;
  const opps = m.players.filter((o) => o.team !== p.team);
  const oppNet = opps.every((o) => Math.abs(o.z) < AT_NET + 0.5);
  const meNet = Math.abs(plan.fz) < AT_NET;
  const x = (rng.next() - 0.5) * 2;
  if (r && r.shots === 1) return { kind: 'return', ...target(p.side, x, HL - 3 - rng.next() * 1.5), clear: 0.8 };
  if (plan.overhead && (plan.volley || plan.by > 2.3)) return { kind: 'smash', ...target(p.side, x, HL - 2.5 - rng.next() * 1.5), clear: 0.45, pace: 1.0 };
  if (meNet) return { kind: 'speedup', ...target(p.side, x, HL - 3 - rng.next() * 1.5), clear: 0.35, pace: 1.1 };
  if (oppNet) return { kind: 'lob', ...target(p.side, x, HL - 2.4 - rng.next() * 1.2), clear: LOB.atk + 0.6 };
  return { kind: 'auto', ...target(p.side, x, HL - 2.4 - rng.next() * 1.4), clear: 1.1 + rng.next() * 0.3, spin: 0.55 };
}

/**
 * Shot type from where the human aims (the target d m from the net):
 *  · closer than AIM_SOFT: a soft ball: at the net a drop volley, from the back a drop shot;
 *  · past the baseline (`lob`): a lob;
 *  · otherwise a drive (a volley at the net); a ball over the head: a smash (out of the air, or a lob that bounced high);
 *  · `slice` (a down-flick, Shift+F): a slice from the back (a block volley at the net).
 * `attack` (a flick, F, the right button): a hard volley, a hard drive, or over the head a hard smash.
 */
export function kindForAim(m: Match, p: Player, plan: Plan, d: number, lob: boolean, attack = false, _bend = 0, opts: { power?: number; slice?: boolean } = {}): { kind: ShotKind; clear: number; pace?: number; spin?: number } {
  const r = m.rally;
  if (!r) return { kind: 'serve', clear: 0.3 };
  const meNet = Math.abs(plan.fz) < AT_NET;
  const smash = plan.overhead && (plan.volley || plan.by > 2.3);
  if (attack && !lob) {
    if (smash) return { kind: 'smash', clear: ATTACK.smashClear, pace: ATTACK.smashPace };
    if (meNet || plan.volley) return { kind: 'speedup', clear: ATTACK.clear, pace: ATTACK.pace };
    return { kind: 'drive', clear: ATTACK.driveClear, pace: ATTACK.drivePace, spin: 0.45 };
  }
  if (r.shots === 1) {
    if (lob) return { kind: 'lob', clear: LOB.ret };
    if (opts.slice) return { kind: 'slice', clear: 0.45, pace: TENNIS.slicePace };
    return { kind: 'return', clear: d < AIM_SOFT ? 0.35 : 0.7 };
  }
  if (smash && !lob) return { kind: 'smash', clear: 0.35, pace: 0.95 };
  if (lob) return { kind: 'lob', clear: LOB.atk + 0.8 };
  if (d < AIM_SOFT) return meNet ? { kind: 'dink', clear: 0.16 } : { kind: 'drop', clear: 0.28 };
  if (opts.slice) return meNet ? { kind: 'speedup', clear: 0.3, pace: 1.15, spin: -0.4 } : { kind: 'slice', clear: 0.4, pace: TENNIS.slicePace };
  return meNet ? { kind: 'speedup', clear: 0.3, pace: 1.05 } : { kind: 'drive', clear: 0.95 };
}
/** the human's aim: closer to the net than this (m) is a soft ball (a drop shot, a drop volley) */
export const AIM_SOFT = 4.5;

/**
 * The human's attack (a flick, F or the right button): a flat, hard ball, low over the net, or over the head a hard
 * smash. Where it goes:
 *  · not aimed (the drag before the stroke under `aimed` px): into the open court, away from the nearest opponent,
 *    deep (a volley: short and angled when the other side is at the net);
 *  · aimed: where the drag pointed;
 *  · the stroke's angle bends it across: `bend` m for a stroke 45° off straight up (world x, from the hitter's view).
 * A low ball is a gamble (attackRisk × `lowRisk`); an attack let go outside the golden window is `rough` rougher.
 */
export const ATTACK = { aimed: 20, bend: 1.6, clear: 0.12, pace: 0.85, smashClear: 0.08, smashPace: 0.72, driveClear: 0.42, drivePace: 0.82, lowRisk: 3, rough: 0.04 };
export function attackTarget(m: Match, p: Player, plan: Plan, aimed: { x: number; z: number } | null, bend: number): { tx: number; tz: number } {
  const hw = halfW();
  const opps = m.players.filter((o) => o.team !== p.team);
  const opp = opps.reduce((a, b) => (Math.abs(b.x - plan.bx) < Math.abs(a.x - plan.bx) ? b : a));
  let x: number;
  let d: number;
  if (aimed) {
    x = aimed.x + bend;
    d = Math.abs(aimed.z);
  } else {
    const way = Math.abs(opp.x) > 0.4 ? -Math.sign(opp.x) : Math.sign(bend) || (m.rng.chance(0.5) ? 1 : -1);
    x = way * (hw - 0.9) + bend;
    const net = Math.abs(plan.fz) < AT_NET;
    d = net && Math.abs(opp.z) < AT_NET + 1 ? 4.5 : HL - 1.8;
  }
  return { tx: clamp(x, -hw + 0.2, hw - 0.2), tz: -p.side * clamp(d, 1, HL - 0.3) };
}

/**
 * The human's tap: a block: at the net a soft volley that dies `netDepth` m from the net (± `spread`); from the back a
 * chip, a short sliced swing deep down the middle (`backDepth` m from the net), the answer to a big serve or a ball at
 * full stretch. Timed in the golden window it is clean (it takes the pace off); `good` s either side of the window it is
 * a plain block; further off, a poor one (worse than the automatic shot). See HumanController.
 */
export const BLOCK = { netDepth: 3.0, backDepth: 8.8, spread: 1.2, x: 0.4, clear: 0.18, clearBack: 0.55, good: 0.12, perfectMin: 0.84, soak: 0.6, miss: 0.04 };
export function blockShot(m: Match, p: Player, plan: Plan): Omit<ShotSpec, 'q' | 'timing'> {
  const atNet = Math.abs(plan.fz) < AT_NET;
  const x = plan.bx * BLOCK.x * (atNet ? 1 : -0.5) + (m.rng.next() - 0.5) * 2;
  if (atNet) return { kind: 'dink', ...target(p.side, x, BLOCK.netDepth + m.rng.next() * BLOCK.spread), clear: BLOCK.clear };
  return { kind: 'slice', ...target(p.side, x, BLOCK.backDepth + m.rng.next() * BLOCK.spread), clear: BLOCK.clearBack, pace: TENNIS.slicePace };
}

/**
 * A ball the player can attack: met at least `over` m above the tape within `near` m of the net (further back it has
 * to come `slope` m higher per metre: a short ball at the service line at the waist is one, up to `far` m from the
 * net; a smash up to `overhead` m), from the second shot on, not one going out, and with time to set up the swing (the
 * awkwardness of the ball, difficulty, at most `hard`). The HUD lights it (the ring at the feet in orange, «¡Atácala!»);
 * the bots read it too.
 */
export const ATTACKABLE = { over: 0.15, near: AT_NET, slope: 0.1, far: 9.5, overhead: 9.0, hard: 0.35 };
export function attackable(m: Match, p: Player, plan: Plan | null): boolean {
  const r = m.rally;
  if (!plan || !r || r.shots < 2 || plan.oops || plan.out) return false;
  const fz = Math.abs(plan.fz);
  if (plan.overhead && (plan.volley || plan.by > 2.3)) {
    if (fz > ATTACKABLE.overhead) return false;
  } else if (fz > ATTACKABLE.far || plan.by < NET_C + ATTACKABLE.over + Math.max(0, fz - ATTACKABLE.near) * ATTACKABLE.slope) return false;
  return difficulty(m, p, { ...plan, stretch: 0 }) <= ATTACKABLE.hard;
}

/**
 * The ball coming at `p` is an attack: a smash, or a hard volley or drive faster than `pace` m/s (along the court) at a
 * player up at the net (within `near` m). The answer is a block (a tap in the golden window).
 */
export const UNDER_ATTACK = { pace: 22, near: AT_NET + 0.5 };
export function underAttack(m: Match, p: Player): boolean {
  const r = m.rally;
  const lh = r?.last && r.last.team !== p.team ? r.last.lastHit : null;
  if (!lh || (r?.bounces ?? 0) > 0) return false;
  if (lh.kind === 'smash') return Math.abs(p.z) < HL - 2;
  return (lh.kind === 'speedup' || lh.kind === 'drive' || lh.kind === 'return') && Math.abs(p.z) < UNDER_ATTACK.near && ballSpeed(m) > UNDER_ATTACK.pace;
}

/**
 * For the HUD and the bots: what the coming ball asks of `p` at the contact `plan` (the circle, or the contact in
 * reach): 'block' (an attack coming at him: tap) , 'attack' (attackable: flick it) or null.
 */
export function ballCue(m: Match, p: Player, plan: Plan | null): 'attack' | 'block' | null {
  if (m.phase !== 'rally' || !plan || plan.oops || plan.out) return null;
  const r = m.rally;
  if (!r?.last || r.last.team === p.team) return null;
  const raw: Cue = underAttack(m, p) && plan.volley ? 'block' : attackable(m, p, plan) ? 'attack' : null;
  // one decision per ball (CUE): it may change while there is time to show it, then it stays
  const key = `${m.stats.rallies}:${r.shots}`;
  let mm = cues.get(m);
  if (!mm) cues.set(m, (mm = new Map()));
  const c = mm.get(p.id);
  if (!c || c.key !== key) {
    mm.set(p.id, { key, cue: raw, block: raw === 'block' });
    return raw;
  }
  if (raw !== c.cue && plan.t - m.t > CUE.settle) {
    c.cue = raw;
    if (raw === 'block') c.block = true;
  }
  return c.cue;
}
type Cue = 'attack' | 'block' | null;
/**
 * The cue is one decision per ball (ballCue): taken from the coming contact when the ball is struck, it can still
 * change while more than `settle` s are left before the contact (the circle moved to another contact), never later.
 */
export const CUE = { settle: 0.4 };
const cues = new WeakMap<Match, Map<number, { key: string; cue: Cue; block: boolean }>>();
/** The ball coming now at player `pid` was cued as a block at some point (a quiet press on it is still a block). */
export function cuedBlock(m: Match, pid: number): boolean {
  const c = cues.get(m)?.get(pid);
  return !!c && c.block && c.key === `${m.stats.rallies}:${m.rally?.shots ?? -1}`;
}

/**
 * The human's lob, from how far past the baseline he drags (f: 0 … 1): from a high, safe one that lands around the
 * service line (it gets smashed) to a lower one that lands deep (a weapon over a player at the net; too low it gets
 * volleyed, too deep it goes out).
 */
export function lobShape(f: number): { depth: number; clear: number } {
  const k = clamp(f, 0, 1);
  return { depth: HL - 3.4 + k * 2.6, clear: LOB.high + 0.5 - k * 2.4 };
}

/**
 * Contact quality of the human's swing: released in the golden window (before the awkwardness of the ball), aimed but
 * released outside it (assisted swing), and the automatic shot.
 */
export const Q_PERFECT = 0.9;
export const Q_AIMED = 0.84;
export const Q_AUTO = 0.78;

/** For the tools: the overall of a card (re-exported). */
export { overall };
