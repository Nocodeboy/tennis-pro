"""Screenshots of the menus, a match and the end screen on a phone (portrait 390x844 by default), with every page
error listed.

Usage: python3 tools/screens.py [out_dir = /tmp/padel-screens] [dist_dir = dist] [lang = es] [size = 390x844] [port = 8783]
       (a landscape phone: 844x390; a port of its own to run several at once)

The loop is stopped (window.__pb.manual) and the match stepped by hand, so slow software renderers still get there:
menu, draw (each pair's overall), your pair's cards, how to play, settings, the match card with the four players'
cards and one opened whole, the serve with the umpire's call, a rally, the BAJADA and ATTACK cues, a point's banner,
the banners of the 0.3 shots (a winning bajada, a por 3, a remate going for por 4 into the net), the score bug at
40-40 (golden point, then deuce with advantages), a fault («second serve»), the tie-break, and the end screen (the
human's side plays on autopilot; the score is jumped forward so it ends quickly)."""
import functools, http.server, threading, sys, os
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/padel-screens'
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'dist')
LANG = sys.argv[3] if len(sys.argv) > 3 else 'es'
SIZE = [int(v) for v in (sys.argv[4] if len(sys.argv) > 4 else '390x844').split('x')]
PORT = int(sys.argv[5]) if len(sys.argv) > 5 else 8783
os.makedirs(OUT, exist_ok=True)


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': SIZE[0], 'height': SIZE[1]}, device_scale_factor=1, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
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

    def state():
        return pg.evaluate("(() => { const m = window.__pb.match; return m ? { phase: m.phase, games: m.games, points: m.points, tb: m.tiebreak, srv: m.serveNum, winner: m.winner } : null })()")

    # the menus (the attract match plays behind them)
    shot('01-menu', 2)
    pg.click('[data-a=rivals]'); shot('02-cuadro', 0.3)
    pg.click('[data-a=back]')
    pg.click('[data-a=team]'); shot('02b-pareja', 0.3)
    pg.evaluate("document.querySelector('.panel.team').scrollTop = 99999"); shot('02c-pareja-fin', 0.1)
    pg.click('[data-a=back]')
    pg.click('[data-a=how]'); shot('03-como', 0.3)
    # the 0.3 sections: the power of the gesture, attack and defend, over your head
    pg.evaluate("(() => { const p = document.querySelector('.panel.how'); p.scrollTop += document.querySelectorAll('.how-s')[2].getBoundingClientRect().top - p.getBoundingClientRect().top - p.querySelector('.ph').offsetHeight - 4; })()"); shot('03a-como-golpes', 0.1)
    pg.evaluate("document.querySelector('.panel.how').scrollTop = 99999"); shot('03b-como-fin', 0.1)
    pg.click('[data-a=back]')
    pg.click('[data-a=settings]'); shot('04-ajustes', 0.3)
    pg.click('[data-a=back]')
    pg.click('[data-a=play]'); shot('05-vs', 0.3)
    # a rival's card, whole (a tap on it), then closed
    pg.click('[data-card=lola]'); shot('05b-ficha', 0.3)
    pg.click('.pc-modal')
    pg.click('[data-card=hero]'); shot('05c-ficha-tu', 0.3)
    pg.click('.pc-modal')
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
    # the cues beside your player (the gameplay decides when; here forced for the capture)
    pg.evaluate("window.__pb.forceCue = 'bajada'"); shot('07b-bajada', 0.05)
    pg.evaluate("window.__pb.forceCue = 'attack'"); shot('07c-ataca', 0.05)
    pg.evaluate("window.__pb.forceCue = null")
    # the point's banner
    for _ in range(80):
        step(0.1)
        if pg.evaluate("window.__pb.match.phase") == 'dead':
            break
    shot('08-punto', 0.15)
    # the 0.3 shots' banners (the events as the match sends them: the deciding hit, then the point)
    for name, args in [('08c-bajada', "0, 'winner', 'bajada'"), ('08d-por3', "0, 'exit', 'smash', 'por3'"), ('08e-por4-fallado', "1, 'net', 'smash', 'por4'"), ('08f-vibora-rival', "1, 'winner', 'vibora'")]:
        pg.evaluate(f"window.__pb.fakePoint({args})")
        # (read now: the banner's own timer runs on the real clock, slower renderers outlast it)
        print(name, '·', pg.evaluate("document.querySelector('#banner').textContent"), '·', pg.evaluate("window.__pb.why"))
        shot(name, 0.1)
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
