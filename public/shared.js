// Constants and math shared by the server simulation and the browser client.
// Plane local axes: forward = -Z, right = +X, up = +Y. Euler order YXZ (yaw, pitch, roll).

export const AMMO_MAX = 500, BOMBS_MAX = 8, BULLET_SPD = 820, G = 9.81;

// Loading points beside the parked bomber: [x, z]
export const STN = { fuel: [30, 500], ammo: [30, 518], bombs: [30, 482] };
export const STN_R = 7;

export const SEATS = [
  { key: 'pilot', name: 'Pilot' },
  { key: 'bomb', name: 'Bombardier', gun: { pos: [0, -0.7, -10.9], yc: 0, yr: 1.2, pmin: -0.7, pmax: 0.5 } },
  { key: 'top', name: 'Top Turret', gun: { pos: [0, 2.1, -3.5], yc: 0, yr: Math.PI, pmin: -0.03, pmax: 1.45 } },
  { key: 'ball', name: 'Ball Turret', gun: { pos: [0, -2.1, 2], yc: 0, yr: Math.PI, pmin: -1.45, pmax: 0.03 } },
  { key: 'tail', name: 'Tail Gunner', gun: { pos: [0, 0.5, 12], yc: Math.PI, yr: 1.0, pmin: -0.6, pmax: 0.6 } },
];

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
