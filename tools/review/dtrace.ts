// Diagnostic, doubles: errors by player, shot kind and timing, and the shot kinds played, for the bot (tools/thumb.ts)
// with Marta against one pair. npx tsx tools/review/dtrace.ts [level=medio] [pair=3] [matches=4] [assist=1]
import { AIController, HUMAN_REACTION, HUMAN_SPEED, PAIRS, PARTNER } from '../../src/sim/brain';
import { Match } from '../../src/sim/match';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

const lvl = process.argv[2] ?? 'medio';
const pair = PAIRS[Number(process.argv[3] ?? 3)];
const N = Number(process.argv[4] ?? 4);
const assist = Number(process.argv[5] ?? 1);
const names = ['H', 'M', pair.a.name[0], pair.b.name[0]];
const errs: Record<string, number> = {};
const kinds: Record<string, number> = {};
let pts = 0;
for (let i = 0; i < N; i++) {
  const seed = 2000 + i * 7919;
  const bot = new ThumbBot(HUMANS[lvl], assist, seed + 17);
  const m = new Match(
    [
      { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
      { team: 0, human: false, speed: PARTNER.skill.speed, reaction: PARTNER.skill.reaction, look: PARTNER.look },
      { team: 1, human: false, speed: pair.a.skill.speed, reaction: pair.a.skill.reaction, look: pair.a.look },
      { team: 1, human: false, speed: pair.b.skill.speed, reaction: pair.b.skill.reaction, look: pair.b.look },
    ],
    { scoring: 'rally', to: 11 },
    seed,
  );
  m.setControllers([bot.ctl, new AIController(PARTNER.skill), new AIController(pair.a.skill), new AIController(pair.b.skill)]);
  bot.attach(m);
  m.start();
  let last: { pid: number; kind: string; timing: string; y: number; q: number } | null = null;
  let prev: { kind: string; v: number } | null = null;
  let g = 0;
  while (m.phase !== 'over' && g++ < 60 * 60 * 60) {
    bot.tick(m);
    m.update(1 / 60);
    bot.events(m.events);
    for (const e of m.events) {
      if (e.type === 'hit') {
        if (last) prev = { kind: last.kind, v: 0 };
        last = { pid: e.pid, kind: e.kind, timing: e.timing, y: e.y, q: e.q };
        const k = `${names[e.pid]}:${e.kind}`;
        kinds[k] = (kinds[k] ?? 0) + 1;
      }
      if (e.type === 'point') {
        pts++;
        if (e.fault !== null && last && (e.reason === 'out' || e.reason === 'net')) {
          const k = `${e.reason}<-${names[e.fault]}:${last.kind}:${last.timing}${last.q < 0.5 ? ':q<0.5' : ''} tras ${prev?.kind}`;
          errs[k] = (errs[k] ?? 0) + 1;
        }
        last = prev = null;
      }
    }
    m.events.length = 0;
  }
}
console.log(`${pts} puntos`);
console.log('errores:', Object.entries(errs).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('golpes:', Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
