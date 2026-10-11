// Ball flight with gravity, air drag and spin, solved in closed form (no integration error, so the game, the
// bot, the AI's predictions and a future online server all agree on where the ball goes).
//
// Each stretch of flight (a Seg) carries its own drag k and effective gravity g:
//   v(t) = v0·e^(−kt) + (g/k)(e^(−kt) − 1)·ŷ
//   p(t) = p0 + v0·f(t) − (g/k)·t·ŷ   with f(t) = (1 − e^(−kt))/k   (the vertical term uses v0y + g/k)
//
// · Drag. A padel ball (a pressurised felt ball, a little softer than a tennis ball) has quadratic drag
//   (≈ 0.02·v² m/s²: ½ρ·Cd·A/m with Cd 0.55, r 33.5 mm, 57 g). Linear drag with k picked from the launch stands in for it
//   over one flight (the fit came from the pickleball engine, scaled to this ball's coefficient).
// · Spin. Topspin (+) presses the ball down (Magnus), backspin (−) holds it up a little: a heavier or lighter g.
// · Bounce on the floor (artificial grass with sand). Restitution for the height, friction at the contact patch for the
//   pace: a sliced ball grips and sits up, a topspin ball kicks on, a flat fast one skids.
// · Walls (padel). The flight runs until the ball meets the floor, the net or a wall (wallTime, closed form like the
//   net). Glass sends it back with most of its pace (restitution 0.72 at a gentle touch, less off a hard one) and the
//   friction on the glass turns spin into height: a topspin ball climbs off the back glass, a sliced one drops («se
//   queda»). The mesh takes most of the pace and sends it back a little off line (deterministic: the same contact
//   always does the same, so the AI's prediction is the truth).

import { HL, NET_C, R, W, netHeight } from './court';

export const G = 9.81;
/** quadratic drag coefficient of a padel ball (½ρ·Cd·A/m), m⁻¹ */
const C_DRAG = 0.02;
/** Vertical restitution on the floor (FIP: dropped from 2.54 m it comes back 1.35–1.45 m). */
export const BOUNCE_Y = 0.74;
/** spin 1 as the speed of the ball's surface (ω·r, m/s): a heavy topspin ball turns at about 1,700 rpm */
export const SPIN_SURF = 6;
/** friction of the ball on the sanded grass, and the ball's moment of inertia over m·r² (a thin hollow shell) */
const MU = 0.55;
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
 * one flight, fitted on the game's shots from 6 to 22 m/s and −12° to 50°).
 */
export function dragFor(speed: number, hspeed = speed): number {
  return Math.min(0.6, Math.max(0.06, C_DRAG * (0.32 * speed + 0.54 * hspeed)));
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

/** Fastest sensible flight time over a horizontal distance (≈ 19 m/s average, about 25 off the paddle at most). */
export function minFlight(d: number): number {
  return Math.max(0.3, d / 19);
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

// ------------------------------------------------------------------ walls

/** Glass: restitution at a gentle touch and how much it drops per m/s of impact; the friction of the glass. */
export const GLASS = { e: 0.72, eDrop: 0.008, eMin: 0.5, mu: 0.3 };
/** Mesh: restitution, how much of the pace along it is left, and how far off line it sends the ball (rad). */
export const MESH = { e: 0.32, keep: 0.55, scatter: 0.35 };

/** which wall: the side walls (x = ±W/2) or the back walls (z = ±HL), and the sign of that coordinate */
export interface WallHit {
  t: number;
  axis: 'x' | 'z';
  sign: 1 | -1;
}

/** Time (after t0) the centre of the ball on coordinate p0 moving at v0 (drag k) reaches c, or null. */
function planeTime(p0: number, v0: number, k: number, c: number): number | null {
  const dist = c - p0;
  if (dist * v0 <= 1e-9) return null; // moving away from it, or on it
  const u = 1 - (k * dist) / v0;
  if (u <= 1e-9) return null; // the drag stops it first
  return -Math.log(u) / k;
}

/** First wall the ball meets on this stretch (its centre one radius off the wall), or null. */
export function wallTime(s: Seg): WallHit | null {
  let best: WallHit | null = null;
  if (Math.abs(s.vx) > 1e-6) {
    const sg = (s.vx > 0 ? 1 : -1) as 1 | -1;
    const dt = planeTime(s.x, s.vx, s.k, sg * (W / 2 - R));
    if (dt !== null) best = { t: s.t0 + dt, axis: 'x', sign: sg };
  }
  if (Math.abs(s.vz) > 1e-6) {
    const sg = (s.vz > 0 ? 1 : -1) as 1 | -1;
    const dt = planeTime(s.z, s.vz, s.k, sg * (HL - R));
    if (dt !== null && (!best || s.t0 + dt < best.t)) best = { t: s.t0 + dt, axis: 'z', sign: sg };
  }
  return best;
}

/** a deterministic number in [0, 1) from a contact point (the mesh's irregular bounce) */
function hash3(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * The segment after meeting a wall at time t. The velocity into the wall comes back × restitution; along the wall the
 * friction acts on the slip of the contact patch (the ball's surface turning, ω × r, plus its own velocity along the
 * wall): topspin into the back glass makes it climb, backspin makes it drop. The mesh takes the pace off and sends the
 * ball off line.
 */
export function wallBounce(s: Seg, hit: WallHit, surface: 'glass' | 'mesh'): Seg {
  const t = hit.t;
  const p = posAt(s, t);
  const v = velAt(s, t);
  // the unit vector towards the wall
  const dx = hit.axis === 'x' ? hit.sign : 0;
  const dz = hit.axis === 'z' ? hit.sign : 0;
  const vn = v.x * dx + v.z * dz; // > 0: into the wall
  let tx = v.x - vn * dx;
  let ty = v.y;
  let tz = v.z - vn * dz;
  // the surface of the ball at the contact: ω̂ = ŷ × û (û: the way it travels across the court), ω × (R·d)
  const vh = Math.hypot(v.x, v.z);
  const ux = vh > 1e-6 ? v.x / vh : 0;
  const uz = vh > 1e-6 ? v.z / vh : 0;
  // ŷ × û = (uz, 0, −ux); (ŷ × û) × d = (0·dz − (−ux)·0, (−ux)·dx − uz·dz, uz·0 − 0·dx) = (0, −ux·dx − uz·dz, 0)
  const surfY = s.spin * SPIN_SURF * -(ux * dx + uz * dz);
  let spin: number;
  let nv: number;
  if (surface === 'glass') {
    const e = Math.max(GLASS.eMin, GLASS.e - GLASS.eDrop * Math.max(0, vn - 5));
    nv = -vn * e;
    // slip of the patch along the wall (vertical part carries the spin; the horizontal part only the glide)
    const sy = ty + surfY;
    const sh = Math.hypot(tx, tz);
    const slip = Math.hypot(sy, sh);
    if (slip > 1e-6) {
      const j = Math.min(GLASS.mu * (1 + e) * vn, (ALPHA / (1 + ALPHA)) * slip);
      ty -= (j * sy) / slip;
      const kh = sh > 1e-6 ? Math.max(0, 1 - j / slip) : 1;
      tx *= kh;
      tz *= kh;
    }
    spin = s.spin * 0.4;
  } else {
    nv = -vn * MESH.e;
    const a = (hash3(p.x, p.y, p.z) - 0.5) * 2 * MESH.scatter;
    // off line: turn the pace along the wall and a little of the vertical
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const along = hit.axis === 'x' ? tz : tx;
    const turned = along * MESH.keep * c + ty * MESH.keep * sn * 0.5;
    ty = ty * MESH.keep * c - along * MESH.keep * sn * 0.3;
    if (hit.axis === 'x') tz = turned;
    else tx = turned;
    spin = 0;
  }
  const nvx = tx + nv * dx;
  const nvz = tz + nv * dz;
  const out = { x: nvx, y: ty, z: nvz };
  // (a hair off the wall so the next search does not find it again)
  const from = { x: p.x - dx * 1e-4, y: p.y, z: p.z - dz * 1e-4 };
  return seg(t, from, out, spin, undefined, gravityFor(spin * 0.3));
}

/** What the ball meets next on a stretch: the floor, a wall or nothing within `tMax`. */
export type NextEvent = { kind: 'floor'; t: number } | { kind: 'wall'; t: number; hit: WallHit };
export function nextEvent(s: Seg, tMax = s.t0 + 12): NextEvent | null {
  const tg = groundTime(s);
  const w = wallTime(s);
  if (w && w.t < tg && w.t <= tMax) return { kind: 'wall', t: w.t, hit: w };
  if (tg <= tMax) return { kind: 'floor', t: tg };
  return null;
}
