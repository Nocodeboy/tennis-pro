// ¿Cómo y desde dónde fallan los golpes? Para cada golpe: tipo, altura de contacto, q, y si acabó en la red/fuera.
// Se juega con la IA en los dos lados (Reina contra Reina, y Bruno contra Nuria) y con el humano automático.
// npx tsx errors.ts
import { AIController, RIVALS } from '../../src/sim/brain';
import { Match } from '../../src/sim/match';
import { netHeight, R } from '../../src/sim/court';
import { posAt } from '../../src/sim/ball';

function run(a: number, b: number, N: number) {
  const byKind: Record<string, { n: number; net: number; out: number; qs: number }> = {};
  const byHeight: Record<string, { n: number; net: number }> = {};
  let pts = 0;
  let shots = 0;
  const reasons: Record<string, number> = {};
  const lowNetPerfect = { n: 0 };
  const driveClear: number[] = [];
  for (let i = 0; i < N; i++) {
    const ra = RIVALS[a];
    const rb = RIVALS[b];
    const m = new Match(
      [
        { team: 0, human: false, speed: ra.skill.speed, reaction: ra.skill.reaction, look: 1 },
        { team: 1, human: false, speed: rb.skill.speed, reaction: rb.skill.reaction, look: 2 },
      ],
      { scoring: 'rally', to: 11 },
      400 + i * 97,
    );
    m.setControllers([new AIController(ra.skill), new AIController(rb.skill)]);
    m.start();
    let last: { kind: string; by: number; q: number; timing: string } | null = null;
    let g = 0;
    while (m.phase !== 'over' && g++ < 120 * 60 * 40) {
      m.step(1 / 120);
      for (const e of m.events) {
        if (e.type === 'hit') {
          last = { kind: e.kind, by: e.y, q: e.q, timing: e.timing };
          const k = (byKind[e.kind] ??= { n: 0, net: 0, out: 0, qs: 0 });
          k.n++;
          k.qs += e.q;
          const hb = e.y < 0.35 ? '<0.35' : e.y < 0.6 ? '0.35-0.6' : e.y < 0.86 ? '0.6-0.86' : e.y < 1.2 ? '0.86-1.2' : '>1.2';
          (byHeight[hb] ??= { n: 0, net: 0 }).n++;
          if (e.kind === 'drive' && m.rally) {
            const s = m.rally.seg;
            if (m.rally.tNet !== null) {
              const p = posAt(s, m.rally.tNet);
              driveClear.push(p.y - R - netHeight(p.x));
            }
          }
          shots++;
        }
        if (e.type === 'point') {
          pts++;
          reasons[e.reason] = (reasons[e.reason] ?? 0) + 1;
          if (last && (e.reason === 'net' || e.reason === 'out')) {
            const k = byKind[last.kind];
            if (e.reason === 'net') k.net++;
            else k.out++;
            if (e.reason === 'net') {
              const hb = last.by < 0.35 ? '<0.35' : last.by < 0.6 ? '0.35-0.6' : last.by < 0.86 ? '0.6-0.86' : last.by < 1.2 ? '0.86-1.2' : '>1.2';
              byHeight[hb].net++;
              if (last.by > 0.86 && last.timing === 'perfect') lowNetPerfect.n++;
            }
          }
        }
      }
      m.events.length = 0;
    }
  }
  console.log(`\n${RIVALS[a].name} contra ${RIVALS[b].name} (${N} partidos, ${pts} puntos, ${(shots / pts).toFixed(1)} golpes/punto)`);
  console.log('  cómo acaban los puntos:', JSON.stringify(reasons));
  for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(8)} n=${String(v.n).padStart(5)} q medio ${(v.qs / v.n).toFixed(2)} · a la red ${((100 * v.net) / v.n).toFixed(1)} % · fuera ${((100 * v.out) / v.n).toFixed(1)} %`);
  for (const [k, v] of Object.entries(byHeight)) console.log(`  contacto ${k.padEnd(9)} n=${String(v.n).padStart(5)} · a la red ${((100 * v.net) / v.n).toFixed(1)} %`);
  console.log(`  bolas por encima de la red (by>0.86) metidas en la red con timing "perfect": ${lowNetPerfect.n}`);
  driveClear.sort((x, y) => x - y);
  const q = (f: number) => driveClear[Math.floor(f * (driveClear.length - 1))].toFixed(2);
  console.log(`  drives: altura sobre la cinta p10 ${q(0.1)} · mediana ${q(0.5)} · p90 ${q(0.9)} m (n=${driveClear.length})`);
}
run(4, 4, 30);
run(2, 3, 30);
run(0, 1, 30);
