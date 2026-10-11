// Stick figures of the players, quick (no browser): the game's CharacterView driven by the same headless matches as
// tools/poses.ts, the bones of one player written every 1/30 s over a stretch of the match (with the paddle, the ball
// and what the body is doing), for tools/sticks.py to draw as strips or a video. To look at a movement many times
// while changing src/render/chars.ts (the real page, tools/seq.py, takes 2 s a frame in a software renderer).
// Usage: npx tsx tools/sticks.ts <run: cpu0…cpu2, human0…human2, doubles0, doubles1> <pid> <from s> <to s> <out.json>
// Env: CHARS=… (another chars.ts, as in tools/poses.ts) · FIND=kind[,n] (instead of from/to: the n-th swing of that
// kind by that player, from 1.2 s before its contact to 0.8 s after) · FIND=start|stop[,n] (a start from still to
// over 3 m/s, or a stop from over 3 m/s, ±0.8 s)

import './node-chars';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import * as Chars from '../src/render/chars';
import { AIController, HUMAN_REACTION, HUMAN_SPEED, PAIRS, PARTNER, RIVALS } from '../src/sim/brain';
import { Match } from '../src/sim/match';
import type { Controller } from '../src/sim/match';
import { HUMANS } from './humans';
import { ThumbBot } from './thumb';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const C: typeof Chars = process.env.CHARS ? require(process.env.CHARS) : Chars;
const { CLIP_NAMES, CharacterView, loadCharAssets } = C;

const RUN = process.argv[2] ?? 'cpu0';
const PID = Number(process.argv[3] ?? 0);
let FROM = Number(process.argv[4] ?? 10);
let TO = Number(process.argv[5] ?? 14);
const OUT = process.argv[6] ?? '/tmp/sticks.json';
const FIND = process.env.FIND ? process.env.FIND.split(',') : null;

function makeRun(a: Chars.CharAssets, mode: string, i: number) {
  // (the same matches as tools/poses.ts)
  const seed = 4242 + i * 7919 + (mode === 'human' ? 1 : mode === 'doubles' ? 2 : 0) * 104729;
  const kit = { shirtHue: null, paddle: 0xffffff, paddleEdge: 0 };
  if (mode === 'doubles') {
    const pair = PAIRS[i % PAIRS.length];
    const m = new Match(
      [
        { team: 0, human: false, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
        { team: 0, human: false, speed: PARTNER.skill.speed, reaction: PARTNER.skill.reaction, look: 0 },
        { team: 1, human: false, speed: pair.a.skill.speed, reaction: pair.a.skill.reaction, look: 0 },
        { team: 1, human: false, speed: pair.b.skill.speed, reaction: pair.b.skill.reaction, look: 0 },
      ],
      { scoring: 'rally', to: 11 },
      seed,
    );
    m.setControllers([new AIController(RIVALS[2].skill), new AIController(PARTNER.skill), new AIController(pair.a.skill), new AIController(pair.b.skill)]);
    m.start();
    return { m, chars: m.players.map(() => new CharacterView(a, kit)), gate: (_k: number) => true, tick() {}, after() {} };
  }
  const rv = RIVALS[(i + 1) % RIVALS.length];
  if (mode === 'human') {
    const lv = Object.values(HUMANS)[i % 3];
    const bot = new ThumbBot(lv, 1, seed + 17);
    const m = new Match(
      [
        { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
        { team: 1, human: false, speed: rv.skill.speed, reaction: rv.skill.reaction, look: rv.look },
      ],
      { scoring: 'rally', to: 11 },
      seed,
    );
    m.setControllers([bot.ctl as unknown as Controller, new AIController(rv.skill)]);
    bot.attach(m);
    m.start();
    return { m, chars: m.players.map(() => new CharacterView(a, kit)), gate: (k: number) => !m.players[k].human || bot.ctl.willSwing(m, m.players[k]), tick: () => bot.tick(m), after: () => bot.events(m.events) };
  }
  const m = new Match(
    [
      { team: 0, human: false, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
      { team: 1, human: false, speed: rv.skill.speed, reaction: rv.skill.reaction, look: rv.look },
    ],
    { scoring: 'rally', to: 11 },
    seed,
  );
  m.setControllers([new AIController(RIVALS[(i + 3) % RIVALS.length].skill), new AIController(rv.skill)]);
  m.start();
  return { m, chars: m.players.map(() => new CharacterView(a, kit)), gate: (_k: number) => true, tick() {}, after() {} };
}

const BONES = ['Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

(async () => {
  const a = await loadCharAssets('', 'hero', CLIP_NAMES);
  const mode = RUN.replace(/\d+$/, '');
  const r = makeRun(a, mode, Number(RUN.slice(mode.length)));
  const dt = 1 / 60;
  const bp = { x: 0, y: 0, z: 0 };
  const v = new THREE.Vector3();
  // FIND: a first pass over the match to find the moment
  if (FIND) {
    const r2 = makeRun(a, mode, Number(RUN.slice(mode.length)));
    const want = FIND[0];
    let n = Number(FIND[1] ?? 1);
    let found = -1;
    let still = 0;
    let fast = 0;
    let lastKey = -1;
    while (r2.m.phase !== 'over' && r2.m.t < 400 && found < 0) {
      r2.tick();
      r2.m.update(dt);
      r2.after();
      r2.m.events.length = 0;
      const p = r2.m.players[PID];
      const sp = Math.hypot(p.vx, p.vz);
      const ch = r2.chars[PID] as unknown as { swing: { kind: string; key: number } | null };
      const b = r2.m.ballPos(bp);
      r2.chars.forEach((c, k) => c.update(dt, r2.m, r2.m.players[k], r2.gate(k), b));
      if (want === 'start') {
        if (sp < 0.2) still = r2.m.t;
        if (sp > 3 && r2.m.t - still < 0.5 && --n === 0) found = still;
        if (sp > 3) still = -9;
      } else if (want === 'stop') {
        if (sp > 3) fast = r2.m.t;
        if (sp < 0.2 && r2.m.t - fast < 0.5 && fast > 0 && --n === 0) found = fast;
        if (sp < 0.2) fast = -9;
      } else if (ch.swing && ch.swing.kind === want && ch.swing.key !== lastKey && ch.swing.key - r2.m.t < 0.02 && ch.swing.key - r2.m.t > 0) {
        lastKey = ch.swing.key;
        if (--n === 0) found = ch.swing.key;
      }
    }
    if (found < 0) throw new Error(`no ${FIND.join(',')}`);
    FROM = Math.max(0, found - (want === 'start' || want === 'stop' ? 0.8 : 1.2));
    TO = found + 0.8;
    console.log(`${FIND.join(',')} at ${found.toFixed(3)} s → ${FROM.toFixed(2)}…${TO.toFixed(2)}`);
  }
  const frames: unknown[] = [];
  let next = FROM;
  while (r.m.phase !== 'over' && r.m.t < TO) {
    r.tick();
    r.m.update(dt);
    r.after();
    for (const e of r.m.events) if (e.type === 'hit') r.chars[e.pid].onHit(e.x, e.y, e.z, r.m.t, r.m.players[e.pid].lastHit?.hand ?? 1);
    r.m.events.length = 0;
    const b = r.m.ballPos(bp);
    r.chars.forEach((c, k) => c.update(dt, r.m, r.m.players[k], r.gate(k), b));
    if (r.m.t + 1e-6 >= next) {
      next += 1 / 30;
      const ch = r.chars[PID] as unknown as { root: THREE.Object3D; tip: THREE.Object3D; paddle: THREE.Object3D; swing: { kind: string; key: number } | null };
      ch.root.updateMatrixWorld(true);
      const bones: Record<string, number[]> = {};
      ch.root.traverse((o) => {
        if (BONES.includes(o.name)) bones[o.name] = o.getWorldPosition(v).toArray().map((x) => +x.toFixed(4));
      });
      const p = r.m.players[PID];
      frames.push({
        t: +r.m.t.toFixed(3),
        bones,
        tip: ch.tip.getWorldPosition(v).toArray().map((x) => +x.toFixed(4)),
        grip: (ch.paddle as THREE.Object3D).getWorldPosition(v).toArray().map((x) => +x.toFixed(4)),
        ball: b ? [b.x, b.y, b.z].map((x) => +x.toFixed(3)) : null,
        sim: [+p.x.toFixed(3), +p.z.toFixed(3), +p.vx.toFixed(2), +p.vz.toFixed(2)],
        yaw: +ch.root.rotation.y.toFixed(3),
        side: p.side,
        swing: ch.swing ? `${ch.swing.kind} ${(r.m.t - ch.swing.key).toFixed(2)}` : '',
        st: (r.m as unknown as { stance(i: number): string | null }).stance(PID) ?? '',
        phase: r.m.phase,
      });
    }
  }
  writeFileSync(OUT, JSON.stringify({ run: RUN, pid: PID, from: FROM, to: TO, frames }));
  console.log(`${frames.length} frames → ${OUT}`);
})();
