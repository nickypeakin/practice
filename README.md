# Fortress Crew

Two games in one, played in the browser, and they can share a sky:

- **Bomber crew** (up to 7 players): fly a B-17 in formation, walk the ship, man the guns, command the bot crew.
- **Fighter pilot** (up to 6 players): fly an interceptor against the formation and shoot the Fortresses down.

Pick a side in the lobby. Leave the code blank for a new game, or enter a code to join one. A fighter pilot who enters a bomber crew's code attacks that crew.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000, pick a callsign and join. Share the page link (it carries the crew code after `#`)
so friends on the same server join your bomber. Set `PORT` to change the port.

## Mission

The world is mostly open sea. The airfield sits on one island and the target on another, with more islands scattered between. Bombs that miss land throw up a column of water.

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

## Guns, wounds and first aid

- Each gun feeds from 125-round belts. When a belt runs out the gunner changes it (about four seconds: cover up, new belt in, cover down, charge twice). **R** changes a part-used belt early.
- Bullets and flak can hit the bot crew. A wounded man keeps fighting but shoots worse, and bleeds: walk to him and press **E** to give first aid, or he may die. A dead gunner's station is silent until a player takes it.
- If the pilot is killed the copilot flies on. If both are lost, someone has to take the pilot's seat.
- Intercom lines are spoken aloud where the browser supports it. **M** turns the voices off. **T** marks the fighter you are looking at for the gunners.

## Fighter pilot

- You spawn astern of and above the formation. Red boxes mark every Fortress; the white pip is where to aim when you are in range.
- W/S pitch, A/D roll, Q/E rudder, Shift/Z throttle, Space or click to fire, mouse to look around the cockpit, V for the chase view.
- The bombers' gunners shoot back. If you are hit hard the fighter goes down: press **J** twice, the canopy swings open and you go over the side.
- One time in eight you hit the tail of your own fighter going out, and that kills you.
- Shot down, crashed or landed by parachute, you get a new fighter a few seconds later.

## Parachutes

- Leaving any aircraft starts with a somersault into free fall; you can see your own arms and legs. **Space** or a click pulls the ripcord and the canopy streams out and fills.
- One parachute in eight is a dud: it streams and never opens.
- Open too low and you hit too hard.

## Aerobatics

Both aircraft roll all the way over and loop. The bomber is slow about it: hold A or D to roll right onto her back, and she will not right herself from there.

## Men on the floor

- A crewman who is hit may be wounded, knocked unconscious, or killed. The dead and the unconscious lie on the floor by their station.
- Walk up and press **G** to pick a man up, **G** again to put him down.
- Carry him onto the bomb bay catwalk with the doors open and **G** pushes him out. A dead man simply falls. An unconscious man goes out on a static line, his parachute opens, and he lives.
- Or leave them where they are. An unconscious man sometimes comes round on his own.

## Moving around the ship

- **F** gets you up from your station at any time, in flight too. Walk with W/A/S/D, look with the mouse. If the pilot gets up, the copilot (bot) flies.
- **E** next to a station takes it (the bot steps aside). Keys **1-7** still jump straight to a station from another one.
- Stations nose to tail: bombardier, flight deck, top turret, bomb bay, radio room, ball turret, waist guns, crew door, tail gun.
- **Bailing out**: open the bomb bay doors (**O**), walk onto the catwalk and step off it sideways. In the air you are in free fall: look around with the mouse and press **Space** (or click) to open your parachute. Open it too low, or not at all, and you are killed. Land safely and you survive but get no promotion. Parked, you just drop onto the field.

## Crew orders (C opens the menu, then a number)

| Key | Order |
|---|---|
| 0 | Bay doors open / close |
| 1 / 2 / 3 | Gunners: fire at will / close range only (saves ammo) / hold fire |
| 4 | Gunners: focus the fighter you are looking at (**T** does the same without the menu) |
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
