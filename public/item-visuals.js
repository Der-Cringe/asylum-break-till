import * as THREE from 'three';

// Blocky item models and short-lived combat effects. Everything is built from one shared unit box,
// like the map and the characters, so the look stays consistent and nothing needs asset files.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const materialCache = new Map();
function solid(color, emissive = 0) {
  const key = `${color}|${emissive}`;
  if (!materialCache.has(key)) cache(key, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, emissive, emissiveIntensity: emissive ? 1 : 0 }));
  return materialCache.get(key);
}
// Shared materials are flagged so effect cleanup never disposes something another mesh still uses.
function cache(key, material) {
  material.userData.shared = true;
  materialCache.set(key, material);
}
function box(parent, x, y, z, w, h, d, color, emissive) {
  const mesh = new THREE.Mesh(UNIT_BOX, color?.isMaterial ? color : solid(color, emissive));
  mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Models are built in hand space: +z points where the character is facing, +y is up. Shields are
// centred on their own origin instead, since they are carried in front of the body, not in the hand.
const MODELS = {
  glassShard: g => { box(g, 0, 0, 0.3, 0.07, 0.16, 0.6, 0x9fe3ef, 0x1d5866); box(g, 0, 0, -0.05, 0.12, 0.14, 0.2, 0xd9d2c4); },
  tableLeg: g => { box(g, 0, 0, 0.55, 0.18, 0.18, 1.4, 0x8a5a33); box(g, 0, 0, 1.22, 0.24, 0.24, 0.12, 0x5d3b20); },
  stunBaton: g => { box(g, 0, 0, 0.45, 0.13, 0.13, 1.2, 0x2c3540); box(g, 0, 0, 1.06, 0.16, 0.16, 0.12, 0xf2d33b, 0x8a6d00); },
  riotShield: g => { box(g, 0, 0, 0, 1.35, 1.9, 0.08, solidGlass(0x8fb4cf)); box(g, 0, 0.15, 0.05, 1.1, 0.12, 0.04, 0xeef6fb); },
  shockShield: g => { box(g, 0, 0, 0, 1.35, 1.9, 0.08, 0xc8463b); box(g, 0, 0, 0.06, 0.16, 1.6, 0.04, 0xf2d33b, 0x8a6d00); },
  taser: g => { box(g, 0, 0, 0.2, 0.16, 0.24, 0.5, 0xf2d33b); box(g, 0, -0.18, 0.02, 0.12, 0.26, 0.14, 0x22282f); },
  fireBottle: g => { box(g, 0, 0.1, 0.15, 0.2, 0.4, 0.2, 0x5b8f3a); box(g, 0, 0.38, 0.15, 0.08, 0.2, 0.08, 0xff7a2f, 0xa03a00); },
  pipeBomb: g => { box(g, 0, 0.05, 0.15, 0.2, 0.2, 0.5, 0x6b7178); box(g, 0, 0.18, 0.15, 0.05, 0.12, 0.05, 0xd23a32); },
  flashGrenade: g => { box(g, 0, 0.05, 0.15, 0.24, 0.32, 0.24, 0x4d8ed8); box(g, 0, 0.26, 0.15, 0.08, 0.1, 0.18, 0xb9c3cc); },
  floorMine: g => { box(g, 0, 0, 0.2, 0.5, 0.12, 0.5, 0x3d4a3a); box(g, 0, 0.08, 0.2, 0.1, 0.06, 0.1, 0xd23a32, 0x800000); },
  arrestCuffs: g => { box(g, -0.12, 0, 0.2, 0.2, 0.06, 0.2, 0xb9c3cc); box(g, 0.12, 0, 0.2, 0.2, 0.06, 0.2, 0xb9c3cc); box(g, 0, 0, 0.2, 0.1, 0.04, 0.04, 0x7f8a94); },
  fireExtinguisher: g => { box(g, 0, 0.1, 0.25, 0.3, 0.7, 0.3, 0xd23a32); box(g, 0, 0.5, 0.3, 0.1, 0.1, 0.35, 0x1b1f24); },
  smallMedicalKit: g => medKit(g, 0.45),
  mediumMedicalKit: g => medKit(g, 0.6),
  coffee: g => { box(g, 0, 0.05, 0.2, 0.22, 0.3, 0.22, 0xf1ebe1); box(g, 0, 0.16, 0.2, 0.2, 0.06, 0.2, 0x6b4128); },
  energySoda: g => { box(g, 0, 0.05, 0.2, 0.18, 0.34, 0.18, 0x47d16b); box(g, 0, 0.0, 0.29, 0.12, 0.1, 0.02, 0xeef6fb); },
  stolenScrubs: g => { box(g, 0, 0, 0.2, 0.55, 0.14, 0.4, 0x35b987); box(g, 0, 0.08, 0.2, 0.4, 0.04, 0.3, 0x2a9a70); },
  tablet: g => { box(g, 0, 0.1, 0.25, 0.5, 0.36, 0.04, 0x1c2733); box(g, 0, 0.1, 0.275, 0.42, 0.28, 0.01, 0x3aa0c8, 0x135066); },

  // Patient weapons.
  scrapMetal: g => { box(g, 0, 0, 0.25, 0.1, 0.22, 0.5, 0x8d949b); box(g, 0, 0.06, 0.48, 0.1, 0.12, 0.12, 0x6c737a); },
  crowbar: g => { box(g, 0, 0, 0.55, 0.1, 0.1, 1.3, 0xb5332e); box(g, 0, 0.12, 1.18, 0.1, 0.3, 0.1, 0xb5332e); },
  glassBlade: g => { box(g, 0, 0, 0.6, 0.06, 0.2, 1.1, solidGlass(0xbdf3ff)); box(g, 0, 0, 0, 0.14, 0.14, 0.3, 0x5d3b20); },
  woodenBat: g => { box(g, 0, 0, 0.4, 0.13, 0.13, 0.8, 0xc08a4f); box(g, 0, 0, 1.05, 0.22, 0.22, 0.6, 0xc08a4f); },
  steelBat: g => { box(g, 0, 0, 0.4, 0.13, 0.13, 0.8, 0x2c3540); box(g, 0, 0, 1.05, 0.22, 0.22, 0.6, 0xaeb6bd); },
  crutch: g => { box(g, 0, 0, 0.7, 0.1, 0.1, 1.6, 0xcfd6db); box(g, 0, 0, 1.5, 0.12, 0.35, 0.12, 0x2c3540); },
  pipeSword: g => { box(g, 0, 0, 0.7, 0.12, 0.12, 1.4, 0x7d8790); box(g, 0, 0, 0.05, 0.4, 0.08, 0.08, 0x4b5259); },
  fireAxe: g => { box(g, 0, 0, 0.55, 0.1, 0.1, 1.3, 0x8a5a33); box(g, 0, 0.2, 1.12, 0.06, 0.45, 0.3, 0xd23a32); },
  rebarHammer: g => { box(g, 0, 0, 0.55, 0.1, 0.1, 1.2, 0x6d5a4a); box(g, 0, 0, 1.2, 0.5, 0.3, 0.3, 0x5a5f63); },
  nailBomb: g => { box(g, 0, 0.05, 0.15, 0.3, 0.3, 0.3, 0x4a3f36); box(g, 0, 0.24, 0.15, 0.05, 0.12, 0.05, 0xff7a2f, 0xa03a00); },
  stickyBomb: g => { box(g, 0, 0.05, 0.15, 0.28, 0.2, 0.28, 0x6fb83a); box(g, 0, 0.18, 0.15, 0.1, 0.06, 0.1, 0xd23a32, 0x800000); },
  shove: g => box(g, 0, 0, 0.1, 0.22, 0.22, 0.22, 0xe9bd9e),
  shoulderCharge: g => box(g, 0, 0, 0.1, 0.3, 0.3, 0.3, 0xc85953),
  scream: g => { box(g, 0, 0.05, 0.1, 0.3, 0.06, 0.3, 0xf0c3c0); box(g, 0, 0.15, 0.1, 0.18, 0.06, 0.18, 0xf0c3c0); },
  rallyFlag: g => { box(g, 0, 0.3, 0.1, 0.06, 1.4, 0.06, 0x8a5a33); box(g, 0, 0.8, 0.35, 0.03, 0.4, 0.5, 0xe0453a); },
  berserkPills: g => { box(g, 0, 0.05, 0.15, 0.16, 0.26, 0.16, 0xf1ebe1); box(g, 0, 0.22, 0.15, 0.18, 0.06, 0.18, 0xd23a6f); },
  adrenalineShot: g => { box(g, 0, 0, 0.2, 0.08, 0.08, 0.4, solidGlass(0xf2d33b)); box(g, 0, 0, 0.45, 0.02, 0.02, 0.15, 0xdfe8ef); },
  orderlyUniform: g => uniform(g, 0x2878d0),
  directorSuit: g => uniform(g, 0x9670d5),
  cardboardBox: g => box(g, 0, 0.05, 0.2, 0.5, 0.4, 0.5, 0xb98a55),
  pottedShrub: g => { box(g, 0, -0.05, 0.2, 0.26, 0.2, 0.26, 0x9a5b3a); box(g, 0, 0.2, 0.2, 0.42, 0.36, 0.42, 0x3f8f46); },
  nightVision: g => { box(g, 0, 0.05, 0.2, 0.42, 0.18, 0.18, 0x2f3a2f); box(g, -0.1, 0.05, 0.31, 0.12, 0.12, 0.06, 0x7dff8a, 0x1a8a2a); box(g, 0.1, 0.05, 0.31, 0.12, 0.12, 0.06, 0x7dff8a, 0x1a8a2a); },
  flashlight: g => { box(g, 0, 0, 0.2, 0.14, 0.14, 0.5, 0x2c3540); box(g, 0, 0, 0.48, 0.2, 0.2, 0.08, 0xfff3c4, 0xb8a050); },
  gasMask: g => { box(g, 0, 0.05, 0.2, 0.36, 0.3, 0.16, 0x3b4650); box(g, 0, -0.05, 0.32, 0.14, 0.14, 0.12, 0x6b7178); },
  signalJammer: g => { box(g, 0, 0, 0.2, 0.36, 0.22, 0.26, 0x2f3b4a); box(g, 0.12, 0.25, 0.2, 0.03, 0.35, 0.03, 0xb9c3cc); box(g, -0.05, 0.05, 0.34, 0.08, 0.05, 0.01, 0xd23a32, 0x800000); },

  laundry: g => { box(g, 0, 0, 0.2, 0.5, 0.3, 0.4, 0xdcd6c8); box(g, 0.08, 0.17, 0.15, 0.3, 0.06, 0.25, 0x8fb4cf); },
  paintbrush: g => { box(g, 0, 0, 0.25, 0.06, 0.06, 0.6, 0x8a5a33); box(g, 0, 0, 0.6, 0.1, 0.08, 0.14, 0xe05a8a); },
  contraband: g => { box(g, 0, 0, 0.2, 0.4, 0.28, 0.3, 0x8a6d3a); box(g, 0, 0.15, 0.2, 0.42, 0.04, 0.08, 0x3b2a1a); },
  smuggledGoods: g => { box(g, 0, 0, 0.2, 0.46, 0.3, 0.32, 0x3b2a1a); box(g, 0, 0.16, 0.2, 0.3, 0.05, 0.2, 0xd4af37, 0x5a4a10); },
  keycard: g => { box(g, 0, 0, 0.2, 0.3, 0.02, 0.2, 0x5aa9ff); box(g, -0.06, 0.015, 0.2, 0.1, 0.01, 0.1, 0xeef6fb); },

  // Staff weapons.
  twinBaton: g => { box(g, 0.08, 0, 0.45, 0.1, 0.1, 1.1, 0x3a6fb0); box(g, -0.08, 0, 0.45, 0.1, 0.1, 1.1, 0x3a6fb0); },
  shockRod: g => { box(g, 0, 0, 0.5, 0.1, 0.1, 1.2, 0x1f2a36); box(g, 0, 0, 1.12, 0.14, 0.14, 0.14, 0x4fb3e8, 0x16557a); },
  pocketStunner: g => { box(g, 0, 0, 0.15, 0.16, 0.22, 0.35, 0x1f2a36); box(g, 0, 0.05, 0.34, 0.08, 0.04, 0.04, 0x4fb3e8, 0x16557a); },
  shockSpear: g => { box(g, 0, 0, 0.8, 0.08, 0.08, 1.9, 0x2c3540); box(g, 0, 0, 1.85, 0.12, 0.12, 0.3, 0x5fd0ff, 0x1a6a8a); },
  wrench: g => { box(g, 0, 0, 0.35, 0.1, 0.06, 0.8, 0x9aa4ad); box(g, 0, 0, 0.8, 0.28, 0.08, 0.14, 0x9aa4ad); },
  sledgehammer: g => { box(g, 0, 0, 0.6, 0.1, 0.1, 1.4, 0x8a5a33); box(g, 0, 0, 1.3, 0.5, 0.28, 0.28, 0x50585f); },
  janitorMop: g => { box(g, 0, 0, 0.7, 0.07, 0.07, 1.6, 0x3c8fd0); box(g, 0, -0.05, 1.5, 0.45, 0.12, 0.2, 0xe8e2d0); },
  voltShield: g => { box(g, 0, 0, 0, 1.35, 1.9, 0.08, 0x1f3b5a); box(g, 0, 0, 0.06, 1.1, 0.12, 0.04, 0x3fa9f5, 0x16557a); box(g, 0, 0.5, 0.06, 0.12, 0.6, 0.04, 0x3fa9f5, 0x16557a); },
  barrierShield: g => { box(g, 0, 0, 0, 1.6, 2.1, 0.06, solidGlass(0xd9e4ea)); box(g, 0, -0.75, 0.04, 1.4, 0.1, 0.04, 0x2c3540); },
  heavyShield: g => { box(g, 0, 0, 0, 1.4, 2, 0.16, 0x2b2f36); box(g, 0, 0.55, 0.09, 0.8, 0.12, 0.04, 0x7f8a94); },
  taserRifle: g => { box(g, 0, 0, 0.45, 0.14, 0.2, 1.1, 0xe8b020); box(g, 0, -0.18, 0.1, 0.1, 0.26, 0.14, 0x22282f); box(g, 0, 0, -0.1, 0.12, 0.18, 0.3, 0x22282f); },
  stunPistol: g => { box(g, 0, 0, 0.18, 0.14, 0.18, 0.42, 0xffe36b); box(g, 0, -0.16, 0.02, 0.1, 0.22, 0.12, 0x22282f); },
  laserPistol: g => { box(g, 0, 0, 0.2, 0.14, 0.2, 0.46, 0xdfe8ef); box(g, 0, 0, 0.45, 0.08, 0.08, 0.06, 0xff3b5c, 0x8a0018); box(g, 0, -0.17, 0.02, 0.1, 0.24, 0.12, 0x22282f); },
  pepperballGun: g => { box(g, 0, 0, 0.3, 0.14, 0.18, 0.8, 0x2c3540); box(g, 0, 0.18, 0.15, 0.24, 0.2, 0.24, 0xff8a3c); },
  netLauncher: g => { box(g, 0, 0, 0.3, 0.26, 0.26, 0.8, 0x55603f); box(g, 0, -0.2, 0.05, 0.1, 0.24, 0.14, 0x22282f); },
  shockLasso: g => { box(g, 0, 0, 0.25, 0.14, 0.18, 0.6, 0x1f2a36); box(g, 0, 0, 0.6, 0.24, 0.24, 0.06, 0x7de4ff, 0x1a6a8a); },
  proximityTaser: g => { box(g, 0, 0, 0.2, 0.3, 0.12, 0.3, 0x2c3540); box(g, 0, 0.08, 0.2, 0.2, 0.04, 0.2, 0xf2d33b, 0x8a6d00); },
  sedationPulse: g => { box(g, 0, 0, 0.2, 0.3, 0.3, 0.2, 0xeef6fb); box(g, 0, 0, 0.31, 0.2, 0.2, 0.02, 0xa58bff, 0x3c2a8a); },
  empGrenade: g => { box(g, 0, 0.05, 0.15, 0.24, 0.32, 0.24, 0x3fa9f5); box(g, 0, 0.26, 0.15, 0.08, 0.1, 0.18, 0xb9c3cc); },
  chargedEmp: g => { box(g, 0, 0.05, 0.15, 0.3, 0.36, 0.3, 0x1f6fd0); box(g, 0, 0.05, 0.15, 0.32, 0.08, 0.32, 0x7de4ff, 0x1a6a8a); },
  gasGrenade: g => { box(g, 0, 0.05, 0.15, 0.24, 0.36, 0.24, 0x8fbf4a); box(g, 0, 0.28, 0.15, 0.08, 0.1, 0.18, 0xb9c3cc); },
  empLauncher: g => launcher(g, 0x24476b, 0x3fa9f5),
  gasLauncher: g => launcher(g, 0x55703a, 0x8fbf4a),
  empMine: g => { box(g, 0, 0, 0.2, 0.5, 0.12, 0.5, 0x24476b); box(g, 0, 0.08, 0.2, 0.1, 0.06, 0.1, 0x3fa9f5, 0x16557a); },
  straitjacket: g => { box(g, 0, 0, 0.2, 0.55, 0.16, 0.4, 0xeae3cf); box(g, 0, 0.09, 0.2, 0.56, 0.04, 0.08, 0x8a5a33); },
  weldingTorch: g => { box(g, 0, 0, 0.2, 0.16, 0.16, 0.5, 0xe8a33a); box(g, 0, 0.05, 0.5, 0.06, 0.06, 0.2, 0x50585f); box(g, 0, 0.05, 0.62, 0.04, 0.04, 0.06, 0x7de4ff, 0x1a6a8a); },
  firemansCarry: g => box(g, 0, 0, 0.1, 0.24, 0.24, 0.24, 0xe9bd9e),
  largeMedicalKit: g => medKit(g, 0.78),
  mediGun: g => { box(g, 0, 0, 0.25, 0.18, 0.24, 0.6, 0xeef6fb); box(g, 0, 0, 0.58, 0.1, 0.1, 0.1, 0x5af0a0, 0x1a7a4a); box(g, 0, -0.18, 0.05, 0.1, 0.24, 0.14, 0x27a981); },
  healingGrenade: g => { box(g, 0, 0.05, 0.15, 0.24, 0.32, 0.24, 0xeef6fb); box(g, 0, 0.05, 0.28, 0.16, 0.06, 0.01, 0x27a981); box(g, 0, 0.05, 0.28, 0.06, 0.16, 0.01, 0x27a981); },
  therapyGrenade: g => { box(g, 0, 0.05, 0.15, 0.24, 0.32, 0.24, 0xa58bff); box(g, 0, 0.26, 0.15, 0.08, 0.1, 0.18, 0xb9c3cc); },
  combatVest: g => { box(g, 0, 0, 0.2, 0.55, 0.5, 0.16, 0x3b4a3a); box(g, 0, 0.1, 0.29, 0.3, 0.12, 0.02, 0x27a981); },

  // Food and other things anyone can carry.
  tea: g => { box(g, 0, 0.05, 0.2, 0.24, 0.24, 0.24, 0xf1ebe1); box(g, 0, 0.13, 0.2, 0.22, 0.04, 0.22, 0xb8743a); box(g, 0.16, 0.05, 0.2, 0.06, 0.14, 0.06, 0xf1ebe1); },
  bread: g => { box(g, 0, 0.02, 0.2, 0.3, 0.2, 0.46, 0xd9a35b); box(g, 0, 0.12, 0.2, 0.26, 0.06, 0.4, 0xb67a3a); },
  mango: g => { box(g, 0, 0.05, 0.2, 0.3, 0.26, 0.24, 0xf5a623); box(g, 0, 0.2, 0.2, 0.04, 0.08, 0.04, 0x3f8f46); },
  candy: g => { box(g, 0, 0.05, 0.2, 0.2, 0.2, 0.2, 0xff6fb5); box(g, 0.16, 0.05, 0.2, 0.12, 0.1, 0.1, 0xf1ebe1); box(g, -0.16, 0.05, 0.2, 0.12, 0.1, 0.1, 0xf1ebe1); },
  tomato: g => { box(g, 0, 0.05, 0.2, 0.26, 0.24, 0.26, 0xd8402f); box(g, 0, 0.19, 0.2, 0.1, 0.04, 0.1, 0x3f8f46); },
  snowball: g => box(g, 0, 0.05, 0.2, 0.24, 0.24, 0.24, 0xf4f8fb),
};
function uniform(g, color) {
  box(g, 0, 0, 0.2, 0.55, 0.14, 0.4, color); box(g, 0, 0.08, 0.2, 0.4, 0.04, 0.3, 0xdcebf3);
}
function launcher(g, body, tip) {
  box(g, 0, 0, 0.35, 0.22, 0.22, 1, body); box(g, 0, 0, 0.88, 0.26, 0.26, 0.08, tip, 0x16557a); box(g, 0, -0.2, 0.05, 0.1, 0.26, 0.14, 0x22282f);
}
function solidGlass(color) {
  const key = `glass|${color}`;
  if (!materialCache.has(key)) cache(key, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.55, roughness: 0.2 }));
  return materialCache.get(key);
}
function medKit(g, size) {
  box(g, 0, 0, 0.2, size, size * 0.7, size * 0.4, 0xf1f5f3);
  box(g, 0, 0, 0.2 + size * 0.21, size * 0.4, size * 0.12, 0.02, 0x27a981);
  box(g, 0, 0, 0.2 + size * 0.21, size * 0.12, size * 0.4, 0.02, 0x27a981);
}
// `held` models of light-giving items (the flashlight) come with a beam; loot on the floor does not.
export function makeItemModel(item, color = 0xcccccc, { held = false } = {}) {
  const group = new THREE.Group();
  (MODELS[item] || (g => box(g, 0, 0, 0.2, 0.3, 0.3, 0.3, color)))(group);
  if (held && item === 'flashlight') {
    const beam = new THREE.SpotLight(0xfff1c8, 140, 38, 0.42, 0.45, 1.2);
    beam.position.set(0, 0, 0.5);
    beam.target.position.set(0, -0.6, 10);
    group.add(beam, beam.target);
  }
  return group;
}

// ---- Effects -----------------------------------------------------------------------------------

function fadingMaterial(color, opacity = 0.8) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}
const SPHERE = new THREE.SphereGeometry(1, 18, 12);
const DISC = new THREE.CylinderGeometry(1, 1, 0.06, 28);

export class EffectLayer {
  constructor({ floors, floorY, actorFor }) {
    this.floors = floors; this.floorY = floorY; this.actorFor = actorFor;
    this.active = new Set();
    this.persistent = new Map(); // fire zones and mines, keyed by server id
  }
  // Effects live inside the floor group, so they appear and disappear with their floor.
  add(floor, object, life, update) {
    const parent = this.floors[floor]; if (!parent) return null;
    parent.add(object);
    const entry = { object, life, age: 0, update };
    this.active.add(entry);
    return entry;
  }
  remove(entry) {
    if (!entry) return;
    entry.object.parent?.remove(entry.object);
    entry.object.traverse(child => { if (child.material && !child.material.userData.shared) child.material.dispose(); });
    this.active.delete(entry);
  }
  handle(data) {
    const y = this.floorY[data.floor] ?? 0;
    switch (data.type) {
      case 'swing': {
        const actor = this.actorFor(data.by);
        if (actor) actor.userData.swing = 0.3;
        break;
      }
      case 'throw': {
        const model = makeItemModel(data.item);
        const flight = data.flight, total = flight + (data.fuse || 0);
        this.add(data.floor, model, total, (entry, t) => {
          const k = Math.min(1, t / flight);
          model.position.set(data.x1 + (data.x2 - data.x1) * k, y + 1.8 + Math.sin(k * Math.PI) * 4 - k * 1.6, data.z1 + (data.z2 - data.z1) * k);
          model.rotation.x = k < 1 ? t * 14 : 0;
          if (k === 1) model.visible = Math.floor(t * 10) % 2 === 0; // Blink while the fuse burns.
        });
        break;
      }
      case 'explosion': this.burst(data, y, 0xff9a3c, 0.6); this.burst(data, y, 0xfff1b8, 0.35, 0.55); break;
      case 'flash': this.burst(data, y, 0xcfe6ff, 0.45); break;
      case 'shock': this.burst(data, y, 0x5fd0ff, 0.4); this.ring(data, y, 0x7de4ff, 0.5); break;
      case 'splat': this.puff(data, y - 1.2, 0xd8402f, 0.4); break;
      case 'pulse': this.ring(data, y, data.color ?? 0xf2d33b, 0.45); break;
      case 'stuck': {
        const actor = this.actorFor(data.id);
        if (actor) this.attach(actor, data.fuse);
        break;
      }
      case 'dash': this.beam(data, y, 0xf4f8fb, 0.5, 0.35); break;
      case 'fire': this.burst(data, y, 0xff7a2f, 0.35, 0.8); break;
      case 'gas': this.burst(data, y, 0x9fd05a, 0.45, 0.8); break;
      case 'healing': this.burst(data, y, 0x5af0a0, 0.45, 0.8); break;
      case 'jam': this.ring(data, y, 0x3fa9f5, 0.6); break;
      case 'zone': this.zone(data, y); break;
      case 'zoneEnd': case 'mineEnd': this.remove(this.persistent.get(data.id)); this.persistent.delete(data.id); break;
      case 'mine': this.mine(data, y); break;
      case 'ray': this.beam(data, y, data.color ?? 0xf2d33b, data.net ? 0.5 : 0.07, data.net ? 0.5 : 0.25); break;
      case 'spray': this.beam(data, y, 0xf4f8fb, 1.2, 0.45); break;
      case 'hit': this.puff(data, y, 0xe0453a, 0.35); break;
      case 'block': this.puff(data, y, 0x7dd3fc, 0.3); break;
      case 'heal': this.puff(data, y, 0x5af0a0, 0.6, true); break;
      default: break;
    }
  }
  burst(data, y, color, life, scale = 1) {
    const mesh = new THREE.Mesh(SPHERE, fadingMaterial(color, 0.75));
    mesh.position.set(data.x, y + 1, data.z);
    this.add(data.floor, mesh, life, (_entry, t) => {
      const k = t / life;
      mesh.scale.setScalar(Math.max(0.01, data.radius * scale * (0.3 + 0.7 * Math.sqrt(k))));
      mesh.material.opacity = 0.75 * (1 - k);
    });
  }
  // An expanding ring on the floor, for pulses and shock waves.
  ring(data, y, color, life) {
    const mesh = new THREE.Mesh(DISC, fadingMaterial(color, 0.6));
    mesh.position.set(data.x, y + 0.1, data.z);
    this.add(data.floor, mesh, life, (_entry, t) => {
      const k = t / life, r = Math.max(0.01, data.radius * (0.2 + 0.8 * k));
      mesh.scale.set(r, 1, r);
      mesh.material.opacity = 0.6 * (1 - k);
    });
  }
  // A blinking bomb stuck to a character's back until it goes off.
  attach(actor, life) {
    const bomb = new THREE.Group();
    box(bomb, 0, 0, 0, 0.4, 0.3, 0.3, 0x6fb83a);
    const light = box(bomb, 0, 0.2, 0, 0.12, 0.08, 0.12, 0xd23a32, 0x900000);
    bomb.position.set(0, (actor.userData.height ?? 3) * 0.55, -0.45);
    actor.add(bomb);
    const entry = { object: bomb, life, age: 0, update: (_entry, t) => { light.visible = Math.floor(t * (4 + t * 4)) % 2 === 0; } };
    this.active.add(entry);
  }
  zone(data, y) {
    if (data.kind && data.kind !== 'fire') { this.cloud(data, y); return; }
    const group = new THREE.Group();
    const floor = new THREE.Mesh(DISC, fadingMaterial(0xff5a1f, 0.4));
    floor.scale.set(data.radius, 1, data.radius); floor.position.y = 0.05; group.add(floor);
    const flames = [];
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2, r = data.radius * (0.2 + 0.6 * ((i * 37) % 10) / 10);
      const flame = new THREE.Mesh(UNIT_BOX, fadingMaterial(i % 2 ? 0xffb03a : 0xff6a1f, 0.85));
      flame.position.set(Math.cos(angle) * r, 0.6, Math.sin(angle) * r); flame.scale.set(0.5, 1.2, 0.5);
      group.add(flame); flames.push(flame);
    }
    group.position.set(data.x, y, data.z);
    const entry = this.add(data.floor, group, data.duration, (_entry, t) => {
      flames.forEach((flame, i) => { flame.scale.y = 0.8 + Math.abs(Math.sin(t * 9 + i * 1.7)) * 1.1; flame.position.y = flame.scale.y / 2; });
    });
    this.persistent.set(data.id, entry);
  }
  // Gas, healing mist and jammer fields: a tinted disc with slowly drifting blobs above it.
  cloud(data, y) {
    const colors = { gas: [0x9fd05a, 0x6f9a3a], healing: [0x5af0a0, 0xbff7d8], jam: [0x3fa9f5, 0x1f3b5a] }[data.kind] ?? [0xcccccc, 0x999999];
    const group = new THREE.Group();
    const floor = new THREE.Mesh(DISC, fadingMaterial(colors[0], data.kind === 'jam' ? 0.18 : 0.3));
    floor.scale.set(data.radius, 1, data.radius); floor.position.y = 0.05; group.add(floor);
    const blobs = [];
    const count = data.kind === 'jam' ? 4 : 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2, r = data.radius * (0.15 + 0.65 * ((i * 37) % 10) / 10);
      const blob = new THREE.Mesh(data.kind === 'jam' ? UNIT_BOX : SPHERE, fadingMaterial(colors[i % 2], data.kind === 'jam' ? 0.7 : 0.35));
      blob.position.set(Math.cos(angle) * r, 1, Math.sin(angle) * r);
      blob.scale.setScalar(data.kind === 'jam' ? 0.3 : 1.2 + (i % 3) * 0.4);
      group.add(blob); blobs.push({ blob, angle, r });
    }
    group.position.set(data.x, y, data.z);
    const entry = this.add(data.floor, group, data.duration, (_entry, t) => {
      blobs.forEach(({ blob, angle, r }, i) => {
        const a = angle + t * (data.kind === 'jam' ? 1.5 : 0.25);
        blob.position.set(Math.cos(a) * r, data.kind === 'jam' ? 2 + Math.sin(t * 3 + i) * 0.4 : 0.8 + Math.sin(t * 1.3 + i) * 0.3, Math.sin(a) * r);
        if (data.kind === 'jam') blob.visible = Math.floor(t * 6 + i) % 3 !== 0;
      });
    });
    this.persistent.set(data.id, entry);
  }
  mine(data, y) {
    const group = new THREE.Group();
    box(group, 0, 0.06, 0, 0.9, 0.12, 0.9, 0x3d4a3a);
    const light = box(group, 0, 0.16, 0, 0.18, 0.08, 0.18, 0xd23a32, 0x900000);
    group.position.set(data.x, y, data.z);
    const entry = this.add(data.floor, group, Infinity, (_entry, t) => { light.visible = Math.floor(t * 2) % 2 === 0; });
    this.persistent.set(data.id, entry);
  }
  beam(data, y, color, width, life) {
    const length = Math.hypot(data.x2 - data.x1, data.z2 - data.z1);
    const mesh = new THREE.Mesh(UNIT_BOX, fadingMaterial(color, 0.9));
    mesh.position.set((data.x1 + data.x2) / 2, y + 1.6, (data.z1 + data.z2) / 2);
    mesh.scale.set(width, width, length);
    mesh.rotation.y = Math.atan2(data.x2 - data.x1, data.z2 - data.z1);
    this.add(data.floor, mesh, life, (_entry, t) => { mesh.material.opacity = 0.9 * (1 - t / life); });
  }
  puff(data, y, color, life, rise = false) {
    const group = new THREE.Group();
    const bits = [];
    for (let i = 0; i < 6; i++) {
      const bit = new THREE.Mesh(UNIT_BOX, fadingMaterial(color, 0.9));
      bit.scale.setScalar(0.22);
      group.add(bit); bits.push({ bit, angle: (i / 6) * Math.PI * 2 });
    }
    group.position.set(data.x, y + 1.8, data.z);
    this.add(data.floor, group, life, (_entry, t) => {
      const k = t / life;
      for (const { bit, angle } of bits) {
        bit.position.set(Math.cos(angle) * k * (rise ? 0.6 : 1.4), rise ? k * 1.5 : Math.sin(angle * 2) * k * 0.6, Math.sin(angle) * k * (rise ? 0.6 : 1.4));
        bit.material.opacity = 0.9 * (1 - k);
      }
    });
  }
  update(dt) {
    for (const entry of this.active) {
      entry.age += dt;
      entry.update?.(entry, entry.age);
      if (entry.age >= entry.life) this.remove(entry);
    }
  }
}
