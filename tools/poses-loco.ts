// The feet in the locomotion loops, without a match: one player moved at a fixed velocity (every 45° around the body,
// at several speeds) and through starts and stops, the game's CharacterView drawn at 60 fps and the planted foot
// measured with tools/posemetrics.js. Shows which direction and speed slides, before and after a change.
// Usage: npx tsx tools/poses-loco.ts · CHARS=path/to/chars.ts measures another version (NODE_PATH=node_modules)

import './node-chars';
import * as Chars from '../src/render/chars';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PM = require('./posemetrics.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const C: typeof Chars = process.env.CHARS ? require(process.env.CHARS) : Chars;

interface P {
  id: number;
  team: 0;
  side: -1;
  human: false;
  x: number;
  z: number;
  vx: number;
  vz: number;
  speed: number;
  reaction: number;
  plan: null;
  lastHit: null;
  moveFrom: number;
  homeX: number;
  homeZ: number;
  depth: 0;
  look: 0;
  lane: 1;
}

const pct = (a: number[], p: number) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

(async () => {
  const a = await C.loadCharAssets('', 'hero', C.CLIP_NAMES);
  const dt = 1 / 60;
  /** one run: v(t) gives the velocity (world; the body faces +z, its right is −x) */
  const run = (secs: number, vel: (t: number) => [number, number]) => {
    const ch = new C.CharacterView(a, { shirtHue: null, paddle: 0xffffff, paddleEdge: 0 });
    // (SPEEDS='{"backpedal":1.6}' tries other ground speeds for the loops)
    if (process.env.SPEEDS) Object.assign(ch.speeds, JSON.parse(process.env.SPEEDS));
    const p: P = { id: 0, team: 0, side: -1, human: false, x: 0, z: 0, vx: 0, vz: 0, speed: 5, reaction: 0.2, plan: null, lastHit: null, moveFrom: 0, homeX: 0, homeZ: 0, depth: 0, look: 0, lane: 1 };
    const m = { t: 0, phase: 'rally', windup: null, players: [p], ballPos: () => null };
    const probe = new PM.PoseProbe(PM.NAT, { keep: 1 });
    const warm = 0.6;
    for (let t = 0; t < secs; t += dt) {
      const [vx, vz] = vel(t);
      p.vx = vx;
      p.vz = vz;
      p.x += vx * dt;
      p.z += vz * dt;
      m.t = t;
      ch.update(dt, m as never, p as never, false, null);
      if (t > warm) probe.frame([ch], m, dt);
    }
    return probe.s as Record<string, number[]>;
  };
  const dirs = [0, 45, 90, 135, 180, 225, 270, 315];
  const names: Record<number, string> = { 0: 'delante', 45: 'del-der', 90: 'derecha', 135: 'atr-der', 180: 'atrás', 225: 'atr-izq', 270: 'izquierda', 315: 'del-izq' };
  const speeds = [0.8, 1.5, 2.5, 3.5, 4.5];
  console.log('pie apoyado deslizando (mediana / p90, m/s) · saltos de postura (p90, °/s) a velocidad fija · dirección respecto al cuerpo');
  console.log('dirección   ' + speeds.map((s) => `${s} m/s`.padEnd(19)).join(''));
  const all: number[] = [];
  const jerks: number[] = [];
  for (const d of dirs) {
    // (the model's right is −x: "derecha" moves towards −x)
    const r = (d * Math.PI) / 180;
    const cells = speeds.map((s) => {
      const S = run(3.2, () => [-Math.sin(r) * s, Math.cos(r) * s]);
      const sl = S[process.env.SLIDE ?? 'slideG'] ?? [];
      all.push(...sl);
      jerks.push(...(S.jerk ?? []));
      return `${pct(sl, 0.5).toFixed(2)} / ${pct(sl, 0.9).toFixed(2)} · ${pct(S.jerk ?? [], 0.9).toFixed(0)}`.padEnd(19);
    });
    console.log(names[d].padEnd(12) + cells.join(''));
  }
  console.log(`todas: mediana ${pct(all, 0.5).toFixed(2)} · p90 ${pct(all, 0.9).toFixed(2)} · saltos de postura p90 ${pct(jerks, 0.9).toFixed(0)} · p99 ${pct(jerks, 0.99).toFixed(0)}`);
  // starts and stops, as the sim does them (explosive first step, planted stop): 0 → 4 m/s in 0.3 s, 1 s on, stop in 0.25 s
  for (const d of [0, 90, 270, 180]) {
    const r = (d * Math.PI) / 180;
    const S = run(3, (t) => {
      const u = t < 0.6 ? 0 : t < 0.9 ? (t - 0.6) / 0.3 : t < 1.9 ? 1 : t < 2.15 ? 1 - (t - 1.9) / 0.25 : 0;
      const s = 4 * Math.min(1, u);
      return [-Math.sin(r) * s, Math.cos(r) * s];
    });
    const sl = S[process.env.SLIDE ?? 'slideG'] ?? [];
    console.log(`arranque y frenada, ${names[d].padEnd(10)} mediana ${pct(sl, 0.5).toFixed(2)} · p90 ${pct(sl, 0.9).toFixed(2)} · máx ${pct(sl, 1).toFixed(2)} m/s · saltos de postura p90 ${pct(S.jerk ?? [], 0.9).toFixed(0)}`);
  }
})();
