"""Pasa una animación de captura de movimiento (BVH de CMU, y el mismo método vale para FBX de
Mixamo o de packs de pago) al esqueleto estándar de Meshy de la biblioteca del estudio.

Método: para cada hueso se toma el giro que hace la fuente respecto a su pose en T (fotograma 1
de los BVH de CMU) y se aplica, en coordenadas del mundo, al hueso equivalente del personaje,
alineando antes la dirección de cada hueso en reposo (así da igual que los brazos de uno estén
algo más caídos que los del otro). La cadera se mueve con la fuente, escalada por la altura de
la cadera. Todo es matemática de matrices: no hace falta ningún addon.

Uso como módulo:
    from retarget import import_bvh, retarget
    src = import_bvh(ruta)
    accion = retarget(src, armadura_meshy, nombre="correr_y_frenar", inicio=2, fin=None,
                      fps_fuente=120, fps=30, en_el_sitio=False)
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

# hueso de Meshy -> (hueso de CMU, hijo de CMU para su dirección, hijo de Meshy para su dirección)
# None en la dirección = sin alinear (solo se copia el giro)
MAPA_CMU = {
    "Hips":          ("Hips", None, None),
    "Spine02":       ("LowerBack", "Spine", "Spine01"),
    "Spine01":       ("Spine", "Spine1", "Spine"),
    "Spine":         ("Spine1", "Neck", "neck"),
    "neck":          ("Neck", "Head", "Head"),
    "Head":          ("Head", None, None),
    "LeftShoulder":  ("LeftShoulder", "LeftArm", "LeftArm"),
    "LeftArm":       ("LeftArm", "LeftForeArm", "LeftForeArm"),
    "LeftForeArm":   ("LeftForeArm", "LeftHand", "LeftHand"),
    "LeftHand":      ("LeftHand", "LeftHandIndex1", "@tail"),
    "RightShoulder": ("RightShoulder", "RightArm", "RightArm"),
    "RightArm":      ("RightArm", "RightForeArm", "RightForeArm"),
    "RightForeArm":  ("RightForeArm", "RightHand", "RightHand"),
    "RightHand":     ("RightHand", "RightHandIndex1", "@tail"),
    "LeftUpLeg":     ("LeftUpLeg", "LeftLeg", "LeftLeg"),
    "LeftLeg":       ("LeftLeg", "LeftFoot", "LeftFoot"),
    "LeftFoot":      ("LeftFoot", "LeftToeBase", "LeftToeBase"),
    "LeftToeBase":   ("LeftToeBase", "@tail", "@tail"),
    "RightUpLeg":    ("RightUpLeg", "RightLeg", "RightLeg"),
    "RightLeg":      ("RightLeg", "RightFoot", "RightFoot"),
    "RightFoot":     ("RightFoot", "RightToeBase", "RightToeBase"),
    "RightToeBase":  ("RightToeBase", "@tail", "@tail"),
}

# Mixamo (y la mayoría de packs para Unity/Unreal con nombres de Mixamo). Su pose de reposo ya es
# la pose en T, así que con estos archivos se llama a retarget(..., pose_t=None).
MAPA_MIXAMO = {
    "Hips": ("mixamorig:Hips", None, None),
    "Spine02": ("mixamorig:Spine", "mixamorig:Spine1", "Spine01"),
    "Spine01": ("mixamorig:Spine1", "mixamorig:Spine2", "Spine"),
    "Spine": ("mixamorig:Spine2", "mixamorig:Neck", "neck"),
    "neck": ("mixamorig:Neck", "mixamorig:Head", "Head"),
    "Head": ("mixamorig:Head", None, None),
}
for _lado in ("Left", "Right"):
    for _t, _s, _sc, _tc in [("Shoulder", "Shoulder", "Arm", "Arm"), ("Arm", "Arm", "ForeArm", "ForeArm"),
                             ("ForeArm", "ForeArm", "Hand", "Hand"), ("Hand", "Hand", "HandMiddle1", "@tail"),
                             ("UpLeg", "UpLeg", "Leg", "Leg"), ("Leg", "Leg", "Foot", "Foot"),
                             ("Foot", "Foot", "ToeBase", "ToeBase"), ("ToeBase", "ToeBase", "@tail", "@tail")]:
        MAPA_MIXAMO[_lado + _t] = ("mixamorig:" + _lado + _s, "mixamorig:" + _lado + _sc if _sc != "@tail" else "@tail",
                                   _lado + _tc if _tc != "@tail" else "@tail")


def import_fbx(path):
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    return [o for o in bpy.context.selected_objects if o.type == "ARMATURE"][0]


def import_bvh(path):
    bpy.ops.import_anim.bvh(filepath=path, global_scale=1.0, frame_start=1, use_fps_scale=False,
                            update_scene_fps=False, update_scene_duration=False,
                            rotate_mode="NATIVE")
    return bpy.context.active_object


def _rot(m):
    return m.to_3x3().normalized().to_quaternion()


def _src_world(src, name):
    return src.matrix_world @ src.pose.bones[name].matrix


def _src_dir(src, name, child):
    pb = src.pose.bones[name]
    a = src.matrix_world @ pb.head
    b = src.matrix_world @ (pb.tail if child == "@tail" else src.pose.bones[child].head)
    d = b - a
    return d.normalized() if d.length > 1e-6 else None


def _tgt_dir(tgt, name, child):
    bone = tgt.data.bones[name]
    a = tgt.matrix_world @ bone.head_local
    b = tgt.matrix_world @ (bone.tail_local if child == "@tail" else tgt.data.bones[child].head_local)
    d = b - a
    return d.normalized() if d.length > 1e-9 else None


# bisagras: codo y rodilla. El eje se mide en el hueso de arriba; el giro de alineación se aplica a
# toda la cadena para que el codo y la rodilla del personaje se doblen por su eje natural.
CADENAS = {
    "LeftForeArm": ("LeftArm", ["LeftArm", "LeftForeArm", "LeftHand"]),
    "RightForeArm": ("RightArm", ["RightArm", "RightForeArm", "RightHand"]),
    "LeftLeg": ("LeftUpLeg", ["LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"]),
    "RightLeg": ("RightUpLeg", ["RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"]),
}


def eje_medio(muestras):
    """Media de ejes de giro (eje * ángulo), con el ángulo llevado a (0, pi]."""
    acc = Vector((0, 0, 0))
    for q in muestras:
        axis, ang = q.to_axis_angle()
        if ang > math.pi:
            axis, ang = -axis, 2 * math.pi - ang
        if ang > math.radians(15):
            acc += axis * ang
    return acc.normalized() if acc.length > 1e-6 else None


def bisagras_fuente(src, mapa, inicio, fin, pose_t=1, paso=4):
    """Eje de cada codo y rodilla de la fuente, en el mundo, en su pose en T."""
    scn = bpy.context.scene
    pares = {}
    for hijo, (padre, _) in CADENAS.items():
        if hijo in mapa and padre in mapa:
            pares[hijo] = (mapa[padre][0], mapa[hijo][0])
    scn.frame_set(pose_t)
    q_t = {h: _rot(_src_world(src, p)).inverted() @ _rot(_src_world(src, c)) for h, (p, c) in pares.items()}
    r_up_t = {h: _rot(_src_world(src, p)) for h, (p, c) in pares.items()}
    muestras = {h: [] for h in pares}
    for f in range(inicio, fin + 1, paso):
        scn.frame_set(f)
        for h, (p, c) in pares.items():
            q = _rot(_src_world(src, p)).inverted() @ _rot(_src_world(src, c))
            muestras[h].append(q @ q_t[h].inverted())
    out = {}
    for h, m in muestras.items():
        e = eje_medio(m)
        if e is not None:
            out[h] = r_up_t[h] @ e
    return out


def retarget(src, tgt, nombre, inicio=2, fin=None, fps_fuente=120, fps=30, en_el_sitio=False,
             mapa=MAPA_CMU, pose_t=1, bisagras_destino=None, frente=None):
    """bisagras_destino: {"LeftForeArm": eje en el mundo, ...} del personaje en reposo (ver
    padel_clip.bisagras_destino). Sin ella solo se alinea la dirección de cada hueso.
    frente: un fotograma de la fuente en el que el actor mira «al frente» (a la red): todo el clip se gira
    alrededor de la vertical para que ahí mire como en la pose en T (en una toma larga el actor se va girando)."""
    scn = bpy.context.scene
    src_action = src.animation_data.action
    if fin is None:
        fin = int(src_action.frame_range[1])
    giro_bisagra = {}
    if bisagras_destino:
        hs = bisagras_fuente(src, mapa, inicio, fin, pose_t if pose_t else 1)
        giro_bisagra = {h: (hs[h], bisagras_destino[h]) for h in hs if h in bisagras_destino}

    # --- referencias en la pose en T de la fuente (un fotograma, o la de reposo si pose_t es None)
    if pose_t is None:
        src.data.pose_position = "REST"
        bpy.context.view_layer.update()
    else:
        scn.frame_set(pose_t)
    rs_t, align = {}, {}
    for tb, (sb, sc, tc) in mapa.items():
        if tb not in tgt.data.bones or sb not in src.pose.bones:
            continue
        rs_t[tb] = _rot(_src_world(src, sb))
        align[tb] = Quaternion()
        if sc and tc:
            ds, dt = _src_dir(src, sb, sc), _tgt_dir(tgt, tb, tc)
            if ds is not None and dt is not None:
                align[tb] = dt.rotation_difference(ds)
    # giro alrededor del hueso para que el eje del codo/rodilla del personaje caiga sobre el de la fuente
    angulos = {}
    for hijo, (h_s, h_t) in giro_bisagra.items():
        padre, cadena = CADENAS[hijo]
        for tb in cadena:
            if tb not in align:
                continue
            sb, sc, tc = mapa[tb]
            ds = _src_dir(src, sb, sc) if sc else None
            if ds is None:
                continue
            if tb in (padre, hijo):
                a = align[tb] @ h_t
                a = a - ds * a.dot(ds)
                b = h_s - ds * h_s.dot(ds)
                if a.length < 1e-6 or b.length < 1e-6:
                    continue
                a.normalize(); b.normalize()
                th = math.atan2(ds.dot(a.cross(b)), a.dot(b))
                angulos[tb] = th
            else:
                th = angulos.get(hijo, 0.0)      # la mano y el pie siguen el giro del antebrazo / pierna
            align[tb] = Quaternion(ds, th) @ align[tb]
    if angulos:
        print("bisagras: " + ", ".join(f"{k} {math.degrees(v):.0f}°" for k, v in angulos.items()))
    SH = mapa["Hips"][0]
    stoes = (mapa["LeftToeBase"][0], mapa["RightToeBase"][0])
    src_hips_t = (src.matrix_world @ src.pose.bones[SH].head).copy()
    src_toe_t = min((src.matrix_world @ src.pose.bones[n].head).z for n in stoes)

    def yaw_at():
        l = src.matrix_world @ src.pose.bones[mapa["LeftUpLeg"][0]].head
        r = src.matrix_world @ src.pose.bones[mapa["RightUpLeg"][0]].head
        return math.atan2(l.y - r.y, l.x - r.x)
    yaw_t = yaw_at()

    obj_m = tgt.matrix_world.copy()
    obj_inv = obj_m.inverted()
    obj_r = _rot(obj_m)
    rest = {b.name: b.matrix_local.copy() for b in tgt.data.bones}
    rest_world_rot = {n: _rot(obj_m @ m) for n, m in rest.items()}
    tgt_hips = obj_m @ tgt.data.bones["Hips"].head_local
    tgt_toe = min((obj_m @ tgt.data.bones[n].head_local).z for n in ("LeftToeBase", "RightToeBase"))
    escala = (tgt_hips.z - tgt_toe) / (src_hips_t.z - src_toe_t)
    if pose_t is None:
        src.data.pose_position = "POSE"
        bpy.context.view_layer.update()

    # --- acción nueva en la armadura de destino
    if tgt.animation_data is None:
        tgt.animation_data_create()
    act = bpy.data.actions.new(nombre)
    tgt.animation_data.action = act
    for pb in tgt.pose.bones:
        pb.rotation_mode = "QUATERNION"

    def profundidad(b):
        n = 0
        while b.parent:
            b, n = b.parent, n + 1
        return n
    orden = sorted(tgt.data.bones, key=profundidad)  # padres antes que hijos
    giro = Quaternion()
    if frente is not None:
        scn.frame_set(int(frente))
        giro = Quaternion((0, 0, 1), -(yaw_at() - yaw_t))
        print(f"frente: el actor estaba girado {math.degrees(yaw_at() - yaw_t):.0f}°")
    paso = fps_fuente / fps
    prev_q = {}
    f_out, f_src = 1, float(inicio)
    origen_xy = None
    while f_src <= fin + 1e-6:
        fi = int(math.floor(f_src))
        scn.frame_set(fi, subframe=f_src - fi)
        hips_now = src.matrix_world @ src.pose.bones[SH].head
        delta = giro @ ((hips_now - src_hips_t) * escala)
        if origen_xy is None:
            origen_xy = Vector((delta.x, delta.y, 0.0))
        delta -= origen_xy                       # el clip empieza en el sitio del personaje
        if en_el_sitio:
            delta.x = delta.y = 0.0
        pose_m = {}
        for bone in orden:
            n = bone.name
            pb = tgt.pose.bones[n]
            if n in rs_t:
                sb = mapa[n][0]
                d = giro @ _rot(_src_world(src, sb)) @ rs_t[n].inverted()
                q_world = d @ align[n] @ rest_world_rot[n]
                q_arm = obj_r.inverted() @ q_world   # giro en el espacio de la armadura
            else:
                q_arm = None
            if bone.parent is None:
                loc_world = tgt_hips + delta
                loc_arm = obj_inv @ loc_world
                m_target = Matrix.Translation(loc_arm) @ (q_arm or _rot(rest[n])).to_matrix().to_4x4()
                basis = rest[n].inverted() @ m_target
                pb.location = basis.translation
                q_basis = basis.to_quaternion()
                pose_m[n] = m_target
            else:
                p = bone.parent.name
                base = pose_m[p] @ (rest[p].inverted() @ rest[n])
                if q_arm is not None:
                    q_basis = base.to_quaternion().inverted() @ q_arm
                else:
                    q_basis = Quaternion()
                pose_m[n] = base @ q_basis.to_matrix().to_4x4()
            if n in prev_q and prev_q[n].dot(q_basis) < 0:
                q_basis.negate()
            prev_q[n] = q_basis.copy()
            pb.rotation_quaternion = q_basis
            pb.keyframe_insert("rotation_quaternion", frame=f_out, group=n)
            if bone.parent is None:
                pb.keyframe_insert("location", frame=f_out, group=n)
        f_out += 1
        f_src += paso
    n_frames = f_out - 1
    toes = ("LeftToeBase", "RightToeBase")
    minimo = 1e9
    for f in range(1, n_frames + 1):
        scn.frame_set(f)
        minimo = min(minimo, *[(obj_m @ tgt.pose.bones[t].head).z for t in toes])
    dz = tgt_toe - minimo
    raiz = [b for b in orden if b.parent is None][0]
    v_basis = rest[raiz.name].to_3x3().inverted() @ (obj_inv.to_3x3() @ Vector((0, 0, dz)))
    pb = tgt.pose.bones[raiz.name]
    for f in range(1, n_frames + 1):
        scn.frame_set(f)
        pb.location = pb.location + v_basis
        pb.keyframe_insert("location", frame=f, group=raiz.name)
    act["suelo_corregido_m"] = round(dz, 4)
    act["fotogramas"] = n_frames
    return act
