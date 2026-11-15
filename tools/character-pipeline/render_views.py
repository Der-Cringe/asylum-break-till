# Orthographic renders with a fixed mapping: 600px = 1.1 units, image centre = (x 0, z 0.5).
# front: camera at -Y (image right = +X). side: camera at +X (image right = +Y, i.e. towards the back).
import bpy, sys, math
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
color = len(argv) > 2 and argv[2] == 'color'
SCALE = float(argv[3]) if len(argv) > 3 else 1.0
if src.endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=src)
    for o in list(bpy.data.objects):
        if o.type == 'CAMERA': bpy.data.objects.remove(o)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = scene.render.resolution_y = 600
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'VERTEX' if color else 'SINGLE'
scene.display.shading.show_cavity = True
cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = 1.1 * SCALE
cam = bpy.data.objects.new('cam', cd); scene.collection.objects.link(cam); scene.camera = cam
views = {
    'front': ((0, -3 * SCALE, 0.5 * SCALE), (math.pi / 2, 0, 0)),
    'side': ((3 * SCALE, 0, 0.5 * SCALE), (math.pi / 2, 0, math.pi / 2)),
    'back': ((0, 3 * SCALE, 0.5 * SCALE), (math.pi / 2, 0, math.pi)),
}
for name, (loc, rot) in views.items():
    cam.location = loc; cam.rotation_euler = rot
    scene.render.filepath = f'{out}_{name}.png'
    bpy.ops.render.render(write_still=True)
