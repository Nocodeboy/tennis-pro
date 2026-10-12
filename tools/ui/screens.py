"""Screenshots of the tennis interface (menus, draws, cards, settings, the match card, the TV graphics and the end
screen) in singles and in doubles, with every page error listed.

Usage: python3 tools/ui/screens.py [out_dir = /tmp/tenis-ui] [dist_dir = dist] [lang = es] [size = 390x844] [port = 8791]
       (a landscape phone: 844x390; a port of its own to run several at once)

The loop is stopped (window.__pb.manual) and the match stepped by hand, so slow software renderers still get there.
The score and the events are set by hand (window.__pb.fakePoint / fakeEvent and the Match's own fields), so the TV
graphics can be checked without waiting for a rally to produce them: the bug with five sets, break point, set point,
match point, deuce and advantage, the deciding point, the tie-break; the banners of an ace, a double fault, an out by
4 cm, a let, a winner, a passing shot, an unforced error; the game, break, set and victory straps; the end screen.
"""
import functools, http.server, threading, sys, os
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tenis-ui'
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
LANG = sys.argv[3] if len(sys.argv) > 3 else 'es'
SIZE = [int(v) for v in (sys.argv[4] if len(sys.argv) > 4 else '390x844').split('x')]
PORT = int(sys.argv[5]) if len(sys.argv) > 5 else 8791
ONLY = os.environ.get('ONLY', '')
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
    # (a clean save: the defaults, the first match)
    pg.add_init_script("try { localStorage.removeItem('tenis-proto-v1') } catch (e) {}")
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang={LANG}', wait_until='commit', timeout=120000)
    pg.wait_for_function('window.__pb && document.querySelector("[data-a=play]")', timeout=240000)
    pg.evaluate("window.__pb.view.setTier('low'); window.__pb.manual = true")

    def step(sec, dt=1 / 30):
        pg.evaluate(f'window.__pb.advance({sec}, {dt}, false)')

    def shot(name, sec=0.0):
        if ONLY and not name.startswith(ONLY):
            if sec:
                step(sec)
            return
        if sec:
            step(sec)
        pg.evaluate('window.__pb.view.render(1/60)')
        pg.wait_for_timeout(300)
        pg.screenshot(timeout=240000, path=f'{OUT}/{name}.png')

    def js(code):
        return pg.evaluate(code)

    def to_serve():
        for _ in range(80):
            step(0.1)
            if js("window.__pb.match.phase") == 'serve':
                return

    def set_score(code):
        """the Match's own fields, then a new serve (the umpire's call, the bug's tags)"""
        to_serve()
        js(f"(() => {{ const m = window.__pb.match; {code}; m.setupServe(); }})()")

    # ---- the menus, singles (the attract match plays behind them)
    shot('01-menu-individual', 2)
    pg.click('[data-a=rivals]'); shot('02-cuadro-individual', 0.3)
    pg.click('[data-a=back]')
    pg.click('[data-a=team]'); shot('03-tu-ficha', 0.3)
    pg.click('[data-a=back]')
    pg.click('[data-a=how]'); shot('04-como', 0.3)
    js("document.querySelector('.panel.how').scrollTop = 520"); shot('04b-como-medio', 0.1)
    js("document.querySelector('.panel.how').scrollTop = 99999"); shot('04c-como-fin', 0.1)
    pg.click('[data-a=back]')
    pg.click('[data-a=settings]'); shot('05-ajustes', 0.3)
    # the surface: clay (the attract match moves to it)
    pg.click('[data-k=surface] [data-v=clay]'); shot('05b-ajustes-tierra', 0.3)
    js("document.querySelector('.panel.settings').scrollTop = 99999"); shot('05c-ajustes-fin', 0.1)
    pg.click('[data-a=back]')
    shot('06-menu-tierra', 1)
    pg.click('[data-a=play]'); shot('07-vs-individual', 0.3)
    pg.click('[data-card=paco]'); shot('07b-ficha-rud', 0.3)
    pg.click('.pc-modal')
    pg.click('[data-a=back]')
    # ---- doubles
    pg.click('[data-k=mode] [data-v=doubles]'); shot('08-menu-dobles', 1)
    pg.click('[data-a=rivals]'); shot('09-cuadro-dobles', 0.3)
    pg.click('[data-a=back]')
    pg.click('[data-a=team]'); shot('10-tu-pareja', 0.3)
    pg.click('[data-a=back]')
    pg.click('[data-a=play]'); shot('11-vs-dobles', 0.3)
    pg.click('[data-a=back]')
    # ---- a singles match on grass (the white kits), three sets: the TV intro card, then the gameplay camera
    js("window.__pb.setSurface('grass'); window.__pb.save.sets = 3; window.__pb.save.games = 6")
    js("window.__pb.start(4, true)")
    shot('12-intro-tv', 0.7)
    js("window.__pb.bc.skip()")
    js("window.__pb.save.tutorial = true; window.__pb.autopilot()")
    shot('13-saque', 0.4)
    for _ in range(60):
        step(0.25)
        if js("window.__pb.match.phase") == 'rally' and js("(window.__pb.match.rally?.shots ?? 0) >= 3"):
            break
    shot('14-peloteo')
    js("window.__pb.forceCue = 'attack'"); shot('14b-ataca', 0.05)
    js("window.__pb.forceCue = null")
    # ---- the point's banners (the events as the match sends them)
    banners = [
        ('15a-ace', "0, 'winner', 'serve', 1"),
        ('15b-ace-rival', "1, 'winner', 'serve', 1"),
        ('15c-doble-falta', "1, 'doubleFault', 'serve', 1"),
        ('15d-fuera-4cm', "0, 'out', 'drive', 7, 0.04"),
        ('15e-fuera-tuyo', "1, 'out', 'drive', 5, 0.6, -1"),
        ('15f-red', "1, 'net', 'slice', 4"),
        ('15g-ganador', "0, 'winner', 'drive', 6"),
        ('15h-remate', "0, 'winner', 'smash', 8"),
        ('15i-dejada-rival', "1, 'winner', 'drop', 5"),
    ]
    # (the live match is held while the made-up events are on screen: a real point would take the banner's place)
    js("window.__pb.timeScale = 0")
    for name, args in banners:
        js(f"window.__pb.fakePoint({args})")
        # (read now: the banner's own timer runs on the real clock, slower renderers outlast it)
        print(name, '·', js("document.querySelector('#banner').textContent"), '·', js("window.__pb.why"))
        shot(name)
    # a let and a fault («second serve»)
    js("(() => { const m = window.__pb.match; window.__pb.fakeEvent({ type: 'let', pid: m.serverId }); })()"); shot('16a-let')
    js("(() => { const m = window.__pb.match; window.__pb.fakeEvent({ type: 'bounce', x: 1, z: -6.47, good: false, first: true, close: true, out: 0.05 }); window.__pb.fakeEvent({ type: 'fault', pid: m.serverId, fault: 'serveOut', second: true }); })()"); shot('16b-falta')
    js("window.__pb.timeScale = 1")
    # ---- the score bug: sets in their columns, break point, set point, match point, deuce, advantage, tie-break
    set_score("m.setHist = [[6, 4], [3, 6]]; m.sets = [1, 1]; m.games = [2, 1]; m.points = [1, 3]; m.serverTeam = 0; m.serverId = 0")
    shot('17a-bola-de-break', 0.4)
    set_score("m.setHist = [[6, 4], [3, 6]]; m.sets = [1, 1]; m.games = [4, 5]; m.points = [1, 3]; m.serverTeam = 0; m.serverId = 0")
    shot('17a2-bola-de-partido-rival', 0.4)
    set_score("m.setHist = [[6, 4]]; m.sets = [1, 0]; m.games = [5, 4]; m.points = [3, 1]; m.serverTeam = 0; m.serverId = 0")
    shot('17b-bola-de-partido', 0.4)
    set_score("m.setHist = []; m.sets = [0, 0]; m.games = [5, 3]; m.points = [3, 2]; m.serverTeam = 0; m.serverId = 0")
    shot('17c-bola-de-set', 0.4)
    set_score("m.games = [2, 2]; m.points = [3, 3]")
    shot('17d-iguales', 0.4)
    set_score("m.games = [2, 2]; m.points = [3, 4]")
    shot('17e-ventaja', 0.4)
    set_score("m.rules.golden = true; m.games = [2, 2]; m.points = [3, 3]")
    shot('17f-punto-decisivo', 0.4)
    set_score("m.rules.golden = false; m.games = [6, 6]; m.tiebreak = true; m.points = [5, 4]; m.serveNum = 2")
    shot('17g-tiebreak-2saque', 0.4)
    # five sets: four in their columns, the fifth being played
    set_score("m.rules.sets = 5; m.tiebreak = false; m.serveNum = 1; m.setHist = [[6, 4], [3, 6], [7, 6], [4, 6]]; m.sets = [2, 2]; m.games = [5, 5]; m.points = [2, 1]")
    shot('17h-cinco-sets', 0.4)
    # ---- the straps: a game, a break, a set (with a tie-break)
    js("window.__pb.timeScale = 0")
    js("window.__pb.fakeEvent({ type: 'game', winner: 0, games: [3, 2], tiebreak: false })"); shot('18a-juego', 0.4)
    js("(() => { const m = window.__pb.match; m.setupServe(); window.__pb.fakeEvent({ type: 'game', winner: 1, games: [3, 3], tiebreak: false }); })()"); shot('18b-break', 0.4)
    # a set to a tie-break 7-5: its points played as the match would (the strap says «7–6 (5)»)
    js("(() => { const m = window.__pb.match; m.rules.sets = 3; m.setHist = [[6, 4]]; m.sets = [1, 0]; m.games = [6, 6]; m.tiebreak = true; m.points = [0, 0]; m.setupServe(); for (const e of m.events.splice(0)) window.__pb.fakeEvent(e); window.__pb.bc.tbLost.length = 0; window.__pb.bc.tbLost.push(null); for (const w of [1,0,1,0,1,0,1,0,1,0,1,1]) window.__pb.fakeEvent({ type: 'point', winner: w, reason: 'winner', fault: null, rally: 5 }); m.setHist.push([6, 7]); m.sets = [1, 1]; m.games = [0, 0]; m.tiebreak = false; m.points = [0, 0]; window.__pb.fakeEvent({ type: 'set', winner: 1, games: [6, 7], sets: [1, 1], tiebreak: true }); })()"); shot('18c-set', 0.4)
    js("window.__pb.timeScale = 1")
    # ---- to the end: one point from the match (best of three, 6-4 4-5 40-0), then play on
    set_score("m.rules.sets = 3; m.rules.games = 6; m.setHist = [[6, 4]]; m.sets = [1, 0]; m.games = [5, 4]; m.points = [3, 0]; m.tiebreak = false; m.serverTeam = 0; m.serverId = 0; window.__pb.bc.tbLost.length = 0; window.__pb.bc.tbLost.push(null)")
    for _ in range(600):
        step(0.25)
        st = js("(() => { const m = window.__pb.match; return m ? { phase: m.phase, games: m.games, sets: m.sets, winner: m.winner } : null })()")
        if not st or st['phase'] == 'over':
            break
        if st['phase'] == 'serve' and st['winner'] is None and st['games'][0] < 5:
            js("(() => { const m = window.__pb.match; m.games = [5, Math.min(4, m.games[1])]; m.points = [3, 0]; })()")
    shot('19-fin-partido', 1.2)
    for _ in range(60):
        step(0.25)
        if js("!!document.querySelector('.end')"):
            break
    shot('20-final', 0.5)
    # ---- a doubles match on clay (the bug with two names a side, the end screen's partner stats)
    js("window.__pb.bc.reset(); window.__pb.setSurface('clay'); window.__pb.save.sets = 1; window.__pb.save.games = 4")
    js("window.__pb.startDoubles(2)")
    js("window.__pb.save.tutorial = true; window.__pb.autopilot()")
    shot('21-dobles-saque', 0.6)
    set_score("m.games = [3, 3]; m.points = [2, 3]")
    shot('22-dobles-bola-de-break', 0.4)
    set_score("m.games = [3, 3]; m.points = [3, 4]")
    shot('22b-dobles-ventaja', 0.4)
    js("window.__pb.input.clear()")
    pg.click('#pauseBtn'); shot('22c-pausa', 0.1)
    pg.click('[data-a=go]')
    js("window.__pb.timeScale = 0")
    js("window.__pb.fakePoint(0, 'winner', 'speedup', 6)"); shot('23-dobles-volea')
    set_score("m.games = [3, 2]; m.points = [3, 1]; m.serverTeam = 0; m.serverId = 0")
    js("window.__pb.timeScale = 1")
    for _ in range(600):
        step(0.25)
        st = js("(() => { const m = window.__pb.match; return m ? { phase: m.phase, games: m.games, winner: m.winner } : null })()")
        if not st or st['phase'] == 'over':
            break
        if st['phase'] == 'serve' and st['winner'] is None:
            js("(() => { const m = window.__pb.match; m.games = [3, 2]; m.points = [3, 0]; m.tiebreak = false; })()")
    for _ in range(60):
        step(0.25)
        if js("!!document.querySelector('.end')"):
            break
    shot('24-dobles-final', 0.5)
    # ---- a best of five that goes the distance (singles, hard court): 6-4 6-7(5) 3-6 7-5, then the fifth to 4
    pg.click('[data-a=menu]')
    js("window.__pb.setMode('singles'); window.__pb.setSurface('hard'); window.__pb.save.sets = 5; window.__pb.save.games = 4")
    js("window.__pb.start(2)")
    js("window.__pb.save.tutorial = true; window.__pb.autopilot()")
    set_score("m.setHist = [[6, 4], [6, 7], [3, 6], [7, 5]]; m.sets = [2, 2]; m.games = [3, 2]; m.points = [3, 0]; m.serverTeam = 0; m.serverId = 0; window.__pb.bc.tbLost.push(null, 5, null, null)")
    for _ in range(600):
        step(0.25)
        st = js("(() => { const m = window.__pb.match; return m ? { phase: m.phase, winner: m.winner } : null })()")
        if not st or st['phase'] == 'over':
            break
        if st['phase'] == 'serve' and st['winner'] is None:
            js("(() => { const m = window.__pb.match; m.games = [3, 2]; m.points = [3, 0]; m.tiebreak = false; })()")
    shot('25-cinco-sets-bug', 0.3)
    for _ in range(60):
        step(0.25)
        if js("!!document.querySelector('.end')"):
            break
    shot('26-cinco-sets-final', 0.5)
    print('errors:', errs)
    b.close()
srv.shutdown()
