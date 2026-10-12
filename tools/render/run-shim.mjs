// Corre una herramienta de Node (TypeScript) con la simulación a medio cambiar: la compila con esbuild para Node, con
// el court.ts de pega de tools/render/build-shim.mjs para los ficheros de src/sim/ que aún importan las paredes del
// pádel, y la ejecuta en este directorio. Uso: node tools/render/run-shim.mjs <entrada.ts> [argumentos…]
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const shimDir = '/tmp/claude-0/tenis-render/shim';
if (!existsSync(`${shimDir}/court.ts`)) spawnSync('node', [`${ROOT}/tools/render/build-shim.mjs`, '/tmp/claude-0/tenis-render/dist'], { stdio: 'inherit' });
const [entry, ...args] = process.argv.slice(2);
const out = '/tmp/claude-0/tenis-render/run-shim.cjs';
await build({
  entryPoints: [resolve(entry)],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node20'],
  outfile: out,
  logLevel: 'error',
  plugins: [
    {
      name: 'court-shim',
      setup(b) {
        b.onResolve({ filter: /^\.\/court$/ }, (a) => (a.importer.includes('/src/sim/') && !a.importer.endsWith('court.ts') ? { path: `${shimDir}/court.ts` } : undefined));
      },
    },
  ],
});
const r = spawnSync('node', [out, ...args], { stdio: 'inherit', cwd: ROOT });
process.exit(r.status ?? 1);
