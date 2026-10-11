"""Close-up captures of swings (checks that the paddle meets the ball): steps a match by hand and shoots a few frames
around contacts, with a camera next to the hitter. Usage: python3 tools/swing.py [out_dir] [n contacts = 4]"""
import os, sys, threading, functools, http.server, json
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pb-swing'
N = int(sys.argv[2]) if len(sys.argv) > 2 else 4
os.makedirs(OUT, exist_ok=True)
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8782), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

NEXT = """(() => { const m = window.__pb.match; if (!m) return null;
  for (const p of m.players) if (p.plan && p.plan.reach) return { pid: p.id, t: p.plan.t - m.t, hand: p.plan.hand, by: p.plan.by, bx: p.plan.bx, bz: p.plan.bz, px: p.x, pz: p.z, side: p.side, phase: m.phase };
  return { pid: -1, phase: m.phase, t: 0 }; })()"""

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 640, 'height': 480})
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto('http://127.0.0.1:8782/index.html?lang=es')
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=60000)
    pg.evaluate("window.__pb.view.setTier('low'); window.__pb.start(2); window.__pb.manual = true")
    # the human serves: a release with a little drag
    pg.evaluate("(() => { const i = window.__pb.input; i.pressing = true; i.dx = 10; i.dy = -10; })()")
    pg.evaluate("window.__pb.advance(0.3)")
    pg.evaluate("(() => { const i = window.__pb.input; i['end'](false); })()")
    done = 0
    guard = 0
    while done < N and guard < 400:
        guard += 1
        st = pg.evaluate(NEXT)
        if not st or st['pid'] < 0 or st['t'] > 0.45:
            pg.evaluate("window.__pb.advance(0.1)")
            continue
        # camera beside the hitter, a bit in front, looking at the contact
        s = st['side']
        cam = {'px': st['bx'] + 2.6, 'py': 1.5, 'pz': st['bz'] - s * 2.2, 'lx': st['bx'], 'ly': 0.9, 'lz': st['bz'] + s * 0.2}
        pg.evaluate(f"window.__pb.view.debugCam = {json.dumps(cam)}")
        t0 = st['t']
        marks = [-0.28, -0.12, 0.0, 0.14]
        prev = -t0
        for k, mk in enumerate(marks):
            step = mk - prev
            if step > 0:
                pg.evaluate(f"window.__pb.advance({step:.4f}, 1/120)")
            prev = mk
            pg.screenshot(timeout=120000, path=f'{OUT}/c{done}-{"fh" if st["hand"] == 1 else "bh"}-{k}.png')
        print(done, json.dumps(st))
        done += 1
        pg.evaluate("window.__pb.view.debugCam = null")
        pg.evaluate("window.__pb.advance(0.2)")
    for l in logs[-10:]:
        print('  ', l)
    b.close()
srv.shutdown()
