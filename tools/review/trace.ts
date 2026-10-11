// Diagnostic: shot-by-shot traces of the bot (tools/thumb.ts) against a rival, and a summary of the shot kinds.
// npx tsx tools/review/trace.ts [level=medio] [rival=4] [matches=2] [assist=1] [minRally=25]
import { AIController, HUMAN_REACTION, HUMAN_SPEED, RIVALS } from '../../src/sim/brain';
import { Match } from '../../src/sim/match';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

const lvl = process.argv[2] ?? 'medio';
const ri = Number(process.argv[3] ?? 4);
const N = Number(process.argv[4] ?? 2);
const assist = Number(process.argv[5] ?? 1);
const minRally = Number(process.argv[6] ?? 25);
const rv = RIVALS[ri];
const kinds: Record<string, number> = {};
const errs: Record<string, number> = {};
const misses: Record<string, number> = {};
let printed = 0;
for (let i = 0; i < N; i++) {
  const seed = 1000 + i * 7919;
  // level "ai2": the CPU rival 2 plays the near side instead of the bot
  const ai = lvl.startsWith('ai') ? RIVALS[Number(lvl.slice(2))] : null;
  const bot = new ThumbBot(HUMANS[ai ? 'medio' : lvl], assist, seed + 17);
  const m = new Match(
    [
      ai ? { team: 0, human: false, speed: ai.skill.speed, reaction: ai.skill.reaction, look: 1 } : { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
      { team: 1, human: false, speed: rv.skill.speed, reaction: rv.skill.reaction, look: rv.look },
    ],
    { scoring: 'rally', to: 11 },
    seed,
  );
  m.setControllers([ai ? new AIController(ai.skill) : bot.ctl, new AIController(rv.skill)]);
  bot.attach(m);
  m.start();
  let lines: string[] = [];
  let g = 0;
  let seen: { d: number; tl: number; kind: string; v: number } | null = null;
  let seenKey = '';
  while (m.phase !== 'over' && g++ < 60 * 60 * 40) {
    // the first suggested spot of each ball coming to the human: how far it was and how much time there was
    const r = m.rally;
    if (r && r.last && r.last.team === 1 && m.phase === 'rally') {
      const k = `${m.stats.rallies}:${r.shots}`;
      const tg = m.targetFor(0);
      if (k !== seenKey && tg) {
        seenKey = k;
        const me = m.players[0];
        const v = m.ballVel();
        seen = { d: Math.hypot(tg.fx - me.x, tg.fz - me.z), tl: tg.t - m.t, kind: r.last.lastHit?.kind ?? '?', v: v ? Math.hypot(v.x, v.z) : 0 };
      }
    }
    if (!ai) bot.tick(m);
    m.update(1 / 60);
    bot.events(m.events);
    for (const e of m.events) {
      if (e.type === 'hit') {
        const p = m.players[e.pid];
        const k = `${e.pid === 0 ? 'H' : 'A'}:${e.kind}:${e.timing === 'auto' ? 'auto' : e.timing === 'perfect' ? 'perf' : 'aim'}`;
        kinds[k] = (kinds[k] ?? 0) + 1;
        lines.push(`  ${String(e.shot).padStart(2)} ${e.pid === 0 ? 'H' : 'A'} ${e.kind.padEnd(7)} ${e.timing.padEnd(7)} q ${e.q.toFixed(2)} y ${e.y.toFixed(2)} v ${e.speed.toFixed(1)} at z ${p.z.toFixed(1)} x ${p.x.toFixed(1)} | opp z ${m.players[1 - e.pid].z.toFixed(1)}`);
      }
      if (e.type === 'point') {
        if (e.reason === 'miss' && e.winner === 1 && seen) {
          const b = `${seen.kind} d${seen.d < 1 ? '<1' : seen.d < 2 ? '1-2' : seen.d < 3 ? '2-3' : '>3'} t${seen.tl < 0.5 ? '<.5' : seen.tl < 0.8 ? '.5-.8' : '>.8'}`;
          misses[b] = (misses[b] ?? 0) + 1;
        }
        seen = null;
        if (e.fault !== null && (e.reason === 'out' || e.reason === 'net')) {
          const last = lines[lines.length - 1]?.trim().split(/\s+/) ?? [];
          const k = `${e.reason}<-${last[1]}:${last[2]}:${last[3]}`;
          errs[k] = (errs[k] ?? 0) + 1;
        }
        if (e.rally >= minRally && printed < 3) {
          printed++;
          console.log(`rally ${e.rally} → ${e.winner === 0 ? 'humano' : 'IA'} (${e.reason}, falta de ${e.fault})`);
          console.log(lines.join('\n'));
        }
        lines = [];
      }
    }
    m.events.length = 0;
  }
}
console.log(Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('errores (motivo<-quién:tipo:timing):', Object.entries(errs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('no llega (golpe rival, distancia al círculo, tiempo):', Object.entries(misses).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
