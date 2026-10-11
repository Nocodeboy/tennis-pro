// TV direction: the shots the broadcast cuts to when nobody needs to play. The gameplay camera behind the human is
// the default; the director only takes over in the dead time (the match intro, the server before a serve, a reaction
// after a point, replays and the end of the match) and always hands back to the gameplay camera before a ball has
// to be played. Moves are eased, a shot that starts far from the last one is a cut, and with
// prefers-reduced-motion the shots hold still (no flights, orbits or zooms).

import * as THREE from 'three';
import { HL, W } from '../sim/court';

export interface CamPose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
}

export interface DirCtx {
  aspect: number;
  /** the gameplay camera this frame */
  game: CamPose;
  /** the end of the court the gameplay camera sits behind */
  side: 1 | -1;
  /** where each player stands (drawn) */
  players: { x: number; z: number; team: 0 | 1 }[];
  /** the ball as drawn (live or in the replay) */
  ball: THREE.Vector3 | null;
}

export type ShotKind = 'play' | 'intro' | 'frame' | 'pushin' | 'react' | 'replay' | 'victory';
type ReplayAngle = 'side' | 'end' | 'net';

interface Shot {
  kind: ShotKind;
  /** the player (frame, pushin, react) or the winning team (victory) */
  pid: number;
  team: 0 | 1;
  /** react: the subject is at the camera's end of the court (orbit round them) or the far end (long lens) */
  near: boolean;
  /** react orbit: azimuth, radius and height at the start, and how far it turns */
  az0: number;
  r0: number;
  h0: number;
  turn: number;
  look0: THREE.Vector3;
  fov0: number;
  /** frame: the match point (tighter and longer) */
  tight: boolean;
  angle: ReplayAngle;
  camSide: number;
}

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/**
 * The intro flight: when it passes the far team, the near team and lands on the gameplay camera (s). Each team stays
 * framed for over a second around its key (long enough to read its strap), with a quick move across the net between
 * them; the straps follow what the camera shows (Broadcast.introOverlays), not these times.
 */
export const INTRO_KEYS = [0, 1.7, 3.2, 5.2];
/** vertical field of view (deg) that shows `h` metres at `d` metres */
const fovFor = (h: number, d: number) => THREE.MathUtils.radToDeg(2 * Math.atan(h / 2 / Math.max(0.5, d)));

export class Director {
  /** no flights, orbits or zooms (prefers-reduced-motion): shots are cuts and hold still */
  reduced = REDUCED;
  shot: Shot = this.make('play');
  /** seconds into the shot */
  t = 0;
  /** blend in from where the camera was over this long (0: a cut) */
  private blend = 0;
  private from: CamPose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
  /** the pose given last frame */
  readonly cur: CamPose = { pos: new THREE.Vector3(0, 10, 20), look: new THREE.Vector3(), fov: 40 };
  private has = false;
  /** a subject followed smoothly (players move during reactions) and the replay's smoothed look at the ball */
  private subj = new THREE.Vector3();
  private subjOk = false;
  private track = new THREE.Vector3();
  private trackV = new THREE.Vector3();
  private trackZ = 0;
  // the intro flight
  private path: THREE.CatmullRomCurve3 | null = null;
  private lookPath: THREE.CatmullRomCurve3 | null = null;
  private fovs: number[] = [];
  readonly introLen = INTRO_KEYS[3];
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();

  private make(kind: ShotKind): Shot {
    return { kind, pid: 0, team: 0, near: false, az0: 0, r0: 0, h0: 0, turn: 0, look0: new THREE.Vector3(), fov0: 40, tight: false, angle: 'side', camSide: 1 };
  }

  get kind(): ShotKind {
    return this.shot.kind;
  }

  /** Back to the gameplay camera: eased over `blend` seconds (0: a cut). */
  play(blend = 0.7) {
    this.start(this.make('play'), this.reduced ? 0 : blend);
  }
  /** Straight to the gameplay camera now (a new match, the menu). */
  reset() {
    this.shot = this.make('play');
    this.blend = 0;
    this.t = 0;
    this.has = false;
    this.path = this.lookPath = null;
  }

  /** The match intro: a flight over the court, past both teams, into the gameplay camera. */
  intro(ctx: DirCtx) {
    const s = this.make('intro');
    const sd = ctx.side;
    const team = (k: 0 | 1) => {
      const ps = ctx.players.filter((p) => p.team === k);
      return new THREE.Vector3(ps.reduce((a, p) => a + p.x, 0) / ps.length, 0, ps.reduce((a, p) => a + p.z, 0) / ps.length);
    };
    // the far team is the one at the other end from the camera
    const t0 = team(0);
    const t1 = team(1);
    const far = t0.z * sd < 0 ? t0 : t1;
    const near = far === t0 ? t1 : t0;
    const portrait = ctx.aspect < 0.8;
    const g = ctx.game;
    // (it opens on the stadium: from high over the near corner's stands, across the court to the far stands, the
    // boxes and the ring of floodlights under the roof, and cranes down onto the far team)
    this.path = new THREE.CatmullRomCurve3(
      [new THREE.Vector3(-7.5, 10.5, 15.5 * sd), new THREE.Vector3(far.x + 7, 3.4, far.z + sd * 4.6), new THREE.Vector3(near.x - 4.2, 2.1, near.z - sd * 4.6), g.pos.clone()],
      false,
      'centripetal',
    );
    this.lookPath = new THREE.CatmullRomCurve3(
      [new THREE.Vector3(0, portrait ? 4.5 : 6.0, -13 * sd), new THREE.Vector3(far.x, 1.1, far.z), new THREE.Vector3(near.x, 1.1, near.z), g.look.clone()],
      false,
      'centripetal',
    );
    this.fovs = portrait ? [64, 46, 48, g.fov] : [46, 30, 32, g.fov];
    this.start(s, 0);
  }

  /**
   * Before a serve: a long lens on a server at the far end, or a gentle push towards one at the camera's end. The
   * match point is framed tighter. `cut`: the players were just put in place (a cut reads better than a move).
   */
  serve(ctx: DirCtx, pid: number, matchPoint: boolean, cut: boolean) {
    if (this.reduced) return;
    const p = ctx.players[pid];
    const near = p.z * ctx.side > 0;
    const s = this.make(near ? 'pushin' : 'frame');
    s.pid = pid;
    s.tight = matchPoint;
    this.subjOk = false;
    this.start(s, near ? 0 : cut ? 0 : 0.8);
  }

  /** After a point: the camera goes to the player reacting (an orbit round them, or a long lens at the far end). */
  react(ctx: DirCtx, pid: number) {
    const p = ctx.players[pid];
    const s = this.make('react');
    s.pid = pid;
    s.near = p.z * ctx.side > 0;
    this.subjOk = false;
    const sub = this.subject(ctx, pid, 0, true);
    const from = this.has ? this.cur : ctx.game;
    const off = this.v.copy(from.pos).sub(sub);
    s.az0 = Math.atan2(off.x, off.z);
    s.r0 = Math.hypot(off.x, off.z);
    s.h0 = off.y;
    // end beside them on the side of the middle of the court, a little towards the net, looking out at them and
    // the stands behind
    const ex = -(Math.sign(sub.x) || 1);
    const end = Math.atan2(ex, -ctx.side * 0.6);
    let d = end - s.az0;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    s.turn = d;
    s.look0.copy(from.look);
    s.fov0 = from.fov;
    this.start(s, s.near || this.reduced ? 0 : 0.9);
  }

  /** A replay: a cut to a TV angle that follows the ball (hidden by the replay's sting). */
  replay(ctx: DirCtx, angle: ReplayAngle, hitter: number) {
    const s = this.make('replay');
    s.angle = angle;
    s.pid = hitter;
    // the camera on the side of the court away from the action (sees more of it)
    const hp = ctx.players[hitter];
    s.camSide = hp && Math.abs(hp.x) > 0.4 ? -Math.sign(hp.x) : 1;
    if (ctx.ball) this.track.copy(ctx.ball);
    else this.track.set(0, 1, 0);
    this.trackV.set(0, 0, 0);
    this.trackZ = this.track.z * 0.55;
    this.start(s, 0);
  }

  /** The end of the match: a slow orbit round the winners. */
  victory(ctx: DirCtx, team: 0 | 1, cut = false) {
    const s = this.make('victory');
    s.team = team;
    this.subjOk = false;
    const c = this.teamCentre(ctx, team);
    const sd = Math.sign(c.z) || 1;
    const pair = ctx.players.filter((p) => p.team === team).length > 1;
    const portrait = ctx.aspect < 0.8;
    // a pair in a wide frame: from the front (even across the net, from higher up) so both stand side by side,
    // turning towards straight on. Otherwise beside them on their side of the net, turning away from it (a pair in a
    // tall frame from higher up, so the one behind shows above the other)
    const front = pair && !portrait;
    const r = (s.r0 = pair ? (portrait ? 6.6 : 6.0) : portrait ? 5.6 : 4.8);
    s.h0 = pair ? (portrait ? 3.8 : 2.4) : 1.75;
    const dz = front ? -sd * 0.8 * r : -sd * Math.min(0.55 * r, Math.max(0, Math.abs(c.z) - 0.9));
    const dx = -(Math.sign(c.x) || 1) * Math.sqrt(Math.max(0, r * r - dz * dz));
    s.az0 = Math.atan2(dx, dz);
    s.turn = (front ? Math.sign(dx) * sd : -Math.sign(dx) * sd) || 1;
    this.start(s, this.reduced || cut ? 0 : 1.3);
  }

  private start(s: Shot, blend: number) {
    if (this.has) {
      this.from.pos.copy(this.cur.pos);
      this.from.look.copy(this.cur.look);
      this.from.fov = this.cur.fov;
    } else blend = 0;
    this.shot = s;
    this.t = 0;
    this.blend = blend;
  }

  /** The camera this frame. `dt` is the time on screen (replays run in slow motion: the camera does not). */
  update(dt: number, ctx: DirCtx, out: CamPose): CamPose {
    this.t += dt;
    const s = this.shot;
    const portrait = ctx.aspect < 0.8;
    const g = ctx.game;
    const R = this.reduced;
    let pos = out.pos;
    let look = out.look;
    let fov = g.fov;
    switch (s.kind) {
      case 'play':
        pos.copy(g.pos);
        look.copy(g.look);
        break;
      case 'intro': {
        if (!this.path || !this.lookPath || R || this.t >= this.introLen) {
          pos.copy(g.pos);
          look.copy(g.look);
          break;
        }
        // keep the end on the live gameplay camera
        this.path.points[3].copy(g.pos);
        this.lookPath.points[3].copy(g.look);
        // three legs (past the far team, the near team, into the gameplay camera), timed for the name straps:
        // it sets off from rest, keeps moving through the keys and lands softly. Across the net it lingers on the
        // far team and settles on the near one (the move is in the middle), and on the way down into the gameplay
        // camera it keeps looking at the near team a while (they stay in the frame while their strap is on)
        const T = INTRO_KEYS;
        const i = this.t < T[1] ? 0 : this.t < T[2] ? 1 : 2;
        const x = (this.t - T[i]) / (T[i + 1] - T[i]);
        const h = i === 0 ? 2 * x * x - x * x * x : i === 2 ? x + x * x - x * x * x : x + 0.7 * (x * x * (3 - 2 * x) - x);
        const u = (i + h) / 3;
        this.path.getPoint(u, pos);
        if (i === 2) look.copy(this.lookPath.points[2]).lerp(g.look, h * h * h);
        else this.lookPath.getPoint(u, look);
        fov = lerp(this.fovs[i], i === 2 ? g.fov : this.fovs[i + 1], h);
        break;
      }
      case 'frame': {
        // long lens from the gameplay end, lower, on the server; a slow zoom in
        const sub = this.subject(ctx, s.pid, dt);
        pos.copy(g.pos).lerp(sub, 0.2);
        pos.y = lerp(g.pos.y, 2.4, 0.55);
        look.copy(sub).setY(1.0);
        const zoom = 1 - (s.tight ? 0.14 : 0.06) * Math.min(1, this.t / 3);
        const h = (portrait ? 4.8 : 3.8) * (s.tight ? 0.8 : 1) * zoom;
        fov = fovFor(h, pos.distanceTo(look));
        break;
      }
      case 'pushin': {
        // a gentle push towards the player at the camera's end (they serve: nothing in the way of the serve box)
        const sub = this.subject(ctx, s.pid, dt);
        const k = 0.3 * ease(this.t / 2.6) * (s.tight ? 1.4 : 1);
        this.w.copy(sub).setY(1.3);
        pos.copy(g.pos).lerp(this.w, k * 0.75);
        this.w.set(sub.x * 0.6, 0.6, sub.z - ctx.side * 4.5);
        look.copy(g.look).lerp(this.w, k);
        fov = g.fov * (1 - 0.05 * k);
        break;
      }
      case 'react': {
        const sub = this.subject(ctx, s.pid, dt);
        if (s.near) {
          // an orbit from where the camera was to beside them, down to chest height
          const u = R ? 1 : ease(this.t / 1.0);
          const drift = R ? 0 : Math.max(0, this.t - 1.0) * 0.07 * Math.sign(s.turn || 1);
          const az = s.az0 + s.turn * u + drift;
          const r = lerp(s.r0, portrait ? 5.4 : 4.6, u);
          const h = lerp(s.h0, portrait ? 2.0 : 1.7, u);
          pos.set(sub.x + Math.sin(az) * r, h, sub.z + Math.cos(az) * r);
          this.w.copy(sub).setY(1.3); // (a little over the chest: the head clear of the point banner)
          look.copy(s.look0).lerp(this.w, R ? 1 : ease(this.t / 0.8));
          fov = lerp(s.fov0, portrait ? 50 : 34, u);
        } else {
          // at the far end: the long lens, tighter than for a serve
          pos.copy(g.pos).lerp(sub, 0.24);
          pos.y = lerp(g.pos.y, 2.2, 0.6);
          look.copy(sub).setY(1.05);
          const h = (portrait ? 3.8 : 2.8) * (1 - (R ? 0 : 0.08 * Math.min(1, this.t / 2)));
          fov = fovFor(h, pos.distanceTo(look));
        }
        break;
      }
      case 'replay': {
        // follow the drawn ball with a soft spring (no jitter when it changes direction)
        const b = ctx.ball;
        if (b) {
          const k = 7;
          const ax = (b.x - this.track.x) * k * k - this.trackV.x * 2 * k;
          const ay = (b.y - this.track.y) * k * k - this.trackV.y * 2 * k;
          const az = (b.z - this.track.z) * k * k - this.trackV.z * 2 * k;
          const h = Math.min(dt, 1 / 30);
          this.trackV.x += ax * h;
          this.trackV.y += ay * h;
          this.trackV.z += az * h;
          this.track.addScaledVector(this.trackV, h);
        }
        if (R) {
          // reduced motion: one wide, still angle high behind the far end (the whole court in the frame)
          pos.set(0, 9, -ctx.side * (HL + 6));
          look.set(0, 0, 0.5 * ctx.side);
          fov = portrait ? 64 : 42;
          break;
        }
        // (the look stays over the court, the players in the frame: a winner flying on past the baseline, or a dead
        // ball rolling to the camera's feet, must not take it off to an empty corner)
        const tb = this.track;
        let lz = Math.max(-HL - 0.2, Math.min(HL + 0.2, tb.z));
        // (the reverse angle from the far end: a winner landing at that end would tip the camera down at its own
        // feet, the players out of the top of the frame; it looks no nearer than 2 m inside that baseline)
        if (s.angle === 'end') lz = -ctx.side * Math.min(-ctx.side * lz, HL - 2);
        // (and across, a little towards where the players are: a ball going out wide does not leave them out of the
        // side of a tall frame)
        let px = 0;
        for (const p of ctx.players) px += p.x / Math.max(1, ctx.players.length);
        const bx = Math.max(-W / 2 - 0.5, Math.min(W / 2 + 0.5, tb.x)) * 0.8;
        look.set(lerp(bx, px, 0.35), lerp(Math.min(2.4, Math.max(0.3, tb.y)), 0.9, 0.5), lz);
        const hp = ctx.players[s.pid];
        const hs = hp ? Math.sign(hp.z) || 1 : 1;
        // high enough that the frame is court and stands, not sky (portrait frames are tall)
        if (s.angle === 'side') {
          // up in the stands on the side, dollying along with the ball
          this.trackZ += (lz * 0.55 - this.trackZ) * (1 - Math.exp(-2.5 * dt));
          pos.set(s.camSide * (W / 2 + 6.6), portrait ? 5.6 : 4.3, this.trackZ);
          fov = portrait ? 50 : 30;
        } else if (s.angle === 'end') {
          // the reverse angle: high behind the far end, looking back up the court
          pos.set(look.x * 0.4 + s.camSide * 1.4, portrait ? 7.2 : 5.0, -ctx.side * (HL + 6.2));
          fov = portrait ? 50 : 34;
        } else {
          // low by the net post on the receiving side, looking along the tape (the net cord)
          pos.set(s.camSide * (W / 2 + (portrait ? 2.4 : 1.4)), portrait ? 1.5 : 1.1, -hs * (portrait ? 3.2 : 1.8));
          fov = portrait ? 56 : 42;
        }
        break;
      }
      case 'victory': {
        const c = this.teamCentre(ctx, s.team);
        if (!this.subjOk) {
          this.subj.copy(c);
          this.subjOk = true;
        } else this.subj.lerp(c, 1 - Math.exp(-3 * dt));
        const az = s.az0 + (R ? 0 : this.t * 0.17 * s.turn);
        pos.set(this.subj.x + Math.sin(az) * s.r0, s.h0, this.subj.z + Math.cos(az) * s.r0);
        look.copy(this.subj).setY(1.05);
        fov = portrait ? 50 : 36;
        break;
      }
    }
    // blend in from where the camera was
    if (this.blend > 0 && this.t < this.blend) {
      const k = ease(this.t / this.blend);
      pos = pos.lerpVectors(this.from.pos, pos, k);
      look = look.lerpVectors(this.from.look, look, k);
      fov = lerp(this.from.fov, fov, k);
    }
    out.fov = fov;
    this.cur.pos.copy(pos);
    this.cur.look.copy(look);
    this.cur.fov = fov;
    this.has = true;
    return out;
  }

  /** a player's place, followed smoothly (chest height is added by the shots) */
  private subject(ctx: DirCtx, pid: number, dt: number, snap = false): THREE.Vector3 {
    const p = ctx.players[pid];
    if (!p) return this.subj;
    if (!this.subjOk || snap) {
      this.subj.set(p.x, 0, p.z);
      this.subjOk = true;
    } else this.subj.lerp(this.v.set(p.x, 0, p.z), 1 - Math.exp(-4 * dt));
    return this.subj;
  }

  private teamCentre(ctx: DirCtx, team: 0 | 1): THREE.Vector3 {
    let x = 0;
    let z = 0;
    let n = 0;
    for (const p of ctx.players)
      if (p.team === team) {
        x += p.x;
        z += p.z;
        n++;
      }
    return this.w.set(n ? x / n : 0, 0, n ? z / n : 0);
  }
}
