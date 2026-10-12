"""Close-ups of staged shots (tools/stage-lib.ts) in the real page: one player, one contact chosen by hand (a bajada, a
remate por 3 or por 4, a bandeja met low…), shot at chosen moments around the contact from the side and from the front
three-quarter. A contact sheet per shot: rows are the cameras, columns the moments (s from the contact).

Usage: python3 tools/stage.py out_dir [dist = dist] [port = 8910] [name prefix,…]
Needs dist/stage.js next to the page: npx esbuild tools/stage-lib.ts --bundle --format=iife --global-name=__stage
  --outfile=<dist>/stage.js
Env: W, H (each tile, default 360×460) · TIER (default high) · CAMS (default side,front; also back, top)"""
import os, sys, threading, functools, http.server, io, base64, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
ROOT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(HERE, '..', 'dist')
PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 8910
ONLY = sys.argv[4].split(',') if len(sys.argv) > 4 else []
W = int(os.environ.get('W', '360'))
H = int(os.environ.get('H', '460'))
TIER = os.environ.get('TIER', 'high')
CAMS = os.environ.get('CAMS', 'side,front').split(',')
os.makedirs(OUT, exist_ok=True)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

RUN = """(([name, times, cams]) => {
  const pb = window.__pb, v = pb.view, S = window.__stage;
  const sc = S.SCENARIOS.find((s) => s.name === name);
  v.chars.forEach((c) => { c.root.visible = false; });
  for (const k of ['landRing', 'footRing', 'targetRing', 'targetDot', 'aimRing', 'aimLine', 'serveBox', 'smear']) if (v[k]) v[k].visible = false;
  v.feetShadows.forEach((s) => { s.visible = false; });
  const CV = v.chars[0].constructor;
  const ch = new CV(v.assets, v.kits[0], 1.78);
  ch.setPaddlePose(...v.paddlePose);
  v.scene.add(ch.root);
  const out = {};
  const cam = v.camera;
  const grab = (tc, ball) => {
    if (ball) { v.ball.visible = true; v.ball.position.set(ball.x, ball.y, ball.z); v.ball.scale.setScalar(0.8); v.ballShadow.visible = true; v.ballShadow.position.set(ball.x, 0.012, ball.z); }
    else { v.ball.visible = false; v.ballShadow.visible = false; }
    v.smear.visible = false;
    const x = sc.x + (sc.fx || 0), z = sc.z + (sc.fz || 0.15);
    const high = sc.y > 1.9;
    for (const k of cams) {
      // (the player faces −z; his right is +x)
      const P = { side: [4.6, 1.35, 0.3], front: [2.2, 1.6, -4.4], back: [-1.6, 1.9, 4.4], top: [2.5, 4.5, -2.5] }[k];
      cam.fov = high ? 30 : 26; cam.updateProjectionMatrix();
      cam.position.set(x + P[0], P[1] + (high ? 0.35 : 0), z + P[2]);
      cam.lookAt(x, high ? 1.55 : 1.1, z - 0.2);
      cam.updateMatrixWorld();
      v.render();
      out[k + '@' + tc.toFixed(2)] = v.renderer.domElement.toDataURL('image/jpeg', 0.9);
    }
  };
  const want = times.slice();
  const res = S.stage(ch, sc, (tc, ball) => {
    const i = want.findIndex((t) => Math.abs(t - tc) < 1 / 120);
    if (i >= 0) { want.splice(i, 1); grab(tc, ball); }
  });
  v.scene.remove(ch.root);
  ch.dispose();
  return { res, shots: out };
})"""

def label(im, text, size=14):
    d = ImageDraw.Draw(im)
    try:
        F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', size)
    except Exception:
        F = ImageFont.load_default()
    d.rectangle([0, 0, len(text) * (size * 0.65) + 10, size + 6], fill=(0, 0, 0))
    d.text((5, 3), text, fill=(255, 255, 255), font=F)
    return im

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es', timeout=240000)
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=240000)
    pg.add_script_tag(path=os.path.join(ROOT, 'stage.js'))
    pg.evaluate(f"window.__pb.view.setTier('{TIER}'); window.__pb.save.tutorial = true; window.__pb.start(0); window.__pb.manual = true")
    pg.evaluate("window.__pb.advance(0.5, 1/60, false)")
    pg.add_style_tag(content='#app > :not(canvas), body > :not(#app):not(script){display:none!important}')
    names = pg.evaluate("window.__stage.SCENARIOS.map((s) => s.name)")
    summary = []
    for name in names:
        if ONLY and not any(name.startswith(o) for o in ONLY):
            continue
        over = name.startswith(('remate', 'por', 'bandeja'))
        times = [-0.45, -0.2, 0.0, 0.1, 0.25, 0.45] if over else [-0.4, -0.2, -0.08, 0.0, 0.12, 0.3]
        r = pg.evaluate(RUN, [name, times, CAMS])
        tiles = {}
        for k, url in r['shots'].items():
            tiles[k] = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
        sheet = Image.new('RGB', (W * len(times), H * len(CAMS) + 26), (0, 0, 0))
        for j, cam in enumerate(CAMS):
            for i, t in enumerate(times):
                im = tiles.get(f'{cam}@{t:.2f}')
                if im is None:
                    continue
                sheet.paste(label(im, f'{cam} {t:+.2f}s'), (i * W, 26 + j * H))
        res = r['res']
        label(sheet, f"{name}: {res['swing']} {res['over'] if res['swing'] == 'smash' else ''} · pala a la bola {res['paddle'] * 100:.1f} cm · salto {res['rootY'] * 100:.0f} cm", 16)
        sheet.save(os.path.join(OUT, f'{name}.png'))
        summary.append(res)
        print('  ', name, json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in res.items()}), flush=True)
    for l in logs[-8:]:
        print('  ', l)
    b.close()
srv.shutdown()
