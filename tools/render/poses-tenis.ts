// Copia de tools/poses.ts para el tenis (agente de gráficos): las mismas medidas de las poses (codo, muñeca, espalda,
// rodillas, pies que patinan, saltos, cabeza, la raqueta en la bola en el contacto) sobre partidos sin cabeza de la
// simulación tal como esté (mientras match.ts sea el de pádel: dobles, con el saque del contrato reescrito como en
// tools/render/harness.ts). Sin FORCE de pádel. Uso: npx tsx tools/render/poses-tenis.ts [segundos por partido] [out.json]
// Env: MODES=cpu,doubles
import '../node-chars';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as Chars from '../../src/render/chars';
import type { CharAssets, CharacterView as CharView } from '../../src/render/chars';
import { AIController, HUMAN_REACTION, HUMAN_SPEED, PAIRS, PARTNER, RIVALS } from '../../src/sim/brain';
import { Match } from '../../src/sim/match';
import type { Controller } from '../../src/sim/match';
import { HL } from '../../src/sim/court';
import type { Plan, Player, ShotSpec } from '../../src/sim/types';
import { HUMANS } from '../humans';
import { PEOPLE, RIVAL_KITS } from '../../src/kits';
import type { KitPainter } from '../../src/render/outfit';
import { ThumbBot } from '../thumb';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PM = require('../posemetrics.js');
// CHARS=<another chars.ts> measures that one instead, on the same matches (before/after a change)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const C: typeof Chars = process.env.CHARS ? require(process.env.CHARS) : Chars;
const { CLIP_NAMES, CharacterView, loadCharAssets } = C;

const SECS = Number(process.argv[2] ?? 240);
const OUT = process.argv[3] ?? '';
const MODES = (process.env.MODES ?? 'cpu,human,doubles').split(',');

/** the natural references, measured on the clips */
function calibrateOn(a: CharAssets) {
  const model = cloneSkinned(a.template);
  const root = new THREE.Group();
  model.scale.setScalar(1.78 / 1.7);
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  let cur: THREE.AnimationAction | null = null;
  const sample = (t: number, c: THREE.AnimationClip) => {
    const ac = mixer.clipAction(c);
    if (cur !== ac) {
      cur?.stop();
      cur = ac;
      ac.play();
    }
    mixer.setTime(t);
    root.updateMatrixWorld(true);
  };
  // the rest pose of the forearm and the hand (the bind pose of the rig: a straight wrist)
  const rest: Record<string, THREE.Quaternion> = {};
  a.template.traverse((o) => {
    if (o.name === 'RightForeArm' || o.name === 'RightHand') rest[o.name] = o.quaternion.clone();
  });
  model.traverse((o) => {
    if (rest[o.name]) o.userData.__rest = rest[o.name];
  });
  const ch = { root };
  const clips = Object.values(a.clips);
  const nat = PM.calibrate(ch, clips, sample);
  // the floor: the ankles standing in the ready pose
  const ready = a.clips.ready;
  let ank = 0;
  let n = 0;
  for (let t = 0; t < ready.duration; t += 1 / 30) {
    sample(t, ready);
    const f = PM.features(ch, nat).feet;
    ank += Math.min(f[1], f[4]);
    n++;
  }
  nat.ground = { ankle: ank / n };
  // the natural ranges, measured on the clips (the AI-made animation is the reference)
  const ranges: Record<string, number[]> = {};
  for (const [k, c] of Object.entries(a.clips)) {
    for (let t = 0; t < c.duration; t += 1 / 30) {
      sample(t, c);
      const f = PM.features(ch, nat);
      for (const key of ['elbow', 'elbowAxis', 'wristBend', 'wristTwist', 'foreTwist', 'foreBend', 'spineBend', 'spineTwist', 'torsoTilt', 'kneeL', 'kneeR', 'neck', 'elbowUp', 'across']) {
        const v = Math.abs(f[key] ?? 0);
        const r = (ranges[key] ??= [Infinity, -Infinity]);
        r[0] = Math.min(r[0], v);
        r[1] = Math.max(r[1], v);
        const rk = (ranges[`${key}:${k}`] ??= [Infinity, -Infinity]);
        rk[0] = Math.min(rk[0], v);
        rk[1] = Math.max(rk[1], v);
      }
    }
  }
  return { nat, ranges };
}

interface Run {
  m: Match;
  chars: CharView[];
  gate: (i: number) => boolean;
  tick: () => void;
  after: () => void;
  label: string;
}

function react(m: Match, chars: CharView[], e: { winner: 0 | 1; reason: string; fault: number | null; rally: number }, rnd: () => number) {
  // the same rule as View.onPoint
  const end = m.phase === 'over';
  const long = e.rally >= 8;
  for (const p of m.players) {
    const c = chars[p.id];
    if (p.team === e.winner) {
      if (end || ((e.reason === 'winner' || e.reason === 'miss' || e.reason === 'letGo') && e.rally >= 3) || (long && rnd() < 0.5)) c.react('cheer', m.t);
    } else if (end || (e.fault === p.id && rnd() < 0.6) || (long && rnd() < 0.7)) c.react('lost', m.t);
  }
}

/**
 * FORCE=1: the shots the simulation does not play yet, forced on its controllers (the physics follows the kind): a ball
 * met at 1.15–1.95 m deeper than 6.3 m from the net and coming back towards it (off the back glass) is a bajada; the
 * remates go flat, por 3, por 4 by turns; each shot gets a power (0.1 … 1, seeded). Keeps each player's last spec, for
 * onHit (the hit event may not carry power and special yet).
 */
function forceShots(m: Match, specs: (ShotSpec | null)[], seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let n = 0;
  m.controllers.forEach((c) => {
    const hit = c.hit.bind(c);
    c.hit = (mm: Match, p: Player, plan: Plan) => {
      const sp = hit(mm, p, plan);
      specs[p.id] = sp;
      return sp;
    };
  });
}

function makeRun(a: CharAssets, mode: string, i: number): Run {
  const seed = 4242 + i * 7919 + (mode === 'human' ? 1 : mode === 'doubles' ? 2 : 0) * 104729;
  const kit = process.env.KIT ? RIVAL_KITS[process.env.KIT].kit : { shirtHue: null, paddle: 0xffffff, paddleEdge: 0 };
  if (mode === 'doubles') {
    const pair = PAIRS[i % PAIRS.length];
    const m = new Match(
      [
        { team: 0, human: false, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
        { team: 0, human: false, speed: PARTNER.skill.speed, reaction: PARTNER.skill.reaction, look: 0 },
        { team: 1, human: false, speed: pair.a.skill.speed, reaction: pair.a.skill.reaction, look: 0 },
        { team: 1, human: false, speed: pair.b.skill.speed, reaction: pair.b.skill.reaction, look: 0 },
      ],
      { games: 6, golden: true },
      seed,
    );
    m.setControllers([new AIController(RIVALS[2].skill), new AIController(PARTNER.skill), new AIController(pair.a.skill), new AIController(pair.b.skill)]);
    m.start();
    const chars = m.players.map(() => new CharacterView(a, kit));
    return { m, chars, gate: () => true, tick() {}, after() {}, label: `dobles ${pair.a.name}+${pair.b.name}` };
  }
  // singles: the human (or a CPU player in his place) against a rival of the ladder
  const rv = RIVALS[(i + 1) % RIVALS.length];
  const four = (human: boolean) =>
    new Match(
      [
        { team: 0, human, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
        { team: 1, human: false, speed: rv.skill.speed, reaction: rv.skill.reaction, look: 0 },
      ],
      { games: 6, golden: false, surface: (['hard', 'clay', 'grass'] as const)[i % 3] },
      seed,
    );
  if (mode === 'human') {
    const lv = Object.values(HUMANS)[i % 3];
    const bot = new ThumbBot(lv, 1, seed + 17);
    const m = four(true);
    m.setControllers([bot.ctl as unknown as Controller, new AIController(rv.skill)]);
    bot.attach(m);
    m.start();
    const chars = m.players.map(() => new CharacterView(a, kit));
    return {
      m,
      chars,
      gate: (k) => !m.players[k].human || bot.ctl.willSwing(m, m.players[k]),
      tick: () => bot.tick(m),
      after: () => bot.events(m.events),
      label: `humano(${Object.keys(HUMANS)[i % 3]}) vs ${rv.name}`,
    };
  }
  const m = four(false);
  m.setControllers([new AIController(RIVALS[(i + 3) % RIVALS.length].skill), new AIController(rv.skill)]);
  m.start();
  const chars = m.players.map(() => new CharacterView(a, kit));
  return { m, chars, gate: () => true, tick() {}, after() {}, label: `cpu vs ${rv.name}` };
}

/**
 * How the hand of a player in their own body holds the handle (gear.ts: elliptical, 13.1 × 16.3 mm, from 5 cm under the
 * grip to 7 cm over it): the skin of the hand and the wrist, skinned as drawn, in the paddle's frame. Inside: how many
 * vertices are more than 1 mm into the handle and the deepest; gap: the median of the 40 nearest to its surface.
 */
const gripVerts = new WeakMap<object, number[]>();
function gripOf(ch: CharView): { inside: number; deepest: number; gap: number } | null {
  const c = ch as unknown as { person: unknown; root: THREE.Object3D; paddle: THREE.Object3D };
  if (!c.person) return null;
  let mesh: THREE.SkinnedMesh | null = null;
  c.root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh;
  });
  if (!mesh) return null;
  const m = mesh as THREE.SkinnedMesh;
  c.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let ids = gripVerts.get(m);
  if (!ids) {
    // (the vertices that hang mostly from the right hand)
    const hand = m.skeleton.bones.findIndex((b) => b.name === 'RightHand');
    const si = m.geometry.getAttribute('skinIndex');
    const sw = m.geometry.getAttribute('skinWeight');
    ids = [];
    for (let i = 0; i < si.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hand) w += sw.getComponent(i, k);
      if (w > 0.3) ids.push(i);
    }
    gripVerts.set(m, ids);
  }
  const inv = new THREE.Matrix4().copy(c.paddle.matrixWorld).invert();
  const d: number[] = [];
  for (const i of ids) {
    // (a skinned mesh's vertex position is already skinned)
    m.getVertexPosition(i, v);
    v.applyMatrix4(m.matrixWorld).applyMatrix4(inv);
    if (v.y < -0.05 || v.y > 0.07) continue;
    const th = Math.atan2(v.z, v.x);
    const re = 1 / Math.hypot(Math.cos(th) / 0.0131, Math.sin(th) / 0.0163);
    d.push(Math.hypot(v.x, v.z) - re);
  }
  if (!d.length) return null;
  d.sort((x, y) => x - y);
  return { inside: d.filter((x) => x < -0.001).length, deepest: -d[0], gap: d[Math.min(d.length - 1, 20)] };
}

(async () => {
  const a = await loadCharAssets('', 'hero', CLIP_NAMES);
  if (process.env.RB) {
    // (their own bodies, painted by nothing: in Node there is no GPU, and the poses do not need the kit)
    const stub = { paint: () => ({ map: new THREE.Texture(), aux: new THREE.Texture() }), release() {} } as unknown as KitPainter;
    a.people = {};
    for (const n of PEOPLE) a.people[n] = { ...(await C.loadPerson('', n)), painter: stub };
  }
  const grips: { inside: number; deepest: number; gap: number }[] = [];
  const { nat, ranges } = calibrateOn(a);
  const probe = new PM.PoseProbe(nat, { keep: 8 });
  const dumps = (process.env.DUMP ?? '')
    .split(',')
    .filter(Boolean)
    .map((s) => {
      const [run, pid, t] = s.split(':');
      return { run, pid: Number(pid), t: Number(t), done: false };
    });
  const dumped: unknown[] = [];
  let swings = 0;
  let restarts = 0;
  let switches = 0;
  const switchKinds: Record<string, number> = {};
  let midStarts = 0;
  let seen = 0;
  const swLeads: number[] = [];
  const leads: number[] = [];
  type Start = (this: { swing: { key: number; kind: unknown; w: number } | null }, kind: unknown, key: number, tc: number) => void;
  const proto = CharacterView.prototype as unknown as { startSwing: Start };
  const startSwing = proto.startSwing;
  proto.startSwing = function (kind, key, tc) {
    swings++;
    if (this.swing && Math.abs(this.swing.key - key) < 0.35) {
      if (this.swing.kind === kind) restarts++;
      else {
        switches++;
        // (one the eye catches: the swing it replaces was already showing)
        if (this.swing.w > 0.3) seen++;
        swLeads.push(-tc);
        const k = `${this.swing.kind}→${kind}`;
        switchKinds[k] = (switchKinds[k] ?? 0) + 1;
      }
    }
    if (tc > -0.3) midStarts++;
    if (!this.swing || Math.abs(this.swing.key - key) >= 0.35) leads.push(-tc);
    return startSwing.call(this, kind, key, tc);
  };
  const dt = 1 / 60;
  let ri = 0;
  for (const mode of MODES) {
    const runs = mode === 'doubles' ? 2 : 3;
    for (let i = 0; i < runs; i++) {
      const r = makeRun(a, mode, i);
      const tag = `${mode}${i}`;
      const specs: (ShotSpec | null)[] = [];
      forceShots(r.m, specs, 77 + i);
      const rnd = (() => {
        let s = 99 + i;
        return () => ((s = (s * 16807) % 2147483647) / 2147483647);
      })();
      const bp = { x: 0, y: 0, z: 0 };
      const t0 = Date.now();
      let frames = 0;
      while (r.m.phase !== 'over' && r.m.t < SECS) {
        r.tick();
        r.m.update(dt);
        r.after();
        const hits: { pid: number; x: number; y: number; z: number; kind: string; vel: number[] | undefined }[] = [];
        for (const e of r.m.events) {
          if (e.type === 'hit') {
            const sp = specs[e.pid];
            r.chars[e.pid].onHit(e.x, e.y, e.z, r.m.t, r.m.players[e.pid].lastHit?.hand ?? 1, { kind: e.kind, power: e.power ?? sp?.power });
            const bv = r.m.ballVel({ x: 0, y: 0, z: 0 });
            hits.push({ pid: e.pid, x: e.x, y: e.y, z: e.z, kind: e.kind, vel: bv ? [bv.x, bv.y, bv.z] : undefined });
          }
          if (e.type === 'point') react(r.m, r.chars, e, rnd);
        }
        r.m.events.length = 0;
        const b = r.m.ballPos(bp);
        r.chars.forEach((c, k) => c.update(dt, r.m, r.m.players[k], r.gate(k), b));
        probe.frame(r.chars, r.m, dt, { run: tag });
        for (const h of hits) {
          probe.hit(r.chars[h.pid], h.pid, h.x, h.y, h.z, h.kind, { run: tag, t: +r.m.t.toFixed(3) }, h.vel);
          const g = gripOf(r.chars[h.pid]);
          if (g) grips.push(g);
          // (the swing the view played; and where the ball is met against the hips, along where they face: + in front)
          const ch = r.chars[h.pid] as unknown as { swing: { kind: string } | null; root: THREE.Object3D };
          const rec = probe.hits[probe.hits.length - 1];
          if (rec && ch.swing) {
            rec.view = ch.swing.kind;
            const hips = ch.root.getObjectByName('Hips');
            if (hips) {
              const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(hips.getWorldQuaternion(new THREE.Quaternion()));
              const hp = hips.getWorldPosition(new THREE.Vector3());
              const l = Math.hypot(fw.x, fw.z) || 1;
              rec.fwd = ((h.x - hp.x) * fw.x + (h.z - hp.z) * fw.z) / l;
              rec.rootY = +ch.root.position.y.toFixed(3);
            }
          }
        }
        for (const d of dumps) {
          if (d.done || d.run !== tag || r.m.t < d.t) continue;
          d.done = true;
          const out: Record<string, number[]> = {};
          const ch = r.chars[d.pid] as unknown as { root: THREE.Object3D };
          ch.root.updateMatrixWorld(true);
          const v = new THREE.Vector3();
          ch.root.traverse((o) => {
            if ((o as THREE.Bone).isBone || o.name === 'tipMark') out[o.name] = o.getWorldPosition(v).toArray();
          });
          const tip = (r.chars[d.pid] as unknown as { tip: THREE.Object3D }).tip.getWorldPosition(v).toArray();
          dumped.push({ run: tag, pid: d.pid, t: r.m.t, bones: out, tip, ball: b ? [b.x, b.y, b.z] : null, root: [ch.root.position.x, ch.root.position.z, ch.root.rotation.y] });
        }
        frames++;
      }
      ri++;
      console.log(`${tag.padEnd(9)} ${r.label.padEnd(26)} ${r.m.t.toFixed(0)} s de partido, ${frames} fotogramas, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
  }
  void ri;
  const rep = probe.report();
  const S = rep.stats;
  const row = (k: string, unit = '°') => {
    const s = S[k];
    if (!s) return `${k.padEnd(18)} –`;
    return `${k.padEnd(18)} n=${String(s.n).padEnd(7)} p50 ${s.p50}${unit}  p90 ${s.p90}${unit}  p99 ${s.p99}${unit}  máx ${s.max}${unit}`;
  };
  console.log(`\nfotogramas ${rep.frames} · golpes empezados ${swings} (reinicios del mismo golpe ${restarts}, cambios de golpe ${switches}, empezados a menos de 0,3 s del contacto ${midStarts})`);
  const ls = leads.slice().sort((x, y) => x - y);
  const q = (k: number) => ls[Math.min(ls.length - 1, Math.floor(k * ls.length))]?.toFixed(2);
  console.log(`cambios de golpe que se ven (el anterior ya pesaba más de 0,3): ${seen} · antelación al empezar el golpe (s antes del contacto) p10 ${q(0.1)} p50 ${q(0.5)} p90 ${q(0.9)}`);
  const sl = swLeads.slice().sort((x, y) => x - y);
  const qs = (k: number) => sl[Math.min(sl.length - 1, Math.floor(k * sl.length))]?.toFixed(2);
  console.log(`cambios de golpe: a cuánto del contacto (s) p10 ${qs(0.1)} p50 ${qs(0.5)} p90 ${qs(0.9)} · a menos de 0,45 s: ${sl.filter((x) => x < 0.45).length}`);
  console.log(`cambios: ${Object.entries(switchKinds).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  for (const k of ['elbow', 'elbowAxis', 'elbowUp_sw', 'across_sw', 'wristBend', 'wristBend_sw', 'wristTwist', 'wristTwist_sw', 'foreTwist', 'spineBend', 'spineTwist', 'torsoTilt', 'foldNoKnees', 'neck', 'headOff', 'headOffContact', 'travelAngle']) console.log(row(k));
  console.log(`elbowWrong n=${S.elbowWrongN?.n ?? 0} · reacciones con bola en juego ${S.reactInPlay?.n ?? 0} fotogramas`);
  for (const k of Object.keys(S).filter((k) => k.startsWith('slide')).sort()) console.log(row(k, ' m/s'));
  for (const k of ['rootSlide', 'turnRate', 'jerk', 'floorGap']) console.log(row(k, k === 'rootSlide' ? ' m/s' : k === 'floorGap' ? ' m' : ''));
  // (the pops by what the body is doing and by the bone that turns fastest, and the wrist in each swing: JERK=1)
  if (process.env.JERK) for (const k of Object.keys(S).filter((k) => k.startsWith('jerk_') || k.startsWith('jerkBone_') || (k.startsWith('wristBend_') && k !== 'wristBend_sw')).sort()) console.log(row(k, ''));
  for (const k of Object.keys(S).filter((k) => k.startsWith('paddle')).sort()) console.log(row(k, ' m'));
  for (const k of Object.keys(S).filter((k) => k.startsWith('backswing')).sort()) console.log(row(k, ' m'));
  // the split steps (how high, how much wider the feet, how far down the hips: see posemetrics.js)
  for (const k of ['splitHop', 'splitWiden', 'splitDip']) console.log(row(k, ' m'));
  // how the body moves: lean into starts, stops and turns; waiting (alive or frozen, the stance, the paddle); where the
  // ball is met against the hips
  const rowp = (k: string, unit: string) => {
    const s = S[k];
    return s ? `${k.padEnd(18)} n=${String(s.n).padEnd(7)} p10 ${s.p10}${unit}  p50 ${s.p50}${unit}  p90 ${s.p90}${unit}  máx ${s.max}${unit}` : `${k.padEnd(18)} –`;
  };
  for (const k of ['leanStart', 'leanBrake', 'leanTurn', 'idleRate', 'kneeIdle', 'torsoIdle']) console.log(rowp(k, '°'));
  for (const k of ['idleHips', 'hipsIdle', 'paddleIdleY', 'paddleIdleFwd', 'paddleMoveY']) console.log(rowp(k, k === 'idleHips' ? ' m/s' : ' m'));
  for (const k of Object.keys(S).filter((k) => k.startsWith('contactFwd') || k.startsWith('contactDist') || k.startsWith('stance')).sort()) console.log(rowp(k, ' m'));
  if (S.contactBehind) console.log(`contacto por detrás de la cadera: ${(S.contactBehind.share * 100).toFixed(1)} % de ${S.contactBehind.n}`);
  if (S.contactJammed) console.log(`contacto pegado al cuerpo (a menos de 35 cm de la cadera): ${(S.contactJammed.share * 100).toFixed(1)} % de ${S.contactJammed.n}`);
  // the ready stance and between points (see readyMeasures in posemetrics.js), the free arm, the serve, the face
  console.log('\n— postura de espera (Idle), entre puntos (Rest); K: línea de cocina, D: fondo —');
  for (const k of Object.keys(S).filter((k) => /^(padHead|padFace|padChest|freeToPaddle|elbowFwd|hipsBack|knee(Idle|Rest)|hips(Idle|Rest)|torso(Idle|Rest)|serveWait|serveTip|serveHead|driveFinish|faceOff|freeAbd|freeElbow|freeLat|padAhead)/.test(k)).sort()) console.log(rowp(k, /^(pad(Head|Face)|knee|torso|faceOff|free(Abd|Elbow))/.test(k) ? '°' : ' m'));
  for (const k of Object.keys(S).filter((k) => /^(freeOut|freeStiff|padFlat|freeWide)/.test(k)).sort()) console.log(`${k.padEnd(18)} ${(S[k].share * 100).toFixed(1)} % de ${S[k].n}`);
  // padel: paddle–ball at the contact and the contact in front of the hips, by what is shown (remate, bandeja and
  // víbora apart)
  {
    type H = { d: number; view?: string; fwd?: number; y: number; rootY?: number };
    const by: Record<string, H[]> = {};
    for (const h of probe.hits as H[]) (by[h.view ?? 'none'] ??= []).push(h);
    const pc = (a: number[], k: number) => {
      const s = a.slice().sort((x, y) => x - y);
      return s.length ? s[Math.min(s.length - 1, Math.floor(k * s.length))] : NaN;
    };
    const cm = (v: number) => (v * 100).toFixed(1);
    console.log('\n— por golpe (pala a la bola en el contacto, cm; contacto delante de la cadera, cm; altura de la bola, m; el cuerpo sobre el suelo, cm) —');
    for (const [k, a] of Object.entries(by).sort((x, y) => y[1].length - x[1].length)) {
      const d = a.map((h) => h.d);
      const f = a.filter((h) => h.fwd !== undefined).map((h) => h.fwd as number);
      const y = a.map((h) => h.y);
      const ry = a.map((h) => h.rootY ?? 0);
      console.log(`${k.padEnd(11)} n=${String(a.length).padEnd(5)} pala p50 ${cm(pc(d, 0.5))} p90 ${cm(pc(d, 0.9))} máx ${cm(pc(d, 1))} · delante p10 ${cm(pc(f, 0.1))} p50 ${cm(pc(f, 0.5))} · bola p50 ${pc(y, 0.5).toFixed(2)} máx ${pc(y, 1).toFixed(2)} · salto p50 ${cm(pc(ry, 0.5))} máx ${cm(pc(ry, 1))}`);
    }
  }
  if (grips.length) {
    const pc = (k: keyof (typeof grips)[0], q: number) => {
      const v = grips.map((g) => g[k]).sort((x, y) => x - y);
      return v[Math.min(v.length - 1, Math.floor(q * v.length))];
    };
    console.log(`\nagarre (su cuerpo, en ${grips.length} contactos): vértices de la mano dentro del mango p50 ${pc('inside', 0.5)} máx ${pc('inside', 1)} · lo más hondo p50 ${(pc('deepest', 0.5) * 1000).toFixed(1)} mm máx ${(pc('deepest', 1) * 1000).toFixed(1)} mm · holgura de la piel más cercana p50 ${(pc('gap', 0.5) * 1000).toFixed(1)} mm`);
  }
  if (S.idleFrozen) console.log(`espera congelada: ${(S.idleFrozen.share * 100).toFixed(1)} % de ${S.idleFrozen.n} fotogramas · tramos de más de 0,25 s: ${S.idleFrozen.runs} (p50 ${S.idleFrozen.p50} s, p90 ${S.idleFrozen.p90} s, máx ${S.idleFrozen.max} s)`);
  if (OUT) {
    writeFileSync(OUT, JSON.stringify({ ...rep, nat, ranges, dumped, ...(process.env.HITS ? { hits: probe.hits } : {}) }, null, 1));
    console.log(`\n→ ${OUT}`);
  }
})();
