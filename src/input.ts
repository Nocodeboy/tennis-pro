// Two thumbs, like a console pad:
//   left  · a floating stick where the thumb lands moves the player
//   right · press, drag to aim, release to swing
// The right thumb has three gestures (docs/notas-08-ataque.md):
//   · a slow drag places the ball (dink, drive, lob by where it points), as before;
//   · a flick, the finger lifting while it still moves fast towards the far end, is an attack (a speed-up, or a smash
//     over the head): at the opponent's body by default, or where the drag pointed before the stroke, bent by the
//     stroke's angle;
//   · a tap, a short press with hardly any drag, is a block or reset: a soft ball into the kitchen.
// Mouse: drag anywhere to aim and swing (a flick of the mouse attacks too; the right button is an attack press); WASD
// or the arrows move. Keyboard aim: hold Space, tap the arrows to move the target a zone at a time (↓ a dink into the
// kitchen, ↑ deep, ↑↑ a lob, ← → across), let go of Space to swing (a quick tap of Space alone is a block); hold F
// instead of Space for an attack (← → move it across). While Space or F is held the arrows aim and only WASD moves.
//
// Release times are judged as the player saw them: the finger lifts on what the screen showed a few frames ago, and
// the event arrives a little after the lift, so each release is dated back by the input and display latency (LAG).

export interface Release {
  /** sim time of the release */
  t: number;
  dx: number;
  dy: number;
  /** the gesture: an attack (a flick, F, the right button), a tap (a block or reset), or none (a plain aimed release) */
  gesture?: 'attack' | 'tap';
  /** an attack: the drag before the flick's stroke (where it was aimed; ~0 = not aimed) and the stroke's direction */
  ax?: number;
  ay?: number;
  fx?: number;
  fy?: number;
}

const STICK_R = 58; // px for full speed
/** the floating stick's base follows a thumb that drifts further than this (× STICK_R): a quick reversal stays short */
const FOLLOW = 1.1;
/**
 * s from what the screen shows to the release reaching the game: display (a frame or two plus the compositor) and the
 * touch or click to the event. Releases are dated back by this, so a release on the gold ring as seen is judged gold.
 */
export const LAG = { touch: 0.04, other: 0.025 };
/**
 * The flick (an attack), in CSS px on a 390 px phone (× Input.scale on bigger screens): the finger lifts while still
 * moving at `speed` px/s or more, measured over the last `window` s before the lift, having covered `travel` px in that
 * time, and within `cone` degrees of straight up the screen (towards the far end). A placing drag ends with the finger
 * slowed down or still (it waits for the ring), which is what tells them apart; a deliberate thumb flick on a phone
 * covers 40–120 px in 60–120 ms (500–1,500 px/s). Gesture libraries call a swipe from about 300 px/s (Hammer.js: 0.3
 * px/ms over 10 px), too low here: a quick aim across the screen reaches that.
 */
export const FLICK = { speed: 650, window: 0.08, travel: 24, cone: 55 };
/** The tap (a block or reset): a press of at most `time` s that never strays more than `px` px from where it landed. */
export const TAP = { time: 0.3, px: 14 };

export class Input {
  /** aim gesture */
  pressing = false;
  dx = 0;
  dy = 0;
  private sx = 0;
  private sy = 0;
  private aimId = -1;
  private release: Release | null = null;
  /** the current press was already used (a late swing): ignore it until the finger lifts */
  private spent = false;
  /** stick (screen space, y down), length ≤ 1 */
  stickX = 0;
  stickY = 0;
  private stickId = -1;
  /** where the stick was planted (CSS px), for drawing it */
  stickBase: { x: number; y: number } | null = null;
  stickKnob: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  /** the key held to aim: Space (a plain shot) or F (an attack) */
  private keyHold: 'Space' | 'KeyF' | null = null;
  /** the current press: by touch (or the bots' virtual thumb) or by mouse / keyboard (for LAG) */
  private touchPress = true;
  /** the current press is an attack press (F, the right mouse button): its release is an attack */
  private attackPress = false;
  /** the current press is a key's (Space, F): no flick (the arrows jump the aim), only the tap */
  private viaKey = false;
  /** the current press: when it landed (s, the events' clock) and the drag since then (for the flick and the tap) */
  private downAt = NaN;
  /** the drag since the press: event time `t`, position, and the sim time it arrived at (`st`) */
  private trail: { t: number; x: number; y: number; st: number }[] = [];
  /** keyboard aim: zones moved with the arrows while Space is held (across, deeper +) */
  private kx = 0;
  private ky = 0;
  /** the drag (px) that sends the ball `ix` zones across and `iy` zones deeper (set by the HumanController) */
  keyAim: ((ix: number, iy: number) => { dx: number; dy: number }) | null = null;
  enabled = true;
  /** the left half of a touch screen is the stick (false: the whole screen aims, as with a mouse) */
  stickZone = true;
  /** the size of the screen against a 390 px phone (the flick and the tap scale with it) */
  scale = 1;
  /** a finger (or Space) went down: on the stick, or to aim */
  onPress: ((what: 'stick' | 'aim') => void) | null = null;
  /** the player has used the stick at least once (to hide its hint) */
  moved = false;

  constructor(
    private el: HTMLElement,
    private now: () => number,
  ) {
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      const touch = e.pointerType !== 'mouse';
      // (with the stick already held, a second finger aims wherever it lands)
      const left = touch && this.stickZone && e.clientX < el.clientWidth * 0.46 && this.stickId === -1;
      if (left) {
        this.stickId = e.pointerId;
        this.stickBase = { x: e.clientX, y: e.clientY };
        this.stickKnob = { x: e.clientX, y: e.clientY };
        this.stickX = this.stickY = 0;
      } else {
        if (this.aimId !== -1 || this.keyHold) return;
        this.aimId = e.pointerId;
        this.sx = e.clientX;
        this.sy = e.clientY;
        this.aimDown(e.timeStamp / 1000, touch, !touch && e.button === 2);
      }
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.onPress?.(left ? 'stick' : 'aim');
      e.preventDefault();
    });
    // (the right button is an attack press: no menu)
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.aimId) {
        this.aimMove(e.clientX - this.sx, e.clientY - this.sy, e.timeStamp / 1000);
      } else if (e.pointerId === this.stickId && this.stickBase) {
        let vx = e.clientX - this.stickBase.x;
        let vy = e.clientY - this.stickBase.y;
        const d = Math.hypot(vx, vy);
        // the base follows a thumb that drifts too far (floating stick)
        if (d > STICK_R * FOLLOW) {
          const k = (d - STICK_R * FOLLOW) / d;
          this.stickBase.x += vx * k;
          this.stickBase.y += vy * k;
          vx = e.clientX - this.stickBase.x;
          vy = e.clientY - this.stickBase.y;
        }
        const m = Math.min(1, Math.hypot(vx, vy) / STICK_R);
        const a = Math.atan2(vy, vx);
        const dead = 0.12;
        const k = m < dead ? 0 : (m - dead) / (1 - dead);
        this.stickX = Math.cos(a) * k;
        this.stickY = Math.sin(a) * k;
        if (k > 0.3) this.moved = true;
        this.stickKnob = { x: this.stickBase.x + Math.cos(a) * Math.min(STICK_R, Math.hypot(vx, vy)), y: this.stickBase.y + Math.sin(a) * Math.min(STICK_R, Math.hypot(vx, vy)) };
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.aimId) {
        this.aimId = -1;
        // (the lift's own position is the stroke's last sample)
        if (e.type === 'pointerup') this.aimMove(e.clientX - this.sx, e.clientY - this.sy, e.timeStamp / 1000);
        this.aimUp(e.timeStamp / 1000, e.type === 'pointercancel');
      } else if (e.pointerId === this.stickId) {
        this.stickId = -1;
        this.stickX = this.stickY = 0;
        this.stickBase = this.stickKnob = null;
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.code;
      if (k === 'Space' || k === 'KeyF') {
        if (!e.repeat && !this.pressing) {
          this.keyHold = k;
          this.kx = this.ky = 0;
          this.aimDown(e.timeStamp / 1000, false, k === 'KeyF');
          this.viaKey = true;
          this.onPress?.('aim');
        }
        e.preventDefault();
      } else if (this.keyHold && k.startsWith('Arrow')) {
        // aiming with the keys: a zone per tap
        if (!e.repeat) {
          if (k === 'ArrowLeft') this.kx = Math.max(-2, this.kx - 1);
          else if (k === 'ArrowRight') this.kx = Math.min(2, this.kx + 1);
          else if (k === 'ArrowUp') this.ky = Math.min(3, this.ky + 1);
          else this.ky = Math.max(-2, this.ky - 1);
          const a = this.keyAim?.(this.kx, this.ky) ?? { dx: this.kx * 45, dy: -this.ky * 50 };
          this.aimMove(a.dx, a.dy, e.timeStamp / 1000);
        }
        this.keys.delete(k);
        e.preventDefault();
      } else if (/^(Arrow|Key[WASD])/.test(k)) {
        this.keys.add(k);
        this.moved = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (this.keyHold && e.code === this.keyHold) {
        this.keyHold = null;
        this.aimUp(e.timeStamp / 1000, false);
      } else this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  /**
   * The aiming thumb (or Space / F, or a virtual thumb: the bots, the training) lands. `ts`: its time in seconds on
   * the clock of the moves that follow (the events' clock, or the sim's for a virtual thumb). `attack`: an attack
   * press (F, the right button), whose release is an attack whatever the drag.
   */
  aimDown(ts: number, touch = true, attack = false) {
    this.dx = this.dy = 0;
    this.pressing = true;
    this.spent = false;
    this.touchPress = touch;
    this.attackPress = attack;
    this.viaKey = false;
    this.downAt = ts;
    this.trail.length = 0;
    this.trail.push({ t: ts, x: 0, y: 0, st: this.now() });
  }
  /** The aiming thumb is now (dx, dy) px from where it landed. */
  aimMove(dx: number, dy: number, ts: number) {
    this.dx = dx;
    this.dy = dy;
    if (!this.pressing || !Number.isFinite(this.downAt)) return;
    const tr = this.trail;
    // (the stroke only needs the last moments; a long drag keeps a short tail)
    if (tr.length > 48) tr.splice(0, tr.length - 32);
    tr.push({ t: ts, x: dx, y: dy, st: this.now() });
  }
  /** The aiming thumb lifts (`cancel`: the system took the touch away, no swing). */
  aimUp(ts: number, cancel = false) {
    this.end(cancel, ts);
  }

  /** An attack press is held (F, the right button): the aim preview shows the attack. */
  get attackHeld(): boolean {
    return this.pressing && this.attackPress && !this.spent;
  }
  /**
   * The press still held at a contact, read as the gesture it is becoming (the ball came before the lift): an attack
   * (an attack press, or a finger in the middle of a flick's stroke: it moved within the last `fresh` s of sim time),
   * or a tap (a press younger than TAP.time that has not strayed: a late block). null: a plain held press.
   */
  gestureNow(fresh = 0.05): Partial<Release> | null {
    if (!this.active) return null;
    if (this.attackPress) return { gesture: 'attack', ax: this.dx, ay: this.dy, fx: 0, fy: -1 };
    const tr = this.trail;
    if (!Number.isFinite(this.downAt) || !tr.length) return null;
    const k = Math.max(0.5, this.scale);
    let far = 0;
    for (const s of tr) far = Math.max(far, Math.hypot(s.x, s.y));
    if (this.now() - tr[0].st <= TAP.time && far <= TAP.px * k) return { gesture: 'tap' };
    const last = tr[tr.length - 1];
    if (this.viaKey || this.now() - last.st > fresh) return null;
    const g = this.gestureAt(NaN);
    return g.gesture === 'attack' ? g : null;
  }

  private end(cancel: boolean, ts = NaN) {
    if (!this.pressing) return;
    this.pressing = false;
    if (!cancel && !this.spent && this.enabled) {
      const g = this.gestureAt(ts);
      this.release = { t: this.now() - (this.touchPress ? LAG.touch : LAG.other), dx: this.dx, dy: this.dy, ...g };
    }
    this.spent = false;
    this.attackPress = false;
    this.downAt = NaN;
    this.trail.length = 0;
  }

  /**
   * What the press that ends at `ts` was: an attack (an attack press, or a flick: FLICK), a tap (TAP) or a plain
   * release. A press the gesture was not followed for (a tool that sets `pressing` by hand) is a plain release.
   */
  private gestureAt(ts: number): Partial<Release> {
    if (this.attackPress) return { gesture: 'attack', ax: this.dx, ay: this.dy, fx: 0, fy: -1 };
    const tr = this.trail;
    if (!Number.isFinite(this.downAt) || !tr.length) return {};
    const end = Number.isFinite(ts) ? ts : tr[tr.length - 1].t;
    const k = Math.max(0.5, this.scale);
    let far = 0;
    for (const s of tr) far = Math.max(far, Math.hypot(s.x, s.y));
    if (end - this.downAt <= TAP.time && far <= TAP.px * k) return { gesture: 'tap' };
    if (this.viaKey) return {};
    // the motion over the last moments before the lift (or since the press, if it was quicker than that)
    const span = Math.max(1 / 240, Math.min(FLICK.window, end - this.downAt));
    const from = this.at(end - span);
    const last = tr[tr.length - 1];
    const mx = last.x - from.x;
    const my = last.y - from.y;
    const travel = Math.hypot(mx, my);
    const speed = travel / span;
    if (speed < FLICK.speed * k || travel < FLICK.travel * k || -my / Math.max(1e-6, travel) < Math.cos((FLICK.cone * Math.PI) / 180)) return {};
    // the stroke began where the finger was last slow: what is before it is the aim
    let i = tr.length - 1;
    while (i > 0) {
      const a = tr[i - 1];
      const b = tr[i];
      const v = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1e-3, b.t - a.t);
      if (v < FLICK.speed * k * 0.4) break;
      i--;
    }
    return { gesture: 'attack', ax: tr[i].x, ay: tr[i].y, fx: mx / travel, fy: my / travel };
  }

  /** Where the aiming thumb was at time `t` (the trail, interpolated). */
  private at(t: number): { x: number; y: number; t: number; st: number } {
    const tr = this.trail;
    if (t <= tr[0].t) return tr[0];
    for (let i = tr.length - 1; i > 0; i--) {
      const a = tr[i - 1];
      const b = tr[i];
      if (a.t <= t) {
        const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, t, st: a.st };
      }
    }
    return tr[0];
  }

  /** Movement wanted right now, in screen space (x right, y down), length ≤ 1. */
  move(): { x: number; y: number } {
    let x = this.stickX;
    let y = this.stickY;
    if (this.keys.size) {
      // (while Space or F is held the arrows aim: only WASD moves)
      const ar = !this.keyHold;
      const kx = (this.keys.has('KeyD') || (ar && this.keys.has('ArrowRight')) ? 1 : 0) - (this.keys.has('KeyA') || (ar && this.keys.has('ArrowLeft')) ? 1 : 0);
      const ky = (this.keys.has('KeyS') || (ar && this.keys.has('ArrowDown')) ? 1 : 0) - (this.keys.has('KeyW') || (ar && this.keys.has('ArrowUp')) ? 1 : 0);
      const d = Math.hypot(kx, ky);
      if (d > 0) {
        x = kx / d;
        y = ky / d;
      }
    }
    return { x, y };
  }

  /** The last release, if it happened at or after `since` (older ones are dropped). */
  take(since: number): Release | null {
    const r = this.release;
    this.release = null;
    if (!r || r.t < since) return null;
    return r;
  }
  peek(): Release | null {
    return this.release;
  }
  /** a held press was used up by a late swing */
  spend() {
    if (this.pressing) this.spent = true;
  }
  get active(): boolean {
    return this.pressing && !this.spent;
  }
  clear() {
    this.release = null;
    this.pressing = false;
    this.spent = false;
    this.aimId = -1;
    this.keyHold = null;
    this.attackPress = false;
    this.downAt = NaN;
    this.trail.length = 0;
  }
  clearStick() {
    this.stickId = -1;
    this.stickX = this.stickY = 0;
    this.stickBase = this.stickKnob = null;
  }
}
