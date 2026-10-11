// Ball flight with gravity, air drag and spin, solved in closed form (no integration error, so the game, the
// bot, the AI's predictions and a future online server all agree on where the ball goes).
//
// Each stretch of flight (a Seg) carries its own drag k and effective gravity g:
//   v(t) = v0·e^(−kt) + (g/k)(e^(−kt) − 1)·ŷ
//   p(t) = p0 + v0·f(t) − (g/k)·t·ŷ   with f(t) = (1 − e^(−kt))/k   (the vertical term uses v0y + g/k)
//
// · Drag. A perforated plastic ball has quadratic drag (≈ 0.036·v² m/s²). Linear drag with k picked from the
//   launch matches it closely over one flight: a hard drive loses pace fast and "dies", a dink or a lob keeps a
//   clean arc. k comes from the launch speed and how much of it is horizontal (fitted against a numerical quadratic
//   flight: a steep lob spends its flight slow near the top, so it gets less drag than a flat drive of the same pace).
//   Same launch, same path: within 2–9 cm of the quadratic flight for dinks, drives, serves and smashes, and 15–20 cm
//   for lobs (35–50 cm with the launch speed alone).
// · Spin. Topspin (+) presses the ball down (Magnus): a drive dips into the court. Backspin (−) holds it up a little.
//   Modelled as a heavier or lighter g (over a flight of under a second a constant extra g follows a Magnus force that
//   fades with the speed just as closely, 4 cm, measured).
// · Bounce. Restitution for the height, friction at the contact patch for the pace: a ball whose surface still
//   slides when it lands grips and leaves rolling (a flat or sliced ball loses more pace, a sliced dink "checks" and
//   sits up), and a flat, fast ball the friction cannot stop skids through low. Topspin means less slip: it keeps
//   its pace and kicks on.

import { NET_C, R, netHeight } from './court';

export const G = 9.81;
/** quadratic drag coefficient of a pickleball (½ρ·Cd·A/m), m⁻¹ */
const C_DRAG = 0.036;
/** Vertical restitution: a pickleball barely bounces. */
export const BOUNCE_Y = 0.66; // dropped from 78 in it comes back up 30–34 in (USA Pickleball ball spec)
/** spin 1 as the speed of the ball's surface (ω·r, m/s): a heavy topspin drive turns at about 1,400 rpm */
export const SPIN_SURF = 5.6;
/** friction of the ball on the sanded acrylic, and the ball's moment of inertia over m·r² (a thick hollow shell) */
const MU = 0.5;
const ALPHA = 0.6;

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
 * one flight, fitted on the game's shots from 6 to 22 m/s and −12° to 50°).
 */
export function dragFor(speed: number, hspeed = speed): number {
  return Math.min(0.78, Math.max(0.1, C_DRAG * (0.32 * speed + 0.54 * hspeed)));
}
const dragOf = (v: Vec3) => dragFor(Math.hypot(v.x, v.y, v.z), Math.hypot(v.x, v.z));
/** Effective gravity with spin: topspin 1 → 1.3 g, backspin −1 → 0.75 g. */
export function gravityFor(spin: number): number {
  return G * (1 + (spin > 0 ? 0.3 : 0.25) * spin);
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

/** Fastest sensible flight time over a horizontal distance (≈ 15 m/s average, 19 off the paddle at most). */
export function minFlight(d: number): number {
  return Math.max(0.32, d / 15);
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
  const ey = BOUNCE_Y - 0.015 * Math.max(0, vn - 6);
  const wr = s.spin * SPIN_SURF;
  const jRoll = (ALPHA * (vh - wr)) / (1 + ALPHA);
  const jMax = MU * (1 + ey) * vn;
  const j = Math.max(-jMax, Math.min(jMax, jRoll));
  const vh2 = Math.max(0, vh - j);
  const kh = vh > 1e-6 ? vh2 / vh : 0;
  const nv = { x: v.x * kh, y: vn * ey, z: v.z * kh };
  const spin = Math.max(-1, Math.min(1, (wr + j / ALPHA) / SPIN_SURF));
  return { t0: t, x: p.x, y: R, z: p.z, vx: nv.x, vy: nv.y, vz: nv.z, spin, k: dragOf(nv), g: gravityFor(spin * 0.3) };
}

export const NET_TOP = NET_C;
