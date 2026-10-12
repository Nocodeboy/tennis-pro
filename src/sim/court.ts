// Regulation tennis court (ITF), in metres.
// World axes: x across the court (doubles sidelines at ±W/2), z along it (baselines at ±HL), net at z = 0, y up.
// Team 0 plays the near half (z > 0, side = +1) and faces −z; team 1 the far half (side = −1).
//
// One court for both games: the doubles court (10.97 m) with the singles sidelines inside it (8.23 m). Which lines are
// in play is the match's (COURT.singles, set by Match). The service boxes are the same in both: between the net and
// the service line, from the centre service line to the singles sideline. There are no walls: around the lines there
// is the run-off of a tour court (RUN), and past it the boards of the stands (the ball stops there, nobody runs there).
// The court's surface (hard, clay, grass) changes how the ball comes off the floor (ball.ts, GROUND).

export type Side = 1 | -1;
/** the court's surface: how the ball bounces (ball.ts, GROUND) and how the court is drawn */
export type CourtSurface = 'hard' | 'clay' | 'grass';
export const SURFACES: CourtSurface[] = ['hard', 'clay', 'grass'];

export const L = 23.77;
export const HL = L / 2;
/** doubles width (the full court) and singles width */
export const W_D = 10.97;
export const W_S = 8.23;
/** the width the court is drawn at: the doubles court (the singles lines are inside it) */
export const W = W_D;
/** the service line, this far from the net on each side (the boxes are between it and the net) */
export const SERVICE = 6.4;
/** the net: 0.914 m at the centre (the strap), 1.07 m at the posts */
export const NET_C = 0.914;
export const NET_S = 1.07;
/** the net posts stand 0.914 m outside the doubles sidelines; in singles the net is held up by the singles sticks */
export const POST_X = W_D / 2 + 0.914;
export const STICK_X = W_S / 2 + 0.914;
/** ball radius (a tennis ball is 6.54–6.86 cm across) */
export const R = 0.0335;
/** half the width of a line (lines are 5 cm): a ball touching the line is in */
export const LINE = 0.025;
/** the run-off of a tour court: behind the baselines and outside the doubles sidelines (m) */
export const RUN = { back: 6.4, side: 3.66 };
/** the boards of the stands, where a ball stops (its centre) */
export const BOARDS = { x: W_D / 2 + RUN.side, z: HL + RUN.back };

/** The lines in play for the match being played (Match sets it: singles or doubles). */
export const COURT: { singles: boolean } = { singles: true };

/** Half the width of the court in play (the singles or the doubles sideline). */
export function halfW(singles = COURT.singles): number {
  return (singles ? W_S : W_D) / 2;
}

/**
 * Where the players wait, as distance from the net: 0 back (a step behind the baseline, where a tour player rallies),
 * 1 halfway (around the service line, the approach) and 2 at the net (volleying position).
 */
export const DEPTH_Z = [HL + 0.9, 7.6, 2.9] as const;
/** a player closer to the net than this is "at the net" (volleying) */
export const AT_NET = 5.0;

/** Height of the top of the net tape at x (it sags towards the centre, between the posts or the singles sticks). */
export function netHeight(x: number): number {
  const a = Math.min(1, Math.abs(x) / (COURT.singles ? STICK_X : POST_X));
  return NET_C + (NET_S - NET_C) * a * a;
}

/** The bounce at (x, z) is inside the half of the court on `side` (the lines are in). */
export function inHalf(x: number, z: number, side: Side): boolean {
  return Math.abs(x) <= halfW() + LINE && z * side >= -LINE && z * side <= HL + LINE;
}

/** How far a bounce is outside the half on `side` (0 when in): for close-call messages. */
export function outBy(x: number, z: number, side: Side): number {
  const ox = Math.max(0, Math.abs(x) - halfW() - LINE);
  const d = z * side;
  const oz = Math.max(0, d - HL - LINE, -d - LINE);
  return Math.hypot(ox, oz);
}

/**
 * A serve must bounce in the receiver's diagonal service box: between the net and the service line, from the centre
 * service line to the singles sideline (the lines are in). `half` is the sign of x of the target box.
 */
export function inServiceCourt(x: number, z: number, side: Side, half: 1 | -1): boolean {
  const d = z * side;
  if (d < -LINE || d > SERVICE + LINE) return false;
  if (Math.abs(x) > W_S / 2 + LINE) return false;
  return x * half >= -LINE;
}

/** How far a serve's bounce is outside the box (0 when in): for close-call messages. */
export function serveOutBy(x: number, z: number, side: Side, half: 1 | -1): number {
  const d = z * side;
  const oz = Math.max(0, d - SERVICE - LINE, -d - LINE);
  const ox = Math.max(0, -x * half - LINE, Math.abs(x) - W_S / 2 - LINE);
  return Math.hypot(ox, oz);
}
