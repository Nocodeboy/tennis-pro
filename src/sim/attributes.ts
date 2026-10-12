// Players' attributes, 0 … 99, the way a sports game shows them on a player card. They are not decoration: each one
// moves the player's game (brain.ts maps them onto Skill and Mover with skillFrom, and onto the human's controller
// with humanSkill; docs/notas-03-simulacion.md has the table).
//  · pot (potencia): pace of drives, volleys and remates; how often a remate goes «por 3» / «por 4»
//  · con (control): contact quality, how tight the spread of the ball is
//  · vel (velocidad): top speed and first step
//  · ref (reflejos): reaction, reading the ball, volleys and blocks at the net
//  · rem (remate): overheads: bandeja, víbora, remate, their reach and jump
//  · par (pared): defence off the glass: salidas de pared and bajadas
//  · tq (toque): soft game: chiquitas, dejadas, globos

export interface Attributes {
  pot: number;
  con: number;
  vel: number;
  ref: number;
  rem: number;
  par: number;
  tq: number;
}

/** the order they are shown in, and their i18n keys (attr.<key> / attr.<key>.short) */
export const ATTR_KEYS: (keyof Attributes)[] = ['pot', 'con', 'vel', 'ref', 'rem', 'par', 'tq'];

/** The overall rating (media): the mean, the way a card shows one number. */
export function overall(a: Attributes): number {
  return Math.round(ATTR_KEYS.reduce((s, k) => s + a[k], 0) / ATTR_KEYS.length);
}

/**
 * The human's player: a club pro (overall 73), a little more power and overhead than control, average off the glass.
 * His controller reads them (brain.ts, humanSkill); also exported from brain.ts.
 */
export const HUMAN_ATTRS: Attributes = { pot: 74, con: 72, vel: 76, ref: 72, rem: 74, par: 70, tq: 72 };
