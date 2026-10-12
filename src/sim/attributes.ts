// Players' attributes, 0 … 99, the way a sports game shows them on a player card. They are not decoration: each one
// moves the player's game (brain.ts maps them onto Skill and Mover with skillFrom, and onto the human's controller
// with humanSkill; docs/tenis/notas-01-simulacion.md has the table).
//  · pot (potencia): pace of groundstrokes, volleys and smashes
//  · con (control): contact quality, how tight the spread of the ball is
//  · vel (velocidad): top speed and first step
//  · ref (reflejos): reaction, reading the ball, the return of serve, fast volleys and blocks
//  · saq (saque): the serve: its pace, where it goes and how many first serves go in
//  · red (red): the net game: volleys and overheads, their reach and jump, and how readily they come in
//  · tq (toque): soft game: drop shots, lobs, slices and soft volleys

export interface Attributes {
  pot: number;
  con: number;
  vel: number;
  ref: number;
  saq: number;
  red: number;
  tq: number;
}

/** the order they are shown in, and their i18n keys (attr.<key> / attr.<key>.short) */
export const ATTR_KEYS: (keyof Attributes)[] = ['pot', 'con', 'vel', 'ref', 'saq', 'red', 'tq'];

/** The overall rating (media): the mean, the way a card shows one number. */
export function overall(a: Attributes): number {
  return Math.round(ATTR_KEYS.reduce((s, k) => s + a[k], 0) / ATTR_KEYS.length);
}

/**
 * The human's player: a tour player on the way up (overall 73), a little more power and pace than control. His
 * controller reads them (brain.ts, humanSkill); also exported from brain.ts.
 */
export const HUMAN_ATTRS: Attributes = { pot: 74, con: 72, vel: 76, ref: 72, saq: 73, red: 72, tq: 72 };
