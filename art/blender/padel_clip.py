"""Clips de captura de movimiento para los jugadores del pádel, en el formato del juego (viene del pickleball 0.13).

El juego guarda el jugador en assets/chars/hero.json ({gltf, bin, tex}) y cada animación en
assets/anims/<clip>.json ({name, duration, tracks: [{n: "Hueso.quaternion", t: [...], v: [...]}]}),
con los giros locales de cada nodo tal como están en el glTF original (Y arriba, cm).

Este módulo:
  - rehace el GLB del jugador a partir de hero.json y lo importa en Blender;
  - convierte entre una pose de Blender y los giros locales del glTF original (ida y vuelta),
    sin depender de cómo reoriente los huesos el importador de Blender;
  - pasa un BVH de CMU al jugador (retarget.py), lo deja en el sitio y lo convierte en un ciclo
    que se repite sin saltos.

Uso:
  python3 art/blender/padel_clip.py <carpeta_del_build> validar
  python3 art/blender/padel_clip.py <carpeta_del_build> ciclo <bvh> <salida.json> [nombre] [frente]
  python3 art/blender/padel_clip.py <carpeta_del_build> tramo <bvh|fbx> <salida.json> <nombre> <desde> <hasta> <fps> [frente]
  python3 art/blender/padel_clip.py <carpeta_del_build> video <puntos.json> <salida.json> <nombre> [desde hasta] [frente]
      (puntos.json de tools/video_pose.py; desde/hasta y frente en fotogramas del vídeo, desde 0)
  python3 art/blender/padel_clip.py <carpeta_del_build> comparar <clip_bueno.json> <clip.json>
      (error de dirección por hueso entre dos clips del jugador, con el mejor giro alrededor de la vertical)
"""
import base64
import json
import math
import os
import struct
import sys

import bpy  # noqa: E402
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retarget import MAPA_CMU, MAPA_MIXAMO, import_bvh, import_fbx, retarget  # noqa: E402

A = Matrix.Rotation(math.radians(90), 4, "X")   # glTF (Y arriba) -> Blender (Z arriba)
A_INV = A.inverted()


# ---------------------------------------------------------------- jugador


def hero_glb(build, out_path):
    h = json.load(open(os.path.join(build, "assets/chars/hero.json")))
    gltf = h["gltf"]
    binary = base64.b64decode(h["bin"])
    gltf["buffers"] = [{"byteLength": len(binary)}]
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    binary += b"\0" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(out_path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(binary), 0x004E4942) + binary)
    tex = h.get("tex", "")
    tex_path = None
    if tex.startswith("data:image/"):
        ext = tex.split(";")[0].split("/")[1]
        tex_path = out_path.rsplit(".", 1)[0] + "." + ext
        with open(tex_path, "wb") as f:
            f.write(base64.b64decode(tex.split(",", 1)[1]))
    return gltf, tex_path


def node_matrix(n):
    t = Vector(n.get("translation", [0, 0, 0]))
    r = n.get("rotation", [0, 0, 0, 1])
    s = n.get("scale", [1, 1, 1])
    q = Quaternion((r[3], r[0], r[1], r[2]))
    return Matrix.Translation(t) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((*s, 1.0))


class Esqueleto:
    """Relación entre los nodos del glTF original y los huesos que crea Blender."""

    def __init__(self, gltf, arm):
        self.arm = arm
        nodes = gltf["nodes"]
        self.names = [n.get("name") for n in nodes]
        self.parent = {}
        for i, n in enumerate(nodes):
            for c in n.get("children", []):
                self.parent[c] = i
        self.local_rest = [node_matrix(n) for n in nodes]
        self.world_rest = {}
        for i in range(len(nodes)):
            self.world_rest[i] = self._world_rest(i)
        joints = gltf["skins"][0]["joints"]
        self.joints = [self.names[j] for j in joints]
        self.idx = {self.names[j]: j for j in joints}
        # corrección por hueso: B = (A @ W) @ C   (B, matriz de Blender; W, la del glTF)
        self.C = {}
        for name in self.joints:
            b = arm.data.bones[name]
            B = arm.matrix_world @ b.matrix_local
            W = A @ self.world_rest[self.idx[name]]
            self.C[name] = W.inverted() @ B
        hips = self.idx["Hips"]
        self.hips_parent_world = self.world_rest[self.parent[hips]]   # nodo «Armature» (escala 0,01)

    def _world_rest(self, i):
        m = self.local_rest[i]
        while i in self.parent:
            i = self.parent[i]
            m = self.local_rest[i] @ m
        return m

    def depth_order(self):
        def d(n):
            k, i = 0, self.idx[n]
            while i in self.parent and self.names[self.parent[i]] in self.idx:
                i, k = self.parent[i], k + 1
            return k
        return sorted(self.joints, key=d)

    # Blender (pose actual) -> giros locales del glTF
    def to_gltf_local(self):
        W = {}
        out = {}
        for name in self.depth_order():
            pb = self.arm.pose.bones[name]
            B = self.arm.matrix_world @ pb.matrix
            W[name] = A_INV @ B @ self.C[name].inverted()
            p = self.parent[self.idx[name]]
            pw = W[self.names[p]] if self.names[p] in W else self.world_rest[p]
            loc = pw.inverted() @ W[name]
            out[name] = loc
        return out

    # giros locales del glTF -> pose de Blender
    def from_gltf_local(self, local):
        W = {}
        for name in self.depth_order():
            i = self.idx[name]
            p = self.parent[i]
            pw = W[self.names[p]] if self.names[p] in W else self.world_rest[p]
            W[name] = pw @ local.get(name, self.local_rest[i])
            B = A @ W[name] @ self.C[name]
            pb = self.arm.pose.bones[name]
            pb.matrix = self.arm.matrix_world.inverted() @ B
            bpy.context.view_layer.update()


def load_hero(build, work):
    os.makedirs(work, exist_ok=True)
    glb = os.path.join(work, "hero.glb")
    gltf, tex = hero_glb(build, glb)
    bpy.ops.import_scene.gltf(filepath=glb)
    arm = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"][0]
    arm.rotation_mode = "XYZ"
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    if tex:
        img = bpy.data.images.load(tex)
        for o in arm.children:
            for slot in getattr(o, "material_slots", []):
                m = slot.material
                m.use_nodes = True
                nt = m.node_tree
                bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
                t = nt.nodes.new("ShaderNodeTexImage")
                t.image = img
                nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    return arm, Esqueleto(gltf, arm)


# ---------------------------------------------------------------- clips del juego


def read_clip(path):
    c = json.load(open(path))
    frames = {}
    for tr in c["tracks"]:
        bone, prop = tr["n"].rsplit(".", 1)
        size = 4 if prop == "quaternion" else 3
        for k, t in enumerate(tr["t"]):
            v = tr["v"][k * size:(k + 1) * size]
            frames.setdefault(round(t, 4), {}).setdefault(bone, {})[prop] = v
    return c, frames


def local_from_values(esq, vals):
    out = {}
    for name, props in vals.items():
        if name not in esq.idx:
            continue
        rest = esq.local_rest[esq.idx[name]]
        t = Vector(props["position"]) if "position" in props else rest.to_translation()
        if "quaternion" in props:
            x, y, z, w = props["quaternion"]
            q = Quaternion((w, x, y, z))
        else:
            q = rest.to_quaternion()
        out[name] = Matrix.Translation(t) @ q.to_matrix().to_4x4()
    return out


def write_clip(name, frames_local, fps, path, order_like=None):
    """frames_local: lista de dicts {hueso: Matrix local glTF}, uno por fotograma."""
    n = len(frames_local)
    times = [round(i / fps, 4) for i in range(n)]
    names = order_like or list(frames_local[0].keys())
    tracks = []
    for bone in names:
        vals, prev = [], None
        for fr in frames_local:
            q = fr[bone].to_quaternion().normalized()
            if prev is not None and prev.dot(q) < 0:
                q.negate()
            prev = q
            vals += [round(q.x, 4), round(q.y, 4), round(q.z, 4), round(q.w, 4)]
        tracks.append({"n": f"{bone}.quaternion", "t": times, "v": vals})
    vals = []
    for fr in frames_local:
        t = fr["Hips"].to_translation()
        vals += [round(t.x, 3), round(t.y, 3), round(t.z, 3)]
    # el juego pone la posición de la cadera antes que su giro
    tracks.insert(len(tracks) - 1 if names[-1] == "Hips" else len(tracks),
                  {"n": "Hips.position", "t": times, "v": vals})
    clip = {"name": name, "duration": times[-1], "tracks": tracks}
    with open(path, "w") as f:
        json.dump(clip, f, separators=(",", ":"))
    return clip


def bisagras_destino(esq, build, clips=("run_v2", "drive", "backhand", "walk", "ready", "lunge", "smash", "serve")):
    """Eje natural del codo y la rodilla del jugador, medido en los clips de Meshy del propio juego,
    expresado en el mundo de Blender con el personaje en reposo."""
    from retarget import CADENAS, eje_medio
    muestras = {h: [] for h in CADENAS}
    for c in clips:
        p = os.path.join(build, "assets/anims", c + ".json")
        if not os.path.exists(p):
            continue
        _, frames = read_clip(p)
        for t in frames:
            for hijo in CADENAS:
                v = frames[t].get(hijo, {}).get("quaternion")
                if not v:
                    continue
                x, y, z, w = v
                q = Quaternion((w, x, y, z))
                rest = esq.local_rest[esq.idx[hijo]].to_quaternion()
                muestras[hijo].append(q @ rest.inverted())     # giro en el marco del hueso de arriba
    out = {}
    for hijo, (padre, _) in CADENAS.items():
        e = eje_medio(muestras[hijo])
        if e is None:
            continue
        r = (A @ esq.world_rest[esq.idx[padre]]).to_3x3().normalized().to_quaternion()
        out[hijo] = r @ e
    return out


# ---------------------------------------------------------------- ciclo de carrera


def pose_vec(esq):
    """Descriptor de la pose para buscar el ciclo: giros locales de piernas y brazos."""
    loc = esq.to_gltf_local()
    v = []
    for n in ("LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg", "LeftArm", "RightArm", "LeftFoot", "RightFoot"):
        q = loc[n].to_quaternion()
        if q.w < 0:
            q.negate()
        v += [q.w, q.x, q.y, q.z]
    return v, loc


def make_cycle(esq, action, fps=30, min_len=14, max_len=34, fade=4):
    scn = bpy.context.scene
    n = int(action["fotogramas"])
    vecs, locs = [], []
    for f in range(1, n + 1):
        scn.frame_set(f)
        v, loc = pose_vec(esq)
        vecs.append(v)
        locs.append(loc)
    best = None
    for i in range(int(n * 0.2), n - min_len):
        for j in range(i + min_len, min(n, i + max_len + 1)):
            d = sum((a - b) ** 2 for a, b in zip(vecs[i], vecs[j]))
            if best is None or d < best[0]:
                best = (d, i, j)
    _, i0, j0 = best
    frames = [dict(fr) for fr in locs[i0:j0 + 1]]
    # cadera en el sitio, como los clips de Meshy: se quita el avance y se deja la cadera sobre su
    # sitio de reposo; se conservan el bote (y) y un balanceo pequeño alrededor de ese sitio
    rest = esq.local_rest[esq.idx["Hips"]].to_translation()
    p0 = frames[0]["Hips"].to_translation()
    p1 = frames[-1]["Hips"].to_translation()
    det = []
    for k, fr in enumerate(frames):
        a = k / (len(frames) - 1)
        det.append(fr["Hips"].to_translation() - p0.lerp(p1, a))
    mx = sum(d.x for d in det) / len(det)
    mz = sum(d.z for d in det) / len(det)
    for fr, d in zip(frames, det):
        t = fr["Hips"].to_translation()
        t = Vector((rest.x + d.x - mx, t.y, rest.z + d.z - mz))
        r = fr["Hips"].to_quaternion()
        fr["Hips"] = Matrix.Translation(t) @ r.to_matrix().to_4x4()
    # costura: los últimos fotogramas se funden hacia el primero para que el bucle no salte
    first = frames[0]
    last_i = len(frames) - 1
    for k in range(fade + 1):
        idx = last_i - fade + k
        a = k / fade
        fr = frames[idx]
        for bone in fr:
            qa = fr[bone].to_quaternion()
            qb = first[bone].to_quaternion()
            q = qa.slerp(qb, a)
            ta = fr[bone].to_translation()
            tb = first[bone].to_translation()
            fr[bone] = Matrix.Translation(ta.lerp(tb, a)) @ q.to_matrix().to_4x4()
    return frames, i0, j0, best[0]


def main():
    build = sys.argv[1]
    mode = sys.argv[2]
    work = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "padel")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    arm, esq = load_hero(build, work)
    if mode == "validar":
        # ida y vuelta con un clip original del juego: debe salir igual
        clip, frames = read_clip(os.path.join(build, "assets/anims/run_v2.json"))
        worst = 0.0
        for t in sorted(frames)[::7]:
            local_in = local_from_values(esq, frames[t])
            esq.from_gltf_local(local_in)
            local_out = esq.to_gltf_local()
            for b, m in local_in.items():
                ang = m.to_quaternion().rotation_difference(local_out[b].to_quaternion()).angle
                worst = max(worst, min(ang, 2 * math.pi - ang))
        print(f"VALIDAR ida y vuelta: error máximo {math.degrees(worst):.4f} grados")
        return
    if mode == "ver":
        ver(esq, arm, sys.argv[3], sys.argv[4], float(sys.argv[5]) if len(sys.argv) > 5 else 0.1,
            float(sys.argv[6]) if len(sys.argv) > 6 else None)
        return
    if mode == "tramo":
        a = sys.argv
        tramo(build, esq, arm, a[3], a[4], a[5], int(a[6]), int(a[7]), float(a[8]), int(a[9]) if len(a) > 9 else None)
        return
    if mode == "video":
        a = sys.argv
        desde = int(a[6]) if len(a) > 6 else None
        hasta = int(a[7]) if len(a) > 7 else None
        frente = int(a[8]) if len(a) > 8 else None
        video(build, esq, arm, a[3], a[4], a[5], desde, hasta, frente)
        return
    if mode == "comparar":
        comparar(esq, arm, sys.argv[3], sys.argv[4])
        return
    if mode == "ciclo":
        bvh, out = sys.argv[3], sys.argv[4]
        name = sys.argv[5] if len(sys.argv) > 5 else "run_v2"
        frente = int(sys.argv[6]) if len(sys.argv) > 6 else None
        src = import_bvh(bvh)
        bis = bisagras_destino(esq, build)
        act = retarget(src, arm, name, bisagras_destino=bis, frente=frente)
        scn = bpy.context.scene
        scn.frame_set(1)
        h0 = src.matrix_world @ src.pose.bones["Hips"].head
        scn.frame_set(int(src.animation_data.action.frame_range[1]))
        h1 = src.matrix_world @ src.pose.bones["Hips"].head
        dur = (src.animation_data.action.frame_range[1] - 2) / 120
        print(f"VELOCIDAD de la fuente ≈ {((h1 - h0) * 0.0534).length / dur:.2f} m/s (escala aproximada)")
        bpy.data.objects.remove(src)
        frames, i0, j0, err = make_cycle(esq, act, min_len=int(os.environ.get("CICLO_MIN", 14)), max_len=int(os.environ.get("CICLO_MAX", 34)))
        order = [t["n"].rsplit(".", 1)[0] for t in json.load(open(os.path.join(build, "assets/anims/run_v2.json")))["tracks"]
                 if t["n"].endswith(".quaternion")]
        clip = write_clip(name, frames, 30, out, order_like=order)
        print(f"CICLO {name}: fotogramas {i0}-{j0} del clip, {len(frames)} claves, {clip['duration']:.3f} s, "
              f"diferencia de pose en la costura {err:.4f}")


def tramo(build, esq, arm, path, out, name, f0, f1, fps_src, frente=None):
    """un tramo de una toma (un golpe, una celebración) en el sitio, como los clips del juego"""
    if path.lower().endswith(".fbx"):
        src, mapa = import_fbx(path), MAPA_MIXAMO
    else:
        src, mapa = import_bvh(path), MAPA_CMU
    bis = bisagras_destino(esq, build)
    act = retarget(src, arm, name, inicio=f0, fin=f1, fps_fuente=fps_src, mapa=mapa, pose_t=1,
                   bisagras_destino=bis, frente=frente)
    scn = bpy.context.scene
    rest = esq.local_rest[esq.idx["Hips"]].to_translation()
    frames = []
    for f in range(1, int(act["fotogramas"]) + 1):
        scn.frame_set(f)
        fr = esq.to_gltf_local()
        t = fr["Hips"].to_translation()
        r = fr["Hips"].to_quaternion()
        # (en el sitio: la cadera sobre su sitio de reposo, solo sube y baja; los pies los planta el juego)
        fr["Hips"] = Matrix.Translation(Vector((rest.x, t.y, rest.z))) @ r.to_matrix().to_4x4()
        frames.append(fr)
    order = [t["n"].rsplit(".", 1)[0] for t in json.load(open(os.path.join(build, "assets/anims/run_v2.json")))["tracks"]
             if t["n"].endswith(".quaternion")]
    clip = write_clip(name, frames, 30, out, order_like=order)
    print(f"TRAMO {name}: fotogramas {f0}-{f1} a {fps_src:g} fps -> {len(frames)} claves, {clip['duration']:.2f} s")


def video(build, esq, arm, path, out, name, desde=None, hasta=None, frente=None):
    """un gesto grabado con el móvil (los puntos de tools/video_pose.py), en el sitio, como los clips del juego"""
    from video_fuente import construir, enderezar, profundidad, puntos, suelo
    datos = json.load(open(path))
    fps = float(datos["fps"])
    n = len(datos["frames"])
    desde = 0 if desde is None else desde
    hasta = n - 1 if hasta is None else min(hasta, n - 1)
    P = puntos(datos)
    if os.environ.get("PROFUNDIDAD"):
        # (probado con vídeos sintéticos: arregla la rodilla en la derecha y la empeora en la estirada; no compensa
        # de momento, ver docs/notas-13.md)
        P = profundidad(datos, P)
    tilt = 0.0
    if os.environ.get("VERTICAL"):
        # (solo si el móvil estaba inclinado: endereza con la postura del principio, que tiene que ser de pie y recta)
        P, tilt = enderezar(P, fps, desde)
    P = suelo(P)
    print(f"VIDEO {os.path.basename(path)}: {n} fotogramas a {fps:.2f} fps; vertical corregida {tilt:.1f}°")
    src = construir(P, fps, arm)
    bis = bisagras_destino(esq, build)
    act = retarget(src, arm, name, inicio=desde + 1, fin=hasta + 1, fps_fuente=fps, mapa=MAPA_MIXAMO, pose_t=None,
                   bisagras_destino=bis, frente=(frente if frente is not None else desde) + 1)
    scn = bpy.context.scene
    rest = esq.local_rest[esq.idx["Hips"]].to_translation()
    frames = []
    for f in range(1, int(act["fotogramas"]) + 1):
        scn.frame_set(f)
        fr = esq.to_gltf_local()
        t = fr["Hips"].to_translation()
        r = fr["Hips"].to_quaternion()
        fr["Hips"] = Matrix.Translation(Vector((rest.x, t.y, rest.z))) @ r.to_matrix().to_4x4()
        frames.append(fr)
    order = [t["n"].rsplit(".", 1)[0] for t in json.load(open(os.path.join(build, "assets/anims/run_v2.json")))["tracks"]
             if t["n"].endswith(".quaternion")]
    clip = write_clip(name, frames, 30, out, order_like=order)
    print(f"VIDEO {name}: fotogramas {desde}-{hasta} -> {len(frames)} claves, {clip['duration']:.2f} s")


HUESOS_CMP = [("LeftArm", "LeftForeArm"), ("LeftForeArm", "LeftHand"), ("RightArm", "RightForeArm"),
              ("RightForeArm", "RightHand"), ("LeftUpLeg", "LeftLeg"), ("LeftLeg", "LeftFoot"),
              ("RightUpLeg", "RightLeg"), ("RightLeg", "RightFoot"), ("Spine02", "neck"), ("neck", "Head")]


def _direcciones(esq, arm, frames, times):
    out = []
    for t in times:
        esq.from_gltf_local(local_from_values(esq, frames[t]))
        bpy.context.view_layer.update()
        d = {}
        for a, b in HUESOS_CMP:
            pa = arm.matrix_world @ arm.pose.bones[a].head
            pb = arm.matrix_world @ arm.pose.bones[b].head
            d[a + ">" + b] = (pb - pa).normalized()
        out.append(d)
    return out


def comparar(esq, arm, bueno, otro):
    """error de dirección de cada hueso (grados), fotograma a fotograma, con el mejor giro alrededor de la vertical"""
    _, fa = read_clip(bueno)
    _, fb = read_clip(otro)
    ta, tb = sorted(fa), sorted(fb)
    n = min(len(ta), len(tb))
    da = _direcciones(esq, arm, fa, ta[:n])
    db = _direcciones(esq, arm, fb, tb[:n])
    best = None
    for yaw in range(-180, 180, 2):
        R = Matrix.Rotation(math.radians(yaw), 3, "Z")
        e = 0.0
        for x, y in zip(da, db):
            for k in x:
                e += (R @ y[k]).angle(x[k])
        if best is None or e < best[0]:
            best = (e, yaw)
    R = Matrix.Rotation(math.radians(best[1]), 3, "Z")
    print(f"COMPARAR {os.path.basename(otro)} con {os.path.basename(bueno)}: {n} fotogramas, giro {best[1]}°")
    todos = []
    for k in da[0]:
        errs = sorted(math.degrees((R @ y[k]).angle(x[k])) for x, y in zip(da, db))
        todos += errs
        print(f"  {k:24s} mediana {errs[len(errs) // 2]:5.1f}°  p90 {errs[int(len(errs) * 0.9)]:5.1f}°")
    todos.sort()
    print(f"  {'todos':24s} mediana {todos[len(todos) // 2]:5.1f}°  p90 {todos[int(len(todos) * 0.9)]:5.1f}°")


def ver(esq, arm, path, out, cada=0.1, marca=None):
    """una hoja con el clip puesto en el jugador, de frente y de lado, cada `cada` s (para mirarlo antes de
    meterlo en el juego); `marca`: un tiempo que se enmarca (el contacto)"""
    from PIL import Image, ImageDraw
    clip, frames = read_clip(path)
    times = sorted(frames)
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_WORKBENCH"
    scn.display.shading.light = "STUDIO"
    scn.display.shading.color_type = "TEXTURE"
    scn.render.resolution_x, scn.render.resolution_y = 220, 300
    scn.render.film_transparent = False
    scn.world = bpy.data.worlds.new("w")
    cams = []
    for nombre, loc in (("frente", (0, -4.2, 1.0)), ("lado", (-4.2, 0, 1.0))):
        cd = bpy.data.cameras.new(nombre)
        cd.lens = 50
        c = bpy.data.objects.new(nombre, cd)
        scn.collection.objects.link(c)
        c.location = loc
        c.rotation_euler = (Vector((0, 0, 0.95)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cams.append(c)
    # el suelo
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    want, t = [], 0.0
    while t <= clip["duration"] + 1e-6:
        want.append(min(times, key=lambda x: abs(x - t)))
        t += cada
    tiles = []
    tmp = f"/tmp/padel-ver-{os.getpid()}.png"
    for t in want:
        esq.from_gltf_local(local_from_values(esq, frames[t]))
        bpy.context.view_layer.update()
        row = []
        for c in cams:
            scn.camera = c
            scn.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            row.append(Image.open(tmp).convert("RGB").copy())
        tiles.append((t, row))
    W, H = 220, 300
    sheet = Image.new("RGB", (W * len(tiles), H * 2 + 18), "white")
    d = ImageDraw.Draw(sheet)
    for i, (t, row) in enumerate(tiles):
        for j, im in enumerate(row):
            sheet.paste(im, (i * W, 18 + j * H))
        d.text((i * W + 6, 3), f"{t:.2f} s", fill="black")
        if marca is not None and abs(t - marca) <= cada / 2:
            d.rectangle([i * W, 0, i * W + W - 1, sheet.height - 1], outline="red", width=3)
    sheet.save(out)
    print(f"HOJA {out}: {len(tiles)} fotogramas")


if __name__ == "__main__":
    main()
