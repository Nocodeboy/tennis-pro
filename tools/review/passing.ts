// Is the human's passing shot a weapon in singles (docs/notas-08-individual.md)? The real HumanController with a
// virtual thumb (like lob.ts): he serves and stays back; while the rival is back he plays a short drop to bring them in;
// once the rival is up at the net and he is back, he plays the shot of the variant, released in the middle of the
// golden window and dragged exactly (or with the error of a level: SIGMA s, AIMPX px). For each shot: did it land out
// or in the net, did the rival get a paddle on it, how clean was the reply, a forced error, and who won the point
// within the next three shots.
// npx tsx tools/review/passing.ts [rival=3] [shots per variant=150] [assist=1]
// Env: ONLY=linea,cruzado · SIGMA=0.085 AIMPX=14 (a medium thumb instead of an exact one) · SINGLES='{…}'.
import { makeMatch, end } from './harness';
import { servePulse } from '../../src/human';
import { HL } from '../../src/sim/court';
import * as brain from '../../src/sim/brain';
import { IDEAL_RELEASE, type Match } from '../../src/sim/match';
import type { Player } from '../../src/sim/types';

const SINGLES = (brain as Record<string, unknown>).SINGLES as Record<string, unknown> | undefined;
if (process.env.SINGLES && SINGLES) Object.assign(SINGLES, JSON.parse(process.env.SINGLES));
const rival = Number(process.argv[2] ?? 3);
const N = Number(process.argv[3] ?? 150);
const assist = Number(process.argv[4] ?? 1);
const only = process.env.ONLY?.split(',');
const SIGMA = Number(process.env.SIGMA ?? 0);
const AIMPX = Number(process.env.AIMPX ?? 0);
const PX = 33;
let seedR = 777;
const rnd = () => (seedR = (seedR * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
// drag (px) for a target x across, d from the net (the near side's view, HumanController.aim)
const drag = (x: number, d: number) => ({ dx: x * PX + gauss() * AIMPX, dy: (4.3 - d) * PX * 0.88 + gauss() * AIMPX });
// the variants: where to, from the contact (bx: the ball's x at his contact) and where the rival stands
type V = (bx: number, opp: Player) => { dx: number; dy: number };
const own = (bx: number) => Math.sign(bx) || 1;
const VARIANTS: Record<string, V> = {
  'linea 2,2': (bx) => drag(own(bx) * 2.2, HL - 1.2),
  'linea 2,7': (bx) => drag(own(bx) * 2.7, HL - 1.2),
  'cruzado 2,2': (bx) => drag(-own(bx) * 2.2, HL - 1.6),
  'cruzado 2,7': (bx) => drag(-own(bx) * 2.7, HL - 1.6),
  'cruzado corto': (bx) => drag(-own(bx) * 2.6, 3.6),
  'hueco 2,7': (_bx, o) => drag(-(Math.sign(o.x) || 1) * 2.7, HL - 1.4),
  cuerpo: (_bx, o) => drag(o.x, Math.min(HL - 1, Math.abs(o.z) + 0.6)),
  globo: (_bx, o) => ({ ...drag(-(Math.sign(o.x) || 1) * 1.4, 0), dy: (4.3 - (HL + 1.9)) * PX * 0.88 }),
};

const rows: string[] = [];
const q50 = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
for (const [name, fn] of Object.entries(VARIANTS)) {
  if (only && !only.some((o) => name.startsWith(o))) continue;
  let n = 0;
  let out = 0;
  let touched = 0;
  let replyQ = 0;
  let forced = 0;
  let won = 0;
  let lost = 0;
  let speed = 0;
  let seed = 1;
  const stretches: number[] = [];
  let ptr = Number(process.env.PTRACE ?? 0);
  let shotAt = { hx: 0, hz: 0, ox: 0, oz: 0, t: 0 };
  let volleys = 0;
  const zs: number[] = [];
  while (n < N && seed < 4000) {
    const { m, input } = makeMatch(rival, 5000 + seed++ * 31, 'assist', assist);
    let key = '';
    let t0 = 0;
    let shotNo = -1;
    let aiming = false;
    let released = false;
    let held = 0;
    let relE = IDEAL_RELEASE;
    let g = 0;
    // (how far the rival reached for each ball)
    let lastStretch = 0;
    const ai = m.controllers[1];
    const h0 = ai.hit.bind(ai);
    ai.hit = (mm, p, plan) => {
      lastStretch = plan.stretch ?? 0;
      return h0(mm, p, plan);
    };
    while (m.phase !== 'over' && g++ < 60 * 60 * 20 && n < N) {
      const me = m.players[0];
      const opp = m.players[1];
      if (m.phase === 'serve' && m.server() === me) {
        if (!input.pressing) {
          input.pressing = true;
          input.dy = -10;
          input.dx = 0;
          held = 0;
        } else if ((held += 1 / 60) > 0.3 && servePulse(m.t) < 0.2) end(input);
      }
      const r = m.rally;
      if (m.phase === 'rally' && r && r.last) {
        if (r.last.team === 1) {
          if (key !== `${m.stats.rallies}:${r.shots}`) {
            key = `${m.stats.rallies}:${r.shots}`;
            t0 = m.t;
            released = false;
            input.clear();
            // the shot under test: the rival up at the net, him back, once per point
            aiming = shotNo < 0 && r.shots >= 2 && Math.abs(opp.z) < 3.6;
            relE = IDEAL_RELEASE + gauss() * SIGMA;
          }
          const tg = m.targetFor(0);
          // the left thumb: to the circle after a person's moment
          if (m.t - t0 > 0.25 && tg) {
            const dx = tg.fx - me.x;
            const dz = tg.fz - me.z;
            const d = Math.hypot(dx, dz);
            if (d > 0.35) {
              input.stickX = dx / d;
              input.stickY = dz / d;
            } else input.stickX = input.stickY = 0;
          } else input.stickX = input.stickY = 0;
          const hp = m.humanPlan();
          if (tg && m.t - t0 > 0.15 && !released) {
            if (!input.pressing) {
              const a = aiming && Math.abs(tg.fz) > 4.6 ? fn(tg.bx, opp) : drag((rnd() - 0.5) * 2, 1.6);
              input.pressing = true;
              input.dx = a.dx;
              input.dy = a.dy;
            }
            if (hp && hp.plan.reach && hp.plan.t - m.t <= relE) {
              released = true;
              end(input);
            }
          }
        } else {
          // his ball is away: back to the baseline, across to the middle
          const dx = -me.x * 0.6;
          const dz = HL + 0.2 - me.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.3) {
            input.stickX = dx / d;
            input.stickY = dz / d;
          } else input.stickX = input.stickY = 0;
        }
      }
      m.update(1 / 60);
      for (const e of m.events) {
        if (e.type === 'hit' && e.pid === 0 && aiming && shotNo < 0 && Math.abs(e.z) > 4.6 && Math.abs(opp.z) < 3.6) {
          shotNo = e.shot;
          n++;
          speed += e.speed;
          shotAt = { hx: e.x, hz: e.z, ox: opp.x, oz: opp.z, t: m.t };
        }
        if (e.type === 'hit' && e.pid === 1 && shotNo >= 0 && e.shot === shotNo + 1) {
          touched++;
          replyQ += e.q;
          stretches.push(lastStretch);
          if (ptr-- > 0) console.log(`    ${name}: golpea en x ${shotAt.hx.toFixed(2)} z ${shotAt.hz.toFixed(1)} · rival en x ${shotAt.ox.toFixed(2)} z ${shotAt.oz.toFixed(2)} · la volea en x ${e.x.toFixed(2)} z ${e.z.toFixed(2)} a los ${(m.t - shotAt.t).toFixed(2)} s, pies en ${opp.x.toFixed(2)} (corre ${Math.hypot(opp.x - shotAt.ox, opp.z - shotAt.oz).toFixed(2)} m), estirada ${lastStretch.toFixed(2)}, q ${e.q.toFixed(2)}`);
          if (e.volley) volleys++;
          zs.push(Math.abs(e.z));
        }
        if (e.type === 'point') {
          if (shotNo >= 0) {
            if ((e.reason === 'out' || e.reason === 'net') && e.fault === 0 && e.rally === shotNo) out++;
            if ((e.reason === 'out' || e.reason === 'net') && e.fault === 1 && e.rally === shotNo + 1) forced++;
            if (e.rally <= shotNo + 3) e.winner === 0 ? won++ : lost++;
          }
          shotNo = -1;
          aiming = false;
          input.clear();
          input.stickX = input.stickY = 0;
          key = '';
        }
      }
      m.events.length = 0;
    }
  }
  const p = (x: number) => `${((100 * x) / Math.max(1, n)).toFixed(0).padStart(3)} %`;
  rows.push(`${name.padEnd(14)} ${String(n).padStart(4)} · ${(speed / Math.max(1, n)).toFixed(1)} m/s · fuera/red ${p(out)} · la toca ${p(touched)} (calidad ${(replyQ / Math.max(1, touched)).toFixed(2)}, estirada p50 ${q50(stretches).toFixed(2)}, de volea ${p(volleys)}, a ${q50(zs).toFixed(1)} m de la red) · error forzado ${p(forced)} · en 3 golpes: ganas ${p(won)}, pierdes ${p(lost)}`);
}
const rv = brain.RIVALS[rival];
console.log(`passing contra ${rv.name} en la red (ayuda ${assist}${SIGMA || AIMPX ? `, pulgar ±${SIGMA * 1000} ms ±${AIMPX} px` : ', suelta perfecta'}):`);
for (const r of rows) console.log(`  ${r}`);
