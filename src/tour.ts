// The tournament the ladders are dressed as. PROVISIONAL BRAND: a neutral, made-up tennis circuit («TENIS · PRO TOUR»,
// the event «PRO TOUR OPEN») until the studio sets the final name and brand. The rivals keep their first name
// (brain.ts), id and way of playing; here they get a surname, a ranking and a seed so they read like touring pros.
// Singles: the ladder of five rivals is a 32-player draw (first round to the final). Doubles: the four pairs are a
// 16-pair draw (round of 16 to the final). Each event is played on the surface the player picks (Settings).

import { t } from './i18n';
import type { CourtSurface } from './sim/court';
import type { Pair, Rival } from './sim/brain';

/** the wordmark's big word: the sport, in the language of the screen («TENIS» / «TENNIS») */
export const brand = () => t('tour.brand');
export const TOUR = 'PRO TOUR';
export const EVENT = 'PRO TOUR OPEN';
/** «Pista Central» / «Centre Court» */
export const court = () => t('tour.court');
/** «Tierra batida» / «Clay» */
export const surfaceName = (s: CourtSurface) => t('surf.' + s);
/** «Pista Central · Tierra batida»: where the match is played, as the TV and the match card say it */
export const venue = (s: CourtSurface) => `${court()} · ${surfaceName(s)}`;
/** the size of each draw (players in singles, pairs in doubles) */
export const DRAW = { singles: 32, doubles: 16 } as const;

interface Profile {
  surname: string;
  /** place in the tour's singles ranking */
  rank: number;
  /** seed in this event's singles draw (null: unseeded) */
  seed: number | null;
  /** a doubles specialist: his place in the doubles ranking (shown instead of the singles one) */
  doubles?: number;
}
// Names in the manner of the unlicensed Pro Evolution Soccer: each one sounds like a real touring pro without being his
// name (as in the padel game, Germán, 11 oct; the table is docs/tenis/contrato.md). LEGAL RISK, as in the padel game:
// they evoke real players; for a published version the studio decides. To go fully fictional, change the first names
// in brain.ts (RIVALS, PARTNER) and the surnames here. The ids, styles and skills are the ladder's own.
const PROFILES: Record<string, Profile> = {
  // (Casper Ruud) heavy topspin from the back
  paco: { surname: 'Rud', rank: 41, seed: null },
  // (Alex de Minaur) runs everything down
  lola: { surname: 'de Miñor', rank: 17, seed: 8 },
  // (Daniil Medvedev) flat and deep, a big serve
  bruno: { surname: 'Medvédiev', rank: 6, seed: 4 },
  // (Jannik Sinner) hits early and hard
  nuria: { surname: 'Siner', rank: 2, seed: 2 },
  // (Carlos Alcaraz) does it all
  reina: { surname: 'Alcarás', rank: 1, seed: 1 },
  // (Marcel Granollers) your doubles partner, a specialist
  marta: { surname: 'Granoyers', rank: 112, seed: null, doubles: 4 },
};
/** the doubles draw's seeds, by pair id */
const PAIR_SEEDS: Record<string, number | null> = { 'paco-lola': null, 'lola-bruno': 4, 'bruno-nuria': 2, 'nuria-reina': 1 };

const ROUNDS = ['round.r64', 'round.r32', 'round.r16', 'round.qf', 'round.sf', 'round.f'];
/**
 * The round of match i of a ladder of n (the last one is the final): five matches are a 32 draw (first round, round of
 * 16, quarterfinal, semifinal, final), four a 16 draw (round of 16 to the final).
 */
export function roundName(i: number, n: number): string {
  return t(ROUNDS[Math.max(0, Math.min(ROUNDS.length - 1, ROUNDS.length - n + i))]);
}

const prof = (r: { id: string; name: string }): Profile => PROFILES[r.id] ?? { surname: '', rank: 0, seed: null };
/** «Carlos Alcarás» */
export const fullName = (r: { id: string; name: string }) => `${r.name} ${prof(r).surname}`.trim();
/** «Alcarás» */
export const surname = (r: { id: string; name: string }) => prof(r).surname || r.name;
/** «ALCARÁS»: the score bug's name («DE MIÑOR») */
export const bugName = (r: { id: string; name: string }) => (prof(r).surname || r.name).toUpperCase();
/** «CA» (a two-word surname: its last word, «ÁM» for Álex de Miñor) */
export const initials = (r: { id: string; name: string }) => {
  const s = prof(r).surname.split(' ');
  return `${r.name[0]}${s[s.length - 1]?.[0] ?? ''}`.toUpperCase();
};
export const seedOf = (r: Rival): number | null => prof(r).seed;
export const pairSeed = (p: Pair): number | null => PAIR_SEEDS[p.id] ?? null;
/** «Cabeza de serie 4 · Ranking 6» (or just the ranking; a doubles specialist: his doubles ranking) */
export function playerInfo(r: Rival): string {
  const p = prof(r);
  if (p.doubles) return t('tour.rankDoubles', { n: p.doubles });
  const rank = t('tour.rank', { n: p.rank });
  return p.seed ? `${t('tour.seed', { n: p.seed })} · ${rank}` : rank;
}
export function pairInfo(p: Pair): string {
  const s = pairSeed(p);
  return s ? t('tour.seed', { n: s }) : t('tour.unseeded');
}
/** «[4] » before a name in the draw (nothing for an unseeded player) */
export const seedTag = (s: number | null) => (s ? `<span class="seed">${s}</span>` : '');
