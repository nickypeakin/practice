# Fortress Crew

Co-op B-17 bomber game for up to 5 players in the browser. Empty seats are flown by bots.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000, pick a callsign and join. Share the page link (it carries the crew code after `#`)
so friends on the same server join your bomber. Set `PORT` to change the port.

## Mission

1. On the ground press **R**: the ground crew loads fuel, ammunition and bombs. You start nearly empty.
2. Take off, fly to the TARGET marker, fight off the fighters, bomb the target.
3. Fly back to BASE, land with the gear down and brake to a stop.
4. Everyone still aboard after a successful mission is promoted one rank (saved in your browser).
5. If the ship is going down, press **J** twice to bail out. You survive but get no promotion.

## Seats (keys 1-5, any seat not held by another player)

| Seat | Controls |
|---|---|
| 1 Pilot | W/S pitch, A/D roll, Q/E rudder, Shift/Z throttle, G gear, B brake, V cockpit view |
| 2 Bombardier | mouse + click nose gun, B bombsight, O bay doors, Space drop bombs |
| 3 Top turret, 4 Ball turret, 5 Tail gunner | mouse (or arrows) aim, click / Space fire |

The white circle in front of a fighter is the lead marker: shoot at it, not at the plane.

## Files

- `server.js` web + WebSocket server, `sim.js` the game simulation (flight, bots, fighters, damage)
- `public/` browser client (three.js), `public/shared.js` constants shared by both sides
