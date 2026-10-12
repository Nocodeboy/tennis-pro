"""A first-time human, by real touches: the menu flow (optional), then points played with the left stick and the
right thumb (place / flick / tap / down-flick by the cue). Logs hints, cues, banners, points, pacing; screenshots."""
import sys, json, math, random; sys.path.insert(0, '.')
from lib import *
import argparse
ap = argparse.ArgumentParser()
ap.add_argument('--pair', type=int, default=0); ap.add_argument('--points', type=int, default=8)
ap.add_argument('--w', type=int, default=390); ap.add_argument('--h', type=int, default=844)
ap.add_argument('--port', type=int, default=8910); ap.add_argument('--menu', action='store_true')
ap.add_argument('--tag', default='a'); ap.add_argument('--shots', type=int, default=30)
ap.add_argument('--seed', type=int, default=1234); ap.add_argument('--passive', action='store_true')
ap.add_argument('--hurry', action='store_true'); ap.add_argument('--maxsim', type=float, default=400)
ap.add_argument('--modes', default='drive,drive,lob,chiquita,drive'); ap.add_argument('--snapaim', type=int, default=0)
ap.add_argument('--jitter', type=float, default=0.05)
A = ap.parse_args()
rnd = random.Random(A.seed)
srv = serve(A.port)
log = []
def L(*a):
    s = ' '.join(str(x) for x in a); log.append(s); print(s, flush=True)
STATE = r"""(() => { const pb = window.__pb, m = pb.match; if (!m) return null; const me = m.players[0];
  const hp = m.humanPlan(); const tg = m.targetFor(0); const b = m.ballPos(); const v = pb.view;
  const sp = (x,y,z) => { const s = v.toScreen(x,y,z); return [Math.round(s.x), Math.round(s.y)]; };
  const hint = document.getElementById('hint'); const ban = document.getElementById('banner');
  return { t: m.t, phase: m.phase, frozen: pb.bc.frozen, srv: m.serverId, windup: !!m.windup, side: v.viewSide,
    me: [me.x, me.z], meS: sp(me.x, 0, me.z), tg: tg ? [tg.fx, tg.fz, tg.t - m.t] : null,
    plan: hp ? { dt: hp.plan.t - m.t, reach: hp.plan.reach, over: hp.plan.overhead, oops: hp.plan.oops, out: hp.plan.out, by: hp.plan.by, bz: hp.plan.bz } : null,
    ball: b ? [b.x, b.y, b.z] : null, ballS: b ? sp(b.x, b.y, b.z) : null, cue: pb.cue,
    last: m.rally && m.rally.last ? m.rally.last.team : -1, shots: m.rally ? m.rally.shots : 0,
    hint: hint.hidden ? '' : hint.textContent, banner: ban.textContent, tapOn: document.querySelector('.tap-on')?.classList.contains('on'),
    games: m.games.slice(), pts: m.pointText ? [m.pointText(0), m.pointText(1)] : null, winner: m.winner,
    pressing: pb.input.pressing, chip: (() => { const c = document.querySelector('#fx .chip'); return c && !c.hidden ? c.textContent : ''; })(),
    replay: !!v.replay, skipOn: document.querySelector('.tv-skip')?.classList.contains('on') }; })()"""
HOOK = r"""(() => { const m = window.__pb.match; window.__evs = []; const push = m.events.push.bind(m.events);
  m.events.push = (...e) => { for (const x of e) window.__evs.push(Object.assign({ t: m.t }, x)); return push(...e); }; })()"""
with sync_playwright() as p:
    g = Game(p, A.port, A.w, A.h, seed=A.seed)
    W, H = A.w, A.h
    shots_left = [A.shots]
    def snap(name):
        if shots_left[0] <= 0: return
        shots_left[0] -= 1
        path = g.shot(f'{A.tag}-{name}'); L('  [captura]', path)
    def box(sel):
        return g.ev(f"(() => {{ const e = document.querySelector('{sel}'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; }})()")
    t_menu = 0.0
    if A.menu:
        g.step(1.0, 1/30); snap('01-menu')
        x, y = box('[data-a=play]'); g.tap(x, y); g.step(0.4, 1/30); snap('02-tarjeta')
        L('tarjeta: texto =', g.ev("document.querySelector('.vs-card')?.innerText.replace(/\\n+/g,' | ').slice(0,400)"))
        x, y = box('[data-a=go]'); g.tap(x, y)
        # the TV intro: how long, what it shows
        t0 = 0.0; k = 0
        while True:
            g.step(0.5, 1/30); t0 += 0.5
            st = g.ev(STATE)
            if t0 in (1.0, 3.0, 6.0): snap(f'03-intro-{t0:.0f}s')
            if not st['frozen'] or t0 > 40: break
        L(f'intro TV: {t0:.1f} s (sin tocar)  fase={st["phase"]}')
        t_menu = t0
    else:
        g.ev(f"window.__pb.start({A.pair}, true)"); 
        while g.ev(STATE)['frozen']: g.step(0.5, 1/30)
    g.ev(HOOK)
    stick = None  # base of the left thumb
    aim = None    # the right thumb's plan: dict
    prev = {'hint': '', 'banner': '', 'cue': None, 'phase': '', 'tapOn': False, 'frozen': False}
    seen = set(); pts = []; cur = {'start': None}
    frozen_t = 0.0; dead_t = 0.0; t_first_shot = None; t_serve_ready = None
    sim0 = g.ev(STATE)['t']; tsim = 0.0
    DT = 1/30
    while True:
        st = g.ev(STATE)
        if st is None: break
        tsim += DT
        # --- logs: hint, banner, cue, phase
        if st['hint'] != prev['hint'] and st['hint']:
            L(f't={st["t"]-sim0:6.1f}  PISTA: {st["hint"]}')
            if st['hint'][:12] not in seen: seen.add(st['hint'][:12]); snap(f'pista-{len(seen):02d}')
        if st['banner'] != prev['banner'] and st['banner']:
            L(f't={st["t"]-sim0:6.1f}  CARTEL: {st["banner"]}  ({st["games"]} {st["pts"]})')
        if st['cue'] != prev['cue'] and st['cue']:
            L(f't={st["t"]-sim0:6.1f}  AVISO: {st["cue"]}  plan={st["plan"]}')
            if ('cue-' + st['cue']) not in seen: seen.add('cue-' + st['cue']); snap(f'aviso-{st["cue"]}')
        if st['tapOn'] and not prev['tapOn']: L(f't={st["t"]-sim0:6.1f}  «toca para seguir» visible')
        if st['frozen'] and not prev['frozen']: L(f't={st["t"]-sim0:6.1f}  TV toma la pantalla (repetición/momento) replay={st["replay"]}')
        if st['frozen']:
            frozen_t += DT
            if st['replay'] and 'replay' not in seen: seen.add('replay'); snap('repeticion')
        if st['phase'] == 'dead' and not st['frozen']: dead_t += DT
        if st['phase'] != prev['phase']:
            if st['phase'] == 'serve' and t_serve_ready is None: t_serve_ready = st['t'] - sim0
        prev = {k: st[k] for k in prev}
        evs = g.ev("(() => { const e = window.__evs; window.__evs = []; return e; })()")
        for e in evs:
            if e['type'] == 'hit':
                who = ['TÚ', 'Martín', 'R1', 'R2'][e['pid']]
                if e['pid'] == 0 and e['kind'] != 'serve' and t_first_shot is None: t_first_shot = e['t'] - sim0
                L(f't={e["t"]-sim0:6.1f}    golpe {who}: {e["kind"]} timing={e["timing"]} pot={e.get("power")} esp={e.get("special")} q={round(e.get("q",0),2)}')
            elif e['type'] == 'point':
                why = g.ev("window.__pb.why")
                pts.append({'winner': e['winner'], 'reason': e['reason'], 'fault': e.get('fault'), 'rally': e.get('rally'), 'why': why, 't': e['t'] - sim0})
                L(f't={e["t"]-sim0:6.1f}  PUNTO para {"nosotros" if e["winner"]==0 else "ellos"}: {e["reason"]} fallo={e.get("fault")} golpes={e.get("rally")} · {why}')
                if len(pts) <= 3: g.step(0.3, 1/30); snap(f'punto-{len(pts)}')
            elif e['type'] in ('fault', 'let', 'game', 'over'):
                L(f't={e["t"]-sim0:6.1f}  {e["type"]} {json.dumps({k:v for k,v in e.items() if k not in ("t","type")})}')
        if st['phase'] == 'over' or len(pts) >= A.points or tsim > A.maxsim:
            break
        # ----- the left thumb: a stick toward the circle
        if not A.passive and not st['frozen'] and st['phase'] in ('rally', 'serve', 'dead') and st['tg']:
            dx = st['tg'][0] - st['me'][0]; dz = st['tg'][1] - st['me'][1]; d = math.hypot(dx, dz)
            if d > 0.35 and st['phase'] == 'rally':
                s = st['side']; ux, uy = dx / d * s, dz / d * s
                if stick is None:
                    stick = (W * 0.2, H * 0.78); g.down(2, *stick, g.ts)
                k = min(1.0, d / 0.8) * 50
                g.move(2, stick[0] + ux * k, stick[1] + uy * k, g.ts)
            elif stick is not None:
                if 1 in g.touches: g.move(2, *stick, g.ts)
                else: g.up(2, g.ts); stick = None
        elif stick is not None:
            if 1 in g.touches: g.move(2, *stick, g.ts)
            else: g.up(2, g.ts); stick = None
        # ----- the right thumb
        if not st['frozen']:
            rx, ry = W * 0.74, H * 0.72
            if st['phase'] == 'serve' and st['srv'] == 0 and not st['windup']:
                if aim is None:
                    aim = {'kind': 'serve', 'at': st['t'], 'pts': []}; g.down(1, rx, ry, g.ts)
                elif st['t'] - aim['at'] < 0.25:
                    g.move(1, rx + 8, ry - 30 * (st['t'] - aim['at']) / 0.25, g.ts)
                else:
                    s = abs(math.sin(math.pi * st['t'] / 1.1))
                    if s < 0.12 or st['t'] - aim['at'] > 3:
                        g.up(1, g.ts + 0.012); aim = None
            elif not A.passive and st['phase'] == 'rally' and st['plan'] and st['plan']['reach'] and not st['plan']['oops'] and st['last'] != 0:
                pl = st['plan']; dt = pl['dt']
                target_rel = 0.10 + rnd.uniform(-A.jitter, A.jitter)
                if aim is None and dt < 0.85 and dt > 0.2:
                    cue = st['cue']
                    if cue == 'block': mode = 'tap'
                    elif cue == 'attack' and pl['over'] and abs(pl['bz']) < 3.5 and rnd.random() < 0.35: mode = rnd.choice(['down', 'full'])
                    elif cue in ('attack', 'bajada'): mode = rnd.choice(['flick', 'flick', 'bent'])
                    else: mode = rnd.choice(A.modes.split(','))
                    aim = {'kind': mode, 'at': st['t'], 'rel': target_rel, 'dx': rnd.choice([-45, -20, 20, 45])}
                    g.down(1, rx, ry, g.ts)
                    L(f't={st["t"]-sim0:6.1f}    pulgar abajo: {mode} (contacto en {dt:.2f}s, aviso={cue}, por encima={pl["over"]}, altura={pl["by"]:.2f})')
                elif aim is not None and aim['kind'] != 'serve':
                    el = st['t'] - aim['at']; m = aim['kind']
                    if m in ('drive', 'lob', 'chiquita'):
                        ty = {'drive': -60, 'lob': -125, 'chiquita': 70}[m]
                        u = min(1, el / 0.3); g.move(1, rx + aim['dx'] * u, ry + ty * u, g.ts)
                    if dt <= aim['rel']:
                        if m in ('drive', 'lob', 'chiquita'):
                            L(f'      antes de soltar: etiqueta={st["chip"]!r} arrastre={g.touches.get(1)}')
                            if A.snapaim > 0: A.snapaim -= 1; snap(f'apuntando-{m}-{A.snapaim}')
                        # the release (and the stroke for the flicks)
                        t0 = g.ts
                        if m in ('flick', 'full', 'bent', 'down'):
                            ln, ang = {'flick': (85, 0), 'full': (135, 0), 'bent': (90, 38), 'down': (80, 180)}[m]
                            a = math.radians(ang); cx, cy = g.touches[1]
                            for i in range(1, 7):
                                g.move(1, cx + math.sin(a) * ln * i / 6, cy - math.cos(a) * ln * i / 6, t0 + 0.06 * i / 6)
                            g.up(1, t0 + 0.07)
                        elif m == 'tap':
                            g.up(1, aim.get('t0', t0) + 0.1)
                        else:
                            g.up(1, t0 + 0.012)
                        r = g.ev("window.__pb.input.peek()")
                        if m in ('drive', 'lob', 'chiquita'): L(f'      soltado: {r}')
                        aim = None
            elif aim is not None and aim['kind'] != 'serve' and (st['phase'] != 'rally' or st['last'] == 0):
                g.up(1, g.ts); aim = None
        # --- after a point: optionally tap to hurry
        if A.hurry and st['tapOn'] and aim is None:
            g.down(1, W * 0.7, H * 0.5, g.ts); g.up(1, g.ts + 0.05)
        g.step(DT, DT)
    st = g.ev(STATE)
    L('--- resumen ---')
    L('tiempo sim jugado:', round(tsim, 1), 's · TV/repeticiones:', round(frozen_t, 1), 's · pausa entre puntos (sin TV):', round(dead_t, 1), 's')
    L('primer golpe del humano (no saque) en t =', t_first_shot, '· primer saque disponible en', t_serve_ready)
    L('puntos:', len(pts), 'ganados:', sum(1 for x in pts if x['winner'] == 0), 'marcador', st['games'], st['pts'])
    L('motivos:', json.dumps([(x['winner'], x['reason'], x['fault']) for x in pts]))
    L('sonidos:', json.dumps(g.ev('window.__snd')))
    L('errores:', g.errs)
    open(f'{OUT}/{A.tag}-log.txt', 'w').write('\n'.join(log))
    g.close()
