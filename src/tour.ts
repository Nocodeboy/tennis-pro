// The tournament the ladders are dressed as. PROVISIONAL BRAND: a neutral, made-up pro circuit («PRO TOUR») until the
// client sets the final name and brand. The rivals keep their first name, id and way of playing; here they only get
// a made-up surname, a ranking and a seed so they read like touring pros. The ladder of five rivals is a 32-player
// draw (first round to final), the doubles ladder of four pairs a 16-team draw (round of 16 to final).

import { t } from './i18n';
import type { Pair, Rival } from './sim/brain';

export const TOUR = 'PRO TOUR';
export const EVENT = 'PRO TOUR FINALS';
export const COURT = 'Center Court';

interface Profile {
  surname: string;
  /** place in the tour's ranking */
  rank: number;
  /** seed in this event's draw (null: unseeded) */
  seed: number | null;
}
// Surnames in the manner of the unlicensed Pro Evolution Soccer: each one sounds like a real touring pro without
// being his name (Germán, 11 oct). The ids, styles and skills are the ladder's own. To go fully fictional, change
// the first names in brain.ts (RIVALS, PARTNER) and the surnames here.
const PROFILES: Record<string, Profile> = {
  paco: { surname: 'Numan', rank: 58, seed: null },
  lola: { surname: 'Daesku', rank: 23, seed: null },
  bruno: { surname: 'Patrikin', rank: 9, seed: 6 },
  nuria: { surname: 'Alzon', rank: 4, seed: 3 },
  reina: { surname: 'Jhons', rank: 1, seed: 1 },
  marta: { surname: 'Tardeo', rank: 31, seed: null },
};
/** the doubles draw's seeds, by pair id */
const PAIR_SEEDS: Record<string, number | null> = { 'paco-lola': null, 'lola-bruno': 4, 'bruno-nuria': 2, 'nuria-reina': 1 };

const ROUNDS = ['round.r64', 'round.r32', 'round.r16', 'round.qf', 'round.sf', 'round.f'];
/** The round of match i of a ladder of n (the last one is the final). */
export function roundName(i: number, n: number): string {
  return t(ROUNDS[Math.max(0, Math.min(ROUNDS.length - 1, ROUNDS.length - n + i))]);
}

const prof = (r: { id: string; name: string }): Profile => PROFILES[r.id] ?? { surname: '', rank: 0, seed: null };
/** «Hayden Patrikin» */
export const fullName = (r: { id: string; name: string }) => `${r.name} ${prof(r).surname}`.trim();
/** «Patrikin» */
export const surname = (r: { id: string; name: string }) => prof(r).surname || r.name;
/** «VIDAL»: the score bug's name */
export const bugName = (r: { id: string; name: string }) => (prof(r).surname || r.name).toUpperCase();
/** «BV» */
export const initials = (r: { id: string; name: string }) => `${r.name[0]}${prof(r).surname[0] ?? ''}`.toUpperCase();
export const seedOf = (r: Rival): number | null => prof(r).seed;
export const pairSeed = (p: Pair): number | null => PAIR_SEEDS[p.id] ?? null;
/** «Cabeza de serie 6 · Ranking 9» (or just the ranking) */
export function playerInfo(r: Rival): string {
  const p = prof(r);
  const rank = t('tour.rank', { n: p.rank });
  return p.seed ? `${t('tour.seed', { n: p.seed })} · ${rank}` : rank;
}
export function pairInfo(p: Pair): string {
  const s = pairSeed(p);
  return s ? t('tour.seed', { n: s }) : t('tour.unseeded');
}
/** «[6] » before a name in the draw (nothing for an unseeded player) */
export const seedTag = (s: number | null) => (s ? `<span class="seed">${s}</span>` : '');
