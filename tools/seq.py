"""Video of the players' movement as a person sees it: the real page (software renderer: slow), a seeded match stepped by
hand at 30 frames a second, each frame shot with the game camera (a phone held upright: the near player from behind,
the far one facing us) and with close cameras that follow each player (three-quarter view, the camera eased so it
does not shake). The frames are put together side by side and made into an mp4 (ffmpeg). The simulation never calls
Math.random, so the same seed gives the same match in any build of the view: two builds shot with the same
arguments show the same moments (tools/seqcmp.py puts them side by side).
Usage: python3 tools/seq.py out_dir [dist = dist] [seed = 7] [port = 8840] [mode = singles|doubles] [rival = 2]
       [from = 2 (s of match)] [secs = 12] [cams = game,near,far]
Env: TIER (default low) · STEP (sim step per 1/30 s frame, default 1/60) · SLOW=1 (the mp4 at half speed too)"""
import os, sys, threading, functools, http.server, json, time, subprocess, shutil, base64
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
ROOT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(HERE, '..', 'dist')
SEED = int(sys.argv[3]) if len(sys.argv) > 3 else 7
PORT = int(sys.argv[4]) if len(sys.argv) > 4 else 8840
MODE = sys.argv[5] if len(sys.argv) > 5 else 'singles'
RIVAL = int(sys.argv[6]) if len(sys.argv) > 6 else 2
FROM = float(sys.argv[7]) if len(sys.argv) > 7 else 2.0
SECS = float(sys.argv[8]) if len(sys.argv) > 8 else 12.0
CAMS = [c for c in (sys.argv[9] if len(sys.argv) > 9 else 'game,near,far').split(',') if c != 'none']
TIER = os.environ.get('TIER', 'low')
W, H = 390, 760
os.makedirs(OUT, exist_ok=True)
FR = os.path.join(OUT, 'frames')
shutil.rmtree(FR, ignore_errors=True)
os.makedirs(FR)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

SEEDED = """(() => { let s = %d >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();""" % SEED

# close cameras: three-quarter from the front-right of the player (court frame, facing the net), eased. Each shot is
# read off the canvas right after it is drawn (much quicker than a page screenshot in a software renderer)
HARNESS = """(() => {
  const pb = window.__pb;
  const S = window.__seq = {
    cams: {},
    grab() { pb.view.render(); return pb.view.renderer.domElement.toDataURL('image/jpeg', 0.9); },
    /** the game camera, where the last frame put it */
    game() { const c = pb.view.camera; c.position.copy(S.gpos); c.quaternion.copy(S.gq); c.updateMatrixWorld(); return S.grab(); },
    keep() { const c = pb.view.camera; S.gpos = c.position.clone(); S.gq = c.quaternion.clone(); },
    /** a close camera on player pid (eased towards where the player is; snap: straight there) */
    close(pid, snap) {
      const v = pb.view, m = pb.match, p = m.players[pid];
      const yaw = p.side === 1 ? Math.PI : 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
      const c = S.cams[pid] || (S.cams[pid] = { x: p.x, z: p.z });
      const k = snap ? 1 : 0.35;
      c.x += (p.x - c.x) * k; c.z += (p.z - c.z) * k;
      const P = [4.0, 2.6, 1.45];
      v.camera.position.set(c.x + fx * P[0] + rx * P[1], P[2], c.z + fz * P[0] + rz * P[1]);
      v.camera.lookAt(c.x + fx * 0.2, 0.8, c.z + fz * 0.2);
      v.camera.updateMatrixWorld();
      return S.grab();
    },
    near() { const m = pb.match; const h = m.players.find((p) => p.human) || m.players[0]; return h.id; },
    far() { const m = pb.match; const h = m.players[S.near()]; const o = m.players.filter((p) => p.team !== h.team); return o[0].id; },
    info() { const m = pb.match; return { t: +m.t.toFixed(3), phase: m.phase, score: m.score.join('-') }; },
    /** what each body is doing (for reading the video): swing and time to its contact, the loops' weights, speed, stance */
    state() { const m = pb.match, cs = pb.view.chars; return m.players.map((p, i) => { const c = cs[i]; const sw = c.swing;
      const lw = {}; for (const k in c.locoW || {}) if (c.locoW[k] > 0.05) lw[k] = +c.locoW[k].toFixed(2);
      return { sw: sw ? sw.kind + ' ' + (m.t - sw.key).toFixed(2) : '', v: +Math.hypot(p.vx, p.vz).toFixed(2), st: m.stance ? m.stance(i) || '' : '', loco: lw,
        shots: (c.shots || []).map((s) => s.kind + ':' + s.w.toFixed(2)).join(' ') }; }); },
  };
})();"""

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=True, is_mobile=True)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.add_init_script(SEEDED)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es', timeout=180000)
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=180000)
    pg.evaluate(HARNESS)
    pg.evaluate(f"window.__pb.view.setTier('{TIER}'); window.__pb.save.tutorial = true; window.__pb.manual = true")
    pg.evaluate(SEEDED)
    start = f"window.__pb.startDoubles({RIVAL})" if MODE == 'doubles' else f"window.__pb.start({RIVAL})"
    pg.evaluate(f"{start}; window.__pb.autopilot()")
    pg.add_style_tag(content='#app > :not(canvas), body > :not(#app):not(script){display:none!important}')
    step = os.environ.get('STEP', '1/60')
    # to the first frame
    if FROM > 0:
        pg.evaluate(f"window.__pb.advance({FROM}, {step}, false)")
    near = pg.evaluate("window.__seq.near()")
    far = pg.evaluate("window.__seq.far()")
    n = int(round(SECS * 30))
    states = []
    t0 = time.time()
    for i in range(n):
        if i:
            pg.evaluate(f"window.__pb.advance(1/30, {step}, false)")
        pg.evaluate("window.__seq.keep()")
        for cam in CAMS:
            if cam == 'game':
                url = pg.evaluate("window.__seq.game()")
            else:
                pid = near if cam == 'near' else far
                url = pg.evaluate(f"window.__seq.close({pid}, {'true' if i == 0 else 'false'})")
            with open(f'{FR}/{cam}-{i:04d}.jpg', 'wb') as f:
                f.write(base64.b64decode(url.split(',', 1)[1]))
        states.append({'i': i, **pg.evaluate("window.__seq.info()"), 'p': pg.evaluate("window.__seq.state()")})
        if i % 30 == 0:
            info = pg.evaluate("window.__seq.info()")
            print(f'  {i}/{n} {json.dumps(info)} {time.time() - t0:.0f}s', flush=True)
    with open(os.path.join(OUT, 'estado.json'), 'w') as f:
        json.dump(states, f)
    for l in logs[-6:]:
        print('  ', l)
    b.close()
srv.shutdown()

if not CAMS:
    sys.exit(0)
# side by side, with a label over each
inputs = []
for cam in CAMS:
    inputs += ['-framerate', '30', '-i', f'{FR}/{cam}-%04d.jpg']
lab = {'game': 'camara de juego', 'near': 'cerca (jugador de abajo)', 'far': 'lejos (rival)'}
filt = ''.join(f"[{k}:v]drawtext=text='{lab.get(c, c)}':x=8:y=8:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.5[v{k}];" for k, c in enumerate(CAMS))
filt += ''.join(f'[v{k}]' for k in range(len(CAMS))) + (f'hstack=inputs={len(CAMS)}[o]' if len(CAMS) > 1 else 'null[o]')
mp4 = os.path.join(OUT, 'seq.mp4')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', filt, '-map', '[o]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', mp4], check=True)
if os.environ.get('SLOW'):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp4, '-filter:v', 'setpts=2.0*PTS', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', os.path.join(OUT, 'seq-lento.mp4')], check=True)
print('→', mp4)
