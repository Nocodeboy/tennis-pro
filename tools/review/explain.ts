// The line that says why a point was won or lost (src/explain.ts), measured with the thumb bot: how often each
// explanation comes up for each level, whether the numbers in it match what happened in the point (checked against
// the match's own events and the bot's own thumb), and how many tips the Coach gives. TRACE points are printed shot by
// shot to read them against the line.
// Usage: npx tsx tools/review/explain.ts [matches per pairing = 4] [trace = 40]
// Env: LEVELS=novato,medio · RIVALS=1,2,4 (singles) · PAIRS=1,3 (doubles; none by default) · LANG_UI=es|en
import './globals';
import { Coach, Explainer, type Why } from '../../src/explain';
import { t } from '../../src/i18n';
import { AIController, HUMAN_REACTION, HUMAN_SPEED, PAIRS, PARTNER, RIVALS } from '../../src/sim/brain';
import { HL, LINE, NVZ, W } from '../../src/sim/court';
import { Match, SUGGEST } from '../../src/sim/match';
import type { MatchEvent } from '../../src/sim/types';
import { HUMANS } from '../humans';
import { ThumbBot } from '../thumb';

type PointEvent = Extract<MatchEvent, { type: 'point' }>;
const N = Number(process.argv[2] ?? 4);
const TRACE = Number(process.argv[3] ?? 40);
const levels = process.env.LEVELS?.split(',') ?? Object.keys(HUMANS);
const rivals = (process.env.RIVALS ?? '1,2,4').split(',').map(Number);
const pairs = process.env.PAIRS ? process.env.PAIRS.split(',').map(Number) : [];

interface Rec {
  key: string;
  text: string;
  tag: string | null;
  won: boolean;
  reason: string;
  cause: string | null;
  problems: string[];
}
const all: Record<string, Rec[]> = {};
let traced = 0;
let tips = 0;
let matches = 0;
const tipKeys: Record<string, number> = {};
let noWhy = 0;

const LOSING = new Set(['x.late', 'x.far', 'x.still', 'x.missShort', 'x.upAuto', 'x.lobMe', 'x.lobUs', 'x.shortMe', 'x.passMe', 'x.pastMe', 'x.letGo', 'x.letGoNo', 'x.kitchenMe', 'x.twoReturnMe', 'x.twoThirdMe', 'x.mateMiss']);

/** What the line claims, checked against the point. */
function check(w: Why, e: PointEvent, m: Match, ex: Explainer, botReact: number | null): string[] {
  const out: string[] = [];
  const d = w.data;
  const lost = e.winner !== 0;
  const hits = (ex as unknown as { hits: { pid: number; kind: string; clear: number | null; speed: number; team: number }[] }).hits;
  const bounces = (ex as unknown as { bounces: { x: number; z: number; good: boolean; first: boolean }[] }).bounces;
  if (w.key.startsWith('w.') && lost) out.push('dice que ganamos y lo perdimos');
  if (LOSING.has(w.key) && !lost) out.push('dice que lo perdimos y lo ganamos');
  // whose fault it names
  if (e.fault !== null) {
    const me = m.players[e.fault].human;
    const nm = (ex.names[e.fault] ?? '').toLowerCase();
    const txt = w.text.toLowerCase();
    const forced = w.key.startsWith('x.forced');
    if (!me && !forced && !txt.includes(nm)) out.push(`no nombra a quien falla (${nm})`);
    if (me && /^(tu|soltaste|apuntaste|atacaste|sin |de marco|con el brazo|te llegó|peloteo|voleaste|el resto|el tercer|bajo presión)/.test(txt) === false) out.push('falla el humano y no lo dice');
  }
  // the numbers
  if (d.way && typeof d.by === 'number') {
    const b = [...bounces].reverse().find((x) => !x.good);
    if (!b) out.push('dice fuera y no hay bote fuera');
    else {
      const long = Math.abs(b.z) - HL - LINE;
      const wide = Math.abs(b.x) - W / 2 - LINE;
      const by = d.way === 'long' ? long : wide;
      if (Math.abs(by - d.by) > 0.015) out.push(`fuera por ${d.by} y el bote dice ${by.toFixed(3)}`);
      if (e.reason !== 'out' && e.reason !== 'serveOut') out.push(`dice fuera y el motivo es ${e.reason}`);
    }
  }
  if (d.below !== undefined && e.reason !== 'net') out.push('dice red y no lo es');
  if (w.key === 'x.late') {
    if (!(typeof d.start === 'number' && d.start > SUGGEST.see)) out.push(`«tarde» con salida a ${d.start}`);
    if (!d.can35) out.push('«tarde» y ni reaccionando a 0,35 s llegaba');
    if (botReact !== null && botReact < 0.3) out.push(`«tarde» y el pulgar del bot reaccionó a ${botReact.toFixed(2)} s`);
  }
  if (w.key === 'x.far' && d.can35) out.push('«muy lejos» y llegaba reaccionando a 0,35 s');
  if (w.key === "x.still" && (d.start !== null || !d.can35)) out.push("«no te moviste» y se movió, o no llegaba igualmente");
  if (w.key === 'x.upDink' || w.key === 'w.upMe') {
    if (!(typeof d.clear === 'number' && d.clear >= 0.3)) out.push(`«pasó alta» con ${d.clear}`);
  }
  if ((w.key === 'x.passMe' || w.key === 'x.pass' || w.key === 'w.pass') && d.where === 'center' && Math.abs(Number(d.rx)) >= 0.9) out.push('«en el centro» y no lo estaba');
  if ((w.key === "x.fast" || w.key === "w.fast") && !(Number(d.speed) >= 14)) out.push("«rápida» y no lo era");
  if (w.key === "x.fast" && Number(d.d) > 1.5) out.push("«sin tiempo para reaccionar» y pasó lejos");
  if (w.key === 'x.kitchenMe' && !(Number(d.inside) > 0)) out.push('«dentro de la cocina» y no lo estaba');
  if (w.key === 'x.lobMe' && Math.abs(Number(d.rz)) >= 3.6) out.push('«estabas en la red» y no lo estaba');
  if (w.key === 'x.shortMe' && Math.abs(Number(d.rz)) <= 4.3) out.push('«al fondo» y no lo estaba');
  void hits;
  void NVZ;
  return out;
}

function trace(m: Match, ex: Explainer, e: PointEvent, w: Why | null, botReact: number | null, label: string, problems: string[]) {
  const hits = (ex as unknown as { hits: { pid: number; kind: string; timing: string; y: number; clear: number | null; speed: number; avail: number | null; stretch: number; tx: number; tz: number }[] }).hits;
  const bounces = (ex as unknown as { bounces: { x: number; z: number; good: boolean; first: boolean; hit: number }[] }).bounces;
  const nm = (pid: number) => ex.names[pid] ?? '?';
  const f = (v: number | null | undefined, n = 2) => (v === null || v === undefined ? '–' : v.toFixed(n));
  console.log(`\n#${traced} ${label} · punto ${m.stats.rallies} · ${e.winner === 0 ? 'GANA' : 'PIERDE'} · ${e.reason}${e.fault !== null ? ` (falla ${nm(e.fault)})` : ''} · ${e.rally} golpes`);
  for (const h of hits.slice(-3)) {
    const i = hits.indexOf(h);
    const b = bounces.filter((x) => x.hit === i).map((x) => `bote ${x.good ? 'dentro' : 'FUERA'} (${f(x.x)}, ${f(x.z)})`).join(' ');
    console.log(`   ${nm(h.pid).padEnd(6)} ${h.kind.padEnd(7)} ${h.timing.padEnd(7)} contacto ${f(h.y)} m · sobre la red ${f(h.clear)} · ${f(h.speed, 1)} m/s · tiempo ${f(h.avail)} s · estirada ${f(h.stretch)} · apuntó (${f(h.tx)}, ${f(h.tz)}) ${b}`);
  }
  if (botReact !== null && e.winner !== 0 && e.fault === null) console.log(`   pulgar del bot: reacciona a ${botReact.toFixed(2)} s`);
  console.log(`   → «${w?.text ?? '(sin explicación)'}»${w?.tag ? ` [${w.tag}]` : ''}`);
  if (w) console.log(`     datos ${JSON.stringify(w.data, (_, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v))}`);
  for (const p of problems) console.log(`   !! ${p}`);
}

function play(label: string, level: string, m: Match, bot: ThumbBot, names: string[]) {
  const ex = new Explainer(names);
  const coach = new Coach();
  bot.attach(m);
  m.start();
  const recs = (all[level] ??= []);
  let guard = 0;
  while (m.phase !== 'over' && guard++ < 60 * 60 * 60) {
    bot.tick(m);
    m.update(1 / 60);
    bot.events(m.events);
    for (const e of m.events) {
      const w = ex.event(m, e);
      if (e.type !== 'point') continue;
      const react = (bot as unknown as { react: number }).react ?? null;
      if (!w) {
        noWhy++;
        if (traced < TRACE) {
          traced++;
          trace(m, ex, e, w, react, label, ['sin explicación']);
        }
        continue;
      }
      const problems = check(w, e, m, ex, react);
      recs.push({ key: w.key, text: w.text, tag: w.tag, won: e.winner === 0, reason: e.reason, cause: typeof w.data.cause === 'string' ? w.data.cause : null, problems });
      const tip = coach.push(e.winner === 0 ? null : w.tag);
      if (tip) {
        tips++;
        tipKeys[tip] = (tipKeys[tip] ?? 0) + 1;
      }
      if (traced < TRACE || problems.length) {
        traced++;
        trace(m, ex, e, w, react, label, problems);
        if (tip) console.log(`   CONSEJO: ${t(tip)}`);
      }
    }
    m.events.length = 0;
    ex.frame(m);
  }
  matches++;
}

for (const level of levels) {
  const h = HUMANS[level];
  for (const ri of rivals) {
    const rv = RIVALS[ri];
    for (let i = 0; i < N; i++) {
      const seed = 5000 + i * 7919 + ri * 31;
      const bot = new ThumbBot(h, 1, seed + 17);
      const m = new Match(
        [
          { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
          { team: 1, human: false, speed: rv.skill.speed, reaction: rv.skill.reaction, look: rv.look },
        ],
        { scoring: 'rally', to: 11 },
        seed,
      );
      m.setControllers([bot.ctl, new AIController(rv.skill)]);
      play(`${level} contra ${rv.name}`, level, m, bot, [t('you'), rv.name]);
    }
  }
  for (const pi of pairs) {
    const pair = PAIRS[pi];
    for (let i = 0; i < N; i++) {
      const seed = 9000 + i * 7919 + pi * 31;
      const bot = new ThumbBot(h, 1, seed + 17);
      const m = new Match(
        [
          { team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 },
          { team: 0, human: false, speed: PARTNER.skill.speed, reaction: PARTNER.skill.reaction, look: PARTNER.look },
          { team: 1, human: false, speed: pair.a.skill.speed, reaction: pair.a.skill.reaction, look: pair.a.look },
          { team: 1, human: false, speed: pair.b.skill.speed, reaction: pair.b.skill.reaction, look: pair.b.look },
        ],
        { scoring: 'rally', to: 11 },
        seed,
      );
      m.setControllers([bot.ctl, new AIController(PARTNER.skill), new AIController(pair.a.skill), new AIController(pair.b.skill)]);
      play(`${level} y Marta contra ${pair.a.name} y ${pair.b.name}`, `${level}-dobles`, m, bot, [t('you'), PARTNER.name, pair.a.name, pair.b.name]);
    }
  }
}

console.log('\n=== Explicaciones (% de los puntos) ===');
for (const [lv, recs] of Object.entries(all)) {
  const by: Record<string, number> = {};
  for (const r of recs) by[r.key] = (by[r.key] ?? 0) + 1;
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  console.log(`\n${lv}: ${recs.length} puntos`);
  console.log('  ' + rows.map(([k, v]) => `${k} ${((v / recs.length) * 100).toFixed(0)}`).join(' · '));
  const causes: Record<string, number> = {};
  for (const r of recs) if (r.cause) causes[r.cause] = (causes[r.cause] ?? 0) + 1;
  console.log('  causas (x.cause): ' + Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
  const tags: Record<string, number> = {};
  for (const r of recs) if (r.tag) tags[r.tag] = (tags[r.tag] ?? 0) + 1;
  console.log('  patrones propios: ' + Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
  const bad = recs.filter((r) => r.problems.length);
  console.log(`  con contradicciones: ${bad.length}`);
  if (process.env.EXAMPLES) {
    const ex: Record<string, string[]> = {};
    for (const r of recs) if ((ex[r.key] ??= []).length < 3 && !ex[r.key].includes(r.text)) ex[r.key].push(r.text);
    for (const [k, v] of Object.entries(ex)) console.log(`    ${k}: ${v.map((x) => `«${x}»`).join('  ')}`);
    console.log('    más largos: ' + [...recs].sort((a, b) => b.text.length - a.text.length).slice(0, 4).map((r) => `«${r.text}» (${r.text.length})`).join('  '));
  }
  const len = recs.map((r) => r.text.length).sort((a, b) => a - b);
  console.log(`  largo del texto: mediana ${len[Math.floor(len.length / 2)]} · p90 ${len[Math.floor(len.length * 0.9)]} · máx ${len[len.length - 1]} caracteres`);
}
console.log(`\nsin explicación: ${noWhy} puntos · consejos: ${tips} en ${matches} partidos (${(tips / Math.max(1, matches)).toFixed(1)} por partido)`);
console.log('  ' + Object.entries(tipKeys).map(([k, v]) => `${k} ${v}`).join(' · '));
