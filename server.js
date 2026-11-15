'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ITEMS = require('./public/items.js');

const VERSION = '2026.11.15-2';
const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
const io = new Server(server, { serveClient: true, pingInterval: 25000, pingTimeout: 20000, maxHttpBufferSize: 1e4 });
const PORT = Number(process.env.PORT) || 3000;
const FLOOR_Y = [0, 9, 18, 27];
const SPAWNS = {
  patient: { x: -72, z: 8, floor: 3 },
  medic: { x: -70, z: 0, floor: 2 },
  orderly: { x: 70, z: 0, floor: 2 },
  director: { x: 70, z: 43, floor: 1 },
};
const INVENTORIES = {
  patient: ['glassShard'],
  medic: ['smallMedicalKit', 'mediumMedicalKit', 'fireExtinguisher'],
  orderly: ['riotShield', 'taser', 'stunBaton', 'arrestCuffs', 'flashGrenade'],
  director: ['stunBaton', 'shockShield', 'arrestCuffs', 'tablet'],
};
const MAX_HEALTH = { patient: 100, medic: 100, orderly: 115, director: 100 };
const ROLE_LIMITS = { director: 1 };
const MAX_PLAYERS = 40;
const MAX_SLOTS = 6;
const SPRINT_SPEED = 14;
// Stairwells sit at x = ±78, steps run from z = -7 to z = 4.
const STAIRS = [{ x: -78, z: -1.5 }, { x: 78, z: -1.5 }];
const STAIR_RADIUS = 16;
const SESSION_TTL_MS = 60_000;
const TICK_MS = 100;
const EVENTS_PER_SECOND = 30;
const RESPAWN_MS = 5000;
const PICKUP_RADIUS = 2;
const PICKUP_RESPAWN_MS = 40_000;
// Loot spots around the map. Patient loot sits in patient areas, staff loot in the medical bay.
const PATIENT_LOOT = ['glassShard', 'tableLeg', 'tableLeg', 'fireBottle', 'pipeBomb', 'floorMine', 'stolenScrubs', 'energySoda', 'coffee'];
const STAFF_LOOT = ['coffee', 'energySoda', 'fireExtinguisher', 'flashGrenade', 'smallMedicalKit'];
const PICKUP_SPOTS = [
  { floor: 3, x: -30, z: 20, pool: PATIENT_LOOT }, { floor: 3, x: -8, z: -30, pool: PATIENT_LOOT },
  { floor: 3, x: 22, z: 38, pool: PATIENT_LOOT }, { floor: 3, x: 36, z: -16, pool: PATIENT_LOOT },
  { floor: 3, x: -40, z: -46, pool: PATIENT_LOOT }, { floor: 3, x: 4, z: 12, pool: PATIENT_LOOT },
  { floor: 0, x: -30, z: -20, pool: PATIENT_LOOT }, { floor: 0, x: 30, z: 30, pool: PATIENT_LOOT },
  { floor: 1, x: -40, z: 14, pool: PATIENT_LOOT }, { floor: 1, x: 40, z: -14, pool: PATIENT_LOOT },
  { floor: 2, x: -22, z: -40, pool: STAFF_LOOT }, { floor: 2, x: 22, z: -40, pool: STAFF_LOOT },
  { floor: 2, x: 0, z: 30, pool: STAFF_LOOT }, { floor: 0, x: 0, z: 45, pool: STAFF_LOOT },
];

const players = new Map();
const sessions = new Map(); // session token -> { player, expires } for players that dropped connection
const zones = new Map(); // id -> burning fire patches
const mines = new Map(); // id -> placed floor mines
const pickups = PICKUP_SPOTS.map((spot, id) => ({ id, ...spot, item: null, respawnAt: 0 }));
let nextEntityId = 1;
let dirty = false;
let pickupsDirty = true;

app.use(express.static(path.join(__dirname, 'public'), {
  // Revalidate everything so deploys show up immediately, but let unchanged files come back as 304.
  setHeaders(res) { res.setHeader('Cache-Control', 'no-cache'); },
}));
app.get('/health', (_req, res) => res.json({ ok: true, players: players.size, version: VERSION }));
app.get('/api/status', (_req, res) => res.json({ online: true, players: players.size, game: 'Asylum Break' }));

function finiteClamp(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
const isObject = data => data !== null && typeof data === 'object';
const nearStairs = (x, z) => STAIRS.some(stair => Math.hypot(x - stair.x, z - stair.z) <= STAIR_RADIUS);
const teamOf = role => (role === 'patient' ? 'patient' : 'staff');
const canUse = (player, item) => ITEMS[item] && (ITEMS[item].team === 'all' || ITEMS[item].team === teamOf(player.role));
const hostile = (a, b) => a !== b && teamOf(a.role) !== teamOf(b.role);
const isDown = (player, now = Date.now()) => player.downUntil > now;
const isStunned = (player, now = Date.now()) => player.stunUntil > now || player.holdUntil > now || isDown(player, now);
function cleanName(value) {
  return String(value ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Player';
}
function publicState(player) {
  const { id, name, role, x, z, floor, yaw, health, maxHealth } = player;
  const now = Date.now();
  return {
    id, name, role, x, z, floor, yaw, health, maxHealth,
    equippedItem: player.equipped?.item ?? null,
    look: player.look, stunned: isStunned(player, now), down: isDown(player, now),
  };
}
// Everything the owning client needs for its own HUD. Timers go out as remaining milliseconds,
// so the client never has to trust that its clock matches ours.
function selfState(player) {
  const now = Date.now();
  return {
    health: player.health, maxHealth: player.maxHealth,
    inventory: player.inventory.map(slot => ({ item: slot.item, uses: slot.uses, cooldown: Math.max(0, slot.readyAt - now) })),
    equippedItem: player.equipped?.item ?? null,
    stunned: Math.max(0, player.stunUntil - now, player.holdUntil - now),
    down: Math.max(0, player.downUntil - now),
    slowed: Math.max(0, player.slowUntil - now),
    speed: speedMultiplier(player, now),
    look: player.look,
  };
}
function sendSelf(player) {
  io.to(player.id).emit('selfState', selfState(player));
  dirty = true;
}
function roleCount(role) {
  let count = 0;
  for (const player of players.values()) if (player.role === role) count++;
  return count;
}
function makeSlot(item) {
  return { item, uses: ITEMS[item].uses ?? null, readyAt: 0 };
}
function freshLoadout(role) {
  return INVENTORIES[role].filter(item => ITEMS[item]).map(makeSlot);
}
function speedMultiplier(player, now = Date.now()) {
  let speed = player.boostUntil > now ? player.boostMultiplier : 1;
  if (player.slowUntil > now) speed *= 0.55;
  return speed;
}
function notify(player, message) {
  io.to(player.id).emit('abilityFeedback', { ok: true, message });
}
function effect(data) {
  io.emit('effect', data);
}

// ---- Combat ----------------------------------------------------------------------------------

// The character looks along (-sin yaw, -cos yaw): the camera sits behind it at +(sin, cos).
function facing(player) {
  return { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
}
// Players in front of `player` within `range` and within `arc` radians of where it is facing, nearest first.
function targetsInFront(player, range, arc, filter) {
  const dir = facing(player);
  const found = [];
  for (const other of players.values()) {
    if (other === player || other.floor !== player.floor || !filter(other)) continue;
    const dx = other.x - player.x, dz = other.z - player.z, distance = Math.hypot(dx, dz);
    if (distance > range) continue;
    const angle = distance < 0.01 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dz * dir.z) / distance)));
    if (angle <= arc / 2) found.push({ other, distance });
  }
  return found.sort((a, b) => a.distance - b.distance).map(entry => entry.other);
}
// A held shield stops anything that arrives from the front half of the shield bearer.
function blockedByShield(target, fromX, fromZ) {
  const held = target.equipped && ITEMS[target.equipped.item];
  if (!held?.shield || isStunned(target)) return false;
  const dir = facing(target);
  return (fromX - target.x) * dir.x + (fromZ - target.z) * dir.z > 0;
}
function damage(target, amount, attacker) {
  if (isDown(target) || amount <= 0) return;
  target.health = Math.max(0, target.health - amount);
  effect({ type: 'hit', x: target.x, z: target.z, floor: target.floor });
  if (target.health === 0) knockDown(target, attacker);
  sendSelf(target);
}
function stun(target, seconds) {
  if (seconds > 0) target.stunUntil = Math.max(target.stunUntil, Date.now() + seconds * 1000);
  sendSelf(target);
}
function slow(target, seconds) {
  if (seconds > 0) target.slowUntil = Math.max(target.slowUntil, Date.now() + seconds * 1000);
  sendSelf(target);
}
function knockDown(target, attacker) {
  target.downUntil = Date.now() + RESPAWN_MS;
  target.look = null;
  notify(target, attacker ? `Knocked out by ${attacker.name}` : 'Knocked out');
  if (attacker) notify(attacker, `You knocked out ${target.name}`);
}
function respawn(player) {
  const spawn = SPAWNS[player.role];
  Object.assign(player, {
    x: spawn.x, z: spawn.z, floor: spawn.floor, y: FLOOR_Y[spawn.floor],
    health: player.maxHealth, downUntil: 0, stunUntil: 0, slowUntil: 0, boostUntil: 0, look: null,
    inventory: freshLoadout(player.role), equipped: null, combo: null,
  });
  io.to(player.id).emit('positionCorrection', { x: player.x, z: player.z, floor: player.floor });
  sendSelf(player);
}
function meleeHit(attacker, target, def) {
  if (blockedByShield(target, attacker.x, attacker.z)) { effect({ type: 'block', x: target.x, z: target.z, floor: target.floor }); return; }
  const now = Date.now();
  if (def.combo) {
    // Count consecutive hits on the same target inside the combo window.
    const combo = attacker.combo?.target === target.id && attacker.combo.until > now ? attacker.combo.count + 1 : 1;
    attacker.combo = { target: target.id, count: combo >= def.combo.stunOn ? 0 : combo, until: now + def.combo.window * 1000 };
    damage(target, def.damage, attacker);
    if (combo >= def.combo.stunOn) stun(target, def.combo.stun);
    else if (combo >= def.combo.slowOn) slow(target, def.combo.slow);
    return;
  }
  const wasSlowed = target.slowUntil > now;
  damage(target, def.damage, attacker);
  if (def.stunIfSlowed && wasSlowed) stun(target, def.stunIfSlowed);
  else if (def.slow) slow(target, def.slow);
  if (def.stun) stun(target, def.stun);
}
// Explosions, flashes and fire land at a point on a floor and affect everyone around it.
function detonate(owner, floor, x, z, fx) {
  effect({ type: fx.type, x, z, floor, radius: fx.radius, duration: fx.duration });
  if (fx.type === 'fire') {
    const id = nextEntityId++;
    zones.set(id, { id, owner: owner.id, ownerTeam: teamOf(owner.role), floor, x, z, radius: fx.radius, dps: fx.dps, until: Date.now() + fx.duration * 1000 });
    effect({ type: 'zone', id, x, z, floor, radius: fx.radius, duration: fx.duration });
    return;
  }
  for (const target of players.values()) {
    if (target.floor !== floor || !hostile(owner, target)) continue;
    const distance = Math.hypot(target.x - x, target.z - z);
    if (distance > fx.radius) continue;
    if (blockedByShield(target, x, z)) { effect({ type: 'block', x: target.x, z: target.z, floor }); continue; }
    const closeness = 1 - distance / fx.radius;
    if (fx.maxDamage) damage(target, Math.round(fx.minDamage + (fx.maxDamage - fx.minDamage) * closeness), owner);
    if (fx.stun) stun(target, fx.stun * (0.5 + closeness * 0.5));
  }
}
// The thrower may disconnect before the fuse runs out; effects still need a team to aim at.
function ownerSnapshot(player) {
  return { id: player.id, role: player.role, name: player.name };
}

const USE_HANDLERS = {
  melee(player, def) {
    effect({ type: 'swing', by: player.id });
    for (const target of targetsInFront(player, def.range, def.arc, other => hostile(player, other) && !isDown(other))) meleeHit(player, target, def);
    return true;
  },
  ray(player, def) {
    const [target] = targetsInFront(player, def.range, def.arc, other => hostile(player, other) && !isDown(other));
    const dir = facing(player);
    const end = target ? { x: target.x, z: target.z } : { x: player.x + dir.x * def.range, z: player.z + dir.z * def.range };
    effect({ type: 'ray', by: player.id, floor: player.floor, x1: player.x, z1: player.z, x2: end.x, z2: end.z, color: def.color });
    if (target) {
      if (blockedByShield(target, player.x, player.z)) effect({ type: 'block', x: target.x, z: target.z, floor: target.floor });
      else stun(target, def.stun);
    }
    return true;
  },
  throw(player, def) {
    const dir = facing(player);
    const to = {
      x: finiteClamp(player.x + dir.x * def.throwRange, -86, 86, player.x),
      z: finiteClamp(player.z + dir.z * def.throwRange, -62, 62, player.z),
    };
    const floor = player.floor;
    const owner = ownerSnapshot(player);
    effect({ type: 'throw', by: player.id, item: player.equipped.item, floor, x1: player.x, z1: player.z, x2: to.x, z2: to.z, flight: def.flight, fuse: def.fuse ?? 0 });
    setTimeout(() => detonate(owner, floor, to.x, to.z, def.effect), (def.flight + (def.fuse ?? 0)) * 1000);
    return true;
  },
  place(player, def) {
    const id = nextEntityId++;
    mines.set(id, { id, owner: ownerSnapshot(player), floor: player.floor, x: player.x, z: player.z, armedAt: Date.now() + def.armTime * 1000, def });
    effect({ type: 'mine', id, floor: player.floor, x: player.x, z: player.z });
    return true;
  },
  disguise(player, def) {
    player.look = def.look;
    notify(player, 'Disguised · attacking blows your cover');
    return true;
  },
  arrest(player, def) {
    const [target] = targetsInFront(player, def.range, def.arc, other => other.role === 'patient' && isStunned(other));
    if (!target) { notify(player, 'Arrest needs a stunned or knocked-out patient in front of you'); return false; }
    const spawn = SPAWNS.patient;
    respawn(target);
    Object.assign(target, { x: spawn.x, z: spawn.z, floor: spawn.floor, holdUntil: Date.now() + def.hold * 1000 });
    io.to(target.id).emit('positionCorrection', { x: target.x, z: target.z, floor: target.floor });
    notify(target, `Arrested by ${player.name} · back to the ward`);
    notify(player, `${target.name} is back in the ward`);
    sendSelf(target);
    return true;
  },
  spray(player, def) {
    const dir = facing(player);
    effect({ type: 'spray', by: player.id, floor: player.floor, x1: player.x, z1: player.z, x2: player.x + dir.x * def.range, z2: player.z + dir.z * def.range });
    for (const zone of zones.values()) {
      if (zone.floor !== player.floor) continue;
      const dx = zone.x - player.x, dz = zone.z - player.z, distance = Math.hypot(dx, dz);
      if (distance - zone.radius > def.range) continue;
      if (distance < zone.radius || (dx * dir.x + dz * dir.z) / distance > Math.cos(def.arc)) endZone(zone);
    }
    return true;
  },
  heal(player, def) {
    const [target] = targetsInFront(player, def.range, def.arc, other => !hostile(player, other) && !isDown(other) && other.health < other.maxHealth);
    const patient = target || player;
    if (patient.health >= patient.maxHealth) { notify(player, 'Nobody here needs healing'); return false; }
    patient.health = Math.min(patient.maxHealth, patient.health + def.heal);
    effect({ type: 'heal', x: patient.x, z: patient.z, floor: patient.floor });
    if (patient !== player) notify(patient, `${player.name} patched you up`);
    sendSelf(patient);
    return true;
  },
  consume(player, def) {
    if (def.heal) player.health = Math.min(player.maxHealth, player.health + def.heal);
    if (def.speed) { player.boostUntil = Date.now() + def.speed.duration * 1000; player.boostMultiplier = def.speed.multiplier; }
    effect({ type: 'heal', x: player.x, z: player.z, floor: player.floor });
    return true;
  },
};
function endZone(zone) {
  zones.delete(zone.id);
  effect({ type: 'zoneEnd', id: zone.id });
}
function useItem(player) {
  const now = Date.now();
  const slot = player.equipped;
  if (!slot || isStunned(player, now) || slot.readyAt > now) return;
  const def = ITEMS[slot.item];
  const handler = USE_HANDLERS[def.kind];
  if (!handler) return;
  // Hitting anyone with a weapon blows a disguise; healing and drinking do not.
  if (player.look && !['heal', 'consume', 'disguise'].includes(def.kind)) player.look = null;
  if (!handler(player, def)) return;
  slot.readyAt = now + (def.cooldown ?? 0.5) * 1000;
  if (slot.uses !== null && --slot.uses <= 0) {
    player.inventory = player.inventory.filter(entry => entry !== slot);
    player.equipped = null;
  }
  sendSelf(player);
}
function tryPickup(player) {
  if (isDown(player)) return;
  for (const pickup of pickups) {
    if (!pickup.item || pickup.floor !== player.floor || Math.hypot(pickup.x - player.x, pickup.z - player.z) > PICKUP_RADIUS) continue;
    if (!canUse(player, pickup.item)) continue;
    const owned = player.inventory.find(slot => slot.item === pickup.item);
    if (owned && owned.uses === null) continue; // Already holding this weapon.
    if (owned) owned.uses += ITEMS[pickup.item].uses;
    else if (player.inventory.length >= MAX_SLOTS) { notify(player, 'Inventory full'); continue; }
    else player.inventory.push(makeSlot(pickup.item));
    notify(player, `Picked up ${ITEMS[pickup.item].name}`);
    pickup.item = null;
    pickup.respawnAt = Date.now() + PICKUP_RESPAWN_MS;
    pickupsDirty = true;
    sendSelf(player);
  }
}
function pickupList() {
  return pickups.filter(pickup => pickup.item).map(({ id, floor, x, z, item }) => ({ id, floor, x, z, item }));
}

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expires < now) sessions.delete(token);

  for (const player of players.values()) {
    if (player.downUntil && player.downUntil <= now) respawn(player);
    // Let the HUD know when a stun, slow or speed boost runs out.
    const flags = `${isStunned(player, now)}|${player.slowUntil > now}|${player.boostUntil > now}`;
    if (flags !== player.lastFlags) { player.lastFlags = flags; sendSelf(player); }
  }
  for (const zone of zones.values()) {
    if (zone.until <= now) { endZone(zone); continue; }
    for (const target of players.values()) {
      if (target.floor !== zone.floor || teamOf(target.role) === zone.ownerTeam) continue;
      if (Math.hypot(target.x - zone.x, target.z - zone.z) <= zone.radius) damage(target, zone.dps * TICK_MS / 1000, players.get(zone.owner));
    }
  }
  for (const mine of mines.values()) {
    if (mine.armedAt > now) continue;
    for (const target of players.values()) {
      if (target.floor !== mine.floor || !hostile(mine.owner, target) || Math.hypot(target.x - mine.x, target.z - mine.z) > mine.def.trigger) continue;
      mines.delete(mine.id);
      effect({ type: 'mineEnd', id: mine.id });
      detonate(mine.owner, mine.floor, mine.x, mine.z, mine.def.effect);
      break;
    }
  }
  for (const pickup of pickups) {
    if (pickup.item || pickup.respawnAt > now) continue;
    pickup.item = pickup.pool[Math.floor(Math.random() * pickup.pool.length)];
    pickupsDirty = true;
  }
  if (pickupsDirty) { pickupsDirty = false; io.emit('pickups', pickupList()); }

  if (!dirty) return;
  dirty = false;
  io.emit('playersState', [...players.values()].map(publicState));
}, TICK_MS);

io.on('connection', socket => {
  socket.emit('serverReady', { ok: true, version: VERSION });
  socket.emit('pickups', pickupList());
  for (const mine of mines.values()) socket.emit('effect', { type: 'mine', id: mine.id, floor: mine.floor, x: mine.x, z: mine.z });
  for (const zone of zones.values()) socket.emit('effect', { type: 'zone', id: zone.id, x: zone.x, z: zone.z, floor: zone.floor, radius: zone.radius, duration: (zone.until - Date.now()) / 1000 });

  // Simple token bucket so a single client cannot flood the server with events.
  let budget = EVENTS_PER_SECOND;
  let lastRefill = Date.now();
  socket.use((_packet, next) => {
    const now = Date.now();
    budget = Math.min(EVENTS_PER_SECOND, budget + ((now - lastRefill) / 1000) * EVENTS_PER_SECOND);
    lastRefill = now;
    if (budget < 1) return;
    budget -= 1;
    next();
  });

  socket.on('joinGame', data => {
    if (!isObject(data) || players.has(socket.id)) return;
    if (players.size >= MAX_PLAYERS) { socket.emit('joinRejected', { reason: 'The facility is full. Try again later.' }); return; }
    const role = Object.hasOwn(SPAWNS, data.role) ? data.role : 'patient';
    const token = typeof data.session === 'string' ? data.session.slice(0, 64) : '';
    const saved = token && sessions.get(token);
    const resumed = saved && saved.player.role === role ? saved.player : null;
    if (!resumed && ROLE_LIMITS[role] && roleCount(role) >= ROLE_LIMITS[role]) {
      socket.emit('joinRejected', { reason: `Only ${ROLE_LIMITS[role]} ${role} allowed at a time.` });
      return;
    }
    if (saved) sessions.delete(token);
    const spawn = SPAWNS[role];
    const player = {
      id: socket.id, name: cleanName(data.name), role,
      x: spawn.x, y: FLOOR_Y[spawn.floor], z: spawn.z, floor: spawn.floor, yaw: 0,
      health: MAX_HEALTH[role], maxHealth: MAX_HEALTH[role], inventory: freshLoadout(role), equipped: null,
      stunUntil: 0, slowUntil: 0, holdUntil: 0, downUntil: 0, boostUntil: 0, boostMultiplier: 1, look: null, combo: null,
      ...(resumed && {
        x: resumed.x, y: resumed.y, z: resumed.z, floor: resumed.floor, health: resumed.health,
        inventory: resumed.inventory, equipped: resumed.equipped, downUntil: resumed.downUntil, look: resumed.look,
      }),
      session: token, lastMove: Date.now(),
    };
    players.set(socket.id, player);
    socket.emit('assignedPlayer', { id: player.id, name: player.name, role, x: player.x, z: player.z, floor: player.floor, resumed: Boolean(resumed), ...selfState(player) });
    dirty = true;
  });

  socket.on('equipItem', data => {
    const player = players.get(socket.id);
    if (!player || !isObject(data)) return;
    player.equipped = typeof data.item === 'string' ? player.inventory.find(slot => slot.item === data.item) ?? null : null;
    sendSelf(player);
  });

  socket.on('useItem', data => {
    const player = players.get(socket.id);
    if (!player) return;
    // Aim with the freshest camera direction rather than the last movement update.
    if (isObject(data)) player.yaw = finiteClamp(data.yaw, -1e4, 1e4, player.yaw);
    useItem(player);
  });

  socket.on('updatePlayer', data => {
    const player = players.get(socket.id);
    if (!player || !isObject(data)) return;
    const now = Date.now();
    const elapsed = Math.min((now - player.lastMove) / 1000, 1);
    player.lastMove = now;
    player.yaw = finiteClamp(data.yaw, -1e4, 1e4, player.yaw);
    // Stunned, knocked-out and freshly arrested players stay where they are.
    if (isStunned(player, now)) {
      if (data.x !== player.x || data.z !== player.z || data.floor !== player.floor) socket.emit('positionCorrection', { x: player.x, z: player.z, floor: player.floor });
      dirty = true;
      return;
    }
    const x = finiteClamp(data.x, -86, 86, player.x);
    const z = finiteClamp(data.z, -62, 62, player.z);
    // Allow some slack for network jitter; anything faster than sprinting is a teleport.
    const allowed = SPRINT_SPEED * Math.max(1, speedMultiplier(player, now)) * elapsed * 1.5 + 1.5;
    let corrected = false;
    if (Math.hypot(x - player.x, z - player.z) <= allowed) { player.x = x; player.z = z; } else corrected = true;
    if (Number.isInteger(data.floor) && data.floor !== player.floor) {
      if (Math.abs(data.floor - player.floor) === 1 && data.floor >= 0 && data.floor < FLOOR_Y.length && nearStairs(player.x, player.z)) {
        player.floor = data.floor;
      } else corrected = true;
    }
    player.y = FLOOR_Y[player.floor];
    if (corrected) socket.emit('positionCorrection', { x: player.x, z: player.z, floor: player.floor });
    tryPickup(player);
    dirty = true;
  });

  socket.on('useAbility', data => {
    const player = players.get(socket.id);
    if (!player) return;
    const ability = isObject(data) ? String(data.ability ?? '').slice(0, 40) : '';
    socket.emit('abilityFeedback', { ok: true, ability, message: `${ability || player.role} ready` });
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player?.session) sessions.set(player.session, { player, expires: Date.now() + SESSION_TTL_MS });
    players.delete(socket.id);
    dirty = true;
  });
});

// Last line of defence: log unexpected errors instead of taking every player down with the process.
process.on('uncaughtException', error => console.error('Uncaught exception:', error));

server.listen(PORT, () => console.log(`Asylum Break server listening on ${PORT}`));
