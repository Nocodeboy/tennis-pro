// The tournament the ladder is dressed as. PROVISIONAL BRAND: a neutral, made-up padel circuit («PÁDEL · PRO TOUR»)
// until the studio sets the final name and brand. The rivals keep their first name (brain.ts), id and way of playing;
// here they only get a surname, a ranking and a seed so they read like touring pros. The ladder of four pairs is a
// 16-pair draw (round of 16 to final).

import { t } from './i18n';
import type { Pair, Rival } from './sim/brain';

/** the wordmark's big word: the sport, in the language of the screen («PÁDEL» / «PADEL») */
export const brand = () => t('tour.brand');
export const TOUR = 'PRO TOUR';
export const EVENT = 'PRO TOUR FINALS';
/** «Pista Central» / «Centre Court» */
export const court = () => t('tour.court');

interface Profile {
  surname: string;
  /** place in the tour's ranking */
  rank: number;
  /** seed in this event's draw (null: unseeded) */
  seed: number | null;
}
// Names in the manner of the unlicensed Pro Evolution Soccer: each one sounds like a real touring pro without being
// his name (Germán, 11 oct). The ids, styles and skills are the ladder's own. To go fully fictional, change the first
// names in brain.ts (RIVALS, PARTNER) and the surnames here.
const PROFILES: Record<string, Profile> = {
  paco: { surname: 'Navarra', rank: 58, seed: null },
  lola: { surname: 'Chingoto', rank: 23, seed: null },
  bruno: { surname: 'Galván', rank: 9, seed: 6 },
  nuria: { surname: 'Tapira', rank: 4, seed: 3 },
  reina: { surname: 'Coeyo', rank: 1, seed: 1 },
  marta: { surname: 'Di Neno', rank: 31, seed: null },
};
/** the doubles draw's seeds, by pair id */
const PAIR_SEEDS: Record<string, number | null> = { 'paco-lola': null, 'lola-bruno': 4, 'bruno-nuria': 2, 'nuria-reina': 1 };

const ROUNDS = ['round.r64', 'round.r32', 'round.r16', 'round.qf', 'round.sf', 'round.f'];
/** The round of match i of a ladder of n (the last one is the final). */
export function roundName(i: number, n: number): string {
  return t(ROUNDS[Math.max(0, Math.min(ROUNDS.length - 1, ROUNDS.length - n + i))]);
}

const prof = (r: { id: string; name: string }): Profile => PROFILES[r.id] ?? { surname: '', rank: 0, seed: null };
/** «Alejandro Galván» */
export const fullName = (r: { id: string; name: string }) => `${r.name} ${prof(r).surname}`.trim();
/** «Galván» */
export const surname = (r: { id: string; name: string }) => prof(r).surname || r.name;
/** «GALVÁN»: the score bug's name */
export const bugName = (r: { id: string; name: string }) => (prof(r).surname || r.name).toUpperCase();
/** «AG» (a two-word surname: its first word, «MD» for Martín Di Neno) */
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
