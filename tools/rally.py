"""Broadcast-view captures of a rally in a phone viewport, stepping the match by hand (slow software renderers):
the suggested spot, the reach ring, aiming, the contact. Usage: python3 tools/rally.py [out_dir] [tier = medium]"""
import os, sys, threading, functools, http.server, json
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pb-rally'
TIER = sys.argv[2] if len(sys.argv) > 2 else 'medium'
os.makedirs(OUT, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8784), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ST = """(() => { const m = window.__pb.match; const me = m.players[0]; const tg = m.targetFor(0);
  return { phase: m.phase, last: m.rally && m.rally.last ? m.rally.last.id : -1, plan: me.plan ? me.plan.t - m.t : null,
    tg: tg ? { t: tg.t - m.t, d: Math.hypot(me.x - tg.fx, me.z - tg.fz) } : null, score: m.score.join('-') }; })()"""
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 390, 'height': 760}, device_scale_factor=1, has_touch=True, is_mobile=True)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto('http://127.0.0.1:8784/index.html?lang=es')
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=60000)
    pg.evaluate(f"window.__pb.view.setTier('{TIER}'); window.__pb.start(1); window.__pb.manual = true")
    pg.evaluate("window.__pb.advance(0.5)")
    pg.screenshot(timeout=180000, path=f'{OUT}/0-serve.png')
    pg.evaluate("(() => { const i = window.__pb.input; i.pressing = true; i.dx = -12; i.dy = -20; })()")
    pg.evaluate("window.__pb.advance(0.3)")
    pg.evaluate("(() => { const i = window.__pb.input; i['end'](false); })()")
    shots = 0
    guard = 0
    while shots < 5 and guard < 300:
        guard += 1
        st = pg.evaluate(ST)
        if st['phase'] == 'rally' and st['last'] == 1 and st['tg'] and 0.35 < st['tg']['t'] < 0.75:
            # the opponent has hit: show the spot, then aim (drag) and let the contact happen
            pg.screenshot(timeout=180000, path=f'{OUT}/{shots}-a-spot.png')
            pg.evaluate("(() => { const i = window.__pb.input; i.pressing = true; i.dx = %d; i.dy = %d; })()" % ([-50, 40, 10, 60, -30][shots % 5], [-60, -20, 70, -90, 30][shots % 5]))
            pg.evaluate("window.__pb.advance(%.3f, 1/120)" % max(0.05, st['tg']['t'] - 0.2))
            pg.screenshot(timeout=180000, path=f'{OUT}/{shots}-b-aim.png')
            pg.evaluate("(() => { const i = window.__pb.input; i['end'](false); })()")
            pg.evaluate("window.__pb.advance(0.19, 1/120)")
            pg.screenshot(timeout=180000, path=f'{OUT}/{shots}-c-contact.png')
            print(shots, json.dumps(st), json.dumps(pg.evaluate(ST)))
            shots += 1
        elif st['phase'] == 'serve':
            pg.evaluate("(() => { const i = window.__pb.input; i.pressing = true; i.dx = 5; i.dy = -15; })()")
            pg.evaluate("window.__pb.advance(0.3)")
            pg.evaluate("(() => { const i = window.__pb.input; i['end'](false); })()")
        pg.evaluate("window.__pb.advance(0.05, 1/120)")
    for l in logs[-8:]:
        print('  ', l)
    b.close()
srv.shutdown()
