"""Screenshots of the menus, a match and the end screen on a phone (portrait 390x844), with every page error listed.

Usage: python3 tools/screens.py [out_dir = /tmp/padel-screens] [dist_dir = dist] [lang = es]

The loop is stopped (window.__pb.manual) and the match stepped by hand, so slow software renderers still get there:
menu, draw, how to play, settings, the match card, the serve with the umpire's call, a rally, a point's banner, the
score bug at 40-40 (golden point, then deuce with advantages), a fault («second serve»), the tie-break, and the end
screen (the human's side plays on autopilot; the score is jumped forward so it ends quickly)."""
import functools, http.server, threading, sys, os
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/padel-screens'
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'dist')
LANG = sys.argv[3] if len(sys.argv) > 3 else 'es'
os.makedirs(OUT, exist_ok=True)


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8783), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto(f'http://127.0.0.1:8783/index.html?lang={LANG}')
    pg.wait_for_function('window.__pb && document.querySelector("[data-a=play]")', timeout=60000)
    pg.evaluate("window.__pb.view.setTier('low'); window.__pb.manual = true")

    def step(sec, dt=1 / 30):
        pg.evaluate(f'window.__pb.advance({sec}, {dt}, false)')

    def shot(name, sec=0.0):
        if sec:
            step(sec)
        pg.evaluate('window.__pb.view.render(1/60)')
        pg.wait_for_timeout(350)
        pg.screenshot(timeout=240000, path=f'{OUT}/{name}.png')

    def state():
        return pg.evaluate("(() => { const m = window.__pb.match; return m ? { phase: m.phase, games: m.games, points: m.points, tb: m.tiebreak, srv: m.serveNum, winner: m.winner } : null })()")

    # the menus (the attract match plays behind them)
    shot('01-menu', 2)
    pg.click('[data-a=rivals]'); shot('02-cuadro', 0.3)
    pg.click('[data-a=back]')
    pg.click('[data-a=how]'); shot('03-como', 0.3)
    pg.evaluate("document.querySelector('.panel.how').scrollTop = 99999"); shot('03b-como-fin', 0.1)
    pg.click('[data-a=back]')
    pg.click('[data-a=settings]'); shot('04-ajustes', 0.3)
    pg.click('[data-a=back]')
    pg.click('[data-a=play]'); shot('05-vs', 0.3)
    # the match, without the TV intro (a tap on the card would start it with the cinema on)
    pg.evaluate('window.__pb.start(0, false)')
    pg.evaluate("window.__pb.save.tutorial = true; window.__pb.autopilot()")
    shot('06-saque', 0.5)
    # a rally under way
    for _ in range(40):
        step(0.25)
        st = pg.evaluate("window.__pb.match.phase")
        if st == 'rally' and pg.evaluate("(window.__pb.match.rally?.shots ?? 0) >= 3"):
            break
    shot('07-peloteo')
    # the point's banner
    for _ in range(80):
        step(0.1)
        if pg.evaluate("window.__pb.match.phase") == 'dead':
            break
    shot('08-punto', 0.15)
    # a game won: the strap (the event, as the match sends it)
    pg.evaluate("(() => { const m = window.__pb.match; m.events.push({ type: 'game', winner: 1, games: [0, 1], tiebreak: false }); })()")
    shot('08b-juego', 0.4)
    # 40-40 with the golden point: set the score and set up the next serve
    for _ in range(60):
        step(0.1)
        if pg.evaluate("window.__pb.match.phase") == 'serve':
            break
    pg.evaluate("(() => { const m = window.__pb.match; m.points = [3, 3]; m.setupServe(); })()")
    shot('09-punto-de-oro', 0.4)
    # advantages: deuce, then advantage
    pg.evaluate("(() => { const m = window.__pb.match; m.rules.golden = false; m.points = [3, 3]; m.setupServe(); })()")
    shot('10-iguales', 0.4)
    pg.evaluate("(() => { const m = window.__pb.match; m.points = [4, 3]; m.setupServe(); })()")
    shot('10b-ventaja', 0.4)
    # the tie-break and a second serve
    pg.evaluate("(() => { const m = window.__pb.match; m.rules.golden = true; m.games = [3, 3]; m.tiebreak = true; m.points = [4, 5]; m.serveNum = 2; m.setupServe(); })()")
    shot('11-tiebreak-2saque', 0.4)
    # a fault banner (the event, as the match sends it)
    pg.evaluate("(() => { const m = window.__pb.match; m.events.push({ type: 'fault', pid: m.serverId, fault: 'serveNet', second: true }); })()")
    shot('12-falta', 0.05)
    # to the end: one game from the match, then play on
    pg.evaluate("(() => { const m = window.__pb.match; m.tiebreak = false; m.games = [2, 1]; m.points = [3, 0]; m.serveNum = 1; m.setupServe(); })()")
    for _ in range(400):
        step(0.25)
        st = state()
        if not st or st['phase'] == 'over':
            break
        if st['phase'] == 'serve' and st['winner'] is None and st['games'][0] < 2:
            pg.evaluate("(() => { const m = window.__pb.match; m.games = [2, Math.min(1, m.games[1])]; })()")
    shot('13-fin-partido', 1.5)
    for _ in range(40):
        step(0.25)
        if pg.evaluate("!!document.querySelector('.end')"):
            break
    shot('14-final', 0.5)
    print('state:', state())
    print('errors:', errs)
    b.close()
srv.shutdown()
