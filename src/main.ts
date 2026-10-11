// Pickleball prototype: menus, the match loop, HUD and feedback. The rules live in sim/, the drawing in render/.

import { audio, vibrate } from './audio';
import { Broadcast, type BroadcastSetup, type TeamInfo } from './broadcast';
import { Explainer } from './explain';
import { Training } from './training';
import type { Drill } from './sim/drill';
import { HumanController, servePulse, type SwingMode } from './human';
import { t, lang, setLang } from './i18n';
import { ICON, levelBars } from './icons';
import { Input } from './input';
import { HERO, PARTNER_KIT, RIVAL_KITS, kitOf } from './kits';
import { View, aimHue, cssHue, type Tier } from './render/view';
import { AIController, HUMAN_REACTION, HUMAN_SPEED, PAIRS, PARTNER, RIVALS, type Pair, type Rival } from './sim/brain';
import { NVZ } from './sim/court';
import { IDEAL_RELEASE, LUNGE, Match, PERFECT_WINDOW, type Controller, type PlayerCfg } from './sim/match';
import type { MatchEvent, Player, Scoring } from './sim/types';
import type { Kit } from './render/chars';
import { COURT, EVENT, TOUR, bugName, fullName, initials, pairInfo, pairSeed, playerInfo, roundName, seedOf, seedTag, surname } from './tour';

declare const __VERSION__: string;

// ------------------------------------------------------------------ save
interface Save {
  beaten: number;
  sound: boolean;
  scoring: Scoring;
  tutorial: boolean;
  lang?: 'en' | 'es';
  /** how the human swings, and how much help to get into position */
  swing: SwingMode;
  assist: number;
  /** singles or doubles (the menu's choice), and the pairs of the doubles ladder beaten */
  mode: 'singles' | 'doubles';
  beatenPairs: number;
  /** TV replays of great points */
  replays: boolean;
  /** between shots, with the thumb off the stick, the player jogs back to a good spot by himself */
  recover: boolean;
  /** vibration on hits, in reach, at the kitchen line and on points */
  haptics: boolean;
  /** the indicators on screen: all of them, or only what is needed to play (the default) */
  hud: 'full' | 'min';
  /** taps that cut the pause after a point short, and matches finished (the "Tap to continue" invite stops) */
  skips: number;
  played: number;
  /** a tip between points when the same mistake keeps coming back (src/explain.ts, Coach) */
  coach: boolean;
}
const KEY = 'pickleball-proto-v1';
const save: Save = { beaten: 0, sound: true, scoring: 'rally', tutorial: false, swing: 'assist', assist: 1, mode: 'singles', beatenPairs: 0, replays: true, recover: false, haptics: true, hud: 'min', skips: 0, played: 0, coach: true };
try {
  Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch {
  /* storage may be blocked */
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage may be blocked: progress lives for this session */
  }
}
if (save.lang) setLang(save.lang);
else setLang(lang);
audio.setSfx(save.sound);

// ------------------------------------------------------------------ DOM
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const app = $('app');
const canvas = $<HTMLCanvasElement>('c');
const touch = $('touch');
const fxLayer = $('fx');
const screens = $('screens');
const hud = $('hud');
const banner = $('banner');
const hint = $('hint');
const toastEl = $('toast');
const flash = $('flash');
/** after a point: the invite to cut the pause short (until the player has done it twice, in his first matches) */
const tapEl = document.createElement('div');
tapEl.className = 'tap-on';
tapEl.setAttribute('aria-hidden', 'true');
app.append(tapEl);

const view = new View(canvas);
const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
view.setTier(isMobile ? 'medium' : 'high');
/** the size of the on-screen indicators: 1 on a 390 px phone, a little more on a big screen (never huge) */
let ui = 1;
function measureUi() {
  ui = Math.max(0.92, Math.min(1.25, Math.min(window.innerWidth, window.innerHeight) / 390));
  document.documentElement.style.setProperty('--k', ui.toFixed(3));
}
measureUi();
window.addEventListener('resize', () => {
  view.resize();
  measureUi();
  // (the flick and the tap are measured in px of a 390 px phone)
  input.scale = ui;
  human.pxPerM = Math.max(26, 0.085 * Math.min(window.innerWidth, window.innerHeight * 0.7));
});
if (document.fonts) document.fonts.ready.then(() => view.refreshBanner()).catch(() => undefined);

let match: Match | null = null;
/** why each point was won or lost (the banner's second line) and the tips when a mistake keeps coming back */
const explainer = new Explainer();
let rival: Rival = RIVALS[0];
/** doubles: the pair being played, and every player's name by id (for the calls and toasts) */
let pair: Pair = PAIRS[0];
let names: string[] = [];
/** the video board's footer and the TV title card: the event (provisional brand, src/tour.ts) */
const BOARD_FOOTER = EVENT;
let mode: 'menu' | 'vs' | 'play' | 'end' = 'menu';
let paused = false;
/** debug: slow motion for screenshots (window.__pb.timeScale) */
let timeScale = 1;
const input = new Input(touch, () => match?.t ?? 0);
input.scale = ui;
const human = new HumanController(input);
view.swingGate = (p) => !p.human || !match || human.willSwing(match, p);
function applyControls() {
  human.mode = save.swing;
  human.assist = save.assist;
  human.recover = save.recover;
  view.minimal = save.hud === 'min';
}
applyControls();
human.pxPerM = Math.max(26, 0.085 * Math.min(window.innerWidth, window.innerHeight * 0.7));
input.onPress = (what) => {
  audio.unlock();
  // a tap to aim (not a thumb resting on the stick) in the pause after a point: on to the next serve (the banner has
  // had its moment: Match.hurry)
  // (training: only between serves; between the machine's balls the pause is the machine's)
  if (what === 'aim' && match && mode === 'play' && !paused && !bc.frozen && match.phase === 'dead' && (!training.drill || training.drill.def.id === 'serve')) {
    match.hurry();
    if (save.skips < 9) {
      save.skips++;
      persist();
    }
  }
};
/** vibration (Settings): a pattern in ms, or nothing on devices without it */
function buzz(p: number | number[]) {
  if (save.haptics) vibrate(p);
}
/**
 * Hit-stop: for a few hundredths of a second after a big hit the whole match (ball, bodies, the timing ring) runs at a
 * crawl, so the contact lands. Real seconds left; it only slows the clock, the rules never see it.
 */
let hitStop = 0;
function freeze(sec: number) {
  hitStop = Math.max(hitStop, sec);
}
window.addEventListener('pointerdown', () => audio.unlock(), { once: false });

// ------------------------------------------------------------------ the TV presentation
const bc = new Broadcast(app, hud, view, input);
bc.replays = save.replays;
bc.onEnd = () => {
  if (match && match.winner !== null) endScreen(match, match.winner === 0);
};
// the pause button lives in the score bug (redrawn on every point)
hud.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('#pauseBtn')) return;
  e.stopPropagation();
  pause();
});
/** where a sound is on screen (−1 left … 1 right) and how far up the court (0 near … 1 far end) */
const panOf = (x: number, y: number, z: number) => Math.max(-1, Math.min(1, (view.toScreen(x, y, z).x / Math.max(1, window.innerWidth)) * 2 - 1));
const farOf = (z: number) => Math.max(0, Math.min(1, (-z * view.viewSide) / 7));
view.onSqueak = (_pid, k, x, z) => audio.squeak(k, panOf(x, 0, z), farOf(z));
view.onDeadBounce = (v, x, z) => audio.courtBounce(Math.min(1, v / 5), panOf(x, 0, z), farOf(z), true);
function setFooter(f: string) {
  view.boardFooter = f;
  bc.footer = f;
}

// ------------------------------------------------------------------ training (src/training.ts)
const training = new Training({
  view,
  hud,
  fx: fxLayer,
  human,
  show: (html) => show(html),
  menu: () => menu(),
  play: (d) => beginDrill(d),
  leave: () => leaveDrill(),
  banner: (main, cls, why) => showBanner(main, cls, '', why),
  hint: (k, sec) => {
    if (hintKey === '') setHint(k, sec, true);
  },
  sound: (n) => audio.play(n),
  buzz: (p) => buzz(p),
});

// ------------------------------------------------------------------ the attract mode behind the menus
let demo: Match | null = null;
const cfgOf = (r: Rival, team: 0 | 1): PlayerCfg => ({ team, human: false, speed: r.skill.speed, reaction: r.skill.reaction, look: r.look });
const upper = (rs: Rival[]) => rs.map((r) => r.name.toUpperCase()).join(' + ');
function startDemo() {
  // the attract match follows the menu's mode: Bruno against Nuria, or Bruno and Lola against Nuria and Reina
  const near = save.mode === 'doubles' ? [RIVALS[2], RIVALS[1]] : [RIVALS[2]];
  const far = save.mode === 'doubles' ? [RIVALS[3], RIVALS[4]] : [RIVALS[3]];
  const all = [...near, ...far];
  demo = new Match(
    [...near.map((r) => cfgOf(r, 0)), ...far.map((r) => cfgOf(r, 1))],
    { scoring: 'rally', to: 11 },
    (Math.random() * 1e9) | 0,
  );
  demo.setControllers(all.map((r) => new AIController(r.skill)));
  demo.start();
  view.setMatch(demo, all.map((r) => RIVAL_KITS[r.id].kit));
  view.boardNames = [upper(near), upper(far)];
  view.boardFooter = BOARD_FOOTER;
  view.orbit = true;
  view.showTarget = false;
}

// ------------------------------------------------------------------ screens
/** A screen over the court: `look` is its backdrop ('dim': darkened; 'home': the court left clear in the middle). */
function show(html: string, look: 'dim' | 'home' | 'clear' = 'dim'): HTMLElement {
  screens.innerHTML = `<div class="screen ${look}">${html}</div>`;
  return screens.firstElementChild as HTMLElement;
}
function clearScreens() {
  screens.innerHTML = '';
}
/** A player's tile: initials on a dark tile with the kit colour as a bar (the human: a silhouette). */
function avatar(r: Rival | null, cls = 'av'): string {
  const k = r ? kitOf(r.id) : HERO;
  return `<div class="${cls}" style="--tc:${k.css}">${r ? initials(r) : ICON.person}</div>`;
}
/** two avatars, overlapped (draw) or side by side (versus) */
function duo(a: Rival | null, b: Rival): string {
  return `<div class="duo">${avatar(a)}${avatar(b)}</div>`;
}
/** a pair as the draw writes it: «Numan / Daesku» */
function pairName(p: Pair): string {
  return `${surname(p.a)} / ${surname(p.b)}`;
}
const dbl = () => save.mode === 'doubles';
/** the difficulty of rival or pair i (1 … 5 bars; the doubles ladder has four steps, the last one is the top) */
function level(i: number, n: number): string {
  return levelBars(Math.round(((i + 1) / n) * 5), 5, t('rivals.level'));
}
/** the wordmark: PICKLEBALL, the tour (provisional brand) and the build */
function logo(): string {
  return `<div class="logo"><div class="w1">PICKLEBALL</div><div class="tour"><i></i>${TOUR}<i></i></div><div class="sub">${t('title.sub')}</div></div>`;
}
/** a panel's header: back arrow, the event above the title */
function head(title: string, eyebrow = EVENT): string {
  return `<div class="ph"><button class="back" data-a="back" aria-label="${t('back')}">${ICON.back}</button><div class="pt"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2></div></div>`;
}

function menu() {
  mode = 'menu';
  bc.reset();
  audio.crowdBase = 0.4; // a murmur from the stands behind the menus
  hud.hidden = true;
  hint.hidden = true;
  banner.innerHTML = '';
  if (!demo) startDemo();
  const next = RIVALS[Math.min(save.beaten, RIVALS.length - 1)];
  const nextPair = PAIRS[Math.min(save.beatenPairs, PAIRS.length - 1)];
  // the next match of the draw: its round and the opponent
  const n = dbl() ? PAIRS.length : RIVALS.length;
  const ni = dbl() ? PAIRS.indexOf(nextPair) : RIVALS.indexOf(next);
  const upNext = t('menu.nextMatch', { round: roundName(ni, n), name: dbl() ? pairName(nextPair) : fullName(next) });
  const item = (a: string, ic: string, label: string) => `<button data-a="${a}">${ic}<span>${label}</span>${ICON.chev}</button>`;
  const el = show(
    `<div class="home-top">${logo()}</div>
    <div class="menu-col">
      <div class="seg mode" data-k="mode" role="group"><button data-v="singles" class="${dbl() ? '' : 'on'}">${t('menu.singles')}</button><button data-v="doubles" class="${dbl() ? 'on' : ''}">${t('menu.doubles')}</button></div>
      <button class="btn big primary play" data-a="play"><span class="pl"><b>${t('menu.play')}</b><small>${upNext}</small></span>${ICON.play}</button>
      <div class="menu-list">
        ${item('rivals', ICON.draw, dbl() ? t('menu.pairs') : t('menu.rivals'))}
        ${item('train', ICON.target, t('menu.train'))}
        ${item('how', ICON.help, t('menu.how'))}
        ${item('settings', ICON.sliders, t('menu.settings'))}
      </div>
    </div>
    <div class="foot">${t('proto')} · v${__VERSION__}</div>`,
    'home',
  );
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    audio.unlock();
    audio.play('click');
    if ((b.parentElement as HTMLElement).dataset.k === 'mode') {
      const m = b.dataset.v as Save['mode'];
      if (m === save.mode) return;
      save.mode = m;
      persist();
      demo = null;
      return menu();
    }
    const a = b.dataset.a;
    if (a === 'play') {
      if (dbl()) versusPair(nextPair);
      else versus(next);
    } else if (a === 'rivals') {
      if (dbl()) pairLadder();
      else ladder();
    } else if (a === 'train') training.list();
    else if (a === 'how') howTo();
    else if (a === 'settings') settings();
  });
}

/**
 * One match of the draw: its round, the opponent (seed, name, a line about them), how hard they are and where the
 * player stands with it (won, next, or locked behind the round before).
 */
function drawRow(i: number, n: number, done: number, av: string, name: string, line: string, prev: string): string {
  const locked = i > done;
  const beaten = i < done;
  const cls = locked ? 'locked' : i === done ? 'next' : 'beaten';
  const st = beaten ? `<span class="ok">${ICON.check}${t('rivals.beaten')}</span>` : locked ? `<span class="lk">${ICON.lock}</span>` : `<span class="nx">${t('rivals.next')}</span>`;
  const sub = locked ? t('rivals.locked', { name: prev }) : line;
  return `<button class="rival ${cls}" data-i="${i}" ${locked ? 'disabled' : ''}>${av}<div class="rt"><div class="rd">${roundName(i, n)}</div><div class="nm">${name}</div><div class="tg">${sub}</div></div><div class="st">${st}${level(i, n)}</div></button>`;
}

function pairLadder() {
  const n = PAIRS.length;
  const rows = PAIRS.map((p, i) => drawRow(i, n, save.beatenPairs, duo(p.a, p.b), `${seedTag(pairSeed(p))}${pairName(p)}`, t(p.tag), i ? pairName(PAIRS[i - 1]) : '')).join('');
  const el = show(`<div class="panel draw">${head(t('pairs.title'))}<div class="ladder">${rows}</div></div>`);
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    audio.play('click');
    if (b.dataset.a === 'back') return menu();
    const i = Number(b.dataset.i);
    if (!Number.isNaN(i) && i <= save.beatenPairs) versusPair(PAIRS[i]);
  });
}

function ladder() {
  const n = RIVALS.length;
  const rows = RIVALS.map((r, i) => drawRow(i, n, save.beaten, avatar(r), `${seedTag(seedOf(r))}${fullName(r)}`, t(r.tag), i ? fullName(RIVALS[i - 1]) : '')).join('');
  const el = show(`<div class="panel draw">${head(t('rivals.title'))}<div class="ladder">${rows}</div></div>`);
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    audio.play('click');
    if (b.dataset.a === 'back') return menu();
    const i = Number(b.dataset.i);
    if (!Number.isNaN(i) && i <= save.beaten) versus(RIVALS[i]);
  });
}

function howTo() {
  // (each paragraph opens with its title in bold: the stylesheet sets it as the section's heading)
  const parts = ['how.1', 'how.2', 'how.7', 'how.3', 'how.4', 'how.5', 'how.6'].map((k, i) => `<section class="how-s"><span class="hn">${i + 1}</span><p>${t(k)}</p></section>`).join('');
  const el = show(`<div class="panel how">${head(t('how.title'))}${miniCourt()}${parts}</div>`);
  el.querySelector('[data-a=back]')!.addEventListener('click', () => {
    audio.play('click');
    menu();
  });
}

/** A small court diagram: the kitchen and the three aim zones. */
function miniCourt(): string {
  const es = lang === 'es';
  // (the shot colours are the game's: dink cyan, drive white, lob violet; you are the dot at the near baseline)
  const f = `font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700" letter-spacing=".06em"`;
  return `<svg class="court-mini" width="240" height="150" viewBox="0 0 240 150" aria-hidden="true">
    <rect x="50" y="6" width="140" height="138" fill="#1c3550" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/>
    <rect x="50" y="52" width="140" height="46" fill="#24476b" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/>
    <line x1="44" y1="75" x2="196" y2="75" stroke="#05080c" stroke-width="3"/>
    <line x1="120" y1="6" x2="120" y2="52" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/>
    <line x1="120" y1="98" x2="120" y2="144" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/>
    <circle cx="104" cy="62" r="6" fill="none" stroke="#5af0e8" stroke-width="2.5"/>
    <text x="56" y="66" fill="#5af0e8" font-size="11" ${f}>${es ? 'DEJADA' : 'DINK'}</text>
    <circle cx="150" cy="28" r="6" fill="none" stroke="#fff" stroke-width="2.5"/>
    <text x="160" y="44" fill="#fff" font-size="11" ${f}>DRIVE</text>
    <circle cx="120" cy="10" r="5" fill="none" stroke="#c49aff" stroke-width="2.5"/>
    <text x="131" y="14" fill="#c49aff" font-size="11" ${f}>${es ? 'GLOBO' : 'LOB'}</text>
    <text x="198" y="79" fill="rgba(255,255,255,.7)" font-size="10" ${f}>${es ? 'COCINA' : 'KITCHEN'}</text>
    <circle cx="150" cy="130" r="4.5" fill="#d9f23f" stroke="#05080c" stroke-width="1.5"/>
    <text x="160" y="134" fill="#d9f23f" font-size="10" ${f}>${es ? 'TÚ' : 'YOU'}</text>
  </svg>`;
}

function settings(scroll = -1) {
  // one row: a label and a segmented choice (`stack`: long options, one under the other)
  const row = (label: string, k: string, opts: [string, string, boolean][], stack = false) =>
    `<div class="row${stack ? ' stack' : ''}"><span>${label}</span><div class="seg" data-k="${k}">${opts.map(([v, txt, on]) => `<button data-v="${v}" class="${on ? 'on' : ''}" aria-pressed="${on}">${txt}</button>`).join('')}</div></div>`;
  const onOff = (label: string, k: string, on: boolean) => row(label, k, [['1', t('set.on'), on], ['0', t('set.off'), !on]]);
  const el = show(
    `<div class="panel settings">${head(t('menu.settings'))}
    <h3>${t('set.groupMatch')}</h3>
    ${row(t('set.scoring'), 'scoring', [['rally', t('set.rally'), save.scoring === 'rally'], ['sideout', t('set.sideout'), save.scoring === 'sideout']], true)}
    <h3>${t('set.groupControl')}</h3>
    ${row(t('set.swing'), 'swing', [['assist', t('set.swingAssist'), save.swing === 'assist'], ['manual', t('set.swingManual'), save.swing === 'manual']], true)}
    ${row(t('set.assist'), 'assist', [['2', t('set.assistHigh'), save.assist === 2], ['1', t('set.assistMid'), save.assist === 1], ['0', t('set.assistOff'), save.assist === 0]])}
    ${onOff(t('set.recover'), 'recover', save.recover)}
    <h3>${t('set.groupScreen')}</h3>
    ${row(t('set.hud'), 'hud', [['min', t('set.hudMin'), save.hud === 'min'], ['full', t('set.hudFull'), save.hud === 'full']])}
    ${onOff(t('set.replays'), 'replays', save.replays)}
    <h3>${t('set.groupSound')}</h3>
    ${onOff(t('set.sound'), 'sound', save.sound)}
    ${onOff(t('set.haptics'), 'haptics', save.haptics)}
    <h3>${t('set.groupGeneral')}</h3>
    ${row(t('set.lang'), 'lang', [['es', 'Español', lang === 'es'], ['en', 'English', lang === 'en']])}
    </div>`,
  );
  const panel = el.querySelector('.panel') as HTMLElement;
  // (redrawn after a change: in place, where it was scrolled to, without fading in again)
  if (scroll >= 0) {
    el.classList.add('still');
    panel.scrollTop = scroll;
  }
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    audio.play('click');
    if (b.dataset.a === 'back') return menu();
    const k = (b.parentElement as HTMLElement).dataset.k;
    const v = b.dataset.v!;
    if (k === 'sound') {
      save.sound = v === '1';
      audio.setSfx(save.sound);
    } else if (k === 'replays') {
      save.replays = v === '1';
      bc.replays = save.replays;
    } else if (k === 'recover') save.recover = v === '1';
    else if (k === 'coach') save.coach = v === '1';
    else if (k === 'haptics') {
      save.haptics = v === '1';
      if (save.haptics) vibrate(20);
    } else if (k === 'scoring') save.scoring = v as Scoring;
    else if (k === 'swing') save.swing = v as SwingMode;
    else if (k === 'assist') save.assist = Number(v);
    else if (k === 'hud') save.hud = v === 'full' ? 'full' : 'min';
    else if (k === 'lang') {
      save.lang = v as 'en' | 'es';
      setLang(save.lang);
    }
    persist();
    applyControls();
    settings(panel.scrollTop);
  });
}

/** The match card before a match: the event and round, both sides (seed, name, ranking), the rival's line and level. */
function matchCard(i: number, n: number, me: string, them: string, line: string): string {
  return `<div class="vs-card">
    <div class="vs-head"><div class="eyebrow">${EVENT} · ${COURT}</div><div class="vs-round">${roundName(i, n)}</div></div>
    <div class="vs">${me}<div class="x">VS</div>${them}</div>
    <div class="vs-tag">${line}</div>
    <div class="vs-lvl"><span>${t('rivals.level')}</span>${level(i, n)}</div>
    <div class="vs-go"><button class="btn big primary" data-a="go">${ICON.play}${t('vs.start')}</button><button class="btn ghost" data-a="back">${t('back')}</button></div>
  </div>`;
}
/** one side of the match card: the tile(s), the name (first names small above, the surname big) and a line under */
const side = (tiles: string, small: string, big: string, info: string, cls = '') =>
  `<div class="side${cls}">${tiles}<div class="nm"><small>${small || '&nbsp;'}</small>${big}</div><div class="sd">${info}</div></div>`;
/** the match card's buttons: back to the menu; a tap anywhere else starts the match */
function onCard(el: HTMLElement, go: () => void) {
  el.addEventListener('click', (e) => {
    audio.unlock();
    if ((e.target as HTMLElement).closest('[data-a=back]')) {
      audio.play('click');
      return menu();
    }
    audio.play('whoosh');
    bc.cinema = true;
    go();
  });
}

function versus(r: Rival) {
  mode = 'vs';
  rival = r;
  const i = RIVALS.indexOf(r);
  const seed = seedOf(r);
  const el = show(
    matchCard(
      i,
      RIVALS.length,
      side(avatar(null), '', t('you'), t('tour.wildcard'), ' me'),
      side(avatar(r), `${seed ? `[${seed}] ` : ''}${r.name}`, surname(r).toUpperCase(), playerInfo(r)),
      t(r.tag),
    ),
  );
  onCard(el, () => startMatch(r));
}

function versusPair(p: Pair) {
  mode = 'vs';
  pair = p;
  const i = PAIRS.indexOf(p);
  const seed = pairSeed(p);
  const el = show(
    matchCard(
      i,
      PAIRS.length,
      side(duo(null, PARTNER), t('vs.us', { name: PARTNER.name }), `${t('you')} / ${surname(PARTNER).toUpperCase()}`, t('tour.wildcard'), ' me'),
      side(duo(p.a, p.b), `${seed ? `[${seed}] ` : ''}${p.a.name} ${t('and')} ${p.b.name}`, pairName(p).toUpperCase(), pairInfo(p)),
      t(p.tag),
    ),
  );
  onCard(el, () => startDoubles(p));
}

// ------------------------------------------------------------------ the match
const tut = { served: false, hit: false, kinds: 0, kitchen: false, attack: false, block: false, shownKinds: false, moveShown: false, until: 0, perfect: false };
let hintKey = '';
/** The hint line at the bottom: a tutorial step (a touch icon), or a tip between points (`tip`: an info icon, a gold edge). */
function setHint(k: string, sec = 0, tip = false) {
  hintKey = k;
  tut.until = sec ? performance.now() + sec * 1000 : 0;
  hint.hidden = !k;
  hint.classList.toggle('tip', tip);
  if (k) hint.innerHTML = `<span class="${tip ? 'bulb' : 'hand'}">${tip ? ICON.info : ICON.tap}</span>${t(k)}`;
}

/** the TV's home team: «TÚ» (and «RUIZ») in the bug, the full names on the strap, a wild card */
const home = (bug: string[], full: string[]): TeamInfo => ({ names: bug, full, color: HERO.css, ink: HERO.ink, badge: 'WC', info: t(bug.length > 1 ? 'tv.homePair' : 'tv.home') });
/** the umpire's names by player id (the surnames, as in the bug: «Saca Vidal») */
let callNames: string[] = [];

function startMatch(r: Rival) {
  rival = r;
  const i = RIVALS.indexOf(r);
  const k = kitOf(r.id);
  const seed = seedOf(r);
  const tv: BroadcastSetup = {
    teams: [home([t('you')], [t('you')]), { names: [bugName(r)], full: [fullName(r).toUpperCase()], color: k.css, ink: k.ink, badge: seed ? String(seed) : '', info: playerInfo(r) }],
    names: [t('you'), surname(r)],
    title: BOARD_FOOTER,
    round: `${roundName(i, RIVALS.length)} · ${COURT}`,
  };
  callNames = tv.names;
  begin([cfgOf(r, 1)], [new AIController(r.skill)], [RIVAL_KITS[r.id].kit], [t('you'), r.name.toUpperCase()], [t('you'), r.name], tv);
}

/** Doubles: the human and Marta (near side; the human is in the right court at 0-0 and serves first) against a pair. */
function startDoubles(p: Pair) {
  pair = p;
  const i = PAIRS.indexOf(p);
  const k = kitOf(p.a.id);
  const seed = pairSeed(p);
  const tv: BroadcastSetup = {
    teams: [
      home([t('you'), bugName(PARTNER)], [t('you'), fullName(PARTNER).toUpperCase()]),
      { names: [bugName(p.a), bugName(p.b)], full: [fullName(p.a).toUpperCase(), fullName(p.b).toUpperCase()], color: k.css, ink: k.ink, badge: seed ? String(seed) : '', info: pairInfo(p) },
    ],
    names: [t('you'), surname(PARTNER), surname(p.a), surname(p.b)],
    title: BOARD_FOOTER,
    round: `${roundName(i, PAIRS.length)} · ${COURT}`,
  };
  callNames = tv.names;
  begin(
    [cfgOf(PARTNER, 0), cfgOf(p.a, 1), cfgOf(p.b, 1)],
    [new AIController(PARTNER.skill), new AIController(p.a.skill), new AIController(p.b.skill)],
    [PARTNER_KIT.kit, RIVAL_KITS[p.a.id].kit, RIVAL_KITS[p.b.id].kit],
    [`${t('you')} + ${PARTNER.name.toUpperCase()}`, upper([p.a, p.b])],
    [t('you'), PARTNER.name, p.a.name, p.b.name],
    tv,
  );
}

/** A match: the human (player 0, near side) plus the CPU players given. */
function begin(cfgs: PlayerCfg[], ctls: Controller[], kits: Kit[], board: [string, string], who: string[], tv: BroadcastSetup) {
  mode = 'play';
  paused = false;
  clearScreens();
  demo = null;
  view.orbit = false;
  input.clear();
  match = new Match([{ team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 }, ...cfgs], { scoring: save.scoring, to: 11 }, (Math.random() * 1e9) | 0);
  applyControls();
  match.setControllers([human, ...ctls]);
  match.serverTeam = 0; // the player serves first: control from the first second
  match.setupServe();
  view.setMatch(match, [HERO.kit, ...kits], true);
  view.boardNames = board;
  setFooter(match.doubles ? `${BOARD_FOOTER} · ${match.call()}` : BOARD_FOOTER);
  names = who;
  explainer.names = who;
  explainer.reset();
  view.showTarget = true;
  hud.hidden = false;
  // the TV intro: a flight over the court with the names (the match waits; a tap skips it)
  bc.begin(match, tv);
  tut.served = tut.hit = tut.kitchen = tut.attack = tut.block = tut.shownKinds = tut.moveShown = tut.perfect = false;
  input.clearStick();
  setHint('');
}

/**
 * A training challenge (src/training.ts): its match, with the ball machine as the far player, on the gameplay camera
 * (no TV moments, no umpire, no tutorial hints: the challenge's instructions were on screen).
 */
function beginDrill(d: Drill) {
  mode = 'play';
  paused = false;
  clearScreens();
  clearBanner();
  demo = null;
  view.orbit = false;
  input.clear();
  bc.reset();
  bc.cinema = false;
  match = d.match;
  applyControls();
  view.setMatch(match, [HERO.kit, HERO.kit]);
  view.boardNames = [t('you'), t('train.board')];
  setFooter(t('train.footer'));
  names = [t('you'), t('drill.machine')];
  explainer.names = names;
  explainer.reset();
  view.showTarget = true;
  hud.hidden = false;
  audio.crowdBase = 0.25;
  tut.served = tut.hit = tut.kitchen = tut.attack = tut.shownKinds = tut.moveShown = true;
  tut.perfect = false;
  input.clearStick();
  setHint('');
}
/** Out of a challenge (its result, or quitting it): the attract match behind the menus again. */
function leaveDrill() {
  match = null;
  mode = 'menu';
  paused = false;
  hud.hidden = true;
  setHint('');
  clearBanner();
  audio.crowdBase = 0.4;
  if (!demo) startDemo();
}

/** the broadcast score bug (teams, score, serve; it animates the side that scored) */
function renderHud(scored: 0 | 1 | null = null) {
  if (!match) return;
  bc.renderBug(match, true, scored);
}

/** a tip in the pause, a different one each time (the timing ring first: with the minimal indicators it only shows
 * while you aim, so a player who never aims may not know it) */
const TIPS = ['tip.ring', 'tip.attack', 'tip.kitchen', 'tip.tap', 'tip.block', 'tip.lob'];
let tipNo = 0;
function pause() {
  if (mode !== 'play' || paused) return;
  paused = true;
  input.clear();
  const k = TIPS[tipNo++ % TIPS.length];
  const tip = t(!isTouch && (k === 'tip.ring' || k === 'tip.tap' || k === 'tip.attack' || k === 'tip.block') ? `${k}Keys` : k);
  // the match as it stands (a challenge: its name and points)
  const m = match;
  const d = training.drill;
  let where = '';
  if (d) where = `<div class="pause-score drill">${t(`dr.${d.def.id}.name`)} <b>${t('train.pts', { n: d.score })}</b></div>`;
  else if (m && m.players.length) {
    const tv = bc.teams;
    if (tv) where = `<div class="pause-score"><span>${tv[0].names.join(' / ')}</span><b>${m.score[0]}</b><i></i><b>${m.score[1]}</b><span>${tv[1].names.join(' / ')}</span></div>`;
  }
  const el = show(
    `<div class="panel pause">
    <div class="eyebrow">${d ? t('train.title') : bc.round || EVENT}</div><h2>${t('pause.title')}</h2>${where}
    <div class="btn-col"><button class="btn primary" data-a="go">${ICON.play}${t('pause.resume')}</button><button class="btn ghost" data-a="quit">${t('pause.quit')}</button></div>
    <p class="tip">${ICON.info}<span><b>${t('tip.title')}</b>${tip}</span></p></div>`,
  );
  el.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a;
    if (!a) return;
    audio.play('click');
    if (a === 'go') {
      paused = false;
      clearScreens();
    } else if (training.drill) {
      // (quitting a challenge: back to the list of challenges)
      training.stop();
      leaveDrill();
      training.list();
    } else {
      match = null;
      bc.reset();
      menu();
    }
  });
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

let bannerTimer = 0;
/**
 * The point's result: a tag under the score bug (away from the play), gone before the next serve. `why`: the line
 * under it that says why, with a number from the point (src/explain.ts), in the same pill.
 */
function showBanner(main: string, cls: string, sub = '', why = '') {
  const w = why ? `<span class="why">${why.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</span>` : '';
  banner.innerHTML = `<div class="b1 ${cls}${w ? ' has-why' : ''}">${main}${w}</div>${sub ? `<div class="b2">${sub}</div>` : ''}`;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => (banner.innerHTML = ''), why ? 3200 : 1600);
}
function clearBanner() {
  clearTimeout(bannerTimer);
  banner.innerHTML = '';
}
let toastTimer = 0;
function toast(msg: string, ms = 1100) {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), ms);
}
/** A word over the hitter's head (never on the ball), small and quick. */
function floater(text: string, cls: string, x: number, y: number) {
  const d = document.createElement('div');
  d.className = `fl ${cls}`;
  d.textContent = text;
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  fxLayer.appendChild(d);
  setTimeout(() => d.remove(), 800);
}
function doFlash(a = 0.35) {
  if (REDUCED) return;
  flash.style.transition = 'none';
  flash.style.opacity = String(a);
  requestAnimationFrame(() => {
    flash.style.transition = 'opacity .35s';
    flash.style.opacity = '0';
  });
}

function onEvent(m: Match, e: MatchEvent, live: boolean) {
  // a training challenge: the far player is the ball machine (no body, no paddle, no TV moments, no umpire)
  const drill = training.drill && training.drill.match === m ? training.drill : null;
  if (e.type === 'hit' && !(drill && e.pid === 1)) view.onHit(e.pid, e.x, e.y, e.z, m.t, m.players[e.pid].lastHit?.hand ?? 1);
  // (why the point ended: the explainer follows every event of the live match)
  const why = live ? explainer.event(m, e) : null;
  if (drill && live) training.event(m, e, why);
  // reactions: the winners cheer, the losers hang their head (also in the attract match)
  const reacts = e.type === 'point' && !drill ? view.onPoint(m, e) : [];
  if (live) {
    // kept for the replays
    if (e.type === 'hit') view.record({ type: 'hit', x: e.x, y: e.y, z: e.z, pid: e.pid, kind: e.kind, speed: e.speed, perfect: e.timing === 'perfect', good: true, tape: false }, m.t);
    else if (e.type === 'bounce') view.record({ type: 'bounce', x: e.x, y: 0, z: e.z, pid: -1, kind: null, speed: 0, perfect: false, good: e.good, tape: false }, m.t);
    else if (e.type === 'net') view.record({ type: 'net', x: e.x, y: e.y, z: e.z, pid: -1, kind: null, speed: 0, perfect: false, good: true, tape: e.tape }, m.t);
  }
  if (!live) {
    // the attract match only makes quiet sounds and effects
    if (e.type === 'hit') view.hitFx(e.x, e.y, e.z, false, 0.2);
    if (e.type === 'bounce') view.bounceFx(e.x, e.z, e.good);
    if (e.type === 'net' && !e.tape) view.netFx();
    return;
  }
  switch (e.type) {
    case 'serveSetup': {
      const me = m.players[e.server].human;
      if (me) human.serveSince = m.t;
      if (drill) break;
      const mp = matchPoint(m);
      if (m.doubles) setFooter(`${BOARD_FOOTER} · ${m.call()}`);
      // (the last point's tag gives way to the umpire's call)
      clearBanner();
      // the umpire calls the score (and who serves) with a chime; the camera frames the server
      const who = me ? t('hud.youServe') : t('hud.serves', { name: callNames[e.server] ?? names[e.server] });
      bc.onEvent(m, e, { matchPoint: mp, who });
      if (me && !save.tutorial && !tut.served) setHint('tut.serve');
      break;
    }
    case 'serveStart': {
      bc.onEvent(m, e);
      // the serve's timing is decided on the release: say so then, not 0.9 s later at the contact
      const w = m.windup;
      if (m.players[e.pid].human && human.last && w) {
        const sp = view.toScreen(w.x, w.y + 0.6, w.z);
        floater(t('timing.' + human.last.timing), human.last.timing, sp.x, sp.y);
        buzz(human.last.timing === 'perfect' ? [10, 30, 16] : 8);
      }
      break;
    }
    case 'hit': {
      const p = m.players[e.pid];
      const power = Math.min(1, Math.max(0, (e.speed - 6) / 10));
      // the paddle's pock: by the kind of shot and how hard, placed where it happened (the machine has its own pop)
      if (!(drill && e.pid === 1)) audio.paddle(e.kind, e.speed, panOf(e.x, e.y, e.z), farOf(e.z), e.timing === 'perfect' && p.human);
      if (!drill) bc.onEvent(m, e);
      view.hitFx(e.x, e.y, e.z, e.timing === 'perfect' && p.human, e.kind === 'smash' ? 1 : power);
      if (p.human) {
        // over the head, not on the ball: PERFECT (gold), early or late (the manual swing), and in the full
        // indicators the kind of an aimed shot; the automatic shot is the quiet default, and the serve's label came
        // with the release
        const lbl = e.timing === 'good' ? (save.hud === 'full' ? t('kind.' + e.kind) : '') : e.timing === 'auto' ? '' : t('timing.' + e.timing);
        if (lbl && e.kind !== 'serve') {
          // beside the head, away from the paddle side (where the ball leaves from)
          const sp = view.toScreen(p.x, 2.1, p.z);
          const paddle = view.toScreen(e.x, e.y, e.z).x >= sp.x ? 1 : -1;
          floater(lbl, e.timing, sp.x - paddle * 30 * ui, sp.y);
        }
        buzz(e.timing === 'perfect' ? [16, 34, 26] : e.timing === 'auto' ? 9 : 14);
        if (e.timing === 'perfect') {
          doFlash(0.1);
          tut.perfect = true;
        }
        // the contact lands: a perfect swing (a soft one barely), a smash
        if (e.timing === 'perfect' && e.kind !== 'serve') freeze(e.kind === 'dink' || e.kind === 'drop' ? 0.03 : 0.06);
        else if (e.kind === 'smash') freeze(0.045);
        if (e.kind === 'serve') {
          tut.served = true;
          if (hintKey === 'tut.serve') setHint('');
        } else if (e.timing !== 'auto') {
          tut.hit = true;
          tut.kinds++;
          if (hintKey.startsWith('tut.hit')) setHint('');
          if (!save.tutorial && tut.kinds === 2 && !tut.shownKinds) {
            tut.shownKinds = true;
            setHint('tut.kinds', 6);
          }
        }
      } else if (e.kind === 'smash') {
        view.shake = 0.3;
        freeze(0.045);
      }
      break;
    }
    case 'bounce':
      audio.courtBounce(e.first ? 0.75 : 0.4, panOf(e.x, 0, e.z), farOf(e.z));
      view.bounceFx(e.x, e.z, e.good);
      // (a ball just in: the stands' "ooh" says it, no toast)
      if (!drill) bc.onEvent(m, e);
      break;
    case 'net':
      if (e.tape) {
        audio.play('tape');
        if (save.hud === 'full') toast(t('hud.tape'));
      } else {
        audio.play('net');
        view.netFx();
      }
      if (!drill) bc.onEvent(m, e);
      break;
    case 'point': {
      // (a challenge's ball: the training shows what it scored)
      if (drill) {
        input.clear();
        break;
      }
      const mine = e.winner === 0;
      let main: string;
      // from the player's side: our winner, their clean winner, a ball we did not reach or let go
      if (e.reason === 'winner' || e.reason === 'miss' || e.reason === 'letGo') main = mine ? t('reason.winner') : e.reason === 'winner' ? t('reason.winnerThem') : e.reason === 'miss' && m.doubles ? t('reason.missPair') : t('reason.' + e.reason);
      else main = t('reason.' + e.reason);
      // (the score is in the bug, which flips; the tag only adds what happened to the serve)
      let sub = e.sideOut && save.scoring === 'sideout' ? t('hud.sideOut') : '';
      if (m.doubles) sub = e.withheld ? t('hud.noPoint') : e.sideOut ? t('hud.sideOut') : e.handOver ? t('hud.server2') : '';
      // (0.8 explained every point in a second line and gave tips; Germán, 10 oct: «no tiene mucho sentido». The
      // explainer still runs: the training scores and its lines use it)
      showBanner(main, mine ? 'good' : 'bad', sub);
      audio.play(mine ? 'point' : 'lost');
      buzz(mine ? [12, 40, 12] : e.fault === 0 ? 45 : 25);
      if (e.reason === 'kitchen' || e.reason === 'twoBounce' || e.reason === 'serveKitchen') audio.play('fault');
      // the bug flips the side that scored (in classic scoring a side out scores nothing: the serve moves)
      const scored = e.withheld || (m.rules.scoring === 'sideout' && e.sideOut) || e.handOver ? null : e.winner;
      renderHud(scored);
      input.clear();
      // the stands, the reaction shot and maybe a replay
      bc.onEvent(m, e, { reacts });
      break;
    }
    case 'over': {
      const won = e.winner === 0;
      if (m.doubles) setFooter(BOARD_FOOTER);
      // (the victory strap has the bottom of the screen)
      setHint('');
      audio.play(won ? 'win' : 'lose');
      // the end screen comes after the victory shot (bc.onEnd)
      bc.onEvent(m, e);
      break;
    }
  }
}

function matchPoint(m: Match): boolean {
  const to = m.rules.to;
  const [a, b] = m.score;
  const st = m.serverTeam;
  // in classic scoring only the serving team can win the point that ends the game
  const can = (team: 0 | 1) => m.score[team] + 1 >= to && m.score[team] + 1 - m.score[team === 0 ? 1 : 0] >= 2;
  void a;
  void b;
  // doubles (both scorings): the game can only be won serving
  return m.rules.scoring === 'rally' && !m.doubles ? can(0) || can(1) : can(st);
}

function endScreen(m: Match, won: boolean) {
  if (match !== m || mode !== 'play') return;
  mode = 'end';
  hud.hidden = true;
  setHint('');
  const d = m.doubles;
  const n = d ? PAIRS.length : RIVALS.length;
  const i = d ? PAIRS.indexOf(pair) : RIVALS.indexOf(rival);
  if (d && won && i === save.beatenPairs) save.beatenPairs = Math.min(n, save.beatenPairs + 1);
  if (!d && won && i === save.beaten) save.beaten = Math.min(n, save.beaten + 1);
  save.tutorial = true;
  save.played = Math.min(99, save.played + 1);
  persist();
  const hasNext = won && i + 1 < n;
  const s = m.stats;
  const allDone = won && i === n - 1;
  // doubles: your own perfect shots and errors, the team's winners, and your partner's errors
  // the final score as the broadcast shows it: both teams, the winner's row lit
  const tv = bc.teams;
  const team = (k: 0 | 1) => {
    const c = k === 0 ? HERO.css : d ? kitOf(pair.a.id).css : kitOf(rival.id).css;
    const nm = tv ? tv[k].names.join(' / ') : k === 0 ? t('you') : '';
    const w = m.winner === k;
    return `<div class="fr${w ? ' w' : ''}"><i style="background:${c}"></i><span class="nm">${nm}</span>${w ? `<span class="wk">${ICON.check}</span>` : ''}<span class="sc">${m.score[k]}</span></div>`;
  };
  const stat = (label: string, v: number) => `<div class="sr"><span>${label}</span><b>${v}</b></div>`;
  const el = show(
    `<div class="end"><div class="end-a">
    <div class="eyebrow">${roundName(i, n)} · ${EVENT}</div>
    <div class="result ${won ? 'win' : 'lose'}">${won ? t('end.win') : t('end.lose')}</div>
    <div class="final-board">${team(0)}${team(1)}</div>
    ${allDone ? `<div class="champ">${ICON.trophy}<span>${t(d ? 'end.ladderDoubles' : 'end.ladder')}</span></div>` : ''}
    </div><div class="end-b">
    <div class="stats"><h3>${t('end.stats')}</h3>
      ${stat(t('end.perfect'), d ? s.perfectBy[0] : s.perfect[0])}
      ${stat(t('end.winners'), s.winners[0])}
      ${stat(t('end.errors'), d ? s.errorsBy[0] : s.errors[0])}
      ${d ? stat(t('end.errorsPartner', { name: PARTNER.name }), s.errorsBy[1]) : ''}
      ${stat(t('end.longest'), s.longest)}
    </div>
    <div class="btn-col">
      ${hasNext ? `<button class="btn primary" data-a="next">${t(d ? 'end.nextPair' : 'end.next')}<small>${roundName(i + 1, n)}</small></button>` : ''}
      <button class="btn ${hasNext ? 'ghost' : 'primary'}" data-a="again">${t('end.rematch')}</button>
      <button class="btn ghost" data-a="menu">${t('end.menu')}</button>
    </div></div></div>`,
  );
  el.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a;
    if (!a) return;
    audio.play('click');
    bc.reset();
    if (a === 'next') {
      if (d) versusPair(PAIRS[i + 1]);
      else versus(RIVALS[i + 1]);
    } else if (a === 'again') {
      if (d) versusPair(pair);
      else versus(rival);
    } else {
      match = null;
      menu();
    }
  });
}

// ------------------------------------------------------------------ per-frame overlays (aim, timing ring, stick)
// One visual language: thin rings with a dark edge (readable on the bright court), small dark pills for words, and
// the colours of view.ts (HUE): lime you / in reach, gold perfect, red the kitchen, grey out. Nothing is bigger than
// it needs to be, nothing sits on the ball, and with the minimal indicators (the default) only what is needed to play
// is drawn: the timing ring while you aim (always with the manual swing), the aim, the stick.
const ringOuter = document.createElement('div');
ringOuter.className = 'ring outer';
const ringTarget = document.createElement('div');
ringTarget.className = 'ring target';
const chip = document.createElement('div');
chip.className = 'chip';
/** «¡Atácala!»: beside the player when the coming ball sits up (never on the ball) */
const cueChip = document.createElement('div');
cueChip.className = 'chip';
cueChip.setAttribute('aria-hidden', 'true');
const stickBase = document.createElement('div');
stickBase.className = 'stick-base';
const stickKnob = document.createElement('div');
stickKnob.className = 'stick-knob';
stickBase.hidden = stickKnob.hidden = chip.hidden = cueChip.hidden = true;
fxLayer.append(ringOuter, ringTarget, chip, cueChip, stickBase, stickKnob);
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
/** the timing ring: its size far from the contact and at the ideal release (px on a 390 px phone) */
const RING_MAX = 64;
const RING_MIN = 20;
/** the drawn stick: radius of the base and the knob (px on a 390 px phone; the real throw is the input's) */
const STICK_DRAW = 38;

/** Places the timing ring (size in px) around a screen point. */
function drawRing(x: number, y: number, size: number, cls: string, alpha = 1) {
  const s = Math.round(size * 2) / 2;
  ringOuter.style.width = ringOuter.style.height = `${s}px`;
  ringOuter.style.transform = ringTarget.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  ringTarget.style.width = ringTarget.style.height = `${RING_MIN * ui}px`;
  ringOuter.className = `ring outer${cls}`;
  ringTarget.className = `ring target${cls === ' gold' ? ' gold' : ''}`;
  ringOuter.style.opacity = ringTarget.style.opacity = alpha >= 0.99 ? '' : alpha.toFixed(2);
}

/** Does a circle on screen (centre, radius in px) touch one of this team's players (feet to head)? */
function overTeam(m: Match, team: 0 | 1, x: number, y: number, r: number): boolean {
  for (const p of m.players) {
    if (p.team !== team) continue;
    const f = view.toScreen(p.x, 0, p.z);
    const h = view.toScreen(p.x, 1.85, p.z);
    const half = view.pxPerMetre(p.x, p.z) * 0.35;
    const cx = Math.max(f.x - half, Math.min(f.x + half, x));
    const cy = Math.max(h.y, Math.min(f.y, y));
    if (Math.hypot(x - cx, y - cy) < r) return true;
  }
  return false;
}

/** where the opponents stand on screen (the chip keeps off them) */
function rivalsOnScreen(m: Match, team: 0 | 1): [number, number, number, number][] {
  return m.players
    .filter((p) => p.team !== team)
    .map((p) => {
      const f = view.toScreen(p.x, 0, p.z);
      const h = view.toScreen(p.x, 1.9, p.z);
      const half = view.pxPerMetre(p.x, p.z) * 0.5 + 4;
      return [f.x - half, h.y - 4, f.x + half, f.y + 4];
    });
}
const chipW = new Map<string, number>();
/** The shot's name beside the landing mark (never on it), on the side away from the opponents and the edges. */
function placeChip(m: Match, team: 0 | 1, x: number, y: number, text: string, color: string) {
  if (chip.textContent !== text) chip.textContent = text;
  chip.style.color = color;
  let w = chipW.get(text);
  if (w === undefined) {
    w = chip.offsetWidth;
    chipW.set(text, w);
  }
  const h = 20 * ui;
  const gap = 14 * ui;
  const top = y - h / 2;
  const boxes = rivalsOnScreen(m, team);
  const W = window.innerWidth;
  const bad = (x0: number) => x0 < 4 || x0 + w! > W - 4 || boxes.some((b) => x0 < b[2] && x0 + w! > b[0] && top < b[3] && top + h > b[1]);
  let x0 = x + gap;
  if (bad(x0) && !bad(x - gap - w)) x0 = x - gap - w;
  x0 = Math.max(4, Math.min(W - w - 4, x0));
  chip.style.transform = `translate(${x0.toFixed(1)}px, ${top.toFixed(1)}px)`;
}

/** the timing ring's last drawn time-to-contact, so it closes smoothly (never grows back or leaps) */
const ringState = { key: '', e: 0 };
function overlays(m: Match, dt = 1 / 60) {
  const me = m.players.find((p) => p.human)!;
  const hp = m.humanPlan();
  const full = save.hud === 'full';
  ballCue(m, me, dt);
  let ringOn = false;
  let ringThin = false;
  // aiming: the landing mark and the arc are drawn on the court (view.aim); the shot's name beside the mark
  if (input.active && (m.phase === 'serve' ? m.server() === me : m.phase === 'rally')) {
    const plan = hp?.plan ?? null;
    const a = human.aim(m, me, plan, input.dx, input.dy, input.attackHeld && m.phase === 'rally');
    view.aim = { x: a.x, z: a.z, kind: a.kind, ok: a.ok, from: human.contactPoint(m, me, plan), clear: a.clear, pace: a.pace };
    const sp = view.toScreen(a.x, 0, a.z);
    chip.hidden = false;
    placeChip(m, me.team, sp.x, sp.y, a.ok ? t('kind.' + a.kind) : t('aim.out'), cssHue(aimHue(a.kind, a.ok)));
  } else {
    view.aim = null;
    chip.hidden = true;
  }
  // the timing ring: closes on the ball as it comes, gold in the perfect window, red too late or a kitchen volley
  // (assisted: not for a ball going out, which is left alone unless you hold the aim). Minimal indicators: only
  // while you aim (the release is what it times), always with the manual swing.
  if (m.phase === 'rally' && hp && hp.plan.reach && m.t < hp.plan.t && !(save.swing === 'assist' && hp.plan.out && !input.active)) {
    const b = m.ballPos();
    if (b) {
      const e = hp.plan.t - m.t; // seconds to contact (the gold window is judged on this, exactly)
      // drawn: closes at the speed of time, without growing back or leaping as the plan is refined
      const key = `${m.rally?.shots ?? 0}:${m.rally?.bounces ?? 0}`;
      let shown = e;
      if (ringState.key === key && e > 0.3) {
        const expect = ringState.e - dt;
        if (Math.abs(e - expect) < 0.35) shown = Math.min(expect, e + 0.08);
      }
      ringState.key = key;
      ringState.e = shown;
      // (the first match with the minimal indicators: the ring also shows, faint, on the balls the assisted swing
      // plays by itself, until the first perfect: a player who never aims would never meet it)
      const teach = !full && save.swing === 'assist' && !input.active && !save.tutorial && !tut.perfect;
      // (an attack at you: the ring shows, its gold is the moment to tap the block)
      if (full || input.active || save.swing === 'manual' || teach || cueNow.kind === 'block') {
        const sp = view.toScreen(b.x, b.y, b.z);
        const k = Math.max(0, Math.min(1, (shown - IDEAL_RELEASE) / 0.95));
        const gold = Math.abs(e - IDEAL_RELEASE) <= PERFECT_WINDOW;
        const size = (RING_MIN + k * (RING_MAX - RING_MIN)) * ui;
        // past the gold window: late (red) with the manual swing; the assisted swing still plays a plain shot then,
        // so the ring only goes grey
        const past = e < IDEAL_RELEASE - PERFECT_WINDOW;
        const cls = hp.plan.oops ? ' late' : gold ? ' gold' : past ? (save.swing === 'assist' ? ' past' : ' late') : '';
        // the ball comes down the screen through your own side just before the release: over a player, only the thin
        // ring, see-through (half; the gold a little more, it is the cue to let go): the size and the gold, the
        // timing, are the same
        ringThin = overTeam(m, me.team, sp.x, sp.y, size / 2);
        // (fades in as the ball comes, rather than popping up at full size)
        drawRing(sp.x, sp.y, size, cls, Math.min(1, (1.35 - shown) / 0.35) * (teach ? 0.4 : 1) * (ringThin ? (gold ? 0.85 : 0.55) : 1));
        ringOn = true;
      }
      if (!save.tutorial && !tut.hit && (hintKey === '' || hintKey.startsWith('tut.move')) && m.rally && m.rally.shots >= 1) {
        // assisted: shown once for a while (the player may never need to press)
        if (save.swing === 'assist') {
          tut.hit = true;
          setHint('tut.hit', 7);
        } else setHint('tut.hitManual');
      }
    }
  }
  // the serve's pulse around the ball in the hand (smallest, and gold, at the best moment; minimal: while you aim)
  if (m.phase === 'serve' && m.server() === me && !m.windup && (full || input.active)) {
    const c = human.contactPoint(m, me, null);
    const sp = view.toScreen(c.x, c.y + 0.25, c.z);
    const s = servePulse(m.t);
    drawRing(sp.x, sp.y, (RING_MIN + s * (RING_MAX - RING_MIN)) * ui, s < 0.26 ? ' gold' : '');
    ringOn = true;
  }
  ringOuter.hidden = ringTarget.hidden = !ringOn;
  if (ringThin) ringTarget.hidden = true;
  // the stick under the left thumb: a thin ring and a small knob that shows the push (drawn small: the thumb
  // covers it anyway)
  if (input.stickBase) {
    stickBase.hidden = stickKnob.hidden = false;
    const r = STICK_DRAW * ui;
    const bx = input.stickBase.x;
    const by = input.stickBase.y;
    stickBase.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -50%)`;
    stickKnob.style.transform = `translate(${(bx + input.stickX * r).toFixed(1)}px, ${(by + input.stickY * r).toFixed(1)}px) translate(-50%, -50%)`;
  } else stickBase.hidden = stickKnob.hidden = true;
  // tutorial: move, swing, and the kitchen rule now that the player walks in by himself
  const incoming = m.phase === 'rally' && m.rally?.last && m.rally.last.team !== me.team;
  if (!save.tutorial && incoming && !input.moved && !tut.moveShown && hintKey === '') {
    tut.moveShown = true;
    setHint(isTouch ? 'tut.move' : 'tut.moveKeys');
  }
  if (hintKey.startsWith('tut.move') && input.moved && tut.until === 0) tut.until = performance.now() + 1500;
  if (!save.tutorial && !tut.kitchen && m.phase === 'rally' && Math.abs(me.z) < NVZ + 0.05 && tut.hit && (hintKey === '' || hintKey === 'tut.kinds')) {
    tut.kitchen = true;
    setHint('tut.kitchen', 5);
  }
  if (tut.until && performance.now() > tut.until) setHint('');
}

/**
 * What the coming ball asks for (brain.ts, ballCue): an attack (it sits up: the circle and the ring at the feet go
 * orange, «¡Atácala!» beside the player for a moment and a light double tick) or a block (an attack at you: the timing
 * ring shows, tap on its gold). Once shown it stays for the ball, unless it is gone for a moment (the contact was
 * refined away from it); it goes as soon as the ball is played.
 */
const cueNow = { key: '', kind: null as 'attack' | 'block' | null, at: 0, lost: 0, buzzed: false };
function ballCue(m: Match, me: Player, dt: number) {
  const r = m.rally;
  const incoming = m.phase === 'rally' && !!r?.last && r.last.team !== me.team;
  const key = `${m.stats.rallies}:${r?.shots ?? 0}`;
  if (cueNow.key !== key || !incoming) {
    cueNow.key = key;
    cueNow.kind = null;
    cueNow.buzzed = false;
  }
  const raw = incoming ? human.cue(m, me) : null;
  if (raw) {
    if (cueNow.kind !== raw) {
      cueNow.kind = raw;
      cueNow.at = m.t;
    }
    cueNow.lost = 0;
  } else if (cueNow.kind && (cueNow.lost += dt) > 0.15) cueNow.kind = null;
  const attack = cueNow.kind === 'attack';
  view.attackCue = attack;
  if (attack && !cueNow.buzzed) {
    cueNow.buzzed = true;
    buzz([6, 28, 6]);
  }
  // the word: beside the player (the side away from the ball), small, for a moment, gone once he aims
  const show = attack && !input.active && m.t - cueNow.at < 1.1;
  cueChip.hidden = !show;
  if (show) {
    const txt = t('cue.attack');
    if (cueChip.textContent !== txt) cueChip.textContent = txt;
    cueChip.style.color = cssHue(aimHue('speedup', true));
    const head = view.toScreen(me.x, 1.7, me.z);
    const b = m.ballPos();
    const away = b && view.toScreen(b.x, b.y, b.z).x > head.x ? -1 : 1;
    const w = cueChip.offsetWidth || 80;
    const x = Math.max(4, Math.min(window.innerWidth - w - 4, away > 0 ? head.x + 26 * ui : head.x - 26 * ui - w));
    cueChip.style.transform = `translate(${x.toFixed(1)}px, ${(head.y - 10 * ui).toFixed(1)}px)`;
  }
  // the tutorial: the first ball to attack, the first attack to block (they take over from the general hints and from
  // each other: they are about the ball coming now)
  const general = hintKey === '' || hintKey === 'tut.kinds' || hintKey === 'tut.hit' || hintKey.startsWith('tut.attack') || hintKey.startsWith('tut.block');
  if (!save.tutorial && attack && !tut.attack && tut.hit && general) {
    tut.attack = true;
    setHint(isTouch ? 'tut.attack' : 'tut.attackKeys', 5);
  }
  if (!save.tutorial && cueNow.kind === 'block' && !tut.block && tut.hit && general) {
    tut.block = true;
    setHint(isTouch ? 'tut.block' : 'tut.blockKeys', 5);
  }
}

/**
 * Cues by touch, once each: the player who had to run for the ball gets there (in reach: the thumb can stop, the ring
 * at the feet turns lime; nothing if he was there already), and the kitchen line holds the player back.
 */
const cue = { key: '', far: false, done: false, line: false };
function touchCues(m: Match) {
  const me = m.players.find((p) => p.human);
  if (!me || m.phase !== 'rally') {
    cue.key = '';
    cue.line = false;
    return;
  }
  const r = m.rally;
  const key = `${m.stats.rallies}:${r?.shots ?? 0}`;
  if (cue.key !== key) {
    cue.key = key;
    cue.far = cue.done = false;
  }
  const tg = m.targetFor(me.id);
  // (the reach right now: right after the other side's contact it is shorter, REFLEX in the sim)
  if (tg && Math.hypot(tg.fx - me.x, tg.fz - me.z) > (m.targetInfo(me.id)?.reach ?? LUNGE)) cue.far = true;
  else if (cue.far && !cue.done && me.plan?.reach && !me.plan.out && !me.plan.oops && r?.last && r.last.team !== me.team) {
    cue.done = true;
    buzz(7);
  }
  const held = m.lineHold(me.id);
  if (held && !cue.line) buzz(10);
  cue.line = held;
}

// ------------------------------------------------------------------ loop
const fps = { t: 0, n: 0, slow: 0 };
let last = performance.now();
let simClock = 0;
/** One frame of the game: the match (held while the TV shows the intro or a replay), the TV, the overlays, the view. */
function tick(raw: number, time: number) {
  const live = mode === 'play' && match && !paused;
  const m = live ? match : mode === 'menu' || mode === 'vs' ? demo : match;
  // a hit-stop slows the live match and its drawing to a crawl for a moment (the TV and the menus run on)
  const crawl = live && hitStop > 0 ? 0.06 : 1;
  if (hitStop > 0) hitStop = Math.max(0, hitStop - raw);
  const dt = raw * crawl;
  if (m && (m === demo || !paused) && !(m === match && bc.frozen)) {
    m.update((m === match ? dt : raw) * timeScale);
    for (const e of m.events) onEvent(m, e, m === match);
    m.events.length = 0;
    if (m === match) explainer.frame(m);
    if (m === match && training.drill) training.frame(dt, time);
    if (m === demo && m.phase === 'over') startDemo();
  }
  if (live && match) bc.update(raw, match, input.pressing || !!input.stickBase);
  // (a tutorial hint waits while the TV has the screen: the intro, a replay)
  app.classList.toggle('tv-held', bc.frozen);
  // after a point, while a tap can still cut the pause short: the invite (until the player has done it twice, in
  // his first three matches)
  const skip = !!live && !!match && !bc.frozen && !training.drill && save.skips < 2 && save.played < 3 && match.hurryable() > 0.25;
  if (skip) {
    const txt = t(isTouch ? 'hud.tapOn' : 'hud.keyOn');
    if (tapEl.textContent !== txt) tapEl.textContent = txt;
  }
  tapEl.classList.toggle('on', skip);
  if (live && match && !bc.frozen) {
    view.leavesOut = save.swing === 'assist' && !input.active;
    overlays(match, dt);
    touchCues(match);
  } else {
    ringOuter.hidden = ringTarget.hidden = true;
    chip.hidden = cueChip.hidden = true;
    stickBase.hidden = stickKnob.hidden = true;
    view.aim = null;
    view.attackCue = false;
  }
  // (paused: a replay or the intro flight stays where it is)
  view.frame(paused && (view.replay || bc.frozen) ? 0 : live && !bc.frozen ? dt : raw, time);
}
function loop(now: number) {
  // (never negative: the first frame's timestamp can come before the time read at load, and a negative step would
  // wind the camera shake up instead of down)
  const raw = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  if ((window as unknown as { __pb: { manual: boolean } }).__pb?.manual) {
    requestAnimationFrame(loop);
    return;
  }
  tick(raw, now / 1000);
  audio.loops('stadium', raw);
  // quality: drop a tier if the frame rate stays low
  fps.t += raw;
  fps.n++;
  if (fps.t > 2.5) {
    const avg = fps.t / fps.n;
    fps.slow = avg > 1 / 38 ? fps.slow + 1 : 0;
    fps.t = fps.n = 0;
    if (fps.slow >= 2 && view.tier !== 'low') {
      view.setTier((view.tier === 'high' ? 'medium' : 'low') as Tier);
      fps.slow = 0;
    }
  }
  requestAnimationFrame(loop);
}

// the AI-made players load first (about 1 MB); the court is drawn meanwhile
show(`${logo()}<div class="loading"><span class="spin"></span>${t('loading')}</div>`);
requestAnimationFrame(loop);
view
  .load('')
  .then(() => menu())
  .catch((err) => {
    console.error(err);
    show(`${logo()}<div class="loading" style="flex-direction:column;text-align:center">${t('loadError')}<small style="opacity:.6;font-weight:600">${String(err?.message ?? err).slice(0, 140)}</small></div>`);
  });

// handy for automated screenshots and the video: window.__pb
(window as unknown as { __pb: unknown }).__pb = {
  get match() {
    return match;
  },
  get demo() {
    return demo;
  },
  /** debug: stop the loop and step the current match by hand (screenshots of fast moments in slow renderers) */
  manual: false,
  advance(sec: number, step = 1 / 60, draw = true) {
    view.skipRender = true;
    for (let t = 0; t < sec; t += step) {
      simClock += step;
      tick(step, simClock);
    }
    view.skipRender = false;
    if (draw) view.render(step);
  },
  /** the TV presentation (skip the intro, force replays, read where the camera is) */
  bc,
  audio,
  /** debug: the human's player plays by itself like a club player (captures of long rallies) */
  autopilot() {
    if (match) match.controllers[0] = new AIController(PARTNER.skill);
  },
  view,
  input,
  /** a match against rival i (tv: with the TV moments; off by default, so captures get the gameplay camera) */
  start: (i = 0, tv = false) => {
    bc.cinema = tv;
    startMatch(RIVALS[i]);
  },
  /** a training challenge i (0 dink … 4 serve), seeded */
  train: (i = 0, seed?: number) => training.start(i, seed),
  training,
  startDoubles: (i = 0, tv = false) => {
    bc.cinema = tv;
    startDoubles(PAIRS[i]);
  },
  save,
  /** what the coming ball asks for right now, as the HUD shows it: 'attack', 'block' or null (captures, tests) */
  get cue() {
    return cueNow.kind;
  },
  set timeScale(v: number) {
    timeScale = v;
  },
};
void app;
