// Sound effects are synthesised live with WebAudio (no licences, ~0 KB). From the studio engine (Wild Putt).
// Music is played from audio files when available (see setMusicTracks).

type Mode = 'menu' | 'game' | 'none';

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicGain!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private birdT = 0; // next ambient sound (bird, gull, fair tune…)
  sfxOn = true;
  musicOn = true;
  private tracks: Partial<Record<Exclude<Mode, 'none'>, string>> = {};
  private musicEl: HTMLAudioElement | null = null;
  private musicMode: Mode = 'none';
  private last: Record<string, number> = {};
  // the crowd: a murmur bed that follows the play, and applause rendered once
  private crowdGain!: GainNode;
  private crowdF!: BiquadFilterNode;
  private crowdF2!: BiquadFilterNode;
  private clapBuf: AudioBuffer | null = null;
  /** 0 … 1: how loud the crowd murmurs at rest (0 in the menus) */
  crowdBase = 0;
  /** 0 … 1: a long rally, the stands grow tense (a little louder, then hushed before the decisive ball) */
  tension = 0;
  /** a replay is on: the bed is lower and the sounds of the replay are slowed down */
  replayMode = false;
  private swell = 0;
  private hush = 0;

  setMusicTracks(t: Partial<Record<Exclude<Mode, 'none'>, string>>) {
    this.tracks = t;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    // white noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // wind over the meadow (low-passed noise; rain in the storm)
    const cr = ctx.createBufferSource();
    cr.buffer = this.noise;
    cr.loop = true;
    cr.playbackRate.value = 0.5;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    cr.connect(this.windFilter).connect(this.windGain).connect(this.sfx);
    cr.start();
    // the crowd's murmur: noise through two voice-like bands, its level moved every frame (see crowd())
    const cn = ctx.createBufferSource();
    cn.buffer = this.noise;
    cn.loop = true;
    cn.playbackRate.value = 0.73;
    this.crowdF = ctx.createBiquadFilter();
    this.crowdF.type = 'bandpass';
    this.crowdF.frequency.value = 480;
    this.crowdF.Q.value = 0.9;
    this.crowdF2 = ctx.createBiquadFilter();
    this.crowdF2.type = 'peaking';
    this.crowdF2.frequency.value = 1150;
    this.crowdF2.gain.value = 6;
    this.crowdF2.Q.value = 1.4;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    cn.connect(this.crowdF).connect(this.crowdF2).connect(this.crowdGain).connect(this.sfx);
    cn.start();
    this.clapBuf = applauseBuffer(ctx);
    if (this.musicMode !== 'none') this.music(this.musicMode, true);
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.value = on ? 1 : 0;
  }
  setMusic(on: boolean) {
    this.musicOn = on;
    if (!on && this.musicEl) this.musicEl.pause();
    if (on) this.music(this.musicMode, true);
  }

  music(mode: Mode, force = false) {
    if (mode === this.musicMode && !force) return;
    this.musicMode = mode;
    const src = mode === 'none' ? undefined : this.tracks[mode];
    if (this.musicEl) {
      const old = this.musicEl;
      const fade = setInterval(() => {
        old.volume = Math.max(0, old.volume - 0.08);
        if (old.volume <= 0.01) {
          old.pause();
          clearInterval(fade);
        }
      }, 40);
      this.musicEl = null;
    }
    if (!src || !this.musicOn || !this.ctx) return;
    const el = new window.Audio(src);
    el.loop = true;
    el.volume = 0;
    el.play().catch(() => undefined);
    const target = mode === 'game' ? 0.32 : 0.42;
    const up = setInterval(() => {
      el.volume = Math.min(target, el.volume + 0.03);
      if (el.volume >= target) clearInterval(up);
    }, 60);
    this.musicEl = el;
  }

  duck(on: boolean) {
    if (this.musicEl) this.musicEl.volume = on ? 0.12 : this.musicMode === 'game' ? 0.32 : 0.42;
  }

  // ---------- continuous ----------
  /** Ambience of each course: wind and birds, the sea, the city, the fair, the glacier wind or the volcano's rumble. */
  loops(kind: string, dt: number) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const gust = 0.5 + 0.5 * Math.sin(t * 0.37) * Math.sin(t * 0.11);
    const cfg: Record<string, [number, number]> = {
      lawn: [0.03, 450],
      // a stadium at night: no birds, only the low air of the bowl under the crowd's murmur
      stadium: [0.012, 220],
      street: [0.05, 300],
      sea: [0.09, 700],
      fairground: [0.04, 900],
      ice: [0.08, 1200],
      magma: [0.1, 140],
      beach: [0.08, 600],
      desert: [0.07, 1100],
      castle: [0.03, 500],
      city: [0.05, 220],
      canyon: [0.09, 900],
      space: [0.02, 160],
    };
    const [g, f] = cfg[kind] ?? cfg.lawn;
    const swell = kind === 'sea' || kind === 'beach' ? 0.5 + 0.5 * Math.sin(t * 0.8) : gust;
    this.windGain.gain.setTargetAtTime(g * (0.6 + swell * 0.8), t, 0.5);
    this.windFilter.frequency.setTargetAtTime(f * (0.7 + swell * 0.6), t, 0.5);
    this.crowd(dt, t);
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 1.5 + Math.random() * 4;
      if (kind === 'lawn' || kind === 'castle') this.bird();
      else if (kind === 'beach' && Math.random() < 0.5) {
        this.tone(1400, 0.25, 'sawtooth', 0.02, 0, 1900);
        this.tone(1900, 0.3, 'sawtooth', 0.018, 0.22, 1200);
      } else if (kind === 'space' && Math.random() < 0.4) this.tone(1200 + Math.random() * 800, 0.08, 'sine', 0.012, 0, 1600)
      else if (kind === 'sea' && Math.random() < 0.6) {
        // a gull
        this.tone(1400, 0.25, 'sawtooth', 0.02, 0, 1900);
        this.tone(1900, 0.3, 'sawtooth', 0.018, 0.22, 1200);
      } else if (kind === 'fairground' && Math.random() < 0.5) {
        [784, 988, 1175].forEach((fq, i) => this.tone(fq, 0.18, 'triangle', 0.015, i * 0.16));
      } else if (kind === 'magma') this.tone(45 + Math.random() * 15, 1.2, 'sine', 0.06, 0, 30);
    }
  }

  stopLoops() {
    const c = this.ctx;
    if (!c) return;
    this.windGain.gain.setTargetAtTime(0, c.currentTime, 0.1);
    this.crowdGain.gain.setTargetAtTime(0, c.currentTime, 0.1);
  }

  /** The murmur of the stands: a slow, uneven bed; louder with a long rally and with every swell, hushed on demand. */
  private crowd(dt: number, t: number) {
    this.swell = Math.max(0, this.swell - dt * 0.4);
    this.hush = Math.max(0, this.hush - dt * 0.5);
    const wobble = 0.8 + 0.2 * Math.sin(t * 1.7) * Math.sin(t * 0.53 + 1);
    const base = this.crowdBase * 0.024 * wobble * (1 - 0.7 * Math.min(1, this.hush)) * (this.replayMode ? 0.6 : 1);
    const lvl = base + this.tension * this.crowdBase * 0.012 + this.swell * 0.11;
    this.crowdGain.gain.setTargetAtTime(lvl, t, 0.12);
    this.crowdF.frequency.setTargetAtTime(460 + this.swell * 520 + this.tension * 80, t, 0.25);
  }
  /** The stands get louder (0 … 1), then settle by themselves. */
  crowdSwell(x: number) {
    this.swell = Math.min(1.2, Math.max(this.swell, x));
  }
  /** Quiet in the stands (a match point being served): lasts about two seconds. */
  crowdHush() {
    this.hush = 1.4;
  }

  /** a stereo position (−1 left … 1 right) to play through, or the plain output */
  private out(pan: number): AudioNode {
    const c = this.ctx!;
    if (!pan || !c.createStereoPanner) return this.sfx;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfx);
    return p;
  }

  /**
   * The padel paddle meeting the ball: a solid «pock» (a pressurised felt ball on a foam-cored, perforated face), lower
   * and rounder than pickleball's hollow plastic click. Its pitch, brightness and weight follow the shot (a chiquita or
   * a dejada is a soft, muffled touch; a drive a full pock; a bandeja a sliced, brushed one; a remate or a víbora a
   * crack with a thump) and how fast it leaves. `pan`: where on screen (−1 … 1); `far`: 0 … 1 for the far end.
   */
  paddle(kind: string, speed: number, pan = 0, far = 0, perfect = false) {
    if (!this.ctx || !this.sfxOn) return;
    const slow = this.replayMode ? 0.78 : 1;
    const n = Math.min(1, Math.max(0, (speed - 5) / 18));
    const o = this.out(pan * 0.6);
    const dist = 1 - far * 0.35;
    const j = 1 + (Math.random() - 0.5) * 0.06;
    // (the body of every contact: a short low thump of the foam core under the face)
    const body = (f: number, v: number, dur = 0.06) => this.tone(f * slow, dur, 'sine', v * dist, 0, f * 0.55 * slow, o);
    if (kind === 'dink' || kind === 'drop' || kind === 'auto') {
      // a soft touch: muffled, short, the felt more than the face
      const f = 560 * j * slow;
      this.tone(f, 0.05, 'triangle', 0.075 * dist, 0, f * 0.7, o);
      body(230, 0.06, 0.05);
      this.noiseBurst(0.03, 'lowpass', 1500 * slow, 700, 0.05 * dist, 1.2, 0, o);
    } else if (kind === 'smash' || kind === 'vibora' || kind === 'speedup') {
      const f = (900 + n * 220) * j * slow;
      this.noiseBurst(0.014, 'highpass', 4200, 2600, 0.13 * dist, 0.7, 0, o);
      this.tone(f, 0.06, 'triangle', (0.15 + n * 0.06) * dist, 0, f * 0.55, o);
      this.tone(f * 2.05, 0.03, 'sine', 0.04 * dist, 0, f * 1.5, o);
      this.noiseBurst(0.07, 'bandpass', 2600 * slow, 1100, 0.17 * dist, 1.4, 0, o);
      body(kind === 'speedup' ? 200 : 150, kind === 'speedup' ? 0.1 : 0.17, kind === 'speedup' ? 0.07 : 0.15);
      // the víbora's slice: a brush of the face across the felt
      if (kind === 'vibora') this.noiseBurst(0.09, 'bandpass', 5200 * slow, 2400, 0.06 * dist, 2.2, 0.004, o);
    } else if (kind === 'bandeja') {
      // controlled, sliced: a rounder pock with the brush of the cut
      const f = (760 + n * 180) * j * slow;
      this.tone(f, 0.06, 'triangle', 0.12 * dist, 0, f * 0.6, o);
      body(190, 0.09);
      this.noiseBurst(0.08, 'bandpass', 4600 * slow, 2200, 0.05 * dist, 2, 0.003, o);
      this.noiseBurst(0.03, 'bandpass', 1900 * slow, 1000, 0.08 * dist, 1.6, 0, o);
    } else {
      // drives, returns, serves, lobs, volleys: the full pock, brighter and louder the harder it is hit
      const lob = kind === 'lob';
      const f = (700 + n * 300 - (lob ? 80 : 0)) * j * slow;
      const v = (0.1 + n * 0.12) * dist;
      this.noiseBurst(0.01, 'highpass', 3600, 2200, v * 0.4, 0.7, 0, o);
      this.tone(f, lob ? 0.075 : 0.06, 'triangle', v, 0, f * 0.6, o);
      this.tone(f * 2.0, 0.025, 'sine', v * 0.28, 0, f * 1.4, o);
      this.noiseBurst(0.04, 'bandpass', (1800 + n * 700) * slow, 1000, v * 0.75, 1.8, 0, o);
      body(210 + n * 40, 0.06 + n * 0.05);
    }
    if (perfect && !this.replayMode) {
      this.tone(1568, 0.09, 'sine', 0.06, 0.02, undefined, o);
      this.tone(2093, 0.14, 'sine', 0.05, 0.07, undefined, o);
    }
  }

  /**
   * The ball meets a wall. The glass: a deep, short thud of the thick panel (a low knock with a little ring of the
   * glass on top). The mesh: a metallic rattle of the wire panel that shivers for a moment. `k`: 0 … 1 how hard.
   */
  wall(surface: 'glass' | 'mesh', k: number, pan = 0, far = 0) {
    if (!this.ctx || !this.sfxOn) return;
    if (!this.limit('wall', 0.05)) return;
    const s = Math.min(1, Math.max(0.15, k));
    const slow = this.replayMode ? 0.8 : 1;
    const o = this.out(pan * 0.7);
    const dist = 1 - far * 0.4;
    const j = 1 + (Math.random() - 0.5) * 0.08;
    if (surface === 'glass') {
      const v = (0.08 + s * 0.14) * dist;
      // the knock of the panel: a low sine that drops, a muffled noise body, a faint ring of the glass
      this.tone(118 * j * slow, 0.16 + s * 0.06, 'sine', v, 0, 62 * slow, o);
      this.tone(240 * j * slow, 0.07, 'triangle', v * 0.45, 0, 150 * slow, o);
      this.noiseBurst(0.06, 'lowpass', 900 * slow, 260, v * 0.9, 0.9, 0, o);
      this.tone(2650 * j * slow, 0.12, 'sine', v * 0.07, 0.004, 2580 * slow, o);
    } else {
      const v = (0.05 + s * 0.09) * dist;
      // the wire: a bright clank, then a short rattle of the panel against its frame
      this.noiseBurst(0.02, 'highpass', 3800, 2400, v * 0.8, 0.8, 0, o);
      this.noiseBurst(0.26 + s * 0.1, 'bandpass', 1600 * slow, 700, v * 0.9, 3.5, 0, o);
      for (let i = 0; i < 5; i++) this.tone((520 + Math.random() * 380) * slow, 0.035, 'square', v * 0.22 * (1 - i * 0.15), i * 0.028 + Math.random() * 0.01, 300 * slow, o);
      this.tone(140 * slow, 0.08, 'sine', v * 0.5, 0, 90 * slow, o);
    }
  }

  /** The ball on the court: a dull "tock" (live: by how hard it lands; dead: the little bounces after the point). */
  courtBounce(strength: number, pan = 0, far = 0, dead = false) {
    if (!this.ctx || !this.sfxOn) return;
    if (!this.limit(dead ? 'deadb' : 'bounce', 0.04)) return;
    const s = Math.min(1, Math.max(0.05, strength));
    const slow = this.replayMode ? 0.8 : 1;
    const o = this.out(pan * 0.6);
    const v = (dead ? 0.05 : 0.06 + s * 0.07) * (1 - far * 0.35) * (dead ? s : 1);
    const f = (dead ? 560 : 470 + s * 120) * (1 + (Math.random() - 0.5) * 0.08) * slow;
    this.tone(f, 0.045, 'triangle', v, 0, f * 0.6, o);
    this.tone(f * 0.5, 0.06, 'sine', v * 0.6, 0, f * 0.35, o);
    this.noiseBurst(0.03, 'lowpass', 2400 * slow, 600, v * 0.9, 0.8, 0, o);
  }

  /** Sneakers on the acrylic: a short rubbery squeal on a hard stop or a turn. */
  squeak(strength: number, pan = 0, far = 0) {
    if (!this.ctx || !this.sfxOn) return;
    if (!this.limit('squeak', 0.12)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = this.out(pan * 0.6);
    const dur = 0.07 + Math.random() * 0.07;
    const f = 1700 + Math.random() * 900;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * (1.08 + Math.random() * 0.1), t + dur * 0.5);
    osc.frequency.linearRampToValueAtTime(f * 0.92, t + dur);
    // the rubber chatters: a fast wobble of the pitch
    const lfo = c.createOscillator();
    lfo.frequency.value = 38 + Math.random() * 20;
    const depth = c.createGain();
    depth.gain.value = f * 0.06;
    lfo.connect(depth).connect(osc.frequency);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 1.1;
    bp.Q.value = 3;
    const g = c.createGain();
    const v = (0.022 + 0.03 * Math.min(1, strength)) * (1 - far * 0.45);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.setValueAtTime(v, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(bp).connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.03);
    lfo.stop(t + dur + 0.03);
  }

  /** The umpire's chime before the score is called (match point: three notes). */
  chime(big = false) {
    if (!this.ctx || !this.sfxOn) return;
    const notes = big ? [1175, 1480, 1760] : [1319, 1047];
    notes.forEach((f, i) => {
      this.tone(f, 0.42, 'sine', 0.045, i * 0.16);
      this.tone(f * 2, 0.2, 'sine', 0.01, i * 0.16);
    });
  }

  /** A crowd "ooh": voices rising and falling through the vowel (a net cord, a ball just in or just out). */
  ooh(strength = 1) {
    if (!this.ctx || !this.sfxOn) return;
    if (!this.limit('ooh', 1.2)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const v = 0.07 + 0.06 * Math.min(1, strength);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.18);
    g.gain.setValueAtTime(v, t + 0.42);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    g.connect(this.sfx);
    // two formants of an "oo" sliding up and back, fed by noise and a chorus of low voices
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 7;
    f1.frequency.setValueAtTime(310, t);
    f1.frequency.linearRampToValueAtTime(420, t + 0.35);
    f1.frequency.linearRampToValueAtTime(330, t + 1.1);
    const f2 = c.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 6;
    f2.frequency.setValueAtTime(760, t);
    f2.frequency.linearRampToValueAtTime(900, t + 0.35);
    f2.frequency.linearRampToValueAtTime(720, t + 1.1);
    f1.connect(g);
    f2.connect(g);
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const ng = c.createGain();
    ng.gain.value = 1.6;
    src.connect(ng);
    ng.connect(f1);
    ng.connect(f2);
    src.start(t, Math.random(), 1.4);
    for (let i = 0; i < 7; i++) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      const f = 150 + Math.random() * 130;
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.12, t + 0.35);
      o.frequency.linearRampToValueAtTime(f * 0.94, t + 1.1);
      const og = c.createGain();
      og.gain.value = 0.06;
      o.connect(og);
      og.connect(f1);
      og.connect(f2);
      o.start(t + Math.random() * 0.06);
      o.stop(t + 1.35);
    }
    this.crowdSwell(0.35 * strength);
  }

  /** Applause (0 … 1): many hands, rendered once into a buffer and played louder or softer. */
  applause(strength = 1) {
    if (!this.ctx || !this.sfxOn || !this.clapBuf) return;
    if (!this.limit('applause', 0.8)) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.clapBuf;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = c.createGain();
    const v = 0.05 + 0.13 * Math.min(1, strength);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.08);
    g.gain.setValueAtTime(v, t + 0.6 + strength);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6 + strength * 0.6);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    src.connect(hp).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.3);
  }

  /** The stands erupt: a roar of voices ("ah") over applause, its size 0 … 1. */
  roar(strength = 1) {
    if (!this.ctx || !this.sfxOn) return;
    if (!this.limit('roar', 1.0)) return;
    const s = Math.min(1, Math.max(0.2, strength));
    const c = this.ctx;
    const t = c.currentTime;
    const dur = 1.6 + s * 1.2;
    const g = c.createGain();
    const v = 0.05 + 0.08 * s;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.15);
    g.gain.setValueAtTime(v, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.sfx);
    for (const [f, q] of [
      [700, 4],
      [1220, 5],
      [2600, 3],
    ]) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      bp.connect(g);
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      src.connect(bp);
      src.start(t, Math.random(), dur + 0.1);
    }
    this.applause(s);
    this.crowdSwell(0.6 + 0.4 * s);
  }

  // ---------- one-shots ----------
  private limit(key: string, gap: number): boolean {
    const now = performance.now();
    if (now - (this.last[key] ?? 0) < gap * 1000) return false;
    this.last[key] = now;
    return true;
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
    src.connect(f).connect(g).connect(dest ?? this.sfx);
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
    o.connect(g).connect(dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: string, n = 0) {
    if (!this.ctx || !this.sfxOn) return;
    switch (name) {
      case 'pop': {
        // the padel "pock": a felt ball on a foam-cored paddle. Harder hit = brighter and louder.
        const v = 0.1 + n * 0.16;
        const f = 720 + n * 300 + Math.random() * 50;
        this.tone(f, 0.05, 'triangle', v, 0, f * 0.62);
        this.tone(f * 2.1, 0.025, 'sine', v * 0.35, 0, f * 1.4);
        this.noiseBurst(0.035, 'bandpass', 2600 + n * 900, 1500, v * 0.9, 2.2);
        break;
      }
      case 'soft':
        // a chiquita: a muted touch
        this.tone(560 + Math.random() * 30, 0.05, 'triangle', 0.09, 0, 400);
        this.noiseBurst(0.03, 'bandpass', 1900, 1200, 0.06, 2);
        break;
      case 'smash':
        this.tone(1500, 0.06, 'square', 0.12, 0, 700);
        this.noiseBurst(0.08, 'bandpass', 3800, 1400, 0.3, 1.4);
        this.tone(160, 0.18, 'sine', 0.16, 0, 70);
        break;
      case 'bounce':
        if (!this.limit('bounce', 0.05)) return;
        this.tone(330 + Math.random() * 40, 0.05, 'triangle', 0.05 + n * 0.06, 0, 200);
        this.noiseBurst(0.04, 'lowpass', 1600, 500, 0.06 + n * 0.06);
        break;
      case 'net':
        // ball into the mesh: a rattle and a thud
        this.noiseBurst(0.22, 'bandpass', 900, 420, 0.22, 0.9);
        for (let i = 0; i < 4; i++) this.tone(260 + Math.random() * 90, 0.04, 'square', 0.025, i * 0.03, 180);
        break;
      case 'tape':
        // the net cord: a sharp tick on the tape, the tape's thud and a short rattle of the mesh
        this.noiseBurst(0.012, 'bandpass', 3600, 2800, 0.12, 2.5);
        this.tone(2200, 0.03, 'sine', 0.05, 0, 1700);
        this.tone(190, 0.09, 'sine', 0.09, 0.005, 120);
        this.noiseBurst(0.12, 'bandpass', 900, 500, 0.06, 1.1, 0.02);
        break;
      case 'perfect':
        this.tone(1568, 0.09, 'sine', 0.07, 0.02);
        this.tone(2093, 0.14, 'sine', 0.06, 0.07);
        break;
      case 'cheer': {
        const big = n;
        this.noiseBurst(1.0 + big * 0.6, 'bandpass', 1300, 900, 0.1 + big * 0.06, 0.7, 0.05);
        this.noiseBurst(0.9 + big * 0.6, 'bandpass', 2400, 1700, 0.05 + big * 0.04, 1.2, 0.1);
        for (let i = 0; i < 4 + big * 6; i++) this.noiseBurst(0.04, 'highpass', 3000, 2500, 0.05, 1, 0.1 + Math.random() * (0.8 + big * 0.4));
        break;
      }
      case 'groan':
        this.tone(220, 0.45, 'sawtooth', 0.035, 0, 150);
        this.noiseBurst(0.5, 'bandpass', 600, 350, 0.07, 0.8);
        break;
      case 'point':
        [659, 784, 1047].forEach((f, i) => this.tone(f, i === 2 ? 0.32 : 0.12, 'triangle', 0.09, i * 0.08));
        break;
      case 'lost':
        [440, 370].forEach((f, i) => this.tone(f, i === 1 ? 0.3 : 0.14, 'triangle', 0.08, i * 0.12));
        break;
      case 'fault':
        this.tone(330, 0.18, 'square', 0.05, 0, 250);
        this.tone(250, 0.28, 'square', 0.05, 0.14, 190);
        break;
      case 'click':
        this.tone(900, 0.05, 'triangle', 0.1);
        break;
      case 'tick':
        this.tone(1500, 0.04, 'square', 0.03);
        break;
      case 'win':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.6 : 0.15, 'sawtooth', 0.07, i * 0.11));
        [262, 330, 392].forEach((f) => this.tone(f, 0.9, 'triangle', 0.08, 0.55));
        break;
      case 'lose':
        [392, 349, 311].forEach((f, i) => this.tone(f, i === 2 ? 0.5 : 0.18, 'triangle', 0.09, i * 0.16));
        break;
      case 'whoosh':
        this.noiseBurst(0.18, 'bandpass', 900, 2600, 0.07, 1.4);
        break;
      case 'sting':
        // the replay's sting: a swoosh across and a bright tick
        this.noiseBurst(0.32, 'bandpass', 500, 3200, 0.08, 1.6);
        this.tone(1760, 0.12, 'sine', 0.035, 0.16, 2350);
        break;
    }
  }

  private bird() {
    const f = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone(f * (1 + (i % 2) * 0.12), 0.07, 'sine', 0.018, i * 0.1, f * (i % 2 ? 0.8 : 1.25));
  }
}

/**
 * Applause, rendered once (about 3 s): a few hundred hand claps, each a short burst of band-limited noise, dense at
 * the start and thinning out.
 */
function applauseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 3.2);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const claps = 420;
  for (let c = 0; c < claps; c++) {
    // more claps early on
    const u = Math.random();
    const at = Math.floor(sr * 3.0 * u * u * (0.4 + 0.6 * Math.random()));
    const n = Math.floor(sr * (0.008 + Math.random() * 0.012));
    const amp = 0.25 + Math.random() * 0.5;
    // a hand clap: noise through a simple resonance (two one-pole filters make a rough band-pass)
    const a1 = 0.55 + Math.random() * 0.3;
    let lp = 0;
    let hp = 0;
    let prev = 0;
    for (let i = 0; i < n && at + i < len; i++) {
      const x = (Math.random() * 2 - 1) * Math.exp((-6 * i) / n);
      lp += (x - lp) * a1;
      hp = 0.7 * (hp + lp - prev);
      prev = lp;
      d[at + i] += hp * amp;
    }
  }
  // soft ends and a level that fits the other sounds
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < len; i++) {
    const e = Math.min(1, i / (sr * 0.03), (len - i) / (sr * 0.4));
    d[i] *= k * e;
  }
  return buf;
}

export const audio = new Audio();

export function vibrate(ms: number | number[]) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
