// The match: positions, the ball, the rules of a rally and the score. Deterministic for a given seed and the same
// shot decisions, so the bot, the browser and (later) an online server run exactly the same code.
//
// Padel doubles (FIP rules), always four players: everything goes through `players` and `team`, never "the player"
// and "the CPU".
//  · The serve: underhand after a bounce, from behind the service line, diagonally into the box. Two serves; a let if
//    it touches the net and bounces in; a fault if, after bouncing in, it hits the mesh before the second bounce.
//  · The rally: the ball must bounce in the other half before touching anything else there; after the bounce it can
//    come back off the glass or the mesh and is still live until it bounces a second time. Out of the court over the
//    walls after bouncing («por 3») or back over the net («por 4»): the hitter's point. The return must bounce.
//  · The score: 15-30-40, golden point at 40-40 (or advantages), games to a short set with a tie-break.
//  · Each player keeps his side for the set (right, «drive», or left, «revés»); the receiver is the one in the box the
//    serve goes to, the server serves from the right on even points of the game and the serve goes round the four.

import { bounce, groundTime, minFlight, netTime, nextEvent, posAt, seg, shotByClearance, velAt, wallBounce, wallTime, type Seg, type Vec3, type WallHit } from './ball';
import { AT_NET, DEPTH_Z, HL, NET_C, R, SERVICE, W, backSurface, inHalf, inServiceCourt, netHeight, serveOutBy, sideSurface, type Side, type Surface } from './court';
import { Rng } from './rng';
import type { MatchEvent, Plan, Player, PointReason, Rules, ServeFault, ShotKind, ShotSpec, Timing } from './types';

/** Spin each kind of shot carries: topspin drives, sliced volleys, bandejas, víboras and chiquitas. */
export const SPIN: Record<ShotKind, number> = { serve: -0.2, return: 0.2, drive: 0.6, speedup: 0.2, smash: 0.25, bandeja: -0.55, vibora: -0.75, lob: 0.35, dink: -0.3, drop: -0.6, auto: -0.35 };
const SOFT = new Set<ShotKind>(['dink', 'drop']);
/**
 * A hard shot gone wrong (Match.launch) carries up to this × (0.3 + 1) × (1 − q) m long: on a 10 m half a deep drive
 * of a poor contact lands in the back glass on the fly (a fault), a short one only sits up.
 */
const LONG = 2.0;

export interface Controller {
  /** The server: a shot when ready, null to keep waiting (the human aiming, the AI's routine). */
  serve(m: Match, p: Player): ShotSpec | null;
  /** The ball is on the paddle right now. */
  hit(m: Match, p: Player, plan: Plan): ShotSpec;
  /** How the player moves between shots. */
  readonly mover: Mover;
  /**
   * Manual players only: where the stick points, in world space (length ≤ 1). Players with `steer` move themselves
   * and get their contact worked out every step from where they stand; the rest run to the planned spot on their own.
   */
  steer?(m: Match, p: Player): { x: number; z: number };
  /** Manual players only: does the player swing at this ball now? (No swing: the ball goes past.) */
  swing?(m: Match, p: Player, plan: Plan): boolean;
  /** Manual players only: how much the game helps them into position (0 none · 1 a little · 2 a lot). */
  assist?: number;
  /**
   * Manual players only: with the thumb off the stick while their own shot is on its way, the player jogs back to a
   * sensible spot by himself (see Match.recoverSpot). Off by default: it is movement the player did not ask for.
   */
  recover?: boolean;
  /** Manual players in doubles: take a ball that is the partner's (the human holding the aim)? */
  poach?(m: Match, p: Player): boolean;
  /**
   * CPU players: their first read of the coming ball. A fast or spinning ball can be misjudged: the feet head for a
   * spot (dx, dz) off the real one, and the read is corrected at time `at` (see Match.misread). null: read right.
   */
  read?(m: Match, p: Player, plan: Plan): { dx: number; dz: number; at: number } | null;
}

export interface Mover {
  /** 0 … 1: how readily they move up to the net */
  netRush: number;
  /** chance of volleying a ball that was going straight into the glass (the other side's fault if left alone) */
  misjudge: number;
  /** CPU players: how far past the spot they can still reach with a lunge (m) */
  lunge?: number;
}

export interface PlayerCfg {
  team: 0 | 1;
  human: boolean;
  speed: number;
  reaction: number;
  look: number;
}

const STEP = 1 / 120;

/** The limits of a pair of feet (see FEET and HUMAN_FEET). */
export interface Feet {
  /** acceleration from still (m/s²) and what is left of it near top speed */
  up0: number;
  up1: number;
  /** the hardest they can stop or turn back (m/s²) */
  brakeMax: number;
  /** sideways grip while running at top speed (m/s²); turnLo: at walking pace (default: the same) */
  turn: number;
  turnLo?: number;
}

/**
 * CPU footwork (feet that look like a person's, not a cursor):
 *  · an explosive first step that eases into top speed: the faster they go, the less they can add (force–velocity);
 *  · a planted stop: they brake on a steady profile and stop on the spot, no creeping in over the last centimetres;
 *  · turning takes grip: running, the direction bends at a limited rate (paths curve; a reversal is a plant and a
 *    push back);
 *  · a split step when the other side hits: they land balanced during the reaction and only then go;
 *  · the pace the ball asks for: with time to spare they shuffle across or jog in, and sprint only when they must;
 *    no fidgeting over a few centimetres while they wait;
 *  · planted at the contact: they brake into the shot (at most `plantV` when the paddle meets the ball, on a ramp of
 *    `plantB`), and finish the swing before they run again (`follow` seconds at no more than `followV`; a soft shot,
 *    a dink, drop or block, is a short swing: `followSoft`).
 * The planner (planContact) uses the same model (runTime, plantTime) to know which balls each player can get to.
 */
export const FEET = {
  /** acceleration from still (m/s²) and what is left of it near top speed */
  up0: 30,
  up1: 4,
  /** the braking profile that plants them on a spot, and the hardest they can stop or turn back */
  brake: 11,
  brakeMax: 24,
  /** sideways grip while running (m/s²) */
  turn: 16,
  /** waiting: they only move when the spot is this far (m), and settle within `settle` */
  idle: 0.22,
  settle: 0.05,
  /**
   * s: how much a CPU player trusts their legs. They plan as if they were this much quicker than they are, so now and
   * then they go for a ball and come up a stretch short (a near miss, as people do; without it they never missed a
   * ball they went for, and the ladder got harder).
   */
  optimism: 0.03,
  /** with time in hand they jog (never slower than `jog`, m/s) to get there `margin` seconds early */
  jog: 2.2,
  margin: 0.35,
  /** back to the waiting spot at recover[0] + recover[1]·distance (m/s): briskly over metres, a step for centimetres */
  recover: [2.2, 1.4] as [number, number],
  /** into the contact: no faster than plantV + plantB·(time left) (m/s) */
  plantV: 1.0,
  plantB: 20,
  /** after their own contact: the swing is finished first (s, m/s) */
  follow: 0.22,
  followSoft: 0.12,
  followV: 1.0,
};

/**
 * The human's feet (the thumb): a person's too, a little livelier than the CPU's so the control answers at once
 * (docs/concepto.md, «Control y simulación 0.6»).
 *  · an explosive first step (38 m/s² from still, about what it was) that eases into top speed: 0 → 4 m/s in
 *    0.2 s (0.15 s right after a split step), it was 0.12 s at a constant push;
 *  · a planted stop at about 3 g (it was 5 g): from top speed, 0.15 s and 35 cm with the thumb off the stick. The
 *    assist parks him on a braking profile (`park`) that lands on the spot within a centimetre;
 *  · turning takes grip at speed (`turn`), hardly any at walking pace (`turnLo`);
 *  · a split step when the other side hits (`split` s: he can brake, but only push off gently), which pays off: for
 *    `load` s after it the first step is quicker (up0 × `loadUp`);
 *  · braking into his own contact (`plantV`, `plantB`, when the swing is going to happen) and the swing finished
 *    after it (`follow` s, `followSoft` after a dink, drop or block, at no more than `followV`, pushing off at
 *    `followUp`). What the thumb asks for meanwhile is applied as soon as each moment is over.
 */
export const HUMAN_FEET = {
  up0: 32,
  up1: 6,
  brakeMax: 30,
  turn: 22,
  turnLo: 34,
  /** the assist's braking profile into the suggested spot (m/s², below brakeMax) */
  park: 22,
  split: 0.1,
  splitUp: 16,
  /** after the split step: the first step is quicker (up0 × loadUp) for `load` seconds */
  load: 0.45,
  loadUp: 1.35,
  follow: 0.2,
  followSoft: 0.1,
  followV: 1.3,
  followUp: 8,
  /** into the contact (assisted swing): no faster than plantV + plantB·(time left) */
  plantV: 1.4,
  plantB: 22,
};

/** how far from still the first step takes them (the time constant of the force–velocity start), for speed vm */
const tauOf = (vm: number, f: Feet = FEET) => vm / (f.up0 + f.up1);

/**
 * Time for a player starting still to cover `d` metres towards a spot (top speed vm): the start eases into top
 * speed, x(t) = vm·(t − τ·(1 − e^(−t/τ))), solved for t (Newton). Matches footStep within a couple of hundredths
 * of a second over 0.2–8 m (measured: tools in docs, «Gráficos y simulación 0.5»).
 */
export function runTime(d: number, vm: number, f: Feet = FEET): number {
  if (d <= 0) return 0;
  const tau = tauOf(vm, f);
  let t = Math.max(Math.sqrt((2 * d * tau) / vm), d / vm + tau * 0.5);
  for (let i = 0; i < 6; i++) {
    const e = Math.exp(-t / tau);
    const fe = vm * (t - tau * (1 - e)) - d;
    const df = vm * (1 - e);
    if (df < 1e-6) break;
    t = Math.max(1e-3, t - fe / df);
  }
  return t;
}

/**
 * CPU players: the time a run of `d` metres costs on top of runTime for braking into the contact (FEET.plantV at
 * the paddle, on the plantB ramp) instead of running through it.
 */
export function plantTime(d: number, vm: number): number {
  if (d <= 0) return 0;
  const t = runTime(d, vm);
  const ve = vm * (1 - Math.exp(-t / tauOf(vm)));
  return ve > FEET.plantV ? ((ve - FEET.plantV) * (ve - FEET.plantV)) / (2 * FEET.plantB * ve) : 0;
}

/**
 * One step of a player's feet towards the velocity (wx, wz) they want, with the limits `f` (FEET: the CPU,
 * HUMAN_FEET: the thumb). `upCap` (m/s²) holds back the acceleration for a moment (split step, follow-through);
 * braking is never held back.
 */
export function footStep(p: { vx: number; vz: number }, wx: number, wz: number, h: number, vm: number, f: Feet = FEET, upCap = Infinity, upMul = 1) {
  const v = Math.hypot(p.vx, p.vz);
  let ax = wx - p.vx;
  let az = wz - p.vz;
  const up = Math.min(upCap, Math.max(f.up1, f.up0 * upMul * (1 - v / vm) + f.up1));
  if (v < 0.4) {
    // from (nearly) still: the first step goes any way
    const lim = (wx * p.vx + wz * p.vz < 0 ? Math.max(up, f.brakeMax) : up) * h;
    const am = Math.hypot(ax, az);
    if (am > lim) {
      ax *= lim / am;
      az *= lim / am;
    }
  } else {
    const ux = p.vx / v;
    const uz = p.vz / v;
    let along = ax * ux + az * uz;
    let px = ax - along * ux;
    let pz = az - along * uz;
    const la = (along > 0 ? up : f.brakeMax) * h;
    along = Math.max(-la, Math.min(la, along));
    const pm = Math.hypot(px, pz);
    // (grip: the full sideways push at walking pace, `turn` at top speed)
    const lp = (f.turn + ((f.turnLo ?? f.turn) - f.turn) * Math.max(0, 1 - v / vm)) * h;
    if (pm > lp) {
      px *= lp / pm;
      pz *= lp / pm;
    }
    ax = along * ux + px;
    az = along * uz + pz;
    // (one grip for both: pushing on and turning at once share it)
    const am = Math.hypot(ax, az);
    const lt = Math.max(la, lp);
    if (am > lt) {
      ax *= lt / am;
      az *= lt / am;
    }
  }
  p.vx += ax;
  p.vz += az;
}
/** how close the feet must be to the planned spot to make the contact */
const REACH_TOL = 0.5;
/** manual players: how far from the ideal spot they can still reach with a lunge */
export const LUNGE = 1.0;
/**
 * The suggested spot (the circle) is planned for a person, not for a thumb that reacts at once
 * (docs/concepto.md, «Control y simulación 0.7»):
 *  · a spot that leaves no time to see the ball and push the stick (`see` s from the other side's contact) costs
 *    more (`tight` per second short of getting there, within 0.3 m): of two contacts he picks the one a person can
 *    make (the other hand, letting it bounce, a later moment) over the nicer one only a reflex makes;
 *  · once a circle has shown for this ball, it stays (or moves to another contact) while he can still get within
 *    `stretch` m of it (he hits from up to LUNGE away, at a stretch), instead of going away under his feet. The first
 *    circle still asks for getting there (within 0.3 m), so a ball only a reflex makes shows none (a winner).
 */
export const SUGGEST = { see: 0.35, tight: 4, stretch: 0.85 };
/**
 * Manual players, the reach of a reflex: a ball met right after the other side's contact (a smash, a speed-up at the
 * net) is only blocked close to the body (`min` × LUNGE up to `from` s after it); the full lunge takes a person's
 * moment (`full` s). The CPU cannot plan a contact before its reaction at all, and its lunge takes a moment too
 * (CPU_LUNGE). docs/concepto.md, «Control y simulación 0.7».
 */
export const REFLEX = { from: 0.12, full: 0.36, min: 0.5 };
/**
 * Doubles, the poach: when the ball sits up (a volley above the tape) for one CPU player, a CPU partner up at the net
 * who can volley it too takes it, to put it away, with chance `chance` × how far above the tape it is (0 at the tape,
 * full half a metre over it). Never a ball of the human's, nor his partner's: his circle is his (docs/concepto.md,
 * «Control y simulación 0.7»).
 */
export const POACH = { chance: 0.5 };
/**
 * CPU players, a lunge takes a moment too: the reach past the planned spot (Mover.lunge) is there in full only `time`
 * s after they set off (their reaction); a ball on them sooner is reached with `min` of it at once. 0: the lunge is
 * instant (docs/concepto.md, «Control y simulación 0.7»).
 */
export const CPU_LUNGE = { time: 0.25, min: 0 };
/**
 * CPU players choose among the contacts they can make (planContact): one with less than `want` s to spare costs `cost`
 * per second short. Padel has more choice than pickleball (volley it, let it bounce, let it come off the glass), and
 * without this they went for the earliest volley at full stretch and missed one in eleven balls.
 */
export const PLAN_SPARE = { want: 0.2, cost: 4 };
function lungeAt(lunge: number, dt: number): number {
  if (CPU_LUNGE.time <= 0) return lunge;
  return lunge * Math.max(0, Math.min(1, CPU_LUNGE.min + ((1 - CPU_LUNGE.min) * dt) / CPU_LUNGE.time));
}
/** the playing area inside the walls: nobody runs through the glass */
export const AREA_X = W / 2 - 0.3;
export const AREA_Z = HL - 0.3;
/** a ball closer than this to a wall cannot be swung at (the paddle would hit the glass) */
const WALL_GAP = { side: 0.3, back: 0.38 };
/** pause after a point before the next serve */
const DEAD_TIME = 1.6;
/** the human can cut the pause short with a tap (Match.hurry), but not below this: the banner says why the point ended */
const MIN_DEAD = 0.6;
/**
 * Manual players, the assist's lock on the suggested spot (by help level 0 · 1 · 2): it locks on when the stick points
 * within LOCK_ON of the way to the spot (cosine), and lets go when the thumb turns past LOCK_OFF (on the way) or past
 * PARK_OFF of the way he came (parked on the spot: a thumb held still drifts much less than that), or past FRESH_OFF
 * with a fresh push (from a stick at rest).
 */
const cosd = (deg: number) => Math.cos((deg * Math.PI) / 180);
const LOCK_ON = [cosd(26), cosd(40), cosd(60)];
const LOCK_OFF = [cosd(50), cosd(65), cosd(80)];
const PARK_OFF = cosd(60);
const FRESH_OFF = cosd(35);
/**
 * The assist with the thumb off the stick (help 1 · 2): it takes the player to the circle when it is within `idle`
 * m, but not before `see` s after the other side's contact: it reacts like a person, the player does not set off at
 * the very moment the other side hits (docs/concepto.md, «Control y simulación 0.7»).
 */
export const ASSIST = { see: 0.18, idle: [0, 1.2, 2.4] };
/**
 * The serve's wind-up: from the moment the server lets go (the controller returns the serve) to the contact. It is
 * the contact frame of the serve clip (assets/anims/serve.json, measured in render/chars.ts), so the view can play
 * the backswing and drop the ball from the free hand in time.
 */
export const SERVE_WINDUP = 0.87;
/** height of the serve contact (m): underhand, below the waist, where the serve clip's paddle can get to */
export const SERVE_HEIGHT = 0.7;
/** the pause after a serve fault before the second serve */
const FAULT_TIME = 1.0;

interface Rally {
  shots: number;
  last: Player | null;
  /** floor bounces since the last hit */
  bounces: number;
  seg: Seg;
  /** next crossing of the net's plane (null: none on this stretch) */
  tNet: number | null;
  netDone: boolean;
  tGround: number;
  /** next wall on this stretch */
  wall: WallHit | null;
  /** the ball has crossed the net since the last hit */
  crossed: boolean;
  /** walls met since the last hit */
  walls: number;
  /** the serve clipped the net (a let if it then bounces in the box) */
  tape: boolean;
  /** the serve must land in this half of the receiver's service courts (sign of x) */
  serveHalf: 1 | -1;
}

/** One stretch of the ball's coming path (Match.path): from t0 to t1, after `floor` floor bounces since the hit. */
interface Leg {
  s: Seg;
  t0: number;
  t1: number;
  floor: number;
}

export class Match {
  t = 0;
  readonly players: Player[] = [];
  readonly controllers: Controller[] = [];
  readonly rng: Rng;
  /** games won in the set */
  games: [number, number] = [0, 0];
  /** points in the current game (raw counts: 0, 1, 2, 3 = 0, 15, 30, 40; in a tie-break, the tie-break points) */
  points: [number, number] = [0, 0];
  /** the current game is the tie-break */
  tiebreak = false;
  serverTeam: 0 | 1 = 0;
  phase: 'serve' | 'rally' | 'dead' | 'over' = 'serve';
  rally: Rally | null = null;
  /** the ball after the point is over (rolling away, dropping off the net), for the view */
  deadSeg: Seg | null = null;
  private deadUntil = 0;
  private servePending = true;
  /** the serve on its way: the server is winding up and the paddle meets the ball at `at` (x, y, z) */
  windup: { pid: number; at: number; x: number; y: number; z: number; spec: ShotSpec } | null = null;
  winner: 0 | 1 | null = null;
  events: MatchEvent[] = [];
  readonly stats = {
    rallies: 0,
    longest: 0,
    perfect: [0, 0],
    winners: [0, 0],
    errors: [0, 0],
    shots: [0, 0],
    /** per player (your own count, not the team's) */
    perfectBy: [] as number[],
    errorsBy: [] as number[],
  };
  /** always true in padel (kept for the code that reads it) */
  readonly doubles = true;
  /** who serves now */
  serverId = -1;
  /** first or second serve */
  serveNum: 1 | 2 = 1;
  /** who returns this serve (the player in the box the serve goes to) */
  receiverId = -1;
  /** who of the receiving team takes the coming ball (−1: nobody, it is going out) */
  owner = -1;
  /** the coming ball was already passed on once (to the partner of a player who could not make it) */
  private passed = -1;
  /** the order of the servers round the four (set at the toss): game g is served by order[g % 4] */
  private order: number[] = [];
  /** games played in the set (whose turn it is to serve) */
  private played = 0;
  /** the next serve is a second serve after a fault (or a let: the same serve again) */
  private reserve: 'fault' | 'let' | null = null;
  /** scratch */
  private acc = 0;
  private pv: Vec3 = { x: 0, y: 0, z: 0 };
  private pv2: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(
    cfgs: PlayerCfg[],
    readonly rules: Rules,
    seed: number,
  ) {
    if (cfgs.length !== 4) throw new Error('padel is played two a side');
    this.rng = new Rng(seed);
    cfgs.forEach((c, i) => {
      const side: Side = c.team === 0 ? 1 : -1;
      this.players.push({
        id: i,
        team: c.team,
        side,
        human: c.human,
        x: 0,
        z: side * DEPTH_Z[0],
        vx: 0,
        vz: 0,
        speed: c.speed,
        reaction: c.reaction,
        plan: null,
        moveFrom: 0,
        homeX: 0,
        homeZ: side * DEPTH_Z[0],
        depth: 0,
        lastHit: null,
        look: c.look,
        lane: 1,
      });
      this.stats.perfectBy.push(0);
      this.stats.errorsBy.push(0);
    });
  }

  setControllers(cs: Controller[]) {
    this.controllers.length = 0;
    this.controllers.push(...cs);
  }

  team(t: 0 | 1): Player[] {
    return this.players.filter((p) => p.team === t);
  }
  server(): Player {
    return this.players[this.serverId] ?? this.team(this.serverTeam)[0];
  }
  /** the partner of `p` */
  mate(p: Player): Player {
    return this.players.find((q) => q.team === p.team && q !== p) ?? p;
  }
  /**
   * Who plays the right side («drive») of `team` (right from the team's own view): the team's first player, for the
   * whole set; the other one plays the left («revés»).
   */
  rightOf(team: 0 | 1): Player {
    return this.team(team)[0];
  }
  /** sign of x of the half `p` plays in (his side for the set, see rightOf) */
  courtX(p: Player): 1 | -1 {
    return (this.rightOf(p.team) === p ? p.side : -p.side) as 1 | -1;
  }
  /** points played in the current game (or tie-break): even, the serve goes from the right */
  private pointsPlayed(): number {
    return this.points[0] + this.points[1];
  }

  /** The score of a team in the current game as it is called: 0, 15, 30, 40, AD (tie-break: the number). */
  pointText(team: 0 | 1): string {
    const a = this.points[team];
    if (this.tiebreak) return String(a);
    const b = this.points[team === 0 ? 1 : 0];
    if (a >= 3 && b >= 3) return a > b ? 'AD' : '40';
    return ['0', '15', '30', '40'][Math.min(3, a)];
  }
  /** 40-40 with the golden point on: the next point wins the game */
  goldenPoint(): boolean {
    return !this.tiebreak && this.rules.golden && this.points[0] === 3 && this.points[1] === 3;
  }
  /** 40-40 (or back to it) with advantages: «iguales» */
  deuce(): boolean {
    return !this.tiebreak && !this.rules.golden && this.points[0] >= 3 && this.points[0] === this.points[1];
  }
  /** The score of the game as it is called before a serve: serving team first ("15-30", "40-AD"; tie-break "3-2"). */
  call(): string {
    const st = this.serverTeam;
    return `${this.pointText(st)}-${this.pointText(st === 0 ? 1 : 0)}`;
  }
  /** the ball now (live, or dead and rolling away), or null when someone is holding it to serve */
  ballPos(out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 | null {
    if (this.phase === 'rally' && this.rally) return posAt(this.rally.seg, this.t, out);
    if ((this.phase === 'dead' || this.phase === 'over') && this.deadSeg) return posAt(this.deadSeg, this.t, out);
    return null;
  }
  /** −1 … 1: the spin of the ball in flight (for drawing it) */
  ballSpin(): number {
    if (this.phase === 'rally' && this.rally) return this.rally.seg.spin;
    return this.deadSeg?.spin ?? 0;
  }
  ballVel(out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 | null {
    if (this.phase === 'rally' && this.rally) return velAt(this.rally.seg, this.t, out);
    if (this.deadSeg) return velAt(this.deadSeg, this.t, out);
    return null;
  }

  /**
   * The half of the court (sign of x) the serve goes from, for the serving team: the server's right on even points of
   * the game, his left on odd ones. For the receiving team: the box it goes to (the same court, diagonally).
   */
  serveX(team: 0 | 1): 1 | -1 {
    const side: Side = team === 0 ? 1 : -1;
    const right = this.pointsPlayed() % 2 === 0;
    return (side * (right ? 1 : -1)) as 1 | -1;
  }

  /** Puts everybody in place for the next serve. */
  setupServe() {
    const st = this.serverTeam;
    const srv = this.server();
    const sx = this.serveX(st);
    // the receiver: the opponent who plays the box the serve goes to (right court to right court)
    const rcv = this.team(st === 0 ? 1 : 0).find((q) => this.courtX(q) === this.serveX(q.team))!;
    this.receiverId = rcv.id;
    this.owner = -1;
    this.passed = -1;
    for (const p of this.players) {
      p.plan = null;
      p.vx = p.vz = 0;
      p.lastHit = null;
      if (p === srv) {
        // behind the service line, a step off the centre line
        p.x = sx * 1.3;
        p.z = p.side * (SERVICE + 1.0);
        p.depth = 1;
        p.lane = sx;
      } else if (p.team === st) {
        // the server's partner waits at the net, in the other half
        p.x = -sx * 2.4;
        p.z = p.side * DEPTH_Z[2];
        p.depth = 2;
        p.lane = -sx as 1 | -1;
      } else {
        const c = this.courtX(p);
        p.lane = c;
        if (p === rcv) {
          // the receiver, a good step in front of the back glass
          p.x = c * 2.7;
          p.z = p.side * (HL - 1.4);
          p.depth = 0;
        } else {
          // the receiver's partner, around the service line in the other half
          p.x = c * 2.5;
          p.z = p.side * (SERVICE + 0.3);
          p.depth = 1;
        }
      }
      p.homeX = p.x;
      p.homeZ = p.z;
    }
    this.rally = null;
    this.deadSeg = null;
    this.targets.length = 0;
    this.locks.length = 0;
    this.phase = 'serve';
    this.servePending = true;
    this.windup = null;
    this.events.push({ type: 'serveSetup', server: srv.id });
  }

  start() {
    this.serverTeam = this.rng.chance(0.5) ? 0 : 1;
    // the order round the four: the first server, then the other team, then the partners
    const a = this.team(this.serverTeam);
    const b = this.team(this.serverTeam === 0 ? 1 : 0);
    this.order = [a[0].id, b[0].id, a[1].id, b[1].id];
    this.played = 0;
    this.serverId = this.order[0];
    this.serveNum = 1;
    this.setupServe();
  }

  update(dt: number) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
    }
  }

  /** Fraction of a step not simulated yet (for smooth rendering between steps). */
  get alpha(): number {
    return this.acc / STEP;
  }

  step(h: number) {
    const t1 = this.t + h;
    if (this.phase === 'serve') {
      const s = this.server();
      if (this.servePending) {
        const spec = this.controllers[s.id].serve(this, s);
        if (spec) {
          // the shot (and the human's timing) is decided now; the ball leaves the paddle after the wind-up
          this.servePending = false;
          this.windup = { pid: s.id, at: this.t + SERVE_WINDUP, x: s.x - s.side * 0.15, y: SERVE_HEIGHT, z: s.z - s.side * 0.35, spec };
          this.events.push({ type: 'serveStart', pid: s.id, at: this.windup.at });
        }
      }
      const w = this.windup;
      if (w && t1 >= w.at - 1e-9) {
        this.windup = null;
        this.t = w.at;
        this.launch(this.players[w.pid], { x: w.x, y: w.y, z: w.z }, w.spec, false);
      }
    }
    this.movePlayers(h);
    if (this.phase === 'rally') {
      this.reread();
      this.planManual();
      this.rallyEvents(t1);
    }
    else if (this.phase === 'dead') {
      if (this.deadSeg) this.deadBounces(t1);
      if (t1 >= this.deadUntil) {
        this.t = t1;
        this.setupServe();
        return;
      }
    } else if (this.phase === 'over' && this.deadSeg) this.deadBounces(t1);
    this.t = t1;
  }

  // ------------------------------------------------------------------ the rally
  /** A new stretch of flight for the rally: when it meets the net's plane, the floor and the walls. */
  private setSeg(r: Rally, s: Seg) {
    r.seg = s;
    r.tGround = groundTime(s);
    r.wall = wallTime(s);
    r.tNet = netTime(s);
    r.netDone = r.tNet === null;
  }

  private rallyEvents(t1: number) {
    for (let guard = 0; guard < 12 && this.phase === 'rally'; guard++) {
      const r = this.rally!;
      let te = Infinity;
      let kind: 'net' | 'ground' | 'wall' | 'hit' | null = null;
      let hitter: Player | null = null;
      if (!r.netDone && r.tNet !== null && r.tNet < te) {
        te = r.tNet;
        kind = 'net';
      }
      if (r.tGround < te) {
        te = r.tGround;
        kind = 'ground';
      }
      if (r.wall && r.wall.t < te) {
        te = r.wall.t;
        kind = 'wall';
      }
      for (const p of this.players) {
        if (p.plan && p.plan.t < te) {
          te = p.plan.t;
          kind = 'hit';
          hitter = p;
        }
      }
      if (te > t1 || kind === null) return;
      if (kind === 'net') this.onNet(te);
      else if (kind === 'ground') this.onGround(te);
      else if (kind === 'wall') this.onWall(te);
      else this.onContact(hitter!, te);
    }
  }

  /** the other team */
  private other(team: 0 | 1): 0 | 1 {
    return team === 0 ? 1 : 0;
  }

  private onNet(t: number) {
    const r = this.rally!;
    r.netDone = true;
    const p = posAt(r.seg, t, this.pv);
    const hitter = r.last!;
    if (r.crossed) {
      // after bouncing in it goes back over the net to the hitter's side («por 4»): the hitter's point
      if (r.bounces > 0) {
        this.deadSeg = r.seg;
        this.endPoint(hitter.team, 'back', null, t);
      }
      return;
    }
    const top = netHeight(p.x) + R;
    if (p.y >= top + 0.004) {
      r.crossed = true;
      return; // clean over
    }
    const v = velAt(r.seg, t);
    const side = hitter.side;
    // how squarely it meets the tape: 1 = brushes it, 0 = hits it full on
    const c = (p.y - (top - 1.3 * R)) / (1.3 * R + 0.004);
    if (c > 0.3) {
      // clips the tape: loses most of its pace, pops up and trickles over (live, as in the real game; on the serve, a
      // let if it then bounces in the box)
      const keep = 0.25 + 0.55 * c;
      const nv = { x: v.x * keep * 0.8, y: Math.abs(v.y) * 0.15 + 0.5 + 1.5 * (1 - c), z: v.z * keep };
      this.setSeg(r, seg(t, { x: p.x, y: top + 0.005, z: -side * 0.03 }, nv, 0.1));
      r.crossed = true;
      if (r.shots === 1) r.tape = true;
      this.events.push({ type: 'net', x: p.x, y: p.y, z: 0, tape: true });
      // a new flight: the suggested spots (and the assist locked on them) start over
      this.targets.length = 0;
      this.locks.length = 0;
      this.planReceivers();
      return;
    }
    // into the net: it dies there and drops on the hitter's side
    this.events.push({ type: 'net', x: p.x, y: p.y, z: 0, tape: false });
    this.deadSeg = seg(t, { x: p.x, y: Math.max(R, p.y), z: side * 0.06 }, { x: v.x * 0.15, y: 0.2, z: side * Math.abs(v.z) * 0.08 });
    if (r.shots === 1) this.serveFault('serveNet', t);
    else this.endPoint(this.other(hitter.team), 'net', hitter.id, t);
  }

  private onGround(t: number) {
    const r = this.rally!;
    const p = posAt(r.seg, t, this.pv);
    const hitter = r.last!;
    const recvSide = -hitter.side as Side;
    if (!r.crossed) {
      // it bounced on the hitter's own side (a mishit that never got over)
      this.events.push({ type: 'bounce', x: p.x, z: p.z, good: false, first: true, close: false });
      this.deadSeg = bounce(r.seg, t);
      if (r.shots === 1) this.serveFault('serveNet', t);
      else this.endPoint(this.other(hitter.team), 'net', hitter.id, t);
      return;
    }
    if (r.bounces === 0) {
      let good = true;
      let close = false;
      if (r.shots === 1) {
        good = inServiceCourt(p.x, p.z, recvSide, r.serveHalf);
        const ob = serveOutBy(p.x, p.z, recvSide, r.serveHalf);
        close = good ? Math.abs(p.z * recvSide - SERVICE) < 0.12 || Math.abs(p.x) < 0.1 : ob < 0.12;
      } else good = inHalf(p.x, p.z, recvSide);
      this.events.push({ type: 'bounce', x: p.x, z: p.z, good, first: true, close });
      this.setSeg(r, bounce(r.seg, t));
      if (!good) {
        this.deadSeg = r.seg;
        if (r.shots === 1) this.serveFault('serveOut', t);
        else this.endPoint(this.other(hitter.team), 'out', hitter.id, t);
        return;
      }
      if (r.shots === 1 && r.tape) {
        // the serve clipped the net and bounced in: a let, the same serve again
        this.deadSeg = r.seg;
        this.let(t);
        return;
      }
      r.bounces = 1;
      return;
    }
    // second bounce: nobody got to it
    this.events.push({ type: 'bounce', x: p.x, z: p.z, good: true, first: false, close: false });
    this.deadSeg = bounce(r.seg, t);
    this.endPoint(hitter.team, this.whyUnplayed(hitter), null, t);
  }

  /** why a ball in was not returned: a clean winner, one someone went for and did not reach, or one let go */
  private whyUnplayed(hitter: Player): PointReason {
    const recv = this.players.filter((q) => q.team !== hitter.team);
    return recv.some((q) => this.letGo[q.id]) ? 'letGo' : recv.some((q) => this.chased[q.id] || (q.plan && !q.plan.reach)) ? 'miss' : 'winner';
  }

  /** What the ball meets at a wall hit (glass, mesh, or nothing: over the top). */
  surfaceOf(s: Seg, hit: WallHit): Surface {
    const p = posAt(s, hit.t, this.pv2);
    return hit.axis === 'x' ? sideSurface(Math.abs(p.z), p.y) : backSurface(p.y);
  }

  private onWall(t: number) {
    const r = this.rally!;
    const hit = r.wall!;
    const hitter = r.last!;
    const recvSide = -hitter.side as Side;
    const p = posAt(r.seg, t);
    const v = velAt(r.seg, t);
    const surface = this.surfaceOf(r.seg, hit);
    // the half of the court the wall is in
    const wz = hit.axis === 'z' ? hit.sign * HL : p.z;
    const theirs = wz * recvSide > 0;
    if (surface === 'open') {
      // over the top: out of the court. After bouncing in, the hitter's («por 3»); before, his fault
      r.wall = null;
      r.tGround = Infinity;
      r.tNet = null;
      r.netDone = true;
      this.deadSeg = r.seg;
      if (r.crossed && r.bounces > 0) this.endPoint(hitter.team, 'exit', null, t);
      else if (r.shots === 1) this.serveFault('serveOut', t);
      else this.endPoint(this.other(hitter.team), 'out', hitter.id, t);
      return;
    }
    this.events.push({ type: 'wall', x: p.x, y: p.y, z: p.z, surface, speed: Math.hypot(v.x, v.y, v.z) });
    if (theirs && r.bounces === 0) {
      // straight into their wall without bouncing first: the hitter's fault
      this.setSeg(r, wallBounce(r.seg, hit, surface));
      this.deadSeg = r.seg;
      if (r.shots === 1) this.serveFault('serveOut', t);
      else this.endPoint(this.other(hitter.team), 'wall', hitter.id, t);
      return;
    }
    if (theirs && r.shots === 1 && surface === 'mesh') {
      // the serve, after bouncing in, into the mesh: a fault
      this.setSeg(r, wallBounce(r.seg, hit, surface));
      this.deadSeg = r.seg;
      this.serveFault('serveFence', t);
      return;
    }
    // off the glass (or the mesh): still live. The plans already counted on it (Match.path follows the walls, and
    // the mesh is deterministic), so nobody has to read the ball again.
    this.setSeg(r, wallBounce(r.seg, hit, surface));
    r.walls++;
  }

  /** A serve fault: a second serve after the first, the point after the second. */
  private serveFault(fault: ServeFault, t: number) {
    const srv = this.server();
    if (this.serveNum === 1) {
      this.events.push({ type: 'fault', pid: srv.id, fault, second: true });
      this.serveNum = 2;
      this.pause(t, 'fault');
      return;
    }
    this.events.push({ type: 'fault', pid: srv.id, fault, second: false });
    this.endPoint(this.other(srv.team), 'doubleFault', srv.id, t);
  }

  /** A let: the same serve again. */
  private let(t: number) {
    this.events.push({ type: 'let', pid: this.server().id });
    this.pause(t, 'let');
  }

  /** The ball is dead without a point (a fault on the first serve, a let): a short pause and the serve again. */
  private pause(t: number, why: 'fault' | 'let') {
    this.t = t;
    for (const p of this.players) p.plan = null;
    this.targets.length = 0;
    this.locks.length = 0;
    this.reserve = why;
    this.phase = 'dead';
    this.pointAt = t;
    this.deadUntil = t + FAULT_TIME;
  }

  private onContact(p: Player, t: number) {
    const r = this.rally!;
    const plan = p.plan!;
    p.plan = null;
    const ctl = this.controllers[p.id];
    const manual = !!ctl.steer;
    const gap = Math.hypot(p.x - plan.fx, p.z - plan.fz);
    const lunge = ctl.mover.lunge ?? 0;
    if (gap > (manual ? LUNGE + 0.05 : Math.max(REACH_TOL, 0.3 + lungeAt(lunge, t - p.moveFrom)))) {
      // did not get there: the ball goes past (the partner may still get to it)
      if (!manual) this.passOn(p, true);
      return;
    }
    if (!manual) plan.stretch = lunge > 0 ? Math.max(0, gap - 0.3) / lunge : 0;
    // a plan worked out on a flight that has changed since (the tape, a wall): the ball is not where the paddle is
    const bp = posAt(r.seg, t);
    if (Math.hypot(bp.x - plan.bx, bp.y - plan.by, bp.z - plan.bz) > 0.3) return;
    if (manual && ctl.swing && !ctl.swing(this, p, plan)) {
      // no swing: this chance goes by (another may come after the bounce or off the glass)
      this.declined = t;
      return;
    }
    const volley = r.bounces === 0;
    // the return of serve must bounce
    if (volley && r.shots === 1) {
      this.deadSeg = r.seg;
      this.endPoint(this.other(p.team), 'twoBounce', p.id, t);
      return;
    }
    const spec = this.controllers[p.id].hit(this, p, plan);
    p.lastHit = { t, kind: spec.kind, hand: plan.hand, overhead: plan.overhead, timing: spec.timing };
    this.t = t;
    this.launch(p, bp, spec, volley, plan.stretch ?? 0);
  }

  /** The ball leaves the paddle of `p` from `from` (`stretch`: how far he reached for it, for the hit event). */
  private launch(p: Player, from: Vec3, spec: ShotSpec, volley: boolean, stretch = 0) {
    const t = this.t;
    const recvSide = -p.side as Side;
    // (for the hit event: how long the other side's ball took to get here, and how fast it came)
    const prevT = this.rally?.last && this.rally.last.team !== p.team ? this.rally.last.lastHit?.t : undefined;
    const vinV = this.rally ? velAt(this.rally.seg, t) : null;
    // Errors you can read: early or late sends it across or wide, a poor contact pops a soft shot up or sends a
    // hard one long, and only a hard swing at a low ball (or a really poor one) finds the net. Rally pressure (pop)
    // makes a shot sit up: high and long, a ball the other side can attack, not one that dies in the net.
    const q = Math.max(0, Math.min(1, spec.q));
    const bad = 1 - q;
    const soft = SOFT.has(spec.kind);
    const popped = (spec.pop ?? 0) > 0 && this.rng.chance(Math.min(0.85, (spec.pop ?? 0) * 1.6));
    let pace = spec.pace ?? 1;
    const hand = p.lastHit?.hand ?? 1;
    // the hitter's right is +x on the near side: a late forehand goes right, a late backhand left
    let tx = spec.tx + p.side * hand * (spec.late ?? 0) * (soft ? 0.8 : 1.5);
    let tz = spec.tz;
    const spread = 0.06 + bad * 0.75;
    const a = this.rng.next() * Math.PI * 2;
    const rr = spread * Math.sqrt(this.rng.next());
    tx += Math.cos(a) * rr;
    tz += Math.sin(a) * rr * 1.1;
    const u = this.rng.next();
    let clear = spec.clear;
    if (soft) {
      // a poor soft shot mostly floats up and carries long (a ball the other side can volley and attack); only a
      // really poor one, or one scooped off the floor, dies in the tape. A poor block of a hard ball sends its pace
      // back: it flies up and long.
      const vin = this.rally ? velAt(this.rally.seg, t, this.pv2) : null;
      // (the human's block, a tap, is a plain block: it takes more of the pace off)
      const rebound = vin ? (Math.max(0, Math.hypot(vin.x, vin.z) - 10) / 10) * (spec.timing === 'auto' || spec.intent === 'block' ? 0.5 : 1) : 0;
      if (!popped && this.rng.chance(bad * bad * 0.3 + (from.y < 0.3 ? bad * 0.25 : 0) + bad * rebound * 0.5)) clear -= 0.2 + u * 0.1;
      else {
        clear += bad * (0.05 + u * 1.3) * (1 + rebound * 0.6) + (popped ? 0.35 + u * 0.45 : 0);
        tz += recvSide * (bad * (0.2 + u) * 2.4 * (1 + rebound * 2) + (popped ? 0.9 + u * 0.9 : 0));
      }
    } else if (spec.kind === 'lob') {
      clear -= bad * u * 1.6; // short and low: a smash waiting to happen
      tz -= recvSide * (bad * u * 2.4 + (popped ? 0.6 + u : 0));
      // how far a lob carries is hard to judge: a deep one can sail out
      tz += recvSide * this.rng.gauss() * (0.32 + bad * 0.7);
    } else {
      // a hard swing gone wrong: off a low ball it mostly sails (long: on a 10 m half a deep one carries into the back
      // glass on the fly, LONG), off a high one it may be hit down into the net
      const low = from.y < 0.6;
      // a drive hit up from below the tape close to the net: gone wrong, it sits up for the volleyer
      const up = spec.kind === 'drive' && from.y < NET_C && Math.abs(from.z) < AT_NET;
      if (this.rng.chance(low ? 0.72 : 0.62)) {
        clear += bad * u * 0.5 + (up ? bad * (0.2 + u * 0.8) : 0);
        tz += recvSide * bad * (0.3 + u) * LONG;
      } else clear -= bad * (low ? 0.12 + u * 0.4 : 0.06 + u * 0.3);
      // under pressure a drive is pushed rather than hit: higher and slower (an attack off a high ball is not)
      if (popped && spec.kind === 'drive') {
        clear += 0.3 + u * 0.4;
        pace *= 1.3;
      }
    }
    // off the frame (ShotSpec.shank): a soft shot dies in the net; a swing goes into it, or flies straight into the
    // glass (the back glass, or the side glass when it was pulled across): the padel error
    const shanked = !!spec.shank && this.rng.chance(spec.shank);
    if (shanked) {
      if (soft || this.rng.chance(0.45)) clear = Math.min(clear, 0) - 0.15 - u * 0.25;
      else if (this.rng.chance(0.65)) {
        clear += 0.3 + u * 0.6;
        tz = recvSide * (HL + 0.4 + u * 1.6);
      } else {
        clear += 0.2 + u * 0.4;
        tx = (Math.sign(tx - from.x) || 1) * (W / 2 + 0.5 + u);
        tz = recvSide * Math.min(HL - 1, Math.max(3, Math.abs(tz) * 0.7));
      }
    }
    // a target behind the net-side of the receiver's half still lands on their side
    if (tz * recvSide < 0.25) tz = recvSide * 0.25;
    const d = Math.hypot(tx - from.x, tz - from.z);
    const minT = minFlight(d) * pace;
    // a clean hard contact carries more topspin
    const spin = SPIN[spec.kind] * (SPIN[spec.kind] > 0 ? 0.75 + 0.25 * q : 1);
    const shot = shotByClearance(from, tx, tz, clear, minT, spin);
    const s = seg(t, from, shot.v, spin, shot.k, shot.g);
    const isServe = p.lastHit === null && this.rally === null;
    const serveHalf = (-this.serveX(p.team)) as 1 | -1;
    const r: Rally = this.rally ?? { shots: 0, last: null, bounces: 0, seg: s, tNet: null, netDone: false, tGround: 0, wall: null, crossed: false, walls: 0, tape: false, serveHalf };
    this.declined = -1;
    this.chased.length = 0;
    this.letGo.length = 0;
    this.locks.length = 0;
    this.pathCache = null;
    r.shots++;
    r.last = p;
    r.bounces = 0;
    r.walls = 0;
    r.tape = false;
    this.setSeg(r, s);
    // hit from the far side of the net's plane (a ball played back from over the net is not possible here, but a
    // contact right on it is): it has crossed when it starts on the other side
    r.crossed = from.z * p.side < 0;
    this.rally = r;
    if (isServe) {
      p.lastHit = { t, kind: 'serve', hand: 1, overhead: false, timing: spec.timing };
      this.phase = 'rally';
    }
    this.stats.shots[p.team]++;
    if (spec.timing === 'perfect') {
      this.stats.perfect[p.team]++;
      this.stats.perfectBy[p.id]++;
    }
    const sp = Math.hypot(shot.v.x, shot.v.y, shot.v.z);
    // (for explaining the point: how high it crosses the net, what was aimed, what got to it)
    const tn = netTime(s);
    const pn = tn !== null ? posAt(s, tn) : null;
    const why = {
      ...(pn ? { clear: pn.y - R - netHeight(pn.x) } : {}),
      tx: spec.tx,
      tz: spec.tz,
      ...(popped ? { pop: true } : {}),
      stretch,
      ...(prevT !== undefined ? { avail: t - prevT } : {}),
      ...(vinV ? { vin: Math.hypot(vinV.x, vinV.z) } : {}),
    };
    this.events.push({ type: 'hit', pid: p.id, kind: spec.kind, timing: spec.timing, q, x: from.x, y: from.y, z: from.z, speed: sp, shot: r.shots, volley, ...(shanked ? { shank: true } : {}), ...(spec.intent ? { intent: spec.intent } : {}), ...why });
    // where the hitter goes now
    this.afterHit(p, spec);
    // the other side reads the ball
    this.planReceivers();
  }

  /**
   * Where the hitter's team goes after his shot (padel habits; the two move as one, both up or both back):
   *  · the server comes in to the net behind his serve (his partner is there already); the returner stays back;
   *  · a good globo over a pair at the net, or a chiquita at their feet, is the moment to take the net;
   *  · up at the net they stay up after a volley or an overhead (a bandeja is played to keep it);
   *  · a drive from around the service line is an approach; from the back, a drive keeps them back.
   * The receiving team's depth follows the ball coming at them (cover: a lob over them sends both back).
   */
  private afterHit(p: Player, spec: ShotSpec) {
    const r = this.rally!;
    const mv = this.controllers[p.id].mover;
    const rng = this.rng;
    const za = Math.abs(p.z);
    const atNet = za < AT_NET;
    const k = spec.kind;
    // the other pair is up at the net (or on its way there)
    const oppNet = this.team(this.other(p.team)).some((o) => Math.abs(o.z + o.vz * 0.4) < AT_NET + 0.4);
    if (r.shots === 1) p.depth = rng.chance(0.5 + 0.5 * mv.netRush) ? 2 : 1;
    // the return: back, unless a good low one lets the returner follow it in
    else if (r.shots === 2 && k !== 'lob') p.depth = spec.q > 0.75 && rng.chance(mv.netRush * 0.3) ? 2 : 0;
    // a good globo over a pair at the net is how the net is taken; a lob from the net (or a poor one) keeps them where
    // they are
    else if (k === 'lob') p.depth = atNet ? 2 : oppNet && spec.q > 0.6 && rng.chance(0.35 + 0.55 * mv.netRush) ? 2 : 0;
    // a chiquita (or a dejada) from the back: in behind it
    else if (k === 'dink' || k === 'drop') p.depth = atNet || rng.chance(0.35 + 0.6 * mv.netRush) ? 2 : 0;
    // overheads and volleys keep the net (a bandeja from deep is played to get back there)
    else if (k === 'smash' || k === 'bandeja' || k === 'vibora' || k === 'speedup') p.depth = atNet || za < SERVICE + 0.5 ? 2 : 0;
    else if (atNet) p.depth = 2;
    // a drive from around the service line is an approach; from the back it keeps them back
    else p.depth = za < SERVICE + 0.5 && rng.chance(0.3 + 0.6 * mv.netRush) ? 2 : 0;
    p.homeZ = p.side * DEPTH_Z[p.depth];
    p.homeX = Math.max(-2.6, Math.min(2.6, spec.tx * 0.3));
    // the partner moves with the hitter
    const q = this.mate(p);
    if (!this.controllers[q.id].steer) q.depth = p.depth;
    else q.homeZ = q.side * DEPTH_Z[p.depth]; // where the bot's thumbs go
    // whoever crossed into the partner's half (a lob, a poach) keeps it: they switch halves
    if ((p.x - q.x) * p.lane < -0.6) {
      p.lane = -p.lane as 1 | -1;
      q.lane = -q.lane as 1 | -1;
    }
  }

  /** After a hit, the team on the other side works out who takes the ball and where. */
  private planReceivers() {
    this.planDoubles();
  }

  /** CPU players: the real feet spot of a plan whose first read was off, put back at `at` */
  private reads: ({ plan: Plan; fx: number; fz: number; at: number } | null)[] = [];

  /**
   * The AI's first read of the ball it is going to play (Controller.read): the feet head for a spot a little off,
   * until the read is corrected as the ball comes (a late correction leaves it rushed or stretching).
   */
  private misread(p: Player) {
    const plan = p.plan;
    const ctl = this.controllers[p.id];
    this.reads[p.id] = null;
    if (!plan || !ctl.read || ctl.steer) return;
    const e = ctl.read(this, p, plan);
    if (!e) return;
    this.reads[p.id] = { plan, fx: plan.fx, fz: plan.fz, at: Math.min(e.at, plan.t - 0.05) };
    plan.fx += e.dx;
    plan.fz = p.side * Math.max(0.4, (plan.fz + e.dz) * p.side);
  }

  /** The AI sees where the ball really goes: back to the real spot. */
  private reread() {
    for (const p of this.players) {
      const rd = this.reads[p.id];
      if (!rd) continue;
      if (p.plan !== rd.plan) this.reads[p.id] = null;
      else if (this.t >= rd.at) {
        rd.plan.fx = rd.fx;
        rd.plan.fz = rd.fz;
        this.reads[p.id] = null;
      }
    }
  }

  /**
   * Doubles: the receiving team agrees who takes the coming ball, and only that player goes for it (nobody runs into
   * their partner, and a ball in is never left to the other one). The serve is the receiver's alone. A manual player
   * (the human) gets the suggested spot only when the ball is his; otherwise his partner plans it.
   */
  private planDoubles() {
    const r = this.rally!;
    const rt = (r.last!.team === 0 ? 1 : 0) as 0 | 1;
    for (const p of this.players) p.plan = null;
    this.owner = -1;
    this.passed = -1;
    let best: { p: Player; plan: Plan; cost: number } | null = null;
    const plans: (Plan | null)[] = [];
    for (const p of this.team(rt)) {
      if (r.shots === 1 && p.id !== this.receiverId) continue;
      const manual = !!this.controllers[p.id].steer;
      const res = this.planContact(p, false, manual);
      if (!res) continue;
      plans[p.id] = res.plan;
      const cost = res.cost + this.takeCost(p, res.plan, manual);
      if (!best || cost < best.cost) best = { p, plan: res.plan, cost };
    }
    if (!best) return; // going out: let it go
    // the poach (POACH): the partner up at the net steps across and volleys a ball that sits up (two CPU players)
    const q = this.mate(best.p);
    const qp = plans[q.id];
    if (POACH.chance > 0 && r.shots > 2 && !this.controllers[best.p.id].steer && !this.controllers[q.id].steer && qp?.reach && qp.volley && Math.abs(q.z) < AT_NET && qp.by > NET_C) {
      if (this.rng.chance(POACH.chance * Math.min(1, (qp.by - NET_C) / 0.5))) best = { p: q, plan: qp, cost: best.cost };
    }
    this.owner = best.p.id;
    if (!this.controllers[best.p.id].steer) {
      best.p.plan = best.plan;
      best.p.moveFrom = this.t + best.p.reaction;
      this.misread(best.p);
    }
  }

  /**
   * Doubles conventions on top of the cost of the contact itself: each covers their half (the line between the two
   * splits the court), a ball down the middle goes to the forehand, the one with time to spare takes it (a lob over the
   * partner at the net), and the human keeps his balls (his partner only takes what is clearly not his).
   */
  private takeCost(p: Player, plan: Plan, manual: boolean): number {
    const q = this.mate(p);
    const mid = (p.x + q.x) / 2;
    const into = (plan.bx - mid) * -p.lane; // > 0: in the partner's half
    let c = Math.max(0, into) * 0.9;
    if (plan.hand === -1) c += 0.15;
    const lg = manual ? 0 : this.controllers[p.id].mover.lunge ?? 0;
    const dist = Math.hypot(plan.fx - p.x, plan.fz - p.z);
    const run = manual ? Math.max(0, dist - 0.3) / p.speed : runTime(Math.max(0, dist - 0.3 - lg), p.speed);
    const spare = plan.t - this.t - (run + p.reaction);
    c += Math.max(0, 0.5 - spare) * 1.2;
    if (manual) c -= 0.25;
    return c;
  }

  /**
   * Doubles: `p` will not get to the ball after all (a manual player who can no longer make it, or a CPU player who
   * just missed it): the partner goes for it if they still can. Once per ball.
   */
  private passOn(p: Player, missed = false) {
    const r = this.rally!;
    if (this.passed === r.shots) return;
    this.passed = r.shots;
    if (r.shots === 1) return; // the serve is the receiver's alone
    const q = this.mate(p);
    if (q.plan) return;
    if (this.controllers[q.id].steer) {
      // a human partner: the suggested spot shows up for him (if he can still make it)
      this.owner = q.id;
      this.targets[q.id] = null;
      return;
    }
    const res = this.planContact(q);
    if (!res || !res.plan.reach) return;
    q.plan = res.plan;
    q.moveFrom = this.t + q.reaction * (missed ? 0.5 : 1);
    this.owner = q.id;
    this.misread(q);
  }

  /** time of the last chance a manual player let go (no new plan before it) */
  private declined = -1;

  /** manual players: the contact the game suggests (the spot on the floor, where the assist steers) */
  private targets: (Plan | null)[] = [];
  private targetAt: number[] = [];
  /** manual players: the direction the assist locked on in (null: free), see movePlayers */
  private locks: ({ x: number; z: number } | null)[] = [];
  /** manual players: how far the stick was pushed last step (a fresh push starts from a stick at rest) */
  private stickWas: number[] = [];
  /** manual players: since when the thumb is off the stick */
  private idleSince: number[] = [];
  /** when the last point ended */
  private pointAt = 0;
  /** this ball: the receiver had a spot to go to (a miss if it bounces twice) / let it go */
  private chased: boolean[] = [];
  /** CPU players waiting on their spot (they only move again when it is more than FEET.idle away) */
  private settled: boolean[] = [];
  private letGo: boolean[] = [];

  /** the path worked out for the rally's current stretch (Match.path) */
  private pathCache: { seg: Seg; legs: Leg[] } | null = null;

  /**
   * The coming path of the ball: the stretches of flight from now, through the floor and the walls, until the second
   * bounce on the floor since the hit or the ball leaving the court over a wall. A wall on the receiving side before the
   * first bounce ends it (a fault: nothing to play after it), and so does the mesh after the serve's bounce. The mesh
   * bounce is deterministic, so this is exactly where the ball will go (the net tape is not foreseen: the rally plans
   * again when the ball clips it).
   */
  path(): Leg[] {
    const r = this.rally!;
    if (this.pathCache && this.pathCache.seg === r.seg) return this.pathCache.legs;
    const legs: Leg[] = [];
    const recvSide = -r.last!.side;
    let s = r.seg;
    let floor = r.bounces;
    for (let i = 0; i < 12; i++) {
      const ev = nextEvent(s, s.t0 + 8);
      if (!ev) {
        legs.push({ s, t0: s.t0, t1: s.t0 + 8, floor });
        break;
      }
      legs.push({ s, t0: s.t0, t1: ev.t, floor });
      if (ev.kind === 'floor') {
        floor++;
        if (floor >= 2) break;
        s = bounce(s, ev.t);
        continue;
      }
      const surface = this.surfaceOf(s, ev.hit);
      if (surface === 'open') break;
      const p = posAt(s, ev.t, this.pv2);
      const wz = ev.hit.axis === 'z' ? ev.hit.sign * HL : p.z;
      const theirs = wz * recvSide > 0;
      if (theirs && floor === 0) break;
      if (theirs && r.shots === 1 && surface === 'mesh') break;
      s = wallBounce(s, ev.hit, surface);
    }
    this.pathCache = { seg: r.seg, legs };
    return legs;
  }

  /** Where the ball of the rally will be at time t (along its path, walls included). */
  private ballAt(t: number): Vec3 {
    const legs = this.path();
    for (const l of legs) if (t <= l.t1) return posAt(l.s, Math.max(l.t0, t));
    const l = legs[legs.length - 1];
    return posAt(l.s, l.t1);
  }

  /** Where the coming ball first bounces on the floor (or where it is now if it already has), for positioning. */
  firstBounce(out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
    const r = this.rally!;
    if (r.bounces > 0) return posAt(r.seg, this.t, out);
    const legs = this.path();
    const i = legs.findIndex((l) => l.floor >= 1);
    if (i < 0) return posAt(legs[0].s, legs[0].t1, out);
    return posAt(legs[i].s, legs[i].t0, out);
  }
  targetFor(pid: number): Plan | null {
    return this.targets[pid] ?? null;
  }
  /** For the HUD: the assist has the player parked on the suggested spot (the thumb can let go). */
  parked(pid: number): boolean {
    const tg = this.targets[pid];
    const p = this.players[pid];
    return !!tg && !!this.locks[pid] && Math.hypot(tg.fx - p.x, tg.fz - p.z) < 0.12;
  }
  /**
   * For the HUD (read only, cheap): how the circle of `pid` stands. `slack`: seconds to spare getting to it (within
   * 0.3 m) at top speed; below 0 only a stretch makes it now (the circle stays while one can, SUGGEST). `reach`: how
   * far from it he can still hit the ball at its moment (REFLEX: less right after the other side's contact; the view
   * should use it, not LUNGE, to call the circle "near"). null: no circle.
   */
  targetInfo(pid: number): { slack: number; reach: number } | null {
    const tg = this.targets[pid];
    const p = this.players[pid];
    if (!tg || !p) return null;
    const d = Math.max(0, Math.hypot(tg.fx - p.x, tg.fz - p.z) - 0.3);
    return { slack: tg.t - this.t - d / p.speed, reach: this.reachAt(tg.t) };
  }
  /**
   * The human taps during the pause after a point: the next serve is set up sooner (never before MIN_DEAD has gone by,
   * so the banner with the reason is read). Nothing changes for the rules or the bots.
   */
  hurry() {
    if (this.phase === 'dead') this.deadUntil = Math.min(this.deadUntil, Math.max(this.t, this.pointAt + MIN_DEAD));
  }
  /**
   * The human's screen shows a line saying why the point ended (src/explain.ts): the pause after it lasts at least
   * `sec` seconds so it can be read. A tap still cuts it short (hurry); the bots never call it.
   */
  linger(sec: number) {
    if (this.phase === 'dead') this.deadUntil = Math.max(this.deadUntil, this.pointAt + sec);
  }
  /**
   * For the HUD: a tap would bring the next serve forward right now (the pause after a point, MIN_DEAD gone by and
   * more than a moment of it left): the time to show «Toca para seguir».
   */
  canHurry(): boolean {
    return this.phase === 'dead' && this.t >= this.pointAt + MIN_DEAD && this.deadUntil - this.t > 0.2;
  }
  /** For the HUD: seconds since the last point ended (Infinity before the first one). */
  sincePoint(): number {
    return this.stats.rallies > 0 ? this.t - this.pointAt : Infinity;
  }

  /**
   * For the views (legs and feet): the moment of the footwork around a contact, or null when the feet just run.
   *  · 'split': the other side has just hit: a split step, landing balanced;
   *  · 'plant': the player's own contact is coming: braking into the shot, the feet planting;
   *  · 'follow': the player has just hit: finishing the swing before running off.
   */
  stance(pid: number): 'split' | 'plant' | 'follow' | null {
    return this.stanceOf(this.players[pid]);
  }
  /** how long the swing of `p`'s last shot takes to finish (a soft shot is a short one) */
  private followOf(p: Player, manual: boolean): number {
    const soft = !!p.lastHit && SOFT.has(p.lastHit.kind);
    const f = manual ? HUMAN_FEET : FEET;
    return soft ? f.followSoft : f.follow;
  }
  private stanceOf(p: Player): 'split' | 'plant' | 'follow' | null {
    if (this.phase !== 'rally' && this.phase !== 'dead') return null;
    const ctl = this.controllers[p.id];
    const manual = !!ctl?.steer;
    if (p.lastHit && this.t - p.lastHit.t < this.followOf(p, manual)) return 'follow';
    if (this.phase !== 'rally') return null;
    const pl = p.plan;
    if (pl) {
      const left = pl.t - this.t;
      if (manual ? left < (p.speed - HUMAN_FEET.plantV) / HUMAN_FEET.plantB && (!ctl.swing || ctl.swing(this, p, pl)) : this.t >= p.moveFrom && left < (p.speed - FEET.plantV) / FEET.plantB) return 'plant';
    }
    const r = this.rally;
    const opp = r?.last && r.last.team !== p.team ? r.last.lastHit : null;
    if (opp && this.t - opp.t < (manual ? HUMAN_FEET.split : 0.15)) return 'split';
    if (!manual && pl && this.t < p.moveFrom) return 'split';
    return null;
  }
  /** For the HUD (read only): how much of the pause after the point a tap would cut now (0: none, or not yet). */
  hurryable(): number {
    return this.phase === 'dead' && this.t >= this.pointAt + MIN_DEAD ? Math.max(0, this.deadUntil - this.t) : 0;
  }

  /** Can `p` still get to the feet spot of `pl` in time? */
  private canMake(p: Player, pl: Plan): boolean {
    const dist = Math.hypot(pl.fx - p.x, pl.fz - p.z);
    const reach = this.reachAt(pl.t);
    return dist <= reach || Math.max(0, dist - reach) / p.speed <= pl.t - this.t;
  }

  /**
   * Manual players: how far (m) from the ideal spot they can still reach a ball met at time `t` (REFLEX: right after
   * the other side's contact only close to the body, a full lunge a moment later).
   */
  reachAt(t: number): number {
    const lh = this.rally?.last?.lastHit;
    if (!lh) return LUNGE;
    const k = Math.max(0, Math.min(1, (t - lh.t - REFLEX.from) / Math.max(1e-3, REFLEX.full - REFLEX.from)));
    return LUNGE * (REFLEX.min + (1 - REFLEX.min) * k);
  }

  /**
   * Manual players, every step: the suggested contact (refreshed 20 times a second, kept while it is still on) and
   * the plan for the swing. Within a lunge of the suggested spot the contact is that one; anywhere else, the best
   * contact from where they stand.
   */
  private planManual() {
    const r = this.rally!;
    for (const p of this.players) {
      const ctl = this.controllers[p.id];
      if (!ctl.steer) continue;
      p.plan = null;
      if (r.last && r.last.team === p.team) {
        this.targets[p.id] = null;
        continue;
      }
      if (this.doubles && this.owner !== p.id) {
        // the partner's ball: no suggested spot. Holding the aim takes it anyway (never the serve: the receiver's)
        this.targets[p.id] = null;
        if (r.shots === 1 || !ctl.poach?.(this, p)) continue;
        const res = this.planContact(p, true);
        if (res && res.plan.reach) p.plan = res.plan;
        continue;
      }
      let tg = this.targets[p.id] ?? null;
      if (!tg || tg.t <= this.t || tg.t <= this.declined || this.t - (this.targetAt[p.id] ?? -1) >= 0.05) {
        // (once a circle has shown for this ball, a stretch is enough to keep one: SUGGEST)
        const res = this.planContact(p, false, true, !!this.chased[p.id]);
        const nt = res && res.plan.reach ? res.plan : null;
        // the old spot still holds if the ball still goes there and the player can make it; a new one replaces it
        // only when it is a refinement (a few centimetres away), never while the player is already in reach of it
        let valid = !!tg && tg.t > this.t + 0.02 && tg.t > this.declined && this.canMake(p, tg);
        if (valid && tg) {
          const b = this.ballAt(tg.t);
          valid = Math.hypot(b.x - tg.bx, b.y - tg.by, b.z - tg.bz) < 0.1;
        }
        const inReach = !!tg && Math.hypot(p.x - tg.fx, p.z - tg.fz) <= this.reachAt(tg.t);
        const refine = !!nt && !!tg && Math.hypot(nt.fx - tg.fx, nt.fz - tg.fz) < 0.25 && !inReach;
        if (!valid || refine) tg = nt;
        if (tg) this.chased[p.id] = true;
        this.targets[p.id] = tg;
        this.targetAt[p.id] = this.t;
        // doubles: a ball in that he can no longer make goes to the partner
        if (this.doubles && !tg && res && !res.plan.reach) {
          this.passOn(p);
          if (this.owner !== p.id) continue;
        }
      }
      if (tg) {
        const d = Math.hypot(p.x - tg.fx, p.z - tg.fz);
        if (d <= this.reachAt(tg.t)) {
          p.plan = { ...tg, fx: p.x, fz: p.z, stretch: d / LUNGE, oops: false };
          continue;
        }
      }
      const res = this.planContact(p, true);
      if (res && res.plan.reach) p.plan = res.plan;
    }
  }

  /**
   * Earliest good, legal and reachable moment for `p` to hit the ball now in the air.
   * `fromHere`: manual players, from where they stand (a lunge away at most).
   * `suggest`: the spot the game suggests to a manual player (no dice: balls in only).
   * `stretch`: the suggested spot only has to be within a stretch (SUGGEST: the circle for this ball has shown).
   * The ball can be met before it bounces (a volley; never the return of serve), after the bounce, or after it comes
   * back off the glass (Match.path), but not right against a wall (WALL_GAP).
   */
  planContact(p: Player, fromHere = false, suggest = false, stretch = false): { plan: Plan; cost: number } | null {
    const r = this.rally!;
    const mv = this.controllers[p.id].mover;
    const legs = this.path();
    // would it go into the net? Then there is nothing to play.
    if (r.bounces === 0 && !r.crossed && r.tNet !== null && !r.netDone) {
      const pn = posAt(r.seg, r.tNet);
      if (pn.y < netHeight(pn.x) + R) return null;
    }
    // the first bounce on the floor: is it in? (a ball going straight into the glass or out of the court is not)
    const after = r.bounces >= 1;
    const iFirst = legs.findIndex((l) => l.floor >= 1);
    let firstIn = after;
    if (!after && iFirst >= 0) {
      const g1 = posAt(legs[iFirst].s, legs[iFirst].t0, this.pv2);
      firstIn = r.shots === 1 ? inServiceCourt(g1.x, g1.z, p.side, r.serveHalf) : inHalf(g1.x, g1.z, p.side);
    }
    // a manual player decides for themselves whether a ball is going out (by not swinging)
    const playOut = !firstIn && !suggest && (fromHere || this.rng.chance(mv.misjudge));
    if (!firstIn && !playOut) return null; // let it go
    const mustBounce = r.shots === 1;
    const start = fromHere || suggest ? Math.max(this.t + 1 / 240, this.declined + 1 / 60) : this.t + p.reaction;
    // in: until the second bounce (the end of the path); going out: only before it bounces (or hits the glass)
    const end = firstIn ? legs[legs.length - 1].t1 : iFirst >= 0 ? legs[iFirst].t0 : legs[0].t1;
    // the suggested spot: what is left of the time a person needs to see the ball and push the stick (SUGGEST)
    const seeLeft = suggest ? Math.max(0, SUGGEST.see - (this.t - (r.last?.lastHit?.t ?? this.t))) : 0;
    let best: { plan: Plan; cost: number } | null = null;
    let fallback: { plan: Plan; deficit: number } | null = null;
    const bp: Vec3 = { x: 0, y: 0, z: 0 };
    // CPU players are often on the move (covering, recovering) when the ball comes: they split-step during the
    // reaction (brake), so they set off from where that leaves them and first undo what speed is left
    const cpu = !fromHere && !suggest;
    let ox = p.x;
    let oz = p.z;
    let rvx = 0;
    let rvz = 0;
    if (cpu) {
      const v = Math.hypot(p.vx, p.vz);
      const B = FEET.brakeMax;
      if (v > 0.05) {
        const tb = Math.min(p.reaction, v / B);
        const sd = v * tb - 0.5 * B * tb * tb;
        ox += (p.vx / v) * sd;
        oz += (p.vz / v) * sd;
        rvx = (p.vx / v) * (v - B * tb);
        rvz = (p.vz / v) * (v - B * tb);
      }
    }
    let li = 0;
    for (let t = start; t < end; t += 1 / 60) {
      while (li < legs.length - 1 && t > legs[li].t1) li++;
      const leg = legs[li];
      const bounced = leg.floor >= 1;
      if (mustBounce && !bounced) continue;
      if (!bounced && playOut === false && !firstIn) continue;
      posAt(leg.s, t, bp);
      if (bp.z * p.side < 0.35) continue; // still (or again) on the other side of the net
      // right against the glass there is no room for the swing
      if (Math.abs(bp.x) > W / 2 - WALL_GAP.side || Math.abs(bp.z) > HL - WALL_GAP.back) continue;
      if (bp.y < 0.14 || bp.y > 2.9) continue;
      const overhead = bp.y > 1.75;
      // (walls met since the hit, for the cost: a ball off the glass is slower and easier to read)
      const offGlass = li > 0 && legs.slice(1, li + 1).some((l, k) => legs[k].floor === l.floor);
      for (const hand of [1, -1] as const) {
        // forehand: the ball on the player's right (+x for the near side, −x for the far side)
        const fx = bp.x - p.side * hand * 0.55;
        if (Math.abs(fx) > AREA_X) continue;
        const fz = p.side * Math.min(AREA_Z, bp.z * p.side + (overhead ? 0.35 : 0.2));
        if (fz * p.side < 0.3) continue;
        const volley = !bounced;
        const dist = Math.hypot(fx - ox, fz - oz);
        // CPU players reach the last bit with a lunge
        const lg = fromHere || suggest ? 0 : lungeAt(mv.lunge ?? 0, t - start);
        // (CPU: the feet model, FEET, braking into the contact; the suggested spot of a manual player: the thumb's
        // quicker start, HUMAN_FEET, whose ease into top speed costs about 0.12 s on a long run)
        const run = Math.max(0, dist - 0.3 - lg);
        let need = cpu ? Math.max(0, runTime(run, p.speed) + plantTime(run, p.speed) - FEET.optimism) : run / p.speed + (dist - lg > 0.6 ? 0.12 : 0);
        if (rvx || rvz) need += Math.max(0, -(rvx * (fx - ox) + rvz * (fz - oz)) / Math.max(dist, 1e-3)) / FEET.brakeMax;
        const avail = t - start;
        if (fromHere) need = dist <= this.reachAt(t) ? 0 : Infinity;
        // the suggested spot: short of time for a person to get there costs; once a circle has shown, within a stretch
        // of it is enough
        let tight = 0;
        if (suggest) {
          tight = Math.max(0, need + seeLeft - avail);
          const rs = Math.max(0, dist - Math.min(SUGGEST.stretch, this.reachAt(t) - 0.1));
          if (stretch) need = Math.min(need, rs / p.speed + (rs > 0.3 ? 0.12 : 0));
        }
        // from here: the feet stay where they are (the lunge does the rest)
        const ffx = fromHere ? p.x : fx;
        const ffz = fromHere ? p.z : fz;
        const plan: Plan = { t, bx: bp.x, by: bp.y, bz: bp.z, fx: ffx, fz: ffz, volley, overhead, hand, reach: need <= avail, oops: false, stretch: fromHere ? dist / LUNGE : 0, out: volley && !firstIn };
        if (need <= avail) {
          let cost = Math.abs(bp.y - 0.95) * 1.2 + (bp.y < 0.35 ? 1.4 : 0) + (hand === -1 ? 0.18 : 0) + (t - this.t) * 0.25;
          // up at the net, take it out of the air (it robs the other side of time) and as high as it comes
          if (volley && Math.abs(fz) < AT_NET) cost -= 0.4 + Math.max(0, bp.y - 0.95) * 1.2;
          // at the back, a ball that comes off the glass is the easy one (slower, at a comfortable height)
          if (offGlass && !volley) cost -= 0.15;
          // CPU: a contact they only just make is a gamble (a stretch, a near miss): a little later, or after the
          // bounce, is the one a player picks when there is one (PLAN_SPARE)
          if (cpu) cost += Math.max(0, PLAN_SPARE.want - (avail - need)) * PLAN_SPARE.cost;
          // from here: prefer the comfortable side of the body and the nearest point
          if (fromHere) cost = Math.abs(bp.y - 0.95) * 0.8 + (bp.y < 0.3 ? 1 : 0) + dist * 0.6 + (hand === -1 ? 0.1 : 0) + (t - this.t) * 0.6;
          if (overhead) cost -= 0.2;
          cost += tight * SUGGEST.tight;
          if (!best || cost < best.cost) best = { plan, cost };
        } else {
          const deficit = need - avail;
          if (!fallback || deficit < fallback.deficit) fallback = { plan, deficit };
        }
      }
    }
    if (best) return best;
    if (fallback) return { plan: fallback.plan, cost: 50 + fallback.deficit };
    return null;
  }

  // ------------------------------------------------------------------ movement
  /**
   * Where a player waits while the partner plays the ball or the other side has it. Side by side, each in their half,
   * the pair shifted towards where the ball is going. Depth (CPU players): the team moves as one (afterHit); while the
   * serve is on its way the receiver waits back and his partner around the service line; a ball that is going to bounce
   * deep behind a pair at the net (a lob over them) sends both back. A CPU partner of the human goes up and back with
   * him. Manual players only get the lateral spot (the bot's thumbs use it); they choose their depth themselves.
   */
  private cover(p: Player): { x: number; z: number } {
    const r = this.rally!;
    const q = this.mate(p);
    const manual = !!this.controllers[p.id].steer;
    const nextToHuman = !!this.controllers[q.id].steer;
    const g = this.firstBounce(this.pv2);
    if (!manual) {
      const coming = r.last && r.last.team !== p.team;
      if (r.shots === 1 && coming) p.depth = p.id === this.receiverId ? 0 : 1;
      else if (coming && r.bounces === 0 && g.z * p.side > DEPTH_Z[1] - 0.3 && (r.last!.lastHit?.kind === 'lob' || r.seg.y > 3)) {
        // a lob over them: both back, unless the partner takes it over the head in front of the service line (a
        // bandeja, a víbora): then they hold the net together
        const own = this.owner >= 0 && this.owner !== p.id ? this.players[this.owner].plan : null;
        p.depth = own && own.volley && Math.abs(own.fz) < SERVICE ? 2 : 0;
      } else if (nextToHuman) p.depth = q.depth;
    }
    const c = Math.max(-1.6, Math.min(1.6, g.x * 0.4));
    const half = [2.2, 2.1, 2.0][p.depth];
    let x = c + p.lane * half;
    // next to the human: keep the gap from where he really is
    if (nextToHuman && (x - q.x) * p.lane < 2 * half - 0.6) x = q.x + p.lane * (2 * half - 0.6);
    x = Math.max(-W / 2 + 0.5, Math.min(W / 2 - 0.5, x));
    const z = manual ? p.homeZ : p.side * DEPTH_Z[p.depth];
    return { x, z };
  }

  /**
   * Manual players who asked for it (Controller.recover): where to jog back to while their side's shot is on its way.
   * Padel habits: the server comes in to the net; after a volley or an overhead, stay up; after a lob or a chiquita
   * from the back, in to the net behind it; after a drive from the back, stay back. Across: his half.
   */
  recoverSpot(p: Player): { x: number; z: number } {
    const r = this.rally!;
    const za = Math.abs(p.z);
    const kind = r.last?.lastHit?.kind ?? 'serve';
    let z: number;
    if (kind === 'serve' || kind === 'lob' || kind === 'dink' || kind === 'drop' || za < AT_NET) z = DEPTH_Z[2];
    else z = za < DEPTH_Z[1] ? DEPTH_Z[1] : DEPTH_Z[0];
    return { x: Math.max(-3.2, Math.min(3.2, p.homeX)), z: p.side * z };
  }

  /** Doubles: a player who ends up clearly on the partner's side of the partner takes that half (they switch). */
  private keepLanes() {
    for (const t of [0, 1] as const) {
      const [a, b] = this.team(t);
      if ((a.x - b.x) * a.lane < -0.6) {
        a.lane = -a.lane as 1 | -1;
        b.lane = -b.lane as 1 | -1;
      }
    }
  }

  private movePlayers(h: number) {
    const ball = this.phase === 'rally' ? posAt(this.rally!.seg, this.t, this.pv) : null;
    if (this.doubles && this.phase === 'rally') this.keepLanes();
    for (const p of this.players) {
      let tx = p.homeX;
      let tz = p.homeZ;
      const ctl = this.controllers[p.id];
      if (ctl?.steer && this.phase !== 'over' && !(this.phase === 'serve' && this.server() === p)) {
        if (this.doubles && this.phase === 'rally') p.homeX = this.cover(p).x;
        const st = ctl.steer(this, p);
        const k = Math.min(1, Math.hypot(st.x, st.z));
        let ux = k > 0.01 ? st.x / Math.hypot(st.x, st.z) : 0;
        let uz = k > 0.01 ? st.z / Math.hypot(st.x, st.z) : 0;
        let want = p.speed * k;
        // The assist: with the stick at rest the last steps to the suggested spot happen by themselves; pushing roughly
        // towards it locks on and the player goes straight there and parks, for as long as the thumb keeps pushing
        // roughly the way he came (a held stick or key never carries him past it). The thumb stays in charge: turning
        // the stick clearly away (LOCK_OFF on the way, PARK_OFF once parked) or a fresh push somewhere else frees him.
        // With no help at all, the only thing left is not running past the spot.
        const tg = this.phase === 'rally' ? this.targets[p.id] : null;
        const as = Math.max(0, Math.min(2, ctl.assist ?? 0));
        const fresh = k >= 0.2 && (this.stickWas[p.id] ?? 0) < 0.2;
        this.stickWas[p.id] = k;
        if (k >= 0.2) this.idleSince[p.id] = Infinity;
        else if (!(this.idleSince[p.id] < Infinity)) this.idleSince[p.id] = this.t;
        let lock = tg ? this.locks[p.id] ?? null : null;
        if (!tg) this.locks[p.id] = null;
        if (tg) {
          const dx = tg.fx - p.x;
          const dz = tg.fz - p.z;
          const d = Math.hypot(dx, dz);
          const tx = d > 1e-4 ? dx / d : 0;
          const tz = d > 1e-4 ? dz / d : 0;
          if (lock && k >= 0.2) {
            // on the way the stick is compared with the way to the spot; parked, with the way he came
            const parked = d < 0.3;
            const c = parked ? ux * lock.x + uz * lock.z : ux * tx + uz * tz;
            if (c < (fresh ? FRESH_OFF : parked ? PARK_OFF : LOCK_OFF[as])) lock = null;
          }
          if (!lock) {
            // (the thumb off the stick: not before the assist has had a person's moment to see the ball, ASSIST)
            const oppT = this.rally?.last && this.rally.last.team !== p.team ? this.rally.last.lastHit?.t ?? -9 : -9;
            const idle = k < 0.2 && as > 0 && d < ASSIST.idle[as] && this.t - oppT >= ASSIST.see;
            const aimed = k >= 0.2 && ux * tx + uz * tz > LOCK_ON[as] && (as > 0 || d < 0.25);
            if (idle || aimed) lock = { x: tx, z: tz };
          } else if (d >= 0.3) lock = { x: tx, z: tz }; // (the way he comes, for when he gets there)
          this.locks[p.id] = lock;
          if (lock) {
            ux = tx;
            uz = tz;
            // a planted stop on the spot: a braking profile the feet can follow (within a centimetre)
            const arrive = d < 0.006 ? 0 : Math.sqrt(2 * HUMAN_FEET.park * (d - 0.004));
            want = Math.min(p.speed, k < 0.2 ? arrive : Math.min(Math.max(want, p.speed * 0.9), arrive));
          }
        }
        // Between shots (his side's ball on its way, the thumb off the stick for a moment): jog back to a sensible
        // spot, if the player asked for it (Controller.recover)
        const r = this.rally;
        if (!tg && ctl.recover && this.phase === 'rally' && r?.last && r.last.team === p.team && k < 0.2 && this.t - this.idleSince[p.id] >= 0.15 && this.t - (r.last.lastHit?.t ?? 0) >= 0.2) {
          const w = this.recoverSpot(p);
          const dx = w.x - p.x;
          const dz = w.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.08) {
            ux = dx / d;
            uz = dz / d;
            want = Math.min(p.speed * 0.72, d * 4 + 0.2);
          }
        }
        let wx = ux * want;
        let wz = uz * want;
        // Human feet (HUMAN_FEET): a quick first step that eases into top speed, a planted stop, grip in the turns.
        // Around the contacts: braking into his own (assisted swing), the swing finished before running off, and a
        // split step when the other side hits, which pays off: the first step after it is the quicker one. The thumb's
        // wish is kept and applied as soon as each moment is over.
        let upCap = Infinity;
        let upMul = 1;
        const stance = this.stanceOf(p);
        const oppHit = r?.last && r.last.team !== p.team ? r.last.lastHit : null;
        if (oppHit && stance === null && this.t - oppHit.t < HUMAN_FEET.split + HUMAN_FEET.load) upMul = HUMAN_FEET.loadUp;
        if (stance === 'follow') {
          const w = Math.hypot(wx, wz);
          if (w > HUMAN_FEET.followV) {
            wx *= HUMAN_FEET.followV / w;
            wz *= HUMAN_FEET.followV / w;
          }
          upCap = HUMAN_FEET.followUp;
        } else if (stance === 'split') upCap = HUMAN_FEET.splitUp;
        else if (stance === 'plant' && p.plan) {
          const cap = HUMAN_FEET.plantV + HUMAN_FEET.plantB * Math.max(0, p.plan.t - this.t);
          const w = Math.hypot(wx, wz);
          if (w > cap) {
            wx *= cap / w;
            wz *= cap / w;
          }
        }
        footStep(p, wx, wz, h, p.speed, HUMAN_FEET, upCap, upMul);
        p.x += p.vx * h;
        p.z += p.vz * h;
        if (p.z * p.side < 0.4) {
          p.z = p.side * 0.4;
          p.vz = 0;
        }
        // the fence stops the feet (no running on the spot against it)
        if (Math.abs(p.x) > AREA_X) {
          p.x = Math.sign(p.x) * AREA_X;
          p.vx = 0;
        }
        if (Math.abs(p.z) > AREA_Z) {
          p.z = Math.sign(p.z) * AREA_Z;
          p.vz = 0;
        }
        // the depth the rest of the code reads (at the net, halfway, back)
        const d = Math.abs(p.z);
        p.depth = d < AT_NET ? 2 : d < DEPTH_Z[1] + 1.2 ? 1 : 0;
        continue;
      }
      // CPU players (see FEET): where they head, and how fast they want to be going there
      const r = this.rally;
      const opp = this.phase === 'rally' && r?.last && r.last.team !== p.team ? r.last.lastHit : null;
      let want = 0;
      let stop = 0;
      // braking into the contact: no faster than this (m/s)
      let plant = Infinity;
      if (this.phase !== 'rally') {
        // the point is over (or the serve is being set up): ease to a stop
        stop = this.phase === 'serve' ? FEET.brakeMax : FEET.brake;
      } else if (p.plan && this.t >= p.moveFrom) {
        const pl = p.plan;
        const left = pl.t - this.t;
        const d0 = Math.hypot(pl.fx - p.x, pl.fz - p.z);
        const run = Math.max(0, d0 - 0.3 - (ctl.mover.lunge ?? 0));
        const need = runTime(run, p.speed) + plantTime(run, p.speed);
        // with time in hand: come round a little behind the ball and step in to it at the end
        tx = pl.fx;
        tz = pl.fz + (left - need > 0.5 && d0 > 1 ? p.side * 0.25 * Math.min(1, d0 - 1) : 0);
        // the pace the ball asks for: get there with a third of a second in hand, sprint only when that needs it
        want = left - need > FEET.margin ? Math.max(FEET.jog, (d0 / Math.max(0.25, left - FEET.margin)) * 1.2) : p.speed;
        // and the feet are planted (or braking) when the paddle meets the ball: a late run ends in a stretch
        plant = FEET.plantV + FEET.plantB * Math.max(0, left);
        this.settled[p.id] = false;
      } else if (p.plan || (opp && this.t - opp.t < 0.15)) {
        // the other side hits: a split step (land balanced, read the ball, then go)
        stop = FEET.brakeMax;
      } else {
        if (this.doubles) {
          const c = this.cover(p);
          tx = c.x;
          tz = c.z;
        }
        // back to the spot: briskly over a few metres, a step or two for a small correction, nothing for centimetres
        const d0 = Math.hypot(tx - p.x, tz - p.z);
        if (this.settled[p.id] && d0 < FEET.idle) want = 0;
        else {
          this.settled[p.id] = d0 < FEET.settle;
          want = this.settled[p.id] ? 0 : FEET.recover[0] + FEET.recover[1] * d0;
        }
        // the swing is finished before they run off
        if (p.lastHit && this.t - p.lastHit.t < this.followOf(p, false)) want = Math.min(want, FEET.followV);
      }
      let wx = 0;
      let wz = 0;
      if (stop > 0) {
        const v = Math.hypot(p.vx, p.vz);
        const k = v > 1e-6 ? Math.max(0, 1 - (stop * h) / v) : 0;
        wx = p.vx * k;
        wz = p.vz * k;
      } else {
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        // a planted stop: a steady braking profile into the spot
        const sp = d < 0.01 ? 0 : Math.min(p.speed, want, Math.sqrt(2 * FEET.brake * d), plant);
        wx = d > 0 ? (dx / d) * sp : 0;
        wz = d > 0 ? (dz / d) * sp : 0;
      }
      footStep(p, wx, wz, h, p.speed);
      p.x += p.vx * h;
      p.z += p.vz * h;
      // never past the net, nor through the glass
      if (p.z * p.side < 0.4) {
        p.z = p.side * 0.4;
        p.vz = 0;
      }
      if (Math.abs(p.x) > AREA_X) {
        p.x = Math.sign(p.x) * AREA_X;
        p.vx = 0;
      }
      if (Math.abs(p.z) > AREA_Z) {
        p.z = Math.sign(p.z) * AREA_Z;
        p.vz = 0;
      }
    }
  }

  // ------------------------------------------------------------------ points
  private endPoint(winner: 0 | 1, reason: PointReason, fault: number | null, t: number) {
    const r = this.rally;
    this.t = t;
    for (const p of this.players) p.plan = null;
    this.targets.length = 0;
    this.locks.length = 0;
    this.stats.rallies++;
    this.stats.longest = Math.max(this.stats.longest, r?.shots ?? 0);
    if (fault !== null) {
      this.stats.errors[this.players[fault].team]++;
      this.stats.errorsBy[fault]++;
    } else this.stats.winners[winner]++;
    this.events.push({ type: 'point', winner, reason, fault, rally: r?.shots ?? 0 });
    this.reserve = null;
    this.serveNum = 1;
    this.award(winner);
    if (this.winner !== null) return;
    this.phase = 'dead';
    this.pointAt = t;
    this.deadUntil = t + DEAD_TIME;
  }

  /**
   * The point to `winner`: 15-30-40, the golden point at 40-40 (or advantages), the game and the set. The serve goes
   * round the four players, one game each; in the tie-break the first serve is the next in turn's, then two serves each
   * in the same order.
   */
  private award(winner: 0 | 1) {
    const lose = this.other(winner);
    this.points[winner]++;
    const a = this.points[winner];
    const b = this.points[lose];
    let won = false;
    if (this.tiebreak) won = a >= 7 && a - b >= 2;
    else if (this.rules.golden) won = a >= 4;
    else won = a >= 4 && a - b >= 2;
    if (!won) {
      if (this.tiebreak && (a + b) % 2 === 1) this.nextServer();
      return;
    }
    this.games[winner]++;
    const wasTie = this.tiebreak;
    this.events.push({ type: 'game', winner, games: [this.games[0], this.games[1]], tiebreak: wasTie });
    this.points = [0, 0];
    const g = this.games[winner];
    const G = this.rules.games;
    if (wasTie || (g >= G && g - this.games[lose] >= 2)) {
      this.winner = winner;
      this.phase = 'over';
      this.events.push({ type: 'over', winner });
      return;
    }
    this.tiebreak = this.games[0] === G && this.games[1] === G;
    this.nextServer();
  }

  /** The next server round the four (a new game, or every two points of the tie-break). */
  private nextServer() {
    this.played++;
    this.serverId = this.order[this.played % 4];
    this.serverTeam = this.players[this.serverId].team;
  }

  /**
   * The dead ball (after the point) off the floor and the walls, every event up to t1. The events are searched from the
   * start of its own stretch, not from the last step: a stretch that begins mid-step (the point ended at a wall or a
   * bounce) can meet the floor before the step is over, and the ball must not sink through it or through the glass.
   */
  private deadBounces(t1: number) {
    for (let i = 0; i < 6; i++) {
      const s = this.deadSeg!;
      if (s.roll) {
        // rolling: it stops at the glass (inside the court)
        const p0 = posAt(s, s.t0, this.pv2);
        const w = Math.abs(p0.x) > W / 2 || Math.abs(p0.z) > HL ? null : wallTime(s);
        if (w && w.t <= t1) {
          const p = posAt(s, w.t);
          this.deadSeg = { ...seg(w.t, { x: p.x, y: R, z: p.z }, { x: 0, y: 0, z: 0 }), roll: true, k: 1 };
        }
        return;
      }
      const tg = groundTime(s);
      // (outside the court, over the top of a wall: no more walls, it drops to the ground out there)
      const p0 = posAt(s, s.t0, this.pv2);
      const outside = Math.abs(p0.x) > W / 2 || Math.abs(p0.z) > HL;
      const w = outside ? null : wallTime(s);
      if (w && w.t <= t1 && w.t < tg) {
        const surface = this.surfaceOf(s, w);
        if (surface === 'open') {
          // over the top: on its way out of the court (a stretch that starts just past the wall)
          const p = posAt(s, w.t);
          const v = velAt(s, w.t);
          const dx = w.axis === 'x' ? w.sign * 2 * R : 0;
          const dz = w.axis === 'z' ? w.sign * 2 * R : 0;
          this.deadSeg = seg(w.t, { x: p.x + dx, y: p.y, z: p.z + dz }, v, s.spin, s.k, s.g);
          continue;
        }
        this.deadSeg = wallBounce(s, w, surface);
        continue;
      }
      if (tg > t1) return;
      const v = velAt(s, tg);
      const p = posAt(s, tg);
      if (Math.abs(v.y) > 0.6) this.deadSeg = bounce(s, tg);
      // rolling to a stop
      else this.deadSeg = { ...seg(tg, { x: p.x, y: R, z: p.z }, { x: v.x * 0.6, y: 0, z: v.z * 0.6 }), roll: true };
    }
  }

  /** Is the incoming ball the human's to hit (for the input ring)? */
  humanPlan(): { p: Player; plan: Plan } | null {
    for (const p of this.players) if (p.human && p.plan) return { p, plan: p.plan };
    return null;
  }

  /**
   * Manual swing: the timing of a release `e` seconds before the contact (null: held through it). Early pulls the
   * ball across, late pushes it wide (`late`, −1 … 1).
   */
  static timingOf(e: number | null, holding: boolean): { timing: Timing; q: number; late: number } {
    if (e === null) return holding ? { timing: 'late', q: 0.72, late: 0.45 } : { timing: 'auto', q: 0.7, late: 0 };
    const off = Math.abs(e - IDEAL_RELEASE);
    if (off <= PERFECT_WINDOW) return { timing: 'perfect', q: 1, late: 0 };
    if (e < IDEAL_RELEASE) return { timing: 'late', q: 0.78, late: 0.35 };
    if (off <= 0.3) return { timing: 'good', q: 0.92 - (off - 0.1) * 0.5, late: -(off - 0.1) * 1.5 };
    return { timing: 'early', q: Math.max(0.55, 0.82 - (off - 0.3) * 0.4), late: -Math.min(1, 0.3 + (off - 0.3)) };
  }
}

/**
 * The best moment to let go of the aim: this long before the contact, ± the perfect window. On a phone a lift reaches
 * the game some 45 ms after the frame the player reacted to (Input LAG dates it back), and a lift that arrives after
 * the contact is too late whatever it meant: the window ends 40 ms before the contact so the last of the gold ring on
 * screen still counts.
 */
export const IDEAL_RELEASE = 0.14;
export const PERFECT_WINDOW = 0.1;

export { STEP };
