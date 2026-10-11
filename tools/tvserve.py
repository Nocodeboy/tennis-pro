"""The TV shot before each serve (the long lens on the server, as Germán saw it), in the real page with the TV
presentation on: a seeded match (Math.random seeded; the simulation never uses it), the intro skipped, then stepped by
hand at 30 frames a second through the first `serves` serves: from the start of each serve's wait to `after` s past
the contact, every frame as the TV director frames it. Two builds with the same arguments give the same frames.
Usage: python3 tools/tvserve.py out_dir [dist = dist] [seed = 7] [port = 8903] [singles|doubles] [rival = 1]
       [serves = 3] [after = 0.6]
Env: W, H (viewport, default 844×390, a phone on its side) · TIER (default medium) · EVERY (keep 1 frame in n, default 1)
Writes out_dir/frames/NNNN.jpg, out_dir/tv.mp4 and out_dir/estado.json (phase, time, serve, the server's stance)."""
import os, sys, threading, functools, http.server, json, time, base64, subprocess, shutil
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
ROOT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(HERE, '..', 'dist')
SEED = int(sys.argv[3]) if len(sys.argv) > 3 else 7
PORT = int(sys.argv[4]) if len(sys.argv) > 4 else 8903
MODE = sys.argv[5] if len(sys.argv) > 5 else 'singles'
RIVAL = int(sys.argv[6]) if len(sys.argv) > 6 else 1
SERVES = int(sys.argv[7]) if len(sys.argv) > 7 else 3
AFTER = float(sys.argv[8]) if len(sys.argv) > 8 else 0.6
W = int(os.environ.get('W', '844'))
H = int(os.environ.get('H', '390'))
TIER = os.environ.get('TIER', 'medium')
EVERY = int(os.environ.get('EVERY', '1'))
FR = os.path.join(OUT, 'frames')
shutil.rmtree(FR, ignore_errors=True)
os.makedirs(FR)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEEDED = """(() => { let s = %d >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();""" % SEED
ST = """(() => { const pb = window.__pb, m = pb.match, v = pb.view;
  return { t: +m.t.toFixed(3), phase: m.phase, wu: m.windup ? +(m.windup.at - m.t).toFixed(3) : null, shot: v.director.kind,
    cine: pb.bc.cine ? pb.bc.cine.kind : null, server: m.phase === 'serve' ? m.server().id : -1, score: m.score.join('-') }; })()"""

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=W < H, is_mobile=W < H)
    logs = []
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.add_init_script(SEEDED)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es', timeout=240000)
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=240000)
    start = f"window.__pb.startDoubles({RIVAL}, true)" if MODE == 'doubles' else f"window.__pb.start({RIVAL}, true)"
    pg.evaluate(f"window.__pb.view.setTier('{TIER}'); window.__pb.manual = true; window.__pb.save.tutorial = true")
    # (the intro skipped, as a tap does: straight to the first serve)
    pg.evaluate(SEEDED)
    pg.evaluate(f"{start}; window.__pb.bc.skip(); window.__pb.autopilot()")
    states = []
    n = 0
    served = 0
    last_phase = None
    t0 = time.time()
    guard = 0
    keep = False
    tail = 0.0
    while served < SERVES and guard < 30 * 120:
        guard += 1
        pg.evaluate("window.__pb.advance(1/30, 1/60, false)")
        st = pg.evaluate(ST)
        if st['phase'] == 'serve' and not st['cine']:
            keep = True
            tail = AFTER
        elif keep and last_phase == 'serve' and st['phase'] != 'serve':
            served += 1
        if keep and st['phase'] != 'serve':
            tail -= 1 / 30
            if tail < 0:
                keep = False
        last_phase = st['phase']
        if keep and guard % EVERY == 0:
            # (drawn and read in one go: between two calls the browser may clear the drawing buffer, a black frame)
            url = pg.evaluate("(() => { window.__pb.view.render(); return window.__pb.view.renderer.domElement.toDataURL('image/jpeg', 0.9); })()")
            with open(f'{FR}/{n:04d}.jpg', 'wb') as f:
                f.write(base64.b64decode(url.split(',', 1)[1]))
            states.append({'i': n, **st})
            n += 1
            if n % 30 == 0:
                print(f'  {n} frames, serve {served + 1}/{SERVES} {json.dumps(st)} {time.time() - t0:.0f}s', flush=True)
    with open(os.path.join(OUT, 'estado.json'), 'w') as f:
        json.dump(states, f)
    for l in logs[-6:]:
        print('  ', l)
    b.close()
srv.shutdown()
mp4 = os.path.join(OUT, 'tv.mp4')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(30 // EVERY), '-i', f'{FR}/%04d.jpg', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', mp4], check=True)
print('→', mp4, n, 'frames')
