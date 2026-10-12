import sys; sys.path.insert(0, '.')
from lib import *
srv = serve(8901)
with sync_playwright() as p:
    g = Game(p, 8901); g.ev("window.__pb.start(0,false)")
    g.ev("window.__ts = []; window.addEventListener('pointermove', e => window.__ts.push([e.timeStamp, e.clientX, e.clientY, e.pointerType]), true)")
    t = time.time()
    g.down(1, 300, 600, t); 
    for i in range(1, 6): g.move(1, 300, 600 - i*10, t + i*0.01)
    g.up(1, t + 0.06)
    print(g.ev("window.__ts"), g.ev("performance.timeOrigin"), t*1000)
    print(g.errs)
    g.close()
