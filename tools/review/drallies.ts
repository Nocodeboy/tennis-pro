// How doubles points are played and how they end (docs/concepto.md, «Control y simulación 0.7»): the thumb bot (tools/
// thumb.ts) with Marta against one pair, or CPU against CPU (level "cpu": Marta and Lola against the pair).
//  · shots per point: mean, p90, the longest, share of points of 25 shots or more;
//  · the exchange at the net: dinks per point, share of balls met above the tape (y > 1 m) at the net that were attacked
//    (speed-up, smash), of those met lower that were sped up anyway, and poaches (a net volley by the player whose
//    partner the ball was heading to);
//  · how points end: winners, errors by kind of shot and what came before.
// npx tsx tools/review/drallies.ts [level=medio] [pair=2] [matches=12] [assist=1]
// Env: as tools/bot-doubles.ts (TUNE, FEET, HFEET, SUGGEST, ASSIST) · DOUBLES='{…}' (src/sim/brain.ts, DOUBLES) ·
// POACH='{…}' (src/sim/match.ts, POACH).
import { AIController, DOUBLES, DOUBLES_SKILLS, HUMAN_REACTION, HUMAN_SPEED, PAIRS, PARTNER, RIVALS, SHANK } from '../../src/sim/brain';
import { ASSIST, CPU_LUNGE, FEET, HUMAN_FEET, Match, POACH, REFLEX, SUGGEST } from '../../src/sim/match';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

if (process.env.FEET) Object.assign(FEET, JSON.parse(process.env.FEET));
if (process.env.HFEET) Object.assign(HUMAN_FEET, JSON.parse(process.env.HFEET));
if (process.env.SUGGEST) Object.assign(SUGGEST, JSON.parse(process.env.SUGGEST));
if (process.env.ASSIST) Object.assign(ASSIST, JSON.parse(process.env.ASSIST));
if (process.env.CPU_LUNGE) Object.assign(CPU_LUNGE, JSON.parse(process.env.CPU_LUNGE));
if (process.env.REFLEX) Object.assign(REFLEX, JSON.parse(process.env.REFLEX));
if (process.env.SHANK) Object.assign(SHANK, JSON.parse(process.env.SHANK));
if (process.env.DOUBLES) Object.assign(DOUBLES, JSON.parse(process.env.DOUBLES));
if (process.env.POACH) Object.assign(POACH, JSON.parse(process.env.POACH));
if (process.env.TUNE)
  for (const [i, s] of Object.entries(JSON.parse(process.env.TUNE))) Object.assign(i === 'marta' ? PARTNER.skill : DOUBLES_SKILLS[RIVALS[Number(i)].id], s);

const lvl = process.argv[2] ?? 'medio';
const pair = PAIRS[Number(process.argv[3] ?? 2)];
const N = Number(process.argv[4] ?? 12);
const assist = Number(process.argv[5] ?? 1);
const cpu = lvl === 'cpu';
const lens: number[] = [];
const ends: Record<string, number> = {};
let dinks = 0;
let highNet = 0;
let highAtk = 0;
let lowNet = 0;
let lowAtk = 0;
let poach = 0;
let ballKey = '';
let netOwned = 0;
let poachPlan = 0;
let netVolleys = 0;
let won = 0;
let wins = 0;
let pts = 0;
// TRACE=n: prints the first n points of 30 shots or more, shot by shot
let traced = Number(process.env.TRACE ?? 0);
// attacks (smash, speed-up) and how many came back, and what the returns were
const atk: Record<string, { n: number; back: number; q: number[] }> = { smash: { n: 0, back: 0, q: [] }, speedup: { n: 0, back: 0, q: [] } };
let pend: string | null = null;
let pendTeam = -1;
// the shot number of each attack this point, to see how soon the point ended after it (the attacker's team won it?)
let atkShots: { shot: number; team: number }[] = [];
const atkEnd = { n: 0, in1: 0, in2: 0, won: 0, at: [] as number[] };
// errors by kind of shot and contact quality (ERRQ=1 prints them)
const errq: Record<string, { n: number; err: number }> = {};
let lastKey = '';
let lines: string[] = [];
for (let i = 0; i < N; i++) {
  const seed = 2000 + i * 7919;
  const bot = new ThumbBot(HUMANS[cpu ? 'medio' : lvl], assist, seed + 17);
  const near = cpu ? { ...RIVALS[1], skill: DOUBLES_SKILLS.lola } : null;
  const m = new Match(
    [
      near ? { team: 0, human: false, speed: near.skill.speed, reaction: near.skill.reaction, look: near.look } : { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
      { team: 0, human: false, speed: PARTNER.skill.speed, reaction: PARTNER.skill.reaction, look: PARTNER.look },
      { team: 1, human: false, speed: pair.a.skill.speed, reaction: pair.a.skill.reaction, look: pair.a.look },
      { team: 1, human: false, speed: pair.b.skill.speed, reaction: pair.b.skill.reaction, look: pair.b.look },
    ],
    { scoring: 'rally', to: 11 },
    seed,
  );
  m.setControllers([near ? new AIController(near.skill) : bot.ctl, new AIController(PARTNER.skill), new AIController(pair.a.skill), new AIController(pair.b.skill)]);
  if (!cpu) bot.attach(m);
  m.start();
  let last: { pid: number; kind: string } | null = null;
  let prev: string | null = null;
  // the receiving team's player the ball was heading to (the side of the court it was coming down)
  let g = 0;
  while (m.phase !== 'over' && g++ < 60 * 60 * 60) {
    if (!cpu) bot.tick(m);
    // (the halves before this frame: a poach makes the pair switch halves in the same step)
    const lanes = m.players.map((o) => o.lane);
    m.update(1 / 60);
    // the planner's choice for the ball just struck: a CPU player up at the net taking a volley in the half the
    // partner covers (a poach decision)
    {
      const r = m.rally;
      const k = r && r.last ? `${m.stats.rallies}:${r.shots}` : '';
      if (k && k !== ballKey) {
        ballKey = k;
        const o = m.owner >= 0 ? m.players[m.owner] : null;
        if (o && o.plan && o.plan.volley && Math.abs(o.plan.fz) < 3.6) {
          netOwned++;
          if (o.plan.bx * lanes[o.id] < -0.3) poachPlan++;
        }
      }
    }
    if (!cpu) bot.events(m.events);
    for (const e of m.events) {
      if (e.type === 'hit') {
        const p = m.players[e.pid];
        if (pend && p.team !== pendTeam) {
          atk[pend].back++;
          atk[pend].q.push(e.q);
        }
        pend = e.kind === 'smash' || e.kind === 'speedup' ? e.kind : null;
        pendTeam = p.team;
        if (pend) {
          atk[pend].n++;
          atkShots.push({ shot: e.shot, team: p.team });
        }
        if (e.kind === 'dink') dinks++;
        const atNet = Math.abs(p.z) < 3.6 && e.shot > 3;
        const oppsNet = m.players.filter((o) => o.team !== p.team).every((o) => Math.abs(o.z) < 3.6);
        if (atNet && oppsNet && e.volley !== undefined) {
          const atk = e.kind === 'speedup' || e.kind === 'smash';
          if (e.y > 1.0) {
            highNet++;
            if (atk) highAtk++;
          } else {
            lowNet++;
            if (atk) lowAtk++;
          }
        }
        if (atNet && e.volley) {
          netVolleys++;
          // a poach: the volley was taken clearly in the half the partner covered
          if (e.x * lanes[e.pid] < -0.3) poach++;
        }
        prev = last?.kind ?? null;
        last = { pid: e.pid, kind: e.kind };
        lastKey = `${e.kind}${e.q < 0.3 ? ' q<0,3' : e.q < 0.6 ? ' q0,3-0,6' : ' q>0,6'}${prev === 'smash' || prev === 'speedup' ? ' tras ataque' : ''}`;
        (errq[lastKey] ??= { n: 0, err: 0 }).n++;
        if (traced > 0) lines.push(`   ${String(e.shot).padStart(2)} ${'HMab'[e.pid]} ${e.kind.padEnd(7)} ${e.timing.padEnd(7)} q ${e.q.toFixed(2)} y ${e.y.toFixed(2)} ${e.volley ? 'volea' : 'bote '} v ${e.speed.toFixed(1)} en (${e.x.toFixed(1)}, ${e.z.toFixed(1)}) · ${m.players.map((o) => `${'HMab'[o.id]}(${o.x.toFixed(1)},${o.z.toFixed(1)})`).join(' ')}`);
      }
      if (e.type === 'point') {
        if (e.fault !== null && lastKey && (e.reason === 'out' || e.reason === 'net')) errq[lastKey].err++;
        lastKey = '';
        pend = null;
        for (const a of atkShots) {
          atkEnd.n++;
          const left = e.rally - a.shot;
          if (left === 0) atkEnd.in1++;
          if (left <= 2) atkEnd.in2++;
          if (left <= 2 && e.winner === a.team) atkEnd.won++;
        }
        if (atkShots.length) atkEnd.at.push(atkShots.length);
        atkShots = [];
        pts++;
        lens.push(e.rally);
        if (e.winner === 0) won++;
        const who = (pid: number) => (pid === 0 ? (cpu ? 'L' : 'H') : pid === 1 ? 'M' : 'rival');
        const k = e.fault !== null ? `${e.reason} ${who(e.fault)}:${last?.kind} tras ${prev}` : `${e.reason} de ${last ? who(last.pid) : '?'}:${last?.kind}`;
        ends[k] = (ends[k] ?? 0) + 1;
        if (traced > 0 && e.rally >= 30) {
          traced--;
          console.log(`punto de ${e.rally} golpes → ${k}\n${lines.join('\n')}`);
        }
        lines = [];
        last = null;
        prev = null;
      }
    }
    m.events.length = 0;
  }
  if (m.winner === 0) wins++;
}
const s = [...lens].sort((a, b) => a - b);
const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
const pc = (a: number, b: number) => `${b ? ((a / b) * 100).toFixed(0) : '–'}%`;
console.log(`${cpu ? 'Lola (CPU)' : lvl} y Marta contra ${pair.a.name} y ${pair.b.name} · ${N} partidos: gana ${pc(wins, N)} de los partidos y ${pc(won, pts)} de los puntos`);
console.log(`  golpes por punto: media ${mean.toFixed(1)} · p50 ${s[Math.floor(0.5 * (s.length - 1))]} · p90 ${s[Math.floor(0.9 * (s.length - 1))]} · máx ${s[s.length - 1]} · 25 o más ${pc(lens.filter((v) => v >= 25).length, lens.length)}`);
console.log(`  en la red: dejadas por punto ${(dinks / pts).toFixed(1)} · bolas por encima de 1 m atacadas ${pc(highAtk, highNet)} (${(highNet / pts).toFixed(1)} por punto) · bolas bajas aceleradas ${pc(lowAtk, lowNet)} · voleas en la red que eran del compañero ${pc(poach, netVolleys)} (decididas por la CPU al golpear el rival: ${pc(poachPlan, netOwned)})`);
const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : NaN);
console.log(`  ataques devueltos: remates ${pc(atk.smash.back, atk.smash.n)} de ${atk.smash.n} (q de la respuesta ${med(atk.smash.q).toFixed(2)}) · aceleraciones ${pc(atk.speedup.back, atk.speedup.n)} de ${atk.speedup.n} (q ${med(atk.speedup.q).toFixed(2)})`);
console.log(`  tras un ataque el punto acaba en ese golpe ${pc(atkEnd.in1, atkEnd.n)} · en 3 golpes ${pc(atkEnd.in2, atkEnd.n)} (lo gana el que ataca ${pc(atkEnd.won, atkEnd.n)}) · ataques por punto ${(atkEnd.n / pts).toFixed(1)}`);
if (process.env.ERRQ)
  console.log(
    `  errores por golpe y calidad: ${Object.entries(errq)
      .filter(([, v]) => v.n >= 20)
      .sort((a, b) => b[1].n - a[1].n)
      .map(([k, v]) => `${k} ${pc(v.err, v.n)} de ${v.n}`)
      .join(' · ')}`,
  );
console.log(
  `  cómo acaban: ${Object.entries(ends)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => `${k} ${pc(v, pts)}`)
    .join(' · ')}`,
);
