// Mide un clip de assets/anims sobre el esqueleto del jugador: cada `step` s, la altura de la cadera, el giro del pecho
// (rad, 0 mirando a +z), las muñecas (m: x a la izquierda del modelo, y arriba, z adelante; modelo de 1,7 m) y la
// cabeza. Uso: npx tsx tools/render/clip-probe.ts clip [step = 0.05] [desde] [hasta]
import '../node-chars';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { loadCharAssets } from '../../src/render/chars';

(async () => {
  const name = process.argv[2];
  const step = Number(process.argv[3] ?? 0.05);
  const a = await loadCharAssets('', 'hero', ['ready']);
  const j = JSON.parse(readFileSync(`assets/anims/${name}.json`, 'utf8'));
  const tracks = j.tracks.map((tr: { n: string; t: number[]; v: number[] }) => (tr.n.endsWith('.quaternion') ? new THREE.QuaternionKeyframeTrack(tr.n, tr.t, tr.v) : new THREE.VectorKeyframeTrack(tr.n, tr.t, tr.v)));
  const clip = new THREE.AnimationClip(name, j.duration, tracks);
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const obj = clone(a.template);
  const mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(clip).play();
  const B: Record<string, THREE.Object3D> = {};
  obj.traverse((o) => {
    if ((o as THREE.Bone).isBone) B[o.name] = o;
  });
  const p = (n: string) => B[n].getWorldPosition(new THREE.Vector3());
  const f = (v: THREE.Vector3) => `${v.x.toFixed(2).padStart(5)} ${v.y.toFixed(2)} ${v.z.toFixed(2).padStart(5)}`;
  const t0 = Number(process.argv[4] ?? 0);
  const t1 = Number(process.argv[5] ?? j.duration);
  console.log(`${name}: ${j.duration.toFixed(2)} s`);
  console.log('   t   caderaY  pecho°  muñD (x y z)        muñI (x y z)        pieI          pieD');
  for (let t = t0; t <= t1 + 1e-6; t += step) {
    mixer.setTime(t);
    obj.updateMatrixWorld(true);
    const q = B.Spine.getWorldQuaternion(new THREE.Quaternion());
    const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const hips = new THREE.Vector3(0, 0, 1).applyQuaternion(B.Hips.getWorldQuaternion(new THREE.Quaternion()));
    console.log(`${t.toFixed(2).padStart(5)}  ${p('Hips').y.toFixed(2)}  ${((Math.atan2(fw.x, fw.z) * 180) / Math.PI).toFixed(0).padStart(5)} ${((Math.atan2(hips.x, hips.z) * 180) / Math.PI).toFixed(0).padStart(5)}  ${f(p('RightHand'))}   ${f(p('LeftHand'))}   ${f(p('LeftFoot'))}  ${f(p('RightFoot'))}`);
  }
})();
