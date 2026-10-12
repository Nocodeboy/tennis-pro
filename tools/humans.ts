// The simulated people of the bots (tools/bot-doubles.ts, tools/review/*), at three levels: how they use the thumbs
// (reaction, stick, how often they aim, release timing, drag accuracy) and what shots they look for. See tools/thumb.ts.
// The attack and the block (docs/pickleball/notas-08-ataque.md): how often they flick a ball the game marks as
// attackable (the orange ring), and one that is not out of impatience; how fast their flick goes (the novato's is now
// and then too slow to count: a drag); how often they tap to block an attack and how soon they can.
// Padel: `lob` is how readily they globo a pair at the net (the main way to take it), `touch` the chiquitas. The 0.3
// gestures: `moving` (aimed releases on the move: plain power, else placed), `por3` / `por4` (going for them over the
// head when the ball allows), `fullV` (the fullest flick), `bajada` (hitting the bajada down rather than placing it).

import type { Thumbs } from './thumb';

export const HUMANS: Record<string, Thumbs> = {
  // first games: slow on the stick, aims about half the balls, releases ±110 ms around the ring, plays it safe; flicks
  // most orange balls he has time for, blocks now and then and late; lobs now and then
  novato: { react: 0.42, reactVar: 0.1, angErr: 0.35, hold: 0.55, letGo: 0.45, aim: 0.55, press: 0.45, sigma: 0.11, bias: 0.04, aimPx: 22, touch: 0.25, attack: 0.35, lob: 0.25, risk: 0.25, netRush: 0.45, flick: 0.7, rash: 0.07, flickV: 900, flickVar: 220, block: 0.35, blockReact: 0.42, blockSigma: 0.12, blockBias: 0.06, moving: 0.3, por3: 0.05, por4: 0.03, fullV: 1250, bajada: 0.2 },
  // plays now and then: aims most balls, ±85 ms; attacks the orange balls and, impatient, some at the tape
  medio: { react: 0.33, reactVar: 0.07, angErr: 0.22, hold: 0.45, letGo: 0.4, aim: 0.8, press: 0.35, sigma: 0.085, bias: 0.02, aimPx: 14, touch: 0.4, attack: 0.55, lob: 0.4, risk: 0.35, netRush: 0.75, flick: 0.85, rash: 0.12, flickV: 1050, flickVar: 200, block: 0.6, blockReact: 0.32, blockSigma: 0.09, blockBias: 0.03, moving: 0.45, por3: 0.15, por4: 0.06, fullV: 1450, bajada: 0.35 },
  // knows the game: aims nearly everything, ±60 ms, globos to take the net, chiquitas and the attack; blocks most attacks
  bueno: { react: 0.26, reactVar: 0.05, angErr: 0.12, hold: 0.35, letGo: 0.35, aim: 0.93, press: 0.28, sigma: 0.06, bias: 0, aimPx: 9, touch: 0.5, attack: 0.75, lob: 0.5, risk: 0.4, netRush: 0.95, flick: 0.9, rash: 0.06, flickV: 1200, flickVar: 160, block: 0.85, blockReact: 0.25, blockSigma: 0.07, blockBias: 0.01, moving: 0.55, por3: 0.3, por4: 0.12, fullV: 1650, bajada: 0.5 },
};
