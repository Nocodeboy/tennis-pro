// Headless padel: a simulated person on a phone (tools/thumb.ts: the real HumanController and Input with virtual
// thumbs) and his CPU partner (Martín) against every pair of the club. Measures the ladder, rally length, how points
// end, who takes the balls, and checks nothing gets stuck.
// Usage: npx tsx tools/bot-doubles.ts [matches per pairing = 24] [assist 0|1|2 = 1] [games = 3] [golden 1|0 = 1]
// Env: LEVELS=novato,medio · PAIRS=0,3 (indices) to run part of the table · RECOVER=1 ("back into place between shots") ·
// FEET='{…}' / HFEET='{…}' other footwork (CPU / human, src/sim/match.ts) · SUGGEST, ASSIST, REFLEX, CPU_LUNGE, POACH
// (src/sim/match.ts), SHANK, PADEL and PRESSURE (src/sim/brain.ts): other values · SHOTS=1 the mix of shots played.
//
// Columns: «tuyas» = share of the team's shots hit by the human; «nadie» = points lost to a ball in that nobody of the
// team went for although one of them could have got to it (as the planner sees it when the ball is struck); «a la vez» = balls both players of a team went for at once; «pasa» = balls handed to the partner
// mid-flight (one could not make it), per match.

import { AIController, DOUBLES_SKILLS, HUMAN_REACTION, HUMAN_SPEED, PADEL, PAIRS, PARTNER, PRESSURE, RIVALS, SHANK } from '../src/sim/brain';
import { ASSIST, CPU_LUNGE, FEET, HUMAN_FEET, Match, POACH, REFLEX, SUGGEST } from '../src/sim/match';
import { HUMANS } from './humans';
import { ThumbBot } from './thumb';

const N = Number(process.argv[2] ?? 24);
const assist = Number(process.argv[3] ?? 1);
const rules = { games: Number(process.argv[4] ?? 3), golden: (process.argv[5] ?? '1') !== '0' };
const levels = process.env.LEVELS?.split(',');
const only = process.env.PAIRS?.split(',').map(Number);
if (process.env.FEET) Object.assign(FEET, JSON.parse(process.env.FEET));
if (process.env.HFEET) Object.assign(HUMAN_FEET, JSON.parse(process.env.HFEET));
if (process.env.SUGGEST) Object.assign(SUGGEST, JSON.parse(process.env.SUGGEST));
if (process.env.ASSIST) Object.assign(ASSIST, JSON.parse(process.env.ASSIST));
if (process.env.CPU_LUNGE) Object.assign(CPU_LUNGE, JSON.parse(process.env.CPU_LUNGE));
if (process.env.SHANK) Object.assign(SHANK, JSON.parse(process.env.SHANK));
if (process.env.REFLEX) Object.assign(REFLEX, JSON.parse(process.env.REFLEX));
if (process.env.PADEL) Object.assign(PADEL, JSON.parse(process.env.PADEL));
if (process.env.PRESSURE) Object.assign(PRESSURE, JSON.parse(process.env.PRESSURE));
if (process.env.POACH) Object.assign(POACH, JSON.parse(process.env.POACH));
// TUNE='{"2":{"q":0.78}}': other skills for some rivals (indices into RIVALS; "marta" for the partner)
if (process.env.TUNE)
  for (const [i, s] of Object.entries(JSON.parse(process.env.TUNE))) Object.assign(i === 'marta' ? PARTNER.skill : DOUBLES_SKILLS[RIVALS[Number(i)].id], s);

// SHOTS=1: what was played (share of each kind of shot, both teams) and how each point ended, over the whole run
const shotMix: Record<string, number> = {};
const ends: Record<string, number> = {};
let mixN = 0;
let endN = 0;
const pc = (a: number, b: number) => `${b ? ((a / b) * 100).toFixed(0) : '–'}%`;
const rows: string[][] = [['humano', 'pareja', 'gana', 'puntos', 'golpes/punto', 'min', 'tuyas', 'perfectos', 'nadie', 'a la vez', 'pasa', 'pierde por', 'gana por']];
let stuck = 0;
let longest = 0;
for (const [hn, h] of Object.entries(HUMANS)) {
  if (levels && !levels.includes(hn)) continue;
  for (const [pi, pair] of PAIRS.entries()) {
    if (only && !only.includes(pi)) continue;
    let wins = 0;
    let pts = 0;
    let ptsWon = 0;
    let shots = 0;
    let dur = 0;
    let mine = 0;
    let teamHits = 0;
    let perfect = 0;
    let nobody = 0;
    let both = 0;
    let balls = 0;
    let passes = 0;
    const won: Record<string, number> = {};
    const lost: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const seed = 2000 + i * 7919;
      const bot = new ThumbBot(h, assist, seed + 17);
      if (process.env.RECOVER) bot.ctl.recover = true;
      const m = new Match(
        [
          { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
          { team: 0, human: false, speed: PARTNER.skill.speed, reaction: PARTNER.skill.reaction, look: PARTNER.look },
          { team: 1, human: false, speed: pair.a.skill.speed, reaction: pair.a.skill.reaction, look: pair.a.look },
          { team: 1, human: false, speed: pair.b.skill.speed, reaction: pair.b.skill.reaction, look: pair.b.look },
        ],
        rules,
        seed,
      );
      m.setControllers([bot.ctl, new AIController(PARTNER.skill), new AIController(pair.a.skill), new AIController(pair.b.skill)]);
      bot.attach(m);
      m.start();
      let guard = 0;
      // the ball now coming: did anybody of the receiving team go for it, and did both?
      let key = '';
      let went = false;
      let twice = false;
      let reachable = true;
      let owner = -1;
      let lastKind = '';
      while (m.phase !== 'over' && guard++ < 60 * 60 * 60) {
        bot.tick(m);
        m.update(1 / 60);
        bot.events(m.events);
        const r = m.rally;
        if (m.phase === 'rally' && r && r.last) {
          const k = `${m.stats.rallies}:${r.shots}`;
          if (k !== key) {
            key = k;
            went = twice = false;
            balls++;
            owner = m.owner;
            // could anybody of the receiving team get to it (as the planner sees it, at once)? The planner's dice are
            // put back, so the match goes on exactly as without this look
            const rng = m.rng as unknown as { s: number };
            const st = rng.s;
            reachable = m.team(r.last.team === 0 ? 1 : 0).some((p) => !!m.planContact(p, false, !!m.controllers[p.id].steer)?.plan.reach);
            rng.s = st;
          }
          const rt = r.last.team === 0 ? 1 : 0;
          const goers = m.team(rt).filter((p) => p.plan || m.targetFor(p.id)).length;
          if (goers > 0) went = true;
          if (goers > 1 && !twice) {
            twice = true;
            both++;
          }
          if (m.owner !== owner) {
            if (m.owner >= 0 && owner >= 0) passes++;
            owner = m.owner;
          }
        }
        for (const e of m.events) {
          if (e.type === 'hit') {
            const k = `${e.kind}${e.volley ? ' (volea)' : ''}`;
            shotMix[k] = (shotMix[k] ?? 0) + 1;
            mixN++;
          }
          if (e.type === 'point') {
            // the last shot and why it ended: «remate exit», «volea (speedup) winner», «drive net»…
            endN++;
            const k = `${e.reason}${e.fault !== null ? ' (error)' : ''} · ${lastKind}`;
            ends[k] = (ends[k] ?? 0) + 1;
          }
          if (e.type === 'hit') lastKind = `${e.kind}${e.volley ? ' (volea)' : ''}`;
          if (e.type === 'hit' && e.kind !== 'serve' && (e.pid === 0 || e.pid === 1)) {
            teamHits++;
            if (e.pid === 0) {
              mine++;
              if (e.timing === 'perfect') perfect++;
            }
          }
          if (e.type === 'point') {
            pts++;
            shots += e.rally;
            longest = Math.max(longest, e.rally);
            if (e.reason === 'winner' && !went && reachable) nobody++;
            if (e.winner === 0) {
              ptsWon++;
              const k = e.fault === null ? e.reason : `${e.reason}`;
              won[k] = (won[k] ?? 0) + 1;
            } else {
              // from the human's side: his own errors, Martín's, or the other pair's winners
              const k = e.fault === 0 ? `tú-${e.reason}` : e.fault === 1 ? `${PARTNER.name.toLowerCase()}-${e.reason}` : e.reason;
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
    rows.push([hn, `${pair.a.name}+${pair.b.name}`, pc(wins, N), pc(ptsWon, pts), (shots / pts).toFixed(1), (dur / N / 60).toFixed(1), pc(mine, teamHits), pc(perfect, mine), pc(nobody, pts), pc(both, balls), (passes / N).toFixed(1), top(lost), top(won)]);
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
  console.log(`\nfinal del punto (motivo · último golpe): ${list(ends, endN, 22)}`);
}
console.log(`\npádel · ${rules.games} juegos${rules.golden ? ', punto de oro' : ', ventajas'} · asistencia ${assist} · ${N} partidos por pareja · peloteo más largo ${longest} · ${stuck ? `${stuck} partidos atascados` : 'ningún partido atascado'}`);
