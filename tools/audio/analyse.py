"""Measurements of rendered audio (numpy/scipy): levels, loudness, onset, decay, brightness.

  lufs(x, sr)        integrated loudness (ITU-R BS.1770 K-weighting, 400 ms blocks, absolute and relative gates)
  short(x, sr)       loudest 400 ms momentary loudness (LUFS) — the level of a short one-shot
  stats(x, sr)       peak (dBFS), momentary max (LUFS), onset (s, the envelope crossing −20 dB of its max), decay
                     (s to −40 dB), spectral centroid (Hz), the share of energy under 150 Hz (a phone speaker loses it)
`x` is float, shape (n,) or (n, 2)."""
import numpy as np
from scipy.signal import lfilter, butter, sosfilt


def kweight(x, sr):
    # BS.1770 pre-filter (high shelf +4 dB) and RLB high-pass, bilinear coefficients for any rate
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = np.tan(np.pi * f0 / sr); Vh = 10 ** (G / 20); Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * f0 / sr)
    b2 = [1, -2, 1]
    a2 = [1, 2 * (K * K - 1) / (1 + K / Q + K * K), (1 - K / Q + K * K) / (1 + K / Q + K * K)]
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)


def _blocks(x, sr, win=0.4, hop=0.1):
    y = kweight(x if x.ndim == 2 else x[:, None], sr)
    n, h = int(win * sr), int(hop * sr)
    p = [float((y[i:i + n] ** 2).mean(0).sum()) for i in range(0, max(1, len(y) - n + 1), h)]
    return np.array(p)


def lufs(x, sr):
    p = _blocks(x, sr)
    l = -0.691 + 10 * np.log10(p + 1e-12)
    p = p[l > -70]
    if not len(p): return -99.0
    rel = -0.691 + 10 * np.log10(p.mean()) - 10
    p2 = p[(-0.691 + 10 * np.log10(p + 1e-12)) > rel]
    return float(-0.691 + 10 * np.log10(p2.mean())) if len(p2) else -99.0


def short(x, sr):
    p = _blocks(x, sr, 0.4, 0.02)
    return float(-0.691 + 10 * np.log10(p.max() + 1e-12))


def db(v):
    return 20 * np.log10(max(float(v), 1e-9))


def envelope(m, sr, win=0.005):
    n = max(1, int(sr * win))
    return np.sqrt(np.convolve(m ** 2, np.ones(n) / n, 'same'))


def stats(x, sr):
    m = x.mean(1) if x.ndim == 2 else x
    e = envelope(m, sr)
    emax = e.max() + 1e-12
    on = int(np.argmax(e > emax * 0.1))
    above = np.where(e > emax * 0.01)[0]
    end = above[-1] if len(above) else on
    a = m[on:end + 1]
    if len(a) > 256:
        S = np.abs(np.fft.rfft(a * np.hanning(len(a)))) ** 2
        f = np.fft.rfftfreq(len(a), 1 / sr)
        cen = float((S * f).sum() / S.sum())
        low = float(S[f < 150].sum() / S.sum())
    else:
        cen = low = 0.0
    return dict(peak=db(np.abs(x).max()), mom=short(x, sr), onset=on / sr, decay=(end - on) / sr, cen=cen, low=low)


def hp(x, sr, f=150, order=2):
    return sosfilt(butter(order, f, 'hp', fs=sr, output='sos'), x, axis=0)
