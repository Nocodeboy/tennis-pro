import sys; sys.path.insert(0, '.')
from lib import *
srv = serve(8912)
with sync_playwright() as p:
    g = Game(p, 8912)
    g.ev("window.__pb.start(0,false)"); g.step(0.5)
    g.ev("window.__pe = []; for (const k of ['pointerdown','pointermove','pointerup','pointercancel']) window.addEventListener(k, e => window.__pe.push(k + ':' + e.pointerId + '@' + Math.round(e.clientX) + ',' + Math.round(e.clientY)), true)")
    I = "(() => { const i = window.__pb.input; return { pressing: i.pressing, dx: i.dx, dy: i.dy, stick: [i.stickX.toFixed(2), i.stickY.toFixed(2)] }; })()"
    t = time.time()
    # case A: stick first, then aim
    g.down(2, 80, 650, t); g.move(2, 110, 650, t+0.02)
    g.down(1, 290, 600, t+0.05)
    for i in range(1, 6): g.move(1, 290, 600 - 20*i, t + 0.05 + 0.03*i); g.move(2, 110 + i, 650, t + 0.06 + 0.03*i)
    print('A (stick, luego apuntar):', g.ev(I))
    g.up(1, t+0.3); print('   soltado:', g.ev("window.__pb.input.peek()")); g.ev("window.__pb.input.take(1e9)")
    g.up(2, t+0.32)
    # case B: aim first, then stick
    t = time.time()
    g.down(1, 290, 600, t)
    g.down(2, 80, 650, t+0.02)
    for i in range(1, 6): g.move(2, 80 + 6*i, 650, t + 0.02 + 0.03*i); g.move(1, 290, 600 - 20*i, t + 0.03 + 0.03*i)
    print('B (apuntar, luego stick):', g.ev(I))
    g.up(1, t+0.3); print('   soltado:', g.ev("window.__pb.input.peek()")); g.ev("window.__pb.input.take(1e9)")
    g.up(2, t+0.32)
    print('\n'.join(g.ev("window.__pe")[-40:]))
    g.close()
