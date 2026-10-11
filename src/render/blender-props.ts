// The court's furniture modelled in Blender (art/blender/props.py): the umpire's high chair, the players' benches with
// their towel, bottles and bag, the TV cameras on their tripods, the photographers' stools and the padel net posts
// with their winder. Each comes as one compact block of assets/props/props.bin (where each is: blender-props-data.ts):
// per vertex its position (mm), its normal, its material and the ambient occlusion baked in Blender. Fetched next to
// the page like the animations and decoded once; every copy goes into the venue's furniture mesh (one draw call for
// all of it, as before) with its colour already darkened by the baked occlusion.
//
// ?props=box shows the old boxes (to compare); so does a page that cannot fetch the file.

import * as THREE from 'three';
import { PROP_INDEX, PROP_MATS } from './blender-props-data';
import type { Solid } from './stadium';

export type PropName = 'umpire_chair' | 'bench' | 'tv_camera' | 'net_post' | 'stool';

/** how much of the baked occlusion shows (1: all of it); the floor's own darkening comes from the baked floor light */
const AO_STRENGTH = 0.75;

interface Decoded {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array;
  surf: Float32Array;
  idx: Uint16Array;
}
const cache = new Map<PropName, Decoded>();
let blob: ArrayBuffer | null = null;

function decode(name: PropName): Decoded {
  const hit = cache.get(name);
  if (hit) return hit;
  const [at, len] = PROP_INDEX[name];
  const raw = new Uint8Array(blob!, at, len);
  const dv = new DataView(blob!, at, len);
  const nv = dv.getUint32(0, true);
  const ni = dv.getUint32(4, true);
  let o = 8;
  const pos = new Float32Array(nv * 3);
  for (let i = 0; i < nv * 3; i++, o += 2) pos[i] = dv.getInt16(o, true) / 1000;
  const nrm = new Float32Array(nv * 3);
  for (let i = 0; i < nv * 3; i++, o += 1) nrm[i] = dv.getInt8(o) / 127;
  const mats = PROP_MATS.map((m) => ({ c: new THREE.Color().setHex(m.c).convertSRGBToLinear(), r: m.r, m: m.m }));
  const col = new Float32Array(nv * 3);
  const surf = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const m = mats[raw[o + i]];
    const ao = raw[o + nv + i] / 255;
    const k = 1 - AO_STRENGTH * (1 - ao);
    col[i * 3] = m.c.r * k;
    col[i * 3 + 1] = m.c.g * k;
    col[i * 3 + 2] = m.c.b * k;
    surf[i * 3] = m.r;
    surf[i * 3 + 1] = m.m;
    surf[i * 3 + 2] = 0;
  }
  o += nv * 2;
  if (o % 2) o++;
  const idx = new Uint16Array(ni);
  for (let i = 0; i < ni; i++, o += 2) idx[i] = dv.getUint16(o, true);
  for (let i = 0; i < nv; i++) {
    // (the normals were quantised: back to unit length)
    const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
    nrm[i * 3] /= l;
    nrm[i * 3 + 1] /= l;
    nrm[i * 3 + 2] /= l;
  }
  const d = { pos, nrm, col, surf, idx };
  cache.set(name, d);
  return d;
}

/** the old boxes instead (?props=box) */
export function boxProps(): boolean {
  try {
    return new URLSearchParams(location.search).get('props') === 'box';
  } catch {
    return false;
  }
}

/** how long fetching and decoding the props took (ms; for the notes and the tools), once they are in (`build`: the
 * venue's, putting every copy in its mesh) */
export const propTiming = { fetch: 0, decode: 0, build: 0 };

/**
 * Fetches the props and decodes every prop; resolves true once they are in, false if the page cannot have them
 * (?props=box, no page, the file missing: the venue keeps the boxes). The build ships assets/props/props.bin as
 * props.json too (the bytes in base64, `{ b64 }`): the artifact host only serves known web types, and .json is one.
 * The page asks for the JSON; the raw .bin stays the source (art/blender/props.py writes it).
 */
export function loadProps(base = ''): Promise<boolean> {
  if (boxProps() || typeof fetch === 'undefined') return Promise.resolve(false);
  const t0 = performance.now();
  return fetch(`${base}assets/props/props.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ b64: string }>;
    })
    .then((j) => {
      const bin = atob(j.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    })
    .then((buf) => {
      const t1 = performance.now();
      blob = buf;
      for (const name of Object.keys(PROP_INDEX) as PropName[]) decode(name);
      propTiming.fetch = t1 - t0;
      propTiming.decode = performance.now() - t1;
      return true;
    })
    .catch((err) => {
      console.warn('props: assets/props/props.json', err);
      return false;
    });
}

const m4 = new THREE.Matrix4();
const s4 = new THREE.Matrix4();
const n3 = new THREE.Matrix3();
const v = new THREE.Vector3();

/**
 * One copy of a prop into a Solid: at (x, y, z), turned ry about the vertical (its front, +z, then faces
 * (sin ry, cos ry)), mirrored left to right if `mirror`. The props must be in (loadProps).
 */
export function addProp(solid: Solid, name: PropName, x: number, y: number, z: number, ry = 0, mirror = false) {
  const d = decode(name);
  m4.makeRotationY(ry).multiply(s4.makeScale(mirror ? -1 : 1, 1, 1)).setPosition(x, y, z);
  n3.getNormalMatrix(m4);
  const k = solid.P.length / 3;
  const nv = d.pos.length / 3;
  for (let i = 0; i < nv; i++) {
    v.set(d.pos[i * 3], d.pos[i * 3 + 1], d.pos[i * 3 + 2]).applyMatrix4(m4);
    solid.P.push(v.x, v.y, v.z);
    // (the concrete grain the same size as on the rest of the furniture)
    solid.U.push((v.x + v.z) / 4, v.y / 4);
    v.set(d.nrm[i * 3], d.nrm[i * 3 + 1], d.nrm[i * 3 + 2]).applyMatrix3(n3).normalize();
    solid.N.push(v.x, v.y, v.z);
    solid.C.push(d.col[i * 3], d.col[i * 3 + 1], d.col[i * 3 + 2]);
    solid.S.push(d.surf[i * 3], d.surf[i * 3 + 1], d.surf[i * 3 + 2]);
  }
  for (let t = 0; t < d.idx.length; t += 3) {
    const a = k + d.idx[t];
    const b = k + d.idx[t + 1];
    const c = k + d.idx[t + 2];
    // (a mirror turns the triangles inside out: wind them back)
    if (mirror) solid.I.push(a, c, b);
    else solid.I.push(a, b, c);
  }
}

/** triangles of one copy (for the notes and the tools; the props must be in) */
export function propTriangles(name: PropName): number {
  return decode(name).idx.length / 3;
}
