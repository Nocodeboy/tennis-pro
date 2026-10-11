// The centre court of a pro tour's finals, at night: a padel court of blue artificial grass with its white service
// lines inside the glass and wire cage (cage.ts), the net and its posts at the side walls, a dark floor round the
// cage with LED boards behind the far end and along the sides, the umpire's chair and the players' benches by the net
// doors, the TV cameras and the photographers, and the stadium round it all (stadium.ts): a bowl of stands full of
// people, the boxes, the roof with its ring of floodlights and two video boards, under a dark night sky.
//
// Built for a phone: everything that does not move is merged by material (the bowl and its steel in one mesh, the
// court's furniture in another that casts shadows, everything that glows in a third: led.ts; the cage in three), the
// crowd is one instanced mesh, the floodlights' glare another. The furniture (the umpire's chair, the benches, the TV
// cameras, the photographers' stools, the net posts) is modelled in Blender with its ambient occlusion baked in
// (blender-props.ts), and the floodlights' light on the floor is baked in Blender too (floorlight.ts): the soft
// shadows of the cage, the net and the furniture, the darkening at the foot of everything. Until that bake is in (or
// with ?light=off) a decal mesh draws the contact darkening at the foot of walls, posts and boards.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HL, L, NET_C, NET_S, POST_X, SERVICE, W, netHeight } from '../sim/court';
import { buildCage, type Cage } from './cage';
import { crowdMesh, type Crowd } from './crowd';
import { EmissiveBuilder, HEAD_FONT, LED, LED_ASPECT, drawScreen, emissiveMaterial, ledAtlas, screenCanvas } from './led';
import { Solid, buildStadium, outline, solidMaterial, videoBoards, type Spot } from './stadium';
import { aoTexture, courtPaint, surface, turfDetail } from './textures';
import { addProp, loadProps, propTiming, type PropName } from './blender-props';
import { litByFloor, loadFloorLight } from './floorlight';

/** the LED boards round the cage: behind the far back wall, and along the sides (out from the side walls) */
const BOARD_Z = HL + 2.3;
const BOARD_X = W / 2 + 1.75;
/** the floor painted round the cage (the court and a dark surround), and the size of one tile of the turf's grain */
const SURF_W = W + 2 * 2.3;
const SURF_L = L + 2 * 2.7;
const TILE = 1.2;
/** how much of the drawn shade inside the cage's foot stays once the floor light is baked in */
const FOOT_KEEP = 0.6;

/** a tour court's colours: the blue grass, a dark navy surround outside the cage, the white lines */
export const PAINT = {
  court: 0x2361aa,
  apron: 0x161e2b,
  line: 0xf4f6f2,
};

export interface Venue {
  group: THREE.Group;
  net: THREE.Group;
  /** the glass and wire cage (impacts) */
  cage: Cage;
  /** the dynamic canvas (the video boards and the score on the LED boards): the view redraws the score on it */
  board: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  /** the spectators (see crowd.ts) */
  crowd: Crowd;
  /** the LEDs' clock (s) */
  ledTime: { value: number };
  /** what is hidden while the environment is baked (the glare drawn for the eye) */
  envHide: THREE.Object3D[];
  /** the furniture is in (the Blender models, or the boxes for good: ?props=box, no file); for the tools */
  furnished: boolean;
  /** what bringing the Blender models in took (ms): fetching the file, decoding it, building the furniture's mesh */
  furnishMs: { fetch: number; decode: number; build: number };
  /** repaint the boards and the logos (once the display font has loaded) */
  redrawBoards(): void;
  /** what each quality tier can afford */
  setTier(t: 'high' | 'medium' | 'low'): void;
}

const m4 = new THREE.Matrix4();
const q4 = new THREE.Quaternion();
const e4 = new THREE.Euler();
const v4 = new THREE.Vector3();
const s4 = new THREE.Vector3();
/** a matrix placing something at (x, y, z) turned by ry (and rx, rz) */
function at(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.Matrix4 {
  return m4.compose(v4.set(x, y, z), q4.setFromEuler(e4.set(rx, ry, rz)), s4.set(1, 1, 1));
}

/** surfaces of the court's furniture: roughness, metalness, no fall-off */
const GRAPHITE: [number, number, number] = [0.38, 0.6, 0];
const PAINTED: [number, number, number] = [0.5, 0.1, 0];
const PLASTIC: [number, number, number] = [0.55, 0, 0];
const CLOTH: [number, number, number] = [0.9, 0, 0];

export function buildVenue(tier: 'high' | 'medium' | 'low'): Venue {
  const g = new THREE.Group();
  // ---------- the court surface ----------
  // the court and the surround as one surface: its own colour (the rolls of turf, wear) over a tiled grass grain
  const det = turfDetail(tier === 'low' ? 256 : 512, 11);
  det.detail.channel = det.normal.channel = 1;
  const paint = courtPaint({ sw: SURF_W, sl: SURF_L, cw: W, cl: L, service: SERVICE, apron: PAINT.apron, court: PAINT.court, px: tier === 'low' ? 192 : 320, seed: 5 });
  const surf = new THREE.Mesh(surfaceGeometry(), litByFloor(courtMaterial(paint, det.detail, det.normal), false));
  surf.receiveShadow = true;
  g.add(surf);
  const lines = courtLines(det.normal);
  litByFloor(lines.material as THREE.Material, false);
  g.add(lines);
  const logos = apronLogos(det.normal);
  litByFloor(logos.mesh.material as THREE.Material, false);
  g.add(logos.mesh);
  const cage = buildCage();
  g.add(cage.group);

  // ---------- the stadium (one solid mesh), and everything that glows (one emissive mesh) ----------
  const solid = new Solid();
  const glow = new EmissiveBuilder();
  const bowl = buildStadium(solid, glow);
  videoBoards(solid, glow);
  // the court's furniture: a second solid mesh, the one that casts shadows on the court
  const props = new Solid();
  const staff: Spot[] = [];
  const ao: Decal[] = [];

  // where each piece of the furniture stands (drawn once the Blender models are in: furnish(), below)
  const places: Place[] = [];
  const put = (name: PropName, x: number, y: number, z: number, ry: number, mirror = false) => places.push({ name, x, y, z, ry, mirror });

  // ---------- the net (the posts stand still at the side walls; the net, its tape and cords sway when hit) ----------
  const net = new THREE.Group();
  // rectangular steel posts flush with the side mesh, the net on their face, the winder's crank towards the near end
  for (const sx of [-1, 1]) put('net_post', sx * POST_X, 0, 0, (-sx * Math.PI) / 2, sx < 0);
  const seg = 40;
  const ng = new THREE.PlaneGeometry(POST_X * 2 - 0.16, 1, seg, 1);
  const pos = ng.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setY(i, pos.getY(i) > 0 ? netHeight(Math.min(Math.abs(x), W / 2)) - 0.035 : 0.03);
  }
  ng.computeVertexNormals();
  const netMesh = new THREE.Mesh(ng, netMaterial());
  netMesh.renderOrder = 1;
  net.add(netMesh);
  // white headband (follows the sag) and the centre strap, one mesh; the cord along the bottom
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.45 });
  const pts: THREE.Vector3[] = [];
  const bottom: THREE.Vector3[] = [];
  const end = POST_X - 0.06;
  for (let i = 0; i <= seg; i++) {
    const x = -end + (i / seg) * end * 2;
    pts.push(new THREE.Vector3(x, netHeight(Math.min(Math.abs(x), W / 2)) - 0.01, 0));
    bottom.push(new THREE.Vector3(x, 0.03, 0));
  }
  const tapeGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.026, 6).scale(1, 1, 0.45);
  const strapGeo = new THREE.BoxGeometry(0.05, NET_C, 0.012).translate(0, NET_C / 2, 0);
  const tape = new THREE.Mesh(merged([tapeGeo, strapGeo]), tapeMat);
  tape.castShadow = true;
  net.add(tape);
  const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bottom), 8, 0.008, 4), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.8 }));
  net.add(cord);
  g.add(net);
  for (const sx of [-1, 1]) ao.push({ x: sx * (POST_X - 0.045), z: 0, len: 0.4, depth: 0.4, ry: 0, side: 0, a: 0.5, off: 0 });
  ao.push({ x: 0, z: 0, len: POST_X * 2, depth: 0.2, ry: 0, side: 1, a: 0.14, off: 0 }, { x: 0, z: 0, len: POST_X * 2, depth: 0.2, ry: 0, side: -1, a: 0.14, off: 0 });
  // the cage's foot: the infill and the shade along the glass and the mesh, inside and out (the inside's stays, lighter,
  // with the floor light baked: the glass lets the floodlights through, so the bake has no shade at its foot, and this
  // line is what tells the court's edge at the glass from the gameplay camera)
  for (const s of [1, -1]) {
    ao.push({ x: 0, z: s * HL, len: W, depth: 0.5, ry: 0, side: -s as 1 | -1, a: 0.32, off: 0, keep: FOOT_KEEP });
    ao.push({ x: 0, z: s * (HL + 0.04), len: W + 0.1, depth: 0.6, ry: 0, side: s as 1 | -1, a: 0.4, off: 0 });
    ao.push({ x: s * (W / 2), z: 0, len: L, depth: 0.42, ry: Math.PI / 2, side: s as 1 | -1, a: 0.26, off: 0 });
    ao.push({ x: s * (W / 2 + 0.04), z: 0, len: L + 0.1, depth: 0.55, ry: Math.PI / 2, side: -s as 1 | -1, a: 0.36, off: 0, keep: FOOT_KEEP });
  }

  // ---------- LED boards round the cage (none at the near end: the gameplay camera looks over it; a gap on the sides
  // at the net for the umpire, the benches and the TV camera) ----------
  const BH = 0.9;
  const BT = LED_ASPECT * (BH - 0.08);
  let bi = 0;
  const addBoard = (x: number, z: number, len: number, ry: number) => {
    // its housing (dark, casts its shadow on the surround) and the LED face towards the court
    props.box(at(x, BH / 2, z, ry), len, BH, 0.24, 0x101318, PAINTED);
    const right = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    const front = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const c = new THREE.Vector3(x, BH / 2, z).addScaledVector(front, 0.122);
    glow.panel(c, right, new THREE.Vector3(0, 1, 0), len - 0.06, BH - 0.08, { T: BT, H: BH - 0.08, phase: -bi * 0.11, mode: LED.cycle }, BT / 2 - (len - 0.06) / 2);
    bi++;
    ao.push({ x, z, len, depth: 0.6, ry, side: 1, a: 0.5, off: 0.12 }, { x, z, len, depth: 0.45, ry, side: -1, a: 0.42, off: 0.12 });
  };
  // the far end: three boards facing the near end
  for (let i = 0; i < 3; i++) addBoard(-4.02 + i * 4.02, -BOARD_Z, 3.96, 0);
  // the sides: two boards each side of the net gap, facing in
  for (const sx of [-1, 1]) for (const zc of [-9.2, -5.1, 5.1, 9.2]) addBoard(sx * BOARD_X, zc, 4.0, (sx * -Math.PI) / 2);

  // ---------- the umpire's high chair at the net, outside the side mesh; the players' benches either side of it ----------
  {
    const x = -(POST_X + 0.8);
    put('umpire_chair', x, 0, 0, Math.PI / 2);
    ao.push({ x, z: 0, len: 1.2, depth: 1.2, ry: 0, side: 0, a: 0.5, off: 0 });
    staff.push({ x: x + 0.02, y: 1.93, z: 0, yaw: Math.PI / 2, v: 0.5, kind: 2 });
    // (facing the court; mirrored on the near side so the bag stands at the end away from the net, by the door)
    for (const sz of [-1, 1]) {
      const bx = -(POST_X + 1.15);
      const bz = sz * 1.65;
      put('bench', bx, 0, bz, Math.PI / 2, sz > 0);
      ao.push({ x: bx, z: bz, len: 0.8, depth: 2.0, ry: 0, side: 0, a: 0.45, off: 0 });
    }
  }

  // ---------- TV cameras (on tripods, an operator behind each) ----------
  const camera = (x: number, z: number, ry: number, base: number) => {
    const fx = Math.sin(ry);
    const fz = Math.cos(ry);
    put('tv_camera', x, base, z, ry);
    staff.push({ x: x - fx * 0.55, y: base, z: z - fz * 0.55, yaw: ry, v: 0.3, kind: 3 });
    ao.push({ x, z, len: 0.8, depth: 0.8, ry: 0, side: 0, a: 0.45, off: 0 });
  };
  for (const sx of [-1, 1]) {
    // behind the far end, looking through the glass
    camera(sx * 5.2, -BOARD_Z - 1.0, 0, 0);
    // (the near end's out of the gameplay camera's frame, in the corners: they show in the TV's reverse angles)
    camera(sx * 6.4, HL + 1.6, Math.PI + sx * 0.5, 0);
  }
  // the side camera on its platform across from the umpire
  props.box(at(BOARD_X + 0.75, 0.2, 0), 1.1, 0.4, 1.2, 0x23272e, PAINTED);
  camera(BOARD_X + 0.65, 0, -Math.PI / 2, 0.4);
  ao.push({ x: BOARD_X + 0.75, z: 0, len: 1.6, depth: 1.7, ry: 0, side: 0, a: 0.5, off: 0 });

  // ---------- photographers behind the far end and in the near corners ----------
  for (const [x, z] of [
    [-3.0, -1],
    [-1.4, -1],
    [1.3, -1],
    [2.9, -1],
    [-4.6, 1],
    [4.6, 1],
  ]) {
    const zz = z < 0 ? -(BOARD_Z + 0.75) : HL + 0.9;
    put('stool', x, 0, zz, z < 0 ? 0 : Math.PI);
    staff.push({ x, y: 0.32, z: zz, yaw: z < 0 ? 0 : Math.PI, v: 0.4, kind: 2 });
  }

  // ---------- the foot of the stands' front wall ----------
  for (const s of outline(0)) ao.push({ x: s.x, z: s.z, len: s.len + 0.05, depth: 0.9, ry: s.ry, side: 1, a: 0.5, off: 0 });

  // ---------- the meshes ----------
  const grain = surface({ seed: 21, size: tier === 'low' ? 128 : 256, grain: 0.22, blotch: 0.18, rough: [0.8, 1], normal: 2, repeat: 1 }).map;
  const bowlMesh = new THREE.Mesh(solid.geometry(), litByFloor(solidMaterial(grain, 'pb-bowl'), true));
  bowlMesh.receiveShadow = true;
  g.add(bowlMesh);
  // the furniture: the boards' housings and the camera platform (`props`) and every piece at its place, the Blender
  // models once they are in (until then only the fixed parts; the boxes if the models cannot come)
  const furnish = (models: boolean | null): THREE.BufferGeometry => {
    const s = new Solid();
    s.P = props.P.slice();
    s.N = props.N.slice();
    s.U = props.U.slice();
    s.C = props.C.slice();
    s.S = props.S.slice();
    s.I = props.I.slice();
    if (models !== null) for (const p of places) models ? addProp(s, p.name, p.x, p.y, p.z, p.ry, p.mirror) : boxProp(s, p);
    return s.geometry();
  };
  const propMesh = new THREE.Mesh(furnish(null), litByFloor(solidMaterial(grain, 'pb-bowl'), true));
  propMesh.castShadow = propMesh.receiveShadow = true;
  g.add(propMesh);
  const atlas = ledAtlas(tier === 'low' ? 0.5 : 1);
  const screen = screenCanvas();
  const em = emissiveMaterial(atlas.tex, screen.tex);
  const glowMesh = new THREE.Mesh(glow.geometry(), em.mat);
  g.add(glowMesh);
  const crowd = crowdMesh([...staff, ...bowl.spots], staff.length + bowl.lookers, staff.length);
  g.add(crowd.mesh);
  const halo = halos(bowl.lamps);
  g.add(halo.mesh);
  g.add(sky());
  const contact = decals(ao);
  g.add(contact);
  // the floodlights' light baked in Blender (floorlight.ts): once in, it has the contact darkening at the foot of
  // everything (from all the lamps), so the drawn decals go but for the shade inside the cage's foot (`keep`); the
  // key light's sharp shadows stay live
  loadFloorLight(() => {
    contact.geometry.dispose();
    contact.geometry = decalGeometry(ao.filter((d) => d.keep).map((d) => ({ ...d, a: d.a * d.keep! })));
  });

  const venue: Venue = {
    group: g,
    net,
    cage,
    board: screen,
    crowd,
    ledTime: em.time,
    envHide: [halo.mesh],
    furnished: false,
    furnishMs: propTiming,
    redrawBoards() {
      atlas.redraw();
      logos.redraw();
    },
    setTier(t) {
      // (high adds a bloom of its own over the floodlights: the drawn glare a little softer)
      halo.gain.value = t === 'high' ? 0.7 : 1;
      // (low: the boards' messages at half the size, a quarter of the memory)
      if (t === 'low') atlas.setScale(0.5);
    },
  };
  // the furniture's models are fetched next to the page (assets/props): swapped in when they arrive
  loadProps().then((ok) => {
    const t0 = performance.now();
    propMesh.geometry.dispose();
    propMesh.geometry = furnish(ok);
    propTiming.build = performance.now() - t0;
    venue.furnished = true;
  });
  return venue;
}

/** a piece of the furniture at its place (blender-props.ts: its front, +z, faces (sin ry, cos ry)) */
interface Place {
  name: PropName;
  x: number;
  y: number;
  z: number;
  ry: number;
  mirror: boolean;
}

/** The boxes the Blender models replaced (?props=box, or the props file missing): the same places. */
function boxProp(s: Solid, p: Place) {
  const { x, y, z, ry } = p;
  const fx = Math.sin(ry);
  const fz = Math.cos(ry);
  switch (p.name) {
    case 'net_post':
      // a round black post against the side mesh, its cap and the winder
      s.geo(new THREE.CylinderGeometry(0.04, 0.04, NET_S + 0.06, 10).translate(x + fx * 0.045, (NET_S + 0.06) / 2, z), 0x16181c, GRAPHITE);
      s.box(at(x + fx * 0.045, NET_S + 0.065, z), 0.1, 0.02, 0.1, 0x22252b, GRAPHITE);
      s.box(at(x + fx * 0.045, 0.62, z + 0.06), 0.05, 0.12, 0.06, 0x22252b, GRAPHITE);
      break;
    case 'umpire_chair':
      // (facing +x: the court on the left of the near camera)
      for (const lx of [-0.28, 0.28]) for (const lz of [-0.28, 0.28]) s.box(at(x + lx, 0.75, z + lz), 0.05, 1.5, 0.05, 0x1b1e24, GRAPHITE);
      s.box(at(x, 1.5, z), 0.72, 0.06, 0.72, 0x23272e, GRAPHITE);
      s.box(at(x, 1.9, z), 0.48, 0.07, 0.46, 0x111317, PLASTIC);
      s.box(at(x - 0.25, 2.2, z), 0.05, 0.56, 0.48, 0x111317, PLASTIC);
      s.box(at(x + 0.36, 1.82, z), 0.04, 0.6, 0.72, 0x14365c, PAINTED);
      for (const lz of [-0.2, 0.2]) s.box(at(x - 0.55, 0.78, z + lz, 0, 0, -0.38), 0.05, 1.7, 0.05, 0x1b1e24, GRAPHITE);
      for (let i = 0; i < 4; i++) s.box(at(x - 0.78 + i * 0.13, 0.25 + i * 0.36, z), 0.06, 0.03, 0.4, 0x2a2e36, GRAPHITE);
      break;
    case 'bench': {
      // (facing +x; the bag at the end away from the net)
      const sz = p.mirror ? 1 : -1;
      s.box(at(x, 0.23, z), 0.46, 0.46, 1.7, 0x18202c, PAINTED);
      s.box(at(x - 0.22, 0.68, z), 0.06, 0.48, 1.7, 0x18202c, PAINTED);
      s.box(at(x + 0.02, 0.48, z + sz * 0.3), 0.36, 0.04, 0.42, 0xeeeeea, CLOTH);
      for (let i = 0; i < 2; i++) s.box(at(x + 0.33, 0.12, z - sz * (0.5 + i * 0.12)), 0.07, 0.24, 0.07, i ? 0xe2f04a : 0xf0f2f4, PLASTIC);
      s.box(at(x + 0.05, 0.2, z + sz * 1.12), 0.42, 0.4, 0.34, 0x2a3442, PLASTIC);
      break;
    }
    case 'tv_camera':
      for (let i = 0; i < 3; i++) {
        const a = ry + (i * Math.PI * 2) / 3;
        s.box(at(x + Math.sin(a) * 0.22, y + 0.7, z + Math.cos(a) * 0.22, a, 0.3), 0.035, 1.42, 0.035, 0x1b1e24, GRAPHITE);
      }
      s.box(at(x, y + 1.48, z, ry), 0.3, 0.34, 0.5, 0x202328, PAINTED);
      s.box(at(x + fx * 0.36, y + 1.5, z + fz * 0.36, ry), 0.17, 0.17, 0.26, 0x0c0d10, GRAPHITE);
      s.box(at(x - fx * 0.12, y + 1.71, z - fz * 0.12, ry), 0.16, 0.1, 0.18, 0x15171b, PLASTIC);
      break;
    case 'stool':
      s.box(at(x, 0.15, z), 0.32, 0.3, 0.32, 0x1b1e24, PLASTIC);
      break;
  }
}

/** merge, dropping attributes that not all of them have */
function merged(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const keep = ['position', 'normal', 'uv'];
  const clean = gs.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!keep.includes(k)) n.deleteAttribute(k);
    n.clearGroups();
    return n;
  });
  return mergeGeometries(clean, false)!;
}

/**
 * The floodlights' glare: a soft glow and a faint horizontal streak (a broadcast lens) over each lamp, facing the
 * camera, only for the lamps that face it. One instanced quad, added light; the high tier's bloom adds its own.
 */
function halos(lamps: { p: THREE.Vector3; n: THREE.Vector3 }[]): { mesh: THREE.Mesh; gain: { value: number } } {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const P: number[] = [];
  const N: number[] = [];
  for (const l of lamps) {
    P.push(l.p.x, l.p.y, l.p.z);
    N.push(l.n.x, l.n.y, l.n.z);
  }
  geo.setAttribute('aAt', new THREE.InstancedBufferAttribute(new Float32Array(P), 3));
  geo.setAttribute('aDir', new THREE.InstancedBufferAttribute(new Float32Array(N), 3));
  geo.instanceCount = lamps.length;
  const gain = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uGain: gain },
    vertexShader: /* glsl */ `
      attribute vec3 aAt; attribute vec3 aDir;
      varying vec2 vQ; varying float vK;
      void main() {
        vec3 toCam = cameraPosition - aAt;
        float d = length( toCam );
        // (a lamp seen from behind or edge on gives no glare)
        vK = smoothstep( 0.05, 0.6, dot( aDir, toCam / d ) );
        vec3 r = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
        vec3 u = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
        vQ = position.xy;
        // (wider than tall: room for the streak)
        vec3 w = aAt + r * position.x * 14.0 + u * position.y * 7.0;
        gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGain;
      varying vec2 vQ; varying float vK;
      void main() {
        vec2 q = vQ * vec2( 14.0, 7.0 );
        float r = length( q );
        float core = exp( - r * r * 0.7 );
        float glow = exp( - r * 0.7 ) * 0.34 + exp( - r * 0.26 ) * 0.08;
        float streak = exp( - abs( q.y ) * 6.0 ) * exp( - abs( q.x ) * 0.28 ) * 0.2;
        float a = ( core * 0.5 + glow + streak ) * vK * uGain;
        // (the quad's edge: no visible border)
        a *= smoothstep( 0.5, 0.42, max( abs( vQ.x ), abs( vQ.y ) ) );
        gl_FragColor = vec4( vec3( 0.86, 0.91, 1.0 ) * a, 1.0 );
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return { mesh, gain };
}

/** The night sky over the open roof: near black at the top, a haze lit by the stadium and the city lower down. */
function sky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const p = geo.attributes.position;
  const col: number[] = [];
  const top = new THREE.Color(0x03060b);
  const mid = new THREE.Color(0x0b1220);
  const low = new THREE.Color(0x1c2230);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 400;
    if (y < 0.35) c.copy(low).lerp(mid, Math.max(0, y) / 0.35);
    else c.copy(mid).lerp(top, Math.min(1, (y - 0.35) / 0.65));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -2;
  m.frustumCulled = false;
  return m;
}

/** The court surround as one quad: uv over the whole surface (the paint), uv1 in grain tiles (world metres / TILE). */
function surfaceGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const P: number[] = [];
  const U: number[] = [];
  const U1: number[] = [];
  for (const [x, z] of [
    [-SURF_W / 2, -SURF_L / 2],
    [SURF_W / 2, -SURF_L / 2],
    [SURF_W / 2, SURF_L / 2],
    [-SURF_W / 2, SURF_L / 2],
  ]) {
    P.push(x, 0, z);
    U.push(x / SURF_W + 0.5, z / SURF_L + 0.5);
    U1.push(x / TILE, z / TILE);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(U1, 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

/**
 * The artificial grass: the court's colour (wear in alpha) times the grain of the fibres (R), matte (G, a touch
 * smoother where the pile is flattened), and the grain's normal map. Grass has a soft sheen at a grazing angle (the
 * fibres catch the light along their length): a little of it, so the far half of the court picks up the floodlights.
 */
function courtMaterial(paint: THREE.Texture, detail: THREE.Texture, normal: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: paint, roughnessMap: detail, normalMap: normal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <map_fragment>',
        `vec4 pbPaint = texture2D( map, vMapUv );
        vec4 pbDet = texture2D( roughnessMap, vRoughnessMapUv );
        diffuseColor.rgb *= pbPaint.rgb * ( 0.8 + 0.4 * pbDet.r );`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * pbDet.g * ( 1.0 - 0.12 * pbPaint.a );');
  };
  m.customProgramCacheKey = () => 'pb-turf';
  return m;
}

/**
 * The net's mesh, worked out per pixel (no texture): cords 3.5 mm thick every 44 mm, filtered by how much of the
 * mesh a pixel covers. Close up the cords are crisp; further away, where a cell is a pixel or less, the net fades to
 * its average darkness instead of breaking into moiré or dots (what an alpha-tested texture does).
 */
function netMaterial(): THREE.MeshLambertMaterial {
  // (matte: a glossy material picks up a grey sheen at a glancing angle and the net turns into a pale veil)
  const m = new THREE.MeshLambertMaterial({ color: 0x0c0d10, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vNet;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvNet = position.xy / 0.044;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vNet;')
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
        {
          vec2 fw = max(fwidth(vNet), vec2(1e-4));
          vec2 d = abs(fract(vNet + 0.5) - 0.5);
          const float cw = 0.085; // cord width in cells
          vec2 cov = clamp((0.5 * cw + 0.5 * fw - d) / fw, 0.0, 1.0);
          cov = min(cov, vec2(cw) / fw);
          // a cell a pixel or smaller: the mesh as a whole, a dark veil a little denser than the cords alone
          vec2 far = smoothstep(vec2(0.3), vec2(1.0), fw);
          cov = mix(cov, vec2(0.17), far);
          diffuseColor.a *= 1.0 - (1.0 - cov.x) * (1.0 - cov.y);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'pb-net';
  return m;
}

/**
 * The lines, one mesh: each line is a quad a little wider than the line, and the edge is drawn by the pixel's own
 * footprint (analytic anti-aliasing), so a 5 cm line stays clean at the far service line with or without MSAA.
 */
function courtLines(normal: THREE.Texture): THREE.Mesh {
  const lw = 0.05;
  // the service lines across the court (the line is in: its outer edge is the service line's distance), and the
  // centre service line from the net to 20 cm past each of them (FIP); no other lines (the walls are the court's ends
  // and sides)
  const sv = SERVICE - lw / 2;
  const c0 = lw / 2;
  const c1 = SERVICE + 0.2;
  const lines: [number, number, number, number][] = [
    [W, lw, 0, -sv],
    [W, lw, 0, sv],
    [lw, c1 - c0, 0, (c0 + c1) / 2],
    [lw, c1 - c0, 0, -(c0 + c1) / 2],
  ];
  const m = 0.04;
  const P: number[] = [];
  const N: number[] = [];
  const U: number[] = [];
  const E: number[] = [];
  const I: number[] = [];
  for (const [w, d, x, z] of lines) {
    const hx = w / 2 + m;
    const hz = d / 2 + m;
    const b = P.length / 3;
    for (const [cx, cz] of [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ]) {
      P.push(x + cx, 0.005, z + cz);
      N.push(0, 1, 0);
      U.push((x + cx) / TILE, (z + cz) / TILE);
      E.push(cx, cz, w / 2, d / 2);
    }
    I.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('uv1', new THREE.Float32BufferAttribute(U, 2));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(E, 4));
  geo.setIndex(I);
  // (white turf glued into the blue: a little brighter at a glancing angle)
  const mat = new THREE.MeshStandardMaterial({ color: PAINT.line, roughness: 0.62, metalness: 0, normalMap: normal, normalScale: new THREE.Vector2(0.2, 0.2), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aEdge;\nvarying vec4 vEdge;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vEdge;').replace(
      '#include <alphamap_fragment>',
      `#include <alphamap_fragment>
      {
        vec2 fw = max(fwidth(vEdge.xy), vec2(1e-5));
        vec2 cov = clamp(0.5 - (abs(vEdge.xy) - vEdge.zw) / fw, 0.0, 1.0);
        diffuseColor.a *= cov.x * cov.y;
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'pb-lines';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

/**
 * The tournament's name on the surround behind each back wall, outside the glass, as on a tour court: the near one at
 * the foot of the gameplay frame, the far one through the far glass, both upright for the gameplay camera. One mesh,
 * one small canvas (white, the floor's grain showing through a little).
 */
function apronLogos(normal: THREE.Texture): { mesh: THREE.Mesh; redraw: () => void } {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 224;
  const x = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const draw = () => {
    x.clearRect(0, 0, c.width, c.height);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `700 132px ${HEAD_FONT}`;
    const big = 'PRO TOUR FINALS';
    // (fit the line whatever font the device falls back to)
    const k = Math.min(1, 960 / Math.max(1, x.measureText(big).width));
    x.save();
    x.translate(512, 92);
    x.scale(k, 1);
    x.fillStyle = 'rgba(244,246,248,0.86)';
    x.fillText(big, 0, 0);
    x.restore();
    x.font = `700 46px ${HEAD_FONT}`;
    x.fillStyle = 'rgba(226,240,74,0.9)';
    x.fillText('CENTER COURT', 512, 186);
    tex.needsUpdate = true;
  };
  draw();
  const w = 4.2;
  const d = w * (c.height / c.width);
  const z = HL + 0.45 + d / 2;
  const P: number[] = [];
  const U: number[] = [];
  const U1: number[] = [];
  const I: number[] = [];
  for (const side of [1, -1]) {
    const k = P.length / 3;
    // corners (x, z) and their uv; both read upright from the gameplay camera's end (+z): the far one is seen through
    // the far glass
    for (const [cx, cz, u, v] of [
      [-w / 2, -d / 2, 0, 1],
      [w / 2, -d / 2, 1, 1],
      [w / 2, d / 2, 1, 0],
      [-w / 2, d / 2, 0, 0],
    ]) {
      P.push(cx, 0.004, side * z + cz);
      U.push(u, v);
      U1.push(cx / TILE, (side * z + cz) / TILE);
    }
    I.push(k, k + 2, k + 1, k, k + 3, k + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setAttribute('uv1', new THREE.Float32BufferAttribute(U1, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.55, normalMap: normal, normalScale: new THREE.Vector2(0.25, 0.25), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return { mesh, redraw: draw };
}

/**
 * A baked contact shadow on the ground: a strip along the foot of something (`len` along it, `depth` out from it on
 * `side` ±1 of its line, rotated by ry), or a round blob (side 0: len × depth). `a`: how dark; `off`: gap from the line.
 */
interface Decal {
  x: number;
  z: number;
  len: number;
  depth: number;
  ry: number;
  side: -1 | 0 | 1;
  a: number;
  off: number;
  y?: number;
  /** stays (at this much of `a`) once the floor light is in; the rest go */
  keep?: number;
}
function decals(list: Decal[]): THREE.Mesh {
  const mesh = new THREE.Mesh(decalGeometry(list), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: aoTexture(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.renderOrder = 1;
  return mesh;
}
function decalGeometry(list: Decal[]): THREE.BufferGeometry {
  const P: number[] = [];
  const U: number[] = [];
  const C: number[] = [];
  const I: number[] = [];
  for (const d of list) {
    const c = Math.cos(d.ry);
    const s = Math.sin(d.ry);
    // local frame: a along the line, b out from it (+z of the object rotated by ry)
    const put = (a: number, b: number, u: number, v: number) => {
      P.push(d.x + a * c + b * s, (d.y ?? 0) + 0.008, d.z - a * s + b * c);
      U.push(u, v);
      C.push(0, 0, 0, d.a);
    };
    const k = P.length / 3;
    const h = d.len / 2;
    if (d.side === 0) {
      put(-h, -d.depth / 2, 0.52, 0);
      put(h, -d.depth / 2, 1, 0);
      put(h, d.depth / 2, 1, 1);
      put(-h, d.depth / 2, 0.52, 1);
    } else {
      const b0 = d.side * d.off;
      const b1 = d.side * (d.off + d.depth);
      // v runs from the wall (0, darkest) out (1)
      put(-h, b0, 0.02, 0);
      put(h, b0, 0.46, 0);
      put(h, b1, 0.46, 1);
      put(-h, b1, 0.02, 1);
    }
    if (d.side >= 0) I.push(k, k + 1, k + 2, k, k + 2, k + 3);
    else I.push(k, k + 2, k + 1, k, k + 3, k + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
  geo.setIndex(I);
  return geo;
}

/** Repaints the video boards and the LED score (games in the set, points in the game). */
export function drawBoard(b: Venue['board'], left: string, right: string, games: [number, number], points: [string, string], serving: 0 | 1 | null, footer: string, intro = false) {
  drawScreen(b, left, right, games, points, serving, footer, intro);
}
