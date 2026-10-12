// Compila el juego con la simulación de pádel todavía a medio cambiar: los ficheros de src/sim/ que aún importan las
// paredes de court.ts (WALL, sideTop, sideSurface, backSurface) reciben un court.ts con esas funciones de pega, solo
// para poder hacer capturas del render mientras la simulación se rehace. Escribe en <out> (por defecto
// /tmp/claude-0/tenis-render/dist) la página y los assets, como build.mjs.
// Uso: node tools/render/build-shim.mjs [out] [entrada = src/main.ts; «harness»: tools/render/harness.ts]
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const OUT = process.argv[2] ?? '/tmp/claude-0/tenis-render/dist';
const ENTRY = process.argv[3] === 'harness' ? 'tools/render/harness.ts' : process.argv[3] ?? 'src/main.ts';
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const shimDir = '/tmp/claude-0/tenis-render/shim';
mkdirSync(shimDir, { recursive: true });
writeFileSync(
  `${shimDir}/court.ts`,
  `export * from '${ROOT}/src/sim/court';
import { HL } from '${ROOT}/src/sim/court';
export type Surface = 'glass' | 'mesh' | 'open';
export const WALL = { glassH: 3, topH: 4, glassLen: 2, stepLen: 2, stepH: 2, stepTopH: 3, meshH: 3 };
export function sideGlassTop(d: number) { return 0 * d; }
export function sideTop(d: number) { return 0 * d - 100; }
export function sideSurface(d: number, y: number): Surface { return d * 0 + y * 0 === 0 ? 'open' : 'open'; }
export function backSurface(y: number): Surface { return y * 0 === 0 ? 'open' : 'open'; }
void HL;
`,
);
const css = readFileSync(`${ROOT}/src/style.css`, 'utf8');
const shim = {
  name: 'court-shim',
  setup(b) {
    b.onResolve({ filter: /^\.\/court$/ }, (a) => (a.importer.includes('/src/sim/') && !a.importer.endsWith('court.ts') && !process.env.NOSHIM ? { path: `${shimDir}/court.ts` } : undefined));
  },
};
const res = await build({
  entryPoints: [`${ROOT}/${ENTRY}`],
  bundle: true,
  minify: false,
  format: 'iife',
  target: ['es2022'],
  write: false,
  legalComments: 'none',
  plugins: [shim],
  define: { __VERSION__: JSON.stringify('tenis-shim') },
  logLevel: 'error',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const body = `<div id="app"><canvas id="c"></canvas><div id="touch"></div><div id="fx"></div><div id="flash"></div><div id="hud" hidden></div><div id="banner"></div><div id="toast" aria-live="polite"></div><div id="hint" hidden></div><div id="screens"></div></div>`;
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/index.html`, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${body}<script>${js}</script></body></html>`);
cpSync(`${ROOT}/assets`, `${OUT}/assets`, { recursive: true });
writeFileSync(`${OUT}/assets/props/props.json`, JSON.stringify({ b64: readFileSync(`${ROOT}/assets/props/props.bin`).toString('base64') }));
console.log(`${OUT}/index.html ${(js.length / 1024).toFixed(0)} KB`);
