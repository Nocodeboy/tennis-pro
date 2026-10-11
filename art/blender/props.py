"""The padel court's furniture modelled in Blender: the umpire's high chair at the net, the players' benches (towel,
bottles and bag), the TV cameras on their tripods, the photographers' stools and the padel net posts (rectangular
steel posts against the side mesh, with the winder and its crank and the net's cable fittings). Ported from the
pickleball's (0.12); the line judges' chairs are gone (padel has no line judges) and the net post is padel's.

Everything is built by code (bmesh), the ambient occlusion is baked into each vertex with Cycles (a floor under each
prop, so the parts near the ground darken), and the result is written as one compact binary the venue fetches at load
(assets/props/props.bin) and a small generated index (src/render/blender-props-data.ts: the materials and where each
prop is in the binary). Per vertex: position in mm, normal, material, AO.

Usage (Blender as a Python module):  pip install bpy==5.2.2 ; python3 art/blender/props.py [--preview]
--preview also renders a sheet of the props to /tmp/padel-props.png
Axes here: Blender's (Z up, the prop's front towards -Y); the binary stores three.js's (Y up, front towards +Z).
"""
import json
import math
import os
import struct
import sys

import bpy  # noqa: E402  (bpy before bmesh / mathutils)
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_TS = os.path.join(REPO, "src", "render", "blender-props-data.ts")
OUT_BIN = os.path.join(REPO, "assets", "props", "props.bin")
PREVIEW = "--preview" in sys.argv

# materials: name, sRGB colour, roughness, metalness (the venue's Solid takes roughness / metalness per vertex)
MATS = [
    ("graphite", 0x1b1e24, 0.38, 0.6),
    ("graphite2", 0x2a2e36, 0.4, 0.6),
    ("navy", 0x18202c, 0.5, 0.1),
    ("tour", 0x14365c, 0.5, 0.1),
    ("black", 0x111317, 0.55, 0.0),
    ("plastic", 0x15171b, 0.55, 0.0),
    ("cushion", 0x1e2836, 0.78, 0.0),
    ("towel", 0xeeeeea, 0.95, 0.0),
    ("lime", 0xcfe23a, 0.5, 0.0),
    ("bottle", 0xf0f2f4, 0.35, 0.0),
    ("bottle2", 0xe2f04a, 0.35, 0.0),
    ("bag", 0x2a3442, 0.85, 0.0),
    ("rubber", 0x0b0c0e, 0.9, 0.0),
    ("cambody", 0x22262c, 0.5, 0.2),
    ("lens", 0x0c0d10, 0.35, 0.3),
    ("red", 0xc8202a, 0.5, 0.0),
    ("steel", 0x8a9099, 0.35, 0.8),
    ("screen", 0x1a2a3a, 0.15, 0.4),
    ("white", 0xe4e7ea, 0.42, 0.1),
    ("silver", 0xb4bac2, 0.32, 0.75),
    ("blue", 0x1f4a86, 0.72, 0.0),
    ("camgrey", 0x9ea4ac, 0.45, 0.15),
]
M = {name: i for i, (name, *_r) in enumerate(MATS)}


def hexcol(h):
    s = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in s]


# ------------------------------------------------------------------ building blocks


class Builder:
    def __init__(self):
        self.bm = bmesh.new()

    def _new(self, before, mat):
        new = [f for f in self.bm.faces if f not in before]
        for f in new:
            f.material_index = M[mat]
        return new

    def box(self, c, s, mat, bevel=0.0, segs=2, rot=None):
        before = set(self.bm.faces)
        m = Matrix.Translation(Vector(c))
        if rot is not None:
            m = m @ rot.to_4x4()
        m = m @ Matrix.Diagonal((*s, 1.0))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        new = self._new(before, mat)
        if bevel > 0:
            edges = list({e for f in new for e in f.edges})
            bev = bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, offset_type="OFFSET", segments=segs,
                                  profile=0.5, affect="EDGES", clamp_overlap=True)
            for f in bev.get("faces", []):
                f.material_index = M[mat]
        return res

    def tube(self, p0, p1, r, mat, seg=10, r1=None, caps=True):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        L = d.length
        if L < 1e-6:
            return
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        m = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4()
        before = set(self.bm.faces)
        bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r,
                              radius2=r if r1 is None else r1, depth=L, matrix=m)
        self._new(before, mat)

    def disc(self, c, r, h, mat, seg=16, axis=(0, 0, 1)):
        c = Vector(c)
        a = Vector(axis).normalized()
        self.tube(c - a * h / 2, c + a * h / 2, r, mat, seg)

    def sphere(self, c, r, mat, seg=12, scale=(1, 1, 1)):
        before = set(self.bm.faces)
        m = Matrix.Translation(Vector(c)) @ Matrix.Diagonal((*scale, 1.0))
        bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r, matrix=m)
        self._new(before, mat)

    def arc(self, center, r, a0, a1, tube_r, mat, plane="xz", n=10, seg=8):
        """a bent tube along a circular arc (a handle, a footrest)"""
        c = Vector(center)
        pts = []
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            if plane == "xz":
                pts.append(c + Vector((r * math.cos(a), 0, r * math.sin(a))))
            elif plane == "yz":
                pts.append(c + Vector((0, r * math.cos(a), r * math.sin(a))))
            else:
                pts.append(c + Vector((r * math.cos(a), r * math.sin(a), 0)))
        for i in range(n):
            self.tube(pts[i], pts[i + 1], tube_r, mat, seg, caps=(i in (0, n - 1)))

    def finish(self, name):
        # dense enough for the AO to show (long edges cut), and normals out
        long_edges = [e for e in self.bm.edges if e.calc_length() > 0.22]
        if long_edges:
            bmesh.ops.subdivide_edges(self.bm, edges=long_edges, cuts=1, use_grid_fill=True)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for _ in MATS:
            pass
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        for mname, col, rough, metal in MATS:
            mat = bpy.data.materials.get("pb_" + mname)
            if mat is None:
                mat = bpy.data.materials.new("pb_" + mname)
                mat.use_nodes = True
                b = mat.node_tree.nodes["Principled BSDF"]
                b.inputs["Base Color"].default_value = (*hexcol(col), 1)
                b.inputs["Roughness"].default_value = rough
                b.inputs["Metallic"].default_value = metal
            me.materials.append(mat)
        return obj


# ------------------------------------------------------------------ the props (front towards -Y, floor at z 0)


def umpire_chair():
    b = Builder()
    # four legs, a little splayed, and the frame round them
    feet = [(sx * 0.34, sy * 0.34, 0.0) for sx in (-1, 1) for sy in (-1, 1)]
    tops = [(sx * 0.29, sy * 0.29, 1.47) for sx in (-1, 1) for sy in (-1, 1)]
    for f, t in zip(feet, tops):
        b.tube(f, t, 0.022, "white", 8)
        b.disc((f[0], f[1], 0.012), 0.035, 0.024, "rubber", 12)
    def ring(z, k):
        pts = [(sx * k, sy * k, z) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for i in range(4):
            b.tube(pts[i], pts[(i + 1) % 4], 0.016, "white", 6)
    ring(0.06, 0.338)
    ring(0.78, 0.316)
    ring(1.44, 0.292)
    # crossed braces on the two sides
    for sx in (-1, 1):
        b.tube((sx * 0.336, -0.336, 0.08), (sx * 0.316, 0.316, 0.76), 0.012, "white", 6)
        b.tube((sx * 0.336, 0.336, 0.08), (sx * 0.316, -0.316, 0.76), 0.012, "white", 6)
        b.tube((sx * 0.314, -0.314, 0.8), (sx * 0.294, 0.294, 1.42), 0.012, "white", 6)
        b.tube((sx * 0.314, 0.314, 0.8), (sx * 0.294, -0.294, 1.42), 0.012, "white", 6)
    # the platform, the seat on its post, the backrest and the arms
    b.box((0, 0, 1.495), (0.74, 0.74, 0.05), "white", bevel=0.012)
    b.tube((0, 0.04, 1.52), (0, 0.04, 1.8), 0.03, "steel", 12)
    b.box((0, 0.02, 1.86), (0.48, 0.44, 0.08), "blue", bevel=0.028, segs=3)
    back = Matrix.Rotation(math.radians(-10), 3, "X")
    b.box((0, 0.255, 2.13), (0.48, 0.06, 0.40), "blue", bevel=0.025, segs=3, rot=back)
    for sx in (-1, 1):
        b.tube((sx * 0.2, 0.22, 1.82), (sx * 0.2, 0.26, 2.0), 0.012, "steel", 8)
        b.tube((sx * 0.26, 0.2, 1.84), (sx * 0.26, -0.14, 1.84), 0.012, "steel", 8)
        b.tube((sx * 0.26, 0.2, 1.84), (sx * 0.26, 0.2, 2.02), 0.012, "steel", 8)
        b.box((sx * 0.26, 0.02, 2.035), (0.06, 0.3, 0.035), "blue", bevel=0.012)
        b.tube((sx * 0.26, -0.14, 1.84), (sx * 0.26, -0.14, 2.02), 0.012, "steel", 8)
        # the side rails of the platform
        b.tube((sx * 0.36, -0.34, 1.52), (sx * 0.36, -0.34, 1.98), 0.014, "white", 6)
        b.tube((sx * 0.36, 0.34, 1.52), (sx * 0.36, 0.34, 1.98), 0.014, "white", 6)
        b.tube((sx * 0.36, -0.34, 1.98), (sx * 0.36, 0.34, 1.98), 0.014, "white", 6)
    # the board in front of the umpire, in the tour's blue, with a lime line along the top and a small screen shelf
    b.box((0, -0.385, 1.82), (0.76, 0.035, 0.6), "tour", bevel=0.01)
    b.box((0, -0.405, 2.085), (0.76, 0.006, 0.026), "lime")
    b.box((0, -0.405, 1.6), (0.76, 0.006, 0.012), "lime")
    b.box((0, -0.32, 2.06), (0.4, 0.14, 0.02), "black", bevel=0.005)
    b.box((0.06, -0.31, 2.08), (0.22, 0.16, 0.012), "screen", rot=Matrix.Rotation(math.radians(18), 3, "X"))
    # the ladder at the back
    for sx in (-1, 1):
        b.tube((sx * 0.2, 0.98, 0.0), (sx * 0.2, 0.37, 1.5), 0.02, "white", 8)
        b.disc((sx * 0.2, 0.98, 0.01), 0.03, 0.02, "rubber", 10)
    for i in range(5):
        t = (i + 1) / 6
        y = 0.98 + (0.37 - 0.98) * t
        z = 1.5 * t
        b.box((0, y, z), (0.4, 0.07, 0.022), "white", bevel=0.006)
    return b.finish("umpire_chair")


def bench():
    """a padded bench 1.7 m long along X, the players' towel draped on its +X end, two bottles in front, a bag
    beyond the +X end (mirrored for the other bench)"""
    b = Builder()
    for x in (-0.76, 0.0, 0.76):
        for y in (-0.17, 0.15):
            b.tube((x, y, 0.0), (x, y, 0.4), 0.018, "silver", 6)
        b.tube((x, -0.19, 0.4), (x, 0.17, 0.4), 0.018, "silver", 6)
        b.tube((x, -0.19, 0.02), (x, 0.17, 0.02), 0.018, "silver", 6)
        b.tube((x, 0.15, 0.4), (x, 0.24, 0.94), 0.015, "silver", 6)
        b.box((x, -0.19, 0.008), (0.05, 0.06, 0.016), "rubber")
        b.box((x, 0.17, 0.008), (0.05, 0.06, 0.016), "rubber")
    b.tube((-0.8, 0.0, 0.38), (0.8, 0.0, 0.38), 0.016, "silver", 6)
    b.box((0, -0.01, 0.43), (1.72, 0.46, 0.085), "blue", bevel=0.03, segs=3)
    b.box((0, 0.235, 0.75), (1.72, 0.06, 0.34), "blue", bevel=0.025, segs=3, rot=Matrix.Rotation(math.radians(-9), 3, "X"))
    b.box((0, 0.262, 0.75), (1.62, 0.008, 0.06), "lime", rot=Matrix.Rotation(math.radians(-9), 3, "X"))
    # the towel: folded on the seat and hanging over the front edge, a lime band near its end
    tx = 0.32
    b.box((tx, -0.02, 0.482), (0.38, 0.4, 0.016), "towel", bevel=0.006)
    b.box((tx, -0.245, 0.4), (0.38, 0.016, 0.17), "towel", bevel=0.006, rot=Matrix.Rotation(math.radians(8), 3, "X"))
    b.box((tx, -0.256, 0.35), (0.382, 0.004, 0.03), "lime", rot=Matrix.Rotation(math.radians(8), 3, "X"))
    b.box((tx, -0.235, 0.475), (0.38, 0.03, 0.02), "towel", bevel=0.009)
    # two bottles in front, on the floor
    for (x, y, mat) in ((-0.42, -0.36, "bottle"), (-0.3, -0.4, "bottle2")):
        b.tube((x, y, 0.0), (x, y, 0.17), 0.034, mat, 14)
        b.tube((x, y, 0.17), (x, y, 0.2), 0.034, mat, 14, r1=0.02)
        b.tube((x, y, 0.2), (x, y, 0.235), 0.021, "black", 12)
        b.tube((x, y, 0.235), (x, y, 0.25), 0.009, "black", 8)
    # a bottle on the seat too
    b.tube((-0.55, -0.05, 0.47), (-0.55, -0.05, 0.64), 0.034, "bottle", 14)
    b.tube((-0.55, -0.05, 0.64), (-0.55, -0.05, 0.67), 0.034, "bottle", 14, r1=0.02)
    b.tube((-0.55, -0.05, 0.67), (-0.55, -0.05, 0.705), 0.021, "red", 12)
    # the bag beyond the +X end: a paddle backpack standing on the floor, zip, handle and pocket
    bx, by = 1.12, 0.0
    b.box((bx, by, 0.2), (0.32, 0.4, 0.4), "bag", bevel=0.07, segs=3)
    b.box((bx, by - 0.205, 0.17), (0.24, 0.04, 0.2), "bag", bevel=0.03, segs=2)
    b.box((bx, by - 0.228, 0.27), (0.18, 0.006, 0.012), "black")
    b.box((bx + 0.07, by - 0.232, 0.27), (0.02, 0.008, 0.04), "lime")
    b.box((bx, by, 0.404), (0.3, 0.012, 0.012), "black")
    b.arc((bx, by, 0.4), 0.06, 0.0, math.pi, 0.011, "black", plane="xz", n=8, seg=6)
    return b.finish("bench")


def tv_camera():
    b = Builder()
    H = 1.30
    for k in range(3):
        a = math.radians(-90 + k * 120)
        top = Vector((math.cos(a) * 0.065, math.sin(a) * 0.065, H - 0.02))
        foot = Vector((math.cos(a) * 0.36, math.sin(a) * 0.36, 0.0))
        mid = top.lerp(foot, 0.55)
        b.tube(top, mid, 0.017, "graphite", 6)
        b.tube(mid, foot, 0.012, "graphite2", 6)
        b.tube(mid + (mid - top).normalized() * -0.02, mid + (mid - top).normalized() * 0.03, 0.022, "black", 8)
        b.disc((foot.x, foot.y, 0.012), 0.022, 0.024, "rubber", 8)
        # the mid-level spreader
        sp = top.lerp(foot, 0.78)
        b.tube(sp, Vector((0, 0, sp.z)), 0.008, "graphite2", 6)
    b.disc((0, 0, H - 0.02), 0.075, 0.06, "graphite", 16)
    b.sphere((0, 0, H + 0.02), 0.07, "black", 14, scale=(1, 1, 0.5))
    b.box((0, 0.01, H + 0.09), (0.15, 0.17, 0.1), "graphite2", bevel=0.015)
    # the pan bars, back towards the operator
    for sx in (-1, 1):
        b.tube((sx * 0.06, 0.06, H + 0.09), (sx * 0.2, 0.56, H - 0.07), 0.012, "steel", 8)
        b.tube((sx * 0.17, 0.46, H - 0.04), (sx * 0.2, 0.56, H - 0.07), 0.018, "rubber", 8)
    # the camera body, its top handle, battery and viewfinder
    zc = H + 0.28
    b.box((0, 0.03, zc), (0.22, 0.46, 0.27), "camgrey", bevel=0.02, segs=2)
    b.box((0, 0.285, zc - 0.01), (0.17, 0.07, 0.22), "graphite2", bevel=0.012)
    b.box((0.112, 0.0, zc), (0.006, 0.3, 0.14), "graphite2")
    for y in (-0.12, 0.16):
        b.tube((0, y, zc + 0.135), (0, y, zc + 0.2), 0.012, "black", 8)
    b.tube((0, -0.13, zc + 0.2), (0, 0.17, zc + 0.2), 0.014, "black", 8)
    b.box((-0.09, 0.1, zc + 0.22), (0.15, 0.17, 0.11), "black", bevel=0.012)
    b.box((-0.09, 0.012, zc + 0.22), (0.13, 0.008, 0.085), "screen")
    b.box((0.05, -0.17, zc + 0.15), (0.03, 0.03, 0.02), "red", bevel=0.004)
    # the long broadcast lens and its hood
    b.tube((0, -0.2, zc - 0.02), (0, -0.52, zc - 0.02), 0.068, "lens", 16)
    b.tube((0, -0.52, zc - 0.02), (0, -0.6, zc - 0.02), 0.082, "lens", 16, r1=0.09)
    b.tube((0, -0.31, zc - 0.02), (0, -0.33, zc - 0.02), 0.071, "red", 16)
    b.box((0.085, -0.33, zc - 0.03), (0.05, 0.16, 0.09), "black", bevel=0.012)
    b.tube((0, 0.04, H + 0.15), (0.08, 0.3, 0.05), 0.008, "black", 6)
    return b.finish("tv_camera")


def net_post():
    """a padel net post: a rectangular steel post (12 × 8 cm, 0.92 m: the net's height at the posts) whose back is flush
    with the side mesh (y = 0) and whose face, towards -Y, takes the net. On a plate bolted to the floor; the cap
    carries the head cable's pulley; the winder on its +X side (a ratchet housing, the drum and the crank with its
    knob) and the cable running up the side to the pulley; the net's side bar and its ties down the face, the eye for
    the bottom cord"""
    b = Builder()
    H = 0.92
    D = 0.08
    WD = 0.12
    yc = -D / 2 - 0.003
    yf = yc - D / 2  # the face to the net
    # the base plate and its four bolts
    b.box((0, yc - 0.01, 0.006), (0.2, 0.15, 0.012), "graphite2", bevel=0.003, segs=1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.disc((sx * 0.078, yc - 0.01 + sy * 0.05, 0.016), 0.009, 0.01, "steel", 8)
    # the post and its cap
    b.box((0, yc, H / 2), (WD, D, H), "graphite", bevel=0.008, segs=2)
    b.box((0, yc, H + 0.012), (WD + 0.012, D + 0.012, 0.024), "graphite2", bevel=0.005)
    # the head cable's pulley: a fork out of the face under the cap, its wheel, and the cable out to the net
    b.box((0, yf - 0.014, H - 0.025), (0.046, 0.028, 0.05), "black", bevel=0.005)
    b.disc((0, yf - 0.02, H - 0.025), 0.019, 0.014, "steel", 14, axis=(1, 0, 0))
    b.tube((0, yf - 0.024, H - 0.044), (0, yf - 0.16, H - 0.05), 0.0045, "steel", 6)
    # the net's side bar down the face, laced to the post with ties, and the eye for the bottom cord
    b.tube((0, yf - 0.012, 0.05), (0, yf - 0.012, H - 0.06), 0.008, "graphite2", 8)
    for z in (0.12, 0.3, 0.48, 0.66, 0.82):
        b.box((0, yf - 0.006, z), (0.03, 0.026, 0.014), "black", bevel=0.004)
    b.arc((0, yf - 0.01, 0.045), 0.014, 0.0, 2 * math.pi, 0.004, "steel", plane="yz", n=8, seg=5)
    # the winder on the +X side: the ratchet's housing, the drum, the crank down from its spindle and its knob
    xs = WD / 2
    b.box((xs + 0.022, yc, 0.6), (0.044, 0.064, 0.13), "black", bevel=0.008)
    b.disc((xs + 0.05, yc, 0.62), 0.026, 0.016, "steel", 14, axis=(1, 0, 0))
    b.tube((xs + 0.062, yc, 0.62), (xs + 0.062, yc - 0.012, 0.5), 0.008, "steel", 8)
    b.tube((xs + 0.062, yc - 0.012, 0.5), (xs + 0.11, yc - 0.012, 0.5), 0.011, "lime", 10)
    # the cable from the drum up the side to the pulley
    b.tube((xs + 0.004, yc - 0.02, 0.67), (xs + 0.004, yc - 0.02, H - 0.01), 0.0035, "steel", 5)
    b.box((xs + 0.006, yc - 0.02, H - 0.01), (0.012, 0.02, 0.02), "black", bevel=0.003)
    return b.finish("net_post")


def stool():
    b = Builder()
    for k in range(4):
        a = math.radians(45 + k * 90)
        b.tube((math.cos(a) * 0.17, math.sin(a) * 0.17, 0.0), (math.cos(a) * 0.12, math.sin(a) * 0.12, 0.27), 0.011, "graphite2", 8)
        b.disc((math.cos(a) * 0.17, math.sin(a) * 0.17, 0.006), 0.015, 0.012, "rubber", 8)
    b.arc((0, 0, 0.11), 0.15, 0, 2 * math.pi, 0.007, "graphite2", plane="xy", n=12, seg=6)
    b.disc((0, 0, 0.285), 0.165, 0.035, "cushion", 18)
    # a camera bag on the floor beside it
    b.box((0.27, 0.05, 0.11), (0.22, 0.16, 0.22), "bag", bevel=0.03, segs=2)
    b.box((0.27, 0.05, 0.225), (0.16, 0.012, 0.01), "black")
    return b.finish("stool")


PROPS = [umpire_chair, bench, tv_camera, net_post, stool]


# ------------------------------------------------------------------ AO bake (Cycles, into a colour per corner)


def bake_ao(obj):
    scn = bpy.context.scene
    floor = bpy.data.objects.get("pb_floor")
    if floor is None:
        bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
        floor = bpy.context.active_object
        floor.name = "pb_floor"
    # only this prop and the floor occlude (the props are all built at the origin)
    for o in scn.objects:
        if o.type == "MESH":
            o.hide_render = o not in (obj, floor)
    me = obj.data
    attr = me.color_attributes.new("ao", "BYTE_COLOR", "CORNER")
    me.color_attributes.active_color = attr
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = 48
    scn.render.bake.target = "VERTEX_COLORS"
    scn.render.bake.use_selected_to_active = False
    if scn.world is None:
        scn.world = bpy.data.worlds.new("w")
    scn.world.light_settings.distance = 0.45
    bpy.ops.object.bake(type="AO")
    return attr


# ------------------------------------------------------------------ export


def export(obj):
    """triangles with split normals; per vertex: position (mm), normal (×127), material, AO (0..255)"""
    me = obj.data
    me.calc_loop_triangles()
    normals = me.corner_normals
    ao = me.color_attributes["ao"].data
    key_to_idx = {}
    pos, nrm, mat, occ, idx = [], [], [], [], []
    for tri in me.loop_triangles:
        mi = me.polygons[tri.polygon_index].material_index
        corners = list(tri.loops)
        for li in corners:
            v = me.loops[li].vertex_index
            co = me.vertices[v].co
            n = normals[li].vector
            a = ao[li].color[0]
            # Blender (x, y, z) -> three.js (x, z, -y)
            P = (round(co.x * 1000), round(co.z * 1000), round(-co.y * 1000))
            N = (round(n.x * 127), round(n.z * 127), round(-n.y * 127))
            A = max(0, min(255, round(a * 255)))
            key = (P, N, mi, A // 4)
            k = key_to_idx.get(key)
            if k is None:
                k = len(pos)
                key_to_idx[key] = k
                pos.append(P)
                nrm.append(N)
                mat.append(mi)
                occ.append(A)
            idx.append(k)
    return pos, nrm, mat, occ, idx


def pack(pos, nrm, mat, occ, idx):
    nv = len(pos)
    out = bytearray()
    out += struct.pack("<II", nv, len(idx))
    out += struct.pack(f"<{nv * 3}h", *[c for p in pos for c in p])
    out += struct.pack(f"<{nv * 3}b", *[max(-127, min(127, c)) for n in nrm for c in n])
    out += bytes(mat)
    out += bytes(occ)
    if len(out) % 2:
        out += b"\0"
    out += struct.pack(f"<{len(idx)}H", *idx)
    return bytes(out)


def render_preview(objs):
    scn = bpy.context.scene
    for o in scn.objects:
        o.hide_render = False
    x = 0.0
    for o in objs:
        o.location.x = x
        x += max(o.dimensions.x, 1.0) + 0.6
    for o in objs:
        me = o.data
        for i, m in enumerate(me.materials):
            nt = m.node_tree
            if "ao_attr" in nt.nodes:
                continue
            at = nt.nodes.new("ShaderNodeVertexColor")
            at.name = "ao_attr"
            at.layer_name = "ao"
            mul = nt.nodes.new("ShaderNodeMix")
            mul.data_type = "RGBA"
            mul.blend_type = "MULTIPLY"
            mul.inputs["Factor"].default_value = 1.0
            b = nt.nodes["Principled BSDF"]
            mul.inputs[6].default_value = b.inputs["Base Color"].default_value
            nt.links.new(at.outputs["Color"], mul.inputs[7])
            nt.links.new(mul.outputs[2], b.inputs["Base Color"])
    floor = bpy.data.objects["pb_floor"]
    floor.scale = (6, 2, 1)
    floor.location = (x / 2 - 0.8, 0, 0)
    fm = bpy.data.materials.new("floor")
    fm.use_nodes = True
    fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*hexcol(0x2a5da8), 1)
    floor.data.materials.append(fm)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    scn.collection.objects.link(sun)
    scn.world.use_nodes = True
    scn.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.35, 0.4, 0.5, 1)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scn.collection.objects.link(cam)
    tgt = Vector((x / 2 - 0.8, 0, 0.8))
    cam.location = tgt + Vector((0.5, -9.5, 3.2))
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 40
    scn.camera = cam
    scn.cycles.samples = 32
    scn.cycles.use_denoising = True
    scn.render.resolution_x, scn.render.resolution_y = 1600, 600
    scn.view_settings.view_transform = "AgX"
    scn.render.filepath = "/tmp/padel-props.png"
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if "cycles" not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module="cycles")
    objs = []
    data = {}
    for fn in PROPS:
        obj = fn()
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        obj.select_set(False)
        bake_ao(obj)
        pos, nrm, mat, occ, idx = export(obj)
        data[obj.name] = pack(pos, nrm, mat, occ, idx)
        print(f"PROP {obj.name}: {len(pos)} vértices, {len(idx) // 3} triángulos, "
              f"AO media {sum(occ) / len(occ) / 255:.2f}")
        objs.append(obj)
    mats = [{"n": n, "c": c, "r": r, "m": m} for n, c, r, m in MATS]
    blob = bytearray()
    index = {}
    for name, raw in data.items():
        # (each block on a 4-byte boundary)
        while len(blob) % 4:
            blob += b"\0"
        index[name] = [len(blob), len(raw)]
        blob += raw
    os.makedirs(os.path.dirname(OUT_BIN), exist_ok=True)
    with open(OUT_BIN, "wb") as f:
        f.write(blob)
    with open(OUT_TS, "w") as f:
        f.write("// Generated by art/blender/props.py (Blender " + bpy.app.version_string + "). Do not edit by hand.\n")
        f.write("// The props live in assets/props/props.bin (shipped as props.json too, see blender-props.ts); per prop: [byte offset, length] of its block, which is\n")
        f.write("// u32 vertices, u32 indices, i16 position (mm) ×3, i8 normal ×3, u8 material, u8 AO, u16 indices.\n")
        f.write("export const PROP_MATS = " + json.dumps(mats) + " as const;\n")
        f.write("export const PROP_INDEX: Record<string, [number, number]> = " + json.dumps(index) + ";\n")
    print(f"ESCRITO {OUT_BIN} ({len(blob) / 1024:.0f} KB) y {OUT_TS}")
    if PREVIEW:
        render_preview(objs)


main()
