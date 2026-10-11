"""Where the rallies are in a match tools/seq.py would shoot (the same page, seed and rival, no drawing: quick): every
point with when it starts and ends (match seconds), how many shots and how it ends, to pick the moments to film.
Usage: python3 tools/seqscan.py [dist = dist] [seed = 7] [port = 8842] [mode = singles|doubles] [rival = 2] [secs = 180]"""
import os, sys, threading, functools, http.server, json
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, '..', 'dist')
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 7
PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 8842
MODE = sys.argv[4] if len(sys.argv) > 4 else 'singles'
RIVAL = int(sys.argv[5]) if len(sys.argv) > 5 else 2
SECS = float(sys.argv[6]) if len(sys.argv) > 6 else 180

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEEDED = """(() => { let s = %d >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();""" % SEED
SCAN = """((secs) => { const pb = window.__pb; const out = []; let cur = null; let prev = null;
  for (let i = 0; i < secs * 30; i++) {
    pb.advance(1 / 30, 1 / 60, false);
    const m = pb.match; const ph = m.phase;
    if (ph === 'rally' && prev !== 'rally') cur = { from: +m.t.toFixed(2), shots: 0, kinds: {} };
    if (cur && m.rally) cur.shots = m.rally.shots;
    if (cur && ph !== 'rally') { cur.to = +m.t.toFixed(2); cur.score = m.games.join('-') + ' ' + m.pointText(0) + '-' + m.pointText(1); out.push(cur); cur = null; }
    if (ph === 'over') break;
    prev = ph;
  }
  return out; })"""

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 390, 'height': 760}, device_scale_factor=1, has_touch=True, is_mobile=True)
    pg.add_init_script(SEEDED)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es', timeout=180000)
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=180000)
    pg.evaluate("window.__pb.view.setTier('low'); window.__pb.save.tutorial = true; window.__pb.manual = true")
    pg.evaluate(SEEDED)
    start = f"window.__pb.startDoubles({RIVAL})" if MODE == 'doubles' else f"window.__pb.start({RIVAL})"
    pg.evaluate(f"{start}; window.__pb.autopilot()")
    r = pg.evaluate(f"({SCAN})({SECS})")
    for x in r:
        print(f"{x['from']:7.2f} → {x['to']:7.2f}  ({x['to'] - x['from']:5.2f} s)  golpes {x['shots']:3d}  tanteo {x['score']}")
    b.close()
srv.shutdown()
