// Item catalogue shared by the server (require) and the browser (classic script → window.ITEMS).
// Every number here is gameplay balance: tweak freely, both sides pick it up on the next restart.
(function (root) {
  'use strict';

  const ITEMS = {
    // ---- Patients ---------------------------------------------------------------------------
    glassShard: {
      name: 'Glass Shard', kind: 'melee', team: 'patient', color: 0x9fe3ef,
      damage: 20, range: 3.2, arc: 1.2, cooldown: 0.8,
    },
    tableLeg: {
      name: 'Table Leg', kind: 'melee', team: 'patient', color: 0x8a5a33,
      // Weak hits, but the third hit in a row knocks the target out.
      damage: 8, range: 3.6, arc: 1.3, cooldown: 0.9, combo: { window: 3, slowOn: 2, stunOn: 3, stun: 2.5, slow: 2 },
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
    floorMine: {
      name: 'Floor Mine', kind: 'place', team: 'patient', color: 0x3d4a3a, uses: 1, cooldown: 1,
      armTime: 1.2, trigger: 1.6,
      effect: { type: 'explosion', radius: 5, maxDamage: 45, minDamage: 10, stun: 4 },
    },
    stolenScrubs: {
      name: 'Stolen Scrubs', kind: 'disguise', team: 'patient', color: 0x35b987, uses: 1, cooldown: 1,
      look: 'medic',
    },

    // ---- Staff ------------------------------------------------------------------------------
    stunBaton: {
      name: 'Stun Baton', kind: 'melee', team: 'staff', color: 0x2c3540,
      // Every hit slows; hitting a target that is already slowed knocks it out.
      damage: 10, range: 3.6, arc: 1.2, cooldown: 1, slow: 1.8, stunIfSlowed: 3,
    },
    riotShield: {
      name: 'Riot Shield', kind: 'melee', team: 'staff', color: 0x8fb4cf, shield: true,
      damage: 6, range: 3, arc: 1.4, cooldown: 1.3, stun: 1,
    },
    shockShield: {
      name: 'Shock Shield', kind: 'melee', team: 'staff', color: 0xc8463b, shield: true,
      damage: 10, range: 3.2, arc: 1.4, cooldown: 1.3, stun: 2,
    },
    taser: {
      name: 'Taser', kind: 'ray', team: 'staff', color: 0xf2d33b,
      range: 16, arc: 0.22, cooldown: 12, stun: 4,
    },
    flashGrenade: {
      name: 'Flash Grenade', kind: 'throw', team: 'staff', color: 0x4d8ed8, uses: 2,
      throwRange: 13, flight: 0.7, fuse: 1, cooldown: 1,
      // Blinds everyone in the radius (the thrower's team too), but only stuns enemies.
      effect: { type: 'flash', radius: 5.5, stun: 3, blind: 4 },
    },
    arrestCuffs: {
      name: 'Arrest Cuffs', kind: 'arrest', team: 'staff', color: 0xb9c3cc,
      range: 3.5, arc: 1.4, cooldown: 1, hold: 8,
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
    tablet: {
      name: 'Tablet', kind: 'tool', team: 'staff', color: 0x1c2733,
    },

    // ---- Everyone ---------------------------------------------------------------------------
    coffee: {
      name: 'Coffee', kind: 'consume', team: 'all', color: 0x6b4128, uses: 2, cooldown: 1,
      heal: 12,
    },
    energySoda: {
      name: 'Energy Soda', kind: 'consume', team: 'all', color: 0x47d16b, uses: 1, cooldown: 1,
      speed: { multiplier: 1.4, duration: 8 },
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = ITEMS;
  else root.ITEMS = ITEMS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
