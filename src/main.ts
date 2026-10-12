// Tennis prototype: menus, the match loop, HUD and feedback. The rules live in sim/, the drawing in render/.
// Two modes, each with its own ladder and progress: singles (the human against the five CPU rivals of a 32-player
// draw, first round to the final) and doubles (the human and his CPU partner, Marcel Granoyers, against the four
// pairs of a 16-pair draw). Every match is played on the tournament's surface (Settings: hard, clay or grass).

import { audio, vibrate } from './audio';
import { Broadcast, isAce, type BroadcastSetup, type TeamInfo } from './broadcast';
import { Explainer, fmtLen } from './explain';
import { AIM_D0, HumanController, servePulse, type SwingMode } from './human';
import { t, lang, setLang } from './i18n';
import { ICON } from './icons';
import { Input } from './input';
import { HERO, PARTNER_KIT, kitOf, onSurface, type KitInfo } from './kits';
import { View, aimHue, cssHue, type Tier } from './render/view';
import { AIController, HUMAN_REACTION, HUMAN_SPEED, PAIRS, PARTNER, RIVALS, kindForAim, type Pair, type Rival } from './sim/brain';
import { ATTR_KEYS, HUMAN_ATTRS, overall, type Attributes } from './sim/attributes';
import { SURFACES, type CourtSurface } from './sim/court';
import { IDEAL_RELEASE, LUNGE, Match, PERFECT_WINDOW, type Controller, type PlayerCfg } from './sim/match';
import { Rng } from './sim/rng';
import type { MatchEvent, Plan, Player, PointReason, Rules, ShotKind } from './sim/types';
import type { Kit } from './render/chars';
import { DRAW, EVENT, TOUR, brand, bugName, fullName, initials, pairInfo, pairSeed, playerInfo, roundName, seedOf, seedTag, surfaceName, surname, venue } from './tour';

declare const __VERSION__: string;

// ------------------------------------------------------------------ save
/** singles or doubles: the menu's choice (each has its own draw and progress) */
type Mode = 'singles' | 'doubles';
interface Save {
  sound: boolean;
  /** the menus' music (assets/music, made with AI), apart from the sound */
  music: boolean;
  /** games to win a set (6 is the real one; 2, 3 and 4 for a quick match): a tie-break to 7 at games-games */
  games: 2 | 3 | 4 | 6;
  /** one set, the best of three or the best of five */
  sets: 1 | 3 | 5;
  /** at 40-40: the deciding point (no-ad: the next point wins the game) or advantages (the tour's rule, the default) */
  golden: boolean;
  /** the tournament's surface: both draws are played on it (Settings) */
  surface: CourtSurface;
  /** the draw the menu plays: singles or doubles */
  mode: Mode;
  /** singles: the rivals of the ladder beaten (0 … 5) */
  beaten: number;
  /** doubles: the pairs of the ladder beaten (0 … 4) */
  beatenPairs: number;
  tutorial: boolean;
  lang?: 'en' | 'es';
  /** how the human swings, and how much help to get into position */
  swing: SwingMode;
  assist: number;
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
  /** the first-time hints already shown (the power of the gesture, the smash) */
  seen: string[];
}
// (a key of its own: the padel game's save, on the same origin in a local test, is not read)
const KEY = 'tenis-proto-v1';
/**
 * The defaults for a phone: one set to 4 games with a tie-break at 4-4 and advantages (the tour's rule) on a hard
 * court. Sets to 4 games are a real short format (Fast4); a set to 6 is 12–20 minutes, too long for a first match on
 * a phone; to 4 it is about 6–10 (the padel game's one set to 3 with the golden point was 4–7). The full match (best
 * of 3 or 5 sets to 6) is one tap away in Settings.
 */
const save: Save = { sound: true, music: true, games: 4, sets: 1, golden: false, surface: 'hard', mode: 'singles', beaten: 0, beatenPairs: 0, tutorial: false, swing: 'assist', assist: 1, replays: true, recover: false, haptics: true, hud: 'min', skips: 0, played: 0, coach: true, seen: [] };
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
if (![2, 3, 4, 6].includes(save.games)) save.games = 4;
if (save.sets !== 3 && save.sets !== 5) save.sets = 1;
if (!SURFACES.includes(save.surface)) save.surface = 'hard';
if (save.mode !== 'doubles') save.mode = 'singles';
save.beaten = Math.max(0, Math.min(RIVALS.length, Math.floor(Number(save.beaten) || 0)));
save.beatenPairs = Math.max(0, Math.min(PAIRS.length, Math.floor(Number(save.beatenPairs) || 0)));
save.golden = !!save.golden;
if (!Array.isArray(save.seen)) save.seen = [];
/** the rules of a match as Settings has them (the surface: the tournament's) */
const rules = (): Rules => ({ games: save.games, golden: save.golden, sets: save.sets, surface: save.surface });
const dbl = () => save.mode === 'doubles';
if (save.lang) setLang(save.lang);
else setLang(lang);
audio.setSfx(save.sound);
audio.setMusic(save.music);
audio.surface = save.surface;
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
/** the rival or the pair being played, and every player's name by id (for the calls and toasts) */
let rival: Rival = RIVALS[0];
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
const farOf = (z: number) => Math.max(0, Math.min(1, (-z * view.viewSide) / 9));
view.onSqueak = (_pid, k, x, z) => audio.squeak(k, panOf(x, 0, z), farOf(z));
view.onDeadBounce = (v, x, z) => audio.courtBounce(Math.min(1, v / 5), panOf(x, 0, z), farOf(z), true);
function setFooter(f: string) {
  view.boardFooter = f;
  bc.footer = f;
}
/** a player's kit as worn on the tournament's surface (all white on grass, src/kits.ts) */
const dress = (k: KitInfo): Kit => onSurface(k, save.surface).kit;

// ------------------------------------------------------------------ the attract mode behind the menus
let demo: Match | null = null;
const cfgOf = (r: Rival, team: 0 | 1): PlayerCfg => ({ team, human: false, speed: r.skill.speed, reaction: r.skill.reaction, look: r.look });
function startDemo() {
  // the attract match, on the tournament's surface, in the menu's mode: Siner against Alcarás (the final everybody
  // wants), or De Miñor and Medvédiev against Siner and Alcarás (four CPU players as they play in a pair)
  const near = dbl() ? [PAIRS[1].b, PAIRS[1].a] : [RIVALS[3]];
  const far = dbl() ? [PAIRS[3].a, PAIRS[3].b] : [RIVALS[4]];
  const all = [...near, ...far];
  audio.surface = save.surface;
  demo = new Match([...near.map((r) => cfgOf(r, 0)), ...far.map((r) => cfgOf(r, 1))], { games: 4, golden: false, sets: 1, surface: save.surface }, (Math.random() * 1e9) | 0);
  demo.setControllers(all.map((r) => new AIController(r.skill)));
  demo.start();
  view.setMatch(demo, all.map((r) => dress(kitOf(r.id))));
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
/** a pair as the draw writes it: «Siner / Alcarás» */
function pairName(p: Pair): string {
  return `${surname(p.a)} / ${surname(p.b)}`;
}
/** the surface as a small swatch of its colour and its name («● Tierra batida») */
function surfChip(s: CourtSurface = save.surface): string {
  return `<span class="surf ${s}"><i></i>${surfaceName(s)}</span>`;
}
/** «Un set · 4 juegos · Ventajas»: the format of the match */
function formatLine(): string {
  const sets = t(save.sets === 5 ? 'set.sets5' : save.sets === 3 ? 'set.sets3' : 'set.sets1');
  return `${sets} · ${t('fmt.games', { n: save.games })} · ${t(save.golden ? 'fmt.golden' : 'fmt.adv')}`;
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
/** the wordmark: TENIS, the tour (provisional brand) and the build */
function logo(): string {
  return `<div class="logo"><div class="w1">${brand()}</div><div class="tour"><i></i>${TOUR}<i></i></div><div class="sub">${t('title.sub')}</div></div>`;
}
/** a panel's header: back arrow, the event above the title */
function head(title: string, eyebrow = EVENT): string {
  return `<div class="ph"><button class="back" data-a="back" aria-label="${t('back')}">${ICON.back}</button><div class="pt"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2></div></div>`;
}

/** the next rival or pair of the menu's draw, its index and the draw's length */
function nextUp(): { i: number; n: number; name: string } {
  if (dbl()) {
    const i = Math.min(save.beatenPairs, PAIRS.length - 1);
    return { i, n: PAIRS.length, name: pairName(PAIRS[i]) };
  }
  const i = Math.min(save.beaten, RIVALS.length - 1);
  return { i, n: RIVALS.length, name: fullName(RIVALS[i]) };
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
  const nx = nextUp();
  // the next match of the draw: its round and the opponent(s)
  const upNext = t('menu.nextMatch', { round: roundName(nx.i, nx.n), name: nx.name });
  const item = (a: string, ic: string, label: string, extra = '') => `<button data-a="${a}">${ic}<span>${label}</span>${extra}${ICON.chev}</button>`;
  const el = show(
    `<div class="home-top">${logo()}</div>
    <div class="menu-col">
      <div class="seg mode" data-k="mode" role="group"><button data-v="singles" class="${dbl() ? '' : 'on'}" aria-pressed="${!dbl()}">${t('menu.singles')}</button><button data-v="doubles" class="${dbl() ? 'on' : ''}" aria-pressed="${dbl()}">${t('menu.doubles')}</button></div>
      <button class="btn big primary play" data-a="play"><span class="pl"><b>${t('menu.play')}</b><small>${upNext}</small></span>${ICON.play}</button>
      <div class="menu-list">
        ${item('rivals', ICON.draw, t('menu.draw'), surfChip())}
        ${item('team', ICON.card, t(dbl() ? 'menu.pair' : 'menu.team'))}
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
      const m = b.dataset.v === 'doubles' ? 'doubles' : 'singles';
      if (m === save.mode) return;
      save.mode = m;
      persist();
      // (the attract match changes with it)
      demo = null;
      return menu();
    }
    const a = b.dataset.a;
    if (a === 'play') {
      if (dbl()) versusPair(PAIRS[nx.i]);
      else versus(RIVALS[nx.i]);
    } else if (a === 'rivals') ladder();
    else if (a === 'team') teamCards();
    else if (a === 'how') howTo();
    else if (a === 'settings') settings();
  });
}

/**
 * One match of the draw: its round, the opponent (seed, name, a line about them), how good they are (the overall)
 * and where the player stands with it (won, next, or locked behind the round before).
 */
function drawRow(i: number, n: number, done: number, av: string, name: string, line: string, prev: string, ovr: number): string {
  const locked = i > done;
  const beaten = i < done;
  const cls = locked ? 'locked' : i === done ? 'next' : 'beaten';
  const st = beaten ? `<span class="ok">${ICON.check}${t('rivals.beaten')}</span>` : locked ? `<span class="lk">${ICON.lock}</span>` : `<span class="nx">${t('rivals.next')}</span>`;
  const sub = locked ? t('rivals.locked', { name: prev }) : line;
  return `<button class="rival ${cls}" data-i="${i}" ${locked ? 'disabled' : ''}>${av}<div class="rt"><div class="rd">${roundName(i, n)}</div><div class="nm">${name}</div><div class="tg">${sub}</div></div><div class="st">${st}${ovrChip(ovr)}</div></button>`;
}

/** an overall in the draw: the number, «MED» / «OVR» beside it */
const ovrChip = (v: number) => `<span class="ovr-chip ${tier(v)}" aria-label="${t('card.ovrLong')} ${v}"><b>${v}</b><small>${t('card.ovr')}</small></span>`;

/**
 * The draw of the menu's mode: singles, the five rivals from the round of 32 to the final; doubles, the four pairs
 * from the round of 16. Under the title, the draw's size and the surface it is played on.
 */
function ladder() {
  const d = dbl();
  const n = d ? PAIRS.length : RIVALS.length;
  const rows = d
    ? PAIRS.map((p, i) => drawRow(i, n, save.beatenPairs, duo(p.a, p.b), `${seedTag(pairSeed(p))}${pairName(p)}`, t(p.tag), i ? pairName(PAIRS[i - 1]) : '', pairOverall(p.a, p.b))).join('')
    : RIVALS.map((r, i) => drawRow(i, n, save.beaten, avatar(r), `${seedTag(seedOf(r))}${fullName(r)}`, t(r.tag), i ? fullName(RIVALS[i - 1]) : '', overall(r.attrs))).join('');
  const info = `<div class="draw-info"><span>${t(d ? 'draw.sizeD' : 'draw.size', { n: d ? DRAW.doubles : DRAW.singles })}</span>${surfChip()}<span>${formatLine()}</span></div>`;
  const el = show(`<div class="panel draw">${head(t(d ? 'draw.doubles' : 'draw.singles'))}${info}<div class="ladder">${rows}</div></div>`);
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    audio.play('click');
    if (b.dataset.a === 'back') return menu();
    const i = Number(b.dataset.i);
    if (Number.isNaN(i)) return;
    if (d && i <= save.beatenPairs) versusPair(PAIRS[i]);
    else if (!d && i <= save.beaten) versus(RIVALS[i]);
  });
}

function howTo() {
  // (each paragraph opens with its title in bold: the stylesheet sets it as the section's heading)
  const parts = ['how.1', 'how.2', 'how.8', 'how.7', 'how.9', 'how.10', 'how.3', 'how.5', 'how.11', 'how.6'].map((k, i) => `<section class="how-s"><span class="hn">${i + 1}</span><p>${t(k, { name: PARTNER.name })}</p></section>`).join('');
  const el = show(`<div class="panel how">${head(t('how.title'))}${miniCourt()}${parts}</div>`);
  el.querySelector('[data-a=back]')!.addEventListener('click', () => {
    audio.play('click');
    menu();
  });
}

/**
 * Your card (singles), or yours and Marcel's with the pair's overall (doubles): whole, from the menu (the match card
 * opens them one at a time).
 */
function teamCards() {
  const d = dbl();
  // (doubles: the pair's overall over the two cards; singles: the card says it all)
  const top = d ? `<div class="team-o">${ovrBox(pairOverall(null, PARTNER))}<span><b>${t('you')} / ${surname(PARTNER).toUpperCase()}</b><small>${t('tv.homePair')}</small></span></div>` : '';
  const el = show(`<div class="panel team${d ? '' : ' one'}">${head(t(d ? 'team.titleD' : 'team.title'))}${top}<div class="pc-two">${playerCard(null, true)}${d ? playerCard(PARTNER, true) : ''}</div></div>`);
  el.querySelector('[data-a=back]')!.addEventListener('click', () => {
    audio.play('click');
    menu();
  });
}

/** the court's colours for the diagram: inside the lines and the run-off round them */
const SURF_INK: Record<CourtSurface, [string, string]> = {
  hard: ['#2f6aa3', '#2a4f7a'],
  clay: ['#c1653a', '#a9532d'],
  grass: ['#4f8f3f', '#3f7834'],
};
/**
 * A small tennis court diagram, seen from your end, in the colours of the tournament's surface: the doubles alleys,
 * the singles sidelines, the service boxes and the net; the three aim zones on the far side (a drop shot just over
 * the net, a deep ball, a lob past the baseline) and you behind the near baseline (and Marcel at the net in doubles).
 */
function miniCourt(): string {
  const es = lang === 'es';
  const d = dbl();
  // (the shot colours are the game's: the drop shot cyan, a groundstroke white, the lob violet; the court 23.77 ×
  // 10.97 m at 6.2 px a metre)
  const f = `font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700" letter-spacing=".06em"`;
  const L = 'rgba(255,255,255,.88)';
  const [inC, outC] = SURF_INK[save.surface];
  const k = 6.2;
  const cx = 130;
  const top = 26;
  const len = 23.77 * k;
  const net = top + len / 2;
  const hw = (10.97 * k) / 2;
  const hs = (8.23 * k) / 2;
  const sv = 6.4 * k;
  const bot = top + len;
  const n = (v: number) => v.toFixed(1);
  return `<svg class="court-mini" width="260" height="200" viewBox="0 0 260 200" aria-hidden="true">
    <rect x="${n(cx - hw - 12)}" y="${n(top - 16)}" width="${n(hw * 2 + 24)}" height="${n(len + 32)}" rx="3" fill="${outC}"/>
    <rect x="${n(cx - hw)}" y="${top}" width="${n(hw * 2)}" height="${n(len)}" fill="${inC}"/>
    <g fill="none" stroke="${L}" stroke-width="1.2">
      <rect x="${n(cx - hw)}" y="${top}" width="${n(hw * 2)}" height="${n(len)}"/>
      <path d="M${n(cx - hs)} ${top}V${n(bot)}M${n(cx + hs)} ${top}V${n(bot)}"/>
      <path d="M${n(cx - hs)} ${n(net - sv)}H${n(cx + hs)}M${n(cx - hs)} ${n(net + sv)}H${n(cx + hs)}M${cx} ${n(net - sv)}V${n(net + sv)}"/>
      <path d="M${cx} ${top}v3M${cx} ${n(bot)}v-3"/>
    </g>
    <line x1="${n(cx - hw - 6)}" y1="${n(net)}" x2="${n(cx + hw + 6)}" y2="${n(net)}" stroke="#05080c" stroke-width="3"/>
    <line x1="${n(cx - hw - 6)}" y1="${n(net - 1.2)}" x2="${n(cx + hw + 6)}" y2="${n(net - 1.2)}" stroke="#fff" stroke-width="1"/>
    <circle cx="${cx - 14}" cy="${n(net - 12)}" r="5.5" fill="none" stroke="#5af0e8" stroke-width="2.5"/>
    <text x="${n(cx - hw - 16)}" y="${n(net - 8)}" text-anchor="end" fill="#5af0e8" font-size="11" ${f}>${es ? 'DEJADA' : 'DROP SHOT'}</text>
    <circle cx="${cx + 14}" cy="${n(top + 14)}" r="5.5" fill="none" stroke="#fff" stroke-width="2.5"/>
    <text x="${n(cx + hw + 16)}" y="${n(top + 18)}" fill="#fff" font-size="11" ${f}>${es ? 'AL FONDO' : 'DEEP'}</text>
    <circle cx="${cx - 6}" cy="${n(top - 9)}" r="5" fill="none" stroke="#c49aff" stroke-width="2.5"/>
    <text x="${n(cx - hw - 16)}" y="${n(top - 5)}" text-anchor="end" fill="#c49aff" font-size="11" ${f}>${es ? 'GLOBO' : 'LOB'}</text>
    ${d ? `<circle cx="${cx - 16}" cy="${n(net + 24)}" r="4.5" fill="#9aa3ad" stroke="#05080c" stroke-width="1.5"/><text x="${n(cx - hw - 16)}" y="${n(net + 28)}" text-anchor="end" fill="#9aa3ad" font-size="10" ${f}>${PARTNER.name.toUpperCase()}</text>` : ''}
    <circle cx="${cx + 16}" cy="${n(bot + 8)}" r="4.5" fill="#d9f23f" stroke="#05080c" stroke-width="1.5"/>
    <text x="${n(cx + hw + 16)}" y="${n(bot + 12)}" fill="#d9f23f" font-size="10" ${f}>${es ? 'TÚ' : 'YOU'}</text>
    <text x="${n(cx + hw + 16)}" y="${n(net + 4)}" fill="rgba(255,255,255,.6)" font-size="10" ${f}>${es ? 'RED' : 'NET'}</text>
  </svg>`;
}

function settings(scroll = -1) {
  // one row: a label and a segmented choice (`stack`: long options, one under the other; `wide`: the label over a
  // choice as wide as the panel)
  const row = (label: string, k: string, opts: [string, string, boolean][], how: '' | 'stack' | 'wide' = '') =>
    `<div class="row${how ? ' ' + how : ''}"><span>${label}</span><div class="seg" data-k="${k}">${opts.map(([v, txt, on]) => `<button data-v="${v}" class="${on ? 'on' : ''}" aria-pressed="${on}">${txt}</button>`).join('')}</div></div>`;
  const onOff = (label: string, k: string, on: boolean) => row(label, k, [['1', t('set.on'), on], ['0', t('set.off'), !on]]);
  const gamesNote = t(save.sets === 5 ? 'set.gamesNote5' : save.sets === 3 ? 'set.gamesNote3' : 'set.gamesNote', { n: save.games });
  const el = show(
    `<div class="panel settings">${head(t('menu.settings'))}
    <h3>${t('set.groupMatch')}</h3>
    ${row(t('set.surface'), 'surface', SURFACES.map((s) => [s, `<i class="sw ${s}"></i>${t('set.surf.' + s)}`, save.surface === s] as [string, string, boolean]), 'wide')}
    <p class="set-note">${t('set.surfNote.' + save.surface)}</p>
    ${row(t('set.sets'), 'sets', [['1', t('set.sets1'), save.sets === 1], ['3', t('set.sets3'), save.sets === 3], ['5', t('set.sets5'), save.sets === 5]], 'wide')}
    ${row(t('set.games'), 'games', ([2, 3, 4, 6] as const).map((g) => [String(g), String(g), save.games === g] as [string, string, boolean]))}
    <p class="set-note">${gamesNote}</p>
    ${row(t('set.deuce'), 'golden', [['0', t('set.adv'), !save.golden], ['1', t('set.golden'), save.golden]], 'stack')}
    <h3>${t('set.groupControl')}</h3>
    ${row(t('set.swing'), 'swing', [['assist', t('set.swingAssist'), save.swing === 'assist'], ['manual', t('set.swingManual'), save.swing === 'manual']], 'stack')}
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
    <h3>${t('set.groupCredits')}</h3>
    ${t('set.credits')}
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
    } else if (k === 'surface') {
      if (SURFACES.includes(v as CourtSurface) && v !== save.surface) {
        save.surface = v as CourtSurface;
        audio.surface = save.surface;
        // (the attract match behind the menus moves to the new court)
        demo = null;
        startDemo();
      }
    } else if (k === 'games') save.games = Number(v) as Save['games'];
    else if (k === 'sets') save.sets = v === '5' ? 5 : v === '3' ? 3 : 1;
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
 * The match card before a match: the event, the court and its surface, the round and the format; both sides, each
 * with its overall and its players' cards (a tap on one opens it whole); the opponents' line, and the buttons.
 */
function matchCard(i: number, n: number, me: string, them: string, tag: string): string {
  return `<div class="vs-card">
    <div class="vs-head"><div class="eyebrow">${EVENT} · ${venue(save.surface)}</div><div class="vs-round">${roundName(i, n)}</div><div class="vs-fmt">${surfChip()}<span>${formatLine()}</span></div></div>
    <div class="vs-teams">${me}<div class="x">VS</div>${them}</div>
    <div class="vs-tag">${tag}</div>
    <div class="vs-go"><button class="btn big primary" data-a="go">${ICON.play}${t('vs.start')}</button><button class="btn ghost" data-a="back">${t('back')}</button></div>
  </div>`;
}
/** one side of the match card: its overall, its name and seed, its cards */
const side = (cls: string, ovr: number, name: string, info: string, cards: string) =>
  `<div class="vt${cls}"><div class="vt-h">${ovrBox(ovr)}<span class="vt-n"><b>${name}</b><small>${info}</small></span></div><div class="vt-c">${cards}</div></div>`;

/** Singles: you against rival r. */
function versus(r: Rival) {
  mode = 'vs';
  rival = r;
  const i = RIVALS.indexOf(r);
  const el = show(
    matchCard(
      i,
      RIVALS.length,
      side(' me one', overall(HUMAN_ATTRS), t('you'), t('tour.wildcard'), playerCard(null)),
      side(' them one', overall(r.attrs), `${seedTag(seedOf(r))}${surname(r)}`, playerInfo(r), playerCard(r)),
      t(r.tag),
    ),
    'dim',
    'vs-screen',
  );
  onCard(el, () => startSingles(r));
}

/** Doubles: you and Marcel against pair p. */
function versusPair(p: Pair) {
  mode = 'vs';
  pair = p;
  const i = PAIRS.indexOf(p);
  const el = show(
    matchCard(
      i,
      PAIRS.length,
      side(' me', pairOverall(null, PARTNER), `${t('you')} / ${surname(PARTNER)}`, t('tour.wildcard'), playerCard(null) + playerCard(PARTNER)),
      side(' them', pairOverall(p.a, p.b), `${seedTag(pairSeed(p))}${pairName(p)}`, pairInfo(p), playerCard(p.a) + playerCard(p.b)),
      t(p.tag),
    ),
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
 * A first-time hint (the power of the gesture, the smash): shown once ever, in any match, in its keyboard wording
 * without a touch screen. Only when the line is free for it (otherwise it waits for another ball: it is not spent).
 */
function onceHint(k: string, sec: number, prio: number = PRIO.general): boolean {
  if (save.seen.includes(k) || !hintFree(prio) || hintNext) return false;
  save.seen.push(k);
  persist();
  setHint(isTouch ? k : `${k}Keys`, sec, false, prio);
  return true;
}

/** the TV's home side: «TÚ» (and «GRANOYERS») in the bug, the full names on the strap, a wild card */
const home = (bug: string[], full: string[]): TeamInfo => ({ names: bug, full, color: HERO.css, ink: HERO.ink, badge: 'WC', info: t(bug.length > 1 ? 'tv.homePair' : 'tv.home') });
/** the umpire's names by player id (the surnames, as in the bug: «Saca Medvédiev») */
let callNames: string[] = [];

/** Singles: the human (near side) against rival r. */
function startSingles(r: Rival) {
  rival = r;
  const i = RIVALS.indexOf(r);
  const k = kitOf(r.id);
  const seed = seedOf(r);
  const tv: BroadcastSetup = {
    teams: [home([t('you')], [t('you')]), { names: [bugName(r)], full: [fullName(r).toUpperCase()], color: k.css, ink: k.ink, badge: seed ? String(seed) : '', info: playerInfo(r) }],
    names: [t('you'), surname(r)],
    title: BOARD_FOOTER,
    round: `${roundName(i, RIVALS.length)} · ${venue(save.surface)}`,
  };
  callNames = tv.names;
  begin([cfgOf(r, 1)], [new AIController(r.skill)], [dress(k)], [t('you'), bugName(r)], [t('you'), r.name], tv);
}

/** Doubles: the human and Marcel (near side; the human plays the right and serves first) against a pair. */
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
    round: `${roundName(i, PAIRS.length)} · ${venue(save.surface)}`,
  };
  callNames = tv.names;
  begin(
    [cfgOf(PARTNER, 0), cfgOf(p.a, 1), cfgOf(p.b, 1)],
    [new AIController(PARTNER.skill), new AIController(p.a.skill), new AIController(p.b.skill)],
    [dress(PARTNER_KIT), dress(kitOf(p.a.id)), dress(kitOf(p.b.id))],
    [`${t('you')} / ${bugName(PARTNER)}`, `${bugName(p.a)} / ${bugName(p.b)}`],
    [t('you'), PARTNER.name, p.a.name, p.b.name],
    tv,
  );
}

/**
 * A match: the human (player 0, near side) plus the CPU players given (one rival: singles; the partner and a pair:
 * doubles), with the rules and the surface of Settings.
 */
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
  audio.surface = save.surface;
  match = new Match([{ team: 0, human: true, speed: HUMAN_SPEED, reaction: HUMAN_REACTION, look: 0 }, ...cfgs], rules(), seed);
  applyControls();
  match.setControllers([human, ...ctls]);
  match.start();
  view.setMatch(match, [dress(HERO), ...kits], true);
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
  lastOut = null;
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
const TIPS = ['tip.ring', 'tip.serve', 'tip.attack', 'tip.power', 'tip.tap', 'tip.block', 'tip.smash', 'tip.lob', 'tip.surface'];
/** the tips with their own wording for the keyboard (`Keys`) */
const KEYED = new Set(['tip.ring', 'tip.tap', 'tip.attack', 'tip.block', 'tip.power', 'tip.smash']);
let tipNo = 0;
function pause() {
  if (mode !== 'play' || paused) return;
  paused = true;
  input.clear();
  const k = TIPS[tipNo++ % TIPS.length];
  const tip = t(!isTouch && KEYED.has(k) ? `${k}Keys` : k);
  // the match as it stands: the sets played, the games of this set, and the points of the game under them
  const m = match;
  let where = '';
  const tv = bc.teams;
  if (m && tv)
    where = `<div class="pause-score"><span>${tv[0].names.join(' / ')}</span><b>${m.games[0]}</b><i></i><b>${m.games[1]}</b><span>${tv[1].names.join(' / ')}</span></div><div class="pause-pts">${t(m.tiebreak ? 'tv.tiebreak' : 'tv.points')} <b>${m.pointText(0)}-${m.pointText(1)}</b></div>`;
  // (more than one set: which set it is, the sets so far and the games of the sets played)
  if (m && tv && (m.rules.sets ?? 1) > 1) where += `<div class="pause-pts">${t('tv.setN', { n: m.setNo })} <b>${m.sets[0]}-${m.sets[1]}</b>${m.setHist.length ? ` · ${m.setHist.map((g) => g.join('-')).join(' · ')}` : ''}</div>`;
  // (the legs, FIT: yours, and your partner's in doubles, as a percentage)
  if (m && tv) where += `<div class="pause-pts">${t('pause.fit')} <b>${Math.round(m.players[0].fit * 100)}%</b>${m.doubles ? ` · ${PARTNER.name} <b>${Math.round(m.players[1].fit * 100)}%</b>` : ''}</div>`;
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
  bannerTimer = window.setTimeout(() => (banner.innerHTML = ''), why ? 3200 : 1700);
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
/**
 * A shot's name as the player sees it: a groundstroke or a return by its side (DERECHA, REVÉS: the hand of the
 * contact), the rest by their kind (CORTADO, DEJADA, GLOBO, VOLEA, REMATE…).
 */
function kindLabel(kind: ShotKind, hand: 1 | -1 | undefined): string {
  if ((kind === 'drive' || kind === 'return') && hand) return t(hand === 1 ? 'kind.fh' : 'kind.bh');
  return t('kind.' + kind);
}
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

/** the last bad bounce: how far out (m), for a serve fault's banner («Fuera del cuadro · por 4 cm») */
let lastOut: number | null = null;
/** a close call is said with its distance (m): under this, the banner says «por 4 cm» */
const CLOSE_CALL = 0.3;

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
      lastOut = null;
      // (the last point's tag, or the fault's, gives way to the umpire's call: it says «second serve» itself)
      clearBanner();
      // the umpire calls the score (and who serves) with a chime; the camera frames the server
      const name = callNames[e.server] ?? names[e.server];
      const who = m.serveNum === 2 ? (me ? t('hud.youServe2') : t('hud.serves2', { name })) : me ? t('hud.youServe') : t('hud.serves', { name });
      bc.onEvent(m, e, { who });
      if (me && !save.tutorial && !tut.served) setHint('tut.serve');
      break;
    }
    case 'serveStart': {
      bc.onEvent(m, e);
      // the serve's timing is decided on the release: say so then, not a second later at the contact
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
      // (a tennis ball leaves the racket at 15–55 m/s: the effects' strength from 15 to 45)
      const power = Math.min(1, Math.max(0, (e.speed - 15) / 30));
      const big = e.kind === 'smash';
      // the racket: by the kind of shot, how hard it was meant (the gesture) and how fast it leaves, placed where it
      // happened
      audio.racket(e.kind, e.speed, panOf(e.x, e.y, e.z), farOf(e.z), e.timing === 'perfect' && p.human, e.power ?? 0.5);
      bc.onEvent(m, e);
      view.hitFx(e.x, e.y, e.z, e.timing === 'perfect' && p.human, big ? 1 : power);
      if (p.human) {
        // over the head, not on the ball: PERFECT (gold), early or late (the manual swing), and in the full
        // indicators the shot of an aimed ball (DERECHA, REVÉS, CORTADO…); the automatic shot is the quiet default,
        // and the serve's label came with the release. A smash always says so (also with the minimal indicators),
        // its timing under it (auditoría 04, M2)
        const over = e.kind === 'smash';
        const timed = e.timing === 'perfect' || e.timing === 'early' || e.timing === 'late';
        const hand = p.lastHit?.hand;
        const lbl = over ? t('kind.smash') : e.timing === 'good' ? (save.hud === 'full' ? kindLabel(e.kind, hand) : '') : e.timing === 'auto' ? '' : t('timing.' + e.timing);
        if (lbl && e.kind !== 'serve') {
          // beside the head, away from the racket side (where the ball leaves from)
          const sp = view.toScreen(p.x, 2.1, p.z);
          const rk = view.toScreen(e.x, e.y, e.z).x >= sp.x ? 1 : -1;
          const cls = over && e.timing === 'perfect' ? 'perfect' : over ? 'shot' : e.timing;
          floater(lbl, cls, sp.x - rk * 30 * ui, sp.y, over && timed ? t('timing.' + e.timing) : '', over);
        }
        buzz(e.timing === 'perfect' ? [16, 34, 26] : e.timing === 'auto' ? 9 : 14);
        if (e.timing === 'perfect') {
          doFlash(0.1);
          tut.perfect = true;
        }
        // the contact lands: a perfect swing (a soft one barely), a smash
        if (e.timing === 'perfect' && e.kind !== 'serve') freeze(e.kind === 'dink' || e.kind === 'drop' ? 0.03 : 0.06);
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
      } else if (big) {
        view.shake = 0.3;
        freeze(0.045);
      }
      break;
    }
    case 'bounce':
      audio.courtBounce(e.first ? 0.75 : 0.4, panOf(e.x, 0, e.z), farOf(e.z));
      view.bounceFx(e.x, e.z, e.good);
      if (e.first && !e.good && e.out !== undefined) lastOut = e.out;
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
    case 'fault': {
      // a serve fault: «FALTA» and, the first time, the second serve (a close one, by how much it was out)
      const me = m.players[e.pid].team === 0;
      audio.play('fault');
      const by = e.fault === 'serveOut' && lastOut !== null && lastOut < CLOSE_CALL ? ` · ${t('out.by', { d: fmtLen(Math.max(0.01, lastOut)) })}` : '';
      if (e.second) showBanner(t('fault.title'), 'warn', t('fault.' + e.fault) + by + ' · ' + t('fault.second'));
      buzz(me ? 20 : 8);
      bc.onEvent(m, e);
      break;
    }
    case 'let':
      showBanner(t('let.title'), 'warn', t(m.serveNum === 2 ? 'let.sub2' : 'let.sub1'));
      bc.onEvent(m, e);
      break;
    case 'point': {
      const mine = e.winner === 0;
      const d = m.doubles;
      const ace = isAce(e);
      let main: string;
      // from the player's side: our winner (an ace), their clean winner (their ace), a ball we did not reach or let go
      if (ace) main = t(mine ? 'reason.ace' : 'reason.aceThem');
      else if (e.reason === 'winner' || e.reason === 'miss' || e.reason === 'letGo') main = mine ? t('reason.winner') : e.reason === 'winner' ? t('reason.winnerThem') : t(`reason.${e.reason}${d ? 'D' : ''}`);
      // (the ball hit a player of the receiving team: you, or someone else)
      else if (e.reason === 'body') main = t(e.touched !== undefined && m.players[e.touched]?.human ? 'reason.bodyMe' : 'reason.body');
      else main = t('reason.' + e.reason);
      // (0.8 of the pickleball explained every point in a second line and gave tips; Germán, 10 oct: «no tiene mucho
      // sentido». The explainer still runs: its lines are kept for the captures and the bots, window.__pb.why)
      lastWhy = why?.text ?? '';
      // the shot that decided it, by name (a passing shot, a smash, a lob, a drop shot, a volley), and under an error
      // whether it was forced or unforced, with the distance of a close call out («por 4 cm»)
      const call = explainer.callout(e);
      if (call?.shout && !ace) main = t(call.shout);
      const subs: string[] = [];
      if (e.reason === 'out') {
        const o = call?.out ?? lastOut;
        if (o !== null && o !== undefined && o < CLOSE_CALL) subs.push(t('out.by', { d: fmtLen(Math.max(0.01, o)) }));
      }
      if (call?.err) subs.push(t(call.err === 'forced' ? 'err.forced' : 'err.unforced'));
      const them = bc.teams?.[1]?.names.join(' / ') ?? '';
      showBanner(main, mine ? 'good' : 'bad', subs.join(' · '), '', mine ? t(d ? 'point.usD' : 'point.us') : them ? t('point.them', { name: them }) : t('point.themShort'));
      if (ace && mine) doFlash(0.14);
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
      // the game (or the tie-break) won: the bug shows the games, a strap says it (BREAK when the receivers won it)
      renderHud(e.winner);
      bc.onEvent(m, e);
      break;
    case 'set':
      // a set won: the bug shows it in its column, a strap says it
      renderHud(e.winner);
      bc.onEvent(m, e);
      break;
    case 'over': {
      const won = e.winner === 0;
      // (the victory strap has the bottom of the screen)
      clearHint();
      audio.play(won ? 'win' : 'lose');
      renderHud(e.winner);
      // the end screen comes after the victory shot (bc.onEnd)
      bc.onEvent(m, e);
      break;
    }
  }
}

/** the last point's explanation (src/explain.ts), for the captures */
let lastWhy = '';

/**
 * The end of a match: the result, the final score as the broadcast shows it (every set's games, a tie-break's points
 * small, the sets), the tennis stats (aces and double faults, first serves in, break points won, winners, errors, the
 * longest rally, the distance run) and what comes next in the draw.
 */
function endScreen(m: Match, won: boolean) {
  if (match !== m || mode !== 'play') return;
  mode = 'end';
  audio.music('menu');
  hud.hidden = true;
  clearHint();
  clearBanner();
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
  const sv = bc.serve;
  const allDone = won && i === n - 1;
  const tv = bc.teams;
  const multi = m.setHist.length > 1 || (m.rules.sets ?? 1) > 1;
  const oppCss = d ? kitOf(pair.a.id).css : kitOf(rival.id).css;
  const team = (k: 0 | 1) => {
    const c = k === 0 ? HERO.css : oppCss;
    const nm = tv ? tv[k].names.join(' / ') : k === 0 ? t('you') : '';
    const w = m.winner === k;
    const o = k === 0 ? 1 : 0;
    // every set's games (the winner's bright), the tie-break's loser points small beside the loser's 6
    const sets = m.setHist.map((g, j) => `<span class="st${g[k] > g[o] ? ' w' : ''}">${g[k]}${bc.tbLost[j] != null && g[k] < g[o] ? `<sup>${bc.tbLost[j]}</sup>` : ''}</span>`).join('');
    return `<div class="fr${w ? ' w' : ''}"><i style="background:${c}"></i><span class="nm">${nm}</span>${w ? `<span class="wk">${ICON.check}</span>` : ''}${sets}${multi ? `<span class="sc">${m.sets[k]}</span>` : ''}</div>`;
  };
  const stat = (label: string, v: number | string) => `<div class="sr"><span>${label}</span><b>${v}</b></div>`;
  // the broadcast's «distance covered» (the metres run, Player.dist), in km with one decimal
  const km = (x: number) => `${(x / 1000).toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : '–');
  const mate = d ? PARTNER.name : '';
  const el = show(
    `<div class="end"><div class="end-a">
    <div class="eyebrow">${roundName(i, n)} · ${EVENT}</div>
    <div class="result ${won ? 'win' : 'lose'}">${won ? t('end.win') : t('end.lose')}</div>
    <div class="final-board${multi ? '' : ' one'}">${team(0)}${team(1)}</div>
    <div class="end-surf">${surfChip()}<span>${formatLine()}</span></div>
    ${allDone ? `<div class="champ">${ICON.trophy}<span>${d ? t('end.ladderDoubles', { name: PARTNER.name }) : t('end.ladder')}</span></div>` : ''}
    </div><div class="end-b">
    <div class="stats"><h3>${t('end.stats')}</h3>
      ${stat(t('end.aces'), `${sv.aces[0]} · ${sv.dfs[0]}`)}
      ${stat(t('end.first'), pct(sv.firstIn[0], sv.first[0]))}
      ${stat(t('end.bp'), `${sv.bpWon[0]}/${sv.bp[0]}`)}
      ${stat(t('end.winners'), s.winners[0])}
      ${stat(d ? t('end.errorsBoth', { name: mate }) : t('end.errors'), d ? `${s.errorsBy[0]} / ${s.errorsBy[1]}` : s.errorsBy[0])}
      ${stat(t('end.perfect'), s.perfectBy[0])}
      ${stat(t('end.longest'), s.longest)}
      ${stat(d ? t('end.distanceD', { name: mate }) : t('end.distance'), d ? `${km(m.players[0].dist)} / ${km(m.players[1].dist)}` : km(m.players[0].dist))}
    </div>
    <div class="btn-col">
      ${hasNext ? `<button class="btn primary" data-a="next">${t('end.next')}<small>${roundName(i + 1, n)}</small></button>` : ''}
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
/** over the head, while you aim: what a flick would play (auditoría 04, M2: a hard smash), under the shot's name */
const fan = document.createElement('div');
fan.className = 'fan';
fan.setAttribute('aria-hidden', 'true');
/** «¡ATACA!»: beside the player when the coming ball sits up (never on the ball) */
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
 * Over the head (auditoría 04, M2): what the flick plays on this ball, as the swing will read it (brain.ts,
 * kindForAim, the same rules): a plain release is a placed smash (the shot's name says it), a flick a hard one. Only
 * when the flick plays something (a hard smash, or another shot than the release's).
 */
function overheadOptions(m: Match, me: Player, plan: Plan): [string, string][] {
  const base = kindForAim(m, me, plan, AIM_D0, false, false, 0, { power: 0.5 }).kind;
  const hard = kindForAim(m, me, plan, AIM_D0, false, true, 0, { power: 0.85 }).kind;
  const g = isTouch ? '↑' : t('fan.hold');
  if (hard === 'smash') return [[g, `${t('kind.smash')} ${t('fan.hard')}`]];
  return hard !== base ? [[g, t('kind.' + hard)]] : [];
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
    // (an attack key held, F or the right button: its power grows with the hold; over the head, a hard smash)
    const rally = m.phase === 'rally';
    const keyed = rally && input.attackHeld;
    const pw = keyed ? input.powerNow() : 0.5;
    const a = human.aim(m, me, plan, input.dx, input.dy, input.attackHeld && rally, 0, { power: pw });
    view.aim = { x: a.x, z: a.z, kind: a.kind, ok: a.ok, from: human.contactPoint(m, me, plan), clear: a.clear, pace: a.pace };
    const sp = view.toScreen(a.x, 0, a.z);
    chip.hidden = false;
    // (a groundstroke by its side: DERECHA or REVÉS, the hand of the contact)
    const [cx, cy, cw] = placeChip(m, me.team, sp.x, sp.y, !a.ok ? t('aim.out') : kindLabel(a.kind, plan?.hand), cssHue(aimHue(a.kind, a.ok)), !!timing, avoid);
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

/** what the coming ball asks for (brain.ts, ballCue): attack it, block it, or nothing */
type Cue = 'attack' | 'block' | null;
/** debug (captures): the cue shown whatever the ball (window.__pb.forceCue) */
let forceCue: Cue = null;
/**
 * What the coming ball asks for (brain.ts, ballCue): an attack (it sits up: the circle and the ring at the feet go
 * orange, «¡ATACA!» beside the player for a moment and a light double tick) or a block (an attack at you: the timing
 * ring shows, tap on its gold). Once shown it stays for the ball, unless it is gone for a moment (the contact was
 * refined away from it); it goes as soon as the ball is played.
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
  const c = incoming ? human.cue(m, me) : null;
  const raw: Cue = forceCue ?? (c === 'attack' || c === 'block' ? c : null);
  if (raw) {
    if (cueNow.kind !== raw) {
      cueNow.kind = raw;
      cueNow.at = m.t;
    }
    cueNow.lost = 0;
  } else if (cueNow.kind && (cueNow.lost += dt) > 0.15) cueNow.kind = null;
  const attack = cueNow.kind === 'attack';
  // (the circle and the ring at the feet: orange to attack)
  view.cue = cueNow.kind;
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
  // once ever (any match): the first ball over the head to smash (after the attack's own hint, which comes first in a
  // first match)
  if (general && !hintKey.startsWith('tut.attack') && attack && (save.tutorial || tut.attack)) {
    const plan = m.targetFor(me.id) ?? me.plan;
    if (plan?.overhead) onceHint('tut.smash', 6, PRIO.ball);
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
  /** debug: the human's player plays by himself like a tour player (captures of long rallies) */
  autopilot() {
    if (match) match.controllers[0] = new AIController(match.doubles ? PARTNER.skill : RIVALS[2].skill);
  },
  view,
  input,
  /**
   * A match without the TV moments by default (captures get the gameplay camera; tv: with them): `start(i)` singles
   * against rival i of the ladder (0 … 4), `startSingles(i)` the same, `startDoubles(i)` doubles against pair i
   * (0 … 3). `start(i, tv, 'doubles')` picks the mode too.
   */
  start: (i = 0, tv = false, m: Mode = 'singles') => {
    bc.cinema = tv;
    if (m === 'doubles') startDoubles(PAIRS[Math.max(0, Math.min(i, PAIRS.length - 1))]);
    else startSingles(RIVALS[Math.max(0, Math.min(i, RIVALS.length - 1))]);
  },
  startSingles: (i = 0, tv = false) => {
    bc.cinema = tv;
    startSingles(RIVALS[Math.max(0, Math.min(i, RIVALS.length - 1))]);
  },
  startDoubles: (i = 0, tv = false) => {
    bc.cinema = tv;
    startDoubles(PAIRS[Math.max(0, Math.min(i, PAIRS.length - 1))]);
  },
  /** the menu's mode (singles or doubles) and the tournament's surface, as Settings sets them (redraws the menu) */
  setMode(m: Mode) {
    save.mode = m === 'doubles' ? 'doubles' : 'singles';
    persist();
    demo = null;
    if (mode === 'menu') menu();
  },
  setSurface(s: CourtSurface) {
    if (!SURFACES.includes(s)) return;
    save.surface = s;
    audio.surface = s;
    persist();
    demo = null;
    if (mode === 'menu') menu();
  },
  /** the screens by name (captures): 'menu', 'draw', 'team', 'how', 'settings', 'vs' (the next match's card) */
  screen(name: string) {
    if (name === 'menu') menu();
    else if (name === 'draw') ladder();
    else if (name === 'team') teamCards();
    else if (name === 'how') howTo();
    else if (name === 'settings') settings();
    else if (name === 'vs') {
      const nx = nextUp();
      if (dbl()) versusPair(PAIRS[nx.i]);
      else versus(RIVALS[nx.i]);
    }
  },
  save,
  /** why the last point was won or lost, in a line (src/explain.ts; not on screen) */
  get why() {
    return lastWhy;
  },
  /** what the coming ball asks for right now, as the HUD shows it: 'attack', 'block' or null (captures) */
  get cue() {
    return cueNow.kind;
  },
  /** debug (captures): show this cue whatever the ball ('attack', 'block'; null: the game's own) */
  set forceCue(c: Cue) {
    forceCue = c;
  },
  /**
   * debug (captures): a point as the match would send it (the banner, the stands, the sounds), handled at once (the
   * match's own score does not change). `kind`: the deciding shot; `rally`: the shots of the point (an ace: 'winner',
   * 'serve', 1); `out`: for an 'out', how far out the ball bounced (m: «por 4 cm» under a close call); `hand`: +1
   * forehand, −1 backhand. Examples: fakePoint(0, 'winner', 'serve', 1) an ace; fakePoint(1, 'out', 'drive', 7, 0.04)
   * their groundstroke out by 4 cm; fakePoint(0, 'doubleFault', 'serve', 1) their double fault.
   */
  fakePoint(winner: 0 | 1, reason: PointReason, kind: ShotKind = 'drive', rally = 9, out?: number, hand: 1 | -1 = 1) {
    const m = match;
    if (!m) return;
    const error = reason === 'net' || reason === 'out' || reason === 'doubleFault' || reason === 'twoBounce';
    const team = error ? 1 - winner : winner;
    const hitter = (kind === 'serve' ? m.players.find((p) => p.team === team && p.id === m.serverId) : null) ?? m.players.find((p) => p.team === team)!;
    hitter.lastHit = { t: m.t, kind, hand, overhead: kind === 'smash', timing: 'good' };
    const y = kind === 'smash' ? 2.6 : kind === 'serve' ? 2.75 : 0.9;
    onEvent(m, { type: 'hit', pid: hitter.id, kind, timing: 'good', q: 0.9, x: hitter.x, y, z: hitter.z, speed: kind === 'serve' ? 52 : kind === 'smash' ? 40 : 30, shot: rally, volley: kind === 'smash' || kind === 'speedup', power: 0.8, tx: 0, tz: -hitter.side * 10 }, true);
    if (reason === 'out' && out !== undefined) onEvent(m, { type: 'bounce', x: 0, z: -hitter.side * (11.885 + out), good: false, first: true, close: out < 0.3, out }, true);
    onEvent(m, { type: 'point', winner, reason, fault: error ? hitter.id : null, rally }, true);
  },
  /** debug (captures): any match event, handled at once as the live match's (a strap: { type: 'game', … }) */
  fakeEvent(e: MatchEvent) {
    if (match) onEvent(match, e, true);
  },
  set timeScale(v: number) {
    timeScale = v;
  },
};
void app;
