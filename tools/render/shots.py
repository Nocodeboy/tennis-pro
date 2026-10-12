"""Capturas del render del tenis (agente de gráficos): un partido en la cámara de juego, la superficie y el tamaño
pedidos, el bucle parado (window.__pb.manual) y el partido avanzado a mano; también cámaras fijas (debugCam).

Uso: python3 tools/render/shots.py <dist> <out> [WxH = 390x844] [surface = hard] [singles|doubles] [tier = medium]
     [port = 8931] [escenas = rally]
Escenas: rally (un peloteo, la bola en el aire), serve (el saque en cuatro momentos: bola en la mano, lanzamiento,
trofeo, contacto), cams (net, side, corner, umpire, wide: cámaras fijas), info (renderer.info del peloteo).
Con SEED=n la semilla de Math.random."""
import os, sys, threading, functools, http.server, json, time
from playwright.sync_api import sync_playwright

ROOT, OUT = sys.argv[1], sys.argv[2]
W, H = [int(v) for v in (sys.argv[3] if len(sys.argv) > 3 else '390x844').split('x')]
SURF = sys.argv[4] if len(sys.argv) > 4 else 'hard'
MODE = sys.argv[5] if len(sys.argv) > 5 else 'singles'
TIER = sys.argv[6] if len(sys.argv) > 6 else 'medium'
PORT = int(sys.argv[7]) if len(sys.argv) > 7 else 8931
SCENES = (sys.argv[8] if len(sys.argv) > 8 else 'rally').split(',')
os.makedirs(OUT, exist_ok=True)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEED = """(() => { let s = %d; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();""" % int(os.environ.get('SEED', '1234567'))
ST = """(() => { const m = window.__pb.match; const b = m.ballPos();
  return { phase: m.phase, shots: m.rally ? m.rally.shots : 0, b: b ? [b.x, b.y, b.z] : null, t: m.t, windup: m.windup ? m.windup.at : null,
    players: m.players.map((p) => [p.x, p.z]) }; })()"""
INFO = """(() => { const v = window.__pb.view, r = v.renderer; r.info.autoReset = false; r.info.reset(); v.render();
  const i = r.info; const o = { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, texs: i.memory.textures, progs: (i.programs || []).length }; r.info.autoReset = true; return o; })()"""
CAMS = {
    'net': {'px': 6.9, 'py': 1.15, 'pz': 3.4, 'lx': 2.0, 'ly': 0.6, 'lz': -0.4},
    'side': {'px': 12.5, 'py': 6.0, 'pz': 0.0, 'lx': 0.0, 'ly': 0.3, 'lz': 0.0},
    'corner': {'px': -9.0, 'py': 7.5, 'pz': 19.0, 'lx': 0.0, 'ly': 0.0, 'lz': -2.0},
    'umpire': {'px': -4.5, 'py': 2.4, 'pz': -4.5, 'lx': -7.3, 'ly': 1.2, 'lz': 0.0},
    'wide': {'px': 0.0, 'py': 30.0, 'pz': 30.0, 'lx': 0.0, 'ly': 0.0, 'lz': 0.0},
    'base': {'px': 2.5, 'py': 1.6, 'pz': 16.5, 'lx': 0.0, 'ly': 0.4, 'lz': 8.0},
}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=W < H, is_mobile=W < H)
    pg.add_init_script(SEED)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es', timeout=240000)
    pg.wait_for_function('window.__pb && document.querySelector("[data-a=play]")', timeout=240000)
    pg.evaluate(f"window.__pb.manual = true; window.__pb.view.setTier('{TIER}'); window.__pb.save.tutorial = true")
    pg.evaluate("window.__pb.start(1)")
    single = MODE == 'singles'
    # (until the simulation plays singles: the far pair's second player and our partner are put off the court)
    pg.evaluate(f"(() => {{ const v = window.__pb.view; v.setCourt('{SURF}', {str(single).lower()}); }})()")
    pg.evaluate("window.__pb.autopilot()")
    pg.add_style_tag(content='#hud, #banner, #toast, #hint, #screens, #fx, #flash { visibility: hidden !important }' if os.environ.get('NOHUD') else '#toast,#hint{display:none!important}')
    def snap(name):
        t0 = time.time()
        pg.evaluate("window.__pb.view.frame(0, window.__pb.match ? window.__pb.match.t : 0)")
        pg.screenshot(timeout=300000, path=f'{OUT}/{name}.png')
        print(f'  {name} ({time.time() - t0:.0f}s)', flush=True)
    def adv(s, dt=1/60):
        pg.evaluate(f"window.__pb.advance({s}, {dt}, false)")
    if 'serve' in SCENES:
        # wait for the serve's wind-up; frames at the toss, the trophy and the contact
        guard = 0
        while guard < 600:
            guard += 1
            st = pg.evaluate(ST)
            if st['windup']:
                break
            adv(1/30)
        st = pg.evaluate(ST)
        at = st['windup']
        print('windup at', at, 'now', st['t'], flush=True)
        if at:
            for name, before in [('serve-a-mano', 0.85), ('serve-b-lanza', 0.55), ('serve-c-trofeo', 0.25), ('serve-d-contacto', 0.0), ('serve-e-final', -0.25)]:
                st = pg.evaluate(ST)
                dt = (at - before) - st['t']
                if dt > 0:
                    adv(dt, 1/120)
                if os.environ.get('SERVECAM'):
                    pg.evaluate(f"window.__pb.view.debugCam = {os.environ['SERVECAM']}")
                snap(name)
            pg.evaluate("window.__pb.view.debugCam = null")
    if 'rally' in SCENES or 'info' in SCENES or 'cams' in SCENES:
        guard = 0
        while guard < 1500:
            guard += 1
            st = pg.evaluate(ST)
            if st['phase'] == 'rally' and st['shots'] >= 3 and st['b'] and st['b'][1] > 0.5 and -4 < st['b'][2] < 2:
                break
            adv(1/30)
        print(json.dumps(pg.evaluate(ST)), flush=True)
        if 'info' in SCENES:
            print('INFO', TIER, W, H, json.dumps(pg.evaluate(INFO)), flush=True)
        if 'rally' in SCENES:
            snap(f'rally')
    if 'cams' in SCENES:
        for k, cam in CAMS.items():
            pg.evaluate(f"window.__pb.view.debugCam = {json.dumps(cam)}")
            snap(f'cam-{k}')
        pg.evaluate("window.__pb.view.debugCam = null")
    for l in logs[-12:]:
        print('  ', l[:300])
    b.close()
srv.shutdown()
