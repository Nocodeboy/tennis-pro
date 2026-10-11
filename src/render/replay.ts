// Instant replays: the last seconds of the match as they were drawn (the ball, every body's pose and the net), kept
// in a ring buffer every frame, plus the hits, bounces and net touches to replay their sparks and sounds. Replaying
// the drawn state (not re-running the simulation) keeps the characters exactly as they looked, IK included.

import type { ShotKind } from '../sim/types';

export interface RecEvent {
  t: number;
  type: 'hit' | 'bounce' | 'net';
  x: number;
  y: number;
  z: number;
  /** hit: who, what, how fast (m/s) and whether it was a perfect swing */
  pid: number;
  kind: ShotKind | null;
  speed: number;
  perfect: boolean;
  /** bounce: in or out · net: a net cord (over the tape) */
  good: boolean;
  tape: boolean;
}

/** frame header: ball x y z, ball quaternion x y z w, ball shown (0/1), net offset */
export const HEAD = 9;

export class Recorder {
  readonly stride: number;
  readonly cap: number;
  readonly data: Float32Array;
  private times: Float64Array;
  private head = 0;
  count = 0;
  events: RecEvent[] = [];
  private lastT = -Infinity;

  constructor(
    readonly players: number,
    readonly poseSize: number,
    readonly seconds = 8,
    hz = 60,
  ) {
    this.stride = HEAD + players * poseSize;
    this.cap = Math.ceil(seconds * hz) + 4;
    this.data = new Float32Array(this.cap * this.stride);
    this.times = new Float64Array(this.cap);
  }

  clear() {
    this.head = 0;
    this.count = 0;
    this.events.length = 0;
    this.lastT = -Infinity;
  }

  /** Where to write the frame of sim time t (−1: too soon after the last one, at most ~60 a second). */
  begin(t: number): number {
    if (t < this.lastT - 0.5) this.clear(); // time went back: another match
    if (t < this.lastT + 1 / 64) return -1;
    this.lastT = t;
    const slot = this.head;
    this.head = (this.head + 1) % this.cap;
    this.count = Math.min(this.cap, this.count + 1);
    this.times[slot] = t;
    return slot * this.stride;
  }

  event(e: RecEvent) {
    this.events.push(e);
    while (this.events.length && this.events[0].t < e.t - this.seconds) this.events.shift();
  }

  private slot(i: number): number {
    return (this.head - this.count + i + this.cap * 2) % this.cap;
  }
  get first(): number {
    return this.count ? this.times[this.slot(0)] : 0;
  }
  get last(): number {
    return this.count ? this.times[this.slot(this.count - 1)] : 0;
  }

  /** The two frames around sim time t (offsets into data) and how far t is between them. */
  locate(t: number, out: { a: number; b: number; k: number }): { a: number; b: number; k: number } {
    if (!this.count) {
      out.a = out.b = 0;
      out.k = 0;
      return out;
    }
    let lo = 0;
    let hi = this.count - 1;
    if (t <= this.times[this.slot(0)]) hi = 0;
    else if (t >= this.times[this.slot(hi)]) lo = hi;
    else
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (this.times[this.slot(mid)] <= t) lo = mid;
        else hi = mid;
      }
    const sa = this.slot(lo);
    const sb = this.slot(hi);
    const ta = this.times[sa];
    const tb = this.times[sb];
    out.a = sa * this.stride;
    out.b = sb * this.stride;
    out.k = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0;
    return out;
  }
}

/** A replay being shown: the window of sim time, where it is and the moments it slows down for. */
export interface ReplayRun {
  t0: number;
  t1: number;
  cur: number;
  /** sim times of the decisive moments it slows down for (the winning hit, a net cord); never the end */
  keys: number[];
  /** the camera: up on the side, the reverse angle from the far end, or low at the net post */
  angle: 'side' | 'end' | 'net';
  /** the player whose shot decided it (the camera goes to the side away from them) */
  hitter: number;
  /** next event to replay (sparks and sounds) */
  ev: number;
  done: boolean;
}

/** Slow motion: about 0.85 × between the moments, down to 0.3 × around them (and back up before the end). */
export function replaySpeed(r: ReplayRun, t: number): number {
  let near = 0;
  for (const k of r.keys) near = Math.max(near, Math.exp(-(((t - k) / 0.3) ** 2)));
  return 0.85 - 0.55 * near;
}
