// Banco de pruebas del render del tenis (agente de gráficos): la View sola, sin la interfaz de main.ts, con un partido
// de la simulación tal como esté. Mientras match.ts siga siendo el de pádel (cuatro jugadores, saque por abajo), el
// saque se reescribe aquí al del contrato (docs/tenis/contrato.md: contacto a SERVE_HEIGHT 2,75 m, SERVE_WINDUP 1,05 s
// tras el serveStart, 0,35 m dentro de la línea de fondo y 0,25 m a la derecha del sacador) y el individual esconde a
// los compañeros. Se compila con tools/render/build-shim.mjs (entrada harness) y se maneja desde window.__h.
import { View } from '../../src/render/view';
import { Match, type PlayerCfg } from '../../src/sim/match';
import { AIController, PAIRS, RIVALS } from '../../src/sim/brain';
import { HL } from '../../src/sim/court';
import type { CourtSurface } from '../../src/sim/court';
import { HERO, RIVAL_KITS, PARTNER_KIT, onSurface } from '../../src/kits';
import { Rng } from '../../src/sim/rng';
import { CharacterView } from '../../src/render/chars';
import { SCENARIOS, stage } from './stage-lib';

const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block';
document.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
document.body.appendChild(canvas);
const view = new View(canvas);
const q = new URLSearchParams(location.search);
view.setTier((q.get('tier') as 'high' | 'medium' | 'low') ?? 'medium');
addEventListener('resize', () => view.resize());
let match: Match | null = null;
let singles = false;
const SERVE = { height: 2.75, windup: 1.05, inside: 0.35, right: 0.25 };
let loaded = false;
view.load('').then(() => (loaded = true));

function start(surface: CourtSurface = 'hard', single = false, seed = 4242) {
  singles = single;
  // (as main.ts: a seed whose toss gives the first serve to the near team)
  while (new Rng(seed).next() >= 0.5) seed = (seed + 1) | 0;
  const pair = PAIRS[2];
  const cfg = (team: 0 | 1, look: number): PlayerCfg => ({ team, human: false, speed: 5.2, reaction: 0.2, look });
  match = new Match([cfg(0, 0), cfg(0, 6), cfg(1, pair.a.look), cfg(1, pair.b.look)], { games: 4, golden: false, sets: 1, surface } as never, seed);
  match.setControllers([new AIController(RIVALS[3].skill), new AIController(RIVALS[2].skill), new AIController(pair.a.skill), new AIController(pair.b.skill)]);
  match.start();
  const dress = (k: typeof HERO) => onSurface(k, surface).kit;
  view.setMatch(match, [dress(HERO), dress(PARTNER_KIT), dress(RIVAL_KITS[pair.a.id]), dress(RIVAL_KITS[pair.b.id])], true);
  view.setCourt(surface, single);
  view.boardNames = single ? ['SINER', 'ALCARÁS'] : ['SINER / GRANOYERS', 'MEDVÉDIEV / SINER'];
  view.showTarget = false;
  hideOthers();
}
/** individual: los compañeros (1 y 3) fuera de la vista */
function hideOthers() {
  const v = view as unknown as { chars: { root: { visible: boolean } }[]; feetShadows: { visible: boolean }[] };
  v.chars.forEach((c, i) => (c.root.visible = !singles || i === 0 || i === 2));
  v.feetShadows.forEach((f, i) => (f.visible = f.visible && (!singles || i === 0 || i === 2)));
}
let clock = 0;
function step(dt: number) {
  const m = match!;
  m.update(dt);
  for (const e of m.events) {
    if (e.type === 'serveStart') {
      // the contract's serve: from just behind the baseline, met high in front, SERVE_WINDUP after the start
      const w = m.windup!;
      const s = m.players[w.pid];
      const side = s.side;
      s.z = side * (HL + 0.1);
      w.at = m.t + SERVE.windup;
      w.y = SERVE.height;
      w.z = side * (HL - SERVE.inside);
      // (the server's right: +x for the near side, who faces −z)
      w.x = s.x + side * SERVE.right;
      (e as { at: number }).at = w.at;
    }
    if (e.type === 'hit') view.onHit(e.pid, e.x, e.y, e.z, m.t, m.players[e.pid].lastHit?.hand ?? 1);
    if (e.type === 'hit') view.hitFx(e.x, e.y, e.z, false, 0.3);
    if (e.type === 'bounce') view.bounceFx(e.x, e.z, e.good);
    if (e.type === 'net') view.netFx();
  }
  m.events.length = 0;
  clock += dt;
  view.frame(dt, clock);
  hideOthers();
}
(window as unknown as { __h: unknown }).__h = {
  view,
  get match() {
    return match;
  },
  get loaded() {
    return loaded;
  },
  start,
  /** avanza `sec` segundos de partido a pasos de `dt`, sin dibujar */
  advance(sec: number, dt = 1 / 60) {
    view.skipRender = true;
    for (let t = 0; t < sec - 1e-9; t += dt) step(dt);
    view.skipRender = false;
  },
  render() {
    view.skipRender = true;
    view.frame(0, clock);
    view.skipRender = false;
    hideOthers();
    view.render(1 / 60);
  },
  /**
   * una cámara fija mirando al sacador (o al jugador pid): 'side' de lado, a su derecha; 'front' desde delante, en
   * diagonal; 'back' desde detrás
   */
  playerCam(pid: number, k: 'side' | 'front' | 'back' = 'side', y = 1.5) {
    const p = match!.players[pid];
    const s = p.side;
    const P = { side: [-s * 4.2, 1.5, s * 0.6], front: [-s * 2.4, 1.7, -s * 4.2], back: [s * 1.2, 2.0, s * 4.6] }[k];
    view.debugCam = { px: p.x + P[0], py: P[1], pz: p.z + P[2], lx: p.x - s * 0.15, ly: y, lz: p.z - s * 0.3 };
  },
  SERVE,
  /**
   * un golpe escenificado (tools/render/stage-lib.ts) con un jugador nuevo, fotografiado a los tiempos `times` (s del
   * contacto) desde las cámaras `cams` (side: de lado a su derecha; front: delante en diagonal; back: detrás): data URLs
   */
  stageShots(name: string, times: number[], cams: string[]) {
    const v = view as unknown as { chars: { root: { visible: boolean } }[]; assets: unknown; kits: unknown[]; ball: { visible: boolean; position: { set(x: number, y: number, z: number): void }; scale: { setScalar(s: number): void } }; ballShadow: { visible: boolean; position: { set(x: number, y: number, z: number): void } }; smear: { visible: boolean }; scene: { add(o: unknown): void; remove(o: unknown): void }; camera: { fov: number; position: { set(x: number, y: number, z: number): void }; lookAt(x: number, y: number, z: number): void; updateProjectionMatrix(): void; updateMatrixWorld(): void }; renderer: { domElement: HTMLCanvasElement } };
    const sc = SCENARIOS.find((s) => s.name === name)!;
    v.chars.forEach((c) => (c.root.visible = false));
    const ch = new CharacterView(v.assets as never, v.kits[0] as never, 1.78);
    v.scene.add(ch.root);
    const out: Record<string, string> = {};
    const want = times.slice();
    const res = stage(ch as never, sc, (tc, ball) => {
      const i = want.findIndex((t) => Math.abs(t - tc) < 1 / 120);
      if (i < 0) return;
      want.splice(i, 1);
      if (ball) {
        v.ball.visible = v.ballShadow.visible = true;
        v.ball.position.set(ball.x, ball.y, ball.z);
        v.ball.scale.setScalar(0.7);
        v.ballShadow.position.set(ball.x, 0.012, ball.z);
      } else v.ball.visible = v.ballShadow.visible = false;
      v.smear.visible = false;
      const x = sc.x + (sc.fx ?? 0);
      const z = sc.z + (sc.fz ?? 0.15);
      const high = sc.y > 1.9;
      for (const k of cams) {
        const P = ({ side: [4.6, 1.35, 0.3], front: [2.2, 1.6, -4.4], back: [-1.6, 1.9, 4.4], left: [-4.6, 1.35, 0.3] } as Record<string, number[]>)[k];
        v.camera.fov = high ? 34 : 28;
        v.camera.updateProjectionMatrix();
        v.camera.position.set(x + P[0], P[1] + (high ? 0.45 : 0), z + P[2]);
        v.camera.lookAt(x, high ? 1.6 : 1.1, z - 0.2);
        v.camera.updateMatrixWorld();
        view.render(1 / 60);
        out[`${k}@${tc.toFixed(2)}`] = v.renderer.domElement.toDataURL('image/jpeg', 0.9);
      }
    });
    v.scene.remove(ch.root);
    ch.dispose();
    v.chars.forEach((c) => (c.root.visible = true));
    return { res, shots: out };
  },
};
let lastT = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (match && !(window as unknown as { __manual?: boolean }).__manual) step(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
