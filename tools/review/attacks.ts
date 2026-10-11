// Diagnostic: CPU against CPU, what happens after each attack (speed-up, smash): does the point end (and who wins),
// and how long rallies are. npx tsx tools/review/attacks.ts [rivalA=4] [rivalB=4] [matches=20]
import { AIController, RIVALS } from '../../src/sim/brain';
import { Match } from '../../src/sim/match';

const a = RIVALS[Number(process.argv[2] ?? 4)];
const b = RIVALS[Number(process.argv[3] ?? 4)];
const N = Number(process.argv[4] ?? 20);
const after: Record<string, { n: number; win1: number; lose1: number; win2: number; lose2: number; on: number }> = {};
const hist: number[] = [];
const replies: Record<string, { n: number; dt: number; q: number; y: number }> = {};
const speeds: number[] = [];
let attacksPerRally = 0;
let rallies = 0;
for (let i = 0; i < N; i++) {
  const m = new Match(
    [
      { team: 0, human: false, speed: a.skill.speed, reaction: a.skill.reaction, look: 1 },
      { team: 1, human: false, speed: b.skill.speed, reaction: b.skill.reaction, look: 2 },
    ],
    { scoring: 'rally', to: 11 },
    400 + i * 97,
  );
  m.setControllers([new AIController(a.skill), new AIController(b.skill)]);
  m.start();
  let shots: { pid: number; kind: string; y: number; q: number; t: number; v: number }[] = [];
  let g = 0;
  while (m.phase !== 'over' && g++ < 120 * 60 * 40) {
    m.step(1 / 120);
    for (const e of m.events) {
      if (e.type === 'hit') {
        const prev = shots[shots.length - 1];
        if (prev && (prev.kind === 'speedup' || prev.kind === 'smash') && prev.y > 1.1) {
          const rk = `${e.kind}`;
          const st = (replies[rk] ??= { n: 0, dt: 0, q: 0, y: 0 });
          st.n++;
          st.dt += m.t - prev.t;
          st.q += e.q;
          st.y += e.y;
          speeds.push(prev.v);
        }
        shots.push({ pid: e.pid, kind: e.kind, y: e.y, q: e.q, t: m.t, v: e.speed });
      }
      if (e.type === 'point') {
        rallies++;
        hist.push(e.rally);
        shots.forEach((s, k) => {
          if (s.kind !== 'speedup' && s.kind !== 'smash' && s.kind !== 'drive') return;
          const key = `${s.kind}${s.y > 1.1 ? '·alta' : '·baja'}`;
          const st = (after[key] ??= { n: 0, win1: 0, lose1: 0, win2: 0, lose2: 0, on: 0 });
          st.n++;
          if (s.kind !== 'drive') attacksPerRally++;
          const left = shots.length - 1 - k; // shots after this one
          const won = e.winner === m.players[s.pid].team;
          if (left === 0) won ? st.win1++ : st.lose1++;
          else if (left <= 2) won ? st.win2++ : st.lose2++;
          else st.on++;
        });
        shots = [];
      }
    }
    m.events.length = 0;
  }
}
hist.sort((x, y) => x - y);
const q = (f: number) => hist[Math.floor(f * (hist.length - 1))];
console.log(`${a.name} contra ${b.name}: ${rallies} puntos, golpes/punto media ${(hist.reduce((s, x) => s + x, 0) / hist.length).toFixed(1)} · p25 ${q(0.25)} mediana ${q(0.5)} p75 ${q(0.75)} p90 ${q(0.9)} · ataques por punto ${(attacksPerRally / rallies).toFixed(1)}`);
for (const [k, v] of Object.entries(after)) {
  const p = (x: number) => `${((100 * x) / v.n).toFixed(0)}%`;
  console.log(`  ${k.padEnd(14)} n=${String(v.n).padStart(5)} · acaba ya: gana ${p(v.win1)} pierde ${p(v.lose1)} · en 2 golpes: gana ${p(v.win2)} pierde ${p(v.lose2)} · sigue ${p(v.on)}`);
}
console.log('  respuestas a un ataque desde arriba (tipo: n, tiempo hasta el contacto, q, altura):');
for (const [k, v] of Object.entries(replies)) console.log(`    ${k.padEnd(8)} n=${v.n} dt ${(v.dt / v.n).toFixed(2)} s · q ${(v.q / v.n).toFixed(2)} · y ${(v.y / v.n).toFixed(2)}`);
speeds.sort((x, y) => x - y);
if (speeds.length) console.log(`  velocidad del ataque: mediana ${speeds[speeds.length >> 1].toFixed(1)} m/s · p90 ${speeds[Math.floor(speeds.length * 0.9)].toFixed(1)}`);
