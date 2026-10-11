// The paddle's path through each swing clip as the game measures it (findContact): every 0.05 s, where the middle of
// the paddle face is (model space: +z forward, −x to the model's right, metres of a 1.7 m model) and how fast it goes,
// with the contact frame and the take-back (where the paddle is furthest back before the contact) marked.
// Usage: npx tsx tools/swing-path.ts [kind…]

import './node-chars';
import { CLIP_NAMES, SWINGS, loadCharAssets, type SwingKind } from '../src/render/chars';

(async () => {
  const a = await loadCharAssets('', 'hero', CLIP_NAMES);
  const kinds = (process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SWINGS)) as SwingKind[];
  for (const k of kinds) {
    const P = a.path[k];
    const c = a.contact[k];
    if (!P || c === undefined) continue;
    const n = P.length / 3;
    const at = (t: number) => {
      const i = Math.min(n - 1, Math.max(0, Math.round(t * 60)));
      return [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    };
    // the take-back: furthest back (least z) before the contact, from the clip's own start (or SWINGS.start)
    let back = 0;
    let bz = Infinity;
    for (let t = SWINGS[k].start ?? 0; t < c; t += 1 / 60) {
      const p = at(t);
      if (p[2] < bz) {
        bz = p[2];
        back = t;
      }
    }
    console.log(`\n${k}: contacto ${c.toFixed(3)} s · pala más atrás ${back.toFixed(3)} s (${(c - back).toFixed(2)} s antes) · duración ${a.clips[k].duration.toFixed(2)} s · out ${SWINGS[k].out}`);
    for (let t = 0; t <= Math.min(a.clips[k].duration, c + 0.8); t += 0.05) {
      const p = at(t);
      const q = at(t + 1 / 60);
      const v = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) * 60;
      const mark = Math.abs(t - c) < 0.026 ? ' ← contacto' : Math.abs(t - back) < 0.026 ? ' ← atrás' : '';
      console.log(`  ${t.toFixed(2)}  x ${(-p[0]).toFixed(2).padStart(5)}  y ${p[1].toFixed(2)}  z ${p[2].toFixed(2).padStart(5)}  v ${v.toFixed(1).padStart(4)}${mark}`);
    }
  }
})();
