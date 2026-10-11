// Regulation padel court (FIP), in metres.
// World axes: x across the court (side walls at ±W/2), z along it (back walls at ±HL), net at z = 0, y up.
// Team 0 plays the near half (z > 0, side = +1) and faces −z; team 1 the far half (side = −1).
//
// The walls (FIP rules, the usual panoramic court):
//  · back walls (z = ±HL): glass up to 3 m, wire mesh from 3 to 4 m;
//  · side walls (x = ±W/2), measured from the back wall: the first 2 m are glass up to 3 m with mesh up to 4 m; the
//    next 2 m are glass up to 2 m (the step) with mesh up to 3 m; the rest, the 12 m around the net, is mesh up to 3 m
//    (the doors are in it, closed with mesh: the ball plays them as mesh).
// Above the top of a wall the court is open: a ball that goes over leaves the court.

export const W = 10;
export const L = 20;
export const HL = L / 2;
/** the service line, this far from the net on each side (the boxes are between it and the net) */
export const SERVICE = 6.95;
export const NET_C = 0.88; // at the centre
export const NET_S = 0.92; // at the posts
/** the net posts stand at the side walls */
export const POST_X = W / 2;
export const R = 0.0335; // ball radius (a padel ball is 6.35–6.77 cm across)
/** half the width of a line: a ball touching the line is in */
export const LINE = 0.025;

/** The walls (see above). Lengths along the side walls are measured from the back wall. */
export const WALL = {
  /** back wall and the first stretch of the side walls: glass to `glassH`, mesh to `topH` */
  glassH: 3,
  topH: 4,
  /** the side glass: `glassLen` m of full-height glass, then `stepLen` m of the step (glass to `stepH`, mesh to `stepTopH`) */
  glassLen: 2,
  stepLen: 2,
  stepH: 2,
  stepTopH: 3,
  /** the side mesh around the net */
  meshH: 3,
};

/**
 * Where the players wait, as distance from the net: 0 back (about 1.2 m off the back glass), 1 halfway (around the
 * service line) and 2 at the net (volleying position).
 */
export const DEPTH_Z = [8.8, 6.3, 3.0] as const;
/** a player closer to the net than this is "at the net" (volleying) */
export const AT_NET = 4.6;

export type Side = 1 | -1;
export type Surface = 'glass' | 'mesh' | 'open';

/** Height of the top of the net tape at x (it sags towards the centre). */
export function netHeight(x: number): number {
  const a = Math.min(1, Math.abs(x) / (W / 2));
  return NET_C + (NET_S - NET_C) * a * a;
}

/** Side wall, `d` metres from the net (|z|): how high the glass goes (0: mesh from the ground). */
export function sideGlassTop(d: number): number {
  const fromBack = HL - Math.abs(d);
  if (fromBack <= WALL.glassLen) return WALL.glassH;
  if (fromBack <= WALL.glassLen + WALL.stepLen) return WALL.stepH;
  return 0;
}

/** Side wall, `d` metres from the net (|z|): how high the wall goes (glass and mesh). */
export function sideTop(d: number): number {
  const fromBack = HL - Math.abs(d);
  return fromBack <= WALL.glassLen ? WALL.topH : fromBack <= WALL.glassLen + WALL.stepLen ? WALL.stepTopH : WALL.meshH;
}

/** What a ball meets at a side wall, `d` from the net, at height y (of its centre). */
export function sideSurface(d: number, y: number): Surface {
  if (y > sideTop(d)) return 'open';
  return y <= sideGlassTop(d) ? 'glass' : 'mesh';
}

/** What a ball meets at a back wall at height y (of its centre). */
export function backSurface(y: number): Surface {
  if (y > WALL.topH) return 'open';
  return y <= WALL.glassH ? 'glass' : 'mesh';
}

/** The bounce at (x, z) is inside the half of the court on `side` (between the walls; there are no out lines). */
export function inHalf(x: number, z: number, side: Side): boolean {
  return Math.abs(x) <= W / 2 && z * side >= -LINE && z * side <= HL;
}

/**
 * A serve must bounce in the receiver's diagonal service box: between the net and the service line, from the
 * centre line to the side wall (the lines are in). `half` is the sign of x of the target box.
 */
export function inServiceCourt(x: number, z: number, side: Side, half: 1 | -1): boolean {
  const d = z * side;
  if (d < -LINE || d > SERVICE + LINE) return false;
  if (Math.abs(x) > W / 2) return false;
  return x * half >= -LINE;
}

/** How far a serve's bounce is outside the box (0 when in): for close-call messages. */
export function serveOutBy(x: number, z: number, side: Side, half: 1 | -1): number {
  const d = z * side;
  const oz = Math.max(0, d - SERVICE - LINE, -d - LINE);
  const ox = Math.max(0, -x * half - LINE);
  return Math.hypot(ox, oz);
}
