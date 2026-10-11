// Experimentos de control con el HumanController real: estabilidad del círculo, honestidad del aro, sobrepaso
// del joystick, golpes perdidos. npx tsx control.ts [policy] [rival] [puntos] [assist] [mode]
import { makeMatch, end, type Policy } from './harness';
import { servePulse } from '../../src/human';
import { IDEAL_RELEASE, PERFECT_WINDOW, LUNGE } from '../../src/sim/match';

const POL: Record<string, Policy> = {
  // jugador "de manual": va al círculo, suelta cerca, apunta y suelta en el centro del dorado
  ideal: { react: 0.3, stick: 'release', releaseAt: 0.4, aim: { dx: 20, dy: -30, pressAfter: 0.15, releaseE: IDEAL_RELEASE } },
  // mantiene el stick apuntando al círculo hasta el contacto (lo natural con el pulgar)
  track: { react: 0.3, stick: 'track', releaseAt: 0, aim: { dx: 20, dy: -30, pressAfter: 0.15, releaseE: IDEAL_RELEASE } },
  // fija la dirección al ver el círculo y mantiene hasta el contacto
  hold: { react: 0.3, stick: 'hold', releaseAt: 0, aim: null, angErr: 0.15 },
  hold0: { react: 0.3, stick: 'hold', releaseAt: 0, aim: null, angErr: 0 },
  // mantiene la dirección y suelta 0.25 s después de ver que ha llegado (a <0.15 m del círculo)
  holdrel: { react: 0.3, stick: 'holdrel', releaseAt: 0, aim: null, angErr: 0.15 },
  // no toca nada (salvo el saque): ¿cuánto juega solo?
  none: { react: 0.3, stick: 'none', releaseAt: 0, aim: null },
  // solo stick, sin apuntar
  stickonly: { react: 0.3, stick: 'release', releaseAt: 0.4, aim: null },
  // suelta en el borde temprano del dorado y en el tardío
  early: { react: 0.3, stick: 'release', releaseAt: 0.4, aim: { dx: 20, dy: -30, pressAfter: 0.15, releaseE: IDEAL_RELEASE + PERFECT_WINDOW - 0.01 } },
  late: { react: 0.3, stick: 'release', releaseAt: 0.4, aim: { dx: 20, dy: -30, pressAfter: 0.15, releaseE: IDEAL_RELEASE - PERFECT_WINDOW + 0.017 } },
};

const polName = process.argv[2] ?? 'ideal';
const rival = Number(process.argv[3] ?? 2);
const NPTS = Number(process.argv[4] ?? 150);
const assist = Number(process.argv[5] ?? 1);
const mode = (process.argv[6] ?? 'assist') as 'assist' | 'manual';
const pol = POL[polName];

const st = {
  balls: 0,
  ballsWithTarget: 0,
  jumps: 0,
  bigJumps: 0,
  jumpSamples: [] as string[],
  flicker: 0,
  ringJumps: 0,
  ringJumpSamples: [] as string[],
  releases: 0,
  perfectRel: 0,
  timing: {} as Record<string, number>,
  humanHits: 0,
  lost: {} as Record<string, number>,
  won: {} as Record<string, number>,
  lostWithReachShown: 0,
  overshoot: [] as number[],
  missedInReachRing: 0,
  points: 0,
  matches: 0,
  kinds: {} as Record<string, number>,
  // ¿cuántas veces el contacto pasó con el jugador lejos (> 0.8 m) del sitio sugerido?
  stretchHits: 0,
  gold: [] as number[],
};
let goldN = 0;

let seed = 1;
while (st.points < NPTS) {
  const { m, input } = makeMatch(rival, 777 + seed++ * 31, mode, assist);
  st.matches++;
  let key = '';
  let t0 = 0;
  let dir0: { x: number; z: number } | null = null;
  let prevTg: { x: number; z: number } | null = null;
  let hadTg = false;
  let prevE: number | null = null;
  let released = false;
  let pressed = false;
  let relE: number | null = null;
  let reachShown = false;
  let serveHeld = 0;
  let arrived = -1;
  let guard = 0;
  while (m.phase !== 'over' && guard++ < 60 * 60 * 30 && st.points < NPTS) {
    const me = m.players[0];
    // ---- el saque
    if (m.phase === 'serve' && m.server() === me) {
      if (!input.pressing) {
        input.pressing = true;
        input.dx = 0;
        input.dy = -10;
          input.dx = 0;
        serveHeld = 0;
      } else {
        serveHeld += 1 / 60;
        if (serveHeld > 0.3 && servePulse(m.t) < 0.2) end(input);
      }
    }
    // ---- el peloteo: bola que viene
    const r = m.rally;
    if (m.phase === 'rally' && r && r.last && r.last.team === 1) {
      const k = `${r.shots}`;
      if (k !== key) {
        key = k;
        t0 = m.t;
        dir0 = null;
        prevTg = null;
        hadTg = false;
        prevE = null;
        released = pressed = false;
        goldN = 0;
        relE = null;
        reachShown = false;
        st.balls++;
        input.stickX = input.stickY = 0;
      }
      const tg = m.targetFor(0);
      if (tg) {
        if (!hadTg) st.ballsWithTarget++;
        if (prevTg) {
          const j = Math.hypot(tg.fx - prevTg.x, tg.fz - prevTg.z);
          if (j > 0.3) {
            st.jumps++;
            if (j > 0.8) st.bigJumps++;
            if (st.jumpSamples.length < 12) st.jumpSamples.push(`t+${(m.t - t0).toFixed(2)}s salto ${j.toFixed(2)} m (hand ${tg.hand}, by ${tg.by.toFixed(2)}, volley ${tg.volley}, dist jugador ${Math.hypot(me.x - tg.fx, me.z - tg.fz).toFixed(2)})`);
          }
        } else if (hadTg) st.flicker++;
        prevTg = { x: tg.fx, z: tg.fz };
        hadTg = true;
      } else prevTg = null;
      // stick
      const el = m.t - t0;
      if (el >= pol.react && pol.stick !== 'none') {
        if (pol.stick === 'release' || pol.stick === 'track') {
          if (tg) {
            const dx = tg.fx - me.x;
            const dz = tg.fz - me.z;
            const d = Math.hypot(dx, dz);
            if (pol.stick === 'track' || d > pol.releaseAt) {
              const a = Math.atan2(dz, dx) + (pol.angErr ?? 0);
              input.stickX = Math.cos(a);
              input.stickY = Math.sin(a);
            } else input.stickX = input.stickY = 0;
          } else if (pol.stick === 'release') input.stickX = input.stickY = 0;
        } else if (pol.stick === 'holdrel') {
          if (!dir0 && tg) {
            const a = Math.atan2(tg.fz - me.z, tg.fx - me.x) + (pol.angErr ?? 0) * (Math.random() < 0.5 ? -1 : 1);
            dir0 = { x: Math.cos(a), z: Math.sin(a) };
            arrived = -1;
          }
          if (tg && arrived < 0 && Math.hypot(tg.fx - me.x, tg.fz - me.z) < 0.15) arrived = m.t;
          if (dir0 && (arrived < 0 || m.t - arrived < 0.25)) {
            input.stickX = dir0.x;
            input.stickY = dir0.z;
          } else input.stickX = input.stickY = 0;
        } else if (pol.stick === 'hold') {
          if (!dir0 && tg) {
            const a = Math.atan2(tg.fz - me.z, tg.fx - me.x) + (pol.angErr ?? 0) * (Math.random() < 0.5 ? -1 : 1);
            dir0 = { x: Math.cos(a), z: Math.sin(a) };
          }
          if (dir0) {
            input.stickX = dir0.x;
            input.stickY = dir0.z;
          }
        }
      }
      // aro de tiempo, como lo dibuja overlays()
      const hp = m.humanPlan();
      if (hp && hp.plan.reach && m.t < hp.plan.t && !(hp.plan.out && !input.active)) {
        const e = hp.plan.t - m.t;
        reachShown = true;
        if (Math.abs(e - 0.12) <= 0.1) goldN++;
        if (prevE !== null && (e > prevE + 0.03 || e < prevE - 1 / 60 - 0.03)) {
          st.ringJumps++;
          if (st.ringJumpSamples.length < 12) st.ringJumpSamples.push(`aro: e ${prevE.toFixed(3)} → ${e.toFixed(3)} s (stretch ${(hp.plan.stretch ?? 0).toFixed(2)})`);
        }
        prevE = e;
        if (pol.aim) {
          if (!pressed && el >= pol.aim.pressAfter) {
            pressed = true;
            input.pressing = true;
            input.dx = pol.aim.dx;
            input.dy = pol.aim.dy;
          }
          if (pressed && !released && e <= pol.aim.releaseE + 1e-6) {
            released = true;
            relE = e;
            end(input);
            st.releases++;
          }
        }
      } else prevE = null;
      if (pol.aim && !pressed && el >= pol.aim.pressAfter) {
        pressed = true;
        input.pressing = true;
        input.dx = pol.aim.dx;
        input.dy = pol.aim.dy;
      }
    } else if (m.phase === 'rally' && r && r.last && r.last.team === 0) {
      // entre golpes: vuelve a una posición de espera (fondo hasta el 3.er golpe, luego la línea de cocina)
      const hz = r.shots >= 2 ? 2.6 : 6.9;
      const hx = me.x * 0.5;
      const dx = hx - me.x, dz = hz - me.z, d = Math.hypot(dx, dz);
      if (polName !== 'none' && d > 0.3) { input.stickX = dx / d; input.stickY = dz / d; } else input.stickX = input.stickY = 0;
      if (input.pressing && m.server() !== m.players[0]) end(input);
    }
    m.update(1 / 60);
    for (const e of m.events) {
      if (e.type === 'hit' && e.pid === 0 && e.kind !== 'serve') {
        st.humanHits++;
        { const pl = m.players[0]; const rel = (e.x - pl.x) * pl.side; const h = pl.lastHit?.hand ?? 1; if ((rel > 0.15 && h === -1) || (rel < -0.15 && h === 1)) (st as any).wrongHand = ((st as any).wrongHand ?? 0) + 1; }
        st.gold.push(goldN);
        st.timing[e.timing] = (st.timing[e.timing] ?? 0) + 1;
        st.kinds[e.kind] = (st.kinds[e.kind] ?? 0) + 1;
        if (relE !== null && Math.abs(relE - IDEAL_RELEASE) <= PERFECT_WINDOW) st.perfectRel++;
        const tg = m.players[0];
        void tg;
        if (pol.stick === 'track' || pol.stick === 'hold') {
          // distancia al último objetivo visto
          if (prevTg) st.overshoot.push(Math.hypot(m.players[0].x - prevTg.x, m.players[0].z - prevTg.z));
        }
      }
      if (e.type === 'point') {
        st.points++;
        if (e.winner === 0) st.won[e.reason] = (st.won[e.reason] ?? 0) + 1;
        else {
          const k = e.fault === 0 ? `error-${e.reason}` : e.reason;
          st.lost[k] = (st.lost[k] ?? 0) + 1;
          if (e.reason === 'winner' && reachShown && m.rally && m.rally.last && m.rally.last.team === 1) st.lostWithReachShown++;
        }
        input.clear();
        input.stickX = input.stickY = 0;
        key = '';
      }
    }
    m.events.length = 0;
  }
}
const pct = (a: number, b: number) => `${b ? ((100 * a) / b).toFixed(1) : '-'}%`;
console.log(`política=${polName} rival=${rival} assist=${assist} modo=${mode} · ${st.points} puntos en ${st.matches} partidos`);
console.log(`bolas entrantes ${st.balls}, con círculo ${st.ballsWithTarget}; saltos del círculo >0.3 m: ${st.jumps} (>0.8 m: ${st.bigJumps}); círculo que desaparece y vuelve: ${st.flicker}`);
for (const s of st.jumpSamples) console.log('   ', s);
{ const g = st.gold.sort((a, b) => a - b); console.log(`saltos del aro de tiempo: ${st.ringJumps}; frames dorados antes de cada golpe (ideal 12): p10 ${g[Math.floor(g.length * 0.1)]} mediana ${g[g.length >> 1]}; golpes con <6 frames dorados ${g.filter((x) => x < 6).length}/${g.length}`); }
for (const s of st.ringJumpSamples) console.log('   ', s);
console.log(`golpes humanos ${st.humanHits}; timing: ${JSON.stringify(st.timing)}; tipos: ${JSON.stringify(st.kinds)}`);
console.log(`sueltas ${st.releases}, de ellas en el dorado según el aro: ${st.perfectRel}; golpes "perfect" realmente: ${st.timing.perfect ?? 0} (${pct(st.timing.perfect ?? 0, st.perfectRel)} de las sueltas en dorado)`);
console.log(`puntos ganados: ${JSON.stringify(st.won)}`);
console.log(`puntos perdidos: ${JSON.stringify(st.lost)}; perdidos por 'winner' con el aro de alcance mostrado antes: ${st.lostWithReachShown}`);
if (st.overshoot.length) {
  const o = st.overshoot.sort((a, b) => a - b);
  console.log(`distancia jugador–círculo al golpear (stick mantenido): mediana ${o[o.length >> 1].toFixed(2)} m, p90 ${o[Math.floor(o.length * 0.9)].toFixed(2)} m, máx ${o[o.length - 1].toFixed(2)} (LUNGE ${LUNGE})`);
}
const won = Object.values(st.won).reduce((a, b) => a + b, 0);
console.log(`golpes con la mano contraria a donde está la bola (>15 cm del otro lado): ${(st as any).wrongHand ?? 0}/${st.humanHits}`);
console.log(`% puntos ganados por el humano: ${pct(won, st.points)}`);
