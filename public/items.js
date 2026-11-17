// Item catalogue shared by the server (require) and the browser (classic script → window.ITEMS).
// Every number here is gameplay balance: tweak freely, both sides pick it up on the next restart.
(function (root) {
  'use strict';

  const ITEMS = {
    // Kinds: melee, throw, place, ray, pulse, push, dash, heal, consume, wear, disguise, deploy,
    // restrain, carry, arrest, spray, tool. `roles` narrows an item down from its team to single roles.
    // `electric` items stop working inside an enemy signal jammer.

    // ---- Patients: weapons ------------------------------------------------------------------
    glassShard: {
      name: 'Glass Shard', kind: 'melee', team: 'patient', color: 0x9fe3ef,
      damage: 20, range: 3.2, arc: 1.2, cooldown: 0.8,
    },
    tableLeg: {
      name: 'Table Leg', kind: 'melee', team: 'patient', color: 0x8a5a33,
      // Weak hits, but the third hit in a row knocks the target out.
      damage: 8, range: 3.6, arc: 1.3, cooldown: 0.9, combo: { window: 3, slowOn: 2, stunOn: 3, stun: 2.5, slow: 2 },
    },
    scrapMetal: {
      name: 'Scrap Metal', kind: 'melee', team: 'patient', color: 0x8d949b,
      damage: 12, range: 3, arc: 1.2, cooldown: 0.5,
    },
    crowbar: {
      name: 'Crowbar', kind: 'melee', team: 'patient', color: 0xb5332e,
      damage: 15, range: 3.4, arc: 1.2, cooldown: 0.9, slow: 1.2,
    },
    glassBlade: {
      name: 'Glass Blade', kind: 'melee', team: 'patient', color: 0xbdf3ff,
      damage: 28, range: 3.8, arc: 1.1, cooldown: 1.1,
    },
    woodenBat: {
      name: 'Wooden Bat', kind: 'melee', team: 'patient', color: 0xc08a4f,
      damage: 17, range: 3.8, arc: 1.4, cooldown: 1, stun: 0.5,
    },
    steelBat: {
      name: 'Steel Bat', kind: 'melee', team: 'patient', color: 0xaeb6bd,
      damage: 23, range: 3.8, arc: 1.4, cooldown: 1.2, stun: 1,
    },
    crutch: {
      name: 'Crutch', kind: 'melee', team: 'patient', color: 0xcfd6db,
      damage: 9, range: 4.4, arc: 1, cooldown: 0.9, slow: 1.5,
    },
    pipeSword: {
      name: 'Pipe Sword', kind: 'melee', team: 'patient', color: 0x7d8790,
      damage: 21, range: 4.2, arc: 1.3, cooldown: 1,
    },
    fireAxe: {
      name: 'Fire Axe', kind: 'melee', team: 'patient', color: 0xd23a32,
      damage: 34, range: 3.8, arc: 1.2, cooldown: 1.7,
    },
    rebarHammer: {
      name: 'Rebar Hammer', kind: 'melee', team: 'patient', color: 0x6d5a4a,
      damage: 28, range: 3.6, arc: 1.3, cooldown: 2, stun: 1.6,
    },
    fireBottle: {
      name: 'Fire Bottle', kind: 'throw', team: 'patient', color: 0xff7a2f, uses: 1,
      throwRange: 13, flight: 0.7, cooldown: 1,
      effect: { type: 'fire', radius: 3.5, duration: 7, dps: 9 },
    },
    pipeBomb: {
      name: 'Pipe Bomb', kind: 'throw', team: 'patient', color: 0x6b7178, uses: 1,
      throwRange: 12, flight: 0.7, fuse: 2, cooldown: 1,
      effect: { type: 'explosion', radius: 6, maxDamage: 55, minDamage: 12, stun: 3 },
    },
    nailBomb: {
      name: 'Nail Bomb', kind: 'throw', team: 'patient', color: 0x4a3f36, uses: 1,
      throwRange: 10, flight: 0.8, fuse: 2.5, cooldown: 1,
      effect: { type: 'explosion', radius: 8, maxDamage: 70, minDamage: 15, stun: 3.5 },
    },
    stickyBomb: {
      name: 'Sticky Bomb', kind: 'throw', team: 'patient', color: 0x6fb83a, uses: 1,
      // Sticks to the nearest enemy where it lands and goes off on them after the fuse.
      throwRange: 12, flight: 0.6, fuse: 2, cooldown: 1, sticky: 2.8,
      effect: { type: 'explosion', radius: 4.5, maxDamage: 50, minDamage: 15, stun: 2.5 },
    },
    floorMine: {
      name: 'Floor Mine', kind: 'place', team: 'patient', color: 0x3d4a3a, uses: 1, cooldown: 1,
      armTime: 1.2, trigger: 1.6,
      effect: { type: 'explosion', radius: 5, maxDamage: 45, minDamage: 10, stun: 4 },
    },

    // ---- Patients: tricks -------------------------------------------------------------------
    shove: {
      name: 'Shove', kind: 'push', team: 'patient', color: 0xe9bd9e,
      range: 3.2, arc: 1.4, cooldown: 3, push: 5, stun: 0.6,
    },
    shoulderCharge: {
      name: 'Shoulder Charge', kind: 'dash', team: 'patient', color: 0xc85953,
      distance: 9, cooldown: 7, damage: 10, stun: 1.8, staminaCost: 30,
    },
    scream: {
      name: 'Scream', kind: 'pulse', team: 'patient', color: 0xf0c3c0, cooldown: 14,
      radius: 7, slow: 3,
    },
    rallyFlag: {
      name: 'Rally Flag', kind: 'pulse', team: 'patient', color: 0xe0453a, cooldown: 20,
      radius: 9, ally: { speed: 1.3, duration: 8 },
    },
    berserkPills: {
      name: 'Berserk Pills', kind: 'consume', team: 'patient', color: 0xd23a6f, uses: 1, cooldown: 1,
      rage: { multiplier: 1.5, duration: 10 },
    },
    adrenalineShot: {
      name: 'Adrenaline Shot', kind: 'consume', team: 'patient', color: 0xf2d33b, uses: 1, cooldown: 1,
      rage: { multiplier: 1.25, duration: 8 }, speed: { multiplier: 1.3, duration: 8 },
    },
    stolenScrubs: {
      name: 'Stolen Scrubs', kind: 'disguise', team: 'patient', color: 0x35b987, uses: 1, cooldown: 1,
      look: 'medic',
    },
    orderlyUniform: {
      name: 'Orderly Uniform', kind: 'disguise', team: 'patient', color: 0x2878d0, uses: 1, cooldown: 1,
      look: 'orderly',
    },
    directorSuit: {
      name: "Director's Suit", kind: 'disguise', team: 'patient', color: 0x9670d5, uses: 1, cooldown: 1,
      look: 'director',
    },
    cardboardBox: {
      name: 'Cardboard Box', kind: 'disguise', team: 'patient', color: 0xb98a55, uses: 1, cooldown: 1,
      look: 'box', // Slow, but looks like any other box.
    },
    pottedShrub: {
      name: 'Potted Shrub', kind: 'disguise', team: 'patient', color: 0x3f8f46, uses: 1, cooldown: 1,
      look: 'bush',
    },
    nightVision: {
      name: 'Night Vision Goggles', kind: 'wear', team: 'patient', color: 0x2f5a2f, uses: 1, cooldown: 1,
      nightVision: true, // See in a blackout until knocked out.
    },
    gasMask: {
      name: 'Gas Mask', kind: 'wear', team: 'patient', color: 0x3b4650, uses: 1, cooldown: 1,
      mask: true, // Immune to gas until knocked out.
    },
    signalJammer: {
      name: 'Signal Jammer', kind: 'deploy', team: 'patient', color: 0x2f3b4a, uses: 1, cooldown: 1,
      // Enemy tasers, launchers and tablets stop working inside it.
      effect: { type: 'jam', radius: 10, duration: 18 },
    },

    // ---- Patients: jobs and loot to sell ----------------------------------------------------------
    // `tool` items do nothing when used; they matter for jobs, doors, the exit and the commissary.
    laundry: {
      name: 'Laundry', kind: 'tool', team: 'patient', color: 0xdcd6c8, job: 'laundry',
    },
    paintbrush: {
      name: 'Paintbrush', kind: 'tool', team: 'patient', color: 0xe05a8a, job: 'paint',
    },
    contraband: {
      name: 'Contraband', kind: 'tool', team: 'patient', color: 0x8a6d3a, value: 40,
    },
    smuggledGoods: {
      name: 'Smuggled Goods', kind: 'tool', team: 'patient', color: 0xd4af37, value: 120,
    },
    keycard: {
      name: 'Stolen Keycard', kind: 'tool', team: 'patient', color: 0x5aa9ff,
    },

    // ---- Staff: weapons ---------------------------------------------------------------------
    stunBaton: {
      name: 'Stun Baton', kind: 'melee', team: 'staff', color: 0x2c3540,
      // Every hit slows; hitting a target that is already slowed knocks it out.
      damage: 10, range: 3.6, arc: 1.2, cooldown: 1, slow: 1.8, stunIfSlowed: 3,
    },
    twinBaton: {
      name: 'Twin Baton', kind: 'melee', team: 'staff', roles: ['orderly'], color: 0x3a6fb0,
      damage: 8, range: 3.4, arc: 1.4, cooldown: 0.6, slow: 1.2, stunIfSlowed: 2,
    },
    shockRod: {
      name: 'Shock Rod', kind: 'melee', team: 'staff', color: 0x4fb3e8, electric: true,
      damage: 12, range: 3.8, arc: 1, cooldown: 1.4, stun: 1.3,
    },
    pocketStunner: {
      name: 'Pocket Stunner', kind: 'melee', team: 'staff', color: 0x1f2a36, electric: true,
      damage: 4, range: 2.6, arc: 1.2, cooldown: 3, stun: 1.6,
    },
    shockSpear: {
      name: 'Shock Spear', kind: 'melee', team: 'staff', roles: ['orderly'], color: 0x5fd0ff, electric: true,
      damage: 14, range: 5.2, arc: 0.6, cooldown: 1.3, slow: 1.5,
    },
    wrench: {
      name: 'Wrench', kind: 'melee', team: 'staff', color: 0x9aa4ad,
      damage: 16, range: 3.2, arc: 1.2, cooldown: 1,
    },
    sledgehammer: {
      name: 'Sledgehammer', kind: 'melee', team: 'staff', color: 0x50585f,
      damage: 30, range: 3.6, arc: 1.3, cooldown: 2.2, stun: 1.5,
    },
    janitorMop: {
      name: 'Janitor Mop', kind: 'melee', team: 'staff', color: 0x3c8fd0,
      damage: 5, range: 4.4, arc: 1.4, cooldown: 1, slow: 2.2,
    },
    riotShield: {
      name: 'Ignotus Shield', kind: 'melee', team: 'staff', color: 0x8fb4cf, shield: true,
      damage: 6, range: 3, arc: 1.4, cooldown: 1.3, stun: 1,
    },
    shockShield: {
      name: 'Shock Shield', kind: 'melee', team: 'staff', color: 0xc8463b, shield: true,
      damage: 10, range: 3.2, arc: 1.4, cooldown: 1.3, stun: 2,
    },
    voltShield: {
      name: 'Volt Shield', kind: 'melee', team: 'staff', roles: ['orderly'], color: 0x3fa9f5, shield: true, electric: true,
      damage: 12, range: 3.2, arc: 1.4, cooldown: 1.6, stun: 2.5,
    },
    barrierShield: {
      name: 'Barrier Shield', kind: 'melee', team: 'staff', color: 0xd9e4ea, shield: true,
      damage: 3, range: 3.6, arc: 1.8, cooldown: 0.9, slow: 1.2,
    },
    heavyShield: {
      name: 'Heavy Shield', kind: 'melee', team: 'staff', color: 0x2b2f36, shield: true,
      damage: 10, range: 3, arc: 1.4, cooldown: 1.6, stun: 1.5, push: 4,
    },
    taser: {
      name: 'Taser', kind: 'ray', team: 'staff', color: 0xf2d33b, electric: true,
      range: 16, arc: 0.22, cooldown: 12, stun: 4,
    },
    taserRifle: {
      name: 'Taser Rifle', kind: 'ray', team: 'staff', roles: ['orderly'], color: 0xe8b020, electric: true,
      range: 28, arc: 0.12, cooldown: 16, stun: 4,
    },
    stunPistol: {
      name: 'Stun Pistol', kind: 'ray', team: 'staff', color: 0xffe36b, electric: true,
      range: 10, arc: 0.3, cooldown: 6, stun: 2,
    },
    laserPistol: {
      name: 'Laser Pistol', kind: 'ray', team: 'staff', color: 0xff3b5c, electric: true,
      range: 20, arc: 0.15, cooldown: 1.6, damage: 14,
    },
    pepperballGun: {
      name: 'Pepperball Gun', kind: 'ray', team: 'staff', color: 0xff8a3c, uses: 8,
      range: 18, arc: 0.2, cooldown: 0.8, damage: 4, slow: 1.5, blind: 1.2,
    },
    netLauncher: {
      name: 'Net Launcher', kind: 'ray', team: 'staff', color: 0xc9d1b8, uses: 3,
      // A netted target cannot walk away, but can still fight.
      range: 15, arc: 0.25, cooldown: 4, root: 4,
    },
    shockLasso: {
      name: 'Shock Lasso', kind: 'ray', team: 'staff', roles: ['orderly'], color: 0x7de4ff, electric: true,
      // Drags the target right up to you.
      range: 11, arc: 0.3, cooldown: 10, stun: 1.5, pull: true,
    },
    proximityTaser: {
      name: 'Proximity Taser', kind: 'pulse', team: 'staff', color: 0xf2d33b, electric: true,
      radius: 3.6, cooldown: 9, stun: 2.5,
    },
    sedationPulse: {
      name: 'Sedation Pulse', kind: 'pulse', team: 'staff', roles: ['medic'], color: 0xa58bff, electric: true,
      radius: 7, cooldown: 15, slow: 4, stun: 0.8,
    },
    flashGrenade: {
      name: 'Flash Grenade', kind: 'throw', team: 'staff', color: 0x4d8ed8, uses: 2,
      throwRange: 13, flight: 0.7, fuse: 1, cooldown: 1,
      // Blinds everyone in the radius (the thrower's team too), but only stuns enemies.
      effect: { type: 'flash', radius: 5.5, stun: 3, blind: 4 },
    },
    empGrenade: {
      name: 'EMP Grenade', kind: 'throw', team: 'staff', color: 0x3fa9f5, uses: 2,
      throwRange: 13, flight: 0.7, fuse: 1, cooldown: 1,
      effect: { type: 'shock', radius: 6, stun: 3 },
    },
    chargedEmp: {
      name: 'Charged EMP', kind: 'throw', team: 'staff', roles: ['orderly'], color: 0x1f6fd0, uses: 1,
      throwRange: 12, flight: 0.8, fuse: 1.8, cooldown: 1,
      effect: { type: 'shock', radius: 8, stun: 5, maxDamage: 15, minDamage: 5 },
    },
    gasGrenade: {
      name: 'Gas Grenade', kind: 'throw', team: 'staff', color: 0x8fbf4a, uses: 2,
      throwRange: 13, flight: 0.7, fuse: 0.5, cooldown: 1,
      effect: { type: 'gas', radius: 5, duration: 9, dps: 4 },
    },
    empLauncher: {
      name: 'EMP Launcher', kind: 'throw', team: 'staff', roles: ['orderly'], color: 0x24476b, uses: 4, electric: true,
      throwRange: 26, flight: 0.5, cooldown: 2.5,
      effect: { type: 'shock', radius: 4, stun: 2.5 },
    },
    gasLauncher: {
      name: 'Gas Launcher', kind: 'throw', team: 'staff', color: 0x55703a, uses: 3,
      throwRange: 26, flight: 0.5, cooldown: 3,
      effect: { type: 'gas', radius: 4.5, duration: 8, dps: 4 },
    },
    empMine: {
      name: 'EMP Mine', kind: 'place', team: 'staff', color: 0x24476b, uses: 2, cooldown: 1,
      armTime: 1.2, trigger: 1.8,
      effect: { type: 'shock', radius: 5, stun: 4 },
    },

    // ---- Staff: restraint and support -------------------------------------------------------
    arrestCuffs: {
      name: 'Arrest Cuffs', kind: 'arrest', team: 'staff', color: 0xb9c3cc,
      range: 3.5, arc: 1.4, cooldown: 1, hold: 8,
    },
    straitjacket: {
      name: 'Straitjacket', kind: 'restrain', team: 'staff', color: 0xeae3cf, uses: 2,
      // Keeps a stunned patient stuck where they are.
      range: 3.5, arc: 1.4, cooldown: 2, hold: 7,
    },
    firemansCarry: {
      name: "Fireman's Carry", kind: 'carry', team: 'staff', color: 0xe9bd9e,
      // Pick up a stunned or knocked-out player; use again to put them down.
      range: 3.5, arc: 1.4, cooldown: 1, hold: 15,
    },
    flashlight: {
      name: 'Flashlight', kind: 'tool', team: 'staff', color: 0x2c3540, light: true, // Lights the way while held.
    },
    weldingTorch: {
      name: 'Welding Torch', kind: 'weld', team: 'staff', color: 0xe8a33a,
      // Welds a security door shut against keycards for a minute, or repairs a broken one.
      range: 4.5, cooldown: 2, seconds: 60,
    },
    fireExtinguisher: {
      name: 'Fire Extinguisher', kind: 'spray', team: 'staff', color: 0xd23a32,
      range: 7, arc: 0.9, cooldown: 1.5,
    },
    smallMedicalKit: {
      name: 'Small Med Kit', kind: 'heal', team: 'all', color: 0xf1f5f3, uses: 3,
      heal: 25, range: 3.5, arc: 1.4, cooldown: 1.5,
    },
    mediumMedicalKit: {
      name: 'Medium Med Kit', kind: 'heal', team: 'all', color: 0xe9f3ee, uses: 2,
      heal: 50, range: 3.5, arc: 1.4, cooldown: 2.5,
    },
    largeMedicalKit: {
      name: 'Large Med Kit', kind: 'heal', team: 'staff', color: 0xdcefe6, uses: 1,
      heal: 100, range: 3.5, arc: 1.4, cooldown: 3,
    },
    mediGun: {
      name: 'Medi Gun', kind: 'heal', team: 'staff', roles: ['medic'], color: 0x5af0a0, electric: true,
      heal: 8, range: 14, arc: 0.35, cooldown: 0.6, beam: true,
    },
    healingGrenade: {
      name: 'Healing Grenade', kind: 'throw', team: 'staff', roles: ['medic'], color: 0x5af0a0, uses: 2,
      throwRange: 12, flight: 0.7, cooldown: 1,
      effect: { type: 'healing', radius: 5, duration: 8, hps: 7 },
    },
    therapyGrenade: {
      name: 'Therapy Grenade', kind: 'throw', team: 'staff', roles: ['medic'], color: 0xa58bff, uses: 2,
      throwRange: 12, flight: 0.7, fuse: 1, cooldown: 1,
      effect: { type: 'shock', radius: 4.5, stun: 3.5 },
    },
    combatVest: {
      name: 'Combat Vest', kind: 'wear', team: 'staff', color: 0x3b4a3a, uses: 1, cooldown: 1,
      armor: 0.7, // Takes 30% less damage until knocked out.
    },
    tablet: {
      name: 'Tablet', kind: 'tool', team: 'staff', color: 0x1c2733, electric: true,
    },

    // ---- Everyone ---------------------------------------------------------------------------
    coffee: {
      name: 'Coffee', kind: 'consume', team: 'all', color: 0x6b4128, uses: 2, cooldown: 1,
      heal: 12, stamina: 40,
    },
    tea: {
      name: 'Tea', kind: 'consume', team: 'all', color: 0xb8743a, uses: 2, cooldown: 1,
      heal: 3, stamina: 20, // Mostly for the manners.
    },
    bread: {
      name: 'Bread', kind: 'consume', team: 'all', color: 0xd9a35b, uses: 3, cooldown: 1,
      heal: 8, stamina: 25,
    },
    mango: {
      name: 'Mango', kind: 'consume', team: 'all', color: 0xf5a623, uses: 1, cooldown: 1,
      heal: 30,
    },
    candy: {
      name: 'Candy', kind: 'consume', team: 'all', color: 0xff6fb5, uses: 3, cooldown: 1,
      speed: { multiplier: 1.2, duration: 4 }, stamina: 20,
    },
    energySoda: {
      name: 'Energy Soda', kind: 'consume', team: 'all', color: 0x47d16b, uses: 1, cooldown: 1,
      speed: { multiplier: 1.4, duration: 8 }, stamina: 100,
    },
    tomato: {
      name: 'Rotten Tomato', kind: 'throw', team: 'all', color: 0xd8402f, uses: 3,
      throwRange: 14, flight: 0.6, cooldown: 0.8,
      effect: { type: 'splat', radius: 1.8, slow: 1.5, blind: 1.5 },
    },
    snowball: {
      name: 'Snowball', kind: 'throw', team: 'all', color: 0xf4f8fb, uses: 5,
      throwRange: 16, flight: 0.5, cooldown: 0.6,
      effect: { type: 'splat', radius: 1.5, slow: 1, maxDamage: 2, minDamage: 2 },
    },
  };

  // What the shops charge, in credits. Anything without a price cannot be bought.
  const PRICES = {
    glassShard: 30, tableLeg: 25, scrapMetal: 20, crowbar: 60, woodenBat: 45, crutch: 30, steelBat: 90, pipeSword: 80,
    fireBottle: 70, pipeBomb: 110, stickyBomb: 130, floorMine: 90, berserkPills: 80, adrenalineShot: 60, stolenScrubs: 120,
    cardboardBox: 50, pottedShrub: 60, gasMask: 70, nightVision: 140, flashlight: 30, paintbrush: 20, keycard: 250,
    shockRod: 60, pocketStunner: 40, wrench: 30, janitorMop: 20, barrierShield: 70, stunPistol: 80, pepperballGun: 90,
    netLauncher: 100, proximityTaser: 70, flashGrenade: 50, empGrenade: 60, gasGrenade: 70, empMine: 60,
    straitjacket: 50, firemansCarry: 40, weldingTorch: 80, combatVest: 120, largeMedicalKit: 60, healingGrenade: 70, therapyGrenade: 60,
    coffee: 10, tea: 5, bread: 10, mango: 20, candy: 10, energySoda: 25, smallMedicalKit: 25, mediumMedicalKit: 45,
    tomato: 5, snowball: 5,
  };
  for (const [item, price] of Object.entries(PRICES)) if (ITEMS[item]) ITEMS[item].price = price;

  if (typeof module === 'object' && module.exports) module.exports = ITEMS;
  else root.ITEMS = ITEMS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
