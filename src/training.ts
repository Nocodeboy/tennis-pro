// The «Entrenamiento» menu: the list of challenges, the instructions before each one, the challenge on court (the
// ball machine, the targets, a small score bug and what each ball scored) and the result with its stars and record.
// The rules of each challenge are in src/sim/drill.ts; the match itself (control, camera, sounds) is the game's own,
// run by main.ts (TrainingHost).

import type * as THREE from 'three';
import { fmtLen, type Why } from './explain';
import { t } from './i18n';
import { ICON, starsSvg } from './icons';
import { TOUR } from './tour';
import { DrillProps } from './render/drill-props';
import type { View } from './render/view';
import { DRILLS, Drill, type BallResult, type DrillDef, type Part } from './sim/drill';
import type { Controller, Match } from './sim/match';
import type { MatchEvent } from './sim/types';

/** What the game gives the training: its screens, its match loop and its feedback. */
export interface TrainingHost {
  view: View;
  hud: HTMLElement;
  fx: HTMLElement;
  /** the player's controller (the same as in a match) */
  human: Controller;
  show(html: string): HTMLElement;
  /** back to the main menu */
  menu(): void;
  /** play this challenge's match (the game sets up the view, the camera and the input) */
  play(d: Drill): void;
  /** leave the challenge's match (the result screen comes next) */
  leave(): void;
  banner(main: string, cls: string, why: string): void;
  hint(key: string, sec: number): void;
  sound(name: 'point' | 'lost' | 'click' | 'whoosh' | 'pop'): void;
  buzz(p: number | number[]): void;
}

interface Rec {
  best: number;
  stars: number;
}
const KEY = 'pickleball-train-v1';
function loadRecs(): Record<string, Rec> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, Rec>;
  } catch {
    // (storage may be blocked: the records live for this session)
    return {};
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Training {
  drill: Drill | null = null;
  private recs = loadRecs();
  private props: DrillProps | null = null;
  /** the explanation of the point that just ended (a ball that scored nothing says why) */
  private why: Why | null = null;
  /** the go is over: the result screen comes at this match time */
  private endAt: number | null = null;
  private hudKey = '';
  private shownTip = false;

  constructor(private host: TrainingHost) {}

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.recs));
    } catch {
      /* storage may be blocked */
    }
  }

  private starsHtml(n: number, max = 3): string {
    return starsSvg(n, max);
  }

  /** The list of challenges, with each one's record. */
  list() {
    const rows = DRILLS.map((d, i) => {
      const r = this.recs[d.id];
      const right = r ? `${this.starsHtml(r.stars)}<div class="rb">${t('train.best', { n: r.best })}</div>` : `<div class="rb">${t('train.none')}</div>`;
      return `<button class="rival drill-row" data-i="${i}"><div class="av num">${i + 1}</div><div class="rt"><div class="nm">${t(`dr.${d.id}.name`)}</div><div class="tg">${t(`dr.${d.id}.tag`)}</div></div><div class="st">${right}</div></button>`;
    }).join('');
    const el = this.host.show(
      `<div class="panel draw"><div class="ph"><button class="back" data-a="back" aria-label="${t('back')}">${ICON.back}</button><div class="pt"><div class="eyebrow">${TOUR}</div><h2>${t('train.title')}</h2></div></div><p class="drill-sub">${t('train.sub')}</p><div class="ladder">${rows}</div></div>`,
    );
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      this.host.sound('click');
      if (b.dataset.a === 'back') return this.host.menu();
      const i = Number(b.dataset.i);
      if (!Number.isNaN(i)) this.intro(i);
    });
  }

  /** The instructions of challenge i, before it starts. */
  intro(i: number) {
    const d = DRILLS[i];
    const r = this.recs[d.id];
    const balls = t(d.id === 'serve' ? 'train.serves' : 'train.balls', { n: d.balls });
    const el = this.host.show(
      `<div class="panel drill-intro"><div class="ph"><button class="back" data-a="back" aria-label="${t('back')}">${ICON.back}</button><div class="pt"><div class="eyebrow">${t('train.title')} · ${i + 1}/${DRILLS.length}</div><h2>${t(`dr.${d.id}.name`)}</h2></div></div>
      <ol class="steps"><li>${t(`dr.${d.id}.how1`)}</li><li>${t(`dr.${d.id}.how2`)}</li></ol>
      <div class="dmeta"><span>${balls}</span>${r ? `<span>${t('train.best', { n: r.best })} ${this.starsHtml(r.stars)}</span>` : ''}</div>
      <div class="btn-col"><button class="btn big primary" data-a="go">${ICON.play}${t('train.start')}</button></div></div>`,
    );
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a;
      if (!a) return;
      this.host.sound('click');
      if (a === 'back') return this.list();
      this.host.sound('whoosh');
      this.start(i);
    });
  }

  /** Challenge i on court. */
  start(i: number, seed = (Math.random() * 1e9) | 0) {
    this.stop();
    const def = DRILLS[i];
    const d = new Drill(def, this.host.human, seed);
    this.drill = d;
    this.endAt = null;
    this.why = null;
    this.hudKey = '';
    this.shownTip = false;
    d.onBall = (r) => this.onBall(r);
    this.host.play(d);
    // (the machine is the far player of the match: its body is not drawn, the machine is)
    const chars = (this.host.view as unknown as { chars: { root: THREE.Object3D }[] }).chars;
    if (chars[1]) chars[1].root.visible = false;
    this.props = new DrillProps(this.host.view.scene);
    this.props.set(def.machine, d.targets(), d.zone());
    d.start();
    this.renderHud();
  }

  /** Leaves the challenge (the props go). */
  stop() {
    this.props?.dispose();
    this.props = null;
    this.drill = null;
    this.endAt = null;
  }

  /** Every event of the challenge's match (after the explainer has read it). */
  event(m: Match, e: MatchEvent, why: Why | null) {
    const d = this.drill;
    if (!d || m !== d.match) return;
    if (e.type === 'hit' && e.pid === 1) {
      this.props?.fire();
      this.host.sound('pop');
    }
    if (e.type === 'point') this.why = why;
    d.event(e);
    if (e.type === 'serveSetup' && d.def.id === 'serve') this.props?.moveTargets(d.targets());
  }

  /** Once a frame while the challenge is on. */
  frame(dt: number, time: number) {
    const d = this.drill;
    if (!d) return;
    d.frame();
    this.props?.update(dt, time);
    this.renderHud();
    // the first ball on its way: the second instruction once, on the hint line
    if (!this.shownTip && d.ball === 0 && d.match.t > 0.3) {
      this.shownTip = true;
      this.host.hint(`dr.${d.def.id}.how2`, 4);
    }
    if (d.done && this.endAt === null) this.endAt = d.match.t + 1.4;
    if (this.endAt !== null && d.match.t >= this.endAt) this.finish();
  }

  /** The small score bug of the challenge: its name, which ball and the points so far (and the pause button). */
  private renderHud() {
    const d = this.drill;
    if (!d) return;
    const n = Math.min(d.def.balls, d.ball + (d.done ? 0 : 1));
    const key = `${d.def.id}|${n}|${d.score}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    const cnt = t(d.def.id === 'serve' ? 'train.serve' : 'train.ball', { n, of: d.def.balls });
    const st = d.stars();
    this.host.hud.innerHTML = `<div class="drillbug"><div class="dn">${esc(t(`dr.${d.def.id}.name`))}</div><div class="dl"><span>${cnt}</span><b>${t('train.pts', { n: d.score })}</b>${this.starsHtml(st)}</div></div><button class="icon-btn" id="pauseBtn" aria-label="${esc(t('pause.title'))}">${ICON.pause}</button>`;
  }

  /** Words for one part of a ball's result. */
  private part(p: Part): string {
    const v: Record<string, string | number> = { ...(p.vars ?? {}) };
    if (typeof v.cm === 'number') v.d = fmtLen(v.cm / 100);
    return t(p.key, v);
  }

  /** A ball has been scored: the tag with its points and why, a floater where it landed, the target lights up. */
  private onBall(r: BallResult) {
    const d = this.drill!;
    const good = r.pts > 0;
    // the headline: the best thing about it (a target), or what went wrong; the rest below
    const head = r.parts.find((p) => p.key === 'dr.target') ?? r.parts[0];
    const rest = r.parts.filter((p) => p !== head).map((p) => this.part(p));
    // a ball that scored nothing because of the player: the explainer says why (late, short, long by…)
    let why = rest.join(' · ');
    const w = this.why;
    if (!good && w && w.key !== 'x.winner' && !w.key.startsWith('w.')) why = w.text;
    this.why = null;
    this.host.banner(`${good ? '+' : ''}${r.pts} · ${head ? this.part(head) : ''}`, good ? 'good' : 'bad', why);
    this.host.sound(good ? 'point' : 'lost');
    this.host.buzz(good ? (r.pts >= 4 ? [12, 40, 12] : 12) : 25);
    if (r.target >= 0) this.props?.hit(r.target);
    else if (good && d.zone()) this.props?.zoneHit();
    if (r.at && good) {
      const sp = this.host.view.toScreen(r.at.x, 0.2, r.at.z);
      const el = document.createElement('div');
      el.className = `fl pts${r.pts >= 4 ? ' big' : ''}`;
      el.textContent = `+${r.pts}`;
      el.style.left = `${sp.x}px`;
      el.style.top = `${sp.y}px`;
      this.host.fx.appendChild(el);
      setTimeout(() => el.remove(), 900);
    }
    this.renderHud();
  }

  /** The go is over: the record and the result screen. */
  private finish() {
    const d = this.drill!;
    const def = d.def;
    const i = DRILLS.indexOf(def);
    const st = d.stars();
    const old = this.recs[def.id];
    const record = !old || d.score > old.best;
    this.recs[def.id] = { best: Math.max(old?.best ?? 0, d.score), stars: Math.max(old?.stars ?? 0, st) };
    this.save();
    const stats = this.stats(d);
    const next = def.stars.find((s) => s > d.score);
    this.stop();
    this.host.leave();
    const hasNext = i + 1 < DRILLS.length;
    const el = this.host.show(
      `<div class="end drill-result"><div class="end-a"><div class="eyebrow">${t('train.title')}</div><div class="dname">${t(`dr.${def.id}.name`)}</div>
      <div class="dbig">${this.starsHtml(st)}</div>
      <div class="dscore"><b>${d.score}</b><small>${t('train.of', { n: def.max })}</small></div>
      ${record && d.score > 0 ? `<div class="rec">${t('train.record')}</div>` : ''}
      </div><div class="end-b"><div class="dstat">${stats}</div>
      <div class="dnext">${next !== undefined ? t('train.toStar', { n: next - d.score }) : t('train.allStars')}</div>
      <div class="btn-col">
        <button class="btn primary" data-a="again">${t('train.again')}</button>
        ${hasNext ? `<button class="btn ghost" data-a="next">${t('train.next')}</button>` : ''}
        <button class="btn ghost" data-a="list">${t('train.list')}</button>
      </div></div></div>`,
    );
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a;
      if (!a) return;
      this.host.sound('click');
      if (a === 'again') this.start(i);
      else if (a === 'next') this.intro(i + 1);
      else this.list();
    });
  }

  /** The line of numbers on the result screen. */
  private stats(d: Drill): string {
    const rs = d.results;
    const n = rs.length;
    const has = (r: BallResult, k: string) => r.parts.some((p) => p.key === k && (p.pts ?? 0) > 0);
    const c = (f: (r: BallResult) => boolean) => rs.filter(f).length;
    switch (d.def.id) {
      case 'dink':
        return t('dr.st.dink', { a: c((r) => has(r, 'dr.inK')), n, b: c((r) => has(r, 'dr.target')), c: c((r) => has(r, 'dr.low') || has(r, 'dr.lowish')) });
      case 'third':
        return t('dr.st.third', { a: c((r) => has(r, 'dr.inK')), n, b: c((r) => has(r, 'dr.up')) });
      case 'attack': {
        const hi = rs.filter((r) => r.high);
        const lo = rs.filter((r) => !r.high);
        return t('dr.st.attack', { a: hi.filter((r) => has(r, 'dr.attacked')).length, h: hi.length, b: lo.filter((r) => has(r, 'dr.held') || has(r, 'dr.almost')).length, l: lo.length });
      }
      case 'defend':
        return t('dr.st.defend', { a: c((r) => has(r, 'dr.back')), n, b: c((r) => has(r, 'dr.lowish')), c: c((r) => has(r, 'dr.reset')), d: c((r) => has(r, 'dr.blockClean')) });
      case 'serve':
        return t('dr.st.serve', { a: c((r) => has(r, 'dr.serveIn')), n, b: c((r) => has(r, 'dr.target')), c: c((r) => has(r, 'dr.perfect')) });
    }
    return '';
  }

  /** debug: the definitions (window.__pb) */
  get defs(): DrillDef[] {
    return DRILLS;
  }
}
