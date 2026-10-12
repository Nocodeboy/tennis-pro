// The sound of the match. The ball's contacts are recorded sounds (AI-made, assets/sfx: the racket hard and soft and
// the bounce; recorded for the padel game, they do for tennis until there are tennis takes; see FAMILIES), placed
// where they happen (pan by x, the far end quieter and duller) in an open stadium (a generated impulse response). The
// bounce and the shoes depend on the court's surface (`surface`): a hard court rings and squeaks, clay is duller and
// the shoes slide on it, grass is soft and nearly silent underfoot. The rest is synthesised live with WebAudio: the
// net, the shoes, and the crowd, whose murmur, «uy», roar and applause are rendered once into buffers from many voices
// and hands (no recording of a crowd: no licences). Tennis manners: the stands go quiet while the ball is in play
// (`inPlay`) and applaud after the point. Without the files (a failed fetch, an old browser) every contact falls back
// to its synthesised version.
// Music is made with AI (Magnific, Google Lyria 3 Pro) and played from files next to the page (assets/music, see
// setMusicTracks): decoded into WebAudio buffers and looped between two points without a gap. Menus only: in a match
// the crowd is the sound, as on TV.
//
// The mix (tools/audio measures it): everything in the stadium (contacts, crowd, the umpire's chime) goes dry to the
// master and through a send to the reverb; the menus' clicks and jingles stay dry; a limiter at the end. The levels
// are set so a drive and the crowd's applause sit together, the soft touches 6–8 dB under them, the murmur 15 dB under.

type Mode = 'menu' | 'game' | 'none';
/** a piece of music: its file and where its loop starts and ends (s; without them the whole file loops) */
export interface Track {
  url: string;
  loopStart?: number;
  loopEnd?: number;
  /** its level (0 … 1) */
  vol?: number;
}

/**
 * The recorded takes, by family (assets/sfx; tools/audio/prep-sfx.py trims them to the onset and evens them out). The
 * files keep their padel names (pala = paddle, bote = bounce): the racket uses the paddle's takes for now.
 */
const FAMILIES = {
  hard: ['pala-fuerte-1', 'pala-fuerte-2'],
  soft: ['pala-suave-1', 'pala-suave-2'],
  bounce: ['bote-1', 'bote-2'],
} as const;
/** the court's surface (sim/court.ts CourtSurface) */
export type Surface = 'hard' | 'clay' | 'grass';
/**
 * How a bounce sounds on each surface, over the recorded take: its level, pitch and the low-pass on it (a hard court
 * as recorded, bright; clay duller and a little lower, with the grit of the clay; grass soft, low and short), and the
 * shoes: a squeak on a hard court, a slide on clay, almost nothing on grass (`shoes`: how loud; `slide`: the scrape's
 * length).
 */
const SURF: Record<Surface, { v: number; rate: number; lp: number; grit: number; shoes: number; squeak: boolean; slide: number }> = {
  hard: { v: 1, rate: 1.04, lp: 16000, grit: 0, shoes: 1, squeak: true, slide: 0 },
  clay: { v: 0.85, rate: 0.92, lp: 3600, grit: 0.035, shoes: 1.1, squeak: false, slide: 0.22 },
  grass: { v: 0.62, rate: 0.86, lp: 2000, grit: 0, shoes: 0.35, squeak: false, slide: 0.06 },
};
type Family = keyof typeof FAMILIES;
const SFX_DIR = 'assets/sfx/';
/** a decoded take and where its sound starts (the decoder may add a few ms of silence before it) */
interface Take {
  buf: AudioBuffer;
  start: number;
}
/** the levels of the mix (linear gains on the takes, which come evened out at about −16 LUFS over their first 120 ms) */
const LVL = { hard: 0.62, soft: 0.3, bounce: 0.36, bed: 0.05, voices: 0.2, claps: 0.6, rev: 0.42 };

export class Audio {
  ctx: AudioContext | null = null;
  /** settles when the takes are decoded (or have failed: the synthesised sounds stand in) */
  ready: Promise<void> = Promise.resolve();
  private master!: GainNode;
  private sfx!: GainNode;
  /** the arena: everything that happens on the court and in the stands (dry), and the reverb's input */
  private arena!: GainNode;
  private verb!: GainNode;
  private ui!: GainNode;
  private musicGain!: GainNode;
  private noise!: AudioBuffer;
  sfxOn = true;
  musicOn = true;
  private tracks: Partial<Record<Exclude<Mode, 'none'>, Track>> = {};
  private buffers: Partial<Record<Exclude<Mode, 'none'>, AudioBuffer | 'loading' | 'failed'>> = {};
  private playing: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicMode: Mode = 'none';
  private ducked = false;
  private last: Record<string, number> = {};
  private takes: Partial<Record<Family, Take[]>> = {};
  private picked: Partial<Record<Family, number>> = {};
  // the crowd: a murmur bed of many voices (two copies of one loop, apart in time, rate and pan), and its reactions
  private bedGain!: GainNode;
  private bedF!: BiquadFilterNode;
  private bedOn = false;
  private clapBufs: AudioBuffer[] = [];
  private oohBufs: AudioBuffer[] = [];
  private roarBufs: AudioBuffer[] = [];
  /** 0 … 1: how loud the crowd murmurs at rest (0.4 behind the menus, 1 in a match) */
  crowdBase = 0;
  /** 0 … 1: a long rally, the stands grow tense (between the points: during the point they hold their breath) */
  tension = 0;
  /** the ball is in play (from the serve's setup to the end of the point): the stands are quiet */
  inPlay = false;
  /** the court's surface: the bounce and the shoes (SURF) */
  surface: Surface = 'hard';
  /** how quiet the stands go while the ball is in play (a fraction of the murmur left) */
  private quiet = 1;
  /** a replay is on: the bed is lower and the sounds of the replay are slowed down */
  replayMode = false;
  /** (the time the replay mode went on: a replay that never says it ended lets the bed back up after 25 s) */
  private replaySince = -1;
  private swell = 0;
  private hush = 0;

  setMusicTracks(t: Partial<Record<Exclude<Mode, 'none'>, Track>>) {
    this.tracks = t;
  }

  /** Must be called from a user gesture (the first tap unlocks audio on mobile; the takes load then). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    // the end of the chain: a limiter (fast, high ratio) that only catches the peaks of a loud moment
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 2;
    lim.ratio.value = 14;
    lim.attack.value = 0.002;
    lim.release.value = 0.14;
    lim.connect(ctx.destination);
    this.master = ctx.createGain();
    // (0.4's sounds sat at about −36 LUFS in a match, quiet on a phone; these at about −28)
    this.master.gain.value = 1.3;
    this.master.connect(lim);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);
    this.arena = ctx.createGain();
    this.arena.connect(this.sfx);
    this.ui = ctx.createGain();
    this.ui.connect(this.sfx);
    // the stadium: a light reverb (about 1.3 s, darker as it fades) under the court's sounds
    const conv = ctx.createConvolver();
    conv.buffer = arenaIR(ctx);
    this.verb = ctx.createGain();
    const ret = ctx.createGain();
    ret.gain.value = LVL.rev;
    this.verb.connect(conv).connect(ret).connect(this.sfx);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.4;
    this.musicGain.connect(this.master);
    // white noise for the synthesised sounds
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // the murmur's level and colour, moved every frame (crowd())
    this.bedF = ctx.createBiquadFilter();
    this.bedF.type = 'lowpass';
    this.bedF.frequency.value = 2400;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0;
    this.bedF.connect(this.bedGain);
    this.bedGain.connect(this.arena);
    const bs = ctx.createGain();
    bs.gain.value = 0.6;
    this.bedGain.connect(bs).connect(this.verb);
    this.ready = this.loadTakes(ctx);
    // the crowd's buffers are rendered a moment later, one per task, so the tap that unlocked does not wait for them
    const later = (f: () => void) => setTimeout(f, 0);
    later(() => {
      this.startBed(babbleBuffer(ctx));
      later(() => {
        this.clapBufs = [applauseBuffer(ctx), applauseBuffer(ctx)];
        later(() => {
          this.oohBufs = [voicesBuffer(ctx, 'ooh'), voicesBuffer(ctx, 'ooh')];
          later(() => (this.roarBufs = [voicesBuffer(ctx, 'roar')]));
        });
      });
    });
    if (this.musicMode !== 'none') this.music(this.musicMode, true);
  }

  /** Fetches and decodes the takes (in parallel); a family whose files fail keeps its synthesised sound. */
  private loadTakes(ctx: BaseAudioContext): Promise<void> {
    const one = (name: string) =>
      fetch(`${SFX_DIR}${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${name}: ${r.status}`))))
        .then((ab) => new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(ab, res, rej)))
        .then((buf): Take => ({ buf, start: onset(buf) }));
    const fams = Object.keys(FAMILIES) as Family[];
    return Promise.all(
      fams.map((f) =>
        Promise.all(FAMILIES[f].map(one))
          .then((t) => {
            this.takes[f] = t;
          })
          .catch((err) => console.warn('sfx: synthesised fallback for', f, err)),
      ),
    ).then(() => undefined);
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.value = on ? 1 : 0;
  }
  setMusic(on: boolean) {
    this.musicOn = on;
    if (!on) this.stopMusic(0.4);
    else this.music(this.musicMode, true);
  }

  /** The music for a screen: the menus' theme, the match's (none: the crowd is the match's sound) or silence. */
  music(mode: Mode, force = false) {
    if (mode === this.musicMode && !force) return;
    this.musicMode = mode;
    this.stopMusic(1.2);
    if (mode === 'none' || !this.musicOn || !this.ctx) return;
    const tr = this.tracks[mode];
    if (!tr) return;
    const buf = this.buffers[mode];
    if (buf instanceof AudioBuffer) this.startMusic(mode, buf, tr);
    else if (!buf) this.loadTrack(mode, tr);
  }

  private loadTrack(mode: Exclude<Mode, 'none'>, tr: Track) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.buffers[mode] = 'loading';
    fetch(tr.url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((b) => {
        this.buffers[mode] = b;
        // (still wanted once it has loaded: it starts then)
        if (this.musicMode === mode && this.musicOn && !this.playing) this.startMusic(mode, b, tr);
      })
      .catch((err) => {
        this.buffers[mode] = 'failed';
        console.warn('music skipped:', err);
      });
  }

  private startMusic(mode: Exclude<Mode, 'none'>, buf: AudioBuffer, tr: Track) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (tr.loopEnd && tr.loopEnd <= buf.duration) {
      src.loopStart = tr.loopStart ?? 0;
      src.loopEnd = tr.loopEnd;
    }
    const gain = ctx.createGain();
    const vol = (tr.vol ?? 1) * (this.ducked ? 0.3 : 1);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + (mode === 'menu' ? 0.6 : 1.5));
    src.connect(gain).connect(this.musicGain);
    src.start();
    this.playing = { src, gain };
  }

  private stopMusic(fade: number) {
    const p = this.playing;
    if (!p || !this.ctx) return;
    this.playing = null;
    const t = this.ctx.currentTime;
    p.gain.gain.cancelScheduledValues(t);
    p.gain.gain.setValueAtTime(p.gain.gain.value, t);
    p.gain.gain.linearRampToValueAtTime(0, t + fade);
    p.src.stop(t + fade + 0.05);
  }

  /** the music lower (a dialog, the pause) */
  duck(on: boolean) {
    this.ducked = on;
    const p = this.playing;
    if (!p || !this.ctx || this.musicMode === 'none') return;
    const vol = (this.tracks[this.musicMode]?.vol ?? 1) * (on ? 0.3 : 1);
    p.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.15);
  }

  // ---------- continuous ----------
  /** Every frame: the crowd's murmur follows the match (`kind`: the venue; there is one, the stadium). */
  loops(_kind: string, dt: number) {
    const c = this.ctx;
    if (!c) return;
    this.crowd(dt, c.currentTime);
  }

  stopLoops() {
    const c = this.ctx;
    if (!c) return;
    this.bedGain.gain.setTargetAtTime(0, c.currentTime, 0.1);
  }

  private startBed(buf: AudioBuffer) {
    const c = this.ctx;
    if (!c || this.bedOn) return;
    this.bedOn = true;
    // two copies of the loop, apart in time and rate and on either side: no period to hear, a wide bed
    for (const [rate, pan, off] of [
      [0.97, -0.55, 0],
      [1.04, 0.55, buf.duration * 0.47],
    ]) {
      const s = c.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = rate;
      const p = c.createStereoPanner ? c.createStereoPanner() : null;
      if (p) {
        p.pan.value = pan;
        s.connect(p).connect(this.bedF);
      } else s.connect(this.bedF);
      s.start(c.currentTime, off);
    }
  }

  /**
   * The murmur of the stands: an uneven bed, almost silent while the ball is in play (it settles in about a second as
   * the server gets ready, and comes back as the point ends), louder and brighter after every swell, hushed on demand.
   */
  private crowd(dt: number, t: number) {
    this.swell = Math.max(0, this.swell - dt * 0.35);
    this.hush = Math.max(0, this.hush - dt * 0.5);
    const want = this.inPlay ? 0.12 : 1;
    this.quiet += (want - this.quiet) * Math.min(1, dt * (this.inPlay ? 1.6 : 3));
    if (this.replayMode) {
      if (this.replaySince < 0) this.replaySince = t;
    } else this.replaySince = -1;
    const replay = this.replayMode && t - this.replaySince < 25;
    const wobble = 0.85 + 0.15 * Math.sin(t * 0.61) * Math.sin(t * 0.23 + 1);
    const base = this.crowdBase * wobble * this.quiet * (1 + (this.inPlay ? 0 : this.tension * 0.4)) * (1 - 0.75 * Math.min(1, this.hush)) * (replay ? 0.5 : 1);
    const lvl = LVL.bed * (base + this.swell * 1.4);
    this.bedGain.gain.setTargetAtTime(lvl, t, 0.15);
    this.bedF.frequency.setTargetAtTime(2000 + this.tension * 900 + this.swell * 2200, t, 0.3);
  }
  /** The stands get louder (0 … 1), then settle by themselves. */
  crowdSwell(x: number) {
    this.swell = Math.min(1.2, Math.max(this.swell, x));
  }
  /** Quiet in the stands (a big point being served): lasts about two seconds. */
  crowdHush() {
    this.hush = 1.4;
  }

  // ---------- placing a sound ----------
  /**
   * Where a sound of the court goes: a stereo position (−1 left … 1 right), and the reverb's send (`rev`, more of it
   * for the far end, whose dry sound is quieter and duller).
   */
  private place(node: AudioNode, pan: number, far: number, rev: number) {
    const c = this.ctx!;
    let out: AudioNode = node;
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      out = p;
    }
    out.connect(this.arena);
    if (rev > 0) {
      const s = c.createGain();
      s.gain.value = rev * (1 + far * 0.8);
      out.connect(s).connect(this.verb);
    }
  }

  /**
   * A take of a family: a different one from the last (when there are two or more), its pitch and level a little
   * different every time; the far end quieter (−5 dB) and duller (a low-pass from 16 kHz down to 3.5 kHz). False when
   * the family has no takes (the caller synthesises it).
   */
  private take(fam: Family, gain: number, o: { rate?: number; pan?: number; far?: number; lp?: number; rev?: number; delay?: number; eq?: [number, number] } = {}): boolean {
    const set = this.takes[fam];
    if (!set?.length) return false;
    const c = this.ctx!;
    let i = Math.floor(Math.random() * set.length);
    if (set.length > 1 && i === this.picked[fam]) i = (i + 1 + Math.floor(Math.random() * (set.length - 1))) % set.length;
    this.picked[fam] = i;
    const tk = set[i];
    const far = Math.max(0, Math.min(1, o.far ?? 0));
    const src = c.createBufferSource();
    src.buffer = tk.buf;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() - 0.5) * 0.07) * (this.replayMode ? 0.86 : 1);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    lp.frequency.value = Math.min(o.lp ?? 16000, 16000 * Math.pow(3500 / 16000, far));
    const g = c.createGain();
    g.gain.value = gain * (1 - 0.45 * far) * (1 + (Math.random() - 0.5) * 0.14);
    src.connect(lp);
    if (o.eq) {
      // (a bell: the band a phone's speaker can play, lifted)
      const pk = c.createBiquadFilter();
      pk.type = 'peaking';
      pk.frequency.value = o.eq[0];
      pk.gain.value = o.eq[1];
      pk.Q.value = 0.9;
      lp.connect(pk).connect(g);
    } else lp.connect(g);
    this.place(g, o.pan ?? 0, far, o.rev ?? 0.22);
    src.start(c.currentTime + (o.delay ?? 0), tk.start);
    return true;
  }

  // ---------- the ball ----------
  /**
   * The racket meeting the ball. The recorded takes: the soft family for the touches (a drop shot, a drop volley, a
   * block), the hard one for the firm shots (groundstrokes, the serve, volleys, the smash), and a crossfade between
   * the two by how hard it was meant (`power`, the hit event's: 0.5 a plain release), brighter and louder the harder;
   * the serve and the smash a notch lower and fuller, a slice a touch softer. `pan`: where on screen (−1 … 1); `far`:
   * 0 … 1 for the far end.
   */
  racket(kind: string, speed: number, pan = 0, far = 0, perfect = false, power = 0.5) {
    if (!this.ctx || !this.sfxOn) return;
    // (one contact is one sound: an echo of the same event within 30 ms is dropped)
    if (!this.limit('racket', 0.03)) return;
    const pw = Math.min(1, Math.max(0, power));
    // (tennis balls leave the racket at 15–55 m/s)
    const n = Math.min(1, Math.max(0, (speed - 10) / 35));
    const soft = kind === 'dink' || kind === 'drop' || kind === 'auto';
    const over = kind === 'smash' || kind === 'serve';
    // how much of the hard take: none for a touch; by the power for the rest (a placed ball 0.3 → soft, a flick → hard)
    const hard = soft ? 0 : Math.min(1, Math.max(0, (pw - 0.3) / 0.4 + (over ? 0.35 : 0) + n * 0.3 - (kind === 'slice' ? 0.25 : 0)));
    // the level: a still release −4 dB under a flick; the touches under both
    const lvl = soft ? 0.75 + 0.25 * n : 0.62 + 0.38 * Math.max(pw, n * 0.8);
    // pitch: the overheads a little lower and fuller, a lob a touch lower, a fast ball a touch higher
    const rate = (over ? 0.94 : kind === 'lob' ? 0.97 : 1) * (0.98 + n * 0.05);
    const o = { pan: pan * 0.6, far, rate, lp: 4200 + 11000 * Math.max(hard, n * 0.6) };
    // (an equal-power crossfade; the onsets are aligned at t = 0, so the two make one contact)
    const a = Math.cos((hard * Math.PI) / 2);
    const b = Math.sin((hard * Math.PI) / 2);
    let ok = true;
    if (a > 0.05) ok = this.take('soft', LVL.soft * lvl * a, o) && ok;
    if (b > 0.05) ok = this.take('hard', LVL.hard * lvl * b, o) && ok;
    if (!ok) this.racketSynth(kind, speed, pan, far, pw);
    if (perfect && !this.replayMode) {
      // the perfect timing: a small bright «ting» (the game's, not the court's: dry)
      this.tone(1568, 0.08, 'sine', 0.03, 0.02, undefined, this.ui);
      this.tone(2093, 0.12, 'sine', 0.025, 0.06, undefined, this.ui);
    }
  }
  /** (the padel name, kept for the tools that still call it) */
  paddle(kind: string, speed: number, pan = 0, far = 0, perfect = false, power = 0.5) {
    this.racket(kind, speed, pan, far, perfect, power);
  }

  /** the racket without its takes: a short pock of a triangle and filtered noise over a low thump (the strings' ping) */
  private racketSynth(kind: string, speed: number, pan: number, far: number, pw: number) {
    const o = this.out(pan * 0.6, far, 0.22, 2.2);
    const slow = this.replayMode ? 0.86 : 1;
    const n = Math.min(1, Math.max(0, (speed - 10) / 35));
    const dist = (1 - far * 0.4) * (0.8 + pw * 0.4);
    const j = 1 + (Math.random() - 0.5) * 0.06;
    if (kind === 'dink' || kind === 'drop' || kind === 'auto') {
      const f = 560 * j * slow;
      this.tone(f, 0.05, 'triangle', 0.075 * dist, 0, f * 0.7, o);
      this.tone(230 * slow, 0.05, 'sine', 0.06 * dist, 0, 126 * slow, o);
      this.noiseBurst(0.03, 'lowpass', 1500 * slow, 700, 0.05 * dist, 1.2, 0, o);
      return;
    }
    const f = (720 + n * 280) * j * slow;
    const v = (0.1 + n * 0.1) * dist;
    this.tone(f, 0.06, 'triangle', v, 0, f * 0.6, o);
    this.tone(f * 2.0, 0.025, 'sine', v * 0.28, 0, f * 1.4, o);
    this.noiseBurst(0.04, 'bandpass', (1800 + n * 700) * slow, 1000, v * 0.75, 1.8, 0, o);
    this.tone((200 + n * 40) * slow, 0.07, 'sine', v * 0.6, 0, 110 * slow, o);
  }

  /**
   * The ball on the court: a recorded bounce (live: by how hard it lands; dead: the little bounces after the point),
   * coloured by the surface (SURF): bright on a hard court, duller with a little grit on clay, soft and low on grass.
   */
  courtBounce(strength: number, pan = 0, far = 0, dead = false) {
    if (!this.ctx || !this.sfxOn) return;
    if (!this.limit(dead ? 'deadb' : 'bounce', 0.04)) return;
    const sf = SURF[this.surface] ?? SURF.hard;
    const s = Math.min(1, Math.max(0.05, strength));
    const v = (dead ? 0.55 * s : 0.6 + 0.4 * s) * sf.v;
    const rate = (dead ? 1.08 : 0.98 + s * 0.04) * sf.rate;
    const ok = this.take('bounce', LVL.bounce * v, { pan: pan * 0.6, far, rate, lp: sf.lp, rev: 0.16 });
    // (clay: the grit of the crushed brick under the ball, a short dry scratch)
    if (sf.grit > 0 && !dead) this.noiseBurst(0.05, 'bandpass', 3800, 2400, sf.grit * (0.5 + 0.5 * s) * (1 - far * 0.5), 1.1, 0.004, this.out(pan * 0.6, far, 0.1));
    if (ok) return;
    const o = this.out(pan * 0.6, far, 0.18, 3.5);
    const slow = this.replayMode ? 0.86 : 1;
    const g = (dead ? 0.05 : 0.06 + s * 0.07) * (1 - far * 0.35) * (dead ? s : 1) * sf.v;
    const f = (dead ? 560 : 470 + s * 120) * (1 + (Math.random() - 0.5) * 0.08) * slow * sf.rate;
    this.tone(f, 0.045, 'triangle', g, 0, f * 0.6, o);
    this.tone(f * 0.5, 0.06, 'sine', g * 0.6, 0, f * 0.35, o);
    this.noiseBurst(0.03, 'lowpass', Math.min(2400, sf.lp) * slow, 600, g * 0.9, 0.8, 0, o);
  }

  /**
   * Shoes on the court on a hard stop or a turn, by the surface: on a hard court the rubber squeaks (a short,
   * pitched chirp, the sound of hard-court tennis), on clay the shoe slides through the top dressing (a longer «shh»),
   * on grass almost nothing. Only on real stops (strength over 0.55), and rarely (one at a time, 1.2 s apart at least).
   */
  squeak(strength: number, pan = 0, far = 0) {
    if (!this.ctx || !this.sfxOn) return;
    if (strength < 0.55 || !this.limit('squeak', 1.2)) return;
    const sf = SURF[this.surface] ?? SURF.hard;
    const o = this.out(pan * 0.6, far, 0.12);
    const v = (0.018 + 0.03 * Math.min(1, strength)) * (1 - far * 0.6) * sf.shoes;
    if (sf.squeak) {
      // (the rubber's chirp: a pitched tone that bends up, over a little hiss)
      const f = 1900 + Math.random() * 900;
      const dur = 0.07 + Math.random() * 0.06;
      this.tone(f, dur, 'sine', v * 0.55, 0, f * (1.08 + Math.random() * 0.08), o);
      this.noiseBurst(dur, 'bandpass', f, f * 1.1, v * 0.5, 4, 0, o);
      return;
    }
    const dur = 0.09 + Math.random() * 0.07 + sf.slide;
    this.noiseBurst(dur, 'bandpass', 2600 + Math.random() * 1400, 1300, v, 0.9, 0, o);
  }

  // ---------- the stands and the umpire ----------
  /** The umpire's chime before the score is called (match point: three notes), through the stadium's PA. */
  chime(big = false) {
    if (!this.ctx || !this.sfxOn) return;
    const o = this.out(0, 0, 0.5);
    const notes = big ? [1175, 1480, 1760] : [1319, 1047];
    notes.forEach((f, i) => {
      this.tone(f, 0.42, 'sine', 0.032, i * 0.16, undefined, o);
      this.tone(f * 2, 0.2, 'sine', 0.006, i * 0.16, undefined, o);
    });
  }

  /** A crowd «uy» / «ooh» (a net cord, a ball just in or just out): many voices rising and falling on the vowel. */
  ooh(strength = 1) {
    if (!this.ctx || !this.sfxOn) return;
    if (!this.limit('ooh', 2.5)) return;
    const s = Math.min(1, Math.max(0.2, strength));
    this.voices(this.oohBufs, LVL.voices * (0.3 + 0.4 * s), 0.94 + Math.random() * 0.12);
    this.crowdSwell(0.3 * s);
  }

  /** Applause (0 … 1): many hands, rendered once into two buffers and played louder or softer, longer or shorter. */
  applause(strength = 1) {
    if (!this.ctx || !this.sfxOn || !this.clapBufs.length) return;
    if (!this.limit('applause', 0.8)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const s = Math.min(1, Math.max(0, strength));
    const src = c.createBufferSource();
    src.buffer = this.clapBufs[Math.floor(Math.random() * this.clapBufs.length)];
    src.playbackRate.value = 0.95 + Math.random() * 0.1;
    const g = c.createGain();
    const v = LVL.claps * (0.1 + 0.3 * s);
    const hold = 0.4 + s * 1.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.12);
    g.gain.setValueAtTime(v, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 1.6 + s * 0.8);
    src.connect(g);
    this.place(g, 0, 0, 0.45);
    src.start(t, Math.random() * 0.2);
    src.stop(t + hold + 2.6 + s);
  }

  /** The stands erupt: a roar of voices over applause, its size 0 … 1 (a great point, the match). */
  roar(strength = 1) {
    if (!this.ctx || !this.sfxOn) return;
    if (!this.limit('roar', 1.0)) return;
    const s = Math.min(1, Math.max(0.2, strength));
    this.voices(this.roarBufs, LVL.voices * (0.25 + 0.35 * s), 0.96 + Math.random() * 0.08);
    this.applause(0.4 + 0.6 * s);
    this.crowdSwell(0.6 + 0.4 * s);
  }

  /** one of the crowd's voice buffers (or, before they are rendered, nothing: the bed's swell says it) */
  private voices(bufs: AudioBuffer[], v: number, rate: number) {
    if (!bufs.length) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
    src.playbackRate.value = rate * (this.replayMode ? 0.9 : 1);
    const g = c.createGain();
    g.gain.value = v;
    src.connect(g);
    this.place(g, (Math.random() - 0.5) * 0.4, 0, 0.5);
    src.start(t);
  }

  // ---------- one-shots ----------
  private limit(key: string, gap: number): boolean {
    const now = performance.now();
    if (now - (this.last[key] ?? -1e9) < gap * 1000) return false;
    this.last[key] = now;
    return true;
  }

  /** a court sound's output: placed (pan, far) with a reverb send, as `place` does (`gain`: the fallbacks' make-up) */
  private out(pan: number, far = 0, rev = 0.22, gain = 1): AudioNode {
    const g = this.ctx!.createGain();
    g.gain.value = gain;
    this.place(g, pan, far, rev);
    return g;
  }

  private noiseBurst(dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 0.8, delay = 0, dest?: AudioNode) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.ui);
    src.start(t, Math.random() * 1.0, dur + 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number, dest?: AudioNode) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.ui);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** The menus' and the match's small sounds (the clicks, the point's sting) and the net. */
  play(name: string, n = 0) {
    if (!this.ctx || !this.sfxOn) return;
    switch (name) {
      case 'click':
        this.tone(900, 0.04, 'triangle', 0.07);
        break;
      case 'tick':
        this.tone(1500, 0.04, 'square', 0.02);
        break;
      case 'whoosh':
        this.noiseBurst(0.18, 'bandpass', 900, 2600, 0.05, 1.4);
        break;
      case 'net': {
        // the ball into the net: a soft thud into the cord and a rustle
        const o = this.out(0, 0, 0.2);
        if (!this.take('bounce', LVL.bounce * 0.7, { rate: 0.7, lp: 1100, rev: 0.2 })) this.tone(190, 0.08, 'sine', 0.06, 0, 120, o);
        this.noiseBurst(0.2, 'bandpass', 900, 420, 0.06, 0.9, 0.01, o);
        break;
      }
      case 'tape': {
        // the net cord: a sharp tick on the tape, the tape's thud and a short shiver of the net
        const o = this.out(0, 0, 0.2);
        this.noiseBurst(0.012, 'bandpass', 3600, 2800, 0.08, 2.5, 0, o);
        this.tone(190, 0.09, 'sine', 0.08, 0.005, 120, o);
        this.noiseBurst(0.12, 'bandpass', 900, 500, 0.05, 1.1, 0.02, o);
        break;
      }
      case 'perfect':
        this.tone(1568, 0.08, 'sine', 0.035, 0.02);
        this.tone(2093, 0.12, 'sine', 0.03, 0.06);
        break;
      // the point's result for the player: a soft two-note sting (the stands carry the moment, this only says whose)
      case 'point':
        [784, 1175].forEach((f, i) => this.tone(f, i ? 0.22 : 0.1, 'sine', 0.045, i * 0.07));
        break;
      case 'lost':
        [440, 370].forEach((f, i) => this.tone(f, i ? 0.22 : 0.1, 'sine', 0.04, i * 0.09));
        break;
      case 'fault':
        this.tone(330, 0.16, 'triangle', 0.045, 0, 280);
        this.tone(262, 0.24, 'triangle', 0.045, 0.13, 220);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? 0.6 : 0.15, 'triangle', 0.06, i * 0.11));
        [262, 330, 392].forEach((f) => this.tone(f, 0.9, 'sine', 0.04, 0.44));
        break;
      case 'lose':
        [392, 349, 311].forEach((f, i) => this.tone(f, i === 2 ? 0.5 : 0.18, 'triangle', 0.06, i * 0.16));
        break;
      case 'sting':
        // the replay's sting: a swoosh across and a bright tick
        this.noiseBurst(0.32, 'bandpass', 500, 3200, 0.06, 1.6);
        this.tone(1760, 0.12, 'sine', 0.025, 0.16, 2350);
        break;
    }
  }
}

/** where a take's sound starts: the first sample over 5 % of its peak, less a millisecond */
function onset(b: AudioBuffer): number {
  const d = b.getChannelData(0);
  let pk = 0;
  for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  const thr = pk * 0.05;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > thr) return Math.max(0, i / b.sampleRate - 0.001);
  return 0;
}

/**
 * The stadium's impulse response, lightly (about 1.3 s to −60 dB, a 12 ms gap before the first reflections, a handful
 * of early reflections off the stands, a tail that darkens as it fades; an open-air court, so the send is low).
 */
function arenaIR(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const rt = 1.3;
  const len = Math.floor(sr * 1.6);
  const b = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.012);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      // (the tail's low-pass closes as it fades: 0.55 → 0.08)
      const a = 0.08 + 0.47 * Math.exp(-t * 2.2);
      lp += ((Math.random() * 2 - 1) - lp) * a;
      d[i] = lp * Math.exp((-6.9 * t) / rt) * Math.min(1, t / 0.02);
    }
    for (const [ms, g] of [
      [17, 0.5],
      [23, 0.42],
      [31, 0.36],
      [43, 0.3],
      [57, 0.24],
      [71, 0.18],
    ]) {
      const i = pre + Math.floor((sr * (ms + (ch ? 3.1 : 0))) / 1000);
      if (i < len) d[i] += g * (ch ? -1 : 1);
    }
  }
  return b;
}

/** a resonant band-pass (RBJ), as coefficients for the voices' recurrences */
function bp(f: number, q: number, sr: number): [number, number, number, number] {
  const w = (2 * Math.PI * f) / sr;
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  return [al / a0, -al / a0, (-2 * Math.cos(w)) / a0, (1 - al) / a0];
}

/**
 * The murmur of the stands, rendered once (about 7 s, looped): two dozen people talking, each a voiced buzz with
 * breath through the formants of a vowel that changes syllable by syllable, in phrases with pauses, at different
 * distances. Mono, at 22 kHz (nothing of a murmur is above 8 kHz); the end crossfaded into the start.
 */
function babbleBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = 22050;
  const sec = 7;
  const len = Math.floor(sr * sec);
  const xf = Math.floor(sr * 0.6);
  const d = new Float32Array(len + xf);
  const VOW: [number, number][] = [
    [730, 1090],
    [530, 1840],
    [300, 2200],
    [570, 840],
    [330, 900],
    [660, 1720],
    [450, 1050],
  ];
  for (let v = 0; v < 26; v++) {
    const f0 = (Math.random() < 0.5 ? 100 : 180) + Math.random() * 70;
    const amp = 0.25 + Math.random() * 0.75;
    let ph = 0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, w1 = 0, w2 = 0;
    let i = Math.floor(Math.random() * sr * 0.8);
    while (i < len + xf) {
      // a phrase: 3 … 9 syllables, then a pause
      const syl = 3 + Math.floor(Math.random() * 7);
      for (let k = 0; k < syl && i < len + xf; k++) {
        const n = Math.floor(sr * (0.09 + Math.random() * 0.17));
        const [F1, F2] = VOW[Math.floor(Math.random() * VOW.length)];
        const c1 = bp(F1 * (0.9 + Math.random() * 0.2), 5, sr);
        const c2 = bp(F2 * (0.9 + Math.random() * 0.2), 7, sr);
        const p0 = f0 * (0.9 + Math.random() * 0.25);
        for (let j = 0; j < n && i < len + xf; j++, i++) {
          const u = j / n;
          const env = Math.sin(Math.PI * u) ** 1.5;
          ph += (p0 * (1 + 0.08 * (0.5 - u))) / sr;
          ph -= Math.floor(ph);
          const src = (ph * 2 - 1) * 0.6 + (Math.random() * 2 - 1) * 0.4;
          const o1 = c1[0] * src + c1[1] * x2 - c1[2] * y1 - c1[3] * y2;
          x2 = x1;
          x1 = src;
          y2 = y1;
          y1 = o1;
          const o2 = c2[0] * src + c2[1] * w2 - c2[2] * z1 - c2[3] * z2;
          w2 = w1;
          w1 = src;
          z2 = z1;
          z1 = o2;
          d[i] += (o1 + 0.6 * o2) * env * amp;
        }
      }
      i += Math.floor(sr * (0.15 + Math.random() * (Math.random() < 0.3 ? 1.2 : 0.3)));
    }
  }
  // the seam: the extra tail faded into the head
  for (let i = 0; i < xf; i++) {
    const u = i / xf;
    d[i] = d[i] * Math.sqrt(u) + d[len + i] * Math.sqrt(1 - u);
  }
  return toBuffer(ctx, d.subarray(0, len), sr, 0.5);
}

/**
 * The crowd's voices on one vowel, rendered once: «ooh» (an «uy» of 36 people: the pitch and the vowel rise and fall,
 * a second and a half) or «roar» (an «¡ah!» of 50, higher and breathier, near three seconds). Each voice a buzz with
 * jitter and its own entrance and length; the sum through the vowel's moving formants.
 */
function voicesBuffer(ctx: BaseAudioContext, kind: 'ooh' | 'roar'): AudioBuffer {
  const sr = 22050;
  const roar = kind === 'roar';
  const dur = roar ? 2.8 : 1.6;
  const len = Math.floor(sr * dur);
  const src = new Float32Array(len);
  const nv = roar ? 50 : 36;
  for (let v = 0; v < nv; v++) {
    const low = Math.random() < 0.6;
    const f0 = (roar ? (low ? 150 : 260) : low ? 115 : 205) * (0.85 + Math.random() * 0.35);
    const t0 = Math.random() * (roar ? 0.2 : 0.14);
    const t1 = (roar ? 1.6 : 0.9) + Math.random() * (roar ? 1.0 : 0.5);
    const amp = 0.3 + Math.random() * 0.7;
    const vib = 4 + Math.random() * 2;
    let ph = Math.random();
    for (let i = Math.floor(t0 * sr); i < len; i++) {
      const t = i / sr;
      if (t > t1) break;
      const u = (t - t0) / (t1 - t0);
      // the contour: up through the first third, down after (an «uy» falls further)
      const pc = roar ? 1 + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.4)) - 0.08 * u : 1 + 0.14 * Math.sin(Math.PI * Math.min(1, u * 1.6)) - 0.12 * u;
      ph += (f0 * pc * (1 + 0.012 * Math.sin(2 * Math.PI * vib * t) + (Math.random() - 0.5) * 0.02)) / sr;
      ph -= Math.floor(ph);
      const env = Math.min(1, (t - t0) / 0.08) * Math.pow(1 - u, roar ? 0.8 : 1.3);
      src[i] += (ph * 2 - 1) * env * amp;
    }
  }
  // breath and the noise of the room, then the vowel's formants moving over time (updated every 64 samples)
  const out = new Float32Array(len);
  const st = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let c1 = bp(400, 5, sr), c2 = bp(800, 6, sr), c3 = bp(2600, 4, sr);
  const breath = roar ? 0.55 : 0.3;
  for (let i = 0; i < len; i++) {
    if (i % 64 === 0) {
      const u = i / len;
      const rise = Math.sin(Math.PI * Math.min(1, u * (roar ? 1.3 : 1.7)));
      if (roar) {
        c1 = bp(680 + 120 * rise, 4, sr);
        c2 = bp(1150 + 250 * rise, 5, sr);
        c3 = bp(2600, 3, sr);
      } else {
        c1 = bp(320 + 120 * rise, 6, sr);
        c2 = bp(760 + 160 * rise, 7, sr);
        c3 = bp(2500, 4, sr);
      }
    }
    const env = Math.min(1, i / (sr * 0.1));
    const x = src[i] / Math.sqrt(nv) + (Math.random() * 2 - 1) * breath * env * Math.max(0, 1 - i / len);
    let y = 0;
    for (const [k, c, g] of [
      [0, c1, 1],
      [4, c2, 0.7],
      [8, c3, roar ? 0.35 : 0.15],
    ] as [number, [number, number, number, number], number][]) {
      const o = c[0] * x + c[1] * st[k + 1] - c[2] * st[k + 2] - c[3] * st[k + 3];
      st[k + 1] = st[k];
      st[k] = x;
      st[k + 3] = st[k + 2];
      st[k + 2] = o;
      y += o * g;
    }
    out[i] = y;
  }
  const fade = Math.floor(sr * 0.25);
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  return toBuffer(ctx, out, sr, 0.8);
}

/** a Float32Array into a mono AudioBuffer at its rate, its peak at `peak` */
function toBuffer(ctx: BaseAudioContext, d: Float32Array, sr: number, peak: number): AudioBuffer {
  let pk = 0;
  for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  const k = pk > 0 ? peak / pk : 1;
  const b = ctx.createBuffer(1, d.length, sr);
  const o = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) o[i] = d[i] * k;
  return b;
}

/**
 * Applause, rendered once (about 3.4 s): seven hundred hand claps, each a short burst of noise through the ring of the
 * cupped hands (a band-pass between 0.8 and 2.6 kHz), dense at the start and thinning out.
 */
function applauseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = 22050;
  const len = Math.floor(sr * 3.4);
  const d = new Float32Array(len);
  for (let c = 0; c < 700; c++) {
    const u = Math.random();
    const at = Math.floor(sr * 3.1 * u * u * (0.3 + 0.7 * Math.random()));
    const n = Math.floor(sr * (0.006 + Math.random() * 0.01));
    const amp = 0.2 + Math.random() * 0.8;
    const k = bp(800 + Math.random() * 1800, 1.5 + Math.random() * 2.5, sr);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < n * 3 && at + i < len; i++) {
      const x = i < n ? (Math.random() * 2 - 1) * Math.exp((-5 * i) / n) : 0;
      const y = k[0] * x + k[1] * x2 - k[2] * y1 - k[3] * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      d[at + i] += y * amp;
    }
  }
  for (let i = 0; i < len; i++) d[i] *= Math.min(1, i / (sr * 0.03), (len - i) / (sr * 0.4));
  return toBuffer(ctx, d, sr, 0.9);
}

export const audio = new Audio();

export function vibrate(ms: number | number[]) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
