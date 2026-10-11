// The TV presentation of a match: the broadcast score bug, the umpire's call, the match intro with the players'
// name straps, instant replays of great points, the crowd's reactions and the shots the director takes in the dead
// time. It never touches the rules: it only holds the match still while the intro or a replay is on screen (after a
// replay the pause before the next serve is not added on top: the replay was the pause; the play is never shorter)
// and hands the camera back before a ball has to be played.

import { audio } from './audio';
import { t } from './i18n';
import { ICON } from './icons';
import { TOUR } from './tour';
import type { Input } from './input';
import type { ReplayRun } from './render/replay';
import type { View } from './render/view';
import type { Match } from './sim/match';
import type { MatchEvent, PointReason } from './sim/types';

export interface TeamInfo {
  /** the players' names in the score bug (upper case, the surnames: «VIDAL»), in player order */
  names: string[];
  /** the players' full names on the name straps («BRUNO VIDAL») */
  full: string[];
  color: string;
  ink: string;
  /** the strap's badge: the seed («6»), «WC» for a wild card, or nothing */
  badge: string;
  /** the strap's second line: seed and ranking */
  info: string;
}
export interface BroadcastSetup {
  teams: [TeamInfo, TeamInfo];
  /** every player's name by id (for the calls) */
  names: string[];
  /** the event («PRO TOUR FINALS») */
  title: string;
  /** «Quarterfinal · Center Court» */
  round: string;
}

type PointEvent = Extract<MatchEvent, { type: 'point' }>;
type Cine =
  | { kind: 'intro'; t: number }
  | { kind: 'replay'; t: number; stage: 'in' | 'play' | 'out'; run: ReplayRun }
  | null;

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** the sting: the cut happens when the band covers the screen */
const STING = REDUCED ? 0.3 : 0.56;
const STING_CUT = STING / 2;
const WON = new Set<PointReason>(['winner', 'miss', 'letGo']);
/**
 * How great a point has to be (planReplay's score) for a replay: normally (a smash or a net-cord winner after a
 * rally, an attack that wins a long rally, a perfect attack of yours, the winner of an epic rally), and within two
 * points of the last one (truly exceptional: a smash winner off a perfect swing at the end of a long rally…).
 * Besides, never more than one replay per six points played (plus one), except the point that ends the match.
 */
const REPLAY_AT = 3.5;
const REPLAY_AGAIN = 6;
const REPLAY_EVERY = 6;
/** the title card, then the straps follow the camera: a team is introduced while it is this centred and this close */
const CARD_END = 1.0;
const STRAP_IN = { x: 0.7, y: 0.8, d: 11.5 };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

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
  private cine: Cine = null;
  private setup: BroadcastSetup | null = null;
  private match: Match | null = null;
  /** after a point: when it ended (sim time), who reacts, the replay to show and whether the match is over */
  private after: { tp: number; react: number; reacted: boolean; replay: ReplayRun | null; replayAt: number; over: boolean; winner: 0 | 1; victory: boolean; victoryT: number; ended: boolean } | null = null;
  private lastReplayPoint = -9;
  private lastReactPoint = -9;
  private replaysShown = 0;
  private pointNo = 0;
  /** the rally being played is a match point (the umpire said so) */
  private matchPoint = false;
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
  private callTimer = 0;
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
      if (e.type === 'hit') audio.paddle(e.kind ?? 'drive', e.speed, 0, 0, false);
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
  /** «Quarterfinal · Center Court» */
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
    this.matchPoint = false;
    this.introDone = [false, false];
    this.rallyStart = m.t;
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
    this.frozen = false;
    this.match = null;
    this.bugKey = '';
    this.bug.classList.remove('tv-off');
    audio.replayMode = false;
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
  /** The broadcast scoreboard: both teams, the score, who serves (and server 1 or 2 in classic doubles). */
  renderBug(m: Match, force = false, scored: 0 | 1 | null = null) {
    const s = this.setup;
    if (!s) return;
    const srv = m.server();
    const key = `${m.score.join()}|${m.serverTeam}|${srv.id}|${m.serverNum}`;
    if (!force && key === this.bugKey && scored === null) return;
    this.bugKey = key;
    const side = m.rules.scoring === 'sideout' && m.doubles;
    const row = (k: 0 | 1) => {
      const tm = s.teams[k];
      const serving = m.serverTeam === k;
      const ps = m.team(k);
      const nm = ps.map((p, i) => `<span class="${serving && p === srv ? 'on' : ''}">${esc(tm.names[i] ?? '')}</span>`).join('<i>/</i>');
      const badge = serving ? `<b class="ball"></b>${side ? `<b class="no">${m.serverNum}</b>` : ''}` : '';
      return `<div class="tr${serving ? ' serving' : ''}${scored === k ? ' scored' : ''}"><i class="tc" style="background:${tm.color}"></i><span class="nm">${nm}</span><span class="sv">${badge}</span><span class="sc"><span class="${scored === k ? 'flip' : ''}">${m.score[k]}</span></span></div>`;
    };
    this.bug.innerHTML = `<div class="tvbug">${row(0)}${row(1)}</div><button class="icon-btn" id="pauseBtn" aria-label="${esc(t('pause.title'))}">${ICON.pause}</button>`;
  }

  /** The umpire calls the score before the serve: one slim line under the bug (a chime; gold at match point). */
  private umpire(m: Match, who: string, matchPoint: boolean) {
    const nums = m.call().split('-');
    this.call.className = `tv-call on${matchPoint ? ' mp' : ''}`;
    this.call.setAttribute('aria-label', `${t('tv.score')} ${nums.join(' ')} · ${who}`);
    this.call.innerHTML = `${matchPoint ? `<span class="lb">${esc(t('hud.matchPoint'))}</span>` : ''}<span class="nums">${nums.map((n) => `<b>${n}</b>`).join('<i></i>')}</span><span class="who">${esc(who)}</span>`;
    audio.chime(matchPoint);
    clearTimeout(this.callTimer);
    this.callTimer = window.setTimeout(() => this.call.classList.remove('on'), matchPoint ? 2600 : 1900);
  }

  // ------------------------------------------------------------------ events of the live match
  onEvent(m: Match, e: MatchEvent, extra: { matchPoint?: boolean; who?: string; reacts?: { pid: number; kind: 'cheer' | 'lost' }[] } = {}) {
    switch (e.type) {
      case 'serveSetup': {
        this.after = this.after?.over ? this.after : null;
        this.rallyStart = m.t;
        this.matchPoint = !!extra.matchPoint;
        this.renderBug(m);
        this.umpire(m, extra.who ?? '', !!extra.matchPoint);
        audio.tension = 0;
        this.view.crowd.tension = 0;
        if (extra.matchPoint) audio.crowdHush();
        const d = this.view.director;
        // the players were just put in place: a cut to the server (a long lens if they are at the far end)
        if (d.kind !== 'play') d.play(0);
        if (this.cinema) d.serve(this.view.dirCtx(), e.server, !!extra.matchPoint, true);
        break;
      }
      case 'serveStart': {
        // back to the gameplay camera before the ball is in play (the wind-up is 0.87 s)
        const d = this.view.director;
        if (d.kind === 'frame' || d.kind === 'pushin') d.play(0.7);
        break;
      }
      case 'hit': {
        const d = this.view.director;
        if (d.kind !== 'play' && d.kind !== 'replay') d.play(0.35);
        const shots = m.rally?.shots ?? 0;
        const k = Math.min(1, Math.max(0, (shots - 5) / 12));
        audio.tension = k;
        this.view.crowd.tension = k * 0.8;
        break;
      }
      case 'bounce':
        // a ball just in: the stands go "ooh"
        if (e.first && e.close && e.good) {
          audio.ooh(0.6);
          this.view.crowd.react('ooh', 0.6);
        }
        break;
      case 'net':
        if (e.tape) {
          audio.ooh(1);
          this.view.crowd.react('ooh', 1);
        }
        break;
      case 'point':
        this.point(m, e, extra.reacts ?? []);
        break;
      case 'over':
        if (this.after) {
          this.after.over = true;
          this.after.winner = e.winner;
        }
        audio.roar(1);
        this.view.crowd.react('cheer', 1);
        break;
    }
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
    // the stands: a roar for a great point or a long rally, applause for a winner, polite claps otherwise
    const big = Math.min(1, great / 5 + (e.rally >= 12 ? 0.3 : 0));
    if (great >= 2.5 || e.rally >= (m.doubles ? 16 : 10)) {
      audio.roar(0.5 + big * 0.5);
      this.view.crowd.react('cheer', 0.5 + big * 0.5);
    } else if (won && e.rally >= 3) {
      audio.applause(0.55);
      this.view.crowd.react('clap', 0.8);
      audio.crowdSwell(0.35);
    } else {
      audio.applause(0.25);
      this.view.crowd.react('clap', 0.4);
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
    // the reaction shot, only after a point with something to it (a long rally won by a winner, an epic rally, the
    // match point, the end, a point about to be replayed) and at most one point in three unless it is one of the big
    // ones: the rest stay on the gameplay camera with the stands' noise (the players still cheer or hang their heads).
    // Who: who cheers (the human's side first), else who hangs their head (the human first)
    const human = m.players.find((p) => p.human);
    const pick = (kind: 'cheer' | 'lost') => {
      const r = reacts.filter((x) => x.kind === kind);
      return (r.find((x) => human && x.pid === human.id) ?? r.find((x) => human && m.players[x.pid].team === human.team) ?? r[0])?.pid ?? -1;
    };
    const major = over || this.matchPoint || !!replay;
    const meaningful = major || (!!plan?.won && e.rally >= (m.doubles ? 20 : 14)) || e.rally >= (m.doubles ? 30 : 24);
    let react = -1;
    if (meaningful && (major || this.pointNo - this.lastReactPoint >= 3)) {
      react = pick('cheer');
      if (react < 0) react = pick('lost');
    }
    if (react >= 0) this.lastReactPoint = this.pointNo;
    this.after = { tp: m.t, react, reacted: false, replay, replayAt: react >= 0 ? 1.3 : 0.7, over, winner: e.winner, victory: false, victoryT: 0, ended: false };
  }

  /**
   * How great the point was, and the replay. Only a point won by a shot is great (a winner, more so a smash, an
   * attack, a perfect swing, a net cord, the end of a long rally); a long rally that ends in an error only when it is
   * epic. The replay runs from just before the shot that set it up (the last few shots of a long rally) to a moment
   * after the decisive ball landed in, slowing down for the decisive hit and a net cord, and it is cut before the
   * dead ball rolls away (no slow motion on an empty corner).
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
    const longT = m.doubles ? 20 : 14;
    let score = 0;
    const keys = [last.t];
    const portrait = this.view.camera.aspect < 0.8;
    let angle: ReplayRun['angle'] = portrait ? 'end' : 'side';
    // a long rally adds up to 2 to a winner; ending in an error, only an epic one is worth seeing again
    const long = e.rally >= longT ? Math.min(2, 1 + (e.rally - longT) * 0.08) : 0;
    if (won) {
      score += 0.5 + long;
      if (last.kind === 'smash') {
        score += 2.5;
        angle = 'end';
      } else if (last.kind === 'speedup' || last.speed >= 15) score += 1.5;
      if (last.perfect) score += 0.5;
      if (e.rally >= 5) score += 0.5;
      if (tape) {
        score += 2.5;
        angle = 'net';
        keys.push(tape.t);
      }
      // (the player's own shot, a touch more: he wants to see it again)
      if (hitter?.human) score += 0.3;
    } else if (e.rally >= (m.doubles ? 40 : 32)) score = REPLAY_AT;
    if (this.forceAngle) angle = this.forceAngle;
    // the end: a winner, a moment after it lands in (it has passed the player who could not get it); an error, a
    // moment after the point is called
    const land = won ? rec.events.find((x) => x.type === 'bounce' && x.good && x.t > last.t + 1e-6 && x.t <= tp + 0.6) : undefined;
    const t1 = land ? Math.max(last.t + 0.8, land.t + 0.4) : Math.min(tp + 0.25, last.t + 1.6);
    let t0 = (e.rally >= longT ? hits[Math.max(0, hits.length - 4)].t - 0.3 : hits[hits.length - 2].t - 0.45);
    t0 = Math.max(this.rallyStart + 0.05, Math.min(Math.max(t0, t1 - 3), t1 - 1.5));
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
   * The intro: the title card, then each team's strap while the camera shows them: on when the team is near the
   * middle of the frame and close (the far team first), off as soon as they leave the frame or the camera pulls away.
   * Driven by what the camera sees, not by the clock, so it holds in any shape of screen and in doubles. With reduced
   * motion the camera stays on the whole court and the straps simply follow each other.
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

  private victoryStrap(m: Match, team: 0 | 1) {
    const s = this.setup;
    if (!s) return;
    const tm = s.teams[team];
    this.strap.className = 'tv-strap win';
    this.strap.innerHTML = this.strapHtml(tm, `<div class="lb">${esc(t('tv.match'))}</div>`, `<div class="nm">${tm.full.map(esc).join('<i>/</i>')}<span class="sc">${m.score[team]}–${m.score[team === 0 ? 1 : 0]}</span></div>`);
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
        this.rbug.innerHTML = `<b>${ICON.replay}</b><span>${esc(t('tv.replay'))}</span>`;
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
