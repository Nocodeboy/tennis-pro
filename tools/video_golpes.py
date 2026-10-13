"""Dónde están los golpes en un vídeo ya pasado por tools/video_pose.py: la velocidad de las muñecas en la imagen (en
alturas del cuerpo por segundo, para que no dependa del zoom) y sus picos, que son los golpes. Saca también una hoja
con los fotogramas alrededor de cada pico, para elegir la mejor repetición y el contacto a ojo.

Uso: python3 tools/video_golpes.py <video> <puntos.json> <hoja.png> [--mano derecha|izquierda] [--escala k]
     --escala: lo lento que va el vídeo (8 = cámara lenta ×8); la velocidad se da ya en tiempo real
Escribe en la salida: por golpe, el fotograma del pico, su tiempo y la velocidad.
"""
import json
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

L_SH, R_SH, L_WR, R_WR, L_HIP, R_HIP, L_ANK, R_ANK = 11, 12, 15, 16, 23, 24, 27, 28


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = {sys.argv[i][2:]: sys.argv[i + 1] for i in range(len(sys.argv) - 1) if sys.argv[i].startswith("--")}
    video, pts, out = args[0], args[1], args[2]
    mano = opts.get("mano", "derecha")
    escala = float(opts.get("escala", 1))
    d = json.load(open(pts))
    fps = float(d["fps"])
    W, H = d["size"]
    n = len(d["frames"])
    # la muñeca de la mano que golpea en la imagen (MediaPipe: "left"/"right" del jugador)
    wr = R_WR if mano == "derecha" else L_WR
    xy = np.full((n, 2), np.nan)
    alto = np.full(n, np.nan)
    for k, f in enumerate(d["frames"]):
        if not f:
            continue
        i = np.array(f["i"]) * [W, H]
        xy[k] = i[wr]
        cab = i[0]
        pies = (i[L_ANK] + i[R_ANK]) / 2
        alto[k] = np.linalg.norm(cab - pies)
    alto_m = np.nanmedian(alto)
    v = np.zeros(n)
    for k in range(1, n - 1):
        if np.isnan(xy[k - 1]).any() or np.isnan(xy[k + 1]).any():
            continue
        v[k] = np.linalg.norm(xy[k + 1] - xy[k - 1]) / 2 * fps * escala / alto_m
    # suavizado corto y picos separados al menos 0,6 s (de tiempo real)
    ker = np.ones(3) / 3
    vs = np.convolve(v, ker, mode="same")
    sep = max(1, int(0.6 * fps * escala))
    umbral = max(2.0, np.percentile(vs, 90) * 0.6)
    picos = []
    for k in range(n):
        if vs[k] < umbral:
            continue
        lo, hi = max(0, k - sep), min(n, k + sep + 1)
        if vs[k] == vs[lo:hi].max():
            picos.append(k)
    print(f"{video}: {n} fotogramas a {fps:.2f} fps (×{escala:g}), cuerpo {alto_m:.0f} px, {len(picos)} golpes")
    for k in picos:
        print(f"  fotograma {k:5d}  {k / fps:7.2f} s  muñeca {vs[k]:.1f} cuerpos/s")
    # hoja: por golpe, 9 fotogramas repartidos de −0,6 a +0,4 s (de tiempo real) alrededor del pico
    paso = max(1, int(round(0.125 * fps * escala)))
    filas = []
    for k in picos[:12]:
        fila = []
        for j in range(-5, 4):
            f = min(n - 1, max(0, k + j * paso))
            img = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{f / fps:.3f}", "-i", video, "-frames:v", "1",
                                  "-vf", "scale=-1:200", "-f", "image2pipe", "-vcodec", "png", "-"],
                                 capture_output=True).stdout
            try:
                im = Image.open(__import__("io").BytesIO(img)).convert("RGB")
            except Exception:
                im = Image.new("RGB", (200, 200))
            dr = ImageDraw.Draw(im)
            dr.rectangle((0, 0, 90, 14), fill="black")
            dr.text((3, 2), f"{f} {f / fps:.2f}s", fill="yellow")
            if j == 0:
                dr.rectangle((0, 0, im.width - 1, im.height - 1), outline="red", width=3)
            fila.append(im)
        filas.append(fila)
    if filas:
        w = sum(im.width for im in filas[0])
        h = sum(f[0].height for f in filas)
        hoja = Image.new("RGB", (w, h))
        y = 0
        for fila in filas:
            x = 0
            for im in fila:
                hoja.paste(im, (x, y))
                x += im.width
            y += fila[0].height
        hoja.save(out)
        print(f"HOJA {out}")


if __name__ == "__main__":
    main()
