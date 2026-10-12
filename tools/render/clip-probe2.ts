// Más medidas de un clip: el codo derecho, la cabeza de la raqueta (punto dulce) y la punta, y la mano izquierda, cada
// `step` s (modelo de 1,7 m: x a la izquierda del modelo, y arriba, z adelante).
// Uso: npx tsx tools/render/clip-probe2.ts rol [step] [desde] [hasta]   (rol: un clip ya cargado, p. ej. serve)
import '../node-chars';
import * as THREE from 'three';
import { CLIP_NAMES, PADDLE_POSE, loadCharAssets } from '../../src/render/chars';
import { RACKET } from '../../src/render/gear';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

(async () => {
  const role = process.argv[2];
  const step = Number(process.argv[3] ?? 0.05);
  const a = await loadCharAssets('', 'hero', CLIP_NAMES);
  const c = a.clips[role];
  const obj = clone(a.template);
  const mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(c).play();
  const B: Record<string, THREE.Object3D> = {};
  obj.traverse((o) => {
    if ((o as THREE.Bone).isBone) B[o.name] = o;
  });
  const P = PADDLE_POSE;
  const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(P[0], P[1], P[2]));
  const off = new THREE.Vector3(P[3], P[4], P[5]);
  const f = (v: THREE.Vector3) => `${v.x.toFixed(2).padStart(5)} ${v.y.toFixed(2)} ${v.z.toFixed(2).padStart(5)}`;
  const t0 = Number(process.argv[4] ?? 0);
  const t1 = Number(process.argv[5] ?? c.duration);
  console.log(`${role}: ${c.duration.toFixed(2)} s, contacto ${a.contact[role as never]}`);
  console.log('   t   codoD              punto dulce         punta               manoI            cadY   pecho°');
  for (let t = t0; t <= t1 + 1e-6; t += step) {
    mixer.setTime(t);
    obj.updateMatrixWorld(true);
    const h = B.RightHand;
    const sweet = h.localToWorld(new THREE.Vector3(0, RACKET.face * 100, 0).applyQuaternion(rot).add(off));
    const tip = h.localToWorld(new THREE.Vector3(0, RACKET.top * 100, 0).applyQuaternion(rot).add(off));
    const q = B.Spine.getWorldQuaternion(new THREE.Quaternion());
    const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const hp = B.Hips.getWorldPosition(new THREE.Vector3());
    const sh = B.RightArm.getWorldPosition(new THREE.Vector3());
    if (process.env.HIPS) console.log(`      cadera ${f(hp)}  hombroD ${f(sh)}  pecho ${f(B.Spine.getWorldPosition(new THREE.Vector3()))}  cabeza ${f(B.Head.getWorldPosition(new THREE.Vector3()))}`);
    console.log(`${t.toFixed(2).padStart(5)}  ${f(B.RightForeArm.getWorldPosition(new THREE.Vector3()))}   ${f(sweet)}   ${f(tip)}   ${f(B.LeftHand.getWorldPosition(new THREE.Vector3()))}  ${B.Hips.getWorldPosition(new THREE.Vector3()).y.toFixed(2)}  ${((Math.atan2(fw.x, fw.z) * 180) / Math.PI).toFixed(0).padStart(5)}`);
  }
})();
