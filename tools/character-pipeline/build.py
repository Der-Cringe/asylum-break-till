# Usage: blender -b --python build.py -- <decimated.blend> <role> <out.glb> <source.stl>
# Cuts a fused T-pose block character into six rigid parts with pivots, removes everything that is not
# part of the body (held items, drones, auras), paints vertex colours, paints the face from the full-resolution
# source (face_map.py) and exports a glTF binary.
import bpy, bmesh, sys, os, math
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import face_map

argv = sys.argv[sys.argv.index('--') + 1:]
src, role, out, stl = argv
INF = 9

# Measurements in the source model's units (Z up, character faces -Y, arms along X).
# arms: z band, x tip, y band. Extra boxes catch hair or belt gear that sticks out of the main block.
CHARS = {
    'patient': dict(tw=0.151, hip=0.308, neck=0.619, arm=(0.471, 0.619), tip=0.452, arm_y=(-0.079, 0.083), face=(-0.100, 0.11, 0.62),
                    head=dict(x=0.14, top=0.88, y=(-0.2, 0.2)), extra_head=[], extra_torso=[]),
    'medic': dict(tw=0.169, hip=0.330, neck=0.661, arm=(0.495, 0.662), tip=0.44, arm_y=(-0.118, 0.04), face=(-0.147, 0.10, 0.68),
                  head=dict(x=0.15, top=0.95, y=(-0.2, 0.2)),
                  extra_head=[((-0.15, 0.22), (0.045, 0.22), (0.58, 0.67))], extra_torso=[]),
    'director': dict(tw=0.155, hip=0.326, neck=0.643, arm=(0.503, 0.644), tip=0.45, arm_y=(-0.1, 0.08), face=(-0.104, 0.09, 0.6),
                     head=dict(x=0.17, top=0.95, y=(-0.2, 0.2)),
                     extra_head=[((-0.17, 0.17), (0.075, 0.2), (0.52, 0.65))],
                     extra_torso=[((-0.21, 0.21), (-0.2, 0.2), (0.28, 0.5))]),
    'orderly': dict(tw=0.174, hip=0.344, neck=0.69, arm=(0.532, 0.684), tip=0.49, arm_y=(-0.11, 0.12), face=(-0.076, 0.11, 1),
                    head=dict(x=0.13, top=0.95, y=(-0.19, 0.17), xmax=0.11), extra_head=[], extra_torso=[]),
}
C = CHARS[role]
SCALE = 3.3

bpy.ops.wm.open_mainfile(filepath=src)
src_obj = [o for o in bpy.data.objects if o.type == 'MESH'][0]
# Keep every character around 11k triangles so a full server still runs on phones.
TARGET_FACES = 11000
if len(src_obj.data.polygons) > TARGET_FACES:
    bpy.context.view_layer.objects.active = src_obj
    mod = src_obj.modifiers.new('dec', 'DECIMATE'); mod.ratio = TARGET_FACES / len(src_obj.data.polygons)
    bpy.ops.object.modifier_apply(modifier='dec')
bm = bmesh.new(); bm.from_mesh(src_obj.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0003)

# Slice along every block boundary first so no face straddles two parts.
def slice_plane(co, no):
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=Vector(co), plane_no=Vector(no))
tw, hip, neck = C['tw'], C['hip'], C['neck']
a0, a1 = C['arm']
for x in (-tw, tw, 0): slice_plane((x, 0, 0), (1, 0, 0))
for z in (hip, neck, a0, a1): slice_plane((0, 0, z), (0, 0, 1))
for y in C['arm_y']: slice_plane((0, y, 0), (0, 1, 0))
for x in (-C['tip'], C['tip']): slice_plane((x, 0, 0), (1, 0, 0))
# Colour boundaries get their own cuts too, so paint edges stay crisp instead of smearing across faces.
REACH_CUTS = {'patient': [0.42, 0.86], 'orderly': [0.1, 0.16, 0.86]}.get(role, [0.86])
for r in REACH_CUTS:
    for side in (-1, 1): slice_plane((side * (tw + r * (C['tip'] - tw)), 0, 0), (1, 0, 0))
for z in (0.035, hip + 0.03, hip + 0.035) + ((0.12, 0.2) if role == 'orderly' else ()): slice_plane((0, 0, z), (0, 0, 1))

def inside(p, box):
    (x0, x1), (y0, y1), (z0, z1) = box
    e = 1e-4
    return x0 - e <= p.x <= x1 + e and y0 - e <= p.y <= y1 + e and z0 - e <= p.z <= z1 + e

h = C['head']
head_boxes = [((-h['x'], h.get('xmax', h['x'])), h['y'], (neck, h['top']))] + C['extra_head']
arm_r = [((-C['tip'], -tw), C['arm_y'], (a0, a1))]   # -X is the character's right hand
arm_l = [((tw, C['tip']), C['arm_y'], (a0, a1))]
leg_r = [((-tw - 0.03, 0), (-0.25, 0.25), (-0.01, hip))]
leg_l = [((0, tw + 0.05), (-0.25, 0.25), (-0.01, hip))]
torso = [((-tw, tw), (-0.25, 0.25), (hip, neck))] + C['extra_torso']
# First match wins, so the order settles overlaps (hair over shoulders belongs to the head).
PARTS = [('Head', head_boxes), ('ArmR', arm_r), ('ArmL', arm_l), ('LegR', leg_r), ('LegL', leg_l), ('Torso', torso)]

# Flat sheets that are not body parts (the patient's scribble aura is one plane through the head).
DROP_SLABS = {'patient': [(0.014, 0.038)]}.get(role, [])
def dropped(f, c):
    if not any(y0 <= c.y <= y1 for y0, y1 in DROP_SLABS) or abs(f.normal.y) < 0.85: return False
    return all(any(y0 - 0.002 <= v.co.y <= y1 + 0.002 for y0, y1 in DROP_SLABS) for v in f.verts)

assign = {}
for f in bm.faces:
    c = f.calc_center_median()
    if dropped(f, c): continue
    for name, boxes in PARTS:
        if any(inside(c, b) for b in boxes): assign[f.index] = name; break

# ---- Colours ---------------------------------------------------------------------------------
def rgb(h): return ((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255)
PAL = {
    # Colours picked from the role-selection artwork.
    'patient': dict(skin=0xe0a679, hair=0x6e4226, shirt=0x5fb35f, shirt2=0x4a9a4c, pants=0x3b4250, shoe=0x24262b),
    'medic': dict(skin=0xf8d5bf, hair=0xe0602f, shirt=0xf5f6f8, shirt2=0x2f9497, pants=0x34557a, shoe=0x24272d, glove=0xf8d5bf),
    'director': dict(skin=0xf4dacd, hair=0x15131a, shirt=0x2e2e36, shirt2=0xf2f2f4, tie=0x101014, pants=0x27272e, shoe=0x101013),
    'orderly': dict(skin=0xf0c8ab, hair=0x111522, shirt=0x161d33, shirt2=0x1c2643, pants=0x121829, shoe=0x0b0d12, glove=0x0d0f15, glow=0x3fd0ff),
}[role]
P = {k: rgb(v) for k, v in PAL.items()}
INK = (0.16, 0.09, 0.07)
WHITE = (0.96, 0.95, 0.93)
head_h = h['top'] - neck

# Face texture settings: where the skin flood starts, how wide the face block is, and fills for the shapes
# the line art closes off, as (x, z) points inside them (read off the source sculpt from the front).
FACE = {
    'patient': dict(seed=(0, 0.69), face_x=0.095, fills=[((-0.042, 0.727), INK, 0.0072), ((0.041, 0.728), INK, 0.0072)]),  # pupils
    'medic': dict(seed=(0, 0.71), face_x=0.10, fills=[
        ((-0.058, 0.765), WHITE), ((0.058, 0.765), WHITE),                 # eye whites
        ((-0.041, 0.768), rgb(0x6b3b2a)), ((0.041, 0.768), rgb(0x6b3b2a)),  # irises
        ((-0.070, 0.783), INK), ((0.070, 0.783), INK)]),                   # lashes
    'director': dict(seed=(0.06, 0.665), face_x=0.108, fills=[
        ((-0.058, 0.7405), WHITE), ((0.053, 0.7366), WHITE),
        ((-0.041, 0.7452), INK), ((0.041, 0.7452), INK),                   # pupils
        ((-0.005, 0.69), rgb(0x4a1c1f))]),                                 # open smirk
    'orderly': dict(seed=(0, 0.74), face_x=0.10, fills=[
        ((-0.04, 0.8067), P['hair']), ((-0.032, 0.7883), INK), ((0.013, 0.7267), INK)]),  # brow, eye, mouth
}[role]

# Skin on the head is found by flooding outwards from the middle of the face across smooth surface.
# Hair strands meet the skin at sharp creases, which stop the flood, so fringes stay hair coloured.
def face_skin(part_bm):
    face_y, core_x, rel_max = C['face']
    top_z = neck + head_h * min(rel_max, 0.9)
    def in_shell(c): return c.y <= face_y + 0.1 and abs(c.x) < core_x + 0.02 and c.z < top_z
    seed_z = neck + head_h * 0.3
    seeds = [f for f in part_bm.faces if f.normal.y < -0.9 and abs(f.calc_center_median().x) < 0.04
             and abs(f.calc_center_median().z - seed_z) < 0.04 and abs(f.calc_center_median().y - face_y) < 0.015]
    skin, stack = set(seeds), list(seeds)
    limit = math.cos(math.radians(38))
    while stack:
        f = stack.pop()
        for e in f.edges:
            for g in e.link_faces:
                if g in skin or f.normal.dot(g.normal) < limit or not in_shell(g.calc_center_median()): continue
                skin.add(g); stack.append(g)
    return skin

def colour(part, p, n, is_skin=False):
    if part == 'Head':
        rel = (p.z - neck) / head_h
        if role == 'orderly':
            if p.z > 0.828: return P['hair']                                 # beret
            if -0.005 < p.x < 0.09 and 0.770 < p.z < 0.815 and p.y < -0.06: return P['glow']  # visor
            if p.x > 0.06 and p.z < 0.80 and p.y < -0.05: return P['hair']   # headset mic
            return P['skin']
        return P['skin'] if is_skin else P['hair']
    if part in ('ArmR', 'ArmL'):
        reach = (abs(p.x) - tw) / (C['tip'] - tw)
        if reach > 0.86: return P.get('glove', P['skin'])
        if role == 'patient' and reach > 0.42: return P['skin']                  # short sleeves
        if role == 'orderly' and 0.1 < reach < 0.16: return P['glow']           # shoulder light strip
        return P['shirt2'] if role == 'orderly' else P['shirt']
    if part in ('LegR', 'LegL'):
        if p.z < 0.035: return P['shoe']
        if role == 'orderly' and 0.12 < p.z < 0.2 and p.y < -0.06: return P['shoe']  # knee pads
        return P['pants']
    # Torso
    if role in ('medic', 'director'):
        apex = neck - (0.13 if role == 'medic' else 0.2)
        if p.y < -0.05 and p.z > apex and abs(p.x) < 0.065 * (p.z - apex) / (neck - apex):
            if role == 'director' and abs(p.x) < 0.014: return P['tie']
            return P['shirt2']
    if role == 'director' and abs(p.x) > tw - 0.005 and p.z < 0.5: return P['shoe']  # belt gear
    if role == 'director' and abs(p.y) > 0.03 and p.z > neck - 0.12 and abs(p.x) < 0.15 and p.y > 0.06: return P['hair']
    if role == 'orderly':
        if hip < p.z < hip + 0.03: return P['shoe']                             # belt
        return P['shirt']
    if role == 'patient' and p.z < hip + 0.035: return P['shirt2']                 # hoodie hem
    return P['shirt']

def face_colour(x, y, z):
    c = colour('Head', Vector((x, y, z)), None)
    # In front of the orderly's face everything that is not skin is gear (headset, visor frame): dark.
    return P['hair'] if c == P['skin'] else c

face_image, face_glow, face_surface, face_uv = face_map.build(stl, (FACE['face_x'], h['top']), FACE['seed'], neck, face_colour,
                                                               P['skin'], INK, FACE['fills'], P.get('glow'))
# Pull the decimated face onto the smooth surface under the engravings, so it shades without shards.
for v in bm.verts:
    if v.co.z <= neck or abs(v.co.x) >= FACE['face_x']: continue
    y = face_surface(v.co.x, v.co.z)
    if y is not None and y - 0.003 < v.co.y < y + 0.03: v.co.y = y

# ---- Build part objects ------------------------------------------------------------------------
arm_t = a1 - a0
PIVOTS = {
    'Head': Vector((0, 0, neck)), 'Torso': Vector((0, 0, hip)),
    'ArmR': Vector((-(tw + arm_t / 2), 0, (a0 + a1) / 2)), 'ArmL': Vector((tw + arm_t / 2, 0, (a0 + a1) / 2)),
    'LegR': Vector((-tw / 2, 0, hip)), 'LegL': Vector((tw / 2, 0, hip)),
}
mat = bpy.data.materials.new('Body')
mat.use_nodes = True
nodes = mat.node_tree.nodes
attr = nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
mat.node_tree.links.new(attr.outputs['Color'], nodes['Principled BSDF'].inputs['Base Color'])
nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8

# Light strips and visors glow on their own, like the cyan accents in the artwork.
glow = bpy.data.materials.new('Glow')
glow.use_nodes = True
gb = glow.node_tree.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value = (*[c ** 2.2 for c in P.get('glow', (1, 1, 1))], 1)
gb.inputs['Emission Color'].default_value = (*[c ** 2.2 for c in P.get('glow', (1, 1, 1))], 1)
gb.inputs['Emission Strength'].default_value = 2.5

# The front of the head carries the face texture; its vertex colours stay white apart from the baked occlusion.
face_mat = bpy.data.materials.new('Face')
face_mat.use_nodes = True
tex = face_mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = face_image; tex.interpolation = 'Linear'
fb = face_mat.node_tree.nodes['Principled BSDF']
face_mat.node_tree.links.new(tex.outputs['Color'], fb.inputs['Base Color'])
fb.inputs['Roughness'].default_value = 0.8
if face_glow:
    # The orderly's visor lies in the face texture, so its glow comes from a matching emissive image.
    gt = face_mat.node_tree.nodes.new('ShaderNodeTexImage'); gt.image = face_glow
    face_mat.node_tree.links.new(gt.outputs['Color'], fb.inputs['Emission Color'])
    fb.inputs['Emission Strength'].default_value = 2.5
root = bpy.data.objects.new(f'{role}', None); bpy.context.scene.collection.objects.link(root)
stats = {}
for name, _ in PARTS:
    part = bm.copy()
    part.faces.ensure_lookup_table()
    drop = [f for f in part.faces if assign.get(f.index) != name]
    bmesh.ops.delete(part, geom=drop, context='FACES')
    loose = [v for v in part.verts if not v.link_faces]
    bmesh.ops.delete(part, geom=loose, context='VERTS')
    # Crumbs left over from removed items or auras: tiny islands that are not attached to the body.
    part.faces.ensure_lookup_table()
    seen, crumbs = set(), []
    for f in part.faces:
        if f.index in seen: continue
        stack, island = [f], []
        seen.add(f.index)
        while stack:
            cur = stack.pop(); island.append(cur)
            for e in cur.edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); stack.append(g)
        if len(island) < 40: crumbs.extend(island)
    bmesh.ops.delete(part, geom=crumbs, context='FACES')
    bmesh.ops.delete(part, geom=[v for v in part.verts if not v.link_faces], context='VERTS')
    # Close the cut so rotating parts never show a hollow inside.
    boundary = [e for e in part.edges if e.is_boundary]
    if boundary:
        filled = bmesh.ops.holes_fill(part, edges=boundary, sides=0)
        bmesh.ops.triangulate(part, faces=filled['faces'])
        # Caps can be large (where a held item was fused to the hand); re-cut them on the colour lines.
        for r in REACH_CUTS:
            for side in (-1, 1):
                geom = part.verts[:] + part.edges[:] + part.faces[:]
                bmesh.ops.bisect_plane(part, geom=geom, dist=1e-5, plane_co=Vector((side * (tw + r * (C['tip'] - tw)), 0, 0)), plane_no=Vector((1, 0, 0)))
    bmesh.ops.recalc_face_normals(part, faces=part.faces)
    part.normal_update()
    layer = part.loops.layers.color.new('Col')
    part.normal_update()
    skin = face_skin(part) if name == 'Head' else set()
    uv_layer = part.loops.layers.uv.new('UV')
    glow_faces, face_faces = [], []
    for f in part.faces:
        p = f.calc_center_median()
        # Inside the face outline (nose sides, steep cheek edges) the source sculpt says skin, whatever the flood found.
        surface = face_surface(p.x, p.z) if name == 'Head' else None
        c = colour(name, p, f.normal, f in skin or (surface is not None and p.y < surface + 0.03))
        if name == 'Head' and f.normal.y < -0.5 and abs(p.x) < FACE['face_x'] and p.z > neck + 0.002:
            face_faces.append(f.index); c = (1, 1, 1)
            for loop in f.loops: loop[uv_layer].uv = face_uv(loop.vert.co.x, loop.vert.co.z)
        elif 'glow' in P and c == P['glow']: glow_faces.append(f.index)
        for loop in f.loops: loop[layer] = (*c, 1.0)
    pivot = PIVOTS[name]
    for v in part.verts: v.co = (v.co - pivot) * SCALE
    me = bpy.data.meshes.new(name); part.to_mesh(me); part.free()
    me.materials.append(mat)
    for extra, faces in ((glow, glow_faces), (face_mat, face_faces)):
        if not faces: continue
        me.materials.append(extra)
        for i in faces: me.polygons[i].material_index = len(me.materials) - 1
    if not face_faces: me.uv_layers.remove(me.uv_layers['UV'])
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = pivot * SCALE; ob.parent = root
    stats[name] = len(me.polygons)
    if name in ('ArmR', 'ArmL'):
        ob['length'] = (C['tip'] - tw) * SCALE; ob['thickness'] = arm_t * SCALE
root['height'] = h['top'] * SCALE
print('PARTS', role, stats)

bpy.data.objects.remove(src_obj)
# Bake soft ambient occlusion into the vertex colours so sculpted details still read without textures.
for ob in root.children:
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    me = ob.data
    base = [tuple(d.color) for d in me.color_attributes['Col'].data]
    dirt = me.color_attributes.new('Dirt', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = dirt
    try:
        bpy.ops.object.mode_set(mode='VERTEX_PAINT')
        bpy.ops.paint.vertex_color_dirt(blur_strength=1.0, blur_iterations=1, clean_angle=math.pi, dirt_angle=0.0, dirt_only=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        # Keep the paint mostly as designed; occlusion only darkens creases (eyes, mouth, folds).
        for d, b in zip(dirt.data, base):
            k = 0.72 + 0.28 * min(1.0, d.color[0] * 1.6)
            d.color = (b[0] * k, b[1] * k, b[2] * k, 1.0)
        me.color_attributes.remove(me.color_attributes['Col'])
    except Exception as error:
        print('DIRT FAILED', error)
        bpy.ops.object.mode_set(mode='OBJECT')
        me.color_attributes.remove(dirt)
    me.color_attributes.active_color = me.color_attributes[0]
    me.color_attributes[0].name = 'Col'

# Smooth shading inside surfaces (faces, hair, folds) but keep the block edges crisp.
for ob in root.children:
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))

bpy.ops.wm.save_as_mainfile(filepath=out.replace('.glb', '.blend'))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_extras=True,
                          export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_normals=True, export_apply=False, export_animations=False)
print('EXPORTED', out)
