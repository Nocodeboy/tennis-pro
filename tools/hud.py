"""The on-screen indicators, measured: captures of the typical moments of a padel match (the serve, aiming it, a ball
coming, aiming in the rally with the stick, the release, the hit, the point and its "Tap to continue", the next serve,
the pause) and, for every indicator on screen, how much of it there is. Each indicator is hidden in turn and the frame drawn again: the pixels
that change are its ink; the convex hull of that ink is its footprint (what it encloses: a thin ring around the ball
still takes the space inside it). Also how much of it lies over the players and whether it touches the ball.

The match is the same on every run (Math.random is seeded, the DOM timers, CSS animations and performance.now follow
the match's clock), so two builds can be compared moment by moment.

Usage: python3 tools/hud.py [dist_dir = dist] [out_dir] [width = 390] [height = 760] [pair = 1] [port = 8795]
       [motion = no-preference|reduce] [indicators = min|full (Settings; default: the game's)]
(padel is always doubles: the fifth argument is the pair of the draw played; the old «singles|doubles» reads as 1)
Writes out_dir/<moment>.png and out_dir/metrics.json."""
import os, sys, threading, functools, http.server, json
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'dist')
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/pb-hud'
W = int(sys.argv[3]) if len(sys.argv) > 3 else 390
H = int(sys.argv[4]) if len(sys.argv) > 4 else 760
PAIR = int(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5].isdigit() else 1
MODE = 'doubles'
PORT = int(sys.argv[6]) if len(sys.argv) > 6 else 8795
MOTION = sys.argv[7] if len(sys.argv) > 7 else 'no-preference'
HUD = sys.argv[8] if len(sys.argv) > 8 else ''
TOUCH = W < H
os.makedirs(OUT, exist_ok=True)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

# a seeded Math.random, and the DOM timers, CSS animations and performance.now on the match's clock (window.__vtick)
INIT = r"""(() => {
  let s = 0x2f6b9e31;
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window), realNow = performance.now.bind(performance);
  const V = { on: false, now: 0, base: 0, timers: new Map(), id: 1e7 };
  window.__V = V;
  window.setTimeout = (fn, ms, ...a) => { if (!V.on) return realST(fn, ms, ...a); const id = V.id++; V.timers.set(id, { at: V.now + (ms || 0) / 1000, fn, a }); return id; };
  window.clearTimeout = (id) => { if (V.timers.has(id)) V.timers.delete(id); else realCT(id); };
  performance.now = () => (V.on ? V.base + V.now * 1000 : realNow());
  window.__vtick = (dt) => {
    const prev = V.now;
    V.now += dt;
    for (;;) {
      let best = null;
      for (const [id, x] of V.timers) if (x.at <= V.now && (!best || x.at < best[1].at)) best = [id, x];
      if (!best) break;
      V.timers.delete(best[0]);
      try { if (typeof best[1].fn === 'function') best[1].fn(...best[1].a); } catch (e) { console.error(e); }
    }
    for (const an of document.getAnimations()) {
      if (an.__v0 === undefined) { an.__v0 = prev; an.pause(); }
      an.currentTime = Math.max(0, (V.now - an.__v0) * 1000);
    }
  };
  window.__von = () => { V.base = realNow(); V.now = 0; V.on = true; };
  window.__seed = (n) => { s = n | 0; };
})();"""

# the human's thumb, as a bot: the stick goes straight to the suggested spot (the assist parks him there)
BOT = r"""(() => {
  const pb = window.__pb, i = pb.input;
  window.__hold = false;
  i.move = () => {
    const m = pb.match;
    if (!m || window.__hold) return { x: 0, y: 0 };
    const me = m.players[0], tg = m.targetFor(0);
    if (!tg) return { x: 0, y: 0 };
    const dx = tg.fx - me.x, dz = tg.fz - me.z, d = Math.hypot(dx, dz);
    if (d < 0.25) return { x: 0, y: 0 };
    const s = pb.view.viewSide;
    return { x: (dx / d) * s, y: (dz / d) * s };
  };
})()"""

ST = r"""(() => { const m = window.__pb.match; const me = m.players[0]; const tg = m.targetFor(0); const r = m.rally;
  return { phase: m.phase, t: m.t, last: r && r.last ? r.last.team : -1, bounces: r ? r.bounces : 0, shots: r ? r.shots : 0,
    plan: me.plan ? { t: me.plan.t - m.t, oops: me.plan.oops, volley: me.plan.volley } : null,
    tg: tg ? { t: tg.t - m.t, d: Math.hypot(me.x - tg.fx, me.z - tg.fz) } : null, score: m.games.join('-') + ' ' + m.call(), z: me.z }; })()"""

# where the players and the ball are on screen
GEO = r"""(() => { const pb = window.__pb, v = pb.view, m = pb.match;
  const boxes = m.players.map((p) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const dx of [-0.35, 0.35]) for (const dz of [-0.3, 0.3]) for (const y of [0, 1.85]) { const s = v.toScreen(p.x + dx, y, p.z + dz); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
    return [x0, y0, x1, y1]; });
  const b = v.ball && v.ball.visible ? v.toScreen(v.ball.position.x, v.ball.position.y, v.ball.position.z) : null;
  return { players: boxes, ball: b ? [b.x, b.y] : null }; })()"""

# every indicator: DOM selectors (hidden with visibility) and the view's meshes (hidden and drawn again)
GROUPS = {
    'timing': {'css': '#fx .ring, #fx .tring'},
    'chip': {'css': '#fx .chip'},
    'stick': {'css': '#fx .stick-base, #fx .stick-knob'},
    'floater': {'css': '#fx .fl'},
    'banner': {'css': '#banner'},
    'hint': {'css': '#hint'},
    'toast': {'css': '#toast'},
    'tapOn': {'css': '.tap-on'},
    'scorebug': {'css': '#hud .tvbug'},
    'state': {'css': '#hud .tv-state'},
    'pause': {'css': '#pauseBtn'},
    'call': {'css': '.tv-call'},
    'tv': {'css': '.tv-strap, .tv-card, .tv-replay, .tv-skip'},
    'spot': {'mesh': ['targetRing', 'targetDot', 'spotMark']},
    'landing': {'mesh': ['landRing', 'landMark']},
    'reach': {'mesh': ['footRing', 'reachMark']},
    'aim': {'mesh': ['aimRing', 'aimLine', 'aimMark']},
    'serveBox': {'mesh': ['serveBox']},
}

def grab(pg):
    pg.screenshot(timeout=240000, path=f'{OUT}/_tmp.png')
    return np.asarray(Image.open(f'{OUT}/_tmp.png').convert('RGB')).astype(np.int16)

def hull_area(mask):
    ys, xs = np.nonzero(mask)
    if len(xs) < 3:
        return float(len(xs))
    pts = set()
    for y in np.unique(ys):
        row = xs[ys == y]
        pts.add((int(row.min()), int(y)))
        pts.add((int(row.max()) + 1, int(y)))
        pts.add((int(row.min()), int(y) + 1))
        pts.add((int(row.max()) + 1, int(y) + 1))
    P = sorted(pts)
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in P:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    h = lo[:-1] + up[:-1]
    return abs(sum(h[i][0] * h[(i + 1) % len(h)][1] - h[(i + 1) % len(h)][0] * h[i][1] for i in range(len(h)))) / 2

def present(pg, name, g):
    if 'mesh' in g:
        return pg.evaluate("(names) => names.some((n) => { const o = window.__pb.view[n]; return !!(o && o.visible); })", g['mesh'])
    return pg.evaluate("""(sel) => [...document.querySelectorAll(sel)].some((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.02 && e.offsetParent !== null; })""", g['css'])

def hide(pg, g, on):
    if 'mesh' in g:
        pg.evaluate("([names, on]) => { const v = window.__pb.view; window.__was = window.__was || {}; for (const n of names) { const o = v[n]; if (!o) continue; if (on) { window.__was[n] = o.visible; o.visible = false; } else if (n in window.__was) o.visible = window.__was[n]; } v.render(); }", [g['mesh'], on])
    else:
        pg.evaluate("([sel, on]) => { let s = document.getElementById('__hide'); if (!s) { s = document.createElement('style'); s.id = '__hide'; document.head.appendChild(s); } s.textContent = on ? sel + ' { visibility: hidden !important; }' : ''; }", [g['css'], on])

metrics = {}
def measure(pg, name):
    pg.evaluate("window.__pb.view.render()")
    a = grab(pg)
    Image.fromarray(a.astype(np.uint8)).save(f'{OUT}/{name}.png')
    geo = pg.evaluate(GEO)
    pm = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in geo['players']:
        pm[max(0, int(y0)):max(0, min(H, int(y1))), max(0, int(x0)):max(0, min(W, int(x1)))] = True
    bm = np.zeros((H, W), bool)
    if geo['ball']:
        yy, xx = np.mgrid[0:H, 0:W]
        bm = (xx - geo['ball'][0]) ** 2 + (yy - geo['ball'][1]) ** 2 <= 8 ** 2
    res = {}
    union = np.zeros((H, W), bool)
    for gname, g in GROUPS.items():
        if not present(pg, gname, g):
            continue
        hide(pg, g, True)
        b = grab(pg)
        hide(pg, g, False)
        mask = np.abs(a - b).sum(axis=2) > 30
        n = int(mask.sum())
        if n < 4:
            continue
        union |= mask
        ys, xs = np.nonzero(mask)
        res[gname] = {
            'ink': round(100 * n / (W * H), 2),
            'foot': round(100 * hull_area(mask) / (W * H), 2),
            'box': [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)],
            'players': round(100 * (mask & pm).sum() / max(1, pm.sum()), 2),
            'ball': int((mask & bm).sum()),
        }
    pg.evaluate("window.__pb.view.render()")
    n = int(union.sum())
    res['_all'] = {'ink': round(100 * n / (W * H), 2), 'players': round(100 * (union & pm).sum() / max(1, pm.sum()), 2), 'ball': int((union & bm).sum())}
    metrics[name] = res
    print(name, json.dumps(res), flush=True)
    with open(f'{OUT}/metrics.json', 'w') as f:
        json.dump({'size': [W, H], 'mode': MODE, 'moments': metrics}, f, indent=1)

def snap(pg, name):
    pg.evaluate("window.__pb.view.render()")
    pg.screenshot(timeout=240000, path=f'{OUT}/{name}.png')
    print(name, flush=True)

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=TOUCH, is_mobile=TOUCH, reduced_motion=MOTION)
    pg.add_init_script(INIT)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es', timeout=180000)
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=90000)
    start = f'window.__pb.startDoubles({PAIR})'
    # (the attract match ran in real time behind the menu: the random numbers start again here, the same every run;
    # the perfect hit's white flash runs on the real clock and is left out)
    pg.add_style_tag(content='#flash { display: none !important; }')
    pg.evaluate(f"window.__pb.view.setTier('low'); window.__pb.manual = true; window.__pb.save.tutorial = false; window.__pb.view.shake = 0; window.__seed(0x2f6b9e31); window.__von(); {start}")
    pg.evaluate(BOT)
    if HUD:
        pg.evaluate(f"window.__pb.save.hud = '{HUD}'; window.__pb.view.minimal = {'true' if HUD == 'min' else 'false'}")
    step =lambda sec, dt=1 / 60: pg.evaluate(f"window.__pb.advance({sec}, {dt}, false); window.__vtick({sec})")
    press = lambda dx, dy: pg.evaluate(f"(() => {{ const i = window.__pb.input; i.pressing = true; i.dx = {dx}; i.dy = {dy}; }})()")
    release = lambda: pg.evaluate("window.__pb.input['end'](false)")
    # (the stick only drawn: the bot moves the player)
    STICK_ON = "i.stickBase = {x: 92, y: %d}; i.stickKnob = {x: 128, y: %d}; i.stickX = 0.65; i.stickY = -0.45;" % (H - 150, H - 176)
    STICK_OFF = "i.stickBase = null; i.stickKnob = null; i.stickX = 0; i.stickY = 0;"
    stick = lambda on: pg.evaluate("(() => { const i = window.__pb.input; %s })()" % (STICK_ON if on else STICK_OFF)) if TOUCH else None

    step(0.5)
    measure(pg, '01-serve')
    press(-12, -20)
    step(0.3)
    measure(pg, '02-serve-aim')
    release()
    got = set()
    guard = 0
    prev = None
    while guard < 1400 and len(got) < 5:
        guard += 1
        st = pg.evaluate(ST)
        if st['phase'] == 'rally' and st['last'] == 1 and st['tg'] and st['tg']['d'] > 1.3 and 'spot' not in got:
            # the opponent has hit and the suggested spot is still away from you
            got.add('spot')
            measure(pg, '03a-spot')
        elif st['phase'] == 'rally' and st['last'] == 1 and st['bounces'] == 0 and st['tg'] and 0.45 < st['tg']['t'] < 0.8 and 'incoming' not in got:
            got.add('incoming')
            measure(pg, '03-incoming')
            stick(True)
            press(30, -60)
            step(max(0.05, st['tg']['t'] - 0.42), 1 / 120)
            measure(pg, '04-aim')
            # let go in the perfect window (0.14 s before the contact: the ring is gold and at its smallest, where it
            # is over the near player), then just after the hit
            s2 = pg.evaluate(ST)
            if s2['plan']:
                step(max(1 / 120, s2['plan']['t'] - 0.14), 1 / 120)
                measure(pg, '04b-release')
            release()
            for _ in range(60):
                if pg.evaluate(ST)['last'] == 0:
                    break
                step(1 / 60, 1 / 120)
            step(0.15, 1 / 120)
            stick(False)
            measure(pg, '05-hit')
        elif st['phase'] == 'dead' and prev != 'dead' and 'point' not in got and 'incoming' in got:
            got.add('point')
            step(0.3)
            measure(pg, '06-point')
            # the pause can be cut short from 0.6 s: "Tap to continue"
            step(0.5)
            measure(pg, '06b-tap')
        elif st['phase'] == 'serve' and 'point' in got and 'serve2' not in got:
            got.add('serve2')
            step(0.6)
            measure(pg, '08-next-serve')
        if st['phase'] == 'serve':
            if pg.evaluate("window.__pb.match.server().id") == 0:
                press(5, -15)
                step(0.3)
                release()
        if 'serve2' in got:
            break
        prev = st['phase']
        step(0.05, 1 / 120)
    # the pause
    pg.keyboard.press('Escape')
    step(0.4)
    snap(pg, '09-pause')
    for l in logs[-8:]:
        print('  ', l)
    b.close()
srv.shutdown()
try:
    os.remove(f'{OUT}/_tmp.png')
except OSError:
    pass
