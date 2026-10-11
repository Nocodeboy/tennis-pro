"""Before / after sheets from two tools/closeups.py runs at the same moments: for each moment, a row with the before
shots on the left and the after shots on the right (the same cameras), labelled; one PNG per moment, and all the moments
in one sheet. Shots missing from either run are left out.
Usage: python3 tools/cmpsheet.py out_dir before_dir after_dir moment[,moment…] cam[,cam…] [pid]
  cam: game, front, frontc, side, back, hands (as closeups.py names them); pid: whose close-ups (default: the first
  one found for that moment). Env: CROP=top,bottom (px off each shot) · SCALE (default 0.6) · TITLES=moment=title;… · COLS (columns of the full
sheet, default 1)"""
import os, sys, glob
from PIL import Image, ImageDraw, ImageFont

OUT, A, B = sys.argv[1], sys.argv[2], sys.argv[3]
MOMS = sys.argv[4].split(',')
CAMS = sys.argv[5].split(',')
PID = sys.argv[6] if len(sys.argv) > 6 else None
CROP = [int(x) for x in os.environ.get('CROP', '0,0').split(',')]
SCALE = float(os.environ.get('SCALE', '0.6'))
TITLES = dict(x.split('=', 1) for x in os.environ.get('TITLES', '').split(';') if '=' in x)
os.makedirs(OUT, exist_ok=True)
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 13)
except Exception:
    F = f = ImageFont.load_default()

def shot(d, m, cam):
    if cam == 'game':
        p = os.path.join(d, 'shots', f'{m}-game.jpg')
    else:
        pat = os.path.join(d, 'shots', f'{m}-{cam}-{PID}.jpg' if PID else f'{m}-{cam}-*.jpg')
        g = sorted(glob.glob(pat))
        p = g[0] if g else ''
    if not p or not os.path.exists(p):
        return None
    im = Image.open(p).convert('RGB')
    im = im.crop((0, CROP[0], im.width, im.height - CROP[1]))
    return im.resize((int(im.width * SCALE), int(im.height * SCALE)))

rows = []
for m in MOMS:
    a = [s for s in (shot(A, m, c) for c in CAMS) if s]
    b = [s for s in (shot(B, m, c) for c in CAMS) if s]
    if not a or not b:
        print('  (missing)', m)
        continue
    w = max(x.width for x in a + b)
    h = max(x.height for x in a + b)
    gap = 14
    # (the moment on a line of its own, then ANTES over the left shots and DESPUÉS over the right ones)
    row = Image.new('RGB', (w * (len(a) + len(b)) + gap, h + 50), (18, 20, 26))
    d = ImageDraw.Draw(row)
    for i, im in enumerate(a):
        row.paste(im, (i * w, 50))
    for i, im in enumerate(b):
        row.paste(im, (len(a) * w + gap + i * w, 50))
    d.text((8, 3), TITLES.get(m, m), fill=(235, 235, 235), font=f)
    d.text((8, 24), 'ANTES', fill=(255, 140, 120), font=F)
    d.text((len(a) * w + gap + 8, 24), 'DESPUÉS', fill=(140, 230, 140), font=F)
    row.save(os.path.join(OUT, f'{m}.png'))
    rows.append(row)
    print('  ', m)
if rows:
    # (the moments in COLS columns, read down each column)
    C = max(1, int(os.environ.get('COLS', '1')))
    per = (len(rows) + C - 1) // C
    cols = [rows[i * per:(i + 1) * per] for i in range(C)]
    cw = max(r.width for r in rows) + 12
    H = max(sum(r.height for r in c) for c in cols if c)
    sheet = Image.new('RGB', (cw * len([c for c in cols if c]), H), (18, 20, 26))
    for j, c in enumerate(cols):
        y = 0
        for r in c:
            sheet.paste(r, (j * cw, y))
            y += r.height
    sheet.save(os.path.join(OUT, 'todo.png'))
    print('→', os.path.join(OUT, 'todo.png'), sheet.size)
