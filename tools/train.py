"""Training captures (the «Entrenamiento» menu, src/training.ts) on a phone held upright: the main menu with its new
entry, the list of challenges, the instructions of one, every challenge on court (a ball coming and the aim on it),
what a ball scored (the tag and the points where it landed), the result screens; and a point of a match with the line
that says why it was won or lost. Any console error or page error is printed at the end (and makes the exit code 1).

The page runs on the match's clock (Math.random seeded, DOM timers and CSS animations follow it, as tools/hud.py), and
a simple thumb plays: the stick to the circle, the aim dragged to each challenge's target and let go on the gold ring.

Usage: python3 tools/train.py [dist_dir = dist] [out_dir = /tmp/pb-08-entreno] [width = 390] [height = 760] [port = 8832]"""
import os, sys, threading, functools, http.server, json
from playwright.sync_api import sync_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'dist')
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/pb-08-entreno'
W = int(sys.argv[3]) if len(sys.argv) > 3 else 390
H = int(sys.argv[4]) if len(sys.argv) > 4 else 760
PORT = int(sys.argv[5]) if len(sys.argv) > 5 else 8832
os.makedirs(OUT, exist_ok=True)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

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
})();"""

# the thumbs: the stick to the circle; the aim dragged to the challenge's target, let go on the gold ring
BOT = r"""(() => {
  const pb = window.__pb, i = pb.input;
  const px = Math.max(26, 0.085 * Math.min(innerWidth, innerHeight * 0.7));
  i.move = () => {
    const m = pb.match; if (!m) return { x: 0, y: 0 };
    const me = m.players[0], tg = m.targetFor(0);
    if (!tg) return { x: 0, y: 0 };
    const dx = tg.fx - me.x, dz = tg.fz - me.z, d = Math.hypot(dx, dz);
    if (d < 0.25) return { x: 0, y: 0 };
    const s = pb.view.viewSide; return { x: (dx / d) * s, y: (dz / d) * s };
  };
  window.__aimFor = () => {
    const tr = pb.training, d = tr.drill, m = pb.match, me = m.players[0];
    const plan = me.plan;
    let x = 0, dd = 1.3;
    const id = d ? d.def.id : 'match';
    if (id === 'dink') { const ts = d.targets(); const t = ts[(d.ball * 7) % ts.length]; x = t.x; dd = Math.abs(t.z); }
    else if (id === 'third') { x = ((d.ball % 3) - 1) * 1.1; dd = 1.2; }
    else if (id === 'attack') { if (plan && (plan.overhead || plan.by > 1.06)) { x = ((d.ball % 3) - 1) * 1.4; dd = 5.6; } else { x = ((d.ball % 3) - 1) * 1.2; dd = 1.3; } }
    else if (id === 'defend') { x = ((d.ball % 3) - 1) * 1.0; dd = 1.2; }
    else { x = 1.2; dd = 5.0; }
    return { dx: x * me.side * px, dy: (4.3 - dd) * px * 0.88 };
  };
  window.__serveAim = () => {
    const d = pb.training.drill, m = pb.match, me = m.players[0];
    const ts = d.targets(); const t = ts[d.ball % ts.length];
    const half = -m.serveX(0), x0 = half * 1.5 * me.side, d0 = (2.1336 + 6.7055) / 2 + 0.3;
    return { dx: (t.x * me.side - x0) * px, dy: (d0 - Math.abs(t.z)) * px * 0.88 };
  };
})()"""

ST = r"""(() => { const pb = window.__pb, m = pb.match, d = pb.training.drill; if (!m) return { none: true, done: !d };
  const me = m.players[0], r = m.rally;
  return { phase: m.phase, t: m.t, srv: m.phase === 'serve' ? m.server().id : -1, windup: !!m.windup, last: r && r.last ? r.last.team : -1,
    plan: me.plan ? { dt: me.plan.t - m.t, by: me.plan.by, reach: me.plan.reach } : null,
    pressing: pb.input.pressing, ball: d ? d.ball : -1, score: d ? d.score : 0, done: d ? d.done : true,
    nres: d ? d.results.length : 0, lastPts: d && d.results.length ? d.results[d.results.length - 1].pts : -1 }; })()"""

logs = []
def snap(pg, name):
    pg.evaluate("window.__pb.view.render()")
    pg.screenshot(timeout=240000, path=f'{OUT}/{name}.png')
    print(name, flush=True)

def step(pg, sec, dt=1 / 60):
    pg.evaluate(f"window.__pb.advance({sec}, {dt}, false); window.__vtick({sec})")

def play_drill(pg, i, did, shots):
    pg.evaluate(f"window.__pb.train({i}, {1234 + i * 77})")
    pg.evaluate("window.__pb.view.shake = 0")
    got = set()
    pressed_for = -1
    guard = 0
    while guard < 6000:
        guard += 1
        st = pg.evaluate(ST)
        if st.get('none'):
            break
        if st['done']:
            step(pg, 1.8)
            if 'result' in shots:
                snap(pg, f'{i + 1}{chr(99)}-{did}-resultado')
            break
        # the serve: aim at a target, let go on the small ring (the pulse is smallest every 1.1 s; the release is dated
        # back 40 ms)
        if st['phase'] == 'serve' and st['srv'] == 0 and not st['windup']:
            if not st['pressing']:
                pg.evaluate("(() => { const a = window.__serveAim(), i = window.__pb.input; i.pressing = true; i.dx = a.dx; i.dy = a.dy; })()")
                step(pg, 0.25)
                if 'play' not in got:
                    got.add('play')
                    snap(pg, f'{i + 1}a-{did}-juego')
            t = st['t']
            k = int((t + 0.2) / 1.1) + 1
            rel = k * 1.1 + 0.04
            step(pg, max(1 / 60, rel - t))
            pg.evaluate("window.__pb.input['end'](false)")
            step(pg, 1 / 60)
            continue
        if st['phase'] == 'rally' and st['last'] == 1 and st['plan'] and st['plan']['reach']:
            dt = st['plan']['dt']
            if not st['pressing'] and pressed_for != st['ball'] and 0.12 < dt < 0.7:
                pressed_for = st['ball']
                pg.evaluate("(() => { const a = window.__aimFor(), i = window.__pb.input; i.pressing = true; i.dx = a.dx; i.dy = a.dy; })()")
            if st['pressing'] and 0.17 < dt < 0.32 and 'play' not in got and st['ball'] >= 1:
                got.add('play')
                snap(pg, f'{i + 1}a-{did}-juego')
            if st['pressing'] and dt <= 0.105:
                pg.evaluate("window.__pb.input['end'](false)")
        if st['nres'] > 0 and st['lastPts'] > 0 and 'ball' not in got and st['nres'] >= 2:
            got.add('ball')
            step(pg, 0.2)
            snap(pg, f'{i + 1}b-{did}-bola')
        step(pg, 1 / 60)
    st = pg.evaluate("(() => { const d = window.__pb.training.drill; return d ? { score: d.score, ball: d.ball } : null; })()")
    return st

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=True, is_mobile=True)
    pg.add_init_script(INIT)
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es', timeout=180000)
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=120000)
    pg.add_style_tag(content='#flash { display: none !important; }')
    pg.evaluate("window.__pb.view.setTier('low'); window.__pb.save.tutorial = true")
    snap(pg, '01-menu')
    pg.click('button[data-a=train]')
    pg.wait_for_timeout(500)
    snap(pg, '02-lista')
    pg.click('button.drill-row[data-i="0"]')
    pg.wait_for_timeout(500)
    snap(pg, '03-instrucciones')
    pg.evaluate("window.__pb.manual = true; window.__von()")
    pg.evaluate(BOT)
    ids = ['dejadas', 'tercer-golpe', 'ataque', 'defensa', 'saques']
    res = {}
    for i, did in enumerate(ids):
        shots = {'play', 'ball', 'result'} if i in (0, 2, 4) else {'play', 'ball'}
        res[did] = play_drill(pg, i, did, shots)
        print(did, json.dumps(res[did]), flush=True)
    # the training list again, with the records
    pg.evaluate("window.__pb.training.list()")
    step(pg, 0.4)
    snap(pg, '04-lista-records')
    # a match point with the line that says why (the thumb bot of the match: stick to the circle, no aim)
    pg.evaluate("window.__pb.start(1)")
    n = 0
    for k in range(3000):
        st = pg.evaluate("(() => { const m = window.__pb.match; return { phase: m.phase, srv: m.phase === 'serve' ? m.server().id : -1, w: !!m.windup, why: document.querySelector('#banner .why') ? document.querySelector('#banner .why').textContent : '' }; })()")
        if st['phase'] == 'serve' and st['srv'] == 0 and not st['w']:
            pg.evaluate("(() => { const i = window.__pb.input; i.pressing = true; i.dx = 5; i.dy = -15; })()")
            step(pg, 0.3)
            pg.evaluate("window.__pb.input['end'](false)")
        if st['phase'] == 'dead' and st['why']:
            step(pg, 0.3)
            snap(pg, f'05-porque-{n}')
            print('   «' + st['why'] + '»', flush=True)
            n += 1
            if n >= 3:
                break
            step(pg, 2.2)
        step(pg, 1 / 30)
    # doubles: the line names who (you, Marta or a rival)
    pg.evaluate("window.__pb.startDoubles(1)")
    for k in range(4000):
        st = pg.evaluate("(() => { const m = window.__pb.match; return { phase: m.phase, srv: m.phase === 'serve' ? m.server().id : -1, w: !!m.windup, why: document.querySelector('#banner .why') ? document.querySelector('#banner .why').textContent : '' }; })()")
        if st['phase'] == 'serve' and st['srv'] == 0 and not st['w']:
            pg.evaluate("(() => { const i = window.__pb.input; i.pressing = true; i.dx = 5; i.dy = -15; })()")
            step(pg, 0.3)
            pg.evaluate("window.__pb.input['end'](false)")
        if st['phase'] == 'dead' and 'Marta' in st['why']:
            step(pg, 0.3)
            snap(pg, '05d-porque-dobles')
            print('   «' + st['why'] + '»', flush=True)
            break
        if st['phase'] == 'dead' and st['why']:
            step(pg, 2.2)
        step(pg, 1 / 30)
    print('\nconsola:', 'sin errores' if not logs else '')
    for l in logs:
        print('  ', l)
    b.close()
srv.shutdown()
sys.exit(1 if any(l.startswith('PAGEERROR') or l.startswith('error') for l in logs) else 0)
