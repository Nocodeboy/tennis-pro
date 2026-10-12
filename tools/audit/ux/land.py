import sys, json; sys.path.insert(0, '.')
from lib import *
port = 8930
srv = serve(port)
with sync_playwright() as p:
    g = Game(p, port, 844, 390, seed=99)
    g.step(1.0, 1/30); g.shot('land-01-menu')
    g.ev("document.querySelector('[data-a=play]').click()"); g.step(0.4, 1/30); g.shot('land-02-tarjeta')
    g.ev("window.__pb.start(2, false)"); g.step(0.5, 1/30); g.shot('land-03-saque')
    g.ev("window.__pb.autopilot()")
    # a rally with an incoming ball from the far side: aim with the right thumb, to see the chip and the ring
    for i in range(400):
        g.step(0.1, 1/60)
        st = g.ev("(() => { const m = window.__pb.match; const hp = m.humanPlan(); return { ph: m.phase, last: m.rally?.last?.team ?? -1, dt: hp ? hp.plan.t - m.t : null, shots: m.rally?.shots ?? 0 }; })()")
        if st['ph'] == 'rally' and st['last'] == 1 and st['dt'] and 0.35 < st['dt'] < 0.6 and st['shots'] >= 2:
            g.down(1, 700, 260, g.ts); g.move(1, 690, 200, g.ts + 0.1)
            g.ev("window.__pb.input.aimMove(-10, -60, performance.now()/1000)")
            g.step(0.1, 1/60); g.shot('land-04-apuntando'); g.up(1, g.ts); break
    for i in range(300):
        g.step(0.1, 1/60)
        if g.ev("window.__pb.match.phase") == 'dead': g.step(0.3, 1/30); g.shot('land-05-punto'); break
    g.ev("document.querySelector('#pauseBtn')?.click()"); g.step(0.2, 1/30); g.shot('land-06-pausa')
    print('errores:', g.errs)
    g.close()
