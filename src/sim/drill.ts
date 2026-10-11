// Training (the «Entrenamiento» menu): a ball machine on the far side feeds balls for one skill at a time, and every
// ball the player sends back is scored. It is a Match like any other (the same rules, feet, circle, assist, timing ring
// and aim), with the machine as the far player: it never plays a ball (Match.feed puts its balls in play, mid-rally).
// No DOM: the game (src/training.ts) and the bots (tools/review/drills.ts) run the same code.

import { HUMAN_REACTION, HUMAN_SPEED, ballCue } from './brain';
import { HL, LINE, NET_C, NVZ, W, inServiceCourt } from './court';
import { Match, type Controller } from './match';
import { Rng } from './rng';
import type { MatchEvent, ShotKind, ShotSpec, Timing } from './types';

export type DrillId = 'dink' | 'third' | 'attack' | 'defend' | 'serve';

/** A spot to aim at on the far side (x, z in the world, radius m) */
export interface Target {
  x: number;
  z: number;
  r: number;
}

export interface DrillDef {
  id: DrillId;
  /** balls (or serves) in a go */
  balls: number;
  /** the score for 1, 2 and 3 stars */
  stars: [number, number, number];
  /** the most a go can score */
  max: number;
  /** where the machine stands (world, the far side) */
  machine: { x: number; z: number };
  /** where the player starts (world, the near side) */
  start: { x: number; z: number };
  /** s from a dead ball to the next one */
  gap: number;
  /** the rally the fed ball belongs to (Match.feed): 2 = a return (the reply must bounce), 4 = anything goes */
  shots: number;
}

const K = NVZ + 0.5;
/**
 * The machine's mouth, from its feet (height, and how far in front of it towards the net): the balls leave from here.
 * (The model, src/render/drill-props.ts, is drawn a third bigger than a real one so it reads from the far end.)
 */
export const MOUTH = { y: 0.94, z: 0.58 };
/**
 * The five challenges. Stars: calibrated with the thumb bot (tools/review/drills.ts) so that a beginner gets one or two
 * and a good player three (docs/notas-08-entreno.md).
 */
export const DRILLS: DrillDef[] = [
  { id: 'dink', balls: 12, stars: [14, 28, 40], max: 60, machine: { x: 0, z: -K }, start: { x: 0, z: NVZ + 0.3 }, gap: 0.7, shots: 4 },
  { id: 'third', balls: 10, stars: [10, 20, 32], max: 50, machine: { x: 0, z: -(HL - 0.2) }, start: { x: 0, z: HL + 0.3 }, gap: 1.5, shots: 2 },
  { id: 'attack', balls: 12, stars: [12, 22, 33], max: 42, machine: { x: 0, z: -K }, start: { x: 0, z: NVZ + 0.3 }, gap: 0.8, shots: 4 },
  // (defence: the assisted swing gets almost every ball back by itself, so what tells players apart is the block, a tap
  // on the gold ring, and how low and soft it goes)
  { id: 'defend', balls: 12, stars: [16, 30, 41], max: 60, machine: { x: 0, z: -K }, start: { x: 0, z: NVZ + 0.3 }, gap: 1.0, shots: 4 },
  { id: 'serve', balls: 10, stars: [14, 26, 38], max: 50, machine: { x: -(W / 2 + 1.1), z: -2.2 }, start: { x: 0, z: HL + 0.3 }, gap: 0, shots: 1 },
];

/** The ball machine's controller: it never serves and never plays a ball (its reaction keeps it from planning one). */
class Machine implements Controller {
  readonly mover = { netRush: 0, misjudge: 0, kitchenFault: 0, lunge: 0 };
  serve() {
    return null;
  }
  hit(): ShotSpec {
    return { kind: 'dink', tx: 0, tz: 1, clear: 0.3, q: 1, timing: 'good' };
  }
}

/** A part of a ball's result, for the label: an i18n key, its values and the points it gave. */
export interface Part {
  key: string;
  vars?: Record<string, string | number>;
  pts?: number;
}

export interface BallResult {
  /** which ball of the go (0 …) */
  n: number;
  pts: number;
  parts: Part[];
  /** where it landed on the far side (for the floater), or null */
  at: { x: number; z: number } | null;
  /** the target hit, or −1 */
  target: number;
  /** what the player did with it (for the stats on the result screen and the bots) */
  kind: ShotKind | null;
  timing: Timing | null;
  clear: number | null;
  /** attack drill: was it a high ball at the contact */
  high?: boolean;
  /** the point's reason when the ball was lost, for the explanation */
  reason?: string;
}

type HitEvent = Extract<MatchEvent, { type: 'hit' }>;

/** How low over the net a soft shot has to cross to earn its points (m over the tape) */
const LOW = 0.22;
const LOWISH = 0.32;
/** The (world) speed above which an attack earns its bonus: 54 km/h. */
const FAST = 15;
/** A ball met above this is one to attack (the same line the aim uses for a speed-up: brain.ts kindForAim). */
export const HIGH = NET_C + 0.2;

export class Drill {
  readonly match: Match;
  /** balls scored so far */
  ball = 0;
  score = 0;
  readonly results: BallResult[] = [];
  done = false;
  /** a ball has been scored (the game shows it) */
  onBall: ((r: BallResult) => void) | null = null;
  private rng: Rng;
  /** the ball now in play: fed (or served) when, whether it is a high one (attack), the player's hit and where it landed */
  private cur: { at: number; high: boolean; saw?: 'attack' | 'block'; hit: HitEvent | null; land: { x: number; z: number; good: boolean } | null; tg: Target[]; half: 1 | -1 } | null = null;
  private nextAt: number | null = null;
  /** the attack drill: high and low balls, shuffled */
  private plan: boolean[] = [];
  /** the boxes to serve to: the score's parity picks the court (the player alternates sides) */
  private serves = 0;

  constructor(
    readonly def: DrillDef,
    human: Controller,
    seed: number,
  ) {
    this.rng = new Rng(seed ^ 0x5eed);
    this.match = new Match(
      [
        { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
        // (the machine: a far player that never gets to a ball, 99 s of reaction)
        { team: 1, human: false, speed: 0.5, reaction: 99, look: 0 },
      ],
      { scoring: 'rally', to: 9999 },
      seed,
    );
    this.match.setControllers([human, new Machine()]);
    if (def.id === 'attack') {
      const n = def.balls;
      this.plan = Array.from({ length: n }, (_, i) => i < n / 2);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(this.rng.next() * (i + 1));
        [this.plan[i], this.plan[j]] = [this.plan[j], this.plan[i]];
      }
    }
  }

  /** The targets to draw and to score (the serve: the box served to now). */
  targets(): Target[] {
    const m = this.match;
    if (this.def.id === 'dink') return [-1.6, 0, 1.6].map((x) => ({ x, z: -1.15, r: 0.5 }));
    if (this.def.id === 'serve') {
      // (in the receiver's box: the deep corner by the sideline and the deep T)
      const half = -m.serveX(0);
      return [
        { x: half * (W / 2 - 0.62), z: -(HL - 0.72), r: 0.55 },
        { x: half * 0.62, z: -(HL - 0.72), r: 0.55 },
      ];
    }
    return [];
  }

  /** The zone a ball should land in, to draw (the far kitchen in the dink, third shot and defence drills). */
  zone(): { x0: number; x1: number; z0: number; z1: number } | null {
    if (this.def.id === 'dink' || this.def.id === 'third' || this.def.id === 'defend') return { x0: -W / 2, x1: W / 2, z0: -NVZ, z1: 0 };
    return null;
  }

  start() {
    const m = this.match;
    const me = m.players[0];
    this.pin();
    if (this.def.id === 'serve') {
      m.serverTeam = 0;
      m.score = [0, 0];
      m.setupServe();
      this.pin();
      return;
    }
    me.x = me.homeX = this.def.start.x;
    me.z = me.homeZ = this.def.start.z;
    me.vx = me.vz = 0;
    m.idle(1e6);
    this.nextAt = m.t + 1.2;
  }

  /** Where the machine's barrel is (the balls leave from here). */
  mouth(): { x: number; y: number; z: number } {
    const mc = this.def.machine;
    return { x: mc.x, y: MOUTH.y, z: mc.z + MOUTH.z };
  }

  /** The machine stays where it is (the match would move it like a player). */
  private pin() {
    const q = this.match.players[1];
    q.x = q.homeX = this.def.machine.x;
    q.z = q.homeZ = this.def.machine.z;
    q.vx = q.vz = 0;
  }

  /** Once a frame, after the match has stepped and its events have been read: the machine feeds the next ball. */
  frame() {
    const m = this.match;
    this.pin();
    // what the game told the player about the ball on its way (the orange ring of an attackable ball, the block ring):
    // the attack and defence challenges score what he saw, as in a match (brain.ts ballCue, as HumanController.cue)
    const c = this.cur;
    if (c && !c.hit && m.phase === 'rally') {
      const me = m.players[0];
      const cue = ballCue(m, me, m.targetFor(me.id) ?? me.plan);
      if (cue) c.saw = cue;
    }
    if (this.done || this.def.id === 'serve' || this.nextAt === null || m.phase === 'rally' || m.t < this.nextAt) return;
    this.nextAt = null;
    this.feed();
  }

  /** s until the next ball leaves the machine (null: none on its way) */
  untilNext(): number | null {
    return this.nextAt === null ? null : Math.max(0, this.nextAt - this.match.t);
  }

  private feed() {
    const m = this.match;
    const me = m.players[0];
    const r = this.rng;
    const u = () => r.next();
    const clampX = (x: number) => Math.max(-W / 2 + 0.35, Math.min(W / 2 - 0.35, x));
    let spec: Omit<ShotSpec, 'q' | 'timing'>;
    let high = false;
    switch (this.def.id) {
      case 'dink':
        // a soft dink into the player's kitchen, to the forehand or the backhand
        spec = { kind: 'dink', tx: clampX(this.def.start.x + (u() - 0.5) * 2.8), tz: 0.8 + u() * 1.0, clear: 0.12 + u() * 0.12 };
        break;
      case 'third':
        // a deep return to the baseline
        spec = { kind: 'return', tx: clampX((u() - 0.5) * 3.2), tz: HL - 0.8 - u() * 1.4, clear: 0.45 + u() * 0.4, pace: 1.05 };
        break;
      case 'attack':
        high = this.plan[this.ball] ?? u() < 0.5;
        // a high one: a dink that sits up and comes to the player at the line at 1.1–1.5 m (to put away); a low one:
        // a good dink into the kitchen (to keep in the dink game)
        spec = high
          ? { kind: 'dink', tx: clampX(this.def.start.x + (u() - 0.5) * 1.8), tz: NVZ + 1.6 + u() * 1.0, clear: 0.6 + u() * 0.3 }
          : { kind: 'dink', tx: clampX(this.def.start.x + (u() < 0.5 ? -1 : 1) * (0.3 + u() * 1.1)), tz: 0.8 + u() * 0.9, clear: 0.1 + u() * 0.1 };
        break;
      case 'defend': {
        // a speed-up at the player, flat and fast: at the body, at the feet (it dips in front of him) or wide of him
        // (a reach), a third of each, in turns
        const way = this.ball % 3;
        const side = u() < 0.5 ? -1 : 1;
        const tx = way === 2 ? me.x + side * (1.3 + u() * 0.6) : me.x + (u() - 0.5) * 0.6;
        const tz = way === 1 ? Math.abs(me.z) - 0.25 + u() * 0.5 : Math.abs(me.z) + 0.7 + u() * 0.9;
        spec = { kind: 'speedup', tx: clampX(tx), tz: Math.max(NVZ + 0.1, Math.min(HL - 0.3, tz)), clear: 0.06 + u() * 0.12, pace: 0.72 + u() * 0.12 };
        break;
      }
      default:
        return;
    }
    this.cur = { at: m.t, high, hit: null, land: null, tg: [], half: 1 };
    m.feed(1, this.mouth(), { ...spec, q: 1, timing: 'good' }, this.def.shots);
  }

  /** Every event of the match, in order. */
  event(e: MatchEvent) {
    const m = this.match;
    if (this.done) return;
    if (e.type === 'hit') {
      if (e.pid === 0) {
        if (!this.cur) this.cur = { at: m.t, high: false, hit: null, land: null, tg: [], half: 1 };
        this.cur.hit = e;
        this.cur.land = null;
        // (the targets as they were for this ball: the serve's box changes with the score once the point is over)
        this.cur.tg = this.targets();
        this.cur.half = (-m.serveX(0)) as 1 | -1;
      }
      return;
    }
    if (e.type === 'bounce') {
      // the first bounce of the player's ball: where it landed (on the far side, or short on his own)
      if (this.cur?.hit && !this.cur.land && e.first) this.cur.land = { x: e.x, z: e.z, good: e.good };
      return;
    }
    if (e.type !== 'point') return;
    const c = this.cur;
    this.cur = null;
    // (a fed ball that went wrong on its own, out or into the net: it does not count, the machine feeds another)
    const counts = !(e.fault === 1 && !c?.hit);
    if (counts && c) this.finish(this.score1(c, e));
    if (this.def.id === 'serve') {
      // the player serves again, from the other court (the score's parity picks it)
      m.serverTeam = 0;
      m.score = [this.serves % 2, 0];
      if (this.ball >= this.def.balls) this.end();
      return;
    }
    if (this.ball >= this.def.balls) return this.end();
    // (the pause until the next ball: no serve is set up meanwhile)
    m.idle(this.def.gap + 30);
    this.nextAt = m.t + this.def.gap;
  }

  private end() {
    this.done = true;
    this.nextAt = null;
    this.match.idle(1e6);
  }

  private finish(r: BallResult) {
    this.ball++;
    this.score += r.pts;
    this.results.push(r);
    if (this.def.id === 'serve') this.serves++;
    this.onBall?.(r);
  }

  /** The score of one ball. */
  private score1(c: NonNullable<Drill['cur']>, e: Extract<MatchEvent, { type: 'point' }>): BallResult {
    const h = c.hit;
    const base: BallResult = { n: this.ball, pts: 0, parts: [], at: null, target: -1, kind: h?.kind ?? null, timing: h?.timing ?? null, clear: h?.clear ?? null, high: c.high, reason: e.reason };
    const id = this.def.id;
    if (!h) {
      // the player never got his paddle to it
      base.parts.push({ key: id === 'attack' && c.high ? 'dr.letPass' : 'dr.missed' });
      return base;
    }
    if (e.winner !== 0 || !c.land || !c.land.good) {
      base.parts.push({ key: e.reason === 'net' ? 'dr.net' : e.reason === 'kitchen' ? 'dr.kitchen' : e.reason === 'twoBounce' ? 'dr.twoBounce' : 'dr.out' });
      return base;
    }
    const L = c.land;
    base.at = { x: L.x, z: L.z };
    const clear = h.clear ?? 1;
    const inK = Math.abs(L.z) <= NVZ + LINE;
    const cm = (v: number) => Math.max(1, Math.round(v * 100));
    const add = (key: string, pts: number, vars?: Part['vars']) => {
      base.pts += pts;
      base.parts.push({ key, pts, vars });
    };
    const soft = h.kind === 'dink' || h.kind === 'drop' || h.kind === 'auto';
    switch (id) {
      case 'dink': {
        if (!inK) {
          base.parts.push({ key: 'dr.longK', vars: { cm: cm(Math.abs(L.z) - NVZ) } });
          break;
        }
        add('dr.inK', 1);
        const ti = this.hitTarget(L, c.tg);
        if (ti >= 0) {
          base.target = ti;
          add('dr.target', 2);
        }
        // (an aimed dink is meant to clear the tape by 17 cm: brain.ts kindForAim)
        if (clear < LOW) add('dr.low', 2, { cm: cm(clear) });
        else if (clear < LOWISH) add('dr.lowish', 1, { cm: cm(clear) });
        else base.parts.push({ key: 'dr.high', vars: { cm: cm(clear) } });
        break;
      }
      case 'third': {
        if (inK) {
          add('dr.inK', 3);
          if (clear < LOWISH) add('dr.lowish', 1, { cm: cm(clear) });
          else base.parts.push({ key: 'dr.high', vars: { cm: cm(clear) } });
        } else if (Math.abs(L.z) - NVZ < 1.2 && clear < 0.5) add('dr.almost', 1, { cm: cm(Math.abs(L.z) - NVZ) });
        else base.parts.push({ key: 'dr.longK', vars: { cm: cm(Math.abs(L.z) - NVZ) } });
        // moved up behind it: off the baseline into the transition zone (or further) by the time it died
        if (base.pts > 0 && Math.abs(this.match.players[0].z) <= 4.6) add('dr.up', 1);
        break;
      }
      case 'attack': {
        // high: the ball the game marked attackable (the orange ring), or met well above the tape if the circle never
        // settled on it; the attack: the flick (or the smash, which stays automatic overhead)
        const high = c.saw === 'attack' || h.y > HIGH;
        base.high = high;
        const attack = h.intent === 'attack' || h.kind === 'speedup' || h.kind === 'smash';
        if (high && attack) {
          add('dr.attacked', 3, { kmh: Math.round(h.speed * 3.6) });
          if (h.speed >= FAST || h.timing === 'perfect') add(h.timing === 'perfect' ? 'dr.perfect' : 'dr.fast', 1);
        } else if (high) base.parts.push({ key: 'dr.gift', vars: { cm: cm(h.y) } });
        else if (soft && inK) {
          add('dr.held', 2);
          if (clear < LOW) add('dr.low', 1, { cm: cm(clear) });
        } else if (soft && clear < LOWISH && Math.abs(L.z) - NVZ < 0.6) add('dr.almost', 1, { cm: cm(Math.abs(L.z) - NVZ) });
        else if (soft) base.parts.push({ key: 'dr.longK', vars: { cm: cm(Math.abs(L.z) - NVZ) } });
        else base.parts.push({ key: 'dr.lowAttack', vars: { cm: cm(h.y) } });
        break;
      }
      case 'defend': {
        // the block: a tap on the gold ring (timing 'perfect') is the clean one
        add('dr.back', 1);
        if (h.intent === 'block') add(h.timing === 'perfect' ? 'dr.blockClean' : 'dr.block', h.timing === 'perfect' ? 2 : 1);
        if (clear < LOWISH) add('dr.lowish', 1, { cm: cm(clear) });
        if (inK) add('dr.reset', 1);
        break;
      }
      case 'serve': {
        if (!inServiceCourt(L.x, L.z, -1, c.half)) {
          base.parts.push({ key: 'dr.out' });
          break;
        }
        add('dr.serveIn', 1);
        if (Math.abs(L.z) >= HL - 1.5) add('dr.deep', 1);
        const ti = this.hitTarget(L, c.tg);
        if (ti >= 0) {
          base.target = ti;
          add('dr.target', 2);
        }
        if (h.timing === 'perfect') add('dr.perfect', 1);
        break;
      }
    }
    return base;
  }

  /** Which target a landing is on (−1: none). */
  private hitTarget(L: { x: number; z: number }, ts: Target[]): number {
    let best = -1;
    let bd = Infinity;
    ts.forEach((t, i) => {
      const d = Math.hypot(L.x - t.x, L.z - t.z);
      if (d <= t.r && d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** 0 … 3 stars for a score */
  stars(score = this.score): number {
    return this.def.stars.filter((s) => score >= s).length;
  }
}
