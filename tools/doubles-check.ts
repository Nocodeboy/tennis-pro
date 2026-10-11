// Checks the doubles serve rotation against hand-worked USA Pickleball sequences (both scoring systems): the score
// call, who serves and from which court, the receiver and where everybody stands. No rallies are played: the points
// are handed out directly. Usage: npx tsx tools/doubles-check.ts

import { HL, NVZ } from '../src/sim/court';
import { Match } from '../src/sim/match';
import type { Scoring } from '../src/sim/types';

const NAMES = ['A1', 'A2', 'B1', 'B2'];
let fails = 0;

function make(scoring: Scoring): Match {
  const m = new Match(
    [0, 0, 1, 1].map((team) => ({ team: team as 0 | 1, human: false, speed: 4, reaction: 0.2, look: 0 })),
    { scoring, to: 11 },
    1,
  );
  m.serverTeam = 0;
  m.setupServe();
  return m;
}

/** hands the point to `winner` as if a rally had been played, then sets up the next serve */
function point(m: Match, winner: 0 | 1) {
  const mm = m as unknown as { rally: { shots: number } | null; endPoint(w: 0 | 1, r: string, f: number | null, t: number): void };
  mm.rally = { shots: 5 };
  mm.endPoint(winner, 'winner', null, m.t);
  if (m.phase !== 'over') m.setupServe();
}

/** "call server court" now, e.g. "2-2-2 B2 L" (court from the server's own view) */
function state(m: Match): string {
  const s = m.server();
  const right = m.courtX(s) === s.side;
  return `${m.call()} ${NAMES[s.id]} ${right ? 'R' : 'L'}`;
}

function checkPositions(m: Match, label: string) {
  const s = m.server();
  const rcv = m.players[m.receiverId];
  const sp = m.mate(s);
  const rp = m.mate(rcv);
  const ok =
    rcv.team !== s.team &&
    Math.sign(rcv.x) === -Math.sign(s.x) && // diagonal
    Math.abs(s.z) > HL &&
    Math.abs(sp.z) > HL && // the server's partner at the baseline
    Math.abs(rcv.z) > HL &&
    Math.abs(rp.z) < NVZ + 0.5 && // the receiver's partner at the kitchen line
    Math.sign(sp.x) === -Math.sign(s.x) &&
    Math.sign(rp.x) === -Math.sign(rcv.x);
  if (!ok) {
    fails++;
    console.log(`  ✗ positions wrong at ${label}`);
  }
}

function run(scoring: Scoring, steps: [0 | 1 | null, string][], setup?: (m: Match) => void) {
  const m = make(scoring);
  setup?.(m);
  console.log(`\n${scoring}`);
  for (const [w, want] of steps) {
    if (w !== null) point(m, w);
    const got = m.phase === 'over' ? `over ${m.winner === 0 ? 'A' : 'B'}` : state(m);
    const ok = got === want;
    if (!ok) fails++;
    console.log(`  ${w === null ? 'start' : `gana ${w === 0 ? 'A' : 'B'}`}`.padEnd(10) + ` ${got.padEnd(14)} ${ok ? '✓' : `✗ (esperado ${want})`}`);
    if (m.phase !== 'over') checkPositions(m, got);
  }
}

// side-out scoring: "0-0-2" start, server 1 and 2, the server swaps courts after each point, the first serve after a
// side out from the right court
run('sideout', [
  [null, '0-0-2 A1 R'],
  [0, '1-0-2 A1 L'],
  [0, '2-0-2 A1 R'],
  [1, '0-2-1 B1 R'],
  [1, '1-2-1 B1 L'],
  [1, '2-2-1 B1 R'],
  [0, '2-2-2 B2 L'],
  [1, '3-2-2 B2 R'],
  [0, '2-3-1 A1 R'],
  [0, '3-3-1 A1 L'],
  [1, '3-3-2 A2 R'],
  [1, '3-3-1 B2 R'],
]);

// rally scoring: every rally scores, one server per side out (from the right court), the team that wins the point
// swaps courts
run('rally', [
  [null, '0-0 A1 R'],
  [0, '1-0 A1 L'],
  [1, '1-1 B2 R'],
  [1, '2-1 B2 L'],
  [0, '2-2 A1 R'],
  [0, '3-2 A1 L'],
]);

// rally scoring at game point: the receiving team cannot win the game on a side out
run(
  'rally',
  [
    [null, '4-10 B1 R'],
    [0, '10-4 A1 R'],
    [1, '5-10 B2 R'],
    [0, '10-5 A1 R'],
    [0, 'over A'],
  ],
  (m) => {
    m.score = [10, 4];
    m.serverTeam = 1;
    m.serverId = m.rightOf(1).id;
    m.setupServe();
  },
);

console.log(fails ? `\n${fails} fallos` : '\ntodo correcto');
process.exit(fails ? 1 : 0);
