// Facility systems in the browser: interaction prompts, work progress, credits, shops and the
// security doors. game.js owns the scene and the player; this module only adds to them through `ctx`.
import * as THREE from 'three';

const STATION_VERBS = {
  shop: station => `Open ${station.label}`,
  job: station => (station.job === 'laundry' ? 'Do laundry' : 'Paint'),
  breaker: (_station, power) => (power.out ? 'Restore power' : 'Cut the power'),
  exit: () => 'Try the exit',
};

export function createWorld(ctx) {
  const { state, socket, LAYOUT, ITEMS, showNotice, floors, scene, lights, glowing } = ctx;
  const $ = id => document.getElementById(id);
  const prompt = $('interactPrompt'), workBar = $('workBar'), workFill = $('workFill'), workLabel = $('workLabel');
  const shop = $('shopPanel'), shopList = $('shopList');
  let target = null; // what pressing E would use right now
  let work = null; // { label, until, total } in performance.now() time
  let shopStation = null;

  function nearestStation() {
    let best = null, bestDistance = LAYOUT.STATION_RANGE;
    for (const station of LAYOUT.STATIONS) {
      if (station.floor !== state.floor) continue;
      const distance = Math.hypot(station.x - state.x, station.z - state.z);
      if (distance <= bestDistance) { best = station; bestDistance = distance; }
    }
    return best;
  }
  function interact() {
    if (!state.role || state.view) return;
    if (!socket?.connected) { showNotice('Needs the server connection'); return; }
    socket.emit('interact');
  }

  // ---- Shop ------------------------------------------------------------------------------------
  function openShop(data) {
    shopStation = LAYOUT.STATIONS.find(station => station.id === data.station) ?? null;
    if (!shopStation) return;
    if (document.pointerLockElement) document.exitPointerLock();
    $('shopTitle').textContent = data.label;
    $('shopCredits').textContent = `${data.credits} ¢`;
    shopList.replaceChildren();
    if (data.sell > 0) {
      const sell = document.createElement('button');
      sell.type = 'button'; sell.className = 'shop-item sell';
      sell.innerHTML = '<span>Sell contraband</span>';
      const price = document.createElement('b'); price.textContent = `+${data.sell} ¢`; sell.append(price);
      sell.addEventListener('click', () => { socket.emit('sell'); closeShop(); });
      shopList.append(sell);
    }
    for (const entry of data.items) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'shop-item';
      button.disabled = entry.price > data.credits;
      const name = document.createElement('span'); name.textContent = ITEMS[entry.item]?.name ?? entry.item;
      const price = document.createElement('b'); price.textContent = `${entry.price} ¢`;
      button.append(name, price);
      button.addEventListener('click', () => socket.emit('buy', { item: entry.item }));
      shopList.append(button);
    }
    shop.classList.remove('hidden');
  }
  function closeShop() {
    shopStation = null;
    shop.classList.add('hidden');
  }
  $('shopClose').addEventListener('click', closeShop);
  socket?.on('shop', data => { if (data && state.role) openShop(data); });

  // ---- Security doors --------------------------------------------------------------------------
  // A sliding panel in each doorway with a lamp above it: green when you may pass, red when not.
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x5b6873, roughness: 0.5, metalness: 0.4 });
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xf2d33b, roughness: 0.6 });
  const weldMaterial = new THREE.MeshStandardMaterial({ color: 0xff8a3c, emissive: 0xff5a1f, emissiveIntensity: 0.8 });
  const lampOn = new THREE.MeshBasicMaterial({ color: 0x4fe08a }), lampOff = new THREE.MeshBasicMaterial({ color: 0xf0453a });
  const UNIT = new THREE.BoxGeometry(1, 1, 1);
  const doors = new Map();
  for (const def of LAYOUT.SECURE_DOORS) {
    const y = LAYOUT.FLOOR_Y[def.floor], w = LAYOUT.DOOR_WIDTH, h = LAYOUT.DOOR_HEIGHT;
    const group = new THREE.Group();
    group.position.set(def.x, y, def.z);
    if (!def.alongX) group.rotation.y = Math.PI / 2;
    const panel = new THREE.Group(); group.add(panel);
    const slab = new THREE.Mesh(UNIT, doorMaterial); slab.scale.set(w, h, 0.25); slab.position.y = h / 2; slab.castShadow = true; panel.add(slab);
    const stripe = new THREE.Mesh(UNIT, stripeMaterial); stripe.scale.set(w * 0.92, 0.18, 0.28); stripe.position.y = h * 0.55; panel.add(stripe);
    const weld = new THREE.Mesh(UNIT, weldMaterial); weld.scale.set(0.12, h * 0.9, 0.3); weld.position.set(w / 2 - 0.1, h / 2, 0); weld.visible = false; panel.add(weld);
    const lamp = new THREE.Mesh(UNIT, lampOff); lamp.scale.set(0.5, 0.2, 0.7); lamp.position.y = h + 0.3; group.add(lamp);
    floors[def.floor].add(group);
    doors.set(def.id, { def, panel, weld, lamp, open: false, broken: false, welded: false, lift: 0 });
  }
  const passable = door => door.broken || (state.role && state.role !== 'patient')
    || (!door.welded && state.items.some(slot => slot.item === 'keycard'));
  socket?.on('doors', list => {
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      const door = doors.get(entry?.id); if (!door) continue;
      Object.assign(door, { open: Boolean(entry.open), broken: Boolean(entry.broken), welded: Boolean(entry.welded) });
      door.weld.visible = door.welded;
    }
  });
  // Shut doors block you like a wall; you can always step out of a doorway you are standing in.
  function doorBlocks(x0, z0, x, z, floor, radius) {
    for (const door of doors.values()) {
      if (door.def.floor !== floor || passable(door)) continue;
      const box = door.def.box;
      const inside = x0 > box.minX - radius && x0 < box.maxX + radius && z0 > box.minZ - radius && z0 < box.maxZ + radius;
      if (!inside && LAYOUT.segmentHitsBox(box, x0, z0, x, z, radius)) return true;
    }
    return false;
  }
  function updateDoors(dt) {
    for (const door of doors.values()) {
      const target = door.broken || door.open ? 1 : 0;
      door.lift += (target - door.lift) * Math.min(1, dt * 8);
      door.panel.position.y = door.lift * LAYOUT.DOOR_HEIGHT * 0.95;
      door.panel.rotation.z = door.broken ? 0.5 : 0; // A broken door hangs crooked in its frame.
      door.lamp.material = passable(door) ? lampOn : lampOff;
    }
  }

  // ---- Blackout --------------------------------------------------------------------------------
  // With the power cut the building goes nearly black; night vision goggles keep it readable.
  let blackoutUntil = 0, nightVision = false, lightLevel = 1;
  const dayBackground = scene.background.clone(), dayFog = scene.fog.color.clone(), dayNear = scene.fog.near, dayFar = scene.fog.far;
  const black = new THREE.Color(0x010203);
  socket?.on('world', data => {
    const wasOut = blackoutUntil > performance.now();
    blackoutUntil = performance.now() + (Number(data?.blackout) || 0);
    const out = blackoutUntil > performance.now();
    if (state.role && out !== wasOut) showNotice(out ? 'Power cut · lights out' : 'Power restored');
  });
  function updateLights(now, dt) {
    const out = now < blackoutUntil;
    const target = !out ? 1 : nightVision ? 0.7 : 0.1;
    lightLevel += (target - lightLevel) * Math.min(1, dt * 3);
    for (const [light, base] of lights) light.intensity = base * lightLevel;
    for (const [material, base] of glowing) material.emissiveIntensity = base * lightLevel;
    const dark = Math.min(1, (1 - lightLevel) * 1.1);
    scene.background.copy(dayBackground).lerp(black, dark);
    scene.fog.color.copy(dayFog).lerp(black, dark);
    // Darkness swallows anything more than a few rooms away (near must stay below far).
    scene.fog.near = dayNear - (dayNear - 6) * dark;
    scene.fog.far = dayFar - (dayFar - 40) * dark;
    document.body.classList.toggle('night-vision', out && nightVision);
  }

  // ---- Self state ------------------------------------------------------------------------------
  function applySelf(data) {
    if (data.nightVision !== undefined) nightVision = Boolean(data.nightVision);
    if (Number.isFinite(data.credits)) {
      $('walletLabel').textContent = `LV ${data.level} · ${data.credits} ¢`;
      if (shopStation) {
        $('shopCredits').textContent = `${data.credits} ¢`;
        shopList.querySelectorAll('.shop-item:not(.sell)').forEach(button => {
          button.disabled = Number.parseInt(button.querySelector('b').textContent, 10) > data.credits;
        });
      }
    }
    if (data.work !== undefined) {
      const now = performance.now();
      work = data.work ? { label: data.work.label, until: now + data.work.left, total: data.work.total } : null;
    }
  }

  function update(now, dt) {
    updateDoors(dt);
    updateLights(now, dt);
    if (!state.role) { prompt.classList.remove('visible'); return; }
    const station = state.view ? null : nearestStation();
    target = station;
    const text = work ? 'E · stop' : station ? `E · ${STATION_VERBS[station.type](station, { out: now < blackoutUntil })}` : '';
    if (prompt.textContent !== text) prompt.textContent = text;
    prompt.classList.toggle('visible', Boolean(text));
    document.body.classList.toggle('can-interact', Boolean(text));
    if (work) {
      workBar.classList.add('visible');
      workLabel.textContent = work.label;
      workFill.style.transform = `scaleX(${Math.min(1, 1 - (work.until - now) / work.total)})`;
    } else workBar.classList.remove('visible');
    if (shopStation && (shopStation.floor !== state.floor || Math.hypot(shopStation.x - state.x, shopStation.z - state.z) > LAYOUT.STATION_RANGE + 1.5)) closeShop();
  }

  return {
    interact, applySelf, update, doorBlocks,
    closeOverlays() { if (!shopStation) return false; closeShop(); return true; },
    reset() { work = null; closeShop(); },
    get target() { return target; },
  };
}
