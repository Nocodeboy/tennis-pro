import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

export type Part = THREE.BufferGeometry;

/** Transform + colour a primitive so it can be merged into a vertex-coloured model. */
export function part(
  g: THREE.BufferGeometry,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): Part {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  g.dispose();
  tmpE.set(rx, ry, rz);
  tmpQ.setFromEuler(tmpE);
  tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(tmpM);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  tmpC.setHex(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}

export function merge(parts: Part[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);
export const ico = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
export const dode = (r: number) => new THREE.DodecahedronGeometry(r, 0);
export const sphere = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);

/** Triangular prism (gable roof). Ridge runs along X. */
export function prism(len: number, width: number, height: number): THREE.BufferGeometry {
  const l = len / 2;
  const w = width / 2;
  const v = [
    // left/right triangles
    [-l, 0, -w],
    [-l, 0, w],
    [-l, height, 0],
    [l, 0, w],
    [l, 0, -w],
    [l, height, 0],
  ];
  const tris = [
    [0, 1, 2],
    [3, 4, 5],
    // front slope (z+)
    [1, 3, 5],
    [1, 5, 2],
    // back slope (z-)
    [4, 0, 2],
    [4, 2, 5],
    // bottom
    [0, 4, 3],
    [0, 3, 1],
  ];
  const pos: number[] = [];
  for (const t of tris) for (const i of t) pos.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Flame: low-poly twisted teardrop with a vertical colour gradient baked in. */
export function flameGeometry(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.34, 1, 5, 3, false);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c0 = new THREE.Color(0xfff2a0);
  const c1 = new THREE.Color(0xffa21f);
  const c2 = new THREE.Color(0xf0441a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // bulge near the bottom, twist upward
    const ang = y * 1.4;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const bul = 1 + Math.sin(Math.min(1, y * 2.2) * Math.PI) * 0.35 - y * 0.2;
    pos.setX(i, (x * Math.cos(ang) - z * Math.sin(ang)) * bul);
    pos.setZ(i, (x * Math.sin(ang) + z * Math.cos(ang)) * bul);
    if (y < 0.45) c.copy(c0).lerp(c1, y / 0.45);
    else c.copy(c1).lerp(c2, (y - 0.45) / 0.55);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
