// Why the point was won or lost, in one short line with a number from the point itself (how far under the tape the
// ball met the net, how far long or wide it landed, how late the player set off and how far the ball was), in tennis
// terms: the net, long or wide, a double fault, an ace, a passing shot, a lob over the player at the net, a winner;
// the call for the banner (the shot that won it by name, and whether an error was forced or unforced:
// Explainer.callout); and, when the same mistake keeps coming back, a short tip between points (Coach).
//
// No DOM: it reads the match's events and, once a frame, the match (where the players are, the suggested circle), so
// the bots can measure it (tools/review/explain.ts). Nothing here changes the match.

import { bounce, groundTime, posAt, type Seg } from './sim/ball';
import { AT_NET, HL, LINE, NET_C, R, SERVICE, halfW, inHalf, inServiceCourt, netHeight } from './sim/court';
import { CPU_LUNGE, HUMAN_FEET, SUGGEST, footStep, type Feet, type Match } from './sim/match';
import type { MatchEvent, PointReason, ServeFault, ShotKind, Timing } from './sim/types';
import { lang, t } from './i18n';

type HitEvent = Extract<MatchEvent, { type: 'hit' }>;
type PointEvent = Extract<MatchEvent, { type: 'point' }>;

/** A shot of the rally, as it left the racket (the hit event, plus who was where and the ball's flight). */
interface HitRec {
  pid: number;
  team: 0 | 1;
  kind: ShotKind;
  /** the human's flick (attack) or tap (block), brain.ts */
  intent: 'attack' | 'block' | null;
  /** +1 forehand, −1 backhand (the hitter's lastHit at the contact) */
  hand: 1 | -1;
  /** 0 … 1: how hard it was meant (the gesture's speed; 0.5 a plain release) */
  power: number;
  timing: Timing;
  x: number;
  y: number;
  z: number;
  speed: number;
  shot: number;
  shank: boolean;
  clear: number | null;
  tx: number;
  tz: number;
  pop: boolean;
  stretch: number;
  avail: number | null;
  vin: number;
  t: number;
  /** the flight as launched (null if it could not be read cleanly) */
  seg: Seg | null;
  /** every player's feet and velocity at the contact */
  at: { x: number; z: number; vx: number; vz: number }[];
}

/** One ball coming to a player of the explained team (the human's): what the circle asked and what he did. */
interface Track {
  pid: number;
  hit: number;
  t0: number;
  x0: number;
  z0: number;
  vx0: number;
  vz0: number;
  /** the first suggested spot and the latest one */
  first: { fx: number; fz: number; t: number; reach: number } | null;
  last: { fx: number; fz: number; t: number } | null;
  /** s after the other side's contact when his run towards the circle began (1 m/s towards it; null: never) */
  start: number | null;
  going: boolean;
  /** distance to the latest circle when its moment came (or when the point ended) */
  endD: number | null;
}

/** The explanation of a point: the line (an i18n key and its values, and the text) and the pattern behind it. */
export interface Why {
  key: string;
  vars: Record<string, string>;
  text: string;
  /** the human's own recurring pattern this point shows (for the Coach), or null */
  tag: string | null;
  /** the numbers behind the line, for the bots' checks */
  data: Record<string, number | string | boolean | null>;
}

const SEE = SUGGEST.see;
const SOFT = new Set<ShotKind>(['dink', 'drop', 'auto']);
const ATTACK = new Set<ShotKind>(['speedup', 'smash']);
/** the shots from the back (a winner past a player at the net is a passing shot) */
const GROUND = new Set<ShotKind>(['drive', 'slice', 'return']);
/** the point was won by the last shot (not an error) */
const WON = new Set<PointReason>(['winner', 'miss', 'letGo', 'body']);
/**
 * Tennis speeds (m/s), measured with the bots (tools/bot.ts SHOTS=1; docs/tenis/notas-01-simulacion.md): a rally drive
 * leaves the racket at 108 km/h (30 m/s) on the median and 131–135 km/h (36–37 m/s) at the 90th percentile, and comes
 * to the other player at about 20 m/s after the bounce. `fast` a hard hit (its launch speed, 130 km/h: the hardest tenth
 * of the groundstrokes), `vin` a ball that came at the player fast (its speed at the contact). An error is forced when
 * the ball came fast, gave him little time (`avail` s from the other side's contact; a rally ball gives 1.3 s) or had
 * him at full stretch; otherwise it is unforced (the stat tennis TV shows).
 */
export const SPEED = { fast: 36, vin: 24 };
export const FORCED = { avail: 0.75, stretch: 0.6, vin: 25, speed: 38 };

const dec = (v: number, n = 1) => {
  const s = v.toFixed(n);
  return lang === 'es' ? s.replace('.', ',') : s;
};
/** a length: centimetres under a metre, metres with a decimal above */
export const fmtLen = (m: number) => (m < 0.995 ? `${Math.max(1, Math.round(m * 100))} cm` : `${dec(m)} m`);
export const fmtSec = (s: number) => `${dec(Math.max(0.1, s))} s`;
export const fmtKmh = (v: number) => `${Math.round(v * 3.6)} km/h`;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export class Explainer {
  /** every player's name by id (the human's is never used: "you" is in the phrasing) */
  names: string[] = [];
  private hits: HitRec[] = [];
  /** `out`: how far out a bad bounce was (the bounce event's) */
  private bounces: { x: number; z: number; good: boolean; first: boolean; hit: number; out: number | null }[] = [];
  private nets: { x: number; y: number; tape: boolean; hit: number }[] = [];
  /** the last serve fault (a double fault is explained by the second one) */
  private fault: ServeFault | null = null;
  private tracks: Track[] = [];
  /**
   * The other side's players who planned to play our shot: whether they could reach it, the spot and moment of the
   * contact, and by how much they were short of it when the moment came (null: not yet, or they made it).
   */
  private tried: { pid: number; hit: number; reach: boolean; t: number; fx: number; fz: number; was: { t: number; x: number; z: number } | null; missBy: number | null }[] = [];
  /** doubles: a CPU partner of the human who went for the ball (and whether she could reach it) */
  private mateTry: { pid: number; hit: number; t: number; reach: boolean } | null = null;
  /** the match's rally count when this rally's shots began */
  private rallyNo = -1;
  /** every player's team, by id (read at each contact) */
  private teams: (0 | 1)[] = [];

  constructor(names: string[] = []) {
    this.names = names;
  }

  /** A new match (or a new point being set up). */
  reset() {
    this.hits = [];
    this.bounces = [];
    this.nets = [];
    this.tracks = [];
    this.tried = [];
    this.mateTry = null;
  }

  private teamOf(m: Match): 0 | 1 {
    return (m.players.find((p) => p.human)?.team ?? 0) as 0 | 1;
  }

  /** Once a frame, after the match has stepped: what the circle asks and what the human's players do about it. */
  frame(m: Match) {
    const r = m.rally;
    if (m.phase !== 'rally' || !r?.last || !this.hits.length) return;
    const hit = this.hits.length - 1;
    const my = this.teamOf(m);
    if (r.last.team === my) {
      // our ball on its way: who on the other side goes for it, and how short of the contact they end up
      for (const p of m.players) {
        if (p.team === my) continue;
        let k = this.tried.find((x) => x.pid === p.id && x.hit === hit);
        if (p.plan) {
          if (!k) this.tried.push((k = { pid: p.id, hit, reach: p.plan.reach, t: p.plan.t, fx: p.plan.fx, fz: p.plan.fz, was: null, missBy: null }));
          Object.assign(k, { reach: p.plan.reach, t: p.plan.t, fx: p.plan.fx, fz: p.plan.fz });
        } else if (k && k.missBy === null && k.was && m.t >= k.t) {
          // (the moment has come and gone with no contact: where were the feet then, against what they can reach)
          const u = Math.max(0, Math.min(1, (k.t - k.was.t) / Math.max(1e-4, m.t - k.was.t)));
          const x = k.was.x + (p.x - k.was.x) * u;
          const z = k.was.z + (p.z - k.was.z) * u;
          const lunge = m.controllers[p.id]?.mover.lunge ?? 0;
          const tol = Math.max(0.5, 0.3 + lunge * Math.max(0, Math.min(1, CPU_LUNGE.time > 0 ? CPU_LUNGE.min + ((1 - CPU_LUNGE.min) * (k.t - p.moveFrom)) / CPU_LUNGE.time : 1)));
          k.missBy = Math.max(0.01, Math.hypot(k.fx - x, k.fz - z) - tol);
        }
        if (k) k.was = { t: m.t, x: p.x, z: p.z };
      }
      return;
    }
    for (const p of m.players) {
      if (p.team !== my) continue;
      if (!p.human) {
        // (a CPU partner: whether she went for it)
        if (p.plan) this.mateTry = { pid: p.id, hit, t: p.plan.t, reach: p.plan.reach };
        continue;
      }
      const tr = this.tracks.find((x) => x.pid === p.id && x.hit === hit);
      if (!tr) continue;
      const tg = m.targetFor(p.id);
      if (tg) {
        if (!tr.first) tr.first = { fx: tg.fx, fz: tg.fz, t: tg.t, reach: m.targetInfo(p.id)?.reach ?? 1 };
        tr.last = { fx: tg.fx, fz: tg.fz, t: tg.t };
      }
      // (the start of the run that counts: the last time he picked up 1 m/s towards the circle; a drift he was
      // already in and let die does not count as setting off)
      const ref = tr.last;
      if (ref && (tr.endD === null || m.t < ref.t)) {
        const dx = ref.fx - p.x;
        const dz = ref.fz - p.z;
        const d = Math.hypot(dx, dz);
        const vt = d > 1e-3 ? (p.vx * dx + p.vz * dz) / d : 0;
        if (vt >= 1 && !tr.going) {
          tr.going = true;
          tr.start = m.t - tr.t0;
        } else if (vt < 0.5 && tr.going && d > 0.3) tr.going = false;
      }
      if (ref && tr.endD === null && m.t >= ref.t - 1e-6) tr.endD = Math.hypot(ref.fx - p.x, ref.fz - p.z);
    }
  }

  /** Every event of the match, in order. Returns the explanation on a point. */
  event(m: Match, e: MatchEvent): Why | null {
    switch (e.type) {
      case 'serveSetup':
        this.reset();
        return null;
      case 'hit':
        this.onHit(m, e);
        return null;
      case 'bounce':
        if (this.hits.length) this.bounces.push({ x: e.x, z: e.z, good: e.good, first: e.first, hit: this.hits.length - 1, out: e.out ?? null });
        return null;
      case 'net':
        if (this.hits.length) this.nets.push({ x: e.x, y: e.y, tape: e.tape, hit: this.hits.length - 1 });
        return null;
      case 'fault':
        this.fault = e.fault;
        return null;
      case 'point': {
        let w: Why | null = null;
        try {
          w = this.explain(m, e);
        } catch (err) {
          // (an explanation is never worth breaking the game over)
          console.error(err);
        }
        return w;
      }
    }
    return null;
  }

  /**
   * The point's call for the banner and the stands, from the shot that decided it: a winner named by its shot
   * (`shout`, an i18n key: a smash, a passing shot past a player at the net, a lob over him, a drop shot, a drop volley,
   * a volley; nothing for a plain winner), an ace (`ace`), and for an error into the net or out whether it was forced
   * or unforced (`err`). `out`: how far out the ball landed (m; null if it never bounced). Read after the point event
   * (the rally's shots are kept until the next serve is set up).
   */
  callout(e: PointEvent): { shout: string | null; ace: boolean; err: 'forced' | 'unforced' | null; out: number | null; kind: ShotKind; pid: number } | null {
    const L = this.hits[this.hits.length - 1];
    if (!L) return null;
    const out = { shout: null as string | null, ace: false, err: null as 'forced' | 'unforced' | null, out: null as number | null, kind: L.kind, pid: L.pid };
    if (WON.has(e.reason) && L.team === e.winner) {
      if (L.kind === 'serve') out.ace = e.rally === 1;
      else {
        // (the other side at the net when it was hit: past them, a passing shot; over them, a lob)
        const net = L.at.some((a, i) => this.teams[i] !== undefined && this.teams[i] !== L.team && Math.abs(a.z) < AT_NET);
        if (L.kind === 'smash') out.shout = 'shout.smash';
        else if (L.kind === 'lob') out.shout = net ? 'shout.lob' : null;
        else if (GROUND.has(L.kind)) out.shout = net ? 'shout.pass' : null;
        else if (L.kind === 'drop' || L.kind === 'dink' || L.kind === 'speedup') out.shout = 'shout.' + L.kind;
      }
    } else if (e.reason === 'net' || e.reason === 'out') {
      const pid = e.fault ?? L.pid;
      const h = [...this.hits].reverse().find((x) => x.pid === pid) ?? L;
      out.err = this.forced(h) ? 'forced' : 'unforced';
      if (e.reason === 'out') {
        const hi = this.hits.indexOf(h);
        const b = this.bounces.find((x) => x.hit === hi && x.first && !x.good);
        out.out = b?.out ?? null;
      }
    }
    return out;
  }

  /**
   * Was this error forced (FORCED)? The ball came fast, gave him little time or had him at full stretch, or the other
   * side's shot before it was a hard one; a serve's is never forced (a double fault is the server's own), a return's
   * off a hard serve is.
   */
  private forced(h: HitRec): boolean {
    if (h.kind === 'serve') return false;
    const prev = [...this.hits].reverse().find((x) => x.team !== h.team && x.t < h.t);
    return (h.avail !== null && h.avail < FORCED.avail) || h.stretch >= FORCED.stretch || h.vin >= FORCED.vin || (!!prev && prev.speed >= FORCED.speed && !SOFT.has(prev.kind));
  }

  private onHit(m: Match, e: HitEvent) {
    // (a new rally with no serve set up before it, a training machine's ball: start over)
    if (this.hits.length && this.rallyNo !== m.stats.rallies) this.reset();
    this.rallyNo = m.stats.rallies;
    const p = m.players[e.pid];
    const r = m.rally;
    // (the flight as launched: read now unless something has already happened to it in this frame)
    const seg = r && r.last?.id === e.pid && r.shots === e.shot && r.bounces === 0 ? { ...r.seg } : null;
    const rec: HitRec = {
      pid: e.pid,
      team: p.team,
      kind: e.kind,
      intent: e.intent ?? null,
      hand: p.lastHit?.hand ?? 1,
      power: e.power ?? 0.5,
      timing: e.timing,
      x: e.x,
      y: e.y,
      z: e.z,
      speed: e.speed,
      shot: e.shot,
      shank: !!e.shank,
      clear: e.clear ?? null,
      tx: e.tx ?? e.x,
      tz: e.tz ?? e.z,
      pop: !!e.pop,
      stretch: e.stretch ?? 0,
      avail: e.avail ?? null,
      vin: e.vin ?? 0,
      t: p.lastHit?.t ?? m.t,
      seg,
      at: m.players.map((q) => ({ x: q.x, z: q.z, vx: q.vx, vz: q.vz })),
    };
    this.hits.push(rec);
    this.teams = m.players.map((q) => q.team);
    const my = this.teamOf(m);
    if (p.team !== my) {
      // the ball comes to us: follow what each human player does about it
      for (const q of m.players)
        if (q.team === my && q.human) this.tracks.push({ pid: q.id, hit: this.hits.length - 1, t0: rec.t, x0: q.x, z0: q.z, vx0: q.vx, vz0: q.vz, first: null, last: null, start: null, going: false, endD: null });
    }
  }

  // ------------------------------------------------------------------ phrasing
  private isMe(m: Match, pid: number) {
    return !!m.players[pid]?.human;
  }
  private name(pid: number) {
    return this.names[pid] ?? '?';
  }
  /** "your forehand" / "Siner's smash" (Spanish: "tu derecha" / "el remate de Siner") */
  private shot(m: Match, h: HitRec): string {
    // (a block is a dink or a drop with the tap's intent: named as what the player did; a groundstroke by its side)
    const k = h.intent === 'block' ? 'block' : h.kind === 'drive' ? (h.hand === 1 ? 'fh' : 'bh') : h.kind;
    const n = t('xn.' + k);
    return this.isMe(m, h.pid) ? t('xs.me', { n }) : t('xs.of', { a: t('xa.' + k), n, name: this.name(h.pid) });
  }
  /** the Spanish ending that agrees with the shot's name («la derecha se fue larga», «el revés se fue largo») */
  private gend(h: HitRec): string {
    const k = h.intent === 'block' ? 'block' : h.kind === 'drive' ? (h.hand === 1 ? 'fh' : 'bh') : h.kind;
    return t('xa.' + k) === 'la' ? 'a' : 'o';
  }
  private line(key: string, vars: Record<string, string>, tag: string | null, data: Why['data']): Why {
    return { key, vars, text: cap(t(key, vars)), tag, data };
  }

  // ------------------------------------------------------------------ the point
  private explain(m: Match, e: PointEvent): Why | null {
    const my = this.teamOf(m);
    const hits = this.hits;
    if (!hits.length) return null;
    const L = hits[hits.length - 1];
    const li = hits.length - 1;
    switch (e.reason) {
      case 'doubleFault':
        return this.serveFault(m, e, L, li);
      case 'net':
      case 'out':
        return this.error(m, e, L, li, my);
      case 'twoBounce': {
        const pid = e.fault ?? L.pid;
        return this.line(this.isMe(m, pid) ? 'x.twoReturnMe' : 'x.twoReturn', { name: this.name(pid) }, this.isMe(m, pid) ? 'return' : null, { rally: e.rally });
      }
      case 'winner':
      case 'miss':
      case 'letGo':
        // (an ace: the serve nobody touched, broadcast.ts isAce)
        if (L.kind === 'serve' && e.rally === 1) return this.line(this.isMe(m, L.pid) ? 'x.aceMe' : 'x.ace', { S: this.shot(m, L) }, null, { ace: true, speed: L.speed });
        return L.team === my ? this.ourWinner(m, e, L, li) : this.theirWinner(m, e, L, li, my);
      case 'body': {
        // the ball hit a player of the receiving team: the hitter's point (ITF)
        const pid = e.touched ?? -1;
        const me = pid >= 0 && this.isMe(m, pid);
        return this.line(me ? 'x.bodyMe' : pid >= 0 ? 'x.body' : 'x.bodyAny', { S: this.shot(m, L), name: pid >= 0 ? this.name(pid) : '' }, null, { reason: e.reason, kind: L.kind, speed: L.speed });
      }
    }
    return null;
  }

  private trackOf(hit: number, m: Match): Track | null {
    const me = m.players.find((p) => p.human);
    return this.tracks.find((x) => x.hit === hit && x.pid === me?.id) ?? this.tracks.find((x) => x.hit === hit) ?? null;
  }

  /** The cause of a bad shot, the most telling first (null: nothing stands out). */
  private cause(m: Match, h: HitRec, recvSide: 1 | -1, out: boolean, edge: number | null, longOut = false): { key: string; vars: Record<string, string>; tag: string | null; data: Why['data'] } | null {
    const me = this.isMe(m, h.pid);
    const nm = { name: this.name(h.pid) };
    const hz = Math.abs(h.at[h.pid]?.z ?? h.z);
    if (h.shank) return { key: me ? 'xc.shankMe' : 'xc.shank', vars: nm, tag: null, data: { shank: true } };
    if (me && (h.timing === 'early' || h.timing === 'late')) return { key: h.timing === 'early' ? 'xc.early' : 'xc.late', vars: {}, tag: 'release', data: { timing: h.timing } };
    if (me && h.kind !== 'serve' && !inHalf(h.tx, h.tz, recvSide)) return { key: 'xc.aimOut', vars: {}, tag: 'aimOut', data: { tx: h.tx, tz: h.tz } };
    if (me && out && edge !== null && edge < 0.4) return { key: 'xc.edge', vars: { d: fmtLen(Math.max(0.01, edge)) }, tag: 'edge', data: { edge } };
    if ((h.kind === 'speedup' || h.kind === 'drive') && h.y < NET_C - 0.05 && hz < AT_NET)
      return { key: me ? 'xc.lowMe' : 'xc.low', vars: { ...nm, d: fmtLen(h.y) }, tag: me ? 'netLow' : null, data: { y: h.y, hz } };
    if (h.avail !== null && h.avail < 0.45) return { key: me ? 'xc.rushMe' : 'xc.rush', vars: { ...nm, s: fmtSec(h.avail) }, tag: null, data: { avail: h.avail } };
    if (h.vin >= SPEED.vin) return { key: me ? 'xc.fastMe' : 'xc.fast', vars: { ...nm, v: fmtKmh(h.vin) }, tag: null, data: { vin: h.vin } };
    if (h.stretch >= 0.6) return { key: me ? 'xc.stretchMe' : 'xc.stretch', vars: nm, tag: null, data: { stretch: h.stretch } };
    if (me && h.timing === 'auto') return { key: 'xc.auto', vars: {}, tag: 'auto', data: { timing: 'auto' } };
    if (h.pop && longOut) return { key: me ? 'xc.popMe' : 'xc.pop', vars: { ...nm, n: String(h.shot) }, tag: null, data: { pop: true, shot: h.shot } };
    return null;
  }

  /** A ball into the net, or out: long or wide by so much (the faulting player's last shot). */
  private error(m: Match, e: PointEvent, L: HitRec, li: number, my: 0 | 1): Why | null {
    void li;
    const pid = e.fault ?? L.pid;
    const h = L.pid === pid ? L : [...this.hits].reverse().find((x) => x.pid === pid) ?? L;
    const hi = this.hits.indexOf(h);
    const recvSide = (h.team === 0 ? -1 : 1) as 1 | -1;
    let outcome: { key: string; vars: Record<string, string>; data: Why['data']; tag: string | null };
    if (e.reason === 'net') {
      const n = this.nets.find((x) => x.hit === hi && !x.tape) ?? this.nets[this.nets.length - 1];
      const below = n ? Math.max(0.01, netHeight(n.x) + R - n.y) : 0.01;
      outcome = { key: 'net', vars: { d: fmtLen(below) }, data: { below }, tag: SOFT.has(h.kind) ? 'netSoft' : null };
    } else {
      // where it landed: past the baseline (long) or outside the sideline (wide), and by how much
      const b = this.bounces.find((x) => x.hit === hi && x.first && !x.good);
      if (b) {
        const ox = Math.abs(b.x) - halfW() - LINE;
        const oz = Math.abs(b.z) - HL - LINE;
        const d = b.out ?? Math.max(0.01, ox, oz);
        const k = oz >= ox ? 'long' : 'wide';
        outcome = { key: k, vars: { d: fmtLen(Math.max(0.01, d)) }, data: { out: d, way: k }, tag: 'long' };
      } else outcome = { key: 'out', vars: {}, data: {}, tag: 'long' };
    }
    const mine = this.isMe(m, pid);
    // an error by the other side: did our shot before it force it?
    if (h.team !== my) {
      const prev = [...this.hits].reverse().find((x) => x.team === my && x.t < h.t);
      if (prev && (h.avail ?? 9) < 0.5) return this.line('x.forcedTime', { S: this.shot(m, prev), name: this.name(pid), s: fmtSec(h.avail ?? 0) }, null, { ...outcome.data, avail: h.avail });
      if (prev && prev.speed >= SPEED.fast && !SOFT.has(prev.kind)) return this.line('x.forced', { S: this.shot(m, prev), name: this.name(pid), v: fmtKmh(prev.speed) }, null, { ...outcome.data, speed: prev.speed });
      if (prev && h.y < 0.35 && !SOFT.has(prev.kind)) return this.line('x.forcedFeet', { S: this.shot(m, prev), name: this.name(pid), d: fmtLen(h.y) }, null, { ...outcome.data, y: h.y });
    }
    // (aimed close to a line: how far inside the baseline or the sideline the aim was)
    const edge = e.reason === 'net' ? null : Math.min(HL - Math.abs(h.tz), halfW() - Math.abs(h.tx));
    const c = this.cause(m, h, recvSide, e.reason !== 'net', edge, e.reason !== 'net');
    if (c) {
      const o = t('xo.' + outcome.key, outcome.vars);
      const tag = mine ? c.tag ?? outcome.tag : null;
      return this.line('x.cause', { C: t(c.key, c.vars), O: o }, tag, { ...outcome.data, ...c.data, cause: c.key });
    }
    return this.line('x.' + outcome.key, { S: this.shot(m, h), g: this.gend(h), ...outcome.vars }, mine ? outcome.tag : null, outcome.data);
  }

  /** A double fault: what the second serve did (into the net, long or wide of the box). */
  private serveFault(m: Match, e: PointEvent, L: HitRec, li: number): Why | null {
    const pid = e.fault ?? L.pid;
    const me = this.isMe(m, pid);
    const side = (L.team === 0 ? -1 : 1) as 1 | -1;
    const half = (m.rally?.serveHalf ?? 1) as 1 | -1;
    const b = this.bounces.find((x) => x.hit === li && x.first);
    // (key: the line's own, `xo`: the outcome as a cause's second half)
    let o: { key: string; xo: string; vars: Record<string, string>; data: Why['data'] };
    if (this.fault === 'serveNet') o = { key: 'net', xo: 'net', vars: {}, data: { fault: 'serveNet' } };
    else if (b && !b.good && b.z * side > 0 && Math.abs(b.z) > SERVICE + LINE) o = { key: 'long', xo: 'serveLong', vars: { d: fmtLen(Math.max(0.01, Math.abs(b.z) - SERVICE - LINE)) }, data: { long: Math.abs(b.z) - SERVICE } };
    else if (b && !b.good && b.z * side > 0) o = { key: 'side', xo: 'side', vars: {}, data: { side: true, bx: b.x } };
    else o = { key: 'miss', xo: 'serveMiss', vars: {}, data: { fault: 'serveOut' } };
    const sub = { S: this.shot(m, L), ...o.vars };
    if (me && !inServiceCourt(L.tx, L.tz, side, half)) return this.line('x.cause', { C: t('xc.aimOut'), O: t('xo.' + o.xo, o.vars) }, 'serve', { ...o.data, aimOut: true });
    if (me && L.timing === 'early') return this.line('x.cause', { C: t('xc.serveRing'), O: t('xo.' + o.xo, o.vars) }, 'serve', { ...o.data, timing: L.timing });
    return this.line('x.serve.' + o.key, sub, me ? 'serve' : null, o.data);
  }

  /**
   * The closest the ball of `h` came to (x0, z0) while it could still be played (on that side, between knee and
   * overhead height, until the second bounce), and when (s after the contact).
   */
  private closest(h: HitRec, x0: number, z0: number): { d: number; dt: number; land: { x: number; z: number } | null } | null {
    const s1 = h.seg;
    if (!s1) return null;
    const side = Math.sign(z0) || 1;
    const tg1 = groundTime(s1);
    const s2 = bounce(s1, tg1);
    const tg2 = groundTime(s2);
    const land = posAt(s1, tg1);
    let best: { d: number; dt: number } | null = null;
    const p = { x: 0, y: 0, z: 0 };
    for (let tt = s1.t0 + 0.02; tt < Math.min(tg2, s1.t0 + 4); tt += 1 / 60) {
      posAt(tt < tg1 ? s1 : s2, tt, p);
      if (p.z * side < 0.3 || p.y < 0.14 || p.y > 2.75) continue;
      const d = Math.hypot(p.x - x0, p.z - z0);
      if (!best || d < best.d) best = { d, dt: tt - s1.t0 };
    }
    return best ? { ...best, land: land.z * side > 0 ? { x: land.x, z: land.z } : null } : null;
  }

  /** Down the line or across, from where it was hit to where it lands. */
  private direction(h: HitRec, land: { x: number; z: number }): 'line' | 'cross' | null {
    const dx = Math.abs(land.x - h.x);
    if (dx < 1.3 && Math.abs(land.x) > 1.4) return 'line';
    if ((land.x * h.x < 0 && dx > 2) || (Math.abs(land.x) > 1.8 && dx >= 1.3)) return 'cross';
    return null;
  }

  /** Where a player stood, against where the ball went. */
  private where(x0: number, z0: number, land: { x: number; z: number } | null): string | null {
    if (Math.abs(z0) > HL - 1.2) return 'back';
    if (Math.abs(x0) < 0.9) return 'center';
    if (land && Math.sign(x0) !== Math.sign(land.x)) return 'other';
    return null;
  }

  /** We lost the point to their shot (a winner, or a ball we went for and did not reach). */
  private theirWinner(m: Match, e: PointEvent, L: HitRec, li: number, my: 0 | 1): Why | null {
    const opp = this.name(L.pid);
    const prev = this.hits[li - 1];
    const tape = this.nets.find((x) => x.hit === li && x.tape);
    if (tape) return this.line('x.tape', { S: this.shot(m, L) }, null, { tape: true });
    // 1) our previous shot sat up and they attacked it
    const attacked = ATTACK.has(L.kind) || (L.kind === 'drive' && L.y > NET_C + 0.15 && Math.abs(L.at[L.pid]?.z ?? L.z) < AT_NET);
    if (prev && prev.team === my && attacked) {
      const meP = this.isMe(m, prev.pid);
      if (prev.kind === 'lob' && L.kind === 'smash')
        return this.line('x.upLob', { name: opp, d: fmtLen(Math.abs(L.z)) }, meP ? 'lobShort' : null, { lobSmashed: true, at: Math.abs(L.z) });
      if (meP && prev.timing === 'auto' && (prev.clear ?? 0) >= 0.2 && Math.abs(prev.tx) < 1)
        return this.line('x.upAuto', { name: opp }, 'auto', { auto: true, clear: prev.clear });
      if (SOFT.has(prev.kind) && prev.clear !== null && prev.clear >= 0.3)
        return this.line('x.upDink', { S: this.shot(m, prev), name: opp, d: fmtLen(prev.clear) }, meP ? (prev.timing === 'auto' ? 'dinkHighAuto' : 'dinkHigh') : null, { clear: prev.clear, kind: prev.kind });
      if (!SOFT.has(prev.kind) && prev.kind !== 'lob' && prev.clear !== null && prev.clear >= 0.6)
        return this.line('x.upDink', { S: this.shot(m, prev), name: opp, d: fmtLen(prev.clear) }, meP ? 'driveHigh' : null, { clear: prev.clear, kind: prev.kind });
    }
    // 2) a ball we went for: why the human did not get there
    const tr = this.trackOf(li, m);
    if (e.reason === 'miss' && tr && tr.first) {
      const w = this.whyMiss(m, tr);
      if (w) return w;
    }
    // doubles: the partner went for it and did not make it
    const mt = this.mateTry;
    if (e.reason === 'miss' && mt && mt.hit === li && (!tr || !tr.first)) return this.line('x.mateMiss', { name: this.name(mt.pid), s: fmtSec(mt.t - L.t) }, null, { mate: mt.pid, took: mt.t - L.t });
    // 3) the shot itself, against whoever of us it went past
    let rcv = -1;
    let near: { d: number; dt: number; land: { x: number; z: number } | null } | null = null;
    for (const p of m.players) {
      if (p.team !== my) continue;
      const a = L.at[p.id];
      const c = a ? this.closest(L, a.x, a.z) : null;
      if (c && (!near || c.d < near.d)) {
        near = c;
        rcv = p.id;
      }
    }
    if (!near || rcv < 0) return this.line('x.winner', { S: this.shot(m, L) }, null, {});
    const meR = this.isMe(m, rcv);
    const a = L.at[rcv];
    const who = { me: meR, name: this.name(rcv) };
    const data = { d: near.d, dt: near.dt, rx: a.x, rz: a.z, speed: L.speed, kind: L.kind };
    const atNet = (z: number) => Math.abs(z) < AT_NET;
    if (L.kind === 'lob' && atNet(a.z)) {
      const both = m.doubles && m.players.every((p) => p.team !== my || atNet(L.at[p.id].z));
      return this.line(both ? 'x.lobUs' : meR ? 'x.lobMe' : 'x.lob', { name: opp, who: who.name }, meR ? 'lobbed' : null, data);
    }
    if (SOFT.has(L.kind) && Math.abs(a.z) > SERVICE) return this.line(meR ? 'x.shortMe' : 'x.short', { S: this.shot(m, L), who: who.name, d: fmtLen(Math.abs(a.z)) }, null, data);
    // (fast and close: no time to react; fast and far, the distance is the story)
    if (L.speed >= SPEED.fast && near.dt < 0.6 && near.d <= 1.5) return this.line('x.fast', { S: this.shot(m, L), v: fmtKmh(L.speed), s: fmtSec(near.dt) }, null, data);
    const dir = near.land && atNet(a.z) ? this.direction(L, near.land) : null;
    const wh = this.where(a.x, a.z, near.land);
    if (dir && wh && wh !== 'back') return this.line(meR ? 'x.passMe' : 'x.pass', { dir: t('xd.' + dir), name: opp, who: who.name, w: t('xw.' + wh) }, null, { ...data, dir, where: wh });
    return this.line(meR ? 'x.pastMe' : 'x.past', { S: this.shot(m, L), who: who.name, d: fmtLen(near.d), s: fmtSec(near.dt) }, null, data);
  }

  /** The human went for the ball and did not get there: late, too far, or stopped short. */
  private whyMiss(m: Match, tr: Track): Why | null {
    const p = m.players[tr.pid];
    const f = tr.first!;
    const T = f.t - tr.t0;
    const D = Math.hypot(f.fx - tr.x0, f.fz - tr.z0);
    const reach = f.reach;
    // pushing straight at the first circle from the other side's contact plus `react` s: does he get within reach?
    const can = (react: number) => this.gapAt(tr, react, f.fx, f.fz, f.t, p.speed) <= reach + 0.02;
    const start = tr.start;
    const data = { took: T, dist: D, start, reach, can35: can(SEE), canOwn: start !== null ? can(start) : false, endD: tr.endD };
    const vars = { s: fmtSec(T), d: fmtLen(D) };
    const short = () => this.line('x.missShort', { d: fmtLen(Math.max(0.01, (tr.endD ?? D) - reach)) }, 'short', data);
    // (in reach from the start, or set off in time: he stopped short or went the wrong way)
    if (D <= reach + 0.15) return short();
    // not even a person's reaction got there
    if (!data.can35) return this.line('x.far', vars, null, data);
    if (start === null) return this.line('x.still', vars, 'still', data);
    if (data.canOwn) return short();
    return this.line('x.late', vars, 'late', data);
  }

  /** How far from (fx, fz) a player still is at time tc, pushing straight at it from react s after the other side's contact. */
  private gapAt(tr: Track, react: number, fx: number, fz: number, tc: number, speed: number): number {
    const st = { vx: tr.vx0, vz: tr.vz0 };
    let x = tr.x0;
    let z = tr.z0;
    const h = 1 / 120;
    for (let tt = tr.t0; tt < tc - 1e-9; tt += h) {
      let wx = 0;
      let wz = 0;
      if (tt - tr.t0 >= react) {
        const dx = fx - x;
        const dz = fz - z;
        const d = Math.hypot(dx, dz);
        const want = Math.min(speed, d < 0.006 ? 0 : Math.sqrt(2 * HUMAN_FEET.park * (d - 0.004)));
        if (d > 1e-4) {
          wx = (dx / d) * want;
          wz = (dz / d) * want;
        }
      }
      footStep(st, wx, wz, h, speed, HUMAN_FEET as Feet);
      x += st.vx * h;
      z += st.vz * h;
    }
    return Math.hypot(fx - x, fz - z);
  }

  /** We won the point with our shot (a winner, or a ball they went for and did not reach). */
  private ourWinner(m: Match, e: PointEvent, L: HitRec, li: number): Why | null {
    const prev = this.hits[li - 1];
    const tape = this.nets.find((x) => x.hit === li && x.tape);
    if (tape) return this.line('x.tape', { S: this.shot(m, L) }, null, { tape: true });
    const meL = this.isMe(m, L.pid);
    // their previous shot sat up and we attacked it
    const attacked = ATTACK.has(L.kind) || (L.kind === 'drive' && L.y > NET_C + 0.15 && Math.abs(L.at[L.pid]?.z ?? L.z) < AT_NET);
    if (prev && prev.team !== L.team && attacked && SOFT.has(prev.kind) && prev.clear !== null && prev.clear >= 0.3)
      return this.line(meL ? 'w.upMe' : 'x.upDink', { S: this.shot(m, prev), name: this.name(L.pid), d: fmtLen(prev.clear) }, null, { clear: prev.clear });
    // against whoever of them went for it, or else the one it went closest past
    const went = this.tried.filter((x) => x.hit === li);
    let rcv = -1;
    let near: { d: number; dt: number; land: { x: number; z: number } | null } | null = null;
    for (const p of m.players) {
      if (p.team === L.team || (went.length && !went.some((x) => x.pid === p.id))) continue;
      const a = L.at[p.id];
      const c = a ? this.closest(L, a.x, a.z) : null;
      if (c && (!near || c.d < near.d)) {
        near = c;
        rcv = p.id;
      }
    }
    if (!near || rcv < 0) return this.line('w.plain', { S: this.shot(m, L) }, null, {});
    const a = L.at[rcv];
    const name = this.name(rcv);
    const tried = this.tried.find((x) => x.pid === rcv && x.hit === li);
    const data = { d: near.d, dt: near.dt, rx: a.x, rz: a.z, speed: L.speed, kind: L.kind, tried: !!tried };
    const S = this.shot(m, L);
    const atNet = (z: number) => Math.abs(z) < AT_NET;
    if (L.kind === 'lob' && atNet(a.z)) return this.line('w.lob', { S, name }, null, data);
    if (SOFT.has(L.kind) && Math.abs(a.z) > SERVICE) return this.line('w.short', { S, name, d: fmtLen(Math.abs(a.z)) }, null, data);
    if (near.d <= 0.7 && near.dt < 0.7) return this.line('w.body', { S, name }, null, data);
    if (L.speed >= SPEED.fast && near.dt < 0.6) return this.line('w.fast', { S, v: fmtKmh(L.speed), name, s: fmtSec(near.dt) }, null, data);
    const dir = near.land && atNet(a.z) ? this.direction(L, near.land) : null;
    const wh = this.where(a.x, a.z, near.land);
    if (meL && dir && wh && wh !== 'back') return this.line('w.pass', { dir: t('xd.' + dir), name, w: t('xw.' + wh) }, null, { ...data, dir, where: wh });
    if (tried?.missBy) return this.line('w.miss', { S, name, d: fmtLen(tried.missBy) }, null, { ...data, missBy: tried.missBy });
    return this.line('w.past', { S, name, d: fmtLen(near.d) }, null, data);
  }
}

/**
 * Tips between points when the same mistake keeps coming back (the tags of the explanations): at most one every few
 * points, the same one not again for a while, and only for the human's own patterns.
 */
export const COACH = {
  /** points looked back over, and how many of them must show a pattern (`few`: rarer, telling ones) */
  window: 8,
  many: 3,
  few: 2,
  /** points between two tips, and before the same tip again */
  gap: 5,
  again: 14,
};
const FEW = new Set(['serve', 'return', 'aimOut', 'release']);
/** which tip each pattern gets (several patterns share one) */
const TIP: Record<string, string> = {
  dinkHigh: 'tipx.dinkHigh',
  netSoft: 'tipx.netSoft',
  dinkHighAuto: 'tipx.auto',
  auto: 'tipx.auto',
  driveHigh: 'tipx.driveHigh',
  netLow: 'tipx.netLow',
  late: 'tipx.late',
  still: 'tipx.still',
  short: 'tipx.short',
  long: 'tipx.long',
  edge: 'tipx.edge',
  aimOut: 'tipx.aimOut',
  serve: 'tipx.serve',
  return: 'tipx.return',
  release: 'tipx.release',
  lobShort: 'tipx.lobShort',
  lobbed: 'tipx.lobbed',
};

export class Coach {
  private hist: (string | null)[] = [];
  private n = 0;
  private lastTip = -99;
  private shown = new Map<string, number>();

  reset() {
    this.hist = [];
    this.n = 0;
    this.lastTip = -99;
    this.shown.clear();
  }

  /** A point was played (with the pattern it showed, if any): the tip to show now (an i18n key), or null. */
  push(tag: string | null): string | null {
    this.n++;
    this.hist.push(tag);
    if (this.hist.length > COACH.window) this.hist.shift();
    if (!tag || !TIP[tag] || this.n - this.lastTip < COACH.gap) return null;
    const key = TIP[tag];
    const same = this.hist.filter((x) => x && TIP[x] === key).length;
    if (same < (FEW.has(tag) ? COACH.few : COACH.many)) return null;
    if (this.n - (this.shown.get(key) ?? -99) < COACH.again) return null;
    this.lastTip = this.n;
    this.shown.set(key, this.n);
    return key;
  }
}

