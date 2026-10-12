// The CPU players: how they serve, which shot they pick, how well they read the ball and how cleanly they hit it.
// Each rival is a Skill. Also the human's automatic shot and the aim mapping shared with the view.
//
// Padel doubles tactics (chooseShot): the pair that holds the net wins the point, so
//  · at the net: volleys deep to the corners or at the feet; a short angled volley when they are back; a ball that sits
//    up is put away; over the head, a bandeja (sliced, deep, keeps the net), a víbora (sliced, angled into the side
//    glass) or a remate (flat, hard; steep enough it goes out of the court, «por 3»), by skill and by how high it is;
//  · from the back against a pair at the net: the globo (the lob, the main way to take the net: the pair follows it in),
//    the chiquita (soft and low at the feet of the net player, then in), now and then a passing drive;
//  · from the back against a pair at the back: steady drives deep and down the middle (hard is pointless, the glass
//    gives it back) and, when the ball comes short, an approach and in to the net; a lob over the head now and then;
//  · the return of serve: low at the feet of the server coming in, or a lob over the net player.

import { HUMAN_ATTRS, type Attributes } from './attributes';
import { AT_NET, DEPTH_Z, HL, NET_C, SERVICE, W } from './court';
import type { Controller, Match, Mover } from './match';
import type { Plan, Player, ShotKind, ShotSpec, Special, Timing } from './types';

export { HUMAN_ATTRS };

export interface Skill {
  /** m/s */
  speed: number;
  /** s before they start moving */
  reaction: number;
  /** mean contact quality and its spread */
  q: number;
  qVar: number;
  /** 0 … 1: plays the soft game (chiquitas, dejadas, blocks) when it is the right shot */
  touch: number;
  /** 0 … 1: punishes a high ball (volley put-away, remate, víbora) */
  attack: number;
  /** 0 … 1: how readily they lob a pair at the net (the globo) */
  lob: number;
  /** aims closer to the glass and the lines (more winners, more errors) */
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
  /** 0 … 1: their appetite and gift for the remate «por 3» / «por 4» (0: never) */
  por?: number;
  /** 0 … 1: how readily they play a bajada off the back glass (and look for one when planning the contact) */
  wall?: number;
  /** 0 … 1: of the attacking overheads that are not remates, the share of víboras (the rest: bandejas) */
  vibora?: number;
  /** m: the highest ball they can meet over the head (the jump) */
  reachH?: number;
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
  /** víboras rather than bandejas when they attack over the head (default 0.55) */
  vibora?: number;
  /** appetite for the remate por 3 / por 4 on top of the card (default 1) */
  por?: number;
}

const lin = (v: number, a: number, b: number, ya: number, yb: number) => ya + ((v - a) / (b - a)) * (yb - ya);
/** a tendency scaled by the attribute behind it: 1 at 81, 0.86 at 56, 1.07 at 93 */
const tend = (v: number) => 0.55 + v / 180;

/**
 * THE mapping from a card (attributes 0 … 99) and a style to a CPU player's game. Every number of the card moves
 * something; the anchors are the 0.1 rivals (Paquito ≈ 55, Arturo ≈ 90), so the ladder kept its shape:
 *  · vel → speed (4.0 m/s at 55, 5.0 at 85, +0.033 a point) and, with ref, the lunge (0.4 … 0.75 m);
 *  · ref → reaction (0.34 s at 56, −4.4 ms a point), the first read of a fast ball (read: 0.30 → 0.08 m), how often
 *    they volley a ball going out (misjudge), and with con the poise (how much an awkward ball gets to them);
 *  · con → contact quality q (0.70 at 55, +0.0055 a point) and its spread qVar (0.15 → 0.08);
 *  · pot → power of the firm shots (0.5 at 75, ±0.006 a point) and, with rem, the remate por 3 / por 4 (por);
 *  · rem → the overheads' quality (attrQ), the attack tendency (with pot) and the reach over the head (2.75 … 2.95 m);
 *  · par → bajadas (wall: how readily) and the quality of every ball played off the glass (attrQ);
 *  · tq → the soft game: the touch and lob tendencies and the quality of chiquitas, dejadas and globos (attrQ).
 */
export function skillFrom(a: Attributes, st: Style): Skill {
  const c = (v: number, lo = 0, hi = 1) => clamp(v, lo, hi);
  const reflex = (a.con + a.ref) / 2;
  return {
    speed: lin(a.vel, 55, 85, 4.0, 5.0),
    reaction: c(lin(a.ref, 56, 90, 0.34, 0.19), 0.15, 0.4),
    q: c(lin(a.con, 55, 88, 0.7, 0.8815), 0.6, 0.92),
    qVar: c(lin(a.con, 55, 90, 0.15, 0.08), 0.06, 0.18),
    touch: c(st.touch * tend(a.tq)),
    attack: c(st.attack * tend((a.pot + a.rem) / 2)),
    lob: c(st.lob * tend(a.tq)),
    risk: c(st.risk * tend(a.pot)),
    mover: { netRush: st.netRush, misjudge: c(lin(a.ref, 56, 90, 0.25, 0.03), 0.02, 0.3), lunge: c(lin((a.vel + a.ref) / 2, 55.5, 89, 0.4, 0.75), 0.3, 0.85) },
    serveDelay: st.serveDelay,
    poise: c(lin(reflex, 56, 89, 1, 0.5), 0.45, 1),
    read: c(lin(a.ref, 56, 90, 0.3, 0.08), 0.04, 0.35),
    attrs: a,
    power: c(0.5 + (a.pot - 75) * 0.006, 0.25, 0.75),
    por: c(((a.pot + a.rem) / 2 - 72) / 22) * (st.por ?? 1),
    wall: c((a.par - 45) / 45),
    vibora: st.vibora ?? 0.55,
    reachH: 2.75 + a.rem * 0.002,
  };
}

/**
 * The human's card on his controller (HumanController): `speed` (m/s: 5.0 at vel 76, ±0.02 a point), `powerCap`
 * (how hard his hardest flick is: × 1 at pot 74), `q` (added to his contact qualities: ±0.002 a point of con off 72),
 * `reachH` (m, the highest overhead: 2.9 at rem 74) and, through attrQ, his overheads (rem), bajadas and balls off the
 * glass (par), soft game (tq) and volleys (ref). His reaction is his own thumb.
 */
export function humanSkill(a: Attributes = HUMAN_ATTRS): { speed: number; powerCap: number; q: number; reachH: number; wall: number } {
  return {
    speed: 5.0 + (a.vel - 76) * 0.02,
    powerCap: clamp(0.75 + a.pot * 0.0034, 0.85, 1.1),
    q: (a.con - 72) * 0.002,
    reachH: 2.75 + a.rem * 0.002,
    wall: clamp((a.par - 45) / 45, 0, 1),
  };
}

/**
 * How a shot's own attribute moves its contact quality, against the player's control (con): `k` per point. Overheads
 * ride on rem, a bajada and any ball played off the glass on par, the soft game on tq, volleys at the net on ref (with
 * con). Paquito's walls (par 72) are better than his control (56); Alejandro's remates (92) better than his (82).
 */
export const ATTR_Q = { k: 0.0025 };
export function attrQ(a: Attributes | undefined, kind: ShotKind, plan: Plan | null): number {
  if (!a) return 0;
  let v = a.con;
  if (kind === 'smash' || kind === 'bandeja' || kind === 'vibora') v = a.rem;
  else if (kind === 'bajada') v = a.par;
  else if (kind === 'dink' || kind === 'drop' || kind === 'lob') v = plan?.volley && Math.abs(plan.fz) < AT_NET ? (a.tq + a.ref) / 2 : a.tq;
  else if (plan?.wall) v = a.par;
  else if (plan?.volley && Math.abs(plan.fz) < AT_NET) v = (a.con + a.ref) / 2;
  return (v - a.con) * ATTR_Q.k;
}

/**
 * The power model (Match.launch): ShotSpec.power 0 … 1, 0.5 neutral. Harder is faster and flatter, and wilder:
 *  · pace × (1 − (power − 0.5) × `pace`): power 1 flies 18 % sooner, a placed ball (0.3) 7 % later;
 *  · a firm shot's height over the tape × (1 − (power − 0.5) × `clear`): flatter when hit harder (more net), higher
 *    and safer when placed;
 *  · the scatter of the target × (1 + (power − 0.5) × `spread`) above 0.5, × (1 − (0.5 − power) × `calm`) below;
 *  · soft shots (chiquita, dejada, globo) feel it `soft` as much (a placed globo against a quicker, flatter one).
 * The shanks of hard swings at awkward balls are the controllers' (powerShank).
 */
export const POWER = { pace: 0.36, clear: 0.5, spread: 0.9, calm: 0.6, soft: 0.4, shank: 0.3 };
/**
 * Extra chance of a shank from swinging hard at an awkward ball: power over 0.6 × how awkward it was (`hard`, the
 * difficulty), × POWER.shank. A clean ball hit hard is fine; a ball dug out of the corner hit hard is not.
 */
export function powerShank(power: number, hard: number): number {
  return Math.max(0, power - 0.6) * clamp(hard / 0.4, 0, 1.5) * POWER.shank;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Where on the receiver's half a target is: d = distance from the net, x across. */
function target(side: number, x: number, d: number) {
  return { tx: clamp(x, -W / 2 + 0.3, W / 2 - 0.3), tz: -side * clamp(d, 0.6, HL - 0.3) };
}

/** Speed (m/s, along the court) of the ball in flight right now. */
function ballSpeed(m: Match): number {
  const v = m.ballVel();
  return v ? Math.hypot(v.x, v.z) : 0;
}

/**
 * The kind of ball the opponent sent, as the receiver sees it when it leaves the paddle: hard / soft / lob, at the
 * body, to one side or wide, low (at the feet) or not. The same key over and over is a pattern the AI picks up.
 */
function zoneOf(m: Match, p: Player, plan: Plan): string {
  const k = m.rally?.last?.lastHit?.kind ?? 'serve';
  const cls = k === 'lob' ? 'lob' : SOFT_KINDS.has(k) ? 'soft' : 'hard';
  const dx = (plan.bx - p.x) * p.side;
  const lat = Math.abs(dx) < 0.7 ? 'body' : `${Math.abs(dx) < 1.7 ? 'side' : 'wide'}${dx > 0 ? 'R' : 'L'}`;
  return `${cls}:${lat}:${plan.by < 0.5 ? 'low' : plan.by > 1.2 ? 'high' : 'mid'}`;
}
const SOFT_KINDS = new Set<ShotKind>(['dink', 'drop', 'auto']);

export class AIController implements Controller {
  readonly mover: Mover;
  constructor(readonly skill: Skill) {
    this.mover = skill.mover;
  }
  /** the highest ball they meet over the head (the card's rem) */
  get reachH(): number {
    return this.skill.reachH ?? 2.9;
  }
  /** how much they wait for a bajada off the back glass (the card's par) */
  get bajada(): number {
    return this.skill.wall ?? 0;
  }

  private waitUntil = -1;
  /** the opponent's last balls at this player (zoneOf keys): a repeated one is read earlier and played calmer */
  private seen: string[] = [];
  /**
   * the read of the ball coming now: how familiar it is, how far off the first read was and how early it was fixed,
   * and how far from the net the player stood when it was struck (z0)
   */
  private cur: { plan: Plan; fam: number; off: number; lead: number; z0: number } | null = null;

  /**
   * The serve: underhand into the diagonal box, mostly deep (the bounce near the service line keeps the receiver back
   * and the ball comes off the back glass), to the T (down the middle, at the backhand), to the body, or wide into the
   * side glass (the bolder ones). A second serve is safer: shorter and more to the middle.
   */
  serve(m: Match, p: Player): ShotSpec | null {
    if (this.waitUntil < 0 || this.waitUntil < m.t - 30) this.waitUntil = m.t + this.skill.serveDelay * (0.8 + m.rng.next() * 0.5);
    if (m.t < this.waitUntil) return null;
    this.waitUntil = -1;
    const s = this.skill;
    const rng = m.rng;
    const half = -m.serveX(p.team);
    const second = m.serveNum === 2;
    // how close to the service line they dare (the bolder, the closer; a second serve keeps a margin)
    const depth = SERVICE - 0.35 - (1 - s.risk) * 0.7 - rng.next() * 0.9 - (second ? 0.6 : 0);
    // x of the box: the T (the centre line), the body (the middle of the box) or wide to the side glass
    const u = rng.next();
    const wide = second ? 0.1 : 0.15 + s.risk * 0.35;
    const x = u < 0.45 ? 0.35 + rng.next() * 0.6 : u < 1 - wide ? 1.6 + rng.next() * 1.4 : 3.3 + rng.next() * 0.9 * (0.5 + s.risk);
    return this.roll(m, { kind: 'serve', ...target(p.side, half * x, depth), clear: (second ? 0.55 : 0.4) + rng.next() * 0.3, power: second ? 0.4 : clamp(s.power ?? 0.5, 0.4, 0.6) }, second ? 0 : 0.05);
  }

  /**
   * The first read of the coming ball (the match calls it when this player sets off for it). A fast or spinning ball
   * is misjudged by a few centimetres to a few decimetres (less by better players, less on a pattern seen before);
   * the read is fixed shortly before the contact, a little earlier by better players.
   */
  read(m: Match, p: Player, plan: Plan): { dx: number; dz: number; at: number } | null {
    const s = this.skill;
    const key = zoneOf(m, p, plan);
    const fam = Math.min(1, this.seen.filter((k) => k === key).length / 3);
    this.seen.push(key);
    if (this.seen.length > 6) this.seen.shift();
    this.cur = { plan, fam, off: 0, lead: 9, z0: Math.abs(p.z) };
    // a ball that will come back high off the back glass: the bajada (or the defence) is decided now, so the swing the
    // view prepares is the shot that comes (an awkward one is defended: bajadaChance)
    if (isBajada(plan) && (m.rally?.shots ?? 0) > 2) plan.bajada = m.rng.chance(bajadaChance(s, difficulty(m, p, plan) * (s.poise ?? 1)));
    const spin = Math.abs(m.rally?.seg.spin ?? 0);
    const tricky = clamp((ballSpeed(m) - 7) / 10, 0, 1.2) + spin * 0.4;
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
    // passed: a ball that went by and had to be chased back towards their own glass (a lob, a volley through them) is
    // played turning, on the run (RUN_BACK)
    // (a ball come back off the back glass gave them the time it took there: half of it)
    if (c) hard += clamp((Math.abs(plan.fz) - c.z0 - RUN_BACK.from) * RUN_BACK.per, 0, RUN_BACK.max) * (0.6 + 0.4 * poise) * (plan.wall === 'back' ? 0.5 : 1);
    let shot = chooseShot(m, p, plan, s, hard);
    let risk = attackRisk(shot.kind, plan) * poise;
    // A fast ball at the body or the feet, below the tape and with no time: the safe answer is a soft block (it takes
    // the pace off), not a full swing. Players with touch see it more often, and more so on a pattern.
    const r = m.rally;
    const avail = r?.last?.lastHit ? plan.t - r.last.lastHit.t : 9;
    const block = plan.volley && ballSpeed(m) > 12 && plan.by < NET_C + 0.2 && avail < 0.7 && !plan.overhead && (r?.shots ?? 0) > 2;
    if (block && shot.kind !== 'lob' && m.rng.chance(clamp(0.25 + s.touch * 0.5 + fam * 0.25, 0, 0.9))) {
      const atNet = Math.abs(plan.fz) < AT_NET;
      shot = {
        kind: atNet ? 'dink' : 'drop',
        ...target(p.side, (m.rng.next() - 0.5) * 2.4 - p.x * 0.3, (atNet ? 3.2 : 3.6) + m.rng.next() * 1.4),
        clear: 0.22 + (1 - s.touch) * 0.12 + m.rng.next() * 0.1,
      };
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
      risk = attackRisk(shot.kind, plan) * poise;
    }
    // how hard: their usual power on the firm shots (the card's pot), a notch more on an attack, placed on the soft ones
    if (shot.power === undefined) shot = { ...shot, power: cpuPower(s, shot.kind, plan) };
    const spec = this.roll(m, shot, hard + risk, plan);
    // the rally weighs on them (less on the calm ones, and less against a pattern they have already read)
    spec.pop = popOf(m, poise * (1 - 0.5 * fam));
    // beaten: a hard ball at them with no time (a remate, a volley at the body) now and then is not even touched
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
    const shank = shankOf(m, raw, Q_FLOOR);
    return { ...base, q, timing, late, power: base.power ?? s.power ?? 0.5, ...(shank > 0 ? { shank } : {}) };
  }
}

/**
 * CPU players beaten by the pace: of the lack of time on a ball (rushed: a hard ball, a volley at the body, a remate)
 * above `from`, `k` per unit is the chance the paddle never meets it (ShotSpec.whiff: it goes past, a winner unless the
 * partner saves it), at most `max`; quicker reactions (the card's ref) are beaten less (`react` × reaction / 0.25).
 * Without it every hard ball came back or went into the net: too few winners (19 % of the points, real padel 30–40 %).
 */
export const WHIFF = { from: 0.18, k: 0.8, max: 0.35, react: 1 };
function whiffOf(rush: number, s: Skill): number {
  return clamp((rush - WHIFF.from) * WHIFF.k * (1 - WHIFF.react + (WHIFF.react * s.reaction) / 0.25), 0, WHIFF.max);
}

/**
 * A CPU shot's power (ShotSpec.power) when the choice did not set one: placed on the soft game, their usual power
 * (Skill.power, from pot) on the firm shots, a notch more (`attack`) on a put-away: a remate, a víbora, a volley or a
 * drive from above the tape, a bajada.
 */
export const CPU_POWER = { soft: 0.35, lob: 0.45, attack: 0.18, bandeja: -0.1 };
function cpuPower(s: Skill, kind: ShotKind, plan: Plan): number {
  const base = s.power ?? 0.5;
  if (kind === 'dink' || kind === 'drop') return CPU_POWER.soft;
  if (kind === 'lob') return CPU_POWER.lob;
  if (kind === 'serve' || kind === 'return') return base;
  if (kind === 'bandeja') return clamp(base + CPU_POWER.bandeja, 0, 1);
  const high = plan.by > NET_C + 0.15;
  if (kind === 'smash' || kind === 'vibora' || kind === 'bajada' || ((kind === 'speedup' || kind === 'drive') && high)) return clamp(base + CPU_POWER.attack, 0, 1);
  return base;
}

/**
 * CPU players chased back: a ball met more than `from` m further from the net than where they stood when it was struck
 * (a lob over them, a volley through the pair) is `per` per metre harder, at most `max`. In padel being passed means
 * turning and running to the back glass: the reply is often a defensive lob or an error.
 */
export const RUN_BACK = { from: 2, per: 0.09, max: 0.4 };

/** the lowest contact quality of a CPU swing (a human's: Q_FLOOR_HUMAN) */
export const Q_FLOOR = 0.15;
export const Q_FLOOR_HUMAN = 0.2;
/**
 * A ball too awkward to play at all: below `margin` over the contact quality floor, what is left (`raw`: the quality
 * it would have had) becomes the chance of a shank, `k` per unit, at most `max`: into the net or straight into the
 * glass (Match.launch). A volley at the feet with no time, a ball dug out of the corner, are then often an error, not
 * one more block at the floor that keeps the exchange going. The human's margin is smaller (`human`): his timing
 * (the golden ring) already decides most of a contact.
 */
export const SHANK = { margin: 0.25, human: 0.1, k: 1.4, max: 0.7 };
export function shankOf(_m: Match, raw: number, floor: number, margin = SHANK.margin): number {
  return clamp((floor + margin - raw) * SHANK.k, 0, SHANK.max);
}

/**
 * The automatic shot read by the CPU (AIController.hit): from the `from`-th in a row at the same player, the chance of
 * attacking it is base + attack × the player's attack: a risky attack that often goes wrong (attackRisk), so the
 * exchange ends either way.
 */
export const AUTO_PUNISH = { from: 3, base: 0.1, attack: 0.5 };

/**
 * An attack on a ball the player saw coming, away from the opponent: to the open side, past their reach (a remate if
 * it is overhead, a volley up at the net, a drive from further back).
 */
function punish(m: Match, p: Player, plan: Plan, s: Skill): Omit<ShotSpec, 'q' | 'timing'> {
  const rng = m.rng;
  const opps = m.players.filter((o) => o.team !== p.team);
  const opp = opps[rng.chance(0.5) ? 0 : 1];
  const way = Math.abs(opp.x) > 0.3 ? -Math.sign(opp.x) : rng.chance(0.5) ? 1 : -1;
  const x = opp.x + way * (1.4 + s.risk * 0.6 + rng.next() * 0.6);
  if (plan.overhead) return { kind: 'smash', ...target(p.side, x, Math.abs(opp.z) + 1.0 + rng.next() * 2), clear: 0.1, pace: 0.8 };
  const d = Math.abs(opp.z) + 0.6 + rng.next() * 1.6;
  return { kind: Math.abs(plan.fz) < AT_NET ? 'speedup' : 'drive', ...target(p.side, x, d), clear: 0.14, pace: 0.9 };
}

/**
 * Long rallies: the pressure builds up from the `from`-th shot, `per` shot. It goes into how likely a shot is to sit
 * up (ShotSpec.pop, × `pop`: high and short, a ball to attack) and, × `contact`, into the contact itself
 * (difficulty): in padel most points end in an error, more so the longer the rally.
 */
export const PRESSURE = { from: 3, per: 0.06, contact: 0.6, pop: 0.5 };
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
 * The part of the difficulty that is lack of time: a hard-hit ball (more so hit down from above, before it bounces),
 * little time to react (a volley at the body, a remate).
 */
function rushed(m: Match, plan: Plan): number {
  let d = clamp((ballSpeed(m) - 10) / 10, 0, 1.2) * 0.15;
  const r = m.rally;
  if (r && r.bounces === 0) d += clamp(r.seg.y - 1.0, 0, 1) * 0.12;
  const last = r?.last?.lastHit;
  if (last) {
    const avail = plan.t - last.t;
    if (avail < 0.6) d += (0.6 - avail) * 1.1;
    if (avail < 0.45) d += (0.45 - avail) * 1.6;
  }
  // chased back by a lob: played on the run, the ball over the shoulder (an overhead from deep is no put-away)
  // (a lob come back off the back glass gave them the time it took there: half of it)
  if (last?.kind === 'lob') d += (plan.overhead ? clamp((Math.abs(plan.fz) - 5.5) * 0.15, 0, 0.4) : clamp((Math.abs(plan.fz) - 6) * 0.08, 0, 0.3)) * (plan.wall === 'back' ? 0.5 : 1);
  return d;
}

/** A volley met below `below` m is `per` per metre of it harder (the ball has to be lifted over the net). */
export const LOW_VOLLEY = { below: 0.9, per: 0.6 };

/** How hard the incoming ball is to play well (0 = sitting up nicely). */
export function difficulty(m: Match, p: Player, plan: Plan): number {
  let d = rushed(m, plan);
  if (plan.by < 0.35) d += 0.12;
  // a volley at the feet (below the tape) has to be lifted: the low volley is the hard one
  if (plan.volley && plan.by < LOW_VOLLEY.below) d += (LOW_VOLLEY.below - plan.by) * LOW_VOLLEY.per;
  if (plan.hand === -1) d += 0.04;
  // a ball close to the glass (coming off it, or into the corner) cramps the swing
  const gx = W / 2 - Math.abs(plan.bx);
  const gz = HL - Math.abs(plan.bz);
  if (gx < 0.8) d += (0.8 - gx) * 0.12;
  if (gz < 1.0) d += (1.0 - gz) * 0.1;
  // long rallies: a little of the pressure gets into the contact (most of it makes the ball sit up, see pressure)
  d += pressure(m) * PRESSURE.contact;
  // reaching for it at full stretch
  const s = plan.stretch ?? 0;
  if (!p.human) d += s * s * 0.18;
  return d;
}

/**
 * Hitting hard from below the tape is a gamble, the more so the closer to the net (from the back the ball has room to
 * rise and come down): extra difficulty for an attack off a low ball.
 */
export function attackRisk(kind: ShotKind, plan: Plan): number {
  if ((kind !== 'speedup' && kind !== 'drive') || plan.by >= NET_C) return 0;
  const near = clamp((7 - Math.abs(plan.fz)) / 4, 0.25, 1);
  return (NET_C - plan.by) * (kind === 'speedup' ? 0.6 : 0.5) * near;
}

/**
 * Which of the two opponents to play at. The one left behind (back while the partner is up) has to hit up from the
 * feet; otherwise usually the weaker one (slower feet), sometimes either.
 */
function pickOpp(m: Match, opps: Player[]): Player {
  const [a, b] = opps;
  const da = Math.abs(a.z);
  const db = Math.abs(b.z);
  if (Math.abs(da - db) > 2) return da > db ? a : b;
  if (Math.abs(a.speed - b.speed) > 0.1 && m.rng.chance(0.6)) return a.speed < b.speed ? a : b;
  return m.rng.chance(0.5) ? a : b;
}

/** The open court, the middle of the widest gap (between the two, or beside one pulled wide). */
function gapX(m: Match, opps: Player[], s: Skill): number {
  const e = W / 2 - 0.4;
  const [x1, x2] = opps.map((o) => o.x).sort((a, b) => a - b);
  const gaps: [number, number][] = [
    [-e, x1],
    [x1, x2],
    [x2, e],
  ];
  let g = gaps[1];
  for (const c of gaps) if (c[1] - c[0] > g[1] - g[0] + 0.3) g = c;
  const w = Math.max(0, g[1] - g[0]);
  return (g[0] + g[1]) / 2 + (m.rng.next() - 0.5) * Math.min(1.4, w * (0.3 + s.risk * 0.3));
}

/**
 * The padel game plan (see the head of this file). The numbers are weights and chances; each one is multiplied by the
 * player's skill so each keeps a style (Paquito lobs and defends, Alejandro hits, Arturo does it all).
 */
export const PADEL = {
  /** at the net, a ball above the tape is put away with chance up × (putAway + attack); angled into the side mesh
   *  («a la reja») with chance reja × (0.5 + risk), otherwise at the feet */
  putAway: 0.35,
  reja: 0.45,
  /** at the net against a pair at the back: a short angled volley (chiquita volley) with chance touch × shortVolley */
  shortVolley: 0.3,
  /** at the net against a pair at the net (the volley exchange): chance of a lob over them (× lob), of a hard volley at
   *  the body (× attack, more as the exchange goes on) */
  netLob: 0.12,
  netHard: 0.5,
  /** overheads: from up to `overNear` m from the net, the share of remates (attack) over bandejas/víboras, and the
   *  chance a remate is hit to go out of the court («por 3») by a strong player (attack × risk × por3) */
  overNear: 4.5,
  remate: 0.45,
  vibora: 0.55,
  /** of the remates of a player with por 1 (Skill.por) that can go for it (specialOk), the share hit por 3 / por 4;
   *  and the share of the plain remates angled «a la reja» (× 0.5 + risk) */
  por3: 0.35,
  por4: 0.2,
  remateReja: 0.3,
  /** a ball off the back glass met high at the back (isBajada): the chance of a bajada, × (0.6 + 0.4 × Skill.wall) */
  bajada: 0.95,
  /** from the back against a pair at the net: the globo (lob × globo), the chiquita (touch × chiquita), the passing
   *  drive (attack × pass), the hard drive at the feet (the rest) */
  globo: 1.1,
  chiquita: 0.8,
  pass: 0.35,
  /** from the back against a pair at the back: a lob now and then (lob × backLob), an approach on a short ball */
  backLob: 0.25,
  approach: 0.65,
  /** the return: a lob over the net player with chance lob × returnLob */
  returnLob: 0.6,
};

/** The shot a sensible CPU player picks here (padel doubles, see the head of this file and PADEL). */
export function chooseShot(m: Match, p: Player, plan: Plan, s: Skill, hard = 0): Omit<ShotSpec, 'q' | 'timing'> {
  const r = m.rally!;
  const rng = m.rng;
  const opps = m.players.filter((o) => o.team !== p.team);
  const opp = pickOpp(m, opps);
  // where they will be: a player running in is read where he is going
  const oz = (o: Player) => Math.max(0.5, Math.abs(o.z + o.vz * 0.4));
  const netOf = (o: Player) => oz(o) < AT_NET + 0.4;
  const oppNet = opps.every(netOf);
  const oppBack = opps.every((o) => !netOf(o));
  const me = Math.abs(plan.fz);
  const meNet = me < AT_NET;
  // how attackable the ball is: 0 at the height of the tape, 1 well above it
  const up = clamp((plan.by - NET_C + 0.05) / 0.5, 0, 1);
  const side = p.side;
  const open = () => gapX(m, opps, s);
  const feet = (o: Player = opp) => o.x + (rng.next() - 0.5) * 0.8;
  // the corners at the back: deep and near the side glass (the bolder, the closer)
  const corner = (sg: number) => sg * (W / 2 - 0.9 - (1 - s.risk) * 0.9 - rng.next() * 0.5);
  const deep = () => HL - 1.1 - (1 - s.risk) * 0.9 - rng.next() * 1.2;
  // over the head of a player at the net (the other one's side if one is back)
  const overNet = () => {
    const o = netOf(opp) ? opp : opps.find(netOf) ?? opp;
    return o.x * 0.7 + (rng.next() - 0.5) * 1.2;
  };
  const lobDeep = () => HL - 0.9 - (1 - s.risk) * 0.8 - rng.next() * 0.8;
  // angled to the side wall where it is mesh (around the net): the side away from the nearer opponent
  const reja = () => {
    const near = opps.reduce((a, b) => (Math.abs(b.x - plan.bx) < Math.abs(a.x - plan.bx) ? b : a));
    const sg = -Math.sign(near.x) || (rng.chance(0.5) ? 1 : -1);
    return sg * (W / 2 - 0.5 - (1 - s.risk) * 0.5 - rng.next() * 0.4);
  };
  const out = (kind: ShotKind, x: number, d: number, clear: number, pace?: number) => ({ kind, ...target(side, x, d), clear, ...(pace !== undefined ? { pace } : {}) });
  // chased back by a lob: the sensible reply is defensive (a lob back, or a soft ball), not an attack
  const lobbed = r.last?.lastHit?.kind === 'lob' && me > SERVICE - 0.5;

  if (r.shots === 1) {
    // the return: low at the feet of the server coming in (cross-court, the way it came), or a lob over the net player
    const srv = m.server();
    if (rng.chance(s.lob * PADEL.returnLob)) return out('lob', overNet(), lobDeep(), 2.6 + rng.next() * 0.8);
    const toServer = srv.x + (rng.next() - 0.5) * 1.6;
    return out('return', rng.chance(0.75) ? toServer : open(), SERVICE - 1.6 + rng.next() * 1.6 + s.risk * 0.4, 0.3 + (1 - s.risk) * 0.2 + rng.next() * 0.2);
  }

  // ---- the bajada: a ball come back high off the back glass, hit down from the back (the par of the card)
  // (only with the time to set it up: an awkward one, after running back, is defended with a lob)
  if (isBajada(plan) && r.shots > 2 && (plan.bajada ?? rng.chance(bajadaChance(s, hard)))) {
    // at a pair at the net: hard at the feet of one, or through the middle; at a pair back: firm to a corner, short of
    // the glass (hit down from shoulder height it carries)
    if (!oppBack) {
      if (rng.chance(0.55)) return out('bajada', feet(), clamp(oz(opp) + 0.2 + rng.next() * 0.8, 2.6, 6), 0.12 + (1 - s.risk) * 0.08, 0.85);
      return out('bajada', (rng.next() - 0.5) * 1.2, 5.5 + rng.next() * 1.6, 0.14 + (1 - s.risk) * 0.08, 0.85);
    }
    return out('bajada', corner(rng.chance(0.5) ? 1 : -1), 6.2 + rng.next() * 1.4 + s.risk * 0.4, 0.3 + rng.next() * 0.15, 0.95);
  }

  // ---- overheads
  if (plan.overhead && !lobbed && me < PADEL.overNear + 2.5) {
    const deepOver = me > PADEL.overNear;
    // from the back of the service box or further, only the bandeja (a remate from there comes back off the glass)
    const remate = !deepOver && rng.chance(s.attack * PADEL.remate * (0.6 + up * 0.6) * clamp((PADEL.overNear + 0.5 - me) / 2, 0.3, 1));
    if (remate) {
      // por 3 / por 4, rarely, by the card (Skill.por: pot and rem): the remate that looks for the point off the walls
      const por = s.por ?? 0;
      if (por > 0 && specialOk('por3', plan) && rng.chance(por * PADEL.por3)) return specialShot(m, p, plan, 'por3', null, cpuSpecialPower(s));
      if (por > 0 && specialOk('por4', plan) && rng.chance(por * PADEL.por4)) return specialShot(m, p, plan, 'por4', null, cpuSpecialPower(s));
      // the remate: a la reja (angled short into the side mesh, it dies there), at the feet, or to the open side
      if (rng.chance(PADEL.remateReja * (0.5 + s.risk))) return out('smash', reja(), 3.0 + rng.next() * 1.4, 0.08, 0.75);
      return out('smash', rng.chance(0.5) ? open() : feet(), oppNet ? 3.5 + rng.next() * 2 : 4.5 + rng.next() * 2.5, 0.08, 0.75);
    }
    if (!deepOver && rng.chance(s.attack * PADEL.vibora * ((s.vibora ?? 0.55) / 0.55))) {
      // the víbora: sliced, angled into the side glass (it skids low off it)
      const sg = Math.sign(plan.bx) || (rng.chance(0.5) ? 1 : -1);
      return out('vibora', sg * (W / 2 - 0.6 - rng.next() * 0.6), 6.0 + rng.next() * 2.2, 0.25, 0.9);
    }
    // the bandeja: deep to the corner or down the middle, not too fast, and stay at the net
    return out('bandeja', rng.chance(0.5) ? corner(-Math.sign(plan.bx || 1)) : (rng.next() - 0.5) * 2.4, deep(), 0.45 + (1 - s.risk) * 0.2, 1.1);
  }

  // ---- at the net
  if (meNet) {
    if (up > 0 && rng.chance(Math.min(0.95, up * (PADEL.putAway + s.attack)))) {
      // A ball that sits up at the net: put it away. Through the pair it only bounces and comes back off the back
      // glass, so it goes where padel volleys finish: angled short into the side mesh («a la reja», it dies there),
      // at the feet (they have to dig it up), or, against a pair at the back, a drop volley that dies short
      if (rng.chance(PADEL.reja * (0.5 + s.risk))) return out('speedup', reja(), 2.6 + rng.next() * 1.6, 0.1, 0.9);
      if (oppBack) {
        if (rng.chance(0.3 + s.touch * 0.4)) return out('dink', reja() * 0.8, 1.6 + rng.next() * 1.0, 0.1);
        return out('speedup', corner(rng.chance(0.5) ? 1 : -1), deep(), 0.15, 0.8);
      }
      return out('speedup', feet(), Math.max(2.4, oz(opp) - 0.4 + rng.next() * 0.6), 0.08, 0.8);
    }
    if (oppBack) {
      // they are back: deep to the corners (it keeps them there) or, with touch, short and angled
      if (rng.chance(s.touch * PADEL.shortVolley)) return out('dink', (rng.chance(0.5) ? 1 : -1) * (2.4 + rng.next() * 1.6), 2.3 + rng.next() * 1.4, 0.15 + (1 - s.touch) * 0.12);
      return out('speedup', rng.chance(0.65) ? corner(rng.chance(0.5) ? 1 : -1) : open(), deep(), 0.3 + rng.next() * 0.2, 1.1);
    }
    if (oppNet) {
      // the volley exchange: a lob over them, a hard volley at the body (more often the longer it goes), or a low
      // volley at the feet of the one picked
      if (up === 0 && rng.chance(s.lob * PADEL.netLob)) return out('lob', overNet(), lobDeep(), 2.2 + rng.next() * 0.5);
      if (rng.chance(s.attack * PADEL.netHard * (1 + Math.min(1, r.shots * 0.05)))) return out('speedup', feet(), oz(opp) + 0.3 + rng.next() * 1.2, 0.15, 0.9);
      return out('dink', feet(), Math.max(2.4, oz(opp) - 0.8) + rng.next() * 0.8, 0.14 + (1 - s.touch) * 0.12);
    }
    // one up, one back: at the feet of the one at the net, or deep at the one back
    const back = opps.find((o) => !netOf(o)) ?? opp;
    if (rng.chance(0.5)) return out('speedup', back.x + (rng.next() - 0.5), deep(), 0.25, 1.05);
    const front = opps.find(netOf) ?? opp;
    return out('dink', feet(front), Math.max(2.4, oz(front) - 0.6) + rng.next() * 0.6, 0.15);
  }

  // ---- from the back
  if (lobbed) {
    // chased back by a lob: a high lob back (time to recover), or a soft ball to their feet
    if (rng.chance(0.55 + s.lob * 0.3)) return out('lob', overNet(), lobDeep(), 3.0 + rng.next() * 0.8);
    return out('drop', feet(), 3.2 + rng.next() * 1.2, 0.35 + (1 - s.touch) * 0.25);
  }
  if (!oppBack) {
    // against a pair at the net (or going there): the globo to take the net, the chiquita at the feet, now and then a
    // passing drive; a high ball from mid-court is hit down at the feet
    if (up > 0.3 && me < SERVICE + 0.6 && rng.chance(s.attack * up * 0.6)) return out('drive', feet(), oz(opp) + 0.4 + rng.next() * 1.2, 0.1, 0.9);
    const globoW = s.lob * PADEL.globo * (me > SERVICE + 0.8 ? 1 : 0.35);
    const chiqW = s.touch * PADEL.chiquita;
    const passW = s.attack * PADEL.pass;
    const driveW = 0.25;
    let u = rng.next() * (globoW + chiqW + passW + driveW);
    if ((u -= globoW) < 0) return out('lob', overNet(), lobDeep(), 2.4 + rng.next() * 0.9 + (1 - s.risk) * 0.3);
    if ((u -= chiqW) < 0) return out('dink', feet(), Math.max(2.3, oz(opp) - 0.9) + rng.next() * 0.8, 0.12 + (1 - s.touch) * 0.15 + rng.next() * 0.08);
    if ((u -= passW) < 0) {
      // the passing drive: low, down the line past the net player on the ball's side, or through the middle
      const line = Math.sign(plan.bx) || 1;
      const x = rng.chance(0.55) ? line * (W / 2 - 0.7 - rng.next() * 0.8) : (rng.next() - 0.5) * 1.2;
      return out('drive', x, 6.0 + rng.next() * 2.2, 0.08 + (1 - s.risk) * 0.1, 0.9);
    }
    return out('drive', feet(), oz(opp) + 0.2 + rng.next() * 1.0, 0.12 + rng.next() * 0.1);
  }
  // both pairs back: steady and deep (hitting hard is pointless, the glass gives it back), the middle to make them
  // doubt; a short ball is the moment to come in behind an approach; a lob over them now and then
  if (me < SERVICE + 0.5 && rng.chance(PADEL.approach * (0.4 + 0.6 * s.mover.netRush))) return out('drive', rng.chance(0.5) ? corner(rng.chance(0.5) ? 1 : -1) : (rng.next() - 0.5) * 2, deep(), 0.3 + rng.next() * 0.2, 1.05);
  if (rng.chance(s.lob * PADEL.backLob)) return out('lob', (rng.next() - 0.5) * 3, lobDeep(), 2.6 + rng.next() * 0.6);
  if (rng.chance(s.touch * 0.15)) return out('drop', (rng.next() - 0.5) * 5, 2.2 + rng.next() * 1.4, 0.3 + (1 - s.touch) * 0.25);
  return out('drive', rng.chance(0.5) ? (rng.next() - 0.5) * 2 : corner(rng.chance(0.5) ? 1 : -1), deep(), 0.35 + rng.next() * 0.3, 1.15);
}

/**
 * The remate that looks for the point off the walls (ShotSpec.special), for the CPU and the human alike:
 *  · «por 3»: flat (no spin), as hard as it goes and as steep as the net lets it (aimed just over the tape, the closer
 *    to the net the steeper), so it kicks up off the floor and over the walls. It needs a high ball close to the net
 *    (`minH3`, `near3`); hit from lower or further it bounces up into the back mesh or glass and comes back a sitter;
 *  · «por 4»: heavy topspin (`spin4`), `extra4` m deeper than the por 3 from the same contact: it bounces up into the top
 *    of the back glass (2.6–3 m), climbs off it over the defenders' reach and flies back over the net. Lower on the
 *    glass they play it (a sitter, high); into the mesh above it, it dies at the back.
 * The physics decides (Match.launch adds the scatter of a hard contact, `scatter` × (`base` + 1 − q) m deeper or
 * shorter, and loses `slow` of the pace per unit of a poor contact). The pace is the base × the power model (POWER),
 * never faster than LAUNCH.vmax on average.
 */
export const POR = { minH3: 2.25, near3: 4.2, pace3: 0.56, clear3: 0.04, spin3: 0.04, minH4: 2.1, near4: 4.8, extra4: 1.1, pace4: 0.6, clear4: 0.06, spin4: 1, scatter: 1.0, base: 0.6, slow: 0.5, tape: 0.97 };
/** a ball over the head that can be hit for por 3 / por 4 at all (the CPU only tries those) */
export function specialOk(sp: Special, plan: Plan): boolean {
  if (!plan.overhead) return false;
  const fz = Math.abs(plan.fz);
  return sp === 'por3' ? plan.by >= POR.minH3 && fz <= POR.near3 : plan.by >= POR.minH4 && fz <= POR.near4;
}
/** the CPU's power on a remate por 3 / por 4: full for the best (Skill.por) */
function cpuSpecialPower(s: Skill): number {
  return clamp(0.8 + (s.por ?? 0) * 0.2, 0, 1);
}
/**
 * The shot of a por 3 / por 4 attempt from this contact (`aim`: the human's aimed spot, its x is kept). por 3: the depth
 * that clears the tape on the straightest line from the contact (the steepest the net allows), plus a hair.
 */
export function specialShot(m: Match, p: Player, plan: Plan, sp: Special, aim: { x: number } | null, power: number): Omit<ShotSpec, 'q' | 'timing'> {
  const rng = m.rng;
  const h = Math.max(1.3, plan.by);
  // the depth that clears the tape on the straightest line (the steepest bounce the net allows)
  const d = clamp((POR.tape * Math.abs(plan.bz)) / (h - POR.tape) + 0.25, 1.0, 4.5);
  if (sp === 'por3') {
    const x = aim ? aim.x : plan.bx * 0.4 + (rng.next() - 0.5) * 2.4;
    return { kind: 'smash', ...target(p.side, x, d), clear: POR.clear3, pace: POR.pace3, power, special: 'por3', intent: 'attack' };
  }
  const x = aim ? aim.x : plan.bx * 0.3 + (rng.next() - 0.5) * 2;
  return { kind: 'smash', ...target(p.side, x, d + POR.extra4), clear: POR.clear4, pace: POR.pace4, power, special: 'por4', intent: 'attack' };
}

/**
 * The bajada (bajada de pared): a ball that has bounced and come back off the back glass, met above `minH` m by a
 * player at the back (`minZ` m or more from the net): hit down and hard instead of waiting for it to drop. The planner
 * values such a contact (`value` × how readily the player plays one: the card's par) so the players wait for it. The
 * CPU plays it only with the time to set it up (the ball's difficulty under `hard`, fully under hard − 0.2).
 */
export const BAJADA = { minH: 1.35, minZ: SERVICE - 0.3, value: 0.3, hard: 0.45 };
/** The CPU's chance of a bajada on a ball that allows one (isBajada), for a player this awkward on it (`hard`). */
function bajadaChance(s: Skill, hard: number): number {
  return PADEL.bajada * (0.6 + 0.4 * (s.wall ?? 0.5)) * clamp((BAJADA.hard - hard) / 0.2, 0, 1);
}
export function isBajada(plan: Plan | null): boolean {
  return !!plan && !plan.volley && plan.wall === 'back' && plan.by >= BAJADA.minH && Math.abs(plan.fz) >= BAJADA.minZ;
}

/** The rivals of the ladder, from the park regular to the tour's No. 1. */
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
 * The pairs' players: their cards and styles (skillFrom turns them into the game). Feet for a 20 × 10 m court: the
 * human runs at HUMAN_SPEED and reaches 1 m (LUNGE); the first pair is clearly slower and reaches less, the champions
 * about the same as the human. Styles (the tags in i18n): Paquito defends from the back glass and lobs, Fede is touch
 * and gets everything back, Alejandro hits (remates, por 3 / por 4), Agustín is touch (chiquitas, víboras), Arturo
 * does it all.
 */
export const RIVAL_ATTRS: Record<string, Attributes> = {
  paco: { pot: 52, con: 56, vel: 55, ref: 56, rem: 50, par: 72, tq: 66 },
  lola: { pot: 58, con: 72, vel: 72, ref: 72, rem: 60, par: 82, tq: 84 },
  bruno: { pot: 93, con: 82, vel: 82, ref: 76, rem: 92, par: 70, tq: 62 },
  nuria: { pot: 80, con: 82, vel: 86, ref: 86, rem: 86, par: 78, tq: 93 },
  reina: { pot: 90, con: 88, vel: 88, ref: 90, rem: 92, par: 88, tq: 84 },
};
export const RIVAL_STYLES: Record<string, Style> = {
  paco: { touch: 0.27, attack: 0.24, lob: 0.76, risk: 0.11, netRush: 0.3, serveDelay: 1.3, vibora: 0.3, por: 0 },
  lola: { touch: 0.55, attack: 0.33, lob: 0.74, risk: 0.22, netRush: 0.55, serveDelay: 1.1, vibora: 0.45 },
  bruno: { touch: 0.32, attack: 0.72, lob: 0.45, risk: 0.43, netRush: 0.75, serveDelay: 0.9, vibora: 0.4, por: 1.3 },
  nuria: { touch: 0.82, attack: 0.55, lob: 0.62, risk: 0.3, netRush: 0.85, serveDelay: 1.0, vibora: 0.8, por: 0.7 },
  reina: { touch: 0.74, attack: 0.72, lob: 0.62, risk: 0.43, netRush: 0.95, serveDelay: 0.9, vibora: 0.55 },
};
export const DOUBLES_SKILLS: Record<string, Skill> = Object.fromEntries(Object.keys(RIVAL_ATTRS).map((id) => [id, skillFrom(RIVAL_ATTRS[id], RIVAL_STYLES[id])]));

/** The rivals (first names in the manner of the PES; the surnames are in tour.ts). */
export const RIVALS: Rival[] = [
  { id: 'paco', name: 'Paquito', tag: 'rival.paco', look: 1, attrs: RIVAL_ATTRS.paco, skill: DOUBLES_SKILLS.paco },
  { id: 'lola', name: 'Fede', tag: 'rival.lola', look: 2, attrs: RIVAL_ATTRS.lola, skill: DOUBLES_SKILLS.lola },
  { id: 'bruno', name: 'Alejandro', tag: 'rival.bruno', look: 3, attrs: RIVAL_ATTRS.bruno, skill: DOUBLES_SKILLS.bruno },
  { id: 'nuria', name: 'Agustín', tag: 'rival.nuria', look: 4, attrs: RIVAL_ATTRS.nuria, skill: DOUBLES_SKILLS.nuria },
  { id: 'reina', name: 'Arturo', tag: 'rival.reina', look: 5, attrs: RIVAL_ATTRS.reina, skill: DOUBLES_SKILLS.reina },
];

/**
 * The human's partner: a steady player on the left («revés»), quick and safe off the glass, little power, who moves
 * up and back with him (overall 75, about the human's 73).
 */
export const PARTNER_ATTRS: Attributes = { pot: 60, con: 82, vel: 85, ref: 84, rem: 64, par: 82, tq: 70 };
export const PARTNER: Rival = {
  id: 'marta',
  name: 'Martín',
  tag: 'partner.marta',
  look: 6,
  attrs: PARTNER_ATTRS,
  skill: skillFrom(PARTNER_ATTRS, { touch: 0.62, attack: 0.55, lob: 0.62, risk: 0.25, netRush: 0.85, serveDelay: 1.0, vibora: 0.5, por: 0 }),
};

/** The club's pairs, two rivals of the ladder each, from the Sunday pair to the champions. */
export interface Pair {
  id: string;
  a: Rival;
  b: Rival;
  /** i18n key of the one-line description */
  tag: string;
}
const rv = (id: string): Rival => RIVALS.find((r) => r.id === id)!;
export const PAIRS: Pair[] = [
  { id: 'paco-lola', a: rv('paco'), b: rv('lola'), tag: 'pair.pacoLola' },
  { id: 'lola-bruno', a: rv('lola'), b: rv('bruno'), tag: 'pair.lolaBruno' },
  { id: 'bruno-nuria', a: rv('bruno'), b: rv('nuria'), tag: 'pair.brunoNuria' },
  { id: 'nuria-reina', a: rv('nuria'), b: rv('reina'), tag: 'pair.nuriaReina' },
];

/** The human's movement (Mover): he picks his own depth; netRush is what the partner reads. */
export const HUMAN_MOVER: Mover = { netRush: 0.9, misjudge: 0, lunge: 0 };
/** the human's top speed (m/s) from his card (humanSkill: 5.0 at vel 76; a 20 m court asks for more than pickleball's 4.6) */
export const HUMAN_SPEED = humanSkill(HUMAN_ATTRS).speed;
export const HUMAN_REACTION = 0.1;

/**
 * The shot the human's player plays alone when the thumb gave no aim (assisted swing): a safe ball, never an attack on
 * a ball that does not ask for it. The return: low down the middle. Up at the net: a volley deep down the middle
 * (a bandeja over the head). From the back against a pair at the net: a lob over them; against a pair at the back, a
 * steady ball deep down the middle. It gets the ball back, nothing more: aiming beats it.
 */
export function autoShot(m: Match, p: Player, plan: Plan): Omit<ShotSpec, 'q' | 'timing'> {
  const r = m.rally;
  const rng = m.rng;
  const opps = m.players.filter((o) => o.team !== p.team);
  const oppNet = opps.some((o) => Math.abs(o.z) < AT_NET);
  const meNet = Math.abs(plan.fz) < AT_NET;
  const x = (rng.next() - 0.5) * 1.6;
  if (r && r.shots === 1) return { kind: 'return', ...target(p.side, x, SERVICE - 0.8 + rng.next() * 1.4), clear: 0.5 };
  // a ball over the head: the reflex is a bandeja, deep down the middle (aiming picks the spot; a flick is the remate)
  if (plan.overhead && Math.abs(plan.fz) < PADEL.overNear + 2) return { kind: 'bandeja', ...target(p.side, x, HL - 1.8 - rng.next() * 1.2), clear: 0.55, pace: 1.1 };
  // (at the net, a firm volley to the middle of their half: deep enough to keep them back, short of the glass)
  if (meNet) return { kind: 'auto', ...target(p.side, x, 5.6 + rng.next() * 1.4), clear: 0.3 + rng.next() * 0.15, pace: 1.2 };
  if (oppNet) return { kind: 'lob', ...target(p.side, x, HL - 1.8 - rng.next() * 1.0), clear: 2.8 + rng.next() * 0.4 };
  return { kind: 'auto', ...target(p.side, x, HL - 1.6 - rng.next() * 1.2), clear: 0.75 + rng.next() * 0.25 };
}

/**
 * Shot type from where the human aims (the target d m from the net):
 *  · closer than AIM_SOFT: a soft ball: at the net a chiquita (a soft volley at the feet), from the back a dejada;
 *  · behind the back glass (the drag past HL, `lob`): a globo;
 *  · otherwise a drive (a volley at the net); a ball over the head: a bandeja.
 * `attack` (a flick, F, the right button): a hard volley, or over the head a remate, or a víbora when the stroke bends
 * towards a side wall (`bend`, ATTACK.viboraBend).
 */
export function kindForAim(m: Match, p: Player, plan: Plan, d: number, lob: boolean, attack = false, bend = 0, opts: { power?: number; down?: boolean } = {}): { kind: ShotKind; clear: number; pace?: number; special?: Special } {
  const r = m.rally;
  if (!r) return { kind: 'serve', clear: 0.5 };
  const power = opts.power ?? 0.5;
  // a ball come back high off the back glass: the bajada (a flick or a hard stroke: hit down hard; placed: firm to the
  // corners)
  if (isBajada(plan) && r.shots > 1 && !lob) return attack || opts.down || power >= ATTACK.hardBajada ? { kind: 'bajada', clear: ATTACK.bajadaClear, pace: ATTACK.bajadaPace } : { kind: 'bajada', clear: 0.3, pace: 0.95 };
  // over the head, a down-flick (towards the player): the remate por 4
  if (opts.down && plan.overhead && r.shots > 1) return { kind: 'smash', clear: POR.clear4, pace: POR.pace4, special: 'por4' };
  if (attack) {
    if (!plan.overhead) return { kind: 'speedup', clear: ATTACK.clear, pace: ATTACK.pace };
    if (Math.abs(bend) >= ATTACK.viboraBend) return { kind: 'vibora', clear: ATTACK.viboraClear, pace: ATTACK.viboraPace };
    // straight up at full power at a high ball close to the net: the remate por 3
    if (power >= ATTACK.por3Power && specialOk('por3', plan)) return { kind: 'smash', clear: POR.clear3, pace: POR.pace3, special: 'por3' };
    return { kind: 'smash', clear: ATTACK.smashClear, pace: ATTACK.smashPace };
  }
  if (r.shots === 1) return lob ? { kind: 'lob', clear: 2.8 } : { kind: 'return', clear: d < AIM_SOFT ? 0.2 : 0.35 };
  if (plan.overhead && !lob) return { kind: 'bandeja', clear: 0.5, pace: 1.1 };
  if (lob) return { kind: 'lob', clear: 2.8 };
  const meNet = Math.abs(plan.fz) < AT_NET;
  if (d < AIM_SOFT) return meNet ? { kind: 'dink', clear: 0.16 } : { kind: 'drop', clear: 0.3 };
  return meNet ? { kind: 'speedup', clear: 0.3, pace: 1.05 } : { kind: 'drive', clear: 0.35 };
}
/** the human's aim: closer to the net than this (m) is a soft ball (a chiquita, a dejada) */
export const AIM_SOFT = 4.2;

/**
 * The human's attack (a flick, F or the right button): a flat, fast volley, or over the head a remate (or a víbora when
 * the stroke bends `viboraBend` m or more towards a side wall). Where it goes:
 *  · not aimed (the drag before the stroke under `aimed` px): at the body of the opponent in front, low, landing
 *    `behind` m past his feet (no closer than `minDepth` from the net);
 *  · aimed: where the drag pointed, never short of the opponent;
 *  · the stroke's angle bends it across: `bend` m for a stroke 45° off straight up (world x, from the hitter's view).
 * A low ball is a gamble (attackRisk × `lowRisk`); an attack let go outside the golden window is `rough` rougher.
 */
export const ATTACK = { aimed: 20, side: 0, behind: 0.6, minDepth: DEPTH_Z[2] + 1.2, bend: 1.6, clear: 0.12, pace: 0.85, smashClear: 0.08, smashPace: 0.72, viboraBend: 0.7, viboraClear: 0.25, viboraPace: 0.9, lowRisk: 3, rough: 0.04, por3Power: 0.9, hardBajada: 0.7, bajadaClear: 0.13, bajadaPace: 0.85 };
export function attackTarget(m: Match, p: Player, plan: Plan, aimed: { x: number; z: number } | null, bend: number): { tx: number; tz: number } {
  const opps = m.players.filter((o) => o.team !== p.team);
  const want = (aimed ? aimed.x : plan.bx) + bend;
  const opp = opps.reduce((a, b) => (Math.abs(b.x - want) < Math.abs(a.x - want) ? b : a));
  const od = Math.abs(opp.z);
  let x: number;
  let d: number;
  if (aimed) {
    x = aimed.x + bend;
    d = Math.max(Math.abs(aimed.z), Math.min(HL - 0.5, od + 0.3));
  } else if (plan.overhead && Math.abs(bend) >= ATTACK.viboraBend) {
    // the víbora: into the side glass the stroke bends towards, two-thirds deep
    x = Math.sign(bend) * (W / 2 - 0.6);
    d = 6.5;
  } else {
    // (the opponent's right is +x on the near side, −x on the far side)
    x = opp.x + opp.side * ATTACK.side + bend;
    d = clamp(od + ATTACK.behind, ATTACK.minDepth, HL - 0.6);
  }
  return { tx: clamp(x, -W / 2 + 0.3, W / 2 - 0.3), tz: -p.side * Math.min(HL - 0.3, d) };
}

/**
 * The human's tap: a block, a soft ball low over the net (`x` of the way from the contact towards the middle) that
 * dies `depth` m from the net (± `spread`): a soft volley (chiquita) up at the net, a dejada from further back. Timed in
 * the golden window it is clean (it takes the pace off an attack); `good` s either side of the window it is a plain
 * block; further off, a poor one (worse than the automatic shot). See HumanController.
 */
export const BLOCK = { depth: 2.8, spread: 1.0, x: 0.4, clear: 0.18, clearBack: 0.3, good: 0.12, perfectMin: 0.84, soak: 0.6, miss: 0.04 };
export function blockShot(m: Match, p: Player, plan: Plan): Omit<ShotSpec, 'q' | 'timing'> {
  const atNet = Math.abs(plan.fz) < AT_NET;
  const x = plan.bx * BLOCK.x + (m.rng.next() - 0.5) * 1.6;
  const d = BLOCK.depth + (atNet ? 0 : 0.4) + m.rng.next() * BLOCK.spread;
  return { kind: atNet ? 'dink' : 'drop', ...target(p.side, x, d), clear: atNet ? BLOCK.clear : BLOCK.clearBack };
}

/**
 * A ball the player can attack: met at least `over` m above the tape within `near` m of the net (further back it has
 * to come `slope` m higher per metre; a ball over the head up to `overhead` m from the net), from the third shot on,
 * not one going out, and with time to set up the swing (the awkwardness of the ball, difficulty, at most `hard`). The
 * HUD lights it (the ring at the feet in orange, «¡Atácala!»); the bots read it too.
 */
export const ATTACKABLE = { over: 0.15, near: 4.0, slope: 0.15, overhead: 5.0, hard: 0.35 };
export function attackable(m: Match, p: Player, plan: Plan | null): boolean {
  const r = m.rally;
  if (!plan || !r || r.shots < 2 || plan.oops || plan.out) return false;
  const fz = Math.abs(plan.fz);
  if (plan.overhead) {
    if (fz > ATTACKABLE.overhead) return false;
  } else if (plan.by < NET_C + ATTACKABLE.over + Math.max(0, fz - ATTACKABLE.near) * ATTACKABLE.slope) return false;
  return difficulty(m, p, { ...plan, stretch: 0 }) <= ATTACKABLE.hard;
}

/**
 * The ball coming at `p` is an attack: a hard volley, remate or víbora from the other side, or a drive faster than
 * `pace` m/s (along the court) at a player up at the net (within `near` m). The answer is a block (a tap in the
 * golden window).
 */
export const UNDER_ATTACK = { pace: 15, near: AT_NET };
export function underAttack(m: Match, p: Player): boolean {
  const r = m.rally;
  const lh = r?.last && r.last.team !== p.team ? r.last.lastHit : null;
  if (!lh) return false;
  // (a remate that has come off the glass is no attack any more: it is a ball to play)
  if ((r?.walls ?? 0) > 0) return false;
  if (lh.kind === 'smash' || lh.kind === 'vibora') return true;
  return (lh.kind === 'speedup' || lh.kind === 'drive' || lh.kind === 'bajada') && Math.abs(p.z) < UNDER_ATTACK.near && ballSpeed(m) > UNDER_ATTACK.pace;
}

/**
 * For the HUD, the training and the bots: what the coming ball asks of `p` at the contact `plan` (the circle, or the
 * contact in reach): 'block' (an attack coming at him), 'bajada' (it comes back high off the back glass: hit it down,
 * isBajada), 'attack' (attackable) or null.
 */
export function ballCue(m: Match, p: Player, plan: Plan | null): 'attack' | 'block' | 'bajada' | null {
  if (m.phase !== 'rally' || !plan || plan.oops || plan.out) return null;
  const r = m.rally;
  if (!r?.last || r.last.team === p.team) return null;
  if (underAttack(m, p)) return 'block';
  if (isBajada(plan) && r.shots > 1) return 'bajada';
  return attackable(m, p, plan) ? 'attack' : null;
}

/**
 * The human's globo, from how far past the back glass he drags (f: 0 … 1): from a high, safe lob that lands around the
 * service line (it gets smashed) to a lower one that lands deep (a weapon over a pair at the net; too deep it comes off
 * the back glass to them, too low it gets volleyed).
 */
export function lobShape(f: number): { depth: number; clear: number } {
  const k = clamp(f, 0, 1);
  return { depth: HL - 2.6 + k * 1.9, clear: 3.6 - k * 1.2 };
}

/**
 * Contact quality of the human's swing: released in the golden window (before the awkwardness of the ball), aimed but
 * released outside it (assisted swing), and the automatic shot.
 */
export const Q_PERFECT = 0.9;
export const Q_AIMED = 0.84;
export const Q_AUTO = 0.78;
