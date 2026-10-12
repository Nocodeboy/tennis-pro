"""Capturas del render del tenis con el banco de pruebas (tools/render/harness.ts, compilado con
tools/render/build-shim.mjs <dir> harness): sin la interfaz, con el saque del contrato y el individual escondiendo a los
compañeros. Uso: python3 tools/render/hshots.py <dir> <out> <WxH> <surface> <singles|doubles> <tier> <port> <escenas>
Escenas: rally (peloteo), serve (el saque en cinco momentos), cams (cámaras fijas), info (renderer.info del peloteo).
Env: SEED (del partido), SERVECAM (una debugCam en JSON para el saque), PREFIX (de los nombres)."""
import os, sys, threading, functools, http.server, json, time
from playwright.sync_api import sync_playwright

ROOT, OUT = sys.argv[1], sys.argv[2]
W, H = [int(v) for v in sys.argv[3].split('x')]
SURF, MODE, TIER, PORT = sys.argv[4], sys.argv[5], sys.argv[6], int(sys.argv[7])
SCENES = sys.argv[8].split(',')
SEED = int(os.environ.get('SEED', '4242'))
PRE = os.environ.get('PREFIX', f'{SURF}-{MODE[0]}-{W}x{H}-')
os.makedirs(OUT, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
RNG = """(() => { let s = 1234567; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();"""
ST = """(() => { const m = window.__h.match; const b = m.ballPos();
  return { phase: m.phase, shots: m.rally ? m.rally.shots : 0, b: b ? [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2)] : null, t: m.t, windup: m.windup ? m.windup.at : null, server: m.server().id }; })()"""
INFO = """(() => { const v = window.__h.view, r = v.renderer; r.info.autoReset = false; r.info.reset(); window.__h.render();
  const i = r.info; const o = { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, texs: i.memory.textures, progs: (i.programs || []).length }; r.info.autoReset = true; return o; })()"""
CAMS = {
    'net': {'px': 6.9, 'py': 1.15, 'pz': 3.4, 'lx': 2.0, 'ly': 0.6, 'lz': -0.4},
    'post': {'px': 3.2, 'py': 1.3, 'pz': 2.6, 'lx': 5.6, 'ly': 0.7, 'lz': 0.0},
    'side': {'px': 12.5, 'py': 6.0, 'pz': 0.0, 'lx': 0.0, 'ly': 0.3, 'lz': 0.0},
    'corner': {'px': -9.0, 'py': 7.5, 'pz': 19.0, 'lx': 0.0, 'ly': 0.0, 'lz': -2.0},
    'umpire': {'px': -3.6, 'py': 2.3, 'pz': -4.2, 'lx': -7.0, 'ly': 1.1, 'lz': 0.0},
    'wide': {'px': 0.0, 'py': 34.0, 'pz': 30.0, 'lx': 0.0, 'ly': 0.0, 'lz': 0.0},
    'base': {'px': 2.5, 'py': 1.6, 'pz': 17.0, 'lx': 0.0, 'ly': 0.4, 'lz': 8.0},
}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    pg.add_init_script(RNG)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?tier={TIER}', timeout=240000)
    pg.wait_for_function('window.__h && window.__h.loaded', timeout=300000, polling=1000)
    pg.evaluate(f"window.__manual = true; window.__h.start('{SURF}', {str(MODE == 'singles').lower()}, {SEED})")
    def snap(name, fresh=True):
        t0 = time.time()
        pg.evaluate("window.__h.render()" if fresh and not name.startswith('tv-') else "window.__h.view.render(1/60)")
        pg.screenshot(timeout=300000, path=f'{OUT}/{PRE}{name}.png')
        print(f'  {PRE}{name} ({time.time() - t0:.0f}s)', flush=True)
    def adv(s, dt=1/60):
        pg.evaluate(f"window.__h.advance({s}, {dt})")
    adv(0.3)
    if 'serve' in SCENES:
        guard = 0
        while guard < 600:
            guard += 1
            st = pg.evaluate(ST)
            if st['windup']:
                break
            adv(1/30)
        st = pg.evaluate(ST)
        at = st['windup']
        print('saque', json.dumps(st), flush=True)
        if os.environ.get('SERVECAM'):
            pg.evaluate(f"window.__h.playerCam(window.__h.match.windup.pid, '{os.environ['SERVECAM']}', 1.55)")
        if at:
            for name, before in [('saque-1-mano', 0.95), ('saque-2-lanza', 0.6), ('saque-3-trofeo', 0.33), ('saque-4-caida', 0.12), ('saque-5-contacto', 0.0), ('saque-6-final', -0.3)]:
                st = pg.evaluate(ST)
                d = (at - before) - st['t']
                if d > 1e-4:
                    adv(d, d / max(1, round(d * 120)))
                snap(name)
        pg.evaluate("window.__h.view.debugCam = null")
    if any(s in SCENES for s in ('rally', 'info', 'cams', 'pcam', 'tv')):
        guard = 0
        while guard < 2000:
            guard += 1
            st = pg.evaluate(ST)
            if st['phase'] == 'rally' and st['shots'] >= 3 and st['b'] and st['b'][1] > 0.5 and -5 < st['b'][2] < 3:
                break
            adv(1/30)
        print(json.dumps(pg.evaluate(ST)), flush=True)
        if 'info' in SCENES:
            print('INFO', SURF, MODE, TIER, W, H, json.dumps(pg.evaluate(INFO)), flush=True)
        if 'rally' in SCENES:
            snap('peloteo')
    if 'tv' in SCENES:
        # the director's shots: the intro flight at its keys, a reaction, the three replay angles (on the frame as it is)
        for k, t in [('intro-0', 0.0), ('intro-1', 1.0), ('intro-2', 1.9), ('intro-3', 3.0), ('intro-4', 4.4)]:
            pg.evaluate(f"(() => {{ const v = window.__h.view; v.director.intro(v.dirCtx()); v.frame({t}, 0); }})()")
            snap(f'tv-{k}')
        pg.evaluate("(() => { const v = window.__h.view; v.director.react(v.dirCtx(), 0); v.frame(1.6, 0); })()")
        snap('tv-reaccion')
        pg.evaluate("(() => { const v = window.__h.view; v.director.serve(v.dirCtx(), 2, false, true); v.frame(1.5, 0); })()")
        snap('tv-saque-lejos')
        for ang in ('side', 'end', 'net'):
            pg.evaluate(f"(() => {{ const v = window.__h.view; v.director.replay(v.dirCtx(), '{ang}', 0); v.frame(0.5, 0); }})()")
            snap(f'tv-rep-{ang}')
        pg.evaluate("(() => { const v = window.__h.view; v.director.victory(v.dirCtx(), 0, true); v.frame(2.0, 0); })()")
        snap('tv-victoria')
        pg.evaluate("window.__h.view.director.reset()")
    if 'pcam' in SCENES:
        # the players up close at the rally frame: each one from the front and from the side
        for pid in (0, 2):
            for k in ('front', 'side'):
                pg.evaluate(f"window.__h.playerCam({pid}, '{k}', 1.15)")
                snap(f'jugador{pid}-{k}')
        pg.evaluate("window.__h.view.debugCam = null")
    if 'cams' in SCENES:
        for k, cam in CAMS.items():
            pg.evaluate(f"window.__h.view.debugCam = {json.dumps(cam)}")
            snap(f'cam-{k}')
        pg.evaluate("window.__h.view.debugCam = null")
    for l in logs[-12:]:
        print('  ', l[:300])
    b.close()
srv.shutdown()
