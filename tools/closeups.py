"""Close-ups of the players in the real page at chosen moments of a seeded match, to judge poses as a person sees them:
each moment shot with the game camera (a phone upright or on its side) and with close cameras on each player (from the
front three-quarter, as the TV shows the server before a serve; from the side; from behind three-quarter). The same
arguments on two builds (before / after a change) give the same moments: the simulation never calls Math.random, and
Math.random is seeded.

Pass 1 plays the match without drawing and logs what happens (phase, serve wind-up, contacts and their swings, who is
waiting); the moments are picked from that log; pass 2 starts the same match again and shoots them.

Usage: python3 tools/closeups.py out_dir [dist = dist] [seed = 7] [port = 8900] [singles|doubles] [rival = 2]
       [secs = 40] [moments = auto]
  moments: auto (waiting for the serve, the serve's wind-up, waiting in a rally, each kind of swing around its contact)
           or a list like 12.5,13.0 (match seconds), or a JSON file written by an earlier run (momentos.json)
Env: W, H (viewport, default 390×844) · CAMS (default game,front,side,back) · TIER (default medium) · ONLY=pid,pid
     · CLOSE=pid list for the close cameras (default: everyone) · QUERY=mocap=off (more of the page's URL)
     · KINDS=3 (how many of each swing; padel: the overheads are told apart as remate, bandeja and víbora)
     · HIDE=1 (only the player being shot: no partner in the way) · CAMS can add wfront, wside (wider and higher)
     and face (a TV close-up of the head and shoulders)
Writes out_dir/<moment>.png (a sheet per moment: the game camera, then each player's close cameras), the single shots
in out_dir/shots/, and out_dir/momentos.json."""
import os, sys, threading, functools, http.server, json, time, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
ROOT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(HERE, '..', 'dist')
SEED = int(sys.argv[3]) if len(sys.argv) > 3 else 7
PORT = int(sys.argv[4]) if len(sys.argv) > 4 else 8900
MODE = sys.argv[5] if len(sys.argv) > 5 else 'singles'
RIVAL = int(sys.argv[6]) if len(sys.argv) > 6 else 2
SECS = float(sys.argv[7]) if len(sys.argv) > 7 else 40.0
MOM = sys.argv[8] if len(sys.argv) > 8 else 'auto'
W = int(os.environ.get('W', '390'))
H = int(os.environ.get('H', '844'))
CAMS = os.environ.get('CAMS', 'game,front,side,back').split(',')
TIER = os.environ.get('TIER', 'medium')
os.makedirs(os.path.join(OUT, 'shots'), exist_ok=True)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEEDED = """(() => { let s = %d >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();""" % SEED

HARNESS = """(() => {
  const pb = window.__pb;
  const S = window.__cu = {
    grab() { pb.view.render(); return pb.view.renderer.domElement.toDataURL('image/jpeg', 0.92); },
    keep() { const c = pb.view.camera; S.gpos = c.position.clone(); S.gq = c.quaternion.clone(); S.fov = c.fov; },
    game() { const c = pb.view.camera; c.position.copy(S.gpos); c.quaternion.copy(S.gq); c.fov = S.fov; c.updateProjectionMatrix(); c.updateMatrixWorld(); return S.grab(); },
    /** a close camera on player pid: front (three-quarter from the front, his right), frontc (straight in front), side
     *  (his right), back, hands (close on the hands and the paddle); wfront, wside: wider and higher, for the jumps of
     *  the overheads. HIDE=1: the other players are hidden for it (a partner in the way) */
    close(pid, kind) {
      const v = pb.view, m = pb.match, p = m.players[pid], ch = v.chars[pid];
      if (S.hide) v.chars.forEach((c, i) => { c.root.visible = i === pid; });
      if (kind === 'wfront' || kind === 'wside') {
        const x = ch.root.position.x, z = ch.root.position.z;
        const yaw = p.side === 1 ? Math.PI : 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
        const P = kind === 'wfront' ? [6.0, 2.6, 1.7] : [0.6, 7.0, 1.6];
        const c = v.camera;
        c.fov = 26; c.updateProjectionMatrix();
        c.position.set(x + fx * P[0] + rx * P[1], P[2], z + fz * P[0] + rz * P[1]);
        c.lookAt(x, 1.45, z);
        c.updateMatrixWorld();
        const u = S.grab();
        if (S.hide) v.chars.forEach((c) => { c.root.visible = true; });
        return u;
      }
      const x = ch.root.position.x, z = ch.root.position.z;
      const yaw = p.side === 1 ? Math.PI : 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
      if (kind === 'face') {
        // a TV close-up: head and shoulders, from the front a little to his right, on the head bone
        const hd = ch.root.getObjectByName('Head').getWorldPosition(new pb.view.camera.position.constructor());
        const c = v.camera;
        c.fov = 16; c.updateProjectionMatrix();
        c.position.set(hd.x + fx * 2.2 + rx * 0.7, hd.y + 0.02, hd.z + fz * 2.2 + rz * 0.7);
        c.lookAt(hd.x, hd.y - 0.12, hd.z);
        c.updateMatrixWorld();
        const u = S.grab();
        if (S.hide) v.chars.forEach((c) => { c.root.visible = true; });
        return u;
      }
      const P = { front: [4.6, 1.9, 1.25], frontc: [4.9, -0.5, 1.3], side: [0.4, 5.0, 1.05], back: [-4.4, 1.6, 1.55], hands: [1.9, 0.9, 1.3] }[kind];
      const c = v.camera;
      c.fov = 24; c.updateProjectionMatrix();
      c.position.set(x + fx * P[0] + rx * P[1], P[2], z + fz * P[0] + rz * P[1]);
      c.lookAt(x + (kind === 'hands' ? fx * 0.3 : 0), kind === 'hands' ? 1.12 : 0.92, z + (kind === 'hands' ? fz * 0.3 : 0));
      c.updateMatrixWorld();
      const u = S.grab();
      if (S.hide) v.chars.forEach((c) => { c.root.visible = true; });
      return u;
    },
    /** pass 1: play secs without drawing, logging every 1/30 s */
    log(secs) {
      const m = pb.match, out = [];
      let last = {};
      for (let i = 0; i < secs * 30; i++) {
        pb.advance(1 / 30, 1 / 60, false);
        const cs = pb.view.chars;
        out.push({ t: +m.t.toFixed(4), phase: m.phase, wu: m.windup ? { pid: m.windup.pid, at: m.windup.at } : null, server: m.phase === 'serve' ? m.server().id : -1,
          p: m.players.map((p, k) => ({ sw: cs[k].swing ? cs[k].swing.kind : '', key: cs[k].swing ? +cs[k].swing.key.toFixed(4) : 0,
            hit: p.lastHit ? +p.lastHit.t.toFixed(4) : 0, hk: p.lastHit ? p.lastHit.kind : '', v: +Math.hypot(p.vx, p.vz).toFixed(2), st: m.stance ? m.stance(k) || '' : '',
            run: +((cs[k].locoW || {}).run || 0).toFixed(2), walk: +((cs[k].locoW || {}).walk || 0).toFixed(2), re: cs[k].reaction ? cs[k].reaction.kind : '' })) });
      }
      return out;
    },
  };
})();"""

def start(pg):
    pg.evaluate(SEEDED)
    s = f"window.__pb.startDoubles({RIVAL})" if MODE == 'doubles' else f"window.__pb.start({RIVAL})"
    pg.evaluate(f"{s}; window.__pb.autopilot()")

def pick(log):
    """the moments worth a look: (name, match time, players to close up on)"""
    out = []
    seen = set()
    def add(name, t, pids):
        if name in seen or t < 0.5:
            return
        seen.add(name)
        out.append({'name': name, 't': round(t, 4), 'pids': pids})
    n = len(log[0]['p'])
    # waiting for the serve (the server and the receiver), the serve's wind-up
    for i, f in enumerate(log):
        if f['phase'] == 'serve' and not f['wu'] and i > 0:
            # a moment well into the wait (0.6 s on)
            if i + 18 < len(log) and log[i + 18]['phase'] == 'serve' and not log[i + 18]['wu']:
                k = sum(1 for x in seen if x.startswith('espera-saque'))
                if k < 2 and (k == 0 or f['t'] > out[-1]['t'] + 6):
                    add(f'espera-saque-{k}', log[i + 18]['t'], list(range(n)))
        if f['wu']:
            at = f['wu']['at']
            k = sum(1 for x in seen if x.startswith('saque-'))
            if k < 4 and not any(x.startswith('saque-') and abs(o['t'] - at) < 2 for o in out for x in [o['name']]):
                for j, dtc in enumerate([-0.8, -0.45, 0.0, 0.3]):
                    add(f'saque-{j}-{dtc:+.2f}', at + dtc, [f['wu']['pid']])
    # each kind of swing around its contact (the first KINDS of each), and waiting in a rally while the other side hits
    # (padel: the overheads share the smash's swing and are told apart by the hit, and shot through the jump)
    kinds = {}
    most = int(os.environ.get('KINDS', '2'))
    for i, f in enumerate(log):
        for k, p in enumerate(f['p']):
            if p['sw'] and p['sw'] != 'serve' and p['hit'] and abs(p['hit'] - p['key']) < 0.05 and abs(p['hit'] - f['t']) < 1 / 59:
                name = {'smash': 'remate', 'bandeja': 'bandeja', 'vibora': 'vibora'}.get(p['hk'], 'remate') if p['sw'] == 'smash' else p['sw']
                c = kinds.get(name, 0)
                if c >= most:
                    continue
                kinds[name] = c + 1
                for dtc in ((-0.45, -0.2, 0.0, 0.2, 0.45) if p['sw'] == 'smash' else (-0.3, 0.0, 0.25)):
                    add(f"{name}{c}-{dtc:+.2f}", p['hit'] + dtc, [k])
                # the others, waiting as this one hits
                others = [j for j in range(n) if j != k and log[i]['p'][j]['v'] < 0.4]
                if others and sum(1 for x in seen if x.startswith('espera-peloteo')) < 3:
                    add(f"espera-peloteo-{sum(1 for x in seen if x.startswith('espera-peloteo'))}", p['hit'] - 0.15, others)
    # running, walking (no swing on) and the reactions after a point, the first two of each
    loco = {}
    for i, f in enumerate(log):
        for k, p in enumerate(f['p']):
            for name, on in (('carrera', p['run'] > 0.8 and not p['sw']), ('andar', p['walk'] > 0.8 and not p['sw'] and not p['re'])):
                if on and loco.get(name, 0) < 2 and not any(o['name'].startswith(name) and abs(o['t'] - f['t']) < 3 for o in out):
                    loco[name] = loco.get(name, 0) + 1
                    add(f"{name}{loco[name] - 1}", f['t'], [k])
            if p['re'] and i > 0 and not log[i - 1]['p'][k]['re']:
                name = {'cheer': 'celebra', 'lost': 'lamento'}.get(p['re'], p['re'])
                c = loco.get(name, 0)
                if c < 2:
                    loco[name] = c + 1
                    for dt in (0.4, 1.0):
                        add(f"{name}{c}-{dt:+.1f}", f['t'] + dt, [k])
    out.sort(key=lambda o: o['t'])
    return out

def label(im, text):
    d = ImageDraw.Draw(im)
    try:
        F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
    except Exception:
        F = ImageFont.load_default()
    d.rectangle([0, 0, len(text) * 9 + 10, 20], fill=(0, 0, 0))
    d.text((5, 3), text, fill=(255, 255, 255), font=F)
    return im

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=True, is_mobile=True)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.add_init_script(SEEDED)
    q = os.environ.get('QUERY', '')
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es' + (f'&{q}' if q else ''), timeout=240000)
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=240000)
    pg.evaluate(HARNESS)
    if os.environ.get('HIDE'):
        pg.evaluate("window.__cu.hide = true")
    pg.evaluate(f"window.__pb.view.setTier('{TIER}'); window.__pb.save.tutorial = true; window.__pb.manual = true")
    pg.add_style_tag(content='#app > :not(canvas), body > :not(#app):not(script){display:none!important}')
    if MOM == 'auto':
        start(pg)
        t0 = time.time()
        log = pg.evaluate(f"window.__cu.log({SECS})")
        moments = pick(log)
        print(f'  pass 1: {len(log)} frames, {len(moments)} moments, {time.time() - t0:.0f}s', flush=True)
    elif MOM.endswith('.json'):
        moments = json.load(open(MOM))
    else:
        moments = [{'name': f't{x}', 't': float(x), 'pids': None} for x in MOM.split(',')]
    with open(os.path.join(OUT, 'momentos.json'), 'w') as f:
        json.dump(moments, f, indent=1)
    start(pg)
    now = 0.0
    only = os.environ.get('ONLY')
    for mo in moments:
        # (ONLY: names, or prefixes ending in *)
        if only and not any(mo['name'] == o or (o.endswith('*') and mo['name'].startswith(o[:-1])) for o in only.split(',')):
            continue
        # (from the match start, in 1/60 steps: the same frames as pass 1)
        t = pg.evaluate("window.__pb.match.t")
        if mo['t'] < t - 1e-3:
            start(pg)
            t = pg.evaluate("window.__pb.match.t")
        if mo['t'] > t:
            pg.evaluate(f"window.__pb.advance({mo['t'] - t}, 1/60, false)")
        pg.evaluate("window.__cu.keep()")
        pids = mo.get('pids')
        n = pg.evaluate("window.__pb.match.players.length")
        if pids is None:
            pids = list(range(n))
        if os.environ.get('CLOSE'):
            pids = [int(x) for x in os.environ['CLOSE'].split(',')]
        tiles = []
        for cam in CAMS:
            if cam == 'game':
                url = pg.evaluate("window.__cu.game()")
                im = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
                im.save(os.path.join(OUT, 'shots', f"{mo['name']}-game.jpg"), quality=92)
                tiles.append(label(im, 'juego'))
            else:
                for pid in pids:
                    url = pg.evaluate(f"window.__cu.close({pid}, '{cam}')")
                    im = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
                    im.save(os.path.join(OUT, 'shots', f"{mo['name']}-{cam}-{pid}.jpg"), quality=92)
                    tiles.append(label(im, f'{cam} j{pid}'))
        info = pg.evaluate("""(() => { const pb = window.__pb, m = pb.match, cs = pb.view.chars;
          return { t: +m.t.toFixed(3), phase: m.phase, p: m.players.map((p, i) => { const c = cs[i], lw = {};
            for (const k in c.locoW || {}) if (c.locoW[k] > 0.05) lw[k] = +c.locoW[k].toFixed(2);
            return { v: +Math.hypot(p.vx, p.vz).toFixed(2), sw: c.swing ? c.swing.kind + ' ' + (m.t - c.swing.key).toFixed(2) : '', loco: lw, st: m.stance ? m.stance(i) || '' : '' }; }) }; })()""")
        sheet = Image.new('RGB', (sum(t.width for t in tiles), max(t.height for t in tiles)), (0, 0, 0))
        x = 0
        for t in tiles:
            sheet.paste(t, (x, 0))
            x += t.width
        label(sheet, f"{mo['name']}  t={info['t']} {info['phase']}")
        sheet.save(os.path.join(OUT, f"{mo['name']}.png"))
        print('  ', mo['name'], info, flush=True)
    for l in logs[-6:]:
        print('  ', l)
    b.close()
srv.shutdown()
