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
 * The fine texture of the artificial grass, tiled: R the shade (0.5 = none: the tips of the fibres light, the sand
 * between them darker, a few lighter grains of the sand infill), G the roughness, plus a normal map from the same
 * field. A tile is `tile` metres; the court's own colour (courtPaint) carries everything that does not repeat.
 */
export function turfDetail(size: number, seed: number): { detail: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const fine = noise(size, seed, 2, 128);
  const mid = noise(size, seed + 5, 3, 24);
  const r = rng(seed + 3);
  const h = new Float32Array(size * size);
  const [c, x, img] = canvasOf(size);
  for (let i = 0; i < size * size; i++) {
    // a fibre tip or the sand between the fibres (per texel: a few mm), and now and then a grain of the infill on top
    const tip = r();
    const sand = r() < 0.06 ? 1 : 0;
    const f = fine[i] * 0.45 + tip * 0.55;
    h[i] = f + sand * 0.4;
    const shade = 0.5 + (f - 0.5) * 0.7 + (mid[i] - 0.5) * 0.14 + sand * 0.16;
    const rough = Math.min(1, 0.86 + (f - 0.5) * 0.18);
    img.data[i * 4] = Math.max(0, Math.min(255, shade * 255));
    img.data[i * 4 + 1] = rough * 255;
    img.data[i * 4 + 2] = 128;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return { detail: tex(c, false, 1), normal: normalMap(h, size, 2.2, 1) };
}

/**
 * The colour of the whole court and its surround as one canvas (no tiling, about 4 cm a texel): the blue artificial
 * grass inside the glass, the dark floor round it, the rolls of the turf as faint bands along the court, the broad
 * mottling of the pile and the paler, flattened patches where the players stand most (at the back, along the
 * service lines, at the net), where the sand infill shows. RGB: colour (sRGB). A: wear 0…1 (the shader reads it).
 * Court frame: x across (−sw/2 … sw/2), z along (−sl/2 … sl/2), metres.
 */
export function courtPaint(o: { sw: number; sl: number; cw: number; cl: number; service: number; apron: number; court: number; px: number; seed: number }): THREE.DataTexture {
  const W = Math.round(o.px);
  const H = Math.round((o.px * o.sl) / o.sw);
  const mpp = o.sw / W;
  const data = new Uint8Array(W * H * 4);
  const N = 256;
  const broad = noise(N, o.seed, 4, 3);
  const patchy = noise(N, o.seed + 1, 4, 8);
  const streak = noise(N, o.seed + 2, 3, 16);
  const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const A = rgb(o.apron);
  const C = rgb(o.court);
  const hl = o.cl / 2;
  const g2 = (dx: number, dz: number, rx: number, rz: number) => Math.exp(-((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz)));
  for (let py = 0; py < H; py++) {
    const z = -o.sl / 2 + (py + 0.5) * mpp;
    const az = Math.abs(z);
    for (let px = 0; px < W; px++) {
      const xx = -o.sw / 2 + (px + 0.5) * mpp;
      const inCourt = Math.abs(xx) <= o.cw / 2 && az <= hl;
      const col = inCourt ? C : A;
      const u = (px / W) * N * (o.sw / 6);
      const v = (py / H) * N * (o.sl / 6);
      const pt = sample(patchy, N, u * 0.7, v * 0.7);
      let wear = 0;
      if (inCourt) {
        // at the back (both halves of each end), along the service line, at the net (the volleys), the serve spots
        wear += 0.75 * g2(Math.abs(xx) - 2.6, az - (hl - 1.3), 1.6, 1.1);
        wear += 0.45 * g2(0, az - (o.service + 0.2), 4.5, 0.7);
        wear += 0.55 * g2(Math.abs(xx) - 2.4, az - 3.0, 1.5, 1.0);
        wear += 0.5 * g2(Math.abs(xx) - 1.3, az - (o.service + 1.0), 0.6, 0.5);
        // (the glass' foot: the infill swept there by the ball and the shoes)
        wear += 0.35 * Math.max(0, 1 - Math.min(o.cw / 2 - Math.abs(xx), hl - az) / 0.25);
        wear = Math.min(1, wear * (0.45 + 1.1 * pt));
      }
      // broad mottling (a few %); inside, the rolls of turf (2 m wide, laid along the court) in slightly different
      // shades and the pile brushed in passes
      const b = sample(broad, N, u * 0.25, v * 0.25) - 0.5;
      const s = sample(streak, N, u * 0.05, v * 3.5) - 0.5;
      let k = 1 + b * (inCourt ? 0.06 : 0.08);
      if (inCourt) {
        const roll = Math.floor((xx + o.cw / 2) / 2);
        k *= 1 + ((roll * 0.37) % 1 - 0.5) * 0.035 + s * 0.03;
      }
      const i = (py * W + px) * 4;
      // worn: paler and a little greyer (the sand infill showing through the flattened pile)
      const pale = wear * 0.13;
      for (let ch = 0; ch < 3; ch++) {
        const base = col[ch] * k;
        data[i + ch] = Math.max(0, Math.min(255, base + (150 - base) * pale));
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
