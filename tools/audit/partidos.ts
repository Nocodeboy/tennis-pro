// Auditoría 04 · estructura del punto, comportamiento de la CPU y experiencia del humano, medidos en partidos reales
// de la simulación. Dos modos:
//   npx tsx tools/audit/partidos.ts cpu [partidos=40]   CPU contra CPU (las dos parejas fuertes y las dos flojas)
//   npx tsx tools/audit/partidos.ts bot [partidos=16]   el humano simulado (tools/thumb.ts, nivel LEVEL=medio) y Martín
//                                                       contra la pareja PAIR (índice en PAIRS, por defecto todas)
// Escribe un resumen; SEEDS=1 lista semillas de ejemplo de cada rareza.
const g = globalThis as unknown as { window?: unknown };
g.window ??= { addEventListener() {} };
import { AIController, HUMAN_REACTION, HUMAN_SPEED, LOB, PADEL, PAIRS, PARTNER, type Rival } from '../../src/sim/brain';
import { posAt } from '../../src/sim/ball';
import { AT_NET, DEPTH_Z, R } from '../../src/sim/court';
import { AREA_X, AREA_Z, Match } from '../../src/sim/match';
import type { MatchEvent } from '../../src/sim/types';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

const MODE = process.argv[2] ?? 'cpu';
const N = Number(process.argv[3] ?? (MODE === 'cpu' ? 40 : 16));
const LEVEL = process.env.LEVEL ?? 'medio';
const SHOW = !!process.env.SEEDS;
// PADEL='{"netLob":0.8}' LOB='{…}': other values (brain.ts)
if (process.env.PADEL) Object.assign(PADEL, JSON.parse(process.env.PADEL));
if (process.env.LOB) Object.assign(LOB, JSON.parse(process.env.LOB));

const pc = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '–');
const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
const pct = (a: number[], q: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] : NaN);
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const inc = (o: Record<string, number>, k: string, v = 1) => (o[k] = (o[k] ?? 0) + v);

/** a team's formation from where its players are: N both up, B both back, S split (one up, one back), M otherwise */
function form(m: Match, team: 0 | 1): 'N' | 'B' | 'S' | 'M' {
  const [a, b] = m.team(team).map((p) => Math.abs(p.z));
  const net = (d: number) => d < AT_NET;
  const back = (d: number) => d > DEPTH_Z[1] + 0.3;
  if (net(a) && net(b)) return 'N';
  if (back(a) && back(b)) return 'B';
  if ((net(a) && back(b)) || (net(b) && back(a))) return 'S';
  return 'M';
}

const A = {
  points: 0,
  shots: [] as number[],
  secs: [] as number[],
  reasons: {} as Record<string, number>,
  endBy: {} as Record<string, number>,
  // formations at each hit (hitter's team / the other)
  formHits: {} as Record<string, number>,
  hits: 0,
  // the team holding the net at the last hit (exactly one team N): did it win the point?
  netHeldPts: 0,
  netHeldWon: 0,
  netHeldByEnd: {} as Record<string, number>,
  // net changes: a team going from B to N within a point; per point counts
  takes: 0,
  takesAfterLob: 0,
  lobs: 0,
  lobsOverNet: 0,
  lobOverOutcome: {} as Record<string, number>,
  lobApex: [] as number[],
  lobNetH: [] as number[],
  // serve + return
  serves: 0,
  serverUpAt3: 0,
  thirdVolley: 0,
  returns: {} as Record<string, number>,
  retDepth: [] as number[],
  retToFeet: 0,
  retLow: 0,
  // positioning (seconds of rally)
  rallyT: 0,
  sameSideT: 0,
  sameSideEp: 0,
  splitT: 0,
  pinnedT: 0,
  glassNear: 0,
  bodyPass: 0,
  bodyPassBy: {} as Record<string, number>,
  // shot choice oddities
  lobFromNetVsBack: 0,
  driveDeepVsNet: 0,
  overheadLow: 0,
  bajadas: 0,
  // balls played after two walls, and how they end
  dbl: 0,
  dblErr: 0,
  side: 0,
  sideErr: 0,
  // speeds by kind (launch, km/h)
  speed: {} as Record<string, number[]>,
  // the human (bot mode)
  hHits: 0,
  mHits: 0,
  hAuto: 0,
  lostNoTouch: 0,
  lost: 0,
  hOwnedNoCircle: 0,
  hOwned: 0,
  hLobOverUnreach: 0,
  hLobsOver: 0,
  // perf
  stepMs: [] as number[],
  stuck: 0,
  seeds: {} as Record<string, string[]>,
};
const seedOf = (k: string, s: string) => {
  const a = (A.seeds[k] ??= []);
  if (a.length < 4) a.push(s);
};

function play(m: Match, bot: ThumbBot | null, label: string) {
  m.start();
  let guard = 0;
  let ptShots = 0;
  let ptStart = 0;
  let lastForm: Record<number, string> = {};
  let teamForm: [string, string] = ['', ''];
  let sawBack: [boolean, boolean] = [false, false];
  let lastLob: { team: number; t: number; over: boolean; shotNo: number } | null = null;
  let hTouched = false;
  const sameSince = [-1, -1];
  const sameCounted = [false, false];
  let hit: { pid: number; kind: string; y: number; z: number; volley: boolean; walls: number; lastWall: string | null }[] = [];
  let serveSrv = -1;
  let ret: { kind: string; tz: number } | null = null;
  const passed = new Set<string>();
  let ballKey = '';
  let ownedHuman = false;
  let circle = false;
  while (m.phase !== 'over' && guard++ < 60 * 60 * 60) {
    if (bot) bot.tick(m);
    const t0 = performance.now();
    m.update(1 / 60);
    A.stepMs.push(performance.now() - t0);
    if (bot) bot.events(m.events);
    const r = m.rally;
    // ---- per step, during the rally
    if (m.phase === 'rally' && r?.last) {
      const h = 1 / 60;
      A.rallyT += h;
      for (const t of [0, 1] as const) {
        const [a, b] = m.team(t);
        // the two on the same side: closer than 1.2 m across and within 2 m in depth (not one behind the other at the
        // serve) for more than 0.3 s
        const same = Math.abs(a.x - b.x) < 1.2 && Math.abs(Math.abs(a.z) - Math.abs(b.z)) < 2.5;
        if (same) {
          A.sameSideT += h;
          if (sameSince[t] < 0) sameSince[t] = m.t;
          else if (m.t - sameSince[t] > 0.3 && !sameCounted[t]) {
            A.sameSideEp++;
            sameCounted[t] = true;
            seedOf('mismo lado', `${label} t=${m.t.toFixed(1)}`);
          }
        } else {
          sameSince[t] = -1;
          sameCounted[t] = false;
        }
        const f = form(m, t);
        if (f === 'S') A.splitT += h / 2;
        if (f === 'B') sawBack[t] = true;
        if (teamForm[t] !== f) {
          if (f === 'N' && sawBack[t]) {
            A.takes++;
            if (lastLob && lastLob.team === t && m.t - lastLob.t < 4) A.takesAfterLob++;
            sawBack[t] = false;
          }
          teamForm[t] = f;
        }
      }
      for (const p of m.players) {
        if (Math.abs(p.x) >= AREA_X - 0.02 || Math.abs(p.z) >= AREA_Z - 0.02) A.pinnedT += h;
        // the ball through a player's body (nobody models a ball hitting a player): within 0.22 m across of the
        // player's axis, between the ankles and the shoulders, a live ball that is not his contact
        const b = m.ballPos();
        if (b && b.y < 1.6 && b.y > 0.1 && Math.hypot(b.x - p.x, b.z - p.z) < 0.22 && !(p.plan && Math.abs(p.plan.t - m.t) < 0.1) && !(p.lastHit && m.t - p.lastHit.t < 0.25)) {
          const k = `${m.stats.rallies}:${r.shots}:${p.id}`;
          if (!passed.has(k)) {
            passed.add(k);
            A.bodyPass++;
            inc(A.bodyPassBy, r.last.team === p.team ? 'de su pareja' : m.owner === p.id ? 'rival, él la juega luego' : 'rival, la juega su compañero o nadie');
            inc(A.bodyPassBy, r.bounces === 0 ? 'antes del bote' : r.walls > 0 ? 'tras pared' : 'tras bote');
            seedOf('bola atraviesa jugador', `${label} t=${m.t.toFixed(1)}`);
          }
        }
      }
      // the human: balls that are his (owner) and whether a circle ever shows
      if (bot) {
        const key = `${m.stats.rallies}:${r.shots}`;
        if (key !== ballKey) {
          if (ballKey && ownedHuman) {
            A.hOwned++;
            if (!circle) A.hOwnedNoCircle++;
          }
          ballKey = key;
          ownedHuman = false;
          circle = false;
        }
        if (r.last.team === 1 && m.owner === 0) ownedHuman = true;
        if (m.targetFor(0)) circle = true;
      }
    }
    for (const e of m.events as MatchEvent[]) {
      if (e.type === 'serveSetup') {
        ptShots = 0;
        hit = [];
        lastLob = null;
        hTouched = false;
        sawBack = [false, false];
        teamForm = ['', ''];
        ret = null;
        serveSrv = e.server;
      }
      if (e.type === 'hit') {
        ptShots++;
        A.hits++;
        if (e.shot === 1) ptStart = m.t;
        const p = m.players[e.pid];
        const k = `${e.kind}${e.special ? '·' + e.special : ''}`;
        (A.speed[k] ??= []).push(e.speed * 3.6);
        const fh = form(m, p.team);
        const fo = form(m, p.team === 0 ? 1 : 0);
        inc(A.formHits, `${fh}/${fo}`);
        const rr = m.rally!;
        hit.push({ pid: e.pid, kind: e.kind, y: e.y, z: e.z, volley: e.volley, walls: 0, lastWall: null });
        if (bot) {
          if (e.pid === 0 && e.kind !== 'serve') {
            A.hHits++;
            hTouched = true;
            if (e.timing === 'auto') A.hAuto++;
          }
          if (e.pid === 1) A.mHits++;
        }
        // the lob: apex and height over the net (from the new flight)
        if (e.kind === 'lob') {
          A.lobs++;
          const s = rr.seg;
          let apex = 0;
          let netH = NaN;
          for (let t = s.t0; t < s.t0 + 4; t += 0.01) {
            const q = posAt(s, t);
            apex = Math.max(apex, q.y);
            if (Number.isNaN(netH) && q.z * p.side < 0) netH = q.y;
            if (q.y < R + 0.001) break;
          }
          A.lobApex.push(apex);
          if (!Number.isNaN(netH)) A.lobNetH.push(netH);
          const over = fo === 'N';
          if (over) A.lobsOverNet++;
          lastLob = { team: p.team, t: m.t, over, shotNo: e.shot };
          if (fh === 'N' && fo === 'B') {
            A.lobFromNetVsBack++;
            seedOf('globo desde la red a pareja atrás', `${label} t=${m.t.toFixed(1)}`);
          }
        } else if (lastLob && e.shot === lastLob.shotNo + 1 && lastLob.over) {
          // the reply to a lob over a pair at the net
          inc(A.lobOverOutcome, `${e.volley ? 'de aire' : 'tras bote'} · ${e.kind}`);
        }
        if (e.kind === 'drive' && Math.abs(e.z) > 7 && fo === 'N' && e.tz !== undefined && Math.abs(e.tz) > 6) A.driveDeepVsNet++;
        if ((e.kind === 'smash' || e.kind === 'bandeja' || e.kind === 'vibora') && e.y < 1.75) A.overheadLow++;
        if (e.kind === 'bajada') A.bajadas++;
        // serve and return
        if (e.shot === 1) A.serves++;
        if (e.shot === 2) {
          inc(A.returns, e.kind);
          ret = { kind: e.kind, tz: e.tz ?? 0 };
          if (e.kind !== 'lob') {
            A.retDepth.push(Math.abs(e.tz ?? 0));
            const srv = m.players[serveSrv];
            if (Math.abs((e.tz ?? 0) - srv.z) < 1.2 && Math.abs((e.tx ?? 0) - srv.x) < 1.2) A.retToFeet++;
            if ((e.clear ?? 1) < 0.35) A.retLow++;
          }
        }
        if (e.shot === 3) {
          const srv = m.players[serveSrv];
          if (Math.abs(srv.z) < AT_NET + 0.4) A.serverUpAt3++;
          if (e.volley) A.thirdVolley++;
        }
        // played after the walls: the wall the ball came off (rally state before this hit is gone; use the plan's wall)
      }
      if (e.type === 'point') {
        A.points++;
        A.shots.push(e.rally);
        A.secs.push(m.t - ptStart);
        const why = e.fault === null ? `ganador:${e.reason}` : `error:${e.reason}`;
        inc(A.reasons, why);
        const last = hit[hit.length - 1];
        if (last) inc(A.endBy, `${why} · ${last.kind}${last.volley ? '(v)' : ''}`);
        // the pair holding the net at the last hit
        const f0 = form(m, 0);
        const f1 = form(m, 1);
        if ((f0 === 'N') !== (f1 === 'N') && e.rally > 2) {
          A.netHeldPts++;
          const held = f0 === 'N' ? 0 : 1;
          if (e.winner === held) A.netHeldWon++;
          inc(A.netHeldByEnd, `${e.winner === held ? 'gana la red' : 'pierde la red'} · ${why}`);
        }
        if (bot && e.winner === 1) {
          A.lost++;
          if (!hTouched) A.lostNoTouch++;
        }
        if (lastLob && lastLob.over && e.rally === lastLob.shotNo) {
          inc(A.lobOverOutcome, `punto directo · ${why}`);
        }
      }
    }
    m.events.length = 0;
  }
  if (m.phase !== 'over') A.stuck++;
}

// planned walls: count the balls played after a side wall / two walls and their error rate, from the hit plans
// (a light hook on the planner: the plan carries `wall`; a ball off two walls is followed by the path legs)
const mkMatch = (team0: Rival[], team1: Rival[], seed: number, human = false) => {
  const cfg = [...team0, ...team1].map((r, i) => ({ team: (i < 2 ? 0 : 1) as 0 | 1, human: human && i === 0, speed: human && i === 0 ? HUMAN_SPEED : r.skill.speed, reaction: human && i === 0 ? HUMAN_REACTION : r.skill.reaction, look: r.look }));
  return new Match(cfg, { games: 3, golden: true }, seed);
};

if (MODE === 'cpu') {
  const pairings: [number, number][] = [
    [2, 3],
    [0, 1],
  ];
  for (const [a, b] of pairings) {
    for (let i = 0; i < N / 2; i++) {
      const seed = 4100 + i * 31 + a * 1000;
      const m = mkMatch([PAIRS[a].a, PAIRS[a].b], [PAIRS[b].a, PAIRS[b].b], seed);
      m.setControllers([PAIRS[a].a, PAIRS[a].b, PAIRS[b].a, PAIRS[b].b].map((r) => new AIController(r.skill)));
      play(m, null, `cpu ${PAIRS[a].id} vs ${PAIRS[b].id} seed ${seed}`);
    }
  }
} else {
  const only = process.env.PAIR !== undefined ? [Number(process.env.PAIR)] : [0, 1, 2, 3];
  for (const pi of only) {
    for (let i = 0; i < N; i++) {
      const seed = 2000 + i * 7919;
      const bot = new ThumbBot(HUMANS[LEVEL], 1, seed + 17);
      const m = mkMatch([PARTNER, PARTNER], [PAIRS[pi].a, PAIRS[pi].b], seed, true);
      m.setControllers([bot.ctl, new AIController(PARTNER.skill), new AIController(PAIRS[pi].a.skill), new AIController(PAIRS[pi].b.skill)]);
      bot.attach(m);
      play(m, bot, `bot ${LEVEL} vs ${PAIRS[pi].id} seed ${seed}`);
    }
  }
}

const top = (o: Record<string, number>, n: number, k = 12) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([a, v]) => `${a} ${pc(v, n)}`)
    .join(' · ');
const hist = (a: number[], edges: number[]) => {
  const out: string[] = [];
  for (let i = 0; i < edges.length; i++) {
    const lo = edges[i];
    const hi = edges[i + 1] ?? Infinity;
    out.push(`${lo}${hi === Infinity ? '+' : '–' + (hi - 1)}: ${pc(a.filter((v) => v >= lo && v < hi).length, a.length)}`);
  }
  return out.join(' · ');
};
console.log(`modo ${MODE}${MODE === 'bot' ? ` (${LEVEL})` : ''} · ${N} partidos por cruce · ${A.points} puntos · atascados ${A.stuck}`);
console.log(`\n# Estructura del punto`);
console.log(`golpes por punto (con el saque): media ${mean(A.shots).toFixed(1)} · mediana ${med(A.shots)} · p90 ${pct(A.shots, 0.9)} · máx ${A.shots.reduce((a, b) => Math.max(a, b), 0)}`);
console.log(`  distribución: ${hist(A.shots, [1, 2, 3, 5, 9, 13, 21])}`);
console.log(`segundos por punto: media ${mean(A.secs).toFixed(1)} · mediana ${med(A.secs).toFixed(1)} · p90 ${pct(A.secs, 0.9).toFixed(1)}`);
console.log(`cómo acaban: ${top(A.reasons, A.points)}`);
console.log(`último golpe: ${top(A.endBy, A.points, 14)}`);
console.log(`\n# Red y transiciones`);
console.log(`formaciones en cada golpe (golpeador/rival; N red, B fondo, S partidos, M medio): ${top(A.formHits, A.hits, 10)}`);
console.log(`la pareja que tiene la red (solo una en N al acabar, punto > 2 golpes) gana ${pc(A.netHeldWon, A.netHeldPts)} de ${A.netHeldPts} puntos`);
console.log(`  ${top(A.netHeldByEnd, A.netHeldPts, 8)}`);
console.log(`subidas a la red desde el fondo: ${(A.takes / A.points).toFixed(2)} por punto (${pc(A.takesAfterLob, A.takes)} tras un globo propio)`);
console.log(`globos: ${A.lobs} (${pc(A.lobs, A.hits)} de los golpes; ${(A.lobs / A.points).toFixed(2)} por punto); sobre una pareja en la red ${pc(A.lobsOverNet, A.lobs)}`);
console.log(`  altura máxima del globo: mediana ${med(A.lobApex).toFixed(2)} m · p10 ${pct(A.lobApex, 0.1).toFixed(2)} · p90 ${pct(A.lobApex, 0.9).toFixed(2)}; altura al pasar la red: mediana ${med(A.lobNetH).toFixed(2)} m`);
console.log(`  respuesta al globo sobre la red: ${top(A.lobOverOutcome, A.lobsOverNet, 10)}`);
console.log(`\n# Saque y resto`);
console.log(`el sacador está en la red en el 3.er golpe: ${pc(A.serverUpAt3, A.serves)} de los saques (aprox., incluye puntos que no llegan) · 3.er golpe de volea ${pc(A.thirdVolley, A.serves)}`);
console.log(`restos: ${top(A.returns, A.serves)} · resto no globo: profundidad apuntada mediana ${med(A.retDepth).toFixed(2)} m de la red; a los pies del sacador (±1,2 m de donde está al restar) ${pc(A.retToFeet, A.retDepth.length)}; bajo (< 0,35 m sobre la cinta) ${pc(A.retLow, A.retDepth.length)}`);
console.log(`\n# Posiciones y rarezas (tiempo de peloteo ${(A.rallyT / 60).toFixed(1)} min)`);
console.log(`compañeros en el mismo lado (< 1,2 m de x): ${pc(A.sameSideT, A.rallyT * 2)} del tiempo de cada pareja · ${A.sameSideEp} episodios > 0,3 s (${(A.sameSideEp / A.points).toFixed(2)} por punto)`);
console.log(`pareja partida (uno en la red y otro al fondo): ${pc(A.splitT, A.rallyT)} del tiempo · jugadores pegados al cristal/valla: ${pc(A.pinnedT, A.rallyT * 4)} del tiempo`);
console.log(`bola viva que atraviesa a un jugador (0,22 m del eje, 0,1–1,6 m de alto): ${A.bodyPass} (${(A.bodyPass / A.points).toFixed(2)} por punto) ${JSON.stringify(A.bodyPassBy)}`);
console.log(`golpes raros: globo desde la red a pareja atrás ${A.lobFromNetVsBack} · drive profundo desde el fondo a pareja en la red ${A.driveDeepVsNet} (${pc(A.driveDeepVsNet, A.hits)}) · por encima de la cabeza a < 1,75 m ${A.overheadLow} · bajadas ${A.bajadas} (${pc(A.bajadas, A.hits)})`);
console.log(`\n# Velocidad de salida por golpe (km/h, mediana · p90)`);
console.log(Object.entries(A.speed).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `${k} ${med(v).toFixed(0)}·${pct(v, 0.9).toFixed(0)} (n ${v.length})`).join(' | '));
if (MODE === 'bot') {
  console.log(`\n# El humano (${LEVEL})`);
  console.log(`golpes del equipo: humano ${pc(A.hHits, A.hHits + A.mHits)} · Martín ${pc(A.mHits, A.hHits + A.mHits)} · automáticos del humano ${pc(A.hAuto, A.hHits)}`);
  console.log(`puntos perdidos sin que el humano toque la bola (sin contar el saque): ${pc(A.lostNoTouch, A.lost)} de ${A.lost}`);
  console.log(`bolas suyas (owner) sin círculo en ningún momento: ${pc(A.hOwnedNoCircle, A.hOwned)} de ${A.hOwned}`);
}
const sm = A.stepMs;
console.log(`\n# Rendimiento: m.update(1/60): media ${mean(sm).toFixed(3)} ms · p99 ${pct(sm, 0.99).toFixed(3)} · máx ${sm.reduce((a, b) => Math.max(a, b), 0).toFixed(2)} ms (${sm.length} fotogramas)`);
if (SHOW) for (const [k, v] of Object.entries(A.seeds)) console.log(`semillas · ${k}: ${v.join(' | ')}`);
