// How natural a drawn body looks, measured on its bones (plain JS: the same code runs in Node, tools/render/poses-tenis.ts, and
// inside the page, tools/poses.py). Every measure is taken on the pose as drawn, after the clips, the IK and the bends.
//
//   features(char)  → the instant measures of one body (angles in degrees, distances in metres)
//   new PoseProbe() → follows bodies frame by frame: foot slide, pops, paddle–ball at the contact, the worst frames
//
// The rig is the standard Meshy one (24 bones, +y along each bone, the model faces +z, its right is −x).

/* eslint-disable */
const DEG = 180 / Math.PI;

function bonesOf(ch) {
  if (ch.__pm) return ch.__pm;
  const b = {};
  ch.root.traverse((o) => {
    if (o.isBone || o.name) b[o.name] = b[o.name] || o;
  });
  const V = ch.root.position.constructor;
  const Q = ch.root.quaternion.constructor;
  ch.__pm = { b, V, Q, v: Array.from({ length: 12 }, () => new V()), q: Array.from({ length: 6 }, () => new Q()), w: Array.from({ length: 12 }, () => new V()), wq: Array.from({ length: 3 }, () => new Q()), prev: null };
  return ch.__pm;
}

/** angle (deg) of the rotation q */
function qAngle(q) {
  return 2 * Math.acos(Math.min(1, Math.abs(q.w))) * DEG;
}
/** twist (deg, signed) of q about the unit axis (x, y, z) */
function twistAbout(q, x, y, z) {
  const d = q.x * x + q.y * y + q.z * z;
  let w = q.w;
  let p = d;
  const n = Math.hypot(w, p);
  if (n < 1e-9) return 180;
  w /= n;
  p /= n;
  if (w < 0) {
    w = -w;
    p = -p;
  }
  return 2 * Math.atan2(p, w) * DEG;
}

/**
 * The instant measures of one body. `nat` (from calibrate) holds the natural references measured on the clips.
 */
function features(ch, nat) {
  const S = bonesOf(ch);
  const { b, v, q } = S;
  ch.root.updateMatrixWorld(true);
  const P = (name, out) => b[name].getWorldPosition(out);
  const sh = P('RightArm', v[0]);
  const el = P('RightForeArm', v[1]);
  const wr = P('RightHand', v[2]);
  const f = {};
  // the elbow: how bent (0 straight) and about which axis, in the upper arm's frame
  const u = v[3].copy(el).sub(sh);
  const lo = v[4].copy(wr).sub(el);
  f.elbow = u.angleTo(lo) * DEG;
  const ax = v[5].copy(u).cross(lo);
  b.RightArm.getWorldQuaternion(q[0]);
  if (ax.lengthSq() > 1e-12 && nat) {
    ax.normalize().applyQuaternion(q[1].copy(q[0]).invert());
    f.elbowAxis = Math.acos(Math.max(-1, Math.min(1, ax.x * nat.elbowAxis[0] + ax.y * nat.elbowAxis[1] + ax.z * nat.elbowAxis[2]))) * DEG;
  } else f.elbowAxis = 0;
  // bent the wrong way: a real bend (> 12°) about an axis more than 100° off the natural one
  f.elbowWrong = f.elbow > 12 && f.elbowAxis > 100 ? 1 : 0;
  // the chest frame (Spine): up and forward
  const chest = b.Spine;
  chest.getWorldQuaternion(q[2]);
  const cUp = v[6].set(0, 1, 0).applyQuaternion(q[2]);
  const cFw = v[7].set(0, 0, 1).applyQuaternion(q[2]);
  b.Hips.getWorldQuaternion(q[3]);
  const hUp = v[8].set(0, 1, 0).applyQuaternion(q[3]);
  const hFw = v[9].set(0, 0, 1).applyQuaternion(q[3]);
  // where the elbow points, off the shoulder–hand line, in the chest frame (+up, +out to the right side)
  const sw = v[10].copy(wr).sub(sh);
  const swl = sw.length();
  if (swl > 1e-4) {
    sw.divideScalar(swl);
    const pole = v[11].copy(el).sub(sh);
    pole.addScaledVector(sw, -pole.dot(sw));
    const pl = pole.length();
    if (pl > 0.02) {
      pole.divideScalar(pl);
      f.elbowUp = pole.dot(cUp);
      // the model's right is −x: the chest's right = up × forward … (x of the chest frame points left)
      const rx = cUp.y * cFw.z - cUp.z * cFw.y;
      const ry = cUp.z * cFw.x - cUp.x * cFw.z;
      const rz = cUp.x * cFw.y - cUp.y * cFw.x;
      f.elbowOut = -(pole.x * rx + pole.y * ry + pole.z * rz);
    } else f.elbowUp = f.elbowOut = 0;
  } else f.elbowUp = f.elbowOut = 0;
  // the hand across the body: how far left of the chest's midline (m, + = across to the left), hand below the chin
  {
    const c = P('Spine', v[3]);
    const rx = cUp.y * cFw.z - cUp.z * cFw.y;
    const ry = cUp.z * cFw.x - cUp.x * cFw.z;
    const rz = cUp.x * cFw.y - cUp.y * cFw.x;
    const d = v[4].copy(wr).sub(c);
    f.across = d.x * rx + d.y * ry + d.z * rz; // the chest's +x is the model's left
    f.handBehind = -d.dot(cFw); // + = hand behind the chest plane
  }
  // forearm and wrist: the turn of each bone off its rest pose, split into twist (about the bone) and the rest
  const rest = nat && nat.rest;
  for (const [name, key] of [
    ['RightForeArm', 'fore'],
    ['RightHand', 'wrist'],
  ]) {
    const lq = b[name].quaternion;
    const r = rest ? rest[name] : null;
    const d = q[4].copy(lq);
    if (r) d.premultiply(q[5].set(r[0], r[1], r[2], r[3]).invert());
    const tw = twistAbout(d, 0, 1, 0);
    f[key + 'Twist'] = tw;
    // swing = d · twist⁻¹
    const th = (tw / DEG) / 2;
    q[5].set(0, Math.sin(th), 0, Math.cos(th)).invert();
    d.multiply(q[5]);
    f[key + 'Bend'] = qAngle(d);
  }
  // the spine: chest against the hips (bend and twist) and the torso against the vertical
  f.spineBend = hUp.angleTo(cUp) * DEG;
  {
    // twist: the chest's forward against the hips' forward, both flattened on the hips' plane
    const a = v[3].copy(cFw).addScaledVector(hUp, -cFw.dot(hUp));
    const c = v[4].copy(hFw).addScaledVector(hUp, -hFw.dot(hUp));
    f.spineTwist = a.lengthSq() > 1e-8 && c.lengthSq() > 1e-8 ? a.angleTo(c) * DEG : 0;
  }
  f.torsoTilt = Math.acos(Math.max(-1, Math.min(1, cUp.y))) * DEG;
  // the knees (0 = straight) and how low the hips are (m above the floor)
  const kneeOf = (s) => {
    const a = P(s + 'UpLeg', v[3]);
    const k = P(s + 'Leg', v[4]);
    const fo = P(s + 'Foot', v[5]);
    return a.sub(k).angleTo(fo.sub(k)) * DEG;
  };
  f.kneeL = 180 - kneeOf('Left');
  f.kneeR = 180 - kneeOf('Right');
  f.hipsY = P('Hips', v[3]).y;
  // the feet (ankles and toes, world)
  const lf = P('LeftFoot', v[3]);
  const rf = P('RightFoot', v[4]);
  const lt = P('LeftToeBase', v[5]);
  const rt = P('RightToeBase', v[6]);
  f.feet = [lf.x, lf.y, lf.z, rf.x, rf.y, rf.z, lt.x, lt.y, lt.z, rt.x, rt.y, rt.z];
  // the free (left) arm: how far out to the side the upper arm is raised (abduction in the chest's frontal plane, deg:
  // 0 hanging, 90 out level) and how bent the elbow is (deg, 0 straight); where the hand is
  {
    const w = S.w;
    const cq = b.Spine.getWorldQuaternion(S.wq[0]);
    const up = w[0].set(0, 1, 0).applyQuaternion(cq);
    const fw = w[1].set(0, 0, 1).applyQuaternion(cq);
    const lf = w[2].copy(up).cross(fw); // up × forward = the chest's left (+x of the frame)
    const ls = P('LeftArm', w[3]);
    const le = P('LeftForeArm', w[4]);
    const lh = P('LeftHand', w[5]);
    const ua = w[6].copy(le).sub(ls);
    const fa = w[7].copy(lh).sub(le);
    f.freeElbow = ua.angleTo(fa) * DEG;
    f.freeAbd = Math.atan2(ua.dot(lf), -ua.dot(up)) * DEG;
    f.freeFwd = ua.dot(fw) / Math.max(1e-6, ua.length());
    // the palm (about 8 cm out from the wrist along the hand)
    const hq = b.LeftHand.getWorldQuaternion(S.wq[1]);
    const palm = w[8].set(0, 1, 0).applyQuaternion(hq).multiplyScalar(0.08).add(lh);
    f.freePalm = [palm.x, palm.y, palm.z];
    f.freeHand = [lh.x, lh.y, lh.z];
    // the palm out to the side of the chest (m, + left) and in front of it (m)
    const cpos = P('Spine', w[9]);
    f.freeLat = (palm.x - cpos.x) * lf.x + (palm.y - cpos.y) * lf.y + (palm.z - cpos.z) * lf.z;
    f.freeFront = (palm.x - cpos.x) * fw.x + (palm.y - cpos.y) * fw.y + (palm.z - cpos.z) * fw.z;
    // the paddle: its long axis (grip → head) and its face normal (two-sided), the middle of the face and the throat
    if (ch.paddle && ch.tip) {
      const pq = ch.paddle.getWorldQuaternion(S.wq[2]);
      const ax = w[9].set(0, 1, 0).applyQuaternion(pq);
      const nm = w[10].set(1, 0, 0).applyQuaternion(pq);
      const g = ch.paddle.getWorldPosition(w[11]);
      const tp = ch.tip.getWorldPosition(w[3]);
      f.padAxis = [ax.x, ax.y, ax.z];
      f.padNormal = [nm.x, nm.y, nm.z];
      f.padGrip = [g.x, g.y, g.z];
      f.padTip = [tp.x, tp.y, tp.z];
      // the throat: where the face starts (its middle is 0.255 m up the paddle, its bottom about 0.135 m)
      const s = tp.distanceTo(g) / 0.255;
      f.padThroat = [g.x + ax.x * 0.135 * s, g.y + ax.y * 0.135 * s, g.z + ax.z * 0.135 * s];
    }
    // the paddle arm's elbow and the chest (where they are against the body)
    const re = P('RightForeArm', w[4]);
    const cp = P('Spine', w[5]);
    f.elbowFwdR = (re.x - cp.x) * fw.x + (re.z - cp.z) * fw.z;
    f.chestY = cp.y;
    f.chestPos = [cp.x, cp.y, cp.z];
  }
  // the head: where it looks (unit, world), from the forward measured on the clips in the head's frame
  if (nat && nat.headFwd) {
    b.Head.getWorldQuaternion(q[0]);
    const hf = v[7].set(nat.headFwd[0], nat.headFwd[1], nat.headFwd[2]).applyQuaternion(q[0]);
    const hp = P('Head', v[8]);
    f.head = [hf.x, hf.y, hf.z, hp.x, hp.y, hp.z];
    // the neck: the head against the chest
    b.Spine.getWorldQuaternion(q[1]);
    const cf = v[9].set(0, 0, 1).applyQuaternion(q[1]);
    f.neck = Math.acos(Math.max(-1, Math.min(1, hf.dot(cf)))) * DEG;
  }
  return f;
}

/**
 * The natural references, measured on the clips themselves (the AI-made animation is the baseline): the elbow's
 * bend axis in the upper arm's frame, the rest pose of the forearm and the hand, and the head's forward.
 * `sample(t, clip)` must pose `ch` at time t of clip and update its matrices.
 */
function calibrate(ch, clips, sample) {
  const S = bonesOf(ch);
  const { b, V, Q } = S;
  const acc = new V();
  const rest = {};
  for (const n of ['RightForeArm', 'RightHand']) {
    const r = b[n].userData.__rest || b[n].quaternion.clone();
    rest[n] = [r.x, r.y, r.z, r.w];
  }
  const sh = new V();
  const el = new V();
  const wr = new V();
  const qa = new Q();
  for (const c of clips) {
    for (let t = 0; t <= c.duration; t += 1 / 30) {
      sample(t, c);
      b.RightArm.getWorldPosition(sh);
      b.RightForeArm.getWorldPosition(el);
      b.RightHand.getWorldPosition(wr);
      const u = el.clone().sub(sh);
      const lo = wr.clone().sub(el);
      const ax = u.clone().cross(lo);
      if (u.angleTo(lo) < 0.35) continue;
      b.RightArm.getWorldQuaternion(qa);
      acc.add(ax.normalize().applyQuaternion(qa.invert()));
    }
  }
  acc.normalize();
  // the head's forward: the model's forward in the head's frame, in the ready pose
  const ready = clips.find((c) => c.name === 'ready') || clips[0];
  sample(0.5, ready);
  const hq = new Q();
  b.Head.getWorldQuaternion(hq);
  const mq = new Q();
  ch.root.getWorldQuaternion(mq);
  const fw = new V(0, 0, 1).applyQuaternion(mq).applyQuaternion(hq.invert());
  return { elbowAxis: [acc.x, acc.y, acc.z], rest, headFwd: [fw.x, fw.y, fw.z] };
}

/**
 * The references of the hero rig as measured by calibrate() on its clips (tools/render/poses-tenis.ts prints them): used by the
 * page, which has no clip sampler at hand.
 */
const NAT = {
  elbowAxis: [0.8862, 0, -0.4632],
  rest: { RightForeArm: [-0.06582, -0.15514, -0.10825, 0.97974], RightHand: [0.04524, -0.1053, -0.13535, 0.98415] },
  headFwd: [0.4388, 0.7705, 0.4623],
  ground: { ankle: 0.1334 },
};

function pct(a, p) {
  if (!a.length) return NaN;
  const s = Float64Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

/**
 * Follows the bodies frame by frame. frame(chars, match, dt) after each drawn frame; hit(pid, x, y, z) right after the
 * frame of a contact. report() gives percentiles and the worst frames of each measure.
 */
class PoseProbe {
  constructor(nat, opts = {}) {
    this.nat = nat;
    this.n = 0;
    this.s = {};
    this.worst = {};
    this.keep = opts.keep || 6;
    this.ground = nat.ground || { ankle: 0.08, toe: 0.025 };
    this.prev = new Map();
    this.hits = [];
    this.log = opts.log || null;
  }
  push(k, x) {
    (this.s[k] || (this.s[k] = [])).push(x);
  }
  mark(k, x, info) {
    const w = this.worst[k] || (this.worst[k] = []);
    if (w.length < this.keep || x > w[w.length - 1].x) {
      w.push({ x, ...info });
      w.sort((a, b) => b.x - a.x);
      if (w.length > this.keep) w.pop();
    }
  }
  /** what the body is doing now (for the breakdowns) */
  state(ch, p) {
    const sw = ch.swing;
    if (ch.reaction) return 'react';
    if (sw) return sw.kind;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp < 0.3) return 'still';
    const yaw = ch.root.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const fwd = (p.vx * fx + p.vz * fz) / sp;
    if (fwd > 0.7) return sp > 2.6 ? 'run' : 'walk';
    if (fwd < -0.7) return 'back';
    return 'side';
  }
  frame(chars, m, dt, extra) {
    if (!(dt > 0)) return;
    this.n++;
    const ball = m.ballPos ? m.ballPos({ x: 0, y: 0, z: 0 }) : null;
    chars.forEach((ch, i) => {
      const p = m.players[i];
      const f = features(ch, this.nat);
      const st = this.state(ch, p);
      const info = { t: +m.t.toFixed(3), pid: i, st, frame: this.n, ...(extra || {}) };
      // the paddle's height over the last half second (the take-back before a contact: see hit)
      if (ch.tip) {
        const tips = ch.__tips || (ch.__tips = []);
        tips.push(ch.tip.getWorldPosition(bonesOf(ch).v[11]).y);
        if (tips.length > Math.round(0.5 / dt)) tips.shift();
      }
      const swinging = !!ch.swing;
      // the free arm: raised out to the side and straight (a wing), or hanging straight down (stiff); by what the body
      // does (a swing, on the move, waiting)
      {
        const grp = ch.reaction ? 'react' : swinging ? 'sw' : st === 'still' ? 'still' : 'move';
        const out = f.freeAbd > 40 && f.freeElbow < 40 ? 1 : 0;
        const stiff = f.freeElbow < 15 ? 1 : 0;
        // (a wing: the hand well out to the side of the body, not in front of it, whatever the elbow does)
        const wide = f.freeLat > 0.38 && f.freeFront < 0.25 ? 1 : 0;
        this.push('freeWide_' + grp, wide);
        this.push('freeLat_' + grp, f.freeLat);
        if (grp !== 'react') this.push('freeWide', wide);
        if (swinging) this.push('freeWide_k_' + st, wide);
        if (wide && grp !== 'react') this.mark('freeWide', f.freeLat, info);
        this.push('freeOut_' + grp, out);
        this.push('freeStiff_' + grp, stiff);
        if (swinging) this.push('freeStiff_k_' + st, stiff);
        this.push('freeAbd_' + grp, f.freeAbd);
        this.push('freeElbow_' + grp, f.freeElbow);
        if (grp !== 'react') {
          this.push('freeOut', out);
          this.push('freeStiff', stiff);
          if (out) this.mark('freeOut', f.freeAbd, info);
        }
      }
      // the drive's finish: over the 0.4 s after its contact, how high the paddle goes over the chest and how far across
      // to the left it is there (m)
      if (ch.__finish && f.padTip) {
        const F = ch.__finish;
        const yaw = ch.root.rotation.y;
        const hy = f.padTip[1] - f.chestY;
        if (hy > F.y) {
          F.y = hy;
          F.across = (f.padTip[0] - f.chestPos[0]) * Math.cos(yaw) - (f.padTip[2] - f.chestPos[2]) * Math.sin(yaw);
        }
        if (m.t - F.t0 > 0.4) {
          this.push('driveFinishY', F.y);
          this.push('driveFinishAcross', F.across);
          ch.__finish = null;
        }
      }
      // the server waiting to serve: the ball in the free hand (its palm) and the paddle
      if (m.phase === 'serve' && !m.windup && typeof m.server === 'function' && m.server().id === i && f.freePalm) {
        const yaw = ch.root.rotation.y;
        const hp = bonesOf(ch).b.Hips.getWorldPosition(bonesOf(ch).v[10]);
        this.push('serveWaitBallY', f.freePalm[1] - ch.root.position.y);
        this.push('serveWaitBallFwd', (f.freePalm[0] - hp.x) * Math.sin(yaw) + (f.freePalm[2] - hp.z) * Math.cos(yaw));
        if (f.padTip) this.push('serveWaitPaddleY', f.padTip[1] - ch.root.position.y);
      }
      this.push('elbow', f.elbow);
      if (f.elbow > 150) this.mark('elbowFolded', f.elbow, info);
      if (f.elbowWrong) {
        this.push('elbowWrongN', 1);
        this.mark('elbowWrong', f.elbowAxis, info);
      }
      this.push('elbowAxis', f.elbowAxis);
      if (swinging) {
        this.push('elbowUp_sw', f.elbowUp);
        if (f.elbowUp > 0.55 && st !== 'smash' && st !== 'serve') this.mark('elbowUp', f.elbowUp, info);
        this.push('across_sw', f.across);
        if (st !== 'backhand' && st !== 'proc') this.mark('acrossFh', f.across, info);
        this.push('wristBend_sw', f.wristBend);
        this.push('wristBend_' + st, f.wristBend);
        this.push('wristTwist_sw', Math.abs(f.wristTwist));
        this.push('foreTwist_sw', Math.abs(f.foreTwist));
      }
      this.push('wristBend', f.wristBend);
      this.mark('wristBend', f.wristBend, info);
      this.push('wristTwist', Math.abs(f.wristTwist));
      this.mark('wristTwist', Math.abs(f.wristTwist), info);
      this.push('foreTwist', Math.abs(f.foreTwist));
      this.mark('foreTwist', Math.abs(f.foreTwist), info);
      this.push('spineBend', f.spineBend);
      this.mark('spineBend', f.spineBend, info);
      this.push('spineTwist', f.spineTwist);
      this.mark('spineTwist', f.spineTwist, info);
      this.push('torsoTilt', f.torsoTilt);
      this.mark('torsoTilt', f.torsoTilt, info);
      // folded at the waist on straight legs
      const legs = Math.max(f.kneeL, f.kneeR);
      const fold = f.torsoTilt - legs * 0.5;
      this.push('foldNoKnees', fold);
      this.mark('foldNoKnees', fold, { ...info, tilt: +f.torsoTilt.toFixed(0), knee: +legs.toFixed(0) });
      // the head: off the ball (deg), while a ball is in play and coming or going
      if (f.head && ball && m.phase === 'rally') {
        const dx = ball.x - f.head[3];
        const dy = ball.y - f.head[4];
        const dz = ball.z - f.head[5];
        const dl = Math.hypot(dx, dy, dz);
        const off = Math.acos(Math.max(-1, Math.min(1, (f.head[0] * dx + f.head[1] * dy + f.head[2] * dz) / dl))) * DEG;
        this.push('headOff', off);
        if (swinging && Math.abs(m.t - (ch.swing.key ?? 0)) < 0.15) this.push('headOffContact', off);
      }
      if (f.neck !== undefined) {
        this.push('neck', f.neck);
        this.mark('neck', f.neck, info);
      }
      // the reactions while a ball is in play
      if (ch.reaction && (m.phase === 'rally' || m.phase === 'serve')) this.push('reactInPlay', 1);
      // the split step (match.stance 'split', when the match has it): for each one, how high the body went from a moment
      // before the other side's contact to a moment after (m), how much wider the feet ended up (ankles, m) and how far
      // the hips went down on the landing (m), measured 0.3 s on
      const stn = typeof m.stance === 'function' ? m.stance(i) : null;
      {
        const hist = ch.__split || (ch.__split = { h: [], prev: null, due: [] });
        const hy = bonesOf(ch).b.Hips.getWorldPosition(bonesOf(ch).v[10]).y;
        hist.h.push({ t: m.t, ry: ch.root.position.y, w: Math.hypot(f.feet[0] - f.feet[3], f.feet[2] - f.feet[5]), hy });
        if (hist.h.length > 40) hist.h.shift();
        if (stn === 'split' && hist.prev !== 'split' && !ch.swing && !ch.reaction) hist.due.push(m.t);
        hist.prev = stn;
        while (hist.due.length && m.t >= hist.due[0] + 0.3) {
          const t0 = hist.due.shift();
          const at = (t) => hist.h.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b), hist.h[0]);
          const win = hist.h.filter((x) => x.t >= t0 - 0.15 && x.t <= t0 + 0.1);
          const after = hist.h.filter((x) => x.t >= t0 && x.t <= t0 + 0.3);
          if (win.length && after.length) {
            const b0 = at(t0 - 0.15);
            this.push('splitHop', Math.max(...win.map((x) => x.ry)));
            this.push('splitWiden', at(t0 + 0.25).w - b0.w);
            this.push('splitDip', b0.hy - Math.min(...after.map((x) => x.hy)));
          }
        }
      }
      // the feet: how fast a planted foot slides (m/s), against the player's ground speed
      const pv = this.prev.get(ch);
      const F = f.feet;
      const sp = Math.hypot(p.vx, p.vz);
      // the sole of each foot over the floor: the ankle 7 cm over it with the foot flat, the toe bone 2 cm under it
      // when on the ball of the foot (a jump's height is left out)
      const ry = ch.root.position.y;
      const sole = (k) => Math.min(F[k * 3 + 1] - 0.07, F[6 + k * 3 + 1] + 0.02) - ry;
      const s0 = sole(0);
      const s1 = sole(1);
      const lowS = Math.min(s0, s1);
      const tele = pv && Math.hypot(ch.root.position.x - pv.rx, ch.root.position.z - pv.rz) > 0.5;
      if (pv && pv.t !== m.t && !tele) {
        const dtt = dt;
        // the simulation's acceleration (eased over a few frames): a start, a stop or a turn (for the lean and the feet)
        {
          const ax = (p.vx - (pv.vx ?? p.vx)) / dtt;
          const az = (p.vz - (pv.vz ?? p.vz)) / dtt;
          pv.ax = (pv.ax ?? 0) * 0.5 + ax * 0.5;
          pv.az = (pv.az ?? 0) * 0.5 + az * 0.5;
          pv.vx = p.vx;
          pv.vz = p.vz;
          const a = Math.hypot(pv.ax, pv.az);
          const along = sp > 0.05 ? (pv.ax * p.vx + pv.az * p.vz) / sp : a;
          const perp = sp > 0.05 ? Math.abs(pv.ax * p.vz - pv.az * p.vx) / sp : 0;
          pv.mv = a > 10 && along > 0.6 * a && sp < 3 ? 'start' : along < -10 && sp > 0.6 ? 'brake' : perp > 8 && sp > 2 ? 'turn' : null;
        }
        for (let k = 0; k < 2; k++) {
          // a stance foot: the lower one (both if level), whatever the clip's floor
          if ((k ? s1 : s0) <= lowS + 0.02) {
            const vx = (F[6 + k * 3] - pv.F[6 + k * 3]) / dtt;
            const vz = (F[6 + k * 3 + 2] - pv.F[6 + k * 3 + 2]) / dtt;
            const v = Math.hypot(vx, vz);
            this.push('slide', v);
            this.push('slide_' + st, v);
            // (and only a foot that is on the floor: within 3 cm of it; a run's flight phase is not a stance)
            if ((k ? s1 : s0) < 0.03) {
              this.push('slideG', v);
              this.mark('slideG', v, { ...info, speed: +sp.toFixed(2), foot: k });
              this.push('slideG_' + st, v);
              // around a contact (0.2 s either side), and at speed there (the player moving at more than 1.5 m/s)
              if (ch.swing && Math.abs(m.t - ch.swing.key) < 0.2) {
                this.push('slideG_contact', v);
                if (sp > 1.5) this.push('slideG_contactFast', v);
              }
              if (st === 'side') this.push('slideG_side' + (p.vx * -Math.cos(ch.root.rotation.y) + p.vz * Math.sin(ch.root.rotation.y) >= 0 ? 'R' : 'L'), v);
              // by the simulation's footwork (split step, braking into the shot, finishing it)
              if (stn) this.push('slideG_st_' + stn, v);
              // starting, stopping, turning (from the simulation's acceleration, see above)
              if (pv.mv) this.push('slideG_' + pv.mv, v);
              // backwards on a diagonal (between 20° and 70° off straight back)
              if (st === 'back' || st === 'side') {
                const yaw = ch.root.rotation.y;
                const back = -(p.vx * Math.sin(yaw) + p.vz * Math.cos(yaw)) / Math.max(sp, 1e-6);
                if (back > Math.cos(1.22) && back < Math.cos(0.35)) this.push('slideG_backDiag', v);
              }
            }
            // sideways, split by the way it goes (the shuffle clip steps right; going left it is played reversed)
            if (st === 'side') this.push('slide_side' + (p.vx * -Math.cos(ch.root.rotation.y) + p.vz * Math.sin(ch.root.rotation.y) >= 0 ? 'R' : 'L'), v);
            this.mark('slide', v, { ...info, speed: +sp.toFixed(2) });
          }
        }
        // the lower sole over the floor (+: floating, −: through it)
        this.push('floorGap', lowS);
        if (lowS < -0.04) this.mark('feetThroughFloor', -lowS, info);
        if (lowS > 0.06 && st !== 'smash') this.mark('feetInAir', lowS, info);
        // pops: the fastest turning bone this frame (model space, deg/s), and the body's place against the sim
        const S = bonesOf(ch);
        const names = ['Hips', 'Spine', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
        let worst = 0;
        let wn = '';
        const rq = S.q[5];
        ch.root.getWorldQuaternion(rq).invert();
        for (let j = 0; j < names.length; j++) {
          const bq = S.b[names[j]].getWorldQuaternion(S.q[4]).premultiply(rq);
          const o = pv.Q[j];
          const d = Math.abs(bq.x * o[0] + bq.y * o[1] + bq.z * o[2] + bq.w * o[3]);
          const w = (2 * Math.acos(Math.min(1, d)) * DEG) / dtt;
          const lim = j >= 3 && j <= 5 ? 2.2 : 1; // the paddle arm swings fast: weighed down
          this.push('rate_' + names[j], w);
          (pv.rates || (pv.rates = []))[j] = w;
          if (w / lim > worst) {
            worst = w / lim;
            wn = names[j];
          }
          o[0] = bq.x;
          o[1] = bq.y;
          o[2] = bq.z;
          o[3] = bq.w;
        }
        this.push('turnRate', worst);
        // a pop: a bone that turns much faster this frame than the one before and the one after is caught a frame later
        const pr = pv.turn || 0;
        const jerk = worst - pr;
        this.push('jerk', jerk);
        this.push('jerk_' + st, jerk);
        this.push('jerkBone_' + wn, jerk);
        this.mark('jerk', jerk, { ...info, bone: wn, rate: +worst.toFixed(0) });
        pv.turn = worst;
        // the body against where the simulation has the feet (the lunge offset), and how fast it slides
        const ox = ch.root.position.x - p.x;
        const oz = ch.root.position.z - p.z;
        const ov = Math.hypot(ox - pv.ox, oz - pv.oz) / dtt;
        this.push('rootSlide', ov);
        this.mark('rootSlide', ov, { ...info, off: +Math.hypot(ox, oz).toFixed(2) });
        pv.ox = ox;
        pv.oz = oz;
        pv.F = F;
        pv.t = m.t;
        pv.rx = ch.root.position.x;
        pv.rz = ch.root.position.z;
        // facing: the body against the way it travels, when it runs
        if (sp > 2.2) {
          const yaw = ch.root.rotation.y + (ch.model ? ch.model.rotation.y : 0);
          const c = (Math.sin(yaw) * p.vx + Math.cos(yaw) * p.vz) / sp;
          const ang = Math.acos(Math.max(-1, Math.min(1, c))) * DEG;
          this.push('travelAngle', ang);
        }
        this.moveMeasures(ch, p, f, st, stn, dtt, pv, sp, info, m);
      } else {
        const S = bonesOf(ch);
        const names = ['Hips', 'Spine', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
        const rq = S.q[5];
        ch.root.getWorldQuaternion(rq).invert();
        const Qs = names.map((n) => {
          const bq = S.b[n].getWorldQuaternion(S.q[4]).premultiply(rq);
          return [bq.x, bq.y, bq.z, bq.w];
        });
        this.prev.set(ch, { F, Q: Qs, ox: ch.root.position.x - p.x, oz: ch.root.position.z - p.z, t: m.t, turn: 0, rx: ch.root.position.x, rz: ch.root.position.z, vx: p.vx, vz: p.vz });
      }
    });
  }
  /**
   * How the body moves, against what the simulation does (after the per-frame measures above; pv holds the last
   * frame's values and this frame's acceleration class pv.mv):
   *  · leanStart / leanBrake / leanTurn: the body (hips to neck) tipped towards the push (deg): forward into a start,
   *    back against the way it goes in a stop, into the turn (+ is the natural way)
   *  · waiting (still, no swing or reaction, ball in play): how fast the body moves (the fastest of hips, chest, arms,
   *    legs, deg/s, and the hips over the floor), and the share of those frames that are frozen (under 12 °/s and
   *    1.5 cm/s), the knees, the hips' height, the torso and where the paddle is (height, in front of the chest)
   */
  moveMeasures(ch, p, f, st, stn, dtt, pv, sp, info, m) {
    const S = bonesOf(ch);
    const { b, v } = S;
    const hp = b.Hips.getWorldPosition(v[0]);
    const nk = (b.neck || b.Head).getWorldPosition(v[1]);
    const dx = nk.x - hp.x;
    const dy = nk.y - hp.y;
    const dz = nk.z - hp.z;
    const lean = (ux, uz) => Math.atan2(dx * ux + dz * uz, dy) * DEG;
    if (pv.mv) {
      const a = Math.hypot(pv.ax, pv.az);
      if (pv.mv === 'start' && a > 1e-3) this.push('leanStart', lean(pv.ax / a, pv.az / a));
      else if (pv.mv === 'brake') this.push('leanBrake', lean(-p.vx / sp, -p.vz / sp));
      else if (pv.mv === 'turn') {
        // the push across the way it goes
        const al = (pv.ax * p.vx + pv.az * p.vz) / (sp * sp);
        const px = pv.ax - al * p.vx;
        const pz = pv.az - al * p.vz;
        const pl = Math.hypot(px, pz);
        if (pl > 1e-3) this.push('leanTurn', lean(px / pl, pz / pl));
      }
    }
    // on the move with no swing: how high the paddle goes (m; a run that swings it over the head waves it about)
    if ((st === 'run' || st === 'walk' || st === 'back') && ch.tip) this.push('paddleMoveY', ch.tip.getWorldPosition(v[4]).y - ch.root.position.y);
    // waiting between shots
    // (not a swing fading out after its follow-through either)
    const waiting = st === 'still' && (m.phase === 'rally' || m.phase === 'serve') && stn !== 'follow' && !(ch.shots || []).some((s) => s.w > 0.02);
    const hy = hp.y;
    const hx = hp.x - ch.root.position.x;
    const hz = hp.z - ch.root.position.z;
    if (waiting && pv.hy !== undefined && pv.rates) {
      const R = pv.rates;
      // (Hips, Spine, RightArm, LeftArm, LeftUpLeg, RightUpLeg, LeftLeg, RightLeg: not the head, which follows the ball)
      const body = Math.max(R[0], R[1], R[3], R[6], R[7], R[8], R[9], R[10]);
      const hv = Math.hypot(hy - pv.hy, hx - pv.hx, hz - pv.hz) / dtt;
      this.push('idleRate', body);
      this.push('idleHips', hv);
      const frozen = body < 12 && hv < 0.015;
      const fr = this.frozen || (this.frozen = { n: 0, k: 0, runs: [] });
      fr.n++;
      if (frozen) fr.k++;
      const run = (pv.frozenT = frozen ? (pv.frozenT || 0) + dtt : 0);
      if (!frozen && pv.lastRun > 0.25) fr.runs.push(pv.lastRun);
      pv.lastRun = run;
      this.push('kneeIdle', (f.kneeL + f.kneeR) / 2);
      this.push('stanceIdle', Math.hypot(f.feet[0] - f.feet[3], f.feet[2] - f.feet[5]));
      this.push('hipsIdle', hy - ch.root.position.y);
      this.push('torsoIdle', f.torsoTilt);
      if (ch.tip) {
        const t = ch.tip.getWorldPosition(v[2]);
        const yaw = ch.root.rotation.y;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const sp2 = b.Spine.getWorldPosition(v[3]);
        this.push('paddleIdleY', t.y - ch.root.position.y);
        this.push('paddleIdleFwd', (t.x - sp2.x) * fx + (t.z - sp2.z) * fz);
      }
      this.readyMeasures(ch, f, m, 'Idle');
    } else if (st === 'still' && (m.phase === 'dead' || m.phase === 'over') && !ch.reaction && !(ch.shots || []).some((s) => s.w > 0.02)) {
      // between points, standing (no reaction to play): relaxed, not a statue with a stiff arm
      this.readyMeasures(ch, f, m, 'Rest');
    } else if (pv.lastRun > 0.25 && this.frozen) {
      this.frozen.runs.push(pv.lastRun);
      pv.lastRun = 0;
    }
    pv.hy = hy;
    pv.hx = hx;
    pv.hz = hz;
  }
  /**
   * The ready stance (waiting, `tag` Idle) or the relaxed one between points (Rest), on one frame:
   *  · the paddle: its head over the horizontal (deg, + up), its face against the net (deg: 0 square to it, 90 edge-on
   *    or flat), flat like a tray (share: the face within 35° of horizontal), the middle of its face against the chest (m)
   *  · the free hand against the paddle's throat (m), the paddle elbow in front of the chest (m)
   *  · the hips behind the feet (m, along where the body faces), the knees, by where on the court (kitchen line or deep)
   */
  readyMeasures(ch, f, m, tag) {
    if (!f.padAxis) return;
    const yaw = ch.root.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const A = f.padAxis;
    const N = f.padNormal;
    this.push('padHead' + tag, Math.asin(Math.max(-1, Math.min(1, A[1]))) * DEG);
    this.push('padFace' + tag, Math.acos(Math.min(1, Math.abs(N[0] * fx + N[2] * fz))) * DEG);
    this.push('padFlat' + tag, Math.abs(N[1]) > Math.cos(35 / DEG) ? 1 : 0);
    this.push('padChest' + tag, f.padTip[1] - f.chestY);
    const T = f.padThroat;
    const P = f.freePalm;
    this.push('freeToPaddle' + tag, Math.hypot(P[0] - T[0], P[1] - T[1], P[2] - T[2]));
    this.push('freeOut' + tag, f.freeAbd > 40 && f.freeElbow < 40 ? 1 : 0);
    this.push('elbowFwd' + tag, f.elbowFwdR);
    const F = f.feet;
    const S = bonesOf(ch);
    const hp = S.b.Hips.getWorldPosition(S.w[6]);
    const back = ((F[0] + F[3]) / 2 - hp.x) * fx + ((F[2] + F[5]) / 2 - hp.z) * fz;
    this.push('hipsBack' + tag, back);
    const deep = Math.abs(ch.root.position.z) > 2.13 + 1.2 ? 'D' : 'K';
    this.push('knee' + tag + deep, (f.kneeL + f.kneeR) / 2);
    this.push('hips' + tag + deep, hp.y - ch.root.position.y);
    this.push('torso' + tag + deep, f.torsoTilt);
  }
  /** right after the frame of a contact: the middle of the paddle face against the ball */
  hit(ch, pid, x, y, z, kind, info, vel) {
    const tip = ch.tip;
    if (!tip) return;
    const V = ch.root.position.constructor;
    ch.root.updateMatrixWorld(true);
    const w = tip.getWorldPosition(new V());
    const d = Math.hypot(w.x - x, w.y - y, w.z - z);
    const sk = ch.swing ? ch.swing.kind : 'none';
    // the face against where the ball goes (deg: 0 square to it; the face is two-sided)
    const f = features(ch, this.nat);
    if (vel && f.padNormal) {
      const vl = Math.hypot(vel[0], vel[1], vel[2]);
      if (vl > 0.5) {
        const N = f.padNormal;
        const off = Math.acos(Math.min(1, Math.abs(N[0] * vel[0] + N[1] * vel[1] + N[2] * vel[2]) / vl)) * DEG;
        this.push('faceOff', off);
        this.push('faceOff_' + sk, off);
      }
    }
    // the paddle ahead of the wrist at the contact (m, along where the body faces: + the face leads the hand, as in a
    // dink or a volley with a firm wrist; − it trails behind the wrist)
    if (f.padTip) {
      const yaw = ch.root.rotation.y;
      const wr = bonesOf(ch).b.RightHand.getWorldPosition(new V());
      this.push('padAhead_' + sk, (f.padTip[0] - wr.x) * Math.sin(yaw) + (f.padTip[2] - wr.z) * Math.cos(yaw));
    }
    // the serve: under the waist, the paddle's head under the wrist (m: wrist over the middle of the face)
    if (sk === 'serve' && f.padTip) {
      this.push('serveTipY', f.padTip[1] - ch.root.position.y);
      this.push('serveHeadUnderWrist', f.freeHand ? bonesOf(ch).b.RightHand.getWorldPosition(new V()).y - f.padTip[1] : 0);
    }
    // the drive's finish (followed in frame())
    if (sk === 'drive') ch.__finish = { t0: info && info.t !== undefined ? info.t : 0, y: -Infinity, across: 0 };
    this.push('paddle', d);
    this.push('paddle_' + sk, d);
    // how high the paddle went in the half second before a contact on the forehand side under the waist (a chop comes
    // down from over the head: the take-back's top, and how far over the ball)
    if (ch.__tips && ch.__tips.length && y < 1.0 && sk !== 'serve' && sk !== 'backhand' && sk !== 'lunge_left' && sk !== 'proc') {
      const top = Math.max(...ch.__tips);
      this.push('backswingTop', top);
      this.push('backswingOver', top - y);
      this.push('backswingTop_' + sk, top);
    }
    // where the ball is met against the body: in front of the hips (along where the pelvis faces, m; − behind) and out
    // to the side (m from the hips)
    {
      const S = bonesOf(ch);
      const hq = S.b.Hips.getWorldQuaternion(S.q[0]);
      const fw = S.v[0].set(0, 0, 1).applyQuaternion(hq);
      fw.y = 0;
      const fl = fw.length();
      if (fl > 1e-3 && sk !== 'serve') {
        fw.divideScalar(fl);
        const hp = S.b.Hips.getWorldPosition(S.v[1]);
        const fwd = (x - hp.x) * fw.x + (z - hp.z) * fw.z;
        this.push('contactFwd', fwd);
        this.push('contactFwd_' + sk, fwd);
        // (not the smash: met over the head with the hips turned side-on, it reads as behind the hips, wrongly)
        if (sk !== 'smash') this.push('contactBehind', fwd < 0 ? 1 : 0);
        // how wide the feet are at the contact (ankles, m): a goalkeeper's crouch is a metre and more
        const la = S.b.LeftFoot.getWorldPosition(S.v[2]);
        const ra = S.b.RightFoot.getWorldPosition(S.v[3]);
        const wdt = Math.hypot(la.x - ra.x, la.z - ra.z);
        this.push('stanceHit', wdt);
        // how far from the hips the ball is met (horizontal, m): under 0.35 m it is jammed into the body
        const near = Math.hypot(x - hp.x, z - hp.z);
        this.push('contactDist', near);
        this.push('contactDist_' + sk, near);
        if (sk !== 'smash') this.push('contactJammed', near < 0.35 ? 1 : 0);
        this.push('stanceHit_' + sk, wdt);
        this.mark('contactBehind', -fwd, { pid, kind: sk, y: +y.toFixed(2), ...(info || {}) });
      }
    }
    this.hits.push({ d, kind: sk, shot: kind, y, pid, ...(info || {}) });
    this.mark('paddle', d, { pid, kind: sk, y: +y.toFixed(2), ...(info || {}) });
  }
  report() {
    const out = { frames: this.n, stats: {}, worst: this.worst };
    for (const [k, a] of Object.entries(this.s)) {
      if (/^(freeOut|freeStiff|padFlat|freeWide)/.test(k)) {
        out.stats[k] = { n: a.length, share: +(a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)).toFixed(3) };
        continue;
      }
      if (k.endsWith('N') || k === 'reactInPlay') {
        out.stats[k] = { n: a.length };
        continue;
      }
      if (k === 'contactBehind' || k === 'contactJammed') {
        out.stats[k] = { n: a.length, share: +(a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)).toFixed(3) };
        continue;
      }
      out.stats[k] = { n: a.length, p10: +pct(a, 0.1).toFixed(3), p50: +pct(a, 0.5).toFixed(3), p90: +pct(a, 0.9).toFixed(3), p99: +pct(a, 0.99).toFixed(3), max: +pct(a, 1).toFixed(3) };
    }
    // the waiting frames that are frozen (share), and the frozen stretches over 0.25 s (p50, p90, longest, s)
    if (this.frozen) {
      const r = this.frozen.runs;
      out.stats.idleFrozen = { n: this.frozen.n, share: +(this.frozen.k / Math.max(1, this.frozen.n)).toFixed(3), runs: r.length, p50: +pct(r, 0.5).toFixed(2), p90: +pct(r, 0.9).toFixed(2), max: +pct(r, 1).toFixed(2) };
    }
    return out;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { features, calibrate, PoseProbe, bonesOf, NAT };
if (typeof window !== 'undefined') window.PoseMetrics = { features, calibrate, PoseProbe, bonesOf, NAT };
