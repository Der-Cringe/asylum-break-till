import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Builds the meshes for the building described in layout.js. Everything static on a floor is merged
// into one mesh per material, so a whole floor costs a few dozen draw calls instead of thousands.
const L = window.LAYOUT;
const { WALL_HEIGHT: WH, DOOR_HEIGHT: DH, DOOR_WIDTH: DW } = L;

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const UP = new THREE.Vector3(0, 1, 0);
const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();

const materials = new Map();
function mat(color, options = {}) {
  const key = JSON.stringify([color, options]);
  if (!materials.has(key)) {
    const { emissive, glow = 1, ...rest } = options;
    materials.set(key, new THREE.MeshStandardMaterial({
      color, roughness: 0.8, metalness: 0.02, ...rest,
      ...(emissive !== undefined ? { emissive, emissiveIntensity: glow } : {}),
    }));
  }
  return materials.get(key);
}
const M = {
  metal: mat(0x9aa3ab, { roughness: 0.45, metalness: 0.55 }), darkMetal: mat(0x3b4249, { roughness: 0.5, metalness: 0.45 }),
  steel: mat(0xc3cacf, { roughness: 0.35, metalness: 0.6 }), black: mat(0x1d2329, { roughness: 0.6 }),
  wood: mat(0x8a6142, { roughness: 0.75 }), lightWood: mat(0xb88c5e, { roughness: 0.7 }), darkWood: mat(0x5a3c2a, { roughness: 0.7 }),
  white: mat(0xe8ecee, { roughness: 0.6 }), offWhite: mat(0xd4d6cf, { roughness: 0.8 }), sheet: mat(0xeef1ee, { roughness: 0.95 }),
  grayFabric: mat(0x9aa0a3, { roughness: 1 }), blueFabric: mat(0x4f6d8f, { roughness: 1 }), greenFabric: mat(0x5f8a73, { roughness: 1 }),
  redFabric: mat(0x8f3b36, { roughness: 1 }), leather: mat(0x4a2f25, { roughness: 0.6 }), teal: mat(0x3f8f8f, { roughness: 0.6 }),
  plastic: mat(0x6f7b85, { roughness: 0.55 }), red: mat(0xb5443a, { roughness: 0.5 }), yellow: mat(0xd8b23a, { roughness: 0.6 }),
  screen: mat(0x0d1b26, { emissive: 0x3f9fd0, glow: 0.9, roughness: 0.3 }), screenGreen: mat(0x0d1f16, { emissive: 0x3fd08a, glow: 0.8 }),
  led: mat(0x0d1f16, { emissive: 0x45ff9a, glow: 1.4 }), ledRed: mat(0x300, { emissive: 0xff3b2f, glow: 1.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xa8dbe6, transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.1, depthWrite: false }),
  plantPot: mat(0x6b5446), leaf: mat(0x3f7f4a, { roughness: 0.9 }), cardboard: mat(0xb08d5d, { roughness: 0.95 }),
  rubber: mat(0x2b3238, { roughness: 0.95 }), gymBlue: mat(0x2f5f9a, { roughness: 0.9 }), green: mat(0x2f7a50, { roughness: 0.7 }),
};

// Floor finishes are canvas textures with tiling UVs, so one material covers every room of a style.
function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'); draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
function noise(ctx, size, amount, alpha = 0.06) {
  for (let i = 0; i < amount; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
}
function tiles(base, grout, count = 2, variance = 6, groutWidth = 3) {
  return (ctx, size) => {
    const step = size / count;
    for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) {
      const shade = (Math.random() - 0.5) * variance;
      const c = new THREE.Color(base).offsetHSL(0, 0, shade / 100);
      ctx.fillStyle = `#${c.getHexString()}`; ctx.fillRect(i * step, j * step, step, step);
    }
    noise(ctx, size, 900, 0.04);
    ctx.strokeStyle = grout; ctx.lineWidth = groutWidth;
    for (let i = 0; i <= count; i++) { ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke(); }
  };
}
const FLOOR_STYLES = {
  corridor: { draw: tiles('#d8dcdc', '#9aa1a3', 2, 4), tile: 5 },
  tile: { draw: tiles('#cfd5d6', '#8f989b', 4, 5), tile: 6 },
  lobby: { draw: tiles('#d9d3c7', '#a59c8c', 2, 8), tile: 8 },
  checker: { draw: (ctx, s) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#2b2f33' : '#e3e1d8'; ctx.fillRect(i * s / 4, j * s / 4, s / 4, s / 4); } noise(ctx, s, 1200, 0.05); }, tile: 8 },
  lino: { draw: (ctx, s) => { ctx.fillStyle = '#b7c9bd'; ctx.fillRect(0, 0, s, s); noise(ctx, s, 3000, 0.07); }, tile: 6 },
  cell: { draw: (ctx, s) => { ctx.fillStyle = '#a8aca6'; ctx.fillRect(0, 0, s, s); noise(ctx, s, 4000, 0.09); }, tile: 6 },
  concrete: { draw: (ctx, s) => { ctx.fillStyle = '#8f9496'; ctx.fillRect(0, 0, s, s); noise(ctx, s, 5000, 0.08); }, tile: 8 },
  stairs: { draw: (ctx, s) => { ctx.fillStyle = '#9a9f9f'; ctx.fillRect(0, 0, s, s); noise(ctx, s, 4000, 0.07); }, tile: 8 },
  lab: { draw: tiles('#59656e', '#3a434a', 4, 5), tile: 6 },
  office: { draw: tiles('#5d646b', '#4f565c', 4, 6), tile: 6 },
  carpet: { draw: (ctx, s) => { ctx.fillStyle = '#4c5a6b'; ctx.fillRect(0, 0, s, s); noise(ctx, s, 6000, 0.1); }, tile: 6 },
  director: { draw: (ctx, s) => { ctx.fillStyle = '#6b2f33'; ctx.fillRect(0, 0, s, s); noise(ctx, s, 6000, 0.1); }, tile: 6 },
  rubber: { draw: (ctx, s) => { ctx.fillStyle = '#33383d'; ctx.fillRect(0, 0, s, s); noise(ctx, s, 3000, 0.12); }, tile: 6 },
  padded: { draw: tiles('#e7e4da', '#c9c4b5', 3, 2), tile: 4 },
  wood: { draw: (ctx, s) => {
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const c = new THREE.Color('#9a6f4a').offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
      ctx.fillStyle = `#${c.getHexString()}`; ctx.fillRect(0, r * s / rows, s, s / rows);
      ctx.fillStyle = 'rgba(40,24,12,.5)'; ctx.fillRect(0, r * s / rows, s, 2); ctx.fillRect(((r * 37) % 8) * s / 8, r * s / rows, 2, s / rows);
    }
    noise(ctx, s, 2000, 0.05);
  }, tile: 8 },
};
const floorMaterials = new Map();
function floorMaterial(style) {
  const def = FLOOR_STYLES[style] || FLOOR_STYLES.tile;
  if (!floorMaterials.has(style)) floorMaterials.set(style, new THREE.MeshStandardMaterial({ map: canvasTexture(256, def.draw), roughness: style === 'lobby' ? 0.45 : 0.85 }));
  return floorMaterials.get(style);
}
const ceilingTexture = canvasTexture(512, tiles('#e2e4e2', '#c6cacb', 2, 2, 4));
ceilingTexture.anisotropy = 8;
const ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTexture, emissiveMap: ceilingTexture, emissive: 0x8a8e8f, roughness: 0.95 });
// Lights from above cannot reach a downward-facing ceiling, so it glows a little instead and skips shadows.
ceilingMaterial.userData.noShadows = true;
const lightPanelMaterial = new THREE.MeshStandardMaterial({ color: 0xf4fbff, emissive: 0xe9f6ff, emissiveIntensity: 1.25, roughness: 0.3 });
lightPanelMaterial.userData.noShadows = true;
const windowMaterial = new THREE.MeshStandardMaterial({ color: 0xbfd9e6, emissive: 0x8fb4c8, emissiveIntensity: 0.9, roughness: 0.2 });

// Walls get an institutional two-tone finish; each floor has its own colour scheme.
const WALL_SCHEMES = [
  { upper: 0xd3cfc6, lower: 0xa9a294, base: 0x3d4247 },
  { upper: 0xd9dfe2, lower: 0xaebfc6, base: 0x3d4a52 },
  { upper: 0xc4ccc2, lower: 0x8f9e90, base: 0x353d38 },
];

// Collects transformed copies of the shared geometries and merges them per material at the end.
class Batch {
  constructor() { this.buckets = new Map(); }
  add(geometry, material, x, y, z, sx, sy, sz, rotY = 0, shadow = true) {
    quaternion.setFromAxisAngle(UP, rotY);
    matrix.compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz));
    this.push(geometry.clone().applyMatrix4(matrix), material, shadow);
  }
  push(geometry, material, shadow = true) {
    const key = `${material.uuid}|${shadow}`;
    if (!this.buckets.has(key)) this.buckets.set(key, { material, shadow, geometries: [] });
    this.buckets.get(key).geometries.push(geometry);
  }
  flush(parent) {
    for (const { material, shadow, geometries } of this.buckets.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
      mesh.castShadow = shadow && !material.transparent; mesh.receiveShadow = !material.userData.noShadows;
      if (material.transparent) mesh.renderOrder = 2;
      parent.add(mesh);
      geometries.forEach(geometry => geometry.dispose());
    }
    this.buckets.clear();
  }
}

// A flat, tiled rectangle (floors face up, ceilings face down).
function plane(batch, material, x1, z1, x2, z2, y, tile, down = false) {
  const w = x2 - x1, d = z2 - z1;
  const geometry = new THREE.PlaneGeometry(w, d);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w + x1) / tile, (uv.getY(i) * d - z2) / tile);
  geometry.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
  geometry.translate((x1 + x2) / 2, y, (z1 + z2) / 2);
  batch.push(geometry, material, false);
}

// Furniture is written in its own frame: x across, z towards its front, y up from the floor.
function placer(batch, item, y0) {
  const angle = item.face ?? (item.rot || 0) * Math.PI / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const at = (lx, lz) => [item.x + lx * cos + lz * sin, item.z - lx * sin + lz * cos];
  return {
    box(lx, y, lz, w, h, d, material, shadow = true) { const [x, z] = at(lx, lz); batch.add(BOX, material, x, y0 + y + h / 2, z, w, h, d, angle, shadow); },
    cyl(lx, y, lz, r, h, material, shadow = true) { const [x, z] = at(lx, lz); batch.add(CYL, material, x, y0 + y + h / 2, z, r * 2, h, r * 2, angle, shadow); },
    // A cylinder lying along the local z axis (wheels, washer doors).
    disc(lx, y, lz, r, h, material) {
      const [x, z] = at(lx, lz);
      const geometry = CYL.clone().rotateX(Math.PI / 2);
      quaternion.setFromAxisAngle(UP, angle);
      matrix.compose(position.set(x, y0 + y, z), quaternion, scale.set(r * 2, r * 2, h));
      batch.push(geometry.applyMatrix4(matrix), material);
    },
  };
}
const legs = (p, w, d, h, material, inset = 0.25, size = 0.18) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (w / 2 - inset), 0, sz * (d / 2 - inset), size, h, size, material);
};
const sizeOf = (item, w, d) => [item.w ?? w, item.d ?? d];

const BUILDERS = {
  bed(p, item) {
    const frame = item.old ? mat(0x6d5a4a, { roughness: 0.6, metalness: 0.4 }) : M.metal;
    legs(p, 2.5, 5.3, 0.7, frame, 0.15, 0.14);
    p.box(0, 0.6, 0, 2.5, 0.18, 5.3, frame);
    p.box(0, 0.78, 0, 2.3, 0.36, 5.0, item.old ? mat(0xb9b7a8, { roughness: 1 }) : M.sheet);
    p.box(0, 1.14, -1.95, 1.7, 0.3, 0.9, M.white);
    p.box(0, 1.14, 0.9, 2.36, 0.08, 3.0, item.old ? M.grayFabric : M.blueFabric);
    p.box(0, 0.6, -2.62, 2.5, 1.4, 0.12, frame); p.box(0, 0.6, 2.62, 2.5, 0.9, 0.12, frame);
  },
  cellBed(p) {
    p.box(0, 0, 0, 2.2, 0.8, 4.6, mat(0x8c8f8c, { roughness: 0.95 }));
    p.box(0, 0.8, 0.1, 2.0, 0.22, 4.3, mat(0xa9b0a6, { roughness: 1 }));
    p.box(0, 1.02, -1.7, 1.4, 0.2, 0.7, M.offWhite);
  },
  examBed(p) { p.box(0, 0, 0, 2.0, 1.2, 4.6, M.white); p.box(0, 1.2, 0, 2.2, 0.3, 5, M.teal); p.box(0, 1.5, -1.8, 2.0, 0.4, 1.2, M.teal); },
  restraintBed(p, item) { BUILDERS.bed(p, item); for (const z of [-1, 0.4, 1.8]) p.box(0, 1.2, z, 2.6, 0.06, 0.3, M.leather); },
  operatingTable(p) {
    p.cyl(0, 0, 0, 0.5, 1.4, M.steel); p.box(0, 0, 0, 2, 0.15, 2, M.darkMetal);
    p.box(0, 1.4, 0, 2.4, 0.3, 5.4, M.steel); p.box(0, 1.7, 0, 2.2, 0.12, 5.2, mat(0x2f6f73));
  },
  surgicalLamp(p) {
    p.cyl(0, WH - 0.9, 0, 0.08, 0.9, M.steel, false); p.cyl(0, WH - 1.2, 0, 1.0, 0.3, M.steel, false);
    p.cyl(0, WH - 1.24, 0, 0.8, 0.05, lightPanelMaterial, false);
  },
  ivStand(p) { p.cyl(0, 0, 0, 0.45, 0.08, M.darkMetal); p.cyl(0, 0, 0, 0.05, 3.6, M.steel); p.box(0.25, 2.9, 0, 0.35, 0.6, 0.15, mat(0xcfe8f0, { transparent: true, opacity: 0.7 })); },
  curtain(p, item) {
    const [w] = sizeOf(item, 8);
    p.box(0, 4.4, 0, w, 0.06, 0.06, M.steel, false);
    p.box(0, 1.0, 0, w * 0.55, 3.35, 0.05, mat(0x8fbfbf, { roughness: 1, side: THREE.DoubleSide }));
  },
  counter(p, item) {
    const [w, d] = sizeOf(item, 6, 2.2);
    p.box(0, 0, 0, w, 1.7, d, mat(0x77706a, { roughness: 0.7 }));
    p.box(0, 1.7, 0, w + 0.2, 0.14, d + 0.2, mat(0xd8d5cd, { roughness: 0.4 }));
  },
  desk(p, item) {
    const [w, d] = sizeOf(item, 6, 3);
    p.box(0, 1.4, 0, w, 0.14, d, M.wood);
    p.box(-w / 2 + 0.8, 0, 0, 1.4, 1.4, d - 0.2, M.darkWood);
    p.box(w / 2 - 0.1, 0, 0, 0.12, 1.4, d - 0.2, M.darkWood);
    p.box(-0.6, 1.54, 0.3, 1.4, 0.06, 0.6, M.offWhite);
  },
  table(p, item) {
    const [w, d] = sizeOf(item, 6, 3);
    p.box(0, 1.35, 0, w, 0.14, d, M.lightWood); legs(p, w, d, 1.35, M.darkMetal, 0.3);
  },
  diningTable(p) {
    p.box(0, 1.35, 0, 9, 0.14, 2.6, mat(0xc9c2b2, { roughness: 0.5 })); legs(p, 9, 2.6, 1.35, M.darkMetal, 0.5);
    for (const s of [-1, 1]) { p.box(0, 0.8, s * 2.2, 9, 0.14, 1.0, M.plastic); legs(p, 9, 1.0, 0.8, M.darkMetal, 0.5); p.box(0, 0, s * 1.75, 0.1, 0.1, 0.1, M.darkMetal); }
    for (const s of [-1, 1]) for (const x of [-3.5, 3.5]) p.box(x, 0, s * 2.2, 0.14, 0.8, 0.14, M.darkMetal);
    p.box(-2, 1.49, 0.3, 1.1, 0.06, 0.8, M.plastic); p.box(2.4, 1.49, -0.4, 1.1, 0.06, 0.8, M.plastic);
  },
  confTable(p, item) {
    const [w, d] = sizeOf(item, 14, 5);
    p.box(0, 1.4, 0, w, 0.18, d, M.darkWood);
    p.box(-w / 4, 0, 0, 1, 1.4, d * 0.4, M.black); p.box(w / 4, 0, 0, 1, 1.4, d * 0.4, M.black);
  },
  coffeeTable(p) { p.box(0, 0.75, 0, 3.6, 0.12, 2, M.darkWood); legs(p, 3.6, 2, 0.75, M.darkWood, 0.2, 0.15); },
  sofa(p) {
    const fabric = M.blueFabric;
    p.box(0, 0.25, 0.15, 6, 0.65, 2.1, fabric); p.box(0, 0.25, -1.0, 6, 1.9, 0.5, fabric);
    p.box(-2.85, 0.25, 0, 0.5, 1.3, 2.4, fabric); p.box(2.85, 0.25, 0, 0.5, 1.3, 2.4, fabric);
    p.box(0, 0, 0, 5.8, 0.25, 2.2, M.black);
    p.box(-1.4, 0.9, 0.2, 2.6, 0.25, 1.8, M.grayFabric); p.box(1.4, 0.9, 0.2, 2.6, 0.25, 1.8, M.grayFabric);
  },
  bench(p, item) {
    const [w] = sizeOf(item, 6);
    p.box(0, 0.8, 0, w, 0.14, 1.3, M.lightWood); legs(p, w, 1.3, 0.8, M.darkMetal, 0.3);
  },
  chair(p) {
    legs(p, 1.1, 1.1, 0.85, M.darkMetal, 0.1, 0.1);
    p.box(0, 0.85, 0, 1.15, 0.12, 1.15, M.plastic); p.box(0, 0.97, -0.52, 1.15, 1.25, 0.1, M.plastic);
  },
  deskChair(p) {
    p.cyl(0, 0, 0, 0.6, 0.08, M.black); p.cyl(0, 0.08, 0, 0.08, 0.8, M.darkMetal);
    p.box(0, 0.88, 0, 1.2, 0.2, 1.2, M.black); p.box(0, 1.08, -0.55, 1.15, 1.5, 0.16, M.black);
  },
  monitor(p) { p.box(0, 1.84, 0, 0.6, 0.06, 0.4, M.black); p.box(0, 1.9, 0, 0.1, 0.35, 0.1, M.black); p.box(0, 2.15, 0, 1.4, 0.85, 0.08, M.black); p.box(0, 2.2, 0.045, 1.25, 0.7, 0.02, M.screen, false); },
  monitorDesk(p, item) {
    const [w] = sizeOf(item, 12);
    p.box(0, 1.4, 0, w, 0.14, 2.4, M.darkMetal); p.box(0, 0, -0.6, w, 1.4, 1.2, M.black);
    const screens = Math.max(2, Math.floor(w / 2.2));
    for (let i = 0; i < screens; i++) {
      const x = -w / 2 + (i + 0.5) * (w / screens);
      for (const row of [0, 1]) { p.box(x, 1.7 + row * 1.15, -0.85, 2.0, 1.1, 0.12, M.black); p.box(x, 1.75 + row * 1.15, -0.78, 1.85, 1.0, 0.02, i % 3 === 1 ? M.screenGreen : M.screen, false); }
    }
    p.box(-w / 4, 1.54, 0.4, 1.6, 0.06, 0.6, M.black); p.box(w / 4, 1.54, 0.4, 1.6, 0.06, 0.6, M.black);
  },
  lockers(p, item) {
    const [w] = sizeOf(item, 6);
    const count = Math.max(1, Math.round(w / 1.2)), unit = w / count;
    const colors = [mat(0x506f8f, { roughness: 0.5, metalness: 0.4 }), mat(0x5a7b9b, { roughness: 0.5, metalness: 0.4 })];
    for (let i = 0; i < count; i++) {
      const x = -w / 2 + (i + 0.5) * unit;
      p.box(x, 0.2, 0, unit - 0.05, 4.1, 1.3, colors[i % 2]);
      p.box(x + unit * 0.3, 2.2, 0.66, 0.08, 0.35, 0.04, M.steel);
      for (const y of [3.6, 3.8, 4.0]) p.box(x, y, 0.66, unit * 0.6, 0.05, 0.03, M.black, false);
    }
    p.box(0, 0, 0, w, 0.2, 1.3, M.black);
  },
  shelf(p, item) {
    const [w] = sizeOf(item, 8);
    const crate = [M.cardboard, mat(0x7a8a99), mat(0xa8664a), M.offWhite];
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) p.box(x, 0, 0, 0.16, 4.5, 1.3, M.darkMetal);
    for (const y of [0.3, 1.4, 2.5, 3.6]) {
      p.box(0, y, 0, w, 0.08, 1.3, M.metal);
      let x = -w / 2 + 0.4;
      let n = Math.floor(item.x * 7 + item.z * 3 + y * 11);
      while (x < w / 2 - 1.2) {
        const bw = 0.7 + ((n = (n * 1103515245 + 12345) & 0x7fffffff) % 9) / 10, bh = 0.5 + (n % 5) / 10;
        if (n % 4) p.box(x + bw / 2, y + 0.08, 0, bw, bh, 1.0, crate[n % crate.length]);
        x += bw + 0.15;
      }
    }
  },
  medShelf(p, item) {
    const [w] = sizeOf(item, 6);
    const meds = [mat(0xffffff), mat(0x6fb7e0), mat(0xe07b6f), mat(0xf2d46b), mat(0x8fd6a1)];
    p.box(0, 0, 0, w, 4.4, 0.12, M.white); for (const x of [-w / 2, w / 2]) p.box(x, 0, 0.3, 0.12, 4.4, 1.2, M.white);
    for (const y of [0.4, 1.4, 2.4, 3.4]) {
      p.box(0, y, 0.3, w, 0.08, 1.2, M.white);
      for (let x = -w / 2 + 0.4, i = 0; x < w / 2 - 0.4; x += 0.55, i++) p.box(x, y + 0.08, 0.35, 0.4, 0.45 + (i % 3) * 0.12, 0.6, meds[(i + Math.round(y)) % meds.length]);
    }
  },
  cabinet(p, item) {
    const [w] = sizeOf(item, 4);
    p.box(0, 0, 0, w, 3, 1.3, M.offWhite);
    for (let x = -w / 2 + 1; x < w / 2; x += 2) { p.box(x - 0.98, 0.1, 0.66, 0.04, 2.8, 0.02, M.plastic, false); p.box(x + 0.6, 1.4, 0.68, 0.08, 0.4, 0.04, M.steel); }
  },
  fileCabinet(p) { p.box(0, 0, 0, 3, 3.2, 1.6, mat(0x7c858c, { metalness: 0.4, roughness: 0.5 })); for (const y of [0.7, 1.5, 2.3, 3.0]) p.box(0, y, 0.81, 0.8, 0.1, 0.04, M.steel); },
  labBench(p, item) {
    const [w] = sizeOf(item, 10);
    p.box(0, 0, 0, w, 1.5, 3, mat(0xdfe3e4)); p.box(0, 1.5, 0, w + 0.2, 0.12, 3.2, M.black);
    p.box(0, 1.62, 0, w, 1.4, 0.15, M.glass, false);
    const glow = [mat(0x113, { emissive: 0x47c9ff, glow: 1.2, transparent: true, opacity: 0.85 }), mat(0x131, { emissive: 0x6dff8f, glow: 1.2, transparent: true, opacity: 0.85 }), mat(0x311, { emissive: 0xff7d6b, glow: 1.2, transparent: true, opacity: 0.85 })];
    for (let x = -w / 2 + 1, i = 0; x < w / 2 - 1; x += 1.6, i++) { p.cyl(x, 1.62, 0.8, 0.22, 0.6, glow[i % 3], false); p.cyl(x + 0.5, 1.62, -0.8, 0.18, 0.4, glow[(i + 1) % 3], false); }
    p.box(-w / 2 + 1.6, 1.62, -0.6, 0.6, 1.0, 0.6, M.darkMetal); p.box(w / 2 - 2, 1.62, 0.6, 1.4, 0.9, 1.0, M.white);
  },
  workbench(p, item) {
    const [w] = sizeOf(item, 8);
    p.box(0, 1.4, 0, w, 0.2, 3.2, M.lightWood); legs(p, w, 3.2, 1.4, M.wood, 0.3, 0.3);
    p.box(0, 0.4, 0, w - 0.6, 0.1, 2.8, M.wood);
    p.box(-w / 2 + 1, 1.6, 0.8, 0.8, 0.4, 0.6, M.darkMetal); p.box(1, 1.6, -0.6, 1.4, 0.15, 0.3, M.red); p.box(2.5, 1.6, 0.4, 0.9, 0.5, 0.7, M.cardboard);
  },
  easel(p) { p.box(-0.5, 0, 0, 0.1, 3.4, 0.1, M.wood); p.box(0.5, 0, 0, 0.1, 3.4, 0.1, M.wood); p.box(0, 0, -0.6, 0.1, 3.2, 0.1, M.wood); p.box(0, 1.6, 0.1, 1.6, 1.4, 0.06, M.offWhite); p.box(0, 1.9, 0.14, 1.0, 0.7, 0.01, mat(0x5f8ac0), false); },
  glassWall(p, item) {
    const [w] = sizeOf(item, 10);
    p.box(0, 0, 0, w, 0.3, 0.3, M.darkMetal); p.box(0, 4.2, 0, w, 0.2, 0.3, M.darkMetal);
    for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 4) p.box(x, 0, 0, 0.15, 4.4, 0.3, M.darkMetal);
    p.box(0, 0.3, 0, w, 3.9, 0.08, M.glass, false);
  },
  bars(p, item) {
    const [w] = sizeOf(item, 10);
    const iron = mat(0x4b5258, { metalness: 0.6, roughness: 0.4 });
    p.box(0, 0, 0, w, 0.25, 0.4, iron); p.box(0, WH - 0.4, 0, w, 0.25, 0.4, iron); p.box(0, 2.4, 0, w, 0.12, 0.2, iron);
    for (let x = -w / 2 + 0.25; x < w / 2; x += 0.55) p.box(x, 0, 0, 0.1, WH, 0.1, iron);
  },
  vending(p) {
    p.box(0, 0, 0, 2.4, 4.4, 1.8, mat(0xb5443a, { roughness: 0.4 }));
    p.box(-0.3, 0.9, 0.91, 1.5, 3.0, 0.04, mat(0x1a2a33, { emissive: 0x5aa8c8, glow: 0.7 }), false);
    for (let y = 1.2; y < 3.8; y += 0.6) for (let x = -0.85; x < 0.3; x += 0.4) p.box(x, y, 0.95, 0.25, 0.35, 0.05, [M.yellow, M.green, M.white][Math.round((x + y) * 5) % 3], false);
    p.box(0.75, 2.2, 0.92, 0.5, 0.8, 0.05, M.black); p.box(-0.3, 0.3, 0.92, 1.5, 0.4, 0.05, M.black);
  },
  fridge(p) { p.box(0, 0, 0, 2.6, 4.4, 1.8, M.steel); p.box(0, 2.8, 0.91, 2.5, 0.04, 0.03, M.darkMetal, false); p.box(1.0, 1.4, 0.95, 0.1, 1.0, 0.08, M.darkMetal); p.box(1.0, 3.3, 0.95, 0.1, 0.8, 0.08, M.darkMetal); },
  stove(p) {
    p.box(0, 0, 0, 3.4, 1.8, 2.4, M.steel); p.box(0, 1.8, 0, 3.4, 0.06, 2.4, M.black);
    for (const x of [-0.8, 0.8]) for (const z of [-0.5, 0.5]) p.cyl(x, 1.86, z, 0.35, 0.05, M.darkMetal);
    p.box(0, 0.3, 1.21, 2.6, 1.1, 0.04, M.black); p.box(0, 3.9, -0.6, 3.6, 1.2, 1.4, M.steel);
  },
  trays(p) { for (let i = 0; i < 6; i++) p.box(-12 + i * 4.4, 1.84, 0, 1.2, 0.1 + (i % 2) * 0.1, 0.9, [M.plastic, M.red, M.white][i % 3], false); },
  coffeeMachine(p) { p.box(0, 1.84, 0, 0.9, 1.0, 0.9, M.black); p.box(0, 2.3, 0.4, 0.5, 0.3, 0.1, M.ledRed, false); },
  washer(p) {
    p.box(0, 0, 0, 2.6, 2.4, 2.4, M.white); p.box(0, 2.4, 0, 2.6, 0.06, 2.4, M.offWhite);
    p.disc(0, 1.15, 1.2, 0.8, 0.1, M.steel); p.disc(0, 1.15, 1.24, 0.62, 0.06, mat(0x3a4d5a, { roughness: 0.2 }));
    p.box(-0.6, 2.05, 1.22, 0.9, 0.2, 0.04, M.black, false);
  },
  laundryCart(p) { p.box(0, 0.4, 0, 2.2, 1.6, 2.8, mat(0x8c9fb0, { roughness: 0.9 })); for (const x of [-0.9, 0.9]) for (const z of [-1.2, 1.2]) p.cyl(x, 0, z, 0.15, 0.4, M.black); p.box(0, 1.9, 0, 1.8, 0.4, 2.4, M.sheet); },
  treadmill(p) { p.box(0, 0, 0, 2.2, 0.5, 4.8, M.black); p.box(0, 0.5, 0, 1.6, 0.04, 4.2, M.rubber); for (const x of [-1, 1]) p.box(x, 0.5, 1.9, 0.12, 2.6, 0.12, M.darkMetal); p.box(0, 3.0, 1.9, 2.1, 0.5, 0.6, M.darkMetal); p.box(0, 3.1, 1.7, 1.0, 0.3, 0.05, M.screenGreen, false); },
  benchPress(p) {
    p.box(0, 0, 0.5, 1.1, 1.0, 3.4, M.black); p.box(0, 1.0, 0.5, 1.2, 0.2, 3.4, M.redFabric);
    for (const x of [-1.1, 1.1]) p.box(x, 0, -1.4, 0.15, 3.0, 0.15, M.darkMetal);
    p.box(0, 2.7, -1.4, 4.4, 0.1, 0.1, M.steel); for (const x of [-1.9, 1.9]) p.disc(x, 2.75, -1.4, 0.7, 0.2, M.black);
  },
  weightRack(p) { p.box(0, 0, 0, 6, 0.2, 1.4, M.black); p.box(0, 1.2, 0, 6, 0.15, 1.4, M.darkMetal); for (const x of [-2.9, 2.9]) p.box(x, 0, 0, 0.15, 2.4, 1.4, M.darkMetal); for (let x = -2.4; x <= 2.4; x += 0.8) p.box(x, 1.35, 0, 0.5, 0.4 + Math.abs(x) * 0.1, 0.5, M.black); },
  rack(p, item) { BUILDERS.shelf(p, item); },
  mat(p, item) { const [w, d] = sizeOf(item, 10, 10); p.box(0, 0, 0, w, 0.12, d, M.gymBlue, false); },
  rug(p, item) { const [w, d] = sizeOf(item, 10, 8); p.box(0, 0, 0, w, 0.05, d, mat(0x5b4a6b, { roughness: 1 }), false); p.box(0, 0.002, 0, w - 1, 0.05, d - 1, mat(0x75638a, { roughness: 1 }), false); },
  generator(p) { p.box(0, 0, 0, 5, 3.2, 4, mat(0x6b7a4a, { metalness: 0.3, roughness: 0.6 })); p.box(0, 3.2, 0, 1.0, 1.4, 1.0, M.darkMetal); p.box(1.6, 1.4, 2.01, 1.2, 0.8, 0.04, M.yellow, false); p.cyl(-1.6, 3.2, -1, 0.3, 2.4, M.darkMetal); },
  electricBox(p) { p.box(0, 1.0, 0, 2.4, 3.2, 0.8, mat(0x8a949b, { metalness: 0.4, roughness: 0.5 })); p.box(0, 3.6, 0.41, 0.7, 0.6, 0.02, M.yellow, false); p.box(0.8, 1.6, 0.41, 0.3, 0.3, 0.04, M.led, false); },
  serverRack(p) {
    p.box(0, 0, 0, 3, 4.6, 2.2, M.black);
    for (let y = 0.4; y < 4.3; y += 0.5) { p.box(0, y, 1.11, 2.6, 0.38, 0.02, M.darkMetal, false); p.box(-1.0 + ((y * 7) % 3) * 0.3, y + 0.14, 1.13, 0.12, 0.1, 0.02, (y * 10) % 3 < 1 ? M.ledRed : M.led, false); }
  },
  tank(p) { p.cyl(0, 0, 0, 1.4, 4.2, M.steel); p.cyl(0, 4.2, 0, 0.9, 0.3, M.darkMetal); p.box(0, 2.2, 1.35, 0.8, 0.8, 0.1, mat(0x0d2030, { emissive: 0x5af0c0, glow: 1 }), false); },
  pillar(p) { p.box(0, 0, 0, 2.4, WH, 2.4, mat(0xd8d3c8, { roughness: 0.6 })); p.box(0, 0, 0, 2.6, 0.5, 2.6, mat(0x5b5752)); },
  plant(p) { p.cyl(0, 0, 0, 0.55, 1.0, M.plantPot); for (let i = 0; i < 5; i++) { const a = i * 1.26; p.box(Math.cos(a) * 0.35, 1.0 + (i % 3) * 0.35, Math.sin(a) * 0.35, 0.7, 0.9, 0.7, M.leaf); } },
  crate(p, item) { const s = 2.2 + ((Math.abs(item.x * 13 + item.z * 7) | 0) % 3) * 0.1; p.box(0, 0, 0, s, s * 0.8, s, mat(0x9c7a4c, { roughness: 0.9 })); p.box(0, s * 0.8, 0, s * 0.8, 0.04, 0.3, M.darkWood, false); },
  bucket(p) { p.cyl(0, 0, 0, 0.5, 0.9, M.yellow); p.cyl(0, 0.9, 0.0, 0.05, 2.8, M.lightWood); p.box(0, 3.6, 0, 0.6, 0.2, 0.2, M.yellow); },
  shower(p) {
    const tile = mat(0xdfe6e8, { roughness: 0.3 });
    p.box(0, 0, -1.1, 5, WH - 0.4, 0.2, tile); for (const x of [-2.4, 2.4]) p.box(x, 0, 0, 0.15, 4.0, 2.4, tile);
    p.box(0, 0, 0, 4.6, 0.1, 2.2, mat(0x9fb0b6, { roughness: 0.3 }));
    p.box(0, 3.6, -0.85, 0.12, 0.12, 0.5, M.steel); p.cyl(0, 3.5, -0.5, 0.25, 0.08, M.steel); p.box(0, 0.1, 1.0, 4.6, 3.8, 0.04, mat(0xffffff, { transparent: true, opacity: 0.35, roughness: 0.2 }), false);
  },
  sink(p) { p.box(0, 1.5, 0, 2.2, 0.5, 1.4, M.white); p.cyl(0, 1.95, -0.4, 0.06, 0.4, M.steel); p.box(0, 0, -0.2, 0.3, 1.5, 0.3, M.white); p.box(0, 2.6, -0.62, 2.0, 1.6, 0.05, mat(0xcfe4ec, { roughness: 0.05, metalness: 0.8 }), false); },
  toilet(p) { p.box(0, 0, 0.1, 0.9, 0.9, 1.2, M.white); p.box(0, 0.9, 0.15, 1.0, 0.1, 1.2, M.offWhite); p.box(0, 0.6, -0.65, 1.0, 1.0, 0.35, M.white); },
  toiletStall(p) {
    const panel = mat(0x5c7d8f, { roughness: 0.5 });
    p.box(0, 0.3, -2.95, 6, 4.2, 0.1, panel); p.box(-2.95, 0.3, 0, 0.1, 4.2, 6, panel); p.box(2.95, 0.3, 0, 0.1, 4.2, 6, panel); p.box(0, 0.3, 2.95, 6, 4.2, 0.1, panel);
    p.box(0, 0.3, 3.0, 3, 4.0, 0.06, mat(0x6f93a6, { roughness: 0.5 }));
    for (const x of [-2.95, 2.95]) for (const z of [-2.95, 2.95]) p.box(x, 0, z, 0.15, 0.3, 0.15, M.steel);
  },
  pingPong(p) { p.box(0, 1.25, 0, 6, 0.1, 3.4, mat(0x2f6f50, { roughness: 0.5 })); p.box(0, 1.35, 0, 0.04, 0.5, 3.6, M.white, false); legs(p, 6, 3.4, 1.25, M.darkMetal, 0.4); p.box(0, 1.355, 0, 6, 0.01, 0.06, M.white, false); },
  sterilizer(p) { p.box(0, 0, 0, 3, 3.2, 2, M.steel); p.disc(0, 1.9, 1.0, 0.8, 0.1, M.darkMetal); p.box(0.9, 2.9, 1.01, 0.4, 0.15, 0.02, M.led, false); },
  medCart(p) { p.box(0, 0.35, 0, 1.8, 2.4, 2.6, mat(0x5b8fc0, { roughness: 0.5 })); for (let y = 0.7; y < 2.6; y += 0.5) p.box(0, y, 1.31, 1.6, 0.04, 0.02, M.white, false); for (const x of [-0.7, 0.7]) for (const z of [-1.1, 1.1]) p.cyl(x, 0, z, 0.15, 0.35, M.black); },
  monitorCart(p) { p.box(0, 0, 0, 1.6, 0.2, 1.6, M.black); p.cyl(0, 0.2, 0, 0.1, 2.4, M.steel); p.box(0, 2.6, 0, 1.4, 1.0, 0.2, M.black); p.box(0, 2.65, 0.11, 1.2, 0.85, 0.02, M.screenGreen, false); },
  wheelchair(p) {
    p.box(0, 0.9, 0, 1.6, 0.15, 1.6, M.black); p.box(0, 1.0, -0.8, 1.6, 1.6, 0.1, M.black);
    for (const x of [-0.95, 0.95]) p.disc(x, 1.0, -0.2, 1.0, 0.08, M.steel);
    for (const x of [-0.6, 0.6]) p.cyl(x, 0, 0.8, 0.15, 0.3, M.black);
  },
  cellDoor(p) {
    // An open steel cell door, lying along z, with its barred hatch.
    const panel = mat(0xa9b0b4, { roughness: 0.55, metalness: 0.15 }), iron = mat(0x40474d, { metalness: 0.5, roughness: 0.5 });
    p.box(0, 0, 0, 0.15, 4.2, 3.2, panel);
    for (const side of [-1, 1]) {
      p.box(side * 0.09, 2.4, 0, 0.03, 1.2, 1.0, mat(0x1d2329), false);
      for (const z of [-0.3, 0, 0.3]) p.box(side * 0.11, 2.4, z, 0.04, 1.2, 0.07, iron, false);
      p.box(side * 0.1, 0.6, 0, 0.03, 0.25, 1.6, iron, false);
    }
  },
  nightstand(p) { p.box(0, 0, 0, 1.4, 1.4, 1.2, mat(0x8a8f8c)); },
  whiteboard(p) { p.box(0, 1.8, 0, 7, 3, 0.1, M.white, false); p.box(0, 1.75, 0, 7.2, 0.1, 0.2, M.steel, false); p.box(-1.6, 2.6, 0.06, 2.4, 0.06, 0.01, mat(0x2050c0), false); p.box(1.0, 3.4, 0.06, 3.4, 0.06, 0.01, mat(0xc03030), false); },
  tv(p) { p.box(0, 2.2, 0, 7, 4, 0.2, M.black, false); p.box(0, 2.4, 0.11, 6.6, 3.6, 0.02, mat(0x0d1b26, { emissive: 0x2c5f8a, glow: 0.8 }), false); },
  stairs(p) {
    const step = mat(0x6a737b, { roughness: 0.7 }), edge = mat(0xd8b23a, { roughness: 0.6 });
    for (let i = 0; i < 10; i++) { p.box(0, 0, -5.5 + i * 1.25, 4, 0.36 * (i + 1), 1.25, step); p.box(0, 0.36 * (i + 1) - 0.02, -5.5 + i * 1.25 - 0.55, 4, 0.04, 0.15, edge, false); }
    for (const x of [-2.15, 2.15]) {
      p.box(x, 0, 0, 0.3, 4.2, 12.4, mat(0x4b545c));
      p.box(x, 4.2, 0, 0.12, 0.12, 12.4, M.steel);
    }
  },
};

function buildWalls(batch, floor, y) {
  const scheme = WALL_SCHEMES[floor] || WALL_SCHEMES[0];
  const upper = mat(scheme.upper, { roughness: 0.9 }), lower = mat(scheme.lower, { roughness: 0.85 }), base = mat(scheme.base, { roughness: 0.7 });
  const frame = mat(0x4a5058, { roughness: 0.5, metalness: 0.3 });
  const doorPanel = mat(0xa9b0b4, { roughness: 0.55, metalness: 0.15 }), exitPanel = mat(0x55636c, { roughness: 0.5, metalness: 0.3 });
  const doorWindow = mat(0x9fd4e0, { emissive: 0x3e6e7c, glow: 0.8, roughness: 0.1 });
  const keypadRed = mat(0xd23a32, { emissive: 0x801010, glow: 1.0 });
  for (const wall of L.walls[floor]) {
    const alongX = wall.z1 === wall.z2, t = wall.thickness;
    // Box helper in wall coordinates: u along the wall, v across it.
    const add = (u, v, y0, length, height, depth, material, shadow = true) => {
      if (alongX) batch.add(BOX, material, u, y + y0 + height / 2, wall.z1 + v, length, height, depth, 0, shadow);
      else batch.add(BOX, material, wall.x1 + v, y + y0 + height / 2, u, depth, height, length, 0, shadow);
    };
    for (const piece of L.wallPieces(wall)) {
      const a = alongX ? piece.minX : piece.minZ, b = alongX ? piece.maxX : piece.maxZ, mid = (a + b) / 2, length = b - a;
      add(mid, 0, 0, length, WH, t, upper);
      add(mid, 0, 0, length, 2.2, t + 0.04, lower, false);
      add(mid, 0, 2.2, length, 0.1, t + 0.08, base, false);
      add(mid, 0, 0, length, 0.4, t + 0.1, base, false);
    }
    for (const door of wall.doors) {
      const width = door.exit ? DW * 1.6 : DW;
      if (!door.closed) {
        add(door.at, 0, DH, DW, WH - DH, t, upper);
        add(door.at, 0, DH - 0.12, DW + 0.5, 0.25, t + 0.14, frame, false);
        for (const s of [-1, 1]) add(door.at + s * (DW / 2 + 0.06), 0, 0, 0.25, DH, t + 0.14, frame, false);
        continue;
      }
      // Locked doors are painted on both faces: panel, frame, a small window and a card reader.
      for (const side of [-1, 1]) {
        const v = side * (t / 2 + 0.05);
        add(door.at, v, 0, width + 0.5, DH + 0.2, 0.1, frame, false);
        add(door.at, v + side * 0.04, 0, width, DH, 0.08, door.exit ? exitPanel : doorPanel, false);
        if (door.exit) {
          for (const s of [-1, 1]) add(door.at + s * width / 4, v + side * 0.08, 1.5, width / 2 - 0.6, 2.2, 0.04, doorWindow, false);
          add(door.at, v + side * 0.1, 1.6, width - 0.4, 0.15, 0.08, M.steel, false);
          add(door.at, v + side * 0.06, 0, 0.08, DH, 0.06, frame, false);
        } else {
          add(door.at, v + side * 0.08, 2.4, 0.9, 1.3, 0.04, doorWindow, false);
          add(door.at + width / 2 - 0.45, v + side * 0.08, 1.9, 0.12, 0.45, 0.08, M.steel, false);
          add(door.at + width / 2 + 0.75, v + side * 0.02, 2.2, 0.4, 0.55, 0.12, M.black, false);
          add(door.at + width / 2 + 0.75, v + side * 0.08, 2.55, 0.32, 0.14, 0.04, keypadRed, false);
        }
      }
    }
  }
}

// Barred windows let a little daylight in along the outer walls, wherever nothing stands in front.
function buildWindows(batch, floor, y) {
  const iron = mat(0x40474d, { metalness: 0.5, roughness: 0.5 }), sill = mat(0x9a9d97);
  // Anything in front of the outer wall (interior walls meeting it, furniture against it) blocks a window.
  const obstacles = [
    ...L.walls[floor].filter(wall => wall.thickness < 1).flatMap(L.wallPieces),
    ...L.furniture[floor].filter(item => item.type !== 'rug' && item.type !== 'mat').map(L.footprint).filter(Boolean),
  ];
  const clear = (x1, z1, x2, z2) => !obstacles.some(box => box.maxX > x1 && box.minX < x2 && box.maxZ > z1 && box.minZ < z2);
  for (const side of [-1, 1]) {
    for (let x = -82; x <= 82; x += 11) {
      const face = side * 65;
      if (!clear(x - 2.4, Math.min(face, face - side * 2.5), x + 2.4, Math.max(face, face - side * 2.5))) continue;
      const v = face - side * 0.04;
      batch.add(BOX, windowMaterial, x, y + 3.1, v, 3.6, 2.2, 0.06, 0, false);
      batch.add(BOX, sill, x, y + 1.95, v - side * 0.15, 4.0, 0.15, 0.4, 0, false);
      for (let i = -1.5; i <= 1.5; i += 0.5) batch.add(BOX, iron, x + i, y + 3.1, v - side * 0.08, 0.08, 2.2, 0.08, 0, false);
      batch.add(BOX, iron, x, y + 3.1, v - side * 0.08, 3.6, 0.08, 0.08, 0, false);
    }
    for (let z = -56; z <= 56; z += 11) {
      const face = side * 89;
      if (!clear(Math.min(face, face - side * 2.5), z - 2.4, Math.max(face, face - side * 2.5), z + 2.4)) continue;
      const v = face - side * 0.04;
      batch.add(BOX, windowMaterial, v, y + 3.1, z, 0.06, 2.2, 3.6, 0, false);
      batch.add(BOX, sill, v - side * 0.15, y + 1.95, z, 0.4, 0.15, 4.0, 0, false);
      for (let i = -1.5; i <= 1.5; i += 0.5) batch.add(BOX, iron, v - side * 0.08, y + 3.1, z + i, 0.08, 2.2, 0.08, 0, false);
      batch.add(BOX, iron, v - side * 0.08, y + 3.1, z, 0.08, 0.08, 3.6, 0, false);
    }
  }
}

function buildCeiling(batch, floor, y) {
  plane(batch, ceilingMaterial, -89, -65, 89, 65, y + WH - 0.01, 5, true);
  // The opening above each staircase, so the steps lead somewhere.
  const hole = mat(0x0b0f13, { roughness: 1 });
  for (const stair of L.STAIRS) batch.add(BOX, hole, stair.x, y + WH - 0.03, stair.z + 3, 4.2, 0.02, 5, 0, false);
  // Light panels on a grid in every room; corridors get a strip down the middle.
  for (const room of L.rooms[floor]) {
    const w = room.x2 - room.x1, d = room.z2 - room.z1;
    if (room.style === 'corridor') {
      const along = w > d;
      const length = along ? w : d;
      for (let s = 4; s < length - 2; s += 9) {
        const x = along ? room.x1 + s : (room.x1 + room.x2) / 2, z = along ? (room.z1 + room.z2) / 2 : room.z1 + s;
        if (Math.abs(x) < 5.5 && Math.abs(z) < 5.5 && !along) continue;
        batch.add(BOX, lightPanelMaterial, x, y + WH - 0.08, z, along ? 3.6 : 1.2, 0.1, along ? 1.2 : 3.6, 0, false);
      }
      continue;
    }
    const nx = Math.max(1, Math.round(w / 12)), nz = Math.max(1, Math.round(d / 12));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      batch.add(BOX, lightPanelMaterial, room.x1 + (i + 0.5) * w / nx, y + WH - 0.08, room.z1 + (j + 0.5) * d / nz, 3.4, 0.1, 1.4, 0, false);
    }
  }
}

function makeSign(text, tint) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1620'; ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = tint || '#51d6e8'; ctx.fillRect(0, 0, 512, 10);
  ctx.fillStyle = '#f2f7fb'; ctx.font = 'bold 40px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 56, 480);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const width = Math.min(8, Math.max(3.2, text.length * 0.42));
  return new THREE.Mesh(new THREE.PlaneGeometry(width, width * 96 / 512), new THREE.MeshBasicMaterial({ map: texture }));
}
const FACE_ANGLE = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };

export function buildInterior(floors) {
  L.FLOOR_Y.forEach((y, floor) => {
    const group = floors[floor];
    const batch = new Batch();
    // Structural slab, then a finish per room on top of it.
    batch.add(BOX, mat(0x6d7275, { roughness: 0.95 }), 0, y - 0.3, 0, 180, 0.6, 132, 0, false);
    for (const room of L.rooms[floor]) {
      const style = FLOOR_STYLES[room.style] ? room.style : 'tile';
      plane(batch, floorMaterial(style), room.x1, room.z1, room.x2, room.z2, y + 0.012, FLOOR_STYLES[style].tile);
    }
    buildWalls(batch, floor, y);
    buildWindows(batch, floor, y);
    buildCeiling(batch, floor, y);
    for (const item of L.furniture[floor]) BUILDERS[item.type]?.(placer(batch, item, y), item);
    batch.flush(group);
    for (const sign of L.signs[floor]) {
      const mesh = makeSign(sign.text, sign.tint);
      mesh.position.set(sign.x, y + DH + 0.6, sign.z);
      mesh.rotation.y = FACE_ANGLE[sign.face] ?? 0;
      group.add(mesh);
    }
  });
}
