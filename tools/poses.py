"""Close-ups of the players' poses in the real page (software renderer: slow, be patient): a CPU-vs-CPU match stepped
by hand with Math.random seeded (the same seed gives the same match, so two builds can be compared frame for frame),
the pose measures of tools/posemetrics.js taken inside the page on every frame, and contact sheets (PIL) of:
  · each swing around its contact (serve, drive, volley, backhand, dink, lunge each way, smash), from the front and the
    side (KINDS=… picks which)
  · locomotion: sideways each way at shuffle speed, backwards and forwards at speed, from a fixed camera (the feet
    against the floor)
  · run → stop → swing, and the reactions after a point
  · the split step: a still player as the other side hits, from just before their contact to the landing
  · the broadcast (game) camera on a phone, around a contact of the near player
  · the worst frames the measures find (wrist, torso, elbow, planted-foot slide)
The moments shot are saved to <out_dir>/momentos.json; given that file, another build is shot at exactly the same
moments (the simulation never calls Math.random: the same seed plays the same match in any build of the view).
Usage: python3 tools/poses.py [out_dir] [dist_dir = dist] [seed = 7] [port = 8795] [tier = low] [rival = 2]
[momentos.json of another run]
Env: KINDS=… (which swings) · SHEETS=tv,swings,loco,stops,react,split (which groups of sheets; default all)"""
import os, sys, threading, functools, http.server, json, time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pb-poses'
ROOT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(HERE, '..', 'dist')
SEED = int(sys.argv[3]) if len(sys.argv) > 3 else 7
PORT = int(sys.argv[4]) if len(sys.argv) > 4 else 8795
TIER = sys.argv[5] if len(sys.argv) > 5 else 'low'
RIVAL = int(sys.argv[6]) if len(sys.argv) > 6 else 2
REPLAY = json.load(open(sys.argv[7])) if len(sys.argv) > 7 else None
SHEETS = os.environ.get('SHEETS', 'tv,swings,loco,stops,react,split').split(',')
moments = {}
os.makedirs(OUT, exist_ok=True)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

SEEDED = """(() => { let s = %d >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();""" % SEED

HARNESS = """(() => {
  const PM = window.PoseMetrics, pb = window.__pb;
  const H = window.__poses = {
    probe: new PM.PoseProbe(PM.NAT, { keep: 10 }),
    last: {}, caught: {}, watch: true,
    one(dt) {
      pb.advance(dt, dt, false);
      const m = pb.match, cs = pb.view.chars;
      if (!m || !cs.length) return null;
      H.probe.frame(cs, m, dt);
      m.players.forEach((p, i) => {
        const h = p.lastHit;
        if (h && H.last[i] !== h.t) {
          H.last[i] = h.t;
          const c = cs[i].contact;
          if (c) H.probe.hit(cs[i], i, c.x, c.y, c.z, h.kind, { t: +m.t.toFixed(3) });
        }
      });
      if (!H.watch) return null;
      // the worst frames: caught twice per kind at most
      for (let i = 0; i < cs.length; i++) {
        const f = PM.features(cs[i], PM.NAT);
        const sw = cs[i].swing;
        const sp = Math.hypot(m.players[i].vx, m.players[i].vz);
        const tests = [
          ['wrist', f.wristBend > 95 || Math.abs(f.wristTwist) > 110],
          ['torso', f.torsoTilt > 78],
          ['elbowUp', sw && sw.kind !== 'smash' && sw.kind !== 'serve' && f.elbow > 25 && f.elbowUp > 0.85 && Math.abs(m.t - sw.key) < 0.15],
          ['spineTwist', f.spineTwist > 48],
        ];
        for (const [k, bad] of tests) if (bad && (H.caught[k] || 0) < 2 && m.t - (H.caught[k + 't'] || -9) > 3) {
          H.caught[k] = (H.caught[k] || 0) + 1;
          H.caught[k + 't'] = m.t;
          return { worst: k, pid: i, t: m.t };
        }
      }
      return null;
    },
    step(sec, dt) { dt = dt || 1 / 60; const n = Math.max(1, Math.round(sec / dt)); for (let i = 0; i < n; i++) H.one(dt); },
    until(cond, maxSec) {
      const n = Math.round(maxSec * 60);
      for (let i = 0; i < n; i++) {
        const w = H.one(1 / 60);
        if (w) return w;
        const r = cond(pb.match, pb.view.chars);
        if (r) return r;
      }
      return null;
    },
    /** a camera next to player pid: front, quarter, side (its right), left, back; or fixed at the last one */
    cam(pid, kind, fixed) {
      const v = pb.view;
      if (!fixed) {
        // (turned like the court, facing the net: the same camera for any build, whatever the body does)
        const yaw = pb.match.players[pid].side === 1 ? Math.PI : 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
        const P = { front: [3.4, 0.6, 1.2], quarter: [2.5, 2.3, 1.3], side: [0.3, 3.4, 1.1], left: [0.3, -3.4, 1.1], back: [-3.2, 0.8, 1.7], wide: [5.5, 1.5, 1.6] }[kind];
        // (and placed from where the simulation has the player, not the body: the same in both builds)
        const sp = pb.match.players[pid];
        H.cpos = { px: sp.x + fx * P[0] + rx * P[1], py: P[2], pz: sp.z + fz * P[0] + rz * P[1] };
        H.clook = { x: sp.x + fx * 0.15, z: sp.z + fz * 0.15 };
      }
      const look = fixed ? { x: pb.match.players[pid].x, z: pb.match.players[pid].z } : H.clook;
      v.debugCam = { px: H.cpos.px, py: H.cpos.py, pz: H.cpos.pz, lx: look.x, ly: 0.85, lz: look.z };
      v.camera.position.set(H.cpos.px, H.cpos.py, H.cpos.pz);
      v.camera.lookAt(look.x, 0.85, look.z);
      v.render();
    },
    gameCam() { pb.view.debugCam = null; },
    info(pid) {
      const m = pb.match, ch = pb.view.chars[pid], f = PM.features(ch, PM.NAT), p = m.players[pid], sw = ch.swing;
      return { t: +m.t.toFixed(3), sw: sw ? sw.kind : '-', tc: sw ? +(m.t - sw.key).toFixed(2) : null, v: +Math.hypot(p.vx, p.vz).toFixed(1),
        st: m.stance ? m.stance(pid) || '-' : '-', hop: Math.round(ch.root.position.y * 100),
        wrist: Math.round(f.wristBend), twist: Math.round(Math.abs(f.wristTwist)), elbow: Math.round(f.elbow), torso: Math.round(f.torsoTilt),
        spine: Math.round(f.spineBend), stw: Math.round(f.spineTwist), knee: Math.round(Math.max(f.kneeL, f.kneeR)) };
    },
  };
})();"""

try:
    FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
except Exception:
    FONT = ImageFont.load_default()

def sheet(name, cells, cols):
    """cells: [(png path, caption)] → a grid with captions"""
    ims = [(Image.open(p).convert('RGB'), c) for p, c in cells if os.path.exists(p)]
    if not ims:
        return
    w, h = ims[0][0].size
    cap = 34
    rows = (len(ims) + cols - 1) // cols
    S = Image.new('RGB', (cols * w, rows * (h + cap)), (20, 22, 28))
    d = ImageDraw.Draw(S)
    for k, (im, c) in enumerate(ims):
        x, y = (k % cols) * w, (k // cols) * (h + cap)
        S.paste(im, (x, y))
        for li, line in enumerate(c.split('\n')[:2]):
            d.text((x + 4, y + h + 2 + li * 15), line, fill=(235, 235, 235), font=FONT)
    S.save(f'{OUT}/{name}.png')
    print('  sheet', name, flush=True)

def caption(i):
    return f"t {i['t']} {i['sw']} tc {i['tc']} v {i['v']} {i.get('st', '-')}\nmuñeca {i['wrist']}/{i['twist']} codo {i['elbow']} torso {i['torso']} rod {i['knee']}"

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 390, 'height': 760}, device_scale_factor=1)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.add_init_script(SEEDED)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es')
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=120000)
    pg.add_script_tag(path=os.path.join(HERE, 'posemetrics.js'))
    pg.evaluate(HARNESS)
    # (seeded again right before the match: the menu's attract match draws random numbers in real time until now)
    pg.evaluate(f"window.__pb.view.setTier('{TIER}'); window.__pb.save.tutorial = true; window.__pb.manual = true")
    pg.evaluate(SEEDED)
    pg.evaluate(f"window.__pb.start({RIVAL}); window.__pb.autopilot()")
    pg.add_style_tag(content='#app > :not(canvas), body > :not(#app):not(script){display:none!important}')
    pg.evaluate("window.__poses.step(0.5)")
    t0 = time.time()
    n = [0]

    def snap(tag):
        n[0] += 1
        path = f'{OUT}/f{n[0]:03d}-{tag}.png'
        pg.screenshot(timeout=240000, path=path)
        return path

    def until(cond, maxs=120):
        """advance until cond; worst frames found on the way are shot first"""
        while True:
            r = pg.evaluate(f"window.__poses.until({cond}, {maxs})")
            if r and 'worst' in r:
                cells = []
                for cam in ('quarter', 'front', 'side'):
                    pg.evaluate(f"window.__poses.cam({r['pid']}, '{cam}')")
                    cells.append((snap(f"worst-{r['worst']}-{cam}"), caption(pg.evaluate(f"window.__poses.info({r['pid']})"))))
                sheet(f"worst-{r['worst']}-{int(r['t'])}", cells, 3)
                # (back to the game's own camera: a debug camera left on makes every later broadcast shot the same)
                pg.evaluate("window.__poses.gameCam()")
                continue
            return r

    def find(name, cond, maxs):
        """the next moment that fits (or, replaying another run, the moment it found)"""
        if REPLAY is not None:
            r = REPLAY.get(name)
            if r:
                until("(m) => m.t >= %r - 1e-6 ? { at: m.t } : null" % r['t'], 600)
            return r
        r = until(cond, maxs)
        if r:
            moments[name] = r
        return r

    if REPLAY is not None:
        pg.evaluate("window.__poses.watch = false")

    # the broadcast camera on a phone, around a contact of the near player and one of the far player
    for who in ((0, 1) if 'tv' in SHEETS else ()):
        cond = "(m, cs) => { const s = cs[%d].swing; if (m.phase === 'rally' && s && s.kind !== 'serve' && s.key - m.t > 0.3 && s.key - m.t < 0.42) return { pid: %d, key: s.key, t: m.t }; return null; }" % (who, who)
        r = find(f'tv{who}', cond, 120)
        if not r:
            continue
        cells = []
        cur = r['t']
        pg.evaluate("window.__poses.gameCam()")
        for tc in (-0.3, -0.12, 0.0, 0.15):
            want = r['key'] + tc
            if want > cur:
                pg.evaluate(f"window.__poses.step({want - cur:.4f}, 1/120)")
                cur = want
            pg.evaluate("window.__poses.gameCam(); window.__pb.view.render()")
            cells.append((snap(f'tv{who}'), caption(pg.evaluate(f"window.__poses.info({who})"))))
        sheet(f'tv-{"cerca" if who == 0 else "lejos"}', cells, 4)
    pg.set_viewport_size({'width': 360, 'height': 400})
    pg.evaluate("window.__pb.view.resize()")

    # swings around the contact
    kinds = os.environ.get('KINDS', 'serve,drive,volley,backhand,dink,lunge,lunge_left,smash').split(',') if 'swings' in SHEETS else []
    for kind in kinds:
        cond = "(m, cs) => { for (let i = 0; i < cs.length; i++) { const s = cs[i].swing; if (s && s.kind === '%s' && s.key - m.t > 0.3 && s.key - m.t < 0.5) return { pid: i, key: s.key, t: m.t }; } return null; }" % kind
        r = find(kind, cond, 150)
        if not r:
            print('  no', kind, flush=True)
            continue
        cells = {'front': [], 'side': []}
        cur = r['t']
        # (from the take-back: a low drive's starts 0.4 s before the contact)
        for tc in (-0.42, -0.3, -0.15, -0.05, 0.0, 0.1, 0.25):
            want = r['key'] + tc
            if want > cur:
                pg.evaluate(f"window.__poses.step({want - cur:.4f}, 1/120)")
                cur = want
            for cam in ('front', 'side'):
                pg.evaluate(f"window.__poses.cam({r['pid']}, '{cam}')")
                cells[cam].append((snap(f'{kind}-{cam}'), caption(pg.evaluate(f"window.__poses.info({r['pid']})"))))
        sheet(f'swing-{kind}', cells['front'] + cells['side'], 7)
        print(kind, r, f'{time.time() - t0:.0f}s', flush=True)

    # locomotion at speed, from a camera fixed where the run starts (the feet against the floor); sideways at shuffle
    # speed, each way (over 2.2 m/s the body turns to run; lat > 0: to the body's right)
    LAT = "(p.vx * -Math.cos(cs[i].root.rotation.y) + p.vz * Math.sin(cs[i].root.rotation.y)) / sp"
    LOCO = {
        'lateral-der': (1.2, 2.6, LAT + " > 0.85"),
        'lateral-izq': (1.2, 2.6, LAT + " < -0.85"),
        'atras': (2.8, 99, "p.vz * p.side / sp > 0.8"),
        'adelante': (2.8, 99, "p.vz * p.side / sp < -0.85"),
    }
    for name, (v0, v1, test) in (LOCO.items() if 'loco' in SHEETS else ()):
        cond = "(m, cs) => { if (m.phase !== 'rally') return null; for (let i = 0; i < cs.length; i++) { const p = m.players[i]; const sp = Math.hypot(p.vx, p.vz); if (sp > %s && sp < %s && !cs[i].swing && %s) return { pid: i, t: m.t }; } return null; }" % (v0, v1, test)
        r = find(name, cond, 150)
        if not r:
            print('  no', name, flush=True)
            continue
        cam = 'front' if name.startswith('lateral') else 'side'
        pg.evaluate(f"window.__poses.cam({r['pid']}, '{cam}')")
        cells = []
        for k in range(8):
            if k:
                pg.evaluate("window.__poses.step(1/15, 1/120)")
            pg.evaluate(f"window.__poses.cam({r['pid']}, '{cam}', true)")
            cells.append((snap(f'loco-{name}'), caption(pg.evaluate(f"window.__poses.info({r['pid']})"))))
        sheet(f'loco-{name}', cells, 8)
        print(name, r, f'{time.time() - t0:.0f}s', flush=True)

    # run → stop → swing → away (the plant before the contact, the push-off after it), and a contact still on the move
    STOPS = {
        'stop': "(m, cs) => { if (m.phase !== 'rally') return null; for (let i = 0; i < cs.length; i++) { const p = m.players[i]; const sp = Math.hypot(p.vx, p.vz); if (sp > 3.2 && p.plan && p.plan.reach && p.plan.t - m.t > 0.55 && p.plan.t - m.t < 0.8) return { pid: i, t: m.t, key: p.plan.t }; } return null; }",
        'moving': "(m, cs) => { if (m.phase !== 'rally') return null; for (let i = 0; i < cs.length; i++) { const p = m.players[i]; const sp = Math.hypot(p.vx, p.vz); if (sp > 2.4 && p.plan && p.plan.reach && p.plan.t - m.t > 0.3 && p.plan.t - m.t < 0.4) return { pid: i, t: m.t, key: p.plan.t }; } return null; }",
    }
    for name, cond in (STOPS.items() if 'stops' in SHEETS else ()):
        r = find(name, cond, 150)
        if not r:
            continue
        pg.evaluate(f"window.__poses.cam({r['pid']}, 'quarter')")
        cells = []
        span = r['key'] + 0.45 - r['t']
        for k in range(8):
            if k:
                pg.evaluate(f"window.__poses.step({span / 7:.4f}, 1/120)")
            pg.evaluate(f"window.__poses.cam({r['pid']}, 'quarter', true)")
            cells.append((snap(f'{name}-swing'), caption(pg.evaluate(f"window.__poses.info({r['pid']})"))))
        sheet('transicion-carrera-golpe' if name == 'stop' else 'golpe-en-movimiento', cells, 8)
        print(name, r, f'{time.time() - t0:.0f}s', flush=True)

    # the split step: a still player (no swing of his own for a while) as the other side hits; front and side, from
    # just before their contact to the landing and the first step (tc: from the other side's planned contact)
    for k in ((0, 1) if 'split' in SHEETS else ()):
        cond = "(m, cs) => { if (m.phase !== 'rally') return null; for (let i = 0; i < cs.length; i++) { const p = m.players[i]; if (Math.hypot(p.vx, p.vz) > 0.8 || (cs[i].swing && cs[i].swing.key - m.t < 0.9)) continue; for (const q of m.players) if (q.team !== p.team && q.plan && q.plan.reach && q.plan.t - m.t > 0.25 && q.plan.t - m.t < 0.32) return { pid: i, key: q.plan.t, t: m.t }; } return null; }"
        r = find(f'split{k}', cond, 150)
        if not r:
            print('  no split', flush=True)
            continue
        cells = {'front': [], 'side': []}
        cur = r['t']
        for tc in (-0.2, -0.1, -0.05, 0.0, 0.04, 0.1, 0.2, 0.35):
            want = r['key'] + tc
            if want > cur:
                pg.evaluate(f"window.__poses.step({want - cur:.4f}, 1/120)")
                cur = want
            for cam in ('front', 'side'):
                pg.evaluate(f"window.__poses.cam({r['pid']}, '{cam}')")
                i = pg.evaluate(f"window.__poses.info({r['pid']})")
                c = caption(i).split('\n')
                cells[cam].append((snap(f'split-{cam}'), f"golpe rival {tc:+.2f} s · {i.get('st', '-')} · salto {i.get('hop', 0)} cm\n{c[1]}"))
        sheet(f'paso-de-espera-{k}', cells['front'] + cells['side'], 8)
        print('split', r, f'{time.time() - t0:.0f}s', flush=True)

    # a reaction after a point
    r = find('react', "(m, cs) => { for (let i = 0; i < cs.length; i++) if (cs[i].reaction) return { pid: i, t: m.t }; return null; }", 200) if 'react' in SHEETS else None
    if r:
        cells = []
        for k in range(5):
            if k:
                pg.evaluate("window.__poses.step(0.35, 1/60)")
            pg.evaluate(f"window.__poses.cam({r['pid']}, 'front')")
            cells.append((snap('react'), caption(pg.evaluate(f"window.__poses.info({r['pid']})"))))
        sheet('reaccion', cells, 5)
        print('react', r, f'{time.time() - t0:.0f}s', flush=True)

    if REPLAY is None:
        with open(f'{OUT}/momentos.json', 'w') as f:
            json.dump(moments, f, indent=1)
    rep = pg.evaluate("window.__poses.probe.report()")
    with open(f'{OUT}/medidas.json', 'w') as f:
        json.dump(rep, f, indent=1)
    S = rep['stats']
    for k in ('wristBend', 'wristTwist', 'torsoTilt', 'spineBend', 'spineTwist', 'headOffContact', 'slide', 'jerk', 'paddle'):
        if k in S:
            print(f"  {k:16} p50 {S[k]['p50']}  p90 {S[k]['p90']}  p99 {S[k]['p99']}  máx {S[k]['max']}")
    print(f'{rep["frames"]} fotogramas medidos, {n[0]} capturas, {time.time() - t0:.0f}s')
    for l in logs[-10:]:
        print('  ', l)
    b.close()
srv.shutdown()
