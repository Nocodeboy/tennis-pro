"""Automatic screenshots of the prototype (menu, serve, rally, aiming) in a phone and a desktop viewport.
Usage: python3 tools/shots.py [out_dir]   (serves dist/ on a local port)"""
import os
import sys
import threading
import time
import functools
import http.server
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pb-shots'
os.makedirs(OUT, exist_ok=True)

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8781), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']


def run(name, vp, mobile):
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport=vp, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, locale='es-ES')
        pg = ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        pg.goto('http://127.0.0.1:8781/index.html?lang=es')
        pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{OUT}/{name}-1-menu.png')
        pg.evaluate('window.__pb.start(0)')
        pg.wait_for_timeout(1200)
        pg.screenshot(path=f'{OUT}/{name}-2-serve.png')
        # aim the serve: press in the middle, drag a little, hold for the shot
        cx, cy = vp['width'] / 2, vp['height'] * 0.7
        pg.mouse.move(cx, cy)
        pg.mouse.down()
        pg.mouse.move(cx - 20, cy - 25, steps=5)
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/{name}-3-aim-serve.png')
        pg.mouse.up()
        # rally: keep returning with drags; take shots along the way
        shots = 0
        for i in range(26):
            st = pg.evaluate("(() => { const m = window.__pb.match; if (!m) return null; const h = m.humanPlan(); return { phase: m.phase, e: h ? h.plan.t - m.t : null, t: m.t, score: m.games.join('-') + ' ' + m.pointText(0) + '-' + m.pointText(1) }; })()")
            if st and st['phase'] == 'rally' and st['e'] is not None and 0.35 < st['e'] < 1.6:
                pg.mouse.move(cx, cy)
                pg.mouse.down()
                dx = [-60, 40, 0, 70, -30][i % 5]
                dy = [-40, 30, -10, 90, -120][i % 5]
                pg.mouse.move(cx + dx, cy + dy, steps=4)
                wait = max(0, (st['e'] - 0.14) * 1000 - 120)
                if shots < 3:
                    pg.wait_for_timeout(max(0, wait - 150))
                    pg.screenshot(path=f'{OUT}/{name}-4-rally-{shots}.png')
                    shots += 1
                    pg.wait_for_timeout(100)
                else:
                    pg.wait_for_timeout(wait)
                pg.mouse.up()
            elif st and st['phase'] == 'serve':
                pg.mouse.move(cx, cy)
                pg.mouse.down()
                pg.mouse.move(cx + 10, cy - 10, steps=3)
                pg.wait_for_timeout(500)
                pg.mouse.up()
            pg.wait_for_timeout(250)
        pg.screenshot(path=f'{OUT}/{name}-5-later.png')
        st = pg.evaluate("(() => { const m = window.__pb.match; return m ? { games: m.games, points: [m.pointText(0), m.pointText(1)], stats: m.stats, phase: m.phase } : null; })()")
        print(name, st)
        for l in logs[-12:]:
            print('  ', l)
        b.close()


run('movil', {'width': 390, 'height': 844}, True)
run('pc', {'width': 1280, 'height': 720}, False)
srv.shutdown()
