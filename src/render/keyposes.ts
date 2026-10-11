// Key poses built in code and baked into the clips as they load (no new animation files, nothing more to do per frame).
// The AI clips gave a ready stance like a waiter's (elbows at the sides, the paddle flat at the belly like a tray, the
// free hand open beside it, standing tall), a free arm flung out to the side in the serve and the backhand, and one
// drive for every forehand. Here the rig is posed on a copy of the model: an anatomical arm and leg (the elbow and the
// knee bend about their own hinge, measured on the clips; the forearm takes the twist; the wrist within its limits),
// placed by targets in the body's frame (the paddle face in front of the chest, the free hand at its throat, the feet
// where the clip has them), and the result is written back as the clip. The rest of the game (the swing IK, the
// blends, the feet) then works on these clips as before, at no cost per frame.
//
// The model faces +z, its right is −x; heights are for the 1.7 m model the clips are made on.

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const wqP = v3();
const wqS = v3();
/** an object's world orientation, read off its world matrix */
function wq(o: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
  o.matrixWorld.decompose(wqP, out, wqS);
  return out;
}

/** A copy of the model to pose and bake on: its bones, their bind pose, a mixer to read the clips. */
class Rig {
  obj: THREE.Object3D;
  B: Record<string, THREE.Bone> = {};
  bones: THREE.Bone[] = [];
  private bindQ: THREE.Quaternion[] = [];
  private bindP: THREE.Vector3;
  private mixer: THREE.AnimationMixer;
  /** metres per bone unit (the armature's scale) */
  unit: number;
  constructor(template: THREE.Object3D) {
    this.obj = cloneSkinned(template);
    this.obj.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        this.B[o.name] = o as THREE.Bone;
        this.bones.push(o as THREE.Bone);
      }
    });
    this.bindQ = this.bones.map((b) => b.quaternion.clone());
    this.bindP = this.B.Hips.position.clone();
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.obj.updateMatrixWorld(true);
    this.unit = this.B.Hips.parent!.getWorldScale(v3()).x;
  }
  /** the pose of `clip` at time t (every bone, from the bind pose: a clip that leaves a bone out leaves it at rest) */
  pose(clip: THREE.AnimationClip, t: number) {
    this.bones.forEach((b, i) => b.quaternion.copy(this.bindQ[i]));
    this.B.Hips.position.copy(this.bindP);
    this.mixer.stopAllAction();
    const ac = this.mixer.clipAction(clip);
    ac.reset();
    ac.setLoop(THREE.LoopOnce, 1);
    ac.clampWhenFinished = true;
    ac.play();
    this.mixer.setTime(Math.min(t, clip.duration - 1e-4));
    this.obj.updateMatrixWorld(true);
  }
  // (every change below brings the world matrices of what it moves up to date, so they are read as they are: three's
  // getWorldPosition walks up every parent again on each call)
  pos(name: string, out = v3()): THREE.Vector3 {
    return out.setFromMatrixPosition(this.B[name].matrixWorld);
  }
  quat(name: string, out = new THREE.Quaternion()): THREE.Quaternion {
    return wq(this.B[name], out);
  }
  /** the bone turned to world orientation q (its children follow) */
  setWorld(b: THREE.Object3D, q: THREE.Quaternion) {
    const p = wq(b.parent!, new THREE.Quaternion());
    b.quaternion.copy(p.invert().multiply(q));
    b.updateMatrixWorld(true);
  }
  /** the bone turned by the world rotation q */
  turn(b: THREE.Object3D, q: THREE.Quaternion) {
    const w = wq(b, new THREE.Quaternion());
    this.setWorld(b, q.clone().multiply(w));
  }
  /** the hips moved by d (m, world) */
  moveHips(d: THREE.Vector3) {
    this.B.Hips.position.addScaledVector(d, 1 / this.unit);
    this.B.Hips.updateMatrixWorld(true);
  }
  /** the current pose as one sample of every bone's turn and the hips' offset */
  grab(): { q: number[]; p: number[] } {
    const q: number[] = [];
    for (const b of this.bones) q.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const h = this.B.Hips.position;
    return { q, p: [h.x, h.y, h.z] };
  }
  /**
   * The samples as a clip; with `only`, just those bones' turns are taken from the samples and every other track is
   * `base`'s own (its legs are not resampled, and the pass that changes only an arm can sample it more sparsely).
   */
  bake(name: string, times: number[], samples: { q: number[]; p: number[] }[], only?: string[], base?: THREE.AnimationClip): THREE.AnimationClip {
    const tracks: THREE.KeyframeTrack[] = [];
    const keep = only && base ? new Set(only) : null;
    this.bones.forEach((b, i) => {
      if (keep && !keep.has(b.name)) return;
      const v = new Float32Array(times.length * 4);
      // (each sample on the same side of the sphere as the one before: no flips in the interpolation)
      for (let k = 0; k < times.length; k++) {
        const s = samples[k].q;
        let x = s[i * 4];
        let y = s[i * 4 + 1];
        let z = s[i * 4 + 2];
        let w = s[i * 4 + 3];
        if (k && x * v[(k - 1) * 4] + y * v[(k - 1) * 4 + 1] + z * v[(k - 1) * 4 + 2] + w * v[(k - 1) * 4 + 3] < 0) {
          x = -x;
          y = -y;
          z = -z;
          w = -w;
        }
        v.set([x, y, z, w], k * 4);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, v));
    });
    if (keep && base) {
      for (const t of base.tracks) if (!keep.has(t.name.slice(0, t.name.indexOf('.')))) tracks.push(t);
      return new THREE.AnimationClip(name, base.duration, tracks);
    }
    const hp = new Float32Array(times.length * 3);
    samples.forEach((s, k) => hp.set(s.p, k * 3));
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hp));
    return new THREE.AnimationClip(name, times[times.length - 1], tracks);
  }
}

/**
 * A limb's hinge (the elbow, the knee) in its upper bone's frame, measured on the clips: the axis it bends about, as
 * (b−a)×(c−b) over every frame where it bends more than 20°.
 */
function hingesOf(r: Rig, clips: THREE.AnimationClip[], limbs: [string, string, string][]): THREE.Vector3[] {
  const acc = limbs.map(() => v3());
  const A = v3();
  const Bp = v3();
  const C = v3();
  const q = new THREE.Quaternion();
  for (const clip of clips)
    for (let t = 0; t < clip.duration; t += 1 / 5) {
      r.pose(clip, t);
      limbs.forEach(([a, b, c], i) => {
        r.pos(a, A);
        r.pos(b, Bp);
        r.pos(c, C);
        const u = Bp.clone().sub(A);
        const lo = C.clone().sub(Bp);
        if (u.angleTo(lo) < 0.35) return;
        acc[i].add(u.cross(lo).normalize().applyQuaternion(r.quat(a, q).invert()));
      });
    }
  // (perpendicular to the bone)
  return acc.map((h) => {
    h.y = 0;
    return h.lengthSq() > 1e-8 ? h.normalize() : v3(1, 0, 0);
  });
}

/**
 * The hinges of this rig (the right and left elbows, the left and right knees) in their upper bone's frame, as
 * hingesOf measures them on the clips (tools only: measured at load they cost a tenth of a second); the right elbow's
 * is chars.ts's ELBOW_HINGE.
 */
const HINGES: [number, number, number][] = [
  [0.8865, 0, -0.4628],
  [0.9628, 0, 0.2701],
  [0.9898, 0, 0.1423],
  [0.9906, 0, -0.1369],
];

/**
 * Two-bone IK with an anatomical hinge: the upper bone a points so the joint b lies towards `pole` (a world point)
 * and turns about itself so its hinge is the bend's axis; the lower bone b bends about that hinge only, onto the
 * target; nothing bends the wrong way. (Within reach: a target too far is reached as far as the limb goes.)
 */
function limb(r: Rig, a: string, b: string, c: string, hinge: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3) {
  const A = r.pos(a);
  const Bp = r.pos(b);
  const C = r.pos(c);
  const l1 = A.distanceTo(Bp);
  const l2 = Bp.distanceTo(C);
  const toT = target.clone().sub(A);
  const u = toT.clone().normalize();
  const d = clamp(toT.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
  const p = pole.clone().sub(A);
  p.addScaledVector(u, -p.dot(u));
  if (p.lengthSq() < 1e-8) p.set(0, -1, 0).addScaledVector(u, u.y);
  p.normalize();
  const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sa = Math.sqrt(1 - ca * ca);
  const E = A.clone().addScaledVector(u, l1 * ca).addScaledVector(p, l1 * sa);
  const d1 = E.clone().sub(A).normalize();
  const d2 = A.clone().addScaledVector(u, d).sub(E).normalize();
  const hw = d1.clone().cross(d2);
  if (hw.lengthSq() < 1e-6) hw.copy(p).cross(d1);
  hw.normalize();
  // the upper bone: its y along d1, its hinge along hw
  const hl = hinge.clone().addScaledVector(Y, -hinge.dot(Y)).normalize();
  const mL = new THREE.Matrix4().makeBasis(Y, hl, Y.clone().cross(hl));
  const mW = new THREE.Matrix4().makeBasis(d1, hw, d1.clone().cross(hw));
  const q = new THREE.Quaternion().setFromRotationMatrix(mW.multiply(mL.transpose()));
  r.setWorld(r.B[a], q);
  // the lower bone: about the hinge onto d2, then whatever is left over (the clip's bone off the hinge plane)
  const by = Y.clone().applyQuaternion(r.quat(b));
  const bp = by.clone().addScaledVector(hw, -by.dot(hw));
  const dp = d2.clone().addScaledVector(hw, -d2.dot(hw));
  if (bp.lengthSq() > 1e-8 && dp.lengthSq() > 1e-8) {
    const ang = Math.atan2(bp.clone().cross(dp).dot(hw), bp.dot(dp));
    r.turn(r.B[b], new THREE.Quaternion().setFromAxisAngle(hw, ang));
  }
  const by2 = Y.clone().applyQuaternion(r.quat(b));
  if (by2.angleTo(d2) > 1e-3) r.turn(r.B[b], new THREE.Quaternion().setFromUnitVectors(by2, d2));
}

/** Splits q (a turn off a bone's rest) into its twist about the bone (its y) and the rest, and limits each. */
function limitTurn(q: THREE.Quaternion, maxBend: number, maxTwist: number) {
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const n = Math.hypot(q.y, q.w);
  const ty = n > 1e-9 ? q.y / n : 0;
  const tw = n > 1e-9 ? q.w / n : 1;
  const twist = new THREE.Quaternion(0, ty, 0, tw);
  const bend = q.clone().multiply(twist.clone().invert());
  const t = clamp(2 * Math.atan2(ty, tw), -maxTwist, maxTwist);
  const ba = 2 * Math.acos(Math.min(1, Math.abs(bend.w)));
  if (ba > maxBend) bend.slerp(new THREE.Quaternion(), 1 - maxBend / ba);
  q.copy(bend).multiply(new THREE.Quaternion(0, Math.sin(t / 2), 0, Math.cos(t / 2)));
}

/** the wrist (rad): how far it bends and twists; the forearm takes the twist beyond that, up to FORE */
const WRIST_BEND = 1.0;
const WRIST_TWIST = 0.35;
const FORE = 1.4;

/**
 * The hand turned to world orientation `want` as far as a wrist goes: the twist about the forearm is the forearm's
 * (up to FORE off the pose it has), the rest is the wrist's, within its limits. Returns how far off it ends (rad).
 */
function orientHand(r: Rig, fore: string, hand: string, rest: THREE.Quaternion, want: THREE.Quaternion): number {
  const fo = r.B[fore];
  const hd = r.B[hand];
  const rel = () => rest.clone().invert().multiply(r.quat(fore).invert().multiply(want));
  let off = rel();
  if (off.w < 0) off.set(-off.x, -off.y, -off.z, -off.w);
  const tw = 2 * Math.atan2(off.y, off.w);
  const take = clamp(tw, -FORE, FORE);
  fo.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Y, take));
  fo.updateMatrixWorld(true);
  off = rel();
  limitTurn(off, WRIST_BEND, WRIST_TWIST);
  hd.quaternion.copy(rest).multiply(off);
  hd.updateMatrixWorld(true);
  return r.quat(hand).angleTo(want);
}

/** the paddle in the right hand (from chars.ts: rotation and offset in the hand's frame, the offset in bone units) */
export interface Grip {
  rot: THREE.Quaternion;
  off: THREE.Vector3;
  /** the middle of the face up the paddle (m) */
  face: number;
}

/** The world orientation of a paddle whose head points along `axis` and whose face looks along `normal`. */
function paddleQuat(axis: THREE.Vector3, normal: THREE.Vector3): THREE.Quaternion {
  const a = axis.clone().normalize();
  const n = normal.clone().addScaledVector(a, -normal.dot(a)).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(n, a, n.clone().cross(a)));
}

/** what the bake needs to know of the rig: the hinges and the hands' rest */
interface Kin {
  hingeR: THREE.Vector3;
  hingeL: THREE.Vector3;
  kneeL: THREE.Vector3;
  kneeR: THREE.Vector3;
  restR: THREE.Quaternion;
  restL: THREE.Quaternion;
  grip: Grip;
}

/**
 * The paddle held at `face` (the middle of its face, world) along axis / normal (the face is two-sided: whichever way
 * round the wrist takes better), the elbow towards `pole`. Returns the paddle's orientation as held.
 */
function holdPaddle(r: Rig, k: Kin, at: { face?: THREE.Vector3; wrist?: THREE.Vector3 }, axis: THREE.Vector3, normal: THREE.Vector3, pole: THREE.Vector3): THREE.Quaternion {
  const g = k.grip;
  const bones = ['RightArm', 'RightForeArm', 'RightHand'];
  const save = bones.map((n) => r.B[n].quaternion.clone());
  const sh = r.pos('RightArm');
  let best: { err: number; q: number[] } | null = null;
  // (the face either way round: whichever bends the wrist least)
  for (const s of [1, -1])
    for (const sw of [0]) {
      const qp = paddleQuat(axis, normal.clone().multiplyScalar(s));
      const qh = qp.clone().multiply(g.rot.clone().invert());
      const wrist = at.wrist ? at.wrist.clone() : at.face!.clone().addScaledVector(axis.clone().normalize(), -g.face).sub(g.off.clone().multiplyScalar(r.unit).applyQuaternion(qh));
      bones.forEach((n, i) => r.B[n].quaternion.copy(save[i]));
      r.B.RightArm.updateMatrixWorld(true);
      const line = wrist.clone().sub(sh).normalize();
      const pl = pole.clone().sub(sh).applyAxisAngle(line, sw).add(sh);
      limb(r, 'RightArm', 'RightForeArm', 'RightHand', k.hingeR, wrist, pl);
      const miss = orientHand(r, 'RightForeArm', 'RightHand', k.restR, qh);
      const off = k.restR.clone().invert().multiply(r.B.RightHand.quaternion);
      const bend = 2 * Math.acos(Math.min(1, Math.abs(off.w)));
      const err = miss + r.pos('RightHand').distanceTo(wrist) * 3 + bend * 0.35 + Math.abs(sw) * 0.25;
      if (!best || err < best.err) best = { err, q: bones.flatMap((n) => r.B[n].quaternion.toArray()) };
    }
  bones.forEach((n, i) => r.B[n].quaternion.fromArray(best!.q, i * 4));
  r.B.RightArm.updateMatrixWorld(true);
  return r.B.RightHand.getWorldQuaternion(new THREE.Quaternion()).multiply(g.rot);
}

/** where the right hand's paddle is: its grip end, its axis, its face normal (world) */
function paddleNow(r: Rig, k: Kin) {
  const qh = r.quat('RightHand');
  const qp = qh.clone().multiply(k.grip.rot);
  const grip = r.pos('RightHand').add(k.grip.off.clone().multiplyScalar(r.unit).applyQuaternion(qh));
  return { grip, axis: Y.clone().applyQuaternion(qp), normal: X.clone().applyQuaternion(qp), q: qp };
}

/**
 * The free hand to `palm` (world: where the middle of the palm goes), the elbow towards `pole`; the hand in line
 * with the forearm, its fingers turned `aim` of the way towards `point` (a world point), within the wrist's limits.
 */
function freeHand(r: Rig, k: Kin, palm: THREE.Vector3, pole: THREE.Vector3, point?: THREE.Vector3, aim = 0.6, palmTo?: THREE.Vector3) {
  // (the wrist a hand's breadth back from the palm, along the forearm's way to it)
  const sh = r.pos('LeftArm');
  const dir = palm.clone().sub(sh).normalize();
  const wrist = palm.clone().addScaledVector(dir, -0.075);
  // (never further than a bent arm reaches: a free hand going for a paddle out of reach stretched the arm straight)
  const reach = (r.pos('LeftForeArm').distanceTo(sh) + r.pos('LeftHand').distanceTo(r.pos('LeftForeArm'))) * 0.9;
  if (wrist.distanceTo(sh) > reach) wrist.sub(sh).setLength(reach).add(sh);
  limb(r, 'LeftArm', 'LeftForeArm', 'LeftHand', k.hingeL, wrist, pole);
  // the hand at rest on the forearm (a straight wrist), then turned to point
  const hd = r.B.LeftHand;
  hd.quaternion.copy(k.restL);
  hd.updateMatrixWorld(true);
  // the palm turned by the forearm (pronation) to face `palmTo`: by default in, towards the body's middle and a
  // little down, the thumb up (the clips held it open and up, like a waiter's)
  {
    const f = v3(0, 0, 1).applyQuaternion(r.quat('Spine'));
    const want = palmTo ?? v3(-f.z, -0.45, f.x).normalize();
    const ax = Y.clone().applyQuaternion(r.quat('LeftForeArm'));
    const p1 = PALM_L.clone().applyQuaternion(r.quat('LeftHand'));
    p1.addScaledVector(ax, -p1.dot(ax));
    const p2 = want.clone().addScaledVector(ax, -want.dot(ax));
    if (p1.lengthSq() > 1e-6 && p2.lengthSq() > 1e-6) {
      const ang = clamp(Math.atan2(p1.clone().cross(p2).dot(ax), p1.dot(p2)), -1.4, 1.4);
      r.B.LeftForeArm.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Y, ang));
      r.B.LeftForeArm.updateMatrixWorld(true);
    }
  }
  if (point) {
    const w = r.pos('LeftHand');
    const fy = Y.clone().applyQuaternion(r.quat('LeftHand'));
    const to = point.clone().sub(w).normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(fy, to);
    const want = new THREE.Quaternion().slerp(turn, aim).multiply(r.quat('LeftHand'));
    orientHand(r, 'LeftForeArm', 'LeftHand', k.restL, want);
  }
}

/** the left palm's normal in the hand bone's frame (measured: the clips' open hand faced up along −x) */
const PALM_L = new THREE.Vector3(-1, 0, 0);

/** The legs back onto `feet` (each foot's ankle and its orientation, world), the knees towards where they point. */
function plantFeet(r: Rig, k: Kin, feet: { ankle: THREE.Vector3; q: THREE.Quaternion; knee: THREE.Vector3 }[]) {
  ['Left', 'Right'].forEach((s, i) => {
    const f = feet[i];
    // (the knee forward over the toes and a touch out)
    const pole = f.knee.clone().add(v3(i ? -0.06 : 0.06, 0, 0.45));
    limb(r, `${s}UpLeg`, `${s}Leg`, `${s}Foot`, i ? k.kneeR : k.kneeL, f.ankle, pole);
    r.setWorld(r.B[`${s}Foot`], f.q);
  });
}

function feetOf(r: Rig) {
  return ['Left', 'Right'].map((s) => ({ ankle: r.pos(`${s}Foot`), q: r.quat(`${s}Foot`), knee: r.pos(`${s}Leg`) }));
}

/**
 * The body lowered into an athletic stance: the hips `drop` lower and `back` further back (m), the pelvis tipped
 * forward `hip` and the back `spine` more (rad), the head kept up; the feet stay where they were, each `narrow` (m)
 * nearer the middle.
 */
function crouch(r: Rig, k: Kin, drop: number, back: number, hip: number, spine: number, narrow: number) {
  const feet = feetOf(r);
  for (const f of feet) f.ankle.x -= Math.sign(f.ankle.x) * Math.min(narrow, Math.max(0, Math.abs(f.ankle.x) - 0.12));
  r.moveHips(v3(0, -drop, -back));
  const qh = new THREE.Quaternion().setFromAxisAngle(X, hip);
  r.turn(r.B.Hips, qh);
  // (the legs are put back on the feet below; the trunk goes on tipping up the back)
  if (spine) {
    r.turn(r.B.Spine02, new THREE.Quaternion().setFromAxisAngle(X, spine * 0.5));
    r.turn(r.B.Spine01, new THREE.Quaternion().setFromAxisAngle(X, spine * 0.5));
  }
  // the head up: the neck and the head take back most of the tip
  const t = hip + spine;
  r.turn(r.B.neck, new THREE.Quaternion().setFromAxisAngle(X, -t * 0.45));
  r.turn(r.B.Head, new THREE.Quaternion().setFromAxisAngle(X, -t * 0.35));
  plantFeet(r, k, feet);
}

/** Where the chest is (the Spine bone, world): the targets of the arms are set from it. */
function chestAt(r: Rig) {
  return r.pos('Spine');
}

/**
 * The ready stance of pickleball: knees bent, hips back, the trunk forward, the weight on the front of the feet; the
 * paddle up in front of the chest, its head up and its face to the net, the elbows in front of the body; the free hand
 * at the paddle's throat. Measures (the 1.7 m model): see GUARD.
 */
export const GUARD = {
  /** the crouch: hips lower and back (m), pelvis and back tipped forward (rad), each foot nearer the middle (m) */
  drop: 0.055,
  back: 0.045,
  hip: 0.2,
  spine: 0.08,
  narrow: 0.03,
  /**
   * the paddle hand's wrist from the chest bone (m: right, up, forward): in front of the navel, the elbow bent about
   * 80° in front of the body (the paddle's face then sits in front of the chest)
   */
  wrist: [0.1, -0.25, 0.17],
  /** the paddle's head: tipped forward from upright and towards the middle (rad) */
  tilt: 0.68,
  inward: 0.1,
  /** where the paddle elbow goes from the shoulder (m: right, up, forward) */
  elbow: [0.14, -0.45, 0.32],
  /** the free palm from a point `up` the paddle (m) from its grip end (m: left, up, forward): at the face's edge */
  up: 0.13,
  palm: [0.09, -0.02, -0.03],
};
/** the drive's finish: the paddle wrist from the chest (m: left, up, forward, in the chest's heading), the paddle's
 * head (back over the left shoulder) and where the elbow goes from the shoulder */
export const DRIVE_FINISH = { wrist: [0.12, -0.01, 0.28] as [number, number, number], axis: [0.35, 0.7, -0.62] as [number, number, number], elbow: [-0.1, -0.15, 0.35] as [number, number, number] };
/** the volley's punch: the wrist off the ready stance going back, and out to the ball (m: right, up, forward), and the
 * paddle's head tipped forward at the contact (rad from upright: the face a little open) */
export const VOLLEY = { back: [0.03, 0.02, -0.07], out: [-0.02, 0.04, 0.07], tilt: 0.38 };
/** running: the paddle wrist's middle from the chest bone (m: right, up, forward), how much of the clip's arm swing
 * is kept, and the paddle's head tipped forward from upright (rad) */
export const RUN_CARRY = { wrist: [0.15, -0.3, 0.15], swing: 0.4, tilt: 0.8 };
/** on the move (sideways, backwards): the same guard a little lower, the free hand a little off the paddle */
export const GUARD_MOVE = { ...GUARD, wrist: [0.1, -0.26, 0.2], palm: [0.15, -0.06, -0.03] };

function guardArms(r: Rig, k: Kin, g = GUARD) {
  const c = chestAt(r);
  const wrist = c.clone().add(v3(-g.wrist[0], g.wrist[1], g.wrist[2]));
  const axis = v3(Math.sin(g.inward), Math.cos(g.tilt), Math.sin(g.tilt)).normalize();
  // (the face to the net: the forward direction square to the paddle)
  const normal = v3(...((g as { normal?: [number, number, number] }).normal ?? [0, 0, 1]));
  const sh = r.pos('RightArm');
  const pole = sh.clone().add(v3(-g.elbow[0], g.elbow[1], g.elbow[2]));
  holdPaddle(r, k, { wrist }, axis, normal, pole);
  const P = paddleNow(r, k);
  const palm = P.grip.clone().addScaledVector(P.axis, g.up).add(v3(g.palm[0], g.palm[1], g.palm[2]));
  const shL = r.pos('LeftArm');
  freeHand(r, k, palm, shL.clone().add(v3(0.3, -0.4, 0.25)), P.grip.clone().addScaledVector(P.axis, 0.3), 0.5);
}

/**
 * Between points: standing easy, the paddle held loosely in front at the waist (its head forward and up as in the
 * ready stance, its edge to the net: going from one to the other turns the paddle about itself and lowers it; a
 * paddle let down by the side went flat as a tray halfway), the free hand on its edge, the elbows by the body; upright.
 */
export const REST = {
  drop: 0.012,
  back: 0.012,
  hip: 0.07,
  spine: 0.02,
  guard: { ...GUARD, wrist: [0.12, -0.26, 0.18], tilt: 0.95, elbow: [0.12, -0.45, 0.05], up: 0.16, palm: [0.1, -0.03, -0.02], normal: [1, 0, 0.35] as [number, number, number] },
};

function restArms(r: Rig, k: Kin, g = REST) {
  guardArms(r, k, g.guard);
}

/**
 * The server, before the wind-up: the ball held in the free hand in front of the body at the waist (the arm bent,
 * the palm up), the paddle down by the right side, its head low and its face to the net, ready to go back.
 */
/**
 * The serve: the free hand lets the ball go this long before the contact (s). It falls from the hand, bounces once
 * and is met on its way up at the contact height (view.ts draws that flight; match.ts, SERVE_WINDUP: the wind-up is
 * 0.87 s).
 */
export const SERVE_DROP = 0.8;
export const SERVE_SET = {
  drop: 0.025,
  back: 0.025,
  hip: 0.17,
  spine: 0.06,
  /** the ball's palm and the paddle wrist from the chest bone (m: right, up, forward) */
  palm: [0.0, -0.3, 0.27],
  wrist: [0.24, -0.35, 0.08],
};

function serveSetArms(r: Rig, k: Kin, g = SERVE_SET) {
  const c = chestAt(r);
  const shL = r.pos('LeftArm');
  const palm = c.clone().add(v3(-g.palm[0], g.palm[1], g.palm[2]));
  freeHand(r, k, palm, shL.clone().add(v3(0.25, -0.45, 0.05)), palm.clone().add(v3(-0.1, 0.02, 0.3)), 0.5);
  const wrist = c.clone().add(v3(-g.wrist[0], g.wrist[1], g.wrist[2]));
  const sh = r.pos('RightArm');
  holdPaddle(r, k, { wrist }, v3(-0.12, -0.9, 0.38), v3(0, 0, 1), sh.clone().add(v3(-0.25, -0.35, -0.1)));
}

const ARM_R = ['RightArm', 'RightForeArm', 'RightHand'];
const ARM_L = ['LeftArm', 'LeftForeArm', 'LeftHand'];
/** the arm's bones as they are now (local turns) */
function armNow(r: Rig, bones: string[]): THREE.Quaternion[] {
  return bones.map((n) => r.B[n].quaternion.clone());
}
/** the arm put `w` of the way from pose `a` to pose `b` (local turns) */
function armMix(r: Rig, bones: string[], a: THREE.Quaternion[], b: THREE.Quaternion[], w: number) {
  bones.forEach((n, i) => r.B[n].quaternion.copy(a[i]).slerp(b[i], w));
  r.B[bones[0]].updateMatrixWorld(true);
}

/**
 * A free-hand path through a clip: keys at clip times, each a palm place from the chest bone (m: left, up, forward,
 * in the chest's heading) or, with `at`, a point given by a function of the rig (the paddle's throat…), and an elbow
 * pole from the shoulder; between keys the place eases from one to the next.
 */
interface FreeKey {
  t: number;
  p?: [number, number, number];
  at?: (r: Rig) => THREE.Vector3;
  pole?: [number, number, number];
}
function freeAlong(r: Rig, k: Kin, keys: FreeKey[], t: number) {
  const c = chestAt(r);
  // the chest's heading (its forward flattened)
  const f = v3(0, 0, 1).applyQuaternion(r.quat('Spine'));
  const yaw = Math.atan2(f.x, f.z);
  const place = (key: FreeKey) => (key.at ? key.at(r) : c.clone().add(v3(key.p![0], key.p![1], key.p![2]).applyAxisAngle(Y, yaw)));
  const pole = (key: FreeKey) => v3(...(key.pole ?? [0.3, -0.45, 0])).applyAxisAngle(Y, yaw);
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[Math.min(keys.length - 1, i + 1)];
  const u = b === a ? 0 : smooth(a.t, b.t, t);
  const palm = place(a).lerp(place(b), u);
  const pl = pole(a).lerp(pole(b), u).add(r.pos('LeftArm'));
  freeHand(r, k, palm, pl);
}

/** a point on the paddle as the clip holds it: `up` (m) from its grip end, moved by `off` (m, world) */
const onPaddle = (k: Kin, up: number, off: [number, number, number]) => (r: Rig) => {
  const P = paddleNow(r, k);
  return P.grip.addScaledVector(P.axis, up).add(v3(...off));
};
let KIN: Kin | null = null;
const onThroat = (r: Rig) => onPaddle(KIN!, 0.15, [0.02, -0.03, -0.03])(r);

/**
 * The free arm through each swing (palm places from the chest, m: left, up, forward, in the chest's heading; at clip
 * times; the contact of each clip: drive and volley 0.46 s, backhand 0.95, dink 1.58, lunge 1.13, stretched backhand
 * 1.27, smash 0.9). It never flies out to the side or hangs stiff: it balances the swing, in front of the body.
 *  · drive: it points at the coming ball as the paddle goes back, and comes in to the left side through the contact
 *  · volley: it stays by the chest (a short punch)
 *  · backhand: on the paddle's throat as it goes back, then let go and back for balance
 *  · dink: out in front on the left, for balance
 *  · the lunges: back and out for balance, the elbow bent
 *  · smash: it points up at the ball, then pulls down to the chest
 */
const FREE: Record<string, FreeKey[]> = {
  drive: [
    { t: 0, p: [0.06, -0.22, 0.3] },
    { t: 0.18, p: [-0.06, -0.06, 0.42], pole: [0.3, -0.4, -0.05] },
    { t: 0.4, p: [0.08, -0.14, 0.36] },
    { t: 0.58, p: [0.22, -0.24, 0.2], pole: [0.32, -0.42, -0.1] },
    { t: 0.85, p: [0.2, -0.3, 0.16] },
    { t: 1.4, p: [0.1, -0.26, 0.26] },
  ],
  volley: [
    { t: 0, p: [0.06, -0.2, 0.3] },
    { t: 0.36, p: [0.08, -0.18, 0.32] },
    { t: 0.58, p: [0.16, -0.22, 0.26] },
    { t: 1.0, p: [0.08, -0.22, 0.3] },
  ],
  backhand: [
    { t: 0, p: [0.06, -0.22, 0.3] },
    { t: 0.3, at: onThroat, pole: [0.25, -0.45, 0.1] },
    { t: 0.8, at: onThroat, pole: [0.25, -0.45, 0.1] },
    { t: 1.02, p: [0.32, -0.22, -0.1], pole: [0.3, -0.35, -0.25] },
    { t: 1.35, p: [0.3, -0.25, -0.04], pole: [0.3, -0.4, -0.2] },
    { t: 1.9, p: [0.12, -0.26, 0.22] },
  ],
  dink: [
    { t: 0, p: [0.08, -0.22, 0.3] },
    { t: 0.8, p: [0.22, -0.3, 0.32] },
    { t: 1.58, p: [0.25, -0.28, 0.3] },
    { t: 2.0, p: [0.2, -0.3, 0.28] },
  ],
  lunge: [
    { t: 0, p: [0.08, -0.22, 0.3] },
    { t: 0.55, p: [0.24, -0.25, 0.12], pole: [0.35, -0.35, -0.15] },
    { t: 1.03, p: [0.28, -0.24, -0.02], pole: [0.35, -0.3, -0.25] },
    { t: 1.45, p: [0.27, -0.25, 0.03], pole: [0.35, -0.35, -0.2] },
    { t: 2.0, p: [0.14, -0.25, 0.2] },
  ],
  lunge_left: [
    { t: 0.8, p: [0.15, -0.2, 0.15] },
    { t: 1.17, p: [0.24, -0.24, -0.12], pole: [0.3, -0.3, -0.25] },
    { t: 1.6, p: [0.23, -0.25, -0.07], pole: [0.3, -0.35, -0.2] },
    { t: 2.2, p: [0.12, -0.25, 0.2] },
  ],
  smash: [
    { t: 0, p: [0.08, -0.15, 0.3] },
    { t: 0.45, p: [0.1, 0.36, 0.26], pole: [0.38, 0.0, 0.15] },
    { t: 0.78, p: [0.1, 0.3, 0.26], pole: [0.38, 0.0, 0.15] },
    { t: 0.97, p: [0.12, -0.1, 0.26] },
    { t: 1.25, p: [0.15, -0.28, 0.16] },
    { t: 1.8, p: [0.1, -0.25, 0.22] },
  ],
};

/**
 * The paddle's face at the contact of each swing (s into the clip, rad tipped up from facing straight ahead): the
 * clips met the ball with the face 68° off where the ball goes (80° in the drive: nearly edge-on). Around the contact
 * the paddle is turned about itself (the forearm and the wrist) to face forward: open for a dink, a little for drives
 * and volleys, closed for a smash. (Not the lunges: at full stretch the paddle in line with the arm reaches furthest,
 * and turned it missed the ball by 10–30 cm. Nor the serve: its paddle points ahead at the contact, the head under
 * the wrist as the rules want, and no turn about itself brings its face round.)
 */
const FACE: Record<string, { k: number; tilt: number }> = {
  drive: { k: 0.46, tilt: 0.1 },
  volley: { k: 0.46, tilt: 0.12 },
  backhand: { k: 0.95, tilt: 0.12 },
  dink: { k: 1.58, tilt: 0.55 },
  smash: { k: 0.9, tilt: -0.2 },
};
/** how much of the turn, and over how long round the contact it comes in (s: all of it within `near`) */
const FACE_K = 0.9;
const FACE_NEAR = 0.08;
const FACE_FAR = 0.32;

/** the turn about the paddle's axis that brings its face (either side) to `want`, from the side `side` (±1) */
function rollTo(r: Rig, k: Kin, want: THREE.Vector3, side: number): number {
  const P = paddleNow(r, k);
  const n1 = P.normal.addScaledVector(P.axis, -P.normal.dot(P.axis));
  const n2 = want.clone().multiplyScalar(side).addScaledVector(P.axis, -want.dot(P.axis) * side);
  if (n1.lengthSq() < 1e-8 || n2.lengthSq() < 1e-8) return 0;
  return Math.atan2(n1.clone().cross(n2).dot(P.axis), n1.dot(n2));
}

/** A swing clip with its paddle face turned forward round the contact (see FACE). */
function faceForward(r: Rig, k: Kin, c: THREE.AnimationClip, name: string, at?: number): THREE.AnimationClip {
  const F = { ...FACE[name], k: at ?? FACE[name].k };
  const want = v3(0, Math.sin(F.tilt), Math.cos(F.tilt));
  const times = timesOf(c.duration, 20);
  // the turn wanted at each frame, from the face nearer at the contact, unwrapped and smoothed
  r.pose(c, F.k);
  const side = Math.abs(rollTo(r, k, want, 1)) <= Math.abs(rollTo(r, k, want, -1)) ? 1 : -1;
  const raw = times.map((t) => {
    if (Math.abs(t - F.k) > FACE_FAR + 0.05) return 0;
    r.pose(c, t);
    return rollTo(r, k, want, side);
  });
  for (let i = 1; i < raw.length; i++) while (Math.abs(raw[i] - raw[i - 1]) > Math.PI) raw[i] -= Math.sign(raw[i] - raw[i - 1]) * 2 * Math.PI;
  const roll = raw.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(raw.length - 1, i + 2); j++) {
      s += raw[j];
      n++;
    }
    return (s / n) * FACE_K * (1 - smooth(FACE_NEAR, FACE_FAR, Math.abs(times[i] - F.k)));
  });
  return r.bake(
    name,
    times,
    times.map((t, i) => {
      r.pose(c, t);
      if (Math.abs(roll[i]) > 1e-4) {
        const P = paddleNow(r, k);
        const want = new THREE.Quaternion().setFromAxisAngle(P.axis, roll[i]).multiply(r.quat('RightHand'));
        orientHand(r, 'RightForeArm', 'RightHand', k.restR, want);
      }
      return r.grab();
    }),
    ['RightForeArm', 'RightHand'],
    c,
  );
}

/** sample times of a clip, `fps` a second */
function timesOf(dur: number, fps = 30): number[] {
  const n = Math.max(2, Math.round(dur * fps) + 1);
  return Array.from({ length: n }, (_, i) => (dur * i) / (n - 1));
}

/**
 * Rewrites the clips (in place) with the key poses built here; `grip` is the paddle in the hand (chars.ts).
 *  · ready: the pickleball ready stance (GUARD), on the clip's own small movements of the legs and the hips
 * `mocap`: the swings played from motion capture (chars.ts MOCAP) and their contact (s): their free arm and the
 * drive's finish are left as captured; the paddle's face is turned at their own contact.
 */
export function refineClips(template: THREE.Object3D, clips: Record<string, THREE.AnimationClip>, grip: Grip, mocap: Record<string, number> = {}) {
  // (a lap timer, for the tools: globalThis.__kpTime collects ms by stage)
  const prof = (globalThis as { __kpTime?: Record<string, number> }).__kpTime;
  let lapT = prof ? performance.now() : 0;
  const lap = (k: string) => {
    if (!prof) return;
    const n = performance.now();
    prof[k] = (prof[k] ?? 0) + n - lapT;
    lapT = n;
  };
  const r = new Rig(template);
  for (const n of ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']) if (!r.B[n]) return;
  const restR = r.B.RightHand.quaternion.clone();
  const restL = r.B.LeftHand.quaternion.clone();
  const [hingeR, hingeL, kneeL, kneeR] = HINGES.map((h) => v3(...h));
  const kin: Kin = { hingeR, hingeL, kneeL, kneeR, restR, restL, grip };
  KIN = kin;
  lap('hinges');
  const ready = clips.ready;
  if (ready) {
    // (the standing loops move little: 15 samples a second)
    const times = timesOf(ready.duration, 15);
    clips.ready = r.bake(
      'ready',
      times,
      times.map((t) => {
        r.pose(ready, t);
        crouch(r, kin, GUARD.drop, GUARD.back, GUARD.hip, GUARD.spine, GUARD.narrow);
        guardArms(r, kin);
        return r.grab();
      }),
    );
    // between points: the same legs standing easy
    clips.rest = r.bake(
      'rest',
      times,
      times.map((t) => {
        r.pose(ready, t);
        crouch(r, kin, REST.drop, REST.back, REST.hip, REST.spine, 0.02);
        restArms(r, kin);
        return r.grab();
      }),
    );
  }
  lap('ready+rest');
  // moving sideways or backwards between shots: the paddle up in front as in the ready stance (the shuffle held it out
  // straight like a tray, its free hand on the hip), the legs as they are
  for (const n of ['shuffle', 'shuffle_l', 'backpedal']) {
    const c = clips[n];
    if (!c) continue;
    const times = timesOf(c.duration, 20);
    clips[n] = r.bake(
      n,
      times,
      times.map((t) => {
        r.pose(c, t);
        guardArms(r, kin, GUARD_MOVE);
        return r.grab();
      }),
      [...ARM_R, ...ARM_L],
      c,
    );
  }
  lap('shuffle+back');
  // walking: the same guard, a little lower (the walk swung the free arm down at the side, open-handed, and carried
  // the paddle up at the shoulder once eased towards the ready stance)
  if (clips.walk) {
    const c = clips.walk;
    const times = timesOf(c.duration, 20);
    clips.walk = r.bake(
      'walk',
      times,
      times.map((t) => {
        r.pose(c, t);
        guardArms(r, kin, GUARD_MOVE);
        return r.grab();
      }),
      [...ARM_R, ...ARM_L],
      c,
    );
  }
  lap('walk');
  // running: the clip's arm swing kept in rhythm but short, the paddle carried in front at the waist, its head forward
  // and up, its face to the net as in the other loops (they blend into each other) (run_v2 swung it up over the
  // head); the free arm pumps as in the clip
  if (clips.run) {
    const c = clips.run;
    const times = timesOf(c.duration, 20);
    const rel = times.map((t) => {
      r.pose(c, t);
      return r.pos('RightHand').sub(chestAt(r));
    });
    const mean = rel.reduce((s, x) => s.add(x), v3()).divideScalar(rel.length);
    clips.run = r.bake(
      'run',
      times,
      times.map((t, i) => {
        r.pose(c, t);
        const d = rel[i].clone().sub(mean);
        const wrist = chestAt(r).add(v3(-RUN_CARRY.wrist[0], RUN_CARRY.wrist[1], RUN_CARRY.wrist[2])).addScaledVector(d, RUN_CARRY.swing);
        // (the head swings with the arm: forward and up as it comes forward)
        const ax = v3(0.15, Math.cos(RUN_CARRY.tilt), Math.sin(RUN_CARRY.tilt)).applyAxisAngle(X, -d.z * 1.2).normalize();
        holdPaddle(r, kin, { wrist }, ax, v3(0, 0, 1), r.pos('RightArm').add(v3(-0.15, -0.4, -0.2)));
        return r.grab();
      }),
      ARM_R,
      c,
    );
  }
  lap('run');
  // the free arm through each swing (see FREE)
  // (not the swings from motion capture: their free arm is a real player's, see `mocap`)
  for (const [n, keys] of Object.entries(FREE)) {
    const c = clips[n];
    if (!c || n in mocap) continue;
    const times = timesOf(c.duration, 20);
    clips[n] = r.bake(
      n,
      times,
      times.map((t) => {
        r.pose(c, t);
        freeAlong(r, kin, keys, t);
        return r.grab();
      }),
      ARM_L,
      c,
    );
  }
  lap('free');
  // the drive finishes high, over the left shoulder (the clip's ended across at the hip): from just after the contact
  // the paddle arm goes up and across, the paddle's head back over the shoulder
  if (clips.drive && !('drive' in mocap)) {
    const c = clips.drive;
    const K = 0.46;
    const times = timesOf(c.duration, 20);
    clips.drive = r.bake(
      'drive',
      times,
      times.map((t) => {
        r.pose(c, t);
        const w = smooth(K + 0.02, K + 0.26, t);
        if (w > 0) {
          const clipR = armNow(r, ARM_R);
          const f = v3(0, 0, 1).applyQuaternion(r.quat('Spine'));
          const yaw = Math.atan2(f.x, f.z);
          const F = DRIVE_FINISH;
          const wrist = chestAt(r).add(v3(...F.wrist).applyAxisAngle(Y, yaw));
          holdPaddle(r, kin, { wrist }, v3(...F.axis).applyAxisAngle(Y, yaw), v3(0, 0, 1).applyAxisAngle(Y, yaw), r.pos('RightArm').add(v3(...F.elbow).applyAxisAngle(Y, yaw)));
          armMix(r, ARM_R, clipR, armNow(r, ARM_R), w);
        }
        return r.grab();
      }),
      ARM_R,
      c,
    );
  }
  // the volley: a short punch from the ready stance (the clip made for it swung the paddle back, away from the net):
  // the paddle up in front, a short take-back, out to meet the ball in front with the face to the net and the wrist
  // firm, held a moment, back to ready; the legs stay in the ready stance
  if (clips.volley && ready) {
    const K = 0.46;
    const V = VOLLEY;
    const times = timesOf(clips.volley.duration, 20);
    clips.volley = r.bake(
      'volley',
      times,
      times.map((t) => {
        r.pose(ready, t % ready.duration);
        crouch(r, kin, GUARD.drop, GUARD.back, GUARD.hip, GUARD.spine, GUARD.narrow);
        const u = t - K;
        // (the wrist off the ready stance: back, then out to the ball, held, back to ready; m: right, up, forward)
        const back = smooth(-0.32, -0.1, u) * (1 - smooth(-0.1, 0, u));
        const out = smooth(-0.1, 0, u) * (1 - smooth(0.14, 0.45, u));
        const g = {
          ...GUARD,
          wrist: [GUARD.wrist[0] + V.back[0] * back + V.out[0] * out, GUARD.wrist[1] + V.back[1] * back + V.out[1] * out, GUARD.wrist[2] + V.back[2] * back + V.out[2] * out],
          tilt: GUARD.tilt + (V.tilt - GUARD.tilt) * out,
        };
        guardArms(r, kin, g);
        freeAlong(r, kin, FREE.volley, t);
        return r.grab();
      }),
    );
  }
  lap('drive+volley');
  const serve = clips.serve;
  if (serve) {
    // the server waiting: the serve's first pose, the ball held in front, the paddle down by the side (the clip's
    // own life is the waiting stance's: see IDLE in chars.ts)
    const set = () => {
      crouch(r, kin, SERVE_SET.drop, SERVE_SET.back, SERVE_SET.hip, SERVE_SET.spine, 0);
      serveSetArms(r, kin);
    };
    clips.serveset = r.bake(
      'serveset',
      [0, 1],
      [0, 1].map(() => {
        r.pose(serve, 0);
        set();
        return r.grab();
      }),
    );
    // the padel serve from there: the free hand lets the ball go as the paddle starts back (SERVE_DROP before the
    // contact: it bounces once and is met on the way up, below the waist), then the free arm stays in front of the
    // body and comes in after the contact (the clip flung it out to the side, the ball held at shoulder height)
    const K = 0.87;
    const drop = Math.max(0.02, K - SERVE_DROP);
    const times = timesOf(serve.duration);
    const P = SERVE_SET.palm;
    const keys: FreeKey[] = [
      { t: 0, p: [-P[0], P[1], P[2]], pole: [0.25, -0.45, 0.05] },
      { t: drop, p: [-P[0] + 0.02, P[1] + 0.01, P[2] - 0.02], pole: [0.25, -0.45, 0.05] },
      { t: K - 0.1, p: [0.16, -0.2, 0.3], pole: [0.3, -0.4, 0] },
      { t: K + 0.25, p: [0.18, -0.24, 0.2], pole: [0.3, -0.45, -0.05] },
      { t: K + 0.7, p: [0.16, -0.32, 0.18], pole: [0.3, -0.45, 0] },
    ];
    clips.serve = r.bake(
      'serve',
      times,
      times.map((t) => {
        r.pose(serve, t);
        const w = 1 - smooth(0.05, 0.5, t);
        const c = 1 - smooth(0.3, K, t);
        crouch(r, kin, SERVE_SET.drop * c, SERVE_SET.back * c, SERVE_SET.hip * c, SERVE_SET.spine * c, 0);
        const clipR2 = armNow(r, ARM_R);
        if (w > 0) {
          serveSetArms(r, kin);
          armMix(r, ARM_R, clipR2, armNow(r, ARM_R), w);
        }
        freeAlong(r, kin, keys, t);
        return r.grab();
      }),
    );
  }
  lap('serve');
  // last, the paddle's face at each swing's contact (see FACE)
  for (const n of Object.keys(FACE)) if (clips[n]) clips[n] = faceForward(r, kin, clips[n], n, mocap[n]);
  lap('face');
}

/** for the tools: the rig's measures */
export const _test = { Rig, hingesOf, limb, orientHand, paddleNow, guardArms, crouch };
