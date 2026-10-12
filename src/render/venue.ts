// The centre court of a pro tour's finals, at night: a regulation tennis court (ITF, court.ts) on one of three
// surfaces (hard, clay or grass: Venue.setCourt), its lines, the net with its posts and, in singles, the singles
// sticks; the run-off round it (6.40 m behind the baselines, 3.66 m to the sides) up to the boards of the stands at
// BOARDS (the stands' front wall, with the LED ribbon: stadium.ts); the umpire's chair by the net post, the players'
// chairs beside it, the TV cameras, the photographers and the ball kids; and the stadium round it all (stadium.ts): a
// bowl of stands full of people, the boxes, the roof with its ring of floodlights and the video boards, under a dark
// night sky.
//
// Built for a phone: everything that does not move is merged by material (the bowl and its steel in one mesh, the
// court's furniture in another that casts shadows, everything that glows in a third: led.ts), the crowd is one
// instanced mesh, the floodlights' glare another. The furniture (the umpire's chair, the benches, the TV cameras, the
// photographers' stools) is modelled in Blender with its ambient occlusion baked in (blender-props.ts); the net posts
// and the sticks are drawn here. The floodlights' light baked on the padel arena's floor (the old floorlight.ts) did
// not fit this court and is gone: the pool of the floodlights is painted in the floor's colour (textures.ts,
// floorPaint) and the contact darkening at the foot of everything is drawn (decals).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOARDS, HL, NET_C, NET_S, POST_X, SERVICE, STICK_X, W_D, W_S, type CourtSurface } from '../sim/court';
import { crowdMesh, type Crowd } from './crowd';
import { EmissiveBuilder, HEAD_FONT, emissiveMaterial, ledAtlas, screenCanvas, drawScreen } from './led';
import { Solid, buildStadium, outline, solidMaterial, videoBoards, type Spot } from './stadium';
import { FLOOR_COLORS, aoTexture, floorDetail, floorPaint, surface } from './textures';
import { addProp, loadProps, propTiming, type PropName } from './blender-props';

/** the floor painted inside the boards (the court, its run-off and a little under the stands' front wall), and the size of one tile of the surface's grain */
const SURF_W = 2 * BOARDS.x + 0.6;
const SURF_L = 2 * BOARDS.z + 0.6;
const TILE = 1.2;
/** the lines (m): 5 cm, the baselines 10 cm; the centre marks 10 cm long */
const LINE_W = 0.05;
const BASE_W = 0.1;
const MARK_L = 0.1;

export interface Venue {
  group: THREE.Group;
  net: THREE.Group;
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
  /** the surface and the lines in play as drawn now */
  surface: CourtSurface;
  singles: boolean;
  /**
   * The court for a match: its surface (the floor's colour, grain and wear, the lines) and singles or doubles (the
   * net's sag: held up by the singles sticks in singles, by the posts in doubles; the sticks shown in singles only).
   * Returns whether the surface changed (the view then bakes its environment again).
   */
  setCourt(surface: CourtSurface, singles: boolean): boolean;
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

/** the net's top at x for singles or doubles (court.ts netHeight, with the lines in play given) */
function netTop(x: number, singles: boolean): number {
  const a = Math.min(1, Math.abs(x) / (singles ? STICK_X : POST_X));
  return NET_C + (NET_S - NET_C) * a * a;
}

/** the net posts (round, dark green, 1.07 m with a cap), the winder on the umpire's one; the singles sticks */
const POST = { r: 0.055, color: 0x1d3a2c, stick: 0.035 };

export function buildVenue(tier: 'high' | 'medium' | 'low'): Venue {
  const g = new THREE.Group();
  // ---------- the court surface ----------
  const px = tier === 'low' ? 224 : 360;
  const paints = new Map<CourtSurface, THREE.Texture>();
  const details = new Map<CourtSurface, ReturnType<typeof floorDetail>>();
  const paintOf = (k: CourtSurface) => {
    let t = paints.get(k);
    if (!t) paints.set(k, (t = floorPaint({ kind: k, sw: SURF_W, sl: SURF_L, cw: W_D, cl: HL * 2, cs: W_S, sv: SERVICE, px, seed: 5 })));
    return t;
  };
  const detailOf = (k: CourtSurface) => {
    let d = details.get(k);
    if (!d) {
      d = floorDetail(k, tier === 'low' ? 256 : 512, 11);
      d.detail.channel = d.normal.channel = 1;
      details.set(k, d);
    }
    return d;
  };
  const floorMat = courtMaterial(paintOf('hard'), detailOf('hard').detail, detailOf('hard').normal);
  const surf = new THREE.Mesh(surfaceGeometry(), floorMat);
  surf.receiveShadow = true;
  g.add(surf);
  const lines = courtLines(detailOf('hard').normal);
  g.add(lines);
  const logos = apronLogos(detailOf('hard').normal);
  g.add(logos.mesh);

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

  // ---------- the net: the posts (still), the net with its tape and centre strap (it sways when hit), the sticks ----------
  for (const sx of [-1, 1]) {
    const x = sx * POST_X;
    props.geo(new THREE.CylinderGeometry(POST.r, POST.r, NET_S + 0.02, 14).translate(x, (NET_S + 0.02) / 2, 0), POST.color, PAINTED);
    props.geo(new THREE.CylinderGeometry(POST.r + 0.008, POST.r + 0.004, 0.035, 14).translate(x, NET_S + 0.035, 0), 0x16181c, GRAPHITE);
    // (the foot plate)
    props.geo(new THREE.CylinderGeometry(POST.r + 0.03, POST.r + 0.03, 0.012, 14).translate(x, 0.006, 0), 0x16181c, GRAPHITE);
    ao.push({ x, z: 0, len: 0.36, depth: 0.36, ry: 0, side: 0, a: 0.55, off: 0 });
  }
  // the winder on the umpire's post (−x), on its outer side
  props.box(at(-POST_X - POST.r - 0.03, 0.62, 0), 0.06, 0.12, 0.08, 0x16181c, GRAPHITE);
  props.box(at(-POST_X - POST.r - 0.075, 0.6, 0.04, 0, 0, 0.3), 0.012, 0.14, 0.012, 0xb8bcc2, [0.3, 0.8, 0]);
  const net = new THREE.Group();
  const seg = 48;
  const ng = new THREE.PlaneGeometry(POST_X * 2 - 2 * POST.r, 1, seg, 1);
  const netMesh = new THREE.Mesh(ng, netMaterial());
  netMesh.renderOrder = 1;
  net.add(netMesh);
  // the white headband (follows the sag), the centre strap, the bands down the sides at the posts; the cable's ends
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.5 });
  const tape = new THREE.Mesh(new THREE.BufferGeometry(), tapeMat);
  tape.castShadow = true;
  net.add(tape);
  // the singles sticks (shown in singles: they hold the net up at 1.07 m, 0.914 m outside the singles sidelines)
  const sticks = new THREE.Mesh(
    mergeGeometries([-1, 1].map((sx) => new THREE.BoxGeometry(POST.stick, NET_S + 0.01, POST.stick).translate(sx * STICK_X, (NET_S + 0.01) / 2, 0.025))),
    new THREE.MeshStandardMaterial({ color: 0x1d3a2c, roughness: 0.5 }),
  );
  sticks.castShadow = true;
  net.add(sticks);
  const shapeNet = (singles: boolean) => {
    const pos = ng.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      // (the bottom edge on the ground: a tennis net hangs to the court)
      pos.setY(i, pos.getY(i) > 0 ? netTop(x, singles) - 0.03 : 0.01);
    }
    pos.needsUpdate = true;
    ng.computeVertexNormals();
    ng.computeBoundingSphere();
    const pts: THREE.Vector3[] = [];
    const end = POST_X - POST.r;
    for (let i = 0; i <= seg; i++) {
      const x = -end + (i / seg) * end * 2;
      pts.push(new THREE.Vector3(x, netTop(x, singles) - 0.026, 0));
    }
    // (the band is 5 cm deep on each face: a flat tube, as the net's tape folds over the cable)
    const band = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.03, 6).scale(1, 1, 0.35);
    const strap = new THREE.BoxGeometry(0.05, NET_C, 0.01).translate(0, NET_C / 2, 0);
    const sides = [-1, 1].map((sx) => new THREE.BoxGeometry(0.05, NET_S, 0.008).translate(sx * (end - 0.03), NET_S / 2, 0));
    tape.geometry.dispose();
    tape.geometry = merged([band, strap, ...sides]);
    sticks.visible = singles;
  };
  g.add(net);
  ao.push({ x: 0, z: 0, len: POST_X * 2, depth: 0.16, ry: 0, side: 1, a: 0.12, off: 0 }, { x: 0, z: 0, len: POST_X * 2, depth: 0.16, ry: 0, side: -1, a: 0.12, off: 0 });

  // ---------- the umpire's high chair by the net post, outside the doubles sideline; the players' chairs beside it ----------
  {
    const x = -(POST_X + 0.95);
    put('umpire_chair', x, 0, 0, Math.PI / 2);
    ao.push({ x, z: 0, len: 1.2, depth: 1.2, ry: 0, side: 0, a: 0.5, off: 0 });
    staff.push({ x: x + 0.02, y: 1.93, z: 0, yaw: Math.PI / 2, v: 0.5, kind: 2 });
    // (facing the court, against the side boards, each side of the chair; the bag at the end away from the net)
    for (const sz of [-1, 1]) {
      const bx = -(BOARDS.x - 0.55);
      const bz = sz * 2.3;
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
    // in the corners at both ends, inside the boards (the near ones show in the TV's reverse angles)
    camera(sx * (W_D / 2 + 2.3), -(BOARDS.z - 0.9), -sx * 0.35, 0);
    camera(sx * (W_D / 2 + 2.5), BOARDS.z - 0.9, Math.PI + sx * 0.45, 0);
  }
  // the side camera on its platform across from the umpire
  props.box(at(BOARDS.x - 0.6, 0.2, 0), 1.0, 0.4, 1.2, 0x23272e, PAINTED);
  camera(BOARDS.x - 0.7, 0, -Math.PI / 2, 0.4);
  ao.push({ x: BOARDS.x - 0.6, z: 0, len: 1.5, depth: 1.7, ry: 0, side: 0, a: 0.5, off: 0 });

  // ---------- photographers in the corners behind the baselines (between the TV camera and the line judge) ----------
  for (const [x, e] of [
    [-6.7, -1],
    [6.7, -1],
    [-6.7, 1],
    [6.7, 1],
  ]) {
    const zz = e * (BOARDS.z - 0.5);
    put('stool', x, 0, zz, e < 0 ? 0 : Math.PI);
    staff.push({ x, y: 0.32, z: zz, yaw: e < 0 ? 0 : Math.PI, v: 0.4, kind: 2, dress: 'crew' });
  }
  // ---------- the line judges: on chairs against the boards, in line with the lines they call (the baselines' and the
  // service lines' judges at the sides, the sidelines' and the centre service line's at the ends). The Blender props
  // have no judge's chair: the stool's model, a plain seat (`stool`), the judge seated on it ----------
  {
    const judge = (x: number, z: number, yaw: number) => {
      put('stool', x, 0, z, yaw);
      staff.push({ x, y: 0.32, z, yaw, v: 0.5, kind: 2, dress: 'official' });
      ao.push({ x, z, len: 0.6, depth: 0.6, ry: 0, side: 0, a: 0.4, off: 0 });
    };
    const sx = BOARDS.x - 0.45;
    // (the side across from the umpire: the baselines' and the service lines'; the umpire's side has the chairs)
    for (const e of [-1, 1]) {
      judge(sx, e * (HL - 0.05), -Math.PI / 2);
      judge(sx, e * SERVICE, -Math.PI / 2);
      // (the ends: the doubles sideline on the umpire's side and the far singles sideline, the centre service line)
      const ez = e * (BOARDS.z - 0.45);
      const face = e > 0 ? Math.PI : 0;
      judge(-(W_D / 2), ez, face);
      judge(W_S / 2, ez, face);
    }
  }
  // ---------- the ball kids: crouched by the net posts, standing at the back corners ----------
  for (const sx of [-1, 1]) {
    staff.push({ x: sx * (POST_X + 0.55), y: 0, z: sx * 0.5, yaw: (-sx * Math.PI) / 2, v: 0.6, kind: 2, dress: 'kid' });
    for (const e of [-1, 1]) staff.push({ x: sx * 2.4, y: 0, z: e * (BOARDS.z - 0.35), yaw: e > 0 ? Math.PI : 0, v: 0.6, kind: 3, dress: 'kid' });
  }

  // ---------- the foot of the stands' front wall (the boards) ----------
  for (const s of outline(0)) ao.push({ x: s.x, z: s.z, len: s.len + 0.05, depth: 0.9, ry: s.ry, side: 1, a: 0.5, off: 0 });

  // ---------- the meshes ----------
  const grain = surface({ seed: 21, size: tier === 'low' ? 128 : 256, grain: 0.22, blotch: 0.18, rough: [0.8, 1], normal: 2, repeat: 1 }).map;
  const bowlMesh = new THREE.Mesh(solid.geometry(), solidMaterial(grain, 'pb-bowl'));
  bowlMesh.receiveShadow = true;
  g.add(bowlMesh);
  // the furniture: the posts, the winder and the camera platform (`props`) and every piece at its place, the Blender
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
  const propMesh = new THREE.Mesh(furnish(null), solidMaterial(grain, 'pb-bowl'));
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
  g.add(decals(ao));

  const venue: Venue = {
    group: g,
    net,
    board: screen,
    crowd,
    ledTime: em.time,
    envHide: [halo.mesh],
    furnished: false,
    furnishMs: propTiming,
    surface: 'hard',
    singles: true,
    setCourt(kind, singles) {
      const changed = kind !== venue.surface;
      if (changed || !shaped) {
        const old = venue.surface;
        const d = detailOf(kind);
        floorMat.map = paintOf(kind);
        floorMat.roughnessMap = d.detail;
        floorMat.normalMap = d.normal;
        const F = FLOOR_LOOK[kind];
        floorMat.normalScale.setScalar(F.normal);
        floorMat.roughness = F.rough;
        floorMat.envMapIntensity = F.env;
        const lm = lines.material as THREE.MeshStandardMaterial;
        lm.normalMap = d.normal;
        lm.color.setHex(FLOOR_COLORS[kind].line);
        lm.roughness = F.lineRough;
        lm.normalScale.setScalar(F.lineNormal);
        (logos.mesh.material as THREE.MeshStandardMaterial).normalMap = d.normal;
        // (no names painted on clay or grass: the boards carry them)
        logos.mesh.visible = kind === 'hard';
        venue.surface = kind;
        // (the other surface's maps go: a phone keeps one surface in memory, about 3 MB)
        if (changed) {
          paints.get(old)?.dispose();
          paints.delete(old);
          const od = details.get(old);
          od?.detail.dispose();
          od?.normal.dispose();
          details.delete(old);
        }
      }
      if (singles !== venue.singles || !shaped) {
        shapeNet(singles);
        venue.singles = singles;
      }
      shaped = true;
      return changed;
    },
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
  let shaped = false;
  venue.setCourt('hard', true);
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

/**
 * How each surface takes the light: the base roughness (times the grain's), how deep the grain's relief, how much of
 * the environment it reflects; the lines' roughness and relief (painted on acrylic and grass, tapes on clay).
 *  · hard: acrylic with sand in it, a soft sheen under the floodlights (the far half picks them up);
 *  · clay: matte crushed brick, deep grain;
 *  · grass: matte blades, a little sheen along the mown stripes (the paint has them).
 */
const FLOOR_LOOK: Record<CourtSurface, { rough: number; normal: number; env: number; lineRough: number; lineNormal: number }> = {
  hard: { rough: 0.95, normal: 0.35, env: 1.0, lineRough: 0.55, lineNormal: 0.15 },
  clay: { rough: 1.0, normal: 0.75, env: 0.7, lineRough: 0.75, lineNormal: 0.35 },
  grass: { rough: 1.0, normal: 0.6, env: 0.8, lineRough: 0.8, lineNormal: 0.3 },
};

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

/** The floor inside the boards as one quad: uv over the whole surface (the paint), uv1 in grain tiles (world metres / TILE). */
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
 * The court's floor: its colour (wear in alpha) times the surface's grain (R), the roughness from the grain (G, a
 * touch smoother where it is worn), and the grain's normal map. The surface's own measures (FLOOR_LOOK) are set by
 * Venue.setCourt; swapping the maps needs no new shader.
 */
function courtMaterial(paint: THREE.Texture, detail: THREE.Texture, normal: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: paint, roughnessMap: detail, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.95, metalness: 0 });
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
  m.customProgramCacheKey = () => 'pb-floor';
  return m;
}

/**
 * The net's mesh, worked out per pixel (no texture): cords 3 mm thick every 4 cm, filtered by how much of the mesh a
 * pixel covers. Close up the cords are crisp; further away, where a cell is a pixel or less, the net fades to its
 * average darkness instead of breaking into moiré or dots (what an alpha-tested texture does).
 */
function netMaterial(): THREE.MeshLambertMaterial {
  // (matte: a glossy material picks up a grey sheen at a glancing angle and the net turns into a pale veil)
  const m = new THREE.MeshLambertMaterial({ color: 0x0c0d10, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vNet;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvNet = position.xy / 0.04;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vNet;')
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
        {
          vec2 fw = max(fwidth(vNet), vec2(1e-4));
          vec2 d = abs(fract(vNet + 0.5) - 0.5);
          const float cw = 0.08; // cord width in cells
          vec2 cov = clamp((0.5 * cw + 0.5 * fw - d) / fw, 0.0, 1.0);
          cov = min(cov, vec2(cw) / fw);
          // a cell a pixel or smaller: the mesh as a whole, a dark veil a little denser than the cords alone
          vec2 far = smoothstep(vec2(0.3), vec2(1.0), fw);
          cov = mix(cov, vec2(0.18), far);
          diffuseColor.a *= 1.0 - (1.0 - cov.x) * (1.0 - cov.y);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'pb-net';
  return m;
}

/**
 * The lines, one mesh: each line is a quad a little wider than the line, and the edge is drawn by the pixel's own
 * footprint (analytic anti-aliasing), so a 5 cm line stays clean at the far baseline with or without MSAA. ITF: the
 * measures are to the outside of the lines (the lines are in the court); the centre service line is centred on the
 * middle, and so are the centre marks (10 cm into the court from each baseline).
 */
function courtLines(normal: THREE.Texture): THREE.Mesh {
  const lw = LINE_W;
  const hd = W_D / 2;
  const hs = W_S / 2;
  // [width across, depth along, centre x, centre z]
  const lines: [number, number, number, number][] = [];
  for (const e of [-1, 1]) {
    // the baseline (across the doubles court), the service line (between the singles sidelines), the centre mark
    lines.push([W_D, BASE_W, 0, e * (HL - BASE_W / 2)]);
    lines.push([W_S, lw, 0, e * (SERVICE - lw / 2)]);
    lines.push([lw, MARK_L, 0, e * (HL - BASE_W - MARK_L / 2)]);
    // the doubles and singles sidelines, from baseline to baseline
    lines.push([lw, HL * 2, e * (hd - lw / 2), 0]);
    lines.push([lw, HL * 2, e * (hs - lw / 2), 0]);
  }
  // the centre service line, from one service line to the other (under the net)
  lines.push([lw, SERVICE * 2 - 2 * lw, 0, 0]);
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
      P.push(x + cx, 0.004, z + cz);
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
  const mat = new THREE.MeshStandardMaterial({ color: 0xf4f6f2, roughness: 0.55, metalness: 0, normalMap: normal, normalScale: new THREE.Vector2(0.15, 0.15), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
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
 * The tournament's name painted on the run-off behind each baseline (the hard court only), as on a tour court: the near
 * one at the foot of the gameplay frame, the far one behind the far player, both upright for the gameplay camera. One
 * mesh, one small canvas (white, the floor's grain showing through a little).
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
    x.fillStyle = 'rgba(244,246,248,0.8)';
    x.fillText(big, 0, 0);
    x.restore();
    x.font = `700 46px ${HEAD_FONT}`;
    x.fillStyle = 'rgba(226,240,74,0.85)';
    x.fillText('CENTER COURT', 512, 186);
    tex.needsUpdate = true;
  };
  draw();
  const w = 5.4;
  const d = w * (c.height / c.width);
  // (in the back run-off, clear of where the players stand behind the baseline)
  const z = HL + 3.6 + d / 2;
  const P: number[] = [];
  const U: number[] = [];
  const U1: number[] = [];
  const I: number[] = [];
  for (const side of [1, -1]) {
    const k = P.length / 3;
    for (const [cx, cz, u, v] of [
      [-w / 2, -d / 2, 0, 1],
      [w / 2, -d / 2, 1, 1],
      [w / 2, d / 2, 1, 0],
      [-w / 2, d / 2, 0, 0],
    ]) {
      P.push(cx, 0.003, side * z + cz);
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
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, normalMap: normal, normalScale: new THREE.Vector2(0.2, 0.2), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
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
export function drawBoard(b: Venue['board'], left: string, right: string, games: [number, number], points: [string, string], serving: 0 | 1 | null, footer: string, intro = false, sets: [number, number] | null = null) {
  drawScreen(b, left, right, games, points, serving, footer, intro, sets);
}
