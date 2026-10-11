"""Two tools/seq.py captures of the same match side by side (before | after), frame by frame, as a strip or a video.
The captures may start at different match times: `off` is how many frames later the second one started.
Usage: python3 tools/seqcmp.py out.png|out.mp4 dirA dirB cam a b [k = 2] [cols = 6] [scale = 0.6] [crop = x0,y0,x1,y1|-] [off = 0]
       (a, b: frames of dirA; cam may be a comma list, the cameras one under the other)"""
import sys, os, subprocess, tempfile, shutil
from PIL import Image, ImageDraw, ImageFont

OUT, A, B, cams = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(',')
a, b = int(sys.argv[5]), int(sys.argv[6])
k = int(sys.argv[7]) if len(sys.argv) > 7 else 2
cols = int(sys.argv[8]) if len(sys.argv) > 8 else 6
sc = float(sys.argv[9]) if len(sys.argv) > 9 else 0.6
crop = [int(x) for x in sys.argv[10].split(',')] if len(sys.argv) > 10 and sys.argv[10] != '-' else None
off = int(sys.argv[11]) if len(sys.argv) > 11 else 0
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
except Exception:
    F = ImageFont.load_default()

def load(d, c, i):
    for ext in ('jpg', 'png'):
        p = os.path.join(d, 'frames', f'{c}-{i:04d}.{ext}')
        if os.path.exists(p):
            im = Image.open(p).convert('RGB')
            if crop:
                im = im.crop(crop)
            return im.resize((int(im.width * sc), int(im.height * sc)))
    return None

def cell(i):
    cols_ = []
    for d, j, lab in ((A, i, 'antes'), (B, i - off, 'después')):
        ims = [load(d, c, j) for c in cams]
        if any(x is None for x in ims):
            return None
        w = ims[0].width
        h = sum(x.height for x in ims)
        col = Image.new('RGB', (w, h + 16), (20, 22, 28))
        y = 0
        for x in ims:
            col.paste(x, (0, y))
            y += x.height
        ImageDraw.Draw(col).text((3, h + 1), f'{lab} · {i / 30:.2f}s', fill=(235, 235, 235), font=F)
        cols_.append(col)
    w = sum(c.width for c in cols_) + 4
    out = Image.new('RGB', (w, cols_[0].height), (200, 60, 40))
    out.paste(cols_[0], (0, 0))
    out.paste(cols_[1], (cols_[0].width + 4, 0))
    return out

if OUT.endswith('.mp4'):
    tmp = tempfile.mkdtemp()
    n = 0
    for i in range(a, b + 1):
        c = cell(i)
        if c is None:
            continue
        c.save(f'{tmp}/{n:04d}.png')
        n += 1
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', f'{tmp}/%04d.png', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', OUT], check=True)
    shutil.rmtree(tmp)
    print(OUT, n, 'frames')
else:
    cells = [c for c in (cell(i) for i in range(a, b + 1, k)) if c is not None]
    w, h = cells[0].size
    rows = (len(cells) + cols - 1) // cols
    S = Image.new('RGB', (cols * (w + 6), rows * (h + 6)), (255, 255, 255))
    for j, c in enumerate(cells):
        S.paste(c, ((j % cols) * (w + 6), (j // cols) * (h + 6)))
    S.save(OUT)
    print(OUT, S.size)
