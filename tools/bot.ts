// Headless tennis: a simulated person on a phone (tools/thumb.ts: the real HumanController and Input with virtual
// thumbs) against every rival of the singles ladder, or with his CPU partner (Marcel) against every pair. Measures the
// ladder, rally length, how points end, the serve, and checks nothing gets stuck.
// Usage: npx tsx tools/bot.ts [singles|doubles = singles] [matches per cell = 16] [surface hard|clay|grass = hard]
//        [games = 4] [sets 1|3|5 = 1] [assist 0|1|2 = 1] [golden 1|0 = 0]
// Env: LEVELS=novato,medio · ONLY=0,3 (indices of rivals or pairs) · RECOVER=1 ("back into place between shots") ·
// FEET='{…}' / HFEET='{…}' other footwork (src/sim/match.ts) · SUGGEST, ASSIST, REFLEX, CPU_LUNGE, POACH, REACH
// (src/sim/match.ts), SHANK, TENNIS, PRESSURE, WHIFF (src/sim/brain.ts): other values · SHOTS=1 the mix of shots and
// how points end · CPU=1 the CPU's own numbers (first serves in, aces, double faults, net approaches).

import { AIController, DOUBLES_SKILLS, HUMAN_REACTION, HUMAN_SPEED, PAIRS, PARTNER, PRESSURE, RIVALS, SHANK, SINGLES_SKILLS, TENNIS, WHIFF } from '../src/sim/brain';
import type { CourtSurface } from '../src/sim/court';
import { ASSIST, CPU_LUNGE, FEET, HUMAN_FEET, Match, POACH, REACH, REFLEX, SUGGEST, type Controller, type PlayerCfg } from '../src/sim/match';
import type { Rules } from '../src/sim/types';
import { HUMANS } from './humans';
import { ThumbBot } from './thumb';

const mode = (process.argv[2] ?? 'singles') === 'doubles' ? 'doubles' : 'singles';
const N = Number(process.argv[3] ?? 16);
const surface = (process.argv[4] ?? 'hard') as CourtSurface;
const rules: Rules = { games: Number(process.argv[5] ?? 4), sets: Number(process.argv[6] ?? 1) as 1 | 3 | 5, golden: (process.argv[8] ?? '0') !== '0', surface };
const assist = Number(process.argv[7] ?? 1);
const levels = process.env.LEVELS?.split(',');
const only = process.env.ONLY?.split(',').map(Number);
const merge = (o: object, env: string) => process.env[env] && Object.assign(o, JSON.parse(process.env[env]!));
merge(FEET, 'FEET');
merge(HUMAN_FEET, 'HFEET');
merge(SUGGEST, 'SUGGEST');
merge(ASSIST, 'ASSIST');
merge(CPU_LUNGE, 'CPU_LUNGE');
merge(SHANK, 'SHANK');
merge(REFLEX, 'REFLEX');
merge(PRESSURE, 'PRESSURE');
merge(POACH, 'POACH');
merge(REACH, 'REACH');
merge(WHIFF, 'WHIFF');
if (process.env.TENNIS) {
  const t = JSON.parse(process.env.TENNIS);
  if (t.serve) Object.assign(TENNIS.serve, t.serve);
  delete t.serve;
  Object.assign(TENNIS, t);
}
// TUNE='{"2":{"q":0.78}}': other skills for some rivals (indices into RIVALS; "marta" for the partner)
if (process.env.TUNE)
  for (const [i, s] of Object.entries(JSON.parse(process.env.TUNE))) {
    if (i === 'marta') Object.assign(PARTNER.skill, s);
    else {
      Object.assign(SINGLES_SKILLS[RIVALS[Number(i)].id], s);
      Object.assign(DOUBLES_SKILLS[RIVALS[Number(i)].id], s);
    }
  }

const cells = mode === 'singles' ? RIVALS.map((r) => ({ name: r.name, cpu: [r] })) : PAIRS.map((p) => ({ name: `${p.a.name}+${p.b.name}`, cpu: [p.a, p.b] }));
const cfg = (r: { skill: { speed: number; reaction: number }; look: number }, team: 0 | 1): PlayerCfg => ({ team, human: false, speed: r.skill.speed, reaction: r.skill.reaction, look: r.look });

const shotMix: Record<string, number> = {};
const endGroups: Record<string, number> = {};
let mixN = 0;
const qs: Record<string, number[]> = {};
const perKind: Record<string, { n: number; win: number; err: number; forced: number; ys: number[]; v: number[]; av: number[] }> = {};
const pk = (k: string) => (perKind[k] ??= { n: 0, win: 0, err: 0, forced: 0, ys: [], v: [], av: [] });
const WINNING = new Set(['winner', 'miss', 'letGo', 'body']);
const pc = (a: number, b: number) => `${b ? ((a / b) * 100).toFixed(0) : '–'}%`;
const rows: string[][] = [['humano', mode === 'singles' ? 'rival' : 'pareja', 'gana', 'puntos', 'golpes/punto', 'min', 'perfectos', 'tu 1.er saque', 'aces', 'd.f.', 'cpu 1.º', 'cpu aces', 'cpu d.f.', 'red cpu', 'pierde por', 'gana por']];
let stuck = 0;
let longest = 0;
const human = 0;
const isHumanSide = (pid: number) => (mode === 'singles' ? pid === 0 : pid < 2);
for (const [hn, h] of Object.entries(HUMANS)) {
  if (levels && !levels.includes(hn)) continue;
  for (const [ci, cell] of cells.entries()) {
    if (only && !only.includes(ci)) continue;
    let wins = 0;
    let pts = 0;
    let ptsWon = 0;
    let shots = 0;
    let dur = 0;
    let mine = 0;
    let perfect = 0;
    // the serve: [first serves, in] for the human and the CPU; aces and double faults; CPU shots from the net
    const sv = { h: [0, 0], c: [0, 0], hAce: 0, cAce: 0, hDf: 0, cDf: 0, hPts: 0, cPts: 0 };
    let cpuShots = 0;
    let cpuNet = 0;
    const won: Record<string, number> = {};
    const lost: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const seed = 2000 + i * 7919 + ci * 31;
      const bot = new ThumbBot(h, assist, seed + 17, human);
      if (process.env.RECOVER) bot.ctl.recover = true;
      const cfgs: PlayerCfg[] = [{ team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 }];
      const ctls: Controller[] = [bot.ctl];
      if (mode === 'doubles') {
        cfgs.push(cfg(PARTNER, 0));
        ctls.push(new AIController(PARTNER.skill));
      }
      for (const r of cell.cpu) {
        cfgs.push(cfg(r, 1));
        ctls.push(new AIController(r.skill));
      }
      const m = new Match(cfgs, rules, seed);
      m.setControllers(ctls);
      bot.attach(m);
      m.start();
      let guard = 0;
      let h1: { k: string; team: number } | null = null;
      let h2: { k: string; team: number } | null = null;
      // the serve of this point: who, first or second, and was it in
      let srvPid = -1;
      let srvNum = 1;
      while (m.phase !== 'over' && guard++ < 60 * 60 * 120) {
        bot.tick(m);
        m.update(1 / 60);
        bot.events(m.events);
        for (const e of m.events) {
          if (e.type === 'hit') {
            const k = `${e.kind}${e.volley && e.kind !== 'serve' ? ' (volea)' : ''}`;
            shotMix[k] = (shotMix[k] ?? 0) + 1;
            mixN++;
            const o = pk(`${isHumanSide(e.pid) ? 'tú' : 'cpu'} ${e.kind}`);
            o.n++;
            o.ys.push(e.y);
            o.v.push(e.speed * 3.6);
            if (e.avail !== undefined) o.av.push(e.avail);
            h2 = h1;
            h1 = { k: `${isHumanSide(e.pid) ? 'tú' : 'cpu'} ${e.kind}`, team: isHumanSide(e.pid) ? 0 : 1 };
            if (process.env.QS && !isHumanSide(e.pid)) (qs[e.kind] ??= []).push(e.q);
            if (e.kind === 'serve') {
              srvPid = e.pid;
              srvNum = m.serveNum;
            }
            if (!isHumanSide(e.pid) && e.kind !== 'serve') {
              cpuShots++;
              if (Math.abs(e.z) < 5) cpuNet++;
            }
            if (e.pid === human && e.kind !== 'serve') {
              mine++;
              if (e.timing === 'perfect') perfect++;
            }
          }
          if (e.type === 'bounce' && e.first && m.rally?.shots === 1 && srvNum === 1) {
            const s = isHumanSide(srvPid) ? sv.h : sv.c;
            s[0]++;
            if (e.good) s[1]++;
          }
          if (e.type === 'fault' && e.fault === 'serveNet' && srvNum === 1) (isHumanSide(e.pid) ? sv.h : sv.c)[0]++;
          if (e.type === 'point') {
            const g = WINNING.has(e.reason) ? `ganador (${e.reason})` : e.reason === 'doubleFault' ? 'doble falta' : `error (${e.reason})`;
            endGroups[g] = (endGroups[g] ?? 0) + 1;
            if (h1) {
              if (e.fault !== null && h1.team === (isHumanSide(e.fault) ? 0 : 1)) {
                pk(h1.k).err++;
                if (h2 && h2.team !== h1.team) pk(h2.k).forced++;
              } else if (e.fault === null && e.winner === h1.team) pk(h1.k).win++;
            }
            h1 = h2 = null;
            pts++;
            shots += e.rally;
            longest = Math.max(longest, e.rally);
            const hs = isHumanSide(srvPid);
            if (hs) sv.hPts++;
            else sv.cPts++;
            if (e.rally === 1 && e.fault === null && e.reason !== 'body') hs ? sv.hAce++ : sv.cAce++;
            if (e.reason === 'doubleFault') hs ? sv.hDf++ : sv.cDf++;
            if (e.winner === 0) {
              ptsWon++;
              won[e.reason] = (won[e.reason] ?? 0) + 1;
            } else {
              const k = e.fault === human ? `tú-${e.reason}` : e.fault !== null && isHumanSide(e.fault) ? `${PARTNER.name.toLowerCase()}-${e.reason}` : e.reason;
              lost[k] = (lost[k] ?? 0) + 1;
            }
          }
        }
        m.events.length = 0;
      }
      if (m.phase !== 'over') stuck++;
      if (m.winner === 0) wins++;
      dur += m.t;
    }
    const top = (o: Record<string, number>) =>
      Object.entries(o)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, v]) => `${k} ${((v / pts) * 100).toFixed(0)}`)
        .join(' · ');
    rows.push([hn, cell.name, pc(wins, N), pc(ptsWon, pts), (shots / pts).toFixed(1), (dur / N / 60).toFixed(1), pc(perfect, mine), pc(sv.h[1], sv.h[0]), pc(sv.hAce, sv.hPts), pc(sv.hDf, sv.hPts), pc(sv.c[1], sv.c[0]), pc(sv.cAce, sv.cPts), pc(sv.cDf, sv.cPts), pc(cpuNet, cpuShots), top(lost), top(won)]);
  }
}
const w = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
for (const r of rows) console.log(r.map((v, c) => v.padEnd(w[c])).join('  '));
if (process.env.SHOTS) {
  const list = (o: Record<string, number>, n: number, k = 16) =>
    Object.entries(o)
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([a, v]) => `${a} ${((v / n) * 100).toFixed(1)}%`)
      .join(' · ');
  console.log(`\ngolpes: ${list(shotMix, mixN)}`);
  const eg = Object.entries(endGroups).sort((a, b) => b[1] - a[1]);
  const tot = eg.reduce((a, [, v]) => a + v, 0);
  const winsN = eg.filter(([k]) => k.startsWith('ganador')).reduce((a, [, v]) => a + v, 0);
  console.log(`\ncómo acaban los puntos: ganadores ${pc(winsN, tot)} · ${eg.map(([k, v]) => `${k} ${((v / tot) * 100).toFixed(1)}%`).join(' · ')}`);
  console.log('\npor golpe (n, % de golpes; gana el punto, error, fuerza el error; altura mediana del contacto; velocidad mediana y p90 al salir, km/h; tiempo mediano desde el golpe anterior, s):');
  const q = (a: number[], f: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * f)] ?? 0;
  for (const [k, o] of Object.entries(perKind).sort((a, b) => b[1].n - a[1].n))
    console.log(`  ${k.padEnd(13)} ${String(o.n).padStart(6)} ${pc(o.n, mixN).padStart(4)}  gana ${pc(o.win, o.n).padStart(4)}  error ${pc(o.err, o.n).padStart(4)}  fuerza ${pc(o.forced, o.n).padStart(4)}  y ${q(o.ys, 0.5).toFixed(2)}  ${q(o.v, 0.5).toFixed(0)} / ${q(o.v, 0.9).toFixed(0)} km/h  ${o.av.length ? q(o.av, 0.5).toFixed(2) + ' s' : ''}`);
}
if (process.env.QS) for (const [k, a] of Object.entries(qs)) console.log(`calidad cpu ${k}: media ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3)} · p10 ${[...a].sort((x, y) => x - y)[Math.floor(a.length * 0.1)].toFixed(2)} (n ${a.length})`);
console.log(`\ntenis · ${mode === 'singles' ? 'individual' : 'dobles'} · ${surface} · ${rules.sets ?? 1} set(s) a ${rules.games} juegos${rules.golden ? ', punto decisivo' : ', ventajas'} · asistencia ${assist} · ${N} partidos por casilla · peloteo más largo ${longest} · ${stuck ? `${stuck} partidos atascados` : 'ningún partido atascado'}`);
