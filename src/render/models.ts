// Low-poly people, paddles and the club around the court, in the studio's style: primitives merged into
// vertex-coloured meshes, flat shaded. Players are rigs (groups per limb) animated in code.

import * as THREE from 'three';
import { box, cone, cyl, merge, part, sphere, type Part } from './geo';

const PI = Math.PI;
const DARK = 0x23262d;

export interface Look {
  shirt: number;
  trim: number;
  shorts: number;
  skin: number;
  hair: number;
  style: 'short' | 'pony' | 'bald' | 'bob' | 'bun' | 'grey';
  hat: 'none' | 'cap' | 'visor' | 'band';
  hatColor: number;
  paddle: number;
  paddleEdge: number;
  shoes: number;
  beard?: number;
  skirt?: boolean;
}

/** 0 = the player; 1… = the rivals of the ladder, in order. */
export const LOOKS: Look[] = [
  { shirt: 0xff6b4a, trim: 0xfff4e8, shorts: 0x23324a, skin: 0xf1c7a0, hair: 0x3a2a1e, style: 'short', hat: 'none', hatColor: 0, paddle: 0x2fd0c0, paddleEdge: 0x14303a, shoes: 0xf7f7f2 },
  { shirt: 0x86a878, trim: 0xf4f1ea, shorts: 0xd9cfb8, skin: 0xe0b090, hair: 0xc4c4c4, style: 'grey', hat: 'cap', hatColor: 0xf4f1ea, paddle: 0x3a76c8, paddleEdge: 0x1c2a44, shoes: 0x8a8a90 },
  { shirt: 0x9a5ac8, trim: 0xf4f1ea, shorts: 0xf4f1ea, skin: 0xd9a07a, hair: 0x1f1f22, style: 'pony', hat: 'none', hatColor: 0, paddle: 0xff6fae, paddleEdge: 0x3a1a2a, shoes: 0xf7f7f2, skirt: true },
  { shirt: 0x26292f, trim: 0xd8342a, shorts: 0xd8342a, skin: 0xa9704a, hair: 0x2a1e16, style: 'bald', hat: 'band', hatColor: 0xd8342a, paddle: 0xf2c43a, paddleEdge: 0x2a2620, shoes: 0x26292f, beard: 0x2a1e16 },
  { shirt: 0x40b8b0, trim: 0x23324a, shorts: 0x2e3238, skin: 0xf5d2b5, hair: 0xb8452a, style: 'bob', hat: 'visor', hatColor: 0xffffff, paddle: 0x26292f, paddleEdge: 0x40b8b0, shoes: 0xf7f7f2 },
  { shirt: 0xf7f4ee, trim: 0xe8b22a, shorts: 0xe8b22a, skin: 0x7a4a30, hair: 0x1f1f22, style: 'bun', hat: 'band', hatColor: 0xe8b22a, paddle: 0xe8b22a, paddleEdge: 0x1f1f22, shoes: 0xf7f7f2, skirt: true },
];

export interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  paddle: THREE.Group;
  /** the ball in the server's left hand */
  heldBall: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
}

/**
 * A player standing at the origin and facing −z (towards the far baseline from the near side).
 * Right hand (with the paddle) on +x. About 1.75 m tall, with a slightly big head so it reads from far away.
 */
export function playerRig(L: Look): Rig {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mk = (P: Part[]) => {
    const m = new THREE.Mesh(merge(P), mat);
    m.castShadow = true;
    return m;
  };
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.88;
  root.add(hips);
  // pelvis / shorts or skirt
  hips.add(mk(L.skirt ? [part(cyl(0.2, 0.27, 0.26, 10), L.shorts, 0, -0.06, 0)] : [part(box(0.38, 0.2, 0.24), L.shorts, 0, -0.04, 0)]));

  const leg = (x: number) => {
    const thigh = new THREE.Group();
    thigh.position.set(x, -0.08, 0);
    thigh.add(mk([part(box(0.15, 0.42, 0.16), L.skirt ? L.skin : L.shorts, 0, -0.2, 0)]));
    const shin = new THREE.Group();
    shin.position.set(0, -0.4, 0);
    shin.add(
      mk([
        part(box(0.13, 0.36, 0.14), L.skin, 0, -0.18, 0),
        part(box(0.135, 0.08, 0.145), 0xf7f7f2, 0, -0.33, 0), // sock
        part(box(0.15, 0.09, 0.27), L.shoes, 0, -0.4, -0.05),
        part(box(0.155, 0.03, 0.28), 0xffffff, 0, -0.44, -0.05),
      ]),
    );
    thigh.add(shin);
    return { thigh, shin };
  };
  const l = leg(-0.11);
  const r = leg(0.11);
  hips.add(l.thigh, r.thigh);

  const torso = new THREE.Group();
  torso.position.y = 0.04;
  hips.add(torso);
  torso.add(
    mk([
      part(box(0.42, 0.5, 0.26), L.shirt, 0, 0.27, 0),
      part(box(0.44, 0.08, 0.28), L.trim, 0, 0.44, 0), // collar band / shoulder stripe
      part(box(0.06, 0.4, 0.27), L.trim, 0.12, 0.22, 0),
    ]),
  );
  // head
  const head = new THREE.Group();
  head.position.y = 0.68;
  torso.add(head);
  const H: Part[] = [part(cyl(0.06, 0.07, 0.1, 6), L.skin, 0, -0.08, 0), part(sphere(0.16, 10, 8), L.skin, 0, 0.06, 0)];
  // eyes and nose (facing −z)
  H.push(part(box(0.04, 0.05, 0.02), DARK, -0.06, 0.08, -0.15), part(box(0.04, 0.05, 0.02), DARK, 0.06, 0.08, -0.15), part(box(0.04, 0.04, 0.05), 0xe3a88a, 0, 0.03, -0.16));
  if (L.style !== 'bald') H.push(part(sphere(0.168, 10, 6), L.hair, 0, 0.11, 0.025, 0, 0, 0, 1, 0.72, 1));
  if (L.style === 'pony') H.push(part(box(0.1, 0.24, 0.1), L.hair, 0, 0.0, 0.2, -0.4, 0, 0), part(sphere(0.07, 6, 4), L.hair, 0, 0.12, 0.17));
  if (L.style === 'bob') H.push(part(box(0.36, 0.2, 0.26), L.hair, 0, 0.02, 0.05));
  if (L.style === 'bun') H.push(part(sphere(0.09, 8, 6), L.hair, 0, 0.24, 0.1));
  if (L.beard) H.push(part(box(0.26, 0.1, 0.12), L.beard, 0, -0.03, -0.09));
  if (L.hat === 'cap') H.push(part(sphere(0.172, 10, 5), L.hatColor, 0, 0.12, 0.01, 0, 0, 0, 1, 0.7, 1), part(box(0.24, 0.025, 0.16), L.hatColor, 0, 0.13, -0.2));
  if (L.hat === 'visor') H.push(part(cyl(0.172, 0.172, 0.05, 12), L.hatColor, 0, 0.15, 0), part(box(0.26, 0.02, 0.15), L.hatColor, 0, 0.13, -0.2));
  if (L.hat === 'band') H.push(part(cyl(0.17, 0.17, 0.045, 12), L.hatColor, 0, 0.13, 0));
  head.add(mk(H));

  const arm = (x: number, withPaddle: boolean) => {
    const upper = new THREE.Group();
    upper.position.set(x, 0.42, 0);
    upper.rotation.order = 'YXZ';
    upper.add(mk([part(box(0.12, 0.3, 0.12), L.shirt, 0, -0.12, 0)]));
    const fore = new THREE.Group();
    fore.position.set(0, -0.28, 0);
    fore.add(mk([part(box(0.1, 0.28, 0.1), L.skin, 0, -0.13, 0), part(box(0.11, 0.09, 0.11), L.skin, 0, -0.3, 0)]));
    upper.add(fore);
    let paddle: THREE.Group | null = null;
    if (withPaddle) {
      paddle = new THREE.Group();
      paddle.position.set(0, -0.32, 0);
      // handle in the hand, the face beyond it; the face's normal is local x (the swing direction)
      paddle.add(
        mk([
          part(box(0.035, 0.13, 0.035), 0x2a2620, 0, -0.04, 0),
          part(box(0.022, 0.26, 0.2), L.paddle, 0, -0.24, 0),
          part(box(0.026, 0.27, 0.025), L.paddleEdge, 0, -0.24, 0.1),
          part(box(0.026, 0.27, 0.025), L.paddleEdge, 0, -0.24, -0.1),
          part(box(0.026, 0.025, 0.205), L.paddleEdge, 0, -0.37, 0),
          part(box(0.024, 0.08, 0.12), L.paddleEdge, 0, -0.2, 0),
        ]),
      );
      fore.add(paddle);
    }
    return { upper, fore, paddle };
  };
  const aL = arm(-0.27, false);
  const aR = arm(0.27, true);
  torso.add(aL.upper, aR.upper);
  const heldBall = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd4ff3a, emissive: 0x3a4a00 }));
  heldBall.position.set(0, -0.36, -0.02);
  aL.fore.add(heldBall);
  return { root, hips, torso, head, legL: l.thigh, legR: r.thigh, shinL: l.shin, shinR: r.shin, armL: aL.upper, armR: aR.upper, foreL: aL.fore, foreR: aR.fore, paddle: aR.paddle!, heldBall, mat };
}

// ------------------------------------------------------------------ the club
export function pineGeometry(v: number): THREE.BufferGeometry {
  const h = 1 + (v % 5) * 0.12;
  const greens = [0x2f6b45, 0x2a5f3e, 0x3a7a4a, 0x285a3a];
  const g = greens[v % greens.length];
  return merge([
    part(cyl(0.12, 0.18, 1.6 * h, 6), 0x6b4a2e, 0, 0.8 * h, 0),
    part(cone(1.25, 1.9 * h, 7), g, 0, 2.2 * h, 0),
    part(cone(1.0, 1.6 * h, 7), g, 0, 3.0 * h, 0, 0, 0.4, 0),
    part(cone(0.7, 1.3 * h, 7), g, 0, 3.8 * h, 0, 0, 0.8, 0),
  ]);
}

export function oakGeometry(v: number): THREE.BufferGeometry {
  const s = 0.9 + (v % 4) * 0.12;
  const greens = [0x5a8f3a, 0x4f8a42, 0x6a9a3a];
  const g = greens[v % greens.length];
  return merge([
    part(cyl(0.14, 0.2, 1.5 * s, 6), 0x6b4a2e, 0, 0.75 * s, 0),
    part(sphere(1.1 * s, 7, 5), g, 0, 2.1 * s, 0),
    part(sphere(0.8 * s, 7, 5), g, 0.6 * s, 2.5 * s, 0.2),
    part(sphere(0.75 * s, 7, 5), g, -0.5 * s, 2.6 * s, -0.3),
  ]);
}

export function benchGeometry(): THREE.BufferGeometry {
  const wood = 0xc8874a;
  const metal = 0x3a3f48;
  return merge([
    part(box(1.8, 0.06, 0.42), wood, 0, 0.45, 0),
    part(box(1.8, 0.3, 0.05), wood, 0, 0.72, 0.2, -0.15, 0, 0),
    part(box(0.06, 0.45, 0.4), metal, -0.75, 0.22, 0),
    part(box(0.06, 0.45, 0.4), metal, 0.75, 0.22, 0),
    // a water bottle and a towel
    part(cyl(0.04, 0.04, 0.22, 8), 0x40b8e8, -0.5, 0.59, 0),
    part(cyl(0.025, 0.025, 0.03, 8), 0xffffff, -0.5, 0.715, 0),
    part(box(0.42, 0.03, 0.3), 0xff6b4a, 0.4, 0.49, 0),
  ]);
}

export function lampGeometry(): THREE.BufferGeometry {
  return merge([
    part(cyl(0.07, 0.1, 6.5, 6), 0x3a3f48, 0, 3.25, 0),
    part(box(0.9, 0.12, 0.4), 0x3a3f48, 0, 6.5, 0),
    part(box(0.8, 0.04, 0.32), 0xfff6d8, 0, 6.43, 0),
  ]);
}

/** Little clubhouse with a striped awning, behind the far baseline. */
export function clubhouseGeometry(): THREE.BufferGeometry {
  const P: Part[] = [
    part(box(7, 3, 4), 0xf3e6cf, 0, 1.5, 0),
    part(box(7.3, 0.25, 4.3), 0xc8553d, 0, 3.1, 0),
    part(box(1.2, 2.1, 0.06), 0x6b4128, -1.8, 1.05, 2.01),
    part(box(1.8, 1.0, 0.06), 0x2d4a66, 1.2, 1.7, 2.01),
    part(box(1.9, 0.1, 0.1), 0xffffff, 1.2, 1.15, 2.05),
  ];
  for (let i = 0; i < 8; i++) P.push(part(box(0.9, 0.06, 1.3), i % 2 ? 0xffffff : 0xff6b4a, -3.15 + i * 0.9, 2.55, 2.6, -0.35, 0, 0));
  P.push(part(box(0.06, 1.6, 0.06), 0x3a3f48, -3.4, 1.4, 3.15), part(box(0.06, 1.6, 0.06), 0x3a3f48, 3.4, 1.4, 3.15));
  return merge(P);
}

/** Low hills on the horizon (a ring of flattened icosahedra). */
export function hillsGeometry(): THREE.BufferGeometry {
  const P: Part[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2;
    const r = 85 + (i % 3) * 8;
    const s = 14 + ((i * 7) % 5) * 4;
    P.push(part(new THREE.IcosahedronGeometry(1, 0), i % 2 ? 0x7fa36a : 0x6f9660, Math.cos(a) * r, -2, Math.sin(a) * r, 0, a, 0, s * 1.6, s * 0.55, s));
  }
  return merge(P);
}
