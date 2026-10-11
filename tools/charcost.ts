// What the characters cost: the time CharacterView.update takes per player and frame (µs: median, p90, p99, mean), in
// a CPU match and a doubles match at 60 fps, without the measures of tools/poses.ts. CHARS=… times another chars.ts
// (before/after a change, run one after the other on the same machine; a desktop, not a phone).
// Usage: npx tsx tools/charcost.ts [seconds = 90]

import './node-chars';
import * as Chars from '../src/render/chars';
import { AIController, HUMAN_REACTION, HUMAN_SPEED, PAIRS, PARTNER, RIVALS } from '../src/sim/brain';
import { Match } from '../src/sim/match';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const C: typeof Chars = process.env.CHARS ? require(process.env.CHARS) : Chars;
const SECS = Number(process.argv[2] ?? 90);

(async () => {
  const a = await C.loadCharAssets('', 'hero', C.CLIP_NAMES);
  const kit = { shirtHue: null, paddle: 0xffffff, paddleEdge: 0 };
  const all: number[] = [];
  for (const doubles of [false, true]) {
    const pair = PAIRS[1];
    const cfg = doubles
      ? [
          { team: 0 as const, human: false, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
          { team: 0 as const, human: false, speed: PARTNER.skill.speed, reaction: PARTNER.skill.reaction, look: 0 },
          { team: 1 as const, human: false, speed: pair.a.skill.speed, reaction: pair.a.skill.reaction, look: 0 },
          { team: 1 as const, human: false, speed: pair.b.skill.speed, reaction: pair.b.skill.reaction, look: 0 },
        ]
      : [
          { team: 0 as const, human: false, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
          { team: 1 as const, human: false, speed: RIVALS[2].skill.speed, reaction: RIVALS[2].skill.reaction, look: 0 },
        ];
    const m = new Match(cfg, { scoring: 'rally', to: 11 }, 777);
    m.setControllers(doubles ? [new AIController(RIVALS[2].skill), new AIController(PARTNER.skill), new AIController(pair.a.skill), new AIController(pair.b.skill)] : [new AIController(RIVALS[3].skill), new AIController(RIVALS[2].skill)]);
    m.start();
    const chars = m.players.map(() => new C.CharacterView(a, kit));
    const bp = { x: 0, y: 0, z: 0 };
    const dt = 1 / 60;
    while (m.phase !== 'over' && m.t < SECS) {
      m.update(dt);
      for (const e of m.events) if (e.type === 'hit') chars[e.pid].onHit(e.x, e.y, e.z, m.t, m.players[e.pid].lastHit?.hand ?? 1);
      m.events.length = 0;
      const b = m.ballPos(bp);
      for (let k = 0; k < chars.length; k++) {
        const t0 = performance.now();
        chars[k].update(dt, m, m.players[k], true, b);
        all.push((performance.now() - t0) * 1000);
      }
    }
  }
  // (the first second is the JIT warming up)
  const s = all.slice(240).sort((x, y) => x - y);
  const q = (k: number) => s[Math.min(s.length - 1, Math.floor(k * s.length))].toFixed(0);
  console.log(`update por jugador y fotograma: p50 ${q(0.5)} µs · p90 ${q(0.9)} · p99 ${q(0.99)} · media ${(s.reduce((x, y) => x + y, 0) / s.length).toFixed(0)} µs (${s.length} llamadas)`);
})();
