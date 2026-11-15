// Building layout shared by the server (require) and the browser (classic script → window.LAYOUT).
// Three floors of 180 × 132 units: a main corridor runs east–west at z = ±5, a cross corridor
// north–south at x = ±5, and the stairwells sit in halls at both ends (x = ±78).
// Walls are axis aligned; doors are gaps in them (closed doors are only painted on).
(function (root) {
  'use strict';

  const FLOOR_Y = [0, 9, 18];
  const FLOOR_NAMES = ['GROUND', 'MEDICAL', 'WARD'];
  const WALL_HEIGHT = 5.6;
  const WALL_THICKNESS = 0.6;
  const DOOR_WIDTH = 3.4;
  const DOOR_HEIGHT = 4.3;
  // Where a player's centre may go: the outer walls' inner faces minus the player radius.
  const BOUNDS = { x: 88.3, z: 64.3 };
  // Steps run from z = -7 to z = 4 at x = ±78.
  const STAIRS = [{ x: -78, z: -1.5 }, { x: 78, z: -1.5 }];

  const SPAWNS = {
    orderly: { floor: 0, x: 22, z: -12 },
    medic: { floor: 1, x: -36, z: -22 },
    director: { floor: 1, x: 66, z: 40 },
    patient: { floor: 2, x: -26, z: -9 }, // in cell WS3
  };

  // Loot spots. Patient loot sits in patient areas, staff loot in staff rooms.
  const LOOT = {
    patient: ['glassShard', 'tableLeg', 'tableLeg', 'fireBottle', 'pipeBomb', 'floorMine', 'stolenScrubs', 'energySoda', 'coffee'],
    staff: ['coffee', 'energySoda', 'fireExtinguisher', 'flashGrenade', 'smallMedicalKit'],
  };
  const PICKUPS = [
    { floor: 2, x: -30, z: 34, pool: 'patient' }, { floor: 2, x: 60, z: 28, pool: 'patient' },
    { floor: 2, x: 22, z: 52, pool: 'patient' }, { floor: 2, x: 28, z: -40, pool: 'patient' },
    { floor: 2, x: -70, z: -30, pool: 'patient' }, { floor: 2, x: 0, z: -40, pool: 'patient' },
    { floor: 2, x: 72, z: -50, pool: 'patient' },
    { floor: 1, x: -64, z: 40, pool: 'patient' }, { floor: 1, x: 50, z: -48, pool: 'patient' },
    { floor: 0, x: -48, z: 16, pool: 'patient' }, { floor: 0, x: 30, z: 52, pool: 'patient' },
    { floor: 1, x: -22, z: 16, pool: 'staff' }, { floor: 1, x: -20, z: -50, pool: 'staff' },
    { floor: 1, x: 24, z: 14, pool: 'staff' }, { floor: 0, x: 22, z: -36, pool: 'staff' },
    { floor: 0, x: 0, z: 30, pool: 'staff' },
  ];

  // Security cameras for the director's tablet: mounted at (x, z) under the ceiling, looking at (tx, tz).
  const CAMERAS = [
    { label: 'Lobby', floor: 0, x: -36, z: -7, tx: -36, tz: -50 },
    { label: 'Cafeteria', floor: 0, x: -7, z: 7, tx: -40, tz: 30 },
    { label: 'Infirmary', floor: 1, x: -7, z: -7, tx: -40, tz: -25 },
    { label: 'Lab', floor: 1, x: 87, z: -63, tx: 40, tz: -40 },
    { label: 'Cells', floor: 2, x: -66, z: 0, tx: 20, tz: 0 },
    { label: 'Day room', floor: 2, x: -7, z: 63, tx: -50, tz: 30 },
    { label: 'Dorm', floor: 2, x: -7, z: -63, tx: -30, tz: -30 },
  ];

  const walls = FLOOR_Y.map(() => []);
  const rooms = FLOOR_Y.map(() => []);
  const furniture = FLOOR_Y.map(() => []);
  const signs = FLOOR_Y.map(() => []);

  // A wall from (x1, z1) to (x2, z2), either along x or along z. Doors are positions along the wall;
  // { at, closed: true } paints a locked door on without cutting a gap.
  function wall(floor, x1, z1, x2, z2, doors = [], options = {}) {
    walls[floor].push({
      x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2),
      thickness: options.thickness ?? WALL_THICKNESS, style: options.style ?? null,
      doors: doors.map(door => (typeof door === 'number' ? { at: door } : door)),
    });
  }
  const H = (floor, z, x1, x2, doors, options) => wall(floor, x1, z, x2, z, doors, options); // runs along x
  const V = (floor, x, z1, z2, doors, options) => wall(floor, x, z1, x, z2, doors, options); // runs along z
  function room(floor, name, x1, z1, x2, z2, style) {
    rooms[floor].push({ name, x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2), style });
  }
  // rot is in quarter turns; w runs along x and d along z before turning.
  function put(floor, type, x, z, rot = 0, size = {}) {
    furniture[floor].push({ type, x, z, rot, ...size });
  }
  // A sign on a wall. `face` is the direction it faces: '+x', '-x', '+z' or '-z'.
  function sign(floor, text, x, z, face, tint) {
    signs[floor].push({ text, x, z, face, tint });
  }

  // ---- Shared shell on every floor ---------------------------------------------------------
  for (let f = 0; f < FLOOR_Y.length; f++) {
    H(f, -65.5, -90, 90, f === 0 ? [{ at: -36, closed: true, exit: true }] : [], { thickness: 1 });
    H(f, 65.5, -90, 90, [], { thickness: 1 });
    V(f, -89.5, -65, 65, [], { thickness: 1 });
    V(f, 89.5, -65, 65, [], { thickness: 1 });
    room(f, 'Corridor', -68, -5, 68, 5, 'corridor');
    room(f, 'Corridor', -5, -65, 5, -5, 'corridor');
    room(f, 'Corridor', -5, 5, 5, 65, 'corridor');
    for (const side of [-1, 1]) {
      room(f, 'Stairwell', side * 68, -14, side * 89, 10, 'stairs');
      put(f, 'stairs', side * 78, -1.5);
      sign(f, `STAIRS · ${FLOOR_NAMES[f]}`, side * 68 + side * 0.35, 7.5, side > 0 ? '-x' : '+x', '#6dd9e7');
      put(f, 'plant', side * 86, 7.5); put(f, 'plant', side * 86, -11.5);
      put(f, 'bench', side * 87.6, -1.5, 1, { w: 6 });
    }
  }

  // ---- Ground floor: lobby, security, cafeteria, gym -----------------------------------------
  {
    const f = 0;
    // Corridor walls.
    H(f, -5, -68, -5, [-50, -22]);
    H(f, -5, 5, 68, [20, 52]);
    H(f, 5, -68, -5, [-50, -22]);
    H(f, 5, 5, 68, [22, 54]);
    V(f, -5, -65, -5, [-35]);
    V(f, 5, -65, -5, [-15, -45]);
    V(f, -5, 5, 65, [25, 54]);
    V(f, 5, 5, 65, [18, 48]);
    // Lobby (SW) and visitor lockers.
    room(f, 'Main Lobby', -68, -65, -5, -5, 'lobby');
    V(f, -68, -65, -5, [-40]);
    H(f, -14, -89, -68);
    room(f, 'Visitor Lockers', -89, -65, -68, -14, 'tile');
    sign(f, 'MAIN LOBBY', -36, -5.35, '+z', '#56d5e8');
    sign(f, 'EXIT', -36, -65 + 0.05, '+z', '#4fe08a');
    put(f, 'counter', -36, -46, 0, { w: 16, d: 2.2 });
    put(f, 'counter', -45, -42, 0, { w: 2.2, d: 6 });
    put(f, 'counter', -27, -42, 0, { w: 2.2, d: 6 });
    put(f, 'deskChair', -40, -48.8); put(f, 'deskChair', -32, -48.8);
    put(f, 'monitor', -40, -46.4, 2); put(f, 'monitor', -32, -46.4, 2);
    for (const x of [-60, -12]) for (const z of [-56, -30]) put(f, 'pillar', x, z);
    for (const z of [-24, -16]) { put(f, 'bench', -58, z, 0, { w: 10 }); put(f, 'bench', -16, z, 0, { w: 10 }); }
    put(f, 'rug', -36, -28, 0, { w: 16, d: 12 });
    put(f, 'sofa', -36, -33, 0); put(f, 'coffeeTable', -36, -28); put(f, 'sofa', -36, -23, 2);
    for (const x of [-66, -7]) for (const z of [-63, -7.5]) put(f, 'plant', x, z);
    put(f, 'vending', -66.6, -30, 1); put(f, 'vending', -66.6, -24, 1);
    for (const z of [-60, -52, -44, -28, -20]) put(f, 'lockers', -87.6, z, 1, { w: 7 });
    put(f, 'bench', -78, -36, 1, { w: 8 });
    // Security (SE): office, holding cell, equipment, staff lockers, janitor.
    room(f, 'Security Office', 5, -26, 36, -5, 'office');
    room(f, 'Holding', 36, -26, 68, -5, 'concrete');
    room(f, 'Equipment', 5, -65, 40, -26, 'concrete');
    room(f, 'Staff Lockers', 40, -65, 89, -26, 'tile');
    room(f, 'Janitor', 68, -26, 89, -14, 'concrete');
    V(f, 36, -26, -5, [-15]);
    V(f, 68, -26, -5);
    H(f, -26, 5, 89, [20]);
    V(f, 40, -65, -26, [-45]);
    H(f, -14, 68, 89, [80]);
    sign(f, 'SECURITY', 20, -5.35, '+z', '#5aa9ff');
    sign(f, 'HOLDING', 52, -5.35, '+z', '#ff7d6b');
    put(f, 'monitorDesk', 20, -24.4, 0, { w: 18 });
    put(f, 'deskChair', 15, -21.5, 2); put(f, 'deskChair', 25, -21.5, 2);
    put(f, 'desk', 30, -11, 1); put(f, 'deskChair', 26.6, -11, 1);
    put(f, 'lockers', 6.4, -16, 1, { w: 10 });
    put(f, 'bars', 52, -18, 0, { w: 31.4 });
    put(f, 'cellBed', 46, -23.5, 1); put(f, 'cellBed', 58, -23.5, 1);
    put(f, 'toilet', 66.5, -24.5);
    for (const z of [-62.8, -28.2]) put(f, 'shelf', 22, z, 0, { w: 26 });
    put(f, 'crate', 12, -40); put(f, 'crate', 14.5, -42); put(f, 'crate', 32, -52); put(f, 'table', 22, -46, 0, { w: 8, d: 3.5 });
    for (const x of [48, 58, 68, 78]) put(f, 'lockers', x, -63.6, 0, { w: 8 });
    put(f, 'bench', 63, -48, 0, { w: 14 }); put(f, 'bench', 63, -40, 0, { w: 14 });
    put(f, 'lockers', 87.6, -36, 3, { w: 8 });
    put(f, 'shelf', 87.6, -20, 1, { w: 8 }); put(f, 'bucket', 72, -24);
    // Cafeteria and kitchen (NW), storage.
    room(f, 'Cafeteria', -68, 5, -5, 42, 'checker');
    room(f, 'Kitchen', -68, 42, -5, 65, 'tile');
    room(f, 'Storage', -89, 10, -68, 65, 'concrete');
    H(f, 42, -68, -5, [-20]);
    V(f, -68, 5, 65, [54]);
    H(f, 10, -89, -68);
    sign(f, 'CAFETERIA', -36, 5.35, '-z', '#ffcf5a');
    for (const x of [-56, -42, -28, -14]) for (const z of [14, 24, 34]) put(f, 'diningTable', x, z);
    put(f, 'counter', -44, 40.6, 0, { w: 30, d: 2.2 }); put(f, 'trays', -44, 40.6);
    put(f, 'counter', -26, 63.6, 0, { w: 30, d: 2.4 }); put(f, 'stove', -50, 63.6, 2); put(f, 'stove', -45, 63.6, 2);
    put(f, 'counter', -36, 53, 0, { w: 18, d: 4 });
    put(f, 'fridge', -66.4, 46, 1); put(f, 'fridge', -66.4, 49.5, 1);
    for (const z of [16, 26, 36, 46, 56]) put(f, 'shelf', -87.6, z, 1, { w: 8 });
    put(f, 'crate', -76, 30); put(f, 'crate', -73.5, 32.5); put(f, 'crate', -76, 35);
    // Laundry, visitor room, gym, electrical (NE).
    room(f, 'Laundry', 5, 5, 40, 30, 'tile');
    room(f, 'Visiting Room', 40, 5, 68, 30, 'wood');
    room(f, 'Gym', 5, 30, 89, 65, 'rubber');
    room(f, 'Electrical', 68, 10, 89, 30, 'concrete');
    V(f, 40, 5, 30);
    H(f, 30, 5, 89, [75]);
    V(f, 68, 5, 30);
    H(f, 10, 68, 89);
    sign(f, 'LAUNDRY', 22, 5.35, '-z', '#8fd0ff'); sign(f, 'VISITING', 54, 5.35, '-z', '#c5a3ff');
    for (const x of [10, 15, 20, 25, 30]) put(f, 'washer', x, 28.4, 2);
    put(f, 'table', 22, 16, 0, { w: 10, d: 3.5 }); put(f, 'laundryCart', 34, 12);
    for (const z of [12, 22]) for (const x of [47, 61]) { put(f, 'table', x, z, 0, { w: 6, d: 3 }); put(f, 'chair', x, z - 2.6); put(f, 'chair', x, z + 2.6, 2); }
    put(f, 'plant', 66, 28); put(f, 'vending', 43, 28.8, 2);
    for (const x of [16, 24, 32]) put(f, 'treadmill', x, 61, 2);
    put(f, 'benchPress', 46, 40); put(f, 'benchPress', 56, 40); put(f, 'weightRack', 51, 63.6, 2);
    put(f, 'mat', 72, 48, 0, { w: 14, d: 12 });
    put(f, 'rack', 87.6, 52, 3, { w: 6 });
    for (const z of [14, 20, 26]) put(f, 'electricBox', 88.4, z, 3);
    put(f, 'generator', 76, 20);
  }

  // ---- First floor: infirmary, OR, research lab, offices -----------------------------------
  {
    const f = 1;
    H(f, -5, -68, -5, [-50, -20]);
    H(f, -5, 5, 68, [20, 52]);
    H(f, 5, -68, -5, [-52, -20]);
    H(f, 5, 5, 68, [20, 52]);
    V(f, -5, -65, -5, [-20, -52]);
    V(f, 5, -65, -5, [-15, -45]);
    V(f, -5, 5, 65, [15, 45]);
    V(f, 5, 5, 65, [45]);
    // Infirmary (SW), pharmacy, archive, sterilisation.
    room(f, 'Infirmary', -68, -40, -5, -5, 'lino');
    room(f, 'Pharmacy', -40, -65, -5, -40, 'tile');
    room(f, 'Archive', -89, -65, -40, -40, 'wood');
    room(f, 'Sterilization', -89, -40, -68, -14, 'tile');
    H(f, -40, -89, -5, [-22, -60]);
    V(f, -40, -65, -40, [-52]);
    V(f, -68, -40, -5, [-28]);
    H(f, -14, -89, -68);
    sign(f, 'INFIRMARY', -35, -5.35, '+z', '#65d9ad');
    for (const x of [-62, -52, -42, -32, -22, -12]) {
      put(f, 'bed', x, -35.6);
      put(f, 'curtain', x + 4.5, -35.4, 1, { w: 8 });
      put(f, 'ivStand', x - 2.6, -38);
    }
    put(f, 'counter', -36, -14, 0, { w: 14, d: 2.4 }); put(f, 'monitor', -38, -14, 2); put(f, 'deskChair', -38, -16.6);
    put(f, 'cabinet', -66.4, -16, 1, { w: 5 });
    for (const z of [-62.8, -42.2]) put(f, 'medShelf', -22, z, 0, { w: 28 });
    put(f, 'counter', -22, -52, 0, { w: 12, d: 2.4 });
    for (const x of [-84, -76, -68, -60, -52, -46]) put(f, 'fileCabinet', x, -63.6);
    put(f, 'shelf', -64, -52, 0, { w: 14 }); put(f, 'shelf', -78, -52, 0, { w: 14 });
    put(f, 'counter', -87.6, -27, 1, { w: 18, d: 2.4 }); put(f, 'sterilizer', -76, -38.4);
    // Operating room, exam room, research lab, cold storage (SE).
    room(f, 'Operating Room', 5, -26, 36, -5, 'lino');
    room(f, 'Exam Room', 36, -26, 68, -5, 'lino');
    room(f, 'Research Lab', 5, -65, 89, -26, 'lab');
    room(f, 'Cold Storage', 68, -26, 89, -14, 'concrete');
    V(f, 36, -26, -5);
    V(f, 68, -26, -5);
    H(f, -26, 5, 89, [20, 80]);
    H(f, -14, 68, 89);
    sign(f, 'SURGERY', 20, -5.35, '+z', '#ff7d6b'); sign(f, 'EXAM', 52, -5.35, '+z', '#65d9ad');
    sign(f, 'RESEARCH · RESTRICTED', 47, -26 - 0.35, '+z', '#b39aff');
    put(f, 'operatingTable', 20, -16); put(f, 'surgicalLamp', 20, -16); put(f, 'cabinet', 34.6, -18, 3, { w: 6 }); put(f, 'ivStand', 16, -13);
    put(f, 'monitorCart', 25, -12);
    put(f, 'examBed', 52, -22.6, 1); put(f, 'desk', 62, -10, 1); put(f, 'deskChair', 58.6, -10, 1); put(f, 'cabinet', 37.4, -16, 1, { w: 6 });
    for (const x of [20, 44, 68]) for (const z of [-38, -52]) put(f, 'labBench', x, z, 0, { w: 14 });
    put(f, 'glassWall', 32, -45, 1, { w: 22 });
    put(f, 'glassWall', 56, -45, 1, { w: 22 });
    put(f, 'tank', 86, -60); put(f, 'tank', 86, -54);
    put(f, 'fridge', 87.4, -20, 3); put(f, 'fridge', 87.4, -16.5, 3); put(f, 'shelf', 78, -15.1, 0, { w: 12 });
    // Staff room, doctor's office, group therapy (NW).
    room(f, 'Staff Room', -36, 5, -5, 26, 'wood');
    room(f, "Doctor's Office", -68, 5, -36, 26, 'carpet');
    room(f, 'Group Therapy', -89, 26, -5, 65, 'carpet');
    room(f, 'Medicine Closet', -89, 10, -68, 26, 'tile');
    V(f, -36, 5, 26);
    H(f, 26, -89, -5, [-20, -78]);
    V(f, -68, 5, 26);
    H(f, 10, -89, -68);
    sign(f, 'STAFF ONLY', -20, 5.35, '-z', '#ffcf5a'); sign(f, 'DR. OFFICE', -52, 5.35, '-z', '#8fd0ff');
    put(f, 'sofa', -16, 24, 2); put(f, 'coffeeTable', -16, 19); put(f, 'counter', -34.4, 15, 1, { w: 12, d: 2.2 });
    put(f, 'coffeeMachine', -34.4, 12); put(f, 'table', -24, 12, 0, { w: 6, d: 3 }); put(f, 'fridge', -7, 24, 3);
    put(f, 'desk', -52, 20, 0); put(f, 'deskChair', -52, 22.6, 2); put(f, 'chair', -50, 16); put(f, 'chair', -54, 16);
    put(f, 'shelf', -66.6, 16, 1, { w: 10 }); put(f, 'plant', -38, 24);
    put(f, 'rug', -46, 46, 0, { w: 20, d: 20 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; put(f, 'chair', -46 + Math.cos(a) * 7, 46 + Math.sin(a) * 7, 0, { face: Math.atan2(-Math.cos(a), -Math.sin(a)) }); }
    put(f, 'sofa', -80, 50, 1); put(f, 'sofa', -80, 38, 1); put(f, 'shelf', -46, 63.6, 0, { w: 18 });
    put(f, 'whiteboard', -20, 64.6, 2); put(f, 'plant', -87, 63); put(f, 'plant', -7, 63);
    for (const z of [13.5, 19.5]) put(f, 'medShelf', -87.6, z, 1, { w: 5 });
    // Reception, camera room, conference, director's office, server room (NE).
    room(f, 'Reception', 5, 5, 36, 26, 'carpet');
    room(f, 'Camera Room', 36, 5, 68, 26, 'office');
    room(f, 'Conference', 5, 26, 40, 65, 'wood');
    room(f, "Director's Office", 40, 26, 89, 65, 'director');
    room(f, 'Server Room', 68, 10, 89, 26, 'concrete');
    V(f, 36, 5, 26);
    H(f, 26, 5, 89, [20, 78]);
    V(f, 40, 26, 65, [45]);
    V(f, 68, 5, 26);
    H(f, 10, 68, 89);
    sign(f, 'ADMINISTRATION', 20, 5.35, '-z', '#c5a3ff'); sign(f, 'SURVEILLANCE', 52, 5.35, '-z', '#5aa9ff');
    put(f, 'counter', 20, 18, 0, { w: 14, d: 2.4 }); put(f, 'deskChair', 20, 21, 2); put(f, 'monitor', 20, 18);
    put(f, 'bench', 8, 14, 1, { w: 8 }); put(f, 'plant', 34, 24);
    put(f, 'monitorDesk', 52, 24.4, 2, { w: 24 }); put(f, 'deskChair', 46, 21.5); put(f, 'deskChair', 58, 21.5);
    put(f, 'confTable', 22, 46, 1, { w: 22, d: 7 });
    for (const z of [38, 44, 50, 56]) { put(f, 'chair', 16.5, z, 1); put(f, 'chair', 27.5, z, 3); }
    put(f, 'whiteboard', 22, 64.6, 2);
    put(f, 'rug', 66, 48, 0, { w: 26, d: 18 });
    put(f, 'desk', 66, 56, 0, { w: 10, d: 3.6 }); put(f, 'deskChair', 66, 59.4, 2); put(f, 'monitor', 66, 56);
    put(f, 'sofa', 60, 38); put(f, 'sofa', 72, 38); put(f, 'coffeeTable', 66, 43);
    put(f, 'shelf', 87.6, 48, 1, { w: 16 }); put(f, 'plant', 43, 63); put(f, 'plant', 87, 28);
    for (const x of [72, 78, 84]) put(f, 'serverRack', x, 14);
    put(f, 'serverRack', 72, 22); put(f, 'serverRack', 78, 22);
  }

  // ---- Second floor: patient ward ---------------------------------------------------------
  {
    const f = 2;
    // 28 patient cells line the main corridor, seven per quadrant (9 wide, 12 deep). Every cell door
    // stands open, swung back into the cell.
    const cellCentres = [9.5, 18.5, 27.5, 36.5, 45.5, 54.5, 63.5];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      H(f, sz * 5, sx * 5, sx * 68, cellCentres.map(c => sx * c));
      H(f, sz * 17, sx * 5, sx * 68);
      for (const x of [14, 23, 32, 41, 50, 59]) V(f, sx * x, sz * 5, sz * 17);
      V(f, sx * 68, sz * 5, sz * 17);
      cellCentres.forEach((c, i) => {
        room(f, `Cell ${sx > 0 ? 'E' : 'W'}${sz > 0 ? 'N' : 'S'}${i + 1}`, sx * (c - 4.5), sz * 5, sx * (c + 4.5), sz * 17, 'cell');
        put(f, 'cellBed', sx * (c - 1), sz * 14.6, 1);
        put(f, 'toilet', sx * (c + 3), sz * 15.6);
        put(f, 'cellDoor', sx * (c + 1.85), sz * 6.9);
        sign(f, `CELL ${sz > 0 ? 'N' : 'S'}${sx > 0 ? 7 + i + 1 : 7 - i}`, sx * c, sz * 4.65, sz > 0 ? '-z' : '+z', '#70dbaf');
        put(f, 'sink', sx * (c - 3.4), sz * 8, sx > 0 ? 1 : 3);
      });
    }
    V(f, -5, 5, 65, [40]);
    V(f, 5, 5, 65, [30]);
    V(f, -5, -65, -5, [-35]);
    V(f, 5, -65, -5, [-35]);
    sign(f, 'WARD C · PATIENTS', -36, 17 + 0.35, '+z', '#70dbaf');
    sign(f, 'WARD C · PATIENTS', 36, -17 - 0.35, '-z', '#70dbaf');
    // Day room (NW).
    room(f, 'Day Room', -89, 17, -5, 65, 'wood');
    room(f, 'Day Room', -89, 10, -68, 17, 'wood');
    H(f, 10, -89, -68, [-78]);
    sign(f, 'DAY ROOM', -5.35, 40, '+x', '#ffcf5a');
    put(f, 'tv', -46, 64.6, 2); put(f, 'rug', -46, 52, 0, { w: 22, d: 12 });
    put(f, 'sofa', -46, 48); put(f, 'sofa', -55, 54, 1); put(f, 'sofa', -37, 54, 3);
    for (const [x, z] of [[-74, 30], [-74, 44], [-60, 30], [-20, 30], [-20, 44]]) {
      put(f, 'table', x, z, 0, { w: 6, d: 4 });
      put(f, 'chair', x - 1.6, z - 3); put(f, 'chair', x + 1.6, z - 3); put(f, 'chair', x - 1.6, z + 3, 2); put(f, 'chair', x + 1.6, z + 3, 2);
    }
    put(f, 'shelf', -87.6, 56, 1, { w: 14 }); put(f, 'pingPong', -36, 26); put(f, 'plant', -7, 63); put(f, 'plant', -87, 20);
    put(f, 'vending', -10, 19.4, 0);
    // Showers and isolation (NE).
    room(f, 'Showers', 5, 17, 40, 65, 'tile');
    room(f, 'Isolation', 40, 17, 89, 50, 'concrete');
    room(f, 'Isolation', 68, 10, 89, 17, 'concrete');
    V(f, 40, 17, 65);
    V(f, 68, 10, 17);
    H(f, 10, 68, 89, [78]);
    sign(f, 'SHOWERS', 5.35, 30, '-x', '#8fd0ff');
    sign(f, 'ISOLATION', 78, 10.35, '-z', '#ff7d6b');
    for (const x of [10, 17, 24, 31]) put(f, 'shower', x, 63.6, 2);
    for (const z of [26, 34, 42]) put(f, 'sink', 38.6, z, 3);
    put(f, 'bench', 22, 44, 0, { w: 14 });
    for (const x of [46, 54, 62]) put(f, 'toiletStall', x, 20.4);
    H(f, 50, 40, 89, [{ at: 51, closed: true }, { at: 65, closed: true }, 79]);
    V(f, 58, 50, 65); V(f, 72, 50, 65);
    room(f, 'Padded Cell', 40, 50, 58, 65, 'padded'); room(f, 'Padded Cell', 58, 50, 72, 65, 'padded'); room(f, 'Padded Cell', 72, 50, 89, 65, 'padded');
    put(f, 'restraintBed', 80, 60, 1);
    put(f, 'desk', 54, 36, 0, { w: 8, d: 3 }); put(f, 'deskChair', 54, 33.4); put(f, 'cabinet', 88.2, 30, 3, { w: 8 });
    put(f, 'wheelchair', 70, 34); put(f, 'wheelchair', 74, 34);
    // Dorm and nurse station (SW).
    room(f, 'Dormitory', -50, -65, -5, -17, 'lino');
    room(f, 'Nurse Station', -89, -65, -50, -17, 'lino');
    room(f, 'Nurse Station', -89, -17, -68, -14, 'lino');
    V(f, -50, -65, -17, [-40]);
    H(f, -14, -89, -68, [-78]);
    sign(f, 'DORMITORY', -5.35, -35, '+x', '#70dbaf');
    for (const x of [-44, -36, -28, -20, -12]) { put(f, 'bed', x, -60.6, 0, { old: true }); put(f, 'nightstand', x + 3.4, -63.4); }
    for (const x of [-44, -36, -20, -12]) put(f, 'bed', x, -22, 2, { old: true });
    put(f, 'lockers', -48.6, -28, 1, { w: 6 });
    put(f, 'counter', -66, -40, 1, { w: 18, d: 2.6 }); put(f, 'deskChair', -69.4, -40, 1); put(f, 'monitor', -66, -40, 3);
    put(f, 'medShelf', -87.6, -40, 1, { w: 14 }); put(f, 'medCart', -60, -30); put(f, 'wheelchair', -80, -22);
    put(f, 'cabinet', -70, -63.6, 0, { w: 10 });
    // Workshop and storage (SE).
    room(f, 'Workshop', 5, -65, 50, -17, 'concrete');
    room(f, 'Ward Storage', 50, -65, 89, -17, 'concrete');
    room(f, 'Ward Storage', 68, -17, 89, -14, 'concrete');
    V(f, 50, -65, -17, [-50]);
    V(f, 68, -17, -14);
    H(f, -14, 68, 89);
    sign(f, 'WORKSHOP', 5.35, -35, '-x', '#ffcf5a');
    for (const [x, z] of [[16, -28], [34, -28], [16, -50], [34, -50]]) put(f, 'workbench', x, z, 0, { w: 10 });
    put(f, 'shelf', 27, -63.6, 0, { w: 26 }); put(f, 'easel', 44, -22); put(f, 'easel', 10, -40);
    for (const z of [-60, -50, -40, -30, -22]) put(f, 'shelf', 87.6, z, 1, { w: 8 });
    put(f, 'crate', 60, -60); put(f, 'crate', 62.5, -57.5); put(f, 'crate', 60, -55); put(f, 'crate', 76, -36); put(f, 'crate', 66, -24);
  }

  // ---- Collision ----------------------------------------------------------------------------
  // Footprints (width along x, depth along z, before turning) of the furniture that blocks movement.
  const FOOTPRINTS = {
    bed: [2.6, 5.4], cellBed: [2.2, 4.6], examBed: [2.4, 5], restraintBed: [2.6, 5.2], operatingTable: [2.6, 5.6],
    counter: null, desk: [6, 3], table: null, diningTable: [9, 5.6], confTable: null, coffeeTable: [3.6, 2],
    sofa: [6, 2.4], bench: [null, 1.4], lockers: [null, 1.4], shelf: [null, 1.4], medShelf: [null, 1.4], cabinet: [null, 1.4],
    monitorDesk: [null, 2.4], labBench: [null, 3], workbench: [null, 3.4], glassWall: [null, 0.3], bars: [null, 0.4],
    vending: [2.4, 1.8], fridge: [2.6, 1.8], stove: [3.4, 2.4], washer: [2.6, 2.4], treadmill: [2.4, 5], benchPress: [2.4, 5],
    weightRack: [6, 1.4], rack: [null, 1.4], generator: [5, 4], serverRack: [3, 2.2], tank: [3, 3], pillar: [2.4, 2.4],
    shower: [5, 2.4], sink: [2.4, 1.4], toiletStall: [6, 6], fileCabinet: [3, 1.6], pingPong: [6, 3.4], crate: [2.4, 2.4],
    sterilizer: [3, 2], toilet: [1.2, 1.6], cellDoor: [0.2, 3.2], electricBox: [2.4, 0.8], whiteboard: null, tv: null, stairs: [4.6, 12.4],
    laundryCart: [2.4, 3], medCart: [2, 3], monitorCart: [1.8, 1.8], wheelchair: [2, 2.4], easel: [2, 2], plant: [1.2, 1.2],
  };
  function footprint(item) {
    const base = FOOTPRINTS[item.type];
    if (base === undefined && !(item.w && item.d)) return null;
    let w = item.w ?? base?.[0], d = item.d ?? base?.[1];
    if (base && base[0] === null) { w = item.w; d = item.d ?? base[1]; }
    if (!w || !d) return null;
    if (item.rot % 2) [w, d] = [d, w];
    return { minX: item.x - w / 2, maxX: item.x + w / 2, minZ: item.z - d / 2, maxZ: item.z + d / 2 };
  }
  // Rugs, mats, chairs and other low clutter can be walked over (or pushed past).
  const WALK_THROUGH = new Set(['rug', 'mat', 'chair', 'deskChair', 'monitor', 'trays', 'curtain', 'surgicalLamp', 'ivStand', 'coffeeMachine', 'nightstand', 'bucket', 'whiteboard', 'tv']);

  // The solid pieces of a wall: the wall minus its open doors.
  function wallPieces(w) {
    const alongX = w.z1 === w.z2;
    const start = alongX ? w.x1 : w.z1, end = alongX ? w.x2 : w.z2;
    const gaps = w.doors.filter(door => !door.closed).map(door => [door.at - DOOR_WIDTH / 2, door.at + DOOR_WIDTH / 2]).sort((a, b) => a[0] - b[0]);
    const pieces = [];
    let cursor = start;
    for (const [a, b] of gaps) { if (a > cursor) pieces.push([cursor, a]); cursor = Math.max(cursor, b); }
    if (end > cursor) pieces.push([cursor, end]);
    const half = w.thickness / 2;
    return pieces.map(([a, b]) => (alongX
      ? { minX: a, maxX: b, minZ: w.z1 - half, maxZ: w.z1 + half }
      : { minX: w.x1 - half, maxX: w.x1 + half, minZ: a, maxZ: b }));
  }
  const wallBoxes = walls.map(list => list.flatMap(wallPieces));
  const solids = furniture.map((list, floor) => [
    ...wallBoxes[floor].map(box => ({ ...box, tall: true })),
    ...list.filter(item => !WALK_THROUGH.has(item.type)).map(footprint).filter(Boolean),
  ]);

  // Does the segment from (x1, z1) to (x2, z2) pass through a wall? Used by the server for line of
  // sight and to stop players walking through walls.
  function wallBetween(floor, x1, z1, x2, z2) {
    const boxes = wallBoxes[floor]; if (!boxes) return false;
    const dx = x2 - x1, dz = z2 - z1;
    for (const box of boxes) {
      let t0 = 0, t1 = 1, hit = true;
      for (const [p, d, min, max] of [[x1, dx, box.minX, box.maxX], [z1, dz, box.minZ, box.maxZ]]) {
        if (Math.abs(d) < 1e-9) { if (p <= min || p >= max) { hit = false; break; } continue; }
        let a = (min - p) / d, b = (max - p) / d;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 >= t1) { hit = false; break; }
      }
      if (hit) return true;
    }
    return false;
  }

  const LAYOUT = {
    FLOOR_Y, FLOOR_NAMES, WALL_HEIGHT, WALL_THICKNESS, DOOR_WIDTH, DOOR_HEIGHT, BOUNDS, STAIRS,
    SPAWNS, LOOT, PICKUPS, CAMERAS, walls, rooms, furniture, signs, solids, wallBoxes, wallPieces, footprint, wallBetween,
  };
  if (typeof module === 'object' && module.exports) module.exports = LAYOUT;
  else root.LAYOUT = LAYOUT;
})(typeof globalThis !== 'undefined' ? globalThis : this);
