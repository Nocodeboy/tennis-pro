// Control feel, measured with the realistic bot (tools/thumb.ts drives the real HumanController and Input):
//  · getting to the ball: how far the circle was when it showed up and how much time there was, and what happened
//    (hit, missed, let go); for the misses, whether a perfect thumb could have made it
//  · the assist against the thumb: frames where the stick pushes one way and the player goes another (> 60° apart)
//  · the kitchen: volleys that came while standing in the kitchen
//  · where he stands when the rival hits (back, transition, kitchen line, in the kitchen)
//  · the aim gesture: how long the drags are (px) by kind of shot
//  · the pace: seconds from the end of a point to the next serve's wind-up
// npx tsx tools/review/feel.ts [level=medio] [rival=2] [matches=12] [assist=1]
// Env: WAIT=lazy (no walking between shots) · WAIT=net (between shots pushes straight up the court until the feet are
// 1.4 m from the net, like someone who does not know where the kitchen line is) · RECOVER=1 (the setting "back into
// place between shots" on)
import { AIController, HUMAN_REACTION, HUMAN_SPEED, RIVALS } from '../../src/sim/brain';
import { HL, NVZ } from '../../src/sim/court';
import { LUNGE, Match } from '../../src/sim/match';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

const lvl = process.argv[2] ?? 'medio';
const ri = Number(process.argv[3] ?? 2);
const N = Number(process.argv[4] ?? 12);
const assist = Number(process.argv[5] ?? 1);
const wait = process.env.WAIT ?? '';
const rv = RIVALS[ri];

const out: Record<string, number> = {};
const add = (k: string, v = 1) => (out[k] = (out[k] ?? 0) + v);
const drags: Record<string, number[]> = {};
const gaps: number[] = [];
const fight = { frames: 0, pushed: 0 };
let won = 0;
let pts = 0;
for (let i = 0; i < N; i++) {
  const seed = 1000 + i * 7919;
  const bot = new ThumbBot(HUMANS[lvl], assist, seed + 17);
  const b = bot as unknown as { waitSpot(m: Match, p: unknown): { x: number; z: number } };
  if (wait === 'lazy') b.waitSpot = (_m, p) => p as { x: number; z: number };
  if (process.env.RECOVER) bot.ctl.recover = true;
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
  let key = '';
  let first: { d: number; tl: number; need: number } | null = null;
  let hitThis = false;
  let pointEnd = -1;
  let g = 0;
  while (m.phase !== 'over' && g++ < 60 * 60 * 40) {
    const r = m.rally;
    if (wait === 'net' && r && r.last && r.last.team === 0 && m.phase === 'rally' && r.shots >= 2) {
      // a person going up: pushes straight up the court and lets go once the feet look close to the net
      const s = bot.input;
      if (Math.abs(me.z) > 1.4) {
        s.stickX = 0;
        s.stickY = -1;
      } else s.stickX = s.stickY = 0;
    } else bot.tick(m);
    // the ball coming to the human
    if (r && r.last && r.last.team === 1 && m.phase === 'rally') {
      const k = `${m.stats.rallies}:${r.shots}`;
      if (k !== key) {
        key = k;
        first = null;
        hitThis = false;
        // where he stands when the rival hits
        const z = Math.abs(me.z);
        add(`stand:${z < NVZ ? '4 en cocina' : z < NVZ + 0.9 ? '3 línea' : z < HL - 1.2 ? '2 transición' : '1 fondo'}`);
      }
      const tg = m.targetFor(0);
      if (tg && !first) {
        const d = Math.hypot(tg.fx - me.x, tg.fz - me.z);
        first = { d, tl: tg.t - m.t, need: Math.max(0, d - LUNGE) / me.speed };
      }
      // the stick against where the feet go
      const sx = bot.input.stickX;
      const sy = bot.input.stickY;
      const k2 = Math.hypot(sx, sy);
      const v = Math.hypot(me.vx, me.vz);
      if (k2 > 0.3) {
        fight.pushed++;
        if (v > 0.5) {
          const c = (sx * me.vx + sy * me.vz) / (k2 * v); // viewSide 1: screen = world
          if (c < 0.5) fight.frames++;
        } else if (v < 0.2) add('pushedStill');
      }
    }
    m.update(1 / 60);
    bot.events(m.events);
    for (const e of m.events) {
      if (e.type === 'serveStart' && pointEnd >= 0) {
        gaps.push(e.at - pointEnd);
        pointEnd = -1;
      }
      if (e.type === 'hit' && e.pid === 0 && e.kind !== 'serve') {
        hitThis = true;
        if (e.timing !== 'auto') {
          const dd = Math.hypot(bot.input.dx, bot.input.dy);
          (drags[e.kind] ??= []).push(dd);
        }
        if (e.volley && Math.abs(me.z) < NVZ) add('kitchenVolleyHit');
      }
      if (e.type === 'point') {
        pts++;
        if (e.winner === 0) won++;
        pointEnd = m.t;
        if (first) {
          const slack = first.tl - first.need;
          const band = `d${first.d < 1 ? '0-1' : first.d < 2 ? '1-2' : first.d < 3 ? '2-3' : '3+'}`;
          add(`balls ${band}`);
          if (e.reason === 'miss' && e.winner === 1) {
            add(`miss ${band}`);
            add(`miss slack${slack < 0 ? '<0' : slack < 0.3 ? '0-.3' : slack < 0.6 ? '.3-.6' : '>.6'}`);
          }
        }
        if (e.reason === 'letGo' && e.winner === 1) add('letGo');
        if (e.reason === 'kitchen' && e.fault === 0) add('kitchenFault');
        if (e.winner === 1 && e.fault === null && !first) add('lost:noCircle');
      }
    }
    // later balls of the point: count the ones he hit
    if (r && r.last && r.last.team === 0 && first && hitThis) {
      const band = `d${first.d < 1 ? '0-1' : first.d < 2 ? '1-2' : first.d < 3 ? '2-3' : '3+'}`;
      add(`balls ${band}`);
      add(`hit ${band}`);
      first = null;
    }
    m.events.length = 0;
  }
}
const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(0) + '%' : '–');
console.log(`${lvl} vs ${rv.name} · ayuda ${assist} · ${N} partidos${wait ? ' · espera ' + wait : ''}: puntos ganados ${pct(won, pts)}`);
for (const k of Object.keys(out).sort()) console.log(`  ${k.padEnd(22)} ${out[k]}`);
console.log(`  stick contra los pies: ${pct(fight.frames, fight.pushed)} de los frames empujando`);
const q = (a: number[], f: number, n = 0) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(f * (a.length - 1))].toFixed(n) : '–');
for (const [k, a] of Object.entries(drags)) console.log(`  arrastre ${k.padEnd(8)} n ${String(a.length).padStart(4)} mediana ${q(a, 0.5)} px · p90 ${q(a, 0.9)} px`);
console.log(`  del final del punto al siguiente saque en juego: mediana ${q(gaps, 0.5, 2)} s · p90 ${q(gaps, 0.9, 2)} s (${gaps.length} puntos)`);
