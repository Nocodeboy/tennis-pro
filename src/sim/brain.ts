// The CPU players: how they serve, which shot they pick, how well they read the ball and how cleanly they hit it.
// Each rival is a Skill. Also the human's automatic reset and the aim mapping shared with the view.

import { posAt } from './ball';
import { AT_NET, DEPTH_Z, HL, NET_C, SERVICE, W } from './court';
import type { Controller, Match, Mover } from './match';
import type { Plan, Player, ShotKind, ShotSpec, Timing } from './types';

export interface Skill {
  /** m/s */
  speed: number;
  /** s before they start moving */
  reaction: number;
  /** mean contact quality and its spread */
  q: number;
  qVar: number;
  /** 0 … 1: plays the soft game (dinks, third-shot drops, blocks) when it is the right shot */
  touch: number;
  /** 0 … 1: punishes a high ball (speed-up, smash) */
  attack: number;
  /** chance of a lob when the opponent is up at the net */
  lob: number;
  /** aims closer to the lines (more winners, more errors) */
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
  /**
   * singles, court sense 0 … 1: how often they place the ball into the open court (away from the opponent, near the
   * line they dare) rather than back down the middle or at the player (SINGLES; default 0.6)
   */
  angle?: number;
  /** singles: how readily they come in to the net (after the return, behind a drop or a lob); default Mover.netRush */
  rush?: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Where on the receiver's half a target is: d = distance from the net, x across. */
function target(side: number, x: number, d: number) {
  return { tx: clamp(x, -W / 2 + 0.25, W / 2 - 0.25), tz: -side * d };
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
  const cls = k === 'lob' ? 'lob' : k === 'dink' || k === 'drop' || k === 'auto' ? 'soft' : 'hard';
  const dx = (plan.bx - p.x) * p.side;
  const lat = Math.abs(dx) < 0.7 ? 'body' : `${Math.abs(dx) < 1.7 ? 'side' : 'wide'}${dx > 0 ? 'R' : 'L'}`;
  return `${cls}:${lat}:${plan.by < 0.5 ? 'low' : plan.by > 1.2 ? 'high' : 'mid'}`;
}

export class AIController implements Controller {
  readonly mover: Mover;
  constructor(readonly skill: Skill) {
    this.mover = skill.mover;
  }

  private waitUntil = -1;
  /** the opponent's last balls at this player (zoneOf keys): a repeated one is read earlier and played calmer */
  private seen: string[] = [];
  /**
   * the read of the ball coming now: how familiar it is, how far off the first read was and how early it was fixed,
   * and where the player stood and how fast the ball left the other paddle when it was struck (x0, z0, v0)
   */
  private cur: { plan: Plan; fam: number; off: number; lead: number; x0: number; z0: number; v0: number } | null = null;

  serve(m: Match, p: Player): ShotSpec | null {
    if (this.waitUntil < 0 || this.waitUntil < m.t - 30) this.waitUntil = m.t + this.skill.serveDelay * (0.8 + m.rng.next() * 0.5);
    if (m.t < this.waitUntil) return null;
    this.waitUntil = -1;
    const s = this.skill;
    const half = -m.serveX(p.team);
    const depth = HL - 0.7 - m.rng.next() * (1.6 - s.risk);
    const x = half * (0.6 + m.rng.next() * 1.8);
    return this.roll(m, { kind: 'serve', ...target(p.side, x, depth), clear: 0.55 + m.rng.next() * 0.35 }, 0.05);
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
    this.cur = { plan, fam, off: 0, lead: 9, x0: p.x, z0: p.z, v0: ballSpeed(m) };
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
    // singles: the shot and what it is for (it decides where the player goes next, see place)
    const solo = !m.doubles && SINGLES.on ? singlesShot(m, p, plan, s) : null;
    this.intent = solo?.intent ?? null;
    let shot = solo ? solo.shot : chooseShot(m, p, plan, s);
    let risk = attackRisk(shot.kind, plan) * poise;
    // singles: a fast ball volleyed on the run (a passing shot that nearly got by: the metres covered since it was
    // struck, plus the stretch) is a block, not a volley, and so is one that dips below the tape (SINGLES.onRunVolley,
    // lowVolley). Alone on the court there is nobody to cover the reply.
    if (solo && c && m.rally?.bounces === 0) {
      const ran = Math.hypot(p.x - c.x0, p.z - c.z0) + (plan.stretch ?? 0) * (s.mover.lunge ?? 0);
      const k = clamp((ran - SINGLES.runFrom) / SINGLES.runSpan, 0, 1);
      const fast = clamp((c.v0 - SINGLES.runPace) / 8, 0, 1.2);
      hard += SINGLES.onRunVolley * k * k * fast * (0.6 + 0.4 * poise);
      if (plan.by < NET_C) hard += SINGLES.lowVolley * clamp((NET_C - plan.by) / 0.5, 0, 1) * fast * (0.6 + 0.4 * poise);
    }
    // A fast ball at the body or the feet, not above the tape: the safe answer is a soft block into the kitchen
    // (it takes the pace off), not a full swing. Players with touch see it more often, and more so on a pattern.
    const r = m.rally;
    const avail = r?.last?.lastHit ? plan.t - r.last.lastHit.t : 9;
    const block = ballSpeed(m) > 10.5 && plan.by < NET_C + 0.25 && (avail < 0.75 || plan.by < 0.45) && !plan.overhead && (r?.shots ?? 0) > 2;
    if (block && shot.kind !== 'lob' && m.rng.chance(clamp(0.3 + s.touch * 0.55 + fam * 0.25, 0, 0.95))) {
      const atNet = Math.abs(plan.fz) < AT_NET;
      shot = {
        kind: atNet ? 'dink' : 'drop',
        ...target(p.side, (m.rng.next() - 0.5) * 2.2 - p.x * 0.3, (atNet ? 1.0 : 1.3) + m.rng.next() * 0.9),
        clear: 0.17 + (1 - s.touch) * 0.12 + m.rng.next() * 0.08,
      };
      hard *= 0.7;
      risk = 0;
      if (solo) this.intent = 'block';
    }
    // The other side's automatic reset (the human's swing with no aim: the same ball to the middle every time): from
    // the third in a row they see it coming and, now and then, attack it away from the player (a speed-up, or a smash
    // if it sits up, to the open side), even off a low ball. It ends the exchanges an automatic reset would otherwise
    // keep going on its own (AUTO_PUNISH).
    const last = r?.last?.lastHit;
    if (this.autoSeen.rally !== m.stats.rallies) this.autoSeen = { rally: m.stats.rallies, n: 0 };
    this.autoSeen.n = last?.timing === 'auto' ? this.autoSeen.n + 1 : 0;
    if (this.autoSeen.n >= AUTO_PUNISH.from && (r?.shots ?? 0) > 2 && m.rng.chance(AUTO_PUNISH.base + AUTO_PUNISH.attack * s.attack)) {
      shot = punish(m, p, plan, s);
      risk = attackRisk(shot.kind, plan) * poise;
      if (solo) this.intent = Math.abs(plan.fz) < AT_NET ? 'putaway' : 'pass';
    }
    const spec = this.roll(m, shot, hard + risk);
    // the rally weighs on them (less on the calm ones, and less against a pattern they have already read)
    spec.pop = pressure(m) * poise * (1 - 0.5 * fam);
    return spec;
  }
  /** the other side's automatic resets in a row at this player, in this rally */
  private autoSeen = { rally: -1, n: 0 };
  /** singles: what the last shot was for (an approach, a passing shot…), for where to go next */
  private intent: Intent | null = null;

  /**
   * Singles (Match.afterHit): where this player goes after their own shot, the decision to come in or stay back
   * (see placeSingles). null: doubles, or the singles game plan switched off (SINGLES.on = 0).
   */
  place(m: Match, p: Player, spec: ShotSpec): { depth: 0 | 1 | 2; x: number } | null {
    if (m.doubles || !SINGLES.on) return null;
    void spec;
    return placeSingles(m, p, this.skill, this.intent);
  }

  /** contact quality: the skill, a bit of luck and how awkward the ball was; a poor contact is also early or late */
  protected roll(m: Match, base: Omit<ShotSpec, 'q' | 'timing'>, hard: number): ShotSpec {
    const s = this.skill;
    const raw = s.q + m.rng.gauss() * s.qVar - hard;
    const q = clamp(raw, Q_FLOOR, 1);
    const timing: Timing = q > 0.93 ? 'perfect' : q > 0.7 ? 'good' : 'early';
    const late = clamp(m.rng.gauss() * (1 - q) * 1.1, -1, 1);
    const shank = shankOf(m, raw, Q_FLOOR);
    return { ...base, q, timing, late, ...(shank > 0 ? { shank } : {}) };
  }
}

/** the lowest contact quality of a CPU swing (a human's: Q_FLOOR_HUMAN) */
export const Q_FLOOR = 0.15;
export const Q_FLOOR_HUMAN = 0.2;
/**
 * A ball too awkward to play at all (docs/concepto.md, «Control y simulación 0.7»): once the contact quality is at its
 * floor, what is left of the difficulty below it (`raw`: the quality it would have had) becomes the chance of a shank,
 * `k` per unit (× `dbl` in doubles), at most `max`. A smash at the feet with no time is then often an error, not one
 * more block at the floor that keeps the exchange going.
 */
export const SHANK = { k: 1, dbl: 2, max: 0.7 };
export function shankOf(m: Match, raw: number, floor: number): number {
  // (singles: SINGLES.shank, alone on the court a ball at the floor is as hard to keep in as in doubles)
  return clamp((floor - raw) * SHANK.k * (m.doubles ? SHANK.dbl : SINGLES.on ? SINGLES.shank : 1), 0, SHANK.max);
}

/**
 * The automatic reset read by the CPU (AIController.hit): from the `from`-th in a row at the same player, the chance of
 * attacking it is base + attack × the player's attack (Paco 0.23 … Reina 0.43), off a low ball too: a risky attack
 * that often goes wrong (attackRisk), so the exchange ends either way.
 */
export const AUTO_PUNISH = { from: 3, base: 0.1, attack: 0.5 };

/**
 * An attack on a ball the player saw coming, away from the opponent: to the open side, past their reach (a smash if
 * it is overhead, a speed-up up at the net, a drive from further back).
 */
function punish(m: Match, p: Player, plan: Plan, s: Skill): Omit<ShotSpec, 'q' | 'timing'> {
  const rng = m.rng;
  const opps = m.players.filter((o) => o.team !== p.team);
  const opp = opps.length > 1 ? opps[rng.chance(0.5) ? 0 : 1] : opps[0];
  // the side with more room (from the player's own view the sign does not matter: x is the court's)
  const way = Math.abs(opp.x) > 0.3 ? -Math.sign(opp.x) : rng.chance(0.5) ? 1 : -1;
  const x = opp.x + way * (1.4 + s.risk * 0.6 + rng.next() * 0.6);
  if (plan.overhead) return { kind: 'smash', ...target(p.side, x, Math.min(HL - 0.6, Math.abs(opp.z) + 1.0 + rng.next() * 2)), clear: 0.08, pace: 0.8 };
  const d = Math.min(HL - 0.6, Math.abs(opp.z) + 0.6 + rng.next() * 1.6);
  return { kind: Math.abs(plan.fz) < AT_NET ? 'speedup' : 'drive', ...target(p.side, x, d), clear: 0.12, pace: 0.9 };
}

/**
 * Long rallies: the pressure builds up from the sixth shot. It goes into how likely a shot is to sit up (ShotSpec.pop:
 * high and long, a ball to attack), only a little into the contact itself: rallies end with an attack, not in the net.
 */
export function pressure(m: Match): number {
  const r = m.rally;
  // doubles: two defenders get to more balls, so it builds up faster; singles: SINGLES.press from SINGLES.pressFrom
  if (!m.doubles && SINGLES.on) return r && r.shots > SINGLES.pressFrom ? (r.shots - SINGLES.pressFrom) * SINGLES.press : 0;
  return r && r.shots > 5 ? (r.shots - 5) * (m.doubles ? DOUBLES.pressure : 0.04) : 0;
}

/**
 * Doubles points that resolve like real doubles (docs/concepto.md, «Control y simulación 0.7»): with a partner
 * covering the other half, a player at the net attacks a ball that sits up more readily (the singles chance × `attack`,
 * plus `add` for everybody, both × how far above the tape it is), speeds up a dink that is not quite down a little more often (`tired`), and the rally pressure builds up
 * faster (`pressure` per shot from the sixth).
 */
export const DOUBLES = { attack: 1, add: 0.35, tired: 1.3, pressure: 0.055 };

/**
 * The part of the difficulty that is lack of time: a hard-hit ball (more so hit down from above the net, before it
 * bounces), little time to react (a speed-up, a smash).
 */
function rushed(m: Match, plan: Plan): number {
  let d = clamp((ballSpeed(m) - 9) / 10, 0, 1.2) * 0.15;
  const r = m.rally;
  if (r && r.bounces === 0) d += clamp(r.seg.y - 1.0, 0, 1) * 0.15;
  const last = r?.last?.lastHit;
  if (last) {
    const avail = plan.t - last.t;
    if (avail < 0.6) d += (0.6 - avail) * 1.1;
    if (avail < 0.45) d += (0.45 - avail) * 1.6;
  }
  // chased back by a lob: played on the run, the ball over the shoulder (a smash from deep is no put-away either)
  if (last?.kind === 'lob') d += plan.overhead ? clamp((Math.abs(plan.fz) - 3.8) * 0.22, 0, 0.45) : clamp((Math.abs(plan.fz) - 3.6) * 0.15, 0, 0.5);
  return d;
}

/** How hard the incoming ball is to play well (0 = sitting up nicely). */
export function difficulty(m: Match, p: Player, plan: Plan): number {
  let d = rushed(m, plan);
  if (plan.by < 0.35) d += 0.12;
  if (plan.hand === -1) d += 0.04;
  // long rallies: a little of the pressure gets into the contact (most of it makes the ball sit up, see pressure)
  d += pressure(m) * 0.25;
  // reaching for it at full stretch
  const s = plan.stretch ?? 0;
  if (!p.human) d += s * s * 0.18;
  return d;
}

/**
 * Hitting hard from below the tape is a gamble, the more so the closer to the net (from the baseline the ball has
 * room to rise and come down): extra difficulty for an attack off a low ball.
 */
export function attackRisk(kind: ShotKind, plan: Plan): number {
  if ((kind !== 'speedup' && kind !== 'drive') || plan.by >= NET_C) return 0;
  const near = clamp((5.2 - Math.abs(plan.fz)) / 2.6, 0.25, 1);
  return (NET_C - plan.by) * (kind === 'speedup' ? 0.6 : 0.5) * near;
}

/**
 * Doubles: which of the two opponents to play at. The one left behind (back while the partner is up) has to hit up
 * from the feet; otherwise usually the weaker one (slower feet), sometimes either.
 */
function pickOpp(m: Match, opps: Player[]): Player {
  const [a, b] = opps;
  const da = Math.abs(a.z);
  const db = Math.abs(b.z);
  if (Math.abs(da - db) > 1.5) return da > db ? a : b;
  if (Math.abs(a.speed - b.speed) > 0.1 && m.rng.chance(0.65)) return a.speed < b.speed ? a : b;
  return m.rng.chance(0.5) ? a : b;
}

/** Doubles: the open court, the middle of the widest gap (between the two, or beside one pulled wide). */
function gapX(m: Match, opps: Player[], s: Skill): number {
  const e = W / 2 - 0.3;
  const [x1, x2] = opps.map((o) => o.x).sort((a, b) => a - b);
  const gaps: [number, number][] = [
    [-e, x1],
    [x1, x2],
    [x2, e],
  ];
  let g = gaps[1];
  for (const c of gaps) if (c[1] - c[0] > g[1] - g[0] + 0.3) g = c;
  const w = Math.max(0, g[1] - g[0]);
  return (g[0] + g[1]) / 2 + (m.rng.next() - 0.5) * Math.min(1.2, w * (0.3 + s.risk * 0.3));
}

/**
 * Singles as singles (docs/notas-08-individual.md): one player covers the whole width, so depth, angles and the
 * passing shot decide the points, not long dink exchanges (those are doubles). The CPU in singles:
 *  · returns deep and comes in behind the return; serves and stays back (the return must bounce);
 *  · back against a player at the net: a passing shot (down the line or cross-court, low and dipping, as wide as it
 *    dares), an attacking lob followed in, at the body, or now and then a drop to follow in;
 *  · both back: deep drives; a short ball is an approach shot (deep) and in to the net; a drop shot now and then;
 *  · up at the net against a player back: volleys deep or dropped short and wide; a ball that sits up is put away;
 *  · both up: the dink is one resource among others (the roll into the open court, the speed-up, the lob), the attack
 *    the likelier the longer the exchange;
 *  · into the open court as often as their court sense says (Skill.angle), otherwise down the middle or at the player;
 *  · waits on the bisector of the angles of the reply, leaning towards the ball's side the less court sense they have
 *    (placeSingles, coverX).
 * The weights are multiplied by each rival's skill, so each keeps a style (and SOLO gives them a singles style).
 * on = 0: the CPU plays singles with the doubles brain, pressure and shanks of 0.7 (chooseShot), for comparing; the
 * rivals keep their singles values (SOLO).
 */
export const SINGLES = {
  on: 1,
  /** the sideline margin they keep is 0.3 + (1 − risk) × margin + up to 0.35 m (the bolder, the closer to the line) */
  margin: 1.0,
  /** waiting: players with less court sense lean towards the ball's side, × (1 + shade × (1 − angle)) */
  shade: 2.0,
  /** back against a player at the net, the weights: passing shot pass + passAtk × attack, lob lob × lob, drop drop ×
   *  touch, at the body body × attack */
  pass: 0.55,
  passAtk: 0.6,
  lob: 1.2,
  drop: 0.35,
  body: 0.35,
  /** the passing shot goes by him gap (+ risk × 0.8 + up to 0.5) m to the side at his depth (passingShot) */
  gap: 1.2,
  /** the attacking lob: lobClear (+ up to 0.6) m over the tape, just over his reach, and in to the net behind it */
  lobClear: 2.3,
  /** up at the net: a ball above the tape is put away with chance up × (attack + putAway) × putAwayMul */
  putAway: 0.35,
  putAwayMul: 2,
  /** up at the net against a player back: a short angled drop volley with chance touch × dropVolley */
  dropVolley: 0.35,
  /** both back: a drop shot with chance touch × rallyDrop; a short ball is an approach with chance approach × (0.4 +
   *  0.6 × rush), followed in with chance rush + approachIn */
  rallyDrop: 0.15,
  approach: 0.8,
  approachIn: 0.5,
  /** both up: a player more than wide m off the middle gets the ball rolled into the open court (chance roll + attack ×
   *  0.4); otherwise the weights: a dink touch × dink (angled wide with chance angle), an attack off a ball that is not
   *  up attack × (tired + tiredRate per shot from the 5th, at most tiredMax), a lob lob × netLob */
  wide: 1.1,
  roll: 0.4,
  dink: 0.7,
  angle: 0.6,
  tired: 0.4,
  tiredRate: 0.05,
  tiredMax: 0.6,
  netLob: 0.25,
  /** a fast ball (launched at more than runPace m/s) volleyed on the run (more than runFrom m covered since it was
   *  struck, plus the stretch; in full at runFrom + runSpan) is a block: up to onRunVolley more difficulty; and up to
   *  lowVolley more if it dips below the tape at the volleyer */
  onRunVolley: 0.6,
  runFrom: 0.5,
  runSpan: 1.5,
  runPace: 12,
  lowVolley: 0.5,
  /** the rally pressure (pressure(), both players): press per shot from the pressFrom-th (doubles: 0.055 from the
   *  6th; singles before 0.8: 0.04 from the 6th) */
  press: 0.065,
  pressFrom: 4,
  /** a contact at the quality floor shanks shank times as often as before 0.8 (shankOf; doubles: SHANK.dbl) */
  shank: 2,
};

/** What a CPU shot in singles is for: it decides where the player goes next (placeSingles). */
type Intent = 'return' | 'pass' | 'lob' | 'lobAtk' | 'drop' | 'rally' | 'approach' | 'volley' | 'dink' | 'putaway' | 'block';

/** Singles: the shot a sensible CPU player picks here, and what it is for (see SINGLES). */
function singlesShot(m: Match, p: Player, plan: Plan, s: Skill): { shot: Omit<ShotSpec, 'q' | 'timing'>; intent: Intent } {
  const r = m.rally!;
  const rng = m.rng;
  const opp = m.players.find((o) => o.team !== p.team)!;
  const side = p.side;
  const me = Math.abs(plan.fz);
  const meNet = me < AT_NET;
  // where the other one will be when the ball gets there: a player running in is read where he is going
  const oz = Math.max(0.5, Math.abs(opp.z + opp.vz * 0.35));
  const ox = opp.x + opp.vx * 0.25;
  const oppNet = oz < 3.8;
  // how attackable the ball is: 0 at the height of the tape, 1 well above it
  const up = clamp((plan.by - NET_C + 0.05) / 0.5, 0, 1);
  const chased = r.last?.lastHit?.kind === 'lob' && me > 4.0;
  // the open court: away from where the opponent is (or is heading); right in the middle, either way
  const sgn = Math.abs(ox) > 0.2 ? -Math.sign(ox) : rng.chance(0.5) ? 1 : -1;
  // how close to the sideline they dare: the bolder, the closer (more winners, more balls wide; a club player keeps
  // it nearer the middle)
  const edge = () => W / 2 - (0.3 + (1 - s.risk) * SINGLES.margin + rng.next() * 0.35);
  const deep = () => HL - 0.9 - s.risk * 0.5 - rng.next() * 0.8;
  const kitchen = () => 0.95 + rng.next() * 0.9;
  const lobDeep = () => HL - 0.45 - (1 - s.risk) * 0.7 - rng.next() * 0.6;
  const feet = () => ox + (rng.next() - 0.5) * 0.7;
  const out = (kind: ShotKind, x: number, d: number, clear: number, intent: Intent, pace?: number) => ({ shot: { kind, ...target(side, x, d), clear, pace }, intent });
  // court sense: into the open court, or a safer ball (down the middle, or at the player)
  const open = () => rng.chance(s.angle ?? 0.6);

  if (r.shots === 1) {
    // the return: deep (it keeps the server back) and in behind it
    return out('return', (rng.next() - 0.5) * 2.4 + (rng.chance(s.risk) ? sgn : 0), deep(), 0.5 + rng.next() * 0.35, 'return');
  }
  if (plan.overhead && rng.chance((0.4 + s.attack * 0.6) * (chased ? clamp((5.4 - me) / 1.4, 0, 1) : 1))) {
    // a smash: into the open court, now and then at the feet of a player at the net
    const x = oppNet && rng.chance(0.3) ? feet() : open() ? sgn * edge() * 0.85 : feet();
    return out('smash', x, oppNet ? 3.5 + rng.next() * 2 : 4 + rng.next() * 2, 0.08, 'putaway', 0.8);
  }
  if (meNet) {
    if (up > 0 && rng.chance(Math.min(0.95, up * (s.attack + SINGLES.putAway) * SINGLES.putAwayMul))) {
      // a ball that sits up at the net: put it away, into the open court (or through a player at the net)
      const x = !open() || (oppNet && rng.chance(0.2)) ? feet() : sgn * edge();
      const d = oppNet ? Math.min(HL - 0.5, oz + 1.2 + rng.next() * 2) : rng.chance(0.5) ? deep() : 3.0 + rng.next() * 1.2;
      return out('speedup', x, d, 0.1, 'putaway', 0.85);
    }
    if (!oppNet) {
      // the opponent is back: a short angled drop volley (more so when they are deep), or deep to the open corner
      if (rng.chance(s.touch * SINGLES.dropVolley * (oz > HL ? 1.4 : 0.8))) return out('dink', sgn * (1.2 + rng.next() * 1.3), 0.9 + rng.next() * 0.8, 0.15 + (1 - s.touch) * 0.15, 'volley');
      return out('drive', open() ? sgn * edge() : (rng.next() - 0.5) * 1.6, HL - 0.7 - rng.next() * 1.3, 0.15 + rng.next() * 0.12, 'volley', 0.95);
    }
    // both up at the net. A player pulled wide leaves the court open: roll it there (low, angled, dipping)
    if (Math.abs(ox) > SINGLES.wide && rng.chance(SINGLES.roll + s.attack * 0.4)) return out('drive', sgn * edge(), 2.6 + rng.next() * 1.6, 0.1 + rng.next() * 0.08, 'putaway');
    // otherwise, as each one plays: the patient dink (angled, to pull them wide), the attack off a ball that is not
    // up (a roll at the feet or a speed-up at the body: a gamble, the likelier the longer the exchange), or a lob
    const tired = clamp((r.shots - 4) * SINGLES.tiredRate, 0, SINGLES.tiredMax);
    const dinkW = s.touch * SINGLES.dink;
    const attW = s.attack * (SINGLES.tired + tired);
    const lobW = s.lob * SINGLES.netLob;
    const u = rng.next() * (dinkW + attW + lobW);
    if (u >= dinkW + attW) return out('lob', sgn * (0.8 + rng.next()), lobDeep(), SINGLES.lobClear - 0.3 + rng.next() * 0.5, 'lob');
    if (u >= dinkW) {
      if (rng.chance(0.5)) return out('speedup', open() ? sgn * edge() : feet(), Math.min(HL - 0.6, oz + 0.8 + rng.next() * 1.8), 0.14, 'putaway', 0.9);
      return out('drive', rng.chance(0.5) ? feet() : sgn * edge(), oz + 0.3 + rng.next() * 1.2, 0.1 + rng.next() * 0.08, 'putaway');
    }
    const x = rng.chance(SINGLES.angle) ? sgn * (1.5 + rng.next() * 1.1) : (rng.next() - 0.5) * 2.2;
    return out('dink', x, kitchen(), 0.14 + rng.next() * 0.12 + (1 - s.touch) * 0.15, 'dink');
  }
  if (oppNet) {
    // back (or in the transition) against a player at the net: the passing game
    if (up > 0.3 && me < 5.4 && !chased && rng.chance(s.attack * up * 0.8)) return out('drive', feet(), Math.min(HL - 0.6, oz + 0.2 + rng.next() * 1.2), 0.1, 'pass', 0.9);
    // a lob needs room: from the baseline (or chased back by one); from the transition it is a sitter
    const lobW = s.lob * SINGLES.lob * (chased ? 2 : me > HL - 1.6 ? 1 : 0.25);
    const dropW = s.touch * SINGLES.drop * (chased ? 1.3 : 1);
    const bodyW = s.attack * SINGLES.body;
    const passW = (SINGLES.pass + s.attack * SINGLES.passAtk) * (chased ? 0.4 : 1);
    let u = rng.next() * (lobW + dropW + bodyW + passW);
    if ((u -= lobW) < 0) {
      // chased back by a lob: a high one back (time to recover); otherwise an attacking lob, just over his reach, and
      // in to the net behind it (placeSingles)
      if (chased) return out('lob', sgn * (0.8 + rng.next() * 1.2), HL - 1.0 - rng.next() * 0.6, 2.6 + rng.next() * 0.8, 'lob');
      return out('lob', sgn * (0.8 + rng.next() * 1.2), lobDeep(), SINGLES.lobClear + rng.next() * 0.6, 'lobAtk');
    }
    if ((u -= dropW) < 0) {
      const x = rng.chance(0.5) ? sgn * (0.8 + rng.next() * 1.2) : ox + (rng.next() - 0.5) * 1.2;
      return out('drop', x, kitchen(), 0.24 + (1 - s.touch) * 0.25 + rng.next() * 0.1, 'drop');
    }
    if ((u -= bodyW) < 0) return out('drive', feet(), Math.min(HL - 0.6, oz + 0.3 + rng.next() * 0.9), 0.1, 'pass', 0.9);
    const pass = passingShot(plan, ox, oz, s, rng.next(), rng.next(), rng.next(), rng.next());
    return out('drive', pass.x, pass.d, 0.08 + (1 - s.risk) * 0.12 + rng.next() * 0.1, 'pass', 0.92 - s.attack * 0.08);
  }
  // both back: the baseline rally
  if (me < HL - 1.3 && !chased && rng.chance(SINGLES.approach * (0.4 + 0.6 * (s.rush ?? s.mover.netRush)))) {
    // a short ball: the approach shot, deep (often down the line), then in to the net (placeSingles)
    const own = Math.sign(plan.bx) || sgn;
    const x = rng.chance(0.6) ? own * edge() * 0.9 : sgn * edge() * 0.9;
    return out('drive', x, HL - 0.8 - rng.next() * 1.0, 0.2 + rng.next() * 0.12, 'approach', 0.95);
  }
  if (rng.chance(s.touch * SINGLES.rallyDrop * (oz > HL - 0.3 ? 1.5 : 1))) return out('drop', sgn * (0.6 + rng.next() * 1.4), kitchen(), 0.26 + (1 - s.touch) * 0.25, 'drop');
  const x = open() ? sgn * edge() * 0.85 : (rng.next() - 0.5) * 2.0;
  return out('drive', x, deep(), 0.28 + rng.next() * 0.25, 'rally');
}

/**
 * Singles, the passing shot from the contact of `plan` past a player at the net at (ox, oz from the net): down the
 * line (the side the ball is on) or cross-court, whichever leaves more room as the ball gets to him; it is aimed to go
 * by him `gap` m to that side at his depth (the bolder, the wider), landing deep, or short and angled when a deep one
 * would have to land outside the sideline. u1…u4: dice (0 … 1). Returns the landing spot: x across, d from the net.
 */
export function passingShot(plan: Plan, ox: number, oz: number, s: Skill, u1: number, u2: number, u3: number, u4: number): { x: number; d: number; line: boolean } {
  const bx = plan.bx;
  const zp = Math.abs(plan.bz);
  const own = Math.sign(bx) || (ox > 0 ? -1 : 1);
  // the room on each side of him (the sidelines at ±W/2)
  const roomLine = W / 2 - own * ox;
  const roomCross = W / 2 + own * ox;
  const line = u1 < clamp(0.5 + (roomLine - roomCross) * 0.3, 0.12, 0.88);
  const dir = line ? own : -own;
  const lim = W / 2 - (0.25 + (1 - s.risk) * 0.45 + u2 * 0.3);
  // how far past him it goes at his depth (never beyond what the sideline allows there)
  const gap = SINGLES.gap + s.risk * 0.8 + u3 * 0.5;
  const want = clamp(ox + dir * gap, -lim, lim);
  // deep first: where it lands follows from where it must be at his depth (straight over the court)
  let d = HL - 0.8 - u4 * 1.4;
  let x = bx + ((want - bx) * (zp + d)) / (zp + oz);
  if (Math.abs(x) > lim) {
    // too wide to land deep: shorter and angled, landing on the line it dares
    x = dir * lim;
    const k = (want - bx) / (zp + oz);
    d = Math.abs(k) > 1e-3 ? clamp((x - bx) / k - zp, Math.max(oz + 0.5, 3.0), HL - 0.8) : HL - 1;
  }
  return { x, d, line };
}

/**
 * Singles: where a CPU player goes after their own shot (Controller.place). Depth: the server waits back for the return
 * to bounce; the returner comes in (Mover.netRush); up at the net they stay up; from the back they come in behind an
 * approach shot (netRush + approachIn) or a drop (netRush) and stay back after a passing shot, a lob or a rally drive
 * (no waiting in no man's land). Across: the bisector of the angles the reply can take, from where the opponent will
 * meet this ball (coverX).
 */
function placeSingles(m: Match, p: Player, s: Skill, intent: Intent | null): { depth: 0 | 1 | 2; x: number } {
  const r = m.rally!;
  const rng = m.rng;
  const za = Math.abs(p.z);
  const rush = s.rush ?? s.mover.netRush;
  let depth: 0 | 2;
  if (r.shots === 1) depth = 0;
  else if (r.shots === 2) depth = rng.chance(rush) ? 2 : 0;
  else if (za < AT_NET) depth = 2;
  else if (intent === 'approach') depth = rng.chance(Math.min(1, rush + SINGLES.approachIn)) ? 2 : 0;
  else if (intent === 'drop' || intent === 'lobAtk' || (intent === 'block' && za < 5.4)) depth = rng.chance(rush) ? 2 : 0;
  else depth = 0;
  const z = DEPTH_Z[depth];
  return { depth, x: coverX(m, p, z, s) };
}

/**
 * Singles: where to wait across the court, at `z` from the net: the middle of the angles of the reply, from where the
 * opponent will meet the ball now in flight (the ball as it passes a player at the net, or where it bounces). Up at the
 * net that is a good step towards the ball's side; on the baseline, about the middle. Players with less court sense
 * (Skill.angle) lean further towards the ball's side, guarding the line and leaving the cross-court passing shot
 * open (SINGLES.shade).
 */
function coverX(m: Match, p: Player, z: number, s: Skill): number {
  const r = m.rally!;
  const opp = m.players.find((o) => o.team !== p.team)!;
  const sg = r.seg;
  let g = posAt(sg, r.tGround);
  const oz = Math.abs(opp.z);
  if (oz < AT_NET && Math.abs(g.z) > oz) {
    // volleyed: the ball as it passes the opponent's depth (how far into their half it is grows along the flight)
    let a = sg.t0;
    let b = r.tGround;
    for (let i = 0; i < 16; i++) {
      const t = (a + b) / 2;
      if (-posAt(sg, t).z * p.side < oz) a = t;
      else b = t;
    }
    g = posAt(sg, b);
  }
  // after the bounce a deep ball is met further back
  const hd = Math.abs(g.z) > 4 ? Math.abs(g.z) + 0.8 : Math.max(Math.abs(g.z), 0.5);
  const lean = 1 + SINGLES.shade * (1 - (s.angle ?? 0.6));
  return clamp(((g.x * (HL - z)) / (hd + HL)) * lean, -1.8, 1.8);
}

/**
 * The shot a sensible CPU player picks here.
 * Doubles: the open court is the widest gap (often the middle), shots at the feet go to the opponent picked by
 * pickOpp, lobs go over a player at the net, dinks cross-court; "they are at the net" means both of them.
 */
export function chooseShot(m: Match, p: Player, plan: Plan, s: Skill): Omit<ShotSpec, 'q' | 'timing'> {
  const r = m.rally!;
  const rng = m.rng;
  const opps = m.players.filter((o) => o.team !== p.team);
  const dbl = opps.length > 1;
  const opp = dbl ? pickOpp(m, opps) : opps[0];
  const oppAtNet = dbl ? opps.every((o) => Math.abs(o.z) < AT_NET) : opps.some((o) => Math.abs(o.z) < AT_NET);
  const meAtNet = Math.abs(plan.fz) < AT_NET;
  // how attackable the ball is: 0 at the height of the tape, 1 well above it
  const up = clamp((plan.by - NET_C + 0.05) / 0.5, 0, 1);
  const side = p.side;
  // away from the opponent, towards the open sideline (doubles: the widest gap)
  const openX = () => (dbl ? gapX(m, opps, s) : -Math.sign(opp.x || rng.next() - 0.5) * (1.4 + s.risk * 1.1 + rng.next() * 0.5));
  const atFeet = () => opp.x + (rng.next() - 0.5) * 0.8;
  // doubles: over the head of a player at the net
  const overNet = () => {
    const o = Math.abs(opp.z) < AT_NET ? opp : opps.find((q) => Math.abs(q.z) < AT_NET) ?? opp;
    return o.x * 0.85 + (rng.next() - 0.5) * 0.6;
  };
  const deep = () => HL - 0.9 - s.risk * 0.5 - rng.next() * 0.8;
  const kitchen = () => 0.95 + rng.next() * 0.9;
  // a lob over a net player: the bolder, the deeper (and the likelier to sail out)
  const lobDeep = () => HL - 0.45 - (1 - s.risk) * 0.7 - rng.next() * 0.6;
  // chased back by a lob: the sensible reply is defensive (a lob back or a drop), not a drive; a deep lob is not
  // smashed on the run
  const chased = r.last?.lastHit?.kind === 'lob' && Math.abs(plan.fz) > HL - 1.6;
  const chasedDeep = r.last?.lastHit?.kind === 'lob' && Math.abs(plan.fz) > 4.0;
  let kind: ShotKind;
  let x: number;
  let d: number;
  let clear: number;
  let pace: number | undefined;

  if (r.shots === 1) {
    // return of serve: deep, high enough to be safe, lets the returner move up
    kind = 'return';
    x = (rng.next() - 0.5) * 2.4 + (rng.chance(s.risk) ? openX() * 0.5 : 0);
    d = deep();
    clear = 0.5 + rng.next() * 0.35;
  } else if (plan.overhead && rng.chance((0.4 + s.attack * 0.6) * (chasedDeep ? clamp((5.4 - Math.abs(plan.fz)) / 1.4, 0, 1) : 1))) {
    kind = 'smash';
    x = rng.chance(0.5) ? openX() : atFeet();
    d = oppAtNet ? 3.5 + rng.next() * 2 : 4 + rng.next() * 2;
    clear = 0.08;
    pace = 0.8;
  } else if (up > 0 && meAtNet && rng.chance(Math.min(0.95, up * (dbl ? s.attack * DOUBLES.attack + DOUBLES.add : s.attack)))) {
    // a ball that sits up at the net: speed it up flat through the body (it would land behind them) or the open side
    kind = 'speedup';
    x = rng.chance(0.55) ? atFeet() : openX();
    d = oppAtNet ? Math.min(HL - 0.5, Math.abs(opp.z) + 1.2 + rng.next() * 2) : deep();
    clear = 0.1;
    pace = 0.85;
  } else if (up > 0.3 && !meAtNet && oppAtNet && !chased && rng.chance(s.attack * up * 0.6)) {
    // a high ball coming in from the transition zone: hit down at the feet of the player at the net
    kind = 'drive';
    x = rng.chance(0.6) ? atFeet() : openX();
    d = Math.min(HL - 0.6, Math.abs(opp.z) + 0.2 + rng.next() * 1.2);
    clear = 0.1;
    pace = 0.9;
  } else if (meAtNet && oppAtNet && up === 0 && rng.chance(s.lob * 0.1)) {
    // a lob out of the dink exchange, over the player at the net
    kind = 'lob';
    x = dbl ? overNet() : openX() * 0.6;
    d = lobDeep();
    clear = 2.0 + rng.next() * 0.5;
  } else if (meAtNet && oppAtNet && rng.chance(s.attack * (0.06 + Math.min(0.12, r.shots * 0.006)) * (dbl ? DOUBLES.tired : 1))) {
    // tired of dinking: a speed-up off a ball that is not really up (risky: hit from below the tape)
    kind = 'speedup';
    x = rng.chance(0.6) ? atFeet() : openX();
    d = Math.min(HL - 0.6, Math.abs(opp.z) + 0.8 + rng.next() * 1.8);
    clear = 0.14;
    pace = 0.9;
  } else if (meAtNet && oppAtNet) {
    if (rng.chance(s.touch)) {
      kind = 'dink';
      if (dbl) x = rng.chance(0.55) ? -p.x * 0.85 + (rng.next() - 0.5) * 0.8 : opp.x * 0.75 + (rng.next() - 0.5) * 0.8; // cross-court, or at one of them
      else x = rng.chance(0.5) ? -opp.x * 0.8 + (rng.next() - 0.5) : (rng.next() - 0.5) * 3.2;
      d = kitchen();
      clear = 0.14 + rng.next() * 0.12 + (1 - s.touch) * 0.15;
    } else {
      kind = 'drive';
      x = atFeet();
      d = 3 + rng.next() * 2;
      clear = 0.16;
      pace = 0.95;
    }
  } else if (!meAtNet && oppAtNet) {
    const roll = rng.next();
    // a lob needs room: from the baseline (or chased back by one); from the transition zone it is a sitter
    const lob = chased ? s.lob * 0.6 + 0.3 : Math.abs(plan.fz) > HL - 1.6 ? s.lob * 0.6 : s.lob * 0.1;
    if (roll < lob) {
      kind = 'lob';
      x = dbl ? overNet() : openX() * 0.6;
      d = chased ? HL - 1.0 - rng.next() * 0.6 : lobDeep();
      clear = (chased ? 2.6 : 2.3) + rng.next() * 0.8;
    } else if (roll < lob + s.touch + (chased ? 0.2 : 0)) {
      kind = 'drop';
      x = (rng.next() - 0.5) * 3.4;
      d = kitchen();
      clear = 0.24 + (1 - s.touch) * 0.25 + rng.next() * 0.1;
    } else {
      kind = 'drive';
      x = rng.chance(0.5) ? atFeet() : openX();
      d = 3.5 + rng.next() * 2.5;
      clear = 0.14 + rng.next() * 0.12;
    }
  } else if (meAtNet && !oppAtNet) {
    // the opponent is stuck back: push them deep or make them run in
    if (rng.chance(0.3 * s.touch)) {
      kind = 'dink';
      x = openX() * 0.7;
      d = kitchen();
      clear = 0.2;
    } else {
      kind = 'drive';
      x = openX();
      d = deep();
      clear = 0.2 + rng.next() * 0.15;
    }
  } else {
    // both back. The third shot is the classic drop when the player has the touch for it.
    if (r.shots === 2 && rng.chance(s.touch * 0.8)) {
      kind = 'drop';
      x = (rng.next() - 0.5) * 3;
      d = kitchen();
      clear = 0.26 + (1 - s.touch) * 0.25;
    } else {
      kind = 'drive';
      // doubles: at the feet of the one picked (the one left back, if they are split) or into the gap
      if (dbl) x = rng.chance(0.5) ? atFeet() : openX();
      else x = rng.chance(0.5) ? openX() : (rng.next() - 0.5) * 2.4;
      d = deep();
      clear = 0.22 + rng.next() * 0.2;
    }
  }
  return { kind, ...target(side, x, d), clear, pace };
}

/** The rivals of the ladder, from the park regular to the club champion. */
export interface Rival {
  id: string;
  name: string;
  /** i18n key of the one-line description */
  tag: string;
  look: number;
  skill: Skill;
}

const mv = (netRush: number, misjudge: number, _old: number, lunge = 0): Mover => ({ netRush, misjudge, lunge });

/**
 * Feet: the human runs at 4.6 m/s and reaches 1 m; the first three rivals are clearly slower and reach less, Nuria and
 * Reina about the same (Reina's reach is 0.3 + lunge = 1.0 m). Read: the spread of their first read of a fast ball.
 * These are the 0.7 skills. Doubles keeps them as they were (PAIRS, DOUBLES_SKILLS); singles (RIVALS) plays them with
 * its own game plan (SINGLES) and a few values of its own (SOLO), docs/notas-08-individual.md.
 */
export const DOUBLES_SKILLS: Record<string, Skill> = {
  paco: { speed: 3.5, reaction: 0.36, q: 0.64, qVar: 0.16, touch: 0.15, attack: 0.25, lob: 0.25, risk: 0.1, mover: mv(0.15, 0.25, 0.03, 0.35), serveDelay: 1.3, poise: 1, read: 0.32 },
  lola: { speed: 4.1, reaction: 0.27, q: 0.77, qVar: 0.13, touch: 0.7, attack: 0.3, lob: 0.15, risk: 0.2, mover: mv(0.6, 0.15, 0.01, 0.55), serveDelay: 1.1, poise: 0.75, read: 0.2 },
  bruno: { speed: 4.3, reaction: 0.25, q: 0.78, qVar: 0.12, touch: 0.35, attack: 0.45, lob: 0.1, risk: 0.22, mover: mv(0.6, 0.1, 0.006, 0.6), serveDelay: 0.9, poise: 0.65, read: 0.18 },
  nuria: { speed: 4.6, reaction: 0.2, q: 0.83, qVar: 0.1, touch: 0.7, attack: 0.5, lob: 0.25, risk: 0.25, mover: mv(0.85, 0.06, 0.002, 0.7), serveDelay: 1.0, poise: 0.46, read: 0.12 },
  reina: { speed: 4.7, reaction: 0.18, q: 0.87, qVar: 0.08, touch: 0.85, attack: 0.65, lob: 0.2, risk: 0.5, mover: mv(0.95, 0.03, 0, 0.75), serveDelay: 0.9, poise: 0.55, read: 0.08 },
};

/**
 * Singles: what each rival plays differently from doubles (on top of DOUBLES_SKILLS), for their style in singles and
 * the ladder (docs/notas-08-individual.md).
 */
const SOLO: Record<string, Partial<Skill>> = {
  // a baseliner who keeps it in the middle
  paco: { angle: 0.3 },
  // patient: from mid-court, drops and dinks, comes in less than in doubles
  lola: { angle: 0.45, rush: 0.45, speed: 3.85, reaction: 0.31, q: 0.73 },
  // hits hard from the back: passing shots and drives, comes in only behind a short ball
  bruno: { angle: 0.5, rush: 0.3, q: 0.77 },
  // comes in behind everything and volleys
  nuria: { angle: 0.7, q: 0.8 },
  // does it all, into the open court
  reina: { angle: 0.85, q: 0.92, reaction: 0.16, speed: 4.8 },
};
const solo = (id: string): Skill => ({ ...DOUBLES_SKILLS[id], ...SOLO[id] });

export const RIVALS: Rival[] = [
  { id: 'paco', name: 'Riley', tag: 'rival.paco', look: 1, skill: solo('paco') },
  { id: 'lola', name: 'Andrei', tag: 'rival.lola', look: 2, skill: solo('lola') },
  { id: 'bruno', name: 'Hayden', tag: 'rival.bruno', look: 3, skill: solo('bruno') },
  { id: 'nuria', name: 'Cristian', tag: 'rival.nuria', look: 4, skill: solo('nuria') },
  { id: 'reina', name: 'Ben', tag: 'rival.reina', look: 5, skill: solo('reina') },
];

/**
 * Doubles: the human's partner, a steady club player who keeps to her half and moves with him. (0.7: contact 0.82,
 * it was 0.80: with doubles points that resolve sooner the pair she plays in needed it to stay where it was.)
 */
export const PARTNER: Rival = {
  id: 'marta',
  name: 'Gabe',
  tag: 'partner.marta',
  look: 6,
  skill: { speed: 4.3, reaction: 0.22, q: 0.82, qVar: 0.09, touch: 0.65, attack: 0.45, lob: 0.12, risk: 0.25, mover: mv(0.85, 0.06, 0.003, 0.65), serveDelay: 1.0, poise: 0.63, read: 0.14 },
};

/** Doubles: the club's pairs, two rivals of the ladder each, from the Sunday pair to the champions. */
export interface Pair {
  id: string;
  a: Rival;
  b: Rival;
  /** i18n key of the one-line description */
  tag: string;
}
// (a rival as they play in a pair: the doubles skill, DOUBLES_SKILLS)
const rv = (id: string): Rival => ({ ...RIVALS.find((r) => r.id === id)!, skill: DOUBLES_SKILLS[id] });
export const PAIRS: Pair[] = [
  { id: 'paco-lola', a: rv('paco'), b: rv('lola'), tag: 'pair.pacoLola' },
  { id: 'lola-bruno', a: rv('lola'), b: rv('bruno'), tag: 'pair.lolaBruno' },
  { id: 'bruno-nuria', a: rv('bruno'), b: rv('nuria'), tag: 'pair.brunoNuria' },
  { id: 'nuria-reina', a: rv('nuria'), b: rv('reina'), tag: 'pair.nuriaReina' },
];

/** The human's movement: positioning is automatic and follows good pickleball habits. */
export const HUMAN_MOVER: Mover = mv(0.9, 0, 0);
export const HUMAN_SPEED = 4.6;
export const HUMAN_REACTION = 0.1;

/**
 * The shot the human's player plays alone when the thumb gave no aim (assisted swing): a safe reset, never an attack
 * on a ball that does not ask for it. Up at the net with the opponent there too, a soft dink to the middle of the
 * kitchen; back with the opponent at the net, a soft drop; a ball over the head at the net, hit down to the middle;
 * otherwise a high ball deep down the middle. It gets the ball back, nothing more: aiming beats it.
 */
export function autoShot(m: Match, p: Player, plan: Plan): Omit<ShotSpec, 'q' | 'timing'> {
  const r = m.rally;
  const rng = m.rng;
  const opps = m.players.filter((o) => o.team !== p.team);
  const oppAtNet = opps.length > 1 ? opps.every((o) => Math.abs(o.z) < AT_NET) : opps.some((o) => Math.abs(o.z) < AT_NET);
  const meAtNet = Math.abs(plan.fz) < AT_NET;
  const x = (rng.next() - 0.5) * 1.4;
  if (r && r.shots === 1) return { kind: 'return', ...target(p.side, x, HL - 1.4 - rng.next() * 0.6), clear: 0.75 };
  // a ball over the head up at the net: the reflex is to hit it down, to the middle and not too hard (aiming picks
  // the spot and the pace); lifting it back up deep only fed the other side a smash
  if (plan.overhead && meAtNet && AUTO_SHOT.putAway) return { kind: 'smash', ...target(p.side, x, 4.4 + rng.next() * 1.4), clear: 0.12, pace: 0.95 };
  if (oppAtNet && !plan.overhead) {
    if (meAtNet) return { kind: 'dink', ...target(p.side, x, 1.3 + rng.next() * 0.5), clear: 0.27 };
    return { kind: 'drop', ...target(p.side, x, 1.5 + rng.next() * 0.7), clear: 0.42 };
  }
  return { kind: 'auto', ...target(p.side, x, HL - 1.3 - rng.next() * 0.8), clear: 0.85 + rng.next() * 0.25 };
}

/** The automatic shot's options (tools try them off). */
export const AUTO_SHOT = { putAway: true };

/**
 * Shot type from where the human aims: in the kitchen = dink/drop, past the baseline band = lob, a ball over the head
 * = smash. `attack` (a flick, F, the right button): a speed-up, or a smash over the head (ATTACK). A slow drag no
 * longer speeds a high ball up by itself (0.7 did when aiming deep at the net: AIM.slowSpeedup brings it back).
 */
export function kindForAim(m: Match, p: Player, plan: Plan, d: number, lob: boolean, attack = false): { kind: ShotKind; clear: number; pace?: number } {
  const r = m.rally;
  if (!r) return { kind: 'serve', clear: 0.7 };
  if (attack) return plan.overhead ? { kind: 'smash', clear: ATTACK.smashClear, pace: ATTACK.smashPace } : { kind: 'speedup', clear: ATTACK.clear, pace: ATTACK.pace };
  if (lob) return { kind: 'lob', clear: 2.8 };
  const meAtNet = Math.abs(plan.fz) < AT_NET;
  if (d < AIM_SOFT) return meAtNet ? { kind: 'dink', clear: 0.17 } : { kind: 'drop', clear: 0.3 };
  if (plan.overhead) return { kind: 'smash', clear: 0.08, pace: 0.8 };
  if (AIM.slowSpeedup && meAtNet && plan.by > NET_C + 0.2) return { kind: 'speedup', clear: 0.1, pace: 0.85 };
  if (r.shots === 1) return { kind: 'return', clear: 0.55 };
  return { kind: 'drive', clear: 0.2 };
}
/** The aim mapping's options (tools try them): `slowSpeedup` = 0.7's hidden attack (a slow drag deep at the net). */
export const AIM = { slowSpeedup: false };
/** the human's aim: closer to the net than this (m) is a soft ball (a chiquita, a dejada) */
export const AIM_SOFT = 4.2;
void SERVICE;

/**
 * The human's attack (docs/notas-08-ataque.md): a flick (or F, or the right button) is a flat, fast speed-up, or a
 * smash off a ball over the head. Where it goes:
 *  · not aimed (the drag before the stroke under `aimed` px): at the body of the opponent in front, down its middle
 *    (`side` m towards the paddle side) and low, landing `behind` m past the feet (the ball goes through the knees).
 *    Measured (tools/review/attack08.ts, medio against Nuria and Reina, 48 matches): down the middle and low it wins
 *    the point within two shots 48–50 % of the time, at the paddle-side hip and 0.8 m past the feet 33 % (the
 *    opponent only has to block it): 52–53 / 39 % of the points against 46 / 36 %;
 *  · aimed: where the drag pointed, never short of the opponent (a flat ball aimed into the kitchen goes at the feet);
 *  · the stroke's angle bends it across: `bend` m for a stroke 45° off straight up (world x, from the hitter's view).
 * A low ball is a gamble (attackRisk × `lowRisk`: a flick from below the tape has to be hit up and goes wrong more
 * often than a placed drive); a ball that sits up is the one to hit (attackable). An attack let go outside the golden
 * window is `rough` rougher than a placed shot (a full swing: the timing matters more).
 */
export const ATTACK = { aimed: 20, side: 0, behind: 0.25, minDepth: DEPTH_Z[2] + 1.2, bend: 1.4, clear: 0.1, pace: 0.85, smashClear: 0.07, smashPace: 0.75, lowRisk: 3, rough: 0.04 };
export function attackTarget(m: Match, p: Player, plan: Plan, aimed: { x: number; z: number } | null, bend: number): { tx: number; tz: number } {
  const opps = m.players.filter((o) => o.team !== p.team);
  const want = (aimed ? aimed.x : plan.bx) + bend;
  const opp = opps.reduce((a, b) => (Math.abs(b.x - want) < Math.abs(a.x - want) ? b : a));
  const od = Math.abs(opp.z);
  let x: number;
  let d: number;
  if (aimed) {
    x = aimed.x + bend;
    d = Math.max(Math.abs(aimed.z), Math.min(HL - 0.35, od + 0.3));
  } else {
    // (the opponent's right is +x on the near side, −x on the far side)
    x = opp.x + opp.side * ATTACK.side + bend;
    d = clamp(od + ATTACK.behind, ATTACK.minDepth, HL - 0.35);
  }
  return { tx: clamp(x, -W / 2 + 0.2, W / 2 - 0.2), tz: -p.side * Math.min(HL + 0.4, d) };
}

/**
 * The human's tap (docs/notas-08-ataque.md): a block or reset, a soft ball into the kitchen, low, towards the middle
 * (`x` of the way from the contact) and `depth` m from the net (± `spread`): a dink up at the net, a drop from further
 * back. Timed in the golden window it is clean (it takes the pace off an attack); `good` s either side of the window
 * it is a plain block; further off, a poor one (worse than the automatic reset). See HumanController.
 */
export const BLOCK = { depth: 1.15, spread: 0.6, x: 0.4, clear: 0.15, clearBack: 0.26, good: 0.12, perfectMin: 0.84, soak: 0.6, miss: 0.04 };
export function blockShot(m: Match, p: Player, plan: Plan): Omit<ShotSpec, 'q' | 'timing'> {
  const atNet = Math.abs(plan.fz) < AT_NET;
  const x = plan.bx * BLOCK.x + (m.rng.next() - 0.5) * 1.2;
  const d = BLOCK.depth + (atNet ? 0 : 0.3) + m.rng.next() * BLOCK.spread;
  return { kind: atNet ? 'dink' : 'drop', ...target(p.side, x, d), clear: atNet ? BLOCK.clear : BLOCK.clearBack };
}

/**
 * A ball the player can attack (docs/notas-08-ataque.md, with the numbers that set it): met at least `over` m above
 * the tape within `near` m of the net (further back it has to come `slope` m higher per metre; a ball over the head
 * up to `overhead` m from the net), once the two-bounce rule allows a volley exchange (from the third shot), not a
 * volley from the kitchen nor one going out, and with time to set up the swing (the awkwardness of the ball,
 * difficulty, at most `hard`). Measured (tools/review/attack08.ts, FORCE): above the tape at the kitchen line an attack
 * gains 11–48 points in 100 balls over what the player does otherwise, below it loses 15–22, and from the transition
 * zone it gains nothing (a smash from 5 m loses). The HUD lights it (the ring at the feet in orange, «¡Atácala!»); the
 * training and the bots read it too.
 */
export const ATTACKABLE = { over: 0.1, near: 3.0, slope: 0.12, overhead: 4.2, hard: 0.35 };
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
 * The ball coming at `p` is an attack: a speed-up or smash from the other side, or a drive faster than `pace` m/s
 * (along the court) at a player up at the net (within `near` m). The answer is a block (a tap in the golden window).
 */
export const UNDER_ATTACK = { pace: 13, near: 4.2 };
export function underAttack(m: Match, p: Player): boolean {
  const r = m.rally;
  const lh = r?.last && r.last.team !== p.team ? r.last.lastHit : null;
  if (!lh) return false;
  if (lh.kind === 'speedup' || lh.kind === 'smash') return true;
  return lh.kind === 'drive' && Math.abs(p.z) < UNDER_ATTACK.near && ballSpeed(m) > UNDER_ATTACK.pace;
}

/**
 * For the HUD, the training and the bots (docs/notas-08-ataque.md): what the coming ball asks of `p` at the contact
 * `plan` (the circle, or the contact in reach): 'attack' (attackable), 'block' (an attack coming at him) or null.
 */
export function ballCue(m: Match, p: Player, plan: Plan | null): 'attack' | 'block' | null {
  if (m.phase !== 'rally' || !plan || plan.oops || plan.out) return null;
  const r = m.rally;
  if (!r?.last || r.last.team === p.team) return null;
  if (underAttack(m, p)) return 'block';
  return attackable(m, p, plan) ? 'attack' : null;
}

/**
 * The human's lob, from how far past the baseline band he drags (f: 0 … 1): from a high, safe lob that lands short
 * (HL − 1.6, it gets smashed) to a lower one that lands deep (HL − 0.4, a weapon over a net player, but it can sail out).
 */
export function lobShape(f: number): { depth: number; clear: number } {
  const k = clamp(f, 0, 1);
  return { depth: HL - 1.6 + k * 1.2, clear: 3.0 - k * 0.8 };
}

/**
 * Contact quality of the human's swing: released in the golden window (before the awkwardness of the ball), aimed but
 * released outside it (assisted swing), and the automatic reset.
 */
export const Q_PERFECT = 0.9;
export const Q_AIMED = 0.84;
export const Q_AUTO = 0.78;
