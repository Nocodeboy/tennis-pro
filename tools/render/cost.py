"""Desglose del coste de la escena del banco de pruebas: triángulos y llamadas por malla (las instancias cuentan),
y renderer.info con y sin sombras. Uso: python3 tools/render/cost.py <dir> [WxH] [port] [tier]"""
import sys, threading, functools, http.server, json
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
W, H = [int(v) for v in (sys.argv[2] if len(sys.argv) > 2 else '390x844').split('x')]
PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 8950
TIER = sys.argv[4] if len(sys.argv) > 4 else 'medium'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
JS = """(() => {
  const v = window.__h.view; const out = [];
  v.scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const inst = g.isInstancedBufferGeometry ? g.instanceCount : o.isInstancedMesh ? o.count : 1;
    const mats = Array.isArray(o.material) ? o.material.length : 1;
    const mt = Array.isArray(o.material) ? o.material[0] : o.material;
    out.push({ name: (o.name || o.type) + ':' + (o.parent && o.parent.type) + ':' + (mt && (mt.customProgramCacheKey().length < 30 ? mt.customProgramCacheKey() : mt.type)), tris: Math.round(n * inst), groups: mats, shadow: o.castShadow, inst });
  });
  out.sort((a, b) => b.tris - a.tris);
  const r = v.renderer; r.info.autoReset = false; r.info.reset(); window.__h.render();
  const all = { calls: r.info.render.calls, tris: r.info.render.triangles };
  r.shadowMap.enabled = false; r.info.reset(); window.__h.render();
  const noShadow = { calls: r.info.render.calls, tris: r.info.render.triangles };
  r.shadowMap.enabled = true; r.info.autoReset = true;
  const sum = out.reduce((a, m) => a + m.tris, 0);
  return { all, noShadow, sum, n: out.length, top: out.slice(0, 25) };
})()"""
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H})
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?tier={TIER}', timeout=240000)
    pg.wait_for_function('window.__h && window.__h.loaded', timeout=300000, polling=1000)
    pg.evaluate("window.__manual = true; window.__h.start('hard', false, 4242); window.__h.advance(3)")
    r = pg.evaluate(JS)
    print('todo', r['all'], 'sin sombras', r['noShadow'], 'suma', r['sum'], 'mallas', r['n'])
    for m in r['top']:
        print(f"  {m['tris']:8d}  x{m['groups']}  {'S' if m['shadow'] else ' '}  inst {m['inst']:5d}  {m['name']}")
    b.close()
srv.shutdown()
