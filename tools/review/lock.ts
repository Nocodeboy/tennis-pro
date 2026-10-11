// Does the assist fight the thumb? In real points (the medio bot against Bruno), the first time per ball the player is
// on the move to the circle (or parked on it) with time to spare, the thumb is turned θ degrees away from the circle and
// held there 0.35 s: how far do the feet go the way the thumb says, and how far towards the circle?
// npx tsx tools/review/lock.ts [assist=1] [balls=300]
import { AIController, HUMAN_REACTION, HUMAN_SPEED, RIVALS } from '../../src/sim/brain';
import { Match } from '../../src/sim/match';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

const assist = Number(process.argv[2] ?? 1);
const BALLS = Number(process.argv[3] ?? 300);
const ANG = [30, 50, 65, 80, 100];
const rv = RIVALS[2];
for (const state of ['travelling', 'parked'] as const) {
  const row: string[] = [];
  for (const a of ANG) {
    let along = 0;
    let toward = 0;
    let n = 0;
    let locked = 0;
    for (let i = 0; n < BALLS && i < 200; i++) {
      const seed = 4000 + i * 7919;
      const bot = new ThumbBot(HUMANS.medio, assist, seed + 17);
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
      const me = m.players[0];
      let done = '';
      let g = 0;
      while (m.phase !== 'over' && g++ < 60 * 60 * 20 && n < BALLS) {
        const r = m.rally;
        const tg = m.targetFor(0);
        const key = r ? `${m.stats.rallies}:${r.shots}` : '';
        const d = tg ? Math.hypot(tg.fx - me.x, tg.fz - me.z) : 0;
        const lk0 = (m as unknown as { locks: ({ x: number; z: number } | null)[] }).locks[0];
        const ok = tg && r && r.last?.team === 1 && key !== done && !!lk0 && tg.t - m.t > 0.45 && (state === 'parked' ? d < 0.1 && Math.hypot(me.vx, me.vz) < 0.2 : d > 0.8 && d < 3);
        if (ok && tg) {
          done = key;
          // the thumb turned θ away from where the circle is (from the player)
          const lk = (m as unknown as { locks: ({ x: number; z: number } | null)[] }).locks[0];
          if (lk) locked++;
          const base = state === 'parked' && lk ? Math.atan2(lk.z, lk.x) : Math.atan2(tg.fz - me.z, tg.fx - me.x);
          const th = base + ((a * Math.PI) / 180) * (m.rng.chance(0.5) ? 1 : -1);
          const ux = Math.cos(th);
          const uz = Math.sin(th);
          const x0 = me.x;
          const z0 = me.z;
          const d0 = d;
          for (let f = 0; f < 21 && m.phase === 'rally'; f++) {
            bot.input.stickX = ux;
            bot.input.stickY = uz;
            m.update(1 / 60);
            m.events.length = 0;
          }
          along += (me.x - x0) * ux + (me.z - z0) * uz;
          const t2 = m.targetFor(0);
          toward += t2 ? d0 - Math.hypot(t2.fx - me.x, t2.fz - me.z) : 0;
          n++;
          continue;
        }
        bot.tick(m);
        m.update(1 / 60);
        bot.events(m.events);
        m.events.length = 0;
      }
    }
    row.push(`${a}° (con enganche ${((locked / n) * 100).toFixed(0)}%): hacia el pulgar ${(along / n).toFixed(2)} m, hacia el círculo ${(toward / n).toFixed(2)} m`);
  }
  console.log(`${state === 'parked' ? 'aparcado' : 'yendo al círculo'} (ayuda ${assist}, 0,35 s):\n  ${row.join('\n  ')}`);
}
