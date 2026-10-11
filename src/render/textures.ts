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

/**
 * The fine texture of the acrylic, tiled: R the sand grain's shade (0.5 = none), G the roughness, plus a normal map from
 * the same grain. A tile is `tile` metres; the court's own paint (courtPaint) carries everything that does not repeat.
 */
export function acrylicDetail(size: number, seed: number): { detail: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const fine = noise(size, seed, 2, 64);
  const mid = noise(size, seed + 5, 3, 16);
  const r = rng(seed + 3);
  const h = new Float32Array(size * size);
  const [c, x, img] = canvasOf(size);
  for (let i = 0; i < size * size; i++) {
    const sand = fine[i] * 0.65 + r() * 0.35;
    h[i] = sand;
    const shade = 0.5 + (sand - 0.5) * 0.55 + (mid[i] - 0.5) * 0.12;
    const rough = Math.min(1, 0.78 + (sand - 0.5) * 0.3 + (mid[i] - 0.5) * 0.1);
    img.data[i * 4] = Math.max(0, Math.min(255, shade * 255));
    img.data[i * 4 + 1] = rough * 255;
    img.data[i * 4 + 2] = 128;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return { detail: tex(c, false, 1), normal: normalMap(h, size, 1.6, 1) };
}

/**
 * The paint of the whole court surround as one canvas (no tiling, about 3 cm a texel): the surround, the court and
 * the kitchen in their colours, the faint passes of the squeegee, the broad mottling of a resurfaced court, the pale
 * worn patches where the players stand (behind the baselines, along the kitchen lines) and the rubber marks of
 * shoes. RGB: colour (sRGB). A: wear 0…1 (smoother and paler; the shader reads it).
 * Court frame: x across (−sw/2 … sw/2), z along (−sl/2 … sl/2), metres.
 */
export function courtPaint(o: {
  sw: number;
  sl: number;
  cw: number;
  cl: number;
  nvz: number;
  apron: number;
  court: number;
  kitchen: number;
  px: number;
  seed: number;
}): THREE.DataTexture {
  const W = Math.round(o.px);
  const H = Math.round((o.px * o.sl) / o.sw);
  const mpp = o.sw / W;
  // rubber marks of shoes first, on their own white canvas: short dark arcs, most where the players stand
  // (row py is z = −sl/2 + (py + ½)·mpp, the same as the data below: no flips anywhere)
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  const hl = o.cl / 2;
  const r = rng(o.seed + 9);
  const toPx = (mx: number, mz: number) => [(mx + o.sw / 2) / mpp, (mz + o.sl / 2) / mpp];
  x.lineCap = 'round';
  for (let n = 0; n < 220; n++) {
    const end = r() < 0.5 ? 1 : -1;
    const zone = r();
    const mx = (r() - 0.5) * (zone < 0.6 ? 4.2 : 6.6);
    const mz = end * (zone < 0.6 ? hl + 0.2 + r() * 1.4 : zone < 0.9 ? o.nvz + 0.1 + r() * 0.7 : r() * hl);
    const len = 0.12 + r() * 0.45;
    const ang = r() * Math.PI * 2;
    const bend = (r() - 0.5) * 0.5;
    const [ax, ay] = toPx(mx, mz);
    const [bx, by] = toPx(mx + Math.cos(ang) * len, mz + Math.sin(ang) * len);
    const [qx, qy] = toPx(mx + Math.cos(ang + bend) * len * 0.5, mz + Math.sin(ang + bend) * len * 0.5);
    x.strokeStyle = `rgba(28,30,36,${(0.06 + r() * 0.14).toFixed(3)})`;
    x.lineWidth = Math.max(0.6, (0.012 + r() * 0.025) / mpp);
    x.beginPath();
    x.moveTo(ax, ay);
    x.quadraticCurveTo(qx, qy, bx, by);
    x.stroke();
  }
  const marks = x.getImageData(0, 0, W, H).data;
  const data = new Uint8Array(W * H * 4);
  const N = 256;
  const broad = noise(N, o.seed, 4, 3);
  const patchy = noise(N, o.seed + 1, 4, 8);
  const streak = noise(N, o.seed + 2, 3, 16);
  const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const A = rgb(o.apron);
  const C = rgb(o.court);
  const K = rgb(o.kitchen);
  const g2 = (dx: number, dz: number, rx: number, rz: number) => Math.exp(-((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz)));
  for (let py = 0; py < H; py++) {
    const z = -o.sl / 2 + (py + 0.5) * mpp;
    for (let px = 0; px < W; px++) {
      const xx = -o.sw / 2 + (px + 0.5) * mpp;
      const inCourt = Math.abs(xx) <= o.cw / 2 && Math.abs(z) <= hl;
      const col = inCourt ? (Math.abs(z) <= o.nvz ? K : C) : A;
      // where the players stand most: behind the baselines (serve and return), along the kitchen lines (dinks),
      // a little through the transition; patchy, never a clean blob
      const az = Math.abs(z);
      let wear = 0;
      wear += 0.9 * g2(xx - 1.3, az - (hl + 0.55), 1.5, 0.9) + 0.9 * g2(xx + 1.3, az - (hl + 0.55), 1.5, 0.9) + 0.6 * g2(xx, az - (hl + 0.25), 1.2, 0.7);
      wear += 0.75 * g2(0, az - (o.nvz + 0.35), 9, 0.45) * (Math.abs(xx) < o.cw / 2 + 0.2 ? 1 : 0.3);
      wear += 0.35 * g2(xx * 0.6, az - (o.nvz + 2.2), 2.4, 1.4);
      const u = (px / W) * N * (o.sw / 6);
      const v = (py / H) * N * (o.sl / 6);
      const pt = sample(patchy, N, u * 0.7, v * 0.7);
      wear = Math.min(1, wear * (0.45 + 1.1 * pt));
      // broad mottling (a few %), squeegee passes across the court (faint bands along z)
      const b = sample(broad, N, u * 0.25, v * 0.25) - 0.5;
      const s = sample(streak, N, u * 0.05, v * 3.5) - 0.5;
      let k = 1 + b * 0.07 + s * 0.035;
      // dust along the boards at the edge of the surround
      const edge = Math.min(o.sw / 2 - Math.abs(xx), o.sl / 2 - az);
      k *= 1 - 0.07 * Math.max(0, 1 - edge / 0.7) * (0.6 + pt * 0.8);
      const i = (py * W + px) * 4;
      const mk = marks[i] / 255;
      const pale = wear * 0.16;
      for (let ch = 0; ch < 3; ch++) {
        const base = col[ch] * k;
        // worn: paler and greyer (the pigment rubbed off, dust in the grain)
        data[i + ch] = Math.max(0, Math.min(255, (base + (168 - base) * pale) * mk));
      }
      data[i + 3] = Math.round(Math.min(1, wear) * 255);
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

/** Chain-link fence (diamond weave). */
export function chainLink(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(40,52,48,0.95)';
  x.lineWidth = 2.6;
  x.beginPath();
  x.moveTo(0, 32);
  x.lineTo(32, 0);
  x.lineTo(64, 32);
  x.lineTo(32, 64);
  x.closePath();
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A pickleball: neon yellow with its rings of holes. */
export function ballTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = '#dcff3c';
  x.fillRect(0, 0, w, h);
  // 40 holes in rings (equirectangular: holes near the poles get wider). Seen from the broadcast camera the ball is a
  // few pixels across, so the holes stay a mid olive with a light rim: the ball reads bright, the holes still show
  // up close and its turning shows
  const rows = [0.18, 0.38, 0.62, 0.82];
  rows.forEach((v, ri) => {
    const n = ri === 0 || ri === 3 ? 6 : 12;
    for (let i = 0; i < n; i++) {
      const u = (i + (ri % 2) * 0.5) / n;
      const lat = (v - 0.5) * Math.PI;
      const sx = 8 / Math.max(0.35, Math.cos(lat));
      x.fillStyle = '#f2ff9a';
      x.beginPath();
      x.ellipse(u * w, v * h, sx + 2, 10, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#7d9219';
      x.beginPath();
      x.ellipse(u * w, v * h, sx, 8, 0, 0, Math.PI * 2);
      x.fill();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
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
