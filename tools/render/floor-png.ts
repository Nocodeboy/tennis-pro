// La pintura del suelo (textures.ts floorPaint) de cada superficie a un PNG, para mirarla sin el navegador.
// Uso: npx tsx tools/render/floor-png.ts <out_dir>
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const g = globalThis as unknown as Record<string, unknown>;
g.document ??= { createElement: () => ({ getContext: () => null }) };
import { floorPaint } from '../../src/render/textures';
import { BOARDS, HL, SERVICE, W_D, W_S } from '../../src/sim/court';

function png(w: number, h: number, rgba: Uint8Array): Buffer {
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w, 0);
  ih.writeUInt32BE(h, 4);
  ih[8] = 8;
  ih[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let i = 0; i < w * 4; i++) raw[y * (w * 4 + 1) + 1 + i] = i % 4 === 3 ? 255 : rgba[(y * w) * 4 + i];
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const out = process.argv[2] ?? '.';
for (const kind of ['hard', 'clay', 'grass'] as const) {
  const t = floorPaint({ kind, sw: 2 * BOARDS.x + 0.6, sl: 2 * BOARDS.z + 0.6, cw: W_D, cl: HL * 2, cs: W_S, sv: SERVICE, px: 360, seed: 5 }) as unknown as { image: { data: Uint8Array; width: number; height: number } };
  writeFileSync(`${out}/suelo-${kind}.png`, png(t.image.width, t.image.height, t.image.data));
}
