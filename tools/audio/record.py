"""Records every call into the engine during a match played by real touches (tools/audit/ux/play.py: the stick, the
right thumb's place / flick / tap / down-flick), with the virtual clock: <OUT>/<tag>-timeline.json, for
tools/audio/render.py match. Also counts the calls and how many overlap.

  python3 tools/audio/record.py --tag a --points 14 [play.py's options…]
Only top-level calls are kept (roar() calling applause() is one call), and the engine's state (crowdBase, tension,
replayMode) every time it changes."""
import json, os, runpy, sys
HERE = os.path.dirname(os.path.abspath(__file__))
UX = os.path.join(HERE, '..', 'audit', 'ux')
sys.path.insert(0, UX)
import lib  # noqa: E402

SPY = r"""(() => {
  window.__tl = []; window.__snd = {};
  const hook = () => { const pb = window.__pb; if (!pb || !pb.audio || !window.__vtick) return setTimeout(hook, 50);
    const a = pb.audio; const T = () => performance.now() / 1000; let depth = 0;
    const names = ['play','paddle','wall','courtBounce','squeak','ooh','applause','roar','chime','crowdSwell','crowdHush','music','duck','setMusic','setSfx','broadcast'];
    for (const k of names) { const f = a[k]; if (typeof f !== 'function') continue;
      a[k] = function (...x) {
        if (depth === 0) { window.__tl.push({ t: T(), f: k, a: JSON.parse(JSON.stringify(x)) });
          const key = k === 'play' ? 'play:' + x[0] : k === 'paddle' ? 'paddle:' + x[0] + (x[6] ? ':' + x[6] : '') : k; window.__snd[key] = (window.__snd[key] || 0) + 1; }
        depth++; try { return f.apply(this, x); } finally { depth--; } }; }
    const st = { crowdBase: undefined, tension: undefined, replayMode: undefined };
    const vt = window.__vtick;
    window.__vtick = (dt) => { vt(dt); for (const key in st) if (a[key] !== st[key]) { st[key] = a[key]; window.__tl.push({ t: T(), f: 'set', a: [key, a[key]] }); } };
  }; hook();
})();"""
lib.SPY = SPY
_close = lib.Game.close


def close(self):
    tl = self.pg.evaluate('window.__tl')
    t0 = tl[0]['t'] if tl else 0
    for c in tl: c['t'] = round(c['t'] - t0, 4)
    tag = sys.argv[sys.argv.index('--tag') + 1] if '--tag' in sys.argv else 'a'
    path = os.path.join(lib.OUT, f'{tag}-timeline.json')
    json.dump({'calls': tl, 'errors': self.errs}, open(path, 'w'))
    print('timeline:', path, len(tl), 'calls')
    _close(self)


lib.Game.close = close
sys.argv = [os.path.join(UX, 'play.py')] + sys.argv[1:]
os.chdir(UX)
runpy.run_path(os.path.join(UX, 'play.py'), run_name='__main__')
