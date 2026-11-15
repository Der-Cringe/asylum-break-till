# Usage: blender -b --python preview.py -- <stl> <outprefix>
import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=src)
obj = bpy.context.selected_objects[0]
bpy.context.view_layer.objects.active = obj
mod = obj.modifiers.new('dec', 'DECIMATE'); mod.ratio = 0.01
bpy.ops.object.modifier_apply(modifier='dec')
bb = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
mn = [min(v[i] for v in bb) for i in range(3)]; mx = [max(v[i] for v in bb) for i in range(3)]
print('BBOX', [round(x, 3) for x in mn], [round(x, 3) for x in mx], 'faces', len(obj.data.polygons))
# save decimated mesh for later steps
bpy.ops.wm.save_as_mainfile(filepath=out + '.blend')
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 400; scene.render.resolution_y = 400
scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'SINGLE'
center = mathutils.Vector([(a + b) / 2 for a, b in zip(mn, mx)])
size = max(b - a for a, b in zip(mn, mx))
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = size * 1.1
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
for name, d in [('px', (1, 0, 0)), ('nx', (-1, 0, 0)), ('py', (0, 1, 0)), ('ny', (0, -1, 0)), ('pz', (0, 0, 1))]:
    dv = mathutils.Vector(d)
    cam.location = center + dv * size * 2
    cam.rotation_euler = (-dv).to_track_quat('-Z', 'Z' if name != 'pz' else 'Y').to_euler()
    scene.render.filepath = f'{out}_{name}.png'
    bpy.ops.render.render(write_still=True)
