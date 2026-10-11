// Random thumbs in the training challenges (src/sim/drill.ts): the real Input and HumanController driven by noise
// (the stick anywhere, presses and drags anywhere, releases at any moment, taps in the pauses), every challenge, both
// swings and every help level. Checks: no exception, no NaN, every go ends with all its balls scored, the machine stays
// put and the score is never more than the maximum.
// npx tsx tools/review/drillfuzz.ts [goes per challenge = 12]
import './globals';
import { Input } from '../../src/input';
import { HumanController } from '../../src/human';
import { DRILLS, Drill } from '../../src/sim/drill';
import { Rng } from '../../src/sim/rng';

const N = Number(process.argv[2] ?? 12);
let bad = 0;
let goes = 0;
let balls = 0;
for (const def of DRILLS) {
  for (let i = 0; i < N; i++) {
    const rng = new Rng(777 + i * 131 + def.balls);
    const el = { addEventListener() {}, clientWidth: 390, setPointerCapture() {} } as unknown as HTMLElement;
    let d: Drill | null = null;
    const input = new Input(el, () => d?.match.t ?? 0);
    const human = new HumanController(input);
    human.mode = i % 3 === 2 ? 'manual' : 'assist';
    human.assist = i % 3;
    human.pxPerM = 33;
    d = new Drill(def, human, 9000 + i * 7);
    d.start();
    const m = d.match;
    let guard = 0;
    let err = '';
    try {
      while (!d.done && guard++ < 60 * 60 * 8) {
        if (m.phase === 'serve') human.serveSince = Math.min(human.serveSince, m.t);
        // the left thumb: a new direction now and then, or let go
        if (rng.chance(0.04)) {
          const a = rng.next() * Math.PI * 2;
          const k = rng.chance(0.3) ? 0 : rng.next();
          input.stickX = Math.cos(a) * k;
          input.stickY = Math.sin(a) * k;
        }
        // the right thumb: press, drag anywhere, let go at any moment
        if (!input.pressing && rng.chance(0.05)) {
          input.pressing = true;
          input.dx = (rng.next() - 0.5) * 300;
          input.dy = (rng.next() - 0.5) * 300;
        } else if (input.pressing && rng.chance(0.08)) (input as unknown as { end(c: boolean): void }).end(false);
        if (m.phase === 'dead' && def.id === 'serve' && rng.chance(0.02)) m.hurry();
        m.update(1 / 60);
        for (const e of m.events) d.event(e);
        m.events.length = 0;
        d.frame();
        const me = m.players[0];
        const q = m.players[1];
        if (!Number.isFinite(me.x + me.z + m.t) || Math.abs(me.x) > 5 || Math.abs(me.z) > 9.2 || me.z < 0.39) err = `jugador fuera o NaN (${me.x.toFixed(2)}, ${me.z.toFixed(2)})`;
        if (Math.hypot(q.x - def.machine.x, q.z - def.machine.z) > 0.01) err = 'la máquina se movió';
        if (err) break;
      }
    } catch (e) {
      err = String(e);
    }
    goes++;
    balls += d.ball;
    if (!err && !d.done) err = `no acabó (${d.ball}/${def.balls} bolas, fase ${m.phase})`;
    if (!err && d.score > def.max) err = `puntos ${d.score} > máximo ${def.max}`;
    if (!err && d.ball !== def.balls) err = `bolas ${d.ball} de ${def.balls}`;
    if (err) {
      bad++;
      console.log(`${def.id} #${i}: ${err}`);
    }
  }
}
console.log(`${goes} intentos, ${balls} bolas con pulgares al azar: ${bad} con fallos`);
