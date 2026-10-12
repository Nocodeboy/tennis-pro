// Padel prototype: menus, the match loop, HUD and feedback. The rules live in sim/, the drawing in render/.
// Always doubles: the human and his CPU partner (Martín) against a ladder of CPU pairs.

import { audio, vibrate } from './audio';
import { Broadcast, type BroadcastSetup, type TeamInfo } from './broadcast';
import { Explainer } from './explain';
import { AIM_D0, HumanController, servePulse, type SwingMode } from './human';
import { t, lang, setLang } from './i18n';
import { ICON } from './icons';
import { Input } from './input';
import { HERO, PARTNER_KIT, RIVAL_KITS, kitOf } from './kits';
import { View, aimHue, cssHue, type Tier } from './render/view';
import { AIController, ATTACK, HUMAN_REACTION, HUMAN_SPEED, PAIRS, PARTNER, RIVALS, kindForAim, specialOk, type Pair, type Rival } from './sim/brain';
import { ATTR_KEYS, HUMAN_ATTRS, overall, type Attributes } from './sim/attributes';
import { IDEAL_RELEASE, LUNGE, Match, PERFECT_WINDOW, type Controller, type PlayerCfg } from './sim/match';
import { Rng } from './sim/rng';
import type { MatchEvent, Plan, Player, PointReason, Rules, ShotKind, Special } from './sim/types';
import type { Kit } from './render/chars';
import { EVENT, TOUR, brand, court, bugName, fullName, initials, pairInfo, pairSeed, playerInfo, roundName, seedTag, surname } from './tour';

declare const __VERSION__: string;

// ------------------------------------------------------------------ save
interface Save {
  sound: boolean;
  /** the menus' music (assets/music, made with AI), apart from the sound */
  music: boolean;
  /** the length of the match (one set): games to win it, a tie-break at games-games */
  games: 2 | 3 | 4 | 6;
  /** at 40-40: the golden point (the next point wins the game) or advantages */
  golden: boolean;
  tutorial: boolean;
  lang?: 'en' | 'es';
  /** how the human swings, and how much help to get into position */
  swing: SwingMode;
  assist: number;
  /** the pairs of the ladder beaten */
  beatenPairs: number;
  /** TV replays of great points */
  replays: boolean;
  /** between shots, with the thumb off the stick, the player jogs back to a good spot by himself */
  recover: boolean;
  /** vibration on hits, in reach and on points */
  haptics: boolean;
  /** the indicators on screen: all of them, or only what is needed to play (the default) */
  hud: 'full' | 'min';
  /** taps that cut the pause after a point short, and matches finished (the "Tap to continue" invite stops) */
  skips: number;
  played: number;
  /** a tip between points when the same mistake keeps coming back (src/explain.ts, Coach) */
  coach: boolean;
  /** the first-time hints already shown (0.3: the power of the gesture, the bajada, the por 3 / por 4 chance) */
  seen: string[];
}
const KEY = 'padel-proto-v1';
const save: Save = { sound: true, music: true, games: 3, golden: true, tutorial: false, swing: 'assist', assist: 1, beatenPairs: 0, replays: true, recover: false, haptics: true, hud: 'min', skips: 0, played: 0, coach: true, seen: [] };
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
if (![2, 3, 4, 6].includes(save.games)) save.games = 3;
if (!Array.isArray(save.seen)) save.seen = [];
/** the rules of a match as Settings has them */
const rules = (): Rules => ({ games: save.games, golden: save.golden });
if (save.lang) setLang(save.lang);
else setLang(lang);
audio.setSfx(save.sound);
audio.setMusic(save.music);
// the menus' theme (the studio's, from the pickleball: Magnific, Google Lyria 3 Pro; looped round its 36 bars after
// the intro). In the matches the crowd is the sound, as on TV.
audio.setMusicTracks({ menu: { url: 'assets/music/menu-loop.mp3', loopStart: 11.2725, loopEnd: 83.2725, vol: 0.55 } });

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
/** the pair being played, and every player's name by id (for the calls and toasts) */
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
  if (what === 'aim' && match && mode === 'play' && !paused && !bc.frozen && match.phase === 'dead') {
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

// ------------------------------------------------------------------ the attract mode behind the menus
let demo: Match | null = null;
const cfgOf = (r: Rival, team: 0 | 1): PlayerCfg => ({ team, human: false, speed: r.skill.speed, reaction: r.skill.reaction, look: r.look });
function startDemo() {
  // the attract match: Galván and Chingoto against Tapira and Coeyo (four CPU players as they play in a pair, the
  // default rules)
  const near = [PAIRS[1].b, PAIRS[1].a];
  const far = [PAIRS[3].a, PAIRS[3].b];
  const all = [...near, ...far];
  demo = new Match([...near.map((r) => cfgOf(r, 0)), ...far.map((r) => cfgOf(r, 1))], { games: 3, golden: true }, (Math.random() * 1e9) | 0);
  demo.setControllers(all.map((r) => new AIController(r.skill)));
  demo.start();
  view.setMatch(demo, all.map((r) => RIVAL_KITS[r.id].kit));
  view.boardNames = [near.map(bugName).join(' / '), far.map(bugName).join(' / ')];
  view.boardFooter = BOARD_FOOTER;
  view.orbit = true;
  view.showTarget = false;
}

// ------------------------------------------------------------------ screens
/**
 * A screen over the court: `look` is its backdrop ('dim': darkened; 'home': the court left clear in the middle);
 * `cls`: more classes for it.
 */
function show(html: string, look: 'dim' | 'home' | 'clear' = 'dim', cls = ''): HTMLElement {
  screens.innerHTML = `<div class="screen ${look}${cls ? ' ' + cls : ''}">${html}</div>`;
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
/** a pair as the draw writes it: «Navarra / Chingoto» */
function pairName(p: Pair): string {
  return `${surname(p.a)} / ${surname(p.b)}`;
}

// ------------------------------------------------------------------ player cards (attributes 0 … 99)
/** a player's card: the CPU players' (Rival.attrs) and the human's (null: HUMAN_ATTRS), src/sim/attributes.ts */
const attrsOf = (r: Rival | null): Attributes => (r ? r.attrs : HUMAN_ATTRS);
/** a rating's band (the colour of its number and bar): 85+ · 75+ · 65+ · under */
const tier = (v: number) => (v >= 85 ? 't1' : v >= 75 ? 't2' : v >= 65 ? 't3' : 't4');
/** a pair's overall: the mean of its two players' */
const pairOverall = (a: Rival | null, b: Rival) => Math.round((overall(attrsOf(a)) + overall(attrsOf(b))) / 2);
/** the overall as a card shows it: the number big, «MED» / «OVR» under */
const ovrBox = (v: number) => `<span class="pc-ovr ${tier(v)}"><b>${v}</b><small>${t('card.ovr')}</small></span>`;
/** the CPU players and the human (null) by the cards' ids */
const byCard = (id: string): Rival | null => (id === 'hero' ? null : id === PARTNER.id ? PARTNER : RIVALS.find((r) => r.id === id) ?? null);

/**
 * A player's card, as a sports game shows it: the overall big, the name, the style, the seven attributes with their
 * numbers and bars (src/sim/attributes.ts), the kit's colour along the top. `full`: the whole card (the attributes'
 * names, the ranking and the line about the player); otherwise the compact one of the match card, a button that opens
 * the whole one.
 */
function playerCard(r: Rival | null, full = false): string {
  const a = attrsOf(r);
  const k = r ? kitOf(r.id) : HERO;
  const id = r ? r.id : 'hero';
  const rows = ATTR_KEYS.map((key) => {
    const v = Math.round(a[key]);
    return `<span class="pa ${tier(v)}"><span>${t(full ? `attr.${key}` : `attr.${key}.short`)}</span><i style="--v:${(v / 99).toFixed(3)}"></i><b>${v}</b></span>`;
  }).join('');
  const small = r ? r.name : t('tour.wildcard');
  const big = r ? surname(r) : t('you');
  const top = `<span class="pc-top">${ovrBox(overall(a))}<span class="pc-id"><small>${small}</small><b>${big}</b><span class="pc-st">${t('style.' + id)}</span></span>${full ? avatar(r) : ''}</span>`;
  if (!full) return `<button class="pcard" data-card="${id}" style="--tc:${k.css}" aria-label="${t('card.tap')}: ${r ? fullName(r) : t('you')}">${top}<span class="pc-attrs">${rows}</span></button>`;
  const info = r ? playerInfo(r) : t('tour.unranked');
  return `<div class="pcard full" style="--tc:${k.css}">${top}<p class="pc-tag"><span class="pc-info">${info}</span>${r ? t(r.tag) : t('card.youTag')}</p><span class="pc-attrs">${rows}</span></div>`;
}

/** A player's whole card over the screen (a tap anywhere closes it). */
function cardModal(host: HTMLElement, r: Rival | null) {
  const d = document.createElement('div');
  d.className = 'pc-modal';
  d.innerHTML = `<div class="pc-sheet">${playerCard(r, true)}<button class="btn ghost" data-a="close">${t('card.close')}</button></div>`;
  d.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.play('click');
    d.remove();
  });
  host.append(d);
}
/** the wordmark: PÁDEL, the tour (provisional brand) and the build */
function logo(): string {
  return `<div class="logo"><div class="w1">${brand()}</div><div class="tour"><i></i>${TOUR}<i></i></div><div class="sub">${t('title.sub')}</div></div>`;
}
/** a panel's header: back arrow, the event above the title */
function head(title: string, eyebrow = EVENT): string {
  return `<div class="ph"><button class="back" data-a="back" aria-label="${t('back')}">${ICON.back}</button><div class="pt"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2></div></div>`;
}

function menu() {
  mode = 'menu';
  bc.reset();
  audio.crowdBase = 0.4; // a murmur from the stands behind the menus
  audio.music('menu');
  hud.hidden = true;
  clearHint();
  banner.innerHTML = '';
  if (!demo) startDemo();
  const nextPair = PAIRS[Math.min(save.beatenPairs, PAIRS.length - 1)];
  // the next match of the draw: its round and the opponents
  const upNext = t('menu.nextMatch', { round: roundName(PAIRS.indexOf(nextPair), PAIRS.length), name: pairName(nextPair) });
  const item = (a: string, ic: string, label: string) => `<button data-a="${a}">${ic}<span>${label}</span>${ICON.chev}</button>`;
  const el = show(
    `<div class="home-top">${logo()}</div>
    <div class="menu-col">
      <button class="btn big primary play" data-a="play"><span class="pl"><b>${t('menu.play')}</b><small>${upNext}</small></span>${ICON.play}</button>
      <div class="menu-list">
        ${item('rivals', ICON.draw, t('menu.pairs'))}
        ${item('team', ICON.card, t('menu.team'))}
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
    const a = b.dataset.a;
    if (a === 'play') versusPair(nextPair);
    else if (a === 'rivals') pairLadder();
    else if (a === 'team') teamCards();
    else if (a === 'how') howTo();
    else if (a === 'settings') settings();
  });
}

/**
 * One match of the draw: its round, the opponent (seed, name, a line about them), how good they are (the pair's
 * overall) and where the player stands with it (won, next, or locked behind the round before).
 */
function drawRow(i: number, n: number, done: number, av: string, name: string, line: string, prev: string, ovr: number): string {
  const locked = i > done;
  const beaten = i < done;
  const cls = locked ? 'locked' : i === done ? 'next' : 'beaten';
  const st = beaten ? `<span class="ok">${ICON.check}${t('rivals.beaten')}</span>` : locked ? `<span class="lk">${ICON.lock}</span>` : `<span class="nx">${t('rivals.next')}</span>`;
  const sub = locked ? t('rivals.locked', { name: prev }) : line;
  return `<button class="rival ${cls}" data-i="${i}" ${locked ? 'disabled' : ''}>${av}<div class="rt"><div class="rd">${roundName(i, n)}</div><div class="nm">${name}</div><div class="tg">${sub}</div></div><div class="st">${st}${ovrChip(ovr)}</div></button>`;
}

/** a pair's overall in the draw: the number, «MED» / «OVR» beside it */
const ovrChip = (v: number) => `<span class="ovr-chip ${tier(v)}" aria-label="${t('card.ovrLong')} ${v}"><b>${v}</b><small>${t('card.ovr')}</small></span>`;

function pairLadder() {
  const n = PAIRS.length;
  const rows = PAIRS.map((p, i) => drawRow(i, n, save.beatenPairs, duo(p.a, p.b), `${seedTag(pairSeed(p))}${pairName(p)}`, t(p.tag), i ? pairName(PAIRS[i - 1]) : '', pairOverall(p.a, p.b))).join('');
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

function howTo() {
  // (each paragraph opens with its title in bold: the stylesheet sets it as the section's heading)
  const parts = ['how.1', 'how.2', 'how.8', 'how.7', 'how.9', 'how.4', 'how.3', 'how.5', 'how.6'].map((k, i) => `<section class="how-s"><span class="hn">${i + 1}</span><p>${t(k, { name: PARTNER.name })}</p></section>`).join('');
  const el = show(`<div class="panel how">${head(t('how.title'))}${miniCourt()}${parts}</div>`);
  el.querySelector('[data-a=back]')!.addEventListener('click', () => {
    audio.play('click');
    menu();
  });
}

/** Your pair: your card and Martín's, whole (from the menu; the match card opens them one at a time). */
function teamCards() {
  const o = pairOverall(null, PARTNER);
  const el = show(`<div class="panel team">${head(t('team.title'))}<div class="team-o">${ovrBox(o)}<span><b>${t('you')} / ${surname(PARTNER).toUpperCase()}</b><small>${t('tv.homePair')}</small></span></div><div class="pc-two">${playerCard(null, true)}${playerCard(PARTNER, true)}</div></div>`);
  el.querySelector('[data-a=back]')!.addEventListener('click', () => {
    audio.play('click');
    menu();
  });
}

/**
 * A small padel court diagram, seen from your end: the net, the service boxes, the glass (solid) and the mesh (dashed)
 * round it, the three aim zones on the far side and the two of you on the near side (you on the right, «drive»).
 */
function miniCourt(): string {
  const es = lang === 'es';
  // (the shot colours are the game's: chiquita cyan, drive white, lob violet; the court 10 × 20 m at 7 px a metre)
  const f = `font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700" letter-spacing=".06em"`;
  const L = 'rgba(255,255,255,.85)';
  const G = '#8fd8ff';
  const M = 'rgba(255,255,255,.4)';
  return `<svg class="court-mini" width="260" height="168" viewBox="0 0 260 168" aria-hidden="true">
    <rect x="95" y="14" width="70" height="140" fill="#1d4f8f"/>
    <line x1="95" y1="35.3" x2="165" y2="35.3" stroke="${L}" stroke-width="1.2"/>
    <line x1="95" y1="132.7" x2="165" y2="132.7" stroke="${L}" stroke-width="1.2"/>
    <line x1="130" y1="35.3" x2="130" y2="132.7" stroke="${L}" stroke-width="1.2"/>
    <line x1="91" y1="84" x2="169" y2="84" stroke="#05080c" stroke-width="3"/>
    <path d="M95 42 V14 H165 V42 M95 126 V154 H165 V126" fill="none" stroke="${G}" stroke-width="3"/>
    <path d="M95 42 V126 M165 42 V126" fill="none" stroke="${M}" stroke-width="2" stroke-dasharray="2 3"/>
    <circle cx="112" cy="76" r="5.5" fill="none" stroke="#5af0e8" stroke-width="2.5"/>
    <text x="88" y="80" text-anchor="end" fill="#5af0e8" font-size="11" ${f}>${es ? 'CHIQUITA' : 'CHIQUITA'}</text>
    <circle cx="146" cy="46" r="5.5" fill="none" stroke="#fff" stroke-width="2.5"/>
    <text x="172" y="50" fill="#fff" font-size="11" ${f}>DRIVE</text>
    <circle cx="124" cy="9" r="5" fill="none" stroke="#c49aff" stroke-width="2.5"/>
    <text x="88" y="13" text-anchor="end" fill="#c49aff" font-size="11" ${f}>${es ? 'GLOBO' : 'LOB'}</text>
    <text x="172" y="22" fill="${G}" font-size="10" ${f}>${es ? 'CRISTAL' : 'GLASS'}</text>
    <text x="172" y="88" fill="rgba(255,255,255,.6)" font-size="10" ${f}>${es ? 'MALLA' : 'MESH'}</text>
    <circle cx="112" cy="140" r="4.5" fill="#9aa3ad" stroke="#05080c" stroke-width="1.5"/>
    <text x="88" y="144" text-anchor="end" fill="#9aa3ad" font-size="10" ${f}>${PARTNER.name.toUpperCase()}</text>
    <circle cx="148" cy="140" r="4.5" fill="#d9f23f" stroke="#05080c" stroke-width="1.5"/>
    <text x="172" y="144" fill="#d9f23f" font-size="10" ${f}>${es ? 'TÚ' : 'YOU'}</text>
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
    ${row(t('set.games'), 'games', ([2, 3, 4, 6] as const).map((g) => [String(g), String(g), save.games === g] as [string, string, boolean]))}
    <p class="set-note">${t('set.gamesNote', { n: save.games })}</p>
    ${row(t('set.deuce'), 'golden', [['1', t('set.golden'), save.golden], ['0', t('set.adv'), !save.golden]], true)}
    <h3>${t('set.groupControl')}</h3>
    ${row(t('set.swing'), 'swing', [['assist', t('set.swingAssist'), save.swing === 'assist'], ['manual', t('set.swingManual'), save.swing === 'manual']], true)}
    ${row(t('set.assist'), 'assist', [['2', t('set.assistHigh'), save.assist === 2], ['1', t('set.assistMid'), save.assist === 1], ['0', t('set.assistOff'), save.assist === 0]])}
    ${onOff(t('set.recover'), 'recover', save.recover)}
    <h3>${t('set.groupScreen')}</h3>
    ${row(t('set.hud'), 'hud', [['min', t('set.hudMin'), save.hud === 'min'], ['full', t('set.hudFull'), save.hud === 'full']])}
    ${onOff(t('set.replays'), 'replays', save.replays)}
    <h3>${t('set.groupSound')}</h3>
    ${onOff(t('set.sound'), 'sound', save.sound)}
    ${onOff(t('set.music'), 'music', save.music)}
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
    } else if (k === 'music') {
      save.music = v === '1';
      audio.setMusic(save.music);
    } else if (k === 'replays') {
      save.replays = v === '1';
      bc.replays = save.replays;
    } else if (k === 'recover') save.recover = v === '1';
    else if (k === 'coach') save.coach = v === '1';
    else if (k === 'haptics') {
      save.haptics = v === '1';
      if (save.haptics) vibrate(20);
    } else if (k === 'games') save.games = Number(v) as Save['games'];
    else if (k === 'golden') save.golden = v === '1';
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

/**
 * The match card before a match: the event and round, and both pairs, each with its overall and the cards of its two
 * players (a tap on one opens it whole); the rivals' line, and the buttons.
 */
function versusPair(p: Pair) {
  mode = 'vs';
  pair = p;
  const i = PAIRS.indexOf(p);
  const n = PAIRS.length;
  /** one pair: its overall, its name and seed, its two cards */
  const team = (cls: string, a: Rival | null, b: Rival, name: string, info: string) =>
    `<div class="vt${cls}"><div class="vt-h">${ovrBox(pairOverall(a, b))}<span class="vt-n"><b>${name}</b><small>${info}</small></span></div><div class="vt-c">${playerCard(a)}${playerCard(b)}</div></div>`;
  const el = show(
    `<div class="vs-card">
    <div class="vs-head"><div class="eyebrow">${EVENT} · ${court()}</div><div class="vs-round">${roundName(i, n)}</div></div>
    <div class="vs-teams">${team(' me', null, PARTNER, `${t('you')} / ${surname(PARTNER)}`, t('tour.wildcard'))}<div class="x">VS</div>${team(' them', p.a, p.b, `${seedTag(pairSeed(p))}${pairName(p)}`, pairInfo(p))}</div>
    <div class="vs-tag">${t(p.tag)}</div>
    <div class="vs-go"><button class="btn big primary" data-a="go">${ICON.play}${t('vs.start')}</button><button class="btn ghost" data-a="back">${t('back')}</button></div>
  </div>`,
    'dim',
    'vs-screen',
  );
  onCard(el, () => startDoubles(p));
}
/** the match card's buttons: back to the menu; a card opens it whole; a tap anywhere else starts the match */
function onCard(el: HTMLElement, go: () => void) {
  el.addEventListener('click', (e) => {
    audio.unlock();
    const tg = e.target as HTMLElement;
    if (tg.closest('[data-a=back]')) {
      audio.play('click');
      return menu();
    }
    const c = tg.closest<HTMLElement>('[data-card]');
    if (c) {
      audio.play('click');
      return cardModal(el, byCard(c.dataset.card ?? ''));
    }
    audio.play('whoosh');
    bc.cinema = true;
    go();
  });
}

// ------------------------------------------------------------------ the match
const tut = { served: false, hit: false, kinds: 0, attack: false, block: false, shownKinds: false, moveShown: false, perfect: false };
/** points won «por 3» or «por 4» by each team (the end screen) */
const por34: [number, number] = [0, 0];
/**
 * The hint line at the bottom (auditoría 04, M1): one hint at a time, each up at least HINT_MIN s before another one
 * (or nothing) takes its place, so none is gone before it can be read. A hint asked for while the line is busy waits
 * its turn (the most important one asked for; the newest of equals); a hint about the ball coming now (PRIO.ball) goes
 * before a general one waiting, and is only asked for when the line is free (later it would be about another ball).
 * `hintKey`: the hint on screen.
 */
const HINT_MIN = 2.5;
const PRIO = { general: 1, ball: 2 } as const;
let hintKey = '';
/** the hint on screen: since when, and when it goes (0: when another one comes) */
const hintOn = { at: 0, until: 0 };
let hintNext: { k: string; sec: number; tip: boolean; prio: number } | null = null;
/** Could a hint of this priority take the line now? (nothing on screen or it has had its time; none more important waiting) */
function hintFree(prio: number = PRIO.general): boolean {
  if (hintNext && hintNext.prio > prio) return false;
  return !hintKey || performance.now() - hintOn.at >= HINT_MIN * 1000;
}
/** The hint line: a tutorial step (a touch icon), or a tip between points (`tip`: an info icon, a gold edge). */
function showHint(k: string, sec: number, tip: boolean) {
  hintKey = k;
  hintOn.at = performance.now();
  hintOn.until = sec ? hintOn.at + sec * 1000 : 0;
  hint.hidden = !k;
  hint.classList.toggle('tip', tip);
  if (k) hint.innerHTML = `<span class="${tip ? 'bulb' : 'hand'}">${tip ? ICON.info : ICON.tap}</span>${t(k)}`;
}
/**
 * A hint for `sec` s (0: until another one), now if the line is free, otherwise when it is. '' lets the hint on screen
 * go once it has had its time.
 */
function setHint(k: string, sec = 0, tip = false, prio: number = PRIO.general) {
  if (!k) {
    if (hintKey) hintOn.until = Math.min(hintOn.until || Infinity, performance.now());
    return;
  }
  if (k === hintKey) return;
  if (hintFree(prio)) {
    hintNext = null;
    showHint(k, sec, tip);
  } else if (!hintNext || prio >= hintNext.prio) hintNext = { k, sec, tip, prio };
}
/** The player did what the hints starting with `k` ask: the one on screen goes (after its time), a waiting one never comes. */
function doneHint(k: string) {
  if (hintNext?.k.startsWith(k)) hintNext = null;
  if (hintKey.startsWith(k)) setHint('');
}
/** The hint line cleared at once, and nothing waiting (a new match, the end of one). */
function clearHint() {
  hintNext = null;
  showHint('', 0, false);
}
/** Every frame: the hint on screen goes when its time is up (never before HINT_MIN), the one waiting comes in. */
function hintTick() {
  const now = performance.now();
  if (hintKey && hintOn.until && now >= Math.max(hintOn.until, hintOn.at + HINT_MIN * 1000)) {
    showHint('', 0, false);
  }
  if (hintNext && hintFree(hintNext.prio)) {
    const n = hintNext;
    hintNext = null;
    showHint(n.k, n.sec, n.tip);
  }
}
/**
 * A first-time hint (0.3: the power of the gesture, the bajada, the por 3 / por 4 chance): shown once ever, in any
 * match (not only the first one: players of 0.2 get them too), in its keyboard wording without a touch screen. Only
 * when the line is free for it (otherwise it waits for another ball: it is not spent).
 */
function onceHint(k: string, sec: number, prio: number = PRIO.general): boolean {
  if (save.seen.includes(k) || !hintFree(prio) || hintNext) return false;
  save.seen.push(k);
  persist();
  setHint(isTouch ? k : `${k}Keys`, sec, false, prio);
  return true;
}

/** the TV's home team: «TÚ» (and «RUIZ») in the bug, the full names on the strap, a wild card */
const home = (bug: string[], full: string[]): TeamInfo => ({ names: bug, full, color: HERO.css, ink: HERO.ink, badge: 'WC', info: t(bug.length > 1 ? 'tv.homePair' : 'tv.home') });
/** the umpire's names by player id (the surnames, as in the bug: «Saca Vidal») */
let callNames: string[] = [];

/** The human and Martín (near side; the human plays the right, «drive», and serves first) against a pair. */
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
    round: `${roundName(i, PAIRS.length)} · ${court()}`,
  };
  callNames = tv.names;
  begin(
    [cfgOf(PARTNER, 0), cfgOf(p.a, 1), cfgOf(p.b, 1)],
    [new AIController(PARTNER.skill), new AIController(p.a.skill), new AIController(p.b.skill)],
    [PARTNER_KIT.kit, RIVAL_KITS[p.a.id].kit, RIVAL_KITS[p.b.id].kit],
    [`${t('you')} / ${bugName(PARTNER)}`, `${bugName(p.a)} / ${bugName(p.b)}`],
    [t('you'), PARTNER.name, p.a.name, p.b.name],
    tv,
  );
}

/** A match: the human (player 0, near side) plus the CPU players given. */
function begin(cfgs: PlayerCfg[], ctls: Controller[], kits: Kit[], board: [string, string], who: string[], tv: BroadcastSetup) {
  mode = 'play';
  audio.music('none');
  paused = false;
  clearScreens();
  demo = null;
  view.orbit = false;
  input.clear();
  // the player serves first (control from the first second): a seed whose toss goes to the near team
  let seed = (Math.random() * 1e9) | 0;
  while (new Rng(seed).next() >= 0.5) seed = (seed + 1) | 0;
  match = new Match([{ team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 }, ...cfgs], rules(), seed);
  applyControls();
  match.setControllers([human, ...ctls]);
  match.start();
  view.setMatch(match, [HERO.kit, ...kits], true);
  view.boardNames = board;
  setFooter(BOARD_FOOTER);
  names = who;
  explainer.names = who;
  explainer.reset();
  view.showTarget = true;
  hud.hidden = false;
  // the TV intro: a flight over the court with the names (the match waits; a tap skips it)
  bc.begin(match, tv);
  tut.served = tut.hit = tut.attack = tut.block = tut.shownKinds = tut.moveShown = tut.perfect = false;
  por34[0] = por34[1] = 0;
  input.clearStick();
  clearHint();
}

/** the broadcast score bug (teams, score, serve; it animates the side that scored) */
function renderHud(scored: 0 | 1 | null = null) {
  if (!match) return;
  bc.renderBug(match, true, scored);
}

/** a tip in the pause, a different one each time (the timing ring first: with the minimal indicators it only shows
 * while you aim, so a player who never aims may not know it) */
const TIPS = ['tip.ring', 'tip.attack', 'tip.power', 'tip.walls', 'tip.bajada', 'tip.tap', 'tip.block', 'tip.por3', 'tip.lob'];
/** the tips with their own wording for the keyboard (`Keys`) */
const KEYED = new Set(['tip.ring', 'tip.tap', 'tip.attack', 'tip.block', 'tip.power', 'tip.bajada', 'tip.por3']);
let tipNo = 0;
function pause() {
  if (mode !== 'play' || paused) return;
  paused = true;
  input.clear();
  const k = TIPS[tipNo++ % TIPS.length];
  const tip = t(!isTouch && KEYED.has(k) ? `${k}Keys` : k);
  // the match as it stands: the games, and the points of the game under them
  const m = match;
  let where = '';
  const tv = bc.teams;
  if (m && tv)
    where = `<div class="pause-score"><span>${tv[0].names.join(' / ')}</span><b>${m.games[0]}</b><i></i><b>${m.games[1]}</b><span>${tv[1].names.join(' / ')}</span></div><div class="pause-pts">${t(m.tiebreak ? 'tv.tiebreak' : 'tv.points')} <b>${m.pointText(0)}-${m.pointText(1)}</b></div>`;
  const el = show(
    `<div class="panel pause">
    <div class="eyebrow">${bc.round || EVENT}</div><h2>${t('pause.title')}</h2>${where}
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
function showBanner(main: string, cls: string, sub = '', why = '', who = '') {
  const w = why ? `<span class="why">${why.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</span>` : '';
  // (`who`: whose point it is, a small line over the reason: the colour alone does not say it, auditoría 04 B1)
  const h = who ? `<span class="who">${who}</span>` : '';
  banner.innerHTML = `<div class="b1 ${cls}${w ? ' has-why' : ''}">${h}${main}${w}</div>${sub ? `<div class="b2">${sub}</div>` : ''}`;
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
/** the shots over the head: the human's always get their name after the hit */
const OVERHEAD = new Set<ShotKind>(['smash', 'vibora', 'bandeja', 'bajada']);
/**
 * A word over the hitter's head (never on the ball), small and quick (`sub`: a smaller word under it; `long`: up a
 * little longer, a shot's name to read).
 */
function floater(text: string, cls: string, x: number, y: number, sub = '', long = false) {
  const d = document.createElement('div');
  d.className = `fl ${cls}${long ? ' long' : ''}`;
  d.textContent = text;
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    d.append(s);
  }
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  fxLayer.appendChild(d);
  setTimeout(() => d.remove(), long ? 1200 : 800);
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
  if (e.type === 'hit') view.onHit(e.pid, e.x, e.y, e.z, m.t, m.players[e.pid].lastHit?.hand ?? 1);
  // (why the point ended: the explainer follows every event of the live match)
  const why = live ? explainer.event(m, e) : null;
  // reactions: the winners cheer, the losers hang their head (also in the attract match)
  const reacts = e.type === 'point' ? view.onPoint(m, e) : [];
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
      // (the last point's tag, or the fault's, gives way to the umpire's call: it says «second serve» itself)
      clearBanner();
      // the umpire calls the score (and who serves) with a chime; the camera frames the server
      const name = callNames[e.server] ?? names[e.server];
      const who = m.serveNum === 2 ? (me ? t('hud.youServe2') : t('hud.serves2', { name })) : me ? t('hud.youServe') : t('hud.serves', { name });
      bc.onEvent(m, e, { matchPoint: matchPoint(m), who });
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
      const big = e.kind === 'smash' || e.kind === 'vibora' || e.kind === 'bajada';
      // the paddle's pock: by the kind of shot, how hard it was meant (the gesture) and how fast it leaves, placed where
      // it happened; a remate going for «por 3» / «por 4» has its own crack
      audio.paddle(e.kind, e.speed, panOf(e.x, e.y, e.z), farOf(e.z), e.timing === 'perfect' && p.human, e.power ?? 0.5, e.special ?? null);
      bc.onEvent(m, e);
      view.hitFx(e.x, e.y, e.z, e.timing === 'perfect' && p.human, big ? 1 : power);
      if (p.human) {
        // over the head, not on the ball: PERFECT (gold), early or late (the manual swing), and in the full
        // indicators the kind of an aimed shot; the automatic shot is the quiet default, and the serve's label came
        // with the release
        // (a remate going for «por 3» / «por 4» always says so, in gold: the gesture was read; any shot over the head
        // says which one came out, also with the minimal indicators, its timing under it: auditoría 04, M2)
        const over = OVERHEAD.has(e.kind);
        const timed = e.timing === 'perfect' || e.timing === 'early' || e.timing === 'late';
        const lbl = e.special ? t('kind.' + e.special) : over ? t('kind.' + e.kind) : e.timing === 'good' ? (save.hud === 'full' ? t('kind.' + e.kind) : '') : e.timing === 'auto' ? '' : t('timing.' + e.timing);
        if (lbl && e.kind !== 'serve') {
          // beside the head, away from the paddle side (where the ball leaves from)
          const sp = view.toScreen(p.x, 2.1, p.z);
          const paddle = view.toScreen(e.x, e.y, e.z).x >= sp.x ? 1 : -1;
          const cls = e.special || (over && e.timing === 'perfect') ? 'perfect' : over ? 'shot' : e.timing;
          floater(lbl, cls, sp.x - paddle * 30 * ui, sp.y, (e.special || over) && timed ? t('timing.' + e.timing) : '', !!e.special || over);
        }
        if (e.special) {
          view.shake = 0.35;
          doFlash(0.12);
        }
        buzz(e.timing === 'perfect' ? [16, 34, 26] : e.timing === 'auto' ? 9 : 14);
        if (e.timing === 'perfect') {
          doFlash(0.1);
          tut.perfect = true;
        }
        // the contact lands: a perfect swing (a soft one barely), a smash
        if (e.timing === 'perfect' && e.kind !== 'serve') freeze(e.kind === 'dink' || e.kind === 'drop' ? 0.03 : 0.06);
        else if (e.special) freeze(0.07);
        else if (big) freeze(0.045);
        if (e.kind === 'serve') {
          tut.served = true;
          doneHint('tut.serve');
        } else if (e.timing !== 'auto') {
          tut.hit = true;
          tut.kinds++;
          doneHint('tut.hit');
          if (!save.tutorial && tut.kinds === 2 && !tut.shownKinds) {
            tut.shownKinds = true;
            setHint('tut.kinds', 6);
          } else if (tut.kinds >= 3 && hintKey === '') onceHint('tut.power', 6);
        }
      } else if (big || e.special) {
        view.shake = e.special ? 0.35 : 0.3;
        freeze(e.special ? 0.06 : 0.045);
      }
      break;
    }
    case 'bounce':
      audio.courtBounce(e.first ? 0.75 : 0.4, panOf(e.x, 0, e.z), farOf(e.z));
      view.bounceFx(e.x, e.z, e.good);
      // (a ball just in: the stands' "ooh" says it, no toast)
      bc.onEvent(m, e);
      break;
    case 'net':
      if (e.tape) {
        audio.play('tape');
        if (save.hud === 'full') toast(t('hud.tape'));
      } else {
        audio.play('net');
        view.netFx();
      }
      bc.onEvent(m, e);
      break;
    case 'wall':
      // the glass: a deep thud; the mesh: a metallic rattle (louder the harder it comes)
      audio.wall(e.surface, Math.min(1, e.speed / 18), panOf(e.x, e.y, e.z), farOf(e.z));
      bc.onEvent(m, e);
      break;
    case 'fault': {
      // a serve fault: «FALTA» and, the first time, the second serve
      const me = m.players[e.pid].team === 0;
      audio.play('fault');
      if (e.second) showBanner(t('fault.title'), 'warn', t('fault.' + e.fault) + ' · ' + t('fault.second'));
      buzz(me ? 20 : 8);
      bc.onEvent(m, e);
      break;
    }
    case 'let':
      showBanner(t('let.title'), 'warn', t('let.sub'));
      bc.onEvent(m, e);
      break;
    case 'point': {
      const mine = e.winner === 0;
      let main: string;
      // from the player's side: our winner, their clean winner, a ball we did not reach or let go
      if (e.reason === 'winner' || e.reason === 'miss' || e.reason === 'letGo') main = mine ? t('reason.winner') : e.reason === 'winner' ? t('reason.winnerThem') : t('reason.' + e.reason);
      // (the ball hit a player of the receiving team: you, or someone else)
      else if (e.reason === 'body') main = t(e.touched !== undefined && m.players[e.touched]?.human ? 'reason.bodyMe' : 'reason.body');
      else main = t('reason.' + e.reason);
      // (0.8 explained every point in a second line and gave tips; Germán, 10 oct: «no tiene mucho sentido». The
      // explainer still runs: its lines are kept for the captures and the bots, window.__pb.why)
      lastWhy = why?.text ?? '';
      // the shot that decided it, by name (a winning bajada, víbora or remate; «por 3» and «por 4» have their own
      // reasons), and a remate going for por 3 / por 4 that ended in an error says so under the reason
      const call = explainer.callout(e);
      if (call?.shout) main = t(call.shout);
      const them = bc.teams?.[1]?.names.join(' / ') ?? '';
      showBanner(main, mine ? 'good' : 'bad', call?.failed ? t(`shout.${call.failed}Miss`) : '', '', mine ? t('point.us') : them ? t('point.them', { name: them }) : t('point.themShort'));
      if (e.reason === 'exit' || e.reason === 'back') {
        por34[e.winner]++;
        if (mine) doFlash(0.22);
      }
      audio.play(mine ? 'point' : 'lost');
      buzz(mine ? [12, 40, 12] : e.fault === 0 ? 45 : 25);
      // (a double fault's sound came with its fault)
      if (e.reason === 'twoBounce') audio.play('fault');
      // the stands, the reaction shot and maybe a replay; then the bug flips the side that scored
      bc.onEvent(m, e, { reacts });
      renderHud(e.winner);
      input.clear();
      break;
    }
    case 'game':
      // the game (or the tie-break) won: the bug shows the games, a strap says it
      renderHud(e.winner);
      bc.onEvent(m, e);
      break;
    case 'over': {
      const won = e.winner === 0;
      // (the victory strap has the bottom of the screen)
      clearHint();
      audio.play(won ? 'win' : 'lose');
      // the end screen comes after the victory shot (bc.onEnd)
      bc.onEvent(m, e);
      break;
    }
  }
}

/** the last point's explanation (src/explain.ts), for the captures */
let lastWhy = '';

/** Would the point about to be played win the match for either team? */
function matchPoint(m: Match): boolean {
  return ([0, 1] as const).some((k) => wouldWinGame(m, k) && wouldWinSet(m, k));
}
/** Would team k win the game (or tie-break) by winning the next point? */
function wouldWinGame(m: Match, k: 0 | 1): boolean {
  const a = m.points[k] + 1;
  const b = m.points[k === 0 ? 1 : 0];
  if (m.tiebreak) return a >= 7 && a - b >= 2;
  if (m.rules.golden) return a >= 4;
  return a >= 4 && a - b >= 2;
}
/** Would team k win the set (the match) by winning the next game? */
function wouldWinSet(m: Match, k: 0 | 1): boolean {
  if (m.tiebreak) return true;
  const g = m.games[k] + 1;
  return g >= m.rules.games && g - m.games[k === 0 ? 1 : 0] >= 2;
}

function endScreen(m: Match, won: boolean) {
  if (match !== m || mode !== 'play') return;
  mode = 'end';
  audio.music('menu');
  hud.hidden = true;
  clearHint();
  clearBanner();
  const n = PAIRS.length;
  const i = PAIRS.indexOf(pair);
  if (won && i === save.beatenPairs) save.beatenPairs = Math.min(n, save.beatenPairs + 1);
  save.tutorial = true;
  save.played = Math.min(99, save.played + 1);
  persist();
  const hasNext = won && i + 1 < n;
  const s = m.stats;
  const allDone = won && i === n - 1;
  // your own perfect shots and errors, the team's winners, and your partner's errors
  // the final score as the broadcast shows it: both teams, the winner's row lit, the games of the set
  const tv = bc.teams;
  const team = (k: 0 | 1) => {
    const c = k === 0 ? HERO.css : kitOf(pair.a.id).css;
    const nm = tv ? tv[k].names.join(' / ') : k === 0 ? t('you') : '';
    const w = m.winner === k;
    return `<div class="fr${w ? ' w' : ''}"><i style="background:${c}"></i><span class="nm">${nm}</span>${w ? `<span class="wk">${ICON.check}</span>` : ''}<span class="sc">${m.games[k]}</span></div>`;
  };
  const stat = (label: string, v: number) => `<div class="sr"><span>${label}</span><b>${v}</b></div>`;
  const el = show(
    `<div class="end"><div class="end-a">
    <div class="eyebrow">${roundName(i, n)} · ${EVENT}</div>
    <div class="result ${won ? 'win' : 'lose'}">${won ? t('end.win') : t('end.lose')}</div>
    <div class="final-board">${team(0)}${team(1)}</div>
    ${allDone ? `<div class="champ">${ICON.trophy}<span>${t('end.ladderDoubles', { name: PARTNER.name })}</span></div>` : ''}
    </div><div class="end-b">
    <div class="stats"><h3>${t('end.stats')}</h3>
      ${stat(t('end.perfect'), s.perfectBy[0])}
      ${stat(t('end.winners'), s.winners[0])}
      ${stat(t('end.errors'), s.errorsBy[0])}
      ${stat(t('end.errorsPartner', { name: PARTNER.name }), s.errorsBy[1])}
      ${stat(t('end.por34'), por34[0])}
      ${stat(t('end.longest'), s.longest)}
    </div>
    <div class="btn-col">
      ${hasNext ? `<button class="btn primary" data-a="next">${t('end.nextPair')}<small>${roundName(i + 1, n)}</small></button>` : ''}
      <button class="btn ${hasNext ? 'ghost' : 'primary'}" data-a="again">${t('end.rematch')}</button>
      <button class="btn ghost" data-a="menu">${t('end.menu')}</button>
    </div></div></div>`,
  );
  el.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a;
    if (!a) return;
    audio.play('click');
    bc.reset();
    if (a === 'next') versusPair(PAIRS[i + 1]);
    else if (a === 'again') versusPair(pair);
    else {
      match = null;
      menu();
    }
  });
}

// ------------------------------------------------------------------ per-frame overlays (aim, timing ring, stick)
// One visual language: thin rings with a dark edge (readable on the bright court), small dark pills for words, and
// the colours of view.ts (HUE): lime you / in reach, gold perfect, red too late, grey out. Nothing is bigger than
// it needs to be, nothing sits on the ball, and with the minimal indicators (the default) only what is needed to play
// is drawn: the timing ring while you aim (always with the manual swing), the aim, the stick.
const ringOuter = document.createElement('div');
ringOuter.className = 'ring outer';
const ringTarget = document.createElement('div');
ringTarget.className = 'ring target';
const chip = document.createElement('div');
chip.className = 'chip';
// the shot's name, and before it (while the timing ring is on) a small copy of the ring: the big one is on the ball,
// which comes down the screen to your player, under the right thumb (auditoría 04, A3); this one is where you look
chip.innerHTML = '<span class="mr"><i></i></span><span class="cl"></span>';
const chipRing = chip.firstElementChild as HTMLElement;
const chipText = chip.lastElementChild as HTMLElement;
/** over the head, while you aim: what each flick would play (auditoría 04, M2), under the shot's name */
const fan = document.createElement('div');
fan.className = 'fan';
fan.setAttribute('aria-hidden', 'true');
/** «¡Atácala!»: beside the player when the coming ball sits up (never on the ball) */
const cueChip = document.createElement('div');
cueChip.className = 'chip';
cueChip.setAttribute('aria-hidden', 'true');
const stickBase = document.createElement('div');
stickBase.className = 'stick-base';
const stickKnob = document.createElement('div');
stickKnob.className = 'stick-knob';
stickBase.hidden = stickKnob.hidden = chip.hidden = cueChip.hidden = fan.hidden = true;
fxLayer.append(ringOuter, ringTarget, chip, fan, cueChip, stickBase, stickKnob);
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

/** a box on screen: left, top, right, bottom (px) */
type Box = [number, number, number, number];
/** how much two boxes share (px²) */
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
/** where the opponents stand on screen (the chip keeps off them) */
function rivalsOnScreen(m: Match, team: 0 | 1): Box[] {
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
/**
 * The shot's name beside the landing mark (never on it), on the side away from the opponents and the edges (`timed`:
 * with the small timing ring before it). Returns where it went (left, top, width).
 */
function placeChip(m: Match, team: 0 | 1, x: number, y: number, text: string, color: string, timed: boolean, avoid: Box[]): [number, number, number] {
  if (chipText.textContent !== text) chipText.textContent = text;
  chip.style.color = color;
  chip.classList.toggle('timed', timed);
  const wk = timed ? `${text}\u0001` : text;
  let w = chipW.get(wk);
  if (w === undefined) {
    w = chip.offsetWidth;
    chipW.set(wk, w);
  }
  const h = 20 * ui;
  const gap = 14 * ui;
  const top = y - h / 2;
  const boxes = [...rivalsOnScreen(m, team), ...avoid];
  const W = window.innerWidth;
  const bad = (x0: number) => x0 < 4 || x0 + w! > W - 4 || boxes.some((b) => x0 < b[2] && x0 + w! > b[0] && top < b[3] && top + h > b[1]);
  let x0 = x + gap;
  if (bad(x0) && !bad(x - gap - w)) x0 = x - gap - w;
  x0 = Math.max(4, Math.min(W - w - 4, x0));
  chip.style.transform = `translate(${x0.toFixed(1)}px, ${top.toFixed(1)}px)`;
  return [x0, top, w];
}

/**
 * The small timing ring in the shot's name: the same closing (k: 1 far from the contact … 0 at the ideal release) and
 * the same colours as the big one.
 */
function drawChipRing(k: number, cls: string) {
  chipRing.style.setProperty('--r', Math.max(0, Math.min(1, k)).toFixed(3));
  const c = `mr${cls}`;
  if (chipRing.className !== c) chipRing.className = c;
}

/**
 * Over the head (auditoría 04, M2): what each gesture plays on this ball, as the swing will read it (brain.ts,
 * kindForAim, the same rules): a flick straight up, at full power, bent to a side, down towards you. Only the ones that
 * differ from the plain release (the shot's name already says that one), each once.
 */
function overheadOptions(m: Match, me: Player, plan: Plan): [string, string][] {
  const name = (k: { kind: ShotKind; special?: Special }) => t('kind.' + (k.special ?? k.kind));
  const base = name(kindForAim(m, me, plan, AIM_D0, false, false, 0, { power: 0.5 }));
  const touch = isTouch;
  const opts: [string, string][] = [
    [touch ? '↑' : 'F', name(kindForAim(m, me, plan, AIM_D0, false, true, 0, { power: 0.75 }))],
    [touch ? '⇈' : t('fan.hold'), name(kindForAim(m, me, plan, AIM_D0, false, true, 0, { power: 1 }))],
    ...(touch ? [['↖↗', name(kindForAim(m, me, plan, AIM_D0, false, true, ATTACK.bend, { power: 0.75 }))] as [string, string]] : []),
    [touch ? '↓' : '⇧F', name(kindForAim(m, me, plan, AIM_D0, false, false, 0, { down: true, power: 0.75 }))],
  ];
  const seen = new Set([base]);
  return opts.filter(([, n]) => !seen.has(n) && !!seen.add(n));
}
let fanKey = '';
/**
 * The options by the shot's name (`chip`: its box; aligned on its left edge, or its right one when the name sits left
 * of its mark): under it, or over it when that covers less of the opponents and the timing ring (`avoid`).
 */
function placeFan(opts: [string, string][], chipBox: Box, alignRight: boolean, avoid: Box[]) {
  const key = opts.map((o) => o.join(' ')).join('|');
  fan.hidden = false;
  if (key !== fanKey) {
    fanKey = key;
    fan.innerHTML = opts.map(([g, n]) => `<span><b>${g}</b>${n}</span>`).join('');
  }
  const w = fan.offsetWidth;
  const h = fan.offsetHeight;
  const x0 = Math.max(4, Math.min(window.innerWidth - w - 4, alignRight ? chipBox[2] - w : chipBox[0]));
  const gap = 3 * ui;
  const cost = (y: number) => (y < 4 ? 1e9 : avoid.reduce((a, b) => a + overlap([x0, y, x0 + w, y + h], b), 0));
  const below = chipBox[3] + gap;
  const above = chipBox[1] - gap - h;
  const y = cost(above) < cost(below) ? above : below;
  fan.style.transform = `translate(${x0.toFixed(1)}px, ${y.toFixed(1)}px)`;
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
  /** the timing ring's state this frame (k: 1 open … 0 closed, its colour class), for its copy in the shot's name */
  let timing: { k: number; cls: string } | null = null;
  /** where the ball's timing ring is drawn (the shot's name and the options keep off it) */
  const avoid: Box[] = [];
  // the timing ring: closes on the ball as it comes, gold in the perfect window, red too late or an illegal volley
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
        timing = { k, cls };
        avoid.push([sp.x - size / 2, sp.y - size / 2, sp.x + size / 2, sp.y + size / 2]);
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
  // the serve's pulse around the ball in the hand (smallest, and gold, at the best moment; minimal: while you aim, and
  // faint before that until the first serve of the first match: its hint speaks of it, auditoría 04 B2)
  const teachServe = !full && !input.active && !save.tutorial && !tut.served;
  if (m.phase === 'serve' && m.server() === me && !m.windup && (full || input.active || teachServe)) {
    const c = human.contactPoint(m, me, null);
    const sp = view.toScreen(c.x, c.y + 0.25, c.z);
    const s = servePulse(m.t);
    const cls = s < 0.26 ? ' gold' : '';
    drawRing(sp.x, sp.y, (RING_MIN + s * (RING_MAX - RING_MIN)) * ui, cls, teachServe ? 0.45 : 1);
    ringOn = true;
    timing = { k: s, cls };
  }
  // aiming: the landing mark and the arc are drawn on the court (view.aim); the shot's name beside the mark, with the
  // small copy of the timing ring; over the head, under it, what each flick would play
  let fanOn = false;
  if (input.active && (m.phase === 'serve' ? m.server() === me : m.phase === 'rally')) {
    const plan = hp?.plan ?? null;
    // (an attack key held, F or the right button: its power grows with the hold, and over a high ball near the net
    // the preview is the remate por 3, or with Shift the por 4)
    const rally = m.phase === 'rally';
    const keyed = rally && (input.attackHeld || input.downHeld);
    const pw = keyed ? input.powerNow() : 0.5;
    const a = human.aim(m, me, plan, input.dx, input.dy, input.attackHeld && rally, 0, { power: pw, down: rally && input.downHeld });
    view.aim = { x: a.x, z: a.z, kind: a.kind, ok: a.ok, from: human.contactPoint(m, me, plan), clear: a.clear, pace: a.pace };
    const sp = view.toScreen(a.x, 0, a.z);
    chip.hidden = false;
    const [cx, cy, cw] = placeChip(m, me.team, sp.x, sp.y, !a.ok ? t('aim.out') : a.special ? t('kind.' + a.special) : t('kind.' + a.kind), cssHue(aimHue(a.kind, a.ok)), !!timing, avoid);
    if (timing) drawChipRing(timing.k, timing.cls);
    // the power of the held key, a bar under the shot's name (a finger's is the speed of its flick: known at the lift)
    chip.classList.toggle('pw', keyed);
    if (keyed) chip.style.setProperty('--pw', Math.min(1, pw).toFixed(2));
    if (rally && plan && plan.overhead && plan.reach && !keyed && m.rally && m.rally.shots > 1) {
      const opts = overheadOptions(m, me, plan);
      if (opts.length) {
        fanOn = true;
        placeFan(opts, [cx, cy, cx + cw, cy + 20 * ui], cx + cw / 2 < sp.x, [...rivalsOnScreen(m, me.team), ...avoid, [sp.x - 8, sp.y - 8, sp.x + 8, sp.y + 8]]);
      }
    }
  } else {
    view.aim = null;
    chip.hidden = true;
  }
  fan.hidden = !fanOn;
  ringOuter.hidden = ringTarget.hidden = !ringOn;
  if (ringThin) ringTarget.hidden = true;
  // the stick under the left thumb: a thin ring and a small knob that shows the push (drawn small: the thumb
  // covers it anyway; fainter still over your partner or yourself, auditoría 04 B3)
  if (input.stickBase) {
    stickBase.hidden = stickKnob.hidden = false;
    const r = STICK_DRAW * ui;
    const bx = input.stickBase.x;
    const by = input.stickBase.y;
    const dim = overTeam(m, me.team, bx, by, r);
    stickBase.classList.toggle('dim', dim);
    stickKnob.classList.toggle('dim', dim);
    stickBase.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -50%)`;
    stickKnob.style.transform = `translate(${(bx + input.stickX * r).toFixed(1)}px, ${(by + input.stickY * r).toFixed(1)}px) translate(-50%, -50%)`;
  } else stickBase.hidden = stickKnob.hidden = true;
  // tutorial: move, swing
  const incoming = m.phase === 'rally' && m.rally?.last && m.rally.last.team !== me.team;
  if (!save.tutorial && incoming && !input.moved && !tut.moveShown && hintKey === '' && !hintNext) {
    tut.moveShown = true;
    setHint(isTouch ? 'tut.move' : 'tut.moveKeys');
  }
  // (once the stick is used, the move hint goes a moment later: hintTick keeps it up its HINT_MIN anyway)
  if (hintKey.startsWith('tut.move') && input.moved && !hintOn.until) hintOn.until = performance.now() + 1500;
}

/** what the coming ball asks for (brain.ts, ballCue): attack it, block it, a bajada off the back glass, or nothing */
type Cue = 'attack' | 'block' | 'bajada' | null;
/** debug (captures): the cue shown whatever the ball (window.__pb.forceCue) */
let forceCue: Cue = null;
/**
 * A ball over the head, high and near the net, that can go «por 3» (brain.ts, specialOk: the same test the swing
 * uses): the first one gets its hint. Read from the circle, or from the contact in reach.
 */
function por3Chance(m: Match, me: Player): boolean {
  const plan = m.targetFor(me.id) ?? me.plan;
  return !!plan && plan.overhead && specialOk('por3', plan);
}
/**
 * What the coming ball asks for (brain.ts, ballCue): an attack (it sits up: the circle and the ring at the feet go
 * orange, «¡Atácala!» beside the player for a moment and a light double tick), a bajada (it comes back high off the
 * back glass: the circle and the ring go pink, «BAJADA» beside the player, the same tick) or a block (an attack at
 * you: the timing ring shows, tap on its gold). Once shown it stays for the ball, unless it is gone for a moment (the
 * contact was refined away from it); it goes as soon as the ball is played.
 */
const cueNow = { key: '', kind: null as Cue, at: 0, lost: 0, buzzed: false };
function ballCue(m: Match, me: Player, dt: number) {
  const r = m.rally;
  const incoming = !!forceCue || (m.phase === 'rally' && !!r?.last && r.last.team !== me.team);
  const key = `${m.stats.rallies}:${r?.shots ?? 0}`;
  if (cueNow.key !== key || !incoming) {
    cueNow.key = key;
    cueNow.kind = null;
    cueNow.buzzed = false;
  }
  const raw = forceCue ?? (incoming ? human.cue(m, me) : null);
  if (raw) {
    if (cueNow.kind !== raw) {
      cueNow.kind = raw;
      cueNow.at = m.t;
    }
    cueNow.lost = 0;
  } else if (cueNow.kind && (cueNow.lost += dt) > 0.15) cueNow.kind = null;
  const attack = cueNow.kind === 'attack';
  const bajada = cueNow.kind === 'bajada';
  // (the circle and the ring at the feet: orange to attack, pink for a bajada)
  view.cue = cueNow.kind;
  if ((attack || bajada) && !cueNow.buzzed) {
    cueNow.buzzed = true;
    buzz([6, 28, 6]);
  }
  // the word: beside the player (the side away from the ball), small, for a moment, gone once he aims
  const show = (attack || bajada) && !input.active && m.t - cueNow.at < 1.1;
  cueChip.hidden = !show;
  if (show) {
    const txt = t(bajada ? 'cue.bajada' : 'cue.attack');
    if (cueChip.textContent !== txt) cueChip.textContent = txt;
    cueChip.style.color = cssHue(aimHue(bajada ? 'bajada' : 'speedup', true));
    const head = view.toScreen(me.x, 1.7, me.z);
    const b = m.ballPos();
    const away = b && view.toScreen(b.x, b.y, b.z).x > head.x ? -1 : 1;
    const w = cueChip.offsetWidth || 80;
    const x = Math.max(4, Math.min(window.innerWidth - w - 4, away > 0 ? head.x + 26 * ui : head.x - 26 * ui - w));
    cueChip.style.transform = `translate(${x.toFixed(1)}px, ${(head.y - 10 * ui).toFixed(1)}px)`;
  }
  // the tutorial: the first ball to attack, the first attack to block (they take over from the general hints and from
  // each other: they are about the ball coming now)
  const general = hintKey === '' || hintKey === 'tut.kinds' || hintKey === 'tut.hit' || hintKey === 'tut.power' || hintKey.startsWith('tut.attack') || hintKey.startsWith('tut.block');
  // (only when the line can take it now: a hint about this ball is no use later; it waits for another ball)
  const now = general && hintFree(PRIO.ball) && !hintNext;
  if (!save.tutorial && attack && !tut.attack && tut.hit && now) {
    tut.attack = true;
    setHint(isTouch ? 'tut.attack' : 'tut.attackKeys', 5, false, PRIO.ball);
  }
  if (!save.tutorial && cueNow.kind === 'block' && !tut.block && tut.hit && now) {
    tut.block = true;
    setHint(isTouch ? 'tut.block' : 'tut.blockKeys', 5, false, PRIO.ball);
  }
  // 0.3, once ever (any match): the first bajada, and the first high ball at the net that can go «por 3» (after the
  // attack's own hint, which comes first in a first match)
  if (general && !hintKey.startsWith('tut.attack')) {
    if (bajada) onceHint('tut.bajada', 5, PRIO.ball);
    else if (attack && (save.tutorial || tut.attack) && por3Chance(m, me)) onceHint('tut.por3', 6, PRIO.ball);
  }
}

/**
 * Cues by touch, once each: the player who had to run for the ball gets there (in reach: the thumb can stop, the ring
 * at the feet turns lime; nothing if he was there already).
 */
const cue = { key: '', far: false, done: false };
function touchCues(m: Match) {
  const me = m.players.find((p) => p.human);
  if (!me || m.phase !== 'rally') {
    cue.key = '';
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
    if (m === demo && m.phase === 'over') startDemo();
  }
  if (live && match) bc.update(raw, match, input.pressing || !!input.stickBase);
  // (a tutorial hint waits while the TV has the screen: the intro, a replay)
  app.classList.toggle('tv-held', bc.frozen);
  // after a point, while a tap can still cut the pause short: the invite (until the player has done it twice, in
  // his first three matches)
  const skip = !!live && !!match && !bc.frozen && save.skips < 2 && save.played < 3 && match.hurryable() > 0.25;
  if (skip) {
    const txt = t(isTouch ? 'hud.tapOn' : 'hud.keyOn');
    if (tapEl.textContent !== txt) tapEl.textContent = txt;
  }
  tapEl.classList.toggle('on', skip);
  if (live && match && !bc.frozen) {
    view.leavesOut = save.swing === 'assist' && !input.active;
    overlays(match, dt);
    touchCues(match);
    hintTick();
  } else {
    // (a hint hidden while the TV has the screen keeps its time for when it is back)
    if (live && hintKey) {
      hintOn.at += raw * 1000;
      if (hintOn.until) hintOn.until += raw * 1000;
    }
    ringOuter.hidden = ringTarget.hidden = true;
    chip.hidden = cueChip.hidden = fan.hidden = true;
    stickBase.hidden = stickKnob.hidden = true;
    view.aim = null;
    view.cue = null;
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
  /** a match against pair i (tv: with the TV moments; off by default, so captures get the gameplay camera) */
  start: (i = 0, tv = false) => {
    bc.cinema = tv;
    startDoubles(PAIRS[Math.min(i, PAIRS.length - 1)]);
  },
  startDoubles: (i = 0, tv = false) => {
    bc.cinema = tv;
    startDoubles(PAIRS[i]);
  },
  save,
  /** why the last point was won or lost, in a line (src/explain.ts; not on screen) */
  get why() {
    return lastWhy;
  },
  /** what the coming ball asks for right now, as the HUD shows it: 'attack', 'block', 'bajada' or null (captures) */
  get cue() {
    return cueNow.kind;
  },
  /** debug (captures): show this cue whatever the ball ('attack', 'bajada', 'block'; null: the game's own) */
  set forceCue(c: Cue) {
    forceCue = c;
  },
  /**
   * debug (captures): a point as the match would send it, with the shot that decided it (the banner, the stands, the
   * sounds), handled at once (the match's own score does not change)
   */
  fakePoint(winner: 0 | 1, reason: PointReason, kind: ShotKind = 'smash', special: Special | null = null) {
    const m = match;
    if (!m) return;
    const error = reason === 'net' || reason === 'out' || reason === 'wall';
    const hitter = m.players.find((p) => p.team === (error ? 1 - winner : winner))!;
    onEvent(m, { type: 'hit', pid: hitter.id, kind, timing: 'good', q: 0.9, x: hitter.x, y: 2.6, z: hitter.z, speed: 22, shot: 9, volley: true, power: 1, ...(special ? { special } : {}) }, true);
    onEvent(m, { type: 'point', winner, reason, fault: error ? hitter.id : null, rally: 9 }, true);
  },
  set timeScale(v: number) {
    timeScale = v;
  },
};
void app;
