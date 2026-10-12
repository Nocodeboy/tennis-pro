// A staged shot: one CharacterView driven through a single contact chosen by hand (where the ball is met, the swing's
// kind, the hit's power and special), with no simulation behind it: a stand-in Match with just what the view reads.
// For shots the simulation does not play yet (or seldom): the bajada, the remates por 3 and por 4, a bandeja met low.
// Used by tools/stage.ts (numbers, in Node) and tools/stage.py (close-ups in the page: bundled to window.__stage).
// Nothing here imports three.js: the view's own is used through the character.

import { posAt, type Seg } from '../src/sim/ball';
import type { Plan, Player, ShotKind, Special } from '../src/sim/types';

export interface Scenario {
  name: string;
  /** what the hit is (the swing the view plays is its own guess, as in a match) */
  kind: ShotKind;
  special?: Special;
  power?: number;
  /** +1 forehand, −1 backhand */
  hand: 1 | -1;
  /** the contact (m); the near half is z > 0, the player faces −z */
  x: number;
  y: number;
  z: number;
  /** the incoming ball's velocity at the contact (m/s): off the back glass for a bajada (vz < 0) */
  vin: [number, number, number];
  /** where the feet are (m, off the contact; default under it, a little behind) */
  fx?: number;
  fz?: number;
  overhead?: boolean;
}

/** what a staged run measures at the contact frame */
export interface StageResult {
  name: string;
  swing: string;
  over: string;
  /** paddle (middle of the face) to the ball at the contact (m), the body over the floor (m) */
  paddle: number;
  rootY: number;
  /** the paddle's lowest point and its height 0.3 s after the contact (m) */
  minAfter: number;
  y30: number;
  /** the paddle's height 0.2 s before the contact (m): a bajada comes down onto the ball */
  yPre: number;
}

interface CharLike {
  root: { position: { x: number; y: number; z: number }; updateMatrixWorld(force?: boolean): void };
  update(dt: number, m: unknown, p: Player, gate: boolean, ball: { x: number; y: number; z: number } | null): void;
  onHit(x: number, y: number, z: number, t: number, hand: 1 | -1, shot?: { kind?: ShotKind; power?: number; special?: Special }): void;
}

/** the middle of the paddle face, in the world (the character's private `tip`) */
function tipOf(ch: CharLike): { x: number; y: number; z: number } {
  const tip = (ch as unknown as { tip: { getWorldPosition(v: unknown): { x: number; y: number; z: number }; matrixWorld: { elements: number[] } } }).tip;
  const e = tip.matrixWorld.elements;
  return { x: e[12], y: e[13], z: e[14] };
}

export const T0 = -1.3;
export const T1 = 0.8;

/**
 * Steps `ch` (a fresh CharacterView) through the scenario at 60 fps from T0 to T1 s around the contact (at t = 10 s),
 * calling `frame(tc)` after each update (tc: s from the contact). Returns the measures.
 */
export function stage(ch: CharLike, sc: Scenario, frame?: (tc: number, ball: { x: number; y: number; z: number } | null) => void): StageResult {
  const tC = 10;
  const dt = 1 / 60;
  const vin = sc.vin;
  const seg: Seg = { t0: tC, x: sc.x, y: sc.y, z: sc.z, vx: vin[0], vy: vin[1], vz: vin[2], k: 0.05, g: 9.81, spin: 0 };
  // (out: towards the far half, hard and down for a bajada or a remate)
  const out: Seg = { t0: tC, x: sc.x, y: sc.y, z: sc.z, vx: -sc.x * 0.6, vy: sc.y > 1.9 ? -6 : -1.5, vz: -22, k: 0.05, g: 9.81, spin: 0 };
  const plan: Plan = { t: tC, bx: sc.x, by: sc.y, bz: sc.z, fx: sc.x + (sc.fx ?? 0), fz: sc.z + (sc.fz ?? 0.15), volley: false, overhead: sc.overhead ?? sc.y > 1.9, hand: sc.hand, reach: true, oops: false };
  const other = { id: 1, team: 1, side: -1, x: 0, z: -7, plan: null, human: false } as unknown as Player;
  const p = {
    id: 0, team: 0, side: 1, human: false, x: plan.fx, z: plan.fz, vx: 0, vz: 0, speed: 5, reaction: 0.2, plan, moveFrom: 0,
    homeX: plan.fx, homeZ: plan.fz, depth: 0, lastHit: null, look: 0, lane: 1,
  } as unknown as Player;
  const legs = [{ s: seg, t0: tC - 3, t1: tC + 0.0001, floor: 1 }];
  const m = {
    t: tC + T0,
    phase: 'rally',
    windup: null,
    players: [p, other],
    rally: { last: other, seg, bounces: 1, walls: 1, shots: 3 },
    server: () => other,
    path: () => legs,
  };
  const res: StageResult = { name: sc.name, swing: '', over: '', paddle: NaN, rootY: NaN, minAfter: Infinity, y30: NaN, yPre: NaN };
  const ball = { x: 0, y: 0, z: 0 };
  const n = Math.round((T1 - T0) * 60);
  for (let i = 0; i <= n; i++) {
    const tc = T0 + i * dt;
    m.t = tC + tc;
    // (the hit: the plan goes, the hit is known, as in a match's frame: events before the view's update)
    if (Math.abs(tc) < dt / 2) {
      p.plan = null;
      p.lastHit = { t: tC, kind: sc.kind, hand: sc.hand, overhead: plan.overhead, timing: 'good' };
      ch.onHit(sc.x, sc.y, sc.z, tC, sc.hand, { kind: sc.kind, power: sc.power ?? 0.5, special: sc.special });
      m.rally.last = p;
    }
    const b = posAt(tc < 0 ? seg : out, m.t, ball);
    ch.update(dt, m, p, true, b);
    const tip = tipOf(ch);
    const sw = (ch as unknown as { swing: { kind: string } | null }).swing;
    if (Math.abs(tc) < dt / 2) {
      res.paddle = Math.hypot(tip.x - sc.x, tip.y - sc.y, tip.z - sc.z);
      res.rootY = ch.root.position.y;
      res.swing = sw ? sw.kind : '';
      res.over = (ch as unknown as { over: string }).over;
    }
    if (Math.abs(tc + 0.2) < dt / 2) res.yPre = tip.y;
    if (tc > 0) res.minAfter = Math.min(res.minAfter, tip.y);
    if (Math.abs(tc - 0.3) < dt / 2) res.y30 = tip.y;
    frame?.(tc, tc < 0.6 ? b : null);
  }
  return res;
}

/**
 * The shots worth staging. The bajada: met at 1.3–1.75 m by a player 8.5 m from the net, the ball back off the back
 * glass (coming towards the net, 8 m/s, dropping); forehand and backhand. The remates near the net (por 3 and por 4 at
 * 2.85 m, the flat one), and the bandeja deep at 2.3 … 2.85 m.
 */
export const SCENARIOS: Scenario[] = [
  ...[1.3, 1.45, 1.6, 1.75].map((y) => ({ name: `bajada-${y.toFixed(2)}`, kind: 'bajada' as ShotKind, hand: 1 as const, x: 1.2, y, z: 8.4, vin: [0.4, -2.2, -8] as [number, number, number], fx: -0.42, fz: 0.42 })),
  ...[1.35, 1.6].map((y) => ({ name: `bajada-rev-${y.toFixed(2)}`, kind: 'bajada' as ShotKind, hand: -1 as const, x: -1.2, y, z: 8.4, vin: [-0.4, -2.2, -8] as [number, number, number], fx: 0.42, fz: 0.42 })),
  { name: 'bajada-fuerte-1.50', kind: 'bajada', hand: 1, x: 1.2, y: 1.5, z: 8.4, vin: [0.4, -2.2, -8], fx: -0.42, fz: 0.42, power: 1 },
  { name: 'remate-2.85', kind: 'smash', hand: 1, x: 0.8, y: 2.85, z: 3.2, vin: [0, -6, 4], fx: -0.15, fz: 0.1, overhead: true },
  { name: 'por3-2.85', kind: 'smash', special: 'por3', power: 1, hand: 1, x: 0.8, y: 2.85, z: 3.2, vin: [0, -6, 4], fx: -0.15, fz: 0.1, overhead: true },
  { name: 'por4-2.85', kind: 'smash', special: 'por4', power: 0.8, hand: 1, x: 0.8, y: 2.85, z: 3.2, vin: [0, -6, 4], fx: -0.15, fz: 0.1, overhead: true },
  { name: 'por4-2.40', kind: 'smash', special: 'por4', power: 0.8, hand: 1, x: 0.8, y: 2.4, z: 3.2, vin: [0, -6, 4], fx: -0.15, fz: 0.1, overhead: true },
  ...[2.3, 2.4, 2.5, 2.6, 2.85].map((y) => ({ name: `bandeja-${y.toFixed(2)}`, kind: 'bandeja' as ShotKind, hand: 1 as const, x: 0.9, y, z: 6.8, vin: [0, -5, 5] as [number, number, number], fx: -0.15, fz: 0.1, overhead: true })),
];
