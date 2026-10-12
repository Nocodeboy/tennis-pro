// Auditoría 04 · física de la bola frente al pádel real.
// Lanza los golpes tipo de la CPU (los parámetros de brain.ts chooseShot/specialShot) con la misma cadena que
// Match.launch, pero sin azar (q = 1, sin dispersión), y sigue la bola por el suelo y las paredes con ball.ts
// ignorando el reglamento (para ver qué hace la bola después del cristal). También: bote FIP, cristal y malla en
// aislado, y el error de la deriva lineal frente a la cuadrática.
// npx tsx tools/audit/fisica.ts
import { BOUNCE_Y, bounce, G, minFlight, nextEvent, posAt, seg, shotByClearance, velAt, wallBounce, type Seg, type Vec3 } from '../../src/sim/ball';
import { POR, POWER } from '../../src/sim/brain';
import { HL, NET_C, R, SERVICE, backSurface, sideSurface } from '../../src/sim/court';
import { LAUNCH, SPIN } from '../../src/sim/match';
import type { ShotKind } from '../../src/sim/types';

const kmh = (v: number) => (v * 3.6).toFixed(0);
const f2 = (v: number) => v.toFixed(2);

/** Match.launch without the dice (q = 1): the flight a clean contact gets. */
function launch(kind: ShotKind, from: Vec3, tx: number, tz: number, clear: number, pace = 1, power = 0.5, special: 'por3' | 'por4' | null = null) {
  const soft = kind === 'dink' || kind === 'drop';
  const dp = power - 0.5;
  const pw = soft || kind === 'lob' ? POWER.soft : 1;
  let p = pace * (1 - dp * POWER.pace * pw);
  let c = clear;
  if (kind === 'lob') {
    c *= 1 - dp * 0.3;
    tz += -Math.sign(from.z) * dp * 0.6;
  } else if (!soft && kind !== 'smash' && kind !== 'bandeja' && kind !== 'vibora') c = Math.max(0.03, c * (1 - dp * POWER.clear));
  const d = Math.hypot(tx - from.x, tz - from.z);
  const minT = Math.max(minFlight(d) * p, d / LAUNCH.vmax);
  const spin = special ? (special === 'por3' ? POR.spin3 : POR.spin4) : SPIN[kind];
  const shot = shotByClearance(from, tx, tz, c, minT, spin);
  return seg(0, from, shot.v, spin, shot.k, shot.g);
}

interface Trace {
  v0: number;
  apex: number;
  netClear: number;
  bounceZ: number;
  tBounce: number;
  /** speed (horizontal) at the first bounce, and the peak after it */
  vBounce: number;
  apex2: number;
  wall: { surf: string; y: number; v: number; axis: string }[];
  /** after the back glass: height and horizontal speed 1.5 m off it, how far it comes out (second bounce) */
  y15: number | null;
  out2: number | null;
  vOut: number | null;
  exit: boolean;
}

/** Follow the ball from s through floor and walls (no rules) until the 2nd floor bounce on the far side, or 6 events. */
function trace(s0: Seg, anyBack = false): Trace {
  const side = -Math.sign(s0.z); // the side it is going to
  const v = velAt(s0, s0.t0);
  const tr: Trace = { v0: Math.hypot(v.x, v.y, v.z), apex: s0.y, netClear: NaN, bounceZ: NaN, tBounce: NaN, vBounce: NaN, apex2: 0, wall: [], y15: null, out2: null, vOut: null, exit: false };
  let s = s0;
  let floors = 0;
  let afterBack = false;
  for (let i = 0; i < 8; i++) {
    const ev = nextEvent(s, s.t0 + 8);
    const tEnd = ev ? ev.t : s.t0 + 8;
    // sample the stretch
    for (let t = s.t0; t <= tEnd; t += 0.002) {
      const p = posAt(s, t);
      if (floors === 0) tr.apex = Math.max(tr.apex, p.y);
      if (floors === 1 && !afterBack) tr.apex2 = Math.max(tr.apex2, p.y);
      if (Number.isNaN(tr.netClear) && Math.sign(p.z) === side && floors === 0) {
        const q = posAt(s, Math.max(s.t0, t - 0.002));
        if (Math.sign(q.z) !== side) tr.netClear = p.y - R - NET_C;
      }
      if (afterBack && tr.y15 === null && Math.abs(p.z) <= HL - 1.5) {
        tr.y15 = p.y;
        const vv = velAt(s, t);
        tr.vOut = Math.hypot(vv.x, vv.z);
      }
    }
    if (!ev) break;
    if (ev.kind === 'floor') {
      floors++;
      if (afterBack) {
        // the first bounce after the back glass: how far it came out
        tr.out2 = HL - Math.abs(posAt(s, ev.t).z);
        break;
      }
      const p = posAt(s, ev.t);
      if (floors === 1) {
        tr.bounceZ = Math.abs(p.z);
        tr.tBounce = ev.t - s0.t0;
        const vv = velAt(s, ev.t);
        tr.vBounce = Math.hypot(vv.x, vv.z);
      }
      if (floors === 2) break;
      s = bounce(s, ev.t);
      continue;
    }
    const p = posAt(s, ev.t);
    const vv = velAt(s, ev.t);
    const surf = ev.hit.axis === 'x' ? sideSurface(Math.abs(p.z), p.y) : backSurface(p.y);
    tr.wall.push({ surf, y: p.y, v: Math.hypot(vv.x, vv.y, vv.z), axis: ev.hit.axis });
    if (surf === 'open') {
      tr.exit = true;
      break;
    }
    s = wallBounce(s, ev.hit, surf);
    if (ev.hit.axis === 'z' && (floors >= 1 || anyBack)) afterBack = true;
  }
  return tr;
}

// the shots (near side hitting to the far side: from z > 0 to tz < 0)
const shots: { name: string; kind: ShotKind; from: Vec3; tx: number; tz: number; clear: number; pace?: number; power?: number; special?: 'por3' | 'por4'; ref: string }[] = [
  { name: 'saque (1.º, al fondo del cuadro)', kind: 'serve', from: { x: 1.3, y: 0.7, z: SERVICE + 0.65 }, tx: -2.2, tz: -(SERVICE - 0.6), clear: 0.5, ref: '50–80 km/h (pro, por abajo)' },
  { name: 'resto bajo cruzado', kind: 'return', from: { x: 2.7, y: 0.85, z: 8.6 }, tx: -1.3, tz: -5.6, clear: 0.4, ref: '60–90 km/h' },
  { name: 'drive fondo-fondo (profundo)', kind: 'drive', from: { x: 1, y: 0.9, z: 8.8 }, tx: -2, tz: -7.8, clear: 0.5, pace: 1.15, ref: '70–100 km/h' },
  { name: 'drive passing (plano)', kind: 'drive', from: { x: 2, y: 0.9, z: 8.5 }, tx: 3.8, tz: -7, clear: 0.13, pace: 0.9, power: 0.68, ref: '90–120 km/h' },
  { name: 'drive a los pies (vs red)', kind: 'drive', from: { x: 0, y: 0.9, z: 8.5 }, tx: -1, tz: -3.9, clear: 0.17, ref: '60–90 km/h' },
  { name: 'volea profunda (red vs fondo)', kind: 'speedup', from: { x: 1.5, y: 1.0, z: 3 }, tx: -3, tz: -7.8, clear: 0.4, pace: 1.1, ref: '50–80 km/h (bloqueada/colocada)' },
  { name: 'volea definitiva a los pies', kind: 'speedup', from: { x: 1.5, y: 1.3, z: 3 }, tx: -1, tz: -3.3, clear: 0.08, pace: 0.8, power: 0.68, ref: '80–110 km/h' },
  { name: 'volea a la reja', kind: 'speedup', from: { x: 1.5, y: 1.3, z: 3 }, tx: -4.3, tz: -3.4, clear: 0.1, pace: 0.9, power: 0.68, ref: '—' },
  { name: 'bandeja (fondo)', kind: 'bandeja', from: { x: 1, y: 2.45, z: 5 }, tx: -3, tz: -7.8, clear: 0.55, pace: 1.1, power: 0.42, ref: '60–90 km/h, bota y sale baja del cristal' },
  { name: 'víbora (al lateral)', kind: 'vibora', from: { x: 2, y: 2.45, z: 4.5 }, tx: -4.1, tz: -7, clear: 0.25, pace: 0.9, power: 0.68, ref: '80–110 km/h, muere tras el lateral' },
  { name: 'remate plano (a los pies)', kind: 'smash', from: { x: 1, y: 2.6, z: 3 }, tx: -1, tz: -4.5, clear: 0.08, pace: 0.75, power: 0.68, ref: '100–140 km/h' },
  { name: 'remate por 3 (2,6 m a 2,5 m)', kind: 'smash', from: { x: 1, y: 2.6, z: 2.5 }, tx: 0, tz: -((POR.tape * 2.5) / (2.6 - POR.tape) + 0.25), clear: POR.clear3, pace: POR.pace3, power: 1, special: 'por3', ref: '120–150 km/h' },
  { name: 'remate por 4 (2,5 m a 2,5 m)', kind: 'smash', from: { x: 1, y: 2.5, z: 2.5 }, tx: 0, tz: -((POR.tape * 2.5) / (2.5 - POR.tape) + 0.25 + POR.extra4), clear: POR.clear4, pace: POR.pace4, power: 1, special: 'por4', ref: '100–130 km/h, liftado' },
  { name: 'globo desde el fondo', kind: 'lob', from: { x: 0, y: 0.8, z: 8.8 }, tx: 0, tz: -8.6, clear: 2.8, power: 0.45, ref: 'pico 5–7 m, bota a 1–2 m del fondo' },
  { name: 'globo alto defensivo', kind: 'lob', from: { x: 0, y: 0.8, z: 9 }, tx: 0, tz: -8.6, clear: 3.6, power: 0.45, ref: 'pico 6–8 m' },
  { name: 'chiquita desde el fondo', kind: 'dink', from: { x: 0, y: 0.6, z: 8.5 }, tx: -1, tz: -3, clear: 0.2, power: 0.35, ref: '30–50 km/h, bota baja junto a la red' },
  { name: 'bajada (vs pareja atrás)', kind: 'bajada', from: { x: 1.5, y: 1.7, z: 8.5 }, tx: -3, tz: -6.8, clear: 0.35, pace: 0.95, power: 0.68, ref: '80–110 km/h' },
];

console.log('== Golpes tipo (contacto limpio, sin azar) ==');
console.log('golpe | salida km/h | ref. real (aprox.) | pico m | sobre la cinta m | bota a (m red) | t vuelo s | pico tras bote m | paredes (sup@altura m, km/h) | tras el fondo: altura a 1,5 m del cristal / sale hasta (m del cristal)');
for (const s of shots) {
  const sg = launch(s.kind, s.from, s.tx, s.tz, s.clear, s.pace, s.power, s.special ?? null);
  const t = trace(sg);
  const walls = t.wall.map((w) => `${w.axis === 'z' ? 'F' : 'L'}:${w.surf}@${f2(w.y)} ${kmh(w.v)}`).join(' → ') || '—';
  console.log(`${s.name} | ${kmh(t.v0)} | ${s.ref} | ${f2(t.apex)} | ${f2(t.netClear)} | ${f2(t.bounceZ)} | ${f2(t.tBounce)} | ${f2(t.apex2)} | ${walls}${t.exit ? ' → FUERA' : ''} | ${t.y15 === null ? '—' : f2(t.y15)} / ${t.out2 === null ? '—' : f2(t.out2)} (${t.vOut === null ? '—' : kmh(t.vOut)} km/h)`);
}

// --- the FIP drop test and the floor bounce
{
  const s = seg(0, { x: 0, y: 2.54, z: 0.5 }, { x: 0, y: 0, z: 0 }, 0);
  const ev = nextEvent(s)!;
  const b = bounce(s, ev.t);
  let top = 0;
  for (let t = b.t0; t < b.t0 + 2; t += 0.001) top = Math.max(top, posAt(b, t).y);
  console.log(`\n== Bote FIP: soltada desde 2,54 m vuelve a ${f2(top + R)} m (regla FIP 1,35–1,45 m; BOUNCE_Y ${BOUNCE_Y}) ==`);
}

// --- the back glass in isolation: a ball at h m/s horizontal, 1.2 m high, 1 m before the glass, by spin
console.log('\n== Cristal de fondo aislado (bola a 1,2 m de altura, llega horizontal) ==');
console.log('km/h llegada | efecto | sale km/h (horiz.) | e efectiva | altura al volver 1,5 m | bota a (m del cristal)');
for (const vh of [8, 14, 20, 26]) {
  for (const sp of [-0.6, 0, 0.6]) {
    const s = seg(0, { x: 0, y: 1.2, z: -(HL - 1.0) }, { x: 0, y: 0, z: -vh }, sp);
    const t = trace(s, true);
    const w = t.wall[0];
    console.log(`${kmh(vh)} | ${sp} | ${t.vOut === null ? '—' : kmh(t.vOut)} | ${w ? f2((t.vOut ?? 0) / Math.max(1e-6, (w.v))) : '—'} | ${t.y15 === null ? '—' : f2(t.y15)} | ${t.out2 === null ? '—' : f2(t.out2)}`);
  }
}

// --- the mesh in isolation
console.log('\n== Malla lateral (bola a 1,0 m, 3 m de la red, 45° contra la malla) ==');
for (const v of [8, 14, 20]) {
  const s = seg(0, { x: 4.0, y: 1.0, z: -2.0 }, { x: v * 0.707, y: 0, z: -v * 0.707 }, 0);
  const ev = nextEvent(s)!;
  if (ev.kind !== 'wall') continue;
  const p = posAt(s, ev.t);
  const vin = velAt(s, ev.t);
  const out = wallBounce(s, ev.hit, sideSurface(Math.abs(p.z), p.y) === 'mesh' ? 'mesh' : 'glass');
  const vo = velAt(out, out.t0);
  console.log(`llega ${kmh(Math.hypot(vin.x, vin.y, vin.z))} km/h (normal ${f2(Math.abs(vin.x))} m/s) → sale ${kmh(Math.hypot(vo.x, vo.y, vo.z))} km/h (normal ${f2(Math.abs(vo.x))} m/s, a lo largo ${f2(Math.abs(vo.z))} m/s, vertical ${f2(vo.y)})`);
}

// --- drag: the linear stand-in vs the quadratic law over a long flight
{
  const C = 0.02;
  console.log('\n== Deriva lineal (por tramo) frente a cuadrática real: distancia horizontal recorrida ==');
  for (const v0 of [10, 20, 30, 40]) {
    const s = seg(0, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: v0 }, 0);
    // quadratic, Euler fine steps, horizontal only, no gravity effects on drag (flat shot for 0.8 s or until 20 m)
    let x = 0;
    let v = v0;
    const T = Math.min(0.8, 18 / v0);
    for (let t = 0; t < T; t += 1e-4) {
      v -= C * v * v * 1e-4;
      x += v * 1e-4;
    }
    const lin = posAt(s, T).z;
    const vl = velAt(s, T).z;
    console.log(`v0 ${kmh(v0)} km/h, ${T.toFixed(2)} s: lineal ${f2(lin)} m (v ${kmh(vl)} km/h) · cuadrática ${f2(x)} m (v ${kmh(v)} km/h)`);
  }
}
console.log(`\n(g = ${G}; velocidad máxima media en vuelo LAUNCH.vmax = ${LAUNCH.vmax} m/s)`);
