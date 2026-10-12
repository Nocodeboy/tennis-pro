// Bundles the render harness (tools/audio/harness.ts) against one version of the engine into a page:
//   node tools/audio/build.mjs <out dir> [path to an audio.ts; default src/audio.ts]
// The page is <out>/index.html; the engine fetches its samples from <out>/assets/sfx (render.py links assets there).
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = process.argv[2];
const engine = resolve(process.argv[3] ?? 'src/audio.ts');
if (!out) throw new Error('usage: node tools/audio/build.mjs <out dir> [audio.ts]');
const res = await build({
  entryPoints: ['tools/audio/harness.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  write: false,
  plugins: [
    {
      name: 'engine',
      setup(b) {
        b.onResolve({ filter: /src\/audio$/ }, () => ({ path: engine }));
      },
    },
  ],
});
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/harness.js`, res.outputFiles[0].text);
writeFileSync(`${out}/index.html`, '<!doctype html><meta charset="utf-8"><title>audio harness</title><script src="harness.js"></script>');
console.log(`${out}: harness on ${engine}`);
