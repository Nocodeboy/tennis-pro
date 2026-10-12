// Two thumbs, like a console pad:
//   left  · a floating stick where the thumb lands moves the player
//   right · press, drag to aim, release to swing
// The right thumb has four gestures (docs/notas-08-ataque.md, docs/notas-03-simulacion.md):
//   · a slow drag places the ball (chiquita, drive, lob by where it points; a ball over the head: a bandeja; a ball
//     come back high off the back glass: a bajada);
//   · a flick, the finger lifting while it still moves fast towards the far end, is an attack (a volley, or a smash
//     or a víbora over the head, a hard bajada): at the opponent's body by default, or where the drag pointed before
//     the stroke, bent by the stroke's angle (straight up at full power over a high ball near the net: por 3);
//   · a tap, a short press with hardly any drag, is a block or reset: a soft ball at their feet;
//   · a down-flick, the same but towards the player (down the screen): over the head, the remate «por 4»; on any other
//     ball, a hard shot where the drag pointed before the stroke.
// The power (0.3), docs/notas-03-simulacion.md: how fast the finger moves when it lifts. Still (it waited for the
// ring): a placed ball (power ≈ 0.3, soft and safe); lifting on the move: a plain one (0.5); a flick: from 0.6 at the
// flick's threshold to 1 at FLICK.full (harder, faster and riskier). STROKE has the curve.
// Mouse: drag anywhere to aim and swing (a flick of the mouse attacks too, at the mouse's speed; the right button is an
// attack press, Shift + right button a down-flick); WASD or the arrows move. Keyboard aim: hold Space, tap the arrows
// to move the target a zone at a time (↓ a chiquita just over the net, ↑ deep, ↑↑ a lob, ← → across), let go of Space
// to swing (a plain shot, power 0.5; a quick tap of Space alone is a block); hold F instead of Space for an attack (← →
// move it across): the longer F is held the harder (KEY_POWER: 0.7 at once, 1 after 0.6 s); Shift+F is the down-flick
// (over the head, por 4). While Space or F is held the arrows aim and only WASD moves.
//
// Release times are judged as the player saw them: the finger lifts on what the screen showed a few frames ago, and
// the event arrives a little after the lift, so each release is dated back by the input and display latency (LAG).

export interface Release {
  /** sim time of the release */
  t: number;
  dx: number;
  dy: number;
  /**
   * the gesture: an attack (a flick up, F, the right button), a down-flick (towards the player: over the head, a remate
   * «por 4»), a tap (a block or reset), or none (a plain aimed release)
   */
  gesture?: 'attack' | 'down' | 'tap';
  /** 0 … 1: how fast the stroke was at the lift (a still finger ≈ 0.3, a plain release 0.5, the fastest flick 1) */
  power?: number;
  /**
   * a press that never strayed from where it landed (TAP.px) but lasted longer than a tap (up to TAP.hold s): a block
   * still, on a ball the game cued as one (HumanController; a finger pressed when the ring showed and lifted on gold)
   */
  quiet?: boolean;
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
 * moving (the lift comes within `lift` s of its last motion), its stroke peaking at `speed` px/s or more (the fastest
 * `peak` s of the last `window` s before the lift: the still lead-in and the lift's own sample, which repeats the last
 * position, do not water it down), having covered `travel` px since the stroke began, and within `cone` degrees of
 * straight up the screen (towards the far end); over the head the cone is `wideCone` (HumanController: a stroke bent
 * past ATTACK.viboraDeg is the víbora, so a clearly sideways one still reads as one). A placing drag ends with the finger
 * slowed down or still (it waits for the ring), which is what tells them apart; a quick thumb flick on a phone covers
 * 40–120 px in 40–120 ms (about 1,000–1,800 px/s at its peak). Gesture libraries call a swipe from about 300 px/s
 * (Hammer.js: 0.3 px/ms over 10 px), too low here: a quick aim across the screen reaches that.
 */
export const FLICK = { speed: 720, window: 0.08, peak: 0.035, lift: 0.04, gap: 0.03, travel: 18, cone: 55, wideCone: 72, downCone: 45, full: 1700 };
/**
 * The power of a release from the speed of the finger as it lifts (px/s on a 390 px phone; a flick's peak, FLICK): up
 * to `still` it is a placed ball (`placed`), up to `plain` it rises to 0.5 (a plain release, the finger still moving),
 * up to FLICK.speed to `flick0`, and a flick goes from there to 1 at FLICK.full: a 40–60 px flick in as many ms is about
 * 0.7, the remate por 3 (0.9, ATTACK.por3Power) takes a strong one, some 75 px in 50 ms. A stroke faster than `aim`
 * aims where the finger was before the stroke (the stroke is the swing, not the aim).
 */
export const STROKE = { still: 60, plain: 300, placed: 0.3, flick0: 0.6, aim: 380 };
export function strokePower(v: number): number {
  const f = (a: number, b: number, ya: number, yb: number) => ya + ((Math.min(Math.max(v, a), b) - a) / (b - a)) * (yb - ya);
  if (v <= STROKE.plain) return f(STROKE.still, STROKE.plain, STROKE.placed, 0.5);
  if (v <= FLICK.speed) return f(STROKE.plain, FLICK.speed, 0.5, STROKE.flick0);
  return f(FLICK.speed, FLICK.full, STROKE.flick0, 1);
}
/** Keys and the right mouse button: an attack press's power grows with how long it is held, `min` … 1 over `full` s. */
export const KEY_POWER = { min: 0.7, full: 0.6 };
/**
 * The tap (a block or reset): a press of at most `time` s that never strays more than `px` px from where it landed (a
 * thumb pressed in a hurry trembles that much) and is no flick.
 */
export const TAP = { time: 0.3, px: 20, hold: 1.2 };
/** The angle (degrees, 0 = straight up the screen, 90 = sideways) of a flick's stroke (Release.fx, fy). */
export function strokeDeg(r: { fx?: number; fy?: number } | null | undefined): number {
  if (!r || r.fx === undefined || r.fy === undefined) return 0;
  return (Math.atan2(Math.abs(r.fx), Math.abs(r.fy)) * 180) / Math.PI;
}

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
  /** the attack press is a down-flick (Shift+F, Shift + the right button): over the head, por 4 */
  private downPress = false;
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
        this.aimDown(e.timeStamp / 1000, touch, !touch && e.button === 2, !touch && e.button === 2 && e.shiftKey);
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
          this.aimDown(e.timeStamp / 1000, false, k === 'KeyF', k === 'KeyF' && e.shiftKey);
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
  aimDown(ts: number, touch = true, attack = false, down = false) {
    this.dx = this.dy = 0;
    this.pressing = true;
    this.spent = false;
    this.touchPress = touch;
    this.attackPress = attack;
    this.downPress = attack && down;
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
    return this.pressing && this.attackPress && !this.downPress && !this.spent;
  }
  /** A down-flick press is held (Shift+F, Shift + the right button): over the head, the preview shows the por 4. */
  get downHeld(): boolean {
    return this.pressing && this.downPress && !this.spent;
  }
  /**
   * For the HUD (power feedback): the power the press would have if it lifted now (0 … 1; 0.5 with no press). A key or
   * the right button: by how long it has been held; a finger: by how fast it moves now.
   */
  powerNow(): number {
    if (!this.active) return 0.5;
    if (this.attackPress) return this.keyPower(this.trail[this.trail.length - 1]?.t ?? this.downAt);
    if (this.viaKey) return 0.5;
    const g = this.gestureAt(NaN);
    return g.power ?? 0.5;
  }
  /** an attack press's power by how long it has been held at `end` (KEY_POWER) */
  private keyPower(end: number): number {
    const held = Number.isFinite(end - this.downAt) ? Math.max(0, end - this.downAt) : 0;
    return KEY_POWER.min + (1 - KEY_POWER.min) * Math.min(1, held / KEY_POWER.full);
  }
  /** an attack press, read as a gesture at `end` (an up-flick, or a down-flick with Shift) */
  private keyGesture(end: number): Partial<Release> {
    const down = this.downPress;
    return { gesture: down ? 'down' : 'attack', ax: this.dx, ay: this.dy, fx: 0, fy: down ? 1 : -1, power: this.keyPower(end) };
  }
  /**
   * The press still held at a contact, read as the gesture it is becoming (the ball came before the lift): an attack
   * (an attack press, or a finger in the middle of a flick's stroke: it moved within the last `fresh` s of sim time),
   * or a tap (a press younger than TAP.time that has not strayed: a late block). null: a plain held press.
   */
  gestureNow(fresh = 0.05): Partial<Release> | null {
    if (!this.active) return null;
    const tr = this.trail;
    // (a key press: held so far, on the events' clock of its last sample; the bots' virtual keys use the sim's)
    if (this.attackPress) return this.keyGesture(Number.isFinite(this.downAt) && tr.length ? tr[tr.length - 1].t + (this.now() - tr[tr.length - 1].st) : NaN);
    if (!Number.isFinite(this.downAt) || !tr.length) return null;
    const k = Math.max(0.5, this.scale);
    let far = 0;
    for (const s of tr) far = Math.max(far, Math.hypot(s.x, s.y));
    if (this.now() - tr[0].st <= TAP.time && far <= TAP.px * k) return { gesture: 'tap', power: 0.3 };
    const last = tr[tr.length - 1];
    if (this.viaKey || this.now() - last.st > fresh) return null;
    const g = this.gestureAt(NaN);
    return g.gesture === 'attack' || g.gesture === 'down' ? g : null;
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
    this.downPress = false;
    this.downAt = NaN;
    this.trail.length = 0;
  }

  /**
   * What the press that ends at `ts` was: an attack (an attack press, or a flick: FLICK), a tap (TAP) or a plain
   * release. A press the gesture was not followed for (a tool that sets `pressing` by hand) is a plain release.
   */
  private gestureAt(ts: number): Partial<Release> {
    const tr = this.trail;
    if (this.attackPress) return this.keyGesture(Number.isFinite(ts) ? ts : tr.length ? tr[tr.length - 1].t : NaN);
    if (!Number.isFinite(this.downAt) || !tr.length) return {};
    const end = Number.isFinite(ts) ? ts : tr[tr.length - 1].t;
    const k = Math.max(0.5, this.scale);
    let far = 0;
    for (const s of tr) far = Math.max(far, Math.hypot(s.x, s.y));
    const tap = end - this.downAt <= TAP.time && far <= TAP.px * k;
    if (this.viaKey) return tap ? { gesture: 'tap', power: 0.3 } : { power: 0.5 };
    // The last sample that moved: the pointerup repeats the last position (Input adds it), and so does a finger that
    // stopped before lifting. A lift within FLICK.lift of the last motion is a lift on the move: the stroke is measured
    // up to that motion; a finger that stopped first is measured up to the lift (the stillness counts: a placed ball).
    let li = tr.length - 1;
    while (li > 0 && Math.hypot(tr[li].x - tr[li - 1].x, tr[li].y - tr[li - 1].y) < 0.5) li--;
    const onMove = li > 0 && end - tr[li].t <= FLICK.lift;
    const stop = onMove ? tr[li].t : end;
    const span = Math.max(1 / 240, Math.min(FLICK.window, stop - this.downAt));
    let speed: number;
    // the stroke's peak: the fastest `w` s within the last moments (the still lead-in does not count)
    const peakOf = (w: number) => {
      let v = 0;
      for (let i = li; i >= 0 && tr[i].t >= stop - span - 1e-9; i--) {
        const a = this.at(tr[i].t - w);
        v = Math.max(v, Math.hypot(tr[i].x - a.x, tr[i].y - a.y) / w);
      }
      return v;
    };
    if (onMove) speed = peakOf(Math.min(FLICK.peak, span));
    else {
      const from = this.at(end - span);
      const last = tr[tr.length - 1];
      speed = Math.hypot(last.x - from.x, last.y - from.y) / span;
    }
    // The stroke began where the finger was last slow against it (under 60 % of its peak, and under 40 % of a flick):
    // what is before it is the aim. A stroke straight from the press has no aim before it (i = 0).
    const vmin = Math.max(FLICK.speed * k * 0.4, speed * 0.6);
    let si = li;
    while (si > 0) {
      const a = tr[si - 1];
      const b = tr[si];
      if (Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1e-3, b.t - a.t) < vmin) break;
      si--;
    }
    // (a stroke shorter than FLICK.peak: its peak over its own length)
    if (onMove && si < li && tr[li].t - tr[si].t < FLICK.peak) speed = Math.max(speed, peakOf(Math.max(1 / 120, tr[li].t - tr[si].t)));
    // (a finger held still sends no moves: the slow stretch before the stroke is then one long gap, and the stroke
    // started where the finger was before it, not at the first sample of the stroke)
    const s0 = si > 0 && tr[si].t - tr[si - 1].t > FLICK.gap ? tr[si - 1] : tr[si];
    const s1 = tr[li];
    const mx = s1.x - s0.x;
    const my = s1.y - s0.y;
    const travel = Math.hypot(mx, my);
    const power = strokePower(speed / k);
    const flick = onMove && speed >= FLICK.speed * k && travel >= FLICK.travel * k;
    const up = -my / Math.max(1e-6, travel);
    // (a flick from the press, with no aim before it: not aimed, at the opponent's body; ATTACK.aimed)
    const aim = si > 0 ? { ax: s0.x, ay: s0.y } : { ax: 0, ay: 0 };
    if (flick && up >= Math.cos((FLICK.wideCone * Math.PI) / 180)) return { gesture: 'attack', ...aim, fx: mx / travel, fy: my / travel, power };
    if (flick && -up >= Math.cos((FLICK.downCone * Math.PI) / 180)) return { gesture: 'down', ...aim, fx: mx / travel, fy: my / travel, power };
    if (tap) return { gesture: 'tap', power: 0.3 };
    if (far <= TAP.px * k && end - this.downAt <= TAP.hold) return { power, quiet: true };
    // a fast stroke any other way: a hard shot, aimed where the finger was before the stroke (a fast drag straight from
    // the press is the aim itself: where it lifts)
    if (onMove && speed >= STROKE.aim * k && si > 0) return { ...aim, power };
    return { power };
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
    this.downPress = false;
    this.downAt = NaN;
    this.trail.length = 0;
  }
  clearStick() {
    this.stickId = -1;
    this.stickX = this.stickY = 0;
    this.stickBase = this.stickKnob = null;
  }
}
