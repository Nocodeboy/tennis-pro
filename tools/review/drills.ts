// The training challenges (src/sim/drill.ts) played by the thumb bot (tools/thumb.ts: the game's own control code)
// at the three levels: does every go finish, how long it takes, the score and the stars it gets. The bot reads the
// challenge like a person who has read its instructions: it aims at the targets (with its own drag error and timing),
// attacks the high balls and keeps the low ones in the kitchen, and walks back to its spot between balls; whether it
// aims at all, how quickly it reacts and how well it times the release are its level's (tools/humans.ts).
// Usage: npx tsx tools/review/drills.ts [goes per level = 24] [assist = 1]
// Env: DRILLS=dink,serve · LEVELS=novato,bueno · SHOW=1 prints every ball of the first go of each.
import './globals';
import { DRILLS, Drill, HIGH, type DrillDef } from '../../src/sim/drill';
import { Explainer, type Why } from '../../src/explain';
import { t } from '../../src/i18n';
import { HL, NVZ } from '../../src/sim/court';
import type { Match } from '../../src/sim/match';
import type { Plan, Player } from '../../src/sim/types';
import { SERVE_PERIOD } from '../../src/human';
import { HUMANS } from '../humans';
import { DEVICE_LAG, ThumbBot, type Thumbs } from '../thumb';

const N = Number(process.argv[2] ?? 24);
const assist = Number(process.argv[3] ?? 1);
const only = process.env.DRILLS?.split(',');
const levels = process.env.LEVELS?.split(',') ?? Object.keys(HUMANS);

type Any = Record<string, any>;

/** A thumb bot that plays the challenge `d`. */
function drillBot(level: Thumbs, d: Drill, seed: number): ThumbBot {
  const bot = new ThumbBot(level, assist, seed);
  const b = bot as unknown as Any;
  const def = d.def;
  const gauss = () => b.rng.gauss() as number;
  const u = () => b.rng.next() as number;
  const px = () => bot.ctl.pxPerM;
  /** the drag to a spot on the far side: x across (world), d metres from the net; with this level's drag error */
  const drag = (p: Player, x: number, dd: number) => ({ dx: x * p.side * px() + gauss() * level.aimPx, dy: (4.3 - dd) * px() * 0.88 + gauss() * level.aimPx });
  b.choose = (m: Match, p: Player, tg: Plan) => {
    switch (def.id) {
      case 'dink': {
        const ts = d.targets();
        const t = ts[Math.floor(u() * ts.length)];
        return drag(p, t.x, Math.abs(t.z));
      }
      case 'third':
        return drag(p, (u() - 0.5) * 3, 1.0 + u() * 0.6);
      case 'attack':
        // high: put it away deep (a speed-up or a smash); low: keep it in the kitchen
        if (tg.overhead || tg.by > HIGH) return drag(p, (u() - 0.5) * 3, 4.8 + u() * 1.2);
        return drag(p, (u() - 0.5) * 3, 1.0 + u() * 0.6);
      case 'defend':
        return drag(p, (u() - 0.5) * 2, 1.0 + u() * 0.6);
    }
    return drag(p, 0, 5);
  };
  // between balls: back to the challenge's spot (third shot: up behind the drop, if he is one who moves up)
  b.waitSpot = (m: Match, p: Player) => {
    if (def.id === 'third') {
      const r = m.rally!;
      if (r.shots !== b.lastShots) {
        b.lastShots = r.shots;
        b.up = u() < level.netRush;
      }
      return { x: p.x, z: b.up ? 4.0 : HL + 0.3 };
    }
    return { x: def.start.x, z: def.start.z };
  };
  // the serve: aims at one of the targets of the box, released on the small ring with this level's timing error
  b.serveTick = (m: Match, p: Player) => {
    b.stick(0, 0);
    if (m.server() !== p) return;
    const key = `${m.stats.rallies}`;
    if (key !== b.serveKey) {
      b.serveKey = key;
      bot.ctl.serveSince = m.t;
      b.serveAt = m.t + 0.3 + u() * 0.6;
      b.serveRel = -1;
    }
    if (!bot.input.pressing && b.serveRel < 0 && m.t >= b.serveAt) {
      const ts = d.targets();
      const t = ts[Math.floor(u() * ts.length)];
      const half = -m.serveX(p.team);
      const x0 = half * 1.5 * p.side;
      const d0 = (NVZ + HL) / 2 + 0.3;
      bot.input.pressing = true;
      bot.input.dx = (t.x * p.side - x0) * px() + gauss() * level.aimPx * 0.6;
      bot.input.dy = (d0 - Math.abs(t.z)) * px() * 0.88 + gauss() * level.aimPx;
      const k = Math.ceil((m.t + 0.35) / SERVE_PERIOD);
      b.serveRel = k * SERVE_PERIOD + gauss() * level.sigma + level.bias;
    }
    if (bot.input.pressing && b.serveRel >= 0 && m.t >= b.serveRel + DEVICE_LAG) b.lift();
  };
  return bot;
}

const pc = (a: number, n: number) => `${((a / Math.max(1, n)) * 100).toFixed(0)}%`;
const rows: string[][] = [['reto', 'nivel', 'acaba', 'tiempo', 'puntos (media · p10–p90)', '% del máximo', '0★', '1★', '2★', '3★', 'detalle']];
for (const def of DRILLS as DrillDef[]) {
  if (only && !only.includes(def.id)) continue;
  for (const ln of levels) {
    const level = HUMANS[ln];
    const scores: number[] = [];
    const stars = [0, 0, 0, 0];
    let finished = 0;
    let time = 0;
    const tally: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const seed = 3100 + i * 7919;
      const holder: { d: Drill | null } = { d: null };
      // (the bot needs the drill for its targets, the drill needs the bot's controller for the player)
      const bot0 = new ThumbBot(level, assist, seed + 17);
      const d = new Drill(def, bot0.ctl, seed);
      holder.d = d;
      const bot = drillBot(level, d, seed + 17);
      d.match.controllers[0] = bot.ctl;
      bot.attach(d.match);
      // (the line the game shows for a ball that scores nothing: the explainer, as in the game)
      const ex = new Explainer([t('you'), t('drill.machine')]);
      const whys: (string | null)[] = [];
      let lastWhy: Why | null = null;
      d.onBall = (r) => whys.push(r.pts || !lastWhy || lastWhy.key.startsWith('w.') || lastWhy.key === 'x.winner' ? null : lastWhy.text);
      d.start();
      const m = d.match;
      const t0 = m.t;
      let guard = 0;
      while (!d.done && guard++ < 60 * 60 * 6) {
        bot.tick(m);
        // (between balls the thumb walks back to its spot)
        if (m.phase === 'dead' && def.id !== 'serve') (bot as unknown as Any).goTo(m.players[0], def.start.x, def.start.z, 0.3);
        m.update(1 / 60);
        bot.events(m.events);
        for (const e of m.events) {
          const w = ex.event(m, e);
          if (e.type === 'point') lastWhy = w;
          d.event(e);
        }
        m.events.length = 0;
        ex.frame(m);
        d.frame();
      }
      if (d.done) finished++;
      time += m.t - t0;
      scores.push(d.score);
      stars[d.stars()]++;
      for (const r of d.results) for (const p of r.parts) if (p.pts) tally[p.key] = (tally[p.key] ?? 0) + 1;
      for (const r of d.results) if (!r.pts) tally[r.parts[0]?.key ?? '?'] = (tally[r.parts[0]?.key ?? '?'] ?? 0) + 1;
      if (process.env.SHOW && i === 0) {
        console.log(`\n${def.id} · ${ln}: ${d.score} puntos`);
        for (const r of d.results) console.log(`  #${r.n + 1} +${r.pts} ${r.kind ?? '–'} ${r.timing ?? ''} ${r.clear !== null ? `red ${r.clear.toFixed(2)}` : ''} ${r.high !== undefined ? (r.high ? 'ALTA' : 'baja') : ''} · ${r.parts.map((p) => p.key + (p.vars ? JSON.stringify(p.vars) : '')).join(' ')}${whys[r.n] ? `  «${whys[r.n]}»` : ''}`);
      }
    }
    scores.sort((a, b) => a - b);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const balls = N * def.balls;
    const det = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k.replace('dr.', '')} ${pc(v, balls)}`)
      .join(' · ');
    rows.push([def.id, ln, pc(finished, N), `${(time / N).toFixed(0)} s`, `${mean.toFixed(1)} · ${scores[Math.floor(N * 0.1)]}–${scores[Math.floor(N * 0.9)]}`, pc(mean, def.max), pc(stars[0], N), pc(stars[1], N), pc(stars[2], N), pc(stars[3], N), det]);
  }
}
const w = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
for (const r of rows) console.log(r.map((v, c) => v.padEnd(w[c])).join('  '));
console.log(`\nayuda ${assist} · ${N} intentos por reto y nivel · estrellas: ${DRILLS.map((d) => `${d.id} ${d.stars.join('/')} de ${d.max}`).join(' · ')}`);
