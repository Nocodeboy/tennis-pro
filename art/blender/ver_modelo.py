"""Vista de comprobación de un modelo del juego ({gltf, bin, tex} como hero.json): de frente, de lado y de cerca,
junto al jugador (hero.json) para comparar, con el mango de la pala en la mano derecha. Workbench con la textura, sin
GPU. (Viene del pickleball 0.13.)

Uso:
  python3 art/blender/ver_modelo.py <modelo.json> <salida.png>           # frente, lado, cara y manos
  python3 art/blender/ver_modelo.py <modelo.json> <salida.png> --manos   # las manos con el mango, de cerca
"""
import base64
import json
import math
import os
import struct
import sys

import bpy
from mathutils import Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(AQUI, "..", ".."))


def glb(path_json, out):
    h = json.load(open(path_json))
    g = h["gltf"]
    b = base64.b64decode(h["bin"])
    g["buffers"] = [{"byteLength": len(b)}]
    js = json.dumps(g, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    b += b"\0" * ((4 - len(b) % 4) % 4)
    with open(out, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(b)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(b), 0x004E4942) + b)
    tex = h["tex"]
    ext = tex.split(";")[0].split("/")[1]
    tp = out.rsplit(".", 1)[0] + "." + ext
    with open(tp, "wb") as f:
        f.write(base64.b64decode(tex.split(",", 1)[1]))
    return tp


def cargar(path_json, dx, tag):
    tmp = f"/tmp/pb-ver-{tag}-{os.getpid()}.glb"
    tp = glb(path_json, tmp)
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=tmp)
    nuevos = [o for o in bpy.data.objects if o not in antes]
    img = bpy.data.images.load(tp)
    for o in nuevos:
        if o.parent is None:
            o.location.x += dx
        if o.type == "MESH":
            for slot in o.material_slots:
                m = slot.material
                nt = m.node_tree
                bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
                t = nt.nodes.new("ShaderNodeTexImage")
                t.image = img
                nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    return nuevos


MANOS = "--manos" in sys.argv


def main():
    modelo, salida = sys.argv[1], sys.argv[2]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cargar(os.path.join(REPO, "assets/chars/hero.json"), -1.0, "hero")
    cargar(modelo, 1.0, "otro")
    # el mango de la pala en la mano derecha (PADDLE_POSE de chars.ts y el mango elíptico de gear.ts), en la persona
    sys.path.insert(0, AQUI)
    from persona import Jugador, mango
    o, d, nx, ez, (r0, r1), (a0, a1) = mango(Jugador())
    o = o + Vector((1.0, 0, 0))
    bpy.ops.mesh.primitive_cylinder_add(radius=1.0, depth=a1 - a0, location=o + d * (a0 + a1) / 2)
    cyl = bpy.context.active_object
    from mathutils import Matrix
    R = Matrix((nx, ez, d)).transposed()
    cyl.matrix_world = Matrix.Translation(o + d * (a0 + a1) / 2) @ R.to_4x4() @ Matrix.Diagonal((r0, r1, 1, 1))
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_WORKBENCH"
    scn.display.shading.light = "STUDIO"
    scn.display.shading.color_type = "TEXTURE"
    scn.world = bpy.data.worlds.new("w")
    vistas = [
        ("frente", (0, -6, 1.0), (0, 0, 1.0), 3.6, 900, 700),
        ("lado", (6, 0.0, 1.0), (0, 0, 1.0), 2.4, 900, 700),
        ("cara", (1.0, -1.2, 1.52), (1.0, 0, 1.52), 0.35, 400, 400),
        ("cara-heroe", (-1.0, -1.2, 1.52), (-1.0, 0, 1.52), 0.35, 400, 400),
        ("mano", (1.0 - 0.7, -0.9, 1.3), (1.0 - 0.7, 0, 1.3), 0.3, 400, 400),
        ("mano-arriba", (1.0 - 0.7, 0.02, 2.2), (1.0 - 0.7, 0.0, 1.3), 0.3, 400, 400),
        ("mano-heroe", (-1.0 - 0.7, -0.9, 1.3), (-1.0 - 0.7, 0, 1.3), 0.3, 400, 400),
        ("mano-izq", (1.0 + 0.7, -0.9, 1.3), (1.0 + 0.7, 0, 1.3), 0.3, 400, 400),
    ]
    if MANOS:
        vistas = [
            ("d-frente", (0.3, -0.9, 1.3), (0.3, 0, 1.3), 0.22, 450, 450),
            ("d-arriba", (0.3, 0.0, 2.2), (0.3, 0.0001, 1.3), 0.22, 450, 450),
            ("d-abajo", (0.3, 0.0, 0.4), (0.3, 0.0001, 1.3), 0.22, 450, 450),
            ("d-detras", (0.3, 0.9, 1.3), (0.3, 0, 1.3), 0.22, 450, 450),
            ("i-frente", (1.7, -0.9, 1.3), (1.7, 0, 1.3), 0.22, 450, 450),
            ("i-arriba", (1.7, 0.0, 2.2), (1.7, 0.0001, 1.3), 0.22, 450, 450),
            ("i-detras", (1.7, 0.9, 1.3), (1.7, 0, 1.3), 0.22, 450, 450),
            ("h-frente", (-1.7, -0.9, 1.3), (-1.7, 0, 1.3), 0.22, 450, 450),
        ]
    from PIL import Image
    tiles = []
    for nombre, pos, mira, orto, w, h in vistas:
        cd = bpy.data.cameras.new(nombre)
        cd.type = "ORTHO"
        cd.ortho_scale = orto
        c = bpy.data.objects.new(nombre, cd)
        scn.collection.objects.link(c)
        c.location = pos
        d = Vector(mira) - Vector(pos)
        c.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scn.camera = c
        scn.render.resolution_x, scn.render.resolution_y = w, h
        tmp = f"/tmp/pb-ver-{nombre}-{os.getpid()}.png"
        scn.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        tiles.append(Image.open(tmp).convert("RGB"))
    if MANOS:
        out = Image.new("RGB", (1800, 900), "white")
        for i, t in enumerate(tiles):
            out.paste(t, ((i % 4) * 450, (i // 4) * 450))
        out.save(salida)
        print(salida)
        return
    out = Image.new("RGB", (1800, 700 + 800), "white")
    out.paste(tiles[0], (0, 0))
    out.paste(tiles[1], (900, 0))
    for i, t in enumerate(tiles[2:]):
        out.paste(t, ((i % 4) * 450, 700 + (i // 4) * 400))
    out.save(salida)
    print(salida)


if __name__ == "__main__":
    main()
