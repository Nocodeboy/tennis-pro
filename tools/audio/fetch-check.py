"""The artifact build fetches its sounds by relative paths: serve dist/, open artifact.html (or index.html), tap once
(the unlock), and list what was fetched from assets/sfx and assets/music, what the engine decoded, and the console.

  python3 tools/audio/fetch-check.py [artifact.html|index.html]"""
import functools, http.server, os, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'dist'))
PAGE = sys.argv[1] if len(sys.argv) > 1 else 'artifact.html'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    got, errs = [], []
    pg.on('response', lambda r: got.append((r.status, r.url.split(str(srv.server_address[1]))[-1])) if '/assets/sfx/' in r.url or '/assets/music/' in r.url else None)
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
    pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/{PAGE}', wait_until='commit', timeout=120000)
    pg.wait_for_function('window.__pb && document.querySelector("[data-a=play]")', timeout=240000)
    pg.mouse.click(195, 300)
    pg.wait_for_timeout(6000)
    st = pg.evaluate("""(() => { const a = window.__pb.audio; return { state: a.ctx && a.ctx.state, takes: Object.fromEntries(Object.entries(a.takes || {}).map(([k, v]) => [k, v.length])),
      music: a.playing ? 'playing' : (a.buffers && a.buffers.menu instanceof AudioBuffer ? 'decoded' : String(a.buffers && a.buffers.menu)), crowd: [a.clapBufs.length, a.oohBufs.length, a.roarBufs.length] }; })()""")
    b.close()
srv.shutdown()
print(PAGE, 'fetched:')
for s, u in sorted(set(got), key=lambda x: x[1]): print(' ', s, u)
print('engine:', st)
print('console:', errs or 'clean')
