// The players' bodies, from the one AI-made model, all in code when it loads (no new clips or models): the hands
// (below), each player's build (see Build) and a women's body (see womanTemplate; tried on the players, it did not pass
// for a woman in the close-ups, so only the crowd uses it, docs/notas-10-formas.md).
//
// Hands. The model's hands are rigid pieces on the hand bones (the rig has no finger bones), modelled open with the
// fingers spread: in a close-up the free hand looked like a claw and the paddle's handle went through a flat hand. The
// fingers are curled here, baked into the bind pose: each finger bends at its knuckle and at its two finger joints
// (the joints placed along the finger as on a real hand), each vertex taking its fingers' bends by how close it is to
// each finger's line (soft, so the webbing between two fingers follows both), the thumb on its own. The paddle hand
// closes round the handle (where gear.ts and PADDLE_POSE put it; whatever still reaches into the handle is pushed out
// to its surface, the push spread over the skin round it), the free hand is half closed and relaxed. Where the skin
// bends, the normals turn with how the faces round each vertex turned (the model's own smooth normals are kept).
// Everything is measured on assets/chars/hero.json in each hand's frame: u along the hand (wrist → fingertips), v
// across it towards the thumb, w out of the palm; metres in the bind pose (1.7 m tall). A new model needs measuring
// again (tools/forms.py shows the hands).

import * as THREE from 'three';

type V3 = [number, number, number];

/** a finger: its knuckle (K) and its tip (T), both on its middle line; the bends at the knuckle and the two joints (°) */
interface FingerSpec {
  K: V3;
  T: V3;
  ang: V3;
  /** how far across its line a vertex still bends with it (m) */
  sig: number;
  /** turned towards the middle finger at the knuckle (°, + towards the thumb) */
  abd?: number;
}
/** the thumb: from its root at the wrist (C) to its tip (T); bends at the root, the knuckle and the joint (°) towards `toward` */
interface ThumbSpec {
  C: V3;
  T: V3;
  ang: V3;
  toward: V3;
  /** within r0 of its line a vertex is all thumb, beyond r1 not at all (m) */
  r0: number;
  r1: number;
}
export interface HandSpec {
  fingers: FingerSpec[];
  thumb: ThumbSpec;
}

/** where along each finger its two joints are (of the knuckle → tip length), as on a real hand */
const JOINTS: [number, number] = [0.47, 0.76];
/** half the width of each joint's bend (m): the knuckle rounder, the last joint tighter */
const BEND = 0.009;
/**
 * the joints turn about a line this far towards the palm from the finger's middle (m): the skin on the inside of a
 * bend then hardly folds (it would turn inside out), the knuckles' skin stretches round the outside as on a real hand
 */
const PALMAR = 0.004;
/** half a finger's thickness, a little over (m); round the knuckle the hand is thicker */
const THICK = 0.012;
/** a vertex further than about this from every finger and the thumb stays as it is (the palm, the back of the hand) */
const NONE = 0.01;

/** The paddle hand round the handle (index, middle, ring, little finger; then the thumb over the handle). */
export const GRIP: HandSpec = {
  fingers: [
    { K: [0.11, 0.036, -0.004], T: [0.198, 0.01, 0.008], ang: [35, 55, 30], sig: 0.013 },
    { K: [0.112, 0.013, -0.006], T: [0.203, -0.0175, 0.007], ang: [70, 85, 45], sig: 0.012 },
    { K: [0.108, -0.011, -0.008], T: [0.193, -0.03, 0.009], ang: [78, 90, 50], sig: 0.012 },
    { K: [0.096, -0.035, -0.004], T: [0.155, -0.05, 0.01], ang: [85, 90, 50], sig: 0.013 },
  ],
  thumb: { C: [0.03, 0.03, 0.01], T: [0.134, 0.073, 0.04], ang: [10, 30, 30], toward: [0, -1, 0.5], r0: 0.013, r1: 0.022 },
};
/** The free hand: half closed, relaxed (each finger a little more curled than the one before it). */
export const RELAXED: HandSpec = {
  fingers: [
    { K: [0.105, 0.024, 0.012], T: [0.186, -0.007, 0.034], ang: [22, 32, 16], sig: 0.013, abd: -6 },
    { K: [0.108, 0.001, 0.01], T: [0.188, -0.034, 0.032], ang: [28, 38, 18], sig: 0.012 },
    { K: [0.103, -0.025, 0.008], T: [0.176, -0.048, 0.035], ang: [32, 42, 20], sig: 0.012, abd: 5 },
    { K: [0.092, -0.046, 0.01], T: [0.138, -0.066, 0.034], ang: [36, 46, 22], sig: 0.013, abd: 10 },
  ],
  // (the thumb as modelled: already relaxed, and bending it tore the skin between it and the palm)
  thumb: { C: [0.028, 0.03, 0.02], T: [0.126, 0.062, 0.052], ang: [0, 0, 0], toward: [0, -1, 0.3], r0: 0.013, r1: 0.022 },
};

/** The paddle's handle in the hand: an elliptical cylinder (gear.ts: 13.5 × 17 mm across, overgrip included). */
export interface Handle {
  /** the paddle's pose in the hand bone (PADDLE_POSE: rx, ry, rz, ox, oy, oz; bone units are centimetres) */
  pose: number[];
  /** the players' height the push-out is sized for (the paddle keeps its real size, the body scales) */
  height: number;
}
const HANDLE_R = [0.0135, 0.0172];
const HANDLE_LEN = 0.125;
/** how far out of the handle the skin is pushed (× its radius): a few millimetres of give for the smaller players */
const HANDLE_MARGIN = 1.07;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** a hand's frame in the bind pose: origin at the wrist, u along the hand bone, w out of the palm (+z), v to the thumb */
interface Frame {
  o: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  w: THREE.Vector3;
}
function frameOf(inverse: THREE.Matrix4): Frame {
  const m = inverse.clone().invert();
  const o = new THREE.Vector3().setFromMatrixPosition(m);
  const u = new THREE.Vector3().setFromMatrixColumn(m, 1).normalize();
  const w = new THREE.Vector3(0, 0, 1).addScaledVector(u, -u.z).normalize();
  const v = new THREE.Vector3().crossVectors(w, u).normalize();
  if (v.y < 0) v.negate();
  return { o, u, v, w };
}

const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/** one bend of a chain: turn by `angle` about `axis` through `pivot` */
interface Bend {
  pivot: THREE.Vector3;
  axis: THREE.Vector3;
}
/**
 * turns p through the bends, the last one first (distal before proximal: the pivots are where the joints rest); Q
 * gathers the whole rotation (for the normals)
 */
function chain(p: THREE.Vector3, Q: THREE.Quaternion, bends: Bend[], angles: number[]) {
  Q.identity();
  for (let i = bends.length - 1; i >= 0; i--) {
    const a = angles[i];
    if (Math.abs(a) < 1e-6) continue;
    const b = bends[i];
    _q.setFromAxisAngle(b.axis, a);
    p.sub(b.pivot).applyQuaternion(_q).add(b.pivot);
    Q.premultiply(_q);
  }
}

interface Chain {
  /** the root joint and the way along the finger (a vertex's t is how far along it is from the root) */
  K: THREE.Vector3;
  d: THREE.Vector3;
  /** the bends from the root out, and each one's angle at a vertex given how far along the finger it is */
  bends: Bend[];
  angles(t: number): number[];
  /** how much a vertex belongs to it (unnormalised) */
  weight(p: THREE.Vector3): number;
}

const W0 = new THREE.Vector3(0, 0, 1);
const vec = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
const rad = THREE.MathUtils.degToRad;

function fingerChain(f: FingerSpec, k = 1): Chain {
  const K = vec(f.K);
  const T = vec(f.T);
  const d = T.clone().sub(K);
  const L = d.length();
  d.divideScalar(L);
  // flexing turns the finger towards the palm (+w): about d × w
  const ax = new THREE.Vector3().crossVectors(d, W0).normalize();
  const across = ax.clone();
  // (the finger's own thickness direction: a vertex well above or below it, the thumb over the index, is not its)
  const up = new THREE.Vector3().crossVectors(across, d).normalize();
  const bends: Bend[] = [
    { pivot: K, axis: W0 },
    { pivot: K.clone().addScaledVector(W0, PALMAR), axis: ax },
    { pivot: K.clone().addScaledVector(d, L * JOINTS[0]).addScaledVector(W0, PALMAR), axis: ax },
    { pivot: K.clone().addScaledVector(d, L * JOINTS[1]).addScaledVector(W0, PALMAR), axis: ax },
  ];
  const th = f.ang.map((a) => rad(a) * k);
  const ab = rad(f.abd ?? 0) * k;
  return {
    bends,
    angles(t) {
      const r0 = smooth(-BEND, BEND, t);
      return [ab * r0, th[0] * r0, th[1] * smooth(L * JOINTS[0] - BEND * 0.8, L * JOINTS[0] + BEND * 0.8, t), th[2] * smooth(L * JOINTS[1] - BEND * 0.7, L * JOINTS[1] + BEND * 0.7, t)];
    },
    weight(p) {
      _a.copy(p).sub(K);
      const s = _a.dot(across);
      const t = _a.dot(d);
      const h = Math.abs(_a.dot(up)) - (THICK + 0.012 * (1 - smooth(0, 0.02, t)));
      return Math.exp(-Math.pow(Math.abs(s) / f.sig, 4)) * smooth(-0.03, -0.01, t) * (h > 0 ? Math.exp(-(h * h) / 2.5e-5) : 1);
    },
    K,
    d,
  };
}

function thumbChain(s: ThumbSpec, k = 1): Chain {
  const C = vec(s.C);
  const T = vec(s.T);
  const d = T.clone().sub(C);
  const L = d.length();
  d.divideScalar(L);
  const ax = new THREE.Vector3().crossVectors(d, vec(s.toward)).normalize();
  // (the joints' lines towards the inside of the bend, as the fingers': see PALMAR)
  const inward = new THREE.Vector3().crossVectors(ax, d).normalize().multiplyScalar(PALMAR);
  const j = [0.45, 0.72];
  const h = 0.012;
  const bends: Bend[] = [
    { pivot: C, axis: ax },
    { pivot: C.clone().addScaledVector(d, L * j[0]).add(inward), axis: ax },
    { pivot: C.clone().addScaledVector(d, L * j[1]).add(inward), axis: ax },
  ];
  const th = s.ang.map((a) => rad(a) * k);
  return {
    bends,
    angles(t) {
      return [th[0] * smooth(-h * 1.5, h * 1.5, t), th[1] * smooth(L * j[0] - h, L * j[0] + h, t), th[2] * smooth(L * j[1] - h * 0.8, L * j[1] + h * 0.8, t)];
    },
    weight(p) {
      const t = _a.copy(p).sub(C).dot(d);
      const perp = _b.copy(p).sub(C).addScaledVector(d, -t).length();
      // (the thumb wins over a finger it touches)
      return 4 * (1 - smooth(s.r0, s.r1, perp)) * smooth(-0.02, 0, t);
    },
    K: C,
    d,
  };
}

/** welded neighbours of the given vertices (the UV seams split vertices that share a position) */
function welded(pos: ArrayLike<number>, index: ArrayLike<number>, keep: Uint8Array) {
  const key = new Map<string, number>();
  const canon = new Int32Array(pos.length / 3).fill(-1);
  for (let i = 0; i < canon.length; i++) {
    if (!keep[i]) continue;
    const k = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    let c = key.get(k);
    if (c === undefined) {
      c = i;
      key.set(k, i);
    }
    canon[i] = c;
  }
  const nb = new Map<number, Set<number>>();
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    if (!keep[a] || !keep[b] || !keep[c]) continue;
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const cx = canon[x];
      const cy = canon[y];
      if (!nb.has(cx)) nb.set(cx, new Set());
      if (!nb.has(cy)) nb.set(cy, new Set());
      nb.get(cx)!.add(cy);
      nb.get(cy)!.add(cx);
    }
  }
  return { canon, nb };
}

/** area-weighted face normals summed on the welded vertices (model space) */
function faceNormals(pos: ArrayLike<number>, index: ArrayLike<number>, keep: Uint8Array, canon: Int32Array): Map<number, THREE.Vector3> {
  const out = new Map<number, THREE.Vector3>();
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    if (!keep[a] && !keep[b] && !keep[c]) continue;
    _a.set(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]);
    _b.set(pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]);
    _c.crossVectors(_a, _b);
    for (const i of [a, b, c]) {
      if (!keep[i]) continue;
      const k = canon[i];
      let n = out.get(k);
      if (!n) out.set(k, (n = new THREE.Vector3()));
      n.add(_c);
    }
  }
  for (const n of out.values()) n.normalize();
  return out;
}

/**
 * Curls one hand's fingers in a geometry's bind pose (position and normal changed in place). `bone`: the hand bone's
 * index in the skin; `inverse`: its inverse bind matrix; `handle`: the paddle's handle to close round (the paddle hand).
 * Returns how many vertices moved.
 */
export function curlHand(geo: THREE.BufferGeometry, bone: number, inverse: THREE.Matrix4, spec: HandSpec, handle?: Handle, k = 1): number {
  type Attr = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  const P = geo.getAttribute('position') as Attr;
  const N = geo.getAttribute('normal') as Attr;
  const J = geo.getAttribute('skinIndex') as Attr;
  const Wt = geo.getAttribute('skinWeight') as Attr;
  const index = geo.index!.array;
  const n = P.count;
  const fr = frameOf(inverse);
  const hand = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let w = 0;
    for (let c = 0; c < 4; c++) if (J.getComponent(i, c) === bone) w += Wt.getComponent(i, c);
    if (w > 0.01) hand[i] = 1;
  }
  const chains: Chain[] = [...spec.fingers.map((f) => fingerChain(f, k)), thumbChain(spec.thumb, k)];
  const toLocal = (i: number, out: THREE.Vector3) => {
    _c.fromBufferAttribute(P, i).sub(fr.o);
    return out.set(_c.dot(fr.u), _c.dot(fr.v), _c.dot(fr.w));
  };
  const toModel = (p: THREE.Vector3, out: THREE.Vector3) =>
    out.copy(fr.o).addScaledVector(fr.u, p.x).addScaledVector(fr.v, p.y).addScaledVector(fr.w, p.z);
  // (the model's vertices are interleaved: read them out)
  const flat = () => {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = P.getX(i);
      a[i * 3 + 1] = P.getY(i);
      a[i * 3 + 2] = P.getZ(i);
    }
    return a;
  };
  const pos0 = flat();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const acc = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const M = new THREE.Matrix4();
  const ws: number[] = [];
  // the bent position of every hand vertex, in the hand's frame, and how it turned (a blend of rotations, row-major)
  const local = new Float32Array(n * 3);
  const rot = new Float32Array(n * 9);
  let moved = 0;
  for (let i = 0; i < n; i++) {
    if (!hand[i]) continue;
    toLocal(i, p);
    let sum = NONE;
    ws.length = 0;
    for (const c of chains) {
      const w = c.weight(p);
      ws.push(w);
      sum += w;
    }
    acc.copy(p).multiplyScalar(NONE / sum);
    const r = i * 9;
    rot[r] = rot[r + 4] = rot[r + 8] = NONE / sum;
    chains.forEach((c, ci) => {
      const w = ws[ci] / sum;
      if (w < 1e-4) return;
      q.copy(p);
      chain(q, Q, c.bends, c.angles(_b.copy(p).sub(c.K).dot(c.d)));
      acc.addScaledVector(q, w);
      const e = M.makeRotationFromQuaternion(Q).elements;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) rot[r + a * 3 + b] += e[b * 4 + a] * w;
    });
    local[i * 3] = acc.x;
    local[i * 3 + 1] = acc.y;
    local[i * 3 + 2] = acc.z;
  }
  // the handle: whatever reaches into it is pushed out to its surface, the push spread over the skin round it
  const { canon, nb } = welded(pos0, index, hand);
  if (handle) {
    const [rx, ry, rz, ox, oy, oz] = handle.pose;
    // the paddle in the bone (bone units are cm): its axis (+y), face normal (+x) and edge (+z); in the hand's frame
    const pm = new THREE.Matrix4().compose(new THREE.Vector3(ox, oy, oz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    const bindBone = inverse.clone().invert();
    const toFrame = (v: THREE.Vector3, point: boolean) => {
      if (point) v.applyMatrix4(pm).applyMatrix4(bindBone).sub(fr.o);
      else v.transformDirection(pm).transformDirection(bindBone);
      return new THREE.Vector3(v.dot(fr.u), v.dot(fr.v), v.dot(fr.w));
    };
    const O = toFrame(new THREE.Vector3(0, 0, 0), true);
    const A = toFrame(new THREE.Vector3(0, 1, 0), false).normalize();
    const Np = toFrame(new THREE.Vector3(1, 0, 0), false).normalize();
    const Ep = toFrame(new THREE.Vector3(0, 0, 1), false).normalize();
    // (the paddle keeps its real size while the body scales with the player's height)
    const s = 1.7 / handle.height;
    const r0 = HANDLE_R[0] * s;
    const r1 = HANDLE_R[1] * s;
    // (the welded hand vertices numbered 0…m-1, their neighbours in one list)
    const ids = [...nb.keys()];
    const cix = new Int32Array(n).fill(-1);
    ids.forEach((c, k) => (cix[c] = k));
    const m = ids.length;
    const first = new Int32Array(m + 1);
    ids.forEach((c, k) => (first[k + 1] = first[k] + nb.get(c)!.size));
    const list = new Int32Array(first[m]);
    ids.forEach((c, k) => {
      let j = first[k];
      for (const o of nb.get(c)!) list[j++] = cix[o];
    });
    // the push so far, where each pushed vertex must at least go, and two buffers to spread it
    const D = new Float32Array(m * 3);
    const need = new Float32Array(m * 3);
    const has = new Uint8Array(m);
    let cur = new Float32Array(m * 3);
    let nxt = new Float32Array(m * 3);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) {
        if (!hand[i]) continue;
        const k = cix[canon[i]];
        if (k < 0) continue;
        p.set(local[i * 3] + D[k * 3], local[i * 3 + 1] + D[k * 3 + 1], local[i * 3 + 2] + D[k * 3 + 2]).sub(O);
        const t = p.dot(A);
        if (t < -0.005 || t > HANDLE_LEN * s) continue;
        const x = p.dot(Np) / r0;
        const z = p.dot(Ep) / r1;
        const re = Math.hypot(x, z);
        if (re >= HANDLE_MARGIN) continue;
        const kk = HANDLE_MARGIN / Math.max(re, 0.05) - 1;
        for (let e = 0; e < 3; e++) need[k * 3 + e] = D[k * 3 + e] + Np.getComponent(e) * x * r0 * kk + Ep.getComponent(e) * z * r1 * kk;
        has[k] = 1;
      }
      // spread: a few rounds of averaging with the neighbours, the pushed ones held at least where they must go
      cur.set(D);
      for (let k = 0; k < m; k++) if (has[k]) for (let e = 0; e < 3; e++) cur[k * 3 + e] = need[k * 3 + e];
      for (let it = 0; it < 6; it++) {
        for (let k = 0; k < m; k++) {
          const a0 = first[k];
          const a1 = first[k + 1];
          let mx = 0;
          let my = 0;
          let mz = 0;
          for (let j = a0; j < a1; j++) {
            const o = list[j] * 3;
            mx += cur[o];
            my += cur[o + 1];
            mz += cur[o + 2];
          }
          const cnt = Math.max(1, a1 - a0);
          let ox2 = cur[k * 3] * 0.5 + (mx / cnt) * 0.5;
          let oy2 = cur[k * 3 + 1] * 0.5 + (my / cnt) * 0.5;
          let oz2 = cur[k * 3 + 2] * 0.5 + (mz / cnt) * 0.5;
          if (has[k]) {
            const nx = need[k * 3];
            const ny = need[k * 3 + 1];
            const nz = need[k * 3 + 2];
            if (ox2 * nx + oy2 * ny + oz2 * nz < nx * nx + ny * ny + nz * nz) {
              ox2 = nx;
              oy2 = ny;
              oz2 = nz;
            }
          }
          nxt[k * 3] = ox2;
          nxt[k * 3 + 1] = oy2;
          nxt[k * 3 + 2] = oz2;
        }
        const sw = cur;
        cur = nxt;
        nxt = sw;
      }
      D.set(cur);
    }
    for (let i = 0; i < n; i++) {
      if (!hand[i]) continue;
      const k = cix[canon[i]];
      if (k < 0) continue;
      local[i * 3] += D[k * 3];
      local[i * 3 + 1] += D[k * 3 + 1];
      local[i * 3 + 2] += D[k * 3 + 2];
    }
  }
  for (let i = 0; i < n; i++) {
    if (!hand[i]) continue;
    p.set(local[i * 3], local[i * 3 + 1], local[i * 3 + 2]);
    toModel(p, q);
    if (q.distanceToSquared(_a.fromBufferAttribute(P, i)) > 1e-8) moved++;
    P.setXYZ(i, q.x, q.y, q.z);
  }
  P.needsUpdate = true;
  // normals: the model's own turned with the finger, then as much again as the faces round the vertex turned beyond
  // that (where the skin bends)
  const f0 = faceNormals(pos0, index, hand, canon);
  const f1 = faceNormals(flat(), index, hand, canon);
  const nn = new THREE.Vector3();
  const turn = (i: number, v: THREE.Vector3) => {
    // (model → the hand's frame, turned, and back)
    const x = v.dot(fr.u);
    const y = v.dot(fr.v);
    const z = v.dot(fr.w);
    const r = i * 9;
    const tx = rot[r] * x + rot[r + 1] * y + rot[r + 2] * z;
    const ty = rot[r + 3] * x + rot[r + 4] * y + rot[r + 5] * z;
    const tz = rot[r + 6] * x + rot[r + 7] * y + rot[r + 8] * z;
    return v.set(0, 0, 0).addScaledVector(fr.u, tx).addScaledVector(fr.v, ty).addScaledVector(fr.w, tz).normalize();
  };
  for (let i = 0; i < n; i++) {
    if (!hand[i]) continue;
    turn(i, nn.fromBufferAttribute(N, i));
    const a = f0.get(canon[i]);
    const b = f1.get(canon[i]);
    if (a && b) {
      turn(i, _a.copy(a));
      if (_a.dot(b) > -0.5) nn.applyQuaternion(_q.setFromUnitVectors(_a, b)).normalize();
    }
    N.setXYZ(i, nn.x, nn.y, nn.z);
  }
  N.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return moved;
}

/**
 * The model's hands as a player's: the paddle hand round the handle, the free one relaxed. A copy of the geometry (the
 * AI's own stays as it is: the kit painter measures the body on it).
 */
export function shapeHands(mesh: THREE.SkinnedMesh, handle: Handle): THREE.BufferGeometry {
  const geo = mesh.geometry.clone();
  const sk = mesh.skeleton;
  const idx = (name: string) => sk.bones.findIndex((b) => b.name === name);
  const r = idx('RightHand');
  const l = idx('LeftHand');
  if (r >= 0) curlHand(geo, r, sk.boneInverses[r], GRIP, handle);
  if (l >= 0) curlHand(geo, l, sk.boneInverses[l], RELAXED);
  return geo;
}

// ------------------------------------------------------------------ builds
//
// Each player's build, per player and in the skeleton only (the geometry is shared): the height is the model's scale
// (CharacterView's own, everything there scales with it), the shoulders and the hips are where the arms and the legs
// hang (the collarbones' and the hip joints' spread, sideways only: no bone gets longer or shorter, so the clips, the
// feet put down on the floor and the arm's IK work as they did), and the girth of each part is a scale across its
// bone (bone-local x and z: every bone of this rig runs along its own y) put into the skin's inverse bind matrices,
// so it shapes the skin round that bone alone and nothing hanging from it (the paddle, the hand on the arm).

/** A player's build. Factors are against the model (1: as it is). */
export interface Build {
  /** height (m; the model is 1.7, a player 1.78 by default) */
  height: number;
  /** the spread of the shoulders (where the arms hang) and of the hip joints */
  shoulders?: number;
  hips?: number;
  /** girth: the chest, the waist (and belly), the hips (and seat), the upper arms and forearms, the thighs and calves, the neck */
  chest?: number;
  waist?: number;
  seat?: number;
  arms?: number;
  legs?: number;
  neck?: number;
  /** the hands' size */
  hand?: number;
  /** the women's body (see womanTemplate) */
  woman?: boolean;
  /** a white visor (the women's body) */
  visor?: boolean;
  /** the hair (the women's body): a ponytail or a bob down to the jaw */
  hair?: 'tail' | 'bob';
}

/** bone → [x, y, z] scale in its own frame, from a build */
function girths(b: Build): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  const both = (bone: string, s: [number, number, number]) => {
    out[`Left${bone}`] = s;
    out[`Right${bone}`] = s;
  };
  const c = b.chest ?? 1;
  const w = b.waist ?? 1;
  const s = b.seat ?? 1;
  const a = b.arms ?? 1;
  const l = b.legs ?? 1;
  const h = b.hand ?? 1;
  const n = b.neck ?? 1;
  // (the chest's depth follows its width only half way; the belly sticks out more than it widens)
  out.Spine = [c, 1, 1 + (c - 1) * 0.5];
  out.Spine01 = [(c + w) / 2, 1, 1 + ((c + w) / 2 - 1) * 0.7];
  out.Spine02 = [w, 1, 1 + (w - 1) * 1.2];
  out.Hips = [s, 1, 1 + (s - 1) * 0.6];
  out.neck = [n, 1, n];
  both('Arm', [a, 1, a]);
  both('ForeArm', [1 + (a - 1) * 0.8, 1, 1 + (a - 1) * 0.8]);
  both('Hand', [h, h, h]);
  both('UpLeg', [l * (1 + (s - 1) * 0.35), 1, l * (1 + (s - 1) * 0.35)]);
  both('Leg', [1 + (l - 1) * 0.8, 1, 1 + (l - 1) * 0.8]);
  return out;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _s = new THREE.Matrix4();

/**
 * Gives a player's model (a clone of the template, before its animation starts) its build: the bones spread, the
 * skin's inverse bind matrices scaled (each player gets their own copy of them; the template's stay as they are).
 */
export function applyBuild(model: THREE.Object3D, b: Build) {
  let mesh: THREE.SkinnedMesh | null = null;
  const bone: Record<string, THREE.Object3D> = {};
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh;
    if ((o as THREE.Bone).isBone) bone[o.name] = o;
  });
  if (!mesh) return;
  const sk = (mesh as THREE.SkinnedMesh).skeleton;
  // (a clone shares the template's matrices)
  sk.boneInverses = sk.boneInverses.map((m) => m.clone());
  const g = girths(b);
  // (the parts not worn: their skin scaled to nothing, inside the bone they hang from)
  for (const [name, , part] of PARTS) {
    const i = sk.bones.findIndex((bn) => bn.name === name);
    const on = part === 'visor' ? b.visor : b.hair === part;
    if (i >= 0 && !on) sk.boneInverses[i].premultiply(_s.makeScale(1e-4, 1e-4, 1e-4));
  }
  sk.bones.forEach((bn, i) => {
    const s = g[bn.name];
    if (!s || (s[0] === 1 && s[1] === 1 && s[2] === 1)) return;
    sk.boneInverses[i].premultiply(_s.makeScale(s[0], s[1], s[2]));
  });
  // the spread: move the arm's and the leg's root sideways (in the model's rest pose, then back into the parent)
  model.updateMatrixWorld(true);
  const spread = (name: string, k: number) => {
    const o = bone[name];
    if (!o || !o.parent || k === 1) return;
    o.getWorldPosition(_v);
    o.parent.getWorldPosition(_w);
    // (sideways: the model's x, whatever the model's own scale)
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    _v.applyMatrix4(inv);
    _w.applyMatrix4(inv);
    _v.x = _w.x + (_v.x - _w.x) * k;
    _v.applyMatrix4(model.matrixWorld);
    o.parent.worldToLocal(_v);
    o.position.copy(_v);
  };
  for (const s of ['Left', 'Right']) {
    spread(`${s}Arm`, b.shoulders ?? 1);
    spread(`${s}UpLeg`, b.hips ?? 1);
  }
  model.updateMatrixWorld(true);
}

// ------------------------------------------------------------------ the women's body
//
// The same model made a woman's, baked into a second geometry when it loads (the skeleton and the clips are the
// same): a bust under the shirt, a softer, narrower jaw, a narrower nose and a softer brow, the quiff flattened, fitted
// shorts (the kit painter paints them shorter, outfit.ts), and the parts some wear and others not, each on bones of
// its own (see PARTS): a ponytail (a tapered tube from the back of the head, skinned to the head at its root and more
// and more to the neck and the upper back towards its tip), hair down to the jaw, a white visor. Their colours come
// from the kit's texture (the hair's, the socks'). The waist, the hips, the shoulders and the arms are a build's (the
// crowd's woman: WOMAN_BUILD in crowd.ts). Measured on hero.json's bind pose (metres, 1.7 m tall, facing +z).
// A player gets it with Build.woman (CharacterView); none does for now: the model's male face, knees and calves still
// read as a man in women's clothes in the TV shots.

type Attr = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

/** the bust: the middle of each side (x, y) and how far forward it comes (m) */
const BUST = { x: 0.083, y: 1.252, out: 0.03, rx: 0.048, up: 0.055, down: 0.034 };
/** the shorts drawn in round the thighs: between y0 and y1, how much of the distance to the thigh's line is kept */
const SHORTS = {
  y0: 0.44,
  y1: 0.9,
  fit: [
    [0.44, 1],
    [0.5, 0.95],
    [0.56, 0.9],
    [0.6, 0.82],
    [0.66, 0.8],
    [0.74, 0.86],
    [0.82, 0.95],
    [0.88, 1],
  ],
};
/** the jaw: narrower about the middle of the face below the cheekbones */
const JAW = { y0: 1.44, y1: 1.535, peak: 1.49, k: 0.13 };
/** the ponytail: its line from the root (inside the back of the head) to the tip, and its radius along it (m) */
const TAIL = {
  line: [
    [0, 1.612, -0.082],
    [0, 1.605, -0.128],
    [0, 1.565, -0.147],
    [0, 1.505, -0.142],
    [0, 1.445, -0.135],
  ] as V3[],
  radius: [
    [0, 0.011],
    [0.12, 0.013],
    [0.3, 0.021],
    [0.65, 0.016],
    [0.9, 0.009],
    [1, 0.003],
  ],
  rings: 14,
  sides: 10,
  /** a little flatter than wide */
  depth: 0.78,
};

function lerpTable(tab: number[][], t: number): number {
  for (let i = 1; i < tab.length; i++)
    if (t <= tab[i][0]) {
      const [t0, v0] = tab[i - 1];
      const [t1, v1] = tab[i];
      const k = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * k * k * (3 - 2 * k);
    }
  return tab[tab.length - 1][1];
}

/**
 * The women's geometry from the players' (hands already shaped): a new, plain (not interleaved) geometry with the
 * ponytail's vertices added. `bones`: the skin's bone names in order.
 */
export function womanGeometry(src: THREE.BufferGeometry, bones: string[], bind: Record<string, THREE.Vector3> = {}): THREE.BufferGeometry {
  const P = src.getAttribute('position') as Attr;
  const N = src.getAttribute('normal') as Attr;
  const UV = src.getAttribute('uv') as Attr;
  const J = src.getAttribute('skinIndex') as Attr;
  const Wt = src.getAttribute('skinWeight') as Attr;
  const n = P.count;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const ji: number[] = [];
  const jw: number[] = [];
  const p = new THREE.Vector3();
  const nn = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(P, i);
    nn.fromBufferAttribute(N, i);
    // the bust: forward (and a little out to its side), the most at its middle, a sharper fold underneath
    if (p.z > 0.02 && p.y > 1.12 && p.y < 1.42 && Math.abs(p.x) < 0.2) {
      let push = 0;
      let side = 0;
      for (const s of [-1, 1]) {
        const dx = (p.x - s * BUST.x) / BUST.rx;
        const dyv = p.y - BUST.y;
        const dy = dyv / (dyv > 0 ? BUST.up : BUST.down);
        const f = Math.exp(-(dx * dx + dy * dy) * 1.1);
        if (f > push) {
          push = f;
          side = s;
        }
      }
      // (only the front of the chest: fades out round the sides)
      const k = BUST.out * push * smooth(0.0, 0.5, nn.z);
      p.x += side * k * 0.25;
      p.z += k;
    }
    // fitted shorts: the loose shorts drawn in round each thigh (towards the thigh bone's line), the most at the hem;
    // the kit paints them shorter (outfit.ts), bare thigh below
    if (p.y > SHORTS.y0 && p.y < SHORTS.y1) {
      const a = bind[p.x >= 0 ? 'LeftUpLeg' : 'RightUpLeg'];
      const b = bind[p.x >= 0 ? 'LeftLeg' : 'RightLeg'];
      if (a && b) {
        const d = _v.copy(b).sub(a).normalize();
        const t = _w.copy(p).sub(a).dot(d);
        const axis = _c.copy(a).addScaledVector(d, t);
        const f = lerpTable(SHORTS.fit, p.y);
        p.sub(axis).multiplyScalar(f).add(axis);
      }
    }
    // the jaw and the chin: narrower and a touch shorter
    if (p.y > JAW.y0 && p.y < JAW.y1 && p.z > -0.03) {
      const t = p.y < JAW.peak ? smooth(JAW.y0, JAW.peak, p.y) : 1 - smooth(JAW.peak, JAW.y1, p.y);
      const front = smooth(-0.03, 0.04, p.z);
      p.x *= 1 - JAW.k * t * front;
      p.z -= 0.004 * t * front * smooth(0.06, 0.1, p.z);
    }
    // the nose a little narrower, the brow ridge softer
    if (p.z > 0.09 && p.y > 1.52 && p.y < 1.552 && Math.abs(p.x) < 0.025) p.x *= 0.9;
    if (p.z > 0.085 && p.y > 1.574 && p.y < 1.605) p.z -= 0.0025 * smooth(0.085, 0.1, p.z) * (1 - smooth(0.04, 0.065, Math.abs(p.x)));
    // the hair pulled back: the quiff over the forehead flattened, the top a little lower
    if (p.y > 1.6) {
      const t = smooth(1.6, 1.665, p.y) * smooth(0.0, 0.09, p.z);
      p.z -= 0.016 * t;
      p.y -= 0.007 * t + 0.007 * smooth(1.62, 1.7, p.y);
    }
    pos.push(p.x, p.y, p.z);
    nrm.push(nn.x, nn.y, nn.z);
    uv.push(UV.getX(i), UV.getY(i));
    for (let c = 0; c < 4; c++) {
      ji.push(J.getComponent(i, c));
      jw.push(Wt.getComponent(i, c));
    }
  }
  const index: number[] = Array.from(src.index!.array);
  // the ponytail's colour: the texture under the hair at the back of the head
  let hairUv: [number, number] = [0, 0];
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(P.getX(i), P.getY(i) - 1.6, P.getZ(i) + 0.097);
    if (d < best) {
      best = d;
      hairUv = [UV.getX(i), UV.getY(i)];
    }
  }
  // (the ponytail on bones of its own, on the head, the neck and the upper back: see PARTS)
  const head = bones.indexOf('Tail');
  const back = bones.indexOf('TailBack');
  const neck = bones.indexOf('TailNeck');
  if (head >= 0 && back >= 0 && neck >= 0) {
    const curve = new THREE.CatmullRomCurve3(TAIL.line.map((v) => vec(v)));
    const frames = curve.computeFrenetFrames(TAIL.rings - 1, false);
    const base = pos.length / 3;
    const across = new THREE.Vector3(1, 0, 0);
    for (let r = 0; r < TAIL.rings; r++) {
      const t = r / (TAIL.rings - 1);
      const c = curve.getPointAt(t);
      // (round the line: across is the model's x, the other way in the plane of the line)
      const up = new THREE.Vector3().crossVectors(frames.tangents[r], across).normalize();
      const rad = lerpTable(TAIL.radius, t);
      const kBack = 0.6 * smooth(0.15, 1, t);
      const kNeck = 0.25 * smooth(0.1, 0.5, t) * (1 - smooth(0.6, 1, t));
      for (let s = 0; s < TAIL.sides; s++) {
        const a = (s / TAIL.sides) * Math.PI * 2;
        const o = across.clone().multiplyScalar(Math.cos(a) * rad).addScaledVector(up, Math.sin(a) * rad * TAIL.depth);
        pos.push(c.x + o.x, c.y + o.y, c.z + o.z);
        const nm = across.clone().multiplyScalar(Math.cos(a) * TAIL.depth).addScaledVector(up, Math.sin(a)).normalize();
        nrm.push(nm.x, nm.y, nm.z);
        uv.push(hairUv[0], hairUv[1]);
        ji.push(head, back, neck, 0);
        jw.push(Math.max(0, 1 - kBack - kNeck), kBack, kNeck, 0);
      }
    }
    for (let r = 0; r < TAIL.rings - 1; r++)
      for (let s = 0; s < TAIL.sides; s++) {
        const a = base + r * TAIL.sides + s;
        const b = base + r * TAIL.sides + ((s + 1) % TAIL.sides);
        // (wound outwards)
        index.push(a, b, a + TAIL.sides, b, b + TAIL.sides, a + TAIL.sides);
      }
  }
  const visor = bones.indexOf('Visor');
  if (visor >= 0) addVisor(pos, nrm, uv, ji, jw, index, visor, uvAt(P, UV, VISOR.uvAt));
  const bob = bones.indexOf('Bob');
  if (bob >= 0) addBob(pos, nrm, uv, ji, jw, index, bob, hairUv, n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ji, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(jw, 4));
  g.setIndex(index);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** the UV of the model's vertex nearest a point (bind pose): where an added part takes its colour from */
function uvAt(P: Attr, UV: Attr, at: V3): [number, number] {
  let best = Infinity;
  let out: [number, number] = [0, 0];
  for (let i = 0; i < P.count; i++) {
    const d = Math.hypot(P.getX(i) - at[0], P.getY(i) - at[1], P.getZ(i) - at[2]);
    if (d < best) {
      best = d;
      out = [UV.getX(i), UV.getY(i)];
    }
  }
  return out;
}

/**
 * The visor: a band round the head over the hairline (an ellipse a few millimetres out from the head, the back a
 * little higher) and a curved peak over the front, both a few millimetres thick. White: its colour is the socks'.
 */
const VISOR = { cx: 0, cz: 0.003, rx: 0.092, rz: 0.104, y: 1.622, back: 0.018, h: 0.03, peak: 0.068, spread: 1.25, droop: 0.2, thick: 0.004, uvAt: [0.12, 0.17, 0.06] as V3 };
function addVisor(pos: number[], nrm: number[], uv: number[], ji: number[], jw: number[], index: number[], bone: number, col: [number, number]) {
  const V = VISOR;
  const S = 36;
  const add = (x: number, y: number, z: number, n: THREE.Vector3) => {
    pos.push(x, y, z);
    nrm.push(n.x, n.y, n.z);
    uv.push(col[0], col[1]);
    ji.push(bone, 0, 0, 0);
    jw.push(1, 0, 0, 0);
    return pos.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => index.push(a, b, c, a, c, d);
  const nv = new THREE.Vector3();
  // the band: outside and inside walls (the inside one tucked into the head), round the head
  const ring = (rOff: number, dy: number, out: boolean) => {
    const ids: number[] = [];
    for (let i = 0; i <= S; i++) {
      const a = (i / S) * Math.PI * 2;
      const sx = Math.sin(a);
      const cz = Math.cos(a);
      const y = V.y + V.back * (1 - cz) * 0.5 + dy;
      nv.set(sx / V.rx, 0, cz / V.rz).normalize();
      if (!out) nv.negate();
      ids.push(add(V.cx + sx * (V.rx + rOff), y, V.cz + cz * (V.rz + rOff), nv));
    }
    return ids;
  };
  const lo = ring(0, 0, true);
  const hi = ring(0, V.h, true);
  for (let i = 0; i < S; i++) quad(lo[i], lo[i + 1], hi[i + 1], hi[i]);
  const tlo = ring(-V.thick, 0, false);
  const thi = ring(-V.thick, V.h, false);
  for (let i = 0; i < S; i++) quad(thi[i], thi[i + 1], tlo[i + 1], tlo[i]);
  // the top edge
  nv.set(0, 1, 0);
  const e1 = ring(0, V.h, true);
  const e2 = ring(-V.thick, V.h, true);
  for (let i = 0; i <= S; i++) {
    nrm.splice(e1[i] * 3, 3, 0, 1, 0);
    nrm.splice(e2[i] * 3, 3, 0, 1, 0);
  }
  for (let i = 0; i < S; i++) quad(e2[i], e2[i + 1], e1[i + 1], e1[i]);
  // the peak over the front: from the band's foot out and a little down, widest in the middle
  const P = 24;
  const top: number[] = [];
  const bot: number[] = [];
  const inTop: number[] = [];
  const inBot: number[] = [];
  for (let i = 0; i <= P; i++) {
    const a = (i / P - 0.5) * 2 * V.spread;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    const w = Math.max(0, Math.cos((a / V.spread) * Math.PI * 0.5));
    const len = V.peak * Math.pow(w, 0.7);
    const bx = V.cx + sx * V.rx;
    const bz = V.cz + cz * V.rz;
    const by = V.y + V.back * (1 - cz) * 0.5 + 0.002;
    const ox = bx + sx * len;
    const oz = bz + cz * len;
    const oy = by - len * V.droop;
    nv.set(sx * V.droop, 1, cz * V.droop).normalize();
    inTop.push(add(bx, by + V.thick * 0.5, bz, nv));
    top.push(add(ox, oy + V.thick * 0.5, oz, nv));
    nv.negate();
    inBot.push(add(bx, by - V.thick * 0.5, bz, nv));
    bot.push(add(ox, oy - V.thick * 0.5, oz, nv));
  }
  for (let i = 0; i < P; i++) {
    quad(inTop[i], inTop[i + 1], top[i + 1], top[i]);
    quad(inBot[i + 1], inBot[i], bot[i], bot[i + 1]);
    // (the rim)
    quad(top[i], top[i + 1], bot[i + 1], bot[i]);
  }
}

/**
 * Hair down to the jaw (a bob): a shell over the head and down round it, the hair falling straight from the widest of
 * the head above (measured on the women's head: so many sectors round it, so many levels down), open over the face
 * (a fringe at the hairline, the sides coming down in front of the ears), a few millimetres thick at its hem.
 */
const BOB = { top: 1.712, hem: 1.478, fringe: 1.636, face: 0.92, edge: 0.32, gap: 0.009, flare: 0.014, thick: 0.004, sectors: 40, levels: 16, cz: -0.004 };
function addBob(pos: number[], nrm: number[], uv: number[], ji: number[], jw: number[], index: number[], bone: number, col: [number, number], n: number) {
  const B = BOB;
  const S = B.sectors;
  const L = B.levels;
  // the head's radius by sector and level
  const head: number[][] = [];
  const yAt = (k: number, j: number) => {
    const th = -Math.PI + (k / S) * Math.PI * 2;
    const hem = B.fringe + (B.hem - B.fringe) * smooth(B.face, B.face + B.edge, Math.abs(th));
    return B.top + (hem - B.top) * (j / (L - 1));
  };
  // (the head's vertices once: height, angle round the head, radius)
  const hv: number[] = [];
  for (let i = 0; i < n; i++) {
    const py = pos[i * 3 + 1];
    const px = pos[i * 3];
    const pz = pos[i * 3 + 2] - B.cz;
    if (py < 1.45 || Math.abs(px) > 0.13) continue;
    hv.push(py, Math.atan2(px, pz), Math.hypot(px, pz));
  }
  // (each head vertex raises the radius of the sectors and levels it is near: within a sector's width round the head
  // and 12 mm up or down)
  for (let k = 0; k < S; k++) head.push(new Array(L).fill(0.02));
  const step = (Math.PI * 2) / S;
  for (let i = 0; i < hv.length; i += 3) {
    const y = hv[i];
    const f = (hv[i + 1] + Math.PI) / step;
    for (let kk = Math.floor(f - 1); kk <= Math.ceil(f + 1); kk++) {
      if (Math.abs(f - kk) > 1) continue;
      const k = ((kk % S) + S) % S;
      const y0 = yAt(k, 0);
      const dy = (yAt(k, L - 1) - y0) / (L - 1);
      const j0 = Math.max(0, Math.ceil((y + (dy < 0 ? 0.012 : -0.012) - y0) / dy));
      const j1 = Math.min(L - 1, Math.floor((y - (dy < 0 ? 0.012 : -0.012) - y0) / dy));
      for (let j = j0; j <= j1; j++) head[k][j] = Math.max(head[k][j], hv[i + 2]);
    }
  }
  const grid = (off: number) => {
    const ids: number[][] = [];
    for (let k = 0; k <= S; k++) {
      const kk = k % S;
      const th = -Math.PI + (kk / S) * Math.PI * 2;
      const row: number[] = [];
      let r = 0;
      for (let j = 0; j < L; j++) {
        const y = yAt(kk, j);
        // (straight down from the widest above: the hair falls clear of the jaw and the neck)
        r = Math.max(r, head[kk][j]);
        const rr = r + B.gap + B.flare * smooth(1.56, B.hem, y) + off;
        pos.push(Math.sin(th) * rr, y, B.cz + Math.cos(th) * rr);
        nrm.push(Math.sin(th), 0.3 * (1 - j / (L - 1)), Math.cos(th));
        uv.push(col[0], col[1]);
        ji.push(bone, 0, 0, 0);
        jw.push(1, 0, 0, 0);
        row.push(pos.length / 3 - 1);
      }
      ids.push(row);
    }
    return ids;
  };
  const out = grid(0);
  const inn = grid(-B.thick);
  for (let k = 0; k < S; k++)
    for (let j = 0; j < L - 1; j++) {
      const a = out[k][j];
      const b = out[k + 1][j];
      const c = out[k][j + 1];
      const d = out[k + 1][j + 1];
      index.push(a, c, b, b, c, d);
      const ia = inn[k][j];
      const ib = inn[k + 1][j];
      const ic = inn[k][j + 1];
      const id = inn[k + 1][j + 1];
      index.push(ia, ib, ic, ib, id, ic);
    }
  // the hem's edge
  for (let k = 0; k < S; k++) {
    const j = L - 1;
    index.push(out[k][j], inn[k][j], out[k + 1][j], out[k + 1][j], inn[k][j], inn[k + 1][j]);
  }
  // the normals from the shell's own shape (the inside facing in)
  const np = (ids: number[][], sign: number) => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const v = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    for (let k = 0; k <= S; k++)
      for (let j = 0; j < L; j++) {
        const kp = ids[Math.min(S, k + 1)][j];
        const km = ids[Math.max(0, k - 1)][j];
        const jp = ids[k][Math.min(L - 1, j + 1)];
        const jm = ids[k][Math.max(0, j - 1)];
        a.subVectors(v(kp), v(km));
        b.subVectors(v(jp), v(jm));
        const nn = new THREE.Vector3().crossVectors(b, a).normalize().multiplyScalar(sign);
        const i = ids[k][j];
        // (outward: away from the head's axis)
        const out = new THREE.Vector3(pos[i * 3], 0, pos[i * 3 + 2] - B.cz);
        if (nn.dot(out) * sign < 0 && j > 0) nn.negate();
        nrm.splice(i * 3, 3, nn.x, nn.y, nn.z);
      }
  };
  np(out, 1);
  np(inn, -1);
}

/** the parts some women wear and others do not, each on bones of its own (see applyBuild): bone, parent, part */
const PARTS: [string, string, 'visor' | 'tail' | 'bob'][] = [
  ['Visor', 'head_end', 'visor'],
  ['Tail', 'head_end', 'tail'],
  ['TailNeck', 'neck', 'tail'],
  ['TailBack', 'Spine', 'tail'],
  ['Bob', 'head_end', 'bob'],
];

/**
 * The women's template: the players' template (bones and all) with the women's geometry, and a bone for each part that
 * not every woman wears (on its parent bone, where it is): a player without it has that bone's skin scaled to nothing.
 */
export function womanTemplate(template: THREE.Object3D, clone: (o: THREE.Object3D) => THREE.Object3D): THREE.Object3D {
  const out = clone(template);
  out.updateMatrixWorld(true);
  out.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const sk = m.skeleton;
    const bones = [...sk.bones];
    const inv = [...sk.boneInverses];
    for (const [name, parent] of PARTS) {
      const pi = bones.findIndex((b) => b.name === parent);
      if (pi < 0) continue;
      const b = new THREE.Bone();
      b.name = name;
      bones[pi].add(b);
      bones.push(b);
      inv.push(inv[pi].clone());
    }
    m.bind(new THREE.Skeleton(bones, inv), m.bindMatrix);
    const bind: Record<string, THREE.Vector3> = {};
    bones.forEach((b, i) => (bind[b.name] = new THREE.Vector3().setFromMatrixPosition(inv[i].clone().invert())));
    m.geometry = womanGeometry(m.geometry, bones.map((b) => b.name), bind);
  });
  return out;
}
