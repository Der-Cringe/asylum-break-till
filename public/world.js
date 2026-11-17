// Facility systems in the browser: interaction prompts, work progress, credits and the shops.
// game.js owns the scene and the player; this module only adds to them through `ctx`.
const STATION_VERBS = {
  shop: station => `Open ${station.label}`,
  job: station => (station.job === 'laundry' ? 'Do laundry' : 'Paint'),
  breaker: () => 'Use breaker panel',
  exit: () => 'Try the exit',
};

export function createWorld(ctx) {
  const { state, socket, LAYOUT, ITEMS, showNotice } = ctx;
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

  // ---- Self state ------------------------------------------------------------------------------
  function applySelf(data) {
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

  function update(now) {
    if (!state.role) { prompt.classList.remove('visible'); return; }
    const station = state.view ? null : nearestStation();
    target = station;
    const text = work ? 'E · stop' : station ? `E · ${STATION_VERBS[station.type](station)}` : '';
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
    interact, applySelf, update,
    closeOverlays() { if (!shopStation) return false; closeShop(); return true; },
    reset() { work = null; closeShop(); },
    get target() { return target; },
  };
}
