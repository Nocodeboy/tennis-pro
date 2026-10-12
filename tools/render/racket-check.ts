// Comprueba la geometría de la raqueta (gear.ts): medidas, triángulos y que las caras miren hacia fuera (la normal de
// cada triángulo frente a la de sus vértices). Uso: npx tsx tools/render/racket-check.ts
import '../node-chars';
import * as THREE from 'three';
import { paddleMesh, RACKET } from '../../src/render/gear';

for (const shape of ['standard', 'elongated', 'hybrid'] as const) {
  const g = paddleMesh(0xc8372d, 0x15171a, { shape, face: 'carbon', graphic: 0xc8372d, graphic2: 0xffffff, grip: 0x1c1c1e });
  const body = g.children[0] as THREE.Mesh;
  const st = g.children[1] as THREE.Mesh;
  const geo = body.geometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  let bad = 0;
  const tri = p.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3();
  for (let i = 0; i < tri; i++) {
    a.fromBufferAttribute(p, i * 3);
    b.fromBufferAttribute(p, i * 3 + 1);
    c.fromBufferAttribute(p, i * 3 + 2);
    fn.subVectors(b, a).cross(c.clone().sub(a));
    if (fn.lengthSq() < 1e-14) continue;
    vn.fromBufferAttribute(n, i * 3).add(c.fromBufferAttribute(n, i * 3 + 1)).add(c.fromBufferAttribute(n, i * 3 + 2));
    if (fn.dot(vn) < 0) bad++;
  }
  console.log(shape, `largo ${(bb.max.y - bb.min.y).toFixed(3)} m · cabeza ${(bb.max.z - bb.min.z).toFixed(3)} m de ancho · canto ${(bb.max.x - bb.min.x).toFixed(3)} · triángulos ${tri} (+${st.geometry.index ? st.geometry.index.count / 3 : st.geometry.attributes.position.count / 3} cuerdas) · al revés ${bad} · grupos ${geo.groups.length} · punto dulce ${RACKET.face}`);
}
