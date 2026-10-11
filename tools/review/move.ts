// The players' feet in real points (docs/concepto.md, «Control y simulación 0.6»). Twelve matches as in the 0.5
// review (scratchpad contact-speed.ts): the even ones the thumb bot (tools/thumb.ts, the real HumanController and
// Input) against Lola … Reina, the odd ones CPU against CPU.
//  · the human's start and stop: time from still to 4 m/s, acceleration while moving (p50 / p95 / max), the hardest stop;
//  · the contact: how fast the hitter's feet go at the contact and 0.15 s after (CPU and human), share above 2 m/s;
//  · parking: how far from the circle the feet are at the contact when the assist parked him, and how far he ran past it;
//  · reach: balls the human went for and missed, plans the CPU thought it could make and did not.
// npx tsx tools/review/move.ts [matches=12] [assist=1]
import { AIController, HUMAN_REACTION, HUMAN_SPEED, RIVALS } from '../../src/sim/brain';
import { Match, type Controller } from '../../src/sim/match';
import type { Plan, Player } from '../../src/sim/types';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

const N = Number(process.argv[2] ?? 12);
const assist = Number(process.argv[3] ?? 1);
const q = (a: number[], p: number) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '–');

// CPU plans that should have been made and were not (as tools/feet.ts)
let cpuPlans = 0;
let cpuLate = 0;
{
  const P = Match.prototype as unknown as { onContact: (this: Match, p: Player, t: number) => void };
  const orig = P.onContact;
  P.onContact = function (this: Match, p: Player, t: number) {
    const pl = p.plan;
    if (pl && pl.reach && !p.human) {
      cpuPlans++;
      const lg = this.controllers[p.id].mover.lunge ?? 0;
      if (Math.hypot(p.x - pl.fx, p.z - pl.fz) > Math.max(0.5, 0.3 + lg)) cpuLate++;
    }
    return orig.call(this, p, t);
  };
}

const contact: Record<string, { at: number[]; after: number[] }> = {};
const push = (k: string, at: number, after: number) => {
  const r = (contact[k] ??= { at: [], after: [] });
  r.at.push(at);
  r.after.push(after);
};
const to4: number[] = [];
const accUp: number[] = [];
const accDown: number[] = [];
const stopT: number[] = [];
const parkGap: number[] = [];
const overrun: number[] = [];
let humanPts = 0;
let humanMiss = 0;
let humanLost = 0;
let humanWon = 0;

for (let i = 0; i < N; i++) {
  const rv = RIVALS[1 + (i % 4)];
  const human = i % 2 === 0;
  const bot = new ThumbBot(HUMANS[['novato', 'medio', 'bueno'][i % 3]], assist, 1000 + i);
  const m = new Match(
    [
      { team: 0, human, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
      { team: 1, human: false, speed: rv.skill.speed, reaction: rv.skill.reaction, look: rv.look },
    ],
    { scoring: 'rally', to: 11 },
    77 + i,
  );
  m.setControllers([human ? (bot.ctl as unknown as Controller) : new AIController(RIVALS[(i + 2) % 5].skill), new AIController(rv.skill)]);
  if (human) bot.attach(m);
  m.start();
  const me = m.players[0];
  const pending: { pid: number; t: number; at: number }[] = [];
  let startAt = -1;
  let stopFrom = -1;
  let pv = { x: 0, z: 0 };
  // parking: the circle of this ball, the closest he got and how far past it he went after that
  let tgNow: Plan | null = null;
  let closest = Infinity;
  let past = 0;
  for (let f = 0; f < 60 * 300 && m.phase !== 'over'; f++) {
    if (human) bot.tick(m);
    m.update(1 / 60);
    for (const e of m.events) {
      if (e.type === 'hit' && e.kind !== 'serve') {
        const p = m.players[e.pid];
        pending.push({ pid: e.pid, t: m.t, at: Math.hypot(p.vx, p.vz) });
        if (human && e.pid === 0 && tgNow && closest < 0.15) {
          parkGap.push(Math.hypot(me.x - tgNow.fx, me.z - tgNow.fz));
          overrun.push(past);
        }
      }
      if (human && e.type === 'point') {
        humanPts++;
        if (e.winner === 0) humanWon++;
        else {
          humanLost++;
          if (e.reason === 'miss') humanMiss++;
        }
      }
    }
    if (human) bot.events(m.events);
    m.events.length = 0;
    for (let k = pending.length - 1; k >= 0; k--) {
      const c = pending[k];
      if (m.t - c.t >= 0.15) {
        const p = m.players[c.pid];
        push(p.human ? 'humano' : 'CPU', c.at, Math.hypot(p.vx, p.vz));
        pending.splice(k, 1);
      }
    }
    if (!human) continue;
    // the human's feet, frame by frame
    const v = Math.hypot(me.vx, me.vz);
    const v0 = Math.hypot(pv.x, pv.z);
    if (m.phase === 'rally') {
      const a = Math.hypot(me.vx - pv.x, me.vz - pv.z) * 60;
      // (not the frames where a wall stops him: the net, the kitchen line, the fence)
      const wall = (me.vx === 0 && pv.x !== 0) || (me.vz === 0 && pv.z !== 0);
      if (!wall && v > v0 + 1e-3 && (v > 0.2 || v0 > 0.2)) accUp.push(a);
      else if (!wall && v < v0 - 1e-3) accDown.push(a);
      // starts from still: not the walk off after his own contact (the follow-through holds him back on purpose)
      if (v0 < 0.3 && v >= 0.3) startAt = m.stance(0) === 'follow' ? -1 : m.t - 1 / 60;
      if (startAt >= 0 && v >= 4) {
        to4.push(m.t - startAt);
        startAt = -1;
      }
      if (v < 0.3) startAt = v0 < 0.3 ? startAt : -1;
      if (v0 >= 3.5 && v < 3.5 && stopFrom < 0) stopFrom = m.t;
      if (stopFrom >= 0 && v < 0.3) {
        stopT.push(m.t - stopFrom);
        stopFrom = -1;
      }
      if (stopFrom >= 0 && v > v0 + 0.05) stopFrom = -1;
    } else startAt = stopFrom = -1;
    pv = { x: me.vx, z: me.vz };
    const tg = m.targetFor(0);
    if (tg !== tgNow) {
      tgNow = tg;
      closest = Infinity;
      past = 0;
    }
    if (tg) {
      const d = Math.hypot(me.x - tg.fx, me.z - tg.fz);
      if (closest < 0.05) past = Math.max(past, d - closest);
      closest = Math.min(closest, d);
    }
  }
}
console.log(`ayuda ${assist} · ${N} partidos (pares: bot de pulgares contra Lola … Reina; impares: CPU contra CPU)`);
console.log(`humano · de quieto a 4 m/s: mediana ${f2(q(to4, 0.5))} s (p10 ${f2(q(to4, 0.1))}, p90 ${f2(q(to4, 0.9))}, n ${to4.length})`);
console.log(`humano · aceleración al arrancar p50 ${q(accUp, 0.5).toFixed(1)} · p95 ${q(accUp, 0.95).toFixed(1)} · p99 ${q(accUp, 0.99).toFixed(1)} m/s²`);
console.log(`humano · frenada p50 ${q(accDown, 0.5).toFixed(1)} · p95 ${q(accDown, 0.95).toFixed(1)} · p99 ${q(accDown, 0.99).toFixed(1)} m/s² · de 3,5 m/s a parado ${f2(q(stopT, 0.5))} s (n ${stopT.length})`);
console.log(`humano · aparcado: a ${(q(parkGap, 0.5) * 100).toFixed(1)} cm del círculo en el contacto (p90 ${(q(parkGap, 0.9) * 100).toFixed(1)} cm) · se pasa p50 ${(q(overrun, 0.5) * 100).toFixed(1)} cm, p90 ${(q(overrun, 0.9) * 100).toFixed(1)} cm (n ${parkGap.length})`);
console.log(`humano · puntos ganados ${((humanWon / humanPts) * 100).toFixed(0)}% · perdidos por «No llegas» ${((humanMiss / humanPts) * 100).toFixed(1)}% de los puntos`);
console.log(`CPU · planes alcanzables que no llegan ${((cpuLate / Math.max(1, cpuPlans)) * 100).toFixed(1)}% de ${cpuPlans}`);
for (const [k, r] of Object.entries(contact)) {
  const fast = r.at.filter((v) => v > 2).length / r.at.length;
  console.log(`${k.padEnd(7)} n ${String(r.at.length).padStart(4)} · pies en el contacto p50 ${f2(q(r.at, 0.5))} p90 ${f2(q(r.at, 0.9))} · >2 m/s ${(fast * 100).toFixed(0)}% · 0,15 s después p50 ${f2(q(r.after, 0.5))} p90 ${f2(q(r.after, 0.9))}`);
}
