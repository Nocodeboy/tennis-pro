"""Hojas de contacto de los golpes escenificados (tools/render/stage-lib.ts) en el banco de pruebas: filas las cámaras,
columnas los momentos (s del contacto). Uso: python3 tools/render/hstage.py <dir> <out> [port] [prefijos,…]
Env: W, H (cada viñeta, 360×460) · CAMS (side,front) · SURF (hard)"""
import os, sys, threading, functools, http.server, io, base64, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
ROOT, OUT = sys.argv[1], sys.argv[2]
PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 8970
ONLY = sys.argv[4].split(',') if len(sys.argv) > 4 else []
W = int(os.environ.get('W', '360')); H = int(os.environ.get('H', '460'))
CAMS = os.environ.get('CAMS', 'side,front').split(',')
SURF = os.environ.get('SURF', 'hard')
os.makedirs(OUT, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
def label(im, text, size=14):
    d = ImageDraw.Draw(im)
    try: F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', size)
    except Exception: F = ImageFont.load_default()
    d.rectangle([0, 0, len(text) * (size * 0.62) + 10, size + 6], fill=(0, 0, 0))
    d.text((5, 3), text, fill=(255, 255, 255), font=F)
    return im
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H})
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?tier=high', timeout=240000)
    pg.wait_for_function('window.__h && window.__h.loaded', timeout=300000, polling=1000)
    pg.evaluate(f"window.__manual = true; window.__h.start('{SURF}', true, 4242); window.__h.advance(0.5)")
    names = pg.evaluate("(() => { return window.__stageNames || null; })()")
    import importlib
    names = ONLY
    for name in names:
        over = name.startswith(('remate', 'saque'))
        times = [-0.6, -0.33, -0.12, 0.0, 0.12, 0.35] if over else [-0.4, -0.2, -0.08, 0.0, 0.12, 0.3]
        r = pg.evaluate("([n, t, c]) => window.__h.stageShots(n, t, c)", [name, times, CAMS])
        sheet = Image.new('RGB', (W * len(times), H * len(CAMS) + 26), (0, 0, 0))
        for j, cam in enumerate(CAMS):
            for i, t in enumerate(times):
                url = r['shots'].get(f'{cam}@{t:.2f}')
                if not url: continue
                im = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
                sheet.paste(label(im, f'{cam} {t:+.2f}s'), (i * W, 26 + j * H))
        res = r['res']
        label(sheet, f"{name}: {res['swing']} · punto dulce a la bola {res['paddle'] * 100:.1f} cm · salto {res['rootY'] * 100:.0f} cm", 16)
        sheet.save(os.path.join(OUT, f'{name}.png'))
        print('  ', name, json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in res.items()}), flush=True)
    b.close()
srv.shutdown()
