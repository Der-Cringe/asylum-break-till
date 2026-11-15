'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const VERSION = '2026.11.15-1';
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
  patient: ['glassShard'], medic: ['smallMedicalKit', 'mediumMedicalKit'],
  orderly: ['riotShield', 'taser', 'stunBaton', 'arrestCuffs'], director: ['stunBaton', 'ignotusShield', 'tablet'],
};
const MAX_HEALTH = { patient: 100, medic: 100, orderly: 115, director: 100 };
const ROLE_LIMITS = { director: 1 };
const MAX_PLAYERS = 40;
const SPRINT_SPEED = 14;
// Stairwells sit at x = ±78, steps run from z = -7 to z = 4.
const STAIRS = [{ x: -78, z: -1.5 }, { x: 78, z: -1.5 }];
const STAIR_RADIUS = 16;
const SESSION_TTL_MS = 60_000;
const TICK_MS = 100;
const EVENTS_PER_SECOND = 30;

const players = new Map();
const sessions = new Map(); // session token -> { player, expires } for players that dropped connection
let dirty = false;

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
function cleanName(value) {
  return String(value ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Player';
}
function publicState(player) {
  const { id, name, role, x, z, floor, yaw, equippedItem } = player;
  return { id, name, role, x, z, floor, yaw, equippedItem };
}
function roleCount(role) {
  let count = 0;
  for (const player of players.values()) if (player.role === role) count++;
  return count;
}

setInterval(() => {
  for (const [token, session] of sessions) if (session.expires < Date.now()) sessions.delete(token);
  if (!dirty) return;
  dirty = false;
  io.emit('playersState', [...players.values()].map(publicState));
}, TICK_MS);

io.on('connection', socket => {
  socket.emit('serverReady', { ok: true, version: VERSION });

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
      health: MAX_HEALTH[role], maxHealth: MAX_HEALTH[role], inventory: [...INVENTORIES[role]], equippedItem: null,
      ...(resumed && { x: resumed.x, y: resumed.y, z: resumed.z, floor: resumed.floor, health: resumed.health, equippedItem: resumed.equippedItem }),
      session: token, lastMove: Date.now(),
    };
    players.set(socket.id, player);
    const { session: _session, lastMove: _lastMove, ...own } = player;
    socket.emit('assignedPlayer', { ...own, resumed: Boolean(resumed) });
    dirty = true;
  });

  socket.on('equipItem', data => {
    const player = players.get(socket.id);
    if (!player || !isObject(data) || typeof data.item !== 'string') return;
    const item = player.inventory.find(value => value.toLowerCase() === data.item.toLowerCase());
    if (!item) return;
    player.equippedItem = item;
    dirty = true;
  });

  socket.on('updatePlayer', data => {
    const player = players.get(socket.id);
    if (!player || !isObject(data)) return;
    const now = Date.now();
    const elapsed = Math.min((now - player.lastMove) / 1000, 1);
    player.lastMove = now;
    const x = finiteClamp(data.x, -86, 86, player.x);
    const z = finiteClamp(data.z, -62, 62, player.z);
    // Allow some slack for network jitter; anything faster than sprinting is a teleport.
    const allowed = SPRINT_SPEED * elapsed * 1.5 + 1.5;
    let corrected = false;
    if (Math.hypot(x - player.x, z - player.z) <= allowed) { player.x = x; player.z = z; } else corrected = true;
    if (Number.isInteger(data.floor) && data.floor !== player.floor) {
      if (Math.abs(data.floor - player.floor) === 1 && data.floor >= 0 && data.floor < FLOOR_Y.length && nearStairs(player.x, player.z)) {
        player.floor = data.floor;
      } else corrected = true;
    }
    player.y = FLOOR_Y[player.floor];
    player.yaw = finiteClamp(data.yaw, -1e4, 1e4, player.yaw);
    if (corrected) socket.emit('positionCorrection', { x: player.x, z: player.z, floor: player.floor });
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
