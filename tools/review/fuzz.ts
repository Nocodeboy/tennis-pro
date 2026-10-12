// Random thumbs: the real Input and HumanController driven by noise (stick flicks and holds, presses, drags, releases,
// Space with arrows, taps in the pause after a point, and the right thumb's gestures through the real path: taps and
// flicks, docs/pickleball/notas-08-ataque.md) in padel against every pair, every help level, both swings and both
// scorings (golden point, advantages). Checks: no exception, no NaN, nobody through the net or the glass, the ball
// never below the floor nor out of the court before the point is over, no match stuck.
// npx tsx tools/review/fuzz.ts [matches=24]
const g = globalThis as unknown as { window?: unknown };
g.window ??= { addEventListener() {} };
import { Input } from '../../src/input';
import { HumanController } from '../../src/human';
import { AIController, HUMAN_REACTION, HUMAN_SPEED, PAIRS, PARTNER } from '../../src/sim/brain';
import { HL, W } from '../../src/sim/court';
import { Match } from '../../src/sim/match';
import { Rng } from '../../src/sim/rng';

const N = Number(process.argv[2] ?? 24);
let stuck = 0;
let bad = 0;
let points = 0;
const intents = { attack: 0, block: 0 };
const specials = { por3: 0, por4: 0, bajada: 0 };
for (let i = 0; i < N; i++) {
  const rng = new Rng(500 + i * 13);
  const el = { addEventListener() {}, clientWidth: 390, setPointerCapture() {} } as unknown as HTMLElement;
  let m: Match | null = null;
  const input = new Input(el, () => m?.t ?? 0);
  const ctl = new HumanController(input);
  ctl.assist = i % 3;
  ctl.mode = i % 4 === 3 ? 'manual' : 'assist';
  ctl.recover = i % 5 < 2;
  ctl.pxPerM = 33;
  const pair = PAIRS[i % 4];
  const ais = [PARTNER, pair.a, pair.b];
  m = new Match(
    [{ team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 }, ...ais.map((r, k) => ({ team: (k === 0 ? 0 : 1) as 0 | 1, human: false, speed: r.skill.speed, reaction: r.skill.reaction, look: r.look }))],
    { games: 3, golden: i % 3 !== 2 },
    900 + i,
  );
  m.setControllers([ctl, ...ais.map((r) => new AIController(r.skill))]);
  m.start();
  const end = () => (input as unknown as { end(c: boolean): void }).end(false);
  // a gesture under way: a tap (down, a few frames, up) or a flick (down, a stroke up, up)
  let gest: { kind: 'tap' | 'flick' | 'down' | 'side'; n: number; y: number } | null = null;
  let wasOut = false;
  let guard = 0;
  try {
    while (m.phase !== 'over' && guard++ < 60 * 60 * 60) {
      // the left thumb: flicks, holds, lets go
      if (rng.chance(0.04)) {
        const a = rng.next() * Math.PI * 2;
        const k = rng.chance(0.3) ? 0 : 0.2 + rng.next() * 0.8;
        input.stickX = Math.cos(a) * k;
        input.stickY = Math.sin(a) * k;
      }
      // the right thumb's gestures, frame by frame
      if (gest) {
        if (gest.kind === 'flick') input.aimMove((rng.next() - 0.5) * 20, (gest.y -= 8 + rng.next() * 20), m.t);
        // (0.3: the down-flick, por 4 over the head, and a fast stroke across: a hard shot)
        else if (gest.kind === 'down') input.aimMove((rng.next() - 0.5) * 20, (gest.y += 8 + rng.next() * 30), m.t);
        else if (gest.kind === 'side') input.aimMove((gest.y += 10 + rng.next() * 25), (rng.next() - 0.5) * 20, m.t);
        if (--gest.n <= 0) {
          input.aimUp(m.t);
          gest = null;
        }
      } else if (!input.pressing && rng.chance(0.015)) {
        const u = rng.next();
        gest = u < 0.35 ? { kind: 'tap', n: 1 + Math.floor(rng.next() * 12), y: 0 } : { kind: u < 0.7 ? 'flick' : u < 0.85 ? 'down' : 'side', n: 2 + Math.floor(rng.next() * 6), y: 0 };
        input.aimDown(m.t);
      }
      // the right thumb: press, drag, release
      else if (!input.pressing && rng.chance(0.03)) {
        input.pressing = true;
        input.dx = (rng.next() - 0.5) * 260;
        input.dy = (rng.next() - 0.5) * 300;
      } else if (input.pressing && !gest && rng.chance(0.06)) end();
      // keyboard aim through the real key steps
      if (rng.chance(0.01)) {
        const a = input.keyAim?.(Math.floor(rng.next() * 5) - 2, Math.floor(rng.next() * 6) - 2);
        if (a && input.pressing) {
          input.dx = a.dx;
          input.dy = a.dy;
        }
      }
      if (m.phase === 'dead' && rng.chance(0.05)) m.hurry();
      m.update(1 / 60);
      for (const e of m.events) {
        if (e.type === 'point') points++;
        if (e.type === 'hit' && e.intent) intents[e.intent]++;
        if (e.type === 'hit' && e.special) specials[e.special]++;
        if (e.type === 'hit' && e.kind === 'bajada') specials.bajada++;
        if (e.type === 'hit' && (e.power === undefined || !Number.isFinite(e.power))) throw new Error(`hit without power ${e.kind}`);
      }
      m.events.length = 0;
      for (const p of m.players) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.vx) || !Number.isFinite(p.vz)) throw new Error(`NaN player ${p.id}`);
        // (the fence holds the human; the CPU players are not fenced in: they are only checked against the net)
        if (p.z * p.side < 0.39 || Math.abs(p.x) > W / 2 - 0.29 || Math.abs(p.z) > HL - 0.29) throw new Error(`player ${p.id} out of bounds ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
      }
      const b = m.ballPos();
      if (b && (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.z) || b.y < 0)) throw new Error(`ball ${b.x},${b.y},${b.z}`);
      // inside the glass while the ball is live, and also once it is dead unless it left over the top of a wall (it
      // crossed the wall's plane above 2 m: the lowest wall top, the step, is at 2 m)
      const outside = !!b && (Math.abs(b.x) > W / 2 + 0.01 || Math.abs(b.z) > HL + 0.01);
      if (b && outside && !wasOut) {
        if (m.phase === 'rally' || b.y < 2) throw new Error(`ball through the wall ${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)} (${m.phase})`);
      }
      wasOut = outside;
    }
    if (m.phase !== 'over') stuck++;
  } catch (err) {
    bad++;
    console.log(`partido ${i} (ayuda ${ctl.assist}, ${ctl.mode}): ${(err as Error).message}`);
  }
}
console.log(`${N} partidos, ${points} puntos con pulgares al azar (${intents.attack} ataques y ${intents.block} bloqueos; ${specials.por3} por 3, ${specials.por4} por 4, ${specials.bajada} bajadas): ${bad} con fallos, ${stuck} atascados`);
