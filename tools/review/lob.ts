// B7: is the lob a weapon? The real HumanController with a virtual thumb (like exploit.ts) plays the automatic reset
// until the rival is up at the net, then lobs over them with a short, medium or deep drag (perfect release). For each
// lob: did it land out, did the rival smash it, and who won the point.
// npx tsx tools/review/lob.ts [rival=4] [lobs per depth=200] [assist=1]
import { makeMatch, end } from './harness';
import { servePulse } from '../../src/human';
import { HL, NET_C } from '../../src/sim/court';

const rival = Number(process.argv[2] ?? 4);
const N = Number(process.argv[3] ?? 200);
const assist = Number(process.argv[4] ?? 1);
const PX = 33;
// drag (px) for a lob of graduation f (0 short … 1 deep): d = HL + 0.55 + f·1.85, dy = (4.3 − d)·PX·0.88
const lobDy = (f: number) => (4.3 - (HL + 0.6 + f * 1.8)) * PX * 0.88;

for (const [name, f] of [
  ['corto', 0],
  ['medio', 0.5],
  ['profundo', 1],
] as const) {
  let lobs = 0;
  let out = 0;
  let smashed = 0;
  let won = 0;
  let lost = 0;
  let replyQ = 0;
  let replies = 0;
  let sitter = 0;
  let seed = 3;
  while (lobs < N) {
    const { m, input } = makeMatch(rival, 9000 + seed++ * 17, 'assist', assist);
    let key = '';
    let t0 = 0;
    let lobbing = false;
    let lobShot = -1;
    let released = false;
    let held = 0;
    let g = 0;
    while (m.phase !== 'over' && g++ < 60 * 60 * 30 && lobs < N) {
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
          if (key !== `${r.shots}`) {
            key = `${r.shots}`;
            t0 = m.t;
            released = false;
            // lob only over a rival at the net, once the rally is under way, once per point
            lobbing = lobShot < 0 && r.shots >= 4 && Math.abs(opp.z) < 3.6;
          }
          const tg = m.targetFor(0);
          if (m.t - t0 > 0.3 && tg) {
            const dx = tg.fx - me.x;
            const dz = tg.fz - me.z;
            const d = Math.hypot(dx, dz);
            if (d > 0.4) {
              input.stickX = dx / d;
              input.stickY = dz / d;
            } else input.stickX = input.stickY = 0;
          } else input.stickX = input.stickY = 0;
          const hp = m.humanPlan();
          // after the lob, a ball that sits up gets put away to the open side, as a person would
          const attack = !lobbing && lobShot >= 0 && !!tg && tg.by > NET_C + 0.2;
          if ((lobbing || attack) && m.t - t0 > 0.15) {
            if (!input.pressing && !released) {
              input.pressing = true;
              input.dx = -Math.sign(opp.x || 1) * (lobbing ? 1.2 : 2.2) * PX;
              input.dy = lobbing ? lobDy(f) : (4.3 - 5.2) * PX * 0.88;
            }
            if (!released && hp && hp.plan.reach && hp.plan.t - m.t <= 0.12) {
              released = true;
              end(input);
            }
          }
        } else {
          const hz = r.shots >= 2 ? 2.6 : 6.9;
          const dx = me.x * 0.5 - me.x;
          const dz = hz - me.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.3) {
            input.stickX = dx / d;
            input.stickY = dz / d;
          } else input.stickX = input.stickY = 0;
        }
      }
      m.update(1 / 60);
      for (const e of m.events) {
        if (e.type === 'hit' && e.pid === 0 && e.kind === 'lob' && lobShot < 0) {
          lobShot = e.shot;
          lobs++;
        }
        if (e.type === 'hit' && e.pid === 1 && lobShot >= 0 && e.shot === lobShot + 1) {
          if (e.kind === 'smash') smashed++;
          replyQ += e.q;
          replies++;
        }
        // the human's next ball: does the reply to the lob sit up for him?
        if (e.type === 'hit' && e.pid === 0 && lobShot >= 0 && e.shot === lobShot + 2 && e.y > 1.06) sitter++;
        if (e.type === 'point') {
          if (lobShot >= 0) {
            if (e.reason === 'out' && e.fault === 0 && e.rally === lobShot) out++;
            if (e.rally <= lobShot + 3) e.winner === 0 ? won++ : lost++;
          }
          lobShot = -1;
          input.clear();
          input.stickX = input.stickY = 0;
          key = '';
        }
      }
      m.events.length = 0;
    }
  }
  const p = (x: number) => `${((100 * x) / lobs).toFixed(0)} %`;
  console.log(`globo ${name.padEnd(9)} (rival ${rival}): ${lobs} globos · fuera ${p(out)} · remate del rival ${p(smashed)} · calidad de su respuesta ${(replyQ / Math.max(1, replies)).toFixed(2)} · te deja una bola alta ${p(sitter)} · en 3 golpes: ganas ${p(won)}, pierdes ${p(lost)}`);
}
