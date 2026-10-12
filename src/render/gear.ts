// The gear: a pro's tennis racket and a tennis ball, as real as a phone allows.
//
// Racket: 68.5 cm long, an oval head 32 × 25 cm (about 100 in² of string bed), a beam 25 mm deep and 13 mm wide, the
// open throat (two arms from the handle into the head, the bridge under the string bed), an octagonal handle wrapped in
// overgrip with its butt cap, and the strings: 16 mains and 19 crosses worked out per pixel (no texture), the invented
// mark stencilled on them. Three draw calls a racket (the frame, the grip, the strings), as the padel paddle had.
// The kits keep their field names (PaddleLook, paddle, paddleEdge: they mean the racket now): `graphic` the frame's
// paint, `graphic2` its accent, `edge` the bumper, the cap and the throat's trim, `grip` the overgrip, `face` the finish
// (raw carbon, painted, or a white frame) and `shape` the head (extended, standard or compact).
// The racket's frame: +y from the hand along the racket (the hand holds it at y = 0, its heel by the butt cap), the
// face's normal +x, across the head +z. The sweet spot (RACKET.face, a little under the middle of the head) is what
// the arm's IK takes to the ball (chars.ts, keyposes.ts).
//
// Ball: optic yellow felt, the white seam's curve round it (it shows the ball turning), a little fuzz at its edge
// against the light. It keeps a touch of glow and its drawn size, which make it readable on a phone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** How a player's racket looks (the old paddle's fields, kits.ts). Colours sRGB hex. */
export interface PaddleLook {
  /** the head: extended (a little longer and narrower), standard (100 in²) or compact (98 in², a player's frame) */
  shape: 'elongated' | 'standard' | 'hybrid';
  /** the frame's finish: raw carbon (black, the paint as an accent), painted in `graphic`, or a white frame */
  face: 'carbon' | 'glass' | 'light';
  /** the frame's main paint */
  graphic: number;
  /** its accent (the bands at the sides of the head) and, on a white frame, the stencil */
  graphic2: number;
  /** the overgrip */
  grip: number;
}

/**
 * The racket's measures (m, along +y from where the hand holds it): the butt (its cap a hand's heel below the grip),
 * the top of the handle (19 cm of grip), the head's outer bottom and top (32 cm), the head's outer half width, the
 * frame's beam (half its depth along the face's normal, half its width in the face's plane), and the sweet spot.
 */
export const RACKET = { butt: -0.06, gripTop: 0.13, headBase: 0.305, top: 0.625, halfW: 0.125, beam: 0.0125, rim: 0.0065, face: 0.44 };
/** the head's shapes: its length and half width (m), how square the oval is, how much narrower towards the throat */
const HEADS = {
  elongated: { len: 0.325, hw: 0.122, p: 2.2, taper: 0.12 },
  standard: { len: 0.32, hw: 0.125, p: 2.3, taper: 0.1 },
  hybrid: { len: 0.315, hw: 0.124, p: 2.35, taper: 0.09 },
};
type Shape = keyof typeof HEADS;
/** the strings: the mains every `main` m across the bed, the crosses every `cross` m along it, `w` m thick */
const STRINGS = { main: 0.0136, cross: 0.0165, w: 0.0014 };
/** the handle (with its overgrip): half its size across the face's normal and across the head (an elongated octagon) */
const HANDLE = { rx: 0.0135, rz: 0.0168 };

/** the head's centre line (half way through the beam) at angle a from the bottom (rad), in the head's plane (z, y) */
function headAt(shape: Shape, a: number, inset = 0): [number, number] {
  const H = HEADS[shape];
  const A = H.len / 2 - RACKET.rim - inset;
  const B = H.hw - RACKET.rim - inset;
  const s = Math.sin(a);
  const c = -Math.cos(a);
  const e = 2 / H.p;
  let z = Math.sign(s) * Math.pow(Math.abs(s), e);
  const y = Math.sign(c) * Math.pow(Math.abs(c), e);
  // (narrower towards the throat, where the arms come in)
  z *= 1 - H.taper * Math.pow(Math.max(0, -y), 1.5);
  return [z * B, RACKET.headBase + H.len / 2 + y * A];
}

/** a profile swept along a path: points (z, y) in the head's plane, each with its in-plane outward normal (nz, ny) */
function sweep(path: { z: number; y: number; nz: number; ny: number; u: number }[], closed: boolean, ht: number, hw: number, P: number[], N: number[], U: number[], I: number[]) {
  const K = 8;
  const base = P.length / 3;
  for (const q of path)
    for (let k = 0; k < K; k++) {
      const f = ((k + 0.5) / K) * Math.PI * 2;
      // (a rounded box: the beam's flat faces, rounded edges)
      const cx = Math.cos(f);
      const cn = Math.sin(f);
      const px = Math.sign(cx) * Math.pow(Math.abs(cx), 0.6) * ht;
      const pn = Math.sign(cn) * Math.pow(Math.abs(cn), 0.6) * hw;
      P.push(px, q.y + q.ny * pn, q.z + q.nz * pn);
      const gx = px / (ht * ht);
      const gn = pn / (hw * hw);
      const l = Math.hypot(gx, gn) || 1;
      N.push(gx / l, (q.ny * gn) / l, (q.nz * gn) / l);
      U.push(q.u, 0.5);
    }
  const n = path.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = base + i * K;
    const b = base + ((i + 1) % n) * K;
    for (let k = 0; k < K; k++) {
      const k1 = (k + 1) % K;
      I.push(a + k, b + k, b + k1, a + k, b + k1, a + k1);
    }
  }
}

const geoCache = new Map<Shape, { body: THREE.BufferGeometry; strings: THREE.BufferGeometry }>();
/**
 * The racket along +y from the hand, face normal along +x: the body (groups: the frame, i.e. the head, the throat's
 * arms, the butt cap and the grip's collar, uv.x saying where along the frame for its paint; and the overgrip) and the
 * string bed, apart (it casts no shadow: the strings let the light through).
 */
function racketGeometry(shape: Shape): { body: THREE.BufferGeometry; strings: THREE.BufferGeometry } {
  const hit = geoCache.get(shape);
  if (hit) return hit;
  const P: number[] = [];
  const N: number[] = [];
  const U: number[] = [];
  const I: number[] = [];
  // the head: its centre line round from the bottom, u 0 … 0.7
  const n = 64;
  const ring: { z: number; y: number; nz: number; ny: number; u: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const [z, y] = headAt(shape, a);
    const [z1, y1] = headAt(shape, a + 1e-3);
    const tz = z1 - z;
    const ty = y1 - y;
    const tl = Math.hypot(tz, ty) || 1;
    // (outward: the tangent turned clockwise, the path goes round anticlockwise seen from +x)
    ring.push({ z, y, nz: ty / tl, ny: -tz / tl, u: 0.7 * Math.min(a, Math.PI * 2 - a) / Math.PI });
  }
  // (the in-plane normal must point out of the head: check one)
  if (ring[n / 4].nz * ring[n / 4].z < 0) for (const q of ring) [q.nz, q.ny] = [-q.nz, -q.ny];
  sweep(ring, true, RACKET.beam, RACKET.rim, P, N, U, I);
  // the throat: two arms from the top of the handle into the head's lower sides (a cubic each), u 0.72 … 0.92
  const join = 0.29 * Math.PI;
  for (const sd of [1, -1]) {
    const [jz, jy] = headAt(shape, sd > 0 ? join : Math.PI * 2 - join);
    const [jz1, jy1] = headAt(shape, sd > 0 ? join + 1e-3 : Math.PI * 2 - join - 1e-3);
    const tl = Math.hypot(jz1 - jz, jy1 - jy);
    // (the head's tangent there, going up)
    const tz = ((jz1 - jz) / tl) * (sd > 0 ? 1 : 1);
    const ty = (jy1 - jy) / tl;
    const p0: [number, number] = [sd * 0.012, RACKET.gripTop + 0.012];
    const p1: [number, number] = [sd * 0.02, RACKET.gripTop + 0.07];
    const p2: [number, number] = [jz - tz * 0.06, jy - ty * 0.06];
    const p3: [number, number] = [jz, jy];
    const arm: { z: number; y: number; nz: number; ny: number; u: number }[] = [];
    const m = 14;
    for (let i = 0; i <= m; i++) {
      const t = i / m;
      const b = (k: number) => {
        const u = 1 - k;
        return [u * u * u * p0[0] + 3 * u * u * k * p1[0] + 3 * u * k * k * p2[0] + k * k * k * p3[0], u * u * u * p0[1] + 3 * u * u * k * p1[1] + 3 * u * k * k * p2[1] + k * k * k * p3[1]];
      };
      const [z, y] = b(t);
      const [z1, y1] = b(Math.min(1, t + 1e-3));
      const [z0, y0] = b(Math.max(0, t - 1e-3));
      const dz = z1 - z0;
      const dy = y1 - y0;
      const l = Math.hypot(dz, dy) || 1;
      // (a little thinner where it leaves the handle, full width into the head)
      arm.push({ z, y, nz: (dy / l) * sd, ny: (-dz / l) * sd, u: 0.72 + 0.2 * t });
    }
    // (the arms run into the head's beam: a touch shorter so the two do not z-fight)
    sweep(arm.slice(0, m), false, RACKET.beam * 0.94, RACKET.rim * 0.95, P, N, U, I);
  }
  // the grip's collar (where the overgrip ends) and the butt cap (its flare), octagons in the frame's paint, u 0.96
  const oct = (y0: number, y1: number, r0: number, r1: number, u: number, out: { P: number[]; N: number[]; U: number[]; I: number[] }, caps: boolean) => {
    const b = out.P.length / 3;
    for (const [y, r] of [
      [y0, r0],
      [y1, r1],
    ])
      for (let k = 0; k < 8; k++) {
        const f = ((k + 0.5) / 8) * Math.PI * 2;
        out.P.push(Math.cos(f) * HANDLE.rx * r, y, Math.sin(f) * HANDLE.rz * r);
        const nl = Math.hypot(Math.cos(f) / HANDLE.rx, Math.sin(f) / HANDLE.rz);
        out.N.push(Math.cos(f) / HANDLE.rx / nl, 0, Math.sin(f) / HANDLE.rz / nl);
        out.U.push(u < 0 ? k / 8 : u, u < 0 ? (y - RACKET.butt) / (RACKET.gripTop - RACKET.butt) : 0.5);
      }
    for (let k = 0; k < 8; k++) {
      const k1 = (k + 1) % 8;
      out.I.push(b + k, b + k1, b + 8 + k1, b + k, b + 8 + k1, b + 8 + k);
    }
    if (caps)
      for (const [o, ny] of [
        [0, -1],
        [8, 1],
      ]) {
        const c = out.P.length / 3;
        const y = ny < 0 ? y0 : y1;
        const r = ny < 0 ? r0 : r1;
        out.P.push(0, y, 0);
        out.N.push(0, ny, 0);
        out.U.push(u < 0 ? 0.5 : u, 0.5);
        for (let k = 0; k < 8; k++) {
          const f = ((k + 0.5) / 8) * Math.PI * 2;
          out.P.push(Math.cos(f) * HANDLE.rx * r, y, Math.sin(f) * HANDLE.rz * r);
          out.N.push(0, ny, 0);
          out.U.push(u < 0 ? 0.5 : u, 0.5);
        }
        for (let k = 0; k < 8; k++) {
          const k1 = (k + 1) % 8;
          if (ny < 0) out.I.push(c, c + 1 + k1, c + 1 + k);
          else out.I.push(c, c + 1 + k, c + 1 + k1);
        }
        void o;
      }
  };
  const frame = { P, N, U, I };
  oct(RACKET.butt, RACKET.butt + 0.012, 1.16, 1.1, 0.97, frame, true);
  oct(RACKET.gripTop - 0.004, RACKET.gripTop + 0.016, 1.06, 0.92, 0.97, frame, true);
  const grip = { P: [] as number[], N: [] as number[], U: [] as number[], I: [] as number[] };
  oct(RACKET.butt + 0.01, RACKET.gripTop, 1.0, 0.98, -1, grip, false);
  // the strings: the bed inside the head's inner edge, one fan
  const bed = new THREE.Shape();
  const nb = 48;
  for (let i = 0; i < nb; i++) {
    const [z, y] = headAt(shape, (i / nb) * Math.PI * 2, RACKET.rim * 0.9);
    if (i) bed.lineTo(z, y);
    else bed.moveTo(z, y);
  }
  const strings = new THREE.ShapeGeometry(bed, 1).rotateY(Math.PI / 2);
  const mk = (o: { P: number[]; N: number[]; U: number[]; I: number[] }) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(o.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(o.U, 2));
    // (each triangle wound to face where its vertices' normals point: the sweeps and the octagons go round either way)
    const I = o.I;
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
      const e1 = [o.P[b] - o.P[a], o.P[b + 1] - o.P[a + 1], o.P[b + 2] - o.P[a + 2]];
      const e2 = [o.P[c] - o.P[a], o.P[c + 1] - o.P[a + 1], o.P[c + 2] - o.P[a + 2]];
      const fx = e1[1] * e2[2] - e1[2] * e2[1];
      const fy = e1[2] * e2[0] - e1[0] * e2[2];
      const fz = e1[0] * e2[1] - e1[1] * e2[0];
      const d = fx * (o.N[a] + o.N[b] + o.N[c]) + fy * (o.N[a + 1] + o.N[b + 1] + o.N[c + 1]) + fz * (o.N[a + 2] + o.N[b + 2] + o.N[c + 2]);
      if (d < 0) [I[t + 1], I[t + 2]] = [I[t + 2], I[t + 1]];
    }
    g.setIndex(I);
    return g.toNonIndexed();
  };
  const g = { body: mergeGeometries([mk(frame), mk(grip)], true)!, strings };
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


/**
 * The frame's paint along it (a strip: u as the geometry has it, 0 … 0.7 round the head from the bottom, the arms
 * 0.72 … 0.92, the cap and the collar 0.97): the main paint, the accent at the sides of the head (3 and 9 o'clock) and
 * at the throat, the bumper over the top of the head and the bridge in `edge`.
 */
function frameStrip(look: PaddleLook, edge: number): THREE.DataTexture {
  const n = 128;
  const data = new Uint8Array(n * 4);
  const base = look.face === 'carbon' ? 0x1c1d21 : look.face === 'light' ? 0xeceae4 : look.graphic;
  const accent = look.face === 'glass' ? look.graphic2 : look.graphic;
  const thin = look.face === 'light' ? 0x202226 : look.graphic2;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    let c = base;
    if (u < 0.7) {
      // (0 the bottom of the head, 1 the top)
      const a = u / 0.7;
      if (a < 0.2) c = edge;
      else if (a > 0.42 && a < 0.6) c = Math.abs(a - 0.585) < 0.012 ? thin : accent;
      else if (a > 0.84) c = edge;
    } else if (u < 0.95) {
      const t = (u - 0.72) / 0.2;
      if (t < 0.3) c = accent;
      else if (Math.abs(t - 0.36) < 0.03) c = thin;
    } else c = edge;
    data[i * 4] = (c >> 16) & 255;
    data[i * 4 + 1] = (c >> 8) & 255;
    data[i * 4 + 2] = c & 255;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * The strings, per pixel (no texture): the mains and the crosses `STRINGS.w` thick, filtered by how much of a cell a
 * pixel covers (crisp close up; far away, where a cell is a pixel or less, a veil of their average, a little denser
 * so the head still reads as a shape on a phone), and the invented mark stencilled on them (two chevrons) in `mark`.
 */
function stringsMaterial(color: number, mark: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mc = new THREE.Color(mark);
  const yc = RACKET.headBase + HEADS.standard.len / 2;
  m.onBeforeCompile = (s) => {
    s.uniforms.uMark = { value: mc };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vBed;').replace('#include <begin_vertex>', `#include <begin_vertex>\nvBed = vec2( position.z, position.y - ${yc.toFixed(4)} );`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBed;\nuniform vec3 uMark;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          // the stencil: two chevrons pointing up, across the middle of the bed
          vec2 q = vBed;
          float inMark = 0.0;
          for ( int i = 0; i < 2; i ++ ) {
            float o = float( i ) * 0.034 - 0.012;
            float v = q.y - o + abs( q.x ) * 0.75;
            inMark = max( inMark, step( 0.0, v ) * step( v, 0.016 ) * step( abs( q.x ), 0.062 ) );
          }
          diffuseColor.rgb = mix( diffuseColor.rgb, uMark, inMark );
        }`,
      )
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
        {
          vec2 g = vBed / vec2( ${STRINGS.main.toFixed(4)}, ${STRINGS.cross.toFixed(4)} );
          vec2 fw = max( fwidth( g ), vec2( 1e-4 ) );
          vec2 d = abs( fract( g + 0.5 ) - 0.5 );
          vec2 cw = vec2( ${(STRINGS.w / STRINGS.main).toFixed(4)}, ${(STRINGS.w / STRINGS.cross).toFixed(4)} );
          vec2 cov = clamp( ( 0.5 * cw + 0.5 * fw - d ) / fw, 0.0, 1.0 );
          cov = min( cov, cw / fw );
          vec2 far = smoothstep( vec2( 0.25 ), vec2( 1.0 ), fw );
          cov = mix( cov, vec2( 0.2 ), far );
          diffuseColor.a *= 1.0 - ( 1.0 - cov.x ) * ( 1.0 - cov.y );
        }`,
      );
  };
  m.customProgramCacheKey = () => 'pb-strings';
  return m;
}

/** the rackets' materials by look (the last few, oldest dropped: a doubles match shows four) */
const matCache = new Map<string, THREE.Material[]>();
const MAT_KEEP = 6;
/**
 * A player's racket (see the header). `look` absent: a plain one, its frame in `color` with the bumper in `edge` (the
 * tools' kits). The name is the old paddle's: chars.ts and the kits call it so.
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
    const og = overgripTexture();
    const frameMat = new THREE.MeshStandardMaterial({ map: frameStrip(L, edge), roughness: L.face === 'carbon' ? 0.32 : 0.38, metalness: L.face === 'carbon' ? 0.15 : 0.05 });
    const gripMat = new THREE.MeshStandardMaterial({ color: L.grip, map: og, roughness: 0.82, ...(og ? { bumpMap: og, bumpScale: 1.2 } : {}) });
    // (the strings: natural on a black frame, white otherwise; the stencil in the frame's paint, or its accent on white)
    const str = stringsMaterial(L.face === 'carbon' ? 0xdcd6bc : 0xf2f1ea, L.face === 'light' ? L.graphic : L.face === 'carbon' ? L.graphic : L.graphic2 === 0xffffff ? L.graphic : L.graphic2);
    mats = [frameMat, gripMat, str];
    matCache.set(key, mats);
    while (matCache.size > MAT_KEEP) {
      const [k0, old] = matCache.entries().next().value!;
      (old[0] as THREE.MeshStandardMaterial).map?.dispose();
      for (const m of old) m.dispose();
      matCache.delete(k0);
    }
  }
  const geo = racketGeometry(L.shape);
  const m = new THREE.Mesh(geo.body, [mats[0], mats[1]]);
  m.castShadow = true;
  const st = new THREE.Mesh(geo.strings, mats[2]);
  st.renderOrder = 1;
  const g = new THREE.Group();
  g.add(m, st);
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
