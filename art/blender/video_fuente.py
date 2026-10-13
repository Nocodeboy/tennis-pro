"""De los puntos de MediaPipe (tools/video_pose.py) a un esqueleto animado con nombres de Mixamo, para pasarlo al
jugador con retarget.py como cualquier captura (pickleball_clip.py, modo «video»).

MediaPipe da 33 puntos en metros con el origen entre las caderas. Aquí:
  1. se rellenan los fotogramas sin persona y se suavizan (gaussiana de `suave` s);
  2. se pasan a Blender (Z arriba) y se endereza la vertical con la postura del principio (de la cadera al punto medio
     de los tobillos), por si el móvil no estaba recto;
  3. la cadera se pone a su altura sobre el suelo (el pie más bajo de cada fotograma);
  4. se construye un esqueleto en T con las medidas medianas de la persona y, en cada fotograma, cada hueso se
     orienta por sus puntos: su eje Y hacia la articulación siguiente y su giro por una segunda dirección (la línea
     de las caderas, la de los hombros, el plano del codo o de la rodilla, la línea índice–meñique de la mano). Cuando
     el codo o la rodilla están estirados su plano no está definido y se arrastra el del fotograma anterior.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

I = {n: k for k, n in enumerate(
    ["nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer",
     "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder", "right_shoulder", "left_elbow",
     "right_elbow", "left_wrist", "right_wrist", "left_pinky", "right_pinky", "left_index", "right_index",
     "left_thumb", "right_thumb", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
     "left_heel", "right_heel", "left_foot_index", "right_foot_index"])}
M = "mixamorig:"


def puntos(datos, suave=0.05):
    """(n, 33, 3) en Blender, metros; la cadera en el origen"""
    fr = datos["frames"]
    n = len(fr)
    P = np.full((n, 33, 3), np.nan)
    for k, f in enumerate(fr):
        if f:
            w = np.array(f["w"], float)
            P[k] = np.stack([w[:, 0], w[:, 2], -w[:, 1]], 1)     # x, z (lejos de la cámara), −y
    # huecos: lo más cercano que haya
    ok = ~np.isnan(P[:, 0, 0])
    if not ok.any():
        raise ValueError("ningún fotograma con persona")
    idx = np.arange(n)
    for j in range(33):
        for c in range(3):
            P[:, j, c] = np.interp(idx, idx[ok], P[ok, j, c])
    # suavizado gaussiano en el tiempo
    s = max(0.5, suave * datos["fps"])
    r = int(3 * s)
    ker = np.exp(-0.5 * (np.arange(-r, r + 1) / s) ** 2)
    ker /= ker.sum()
    Pp = np.pad(P, ((r, r), (0, 0), (0, 0)), mode="edge")
    Q = np.zeros_like(P)
    for i, kv in enumerate(ker):
        Q += kv * Pp[i:i + n]
    return Q


# el árbol del cuerpo para rehacer la profundidad: (padre, hijo); «cad» y «hom» son el punto medio de las caderas y el de
# los hombros
ARBOL = [("cad", "left_hip"), ("cad", "right_hip"), ("cad", "hom"), ("hom", "left_shoulder"), ("hom", "right_shoulder"),
         ("hom", "nose"), ("nose", "left_ear"), ("nose", "right_ear")]
for _l in ("left", "right"):
    ARBOL += [(_l + "_hip", _l + "_knee"), (_l + "_knee", _l + "_ankle"), (_l + "_ankle", _l + "_heel"),
              (_l + "_ankle", _l + "_foot_index"), (_l + "_shoulder", _l + "_elbow"), (_l + "_elbow", _l + "_wrist"),
              (_l + "_wrist", _l + "_index"), (_l + "_wrist", _l + "_pinky"), (_l + "_wrist", _l + "_thumb")]
# los huesos largos que dan la escala de la imagen (el menos escorzado de cada fotograma)
ESCALA = [("cad", "hom"), ("left_shoulder", "right_shoulder"), ("left_hip", "left_knee"), ("right_hip", "right_knee"),
          ("left_knee", "left_ankle"), ("right_knee", "right_ankle"), ("left_shoulder", "left_elbow"),
          ("right_shoulder", "right_elbow"), ("left_elbow", "left_wrist"), ("right_elbow", "right_wrist")]


def profundidad(datos, P):
    """Rehace la profundidad con la imagen (Taylor, 2000): la profundidad de MediaPipe se queda corta (las rodillas
    y los codos salen menos doblados de lo que están), pero sus puntos en la imagen son buenos. Cada hueso mide lo
    que mide (su largo, el percentil 90 de MediaPipe en toda la toma); lo que no se ve de él en la imagen es lo que
    se va hacia delante o hacia atrás, y hacia dónde lo dice MediaPipe. La escala de la imagen, por fotograma, es la
    del hueso largo menos escorzado."""
    fr = datos["frames"]
    W_, H_ = datos["size"]
    n = len(P)
    def pt(arr, nm):
        if nm == "cad":
            return (arr[..., I["left_hip"], :] + arr[..., I["right_hip"], :]) / 2
        if nm == "hom":
            return (arr[..., I["left_shoulder"], :] + arr[..., I["right_shoulder"], :]) / 2
        return arr[..., I[nm], :]
    # los puntos en la imagen, en píxeles (x a la derecha, z arriba), con huecos rellenos y suavizados como P
    Q = np.full((n, 33, 2), np.nan)
    for k, f in enumerate(fr):
        if f:
            im = np.array(f["i"], float)
            Q[k] = np.stack([im[:, 0] * W_, -im[:, 1] * H_], 1)
    ok = ~np.isnan(Q[:, 0, 0])
    idx = np.arange(n)
    for j in range(33):
        for c in range(2):
            Q[:, j, c] = np.interp(idx, idx[ok], Q[ok, j, c])
    s_ = max(0.5, 0.05 * datos["fps"])
    r = int(3 * s_)
    ker = np.exp(-0.5 * (np.arange(-r, r + 1) / s_) ** 2)
    ker /= ker.sum()
    Qp = np.pad(Q, ((r, r), (0, 0), (0, 0)), mode="edge")
    Q2 = np.zeros_like(Q)
    for i, kv in enumerate(ker):
        Q2 += kv * Qp[i:i + n]
    Q = Q2
    largo = {(a, b): float(np.percentile(np.linalg.norm(pt(P, b) - pt(P, a), axis=1), 90)) for a, b in ARBOL}
    largo.update({(a, b): float(np.percentile(np.linalg.norm(pt(P, b) - pt(P, a), axis=1), 90)) for a, b in ESCALA})
    # escala (píxeles por metro) por fotograma: el percentil 80 de los cocientes, suavizada
    esc = np.array([np.percentile([np.linalg.norm(pt(Q[k], b) - pt(Q[k], a)) / largo[(a, b)] for a, b in ESCALA], 80)
                    for k in range(n)])
    e2 = np.convolve(np.pad(esc, (r, r), mode="edge"), ker, mode="valid")
    out = np.zeros_like(P)
    # (TRONCO=delante: el tronco y el cuello solo se inclinan hacia el pecho, nunca hacia la espalda. Con la cámara de
    # frente, MediaPipe cambia a veces de signo la profundidad de los hombros respecto a la cadera y el jugador sale
    # echado hacia atrás mirando al cielo; en los golpes de fondo y las voleas el tronco va siempre hacia delante.
    # El pecho se mira con la línea de los hombros y la nariz, que va delante de ella.)
    tronco_delante = os.environ.get("TRONCO") == "delante"
    for k in range(n):
        s = e2[k]
        pos = {"cad": np.zeros(3)}
        frente = None
        if tronco_delante:
            hl = P[k, I["left_shoulder"]] - P[k, I["right_shoulder"]]
            f = np.array([-hl[1], hl[0], 0.0])                          # horizontal, perpendicular a los hombros
            nariz = P[k, I["nose"]] - pt(P[k], "hom")
            if np.dot(f[:2], nariz[:2]) < 0:
                f = -f
            nf = np.linalg.norm(f)
            frente = f / nf if nf > 1e-6 else None
        for a, b in ARBOL:
            d2 = (pt(Q[k], b) - pt(Q[k], a)) / s                       # metros, en la imagen
            L = largo[(a, b)]
            dz_mp = pt(P[k], b)[1] - pt(P[k], a)[1]                     # profundidad según MediaPipe (Y de Blender)
            resto = L * L - d2[0] ** 2 - d2[1] ** 2
            dz = math.copysign(math.sqrt(resto), dz_mp) if resto > 0 else 0.0
            # (si MediaPipe lo ve casi de frente, su profundidad manda: el signo ahí es poco fiable)
            if abs(dz_mp) < 0.25 * abs(dz):
                dz = dz_mp
            if frente is not None and (a, b) in (("cad", "hom"), ("hom", "nose")):
                # de los dos signos, el que echa el hueso hacia el pecho
                if d2[0] * frente[0] + dz * frente[1] < d2[0] * frente[0] - dz * frente[1]:
                    dz = -dz
            pos[b] = pos[a] + np.array([d2[0], dz, d2[1]])
        for nm, j in I.items():
            if nm in pos:
                out[k, j] = pos[nm]
            else:
                out[k, j] = P[k, j] - pt(P[k], "cad")                   # (los puntos que no están en el árbol)
    return out


def enderezar(P, fps, desde=0):
    """gira todo para que la cadera quede encima del punto medio de los tobillos al principio de la toma"""
    a = desde
    b = min(len(P), a + max(3, int(0.5 * fps)))
    hip = (P[a:b, I["left_hip"]] + P[a:b, I["right_hip"]]) / 2
    ank = (P[a:b, I["left_ankle"]] + P[a:b, I["right_ankle"]]) / 2
    up = Vector((hip - ank).mean(0)).normalized()
    q = up.rotation_difference(Vector((0, 0, 1)))
    R = np.array(q.to_matrix())
    return P @ R.T, math.degrees(q.angle)


def suelo(P):
    """la cadera sobre el suelo: el punto de pie más bajo de cada fotograma (suavizado) es el suelo"""
    pies = [I[n] for n in ("left_heel", "right_heel", "left_foot_index", "right_foot_index", "left_ankle", "right_ankle")]
    z = P[:, pies, 2].min(1)
    # (el pie apoyado no baja de su sitio: se suaviza poco, para no perder un salto)
    P = P.copy()
    P[:, :, 2] -= z[:, None]
    return P


def _n(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v


def articulaciones(P):
    """las cabezas de los huesos de la fuente, por fotograma: {hueso: (n, 3)}"""
    g = lambda n: P[:, I[n]]
    hip = (g("left_hip") + g("right_hip")) / 2
    sh = (g("left_shoulder") + g("right_shoulder")) / 2
    ear = (g("left_ear") + g("right_ear")) / 2
    J = {
        "Hips": hip,
        "Spine": hip + 0.12 * (sh - hip),
        "Spine1": hip + 0.42 * (sh - hip),
        "Spine2": hip + 0.72 * (sh - hip),
        "Neck": sh + 0.05 * (ear - sh),
        "Head": sh + 0.55 * (ear - sh),
        "HeadTop_End": ear + 0.6 * (ear - sh),
    }
    for L, l in (("Left", "left"), ("Right", "right")):
        J[L + "Shoulder"] = sh + 0.25 * (g(l + "_shoulder") - sh)
        J[L + "Arm"] = g(l + "_shoulder")
        J[L + "ForeArm"] = g(l + "_elbow")
        J[L + "Hand"] = g(l + "_wrist")
        J[L + "HandMiddle1"] = (g(l + "_index") + g(l + "_pinky")) / 2
        J[L + "UpLeg"] = g(l + "_hip")
        J[L + "Leg"] = g(l + "_knee")
        J[L + "Foot"] = g(l + "_ankle")
        J[L + "ToeBase"] = g(l + "_foot_index")
        J[L + "Toe_End"] = g(l + "_foot_index") + 0.3 * (g(l + "_foot_index") - g(l + "_heel"))
    return J


# hueso -> (padre, hijo cuya cabeza marca su dirección)
HUESOS = {
    "Hips": (None, "Spine"), "Spine": ("Hips", "Spine1"), "Spine1": ("Spine", "Spine2"), "Spine2": ("Spine1", "Neck"),
    "Neck": ("Spine2", "Head"), "Head": ("Neck", "HeadTop_End"),
}
for _L in ("Left", "Right"):
    HUESOS.update({
        _L + "Shoulder": ("Spine2", _L + "Arm"), _L + "Arm": (_L + "Shoulder", _L + "ForeArm"),
        _L + "ForeArm": (_L + "Arm", _L + "Hand"), _L + "Hand": (_L + "ForeArm", _L + "HandMiddle1"),
        _L + "HandMiddle1": (_L + "Hand", None),
        _L + "UpLeg": ("Hips", _L + "Leg"), _L + "Leg": (_L + "UpLeg", _L + "Foot"),
        _L + "Foot": (_L + "Leg", _L + "ToeBase"), _L + "ToeBase": (_L + "Foot", _L + "Toe_End"),
    })


# hueso de la fuente -> (hueso del jugador, el suyo siguiente o "@y": su propio eje): la pose de reposo de la fuente
# es la del jugador (sus direcciones) con las medidas de la persona, así que una dirección de la persona pasa tal cual
REPOSO = {"Hips": ("Hips", "Spine02"), "Spine": ("Spine02", "Spine01"), "Spine1": ("Spine01", "Spine"),
          "Spine2": ("Spine", "neck"), "Neck": ("neck", "Head"), "Head": ("Head", "@y")}
for _L in ("Left", "Right"):
    REPOSO.update({_L + "Shoulder": (_L + "Shoulder", _L + "Arm"), _L + "Arm": (_L + "Arm", _L + "ForeArm"),
                   _L + "ForeArm": (_L + "ForeArm", _L + "Hand"), _L + "Hand": (_L + "Hand", "@y"),
                   _L + "HandMiddle1": (_L + "Hand", "@y"),
                   _L + "UpLeg": (_L + "UpLeg", _L + "Leg"), _L + "Leg": (_L + "Leg", _L + "Foot"),
                   _L + "Foot": (_L + "Foot", _L + "ToeBase"), _L + "ToeBase": (_L + "ToeBase", "@y")})


def construir(P, fps, jugador, nombre="fuente_video"):
    """El esqueleto de la fuente: en reposo, en la pose de reposo del jugador (`jugador`: su armadura en Blender) con
    las medidas de la persona; animado con sus puntos."""
    J = articulaciones(P)
    n = len(P)
    med = lambda a, b: float(np.median(np.linalg.norm(J[a] - J[b], axis=1)))
    mw = jugador.matrix_world
    jb = jugador.data.bones
    pos = lambda b: mw @ jb[b].head_local

    def dir_rep(b):
        h, c = REPOSO[b]
        if c == "@y":
            return ((mw.to_3x3() @ jb[h].matrix_local.to_3x3()).col[1]).normalized()
        return (pos(c) - pos(h)).normalized()

    T = {"Hips": Vector((0, 0, float(np.median(J["Hips"][:, 2]))))}
    for a, b in (("Hips", "Spine"), ("Spine", "Spine1"), ("Spine1", "Spine2"), ("Spine2", "Neck"), ("Neck", "Head"),
                 ("Head", "HeadTop_End")):
        T[b] = T[a] + dir_rep(a) * med(a, b)
    for L in ("Left", "Right"):
        off = (pos(L + "Shoulder") - pos("Spine")).normalized()
        T[L + "Shoulder"] = T["Spine2"] + off * med("Spine2", L + "Shoulder")
        for a, b in (("Shoulder", "Arm"), ("Arm", "ForeArm"), ("ForeArm", "Hand"), ("Hand", "HandMiddle1")):
            T[L + b] = T[L + a] + dir_rep(L + a) * med(L + a, L + b)
        off = (pos(L + "UpLeg") - pos("Hips")).normalized()
        T[L + "UpLeg"] = T["Hips"] + off * med("Hips", L + "UpLeg")
        for a, b in (("UpLeg", "Leg"), ("Leg", "Foot"), ("Foot", "ToeBase"), ("ToeBase", "Toe_End")):
            T[L + b] = T[L + a] + dir_rep(L + a) * med(L + a, L + b)
    # segundas direcciones en la pose en T (las mismas que se miden en cada fotograma)
    ref_T = {}
    # cadera y tronco: la línea de las caderas / de los hombros hacia la izquierda (+X)
    for b in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"):
        ref_T[b] = Vector((1, 0, 0))
    for L, s in (("Left", 1), ("Right", -1)):
        ref_T[L + "Shoulder"] = Vector((0, -1, 0))                # al frente
        ref_T[L + "Arm"] = Vector((0, 0, -s))                      # plano del codo (se dobla hacia delante)
        ref_T[L + "ForeArm"] = Vector((0, 0, -s))
        ref_T[L + "Hand"] = Vector((0, 0, 1))                      # índice − meñique: pulgar arriba, palma al frente
        ref_T[L + "HandMiddle1"] = Vector((0, 0, 1))
        ref_T[L + "UpLeg"] = Vector((1, 0, 0))                     # plano de la rodilla
        ref_T[L + "Leg"] = Vector((1, 0, 0))
        ref_T[L + "Foot"] = Vector((1, 0, 0))
        ref_T[L + "ToeBase"] = Vector((1, 0, 0))

    # la armadura
    ad = bpy.data.armatures.new(nombre)
    ob = bpy.data.objects.new(nombre, ad)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for b, (p, c) in HUESOS.items():
        e = ad.edit_bones.new(M + b)
        e.head = T[b]
        tail = T[c] if c else T[b] + (T[b] - T[p]).normalized() * 0.04
        if (tail - T[b]).length < 1e-4:
            tail = T[b] + Vector((0, 0, 0.05))
        e.tail = tail
        # el giro del hueso en reposo: su X sobre la segunda dirección
        y = (tail - T[b]).normalized()
        x = ref_T[b] - ref_T[b].dot(y) * y
        if x.length < 1e-6:
            x = Vector((0, -1, 0)) - Vector((0, -1, 0)).dot(y) * y
        e.align_roll(x.normalized().cross(y))     # align_roll fija el eje Z del hueso
        eb[b] = e
    for b, (p, c) in HUESOS.items():
        if p:
            eb[b].parent = eb[p]
            eb[b].use_connect = False
    bpy.ops.object.mode_set(mode="POSE")
    for pb in ob.pose.bones:
        pb.rotation_mode = "QUATERNION"
    rest = {b.name[len(M):]: (ob.matrix_world @ b.matrix_local) for b in ob.data.bones}
    rest_dir = {b: rest[b].to_3x3().col[1].normalized() for b in rest}

    # en cada fotograma
    g = lambda nm, k: Vector(P[k, I[nm]])
    planos = {}
    orden = sorted(HUESOS, key=lambda b: _prof(b))
    ob.animation_data_create()
    ob.animation_data.action = bpy.data.actions.new(nombre)
    mano_firme = os.environ.get("MANO") == "firme"
    for k in range(n):
        hl, hr = g("left_hip", k), g("right_hip", k)
        sl, sr = g("left_shoulder", k), g("right_shoulder", k)
        el, er = g("left_ear", k), g("right_ear", k)
        cad = (hl - hr).normalized()
        hom = (sl - sr).normalized()
        cab = (el - er).normalized()
        ref = {"Hips": cad, "Spine": cad.slerp(hom, 0.3), "Spine1": cad.slerp(hom, 0.6), "Spine2": hom,
               "Neck": hom.slerp(cab, 0.5), "Head": cab}
        tronco = (Vector(J["Spine2"][k]) - Vector(J["Spine1"][k])).normalized()
        delante = hom.cross(Vector(J["Neck"][k]) - Vector(J["Hips"][k])).normalized()   # el frente del pecho
        for L, l in (("Left", "left"), ("Right", "right")):
            ref[L + "Shoulder"] = delante
            # el plano del codo y de la rodilla: n = (de arriba) × (de abajo), como en la pose en T (el codo se dobla
            # hacia la palma, la rodilla hacia atrás); estirados, se arrastra el del fotograma anterior
            for sup, inf_, a_, b_, c_ in ((L + "Arm", L + "ForeArm", l + "_shoulder", l + "_elbow", l + "_wrist"),
                                          (L + "UpLeg", L + "Leg", l + "_hip", l + "_knee", l + "_ankle")):
                u = g(b_, k) - g(a_, k)
                v = g(c_, k) - g(b_, k)
                nrm = u.cross(v)
                ang = u.angle(v) if u.length > 1e-6 and v.length > 1e-6 else 0.0
                prev = planos.get(sup)
                if ang > math.radians(20) and nrm.length > 1e-9:
                    planos[sup] = nrm.normalized()
                elif prev is not None:
                    planos[sup] = prev
                else:
                    # sin plano todavía: el de la pose en T llevado con el hueso (o la línea de las caderas)
                    if sup.endswith("UpLeg"):
                        planos[sup] = cad.copy()
                    else:
                        t0 = (T[inf_] - T[sup]).normalized()
                        planos[sup] = t0.rotation_difference(u.normalized()) @ ref_T[sup]
                ref[sup] = planos[sup]
                ref[inf_] = planos[sup]
            ref[L + "Hand"] = (g(l + "_index", k) - g(l + "_pinky", k)).normalized()
            ref[L + "HandMiddle1"] = ref[L + "Hand"]
            ref[L + "Foot"] = ref[L + "Leg"]
            ref[L + "ToeBase"] = ref[L + "Leg"]
        for b in orden:
            p, c = HUESOS[b]
            head = Vector(J[b][k])
            if mano_firme and b.endswith(("Hand", "HandMiddle1")):
                # (MANO=firme: la mano sigue al antebrazo, la muñeca recta, girada con el plano del codo. Los puntos de
                # los dedos de MediaPipe con la mano borrosa de un golpe dan vueltas de un fotograma a otro, y con ellos
                # la raqueta)
                L = "Left" if b.startswith("Left") else "Right"
                y = head - Vector(J[L + "ForeArm"][k]) if b.endswith("Hand") else Vector(J[L + "Hand"][k]) - Vector(J[L + "ForeArm"][k])
                y = y.normalized() if y.length > 1e-6 else Vector((0, 0, 1))
                if L + "Arm" in planos:
                    ref[b] = planos[L + "Arm"] * (1 if L == "Right" else -1)   # (en T: el del codo es (0, 0, −s), el de la mano (0, 0, 1))
            elif b in ("Neck", "Head"):
                # (las orejas de MediaPipe no sirven para inclinar la cabeza: el cuello sigue al tronco, como en
                # reposo, y la cabeza solo gira con la línea de las orejas)
                y = rest_dir[b].copy()
                y.rotate(rest_dir["Spine1"].rotation_difference(tronco))
            elif c:
                y = Vector(J[c][k]) - head
            else:
                y = head - Vector(J[p][k])
            y = y.normalized() if y.length > 1e-6 else Vector((0, 0, 1))
            x = ref[b] - ref[b].dot(y) * y
            x = x.normalized() if x.length > 1e-6 else (ref_T[b] - ref_T[b].dot(y) * y).normalized()
            z = x.cross(y)
            R = Matrix((x, y, z)).transposed()
            # el giro de reposo del hueso lleva su X a la segunda dirección en T: el giro de ahora es el mismo
            # marco (x, y, z) respecto al de reposo
            R0 = rest[b].to_3x3().normalized()
            x0, y0 = R0.col[0], R0.col[1]
            rx = ref_T[b] - ref_T[b].dot(y0) * y0
            rx = rx.normalized() if rx.length > 1e-6 else x0
            B0 = Matrix((rx, y0, rx.cross(y0))).transposed()
            Rw = R @ B0.inverted() @ R0
            Mw = Matrix.Translation(head) @ Rw.to_4x4()
            pb = ob.pose.bones[M + b]
            pb.matrix = ob.matrix_world.inverted() @ Mw
            bpy.context.view_layer.update()
            pb.keyframe_insert("rotation_quaternion", frame=k + 1)
            pb.keyframe_insert("location", frame=k + 1)
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def _prof(b):
    n = 0
    while HUESOS[b][0]:
        b = HUESOS[b][0]
        n += 1
    return n
