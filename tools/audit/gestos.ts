// Auditoría 04 · la batería de gestos del pulgar derecho, sin navegador: el Input real recibe las mismas muestras que
// manda el navegador (pointerdown, pointermove a `HZ` Hz y, al levantar, la muestra del pointerup en la misma posición
// `LIFT` s después del último movimiento: Input la añade en su manejador de `pointerup`), y el HumanController real dice
// qué golpe saldría sobre una bola alta cerca de la red (2,6 m de altura a 2,5 m de la red) y sobre una volea normal.
// Es la misma tabla que tools/audit/ux/gest.py (que lo hace en la página con toques por CDP).
// npx tsx tools/audit/gestos.ts [lift=0.012] [hz=120]
const g = globalThis as unknown as { window?: unknown };
g.window ??= { addEventListener() {} };
import { Input } from '../../src/input';
import { HumanController } from '../../src/human';
import { AIController, PAIRS } from '../../src/sim/brain';
import { Match } from '../../src/sim/match';
import type { Plan } from '../../src/sim/types';

const LIFT = Number(process.argv[2] ?? 0.012);
const HZ = Number(process.argv[3] ?? 120);

type Seg = [number, number, number];
/** relative moves (duration s, dx, dy) sampled at HZ; (d, 0, 0) is a hold (the samples repeat the position) */
function path(segs: Seg[]): [number, number, number][] {
  const pts: [number, number, number][] = [[0, 0, 0]];
  let t = 0;
  let x = 0;
  let y = 0;
  for (const [d, dx, dy] of segs) {
    const n = Math.max(1, Math.round(d * HZ));
    for (let i = 1; i <= n; i++) pts.push([t + (d * i) / n, x + (dx * i) / n, y + (dy * i) / n]);
    t += d;
    x += dx;
    y += dy;
  }
  return pts;
}

export const GESTURES: Record<string, Seg[]> = {
  'latigazo 40px/40ms tras quieto': [[0.12, 0, 0], [0.04, 0, -40]],
  'latigazo 50px/50ms tras quieto': [[0.12, 0, 0], [0.05, 0, -50]],
  'latigazo 60px/60ms tras quieto': [[0.12, 0, 0], [0.06, 0, -60]],
  'latigazo 70px/50ms tras quieto': [[0.12, 0, 0], [0.05, 0, -70]],
  'latigazo 80px/50ms tras quieto': [[0.12, 0, 0], [0.05, 0, -80]],
  'latigazo 90px/50ms tras quieto': [[0.12, 0, 0], [0.05, 0, -90]],
  'latigazo 100px/60ms tras quieto': [[0.12, 0, 0], [0.06, 0, -100]],
  'latigazo 130px/80ms tras quieto': [[0.12, 0, 0], [0.08, 0, -130]],
  'latigazo corto (30px/40ms)': [[0.12, 0, 0], [0.04, 0, -30]],
  'latigazo muy corto (20px/25ms)': [[0.12, 0, 0], [0.025, 0, -20]],
  'latigazo sin parar antes (50px/50ms)': [[0.05, 0, -50]],
  'remate con arco de 20 grados (90px/60ms)': [[0.12, 0, 0], [0.06, -31, -85]],
  'latigazo torcido 15 grados (70px/60ms)': [[0.12, 0, 0], [0.06, 18, -68]],
  'latigazo torcido 25 grados (70px/60ms)': [[0.12, 0, 0], [0.06, 30, -63]],
  'latigazo torcido 30 grados (70px/70ms)': [[0.12, 0, 0], [0.07, 35, -61]],
  'latigazo torcido 40 grados (70px/60ms)': [[0.12, 0, 0], [0.06, 45, -54]],
  'latigazo torcido 50 grados (70px/70ms)': [[0.12, 0, 0], [0.07, 54, -45]],
  'latigazo torcido 60 grados (70px/70ms)': [[0.12, 0, 0], [0.07, 61, -35]],
  'latigazo torcido 70 grados (70px/70ms)': [[0.12, 0, 0], [0.07, 66, -24]],
  'latigazo a tope (110px/70ms)': [[0.1, 0, 0], [0.07, 0, -110]],
  'latigazo tras apuntar (60px/300ms, quieto 100ms, 60px/60ms)': [[0.3, 40, -45], [0.1, 0, 0], [0.06, 0, -60]],
  'latigazo tras apuntar sin pausa (60px/300ms, 60px/50ms)': [[0.3, 40, -45], [0.05, 0, -60]],
  'latigazo abajo (60px/60ms)': [[0.12, 0, 0], [0.06, 0, 60]],
  'latigazo abajo-diagonal 40 grados': [[0.12, 0, 0], [0.06, 39, 46]],
  'colocado (arrastra 70px/300ms, quieto 150ms)': [[0.3, 0, -70], [0.15, 0, 0]],
  'normal (arrastra 80px/300ms y suelta en marcha)': [[0.3, 20, -80]],
  'apuntar rápido (120px/200ms y suelta en marcha)': [[0.2, 60, -105]],
  'apuntar a la izquierda rápido (100px/180ms)': [[0.18, -100, -20]],
  'apuntar y corregir (80px/250ms, 25px/60ms)': [[0.25, 50, -60], [0.06, 25, 0]],
  'toque (90ms)': [[0.09, 0, 0]],
  'toque con temblor 10px': [[0.04, 6, 4], [0.05, 2, 4]],
  'toque con temblor 16px': [[0.04, 10, 6], [0.05, 3, 6]],
  'toque con temblor 20px': [[0.04, 12, 8], [0.05, 4, 7]],
  'toque largo 0.35 s': [[0.35, 0, 0]],
  'arrastre largo 1.2 s y suelta quieto': [[0.5, 30, -90], [0.5, -20, 10], [0.2, 0, 0]],
};

// a match to read the shots from: an overhead ball close to the net, and a volley at the tape
const ai = PAIRS[0].a.skill;
const m = new Match([0, 1, 2, 3].map((j) => ({ team: (j < 2 ? 0 : 1) as 0 | 1, human: j === 0, speed: ai.speed, reaction: ai.reaction, look: j })), { games: 3, golden: true }, 1);
let clock = 0;
const el = { addEventListener() {}, clientWidth: 390, setPointerCapture() {} } as unknown as HTMLElement;
const input = new Input(el, () => clock);
const ctl = new HumanController(input);
ctl.pxPerM = 33;
m.setControllers([ctl, new AIController(ai), new AIController(ai), new AIController(ai)]);
m.start();
const p = m.players[0];
p.x = 0.6;
p.z = 2.5;
// the opponents up at the net (an attack «at the body» lands at their feet)
m.players[2].x = 2.2;
m.players[3].x = -2.2;
m.players[2].z = m.players[3].z = -3.0;
m.phase = 'rally';
(m as unknown as { rally: unknown }).rally = { shots: 6, last: m.players[2], bounces: 0, walls: 0 };
const base = { t: 1, bx: 0.6, bz: 2.4, fx: 0.6, fz: 2.5, hand: 1 as const, reach: true, oops: false };
const high: Plan = { ...base, by: 2.6, volley: true, overhead: true };
const volley: Plan = { ...base, by: 1.0, volley: true, overhead: false };

const priv = ctl as unknown as { powerOf(r: unknown): number; isAttack?(r: unknown, plan: Plan): boolean; attackAim(m: Match, p: unknown, plan: Plan, r: unknown, power: number): { kind: string; special?: string; x: number; z: number } };
const shotOf = (plan: Plan, r: Record<string, unknown>) => {
  const power = priv.powerOf(r);
  // (HumanController.hit: a flick bent past FLICK.cone on a ball that is not over the head is a hard aimed shot)
  const attack = priv.isAttack ? priv.isAttack(r, plan) : r.gesture === 'attack';
  if (attack || r.gesture === 'down') {
    const a = priv.attackAim(m, p, plan, r, power);
    return `${a.special ?? a.kind} → (${a.x.toFixed(1)}, ${Math.abs(a.z).toFixed(1)} m)`;
  }
  if (r.gesture === 'tap') return 'bloqueo';
  const a = ctl.aim(m, p, plan, (r.ax as number) ?? (r.dx as number), (r.ay as number) ?? (r.dy as number), false, 0, { power });
  return `${a.kind} → (${a.x.toFixed(1)}, ${Math.abs(a.z).toFixed(1)} m)`;
};

const f2 = (v: unknown) => (typeof v === 'number' ? v.toFixed(2).replace(/\.?0+$/, '') : v);
console.log(`gestos con muestra de levantado a ${(LIFT * 1000).toFixed(0)} ms, ${HZ} Hz, móvil de 390 px (pxPerM 33)`);
console.log('gesto | lectura | potencia | apuntado antes (ax, ay) | trazo (fx, fy) | bola alta en la red | volea a 1 m');
for (const [name, segs] of Object.entries(GESTURES)) {
  const pts = path(segs);
  const t0 = 10;
  clock = t0;
  input.aimDown(t0);
  for (const [t, dx, dy] of pts.slice(1)) {
    clock = t0 + t;
    input.aimMove(dx, dy, t0 + t);
  }
  const [tl, lx, ly] = pts[pts.length - 1];
  clock = t0 + tl + LIFT;
  // (the pointerup: its own position is the stroke's last sample, then the lift)
  input.aimMove(lx, ly, clock);
  input.aimUp(clock);
  const r = input.take(-Infinity) as unknown as Record<string, unknown> | null;
  if (!r) {
    console.log(`${name} | (nada)`);
    continue;
  }
  const read = r.gesture === 'attack' ? 'ataque' : r.gesture === 'down' ? 'latigazo abajo' : r.gesture === 'tap' ? 'toque' : r.ax !== undefined ? 'golpe rápido' : 'soltar';
  const aimed = r.ax !== undefined ? `${f2(r.ax)}, ${f2(r.ay)}` : '–';
  const fl = r.fx !== undefined ? `${f2(r.fx)}, ${f2(r.fy)}` : '–';
  console.log(`${name} | ${read} | ${f2(r.power)} | ${aimed} | ${fl} | ${shotOf(high, r)} | ${shotOf(volley, r)}`);
}
