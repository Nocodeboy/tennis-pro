// Golpes de tenis escenificados (agente de gráficos): un CharacterView llevado a un solo contacto elegido a mano (dónde
// se golpea la bola, el tipo de golpe, la potencia, si el plan lo dice antes), sin simulación detrás: un Match de pega
// con lo que lee la vista. Para medir la raqueta en la bola en el contacto (el punto dulce, gear.ts RACKET.face) y ver
// cada golpe de cerca. Lo usan tools/render/stage-tenis.ts (números, en Node) y tools/render/hstage.py (capturas en el
// banco de pruebas: window.__stage). Nada aquí importa three.js.
import { posAt, type Seg } from '../../src/sim/ball';
import type { Plan, Player, ShotKind } from '../../src/sim/types';

export interface Scenario {
  name: string;
  /** lo que es el golpe (el swing que la vista elige es suyo, como en un partido) */
  kind: ShotKind;
  /** el plan lo dice antes del contacto (Plan.kind): un cortado se prepara como cortado */
  told?: boolean;
  power?: number;
  /** +1 derecha, −1 revés */
  hand: 1 | -1;
  /** el contacto (m); la mitad cercana es z > 0, el jugador mira a −z */
  x: number;
  y: number;
  z: number;
  /** la velocidad de la bola que llega (m/s) */
  vin: [number, number, number];
  /** dónde están los pies (m, respecto al contacto; por defecto debajo y un poco detrás) */
  fx?: number;
  fz?: number;
  overhead?: boolean;
  volley?: boolean;
  /** un saque: la mano del contrato (el windup), no un plan */
  serve?: boolean;
}

export interface StageResult {
  name: string;
  swing: string;
  /** punto dulce a la bola en el contacto (m), el cuerpo sobre el suelo (m) */
  paddle: number;
  rootY: number;
  /** altura del punto dulce 0,2 s antes y 0,3 s después del contacto, y la más baja después (m) */
  yPre: number;
  y30: number;
  minAfter: number;
  /** la mano izquierda a la empuñadura en el contacto (m; el revés a dos manos) */
  leftHand: number;
}

interface CharLike {
  root: { position: { x: number; y: number; z: number }; updateMatrixWorld(force?: boolean): void };
  update(dt: number, m: unknown, p: Player, gate: boolean, ball: { x: number; y: number; z: number } | null): void;
  onHit(x: number, y: number, z: number, t: number, hand: 1 | -1, shot?: { kind?: ShotKind; power?: number }): void;
}
type M = { elements: number[] };
const posOf = (o: { matrixWorld: M }) => {
  const e = o.matrixWorld.elements;
  return { x: e[12], y: e[13], z: e[14] };
};

export const T0 = -1.3;
export const T1 = 0.8;

/** Lleva `ch` por el golpe a 60 fps de T0 a T1 s del contacto (en t = 10 s), con `frame(tc)` tras cada paso. */
export function stage(ch: CharLike, sc: Scenario, frame?: (tc: number, ball: { x: number; y: number; z: number } | null) => void): StageResult {
  const tC = 10;
  const dt = 1 / 60;
  const vin = sc.vin;
  const seg: Seg = { t0: tC, x: sc.x, y: sc.y, z: sc.z, vx: vin[0], vy: vin[1], vz: vin[2], k: 0.05, g: 9.81, spin: 0 } as Seg;
  const out: Seg = { t0: tC, x: sc.x, y: sc.y, z: sc.z, vx: -sc.x * 0.4, vy: sc.serve ? -2 : sc.y > 1.9 ? -6 : 2, vz: -24, k: 0.05, g: 9.81, spin: 0 } as Seg;
  const plan: Plan = { t: tC, bx: sc.x, by: sc.y, bz: sc.z, fx: sc.x + (sc.fx ?? 0), fz: sc.z + (sc.fz ?? 0.15), volley: !!sc.volley, overhead: sc.overhead ?? sc.y > 1.9, hand: sc.hand, reach: true, oops: false };
  if (sc.told) (plan as Plan & { kind?: ShotKind }).kind = sc.kind;
  const other = { id: 1, team: 1, side: -1, x: 0, z: -10, plan: null, human: false } as unknown as Player;
  const p = {
    id: 0, team: 0, side: 1, human: false, x: plan.fx, z: plan.fz, vx: 0, vz: 0, speed: 5, reaction: 0.2, plan: sc.serve ? null : plan, moveFrom: 0,
    homeX: plan.fx, homeZ: plan.fz, depth: 0, lastHit: null, look: 0, lane: 1, fit: 1, dist: 0,
  } as unknown as Player;
  const m = {
    t: tC + T0,
    phase: sc.serve ? 'serve' : 'rally',
    windup: sc.serve ? { pid: 0, at: tC, x: sc.x, y: sc.y, z: sc.z } : null,
    players: [p, other],
    rally: sc.serve ? null : { last: other, seg, bounces: 1, shots: 3 },
    server: () => (sc.serve ? p : other),
  };
  const res: StageResult = { name: sc.name, swing: '', paddle: NaN, rootY: NaN, minAfter: Infinity, y30: NaN, yPre: NaN, leftHand: NaN };
  const ball = { x: 0, y: 0, z: 0 };
  const n = Math.round((T1 - T0) * 60);
  for (let i = 0; i <= n; i++) {
    const tc = T0 + i * dt;
    m.t = tC + tc;
    if (Math.abs(tc) < dt / 2) {
      p.plan = null;
      p.lastHit = { t: tC, kind: sc.kind, hand: sc.hand, overhead: plan.overhead, timing: 'good' };
      ch.onHit(sc.x, sc.y, sc.z, tC, sc.hand, { kind: sc.kind, power: sc.power ?? 0.5 });
      m.rally = { last: p, seg: out, bounces: 0, shots: 4 } as never;
      m.windup = null;
      m.phase = 'rally';
    }
    const b = sc.serve && tc < 0 ? null : posAt(tc < 0 ? seg : out, m.t, ball);
    ch.update(dt, m, p, true, b);
    const tip = posOf((ch as unknown as { tip: { matrixWorld: M } }).tip);
    const sw = (ch as unknown as { swing: { kind: string } | null }).swing;
    if (Math.abs(tc) < dt / 2) {
      res.paddle = Math.hypot(tip.x - sc.x, tip.y - sc.y, tip.z - sc.z);
      res.rootY = ch.root.position.y;
      res.swing = sw ? sw.kind : '';
      const B = (ch as unknown as { bone: Record<string, { matrixWorld: M }> }).bone;
      const pad = posOf((ch as unknown as { paddle: { matrixWorld: M } }).paddle);
      const lh = posOf(B.LeftHand);
      res.leftHand = Math.hypot(lh.x - pad.x, lh.y - pad.y, lh.z - pad.z);
    }
    if (Math.abs(tc + 0.2) < dt / 2) res.yPre = tip.y;
    if (tc > 0) res.minAfter = Math.min(res.minAfter, tip.y);
    if (Math.abs(tc - 0.3) < dt / 2) res.y30 = tip.y;
    frame?.(tc, tc < 0.6 ? b : null);
  }
  return res;
}

/**
 * Los golpes: derecha y revés a dos manos a varias alturas, cortados, voleas, remate y el saque del contrato. El
 * jugador de la mitad cercana mira a −z: su derecha es +x (la derecha, el saque), su izquierda −x (el revés).
 */
export const SCENARIOS: Scenario[] = [
  ...[0.95, 1.0].map((y) => ({ name: `derecha-cerca-${y.toFixed(2)}`, kind: 'drive' as ShotKind, hand: 1 as const, x: 0.55, y, z: 12.2, vin: [-0.5, -1, 18] as [number, number, number], fx: -0.5, fz: 0.15 })),
  ...[0.55, 0.85, 1.15, 1.45].map((y) => ({ name: `derecha-${y.toFixed(2)}`, kind: 'drive' as ShotKind, hand: 1 as const, x: 0.9, y, z: 12.2, vin: [-0.5, -1, 18] as [number, number, number], fx: -0.85, fz: 0.25 })),
  ...[0.55, 0.85, 1.15, 1.45].map((y) => ({ name: `reves-${y.toFixed(2)}`, kind: 'drive' as ShotKind, hand: -1 as const, x: -0.9, y, z: 12.2, vin: [0.5, -1, 18] as [number, number, number], fx: 0.85, fz: 0.25 })),
  ...[0.6, 0.95].map((y) => ({ name: `cortado-${y.toFixed(2)}`, kind: 'slice' as ShotKind, told: true, hand: 1 as const, x: 0.9, y, z: 12.0, vin: [-0.5, -1, 16] as [number, number, number], fx: -0.85, fz: 0.25 })),
  ...[0.6, 0.95].map((y) => ({ name: `cortado-rev-${y.toFixed(2)}`, kind: 'slice' as ShotKind, told: true, hand: -1 as const, x: -0.9, y, z: 12.0, vin: [0.5, -1, 16] as [number, number, number], fx: 0.85, fz: 0.25 })),
  { name: 'cortado-tarde-0.80', kind: 'slice', hand: 1, x: 0.9, y: 0.8, z: 12.0, vin: [-0.5, -1, 16], fx: -0.85, fz: 0.25 },
  ...[0.7, 1.2].map((y) => ({ name: `volea-${y.toFixed(2)}`, kind: 'speedup' as ShotKind, volley: true, hand: 1 as const, x: 0.6, y, z: 2.6, vin: [-0.3, -0.5, 20] as [number, number, number], fx: -0.5, fz: 0.2 })),
  { name: 'volea-rev-1.00', kind: 'speedup', volley: true, hand: -1, x: -0.6, y: 1.0, z: 2.6, vin: [0.3, -0.5, 20], fx: 0.5, fz: 0.2 },
  { name: 'remate-2.70', kind: 'smash', hand: 1, x: 0.3, y: 2.7, z: 4.0, vin: [0, -7, 5], fx: -0.15, fz: 0.15, overhead: true },
  { name: 'globo-1.00', kind: 'lob', hand: 1, x: 0.9, y: 1.0, z: 12.3, vin: [-0.5, -1, 16], fx: -0.85, fz: 0.25 },
  // (el saque del contrato: el sacador justo detrás de la línea de fondo, z = HL + 0.1; el contacto 0,35 m dentro de
  // la línea y 0,25 m a su derecha, a 2,75 m)
  { name: 'saque-2.75', kind: 'serve', serve: true, hand: 1, x: 2.0 + 0.25, y: 2.75, z: 23.77 / 2 - 0.35, vin: [0, -3, 0], fx: -0.25, fz: 0.45 },
];
