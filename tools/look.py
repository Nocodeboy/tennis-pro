"""The look of the venue, the same frames every time (Math.random seeded, the match stepped by hand): the serve, a
rally in the gameplay camera, and fixed cameras by the net, at the stands, a wide corner view and from behind the near
baseline. Prints renderer.info of the rally frame (draw calls, triangles, textures; shadow pass and post included).
Usage: python3 tools/look.py <dist_dir> <out_dir> <tier> <W> <H> <port> [scenes=play,serve,net,stands,wide,far]
[singles|doubles]; the close-ups of the furniture: umpire, bench, tvcam, post, corner. QUERY=props=box (an environment
variable) adds options to the page's URL. Software rendering: judge the looks, not the speed."""
import os, sys, threading, functools, http.server, json, time
from playwright.sync_api import sync_playwright

ROOT, OUT, TIER = sys.argv[1], sys.argv[2], sys.argv[3]
W, H, PORT = int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
SCENES = (sys.argv[7] if len(sys.argv) > 7 else 'play,serve,net,stands,wide,far').split(',')
MODE = sys.argv[8] if len(sys.argv) > 8 else 'singles'
os.makedirs(OUT, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEED = """(() => { let s = 1234567; window.__seed = (v) => { s = v >>> 0; }; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();"""
INFO = """(() => { const v = window.__pb.view, r = v.renderer; r.info.autoReset = false; r.info.reset(); v.render();
  const i = r.info; const o = { calls: i.render.calls, tris: i.render.triangles, lines: i.render.lines, points: i.render.points,
  geos: i.memory.geometries, texs: i.memory.textures, progs: (i.programs || []).length, props: v.venue.furnishMs }; r.info.autoReset = true; return o; })()"""
ST = """(() => { const m = window.__pb.match; const b = m.ballPos();
  return { phase: m.phase, shots: m.rally ? m.rally.shots : 0, b: b ? [b.x, b.y, b.z] : null, t: m.t }; })()"""
CAMS = {
    'net': {'px': 4.6, 'py': 1.05, 'pz': 3.2, 'lx': 1.6, 'ly': 0.55, 'lz': -0.2},
    'stands': {'px': -1.0, 'py': 1.7, 'pz': 5.5, 'lx': 9.0, 'ly': 1.6, 'lz': -3.0},
    'wide': {'px': -13.0, 'py': 8.5, 'pz': 15.5, 'lx': 0.0, 'ly': 0.0, 'lz': -1.0},
    'far': {'px': 0.0, 'py': 3.2, 'pz': 9.5, 'lx': 0.0, 'ly': 1.0, 'lz': -12.0},
    # the court's furniture up close: the umpire's chair at the net (from outside the cage, over the far bench), the
    # near bench, the TV camera in the near right corner (from beside the side glass), a net post (from inside the
    # court) and a corner of the cage's frame
    'umpire': {'px': -6.3, 'py': 2.4, 'pz': -3.6, 'lx': -5.8, 'ly': 1.3, 'lz': 0.0},
    'bench': {'px': -7.6, 'py': 2.0, 'pz': 3.9, 'lx': -6.0, 'ly': 0.5, 'lz': 1.4},
    'tvcam': {'px': 5.4, 'py': 1.9, 'pz': 9.2, 'lx': 6.4, 'ly': 1.45, 'lz': 11.6},
    'post': {'px': 3.7, 'py': 1.05, 'pz': 1.6, 'lx': 4.55, 'ly': 0.45, 'lz': -0.5},
    'corner': {'px': -2.5, 'py': 1.6, 'pz': 6.0, 'lx': -5.0, 'ly': 1.4, 'lz': 9.0},
}
def snap(pg, name):
    t0 = time.time()
    pg.evaluate("window.__pb.view.frame(0, window.__pb.match ? window.__pb.match.t : 0)")
    pg.screenshot(timeout=300000, path=f'{OUT}/{name}.png')
    print(f'  {name} ({time.time() - t0:.0f}s)', flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=W < H, is_mobile=W < H)
    pg.add_init_script(SEED)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    # QUERY: more of the page's options (e.g. props=box, light=off)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es' + ('&' + os.environ['QUERY'] if os.environ.get('QUERY') else ''), timeout=180000)
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=120000)
    start = 'window.__pb.startDoubles(2)' if MODE == 'doubles' else 'window.__pb.start(3)'
    pg.evaluate(f"window.__pb.manual = true; window.__pb.view.setTier('{TIER}'); window.__seed(424242); {start}; window.__pb.save.tutorial = true; window.__pb.autopilot()")
    pg.evaluate("window.__pb.advance(0.4, 1/60, false)")
    if 'serve' in SCENES:
        snap(pg, 'serve')
    # into a rally: the ball in the air around the middle, after a few shots
    guard = 0
    while guard < 900:
        guard += 1
        st = pg.evaluate(ST)
        if st['phase'] == 'rally' and st['shots'] >= 4 and st['b'] and st['b'][1] > 0.5 and -3.5 < st['b'][2] < 1.5:
            break
        pg.evaluate("window.__pb.advance(1/30, 1/60, false)")
    print(json.dumps(pg.evaluate(ST)))
    info = pg.evaluate(INFO)
    print('INFO', TIER, W, H, json.dumps(info), flush=True)
    if 'play' in SCENES:
        snap(pg, 'play')
        bs = pg.evaluate("(() => { const b = window.__pb.match.ballPos(); return window.__pb.view.toScreen(b.x, b.y, b.z); })()")
        with open(f'{OUT}/ball.json', 'w') as f:
            json.dump(bs, f)
    for k, cam in CAMS.items():
        if k not in SCENES:
            continue
        pg.evaluate(f"window.__pb.view.debugCam = {json.dumps(cam)}")
        snap(pg, k)
    pg.evaluate("window.__pb.view.debugCam = null")
    for l in logs[-8:]:
        print('  ', l)
    b.close()
srv.shutdown()
