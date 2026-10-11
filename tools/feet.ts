// CPU footwork, measured (docs/concepto.md, «Gráficos y simulación 0.5»): CPU against CPU at 60 Hz, singles Reina
// against Nuria and doubles Marta and Lola against Nuria and Reina, the first rally of each traced for plots.
// Usage: npx tsx tools/feet.ts [trace.json] [matches = 6] · FEET='{"optimism":0.05}' tries other footwork values.
//  · accel: p50 / p95 / max of |a| while moving (m/s²) · topspeed: p95 of the speed (m/s)
//  · statue: share of rally time standing still (|v| < 0.02 m/s)
//  · cutsPerMin: sharp reversals (> 120° within 0.15 s at > 1.5 m/s) per minute of rally
//  · ditherPerS: velocity sign flips at low speed (< 0.6 m/s) per second of rally (jitter)
//  · straight: path length / straight distance of each run (stop to stop, longer than 1 m)
//  · split: share of the other side's contacts after which the player slows down (or is still) within 0.3 s
//  · late: plans the player could make that ended with the feet too far from the ball at the contact
import { writeFileSync } from 'node:fs';
import { AIController, PAIRS, RIVALS, PARTNER } from '../src/sim/brain';
import { FEET, Match } from '../src/sim/match';
import type { Player } from '../src/sim/types';
if (process.env.FEET) Object.assign(FEET, JSON.parse(process.env.FEET));

const out = process.argv[2] ?? '/tmp/pb-feet.json';
const N = Number(process.argv[3] ?? 6);
const q = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
type Tr = { t: number; x: number; z: number; vx: number; vz: number }[];
function run(kind: 'singles' | 'doubles', seed: number) {
  const sk = kind === 'singles' ? [RIVALS[4], RIVALS[3]] : [PARTNER, PAIRS[1].a, PAIRS[3].a, PAIRS[3].b];
  const teams = kind === 'singles' ? [0, 1] : [0, 0, 1, 1];
  const m = new Match(sk.map((r, i) => ({ team: teams[i] as 0 | 1, human: false, speed: r.skill.speed, reaction: r.skill.reaction, look: r.look })), { scoring: 'rally', to: 11 }, seed);
  m.setControllers(sk.map((r) => new AIController(r.skill)));
  m.start();
  const tr: Tr[] = m.players.map(() => []);
  const hits: { t: number; pid: number }[] = [];
  let planned = 0, missed = 0;
  const prevPlan: (object | null)[] = m.players.map(() => null);
  let guard = 0;
  while (m.phase !== 'over' && guard++ < 60 * 60 * 30) {
    m.update(1 / 60);
    for (const e of m.events) if (e.type === 'hit') hits.push({ t: m.t, pid: e.pid });
    m.events.length = 0;
    for (const p of m.players) {
      if (m.phase === 'rally') tr[p.id].push({ t: m.t, x: p.x, z: p.z, vx: p.vx, vz: p.vz });
      if (p.plan && p.plan.reach && p.plan !== prevPlan[p.id]) planned++;
      prevPlan[p.id] = p.plan;
    }
  }
  return { tr, hits, m, planned, missed };
}
// CPU players who went for a ball they planned to reach and were too far at the contact
let cpuPlans = 0, cpuLate = 0;
{
  const P = Match.prototype as unknown as { onContact: (this: Match, p: Player, t: number) => void };
  const orig = P.onContact;
  P.onContact = function (this: Match, p: Player, t: number) {
    const pl = p.plan;
    if (pl && pl.reach) {
      cpuPlans++;
      const lg = (this.controllers[p.id].mover.lunge ?? 0);
      if (Math.hypot(p.x - pl.fx, p.z - pl.fz) > Math.max(0.5, 0.3 + lg)) cpuLate++;
    }
    return orig.call(this, p, t);
  };
}
const res: Record<string, unknown> = {};
for (const kind of ['singles', 'doubles'] as const) {
  const acc: number[] = [], top: number[] = [], straight: number[] = [];
  let still = 0, frames = 0, cuts = 0, dither = 0, splitN = 0, splitY = 0, rallyT = 0;
  let firstTrace: Tr[] | null = null;
  for (let i = 0; i < N; i++) {
    const { tr, hits } = run(kind, 500 + i * 101);
    if (!firstTrace) firstTrace = tr.map((a) => a.slice(0, 60 * 40));
    tr.forEach((a, pid) => {
      for (let j = 1; j < a.length; j++) {
        const s = a[j], r = a[j - 1];
        const dt = s.t - r.t;
        if (dt > 0.05) continue; // a new rally
        frames++;
        rallyT += dt;
        const sp = Math.hypot(s.vx, s.vz);
        if (sp < 0.02) still++;
        top.push(sp);
        const ac = Math.hypot(s.vx - r.vx, s.vz - r.vz) / dt;
        if (sp > 0.2 || Math.hypot(r.vx, r.vz) > 0.2) acc.push(ac);
        if (sp < 0.6 && sp > 0.02 && s.vx * r.vx < 0 && Math.abs(s.vx) > 0.02) dither++;
        // a sharp cut: compare with 0.15 s earlier
        const k = j - 9;
        if (k >= 0 && a[k].t > s.t - 0.2) {
          const o = a[k];
          const so = Math.hypot(o.vx, o.vz);
          if (so > 1.5 && sp > 1.5 && (o.vx * s.vx + o.vz * s.vz) / (so * sp) < -0.5) { cuts++; j += 9; }
        }
      }
      // runs: from a stop (< 0.3 m/s) to the next stop
      let st = -1, len = 0;
      for (let j = 1; j < a.length; j++) {
        const sp = Math.hypot(a[j].vx, a[j].vz);
        if (a[j].t - a[j - 1].t > 0.05) { st = -1; len = 0; continue; }
        if (st < 0) { if (sp > 0.3) { st = j - 1; len = 0; } continue; }
        len += Math.hypot(a[j].x - a[j - 1].x, a[j].z - a[j - 1].z);
        if (sp < 0.3) {
          const d = Math.hypot(a[j].x - a[st].x, a[j].z - a[st].z);
          if (d > 1) straight.push(len / d);
          st = -1;
        }
      }
      // split step: after each opponent contact, does the speed dip (≥ 30 %) within 0.3 s?
      for (const h of hits) {
        const me = tr[pid];
        const i0 = me.findIndex((s) => s.t >= h.t);
        if (i0 < 0) continue;
        const hitterTeam = h.pid; void hitterTeam;
        if ((kind === 'singles' && h.pid === pid) || (kind === 'doubles' && Math.floor(h.pid / 2) === Math.floor(pid / 2))) continue;
        splitN++;
        const v0 = Math.hypot(me[i0].vx, me[i0].vz);
        let minV = v0;
        for (let j = i0; j < me.length && me[j].t < h.t + 0.3; j++) minV = Math.min(minV, Math.hypot(me[j].vx, me[j].vz));
        if (v0 > 0.4 ? minV < v0 * 0.7 : true) splitY++;
      }
    });
  }
  const sum = {
    accel: `${q(acc, 0.5).toFixed(1)} / ${q(acc, 0.95).toFixed(1)} / ${q(acc, 1).toFixed(1)}`,
    topspeed: q(top, 0.95).toFixed(2),
    statue: ((still / frames) * 100).toFixed(1) + '%',
    cutsPerMin: (cuts / (rallyT / 60)).toFixed(1),
    ditherPerS: (dither / rallyT).toFixed(2),
    straight: `${q(straight, 0.5).toFixed(3)} (p10 ${q(straight, 0.1).toFixed(3)}, p90 ${q(straight, 0.9).toFixed(3)}, n ${straight.length})`,
    split: ((splitY / Math.max(1, splitN)) * 100).toFixed(0) + '%',
    late: `${((cpuLate / Math.max(1, cpuPlans)) * 100).toFixed(1)}% of ${cpuPlans}`,
  };
  cpuPlans = cpuLate = 0;
  console.log(kind, JSON.stringify(sum));
  res[kind] = firstTrace;
}
writeFileSync(out, JSON.stringify(res));
