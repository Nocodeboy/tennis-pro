"""A strip of frames of a tools/seq.py capture (to look at a movement frame by frame): frames a…b every k of one camera,
cropped (optional) and scaled, in rows, each with its frame number and time.
Usage: python3 tools/strip.py frames_dir cam a b [k = 1] [cols = 10] [scale = 0.5] [crop = x0,y0,x1,y1] [out.png]
       cam can be a comma list (the cameras one under the other for each frame)."""
import sys, os
from PIL import Image, ImageDraw, ImageFont
D, cams, a, b = sys.argv[1], sys.argv[2].split(','), int(sys.argv[3]), int(sys.argv[4])
k = int(sys.argv[5]) if len(sys.argv) > 5 else 1
cols = int(sys.argv[6]) if len(sys.argv) > 6 else 10
sc = float(sys.argv[7]) if len(sys.argv) > 7 else 0.5
crop = [int(x) for x in sys.argv[8].split(',')] if len(sys.argv) > 8 and sys.argv[8] != '-' else None
out = sys.argv[9] if len(sys.argv) > 9 else os.path.join(D, '..', f'strip-{"_".join(cams)}-{a}-{b}.png')
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
except Exception:
    F = ImageFont.load_default()
idx = list(range(a, b + 1, k))
cells = []
for i in idx:
    col = []
    for c in cams:
        p = None
        for ext in ('jpg', 'png'):
            q = os.path.join(D, f'{c}-{i:04d}.{ext}')
            if os.path.exists(q):
                p = q
        if not p:
            continue
        im = Image.open(p).convert('RGB')
        if crop:
            im = im.crop(crop)
        im = im.resize((int(im.width * sc), int(im.height * sc)))
        col.append(im)
    if col:
        w = col[0].width
        h = sum(x.height for x in col)
        cell = Image.new('RGB', (w, h + 14), (20, 22, 28))
        y = 0
        for x in col:
            cell.paste(x, (0, y))
            y += x.height
        ImageDraw.Draw(cell).text((3, h), f'{i} · {i / 30:.2f}s', fill=(235, 235, 235), font=F)
        cells.append(cell)
if not cells:
    sys.exit('no frames')
w, h = cells[0].size
rows = (len(cells) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h), (20, 22, 28))
for n, c in enumerate(cells):
    S.paste(c, ((n % cols) * w, (n // cols) * h))
S.save(out)
print(out, S.size)
