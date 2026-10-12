// Offline render harness for src/audio.ts (tools/audio/render.py drives it in Chromium).
// The engine is built against an OfflineAudioContext: `window.AudioContext` is swapped for a factory that hands out
// the offline context, and `performance.now` follows its clock (the engine's rate limits read it). Two entry points:
//   __renderSuite(names?)       every sound of SUITE alone, through the whole chain (master bus, reverb, limiter)
//   __renderTimeline(tl, dur)   a recorded match (tools/audio/record.py): every call at its time, the crowd bed
//                               ticked at 30 fps, the engine's state (crowdBase, tension, replayMode) as it was
// tools/audio/build.mjs swaps the import below for another version of the engine (e.g. 0.2's, from git show).
import { Audio } from '../../src/audio';

type Call = { t: number; f: string; a: unknown[] };
type Eng = Record<string, unknown>;
const SR = 44100;

/** a seeded Math.random, so two engines get the same jitter */
function seed(n: number) {
  let s = n | 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** a fresh engine on a fresh offline context of `dur` seconds (the samples decoded, when the engine has them) */
async function engine(dur: number): Promise<{ a: Audio; ctx: OfflineAudioContext }> {
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  (window as unknown as { AudioContext: unknown }).AudioContext = function () {
    return ctx;
  };
  // (an hour into the page, as in a game: the engine's rate limits measure from 0)
  performance.now = () => (3600 + ctx.currentTime) * 1000;
  const a = new Audio();
  a.unlock();
  const ready = (a as unknown as { ready?: Promise<unknown> }).ready;
  if (ready) await ready;
  // (the crowd's buffers are rendered in later tasks)
  await new Promise((r) => setTimeout(r, 150));
  return { a, ctx };
}

function call(a: Audio, c: Call) {
  const e = a as unknown as Eng;
  if (c.f === 'set') e[c.a[0] as string] = c.a[1];
  else if (typeof e[c.f] === 'function') (e[c.f] as (...x: unknown[]) => void).apply(a, c.a);
}

/** 16-bit stereo PCM, base64 (to Python) */
function pcm(b: AudioBuffer): string {
  const l = b.getChannelData(0);
  const r = b.numberOfChannels > 1 ? b.getChannelData(1) : l;
  const out = new Int16Array(l.length * 2);
  let clip = 0;
  for (let i = 0; i < l.length; i++) {
    const x = l[i];
    const y = r[i];
    if (Math.abs(x) > 1 || Math.abs(y) > 1) clip++;
    out[i * 2] = Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
    out[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(y * 32767)));
  }
  const u8 = new Uint8Array(out.buffer);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  (window as unknown as { __clip: number }).__clip = clip;
  return btoa(s);
}

/** Calls at their times: grouped by render quantum (suspend() takes one per quantum), the bed ticked at 30 fps. */
async function timeline(tl: Call[], dur: number, tick = true): Promise<string> {
  const { a, ctx } = await engine(dur);
  const q = 128 / SR;
  const groups = new Map<number, Call[]>();
  const add = (t: number, c: Call) => {
    const k = Math.max(0, Math.round(t / q));
    if (k * q >= dur - 0.01) return;
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  };
  if (tick) for (let t = 0; t < dur; t += 1 / 30) add(t, { t, f: 'loops', a: ['stadium', 1 / 30] });
  for (const c of tl) add(c.t, c);
  for (const [k, cs] of [...groups.entries()].sort((x, y) => x[0] - y[0])) {
    // (the frame's state first, then the sounds, then the bed's tick)
    cs.sort((x, y) => (x.f === 'set' ? -1 : x.f === 'loops' ? 1 : 0) - (y.f === 'set' ? -1 : y.f === 'loops' ? 1 : 0));
    if (k === 0) cs.forEach((c) => call(a, c));
    else
      ctx.suspend(k * q).then(() => {
        cs.forEach((c) => call(a, c));
        ctx.resume();
      });
  }
  return pcm(await ctx.startRendering());
}

/** one sound alone: its calls (at t = 0.1 s unless they say), and the bed if it asks for one */
type Item = { name: string; dur: number; calls: Call[]; tick?: boolean };
const at = (f: string, ...a: unknown[]): Call => ({ t: 0.1, f, a });
const pad = (kind: string, speed: number, power: number, special: string | null = null, pan = 0, far = 0): Call => at('paddle', kind, speed, pan, far, false, power, special);
const SUITE: Item[] = [
  { name: 'pala chiquita', dur: 1.5, calls: [pad('dink', 8, 0.3)] },
  { name: 'pala dejada', dur: 1.5, calls: [pad('drop', 9, 0.35)] },
  { name: 'pala bloqueo', dur: 1.5, calls: [pad('auto', 11, 0.3)] },
  { name: 'pala globo', dur: 1.5, calls: [pad('lob', 12, 0.45)] },
  { name: 'pala saque', dur: 1.5, calls: [pad('serve', 14, 0.5)] },
  { name: 'pala drive 0.5', dur: 1.5, calls: [pad('drive', 16, 0.5)] },
  { name: 'pala drive 0.9', dur: 1.5, calls: [pad('drive', 21, 0.9)] },
  { name: 'pala volea', dur: 1.5, calls: [pad('volley', 15, 0.6)] },
  { name: 'pala bandeja', dur: 1.5, calls: [pad('bandeja', 15, 0.6)] },
  { name: 'pala vibora', dur: 1.5, calls: [pad('vibora', 20, 0.85)] },
  { name: 'pala bajada', dur: 1.5, calls: [pad('bajada', 19, 0.8)] },
  { name: 'pala remate 1.0', dur: 1.5, calls: [pad('smash', 24, 1)] },
  { name: 'pala por 3', dur: 1.5, calls: [pad('smash', 27, 1, 'por3')] },
  { name: 'pala por 4', dur: 1.5, calls: [pad('smash', 25, 1, 'por4')] },
  { name: 'pala drive lejos', dur: 1.5, calls: [pad('drive', 16, 0.5, null, 0.4, 1)] },
  { name: 'cristal suave', dur: 1.5, calls: [at('wall', 'glass', 0.3, 0, 0)] },
  { name: 'cristal fuerte', dur: 1.5, calls: [at('wall', 'glass', 0.9, 0, 0)] },
  { name: 'cristal lejos', dur: 1.5, calls: [at('wall', 'glass', 0.6, -0.5, 1)] },
  { name: 'malla', dur: 1.5, calls: [at('wall', 'mesh', 0.6, 0, 0)] },
  { name: 'bote', dur: 1.5, calls: [at('courtBounce', 0.75, 0, 0)] },
  { name: 'bote muerto', dur: 1.5, calls: [at('courtBounce', 0.3, 0, 0, true)] },
  { name: 'zapatilla', dur: 1.5, calls: [at('squeak', 0.7, 0, 0)] },
  { name: 'red cinta', dur: 1.5, calls: [at('play', 'tape')] },
  { name: 'red malla', dur: 1.5, calls: [at('play', 'net')] },
  { name: 'ui click', dur: 1, calls: [at('play', 'click')] },
  { name: 'ui punto', dur: 1.5, calls: [at('play', 'point')] },
  { name: 'ui perdido', dur: 1.5, calls: [at('play', 'lost')] },
  { name: 'ui falta', dur: 1.5, calls: [at('play', 'fault')] },
  { name: 'ui sting', dur: 1.5, calls: [at('play', 'sting')] },
  { name: 'ui victoria', dur: 2.5, calls: [at('play', 'win')] },
  { name: 'arbitro chime', dur: 2, calls: [at('chime', false)] },
  { name: 'publico uy', dur: 2.5, calls: [at('ooh', 1)] },
  { name: 'publico aplauso', dur: 4.5, calls: [at('applause', 0.55)] },
  { name: 'publico rugido', dur: 5, calls: [at('roar', 1)] },
  // the bed alone (a match: crowdBase 1), and a long rally's tension
  { name: 'publico murmullo', dur: 6, calls: [{ t: 0, f: 'set', a: ['crowdBase', 1] }], tick: true },
  { name: 'publico tension', dur: 6, calls: [{ t: 0, f: 'set', a: ['crowdBase', 1] }, { t: 0, f: 'set', a: ['tension', 1] }], tick: true },
];

const w = window as unknown as Record<string, unknown>;
w.__suite = SUITE.map((s) => s.name);
w.__renderSuite = async (names?: string[]) => {
  const out: Record<string, string> = {};
  for (const s of SUITE) {
    if (names && !names.includes(s.name)) continue;
    seed(7);
    out[s.name] = await timeline(s.calls, s.dur, !!s.tick);
  }
  return out;
};
w.__renderTimeline = async (tl: Call[], dur: number) => {
  seed(11);
  return timeline(tl, dur, true);
};
/** how long the engine takes after the unlocking tap: the tap itself, the takes (fetch + decode), the crowd's buffers (ms) */
w.__decodeTime = async () => {
  const ctx = new AudioContext();
  const a = new Audio();
  (window as unknown as { AudioContext: unknown }).AudioContext = function () {
    return ctx;
  };
  const t0 = performance.now();
  a.unlock();
  const tap = performance.now() - t0;
  const ready = (a as unknown as { ready?: Promise<unknown> }).ready;
  if (ready) await ready;
  const takes = performance.now() - t0;
  const e = a as unknown as { roarBufs?: unknown[] };
  for (let i = 0; i < 200 && e.roarBufs && !e.roarBufs.length; i++) await new Promise((r) => setTimeout(r, 10));
  return { tap: Math.round(tap), takes: Math.round(takes), crowd: Math.round(performance.now() - t0) };
};
w.__harnessReady = true;
