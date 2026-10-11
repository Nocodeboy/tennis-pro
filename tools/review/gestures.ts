// The right thumb's three gestures (src/input.ts, docs/notas-08-ataque.md), checked with synthetic presses through the
// real event handlers: pointer events as a phone sends them (60 and 120 Hz), the mouse (right button) and the keys
// (Space, F, the arrows). Each case says what the release must be: a plain aimed shot, a tap (block) or an attack.
// npx tsx tools/review/gestures.ts
type Fn = (e: Record<string, unknown>) => void;
const win: Record<string, Fn> = {};
const g = globalThis as unknown as { window?: unknown };
g.window = { addEventListener: (t: string, f: Fn) => (win[t] = f) };
import { FLICK, Input } from '../../src/input';

const el: Record<string, Fn> = {};
const fake = { addEventListener: (t: string, f: Fn) => (el[t] = f), clientWidth: 390, setPointerCapture() {} } as unknown as HTMLElement;
let simT = 0;
const input = new Input(fake, () => simT);

type Step = [number, number, number]; // ms, x, y (CSS px, from where the finger lands at 300, 600)
/** A touch (or mouse) press: positions over time; the lift at the last one. */
function press(steps: Step[], opts: { mouse?: boolean; button?: number } = {}) {
  const [t0, x0, y0] = steps[0];
  const ev = (type: string, t: number, x: number, y: number) =>
    el[type]({ pointerId: 7, pointerType: opts.mouse ? 'mouse' : 'touch', button: opts.button ?? 0, clientX: 300 + x, clientY: 600 + y, timeStamp: t, type, preventDefault() {} });
  simT = t0 / 1000;
  ev('pointerdown', t0, x0, y0);
  for (const [t, x, y] of steps.slice(1, -1)) {
    simT = t / 1000;
    ev('pointermove', t, x, y);
  }
  const [t1, x1, y1] = steps[steps.length - 1];
  simT = t1 / 1000;
  ev('pointerup', t1, x1, y1);
  return input.take(-Infinity);
}
/** Keys: [ms, 'down' | 'up', code] */
function keys(seq: [number, 'down' | 'up', string][]) {
  for (const [t, k, code] of seq) {
    simT = t / 1000;
    win[k === 'down' ? 'keydown' : 'keyup']({ code, repeat: false, timeStamp: t, preventDefault() {} });
  }
  return input.take(-Infinity);
}
/** A straight stroke from (x0, y0) to (x1, y1) over `ms`, sampled every `dt` ms, starting at `t0` ms. */
function stroke(t0: number, x0: number, y0: number, x1: number, y1: number, ms: number, dt = 16.7): Step[] {
  const out: Step[] = [];
  for (let t = 0; t <= ms + 1e-6; t += dt) out.push([t0 + t, x0 + ((x1 - x0) * t) / ms, y0 + ((y1 - y0) * t) / ms]);
  if (out[out.length - 1][0] < t0 + ms) out.push([t0 + ms, x1, y1]);
  return out;
}
const hold = (t0: number, x: number, y: number, ms: number, dt = 16.7): Step[] => stroke(t0, x, y, x, y, ms, dt);

const cases: { name: string; want: 'plain' | 'tap' | 'attack'; r: ReturnType<typeof press>; check?: (r: NonNullable<ReturnType<typeof press>>) => boolean }[] = [];
const add = (name: string, want: 'plain' | 'tap' | 'attack', r: ReturnType<typeof press>, check?: (r: NonNullable<ReturnType<typeof press>>) => boolean) => cases.push({ name, want, r, check });

add('toque de 120 ms, 4 px', 'tap', press([...hold(1000, 0, 0, 60), [1060, 3, -2], [1120, 4, -2]]));
add('toque de 250 ms quieto', 'tap', press(hold(2000, 0, 0, 250)));
add('pulsación quieta de 600 ms', 'plain', press(hold(3000, 0, 0, 600)));
add('toque con 20 px de arrastre', 'plain', press([...stroke(4000, 0, 0, 0, -20, 100), [4150, 0, -20]]));
add('apuntar despacio y soltar parado', 'plain', press([...stroke(5000, 0, 0, 30, -80, 350), ...hold(5350, 30, -80, 300).slice(1)]));
add('apuntar a 300 px/s y soltar moviendo', 'plain', press(stroke(6000, 0, 0, 0, -90, 300)));
add('apuntar rápido (100 px en 0,1 s) y parar 0,15 s', 'plain', press([...stroke(7000, 0, 0, 0, -100, 100), ...hold(7100, 0, -100, 150).slice(1)]));
add('flick desde quieto, 900 px/s, 60 Hz', 'attack', press([...hold(8000, 0, 0, 100), ...stroke(8100, 0, 0, 0, -75, 83).slice(1)]), (r) => Math.hypot(r.ax ?? 99, r.ay ?? 99) < 20);
add('flick desde quieto, 700 px/s, 120 Hz', 'attack', press([...hold(9000, 0, 0, 100, 8.3), ...stroke(9100, 0, 0, 0, -56, 80, 8.3).slice(1)]));
add('flick de 60 ms sin parar antes (pulsar y latigazo)', 'attack', press(stroke(10000, 0, 0, 0, -70, 60)));
add('apuntar a (40, 20), parar y flick', 'attack', press([...stroke(11000, 0, 0, 40, 20, 250), ...hold(11250, 40, 20, 200).slice(1), ...stroke(11450, 40, 20, 40, -60, 80).slice(1)]), (r) => Math.abs((r.ax ?? 0) - 40) < 15 && Math.abs((r.ay ?? 0) - 20) < 15);
add('flick a 40° de la vertical', 'attack', press([...hold(12000, 0, 0, 100), ...stroke(12100, 0, 0, 55, -66, 80).slice(1)]), (r) => (r.fx ?? 0) > 0.5);
add('flick a 70° de la vertical (de lado)', 'plain', press([...hold(13000, 0, 0, 100), ...stroke(13100, 0, 0, 80, -29, 80).slice(1)]));
add('barrido rápido hacia abajo', 'plain', press([...hold(14000, 0, 0, 100), ...stroke(14100, 0, 0, 0, 80, 80).slice(1)]));
add('flick lento (500 px/s)', 'plain', press([...hold(15000, 0, 0, 100), ...stroke(15100, 0, 0, 0, -40, 80).slice(1)]));
add('ratón: arrastre y suelta parado', 'plain', press([...stroke(16000, 0, 0, -20, -60, 300), ...hold(16300, -20, -60, 200).slice(1)], { mouse: true }));
add('ratón: flick', 'attack', press([...hold(17000, 0, 0, 100), ...stroke(17100, 0, 0, 0, -90, 70).slice(1)], { mouse: true }));
add('ratón: botón derecho, quieto', 'attack', press(hold(18000, 0, 0, 400), { mouse: true, button: 2 }));
add('Espacio corto', 'tap', keys([[19000, 'down', 'Space'], [19120, 'up', 'Space']]));
add('Espacio largo', 'plain', keys([[20000, 'down', 'Space'], [20600, 'up', 'Space']]));
add('Espacio + ↑ y soltar enseguida', 'plain', keys([[21000, 'down', 'Space'], [21200, 'down', 'ArrowUp'], [21240, 'up', 'Space']]));
add('Espacio + ↑ corto (no es toque)', 'plain', keys([[22000, 'down', 'Space'], [22050, 'down', 'ArrowUp'], [22150, 'up', 'Space']]));
add('F corto', 'attack', keys([[23000, 'down', 'KeyF'], [23100, 'up', 'KeyF']]));
add('F + →', 'attack', keys([[24000, 'down', 'KeyF'], [24100, 'down', 'ArrowRight'], [24400, 'up', 'KeyF']]), (r) => (r.ax ?? 0) > 20);
// a tool that sets the press by hand (the old bots, tools/review/*): a plain release, whatever it was
input.pressing = true;
input.dx = 0;
input.dy = -100;
(input as unknown as { end(c: boolean): void }).end(false);
add('a mano (herramientas antiguas)', 'plain', input.take(-Infinity));
// held through the contact in the middle of a stroke
simT = 30;
input.aimDown(30);
for (let i = 1; i <= 4; i++) {
  simT = 30 + i / 60;
  input.aimMove(0, -15 * i, simT);
}
const mid = input.gestureNow();
add('contacto a medio flick (sin soltar)', 'attack', mid ? { t: 0, dx: 0, dy: 0, ...mid } : null);
simT = 31;
const late = input.gestureNow();
add('el mismo dedo 1 s después, quieto', 'plain', late ? { t: 0, dx: 0, dy: 0, ...late } : { t: 0, dx: 0, dy: 0 });
input.clear();
// a tap still down when the ball arrives (a late block), and a still press held longer (a plain one)
simT = 40;
input.aimDown(40);
simT = 40.12;
const tapDown = input.gestureNow();
add('toque aún apoyado en el contacto (120 ms)', 'tap', tapDown ? { t: 0, dx: 0, dy: 0, ...tapDown } : { t: 0, dx: 0, dy: 0 });
simT = 40.5;
const longDown = input.gestureNow();
add('pulsación quieta de 500 ms en el contacto', 'plain', longDown ? { t: 0, dx: 0, dy: 0, ...longDown } : { t: 0, dx: 0, dy: 0 });
input.clear();

let bad = 0;
for (const c of cases) {
  const got = !c.r ? 'nada' : c.r.gesture === 'attack' ? 'attack' : c.r.gesture === 'tap' ? 'tap' : 'plain';
  const ok = got === c.want && (!c.check || (c.r && c.check(c.r)));
  if (!ok) bad++;
  const extra = c.r?.gesture === 'attack' ? ` (apuntado ${Math.round(c.r.ax ?? 0)}, ${Math.round(c.r.ay ?? 0)} · trazo ${(c.r.fx ?? 0).toFixed(2)}, ${(c.r.fy ?? 0).toFixed(2)})` : '';
  console.log(`${ok ? 'bien ' : 'MAL  '} ${c.name.padEnd(48)} → ${got}${extra}`);
}
console.log(`\n${cases.length - bad} de ${cases.length} bien · flick: ${FLICK.speed} px/s en los últimos ${FLICK.window * 1000} ms, ${FLICK.travel} px, ±${FLICK.cone}°`);
if (bad) process.exit(1);
