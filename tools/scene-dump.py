"""The venue as the page builds it, for Blender (art/blender/floorlight.py): every static mesh of the venue in world
coordinates (the bowl, the furniture once the Blender models are in, the boards, the net, the cage: its steel, its wire
mesh and its glass, each with its kind) and the floodlights (where each lamp is and where it points). Leaves out what
lies on the floor (the surface, the lines, the logos, the contact decals), the crowd, the glare and the sky.
Usage: python3 tools/scene-dump.py <dist_dir> <out.json> [port = 8880]"""
import functools, http.server, json, os, sys, threading
from playwright.sync_api import sync_playwright

ROOT, OUT = sys.argv[1], sys.argv[2]
PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 8880


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

DUMP = """(() => {
  const v = window.__pb.view, venue = v.venue;
  const halo = venue.envHide[0], hg = halo.geometry;
  const at = hg.attributes.aAt, dir = hg.attributes.aDir;
  const lamps = [];
  for (let i = 0; i < hg.instanceCount; i++) lamps.push([at.getX(i), at.getY(i), at.getZ(i), dir.getX(i), dir.getY(i), dir.getZ(i)]);
  venue.group.updateMatrixWorld(true);
  const meshes = [];
  const b64 = (arr) => { const u = new Uint8Array(arr.buffer); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  venue.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o === halo || o === venue.crowd.mesh) return;
    const g = o.geometry, p = g.attributes.position;
    if (!p || g.isInstancedBufferGeometry) return;
    const e = o.matrixWorld.elements, n = p.count, P = new Float32Array(n * 3);
    let y0 = 1e9, y1 = -1e9, r = 0;
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
      P[i * 3] = X; P[i * 3 + 1] = Y; P[i * 3 + 2] = Z;
      y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); r = Math.max(r, Math.hypot(X, Z));
    }
    if (r > 150 || y1 < 0.06) return;   // the sky; what lies on the floor
    const I = g.index ? new Uint32Array(g.index.array) : null;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    // (the see-through ones by their shader: the cage's glass and wire mesh, the net; the LED faces glow)
    const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
    const kind = key.startsWith('pb-glass') ? 'glass' : key.startsWith('pb-wiremesh') ? 'wire' : key.startsWith('pb-net') ? 'net' : (m.type === 'ShaderMaterial' || m.type === 'RawShaderMaterial') ? 'glow' : 'solid';
    meshes.push({ kind, n, pos: b64(P), idx: I ? b64(I) : null });
  });
  return { lamps, meshes };
})()"""

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 844, 'height': 390})
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es', timeout=180000)
    # (the furniture's Blender models come in after the venue: wait for them)
    pg.wait_for_function('window.__pb && window.__pb.view && window.__pb.view.venue && window.__pb.view.venue.furnished', timeout=180000)
    d = pg.evaluate(DUMP)
    b.close()
json.dump(d, open(OUT, 'w'))
print(f"{len(d['lamps'])} focos, {len(d['meshes'])} mallas: " + ', '.join(f"{m['kind']} {m['n']}" for m in d['meshes']))
