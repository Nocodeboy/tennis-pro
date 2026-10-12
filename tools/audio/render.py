"""Renders the engine offline in Chromium and measures it (tools/audio/harness.ts, analyse.py).

  python3 tools/audio/render.py suite <name> [audio.ts]            every sound alone → <OUT>/<name>/*.wav + a table
  python3 tools/audio/render.py match <name> <timeline.json> [audio.ts] [--from s] [--dur s]
                                                                   a recorded match → <OUT>/<name>-match.wav + numbers
  python3 tools/audio/render.py decode <name>                      how long the samples take to load (real context)
OUT: $AUDIO_OUT or /tmp/padel-audio. The engine defaults to src/audio.ts (another one: e.g. 0.2's from git show).
AUDIO_NOSFX=1 renders without the takes (the synthesised fallback)."""
import base64, functools, http.server, json, os, subprocess, sys, threading, wave
import numpy as np
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyse import lufs, stats, db, hp

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('AUDIO_OUT', '/tmp/padel-audio')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
SR = 44100


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def page(name, engine):
    d = os.path.join(OUT, 'h-' + name)
    subprocess.run(['node', 'tools/audio/build.mjs', d] + ([engine] if engine else []), cwd=ROOT, check=True, capture_output=True)
    # (AUDIO_NOSFX=1: no assets next to the page, the engine's synthesised fallback)
    link = os.path.join(d, 'assets')
    if not os.path.exists(link) and not os.environ.get('AUDIO_NOSFX'): os.symlink(os.path.join(ROOT, 'assets'), link)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=d))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def wav(path, b64):
    raw = base64.b64decode(b64)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(raw)
    return np.frombuffer(raw, np.int16).reshape(-1, 2).astype(np.float32) / 32767


def run(name, engine, fn):
    srv = page(name, engine)
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        pg = b.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
        pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/index.html')
        pg.wait_for_function('window.__harnessReady')
        r = fn(pg)
        b.close()
    srv.shutdown()
    if errs: print('console:', errs[:8])
    return r


def suite(name, engine=None):
    d = os.path.join(OUT, name); os.makedirs(d, exist_ok=True)
    res = run(name, engine, lambda pg: pg.evaluate('window.__renderSuite()'))
    rows = {}
    print(f'{"sonido":20s} {"pico":>6s} {"mom":>6s} {"mom>150":>7s} {"onset":>6s} {"decay":>6s} {"centr":>6s} {"<150Hz":>6s}')
    for k, b64 in res.items():
        x = wav(os.path.join(d, k.replace(' ', '_') + '.wav'), b64)
        s = stats(x, SR)
        s['mom_hp'] = stats(hp(x, SR, 150, 4), SR)['mom']
        if k.startswith('publico murmullo') or k.startswith('publico tension'):
            s['mom'] = lufs(x[SR:], SR); s['mom_hp'] = lufs(hp(x, SR, 150, 4)[SR:], SR)
        rows[k] = s
        print(f'{k:20s} {s["peak"]:6.1f} {s["mom"]:6.1f} {s["mom_hp"]:7.1f} {s["onset"]-0.1:6.3f} {s["decay"]:6.2f} {s["cen"]:6.0f} {s["low"]:6.2f}')
    json.dump(rows, open(os.path.join(d, 'stats.json'), 'w'), indent=1)
    return rows


def match(name, tl_path, engine=None, t0=0.0, dur=None):
    tl = json.load(open(tl_path))
    calls = [c for c in tl['calls'] if c['t'] >= t0]
    for c in calls: c['t'] -= t0
    # (the state at t0: the last value of each key before it)
    state = {}
    for c in tl['calls']:
        if c['t'] < t0 and c['f'] == 'set': state[c['a'][0]] = c['a'][1]
    calls = [{'t': 0, 'f': 'set', 'a': [k, v]} for k, v in state.items()] + calls
    dur = dur or (max(c['t'] for c in calls) + 3)
    b64 = run(name, engine, lambda pg: pg.evaluate('([tl, d]) => window.__renderTimeline(tl, d)', [calls, dur]))
    os.makedirs(OUT, exist_ok=True)
    x = wav(os.path.join(OUT, name + '-match.wav'), b64)
    # loudness over the whole match, peaks, and how often it gets near full scale
    blk = int(0.1 * SR)
    pk = np.abs(x[: len(x) // blk * blk]).max(1).reshape(-1, blk).max(1)
    r = dict(dur=len(x) / SR, lufs=lufs(x, SR), lufs_hp=lufs(hp(x, SR, 150, 4), SR), peak=db(np.abs(x).max()),
             over_m3=float((pk > 10 ** (-3 / 20)).mean()), over_m1=float((pk > 10 ** (-1 / 20)).mean()))
    print(json.dumps(r))
    return r


if __name__ == '__main__':
    cmd, name = sys.argv[1], sys.argv[2]
    if cmd == 'suite': suite(name, sys.argv[3] if len(sys.argv) > 3 else None)
    elif cmd == 'match':
        a = sys.argv[3:]
        t0 = float(a[a.index('--from') + 1]) if '--from' in a else 0.0
        dur = float(a[a.index('--dur') + 1]) if '--dur' in a else None
        pos = [v for i, v in enumerate(a) if not v.startswith('--') and (i == 0 or not a[i - 1].startswith('--'))]
        match(name, pos[0], pos[1] if len(pos) > 1 else None, t0, dur)
    elif cmd == 'decode':
        print('decode ms:', run(name, None, lambda pg: pg.evaluate('window.__decodeTime()')))
