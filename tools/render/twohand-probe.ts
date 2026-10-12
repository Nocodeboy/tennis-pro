// Dónde tiene la mano izquierda el revés a dos manos de captura (backhand_mocap) respecto a la raqueta de la mano
// derecha (gear.ts, PADDLE_POSE): a lo largo de la raqueta (m, desde la muñeca derecha) y a lo largo de la normal de la
// cara, cada 0,05 s. Uso: npx tsx tools/render/twohand-probe.ts
import '../node-chars';
import * as THREE from 'three';
import { CLIP_NAMES, PADDLE_POSE, loadCharAssets } from '../../src/render/chars';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

(async () => {
  const a = await loadCharAssets('', 'hero', CLIP_NAMES);
  const c = a.clips.backhand;
  const obj = clone(a.template);
  const mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(c).play();
  const B: Record<string, THREE.Object3D> = {};
  obj.traverse((o) => {
    if ((o as THREE.Bone).isBone) B[o.name] = o;
  });
  const P = PADDLE_POSE;
  const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(P[0], P[1], P[2]));
  for (let t = 0.5; t <= 1.35; t += 0.05) {
    mixer.setTime(t);
    obj.updateMatrixWorld(true);
    const rq = B.RightHand.getWorldQuaternion(new THREE.Quaternion()).multiply(rot);
    const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(rq);
    const nx = new THREE.Vector3(1, 0, 0).applyQuaternion(rq);
    const rw = B.RightHand.getWorldPosition(new THREE.Vector3());
    const lw = B.LeftHand.getWorldPosition(new THREE.Vector3());
    const d = lw.clone().sub(rw);
    const along = d.dot(ax);
    const off = d.dot(nx);
    const rest = d.clone().addScaledVector(ax, -along).addScaledVector(nx, -off).length();
    console.log(`${t.toFixed(2)}  a lo largo ${along.toFixed(3)}  normal ${off.toFixed(3)}  resto ${rest.toFixed(3)}  dist ${d.length().toFixed(3)}`);
  }
})();
