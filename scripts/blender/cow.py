"""Low-poly Holstein cow for uValley: mesh, coat colors, rig and export to public/models/cow.glb.

Run it inside Blender 4.2+ (Scripting tab, or through the Blender MCP):

    path = r"<repo>/scripts/blender/cow.py"
    exec(open(path).read(), {"__file__": path, "__name__": "__main__"})

How the model is made (the same recipe will serve the other animals):
1. The body is a list of analytic parts (ellipsoids and round cones) in real meters. They are
   built as meshes, fused by a voxel remesh, smoothed and decimated into one faceted low-poly shell.
2. Thin parts (horns, ears, teats, tail) are added afterwards as tiny low-poly meshes, so the
   remesh does not swallow them.
3. Each face takes one flat color (face-corner color attribute) from the part it belongs to and
   from the coat pattern (black ellipsoid patches, some with a white hole, like a Holstein).
4. A small armature (spine, neck, head, two tail bones, two bones per leg) skins the mesh with
   weights computed from the parts, not from heat maps, so the result is deterministic.
5. The game turns the bones itself every frame (src/scene/models/riggedAnimals.ts), so the file carries
   no animation; a walk cycle is keyed here only to preview the deformation in Blender.

Blender is Z-up and the cow faces -Y, which glTF turns into Y-up facing +Z (the game's forward).
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(REPO, "public", "models", "cow.glb")
NAME = "Cow"

# Same colors as the procedural animals (src/scene/models/animalModels.ts), as sRGB hex.
WHITE = "#f4f1ea"
BLACK = "#2b2622"
PINK = "#f2a7a7"
HORN = "#efe3c4"
HOOF = "#3a2e26"
MUZZLE = "#4a423d"
TUFT = "#cdbb93"

VOXEL = 0.022  # remesh voxel size (m)
TARGET_TRIS = 2200  # triangles of the fused shell after decimation

# ---------------------------------------------------------------- parts


def v(x, y, z):
    return Vector((x, y, z))


class Ellipsoid:
    def __init__(self, tag, center, radii, pitch=0.0):
        self.tag, self.c, self.r = tag, v(*center), v(*radii)
        self.rot = Matrix.Rotation(pitch, 4, "X")
        self.inv = self.rot.to_3x3().transposed()

    def sdf(self, p):
        q = self.inv @ (p - self.c)
        k = Vector((q.x / self.r.x, q.y / self.r.y, q.z / self.r.z)).length
        return (k - 1.0) * min(self.r)

    def build(self, bm):
        m = Matrix.Translation(self.c) @ self.rot @ Matrix.Diagonal((*self.r, 1.0))
        bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0, matrix=m)


class RoundCone:
    """A capsule whose radius goes from ra (at a) to rb (at b)."""

    def __init__(self, tag, a, b, ra, rb):
        self.tag, self.a, self.b, self.ra, self.rb = tag, v(*a), v(*b), ra, rb

    def t(self, p):
        ab = self.b - self.a
        return max(0.0, min(1.0, (p - self.a).dot(ab) / ab.length_squared))

    def sdf(self, p):
        t = self.t(p)
        return (p - self.a.lerp(self.b, t)).length - (self.ra + (self.rb - self.ra) * t)

    def build(self, bm):
        d = self.b - self.a
        rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        mid = Matrix.Translation((self.a + self.b) / 2)
        bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=self.ra, radius2=self.rb, depth=d.length, matrix=mid @ rot)
        for c, r in ((self.a, self.ra), (self.b, self.rb)):
            bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=r, matrix=Matrix.Translation(c))


# Legs: (id, x, y of the hoof, hip z, knee z). Front legs at -y (the head side).
FRONT_Y, HIND_Y = -0.52, 0.66
KNEE_FRONT, KNEE_HIND = 0.42, 0.5
LEGS = [
    ("fl", 0.18, FRONT_Y, 0.98, KNEE_FRONT),
    ("fr", -0.18, FRONT_Y, 0.98, KNEE_FRONT),
    ("hl", 0.19, HIND_Y, 1.02, KNEE_HIND),
    ("hr", -0.19, HIND_Y, 1.02, KNEE_HIND),
]


def leg_parts(leg_id, x, y, hip, knee):
    hind = leg_id[0] == "h"
    if hind:
        # Thigh slopes back to the hock, the cannon comes forward to the hoof.
        upper = RoundCone(f"leg:{leg_id}", (x, y - 0.06, hip), (x, y + 0.07, knee), 0.17, 0.075)
        lower = RoundCone(f"leg:{leg_id}", (x, y + 0.07, knee), (x, y, 0.07), 0.064, 0.056)
    else:
        upper = RoundCone(f"leg:{leg_id}", (x, y, hip), (x, y + 0.02, knee), 0.13, 0.075)
        lower = RoundCone(f"leg:{leg_id}", (x, y + 0.02, knee), (x, y, 0.07), 0.066, 0.056)
    hoof = Ellipsoid(f"hoof:{leg_id}", (x, y - 0.015, 0.05), (0.074, 0.09, 0.05))
    return [upper, lower, hoof]


NECK = RoundCone("neck", (0, -0.62, 1.2), (0, -1.0, 1.34), 0.27, 0.17)

SHELL = [
    Ellipsoid("body", (0, 0.06, 1.08), (0.33, 0.86, 0.36)),  # barrel
    Ellipsoid("body", (0, -0.48, 1.1), (0.3, 0.42, 0.36)),  # chest
    Ellipsoid("body", (0, 0.64, 1.18), (0.3, 0.36, 0.29)),  # rump
    Ellipsoid("body", (0, -0.42, 1.36), (0.17, 0.32, 0.14)),  # withers
    Ellipsoid("body", (0, 0.06, 0.93), (0.3, 0.58, 0.22)),  # belly
    Ellipsoid("body", (0, -0.8, 0.96), (0.15, 0.15, 0.2)),  # brisket
    Ellipsoid("body", (0.21, 0.55, 1.35), (0.08, 0.1, 0.06)),  # hip bones
    Ellipsoid("body", (-0.21, 0.55, 1.35), (0.08, 0.1, 0.06)),
    Ellipsoid("body", (0.1, 0.92, 1.3), (0.05, 0.06, 0.05)),  # pin bones
    Ellipsoid("body", (-0.1, 0.92, 1.3), (0.05, 0.06, 0.05)),
    NECK,
    Ellipsoid("head", (0, -1.12, 1.34), (0.16, 0.17, 0.17)),  # skull
    RoundCone("head", (0, -1.16, 1.31), (0, -1.4, 1.1), 0.155, 0.12),  # face
    Ellipsoid("muzzle", (0, -1.44, 1.05), (0.13, 0.095, 0.1)),
    Ellipsoid("udder", (0, 0.4, 0.75), (0.16, 0.2, 0.13)),
]
for leg in LEGS:
    SHELL += leg_parts(*leg)

TAIL_PATH = [v(0, 0.97, 1.37), v(0, 1.02, 1.2), v(0, 1.03, 1.0), v(0, 1.02, 0.8), v(0, 1.0, 0.64)]
TAIL_SPLIT_Z = 1.0  # tail1 above, tail2 below

# Thin parts added after the remesh, built with few faces (tags used only for color/weights).
EXTRA = [
    RoundCone("horn", (0.08, -1.06, 1.46), (0.2, -1.04, 1.56), 0.034, 0.014),
    RoundCone("horn", (-0.08, -1.06, 1.46), (-0.2, -1.04, 1.56), 0.034, 0.014),
    Ellipsoid("ear", (0.25, -1.08, 1.36), (0.11, 0.03, 0.06), pitch=0.0),
    Ellipsoid("ear", (-0.25, -1.08, 1.36), (0.11, 0.03, 0.06), pitch=0.0),
    RoundCone("teat", (0.07, 0.32, 0.66), (0.07, 0.32, 0.55), 0.022, 0.016),
    RoundCone("teat", (-0.07, 0.32, 0.66), (-0.07, 0.32, 0.55), 0.022, 0.016),
    RoundCone("teat", (0.07, 0.48, 0.66), (0.07, 0.48, 0.55), 0.022, 0.016),
    RoundCone("teat", (-0.07, 0.48, 0.66), (-0.07, 0.48, 0.55), 0.022, 0.016),
    Ellipsoid("tuft", (0, 1.0, 0.56), (0.045, 0.045, 0.11)),
]
TAIL = [RoundCone("tail", tuple(TAIL_PATH[i]), tuple(TAIL_PATH[i + 1]), 0.04 - 0.005 * i, 0.035 - 0.005 * i) for i in range(4)]
ALL = SHELL + EXTRA + TAIL

# ---------------------------------------------------------------- coat pattern


class Patch:
    """Black ellipsoid patch on the coat, optionally with a white hole (the Holstein rings)."""

    def __init__(self, center, radii, hole=None):
        self.e = Ellipsoid("", center, radii)
        self.hole = Ellipsoid("", *hole) if hole else None

    def black(self, p):
        return self.e.sdf(p) < 0 and not (self.hole and self.hole.sdf(p) < 0)


PATCHES = [
    Patch((0, -0.88, 1.3), (0.4, 0.3, 0.32)),  # neck behind the head
    Patch((0, -0.25, 1.47), (0.36, 0.34, 0.16)),  # over the withers
    Patch((0.36, -0.42, 1.08), (0.12, 0.22, 0.22)),  # left shoulder
    Patch((0.36, 0.02, 1.08), (0.14, 0.32, 0.28)),  # left flank
    Patch((0.33, 0.6, 1.16), (0.16, 0.28, 0.25), ((0.4, 0.62, 1.14), (0.16, 0.12, 0.12))),  # left rump ring
    Patch((-0.36, 0.08, 1.12), (0.14, 0.32, 0.26), ((-0.42, 0.1, 1.12), (0.12, 0.14, 0.11))),  # right flank ring
    Patch((-0.32, 0.62, 1.2), (0.16, 0.26, 0.22)),  # right rump
    Patch((-0.34, -0.38, 1.25), (0.14, 0.2, 0.14)),  # right shoulder
    Patch((0, 0.9, 1.0), (0.3, 0.14, 0.26)),  # back of the thighs
]
EYES = [v(0.135, -1.2, 1.37), v(-0.135, -1.2, 1.37)]


def nearest(p, parts=ALL):
    return min(parts, key=lambda part: part.sdf(p))


def coat(p, part, normal):
    tag = part.tag
    if tag.startswith("hoof"):
        return HOOF
    if tag in ("udder", "teat"):
        return PINK
    if tag == "horn":
        return HORN
    if tag == "tuft":
        return TUFT
    if tag == "muzzle":
        return MUZZLE
    if tag == "ear":
        # Pink inside (the face toward the front), black outside.
        return PINK if normal.y < -0.35 else BLACK
    if tag == "head":
        for eye in EYES:
            d = (p - eye).length
            if d < 0.03:
                return BLACK
            if d < 0.055:
                return WHITE
        # White blaze down the front of the face.
        if abs(p.x) < 0.07 and p.y < -1.16 and normal.y < -0.2:
            return WHITE
        return BLACK
    if tag == "tail":
        return WHITE
    if tag.startswith("leg") and p.z < 0.45:
        return WHITE
    if tag in ("body", "neck") and p.z < 0.84 and not tag == "neck":
        return WHITE  # white belly
    return BLACK if any(patch.black(p) for patch in PATCHES) else WHITE


# ---------------------------------------------------------------- mesh


def srgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)) + (1.0,)


def clear_previous():
    for obj in list(bpy.data.objects):
        if obj.name.startswith(NAME):
            bpy.data.objects.remove(obj, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions, bpy.data.materials):
        for block in list(coll):
            if block.name.startswith(NAME) and block.users == 0:
                coll.remove(block)
    cube = bpy.data.objects.get("Cube")
    if cube:
        cube.hide_set(True)
        cube.hide_render = True


def object_from_bmesh(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def apply_modifier(obj, kind, **settings):
    mod = obj.modifiers.new(kind.lower(), kind)
    for key, value in settings.items():
        setattr(mod, key, value)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def build_shell():
    bm = bmesh.new()
    for part in SHELL:
        part.build(bm)
    obj = object_from_bmesh(NAME + "Shell", bm)
    apply_modifier(obj, "REMESH", mode="VOXEL", voxel_size=VOXEL, adaptivity=0.0)
    apply_modifier(obj, "SMOOTH", factor=0.6, iterations=4)
    faces = len(obj.data.polygons)
    apply_modifier(obj, "DECIMATE", decimate_type="COLLAPSE", ratio=min(1.0, TARGET_TRIS / max(1, 2 * faces)), use_collapse_triangulate=True)
    # The hooves stand on the ground: flatten whatever the smoothing pushed below it.
    for vert in obj.data.vertices:
        vert.co.z = max(0.0, vert.co.z)
    return obj


def tube(bm, path, radii, sides):
    """A tapered tube through `path` (rings of `sides` vertices), capped at both ends."""
    rings = []
    for i, (c, r) in enumerate(zip(path, radii)):
        d = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        basis = d.to_track_quat("Z", "Y").to_matrix()
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            ring.append(bm.verts.new(c + basis @ Vector((math.cos(a) * r, math.sin(a) * r, 0))))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def build_extras():
    bm = bmesh.new()
    for part in EXTRA:
        if isinstance(part, RoundCone):
            d = part.b - part.a
            rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
            mid = Matrix.Translation((part.a + part.b) / 2)
            sides = 6 if part.tag == "horn" else 5
            bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=part.ra, radius2=part.rb, depth=d.length, matrix=mid @ rot)
        else:
            m = Matrix.Translation(part.c) @ Matrix.Diagonal((*part.r, 1.0))
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=1.0, matrix=m)
    tube(bm, TAIL_PATH, [0.04, 0.034, 0.028, 0.024, 0.02], 5)
    return object_from_bmesh(NAME + "Extras", bm)


# Coat colors that the cleanup pass may flip into each other (never horns, hooves, pink...).
COAT = (WHITE, BLACK)


def clean_coat(mesh, colors, flippable, passes=3):
    """Majority vote between neighbor faces: removes lone spikes at the edges of the patches."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    neighbors = [[f.index for e in face.edges for f in e.link_faces if f is not face] for face in bm.faces]
    bm.free()
    for _ in range(passes):
        nxt = list(colors)
        for i, around in enumerate(neighbors):
            if not flippable[i] or colors[i] not in COAT or not around:
                continue
            other = BLACK if colors[i] == WHITE else WHITE
            if sum(colors[j] == other for j in around) * 2 > len(around):
                nxt[i] = other
        colors = nxt
    return colors


def paint(obj):
    mesh = obj.data
    attr = mesh.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    mesh.color_attributes.active_color = attr
    mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    parts = [nearest(poly.center) for poly in mesh.polygons]
    colors = [coat(poly.center, part, poly.normal) for poly, part in zip(mesh.polygons, parts)]
    # Only the patched coat is cleaned (the eyes and the blaze are small on purpose).
    colors = clean_coat(mesh, colors, [part.tag in ("body", "neck") for part in parts])
    for poly, color in zip(mesh.polygons, colors):
        rgba = srgb(color)
        for li in poly.loop_indices:
            attr.data[li].color_srgb = rgba


def preview_material(obj):
    mat = bpy.data.materials.new(NAME + "Coat")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    col = nodes.new("ShaderNodeVertexColor")
    col.layer_name = "Col"
    mat.node_tree.links.new(col.outputs[0], bsdf.inputs[0])
    bsdf.inputs["Roughness"].default_value = 0.9
    obj.data.materials.append(mat)


# ---------------------------------------------------------------- rig

# Bone name -> (head, tail, parent). Names are the contract with src/scene/models/riggedAnimals.ts.
BONES = {
    "spine": ((0, 0.75, 1.12), (0, -0.45, 1.16), None),
    "neck": ((0, -0.6, 1.22), (0, -0.98, 1.34), "spine"),
    "head": ((0, -0.98, 1.34), (0, -1.42, 1.08), "neck"),
    "tail1": (tuple(TAIL_PATH[0]), (0, 1.03, TAIL_SPLIT_Z), "spine"),
    "tail2": ((0, 1.03, TAIL_SPLIT_Z), tuple(TAIL_PATH[-1]), "tail1"),
}
for leg_id, x, y, hip, knee in LEGS:
    knee_y = y + (0.07 if leg_id[0] == "h" else 0.02)
    BONES[f"{leg_id}_upper"] = ((x, y, hip), (x, knee_y, knee), "spine")
    BONES[f"{leg_id}_lower"] = ((x, knee_y, knee), (x, y, 0.02), f"{leg_id}_upper")


def build_armature():
    arm = bpy.data.armatures.new(NAME + "Rig")
    obj = bpy.data.objects.new(NAME + "Rig", arm)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, _parent) in BONES.items():
        bone = arm.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        bone.roll = 0.0
    for name, (_head, _tail, parent) in BONES.items():
        if parent:
            arm.edit_bones[name].parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def weights_for(p):
    part = nearest(p)
    tag = part.tag
    if tag in ("head", "muzzle", "ear", "horn"):
        return {"head": 1.0}
    if tag == "neck":
        t = NECK.t(p)
        head = smoothstep(0.8, 1.0, t)
        neck = smoothstep(0.0, 0.4, t) * (1 - head)
        return {"spine": 1 - neck - head, "neck": neck, "head": head}
    if tag in ("tail", "tuft"):
        low = smoothstep(TAIL_SPLIT_Z + 0.05, TAIL_SPLIT_Z - 0.05, p.z)
        top = smoothstep(TAIL_PATH[0].z - 0.02, TAIL_PATH[0].z + 0.03, p.z)
        return {"tail2": low, "tail1": (1 - low) * (1 - top), "spine": (1 - low) * top}
    if tag.startswith(("leg", "hoof")):
        leg_id = tag.split(":")[1]
        _, _, _, hip, knee = next(leg for leg in LEGS if leg[0] == leg_id)
        lower = smoothstep(knee + 0.05, knee - 0.05, p.z)
        # Blend the top of the leg into the body, so the hip stays attached when it swings.
        body = smoothstep(hip - 0.24, hip - 0.06, p.z)
        return {f"{leg_id}_lower": lower, f"{leg_id}_upper": (1 - lower) * (1 - body), "spine": (1 - lower) * body}
    return {"spine": 1.0}


def skin(mesh_obj, rig):
    for name in BONES:
        mesh_obj.vertex_groups.new(name=name)
    for vert in mesh_obj.data.vertices:
        w = weights_for(vert.co)
        total = sum(w.values()) or 1.0
        for name, value in w.items():
            if value > 1e-3:
                mesh_obj.vertex_groups[name].add([vert.index], value / total, "REPLACE")
    mod = mesh_obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    mesh_obj.parent = rig


def key_walk_preview(rig):
    """A 24-frame walk loop, only to look at the deformation in Blender (not exported)."""
    rig.animation_data_create()
    action = bpy.data.actions.new(NAME + "WalkPreview")
    rig.animation_data.action = action
    phases = {"fl": 0.0, "hr": 0.0, "fr": math.pi, "hl": math.pi}
    for frame in range(0, 25, 3):
        a = 2 * math.pi * frame / 24
        for leg_id, phase in phases.items():
            swing = math.sin(a + phase) * 0.45
            bend = max(0.0, math.sin(a + phase + math.pi / 2)) * 0.7
            upper = rig.pose.bones[f"{leg_id}_upper"]
            lower = rig.pose.bones[f"{leg_id}_lower"]
            upper.rotation_mode = lower.rotation_mode = "XYZ"
            upper.rotation_euler = (swing, 0, 0)
            lower.rotation_euler = (-bend if leg_id[0] == "f" else bend, 0, 0)
            upper.keyframe_insert("rotation_euler", frame=frame)
            lower.keyframe_insert("rotation_euler", frame=frame)
        tail = rig.pose.bones["tail2"]
        tail.rotation_mode = "XYZ"
        tail.rotation_euler = (0, 0, math.sin(a) * 0.25)
        tail.keyframe_insert("rotation_euler", frame=frame)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, 23


# ---------------------------------------------------------------- run


def export(mesh_obj, rig):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    saved_action = rig.animation_data.action if rig.animation_data else None
    if saved_action:
        rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)
    rig.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_skins=True,
        export_def_bones=False,
        export_leaf_bone=False,
        export_materials="NONE",
        export_vertex_color="ACTIVE",
        export_texcoords=False,
        export_normals=False,
    )
    if saved_action:
        rig.animation_data.action = saved_action
    print("exported", OUT, os.path.getsize(OUT), "bytes")


def main():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    clear_previous()
    shell = build_shell()
    extras = build_extras()
    bpy.ops.object.select_all(action="DESELECT")
    shell.select_set(True)
    extras.select_set(True)
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.join()
    cow = shell
    cow.name = cow.data.name = NAME
    for poly in cow.data.polygons:
        poly.use_smooth = False
    paint(cow)
    preview_material(cow)
    rig = build_armature()
    skin(cow, rig)
    key_walk_preview(rig)
    export(cow, rig)
    print("faces", len(cow.data.polygons), "verts", len(cow.data.vertices))


if __name__ == "__main__":
    main()
