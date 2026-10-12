// Procedural textures made at start-up on canvases: no image files to load, no licences.
// Surfaces get a colour map, a roughness map and a normal map built from the same height noise.

import * as THREE from 'three';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable fractal value noise in 0…1, size × size. */
export function noise(size: number, seed: number, octaves = 5, base = 4): Float32Array {
  const out = new Float32Array(size * size);
  const r = rng(seed);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const g = base << o;
    const grid = new Float32Array(g * g);
    for (let i = 0; i < grid.length; i++) grid[i] = r();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * g;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * g;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const a = grid[(y0 % g) * g + (x0 % g)];
        const b = grid[(y0 % g) * g + ((x0 + 1) % g)];
        const c = grid[((y0 + 1) % g) * g + (x0 % g)];
        const d = grid[((y0 + 1) % g) * g + ((x0 + 1) % g)];
        out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvasOf(size: number): [HTMLCanvasElement, CanvasRenderingContext2D, ImageData] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx, ctx.createImageData(size, size)];
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  return t;
}

/** Normal map from a height field (tileable). */
function normalMap(h: Float32Array, size: number, strength: number, repeat: number): THREE.CanvasTexture {
  const [c, ctx, img] = canvasOf(size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const rr = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x];
      const d = h[((y + 1) % size) * size + x];
      let nx = (l - rr) * strength;
      let ny = (u - d) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return tex(c, false, repeat);
}

export interface Surface {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

/**
 * A grainy painted surface (the acrylic of a sports court, concrete…): a fine sand texture on top of
 * broad, faint colour variation. Colour is a tint applied to white, so one texture serves every paint.
 */
export function surface(opts: { seed: number; size?: number; grain: number; blotch: number; rough: [number, number]; normal: number; repeat: number; joints?: number; scuffs?: number }): Surface {
  const size = opts.size ?? 512;
  const fine = noise(size, opts.seed, 2, 64);
  const broad = noise(size, opts.seed + 7, 4, 3);
  // streaky wear (sliding shoes, a roller's passes): long thin stretched noise, a little smoother and paler
  const streak = opts.scuffs ? noise(size, opts.seed + 11, 3, 2) : null;
  const r = rng(opts.seed + 3);
  const h = new Float32Array(size * size);
  const [c1, x1, i1] = canvasOf(size);
  const [c2, x2, i2] = canvasOf(size);
  const jw = opts.joints ?? 0;
  for (let i = 0; i < size * size; i++) {
    const sand = fine[i] * 0.7 + r() * 0.3;
    // expansion joints of concrete slabs: a dark groove along the tile's edges (the tile is one slab)
    const px = i % size;
    const py = (i / size) | 0;
    const jd = jw ? Math.min(px, size - 1 - px, py, size - 1 - py) : 99;
    const groove = jw ? Math.max(0, 1 - jd / jw) : 0;
    let scuff = 0;
    if (streak) {
      const sy = streak[((py * 7) % size) * size + ((px >> 3) % size)];
      scuff = Math.max(0, sy - 0.62) * (opts.scuffs ?? 0) * 4;
    }
    h[i] = sand - groove * 1.5 - scuff * 0.3;
    const v = (1 - opts.grain * (1 - sand) - opts.blotch * (broad[i] - 0.5) + scuff * 0.5) * (1 - 0.55 * groove);
    const c = Math.max(0, Math.min(255, v * 255));
    i1.data[i * 4] = i1.data[i * 4 + 1] = i1.data[i * 4 + 2] = c;
    i1.data[i * 4 + 3] = 255;
    const rough = Math.min(1, opts.rough[0] + (opts.rough[1] - opts.rough[0]) * (sand * 0.7 + broad[i] * 0.3) - scuff * 0.25 + groove * 0.1);
    i2.data[i * 4] = i2.data[i * 4 + 1] = i2.data[i * 4 + 2] = rough * 255;
    i2.data[i * 4 + 3] = 255;
  }
  x1.putImageData(i1, 0, 0);
  x2.putImageData(i2, 0, 0);
  return { map: tex(c1, true, opts.repeat), roughnessMap: tex(c2, false, opts.repeat), normalMap: normalMap(h, size, opts.normal, opts.repeat) };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** bilinear sample of a size × size tileable field at (u, v) in texels */
function sample(f: Float32Array, size: number, u: number, v: number): number {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const m = size - 1;
  const ix = ((x0 % size) + size) & m;
  const iy = ((y0 % size) + size) & m;
  const jx = (ix + 1) & m;
  const jy = (iy + 1) & m;
  const a = f[iy * size + ix];
  const b = f[iy * size + jx];
  const c = f[jy * size + ix];
  const d = f[jy * size + jx];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** a tennis court's surface (court.ts) */
export type Floor = 'hard' | 'clay' | 'grass';

/**
 * The fine texture of a court's surface, tiled (a tile is TILE metres, see venue.ts): R the shade (0.5 = none), G the
 * roughness, plus a normal map from the same field. The court's own colour (floorPaint) carries everything that does
 * not repeat.
 *  · hard: the acrylic over the concrete, a fine sand in the paint (a speckle, a few lighter and darker grains);
 *  · clay: the crushed brick, grains and small lumps, matte and rough;
 *  · grass: the blades, short streaks across the court (the mower's way), the soil between them a touch darker.
 */
export function floorDetail(kind: Floor, size: number, seed: number): { detail: THREE.CanvasTexture; normal: THREE.CanvasTexture; strength: number } {
  const fine = noise(size, seed, 2, 128);
  const mid = noise(size, seed + 5, 3, 24);
  const r = rng(seed + 3);
  const h = new Float32Array(size * size);
  const [c, x, img] = canvasOf(size);
  // (grass: each texel is a few millimetres of a blade: short streaks along x, the mowing direction)
  const blades = kind === 'grass' ? noise(size, seed + 9, 2, 64) : null;
  for (let i = 0; i < size * size; i++) {
    const px = i % size;
    const py = (i / size) | 0;
    let shade: number;
    let rough: number;
    if (kind === 'hard') {
      const g = r();
      const speck = g < 0.035 ? 0.22 : g > 0.975 ? -0.2 : 0;
      const f = fine[i] * 0.6 + r() * 0.4;
      h[i] = f * 0.6 + speck * 0.5;
      shade = 0.5 + (f - 0.5) * 0.22 + (mid[i] - 0.5) * 0.06 + speck;
      rough = 0.62 + (f - 0.5) * 0.12 - speck * 0.1;
    } else if (kind === 'clay') {
      const g = r();
      const lump = Math.max(0, mid[i] - 0.62) * 2.5;
      const f = fine[i] * 0.45 + r() * 0.55;
      h[i] = f + lump * 0.8 + (g < 0.05 ? 0.5 : 0);
      shade = 0.5 + (f - 0.5) * 0.5 + lump * 0.12 + (g < 0.05 ? 0.12 : g > 0.97 ? -0.15 : 0);
      rough = 0.94 + (f - 0.5) * 0.06;
    } else {
      // a blade: a streak a few texels long, lit or in shade; soil between blades now and then
      const b = blades![py * size + ((px + ((py * 7) % 5)) % size)];
      const blade = sample(blades!, size, px / 6, py) * 0.6 + r() * 0.4;
      const soil = r() < 0.04 ? 1 : 0;
      h[i] = blade * 1.2 - soil * 0.4 + b * 0.1;
      shade = 0.5 + (blade - 0.5) * 0.55 + (mid[i] - 0.5) * 0.1 - soil * 0.18;
      rough = 0.84 + (blade - 0.5) * 0.12;
    }
    img.data[i * 4] = Math.max(0, Math.min(255, shade * 255));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, rough * 255));
    img.data[i * 4 + 2] = 128;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const strength = kind === 'hard' ? 1.2 : kind === 'clay' ? 2.6 : 2.2;
  return { detail: tex(c, false, 1), normal: normalMap(h, size, strength, 1), strength };
}

/** the colours of each surface: in the court (the doubles court), outside it (the run-off), and the wear */
export const FLOOR_COLORS: Record<Floor, { court: number; run: number; wear: number; line: number }> = {
  // New York's: blue inside the lines, green round it (acrylic)
  hard: { court: 0x2f62a0, run: 0x3c7a50, wear: 0x6f8fb4, line: 0xf4f6f2 },
  // brick dust, the run-off the same clay (it darkens away from the lines: less played, damper); the lines white
  // tapes, dusty
  clay: { court: 0xbf6438, run: 0xbf6438, wear: 0xd08a5c, line: 0xf0e6dc },
  // the lawn's green (the light stripe), and the bare earth where it is worn
  grass: { court: 0x4b8a3b, run: 0x4b8a3b, wear: 0x8f7a55, line: 0xf6f6f0 },
};

/**
 * The colour of the whole floor inside the boards as one canvas (no tiling, about 5 cm a texel), for a surface: the
 * court and its run-off in their colours, the broad mottling, and what play leaves on it. RGB: colour (sRGB); A: wear
 * 0…1 (the shader makes it a little smoother). The floodlights' pool is in it too: the run-off by the boards a little
 * darker than the court (the light baked in Blender for the padel cage did not fit this court: it is gone).
 *  · hard: the court's paint evenly matte, paler and smoother where the players run most (behind the baselines, the
 *    serve and return spots), a few dark scuffs of rubber;
 *  · clay: the brushed brick dust: the drag mat's arcs and the brush's straight passes (the tram lines), damp and dry
 *    patches, the slides of the players behind the baselines (long pale streaks with a darker edge), footprints;
 *  · grass: the mown stripes across the court (light and dark bands), and the bare earth behind each baseline where
 *    the players serve, return and rally, worn brown with tufts of grass left in it.
 * Court frame: x across (−sw/2 … sw/2), z along (−sl/2 … sl/2), metres; `cw`, `cl` the doubles court, `sv` the
 * service line, `cs` the singles court's width.
 */
export function floorPaint(o: { kind: Floor; sw: number; sl: number; cw: number; cl: number; cs: number; sv: number; px: number; seed: number }): THREE.DataTexture {
  const W = Math.round(o.px);
  const H = Math.round((o.px * o.sl) / o.sw);
  const mpp = o.sw / W;
  const data = new Uint8Array(W * H * 4);
  const N = 256;
  const broad = noise(N, o.seed, 4, 3);
  const patchy = noise(N, o.seed + 1, 4, 8);
  const streak = noise(N, o.seed + 2, 3, 16);
  const fine = noise(N, o.seed + 4, 2, 64);
  const r = rng(o.seed + 7);
  const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const F = FLOOR_COLORS[o.kind];
  const C = rgb(F.court);
  const RUNC = rgb(F.run);
  const WEAR = rgb(F.wear);
  const hl = o.cl / 2;
  const g2 = (dx: number, dz: number, rx: number, rz: number) => Math.exp(-((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz)));
  // clay: the slides (start x, z, length, which way along x, a little slant), drawn after the colour
  const slides: [number, number, number, number, number][] = [];
  if (o.kind === 'clay')
    for (let i = 0; i < 46; i++) {
      const end = r() < 0.5 ? 1 : -1;
      const x = (r() - 0.5) * (o.cs + 1.0);
      const z = end * (hl - 1.0 + r() * 3.2);
      slides.push([x, z, 0.5 + r() * 1.1, r() < 0.5 ? 1 : -1, (r() - 0.5) * 0.5]);
    }
  for (let py = 0; py < H; py++) {
    const z = -o.sl / 2 + (py + 0.5) * mpp;
    const az = Math.abs(z);
    for (let px = 0; px < W; px++) {
      const xx = -o.sw / 2 + (px + 0.5) * mpp;
      const ax = Math.abs(xx);
      const inCourt = ax <= o.cw / 2 && az <= hl;
      const u = (px / W) * N * (o.sw / 6);
      const v = (py / H) * N * (o.sl / 6);
      const pt = sample(patchy, N, u * 0.7, v * 0.7);
      const b = sample(broad, N, u * 0.25, v * 0.25) - 0.5;
      const s = sample(streak, N, u * 0.05, v * 3.5) - 0.5;
      const fn = sample(fine, N, u * 2, v * 2) - 0.5;
      let col = inCourt ? C : RUNC;
      let k = 1;
      // the floodlights' pool: the run-off darker towards the boards (clay and grass: the same surface, less played,
      // so a little more)
      const edge = Math.max(ax - o.cw / 2, az - hl, 0);
      k *= 1 - (o.kind === 'hard' ? 0.1 : 0.14) * smooth(0, 4, edge);
      // where the players are most: behind the baselines (around the middle), the serve and return spots
      let play = 0.8 * g2(xx * 0.55, az - (hl + 0.6), 3.2, 1.3) + 0.45 * g2(ax - 1.4, az - (hl + 0.2), 0.8, 0.6) + 0.25 * g2(xx * 0.4, az - (hl - 2.0), 3.5, 1.2) + 0.3 * g2(xx * 0.5, az - 2.6, 3.5, 1.1);
      let wear = 0;
      if (o.kind === 'hard') {
        k *= 1 + b * 0.05 + fn * 0.015;
        wear = Math.min(1, play * (0.4 + 0.9 * pt) * 0.55);
      } else if (o.kind === 'clay') {
        // the drag mat's passes: straight bands across the court about a mat wide (2 m), each a touch lighter or
        // darker, their edges a faint ridge of dust; and the broad drag marks along them
        const band = (z + 100) / 2.05;
        const bi = Math.floor(band);
        const bf = band - bi;
        const pass = ((bi * 0.618) % 1) - 0.5;
        const ridge = Math.max(0, 1 - Math.min(bf, 1 - bf) / 0.03);
        k *= 1 + b * 0.09 + (pt - 0.5) * 0.06 + pass * 0.03 + ridge * 0.03 + s * 0.02 + fn * 0.03;
        // (damp patches darker)
        k *= 1 - 0.06 * Math.max(0, sample(broad, N, u * 0.6 + 40, v * 0.6) - 0.6) * 4;
        wear = Math.min(1, play * (0.3 + 1.1 * pt) * 0.5);
      } else {
        // the stripes across the court (parallel to the net), the run-off's the same; a little patchiness
        const band = Math.floor((z + 100) / 0.915) % 2 === 0 ? 1 : 0;
        k *= (band ? 1.07 : 0.9) + b * 0.06 + (pt - 0.5) * 0.05 + fn * 0.03;
        // the bare earth: behind each baseline and a metre into the court, between the singles sidelines, worn
        // brown in the middle (the serve, the rally), with ragged edges and tufts left; the serve and return spots;
        // a faint path along the singles sidelines
        const back = Math.exp(-((xx / 3.0) ** 4)) * Math.exp(-(((az - (hl + 0.1)) / 1.05) ** 2));
        play = 1.2 * back + 0.5 * g2(ax - 1.1, az - (hl + 0.1), 0.7, 0.6) + 0.22 * g2(xx, az - (hl - 2.4), 2.4, 1.0) + 0.18 * g2(ax - o.cs / 2, az - (hl - 1.0), 0.45, 2.4) + 0.12 * g2(xx, az - 2.4, 1.6, 0.9);
        const rag = 0.55 + 0.9 * pt + 0.5 * fn;
        wear = Math.min(1, Math.max(0, play * rag - 0.18) * 1.35);
      }
      const i = (py * W + px) * 4;
      // worn: towards the wear colour (paler acrylic, lighter brick dust, bare earth), with its own grain
      const ww = o.kind === 'grass' ? Math.min(1, wear * 1.1) * (0.8 + 0.4 * (fn + 0.5)) : wear * 0.35;
      for (let ch = 0; ch < 3; ch++) {
        const base = col[ch] * k;
        const worn = WEAR[ch] * (o.kind === 'grass' ? 0.85 + 0.3 * (pt - 0.5) + 0.12 * fn : 1);
        data[i + ch] = Math.max(0, Math.min(255, base + (worn - base) * Math.min(1, ww)));
      }
      data[i + 3] = Math.round(Math.min(1, wear) * 255);
      col = C;
    }
  }
  // clay: the slides, two thin scraped tracks side by side (the soles), paler, fading in and deepening to a darker
  // heap of dust where the slide stopped; footprints scattered round the baselines
  if (o.kind === 'clay') {
    const put = (x: number, z: number, k: number) => {
      const px = Math.round((x + o.sw / 2) / mpp - 0.5);
      const py = Math.round((z + o.sl / 2) / mpp - 0.5);
      if (px < 0 || py < 0 || px >= W || py >= H) return;
      const i = (py * W + px) * 4;
      for (let ch = 0; ch < 3; ch++) data[i + ch] = Math.max(0, Math.min(255, data[i + ch] * k));
    };
    for (const [x0, z0, len, dir, slant] of slides) {
      const n = Math.ceil(len / (mpp * 0.5));
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        const x = x0 + dir * t * len;
        const z = z0 + slant * t * len;
        const k = 1 + 0.05 * Math.sin(Math.PI * Math.min(1, t * 1.3));
        put(x, z - 0.06, k);
        put(x, z + 0.06, k);
      }
      put(x0 + dir * (len + mpp), z0 + slant * len, 0.9);
    }
    for (let i = 0; i < 700; i++) {
      const end = r() < 0.5 ? 1 : -1;
      put((r() - 0.5) * (o.cw + 1), end * (hl - 3 + r() * 6), 0.94);
    }
  }
  // hard: rubber scuffs, short dark arcs behind the baselines
  if (o.kind === 'hard')
    for (let i = 0; i < 40; i++) {
      const end = r() < 0.5 ? 1 : -1;
      const x0 = (r() - 0.5) * o.cs;
      const z0 = end * (hl - 0.8 + r() * 2.2);
      const a0 = r() * Math.PI * 2;
      const len = 0.15 + r() * 0.3;
      for (let t = 0; t < len; t += mpp * 0.5) {
        const px = Math.round((x0 + Math.cos(a0 + t) * t + o.sw / 2) / mpp - 0.5);
        const py = Math.round((z0 + Math.sin(a0 + t) * t + o.sl / 2) / mpp - 0.5);
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const i = (py * W + px) * 4;
        for (let ch = 0; ch < 3; ch++) data[i + ch] = data[i + ch] * 0.94;
      }
    }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * Baked ambient occlusion, as one small atlas for every decal: the left half fades along v (a strip at the foot of
 * a wall: dark at v = 0), the right half is a round blob (dark in the middle). White = no darkening (alpha map).
 */
export function aoTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  const img = x.createImageData(w, h);
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      let a: number;
      if (px < w / 2 - 2) {
        const v = 1 - py / (h - 1); // canvas y down = texture v up (flipY)
        a = Math.pow(Math.max(0, 1 - v), 2.2);
      } else if (px >= w / 2 + 2) {
        const u = (px - w / 2 - 2) / (w / 2 - 3) - 0.5;
        const v = py / (h - 1) - 0.5;
        const d = Math.min(1, Math.hypot(u, v) * 2);
        a = Math.pow(1 - d, 1.8);
      } else a = 0;
      const i = (py * w + px) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255);
      img.data[i + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Soft round blob for contact shadows under feet and ball. */
export function blobTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/**
 * A player's shadows under the floodlights, on a 3.6 m quad laid flat (canvas x = world +x, canvas y = world +z): the
 * contact blob at the feet and four soft shadows towards the corners, one for each group of floodlights in the roof's
 * ring (the X of a floodlit court). `key`: also draw the key light's own (the low tier has no shadow map); without it
 * that one is left to the shadow map. `keyAz`: where the key light comes from (deg, as the view's SUN_AZ).
 */
export function stadiumShadowTexture(keyAz: number, key: boolean): THREE.CanvasTexture {
  const S = 128;
  const ppm = S / 3.6;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  const a = (keyAz * Math.PI) / 180;
  // the key light's shadow falls away from it; the other three are its mirror images across the court's axes
  const kx = -Math.sin(a);
  const kz = -Math.cos(a);
  const lobes: [number, number, number][] = [
    [kx, kz, 0.3],
    [-kx, kz, 0.15],
    [kx, -kz, 0.13],
    [-kx, -kz, 0.11],
  ];
  for (let i = key ? 0 : 1; i < lobes.length; i++) {
    const [dx, dz, alpha] = lobes[i];
    x.save();
    x.translate(S / 2, S / 2);
    x.rotate(Math.atan2(dz, dx));
    x.translate(0.62 * ppm, 0);
    x.scale(1, 0.3);
    const g = x.createRadialGradient(-0.45 * ppm, 0, 0, 0, 0, 0.82 * ppm);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(0.55, `rgba(0,0,0,${(alpha * 0.6).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 0.82 * ppm, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
  const blob = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, 0.4 * ppm);
  blob.addColorStop(0, 'rgba(0,0,0,0.5)');
  blob.addColorStop(0.6, 'rgba(0,0,0,0.2)');
  blob.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = blob;
  x.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
