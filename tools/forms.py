"""The players' shapes in the real page (software renderer: slow): close-ups of every player before a serve, both hands
of the human (the paddle hand from the palm and from the back, the free hand) and of a rival, the TV shot of a far
server before the serve (the one where the stands show behind the player), the gameplay camera in singles and doubles
and a wide look at the stands. Math.random seeded: the same frames in any build. Prints renderer.info and the console.
Usage: python3 tools/forms.py <dist_dir> <out_dir> [scenes = players,hands,tv,game,doubles,stands] [W = 720] [H = 900]
[port = 8910] [tier = high]"""
import os, sys, threading, functools, http.server, json, time
from playwright.sync_api import sync_playwright

ROOT, OUT = os.path.abspath(sys.argv[1]), sys.argv[2]
SCENES = (sys.argv[3] if len(sys.argv) > 3 else 'players,hands,tv,game,doubles,stands').split(',')
W = int(sys.argv[4]) if len(sys.argv) > 4 else 720
H = int(sys.argv[5]) if len(sys.argv) > 5 else 900
PORT = int(sys.argv[6]) if len(sys.argv) > 6 else 8910
TIER = sys.argv[7] if len(sys.argv) > 7 else 'high'
os.makedirs(OUT, exist_ok=True)


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEED = """(() => { let s = 1234567; window.__seed = (v) => { s = v >>> 0; }; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();"""
INFO = """(() => { const v = window.__pb.view, r = v.renderer; r.info.autoReset = false; r.info.reset(); v.render();
  const i = r.info; const o = { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, texs: i.memory.textures };
  r.info.autoReset = true; return o; })()"""
# where character i stands (as drawn), which way the net is, and a bone's world position
POS = """((i) => { const c = window.__pb.view.chars[i]; const p = c.root.position; return { x: p.x, z: p.z, net: p.z > 0 ? -1 : 1 }; })"""
# a bone's world position
BONE = """(([i, n]) => { const c = window.__pb.view.chars[i]; const b = c.bone[n]; b.updateWorldMatrix(true, false); const e = b.matrixWorld.elements;
  const p = c.root.position; return { x: e[12], y: e[13], z: e[14], net: p.z > 0 ? -1 : 1 }; })"""
# a hand's frame in the world: its middle (9 cm along the hand), the palm's normal and the way to the thumb (measured on
# the model: bone-local directions)
HAND = """(([i, side]) => { const c = window.__pb.view.chars[i]; const b = c.bone[side + 'Hand']; b.updateWorldMatrix(true, false);
  const e = b.matrixWorld.elements;
  const ap = (x, y, z) => [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
  const ad = (x, y, z) => { const v = [e[0] * x + e[4] * y + e[8] * z, e[1] * x + e[5] * y + e[9] * z, e[2] * x + e[6] * y + e[10] * z]; const l = Math.hypot(...v); return v.map((k) => k / l); };
  const W = side === 'Right' ? [0.711, 0, 0.703] : [-0.775, 0, 0.632];
  const V = side === 'Right' ? [0.703, 0, -0.711] : [-0.632, 0, -0.775];
  return { c: ap(0, 9, 0), n: ad(...W), v: ad(...V), u: ad(0, 1, 0) }; })"""


def snap(pg, name, cam=None):
    t0 = time.time()
    pg.evaluate(f"window.__pb.view.debugCam = {json.dumps(cam)}")
    pg.evaluate("window.__pb.view.frame(0, window.__pb.match ? window.__pb.match.t : 0)")
    pg.screenshot(timeout=300000, path=f'{OUT}/{name}.png')
    print(f'  {name} ({time.time() - t0:.0f}s)', flush=True)


def face_cam(p, dist=2.4, h=1.15, side=0.0, look_y=0.95):
    return {'px': p['x'] + side, 'py': h, 'pz': p['z'] + p['net'] * dist, 'lx': p['x'], 'ly': look_y, 'lz': p['z']}


def hand_view(h, along, dist, up=0.0):
    # from the palm side (along: n), the back (-n) or the thumb's side (v), a little from above
    d = [h['n'][k] * along[0] + h['v'][k] * along[1] + h['u'][k] * along[2] for k in range(3)]
    l = sum(x * x for x in d) ** 0.5
    c = h['c']
    return {'px': c[0] + d[0] / l * dist, 'py': c[1] + d[1] / l * dist + up, 'pz': c[2] + d[2] / l * dist, 'lx': c[0], 'ly': c[1], 'lz': c[2]}


def settle(pg):
    pg.evaluate("window.__pb.advance(0.6, 1/60, false)")


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=W < H, is_mobile=W < H)
    pg.add_init_script(SEED)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es', timeout=240000, wait_until='domcontentloaded')
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=180000)
    pg.evaluate(f"window.__pb.manual = true; window.__pb.view.setTier('{TIER}'); window.__pb.save.tutorial = true")
    names = ['paco', 'lola', 'bruno', 'nuria', 'reina']
    if 'players' in SCENES or 'hands' in SCENES:
        for i, n in enumerate(names):
            if 'players' not in SCENES and i not in (0, 1):
                continue
            pg.evaluate(f"window.__seed(424242); window.__pb.start({i})")
            settle(pg)
            if i == 0:
                print('INFO', TIER, json.dumps(pg.evaluate(INFO)), flush=True)
            if 'players' in SCENES:
                r = pg.evaluate(POS + '(1)')
                snap(pg, f'rival-{n}', face_cam(r, side=0.7))
                snap(pg, f'rival-{n}-close', face_cam(r, dist=1.3, h=1.45, side=0.35, look_y=1.3))
                hd = pg.evaluate(BONE + '([1, "Head"])')
                snap(pg, f'rival-{n}-face', {'px': hd['x'] + 0.18, 'py': hd['y'] + 0.12, 'pz': hd['z'] + hd['net'] * 0.62, 'lx': hd['x'], 'ly': hd['y'] + 0.06, 'lz': hd['z']})
                snap(pg, f'rival-{n}-back', {'px': r['x'] - 0.9, 'py': 1.6, 'pz': r['z'] - r['net'] * 1.9, 'lx': r['x'], 'ly': 1.25, 'lz': r['z']})
                if i == 0:
                    h = pg.evaluate(POS + '(0)')
                    snap(pg, 'hero-front', face_cam(h, side=0.7))
                    snap(pg, 'hero-close', face_cam(h, dist=1.3, h=1.45, side=0.35, look_y=1.3))
            if 'hands' in SCENES:
                who = [(0, 'hero')] if i == 0 else [(1, n)]
                for ci, nm in who:
                    rh = pg.evaluate(HAND + f'([{ci}, "Right"])')
                    lh = pg.evaluate(HAND + f'([{ci}, "Left"])')
                    snap(pg, f'hand-{nm}-paddle-palm', hand_view(rh, (1, 0.3, -0.2), 0.42, 0.04))
                    snap(pg, f'hand-{nm}-paddle-back', hand_view(rh, (-1, 0.3, -0.2), 0.42, 0.04))
                    snap(pg, f'hand-{nm}-paddle-thumb', hand_view(rh, (0.3, 1, 0.1), 0.42, 0.04))
                    snap(pg, f'hand-{nm}-free-palm', hand_view(lh, (1, 0.3, -0.2), 0.42, 0.04))
                    snap(pg, f'hand-{nm}-free-back', hand_view(lh, (-1, 0.3, -0.2), 0.42, 0.04))
                    snap(pg, f'hand-{nm}-free-thumb', hand_view(lh, (0.3, 1, 0.1), 0.42, 0.04))
    if 'doubles' in SCENES or 'partner' in SCENES:
        pg.evaluate("window.__seed(424242); window.__pb.startDoubles(3)")
        settle(pg)
        print('INFO doubles', TIER, json.dumps(pg.evaluate(INFO)), flush=True)
        m = pg.evaluate(POS + '(1)')
        snap(pg, 'partner-marta', face_cam(m, side=0.7))
        snap(pg, 'partner-marta-close', face_cam(m, dist=1.3, h=1.45, side=0.35, look_y=1.3))
        if 'doubles' in SCENES:
            # the four: from beside the near court, then the gameplay camera
            snap(pg, 'doubles-four', {'px': 5.2, 'py': 2.2, 'pz': 4.8, 'lx': 0.0, 'ly': 0.8, 'lz': -1.0})
            snap(pg, 'doubles-game', None)
    if 'game' in SCENES:
        # the gameplay camera in a rally against Lola
        pg.evaluate("window.__seed(424242); window.__pb.start(1); window.__pb.autopilot()")
        pg.evaluate("window.__pb.advance(0.4, 1/60, false)")
        snap(pg, 'game-serve', None)
        for _ in range(900):
            st = pg.evaluate("(() => { const m = window.__pb.match; const b = m.ballPos(); return { ph: m.phase, s: m.rally ? m.rally.shots : 0, b: b ? [b.x, b.y, b.z] : null }; })()")
            if st['ph'] == 'rally' and st['s'] >= 3 and st['b'] and st['b'][1] > 0.5 and -3.5 < st['b'][2] < 1.5:
                break
            pg.evaluate("window.__pb.advance(1/30, 1/60, false)")
        print('INFO game', TIER, W, H, json.dumps(pg.evaluate(INFO)), flush=True)
        snap(pg, 'game-rally', None)
    if 'intro' in SCENES:
        # the TV intro: the name straps over the far team (Lola), then the near team
        pg.evaluate("window.__pb.view.debugCam = null; window.__seed(424242); window.__pb.start(1, true)")
        pg.evaluate("window.__pb.advance(1.9, 1/30, false)")
        snap(pg, 'tv-intro-far', None)
        pg.evaluate("window.__pb.advance(1.6, 1/30, false)")
        snap(pg, 'tv-intro-near', None)
    if 'tv' in SCENES:
        # the TV before a serve: the long lens on the far server (Lola), the stands behind them
        pg.evaluate("window.__pb.view.debugCam = null; window.__seed(424242); window.__pb.start(1, true); window.__pb.bc.forceReplay = true")
        pg.evaluate("window.__pb.advance(6.0, 1/30, false)")
        pg.evaluate("(() => { const m = window.__pb.match; m.serverTeam = 1; m.setupServe(); })()")
        pg.evaluate("window.__pb.advance(1.2, 1/30, false)")
        print('shot', pg.evaluate("window.__pb.view.director.kind"))
        snap(pg, 'tv-serve-far', None)
        pg.evaluate("window.__pb.advance(1.3, 1/30, false)")
        snap(pg, 'tv-serve-far-2', None)
    if 'stands' in SCENES:
        pg.evaluate("window.__seed(424242); window.__pb.start(0)")
        settle(pg)
        snap(pg, 'stands-low', {'px': 0.5, 'py': 1.6, 'pz': -2.0, 'lx': 9.0, 'ly': 2.2, 'lz': -4.5})
        snap(pg, 'stands-far', {'px': 0.0, 'py': 1.4, 'pz': 2.0, 'lx': 0.0, 'ly': 2.6, 'lz': -14.0})
    pg.evaluate("window.__pb.view.debugCam = null")
    errs = [l for l in logs if l.startswith('error') or l.startswith('PAGEERROR') or l.startswith('warning')]
    print('CONSOLE', len(logs), 'lines;', len(errs), 'errors/warnings')
    for l in errs[-12:]:
        print('  ', l)
    b.close()
srv.shutdown()
