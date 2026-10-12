"""Un jugador de la biblioteca Rocketbox de Microsoft (licencia MIT) montado en el esqueleto del jugador.

Viene de art/blender/jugadora.py del pickleball 0.13 (la jugadora), generalizado para cualquier persona de Rocketbox,
hombre o mujer, y pasado al mango del pádel.

Rocketbox (github.com/microsoft/Microsoft-Rocketbox) trae 115 personas realistas con esqueleto Biped de 3ds Max
(80 huesos, con dedos y cara). El juego usa el esqueleto de Meshy de 24 huesos del jugador (assets/chars/hero.json) y
todas sus animaciones son giros locales de ese esqueleto. Así que la persona se queda con el esqueleto del jugador tal
cual (los mismos nodos, giros de reposo y matrices de enlace) y solo cambia la malla:

  1. se importa el FBX de Rocketbox y se escala a 1,70 m, la altura del modelo del jugador (en el juego se escala a la
     altura de cada uno, como el jugador);
  2. se pone en la pose de reposo del jugador: la cadera, de delante atrás, donde la suya; las rodillas y los tobillos
     donde los del jugador, midiendo la forma del cuerpo y no los huesos (Biped y Meshy ponen las articulaciones en
     sitios distintos); el pie plano en el suelo; el hombro donde gira el brazo del jugador, los brazos en su dirección
     (casi en cruz) y las manos con la palma al frente y el pulgar arriba;
  3. los dedos se cierran con sus propios huesos: la mano de la pala alrededor del mango del pádel (elíptico, donde lo
     ponen PADDLE_POSE de chars.ts y gear.ts), con la palma a ras, y la otra medio cerrada, relajada;
  4. se hornea la pose en la malla y se pesan sus vértices a los huesos del jugador (cada hueso de Biped al suyo: los
     dedos a la mano, la cara a la cabeza);
  5. las tres texturas de Rocketbox (cuerpo, cabeza y pelo con transparencia) van a un atlas en cuadrantes (1024), y
     una máscara dice qué es cada texel (piel, camiseta, pantalón, calzado, pelo u otra cosa) y la transparencia del
     pelo, para que el pintor de equipaciones (src/render/outfit.ts) sepa qué pintar sin adivinarlo por el color. La
     camiseta se deja lisa en el atlas (sin rayas ni estampados: se pinta encima la equipación), con sus pliegues;
  6. se miden en la pose de reposo los bordes de su ropa (las mangas, el bajo de la camiseta y el del pantalón) y van
     en `zones`, para que el pintor ponga los puños y el bajo del pantalón donde acaban los suyos.

Salida: assets/chars/<nombre>.json ({gltf, bin, tex, mask, zones, license}), con el mismo formato que hero.json.

Uso:
  python3 art/blender/persona.py <carpeta Rocketbox del avatar> [salida.json]
  (p. ej. <Rocketbox>/Assets/Avatars/Adults/Male_Adult_01, con Export/ y Textures/). Para verlo: ver_modelo.py.
"""
import base64
import colorsys
import io
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from padel_clip import A, A_INV, node_matrix  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(AQUI, "..", ".."))
ALTURA = 1.70
# la altura de juego para la que se cierra la mano (el mango tiene su tamaño real y el cuerpo se escala: a 1,83 m, la
# de Arturo, el mango mide en el modelo 1,70/1,83 del real; para otro jugador de 1,74 a 1,87 m cambia menos de 1 mm)
ALTURA_JUEGO = float(os.environ.get("ALTURA_JUEGO", "1.83"))
# el lado del atlas que se guarda (texels)
ATLAS = int(os.environ.get("ATLAS", "1024"))

# el mango del pádel (gear.ts): elíptico, de 13,1 mm de radio hacia la cara (x de la pala) y 16,3 mm hacia el canto (z),
# con el cubregrip; de 5 cm bajo el agarre (la contera) a 7 cm sobre él (la garganta), a lo largo de la y de la pala
MANGO_R = (0.0131, 0.0163)
MANGO_DE, MANGO_A = -0.05, 0.07

# hueso de Biped -> hueso del jugador (los que no salen aquí: dedos a la mano, cara a la cabeza)
PESOS = {
    "Bip01 Pelvis": "Hips", "Bip01 Spine": "Spine02", "Bip01 Spine1": "Spine01", "Bip01 Spine2": "Spine",
    "Bip01 Neck": "neck", "Bip01 Head": "Head",
    "Bip01 L Clavicle": "LeftShoulder", "Bip01 L UpperArm": "LeftArm", "Bip01 L Forearm": "LeftForeArm", "Bip01 L Hand": "LeftHand",
    "Bip01 R Clavicle": "RightShoulder", "Bip01 R UpperArm": "RightArm", "Bip01 R Forearm": "RightForeArm", "Bip01 R Hand": "RightHand",
    "Bip01 L Thigh": "LeftUpLeg", "Bip01 L Calf": "LeftLeg", "Bip01 L Foot": "LeftFoot", "Bip01 L Toe0": "LeftToeBase",
    "Bip01 R Thigh": "RightUpLeg", "Bip01 R Calf": "RightLeg", "Bip01 R Foot": "RightFoot", "Bip01 R Toe0": "RightToeBase",
}


def destino(bip):
    if bip in PESOS:
        return PESOS[bip]
    lado = "Left" if " L " in bip else "Right"
    if "Finger" in bip:
        return f"{lado}Hand"
    return "Head"   # cara, ojos, mandíbula


# ---------------------------------------------------------------- el jugador (destino)


class Jugador:
    def __init__(self):
        h = json.load(open(os.path.join(REPO, "assets/chars/hero.json")))
        self.gltf = h["gltf"]
        nodes = self.gltf["nodes"]
        self.names = [n.get("name") for n in nodes]
        self.parent = {}
        for i, n in enumerate(nodes):
            for c in n.get("children", []):
                self.parent[c] = i
        self.joints = [self.names[j] for j in self.gltf["skins"][0]["joints"]]
        self.W = {}
        for i in range(len(nodes)):
            m = node_matrix(nodes[i])
            k = i
            while k in self.parent:
                k = self.parent[k]
                m = node_matrix(nodes[k]) @ m
            self.W[self.names[i]] = A @ m          # en Blender (Z arriba, metros)

    def pos(self, n):
        return self.W[n].to_translation()

    def eje(self, n, k):
        """eje local k (0 x, 1 y, 2 z) del hueso n, en el mundo de Blender"""
        return self.W[n].to_3x3().normalized().col[k].normalized()


def mango(J):
    """El mango en la mano derecha del jugador (PADDLE_POSE: giro (0, 0, -0,9) y (0, 6, 0) en cm del hueso), en el
    mundo de Blender y a la escala del modelo: el punto del agarre, el eje (la y de la pala), la normal de la cara (x),
    el canto (z) y los radios."""
    hand = J.W["RightHand"]
    rot = hand.to_3x3().normalized()
    eu = Matrix.Rotation(-0.9, 3, "Z")
    o = hand @ Vector((0, 6, 0))
    d = (rot @ (eu @ Vector((0, 1, 0)))).normalized()
    nx = (rot @ (eu @ Vector((1, 0, 0)))).normalized()
    ez = (rot @ (eu @ Vector((0, 0, 1)))).normalized()
    s = ALTURA / ALTURA_JUEGO
    return o, d, nx, ez, (MANGO_R[0] * s, MANGO_R[1] * s), (MANGO_DE * s, MANGO_A * s)


def a_mango(q, M):
    """distancia (m, + fuera) de los puntos q (n×3) a la superficie del mango y su posición a lo largo de él"""
    o, d, nx, ez, (r0, r1), _ = M
    rel = q - np.array(o)
    ax = rel @ np.array(d)
    x = rel @ np.array(nx)
    z = rel @ np.array(ez)
    rho = np.hypot(x, z)
    th = np.arctan2(z, x)
    re = 1.0 / np.sqrt((np.cos(th) / r0) ** 2 + (np.sin(th) / r1) ** 2)
    return rho - re, ax


# ---------------------------------------------------------------- la persona (origen)


def importar(carpeta):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fbx = [f for f in os.listdir(os.path.join(carpeta, "Export")) if f.endswith(".fbx") and "facial" not in f][0]
    bpy.ops.import_scene.fbx(filepath=os.path.join(carpeta, "Export", fbx))
    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    me = [o for o in bpy.data.objects if o.type == "MESH"][0]
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    # a 1,70 m: se escala el objeto de la armadura (la malla cuelga de él)
    zs = [(me.matrix_world @ v.co).z for v in me.data.vertices]
    k = ALTURA / (max(zs) - min(zs))
    arm.scale = arm.scale * k
    bpy.context.view_layer.update()
    return arm, me, k


def mundo(arm, pb):
    return arm.matrix_world @ pb.matrix


def poner(arm, pb, M):
    pb.matrix = arm.matrix_world.inverted() @ M
    bpy.context.view_layer.update()


def girar(arm, pb, R, centro=None):
    """gira el hueso (y lo que cuelga de él) con R, en el mundo, alrededor de su cabeza o de `centro`"""
    M = mundo(arm, pb)
    c = M.to_translation() if centro is None else centro
    R4 = R.to_4x4() if len(R) == 3 else R
    T = Matrix.Translation(c) @ R4 @ Matrix.Translation(-c)
    poner(arm, pb, T @ M)


def cabeza(arm, n):
    return mundo(arm, arm.pose.bones[n]).to_translation()


def alinear(arm, hueso, hijo, objetivo):
    """gira `hueso` para que vaya de su cabeza a la de `hijo` en la dirección `objetivo`"""
    pb = arm.pose.bones[hueso]
    d = cabeza(arm, hijo) - cabeza(arm, hueso)
    q = d.normalized().rotation_difference(objetivo.normalized())
    girar(arm, pb, q.to_matrix())


def estirar(arm, hueso, hijo, largo):
    """alarga o acorta `hueso` a lo largo de sí mismo (su x local, que en Biped va hacia el hijo) hasta que su hijo quede
    a `largo` de su cabeza; el hijo no hereda la escala (se queda con su forma) y se lleva al nuevo sitio"""
    for b in arm.data.bones[hijo].children_recursive + [arm.data.bones[hijo]]:
        b.inherit_scale = "NONE"
    pb = arm.pose.bones[hueso]
    M = mundo(arm, pb)
    c = cabeza(arm, hijo) - M.to_translation()
    k = largo / c.length
    hijo_M = mundo(arm, arm.pose.bones[hijo])
    poner(arm, pb, M @ Matrix.Diagonal((k, 1, 1, 1)))
    destino_ = M.to_translation() + c * k
    poner(arm, arm.pose.bones[hijo], Matrix.Translation(destino_ - hijo_M.to_translation()) @ hijo_M)
    print(f"  {hueso}: {c.length * 100:.1f} cm -> {largo * 100:.1f} cm (×{k:.3f})")


def marco_mano(arm, lado):
    """la mano de la persona: u hacia los nudillos, v hacia el pulgar (del meñique al índice), w hacia donde mira la
    palma (la mano derecha: w = v × u; la izquierda, u × v, como en el jugador)"""
    H = cabeza(arm, f"Bip01 {lado} Hand")
    u = (cabeza(arm, f"Bip01 {lado} Finger2") - H).normalized()
    t = cabeza(arm, f"Bip01 {lado} Finger1") - cabeza(arm, f"Bip01 {lado} Finger4")
    v = (t - t.dot(u) * u).normalized()
    w = v.cross(u) if lado == "R" else u.cross(v)
    return u, v, w.normalized()


def marco_mano_jugador(J, lado):
    n = f"{lado}Hand"
    u = J.eje(n, 1)
    w = Vector((0, -1, 0))                       # al frente (+z del glTF)
    w = (w - w.dot(u) * u).normalized()
    v = w.cross(u).normalized()
    if v.z < 0:
        v = -v
    return u, v, w


def base(u, v, w):
    return Matrix((u, v, w)).transposed()        # columnas u, v, w


# ---------------------------------------------------------------- los dedos


def flexionar(arm, cadena, angulos, eje):
    """dobla una cadena de dedo (tres huesos) hacia la palma, todo en el mismo plano"""
    for n, a in zip(cadena, angulos):
        pb = arm.pose.bones[n]
        girar(arm, pb, Matrix.Rotation(math.radians(a), 3, eje))


def puntos_dedo(arm, d, lado):
    base_ = f"Bip01 {lado} Finger{d}"
    P = [cabeza(arm, base_), cabeza(arm, base_ + "1"), cabeza(arm, base_ + "2")]
    pb = arm.pose.bones[base_ + "2"]
    tip = (mundo(arm, pb) @ Vector((0, pb.bone.length, 0)))
    P.append(tip)
    return P


def fk(P, angs, n):
    """las articulaciones de un dedo tras doblarlo (giro en cada una alrededor de n), sin tocar Blender"""
    P = [p.copy() for p in P]
    for j, a in enumerate(angs):
        R = Matrix.Rotation(math.radians(a), 3, n)
        c = P[j]
        for k in range(j + 1, len(P)):
            P[k] = c + R @ (P[k] - c)
    return P


# ---------------------------------------------------------------- todo


def puntos(me):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = me.evaluated_get(dg)
    m = ev.to_mesh()
    mw = me.matrix_world
    P = np.array([tuple(mw @ v.co) for v in m.vertices])
    ev.to_mesh_clear()
    return P


def puntos_jugador():
    h = json.load(open(os.path.join(REPO, "assets/chars/hero.json")))
    g = h["gltf"]
    b = base64.b64decode(h["bin"])
    a = g["accessors"][g["meshes"][0]["primitives"][0]["attributes"]["POSITION"]]
    bv = g["bufferViews"][a["bufferView"]]
    st = bv.get("byteStride", 12)
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    raw = np.frombuffer(b, np.uint8)
    idx = off + np.arange(a["count"])[:, None] * st + np.arange(12)[None, :]
    Pg = raw[idx].copy().view(np.float32).reshape(-1, 3)
    return np.stack([Pg[:, 0], -Pg[:, 2], Pg[:, 1]], 1)      # al espacio de Blender


def centro(P, z, x0=None, x1=None, banda=0.025):
    """el centro (caja) de la sección del cuerpo a la altura z, entre x0 y x1"""
    m = np.abs(P[:, 2] - z) < banda
    if x0 is not None:
        m &= P[:, 0] > x0
    if x1 is not None:
        m &= P[:, 0] < x1
    Q = P[m]
    return Vector(((Q[:, 0].min() + Q[:, 0].max()) / 2, (Q[:, 1].min() + Q[:, 1].max()) / 2, z))


def montar(carpeta, salida):
    J = Jugador()
    H = puntos_jugador()
    arm, me, k = importar(carpeta)
    print(f"escala {k:.4f}")

    # 2. la pose de reposo del jugador. Primero el cuerpo en el sitio: la cadera, de delante atrás, donde la suya
    P = puntos(me)
    dy = centro(H, 0.95, -0.12, 0.12).y - centro(P, 0.95, -0.12, 0.12).y
    arm.location.y += dy
    bpy.context.view_layer.update()
    print(f"cadera {dy * 100:+.1f} cm hacia atrás")
    # las piernas: el centro de la rodilla y el del tobillo donde los del jugador (por la forma, no por los huesos:
    # Biped y Meshy ponen las articulaciones en sitios distintos); el pie, plano como estaba
    for L, s in (("L", 1), ("R", -1)):
        x0, x1 = (0.02, 0.4) if s > 0 else (-0.4, -0.02)
        pie = arm.pose.bones[f"Bip01 {L} Foot"]
        rot_pie = mundo(arm, pie).to_3x3().normalized()
        for hueso, zc in ((f"Bip01 {L} Thigh", 0.5), (f"Bip01 {L} Calf", 0.17)):
            c = cabeza(arm, hueso)
            for _ in range(3):
                P = puntos(me)
                ella = centro(P, zc, x0, x1)
                el = centro(H, zc, x0, x1)
                q = (ella - c).normalized().rotation_difference((el - c).normalized())
                girar(arm, arm.pose.bones[hueso], q.to_matrix())
        ahora = mundo(arm, pie).to_3x3().normalized()
        girar(arm, pie, rot_pie @ ahora.inverted())
    # los pies en el suelo
    P = puntos(me)
    arm.location.z -= P[:, 2].min()
    bpy.context.view_layer.update()
    for L, lado in (("L", "Left"), ("R", "Right")):
        # el hombro donde gira el brazo del jugador (se mueve la parte superior del brazo, la piel del hombro sigue)
        pb = arm.pose.bones[f"Bip01 {L} UpperArm"]
        delta = J.pos(f"{lado}Arm") - cabeza(arm, f"Bip01 {L} UpperArm")
        M = mundo(arm, pb)
        poner(arm, pb, Matrix.Translation(delta) @ M)
        # el brazo y el antebrazo, en la dirección de los del jugador y de su largo: el codo y la muñeca donde los suyos
        # (los de Rocketbox son más largos que los del modelo del jugador, y la pala va en la mano del jugador)
        for hueso, hijo, a, b in ((f"Bip01 {L} UpperArm", f"Bip01 {L} Forearm", f"{lado}Arm", f"{lado}ForeArm"),
                                  (f"Bip01 {L} Forearm", f"Bip01 {L} Hand", f"{lado}ForeArm", f"{lado}Hand")):
            alinear(arm, hueso, hijo, J.pos(b) - J.pos(a))
            estirar(arm, hueso, hijo, (J.pos(b) - J.pos(a)).length)
        # la mano entera: palma al frente, pulgar arriba
        u, v, w = marco_mano(arm, L)
        ut, vt, wt = marco_mano_jugador(J, lado)
        R = base(ut, vt, wt) @ base(u, v, w).transposed()
        girar(arm, arm.pose.bones[f"Bip01 {L} Hand"], R)

    # 3. los dedos
    agarrar(arm, me, J)
    relajar(arm, "L")

    # 4. hornear y pesar
    dg = bpy.context.evaluated_depsgraph_get()
    ev = me.evaluated_get(dg)
    m = ev.to_mesh()
    mw = me.matrix_world.copy()
    P = np.array([tuple(mw @ v.co) for v in m.vertices])
    zmin = P[:, 2].min()
    P[:, 2] -= zmin
    print(f"altura final {P[:, 2].max():.3f} m (suelo a {zmin:+.3f})")
    for zc, x0, x1, nombre in ((0.95, -0.12, 0.12, "cadera"), (0.5, 0.02, 0.4, "rodilla"), (0.17, 0.02, 0.4, "tobillo"), (1.25, -0.15, 0.15, "pecho"), (1.40, -0.06, 0.06, "cuello"), (1.55, -0.1, 0.1, "cabeza")):
        a, b = centro(P, zc, x0, x1), centro(H, zc, x0, x1)
        print(f"  {nombre:8s} persona {a.x:+.3f} {a.y:+.3f}  jugador {b.x:+.3f} {b.y:+.3f}")
    resumen(arm, J, zmin)
    medir_agarre(me, m, P, J, zmin)
    empujar(me, m, P, J, zmin)
    medir_agarre(me, m, P, J, zmin)
    out = exportar(J, me, m, P, carpeta, salida)
    ev.to_mesh_clear()
    return out


def agarrar(arm, me, J):
    """La mano de la pala: la palma a ras del mango y cada dedo doblado hasta rodearlo, el pulgar por encima."""
    M = mango(J)
    o, d, nx, ez, (r0, r1), (a0, a1) = M
    R = (r0 + r1) / 2
    medio = 0.009                                   # medio dedo: las articulaciones van a esta distancia del mango
    u, v, w = marco_mano(arm, "R")
    # la mano, a ras del mango: se mueve (poco, en el plano que corta el mango) hasta que la palma lo toca sin que el
    # mango la atraviese
    gi = me.vertex_groups["Bip01 R Hand"].index
    sel = [v_.index for v_ in me.data.vertices if any(g.group == gi and g.weight > 0.6 for g in v_.groups)]
    Pm = puntos(me)[sel]
    e1 = (w - w.dot(d) * d).normalized()
    e2 = d.cross(e1).normalized()
    best = None
    for a in np.arange(-0.045, 0.0451, 0.0025):
        for b in np.arange(-0.045, 0.0451, 0.0025):
            t = e1 * float(a) + e2 * float(b)
            q = Pm + np.array(t)
            dist, ax = a_mango(q, M)
            dentro = (ax > a0) & (ax < a1)
            if not dentro.any():
                continue
            pen = np.clip(0.001 - dist[dentro], 0, None)
            contacto = dist[dentro].min() ** 2
            coste = (pen ** 2).sum() * 50 + contacto * 20 + 0.02 * (a * a + b * b)
            if best is None or coste < best[0]:
                best = (coste, t, dist[dentro].min())
    print(f"mano a ras del mango: {best[1].length * 100:.1f} cm ({best[1].dot(e1) * 100:+.1f} hacia la palma, {best[1].dot(e2) * 100:+.1f} de lado; la palma a {best[2] * 1000:+.1f} mm de la superficie)")
    pb = arm.pose.bones["Bip01 R Hand"]
    poner(arm, pb, Matrix.Translation(best[1]) @ mundo(arm, pb))

    def coste_dedo(Q):
        c = 0.0
        for q in Q:
            dist, _ = a_mango(np.array([tuple(q)]), M)
            r = float(dist[0]) - medio
            c += r * r * (4 if r < 0 else 1)
        return c

    for f in (1, 2, 3, 4):
        P = puntos_dedo(arm, f, "R")
        fd = (P[1] - P[0]).normalized()
        n = fd.cross(w).normalized()
        best = None
        for a1_ in range(0, 95, 5):
            for a2_ in range(0, 105, 5):
                a3_ = min(90, a2_ * 0.7)
                c = coste_dedo(fk(P, (a1_, a2_, a3_), n)[1:])
                if best is None or c < best[0]:
                    best = (c, a1_, a2_, a3_)
        print(f"dedo {f}: {best[1]}°, {best[2]}°, {best[3]:.0f}°")
        flexionar(arm, [f"Bip01 R Finger{f}", f"Bip01 R Finger{f}1", f"Bip01 R Finger{f}2"], best[1:], n)
    # el pulgar: se cierra por encima del mango, hacia el índice
    P = puntos_dedo(arm, 0, "R")
    best = None
    for a in range(0, 75, 5):
        for b in range(-30, 65, 5):
            Ro = Matrix.Rotation(math.radians(a), 3, u)
            Q = [P[0] + Ro @ (q - P[0]) for q in P]
            td = (Q[1] - Q[0]).normalized()
            nt = td.cross(w).normalized()
            Q = fk(Q, (0, b, b * 0.8), nt)
            c = coste_dedo(Q[2:])
            if best is None or c < best[0]:
                best = (c, a, b)
    print(f"pulgar: {best[1]}°, {best[2]}°")
    girar(arm, arm.pose.bones["Bip01 R Finger0"], Matrix.Rotation(math.radians(best[1]), 3, u))
    P = puntos_dedo(arm, 0, "R")
    nt = (P[1] - P[0]).normalized().cross(w).normalized()
    flexionar(arm, ["Bip01 R Finger01", "Bip01 R Finger02"], (best[2], best[2] * 0.8), nt)


def relajar(arm, L):
    """La mano libre medio cerrada: cada dedo algo más que el anterior."""
    u, v, w = marco_mano(arm, L)
    for f, angs in ((1, (14, 24, 12)), (2, (18, 28, 14)), (3, (22, 32, 16)), (4, (26, 36, 18))):
        P = puntos_dedo(arm, f, L)
        n = (P[1] - P[0]).normalized().cross(w).normalized()
        flexionar(arm, [f"Bip01 {L} Finger{f}", f"Bip01 {L} Finger{f}1", f"Bip01 {L} Finger{f}2"], angs, n)


def medir_agarre(me, m, P, J, zmin):
    """Cómo queda la mano en el mango: cuánta piel de la mano lo atraviesa (y cuánto) y a qué distancia queda la palma."""
    M = mango(J)
    M = (M[0] - Vector((0, 0, zmin)),) + M[1:]
    _, _, _, _, _, (a0, a1) = M
    mano = np.linalg.norm(P - np.array(M[0]), axis=1) < 0.09
    dist, ax = a_mango(P[mano], M)
    en = (ax > a0) & (ax < a1)
    dentro = en & (dist < -0.001)
    print(f"agarre: {mano.sum()} vértices de la mano y la muñeca; {dentro.sum()} dentro del mango (lo más hondo {-(dist[en].min()) * 1000:.1f} mm); "
          f"mediana de la piel más cercana {np.median(np.sort(dist[en])[:40]) * 1000:+.1f} mm")


def empujar(me, m, P, J, zmin, holgura=0.0008):
    """La piel de la mano (y la muñeca) que aún queda dentro del mango, a su superficie (y un poco más), y el empuje repartido por la
    piel de alrededor (unas vueltas de media con los vecinos), como shapeHands en body.ts. Cambia P."""
    M = mango(J)
    M = (M[0] - Vector((0, 0, zmin)),) + M[1:]
    o, d, nx, ez, (r0, r1), (a0, a1) = M
    # (la piel de la mano y la de la muñeca: todo lo que queda a menos de 9 cm del agarre)
    ids = np.nonzero(np.linalg.norm(P - np.array(o), axis=1) < 0.09)[0]
    pos_ = {int(i): k for k, i in enumerate(ids)}
    vec = [[] for _ in ids]
    for e in m.edges:
        a, b = e.vertices
        if a in pos_ and b in pos_:
            vec[pos_[a]].append(pos_[b])
            vec[pos_[b]].append(pos_[a])
    D = np.zeros((len(ids), 3))
    for _ in range(4):
        Q = P[ids] + D
        dist, ax = a_mango(Q, M)
        en = (ax > a0 - 0.005) & (ax < a1 + 0.005) & (dist < holgura)
        if not en.any():
            break
        rel = Q - np.array(o)
        radial = rel - (rel @ np.array(d))[:, None] * np.array(d)[None, :]
        rn = radial / np.maximum(1e-6, np.linalg.norm(radial, axis=1))[:, None]
        need = D.copy()
        need[en] += rn[en] * (holgura - dist[en])[:, None]
        cur = need.copy()
        for _ in range(6):
            nxt = cur.copy()
            for k, vs in enumerate(vec):
                if vs and not en[k]:
                    nxt[k] = 0.5 * cur[k] + 0.5 * np.mean(cur[vs], 0)
            nxt[en] = need[en]
            cur = nxt
        D = cur
    P[ids] += D
    print(f"empuje: {int((np.linalg.norm(D, axis=1) > 1e-4).sum())} vértices, hasta {np.linalg.norm(D, axis=1).max() * 1000:.1f} mm")


def resumen(arm, J, zmin):
    pares = [("Bip01 Pelvis", "Hips"), ("Bip01 Neck", "neck"), ("Bip01 Head", "Head"),
             ("Bip01 L UpperArm", "LeftArm"), ("Bip01 L Forearm", "LeftForeArm"), ("Bip01 L Hand", "LeftHand"),
             ("Bip01 R Hand", "RightHand"), ("Bip01 L Thigh", "LeftUpLeg"), ("Bip01 L Calf", "LeftLeg"), ("Bip01 L Foot", "LeftFoot")]
    for b, h in pares:
        p = cabeza(arm, b) - Vector((0, 0, zmin))
        q = J.pos(h)
        print(f"  {h:12s} persona {p.x:+.3f} {p.y:+.3f} {p.z:.3f}  jugador {q.x:+.3f} {q.y:+.3f} {q.z:.3f}  ({(p - q).length * 100:.1f} cm)")


# ---------------------------------------------------------------- el atlas, la máscara y el glTF

# cuadrantes del atlas (u0, v0) en el sentido del glTF (v hacia abajo), cada uno de 0,5
CUADRANTE = {"body": (0.0, 0.0), "head": (0.5, 0.0), "opacity": (0.0, 0.5)}
# clases de la máscara (canal R × 40)
PIEL, CAMISETA, PANTALON, CALZADO, PELO, OTRO = 0, 1, 2, 3, 4, 5


def textura(carpeta, mat):
    tdir = os.path.join(carpeta, "Textures")
    pref = [f for f in os.listdir(tdir) if f.endswith("_color.tga") and f.split("_")[1] == mat.split("_")[1]]
    return os.path.join(tdir, pref[0])


def exportar(J, me, m, P, carpeta, salida):
    from PIL import Image

    m.calc_loop_triangles()
    uvl = m.uv_layers[0].data
    mats = [s.name for s in me.data.materials]
    tipo = [next(k for k in CUADRANTE if mt.endswith(k)) for mt in mats]
    # los pesos: grupos de Biped -> articulación del jugador
    gnames = [g.name for g in me.vertex_groups]
    jidx = {n: i for i, n in enumerate(J.joints)}
    VJ = np.zeros((len(m.vertices), 4), np.uint8)
    VW = np.zeros((len(m.vertices), 4), np.float32)
    for v in m.vertices:
        acc = {}
        for g in v.groups:
            if g.weight <= 0:
                continue
            j = jidx[destino(gnames[g.group])]
            acc[j] = acc.get(j, 0) + g.weight
        top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
        s = sum(w for _, w in top) or 1
        for i, (j, w) in enumerate(top):
            VJ[v.index, i] = j
            VW[v.index, i] = w / s
    # normales por esquina (las de la malla horneada)
    try:
        cn = [tuple(c.vector) for c in m.corner_normals]
    except AttributeError:
        m.calc_normals_split()
        cn = [tuple(l.normal) for l in m.loops]
    # vértices del glTF: uno por (vértice, uv, normal)
    clave = {}
    pos, nor, uv, jj, ww, idx = [], [], [], [], [], []
    for tri in m.loop_triangles:
        t = tipo[tri.material_index]
        u0, v0 = CUADRANTE[t]
        for li in tri.loops:
            vi = m.loops[li].vertex_index
            uu, vv = uvl[li].uv
            U = (u0 + 0.5 * uu, v0 + 0.5 * (1 - vv))
            n = cn[li]
            key = (vi, round(U[0], 5), round(U[1], 5), round(n[0], 3), round(n[1], 3), round(n[2], 3))
            if key not in clave:
                clave[key] = len(pos)
                p = Vector(P[vi])
                g = A_INV @ p
                pos.append((g.x, g.y, g.z))
                nn = (A_INV.to_3x3() @ Vector(n)).normalized()
                nor.append((nn.x, nn.y, nn.z))
                uv.append(U)
                jj.append(tuple(int(x) for x in VJ[vi]))
                ww.append(tuple(float(x) for x in VW[vi]))
            idx.append(clave[key])
    pos = np.array(pos, np.float32)
    print(f"glTF: {len(pos)} vértices, {len(idx) // 3} triángulos; alto {pos[:, 1].max():.3f} m")

    # el atlas (2048) y la máscara (1024)
    S = 2048
    atlas = Image.new("RGB", (S, S), (128, 110, 100))
    alfa = Image.new("L", (S, S), 255)
    for t, mt in zip(tipo, mats):
        img = Image.open(textura(carpeta, mt))
        u0, v0 = CUADRANTE[t]
        box = (int(u0 * S), int(v0 * S))
        im = img.convert("RGBA").resize((S // 2, S // 2), Image.LANCZOS)
        atlas.paste(im.convert("RGB"), box)
        if t == "opacity":
            alfa.paste(im.split()[3], box)
    cls, zonas = clasificar(atlas, m, tipo, uvl, P, S)
    atlas = alisar(atlas, cls)
    M = 1024
    a = np.asarray(alfa.resize((M, M), Image.BILINEAR))
    mask = Image.merge("RGB", (cls.resize((M, M), Image.NEAREST), Image.fromarray(a), Image.new("L", (M, M), 0)))
    # glTF: el del jugador con esta malla
    g = json.loads(json.dumps(J.gltf))
    prim = g["meshes"][0]["primitives"][0]
    acc = g["accessors"]
    bv = g["bufferViews"]
    blob = bytearray(base64.b64decode(json.load(open(os.path.join(REPO, "assets/chars/hero.json")))["bin"]))
    ibm_acc = acc[g["skins"][0]["inverseBindMatrices"]]
    ibm_bv = bv[ibm_acc["bufferView"]]
    ibm = bytes(blob[ibm_bv.get("byteOffset", 0): ibm_bv.get("byteOffset", 0) + ibm_bv["byteLength"]])
    out = bytearray()

    def vista_(data, target=None):
        while len(out) % 4:
            out.append(0)
        off = len(out)
        out.extend(data)
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            v["target"] = target
        return v

    nbv = [vista_(ibm)]
    nacc = [dict(ibm_acc, bufferView=0, byteOffset=0)]

    def accesor(arr, ctype, typ, target, mm=False, norm=False):
        nbv.append(vista_(arr.tobytes(), target))
        a = {"bufferView": len(nbv) - 1, "componentType": ctype, "count": int(arr.shape[0]), "type": typ}
        if mm:
            a["min"] = [float(x) for x in arr.min(0)]
            a["max"] = [float(x) for x in arr.max(0)]
        if norm:
            a["normalized"] = True
        nacc.append(a)
        return len(nacc) - 1

    I = np.array(idx, np.uint16 if len(pos) < 65536 else np.uint32)
    prim["indices"] = accesor(I, 5123 if I.dtype == np.uint16 else 5125, "SCALAR", 34963)
    prim["attributes"] = {
        "POSITION": accesor(pos, 5126, "VEC3", 34962, mm=True),
        "NORMAL": accesor(np.array(nor, np.float32), 5126, "VEC3", 34962),
        "TEXCOORD_0": accesor(np.array(uv, np.float32), 5126, "VEC2", 34962),
        "JOINTS_0": accesor(np.array(jj, np.uint8), 5121, "VEC4", 34962),
        "WEIGHTS_0": accesor(np.array(ww, np.float32), 5126, "VEC4", 34962),
    }
    nombre = os.path.splitext(os.path.basename(salida))[0]
    avatar = os.path.basename(os.path.normpath(carpeta))
    g["accessors"] = nacc
    g["bufferViews"] = nbv
    g["buffers"] = [{"byteLength": len(out)}]
    g["materials"] = [{"name": nombre, "pbrMetallicRoughness": {"roughnessFactor": 0.85, "metallicFactor": 0}}]
    g["meshes"][0]["name"] = nombre
    g["asset"] = {"version": "2.0", "generator": f"art/blender/persona.py (Rocketbox {avatar}, MIT)"}

    def data_url(img, fmt, **kw):
        b = io.BytesIO()
        img.save(b, fmt, **kw)
        return f"data:image/{fmt.lower()};base64," + base64.b64encode(b.getvalue()).decode()

    # (el atlas se guarda a 1024, como la máscara: el pintor pinta las equipaciones a 1024 y con 2048 solo se gastaría
    # memoria; se compone a 2048 para que la máscara y el alisado salgan finos)
    atlas = atlas.resize((ATLAS, ATLAS), Image.LANCZOS)
    res = {
        "gltf": g,
        "bin": base64.b64encode(bytes(out)).decode(),
        "tex": data_url(atlas, "WEBP", quality=82, method=6),
        "mask": data_url(mask, "WEBP", lossless=True, method=6),
        "zones": zonas,
        "license": f"Microsoft Rocketbox Avatar Library ({avatar}), MIT License, Copyright (c) 2020 Microsoft",
    }
    with open(salida, "w") as f:
        json.dump(res, f, separators=(",", ":"))
    print(f"{salida}: {os.path.getsize(salida) / 1024:.0f} KB (textura {len(res['tex']) * 3 / 4 / 1024:.0f} KB, máscara {len(res['mask']) * 3 / 4 / 1024:.0f} KB)")
    print("zonas", zonas)
    tmp = f"/tmp/pb-{nombre}"
    atlas.save(tmp + "-atlas.jpg", quality=85)
    paleta = np.array([(230, 180, 150), (40, 120, 230), (240, 200, 40), (60, 60, 60), (150, 60, 20), (255, 0, 255)], np.uint8)
    Image.fromarray(paleta[np.clip(np.asarray(mask)[..., 0] // 40, 0, 5)]).save(tmp + "-mask.png")
    return res


def es_piel(r, g, b):
    """¿parece piel este color (0…1)? tono anaranjado (no el caqui ni el blanco roto de la ropa), algo saturado (en HSV:
    en HLS un blanco cálido sale saturado) y ni muy claro ni muy oscuro"""
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    h *= 360
    return (h < 36 or h > 345) and 0.17 < s < 0.62 and 0.42 < v < 0.97


# puntos de muestra de un triángulo (baricéntricas)
BARI = [(1 / 3, 1 / 3, 1 / 3), (0.6, 0.2, 0.2), (0.2, 0.6, 0.2), (0.2, 0.2, 0.6), (0.45, 0.45, 0.1), (0.1, 0.45, 0.45), (0.45, 0.1, 0.45),
        (0.8, 0.1, 0.1), (0.1, 0.8, 0.1), (0.1, 0.1, 0.8)]


def clasificar(atlas, m, tipo, uvl, P, S):
    """La máscara: qué es cada texel (a 2048, como el atlas) y los bordes de la ropa.

    Por triángulo, con unas cuantas muestras del atlas dentro de él: si la mayoría parece piel, es piel; si no, por
    dónde está en el cuerpo: los pies son calzado; arriba (pecho, mangas) camiseta; abajo (muslos) pantalón; y lo que
    queda en medio (la cintura), lo que más se parezca en color a la camiseta o al pantalón. El pelo pintado en la
    cabeza, por texel (oscuro y en la parte del cuero cabelludo), y todo el material del pelo."""
    from PIL import Image, ImageDraw
    A_ = np.asarray(atlas).astype(np.float32) / 255
    tris = []
    for tri in m.loop_triangles:
        t = tipo[tri.material_index]
        u0, v0 = CUADRANTE[t]
        pts = []
        for li in tri.loops:
            uu, vv = uvl[li].uv
            pts.append(((u0 + 0.5 * uu) * S, (v0 + 0.5 * (1 - vv)) * S))
        vs = [m.loops[li].vertex_index for li in tri.loops]
        z = float(np.mean([P[i][2] for i in vs]))
        x = float(np.mean([abs(P[i][0]) for i in vs]))
        cols = []
        for bc in BARI:
            u_ = sum(b * p[0] for b, p in zip(bc, pts))
            v_ = sum(b * p[1] for b, p in zip(bc, pts))
            cols.append(A_[int(min(S - 1, max(0, v_))), int(min(S - 1, max(0, u_)))])
        cols = np.array(cols)
        piel = np.mean([es_piel(*c) for c in cols])
        tris.append((t, pts, vs, z, x, piel, cols.mean(0)))
    c_tri = []
    for t, pts, vs, z, x, piel, col in tris:
        if t == "opacity":
            c = PELO
        elif t == "head":
            c = PIEL
        elif z > 1.3 and x < 0.2:
            c = CAMISETA            # el cuello y la cara van en la textura de la cabeza: aquí, el cuello de la camiseta
        elif piel > 0.5:
            c = PIEL
        elif z < 0.13:
            c = CALZADO
        elif z > 1.1:
            c = CAMISETA
        elif z < 0.72:
            c = PANTALON
        else:
            c = -1                  # la cintura: se decide por el color
        c_tri.append(c)
    media = {c: np.mean([tr[6] for tr, k in zip(tris, c_tri) if k == c], 0) for c in (CAMISETA, PANTALON)}
    for i, (tr, c) in enumerate(zip(tris, c_tri)):
        if c == -1:
            col = tr[6]
            c_tri[i] = min((CAMISETA, PANTALON), key=lambda k: float(((col - media[k]) ** 2).sum()))
    cls = Image.new("L", (S, S), OTRO * 40)
    dr = ImageDraw.Draw(cls)
    z_tex = Image.new("L", (S, S), 0)          # la altura de cada texel (cm), para el pelo
    dz = ImageDraw.Draw(z_tex)
    for (t, pts, vs, z, x, piel, col), c in zip(tris, c_tri):
        dr.polygon(pts, fill=c * 40)
        dz.polygon(pts, fill=int(min(255, max(0, z * 100 - 50))))
    # el pelo pintado en la cabeza: oscuro, en el cuero cabelludo (por encima de las cejas: los ojos y la boca, más
    # abajo en el atlas, no)
    arr = np.asarray(cls).copy()
    zt = (np.asarray(z_tex).astype(np.float32) + 50) / 100
    mx = A_.max(2)
    mn = A_.min(2)
    l = (mx + mn) / 2
    cab = np.zeros((S, S), bool)
    cab[: int(S * 0.5 * 0.62), S // 2:] = True
    pelo = cab & (l < 0.36) & (arr == PIEL * 40) & (zt > 1.45)
    arr[pelo] = PELO * 40
    op = np.zeros((S, S), bool)
    op[S // 2:, : S // 2] = True
    arr[op & (arr == OTRO * 40)] = PELO * 40

    # los bordes de la ropa en la pose de reposo (metros, glTF: y arriba, x a la izquierda del jugador)
    V = {c: set() for c in (CAMISETA, PANTALON, CALZADO)}
    for (t, pts, vs, z, x, piel, col), c in zip(tris, c_tri):
        if c in V:
            V[c].update(vs)
    cam = P[sorted(V[CAMISETA])]
    pan = P[sorted(V[PANTALON])]
    cal = P[sorted(V[CALZADO])]
    brazo = cam[cam[:, 2] > 1.2]
    zonas = {
        # hasta dónde llegan las mangas (|x|), el bajo de la camiseta, el del pantalón (por dentro y por fuera de la
        # pierna) y lo alto del calzado
        "cuff": round(float(np.percentile(np.abs(brazo[:, 0]), 99.5)), 4),
        "hem": round(float(np.percentile(cam[:, 2], 0.5)), 4),
        "shortsHem": round(float(np.percentile(pan[:, 2], 0.5)), 4),
        "shoeTop": round(float(np.percentile(cal[:, 2], 99)), 4),
    }
    return Image.fromarray(arr), zonas


def alisar(atlas, cls):
    """La camiseta lisa: sin sus rayas ni estampados (encima se pinta la equipación), con sus pliegues y sombras.

    Un cierre en gris (máximo y luego mínimo de la luminancia, más ancho que una raya) borra las rayas oscuras, y un
    desenfoque suave las claras que queden; fuera de la camiseta no se toca nada."""
    from PIL import Image, ImageFilter
    A_ = np.asarray(atlas).astype(np.float32)
    C = np.asarray(cls)
    cam = C == CAMISETA * 40
    Y = A_ @ np.array([0.299, 0.587, 0.114], np.float32)
    med = float(np.median(Y[cam])) if cam.any() else 200.0
    alto = float(np.percentile(Y[cam], 85)) if cam.any() else 220.0
    Yf = np.where(cam, Y, alto).astype(np.uint8)
    im = Image.fromarray(Yf)
    k = int(os.environ.get("RAYA", "15"))
    im = im.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k)).filter(ImageFilter.GaussianBlur(2))
    Yc = np.asarray(im).astype(np.float32)
    out = A_.copy()
    for c in range(3):
        out[..., c] = np.where(cam, Yc, A_[..., c])
    print(f"camiseta lisa: luminancia mediana {med:.0f}, alta {alto:.0f}, cierre de {k} texels")
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


if __name__ == "__main__":
    args = sys.argv[1:]
    carpeta = args[0]
    salida = args[1] if len(args) > 1 else os.path.join(REPO, "assets/chars", "rb_" + os.path.basename(os.path.normpath(carpeta)).lower().replace("_adult_", "") + ".json")
    montar(carpeta, salida)
