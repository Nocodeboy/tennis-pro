"""Screenshots of the menus and the end screen (phone viewport). Usage: python3 tools/screens.py out_dir"""
import functools, http.server, threading, sys, os
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pb-screens'
os.makedirs(OUT, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8783), functools.partial(Q, directory=os.path.join(os.path.dirname(__file__), '..', 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8783/index.html?lang=es')
    pg.wait_for_timeout(1500)
    pg.click('[data-a=rivals]'); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/rivales.png')
    pg.click('[data-a=back]'); pg.wait_for_timeout(300)
    pg.click('[data-a=how]'); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/como.png')
    pg.click('[data-a=back]'); pg.wait_for_timeout(300)
    pg.click('[data-a=play]'); pg.wait_for_timeout(500); pg.screenshot(path=f'{OUT}/vs.png')
    pg.click('.screen'); pg.wait_for_timeout(600)
    # jump to 10-3 and let the auto returns play it out
    for i in range(40):
        st = pg.evaluate("(() => { const m = window.__pb.match; if (!m) return 'none'; if (m.score[0] < 10) { m.score[0] = 10; m.score[1] = 3; } return m.phase; })()")
        if st == 'serve':
            pg.mouse.move(195, 600); pg.mouse.down(); pg.mouse.move(200, 590, steps=2); pg.wait_for_timeout(300); pg.mouse.up()
        if st in ('over', 'none'):
            break
        pg.wait_for_timeout(500)
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/final.png')
    print('errors:', errs)
    b.close()
srv.shutdown()
