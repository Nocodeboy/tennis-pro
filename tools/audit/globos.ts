// Auditoría 04 · el globo, golpe de transición: sobre una pareja en la red, ¿la obliga a bajar? CPU contra CPU (las dos
// parejas fuertes y las dos flojas) y, con MODE=bot, el humano simulado (LEVEL, por defecto medio) y Martín.
// Para cada globo sobre una pareja con los dos en la red (al golpear): cómo se contesta (de aire cerca de la red, de
// aire desde el fondo «a la carrera», tras el bote, o nada: el punto acaba), si la pareja que globea está en la red
// cuando le vuelve la bola, y quién gana el punto en los tres golpes siguientes. Separado por calidad (q ≥ 0,85: bueno).
// npx tsx tools/audit/globos.ts [partidos por cruce = 20]
const g = globalThis as unknown as { window?: unknown };
g.window ??= { addEventListener() {} };
import { AIController, HUMAN_REACTION, HUMAN_SPEED, LOB, PAIRS, PARTNER, type Rival } from '../../src/sim/brain';
import { BACK, Match, OVERHEAD } from '../../src/sim/match';
import { posAt, type Seg } from '../../src/sim/ball';
import { AT_NET, R, SERVICE } from '../../src/sim/court';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

const N = Number(process.argv[2] ?? 20);
// LOB='{"behind":1.5}' OVERHEAD='{"keepTo":6.8}' BACK='{"k":0.8}': other values (brain.ts, match.ts)
if (process.env.LOB) Object.assign(LOB, JSON.parse(process.env.LOB));
if (process.env.OVERHEAD) Object.assign(OVERHEAD, JSON.parse(process.env.OVERHEAD));
if (process.env.BACK) Object.assign(BACK, JSON.parse(process.env.BACK));
const MODE = process.env.MODE ?? 'cpu';
const pc = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : '–');
const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
const net = (m: Match, team: number) => m.team(team as 0 | 1).every((p) => Math.abs(p.z) < AT_NET);

type Row = { n: number; netAir: number; deepAir: number; bounce: number; none: number; won3: number; lost3: number; upAtReply: number; apex: number[]; land: number[] };
const row = (): Row => ({ n: 0, netAir: 0, deepAir: 0, bounce: 0, none: 0, won3: 0, lost3: 0, upAtReply: 0, apex: [], land: [] });
const good = row();
const poor = row();
let shots = 0;
let lobs = 0;
let points = 0;
const replies: Record<string, number> = {};

function play(m: Match, bot: ThumbBot | null) {
  m.start();
  // the open lob: its row, team, shot number, and what we know so far
  let cur: { r: Row; team: number; shot: number; replied: boolean } | null = null;
  let guard = 0;
  while (m.phase !== 'over' && guard++ < 60 * 60 * 60) {
    if (bot) bot.tick(m);
    m.update(1 / 60);
    if (bot) bot.events(m.events);
    for (const e of m.events) {
      if (e.type === 'hit') {
        shots++;
        const p = m.players[e.pid];
        if (cur && e.shot === cur.shot + 1) {
          // the reply to the lob
          cur.replied = true;
          const deep = Math.abs(e.z) > SERVICE - 0.3;
          if (!e.volley) cur.r.bounce++;
          else if (deep) cur.r.deepAir++;
          else cur.r.netAir++;
          replies[`${e.volley ? (deep ? 'de aire desde el fondo' : 'de aire') : 'tras bote'} · ${e.kind}`] = (replies[`${e.volley ? (deep ? 'de aire desde el fondo' : 'de aire') : 'tras bote'} · ${e.kind}`] ?? 0) + 1;
          // the lobbing pair: at the net when this reply comes back to them?
          if (net(m, cur.team)) cur.r.upAtReply++;
        }
        if (e.kind === 'lob') {
          lobs++;
          if (e.shot > 2 && net(m, p.team === 0 ? 1 : 0)) {
            const r = e.q >= 0.85 ? good : poor;
            r.n++;
            cur = { r, team: p.team, shot: e.shot, replied: false };
            const s: Seg = m.rally!.seg;
            let apex = 0;
            let land = NaN;
            for (let t = s.t0; t < s.t0 + 5; t += 0.01) {
              const q = posAt(s, t);
              apex = Math.max(apex, q.y);
              if (q.y < R + 0.001) {
                land = Math.abs(q.z);
                break;
              }
            }
            r.apex.push(apex);
            if (Number.isFinite(land)) r.land.push(land);
          } else if (!cur || e.shot > cur.shot + 3) cur = null;
        }
      }
      if (e.type === 'point') {
        points++;
        if (cur) {
          if (!cur.replied) cur.r.none++;
          if (e.rally <= cur.shot + 3) {
            if (e.winner === cur.team) cur.r.won3++;
            else cur.r.lost3++;
          }
        }
        cur = null;
      }
    }
    m.events.length = 0;
  }
}

const mk = (t0: Rival[], t1: Rival[], seed: number, human = false) => {
  const cfg = [...t0, ...t1].map((r, i) => ({ team: (i < 2 ? 0 : 1) as 0 | 1, human: human && i === 0, speed: human && i === 0 ? HUMAN_SPEED : r.skill.speed, reaction: human && i === 0 ? HUMAN_REACTION : r.skill.reaction, look: r.look }));
  return new Match(cfg, { games: 3, golden: true }, seed);
};
if (MODE === 'cpu') {
  for (const [a, b] of [
    [2, 3],
    [0, 1],
  ]) {
    for (let i = 0; i < N; i++) {
      const sk = [PAIRS[a].a, PAIRS[a].b, PAIRS[b].a, PAIRS[b].b];
      const m = mk([sk[0], sk[1]], [sk[2], sk[3]], 4100 + i * 31 + a * 1000);
      m.setControllers(sk.map((r) => new AIController(r.skill)));
      play(m, null);
    }
  }
} else {
  for (const pi of [0, 1, 2, 3]) {
    for (let i = 0; i < N; i++) {
      const seed = 2000 + i * 7919;
      const bot = new ThumbBot(HUMANS[process.env.LEVEL ?? 'medio'], 1, seed + 17);
      const m = mk([PARTNER, PARTNER], [PAIRS[pi].a, PAIRS[pi].b], seed, true);
      m.setControllers([bot.ctl, new AIController(PARTNER.skill), new AIController(PAIRS[pi].a.skill), new AIController(PAIRS[pi].b.skill)]);
      bot.attach(m);
      play(m, bot);
    }
  }
}
console.log(`modo ${MODE} · ${points} puntos · globos ${pc(lobs, shots)} de los golpes (${lobs})`);
console.log('globo sobre pareja en la red | n | de aire en la red | de aire desde el fondo | tras bote | sin respuesta (punto) | baja (fondo + bote) | la pareja que globea está arriba a la vuelta | gana en 3 | pierde en 3 | pico | bota a (m)');
for (const [k, r] of [
  ['bueno (q ≥ 0,85)', good],
  ['flojo (q < 0,85)', poor],
] as [string, Row][])
  console.log(`${k} | ${r.n} | ${pc(r.netAir, r.n)} | ${pc(r.deepAir, r.n)} | ${pc(r.bounce, r.n)} | ${pc(r.none, r.n)} | ${pc(r.deepAir + r.bounce, r.n)} | ${pc(r.upAtReply, r.n - r.none)} | ${pc(r.won3, r.n)} | ${pc(r.lost3, r.n)} | ${med(r.apex).toFixed(2)} | ${med(r.land).toFixed(2)}`);
const tot = good.n + poor.n;
console.log(
  `respuestas: ${Object.entries(replies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => `${k} ${pc(v, tot)}`)
    .join(' · ')}`,
);
