// AI-made players: loading the rigged models and the animation clips, giving each rival their own kit,
// and driving the animation from the simulation (locomotion loops in step and played by the ground their feet cover,
// swings timed to the contact, the legs following the simulation's footwork: split step, plant, follow-through).
// On top of the clips, every frame: the body put down on the floor, planted feet that stay planted (leg IK, steps),
// the hips lowered and the back bent for low balls, the arm (hinged elbow, wrist within its limits) taking the
// racket's sweet spot through the ball (the free hand on the handle for the two-handed backhand), the head following
// the ball. Tennis: the forehand and the two-handed backhand from motion capture, the slices on a high-to-low path with
// the face open, compact volleys, the overhand serve built on the overhead's capture (keyposes.ts) and the smash.
// (The racket is still called the paddle in the code: the kits' field names. The sweet spot is gear.ts RACKET.face up
// the racket from the hand.) tools/poses.ts and tools/render/stage-tenis.ts measure how natural it looks.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Match } from '../sim/match';
import { AT_NET } from '../sim/court';
import type { Player, ShotKind } from '../sim/types';
import { RACKET, paddleMesh as gearPaddle, type PaddleLook } from './gear';
import { SERVE_CLIP, SERVE_TOSS, refineClips } from './keyposes';
import { applyBuild, shapeHands, womanTemplate, type Build } from './body';
import { playerMaterial, type BodyZones, type KitLook, type KitPainter, type Outfit } from './outfit';

export interface ClipJson {
  name: string;
  duration: number;
  tracks: { n: string; t: number[]; v: number[] }[];
}

export interface Kit {
  /** hue (0…360) the shirt is repainted to; null keeps the original */
  shirtHue: number | null;
  shirtSat?: number;
  shirtLight?: number;
  /** shorts: hue and lightness, null keeps them */
  shortsHue?: number | null;
  shortsLight?: number;
  /** the racket's frame (the padel paddle's names: kits.ts) and its bumper */
  paddle: number;
  paddleEdge: number;
  /** the full kit, painted on the GPU (outfit.ts); without it (or without a painter) the shirt is recoloured as above */
  outfit?: Outfit;
  /** the racket's head, finish and paint (gear.ts); without it a plain one in `paddle` */
  paddleLook?: PaddleLook;
  /** the player's build: height, shoulders, girth… (body.ts); without it the model as it is, 1.78 m */
  body?: Build;
  /**
   * a body of their own (assets/chars/<model>.json, see Person): a Rocketbox person on the player's skeleton; without
   * it, or while it has not loaded (or failed to), the AI-made one
   */
  model?: string;
  /** the serve from video this player serves with ('b': SERVE_B, Nadal's; default the main one, Zverev's) */
  serve?: 'b';
}

export interface CharAssets {
  template: THREE.Object3D;
  image: HTMLImageElement | ImageBitmap | HTMLCanvasElement;
  clips: Record<string, THREE.AnimationClip>;
  /** seconds into each swing clip when the paddle meets the ball */
  contact: Partial<Record<SwingKind, number>>;
  /** where each swing clip puts the middle of the paddle face at its contact frame (model space, 1.7 m model) */
  reach: Partial<Record<SwingKind, THREE.Vector3>>;
  /** the path of the middle of the paddle face through each swing clip (model space, x y z every 1/60 s) */
  path: Partial<Record<SwingKind, Float32Array>>;
  /** the steps of each locomotion loop, measured on it (see gaitOf) */
  gait: Partial<Record<string, Gait>>;
  /** paints the kits on the GPU (set by the view once it has a renderer) */
  painter?: KitPainter;
  /** the AI's own mesh, as it came (the template's has the fingers curled, see body.ts; the kit painter measures this one) */
  rest?: THREE.BufferGeometry;
  /** the women's body (body.ts), when it is made */
  woman?: THREE.Object3D;
  /** the players' own bodies (see Person) by name, those that have loaded */
  people?: Record<string, Person>;
}

/**
 * A player's own body: a person of Microsoft's Rocketbox library (MIT) on the player's own skeleton, the hands already
 * closed round the handle with their own finger bones (art/blender/persona.py). The same clips, builds and paddle; their
 * own texture, their mask (what each texel is, for the kits; its green the hair's cut-out), where their clothes end
 * (zones) and their own kit painter. No shapeHands on them.
 */
export interface Person {
  template: THREE.Object3D;
  image: HTMLImageElement;
  mask: HTMLImageElement;
  zones: BodyZones;
  /** the mask's green as the material's cut-out (the hair's strands, the lashes) */
  alpha: THREE.Texture;
  painter?: KitPainter;
}

/**
 * A locomotion loop's steps, measured on the clip when it loads (gaitOf). The AI clips do not move a planted foot back
 * at a steady speed (run_v2's lands still swinging forward and leaves at 5 m/s): played by the clock, a planted foot
 * skates. So a loop is played by the ground its planted feet cover instead: `warp` gives the clip time at each step of
 * that travel, and the planted foot then moves back exactly as fast as the player goes.
 */
export interface Gait {
  /** clip time at 0, 1/GAIT_N, … 1 of the loop's ground travel */
  warp: Float32Array;
  /** the ground the planted feet cover in one loop (m, 1.7 m model) */
  stride: number;
  /** where the steps take the body (rad off the model's forward, + to its left) */
  heading: number;
  /** left-foot landings in one loop, and where the first one falls (0…1 of the travel) */
  cycles: number;
  left: number;
}
const GAIT_N = 96;

/**
 * The swings with a clip of their own: drive (every topspin forehand: low to high), backhand (the two-handed one),
 * slice and slice_l (the sliced forehand and the one-handed sliced backhand: high to low, the face open, see SLICE),
 * volley and volley_l (compact: a short punch from the ready stance; on the backhand side one-handed, the one-handed
 * backhand's body with a third of its path), dink (a soft volley at the feet), lunge and lunge_left (a
 * ball out of reach on either side), smash (the overhead), serve (overhand, from the toss) and the rest.
 */
export type SwingKind = 'drive' | 'volley' | 'volley_l' | 'backhand' | 'smash' | 'dink' | 'lunge' | 'lunge_left' | 'serve' | 'slice' | 'slice_l';

interface SwingDef {
  /** how the contact frame is found (see findContact), searched between `from` and `to` (s into the clip) */
  find: 'fast' | 'high' | 'reach' | number;
  from?: number;
  to?: number;
  /** clip time when the swing is over and the legs take back (the clip fades out from there) */
  out: number;
  /** fade-in (s): longer for clips that start in a very different pose (the lunges) */
  fade: number;
  /** how long after the contact the arm is pulled onto the ball (s), and before it (`pre`, default the same) */
  ik: number;
  pre?: number;
  /**
   * low to high, for a ball under where the clip meets it: the clip's path is kept across the court, but the paddle
   * goes back at the height of the ball (a touch under it) and rises after the contact to where the clip finishes,
   * instead of coming down on the ball from the clip's height; the IK takes the paddle from `pre` before the contact
   * (the take-back is the IK's, low), and the paddle turns with the forearm (see reachBall)
   */
  lift?: boolean;
  /** the ball height the knees and the back bend from (m, a 1.78 m player; default: where the clip meets the ball) */
  home?: number;
  /**
   * the most the hips go down for a low ball (m, default DROP): the drive and the backhand clips already crouch (hips at
   * 0.73 and 0.79 m at their contact, feet 0.8 m apart); 20 cm more on top made a goalkeeper's squat, hips at 0.6 m
   */
  drop?: number;
  /** how much of the clip's path the paddle travels before and after the contact (1: all; the volley is short) */
  scale?: number;
  /** how much of the upper body the clip has (the volley turns the trunk less than the drive it is made from) */
  upper?: number;
  /** the earliest clip time a swing starts from (lunge_left swings the paddle the wrong way first) */
  start?: number;
  /**
   * how long before the contact the swing starts when there is time (s; default the clip's whole wind-up, its contact
   * time): the clips with a long quiet lead-in are started part way into it (the dink's paddle hardly moves for its
   * first 0.8 s): held from the start, they froze the upper body in that pose for a second or more while the player
   * ran to the ball, the paddle held out in front like a tray
   */
  lead?: number;
  /**
   * the take-back done early and held (the drive's clip takes the paddle back late and little: 25 cm, 0.16 s before
   * the contact; to the eye the paddle went back at the last instant): the IK takes the paddle from `pre` before the
   * contact whatever the height of the ball, the clip's path before `hold` s from the contact is played `slow` as fast
   * (it gets back early and waits there), and that path goes `back` times as far back
   */
  prep?: { hold: number; slow: number; back: number };
  /**
   * the smash only: the ball height (m, over the floor) the clip reaches without a jump (default SMASH_JUMP.from): the
   * jump makes up the rest, up to `jumpMax` (default SMASH_JUMP.max)
   */
  jumpFrom?: number;
  jumpMax?: number;
  /**
   * how far from the body the paddle meets the ball (m across the floor, a 1.7 m player; default: the paddle's tip at
   * the clip's contact): where the body is put under or beside the ball (the remate from video meets it right over
   * the head: on its own reach the player stood under the ball)
   */
  reach?: number;
  /**
   * how much of the legs the clip has when it takes them (default 1; the rest is the ready stance): the drive's clip
   * squats wide (feet 0.8 m apart, hips at 0.73 m at the contact), a goalkeeper's crouch for every forehand
   */
  legs?: number;
}

/**
 * The swing clips (Meshy, generated from text; most are replaced by motion capture below: MOCAP). Contact frames
 * measured on the clips and checked by eye: drive 0.46 s, backhand 0.95 s (one-handed; the two-handed one is MOCAP's),
 * smash 0.92 s, dink 1.58 s (dink_v2: the racket has just passed the bottom of its short swing and goes forward and
 * up), lunge 1.13 s (racket furthest out), stretched backhand 1.27 s (lunge_left_v2: the racket low in front of the
 * left knee, sweeping out to the right; started from 0.8 s), serve SERVE_CLIP.contact (keyposes.ts: built on the
 * overhead's capture). The slices' clips are the forehand's and the one-handed backhand's (CLIP_FILES).
 */
export const SWINGS: Record<SwingKind, SwingDef> = {
  drive: { find: 0.46, out: 0.85, fade: 0.1, ik: 0.17, pre: 0.42, lift: true, home: 1.0, drop: 0.09, prep: { hold: 0.16, slow: 0.3, back: 1.6 }, legs: 0.55 },
  volley: { find: 0.46, out: 0.62, fade: 0.08, ik: 0.12, pre: 0.22, lift: true, home: 1.1, drop: 0.08 },
  backhand: { find: 0.95, out: 1.45, fade: 0.1, ik: 0.17, lead: 0.7, drop: 0.12 },
  smash: { find: 'high', from: 0.6, to: 1.1, out: 1.12, fade: 0.12, ik: 0.15 },
  dink: { find: 1.58, out: 1.85, fade: 0.15, ik: 0.3, pre: 0.45, lift: true, lead: 0.8 },
  lunge: { find: 'reach', from: 0.7, to: 1.3, out: 1.5, fade: 0.15, ik: 0.28, lead: 0.85 },
  lunge_left: { find: 1.27, out: 1.75, fade: 0.15, ik: 0.28, start: 0.8 },
  // (the serve: the whole wind-up from the toss, the clip timed so its contact is the sim's SERVE_WINDUP after the
  // start: keyposes.ts SERVE_CLIP)
  // (`reach`: the body goes into the court under the toss, so the hitting shoulder is under the ball and the arm reaches
  // straight up for it: on the clip's own reach, 0.4 m, the shoulder stayed 0.5 m behind a ball met at 2.75 m)
  serve: { find: SERVE_CLIP.contact, out: SERVE_CLIP.contact + 0.75, fade: 0.08, ik: 0.2, lead: SERVE_CLIP.contact, reach: 0.1 },
  // (the slices: the clip's body, the racket's path high to low, SLICE; no low-to-high lift)
  slice: { find: 0.46, out: 0.85, fade: 0.1, ik: 0.22, pre: 0.3, home: 0.9, drop: 0.12, legs: 0.6 },
  slice_l: { find: 0.95, out: 1.45, fade: 0.1, ik: 0.22, pre: 0.3, lead: 0.7, drop: 0.12 },
  volley_l: { find: 0.95, out: 1.25, fade: 0.08, ik: 0.14, pre: 0.2, lead: 0.4, scale: 0.4, upper: 0.85, drop: 0.08 },
};

/**
 * The locomotion clips loop over a window of a few steps (s into the clip): the backpedal and the shuffle speed up and
 * slow down, and run_v2's two strides differ (the first drifts 12–16° to the right, the second 4–10°, the clip slows
 * down at the end); the window is one stride cycle in full stride whose last pose matches the first. A third
 * number blends the last part of the window (s) into the poses just before its start, so the loop has no seam (the
 * shuffle's ends are 9 cm apart; run_v2's, 19° and 10 cm: blended, 0).
 */
const LOOPS: Record<string, [number, number, number?]> = { run: [0.867, 1.417, 0.2], backpedal: [0.233, 0.833], shuffle: [0.533, 1.567, 0.2], shuffle_l: [0.533, 1.567, 0.2] };

/**
 * Every clip the players use, and the file it is read from (assets/anims/<file>.json): the model plays whichever of
 * these load. A clip remade keeps its role and gets a new file.
 */
export const CLIP_FILES: Record<string, string> = {
  ready: 'ready',
  shuffle: 'shuffle_v2',
  shuffle_l: 'shuffle_v2',
  walk: 'walk',
  run: 'run_v2',
  backpedal: 'backpedal',
  drive: 'drive',
  volley: 'drive',
  backhand: 'backhand',
  smash: 'smash',
  dink: 'dink_v2',
  lunge: 'lunge',
  lunge_left: 'lunge_left_v2',
  // (the serve: built in keyposes.ts on the overhead's motion capture, SERVE_CLIP)
  serve: 'smash_mocap',
  slice: 'drive',
  slice_l: 'backhand',
  volley_l: 'backhand',
  cheer: 'cheer',
  lost: 'lost',
};

/**
 * The clips from motion capture, put on our skeleton in Blender (art/blender/README.md), in place of the Meshy ones
 * (?mocap=off plays the Meshy ones, as in main, to compare):
 *  · run: a real runner's stride (CMU 09_01); the paddle arm is still carried by keyposes.ts. Shorter than LOOPS.run's
 *    window, so it plays whole.
 *  · walk: a real walk (CMU 35_01, a two-step cycle); keyposes.ts holds the paddle up in front as before.
 *  · cheer: arms flung up in a V, then hands on the hips (CMU 79_69, "very happy"), REACT_LEN long.
 *  · lost: arms out, hands to the head, bent over, then up again (CMU 79_74, "upset"), REACT_LEN long.
 */
const MOCAP_FILES: Record<string, string> = { run: 'run_mocap', walk: 'walk_mocap', cheer: 'cheer_mocap', lost: 'lost_mocap' };

/**
 * The swings from motion capture: a real tennis player's forehand, two-handed backhand and overhead (Rokoko's free
 * tennis pack, put on our skeleton in Blender: art/blender/README.md; the backhand from the pickleball, the same
 * skeleton), each with its own timings: the contact measured on the clip (tools/swing-path.ts), a real wind-up, the
 * player's own legs. keyposes.ts leaves their free arm as captured (the two-hander's left hand is put back on the
 * handle every frame: see twoHands) and turns the racket's face at their contact (MOCAP_CONTACT). The forehand slice
 * is played on the forehand's body. ?mocap=off plays the Meshy clips (to compare).
 */
const MOCAP: Partial<Record<SwingKind, { file: string; def: SwingDef }>> = {
  // (contacts: the hand at its fastest in front of the body, and the smash's racket at its highest, as findContact's
  // 'fast' and 'high' find them; fixed here so keyposes.ts turns the racket's face at the same frame)
  // forehand: contact in front of the right hip, finished high over the left shoulder (a full tennis swing: the whole
  // 0.5 s of its wind-up when there is time)
  drive: { file: 'drive_mocap', def: { find: 0.633, out: 1.15, fade: 0.1, ik: 0.17, pre: 0.3, lift: true, drop: 0.09, legs: 0.9, lead: 0.5 } },
  // two-handed backhand: a full turn (the back to the net), contact in front on the left, finished high on the right
  // (`lift`: without it the low balls were missed by 15–25 cm)
  backhand: { file: 'backhand_mocap', def: { find: 1.0, out: 1.35, fade: 0.1, ik: 0.17, pre: 0.3, lift: true, lead: 0.7, drop: 0.12 } },
  // overhead: side on under the ball, the free hand pointing at it, a jump into the hit; the long wait under the ball
  // at the start is cut short when the ball comes sooner (`lead`)
  // (`jumpFrom`: the jump makes up a ball met over 2.2 m, at most `jumpMax`: a smash at 2.7 m jumps 0.5 m and the
  // racket meets the ball within 5 cm, tools/render/stage-tenis.ts)
  smash: { file: 'smash_mocap', def: { find: 1.667, out: 2.1, fade: 0.12, ik: 0.15, lead: 1.0, jumpFrom: 2.2, jumpMax: 0.5, reach: 0.3 } },
  // the forehand slice on the forehand's body (its path is SLICE's change of the clip's)
  slice: { file: 'drive_mocap', def: { find: 0.633, out: 1.15, fade: 0.1, ik: 0.22, pre: 0.3, drop: 0.1, legs: 0.9, lead: 0.5 } },
};
/**
 * From video: a real padel player's one-handed backhand (KNSU's clips on YouTube, CC BY; tools/video_pose.py,
 * docs/notas-golpes-video.md): the right shoulder to the net, the racket back by the left shoulder, met in front at
 * chest height, both arms flung wide at the finish: the one-handed sliced backhand's body. ?video=off plays the Meshy
 * one-handed backhand for it.
 */
const VIDEO: Partial<Record<SwingKind, { file: string; def: SwingDef }>> = {
  slice_l: { file: 'backhand_video', def: { find: 0.78, out: 1.2, fade: 0.1, ik: 0.22, pre: 0.3, lead: 0.55, drop: 0.12 } },
  // (the backhand volley: the same body, a third of its path, short)
  volley_l: { file: 'backhand_video', def: { find: 0.78, out: 1.05, fade: 0.08, ik: 0.14, pre: 0.2, lead: 0.35, scale: 0.4, upper: 0.85, drop: 0.08 } },
  // the serve: Alexander Zverev's kick serve at Indian Wells, filmed in slow motion (Jim Fawcette, CC BY), played at
  // its real speed (the video ×9.9): from the toss to the landing, the trophy, the knees bent and the back arched, the
  // racket drop, the jump into the ball and the left leg kicked back on the way down. Its contact (1.05 s) is
  // SERVE_CLIP.contact; the jump is the character's (SERVE_JUMP: the conversion keeps the feet on the floor); the ball
  // leaves the hand at SERVE_VIDEO_TOSS
  serve: { file: 'serve_kick_video', def: { find: 1.05, out: 1.5, fade: 0.2, ik: 0.2, lead: 1.05, reach: 0.1 } },
};
/** the swings played from motion capture and their contact (s into the clip), for keyposes.ts */
export const MOCAP_CONTACT: Record<string, number> = {};
const urlOff = (name: string) => {
  try {
    return new URLSearchParams(location.search).get(name) === 'off';
  } catch {
    return false;
  }
};
const mocapOff = urlOff('mocap');
const videoOff = urlOff('video');
/** the serve from video (VIDEO.serve, unless ?video=off): its own toss */
export const SERVE_FROM_VIDEO = !videoOff && !!VIDEO.serve;
/** the video serve's toss: the ball leaves the left hand this far into its clip (s) */
const SERVE_VIDEO_TOSS = 0.08;
/**
 * A second serve from video, for the players whose kit says `serve: 'b'`: Rafael Nadal's at Indian Wells, filmed in
 * slow motion (Jim Fawcette, CC BY), mirrored (he is left-handed) and played at its real speed (the video ×4): a
 * lower toss than the kick serve's, the ball out of the hand at `toss` s, the same contact (SERVE_CLIP.contact). The
 * same SwingDef as the main serve; keyposes.ts gives it the same arm through the racket drop and the same face.
 */
export const SERVE_B = { file: 'serve_nadal_video', toss: 0.21 };
if (SERVE_FROM_VIDEO) CLIP_FILES.serve_b = SERVE_B.file;
for (const [table, on] of [
  [MOCAP, !mocapOff],
  [VIDEO, !videoOff],
] as const) {
  if (!on) continue;
  if (table === MOCAP) Object.assign(CLIP_FILES, MOCAP_FILES);
  for (const [k, m] of Object.entries(table)) {
    CLIP_FILES[k] = m.file;
    SWINGS[k as SwingKind] = m.def;
    if (typeof m.def.find === 'number') MOCAP_CONTACT[k] = m.def.find;
    else delete MOCAP_CONTACT[k];
  }
}
export const CLIP_NAMES = Object.keys(CLIP_FILES);

const LEFT_ARM = new Set(['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand']);
/**
 * Clips put together from parts of other files (AI clips that got one part right): for each part, these bones come
 * from `from` (mirrored left for right with `mirror`), played `shift` s later; the rest from the role's own file. If a
 * file is missing the role is left out.
 *  · the shuffle: the free arm of the ready stance (in shuffle_v2 it sits on the hip, the elbow out)
 *  · the shuffle to the left: the same, on the legs of shuffle_v2 mirrored (it steps to the right; played backwards it
 *    stepped left with every push the wrong way round: the foot slid into each step and leapt off at the end of it)
 * (The stretched backhand used to be the backhand's arms on lunge_left's legs; lunge_left_v2 has both. Its legs played
 * later than its arms, to show the stride, turn the hips away from the arms: the stride is the feet stepping out to the
 * clip's lunge as the swing takes the legs, see `footwork`.)
 */
const MIXED: Record<string, { from: string; bones: (bone: string) => boolean; shift?: number; mirror?: boolean }[]> = {
  shuffle: [{ from: 'ready', bones: (b) => LEFT_ARM.has(b) }],
  shuffle_l: [
    { from: 'ready', bones: (b) => LEFT_ARM.has(b) },
    { from: 'shuffle_v2', bones: (b) => LOWER.has(b), mirror: true },
  ],
};

function mixClip(own: ClipJson, other: ClipJson, bones: (bone: string) => boolean, shift: number): ClipJson {
  const bone = (n: string) => n.slice(0, n.indexOf('.'));
  const tracks = own.tracks.filter((t) => !bones(bone(t.n)));
  for (const t of other.tracks) if (bones(bone(t.n))) tracks.push(shift ? { ...t, t: t.t.map((x) => x + shift) } : t);
  return { name: own.name, duration: own.duration, tracks };
}

/**
 * A clip mirrored left for right (x → −x): each bone takes its other side's track, turns mirrored as (x, −y, −z, w)
 * and the hips' offset with x negated. Checked on this rig's legs: the mirrored feet land within 7 mm of the other
 * feet mirrored (tools/poses-loco.ts measures the shuffle both ways).
 */
function mirrorClip(j: ClipJson): ClipJson {
  const other = (b: string) => (b.startsWith('Left') ? 'Right' + b.slice(4) : b.startsWith('Right') ? 'Left' + b.slice(5) : b);
  const tracks = j.tracks.map((t) => {
    const dot = t.n.indexOf('.');
    const prop = t.n.slice(dot);
    const v = t.v.slice();
    if (prop === '.quaternion')
      for (let i = 0; i < v.length; i += 4) {
        v[i + 1] = -v[i + 1];
        v[i + 2] = -v[i + 2];
      }
    else if (prop === '.position') for (let i = 0; i < v.length; i += 3) v[i] = -v[i];
    return { n: other(t.n.slice(0, dot)) + prop, t: t.t, v };
  });
  return { ...j, tracks };
}

/**
 * The paddle in the right hand (rx, ry, rz, ox, oy, oz in bone space). A handshake grip: with the wrist straight the
 * paddle leaves the forearm at about 50° (it was 90°, a hammer grip, which only an impossible wrist could line up with
 * the arm to reach a ball).
 */
export const PADDLE_POSE = [0, 0, -0.9, 0, 6, 0];

function clipFromJson(j: ClipJson): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const tr of j.tracks) {
    if (tr.n.endsWith('.quaternion')) tracks.push(new THREE.QuaternionKeyframeTrack(tr.n, tr.t, tr.v));
    else tracks.push(new THREE.VectorKeyframeTrack(tr.n, tr.t, tr.v));
  }
  return new THREE.AnimationClip(j.name, j.duration, tracks);
}

/**
 * The part of a clip between a and b (s), resampled at 30 fps, as a clip of its own (for a clean loop). With `blend`,
 * the last `blend` seconds fade into the poses one window earlier, which lead into the first: no seam at the loop.
 */
function loopWindow(c: THREE.AnimationClip, a: number, b: number, blend = 0): THREE.AnimationClip {
  const n = Math.max(2, Math.round((b - a) * 30) + 1);
  const L = b - a;
  blend = Math.min(blend, a, L / 2);
  const tracks = c.tracks.map((tr) => {
    // createInterpolant is there at runtime (the typings leave it out)
    const it = (tr as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
    const size = tr.getValueSize();
    const quat = tr.name.endsWith('.quaternion');
    const times = new Float32Array(n);
    const values = new Float32Array(n * size);
    const early = new Float32Array(size);
    for (let i = 0; i < n; i++) {
      const t = a + (L * i) / (n - 1);
      times[i] = t - a;
      values.set(it.evaluate(t) as ArrayLike<number>, i * size);
      const k = blend > 0 ? smooth(b - blend, b, t) : 0;
      if (k > 0) {
        early.set(it.evaluate(t - L) as ArrayLike<number>);
        if (quat) THREE.Quaternion.slerpFlat(values as unknown as number[], i * 4, values as unknown as number[], i * 4, early as unknown as number[], 0, k);
        else for (let j = 0; j < size; j++) values[i * size + j] += (early[j] - values[i * size + j]) * k;
      }
    }
    const Track = tr.constructor as new (name: string, times: ArrayLike<number>, values: ArrayLike<number>) => THREE.KeyframeTrack;
    return new Track(tr.name, times, values);
  });
  return new THREE.AnimationClip(c.name, b - a, tracks);
}

interface CharJson {
  gltf: Record<string, unknown>;
  bin: string;
  tex: string;
  mask?: string;
  zones?: BodyZones;
}

const loadImage = (src: string, what: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`texture ${what}`));
    im.src = src;
  });

/** A player's own body (see Person). The view gives it a kit painter of its own. */
export async function loadPerson(base: string, name: string): Promise<Person> {
  const ch = await getJson<CharJson>(`${base}assets/chars/${name}.json`);
  if (!ch.mask || !ch.zones) throw new Error(`${name}: no mask`);
  const [image, mask] = await Promise.all([loadImage(ch.tex, name), loadImage(ch.mask, `${name} mask`)]);
  const gltf = await new GLTFLoader().parseAsync(toGlb(ch.gltf, b64(ch.bin)), '');
  // (the cut-out at half the mask's size: a quarter of the memory, and the strands' edges are soft anyway)
  let src: HTMLImageElement | HTMLCanvasElement = mask;
  try {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.max(1, mask.width >> 1);
    cv.getContext('2d')!.drawImage(mask, 0, 0, cv.width, cv.height);
    src = cv;
  } catch {
    // (no canvas: the mask itself)
  }
  const alpha = new THREE.Texture(src);
  alpha.flipY = false;
  alpha.colorSpace = THREE.NoColorSpace;
  alpha.needsUpdate = true;
  return { template: gltf.scene, image, mask, zones: ch.zones, alpha };
}

function getJson<T>(url: string): Promise<T> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });
}

function b64(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** A GLB assembled in memory from the JSON and the binary: the loader then fetches nothing. */
function toGlb(gltf: Record<string, unknown>, bin: Uint8Array): ArrayBuffer {
  const enc = new TextEncoder();
  let js = enc.encode(JSON.stringify(gltf));
  const jsPad = (4 - (js.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + js.length + jsPad + 8 + bin.length + binPad;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, js.length + jsPad, true);
  dv.setUint32(16, 0x4e4f534a, true);
  u8.set(js, 20);
  for (let i = 0; i < jsPad; i++) u8[20 + js.length + i] = 0x20;
  const o = 20 + js.length + jsPad;
  dv.setUint32(o, bin.length + binPad, true);
  dv.setUint32(o + 4, 0x004e4942, true);
  u8.set(bin, o + 8);
  js = new Uint8Array(0);
  return buf;
}

/**
 * The model must load; a clip that is missing or broken is skipped (with a warning) and the character falls back
 * to what it has (the drive for any swing, the procedural backhand, the walk for running…).
 */
export async function loadCharAssets(base: string, model: string, clipNames: string[]): Promise<CharAssets> {
  // (each file once: some roles share one, see CLIP_FILES and MIXED)
  const files = new Map<string, Promise<ClipJson | null>>();
  const file = (f: string) => {
    let p = files.get(f);
    if (!p) {
      p = getJson<ClipJson>(`${base}assets/anims/${f}.json`).catch((err) => {
        console.warn(`clip ${f} skipped:`, err?.message ?? err);
        return null;
      });
      files.set(f, p);
    }
    return p;
  };
  const [ch, ...clips] = await Promise.all([
    getJson<CharJson>(`${base}assets/chars/${model}.json`),
    ...clipNames.map(async (c) => {
      const parts = MIXED[c] ?? [];
      const [own, ...others] = await Promise.all([file(CLIP_FILES[c] ?? c), ...parts.map((p) => file(p.from))]);
      if (!own) return null;
      let out = own;
      for (let i = 0; i < parts.length; i++) {
        const o = others[i];
        if (!o) return null;
        out = mixClip(out, parts[i].mirror ? mirrorClip(o) : o, parts[i].bones, parts[i].shift ?? 0);
      }
      return out;
    }),
  ]);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`texture ${model}`));
    im.src = ch.tex;
  });
  const gltf = await new GLTFLoader().parseAsync(toGlb(ch.gltf, b64(ch.bin)), '');
  const out: Record<string, THREE.AnimationClip> = {};
  clips.forEach((c, i) => {
    const k = clipNames[i];
    if (!c) return;
    try {
      const clip = clipFromJson(c);
      const w = LOOPS[k];
      out[k] = w && clip.duration >= w[1] ? loopWindow(clip, w[0], w[1], w[2]) : clip;
    } catch (err) {
      console.warn(`clip ${k} skipped:`, err);
    }
  });
  // the key poses built in code (keyposes.ts): the ready stance, between points, the serve, the free arm…
  try {
    const P = PADDLE_POSE;
    refineClips(gltf.scene, out, { rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(P[0], P[1], P[2])), off: new THREE.Vector3(P[3], P[4], P[5]), face: RACKET.face }, MOCAP_CONTACT);
  } catch (err) {
    console.warn('key poses skipped:', err);
  }
  const assets: CharAssets = { template: gltf.scene, image: img, clips: out, contact: {}, reach: {}, path: {}, gait: {} };
  // the hands: the paddle hand closed round the handle, the free one relaxed (body.ts)
  gltf.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || assets.rest) return;
    assets.rest = m.geometry;
    m.geometry = shapeHands(m, { pose: PADDLE_POSE, height: 1.78 });
  });
  // the women's body (body.ts): the same bones, its own geometry
  try {
    assets.woman = womanTemplate(gltf.scene, cloneSkinned);
  } catch (err) {
    console.warn('women\'s body skipped:', err);
  }
  for (const k of Object.keys(SWINGS) as SwingKind[]) {
    if (!out[k]) continue;
    const r = findContact(assets, k);
    assets.contact[k] = r.t;
    assets.reach[k] = r.tip;
    assets.path[k] = r.path;
  }
  for (const k of GAITS) {
    if (!out[k]) continue;
    const g = gaitOf(assets.template, out[k]);
    if (g) assets.gait[k] = g;
  }
  return assets;
}

/** the loops played by the ground their feet cover, in step with each other (see Gait) */
const GAITS = ['walk', 'run', 'backpedal', 'shuffle', 'shuffle_l'];

/**
 * A locomotion loop's steps (see Gait), measured on the clip (model space, 1.7 m model, 60 samples a second): a foot
 * is planted while its sole is within 3 cm of the lowest the feet go; the heading is the way the planted feet move,
 * reversed; each sample's travel is how far the planted feet move back along it (both feet planted: their average;
 * none, in a run's flight: the loop's mean pace), kept within 0.3–3× the mean so the clip never stalls or races.
 */
export function gaitOf(template: THREE.Object3D, c: THREE.AnimationClip): Gait | null {
  const obj = cloneSkinned(template);
  const mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(c).play();
  const B: Record<string, THREE.Object3D> = {};
  obj.traverse((o) => {
    if ((o as THREE.Bone).isBone) B[o.name] = o;
  });
  const legs = [
    [B.LeftFoot, B.LeftToeBase],
    [B.RightFoot, B.RightToeBase],
  ];
  if (legs.some((l) => !l[0] || !l[1])) return null;
  const L = c.duration;
  const n = Math.max(8, Math.round(L * 60));
  const dt = L / n;
  const k = 1.7 / 1.78;
  const X = [new Float32Array(n), new Float32Array(n)];
  const Z = [new Float32Array(n), new Float32Array(n)];
  const S = [new Float32Array(n), new Float32Array(n)];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let floor = Infinity;
  for (let i = 0; i < n; i++) {
    mixer.setTime(i * dt);
    obj.updateMatrixWorld(true);
    for (let f = 0; f < 2; f++) {
      legs[f][0].getWorldPosition(a);
      legs[f][1].getWorldPosition(b);
      S[f][i] = Math.min(a.y - ANKLE_H * k, b.y - TOE_H * k);
      X[f][i] = (a.x + b.x) / 2;
      Z[f][i] = (a.z + b.z) / 2;
      floor = Math.min(floor, S[f][i]);
    }
  }
  const down = (f: number, i: number) => S[f][i % n] - floor < 0.03 * k;
  let dx = 0;
  let dz = 0;
  for (let i = 0; i < n; i++)
    for (let f = 0; f < 2; f++)
      if (down(f, i) && down(f, i + 1)) {
        dx += X[f][(i + 1) % n] - X[f][i];
        dz += Z[f][(i + 1) % n] - Z[f][i];
      }
  if (Math.hypot(dx, dz) < 1e-3) return null;
  const heading = Math.atan2(-dx, -dz);
  const ux = Math.sin(heading);
  const uz = Math.cos(heading);
  const d = new Float32Array(n);
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    let m = 0;
    for (let f = 0; f < 2; f++)
      if (down(f, i) && down(f, i + 1)) {
        s -= (X[f][(i + 1) % n] - X[f][i]) * ux + (Z[f][(i + 1) % n] - Z[f][i]) * uz;
        m++;
      }
    d[i] = m ? s / m : NaN;
    if (m) {
      sum += d[i];
      cnt++;
    }
  }
  const mean = cnt ? sum / cnt : 0;
  if (!(mean > 1e-5)) return null;
  const C = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) {
    // (a foot just landing, still swinging forward, or one barely moving: no time warp can hold it still, it goes at
    // the loop's pace; the leg IK holds it where it lands)
    d[i] = Number.isNaN(d[i]) || d[i] < 0.5 * mean ? mean : Math.min(d[i], 3 * mean);
    C[i + 1] = C[i] + d[i];
  }
  const stride = C[n];
  const warp = new Float32Array(GAIT_N + 1);
  let i = 0;
  for (let j = 0; j <= GAIT_N; j++) {
    const target = (stride * j) / GAIT_N;
    while (i < n - 1 && C[i + 1] < target) i++;
    warp[j] = Math.min(L, (i + clamp((target - C[i]) / d[i], 0, 1)) * dt);
  }
  let cycles = 0;
  let left = 0;
  for (let j = 0; j < n; j++)
    if (!down(0, j + n - 1) && down(0, j)) {
      if (!cycles) left = C[j] / stride;
      cycles++;
    }
  return { warp, stride, heading, cycles: Math.max(1, cycles), left };
}

/** The clip time `u` (0…1) of the way through a loop's ground travel. */
function warpAt(g: Gait, u: number): number {
  const f = (u - Math.floor(u)) * GAIT_N;
  const j = Math.min(GAIT_N - 1, Math.floor(f));
  return g.warp[j] + (g.warp[j + 1] - g.warp[j]) * (f - j);
}

/**
 * The moment in a swing clip when the paddle meets the ball, measured on the clip (model space: it faces +z, its
 * right is −x):
 *  · fast: the right hand moves fastest in front of the body (drives)
 *  · high: the paddle at its highest (the smash)
 *  · reach: the paddle furthest out to the right (the lunge)
 *  · a number: set by eye (clips where the rule above lands off the contact)
 * Only the part of the clip between `from` and `to` (s) is searched. Also returns where the middle of the paddle
 * face is at that frame and its path through the whole clip (model space).
 */
function findContact(a: CharAssets, clip: SwingKind): { t: number; tip: THREE.Vector3; path: Float32Array } {
  const def = SWINGS[clip];
  const c = a.clips[clip];
  const obj = cloneSkinned(a.template);
  const mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(c).play();
  let hand: THREE.Object3D | null = null;
  obj.traverse((o) => {
    if (o.name === 'RightHand') hand = o;
  });
  const fixed = typeof def.find === 'number';
  const from = def.from ?? 0;
  const to = def.to ?? c.duration;
  let bestT = Math.min(c.duration, fixed ? (def.find as number) : (from + to) / 2);
  // the racket's sweet spot in the hand's space (centimetres under the 0.01 armature)
  const P = PADDLE_POSE;
  const tipLocal = new THREE.Vector3(0, RACKET.face * 100, 0).applyEuler(new THREE.Euler(P[0], P[1], P[2])).add(new THREE.Vector3(P[3], P[4], P[5]));
  const tipAt = (t: number) => {
    mixer.setTime(t);
    obj.updateMatrixWorld(true);
    return hand ? (hand as THREE.Object3D).localToWorld(tipLocal.clone()) : new THREE.Vector3(-0.55, 1, 0.3);
  };
  const n = Math.floor(c.duration * 60) + 1;
  const path = new Float32Array(n * 3);
  if (hand) for (let i = 0; i < n; i++) tipAt(i / 60).toArray(path, i * 3);
  if (!hand) return { t: bestT, tip: tipAt(bestT), path };
  if (!fixed) {
    const h = hand as THREE.Object3D;
    const p = new THREE.Vector3();
    const prev = new THREE.Vector3();
    let best = -Infinity;
    const dt = 1 / 60;
    for (let t = Math.max(0, from - dt); t <= Math.min(to, c.duration); t += dt) {
      mixer.setTime(t);
      obj.updateMatrixWorld(true);
      h.getWorldPosition(p);
      if (t >= from) {
        // fast: the forward swing, with the hand in front of the body
        const tip = def.find === 'fast' ? p : h.localToWorld(sA.copy(tipLocal));
        const score = def.find === 'fast' ? (p.z > 0 ? p.distanceTo(prev) / dt : -Infinity) : def.find === 'high' ? tip.y : -tip.x;
        if (score > best) {
          best = score;
          bestT = t;
        }
      }
      prev.copy(p);
    }
  }
  return { t: bestT, tip: tipAt(bestT), path };
}

/** A copy of the colour texture with the shirt (and shorts) repainted. */
export function kitTexture(img: CanvasImageSource & { width: number; height: number }, kit: Kit): THREE.Texture {
  const w = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = w;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, w, w);
  if (kit.shirtHue !== null || kit.shortsHue != null) {
    const d = x.getImageData(0, 0, w, w);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i] / 255;
      const g = px[i + 1] / 255;
      const b = px[i + 2] / 255;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const l = (mx + mn) / 2;
      const dd = mx - mn;
      if (dd < 0.08) continue;
      const s = dd / (1 - Math.abs(2 * l - 1));
      let h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      h *= 60;
      if (h < 0) h += 360;
      let nh: number | null = null;
      let ns = s;
      let nl = l;
      // coral shirt: orange-red, saturated (skin is less saturated and darker)
      if (kit.shirtHue !== null && (h < 22 || h > 345) && s > 0.55 && l > 0.42) {
        nh = kit.shirtHue;
        ns = Math.min(1, s * (kit.shirtSat ?? 1));
        nl = Math.min(0.95, Math.max(0.05, l + (kit.shirtLight ?? 0)));
      } else if (kit.shortsHue != null && h > 200 && h < 250 && s > 0.25) {
        nh = kit.shortsHue;
        nl = Math.min(0.95, Math.max(0.04, l + (kit.shortsLight ?? 0)));
      }
      if (nh === null) continue;
      const cc = (1 - Math.abs(2 * nl - 1)) * ns;
      const xx = cc * (1 - Math.abs(((nh / 60) % 2) - 1));
      const m = nl - cc / 2;
      const seg = Math.floor(nh / 60) % 6;
      const [rr, gg, bb] = [
        [cc, xx, 0],
        [xx, cc, 0],
        [0, cc, xx],
        [0, xx, cc],
        [xx, 0, cc],
        [cc, 0, xx],
      ][seg];
      px[i] = (rr + m) * 255;
      px[i + 1] = (gg + m) * 255;
      px[i + 2] = (bb + m) * 255;
    }
    x.putImageData(d, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * A tennis racket (68.5 cm), built along +y from the hand, face normal along +x; its sweet spot RACKET.face up (see
 * gear.ts).
 */
export function paddleMesh(color: number, edge: number, look?: PaddleLook): THREE.Group {
  return gearPaddle(color, edge, look);
}

/**
 * Ground speed of each locomotion loop at normal speed (m/s, 1.7 m model), so the clip's pace follows the player. The
 * loops with their steps measured (Gait: all of them when the clips load) go at the ground their planted feet cover
 * in a loop over its length (walk 1.71, run 3.63, backpedal 1.44, shuffle 1.31) and these are only the stand-ins.
 * Not the Hips travel of the Meshy export: in these AI clips the body travels faster than the steps.
 */
export const LOCO_SPEED = { shuffle: 1.4, walk: 1.8, run: 3.6, backpedal: 1.7 };
/**
 * Where the steps of a forward loop take the body (rad off the model's forward, + to its left), measured on the planted
 * foot (gaitOf, and tools/clip-feet.ts role:<loop>): run_v2 drifts 9° to the right, the walk 14° to the left (these
 * are the stand-ins for a loop without its Gait). While the loop plays,
 * the legs are turned back by this much (the hips turned, the chest turned back as it was): the steps go where the
 * player goes and the upper body faces as the clip has it. (The old run, a sprint start, headed 23° to the left with
 * the whole body: the whole model was turned.)
 */
const LOCO_HEADING: Record<string, number> = { run: -0.162, walk: 0.246 };
/**
 * The serve's toss (keyposes.ts SERVE_TOSS): the ball leaves the free hand `release` s into the serve's clip, whose
 * contact is SERVE_CLIP.contact (the simulation's SERVE_WINDUP after the serve starts); the view draws its flight.
 */
export const TOSS = { release: SERVE_FROM_VIDEO ? SERVE_VIDEO_TOSS : SERVE_TOSS.release, contact: SERVE_CLIP.contact };
/**
 * The overhead: a ball out of reach standing is met with the body under it (`under` m of the hips at most,
 * horizontally); the jump is held through the air once it is guessed (SMASH_JUMP).
 */
const OVER = { under: 0.08 };
/**
 * The serve's jump into the ball (m): `k` × how far over `from` (a 1.78 m player on his toes, the arm and the racket
 * straight up: the sweet spot at about 2.55 m) the contact is, at most `max`, in the air as long as a jump that high
 * takes (the peak on the contact; the landing inside the court is the clip's).
 */
const SERVE_JUMP = { from: 2.37, k: 1.0, max: 0.42 };
/**
 * The slices (the hit's kind 'slice', and 'drop', the drop shot hit with underspin): the racket from high to low
 * through the ball, the face open (keyposes.ts FACE). Off the clip's path (model space off the contact, a 1.78 m
 * player): before the contact the racket is taken back `high` m over the ball (all of it from `highT` s before),
 * through the ball going down, and after it on forward `fwd` × the clip's way and down to `low` m under the contact
 * (at `lowT` s), the finish out in front (`rise` m back up by `riseT` s), not over the shoulder. `ik`: the arm holds
 * the path this long after the contact. A slice decided at the contact on a drive's or a backhand's swing (the plan did
 * not say) gets the finish only.
 */
const SLICE = { high: 0.34, highT: 0.32, low: 0.32, lowT: 0.16, rise: 0.14, riseT: 0.4, fwd: 0.8, across: 0.5, ik: 0.5 };
/** the shots played with a slice's swing */
const SLICED = new Set<ShotKind>(['slice', 'drop']);
/**
 * The two-handed backhand: the free (left) hand on the handle over the racket hand, its wrist `up` m along the racket
 * from the racket hand's wrist and `off` m along the face's normal; on through the follow-through until `let` s after the
 * contact, let go over `letGo` s. The left elbow bends about its own hinge (keyposes.ts HINGES), down and in.
 */
const TWO_HANDS = { up: 0.095, off: -0.012, let: 0.32, letGo: 0.16 };
/** the left elbow's hinge in the upper arm's frame (keyposes.ts HINGES) */
const ELBOW_HINGE_L = new THREE.Vector3(0.9628, 0, 0.2701).normalize();
/**
 * How hard the shot was meant/**
 * How hard the shot was meant (the hit's `power`, 0…1, 0.5 a plain one; only known at the contact): the
 * follow-through plays `1 + k × (power − 0.5)` as fast (a hard one snaps through, a placed one is checked).
 */
const POWER = { k: 0.5 };
/** how long a reaction plays at most (s): the `lost` clip turns away from the court after 2.1 s */
const REACT_LEN: Record<string, number> = { cheer: 1.9, lost: 2.0 };
/** the locomotion loops (always playing, mixed by weight) */
const LOCO = ['ready', 'rest', 'serveset', 'shuffle', 'shuffle_l', 'walk', 'run', 'backpedal'];
/** the standing loops (built in keyposes.ts): ready, standing easy between points, the server holding the ball */
const STAND = ['ready', 'rest', 'serveset'];
/**
 * The pelvis and the legs. Every clip plays as two layers, the upper body and these: a swing or a reaction takes the
 * upper body at once, but the legs only as the player comes to a stop (moving, they keep the steps that carry him).
 */
const LOWER = new Set(['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']);

// The feet (m, for a 1.78 m player): the ankle over the floor with the foot flat, and the ball of the foot on the floor
// (the toe bone sits a touch under it). Most of the Meshy clips float over the floor (the ready stance 6 cm, the
// forehand and the dink 8, measured with tools/poses.ts): the body is put down so its lower foot touches the floor.
const ANKLE_H = 0.07;
const TOE_H = -0.02;
/** a foot on the floor stays where it was put down (no skating); it is let go and steps when the body has drawn
 * this far from it (m) or turned this much over it (rad) */
const STRETCH = 0.26;
const TURN = 0.8;
/** how fast the floor under a clip may rise (m/s): a clip that floats higher is put down within a few frames, but a
 * run's flight phase (5–8 cm) is not */
const FLOOR_RISE = 0.25;
/** a step lifts the foot this high (m) */
const LIFT = 0.07;
/** the swing takes the legs over this long as the simulation plants the feet, and gives them back over this (s) */
const PLANT_IN = 0.08;
const PLANT_OUT = 0.12;
/**
 * The split step: the hop starts `lead` before the other side's contact and lasts `air` (s), `hop` high (m, the body;
 * the feet tuck under it), for a player going slower than `still` (m/s); the hips go down `dip` on the landing (m) and
 * each foot lands `widen` further out to its side (m).
 */
const SPLIT = { lead: 0.1, air: 0.14, hop: 0.025, dip: 0.045, widen: 0.05, still: 1.5 };
/**
 * The body leans into what the feet do (the simulation's acceleration, eased over `ease` s): forward into a start,
 * back against a stop, into a turn, `k` rad for each m/s² (`kBack` braking: a stop is planted), at most `fwd`
 * forward or into a turn and `back` back. The
 * lean is a turn of the hips, so the whole body tips; `pivot` of it is taken from the ankles instead (the hips move
 * over the feet: 0 tips about the hips, 1 about the feet). A stop also lowers the hips, up to `drop` (m) at `dropA`
 * m/s². A CPU player's first step is seen coming: over the last `antT` s of his reaction he loads (hips `antDrop` lower)
 * and leans `antLean` towards where he is going. During a swing the lean is `swing` of that (the swing has its own).
 */
const LEAN = { ease: 0.07, k: 0.011, kBack: 0.016, fwd: 0.26, back: 0.22, pivot: 0.55, drop: 0.06, dropA: 14, antT: 0.16, antLean: 0.13, antDrop: 0.035, swing: 0.5 };
/**
 * Waiting between shots (the standing loops showing: no swing, no reaction, hardly moving) is alive, not a statue.
 * The stances themselves are built in keyposes.ts (the ready stance, standing easy, the server holding the ball);
 * here, how alert the player is (0…1) follows the play: the ball coming at him, his side about to hit next, waiting
 * for the serve or a point over (eased over `alertT` s).
 *  · the stance: when alert the hips go `low` m lower at the net (`lowDeep` of that back by the glass: a little
 *    less crouched back there) and the chest `lean` rad more forward
 *  · the weight from foot to foot: the hips `sway` m to one side and the other every `swayT` s (each player with his
 *    own rhythm), the pelvis rolled `roll` rad with it, and breathing (the chest `breathe` rad every `breatheT` s)
 *  · on the toes back from the net: a bounce `bounce` m at `bounceHz`, when alert and the other side's contact is
 *    still more than `bounceGap` s away (the split step takes over then)
 *  · standing, now and then (every `fidget` s or so, never two at once) one foot is set down again up to `fidgetD` m
 *    off where the clip has it
 *  · a point over: standing easy (the `rest` loop, eased in over `relaxT` s), the weight shifting slower and wider
 *  · the server, before the wind-up: holding the ball in front (the `serveset` loop, eased over `setT` s)
 */
const IDLE = { alertT: 0.35, low: 0.035, lowDeep: 0.25, lean: 0.05, sway: 0.016, swayT: 2.7, roll: 0.04, breathe: 0.015, breatheT: 3.6, bounce: 0.011, bounceHz: 2.2, bounceGap: 0.3, fidget: 2.2, fidgetD: 0.06, relaxT: 0.8, setT: 0.3 };
/**
 * Running to the ball, the arms go on running (the run's swing of the arms) until the swing gets going: at speed
 * (`v0`…`v1` m/s) the swing has only 1 − `most` of the upper body until `from` s before the contact, all of it from
 * `to` s (the preparation, then the stroke); eased over `ease` s.
 */
const RUN_ARMS = { most: 0.6, from: 0.5, to: 0.28, v0: 1.8, v1: 3.2, ease: 0.12 };
/**
 * Nearly still (under `v` m/s) or planted for a swing, a stance more than `over` (m) wider than the clip's is closed by
 * a step (see `legs`; not walking: a walk's double support is long)
 */
const WIDE = { v: 0.5, over: 0.16 };
/**
 * On the move the loops carry the paddle as keyposes.ts builds them (up in front, or short at the waist when
 * running; the AI clips swung it over the head or held it out like a tray). Between points, walking back to his
 * place, a player carries it easy: the paddle arm is taken `relax` of the way to how he holds it standing easy.
 */
const CARRY = { relax: 0.8, bones: ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'] };
/** a foot off the floor that moves fast is kept at least this high (its sole, m) */
const HOVER = 0.04;
/** on the move, a foot lands once the clip has slowed it to this over the ground (m/s), or after this long low (s) */
const LAND_V = 1.2;
const LAND_T = 0.07;
/** sideways, a foot off the floor keeps at least this far to its own side of the other (m, ankles): no crossover */
const CROSS_GAP = 0.14;
/** the most the hips go down for a low ball (m), and the lowest they go (m over the floor) */
const DROP = 0.2;
const HIPS_MIN = 0.6;
/** how far out from the feet a forehand meets the ball without a lunge (m, horizontal; the old forehand clip's reach,
 * which the lunge thresholds were set with, and the racket's 18.5 cm more to the sweet spot than the padel paddle's) */
const REACH = 0.8;
/**
 * The smash's jump for a ball over the head (m): `k` × how far over `from` it is met, at most `max`, in the air as long
 * as a jump that high takes (peak on the contact). 0.11: it was at most 0.3 m (from 2.15 m, 0.6 s in the air whatever
 * the height), and the paddle missed the balls met over 2.6 m by 22–32 cm.
 */
const SMASH_JUMP = { from: 2.15, k: 1.0, max: 0.55 };
/** a low drive's take-back: the paddle this far under the ball (m) */
const LOW_DIP = 0.06;
/**
 * The lob's finish (docs/notas-11-golpes.md): the swing up to the ball is the one the plan calls for (a dink, a drive,
 * a backhand: dressed up as that shot, as a real lob is), and from the contact the paddle goes on lifting the ball: it
 * rises `rise` m over the contact and `fwd` m on towards the net in `t` s, its head turning up (`tip` of the way to
 * pointing up and a little forward), held by the arm for `hold` s before the clip takes it back.
 */
const LOB_FINISH = { rise: 0.95, fwd: 0.35, t: 0.3, tip: 0.7, hold: 0.42 };
/** the torso never tips further than this from upright (rad), whatever the clip and the bend to the ball add up to */
const TILT_MAX = 1.05;
/** the wrist (rad): how far it bends (flexion, extension, deviation) and twists off straight; the forearm takes the
 * twist beyond that (pronation), up to FORE_TWIST more than the clip gives it */
const WRIST_BEND = 1.05;
const WRIST_TWIST = 0.35;
const FORE_TWIST = 1.0;
/** the most an arm bone the IK moves turns in a frame (rad) */
const ARM_STEP = 0.8;
/** the elbow never folds tighter than this (interior angle, rad) */
const ELBOW_MIN = 0.6;
/** the elbow's hinge in the upper arm's frame: the bend axis of every clip (tools/posemetrics.js) */
const ELBOW_HINGE = new THREE.Vector3(0.8862, 0, -0.4632).normalize();
/** the head's forward in its own frame (the model's forward in the ready pose), and how much more than the clip it
 * turns to the ball (rad) */
const HEAD_FWD = new THREE.Vector3(0.4388, 0.7705, 0.4623).normalize();
const LOOK_MAX = 0.8;
/** and never looks up more than this over the horizon (a lob: the eyes do the rest) */
const LOOK_UP = 0.6;

/** a point `k` of the way along the quadratic Bézier a → q → b, into `out` (which may be a, q or b) */
function bezier(a: THREE.Vector3, q: THREE.Vector3, b: THREE.Vector3, k: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - k;
  const x = u * u * a.x + 2 * u * k * q.x + k * k * b.x;
  const y = u * u * a.y + 2 * u * k * q.y + k * k * b.y;
  const z = u * u * a.z + 2 * u * k * q.z + k * k * b.z;
  return out.set(x, y, z);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * How much of the legs a swing has `tc` s from its contact (0…1), whatever the speed: a strike plants the feet from a
 * moment before the contact to a moment after it (moving, they brake into it: see `legs`); a lunge's legs take over as
 * its stride starts, and hold the lunge through the contact.
 */
function footwork(kind: string, tc: number): number {
  if (kind === 'lunge' || kind === 'lunge_left') return smooth(-0.8, -0.5, tc) * (1 - smooth(0.45, 0.75, tc));
  return smooth(-0.32, -0.14, tc) * (1 - smooth(0.16, 0.34, tc));
}

/** Every clip split in two layers (the upper body and the legs, see LOWER), the swings twice (one can fade out while
 * the next fades in). The clips share their tracks: nothing is copied. */
const layerCache = new WeakMap<CharAssets, Record<string, { up: THREE.AnimationClip; lo: THREE.AnimationClip }[]>>();
function layersOf(a: CharAssets) {
  let L = layerCache.get(a);
  if (L) return L;
  L = {};
  for (const [k, c] of Object.entries(a.clips)) {
    const isLo = (t: THREE.KeyframeTrack) => LOWER.has(t.name.slice(0, t.name.indexOf('.')));
    const up = c.tracks.filter((t) => !isLo(t));
    const lo = c.tracks.filter(isLo);
    L[k] = [];
    for (let i = 0; i < (k in SWINGS || k === 'serve_b' ? 2 : 1); i++) L[k].push({ up: new THREE.AnimationClip(`${k}:up${i}`, c.duration, up), lo: new THREE.AnimationClip(`${k}:lo${i}`, c.duration, lo) });
  }
  layerCache.set(a, L);
  return L;
}

// scratch for the IK (never handed out)
const pA = new THREE.Vector3();
const pB = new THREE.Vector3();
const pC = new THREE.Vector3();
const pT = new THREE.Vector3();
const pD = new THREE.Vector3();
const pE = new THREE.Vector3();
const pU = new THREE.Vector3();
const pAx = new THREE.Vector3();
const qW = new THREE.Quaternion();
const qP = new THREE.Quaternion();
const qI = new THREE.Quaternion();
// scratch for the character's own steps
const sTarget = new THREE.Vector3();
const sBack = new THREE.Vector3();
const sFollow = new THREE.Vector3();
const sBall = new THREE.Vector3();
const sA = new THREE.Vector3();
const sB = new THREE.Vector3();
const sD = new THREE.Vector3();
const sE = new THREE.Vector3();
const sS = new THREE.Vector3();
const sH = new THREE.Vector3();
const sAx = new THREE.Vector3();
const sP = new THREE.Vector3();
const sP2 = new THREE.Vector3();
const sQ = new THREE.Quaternion();
const sQ2 = new THREE.Quaternion();
const sQ3 = new THREE.Quaternion();
const sQ4 = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
// scratch for the replays
const qFlat = [0, 0, 0, 1];

/**
 * Where a bone is and how it is turned, read off its world matrix: every change below updates the matrices of what
 * it moves (and the whole body is updated once after the mixer), so they are always current there. (Three's
 * getWorldPosition walks up every parent again on each call: a dozen matrix products, many times a frame.)
 */
const wP = new THREE.Vector3();
const wS = new THREE.Vector3();
function wpos(o: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  return out.setFromMatrixPosition(o.matrixWorld);
}
function wquat(o: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
  o.matrixWorld.decompose(wP, out, wS);
  return out;
}

/**
 * Turns `bone` by the world-space rotation `q` and updates only its own world matrix: its parent's must be up to date,
 * and its children are left for one update of the body afterwards (see applyBody).
 */
function turnWorld(bone: THREE.Object3D, q: THREE.Quaternion) {
  wquat(bone.parent!, qP);
  qI.copy(qP).invert();
  bone.quaternion.premultiply(qP).premultiply(q).premultiply(qI);
  bone.updateWorldMatrix(false, false);
}

/** Turns `bone` by the world-space rotation `q` (keeps its parent as it is). */
function rotateWorld(bone: THREE.Object3D, q: THREE.Quaternion) {
  wquat(bone.parent!, qP);
  qI.copy(qP).invert();
  // local' = P⁻¹ · q · P · local
  bone.quaternion.premultiply(qP).premultiply(q).premultiply(qI);
  bone.updateMatrixWorld(true);
}

/** Splits q (a turn off a bone's rest) into its twist about the bone (its y) and the rest, and limits each. */
function limitTurn(q: THREE.Quaternion, maxBend: number, maxTwist: number) {
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const n = Math.hypot(q.y, q.w);
  const ty = n > 1e-9 ? q.y / n : 0;
  const tw = n > 1e-9 ? q.w / n : 1;
  const tw0 = qW.set(0, ty, 0, tw);
  // bend = q · twist⁻¹
  const bend = qP.copy(q).multiply(qI.copy(tw0).invert());
  const ang = 2 * Math.atan2(ty, tw);
  const t = clamp(ang, -maxTwist, maxTwist);
  const ba = 2 * Math.acos(Math.min(1, Math.abs(bend.w)));
  if (ba > maxBend) bend.slerp(qI.identity(), 1 - maxBend / ba);
  q.copy(bend).multiply(qW.set(0, Math.sin(t / 2), 0, Math.cos(t / 2)));
}

/**
 * Two-bone IK about a hinge (the elbow, the knee): bends the middle joint until the chain reaches `target` (no tighter
 * than `minAngle` inside, never straighter than straight), swings the first bone onto it, then turns the chain about
 * the line to the target so the middle joint goes `poleK` of the way towards `pole` (a world point; at most `poleMax`
 * rad, and not at all while the chain is nearly straight: its bend has no direction to speak of then).
 * The bend: with `hinge` (the joint's own axis in the first bone's frame, as (b−a)×(c−b) for a natural bend: the
 * elbow) the joint turns about it only, and only the natural way; without it (the knee, always bent in the clips),
 * about the plane the animation has (`fallback` if it has none).
 */
const qA = new THREE.Quaternion();
function twoBone(a: THREE.Object3D, b: THREE.Object3D, c: THREE.Object3D, target: THREE.Vector3, minAngle: number, hinge: THREE.Vector3 | null, fallback: THREE.Vector3, pole: THREE.Vector3 | null, poleK: number, poleMax: number) {
  wpos(a, pA);
  wpos(b, pB);
  wpos(c, pC);
  const l1 = pA.distanceTo(pB);
  const l2 = pB.distanceTo(pC);
  pT.copy(target).sub(pA);
  const dMin = Math.sqrt(Math.max(0, l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(minAngle)));
  let d = clamp(pT.length(), Math.max(Math.abs(l1 - l2), dMin) + 1e-4, (l1 + l2) * 0.999);
  if (!hinge) {
    // (the knee: a soft limit near full stretch, where a centimetre more or less flips the knee by many degrees; the
    // foot falls a little short instead of the leg snapping straight and bent again)
    const dS = (l1 + l2) * 0.95;
    const dL = (l1 + l2) * 0.999;
    if (d > dS) d = dS + (dL - dS) * (1 - Math.exp(-(d - dS) / (dL - dS)));
  }
  if (hinge) {
    // u = a→b, lo = b→c; turning lo by θ about the hinge n: u·R(θ)lo = C + A cos θ + B sin θ, and |a→c|² = l1² + l2² + 2 u·R(θ)lo
    const n = pAx.copy(hinge).applyQuaternion(wquat(a, qA)).normalize();
    const u = pD.copy(pB).sub(pA);
    const lo = pE.copy(pC).sub(pB);
    const C = u.dot(n) * lo.dot(n);
    lo.addScaledVector(n, -lo.dot(n)); // lo ⟂ n
    const A = u.dot(lo);
    const nl = pU.copy(n).cross(lo);
    const B = u.dot(nl);
    const R0 = Math.hypot(A, B);
    if (R0 > 1e-6) {
      const phi = Math.atan2(B, A);
      const al = Math.acos(clamp((0.5 * (d * d - l1 * l1 - l2 * l2) - C) / R0, -1, 1));
      // the bend now, in the hinge's plane (+: the natural way), and the two turns that give the length wanted
      u.addScaledVector(n, -u.dot(n));
      const flex0 = Math.atan2(pU.copy(u).cross(lo).dot(n), u.dot(lo));
      const maxFlex = Math.PI - minAngle;
      let best = 0;
      let bestCost = Infinity;
      for (const th of [wrap(phi + al), wrap(phi - al)]) {
        const f = wrap(flex0 + th);
        const cost = (f < -0.03 ? 10 - f : f > maxFlex ? 10 + f - maxFlex : 0) + Math.abs(th) * 0.01;
        if (cost < bestCost) {
          bestCost = cost;
          best = th;
        }
      }
      qW.setFromAxisAngle(n, best);
      rotateWorld(b, qW);
    }
  } else {
    const want = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
    pD.copy(pA).sub(pB);
    pE.copy(pC).sub(pB);
    const now = pD.angleTo(pE);
    pAx.copy(pD).cross(pE);
    if (pAx.lengthSq() < 1e-4 * l1 * l1 * l2 * l2) pAx.copy(fallback);
    pAx.normalize();
    qW.setFromAxisAngle(pAx, want - now);
    rotateWorld(b, qW);
  }
  wpos(c, pC);
  pD.copy(pC).sub(pA).normalize();
  pE.copy(pT).normalize();
  qW.setFromUnitVectors(pD, pE);
  rotateWorld(a, qW);
  if (!pole || poleK <= 0) return;
  pU.copy(pT).normalize();
  wpos(b, pB).sub(pA);
  pB.addScaledVector(pU, -pB.dot(pU));
  pD.copy(pole).sub(pA);
  pD.addScaledVector(pU, -pD.dot(pU));
  const bent = smooth(0.06, 0.15, pB.length() / l1);
  if (bent > 0 && pD.lengthSq() > 1e-6) {
    let ang = pB.angleTo(pD);
    if (pE.copy(pB).cross(pD).dot(pU) < 0) ang = -ang;
    // (a joint far round from the pole is left as animated: turning it would flip it over)
    qW.setFromAxisAngle(pU, clamp(ang * poleK, -poleMax, poleMax) * bent * (1 - smooth(1.6, 2.4, Math.abs(ang))));
    rotateWorld(a, qW);
  }
}

/** What a hit was, from the hit event (CharacterView.onHit): its kind and how hard (0…1). */
export interface ShotInfo {
  kind?: ShotKind;
  power?: number;
}

/** A contact the character is swinging at (before) or just swung through (after). */
interface Contact {
  x: number;
  y: number;
  z: number;
  t: number;
  hand: 1 | -1;
  overhead: boolean;
  serve: boolean;
  /** taken out of the air */
  volley: boolean;
  /**
   * the shot the player means to play, when it is known before the contact (a CPU plan's `kind`, if the simulation
   * gives one; the human's aim): a slice or a drop shot is swung high to low
   */
  kind?: ShotKind | null;
}

/** a swing with a clip, or the procedural backhand (no clip) */
type Swing = SwingKind | 'proc';

/** a clip as its two layers (upper body, legs) */
interface Layer {
  up: THREE.AnimationAction;
  lo: THREE.AnimationAction;
}

/** a one-shot playing over the locomotion: a swing (timed to its contact) or a reaction */
interface Shot {
  kind: Swing | 'cheer' | 'lost';
  /** null: the procedural backhand */
  layer: Layer | null;
  /** weight, and how fast it changes (1/s; < 0 fading out) */
  w: number;
  rate: number;
  /** the contact it is timed to (sim time), and when it is over and fades out */
  key: number;
  end: number;
  react: boolean;
  /** the clip time it started from */
  t0: number;
  /** how much of the upper body the run keeps (see RUN_ARMS), eased (NaN: not set yet) */
  run: number;
}

/**
 * A swing under way is kept (see `commit`): it may still change while its paddle has hardly moved (`quiet` m along
 * the clip's path), and to the other side (forehand ↔ backhand) when the ball is more than `mid` m to that side of
 * the body; until `late` s before the contact.
 */
const COMMIT = { quiet: 0.12, mid: 0.3, late: 0.12 };
/** which side a swing is played on: the forehand and its kin, the backhand and its lunge, the smash, the serve */
const SIDE: Record<Swing, number> = { drive: 1, volley: 1, dink: 1, lunge: 1, slice: 1, backhand: -1, lunge_left: -1, slice_l: -1, volley_l: -1, proc: -1, smash: 2, serve: 3 };

const FREE = 0;
const LOCKED = 1;
const STEP = 2;
/** a foot: where the animation has it, and where it is drawn (locked on the floor, stepping, or free) */
interface Foot {
  up: THREE.Object3D;
  knee: THREE.Object3D;
  ankle: THREE.Object3D;
  toe: THREE.Object3D;
  mode: number;
  /** the ankle as animated (body on the floor), its height over the floor (m), its heading and its speed */
  anim: THREE.Vector3;
  sole: number;
  animYaw: number;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  has: boolean;
  /** how long it has been low without landing (s) */
  lowT: number;
  /** how far the toe is out in front of the ankle (m, flat: shorter as the heel comes up), now and when it was put down */
  toeH: number;
  lockToeH: number;
  /** where it stands while locked, and its heading */
  lock: THREE.Vector3;
  yaw: number;
  /** a step: from, how far through (0…1) and how long */
  from: THREE.Vector3;
  fromYaw: number;
  s: number;
  dur: number;
  /** drawn: the ankle and its heading */
  out: THREE.Vector3;
  outYaw: number;
}

export class CharacterView {
  readonly root = new THREE.Group();
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  /** each clip as layers (the swings twice) */
  private act: Record<string, Layer[]> = {};
  /** the one-shots playing (swings, reactions), the newest last */
  private shots: Shot[] = [];
  /** the swing for the coming contact, or the one being followed through (null once it fades out) */
  private swing: Shot | null = null;
  /** a reaction asked for (played as soon as no swing is on) and the one playing */
  private pending: { kind: 'cheer' | 'lost'; until: number } | null = null;
  private reaction: Shot | null = null;
  private yaw = 0;
  /** how far the legs are turned to set the loops' steps straight (rad, see LOCO_HEADING) */
  private legYaw = 0;
  /** the legs to the swing from the simulation's footwork (0…1, eased), and when it last had the swing to finish */
  private plantK = 0;
  private followT = -9;
  /** the split step: the other side's contact it is timed to, and whether it hops (a still player who saw it coming) */
  private splitAt = -9;
  private splitHop = false;
  private splitK = 1;
  /** the loops in step (Gait): their shared phase (cycles: the left foot lands at each whole one) and each one's pace */
  private phase = 0;
  private pace: Record<string, number> = {};
  private bone: Record<string, THREE.Object3D> = {};
  paddle: THREE.Group;
  /** the middle of the paddle face */
  private tip = new THREE.Object3D();
  private lastHitT = -1;
  private contact: Contact | null = null;
  private lunge = new THREE.Vector2();
  private twist = 0;
  private lean = 0;
  private drop = 0;
  /** the clip's floor under the feet (m, model over the floor), see `legs` */
  private floorY = NaN;
  private feet: Foot[] = [];
  private restHand = new THREE.Quaternion();
  private pdir = new THREE.Vector3();
  private foBase = new THREE.Quaternion();
  /** how far the paddle is turned in line with the arm (0…1), eased; kdT < 0: not reaching (start afresh) */
  private kd = 0;
  private kdT = -1;
  private pole = new THREE.Vector3();
  private lookDir = new THREE.Vector3(0, 0, 1);
  private lookW = 0;
  private still = 1;
  private locoW: Record<string, number> = {};
  private lastRoot = new THREE.Vector3(1e9, 0, 0);
  /** the paddle arm's bones as a player standing easy holds them (see CARRY) */
  private carryRest: Record<string, THREE.Quaternion> = {};
  /** the simulation's velocity last frame and its acceleration, eased (see LEAN); the lean wanted (rad, world x/z) and
   * the hips lowered for it (m) */
  private pv = new THREE.Vector2();
  private acc = new THREE.Vector2();
  private leanV = new THREE.Vector2();
  private leanDrop = 0;
  /** waiting (see IDLE): how much of it shows, how alert, its own clock, and the foot being set down again */
  private idleK = 0;
  private alert = 0;
  private idleT = 0;
  private fidgetAt = 0;
  private fidgetN = 0;
  private fidget: { foot: number; x: number; z: number; t: number; go?: number } | null = null;
  private idleOut = { drop: 0, sway: 0, roll: 0, lean: 0 };
  private relax = 0;
  /** the server holding the ball before the wind-up (0…1, eased; see IDLE) */
  private setK = 0;
  private swayPh = 0;
  /** the pose the mixer left (put back before each update: the mixer only writes the values that change) */
  private base: Float32Array | null = null;
  /** the locomotion speeds (a copy, to tune from the debug API) */
  speeds = { ...LOCO_SPEED };
  /** the kit painted for this player (released on dispose), or the texture recoloured for it alone (disposed) */
  private outfit: Outfit | null = null;
  private ownMap: THREE.Texture | null = null;
  /** who paints this player's kit (the AI-made body's painter, or their own body's) */
  private painter: KitPainter | undefined;
  /** the player's own body (see Person), when they have one and it loaded */
  readonly person: Person | null;

  /** the clip this player serves with (Kit.serve), and when the ball leaves the hand in it (s) */
  private serveClip: string = 'serve';
  readonly tossRelease: number = TOSS.release;

  constructor(
    private a: CharAssets,
    kit: Kit,
    private height = 1.78,
  ) {
    // (?serve=b: everyone serves with SERVE_B; ?serve=a: nobody, to compare)
    const force = (() => {
      try {
        return new URLSearchParams(location.search).get('serve');
      } catch {
        return null;
      }
    })();
    if ((force === 'b' || (kit.serve === 'b' && force !== 'a')) && a.clips.serve_b) {
      this.serveClip = 'serve_b';
      this.tossRelease = SERVE_B.toss;
    }
    // a body of their own (Rocketbox, see Person) with its own painter; without it, the AI-made one
    const own = (kit.model && a.people?.[kit.model]?.painter && a.people[kit.model]) || null;
    this.person = own;
    this.painter = own ? own.painter : a.painter;
    this.model = cloneSkinned(own ? own.template : kit.body?.woman && a.woman ? a.woman : a.template);
    if (kit.body) applyBuild(this.model, kit.body);
    // the kit: painted on the GPU when there is a painter (skin, cloth, hair and shoes each their own), else recoloured
    let look: KitLook | null = null;
    if (kit.outfit && this.painter)
      try {
        look = this.painter.paint(kit.outfit);
        this.outfit = kit.outfit;
      } catch (err) {
        console.warn('kit paint failed:', err);
      }
    if (!look) this.ownMap = kitTexture((own ? own.image : a.image) as HTMLImageElement, kit);
    const material = look ? playerMaterial(look, own?.alpha) : new THREE.MeshStandardMaterial({ map: this.ownMap, roughness: 0.78, metalness: 0, envMapIntensity: 0.9 });
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.material = material;
      }
      if ((o as THREE.Bone).isBone) this.bone[o.name] = o;
    });
    this.model.scale.setScalar(height / 1.7);
    this.root.add(this.model);
    // (the loops' ground speeds as measured on their planted feet, where there are measures)
    for (const k of ['walk', 'run', 'backpedal', 'shuffle'] as const) {
      const g = a.gait[k];
      if (g) this.speeds[k] = g.stride / a.clips[k].duration;
    }
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [k, list] of Object.entries(layersOf(a))) {
      this.act[k] = list.map(({ up, lo }) => {
        const L = { up: this.mixer.clipAction(up), lo: this.mixer.clipAction(lo) };
        if (!LOCO.includes(k))
          for (const ac of [L.up, L.lo]) {
            ac.setLoop(THREE.LoopOnce, 1);
            ac.clampWhenFinished = true;
          }
        return L;
      });
    }
    // the locomotion loops always run; their weights mix them
    for (const k of LOCO)
      for (const L of this.act[k] ?? []) {
        L.up.play();
        L.lo.play();
        L.up.setEffectiveWeight(k === 'ready' ? 1 : 0);
        L.lo.setEffectiveWeight(k === 'ready' ? 1 : 0);
      }
    const B = this.bone;
    if (B.RightHand) this.restHand.copy(B.RightHand.quaternion);
    // the paddle arm standing easy (see CARRY)
    for (const [clip, into] of [[a.clips.rest ?? a.clips.ready, this.carryRest]] as const)
      if (clip)
        for (const n of CARRY.bones) {
          const tr = clip.tracks.find((t) => t.name === `${n}.quaternion`);
          if (!tr || !B[n]) continue;
          const it = (tr as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
          const v = it.evaluate(0.5) as ArrayLike<number>;
          into[n] = new THREE.Quaternion(v[0], v[1], v[2], v[3]);
        }
    for (const s of ['Left', 'Right']) {
      if (!B[`${s}UpLeg`] || !B[`${s}Leg`] || !B[`${s}Foot`] || !B[`${s}ToeBase`]) continue;
      const v = () => new THREE.Vector3();
      this.feet.push({ up: B[`${s}UpLeg`], knee: B[`${s}Leg`], ankle: B[`${s}Foot`], toe: B[`${s}ToeBase`], mode: FREE, lowT: 0, toeH: 0, lockToeH: 0, anim: v(), sole: 0, animYaw: 0, prev: v(), vel: v(), has: false, lock: v(), yaw: 0, from: v(), fromYaw: 0, s: 0, dur: 0.2, out: v(), outYaw: 0 });
    }
    this.paddle = paddleMesh(kit.paddle, kit.paddleEdge, kit.paddleLook);
    this.tip.position.set(0, RACKET.face, 0);
    this.paddle.add(this.tip);
    const hand = B.RightHand;
    if (hand) {
      hand.add(this.paddle);
      // the bones are in centimetres under a 0.01 armature: undo that scale for the paddle
      this.paddle.scale.setScalar(100 / (height / 1.7));
      this.setPaddlePose(PADDLE_POSE[0], PADDLE_POSE[1], PADDLE_POSE[2], PADDLE_POSE[3], PADDLE_POSE[4], PADDLE_POSE[5]);
    }
  }

  /** Paddle pose in the hand (tuned by eye). */
  setPaddlePose(rx: number, ry: number, rz: number, ox = 0, oy = 0, oz = 0) {
    this.paddle.rotation.set(rx, ry, rz);
    this.paddle.position.set(ox, oy, oz);
  }

  /**
   * Where the ball sits in the free hand before a serve and through the toss: held in the fingers, a hand's breadth out
   * from the wrist (the hand bone is the wrist), over the palm (the view puts the ball 2 cm under this point).
   */
  ballInHand(out: THREE.Vector3): THREE.Vector3 | null {
    const h = this.bone.LeftHand;
    if (!h) return null;
    const e = h.matrixWorld.elements;
    const s = this.height / 1.78;
    sP.set(e[4], e[5], e[6]).normalize();
    return wpos(h, out).addScaledVector(sP, 0.075 * s).add(sP2.set(0, 0.045 * s, 0));
  }

  /**
   * How much the drawn ball should be pulled onto the paddle face at time t (0 … 1), and where the face is: hides the
   * last few centimetres the arm cannot make up, just around the contact (the paddle swings through the ball and on
   * along its path: after the contact the ball leaves it).
   */
  paddlePull(t: number, out: THREE.Vector3): number {
    const c = this.contact;
    if (!c) return 0;
    const e = t - c.t;
    if (e < -0.08 || e > 0.03) return 0;
    wpos(this.tip, out);
    const k = 1 - Math.abs(e) / (e < 0 ? 0.08 : 0.03);
    return k * k;
  }

  /**
   * The ball left this player's racket at (x, y, z): keeps the contact for the follow-through, and what the shot was
   * (the hit event's kind and `power`: a slice's finish, how fast the follow-through goes).
   */
  onHit(x: number, y: number, z: number, t: number, hand: 1 | -1, shot?: ShotInfo) {
    const c = this.contact;
    this.contact = { x, y, z, t, hand, overhead: c?.overhead ?? y > 1.75, serve: c?.serve ?? false, volley: c?.volley ?? false, kind: shot?.kind ?? c?.kind };
    this.shot = { t, kind: shot?.kind ?? null, power: clamp(shot?.power ?? 0.5, 0, 1) };
  }
  /** what the last hit was (see onHit) */
  private shot: { t: number; kind: ShotKind | null; power: number } = { t: -9, kind: null, power: 0.5 };
  /**
   * The human's shot while aiming (the view sets it from its aim, null otherwise): a slice or a drop shot aimed is
   * swung high to low from the take-back (the CPU's plan may say it too: Plan.kind).
   */
  aimKind: ShotKind | null = null;
  /** the last hit, when it is the one at contact time t */
  private shotAt(t: number) {
    return Math.abs(this.shot.t - t) < 0.05 ? this.shot : null;
  }

  private has(k: string): boolean {
    return !!this.act[k]?.length;
  }

  /**
   * The swing clip for a contact (what the shot will be is only known for sure at the contact: guessed from the plan,
   * or told by it: Contact.kind).
   */
  private pick(c: Contact, p: Player, m: Match): Swing {
    const has = (k: SwingKind) => this.has(k);
    if (c.serve) return has('serve') ? 'serve' : 'drive';
    if (c.overhead || c.y > 1.75) return has('smash') ? 'smash' : 'drive';
    // a slice or a drop shot the player means (the plan or the aim says so): high to low, with the clip of its side
    // (not out of the air at the net: a volley is a volley)
    const sliced = !!c.kind && SLICED.has(c.kind) && !(c.volley && Math.abs(c.z) < AT_NET);
    // a ball beyond the arm and the paddle: the lunge (a little hysteresis so a plan that wobbles does not flip it), to
    // the right or, on the backhand side, to the left
    const gap = this.gap(c, p, m);
    const now = this.swing && Math.abs(this.swing.key - c.t) < 0.1 ? this.swing.kind : null;
    if (c.hand === -1) {
      // (lunge_left_v2 is a deep lunge to a ball at the knee: for a higher one, the backhand, the body going out to it)
      if (has('lunge_left') && c.y < (now === 'lunge_left' ? 1.05 : 0.95) && gap > (now === 'lunge_left' ? 0.3 : 0.42)) return 'lunge_left';
      // (a slice on the backhand: one-handed, the racket back by the left shoulder; out of the air, the one-handed
      // backhand volley, compact)
      if (sliced && has('slice_l')) return 'slice_l';
      const vl = now === 'volley_l' ? 1 : 0;
      if (has('volley_l') && c.volley && gap < 0.25 + 0.1 * vl && Math.abs(c.z) < AT_NET + 2.2 + 0.2 * vl) return 'volley_l';
      return has('backhand') ? 'backhand' : 'proc';
    }
    if (has('lunge') && c.y < 1.3 && gap > (now === 'lunge' ? 0.3 : 0.42)) return 'lunge';
    if (sliced && has('slice')) return 'slice';
    // a low ball taken up at the net: a chiquita or a soft volley at the feet (compact, crouched; hysteresis too)
    const d = now === 'dink' ? 1 : 0;
    if (has('dink') && gap < 0.2 + 0.1 * d && c.y < 0.72 + 0.08 * d && Math.abs(c.z) < AT_NET - 1.3 + 0.2 * d && Math.abs(p.z) < AT_NET - 0.9 + 0.2 * d) return 'dink';
    // out of the air: a volley (a short punch in front of the chest), at the net or on the way in (an approach volley
    // round the service line is as compact)
    const v = now === 'volley' ? 1 : 0;
    if (has('volley') && c.volley && gap < 0.25 + 0.1 * v && Math.abs(c.z) < AT_NET + 2.2 + 0.2 * v) return 'volley';
    // the rest: the drive (the topspin forehand, low to high)
    return 'drive';
  }

  /**
   * The swing to play for contact c, given the one the plan now calls for (`want`). A swing under way is kept, not
   * swapped for another one mid-way: the plan is refined as the ball comes (a lunge becomes a drive, a backhand a
   * dink) and a swap shows as the arm and the body jumping from one swing to the other (84 of 950 swings in 0.6). The
   * lunge offset and the arm take the swing on to the ball instead. It may still change while its paddle has hardly
   * moved (COMMIT.quiet along the clip's path), and to the other side of the body when the ball really is there.
   */
  private commit(want: Swing, c: Contact, tc: number): Swing {
    const sw = this.swing;
    if (!sw || sw.react || sw.rate < 0 || sw.kind === want || Math.abs(sw.key - c.t) > 0.35) return want;
    const cur = sw.kind as Swing;
    // (still in its quiet lead-in: the paddle has hardly moved along the clip's path)
    const path = cur !== 'proc' ? this.a.path[cur] : undefined;
    if (path && sw.layer) {
      const n = path.length / 3 - 1;
      const i0 = Math.min(n, Math.round(sw.t0 * 60));
      const i1 = Math.min(n, Math.round(sw.layer.up.time * 60));
      const moved = Math.hypot(path[i1 * 3] - path[i0 * 3], path[i1 * 3 + 1] - path[i0 * 3 + 1], path[i1 * 3 + 2] - path[i0 * 3 + 2]) * (this.height / 1.7);
      // (quiet for its own path: a short punch, the volley, moves the paddle little all along; it is under way once a
      // third of the way to its contact)
      const k = this.a.contact[cur as SwingKind] ?? 0.5;
      const far = Math.hypot(path[Math.min(n, Math.round(k * 60)) * 3] - path[i0 * 3], path[Math.min(n, Math.round(k * 60)) * 3 + 1] - path[i0 * 3 + 1], path[Math.min(n, Math.round(k * 60)) * 3 + 2] - path[i0 * 3 + 2]) * (this.height / 1.7);
      if (moved < Math.min(COMMIT.quiet, far / 3)) return want;
    }
    if (SIDE[cur] === SIDE[want]) return cur;
    // (the other side: only for a ball that is really out there; one near the middle is played with the swing on)
    const rx = -Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);
    const lat = (c.x - this.root.position.x) * rx + (c.z - this.root.position.z) * rz;
    if (SIDE[cur] === 1 && SIDE[want] === -1 && lat > -COMMIT.mid) return cur;
    if (SIDE[cur] === -1 && SIDE[want] === 1 && lat < COMMIT.mid) return cur;
    void tc;
    return want;
  }

  /**
   * How far the ball will be beyond the normal forehand contact (REACH), from where the feet will be at the contact
   * (the CPU runs to the planned spot as far as it can get in time; a thumb player stays where they are).
   */
  private gap(c: Contact, p: Player, m: Match): number {
    return this.gapTo(c.x, c.z, c.t, p, m);
  }
  private gapTo(x: number, z: number, t: number, p: Player, m: Match): number {
    const pl = p.plan;
    let fx = p.x;
    let fz = p.z;
    if (pl) {
      // (they start moving after their reaction time, and lose a little getting going)
      const d = Math.hypot(pl.fx - p.x, pl.fz - p.z);
      const k = d > 1e-3 ? Math.min(1, (p.speed * Math.max(0, t - Math.max(m.t, p.moveFrom) - 0.1)) / d) : 0;
      fx += (pl.fx - p.x) * k;
      fz += (pl.fz - p.z) * k;
    }
    return Math.hypot(x - fx, z - fz) - REACH * (this.height / 1.78);
  }

  /** How much a ball is under where a swing clip meets it (0…1): how much its path is made low to high (see `lift`). */
  private lowness(k: SwingKind, c: Contact): number {
    const r = this.a.reach[k];
    return r ? smooth(0, 0.3, r.y * (this.height / 1.7) - c.y) : 0;
  }

  /** How far out from the feet a swing clip meets the ball (m, horizontal). */
  private reachOf(k: Swing): number {
    if (k === 'proc') return 0.25;
    const fixed = SWINGS[k as SwingKind]?.reach;
    if (fixed !== undefined) return fixed * (this.height / 1.7);
    const r = this.a.reach[k];
    return r ? Math.hypot(r.x, r.z) * (this.height / 1.7) : 0.6;
  }

  update(dt: number, m: Match, p: Player, gate: boolean, ball: { x: number; y: number; z: number } | null) {
    this.restore();
    // (the human's player: the circle's contact while he is still getting to it; his plan only exists once the ball is
    // within reach, sometimes in the very step of the contact, and a last-moment stretch was played with no swing on:
    // the paddle 0.9 m off the ball. Now it is under way in time, and a stretch that falls short shows as one)
    // (not in the frame of his own hit: the plan is gone and the circle is still the one for later, which took the
    // paddle off the ball just played, up to 1.3 m)
    const mt = (m as Partial<Match>).targetFor;
    const justHit = !!p.lastHit && m.t - p.lastHit.t < 0.25;
    const plan = p.plan ?? (p.human && !justHit && typeof mt === 'function' ? mt.call(m, p.id) : null);
    const wu = m.windup;
    // the swing in hand: the serve being wound up, the coming contact (when the player will swing) or the one just played
    if (wu && wu.pid === p.id) {
      if (!this.contact || this.contact.t !== wu.at) this.contact = { x: wu.x, y: wu.y, z: wu.z, t: wu.at, hand: 1, overhead: false, serve: true, volley: false, kind: 'serve' };
    } else if (plan && gate && (plan.reach || this.gapTo(plan.bx, plan.bz, plan.t, p, m) < 1.15)) {
      // (a CPU plan it may not get to in time: it runs anyway and may still reach it with a lunge, so it swings
      // when it will be close)
      // (the shot meant, when the plan says it or the human is aiming one: a slice is swung high to low)
      const meant = ((plan as { kind?: ShotKind }).kind ?? (p.human ? this.aimKind : null)) || null;
      if (!this.contact || this.contact.t !== plan.t || this.contact.x !== plan.bx) this.contact = { x: plan.bx, y: plan.by, z: plan.bz, t: plan.t, hand: plan.hand, overhead: plan.overhead, serve: false, volley: plan.volley, kind: meant };
      else if (meant && this.contact.t > m.t) this.contact.kind = meant;
    } else if (this.contact && this.contact.t > m.t + 1e-3 && (!p.lastHit || p.lastHit.t !== this.contact.t)) this.contact = null; // no swing after all
    if (this.contact && m.t - this.contact.t > 0.6) this.contact = null;
    const c = this.contact;
    const tc = c ? m.t - c.t : 0; // < 0 before the contact
    // (a lob just played off this contact: its finish, LOB_FINISH)
    if (c && tc >= 0 && p.lastHit?.kind === 'lob' && Math.abs(p.lastHit.t - c.t) < 0.05) this.lobT = c.t;

    // which swing: the one playing for this contact, or the one this contact calls for
    // (one under way is kept: see commit)
    const want: Swing | null = c ? (tc >= 0 && this.swing && Math.abs(this.swing.key - c.t) < 0.1 ? (this.swing.kind as Swing) : this.pick(c, p, m)) : null;
    const kind: Swing | null = c && want && tc < 0 ? this.commit(want, c, tc) : want;
    const proc = kind === 'proc';
    // a slice: the shot meant (or, once hit, played) is a slice or a drop shot: the racket high to low through the ball
    // (on a drive's or a backhand's swing too, when it was only known at the contact: SLICE)
    const hitKind = c && p.lastHit && Math.abs(p.lastHit.t - c.t) < 0.05 ? p.lastHit.kind : null;
    const sliced = !!c && !!kind && kind !== 'smash' && kind !== 'serve' && kind !== 'volley' && kind !== 'volley_l' && kind !== 'dink' && SLICED.has((tc >= 0 ? hitKind : null) ?? c.kind ?? 'drive');
    if (kind === 'slice' || kind === 'slice_l') this.sliceT = c!.t;
    else if (sliced && tc >= 0) this.sliceT = c!.t;
    // a two-handed backhand: the free hand on the handle (see TWO_HANDS)
    this.twoK = kind === 'backhand' && c ? 1 - smooth(TWO_HANDS.let, TWO_HANDS.let + TWO_HANDS.letGo, tc) : Math.max(0, this.twoK - dt / TWO_HANDS.letGo);

    // a lunge: the body goes out to a ball beyond the arm and the paddle (the feet step after it: see `legs`)
    let lx = 0;
    let lz = 0;
    if (c && kind) {
      const dx = c.x - p.x;
      const dz = c.z - p.z;
      const dh = Math.hypot(dx, dz);
      const env = 1 - smooth(0.04, 0.32, Math.abs(tc));
      // (a ball over the head, out of reach standing: the body goes under it, so the arm reaches up for it)
      const reach = kind === 'smash' && c.y > (SWINGS.smash.jumpFrom ?? SMASH_JUMP.from) ? Math.min(this.reachOf(kind), OVER.under) : this.reachOf(kind);
      // (and a ball jammed into the body: a step back out of its way, so the arm has room for the racket, 18.5 cm longer
      // than the padel paddle: the step is a little bigger than the paddle's, 0.75 of the reach, at most 35 cm)
      const away = kind === 'smash' || kind === 'serve' || kind === 'proc' ? 0 : Math.min(0.35, Math.max(0, 0.75 * reach - dh));
      const k = ((Math.min(0.75, Math.max(0, dh - reach)) - away) * env) / Math.max(dh, 0.05);
      lx = dx * k;
      lz = dz * k;
    }
    {
      // (eased, and never faster than a quick step)
      const e = 1 - Math.exp(-14 * dt);
      let ex = (lx - this.lunge.x) * e;
      let ez = (lz - this.lunge.y) * e;
      const el = Math.hypot(ex, ez);
      const lim = 2.2 * dt;
      if (el > lim) {
        ex *= lim / el;
        ez *= lim / el;
      }
      this.lunge.x += ex;
      this.lunge.y += ez;
    }
    // a ball above the reach of the racket: a jump into the smash (crouch, take-off, landing), in the air as long as a
    // jump that high takes (peak on the contact); the serve's jump into a ball met high (SERVE_JUMP)
    const jumpFrom = SWINGS.smash.jumpFrom ?? SMASH_JUMP.from;
    let jumpH = 0;
    if (c && kind === 'smash') jumpH = Math.min(SWINGS.smash.jumpMax ?? SMASH_JUMP.max, Math.max(0, c.y - jumpFrom) * SMASH_JUMP.k);
    if (c && kind === 'serve') jumpH = Math.min(SERVE_JUMP.max, Math.max(0, c.y - SERVE_JUMP.from * (this.height / 1.78)) * SERVE_JUMP.k);
    // (held from the take-off to the landing: a refined plan must not change the jump in the air)
    if (c && (kind === 'smash' || kind === 'serve')) {
      if (this.jump.t === c.t && tc > -this.jump.air) jumpH = this.jump.h;
      else this.jump = { t: c.t, h: jumpH, air: jumpH > 0 ? Math.sqrt((2 * jumpH) / 9.81) : 0 };
    }
    const hop = jumpH > 0 ? jumpH * Math.max(0, 1 - (tc / Math.sqrt((2 * jumpH) / 9.81)) ** 2) : 0;
    // the footwork the simulation is doing (match.stance: one source of truth for the legs): the split step as the
    // other side hits, braking into the shot ('plant'), finishing it ('follow'). (A match without it, a test stand-in,
    // gets the legs timed to the contact as before.)
    const stanceOf = (m as Partial<Match>).stance;
    const st = stanceOf ? stanceOf.call(m, p.id) : undefined;
    if (st === 'follow') this.followT = m.t;
    const afterFollow = st === 'follow' ? 0 : m.t - this.followT;
    const sp = Math.hypot(p.vx, p.vz);
    const split = this.splitStep(dt, m, p, st, sp);
    this.root.position.set(p.x + this.lunge.x, Math.max(hop, split.hop), p.z + this.lunge.y);
    const jump = Math.hypot(this.root.position.x - this.lastRoot.x, this.root.position.z - this.lastRoot.z) > 0.5;
    this.lastRoot.copy(this.root.position);
    this.bodyLean(dt, m, p, sp, jump);

    // face the net (the model looks along +z), turned a little towards the ball; on a long run across the court the
    // body turns to run, and squares up again for the swing
    const net = p.side === 1 ? Math.PI : 0;
    let yaw = net;
    if (ball) yaw += -p.side * Math.atan2(ball.x - p.x, 6) * 0.35;
    if (sp > 1.6 && !this.reaction) {
      const rel = wrap(Math.atan2(p.vx, p.vz) - net);
      // (a long way to go, to the ball or back to his spot: he turns and runs sooner; a shuffle is for a step or two,
      // not 4 m/s across the court)
      const tx = p.plan ? p.plan.fx : p.homeX;
      const tz = p.plan ? p.plan.fz : p.homeZ;
      const far = p.plan || !p.human ? smooth(1.5, 3.0, Math.hypot(tx - p.x, tz - p.z)) : 0;
      // (squared up from half a second before a contact until the swing is finished: the push-off comes first)
      const toC = c && tc < 0 ? -tc : st !== undefined ? smooth(0, 0.22, afterFollow) * 9 : c ? smooth(0.2, 0.45, tc) * 9 : 9;
      // (a diagonal too, forwards or back: at speed a player runs, he does not shuffle and run at once; straight back,
      // he backpedals. Running back from the net for a lob, he turns away from it, up to 135°)
      const a = Math.abs(rel);
      const k = Math.max(smooth(2.2, 3.4, sp), smooth(1.6, 2.4, sp) * far) * smooth(0.35, 0.8, toC) * smooth(0.25, 0.6, a) * (1 - smooth(2.55, 2.9, a));
      const most = 1.35 + smooth(3.0, 4.0, sp);
      yaw += clamp(rel, -most, most) * k;
    }
    // around a swing the body turns to the ball, so the clip's swing meets it where it meets its own contact (in front
    // for a drive, out to the side for a lunge): the arm then only finishes the job
    if (c && kind && kind !== 'proc' && kind !== 'smash' && kind !== 'serve') {
      const r = this.a.reach[kind];
      const dx = c.x - p.x;
      const dz = c.z - p.z;
      const aim = r ? Math.atan2(r.x, r.z) : 0;
      if (r && Math.hypot(r.x, r.z) > 0.15 && Math.hypot(dx, dz) > 0.2) {
        const k = 1 - smooth(0.2, 0.6, Math.abs(tc));
        yaw += clamp(wrap(Math.atan2(dx, dz) - aim - yaw), -1, 1) * k;
      }
    }
    if (jump) this.yaw = yaw;
    this.yaw += wrap(yaw - this.yaw) * (1 - Math.exp(-7 * dt));
    this.root.rotation.y = this.yaw;

    // swings: the clip timed so its contact frame lands on the contact (a late start shortens the wind-up)
    if (c && kind && tc < 0) {
      // (how long before the contact it starts: the wind-up, at no less than half speed from the clip's `start`)
      const k = proc ? 0.4 : this.a.contact[kind] ?? 0.8;
      const lead = proc ? k : Math.min(SWINGS[kind].lead ?? k, (k - (SWINGS[kind].start ?? 0)) / 0.55);
      const sw = this.swing;
      const mine = sw && Math.abs(sw.key - c.t) <= 0.08;
      if (!mine) {
        if (sw && sw.kind === kind && sw.rate >= 0 && Math.abs(sw.key - c.t) < 0.35 && sw.key > m.t) this.retime(sw, c.t); // the plan was refined: the same swing, retimed (no restart)
        else if (tc >= -lead) this.startSwing(kind, c.t, tc);
      } else if (sw!.kind !== kind && tc < -COMMIT.late) this.startSwing(kind, c.t, tc); // the plan changed (see commit): crossfade
      else this.retime(sw!, c.t);
    }
    if (p.lastHit && p.lastHit.t !== this.lastHitT) {
      // a hit with no swing on (the plan came too late, or the swing was not expected): play its follow-through
      this.lastHitT = p.lastHit.t;
      const h = p.lastHit;
      if (!this.swing || Math.abs(this.swing.key - h.t) > 0.08) {
        const has = (k: SwingKind) => this.has(k);
        const k: Swing =
          c && kind && Math.abs(c.t - h.t) < 0.05
            ? kind
            : h.kind === 'serve' && has('serve')
              ? 'serve'
              : SLICED.has(h.kind) && has(h.hand === -1 ? 'slice_l' : 'slice')
                ? h.hand === -1
                  ? 'slice_l'
                  : 'slice'
                : h.overhead && has('smash')
                ? 'smash'
                : h.hand === -1
                  ? has('backhand')
                    ? 'backhand'
                    : 'proc'
                  : h.kind === 'dink' && has('dink')
                    ? 'dink'
                    : 'drive';
        if (this.has(k) || k === 'proc') this.startSwing(k, h.t, m.t - h.t);
      }
    }
    if (this.swing && m.t > this.swing.end) {
      this.fadeOut(this.swing, 0.3);
      this.swing = null;
    }
    // reactions (after a point), never over a swing
    const pend = this.pending;
    if (pend) {
      if (m.t > pend.until || m.phase === 'serve' || m.phase === 'rally') this.pending = null;
      else if (!this.swing) {
        this.pending = null;
        const L = this.act[pend.kind]?.[0];
        if (L) {
          const old = this.shots.find((s) => s.layer === L);
          if (old) this.dropShot(old);
          for (const s of this.shots) this.fadeOut(s, 0.3);
          L.up.reset().play();
          L.lo.reset().play();
          this.reaction = { kind: pend.kind, layer: L, w: 0, rate: 1 / 0.3, key: m.t, end: m.t + REACT_LEN[pend.kind], react: true, t0: 0, run: 0 };
          this.shots.push(this.reaction);
        }
      }
    }
    if (this.reaction && (m.t > this.reaction.end || m.phase === 'serve' || m.phase === 'rally' || this.swing)) {
      this.fadeOut(this.reaction, m.phase === 'over' ? 0.6 : 0.35);
      this.reaction = null;
    }

    // the one-shots: their weights, and their clocks (a swing reaches its contact frame right on the contact)
    // (how still the player is, eased: the sim gets a player from a stop to full speed in a fifth of a second)
    this.still += (1 - smooth(0.35, 1.4, sp) - this.still) * (1 - Math.exp(-8 * dt));
    const still = this.still;
    // (the swing's legs as the simulation plants the feet and while it finishes the swing, eased in and out; a split
    // step is planted feet too: in a quick exchange, with the player's own contact already close, the swing takes
    // the legs as it lands)
    if (st !== undefined) {
      const near = !!this.swing && this.swing.key - m.t < 0.3 && this.swing.key > m.t;
      const want = st === 'plant' || st === 'follow' || (st === 'split' && near) ? 1 : 0;
      this.plantK = clamp(this.plantK + clamp(want - this.plantK, -dt / PLANT_OUT, dt / PLANT_IN), 0, 1);
    }
    let W = 0;
    let WL = 0;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.w = clamp(s.w + s.rate * dt, 0, 1);
      if (s.rate < 0 && s.w <= 0) {
        this.dropShot(s);
        continue;
      }
      if (!s.layer) continue;
      let ts = 1;
      if (s.rate < 0) ts = s.react ? 0.5 : 0.25; // fading out: it slows down where it is (the smash turns round after)
      else if (!s.react) {
        const left = s.key - m.t;
        if (left > 1 / 120) ts = clamp(((this.a.contact[s.kind as SwingKind] ?? 0.8) - s.layer.up.time) / left, 0.5, 2);
        // (from the contact: as fast as the shot was hard, see POWER)
        else ts = this.finishPace(s.key);
      }
      s.layer.up.timeScale = s.layer.lo.timeScale = ts;
      // the legs: the swing's own footwork as the player stops, and around the contact whatever the speed: the strike
      // plants the feet as the simulation brakes into it and until the swing is finished (without the simulation's
      // footwork, timed to the contact); the lunge's stride from the moment it steps out
      const lungeK = s.kind === 'lunge' || s.kind === 'lunge_left';
      const fw = st === undefined || lungeK ? footwork(s.kind, m.t - s.key) : Math.abs(m.t - s.key) < 0.6 ? this.plantK : 0;
      let plant = (s.react ? still : Math.max(still, fw)) * (s.react || s.kind === 'proc' ? 1 : SWINGS[s.kind as SwingKind].legs ?? 1);
      // (running to the ball, the arms go on running until the swing gets going: see RUN_ARMS)
      // (eased: a burst of speed or a contact put back must not snap the arms from one pose to the other)
      const running = s.react || s.rate < 0 || s.kind === 'proc' ? 0 : RUN_ARMS.most * smooth(RUN_ARMS.v0, RUN_ARMS.v1, sp) * (1 - smooth(-RUN_ARMS.from, -RUN_ARMS.to, m.t - s.key));
      s.run = Number.isNaN(s.run) ? running : s.run + (running - s.run) * (1 - Math.exp(-dt / RUN_ARMS.ease));
      const up = s.w * (s.react || s.kind === 'proc' ? 1 : SWINGS[s.kind as SwingKind].upper ?? 1) * (1 - s.run);
      s.layer.up.setEffectiveWeight(up);
      s.layer.lo.setEffectiveWeight(s.w * plant);
      W += up;
      WL += s.w * plant;
    }

    // locomotion: ready when still; shuffle sideways; walk, then run, forwards; backpedal backwards. Each loop plays
    // at the speed that matches the feet to the ground.
    const sc = this.height / 1.7;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const fwd = p.vx * fx + p.vz * fz;
    const lat = p.vx * -fz + p.vz * fx; // + = towards the model's right (it faces +z, so its right is −x)
    const move = smooth(0.05, 0.9, sp);
    const s2 = Math.max(sp * sp, 1e-6);
    const kF = fwd > 0 ? (fwd * fwd) / s2 : 0;
    const kB = fwd < 0 ? (fwd * fwd) / s2 : 0;
    const kL = (lat * lat) / s2;
    // (not the sprint straight out of a swing: the first steps once the swing is finished are a push-off, then the run)
    const runK = this.has('run') ? smooth(2.1, 2.8, fwd) * (st !== undefined ? smooth(0, 0.2, afterFollow) : c && tc >= 0 ? smooth(0.22, 0.45, tc) : 1) : 0;
    const backK = this.has('backpedal') ? kB : 0;
    const Lu = Math.max(0, 1 - W);
    const Ll = Math.max(0, 1 - WL);
    // (the weights eased too: a crossfade of a tenth of a second between the loops)
    const e = 1 - Math.exp(-12 * dt);
    const set = (k: string, want: number, ts: number) => {
      const L = this.act[k]?.[0];
      if (!L) return;
      const w0 = this.locoW[k] ?? (k === 'ready' ? 1 : 0);
      const w = w0 + (want - w0) * e;
      this.locoW[k] = w;
      L.up.setEffectiveWeight(w * Lu);
      L.lo.setEffectiveWeight(w * Ll);
      // (a loop with its steps measured plays in step with the others, its clock set below; one played backwards, a
      // stand-in for a missing clip, by the clock)
      if (this.a.gait[k] && ts >= 0) {
        this.pace[k] = ts;
        L.up.timeScale = L.lo.timeScale = 0;
      } else {
        delete this.pace[k];
        L.up.timeScale = L.lo.timeScale = ts;
      }
    };
    const wRun = move * kF * runK;
    // standing: the ready stance, standing easy between points, or the server holding the ball (see IDLE)
    {
      const over = m.phase === 'dead' || m.phase === 'over' ? 1 : 0;
      this.relax += (over - this.relax) * (1 - Math.exp(-dt / IDLE.relaxT));
      const serving = m.phase === 'serve' && !m.windup && typeof m.server === 'function' && m.server().id === p.id ? 1 : 0;
      this.setK = jump ? serving : this.setK + (serving - this.setK) * (1 - Math.exp(-dt / IDLE.setT));
      const ss = this.has('serveset') ? this.setK : 0;
      const rr = this.has('rest') ? this.relax : 0;
      set('ready', (1 - move) * (1 - ss) * (1 - rr), 1);
      set('rest', (1 - move) * (1 - ss) * rr, 1);
      set('serveset', (1 - move) * ss, 1);
    }
    // (the shuffle clip steps to the model's right; to the left, its legs mirrored; without those, played backwards)
    const shTs = clamp(Math.abs(lat) / (this.speeds.shuffle * sc), 0.45, 2.6);
    if (this.has('shuffle_l')) {
      const right = smooth(-0.15, 0.15, lat / Math.max(sp, 1e-3));
      set('shuffle', move * kL * right, shTs);
      set('shuffle_l', move * kL * (1 - right), shTs);
    } else set('shuffle', move * kL, (lat >= 0 ? 1 : -1) * shTs);
    set('walk', move * (kF * (1 - runK) + kB - backK), (fwd >= 0 ? 1 : -1) * clamp(Math.abs(fwd) / (this.speeds.walk * sc), 0.7, 2.2));
    set('run', wRun, clamp(fwd / (this.speeds.run * sc), 0.65, 1.4));
    set('backpedal', move * backK, clamp(-fwd / (this.speeds.backpedal * sc), 0.5, 2.8));
    // the loops in step: one phase for all of them (the left foot lands at each whole cycle in every loop), going at
    // the pace of each loop weighed by how much of it plays; each loop's clock is read off its ground travel (Gait)
    {
      let rate = 0;
      let wsum = 0;
      for (const k in this.pace) {
        const g = this.a.gait[k]!;
        const w = this.locoW[k] ?? 0;
        rate += (w * this.pace[k] * g.cycles) / this.a.clips[k].duration;
        wsum += w;
      }
      if (wsum > 1e-3) this.phase = (this.phase + (rate / wsum) * dt) % 12;
      for (const k in this.pace) {
        const g = this.a.gait[k]!;
        const L = this.act[k][0];
        L.up.time = L.lo.time = warpAt(g, g.left + this.phase / g.cycles);
      }
    }
    // waiting: alive (see IDLE)
    this.idleLife(dt, m, p, sp, W, st, jump);
    // (the steps of the forward and backward loops set straight: see LOCO_HEADING)
    let legYaw = 0;
    for (const k of ['walk', 'run', 'backpedal']) {
      const g = this.a.gait[k];
      const h = g ? (k === 'backpedal' ? wrap(g.heading - Math.PI) : g.heading) : (LOCO_HEADING[k] ?? 0);
      legYaw -= h * (this.locoW[k] ?? 0) * Ll;
    }
    this.legYaw = legYaw;
    this.model.rotation.y = 0;
    this.mixer.update(dt);
    this.keep();
    // (between points, walking back, the paddle is carried easy: see CARRY)
    {
      const k = CARRY.relax * this.relax * ((this.locoW.run ?? 0) + (this.locoW.walk ?? 0) + (this.locoW.backpedal ?? 0) + (this.locoW.shuffle ?? 0) + (this.locoW.shuffle_l ?? 0)) * Lu;
      if (k > 1e-3)
        for (const n of CARRY.bones) {
          const q = this.carryRest[n];
          if (q) this.bone[n].quaternion.slerp(q, Math.min(1, k));
        }
    }
    this.root.updateMatrixWorld(true);
    // the loops' steps set straight: the legs turned under the chest (see LOCO_HEADING)
    const hipsB = this.bone.Hips;
    const spineB = this.bone.Spine;
    if (hipsB && spineB && Math.abs(legYaw) > 1e-4) {
      rotateWorld(hipsB, sQ.setFromAxisAngle(Y, legYaw));
      rotateWorld(spineB, sQ.setFromAxisAngle(Y, -legYaw));
    }
    // the body tipped into the push of the feet (see LEAN), less during a swing; and waiting, alive (see IDLE)
    // (none right at the contact: the arm needs the shoulder where the swing has it, a volley met on the run missed by
    // 30–40 cm leaning back)
    const nearC = c ? smooth(0.1, 0.3, Math.abs(tc)) : 1;
    this.applyBody(1 - (1 - LEAN.swing * nearC) * Math.min(1, W));

    // on top of the clips: how low the hips go and how far the back bends for a low or wide ball, the feet on the
    // floor, the back, the paddle to the ball, the head to the ball
    let w = 0;
    let dropWant = 0;
    let leanWant = 0;
    if (c && kind) {
      const def = proc ? null : SWINGS[kind as SwingKind];
      // (the IK's window: a low drive's take-back is the IK's too, from `pre` before the contact)
      const lowK = def && def.lift ? this.lowness(kind as SwingKind, c) : 0;
      let win = (def ? (tc < 0 ? def.ik + ((def.pre ?? def.ik) - def.ik) * (def.prep || this.sliceT === c.t ? 1 : lowK) : this.sliceT === c.t ? SLICE.ik : def.ik) : 0) + 0.06;
      // (a lob: the arm holds its rising finish a little longer)
      if (tc > 0 && this.lobT === c.t) win = Math.max(win, LOB_FINISH.hold);
      w = proc ? 0 : 1 - smooth(0.5 * win, win, Math.abs(tc));
      if (proc) {
        const B0 = -0.4;
        const B1 = 0.34;
        w = smooth(B0 - 0.16, B0, tc) * (1 - smooth(B1, B1 + 0.18, tc));
      }
      const dh = Math.hypot(c.x - this.root.position.x, c.z - this.root.position.z);
      // (the knees bend for a low drive as the paddle goes back, a little sooner than the back)
      const near = 1 - smooth(0.06, tc < 0 && lowK > 0 ? 0.45 : 0.3, Math.abs(tc));
      if (proc) leanWant = Math.min(1.05, Math.max(0, 1.05 - c.y) * 1.2 + Math.max(0, dh - 0.55) * 0.5 + 0.45);
      else {
        const home = def?.home !== undefined ? def.home * (this.height / 1.78) : (this.a.reach[kind]?.y ?? 1.05) * sc;
        const low = Math.max(0, home - c.y);
        dropWant = Math.min(def?.drop ?? DROP, low * 0.45) * w * near;
        // (the lunges are deep: for a ball over where they meet it, the hips stay higher, the lunge less deep)
        if (kind === 'lunge' || kind === 'lunge_left') dropWant -= Math.min(DROP, Math.max(0, c.y - home) * 0.6) * w * near;
        leanWant = Math.min(1.0, Math.max(0, low - Math.max(0, dropWant)) * 1.1 + Math.max(0, dh - this.reachOf(kind)) * 0.5);
      }
      leanWant *= w * near;
    }
    // the smash jump: crouch before the take-off, give at the landing
    let give = 0;
    if (hop > 0 || (c && kind === 'smash' && c.y > jumpFrom)) give = (kind === 'serve' ? 0.05 : 0.07) * (Math.exp(-(((tc + 0.33) / 0.07) ** 2)) + Math.exp(-(((tc - 0.33) / 0.08) ** 2)));
    this.drop += (dropWant - this.drop) * (1 - Math.exp(-12 * dt));
    this.legs(dt, this.drop + split.dip + give + this.leanDrop + this.idleOut.drop, jump, sp, ((this.locoW.shuffle ?? 0) + (this.locoW.shuffle_l ?? 0)) * Ll, split.widen);

    const spine = this.bone.Spine01 ?? this.bone.Spine;
    // the shoulders turn for the procedural backhand
    if (c && kind && proc) {
      const B0 = -0.4;
      const B1 = 0.34;
      const tw = tc < 0 ? 0.85 - 0.25 * smooth(B0, 0, tc) : 0.6 - 0.8 * smooth(0, B1, tc);
      this.twist += (tw * w - this.twist) * (1 - Math.exp(-14 * dt));
    } else this.twist *= Math.exp(-10 * dt);
    if (spine && Math.abs(this.twist) > 1e-3) {
      // turn the shoulders about the vertical: + turns the chest to the player's left
      sQ.setFromAxisAngle(sE.set(0, 1, 0), this.twist);
      rotateWorld(spine, sQ);
    }
    // the back bends towards the ball (spread over the three spine bones), never past TILT_MAX from upright
    this.lean += (leanWant - this.lean) * (1 - Math.exp(-16 * dt));
    const b0 = this.bone.Spine02;
    const b1 = this.bone.Spine01;
    const b2 = this.bone.Spine;
    if (c && b2 && this.lean > 1e-3) {
      const dx = c.x - this.root.position.x;
      const dz = c.z - this.root.position.z;
      const dh = Math.hypot(dx, dz);
      wquat(b2, sQ);
      const tilt = Math.acos(clamp(sE.set(0, 1, 0).applyQuaternion(sQ).y, -1, 1));
      const lean = Math.min(this.lean, Math.max(0, TILT_MAX - tilt));
      if (lean > 1e-3 && dh > 1e-3) {
        // axis = up × (direction to the ball): tips the chest towards it
        sE.set(dz / dh, 0, -dx / dh);
        if (b0 && b1) {
          sQ.setFromAxisAngle(sE, lean * 0.4);
          rotateWorld(b0, sQ);
          sQ.setFromAxisAngle(sE, lean * 0.3);
          rotateWorld(b1, sQ);
          sQ.setFromAxisAngle(sE, lean * 0.3);
        } else sQ.setFromAxisAngle(sE, lean);
        rotateWorld(b2, sQ);
      }
    }
    // the IK's weight, eased: a contact that goes away or a swing that changes never snaps the arm back to the clip
    this.wS = jump ? (c && kind ? w : 0) : this.wS + clamp((c && kind ? w : 0) - this.wS, -10 * dt, 10 * dt);
    if (c && kind && this.wS > 1e-3) {
      this.reachBall(c, kind, tc, this.wS, dt, sliced);
      this.armHold = 1;
    } else {
      this.kdT = -1;
      this.armOk = false;
      // (no contact to reach any more: the arm eases back onto the clip from where the IK left it)
      this.armHold = jump ? 0 : Math.max(0, this.armHold - dt / 0.15);
      const up = this.bone.RightArm;
      if (this.armHold > 0 && up) {
        const k = smooth(0, 1, this.armHold);
        up.quaternion.slerp(this.armPrev[0], k);
        this.bone.RightForeArm.quaternion.slerp(this.armPrev[1], k);
        this.bone.RightHand.quaternion.slerp(this.armPrev[2], k);
        up.updateMatrixWorld(true);
      }
    }
    if (jump) this.armOk = false;
    // the two-handed backhand: the free hand on the handle (after the racket arm is where it goes)
    if (this.twoK > 1e-3 && !(globalThis as { __noTwo?: boolean }).__noTwo) this.twoHands(this.twoK);
    this.headLook(dt, m, c, tc, ball);
  }

  /**
   * The free (left) hand onto the racket's handle, over the racket hand (TWO_HANDS), `k` of the way from where the clip
   * has it: the left arm's two-bone IK about its own elbow hinge, the elbow down and in front, the hand turned as the
   * racket hand is (both palms round the handle).
   */
  private twoHands(k: number) {
    const up = this.bone.LeftArm;
    const fo = this.bone.LeftForeArm;
    const hd = this.bone.LeftHand;
    if (!up || !fo || !hd) return;
    // the racket's axis and face normal (world), and where the racket hand holds it (the racket's origin)
    wquat(this.paddle, sQ);
    sD.set(0, 1, 0).applyQuaternion(sQ);
    sE.set(1, 0, 0).applyQuaternion(sQ);
    wpos(this.paddle, sA);
    const s = this.height / 1.78;
    // the left palm on the handle above the right hand, the wrist a palm's length back towards the left shoulder
    sP.copy(sA).addScaledVector(sD, TWO_HANDS.up * s).addScaledVector(sE, TWO_HANDS.off * s);
    wpos(up, sS);
    sTarget.copy(sP).addScaledVector(sH.copy(sS).sub(sP).normalize(), 0.065 * s);
    // (from where the clip has the hand, k of the way)
    wpos(hd, sB);
    sTarget.lerp(sB, 1 - k);
    // the elbow down and in front of the chest
    wquat(this.bone.Spine, sQ2);
    this.pole.set(0, -1, 0).applyQuaternion(sQ2).addScaledVector(sH.set(0, 0, 1).applyQuaternion(sQ2), 0.6).normalize().multiplyScalar(0.4).add(sS);
    twoBone(up, fo, hd, sTarget, ELBOW_MIN, ELBOW_HINGE_L, ELBOW_HINGE_L, this.pole, 0.6 * k, 0.8);
    // the hand's fingers (its bone's y) towards the handle, k of the way
    wpos(hd, sB);
    wquat(hd, sQ4);
    sH.set(0, 1, 0).applyQuaternion(sQ4);
    sQ3.setFromUnitVectors(sH, sP.sub(sB).normalize());
    sQ3.slerp(qI.identity(), 1 - k);
    rotateWorld(hd, sQ3);
  }

  /** The paddle to the ball: the arm (elbow down and out, never folded shut) and the wrist (within its limits). */
  private reachBall(c: Contact, kind: Swing, tc: number, w: number, dt: number, sliced = false) {
    const up = this.bone.RightArm;
    const fo = this.bone.RightForeArm;
    const hd = this.bone.RightHand;
    if (!up || !fo || !hd) return;
    const target = sTarget.set(c.x, c.y, c.z);
    const sw = this.swing ?? this.shots.find((s) => !s.react && Math.abs(s.key - c.t) < 0.1) ?? null;
    if (kind === 'proc') {
      // the procedural backhand (no clip): shoulders turned, the paddle drawn across from the left hip, through the
      // ball, up to the right
      const B0 = -0.4;
      const B1 = 0.34;
      const back = this.root.localToWorld(sBack.set(0.5, 0.95, -0.2));
      const follow = this.root.localToWorld(sFollow.set(-0.3, 1.45, 0.5));
      sBall.set(c.x, c.y, c.z);
      if (tc < 0) target.copy(back).lerp(sBall, smooth(B0, 0, tc));
      else target.copy(sBall).lerp(follow, smooth(0, B1, tc));
    } else if (sw && sw.layer && sw.kind === kind && Math.abs(sw.key - c.t) < 0.1) {
      // the swing's own path, moved so it goes through the ball at the contact (the paddle keeps its speed through it)
      const path = this.a.path[kind];
      const k = this.a.contact[kind];
      if (path && k !== undefined) {
        const n = path.length / 3 - 1;
        const at = (t: number, out: THREE.Vector3) => {
          const f = clamp(t * 60, 0, n);
          const i = Math.min(n - 1, Math.floor(f));
          const u = f - i;
          return out.set(path[i * 3] + (path[i * 3 + 3] - path[i * 3]) * u, path[i * 3 + 1] + (path[i * 3 + 4] - path[i * 3 + 1]) * u, path[i * 3 + 2] + (path[i * 3 + 5] - path[i * 3 + 2]) * u);
        };
        // (on the contact's own clock: the clip's may run a frame or two off it, and the paddle moves fast there)
        const def = SWINGS[kind];
        // (the follow-through as fast as the shot was hard: see finishPace)
        let u = clamp(tc > 0 ? tc * this.finishPace(c.t) : tc, -k, 0.6);
        // (the take-back early, then held: see SwingDef.prep)
        const pp = def.prep;
        if (pp && u < -pp.hold) u = Math.max(-k, -pp.hold - (-u - pp.hold) * pp.slow);
        const s = this.height / 1.7;
        at(k + u, sA).sub(at(k, sB)).multiplyScalar(s * (def.scale ?? 1));
        if (pp && u < 0 && sA.z < 0) sA.z *= pp.back;
        // a slice (SLICE): high to low through the ball, the finish out in front (model space: x left, y up, z forward)
        const sl = this.sliceT === c.t || sliced;
        if (sl) {
          const S = SLICE;
          const sc = this.height / 1.78;
          const side = SIDE[kind] === -1 ? -1 : 1;
          if (u < 0) {
            // the take-back: over the ball (the clip's way back, lifted), coming down onto it
            sA.y = Math.max(sA.y, 0) * 0.3 + S.high * sc * smooth(0, S.highT, -u);
          } else {
            // the finish: on forward and down, a little across, then back up a touch in front
            const d = smooth(0, S.lowT, u);
            sA.z = Math.max(0, sA.z) * S.fwd + 0.12 * sc * d;
            sA.x = sA.x * S.across;
            sA.y = -S.low * sc * d + S.rise * sc * smooth(S.lowT, S.riseT, u);
            void side;
          }
        }
        const L = def.lift && !sl ? this.lowness(kind, c) : 0;
        // (a ball over where the clip meets it: a take-back from over it is flattened, or a swing lifted onto a higher
        // ball comes down on it from over the head)
        const r = this.a.reach[kind];
        if (u < 0 && sA.y > 0 && r) sA.y *= 1 - 0.7 * smooth(0, 0.4, c.y - r.y * s);
        if (L > 0) {
          // low to high: back at the height of the ball, a touch under it, and up after it to where the clip finishes
          let dy = -LOW_DIP * smooth(0, 0.12, -u);
          if (u > 0) dy = Math.max(0, at(k + 0.3, sB).y * s - c.y) * (def.scale ?? 1) * smooth(0, 0.3, u);
          sA.y += (dy - sA.y) * L;
        }
        wquat(this.model, sQ);
        target.add(sA.applyQuaternion(sQ));
        // (after the contact the follow-through goes with the body: it is the swing's own path from where the ball was
        // met, carried along as the player moves on or the lunge comes back)
        if (tc >= 0) {
          if (this.anchorT !== c.t) {
            this.anchorT = c.t;
            this.anchor.copy(this.root.position);
          }
          target.x += this.root.position.x - this.anchor.x;
          target.z += this.root.position.z - this.anchor.z;
        }
      }
    }
    // a lob: from the ball the paddle goes on up and towards the net, lifting it (LOB_FINISH), carried with the body
    const lobK = tc > 0 && this.lobT === c.t && kind !== 'proc' ? smooth(0, LOB_FINISH.t, tc) : 0;
    const toNet = -Math.sign(this.root.position.z || 1);
    if (lobK > 0) {
      if (this.anchorT !== c.t) {
        this.anchorT = c.t;
        this.anchor.copy(this.root.position);
      }
      sBall.set(c.x + this.root.position.x - this.anchor.x, c.y + LOB_FINISH.rise, c.z + this.root.position.z - this.anchor.z + toNet * LOB_FINISH.fwd);
      target.lerp(sBall, lobK);
    }
    // from where the clip has the paddle onto that target, by w
    wpos(this.tip, sA);
    target.lerp(sA, 1 - w);
    // the paddle: as the clip holds it, turned towards the ball from the shoulder (less for a ball jammed in), and
    // more if the hand could not get there otherwise (arm and paddle in line: the longest reach)
    wpos(hd, sB);
    const len = sA.distanceTo(sB);
    sD.copy(sA).sub(sB).normalize();
    wpos(up, sS);
    wpos(fo, sH);
    const arm = (sS.distanceTo(sH) + sH.distanceTo(sB)) * 0.995;
    sE.copy(target).sub(sS);
    const ds = sE.length();
    sE.normalize();
    // (a low drive: the arm goes much further from the clip than in other swings, down to the ball and back up; the
    // paddle turns with the forearm, the wrist as the clip has it, instead of keeping the clip's direction in the world)
    const low = kind !== 'proc' && SWINGS[kind].lift ? this.lowness(kind, c) : 0;
    if (low > 0) this.pLocal.copy(sD).applyQuaternion(wquat(fo, sQ2).invert());
    const k0 = 0.45 * w * smooth(0.25, 0.55, ds);
    // (how much more it must turn for the hand to get there: only near the contact, where the paddle must be on the
    // ball; found by halving, then eased in time so the arm never jumps)
    const need = 1 - smooth(0.05, 0.16, Math.abs(tc));
    let kd = k0;
    const fits = (k: number) => sH.copy(target).addScaledVector(this.pdir.copy(sD).lerp(sE, k).normalize(), -len).sub(sS).length() <= arm;
    if (need > 0 && !fits(k0)) {
      let lo = k0;
      let hi = 1;
      for (let j = 0; j < 7; j++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid;
        else lo = mid;
      }
      kd = k0 + (hi - k0) * need;
    }
    const e = this.kdT < 0 ? 1 : Math.min(1, 6 * dt / Math.max(1e-3, Math.abs(kd - this.kd)));
    this.kd += (kd - this.kd) * (this.kdT < 0 ? 1 : e);
    this.kdT = 1;
    this.pdir.copy(sD).lerp(sE, this.kd).normalize();
    // (a lob's finish: the paddle's head turns up; a remate por 4's turns over the ball, forward and down)
    if (lobK > 0) this.pdir.lerp(sP.set(0, 1, toNet * 0.35).normalize(), lobK * LOB_FINISH.tip).normalize();
    // the elbow: down and out for the drives and the dinks, leading for the backhand, up and out for the smash
    const ch = this.bone.Spine;
    wquat(ch, sQ);
    const U = sB.set(0, 1, 0).applyQuaternion(sQ);
    const F = sD.set(0, 0, 1).applyQuaternion(sQ);
    const R = sH.set(-1, 0, 0).applyQuaternion(sQ);
    if (kind === 'smash') this.pole.copy(R).multiplyScalar(0.8).addScaledVector(U, 0.3).addScaledVector(F, 0.1);
    else if (kind === 'serve') this.pole.copy(R).multiplyScalar(0.7).addScaledVector(U, 0.45).addScaledVector(F, -0.15);
    else if (kind === 'backhand' || kind === 'lunge_left' || kind === 'slice_l' || kind === 'volley_l' || kind === 'proc') this.pole.copy(U).multiplyScalar(-0.7).addScaledVector(F, 0.5).addScaledVector(R, 0.2);
    else this.pole.copy(U).multiplyScalar(-1).addScaledVector(R, 0.5).addScaledVector(F, -0.2);
    this.pole.normalize().multiplyScalar(0.4).add(sS).add(sA.copy(target).sub(sS).multiplyScalar(0.5));
    // (only near the contact: the clips' own elbows are fine, and rise naturally on the follow-through)
    const poleK = (kind === 'smash' || kind === 'serve' ? 0.3 : 0.5) * w * (1 - smooth(0.08, 0.2, Math.abs(tc)));
    // the hand a paddle-length back from the target along the paddle, then moved by what is left over
    sH.copy(target).addScaledVector(this.pdir, -len);
    this.foBase.copy(fo.quaternion);
    let best = Infinity;
    for (let i = 0; i < 6; i++) {
      twoBone(up, fo, hd, sH, ELBOW_MIN, ELBOW_HINGE, ELBOW_HINGE, this.pole, i === 0 ? poleK : 0, 0.6);
      if (low > 0) {
        // (the clip's racket carried along with the forearm, then turned to the ball as much as the rest; right on the
        // ball, as the other swings: the racket must be there; with 0.6 here a forehand met at the hip close to the body
        // missed by 7 cm, 16–19 at worst, the racket's head turned past the ball)
        const rel = low * (1 - 0.95 * need);
        sP2.copy(this.pLocal).applyQuaternion(wquat(fo, sQ2));
        sP2.lerp(sP.copy(this.pdir), 1 - rel).lerp(sE, this.kd * rel).normalize();
        this.aimWrist(sP2);
      } else this.aimWrist(this.pdir);
      wpos(this.tip, sA);
      const err = sA.distanceToSquared(target);
      if (err < best) {
        best = err;
        this.best[0].copy(up.quaternion);
        this.best[1].copy(fo.quaternion);
        this.best[2].copy(hd.quaternion);
      }
      if (err < 1e-5) break;
      // the hand moved by what the paddle face still misses (never further than the arm reaches: what is left the
      // paddle pull hides)
      // (damped: where the wrist runs out of turn the plain step overshoots and swings back and forth)
      sH.addScaledVector(sB.copy(target).sub(sA), 0.7).sub(sS);
      if (sH.length() > arm) sH.setLength(arm);
      sH.add(sS);
    }
    // (the closest of the tries: where the arm has no answer, the steps can swing back and forth)
    up.quaternion.copy(this.best[0]);
    fo.quaternion.copy(this.best[1]);
    hd.quaternion.copy(this.best[2]);
    // no pops: each bone turns at most ARM_STEP a frame off the pose drawn the frame before (a real swing turns up to
    // 25°: two IK answers far apart for targets a frame apart become a quick turn, not a jump)
    if (this.armOk) {
      this.capTurn(up.quaternion, this.armPrev[0]);
      this.capTurn(fo.quaternion, this.armPrev[1]);
      this.capTurn(hd.quaternion, this.armPrev[2]);
    }
    this.armPrev[0].copy(up.quaternion);
    this.armPrev[1].copy(fo.quaternion);
    this.armPrev[2].copy(hd.quaternion);
    this.armOk = true;
    up.updateMatrixWorld(true);
  }

  /** How fast the follow-through of the swing timed to contact `key` plays (1 a plain one): POWER. */
  private finishPace(key: number): number {
    const h = this.shotAt(key);
    if (!h) return 1;
    return 1 + POWER.k * (h.power - 0.5);
  }

  private capTurn(q: THREE.Quaternion, prev: THREE.Quaternion) {
    const a = q.angleTo(prev);
    if (a > ARM_STEP) q.copy(sQ4.copy(prev).slerp(q, ARM_STEP / a));
  }

  private best = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  /** the arm as the IK drew it last frame (armOk: it did) */
  private armPrev = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  private armOk = false;
  /** the IK's weight, eased, and how much of the last IK pose the arm still holds once there is nothing to reach */
  private wS = 0;
  private armHold = 0;
  /** the clip's paddle direction in the forearm's frame (a low drive's paddle turns with the forearm) */
  private pLocal = new THREE.Vector3();
  /** where the body was at the contact (the follow-through is carried along from there), and which contact */
  private anchor = new THREE.Vector3();
  private anchorT = -1;
  /** the contact (its time) being sliced (SLICE), and how much the free hand is on the handle (TWO_HANDS) */
  private sliceT = -1;
  private twoK = 0;
  /** the overhead's jump, held through the air (its contact, height and half the time in the air) */
  private jump = { t: -1, h: 0, air: 0 };
  /** the contact (its time) the player has just played a lob off: the lob's finish (LOB_FINISH) */
  private lobT = -1;

  /** Turns the hand so the paddle points along `dir`, within what a wrist does (the forearm takes the twist). */
  private aimWrist(dir: THREE.Vector3) {
    const fo = this.bone.RightForeArm;
    const hd = this.bone.RightHand;
    wpos(hd, sA);
    wpos(this.tip, sB);
    sB.sub(sA).normalize();
    sQ.setFromUnitVectors(sB, dir);
    // the hand as it should be (world), then as a turn off its rest pose in the forearm's frame
    wquat(hd, sQ2).premultiply(sQ);
    wquat(fo, sQ3);
    sQ4.copy(sQ3).invert().multiply(sQ2);
    sQ.copy(this.restHand).invert().multiply(sQ4);
    if (sQ.w < 0) sQ.set(-sQ.x, -sQ.y, -sQ.z, -sQ.w);
    const tw = 2 * Math.atan2(sQ.y, sQ.w);
    // (the forearm's twist off its clip pose, all iterations together, within FORE_TWIST)
    sQ3.copy(this.foBase).invert().multiply(fo.quaternion);
    if (sQ3.w < 0) sQ3.set(-sQ3.x, -sQ3.y, -sQ3.z, -sQ3.w);
    const tw0 = 2 * Math.atan2(sQ3.y, sQ3.w);
    const extra = clamp(tw0 + tw - clamp(tw, -WRIST_TWIST, WRIST_TWIST), -FORE_TWIST, FORE_TWIST) - tw0;
    if (Math.abs(extra) > 1e-3) {
      fo.quaternion.multiply(sQ.setFromAxisAngle(Y, extra));
      fo.updateMatrixWorld(true);
      wquat(fo, sQ3);
      sQ4.copy(sQ3).invert().multiply(sQ2);
      sQ.copy(this.restHand).invert().multiply(sQ4);
    }
    limitTurn(sQ, WRIST_BEND, WRIST_TWIST);
    hd.quaternion.copy(this.restHand).multiply(sQ);
    hd.updateMatrixWorld(true);
  }

  /**
   * The split step (match.stance 'split': the other side hits): a small hop on the balls of the feet that lands as the
   * ball leaves their paddle, the feet a little wider, the knees taking the landing; then settled and ready to go. The
   * hop starts SPLIT.lead before the contact the other side is going for (their plan, or the serve being wound up); a
   * player on the move, or a hit the view did not see coming, only takes the landing. Returns how high the body is off
   * the floor, how far the hips go down and how much wider each foot lands (m).
   */
  private splitStep(dt: number, m: Match, p: Player, st: string | null | undefined, sp: number): { hop: number; dip: number; widen: number } {
    const out = this.splitOut;
    out.hop = out.dip = out.widen = 0;
    if (st === undefined) return out;
    // (not in a reaction; and it gives way to the player's own swing as its contact comes (a swing's wind-up far off
    // its contact is fine): a quick exchange at the net leaves no time for the whole of it)
    if (this.reaction) {
      this.splitAt = -9;
      return out;
    }
    const sw = this.swing;
    const left = sw ? sw.key - m.t : 9;
    // (eased: a swing that turns up late does not snap the hips)
    this.splitK += clamp((left > -0.3 ? smooth(0.12, 0.35, left) : 1) - this.splitK, -dt / 0.08, dt / 0.08);
    const k = this.splitK;
    // the other side's next contact
    let at = Infinity;
    if (m.phase === 'rally' || m.phase === 'serve') {
      const wu = m.windup;
      if (wu && m.players[wu.pid] && m.players[wu.pid].team !== p.team) at = wu.at;
      for (const q of m.players) if (q.team !== p.team && q.plan && q.plan.reach && q.plan.t > m.t) at = Math.min(at, q.plan.t);
    }
    if (k > 0.99 && sp < SPLIT.still && at - m.t < SPLIT.lead && Math.abs(at - this.splitAt) > 0.3) {
      this.splitAt = at;
      this.splitHop = true;
    }
    if (st === 'split' && !(m.t - this.splitAt > -SPLIT.lead && m.t - this.splitAt < 0.35)) {
      this.splitAt = m.t;
      this.splitHop = false;
    }
    const tau = m.t - this.splitAt;
    if (!(tau > -SPLIT.lead && tau < 0.9) || k <= 0) return out;
    const u = (tau + SPLIT.lead) / SPLIT.air;
    if (this.splitHop && u > 0 && u < 1) out.hop = SPLIT.hop * Math.sin(Math.PI * u) * k;
    out.dip = SPLIT.dip * (this.splitHop ? 1 : 0.6) * (smooth(-0.02, 0.07, tau) - smooth(0.12, 0.36, tau)) * k;
    if (this.splitHop) out.widen = SPLIT.widen * (smooth(-SPLIT.lead, 0.03, tau) - smooth(0.5, 0.8, tau)) * k;
    return out;
  }
  private splitOut = { hop: 0, dip: 0, widen: 0 };

  /**
   * The lean into what the feet do (see LEAN): from the simulation's acceleration, eased, and for a CPU player about to
   * go, the lean and the load that come before the first step. Sets leanV (rad towards world x/z) and leanDrop (m).
   */
  private bodyLean(dt: number, m: Match, p: Player, sp: number, jump: boolean) {
    if (jump || !(dt > 0)) {
      this.pv.set(p.vx, p.vz);
      this.acc.set(0, 0);
      this.leanV.set(0, 0);
      this.leanDrop = 0;
      return;
    }
    const e = 1 - Math.exp(-dt / LEAN.ease);
    this.acc.x += ((p.vx - this.pv.x) / dt - this.acc.x) * e;
    this.acc.y += ((p.vz - this.pv.y) / dt - this.acc.y) * e;
    this.pv.set(p.vx, p.vz);
    // (back against the way it goes, or forward / into a turn: each with its own measure and limit)
    const along = sp > 0.3 ? (this.acc.x * p.vx + this.acc.y * p.vz) / sp : 0;
    let lx = this.acc.x * LEAN.k;
    let lz = this.acc.y * LEAN.k;
    if (along < 0) {
      // (the braking part leans more)
      const b = (along * (LEAN.kBack - LEAN.k)) / sp;
      lx += p.vx * b;
      lz += p.vz * b;
    }
    const most = along < 0 ? LEAN.back : LEAN.fwd;
    const l = Math.hypot(lx, lz);
    if (l > most) {
      lx *= most / l;
      lz *= most / l;
    }
    // (a stop: the hips go down as the feet dig in)
    let drop = along < 0 ? LEAN.drop * smooth(0, LEAN.dropA, -along) : 0;
    // the CPU's first step, seen coming: the load and the lean towards where he goes, as his reaction runs out
    const pl = p.plan;
    if (!p.human && pl && m.phase === 'rally' && m.t < p.moveFrom && p.moveFrom - m.t < LEAN.antT) {
      const dx = pl.fx - p.x;
      const dz = pl.fz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        const k = smooth(LEAN.antT, 0, p.moveFrom - m.t) * smooth(0.3, 1.2, d);
        lx += (dx / d) * LEAN.antLean * k;
        lz += (dz / d) * LEAN.antLean * k;
        drop = Math.max(drop, LEAN.antDrop * k);
      }
    }
    // (eased once more, so the body never snaps)
    const f = 1 - Math.exp(-dt / 0.05);
    this.leanV.x += (lx - this.leanV.x) * f;
    this.leanV.y += (lz - this.leanV.y) * f;
    this.leanDrop += (drop - this.leanDrop) * f;
  }

  /**
   * Waiting between shots (see IDLE): how alert, how much of the waiting shows, and this frame's stance, weight shift,
   * bounce and breathing (idleOut); now and then a foot set down again (fidget, taken by `legs`).
   */
  private idleLife(dt: number, m: Match, p: Player, sp: number, W: number, st: string | null | undefined, jump: boolean) {
    const o = this.idleOut;
    // how alert: the ball coming at him (the other side hit last), his side about to hit (0.7), the serve (receiving
    // 0.9, serving 0.4), a point over (0)
    let want = 0;
    if (m.phase === 'rally') want = !m.rally?.last || m.rally.last.team !== p.team ? 1 : 0.7;
    else if (m.phase === 'serve') want = m.server().team === p.team ? 0.4 : 0.9;
    this.alert += (want - this.alert) * (1 - Math.exp(-dt / IDLE.alertT));
    // how much the waiting shows: the standing loops, no swing or reaction, not finishing a swing
    let standW = 0;
    for (const s of STAND) standW += this.locoW[s] ?? 0;
    const showing = Math.min(1, standW) * (1 - Math.min(1, W)) * (this.reaction ? 0 : 1) * (st === 'follow' ? 0 : 1);
    this.idleK = jump ? showing : this.idleK + (showing - this.idleK) * (1 - Math.exp(-dt / 0.15));
    this.idleT += dt;
    // (only standing: a slow walk is not a waiting stance)
    const k = this.idleK * (1 - smooth(0.15, 0.6, sp));
    const a = this.alert;
    const T = this.idleT;
    // (each player with his own rhythm)
    const ph = p.id * 2.399 + p.team * 1.1;
    const r = this.relax;
    // (the sway's phase runs on its own clock, slower between points)
    this.swayPh += (dt * 2 * Math.PI) / (IDLE.swayT * (1 + 0.13 * Math.sin(p.id * 1.7)) * (1 + 0.5 * r));
    const sw = Math.sin(this.swayPh + ph);
    o.sway = IDLE.sway * (1 + 0.5 * r) * sw * k;
    o.roll = IDLE.roll * (1 + 0.5 * r) * sw * k;
    o.lean = (IDLE.lean * a + IDLE.breathe * Math.sin((2 * Math.PI * T) / IDLE.breatheT + ph * 0.7)) * k;
    // on the toes, back from the net, until the other side's contact is close (the split step takes it from there)
    let at = Infinity;
    const wu = m.windup;
    if (wu && m.players[wu.pid] && m.players[wu.pid].team !== p.team) at = wu.at;
    for (const q of m.players) if (q.team !== p.team && q.plan && q.plan.reach && q.plan.t > m.t) at = Math.min(at, q.plan.t);
    const deep = smooth(AT_NET - 1.0, AT_NET + 1.5, Math.abs(p.z));
    const bounce = IDLE.bounce * (0.5 - 0.5 * Math.cos(2 * Math.PI * IDLE.bounceHz * T + ph)) * a * deep * smooth(IDLE.bounceGap, IDLE.bounceGap + 0.25, at - m.t) * (1 - smooth(0.1, 0.4, sp));
    // (crouched lower at the net than back by the glass)
    o.drop = (IDLE.low * a * (1 - (1 - IDLE.lowDeep) * deep) - bounce) * k;
    // now and then, standing, a foot set down again a few centimetres off (never during the other side's swing)
    if (this.fidget && (this.fidget.go !== undefined ? T - this.fidget.go > 0.3 : T - this.fidget.t > 0.6)) this.fidget = null;
    if (k < 0.8 || sp > 0.08 || at - m.t < 0.6) this.fidgetAt = Math.max(this.fidgetAt, T + 0.8);
    else if (!this.fidget && T > this.fidgetAt) {
      const n = ++this.fidgetN;
      const h = (s: number) => {
        const x = Math.sin(n * 12.9898 + p.id * 78.233 + s * 37.719) * 43758.5453;
        return x - Math.floor(x);
      };
      // (mostly out or in, a little forward or back: the stance kept)
      const ang = (h(1) - 0.5) * 1.2 + (h(2) < 0.5 ? 0 : Math.PI);
      const d = IDLE.fidgetD * (0.5 + 0.5 * h(3));
      this.fidget = { foot: n % 2, x: Math.cos(ang) * d, z: Math.sin(ang) * d, t: T };
      this.fidgetAt = T + IDLE.fidget * (0.7 + 0.7 * h(4));
    }
  }

  /**
   * On the body, in one go (one update of the skeleton's matrices at the end: each bone is turned on its parent's
   * matrix, brought up to date down the chain as needed):
   *  · the lean into what the feet do (leanV, `k` of it, see LEAN): a turn of the hips, with the hips moved `pivot` of
   *    the way over the feet;
   *  · the waiting stance's life (idleOut, see IDLE): the weight over one foot (the hips over it, that hip up, the
   *    chest kept level), the chest a little forward when alert and breathing.
   */
  private applyBody(k: number) {
    const hips = this.bone.Hips;
    const par = hips?.parent;
    if (!hips || !par) return;
    const o = this.idleOut;
    const idle = this.idleK > 1e-3;
    const L = Math.hypot(this.leanV.x, this.leanV.y) * k;
    if (L < 1e-3 && !idle) return;
    const rx = -Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    // the hips: turned (the lean, the roll of the weight on one foot) and moved (over the feet, over that foot)
    sQ3.identity();
    let dx = 0;
    let dz = 0;
    if (L >= 1e-3) {
      const ux = (this.leanV.x * k) / L;
      const uz = (this.leanV.y * k) / L;
      // (axis = up × the way it leans: tips the body that way)
      sQ3.setFromAxisAngle(sE.set(uz, 0, -ux), L);
      wpos(hips, sA);
      const shift = LEAN.pivot * Math.max(0.3, sA.y - this.root.position.y) * Math.sin(L);
      dx += ux * shift;
      dz += uz * shift;
    }
    if (idle && Math.abs(o.sway) > 1e-4) {
      sQ3.premultiply(sQ.setFromAxisAngle(sE.set(fx, 0, fz), -o.roll));
      dx += rx * o.sway;
      dz += rz * o.sway;
    }
    turnWorld(hips, sQ3);
    wquat(par, sQ).invert();
    hips.position.add(sA.set(dx, 0, dz).applyQuaternion(sQ).divideScalar(0.01 * (this.height / 1.7)));
    hips.updateWorldMatrix(false, false);
    // (the legs keep the clip's way: the turn is the trunk's, and the hips moved over the feet. Turned with the hips,
    // the feet tipped with the body and a planted foot rocked on the floor)
    sQ3.invert();
    if (this.bone.LeftUpLeg) turnWorld(this.bone.LeftUpLeg, sQ3);
    if (this.bone.RightUpLeg) turnWorld(this.bone.RightUpLeg, sQ3);
    if (idle) {
      const B = this.bone;
      // (the chest forward, alert and breathing; the roll taken out of the chest)
      const ch = B.Spine01 ?? B.Spine;
      if (ch && Math.abs(o.lean) > 1e-4) {
        this.fresh(ch.parent!, hips);
        turnWorld(ch, sQ.setFromAxisAngle(sE.set(fz, 0, -fx), o.lean));
      }
      if (B.Spine && Math.abs(o.roll) > 1e-4) {
        this.fresh(B.Spine.parent!, hips);
        turnWorld(B.Spine, sQ.setFromAxisAngle(sE.set(fx, 0, fz), 0.8 * o.roll));
      }
    }
    // (the legs are what `legs` reads next, and it then updates the whole body: only their chains are brought up to date)
    for (const f of this.feet) {
      f.up.updateWorldMatrix(false, false);
      f.knee.updateWorldMatrix(false, false);
      f.ankle.updateWorldMatrix(false, false);
      f.toe.updateWorldMatrix(false, false);
    }
  }
  /** Brings the world matrices from under `top` down to `bone` up to date (only that chain, not their other children). */
  private fresh(bone: THREE.Object3D, top: THREE.Object3D) {
    const list = this.chainTmp;
    list.length = 0;
    for (let b: THREE.Object3D | null = bone; b && b !== top; b = b.parent) list.push(b);
    for (let i = list.length - 1; i >= 0; i--) list[i].updateWorldMatrix(false, false);
  }
  private chainTmp: THREE.Object3D[] = [];


  /**
   * The hips and the feet: the body put down on the floor (the clips float over it), the hips lowered by `drop`
   * (knees bending); in a jump (the root off the floor) the legs tuck. A foot the animation puts on the floor stays
   * where it was put down until the animation lifts it, or until the body has drawn too far from it or turned over it:
   * then it steps (a short arc) to where the animation has it. No foot slides on the floor. `jump`: the body was moved
   * across the court (a new point): the feet start afresh.
   */
  private legs(dt: number, drop: number, jump: boolean, sp: number, side: number, widen = 0) {
    const hips = this.bone.Hips;
    if (!hips || this.feet.length !== 2) return;
    const sc = this.height / 1.78;
    // (the body's right, for the feet that must not cross: `side` is how much of the legs the shuffle has)
    const ya = this.yaw + this.model.rotation.y + this.legYaw;
    const rx = -Math.cos(ya);
    const rz = Math.sin(ya);
    const unit = 0.01 * (this.height / 1.7);
    const ry = this.root.position.y;
    let low = Infinity;
    for (const f of this.feet) {
      wpos(f.ankle, f.anim);
      wpos(f.toe, sA);
      f.sole = Math.min(f.anim.y - ry - ANKLE_H * sc, sA.y - ry - TOE_H * sc);
      f.animYaw = Math.atan2(sA.x - f.anim.x, sA.z - f.anim.z);
      f.toeH = Math.hypot(sA.x - f.anim.x, sA.z - f.anim.z);
      low = Math.min(low, f.sole);
    }
    // the clip's floor: the lowest the feet have been lately (it follows a foot going lower at once, and rises slowly):
    // a run's flight phase stays in the air instead of the body dipping to put the leading foot on the floor
    this.floorY = jump || !Number.isFinite(this.floorY) ? low : Math.min(low, this.floorY + FLOOR_RISE * dt);
    const g = clamp(-this.floorY, -0.25, 0.25);
    wpos(hips, sA);
    const d = Math.min(drop, Math.max(0, sA.y - ry + g - HIPS_MIN * sc));
    hips.position.y += (g - d) / unit;
    hips.updateMatrixWorld(true);
    const air = ry > 0.01;
    // (also running: the loops' clocks follow the ground speed, so a stance foot of the run stays where the clip has
    // it; what the clip and the ground speed disagree on, a step takes)
    const hold = true;
    // (a quick foot: faster the faster the body goes, a running stride swings the foot at twice the body's speed)
    const footMax = Math.max(7, 2.2 * sp + 3) * sc;
    // (how much this is a burst from still: the simulation's acceleration, eased, at low speed)
    const burst = smooth(6, 16, Math.hypot(this.acc.x, this.acc.y)) * (1 - smooth(2.5, 3.5, sp));
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const o = this.feet[1 - i];
      f.anim.y += g;
      f.sole += g;
      // (in the air the legs tuck a little)
      if (air) f.anim.y += 0.6 * ry;
      // (the split step lands with the feet a little wider: each one out to its side)
      if (widen) {
        const s = i === 1 ? widen : -widen;
        f.anim.x += s * rx;
        f.anim.z += s * rz;
      }
      if (jump || !f.has) {
        f.mode = FREE;
        f.prev.copy(f.anim);
        f.out.copy(f.anim);
        f.vel.set(0, 0, 0);
        f.has = true;
      }
      // (how fast the animation moves the foot, smoothed: where a step aims)
      let fv = 0;
      if (dt > 0) {
        sA.subVectors(f.anim, f.prev).divideScalar(dt);
        sA.y = 0;
        fv = sA.length();
        if (fv > 6) sA.setLength(6);
        f.vel.lerp(sA, 1 - Math.exp(-12 * dt));
      }
      f.prev.copy(f.anim);
      // on the floor: low (on the move, lower: a running foot about to land is low a frame or two before it stops on
      // the ground, and put down there it would be left behind; the clips' feet also swing low, and are let go sooner)
      const low = f.sole < 0.035 - (f.mode === LOCKED ? 0.005 : 0.006) * Math.min(sp, 3) && !air;
      // (on the move, a foot comes down to stay where the clip stops it: the AI clips land a running foot still swinging
      // forward, at 5–8 m/s over the ground for a few frames; put down there it would skate in, or be left behind and
      // stretch the leg. It lands a moment later, where it slows down, or after LAND_T low whatever its speed)
      f.lowT = low && f.mode !== LOCKED ? f.lowT + dt : 0;
      const planted = low && (f.mode === LOCKED || sp < 1.2 || fv < LAND_V * sc || f.lowT > LAND_T);
      // (a foot set down again while waiting, see IDLE: a short step, both feet planted first)
      const fg = this.fidget && this.fidget.foot === i ? this.fidget : null;
      if (fg && fg.go === undefined && f.mode === LOCKED && o.mode === LOCKED && planted) {
        fg.go = this.idleT;
        f.mode = STEP;
        f.from.copy(f.lock);
        f.fromYaw = f.yaw;
        f.s = 0;
        f.dur = 0.26;
      }
      if (f.mode === LOCKED) {
        // lifted by the animation, or left behind by the body: it steps (one foot at a time, unless far behind)
        const dist = Math.hypot(f.anim.x - f.lock.x, f.anim.z - f.lock.z);
        // (running, the clip's stance foot and the ground disagree a little through each stride: it holds a bit longer)
        // (a burst from still: the first step comes sooner, the trailing leg is not left stretched out behind)
        const stretch = STRETCH * sc * (1 + 0.15 * Math.min(sp, 4)) * (1 - 0.4 * burst);
        // (and slow, a stance much wider than the clip's, both feet planted: the foot further off where the clip has it
        // steps in. Arriving at a run, the feet were left where the last strides put them, a metre or more apart, and the
        // hips going down for a low ball made a goalkeeper's crouch of it)
        let wide = false;
        if ((sp < WIDE.v || this.plantK > 0.5) && o.mode === LOCKED) {
          const now = Math.hypot(f.lock.x - o.lock.x, f.lock.z - o.lock.z);
          const want = Math.hypot(f.anim.x - o.anim.x, f.anim.z - o.anim.z);
          wide = now - want > WIDE.over * sc && dist >= Math.hypot(o.anim.x - o.lock.x, o.anim.z - o.lock.z);
        }
        const far = dist > stretch || wide || Math.abs(wrap(f.animYaw - f.yaw)) > TURN;
        if (!planted || !hold || (far && (o.mode !== STEP || o.s > 0.5 || dist > 1.6 * stretch))) {
          f.mode = STEP;
          f.from.copy(f.lock);
          f.fromYaw = f.yaw;
          f.s = 0;
          f.dur = clamp(0.11 + dist * 0.3, 0.12, 0.26);
        }
      }
      if (f.mode === LOCKED) {
        // (the heel coming up off a planted foot: it rolls onto the ball of the foot, which stays where it is)
        const roll = Math.max(0, f.lockToeH - f.toeH);
        sB.set(f.lock.x + Math.sin(f.yaw) * roll, f.anim.y, f.lock.z + Math.cos(f.yaw) * roll);
        f.outYaw = f.yaw;
      } else if (f.mode === STEP) {
        f.s = Math.min(1, f.s + dt / f.dur);
        // (off the floor first and down last: the foot travels while it is in the air, it does not skate)
        const u = smooth(0.08, 0.88, f.s);
        // to where the animation will have the foot when it lands (a short guess), in an arc over the floor
        sA.copy(f.vel).multiplyScalar((1 - f.s) * f.dur);
        if (sA.length() > (0.3 + 0.1 * sp) * sc) sA.setLength((0.3 + 0.1 * sp) * sc);
        sA.add(f.anim);
        // (the foot set down again: a few centimetres off, lifted only a little)
        if (fg && fg.go !== undefined) {
          sA.x += rx * fg.x + Math.sin(ya) * fg.z;
          sA.z += rz * fg.x + Math.cos(ya) * fg.z;
        }
        sB.copy(f.from).lerp(sA, u);
        sB.y = f.anim.y + LIFT * sc * Math.sin(Math.PI * f.s) * (planted ? (fg && fg.go !== undefined ? 0.45 : 1) : 0.4);
        f.outYaw = f.fromYaw + wrap(f.animYaw - f.fromYaw) * u;
      } else {
        sB.copy(f.anim);
        f.outYaw = f.animYaw;
      }
      // sideways, the shuffle clip swings the trailing foot past the leading one (a crossover, once a cycle): a foot off
      // the floor lands beside the other instead, at least CROSS_GAP to its own side, as in a shuffle
      if (side > 0 && f.mode !== LOCKED) {
        const s = i === 1 ? 1 : -1; // (the right foot is the second)
        const lat = (sB.x - o.out.x) * rx + (sB.z - o.out.z) * rz;
        const short = (CROSS_GAP * sc - s * lat) * side;
        if (short > 0) {
          sB.x += s * short * rx;
          sB.z += s * short * rz;
        }
      }
      // a foot moving fast over the floor (a running foot coming down, a step) is kept off it: the faster, the higher,
      // up to HOVER (sole over the floor); only a slow foot touches it
      if (f.mode !== LOCKED && dt > 0) {
        const vh = Math.min(footMax, Math.hypot(sB.x - f.out.x, sB.z - f.out.z) / dt);
        sB.y = Math.max(sB.y, f.anim.y - f.sole + HOVER * sc * smooth(0.5, 1.8, vh));
      }
      // (never faster than a quick foot: blends of clips can move the animated one a long way in a frame)
      sA.subVectors(sB, f.out);
      const lim = footMax * dt;
      if (sA.length() > lim) sA.setLength(lim);
      f.out.add(sA);
      if (f.mode === STEP && f.s >= 1) {
        if (planted && hold) {
          f.mode = LOCKED;
          f.lock.set(f.out.x, f.anim.y, f.out.z);
          f.yaw = f.outYaw;
          f.lockToeH = f.toeH;
        } else f.mode = FREE;
      } else if (f.mode === FREE && planted && hold) {
        f.mode = LOCKED;
        f.lock.copy(f.out);
        f.yaw = f.outYaw;
        f.lockToeH = f.toeH;
      }
      // the leg onto it: the knee where the animation points it, the foot turned as drawn
      wquat(f.ankle, sQ2);
      sQ.setFromAxisAngle(Y, wrap(f.outYaw - f.animYaw));
      sQ2.premultiply(sQ);
      wpos(f.knee, sS);
      wquat(hips, sQ);
      sAx.set(-1, 0, 0).applyQuaternion(sQ);
      twoBone(f.up, f.knee, f.ankle, f.out, 0.35, null, sAx, sS, 1, 0.5);
      wquat(f.knee, sQ3);
      f.ankle.quaternion.copy(sQ3.invert().multiply(sQ2));
      f.ankle.updateMatrixWorld(true);
    }
  }

  /**
   * The head turns to the ball in play (to the contact point around a swing), on top of what the clip does: at most
   * LOOK_MAX more, never more than LOOK_UP over the horizon, at most 14 rad/s (it never snaps from one thing to another),
   * and not to a ball behind it.
   */
  private headLook(dt: number, m: Match, c: Contact | null, tc: number, ball: { x: number; y: number; z: number } | null) {
    const head = this.bone.Head;
    const neck = this.bone.neck;
    if (!head || !neck) return;
    let want = 0;
    if (this.reaction) want = 0;
    else if (c && Math.abs(tc) < 0.3) {
      sBall.set(c.x, c.y, c.z);
      want = 0.9;
    } else if (ball && (m.phase === 'rally' || m.phase === 'serve')) {
      sBall.set(ball.x, ball.y, ball.z);
      want = 0.7;
    }
    wpos(head, sA);
    if (want > 0) {
      sD.copy(sBall).sub(sA);
      if (sD.lengthSq() < 0.04) want = 0;
      else {
        sD.normalize();
        if (sD.y > Math.sin(LOOK_UP)) {
          const h = Math.hypot(sD.x, sD.z);
          if (h > 1e-4) {
            const k = Math.cos(LOOK_UP) / h;
            sD.set(sD.x * k, Math.sin(LOOK_UP), sD.z * k);
          }
        }
        const a = this.lookW < 0.02 ? 0 : this.lookDir.angleTo(sD);
        if (a > 14 * dt) {
          sE.crossVectors(this.lookDir, sD);
          if (sE.lengthSq() > 1e-10) this.lookDir.applyAxisAngle(sE.normalize(), 14 * dt);
        } else this.lookDir.copy(sD);
      }
    }
    this.lookW += (want - this.lookW) * (1 - Math.exp(-5 * dt));
    if (this.lookW < 0.01) return;
    wquat(head, sQ);
    sE.copy(HEAD_FWD).applyQuaternion(sQ);
    sQ2.setFromUnitVectors(sE, this.lookDir);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(sQ2.w)));
    const k = (ang > LOOK_MAX ? LOOK_MAX / ang : 1) * this.lookW * (1 - smooth(2.3, 2.8, ang));
    if (k < 1e-3) return;
    rotateWorld(neck, sQ3.identity().slerp(sQ2, 0.4 * k));
    rotateWorld(head, sQ3.identity().slerp(sQ2, 0.6 * k));
  }

  /** Starts a swing timed to the contact at sim time `key`, `tc` seconds from it now (< 0: before). */
  private startSwing(kind: Swing, key: number, tc: number) {
    for (const s of this.shots) this.fadeOut(s, 0.15);
    this.reaction = null;
    if (kind === 'proc' || !this.has(kind)) {
      this.swing = { kind: 'proc', layer: null, w: 1, rate: 0, key, end: key + 0.5, react: false, t0: 0, run: 0 };
      this.shots.push(this.swing);
      return;
    }
    const def = SWINGS[kind];
    const k = this.a.contact[kind] ?? 0.8;
    // a free copy of the clip (the other may still be fading out)
    const copies = this.act[kind === 'serve' ? this.serveClip : kind] ?? this.act[kind];
    const L = copies.find((c) => !this.shots.some((s) => s.layer === c)) ?? copies[0];
    const old = this.shots.find((s) => s.layer === L);
    if (old) this.dropShot(old);
    // less time than the clip's wind-up: start later in the clip and play it faster (shortened, not cut)
    const left = -tc;
    const dur = L.up.getClip().duration;
    // (a clip with a long quiet lead-in starts part way: see SwingDef.lead)
    const lk = Math.min(k, def.lead ?? k);
    let t0 = k + tc;
    if (left > 0 && left < lk) t0 = Math.max(k - lk, k - left * 1.6);
    else if (left > 0) t0 = Math.max(t0, k - lk);
    if (tc < 0) t0 = Math.max(t0, def.start ?? 0);
    t0 = clamp(t0, 0, dur);
    for (const ac of [L.up, L.lo]) {
      ac.reset();
      ac.play();
      ac.time = t0;
      ac.setEffectiveWeight(0);
    }
    this.swing = { kind, layer: L, w: 0, rate: 1 / Math.max(0.12, def.fade), key, end: key + Math.max(0.2, def.out - k), react: false, t0, run: NaN };
    this.shots.push(this.swing);
  }

  /** the contact a swing is timed to moved (a refined plan): its clock follows (see the timeScale in update) */
  private retime(s: Shot, key: number) {
    s.end += key - s.key;
    s.key = key;
  }
  private fadeOut(s: Shot, len: number) {
    if (s.rate < 0) return;
    s.rate = -1 / len;
    if (!s.layer) s.w = 0;
  }
  private dropShot(s: Shot) {
    s.layer?.up.stop();
    s.layer?.lo.stop();
    const i = this.shots.indexOf(s);
    if (i >= 0) this.shots.splice(i, 1);
    if (this.swing === s) this.swing = null;
    if (this.reaction === s) this.reaction = null;
  }

  /** A reaction after a point (played once any swing is over, dropped if that takes too long). */
  react(kind: 'cheer' | 'lost', now: number) {
    if (!this.has(kind)) return;
    this.pending = { kind, until: now + 0.9 };
  }

  /** the mixer's pose, kept to put back before the next update (the IK and the bends go on top of it) */
  private keep() {
    const bones = this.bonesOf();
    const n = bones.length * 4 + 3;
    if (!this.base || this.base.length !== n) this.base = new Float32Array(n);
    const B = this.base;
    for (let i = 0; i < bones.length; i++) {
      const q = bones[i].quaternion;
      B[i * 4] = q.x;
      B[i * 4 + 1] = q.y;
      B[i * 4 + 2] = q.z;
      B[i * 4 + 3] = q.w;
    }
    const h = bones[0].position;
    B[n - 3] = h.x;
    B[n - 2] = h.y;
    B[n - 1] = h.z;
  }
  private restore() {
    const B = this.base;
    if (!B) return;
    const bones = this.bonesOf();
    for (let i = 0; i < bones.length; i++) bones[i].quaternion.set(B[i * 4], B[i * 4 + 1], B[i * 4 + 2], B[i * 4 + 3]);
    bones[0].position.set(B[B.length - 3], B[B.length - 2], B[B.length - 1]);
  }

  // ---------------------------------------------------------------- replays (read and put back the drawn pose)
  private poseBones: THREE.Object3D[] | null = null;
  private bonesOf(): THREE.Object3D[] {
    if (!this.poseBones) {
      const out: THREE.Object3D[] = [];
      this.model.traverse((o) => {
        if ((o as THREE.Bone).isBone) out.push(o);
      });
      // the hips first: their offset is kept too (the clips move them)
      const h = out.findIndex((o) => o.name === 'Hips');
      if (h > 0) out.unshift(...out.splice(h, 1));
      this.poseBones = out;
    }
    return this.poseBones;
  }
  /** Floats one pose takes: the body's place and turns, the hips' offset and a quaternion per bone. */
  get poseSize(): number {
    return 8 + this.bonesOf().length * 4;
  }
  /**
   * The pose as drawn this frame (after the clips, the IK and the bends), into `out` from `o`. Call after update().
   * Nothing here changes the character.
   */
  capturePose(out: Float32Array, o: number) {
    const r = this.root;
    const bones = this.bonesOf();
    const hips = bones[0];
    out[o] = r.position.x;
    out[o + 1] = r.position.y;
    out[o + 2] = r.position.z;
    out[o + 3] = r.rotation.y;
    out[o + 4] = this.model.rotation.y;
    out[o + 5] = hips ? hips.position.x : 0;
    out[o + 6] = hips ? hips.position.y : 0;
    out[o + 7] = hips ? hips.position.z : 0;
    for (let i = 0; i < bones.length; i++) {
      const q = bones[i].quaternion;
      const j = o + 8 + i * 4;
      out[j] = q.x;
      out[j + 1] = q.y;
      out[j + 2] = q.z;
      out[j + 3] = q.w;
    }
  }
  /**
   * Draws a recorded pose, `k` of the way from pose a to pose b (replays in slow motion). The live animation is not
   * touched: the next update() poses the body from the match again.
   */
  applyPose(a: Float32Array, ao: number, b: Float32Array, bo: number, k: number) {
    const bones = this.bonesOf();
    const l = (i: number) => a[ao + i] + (b[bo + i] - a[ao + i]) * k;
    const ang = (i: number) => {
      let d = b[bo + i] - a[ao + i];
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return a[ao + i] + d * k;
    };
    this.root.position.set(l(0), l(1), l(2));
    this.root.rotation.y = ang(3);
    this.model.rotation.y = ang(4);
    if (bones[0]) bones[0].position.set(l(5), l(6), l(7));
    for (let i = 0; i < bones.length; i++) {
      const j = 8 + i * 4;
      const q = bones[i].quaternion as THREE.Quaternion;
      // (the typings ask for arrays; typed arrays work the same)
      THREE.Quaternion.slerpFlat(qFlat, 0, a as unknown as number[], ao + j, b as unknown as number[], bo + j, k);
      q.set(qFlat[0], qFlat[1], qFlat[2], qFlat[3]);
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    // (the kit's textures may go once no one wears it; the skeleton's bone texture and the material go with the player)
    if (this.outfit) this.painter?.release(this.outfit);
    this.outfit = null;
    this.ownMap?.dispose();
    this.ownMap = null;
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) {
        m.skeleton.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}
