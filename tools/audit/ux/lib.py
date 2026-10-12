import functools, http.server, threading, os, json, time
from playwright.sync_api import sync_playwright
ROOT = '/home/claude/padel/dist'
OUT = '/tmp/padel-audit-ux'
os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve(port):
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Q, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

INIT = open('/home/claude/padel/tools/hud.py').read().split('INIT = r"""')[1].split('"""')[0]
# audio / event spies
SPY = r"""(() => {
  window.__log = []; window.__snd = {};
  const hook = () => { const pb = window.__pb; if (!pb || !pb.audio) return setTimeout(hook, 50);
    const a = pb.audio;
    for (const k of ['play','paddle','wall','courtBounce','squeak']) { const f = a[k]?.bind(a); if (!f) continue;
      a[k] = (...x) => { const key = k === 'play' ? 'play:' + x[0] : k === 'paddle' ? 'paddle:' + x[0] + (x[6] ? ':' + x[6] : '') : k; window.__snd[key] = (window.__snd[key] || 0) + 1; return f(...x); }; }
  }; hook();
})();"""

class Game:
    def __init__(self, p, port, w=390, h=844, touch=True, seed=None, lang='es', query='', virt=True, fresh=True):
        self.W, self.H = w, h
        self.b = p.chromium.launch(args=ARGS)
        self.ctx = self.b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, has_touch=touch, is_mobile=touch)
        if seed is not None or virt:
            self.ctx.add_init_script(INIT)
        self.ctx.add_init_script(SPY)
        self.pg = self.ctx.new_page()
        self.errs = []
        self.pg.on('pageerror', lambda e: self.errs.append('pageerror: ' + str(e)))
        self.pg.on('console', lambda m: self.errs.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        self.pg.goto(f'http://127.0.0.1:{port}/index.html?lang={lang}{query}', wait_until='commit', timeout=120000)
        self.pg.wait_for_function('window.__pb && document.querySelector("[data-a=play]")', timeout=240000)
        if seed is not None:
            self.pg.evaluate(f'window.__seed({seed})')
        self.pg.evaluate("window.__pb.view.setTier('low'); window.__pb.manual = true; window.__von && window.__von()")
        self.cdp = self.ctx.new_cdp_session(self.pg)
        self.touches = {}
        self.ts = time.time()
    def ev(self, js, arg=None):
        return self.pg.evaluate(js, arg) if arg is not None else self.pg.evaluate(js)
    def step(self, sec, dt=1/60):
        # advance the sim and the virtual timers together, in small chunks
        self.pg.evaluate(f'(() => {{ const n = Math.max(1, Math.round({sec}/{dt})); for (let i=0;i<n;i++) {{ window.__pb.advance({dt}, {dt}, false); window.__vtick && window.__vtick({dt}); }} }})()')
        self.ts += sec
    def shot(self, name):
        self.pg.evaluate('window.__pb.view.render(1/60)')
        self.pg.wait_for_timeout(120)
        self.pg.screenshot(timeout=240000, path=f'{OUT}/{name}.png')
        return f'{OUT}/{name}.png'
    # --- CDP touches: fingers by id, explicit timestamps (seconds), self.ts follows the sim
    def _send(self, typ, t):
        pts = [{'x': x, 'y': y, 'id': i, 'radiusX': 8, 'radiusY': 8, 'force': 1} for i, (x, y) in self.touches.items()]
        self.cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': pts, 'timestamp': t})
    def down(self, fid, x, y, t=None):
        self.touches[fid] = (x, y); self._send('touchStart', t or self.ts)
    def move(self, fid, x, y, t=None):
        self.touches[fid] = (x, y); self._send('touchMove', t or self.ts)
    def up(self, fid, t=None):
        x, y = self.touches.pop(fid)
        # touchEnd: the remaining touches
        # (CDP's touchEnd lifts every finger: lift all, then put the others back where they were)
        self.cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [], 'timestamp': t or self.ts})
        if self.touches:
            self._send('touchStart', (t or self.ts) + 0.001)
    def tap(self, x, y):
        self.pg.touchscreen.tap(x, y)
    def close(self):
        self.b.close()
