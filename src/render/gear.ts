// The gear: a pro's paddle and an outdoor ball, as real as a phone allows.
//
// Paddle: the real outline (elongated, standard or hybrid, about 40 × 19 cm with the handle), a 16 mm core with its
// edge guard (the bevel round the rim and a band of it on both faces), a raw carbon or fibreglass face with its
// graphics and an invented mark, the twill weave and grit as relief, a throat collar, a handle wrapped in overgrip and
// a butt cap. One geometry per shape for every player; three draw calls a paddle, as before. The middle of the face
// (the contact point the arm aims, 0.255 m up from the grip) is where it was.
//
// Ball: an outdoor ball's 40 round holes (laid out on the sphere, so they stay round at the poles), the moulding seam,
// a small printed mark that shows it turning, the holes darker and recessed (relief, and no glow inside them). It keeps
// its glow and its size, which make it readable on a phone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** How a player's paddle looks. Colours sRGB hex. */
export interface PaddleLook {
  shape: 'elongated' | 'standard' | 'hybrid';
  /** raw carbon (dark, weave showing), fibreglass in the graphic's colour, or a light face */
  face: 'carbon' | 'glass' | 'light';
  /** the sweep across the face */
  graphic: number;
  /** its thin line, the inset outline and the mark */
  graphic2: number;
  /** the overgrip */
  grip: number;
}

const SHAPES = {
  // width, top of the face, length of the handle, corner radius at the top and at the throat (m)
  elongated: { W: 0.188, top: 0.405, handle: 0.137, rT: 0.028, rB: 0.03 },
  standard: { W: 0.2, top: 0.395, handle: 0.125, rT: 0.05, rB: 0.036 },
  hybrid: { W: 0.195, top: 0.4, handle: 0.132, rT: 0.038, rB: 0.032 },
};
type Shape = keyof typeof SHAPES;

interface PathLike {
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): unknown;
}
function outline(path: PathLike, W: number, y0: number, top: number, rT: number, rB: number) {
  path.moveTo(-W / 2 + rB, y0);
  path.lineTo(W / 2 - rB, y0);
  path.quadraticCurveTo(W / 2, y0, W / 2, y0 + rB);
  path.lineTo(W / 2, top - rT);
  path.quadraticCurveTo(W / 2, top, W / 2 - rT, top);
  path.lineTo(-W / 2 + rT, top);
  path.quadraticCurveTo(-W / 2, top, -W / 2, top - rT);
  path.lineTo(-W / 2, y0 + rB);
  path.quadraticCurveTo(-W / 2, y0, -W / 2 + rB, y0);
}

/** the part of a non-indexed geometry drawn with one material index */
function part(g: THREE.BufferGeometry, mi: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const parts: number[] = [];
    for (const gr of g.groups) {
      if (gr.materialIndex !== mi) continue;
      for (let i = gr.start; i < gr.start + gr.count; i++) for (let k = 0; k < a.itemSize; k++) parts.push(a.array[i * a.itemSize + k]);
    }
    out.setAttribute(name, new THREE.Float32BufferAttribute(parts, a.itemSize));
  }
  return out;
}

const geoCache = new Map<Shape, THREE.BufferGeometry>();
/** the paddle along +y from the grip (y 0), face normal along +x; groups: face, guard (rim, collar, butt), grip */
function paddleGeometry(shape: Shape): THREE.BufferGeometry {
  const hit = geoCache.get(shape);
  if (hit) return hit;
  const S = SHAPES[shape];
  const y0 = S.handle - 0.008;
  const sh = new THREE.Shape();
  outline(sh, S.W, y0, S.top, S.rT, S.rB);
  const depth = 0.013;
  const face = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0026, bevelSegments: 2, curveSegments: 8 });
  // the faces' texture across the outline (u across, v from the throat to the top)
  const p = face.getAttribute('position');
  const uv = face.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + S.W / 2) / S.W, (p.getY(i) - y0) / (S.top - y0));
  face.translate(0, 0, -depth / 2);
  face.rotateY(Math.PI / 2);
  const caps = part(face, 0);
  const rim = part(face, 1);
  const cyl = (r0: number, r1: number, h: number, y: number, flat: number, open = false) => {
    const c = new THREE.CylinderGeometry(r0, r1, h, 8, 1, open);
    c.rotateY(Math.PI / 8);
    c.scale(flat, 1, 1);
    c.translate(0, y, 0);
    return c.toNonIndexed();
  };
  const collar = cyl(0.0186, 0.0178, 0.022, S.handle - 0.004, 0.86);
  const butt = cyl(0.0188, 0.0188, 0.011, -0.0015, 0.82);
  const handle = cyl(0.0166, 0.0172, S.handle, S.handle / 2, 0.78, true);
  const guard = mergeGeometries([rim, collar, butt]);
  const g = mergeGeometries([caps, guard!, handle], true)!;
  face.dispose();
  geoCache.set(shape, g);
  return g;
}

/** a canvas, or null where there is none (the tools run the characters in Node with a stub) */
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    if (!x || typeof x.fillRect !== 'function' || typeof x.createLinearGradient !== 'function') return null;
    return [c, x];
  } catch {
    return null;
  }
}
const css = (hex: number, a = 1) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

/**
 * The invented mark (two slanted chevrons pointing up, as the shirts' in outfit.ts), centred on (0, 0), `s` across, in
 * a drawing space with y up.
 */
function markPath(x: CanvasRenderingContext2D, s: number) {
  const k = s / 0.88;
  for (const oy of [0.17, -0.15]) {
    const w = 0.44;
    const lo = oy - 0.78 * w;
    const pts: [number, number][] = [
      [-w, lo - 0.09],
      [0, oy - 0.09],
      [w, lo - 0.09],
      [w, lo + 0.09],
      [0, oy + 0.09],
      [-w, lo + 0.09],
    ];
    x.beginPath();
    pts.forEach(([px, py], i) => {
      const X = (px + 0.22 * py) * k;
      const Y = py * k;
      if (i) x.lineTo(X, Y);
      else x.moveTo(X, Y);
    });
    x.closePath();
    x.fill();
  }
}

/** a little of the weave: R the relief, G the roughness (shared by every face, repeated across it) */
let weave: THREE.Texture | null = null;
function weaveTexture(): THREE.Texture | null {
  if (weave) return weave;
  const cv = canvas(64, 64);
  if (!cv) return null;
  const [c, x] = cv;
  const img = x.createImageData(64, 64);
  // 2 × 2 twill: tows 8 px wide, over two and under two, stepping one along each row; a little grit on top
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let j = 0; j < 64; j++)
    for (let i = 0; i < 64; i++) {
      const ti = Math.floor(i / 8);
      const tj = Math.floor(j / 8);
      const over = (ti + tj) % 4 < 2;
      const f = over ? (i % 8) / 7 : (j % 8) / 7;
      const h = 0.55 + 0.35 * Math.sin(f * Math.PI) * (over ? 1 : 0.8) + (rnd() - 0.5) * 0.12;
      const r = over ? 0.48 : 0.6;
      const o = (j * 64 + i) * 4;
      img.data[o] = Math.max(0, Math.min(255, h * 255));
      img.data[o + 1] = Math.max(0, Math.min(255, (r + (rnd() - 0.5) * 0.1) * 255));
      img.data[o + 2] = 0;
      img.data[o + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // (tows about 4 mm wide: a 12K-style weave that still shows in a close-up)
  t.repeat.set(6, 8.5);
  weave = t;
  return t;
}

/** the overgrip's wrap (grey: the grip's colour tints it): the spiral of overlaps and its perforations */
let overgrip: THREE.Texture | null = null;
function overgripTexture(): THREE.Texture | null {
  if (overgrip) return overgrip;
  const cv = canvas(64, 256);
  if (!cv) return null;
  const [c, x] = cv;
  const img = x.createImageData(64, 256);
  for (let j = 0; j < 256; j++)
    for (let i = 0; i < 64; i++) {
      const u = i / 64;
      const v = j / 256;
      // seven turns along the handle
      const f = (u + v * 7) % 1;
      let k = 0.86 + 0.08 * Math.sin(f * Math.PI);
      if (f < 0.07) k = 0.45 + f * 5;
      // perforations in rows along the wrap
      const pu = (f * 6) % 1;
      const pv = (v * 70) % 1;
      if (f > 0.15 && f < 0.95 && Math.hypot(pu - 0.5, (pv - 0.5) * 0.6) < 0.16) k *= 0.7;
      const o = (j * 64 + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = k * 255;
      img.data[o + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  overgrip = t;
  return t;
}

/** The face's art: base, the sweep and its line, the inset outline, the mark, and the edge guard's band round it. */
function faceTexture(shape: Shape, look: PaddleLook, guard: number): THREE.Texture | null {
  const S = SHAPES[shape];
  const y0 = S.handle - 0.008;
  const Hf = S.top - y0;
  const cv = canvas(256, 512);
  if (!cv) return null;
  const [c, x] = cv;
  // draw in metres on the face: x across (0 in the middle), y up from the grip
  x.setTransform(256 / S.W, 0, 0, -512 / Hf, 128, (512 * S.top) / Hf);
  const base = look.face === 'carbon' ? 0x26282c : look.face === 'light' ? 0xe6e9ec : look.graphic;
  x.fillStyle = css(base);
  x.fillRect(-S.W, y0 - 0.02, S.W * 2, Hf + 0.04);
  // a soft sheen band across the carbon (the weave catches the light in stripes)
  if (look.face === 'carbon') {
    const b = x.createLinearGradient(-S.W / 2, y0, S.W / 2, S.top);
    b.addColorStop(0, 'rgba(255,255,255,0)');
    b.addColorStop(0.55, 'rgba(255,255,255,0.05)');
    b.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = b;
    x.fillRect(-S.W, y0 - 0.02, S.W * 2, Hf + 0.04);
  }
  if (look.face === 'glass') {
    const b = x.createLinearGradient(0, y0, 0, S.top);
    b.addColorStop(0, 'rgba(0,0,0,0.28)');
    b.addColorStop(0.6, 'rgba(0,0,0,0)');
    b.addColorStop(1, 'rgba(255,255,255,0.08)');
    x.fillStyle = b;
    x.fillRect(-S.W, y0 - 0.02, S.W * 2, Hf + 0.04);
  }
  // the sweep: a wide band rising across the lower half, and its thin line
  const sweep = look.face === 'glass' ? 0x14161a : look.graphic;
  const band = (yl: number, yr: number, w: number, col: string) => {
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(-S.W, yl);
    x.lineTo(S.W, yr);
    x.lineTo(S.W, yr + w);
    x.lineTo(-S.W, yl + w);
    x.closePath();
    x.fill();
  };
  band(y0 + 0.02, y0 + 0.13, 0.055, css(sweep));
  band(y0 + 0.085, y0 + 0.195, 0.006, css(look.graphic2));
  band(y0 + 0.1, y0 + 0.21, 0.0025, css(look.graphic2, 0.8));
  // the inset outline, inside the guard
  x.strokeStyle = css(look.graphic2, 0.9);
  x.lineWidth = 0.0012;
  x.beginPath();
  outline(x, S.W - 0.03, y0 + 0.015, S.top - 0.015, Math.max(0.01, S.rT - 0.012), Math.max(0.01, S.rB - 0.012));
  x.stroke();
  // the mark, at the throat and small near the top
  x.fillStyle = css(look.face === 'light' ? look.graphic : 0xf2f2f2);
  x.save();
  x.translate(0, y0 + 0.045);
  markPath(x, 0.05);
  x.restore();
  x.fillStyle = css(look.graphic2);
  x.save();
  x.translate(0, S.top - 0.035);
  markPath(x, 0.022);
  x.restore();
  // the edge guard's band on the face (about 7 mm in from the rim)
  x.strokeStyle = css(guard);
  x.lineWidth = 0.014;
  x.beginPath();
  outline(x, S.W, y0, S.top, S.rT, S.rB);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** the paddles' materials by look (the last few, oldest dropped: a doubles match shows four) */
const matCache = new Map<string, THREE.MeshStandardMaterial[]>();
const MAT_KEEP = 5;
/**
 * A player's paddle (see the header). `look` absent: a plain one in `color` with the guard in `edge` (the tools' kits).
 */
export function paddleMesh(color: number, edge: number, look?: PaddleLook): THREE.Group {
  const L: PaddleLook = look ?? { shape: 'standard', face: 'glass', graphic: color, graphic2: 0xffffff, grip: 0x1d1f24 };
  const key = JSON.stringify([L, edge]);
  let mats = matCache.get(key);
  if (mats) {
    // (most recent last)
    matCache.delete(key);
    matCache.set(key, mats);
  } else {
    const map = faceTexture(L.shape, L, edge);
    const wv = weaveTexture();
    const og = overgripTexture();
    const faceMat = new THREE.MeshStandardMaterial({
      map,
      color: map ? 0xffffff : color,
      roughness: L.face === 'carbon' ? 0.72 : 0.55,
      metalness: 0,
      ...(wv ? { bumpMap: wv, bumpScale: L.face === 'carbon' ? 1.8 : 0.8, roughnessMap: wv } : {}),
    });
    const guardMat = new THREE.MeshStandardMaterial({ color: edge, roughness: 0.4, metalness: 0 });
    const gripMat = new THREE.MeshStandardMaterial({ color: L.grip, map: og, roughness: 0.82, ...(og ? { bumpMap: og, bumpScale: 1.2 } : {}) });
    mats = [faceMat, guardMat, gripMat];
    matCache.set(key, mats);
    while (matCache.size > MAT_KEEP) {
      const [k0, old] = matCache.entries().next().value!;
      old[0].map?.dispose();
      for (const m of old) m.dispose();
      matCache.delete(k0);
    }
  }
  const m = new THREE.Mesh(paddleGeometry(L.shape), mats);
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// ------------------------------------------------------------------ the ball

/** where the 40 holes are: per half, one at the pole, 7 round it and 12 nearer the seam; the halves turned apart */
function holes(): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const ring = (polar: number, n: number, off: number, south: boolean) => {
    for (let i = 0; i < n; i++) {
      const a = ((i + off) / n) * Math.PI * 2;
      const t = south ? Math.PI - polar : polar;
      out.push(new THREE.Vector3(-Math.cos(a) * Math.sin(t), Math.cos(t), Math.sin(a) * Math.sin(t)));
    }
  };
  for (const s of [false, true]) {
    ring(0, 1, 0, s);
    ring(0.7, 7, s ? 0.5 : 0, s);
    ring(1.27, 12, s ? 0.5 : 0.25, s);
  }
  return out;
}

/** the ball's colour and its relief (white outside the holes, black in them; also what glows) */
function ballTextures(): { map: THREE.Texture; bump: THREE.Texture } | null {
  const W = 512;
  const H = 256;
  const cv = canvas(W, H);
  const cb = canvas(W / 2, H / 2);
  if (!cv || !cb) return null;
  const [c, x] = cv;
  const [c2, x2] = cb;
  const img = x.createImageData(W, H);
  const img2 = x2.createImageData(W / 2, H / 2);
  const hs = holes();
  const R = 0.092; // a hole's angular radius (about 7 mm across on a 74 mm ball)
  // the printed mark: two on opposite sides, between the rings
  const marks = [new THREE.Vector3(), new THREE.Vector3()];
  marks[0].set(-Math.cos(0.3) * Math.sin(0.98), Math.cos(0.98), Math.sin(0.3) * Math.sin(0.98));
  marks[1].set(-Math.cos(0.3 + Math.PI) * Math.sin(Math.PI - 0.98), Math.cos(Math.PI - 0.98), Math.sin(0.3 + Math.PI) * Math.sin(Math.PI - 0.98));
  const frames = marks.map((m) => {
    const e1 = new THREE.Vector3(0, 1, 0).cross(m).normalize();
    const e2 = m.clone().cross(e1);
    return { m, e1, e2 };
  });
  const base = [220, 255, 60];
  const d = new THREE.Vector3();
  // (each row only looks at the holes whose ring is near it)
  const polar = hs.map((hc) => Math.acos(Math.max(-1, Math.min(1, hc.y))));
  let rowTh = -1;
  let cand: THREE.Vector3[] = hs;
  const relief = (px: number, py: number, w: number, h: number) => {
    const th = ((py + 0.5) / h) * Math.PI;
    if (th !== rowTh) {
      rowTh = th;
      cand = hs.filter((_, k) => Math.abs(polar[k] - th) < R + 0.06);
    }
    const ph = ((px + 0.5) / w) * Math.PI * 2;
    d.set(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
    let near = -1;
    for (const hc of cand) near = Math.max(near, d.dot(hc));
    return { best: near > -1 ? Math.acos(Math.min(1, near)) : 9, th };
  };
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const { best, th } = relief(i, j, W, H);
      let col = base.slice();
      // the moulding seam round the middle
      const seam = Math.abs(th - Math.PI / 2);
      if (seam < 0.012) col = col.map((v, k) => v * (k === 2 ? 1 : 0.86));
      // a hole: the wall in shadow inside, a light rim round it
      if (best < R) {
        const f = best / R;
        const k = 0.36 + 0.2 * f * f;
        col = [base[0] * k, base[1] * k, base[2] * k * 0.6];
      } else if (best < R + 0.025) {
        const f = 1 - (best - R) / 0.025;
        col = col.map((v) => v + (255 - v) * 0.35 * f);
      }
      // the printed mark
      for (const fr of frames) {
        const dz = d.dot(fr.m);
        if (dz < 0.9) continue;
        const qx = d.dot(fr.e1) / 0.11;
        const qy = d.dot(fr.e2) / 0.11;
        const sx = qx - 0.22 * qy;
        const ax = Math.abs(sx);
        const dd = Math.max(Math.min(Math.abs(qy - 0.17 + 0.78 * ax) - 0.09, Math.abs(qy + 0.15 + 0.78 * ax) - 0.09), ax - 0.44);
        if (dd < 0) col = [28, 32, 26];
      }
      const o = (j * W + i) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  for (let j = 0; j < H / 2; j++)
    for (let i = 0; i < W / 2; i++) {
      const { best, th } = relief(i, j, W / 2, H / 2);
      let k = best < R ? 0.1 + 0.25 * Math.pow(best / R, 3) : 1;
      if (Math.abs(th - Math.PI / 2) < 0.012) k *= 0.85;
      const o = (j * (W / 2) + i) * 4;
      img2.data[o] = img2.data[o + 1] = img2.data[o + 2] = k * 255;
      img2.data[o + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  x2.putImageData(img2, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(c2);
  return { map, bump };
}

/**
 * The ball (radius r): optic yellow plastic, a little satin, with its own glow (neon plastic stays bright in the
 * shade; none in the holes).
 */
export function ballMesh(r: number): THREE.Mesh {
  const t = ballTextures();
  const mat = new THREE.MeshStandardMaterial({
    color: t ? 0xffffff : 0xdcff3c,
    map: t?.map ?? null,
    roughness: 0.42,
    emissive: 0x6a7d00,
    emissiveIntensity: 0.45,
    ...(t ? { bumpMap: t.bump, bumpScale: 2.5, emissiveMap: t.bump } : {}),
  });
  return new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat);
}
