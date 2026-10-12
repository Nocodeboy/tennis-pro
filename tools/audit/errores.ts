// Auditoría 04 · los errores a la pared directa: qué golpe, con qué calidad, si fue pifia (shank) y a qué profundidad
// se apuntaba; y por qué pared sale de la pista el por 3 (exit). CPU contra CPU, las dos parejas fuertes.
// npx tsx tools/audit/errores.ts [partidos=30]
import { AIController, PAIRS } from '../../src/sim/brain';
import { HL, W } from '../../src/sim/court';
import { Match } from '../../src/sim/match';

const N = Number(process.argv[2] ?? 30);
const pc = (a: number, b: number) => `${b ? ((a / b) * 100).toFixed(1) : '–'}%`;
const inc = (o: Record<string, number>, k: string) => (o[k] = (o[k] ?? 0) + 1);
const wall: Record<string, number> = {};
const net: Record<string, number> = {};
const exitAxis: Record<string, number> = {};
let nWall = 0;
let nNet = 0;
let pts = 0;
let shankWall = 0;
let shankNet = 0;
const tzWall: number[] = [];
const qWall: number[] = [];
for (let i = 0; i < N; i++) {
  const [A, B] = [PAIRS[2], PAIRS[3]];
  const sk = [A.a, A.b, B.a, B.b];
  const m = new Match(sk.map((r, j) => ({ team: (j < 2 ? 0 : 1) as 0 | 1, human: false, speed: r.skill.speed, reaction: r.skill.reaction, look: j })), { games: 3, golden: true }, 7300 + i * 11);
  m.setControllers(sk.map((r) => new AIController(r.skill)));
  m.start();
  let last: { kind: string; volley: boolean; shank: boolean; q: number; tz: number; z: number } | null = null;
  let guard = 0;
  while (m.phase !== 'over' && guard++ < 60 * 60 * 60) {
    m.update(1 / 60);
    for (const e of m.events) {
      if (e.type === 'hit') last = { kind: e.kind, volley: e.volley, shank: !!e.shank, q: e.q, tz: Math.abs(e.tz ?? 0), z: Math.abs(e.z) };
      if (e.type === 'point') {
        pts++;
        if (e.reason === 'wall' && last) {
          nWall++;
          if (last.shank) shankWall++;
          inc(wall, `${last.kind}${last.volley ? '(v)' : ''} desde ${last.z < 4.6 ? 'red' : last.z < 7 ? 'medio' : 'fondo'}${last.shank ? ' · pifia' : last.tz > HL - 0.6 ? ' · diana pegada al cristal' : last.q < 0.6 ? ' · contacto malo' : ' · contacto normal'}`);
          tzWall.push(last.tz);
          qWall.push(last.q);
        }
        if (e.reason === 'net' && last) {
          nNet++;
          if (last.shank) shankNet++;
          inc(net, `${last.kind}${last.volley ? '(v)' : ''}${last.shank ? ' · pifia' : ''}`);
        }
        if (e.reason === 'exit') {
          const b = m.ballPos();
          if (b) inc(exitAxis, Math.abs(b.x) >= W / 2 - 0.1 ? 'lateral' : Math.abs(b.z) >= HL - 0.1 ? 'fondo' : 'otro');
        }
      }
    }
    m.events.length = 0;
  }
}
const top = (o: Record<string, number>, n: number, k = 12) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([a, v]) => `${a} ${pc(v, n)}`)
    .join('\n  ');
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`${N} partidos Alejandro+Agustín contra Agustín+Arturo, ${pts} puntos`);
console.log(`a la pared directa: ${pc(nWall, pts)} de los puntos; pifias ${pc(shankWall, nWall)}; diana mediana ${med(tzWall).toFixed(2)} m de la red; q mediana ${med(qWall).toFixed(2)}\n  ${top(wall, nWall)}`);
console.log(`a la red: ${pc(nNet, pts)} de los puntos; pifias ${pc(shankNet, nNet)}\n  ${top(net, nNet, 8)}`);
console.log(`por dónde sale el por 3 (exit): ${JSON.stringify(exitAxis)}`);
