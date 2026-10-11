"""The floodlights' light on the floor of the padel arena, baked in Blender (Cycles). Ported from the pickleball's.

The venue comes from the page as it builds it (tools/scene-dump.py: the bowl, the furniture, the boards, the net and
the cage in world coordinates, and the lamps of the roof's ring with where each points). Here every lamp becomes a
soft spot light where it is, the venue occludes, and the light that reaches the floor (direct and one bounce) is baked
into a texture over the whole floor inside the stands: the blue court lit evenly, the light falling off towards the
stands, the soft crossed shadows of the cage's steel and its wire mesh, the net, its posts, the boards and the
furniture from every lamp, the darkening at the foot of everything. The glass is nearly clear here (it lets almost
all the light through: no hard shadow of its panes), the wire mesh lets most of it through (a veil of shade).

The texture is normalised (the middle of the court = 1) and stored as an 8-bit grey (value / RANGE): the game
multiplies the floor's light by it (src/render/floorlight.ts).

Usage: python3 tools/scene-dump.py dist /tmp/venue.json && python3 art/blender/floorlight.py /tmp/venue.json [--quick]
Writes assets/light/floor.webp and /tmp/padel-floorlight.png (a preview).
"""
import base64
import json
import math
import os
import sys

import bpy  # noqa: E402
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(REPO, "assets", "light", "floor.webp")
QUICK = "--quick" in sys.argv

# the floor's rectangle (three.js x and z, m) and the texture's size: keep in step with src/render/floorlight.ts
X0, X1 = -10.1, 10.1
Z0, Z1 = -15.0, 15.0
TW, TH = (512, 768) if QUICK else (1024, 1536)
RANGE = 1.6
SAMPLES = 24 if QUICK else 96
# how clear the cage is to the floodlights (1: not there)
WIRE_CLEAR = 0.82
GLASS_CLEAR = 0.96


def to_b(x, y, z):
    """three.js (Y up) -> Blender (Z up)"""
    return (x, -z, y)


def mesh_from(name, pos, idx, mat):
    P = np.frombuffer(base64.b64decode(pos), dtype=np.float32).reshape(-1, 3)
    V = [to_b(*p) for p in P]
    if idx:
        I = np.frombuffer(base64.b64decode(idx), dtype=np.uint32).reshape(-1, 3)
    else:
        I = np.arange(len(P), dtype=np.uint32).reshape(-1, 3)
    me = bpy.data.meshes.new(name)
    me.from_pydata(V, [], [tuple(int(i) for i in t) for t in I])
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


def material(name, grey, transparent=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (grey, grey, grey, 1)
    b.inputs["Roughness"].default_value = 0.9
    if transparent > 0:
        out = nt.nodes["Material Output"]
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        mix.inputs["Fac"].default_value = 1 - transparent
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(b.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def blur(a, r):
    """a small separable Gaussian (the bake's noise)"""
    k = np.exp(-0.5 * (np.arange(-3 * r, 3 * r + 1) / r) ** 2)
    k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, 3 * r, mode="edge"), k, "valid"), 0, a)
    a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, 3 * r, mode="edge"), k, "valid"), 1, a)
    return a


def main():
    src = [a for a in sys.argv[1:] if not a.startswith("--")][0]
    d = json.load(open(src))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if "cycles" not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module="cycles")
    scn = bpy.context.scene
    m_solid = material("solid", 0.22)
    # how much light each see-through kind lets through: the net's cords, the cage's welded mesh (3 mm wire every
    # 5 cm, a little more of it at the lamps' slant), the glass (nearly all)
    kinds = {
        "net": material("net", 0.05, transparent=0.8),
        "wire": material("wire", 0.05, transparent=WIRE_CLEAR),
        "glass": material("glass", 0.3, transparent=GLASS_CLEAR),
    }
    for i, m in enumerate(d["meshes"]):
        mesh_from(f"m{i}_{m['kind']}", m["pos"], m["idx"], kinds.get(m["kind"], m_solid))

    # the floor: one quad over the rectangle, its uv the texture's
    me = bpy.data.meshes.new("floor")
    corners = [(X0, Z0), (X1, Z0), (X1, Z1), (X0, Z1)]
    me.from_pydata([to_b(x, 0.0, z) for x, z in corners], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for li, loop in enumerate(me.loops):
        x, z = corners[loop.vertex_index]
        uv.data[li].uv = ((x - X0) / (X1 - X0), (z - Z0) / (Z1 - Z0))
    floor = bpy.data.objects.new("floor", me)
    scn.collection.objects.link(floor)
    m_floor = material("floor", 0.55)
    floor.data.materials.append(m_floor)
    if Vector(floor.data.polygons[0].normal).z < 0:
        floor.data.flip_normals()
    img = bpy.data.images.new("floorlight", TW, TH, float_buffer=True)
    tex = m_floor.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    m_floor.node_tree.nodes.active = tex

    # the lamps: a soft spot each, a little in front of its housing, aimed where it points
    for i, (x, y, z, dx, dy, dz) in enumerate(d["lamps"]):
        ld = bpy.data.lights.new(f"lamp{i}", "SPOT")
        ld.energy = 60000
        ld.spot_size = math.radians(70)
        ld.spot_blend = 0.6
        ld.shadow_soft_size = 0.55
        o = bpy.data.objects.new(f"lamp{i}", ld)
        scn.collection.objects.link(o)
        p = Vector(to_b(x, y, z))
        n = Vector(to_b(dx, dy, dz)).normalized()
        o.location = p + n * 0.6
        o.rotation_euler = n.to_track_quat("-Z", "Y").to_euler()
    scn.world = bpy.data.worlds.new("night")
    scn.world.use_nodes = True
    scn.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.0, 0.0, 0.0, 1)

    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = SAMPLES
    scn.cycles.max_bounces = 2
    scn.cycles.diffuse_bounces = 1
    bk = scn.render.bake
    bk.use_pass_direct = True
    bk.use_pass_indirect = True
    bk.use_pass_color = False
    bk.margin = 4
    for o in scn.objects:
        o.select_set(False)
    floor.select_set(True)
    bpy.context.view_layer.objects.active = floor
    bpy.ops.object.bake(type="DIFFUSE")

    a = np.array(img.pixels[:], dtype=np.float32).reshape(TH, TW, 4)[:, :, 0]
    a = blur(a, 2 if QUICK else 3)
    # the middle of the court = 1 (inside its lines, away from the net's shadow)
    xs = X0 + (np.arange(TW) + 0.5) / TW * (X1 - X0)
    zs = Z0 + (np.arange(TH) + 0.5) / TH * (Z1 - Z0)
    XX, ZZ = np.meshgrid(xs, zs)
    court = (np.abs(XX) < 3.5) & (np.abs(ZZ) > 1.5) & (np.abs(ZZ) < 7.5)
    a = a / np.median(a[court])
    inside = (np.abs(XX) < 4.9) & (np.abs(ZZ) < 9.9)
    print(f"LUZ: centro {np.percentile(a[court], 5):.2f}–{np.percentile(a[court], 95):.2f}, "
          f"toda la pista {np.percentile(a[inside], 1):.2f}–{np.percentile(a[inside], 99):.2f}, "
          f"todo el suelo {np.percentile(a, 1):.2f}–{np.percentile(a, 99):.2f}")
    g = np.clip(a / RANGE, 0, 1)
    from PIL import Image
    # (image rows run from the top: the bake's from the bottom)
    im = Image.fromarray((np.flipud(g) * 255 + 0.5).astype(np.uint8), "L")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    im.save(OUT, "WEBP", quality=90)
    im.save("/tmp/padel-floorlight.png")
    print(f"ESCRITO {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB, {TW}×{TH})")


main()
