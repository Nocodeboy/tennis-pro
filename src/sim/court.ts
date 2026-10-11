// Regulation pickleball court (USA Pickleball / IFP), in metres.
// World axes: x across the court (sidelines at ±W/2), z along it (baselines at ±HL), net at z = 0, y up.
// Team 0 plays the near half (z > 0, side = +1) and faces −z; team 1 the far half (side = −1).

export const W = 6.096; // 20 ft
export const L = 13.411; // 44 ft
export const HL = L / 2;
export const NVZ = 2.1336; // the kitchen: 7 ft each side of the net
export const NET_C = 0.8636; // 34 in at the centre
export const NET_S = 0.9144; // 36 in at the sidelines
export const POST_X = W / 2 + 0.3;
export const R = 0.037; // ball radius (74 mm)
/** half the width of a line: a ball touching the line is in (except the kitchen line on the serve) */
export const LINE = 0.025;

export type Side = 1 | -1;

/** Height of the top of the net tape at x (it sags towards the centre). */
export function netHeight(x: number): number {
  const a = Math.min(1, Math.abs(x) / (W / 2));
  return NET_C + (NET_S - NET_C) * a * a;
}

/** The bounce at (x, z) is inside the half of the court on `side` (lines are in). */
export function inHalf(x: number, z: number, side: Side): boolean {
  return Math.abs(x) <= W / 2 + LINE && z * side >= -LINE && z * side <= HL + LINE;
}

/** In the kitchen (non-volley zone) of `side`: the kitchen line belongs to the kitchen. */
export function inKitchen(z: number, side: Side): boolean {
  const d = z * side;
  return d >= 0 && d <= NVZ + LINE;
}

/**
 * A serve must land in the receiver's diagonal service court: past the kitchen line (touching it is a fault),
 * inside the sideline, the baseline and the centreline (those lines are in).
 * `half` is the sign of x of the target court.
 */
export function inServiceCourt(x: number, z: number, side: Side, half: 1 | -1): boolean {
  const d = z * side;
  if (d < NVZ + LINE || d > HL + LINE) return false;
  if (Math.abs(x) > W / 2 + LINE) return false;
  return x * half >= -LINE;
}

/** How far a bounce is outside the half on `side` (0 when in): for close-call messages. */
export function outBy(x: number, z: number, side: Side): number {
  const ox = Math.max(0, Math.abs(x) - W / 2 - LINE);
  const d = z * side;
  const oz = Math.max(0, d - HL - LINE, -d - LINE);
  return Math.hypot(ox, oz);
}
