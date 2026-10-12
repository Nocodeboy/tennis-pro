"""What a recorded match asks of the engine (tools/audio/record.py's timeline): how often each sound fires, the paddle's
power and specials, what piles up at the end of a point, and the replays.

  python3 tools/audio/events.py <timeline.json>"""
import collections, json, sys

tl = json.load(open(sys.argv[1]))['calls']
snd = [c for c in tl if c['f'] != 'set']
dur = max(c['t'] for c in tl) - min(c['t'] for c in tl)
mins = dur / 60
cnt = collections.Counter(c['f'] if c['f'] != 'play' else 'play:' + c['a'][0] for c in snd)
print(f'duración {dur:.0f} s')
for k, v in cnt.most_common():
    print(f'  {k:16s} {v:4d}  ({v / mins:5.1f}/min)')
pad = [c for c in snd if c['f'] == 'paddle']
pw = [c['a'][5] if len(c['a']) > 5 and c['a'][5] is not None else 0.5 for c in pad]
spec = collections.Counter(c['a'][6] for c in pad if len(c['a']) > 6 and c['a'][6])
soft = {'dink', 'drop', 'auto'}
crack = sum(1 for c, p in zip(pad, pw) if p > 0.65 and c['a'][0] not in soft)
print(f'golpes {len(pad)}: potencia media {sum(pw) / max(1, len(pw)):.2f} · >0.65 (el «crack» de 0.3/0.4 encima) {crack} ({100 * crack / max(1, len(pad)):.0f} %) · especiales {dict(spec)}')
print('  por tipo:', dict(collections.Counter(c['a'][0] for c in pad)))
# per rally-second: how many one-shots per second of play, and the busiest second
sec = collections.Counter(int(c['t']) for c in snd if c['f'] in ('paddle', 'wall', 'courtBounce', 'squeak'))
print(f'sonidos de pista por segundo: media {sum(sec.values()) / max(1, len(sec)):.1f} en los segundos con alguno, máx {max(sec.values()) if sec else 0}')
# what lands within 1.5 s of each point's sting
pts = [c for c in snd if c['f'] == 'play' and c['a'][0] in ('point', 'lost')]
pile = collections.Counter()
for p in pts:
    near = [c for c in snd if abs(c['t'] - p['t']) < 1.5 and c is not p and c['f'] not in ('paddle', 'wall', 'courtBounce', 'squeak', 'crowdSwell')]
    pile[len(near)] += 1
    for c in near: pile['· ' + (c['f'] if c['f'] != 'play' else 'play:' + c['a'][0])] += 1
print('alrededor de cada punto (±1.5 s):', dict(pile))
# replays: the paddle calls with power left at the default while replayMode is on
rep, on = 0, False
for c in tl:
    if c['f'] == 'set' and c['a'][0] == 'replayMode': on = bool(c['a'][1])
    elif on and c['f'] in ('paddle', 'courtBounce', 'play'): rep += 1
print('sonidos dentro de repeticiones:', rep)
# squeaks: how close together
sq = [c['t'] for c in snd if c['f'] == 'squeak']
gaps = sorted(b - a for a, b in zip(sq, sq[1:]))
if gaps: print(f'chirridos: {len(sq)} · separación mediana {gaps[len(gaps) // 2]:.2f} s')
dup = sum(1 for a, b in zip(snd, snd[1:]) if a['f'] == b['f'] and a['a'] == b['a'] and b['t'] - a['t'] < 0.03)
print('llamadas duplicadas (<30 ms, mismos argumentos):', dup)
