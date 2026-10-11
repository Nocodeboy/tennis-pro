// The serve, measured: speed off the paddle, flight time and how high it crosses the net, for the clearance of a plain
// and of a perfect human serve, to the middle of the box and deep. npx tsx tools/review/serve.ts
import { minFlight, shotByClearance } from '../../src/sim/ball';
import { HL, NVZ } from '../../src/sim/court';
import { SPIN } from '../../src/sim/match';

const from = { x: 1.1 - 0.15, y: 0.7, z: HL + 0.35 - 0.35 };
for (const [name, d] of [
  ['middle of the box', (NVZ + HL) / 2 + 0.3],
  ['deep', HL - 0.6],
] as const) {
  for (const clear of [0.7, 0.55, 0.45]) {
    const tx = -1.5;
    const tz = -d;
    const dist = Math.hypot(tx - from.x, tz - from.z);
    const s = shotByClearance(from, tx, tz, clear, minFlight(dist), SPIN.serve);
    const v = Math.hypot(s.v.x, s.v.y, s.v.z);
    console.log(`${name.padEnd(18)} clear ${clear.toFixed(2)}: ${v.toFixed(1)} m/s, flight ${s.T.toFixed(2)} s`);
  }
}
