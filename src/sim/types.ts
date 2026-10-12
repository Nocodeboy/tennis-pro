import type { Side } from './court';

/**
 * The shots. Pickleball's names are kept where the shot is the same idea (the engine came from there):
 *  · dink: the soft, low ball at the feet of a player at the net (padel's «chiquita»), or a soft volley dropped short;
 *  · drop: a soft ball from the back that dies short («dejada»);
 *  · speedup: a hard volley at the net («volea» attacking);
 *  · bandeja: the controlled overhead that keeps the net (sliced, deep, not too fast);
 *  · vibora: the aggressive sliced overhead, angled to the side glass;
 *  · smash: the flat overhead («remate»), hard enough to go out of the court off the back glass («por 3»);
 *  · bajada: the attack on a ball that comes back high off the back glass («bajada de pared»), hit down and hard.
 */
export type ShotKind = 'serve' | 'return' | 'drive' | 'dink' | 'drop' | 'lob' | 'smash' | 'bandeja' | 'vibora' | 'bajada' | 'speedup' | 'auto';
/**
 * A remate looking for the point off the walls (ShotSpec.special): «por 3» (flat, hard and steep: it bounces high and
 * leaves the court over the walls) or «por 4» (with topspin: it bounces, comes off the back glass and goes back over
 * the net to the hitter's side).
 */
export type Special = 'por3' | 'por4';
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
  /** a remate looking for «por 3» or «por 4» (see Special) */
  special?: Special;
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
  /**
   * the wall the ball last came off since it bounced ('back': the back glass, 'side': a side wall); absent: it has not
   * met one. A ball off the back glass met high at the back is a bajada (brain.ts, isBajada).
   */
  wall?: 'back' | 'side';
  /**
   * CPU players: their call on a ball that allows a bajada, made when they set off for it (brain.ts, AIController.read):
   * a bajada or not. The view shows that swing from the start and the hit keeps to it. Absent: not decided (the human
   * decides at the release).
   */
  bajada?: boolean;
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
}

/**
 * Why a point ended.
 *  · net: into the net · out: over the walls without bouncing in · wall: it hit the other side's wall or fence before
 *    bouncing (a fault of the hitter) · doubleFault: two faults on the serve · twoBounce: the return of serve was
 *    volleyed (it must bounce)
 *  · winner: nobody had a go at it · miss: the receiver went for it and did not get there · letGo: he was there and
 *    let it go · exit: after bouncing in it left the court over the walls («por 3») · back: after bouncing in it went
 *    back over the net to the hitter's side («por 4»)
 */
export type PointReason = 'net' | 'out' | 'wall' | 'doubleFault' | 'twoBounce' | 'winner' | 'miss' | 'letGo' | 'exit' | 'back';
/** a serve fault: out of the box, into the net, or into the fence after the bounce */
export type ServeFault = 'serveOut' | 'serveNet' | 'serveFence';

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
  | { type: 'hit'; pid: number; kind: ShotKind; timing: Timing; q: number; x: number; y: number; z: number; speed: number; shot: number; volley: boolean; shank?: boolean; intent?: 'attack' | 'block'; power?: number; special?: Special; clear?: number; tx?: number; tz?: number; pop?: boolean; stretch?: number; avail?: number; vin?: number }
  | { type: 'bounce'; x: number; z: number; good: boolean; first: boolean; close: boolean }
  | { type: 'net'; x: number; y: number; z: number; tape: boolean }
  /** the ball meets a wall: glass (it comes back), mesh (it comes back dead and a little off) */
  | { type: 'wall'; x: number; y: number; z: number; surface: 'glass' | 'mesh'; speed: number }
  /** a serve fault: the first one gives a second serve (`second`), the second one is the point (doubleFault) */
  | { type: 'fault'; pid: number; fault: ServeFault; second: boolean }
  /** the serve touched the net and bounced in the box: it is played again (same serve) */
  | { type: 'let'; pid: number }
  | { type: 'point'; winner: 0 | 1; reason: PointReason; fault: number | null; rally: number }
  /** a game won: the games of each team after it (`tiebreak`: the game was the tie-break) */
  | { type: 'game'; winner: 0 | 1; games: [number, number]; tiebreak: boolean }
  | { type: 'over'; winner: 0 | 1 };

export interface Rules {
  /** games to win the set (the match is one set): 6 is a full set; a tie-break to 7 at games−games */
  games: number;
  /** at 40-40 the next point wins the game («punto de oro»); false: advantages */
  golden: boolean;
}
