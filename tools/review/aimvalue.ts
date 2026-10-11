// Is aiming worth it? The realistic bot (tools/thumb.ts, level "bueno" or the one given) in three variants against each
// rival: never aims (automatic reset only), never aims but attacks the orange balls and blocks (docs/notas-08-ataque.md),
// aims every ball it has time for but never in the golden window, and aims every ball releasing right in the middle of
// the window. % of points won.
// npx tsx tools/review/aimvalue.ts [level=bueno] [points per cell=300] [assist=1] [rivals=0,2,4]
import { AIController, HUMAN_REACTION, HUMAN_SPEED, RIVALS } from '../../src/sim/brain';
import { Match } from '../../src/sim/match';
import { HUMANS } from '../humans';
import { ThumbBot, type Thumbs } from '../thumb';

const lvl = process.argv[2] ?? 'bueno';
const NPTS = Number(process.argv[3] ?? 300);
const assist = Number(process.argv[4] ?? 1);
const which = (process.argv[5] ?? '0,2,4').split(',').map(Number);
const base = HUMANS[lvl];
const variants: Record<string, Thumbs> = {
  // (never aims, never flicks nor taps: the automatic shot only; and the same with the attack and the block of 0.8)
  'sin apuntar': { ...base, aim: 0, flick: 0, rash: 0, block: 0 },
  'sin apuntar, ataca y bloquea': { ...base, aim: 0 },
  'apunta, sin perfecto': { ...base, aim: 1, sigma: 0, bias: -0.3 },
  'apunta, perfecto': { ...base, aim: 1, sigma: 0, bias: 0 },
};
const rows: string[] = [];
for (const ri of which) {
  const rv = RIVALS[ri];
  const cells: string[] = [];
  for (const [name, th] of Object.entries(variants)) {
    let pts = 0;
    let won = 0;
    let shots = 0;
    for (let i = 0; pts < NPTS && i < 200; i++) {
      const seed = 3000 + i * 7919;
      const bot = new ThumbBot(th, assist, seed + 5);
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
      let g = 0;
      while (m.phase !== 'over' && g++ < 60 * 60 * 40 && pts < NPTS) {
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
    }
    cells.push(`${name} ${((100 * won) / pts).toFixed(0)} % (${(shots / pts).toFixed(1)} golpes)`);
  }
  rows.push(`${rv.name.padEnd(6)} ${cells.join(' · ')}`);
}
console.log(`nivel ${lvl}, ayuda ${assist}, ${NPTS} puntos por casilla, % de puntos ganados:`);
for (const r of rows) console.log(r);
