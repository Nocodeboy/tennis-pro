// Long rallies and the automatic shot (docs/concepto.md, «Control y simulación 0.6»): the thumb bot against one rival,
// how long the points are and how much of them is the human's automatic reset feeding a dink exchange.
//  · shots per point: mean, p90 and the longest; share of points of 25 shots or more;
//  · the human's shots: share automatic, and of those how many were dinks or drops;
//  · runs: the longest run of automatic soft shots in a row by the human within a point;
//  · how the long points (≥ 20 shots) end.
// npx tsx tools/review/rallies.ts [level=novato] [rival=1] [matches=24] [assist=1]
// Env: AUTO='{"reflex":0.2}' tries other values of the automatic reset (src/human.ts, AUTO) and PUNISH='{"from":4}'
// of the CPU reading it (src/sim/brain.ts, AUTO_PUNISH); SUGGEST, ASSIST, REFLEX, CPU_LUNGE, SHANK as tools/bot.ts.
// Also: how many of the CPU's smashes and speed-ups the human gets back, how soon, at what stretch, and what follows.
import { AIController, AUTO_PUNISH, HUMAN_REACTION, HUMAN_SPEED, RIVALS, SHANK } from '../../src/sim/brain';
import { ASSIST, CPU_LUNGE, Match, REFLEX, SUGGEST } from '../../src/sim/match';
import { AUTO } from '../../src/human';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

if (process.env.AUTO) Object.assign(AUTO, JSON.parse(process.env.AUTO));
if (process.env.SUGGEST) Object.assign(SUGGEST, JSON.parse(process.env.SUGGEST));
if (process.env.ASSIST) Object.assign(ASSIST, JSON.parse(process.env.ASSIST));
if (process.env.CPU_LUNGE) Object.assign(CPU_LUNGE, JSON.parse(process.env.CPU_LUNGE));
if (process.env.SHANK) Object.assign(SHANK, JSON.parse(process.env.SHANK));
if (process.env.REFLEX) Object.assign(REFLEX, JSON.parse(process.env.REFLEX));
if (process.env.PUNISH) Object.assign(AUTO_PUNISH, JSON.parse(process.env.PUNISH));
const lvl = process.argv[2] ?? 'novato';
const ri = Number(process.argv[3] ?? 1);
const N = Number(process.argv[4] ?? 24);
const assist = Number(process.argv[5] ?? 1);
const rv = RIVALS[ri];
const lens: number[] = [];
let hits = 0;
let autos = 0;
let autoSoft = 0;
let longRun = 0;
const runs: number[] = [];
const longEnd: Record<string, number> = {};
// the CPU's attacks at the human (smash, speed-up) and how many he got back
const atk: Record<string, { n: number; back: number }> = { smash: { n: 0, back: 0 }, speedup: { n: 0, back: 0 } };
// the returns: time from the attack to his contact, how far he reached, automatic or aimed, the quality, and whether
// the CPU won the point within its next two shots
const rets: { kind: string; dt: number; stretch: number; auto: boolean; q: number; lost2: boolean | null }[] = [];
let won = 0;
let wins = 0;
for (let i = 0; i < N; i++) {
  const seed = 1000 + i * 7919;
  const bot = new ThumbBot(HUMANS[lvl], assist, seed + 17);
  const m = new Match(
    [
      { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
      { team: 1, human: false, speed: rv.skill.speed, reaction: rv.skill.reaction, look: rv.look },
    ],
    { scoring: 'rally', to: 11 },
    seed,
  );
  m.setControllers([bot.ctl, new AIController(rv.skill)]);
  bot.attach(m);
  m.start();
  // (the stretch of each of his contacts)
  let lastStretch = 0;
  const hit0 = bot.ctl.hit.bind(bot.ctl);
  bot.ctl.hit = (mm, p, plan) => {
    lastStretch = plan.stretch ?? 0;
    return hit0(mm, p, plan);
  };
  let atkT = 0;
  let open: { r: (typeof rets)[number]; shots: number }[] = [];
  let run = 0;
  let best = 0;
  let pend: string | null = null;
  let g = 0;
  while (m.phase !== 'over' && g++ < 60 * 60 * 40) {
    bot.tick(m);
    m.update(1 / 60);
    bot.events(m.events);
    for (const e of m.events) {
      if (e.type === 'hit') {
        if (pend && e.pid === 0) {
          atk[pend].back++;
          const rr = { kind: pend, dt: m.t - atkT, stretch: lastStretch, auto: e.timing === 'auto', q: e.q, lost2: null as boolean | null };
          rets.push(rr);
          open.push({ r: rr, shots: e.shot });
        }
        pend = e.pid !== 0 && (e.kind === 'smash' || e.kind === 'speedup') ? e.kind : null;
        if (pend) {
          atk[pend].n++;
          atkT = m.t;
        }
        // (two more shots of the CPU after the return without the point ending: it did not win it quickly)
        open = open.filter((o) => {
          if (e.shot - o.shots >= 4) o.r.lost2 = false;
          return o.r.lost2 === null;
        });
      }
      if (e.type === 'point') {
        pend = null;
        for (const o of open) o.r.lost2 = e.winner === 1 && e.rally - o.shots <= 3;
        open = [];
      }
      if (e.type === 'hit' && e.pid === 0 && e.kind !== 'serve') {
        hits++;
        if (e.timing === 'auto') {
          autos++;
          if (e.kind === 'dink' || e.kind === 'drop') {
            autoSoft++;
            best = Math.max(best, ++run);
          } else run = 0;
        } else run = 0;
      }
      if (e.type === 'point') {
        lens.push(e.rally);
        if (e.winner === 0) won++;
        if (e.rally >= 20) {
          const k = `${e.winner === 0 ? 'gana' : 'pierde'} ${e.reason}`;
          longEnd[k] = (longEnd[k] ?? 0) + 1;
        }
        runs.push(best);
        longRun = Math.max(longRun, best);
        run = best = 0;
      }
    }
    m.events.length = 0;
  }
  if (m.winner === 0) wins++;
}
const s = [...lens].sort((a, b) => a - b);
const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
const pc = (a: number, b: number) => `${b ? ((a / b) * 100).toFixed(0) : '–'}%`;
console.log(`${lvl} contra ${rv.name} · ayuda ${assist} · ${N} partidos: gana ${pc(wins, N)} de los partidos y ${pc(won, lens.length)} de los puntos`);
console.log(`  golpes por punto: media ${mean.toFixed(1)} · p90 ${s[Math.floor(0.9 * (s.length - 1))]} · máx ${s[s.length - 1]} · puntos de 25 o más ${pc(lens.filter((v) => v >= 25).length, lens.length)}`);
console.log(`  golpes del humano: automáticos ${pc(autos, hits)} (dejadas automáticas ${pc(autoSoft, hits)}) · racha más larga de dejadas automáticas seguidas ${longRun} · puntos con 3 o más ${pc(runs.filter((v) => v >= 3).length, runs.length)}`);
console.log(`  ataques de la CPU que devuelve: remates ${pc(atk.smash.back, atk.smash.n)} de ${atk.smash.n} · aceleraciones ${pc(atk.speedup.back, atk.speedup.n)} de ${atk.speedup.n}`);
for (const k of ['smash', 'speedup']) {
  const rs = rets.filter((r) => r.kind === k);
  if (!rs.length) continue;
  const qq = (a: number[], f: number) => [...a].sort((x, y) => x - y)[Math.floor(f * (a.length - 1))];
  console.log(
    `    ${k === 'smash' ? 'remates' : 'aceleraciones'} devueltos: tiempo hasta su contacto p10 ${qq(rs.map((r) => r.dt), 0.1).toFixed(2)} · p50 ${qq(rs.map((r) => r.dt), 0.5).toFixed(2)} s · estirada p50 ${qq(rs.map((r) => r.stretch), 0.5).toFixed(2)} p90 ${qq(rs.map((r) => r.stretch), 0.9).toFixed(2)} · automáticos ${pc(rs.filter((r) => r.auto).length, rs.length)} · q p50 ${qq(rs.map((r) => r.q), 0.5).toFixed(2)} · la CPU gana el punto en sus 2 golpes siguientes ${pc(rs.filter((r) => r.lost2).length, rs.length)} · con menos de 0,3 s ${pc(rs.filter((r) => r.dt < 0.3).length, rs.length)}`,
  );
}
console.log(
  `  cómo acaban los puntos de 20 golpes o más: ${Object.entries(longEnd)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ')}`,
);
