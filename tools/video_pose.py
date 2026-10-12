"""Vídeo de un móvil → los 33 puntos del cuerpo en 3D, fotograma a fotograma (MediaPipe Pose Landmarker, el modelo
«heavy»). Es el primer paso para pasar un gesto grabado al jugador: el segundo es
`art/blender/padel_clip.py <build> video <puntos.json> <clip.json> <nombre> [desde hasta]`.

Guarda, por fotograma, los puntos «del mundo» (metros, con el origen entre las caderas, como los da MediaPipe: x a la
derecha de la imagen, y hacia abajo, z hacia la cámara negativo), su visibilidad y los puntos en la imagen (0…1).
Un fotograma sin persona queda como null.

Uso: python3 tools/video_pose.py <video> <salida.json> [--espejo]
     --espejo: el vídeo se voltea antes (un zurdo pasa a diestro)
El modelo (30 MB) se baja la primera vez a ~/.cache/padel/pose_landmarker_heavy.task.
"""
import json
import os
import subprocess
import sys
import urllib.request

import numpy as np

MODELO = os.path.expanduser("~/.cache/padel/pose_landmarker_heavy.task")
URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
NOMBRES = ["nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer",
           "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder", "right_shoulder", "left_elbow",
           "right_elbow", "left_wrist", "right_wrist", "left_pinky", "right_pinky", "left_index", "right_index",
           "left_thumb", "right_thumb", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
           "left_heel", "right_heel", "left_foot_index", "right_foot_index"]


def info(video):
    p = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate:stream_side_data=rotation", "-of", "json", video],
                       capture_output=True, text=True, check=True)
    s = json.loads(p.stdout)["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    return int(s["width"]), int(s["height"]), float(num) / float(den)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    espejo = "--espejo" in sys.argv
    video, out = args[0], args[1]
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision

    if not os.path.exists(MODELO):
        os.makedirs(os.path.dirname(MODELO), exist_ok=True)
        print("bajando el modelo de MediaPipe…")
        urllib.request.urlretrieve(URL, MODELO)
    # ffmpeg decodifica (y gira el vídeo del móvil según sus metadatos) a RGB crudo
    vf = "hflip" if espejo else "null"
    probe = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", vf, "-frames:v", "1", "-f", "image2pipe",
                            "-vcodec", "png", "-"], capture_output=True, check=True).stdout
    from PIL import Image
    import io
    W, H = Image.open(io.BytesIO(probe)).size
    _, _, fps = info(video)
    opts = vision.PoseLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=MODELO),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    det = vision.PoseLandmarker.create_from_options(opts)
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", video, "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                            stdout=subprocess.PIPE)
    frames = []
    k = 0
    while True:
        buf = proc.stdout.read(W * H * 3)
        if len(buf) < W * H * 3:
            break
        img = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        r = det.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=img), int(round(k * 1000 / fps)))
        if r.pose_world_landmarks:
            w = r.pose_world_landmarks[0]
            n = r.pose_landmarks[0]
            frames.append({
                "w": [[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in w],
                "v": [round(p.visibility or 0, 3) for p in w],
                "i": [[round(p.x, 4), round(p.y, 4)] for p in n],
            })
        else:
            frames.append(None)
        k += 1
    proc.wait()
    det.close()
    vistos = sum(1 for f in frames if f)
    json.dump({"video": os.path.basename(video), "fps": fps, "size": [W, H], "espejo": espejo, "nombres": NOMBRES,
               "frames": frames}, open(out, "w"), separators=(",", ":"))
    print(f"{out}: {k} fotogramas a {fps:.2f} fps, persona en {vistos}")


if __name__ == "__main__":
    main()
