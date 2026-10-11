// Headless matches: a simulated person on a phone (tools/thumb.ts: the real HumanController and Input with virtual
// thumbs) plays the human's side against every rival. Measures the difficulty ladder, rally length, how the points end
// and checks the rules never get stuck.
// Usage: npx tsx tools/bot.ts [matches per pairing = 40] [assist 0|1|2 = 1] [scoring = rally|sideout]
// Env: RECOVER=1 (the setting "back into place between shots") · LEVELS=novato,medio · RIVALS=0,4 (indices) to run part of the table · TUNE='{"2":{"q":0.78}}' to try other
// skills for some rivals without editing them. FEET='{…}' / HFEET='{…}' try other footwork (CPU / human, src/sim/match.ts).
// SUGGEST, ASSIST, REFLEX, CPU_LUNGE (src/sim/match.ts) and SHANK (src/sim/brain.ts) try other values of the 0.7 changes
// (docs/concepto.md, «Control y simulación 0.7», says which reproduce 0.6). SINGLES='{…}' the CPU's singles game plan
// (src/sim/brain.ts; docs/notas-08-individual.md).

import { AIController, HUMAN_REACTION, HUMAN_SPEED, RIVALS, SHANK, SINGLES } from '../src/sim/brain';
import { ASSIST, CPU_LUNGE, FEET, HUMAN_FEET, Match, REFLEX, SUGGEST } from '../src/sim/match';
import type { PointReason, Scoring } from '../src/sim/types';
import { HUMANS } from './humans';
import { ThumbBot } from './thumb';

if (process.env.FEET) Object.assign(FEET, JSON.parse(process.env.FEET));
if (process.env.HFEET) Object.assign(HUMAN_FEET, JSON.parse(process.env.HFEET));
if (process.env.SUGGEST) Object.assign(SUGGEST, JSON.parse(process.env.SUGGEST));
if (process.env.ASSIST) Object.assign(ASSIST, JSON.parse(process.env.ASSIST));
if (process.env.CPU_LUNGE) Object.assign(CPU_LUNGE, JSON.parse(process.env.CPU_LUNGE));
if (process.env.SHANK) Object.assign(SHANK, JSON.parse(process.env.SHANK));
if (process.env.REFLEX) Object.assign(REFLEX, JSON.parse(process.env.REFLEX));
if (process.env.TUNE) for (const [i, s] of Object.entries(JSON.parse(process.env.TUNE))) Object.assign(RIVALS[Number(i)].skill, s);
if (process.env.SINGLES) Object.assign(SINGLES, JSON.parse(process.env.SINGLES));

const N = Number(process.argv[2] ?? 40);
const assist = Number(process.argv[3] ?? 1);
const scoring = (process.argv[4] ?? 'rally') as Scoring;
const levels = process.env.LEVELS?.split(',');
const rivals = process.env.RIVALS?.split(',').map(Number);

const pc = (a: number, b: number) => `${b ? ((a / b) * 100).toFixed(0) : '–'}%`;
const rows: string[][] = [['humano', 'rival', 'gana', 'puntos', 'golpes/punto', 'min', 'apunta', 'perfectos', 'pierde por', 'gana por']];
let stuck = 0;
for (const [hn, h] of Object.entries(HUMANS)) {
  if (levels && !levels.includes(hn)) continue;
  RIVALS.forEach((rv, ri) => {
    if (rivals && !rivals.includes(ri)) return;
    let wins = 0;
    let pts = 0;
    let ptsWon = 0;
    let shots = 0;
    let dur = 0;
    let perfect = 0;
    let hits = 0;
    let aimed = 0;
    const won: Partial<Record<PointReason, number>> = {};
    const lost: Partial<Record<string, number>> = {};
    for (let i = 0; i < N; i++) {
      const seed = 1000 + i * 7919;
      const bot = new ThumbBot(h, assist, seed + 17);
      if (process.env.RECOVER) bot.ctl.recover = true;
      const m = new Match(
        [
          { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
          { team: 1, human: false, speed: rv.skill.speed, reaction: rv.skill.reaction, look: rv.look },
        ],
        { scoring, to: 11 },
        seed,
      );
      m.setControllers([bot.ctl, new AIController(rv.skill)]);
      bot.attach(m);
      m.start();
      let guard = 0;
      while (m.phase !== 'over' && guard++ < 60 * 60 * 40) {
        bot.tick(m);
        m.update(1 / 60);
        bot.events(m.events);
        for (const e of m.events) {
          if (e.type === 'hit' && e.pid === 0 && e.kind !== 'serve') {
            hits++;
            if (e.timing === 'perfect') perfect++;
            if (e.timing !== 'auto') aimed++;
          }
          if (e.type === 'point') {
            pts++;
            shots += e.rally;
            if (e.winner === 0) {
              ptsWon++;
              won[e.reason] = (won[e.reason] ?? 0) + 1;
            } else {
              // from the human's side: his own errors, or the rival's winners (reached / not reached)
              const k = e.fault === 0 ? `error-${e.reason}` : e.reason;
              lost[k] = (lost[k] ?? 0) + 1;
            }
          }
        }
        m.events.length = 0;
      }
      if (m.phase !== 'over') stuck++;
      if (m.winner === 0) wins++;
      dur += m.t;
    }
    const top = (o: Record<string, number | undefined>) =>
      Object.entries(o)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 4)
        .map(([k, v]) => `${k} ${(((v ?? 0) / pts) * 100).toFixed(0)}`)
        .join(' · ');
    rows.push([hn, rv.name, pc(wins, N), pc(ptsWon, pts), (shots / pts).toFixed(1), (dur / N / 60).toFixed(1), pc(aimed, hits), pc(perfect, hits), top(lost), top(won)]);
  });
}
const w = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
for (const r of rows) console.log(r.map((v, c) => v.padEnd(w[c])).join('  '));
console.log(`\nasistencia ${assist} · ${N} partidos por pareja · ${stuck ? `${stuck} partidos atascados` : 'ningún partido atascado'}`);
