import sys; sys.path.insert(0, '.')
from lib import *
import math
srv = serve(8902)
LIFT = float(sys.argv[3]) if len(sys.argv) > 3 else 0.004
W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (390, 844)
def path(segs, hz=120):
    """segs: list of (duration s, dx, dy) relative moves, sampled at hz; (dur,0,0) = hold"""
    pts = [(0.0, 0.0, 0.0)]
    t = x = y = 0.0
    for d, dx, dy in segs:
        n = max(1, round(d * hz))
        for i in range(1, n + 1):
            pts.append((t + d * i / n, x + dx * i / n, y + dy * i / n))
        t += d; x += dx; y += dy
    return pts
# (the same battery as tools/audit/gestos.ts, which runs it in Node with the pointerup's lift sample; here the lift
# sample comes from the browser itself, LIFT s after the last move)
G = {
 'latigazo 50px/50ms tras quieto': [(0.12, 0, 0), (0.05, 0, -50)],
 'latigazo 60px/60ms tras quieto': [(0.12, 0, 0), (0.06, 0, -60)],
 'latigazo 70px/50ms tras quieto': [(0.12, 0, 0), (0.05, 0, -70)],
 'latigazo 90px/50ms tras quieto': [(0.12, 0, 0), (0.05, 0, -90)],
 'latigazo sin parar antes (50px/50ms)': [(0.05, 0, -50)],
 'latigazo torcido 15 grados (70px/60ms)': [(0.12, 0, 0), (0.06, 18, -68)],
 'latigazo torcido 25 grados (70px/60ms)': [(0.12, 0, 0), (0.06, 30, -63)],
 'latigazo torcido 40 grados (70px/60ms)': [(0.12, 0, 0), (0.06, 45, -54)],
 'latigazo torcido 70 grados (70px/70ms)': [(0.12, 0, 0), (0.07, 66, -24)],
 'latigazo tras apuntar sin pausa (60px/300ms, 60px/50ms)': [(0.3, 40, -45), (0.05, 0, -60)],
 'toque con temblor 20px': [(0.04, 12, 8), (0.05, 4, 7)],
 'toque largo quieto 0.6 s (bloqueo si el aviso era BLOQUEO)': [(0.6, 0, 0)],
 'latigazo 40px/40ms tras quieto': [(0.12, 0, 0), (0.04, 0, -40)],
 'latigazo 80px/50ms tras quieto': [(0.12, 0, 0), (0.05, 0, -80)],
 'latigazo 100px/60ms tras quieto': [(0.12, 0, 0), (0.06, 0, -100)],
 'latigazo 130px/80ms tras quieto': [(0.12, 0, 0), (0.08, 0, -130)],
 'remate recto con arco natural 20 grados 90px/60ms': [(0.12, 0, 0), (0.06, -31, -85)],

 'colocado (arrastra 70px/300ms, quieto 150ms)': [(0.3, 0, -70), (0.15, 0, 0)],
 'normal (arrastra 80px/300ms y suelta en marcha)': [(0.3, 20, -80)],
 'apuntar rapido (120px/200ms y suelta en marcha)': [(0.2, 60, -105)],
 'apuntar a la izquierda rapido (100px/180ms)': [(0.18, -100, -20)],
 'apuntar y corregir (80px/250ms, 25px/60ms)': [(0.25, 50, -60), (0.06, 25, 0)],
 'latigazo (quieto 120ms, 60px/60ms arriba)': [(0.12, 0, 0), (0.06, 0, -60)],
 'latigazo corto (30px/40ms)': [(0.12, 0, 0), (0.04, 0, -30)],
 'latigazo muy corto (20px/25ms)': [(0.12, 0, 0), (0.025, 0, -20)],
 'latigazo tras apuntar (60px/300ms, quieto 100ms, 60px/60ms)': [(0.3, 40, -45), (0.1, 0, 0), (0.06, 0, -60)],
 'latigazo torcido 30 grados (70px/70ms)': [(0.12, 0, 0), (0.07, 35, -61)],
 'latigazo torcido 50 grados': [(0.12, 0, 0), (0.07, 54, -45)],
 'latigazo torcido 60 grados': [(0.12, 0, 0), (0.07, 61, -35)],
 'latigazo a tope (110px/70ms)': [(0.1, 0, 0), (0.07, 0, -110)],
 'latigazo abajo (60px/60ms)': [(0.12, 0, 0), (0.06, 0, 60)],
 'latigazo abajo-diagonal 40 grados': [(0.12, 0, 0), (0.06, 39, 46)],
 'toque (90ms)': [(0.09, 0, 0)],
 'toque con temblor 10px': [(0.04, 6, 4), (0.05, 2, 4)],
 'toque con temblor 16px': [(0.04, 10, 6), (0.05, 3, 6)],
 'toque largo 0.35 s': [(0.35, 0, 0)],
 'arrastre largo 1.2 s y suelta quieto': [(0.5, 30, -90), (0.5, -20, 10), (0.2, 0, 0)],
}
with sync_playwright() as p:
    g = Game(p, 8902, W, H)
    g.ev("window.__pb.start(0,false)"); g.step(0.5)
    print('input.scale', g.ev("window.__pb.input.scale"), 'pxPerM', g.ev("window.__pb.input.keyAim ? 1 : 0"))
    rows = []
    for name, segs in G.items():
        pts = path(segs)
        t0 = time.time() + 1
        x0, y0 = W * 0.75, H * 0.6
        g.down(1, x0, y0, t0)
        for (t, dx, dy) in pts[1:]:
            g.move(1, x0 + dx, y0 + dy, t0 + t)
        g.up(1, t0 + pts[-1][0] + LIFT)
        r = g.ev("(() => { const r = window.__pb.input.peek(); window.__pb.input.take(1e9); return r; })()")
        if r: r = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in r.items() if k != 't'}
        print(f'{name:60s} -> {r}')
    g.close()
