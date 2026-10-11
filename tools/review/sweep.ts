// Tuning aid: the realistic bot (tools/thumb.ts) against one rival with variants of its skill, in one process.
// npx tsx tools/review/sweep.ts <variants.json> [matches=10] [levels=novato,medio,bueno] [assist=1]
// variants.json: [{ "name": "q+", "rival": 3, "skill": { "q": 0.89 } }, …] ("rival": index into RIVALS)
// Prints, per variant and level: % matches won, % points won, shots per point, minutes.
import { readFileSync } from 'node:fs';
import { AIController, HUMAN_REACTION, HUMAN_SPEED, RIVALS, type Skill } from '../../src/sim/brain';
import { Match } from '../../src/sim/match';
import { HUMANS } from '../humans';
import { ThumbBot, type Thumbs } from '../thumb';

// "human": { "novato": { "react": 0.38 } } overrides the thumbs of a level for that variant
const variants = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { name: string; rival: number; skill: Partial<Skill>; human?: Record<string, Partial<Thumbs>> }[];
const N = Number(process.argv[3] ?? 10);
const levels = (process.argv[4] ?? 'novato,medio,bueno').split(',');
const assist = Number(process.argv[5] ?? 1);

for (const v of variants) {
  const rv = RIVALS[v.rival];
  const skill: Skill = { ...rv.skill, ...v.skill };
  const cells: string[] = [];
  for (const lv of levels) {
    let wins = 0;
    let pts = 0;
    let won = 0;
    let shots = 0;
    let dur = 0;
    for (let i = 0; i < N; i++) {
      const seed = 1000 + i * 7919;
      const bot = new ThumbBot({ ...HUMANS[lv], ...(v.human?.[lv] ?? {}) }, assist, seed + 17);
      const m = new Match(
        [
          { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
          { team: 1, human: false, speed: skill.speed, reaction: skill.reaction, look: rv.look },
        ],
        { scoring: 'rally', to: 11 },
        seed,
      );
      m.setControllers([bot.ctl, new AIController(skill)]);
      bot.attach(m);
      m.start();
      let g = 0;
      while (m.phase !== 'over' && g++ < 60 * 60 * 40) {
        bot.tick(m);
        m.update(1 / 60);
        bot.events(m.events);
        for (const e of m.events)
          if (e.type === 'point') {
            pts++;
            shots += e.rally;
            if (e.winner === 0) won++;
          }
        m.events.length = 0;
      }
      if (m.winner === 0) wins++;
      dur += m.t;
    }
    cells.push(`${lv} ${String(Math.round((100 * wins) / N)).padStart(3)}% (${((100 * won) / pts).toFixed(0)} pts, ${(shots / pts).toFixed(1)} g, ${(dur / N / 60).toFixed(1)} min)`);
  }
  console.log(`${rv.name} ${v.name.padEnd(14)} ${cells.join(' · ')}`);
}
