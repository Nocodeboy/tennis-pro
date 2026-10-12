// Auditoría 04 · ¿se nota la carta? Dos parejas CPU idénticas (todo a BASE, mismo estilo) salvo un atributo, que la
// pareja B tiene a BASE + DELTA en los dos jugadores. Mide el % de puntos y de partidos de B, y algún rasgo del juego
// que ese atributo debería mover.
// npx tsx tools/audit/atributos.ts [partidos=30]   (BASE=70 DELTA=10)
import { AIController, CARD, skillFrom, type Style } from '../../src/sim/brain';
import { ATTR_KEYS, type Attributes } from '../../src/sim/attributes';
import { Match } from '../../src/sim/match';

const N = Number(process.argv[2] ?? 30);
const BASE = Number(process.env.BASE ?? 70);
const DELTA = Number(process.env.DELTA ?? 10);
// KEYS=pot,rem: only those rows · CARD='{"weight":0}': other values for brain.ts CARD
const KEYS = process.env.KEYS?.split(',') as (keyof Attributes)[] | undefined;
if (process.env.CARD) Object.assign(CARD, JSON.parse(process.env.CARD));
// a neutral style: halfway between the rivals'
const STYLE: Style = { touch: 0.55, attack: 0.55, lob: 0.6, risk: 0.3, netRush: 0.75, serveDelay: 1.0, vibora: 0.55, por: 1 };
const card = (k?: keyof Attributes): Attributes => {
  const a = Object.fromEntries(ATTR_KEYS.map((x) => [x, BASE])) as unknown as Attributes;
  if (k) a[k] += DELTA;
  return a;
};
const pc = (a: number, b: number) => `${b ? ((a / b) * 100).toFixed(1) : '–'}%`;

console.log(`carta base ${BASE} en todo, la pareja B con +${DELTA} en un atributo · ${N} partidos (3 juegos, punto de oro)`);
console.log('atributo | puntos B | partidos B | golpes/punto | errores B / punto B perdido | ganadores B | vel. salida B (km/h, mediana drive·volea·remate) | bolas que B no alcanza');
for (const k of [undefined, ...(KEYS ?? ATTR_KEYS)] as (keyof Attributes | undefined)[]) {
  const sa = skillFrom(card(), STYLE);
  const sb = skillFrom(card(k), STYLE);
  let ptsB = 0;
  let pts = 0;
  let winsB = 0;
  let shots = 0;
  let errB = 0;
  let lostB = 0;
  let winB = 0;
  let missB = 0;
  const sp: Record<string, number[]> = { drive: [], speedup: [], smash: [] };
  for (let i = 0; i < N; i++) {
    const seed = 9100 + i * 53;
    // alternate which team is B, so the serve toss and the side do not bias it
    const bTeam = (i % 2) as 0 | 1;
    const sk = [0, 1, 2, 3].map((j) => ((j < 2 ? 0 : 1) === bTeam ? sb : sa));
    const m = new Match(sk.map((s, j) => ({ team: (j < 2 ? 0 : 1) as 0 | 1, human: false, speed: s.speed, reaction: s.reaction, look: j })), { games: 3, golden: true }, seed);
    m.setControllers(sk.map((s) => new AIController(s)));
    m.start();
    let guard = 0;
    while (m.phase !== 'over' && guard++ < 60 * 60 * 60) {
      m.update(1 / 60);
      for (const e of m.events) {
        if (e.type === 'point') {
          pts++;
          shots += e.rally;
          if (e.winner === bTeam) {
            ptsB++;
            if (e.fault === null) winB++;
          } else {
            lostB++;
            if (e.fault !== null && m.players[e.fault].team === bTeam) errB++;
            if (e.reason === 'miss' || e.reason === 'winner') missB++;
          }
        }
        if (e.type === 'hit' && m.players[e.pid].team === bTeam && sp[e.kind] && !e.special) sp[e.kind].push(e.speed * 3.6);
      }
      m.events.length = 0;
    }
    if (m.winner === bTeam) winsB++;
  }
  const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(0) : '–');
  console.log(`${k ?? '(igual)'} | ${pc(ptsB, pts)} | ${pc(winsB, N)} | ${(shots / pts).toFixed(1)} | ${pc(errB, lostB)} | ${pc(winB, ptsB)} | ${med(sp.drive)}·${med(sp.speedup)}·${med(sp.smash)} | ${pc(missB, lostB)}`);
}
