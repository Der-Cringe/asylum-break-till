# Close-up of the head (Blender units of the built file, scaled), front and side, vertex colours.
import bpy, sys, math
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=argv[0])
for o in list(bpy.data.objects):
    if o.type == 'CAMERA': bpy.data.objects.remove(o)
head = bpy.data.objects['Head']
c = head.matrix_world.translation
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'; scene.render.resolution_x = scene.render.resolution_y = 500
scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'VERTEX'
cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = 1.4
cam = bpy.data.objects.new('cam', cd); scene.collection.objects.link(cam); scene.camera = cam
for name, loc, rot in [('front', (c.x, c.y - 5, c.z + 0.5), (math.pi / 2, 0, 0)), ('side', (c.x + 5, c.y, c.z + 0.5), (math.pi / 2, 0, math.pi / 2)), ('back', (c.x, c.y + 5, c.z + 0.5), (math.pi / 2, 0, math.pi))]:
    cam.location = loc; cam.rotation_euler = rot
    scene.render.filepath = f'{argv[1]}_{name}.png'
    bpy.ops.render.render(write_still=True)
