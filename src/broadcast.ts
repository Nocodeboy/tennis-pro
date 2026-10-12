// The TV presentation of a tennis match: the broadcast score bug, the umpire's call, the match intro with the players'
// name straps, instant replays of great points, the crowd (quiet while the ball is in play, applause after it) and
// the shots the director takes in the dead time. It never touches the rules: it only holds the match still while the
// intro or a replay is on screen (after a replay the pause before the next serve is not added on top: the replay was
// the pause; the play is never shorter) and hands the camera back before a ball has to be played.

import { audio } from './audio';
import { t } from './i18n';
import { ICON } from './icons';
import { TOUR } from './tour';
import type { Input } from './input';
import type { ReplayRun } from './render/replay';
import type { View } from './render/view';
import { AT_NET } from './sim/court';
import type { Match } from './sim/match';
import type { MatchEvent, PointReason, ShotKind } from './sim/types';

export interface TeamInfo {
  /** the players' names in the score bug (upper case, the surnames: «MEDVÉDIEV»), in player order */
  names: string[];
  /** the players' full names on the name straps («DANIL MEDVÉDIEV») */
  full: string[];
  color: string;
  ink: string;
  /** the strap's badge: the seed («4»), «WC» for a wild card, or nothing */
  badge: string;
  /** the strap's second line: seed and ranking */
  info: string;
}
export interface BroadcastSetup {
  teams: [TeamInfo, TeamInfo];
  /** every player's name by id (for the calls) */
  names: string[];
  /** the event («PRO TOUR OPEN») */
  title: string;
  /** «Cuartos de final · Pista Central · Tierra batida» */
  round: string;
}

type PointEvent = Extract<MatchEvent, { type: 'point' }>;
type GameEvent = Extract<MatchEvent, { type: 'game' }>;
type SetEvent = Extract<MatchEvent, { type: 'set' }>;
type Cine =
  | { kind: 'intro'; t: number }
  | { kind: 'replay'; t: number; stage: 'in' | 'play' | 'out'; run: ReplayRun }
  | null;

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** the sting: the cut happens when the band covers the screen */
const STING = REDUCED ? 0.3 : 0.56;
const STING_CUT = STING / 2;
/** points won by the last shot (not an error): a winner (an ace on the serve), a ball they could not get to or let go */
// (a ball at the body: the hitter's point, as a winner)
const WON = new Set<PointReason>(['winner', 'miss', 'letGo', 'body']);
/**
 * How great a point has to be (planReplay's score) for a replay: normally (a smash or a net-cord winner after a
 * rally, a passing shot or a lob over a player at the net, a winner off a long rally, a perfect shot of yours), and
 * within two points of the last one (truly exceptional). Besides, never more than one replay per six points played
 * (plus one), except the point that ends the match.
 */
const REPLAY_AT = 3.5;
const REPLAY_AGAIN = 6;
const REPLAY_EVERY = 6;
/** a fast ball (m/s, 137 km/h): a winner this fast is worth seeing again (a rally drive: 30 m/s median, 37 at p90) */
const FAST = 38;
/** the title card, then the straps follow the camera: a team is introduced while it is this centred and this close */
const CARD_END = 1.0;
const STRAP_IN = { x: 0.7, y: 0.8, d: 13.5 };

/**
 * An ace: the serve won the point untouched (rally 1, a good serve nobody returned: the receiver did not go for it,
 * did not get there, or let it go). The contract's 'winner' with rally 1, and its 'miss' and 'letGo' too: in tennis
 * any untouched good serve is an ace.
 */
export function isAce(e: { reason: PointReason; rally: number }): boolean {
  return e.rally === 1 && (e.reason === 'winner' || e.reason === 'miss' || e.reason === 'letGo');
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ------------------------------------------------------------------ what the next point is worth
/** Would team k win the game (or tie-break) by winning the next point? */
export function wouldWinGame(m: Match, k: 0 | 1): boolean {
  const a = m.points[k] + 1;
  const b = m.points[k === 0 ? 1 : 0];
  if (m.tiebreak) return a >= 7 && a - b >= 2;
  if (m.rules.golden) return a >= 4;
  return a >= 4 && a - b >= 2;
}
/** Would team k win the set by winning the next game? */
export function wouldWinSet(m: Match, k: 0 | 1): boolean {
  if (m.tiebreak) return true;
  const g = m.games[k] + 1;
  return g >= m.rules.games && g - m.games[k === 0 ? 1 : 0] >= 2;
}
/**
 * What the point about to be played is worth: the match, a set, or a break of serve (the receiver is one point from
 * the game; never in a tie-break). Only the biggest one counts: a break point that would win the set is a set point.
 */
export function stakes(m: Match): { match: boolean; set: boolean; brk: boolean } {
  const both = [0, 1] as const;
  const match = both.some((k) => wouldWinGame(m, k) && wouldWinSet(m, k) && m.sets[k] + 1 >= m.setsToWin());
  const set = !match && both.some((k) => wouldWinGame(m, k) && wouldWinSet(m, k));
  const rcv = (1 - m.serverTeam) as 0 | 1;
  const brk = !match && !set && !m.tiebreak && wouldWinGame(m, rcv);
  return { match, set, brk };
}

export class Broadcast {
  /** the match is held (the intro or a replay is on screen) */
  frozen = false;
  /** show replays of great points (Settings) */
  replays = true;
  /**
   * The camera moments (intro, serve framing, reactions, replays, victory). Off for matches started by the capture
   * tools, which want the plain gameplay camera (window.__pb.start(i, true) keeps them).
   */
  cinema = true;
  /** debug (captures): replay every point with a rally, from this angle */
  forceReplay = false;
  forceAngle: ReplayRun['angle'] | null = null;
  /** the end of the match: called once the victory shot has been on for a while (or skipped) */
  onEnd: (() => void) | null = null;
  /**
   * The tie-breaks of the match: for every set finished, the points of the loser of its tie-break (the «(5)» of a
   * 7–6), or null when it had none. The end screen shows them too.
   */
  readonly tbLost: (number | null)[] = [];
  /** per team: aces, double faults, first serves in of first serves, break points won of break points played */
  readonly serve = { aces: [0, 0], dfs: [0, 0], first: [0, 0], firstIn: [0, 0], bp: [0, 0], bpWon: [0, 0] };
  private cine: Cine = null;
  private setup: BroadcastSetup | null = null;
  private match: Match | null = null;
  /** after a point: when it ended (sim time), who reacts, the replay to show and whether the match is over */
  private after: { tp: number; react: number; reacted: boolean; replay: ReplayRun | null; replayAt: number; over: boolean; winner: 0 | 1; victory: boolean; victoryT: number; ended: boolean } | null = null;
  private lastReplayPoint = -9;
  private lastReactPoint = -9;
  private replaysShown = 0;
  private pointNo = 0;
  /** what the rally being played is worth (the umpire said so) */
  private matchPoint = false;
  private setPoint = false;
  private breakPoint = false;
  /** the team serving the game being played (the serve's setup says it: a game strap knows whether it was a break) */
  private servingTeam: 0 | 1 = 0;
  /** the first serve of this point was a fault (a second serve was played) */
  private faulted = false;
  /** the point being played is a break point (the receivers are one point from the game) */
  private bpNow = false;
  /** the tie-break being played: its points so far */
  private tbOn = false;
  private tbPts: [number, number] = [0, 0];
  /** the sets the bug last showed (a set just won flips its column) */
  private bugSets = 0;
  /** the intro: which team's strap has been on already, and when the strap on now came on */
  private introDone: [boolean, boolean] = [false, false];
  private strapAt = 0;
  /** when this rally's serve was set up (a replay never reaches back past it: the players were put in place) */
  private rallyStart = 0;
  private bugKey = '';
  // DOM
  private layer: HTMLElement;
  private bug: HTMLElement;
  private call: HTMLElement;
  private card: HTMLElement;
  private strap: HTMLElement;
  private rbug: HTMLElement;
  private sting: HTMLElement;
  private skipHint: HTMLElement;
  private skipLayer: HTMLElement;
  /** the rally's last shot (who, what, forehand or backhand), for the replay's label */
  private lastHit: { pid: number; team: 0 | 1; kind: ShotKind; hand: 1 | -1 } | null = null;
  /** the shot named on the replay's bug («PASSING», «REMATE»…), or nothing */
  private replayShot = '';
  private callTimer = 0;
  private strapTimer = 0;
  private strapShown = -1;

  constructor(
    app: HTMLElement,
    hud: HTMLElement,
    private view: View,
    private input: Input,
  ) {
    this.layer = el('div', 'tv-layer');
    this.bug = hud;
    this.call = el('div', 'tv-call');
    this.card = el('div', 'tv-card');
    this.strap = el('div', 'tv-strap');
    this.rbug = el('div', 'tv-replay');
    this.sting = el('div', 'tv-sting');
    // (the band, and the tour's wordmark while it covers the screen)
    this.sting.innerHTML = `<i></i><b><span class="dot"></span>${esc(TOUR)}</b>`;
    this.skipHint = el('div', 'tv-skip');
    this.skipLayer = el('div', 'tv-skiplayer');
    this.layer.append(this.call, this.card, this.strap, this.rbug, this.skipHint);
    app.append(this.layer, this.sting, this.skipLayer);
    this.skipLayer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.skip();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.skippable) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.skip();
      }
    });
    this.view.onReplayEvent = (e) => {
      if (e.type === 'hit') audio.racket(e.kind ?? 'drive', e.speed, 0, 0, false);
      else if (e.type === 'bounce') audio.courtBounce(0.5);
      else if (e.tape) audio.play('tape');
      else audio.play('net');
    };
    this.hideAll();
  }

  /** the teams of the match on (the pause and the end screen show them as the bug does) */
  get teams(): [TeamInfo, TeamInfo] | null {
    return this.setup?.teams ?? null;
  }
  /** «Cuartos de final · Pista Central · Tierra batida» */
  get round(): string {
    return this.setup?.round ?? '';
  }

  private get skippable(): boolean {
    return !!this.cine || (!!this.after?.over && this.after.victory && !this.after.ended);
  }

  // ------------------------------------------------------------------ the match
  /** A new match: the intro flight with the title card and the name straps (the match waits). */
  begin(m: Match, s: BroadcastSetup) {
    this.reset();
    this.match = m;
    this.setup = s;
    this.pointNo = 0;
    this.lastReplayPoint = -9;
    this.lastReactPoint = -9;
    this.replaysShown = 0;
    this.matchPoint = this.setPoint = this.breakPoint = false;
    this.introDone = [false, false];
    this.rallyStart = m.t;
    this.tbLost.length = 0;
    this.tbOn = false;
    this.tbPts = [0, 0];
    for (const k of Object.keys(this.serve) as (keyof Broadcast['serve'])[]) this.serve[k] = [0, 0];
    audio.crowdBase = 1;
    audio.tension = 0;
    this.renderBug(m, true);
    if (!this.cinema) return;
    this.bug.classList.add('tv-off');
    this.cine = { kind: 'intro', t: 0 };
    this.frozen = true;
    this.hold(true);
    this.view.director.intro(this.view.dirCtx());
    this.card.innerHTML = `<div class="t1">${esc(s.title)}</div><div class="t2">${esc(s.round)}</div>`;
    this.card.className = 'tv-card';
    void this.card.offsetWidth;
    this.card.className = 'tv-card on';
    this.skipHint.textContent = t('tv.skip');
    this.skipHint.classList.add('on');
    audio.crowdSwell(0.5);
    audio.applause(0.45);
  }

  /** Leaving the match (menu, rematch): everything off, the camera back to normal. */
  reset() {
    if (this.cine?.kind === 'replay') this.view.stopReplay();
    this.cine = null;
    this.after = null;
    this.lastHit = null;
    this.replayShot = '';
    this.frozen = false;
    this.match = null;
    this.bugKey = '';
    this.bug.classList.remove('tv-off');
    audio.replayMode = false;
    audio.inPlay = false;
    audio.crowdBase = 0;
    audio.tension = 0;
    this.view.crowd.tension = 0;
    this.hold(false);
    this.hideAll();
  }

  private hideAll() {
    for (const e of [this.call, this.card, this.strap, this.rbug, this.skipHint]) e.classList.remove('on');
    this.layer.classList.remove('replay');
    this.sting.classList.remove('run');
    this.skipLayer.classList.remove('on');
    this.strapShown = -1;
  }

  /** the intro or a replay: no input reaches the match, a tap skips */
  private hold(on: boolean) {
    // (the victory shot can be skipped too)
    this.skipLayer.classList.toggle('on', on || !!(this.after?.victory && !this.after.ended));
    if (on) {
      this.input.clear();
      this.input.clearStick();
      this.input.enabled = false;
    } else {
      this.input.enabled = true;
      this.input.clear();
      this.input.clearStick();
    }
  }

  skip() {
    const c = this.cine;
    if (c?.kind === 'intro') this.endIntro(true);
    else if (c?.kind === 'replay' && c.stage !== 'out') {
      c.stage = 'out';
      c.t = 0;
      this.runSting();
    } else if (this.after?.over && this.after.victory && !this.after.ended) this.finish();
  }

  // ------------------------------------------------------------------ the score bug and the umpire's call
  /**
   * The broadcast scoreboard, as tennis TV draws it: per side its colour, the names (who serves lit, with the ball,
   * and «2º» on a second serve), the games of every set finished (the winner's number bright), the games of the set
   * being played and the points of the game (0 · 15 · 30 · 40 · AD; the tie-break's numbers). Up to five sets. Under
   * it, the state of the game when it matters: match point, set point, break point, deuce or advantage, the deciding
   * point, the tie-break. `scored`: the team that just won a point (its points flip; its games too when it won a game).
   */
  renderBug(m: Match, force = false, scored: 0 | 1 | null = null) {
    const s = this.setup;
    if (!s) return;
    const srv = m.server();
    const over = m.phase === 'over';
    // (the sets finished: at the end of the match the last one is the games column itself)
    const done = over ? m.setHist.slice(0, -1) : m.setHist;
    const key = `${done.map((g) => g.join()).join('|')}|${m.games.join()}|${m.points.join()}|${m.tiebreak}|${m.rules.golden}|${m.serverTeam}|${srv.id}|${m.serveNum}|${this.matchPoint}|${this.setPoint}|${this.breakPoint}|${over}`;
    if (!force && key === this.bugKey && scored === null) return;
    // (a game was just won: the games flip rather than the points, which are back to 0)
    const gameWon = scored !== null && m.points[0] === 0 && m.points[1] === 0;
    // (a set just won: its column comes in)
    const setWon = gameWon && done.length !== this.bugSets;
    this.bugKey = key;
    const row = (k: 0 | 1) => {
      const tm = s.teams[k];
      const serving = m.serverTeam === k && !over;
      const ps = m.team(k);
      const nm = ps.map((p, i) => `<span class="${serving && p === srv ? 'on' : ''}">${esc(tm.names[i] ?? '')}</span>`).join('<i>/</i>');
      const badge = serving ? `<b class="ball"></b>${m.serveNum === 2 ? `<b class="no">${esc(t('tv.second'))}</b>` : ''}` : '';
      const fg = scored === k && gameWon ? 'flip' : '';
      const fp = scored === k && !gameWon ? 'flip' : '';
      const o = k === 0 ? 1 : 0;
      const st = done.map((g, i) => `<span class="st${g[k] > g[o] ? ' w' : ''}"><span class="${setWon && i === done.length - 1 ? 'flip' : ''}">${g[k]}</span></span>`).join('');
      // (the match over: the points column goes, the winner's games are lit)
      const pt = over ? '' : `<span class="pt"><span class="${fp}">${esc(m.pointText(k))}</span></span>`;
      const won = over && m.winner === k;
      return `<div class="tr${serving ? ' serving' : ''}${scored === k ? ' scored' : ''}${won ? ' won' : ''}"><i class="tc" style="background:${tm.color}"></i><span class="nm">${nm}</span><span class="sv">${badge}</span>${st}<span class="sc"><span class="${fg}">${m.games[k]}</span></span>${pt}</div>`;
    };
    this.bugSets = done.length;
    const tags = this.stateTags(m)
      .map(([txt, cls]) => `<span class="${cls}">${esc(txt)}</span>`)
      .join('');
    this.bug.innerHTML = `<div class="bugwrap"><div class="tvbug${m.tiebreak ? ' tb' : ''}${done.length ? ' sets' : ''}${over ? ' over' : ''}" style="--ns:${done.length}">${row(0)}${row(1)}</div>${tags ? `<div class="tv-state">${tags}</div>` : ''}</div><button class="icon-btn" id="pauseBtn" aria-label="${esc(t('pause.title'))}">${ICON.pause}</button>`;
    // (the tags make the bug taller: the umpire's call and the point's tag move down under them)
    this.bug.parentElement?.classList.toggle('bug-st', !!tags);
  }

  /**
   * What the moment of the game is (under the bug, and on the umpire's call): match point, set point, break point,
   * the deciding point (no-ad), deuce or advantage, the tie-break. Before a serve only: once the point is over the bug
   * shows the score as it is.
   */
  private stateTags(m: Match): [string, string][] {
    const tags: [string, string][] = [];
    if (m.phase === 'over') return tags;
    if (this.matchPoint) tags.push([t('hud.matchPoint'), 'mp']);
    else if (this.setPoint) tags.push([t('hud.setPoint'), 'sp']);
    else if (this.breakPoint) tags.push([t('hud.breakPoint'), 'bp']);
    if (m.goldenPoint()) tags.push([t('tv.golden'), 'gold']);
    else if (m.deuce()) tags.push([t('tv.deuce'), '']);
    else if (this.advantage(m) !== null) tags.push([t('tv.adv'), '']);
    if (m.tiebreak) tags.push([t('tv.tiebreak'), 'tb']);
    return tags;
  }

  /** the team with the advantage (40-40 played on, with advantages), or null */
  private advantage(m: Match): 0 | 1 | null {
    if (m.tiebreak || m.rules.golden || Math.min(m.points[0], m.points[1]) < 3 || m.points[0] === m.points[1]) return null;
    return m.points[0] > m.points[1] ? 0 : 1;
  }

  /**
   * The umpire calls the score before the serve: one slim line under the bug (a chime; gold at match point). The
   * points, server first («15-30»; «IGUALES» at deuce, «VENTAJA SINER»); a label for the moment (match, set or break
   * point, the deciding point, the tie-break) and who serves.
   */
  private umpire(m: Match, who: string) {
    const second = m.serveNum === 2;
    const deuce = m.deuce();
    const adv = this.advantage(m);
    const s = this.setup;
    const advName = adv !== null && s ? t('tv.advName', { name: s.teams[adv].names.join('/') }) : '';
    const nums = deuce ? [t('tv.deuce')] : advName ? [advName] : m.call().split('-');
    const label = this.matchPoint ? t('hud.matchPoint') : this.setPoint ? t('hud.setPoint') : this.breakPoint ? t('hud.breakPoint') : m.goldenPoint() ? t('tv.golden') : m.tiebreak ? t('tv.tiebreak') : '';
    const gold = this.matchPoint || m.goldenPoint();
    this.call.className = `tv-call on${gold ? ' mp' : ''}${second ? ' second' : ''}`;
    this.call.setAttribute('aria-label', `${t('tv.score')} ${nums.join(' ')} · ${who}`);
    this.call.innerHTML = `${label ? `<span class="lb${gold ? '' : ' plain'}">${esc(label)}</span>` : ''}<span class="nums${deuce || advName ? ' word' : ''}">${nums.map((n) => `<b>${esc(n)}</b>`).join('<i></i>')}</span><span class="who">${esc(who)}</span>`;
    // (a second serve: no chime, the call is only a reminder)
    if (!second) audio.chime(gold);
    clearTimeout(this.callTimer);
    this.callTimer = window.setTimeout(() => this.call.classList.remove('on'), gold ? 2600 : 1900);
  }

  // ------------------------------------------------------------------ events of the live match
  onEvent(m: Match, e: MatchEvent, extra: { who?: string; reacts?: { pid: number; kind: 'cheer' | 'lost' }[] } = {}) {
    switch (e.type) {
      case 'serveSetup': {
        this.after = this.after?.over ? this.after : null;
        this.lastHit = null;
        this.rallyStart = m.t;
        this.servingTeam = m.serverTeam;
        const st = stakes(m);
        this.matchPoint = st.match;
        this.setPoint = st.set;
        this.breakPoint = st.brk;
        // (for the end screen: the receivers are one point from the game, whatever else the point is worth)
        this.bpNow = !m.tiebreak && wouldWinGame(m, (1 - m.serverTeam) as 0 | 1);
        if (m.tiebreak && !this.tbOn) {
          this.tbOn = true;
          this.tbPts = [0, 0];
        } else if (!m.tiebreak) this.tbOn = false;
        this.renderBug(m);
        this.umpire(m, extra.who ?? '');
        // (quiet, please: the stands settle as the server gets ready, and stay quiet until the point is over)
        audio.inPlay = true;
        audio.tension = 0;
        this.view.crowd.tension = 0;
        if (st.match || st.set || st.brk) audio.crowdHush();
        const d = this.view.director;
        // the players were just put in place: a cut to the server (a long lens if they are at the far end)
        if (d.kind !== 'play') d.play(0);
        if (this.cinema) d.serve(this.view.dirCtx(), e.server, st.match, true);
        break;
      }
      case 'serveStart': {
        // back to the gameplay camera before the ball is in play (the wind-up)
        const d = this.view.director;
        if (d.kind === 'frame' || d.kind === 'pushin') d.play(0.7);
        break;
      }
      case 'hit': {
        const d = this.view.director;
        if (d.kind !== 'play' && d.kind !== 'replay') d.play(0.35);
        const team = (m.players[e.pid]?.team ?? 0) as 0 | 1;
        this.lastHit = { pid: e.pid, team, kind: e.kind, hand: m.players[e.pid]?.lastHit?.hand ?? 1 };
        // (a long rally: the stands lean in, silent; the tension shows in the crowd, not in the noise)
        const shots = m.rally?.shots ?? 0;
        const k = Math.min(1, Math.max(0, (shots - 5) / 12));
        audio.tension = k;
        this.view.crowd.tension = k * 0.8;
        break;
      }
      case 'bounce':
        // a ball just in, or just out: the stands go "ooh"
        if (e.first && e.close && e.good) {
          audio.ooh(0.6);
          this.view.crowd.react('ooh', 0.6);
        } else if (e.first && !e.good && e.out !== undefined && e.out < 0.12) {
          audio.ooh(0.45);
          this.view.crowd.react('ooh', 0.45);
        }
        break;
      case 'net':
        if (e.tape) {
          audio.ooh(1);
          this.view.crowd.react('ooh', 1);
        }
        break;
      case 'fault':
        // the first fault: a murmur; the second is the point (the point does the rest)
        if (e.second) this.faulted = true;
        if (e.second) {
          audio.crowdSwell(0.15);
          this.call.classList.remove('on');
        }
        break;
      case 'let':
        this.call.classList.remove('on');
        break;
      case 'point':
        this.count(e);
        audio.inPlay = false;
        this.point(m, e, extra.reacts ?? []);
        break;
      case 'game':
        this.gameStrap(m, e);
        break;
      case 'set':
        this.tbLost.push(e.tiebreak ? Math.min(this.tbPts[0], this.tbPts[1]) : null);
        this.setStrap(m, e);
        break;
      case 'over':
        if (this.after) {
          this.after.over = true;
          this.after.winner = e.winner;
        }
        audio.inPlay = false;
        audio.roar(1);
        this.view.crowd.react('cheer', 1);
        break;
    }
  }

  /**
   * The serve's numbers of a point just played, for the end screen: every point has one first serve (in, unless it
   * was faulted: a let is played again and does not count), an ace is a winner off the serve (rally 1), a double
   * fault is the server's; a break point is the receivers' when they win it. A tie-break point too.
   */
  private count(e: PointEvent) {
    const st = this.servingTeam;
    const rc = (1 - st) as 0 | 1;
    this.serve.first[st]++;
    if (!this.faulted) this.serve.firstIn[st]++;
    this.faulted = false;
    if (e.reason === 'doubleFault') this.serve.dfs[st]++;
    if (isAce(e)) this.serve.aces[e.winner]++;
    if (this.bpNow) {
      this.serve.bp[rc]++;
      if (e.winner === rc) this.serve.bpWon[rc]++;
    }
    if (this.tbOn) this.tbPts[e.winner]++;
  }

  /** A point is over: the stands react, the camera finds who reacts, and a great point gets a replay. */
  private point(m: Match, e: PointEvent, reacts: { pid: number; kind: 'cheer' | 'lost' }[]) {
    this.pointNo++;
    this.call.classList.remove('on');
    const rec = this.view.recorder;
    const won = WON.has(e.reason);
    audio.tension = 0;
    this.view.crowd.tension = 0;
    // how good was it (and how the replay would go)
    const plan = rec ? this.planReplay(m, e) : null;
    const great = plan ? plan.score : 0;
    // the stands: silence during the point, then a roar for a great point or a long rally, applause for a winner (an
    // ace too), polite claps otherwise; a double fault gets a groan
    const big = Math.min(1, great / 5 + (e.rally >= 12 ? 0.3 : 0));
    const lh = this.lastHit;
    this.replayShot = won && lh && lh.team === e.winner ? this.shotName(lh, e) : '';
    if (e.reason === 'doubleFault') {
      audio.ooh(0.5);
      audio.applause(0.15);
      this.view.crowd.react('clap', 0.3);
    } else if (great >= 2.5 || e.rally >= 16) {
      // (the stands erupt for a smash, a passing shot or a net cord that wins it, or a very long rally; a good winner
      // gets warm applause)
      if (great >= 3.5 || e.rally >= 24) audio.roar(0.5 + big * 0.5);
      else {
        audio.applause(0.85);
        audio.crowdSwell(0.5);
      }
      this.view.crowd.react('cheer', 0.5 + big * 0.5);
    } else if (won) {
      audio.applause(e.rally === 1 ? 0.5 : 0.6);
      this.view.crowd.react('clap', 0.8);
      audio.crowdSwell(0.3);
    } else {
      audio.applause(0.3);
      this.view.crowd.react('clap', 0.45);
    }
    // a replay: a great point, at most one point in three (unless it is exceptional, and never two in a row), at most
    // one per six points played (plus one); the point that ends the match always gets one if it is great
    const over = m.phase === 'over';
    const again = this.pointNo - this.lastReplayPoint <= 2;
    const budget = this.replaysShown < 1 + Math.floor(this.pointNo / REPLAY_EVERY);
    // (never two points running, except the one that ends the match)
    const next = this.pointNo - this.lastReplayPoint === 1;
    const worth = over ? great >= REPLAY_AT : !next && great >= (again ? REPLAY_AGAIN : REPLAY_AT) && (budget || great >= REPLAY_AGAIN);
    const replay = this.cinema && this.replays && plan && (worth || this.forceReplay) ? plan.run : null;
    if (replay) {
      this.lastReplayPoint = this.pointNo;
      this.replaysShown++;
    }
    // the reaction shot, only after a point with something to it (a long rally won by a winner, an epic rally, a big
    // point, the end, a point about to be replayed) and at most one point in three unless it is one of the big ones:
    // the rest stay on the gameplay camera with the stands' noise (the players still cheer or hang their heads).
    // Who: who cheers (the human's side first), else who hangs their head (the human first)
    const human = m.players.find((p) => p.human);
    const pick = (kind: 'cheer' | 'lost') => {
      const r = reacts.filter((x) => x.kind === kind);
      return (r.find((x) => human && x.pid === human.id) ?? r.find((x) => human && m.players[x.pid].team === human.team) ?? r[0])?.pid ?? -1;
    };
    const major = over || this.matchPoint || this.setPoint || !!replay;
    const meaningful = major || (!!plan?.won && e.rally >= 14) || e.rally >= 24;
    let react = -1;
    if (meaningful && (major || this.pointNo - this.lastReactPoint >= 3)) {
      react = pick('cheer');
      if (react < 0) react = pick('lost');
    }
    if (react >= 0) this.lastReactPoint = this.pointNo;
    // (the big point has been played: the bug drops its tag until the umpire calls the next one)
    this.matchPoint = this.setPoint = this.breakPoint = false;
    this.after = { tp: m.t, react, reacted: false, replay, replayAt: react >= 0 ? 1.3 : 0.7, over, winner: e.winner, victory: false, victoryT: 0, ended: false };
  }

  /** the winning shot's name on the replay's bug: ACE, REMATE, VOLEA, DEJADA, GLOBO, DERECHA, REVÉS, CORTADO */
  private shotName(h: { kind: ShotKind; hand: 1 | -1 }, e: PointEvent): string {
    if (h.kind === 'serve') return isAce(e) ? t('reason.aceThem').toUpperCase() : t('kind.serve');
    if (h.kind === 'drive' || h.kind === 'return') return t(h.hand === 1 ? 'kind.fh' : 'kind.bh');
    if (h.kind === 'auto') return '';
    return t('kind.' + h.kind);
  }

  /**
   * How great the point was, and the replay. Only a point won by a shot is great (a winner, more so a smash, a passing
   * shot or a lob over a player at the net, a drop shot, a volley, a fast ball, a perfect swing, a net cord, the end of
   * a long rally); a long rally that ends in an error only when it is epic. The replay runs from just before the shot
   * that set it up (the last few shots of a long rally) to a moment after the decisive ball landed in, slowing down
   * for the decisive hit and a net cord, and it is cut before the dead ball rolls away (no slow motion on an empty
   * corner).
   */
  private planReplay(m: Match, e: PointEvent): { score: number; won: boolean; run: ReplayRun } | null {
    const rec = this.view.recorder!;
    const tp = m.t;
    const hits = rec.events.filter((x) => x.type === 'hit' && x.t >= this.rallyStart && x.t <= tp + 1e-6);
    if (hits.length < 2) return null;
    const last = hits[hits.length - 1];
    const hitter = m.players[last.pid];
    const won = WON.has(e.reason) && hitter?.team === e.winner;
    const tape = rec.events.find((x) => x.type === 'net' && x.tape && x.t >= last.t - 1e-6 && x.t <= tp + 1e-6);
    const longT = 14;
    let score = 0;
    const keys = [last.t];
    const portrait = this.view.camera.aspect < 0.8;
    let angle: ReplayRun['angle'] = portrait ? 'end' : 'side';
    // a long rally adds up to 2 to a winner; ending in an error, only an epic one is worth seeing again
    const long = e.rally >= longT ? Math.min(2, 1 + (e.rally - longT) * 0.08) : 0;
    // (the other side was at the net: a winner past or over them is a passing shot or a lob)
    const netUp = m.players.some((p) => p.team !== hitter?.team && Math.abs(p.z) < AT_NET);
    if (won) {
      score += 0.5 + long;
      if (last.kind === 'smash') {
        score += 2.5;
        angle = 'end';
      } else if ((last.kind === 'drive' || last.kind === 'slice' || last.kind === 'return' || last.kind === 'lob') && netUp) score += 2;
      else if (last.kind === 'speedup' || last.kind === 'dink' || last.kind === 'drop' || last.speed >= FAST) score += 1.5;
      if (last.perfect) score += 0.5;
      if (e.rally >= 6) score += 0.5;
      if (tape) {
        score += 2.5;
        angle = 'net';
        keys.push(tape.t);
      }
      // (the player's own shot, a touch more: he wants to see it again)
      if (hitter?.human) score += 0.3;
    } else if (e.rally >= 30) score = REPLAY_AT;
    if (this.forceAngle) angle = this.forceAngle;
    // the end: a winner, a moment after it lands in (it has passed the player who could not get it); an error, a
    // moment after the point is called
    const land = won ? rec.events.find((x) => x.type === 'bounce' && x.good && x.t > last.t + 1e-6 && x.t <= tp + 0.6) : undefined;
    const t1 = land ? Math.max(last.t + 0.8, land.t + 0.4) : Math.min(tp + 0.25, last.t + 1.6);
    let t0 = e.rally >= longT ? hits[Math.max(0, hits.length - 4)].t - 0.3 : hits[hits.length - 2].t - 0.45;
    t0 = Math.max(this.rallyStart + 0.05, Math.min(Math.max(t0, t1 - 3.4), t1 - 1.5));
    return { score, won, run: { t0, t1, cur: t0, keys, angle, hitter: last.pid, ev: 0, done: false } };
  }

  // ------------------------------------------------------------------ every frame
  /** Runs the shots and the intro or replay (dt: real seconds; the match's own time is read from it). */
  update(dt: number, m: Match, pressing: boolean) {
    const d = this.view.director;
    const c = this.cine;
    if (c?.kind === 'intro') {
      c.t += dt;
      this.introOverlays(c.t, m);
      if (c.t >= (REDUCED ? 2.9 : d.introLen)) this.endIntro(false);
      return;
    }
    if (c?.kind === 'replay') {
      this.replayStep(c, dt, m);
      return;
    }
    // the player touches the screen: the push-in or the framing gives way at once
    if (pressing && (d.kind === 'frame' || d.kind === 'pushin')) d.play(0.3);
    const a = this.after;
    if (!a) return;
    const since = m.t - a.tp;
    if (!a.reacted && a.react >= 0 && since >= 0.2) {
      a.reacted = true;
      if (this.cinema) d.react(this.view.dirCtx(), a.react);
    }
    if (a.replay && since >= a.replayAt) {
      const run = a.replay;
      a.replay = null;
      this.strap.classList.remove('on');
      this.cine = { kind: 'replay', t: 0, stage: 'in', run };
      this.frozen = true;
      this.hold(true);
      this.runSting();
      audio.play('sting');
      return;
    }
    // the end of the match (after its replay, if it gets one): the victory orbit, then the end screen
    if (a.over && !a.ended && !a.replay) {
      if (!this.cinema && since >= 1.5) return this.finish();
      if (!a.victory && since >= (a.reacted ? 1.3 : 0.6)) this.victory(m, false);
      if (a.victory) a.victoryT += dt;
      if (a.victoryT > 3.2) this.finish();
    }
  }

  /** the winners, orbited (after the final point's replay: a cut under the sting) */
  private victory(m: Match, cut: boolean) {
    const a = this.after!;
    a.victory = true;
    this.view.director.victory(this.view.dirCtx(), a.winner, cut);
    this.victoryStrap(m, a.winner);
    this.skipLayer.classList.add('on');
    this.skipHint.textContent = t('tv.skip');
    this.skipHint.classList.add('on');
  }

  /** the end of the match: the end screen comes up (the victory orbit keeps going behind it) */
  private finish() {
    const a = this.after;
    if (!a || a.ended) return;
    a.ended = true;
    this.skipLayer.classList.remove('on');
    this.skipHint.classList.remove('on');
    this.strap.classList.remove('on');
    this.onEnd?.();
  }

  private endIntro(skipped: boolean) {
    this.cine = null;
    this.frozen = false;
    this.hold(false);
    this.card.classList.remove('on');
    this.strap.classList.remove('on');
    this.skipHint.classList.remove('on');
    this.bug.classList.remove('tv-off');
    this.view.director.play(skipped ? 0.6 : 0);
  }

  /**
   * The intro: the title card, then each side's strap while the camera shows them: on when the side is near the middle
   * of the frame and close (the far side first), off as soon as they leave the frame or the camera pulls away. Driven
   * by what the camera sees, not by the clock, so it holds in any shape of screen, in singles and in doubles. With
   * reduced motion the camera stays on the whole court and the straps simply follow each other.
   */
  private introOverlays(time: number, m: Match) {
    const s = this.setup!;
    const side = this.view.viewSide;
    const farTeam = (m.players.find((p) => p.z * side < 0)?.team ?? 1) as 0 | 1;
    const nearTeam = (1 - farTeam) as 0 | 1;
    let want: number;
    if (REDUCED) {
      if (time > 1.0) this.card.classList.remove('on');
      want = time < 1.1 ? -1 : time < 1.9 ? farTeam : time < 2.7 ? nearTeam : -2;
    } else {
      if (time > CARD_END - 0.1) this.card.classList.remove('on');
      const end = this.view.director.introLen - 0.35;
      const at = (k: 0 | 1) => {
        let x = 0;
        let z = 0;
        let n = 0;
        for (const p of m.players)
          if (p.team === k) {
            x += p.x;
            z += p.z;
            n++;
          }
        return this.view.inFrame(x / Math.max(1, n), 1.0, z / Math.max(1, n));
      };
      want = this.strapShown;
      if (want >= 0) {
        // (on for a moment at least: it never flickers)
        const f = at(want as 0 | 1);
        const gone = !f.front || Math.abs(f.nx) > 0.95 || Math.abs(f.ny) > 0.95 || f.d > STRAP_IN.d * 1.3 || time > end;
        if (gone && time - this.strapAt > 0.5) {
          this.introDone[want] = true;
          want = -1;
        }
      }
      if (want < 0 && time >= CARD_END && time < end)
        for (const k of [farTeam, nearTeam]) {
          if (this.introDone[k]) continue;
          const f = at(k);
          if (f.front && Math.abs(f.nx) < STRAP_IN.x && Math.abs(f.ny) < STRAP_IN.y && f.d < STRAP_IN.d) {
            want = k;
            break;
          }
        }
    }
    if (want === this.strapShown) return;
    this.strapShown = want;
    this.strapAt = time;
    if (want < 0) {
      this.strap.classList.remove('on');
      return;
    }
    const tm = s.teams[want as 0 | 1];
    this.strap.className = 'tv-strap';
    this.strap.innerHTML = this.strapHtml(tm, `<div class="nm">${tm.full.map(esc).join('<i>/</i>')}</div>`, `<div class="tg">${esc(tm.info)}</div>`);
    this.strap.classList.remove('on');
    void this.strap.offsetWidth;
    this.strap.classList.add('on');
  }

  /** A lower third: the team's colour with its badge (the seed, or WC), then two lines. */
  private strapHtml(tm: TeamInfo, first: string, second: string): string {
    const badge = tm.badge ? `<span class="bd">${esc(tm.badge)}</span>` : '';
    return `<i class="tc" style="background:${tm.color};color:${tm.ink}">${badge}</i><div class="sx">${first}${second}</div>`;
  }

  /** «7–6 (5)»: a set's games, the winner's first, with the tie-break's loser points */
  private setScore(g: [number, number], winner: 0 | 1, tb: number | null): string {
    const o = winner === 0 ? 1 : 0;
    return `${g[winner]}–${g[o]}${tb !== null ? ` (${tb})` : ''}`;
  }

  /**
   * A game won: a lower third with the player or pair («JUEGO · MEDVÉDIEV · 3–2», the winners' games first; «BREAK»
   * when the receivers won it; the tie-break's own label), for a moment in the pause after the point. Not for the game
   * that ends a set: the set's strap says it.
   */
  private gameStrap(m: Match, e: GameEvent) {
    const s = this.setup;
    if (!s || m.phase === 'over') return;
    const tm = s.teams[e.winner];
    const g = e.games;
    const brk = !e.tiebreak && e.winner !== this.servingTeam;
    this.strap.className = `tv-strap game${brk ? ' brk' : ''}`;
    this.strap.innerHTML = this.strapHtml(tm, `<div class="lb">${esc(t(e.tiebreak ? 'tv.tbWon' : brk ? 'tv.break' : 'tv.game'))}</div>`, `<div class="nm">${tm.names.map(esc).join('<i>/</i>')}<span class="sc">${g[e.winner]}–${g[e.winner === 0 ? 1 : 0]}</span></div>`);
    void this.strap.offsetWidth;
    this.strap.classList.add('on');
    clearTimeout(this.strapTimer);
    this.strapTimer = window.setTimeout(() => {
      if (this.strap.classList.contains('game')) this.strap.classList.remove('on');
    }, 2400);
  }

  /**
   * A set won with the match still on: a lower third with the player or pair («SET · 1–0 · SINER · 6–4»; «7–6 (5)»
   * after a tie-break), in place of the game's, for a moment in the pause after the point.
   */
  private setStrap(m: Match, e: SetEvent) {
    const s = this.setup;
    if (!s || m.phase === 'over') return;
    const tm = s.teams[e.winner];
    const o = e.winner === 0 ? 1 : 0;
    this.strap.className = 'tv-strap game';
    this.strap.innerHTML = this.strapHtml(tm, `<div class="lb">${esc(t('tv.set'))} · ${e.sets[e.winner]}–${e.sets[o]}</div>`, `<div class="nm">${tm.names.map(esc).join('<i>/</i>')}<span class="sc">${this.setScore(e.games, e.winner, this.tbLost[this.tbLost.length - 1] ?? null)}</span></div>`);
    void this.strap.offsetWidth;
    this.strap.classList.add('on');
    clearTimeout(this.strapTimer);
    this.strapTimer = window.setTimeout(() => {
      if (this.strap.classList.contains('game')) this.strap.classList.remove('on');
    }, 3000);
  }

  /** «JUEGO, SET Y PARTIDO · 6–4 3–6 7–6 (5)»: the winner's name and the sets */
  private victoryStrap(m: Match, team: 0 | 1) {
    const s = this.setup;
    if (!s) return;
    const tm = s.teams[team];
    const o = team === 0 ? 1 : 0;
    // (more than one set: the sets, and the games of each set on the label line; one set: its games)
    const multi = m.setHist.length > 1;
    const score = multi ? `${m.sets[team]}–${m.sets[o]}` : this.setScore(m.setHist[0] ?? m.games, team, this.tbLost[0] ?? null);
    const detail = multi ? ` · ${m.setHist.map((g, i) => `${g[team]}–${g[o]}${this.tbLost[i] != null ? `(${this.tbLost[i]})` : ''}`).join(' ')}` : '';
    this.strap.className = 'tv-strap win';
    this.strap.innerHTML = this.strapHtml(tm, `<div class="lb">${esc(t('tv.match'))}${esc(detail)}</div>`, `<div class="nm">${tm.full.map(esc).join('<i>/</i>')}<span class="sc">${score}</span></div>`);
    this.strap.classList.remove('on');
    void this.strap.offsetWidth;
    this.strap.classList.add('on');
  }

  // ------------------------------------------------------------------ replays
  private runSting() {
    this.sting.classList.remove('run');
    void this.sting.offsetWidth;
    this.sting.classList.add('run');
  }

  private replayStep(c: Extract<Cine, { kind: 'replay' }>, dt: number, m: Match) {
    c.t += dt;
    const v = this.view;
    if (c.stage === 'in') {
      if (c.t >= STING_CUT) {
        // under the sting: cut to the replay
        c.stage = 'play';
        c.t = 0;
        if (!v.startReplay(c.run)) {
          c.stage = 'out';
          c.t = STING_CUT;
          return;
        }
        audio.replayMode = true;
        v.boardFooter = t('tv.replay');
        // (the shot that won it, when it has a name: «REPETICIÓN · PASSING»)
        this.rbug.innerHTML = `<b>${ICON.replay}</b><span>${esc(t('tv.replay'))}</span>${this.replayShot ? `<span class="sh">${esc(this.replayShot)}</span>` : ''}`;
        this.rbug.classList.add('on');
        this.layer.classList.add('replay');
        this.skipHint.textContent = t('tv.skip');
        this.skipHint.classList.add('on');
      }
      return;
    }
    if (c.stage === 'play') {
      if (v.replay?.done) {
        c.stage = 'out';
        c.t = 0;
        this.runSting();
        audio.play('sting');
      }
      return;
    }
    // out: under the sting, cut back to the live match
    if (c.t >= STING_CUT && v.replay) {
      v.stopReplay();
      v.boardFooter = this.footer;
      audio.replayMode = false;
      this.rbug.classList.remove('on');
      this.layer.classList.remove('replay');
      this.skipHint.classList.remove('on');
      // (the match is over: straight to the winners; otherwise straight on to the next serve, which frames the
      // server under the sting: the pause after the point has been the replay)
      if (this.after?.over && !this.after.victory) this.victory(m, true);
      else {
        v.director.play(0);
        m.hurry();
      }
    }
    if (c.t >= STING_CUT) {
      this.cine = null;
      this.frozen = false;
      this.hold(false);
      if (this.after) this.after.reacted = true;
    }
  }
  /** the video board's footer outside the replays (set by the game) */
  footer = '';
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
