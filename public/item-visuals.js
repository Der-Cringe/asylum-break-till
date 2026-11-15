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

// Models are built in hand space: +z points where the character is facing, +y is up.
const MODELS = {
  glassShard: g => { box(g, 0, 0, 0.3, 0.07, 0.16, 0.6, 0x9fe3ef, 0x1d5866); box(g, 0, 0, -0.05, 0.12, 0.14, 0.2, 0xd9d2c4); },
  tableLeg: g => { box(g, 0, 0, 0.55, 0.18, 0.18, 1.4, 0x8a5a33); box(g, 0, 0, 1.22, 0.24, 0.24, 0.12, 0x5d3b20); },
  stunBaton: g => { box(g, 0, 0, 0.45, 0.13, 0.13, 1.2, 0x2c3540); box(g, 0, 0, 1.06, 0.16, 0.16, 0.12, 0xf2d33b, 0x8a6d00); },
  riotShield: g => { box(g, -0.7, 0.55, 0.55, 1.35, 1.9, 0.08, solidGlass(0x8fb4cf)); box(g, -0.7, 0.7, 0.6, 1.1, 0.12, 0.04, 0xeef6fb); },
  shockShield: g => { box(g, -0.7, 0.55, 0.55, 1.35, 1.9, 0.08, 0xc8463b); box(g, -0.7, 0.55, 0.61, 0.16, 1.6, 0.04, 0xf2d33b, 0x8a6d00); },
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
};
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
export function makeItemModel(item, color = 0xcccccc) {
  const group = new THREE.Group();
  (MODELS[item] || (g => box(g, 0, 0, 0.2, 0.3, 0.3, 0.3, color)))(group);
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
      case 'fire': this.burst(data, y, 0xff7a2f, 0.35, 0.8); break;
      case 'zone': this.zone(data, y); break;
      case 'zoneEnd': case 'mineEnd': this.remove(this.persistent.get(data.id)); this.persistent.delete(data.id); break;
      case 'mine': this.mine(data, y); break;
      case 'ray': this.beam(data, y, data.color ?? 0xf2d33b, 0.07, 0.25); break;
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
  zone(data, y) {
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
