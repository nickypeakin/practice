# Fortress Crew

Co-op B-17 bomber game for up to 7 players in the browser. Every station nobody holds is manned by a bot, and you give the bots their orders.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000, pick a callsign and join. Share the page link (it carries the crew code after `#`)
so friends on the same server join your bomber. Set `PORT` to change the port.

## Mission

1. You start in the air, in formation with six other B-17s, about 10 km from the target. The YOUR SLOT marker shows where your ship belongs; the other bombers' guns cover you while you stay close.
2. Fighters come in waves and go for the whole formation. Fight them off, bomb the target, then follow the formation home.
3. Break off near BASE, land with the gear down and brake to a stop.
4. Everyone still aboard after a successful mission is promoted one rank (saved in your browser).
5. After landing you get time to walk around: the crew door is aft on the right side (**F** to climb out, **F** at the door to climb back in). **N** starts the next mission.

## The crew

- Every bot has a name and talks on the intercom (green lines): calling out fighters by clock position, kills, hits, flak, low ammo.
- Bot gunners take a moment to pick up a target, fire in bursts and scan the sky when it is quiet.
- Take a bot's station and he stands up and steps aside; leave it and he climbs back in. Your view moves into and out of the seat instead of cutting.
- Flak bursts around the formation near the target. Hits punch holes in the skin that let daylight in.

## Moving around the ship

- **F** gets you up from your station at any time, in flight too. Walk with W/A/S/D, look with the mouse. If the pilot gets up, the copilot (bot) flies.
- **E** next to a station takes it (the bot steps aside). Keys **1-7** still jump straight to a station from another one.
- Stations nose to tail: bombardier, flight deck, top turret, bomb bay, radio room, ball turret, waist guns, crew door, tail gun.
- **Bailing out**: open the bomb bay doors (**O**), walk onto the catwalk and step off it sideways. In the air you go out on a parachute (you survive but get no promotion); parked, you drop onto the field.

## Crew orders (C opens the menu, then a number)

| Key | Order |
|---|---|
| 0 | Bay doors open / close |
| 1 / 2 / 3 | Gunners: fire at will / close range only (saves ammo) / hold fire |
| 4 | Gunners: focus the fighter you are looking at (**R** does the same without the menu) |
| 5 / 6 / 7 | Bombardier: bomb the target himself / hold the bombs / salvo now |
| 8 / 9 | Copilot: hold formation / take us home and land |

## Stations

| Seat | Controls |
|---|---|
| 1 Pilot | W/S pitch, A/D roll, Q/E rudder, Shift/Z throttle, G gear, B brake, mouse looks around the cockpit, V outside view |
| 2 Bombardier | mouse + click nose gun, B bombsight, O bay doors, Space drop bombs |
| 3 Top turret, 4 Ball turret, 5 Left waist, 6 Right waist, 7 Tail gunner | mouse (or arrows) aim, click / Space fire |

The white circle in front of a fighter is the lead marker: shoot at it, not at the plane.

## Files

- `server.js` web + WebSocket server, `sim.js` the game simulation (flight, formation, bots, fighters, damage)
- `public/` browser client (three.js), `public/shared.js` constants shared by both sides
