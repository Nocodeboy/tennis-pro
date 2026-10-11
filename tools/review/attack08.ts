// The attack as a decision (docs/notas-08-ataque.md): the thumb bot (tools/thumb.ts) against the rivals, and what the
// three gestures do.
//  · the ladder with the share of attacks (flicks), speed-ups and smashes, blocks (taps) and automatic shots;
//  · the human's attacks: on a ball marked attackable or not, and how they end (he wins the point within his attack's
//    next two shots, loses it, the attack itself is an error, or the rally goes on);
//  · the attack cue («¡Atácala!»): how many balls show it, how many are attacked and how those end;
//  · the defence: the CPU's attacks at the human, how many he blocks (taps), how well, and what follows;
//  · FORCE='{"p":0.5}': flick that share of every ball at the net or near it, whatever its height, to measure what an
//    attack is worth by the height of the contact and the distance from the net (attack against no attack, same
//    balls). The table that set ATTACKABLE.
// npx tsx tools/review/attack08.ts [matches per pairing = 12] [assist = 1]
// Env: LEVELS=novato,medio · RIVALS=0,4 · ATTACKABLE='{…}', ATTACK='{…}', BLOCK='{…}' (src/sim/brain.ts) ·
// AIM='{"slowSpeedup":true}' (0.7's hidden attack) ·
// AUTO_SHOT='{"putAway":false}' · HUMAN='{"medio":{"flick":0.5}}' (other thumbs) · TABLES=ladder,attacks,cues,defence
const g = globalThis as unknown as { window?: unknown };
g.window ??= { addEventListener() {} };
import { AIController, AIM, ATTACK, ATTACKABLE, AUTO_SHOT, BLOCK, HUMAN_REACTION, HUMAN_SPEED, RIVALS, ballCue, difficulty } from '../../src/sim/brain';
import { NET_C } from '../../src/sim/court';
import { Match } from '../../src/sim/match';
import type { Plan } from '../../src/sim/types';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

if (process.env.ATTACKABLE) Object.assign(ATTACKABLE, JSON.parse(process.env.ATTACKABLE));
if (process.env.ATTACK) Object.assign(ATTACK, JSON.parse(process.env.ATTACK));
if (process.env.BLOCK) Object.assign(BLOCK, JSON.parse(process.env.BLOCK));
if (process.env.AIM) Object.assign(AIM, JSON.parse(process.env.AIM));
if (process.env.AUTO_SHOT) Object.assign(AUTO_SHOT, JSON.parse(process.env.AUTO_SHOT));
if (process.env.HUMAN) for (const [k, v] of Object.entries(JSON.parse(process.env.HUMAN))) Object.assign(HUMANS[k], v);
const FORCE = process.env.FORCE ? (JSON.parse(process.env.FORCE) as { p: number }) : null;
const N = Number(process.argv[2] ?? 12);
const assist = Number(process.argv[3] ?? 1);
const levels = process.env.LEVELS?.split(',');
const rivals = process.env.RIVALS?.split(',').map(Number);
const tables = (process.env.TABLES ?? 'ladder,attacks,cues,defence').split(',');

const pc = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : '–');
type Out = 'gana' | 'pierde' | 'error' | 'sigue';
interface Shot {
  k: number;
  kind: string;
  intent?: string;
  timing: string;
  y: number;
  fz: number;
  oppZ: number;
  cue: 'attack' | 'block' | null;
  cueShown: boolean;
  /** the ball was an attack of the CPU (a block was asked for) */
  under: boolean;
  /** how awkward the ball was at the contact (brain.ts, difficulty) */
  dif: number;
  out?: Out;
}
const OUTS: Out[] = ['gana', 'pierde', 'error', 'sigue'];
const tally = () => ({ n: 0, gana: 0, pierde: 0, error: 0, sigue: 0 });
type Tally = ReturnType<typeof tally>;
const add = (t: Tally, o: Out) => {
  t.n++;
  t[o]++;
};
const fmt = (t: Tally) => `n=${String(t.n).padStart(4)} · gana ${pc(t.gana, t.n).padStart(4)} · pierde ${pc(t.pierde, t.n).padStart(4)} · error ${pc(t.error, t.n).padStart(4)} · sigue ${pc(t.sigue, t.n).padStart(4)}`;

const ladder: string[][] = [['humano', 'rival', 'gana', 'puntos', 'golpes/p', 'ataques', 'acel.', 'remates', 'bloqueos', 'auto', 'avisos/p', 'avisos atacados']];
const byLevel: Record<string, { atk: Record<string, Tally>; cue: { shown: number; attacked: number; asked: Tally; notAttacked: Tally }; def: { n: number; tap: number; perfect: number; good: number; poor: number; back: number; tapT: Tally; autoT: Tally; otherT: Tally } }> = {};
// FORCE: by height of the contact over the tape and distance from the net, attacked or not
const bins: Record<string, { a: Tally; n: Tally }> = {};
const hBin = (s: Shot) => {
  if (s.y > 1.75) return 'h9 encima de la cabeza';
  const o = s.y - NET_C;
  const edges = [-0.2, 0, 0.1, 0.2, 0.3, 0.5];
  const names = ['h1 < −0,20', 'h2 −0,20…0', 'h3 0…0,10', 'h4 0,10…0,20', 'h5 0,20…0,30', 'h6 0,30…0,50', 'h7 > 0,50'];
  let i = 0;
  while (i < edges.length && o >= edges[i]) i++;
  return names[i];
};
const dBin = (fz: number) => (fz < 2.6 ? 'd1 cocina' : fz < 3.6 ? 'd2 3,6 m' : fz < 5 ? 'd3 5 m' : 'd4 fondo');
let stuck = 0;

for (const [hn, h0] of Object.entries(HUMANS)) {
  if (levels && !levels.includes(hn)) continue;
  const h = FORCE ? { ...h0, flick: FORCE.p, rash: FORCE.p, rashFloor: -9, rashNear: 9 } : h0;
  const L = (byLevel[hn] = { atk: { avisada: tally(), 'sin aviso': tally() }, cue: { shown: 0, attacked: 0, asked: tally(), notAttacked: tally() }, def: { n: 0, tap: 0, perfect: 0, good: 0, poor: 0, back: 0, tapT: tally(), autoT: tally(), otherT: tally() } });
  RIVALS.forEach((rv, ri) => {
    if (rivals && !rivals.includes(ri)) return;
    let wins = 0;
    let pts = 0;
    let won = 0;
    let shotsAll = 0;
    let hits = 0;
    let attacks = 0;
    let speedups = 0;
    let smashes = 0;
    let blocks = 0;
    let autos = 0;
    let cueShown = 0;
    let cueAttacked = 0;
    for (let i = 0; i < N; i++) {
      const seed = 1000 + i * 7919;
      const bot = new ThumbBot(h, assist, seed + 17);
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
      const me = m.players[0];
      // the cue as the player saw it on this ball (latched: once it showed, it stays for the ball)
      let ballKey = '';
      let seen: 'attack' | 'block' | null = null;
      let contact: { plan: Plan; cue: 'attack' | 'block' | null; dif: number } | null = null;
      const hit0 = bot.ctl.hit.bind(bot.ctl);
      bot.ctl.hit = (mm, p, plan) => {
        contact = { plan, cue: ballCue(mm, p, plan), dif: difficulty(mm, p, { ...plan, stretch: 0 }) };
        return hit0(mm, p, plan);
      };
      let point: Shot[] = [];
      let guard = 0;
      while (m.phase !== 'over' && guard++ < 60 * 60 * 40) {
        bot.tick(m);
        // (what the HUD would show now)
        if (m.phase === 'rally' && m.rally?.last && m.rally.last.team !== 0) {
          const key = `${m.stats.rallies}:${m.rally.shots}`;
          if (key !== ballKey) {
            ballKey = key;
            seen = null;
          }
          const c = bot.ctl.cue(m, me);
          if (c && !seen) seen = c;
        }
        m.update(1 / 60);
        bot.events(m.events);
        for (const e of m.events) {
          if (e.type === 'hit' && e.pid === 0 && e.kind !== 'serve') {
            const c = contact as { plan: Plan; cue: 'attack' | 'block' | null; dif: number } | null;
            const s: Shot = { k: e.shot, kind: e.kind, intent: e.intent, timing: e.timing, y: e.y, fz: Math.abs(e.z), oppZ: Math.abs(m.players[1].z), cue: c?.cue ?? null, cueShown: seen === 'attack', under: seen === 'block', dif: c?.dif ?? 0 };
            point.push(s);
            hits++;
            if (e.intent === 'attack') attacks++;
            if (e.kind === 'speedup') speedups++;
            if (e.kind === 'smash') smashes++;
            if (e.intent === 'block') blocks++;
            if (e.timing === 'auto') autos++;
            if (s.cueShown) {
              cueShown++;
              if (e.intent === 'attack') cueAttacked++;
            }
          }
          if (e.type === 'point') {
            pts++;
            shotsAll += e.rally;
            if (e.winner === 0) won++;
            for (const s of point) {
              const left = e.rally - s.k;
              s.out = left === 0 && e.fault === 0 ? 'error' : left <= 2 ? (e.winner === 0 ? 'gana' : 'pierde') : 'sigue';
              if (s.intent === 'attack') add(L.atk[s.cueShown ? 'avisada' : 'sin aviso'], s.out);
              if (s.cueShown) {
                L.cue.shown++;
                if (s.intent === 'attack') {
                  L.cue.attacked++;
                  add(L.cue.asked, s.out);
                } else add(L.cue.notAttacked, s.out);
              }
              if (s.under) {
                L.def.n++;
                L.def.back++;
                if (s.intent === 'block') {
                  L.def.tap++;
                  if (s.timing === 'perfect') L.def.perfect++;
                  else if (s.timing === 'good') L.def.good++;
                  else L.def.poor++;
                  add(L.def.tapT, s.out);
                } else if (s.timing === 'auto') add(L.def.autoT, s.out);
                else add(L.def.otherT, s.out);
              }
              if (FORCE && s.k >= 3 && s.fz < 6) {
                const b = (bins[`${hBin(s)} · ${dBin(s.fz)}`] ??= { a: tally(), n: tally() });
                add(s.intent === 'attack' ? b.a : b.n, s.out);
                // above the tape at the kitchen line: does the opponent's place or the hurry matter?
                if (s.fz < 3.6 && s.y >= NET_C) {
                  const k2 = `x rival ${s.oppZ < 3.6 ? 'en la red' : 'atrás'}`;
                  const k3 = `y dificultad ${s.dif < 0.2 ? '< 0,20' : s.dif < 0.35 ? '0,20…0,35' : s.dif < 0.5 ? '0,35…0,50' : '> 0,50'}`;
                  for (const k of [k2, k3]) add(s.intent === 'attack' ? (bins[k] ??= { a: tally(), n: tally() }).a : (bins[k] ??= { a: tally(), n: tally() }).n, s.out);
                }
              }
            }
            point = [];
          }
        }
        m.events.length = 0;
      }
      if (m.phase !== 'over') stuck++;
      if (m.winner === 0) wins++;
      void contact;
    }
    ladder.push([hn, rv.name, pc(wins, N), pc(won, pts), (shotsAll / pts).toFixed(1), pc(attacks, hits), pc(speedups, hits), pc(smashes, hits), pc(blocks, hits), pc(autos, hits), (cueShown / pts).toFixed(2), pc(cueAttacked, cueShown)]);
  });
}
// (the CPU's attacks he never got a paddle on are not in the defence table: it counts the balls he played)
if (tables.includes('ladder')) {
  const w = ladder[0].map((_, c) => Math.max(...ladder.map((r) => r[c].length)));
  for (const r of ladder) console.log(r.map((v, c) => v.padEnd(w[c])).join('  '));
  console.log(`\nayuda ${assist} · ${N} partidos por pareja · ${stuck ? `${stuck} partidos atascados` : 'ningún partido atascado'}${FORCE ? ` · FORCE p=${FORCE.p}` : ''}`);
}
for (const [hn, L] of Object.entries(byLevel)) {
  console.log(`\n${hn}`);
  if (tables.includes('attacks')) for (const [k, t] of Object.entries(L.atk)) console.log(`  ataques ${k.padEnd(9)} ${fmt(t)}`);
  if (tables.includes('cues')) {
    console.log(`  avisos «¡Atácala!» en bolas que jugó: ${L.cue.shown} · atacados ${pc(L.cue.attacked, L.cue.shown)}`);
    console.log(`    atacados     ${fmt(L.cue.asked)}`);
    console.log(`    sin atacar   ${fmt(L.cue.notAttacked)}`);
  }
  if (tables.includes('defence')) {
    const d = L.def;
    console.log(`  ataques de la CPU que devolvió: ${d.n} · con toque (bloqueo) ${pc(d.tap, d.n)} · perfectos ${pc(d.perfect, d.tap)} · buenos ${pc(d.good, d.tap)} · a destiempo ${pc(d.poor, d.tap)}`);
    console.log(`    bloqueo      ${fmt(d.tapT)}`);
    console.log(`    automático   ${fmt(d.autoT)}`);
    console.log(`    otro golpe   ${fmt(d.otherT)}`);
  }
}
if (FORCE) {
  console.log('\nFORCE: valor de atacar por altura del contacto sobre la cinta (m) y distancia a la red (gana − pierde − error, en puntos de cada 100 bolas)');
  console.log('  casilla                               atacadas                                            no atacadas                                          ventaja');
  for (const k of Object.keys(bins).sort()) {
    const b = bins[k];
    if (b.a.n + b.n.n < 30) continue;
    const net = (t: Tally) => (t.n ? ((t.gana - t.pierde - t.error) / t.n) * 100 : NaN);
    console.log(`  ${k.padEnd(36)}  ${fmt(b.a)}  ${fmt(b.n)}  ${(net(b.a) - net(b.n)).toFixed(0).padStart(4)}`);
  }
}
