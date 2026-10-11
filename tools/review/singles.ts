// How singles is played (docs/notas-08-individual.md): the thumb bot (tools/thumb.ts) against each rival, per level.
//  · ladder: % of matches and points won, minutes per match (mean, min–max);
//  · rally length: median, p90 and longest point (shots per point);
//  · the shot mix, the human's and the CPU's: return, drive (from the back or the transition, not a passing shot),
//    passing shot (a drive from the back half at a player up at the net), dink/drop, lob, speed-up, smash, the
//    automatic deep reset; and on top of that how many were volleys;
//  · where the CPU hits from (back, transition, kitchen line) and whether it goes up after its return / stays back
//    after its serve;
//  · how the points end: a winner of each kind of shot (or a ball the other one ran for and missed), a forced error
//    (off an attack, a passing shot, a lob or a shank), an unforced one, a fault (serve, kitchen, two bounces).
// npx tsx tools/review/singles.ts [matches per pairing = 12] [assist = 1]
// Env: LEVELS=novato,medio · RIVALS=0,4 · TUNE='{"2":{"q":0.8}}' · SINGLES='{…}' (src/sim/brain.ts) · MATRIX=1 (one line
// per level) · VARIANTS=file.json (several game plans or skills in one run, see the end) · AUTOPUT=0 (the human's
// automatic shot does not smash by itself) · JSON=1 (one line
// of raw numbers per cell, for comparing runs) · BRIEF=1 (one line per cell) · TRACE=n (the first n points of TLEN or
// more shots, shot by shot: who, kind, from where, volley, quality, pace, and where the other one stood).
import * as brain from '../../src/sim/brain';
import { readFileSync } from 'node:fs';
import { AIController, AUTO_SHOT, HUMAN_REACTION, HUMAN_SPEED, RIVALS, type Skill } from '../../src/sim/brain';
import { Match } from '../../src/sim/match';
import type { MatchEvent, ShotKind } from '../../src/sim/types';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

if (process.env.TUNE) for (const [i, s] of Object.entries(JSON.parse(process.env.TUNE))) Object.assign(RIVALS[Number(i)].skill, s);
// AUTOPUT=0: the human's automatic shot no longer puts a high ball away by itself (what the 0.8 control changes)
if (process.env.AUTOPUT === '0') AUTO_SHOT.putAway = false;
// (SINGLES: the singles game plan of the CPU, src/sim/brain.ts; absent before 0.8)
const SINGLES = (brain as Record<string, unknown>).SINGLES as Record<string, unknown> | undefined;
if (process.env.SINGLES && SINGLES) Object.assign(SINGLES, JSON.parse(process.env.SINGLES));
const N = Number(process.argv[2] ?? 12);
const assist = Number(process.argv[3] ?? 1);
const levels = process.env.LEVELS?.split(',');
const rivals = process.env.RIVALS?.split(',').map(Number);

type Hit = Extract<MatchEvent, { type: 'hit' }> & { opZ: number; opX: number; hz: number };
const CATS = ['resto', 'drive', 'passing', 'dejada', 'globo', 'ataque', 'remate', 'auto'] as const;
type Cat = (typeof CATS)[number];
/** the kind of shot, from the shot and where the two players were */
function cat(h: Hit): Cat {
  const k: ShotKind = h.kind;
  if (k === 'return') return Math.abs(h.opZ) < 3.6 && Math.abs(h.hz) > 4.3 ? 'passing' : 'resto';
  if (k === 'dink' || k === 'drop') return 'dejada';
  if (k === 'lob') return 'globo';
  if (k === 'smash') return 'remate';
  if (k === 'auto') return 'auto';
  if (k === 'speedup') return 'ataque';
  // a drive from the back half at a player up at the net: a passing shot
  if (k === 'drive' && Math.abs(h.opZ) < 3.6 && Math.abs(h.hz) > 4.3) return 'passing';
  return 'drive';
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const q = (a: number[], f: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(f * (a.length - 1))] : 0);

interface Cell {
  wins: number;
  matches: number;
  pts: number;
  won: number;
  lens: number[];
  mins: number[];
  mix: [Record<string, number>, Record<string, number>];
  volleys: [number, number];
  shots: [number, number];
  cpuFrom: Record<string, number>;
  /** CPU's second contact of the point: up at the net after its return / still back after its serve */
  cpuUpAfterReturn: [number, number];
  cpuBackAfterServe: [number, number];
  ends: Record<string, number>;
  endsBy: [Record<string, number>, Record<string, number>];
  /** the shots of the long points (18 or more), by where the two stood: both up, one up, both back */
  longPos: Record<string, number>;
  /** what came of each passing shot, lob and attack (put-away volley, speed-up, smash), by who hit it */
  outc: [Record<string, Record<string, number>>, Record<string, Record<string, number>>];
}
/** the shots whose outcome is followed: a winner, its own error, a forced error of the other one, or returned */
const FOLLOW: Record<string, string> = { passing: 'passing', globo: 'globo', remate: 'ataque', ataque: 'ataque' };

const TRACE = Number(process.env.TRACE ?? 0);
const TLEN = Number(process.env.TLEN ?? 20);
let traced = 0;
function trace(hits: Hit[], e: Extract<MatchEvent, { type: 'point' }>) {
  if (traced >= TRACE || e.rally < TLEN) return;
  // TCAT=passing: only points with a shot of that kind
  if (process.env.TCAT && !hits.some((h) => h.kind !== 'serve' && cat(h) === process.env.TCAT)) return;
  traced++;
  console.log(`  punto de ${e.rally} golpes, gana ${e.winner === 0 ? 'humano' : 'CPU'} (${e.reason}):`);
  for (const h of hits) console.log(`    ${h.shot} ${h.pid === 0 ? 'H' : 'C'} ${h.kind.padEnd(7)} ${cat(h).padEnd(7)} z ${Math.abs(h.hz).toFixed(1).padStart(4)} x ${h.x.toFixed(1).padStart(4)} ${h.volley ? 'V' : ' '} q ${h.q.toFixed(2)} ${h.speed.toFixed(1).padStart(4)} m/s · rival en ${h.opX.toFixed(1)}, ${Math.abs(h.opZ).toFixed(1)}`);
}

function run(lv: string, ri: number): Cell {
  const rv = RIVALS[ri];
  const c: Cell = { wins: 0, matches: N, pts: 0, won: 0, lens: [], mins: [], mix: [{}, {}], volleys: [0, 0], shots: [0, 0], cpuFrom: {}, cpuUpAfterReturn: [0, 0], cpuBackAfterServe: [0, 0], ends: {}, endsBy: [{}, {}], outc: [{}, {}], longPos: {} };
  for (let i = 0; i < N; i++) {
    const seed = 1000 + i * 7919;
    const bot = new ThumbBot(HUMANS[lv], assist, seed + 17);
    const m = new Match(
      [
        { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
        { team: 1, human: false, speed: rv.skill.speed, reaction: rv.skill.reaction, look: rv.look },
      ],
      { scoring: 'rally', to: 11 },
      seed,
    );
    m.setControllers([bot.ctl, new AIController(rv.skill)]);
    bot.attach(m);
    m.start();
    let hits: Hit[] = [];
    let server = -1;
    let g = 0;
    while (m.phase !== 'over' && g++ < 60 * 60 * 40) {
      bot.tick(m);
      m.update(1 / 60);
      bot.events(m.events);
      for (const e of m.events) {
        if (e.type === 'hit') {
          const o = m.players[1 - e.pid];
          const h: Hit = { ...e, opZ: o.z, opX: o.x, hz: e.z };
          if (e.kind === 'serve') {
            server = e.pid;
            hits = [h];
            continue;
          }
          hits.push(h);
          const who = e.pid === 0 ? 0 : 1;
          const k = cat(h);
          c.mix[who][k] = (c.mix[who][k] ?? 0) + 1;
          c.shots[who]++;
          if (e.volley && e.kind !== 'smash') c.volleys[who]++;
          if (who === 1) {
            const za = Math.abs(e.z);
            const from = za < 3.6 ? 'red' : za < 5.4 ? 'transición' : 'fondo';
            c.cpuFrom[from] = (c.cpuFrom[from] ?? 0) + 1;
            // the CPU's second contact of the point
            if (e.shot === 4 && server === 0) {
              c.cpuUpAfterReturn[1]++;
              if (za < 3.6) c.cpuUpAfterReturn[0]++;
            }
            if (e.shot === 3 && server === 1) {
              // (its third shot is from the back by the rules; where is it on its next one?)
            }
            if (e.shot === 5 && server === 1) {
              c.cpuBackAfterServe[1]++;
              if (za > 4.3) c.cpuBackAfterServe[0]++;
            }
          }
        }
        if (e.type === 'point') {
          c.pts++;
          c.lens.push(e.rally);
          if (e.winner === 0) c.won++;
          const last = hits[hits.length - 1];
          const prev = hits[hits.length - 2];
          let end: string;
          if (e.reason === 'serveOut' || e.reason === 'serveKitchen') end = 'falta de saque';
          else if (e.reason === 'kitchen' || e.reason === 'twoBounce' || e.reason === 'letGo') end = 'falta (cocina/doble bote)';
          else if (e.reason === 'winner' || e.reason === 'miss') {
            const k = last ? (last.kind === 'serve' ? 'saque' : cat(last)) : '?';
            end = `ganador ${last?.volley && k !== 'remate' && k !== 'dejada' ? 'volea' : k}`;
          } else {
            // net / out: forced if the ball it answered was an attack, a passing shot, a lob, or the contact shanked
            const pk = prev ? (prev.kind === 'serve' ? 'saque' : cat(prev)) : '';
            const forced = !!last?.shank || (!!prev && (prev.speed >= 13 || pk === 'ataque' || pk === 'remate' || pk === 'passing' || pk === 'globo'));
            end = forced ? 'error forzado' : 'error no forzado';
          }
          c.ends[end] = (c.ends[end] ?? 0) + 1;
          c.endsBy[e.winner][end] = (c.endsBy[e.winner][end] ?? 0) + 1;
          trace(hits, e);
          if (e.rally >= 18)
            for (const h of hits) {
              if (h.kind === 'serve') continue;
              const me = Math.abs(h.hz) < 3.6;
              const op = Math.abs(h.opZ) < 3.6;
              const k = me && op ? 'los dos en la red' : !me && !op ? 'los dos atrás' : (h.pid === 0) === me ? 'humano en la red' : 'CPU en la red';
              c.longPos[k] = (c.longPos[k] ?? 0) + 1;
            }
          // what came of the passing shots, lobs and attacks of this point
          for (let k = 1; k < hits.length; k++) {
            const h = hits[k];
            const f = FOLLOW[cat(h)];
            if (!f) continue;
            const last = k === hits.length - 1;
            const next = k === hits.length - 2;
            const res = last ? (e.reason === 'winner' || e.reason === 'miss' ? 'gana' : e.reason === 'out' || e.reason === 'net' ? 'falla' : 'otro') : next && (e.reason === 'out' || e.reason === 'net') ? 'forzado' : 'vuelve';
            const o = (c.outc[h.pid === 0 ? 0 : 1][f] ??= {});
            o[res] = (o[res] ?? 0) + 1;
          }
          hits = [];
        }
      }
      m.events.length = 0;
    }
    if (m.winner === 0) c.wins++;
    c.mins.push(m.t / 60);
  }
  return c;
}

const mixStr = (o: Record<string, number>, n: number) =>
  CATS.filter((k) => o[k])
    .map((k) => `${k} ${pct(o[k], n)}`)
    .join(' · ');
const top = (o: Record<string, number>, n: number, k = 6) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([a, v]) => `${a} ${pct(v, n)}`)
    .join(' · ');

function table() {
  const totals: { lv: string; rv: string; c: Cell }[] = [];
  for (const lv of Object.keys(HUMANS)) {
    if (levels && !levels.includes(lv)) continue;
    const row: Cell[] = [];
    RIVALS.forEach((rv, ri) => {
      if (rivals && !rivals.includes(ri)) return;
      const c = run(lv, ri);
      row.push(c);
      totals.push({ lv, rv: rv.name, c });
      if (process.env.MATRIX) return;
      const all: Record<string, number> = {};
      for (const k of CATS) all[k] = (c.mix[0][k] ?? 0) + (c.mix[1][k] ?? 0);
      const nAll = c.shots[0] + c.shots[1];
      if (process.env.JSON) {
        console.log(JSON.stringify({ lv, rv: rv.name, wins: pct(c.wins, N), pts: pct(c.won, c.pts), med: q(c.lens, 0.5), p90: q(c.lens, 0.9), max: q(c.lens, 1), min: +(c.mins.reduce((a, b) => a + b, 0) / N).toFixed(1), dink: pct(all.dejada, nAll), mixH: c.mix[0], mixC: c.mix[1], ends: c.ends }));
        return;
      }
      const head = `${lv.padEnd(6)} ${rv.name.padEnd(5)} gana ${String(pct(c.wins, N)).padStart(3)} % (${pct(c.won, c.pts)} % pts) · golpes/punto med ${q(c.lens, 0.5)} p90 ${q(c.lens, 0.9)} máx ${q(c.lens, 1)} · ${(c.mins.reduce((a, b) => a + b, 0) / N).toFixed(1)} min (${q(c.mins, 0).toFixed(1)}–${q(c.mins, 1).toFixed(1)})`;
      if (process.env.BRIEF) {
        console.log(`${head} · dejadas ${pct(all.dejada, nAll)} % · voleas ${pct(c.volleys[0] + c.volleys[1], nAll)} %`);
        return;
      }
      console.log(head);
      console.log(`   todos:  ${mixStr(all, nAll)} · voleas ${pct(c.volleys[0] + c.volleys[1], nAll)}`);
      console.log(`   humano: ${mixStr(c.mix[0], c.shots[0])} · voleas ${pct(c.volleys[0], c.shots[0])}`);
      console.log(`   CPU:    ${mixStr(c.mix[1], c.shots[1])} · voleas ${pct(c.volleys[1], c.shots[1])} · golpea desde ${top(c.cpuFrom, c.shots[1])} · sube tras restar ${pct(c.cpuUpAfterReturn[0], c.cpuUpAfterReturn[1])} · atrás tras sacar ${pct(c.cpuBackAfterServe[0], c.cpuBackAfterServe[1])}`);
      console.log(`   acaban: ${top(c.ends, c.pts, 9)}`);
      const nl = Object.values(c.longPos).reduce((a, b) => a + b, 0);
      if (nl) console.log(`   golpes de los puntos de 18 o más (${nl}): ${top(c.longPos, nl, 4)}`);
      for (const [w, nm] of [
        [0, 'humano'],
        [1, 'CPU'],
      ] as const) {
        const parts = Object.entries(c.outc[w]).map(([k, o]) => {
          const n = Object.values(o).reduce((a, b) => a + b, 0);
          return `${k} (${n}): gana ${pct(o.gana ?? 0, n)} · falla ${pct(o.falla ?? 0, n)} · error forzado ${pct(o.forzado ?? 0, n)} · vuelve ${pct(o.vuelve ?? 0, n)}`;
        });
        if (parts.length) console.log(`     ${nm}: ${parts.join(' | ')}`);
      }
      console.log(`     gana humano: ${top(c.endsBy[0], c.pts, 5)} | gana CPU: ${top(c.endsBy[1], c.pts, 5)}`);
    });
    if (process.env.MATRIX) {
      // one line per level: matches and points won, median and p90 of the shots per point, dinks, minutes
      const f = (g: (c: Cell) => number | string) => row.map(g).join('/');
      const dk = (c: Cell) => pct((c.mix[0].dejada ?? 0) + (c.mix[1].dejada ?? 0), c.shots[0] + c.shots[1]);
      console.log(`  ${lv.padEnd(6)} gana ${f((c) => pct(c.wins, N))} · pts ${f((c) => pct(c.won, c.pts))} · med ${f((c) => q(c.lens, 0.5))} · p90 ${f((c) => q(c.lens, 0.9))} · dejadas ${f(dk)} · min ${f((c) => (c.mins.reduce((a, b) => a + b, 0) / N).toFixed(1))}`);
    }
  }
  if (!process.env.JSON) {
    const lens = totals.flatMap((t) => t.c.lens);
    const mins = totals.flatMap((t) => t.c.mins);
    console.log(`${process.env.MATRIX ? '  ' : '\n'}todo: golpes/punto med ${q(lens, 0.5)} p90 ${q(lens, 0.9)} máx ${q(lens, 1)} · partido ${q(mins, 0).toFixed(1)}–${q(mins, 1).toFixed(1)} min (p10 ${q(mins, 0.1).toFixed(1)}, p90 ${q(mins, 0.9).toFixed(1)}) · ayuda ${assist} · ${N} partidos por pareja`);
  }
}

// VARIANTS=file.json: [{ "name": "…", "singles": { … }, "tune": { "2": { "q": 0.8 } } }, …], each from the defaults
if (process.env.VARIANTS) {
  const vs = JSON.parse(readFileSync(process.env.VARIANTS, 'utf8')) as { name: string; singles?: Record<string, unknown>; tune?: Record<string, Partial<Skill>> }[];
  const s0 = SINGLES ? { ...SINGLES } : null;
  const k0 = RIVALS.map((r) => ({ ...r.skill }));
  for (const v of vs) {
    if (SINGLES && s0) Object.assign(SINGLES, s0, v.singles ?? {});
    RIVALS.forEach((r, i) => Object.assign(r.skill, k0[i], v.tune?.[i] ?? {}));
    console.log(`${v.name}:`);
    table();
  }
} else table();
