// The broadcast view: the centre court of a pro tour's finals at night, AI-made players and the ball, lit by the
// stadium's floodlights (a cold key light with a soft shadow, a rim light from the far end and the stadium itself
// baked into the environment map) with a TV look. Reads the Match every frame; never changes it.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { installLook, vignette } from './look';
import { minFlight, posAt, seg, shotByClearance, type Vec3 } from '../sim/ball';
import { HL, R, SERVICE, W, backSurface, sideSurface } from '../sim/court';
import { LUNGE, SPIN, type Match } from '../sim/match';
import type { MatchEvent, Player, PointReason, ShotKind } from '../sim/types';
import { BALL_DROP, CLIP_NAMES, CharacterView, PADDLE_POSE, loadCharAssets, type CharAssets, type Kit } from './chars';
import { CrowdAnim } from './crowd';
import { Director, type CamPose, type DirCtx } from './director';
import { FxList, Particles } from './particles';
import { HEAD, Recorder, replaySpeed, type RecEvent, type ReplayRun } from './replay';
import { blobTexture, stadiumShadowTexture } from './textures';
import { ballMesh } from './gear';
import { KitPainter } from './outfit';
import { buildVenue, drawBoard, type Venue } from './venue';

export type Tier = 'high' | 'medium' | 'low';

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const BALL_SCALE = 1.6; // a little bigger than life so it reads on a phone (the court is 20 m long)
/**
 * The key light (still called the sun here): the floodlights at the near left of the roof's ring, high up and a
 * little behind the broadcast camera. Both players are seen on their lit side (the near one from behind, the far one
 * from the front) and their shadows fall to the right and away from the camera, a little shorter than a body. The
 * rest of the ring shows as the environment map, a rim light from the far end and three faint shadows more at the
 * feet (the X of shadows of a floodlit court).
 */
const SUN_ELEV = 50;
const SUN_AZ = 326;
/**
 * the rim light: the far end of the ring, a little to the right and lower. It outlines the players and lays the
 * floodlights' soft sheen on the far half of the court (it is nearly opposite the gameplay camera)
 */
const RIM_ELEV = 27;
const RIM_AZ = 166;
/** what the shadow map covers: the cage and the boards round it */
const BOARD_HALF_X = 7.4;
const BOARD_HALF_Z = 12.6;

interface Aim {
  x: number;
  z: number;
  kind: ShotKind;
  ok: boolean;
  from: Vec3 | null;
  clear: number;
  pace?: number;
}

/**
 * The indicators' colours, one meaning each (the HUD uses the same): lime = you / in reach, gold = perfect (only the
 * timing), red = a fault (the return of serve volleyed), grey = out, orange = a ball to attack, pink = a bajada (a ball
 * back off the back glass to hit down). The aim by the kind of shot: soft (chiquita, dejada) cyan, the drives and the
 * volleys yellow, the lob violet, the overheads (remate, bandeja, víbora) orange, the bajada pink; an aim that lands
 * out is grey.
 */
export const HUE = { lime: 0xdcff3c, gold: 0xffd23a, red: 0xff4a3a, out: 0x9aa3ad, white: 0xffffff, attack: 0xff9a3c, bajada: 0xff5cc8 } as const;
const KIND_HUE: Partial<Record<ShotKind, number>> = {
  dink: 0x5af0e8,
  drop: 0x5af0e8,
  drive: 0xffe14a,
  return: 0xffe14a,
  speedup: 0xffe14a,
  auto: 0xffe14a,
  lob: 0xc49aff,
  smash: 0xff9a3c,
  bandeja: 0xff9a3c,
  vibora: 0xff9a3c,
  bajada: HUE.bajada,
};
export function aimHue(kind: ShotKind, ok: boolean): number {
  return ok ? KIND_HUE[kind] ?? HUE.white : HUE.out;
}
export const cssHue = (h: number) => `#${h.toString(16).padStart(6, '0')}`;

/**
 * The image per quality tier. The grade lives in the tone curve (look.ts), so low and medium draw straight to the
 * screen with the canvas' own MSAA (no render target, no full-screen pass); high adds an MSAA HDR target for a soft
 * bloom. `px`: the cap on the device pixel ratio.
 */
const TIER_PX: Record<Tier, number> = { high: 2, medium: 1.75, low: 1 };
/** exposure for the AgX curve: the court lit like a broadcast, the stands falling away into the night */
const EXPOSURE = 0.66;
installLook();

/** gravity (m/s²) for the serve's drop and bounce, drawn by the view */
const G = 9.81;
/** a broadcast camera's shutter: a fast ball draws a streak this long in time */
const SHUTTER = 1 / 40;
/**
 * How hard a shot was meant (the hit's power, 0…1; 0.5 a plain one) shows from the contact on (it is only known at the
 * release): the paddle's flash (`size` m across, `alpha`, `life` s, from a placed shot to the hardest), and until the
 * next hit the ball's streak `smear` × (power − 0.5) longer and brighter, its trail from `from` × (power − 0.5) m/s
 * less, `trail` × (power − 0.5) brighter and lingering `linger` × (power − 0.5) longer.
 */
const POWER_FX = { size: [0.14, 0.5], alpha: [0.3, 0.85], life: [0.07, 0.16], smear: 0.7, from: 4, trail: 0.9, linger: 0.6 };
/** the ball is never drawn smaller than this (CSS px across) */
const BALL_MIN_PX = 6.5;
const UP = new THREE.Vector3(0, 1, 0);
/**
 * The streak of a fast ball: a capsule along its path, bright at the ball and fading towards the tail. Unlit (it is
 * the camera's exposure, not an object), in the ball's colour at the brightness the sun gives the ball.
 */
function ballSmear(): THREE.Mesh {
  const r = R * BALL_SCALE * 0.92;
  const g = new THREE.CapsuleGeometry(r, 1, 3, 10);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const k = Math.min(1, Math.max(0, (p.getY(i) + 0.5 + r) / (1 + 2 * r)));
    col.push(1, 1, 1, 0.62 * Math.pow(k, 1.5));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdcff3c).multiplyScalar(1.6), vertexColors: true, transparent: true, depthWrite: false }));
  m.visible = false;
  m.renderOrder = 5;
  m.frustumCulled = false;
  return m;
}

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 1, 0.3, 600);
  private sun = new THREE.DirectionalLight(0xeef3ff, 3.1);
  private rim = new THREE.DirectionalLight(0xdbe5ff, 1.15);
  tier: Tier = 'high';
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private cssW = 1;
  private cssH = 1;
  private pxScale = 400;
  private bufH = 800;
  private match: Match | null = null;
  private venue: Venue;
  private chars: CharacterView[] = [];
  private assets: CharAssets | null = null;
  private kits: Kit[] = [];
  private ball: THREE.Mesh;
  /** motion blur of a fast ball (a streak along its path over the shutter time) */
  private smear: THREE.Mesh;
  private smearDir = new THREE.Vector3();
  private ballShadow: THREE.Mesh;
  private feetShadows: THREE.Mesh[] = [];
  /** the feet's shadows: the contact blob and the floodlights' X (ring), the low tier's with the key light's own too */
  private ringGeo: THREE.BufferGeometry;
  private ringMat: THREE.Material;
  private ringLowMat: THREE.Material;
  private landRing: THREE.Mesh;
  private footRing: THREE.Mesh;
  private aimRing: THREE.Mesh;
  private aimLine: THREE.Line;
  private aimPts = new Float32Array(48 * 3);
  private serveBox: THREE.Mesh;
  private netWobble = 0;
  private particles: Particles;
  private fx = new FxList(400);
  private trail: { x: number; y: number; z: number; a: number }[] = [];
  aim: Aim | null = null;
  shake = 0;
  private camX = 0;
  private camLook = new THREE.Vector3(0, 0, -1);
  private tmp = new THREE.Vector3();
  private bp: Vec3 = { x: 0, y: 0, z: 0 };
  private bv: Vec3 = { x: 0, y: 0, z: 0 };
  private spinAxis = new THREE.Vector3();
  private spinQ = new THREE.Quaternion();
  private pull = new THREE.Vector3();
  /** the serve: where the ball left the free hand, and whether it has bounced yet */
  private drop: { at: number; x: number; y: number; z: number; bounced: boolean } | null = null;
  private targetRing: THREE.Mesh;
  private targetDot: THREE.Mesh;
  viewSide: 1 | -1 = 1;
  orbit = false;
  private orbitT = 0;
  /**
   * camera: distance behind the net, height, the point it looks at (m from the net, towards the camera) and the field
   * of view (portrait p*, landscape l*). High over the near end's stands, behind the near back wall (it fades: see
   * cage.ts): the whole court from glass to glass in the frame, the far players as big as they can be. Portrait: the
   * far back wall's mesh under the top of the frame, a player against the side wall at the near end inside its edge.
   */
  cam = { pd: 23, ph: 13, pl: 0.25, pf: 46, ld: 22.75, lh: 11, ll: 0, lf: 34 };
  /** does this player swing at the coming ball? (the human only when pressing) */
  swingGate: (p: Player) => boolean = () => true;
  /** the human's swing leaves balls going out alone (assisted swing, not holding the aim) */
  leavesOut = true;
  /** draw the suggested spot for the human (off in the attract mode) */
  showTarget = true;
  /** Settings → indicators: only what is needed to play (no bounce mark; the serve box only while aiming) */
  minimal = false;
  /**
   * What the coming ball asks for (main.ts; brain.ts, ballCue): 'attack' turns the circle and the ring at the feet
   * orange, 'bajada' (a ball back off the back glass to hit down) pink; 'block' leaves them (the timing ring says it).
   */
  cue: 'attack' | 'block' | 'bajada' | null = null;
  /** the old switch for the attack cue (cue = 'attack' or nothing) */
  get attackCue(): boolean {
    return this.cue === 'attack';
  }
  set attackCue(v: boolean) {
    if (v) this.cue = 'attack';
    else if (this.cue === 'attack') this.cue = null;
  }
  private boardKey = '';
  /** TV direction: the shots the camera takes in the dead time */
  readonly director = new Director();
  /** the stands react to the play */
  readonly crowd: CrowdAnim;
  /** the last seconds of the live match, as drawn (for the replays), and the replay being shown */
  recorder: Recorder | null = null;
  replay: ReplayRun | null = null;
  private loc = { a: 0, b: 0, k: 0 };
  private replayPrev = { x: 0, y: 0, z: 0, t: -1 };
  private gameFov = 40;
  private game: CamPose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
  private camOut: CamPose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
  private ctx: DirCtx = { aspect: 1, game: this.game, side: 1, players: [], ball: null };
  private ballV = new THREE.Vector3();
  /**
   * sounds the view hears: a replayed hit or bounce, a ball bouncing that the sim does not report (the dead ball
   * bouncing away, the serve's bounce before the contact), sneakers on a hard stop
   */
  onReplayEvent: ((e: RecEvent) => void) | null = null;
  onDeadBounce: ((speed: number, x: number, z: number) => void) | null = null;
  onSqueak: ((pid: number, strength: number, x: number, z: number) => void) | null = null;
  private feet: { vx: number; vz: number; x: number; z: number; brake: number; cool: number }[] = [];
  private deadVy = 0;
  /** the ball as drawn last frame (the walls' impacts are read from it: see watchWalls) */
  private wallPrev = { x: 0, y: 0, z: 0, vx: 0, vz: 0, ok: false };

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.CustomToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // the night's haze: the far stands sink a little into it
    this.scene.fog = new THREE.Fog(0x10161f, 45, 230);
    vignette(canvas, 0.24);

    const phi = THREE.MathUtils.degToRad(90 - SUN_ELEV);
    const theta = THREE.MathUtils.degToRad(SUN_AZ);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    this.sun.position.copy(sunDir).multiplyScalar(40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    // the shadow map covers just what casts and catches the shadows that matter (the playing area inside the boards,
    // a player's height up), fitted in the light's own view: every texel lands on the court
    const sc = this.sun.shadow.camera;
    this.sun.updateMatrixWorld();
    this.sun.target.updateMatrixWorld();
    sc.position.copy(this.sun.position);
    sc.lookAt(this.sun.target.position);
    sc.updateMatrixWorld();
    const inv = sc.matrixWorldInverse;
    const bb = new THREE.Box3();
    for (const x of [-BOARD_HALF_X, BOARD_HALF_X]) for (const y of [0, 4.1]) for (const z of [-BOARD_HALF_Z, BOARD_HALF_Z]) bb.expandByPoint(this.tmp.set(x, y, z).applyMatrix4(inv));
    sc.left = bb.min.x - 0.3;
    sc.right = bb.max.x + 0.3;
    sc.bottom = bb.min.y - 0.3;
    sc.top = bb.max.y + 0.3;
    sc.near = 5;
    sc.far = 90;
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.025;
    // floodlights are big lamps: a soft penumbra, and the rest of the ring fills the shadow in a little
    this.sun.shadow.radius = 2.4;
    this.sun.shadow.intensity = 0.84;
    this.rim.position.setFromSphericalCoords(40, THREE.MathUtils.degToRad(90 - RIM_ELEV), THREE.MathUtils.degToRad(RIM_AZ));
    this.scene.add(this.sun, this.sun.target, this.rim);

    this.venue = buildVenue('high');
    this.scene.add(this.venue.group);
    this.crowd = new CrowdAnim(this.venue);

    // the ball (a touch of its own glow: neon plastic stays bright in the shade), its motion blur and its contact shadow
    this.ball = ballMesh(R * BALL_SCALE);
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.smear = ballSmear();
    this.scene.add(this.smear);
    const blob = blobTexture();
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: 0.7 }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.renderOrder = 2;
    this.scene.add(this.ballShadow);
    // under each player a soft contact blob; on the low tier (no shadow map) the same quad also carries the body's
    // shadow cast along the ground away from the key light; on every tier it has the faint shadows of the rest of the
    // floodlights (the X of shadows of a floodlit court), so the players stand on the court instead of floating
    this.ringGeo = new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ map: stadiumShadowTexture(SUN_AZ, false), transparent: true, depthWrite: false });
    this.ringLowMat = new THREE.MeshBasicMaterial({ map: stadiumShadowTexture(SUN_AZ, true), transparent: true, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(this.ringGeo, this.ringMat);
      s.renderOrder = 2;
      s.visible = false;
      this.scene.add(s);
      this.feetShadows.push(s);
    }
    const ring = (r0: number, r1: number, color: number, opacity: number, segs = 48) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, segs), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    // thin, flat on the court and never stacked: the bounce of the coming ball, the reach state at the feet, the
    // suggested spot (hidden once you are there: the ring at the feet says it), the aim's landing
    this.landRing = ring(0.085, 0.11, 0xffffff, 0.45, 32);
    this.footRing = ring(0.36, 0.395, 0xffffff, 0.8);
    this.targetRing = ring(0.19, 0.235, 0xffffff, 0.75);
    this.targetDot = ring(0, 0.05, 0xffffff, 0.6, 16);
    this.aimRing = ring(0.15, 0.19, 0xffffff, 0.9);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.aimPts, 3));
    this.aimLine = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.14, gapSize: 0.16, transparent: true, opacity: 0.5, depthWrite: false }));
    this.aimLine.frustumCulled = false;
    this.aimLine.visible = false;
    this.aimLine.renderOrder = 4;
    this.scene.add(this.aimLine);
    const plane = (w: number, d: number, color: number, op: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    // the receiver's diagonal service box: from the net to the service line, the centre line to the side wall
    this.serveBox = plane(W / 2, SERVICE, HUE.lime, 0.12);
    this.particles = new Particles(500);
    this.scene.add(this.particles.points);
    this.resize();
    this.bakeEnv();
  }

  private envRT: THREE.WebGLRenderTarget | null = null;
  /**
   * The environment map: the stadium itself (the bowl, the crowd once baked, the floodlights, the court, the night
   * sky) rendered round a point over the court into a PMREM, once at start-up and again when the crowd is in. It
   * lights every PBR material (the fill from the stands and the court's bounce) and gives the reflections (the sheen
   * of the floodlights on the court, the steel).
   */
  private bakeEnv() {
    const hidden: THREE.Object3D[] = [];
    for (const o of [...this.scene.children, ...this.venue.envHide]) {
      if ((o as THREE.Light).isLight || o === this.venue.group || !o.visible) continue;
      o.visible = false;
      hidden.push(o);
    }
    const pm = new THREE.PMREMGenerator(this.renderer);
    const prev = this.envRT;
    // (the shadow map does not depend on the camera: drawn once, not for each of the six faces)
    const sm = this.renderer.shadowMap;
    const auto = sm.autoUpdate;
    sm.autoUpdate = false;
    sm.needsUpdate = true;
    this.envRT = pm.fromScene(this.scene, 0.02, 0.1, 1000, { size: 128, position: new THREE.Vector3(0, 1.4, 0) });
    sm.autoUpdate = auto;
    pm.dispose();
    for (const o of hidden) o.visible = true;
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.62;
    prev?.dispose();
  }

  /** Loads the AI-made players and their animations. */
  async load(base: string) {
    this.assets = await loadCharAssets(base, 'hero', CLIP_NAMES);
    // the players' kits are painted on the GPU (outfit.ts); without it they are recoloured on the CPU
    try {
      this.assets.painter = new KitPainter(this.renderer, this.assets.rest ? new THREE.Mesh(this.assets.rest) : this.assets.template, this.assets.image);
    } catch (err) {
      console.warn('kit painter unavailable:', err);
    }
    // the spectators are the same people: the model posed and rendered into the crowd's atlas (and the stands'
    // reflections then have them too)
    this.bakeCrowd(this.tier === 'low' ? 0.5 : 1);
    this.bakeEnv();
  }
  private crowdScale = 0;
  private bakeCrowd(scale: number) {
    if (!this.assets) return;
    try {
      this.crowd.bake(this.renderer, this.assets, scale);
      this.crowdScale = scale;
    } catch (err) {
      console.warn('crowd bake failed:', err);
    }
  }

  // ------------------------------------------------------------------ match
  setMatch(m: Match, kits: Kit[], record = false) {
    for (const c of this.chars) c.dispose();
    this.chars = [];
    this.match = m;
    this.stopReplay();
    this.recorder = null;
    this.director.reset();
    this.feet = m.players.map((p) => ({ vx: 0, vz: 0, x: p.x, z: p.z, brake: 0, cool: 0 }));
    this.kits = kits;
    if (this.assets) {
      m.players.forEach((p, i) => {
        const kit = kits[i] ?? kits[0];
        const cv = new CharacterView(this.assets!, kit, kit.body?.height);
        cv.setPaddlePose(this.paddlePose[0], this.paddlePose[1], this.paddlePose[2], this.paddlePose[3], this.paddlePose[4], this.paddlePose[5]);
        this.scene.add(cv.root);
        this.chars.push(cv);
        void p;
      });
      if (record && this.chars.length) this.recorder = new Recorder(this.chars.length, this.chars[0].poseSize);
    }
    this.trail.length = 0;
    this.fx.clear();
    this.boardKey = '';
  }
  /** rx, ry, rz, ox, oy, oz of the paddle in the right hand (bone space) */
  paddlePose = [...PADDLE_POSE];
  applyPaddlePose() {
    for (const c of this.chars) c.setPaddlePose(this.paddlePose[0], this.paddlePose[1], this.paddlePose[2], this.paddlePose[3], this.paddlePose[4], this.paddlePose[5]);
  }

  setTier(t: Tier) {
    this.tier = t;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, TIER_PX[t]));
    const sh = t !== 'low';
    this.venue.setTier(t);
    // (dropping to low: the crowd's atlas again at half the size, a quarter of the memory)
    if (t === 'low' && this.assets && this.crowdScale > 0.5) this.bakeCrowd(0.5);
    // (low: no shadow map, so the sun lights everything: a touch less exposure)
    this.renderer.toneMappingExposure = t === 'low' ? EXPOSURE * 0.93 : EXPOSURE;
    this.renderer.shadowMap.enabled = sh;
    this.sun.castShadow = sh;
    // (low: no rim light either, one light less in every shader)
    this.rim.visible = sh;
    // the X of shadows at the feet: the key light's own from the shadow map and three faint ones drawn, or (low) all
    // four drawn
    for (const f of this.feetShadows) f.material = sh ? this.ringMat : this.ringLowMat;
    this.sun.shadow.mapSize.set(t === 'high' ? 2048 : 1024, t === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.scene.traverse((o) => {
      const mm = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mm)) mm.forEach((x) => (x.needsUpdate = true));
      else if (mm) mm.needsUpdate = true;
    });
    this.buildComposer();
    this.resize();
  }

  private buildComposer() {
    if (this.composer) {
      for (const p of this.composer.passes) p.dispose();
      this.composer.dispose();
    }
    this.composer = null;
    this.bloom = null;
    // low and medium: straight to the screen (canvas MSAA, the grade in the tone curve)
    if (this.tier !== 'high') return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.14, 0.4, 1.5);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.composer = c;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.cssW = w;
    this.cssH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.gameFov = w / h < 0.8 ? this.cam.pf : w / h < 1.2 ? (this.cam.pf + this.cam.lf) / 2 : this.cam.lf;
    this.camera.fov = this.gameFov;
    this.camera.updateProjectionMatrix();
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.bufH = buf.y;
    this.pxScale = (buf.y * 0.5) / Math.tan((this.camera.fov * Math.PI) / 360);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  refreshBanner() {
    this.boardKey = '';
    this.venue.redrawBoards();
  }

  // ------------------------------------------------------------------ effects from match events
  hitFx(x: number, y: number, z: number, perfect: boolean, power: number, replay = false) {
    // (how hard the player meant it, from the hit event: see onHit; 0.5 a plain shot or one not known)
    const sh = this.shotFx;
    const hard = sh && Math.abs(sh.x - x) + Math.abs(sh.y - y) + Math.abs(sh.z - z) < 1e-3 ? sh.power : 0.5;
    const n = Math.round((perfect ? 18 : 6) * (0.7 + 0.6 * hard));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (1.2 + Math.random() * 2.5) * (0.6 + power) * (0.75 + 0.5 * hard);
      this.fx.add({ x, y, z, vx: Math.cos(a) * s, vy: Math.random() * 2.5, vz: Math.sin(a) * s, life: 0.2 + Math.random() * 0.2, s0: 0.08, s1: 0.01, r: 1, g: perfect ? 0.88 : 1, b: perfect ? 0.45 : 1, a: 0.9, grav: 4, drag: 4 });
    }
    // the paddle's flash: big and bright for a hard shot, a soft glow for a placed one (POWER_FX)
    const F = POWER_FX;
    this.fx.add({ x, y, z, vx: 0, vy: 0, vz: 0, life: F.life[0] + (F.life[1] - F.life[0]) * hard, s0: F.size[0] + (F.size[1] - F.size[0]) * hard, s1: 0.04, r: 1, g: 0.97, b: perfect ? 0.6 : 0.85, a: F.alpha[0] + (F.alpha[1] - F.alpha[0]) * hard, grav: 0, drag: 0 });
    if (power > 0.8 && !REDUCED && !replay) this.shake = Math.max(this.shake, 0.18 * power * (0.8 + 0.4 * hard));
  }
  bounceFx(x: number, z: number, good: boolean) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.add({ x, y: 0.03, z, vx: Math.cos(a) * 0.6, vy: 0.3 + Math.random() * 0.3, vz: Math.sin(a) * 0.6, life: 0.45, s0: 0.08, s1: 0.24, r: good ? 0.85 : 1, g: good ? 0.88 : 0.5, b: good ? 0.9 : 0.45, a: 0.22, grav: 0, drag: 3 });
    }
  }
  netFx() {
    this.netWobble = 1;
  }
  /** A ball met a wall: the glass flashes and keeps a fading mark, the mesh shakes, a puff of dust off the glass. */
  wallFx(x: number, y: number, z: number, surface: 'glass' | 'mesh', speed: number) {
    this.venue.cage.impact(x, y, z, surface, speed);
    if (surface !== 'glass' || speed < 6) return;
    // (a few grains of the infill the ball carried, off the glass towards the court)
    const nx = Math.abs(x) > W / 2 - 0.3 ? -Math.sign(x) : 0;
    const nz = nx ? 0 : -Math.sign(z);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.add({ x, y, z, vx: nx * 1.2 + Math.cos(a) * 0.5, vy: Math.sin(a) * 0.5, vz: nz * 1.2 + Math.cos(a + 1) * 0.5, life: 0.35, s0: 0.05, s1: 0.16, r: 0.9, g: 0.95, b: 1, a: 0.18, grav: 0, drag: 4 });
    }
  }
  /**
   * The walls' impacts, read from the ball as drawn (live, dead or replayed: one rule for all): next to a wall, and
   * its speed into that wall turned round since the last frame.
   */
  private watchWalls(dt: number) {
    const w = this.wallPrev;
    if (!this.ball.visible || dt <= 0) {
      w.ok = false;
      return;
    }
    const b = this.ball.position;
    if (w.ok) {
      const vx = (b.x - w.x) / dt;
      const vz = (b.z - w.z) / dt;
      const near = 0.45;
      const sp = Math.hypot(w.vx, w.vz);
      if (Math.abs(b.x) > W / 2 - near && Math.sign(w.vx) === Math.sign(b.x) && Math.sign(vx) !== Math.sign(w.vx) && Math.abs(w.vx) > 1) {
        const s = sideSurface(Math.abs(b.z), b.y);
        if (s !== 'open') this.wallFx(Math.sign(b.x) * W / 2, b.y, b.z, s, sp);
      } else if (Math.abs(b.z) > HL - near && Math.sign(w.vz) === Math.sign(b.z) && Math.sign(vz) !== Math.sign(w.vz) && Math.abs(w.vz) > 1) {
        const s = backSurface(b.y);
        if (s !== 'open') this.wallFx(b.x, b.y, Math.sign(b.z) * HL, s, sp);
      }
      w.vx = vx;
      w.vz = vz;
    } else w.vx = w.vz = 0;
    w.x = b.x;
    w.y = b.y;
    w.z = b.z;
    w.ok = true;
  }
  /**
   * The ball left a paddle: the character keeps the contact point for the follow-through, and what the shot was (its
   * kind, power and special) from the hit event (`e`, or else the match's own latest hit of that player: main.ts calls
   * this while it goes through the match's events). How hard it was shows in the paddle's flash (hitFx) and the
   * ball's trail until the next hit (POWER_FX).
   */
  onHit(pid: number, x: number, y: number, z: number, t: number, hand: 1 | -1, e?: Extract<MatchEvent, { type: 'hit' }>) {
    if (!e && this.match) {
      const ev = this.match.events;
      for (let i = ev.length - 1; i >= 0; i--) {
        const h = ev[i];
        if (h.type === 'hit' && h.pid === pid && Math.abs(h.x - x) + Math.abs(h.y - y) + Math.abs(h.z - z) < 1e-6) {
          e = h;
          break;
        }
      }
    }
    // (a remate looking for the walls is hit hard, whatever the gesture said)
    const power = Math.max(e?.power ?? 0.5, e?.special === 'por3' ? 0.9 : e?.special === 'por4' ? 0.75 : 0);
    this.chars[pid]?.onHit(x, y, z, t, hand, e ? { kind: e.kind, power: e.power, special: e.special } : undefined);
    this.shotFx = { x, y, z, power };
  }
  /** the last hit and how hard it was (0…1), for the flash and the trail */
  private shotFx: { x: number; y: number; z: number; power: number } | null = null;
  cheer(pid: number) {
    if (this.match) this.chars[pid]?.react('cheer', this.match.t);
  }
  /**
   * A point is over: the winners cheer a good point (a winner after a rally, a long rally) and whoever lost it on an
   * error or after a long rally hangs their head (not every time, so it does not get old). End of the match: always.
   */
  onPoint(m: Match, e: { winner: 0 | 1; reason: PointReason; fault: number | null; rally: number }): { pid: number; kind: 'cheer' | 'lost' }[] {
    const end = m.phase === 'over';
    const long = e.rally >= 8;
    const out: { pid: number; kind: 'cheer' | 'lost' }[] = [];
    for (const p of m.players) {
      const c = this.chars[p.id];
      if (!c) continue;
      if (p.team === e.winner) {
        if (end || ((e.reason === 'winner' || e.reason === 'miss' || e.reason === 'letGo') && e.rally >= 3) || (long && Math.random() < 0.5)) {
          c.react('cheer', m.t);
          out.push({ pid: p.id, kind: 'cheer' });
        }
      } else if (end || (e.fault === p.id && Math.random() < 0.6) || (long && Math.random() < 0.7)) {
        c.react('lost', m.t);
        out.push({ pid: p.id, kind: 'lost' });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ replays
  /** A hit, bounce or net touch of the live match, kept for the replays. */
  record(e: Omit<RecEvent, 't'>, t: number) {
    this.recorder?.event({ ...e, t });
  }
  /** Shows the recorded window t0 … t1 in slow motion from a TV angle (the match is held meanwhile). */
  startReplay(r: ReplayRun): boolean {
    const rec = this.recorder;
    if (!rec || rec.count < 2) return false;
    r.t0 = Math.max(rec.first, r.t0);
    r.t1 = Math.min(rec.last, r.t1);
    r.cur = r.t0;
    r.done = r.t1 <= r.t0;
    r.ev = rec.events.findIndex((e) => e.t >= r.t0);
    if (r.ev < 0) r.ev = rec.events.length;
    this.replay = r;
    this.replayPrev.t = -1;
    this.trail.length = 0;
    // the TV angles are closer than the gameplay camera: the ball nearer its real size
    this.ball.scale.setScalar(0.75);
    this.drawRecorded(0);
    this.fillCtx();
    this.director.replay(this.ctx, r.angle, r.hitter);
    return true;
  }
  stopReplay() {
    if (!this.replay) return;
    this.replay = null;
    this.trail.length = 0;
    this.ball.scale.setScalar(1);
    this.boardKey = '';
  }

  /** Puts the recorded frame at the replay's time on screen (dt: screen time, the replay runs slower). */
  private drawRecorded(dt: number) {
    const r = this.replay!;
    const rec = this.recorder!;
    const sp = replaySpeed(r, r.cur);
    if (dt > 0 && !r.done) {
      r.cur = Math.min(r.t1, r.cur + dt * sp);
      if (r.cur >= r.t1 - 1e-6) r.done = true;
    }
    const { a, b, k } = rec.locate(r.cur, this.loc);
    const D = rec.data;
    const l = (i: number) => D[a + i] + (D[b + i] - D[a + i]) * k;
    const shown = (k < 0.5 ? D[a + 7] : D[b + 7]) > 0.5;
    this.ball.visible = this.ballShadow.visible = shown;
    if (shown) {
      this.ball.position.set(l(0), l(1), l(2));
      THREE.Quaternion.slerpFlat(this.qf, 0, D as unknown as number[], a + 3, D as unknown as number[], b + 3, k);
      this.ball.quaternion.set(this.qf[0], this.qf[1], this.qf[2], this.qf[3]);
      const h = Math.max(0, this.ball.position.y);
      this.ballShadow.position.set(this.ball.position.x, 0.012, this.ball.position.z);
      this.ballShadow.scale.setScalar(1 + h * 0.5);
      (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.75 - h * 0.18);
    }
    this.venue.net.position.z = l(8);
    const ps = rec.poseSize;
    this.chars.forEach((c, i) => {
      const o = HEAD + i * ps;
      c.applyPose(D, a + o, D, b + o, k);
      const s = this.feetShadows[i];
      s.visible = true;
      s.position.set(c.root.position.x, 0.011, c.root.position.z);
    });
    // the trail of a fast ball, from the replayed positions
    const pv = this.replayPrev;
    const st = dt * sp;
    for (const tr of this.trail) tr.a -= st * 3.5;
    while (this.trail.length && this.trail[0].a <= 0) this.trail.shift();
    this.smear.visible = false;
    if (shown && pv.t >= 0 && r.cur - pv.t > 1e-4) {
      const k = 1 / (r.cur - pv.t);
      const vx = (this.ball.position.x - pv.x) * k;
      const vy = (this.ball.position.y - pv.y) * k;
      const vz = (this.ball.position.z - pv.z) * k;
      const v = Math.hypot(vx, vy, vz);
      if (v > 11 && v < 40) this.trail.push({ x: this.ball.position.x, y: this.ball.position.y, z: this.ball.position.z, a: Math.min(1, (v - 11) / 8) });
      // in slow motion the shutter sees the ball move slower: a shorter streak
      if (v < 40) this.placeSmear(vx * sp, vy * sp, vz * sp, 0.75);
    }
    pv.x = this.ball.position.x;
    pv.y = this.ball.position.y;
    pv.z = this.ball.position.z;
    pv.t = r.cur;
    // sparks and sounds of the replayed hits and bounces
    const ev = rec.events;
    while (r.ev < ev.length && ev[r.ev].t <= r.cur) {
      const e = ev[r.ev++];
      if (e.t > r.t1) break;
      if (e.type === 'hit') this.hitFx(e.x, e.y, e.z, e.perfect, Math.min(1, Math.max(0, (e.speed - 6) / 10)), true);
      else if (e.type === 'bounce') this.bounceFx(e.x, e.z, e.good);
      else if (!e.tape) this.netWobble = 1;
      this.onReplayEvent?.(e);
    }
    for (const m of [this.landRing, this.footRing, this.targetRing, this.targetDot, this.aimRing, this.serveBox]) m.visible = false;
    this.aimLine.visible = false;
  }
  private qf = [0, 0, 0, 1];

  /** saves the drawn frame of the live match */
  private recordFrame(m: Match) {
    const rec = this.recorder;
    if (!rec || this.chars.length !== rec.players) return;
    const o = rec.begin(m.t);
    if (o < 0) return;
    const D = rec.data;
    const b = this.ball;
    D[o] = b.position.x;
    D[o + 1] = b.position.y;
    D[o + 2] = b.position.z;
    D[o + 3] = b.quaternion.x;
    D[o + 4] = b.quaternion.y;
    D[o + 5] = b.quaternion.z;
    D[o + 6] = b.quaternion.w;
    D[o + 7] = b.visible ? 1 : 0;
    D[o + 8] = this.venue.net.position.z;
    for (let i = 0; i < this.chars.length; i++) this.chars[i].capturePose(D, o + HEAD + i * rec.poseSize);
  }

  /** sneakers squeak when a player stops hard or turns back (read from how fast the feet lose speed) */
  private listenFeet(m: Match, dt: number) {
    if (!this.onSqueak || dt <= 0) return;
    const ok = m.phase === 'rally' || m.phase === 'dead';
    for (const p of m.players) {
      const f = this.feet[p.id];
      if (!f) continue;
      const jump = Math.hypot(p.x - f.x, p.z - f.z) > 0.5;
      const sp = Math.hypot(f.vx, f.vz);
      let loss = 0;
      if (sp > 0.3 && !jump) {
        const along = (p.vx * f.vx + p.vz * f.vz) / sp;
        loss = Math.max(0, sp - along) / dt;
      }
      const k = 1 - Math.exp(-dt / 0.07);
      f.brake += (loss - f.brake) * k;
      f.cool -= dt;
      if (ok && f.cool <= 0 && f.brake > 15 && sp > 1.6) {
        f.cool = 0.55;
        this.onSqueak(p.id, Math.min(1, (f.brake - 15) / 20 + sp / 8), p.x, p.z);
      }
      f.vx = p.vx;
      f.vz = p.vz;
      f.x = p.x;
      f.z = p.z;
    }
  }

  /** What the director needs to place a shot: the players and the ball as drawn now, and the gameplay camera. */
  dirCtx(): DirCtx {
    this.fillCtx();
    return this.ctx;
  }
  private fillCtx() {
    const c = this.ctx;
    c.aspect = this.camera.aspect;
    c.side = this.viewSide;
    const m = this.match;
    if (!m) {
      c.players.length = 0;
      c.ball = null;
      return;
    }
    while (c.players.length < m.players.length) c.players.push({ x: 0, z: 0, team: 0 });
    c.players.length = m.players.length;
    // (in a replay the bodies are where the recording puts them, not where the held match has them)
    m.players.forEach((p, i) => {
      const ch = this.replay ? this.chars[i] : undefined;
      c.players[i].x = ch ? ch.root.position.x : p.x;
      c.players[i].z = ch ? ch.root.position.z : p.z;
      c.players[i].team = p.team;
    });
    c.ball = this.ball.visible ? this.ballV.copy(this.ball.position) : null;
  }

  // ------------------------------------------------------------------ per frame
  frame(dt: number, time: number) {
    const m = this.match;
    if (m && this.replay && this.recorder) {
      this.drawRecorded(dt);
      this.updateBoard(m);
    } else if (m) {
      const b = m.ballPos(this.bp);
      this.chars.forEach((c, i) => {
        const p = m.players[i];
        c.update(dt, m, p, this.swingGate(p), b);
        const s = this.feetShadows[i];
        s.visible = true;
        // (under the body as drawn: a lunge or a step out of the ball's way moves it off the sim's spot)
        s.position.set(c.root.position.x, 0.011, c.root.position.z);
      });
      this.updateBall(m, dt);
      this.updateMarkers(m, time);
      this.updateBoard(m);
      if (this.recorder && dt > 0) {
        this.recordFrame(m);
        this.listenFeet(m, dt);
      }
    }
    // the stands follow the ball with their heads
    this.crowd.watch(this.ball.visible && m && (m.phase === 'rally' || m.phase === 'dead') ? this.ball.position.x : null, this.ball.position.z);
    // (the TV's shots keep the stands out of focus behind the players: see CrowdAnim.focus)
    const shot = this.director.kind;
    this.crowd.focus(shot === 'play' ? 0 : shot === 'frame' || shot === 'react' || shot === 'victory' ? 1 : 0.6);
    this.crowd.update(dt);
    this.venue.ledTime.value = (this.venue.ledTime.value + dt) % 3600;
    this.venue.cage.update(dt);
    // (a replay runs slower than the screen: the ball's speed on its own clock)
    this.watchWalls(this.replay ? dt * replaySpeed(this.replay, this.replay.cur) : dt);
    this.updateCamera(dt, m);
    if (this.netWobble > 0) {
      this.netWobble = Math.max(0, this.netWobble - dt * 2.2);
      this.venue.net.position.z = Math.sin(time * 40) * this.netWobble * 0.05 * (m?.rally?.last?.side ?? 1);
    }
    this.fx.update(dt);
    this.particles.begin();
    this.fx.draw(this.particles);
    for (const t of this.trail) this.particles.push(t.x, t.y, t.z, 0.06 * t.a + 0.015, 0.9, 1, 0.45, t.a * 0.35);
    this.particles.end(this.pxScale);
    if (!this.skipRender) this.render(dt);
  }
  /** debug captures advance several frames and draw once */
  skipRender = false;
  render(dt = 1 / 60) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  private updateBall(m: Match, dt: number) {
    let b = m.ballPos(this.bp);
    // before the serve the ball sits in the server's free hand; in the wind-up the hand lets it go, it bounces once
    // and is met on its way up below the waist (the padel serve)
    if (!b && m.phase === 'serve') {
      const w = m.windup;
      const h = this.chars[w ? w.pid : m.server().id]?.ballInHand(this.tmp);
      const rel = w ? w.at - BALL_DROP : Infinity;
      if (w && m.t >= rel) {
        let d = this.drop;
        if (!d || d.at !== w.at) d = this.drop = { at: w.at, x: h?.x ?? w.x, y: h ? h.y - 0.02 : w.y + 0.4, z: h?.z ?? w.z, bounced: false };
        const t = m.t - rel;
        const T = BALL_DROP;
        // the fall from the hand to the floor (in t1, a free fall), then the bounce up to the contact (t2 = T − t1)
        // under real gravity: its speed off the floor is what reaches the contact height at the contact
        const t1 = Math.min(T - 0.2, Math.max(0.25, Math.sqrt((2 * Math.max(0.05, d.y - R)) / G)));
        const t2 = T - t1;
        const g1 = (2 * Math.max(0.05, d.y - R)) / (t1 * t1);
        const v2 = (w.y - R + 0.5 * G * t2 * t2) / t2;
        const u = Math.min(1, t / T);
        // (across: from the hand to the contact, a little in front of the server: the bounce on the way)
        const y = t < t1 ? d.y - 0.5 * g1 * t * t : R + v2 * (t - t1) - 0.5 * G * (t - t1) * (t - t1);
        b = { x: d.x + (w.x - d.x) * u, y: Math.max(R, y), z: d.z + (w.z - d.z) * u };
        if (t >= t1 && !d.bounced) {
          d.bounced = true;
          this.onDeadBounce?.(g1 * t1, b.x, b.z);
        }
      } else if (h) {
        b = { x: h.x, y: h.y - 0.02, z: h.z };
        if (w) this.drop = { at: w.at, x: b.x, y: b.y, z: b.z, bounced: false };
      }
    }
    this.ball.visible = !!b;
    this.ballShadow.visible = !!b;
    this.smear.visible = false;
    if (!b) {
      this.trail.length = 0;
      return;
    }
    // never smaller than a few pixels: far down the court the ball grows a little (up to 1.7×) so a phone still shows it
    const dist = Math.max(1, this.camera.position.distanceTo(this.tmp.set(b.x, b.y, b.z)));
    const px = (2 * R * BALL_SCALE * this.pxScale) / dist / Math.max(1, this.renderer.getPixelRatio());
    const grow = Math.min(1.7, Math.max(1, BALL_MIN_PX / px));
    this.ball.scale.setScalar(grow);
    this.ball.position.set(b.x, Math.max(R * BALL_SCALE * grow, b.y), b.z);
    // around a contact the drawn ball sits on the paddle face (the sim keeps the exact point)
    if (m.phase === 'rally' || m.phase === 'dead' || m.windup) {
      for (const c of this.chars) {
        const k = c.paddlePull(m.t, this.pull);
        if (k <= 0) continue;
        const d = this.pull.sub(this.ball.position);
        const len = d.length();
        if (len > 0.45) continue;
        this.ball.position.addScaledVector(d, k * Math.min(1, 0.3 / Math.max(len, 1e-3)));
      }
    }
    // spin you can read: topspin rolls it forward over the top, backspin the other way, about the axis across the flight
    const v = m.ballVel(this.bv);
    const spin = m.ballSpin();
    if (v) {
      const hs = Math.hypot(v.x, v.z);
      if (hs > 0.2) {
        this.spinAxis.set(v.z / hs, 0, -v.x / hs);
        const w = (spin * (5 + Math.hypot(v.x, v.y, v.z) * 0.9) + (m.deadSeg?.roll ? hs / R / BALL_SCALE : 0)) * dt;
        this.spinQ.setFromAxisAngle(this.spinAxis, w);
        this.ball.quaternion.premultiply(this.spinQ);
      }
    }
    // the dead ball bouncing away after the point (the sim tells no one): heard by the view
    if ((m.phase === 'dead' || m.phase === 'over') && v) {
      if (this.deadVy < -0.45 && v.y > -0.05 && b.y < 0.1) this.onDeadBounce?.(-this.deadVy, b.x, b.z);
      this.deadVy = v.y;
    } else this.deadVy = 0;
    const h = Math.max(0, b.y);
    this.ballShadow.position.set(b.x, 0.012, b.z);
    this.ballShadow.scale.setScalar(1 + h * 0.5);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.75 - h * 0.18);
    const fast = v ? Math.hypot(v.x, v.y, v.z) : 0;
    // (the last hit's power: a hard shot leaves a longer, brighter streak and trail from a lower speed, a placed one a
    // fainter one; see POWER_FX)
    const hard = m.phase === 'rally' && this.shotFx ? this.shotFx.power : 0.5;
    const F = POWER_FX;
    if (v && (m.phase === 'rally' || m.phase === 'dead')) this.placeSmear(v.x, v.y, v.z, grow, 1 + F.smear * (hard - 0.5));
    for (const t of this.trail) t.a -= dt * 3.5 * (1 - F.linger * (hard - 0.5));
    while (this.trail.length && this.trail[0].a <= 0) this.trail.shift();
    const from = 11 - F.from * (hard - 0.5);
    if (m.phase === 'rally' && fast > from) this.trail.push({ x: b.x, y: b.y, z: b.z, a: Math.min(1, ((fast - from) / 8) * (1 + F.trail * (hard - 0.5))) });
  }

  /** the streak behind a fast ball: from where it was a shutter's time ago to where it is (`k` longer and brighter) */
  private placeSmear(vx: number, vy: number, vz: number, grow: number, k = 1) {
    const sp = Math.hypot(vx, vy, vz);
    if (sp < 6.5) return;
    const len = sp * SHUTTER * k;
    const s = this.smear;
    s.visible = true;
    this.smearDir.set(vx / sp, vy / sp, vz / sp);
    s.quaternion.setFromUnitVectors(UP, this.smearDir);
    s.scale.set(grow, len, grow);
    s.position.copy(this.ball.position).addScaledVector(this.smearDir, -len / 2);
    (s.material as THREE.MeshBasicMaterial).opacity = Math.min(1, ((sp - 6.5) / 6) * k);
  }

  private updateMarkers(m: Match, time: number) {
    const me = m.players.find((p) => p.human) ?? null;
    const r = m.rally;
    // (a slow breath on the markers that ask you to do something; none with reduced motion)
    const breathe = (speed: number, amp: number) => (REDUCED ? 1 : 1 + amp * Math.sin(time * speed));
    const mat = (o: THREE.Mesh) => o.material as THREE.MeshBasicMaterial;
    for (const o of [this.landRing, this.footRing, this.targetRing, this.targetDot]) o.visible = false;
    const incoming = !!me && !!r && m.phase === 'rally' && !!r.last && r.last.team !== me.team;
    const plan = incoming ? me!.plan : null;
    // (what the coming ball asks for, in its colour: an attack orange, a bajada pink)
    const cueHue = this.cue === 'attack' ? HUE.attack : this.cue === 'bajada' ? HUE.bajada : null;
    // where the coming ball will bounce on the human's side (a small mark; the full indicators only)
    if (incoming && !this.minimal && r!.bounces === 0) {
      const g = posAt(r!.seg, r!.tGround);
      if (g.z * me!.side > 0) {
        this.landRing.visible = true;
        this.landRing.position.set(g.x, 0.015, g.z);
      }
    }
    // the suggested spot: where to go for the coming ball; once you are there (within a lunge) and the ball is in
    // reach, it goes and the ring at your feet says it (one element, never two rings stacked)
    const tg = me && this.showTarget ? m.targetFor(me.id) : null;
    if (me && tg && m.phase === 'rally') {
      const near = Math.hypot(me.x - tg.fx, me.z - tg.fz) <= (m.targetInfo(me.id)?.reach ?? LUNGE);
      if (!(near && plan)) {
        this.targetRing.visible = this.targetDot.visible = true;
        this.targetRing.position.set(tg.fx, 0.017, tg.fz);
        this.targetDot.position.set(tg.fx, 0.017, tg.fz);
        const col = cueHue ?? (near ? HUE.lime : HUE.white);
        mat(this.targetRing).color.setHex(col);
        mat(this.targetDot).color.setHex(col);
        this.targetRing.scale.setScalar(near && !cueHue ? 1 : breathe(7, 0.1));
      }
    }
    // the reach state, at the feet: lime in reach, red a fault (the return of serve taken out of the air), grey a ball
    // going out that the assisted swing leaves alone, orange a ball to attack, pink a bajada (nothing while the ball is
    // out of reach: the spot shows where to go)
    if (incoming && plan) {
      this.footRing.visible = true;
      this.footRing.position.set(me!.x, 0.016, me!.z);
      const leave = !!plan.out && this.leavesOut;
      mat(this.footRing).color.setHex(plan.oops ? HUE.red : leave ? HUE.out : cueHue ?? HUE.lime);
      this.footRing.scale.setScalar(cueHue && !plan.oops && !leave ? breathe(9, 0.06) : 1);
      mat(this.footRing).opacity = leave ? 0.6 : 0.85;
    }
    // the box to serve to (minimal: while aiming the serve)
    const srv = m.phase === 'serve' ? m.server() : null;
    this.serveBox.visible = !!srv && srv.human && (!this.minimal || !!this.aim);
    if (srv && srv.human) {
      const half = -m.serveX(srv.team);
      this.serveBox.position.set((half * W) / 4, 0.012, (-srv.side * SERVICE) / 2);
      mat(this.serveBox).opacity = REDUCED ? 0.13 : 0.11 + 0.03 * Math.sin(time * 4);
    }
    const a = this.aim;
    this.aimRing.visible = !!a;
    this.aimLine.visible = !!a?.from;
    if (a) {
      const col = aimHue(a.kind, a.ok);
      mat(this.aimRing).color.setHex(col);
      (this.aimLine.material as THREE.LineDashedMaterial).color.setHex(col);
      this.aimRing.position.set(a.x, 0.02, a.z);
      this.aimRing.scale.setScalar(breathe(8, 0.05));
      if (a.from) {
        const d = Math.hypot(a.x - a.from.x, a.z - a.from.z);
        const spin = SPIN[a.kind] ?? 0;
        const shot = shotByClearance(a.from, a.x, a.z, a.clear, minFlight(d) * (a.pace ?? 1), spin);
        const sg = seg(0, a.from, shot.v, spin, shot.k, shot.g);
        const n = this.aimPts.length / 3;
        const p = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < n; i++) {
          posAt(sg, (i / (n - 1)) * shot.T, p);
          this.aimPts[i * 3] = p.x;
          this.aimPts[i * 3 + 1] = Math.max(0.02, p.y);
          this.aimPts[i * 3 + 2] = p.z;
        }
        this.aimLine.geometry.attributes.position.needsUpdate = true;
        this.aimLine.computeLineDistances();
      }
    }
  }

  /** names for the video board: [near team, far team] */
  boardNames: [string, string] = ['YOU', 'CPU'];
  boardFooter = 'PRO TOUR FINALS';
  private updateBoard(m: Match) {
    // (while the match is presented the video board shows who plays whom)
    const intro = this.director.kind === 'intro';
    const pts: [string, string] = [m.pointText(0), m.pointText(1)];
    const key = `${m.games[0]}-${m.games[1]}-${pts.join()}-${m.serverTeam}-${this.boardNames.join()}-${this.boardFooter}-${intro}`;
    if (key === this.boardKey) return;
    this.boardKey = key;
    drawBoard(this.venue.board, this.boardNames[0], this.boardNames[1], m.games, pts, m.serverTeam, this.boardFooter, intro);
  }

  /** debug captures: a fixed camera (position and the point it looks at) */
  debugCam: { px: number; py: number; pz: number; lx: number; ly: number; lz: number } | null = null;
  private updateCamera(dt: number, m: Match | null) {
    const portrait = this.camera.aspect < 0.8;
    const side = this.viewSide;
    const dc = this.debugCam;
    if (dc) {
      this.camera.position.set(dc.px, dc.py, dc.pz);
      this.camera.lookAt(dc.lx, dc.ly, dc.lz);
      this.setFov(this.gameFov);
      return;
    }
    if (this.orbit) {
      this.setFov(this.gameFov);
      this.orbitT += dt * 0.08;
      const a = this.orbitT;
      // (an ellipse inside the bowl, over the front rows: the stands all round behind the court)
      this.camera.position.set(Math.sin(a) * 13.5, 8, Math.cos(a) * 18.5);
      this.camera.lookAt(0, 0.8, 0);
      return;
    }
    let tx = 0;
    if (m) {
      const me = m.players.find((p) => p.human) ?? m.players[0];
      tx = me.x * 0.35;
      const b = m.ballPos(this.bp);
      if (b) tx = tx * 0.6 + b.x * 0.12;
    }
    // (held while the TV takes over, so the gameplay camera is where it was when the play comes back)
    if (this.director.kind === 'play') this.camX += (tx - this.camX) * (1 - Math.exp(-2.2 * dt));
    const c = this.cam;
    const dist = portrait ? c.pd : c.ld;
    const height = portrait ? c.ph : c.lh;
    const lookZ = portrait ? c.pl : c.ll;
    const sh = this.director.kind === 'play' ? this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 1.4);
    const jx = sh > 0 ? (Math.random() - 0.5) * sh * 0.5 : 0;
    const jy = sh > 0 ? (Math.random() - 0.5) * sh * 0.5 : 0;
    this.game.pos.set(this.camX + jx, height + jy, side * dist);
    this.game.look.set(this.camX * 0.7, 0, side * lookZ);
    this.game.fov = this.gameFov;
    this.fillCtx();
    const o = this.director.update(dt, this.ctx, this.camOut);
    this.camera.position.copy(o.pos);
    this.camLook.copy(o.look);
    this.camera.lookAt(this.camLook);
    this.setFov(o.fov);
  }
  private setFov(f: number) {
    if (Math.abs(this.camera.fov - f) < 1e-3) return;
    this.camera.fov = f;
    this.camera.updateProjectionMatrix();
    this.pxScale = (this.bufH * 0.5) / Math.tan((f * Math.PI) / 360);
  }

  toScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = this.tmp.set(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.cssW, y: (-v.y * 0.5 + 0.5) * this.cssH };
  }
  /**
   * Where a point is in the frame the camera shows now: nx, ny from −1 to 1 across the screen (meaningless when it
   * is behind the camera: `front` false) and how far it is from the camera (m).
   */
  inFrame(x: number, y: number, z: number): { nx: number; ny: number; front: boolean; d: number } {
    this.camera.updateMatrixWorld();
    const d = this.camera.position.distanceTo(this.tmp.set(x, y, z));
    const front = this.tmp.applyMatrix4(this.camera.matrixWorldInverse).z < -0.3;
    const v = this.tmp.set(x, y, z).project(this.camera);
    return { nx: v.x, ny: v.y, front, d };
  }
  pxPerMetre(x: number, z: number): number {
    const a = this.toScreen(x - 0.5, 0, z);
    const b = this.toScreen(x + 0.5, 0, z);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
}

export type { Kit };
