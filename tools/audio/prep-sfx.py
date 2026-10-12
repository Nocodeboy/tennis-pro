"""Prepares the AI-made sound effects (ElevenLabs via Magnific) for the game: assets/sfx/*.mp3.

  python3 tools/audio/prep-sfx.py <folder with the takes> [--dry]

Per take: mono; a high-pass under the family's body (the takes carry sub-bass rumble, 20–60 Hz, that only muddies
the mix and a phone cannot play); the onset found on the filtered signal and moved to t = 0 (1.5 ms before it, a
1 ms fade in); cut to the family's length with a raised-cosine fade out (the bounces' takes trail off into a hiss);
the same loudness within a family (K-weighted, over the first 120 ms), peaks under −1 dBFS; mp3, mono, 96 kb/s.
The takes kept (and why the others were dropped) are in TAKES; the engine knows the files by FAMILIES in
src/audio.ts. Prints the before/after numbers (tools/audio/analyse.py)."""
import os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfilt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyse import kweight, db

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SR = 44100
# family: (high-pass Hz, length s, fade-out start s, target loudness of the first 120 ms, LUFS-ish)
FAM = {
    'pala-fuerte': (110, 0.24, 0.07, -16.0),
    'pala-suave': (110, 0.18, 0.05, -16.0),
    'cristal': (45, 0.60, 0.16, -16.0),
    'bote': (70, 0.16, 0.045, -16.0),
}
# take → output name. Dropped: pala-fuerte-1 (−30 dBFS, a low 80 Hz ring with almost nothing above 300 Hz: a «bong»),
# pala-fuerte-4 (−37 dBFS, a metallic ring that lasts the whole second), pala-suave-3 (a second knock at 0.35 s),
# pala-suave-4 (no click at all: a 150 Hz ring, a tom more than a paddle), cristal-4 (a smeared double onset, the
# weakest click).
TAKES = {
    'pala-fuerte-3': 'pala-fuerte-1', 'pala-fuerte-2': 'pala-fuerte-2',
    'pala-suave-1': 'pala-suave-1', 'pala-suave-2': 'pala-suave-2',
    'cristal-1': 'cristal-1', 'cristal-2': 'cristal-2', 'cristal-3': 'cristal-3',
    'bote-1': 'bote-1', 'bote-2': 'bote-2',
}


def load(p):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', p, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def head_loud(x):
    n = int(0.12 * SR)
    y = kweight(x[:n], SR)
    return -0.691 + 10 * np.log10((y ** 2).mean() + 1e-12)


def prep(x, fam):
    f, length, fade, target = FAM[fam]
    y = sosfilt(butter(2, f, 'hp', fs=SR, output='sos'), x)
    pk = np.abs(y).max()
    on = int(np.argmax(np.abs(y) > 0.1 * pk))
    s = max(0, on - int(0.0015 * SR))
    y = y[s:s + int(length * SR)].copy()
    y[: int(0.001 * SR)] *= np.linspace(0, 1, int(0.001 * SR))
    a, b = int(fade * SR), len(y)
    y[a:b] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, b - a))
    g = 10 ** ((target - head_loud(y)) / 20)
    ceil = 10 ** (-1.0 / 20)
    # (a take whose first spike would go over: up to 3 dB of that spike rounded off by a soft clip, the rest by less
    # gain; the knee starts at half the ceiling, so the body of the sound is untouched)
    g = min(g, 10 ** (3 / 20) * ceil / np.abs(y).max())
    y = y * g
    k = 0.5 * ceil
    big = np.abs(y) > k
    y[big] = np.sign(y[big]) * (k + (ceil - k) * np.tanh((np.abs(y[big]) - k) / (ceil - k)))
    return y, on / SR, s / SR


def main():
    src = sys.argv[1]
    dry = '--dry' in sys.argv
    out = os.path.join(ROOT, 'assets', 'sfx')
    os.makedirs(out, exist_ok=True)
    total = 0
    for take, name in TAKES.items():
        fam = name.rsplit('-', 1)[0]
        x = load(os.path.join(src, take + '.mp3'))
        y, on, cut = prep(x, fam)
        dst = os.path.join(out, name + '.mp3')
        if not dry:
            subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-f', 'f64le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '96k', '-ar', str(SR), '-ac', '1', dst], input=y.astype(np.float64).tobytes(), check=True)
            total += os.path.getsize(dst)
        print(f'{take:14s} → {name:14s} onset {on:.3f}s cut at {cut:.3f}s · peak {db(np.abs(x).max()):6.1f} → {db(np.abs(y).max()):5.1f} dBFS · first 120 ms {head_loud(x[int(cut*SR):]):6.1f} → {head_loud(y):6.1f} LUFS · {len(y)/SR:.2f}s')
    if not dry: print(f'total {total/1024:.1f} KB')


if __name__ == '__main__':
    main()
