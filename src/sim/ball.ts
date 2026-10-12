// Ball flight with gravity, air drag and spin, solved in closed form (no integration error, so the game, the
// bot, the AI's predictions and a future online server all agree on where the ball goes). Tennis (ITF ball, the
// court's surface: GROUND).
//
// Each stretch of flight (a Seg) carries its own drag k and effective gravity g:
//   v(t) = v0·e^(−kt) + (g/k)(e^(−kt) − 1)·ŷ
//   p(t) = p0 + v0·f(t) − (g/k)·t·ŷ   with f(t) = (1 − e^(−kt))/k   (the vertical term uses v0y + g/k)
//
// · Drag. A tennis ball (57.5 g, r 33.5 mm, Cd about 0.55) has quadratic drag (≈ 0.02·v² m/s²: ½ρ·Cd·A/m). Linear drag
//   with k picked from the launch stands in for it over one flight (dragFor, fitted on tennis shots from a 7 m/s drop
//   volley to a 60 m/s serve: docs/tenis/notas-01-simulacion.md).
// · Spin. Topspin (+) presses the ball down (Magnus), backspin (−) holds it up: a heavier or lighter g. A tennis
//   topspin drive dips hard (1.55 g at spin 1), a slice floats (0.7 g at −1).
// · Bounce on the court (GROUND, by surface). Restitution for the height, friction at the contact patch for the pace:
//   a sliced ball grips and stays low, a topspin ball kicks on and up, a fast flat one skids. Clay grips (slow, high),
//   grass slips (fast, low), the hard court is in between (ITF court pace: docs/tenis/notas-01-simulacion.md).
// · No walls: the dead ball stops at the boards of the stands (boardTime, boardBounce).

import { NET_C, R, netHeight, type CourtSurface } from './court';

export const G = 9.81;
/** quadratic drag coefficient of a tennis ball (½ρ·Cd·A/m), m⁻¹ */
const C_DRAG = 0.02;
/**
 * The court's surface: `e` the vertical restitution at a gentle landing (ITF: dropped from 2.54 m a ball comes back
 * 1.35–1.47 m, e ≈ 0.73–0.76 on a hard floor; less off a hard landing, `drop` per m/s over 6), `mu` the friction of
 * the ball on it. ITF court pace (CPR = 100·(1 − μ) + 150·(0.81 − e), the test ball at 30 m/s and 16°): clay about 25
 * (slow), hard about 40 (medium-fast), grass about 48 (fast).
 */
export const GROUND: Record<CourtSurface, { e: number; mu: number; drop: number }> = {
  hard: { e: 0.76, mu: 0.6, drop: 0.006 },
  clay: { e: 0.81, mu: 0.78, drop: 0.005 },
  grass: { e: 0.69, mu: 0.48, drop: 0.007 },
};
/** the surface the ball bounces on now (Match sets it: setGround) */
let ground = GROUND.hard;
let groundName: CourtSurface = 'hard';
export function setGround(s: CourtSurface = 'hard') {
  ground = GROUND[s] ?? GROUND.hard;
  groundName = GROUND[s] ? s : 'hard';
}
export function groundOf(): CourtSurface {
  return groundName;
}
/** Vertical restitution on the hard court at a gentle landing (the default surface). */
export const BOUNCE_Y = GROUND.hard.e;
/** spin 1 as the speed of the ball's surface (ω·r, m/s): a heavy topspin ball turns at about 3,000 rpm */
export const SPIN_SURF = 10;
/** the ball's moment of inertia over m·r² (a thin hollow shell) */
const ALPHA = 0.67;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One stretch of flight between two events (a hit, a bounce, the tape). */
export interface Seg {
  t0: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** linear drag (1/s) */
  k: number;
  /** effective gravity, Magnus included (m/s²) */
  g: number;
  /** −1 … 1: backspin … topspin (also drives how the ball is drawn spinning) */
  spin: number;
  /** rolling on the ground after the point (y stays at R) */
  roll?: boolean;
}

/**
 * Drag for a ball launched at `speed` m/s, `hspeed` of it horizontal (linear stand-in for the quadratic drag over
 * one flight, fitted on the game's shots from 6 to 22 m/s and −12° to 50° and checked up to a 60 m/s serve).
 */
export function dragFor(speed: number, hspeed = speed): number {
  return Math.min(1.4, Math.max(0.06, C_DRAG * (0.32 * speed + 0.54 * hspeed)));
}
const dragOf = (v: Vec3) => dragFor(Math.hypot(v.x, v.y, v.z), Math.hypot(v.x, v.z));
/** Effective gravity with spin: topspin 1 → 1.55 g, backspin −1 → 0.7 g. */
export function gravityFor(spin: number): number {
  return G * (1 + (spin > 0 ? 0.55 : 0.3) * spin);
}

const fk = (k: number, dt: number) => (1 - Math.exp(-k * dt)) / k;

export function posAt(s: Seg, t: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const dt = t - s.t0;
  const ff = fk(s.k, dt);
  const gk = s.g / s.k;
  out.x = s.x + s.vx * ff;
  out.z = s.z + s.vz * ff;
  out.y = s.roll ? R : s.y + (s.vy + gk) * ff - gk * dt;
  return out;
}

export function velAt(s: Seg, t: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const e = Math.exp(-s.k * (t - s.t0));
  const gk = s.g / s.k;
  out.x = s.vx * e;
  out.z = s.vz * e;
  out.y = s.roll ? 0 : (s.vy + gk) * e - gk;
  return out;
}

const yAt = (s: Seg, dt: number) => {
  const gk = s.g / s.k;
  return s.y + (s.vy + gk) * fk(s.k, dt) - gk * dt;
};

/** First time after t0 when the ball comes down to the ground (centre at height R). */
export function groundTime(s: Seg): number {
  if (s.roll) return Infinity;
  let a = 0;
  let b = 0;
  const step = 0.02;
  // walk until it is below; the first sample is a hair after the start so a bounce does not re-trigger
  let prev = 1e-4;
  for (let dt = step; dt < 12; dt += step) {
    if (yAt(s, dt) <= R) {
      a = prev;
      b = dt;
      break;
    }
    prev = dt;
  }
  if (b === 0) return s.t0 + 12;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (yAt(s, m) <= R) b = m;
    else a = m;
  }
  return s.t0 + b;
}

/** Time the ball crosses the plane of the net (z = 0), or null if it never does. */
export function netTime(s: Seg): number | null {
  if (s.vz === 0 || Math.sign(s.vz) === Math.sign(s.z) || s.z === 0) return null;
  const u = 1 + (s.k * s.z) / s.vz; // e^(−k·dt) at the crossing
  if (u <= 0) return null;
  return s.t0 - Math.log(u) / s.k;
}

/** Initial velocity that takes the ball from `from` to the ground at (tx, tz) in T seconds, for drag k and gravity g. */
export function solveVel(from: Vec3, tx: number, tz: number, T: number, k: number, g: number): Vec3 {
  const ff = fk(k, T);
  const gk = g / k;
  return {
    x: (tx - from.x) / ff,
    z: (tz - from.z) / ff,
    y: (R - from.y + gk * T) / ff - gk,
  };
}

/** The launch for flight time T, with the drag worked out from the launch speed it needs (a few fixed-point steps). */
function launchFor(from: Vec3, tx: number, tz: number, T: number, g: number): { v: Vec3; k: number } {
  const d = Math.hypot(tx - from.x, tz - from.z);
  let k = dragFor((d / T) * 1.1);
  let v = solveVel(from, tx, tz, T, k, g);
  for (let i = 0; i < 3; i++) {
    k = dragOf(v);
    v = solveVel(from, tx, tz, T, k, g);
  }
  return { v, k };
}

/** Height of the ball over the net tape when it crosses (negative = into the net). */
export function clearanceFor(from: Vec3, v: Vec3, k: number, g: number): number {
  const s: Seg = { t0: 0, x: from.x, y: from.y, z: from.z, vx: v.x, vy: v.y, vz: v.z, k, g, spin: 0 };
  const tn = netTime(s);
  if (tn === null) return 99;
  const p = posAt(s, tn);
  return p.y - R - netHeight(p.x);
}

export interface Shot {
  v: Vec3;
  T: number;
  k: number;
  g: number;
}

/**
 * The flight time whose arc crosses the net `clear` metres above the tape, landing at (tx, tz), with `spin`.
 * `minT` caps the pace (the fastest a human can hit it over that distance).
 */
export function shotByClearance(from: Vec3, tx: number, tz: number, clear: number, minT: number, spin = 0, maxT = 4.2): Shot {
  const g = gravityFor(spin);
  let a = minT;
  let b = maxT;
  const h = (T: number) => {
    const l = launchFor(from, tx, tz, T, g);
    return clearanceFor(from, l.v, l.k, g) - clear;
  };
  const done = (T: number): Shot => ({ ...launchFor(from, tx, tz, T, g), T, g });
  if (h(a) >= 0) return done(a); // even the fastest shot clears: a put-away
  if (h(b) < 0) return done(b);
  for (let i = 0; i < 28; i++) {
    const m = (a + b) / 2;
    if (h(m) >= 0) b = m;
    else a = m;
  }
  return done(b);
}

/**
 * Height of the ball where its flight from `from` with velocity `v` crosses the plane z = `zp` (null: it never does,
 * or it is down before it gets there).
 */
export function heightAtPlane(from: Vec3, v: Vec3, k: number, g: number, zp: number): number | null {
  const s: Seg = { t0: 0, x: from.x, y: from.y, z: from.z, vx: v.x, vy: v.y, vz: v.z, k, g, spin: 0 };
  if (v.z === 0 || Math.sign(zp - from.z) !== Math.sign(v.z)) return null;
  const u = 1 + (k * (from.z - zp)) / v.z; // e^(−k·dt) where it crosses
  if (u <= 0) return null;
  const y = posAt(s, -Math.log(u) / k).y;
  return y < R ? null : y;
}

/**
 * The lob over a player (the studio's pickleball 0.11, docs/notas-04-simulacion.md): the height over the net tape of
 * the arc from `from` that lands at (tx, tz) and passes the plane z = `zp` `h` m above the floor, with `spin`. The
 * higher it must go there, the longer it hangs (minT … maxT caps it); null if the plane is not between the contact and
 * the landing. A height over the tape, so the lob is played as any other shot (ShotSpec.clear, Match.launch).
 */
export function clearOver(from: Vec3, tx: number, tz: number, zp: number, h: number, spin: number, minT = 0.8, maxT = 3.6): number | null {
  if (Math.sign(zp) === Math.sign(from.z) || Math.abs(zp) >= Math.abs(tz) - 0.2) return null;
  const g = gravityFor(spin);
  const at = (T: number) => {
    const l = launchFor(from, tx, tz, T, g);
    return { l, y: heightAtPlane(from, l.v, l.k, g, zp) ?? 0 };
  };
  let a = minT;
  let b = maxT;
  if (at(a).y >= h) b = a;
  else if (at(b).y < h) a = b;
  else
    for (let i = 0; i < 24; i++) {
      const m = (a + b) / 2;
      if (at(m).y >= h) b = m;
      else a = m;
    }
  const { l } = at(b);
  return clearanceFor(from, l.v, l.k, g);
}

/** Fastest sensible flight time over a horizontal distance (≈ 30 m/s average, a hard flat groundstroke). */
export function minFlight(d: number): number {
  return Math.max(0.2, d / 30);
}

/** A segment that starts at `p` with velocity `v` at time t0 (drag from the speed unless given). */
export function seg(t0: number, p: Vec3, v: Vec3, spin = 0, k?: number, g?: number): Seg {
  return { t0, x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, spin, k: k ?? dragOf(v), g: g ?? gravityFor(spin) };
}

/**
 * The segment after bouncing at time t (rigid-ball bounce with friction, as in tennis models). The height comes from
 * the restitution, a touch lower off a hard landing. The pace comes from the friction at the contact patch: the
 * patch moves at (horizontal speed − ω·r); friction can take at most μ·(1 + e)·(landing speed) off it, and stops
 * once the ball rolls. So a sliced or flat ball grips and loses pace (a dink checks and sits up), a topspin ball keeps
 * it, and a fast flat ball skids through. The ball leaves turning forwards (drawn spin, a little Magnus).
 */
export function bounce(s: Seg, t: number): Seg {
  const p = posAt(s, t);
  const v = velAt(s, t);
  const vh = Math.hypot(v.x, v.z);
  const vn = Math.max(0, -v.y);
  // (a sliced ball skids: it comes up a little lower, SLICE)
  const ey = (ground.e - ground.drop * Math.max(0, vn - 6)) * (s.spin <= SLICE.from ? 1 + SLICE.low * s.spin : 1);
  const wr = s.spin * SPIN_SURF;
  const jRoll = (ALPHA * (vh - wr)) / (1 + ALPHA);
  const jMax = ground.mu * (1 + ey) * vn;
  const j = Math.max(-jMax, Math.min(jMax, jRoll));
  const vh2 = Math.max(0, vh - j);
  const kh = vh > 1e-6 ? vh2 / vh : 0;
  const nv = { x: v.x * kh, y: vn * ey, z: v.z * kh };
  let spin = Math.max(-1, Math.min(1, (wr + j / ALPHA) / SPIN_SURF));
  // a sliced ball keeps part of its slice through the skid (the rigid-ball friction would turn it into topspin): it
  // stays low and does not kick up like a drive
  if (s.spin <= SLICE.from) spin = Math.min(spin, SLICE.keep * s.spin);
  return { t0: t, x: p.x, y: R, z: p.z, vx: nv.x, vy: nv.y, vz: nv.z, spin, k: dragOf(nv), g: gravityFor(spin * 0.3) };
}
/**
 * A sliced ball on the floor (bounce), one cut at least `from` (a slice, a drop shot, a drop volley): `keep` of its
 * backspin is left after the skid (at least), and it comes up `low` × the slice lower (a slice, −0.55: 10 % lower).
 */
export const SLICE = { from: -0.3, keep: 0.6, low: 0.18 };

export const NET_TOP = NET_C;

/** What the ball meets next on a stretch: the floor, or nothing within `tMax`. */
export type NextEvent = { kind: 'floor'; t: number };
export function nextEvent(s: Seg, tMax = s.t0 + 12): NextEvent | null {
  const tg = groundTime(s);
  if (tg <= tMax) return { kind: 'floor', t: tg };
  return null;
}

// ------------------------------------------------------------------ the boards (the dead ball only)

/** Time (after t0) the centre of the ball on coordinate p0 moving at v0 (drag k) reaches c, or null. */
function planeTime(p0: number, v0: number, k: number, c: number): number | null {
  const dist = c - p0;
  if (dist * v0 <= 1e-9) return null; // moving away from it, or on it
  const u = 1 - (k * dist) / v0;
  if (u <= 1e-9) return null; // the drag stops it first
  return -Math.log(u) / k;
}

/**
 * The boards of the stands (court.ts, BOARDS) on this stretch: the time the ball meets them and which one, or null. Only
 * the dead ball meets them (a live ball has bounced out, or been played, long before).
 */
export function boardTime(s: Seg, bx: number, bz: number): { t: number; axis: 'x' | 'z' } | null {
  let best: { t: number; axis: 'x' | 'z' } | null = null;
  if (Math.abs(s.vx) > 1e-6) {
    const dt = planeTime(s.x, s.vx, s.k, Math.sign(s.vx) * (bx - R));
    if (dt !== null) best = { t: s.t0 + dt, axis: 'x' };
  }
  if (Math.abs(s.vz) > 1e-6) {
    const dt = planeTime(s.z, s.vz, s.k, Math.sign(s.vz) * (bz - R));
    if (dt !== null && (!best || s.t0 + dt < best.t)) best = { t: s.t0 + dt, axis: 'z' };
  }
  return best;
}
/** The dead ball off a board: it comes back slowly (the board is padded), its spin gone. */
export function boardBounce(s: Seg, t: number, axis: 'x' | 'z'): Seg {
  const p = posAt(s, t);
  const v = velAt(s, t);
  const nv = axis === 'x' ? { x: -v.x * 0.25, y: v.y * 0.6, z: v.z * 0.5 } : { x: v.x * 0.5, y: v.y * 0.6, z: -v.z * 0.25 };
  const from = { x: p.x - Math.sign(v.x) * (axis === 'x' ? 1e-3 : 0), y: p.y, z: p.z - Math.sign(v.z) * (axis === 'z' ? 1e-3 : 0) };
  return seg(t, from, nv, 0);
}
