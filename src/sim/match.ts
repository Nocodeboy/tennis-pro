// The match: positions, the ball, the rules of a rally and the score. Deterministic for a given seed and the same
// shot decisions, so the bot, the browser and (later) an online server run exactly the same code.
//
// Built for 1 or 2 players a side: everything goes through `players` and `team`, never "the player" and "the CPU".
// Doubles (four players) adds the USA Pickleball serve rotation for both scoring systems (side-out: server 1 and 2
// with the "0-0-2" start; rally: one server per side out and the game won only serving), positions that follow the
// score, the right receiver, and a receiving team that agrees who takes each ball (each covers a half).

import { bounce, groundTime, minFlight, netTime, posAt, seg, shotByClearance, velAt, type Seg, type Vec3 } from './ball';
import { HL, NET_C, NVZ, R, W, inHalf, inKitchen, inServiceCourt, netHeight, outBy, type Side } from './court';
import { Rng } from './rng';
import type { MatchEvent, Plan, Player, PointReason, Rules, ShotKind, ShotSpec, Timing } from './types';

/** Spin each kind of shot carries: topspin drives and rolls, sliced drops and blocks. */
export const SPIN: Record<ShotKind, number> = { serve: 0.3, return: 0.35, drive: 0.8, speedup: 0.55, smash: 0.45, lob: 0.45, dink: -0.15, drop: -0.5, auto: -0.35 };
const SOFT = new Set<ShotKind>(['dink', 'drop', 'auto']);

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
  /**
   * CPU players in singles: where to go after their own shot (depth: 0 back · 1 transition · 2 kitchen line; x: where
   * to wait across), the AI's decision to come in or stay back. null (or absent): the default habits (afterHit).
   */
  place?(m: Match, p: Player, spec: ShotSpec): { depth: 0 | 1 | 2; x: number } | null;
}

export interface Mover {
  /** 0 … 1: how readily they move up to the kitchen line once the two-bounce rule allows it */
  netRush: number;
  /** chance of playing a ball that was going out */
  misjudge: number;
  /** chance of stepping into the kitchen on a volley (a fault) */
  kitchenFault: number;
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
  /** the assist's braking profile into the suggested spot and into the kitchen line (m/s², below brakeMax) */
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
function lungeAt(lunge: number, dt: number): number {
  if (CPU_LUNGE.time <= 0) return lunge;
  return lunge * Math.max(0, Math.min(1, CPU_LUNGE.min + ((1 - CPU_LUNGE.min) * dt) / CPU_LUNGE.time));
}
/** the playing area inside the fence (30 × 60 ft): nobody runs through it */
const AREA_X = 4.57 - 0.35;
const AREA_Z = 9.14 - 0.35;
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
/** where the feet of a player running up to the net stop (assisted): just behind the kitchen line */
export const LINE_STOP = NVZ + 0.2;
/**
 * The serve's wind-up: from the moment the server lets go (the controller returns the serve) to the contact. It is
 * the contact frame of the serve clip (assets/anims/serve.json, measured in render/chars.ts), so the view can play
 * the backswing and drop the ball from the free hand in time.
 */
export const SERVE_WINDUP = 0.87;
/** height of the serve contact (m): underhand, below the waist, where the serve clip's paddle can get to */
export const SERVE_HEIGHT = 0.7;

interface Rally {
  shots: number;
  last: Player | null;
  bounces: number;
  seg: Seg;
  tNet: number | null;
  netDone: boolean;
  tGround: number;
  /** the serve must land in this half of the receiver's service courts (sign of x) */
  serveHalf: 1 | -1;
}

export class Match {
  t = 0;
  readonly players: Player[] = [];
  readonly controllers: Controller[] = [];
  readonly rng: Rng;
  score: [number, number] = [0, 0];
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
    /** per player (doubles: your own count, not the team's) */
    perfectBy: [] as number[],
    errorsBy: [] as number[],
  };
  /** two players a side */
  readonly doubles: boolean;
  /** doubles: who serves now (−1 before the first serve) */
  serverId = -1;
  /** doubles, side-out scoring: server 1 or 2 of the serving team (the game starts at "0-0-2": one server only) */
  serverNum: 1 | 2 = 1;
  /** doubles: who returns this serve (the player diagonally opposite the server) */
  receiverId = -1;
  /** doubles: who of the receiving team takes the coming ball (−1: nobody, it is going out) */
  owner = -1;
  /** doubles: the coming ball was already passed on once (to the partner of a player who could not make it) */
  private passed = -1;
  /** scratch */
  private acc = 0;
  private pv: Vec3 = { x: 0, y: 0, z: 0 };
  private pv2: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(
    cfgs: PlayerCfg[],
    readonly rules: Rules,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.doubles = cfgs.length > 2;
    cfgs.forEach((c, i) => {
      const side: Side = c.team === 0 ? 1 : -1;
      this.players.push({
        id: i,
        team: c.team,
        side,
        human: c.human,
        x: 0,
        z: side * (HL + 0.3),
        vx: 0,
        vz: 0,
        speed: c.speed,
        reaction: c.reaction,
        plan: null,
        moveFrom: 0,
        homeX: 0,
        homeZ: side * (HL + 0.3),
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
    if (this.doubles) return this.players[this.serverId] ?? this.rightOf(this.serverTeam);
    return this.team(this.serverTeam)[0];
  }
  /** doubles: the partner of `p` */
  mate(p: Player): Player {
    return this.players.find((q) => q.team === p.team && q !== p) ?? p;
  }
  /**
   * Doubles: who stands in the right court of `team` (right from the team's own view). Positions follow the score:
   * the team's first player (the one in the right court at 0) is there when the team's score is even, and in the left
   * court when it is odd. So a serving team that wins a point swaps sides, and a receiving team never does (rally
   * scoring: the team that wins the side-out point swaps, and the player now in the right court serves).
   */
  rightOf(team: 0 | 1): Player {
    const [a, b] = this.team(team);
    return this.score[team] % 2 === 0 ? a : b;
  }
  /** doubles: sign of x of the court (half) `p` stands in for the serve */
  courtX(p: Player): 1 | -1 {
    return (this.rightOf(p.team) === p ? p.side : -p.side) as 1 | -1;
  }
  /**
   * The score as it is called before a serve: serving team first. Side-out doubles adds the server number ("4-2-1");
   * rally scoring and singles are two numbers.
   */
  call(): string {
    const st = this.serverTeam;
    const s = `${this.score[st]}-${this.score[st === 0 ? 1 : 0]}`;
    return this.doubles && this.rules.scoring === 'sideout' ? `${s}-${this.serverNum}` : s;
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
   * Server's half of the court (sign of x). Singles: right (from the server's view) when the server's score is even.
   * Doubles: the court the server stands in (see rightOf).
   */
  serveX(team: 0 | 1): 1 | -1 {
    if (this.doubles) return this.courtX(team === this.serverTeam ? this.server() : this.rightOf(team));
    const side: Side = team === 0 ? 1 : -1;
    const even = this.score[team] % 2 === 0;
    return (side * (even ? 1 : -1)) as 1 | -1;
  }

  /** Puts everybody in place for the next serve. */
  setupServe() {
    const st = this.serverTeam;
    if (this.doubles) this.setupDoubles();
    else {
      const sx = this.serveX(st);
      for (const p of this.players) {
        p.plan = null;
        p.vx = p.vz = 0;
        p.depth = 0;
        p.lastHit = null;
        if (p.team === st) {
          p.x = sx * 1.1;
          p.z = p.side * (HL + 0.35);
        } else {
          // the receiver stands diagonally, a step behind the baseline (serves come in deep)
          p.x = -sx * 1.35;
          p.z = p.side * (HL + 0.45);
        }
        p.homeX = p.x;
        p.homeZ = p.z;
      }
    }
    this.rally = null;
    this.deadSeg = null;
    this.targets.length = 0;
    this.locks.length = 0;
    this.placed.length = 0;
    this.phase = 'serve';
    this.servePending = true;
    this.windup = null;
    this.events.push({ type: 'serveSetup', server: this.server().id });
  }

  /**
   * Doubles positions for the serve, all in the halves the score gives them: the server behind the baseline, the
   * partner back at the baseline too (the return must bounce), the receiver diagonally opposite a step behind the
   * baseline and the receiver's partner already up at the kitchen line (the usual strategy).
   */
  private setupDoubles() {
    const st = this.serverTeam;
    if (this.serverId < 0) {
      // the first serve of the game: from the right court, and only one server ("0-0-2") in side-out scoring
      this.serverNum = this.rules.scoring === 'sideout' ? 2 : 1;
      this.serverId = this.rightOf(st).id;
    }
    const srv = this.server();
    const sx = this.courtX(srv);
    const rcv = this.players.find((q) => q.team !== st && this.courtX(q) === -sx)!;
    this.receiverId = rcv.id;
    this.owner = -1;
    this.passed = -1;
    for (const p of this.players) {
      p.plan = null;
      p.vx = p.vz = 0;
      p.depth = 0;
      p.lastHit = null;
      const c = this.courtX(p);
      p.lane = c;
      if (p === srv) {
        p.x = c * 1.2;
        p.z = p.side * (HL + 0.35);
      } else if (p.team === st) {
        p.x = c * 1.6;
        p.z = p.side * (HL + 0.2);
      } else if (p === rcv) {
        p.x = c * 1.5;
        p.z = p.side * (HL + 0.45);
      } else {
        p.x = c * 1.5;
        p.z = p.side * (NVZ + 0.35);
        p.depth = 2;
      }
      p.homeX = p.x;
      p.homeZ = p.z;
    }
  }

  start() {
    this.serverTeam = this.rng.chance(0.5) ? 0 : 1;
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
  private rallyEvents(t1: number) {
    for (let guard = 0; guard < 8 && this.phase === 'rally'; guard++) {
      const r = this.rally!;
      let te = Infinity;
      let kind: 'net' | 'ground' | 'hit' | null = null;
      let hitter: Player | null = null;
      if (!r.netDone && r.tNet !== null && r.tNet < te) {
        te = r.tNet;
        kind = 'net';
      }
      if (r.tGround < te) {
        te = r.tGround;
        kind = 'ground';
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
      else this.onContact(hitter!, te);
    }
  }

  private onNet(t: number) {
    const r = this.rally!;
    r.netDone = true;
    const p = posAt(r.seg, t, this.pv);
    const top = netHeight(p.x) + R;
    if (p.y >= top + 0.004) return; // clean over
    const v = velAt(r.seg, t);
    const side = r.last!.side;
    // how squarely it meets the tape: 1 = brushes it, 0 = hits it full on
    const c = (p.y - (top - 1.3 * R)) / (1.3 * R + 0.004);
    if (c > 0.3) {
      // clips the tape: loses most of its pace, pops up and trickles over (live, as in the real game)
      const keep = 0.2 + 0.55 * c;
      const nv = { x: v.x * keep * 0.8, y: Math.abs(v.y) * 0.15 + 0.5 + 1.5 * (1 - c), z: v.z * keep };
      const s = seg(t, { x: p.x, y: top + 0.005, z: -side * 0.03 }, nv, 0.1);
      r.seg = s;
      r.tGround = groundTime(s);
      r.tNet = null;
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
    this.endPoint(r.last!.team === 0 ? 1 : 0, 'net', r.last!.id, t);
  }

  private onGround(t: number) {
    const r = this.rally!;
    const p = posAt(r.seg, t, this.pv);
    const hitter = r.last!;
    const recvSide = -hitter.side as Side;
    const onRecv = p.z * recvSide > 0;
    if (r.bounces === 0) {
      let good: boolean;
      let reason: PointReason = 'out';
      if (!onRecv) good = false;
      else if (r.shots === 1) {
        good = inServiceCourt(p.x, p.z, recvSide, r.serveHalf);
        if (!good) reason = inKitchen(p.z, recvSide) && Math.abs(p.x) <= W / 2 ? 'serveKitchen' : 'serveOut';
      } else good = inHalf(p.x, p.z, recvSide);
      const close = good ? outBy(p.x, p.z, recvSide) === 0 && (Math.abs(Math.abs(p.x) - W / 2) < 0.12 || Math.abs(Math.abs(p.z) - HL) < 0.12) : outBy(p.x, p.z, recvSide) < 0.12;
      this.events.push({ type: 'bounce', x: p.x, z: p.z, good, first: true, close });
      r.seg = bounce(r.seg, t);
      r.tGround = groundTime(r.seg);
      r.tNet = netTime(r.seg);
      r.netDone = r.tNet === null;
      if (!good) {
        this.deadSeg = r.seg;
        this.endPoint(hitter.team === 0 ? 1 : 0, reason, hitter.id, t);
        return;
      }
      r.bounces = 1;
      return;
    }
    // second bounce: nobody got to it
    this.events.push({ type: 'bounce', x: p.x, z: p.z, good: true, first: false, close: false });
    this.deadSeg = bounce(r.seg, t);
    // why: a clean winner, a ball someone went for and did not reach, or one let go (a volley from the kitchen)
    const recv = this.players.filter((q) => q.team !== hitter.team);
    const reason: PointReason = recv.some((q) => this.letGo[q.id]) ? 'letGo' : recv.some((q) => this.chased[q.id] || (q.plan && !q.plan.reach)) ? 'miss' : 'winner';
    this.endPoint(hitter.team, reason, null, t);
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
      // did not get there: the ball goes past (in doubles the partner may still get to it)
      if (this.doubles && !manual) this.passOn(p, true);
      return;
    }
    if (!manual) plan.stretch = lunge > 0 ? Math.max(0, gap - 0.3) / lunge : 0;
    // a plan worked out on a flight that has changed since (the tape): the ball is not where the paddle is
    const bp = posAt(r.seg, t);
    if (Math.hypot(bp.x - plan.bx, bp.y - plan.by, bp.z - plan.bz) > 0.3) return;
    if (manual && ctl.swing && !ctl.swing(this, p, plan)) {
      // no swing: this chance goes by (another may come after the bounce)
      this.declined = t;
      if (plan.oops) this.letGo[p.id] = true;
      return;
    }
    const volley = r.bounces === 0;
    // the two-bounce rule: the return and the third shot must bounce first
    if (volley && r.shots < 3) {
      this.endPoint(p.team === 0 ? 1 : 0, 'twoBounce', p.id, t);
      return;
    }
    if (volley && inKitchen(p.z, p.side)) {
      if (plan.oops) {
        this.deadSeg = r.seg;
        this.endPoint(p.team === 0 ? 1 : 0, 'kitchen', p.id, t);
        return;
      }
      // a legal plan: the last step takes the feet behind the line
      if (!manual) p.z = plan.fz;
      else {
        this.deadSeg = r.seg;
        this.endPoint(p.team === 0 ? 1 : 0, 'kitchen', p.id, t);
        return;
      }
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
      // a poor soft shot mostly floats up and carries past the kitchen (a ball the other side can volley and
      // attack); only a really poor one, or one scooped off the floor, dies in the tape. A poor block of a hard ball
      // sends its pace back: it flies up and long. The automatic reset is aimed deep and high already: a poor one
      // sits up rather than carrying further.
      const vin = this.rally ? velAt(this.rally.seg, t, this.pv2) : null;
      // (the automatic reset and the human's block, a tap, are plain blocks: they take more of the pace off)
      const rebound = vin ? (Math.max(0, Math.hypot(vin.x, vin.z) - 10) / 10) * (spec.timing === 'auto' || spec.intent === 'block' ? 0.5 : 1) : 0;
      if (!popped && this.rng.chance(bad * bad * 0.3 + (from.y < 0.3 ? bad * 0.25 : 0) + bad * rebound * 0.5)) clear -= 0.2 + u * 0.1;
      else {
        clear += bad * (0.05 + u * 1.3) * (1 + rebound * 0.6) + (popped ? 0.35 + u * 0.45 : 0);
        tz += recvSide * (bad * (0.2 + u) * (spec.kind === 'auto' ? 0.8 : 2.4) * (1 + rebound * 2) + (popped && spec.kind !== 'auto' ? 0.9 + u * 0.9 : 0));
      }
    } else if (spec.kind === 'lob') {
      clear -= bad * u * 1.6; // short and low: a smash waiting to happen
      tz -= recvSide * (bad * u * 2.4 + (popped ? 0.6 + u : 0));
      // how far a lob carries is hard to judge: a deep one can sail out
      tz += recvSide * this.rng.gauss() * (0.32 + bad * 0.7);
    } else {
      // a hard swing gone wrong: off a low ball it mostly sails, off a high one it may be hit down into the net
      const low = from.y < 0.6;
      // a drive hit up from below the tape close to the net: gone wrong, it sits up for the volleyer
      const up = spec.kind === 'drive' && from.y < NET_C && Math.abs(from.z) < 3.6;
      if (this.rng.chance(low ? 0.72 : 0.62)) {
        clear += bad * u * 0.5 + (up ? bad * (0.2 + u * 0.8) : 0);
        tz += recvSide * bad * (0.3 + u) * 1.5;
      } else clear -= bad * (low ? 0.12 + u * 0.4 : 0.06 + u * 0.3);
      // under pressure a drive is pushed rather than hit: higher and slower (an attack off a high ball is not)
      if (popped && spec.kind === 'drive') {
        clear += 0.3 + u * 0.4;
        pace *= 1.3;
      }
    }
    // off the frame (ShotSpec.shank): a soft shot dies in the net, a swing goes into it or sails long
    const shanked = !!spec.shank && this.rng.chance(spec.shank);
    if (shanked) {
      if (soft || this.rng.chance(0.5)) clear = Math.min(clear, 0) - 0.15 - u * 0.25;
      else {
        clear += 0.3 + u * 0.6;
        tz += recvSide * (2.2 + u * 2);
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
    const r: Rally = this.rally ?? { shots: 0, last: null, bounces: 0, seg: s, tNet: null, netDone: false, tGround: 0, serveHalf };
    this.declined = -1;
    this.chased.length = 0;
    this.letGo.length = 0;
    this.locks.length = 0;
    r.shots++;
    r.last = p;
    r.bounces = 0;
    r.seg = s;
    r.tNet = netTime(s);
    r.netDone = r.tNet === null;
    r.tGround = groundTime(s);
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

  /** The hitter's next position: back, in transition or up at the kitchen line. */
  private afterHit(p: Player, spec: ShotSpec) {
    const r = this.rally!;
    const mv = this.controllers[p.id].mover;
    // singles: a CPU player decides it (come in or stay back, and where to wait across: Controller.place)
    const pl = this.doubles ? null : this.controllers[p.id].place?.(this, p, spec) ?? null;
    this.placed[p.id] = !!pl;
    if (pl) {
      p.depth = pl.depth;
      p.homeZ = p.side * [HL + 0.3, 4.3, NVZ + 0.3][pl.depth];
      p.homeX = pl.x;
      return;
    }
    // the server waits for the return to bounce; the returner moves up behind the return
    if (r.shots === 1) p.depth = 0;
    else if (r.shots === 2) p.depth = this.rng.chance(mv.netRush) ? 2 : 0;
    else if (spec.kind === 'lob') p.depth = Math.min(p.depth, 1) as 0 | 1;
    else if (spec.kind === 'dink' || spec.kind === 'drop') p.depth = this.rng.chance(mv.netRush) ? 2 : 1;
    else if (p.depth < 2) p.depth = this.rng.chance(mv.netRush * 0.8) ? (p.depth + 1) as 1 | 2 : p.depth;
    const zs = [HL + 0.3, 4.3, NVZ + 0.3][p.depth];
    p.homeZ = p.side * zs;
    p.homeX = Math.max(-1.8, Math.min(1.8, spec.tx * 0.35));
    if (this.doubles) {
      // the partner moves with the hitter: both back for the serve, then up and back together
      const q = this.mate(p);
      if (!this.controllers[q.id].steer) {
        if (r.shots === 1) q.depth = 0;
        else if (r.shots >= 3) q.depth = p.depth;
      } else if (r.shots >= 3) q.homeZ = q.side * [HL + 0.3, 4.3, NVZ + 0.3][p.depth]; // where the bot's thumbs go
      // whoever crossed into the partner's half (a lob, a poach) keeps it: they switch halves
      if ((p.x - q.x) * p.lane < -0.6) {
        p.lane = -p.lane as 1 | -1;
        q.lane = -q.lane as 1 | -1;
      }
    }
  }

  /** After a hit, the team on the other side works out who takes the ball and where. */
  private planReceivers() {
    if (this.doubles) return this.planDoubles();
    const r = this.rally!;
    const hitter = r.last!;
    let best: { p: Player; plan: Plan; cost: number } | null = null;
    for (const p of this.players) {
      p.plan = null;
      if (p.team === hitter.team || this.controllers[p.id].steer) continue;
      const res = this.planContact(p);
      if (res && (!best || res.cost < best.cost)) best = { p, plan: res.plan, cost: res.cost };
    }
    if (best) {
      best.p.plan = best.plan;
      best.p.moveFrom = this.t + best.p.reaction;
      this.misread(best.p);
    }
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
    if (POACH.chance > 0 && r.shots > 2 && !this.controllers[best.p.id].steer && !this.controllers[q.id].steer && qp?.reach && qp.volley && Math.abs(q.z) < 3.6 && qp.by > NET_C) {
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
  /** manual players: the kitchen line is holding them back right now */
  private lineHeld: boolean[] = [];
  /** when the last point ended */
  private pointAt = 0;
  /** this ball: the receiver had a spot to go to (a miss if it bounces twice) / let it go (a kitchen volley) */
  private chased: boolean[] = [];
  /** CPU players waiting on their spot (they only move again when it is more than FEET.idle away) */
  private settled: boolean[] = [];
  /** singles: the CPU player's waiting spot was chosen by its controller (Controller.place): no shading to the ball */
  private placed: boolean[] = [];
  private letGo: boolean[] = [];

  /** Where the ball of the rally will be at time t (through the coming bounce). */
  private ballAt(t: number): Vec3 {
    const r = this.rally!;
    if (r.bounces === 0 && t > r.tGround) return posAt(bounce(r.seg, r.tGround), t);
    return posAt(r.seg, t);
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
  /** For the HUD: the kitchen line is holding the player back right now (he pushes on, the ball does not bounce in). */
  lineHold(pid: number): boolean {
    return !!this.lineHeld[pid];
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
          p.plan = { ...tg, fx: p.x, fz: p.z, stretch: d / LUNGE, oops: tg.volley && inKitchen(p.z, p.side) };
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
   * `suggest`: the spot the game suggests to a manual player (no dice: in-balls only, never a kitchen volley).
   * `stretch`: the suggested spot only has to be within a stretch (SUGGEST: the circle for this ball has shown).
   */
  planContact(p: Player, fromHere = false, suggest = false, stretch = false): { plan: Plan; cost: number } | null {
    const r = this.rally!;
    const mv = this.controllers[p.id].mover;
    // already bounced (manual players re-plan every step): only the stretch before the second bounce is left
    const after = r.bounces === 1;
    const s1 = r.seg;
    const tg1 = after ? s1.t0 : r.tGround;
    const g1 = posAt(s1, tg1);
    // would it go into the net? Then there is nothing to play.
    if (!after && r.tNet !== null && !r.netDone) {
      const pn = posAt(s1, r.tNet);
      if (pn.y < netHeight(pn.x) + R) return null;
    }
    const firstIn = after || (r.shots === 1 ? inServiceCourt(g1.x, g1.z, p.side, r.serveHalf) : inHalf(g1.x, g1.z, p.side));
    // a manual player decides for themselves whether a ball is going out (by not swinging)
    const playOut = !firstIn && !suggest && (fromHere || this.rng.chance(mv.misjudge));
    if (!firstIn && !playOut) return null; // let it go
    const s2 = after ? s1 : bounce(s1, tg1);
    const tg2 = after ? r.tGround : groundTime(s2);
    const mustBounce = r.shots < 3;
    const start = fromHere || suggest ? Math.max(this.t + 1 / 240, this.declined + 1 / 60) : this.t + p.reaction;
    const end = firstIn ? tg2 : tg1;
    const kitchenOops = !suggest && (fromHere || this.rng.chance(mv.kitchenFault));
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
        const s = v * tb - 0.5 * B * tb * tb;
        ox += (p.vx / v) * s;
        oz += (p.vz / v) * s;
        rvx = (p.vx / v) * (v - B * tb);
        rvz = (p.vz / v) * (v - B * tb);
      }
    }
    for (let t = start; t < end; t += 1 / 60) {
      const bounced = t > tg1;
      if (mustBounce && !bounced) continue;
      if (!bounced && playOut === false && !firstIn) continue;
      posAt(bounced ? s2 : s1, t, bp);
      if (bp.z * p.side < 0.35) continue; // still on the other side of the net
      if (bp.y < 0.14 || bp.y > 2.75) continue;
      const overhead = bp.y > 1.75;
      for (const hand of [1, -1] as const) {
        // forehand: the ball on the player's right (+x for the near side, −x for the far side)
        const fx = bp.x - p.side * hand * 0.55;
        const fz = bp.z + p.side * (overhead ? 0.35 : 0.2);
        if (fz * p.side < 0.3) continue;
        const volley = !bounced;
        if (volley && (fromHere ? p.z : fz) * p.side < NVZ + 0.18 && !kitchenOops) continue;
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
        const plan: Plan = { t, bx: bp.x, by: bp.y, bz: bp.z, fx: ffx, fz: ffz, volley, overhead, hand, reach: need <= avail, oops: volley && inKitchen(ffz, p.side), stretch: fromHere ? dist / LUNGE : 0, out: volley && !firstIn };
        if (need <= avail) {
          let cost = Math.abs(bp.y - 0.85) * 1.2 + (bp.y < 0.35 ? 1.4 : 0) + (hand === -1 ? 0.18 : 0) + (t - this.t) * 0.25;
          // up at the kitchen line, take it out of the air (it robs the opponent of time) and as high as it comes:
          // a ball above the net can be attacked
          if (volley && p.depth === 2) cost -= 0.4 + Math.max(0, bp.y - 0.85) * 1.6;
          // from here: prefer the comfortable side of the body and the nearest point
          if (fromHere) cost = Math.abs(bp.y - 0.9) * 0.8 + (bp.y < 0.3 ? 1 : 0) + dist * 0.6 + (hand === -1 ? 0.1 : 0) + (t - this.t) * 0.6;
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
   * Doubles: where a player waits while the partner plays the ball or the other side has it. Side by side, each in
   * their half, the pair shifted towards where the ball is going. Depth: the two-bounce rule keeps the serving team
   * back until its third shot and the receiver back until the return (the receiver's partner waits at the kitchen line);
   * after that a CPU pair moves as one (afterHit), and a CPU partner of the human goes up and back with him.
   * Manual players only get the lateral spot (the bot's thumbs use it); they choose their depth themselves.
   */
  private cover(p: Player): { x: number; z: number } {
    const r = this.rally!;
    const q = this.mate(p);
    const manual = !!this.controllers[p.id].steer;
    const nextToHuman = !!this.controllers[q.id].steer;
    if (!manual) {
      const serving = p.team === this.serverTeam;
      if (serving && r.shots < 3) p.depth = 0;
      else if (!serving && r.shots < 2) p.depth = p.id === this.receiverId ? 0 : 2;
      else if (nextToHuman) p.depth = q.depth;
    }
    const g = posAt(r.seg, r.tGround, this.pv2).x;
    const c = Math.max(-1, Math.min(1, g * 0.45));
    const half = [1.5, 1.45, 1.3][p.depth];
    let x = c + p.lane * half;
    // next to the human: keep the gap from where he really is
    if (nextToHuman && (x - q.x) * p.lane < 2 * half - 0.4) x = q.x + p.lane * (2 * half - 0.4);
    x = Math.max(-W / 2 + 0.2, Math.min(W / 2 - 0.2, x));
    const z = manual ? p.homeZ : p.side * [HL + 0.3, 4.3, NVZ + 0.3][p.depth];
    return { x, z };
  }

  /**
   * Manual players who asked for it (Controller.recover): where to jog back to while their side's shot is on its way.
   * Good habits: the serving side waits back for the return to bounce; after the return, or a soft shot, up to the
   * kitchen line; after a drive, a step further in (back → transition → line); after a lob, stay. Across: the middle
   * of the angles the reply can take (homeX: singles, from the target of his shot; doubles, his half).
   */
  recoverSpot(p: Player): { x: number; z: number } {
    const r = this.rally!;
    const za = Math.abs(p.z);
    const kind = r.last?.lastHit?.kind ?? 'serve';
    let z: number;
    if (p.team === this.serverTeam && r.shots < 3) z = HL + 0.3;
    else if (kind === 'lob') z = Math.max(za, NVZ + 0.3);
    else if (r.shots === 2 || kind === 'dink' || kind === 'drop' || (kind === 'auto' && za < 4.6)) z = NVZ + 0.3;
    else z = za > 5.4 ? 4.3 : NVZ + 0.3;
    // (never into the kitchen)
    z = Math.max(NVZ + 0.3, Math.min(HL + 0.3, z));
    return { x: Math.max(-2.2, Math.min(2.2, p.homeX)), z: p.side * z };
  }

  /** The ball coming to `p`'s side bounces (or has bounced) in their kitchen: a reason to step in. */
  private kitchenBall(p: Player): boolean {
    const r = this.rally;
    if (this.phase !== 'rally' || !r?.last || r.last.team === p.team) return false;
    const g = r.bounces === 0 ? posAt(r.seg, r.tGround, this.pv2) : posAt(r.seg, r.seg.t0, this.pv2);
    return inKitchen(g.z, p.side) && Math.abs(g.x) <= W / 2 + 0.3;
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
        // The kitchen line stops a player running up to the net (with any help): the feet stay just behind it, so a
        // volley is never a fault by accident. The only reason to go in is a ball that bounces in there: then the line
        // lets him through (and the assist takes him to a spot in there). Moving along the line or back is free.
        const za = p.z * p.side;
        const toSpotIn = !!lock && !!tg && tg.fz * p.side < LINE_STOP;
        const brake = as > 0 && za >= LINE_STOP - 0.02 && !toSpotIn && !this.kitchenBall(p);
        const atLine = za <= LINE_STOP + 0.02;
        this.lineHeld[p.id] = false;
        if (brake) {
          // (eases into the line: the speed towards the net is what still stops in the room left)
          const cap = Math.sqrt(2 * HUMAN_FEET.park * Math.max(0, za - LINE_STOP));
          if (-wz * p.side > cap) {
            wz = -p.side * cap;
            if (atLine && k >= 0.2) this.lineHeld[p.id] = true;
          }
        }
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
        if (brake && p.z * p.side < LINE_STOP) {
          p.z = p.side * LINE_STOP;
          if (p.vz * p.side < 0) p.vz = 0;
        }
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
        // the depth the rest of the code reads (kitchen line, transition, back)
        const d = Math.abs(p.z);
        p.depth = d < 3.4 ? 2 : d < 5.4 ? 1 : 0;
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
        } else if (ball && r?.last && r.last.team === p.team && !this.placed[p.id]) {
          // waiting for the reply: shade towards where the ball is (a placed player already waits where the reply's
          // angles say)
          tx = Math.max(-2.2, Math.min(2.2, p.homeX * 0.5 + ball.x * 0.45));
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
      // never past the net
      if (p.z * p.side < 0.4) {
        p.z = p.side * 0.4;
        p.vz = 0;
      }
    }
  }

  // ------------------------------------------------------------------ points
  private endPoint(winner: 0 | 1, reason: PointReason, fault: number | null, t: number) {
    const r = this.rally!;
    this.t = t;
    for (const p of this.players) p.plan = null;
    this.targets.length = 0;
    this.locks.length = 0;
    this.stats.rallies++;
    this.stats.longest = Math.max(this.stats.longest, r.shots);
    if (fault !== null) {
      this.stats.errors[this.players[fault].team]++;
      this.stats.errorsBy[fault]++;
    } else this.stats.winners[winner]++;
    let sideOut = false;
    let handOver = false;
    let withheld = false;
    if (this.doubles) {
      const res = this.rotate(winner);
      sideOut = res.sideOut;
      handOver = res.handOver;
      withheld = res.withheld;
    } else if (this.rules.scoring === 'rally') {
      this.score[winner]++;
      sideOut = winner !== this.serverTeam;
      this.serverTeam = winner;
    } else if (winner === this.serverTeam) this.score[winner]++;
    else {
      sideOut = true;
      this.serverTeam = winner;
    }
    const feet = reason === 'kitchen' && fault !== null ? { feet: { x: this.players[fault].x, z: this.players[fault].z } } : {};
    this.events.push({ type: 'point', winner, reason, fault, rally: r.shots, sideOut, ...(handOver ? { handOver } : {}), ...(withheld ? { withheld } : {}), ...feet });
    const [a, b] = this.score;
    if ((a >= this.rules.to || b >= this.rules.to) && Math.abs(a - b) >= 2) {
      this.winner = a > b ? 0 : 1;
      this.phase = 'over';
      this.events.push({ type: 'over', winner: this.winner });
      return;
    }
    this.phase = 'dead';
    this.pointAt = t;
    this.deadUntil = t + DEAD_TIME;
  }

  /**
   * Doubles serve rotation after a rally won by `winner` (USA Pickleball rules; positions follow from rightOf):
   *  · the serving team wins: a point, and the same server serves again from the other court (they swap sides);
   *  · side-out scoring, server 1 loses: no point, the partner serves (server 2) from where they stand;
   *  · otherwise a side out: the other team serves, first from the right court (server 1). In rally scoring the
   *    receiving team also gets the point, unless it would win them the game: the game can only be won serving.
   */
  private rotate(winner: 0 | 1): { sideOut: boolean; handOver: boolean; withheld: boolean } {
    if (winner === this.serverTeam) {
      this.score[winner]++;
      return { sideOut: false, handOver: false, withheld: false };
    }
    if (this.rules.scoring === 'sideout' && this.serverNum === 1) {
      this.serverNum = 2;
      this.serverId = this.mate(this.server()).id;
      return { sideOut: false, handOver: true, withheld: false };
    }
    let withheld = false;
    if (this.rules.scoring === 'rally') {
      const a = this.score[winner] + 1;
      const b = this.score[winner === 0 ? 1 : 0];
      if (a >= this.rules.to && a - b >= 2) withheld = true;
      else this.score[winner] = a;
    }
    this.serverTeam = winner;
    this.serverNum = 1;
    this.serverId = this.rightOf(winner).id;
    return { sideOut: true, handOver: false, withheld };
  }

  private deadBounces(t1: number) {
    const s = this.deadSeg!;
    const tg = groundTime(s);
    if (tg <= t1 && tg > this.t - 1e-6) {
      const v = velAt(s, tg);
      if (Math.abs(v.y) > 0.6) this.deadSeg = bounce(s, tg);
      else {
        // rolling to a stop
        const p = posAt(s, tg);
        this.deadSeg = { ...seg(tg, { x: p.x, y: R, z: p.z }, { x: v.x * 0.6, y: 0, z: v.z * 0.6 }), roll: true };
      }
    }
  }

  /** Is the incoming ball the human's to hit (for the input ring)? */
  humanPlan(): { p: Player; plan: Plan } | null {
    for (const p of this.players) if (p.human && p.plan) return { p, plan: p.plan };
    return null;
  }

  /**
   * Training (src/sim/drill.ts): player `pid` (the ball machine) puts a ball in play from `from`, as shot number
   * `shots` of a rally (at least 2: no serve rules; 2 is a return, so the reply must bounce; from 3 on anything goes).
   * Whatever was going on stops (a dead ball, a serve being set up). The ball is launched like any shot, so the
   * receiver gets the suggested spot, the assist and the timing ring as in a match.
   */
  feed(pid: number, from: Vec3, spec: ShotSpec, shots = 4) {
    const p = this.players[pid];
    for (const q of this.players) q.plan = null;
    this.deadSeg = null;
    this.windup = null;
    this.servePending = false;
    this.targets.length = 0;
    this.locks.length = 0;
    this.phase = 'rally';
    // (a rally already `shots − 1` shots long, the ball still at the mouth of the machine: launch counts this one)
    this.rally = { shots: Math.max(2, shots) - 1, last: null, bounces: 0, seg: seg(this.t, from, { x: 0, y: 0, z: 0 }), tNet: null, netDone: true, tGround: Infinity, serveHalf: 1 };
    p.lastHit = { t: this.t, kind: spec.kind, hand: 1, overhead: false, timing: spec.timing };
    this.launch(p, from, spec, false);
  }

  /**
   * Training: no ball in play for `sec` seconds (the players move freely), then the serve is set up as usual unless a
   * ball is fed before. (Match.hurry would cut it short: the training does not call it between fed balls.)
   */
  idle(sec: number) {
    for (const q of this.players) q.plan = null;
    this.rally = null;
    this.deadSeg = null;
    this.windup = null;
    this.targets.length = 0;
    this.locks.length = 0;
    this.phase = 'dead';
    this.pointAt = this.t;
    this.deadUntil = this.t + sec;
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
