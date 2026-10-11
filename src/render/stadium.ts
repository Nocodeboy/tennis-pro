// The stadium round the centre court: a bowl of stands on all four sides (a rounded rectangle, every row an offset of
// the one below it), a lower tier of eleven rows close to the court, a cross aisle and the hospitality boxes behind
// glass, an upper tier of ten steeper rows under a roof canopy, the floodlights in a ring along the canopy's edge and
// two video boards hanging from it at the ends. The gameplay camera hangs high over the near end's lower tier (those
// rows are always under the bottom of its frame).
//
// Built for a phone: the concrete, the seats, the roof, the steel and the props are one mesh with one material
// (vertex colours, and roughness, metalness and how far the court's light reaches in a vertex attribute), so the
// whole bowl is one draw call; everything that glows goes to the emissive mesh (led.ts) and the spectators to the
// crowd (crowd.ts).

import * as THREE from 'three';
import { EmissiveBuilder, LED, LED_ASPECT } from './led';

/** the bowl's inner edge (the front wall of the lower tier): half sizes and the corner radius */
export const BOWL = { ax: 8.4, az: 12.8, rc: 4.5 };

/** the lower tier: rows (depth, rise), the front wall's height */
const LO = { rows: 11, depth: 0.85, rise: 0.42, y0: 1.1 };
const LO_END = LO.rows * LO.depth;
const WALK_Y = LO.y0 + LO.rows * LO.rise;
/** the boxes: a cross aisle, two rows of club seats and the glazing; then the upper tier over them */
const VIP = { d0: LO_END + 1.0, depth: 0.9, rise: 0.26, glass: LO_END + 3.55, top: 8.9 };
const UP = { d0: LO_END + 3.05, rows: 10, depth: 0.8, rise: 0.55, y0: 9.9 };
const UP_END = UP.d0 + UP.rows * UP.depth;
const ROOF = { back: UP_END, backY: 17.9, edge: 10.0, edgeY: 19.1, lipY: 18.2 };
/** the floodlights along the roof's edge */
const LAMP = { d: 9.85, y: 18.55, w: 1.5, h: 0.85, every: 4.2 };

export const STAND = { lowerTop: WALK_Y, upperTop: UP.y0 + (UP.rows - 1) * UP.rise, roofEdge: ROOF.edge, roofY: ROOF.edgeY };

/** how much of the court's light reaches the stands at height y (shared by the stands, the seats and the crowd) */
export const STAND_LIGHT_GLSL = /* glsl */ `
float pbStandLight( float y ) {
  // (the floodlights are aimed at the court: the stands only get their spill, the front rows the most)
  return mix( 0.5, 0.2, smoothstep( 1.2, 6.0, y ) ) * mix( 1.0, 0.6, smoothstep( 7.5, 15.0, y ) ) + 0.5 * ( 1.0 - smoothstep( 0.6, 1.4, y ) );
}`;

// ------------------------------------------------------------------ the bowl's outline
/** A point on the outline offset by d (outward), on piece p (0 far end, then clockwise seen from above) at t. */
interface OPt {
  x: number;
  z: number;
  nx: number;
  nz: number;
}
const SX = BOWL.ax - BOWL.rc;
const SZ = BOWL.az - BOWL.rc;
function at(p: number, t: number, d: number): OPt {
  const r = BOWL.rc + d;
  switch (p) {
    case 0:
      return { x: -SX + t * 2 * SX, z: -BOWL.az - d, nx: 0, nz: -1 };
    case 2:
      return { x: BOWL.ax + d, z: -SZ + t * 2 * SZ, nx: 1, nz: 0 };
    case 4:
      return { x: SX - t * 2 * SX, z: BOWL.az + d, nx: 0, nz: 1 };
    case 6:
      return { x: -BOWL.ax - d, z: SZ - t * 2 * SZ, nx: -1, nz: 0 };
    default: {
      const k = (p - 1) / 2;
      const cx = k === 0 || k === 1 ? SX : -SX;
      const cz = k === 1 || k === 2 ? SZ : -SZ;
      const a = -Math.PI / 2 + k * (Math.PI / 2) + t * (Math.PI / 2);
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      return { x: cx + nx * r, z: cz + nz * r, nx, nz };
    }
  }
}
function pieceLen(p: number, d: number): number {
  if (p % 2 === 1) return (Math.PI / 2) * (BOWL.rc + d);
  return p === 0 || p === 4 ? 2 * SX : 2 * SZ;
}
function loopLen(d: number): number {
  let s = 0;
  for (let p = 0; p < 8; p++) s += pieceLen(p, d);
  return s;
}
/** the piece and its t at arc length s (offset d) */
function locate(s: number, d: number): [number, number] {
  let rest = s;
  for (let p = 0; p < 8; p++) {
    const l = pieceLen(p, d);
    if (rest <= l || p === 7) return [p, Math.min(1, Math.max(0, rest / l))];
    rest -= l;
  }
  return [7, 1];
}
/** the vertices of one loop of the outline (piece, t): the straights' ends, the corners in `n` steps */
function samples(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let p = 0; p < 8; p++) {
    if (p % 2 === 0) out.push([p, 0]);
    else for (let i = 0; i < n; i++) out.push([p, i / n]);
  }
  return out;
}
/** the stair aisles, as places on the outline (the same radial line through every row) */
const AISLES: [number, number][] = [
  [0, 0],
  [1, 0.5],
  [2, 1 / 3],
  [2, 2 / 3],
  [3, 0.5],
  [5, 0.5],
  [6, 1 / 3],
  [6, 2 / 3],
  [7, 0.5],
  [0, 1],
];
/** The outline at offset d as segments (midpoint, length, the turn of its outward normal). */
export function outline(d: number, n = 8): { x: number; z: number; len: number; ry: number }[] {
  const loop = samples(n);
  const out: { x: number; z: number; len: number; ry: number }[] = [];
  for (let i = 0; i < loop.length; i++) {
    const [p0, t0] = loop[i];
    const [p1, t1] = loop[(i + 1) % loop.length];
    const tEnd = p1 === p0 ? t1 : 1;
    const a = at(p0, t0, d);
    const b = at(p0, tEnd, d);
    out.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, len: Math.hypot(b.x - a.x, b.z - a.z), ry: Math.atan2(-(a.nx + b.nx), -(a.nz + b.nz)) });
  }
  return out;
}

/** the arc length of a place on the outline at offset d */
function arcOf(p: number, t: number, d: number): number {
  let s = 0;
  for (let i = 0; i < p; i++) s += pieceLen(i, d);
  return s + t * pieceLen(p, d);
}

// ------------------------------------------------------------------ the solid mesh
/** Collects the bowl's solid geometry: position, normal, uv (metres / 2), colour and surface (roughness, metal, dim). */
export class Solid {
  P: number[] = [];
  N: number[] = [];
  U: number[] = [];
  C: number[] = [];
  S: number[] = [];
  I: number[] = [];
  private col = new THREE.Color();
  private e1 = new THREE.Vector3();
  private e2 = new THREE.Vector3();
  private fn = new THREE.Vector3();

  /** a quad a, b, c, d (in order round it); it faces `front` (flipped if it winds the other way) */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, front: THREE.Vector3, color: number, surf: [number, number, number], uv?: number[]) {
    const k = this.P.length / 3;
    this.fn.crossVectors(this.e1.subVectors(b, a), this.e2.subVectors(d, a)).normalize();
    const flip = this.fn.dot(front) < 0;
    if (flip) this.fn.negate();
    this.col.setHex(color).convertSRGBToLinear();
    const pts = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      const v = pts[i];
      this.P.push(v.x, v.y, v.z);
      this.N.push(this.fn.x, this.fn.y, this.fn.z);
      this.C.push(this.col.r, this.col.g, this.col.b);
      this.S.push(surf[0], surf[1], surf[2]);
    }
    if (uv) this.U.push(...uv);
    else {
      // (a uv from the world position: the grain the same size everywhere)
      const ax = Math.abs(this.fn.y) > 0.7 ? 0 : Math.abs(this.fn.x) > Math.abs(this.fn.z) ? 2 : 0;
      for (const v of pts) this.U.push(Math.abs(this.fn.y) > 0.7 ? v.x / 2 : (ax === 2 ? v.z : v.x) / 2, Math.abs(this.fn.y) > 0.7 ? v.z / 2 : v.y / 2);
    }
    if (flip) this.I.push(k, k + 2, k + 1, k, k + 3, k + 2);
    else this.I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }

  /** a box (sx × sy × sz) placed by a matrix */
  box(m: THREE.Matrix4, sx: number, sy: number, sz: number, color: number, surf: [number, number, number]) {
    const g = new THREE.BoxGeometry(sx, sy, sz).applyMatrix4(m);
    this.geo(g, color, surf);
    g.dispose();
  }

  /** any geometry (moved into place), in one colour */
  geo(g: THREE.BufferGeometry, color: number, surf: [number, number, number]) {
    const k = this.P.length / 3;
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const uv = g.attributes.uv;
    this.col.setHex(color).convertSRGBToLinear();
    for (let i = 0; i < p.count; i++) {
      this.P.push(p.getX(i), p.getY(i), p.getZ(i));
      this.N.push(n.getX(i), n.getY(i), n.getZ(i));
      this.U.push(uv ? uv.getX(i) * 0.5 : 0, uv ? uv.getY(i) * 0.5 : 0);
      this.C.push(this.col.r, this.col.g, this.col.b);
      this.S.push(surf[0], surf[1], surf[2]);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.I.push(k + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.I.push(k + i);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.S, 3));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * The bowl's material: vertex colours over a fine concrete grain, roughness and metalness per vertex (aSurf.xy) and,
 * where aSurf.z is 1, the stands' light falling off with height (the court's floodlights reach the low rows, the top
 * of the upper tier sits in the gloom under the roof).
 */
export function solidMaterial(grain: THREE.Texture, key: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 1, metalness: 1 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSurf;\nvarying vec3 vSurf;\nvarying float vPbY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;\nvPbY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSurf;\nvarying float vPbY;\n${STAND_LIGHT_GLSL}`)
      .replace('#include <map_fragment>', '#include <map_fragment>\nif ( vSurf.z > 0.5 ) diffuseColor.rgb *= pbStandLight( vPbY );')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.y;');
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// ------------------------------------------------------------------ the stadium
export interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  v: number;
  /** 0 a spectator, 1 the club seats, 2 staff sitting, 3 staff standing */
  kind?: number;
}
export interface Stadium {
  /** each spectator's seat, the low ones first */
  spots: Spot[];
  /** how many of them are low enough to follow the ball with their heads */
  lookers: number;
  /** the floodlights' faces (centre and the way they face): the glare drawn over them */
  lamps: { p: THREE.Vector3; n: THREE.Vector3 }[];
}

const CONCRETE: [number, number, number] = [0.86, 0, 1];
const SEAT: [number, number, number] = [0.45, 0, 1];
const STEEL: [number, number, number] = [0.45, 0.75, 1];
const DARK: [number, number, number] = [0.9, 0, 1];
const STEP = 0x8c8a86;
const RISER = 0x6e6d6b;
const SEAT_COL = 0x1d2734;
const CLUB_COL = 0x4a1c26;

/** a white-noise value for an integer (the crowd and the seats, the same every time) */
export const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Builds the bowl into `solid` and `glow`, and returns where the spectators sit and where the floodlights are. */
export function buildStadium(solid: Solid, glow: EmissiveBuilder): Stadium {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const UPV = V(0, 1, 0);
  const segs = 12;
  const loop = samples(segs);
  const lower: Spot[] = [];
  const club: Spot[] = [];
  const upper: Spot[] = [];
  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const e4 = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);

  /**
   * A band round the outline from (d0, y0) to (d1, y1): a tread (flat), a riser or wall (upright) or the roof's
   * underside (sloping). `front`: which way it faces (up, in towards the court, down).
   */
  const band = (d0: number, y0: number, d1: number, y1: number, color: number, surf: [number, number, number], front: 'up' | 'in' | 'down') => {
    for (let i = 0; i < loop.length; i++) {
      const [p0, t0] = loop[i];
      const [p1, t1] = loop[(i + 1) % loop.length];
      // (the next sample's piece: the end of this piece is the start of the next)
      const tEnd = p1 === p0 ? t1 : 1;
      const a0 = at(p0, t0, d0);
      const a1 = at(p0, tEnd, d0);
      const b0 = at(p0, t0, d1);
      const b1 = at(p0, tEnd, d1);
      const mx = (a0.nx + a1.nx) / 2;
      const mz = (a0.nz + a1.nz) / 2;
      const f = front === 'up' ? UPV : front === 'down' ? V(-mx * 0.3, -1, -mz * 0.3) : V(-mx, 0, -mz);
      solid.quad(V(a0.x, y0, a0.z), V(a1.x, y0, a1.z), V(b1.x, y1, b1.z), V(b0.x, y1, b0.z), f, color, surf);
    }
  };

  /**
   * The seats of a row (tread from d0 to d1 at height y) and the spectators on them: a pan and a back each, 0.5 m
   * apart, none in the aisles; `empty`: the share of empty seats. `bare`: only the empty seats are
   * built (far up, a taken seat never shows behind its sitter).
   */
  const seats = (d0: number, d1: number, y: number, color: number, empty: number, out: Spot[], kind: number, salt: number, bare = false) => {
    const dm = (d0 + d1) / 2;
    const dPan = dm + 0.12;
    const dBack = dm + 0.33;
    const L = loopLen(dPan);
    const n = Math.floor(L / 0.5);
    const pitch = L / n;
    const aisle = AISLES.map(([p, t]) => arcOf(p, t, dPan));
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * pitch;
      if (aisle.some((a) => Math.abs(s - a) < 0.62 || Math.abs(s - a - L) < 0.62 || Math.abs(s - a + L) < 0.62)) continue;
      const [p, t] = locate(s, dPan);
      const v = hash(i * 7.31 + salt);
      if (bare && v >= empty) {
        const o = at(p, t, dPan);
        out.push({ x: o.x, y: y + 0.05, z: o.z, yaw: Math.atan2(-o.nx - o.x * 0.012, -o.nz - o.z * 0.012) + (hash(i * 3.7 + salt * 1.3) - 0.5) * 0.4, v, kind });
        continue;
      }
      const o = at(p, t, dPan);
      const ob = at(p, t, dBack);
      // the seat's sideways direction (along the row)
      const tx = -o.nz;
      const tz = o.nx;
      const hw = 0.22;
      solid.quad(V(o.x - tx * hw - o.nx * 0.2, y + 0.045, o.z - tz * hw - o.nz * 0.2), V(o.x + tx * hw - o.nx * 0.2, y + 0.045, o.z + tz * hw - o.nz * 0.2), V(o.x + tx * hw + o.nx * 0.2, y + 0.045, o.z + tz * hw + o.nz * 0.2), V(o.x - tx * hw + o.nx * 0.2, y + 0.045, o.z - tz * hw + o.nz * 0.2), UPV, color, SEAT);
      solid.quad(V(ob.x - tx * hw, y + 0.06, ob.z - tz * hw), V(ob.x + tx * hw, y + 0.06, ob.z + tz * hw), V(ob.x + tx * hw, y + 0.42, ob.z + tz * hw), V(ob.x - tx * hw, y + 0.42, ob.z - tz * hw), V(-o.nx, 0.15, -o.nz), color, SEAT);
      if (v < empty) continue;
      // facing the court (and a little towards its middle)
      const yaw = Math.atan2(-o.nx - o.x * 0.012, -o.nz - o.z * 0.012) + (hash(i * 3.7 + salt * 1.3) - 0.5) * 0.4;
      out.push({ x: o.x, y: y + 0.05, z: o.z, yaw, v, kind });
    }
  };

  /** the half steps of the stair aisles, one a row (a box at the front half of the tread, half the rise high) */
  const stairs = (d0: number, depth: number, y: number, rise: number) => {
    for (const [p, t] of AISLES) {
      // (on the back half of the tread below, half a rise high)
      const o = at(p, t, d0 - depth * 0.25);
      e4.set(0, Math.atan2(o.nx, o.nz), 0);
      m4.compose(V(o.x, y + rise / 4, o.z), q4.setFromEuler(e4), one);
      solid.box(m4, 1.1, rise / 2, depth / 2, STEP, CONCRETE);
    }
  };

  // ---------- the lower tier ----------
  band(0, 0, 0, LO.y0, 0x2a2f37, CONCRETE, 'in');
  for (let k = 0; k < LO.rows; k++) {
    const d0 = k * LO.depth;
    const y = LO.y0 + k * LO.rise;
    if (k > 0) band(d0, y - LO.rise, d0, y, RISER, CONCRETE, 'in');
    band(d0, y, d0 + LO.depth, y, STEP, CONCRETE, 'up');
    seats(d0, d0 + LO.depth, y, SEAT_COL, 0.08, lower, 0, k * 101 + 3);
    if (k > 0) stairs(d0, LO.depth, y - LO.rise, LO.rise);
  }
  // the cross aisle behind it (and its edge), then the club seats and the boxes' glazing
  band(LO_END, WALK_Y - LO.rise, LO_END, WALK_Y, RISER, CONCRETE, 'in');
  band(LO_END, WALK_Y, VIP.d0, WALK_Y, 0x5d5c5a, CONCRETE, 'up');
  for (let k = 0; k < 2; k++) {
    const d0 = VIP.d0 + k * VIP.depth;
    const y = WALK_Y + (k + 1) * VIP.rise;
    band(d0, y - VIP.rise, d0, y, 0x3a3a3c, CONCRETE, 'in');
    band(d0, y, d0 + VIP.depth, y, 0x45403e, CONCRETE, 'up');
    seats(d0, d0 + VIP.depth, y, CLUB_COL, 0.3, club, 1, k * 53 + 7);
  }
  const vipY = WALK_Y + 2 * VIP.rise;
  band(VIP.d0 + 2 * VIP.depth, vipY, VIP.glass, vipY, 0x3a3634, CONCRETE, 'up');
  // ---------- the upper tier (its front wall carries a ribbon) ----------
  band(UP.d0, VIP.top, VIP.glass, VIP.top, 0x23262b, DARK, 'down');
  band(UP.d0, VIP.top, UP.d0, UP.y0, 0x262a31, CONCRETE, 'in');
  for (let k = 0; k < UP.rows; k++) {
    const d0 = UP.d0 + k * UP.depth;
    const y = UP.y0 + k * UP.rise;
    if (k > 0) band(d0, y - UP.rise, d0, y, RISER, CONCRETE, 'in');
    band(d0, y, d0 + UP.depth, y, STEP, CONCRETE, 'up');
    seats(d0, d0 + UP.depth, y, SEAT_COL, 0.12, upper, 0, k * 211 + 17, true);
    if (k > 0) stairs(d0, UP.depth, y - UP.rise, UP.rise);
  }
  const topY = UP.y0 + (UP.rows - 1) * UP.rise;
  // ---------- the back wall and the roof canopy ----------
  band(ROOF.back, topY, ROOF.back, ROOF.backY, 0x30333a, CONCRETE, 'in');
  band(ROOF.back, ROOF.backY, ROOF.edge + 0.4, ROOF.edgeY, 0x1a1d22, DARK, 'down');
  band(ROOF.edge, ROOF.lipY, ROOF.edge, ROOF.edgeY, 0x2b2f36, STEEL, 'in');
  band(ROOF.edge, ROOF.lipY, ROOF.edge + 0.4, ROOF.lipY, 0x25282e, STEEL, 'down');

  // ---------- the ribbons and the glazing ----------
  const ribbon = (d: number, y0: number, y1: number, phase: number, mode: number) => {
    const H = y1 - y0;
    const T = LED_ASPECT * H;
    let s = 0;
    for (let i = 0; i < loop.length; i++) {
      const [p0, t0] = loop[i];
      const [p1, t1] = loop[(i + 1) % loop.length];
      const tEnd = p1 === p0 ? t1 : 1;
      const a = at(p0, t0, d);
      const b = at(p0, tEnd, d);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const f = V(-(a.nx + b.nx) / 2, 0, -(a.nz + b.nz) / 2);
      glow.quad(V(a.x, y0, a.z), V(b.x, y0, b.z), V(b.x, y1, b.z), V(a.x, y1, a.z), s, s + len, { T, H, phase, mode }, f);
      s += len;
    }
  };
  ribbon(-0.02, 0.42, 0.98, 0, LED.scroll);
  ribbon(UP.d0 - 0.02, VIP.top + 0.2, VIP.top + 0.78, 2.3, LED.scroll);
  ribbon(VIP.glass - 0.01, vipY, VIP.top, 0.37, LED.glass);

  // ---------- the floodlights under the roof's edge, and the steel that holds them ----------
  const lamps: Stadium['lamps'] = [];
  {
    const L = loopLen(LAMP.d);
    const n = Math.round(L / LAMP.every);
    const look = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const [p, t] = locate(((i + 0.5) / n) * L, LAMP.d);
      const o = at(p, t, LAMP.d);
      look.position.set(o.x, LAMP.y, o.z);
      look.lookAt(o.x * 0.12, 0, o.z * 0.12);
      look.updateMatrix();
      solid.box(look.matrix, LAMP.w + 0.12, LAMP.h + 0.12, 0.42, 0x23272d, STEEL);
      const fwd = V(0, 0, 1).applyQuaternion(look.quaternion);
      const right = V(1, 0, 0).applyQuaternion(look.quaternion);
      const up = V(0, 1, 0).applyQuaternion(look.quaternion);
      const c = look.position.clone().addScaledVector(fwd, 0.215);
      glow.panel(c, right, up, LAMP.w, LAMP.h, { T: LAMP.w, H: LAMP.h, phase: 0, mode: LED.lamp });
      lamps.push({ p: c.clone().addScaledVector(fwd, 0.05), n: fwd.clone() });
      // a rib under the roof every other floodlight, from the back wall to the edge
      if (i % 2 === 0) {
        const ob = at(p, t, ROOF.back);
        const oe = at(p, t, ROOF.edge + 0.3);
        const a = V(ob.x, ROOF.backY - 0.35, ob.z);
        const b = V(oe.x, ROOF.edgeY - 0.45, oe.z);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        look.position.copy(mid);
        look.lookAt(b);
        look.updateMatrix();
        solid.box(look.matrix, 0.28, 0.6, a.distanceTo(b), 0x202328, STEEL);
      }
    }
    // the catwalk along the edge
    band(LAMP.d + 0.35, ROOF.lipY - 0.05, LAMP.d + 0.9, ROOF.lipY - 0.05, 0x1d2025, STEEL, 'down');
  }

  // ---------- the floor inside the bowl ----------
  {
    const c = 0x1b2029;
    for (let i = 0; i < loop.length; i++) {
      const [p0, t0] = loop[i];
      const [p1, t1] = loop[(i + 1) % loop.length];
      const tEnd = p1 === p0 ? t1 : 1;
      const a = at(p0, t0, 0);
      const b = at(p0, tEnd, 0);
      solid.quad(V(0, -0.012, 0), V(a.x, -0.012, a.z), V(b.x, -0.012, b.z), V(b.x, -0.012, b.z), UPV, c, [0.7, 0, 0]);
    }
  }

  const spots = [...lower, ...club, ...upper];
  return { spots, lookers: lower.length + club.length, lamps };
}

/** The video boards hanging from the roof's edge at both ends (screens in the emissive mesh, housings in the solid). */
export function videoBoards(solid: Solid, glow: EmissiveBuilder) {
  const W = 9.6;
  const H = W * (384 / 1024);
  const y = 15.4;
  for (const side of [-1, 1]) {
    const z = side * (BOWL.az + ROOF.edge - 0.55);
    const m = new THREE.Matrix4().makeTranslation(0, y, z + side * 0.25);
    solid.box(m, W + 0.5, H + 0.5, 0.45, 0x16191e, STEEL);
    for (const sx of [-1, 1]) {
      const mc = new THREE.Matrix4().makeTranslation(sx * 3.6, (y + H / 2 + ROOF.edgeY) / 2, z + side * 0.25);
      solid.box(mc, 0.06, ROOF.edgeY - y - H / 2, 0.06, 0x30343a, STEEL);
    }
    // the screen faces the court: right = +x seen from the far end's front (it faces +z), −x at the near end
    const right = new THREE.Vector3(side < 0 ? 1 : -1, 0, 0);
    glow.panel(new THREE.Vector3(0, y, z - side * 0.005), right, new THREE.Vector3(0, 1, 0), W, H, { T: W, H, phase: 0, mode: LED.screen });
  }
}
