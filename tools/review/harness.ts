// Arnés sin navegador: el HumanController real + Input real (con un elemento falso), contra la IA real.
// Un "pulgar virtual" mueve el joystick y apunta/suelta como lo haría una persona, frame a frame (60 Hz, como el juego).
(globalThis as any).window = { addEventListener() {} };
import { Input } from '../../src/input';
import { HumanController } from '../../src/human';
import { AIController, HUMAN_REACTION, HUMAN_SPEED, RIVALS } from '../../src/sim/brain';
import { Match } from '../../src/sim/match';
import type { MatchEvent } from '../../src/sim/types';

export interface Policy {
  /** s tras el golpe rival hasta mover el stick */
  react: number;
  /** cómo usa el stick: 'release' suelta cerca del círculo; 'hold' mantiene la dirección inicial hasta el contacto; 'none' no toca */
  stick: 'release' | 'hold' | 'none' | 'track' | 'holdrel';
  /** distancia a la que suelta el stick en 'release' */
  releaseAt: number;
  /** apunta: null = no toca el pulgar derecho (golpe automático) */
  aim: null | { dx: number; dy: number; pressAfter: number; releaseE: number };
  /** error de dirección del stick (rad) */
  angErr?: number;
}

export function makeMatch(rival: number, seed: number, mode: 'assist' | 'manual' = 'assist', assist = 1) {
  const el = { addEventListener() {}, clientWidth: 390, setPointerCapture() {} } as any;
  let m: Match;
  const input = new Input(el, () => m?.t ?? 0);
  const human = new HumanController(input);
  human.mode = mode;
  human.assist = assist;
  human.pxPerM = 33;
  const r = RIVALS[rival];
  m = new Match(
    [
      { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
      { team: 1, human: false, speed: r.skill.speed, reaction: r.skill.reaction, look: r.look },
    ],
    { scoring: 'rally', to: 11 },
    seed,
  );
  m.setControllers([human, new AIController(r.skill)]);
  m.serverTeam = 0;
  m.setupServe();
  human.serveSince = m.t;
  return { m, input, human };
}

export const end = (input: Input) => (input as any).end(false);
