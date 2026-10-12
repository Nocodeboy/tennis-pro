"""Capturas de la 0.5 (sets y físico) en la página real, al estilo de tools/screens.py: el ajuste «Sets», el bug con la
columna de sets, la bola de set, el rótulo de set ganado, la pausa con los sets y el físico, y la pantalla final de un
partido al mejor de tres (a 2 juegos, con tu jugador en piloto automático). Imprime los textos de cada pantalla y los
errores de página.

Uso: python3 tools/audit/ux/sets.py [salida = /tmp/padel-sets] [lang = es] [tamaño = 390x844] [puerto = 8791]
     PADEL_DIST=/otra/dist para otra compilación; PW_CHROMIUM=/ruta/a/chrome si Playwright no trae su Chromium."""
import functools, http.server, threading, sys, os
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/padel-sets'
ROOT = os.environ.get('PADEL_DIST') or os.path.join(os.path.dirname(__file__), '..', '..', '..', 'dist')
LANG = sys.argv[2] if len(sys.argv) > 2 else 'es'
SIZE = [int(v) for v in (sys.argv[3] if len(sys.argv) > 3 else '390x844').split('x')]
PORT = int(sys.argv[4]) if len(sys.argv) > 4 else 8791
os.makedirs(OUT, exist_ok=True)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *a):
        if ' 404 ' in (fmt % a):
            print('server 404:', fmt % a)

srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS, executable_path=os.environ.get('PW_CHROMIUM') or None)
    ctx = b.new_context(viewport={'width': SIZE[0], 'height': SIZE[1]}, device_scale_factor=1, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    pg.on('response', lambda r: errs.append(f'http {r.status} {r.url}') if r.status >= 400 else None)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang={LANG}', wait_until='commit', timeout=120000)
    pg.wait_for_function('window.__pb && document.querySelector("[data-a=play]")', timeout=240000)
    pg.evaluate("window.__pb.view.setTier('low'); window.__pb.manual = true")

    def step(sec, dt=1 / 30):
        pg.evaluate(f'window.__pb.advance({sec}, {dt}, false)')

    def shot(name, sec=0.0):
        if sec:
            step(sec)
        pg.evaluate('window.__pb.view.render(1/60)')
        pg.wait_for_timeout(350)
        pg.screenshot(timeout=240000, path=f'{OUT}/{name}.png')

    def st():
        return pg.evaluate("(() => { const m = window.__pb.match; return m ? { phase: m.phase, games: m.games, sets: m.sets, hist: m.setHist, points: m.points, winner: m.winner, fit: m.players.map((p) => +p.fit.toFixed(2)), dist: m.players.map((p) => Math.round(p.dist)) } : null })()")

    pg.click('[data-a=settings]'); shot('01-ajustes', 0.3)
    pg.click('[data-k=sets] [data-v="3"]'); shot('02-ajustes-3sets', 0.3)
    print('note:', pg.evaluate("document.querySelector('.set-note').textContent"))
    pg.click('[data-a=back]')
    pg.evaluate("window.__pb.save.sets = 3; window.__pb.save.games = 2; window.__pb.save.tutorial = true")
    pg.evaluate('window.__pb.start(0, false)')
    pg.evaluate('window.__pb.autopilot()')
    shot('03-saque', 0.5)
    print('bug:', pg.evaluate("document.querySelector('.tvbug').textContent"))
    pg.evaluate("(() => { const m = window.__pb.match; m.games = [1, 0]; m.points = [3, 0]; m.setupServe(); })()")
    shot('04-bola-de-set', 0.4)
    print('tags:', pg.evaluate("document.querySelector('.tv-state')?.textContent"), '· call:', pg.evaluate("document.querySelector('.tv-call')?.textContent"))
    for _ in range(600):
        step(0.25)
        s = st()
        if s['sets'][0] + s['sets'][1] >= 1:
            break
    print('after set:', st())
    shot('05-set-ganado', 0.05)
    print('strap:', pg.evaluate("document.querySelector('.tv-strap')?.textContent"), '· bug:', pg.evaluate("document.querySelector('.tvbug').textContent"))
    pg.keyboard.press('Escape'); shot('06-pausa', 0.1)
    print('pause:', pg.evaluate("document.querySelector('.pause')?.textContent"))
    pg.click('[data-a=go]')
    # to the end: a set point of the second set, then play on until the match is over
    pg.evaluate("(() => { const m = window.__pb.match; if (m.phase !== 'serve') return; m.games = [1, Math.min(1, m.games[1])]; m.points = [3, 0]; m.setupServe(); })()")
    for _ in range(900):
        step(0.25)
        s = st()
        if not s or s['phase'] == 'over':
            break
        if s['phase'] == 'serve' and s['winner'] is None and s['games'][0] < 1 and s['sets'][0] >= 1:
            pg.evaluate("(() => { const m = window.__pb.match; m.games = [1, Math.min(1, m.games[1])]; m.points = [3, 0]; })()")
    print('over:', st())
    shot('07-fin', 1.5)
    for _ in range(40):
        step(0.25)
        if pg.evaluate("!!document.querySelector('.end')"):
            break
    shot('08-final', 0.5)
    print('final board:', pg.evaluate("document.querySelector('.final-board')?.textContent"), '· stats:', pg.evaluate("document.querySelector('.stats')?.textContent"))
    print('strap at end:', pg.evaluate("document.querySelector('.tv-strap')?.textContent"))
    print('errors:', errs)
    b.close()
srv.shutdown()
