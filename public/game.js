import * as THREE from 'three';
import { makeItemModel, EffectLayer } from './item-visuals.js?v=20261115-3';
import { loadCharacterModels, buildCharacterModel } from './characters.js?v=20261115-1';

const ITEMS = window.ITEMS || {};

const socket = window.io ? io({ transports: ['websocket', 'polling'] }) : null;
const ROLES = {
  orderly: { name: 'Orderly', color: 0x2878d0, floor: 2, x: 70, z: 0, items: ['riotShield', 'taser', 'stunBaton', 'arrestCuffs', 'flashGrenade'], ability: 'Containment', maxHealth: 115 },
  medic: { name: 'Medic', color: 0x35b987, floor: 2, x: -70, z: 0, items: ['smallMedicalKit', 'mediumMedicalKit', 'fireExtinguisher'], ability: 'Field treatment', maxHealth: 100 },
  director: { name: 'Facility Director', color: 0x9670d5, floor: 1, x: 70, z: 43, items: ['stunBaton', 'shockShield', 'arrestCuffs', 'tablet'], ability: 'Override access', maxHealth: 100 },
  patient: { name: 'Patient', color: 0xc85953, floor: 3, x: -72, z: 8, items: ['glassShard'], ability: 'Adrenaline', maxHealth: 100 },
};
const FLOOR_Y = [0, 9, 18, 27];
const FLOOR_NAMES = ['GROUND', 'U1', 'U2', 'U3'];
// Stairwells sit at x = ±78, steps run from z = -7 to z = 4. Keep in sync with server.js.
const STAIRS = [{ x: -78, z: -1.5 }, { x: 78, z: -1.5 }];
const STAIR_RADIUS = 14;
const PLAYER_RADIUS = 0.6;
const CAMERA_PRESETS = [
  { label: 'Research', floor: 1, x: -42, z: -30, yaw: -0.8, pitch: 0.5 },
  { label: 'Medical', floor: 2, x: 38, z: 30, yaw: 1.2, pitch: 0.45 },
  { label: 'Ward', floor: 3, x: -18, z: 56, yaw: 2.5, pitch: 0.42 },
  { label: 'Exit', floor: 0, x: 0, z: -40, yaw: 0.5, pitch: 0.55 },
];
const state = {
  role: null, id: null, x: 0, z: 0, floor: 0, yaw: 0, pitch: 0.34, actor: null, health: 100, maxHealth: 100, items: [], equipped: null, view: null,
  // Combat status from the server, converted to local performance.now() deadlines.
  stunnedUntil: 0, downUntil: 0, slowedUntil: 0, speed: 1, look: null,
};
const keys = new Set();
const remoteActors = new Map();
const joystick = { active: false, pointer: null, x: 0, y: 0 };
const sessionToken = (() => {
  const create = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const stored = sessionStorage.getItem('asylumSession') || create();
    sessionStorage.setItem('asylumSession', stored);
    return stored;
  } catch (_) { return create(); }
})();
let lastNetworkUpdate = 0;
let lastCameraPointer = null;
let noticeTimer = 0;
let visibleFloor = -1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101923);
scene.fog = new THREE.Fog(0x101923, 90, 245);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const isTouch = window.matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdcecff, 0x35404b, 1.6));
const keyLight = new THREE.DirectionalLight(0xffe6c1, 2.15);
keyLight.position.set(-38, 70, 32);
keyLight.castShadow = true;
keyLight.shadow.mapSize.setScalar(isTouch ? 1024 : 1536);
Object.assign(keyLight.shadow.camera, { left: -105, right: 105, top: 105, bottom: -105, near: 0.5, far: 220 });
keyLight.shadow.bias = -0.00015;
scene.add(keyLight);
const blueFill = new THREE.PointLight(0x438de3, 75, 110, 2);
blueFill.position.set(0, 18, 0);
scene.add(blueFill);

// One shared unit box and cached materials: every box is just a scaled mesh, so characters that
// leave the game do not leak GPU buffers and the map does not allocate hundreds of geometries.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const materialCache = new Map();
function standard(color, roughness = 0.8, metalness = 0.03) {
  const key = `${color}|${roughness}|${metalness}`;
  if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return materialCache.get(key);
}
const floors = [];
const colliders = FLOOR_Y.map(() => []);
function addBox(parent, x, y, z, w, h, d, materialOrColor, options = {}) {
  const material = materialOrColor?.isMaterial ? materialOrColor : standard(materialOrColor, options.roughness, options.metalness);
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (options.solidOn !== undefined) colliders[options.solidOn].push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  return mesh;
}
function addSign(parent, text, x, y, z, tint = '#51d6e8') {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#09131f'; ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = tint; ctx.fillRect(0, 0, 512, 8);
  ctx.fillStyle = '#f2f7fb'; ctx.font = 'bold 27px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 53);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: texture }));
  sign.position.set(x, y, z); parent.add(sign);
}
const ceilingLightMaterial = new THREE.MeshStandardMaterial({ color: 0x93d8e2, emissive: 0x1d7b91, emissiveIntensity: 1.2, roughness: 0.35 });
const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x80d3df, transparent: true, opacity: 0.38, roughness: 0.2 });
function addCeilingLights(parent, y) {
  for (const z of [-46, -15, 16, 47]) addBox(parent, 0, y + 6.72, z, 17, 0.12, 1.1, ceilingLightMaterial, { castShadow: false });
}
function buildFloor(index) {
  const y = FLOOR_Y[index]; const group = new THREE.Group(); floors[index] = group; scene.add(group);
  const lab = index === 1; const ward = index === 3;
  const groundMaterial = standard(lab ? 0x52606a : ward ? 0xb9c2c2 : 0x929da2, 0.92);
  const wallMaterial = standard(lab ? 0x303b47 : 0xd1d2cc, 0.86);
  const solid = { solidOn: index };
  addBox(group, 0, y - 0.3, 0, 180, 0.6, 132, groundMaterial, { castShadow: false });
  addBox(group, 0, y + 3.4, -65.5, 180, 6.8, 1, wallMaterial);
  addBox(group, 0, y + 3.4, 65.5, 180, 6.8, 1, wallMaterial);
  addBox(group, -89.5, y + 3.4, 0, 1, 6.8, 132, wallMaterial);
  addBox(group, 89.5, y + 3.4, 0, 1, 6.8, 132, wallMaterial);
  addCeilingLights(group, y);

  const bedFrame = standard(0x415464, 0.58, 0.22);
  for (const z of [-45, -27, -9, 9, 27, 45]) for (const x of [-68, -54, 54, 68]) {
    addBox(group, x, y + 0.43, z, 5.3, 0.24, 2.5, bedFrame, solid);
    addBox(group, x, y + 0.64, z, 5.0, 0.2, 2.2, lab ? 0x8db6bc : 0xdfe7e7);
    addBox(group, x - 1.4, y + 0.79, z, 2.4, 0.08, 1.6, 0xf1f3eb);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) addBox(group, side * 78, y + 0.16 + i * 0.36, -7 + i * 1.25, 4, 0.22, 1.2, 0x5e6a75);
    addSign(group, 'STAIRS · E ▲  F ▼', side * 78, y + 4.8, -16, '#6dd9e7');
  }
  if (lab) {
    for (const side of [-1, 1]) for (const x of [-60, -20, 20, 60]) {
      addBox(group, x, y + 1.45, side * 37, 28, 2.9, 0.8, 0x424e5b, solid);
      addBox(group, x, y + 3.35, side * 37, 25, 1.0, 0.16, glassMaterial);
      addBox(group, x, y + 0.7, side * 49, 11, 1.4, 3, 0x766956, solid);
      addBox(group, x, y + 1.45, side * 49, 9, 0.14, 2.6, 0x4aa8b0);
    }
    addSign(group, 'RESEARCH DIVISION · RESTRICTED', 0, y + 5.5, -63, '#b39aff');
  } else if (ward) {
    addBox(group, -18, y + 1.1, 56, 14, 2.1, 5, 0x765d46, solid);
    addBox(group, -18, y + 2.22, 56, 12, 0.14, 3.8, 0x45b6c5);
    addSign(group, 'PATIENT WARD · RECOVERY', 0, y + 5.5, -63, '#70dbaf');
  } else {
    addSign(group, index === 2 ? 'MEDICAL BAY · SECURITY' : 'GROUND FLOOR · EXIT', 0, y + 5.5, -63, index === 2 ? '#65d9ad' : '#56d5e8');
  }
  group.visible = false;
}
for (let i = 0; i < FLOOR_Y.length; i++) buildFloor(i);

// Swap the blocky stand-ins for the real models as soon as each one has loaded.
loadCharacterModels(role => {
  if (state.actor && (state.look || state.role) === role) {
    const old = state.actor;
    state.actor = makeCharacter(role); scene.add(state.actor); scene.remove(old);
    applyActorStatus(state.actor, { equippedItem: state.equipped, stunned: isStunned(), down: isDown() });
  }
  for (const [id, actor] of remoteActors) {
    if (actor.userData.role !== role) continue;
    const next = makeCharacter(role);
    next.position.copy(actor.position);
    next.userData.target = actor.userData.target;
    scene.remove(actor); scene.add(next); remoteActors.set(id, next);
    if (next.userData.target) applyActorStatus(next, next.userData.target);
  }
});
const effects = new EffectLayer({ floors, floorY: FLOOR_Y, actorFor: id => (id === state.id ? state.actor : remoteActors.get(id)) });
// Loot lying around the map: a slowly spinning item over a glowing ring. Walk over it to pick it up.
const pickupMeshes = new Map();
const pickupRingMaterial = new THREE.MeshBasicMaterial({ color: 0x7de4c8, transparent: true, opacity: 0.55 });
const PICKUP_RING = new THREE.RingGeometry(0.7, 0.95, 24);
function syncPickups(list) {
  const present = new Set();
  for (const pickup of list) {
    if (!pickup || !ITEMS[pickup.item] || !floors[pickup.floor]) continue;
    const key = `${pickup.id}:${pickup.item}`;
    present.add(key);
    if (pickupMeshes.has(key)) continue;
    const group = new THREE.Group();
    const ring = new THREE.Mesh(PICKUP_RING, pickupRingMaterial); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; group.add(ring);
    const model = makeItemModel(pickup.item, ITEMS[pickup.item].color); model.scale.setScalar(1.4); model.position.y = 1; group.add(model);
    group.userData.model = model;
    group.position.set(pickup.x, FLOOR_Y[pickup.floor], pickup.z);
    floors[pickup.floor].add(group);
    pickupMeshes.set(key, group);
  }
  for (const [key, group] of pickupMeshes) if (!present.has(key)) { group.parent?.remove(group); pickupMeshes.delete(key); }
}
// Full white for the first part of the flash, then a slow fade back to normal sight.
function updateBlind(now) {
  const overlay = document.getElementById('flashBlind');
  if (!state.blindUntil || now >= state.blindUntil) {
    if (overlay.style.opacity !== '0') overlay.style.opacity = '0';
    state.blindStrength = 0;
    return;
  }
  const progress = (now - state.blindStart) / (state.blindUntil - state.blindStart);
  const fade = progress < 0.35 ? 1 : 1 - (progress - 0.35) / 0.65;
  overlay.style.opacity = String(state.blindStrength * fade * fade);
}
function flashDamage() {
  const overlay = document.getElementById('damageFlash');
  overlay.classList.remove('visible'); void overlay.offsetWidth; overlay.classList.add('visible');
}

function blocked(x, z, floor) {
  return colliders[floor].some(box => x + PLAYER_RADIUS > box.minX && x - PLAYER_RADIUS < box.maxX && z + PLAYER_RADIUS > box.minZ && z - PLAYER_RADIUS < box.maxZ);
}

function makeCharacter(roleKey) {
  const model = buildCharacterModel(roleKey);
  const root = model ? model.root : makeBlockCharacter(roleKey);
  if (model) Object.assign(root.userData, model);
  root.userData.role = roleKey;
  root.userData.height ??= 3.2;
  root.rotation.order = 'YXZ'; // Knocked-out characters tip over relative to where they face.
  // Spinning stars over the head while stunned.
  const stars = new THREE.Group(); stars.position.y = root.userData.height + 0.4; stars.visible = false; root.add(stars);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    addBox(stars, Math.cos(angle) * 0.6, 0, Math.sin(angle) * 0.6, 0.2, 0.2, 0.2, starMaterial, { castShadow: false });
  }
  root.userData.stars = stars;
  return root;
}
// Blocky stand-in, used until the role's 3D model has loaded (or if it fails to load).
function makeBlockCharacter(roleKey) {
  const role = ROLES[roleKey] || ROLES.patient;
  const root = new THREE.Group();
  const uniform = standard(role.color, 0.58, 0.08);
  const dark = standard(0x17202b, 0.78);
  const skin = standard(0xe9bd9e, 0.9);
  const addPart = (x, y, z, w, h, d, mat) => addBox(root, x, y, z, w, h, d, mat);
  // Deliberately blocky proportions evoke a toy-like, Roblox-inspired avatar.
  addPart(0, 1.48, 0, 1.15, 1.28, 0.62, uniform);
  addPart(0, 0.72, 0, 1.08, 0.34, 0.58, dark);
  addPart(-0.3, 0.16, 0, 0.43, 1.08, 0.46, dark);
  addPart(0.3, 0.16, 0, 0.43, 1.08, 0.46, dark);
  addPart(-0.77, 1.44, 0, 0.37, 1.06, 0.42, uniform);
  // The item arm hangs from a shoulder pivot so it can swing; held items attach to its hand.
  const arm = new THREE.Group(); arm.position.set(0.77, 1.97, 0); root.add(arm);
  addBox(arm, 0, -0.53, 0, 0.37, 1.06, 0.42, uniform);
  const hand = new THREE.Group(); hand.position.set(0, -1.0, 0.12); arm.add(hand);
  root.userData.arm = arm; root.userData.hand = hand;
  addPart(0, 2.62, 0.02, 0.82, 0.82, 0.74, skin);
  addPart(0, 3.07, -0.01, 0.86, 0.22, 0.78, roleKey === 'medic' ? 0x7d463c : 0x1b2532);
  addPart(-0.18, 2.65, 0.4, 0.085, 0.09, 0.045, 0x101820);
  addPart(0.18, 2.65, 0.4, 0.085, 0.09, 0.045, 0x101820);
  addPart(0, 1.68, 0.33, 0.56, 0.14, 0.07, roleKey === 'director' ? 0xf4c45f : 0xdcebf3);
  if (roleKey === 'orderly') {
    addPart(0, 2.65, 0.45, 0.62, 0.14, 0.06, 0x168fd0);
    addPart(-0.78, 1.94, 0, 0.52, 0.28, 0.68, dark);
    addPart(0.78, 1.94, 0, 0.52, 0.28, 0.68, dark);
  } else if (roleKey === 'medic') {
    addPart(0, 1.68, 0.39, 0.38, 0.38, 0.08, 0xf1f7f3);
    addPart(0, 1.68, 0.44, 0.1, 0.27, 0.04, 0x27a981);
    addPart(0, 1.68, 0.45, 0.27, 0.1, 0.04, 0x27a981);
  } else if (roleKey === 'director') {
    addPart(0, 3.15, 0.02, 0.96, 0.08, 0.85, 0xd5a94d);
    addPart(0.25, 2.03, 0.37, 0.28, 0.13, 0.05, 0xf2c35d);
  } else if (roleKey === 'patient') {
    addPart(-0.36, 1.7, 0.31, 0.25, 0.08, 0.05, 0xb96851);
  }
  return root;
}
const starMaterial = new THREE.MeshBasicMaterial({ color: 0xffe066 });
const barBackMaterial = new THREE.MeshBasicMaterial({ color: 0x14202b, transparent: true, opacity: 0.8, depthTest: false });
const barFillMaterial = new THREE.MeshBasicMaterial({ color: 0x5af07f, depthTest: false });
const barLowMaterial = new THREE.MeshBasicMaterial({ color: 0xf06a4f, depthTest: false });
const BAR_PLANE = new THREE.PlaneGeometry(1, 1);
// Floating health bar for other players, only shown once they are hurt.
function healthBar(actor) {
  if (actor.userData.bar) return actor.userData.bar;
  const bar = new THREE.Group(); bar.position.y = actor.userData.height + 0.75; bar.renderOrder = 10;
  const back = new THREE.Mesh(BAR_PLANE, barBackMaterial); back.scale.set(1.7, 0.24, 1); back.renderOrder = 10;
  const fill = new THREE.Mesh(BAR_PLANE, barFillMaterial); fill.position.z = 0.01; fill.renderOrder = 11;
  bar.add(back, fill); bar.userData.fill = fill;
  actor.add(bar); actor.userData.bar = bar;
  return bar;
}
// Shows what a character holds and whether it is stunned, knocked out or hurt.
function applyActorStatus(actor, status) {
  const item = status.equippedItem ?? null;
  if (actor.userData.item !== item) {
    actor.userData.item = item;
    actor.userData.hand.clear();
    if (item && ITEMS[item]) actor.userData.hand.add(makeItemModel(item, ITEMS[item].color));
  }
  actor.userData.down = Boolean(status.down);
  actor.userData.stars.visible = Boolean(status.stunned) && !status.down;
  if (Number.isFinite(status.health) && Number.isFinite(status.maxHealth) && actor !== state.actor) {
    const hurt = status.health < status.maxHealth && !status.down;
    const bar = healthBar(actor); bar.visible = hurt;
    const ratio = Math.max(0, status.health / status.maxHealth);
    bar.userData.fill.scale.set(1.6 * ratio, 0.16, 1);
    bar.userData.fill.position.x = -0.8 * (1 - ratio);
    bar.userData.fill.material = ratio < 0.35 ? barLowMaterial : barFillMaterial;
  }
}
// Per-frame pose: arm swing, lying down when knocked out, spinning stars, bars facing the camera.
const barQuaternion = new THREE.Quaternion();
function animateActor(actor, dt, baseY) {
  const data = actor.userData;
  // Walk cycle driven by how far the character actually moved, so remote players animate too.
  const moved = data.lastX === undefined ? 0 : Math.hypot(actor.position.x - data.lastX, actor.position.z - data.lastZ);
  data.lastX = actor.position.x; data.lastZ = actor.position.z;
  const speed = dt > 0 ? Math.min(moved / dt, 20) : 0;
  const walking = speed > 0.6 && !data.down && !data.stars.visible;
  data.stride = THREE.MathUtils.lerp(data.stride || 0, walking ? Math.min(1, speed / 9) : 0, 1 - Math.exp(-10 * dt));
  data.phase = ((data.phase || 0) + dt * (4 + speed * 0.55)) % (Math.PI * 2);
  data.time = (data.time || 0) + dt;
  const swingAngle = Math.sin(data.phase) * 0.85 * data.stride;
  const idle = Math.sin(data.time * 1.8) * 0.04 * (1 - data.stride);
  data.swing = Math.max(0, (data.swing || 0) - dt);
  const attack = data.swing > 0 ? -Math.sin((data.swing / 0.3) * Math.PI) * 1.7 : 0;
  // Holding something keeps the item arm raised a little so the item points forward.
  const holding = data.item ? -0.35 : 0;
  data.arm.rotation.x = attack || (holding + swingAngle * (data.item ? 0.4 : 1) + idle);
  if (data.armL) data.armL.rotation.x = -swingAngle - idle;
  if (data.legR) { data.legR.rotation.x = -swingAngle; data.legL.rotation.x = swingAngle; }
  if (data.head) data.head.rotation.y = data.stars.visible ? Math.sin(data.time * 6) * 0.25 : 0;
  actor.rotation.x = data.down ? -Math.PI / 2 : 0;
  actor.position.y = baseY + (data.down ? 0.45 : Math.abs(Math.sin(data.phase)) * 0.08 * data.stride);
  if (data.stars.visible) data.stars.rotation.y += dt * 5;
  if (data.bar?.visible) data.bar.quaternion.copy(actor.getWorldQuaternion(barQuaternion).invert().multiply(camera.quaternion));
}

function showNotice(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => toast.classList.remove('visible'), 1900);
}
function showFloor(index) {
  if (index === visibleFloor) return;
  visibleFloor = index;
  floors.forEach((floor, i) => { floor.visible = i === index; });
}
function setFloor(index) {
  state.floor = THREE.MathUtils.clamp(index, 0, FLOOR_Y.length - 1);
  if (!state.view) showFloor(state.floor);
  if (state.actor) state.actor.position.set(state.x, FLOOR_Y[state.floor], state.z);
  document.getElementById('floorLabel').textContent = `FLOOR · ${FLOOR_NAMES[state.floor]}`;
  updateCamera(1);
}
const cameraTarget = new THREE.Vector3();
function updateCamera(alpha) {
  const view = state.view || state;
  // Tablet cameras hang higher and further back to overlook a whole room.
  const distance = state.view ? 30 : 14, height = state.view ? 20 : 9.5;
  cameraTarget.set(view.x + Math.sin(view.yaw) * distance, FLOOR_Y[view.floor] + height + view.pitch * 3, view.z + Math.cos(view.yaw) * distance);
  camera.position.lerp(cameraTarget, alpha);
  camera.lookAt(view.x, FLOOR_Y[view.floor] + 1.45, view.z);
}
function setHealth(value, max = state.maxHealth) {
  state.maxHealth = max;
  state.health = THREE.MathUtils.clamp(Number(value) || 0, 0, max);
  document.getElementById('healthText').textContent = `${Math.round(state.health)} / ${max}`;
  document.getElementById('healthFill').style.width = `${(state.health / max) * 100}%`;
}
function sendJoin() {
  if (!socket || !socket.connected || !state.role) return;
  socket.emit('joinGame', { role: state.role, name: document.getElementById('playerName').value.trim() || 'Player', session: sessionToken });
}
function sendPosition() {
  lastNetworkUpdate = performance.now();
  socket?.emit('updatePlayer', { x: state.x, z: state.z, floor: state.floor, yaw: state.yaw });
}
function readableItem(item) {
  return ITEMS[item]?.name ?? item.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}
function selectItem(item) {
  state.equipped = item;
  document.querySelectorAll('.equipment-slot').forEach(el => el.classList.toggle('selected', el.dataset.item === item));
  document.getElementById('tabletPanel').classList.toggle('hidden', item !== 'tablet');
  if (item !== 'tablet') setView(null);
  if (state.actor) applyActorStatus(state.actor, { equippedItem: item, stunned: isStunned(), down: isDown() });
}
// Slots are { item, uses, cooldown } from the server; plain item names work before it answers.
function renderSlots(slotsData) {
  const items = slotsData.map(slot => (typeof slot === 'string' ? { item: slot, uses: ITEMS[slot]?.uses ?? null, cooldown: 0 } : slot));
  const now = performance.now();
  const signature = items.map(slot => slot.item).join('|');
  const slots = document.getElementById('equipmentSlots');
  if (signature !== state.slotSignature) {
    state.slotSignature = signature;
    slots.replaceChildren();
    items.forEach((slot, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'equipment-slot'; button.dataset.item = slot.item;
      const number = document.createElement('span'); number.className = 'slot-number'; number.textContent = String(index + 1);
      const label = document.createElement('span'); label.className = 'slot-label'; label.textContent = readableItem(slot.item);
      const uses = document.createElement('span'); uses.className = 'slot-uses';
      const cooldown = document.createElement('span'); cooldown.className = 'slot-cooldown';
      button.append(number, label, uses, cooldown);
      button.addEventListener('click', () => equip(slot.item));
      slots.appendChild(button);
    });
  }
  state.items = items.map(slot => ({ ...slot, readyAt: now + (slot.cooldown || 0), total: (ITEMS[slot.item]?.cooldown ?? 0) * 1000 }));
  slots.querySelectorAll('.equipment-slot').forEach((button, index) => {
    const slot = items[index];
    button.querySelector('.slot-uses').textContent = slot?.uses != null ? `×${slot.uses}` : '';
    button.classList.toggle('selected', button.dataset.item === state.equipped);
  });
  if (state.equipped && !items.some(slot => slot.item === state.equipped)) selectItem(null);
}
function equip(item) {
  // Picking the item that is already in hand puts it away again.
  const next = state.equipped === item ? null : item;
  selectItem(next);
  socket?.emit('equipItem', { item: next });
}
function updateSlotCooldowns(now) {
  const buttons = document.querySelectorAll('.equipment-slot');
  state.items.forEach((slot, index) => {
    const bar = buttons[index]?.querySelector('.slot-cooldown'); if (!bar) return;
    const left = slot.readyAt - now;
    bar.style.transform = `scaleX(${left > 0 && slot.total > 0 ? Math.min(1, left / slot.total) : 0})`;
  });
}
const isStunned = () => performance.now() < Math.max(state.stunnedUntil, state.downUntil);
const isDown = () => performance.now() < state.downUntil;
function useItem() {
  if (!state.role || !state.equipped || state.view) return;
  const def = ITEMS[state.equipped];
  if (!def || def.kind === 'tool') return;
  if (isStunned()) { showNotice(isDown() ? 'You are knocked out' : 'You are stunned'); return; }
  const slot = state.items.find(entry => entry.item === state.equipped);
  if (slot && slot.readyAt > performance.now()) return;
  if (!socket?.connected) { showNotice('Items need the server connection'); return; }
  // Swing immediately so melee feels responsive; the server decides what it hit.
  if (def.kind === 'melee') state.actor.userData.swing = 0.3;
  socket.emit('useItem', { yaw: state.yaw });
}
function applySelfState(data) {
  const now = performance.now();
  if (Number.isFinite(data.health) && Number.isFinite(data.maxHealth)) setHealth(data.health, data.maxHealth);
  if (Array.isArray(data.inventory)) renderSlots(data.inventory.filter(slot => slot && typeof slot.item === 'string'));
  if (data.equippedItem !== undefined && data.equippedItem !== state.equipped) selectItem(data.equippedItem);
  const wasDown = isDown();
  state.stunnedUntil = now + (Number(data.stunned) || 0);
  state.downUntil = now + (Number(data.down) || 0);
  state.slowedUntil = now + (Number(data.slowed) || 0);
  state.speed = Number(data.speed) || 1;
  if (!wasDown && isDown()) showNotice('Knocked out · respawning');
  const look = data.look ?? null;
  if (look !== state.look && state.role) {
    state.look = look;
    // Disguised players see themselves in the borrowed uniform, just like everyone else does.
    state.actor?.parent?.remove(state.actor);
    state.actor = makeCharacter(look || state.role); scene.add(state.actor);
    state.actor.userData.item = undefined;
  }
  if (state.actor) applyActorStatus(state.actor, { equippedItem: state.equipped, stunned: isStunned(), down: isDown() });
  updateStatusEffect();
}
function updateStatusEffect() {
  const now = performance.now();
  const element = document.getElementById('statusEffect');
  let text = '';
  if (now < state.downUntil) text = `Knocked out · ${Math.ceil((state.downUntil - now) / 1000)}s`;
  else if (now < state.stunnedUntil) text = `Stunned · ${Math.ceil((state.stunnedUntil - now) / 1000)}s`;
  else if (now < state.slowedUntil) text = 'Slowed';
  else if (state.speed > 1) text = 'Speed boost';
  else if (state.look) text = 'Disguised';
  if (element.textContent !== text) element.textContent = text;
  element.classList.toggle('visible', Boolean(text));
  element.classList.toggle('bad', now < Math.max(state.downUntil, state.stunnedUntil, state.slowedUntil));
}
function setView(preset) {
  state.view = preset;
  document.querySelectorAll('.camera-preset').forEach(el => el.classList.toggle('active', el.dataset.label === preset?.label));
  showFloor(preset ? preset.floor : state.floor);
  updateCamera(1);
}
function renderCameraPresets() {
  const host = document.getElementById('cameraPresets');
  host.replaceChildren();
  for (const preset of [...CAMERA_PRESETS, null]) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'camera-preset';
    button.dataset.label = preset?.label ?? 'live';
    button.textContent = preset?.label ?? 'Live';
    button.addEventListener('click', () => setView(preset));
    host.appendChild(button);
  }
}
renderCameraPresets();

function chooseRole(roleKey) {
  const role = ROLES[roleKey]; if (!role) return;
  state.role = roleKey; state.x = role.x; state.z = role.z;
  Object.assign(state, { look: null, stunnedUntil: 0, downUntil: 0, slowedUntil: 0, speed: 1, slotSignature: null });
  state.actor?.parent?.remove(state.actor);
  state.actor = makeCharacter(roleKey); scene.add(state.actor);
  setView(null);
  setFloor(role.floor);
  document.getElementById('roleLabel').textContent = `ROLE · ${role.name.toUpperCase()}`;
  document.getElementById('statusLabel').textContent = socket?.connected ? 'NETWORK · CONNECTED' : 'LOCAL · CONNECTING';
  document.getElementById('objectiveText').textContent = roleKey === 'patient' ? 'Reach the ground-floor exit and escape.' : 'Secure the facility and restore containment.';
  document.getElementById('objectiveHint').textContent = `${role.ability} · Find the stairwell to change floors.`;
  document.getElementById('joinScreen').classList.add('hidden');
  document.body.classList.add('in-game');
  renderSlots(role.items);
  selectItem(null);
  setHealth(role.maxHealth, role.maxHealth);
  sendJoin();
}
function leaveToJoinScreen(message) {
  state.role = null;
  state.actor?.parent?.remove(state.actor); state.actor = null;
  selectItem(null);
  document.getElementById('roleLabel').textContent = 'ROLE · NONE';
  document.getElementById('joinMessage').textContent = message;
  document.getElementById('joinScreen').classList.remove('hidden');
  document.body.classList.remove('in-game');
}
document.querySelectorAll('.roleButton').forEach(button => button.addEventListener('click', () => chooseRole(button.dataset.role)));

if (socket) {
  socket.on('connect', () => { document.getElementById('statusLabel').textContent = state.role ? 'NETWORK · CONNECTED' : 'NETWORK · READY'; sendJoin(); });
  socket.on('disconnect', () => { document.getElementById('statusLabel').textContent = state.role ? 'LOCAL · RECONNECTING' : 'NETWORK · OFFLINE'; });
  socket.on('connect_error', () => { document.getElementById('statusLabel').textContent = 'LOCAL MODE · NETWORK OFFLINE'; });
  socket.on('assignedPlayer', data => {
    if (!data) return; state.id = data.id;
    if (Number.isFinite(data.x)) state.x = data.x;
    if (Number.isFinite(data.z)) state.z = data.z;
    if (Number.isInteger(data.floor)) setFloor(data.floor);
    applySelfState(data);
    if (data.resumed) showNotice('Reconnected · position restored');
  });
  socket.on('joinRejected', data => leaveToJoinScreen(data?.reason || 'Could not join. Pick another class.'));
  socket.on('positionCorrection', data => {
    if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.z)) return;
    state.x = data.x; state.z = data.z;
    if (Number.isInteger(data.floor) && data.floor !== state.floor) setFloor(data.floor);
  });
  socket.on('playersState', list => {
    if (!Array.isArray(list)) return;
    const present = new Set(list.map(p => p?.id));
    // Geometry and materials are shared, so removing the group is enough to free a character.
    for (const [id, actor] of remoteActors) if (!present.has(id)) { scene.remove(actor); remoteActors.delete(id); }
    for (const person of list) {
      if (!person || person.id === state.id || !Number.isInteger(person.floor)) continue;
      let actor = remoteActors.get(person.id);
      // A disguised patient is drawn in the uniform it stole, so rebuild when the look changes.
      const look = person.look || person.role;
      if (actor && actor.userData.role !== look) { scene.remove(actor); actor = null; }
      if (!actor) {
        actor = makeCharacter(look); remoteActors.set(person.id, actor); scene.add(actor);
        actor.position.set(person.x, FLOOR_Y[person.floor] || 0, person.z);
      }
      actor.userData.target = person;
      applyActorStatus(actor, person);
    }
  });
  socket.on('selfState', data => { if (data && state.role) applySelfState(data); });
  socket.on('effect', data => {
    if (!data || typeof data.type !== 'string') return;
    effects.handle(data);
    if (data.type === 'hit' && data.floor === state.floor && Math.hypot(data.x - state.x, data.z - state.z) < 0.5) flashDamage();
  });
  socket.on('blinded', data => {
    const duration = Number(data?.duration) * 1000;
    if (!(duration > 0)) return;
    const now = performance.now();
    // A second flash while still blinded extends the effect instead of restarting it dimmer.
    state.blindStart = now;
    state.blindUntil = Math.max(state.blindUntil || 0, now + duration);
    state.blindStrength = Math.min(1, Math.max(Number(data.strength) || 1, state.blindStrength || 0));
  });
  socket.on('pickups', list => { if (Array.isArray(list)) syncPickups(list); });
  socket.on('abilityFeedback', data => { if (data?.message) showNotice(data.message); });
}

function changeFloor(direction) {
  if (!state.role) return;
  const distance = Math.min(...STAIRS.map(stair => Math.hypot(state.x - stair.x, state.z - stair.z)));
  if (distance > STAIR_RADIUS) { showNotice('Move closer to a stairwell first'); return; }
  const next = state.floor + direction;
  if (next < 0 || next >= FLOOR_Y.length) { showNotice(direction > 0 ? 'You are on the top floor' : 'You are on the ground floor'); return; }
  setFloor(next); showNotice(`Entered ${FLOOR_NAMES[state.floor]}`);
  if (socket?.connected) sendPosition();
}
function useAbility() {
  if (!state.role) return;
  const ability = ROLES[state.role].ability;
  if (socket?.connected) socket.emit('useAbility', { ability }); else showNotice(`${ability} activated`);
}
window.addEventListener('keydown', event => {
  if (event.target.closest?.('input, textarea, select')) return;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyE') changeFloor(1);
  if (event.code === 'KeyF') changeFloor(-1);
  if (event.code === 'KeyQ') useAbility();
  if (event.code === 'Space') useItem();
  if (/^Digit[1-6]$/.test(event.code)) document.querySelectorAll('.equipment-slot')[Number(event.code.at(-1)) - 1]?.click();
}, { passive: false });
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

renderer.domElement.addEventListener('pointerdown', event => {
  if (event.target.closest?.('button')) return;
  lastCameraPointer = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: 0, mouse: event.pointerType === 'mouse' && event.button === 0 };
  renderer.domElement.setPointerCapture?.(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!lastCameraPointer || event.pointerId !== lastCameraPointer.id) return;
  const dx = event.clientX - lastCameraPointer.x, dy = event.clientY - lastCameraPointer.y;
  lastCameraPointer.moved += Math.abs(dx) + Math.abs(dy);
  state.yaw -= dx * 0.006;
  state.pitch = THREE.MathUtils.clamp(state.pitch - dy * 0.004, -0.25, 0.8);
  lastCameraPointer.x = event.clientX; lastCameraPointer.y = event.clientY;
});
for (const type of ['pointerup', 'pointercancel']) {
  renderer.domElement.addEventListener(type, event => {
    if (event.pointerId !== lastCameraPointer?.id) return;
    // A mouse click that did not turn the camera uses the held item.
    if (type === 'pointerup' && lastCameraPointer.mouse && lastCameraPointer.moved < 6) useItem();
    lastCameraPointer = null;
  });
}

const joystickZone = document.getElementById('joystickZone');
const pad = document.getElementById('movePad');
const stick = document.getElementById('moveStick');
function resetJoystick() {
  joystick.active = false; joystick.pointer = null; joystick.x = 0; joystick.y = 0;
  pad.classList.remove('visible'); stick.style.transform = 'translate(-50%,-50%)';
}
function moveJoystick(clientX, clientY) {
  const rect = pad.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, limit = rect.width * 0.3;
  const dx = clientX - cx, dy = clientY - cy, length = Math.hypot(dx, dy), scale = length > limit ? limit / length : 1;
  const x = dx * scale, y = dy * scale;
  joystick.x = x / limit; joystick.y = y / limit;
  stick.style.transform = `translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;
}
joystickZone.addEventListener('pointerdown', event => {
  event.preventDefault(); joystick.active = true; joystick.pointer = event.pointerId;
  // The pad is centred (translate -50%) on the touch point, in coordinates relative to the zone.
  const rect = joystickZone.getBoundingClientRect();
  pad.style.left = `${event.clientX - rect.left}px`; pad.style.top = `${event.clientY - rect.top}px`; pad.classList.add('visible');
  joystickZone.setPointerCapture?.(event.pointerId); moveJoystick(event.clientX, event.clientY);
});
joystickZone.addEventListener('pointermove', event => { if (joystick.active && event.pointerId === joystick.pointer) moveJoystick(event.clientX, event.clientY); });
joystickZone.addEventListener('pointerup', event => { if (event.pointerId === joystick.pointer) resetJoystick(); });
joystickZone.addEventListener('pointercancel', resetJoystick);
const sprintButton = document.getElementById('sprintButton');
sprintButton.addEventListener('pointerdown', event => { event.preventDefault(); keys.add('ShiftLeft'); sprintButton.classList.add('active'); });
for (const type of ['pointerup','pointercancel','pointerleave']) sprintButton.addEventListener(type, () => { keys.delete('ShiftLeft'); sprintButton.classList.remove('active'); });
document.getElementById('stairsUpButton').addEventListener('click', () => changeFloor(1));
document.getElementById('stairsDownButton').addEventListener('click', () => changeFloor(-1));
document.getElementById('abilityButton').addEventListener('click', useAbility);
document.getElementById('useButton').addEventListener('pointerdown', event => { event.preventDefault(); useItem(); });
document.getElementById('fullscreenButton').addEventListener('click', async () => {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch (_) { showNotice('Fullscreen is unavailable in this browser'); }
});
if (isTouch) document.body.classList.add('touch-device');

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  if (state.role && state.actor) {
    let forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    let sideways = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    if (joystick.active) { forward = -joystick.y; sideways = joystick.x; }
    const length = Math.hypot(forward, sideways); if (length > 1) { forward /= length; sideways /= length; }
    // Stunned or knocked-out players cannot move; the server ignores their position updates anyway.
    if (isStunned()) { forward = 0; sideways = 0; }
    const slowed = now < state.slowedUntil, boosted = state.speed > 1 && !slowed;
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 14 : 8) * (slowed ? 0.55 : 1) * (boosted ? state.speed : 1);
    // The camera sits behind the player at +(sin yaw, cos yaw), so "forward" points the other way.
    const stepX = (-Math.sin(state.yaw) * forward + Math.cos(state.yaw) * sideways) * speed * dt;
    const stepZ = (-Math.cos(state.yaw) * forward - Math.sin(state.yaw) * sideways) * speed * dt;
    const nextX = THREE.MathUtils.clamp(state.x + stepX, -86, 86);
    if (!blocked(nextX, state.z, state.floor)) state.x = nextX;
    const nextZ = THREE.MathUtils.clamp(state.z + stepZ, -62, 62);
    if (!blocked(state.x, nextZ, state.floor)) state.z = nextZ;
    state.actor.position.set(state.x, FLOOR_Y[state.floor], state.z);
    state.actor.rotation.y = state.yaw + Math.PI;
    state.actor.visible = visibleFloor === state.floor;
    animateActor(state.actor, dt, FLOOR_Y[state.floor]);
    updateCamera(1 - Math.exp(-7 * dt));
    if (socket?.connected && now - lastNetworkUpdate > 100) sendPosition();
    updateSlotCooldowns(now);
    updateStatusEffect();
  }
  // Remote players glide towards their last reported position instead of jumping every tick.
  const smoothing = 1 - Math.exp(-12 * dt);
  for (const actor of remoteActors.values()) {
    const target = actor.userData.target; if (!target) continue;
    actor.position.x += (target.x - actor.position.x) * smoothing;
    actor.position.z += (target.z - actor.position.z) * smoothing;
    actor.rotation.y = (Number(target.yaw) || 0) + Math.PI;
    actor.visible = target.floor === visibleFloor;
    animateActor(actor, dt, FLOOR_Y[target.floor] || 0);
  }
  effects.update(dt);
  updateBlind(now);
  for (const group of pickupMeshes.values()) {
    group.userData.model.rotation.y += dt * 1.6;
    group.userData.model.position.y = 1 + Math.sin(now / 400 + group.position.x) * 0.15;
  }
  renderer.render(scene, camera);
}
setFloor(0);
animate();
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);
});
window.addEventListener('load', () => {
  const loading = document.getElementById('loadingScreen');
  document.getElementById('loadingStatus').textContent = 'Facility online';
  window.setTimeout(() => { loading.classList.add('done'); window.setTimeout(() => loading.remove(), 500); }, 450);
});
