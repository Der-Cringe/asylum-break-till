# Asylum Break

A browser-based 3D multiplayer prototype inspired by a prison-asylum escape game.

## Features
- 3D building with three furnished floors: ground floor (lobby, security, cafeteria, gym), medical floor (infirmary, surgery, research lab, offices) and the patient ward (28 cells, day room, dorm, showers, isolation)
- First-person and third-person camera: V, the mouse wheel or the 1ST/3RD button on touch screens
- Role selection: Patient, Medic, Orderly, Director
- Per-role spawn locations
- Stairwells between floors (E / ▲ up, F / ▼ down) and simple collision with beds, lab walls and tables
- Director tablet with camera views (equip the tablet, slot 4)
- Items and combat: melee weapons, throwables, a taser, shields, arrests, med kits and drinks (see below)
- Multiplayer support through Socket.IO
- Browser playable on desktop and mobile Safari

## Items
All item stats live in `public/items.js`, which both the server and the browser load. Change a number there and restart the server.

- **Use:** click (without dragging) or Space on desktop, the red USE button on touch screens. Pick an item with 1–6 or by tapping its slot; picking it again puts it away.
- **Loot:** items spawn at fixed spots around the map and respawn 40 s after someone takes them. Walk over one to pick it up (max 6 slots).
- **Status:** stunned players cannot move or use items, slowed players are slower, at 0 health a player is knocked out and respawns after 5 s with their starting loadout.
- **Arrest:** staff can cuff a stunned or knocked-out patient, who goes back to the ward and is held for 8 s.
- The server decides every hit; the browser only shows what happened.

## Building
The floor plan lives in `public/layout.js`, which both the server and the browser load: walls and doors, rooms, furniture positions, spawns, loot spots and the director's security cameras. `public/interior.js` turns it into meshes (merged per material, so a floor is a few dozen draw calls). The server uses the same walls to stop players walking through them and to block hits, blasts and throws behind walls.

## Characters
The four role models live in `public/assets/characters/*.glb` (about 0.2–0.5 MB each). They are built with Blender from the source STL sculpts by the scripts in `tools/character-pipeline`:

1. `prepare.py` imports an STL and decimates it (the sources are ~2 million triangles).
2. `build.py` cuts the T-pose figure into head, torso, arms and legs with their joints as pivots, drops everything that is not body (held items, the drone, the patient's aura), paints the colours from the role artwork and exports a GLB. Colours and body measurements per role are at the top of the script.

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/character-pipeline/prepare.py -- "source.stl" out/patient
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/character-pipeline/build.py -- out/patient.blend patient public/assets/characters/patient.glb
```

`public/characters.js` loads the models and builds the posable rig; the walk, attack, stunned and knocked-out poses are animated in `animateActor` in `game.js`. `character-preview.html` shows all four side by side (`?spin=1` rotates them). Until a model has loaded, the old blocky figure stands in. The STL sources are not committed (`*.stl` is ignored).

## Run locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open `http://localhost:3000` in the browser.

## Render deployment
1. Push this repo to GitHub.
2. Create a new Render Web Service pointing to this repo.
3. Set the build command to:
   ```bash
   npm ci
   ```
4. Set the start command to:
   ```bash
   npm start
   ```
5. Optional: set the health check path to `/health`.
6. Deploy. Your site will be live with the game client and Socket.IO multiplayer server.

Note: on Render's free plan the service sleeps when idle (first visit takes ~30 s) and all game state lives in memory, so it resets on every restart or deploy.

## Current prototype notes
- This is a playable foundation, not a full game balance pass.
- The server validates movement (no teleporting, floor changes only at stairwells), limits the game to one Director and rate-limits events.
- Players who briefly lose connection get their position back for 60 seconds.
- `map.html` is a separate map concept page, not part of the playable game.
- You can expand specific mechanics like true keycard locks later.
