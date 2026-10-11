// Pulls the animation out of a Meshy-animated character (models3d_animate) into a small JSON clip for the
// standard Meshy skeleton (24 bones), shared by every character rigged with Meshy.
//   · keeps the rotations of every bone and the Hips translation (other bones' translations are constant)
//   · in place: the Hips drift along the ground is removed (the game moves the player); the height stays
// Usage: node tools/prep-clip.mjs <in.glb> <clip-name> [--keep-root]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mkdirSync, writeFileSync } from 'node:fs';

const [, , input, name, ...flags] = process.argv;
const keepRoot = flags.includes('--keep-root');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const anim = doc.getRoot().listAnimations()[0];
const r = (v, d) => Math.round(v * d) / d;
const tracks = [];
let duration = 0;
for (const ch of anim.listChannels()) {
  const node = ch.getTargetNode();
  const path = ch.getTargetPath();
  const nn = node.getName();
  if (path === 'scale') continue;
  if (path === 'translation' && nn !== 'Hips') continue;
  const s = ch.getSampler();
  const t = Array.from(s.getInput().getArray());
  let v = Array.from(s.getOutput().getArray());
  duration = Math.max(duration, t[t.length - 1]);
  if (path === 'translation' && !keepRoot) {
    // Hips: x and z back to the first frame's (no travel), y as animated
    const x0 = v[0];
    const z0 = v[2];
    const ys = [];
    for (let i = 0; i < v.length; i += 3) ys.push(v[i + 1]);
    console.log(`  Hips y ${Math.min(...ys).toFixed(3)}…${Math.max(...ys).toFixed(3)}, x drift ${(v[v.length - 3] - x0).toFixed(3)}, z drift ${(v[v.length - 1] - z0).toFixed(3)}`);
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
    }
  }
  v = v.map((x) => r(x, path === 'rotation' ? 10000 : 100000));
  tracks.push({ n: `${nn}.${path === 'rotation' ? 'quaternion' : 'position'}`, t: t.map((x) => r(x, 1000)), v });
}
mkdirSync('assets/anims', { recursive: true });
const out = JSON.stringify({ name, duration: r(duration, 1000), tracks });
writeFileSync(`assets/anims/${name}.json`, out);
console.log(`${name}: ${tracks.length} tracks, ${duration.toFixed(2)} s, ${(out.length / 1024).toFixed(0)} KB`);
