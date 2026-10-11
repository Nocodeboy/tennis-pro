// A locomotion clip's feet, read off the clip itself (no game on top): for each foot, every 1/60 s, its height over the
// floor and its velocity in the model's frame, the foot contacts (when each foot is down, and how fast it moves back
// while down: the ground speed the clip's steps call for), the direction the stance foot moves (the heading the clip
// runs along), the stride period (from the contacts) and how well the clip loops over a window (pose distance between
// its ends). Also the frame-to-frame jitter of the bones.
// Usage: npx tsx tools/clip-feet.ts <file in assets/anims, e.g. run_v2 | role:<a role of CLIP_FILES, as the game plays it,
// e.g. role:run (its loop window)>> [window start] [window end] · MINL, MAXL: the loop lengths searched (s)

import './node-chars';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CLIP_NAMES, loadCharAssets } from '../src/render/chars';

const FILE = process.argv[2] ?? 'run_v2';
const W0 = process.argv[3] !== undefined ? Number(process.argv[3]) : NaN;
const W1 = process.argv[4] !== undefined ? Number(process.argv[4]) : NaN;

interface ClipJson {
  name: string;
  duration: number;
  tracks: { n: string; t: number[]; v: number[] }[];
}

(async () => {
  const role = FILE.startsWith('role:') ? FILE.slice(5) : null;
  const a = await loadCharAssets('', 'hero', role ? CLIP_NAMES : ['ready']);
  let clip: THREE.AnimationClip;
  if (role) {
    if (!a.clips[role]) throw new Error(`no clip for ${role}`);
    clip = a.clips[role];
  } else {
    const jf = JSON.parse(readFileSync(`assets/anims/${FILE}.json`, 'utf8')) as ClipJson;
    clip = new THREE.AnimationClip(
      jf.name,
      jf.duration,
      jf.tracks.map((t) => (t.n.endsWith('.quaternion') ? new THREE.QuaternionKeyframeTrack(t.n, t.t, t.v) : new THREE.VectorKeyframeTrack(t.n, t.t, t.v))),
    );
  }
  const j = { duration: clip.duration };
  const model = cloneSkinned(a.template);
  const sc = 1.78 / 1.7;
  model.scale.setScalar(sc);
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();
  const B: Record<string, THREE.Object3D> = {};
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) B[o.name] = o;
  });
  const dt = 1 / 60;
  // (a loop of the game: its last frame is its first)
  const n = role && role !== 'ready' && Math.abs(j.duration / dt - Math.round(j.duration / dt)) < 0.05 ? Math.round(j.duration / dt) : Math.floor(j.duration / dt) + 1;
  const ank = [B.LeftFoot, B.RightFoot];
  const toe = [B.LeftToeBase, B.RightToeBase];
  const P = { ank: [[], []] as THREE.Vector3[][], toe: [[], []] as THREE.Vector3[][], hips: [] as THREE.Vector3[], hipFwd: [] as number[] };
  const quats: number[][] = [];
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    mixer.setTime(i * dt);
    root.updateMatrixWorld(true);
    for (let k = 0; k < 2; k++) {
      P.ank[k].push(ank[k].getWorldPosition(new THREE.Vector3()));
      P.toe[k].push(toe[k].getWorldPosition(new THREE.Vector3()));
    }
    P.hips.push(B.Hips.getWorldPosition(new THREE.Vector3()));
    // the hips' facing (yaw of the hips' forward, flattened; +: to the model's left, which is +x)
    B.Hips.getWorldQuaternion(q);
    v.set(0, 0, 1).applyQuaternion(q);
    P.hipFwd.push(Math.atan2(v.x, v.z));
    const row: number[] = [];
    for (const name of ['Hips', 'Spine', 'Spine01', 'Spine02', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'Head']) {
      if (!B[name]) continue;
      const bq = B[name].quaternion;
      row.push(bq.x, bq.y, bq.z, bq.w);
    }
    quats.push(row);
  }
  // soles over the floor: the ankle 7 cm over it flat, the toe bone 2 cm under it on the ball of the foot
  const sole = (k: number, i: number) => Math.min(P.ank[k][i].y - 0.07, P.toe[k][i].y + 0.02);
  let floor = Infinity;
  for (let i = 0; i < n; i++) floor = Math.min(floor, sole(0, i), sole(1, i));
  const deg = (r: number) => (r * 180) / Math.PI;
  console.log(`${FILE}: ${j.duration.toFixed(3)} s (${role ? 'bucle del juego' : 'archivo'}), ${n} muestras a 60 fps · suelo (pie más bajo) ${floor.toFixed(3)} m`);
  console.log('t      | pie izq: suela  vx    vz   | pie der: suela  vx    vz   | caderas y  | caderas yaw');
  const vel = (k: number, i: number) => {
    const a0 = P.toe[k][Math.max(0, i - 1)];
    const a1 = P.toe[k][Math.min(n - 1, i + 1)];
    const h = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * dt;
    return [(a1.x - a0.x) / h, (a1.z - a0.z) / h];
  };
  for (let i = 0; i < n; i += 2) {
    const l = vel(0, i);
    const r = vel(1, i);
    console.log(
      `${(i * dt).toFixed(3)}  |  ${(sole(0, i) - floor).toFixed(3)}  ${l[0].toFixed(2).padStart(5)} ${l[1].toFixed(2).padStart(5)} |  ${(sole(1, i) - floor).toFixed(3)}  ${r[0].toFixed(2).padStart(5)} ${r[1].toFixed(2).padStart(5)} | ${P.hips[i].y.toFixed(3)} | ${deg(P.hipFwd[i]).toFixed(1)}`,
    );
  }
  // contacts: a foot within 2.5 cm of the floor
  for (const thr of [0.025, 0.04]) {
    console.log(`\napoyos (suela a menos de ${thr * 100} cm del suelo):`);
    for (let k = 0; k < 2; k++) {
      let s = -1;
      for (let i = 0; i <= n; i++) {
        const down = i < n && sole(k, i) - floor < thr;
        if (down && s < 0) s = i;
        if (!down && s >= 0) {
          const e = i - 1;
          // the stance foot's velocity: from where it lands to where it leaves (toe)
          const dx = P.toe[k][e].x - P.toe[k][s].x;
          const dz = P.toe[k][e].z - P.toe[k][s].z;
          const T = (e - s) * dt;
          const vs: number[] = [];
          for (let m = s; m <= e; m++) vs.push(Math.hypot(...vel(k, m)));
          console.log(
            `  ${k ? 'der' : 'izq'} ${(s * dt).toFixed(3)}–${(e * dt).toFixed(3)} (${T.toFixed(3)} s): recorre ${Math.hypot(dx, dz).toFixed(3)} m → ${T > 0 ? (Math.hypot(dx, dz) / T).toFixed(2) : '–'} m/s, rumbo ${deg(Math.atan2(-dx, -dz)).toFixed(1)}° · velocidad instantánea ${Math.min(...vs).toFixed(2)}–${Math.max(...vs).toFixed(2)}`,
          );
          s = -1;
        }
      }
    }
  }
  // summary (a loop: contacts may wrap round the end): each stance at 3 cm, its touchdown (s into the clip), the stance
  // foot's speed in mid-stance (median of the instantaneous speed, 1.78 m and 1.7 m model) and the heading of the body
  // it carries (deg, + to the model's left)
  {
    const thr = 0.03;
    const all: number[] = [];
    const hd: number[] = [];
    for (let k = 0; k < 2; k++) {
      const down = (i: number) => sole(k, ((i % n) + n) % n) - floor < thr;
      // the first frame not down, to start from
      let i0 = 0;
      while (i0 < n && down(i0)) i0++;
      const ts: string[] = [];
      for (let i = i0; i < i0 + n; i++) {
        if (!down(i) && down(i + 1)) {
          let e = i + 1;
          while (e < i + 1 + n && down(e)) e++;
          const vs: number[] = [];
          let dx = 0;
          let dz = 0;
          for (let m = i + 1; m < e; m++) {
            const vv = vel(k, m % n);
            vs.push(Math.hypot(vv[0], vv[1]));
            dx += vv[0];
            dz += vv[1];
          }
          vs.sort((x, y) => x - y);
          const mid = vs[Math.floor(vs.length / 2)] ?? NaN;
          all.push(mid);
          hd.push(deg(Math.atan2(-dx, -dz)));
          ts.push(`${(((i + 1) % n) * dt).toFixed(3)} (${((e - i - 1) * dt).toFixed(2)} s, ${mid.toFixed(2)} m/s, rumbo ${deg(Math.atan2(-dx, -dz)).toFixed(1)}°)`);
        }
      }
      console.log(`  ${k ? 'der' : 'izq'} pisa a ${ts.join(' · ')}`);
    }
    const avg = (x: number[]) => x.reduce((u, w) => u + w, 0) / Math.max(1, x.length);
    console.log(`  RESUMEN apoyo: ${avg(all).toFixed(2)} m/s (modelo de 1,78 m) = ${(avg(all) / sc).toFixed(2)} m/s (modelo de 1,7 m) · rumbo medio ${avg(hd).toFixed(1)}°`);
  }
  // the loop: pose distance between t and t + L for candidate windows
  const dist = (i: number, k: number) => {
    let s = 0;
    const A = quats[i];
    const Bq = quats[k];
    for (let m = 0; m < A.length; m += 4) {
      const d = Math.abs(A[m] * Bq[m] + A[m + 1] * Bq[m + 1] + A[m + 2] * Bq[m + 2] + A[m + 3] * Bq[m + 3]);
      s = Math.max(s, 2 * Math.acos(Math.min(1, d)));
    }
    // and the feet, relative to the hips (m)
    let f = 0;
    for (let kk = 0; kk < 2; kk++) {
      const ai = P.ank[kk][i].clone().sub(P.hips[i]);
      const ak = P.ank[kk][k].clone().sub(P.hips[k]);
      f = Math.max(f, ai.distanceTo(ak));
    }
    return { rot: deg(s), feet: f };
  };
  console.log('\nbucles (mejor fin para cada inicio, entre 0,45 y 1,3 s de largo): peor giro de un hueso entre los extremos · pies');
  const cands: { a: number; b: number; rot: number; feet: number }[] = [];
  for (let i = 0; i < n; i += 2) {
    let best = { a: i, b: -1, rot: Infinity, feet: Infinity };
    for (let k = i + Math.round(Number(process.env.MINL ?? 0.45) / dt); k < Math.min(n, i + Math.round(Number(process.env.MAXL ?? 1.3) / dt)); k++) {
      const d = dist(i, k);
      const score = d.rot + d.feet * 200;
      if (score < best.rot + best.feet * 200) best = { a: i, b: k, ...d };
    }
    if (best.b > 0) cands.push(best);
  }
  cands.sort((x, y) => x.rot + x.feet * 200 - (y.rot + y.feet * 200));
  for (const c of cands.slice(0, 12)) console.log(`  ${(c.a * dt).toFixed(3)}–${(c.b * dt).toFixed(3)} (${((c.b - c.a) * dt).toFixed(3)} s): ${c.rot.toFixed(1)}° · pies ${(c.feet * 100).toFixed(1)} cm`);
  if (Number.isFinite(W0) && Number.isFinite(W1)) {
    const d = dist(Math.round(W0 / dt), Math.round(W1 / dt));
    console.log(`ventana ${W0}–${W1}: ${d.rot.toFixed(1)}° · pies ${(d.feet * 100).toFixed(1)} cm`);
  }
  // jitter: the second difference of each bone's turn (deg/s²), the worst frames
  const jit: { t: number; v: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    let w = 0;
    for (let m = 0; m < quats[i].length; m += 4) {
      const ang = (A: number[], Bq: number[]) => 2 * Math.acos(Math.min(1, Math.abs(A[m] * Bq[m] + A[m + 1] * Bq[m + 1] + A[m + 2] * Bq[m + 2] + A[m + 3] * Bq[m + 3])));
      w = Math.max(w, Math.abs(ang(quats[i + 1], quats[i]) - ang(quats[i], quats[i - 1])) / dt);
    }
    jit.push({ t: i * dt, v: deg(w) });
  }
  const sorted = [...jit].sort((x, y) => y.v - x.v);
  const med = [...jit].sort((x, y) => x.v - y.v)[Math.floor(jit.length / 2)].v;
  console.log(`\nsaltos (cambio de la velocidad de giro de un hueso entre fotogramas, °/s): mediana ${med.toFixed(0)}, peores ${sorted.slice(0, 6).map((x) => `${x.v.toFixed(0)} a ${x.t.toFixed(2)} s`).join(', ')}`);
  // hips: drift-free? (in place) vertical bob
  const hy = P.hips.map((h) => h.y);
  console.log(`caderas: ${Math.min(...hy).toFixed(3)}–${Math.max(...hy).toFixed(3)} m; x ${Math.min(...P.hips.map((h) => h.x)).toFixed(3)}…${Math.max(...P.hips.map((h) => h.x)).toFixed(3)}`);
})();
