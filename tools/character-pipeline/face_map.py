# Face texture for build.py. The faces are sculpted as shallow engravings in the full-resolution STL; after
# decimating to ~11k triangles they turn into jagged shards. So the face is read from the source sculpt
# instead: a grid of rays from the front gives depth and normal per pixel, which are split into skin, hair
# and line art, painted, and handed back as an image plus the smooth face surface (to flatten the shards).
import bpy, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))

def _grow(m):
    return np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)

def _flood(seed, allowed, depth=None, step=None):
    m = seed & allowed
    front = m.copy()
    while front.any():
        g = np.zeros_like(m)
        for dy, dx in N4:
            src = np.roll(front, (dy, dx), (0, 1))
            g |= src if step is None else src & (np.abs(depth - np.roll(depth, (dy, dx), (0, 1))) < step)
        g &= allowed & ~m
        m |= g; front = g
    return m

def _blur(a, r):
    for ax in (0, 1):
        for _ in range(3):
            pad = [(r + 1, r) if i == ax else (0, 0) for i in range(a.ndim)]
            c = np.cumsum(np.pad(a, pad, mode='edge'), axis=ax)
            n = c.shape[ax]
            a = (np.take(c, range(2 * r + 1, n), axis=ax) - np.take(c, range(0, n - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return a

def _harmonic(depth, keep, iters):
    # Fills the pixels outside `keep` with a smooth surface that meets the kept depths at the edges.
    f = np.where(keep, depth, depth[keep].mean())
    for _ in range(iters):
        f = np.where(keep, depth, (np.roll(f, 1, 0) + np.roll(f, -1, 0) + np.roll(f, 1, 1) + np.roll(f, -1, 1)) / 4)
    return f

def _labels(mask):
    # Connected regions of a mask (4-neighbour); 0 is background.
    lab = np.where(mask, np.arange(1, mask.size + 1).reshape(mask.shape), 0)
    big = mask.size + 2
    while True:
        m = np.where(mask, lab, big)
        for dy, dx in N4: m = np.minimum(m, np.where(np.roll(mask, (dy, dx), (0, 1)), np.roll(lab, (dy, dx), (0, 1)), big))
        new = np.where(mask, m, 0)
        if (new == lab).all(): return lab
        lab = new

def build(stl, box, seed, neck, colour_at, skin, ink, fills, glow=None, rows=1024, line_angle=18):
    """box: (face_x, top). colour_at(x, y, z) paints non-skin pixels. fills: [((x, z), rgb)] for closed shapes,
    or [((x, z), rgb, radius)] for a disc where the sculpted shape is not closed.
    Pixels painted in the `glow` colour also go into a second, emissive image (None without glow)."""
    face_x, top = box
    x0, x1, z0, z1 = -face_x - 0.012, face_x + 0.012, neck, top
    px = (z1 - z0) / rows
    W = int(round((x1 - x0) / px))
    bpy.ops.wm.stl_import(filepath=stl)
    ob = bpy.context.selected_objects[0]
    bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    bpy.data.objects.remove(ob)
    xs = x0 + (np.arange(W) + .5) * px
    zs = z1 - (np.arange(rows) + .5) * px
    depth = np.full((rows, W), np.nan); nrm = np.zeros((rows, W, 3))
    for j, z in enumerate(zs):
        for i, x in enumerate(xs):
            hit = bvh.ray_cast(Vector((x, -2, z)), Vector((0, 1, 0)))
            if hit[0]: depth[j, i] = hit[0].y; nrm[j, i] = hit[1]
    valid = ~np.isnan(depth)
    D = np.where(valid, depth, 9.0)
    X, Z = np.meshgrid(xs, zs)
    pix = lambda x, z: (int((z1 - z) / px), int((x - x0) / px))

    # Skin: the smooth face surface flooded from a seed; hair strands lying on it meet it at a depth step.
    region = valid & (Z > neck + 0.004) & (np.abs(X) < face_x)
    start = np.zeros_like(valid); start[pix(*seed)] = True
    skin_m = _flood(start, region & (nrm[..., 1] < -0.35), D, 0.0012)
    outside = np.zeros_like(valid); outside[[0, -1], :] = True; outside[:, [0, -1]] = True
    holes = ~skin_m & ~_flood(outside, ~skin_m)                  # deep engravings the flood went round

    # Line art: where the surface turns away from the smooth face around it (the walls of engravings),
    # thickened so the strokes survive the texture size and viewing distance (this also closes small gaps).
    w = skin_m[..., None].astype(float)
    smooth = _blur(nrm * w, 5) / np.maximum(_blur(w, 5), 1e-6)
    smooth /= np.maximum(np.linalg.norm(smooth, axis=-1, keepdims=True), 1e-6)
    lines = skin_m & (np.degrees(np.arccos(np.clip((nrm * smooth).sum(-1), -1, 1))) > line_angle)
    for _ in range(2): lines |= skin_m & _grow(lines)

    # Shapes the strokes close off: explicit fills (eye whites, irises, mouths) first, then hair tips that
    # lie flush with the face, then small dots (pupils, freckles) as ink. Everything else stays skin.
    open_ = skin_m & ~lines
    main = _flood(start, open_)
    lab = _labels(open_ & ~main)
    area = np.bincount(lab.ravel()) * px * px * 1e6
    hair_m = region & ~skin_m & ~holes
    near_hair = hair_m.copy()
    for _ in range(3): near_hair |= _grow(near_hair)
    touches = set(np.unique(lab[near_hair & (lab > 0)]))
    img = np.zeros((rows, W, 3))
    for j in range(rows):
        for i in range(W):
            img[j, i] = colour_at(X[j, i], D[j, i] if valid[j, i] else 0, Z[j, i])
    img[skin_m] = skin
    img[lines | holes] = ink
    filled = set()
    for (fx, fz), rgb, *radius in fills:
        if radius:
            img[(X - fx) ** 2 + (Z - fz) ** 2 < radius[0] ** 2] = rgb
            continue
        # The nearest closed shape within a few pixels, so a point that lands on a stroke still counts.
        j0, i0 = pix(fx, fz)
        near = sorted((dj * dj + di * di, lab[j0 + dj, i0 + di]) for dj in range(-8, 9) for di in range(-8, 9) if lab[j0 + dj, i0 + di])
        if not near: print('FILL MISSED', (fx, fz)); continue
        k = near[0][1]
        img[lab == k] = rgb; filled.add(k)
    for k in range(1, len(area)):
        if k in filled or area[k] == 0: continue
        if k in touches and area[k] > 2.5:
            m = lab == k
            img[m] = np.array([colour_at(x, d, z) for x, d, z in zip(X[m], D[m], Z[m])])
        elif area[k] < 12: img[lab == k] = ink

    # Smooth surface under the strokes and engravings, to flatten the decimated face onto.
    base = _harmonic(D, skin_m & ~lines, 1500)
    hull = skin_m | holes

    def to_image(name, a):
        # Half resolution with averaging, so the strokes come out anti-aliased.
        a = a[: rows // 2 * 2, : W // 2 * 2].reshape(rows // 2, 2, W // 2, 2, 3).mean((1, 3))
        h, wd = a.shape[:2]
        image = bpy.data.images.new(name, wd, h, alpha=False)
        rgba = np.concatenate([a[::-1], np.ones((h, wd, 1))], -1)  # Blender images start at the bottom row
        image.pixels.foreach_set(rgba.astype(np.float32).ravel())
        image.pack()
        return image
    image = to_image('Face', img)
    glow_image = None
    if glow is not None:
        lit = np.all(np.abs(img - glow) < 1e-6, -1)
        if lit.any(): glow_image = to_image('FaceGlow', np.where(lit[..., None], img, 0.0))

    def sample(x, z):
        j, i = pix(x, z)
        return (0 <= j < rows and 0 <= i < W), j, i
    def surface(x, z):
        ok, j, i = sample(x, z)
        return base[j, i] if ok and hull[j, i] else None
    uv = lambda x, z: ((x - x0) / (x1 - x0), (z - z0) / (z1 - z0))
    return image, glow_image, surface, uv
