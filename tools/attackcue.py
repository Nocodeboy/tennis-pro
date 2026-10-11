"""Captures of the attack cue and the block (docs/notas-08-ataque.md) in the real page, portrait phone: a match against a
rival plays itself (the stick goes to the circle, the swing is the automatic one) until the coming ball is one to
attack (the orange ring at the feet, «¡Atácala!») and until an attack comes at the player (the timing ring shows for
the tap). One capture each, at the moment the cue is on, plus the same attack cue with the tutorial's hint.

Usage: python3 tools/attackcue.py [dist_dir = dist] [out_dir = /tmp/pb-08-ataque] [width = 390] [height = 760]
       [port = 8810] [rival = 1] [lang = es]
Low tier and SwiftShader: slow (a few minutes)."""
import os, sys, threading, functools, http.server
from playwright.sync_api import sync_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'dist')
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/pb-08-ataque'
W = int(sys.argv[3]) if len(sys.argv) > 3 else 390
H = int(sys.argv[4]) if len(sys.argv) > 4 else 760
PORT = int(sys.argv[5]) if len(sys.argv) > 5 else 8810
RIVAL = int(sys.argv[6]) if len(sys.argv) > 6 else 1
LANG = sys.argv[7] if len(sys.argv) > 7 else 'es'
os.makedirs(OUT, exist_ok=True)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

# a seeded Math.random (the same match every run)
INIT = r"""(() => { let s = 0x5eed08; window.__seed = (n) => { s = n | 0; };
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();"""

# the human's left thumb: straight to the circle (the assist parks him); the right one only serves
BOT = r"""(() => { const pb = window.__pb, i = pb.input;
  i.move = () => { const m = pb.match; if (!m) return { x: 0, y: 0 };
    const me = m.players[0], tg = m.targetFor(0); if (!tg) return { x: 0, y: 0 };
    const dx = tg.fx - me.x, dz = tg.fz - me.z, d = Math.hypot(dx, dz); if (d < 0.25) return { x: 0, y: 0 };
    const s = pb.view.viewSide; return { x: (dx / d) * s, y: (dz / d) * s }; }; })()"""

ST = r"""(() => { const pb = window.__pb, m = pb.match, me = m.players[0], r = m.rally;
  return { phase: m.phase, server: m.server().id, windup: !!m.windup, cue: pb.cue, key: m.stats.rallies + ':' + (r ? r.shots : 0),
    plan: me.plan ? me.plan.t - m.t : null, over: m.phase === 'over' }; })()"""

def run(pg, want, name, hint=False, after=0.1):
    """Plays on until the cue `want` shows, then a moment more (`after` s; for a block, until the ring is near gold)."""
    pg.evaluate(f"window.__pb.save.tutorial = {'false' if hint else 'true'}")
    seen = set()
    for _ in range(60 * 240):
        st = pg.evaluate(ST)
        if st['over']:
            pg.evaluate(f"window.__pb.start({RIVAL})")
            pg.evaluate(BOT)
            continue
        if st['phase'] == 'serve' and st['server'] == 0 and not st['windup']:
            pg.evaluate("(() => { const i = window.__pb.input; i.aimDown(0); i.aimMove(-6, -18, 0.5); })()")
            pg.evaluate("window.__pb.advance(0.6, 1/60, false)")
            pg.evaluate("window.__pb.input.aimUp(1.1)")
        if st['cue'] == want and st['key'] not in seen:
            seen.add(st['key'])
            if want == 'block':
                # on to where the ring is about to turn gold (0.3 s before the contact)
                for _ in range(40):
                    s2 = pg.evaluate(ST)
                    if s2['plan'] is None or s2['plan'] <= 0.3 or s2['cue'] != 'block':
                        break
                    pg.evaluate("window.__pb.advance(1/60, 1/60, false)")
            else:
                pg.evaluate(f"window.__pb.advance({after}, 1/60, false)")
            if pg.evaluate("window.__pb.cue") != want:
                continue
            pg.evaluate("window.__pb.view.render()")
            pg.screenshot(timeout=240000, path=f'{OUT}/{name}.png')
            print(name, pg.evaluate(ST), flush=True)
            return True
        pg.evaluate("window.__pb.advance(1/60, 1/60, false)")
    print(name, 'not found', flush=True)
    return False

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=True, is_mobile=True)
    pg.add_init_script(INIT)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang={LANG}', timeout=180000)
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=120000)
    pg.add_style_tag(content='#flash { display: none !important; }')
    pg.evaluate(f"window.__pb.view.setTier('low'); window.__pb.manual = true; window.__pb.view.shake = 0; window.__seed(0x5eed08); window.__pb.start({RIVAL})")
    pg.evaluate(BOT)
    run(pg, 'attack', '01-atacala')
    run(pg, 'block', '02-bloqueo')
    run(pg, 'attack', '03-atacala-tutorial', hint=True, after=0.25)
    errs = [l for l in logs if 'error' in l.lower()]
    if errs:
        print('\n'.join(errs[:10]))
    b.close()
srv.shutdown()
