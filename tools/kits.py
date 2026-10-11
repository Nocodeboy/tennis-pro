"""Close-ups of the players' kits, the paddle and the ball in the real page (software renderer: slow). Every rival in
singles (the human and the rival, front and back), the doubles partner, the human's paddle (face and edge), the ball
in the server's hand and a lineup of the four doubles players. Math.random seeded: the same frames in any build.
Prints renderer.info (textures, geometries) and the texture memory the players' kits take.
Usage: python3 tools/kits.py <dist_dir> <out_dir> [tier = high] [port = 8880] [scenes = rivals,partner,paddle,feet,ballair,ball,lineup]
[W = 720] [H = 900]"""
import os, sys, threading, functools, http.server, json, time
from playwright.sync_api import sync_playwright

ROOT, OUT = os.path.abspath(sys.argv[1]), sys.argv[2]
TIER = sys.argv[3] if len(sys.argv) > 3 else 'high'
PORT = int(sys.argv[4]) if len(sys.argv) > 4 else 8880
SCENES = (sys.argv[5] if len(sys.argv) > 5 else 'rivals,partner,paddle,feet,ballair').split(',')
W = int(sys.argv[6]) if len(sys.argv) > 6 else 720
H = int(sys.argv[7]) if len(sys.argv) > 7 else 900
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
# the texture memory of what the players wear: every texture on the characters' meshes (and the paddles), counted
# once, width x height x 4 bytes x 4/3 for the mipmaps
TEXMEM = """(() => { const v = window.__pb.view, seen = new Set(); let bytes = 0; const list = [];
  for (const c of v.chars) c.root.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const k of Object.keys(m)) { const t = m[k]; if (!t || !t.isTexture || seen.has(t)) continue; seen.add(t);
      const im = t.image || {}; const w = im.width || 0, h = im.height || 0; const b = w * h * 4 * (t.generateMipmaps !== false ? 4 / 3 : 1);
      bytes += b; list.push(k + ' ' + w + 'x' + h); } });
  const b = v.ball; if (b && b.material) for (const k of Object.keys(b.material)) { const t = b.material[k]; if (!t || !t.isTexture || seen.has(t)) continue; seen.add(t);
    const im = t.image || {}; bytes += (im.width || 0) * (im.height || 0) * 4 * 4 / 3; list.push('ball ' + k + ' ' + im.width + 'x' + im.height); }
  return { mb: +(bytes / 1048576).toFixed(1), n: seen.size, list }; })()"""


def snap(pg, name, cam):
    t0 = time.time()
    pg.evaluate(f"window.__pb.view.debugCam = {json.dumps(cam)}")
    pg.evaluate("window.__pb.view.frame(0, window.__pb.match ? window.__pb.match.t : 0)")
    pg.screenshot(timeout=300000, path=f'{OUT}/{name}.png')
    print(f'  {name} ({time.time() - t0:.0f}s)', flush=True)


# where character i stands (as drawn) and which way the net is
POS = """((i) => { const c = window.__pb.view.chars[i]; const p = c.root.position; return { x: p.x, z: p.z, net: p.z > 0 ? -1 : 1 }; })"""


def face_cam(p, dist=2.4, h=1.15, side=0.0, look_y=0.95):
    # in front of the player (on the net side), a little to one side
    return {'px': p['x'] + side, 'py': h, 'pz': p['z'] + p['net'] * dist, 'lx': p['x'], 'ly': look_y, 'lz': p['z']}


def back_cam(p, dist=2.4, h=1.15, side=0.0):
    return {'px': p['x'] + side, 'py': h, 'pz': p['z'] - p['net'] * dist, 'lx': p['x'], 'ly': 0.95, 'lz': p['z']}


def settle(pg):
    # the players in their ready stance before a serve
    pg.evaluate("window.__pb.advance(0.6, 1/60, false)")


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    pg.add_init_script(SEED)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es', timeout=240000, wait_until='domcontentloaded')
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=180000)
    pg.evaluate(f"window.__pb.manual = true; window.__pb.view.setTier('{TIER}'); window.__pb.save.tutorial = true")
    names = ['paco', 'lola', 'bruno', 'nuria', 'reina']
    if 'rivals' in SCENES or 'paddle' in SCENES or 'ball' in SCENES or 'feet' in SCENES or 'ballair' in SCENES:
        for i, n in enumerate(names):
            if 'rivals' not in SCENES and i > 0:
                break
            pg.evaluate(f"window.__seed(424242); window.__pb.start({i})")
            settle(pg)
            if i == 0:
                print('INFO', TIER, json.dumps(pg.evaluate(INFO)), flush=True)
                print('TEXMEM', json.dumps(pg.evaluate(TEXMEM)), flush=True)
            if 'rivals' in SCENES:
                r = pg.evaluate(POS + '(1)')
                snap(pg, f'rival-{n}', face_cam(r, side=0.7))
                if i == 0:
                    h = pg.evaluate(POS + '(0)')
                    snap(pg, 'hero-front', face_cam(h, side=0.7))
                    snap(pg, 'hero-back', back_cam(h, side=-0.8))
                    snap(pg, 'rival-paco-back', back_cam(r, side=-0.8))
            if i == 0 and 'paddle' in SCENES:
                # the human's paddle: in front of its face, then edge-on from the side
                pd = pg.evaluate("""(() => { const c = window.__pb.view.chars[0]; c.paddle.updateWorldMatrix(true, false);
                  const e = c.paddle.matrixWorld.elements; const s = Math.hypot(e[0], e[1], e[2]); const sy = Math.hypot(e[4], e[5], e[6]);
                  const k = 0.255 * sy; return { x: e[12] + e[4] / sy * k, y: e[13] + e[5] / sy * k, z: e[14] + e[6] / sy * k,
                  nx: e[0] / s, ny: e[1] / s, nz: e[2] / s, ux: e[4] / sy, uy: e[5] / sy, uz: e[6] / sy }; })()""")
                for nm, sgn in (('paddle-face', 1), ('paddle-back', -1)):
                    d = 0.75
                    snap(pg, nm, {'px': pd['x'] + sgn * pd['nx'] * d + 0.12, 'py': pd['y'] + sgn * pd['ny'] * d + 0.1, 'pz': pd['z'] + sgn * pd['nz'] * d,
                                  'lx': pd['x'], 'ly': pd['y'], 'lz': pd['z']})
            if i == 0 and 'feet' in SCENES:
                # close on the human's right shoe, from the front and a little to the side
                f = pg.evaluate("(() => { const c = window.__pb.view.chars[0]; const b = c.bone.RightFoot; b.updateWorldMatrix(true, false); const e = b.matrixWorld.elements; const p = c.root.position; return { x: e[12], y: e[13], z: e[14], net: p.z > 0 ? -1 : 1 }; })()")
                snap(pg, 'hero-feet', {'px': f['x'] - 0.3, 'py': 0.28, 'pz': f['z'] + f['net'] * 0.55, 'lx': f['x'] + 0.05, 'ly': 0.07, 'lz': f['z']})
            if i == 0 and 'ball' in SCENES:
                bp = pg.evaluate("(() => { const b = window.__pb.view.ball.position; return { x: b.x, y: b.y, z: b.z, v: window.__pb.view.ball.visible }; })()")
                if bp['v']:
                    snap(pg, 'ball', {'px': bp['x'] + 0.28, 'py': bp['y'] + 0.12, 'pz': bp['z'] + (0.3 if bp['z'] < 0 else -0.3), 'lx': bp['x'], 'ly': bp['y'], 'lz': bp['z']})
                    snap(pg, 'ball-hand', {'px': bp['x'] + 0.9, 'py': bp['y'] + 0.3, 'pz': bp['z'] + (1.1 if bp['z'] < 0 else -1.1), 'lx': bp['x'], 'ly': bp['y'] - 0.1, 'lz': bp['z']})
            if i == 0 and 'ballair' in SCENES:
                # the ball in flight, close (the human plays by itself)
                pg.evaluate('window.__pb.autopilot()')
                for _ in range(600):
                    st = pg.evaluate("(() => { const m = window.__pb.match, b = window.__pb.view.ball; return { ph: m.phase, y: b.position.y, z: b.position.z, v: b.visible }; })()")
                    if st['ph'] == 'rally' and st['v'] and st['y'] > 1.0 and abs(st['z']) < 3:
                        break
                    pg.evaluate("window.__pb.advance(1/60, 1/60, false)")
                bp = pg.evaluate("(() => { const b = window.__pb.view.ball.position; return { x: b.x, y: b.y, z: b.z }; })()")
                snap(pg, 'ball-air', {'px': bp['x'] + 0.3, 'py': bp['y'] + 0.06, 'pz': bp['z'] + 0.3, 'lx': bp['x'], 'ly': bp['y'], 'lz': bp['z']})
                snap(pg, 'ball-air-far', {'px': bp['x'] + 1.6, 'py': bp['y'] + 0.3, 'pz': bp['z'] + 1.6, 'lx': bp['x'], 'ly': bp['y'], 'lz': bp['z']})
    if 'partner' in SCENES or 'lineup' in SCENES:
        pg.evaluate("window.__seed(424242); window.__pb.startDoubles(3)")
        settle(pg)
        print('INFO doubles', TIER, json.dumps(pg.evaluate(INFO)), flush=True)
        print('TEXMEM doubles', json.dumps(pg.evaluate(TEXMEM)), flush=True)
        if 'partner' in SCENES:
            m = pg.evaluate(POS + '(1)')
            snap(pg, 'partner', face_cam(m, side=0.7))
        if 'lineup' in SCENES:
            # (a fixed camera by the near court: it frames the stands more than the players; the gameplay camera of
            # tools/look.py … doubles shows the four better)
            snap(pg, 'lineup', {'px': 4.2, 'py': 1.5, 'pz': 1.2, 'lx': 0.0, 'ly': 0.9, 'lz': -0.6})
    pg.evaluate("window.__pb.view.debugCam = null")
    errs = [l for l in logs if l.startswith('error') or l.startswith('PAGEERROR') or l.startswith('warning')]
    print('CONSOLE', len(logs), 'lines;', len(errs), 'errors/warnings')
    for l in errs[-12:]:
        print('  ', l)
    b.close()
srv.shutdown()
