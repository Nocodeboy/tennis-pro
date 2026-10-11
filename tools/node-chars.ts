// Loads the AI-made players in Node (no browser, no WebGL): the same CharacterView the game draws, driven by the
// same simulation, for numeric checks of the poses over thousands of frames (tools/poses.ts). The model, the clips
// and the texture are read from assets/; the canvas, the image and fetch are stubbed (nothing is drawn).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const g = globalThis as unknown as Record<string, unknown>;
g.window ??= { addEventListener() {}, devicePixelRatio: 1 };
g.self ??= g;
const ctx2d = { drawImage() {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} };
g.document ??= {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }),
  createElementNS: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }),
};
g.Image = class {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 1024;
  height = 1024;
  set src(_v: string) {
    setTimeout(() => this.onload?.(), 0);
  }
};
const realFetch = g.fetch;
g.fetch = async (url: string) => {
  if (/^https?:/.test(url)) return (realFetch as (u: string) => Promise<unknown>)(url);
  const body = readFileSync(join(ROOT, url), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body) };
};

export {};
