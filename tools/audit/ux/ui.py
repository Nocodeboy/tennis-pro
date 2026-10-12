"""The interface by real touches, for before/after captures of the camera and the HUD (auditoría 04: A3, M2, M4, M5, B1).

A first-time player (pair 2, seed 1234) plays with the left stick (virtual) and the right thumb (CDP touches):
  · aims a drive (mid ring and gold), a chiquita (drag down), and an overhead ball (held, then flicked up);
  · a translucent thumb is drawn over each capture where the right thumb rests, and the JSON says what it covers
    (your player, the timing ring, the circle);
  · every frame: is any of the four players (or your circle) cut by the edge of the screen?
  · the first point's banner.
Then landscape (844×390): the serve, an aim, how much of the width the court takes and how tall the far players are.

  python3 tools/audit/ux/ui.py [tag] [portrait|landscape|both]
  PADEL_DIST=/other/dist python3 tools/audit/ux/ui.py antes     (another build)
Writes $PADEL_OUT/ui-<tag>-*.png (default /tmp/padel-audit-ux) and prints a JSON summary.
"""
import sys, json, math, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

TAG = sys.argv[1] if len(sys.argv) > 1 else 'x'
WHICH = sys.argv[2] if len(sys.argv) > 2 else 'both'

STATE = r"""(() => { const pb = window.__pb, m = pb.match; if (!m) return null; const v = pb.view;
  const sp = (x,y,z) => { const s = v.toScreen(x,y,z); return [Math.round(s.x), Math.round(s.y)]; };
  const hp = m.humanPlan(); const tg = m.targetFor(0); const me = m.players[0];
  const vis = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden || getComputedStyle(e).display === 'none' || +getComputedStyle(e).opacity < 0.05) return null; const r = e.getBoundingClientRect(); return r.width ? [Math.round(r.x + r.width/2), Math.round(r.y + r.height/2), Math.round(r.width), Math.round(r.height)] : null; };
  const hint = document.getElementById('hint'); const ban = document.getElementById('banner');
  return { t: m.t, phase: m.phase, frozen: pb.bc.frozen, srv: m.serverId, windup: !!m.windup, side: v.viewSide,
    me: [me.x, me.z], tg: tg ? [tg.fx, tg.fz] : null, tgS: tg ? sp(tg.fx, 0, tg.fz) : null,
    players: m.players.map(p => ({ f: sp(p.x, 0, p.z), h: sp(p.x, 1.85, p.z), c: sp(p.x, 1.1, p.z) })),
    plan: hp ? { dt: hp.plan.t - m.t, reach: hp.plan.reach, over: hp.plan.overhead, oops: hp.plan.oops, out: hp.plan.out, by: hp.plan.by } : null,
    last: m.rally && m.rally.last ? m.rally.last.team : -1, shots: m.rally ? m.rally.shots : 0,
    ring: vis('#fx .ring.outer'), mini: vis('#fx .chip .mr'), chip: (() => { const c = document.querySelector('#fx .chip'); return c && !c.hidden ? c.textContent : ''; })(),
    fan: (() => { const c = document.querySelector('#fx .fan'); return c && !c.hidden ? c.textContent : ''; })(),
    hint: hint.hidden ? '' : hint.textContent, banner: ban.textContent, cue: pb.cue,
    corners: [sp(-5, 0, 10 * v.viewSide), sp(5, 0, 10 * v.viewSide), sp(-5, 0, -10 * v.viewSide), sp(5, 0, -10 * v.viewSide), sp(-5, 3, -10 * v.viewSide), sp(5, 3, -10 * v.viewSide)] }; })()"""

# a right thumb resting on the glass: the pad round the touch, the rest of it down to the bottom-right edge
THUMB = r"""((a) => { let d = document.getElementById('__thumb'); if (!a) { if (d) d.remove(); return; }
  if (!d) { d = document.createElement('div'); d.id = '__thumb'; d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999'; document.body.append(d); }
  const [x, y, ex, ey, r] = a;
  d.innerHTML = `<svg width="100%" height="100%"><line x1="${x}" y1="${y}" x2="${ex}" y2="${ey}" stroke="rgba(226,170,140,.55)" stroke-width="${r*2.4}" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="${r}" fill="rgba(226,170,140,.6)" stroke="rgba(120,70,50,.6)" stroke-width="2"/></svg>`; })"""

def capsule(W, H, x, y):
    """the thumb from its pad (x, y) to the bottom-right edge: (segment end, radius)"""
    r = 30 if H > W else 28
    return (x, y, x + 0.32 * W, y + 0.32 * max(W, H)), r

def covered(cap, r, pt):
    if not pt: return False
    x0, y0, x1, y1 = cap; px, py = pt[0], pt[1]
    vx, vy = x1 - x0, y1 - y0
    k = max(0, min(1, ((px - x0) * vx + (py - y0) * vy) / (vx * vx + vy * vy)))
    cx, cy = x0 + vx * k, y0 + vy * k
    # (the pad is r, the rest of the thumb a little wider)
    return math.hypot(px - cx, py - cy) < (r if k == 0 else r * 1.2)

def run(p, W, H, port, label):
    out = {}
    g = Game(p, port, W, H, seed=1234)
    g.ev("window.__pb.save.tutorial = true; window.__pb.save.hud = 'min'; window.__pb.start(2, false)")
    while g.ev(STATE)['frozen']: g.step(0.5, 1/30)
    g.ev("""(() => { const m = window.__pb.match; window.__pts = 0; const push = m.events.push.bind(m.events);
      m.events.push = (...e) => { for (const x of e) if (x.type === 'point') window.__pts++; return push(...e); }; })()""")
    rest = (W * 0.74, H * 0.74) if H > W else (W * 0.84, H * 0.7)
    def thumb(x, y):
        cap, r = capsule(W, H, x, y)
        g.ev(THUMB, [x, y, cap[2], cap[3], r])
        return cap, r
    def nothumb(): g.ev(THUMB, 0)
    def shot(name, st=None, finger=None):
        info = {}
        if finger:
            cap, r = thumb(*finger)
            st = st or g.ev(STATE)
            me = st['players'][0]
            info = {'tapa_jugador': covered(cap, r, me['c']) or covered(cap, r, me['h']), 'tapa_aro': covered(cap, r, st['ring']), 'tapa_circulo': covered(cap, r, st['tgS']),
                    'aro': st['ring'], 'mini_aro': st['mini'], 'etiqueta': st['chip'], 'abanico': st['fan'], 'jugador': me['c']}
        path = g.shot(f'ui-{TAG}-{label}-{name}')
        nothumb()
        out[name] = dict(info, png=path)
    # ---- the serve
    def serve():
        g.down(1, *rest, g.ts); g.step(0.1, 1/30); g.move(1, rest[0] + 6, rest[1] - 30, g.ts); g.step(0.5, 1/30)
        g.up(1, g.ts + 0.012)
    cut = {'frames': 0, 'cortados': 0, 'peor': None, 'circulo_fuera': 0}
    want = ['drive', 'chiquita', 'over'] if H > W else ['drive']
    aim = None; t0 = g.ev(STATE)['t']; points = 0; label_after = None
    while g.ev(STATE)['t'] - t0 < (160 if H > W else 50):
        st = g.ev(STATE)
        if st['phase'] == 'serve' and st['srv'] == 0 and not st['windup'] and aim is None and not st['frozen']:
            if 'saque' not in out and H < W: shot('saque', st)
            serve(); continue
        # framing: any player's body out of the screen (or within 4 px of the edge)?
        if st['phase'] == 'rally' and not st['frozen']:
            cut['frames'] += 1
            bad = [i for i, pl in enumerate(st['players']) if min(pl['c'][0], pl['f'][0]) < 4 or max(pl['c'][0], pl['f'][0]) > W - 4 or pl['f'][1] > H - 2]
            if bad:
                cut['cortados'] += 1
                if not cut['peor']: cut['peor'] = bad; shot('cortado', st)
            if st['tgS'] and (st['tgS'][0] < 10 or st['tgS'][0] > W - 10 or st['tgS'][1] > H - 10): cut['circulo_fuera'] += 1
        # the left thumb: resting on the stick (drawn where it landed) and pushing it towards the circle (set directly)
        if st['phase'] == 'rally' and 2 not in g.touches: g.down(2, W * 0.2, H * 0.78 if H > W else H * 0.72, g.ts)
        if st['tg'] and st['phase'] == 'rally':
            dx = st['tg'][0] - st['me'][0]; dz = st['tg'][1] - st['me'][1]; d = math.hypot(dx, dz)
            k = min(1.0, d / 0.8) if d > 0.25 else 0
            s = st['side']
            g.ev(f"(() => {{ const i = window.__pb.input; i.stickX = {dx / max(d, 1e-6) * s * k}; i.stickY = {dz / max(d, 1e-6) * s * k}; i.moved = true; }})()")
        pl = st['plan']
        incoming = st['phase'] == 'rally' and st['last'] == 1 and pl and pl['reach'] and not pl['oops'] and not pl['out']
        if aim is None and incoming and 0.5 < pl['dt'] < 0.9 and want:
            # (over the head: not a bajada, every flick of which is a bajada)
            kind = 'over' if pl['over'] and 'over' in want and st['cue'] != 'bajada' else ('chiquita' if 'drive' not in want and 'chiquita' in want and not pl['over'] else ('drive' if 'drive' in want and not pl['over'] else None))
            if kind:
                aim = {'kind': kind, 'mid': False}
                g.down(1, *rest, g.ts)
        elif aim is not None:
            if not incoming:
                g.up(1, g.ts); aim = None; continue
            k = aim['kind']; f0 = rest
            ty = {'drive': -55, 'chiquita': 70, 'over': -25}[k]
            g.move(1, f0[0] + (-10 if k != 'chiquita' else -25), f0[1] + ty, g.ts)
            finger = g.touches[1]
            if not aim['mid'] and pl['dt'] < 0.42:
                aim['mid'] = True
                if k == 'drive': shot('apuntando', None, finger)
                if k == 'over': shot('encima', None, finger)
            if pl['dt'] <= 0.16:
                shot({'drive': 'dorado', 'chiquita': 'chiquita', 'over': 'encima-dorado'}[k], None, finger)
                if k == 'over':
                    # a flick up, a little bent: a víbora or a remate
                    cx, cy = g.touches[1]; t1 = g.ts
                    for i in range(1, 7): g.move(1, cx - 30 * i / 6, cy - 90 * i / 6, t1 + 0.06 * i / 6)
                    g.up(1, t1 + 0.07)
                    label_after = g.ev(STATE)['shots']
                else:
                    g.up(1, g.ts + 0.012)
                want.remove(k); aim = None
        if label_after is not None and g.ev(STATE)['shots'] > label_after:
            g.step(0.12, 1/60); shot('tras-golpe'); label_after = None
            out['tras-golpe']['etiquetas'] = g.ev("[...document.querySelectorAll('#fx .fl')].map(e => e.textContent)")
        if 'punto' not in out and g.ev("window.__pts") > 0:
            g.step(0.3, 1/30); shot('punto'); out['punto']['cartel'] = g.ev("document.getElementById('banner').innerText")
        g.step(1/30, 1/30)
    # a ball at the body (the sim's 'body' point): the banner, from a fake point
    if 2 in g.touches: g.up(2, g.ts)
    g.ev("window.__pb.fakePoint(1, 'body', 'speedup')"); g.step(0.3, 1/30)
    out['cuerpo'] = {'cartel': g.ev("document.getElementById('banner').innerText"), 'por_que': g.ev("window.__pb.why")}
    st = g.ev(STATE)
    c = st['corners']
    xs = [q[0] for q in c]
    out['encuadre'] = dict(cut, esquinas=c, pista_ancho_px=max(xs) - min(xs), lejanos_alto_px=[pl['f'][1] - pl['h'][1] for pl in st['players'][2:]])
    out['errores'] = g.errs
    g.close()
    return out

srv = serve(8941)
res = {}
with sync_playwright() as p:
    if WHICH in ('both', 'portrait'): res['retrato'] = run(p, 390, 844, 8941, 'retrato')
    if WHICH in ('both', 'landscape'): res['apaisado'] = run(p, 844, 390, 8941, 'apaisado')
txt = json.dumps(res, ensure_ascii=False, indent=1)
open(f'{OUT}/ui-{TAG}.json', 'w').write(txt)
print(txt)
