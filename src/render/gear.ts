// The gear: a pro's padel paddle and a padel ball, as real as a phone allows.
//
// Paddle: solid, no strings: a head about 26 cm wide (round, teardrop or diamond), 45.5 cm long with the handle,
// 38 mm thick, its face drilled through with a staggered grid of 13 mm holes and the open heart of the bridge at the
// throat, the frame round the rim in the guard's colour, a handle wrapped in overgrip, a butt cap and the wrist cord.
// The face carries its graphics and an invented mark, over a carbon weave or fibreglass, with the grit as relief.
// One geometry per shape for every player; three draw calls a paddle, as before. The middle of the face (the contact
// point the arm aims, 0.255 m up from the grip) is where it was: the hand holds the handle 5 cm up from the butt.
//
// Ball: optic yellow felt, the white seam's curve round it (it shows the ball turning), a little fuzz at its edge
// against the light. It keeps a touch of glow and its drawn size, which make it readable on a phone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** How a player's paddle looks. Colours sRGB hex. */
export interface PaddleLook {
  /** the head: diamond (elongated, the balance high), round (standard) or teardrop (hybrid) */
  shape: 'elongated' | 'standard' | 'hybrid';
  /** raw carbon (dark, weave showing), fibreglass in the graphic's colour, or a light face */
  face: 'carbon' | 'glass' | 'light';
  /** the sweep across the face */
  graphic: number;
  /** its thin line, the inset outline and the mark */
  graphic2: number;
  /** the overgrip (and the wrist cord) */
  grip: number;
}

/**
 * The shapes (m, y up from the grip): the head's half width, where it is widest and its top; the butt and the top of
 * the handle; how far the widest point sits up the head (0.5 an oval, more: the balance high)
 */
const SHAPES = {
  elongated: { hw: 0.128, mid: 0.29, top: 0.405, base: 0.118, high: 0.68 },
  standard: { hw: 0.13, mid: 0.255, top: 0.405, base: 0.11, high: 0.5 },
  hybrid: { hw: 0.13, mid: 0.27, top: 0.405, base: 0.113, high: 0.58 },
};
type Shape = keyof typeof SHAPES;
/** the handle: from the butt to the throat, its half width at the throat; the thickness of the paddle */
const BUTT = -0.05;
const THROAT = 0.07;
const NECK = 0.021;
const THICK = 0.038;
/** the holes: radius, spacing (staggered rows), how far in from the rim they start */
const HOLE = { r: 0.0065, gap: 0.031, margin: 0.024 };
/** the face texture spans this much more than the paddle, each side (its edge columns are the foam of the holes' walls) */
const TEX_PAD = 0.012;

/**
 * The outline (counter-clockwise, from the right of the throat): two arms rise from the handle and open into the head,
 * whose half width at height y is a superellipse widest at `mid` (the lower part of the head a little fuller for a
 * round one, tapering for a diamond).
 */
function outlinePts(shape: Shape): [number, number][] {
  const S = SHAPES[shape];
  const out: [number, number][] = [];
  const lo = S.mid - S.base;
  const hi = S.top - S.mid;
  const halfW = (y: number) => {
    const d = y < S.mid ? (S.mid - y) / lo : (y - S.mid) / hi;
    const p = y < S.mid ? 2.2 - (S.high - 0.5) * 2.4 : 2.4;
    return S.hw * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, d), p)), 1 / p);
  };
  // (the arms leave the head where it is this far up from its base)
  const join = S.base + lo * 0.32;
  out.push([NECK, THROAT]);
  // the right arm: a soft curve out from the neck to the head
  for (let i = 1; i < 6; i++) {
    const u = i / 6;
    const y = THROAT + (join - THROAT) * u;
    const w = NECK + (halfW(join) - NECK) * (u * u * (3 - 2 * u)) * 0.92 + (halfW(join) - NECK) * 0.08 * u;
    out.push([w, y]);
  }
  const side = 26;
  // the right side from the join to the top, the top's curve, the left side down
  for (let i = 0; i <= side; i++) {
    const u = i / side;
    const y = join + (S.top - join) * (1 - Math.cos(u * Math.PI * 0.5));
    out.push([halfW(Math.min(y, S.top - 1e-4)), y]);
  }
  for (let i = side; i >= 0; i--) {
    const u = i / side;
    const y = join + (S.top - join) * (1 - Math.cos(u * Math.PI * 0.5));
    out.push([-halfW(Math.min(y, S.top - 1e-4)), y]);
  }
  for (let i = 5; i >= 1; i--) {
    const u = i / 6;
    const y = THROAT + (join - THROAT) * u;
    const w = NECK + (halfW(join) - NECK) * (u * u * (3 - 2 * u)) * 0.92 + (halfW(join) - NECK) * 0.08 * u;
    out.push([-w, y]);
  }
  out.push([-NECK, THROAT]);
  return dedupe(out);
}
function dedupe(p: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const q of p) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 1e-4) out.push(q);
  }
  return out;
}

/** inside a closed polygon (even-odd) */
function inside(p: [number, number][], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** distance from a point to a closed polygon's edge */
function edgeDist(p: [number, number][], x: number, y: number): number {
  let d = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, ay] = p[j];
    const [bx, by] = p[i];
    const ex = bx - ax;
    const ey = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t));
  }
  return d;
}

/** the open heart of the bridge: a rounded triangle between the arms, under the head */
function heartPts(shape: Shape): [number, number][] {
  const S = SHAPES[shape];
  const lo = S.mid - S.base;
  const yb = THROAT + 0.028;
  const yt = S.base + lo * 0.2;
  const w = 0.03;
  const pts: [number, number][] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // a teardrop: point down at the neck, round at the top
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const y = (yb + yt) / 2 + ((yt - yb) / 2) * sn;
    const k = (sn + 1) / 2;
    pts.push([c * w * Math.pow(k, 0.7), y]);
  }
  return pts;
}

/** the holes' centres: staggered rows from the middle of the head, at least `margin` in from the rim, clear of the heart */
function holeCentres(shape: Shape): [number, number][] {
  const S = SHAPES[shape];
  const out = outlinePts(shape);
  const hy = Math.max(...heartPts(shape).map((p) => p[1]));
  const res: [number, number][] = [];
  const dy = HOLE.gap * 0.87;
  for (let k = -12; k <= 12; k++) {
    const y = S.mid + k * dy;
    const off = (Math.abs(k) % 2) * HOLE.gap * 0.5;
    for (let i = -6; i <= 6; i++) {
      const x = i * HOLE.gap + off;
      if (y < hy + HOLE.margin * 0.8) continue;
      if (!inside(out, x, y) || edgeDist(out, x, y) < HOLE.margin) continue;
      res.push([x, y]);
    }
  }
  return res;
}

/** the triangles of one material group of a geometry, split by a test on each triangle's centroid (x, y) */
function groupSplit(g: THREE.BufferGeometry, mi: number, test: (x: number, y: number) => boolean): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const names = ['position', 'normal', 'uv'] as const;
  const a: Record<string, number[]> = { position: [], normal: [], uv: [] };
  const b: Record<string, number[]> = { position: [], normal: [], uv: [] };
  const p = g.getAttribute('position');
  for (const gr of g.groups) {
    if (gr.materialIndex !== mi) continue;
    for (let t = gr.start; t < gr.start + gr.count; t += 3) {
      const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
      const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
      const to = test(cx, cy) ? a : b;
      for (const n of names) {
        const at = g.getAttribute(n) as THREE.BufferAttribute;
        for (let v = t; v < t + 3; v++) for (let k = 0; k < at.itemSize; k++) to[n].push(at.array[v * at.itemSize + k]);
      }
    }
  }
  const mk = (r: Record<string, number[]>) => {
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.Float32BufferAttribute(r.position, 3));
    o.setAttribute('normal', new THREE.Float32BufferAttribute(r.normal, 3));
    o.setAttribute('uv', new THREE.Float32BufferAttribute(r.uv, 2));
    return o;
  };
  return [mk(a), mk(b)];
}

const geoCache = new Map<Shape, THREE.BufferGeometry>();
/**
 * The paddle along +y from the grip (y 0), face normal along +x; groups: the face (both faces and the walls of the
 * holes, which show the foam core), the guard (the frame round the rim, the collar, the butt cap), the grip (the
 * overgrip and the wrist cord).
 */
function paddleGeometry(shape: Shape): THREE.BufferGeometry {
  const hit = geoCache.get(shape);
  if (hit) return hit;
  const S = SHAPES[shape];
  const ol = outlinePts(shape);
  const sh = new THREE.Shape(ol.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const [cx, cy] of holeCentres(shape)) {
    // (hexagons: round enough at 13 mm, and few triangles)
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * HOLE.r, cy + Math.sin(a) * HOLE.r));
    }
    sh.holes.push(new THREE.Path(pts));
  }
  sh.holes.push(new THREE.Path(heartPts(shape).map(([x, y]) => new THREE.Vector2(x, y))));
  // (no bevel: at 50 holes a side it would triple the holes' walls, and the frame's band reads as the rounded rim)
  const ex = new THREE.ExtrudeGeometry(sh, { depth: THICK, bevelEnabled: false, curveSegments: 4 });
  const flat = ex.index ? ex.toNonIndexed() : ex;
  if (flat !== ex) ex.dispose();
  // the faces' texture across the outline (u across, v from the butt to the top)
  const span = 2 * (S.hw + TEX_PAD);
  const p = flat.getAttribute('position');
  const uv = flat.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + span / 2) / span, (p.getY(i) - BUTT) / (S.top - BUTT));
  const [caps] = groupSplit(flat, 0, () => true);
  // the sides: the rim on the outline (the guard) and the walls of the holes and of the heart (the foam: the
  // texture's edge column, which is the core's colour)
  const [walls, rim] = groupSplit(flat, 1, (x, y) => edgeDist(ol, x, y) > 0.003);
  const wu = walls.getAttribute('uv');
  for (let i = 0; i < wu.count; i++) wu.setX(i, 0.004);
  const place = (gg: THREE.BufferGeometry) => gg.translate(0, 0, -THICK / 2).rotateY(Math.PI / 2);
  for (const gg of [caps, walls, rim]) place(gg);
  const cyl = (r0: number, r1: number, h: number, y: number, fx: number, fz: number, open = false) => {
    const c = new THREE.CylinderGeometry(r0, r1, h, 8, 1, open);
    c.rotateY(Math.PI / 8);
    c.scale(fx, 1, fz);
    c.translate(0, y, 0);
    return c.toNonIndexed();
  };
  // (the handle with its overgrip: about 30 × 25 mm, the long side across the face)
  const collar = cyl(0.0172, 0.0166, 0.018, THROAT - 0.006, 0.86, 1.06);
  const butt = cyl(0.018, 0.018, 0.012, BUTT + 0.004, 0.84, 1.04);
  const handle = cyl(0.0156, 0.0162, THROAT - BUTT, (THROAT + BUTT) / 2, 0.82, 1.02, true);
  // the wrist cord: from the butt round the wrist (where the hand's pose puts the wrist in the paddle's frame: about
  // 5 cm off the face's normal side and 4 cm under the grip; the forearm leaves it along (0.78, −0.62))
  const loop: THREE.Vector3[] = [new THREE.Vector3(0, BUTT - 0.004, 0)];
  const C = new THREE.Vector3(0.056, -0.046, 0);
  const e1 = new THREE.Vector3(0.62, 0.78, 0).multiplyScalar(0.04);
  const e2 = new THREE.Vector3(0, 0, 0.04);
  for (let i = 0; i < 10; i++) {
    const a = Math.PI + 0.35 + (i / 9) * (Math.PI * 2 - 0.7);
    loop.push(C.clone().addScaledVector(e1, Math.cos(a)).addScaledVector(e2, Math.sin(a)));
  }
  const cord = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true), 16, 0.0026, 4, true).toNonIndexed();
  const face = mergeGeometries([caps, walls])!;
  const guard = mergeGeometries([rim, collar, butt])!;
  const grip = mergeGeometries([handle, cord])!;
  const g = mergeGeometries([face, guard, grip], true)!;
  flat.dispose();
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
  // (tows about 4 mm wide over the 28 × 46 cm the face texture spans: a 12K-style weave that still shows close up)
  t.repeat.set(8, 13);
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

/** The face's art: base, the sweep and its line, the inset outline, the mark, the frame's band round the rim. */
function faceTexture(shape: Shape, look: PaddleLook, guard: number): THREE.Texture | null {
  const S = SHAPES[shape];
  const span = 2 * (S.hw + TEX_PAD);
  const Hf = S.top - BUTT;
  const cv = canvas(256, 512);
  if (!cv) return null;
  const [c, x] = cv;
  const ol = outlinePts(shape);
  const trace = (k: number, dy = 0) => {
    // the outline scaled about the middle of the head (k < 1: an inset line)
    x.beginPath();
    ol.forEach(([px, py], i) => {
      const X = px * k;
      const Y = S.mid + (py - S.mid) * k + dy;
      if (i) x.lineTo(X, Y);
      else x.moveTo(X, Y);
    });
    x.closePath();
  };
  // draw in metres on the face: x across (0 in the middle), y up from the grip
  x.setTransform(256 / span, 0, 0, -512 / Hf, 128, (512 * S.top) / Hf);
  const base = look.face === 'carbon' ? 0x26282c : look.face === 'light' ? 0xe6e9ec : look.graphic;
  x.fillStyle = css(base);
  x.fillRect(-span, BUTT - 0.02, span * 2, Hf + 0.04);
  // a soft sheen band across the carbon (the weave catches the light in stripes)
  if (look.face === 'carbon') {
    const b = x.createLinearGradient(-S.hw, S.base, S.hw, S.top);
    b.addColorStop(0, 'rgba(255,255,255,0)');
    b.addColorStop(0.55, 'rgba(255,255,255,0.05)');
    b.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = b;
    x.fillRect(-span, BUTT, span * 2, Hf);
  }
  if (look.face === 'glass') {
    const b = x.createLinearGradient(0, S.base, 0, S.top);
    b.addColorStop(0, 'rgba(0,0,0,0.28)');
    b.addColorStop(0.6, 'rgba(0,0,0,0)');
    b.addColorStop(1, 'rgba(255,255,255,0.08)');
    x.fillStyle = b;
    x.fillRect(-span, BUTT, span * 2, Hf);
  }
  // the sweep: a wide band rising across the lower half of the head, and its thin lines
  const sweep = look.face === 'glass' ? 0x14161a : look.graphic;
  const band = (yl: number, yr: number, w: number, col: string) => {
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(-span, yl);
    x.lineTo(span, yr);
    x.lineTo(span, yr + w);
    x.lineTo(-span, yl + w);
    x.closePath();
    x.fill();
  };
  band(S.base + 0.0, S.base + 0.1, 0.06, css(sweep));
  band(S.base + 0.07, S.base + 0.17, 0.006, css(look.graphic2));
  band(S.base + 0.085, S.base + 0.185, 0.0025, css(look.graphic2, 0.8));
  // the inset outline, inside the frame
  x.strokeStyle = css(look.graphic2, 0.9);
  x.lineWidth = 0.0012;
  trace(0.86);
  x.stroke();
  // the mark, big over the sweet spot's top and small at the throat
  x.fillStyle = css(look.face === 'light' ? look.graphic : 0xf2f2f2);
  x.save();
  x.translate(0, S.top - 0.045);
  markPath(x, 0.05);
  x.restore();
  x.fillStyle = css(look.graphic2);
  x.save();
  x.translate(0, THROAT + 0.02);
  markPath(x, 0.018);
  x.restore();
  // the frame's band on the face (about 8 mm in from the rim)
  x.strokeStyle = css(guard);
  x.lineWidth = 0.016;
  trace(1);
  x.stroke();
  // the left edge column: the foam core the holes show (pale grey EVA)
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.fillStyle = '#c9ccd0';
  x.fillRect(0, 0, 3, 512);
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

/**
 * The ball's felt: optic yellow, the fibres' grain, and the seam (a white curve of a tennis ball's shape: the two
 * dumbbells' edge) that shows it turning. R G B: colour; a second, small map: the fuzz's relief (bump).
 */
function ballTextures(): { map: THREE.Texture; bump: THREE.Texture } | null {
  const W = 256;
  const H = 128;
  const cv = canvas(W, H);
  const cb = canvas(W / 2, H / 2);
  if (!cv || !cb) return null;
  const [c, x] = cv;
  const [c2, x2] = cb;
  const img = x.createImageData(W, H);
  const img2 = x2.createImageData(W / 2, H / 2);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // the seam: the curve of a tennis ball (the classic parametrisation), sampled
  const seam: THREE.Vector3[] = [];
  const a = 0.44;
  for (let i = 0; i < 160; i++) {
    const t = (i / 160) * Math.PI * 2;
    const v = new THREE.Vector3((1 - a) * Math.cos(t) + a * Math.cos(3 * t), (1 - a) * Math.sin(t) - a * Math.sin(3 * t), 2 * Math.sqrt(a * (1 - a)) * Math.sin(2 * t));
    seam.push(v.normalize());
  }
  const d = new THREE.Vector3();
  const near = (px: number, py: number, w: number, h: number) => {
    const th = ((py + 0.5) / h) * Math.PI;
    const ph = ((px + 0.5) / w) * Math.PI * 2;
    d.set(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
    let best = 9;
    for (const q of seam) best = Math.min(best, d.distanceToSquared(q));
    return Math.sqrt(best);
  };
  const base = [214, 236, 52];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const sd = near(i, j, W, H);
      const fuzz = 0.9 + rnd() * 0.16;
      let col = base.map((v) => v * fuzz);
      // the seam: a white rubber line ~4 mm wide, a little furrow each side
      if (sd < 0.045) col = [236, 238, 226];
      else if (sd < 0.07) col = col.map((v) => v * 0.86);
      const o = (j * W + i) * 4;
      img.data[o] = Math.min(255, col[0]);
      img.data[o + 1] = Math.min(255, col[1]);
      img.data[o + 2] = Math.min(255, col[2]);
      img.data[o + 3] = 255;
    }
  for (let j = 0; j < H / 2; j++)
    for (let i = 0; i < W / 2; i++) {
      const sd = near(i, j, W / 2, H / 2);
      let k = 0.75 + rnd() * 0.25;
      if (sd < 0.045) k = 0.55;
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
 * The ball (radius r): yellow felt, matte, with the fuzz brighter at its edge against the light (a sheen term) and a
 * touch of its own glow (fluorescent dye stays bright in the shade).
 */
export function ballMesh(r: number): THREE.Mesh {
  const t = ballTextures();
  const mat = new THREE.MeshStandardMaterial({
    color: t ? 0xffffff : 0xd6ec34,
    map: t?.map ?? null,
    roughness: 0.92,
    emissive: 0x5d6e00,
    emissiveIntensity: 0.5,
    ...(t ? { bumpMap: t.bump, bumpScale: 1.2 } : {}),
  });
  mat.onBeforeCompile = (s) => {
    // the felt's fuzz: lit fibres stand out at the silhouette
    s.fragmentShader = s.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
        float rimF = pow( 1.0 - saturate( dot( normal, geometryViewDir ) ), 2.5 );
        outgoingLight += diffuseColor.rgb * rimF * 0.35;
      }
      #include <opaque_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => 'pb-felt';
  return new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
}
