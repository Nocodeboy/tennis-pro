"""A whole match on autopilot with the TV moments on: pacing (intro, replays, pauses), shares of the ball, the end."""
import sys, json; sys.path.insert(0, '.')
from lib import *
pair = int(sys.argv[1]); port = int(sys.argv[2]); tag = sys.argv[3]; W = int(sys.argv[4]) if len(sys.argv) > 4 else 390; H = int(sys.argv[5]) if len(sys.argv) > 5 else 844
srv = serve(port)
with sync_playwright() as p:
    g = Game(p, port, W, H, seed=77 + pair)
    g.ev(f"window.__pb.start({pair}, true); window.__pb.autopilot()")
    g.ev("""(() => { const m = window.__pb.match; window.__evs = []; const push = m.events.push.bind(m.events);
      m.events.push = (...e) => { for (const x of e) window.__evs.push(Object.assign({ t: m.t }, x)); return push(...e); }; })()""")
    S = """(() => { const pb = window.__pb, m = pb.match; const e = window.__evs; window.__evs = [];
      return { t: m.t, phase: m.phase, frozen: pb.bc.frozen, replay: !!pb.view.replay, over: m.phase === 'over', end: !!document.querySelector('.end'),
        evs: e.filter(x => x.type === 'hit' || x.type === 'point' || x.type === 'game' || x.type === 'over').map(x => ({ type: x.type, pid: x.pid, kind: x.kind, timing: x.timing, winner: x.winner, reason: x.reason, fault: x.fault, rally: x.rally, t: x.t })) }; })()"""
    real = 0.0; frozen = 0.0; replay = 0.0; dead = 0.0; rally = 0.0; serve = 0.0; nrep = 0; prevrep = False; shots = {}
    hits = [0, 0, 0, 0]; pts = []; snapped = set(); DT = 0.1
    while real < 1500:
        st = g.ev(S); real += DT
        for e in st['evs']:
            if e['type'] == 'hit' and e['kind'] != 'serve': hits[e['pid']] += 1
            if e['type'] == 'point': pts.append(e)
        if st['replay'] and not prevrep:
            nrep += 1
            if 'rep' not in snapped and real > 10: snapped.add('rep'); g.step(1.0, 1/30); g.shot(f'{tag}-repeticion'); real += 1
        prevrep = st['replay']
        if st['frozen']: frozen += DT
        if st['replay']: replay += DT
        if not st['frozen']:
            if st['phase'] == 'dead': dead += DT
            elif st['phase'] == 'rally': rally += DT
            elif st['phase'] == 'serve': serve += DT
        if st['end']:
            g.step(0.8, 1/30); g.shot(f'{tag}-final'); break
        g.step(DT, 1/60)
    won = sum(1 for x in pts if x['winner'] == 0)
    reasons = {}
    for x in pts:
        k = ('nos' if x['winner'] == 0 else 'ellos') + ':' + x['reason'] + (':fallo' + str(x['fault']) if x.get('fault') is not None else '')
        reasons[k] = reasons.get(k, 0) + 1
    print(json.dumps({'pareja': pair, 'tiempo_total': round(real, 1), 'TV_congelado': round(frozen, 1), 'repeticiones': nrep, 'tiempo_repeticiones': round(replay, 1),
        'pausa_muerta': round(dead, 1), 'peloteo': round(rally, 1), 'saque_espera': round(serve, 1), 'puntos': len(pts), 'ganados': won,
        'golpes_no_saque [tu, martin, r1, r2]': hits, 'motivos': reasons, 'errores': g.errs}, ensure_ascii=False, indent=1))
    g.close()
