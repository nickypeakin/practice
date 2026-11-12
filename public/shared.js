// Constants and math shared by the server simulation and the browser client.
// Plane local axes: forward = -Z, right = +X, up = +Y. Euler order YXZ (yaw, pitch, roll).

export const AMMO_MAX = 500, BOMBS_MAX = 8, BULLET_SPD = 820, G = 9.81;

// Seats. st = [x, z] where a crewman stands in the fuselage to man the station; gun.eye = camera height above the gun.
export const SEATS = [
  { key: 'pilot', name: 'Pilot', st: [0, -6.3] },
  { key: 'bomb', name: 'Bombardier', st: [0, -9.2], gun: { pos: [0, -0.7, -10.9], yc: 0, yr: 1.2, pmin: -0.7, pmax: 0.5, eye: 0.45 } },
  { key: 'top', name: 'Top Turret', st: [0, -4.0], gun: { pos: [0, 2.1, -4.0], yc: 0, yr: Math.PI, pmin: -0.03, pmax: 1.45, eye: 0.45 } },
  { key: 'ball', name: 'Ball Turret', st: [0, 3.3], gun: { pos: [0, -2.1, 3.3], yc: 0, yr: Math.PI, pmin: -1.45, pmax: 0.03, eye: -0.4 } },
  { key: 'lw', name: 'Left Waist', st: [-0.2, 4.3], gun: { pos: [-1.25, 0.1, 4.3], yc: Math.PI / 2, yr: 1.0, pmin: -0.6, pmax: 0.5, eye: 0.2 } },
  { key: 'rw', name: 'Right Waist', st: [0.2, 4.3], gun: { pos: [1.25, 0.1, 4.3], yc: -Math.PI / 2, yr: 1.0, pmin: -0.6, pmax: 0.5, eye: 0.2 } },
  { key: 'tail', name: 'Tail Gunner', st: [0, 10.5], gun: { pos: [0, 0.5, 12.3], yc: Math.PI, yr: 1.0, pmin: -0.6, pmax: 0.6, eye: 0.3 } },
];

// Fuselage interior (plane-local metres). The crew walks a corridor along z.
export const WALK_Z0 = -10, WALK_Z1 = 11;
export const BAY = { z0: -3.0, z1: 0.6, fall: 0.5 };    // bomb bay; step further than `fall` off the catwalk with the doors open and you drop out
export const DOOR = { x: 1.0, z: 5.45 };                // crew door, right side aft
// Corridor half width at z. It narrows smoothly towards each doorway so you slide through instead of snagging.
export function halfW(z, doors) {
  const bay = doors ? 0.85 : 0.32;
  const P = [[-10, 0.45], [-8, 0.45], [-7.7, 0.3], [-5, 0.3], [-4.7, 0.5], [-3.4, 0.5], [-3.05, 0.36], [-2.7, bay], [0.3, bay], [0.65, 0.36], [1, 0.55],
    [2.3, 0.55], [2.6, 0.4], [2.9, 0.55], [5.9, 0.55], [6.3, 0.36], [11, 0.2]];
  for (let i = 1; i < P.length; i++) if (z <= P[i][0]) { const a = P[i - 1], b = P[i]; return a[1] + (b[1] - a[1]) * Math.max(0, (z - a[0]) / (b[0] - a[0])); }
  return 0.2;
}
// eye height of someone standing at z
const EYE = [[-10, 0.35], [-7.9, 0.35], [-7.5, 1.5], [-5.1, 1.5], [-4.6, 0.55], [6, 0.55], [11, 0.4]];
export function eyeY(z) {
  for (let i = 1; i < EYE.length; i++) if (z <= EYE[i][0]) { const a = EYE[i - 1], b = EYE[i]; return a[1] + (b[1] - a[1]) * Math.max(0, (z - a[0]) / (b[0] - a[0])); }
  return EYE[EYE.length - 1][1];
}

// Crew orders (menu digit -> order)
export const ORDERS = ['Bay doors: open / close', 'Gunners: fire at will', 'Gunners: close range only (save ammo)', 'Gunners: hold fire',
  'Gunners: focus the fighter I am looking at', 'Bombardier: bomb the target yourself', 'Bombardier: hold the bombs',
  'Bombardier: salvo, drop everything now', 'Copilot: hold formation', 'Copilot: take us home and land'];

export const RANKS = ['Private', 'Private First Class', 'Corporal', 'Sergeant', 'Staff Sergeant',
  'Technical Sergeant', 'Master Sergeant', 'Second Lieutenant', 'First Lieutenant', 'Captain',
  'Major', 'Lieutenant Colonel', 'Colonel', 'Brigadier General'];
const ABBR = ['Pvt.', 'Pfc.', 'Cpl.', 'Sgt.', 'S/Sgt.', 'T/Sgt.', 'M/Sgt.', '2nd Lt.', '1st Lt.', 'Capt.', 'Maj.', 'Lt. Col.', 'Col.', 'Brig. Gen.'];
export const rankName = m => RANKS[Math.min(m, RANKS.length - 1)];
export const rankAbbr = m => ABBR[Math.min(m, ABBR.length - 1)];

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

// local -> world
export function rot(v, yaw, pitch, roll) {
  let [x, y, z] = v, c, s, t;
  c = Math.cos(roll); s = Math.sin(roll); t = x * c - y * s; y = x * s + y * c; x = t;
  c = Math.cos(pitch); s = Math.sin(pitch); t = y * c - z * s; z = y * s + z * c; y = t;
  c = Math.cos(yaw); s = Math.sin(yaw); t = x * c + z * s; z = -x * s + z * c; x = t;
  return [x, y, z];
}
// world -> local
export function irot(v, yaw, pitch, roll) {
  let [x, y, z] = v, c, s, t;
  c = Math.cos(-yaw); s = Math.sin(-yaw); t = x * c + z * s; z = -x * s + z * c; x = t;
  c = Math.cos(-pitch); s = Math.sin(-pitch); t = y * c - z * s; z = y * s + z * c; y = t;
  c = Math.cos(-roll); s = Math.sin(-roll); t = x * c - y * s; y = x * s + y * c; x = t;
  return [x, y, z];
}
export const aimDir = (ay, ap) => [-Math.sin(ay) * Math.cos(ap), Math.sin(ap), -Math.cos(ay) * Math.cos(ap)];

export function clampAim(g, ay, ap) {
  const rel = clamp(wrap(ay - g.yc), -g.yr, g.yr);
  return [wrap(g.yc + rel), clamp(ap, g.pmin, g.pmax)];
}

export function planeVel(pl) {
  const cp = Math.cos(pl.pitch);
  return [-Math.sin(pl.yaw) * cp * pl.spd, pl.ground ? 0 : (pl.vy ?? Math.sin(pl.pitch) * pl.spd), -Math.cos(pl.yaw) * cp * pl.spd];
}
// Where a bomb released right now would land.
export function impactPoint(pl) {
  const v = planeVel(pl), h = Math.max(0, pl.y - 2);
  const t = (v[1] + Math.sqrt(v[1] * v[1] + 2 * G * h)) / G;
  return { x: pl.x + v[0] * t, z: pl.z + v[2] * t, t };
}
