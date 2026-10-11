"""Captures of the TV presentation, stepping the match by hand (slow software renderers): the intro flight with the
title card and the name straps, the umpire's call and the server framing, a reaction shot, a replay (sting, slow
motion, replay bug), the cut back to the next serve and the victory orbit. The human's player plays by itself
(window.__pb.autopilot). It also prints the intro's straps against what the camera shows every 0.1 s (a strap must
only be on while its team is in the frame).
Usage: python3 tools/tv.py [out_dir] [tier = low] [width = 390] [height = 760] [singles|doubles] [port = 8791]
[motion = no-preference|reduce]"""
import os, sys, threading, functools, http.server, json
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pb-tv'
TIER = sys.argv[2] if len(sys.argv) > 2 else 'low'
W = int(sys.argv[3]) if len(sys.argv) > 3 else 390
H = int(sys.argv[4]) if len(sys.argv) > 4 else 760
MODE = sys.argv[5] if len(sys.argv) > 5 else 'singles'
PORT = int(sys.argv[6]) if len(sys.argv) > 6 else 8791
MOTION = sys.argv[7] if len(sys.argv) > 7 else 'no-preference'
os.makedirs(OUT, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ST = """(() => { const pb = window.__pb, m = pb.match, bc = pb.bc, v = pb.view;
  return { phase: m.phase, t: m.t, score: m.score.join('-'), shot: v.director.kind, cine: bc.cine ? bc.cine.kind + ':' + (bc.cine.stage || '') : null,
    replay: v.replay ? { cur: v.replay.cur - v.replay.t0, len: v.replay.t1 - v.replay.t0, done: v.replay.done } : null,
    after: bc.after ? { since: m.t - bc.after.tp, reacted: bc.after.reacted, victory: bc.after.victory } : null,
    shots: m.rally ? m.rally.shots : 0 }; })()"""
# the intro, every 0.1 s: the strap on and where each team is in the frame (nx −1…1; None: behind the camera)
INTRO = """(() => { const pb = window.__pb, v = pb.view, m = pb.match; const s = document.querySelector('.tv-strap');
  const out = { t: 0, strap: s && s.classList.contains('on') ? s.querySelector('.nm').textContent.replace(/★/g, '') : '' };
  out.teams = [0, 1].map((k) => { const ps = m.players.filter((p) => p.team === k); const f = v.inFrame(ps.reduce((a, p) => a + p.x, 0) / ps.length, 1, ps.reduce((a, p) => a + p.z, 0) / ps.length);
    return f.front && Math.abs(f.nx) <= 1 ? +f.nx.toFixed(2) : null; });
  return out; })()"""
shots = {}
def snap(pg, name):
    pg.evaluate("window.__pb.view.render()")
    pg.screenshot(timeout=240000, path=f'{OUT}/{name}.png')
    print('  shot', name, flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=W < H, is_mobile=W < H, reduced_motion=MOTION)
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?lang=es')
    pg.wait_for_function('document.querySelector(".menu-col")', timeout=90000)
    start = 'window.__pb.startDoubles(1, true)' if MODE == 'doubles' else 'window.__pb.start(1, true)'
    pg.evaluate(f"window.__pb.view.setTier('{TIER}'); window.__pb.manual = true; {start}; window.__pb.bc.forceReplay = true; window.__pb.save.tutorial = true")
    # the intro: the straps against the camera (a strap on while its team is out of the frame is a mismatch)
    bad = 0
    for k in range(52):
        pg.evaluate("window.__pb.advance(0.1, 1/60, false)")
        r = pg.evaluate(INTRO)
        on = r['strap']
        # which team the strap names: the home team's strap has YOU/TÚ in it
        team = -1 if not on else (0 if ('TÚ' in on or 'YOU' in on) else 1)
        miss = team >= 0 and r['teams'][team] is None
        bad += miss
        print(f"  intro {0.1 * (k + 1):.1f} s  strap={on or '-':16s} in frame: you {r['teams'][0]}, them {r['teams'][1]}{'  MISMATCH' if miss else ''}", flush=True)
    print('intro mismatches:', bad)
    pg.evaluate(f"window.__pb.view.director.reset(); {start}; window.__pb.bc.forceReplay = true; window.__pb.save.tutorial = true")
    # the captures: title card, the far team's strap, the home team's strap
    pg.evaluate("window.__pb.advance(0.5, 1/30)")
    snap(pg, '01-intro-title')
    pg.evaluate("window.__pb.advance(1.4, 1/30)")
    snap(pg, '02-intro-far')
    pg.evaluate("window.__pb.advance(1.6, 1/30)")
    snap(pg, '03-intro-near')
    pg.evaluate("window.__pb.advance(1.6, 1/30)")
    st = pg.evaluate(ST)
    print(json.dumps(st))
    snap(pg, '04-serve-call')
    # a serve by the far player: the long lens on the server (debug: hand the serve over)
    pg.evaluate("(() => { const m = window.__pb.match; m.serverTeam = 1; m.setupServe(); })()")
    pg.evaluate("window.__pb.advance(0.7, 1/30)")
    print(json.dumps(pg.evaluate(ST)))
    snap(pg, '05-serve-frame-cpu')
    pg.evaluate("window.__pb.autopilot()")
    got = set()
    guard = 0
    victory_forced = False
    while guard < 2500:
        guard += 1
        st = pg.evaluate(ST)
        if st['shot'] == 'react' and 'react' not in got and st['after'] and st['after']['since'] > 1.0:
            got.add('react'); snap(pg, '06-reaction')
        elif st['cine'] == 'replay:play' and st['replay']:
            r = st['replay']
            k = r['cur'] / max(r['len'], 1e-3)
            for i, at in enumerate([0.05, 0.45, 0.8]):
                if f'replay{i}' not in got and k >= at:
                    got.add(f'replay{i}'); snap(pg, f'07-replay-{i}')
                    break
        elif 'replay2' in got and 'back' not in got and st['cine'] is None and st['phase'] == 'serve':
            # back from the replay: straight on to the next serve (the server framed under the sting)
            pg.evaluate("window.__pb.advance(0.3, 1/30)")
            got.add('back'); snap(pg, '08-after-replay')
        elif st['after'] and st['after']['victory'] and 'victory' not in got:
            pg.evaluate("window.__pb.advance(1.6, 1/30)")
            got.add('victory'); snap(pg, '09-victory')
            break
        if 'replay2' in got and not victory_forced and st['phase'] == 'serve':
            # jump to match point so the next point ends the match (debug only: the score, nothing else)
            pg.evaluate("(() => { const m = window.__pb.match; m.score[0] = 10; m.score[1] = 4; m.serverTeam = 0; })()")
            victory_forced = True
        pg.evaluate("window.__pb.advance(0.1, 1/30, false)")
    print(json.dumps(pg.evaluate(ST)))
    pg.evaluate("window.__pb.advance(2.5, 1/30)")
    snap(pg, '10-end')
    for l in logs[-10:]:
        print('  ', l)
    b.close()
srv.shutdown()
