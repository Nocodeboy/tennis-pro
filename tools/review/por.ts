// The remates por 3 / por 4 measured in the real match: a player at the net hits one (brain.ts, specialShot, with the
// contact quality, power and contact height given) and the real defenders (Agustín and Arturo, both back, as after a
// short lob) play it out. Success: the point ends «exit» (por 3) or «back» (por 4), or as a winner nobody got to.
// Returned: they play it (and how: the share that comes back as a sitter for the smasher's side, a ball they hit from
// above 1.3 m or that the smasher's side then puts away).
// Also the power model on plain shots: flight time and landing scatter of a drive and a volley by power.
// npx tsx tools/review/por.ts [trials per cell = 120]
import { AIController, PAIRS, PARTNER, POR, specialShot } from '../../src/sim/brain';
import { LAUNCH, Match } from '../../src/sim/match';
import type { Plan, ShotSpec, Special } from '../../src/sim/types';

const N = Number(process.argv[2] ?? 120);
// POR='{"extra4":1.2}', LAUNCH='{"vmax":34}': other values
if (process.env.POR) Object.assign(POR, JSON.parse(process.env.POR));
if (process.env.LAUNCH) Object.assign(LAUNCH, JSON.parse(process.env.LAUNCH));
const ONLY = process.env.ONLY;

function trial(sp: Special | null, q: number, power: number, by: number, fz: number, seed: number, perfect = false) {
  const pair = PAIRS[3];
  const sk = [PARTNER, PARTNER, pair.a, pair.b];
  const m = new Match(sk.map((r, i) => ({ team: (i < 2 ? 0 : 1) as 0 | 1, human: false, speed: r.skill.speed, reaction: r.skill.reaction, look: r.look })), { games: 3, golden: true }, seed);
  m.setControllers(sk.map((r) => new AIController(r.skill)));
  m.start();
  // play until a rally is under way (the rules of a rally, not of a serve), then set the scene
  for (let i = 0; i < 60 * 60 && !(m.phase === 'rally' && m.rally && m.rally.shots >= 2); i++) m.update(1 / 60);
  if (m.phase !== 'rally') return { res: 'none', speed: 0, reply: null };
  m.events.length = 0;
  for (const p of m.players) p.plan = null;
  // the smasher at the net (near side), his partner beside him; the defenders back, as after a short lob
  const [a, b, c, d] = m.players;
  const x0 = (m.rng.next() - 0.5) * 3;
  Object.assign(a, { x: x0, z: fz + 0.35, vx: 0, vz: 0, depth: 2 });
  Object.assign(b, { x: x0 > 0 ? x0 - 2.6 : x0 + 2.6, z: 3.2, vx: 0, vz: 0, depth: 2 });
  Object.assign(c, { x: 2.3, z: -8.6, vx: 0, vz: 0, depth: 0, homeZ: -8.8 });
  Object.assign(d, { x: -2.3, z: -8.6, vx: 0, vz: 0, depth: 0, homeZ: -8.8 });
  const mm = m as unknown as { launch(p: unknown, from: unknown, spec: ShotSpec, volley: boolean): void };
  const plan: Plan = { t: m.t, bx: x0 + 0.5, by, bz: fz, fx: x0, fz: fz + 0.35, volley: true, overhead: true, hand: 1, reach: true, oops: false };
  a.lastHit = { t: m.t, kind: 'smash', hand: 1, overhead: true, timing: 'good' };
  const base = sp
    ? specialShot(m, a, plan, sp, null, power)
    : { kind: 'smash' as const, tx: (m.rng.next() - 0.5) * 4, tz: -(4 + m.rng.next() * 2), clear: 0.08, pace: 0.72, power, intent: 'attack' as const };
  const spec: ShotSpec = { ...base, q, timing: perfect ? 'perfect' : 'good', late: 0 };
  if (perfect) spec.pace = (spec.pace ?? 1) * 0.9;
  mm.launch(a, { x: plan.bx, y: by, z: fz }, spec, true);
  const speed = (m.events.find((e) => e.type === 'hit') as { speed: number } | undefined)?.speed ?? 0;
  m.events.length = 0;
  let hits = 0;
  let reply: { y: number; q: number } | null = null;
  for (let i = 0; i < 60 * 12 && m.phase === 'rally'; i++) {
    m.update(1 / 60);
    for (const e of m.events) {
      if (e.type === 'hit') {
        hits++;
        if (hits === 1) reply = { y: e.y, q: e.q };
      }
      if (e.type === 'point') return { res: e.winner === 0 ? (hits <= 1 && hits === 0 ? e.reason : hits === 1 ? `forced-${e.reason}` : 'later-win') : hits === 0 ? `fail-${e.reason}` : 'later-loss', speed, reply };
    }
    m.events.length = 0;
    if (hits >= 2) return { res: 'returned', speed, reply };
  }
  return { res: hits ? 'returned' : 'none', speed, reply };
}

function cell(sp: Special | null, q: number, power: number, by: number, fz: number, perfect = false) {
  const cnt: Record<string, number> = {};
  let sitter = 0;
  let spd = 0;
  for (let i = 0; i < N; i++) {
    const o = trial(sp, q, power, by, fz, 7000 + i * 31, perfect);
    spd += o.speed;
    const k = o.res === 'exit' || o.res === 'back' || o.res === 'winner' || o.res === 'miss' ? 'ok' : o.res.startsWith('forced') ? 'forced' : o.res.startsWith('fail') ? 'error' : 'returned';
    cnt[k] = (cnt[k] ?? 0) + 1;
    if (k === 'ok') cnt[o.res] = (cnt[o.res] ?? 0) + 1;
    if (k === 'returned' && o.reply && (o.reply.y > 1.3 || o.reply.q < 0.5)) sitter++;
  }
  const pc = (k: string) => `${Math.round(((cnt[k] ?? 0) / N) * 100)}`.padStart(3);
  return `éxito ${pc('ok')}% (fuera ${pc('exit')}, vuelve ${pc('back')}, nadie ${pc('winner')}, no llega ${pc('miss')})  fuerza ${pc('forced')}%  error ${pc('error')}%  devuelta ${pc('returned')}% (alta o mala ${Math.round((sitter / N) * 100)}%)  ${(spd / N).toFixed(0)} m/s`;
}

for (const sp of (ONLY ? [ONLY] : ['por3', 'por4']) as Special[]) {
  console.log(`\n== ${sp} (defensores atrás: Agustín y Arturo; ${N} intentos por casilla)`);
  for (const [q, power, perfect, label] of [
    [0.95, 1, true, 'perfecto, potencia 1  '],
    [0.9, 0.85, false, 'bueno, potencia 0.85  '],
    [0.8, 0.7, false, 'normal, potencia 0.7  '],
    [0.6, 0.6, false, 'flojo, potencia 0.6   '],
  ] as const)
    for (const [by, fz] of [
      [2.7, 2],
      [2.5, 2.5],
      [2.5, 3.5],
      [2.25, 4],
    ])
      console.log(`${label} contacto ${by} m a ${fz} m de la red: ${cell(sp, q, power, by, fz, perfect)}`);
}
console.log('\n== remate normal (comparación)');
for (const [by, fz] of [
  [2.5, 2.5],
  [2.5, 3.5],
])
  console.log(`potencia 0.8, q 0.85, contacto ${by} m a ${fz} m: ${cell(null, 0.85, 0.8, by, fz)}`);

// The power model on plain shots: a drive from the back (q 0.8) and a volley at the net (q 0.85), by power: the pace
// off the paddle, the spread of the bounce around the target, and how many go into the net or long (into the glass).
console.log('\n== potencia en golpes normales (q 0.8 drive desde el fondo, q 0.85 volea en la red)');
for (const [kind, fz, by, tz, clear, q] of [
  ['drive', 8.5, 0.9, 7.5, 0.35, 0.8],
  ['speedup', 3, 1.1, 6, 0.3, 0.85],
] as const)
  for (const power of [0.3, 0.5, 0.75, 1]) {
    let spd = 0;
    let net = 0;
    let long = 0;
    let sd = 0;
    for (let i = 0; i < N; i++) {
      const m = new Match([PARTNER, PARTNER, PAIRS[0].a, PAIRS[0].b].map((r, k) => ({ team: (k < 2 ? 0 : 1) as 0 | 1, human: false, speed: 4, reaction: 0.3, look: 0 })), { games: 3, golden: true }, 300 + i);
      m.setControllers([PARTNER, PARTNER, PAIRS[0].a, PAIRS[0].b].map((r) => new AIController(r.skill)));
      m.start();
      for (let j = 0; j < 60 * 60 && !(m.phase === 'rally' && m.rally && m.rally.shots >= 2); j++) m.update(1 / 60);
      const a = m.players[0];
      a.lastHit = { t: m.t, kind, hand: 1, overhead: false, timing: 'good' };
      m.events.length = 0;
      (m as unknown as { launch(p: unknown, from: unknown, spec: ShotSpec, volley: boolean): void }).launch(a, { x: 0, y: by, z: fz }, { kind, tx: 0, tz: -tz, clear, q, timing: 'good', late: 0, power }, kind === 'speedup');
      spd += (m.events.find((e) => e.type === 'hit') as { speed: number }).speed;
      m.events.length = 0;
      for (let j = 0; j < 60 * 3 && m.phase === 'rally'; j++) {
        m.update(1 / 60);
        const b = m.events.find((e) => e.type === 'bounce' || e.type === 'net' || e.type === 'wall' || e.type === 'hit');
        if (b) {
          if (b.type === 'net' && !b.tape) net++;
          else if (b.type === 'wall') long++;
          else if (b.type === 'bounce') sd += (b.z + tz) ** 2 + b.x ** 2;
          break;
        }
        m.events.length = 0;
      }
    }
    console.log(`${kind.padEnd(8)} potencia ${power}: ${(spd / N).toFixed(1)} m/s, dispersión ${Math.sqrt(sd / Math.max(1, N - net - long)).toFixed(2)} m, a la red ${Math.round((net / N) * 100)}%, larga al cristal ${Math.round((long / N) * 100)}%`);
  }
