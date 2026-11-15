# Asylum Break

A browser-based 3D multiplayer prototype inspired by a prison-asylum escape game.

## Features
- 3D scene with multiple floor levels
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
- Hits ignore walls for now: the server does not know the map's collision boxes yet.
- You can expand specific mechanics like true keycard locks later.
