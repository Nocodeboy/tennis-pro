// The ball's physics, shot by shot (docs/concepto.md, «Gráficos y simulación 0.5»): launch, flight, apex and height
// over the tape of the game's typical shots, how far the closed-form flight strays from a numerical one with real
// quadratic drag (same launch), and what the bounce keeps. Usage: npx tsx tools/ballphys.ts
import { bounce, groundTime, minFlight, netTime, posAt, seg, shotByClearance, velAt, type Vec3 } from '../src/sim/ball';
import { HL, R, netHeight } from '../src/sim/court';
import { SPIN } from '../src/sim/match';

const f = (v: number, d = 2) => v.toFixed(d);
/** quadratic drag (0.036·v²) with the same effective gravity, small steps */
function realFlight(p: Vec3, v: Vec3, g: number, C = 0.036) {
  let x = p.x, y = p.y, z = p.z, vx = v.x, vy = v.y, vz = v.z;
  const h = 0.0005;
  let t = 0;
  const pts: [number, number, number, number][] = [];
  while (y > R && t < 6) {
    const sp = Math.hypot(vx, vy, vz);
    vx -= C * sp * vx * h;
    vy -= (C * sp * vy + g) * h;
    vz -= C * sp * vz * h;
    x += vx * h;
    y += vy * h;
    z += vz * h;
    t += h;
    pts.push([t, x, y, z]);
  }
  return pts;
}
interface Case { name: string; from: Vec3; tx: number; tz: number; clear: number; pace?: number; kind: keyof typeof SPIN }
const cases: Case[] = [
  { name: 'dejada cocina→cocina', from: { x: 0, y: 0.45, z: 2.4 }, tx: 0.3, tz: -1.3, clear: 0.17, kind: 'dink' },
  { name: 'tercer golpe (dejada)', from: { x: 0, y: 0.7, z: 6.6 }, tx: 0, tz: -1.4, clear: 0.3, kind: 'drop' },
  { name: 'drive desde el fondo', from: { x: 0, y: 0.8, z: 6.6 }, tx: 0.5, tz: -5.6, clear: 0.2, kind: 'drive' },
  { name: 'resto', from: { x: 0, y: 0.7, z: 6.9 }, tx: 0, tz: -5.8, clear: 0.55, kind: 'return' },
  { name: 'saque', from: { x: 1.0, y: 0.7, z: 7.0 }, tx: -1.5, tz: -4.7, clear: 0.7, kind: 'serve' },
  { name: 'globo corto', from: { x: 0, y: 0.8, z: 6.0 }, tx: 0, tz: -(HL - 1.6), clear: 3.0, kind: 'lob' },
  { name: 'globo profundo', from: { x: 0, y: 0.8, z: 6.0 }, tx: 0, tz: -(HL - 0.4), clear: 2.2, kind: 'lob' },
  { name: 'ataque (bola a 1,2 m)', from: { x: 0, y: 1.2, z: 2.4 }, tx: 0, tz: -2.6, clear: 0.1, pace: 0.85, kind: 'speedup' },
  { name: 'bloqueo / reset', from: { x: 0, y: 0.6, z: 2.4 }, tx: 0, tz: -1.6, clear: 0.2, kind: 'auto' },
  { name: 'remate (2,3 m)', from: { x: 0, y: 2.3, z: 3.0 }, tx: 1.0, tz: -4.0, clear: 0.08, pace: 0.8, kind: 'smash' },
];
console.log('golpe | salida m/s | vuelo s | ápice m | sobre la cinta m | desvío máx. frente al cuadrático (cm) | bote: ritmo que conserva, altura m, 2º bote a m');
for (const c of cases) {
  const d = Math.hypot(c.tx - c.from.x, c.tz - c.from.z);
  const spin = SPIN[c.kind];
  const sh = shotByClearance(c.from, c.tx, c.tz, c.clear, minFlight(d) * (c.pace ?? 1), spin);
  const s = seg(0, c.from, sh.v, spin, sh.k, sh.g);
  const tg = groundTime(s);
  const tn = netTime(s);
  const pn = tn !== null ? posAt(s, tn) : null;
  let ap = 0;
  for (let t = 0; t < tg; t += 0.005) ap = Math.max(ap, posAt(s, t).y);
  let mx = 0;
  for (const [t, x, y, z] of realFlight(c.from, sh.v, sh.g)) {
    if (t > tg) break;
    const q = posAt(s, t);
    mx = Math.max(mx, Math.hypot(q.x - x, q.y - y, q.z - z));
  }
  const vl = velAt(s, tg);
  const b = bounce(s, tg);
  const tg2 = groundTime(b);
  let ap2 = 0;
  for (let t = tg; t < tg2; t += 0.004) ap2 = Math.max(ap2, posAt(b, t).y);
  const p1 = posAt(s, tg);
  const p2 = posAt(b, tg2);
  console.log(
    `${c.name.padEnd(22)} | ${f(Math.hypot(sh.v.x, sh.v.y, sh.v.z), 1).padStart(4)} | ${f(sh.T)} | ${f(ap)} | ${pn ? f(pn.y - R - netHeight(pn.x)) : '-'} | ${f(mx * 100, 0).padStart(3)} | ${f((Math.hypot(b.vx, b.vz) / Math.hypot(vl.x, vl.z)) * 100, 0)} % · ${f(ap2)} · ${f(Math.hypot(p2.x - p1.x, p2.z - p1.z))}`,
  );
}
// the USA Pickleball drop test: from 78 in (1.98 m) it must come back up 30–34 in (0.76–0.86 m)
const drop = seg(0, { x: 0, y: 1.98, z: 3 }, { x: 0, y: 0, z: 0 }, 0, 0.1, 9.81);
const db = bounce(drop, groundTime(drop));
let up = 0;
for (let t = db.t0; t < groundTime(db); t += 0.002) up = Math.max(up, posAt(db, t).y);
console.log(`\nbote de norma (soltada desde 1,98 m): sube a ${f(up + R, 3)} m (norma 0,76–0,86)`);
