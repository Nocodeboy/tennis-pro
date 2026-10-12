"""Before → after of two tools/render/poses-tenis.ts runs (their out.json), side by side: the measures that match the patterns given
(regular expressions; default: the ready stance, the free arm, the paddle, the serve, the feet, pops and the paddle on
the ball), p50 / p90 (or the share, for the yes/no measures).
Usage: python3 tools/posecmp.py before.json after.json [pattern …]"""
import sys, json, re

a = json.load(open(sys.argv[1]))['stats']
b = json.load(open(sys.argv[2]))['stats']
pats = sys.argv[3:] or [r'^(padHead|padFace|padFlat|padChest|freeToPaddle|elbowFwd|hipsBack|knee(Idle|Rest)|torso(Idle|Rest)|hips(Idle|Rest))',
                        r'^(freeWide|freeOut|freeStiff|freeLat_)', r'^(serve|driveFinish|faceOff|padAhead)', r'^(paddle$|paddle_)',
                        r'^(slideG$|slideG_contact$|slideG_still$|turnRate|jerk$|torsoTilt|spineBend|wristBend$|wristBend_sw|foldNoKnees|idleRate|paddleIdle|paddleMoveY)', r'^idleFrozen']
keys = sorted(set(a) | set(b))

def fmt(s):
    if not s:
        return '–'
    if 'share' in s:
        return f"{s['share'] * 100:.1f} %" + (f" (tramos {s['runs']}, máx {s['max']} s)" if 'runs' in s else '')
    if 'p50' in s:
        return f"{s['p50']:.3g} / {s['p90']:.3g}"
    return f"n={s['n']}"

for p in pats:
    r = re.compile(p)
    for k in keys:
        if r.search(k):
            print(f"{k:24s} {fmt(a.get(k)):>24s}  →  {fmt(b.get(k))}")
    print()
