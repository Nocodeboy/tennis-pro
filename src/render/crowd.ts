// The crowd in the stands: real people, drawn as impostors. When the players' model loads, it is posed (seated,
// seated looking to one side, leaning in, standing with the arms up, clapping) and rendered from several angles into
// an atlas: its shading detail and normals in one texture, which part of the body each pixel is (shirt, trousers,
// skin, hair) in another. Each spectator is then one quad facing the camera (one draw call for the whole crowd, two
// triangles each) that picks the frames for the angle it is seen from, cross-fades between the two nearest, and
// recolours them with its own clothes, skin and hair; the light, the shadows and the fog are the scene's (the
// normals come from the atlas).
//
// They follow the ball with their heads (a little late, the keen ones closer), sway a touch while they sit (in the
// shader, no CPU), and react to the play: they stand up, jump, clap and wave their arms on a winner or after a long
// rally, lean in with an "ooh" on a net cord or a close call, and sit forward as a rally gets long. The reactions
// rewrite one small attribute only while something is going on (at most 30 times a second); the heads 20 times.

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharAssets } from './chars';
import { applyBuild, type Build } from './body';
import { STAND_LIGHT_GLSL, hash, type Spot } from './stadium';

export type CrowdMood = 'cheer' | 'ooh' | 'clap';

/** the spectators of the venue */
export interface Crowd {
  mesh: THREE.Mesh;
  n: number;
  /** the court's staff first (they never cheer), then the ones low enough to follow the ball with their heads */
  staff: number;
  lookers: number;
  /** each one's kind (see Spot.kind) */
  kinds: Uint8Array;
  /** each spectator's seat (x, y, z), the way they face (yaw), how keen they are (0 … 1) and their build (height) */
  base: Float32Array;
  yaw: Float32Array;
  keen: Float32Array;
  tall: Float32Array;
  /** per spectator: lift (m), pose (see POSE), sway phase, unused; rewritten by CrowdAnim */
  state: THREE.InstancedBufferAttribute;
  /** shader clock (the sway, the flashes) */
  time: { value: number };
  /** photo flashes in the stands: how many a second, about */
  flashes: { value: number };
  /** the atlas, once baked (until then the stands are empty) */
  alb: { value: THREE.Texture | null };
  /** how soft the stands are drawn (the sharpest atlas mip level used: the TV's long lenses keep them out of focus) */
  soft: { value: number };
  /** which spectators sit with their arms crossed (they do not turn their heads) */
  crossed: Uint8Array;
  mask: { value: THREE.Texture | null };
  /** the render targets holding them */
  rts: THREE.WebGLRenderTarget[];
}

/** the poses a spectator can show (the head turns are one baked pose, mirrored for the left) */
export const POSE = { seat: 0, lean: 1, cheer: 2, clap: 3, right: 4, left: 5, crossed: 6 } as const;

// a crowd on an autumn night: mostly navies, blacks, greys and denim, a few whites, then the colours (now and then
// the tour's ball yellow)
const SHIRTS = [
  0x1e2633, 0x16365f, 0x2b2f36, 0x15171b, 0x3a4250, 0x22293a, 0x101216, 0x2a2420, 0x1c2a3c, 0x33302c,
  0x5c636e, 0x8a8f96, 0x6f7680, 0xd9d6cf, 0xe8e6e0,
  0x3a5a86, 0x6f8fb3, 0x6a2e36, 0x9a4a40, 0x2f5a4c, 0xa88c4a, 0x4b3a5e, 0xa8643e, 0xb9c24e,
];
const PANTS = [0x22304a, 0x2e4a72, 0x1e2126, 0x15171b, 0x3b4048, 0x5c6066, 0x3b5d8c, 0xbfa77d, 0x4a3e32];
/** the court's staff: officials in navy and grey, camera crews and photographers in black */
const OFFICIAL = { shirt: 0x1b2a40, pants: 0x55595f };
const CREW = { shirt: 0x141619, pants: 0x1c1e22 };
/** the ball kids: the tournament's colour, dark shorts */
const KIDS = { shirt: 0x2a63b0, pants: 0x1b2a40 };
/** the club seats: dressed up a little */
const CLUB_SHIRTS = [0x15171b, 0x1e2633, 0xf0eee8, 0x2b2f36, 0x3a2a30, 0xd9d6cf, 0x16365f];
const SKINS = [0xf1c7a0, 0xd9a07a, 0xa9704a, 0xf5d2b5, 0x7a4a30, 0xe0b090, 0xc68a62];
// (mostly dark and brown; some blond, some grey, a redhead now and then)
const HAIR = [0x1e1a17, 0x2a211b, 0x3a2a1e, 0x4a3526, 0x5e4330, 0x1e1a17, 0x2a211b, 0x3a2a1e, 0x4a3526, 0x8a6a44, 0xb89a62, 0x7d7d7a, 0x5e4330, 0x6a2e1a];
const CAPS = [0x16365f, 0xc9483c, 0x1e2126, 0x2f6a4c];
// the women's hair: more blondes and browns
const HAIR_W = [0x1e1a17, 0x2a211b, 0x3a2a1e, 0x4a3526, 0x5e4330, 0x7a5a3a, 0x8a6a44, 0xb89a62, 0xc8a870, 0x6a2e1a, 0x3a2a1e, 0x2a211b];
// and a few brighter tops among the dark ones
const SHIRTS_W = [0x1e2633, 0x15171b, 0x2b2f36, 0x5c636e, 0xd9d6cf, 0xe8e6e0, 0x6a2e36, 0x9a4a40, 0x3a5a86, 0x6f8fb3, 0x7a3a5e, 0x2f5a4c, 0xa88c4a, 0xb9c24e, 0x101216];
/** how many spectators are women (the court's staff a third) */
const WOMEN = 0.46;
/** how many sit with their arms crossed */
const CROSSED = 0.22;

// ------------------------------------------------------------------ the atlas layout
/**
 * The atlas holds the crowd's two bodies one after the other, the man's and the woman's (render/body.ts), each in every
 * pose: azimuth frames for the symmetric poses 0°…180° in 45° steps (the other side is their mirror), the head turn
 * all round
 */
const SYM_AZ = 5;
const HEAD_AZ = 8;
/** elevation rows: seen from about level (the TV cameras by the court) and from above (the gameplay camera) */
const ELEV = [10, 36];
const EL_SPLIT = 23;
const SYM_POSES = 5;
const PER_BODY = SYM_POSES * ELEV.length * SYM_AZ + ELEV.length * HEAD_AZ;
const BODIES = 2;
const CELLS = PER_BODY * BODIES;
const COLS = 16;
const ROWS = Math.ceil(CELLS / COLS);
/**
 * a cell (px) at full quality (two bodies and a fifth pose in about the memory of one: a little smaller than the
 * 112 × 176 of 0.9); the frame each pose is drawn in (seat frame: origin on the seat, +z forward), m
 */
const CELL_W = 88;
const CELL_H = 138;
const SEAT_RECT = { y: 0.24, z: 0.16, h: 1.42 };
const STAND_RECT = { y: 0.68, z: 0.22, h: 2.3 };

function rectOf(r: { y: number; z: number; h: number }) {
  return new THREE.Vector4(r.y, r.z, (r.h * CELL_W) / CELL_H, r.h);
}

/**
 * The spectators at the given seats: the first `staff` are the court's staff (kind 2 sitting, 3 standing), and the
 * first `lookers` follow the ball with their heads (the rest are too far up to see it). The same crowd every time.
 */
export function crowdMesh(spots: Spot[], lookers: number, staff: number): Crowd {
  const n = spots.length;
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('normal', quad.getAttribute('normal'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  geo.instanceCount = n;
  const seat = new Float32Array(n * 4);
  const state = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  state.setUsage(THREE.DynamicDrawUsage);
  const build = new Float32Array(n * 4);
  const shirt = new Float32Array(n * 3);
  const pants = new Float32Array(n * 3);
  const skin = new Float32Array(n * 3);
  const hair = new Float32Array(n * 3);
  const base = new Float32Array(n * 3);
  const yaw = new Float32Array(n);
  const keen = new Float32Array(n);
  const tall = new Float32Array(n);
  const kinds = new Uint8Array(n);
  const crossed = new Uint8Array(n);
  const c = new THREE.Color();
  const pick = (list: number[], r: number) => list[Math.floor(r * 997) % list.length];
  spots.forEach((sp, k) => {
    const r1 = hash(k * 13 + 5);
    const r2 = hash(k * 29 + 11);
    const r3 = hash(k * 41 + 3);
    const r4 = hash(k * 53 + 17);
    const kind = sp.kind ?? 0;
    kinds[k] = kind;
    base[k * 3] = sp.x;
    base[k * 3 + 1] = sp.y;
    base[k * 3 + 2] = sp.z;
    yaw[k] = sp.yaw;
    keen[k] = r1;
    // builds: children to tall adults, slim to broad
    // (a woman or a man: the atlas' second body or the first; the crews mostly men)
    const woman = hash(k * 67 + 23) < (kind === 3 ? 0.15 : kind === 2 ? 0.33 : WOMEN);
    tall[k] = sp.dress === 'kid' ? 0.84 + r2 * 0.06 : (r3 < 0.08 ? 0.8 : 0.93 + r2 * 0.14) * (woman ? 0.95 : 1);
    seat.set([sp.x, sp.y, sp.z, sp.yaw], k * 4);
    // (and how much light reaches them: a neighbour's shadow, a coat's sheen)
    // (w: a spectator, who may take a photo; the staff never do)
    build.set([tall[k], 0.92 + r4 * 0.16, 0.74 + 0.42 * hash(k * 17 + 9), kind < 2 ? 1 : 0], k * 4);
    crossed[k] = kind < 2 && hash(k * 71 + 31) < CROSSED ? 1 : 0;
    state.setXYZW(k, 0, kind === 3 ? POSE.clap : crossed[k] ? POSE.crossed : POSE.seat, (r1 * 977.13 + k * 0.618) % 6.283, woman ? 1 : 0);
    const uni = kind === 2 ? OFFICIAL : kind === 3 ? CREW : null;
    // (the staff's own dress when the venue says; else the photographers sit low behind the ends: crew too)
    const crew = sp.dress ? { official: OFFICIAL, crew: CREW, kid: KIDS }[sp.dress] : kind === 2 && sp.y < 0.4 ? CREW : uni;
    c.setHex(crew ? crew.shirt : pick(kind === 1 ? CLUB_SHIRTS : woman ? SHIRTS_W : SHIRTS, sp.v * 1.37 + r4)).toArray(shirt, k * 3);
    c.setHex(crew ? crew.pants : pick(PANTS, r2 + sp.v)).toArray(pants, k * 3);
    c.setHex(pick(SKINS, r3 * 1.7 + r1 * 0.3)).toArray(skin, k * 3);
    // one in fourteen wears a dark cap (the camera crews more)
    c.setHex(!woman && r4 < (kind === 3 ? 0.5 : 0.07) ? pick(CAPS, r2 * 3.1) : pick(woman ? HAIR_W : HAIR, r1 * 2.3 + r3)).toArray(hair, k * 3);
  });
  geo.setAttribute('aSeat', new THREE.InstancedBufferAttribute(seat, 4));
  geo.setAttribute('aState', state);
  geo.setAttribute('aBuild', new THREE.InstancedBufferAttribute(build, 4));
  geo.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
  geo.setAttribute('aPants', new THREE.InstancedBufferAttribute(pants, 3));
  geo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3));
  geo.setAttribute('aHair', new THREE.InstancedBufferAttribute(hair, 3));
  const time = { value: 0 };
  const flashes = { value: 2 };
  const alb = { value: null as THREE.Texture | null };
  const mask = { value: null as THREE.Texture | null };
  const soft = { value: 0 };
  const mesh = new THREE.Mesh(geo, impostorMaterial(time, alb, mask, flashes, n, soft));
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.visible = false;
  return { mesh, n, staff, lookers, kinds, base, yaw, keen, tall, state, time, flashes, alb, mask, soft, crossed, rts: [] };
}

/**
 * The impostor: a screen-aligned quad round the figure's middle; the frames for the angle it is seen from (two
 * azimuths cross-faded, the nearest elevation row), recoloured per spectator and lit with the atlas' normals.
 */
function impostorMaterial(time: { value: number }, alb: { value: THREE.Texture | null }, mask: { value: THREE.Texture | null }, flashes: { value: number }, n: number, soft: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, alphaTest: 0.5 });
  m.alphaToCoverage = true;
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.uniforms.uFlashes = flashes;
    s.uniforms.uAlb = alb;
    s.uniforms.uMask = mask;
    s.uniforms.uSoft = soft;
    s.uniforms.uRectSeat = { value: rectOf(SEAT_RECT) };
    s.uniforms.uRectStand = { value: rectOf(STAND_RECT) };
    s.uniforms.uCell = { value: new THREE.Vector2(1 / COLS, 1 / ROWS) };
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aSeat; attribute vec4 aState; attribute vec4 aBuild;
        attribute vec3 aShirt; attribute vec3 aPants; attribute vec3 aSkin; attribute vec3 aHair;
        uniform float uTime; uniform float uFlashes; uniform vec4 uRectSeat; uniform vec4 uRectStand; uniform vec2 uCell;
        varying float vFlash; varying vec2 vQ;
        varying vec2 vAt0; varying vec2 vAt1; varying float vBlend; varying float vMirror; varying float vPbY; varying float vShade;
        varying vec3 vShirt; varying vec3 vPants; varying vec3 vSkin; varying vec3 vHair;
        vec2 pbCell( float idx, vec2 q ) { float cx = mod( idx, ${COLS}.0 ); float cy = floor( idx / ${COLS}.0 ); return ( vec2( cx, cy ) + q ) * uCell; }`,
      )
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = vec3( 0.0, 0.0, 1.0 );')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float pbYaw = aSeat.w;
        vec3 pbF = vec3( sin( pbYaw ), 0.0, cos( pbYaw ) );
        vec3 pbR = vec3( cos( pbYaw ), 0.0, - sin( pbYaw ) );
        float pbPose = aState.y;
        bool pbStand = pbPose > 1.5 && pbPose < 3.5;
        vec4 pbRect = pbStand ? uRectStand : uRectSeat;
        float pbTall = aBuild.x;
        // sitting is never quite still: a slow sway, each at their own pace
        float pbPh = aState.z;
        float pbSw = pbStand ? 0.0 : sin( uTime * ( 0.7 + fract( pbPh ) * 0.6 ) + pbPh * 6.283 ) * 0.018 + sin( uTime * 0.23 + pbPh ) * 0.01;
        vec3 pbC = aSeat.xyz + vec3( 0.0, aState.x + pbRect.x * pbTall, 0.0 ) + pbF * ( pbRect.y * pbTall ) + pbR * pbSw;
        vec3 pbD = normalize( cameraPosition - pbC );
        vec3 pbL = vec3( dot( pbD, pbR ), pbD.y, dot( pbD, pbF ) );
        float pbAz = atan( pbL.x, pbL.z );
        float pbE = asin( clamp( pbL.y, - 1.0, 1.0 ) ) > ${((EL_SPLIT * Math.PI) / 180).toFixed(4)} ? 1.0 : 0.0;
        float pbMir = 0.0;
        float pbI0; float pbI1; float pbW;
        // (the body: the woman's frames come after the man's)
        float pbBody = aState.w * ${PER_BODY}.0;
        if ( pbPose > 3.5 && pbPose < 5.5 ) {
          // a head turned: frames all round (the left turn is the right one mirrored)
          float a = pbAz;
          if ( pbPose > 4.5 ) { a = - a; pbMir = 1.0; }
          float fa = mod( a / ( PI / 4.0 ) + ${HEAD_AZ}.0, ${HEAD_AZ}.0 );
          float i0 = floor( fa );
          pbW = fa - i0;
          float b0 = pbBody + ${SYM_POSES * ELEV.length * SYM_AZ}.0 + pbE * ${HEAD_AZ}.0;
          pbI0 = b0 + i0;
          pbI1 = b0 + mod( i0 + 1.0, ${HEAD_AZ}.0 );
        } else {
          pbMir = pbAz < 0.0 ? 1.0 : 0.0;
          float fa = abs( pbAz ) / ( PI / 4.0 );
          float i0 = min( floor( fa ), ${SYM_AZ - 2}.0 );
          pbW = clamp( fa - i0, 0.0, 1.0 );
          // (arms crossed, POSE.crossed, is the fifth symmetric pose)
          float sym = pbPose > 5.5 ? 4.0 : pbPose;
          float b0 = pbBody + ( sym * ${ELEV.length}.0 + pbE ) * ${SYM_AZ}.0;
          pbI0 = b0 + i0;
          pbI1 = b0 + i0 + 1.0;
        }
        vec2 pbQ = position.xy + 0.5;
        vec2 pbQs = vec2( pbMir > 0.5 ? 1.0 - pbQ.x : pbQ.x, pbQ.y );
        vAt0 = pbCell( pbI0, pbQs );
        vAt1 = pbCell( pbI1, pbQs );
        vBlend = pbW;
        vMirror = pbMir;
        vPbY = aSeat.y;
        vShade = aBuild.z;
        // a photo flash now and then: each spectator a chance every eighth of a second (none for the staff on the court)
        float pbSlot = floor( uTime * 8.0 );
        float pbH = fract( sin( pbSlot * 12.9898 + aSeat.x * 78.233 + aSeat.z * 37.719 ) * 43758.5453 );
        vFlash = aBuild.w > 0.5 && pbH > 1.0 - uFlashes / ( 8.0 * ${n}.0 ) ? 1.0 : 0.0;
        vQ = pbQs;
        vShirt = aShirt; vPants = aPants; vSkin = aSkin; vHair = aHair;
        vec3 pbCamR = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
        vec3 pbCamU = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
        vec2 pbOff = ( pbQ - 0.5 ) * pbRect.zw * pbTall * vec2( aBuild.y, 1.0 );
        vec3 pbWorld = pbC + pbCamR * pbOff.x + pbCamU * pbOff.y;`,
      )
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4( pbWorld, 1.0 );\ngl_Position = projectionMatrix * mvPosition;')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4( pbWorld, 1.0 );');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uAlb; uniform sampler2D uMask; uniform float uSoft;
        varying float vFlash; varying vec2 vQ;
        varying vec2 vAt0; varying vec2 vAt1; varying float vBlend; varying float vMirror; varying float vPbY; varying float vShade;
        varying vec3 vShirt; varying vec3 vPants; varying vec3 vSkin; varying vec3 vHair;
        ${STAND_LIGHT_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 pbA; vec4 pbM;
        if ( uSoft > 0.01 ) {
          // out of focus: never sharper than mip level uSoft, however close the stands are
          vec2 pbTs = vec2( textureSize( uAlb, 0 ) );
          vec2 pbDx = dFdx( vAt0 * pbTs );
          vec2 pbDy = dFdy( vAt0 * pbTs );
          float pbLod = max( 0.5 * log2( max( max( dot( pbDx, pbDx ), dot( pbDy, pbDy ) ), 1e-6 ) ), uSoft );
          pbA = mix( textureLod( uAlb, vAt0, pbLod ), textureLod( uAlb, vAt1, pbLod ), vBlend );
          pbM = mix( textureLod( uMask, vAt0, pbLod ), textureLod( uMask, vAt1, pbLod ), vBlend );
        } else {
          pbA = mix( texture2D( uAlb, vAt0 ), texture2D( uAlb, vAt1 ), vBlend );
          pbM = mix( texture2D( uMask, vAt0 ), texture2D( uMask, vAt1 ), vBlend );
        }
        // (the atlas is premultiplied by coverage: divide it back out)
        float pbInv = 1.0 / max( pbA.a, 1e-3 );
        vec4 pbK = clamp( pbM * pbInv, 0.0, 1.0 );
        float pbRest = max( 0.0, 1.0 - pbK.r - pbK.g - pbK.b - pbK.a );
        vec3 pbBase = pbK.r * vShirt + pbK.g * vPants + pbK.b * vSkin + pbK.a * vHair + pbRest * vec3( 0.72 );
        // (the court's floodlights reach the low rows; higher up the stands sit in the gloom)
        // (night: the colours a little muted, each spectator lit a little differently)
        pbBase = mix( vec3( dot( pbBase, vec3( 0.2126, 0.7152, 0.0722 ) ) ), pbBase, 0.78 );
        diffuseColor.rgb = pbBase * clamp( pbA.r * pbInv * 2.0, 0.0, 1.6 ) * pbStandLight( vPbY ) * vShade;
        diffuseColor.a = pbA.a;
        vec2 pbNxy = clamp( pbA.gb * pbInv, 0.0, 1.0 ) * 2.0 - 1.0;
        if ( vMirror > 0.5 ) pbNxy.x = - pbNxy.x;
        vec3 pbN = vec3( pbNxy, sqrt( max( 0.0, 1.0 - dot( pbNxy, pbNxy ) ) ) );`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if ( vFlash > 0.5 ) {
          vec2 pbFd = ( vQ - vec2( 0.5, 0.74 ) ) * vec2( 0.9, 1.42 );
          totalEmissiveRadiance += vec3( 0.95, 0.97, 1.0 ) * 9.0 * exp( - dot( pbFd, pbFd ) * 260.0 );
        }`,
      )
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( pbN );\nvec3 nonPerturbedNormal = normal;');
  };
  m.customProgramCacheKey = () => 'pb-crowd-imp';
  return m;
}

// ------------------------------------------------------------------ the bake
type Dir = [number, number, number];
interface PoseSpec {
  /** where the model's feet go in the seat frame (y, z) and how the hips sit (seated: the hips' height) */
  hipsY?: number;
  feet?: [number, number];
  aims: [string, string, Dir][];
  head?: number;
  rect: { y: number; z: number; h: number };
}
const mir = (d: Dir): Dir => [-d[0], d[1], d[2]];
/** both sides of the body: the left limb's direction (the model faces +z: its left is +x), the right one mirrored */
function both(bone: string, child: string, d: Dir): [string, string, Dir][] {
  return [
    [`Left${bone}`, `Left${child}`, d],
    [`Right${bone}`, `Right${child}`, mir(d)],
  ];
}
const SEATED = (spine: Dir, arm: Dir, fore: Dir): [string, string, Dir][] => [
  ['Spine02', 'Spine', spine],
  ...both('UpLeg', 'Leg', [0.13, -0.08, 1]),
  ...both('Leg', 'Foot', [0.04, -1, 0.12]),
  ...both('Foot', 'ToeBase', [0.05, -0.3, 1]),
  ...both('Arm', 'ForeArm', arm),
  ...both('ForeArm', 'Hand', fore),
];
const STANDING = (arm: Dir, fore: Dir): [string, string, Dir][] => [
  ['Spine02', 'Spine', [0, 1, 0.02]],
  ...both('UpLeg', 'Leg', [0.06, -1, 0.03]),
  ...both('Leg', 'Foot', [0.02, -1, -0.03]),
  ...both('Foot', 'ToeBase', [0.06, -0.35, 1]),
  ...both('Arm', 'ForeArm', arm),
  ...both('ForeArm', 'Hand', fore),
];
/** the baked poses, in atlas order: seated, leaning in, cheering, clapping; then seated with the head turned right */
const POSES: PoseSpec[] = [
  { hipsY: 0.1, aims: SEATED([0, 1, 0.06], [0.16, -0.92, 0.3], [-0.32, -0.62, 0.72]), rect: SEAT_RECT },
  { hipsY: 0.1, aims: [...SEATED([0, 0.86, 0.5], [0.12, -0.72, 0.68], [-0.15, 0.6, 0.78]), ['neck', 'Head', [0, 1, 0.12]]], rect: SEAT_RECT },
  { feet: [-0.42, 0.22], aims: STANDING([0.55, 0.83, 0.12], [0.25, 0.96, 0.1]), rect: STAND_RECT },
  { feet: [-0.42, 0.22], aims: STANDING([0.24, -0.78, 0.58], [-0.78, 0.18, 0.6]), rect: STAND_RECT },
  // sitting back with the arms crossed over the chest
  { hipsY: 0.1, aims: SEATED([0, 1, -0.06], [0.14, -0.8, 0.5], [-0.86, 0.22, 0.42]), rect: SEAT_RECT },
  { hipsY: 0.1, aims: SEATED([0, 1, 0.06], [0.16, -0.92, 0.3], [-0.32, -0.62, 0.72]), head: -0.75, rect: SEAT_RECT },
];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _d = new THREE.Vector3();
/** turns a bone (in world space) so that the way to its child points along `dir` */
function aim(bone: THREE.Object3D, child: THREE.Object3D, dir: Dir) {
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _b.sub(_a).normalize();
  _q.setFromUnitVectors(_b, _d.set(dir[0], dir[1], dir[2]).normalize());
  bone.getWorldQuaternion(_qb);
  bone.parent!.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_q.multiply(_qb)));
  bone.updateWorldMatrix(false, true);
}
function turnY(bone: THREE.Object3D, angle: number) {
  bone.updateWorldMatrix(true, false);
  _q.setFromAxisAngle(_d.set(0, 1, 0), angle);
  bone.getWorldQuaternion(_qb);
  bone.parent!.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_q.multiply(_qb)));
  bone.updateWorldMatrix(false, true);
}

const BAKE_VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying float vY;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vUv = uv;
  vY = position.y;
  vN = normalize( normalMatrix * objectNormal );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( transformed, 1.0 );
}`;
/**
 * The bake: pass 0 writes the shading detail (luminance against the mean of its part, 0.5 = the mean) and the normal
 * (seen from the bake camera); pass 1 which part it is: shirt, trousers, skin, hair (the rest, shoes and socks, stays
 * pale). The parts are told by colour as in kitTexture (coral shirt, navy shorts), the hair as dark on the head.
 */
const BAKE_FRAG = /* glsl */ `
uniform sampler2D map; uniform float uPass; uniform vec4 uMeans; uniform float uRest; uniform float uHeadY;
varying vec2 vUv; varying vec3 vN; varying float vY;
void main() {
  vec3 lin = texture2D( map, vUv ).rgb;
  vec3 c = pow( max( lin, 0.0 ), vec3( 1.0 / 2.2 ) );
  float mx = max( c.r, max( c.g, c.b ) );
  float mn = min( c.r, min( c.g, c.b ) );
  float l = ( mx + mn ) * 0.5;
  float d = mx - mn;
  float s = d < 1e-4 ? 0.0 : d / max( 1e-4, 1.0 - abs( 2.0 * l - 1.0 ) );
  float h = 0.0;
  if ( d > 1e-4 ) {
    if ( mx == c.r ) h = mod( ( c.g - c.b ) / d, 6.0 );
    else if ( mx == c.g ) h = ( c.b - c.r ) / d + 2.0;
    else h = ( c.r - c.g ) / d + 4.0;
    h *= 60.0;
  }
  float shirt = ( ( h < 22.0 || h > 345.0 ) && s > 0.5 && l > 0.38 ) ? 1.0 : 0.0;
  float pants = ( shirt < 0.5 && h > 195.0 && h < 255.0 && s > 0.2 ) ? 1.0 : 0.0;
  float hair = ( shirt + pants < 0.5 && l < 0.24 && vY > uHeadY ) ? 1.0 : 0.0;
  float skin = ( shirt + pants + hair < 0.5 && h > 4.0 && h < 50.0 && s > 0.12 && l > 0.16 && l < 0.92 ) ? 1.0 : 0.0;
  if ( uPass < 0.5 ) {
    float lum = dot( lin, vec3( 0.2126, 0.7152, 0.0722 ) );
    float rest = 1.0 - shirt - pants - hair - skin;
    float mean = shirt * uMeans.x + pants * uMeans.y + skin * uMeans.z + hair * uMeans.w + rest * uRest;
    vec3 n = normalize( vN );
    gl_FragColor = vec4( clamp( 0.5 * lum / max( mean, 1e-3 ), 0.0, 1.0 ), n.xy * 0.5 + 0.5, 1.0 );
  } else gl_FragColor = vec4( shirt, pants, skin, hair );
}`;

/** mean luminance (linear) of each part on the model's texture: shirt, trousers, skin, hair, and the rest */
function partMeans(img: CanvasImageSource & { width: number; height: number }): [THREE.Vector4, number] {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, S, S);
  const px = x.getImageData(0, 0, S, S).data;
  const sum = [0, 0, 0, 0, 0];
  const cnt = [0, 0, 0, 0, 0];
  const lin = (v: number) => Math.pow(v / 255, 2.2);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    const d = mx - mn;
    const s = d < 1e-4 ? 0 : d / Math.max(1e-4, 1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d > 1e-4) h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    const k = (h < 22 || h > 345) && s > 0.5 && l > 0.38 ? 0 : h > 195 && h < 255 && s > 0.2 ? 1 : l < 0.24 ? 3 : h > 4 && h < 50 && s > 0.12 && l > 0.16 && l < 0.92 ? 2 : 4;
    sum[k] += 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]);
    cnt[k]++;
  }
  const m = (k: number, def: number) => (cnt[k] > 20 ? sum[k] / cnt[k] : def);
  return [new THREE.Vector4(m(0, 0.25), m(1, 0.03), m(2, 0.3), m(3, 0.02)), m(4, 0.6)];
}

/**
 * Renders the crowd's atlas from the players' model (once, when it loads) and shows the crowd. `scale`: the cell
 * size against full quality (low tier: 0.5). Leaves the renderer as it found it.
 */
/** the crowd's woman (the women's body of render/body.ts, with its hair down to the jaw) */
const WOMAN_BUILD: Build = { height: 1.66, woman: true, hair: 'bob', shoulders: 0.87, hips: 1.04, chest: 0.91, waist: 0.86, seat: 1.08, arms: 0.85, legs: 0.95, neck: 0.85, hand: 0.9 };

export function bakeCrowd(renderer: THREE.WebGLRenderer, a: CharAssets, crowd: Crowd, scale = 1) {
  const cw = Math.max(16, Math.round(CELL_W * scale));
  const ch = Math.max(24, Math.round(CELL_H * scale));
  const tex = new THREE.Texture(a.image as HTMLImageElement);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const [means, rest] = partMeans(a.image as HTMLImageElement);
  const uniforms = { map: { value: tex }, uPass: { value: 0 }, uMeans: { value: means }, uRest: { value: rest }, uHeadY: { value: 1.5 } };
  const bakeMat = new THREE.ShaderMaterial({ uniforms, vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG });
  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  scene.add(holder);
  const cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.05, 20);
  const small = new THREE.WebGLRenderTarget(cw, ch, { samples: 4, type: THREE.UnsignedByteType });
  const mk = () => {
    const rt = new THREE.WebGLRenderTarget(cw * COLS, ch * ROWS, { depthBuffer: false, type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    rt.texture.anisotropy = 4;
    rt.scissorTest = true;
    return rt;
  };
  const atlas = [mk(), mk()];
  const copyMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: small.texture } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy * 2.0, 0.0, 1.0 ); }',
    fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D( t, vUv ); }',
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  const copyScene = new THREE.Scene();
  const copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), copyMat);
  copyQuad.frustumCulled = false;
  copyScene.add(copyQuad);
  // the renderer's state, put back afterwards
  const prevRT = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;
  const prevShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);
  const cellOf = (pose: number, el: number, az: number) => (pose < SYM_POSES ? (pose * ELEV.length + el) * SYM_AZ + az : SYM_POSES * ELEV.length * SYM_AZ + el * HEAD_AZ + az);
  // the two bodies: the man (the players' model) and the woman (without one, the man again)
  const bodies: { model: THREE.Object3D; headY: number }[] = [{ model: cloneSkinned(a.template), headY: 1.5 }];
  if (a.woman) {
    const w = cloneSkinned(a.woman);
    applyBuild(w, WOMAN_BUILD);
    bodies.push({ model: w, headY: 1.45 });
  } else bodies.push({ model: cloneSkinned(a.template), headY: 1.5 });
  bodies.forEach(({ model, headY }, bi) => {
    const bones: Record<string, THREE.Object3D> = {};
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones[o.name] = o;
      const mm = o as THREE.SkinnedMesh;
      if (mm.isMesh) {
        mm.material = bakeMat;
        mm.frustumCulled = false;
      }
    });
    const need = ['Hips', 'Spine02', 'Spine', 'neck', 'Head'];
    if (need.some((k) => !bones[k])) return;
    uniforms.uHeadY.value = headY;
    holder.add(model);
    model.updateMatrixWorld(true);
    const rest0 = new Map<THREE.Object3D, THREE.Quaternion>();
    for (const b of Object.values(bones)) rest0.set(b, b.quaternion.clone());
    const hips0 = bones.Hips.getWorldPosition(new THREE.Vector3()).y;
    POSES.forEach((p, pi) => {
      // the pose, from the rest pose
      for (const [b, q] of rest0) b.quaternion.copy(q);
      model.position.set(0, 0, 0);
      model.updateMatrixWorld(true);
      if (p.hipsY !== undefined) model.position.y = p.hipsY - hips0;
      else if (p.feet) model.position.set(0, p.feet[0], p.feet[1]);
      model.updateMatrixWorld(true);
      for (const [b, c, d] of p.aims) if (bones[b] && bones[c]) aim(bones[b], bones[c], d);
      if (p.head && bones.neck) {
        turnY(bones.neck, p.head * 0.45);
        turnY(bones.Head, p.head * 0.55);
      }
      model.updateMatrixWorld(true);
      const nAz = pi < SYM_POSES ? SYM_AZ : HEAD_AZ;
      const fh = p.rect.h;
      const fw = (fh * CELL_W) / CELL_H;
      cam.left = -fw / 2;
      cam.right = fw / 2;
      cam.top = fh / 2;
      cam.bottom = -fh / 2;
      cam.updateProjectionMatrix();
      ELEV.forEach((elDeg, ei) => {
        for (let ai = 0; ai < nAz; ai++) {
          const az = (ai * Math.PI) / 4;
          const el = (elDeg * Math.PI) / 180;
          const cx = 0;
          const cy = p.rect.y;
          const cz = p.rect.z;
          cam.position.set(cx + Math.sin(az) * Math.cos(el) * 6, cy + Math.sin(el) * 6, cz + Math.cos(az) * Math.cos(el) * 6);
          cam.up.set(0, 1, 0);
          cam.lookAt(cx, cy, cz);
          cam.updateMatrixWorld();
          const cell = bi * PER_BODY + cellOf(pi, ei, ai);
          const x0 = (cell % COLS) * cw;
          const y0 = Math.floor(cell / COLS) * ch;
          for (let pass = 0; pass < 2; pass++) {
            uniforms.uPass.value = pass;
            renderer.autoClear = true;
            renderer.setRenderTarget(small);
            renderer.clear();
            renderer.render(scene, cam);
            const rt = atlas[pass];
            rt.viewport.set(x0, y0, cw, ch);
            rt.scissor.set(x0, y0, cw, ch);
            renderer.autoClear = false;
            renderer.setRenderTarget(rt);
            renderer.render(copyScene, cam);
          }
        }
      });
    });
    holder.remove(model);
    model.traverse((o) => {
      const mm = o as THREE.SkinnedMesh;
      if (!mm.isSkinnedMesh) return;
      mm.skeleton.dispose();
      // (the women's geometry is only drawn here: its GPU buffers go; the man's are the players')
      if (bi === 1 && a.woman) mm.geometry.dispose();
    });
  });
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.autoClear = prevAuto;
  renderer.shadowMap.enabled = prevShadow;
  small.dispose();
  copyMat.dispose();
  copyQuad.geometry.dispose();
  bakeMat.dispose();
  tex.dispose();
  for (const rt of crowd.rts) rt.dispose();
  crowd.rts = atlas;
  crowd.alb.value = atlas[0].texture;
  crowd.mask.value = atlas[1].texture;
  crowd.mesh.visible = true;
}

/**
 * the atlas' mip level at full softness: each spectator drawn from mip 2.4 or lower (a cell about a fifth of its size:
 * the shape and the colours, not the face), however big they are on the screen
 */
const SOFT_BIAS = 2.4;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** an envelope: rises fast to its target, holds, then falls slowly back to 0 */
class Env {
  v = 0;
  private target = 0;
  private until = 0;
  hit(level: number, hold: number, now: number) {
    if (now > this.until) this.target = 0;
    this.target = Math.max(this.target, level);
    this.until = Math.max(this.until, now + hold);
  }
  step(dt: number, now: number, up = 8, down = 2.2) {
    if (now > this.until) this.target = 0;
    const k = this.target > this.v ? up : down;
    this.v += (this.target - this.v) * (1 - Math.exp(-k * dt));
    if (this.v < 1e-3 && this.target === 0) this.v = 0;
  }
}

export class CrowdAnim {
  private stand = new Env();
  private jump = new Env();
  private arms = new Env();
  private lean = new Env();
  /** 0 … 1: a long rally, everybody sits forward */
  tension = 0;
  private tens = 0;
  private now = 0;
  private acc = 0;
  private lookAcc = 0;
  private idle = true;
  private n: number;
  private c: Crowd;
  private phase: Float32Array;
  private rate: Float32Array;
  /** where each one is looking (rad, relative to the body; + to their left) */
  private look: Float32Array;
  /** the ball they follow (null: no ball, they look at the court) */
  private ball: { x: number; z: number } | null = null;

  constructor(v: { crowd: Crowd }) {
    this.c = v.crowd;
    this.n = this.c.n;
    this.phase = new Float32Array(this.n);
    this.rate = new Float32Array(this.n);
    this.look = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const k = this.c.keen[i];
      this.phase[i] = (k * 977.13 + i * 0.618) % (Math.PI * 2);
      this.rate[i] = Math.PI * 2 * (1.9 + ((k * 53.7 + i * 0.37) % 1) * 0.8);
    }
  }

  /** Bakes the spectators' atlas from the players' model (see bakeCrowd). */
  bake(renderer: THREE.WebGLRenderer, a: CharAssets, scale = 1) {
    bakeCrowd(renderer, a, this.c, scale);
    this.idle = false;
  }

  /** how soft the stands are wanted (0 sharp … 1: the TV's long lenses), and as drawn (eased) */
  private softWant = 0;
  private softNow = 0;
  /** How much out of focus the stands should be (0 … 1, eased): the TV shots keep them soft behind the players. */
  focus(soft: number) {
    this.softWant = soft;
  }

  /** The ball the stands follow with their heads (null: none in play). */
  watch(x: number | null, z = 0) {
    if (x === null) this.ball = null;
    else {
      this.ball ??= { x, z };
      this.ball.x = x;
      this.ball.z = z;
    }
  }

  /** How the stands answer a moment of the match (strength 0 … 1). */
  react(mood: CrowdMood, strength = 1) {
    const s = Math.min(1, Math.max(0.2, strength));
    const t = this.now;
    if (mood === 'cheer') {
      this.stand.hit(0.55 + 0.45 * s, 1.6 + 1.4 * s, t);
      this.jump.hit(s, 1.2 + s, t);
      this.arms.hit(0.6 + 0.4 * s, 1.1 + 1.2 * s, t);
    } else if (mood === 'ooh') {
      this.lean.hit(s, 0.9, t);
      this.stand.hit(0.25 * s, 0.7, t);
    } else this.jump.hit(0.45 * s, 1.3, t);
  }

  update(dt: number) {
    this.now += dt;
    const t = this.now;
    // (a cut to a TV shot: the stands go soft at once; back to the game, they come into focus over a moment)
    this.softNow = this.softWant > this.softNow ? this.softWant : this.softNow + (this.softWant - this.softNow) * (1 - Math.exp(-4 * dt));
    this.c.soft.value = SOFT_BIAS * this.softNow;
    this.c.time.value = t % 1000;
    this.lookAcc += dt;
    let heads = false;
    if (this.lookAcc >= 0.05) {
      this.heads(this.lookAcc);
      this.lookAcc = 0;
      heads = true;
    }
    this.stand.step(dt, t, 7, 1.6);
    this.jump.step(dt, t, 9, 2.5);
    this.arms.step(dt, t, 8, 2.8);
    this.lean.step(dt, t, 6, 2.2);
    this.tens += (this.tension - this.tens) * (1 - Math.exp(-1.5 * dt));
    // (a winner, the end of a match: the phones come out)
    this.c.flashes.value = 2 + 45 * this.stand.v;
    const busy = this.stand.v + this.jump.v + this.arms.v + this.lean.v + this.tens > 2e-3;
    if (!busy) {
      if (!this.idle || heads) this.pose(0, true);
      this.idle = true;
      return;
    }
    this.idle = false;
    this.acc += dt;
    if (this.acc < 1 / 30 && !heads) return;
    this.acc = 0;
    this.pose(t, false);
  }

  /** heads after the ball: the keen ones quick and right on it, the rest a beat late; a few look elsewhere */
  private heads(dt: number) {
    const C = this.c;
    const L = this.look;
    const b = this.ball;
    const t = this.now;
    // (only the rows low enough to see the ball: higher up a turned head is lost in the distance)
    for (let i = 0; i < C.lookers; i++) {
      const keen = C.keen[i];
      let want = 0;
      // chatting to a neighbour or looking at the board now and then (the officials never take their eyes off it)
      const away = i >= C.staff && Math.sin(t * 0.13 + this.phase[i] * 3.1) > 0.93 - keen * 0.25;
      if (away) want = Math.sin(this.phase[i] * 7.3) > 0 ? 0.9 : -0.9;
      else if (b) {
        const dx = b.x - C.base[i * 3];
        const dz = b.z - C.base[i * 3 + 2];
        let a = Math.atan2(dx, dz) - C.yaw[i];
        a = Math.atan2(Math.sin(a), Math.cos(a));
        want = Math.max(-1.25, Math.min(1.25, a));
      } else want = Math.sin(t * 0.3 + this.phase[i]) * 0.25;
      const k = 1 - Math.exp(-(3 + keen * 6) * dt);
      L[i] += (want - L[i]) * k;
    }
  }

  /** puts every spectator where the moods say (rest: back in the seat, only the heads turn) */
  private pose(t: number, rest: boolean) {
    const C = this.c;
    const S = C.state.array as Float32Array;
    const stand = rest ? 0 : this.stand.v;
    const jump = rest ? 0 : this.jump.v;
    const arms = rest ? 0 : this.arms.v;
    const lean = rest ? 0 : this.lean.v;
    const tens = rest ? 0 : this.tens;
    for (let i = 0; i < this.n; i++) {
      // the court's staff stay at work: the officials sit and watch, the camera crews stand at their cameras
      if (i < C.staff) {
        const l = this.look[i];
        S[i * 4] = 0;
        S[i * 4 + 1] = C.kinds[i] === 3 ? POSE.clap : l < -0.42 ? POSE.right : l > 0.42 ? POSE.left : POSE.seat;
        continue;
      }
      const keen = C.keen[i];
      // the keen ones get up first (and the others not all the way)
      const d = (1 - keen) * 0.4;
      const up = smooth(d, d + 0.5, stand);
      const hop = jump * Math.abs(Math.sin(t * this.rate[i] + this.phase[i])) * (0.4 + 0.6 * keen);
      let pose: number;
      let lift = 0;
      if (up > 0.5) {
        // on their feet: the keen ones wave their arms, the rest clap
        pose = arms > 0.15 && keen > 0.45 ? POSE.cheer : POSE.clap;
        lift = hop * 0.07;
      } else {
        const fwd = lean * (0.5 + keen) + tens * 0.9 * keen;
        const l = this.look[i];
        pose = fwd > 0.55 ? POSE.lean : C.crossed[i] ? POSE.crossed : l < -0.42 ? POSE.right : l > 0.42 ? POSE.left : POSE.seat;
        // a seated hop is a bounce in the seat
        lift = hop * 0.035 + up * 0.04;
      }
      S[i * 4] = lift;
      S[i * 4 + 1] = pose;
    }
    C.state.needsUpdate = true;
  }
}
