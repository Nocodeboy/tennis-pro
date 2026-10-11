// Why the thumb bot loses points to «No llegas» (docs/concepto.md, «Control y simulación 0.7»). For every ball that
// comes to the human (singles), from the moment the rival hits it:
//  · the first suggested spot: how far it was, how much time there was, how late it showed up;
//  · the bot's thumb for that ball: reaction, whether it lets the stick go near the circle or holds it, aim or not;
//  · his feet then: how long since his own contact (the follow-through), how fast he was going;
//  · whether the ball could be reached at all with his feet (HUMAN_FEET, footStep) and his reach (REFLEX), pushing
//    straight at a contact from the rival's hit + R seconds: the first suggested spot, and the best of all legal contacts (any moment, either hand),
//    for R = 0, 0.25 s and the bot's own reaction;
//  · how close he got to the spot of the last circle.
// The misses are split by what an ideal thumb with each reaction could have done; the reached balls are the reference.
// npx tsx tools/review/miss.ts [level=novato] [rivals=1,2,3] [matches=16] [assist=1]
// Env: as tools/bot.ts (FEET, HFEET, SUGGEST, ASSIST, REFLEX, CPU_LUNGE, SHANK) · DUMP=n prints the first n misses ·
// TRACE=n also prints them frame by frame.
import { AIController, HUMAN_REACTION, HUMAN_SPEED, RIVALS, SHANK } from '../../src/sim/brain';
import { bounce, groundTime, posAt, type Seg } from '../../src/sim/ball';
import { NVZ, inHalf } from '../../src/sim/court';
import { ASSIST, CPU_LUNGE, FEET, HUMAN_FEET, LUNGE, Match, REFLEX, SUGGEST, footStep } from '../../src/sim/match';
import type { Plan } from '../../src/sim/types';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

if (process.env.FEET) Object.assign(FEET, JSON.parse(process.env.FEET));
if (process.env.HFEET) Object.assign(HUMAN_FEET, JSON.parse(process.env.HFEET));
if (process.env.SUGGEST) Object.assign(SUGGEST, JSON.parse(process.env.SUGGEST));
if (process.env.ASSIST) Object.assign(ASSIST, JSON.parse(process.env.ASSIST));
if (process.env.REFLEX) Object.assign(REFLEX, JSON.parse(process.env.REFLEX));
if (process.env.CPU_LUNGE) Object.assign(CPU_LUNGE, JSON.parse(process.env.CPU_LUNGE));
if (process.env.SHANK) Object.assign(SHANK, JSON.parse(process.env.SHANK));
const lvl = process.argv[2] ?? 'novato';
const rivals = (process.argv[3] ?? '1,2,3').split(',').map(Number);
const N = Number(process.argv[4] ?? 16);
const assist = Number(process.argv[5] ?? 1);
const DUMP = Number(process.env.DUMP ?? 0);
const TRACE = Number(process.env.TRACE ?? 0);

interface St {
  x: number;
  z: number;
  vx: number;
  vz: number;
}
/** gap (m) to (fx, fz) at time tc, pushing straight at it from oppT + R (feet as in Match.movePlayers, no assist) */
function gapAt(st: St, tNow: number, oppT: number, followUntil: number, R: number, fx: number, fz: number, tc: number): number {
  const p = { vx: st.vx, vz: st.vz };
  let x = st.x;
  let z = st.z;
  const h = 1 / 120;
  const F = HUMAN_FEET;
  for (let t = tNow; t < tc - 1e-9; t += h) {
    let wx = 0;
    let wz = 0;
    if (t - oppT >= R) {
      const dx = fx - x;
      const dz = fz - z;
      const d = Math.hypot(dx, dz);
      const want = Math.min(HUMAN_SPEED, d < 0.006 ? 0 : Math.sqrt(2 * F.park * (d - 0.004)));
      if (d > 1e-4) {
        wx = (dx / d) * want;
        wz = (dz / d) * want;
      }
    }
    let upCap = Infinity;
    let upMul = 1;
    if (t < followUntil) {
      const w = Math.hypot(wx, wz);
      if (w > F.followV) {
        wx *= F.followV / w;
        wz *= F.followV / w;
      }
      upCap = F.followUp;
    } else if (t - oppT < F.split) upCap = F.splitUp;
    else if (t - oppT < F.split + F.load) upMul = F.loadUp;
    footStep(p, wx, wz, h, HUMAN_SPEED, F, upCap, upMul);
    x += p.vx * h;
    z += p.vz * h;
  }
  return Math.hypot(fx - x, fz - z);
}

/** how far from a spot he can still hit a ball met `e` s after the rival's contact (Match.reachAt, REFLEX) */
const reachFor = (e: number) => LUNGE * (REFLEX.min + (1 - REFLEX.min) * Math.max(0, Math.min(1, (e - REFLEX.from) / Math.max(1e-3, REFLEX.full - REFLEX.from))));

/** the legal contacts of the ball in flight `s` for a player on `side` (as Match.planContact, suggest: in-balls only) */
function contacts(s1: Seg, side: 1 | -1, shots: number, t0: number): { t: number; fx: number; fz: number; y: number; volley: boolean }[] {
  const tg1 = groundTime(s1);
  const g1 = posAt(s1, tg1);
  if (!inHalf(g1.x, g1.z, side)) return [];
  const s2 = bounce(s1, tg1);
  const tg2 = groundTime(s2);
  const out: { t: number; fx: number; fz: number; y: number; volley: boolean }[] = [];
  for (let t = t0; t < tg2; t += 1 / 60) {
    const bounced = t > tg1;
    if (shots < 3 && !bounced) continue;
    const bp = posAt(bounced ? s2 : s1, t);
    if (bp.z * side < 0.35 || bp.y < 0.14 || bp.y > 2.75) continue;
    const overhead = bp.y > 1.75;
    for (const hand of [1, -1]) {
      const fx = bp.x - side * hand * 0.55;
      const fz = bp.z + side * (overhead ? 0.35 : 0.2);
      if (fz * side < 0.3) continue;
      if (!bounced && fz * side < NVZ + 0.18) continue;
      out.push({ t, fx, fz, y: bp.y, volley: !bounced });
    }
  }
  return out;
}

interface Ball {
  rival: string;
  t0: number;
  kind: string;
  speed: number;
  st: St;
  tNow: number;
  sinceOwn: number;
  followUntil: number;
  react: number;
  hold: number;
  aim: boolean;
  segAt: Seg;
  shots: number;
  first: { at: number; d: number; tl: number; plan: Plan } | null;
  changes: number;
  last: Plan | null;
  closest: number;
  hit: boolean;
  /** first suggested spot / best legal contact reachable with R = 0, 0.25, the bot's reaction */
  firstOk: boolean[];
  bestOk: boolean[];
  /** the largest reaction (s) that still makes some legal contact */
  maxR: number;
  log: string[];
  /** the first circle: the spot for the other hand at the same moment, how far it was */
  otherD: number;
  /** the circle went away before the contact: how far he was from it, the time left, and whether some legal contact
   * could still be made from there (pushing straight at once) */
  vanish: { d: number; left: number; still: boolean } | null;
}

const balls: Ball[] = [];
const missed: Ball[] = [];
let pts = 0;
let lost = 0;
for (const ri of rivals) {
  const rv = RIVALS[ri];
  for (let i = 0; i < N; i++) {
    const seed = 1000 + i * 7919;
    const bot = new ThumbBot(HUMANS[lvl], assist, seed + 17);
    const bi = bot as unknown as { react: number; holdUntil: number; wantAim: boolean; ball: string };
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
    let cur: Ball | null = null;
    let g = 0;
    while (m.phase !== 'over' && g++ < 60 * 60 * 40) {
      bot.tick(m);
      m.update(1 / 60);
      bot.events(m.events);
      const r = m.rally;
      if (m.phase === 'rally' && r && r.last && r.last.team === 1) {
        const k = `${m.stats.rallies}:${r.shots}`;
        if (k !== key) {
          key = k;
          const lh = r.last.lastHit!;
          const v = m.ballVel()!;
          const fu = me.lastHit ? me.lastHit.t + (['dink', 'drop', 'auto'].includes(me.lastHit.kind) ? HUMAN_FEET.followSoft : HUMAN_FEET.follow) : -1;
          cur = { rival: rv.name, t0: lh.t, kind: lh.kind, speed: Math.hypot(v.x, v.z), st: { x: me.x, z: me.z, vx: me.vx, vz: me.vz }, tNow: m.t, sinceOwn: me.lastHit ? lh.t - me.lastHit.t : 9, followUntil: fu, react: -1, hold: 0, aim: false, segAt: r.seg, shots: r.shots, first: null, changes: 0, last: null, closest: Infinity, hit: false, firstOk: [], bestOk: [], maxR: -1, log: [], otherD: NaN, vanish: null };
          balls.push(cur);
        }
        if (cur) {
          if (cur.react < 0 && bi.ball === key) {
            cur.react = bi.react;
            cur.hold = bi.holdUntil;
            cur.aim = bi.wantAim;
          }
          const tg = m.targetFor(0);
          if (tg && !cur.first) {
            cur.first = { at: m.t - cur.t0, d: Math.hypot(tg.fx - me.x, tg.fz - me.z), tl: tg.t - m.t, plan: tg };
            const ox = tg.bx + tg.hand * 0.55 * me.side;
            cur.otherD = Math.hypot(ox - me.x, tg.fz - me.z);
          }
          if (!tg && cur.last && !cur.vanish && !cur.hit && cur.last.t > m.t + 1 / 60) {
            const cs = contacts(r.seg, me.side, r.shots, m.t + 1 / 240);
            const st = { x: me.x, z: me.z, vx: me.vx, vz: me.vz };
            const still = cs.some((c) => gapAt(st, m.t, cur!.t0, cur!.followUntil, 0, c.fx, c.fz, c.t) <= reachFor(c.t - cur!.t0));
            cur.vanish = { d: Math.hypot(cur.last.fx - me.x, cur.last.fz - me.z), left: cur.last.t - m.t, still };
          }
          if (tg && cur.last && tg !== cur.last) cur.changes++;
          if (tg) cur.last = tg;
          if (cur.last) cur.closest = Math.min(cur.closest, Math.hypot(cur.last.fx - me.x, cur.last.fz - me.z));
          if (TRACE) {
            const lk = (m as unknown as { locks: unknown[] }).locks[0];
            cur.log.push(`    +${(m.t - cur.t0).toFixed(2)} yo (${me.x.toFixed(2)}, ${me.z.toFixed(2)}) v ${Math.hypot(me.vx, me.vz).toFixed(1)} stick (${bot.input.stickX.toFixed(1)}, ${bot.input.stickY.toFixed(1)}) ${m.stance(0) ?? '-'} ${lk ? 'lock' : '    '} círculo ${tg ? `(${tg.fx.toFixed(2)}, ${tg.fz.toFixed(2)}) en ${(tg.t - m.t).toFixed(2)} s a ${Math.hypot(tg.fx - me.x, tg.fz - me.z).toFixed(2)} m${tg.volley ? ' volea' : ''}` : '—'} plan ${me.plan ? `${me.plan.reach ? 'sí' : 'no'} ${(me.plan.t - m.t).toFixed(2)}` : '—'}`);
          }
        }
      }
      for (const e of m.events) {
        if (e.type === 'hit' && e.pid === 0 && cur) cur.hit = true;
        if (e.type === 'point') {
          pts++;
          if (e.winner === 1) lost++;
          if (e.winner === 1 && e.reason === 'miss' && cur && !cur.hit) missed.push(cur);
          cur = null;
          key = '';
        }
      }
      m.events.length = 0;
    }
  }
}

// reachability of the misses and of a sample of the reached balls
const Rs = (b: Ball) => [0, 0.25, b.react];
function judge(b: Ball) {
  const cs = contacts(b.segAt, 1, b.shots, b.t0 + 1 / 240);
  const ok = (R: number, c: { t: number; fx: number; fz: number }) => gapAt(b.st, b.tNow, b.t0, b.followUntil, R, c.fx, c.fz, c.t) <= reachFor(c.t - b.t0);
  b.firstOk = b.first ? Rs(b).map((R) => ok(R, { t: b.first!.plan.t, fx: b.first!.plan.fx, fz: b.first!.plan.fz })) : [false, false, false];
  b.bestOk = Rs(b).map((R) => cs.some((c) => ok(R, c)));
  b.maxR = -1;
  for (let R = 0; R <= 0.8; R += 0.05) if (cs.some((c) => ok(R, c))) b.maxR = R;
}
for (const b of missed) judge(b);
const reached = balls.filter((b) => b.hit && b.first);
const sample = reached.filter((_, i) => i % 5 === 0);
for (const b of sample) judge(b);

const pc = (a: number, n: number) => `${n ? ((a / n) * 100).toFixed(0) : '–'}%`;
const q = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};
const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '–');
const show = (name: string, bs: Ball[]) => {
  const n = bs.length;
  const fb = bs.filter((b) => b.first);
  console.log(`\n${name} (n ${n})`);
  console.log(`  golpe rival: ${Object.entries(bs.reduce((o, b) => ((o[b.kind] = (o[b.kind] ?? 0) + 1), o), {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pc(v, n)}`).join(' · ')}`);
  console.log(`  bola: ${f2(q(bs.map((b) => b.speed), 0.5))} m/s (p90 ${f2(q(bs.map((b) => b.speed), 0.9))})`);
  console.log(`  primer círculo: sale a los ${f2(q(fb.map((b) => b.first!.at), 0.5))} s (p90 ${f2(q(fb.map((b) => b.first!.at), 0.9))}) · a ${f2(q(fb.map((b) => b.first!.d), 0.5))} m (p90 ${f2(q(fb.map((b) => b.first!.d), 0.9))}) · tiempo ${f2(q(fb.map((b) => b.first!.tl), 0.5))} s (p10 ${f2(q(fb.map((b) => b.first!.tl), 0.1))}) · volea ${pc(fb.filter((b) => b.first!.plan.volley).length, fb.length)} · cambia ${f2(fb.reduce((a, b) => a + b.changes, 0) / Math.max(1, fb.length))} veces`);
  console.log(`  pulgar: reacción ${f2(q(bs.map((b) => b.react), 0.5))} s (p90 ${f2(q(bs.map((b) => b.react), 0.9))}) · mantiene el stick ${pc(bs.filter((b) => b.hold >= 0).length, n)} · apunta ${pc(bs.filter((b) => b.aim).length, n)}`);
  console.log(`  pies: desde su golpe ${f2(q(bs.map((b) => b.sinceOwn), 0.5))} s (p10 ${f2(q(bs.map((b) => b.sinceOwn), 0.1))}) · en el final del golpe al pegar el rival ${pc(bs.filter((b) => b.followUntil > b.t0).length, n)} · velocidad ${f2(q(bs.map((b) => Math.hypot(b.st.vx, b.st.vz)), 0.5))} m/s`);
  const j = bs.filter((b) => b.bestOk.length);
  if (j.length) {
    const nj = j.length;
    console.log(`  alcanzable el primer círculo con reacción 0 / 0,25 s / la suya: ${pc(j.filter((b) => b.firstOk[0]).length, nj)} / ${pc(j.filter((b) => b.firstOk[1]).length, nj)} / ${pc(j.filter((b) => b.firstOk[2]).length, nj)}`);
    console.log(`  alcanzable algún contacto con reacción 0 / 0,25 s / la suya: ${pc(j.filter((b) => b.bestOk[0]).length, nj)} / ${pc(j.filter((b) => b.bestOk[1]).length, nj)} / ${pc(j.filter((b) => b.bestOk[2]).length, nj)}`);
    console.log(`  reacción máxima que aún llega: p10 ${f2(q(j.map((b) => b.maxR), 0.1))} · p50 ${f2(q(j.map((b) => b.maxR), 0.5))} · p90 ${f2(q(j.map((b) => b.maxR), 0.9))} · nunca ${pc(j.filter((b) => b.maxR < 0).length, nj)}`);
    console.log(`  lo más cerca del último círculo: p50 ${f2(q(j.map((b) => b.closest), 0.5))} m · p90 ${f2(q(j.map((b) => b.closest), 0.9))} m`);
  }
  const ff = fb.filter((b) => Number.isFinite(b.otherD));
  console.log(`  primer círculo con la otra mano ≥ 0,5 m más cerca: ${pc(ff.filter((b) => b.otherD < b.first!.d - 0.5).length, ff.length)} · holgura para la reacción del pulgar (tiempo − reacción − carrera hasta 1 m): p50 ${f2(q(fb.map((b) => b.first!.tl + b.first!.at - b.react - Math.max(0, b.first!.d - LUNGE) / HUMAN_SPEED - 0.12), 0.5))} s`);
  const vs = bs.filter((b) => b.vanish);
  console.log(`  el círculo desaparece antes del contacto: ${pc(vs.length, n)} · entonces a ${f2(q(vs.map((b) => b.vanish!.d), 0.5))} m con ${f2(q(vs.map((b) => b.vanish!.left), 0.5))} s · aún había un contacto posible ${pc(vs.filter((b) => b.vanish!.still).length, vs.length)}`);
};
console.log(`${lvl} contra ${rivals.map((i) => RIVALS[i].name).join(', ')} · ayuda ${assist} · ${N} partidos cada uno · ${pts} puntos · «No llegas» ${pc(missed.length, pts)} de los puntos (${pc(missed.length, lost)} de los perdidos)`);
show('NO LLEGA', missed);
show('LLEGA (muestra 1/5)', sample);
// the misses by what an ideal thumb could have done
const cls = { nunca: 0, soloSinReaccion: 0, con025: 0, conLaSuya: 0 };
for (const b of missed) {
  if (!b.bestOk[0]) cls.nunca++;
  else if (!b.bestOk[1]) cls.soloSinReaccion++;
  else if (!b.bestOk[2]) cls.con025++;
  else cls.conLaSuya++;
}
const nm = missed.length;
console.log(`\nfallos: inalcanzables ${pc(cls.nunca, nm)} · solo sin reacción ${pc(cls.soloSinReaccion, nm)} · con 0,25 s pero no con la suya ${pc(cls.con025, nm)} · alcanzables con su reacción ${pc(cls.conLaSuya, nm)}`);
for (const [i, b] of missed.slice(0, Math.max(DUMP, TRACE)).entries()) {
  const f = b.first;
  console.log(
    `  ${b.rival} ${b.kind} ${b.speed.toFixed(1)} m/s · yo (${b.st.x.toFixed(1)}, ${b.st.z.toFixed(1)}) v ${Math.hypot(b.st.vx, b.st.vz).toFixed(1)} · desde mi golpe ${b.sinceOwn.toFixed(2)} · reacción ${b.react.toFixed(2)} hold ${b.hold.toFixed(2)} · círculo ${f ? `+${f.at.toFixed(2)} a ${f.d.toFixed(2)} m, ${f.tl.toFixed(2)} s, ${f.plan.volley ? 'volea' : 'bote'} y ${f.plan.by.toFixed(2)} (${f.plan.fx.toFixed(1)}, ${f.plan.fz.toFixed(1)})` : 'ninguno'} · cambios ${b.changes} · más cerca ${b.closest.toFixed(2)} · maxR ${b.maxR.toFixed(2)} · ok ${b.firstOk.map(Number).join('')}/${b.bestOk.map(Number).join('')}`,
  );
  if (i < TRACE) console.log(b.log.filter((_, k) => k % 3 === 0).join('\n'));
}
