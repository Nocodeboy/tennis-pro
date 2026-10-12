"""Un jugador hecho con IA (una imagen y TRELLIS 2 en MimicPC) montado en el esqueleto del jugador.

Es el método de persona.py (Rocketbox), pero para una malla sin esqueleto: TRELLIS 2 da una sola malla con una sola
textura, en la pose de la imagen. La imagen se genera ya en la pose de reposo del jugador (casi en cruz, las palmas al
frente y el pulgar arriba; docs/notas-05-trellis.md), así que aquí solo se corrige lo que se desvíe:

  1. se importa el GLB, se gira para que mire al frente (los dedos de los pies hacia −y) y se escala a 1,70 m;
  2. se pone en la pose de reposo del jugador con un esqueleto provisional medido en la propia malla (cadera, rodillas,
     tobillos, hombros, codos y muñecas): la cadera de delante atrás donde la suya; cada muslo y cada pierna girados
     para que el centro de la rodilla y el del tobillo caigan donde los del jugador (por la forma, como persona.py);
     cada brazo y antebrazo en la dirección y del largo de los del jugador, con la muñeca donde la suya;
  3. los pesos se copian del jugador (hero.json), vértice a vértice por la superficie más cercana: con las dos mallas
     en la misma pose, cada vértice se mueve con los mismos huesos que el jugador en ese sitio;
  4. la mano de la pala no tiene dedos con huesos: se deja abierta, como la del jugador, y el juego la cierra en el
     mango con shapeHands (body.ts) si `hands` va en el JSON (ver «Manos» en las notas);
  5. la textura de TRELLIS va entera al atlas (1024) y una máscara dice qué es cada texel (piel, camiseta, pantalón,
     calzado, pelo), como la de persona.py: por triángulo, con su color y su altura. La camiseta se pide blanca y lisa
     en la imagen, para pintar encima la equipación con sus pliegues;
  6. `zones`: dónde acaba la ropa en la pose de reposo.

Uso:
  python3 art/blender/trellis_persona.py <modelo.glb> <salida.json> [--imagen <imagen de partida>] [--fuente "texto"]
  (con --imagen, la cara de la imagen se proyecta de frente sobre la del modelo: la de TRELLIS sale borrosa)
  python3 art/blender/ver_modelo.py <salida.json> /tmp/ver.png
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

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from padel_clip import A_INV  # noqa: E402
from persona import (CALZADO, CAMISETA, OTRO, PANTALON, PELO, PIEL, REPO, Jugador, alisar, centro,  # noqa: E402
                     empujar, es_piel, medir_agarre, puntos_jugador)
from ver_modelo import glb  # noqa: E402

ALTURA = 1.70
_ULTIMOS_TRIS = None
_PELO_IMAGEN = None
_PIEL_IMAGEN = None
ATLAS = int(os.environ.get("ATLAS", "1024"))
TRIS = int(os.environ.get("TRIS", "16000"))
# de la muñeca a la punta de la mano en la imagen: 0,19 m con la mano abierta (la del jugador), 0,105 m con el puño
MANO = float(os.environ.get("MANO", "0.105"))
LADOS = (("Left", 1), ("Right", -1))


# ---------------------------------------------------------------- 1. importar


def importar(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    mallas = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in mallas:
        o.select_set(True)
    bpy.context.view_layer.objects.active = mallas[0]
    if len(mallas) > 1:
        bpy.ops.object.join()
    me = bpy.context.view_layer.objects.active
    me.parent = None
    # sombreado suave (TRELLIS trae sus normales; si se pierden al simplificar, las de la malla, suaves)
    for poly in me.data.polygons:
        poly.use_smooth = True
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    print(f"importado: {len(me.data.vertices)} vértices, {len(me.data.polygons)} caras")
    # menos triángulos (con sus UV)
    if len(me.data.polygons) > TRIS * 1.2:
        mod = me.modifiers.new("dec", "DECIMATE")
        mod.ratio = TRIS / len(me.data.polygons)
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        print(f"simplificado a {len(me.data.polygons)} caras")
    P = verts(me)
    # de pie: el eje más largo es la altura
    ext = P.max(0) - P.min(0)
    eje = int(np.argmax(ext[[1, 2]])) + 1
    if eje == 1:          # tumbado a lo largo de y: se levanta
        me.data.transform(Matrix.Rotation(math.radians(90), 4, "X"))
        P = verts(me)
    if P[:, 2].mean() < (P[:, 2].min() + P[:, 2].max()) / 2 - 0.2 * ext[2]:
        pass
    # al frente: los dedos de los pies (los vértices más bajos) salen hacia delante del tobillo
    z0 = P[:, 2].min()
    alto = P[:, 2].max() - z0
    pies = P[P[:, 2] < z0 + 0.03 * alto]
    tob = P[(P[:, 2] > z0 + 0.08 * alto) & (P[:, 2] < z0 + 0.10 * alto)]
    if pies[:, 1].mean() > tob[:, 1].mean():
        me.data.transform(Matrix.Rotation(math.radians(180), 4, "Z"))
        print("girado 180° (miraba hacia atrás)")
    P = verts(me)
    k = ALTURA / (P[:, 2].max() - P[:, 2].min())
    me.data.transform(Matrix.Scale(k, 4))
    P = verts(me)
    me.data.transform(Matrix.Translation(Vector((-(P[:, 0].min() + P[:, 0].max()) / 2, 0, -P[:, 2].min()))))
    print(f"escala {k:.4f}")
    return me


def verts(me):
    n = len(me.data.vertices)
    a = np.empty(n * 3, np.float32)
    me.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3).astype(np.float64)


def poner_verts(me, P):
    me.data.vertices.foreach_set("co", P.astype(np.float32).ravel())
    me.data.update()


# ---------------------------------------------------------------- 2. la pose de reposo del jugador


def rot_entre(a, b):
    a = Vector(a).normalized()
    b = Vector(b).normalized()
    return np.array(a.rotation_difference(b).to_matrix())


def cadena(P, sel, piv, R, mov):
    """gira alrededor de piv con R y luego mueve mov los vértices de sel (pesos 0…1)"""
    Q = (P - piv) @ R.T + piv + mov
    return P + sel[:, None] * (Q - P)


def suave(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def eje_brazo(P, s, x0, x1, zc):
    """el centro de las secciones del brazo entre |x| x0 y x1 (el brazo está casi en cruz): (x, y, z) por sección"""
    out = []
    for x in np.arange(x0, x1, 0.01):
        m = (s * P[:, 0] > x) & (s * P[:, 0] < x + 0.01) & (np.abs(P[:, 2] - zc) < 0.16)
        Q = P[m]
        if len(Q) < 6:
            continue
        out.append(((s * x + s * 0.005), (Q[:, 1].min() + Q[:, 1].max()) / 2, (Q[:, 2].min() + Q[:, 2].max()) / 2))
    return np.array(out)


def recta(C):
    """la recta que mejor pasa por los puntos C: (punto, dirección)"""
    c = C.mean(0)
    _, _, vt = np.linalg.svd(C - c)
    d = vt[0]
    return c, d


def posar(me, J, H):
    P = verts(me)
    # la cadera, de delante atrás, donde la suya
    dy = centro(H, 0.95, -0.12, 0.12).y - centro(P, 0.95, -0.12, 0.12).y
    P[:, 1] += dy
    print(f"cadera {dy * 100:+.1f} cm hacia atrás")

    # las piernas: el muslo gira en la cadera hasta que el centro de la rodilla cae donde el del jugador, y la pierna en
    # la rodilla hasta el tobillo; el pie gira con la pierna y luego vuelve a su giro (plano en el suelo)
    entrepierna = float(np.percentile(P[(np.abs(P[:, 0]) < 0.03) & (P[:, 2] < 1.0) & (P[:, 2] > 0.5), 2], 95)) if \
        ((np.abs(P[:, 0]) < 0.03) & (P[:, 2] < 1.0) & (P[:, 2] > 0.5)).any() else 0.80
    for lado, s in LADOS:
        x0, x1 = (0.02, 0.4) if s > 0 else (-0.4, -0.02)
        cadera = J.pos(f"{lado}UpLeg")
        lado_m = (s * P[:, 0] > 0.0)
        for zc, piv_n, nombre in ((0.5, f"{lado}UpLeg", "rodilla"), (0.17, f"{lado}Leg", "tobillo")):
            piv = np.array(J.pos(piv_n)) if nombre == "tobillo" else np.array(cadera)
            if nombre == "tobillo":
                piv = np.array(centro(P, 0.5, x0, x1))   # la rodilla de la persona (ya en su sitio)
            for _ in range(3):
                ella = np.array(centro(P, zc, x0, x1))
                el = np.array(centro(H, zc, x0, x1))
                R = rot_entre(ella - piv, el - piv)
                # lo que gira: la pierna por debajo del pivote (con una transición de 6 cm)
                w = suave((piv[2] + 0.03 - P[:, 2]) / 0.06) * lado_m * (P[:, 2] < entrepierna + 0.05)
                P = cadena(P, w, piv, R, np.zeros(3))
            print(f"  {lado} {nombre}: {np.linalg.norm(np.array(centro(P, zc, x0, x1)) - np.array(centro(H, zc, x0, x1))) * 100:.1f} cm del jugador")
    # los pies en el suelo
    P[:, 2] -= P[:, 2].min()

    # los brazos: hombro, codo y muñeca medidos en la malla (el eje de las secciones del brazo); el brazo y el antebrazo
    # se giran a la dirección de los del jugador y se estiran a su largo
    for lado, s in LADOS:
        hJ = np.array(J.pos(f"{lado}Arm"))
        cJ = np.array(J.pos(f"{lado}ForeArm"))
        mJ = np.array(J.pos(f"{lado}Hand"))
        # el brazo de la persona: desde fuera del hombro hasta la punta de los dedos
        punta = float(s * P[:, 0].max()) if s > 0 else float(-P[:, 0].min())
        C = eje_brazo(P, s, abs(hJ[0]) + 0.06, punta - 0.02, hJ[2] - 0.04)
        largoJ = np.linalg.norm(cJ - hJ) + np.linalg.norm(mJ - cJ)
        manoJ = MANO                              # de la muñeca a la punta de la mano (puño o dedos)
        tot = punta - abs(hJ[0])
        f_codo = np.linalg.norm(cJ - hJ) / (largoJ + manoJ)
        f_mun = largoJ / (largoJ + manoJ)
        xs_codo = abs(hJ[0]) + f_codo * tot
        xs_mun = abs(hJ[0]) + f_mun * tot
        sup = C[np.abs(C[:, 0]) < xs_codo - 0.02]
        inf = C[(np.abs(C[:, 0]) > xs_codo + 0.02) & (np.abs(C[:, 0]) < xs_mun - 0.01)]
        c1, d1 = recta(sup)
        c2, d2 = recta(inf)
        if d1[0] * s < 0:
            d1 = -d1
        if d2[0] * s < 0:
            d2 = -d2
        # el hombro de la persona: la recta del brazo a la x del hombro del jugador
        def en_x(c, d, x):
            return c + d * ((x - c[0]) / d[0])
        hP = en_x(c1, d1, hJ[0])
        cP = (en_x(c1, d1, s * xs_codo) + en_x(c2, d2, s * xs_codo)) / 2
        mP = en_x(c2, d2, s * xs_mun)
        print(f"  {lado} hombro {hP.round(3)} codo {cP.round(3)} muñeca {mP.round(3)}")
        brazo = (s * P[:, 0] > abs(hJ[0]) - 0.06) & (P[:, 2] > 1.0)
        # 1) todo el brazo al hombro del jugador (transición en la axila)
        w = suave((s * P[:, 0] - (abs(hJ[0]) - 0.05)) / 0.08) * brazo
        P = cadena(P, w, hP, np.eye(3), hJ - hP)
        cP, mP = cP + (hJ - hP), mP + (hJ - hP)
        # 2) el brazo gira en el hombro hasta la dirección del del jugador
        R = rot_entre(cP - hJ, cJ - hJ)
        P = cadena(P, w, hJ, R, np.zeros(3))
        cP, mP = R @ (cP - hJ) + hJ, R @ (mP - hJ) + hJ
        # 3) del codo hacia fuera, al largo del brazo del jugador
        u = (cJ - hJ) / np.linalg.norm(cJ - hJ)
        t = (P - hJ) @ u
        lc = np.linalg.norm(cP - hJ)
        wc = suave((t - (lc - 0.03)) / 0.06) * brazo
        P = cadena(P, wc, cP, np.eye(3), cJ - cP)
        mP = mP + (cJ - cP)
        # 4) el antebrazo gira en el codo hasta la dirección del del jugador
        R = rot_entre(mP - cJ, mJ - cJ)
        P = cadena(P, wc, cJ, R, np.zeros(3))
        mP = R @ (mP - cJ) + cJ
        # 5) de la muñeca hacia fuera, al largo del antebrazo del jugador
        u = (mJ - cJ) / np.linalg.norm(mJ - cJ)
        t = (P - cJ) @ u
        lm = np.linalg.norm(mP - cJ)
        wm = suave((t - (lm - 0.02)) / 0.04) * brazo
        P = cadena(P, wm, mP, np.eye(3), mJ - mP)
    poner_verts(me, P)
    return P


# ---------------------------------------------------------------- 3. los pesos del jugador


def pesos_del_jugador(me, J):
    """los pesos de hero.json, por la superficie más cercana del jugador"""
    tmp = f"/tmp/padel-heroe-{os.getpid()}.glb"
    glb(os.path.join(REPO, "assets/chars/hero.json"), tmp)
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=tmp)
    nuevos = [o for o in bpy.data.objects if o not in antes]
    heroe = next(o for o in nuevos if o.type == "MESH")
    for n in J.joints:
        if n not in me.vertex_groups:
            me.vertex_groups.new(name=n)
    mod = me.modifiers.new("pesos", "DATA_TRANSFER")
    mod.object = heroe
    mod.use_vert_data = True
    mod.data_types_verts = {"VGROUP_WEIGHTS"}
    mod.vert_mapping = "POLYINTERP_NEAREST"
    mod.layers_vgroup_select_src = "ALL"
    mod.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = me
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for o in nuevos:
        bpy.data.objects.remove(o, do_unlink=True)
    print(f"pesos copiados: {len(me.vertex_groups)} grupos")


# ---------------------------------------------------------------- 5. la máscara


def tipo_color(c):
    """qué parece un color (0…1): blanco (camiseta, calcetines, zapatillas), marino (pantalón), piel, oscuro u otro"""
    r, g, b = (float(x) for x in c)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    h *= 360
    if v < 0.16:
        # (muy oscuro: la piel morena en sombra es cálida; el pantalón marino, azulado)
        return "piel" if ((h <= 40 or h >= 340) and s > 0.30) else "oscuro"
    if s < 0.20 and v > 0.50:
        return "blanco"
    if 180 <= h <= 270 and v < 0.62:
        return "marino"
    if (h <= 55 or h >= 335) and s >= 0.16:
        return "piel"
    if v < 0.30:
        return "oscuro"
    return "otro"


def pelo_en_imagen(c):
    """si un color de la imagen es de pelo: no blanco y más cerca del pelo de la imagen que de su cara (el rubio es
    «piel» para tipo_color; sin esos colores, lo que no es piel)"""
    if tipo_color(c) == "blanco":
        return False
    if _PELO_IMAGEN is None or _PIEL_IMAGEN is None:
        return tipo_color(c) != "piel"
    c = np.asarray(c, np.float32)
    return float(np.linalg.norm(c - _PELO_IMAGEN)) < float(np.linalg.norm(c - _PIEL_IMAGEN))


def clasificar(atlas, m, uvl, P, S, color_imagen=None):
    """qué es cada texel: por triángulo, con los colores de unas muestras y dónde está en el cuerpo

    La imagen se pide con camiseta blanca, pantalón marino y zapatillas blancas, así que el color dice casi todo; la
    altura decide entre camiseta, calcetín y zapatilla (los tres blancos) y la cabeza entre cara y pelo."""
    from PIL import Image, ImageDraw
    A_ = np.asarray(atlas).astype(np.float32) / 255
    BARI = [(1 / 3, 1 / 3, 1 / 3), (0.6, 0.2, 0.2), (0.2, 0.6, 0.2), (0.2, 0.2, 0.6), (0.8, 0.1, 0.1), (0.1, 0.8, 0.1), (0.1, 0.1, 0.8)]
    tris = []
    c_tri = []
    for tri in m.loop_triangles:
        pts = []
        for li in tri.loops:
            uu, vv = uvl[li].uv
            pts.append((uu * S, (1 - vv) * S))
        vs = [m.loops[li].vertex_index for li in tri.loops]
        z = float(np.mean([P[i][2] for i in vs]))
        x = float(np.mean([abs(P[i][0]) for i in vs]))
        votos = {}
        medias = []
        for bc in BARI:
            u_ = sum(b * p[0] for b, p in zip(bc, pts))
            v_ = sum(b * p[1] for b, p in zip(bc, pts))
            col = A_[int(min(S - 1, max(0, v_))), int(min(S - 1, max(0, u_)))]
            medias.append(float(col.max()))
            t = tipo_color(col)
            votos[t] = votos.get(t, 0) + 1
        top = max(votos, key=votos.get)
        Qn = P[vs]
        nrm_t = np.cross(Qn[1] - Qn[0], Qn[2] - Qn[0])
        nrm_t = nrm_t / (np.linalg.norm(nrm_t) + 1e-12)
        if z < 0.125:
            c = CALZADO
        elif z > 1.47:
            # la cabeza: pelo lo oscuro, lo que mira arriba o atrás (la coronilla y la nuca, que la imagen de frente no
            # enseña: TRELLIS los deja con brillos blancos) y, de frente, lo que en la imagen no es piel; las orejas
            # y la cara, piel
            Q = P[vs]
            nrm = np.cross(Q[1] - Q[0], Q[2] - Q[0])
            nrm = nrm / (np.linalg.norm(nrm) + 1e-12)
            if float(np.mean(medias)) < 0.24 or nrm[1] > 0.25 or nrm[2] > 0.55:
                c = PELO
            elif color_imagen is not None and nrm[1] < -0.3:
                c = PIEL if tipo_color(color_imagen(float(np.mean(Q[:, 0])), z)[0]) == "piel" else PELO
            else:
                c = PIEL
        elif top == "marino":
            c = PANTALON
        elif top == "blanco" and z > 1.36 and x > 0.06 and color_imagen is not None and nrm_t[1] < -0.2 and \
                pelo_en_imagen(color_imagen(np.mean([P[i][0] for i in vs]), z)[0]):
            # (blanco en la textura de TRELLIS y pelo en la imagen, a la altura del cuello: los brillos de una melena;
            # si en la imagen es piel o camiseta, o está delante del cuello, es el cuello de la camiseta: antes salía
            # pelo y se veía una línea blanca entre la piel y la equipación)
            c = PELO
        elif top == "blanco":
            # (los calcetines: piel, que el pintor pinta de calcetín; y la manga nunca pasa del codo)
            c = CAMISETA if (z > 0.80 and x < 0.38) else PIEL
        elif top == "piel":
            c = PIEL
        elif top == "oscuro":
            c = PANTALON if 0.55 < z < 1.0 and x < 0.25 and votos.get("piel", 0) < 3 else PIEL
        else:
            c = CAMISETA if (0.95 < z < 1.45 and x < 0.30) else PIEL
        tris.append((pts, vs, z, x))
        c_tri.append(c)
    # sin manchas sueltas: cada triángulo toma la clase de la mayoría de sus vecinos (los que comparten un vértice)
    # si casi todos piensan otra cosa (dos pasadas; el pelo y la cabeza no se tocan)
    por_v = {}
    for i, (pts, vs, z, x) in enumerate(tris):
        for v in vs:
            por_v.setdefault(v, []).append(i)
    vec = [sorted({j for v in vs for j in por_v[v] if j != i}) for i, (pts, vs, z, x) in enumerate(tris)]
    cambios = 0
    for _ in range(2):
        nuevo = list(c_tri)
        for i, (pts, vs, z, x) in enumerate(tris):
            if z > 1.45 or not vec[i]:
                continue
            cuenta = {}
            for j in vec[i]:
                cuenta[c_tri[j]] = cuenta.get(c_tri[j], 0) + 1
            mejor = max(cuenta, key=cuenta.get)
            # (el pelo no se contagia hacia abajo: en la nuca bajaba hasta el cuello de la camiseta)
            if mejor != c_tri[i] and mejor != PELO and cuenta[mejor] >= 0.7 * len(vec[i]):
                nuevo[i] = mejor
                cambios += 1
        c_tri = nuevo
    print(f"máscara: {cambios} triángulos sueltos cambiados a la clase de sus vecinos")
    global _ULTIMOS_TRIS
    _ULTIMOS_TRIS = (tris, c_tri)
    cls = Image.new("L", (S, S), OTRO * 40)
    dr = ImageDraw.Draw(cls)
    for (pts, vs, z, x), c in zip(tris, c_tri):
        dr.polygon(pts, fill=c * 40)
    # (el borde del cuello y de las mangas: texels blancos marcados como piel junto a la camiseta pasan a camiseta; si
    # no, queda una línea blanca entre la piel y la equipación pintada)
    import cv2
    C_ = np.asarray(cls).copy()
    cam = (C_ == CAMISETA * 40).astype(np.uint8)
    cerca = cv2.dilate(cam, np.ones((7, 7), np.uint8)) > 0
    mx_, mn_ = A_.max(2), A_.min(2)
    blanco = (mx_ > 0.55) & (mx_ - mn_ < 0.16)
    borde = (C_ == PIEL * 40) & cerca & blanco
    C_[borde] = CAMISETA * 40
    print(f"máscara: {int(borde.sum())} texels blancos del borde de la camiseta pasan a camiseta")
    cls = Image.fromarray(C_)
    V = {c: set() for c in (CAMISETA, PANTALON, CALZADO)}
    for (pts, vs, z, x), c in zip(tris, c_tri):
        if c in V:
            V[c].update(vs)
    cam = P[sorted(V[CAMISETA])]
    pan = P[sorted(V[PANTALON])]
    cal = P[sorted(V[CALZADO])]
    brazo = cam[cam[:, 2] > 1.2]
    zonas = {
        "cuff": round(float(np.percentile(np.abs(brazo[:, 0]), 99)), 4),
        "hem": round(float(np.percentile(cam[:, 2], 1)), 4),
        "shortsHem": round(float(np.percentile(pan[:, 2], 1)), 4),
        "shoeTop": round(float(np.percentile(cal[:, 2], 99)), 4),
    }
    n = {k: c_tri.count(k) for k in (PIEL, CAMISETA, PANTALON, CALZADO, PELO)}
    print(f"máscara: piel {n[PIEL]}, camiseta {n[CAMISETA]}, pantalón {n[PANTALON]}, calzado {n[CALZADO]}, pelo {n[PELO]} triángulos")
    return cls, zonas


def render_frente(me, hx, hz, lado, res):
    """la cabeza de frente: cámara ortográfica delante (en −y), Workbench con la textura y luz plana"""
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_WORKBENCH"
    scn.display.shading.light = "FLAT"
    scn.display.shading.color_type = "TEXTURE"
    scn.view_settings.view_transform = "Standard"
    if scn.world is None:
        scn.world = bpy.data.worlds.new("w")
    cd = bpy.data.cameras.new("cara")
    cd.type = "ORTHO"
    cd.ortho_scale = lado
    cam = bpy.data.objects.new("cara", cd)
    scn.collection.objects.link(cam)
    cam.location = (hx, -3.0, hz)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scn.camera = cam
    scn.render.resolution_x = scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    path = f"/tmp/padel-cara-{os.getpid()}.png"
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    from PIL import Image
    return np.asarray(Image.open(path).convert("RGB"))


def puntos_cara(rgb):
    """los 478 puntos de la cara (MediaPipe Face Landmarker) en píxeles, o None"""
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision
    modelo = os.path.expanduser("~/.cache/padel/face_landmarker.task")
    if not os.path.exists(modelo):
        import urllib.request
        os.makedirs(os.path.dirname(modelo), exist_ok=True)
        urllib.request.urlretrieve("https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task", modelo)
    det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=modelo), num_faces=1, min_face_detection_confidence=0.2,
        min_face_presence_confidence=0.2))
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb[..., :3]))
    r = det.detect(img)
    det.close()
    if not r.face_landmarks:
        return None
    h, w = rgb.shape[:2]
    return np.array([(p.x * w, p.y * h) for p in r.face_landmarks[0]])


def cara_proyectada(atlas, m, uvl, P, imagen, me):
    """La cara de la imagen de partida, proyectada de frente sobre la cara del modelo (la de TRELLIS sale borrosa:
    ojos y boca manchados). La imagen se ajusta al modelo por la silueta (de lo alto de la cabeza a la suela, y el
    centro del pecho); cada texel de la cara toma el píxel que tiene delante, mezclado con el de TRELLIS según lo de
    frente que mire (las mejillas y las orejas, poco), y con el tono corregido al de la textura."""
    from PIL import Image
    im = Image.open(imagen).convert("RGB")
    I = np.asarray(im).astype(np.float32) / 255
    H_, W_ = I.shape[:2]
    fondo = np.median(np.concatenate([I[:20].reshape(-1, 3), I[:, :20].reshape(-1, 3), I[:, -20:].reshape(-1, 3)]), 0)
    dif = np.abs(I - fondo).max(2)
    sil = dif > 0.08
    filas = np.nonzero(sil.sum(1) > 3)[0]
    y0, y1 = filas.min(), filas.max()
    alto = P[:, 2].max() - P[:, 2].min()
    k = (y1 - y0) / alto                               # píxeles por metro
    fila_pecho = int(y0 + (P[:, 2].max() - 1.25) * k)
    cols = np.nonzero(sil[fila_pecho])[0]
    cx = (cols.min() + cols.max()) / 2
    pecho = P[np.abs(P[:, 2] - 1.25) < 0.02]
    mx = (pecho[:, 0].min() + pecho[:, 0].max()) / 2
    ztop = P[:, 2].max()

    S = atlas.size[0]
    A = np.asarray(atlas).astype(np.float32) / 255
    out = A.copy()
    peso = np.zeros(A.shape[:2], np.float32)
    proy = np.zeros_like(A)
    try:
        cn = np.array([tuple(c.vector) for c in m.corner_normals])
    except AttributeError:
        m.calc_normals_split()
        cn = np.array([tuple(l.normal) for l in m.loops])

    # el ajuste fino, por los puntos de la cara: la cabeza del modelo se renderiza de frente (ortográfica, con la
    # textura de TRELLIS) y MediaPipe busca los 478 puntos de la cara en ese render y en la imagen; la semejanza
    # (escala, giro y desplazamiento) que lleva unos a otros da dónde cae cada punto del modelo en la imagen
    cab = P[(P[:, 2] > 1.38) & (np.abs(P[:, 0]) < 0.16)]
    hx, hz = (cab[:, 0].min() + cab[:, 0].max()) / 2, (cab[:, 2].min() + cab[:, 2].max()) / 2
    LADO, RES = 0.34, 800
    kr = RES / LADO
    ren = render_frente(me, hx, hz, LADO, RES)
    pr = puntos_cara(ren)
    # la cabeza en la imagen (por la silueta), recortada y ampliada para que el detector la vea grande
    u_c = cx + (hx - mx) * k
    v_c = y0 + (ztop - hz) * k
    half = int(LADO * k * 0.75)
    ua, va = int(max(0, u_c - half)), int(max(0, v_c - half))
    rec = I[va: va + 2 * half, ua: ua + 2 * half]
    f = RES / rec.shape[0]
    import cv2
    rec_g = cv2.resize((rec * 255).astype(np.uint8), (int(rec.shape[1] * f), RES), interpolation=cv2.INTER_CUBIC)
    pi = puntos_cara(rec_g)
    if pr is None or pi is None:
        print(f"cara: sin puntos (render {pr is not None}, imagen {pi is not None}); no se proyecta")
        return atlas, None, np.zeros(A.shape[:2], np.float32), None
    pi = pi / f + np.array([ua, va])
    # el color del pelo en la imagen: entre lo alto de la cabeza (la silueta) y lo alto de la frente (punto 10 de la
    # cara), en el centro, sin el fondo
    global _PELO_IMAGEN
    x10, y10 = pi[10]
    fw = abs(pi[234][0] - pi[454][0])
    col_ = int(x10)
    filas_ = np.nonzero(dif[:, col_] > 0.08)[0]
    _PELO_IMAGEN = None
    if len(filas_):
        yt = int(filas_.min())
        y1_ = int(yt + 0.6 * max(4, y10 - yt))
        reg_ = I[yt + 2: max(yt + 4, y1_), int(x10 - 0.2 * fw): int(x10 + 0.2 * fw)]
        d_ = np.abs(reg_ - fondo).max(2)
        px_ = reg_[d_ > 0.1]
        if len(px_) > 20:
            _PELO_IMAGEN = np.median(px_, 0)
            print(f"pelo en la imagen: {np.round(_PELO_IMAGEN * 255)} ({len(px_)} píxeles, de la fila {yt} a la {y1_})")
    # semejanza (Umeyama) render -> imagen
    ma, mb = pr.mean(0), pi.mean(0)
    a0, b0 = pr - ma, pi - mb
    U_, D_, Vt = np.linalg.svd(b0.T @ a0)
    d = np.sign(np.linalg.det(U_ @ Vt))
    R2 = U_ @ np.diag([1, d]) @ Vt
    sc = (D_ * [1, d]).sum() / (a0 ** 2).sum()
    tr = mb - sc * R2 @ ma
    err = np.linalg.norm((sc * (R2 @ pr.T)).T + tr - pi, axis=1)
    print(f"cara: {len(pr)} puntos; escala {sc * kr:.0f} px/m (silueta {k:.0f}); giro {math.degrees(math.atan2(R2[1, 0], R2[0, 0])):+.1f}°; error mediano {np.median(err):.1f} px")
    if os.environ.get("VER_CARA"):
        from PIL import Image as _I, ImageDraw as _D
        a = _I.fromarray(ren).convert("RGB"); b = _I.fromarray(rec_g).convert("RGB")
        da, db = _D.Draw(a), _D.Draw(b)
        for p_ in pr[::4]:
            da.ellipse((p_[0] - 2, p_[1] - 2, p_[0] + 2, p_[1] + 2), fill=(255, 0, 0))
        for p_ in (pi[::4] - [ua, va]) * f:
            db.ellipse((p_[0] - 2, p_[1] - 2, p_[0] + 2, p_[1] + 2), fill=(0, 255, 0))
        o = _I.new("RGB", (a.width + b.width, max(a.height, b.height))); o.paste(a, (0, 0)); o.paste(b, (a.width, 0))
        o.save(os.environ["VER_CARA"])

    def a_imagen(X, Z):
        ur = (X - (hx - LADO / 2)) * kr
        vr = ((hz + LADO / 2) - Z) * kr
        q = sc * (R2 @ np.stack([ur, vr])) + tr[:, None]
        return q[0], q[1]

    n_tri = 0
    cara_ = np.zeros(peso.shape, bool)
    for tri in m.loop_triangles:
        vs = [m.loops[li].vertex_index for li in tri.loops]
        Q = P[vs]
        # (la cabeza hasta 0,20 m del centro; y, por debajo, el cuello y el escote de la camiseta, hasta 1,33 m: con
        # el borde de TRELLIS quedaba una franja clara entre la piel y la equipación)
        zmin = Q[:, 2].min()
        if zmin < 1.33 or np.abs(Q[:, 0]).max() > (0.20 if zmin >= 1.40 else 0.12):
            continue
        es_cara = zmin >= 1.40
        nrm = cn[list(tri.loops)].mean(0)
        frente = -nrm[1] / (np.linalg.norm(nrm) + 1e-9)
        if frente < 0.25:
            continue
        n_tri += 1
        uv = np.array([(uvl[li].uv[0] * S, (1 - uvl[li].uv[1]) * S) for li in tri.loops])
        x0, y0b = np.floor(uv.min(0)).astype(int)
        x1, y1b = np.ceil(uv.max(0)).astype(int)
        xs, ys = np.meshgrid(np.arange(max(0, x0), min(S, x1 + 1)), np.arange(max(0, y0b), min(S, y1b + 1)))
        if xs.size == 0:
            continue
        pts = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], 1)
        T = np.array([[uv[0, 0] - uv[2, 0], uv[1, 0] - uv[2, 0]], [uv[0, 1] - uv[2, 1], uv[1, 1] - uv[2, 1]]])
        if abs(np.linalg.det(T)) < 1e-9:
            continue
        l12 = np.linalg.solve(T, (pts - uv[2]).T).T
        bc = np.column_stack([l12, 1 - l12.sum(1)])
        dentro = (bc >= -0.07).all(1)          # (algo más allá del triángulo: los bordes de las islas, sin rayas)
        if not dentro.any():
            continue
        bc = bc[dentro]
        px = pts[dentro].astype(int)
        X = bc @ Q
        u, v = a_imagen(X[:, 0], X[:, 2])
        ok = (u >= 0) & (u < W_ - 1) & (v >= 0) & (v < H_ - 1)
        u, v, px, bc = u[ok], v[ok], px[ok], bc[ok]
        # bilineal
        u0, v0 = np.floor(u).astype(int), np.floor(v).astype(int)
        fu, fv = (u - u0)[:, None], (v - v0)[:, None]
        col = (I[v0, u0] * (1 - fu) * (1 - fv) + I[v0, u0 + 1] * fu * (1 - fv) + I[v0 + 1, u0] * (1 - fu) * fv + I[v0 + 1, u0 + 1] * fu * fv)
        w = float(np.clip((frente - 0.12) / 0.33, 0, 1))
        w = w * w * (3 - 2 * w)
        # (lo que en la imagen es fondo, en el borde de la silueta del pelo, no se proyecta)
        wv = w * np.clip((np.abs(col - fondo).max(1) - 0.06) / 0.06, 0, 1)
        nuevo = wv > peso[px[:, 1], px[:, 0]]
        proy[px[nuevo, 1], px[nuevo, 0]] = col[nuevo]
        peso[px[nuevo, 1], px[nuevo, 0]] = wv[nuevo]
        cara_[px[nuevo, 1], px[nuevo, 0]] = es_cara
    # (el tono de la piel se mide en la cabeza: el escote lleva la camiseta blanca)
    sel = (peso > 0.8) & cara_
    corr = None
    if sel.any():
        # el tono de la piel de TRELLIS al de la imagen (media y desviación por canal, medidas en la cara): se aplica
        # luego a toda la piel (corregir_piel), y la cara proyectada se queda con el color de la imagen
        corr = (A[sel].mean(0), A[sel].std(0) + 1e-3, proy[sel].mean(0), proy[sel].std(0) + 1e-3)
        global _PIEL_IMAGEN
        _PIEL_IMAGEN = proy[sel].mean(0)
    out = A * (1 - peso[..., None]) + np.clip(proy, 0, 1) * peso[..., None]
    print(f"cara proyectada: {n_tri} triángulos, {int((peso > 0).sum())} texels ({k:.0f} px/m en la imagen)")

    def color_imagen(X, Z):
        u, v = a_imagen(np.atleast_1d(X), np.atleast_1d(Z))
        u = np.clip(u.astype(int), 0, W_ - 1)
        v = np.clip(v.astype(int), 0, H_ - 1)
        return I[v, u]

    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)), corr, peso, color_imagen


def pelo_de_la_imagen(atlas, cls, peso, color_imagen, P):
    """el pelo que la imagen no ve (nuca, coronilla, los lados de atrás) con el color del pelo de la imagen: la luz y la
    sombra de TRELLIS (su brillo relativo), el tono de la imagen"""
    from PIL import Image
    tris, c_tri = _ULTIMOS_TRIS
    muestras = []
    for (pts, vs, z, x), c in zip(tris, c_tri):
        if c != PELO:
            continue
        Q = P[vs]
        nrm = np.cross(Q[1] - Q[0], Q[2] - Q[0])
        nrm = nrm / (np.linalg.norm(nrm) + 1e-12)
        if nrm[1] < -0.3 and z > 1.5:
            muestras.append(color_imagen(float(np.mean(Q[:, 0])), z)[0])
    if _PELO_IMAGEN is not None:
        col = _PELO_IMAGEN
    elif len(muestras) >= 10:
        col = np.median(np.array(muestras), 0)
    else:
        print("pelo: sin muestras en la imagen; se deja el de TRELLIS")
        return atlas
    A = np.asarray(atlas).astype(np.float32) / 255
    C = np.asarray(cls)
    pel = C == PELO * 40
    L = A.max(2)
    Lm = float(np.median(L[pel]))
    nuevo = col[None, None, :] * np.clip(L / max(Lm, 1e-3), 0.55, 1.5)[..., None]
    w = (pel.astype(np.float32) * (1 - np.clip(peso, 0, 1)))[..., None]
    out = A * (1 - w) + np.clip(nuevo, 0, 1) * w
    print(f"pelo: color de la imagen {np.round(col * 255)} en {int((w[..., 0] > 0.5).sum())} texels")
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def igualar_piel(atlas, cls, peso):
    """la piel del cuerpo (brazos, piernas) con el brillo de la de la cara: TRELLIS la deja más oscura"""
    from PIL import Image
    A = np.asarray(atlas).astype(np.float32) / 255
    C = np.asarray(cls)
    piel = C == PIEL * 40
    Y = A @ np.array([0.299, 0.587, 0.114], np.float32)
    cara = piel & (peso > 0.8)
    resto = piel & (peso < 0.2)
    if cara.sum() < 100 or resto.sum() < 100:
        return atlas
    k = float(np.clip(0.95 * np.median(Y[cara]) / max(np.median(Y[resto]), 1e-3), 1.0, 1.35))
    w = (resto.astype(np.float32))[..., None]
    out = A * (1 - w) + np.clip(A * k, 0, 1) * w
    print(f"piel del cuerpo: ×{k:.2f} para igualar el brillo de la cara")
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def alisar_tela(atlas, cls):
    """la camiseta lisa (las arrugas oscuras de TRELLIS parecían manchas una vez pintada la equipación): las rayas y
    las motas fuera, y el contraste de sus pliegues a un tercio y suavizado; el pantalón, a un 70 %"""
    from PIL import Image
    import cv2
    A_ = np.asarray(atlas).astype(np.float32)
    C = np.asarray(cls)
    out = A_.copy()
    Y = A_ @ np.array([0.299, 0.587, 0.114], np.float32)
    for clase, k, cont in ((CAMISETA, 15, 0.35), (PANTALON, 7, 0.7)):
        m = C == clase * 40
        if not m.any():
            continue
        med = float(np.median(Y[m]))
        Yf = np.where(m, Y, med).astype(np.uint8)
        Yc = cv2.morphologyEx(Yf, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8)).astype(np.float32)
        Yc = cv2.GaussianBlur(Yc, (0, 0), 5.0 if clase == CAMISETA else 2.5)
        Yc = med + (Yc - med) * cont
        if clase == CAMISETA:
            for c in range(3):
                out[..., c] = np.where(m, Yc, out[..., c])
        else:
            f = np.clip(Yc / np.maximum(Y, 1), 0.5, 2.0)
            for c in range(3):
                out[..., c] = np.where(m, A_[..., c] * f, out[..., c])
    print("tela: camiseta lisa (contraste 0,35) y pantalón (0,7)")
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def rellenar_bordes(atlas, cls, r=8):
    """una franja de r texels alrededor de cada isla toma la clase y el color del texel de la isla más cercano: el
    pintor lee la máscara reducida a 1024 y la textura filtrada, y en el borde de las islas caía en «otro» o en el
    relleno blanco de TRELLIS (motas y líneas blancas en las costuras de la camiseta y en el cuello)"""
    from PIL import Image
    from scipy.ndimage import distance_transform_edt
    C = np.asarray(cls)
    fuera = C == OTRO * 40
    if not fuera.any() or fuera.all():
        return atlas, cls
    d, (iy, ix) = distance_transform_edt(fuera, return_indices=True)
    sel = fuera & (d <= r)
    A_ = np.asarray(atlas).copy()
    C2 = C.copy()
    A_[sel] = A_[iy[sel], ix[sel]]
    C2[sel] = C[iy[sel], ix[sel]]
    print(f"bordes: {int(sel.sum())} texels de relleno junto a las islas")
    return Image.fromarray(A_), Image.fromarray(C2)


def corregir_piel(atlas, cls, corr, peso, fuerza=0.8):
    """la piel de TRELLIS (brazos, piernas, cuello, orejas…) al tono de la cara de la imagen, sin tocar lo proyectado"""
    from PIL import Image
    A = np.asarray(atlas).astype(np.float32) / 255
    a_m, a_s, p_m, p_s = corr
    s_ = np.clip(p_s / a_s, 0.6, 1.6)
    B = (A - a_m) * s_ + p_m
    piel = (np.asarray(cls) == PIEL * 40).astype(np.float32) * (1 - peso) * fuerza
    out = A * (1 - piel[..., None]) + np.clip(B, 0, 1) * piel[..., None]
    print(f"piel corregida: media {np.round(a_m * 255)} -> {np.round(p_m * 255)}")
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


# ---------------------------------------------------------------- 5. el glTF


def exportar(J, me, P, tex_img, salida, fuente, imagen=None):
    from PIL import Image
    dg = bpy.context.evaluated_depsgraph_get()
    m = me.evaluated_get(dg).to_mesh()
    m.calc_loop_triangles()
    uvl = m.uv_layers[0].data
    gnames = [g.name for g in me.vertex_groups]
    jidx = {n: i for i, n in enumerate(J.joints)}
    VJ = np.zeros((len(m.vertices), 4), np.uint8)
    VW = np.zeros((len(m.vertices), 4), np.float32)
    sin = 0
    for v in m.vertices:
        acc = {}
        for g in v.groups:
            n = gnames[g.group]
            if g.weight <= 0 or n not in jidx:
                continue
            acc[jidx[n]] = acc.get(jidx[n], 0) + g.weight
        top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
        s = sum(w for _, w in top)
        if not top:
            sin += 1
            top, s = [(jidx["Hips"], 1.0)], 1.0
        for i, (j, w) in enumerate(top):
            VJ[v.index, i] = j
            VW[v.index, i] = w / s
    if sin:
        print(f"AVISO: {sin} vértices sin pesos (a la cadera)")
    try:
        cn = [tuple(c.vector) for c in m.corner_normals]
    except AttributeError:
        m.calc_normals_split()
        cn = [tuple(l.normal) for l in m.loops]
    clave = {}
    pos, nor, uv, jj, ww, idx = [], [], [], [], [], []
    for tri in m.loop_triangles:
        for li in tri.loops:
            vi = m.loops[li].vertex_index
            uu, vv = uvl[li].uv
            U = (uu, 1 - vv)
            n = cn[li]
            key = (vi, round(U[0], 5), round(U[1], 5), round(n[0], 3), round(n[1], 3), round(n[2], 3))
            if key not in clave:
                clave[key] = len(pos)
                g = A_INV @ Vector(P[vi])
                pos.append((g.x, g.y, g.z))
                nn = (A_INV.to_3x3() @ Vector(n)).normalized()
                nor.append((nn.x, nn.y, nn.z))
                uv.append(U)
                jj.append(tuple(int(x) for x in VJ[vi]))
                ww.append(tuple(float(x) for x in VW[vi]))
            idx.append(clave[key])
    pos = np.array(pos, np.float32)
    print(f"glTF: {len(pos)} vértices, {len(idx) // 3} triángulos; alto {pos[:, 1].max():.3f} m")

    S = 2048
    atlas = tex_img.convert("RGB").resize((S, S), Image.LANCZOS)
    if imagen:
        atlas, corr, peso, color_imagen = cara_proyectada(atlas, m, uvl, P, imagen, me)
    else:
        color_imagen = None
    cls, zonas = clasificar(atlas, m, uvl, P, S, color_imagen)
    if imagen and corr is not None:
        atlas = corregir_piel(atlas, cls, corr, peso, fuerza=1.0)
        atlas = igualar_piel(atlas, cls, peso)
    if imagen and color_imagen is not None:
        atlas = pelo_de_la_imagen(atlas, cls, peso, color_imagen, P)
    atlas = alisar_tela(atlas, cls)
    atlas, cls = rellenar_bordes(atlas, cls)
    Mx = 1024
    mask = Image.merge("RGB", (cls.resize((Mx, Mx), Image.NEAREST), Image.new("L", (Mx, Mx), 255), Image.new("L", (Mx, Mx), 0)))

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

    def accesor(arr, ctype, typ, target, mm=False):
        nbv.append(vista_(arr.tobytes(), target))
        a = {"bufferView": len(nbv) - 1, "componentType": ctype, "count": int(arr.shape[0]), "type": typ}
        if mm:
            a["min"] = [float(x) for x in arr.min(0)]
            a["max"] = [float(x) for x in arr.max(0)]
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
    g["accessors"] = nacc
    g["bufferViews"] = nbv
    g["buffers"] = [{"byteLength": len(out)}]
    g["materials"] = [{"name": nombre, "pbrMetallicRoughness": {"roughnessFactor": 0.85, "metallicFactor": 0}}]
    g["meshes"][0]["name"] = nombre
    g["asset"] = {"version": "2.0", "generator": "art/blender/trellis_persona.py (TRELLIS 2, MIT)"}

    def data_url(img, fmt, **kw):
        b = io.BytesIO()
        img.save(b, fmt, **kw)
        return f"data:image/{fmt.lower()};base64," + base64.b64encode(b.getvalue()).decode()

    atlas = atlas.resize((ATLAS, ATLAS), Image.LANCZOS)
    res = {
        "gltf": g,
        "bin": base64.b64encode(bytes(out)).decode(),
        "tex": data_url(atlas, "WEBP", quality=82, method=6),
        "mask": data_url(mask, "WEBP", lossless=True, method=6),
        "zones": zonas,
        "license": fuente,
    }
    with open(salida, "w") as f:
        json.dump(res, f, separators=(",", ":"))
    print(f"{salida}: {os.path.getsize(salida) / 1024:.0f} KB (textura {len(res['tex']) * 3 / 4 / 1024:.0f} KB, máscara {len(res['mask']) * 3 / 4 / 1024:.0f} KB)")
    print("zonas", zonas)
    tmp = f"/tmp/padel-{nombre}"
    atlas.save(tmp + "-atlas.jpg", quality=85)
    paleta = np.array([(230, 180, 150), (40, 120, 230), (240, 200, 40), (60, 60, 60), (150, 60, 20), (255, 0, 255)], np.uint8)
    Image.fromarray(paleta[np.clip(np.asarray(mask)[..., 0] // 40, 0, 5)]).save(tmp + "-mask.png")
    me.evaluated_get(dg).to_mesh_clear()
    return res


def textura_de(me):
    from PIL import Image
    for slot in me.material_slots:
        nt = slot.material.node_tree
        for n in nt.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                bsdf = next((x for x in nt.nodes if x.type == "BSDF_PRINCIPLED"), None)
                if bsdf and any(l.to_socket == bsdf.inputs["Base Color"] for l in n.outputs["Color"].links):
                    img = n.image
                    path = f"/tmp/padel-tex-{os.getpid()}.png"
                    img.filepath_raw = path
                    img.file_format = "PNG"
                    img.save()
                    return Image.open(path)
    raise RuntimeError("sin textura de color")


def montar(path, salida, fuente, imagen=None):
    J = Jugador()
    H = puntos_jugador()
    me = importar(path)
    tex = textura_de(me)
    P = posar(me, J, H)
    for zc, x0, x1, nombre in ((0.95, -0.12, 0.12, "cadera"), (0.5, 0.02, 0.4, "rodilla"), (0.17, 0.02, 0.4, "tobillo"),
                               (1.25, -0.15, 0.15, "pecho"), (1.40, -0.06, 0.06, "cuello"), (1.55, -0.1, 0.1, "cabeza")):
        a, b = centro(P, zc, x0, x1), centro(H, zc, x0, x1)
        print(f"  {nombre:8s} persona {a.x:+.3f} {a.y:+.3f}  jugador {b.x:+.3f} {b.y:+.3f}")
    pesos_del_jugador(me, J)
    dg = bpy.context.evaluated_depsgraph_get()
    m = me.evaluated_get(dg).to_mesh()
    medir_agarre(me, m, P, J, 0.0)
    me.evaluated_get(dg).to_mesh_clear()
    return exportar(J, me, P, tex, salida, fuente, imagen)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:]]
    fuente = "Modelo generado con IA (Qwen-Image 2512 y Microsoft TRELLIS 2, MIT) para Nocodeboy Games"
    if "--fuente" in args:
        k = args.index("--fuente")
        fuente = args[k + 1]
        del args[k:k + 2]
    imagen = None
    if "--imagen" in args:
        k = args.index("--imagen")
        imagen = args[k + 1]
        del args[k:k + 2]
    montar(args[0], args[1], fuente, imagen)
