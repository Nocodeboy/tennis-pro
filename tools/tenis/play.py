"""Play-test captures of the real game (the tennis sim under the real render): a match on autopilot, stepped by hand,
with frames at the serve (toss, trophy, contact), the rally and the point; every page error listed.

Usage: python3 tools/tenis/play.py [out_dir] [mode singles|doubles] [surface hard|clay|grass] [rival index] [size 390x844] [port 8795]
"""
import functools, http.server, threading, sys, os, json
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tenis-play'
MODE = sys.argv[2] if len(sys.argv) > 2 else 'singles'
SURF = sys.argv[3] if len(sys.argv) > 3 else 'hard'
RIVAL = int(sys.argv[4]) if len(sys.argv) > 4 else 2
SIZE = [int(v) for v in (sys.argv[5] if len(sys.argv) > 5 else '390x844').split('x')]
PORT = int(sys.argv[6]) if len(sys.argv) > 6 else 8795
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
os.makedirs(OUT, exist_ok=True)


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
tag = f'{MODE[0]}-{SURF}-{SIZE[0]}x{SIZE[1]}'

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': SIZE[0], 'height': SIZE[1]}, device_scale_factor=1, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    pg.set_default_timeout(180000)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es', wait_until='commit', timeout=120000)
    pg.wait_for_function('() => window.__pb && window.__pb.view', timeout=120000)
    pg.wait_for_timeout(1500)
    pg.evaluate(f"() => {{ __pb.setSurface('{SURF}'); __pb.setMode('{MODE}'); }}")
    pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/{tag}-00-menu.png')
    pg.evaluate(f"() => {{ __pb.start({RIVAL}, false, '{MODE}'); __pb.manual = true; __pb.autopilot(); }}")
    pg.wait_for_timeout(2500)
    # step to the first serve's wind-up and through it
    shots = []
    def snap(name):
        pg.screenshot(path=f'{OUT}/{tag}-{name}.png')
        shots.append(name)
    def state():
        return pg.evaluate("""() => { const m = __pb.match; if (!m) return null; const r = m.rally;
          return { t: m.t, phase: m.phase, wu: m.windup ? m.windup.at - m.t : null, shots: r ? r.shots : 0, bounces: r ? r.bounces : 0,
            pts: [m.points[0], m.points[1]], games: [m.games[0], m.games[1]], call: m.call(), server: m.serverId, doubles: m.doubles,
            players: m.players.map(p => [p.x.toFixed(2), p.z.toFixed(2)]) }; }""")
    # serve: wait for the wind-up to start
    for i in range(400):
        s = state()
        if s and s['wu'] is not None:
            break
        pg.evaluate('() => __pb.advance(0.05, 1/60, false)')
    s = state()
    print('serve wind-up', json.dumps(s))
    pg.evaluate('() => __pb.advance(0.01)'); snap('01-serve-start')
    pg.evaluate('() => __pb.advance(0.45)'); snap('02-toss')
    pg.evaluate('() => __pb.advance(0.3)'); snap('03-trophy')
    left = state()['wu']
    if left is not None and left > 0: pg.evaluate(f'() => __pb.advance({left:.3f})')
    snap('04-contact')
    pg.evaluate('() => __pb.advance(0.35)'); snap('05-serve-flight')
    # the rally: frames every 0.7 s up to 6 s, then until a point ends
    for k in range(9):
        pg.evaluate('() => __pb.advance(0.7)')
        s = state()
        snap(f'1{k}-rally-{s["phase"]}-{s["shots"]}')
    # play on for a while (several points), drawing now and then
    for k in range(6):
        pg.evaluate('() => __pb.advance(6, 1/60, true)')
        s = state()
        snap(f'2{k}-later-{s["call"]}-{s["games"][0]}{s["games"][1]}')
    print('after', json.dumps(state()))
    print('frames:', len(shots))
    print('errors:', errs[:10] if errs else 'none')
    b.close()
