"""Draws the stick figures written by tools/sticks.ts (one file, or two side by side: before and after), from behind
(looking at the net, as the game camera sees the near player) and from the side, following the player: bones, the
paddle (grip to the middle of the face), the ball, the floor; the left limbs darker. Writes a strip (every k frames)
or, with an .mp4 out, a video at 30 fps.
Usage: python3 tools/sticks.py out.png|out.mp4 a.json [b.json] [k = 2] [cols = 8]
Env: T0, T1 (only the frames between these match times) · ZOOM (bigger figures, default 1) · VIEWS=back,side"""
import sys, json, os, subprocess, tempfile, shutil
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
files = [a for a in sys.argv[2:] if a.endswith('.json')]
rest = [a for a in sys.argv[2:] if not a.endswith('.json')]
K = int(rest[0]) if rest else 2
COLS = int(rest[1]) if len(rest) > 1 else 8
runs = [json.load(open(f)) for f in files]
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
except Exception:
    F = ImageFont.load_default()
Z = float(os.environ.get('ZOOM', '1'))
W, H, S = int(210 * Z), int(250 * Z), 105 * Z  # a view: px, and px per metre
VIEWS = os.environ.get('VIEWS', 'back,side').split(',')
T0 = float(os.environ.get('T0', '-1'))
T1 = float(os.environ.get('T1', '1e9'))
# (this rig's spine goes Hips → Spine02 → Spine01 → Spine, the chest)
LINKS = [('Hips', 'Spine02'), ('Spine02', 'Spine01'), ('Spine01', 'Spine'), ('Spine', 'neck'), ('neck', 'Head'),
         ('Spine', 'LeftShoulder'), ('LeftShoulder', 'LeftArm'), ('LeftArm', 'LeftForeArm'), ('LeftForeArm', 'LeftHand'),
         ('Spine', 'RightShoulder'), ('RightShoulder', 'RightArm'), ('RightArm', 'RightForeArm'), ('RightForeArm', 'RightHand'),
         ('Hips', 'LeftUpLeg'), ('LeftUpLeg', 'LeftLeg'), ('LeftLeg', 'LeftFoot'), ('LeftFoot', 'LeftToeBase'),
         ('Hips', 'RightUpLeg'), ('RightUpLeg', 'RightLeg'), ('RightLeg', 'RightFoot'), ('RightFoot', 'RightToeBase')]

def view(fr, kind, cx, cz):
    """one view of one frame: kind 'back' (from behind the player, facing the net) or 'side' (from his right)"""
    im = Image.new('RGB', (W, H), (236, 238, 242))
    d = ImageDraw.Draw(im)
    s = fr['side']  # +1: the near side looks at −z … (the court: the player faces the net, −side·z… see below)
    # the player faces the net: the near player (side 1? whichever) faces −side·z. From behind: screen x = his right
    fz = -1 if s == 1 else 1  # the way he faces along z (side 1 plays at +z and faces −z)
    def P(p):
        x, y, z = p[0] - cx, p[1], p[2] - cz
        if kind == 'back':
            u = -x * fz  # his right on the right of the screen
        else:
            u = z * fz  # from his right: forward is to the right of the screen
        return (W / 2 + u * S, H - 18 - y * S)
    d.line([(0, H - 18), (W, H - 18)], fill=(150, 150, 150))
    B = fr['bones']
    for a, b in LINKS:
        if a in B and b in B:
            dark = a.startswith('Left') or b.startswith('Left')
            col = (70, 90, 160) if dark else (210, 70, 50)
            if a in ('Hips', 'Spine', 'Spine01', 'Spine02', 'neck'):
                col = (40, 40, 40)
            d.line([P(B[a]), P(B[b])], fill=col, width=3)
    if 'Head' in B:
        x, y = P(B['Head'])
        d.ellipse([x - 7, y - 9, x + 7, y + 5], outline=(40, 40, 40), width=2)
    g, t = P(fr['grip']), P(fr['tip'])
    d.line([g, t], fill=(20, 140, 60), width=3)
    d.ellipse([t[0] - 6, t[1] - 6, t[0] + 6, t[1] + 6], outline=(20, 140, 60), width=2)
    if fr.get('ball'):
        bx, by = P(fr['ball'])
        if 0 <= bx < W and 0 <= by < H:
            d.ellipse([bx - 4, by - 4, bx + 4, by + 4], fill=(230, 200, 0), outline=(120, 100, 0))
    # where the simulation has the feet (a tick on the floor)
    sx, _ = P([fr['sim'][0], 0, fr['sim'][1]])
    d.line([(sx, H - 22), (sx, H - 14)], fill=(0, 0, 0), width=2)
    return im

def frame_img(i):
    cells = []
    for r in runs:
        fs = r['frames']
        fr = fs[min(i, len(fs) - 1)]
        # the camera follows the player's simulation position, eased
        cx, cz = r['_cam'][min(i, len(fs) - 1)]
        top = Image.new('RGB', (len(VIEWS) * W, H + 30), (255, 255, 255))
        for j, vw in enumerate(VIEWS):
            top.paste(view(fr, vw, cx, cz), (j * W, 0))
        dd = ImageDraw.Draw(top)
        sp = (fr['sim'][2] ** 2 + fr['sim'][3] ** 2) ** 0.5
        dd.text((3, H + 1), f"t {fr['t']:.2f} v {sp:.1f} {fr['st']} {fr['phase']}", fill=(0, 0, 0), font=F)
        dd.text((3, H + 15), f"{fr['swing']}  {os.path.basename(r.get('_name', ''))}", fill=(0, 0, 0), font=F)
        cells.append(top)
    out = Image.new('RGB', (sum(c.width for c in cells) + 6 * (len(cells) - 1), cells[0].height), (30, 30, 30))
    x = 0
    for c in cells:
        out.paste(c, (x, 0))
        x += c.width + 6
    return out

for r, f in zip(runs, files):
    r['_name'] = f
    cam = []
    cx, cz = r['frames'][0]['sim'][0], r['frames'][0]['sim'][1]
    for fr in r['frames']:
        cx += (fr['sim'][0] - cx) * 0.3
        cz += (fr['sim'][1] - cz) * 0.3
        cam.append((cx, cz))
    r['_cam'] = cam
for r in runs:
    keep = [j for j, fr in enumerate(r['frames']) if T0 <= fr['t'] <= T1]
    r['frames'] = [r['frames'][j] for j in keep]
    r['_cam'] = [r['_cam'][j] for j in keep]
n = max(len(r['frames']) for r in runs)
if OUT.endswith('.mp4'):
    tmp = tempfile.mkdtemp()
    for i in range(n):
        frame_img(i).save(f'{tmp}/{i:04d}.png')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', f'{tmp}/%04d.png', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', OUT], check=True)
    shutil.rmtree(tmp)
else:
    ims = [frame_img(i) for i in range(0, n, K)]
    w, h = ims[0].size
    cols = COLS if len(runs) == 1 else max(1, COLS // 2)
    rows = (len(ims) + cols - 1) // cols
    S2 = Image.new('RGB', (cols * w, rows * h), (30, 30, 30))
    for j, im in enumerate(ims):
        S2.paste(im, ((j % cols) * w, (j // cols) * h))
    S2.save(OUT)
print(OUT, n, 'frames')
