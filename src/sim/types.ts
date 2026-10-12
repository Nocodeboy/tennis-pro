import type { CourtSurface, Side } from './court';

/**
 * The shots. The engine's names are kept where the shot is the same idea (it came from pickleball and padel):
 *  · serve: the serve, overhead from behind the baseline (flat, sliced or kick: ShotSpec.spin);
 *  · return: the return of serve;
 *  · drive: a groundstroke with topspin, forehand or backhand («golpe de fondo»), and the passing shot;
 *  · slice: the sliced groundstroke («cortado»): low, with backspin, to defend at a stretch or to approach;
 *  · dink: a soft volley dropped short («dejada de volea»), or a soft, low ball at the feet of a player at the net;
 *  · drop: a soft ball from the back that dies short («dejada»);
 *  · lob: the lob («globo»), defensive (high) or with topspin over a player at the net;
 *  · smash: the overhead («remate»);
 *  · speedup: a firm volley at the net («volea»);
 *  · auto: the block, the reflex volley or the automatic safe ball.
 */
export type ShotKind = 'serve' | 'return' | 'drive' | 'slice' | 'dink' | 'drop' | 'lob' | 'smash' | 'speedup' | 'auto';
/** how well the swing was timed (the human's release, or the AI's roll) */
export type Timing = 'perfect' | 'good' | 'early' | 'late' | 'auto';

export interface ShotSpec {
  kind: ShotKind;
  tx: number;
  tz: number;
  /** height over the net tape the shot is meant to have */
  clear: number;
  /** 0 … 1: how clean the contact is (scatter of the target and of the height over the net) */
  q: number;
  timing: Timing;
  /** multiplies the fastest allowed flight time (< 1 = harder hit) */
  pace?: number;
  /** −1 … 1: swung early (pulled across the body) … late (pushed wide); 0 = on time */
  late?: number;
  /** 0 … 1: rally pressure on this shot: the more, the likelier it sits up (high and long) for the other side */
  pop?: number;
  /**
   * 0 … 1: chance the contact fails outright (off the frame: into the net or long), the awkwardness left over once the
   * quality is at its floor (a smash at the feet with no time). See brain.ts, shankOf.
   */
  shank?: number;
  /**
   * The paddle never meets the ball (a hard ball at the body with no time, ShotSpec of the CPU only, brain.ts WHIFF):
   * it goes past, still live (the partner may get it; a second bounce is a winner, «miss»).
   */
  whiff?: boolean;
  /**
   * The human's gesture (docs/notas-08-ataque.md): 'attack' a flick (or F, the right button): a speed-up or a smash;
   * 'block' a tap: a soft block or reset into the kitchen. None: an aimed shot, the automatic one or the CPU's.
   */
  intent?: 'attack' | 'block';
  /**
   * 0 … 1: how hard the player meant it (the human: the speed of the release stroke; 0.5 a plain release, 1 the
   * fastest flick). Absent: 0.5. Harder is faster and riskier.
   */
  power?: number;
  /**
   * −1 … 1: the spin, when the shot asks for its own (a serve: flat, sliced or kick; a drive with more or less topspin).
   * Absent: the kind's (match.ts, SPIN).
   */
  spin?: number;
}

/** Where and when a player will meet the incoming ball. */
export interface Plan {
  t: number;
  bx: number;
  by: number;
  bz: number;
  /** where the feet must be */
  fx: number;
  fz: number;
  volley: boolean;
  overhead: boolean;
  /** +1 forehand, −1 backhand */
  hand: 1 | -1;
  /** false: the player cannot get there in time (runs anyway and misses) */
  reach: boolean;
  /** an illegal contact (the return of serve volleyed): a fault */
  oops: boolean;
  /** manual players: how far they reach for it (0 = right there, 1 = full lunge) */
  stretch?: number;
  /** a volley of a ball that would land out (better let it go) */
  out?: boolean;
  /** CPU players: seconds in hand when the contact was planned (time to set up; brain.ts CARD) */
  spare?: number;
}

export interface Player {
  id: number;
  team: 0 | 1;
  side: Side;
  human: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  speed: number;
  reaction: number;
  plan: Plan | null;
  /** sim time from which the player starts moving to the plan (reaction delay) */
  moveFrom: number;
  /** where to stand while the ball is away */
  homeX: number;
  homeZ: number;
  /** 0 back · 1 halfway · 2 at the net (court.ts, DEPTH_Z) */
  depth: 0 | 1 | 2;
  lastHit: { t: number; kind: ShotKind; hand: 1 | -1; overhead: boolean; timing: Timing } | null;
  /** looks like: index into the outfits of the view */
  look: number;
  /** doubles: the half of the court this player covers (sign of x); the partner covers the other one */
  lane: 1 | -1;
  /**
   * 0 … 1: how fresh the legs are (match.ts, FIT): it drains with the metres run (sprinting more) and the hard swings,
   * comes back in the pauses and at the end of each game, and never quite all the way in a long match. Tired, a player
   * is slower, reacts later (the CPU) and hits a little less cleanly.
   */
  fit: number;
  /** metres run in the match (the broadcast's «distance covered») */
  dist: number;
}

/**
 * Why a point ended.
 *  · net: into the net · out: it bounced out of the lines (or hit the boards, a chair or a player outside the court
 *    before bouncing) · doubleFault: two faults on the serve · twoBounce: the return of serve was volleyed (it must
 *    bounce)
 *  · winner: nobody had a go at it (an ace, when it is the serve) · miss: the receiver went for it and did not get
 *    there · letGo: he was there and let it go
 *  · body: the live ball touched a player of the receiving team (ITF: the other side's point; the volley at the body).
 *    The point event says who (`touched`)
 */
export type PointReason = 'net' | 'out' | 'doubleFault' | 'twoBounce' | 'winner' | 'miss' | 'letGo' | 'body';
/** a serve fault: out of the box, or into the net */
export type ServeFault = 'serveOut' | 'serveNet';

export type MatchEvent =
  | { type: 'serveSetup'; server: number }
  /** the server starts the wind-up: the ball leaves the paddle at `at` */
  | { type: 'serveStart'; pid: number; at: number }
  /**
   * `shank`: the contact went off the frame (ShotSpec.shank): it goes into the net or long.
   * `intent`: the human's attack (a flick) or block (a tap), as in ShotSpec.
   * What the shot was, for explaining the point (read only, nothing in the rules uses them):
   *  · `clear`: height (m) of the ball over the net tape where it crosses (negative: into the net; absent: it never
   *    crosses, e.g. hit from the far side of the net's plane);
   *  · `tx`, `tz`: where it was aimed (before the scatter of the contact);
   *  · `pop`: the rally pressure made it sit up (high and long);
   *  · `stretch`: how far the hitter reached for it (0 … 1, a full lunge);
   *  · `avail`: seconds from the other side's contact to this one (absent for a serve or a fed ball);
   *  · `vin`: speed of the incoming ball at the contact (m/s, along the court).
   */
  | { type: 'hit'; pid: number; kind: ShotKind; timing: Timing; q: number; x: number; y: number; z: number; speed: number; shot: number; volley: boolean; shank?: boolean; intent?: 'attack' | 'block'; power?: number; spin?: number; clear?: number; tx?: number; tz?: number; pop?: boolean; stretch?: number; avail?: number; vin?: number }
  /** `out`: how far out a bad bounce was (m; the close calls and the review) */
  | { type: 'bounce'; x: number; z: number; good: boolean; first: boolean; close: boolean; out?: number }
  | { type: 'net'; x: number; y: number; z: number; tape: boolean }
  /** a serve fault: the first one gives a second serve (`second`), the second one is the point (doubleFault) */
  | { type: 'fault'; pid: number; fault: ServeFault; second: boolean }
  /** the serve touched the net and bounced in the box: it is played again (same serve) */
  | { type: 'let'; pid: number }
  /** `touched`: reason 'body', the player the ball touched */
  | { type: 'point'; winner: 0 | 1; reason: PointReason; fault: number | null; rally: number; touched?: number }
  /** a game won: the games of each team after it (`tiebreak`: the game was the tie-break) */
  | { type: 'game'; winner: 0 | 1; games: [number, number]; tiebreak: boolean }
  /**
   * a set won: its games, the sets of each team after it and whether it ended in the tie-break. The last set of the
   * match fires it too, before `over` (the broadcast's strap says «match», not «set», then)
   */
  | { type: 'set'; winner: 0 | 1; games: [number, number]; sets: [number, number]; tiebreak: boolean }
  | { type: 'over'; winner: 0 | 1 };

export interface Rules {
  /** games to win a set: 6 is a full set; a tie-break to 7 at games−games */
  games: number;
  /** at deuce the next point wins the game («punto decisivo», no-ad); false: advantages, the tour's rule */
  golden: boolean;
  /** sets of the match: 1 (one set, the default), 3 (the best of three) or 5 (the best of five, the Grand Slams) */
  sets?: 1 | 3 | 5;
  /** the court's surface: hard (the default), clay or grass (ball.ts, GROUND) */
  surface?: CourtSurface;
}
