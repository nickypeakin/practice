import * as THREE from '/three/three.module.js';
import { SEATS, ORDERS, BAY, DOOR, WALK_Z0, WALK_Z1, halfW, eyeY, rankName, rankAbbr, AMMO_MAX, BOMBS_MAX, BULLET_SPD, wrap, clamp, clampAim, aimDir, planeVel, impactPoint } from '/shared.js';

const $ = id => document.getElementById(id);
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { } } };

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const SKY = 0x9cc0e4;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(0xc4d8ea, 3000, 30000);
const camera = new THREE.PerspectiveCamera(65, 1, 0.08, 60000);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x566038, 1.5));
const sun = new THREE.DirectionalLight(0xfff2d6, 1.6); sun.position.set(0.5, 1, 0.3); scene.add(sun);

const hud = $('hud'), ctx = hud.getContext('2d');
let W = 0, H = 0;
function resize() {
  W = innerWidth; H = innerHeight; renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  const d = Math.min(devicePixelRatio, 2); hud.width = W * d; hud.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', resize); resize();

const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cylZ = (r1, r2, len, mat, x = 0, y = 0, z = 0, seg = 14) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); return m; };

// ground
{
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#5f7a3c'; g.fillRect(0, 0, 512, 512);
  const cols = ['#6b8642', '#557236', '#7a8c48', '#8a8a4e', '#4d6a33', '#94915a', '#637f3f', '#6f6b43'];
  let seed = 7; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) { g.fillStyle = cols[Math.floor(rr() * cols.length)]; g.fillRect(Math.floor(rr() * 16) * 32, Math.floor(rr() * 16) * 32, 32 * (1 + Math.floor(rr() * 2)), 32 * (1 + Math.floor(rr() * 2))); }
  g.strokeStyle = '#3f5a2c'; g.lineWidth = 2; for (let i = 0; i <= 16; i += 2) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 512); g.stroke(); }
  g.fillStyle = '#31502a'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(rr() * 512, rr() * 512, 6 + rr() * 16, 0, 7); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(100, 100); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120000, 120000, 240, 240), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
}
// airfield (runway z = +700 .. -1300)
{
  const base = new THREE.Group(); scene.add(base);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(46, 2000), new THREE.MeshLambertMaterial({ color: 0x3c3f3c })); strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.4, -300); base.add(strip);
  const lineM = new THREE.MeshBasicMaterial({ color: 0xe8e6d8 });
  for (let z = 640; z > -1280; z -= 80) { const l = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 34), lineM); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.6, z); base.add(l); }
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(260, 420), new THREE.MeshLambertMaterial({ color: 0x565a50 })); apron.rotation.x = -Math.PI / 2; apron.position.set(160, 0.35, 420); base.add(apron);
  const hm = lam(0x6b6f5c), rm = lam(0x4b5140);
  for (let i = 0; i < 3; i++) { base.add(box(60, 18, 50, hm, 220, 9, 560 - i * 90)); base.add(box(64, 3, 54, rm, 220, 19.5, 560 - i * 90)); }
  base.add(box(10, 26, 10, lam(0x8b8a78), 110, 13, 610)); base.add(box(15, 5, 15, lam(0x2f3a3f), 110, 28, 610));
}
// clouds
{
  const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
  const geo = new THREE.SphereGeometry(1, 10, 8); let seed = 99; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const cx = (rr() - 0.5) * 44000, cz = (rr() - 0.5) * 44000, cy = 2300 + rr() * 1400;
    for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(geo, cm); m.position.set(cx + (rr() - 0.5) * 700, cy + rr() * 80, cz + (rr() - 0.5) * 700); m.scale.set(300 + rr() * 400, 70 + rr() * 60, 250 + rr() * 350); scene.add(m); }
  }
}
// target factory
const target = new THREE.Group(); target.visible = false; scene.add(target);
const tgtMat = lam(0x7a5a48), tgtRoof = lam(0x4a4440), tgtBurnt = lam(0x1c1a18);
{
  let seed = 31; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pad = new THREE.Mesh(new THREE.CircleGeometry(190, 24), lam(0x6d6658)); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.3; target.add(pad);
  for (let i = 0; i < 10; i++) { const w = 40 + rr() * 50, d = 30 + rr() * 40, h = 14 + rr() * 16, x = (rr() - 0.5) * 260, z = (rr() - 0.5) * 260; target.add(box(w, h, d, tgtMat, x, h / 2, z)); target.add(box(w + 2, 2, d + 2, tgtRoof, x, h + 1, z)); }
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 60, 10), tgtMat); m.position.set(-60 + i * 60, 30, 20 - i * 30); target.add(m); }
}

// ------------------------------------------------------------------ B-17 model
// painted-metal skin: panel lines, rivets, a bit of grime
function skinTex(base, line, rx, ry) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  let seed = 11; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '0,0,0' : '255,255,220'},${0.02 + rr() * 0.05})`; g.fillRect(rr() * 256, rr() * 256, 20 + rr() * 70, 8 + rr() * 40); }
  g.strokeStyle = line; g.lineWidth = 1.5;
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  g.fillStyle = line; for (let i = 0; i < 256; i += 64) for (let k = 4; k < 256; k += 8) { g.fillRect(i + 4, k, 1.5, 1.5); g.fillRect(k, i + 4, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const plane = new THREE.Group(); scene.add(plane);
const M = {
  body: new THREE.MeshLambertMaterial({ map: skinTex('#5b6338', '#454c2b', 5, 2) }), wing: new THREE.MeshLambertMaterial({ map: skinTex('#5b6338', '#454c2b', 0.35, 0.35) }),
  dark: lam(0x3b4126), metal: lam(0x2a2c2a), grey: lam(0x8d9488), steel: lam(0x1b1c1c), gun: lam(0x4a4e52), gunD: lam(0x30343a), brass: lam(0xc9a04a),
  glass: lam(0xa9d3e6, { transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
  inner: new THREE.MeshLambertMaterial({ map: skinTex('#77845a', '#5f6b47', 6, 3), side: THREE.BackSide }), bulk: lam(0x69754f, { side: THREE.DoubleSide }), rib: lam(0x8c9870),
  floor: lam(0x5a4c36), seat: lam(0x4a3c2c), leather: lam(0x6b4a2e), khaki: lam(0x7d7350), skin: lam(0xd9b08c), yellow: lam(0xd9b23a), wood: lam(0x8a6e45), bomb: lam(0x39402c),
  disc: new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
};
{ // soft star-shaped muzzle flash sprite
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(0.25, 'rgba(255,214,120,.85)'); gr.addColorStop(0.6, 'rgba(255,140,40,.3)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = gr; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? 22 : 62; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.fill();
  g.beginPath(); g.arc(64, 64, 26, 0, 7); g.fill();
  M.glow = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
}
const TAU = Math.PI * 2;
// Fuselage skin from z0 (front) to z1 (back). arcs = [[thetaStart, thetaLength]]; theta 0 = belly, PI/2 = right side, PI = roof.
function shell(g, z0, z1, r0, r1, arcs, yc, inside, outMat = M.body) {
  const out = [];
  for (const [ts, tl] of arcs) {
    const geo = new THREE.CylinderGeometry(r1, r0, z1 - z0, Math.max(4, Math.round(30 * tl / TAU)), 1, true, ts, tl);
    for (const mat of inside ? [outMat, M.inner] : [outMat]) { const m = new THREE.Mesh(geo, mat); m.rotation.x = Math.PI / 2; m.position.set(0, yc, (z0 + z1) / 2); g.add(m); out.push(m); }
  }
  return out;
}
const FULL = [[0, TAU]];
// flat panel cut from an outline: pts in (span or length, chord or height)
function slab(pts, depth, mat) {
  const sh = new THREE.Shape(); pts.forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]));
  return new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.45, bevelSize: 0.12, bevelSegments: 2, steps: 1 }), mat);
}
const ENG_X = [-9.6, -4.9, 4.9, 9.6], wingLE = x => -5.6 + (Math.abs(x) - 1.2) * 0.178;
// Outside of a B-17. full = the player's ship (cut-outs for windows, doors, cockpit; interior skin); otherwise a cheap copy for the formation.
function buildAirframe(g, full) {
  const R = 1.35, r = { props: [], gear: [], doors: [] };
  if (full) {
    shell(g, -8.6, -7.9, R, R, FULL, 0, true);
    shell(g, -7.9, -4.9, R, R, [[Math.PI + 0.68, TAU - 1.36]], 0, true);                 // open roof under the cockpit
    shell(g, -4.9, BAY.z0, R, R, FULL, 0, true);
    shell(g, BAY.z0, BAY.z1, R, R, [[0.62, TAU - 1.24]], 0, true);                        // bomb bay
    r.doors = shell(g, BAY.z0, BAY.z1, R, R, [[-0.62, 1.24]], 0, true, M.metal);
    shell(g, BAY.z1, 3.9, R, R, FULL, 0, true);
    shell(g, 3.9, 4.7, R, R, [[1.95, TAU - 3.9], [TAU - 1.35, 2.7]], 0, true);            // waist windows
    shell(g, 4.7, 5.0, R, R, FULL, 0, true);
    shell(g, 5.0, 5.9, R, R, [[1.95, TAU - 1.11]], 0, true);                              // crew door
    shell(g, 5.9, 6.0, R, R, FULL, 0, true);
    shell(g, 6.0, 11.2, R, 0.76, FULL, 0.25, true);
    shell(g, 11.2, 12.7, 0.76, 0.58, FULL, 0.25, false, M.glass);                         // tail gunner's glazing
  } else {
    shell(g, -8.6, 6, R, R, FULL, 0, false); shell(g, 6, 12.7, R, 0.58, FULL, 0.25, false);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(R - 0.01, 16, 8, 0, TAU, 0, Math.PI / 2), M.glass); nose.rotation.x = -Math.PI / 2; nose.scale.y = 1.8; nose.position.z = -8.6; g.add(nose);
  for (const [z, rad] of [[-8.6, 1.33], [-9.8, 1.16], [-10.6, 0.76]]) { const m = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.035, 5, 24), M.dark); m.position.z = z; g.add(m); }   // nose framing
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const m = box(0.05, 0.05, 2.2, M.dark, Math.sin(a) * 1.02, Math.cos(a) * 1.02, -9.6); m.rotation.set(Math.cos(a) * 0.5, -Math.sin(a) * 0.5, 0); g.add(m); }
  // cockpit greenhouse
  g.add(box(1.8, 1.0, 3, M.glass, 0, 1.55, -6.4)); g.add(box(1.84, 0.06, 2.3, M.body, 0, 2.08, -6.05));
  for (const x of [-0.9, 0.9]) { for (const z of [-7.9, -5.9, -4.9]) g.add(box(0.05, 1.0, 0.05, M.dark, x, 1.55, z)); g.add(box(0.06, 0.06, 3, M.dark, x, 1.05, -6.4)); g.add(box(0.06, 0.06, 3, M.dark, x, 2.05, -6.4)); }
  g.add(box(0.06, 1.0, 0.06, M.dark, 0, 1.55, -7.9)); g.add(box(1.8, 0.06, 0.06, M.dark, 0, 2.05, -7.9));
  // wings: tapered planform, rounded edges; they stop at the fuselage side so nothing cuts through the bomb bay
  for (const s of [-1, 1]) {
    const w = slab([[1.15 * s, -5.6], [15.1 * s, -3.12], [15.7 * s, -2.7], [15.75 * s, -2.1], [15.2 * s, -1.55], [1.15 * s, 1.0]], 0.34, M.wing);
    w.rotation.x = Math.PI / 2; w.position.y = -0.52; g.add(w);
    const st = slab([[0.8 * s, 8.5], [6.2 * s, 9.5], [6.55 * s, 10.2], [6.2 * s, 10.9], [0.75 * s, 11.2]], 0.14, M.wing); st.rotation.x = Math.PI / 2; st.position.y = 0.88; g.add(st);
    const a = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x24406e })); a.rotation.y = s * Math.PI / 2; a.position.set(s * 1.365, 0.15, 2.0); g.add(a);
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.3, 5), new THREE.MeshBasicMaterial({ color: 0xf2f2ec })); b.rotation.set(0, s * Math.PI / 2, Math.PI / 2); b.position.set(s * 1.375, 0.15, 2.0); g.add(b);
  }
  // fin with its long dorsal fillet
  { const f = slab([[4.2, 1.33], [7.5, 2.25], [9.0, 5.35], [9.7, 5.75], [10.7, 5.7], [11.1, 5.2], [11.3, 1.0], [6.0, 1.56]], 0.16, M.wing); f.rotation.y = -Math.PI / 2; f.position.x = 0.08; g.add(f); }
  { // tail number
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#e8c63a'; x.font = '700 50px ui-monospace, Menlo, monospace'; x.textAlign = 'center'; x.fillText(full ? '297680' : '2' + String(31000 + Math.floor(Math.random() * 60000)), 128, 50);
    const t = new THREE.CanvasTexture(c), m = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), m); p.rotation.y = s * Math.PI / 2; p.position.set(s * 0.19, 3.3, 10.1); g.add(p); }
  }
  // engines: nacelle, cowling, spinner, three-blade prop
  for (const x of ENG_X) {
    const z = wingLE(x);
    g.add(cylZ(0.5, 0.78, 3.6, M.body, x, -0.62, z + 1.0, 16)); g.add(cylZ(0.82, 0.86, 0.9, M.dark, x, -0.62, z - 1.2, 18)); g.add(cylZ(0.86, 0.7, 0.18, M.metal, x, -0.62, z - 1.72, 18));
    g.add(cylZ(0.62, 0.62, 0.1, M.steel, x, -0.62, z - 1.6, 14));
    const p = new THREE.Group(); p.position.set(x, -0.62, z - 1.95);
    p.add(cylZ(0.2, 0.05, 0.4, M.grey, 0, 0, 0, 10));
    const blades = new THREE.Group(); for (let i = 0; i < 3; i++) { const b = box(0.2, 1.75, 0.05, M.steel, 0, 0.95, 0), h = new THREE.Group(); b.rotation.y = 0.35; h.add(b); h.add(box(0.2, 0.22, 0.05, M.yellow, 0, 1.76, 0)); h.rotation.z = i * TAU / 3; blades.add(h); } p.add(blades);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.88, 24), M.disc); p.add(disc);
    g.add(p); r.props.push({ blades, disc, a: Math.random() * 6 });
  }
  for (const s of SEATS) if (s.key === 'top' || s.key === 'ball') {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), M.glass); d.position.fromArray(s.gun.pos); d.position.y += s.key === 'top' ? -0.5 : 0.5; g.add(d);
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 5, 20), M.metal); b.rotation.x = Math.PI / 2; b.position.copy(d.position); g.add(b);
  }
  g.add(box(0.03, 0.9, 0.03, M.metal, 0, 1.8, 0.2)); g.add(box(0.02, 0.02, 9.2, M.metal, 0, 2.25, 4.8)).rotation.x = -0.3;      // radio mast and aerial
  if (full) {
    for (const x of [-4.9, 4.9]) {
      const w = new THREE.Group(); w.add(box(0.2, 1.7, 0.2, M.grey, x, -1.45, -3.6)); w.add(box(0.1, 1.5, 0.1, M.grey, x, -1.35, -2.9)).rotation.x = 0.7;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.5, 18), M.steel); t.rotation.z = Math.PI / 2; t.position.set(x, -2.15, -3.6); w.add(t);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.54, 12), M.grey); h.rotation.z = Math.PI / 2; h.position.copy(t.position); w.add(h); g.add(w); r.gear.push(w);
    }
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12), M.steel); tw.rotation.z = Math.PI / 2; tw.position.set(0, -1.2, 9.5); g.add(tw); r.gear.push(tw);
  }
  return r;
}
// A jointed crewman. Origin at the feet (or the seat floor); faces -z.
function makeCrew(jacket = M.leather) {
  const g = new THREE.Group(), hips = new THREE.Group(); g.add(hips);
  hips.add(box(0.44, 0.56, 0.24, jacket, 0, 0.3, 0)); hips.add(box(0.3, 0.3, 0.06, M.yellow, 0, 0.36, -0.14));      // jacket, life vest
  hips.add(box(0.46, 0.12, 0.26, M.khaki, 0, 0, 0));
  const head = new THREE.Group(); head.position.y = 0.72; hips.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), M.skin));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 6, 0, TAU, 0, Math.PI * 0.55), M.seat); cap.rotation.x = 0.25; head.add(cap);
  head.add(box(0.2, 0.05, 0.06, M.steel, 0, 0.03, -0.11)); head.add(box(0.05, 0.1, 0.1, M.seat, -0.12, -0.02, 0)); head.add(box(0.05, 0.1, 0.1, M.seat, 0.12, -0.02, 0));
  const arms = [], thighs = [], shins = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * 0.28, 0.52, 0); a.add(box(0.11, 0.34, 0.12, jacket, 0, -0.15, 0)); const fa = new THREE.Group(); fa.position.y = -0.32; fa.add(box(0.1, 0.3, 0.1, jacket, 0, -0.13, 0)); fa.add(box(0.09, 0.09, 0.09, M.seat, 0, -0.3, 0)); a.add(fa); a.userData.fore = fa; hips.add(a); arms.push(a);
    const t = new THREE.Group(); t.position.set(s * 0.12, -0.04, 0); t.add(box(0.16, 0.44, 0.17, M.khaki, 0, -0.2, 0));
    const sh = new THREE.Group(); sh.position.y = -0.42; sh.add(box(0.14, 0.42, 0.15, M.khaki, 0, -0.2, 0)); sh.add(box(0.15, 0.1, 0.26, M.seat, 0, -0.4, -0.05)); t.add(sh); hips.add(t); thighs.push(t); shins.push(sh);
  }
  g.userData = { hips, head, arms, thighs, shins, ph: Math.random() * 6 };
  g.scale.setScalar(0.9); poseCrew(g, 0, 0.1);
  return g;
}
// sit: 0 standing .. 1 seated; reach: arms forward
function poseCrew(f, sit, reach) {
  const u = f.userData;
  u.hips.position.y = 0.9 - sit * 0.42;
  for (let i = 0; i < 2; i++) { u.thighs[i].rotation.x = sit * 1.45; u.shins[i].rotation.x = -sit * 1.45; u.arms[i].rotation.x = reach * 0.9; u.arms[i].userData.fore.rotation.x = reach * 0.7; }
}
// A .50 calibre machine gun (or a pair). Pivot at the mount, barrels along -z.
function makeGun(twin) {
  const t = new THREE.Group(), rec = new THREE.Group(), flashes = []; t.add(rec);
  for (const x of twin ? [-0.2, 0.2] : [0]) {
    rec.add(box(0.09, 0.13, 0.5, M.gun, x, 0, 0.02)); rec.add(box(0.07, 0.03, 0.3, M.gunD, x, 0.08, 0)); rec.add(box(0.03, 0.05, 0.05, M.gunD, x + 0.06, 0.02, -0.1));                        // receiver, top cover
    rec.add(cylZ(0.042, 0.042, 0.5, M.gunD, x, 0, -0.49, 10)); for (let k = 0; k < 5; k++) rec.add(cylZ(0.046, 0.046, 0.03, M.gun, x, 0, -0.3 - k * 0.09, 10)); rec.add(cylZ(0.02, 0.02, 0.75, M.gun, x, 0, -1.1, 8)); rec.add(cylZ(0.03, 0.03, 0.08, M.gunD, x, 0, -1.47, 8));
    for (const s of [-1, 1]) rec.add(box(0.025, 0.12, 0.03, M.wood, x + s * 0.04, 0, 0.33)); rec.add(box(0.11, 0.025, 0.025, M.steel, x, 0, 0.3));   // spade grips
    const fl = new THREE.Group(); fl.position.set(x, 0, -1.55);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.flash); core.scale.set(1, 1, 4); fl.add(core);
    fl.add(new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), M.glow)); { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), M.glow); p.rotation.y = Math.PI / 2; fl.add(p); }
    fl.visible = false; t.add(fl); flashes.push(fl);
  }
  if (twin) rec.add(box(0.32, 0.05, 0.1, M.gunD, 0, -0.02, 0.1)); else { rec.add(box(0.2, 0.22, 0.3, M.dark, 0.2, -0.12, 0.05)); rec.add(box(0.12, 0.02, 0.06, M.brass, 0.08, 0.02, 0.05)); }   // yoke / ammo can and belt
  { const s = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 4, 14), M.steel); s.position.set(0, 0.16, -0.2); rec.add(s); rec.add(box(0.008, 0.1, 0.008, M.steel, 0, 0.1, -0.2)); }   // ring sight
  t.userData = { rec, flashes, kick: 0, flashT: 0, n: 0 };
  return t;
}
const turrets = [], crewFig = [], playerFig = [], bayBombs = [], yokes = [], holes = new THREE.Group();
let air, doorFlaps, ladder, hatch;
// where each crewman sits or stands at his station, and where he waits when a player takes over: [x, y, z, facing, sit]
const FIG = {
  pilot: { at: [-0.62, 0.2, -6.45, 0, 1], aside: [-0.2, 0.05, -5.3, 0.5, 0] }, bomb: { at: [0, -0.98, -9.15, 0, 1], aside: [0.4, -0.98, -8.35, 1.0, 0.5] },
  top: { at: [0, -0.86, -4.0, 0, 0], aside: [0.42, -0.98, -4.5, 0.9, 0] }, ball: { at: [0, -1.2, 3.3, 0, 1], aside: [0.48, -0.98, 2.95, 0.8, 0], hide: true },
  lw: { at: [-0.86, -0.95, 4.55, Math.PI / 2, 0], aside: [-0.5, -0.98, 5.3, 0.4, 0] }, rw: { at: [0.86, -0.95, 4.05, -Math.PI / 2, 0], aside: [0.5, -0.98, 3.4, -2.7, 0] },
  tail: { at: [0, -0.7, 10.75, Math.PI, 1], aside: [0, -0.62, 9.3, Math.PI, 0.7] },
};
{
  air = buildAirframe(plane, true);
  // ---- interior
  const add = m => { plane.add(m); return m; };
  const ring = (z, arc = TAU, rad = 1.31, y = 0) => { const m = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.03, 5, 28, arc), M.rib); m.position.set(0, y, z); add(m); };
  for (const z of [-4.5, -3.8, 1.3, 2.0, 3.2, 3.85, 4.75, 4.97, 5.95]) ring(z);
  for (const z of [-2.1, -1.2, -0.3]) ring(z, Math.PI);                                                // roof frames over the bomb bay
  for (const z of [7.2, 8.4, 9.6, 10.8]) ring(z, TAU, 1.31 - (z - 6) * 0.1135, 0.25);
  for (const a of [0.5, 1.0]) for (const s of [-1, 1]) add(box(0.04, 0.04, 10.9, M.rib, s * 1.3 * Math.sin(a), 1.3 * Math.cos(a), 0.55));   // stringers
  // bulkheads with wide, arched doorways
  const bulkhead = (z, rad, y, top) => {
    const sh = new THREE.Shape(); sh.absarc(0, 0, rad, 0, TAU, false);
    const h = new THREE.Path(); h.moveTo(-0.52, -0.95 - y); h.lineTo(0.52, -0.95 - y); h.lineTo(0.52, top - 0.25 - y); h.quadraticCurveTo(0.5, top - y, 0, top - y); h.quadraticCurveTo(-0.5, top - y, -0.52, top - 0.25 - y); h.closePath(); sh.holes.push(h);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 20), M.bulk); m.position.set(0, y, z); add(m);
  };
  bulkhead(BAY.z0, 1.33, 0, 1.0); bulkhead(BAY.z1, 1.33, 0, 1.0); bulkhead(2.6, 1.33, 0, 1.0); bulkhead(6.3, 1.29, 0.25, 0.8);
  // floors
  add(box(1.9, 0.05, 1.6, M.floor, 0, -0.98, -3.8)); add(box(1.9, 0.05, 5.7, M.floor, 0, -0.98, 3.45)); add(box(1.9, 0.05, 1.4, M.floor, 0, -0.98, -8.6));
  add(box(0.9, 0.05, 4.6, M.floor, 0, -0.62, 8.7));
  // nose: bombsight, bombardier's seat, chart table
  add(box(0.3, 0.35, 0.4, M.metal, 0, -0.55, -10.0)); add(cylZ(0.07, 0.07, 0.3, M.grey, 0, -0.3, -10.1, 8)); add(box(0.4, 0.1, 0.4, M.seat, 0, -0.6, -9.2));
  add(box(0.4, 0.04, 0.8, M.wood, -0.85, -0.3, -8.6));
  // flight deck
  add(box(2.6, 0.06, 2.6, M.floor, 0, 0.02, -6.25));
  for (const s of [-1, 1]) {
    add(box(0.95, 1.1, 0.05, M.bulk, s * 0.85, 0.57, -7.55)); add(box(0.95, 1.0, 0.05, M.bulk, s * 0.85, -0.45, -4.95));
    add(box(0.46, 0.12, 0.5, M.seat, s * 0.62, 0.58, -6.5)); add(box(0.46, 0.75, 0.08, M.seat, s * 0.62, 0.95, -6.2)); add(box(0.36, 0.5, 0.4, M.metal, s * 0.62, 0.28, -6.5));
    const y = new THREE.Group(); y.position.set(s * 0.62, 0.4, -7.25); y.add(box(0.05, 0.75, 0.05, M.metal, 0, 0.37, 0));
    const wh = new THREE.Group(); wh.position.set(0, 0.76, 0.03); const tor = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 5, 14, Math.PI * 1.3), M.steel); tor.rotation.z = -Math.PI * 0.15; wh.add(tor); wh.add(box(0.3, 0.03, 0.03, M.steel, 0, 0, 0)); y.add(wh); y.userData.wheel = wh; add(y); yokes.push(y);
    add(box(0.14, 0.3, 0.5, M.metal, s * 0.2, 0.6, -7.3));                                           // side consoles
  }
  for (let i = 0; i < 4; i++) add(box(0.025, 0.2, 0.025, i < 2 ? M.yellow : M.grey, -0.06 + i * 0.04, 0.95, -7.42)).rotation.x = -0.5;   // throttles
  add(box(0.24, 0.5, 0.3, M.metal, 0, 0.62, -7.45));
  add(box(0.6, 0.3, 0.3, M.floor, 0, -0.7, -4.75)); add(box(0.6, 0.3, 0.3, M.floor, 0, -0.3, -4.95));   // steps up to the deck
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#1b1d1a'; x.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 12; i++) { const cx = 34 + (i % 6) * 54 + (i % 6 > 2 ? 150 : 0), cy = 36 + Math.floor(i / 6) * 56; x.fillStyle = '#0a0a0a'; x.beginPath(); x.arc(cx, cy, 21, 0, 7); x.fill(); x.strokeStyle = '#c9c3a4'; x.lineWidth = 2; x.stroke(); x.strokeStyle = '#f3eed6'; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(i * 1.9) * 16, cy + Math.sin(i * 1.9) * 16); x.stroke(); for (let k = 0; k < 12; k++) { x.fillStyle = '#c9c3a4'; x.fillRect(cx + Math.cos(k * 0.52) * 18 - 0.5, cy + Math.sin(k * 0.52) * 18 - 0.5, 1.5, 1.5); } }
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 3 ? '#8d9488' : '#a33a2a'; x.fillRect(200 + (i % 4) * 28, 22 + Math.floor(i / 4) * 46, 12, 30); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.4), new THREE.MeshBasicMaterial({ map: tex })); p.position.set(0, 1.28, -7.72); add(p);
    add(box(1.72, 0.42, 0.05, M.metal, 0, 1.28, -7.76)); add(box(1.72, 0.05, 0.25, M.metal, 0, 1.5, -7.68));
  }
  // top turret: standing platform and ring
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 14), M.metal)).position.set(0, -0.9, -4.0);
  { const m = add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 5, 18), M.metal)); m.rotation.x = Math.PI / 2; m.position.set(0, 1.28, -4.0); }
  // bomb bay: wide catwalk with rope rails, racks, bombs
  add(box(0.7, 0.08, BAY.z1 - BAY.z0, M.metal, 0, -0.99, (BAY.z0 + BAY.z1) / 2));
  for (const s of [-1, 1]) {
    for (const z of [-2.75, -1.2, 0.35]) add(box(0.05, 2.1, 0.05, M.grey, s * 0.5, 0.05, z));
    add(box(0.02, 0.02, 3.1, M.wood, s * 0.5, -0.1, -1.2));
    for (const y of [-0.5, 0.25]) for (const z of [-2.05, -0.4]) {
      const b = new THREE.Group(); b.add(cylZ(0.2, 0.2, 1.1, M.bomb, 0, 0, 0, 12)); b.add(cylZ(0.2, 0.03, 0.32, M.bomb, 0, 0, -0.71, 12)); b.add(cylZ(0.205, 0.205, 0.06, M.yellow, 0, 0, -0.5, 12)); b.add(cylZ(0.12, 0.2, 0.3, M.bomb, 0, 0, 0.7, 12)); b.add(box(0.44, 0.02, 0.25, M.bomb, 0, 0, 0.78)); b.add(box(0.02, 0.44, 0.25, M.bomb, 0, 0, 0.78));
      b.add(box(0.1, 0.06, 0.06, M.grey, -s * 0.2, 0.1, 0));
      b.position.set(s * 0.8, y, z); add(b); bayBombs.push(b);
    }
  }
  doorFlaps = new THREE.Group(); for (const s of [-1, 1]) doorFlaps.add(box(0.05, 0.85, BAY.z1 - BAY.z0, M.metal, s * 0.84, -1.6, (BAY.z0 + BAY.z1) / 2)); add(doorFlaps);
  // radio room
  add(box(0.42, 0.04, 1.1, M.wood, -0.82, -0.25, 1.6)); add(box(0.3, 0.34, 0.5, M.metal, -0.85, -0.05, 1.45)); add(box(0.02, 0.2, 0.3, M.brass, -0.69, -0.05, 1.45)); add(box(0.3, 0.08, 0.3, M.seat, -0.78, -0.55, 2.25));
  for (const z of [1.0, 1.6, 2.2]) add(cylZ(0.11, 0.11, 0.5, M.yellow, 0.95, 0.25, z, 10));
  // ball turret hanger
  for (const x of [-0.62, 0.62]) add(box(0.06, 2.2, 0.06, M.grey, x, 0.1, 3.3));
  { const m = add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 5, 18), M.metal)); m.rotation.x = Math.PI / 2; m.position.set(0, -0.93, 3.3); }
  // waist: gun posts, ammo boxes with belts
  for (const s of [-1, 1]) { add(box(0.05, 0.6, 0.05, M.grey, s * 1.2, -0.25, 4.3)); add(box(0.36, 0.3, 0.6, M.wood, s * 0.8, -0.8, s < 0 ? 5.5 : 3.0)); add(box(0.1, 0.02, 0.5, M.brass, s * 0.8, -0.64, s < 0 ? 5.5 : 3.0)); }
  // crew door and ladder (ladder only when parked)
  hatch = add(box(0.05, 1.4, 0.9, M.body, 1.3, -0.2, DOOR.z));
  ladder = new THREE.Group(); for (const z of [-0.25, 0.25]) ladder.add(box(0.05, 2.2, 0.05, M.grey, 1.36, -1.9, DOOR.z + z)); for (let i = 0; i < 5; i++) ladder.add(box(0.05, 0.04, 0.5, M.grey, 1.36, -1.0 - i * 0.42, DOOR.z)); add(ladder);
  add(box(0.36, 0.1, 0.36, M.seat, 0, -0.3, 10.7));                                                    // tail gunner's seat
  add(holes);
  // guns
  SEATS.forEach(s => {
    if (!s.gun) { turrets.push(null); return; }
    const t = makeGun(s.key !== 'lw' && s.key !== 'rw'); t.position.fromArray(s.gun.pos); plane.add(t); turrets.push(t);
  });
  // the bot crew, plus a stand-in for every other player sitting at a station
  SEATS.forEach(s => {
    const f = FIG[s.key], m = makeCrew(), pf = makeCrew(M.khaki);
    m.userData.a = 0; m.userData.def = f; add(m); crewFig.push(m);
    pf.position.set(f.at[0], f.at[1], f.at[2]); pf.rotation.y = f.at[3]; poseCrew(pf, f.at[4], 1); pf.visible = false; add(pf); playerFig.push(pf);
  });
  const co = makeCrew(); co.position.set(0.62, 0.2, -6.45); poseCrew(co, 1, 1); add(co); crewFig.copilot = co;
  plane.position.set(0, 3, 500);
}
const props = air.props, gearParts = air.gear;
const engSmokePos = ENG_X.map(x => new THREE.Vector3(x, -0.4, wingLE(x) + 2));
function spinProps(list, dt, rate, on) { list.forEach((p, i) => { const run = on(i); if (run) p.a += dt * rate; p.blades.rotation.z = p.a; p.disc.visible = run; }); }
function makeWingman() { const g = new THREE.Group(); g.userData.air = buildAirframe(g, false); return g; }

function makeFighter() {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const b = lam(0x77858c), d = lam(0x4f5a60);
  inner.add(cylZ(0.65, 0.4, 8, b, 0, 0, 0.5, 8));
  const n = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.6, 8), lam(0xe0c03a)); n.rotation.x = -Math.PI / 2; n.position.z = -4.3; inner.add(n);
  inner.add(box(10, 0.16, 1.9, b, 0, -0.3, -0.6)); inner.add(box(3.4, 0.12, 1.1, d, 0, 0.1, 4)); inner.add(box(0.14, 1.5, 1.2, d, 0, 0.7, 4)); inner.add(box(0.7, 0.5, 1.6, lam(0x2a3336), 0, 0.6, -0.6));
  for (const x of [-3.4, 3.4]) { inner.add(box(0.9, 0.02, 0.25, new THREE.MeshBasicMaterial({ color: 0x111111 }), x, -0.2, -0.6)); inner.add(box(0.25, 0.02, 0.9, new THREE.MeshBasicMaterial({ color: 0x111111 }), x, -0.2, -0.6)); }
  inner.rotation.y = Math.PI;   // lookAt points +Z at the target
  g.scale.setScalar(1.3);
  return g;
}
function makeBomb() { const m = cylZ(0.35, 0.35, 1.8, lam(0x2c2f2a), 0, 0, 0, 8); m.scale.setScalar(1.6); return m; }
function makeChute() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.SphereGeometry(3.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), lam(0xf0ead8, { side: THREE.DoubleSide })); c.position.y = 5; g.add(c);
  g.add(box(0.5, 1.6, 0.4, lam(0x5a4a32), 0, 0, 0)); g.userData.canopy = c;
  return g;
}

// ------------------------------------------------------------------ effects
const tracers = [], tracerGeo = new THREE.BoxGeometry(0.3, 0.3, 22);
const tmA = new THREE.MeshBasicMaterial({ color: 0xfff0a0 }), tmE = new THREE.MeshBasicMaterial({ color: 0xff6a4a });
for (let i = 0; i < 220; i++) { const m = new THREE.Mesh(tracerGeo, tmA); m.visible = false; scene.add(m); tracers.push({ m, v: new THREE.Vector3(), life: 0 }); }
let tracerIdx = 0;
function spawnTracer(o, v, enemy) {
  const t = tracers[tracerIdx = (tracerIdx + 1) % tracers.length];
  t.m.material = enemy ? tmE : tmA; t.m.position.copy(o); t.v.copy(v); t.life = enemy ? 0.9 : 1.1; t.age = 0; t.m.scale.set(1, 1, 1); t.m.visible = true;
  t.m.lookAt(o.x + v.x, o.y + v.y, o.z + v.z);
}
const puffs = [], puffGeo = new THREE.SphereGeometry(1, 7, 5);
for (let i = 0; i < 420; i++) { const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, depthWrite: false })); m.visible = false; scene.add(m); puffs.push({ m, life: 0, max: 1, grow: 1, vy: 0 }); }
let puffIdx = 0;
function puff(x, y, z, size, life, color, grow = 2, vy = 2) {
  const p = puffs[puffIdx = (puffIdx + 1) % puffs.length];
  p.m.position.set(x, y, z); p.m.scale.setScalar(size); p.m.material.color.set(color); p.life = p.max = life; p.grow = grow; p.vy = vy; p.m.visible = true;
}
function explosion(x, y, z, size) {
  for (let i = 0; i < 6; i++) puff(x + (Math.random() - 0.5) * size, y + Math.random() * size * 0.6, z + (Math.random() - 0.5) * size, size * 0.5, 0.5 + Math.random() * 0.4, i % 2 ? 0xffb347 : 0xff6a2a, 3, 4);
  for (let i = 0; i < 5; i++) puff(x + (Math.random() - 0.5) * size, y + Math.random() * size, z + (Math.random() - 0.5) * size, size * 0.6, 2.5 + Math.random() * 2, 0x3a3836, 0.9, 6);
  boomSound(size);
}
// spent brass flying out of a gun
const casings = [], casingGeo = new THREE.BoxGeometry(0.025, 0.025, 0.09);
for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(casingGeo, M.brass); m.visible = false; scene.add(m); casings.push({ m, v: new THREE.Vector3(), life: 0 }); }
let casingIdx = 0;
function spawnCasing(o, v) { const c = casings[casingIdx = (casingIdx + 1) % casings.length]; c.m.position.copy(o); c.v.copy(v); c.life = 1.1; c.m.visible = true; c.m.rotation.set(Math.random() * 6, Math.random() * 6, 0); }
function sparks(x, y, z, n, size) { for (let i = 0; i < n; i++) puff(x + (Math.random() - 0.5) * size * 3, y + (Math.random() - 0.5) * size * 3, z + (Math.random() - 0.5) * size * 3, size * (0.5 + Math.random()), 0.12 + Math.random() * 0.2, i % 2 ? 0xfff2b0 : 0xffb347, 5, 0); }
function flakBurst(x, y, z) {
  sparks(x, y, z, 3, 3);
  for (let i = 0; i < 7; i++) puff(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 10, z + (Math.random() - 0.5) * 14, 5 + Math.random() * 5, 5 + Math.random() * 4, 0x121212, 0.25, 0.6);
  const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  thump(70, 0.5, clamp(60 / d, 0.04, 0.5)); noise(0.5, 500, clamp(40 / d, 0.02, 0.4));
  if (d < 120) shake = Math.max(shake, 0.5 * (1 - d / 120));
}
function updEffects(dt) {
  for (const c of casings) if (c.life > 0) { c.life -= dt; c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += 14 * dt; if (c.life <= 0) c.m.visible = false; }
  for (const t of tracers) if (t.life > 0) { t.life -= dt; t.age += dt; const k = 1 + t.age * 14; t.m.scale.set(k, k, 1 + t.age * 5); t.m.position.addScaledVector(t.v, dt); if (t.life <= 0 || t.m.position.y < 0) { t.life = 0; t.m.visible = false; } }
  for (const p of puffs) if (p.life > 0) {
    p.life -= dt; p.m.position.y += p.vy * dt; p.m.scale.multiplyScalar(1 + p.grow * dt);
    p.m.material.opacity = 0.6 * Math.max(0, p.life / p.max); if (p.life <= 0) p.m.visible = false;
  }
}

// ------------------------------------------------------------------ audio
let ac = null, engGain = null, engOsc = [], noiseBuf = null, windGain = null, windFilt = null;
function initAudio() {
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    engGain = ac.createGain(); engGain.gain.value = 0; lp.connect(engGain); engGain.connect(ac.destination);
    for (const f of [48, 73, 97.5]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); engOsc.push(o); }
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const w = ac.createBufferSource(); w.buffer = noiseBuf; w.loop = true; windFilt = ac.createBiquadFilter(); windFilt.type = 'bandpass'; windFilt.frequency.value = 500; windFilt.Q.value = 0.6;
    windGain = ac.createGain(); windGain.gain.value = 0; w.connect(windFilt); windFilt.connect(windGain); windGain.connect(ac.destination); w.start();
  } catch { ac = null; }
}
function noise(dur, freq, vol) {
  if (!ac) return;
  const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  s.connect(f); f.connect(g); g.connect(ac.destination); s.start(0, Math.random() * 0.5, dur);
}
function thump(freq, dur, vol, type = 'sine') {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(freq, ac.currentTime); o.frequency.exponentialRampToValueAtTime(freq * 0.5, ac.currentTime + dur);
  g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
}
// a .50 cal: sharp crack plus a heavy thud
const gunSound = vol => { noise(0.08, 3200, vol); thump(95, 0.09, vol * 1.3, 'square'); };
const radioClick = () => { noise(0.05, 4000, 0.05); thump(1400, 0.04, 0.03); };
const footstep = () => { noise(0.06, 700, 0.1); thump(150, 0.06, 0.08); };
const boomSound = size => noise(1.2, 300, clamp(size / 60, 0.1, 0.5));

// ------------------------------------------------------------------ network + state
let ws = null, myId = 0, roomCode = '', snaps = [], latest = null;
let mySeat = -1, lastSeat = -2, bailed = false, aim = { ay: 0, ap: 0 }, bombsight = false, cockpit = true;
let foot = null;   // {x, z, yaw, pitch} walking on the field (world)
let walk = null;   // {x, z, yaw, pitch} walking inside the fuselage (plane-local)
let menu = false;  // crew orders menu open
let missions = +store.get('b17.missions', 0) || 0, creditedMid = 0, resHide = 0;
const msgs = []; let hitFlash = 0, shake = 0, hitMark = 0, fade = 0, stepDist = 0, bob = 0, holeMid = 0;
const plook = { yaw: 0, pitch: 0 };   // pilot's head
const keys = {}; let mouseFire = false;

$('rank').textContent = `${rankName(missions)} (${missions} mission${missions === 1 ? '' : 's'})`;
$('name').value = store.get('b17.name', '');
$('room').value = (location.hash || '').slice(1).toUpperCase();
$('join').onclick = join;
for (const id of ['name', 'room']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') join(); e.stopPropagation(); });

function join() {
  if (ws) return;
  const name = $('name').value.trim() || 'Rookie'; store.set('b17.name', name);
  initAudio();
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, missions, room: $('room').value }));
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'welcome') { myId = m.id; roomCode = m.room; location.hash = roomCode; $('lobby').classList.add('hidden'); addMsg(`Crew code ${roomCode}: share this page's link so friends can join.`); }
    else if (m.t === 'err') { $('err').textContent = m.s; ws.close(); }
    else if (m.t === 's') onSnap(m);
  };
  ws.onclose = () => { const was = myId; ws = null; myId = 0; snaps = []; latest = null; foot = walk = null; $('lobby').classList.remove('hidden'); $('result').classList.add('hidden'); if (was) $('err').textContent = 'Connection lost. Rejoin to continue.'; };
}
const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
function addMsg(s, r) { msgs.push({ s, r, t: performance.now() }); if (msgs.length > 7) msgs.shift(); }

function onSnap(m) {
  m.rt = performance.now(); snaps.push(m); if (snaps.length > 6) snaps.shift(); latest = m;
  for (const e of m.ev) {
    if (e.k === 'msg') { addMsg(e.s, e.r); if (e.r) radioClick(); }
    else if (e.k === 'boom') explosion(e.x, 0, e.z, 45);
    else if (e.k === 'kill') explosion(e.x, e.y, e.z, 14);
    else if (e.k === 'crash') explosion(e.x, e.y, e.z, 40);
    else if (e.k === 'hit') { hitFlash = 0.35; shake = 0.35; noise(0.12, 2500, 0.3); thump(220, 0.15, 0.25, 'triangle'); bulletHole(m.mid); }
    else if (e.k === 'flak') flakBurst(e.x, e.y, e.z);
    else if (e.k === 'fhit') { const f = m.f.find(f => f[0] === e.id); if (f) { sparks(f[1], f[2], f[3], 5, 1.6); puff(f[1], f[2], f[3], 2, 0.8, 0x555555, 2, 0); } if (mySeat > 0 && m.st[mySeat][6]) { hitMark = 0.18; noise(0.04, 5000, 0.12); } }
  }
  // result screen + rank. After a landing the card goes away so the crew can walk around.
  if (m.ph === 'ended' && m.res) {
    if (creditedMid !== m.mid) {
      creditedMid = m.mid; const me = m.res.players.find(p => p.id === myId);
      if (me) { missions = me.missions; store.set('b17.missions', missions); }
      showResult(m.res); resHide = m.res.outcome === 'lost' ? Infinity : m.rt + 9000;
    }
    $('resNext').textContent = `Next mission in ${m.endT}s. Press N to go now.`;
    if (m.rt > resHide) $('result').classList.add('hidden');
  } else $('result').classList.add('hidden');
}
// a new hole in the skin: daylight shows through, something sparks inside
function bulletHole(mid) {
  if (mid !== holeMid) { holeMid = mid; holes.clear(); }
  if (holes.children.length > 40) return;
  const a = (0.7 + Math.random() * 2.0) * (Math.random() < 0.5 ? 1 : -1), z = -4.6 + Math.random() * 10.4, r = 1.325;
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.02 + Math.random() * 0.03, 6), new THREE.MeshBasicMaterial({ color: 0xe6f4ff, side: THREE.DoubleSide }));
  m.position.set(r * Math.sin(a), -r * Math.cos(a), z); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-Math.sin(a), Math.cos(a), 0)); holes.add(m);
  v1.copy(m.position).multiplyScalar(0.9).applyMatrix4(plane.matrixWorld); sparks(v1.x, v1.y, v1.z, 4, 0.05);
}
function showResult(res) {
  const T = { success: ['MISSION ACCOMPLISHED', 'Target destroyed and the ship is home. Everyone aboard is promoted.'], aborted: ['MISSION ABORTED', 'You made it back, but the target is still standing. No promotion.'],
    ditched: ['FORCED LANDING', 'The crew survived, but she never made it back to base.'], lost: ['AIRCRAFT LOST', 'The Fortress went down.'] }[res.outcome];
  $('resTitle').textContent = T[0];
  $('resText').textContent = `${T[1]} Fighters shot down: ${res.kills} by your crew, ${res.fkills} by the formation. Fortresses lost from the formation: ${res.lost}.`;
  $('resRows').innerHTML = '';
  for (const p of res.players) {
    const row = document.createElement('div'); row.className = 'row';
    const a = document.createElement('span'); a.textContent = p.name + (p.id === myId ? ' (you)' : '');
    const b = document.createElement('span');
    b.textContent = { credit: `Promoted to ${rankName(p.missions)}`, kia: 'Killed in action', bailed: 'Bailed out, survived', none: `Remains ${rankName(p.missions)}` }[p.status];
    b.className = p.status === 'credit' ? 'good' : p.status === 'kia' ? 'bad' : '';
    row.append(a, b); $('resRows').append(row);
  }
  $('result').classList.remove('hidden');
}

const lerp = (a, b, t) => a + (b - a) * t, lerpA = (a, b, t) => a + wrap(b - a) * t;
function interp(now) {
  if (!latest) return null;
  const rt = now - 110; let a = snaps[0], b = snaps[0];
  for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].rt <= rt) { a = snaps[i]; b = snaps[i + 1] || a; break; }
  const t = b === a ? 0 : clamp((rt - a.rt) / (b.rt - a.rt), 0, 1), pa = a.pl, pb = b.pl;
  const S = { ...b, pl: { ...pb } };
  if (a.mid === b.mid) {
    for (const k of ['x', 'y', 'z', 'spd', 'vy', 'thr', 'fuel']) S.pl[k] = lerp(pa[k], pb[k], t);
    for (const k of ['yaw', 'pitch', 'roll']) S.pl[k] = lerpA(pa[k], pb[k], t);
    const li = (A, B, n0, n = 3) => B.map(e => { const o = A.find(x => x[0] === e[0]); if (!o) return e; const r = e.slice(); for (let i = n0; i < n0 + n; i++) r[i] = lerp(o[i], e[i], t); return r; });
    S.f = li(a.f, b.f, 1); S.b = li(a.b, b.b, 1); S.c = li(a.c, b.c, 1); S.w = li(a.w, b.w, 1); S.wk = li(a.wk, b.wk, 1, 2);
    S.sl = b.sl.map((v, i) => i < 3 ? lerp(a.sl[i], v, t) : v);
    S.st = b.st.map((s, i) => { const r = s.slice(); r[4] = lerpA(a.st[i][4], s[4], t); r[5] = lerp(a.st[i][5], s[5], t); return r; });
  }
  return S;
}

// ------------------------------------------------------------------ input
// the station a walking crewman is standing next to
function nearSeat() {
  if (!walk) return -1;
  let best = -1, bd = 1.1;
  SEATS.forEach((s, i) => { const d = Math.hypot(walk.x - s.st[0], walk.z - s.st[1]); if (d < bd) { bd = d; best = i; } });
  return best;
}
// the live fighter closest to the middle of the screen
function markedFighter() {
  if (!latest) return 0;
  let best = 0, bd = 260;
  for (const f of latest.f) { if (f[7] & 2) continue; const p = project(f[1], f[2], f[3]); if (p.behind) continue; const d = Math.hypot(p.x - W / 2, p.y - H / 2); if (d < bd) { bd = d; best = f[0]; } }
  return best;
}
function giveOrder(n) {
  if (n === 4) { const id = markedFighter(); if (!id) return addMsg('Look at a fighter first, then give the order.'); send({ t: 'act', a: 'order', n, id }); }
  else send({ t: 'act', a: 'order', n });
}
addEventListener('keydown', e => {
  if (!myId) return;
  const k = e.key.toLowerCase(); if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
  if (keys[k]) return; keys[k] = true;
  if (k === 'c') menu = !menu;
  else if (k === 'escape') menu = false;
  else if (menu && k >= '0' && k <= '9') { giveOrder(+k); menu = false; }
  else if (k >= '1' && k <= String(SEATS.length)) send({ t: 'seat', i: +k - 1 });
  else if (k === 'f') send({ t: 'act', a: foot ? 'board' : walk ? 'out' : 'up' });
  else if (k === 'e' && walk) { const i = nearSeat(); if (i >= 0) send({ t: 'seat', i }); }
  else if (k === 'g') send({ t: 'act', a: 'gear' });
  else if (k === 'o') send({ t: 'act', a: 'doors' });
  else if (k === 'n') send({ t: 'act', a: 'next' });
  else if (k === 'r') giveOrder(4);
  else if (k === 'v') cockpit = !cockpit;
  else if (k === 'b' && mySeat === 1) bombsight = !bombsight;
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseFire = false; });
hud.style.pointerEvents = 'none';
$('gl').addEventListener('mousedown', () => { if (!myId) return; if (document.pointerLockElement !== $('gl')) $('gl').requestPointerLock?.(); mouseFire = true; });
addEventListener('mouseup', () => { mouseFire = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== $('gl')) return;
  const w = foot || walk;
  if (w) { w.yaw -= e.movementX * 0.0025; w.pitch = clamp(w.pitch - e.movementY * 0.0025, -1.3, 1.3); return; }
  if (mySeat === 0) { plook.yaw = clamp(plook.yaw - e.movementX * 0.0025, -2.5, 2.5); plook.pitch = clamp(plook.pitch - e.movementY * 0.0025, -1.0, 1.1); return; }
  if (mySeat < 1) return;
  const s = bombsight ? 0 : 0.0022; aim.ay -= e.movementX * s; aim.ap -= e.movementY * s;
});
const K = (...ks) => ks.some(k => keys[k]) ? 1 : 0;
setInterval(() => {
  if (!myId) return;
  if (foot) { send({ t: 'in', fx: foot.x, fz: foot.z, fy: foot.yaw }); return; }
  if (walk) { send({ t: 'in', lx: walk.x, lz: walk.z, ly: walk.yaw }); return; }
  if (mySeat < 0) return;
  const m = { t: 'in', p: 0, r: 0, y: 0, th: 0, br: 0, ay: aim.ay, ap: aim.ap, f: 0, d: 0 };
  if (mySeat === 0) { m.p = K('s', 'arrowdown') - K('w', 'arrowup'); m.r = K('a', 'arrowleft') - K('d', 'arrowright'); m.y = K('q') - K('e'); m.th = K('shift', '=', '+') - K('z', '-'); m.br = K('b'); }
  else if (mySeat === 1) { m.f = mouseFire && !bombsight ? 1 : 0; m.d = K(' '); }
  else m.f = mouseFire || K(' ') ? 1 : 0;
  send(m);
}, 50);

// ------------------------------------------------------------------ world update
const objs = { f: new Map(), b: new Map(), c: new Map(), p: new Map(), w: new Map(), wk: new Map() };
function sync(map, list, make, upd, parent = scene) {
  const seen = new Set();
  for (const e of list) { seen.add(e[0]); let o = map.get(e[0]); if (!o) { o = make(); parent.add(o); map.set(e[0], o); } o.position.set(e[1], e[2], e[3]); upd && upd(o, e); }
  for (const [id, o] of map) if (!seen.has(id)) { parent.remove(o); map.delete(id); }
}
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion(), e1 = new THREE.Euler();
let fxT = 0, gunT = 0;
function gunWorld(i, ay, ap, outPos, outDir) {
  outPos.fromArray(SEATS[i].gun.pos).applyQuaternion(plane.quaternion).add(plane.position);
  outDir.fromArray(aimDir(ay, ap)).applyQuaternion(plane.quaternion);
}
function look(w, dt) { const lr = 1.6 * dt; w.yaw += (K('arrowleft') - K('arrowright')) * lr; w.pitch = clamp(w.pitch + (K('arrowup') - K('arrowdown')) * lr, -1.3, 1.3); }
// The bot crew: sit or stand at their stations, look around, follow their guns, and get out of the way
// (stand up, step aside) when a player takes over, then climb back in when the player leaves.
let recoil = 0;
const smooth = t => t * t * (3 - 2 * t);
function animateCrew(S, dt) {
  const T = performance.now() / 1000;
  S.st.forEach((s, i) => {
    const f = crewFig[i], u = f.userData, d = u.def, taken = !!s[0];
    u.a = clamp(u.a + (taken ? 1 : -1) * dt / 1.3, 0, 1);
    const a = smooth(u.a), up = clamp(u.a * 3, 0, 1), P = d.at, Q = d.aside;        // stands up first, then walks
    f.visible = !s[7] && !(d.hide && u.a < 0.04);
    if (!f.visible) return;
    const step = u.a > 0 && u.a < 1 ? Math.abs(Math.sin(u.a * Math.PI * 5)) * 0.03 : 0;
    f.position.set(P[0] + (Q[0] - P[0]) * a, P[1] + (Q[1] - P[1]) * a + step + Math.sin(T * 1.3 + u.ph) * 0.004, P[2] + (Q[2] - P[2]) * a);
    const g = SEATS[i].gun, track = g && i > 1 ? clamp(wrap(s[4] - g.yc), -1, 1) * 0.7 : 0, firing = !taken && s[6];
    f.rotation.y = P[3] + wrap(Q[3] - P[3]) * a + track * (1 - a);
    poseCrew(f, P[4] + (Q[4] - P[4]) * up, (g || i === 0 ? 1 : 0.2) * (1 - up));
    // head: scans the sky, or watches you while standing aside; shoulders shake on the gun
    let hy = Math.sin(T * 0.45 + u.ph) * 0.6 + Math.sin(T * 1.1 + u.ph * 2) * 0.15, hp = Math.sin(T * 0.3 + u.ph) * 0.12 + (g && !taken ? s[5] * 0.5 : 0);
    if (u.a > 0.5) { v1.copy(camera.position); f.worldToLocal(v1); hy = clamp(Math.atan2(-v1.x, -v1.z), -1.2, 1.2); hp = 0.1; }
    u.head.rotation.y += (hy - u.head.rotation.y) * Math.min(1, 4 * dt); u.head.rotation.x += (hp - u.head.rotation.x) * Math.min(1, 4 * dt);
    u.hips.rotation.z = firing ? (Math.random() - 0.5) * 0.04 : 0; u.hips.rotation.x = firing ? (Math.random() - 0.5) * 0.03 : Math.sin(T * 0.9 + u.ph) * 0.015;
    playerFig[i].visible = taken && s[0] !== myId;
  });
  const c = crewFig.copilot, u = c.userData; c.visible = !S.st[0][7];
  u.head.rotation.y += (Math.sin(T * 0.4 + u.ph) * 0.7 - u.head.rotation.y) * Math.min(1, 3 * dt); u.hips.rotation.x = Math.sin(T * 0.9 + u.ph) * 0.015;
}
function updateWorld(S, dt) {
  const pl = S.pl;
  plane.visible = !pl.crashed && !(bombsight && mySeat > 0);
  plane.position.set(pl.x, pl.y, pl.z); plane.rotation.set(pl.pitch, pl.yaw, pl.roll, 'YXZ'); plane.updateMatrixWorld();
  for (const g of gearParts) g.visible = !!pl.gear;
  for (const d of air.doors) d.visible = !pl.doors;
  doorFlaps.visible = !!pl.doors; ladder.visible = !!pl.ground; hatch.visible = !pl.ground;
  bayBombs.forEach((b, i) => { b.visible = i < pl.bombs; });
  spinProps(props, dt, 14 + pl.thr * 30, i => pl.eng[i] > 0 && pl.fuel > 0);
  yokes.forEach(y => { y.rotation.x = -S.ct[0] * 0.18; y.userData.wheel.rotation.z = S.ct[1] * 0.9; });
  // where am I: at a station, walking inside, on the field, or gone
  mySeat = S.st.findIndex(s => s[0] === myId); bailed = S.c.some(c => c[4] === myId);
  const mf = S.ft.find(f => f[0] === myId), mw = S.wk.find(f => f[0] === myId);
  if (mf && !foot) foot = { x: mf[1], z: mf[2], yaw: mf[3], pitch: 0 }; else if (!mf) foot = null;
  if (mw && !walk) walk = { x: mw[1], z: mw[2], yaw: mw[3], pitch: 0 }; else if (!mw) walk = null;
  if (foot) {
    look(foot, dt);
    const fw = K('w') - K('s'), st = K('d') - K('a'), sp = (K('shift') ? 10 : 6) * dt / (fw && st ? 1.414 : 1);
    foot.x = clamp(foot.x + (-Math.sin(foot.yaw) * fw + Math.cos(foot.yaw) * st) * sp, pl.x - 150, pl.x + 150);
    foot.z = clamp(foot.z + (-Math.cos(foot.yaw) * fw - Math.sin(foot.yaw) * st) * sp, pl.z - 150, pl.z + 150);
    if (fw || st) { bob += sp; if ((stepDist += sp) > 0.8) { stepDist = 0; noise(0.05, 400, 0.05); } }
  }
  if (walk) {
    look(walk, dt);
    const fw = K('w') - K('s'), st = K('d') - K('a'), sp = (K('shift') ? 5.5 : 3.4) * dt / (fw && st ? 1.414 : 1), ox = walk.x, oz = walk.z;
    const nx = walk.x + (-Math.sin(walk.yaw) * fw + Math.cos(walk.yaw) * st) * sp;
    let nz = clamp(walk.z + (-Math.cos(walk.yaw) * fw - Math.sin(walk.yaw) * st) * sp, WALK_Z0, WALK_Z1);
    walk.z = nz; const hw = halfW(nz, pl.doors); walk.x = clamp(nx, -hw, hw);      // the corridor funnels you through doorways
    const moved = Math.hypot(walk.x - ox, walk.z - oz); stepDist += moved; bob += moved;
    if (stepDist > 0.75) { stepDist = 0; footstep(); }
  }
  sync(objs.p, S.ft.filter(f => f[0] !== myId).map(f => [f[0], f[1], 0.4, f[2], f[3]]), () => makeCrew(M.khaki), (o, e) => { o.rotation.y = e[4]; });
  sync(objs.wk, S.wk.filter(f => f[0] !== myId).map(f => [f[0], f[1], eyeY(f[2]) - 1.5, f[2], f[3]]), () => makeCrew(M.khaki), (o, e) => { o.rotation.y = e[4]; }, plane);
  animateCrew(S, dt);
  if (mySeat !== lastSeat) { lastSeat = mySeat; bombsight = false; if (mySeat > 0) { aim.ay = S.st[mySeat][4]; aim.ap = S.st[mySeat][5]; } }
  if (mySeat > 0) {
    const ar = 1.4 * dt; aim.ay += (K('arrowleft') - K('arrowright')) * ar; aim.ap += (K('arrowup') - K('arrowdown')) * ar;
    [aim.ay, aim.ap] = clampAim(SEATS[mySeat].gun, aim.ay, aim.ap);
  }
  // guns: recoil, muzzle flash, tracers, brass
  const pv = planeVel(pl); gunT += dt; const shoot = gunT > 0.1; if (shoot) gunT = 0;
  S.st.forEach((s, i) => {
    const t = turrets[i]; if (!t) return;
    const ay = i === mySeat ? aim.ay : s[4], ap = i === mySeat ? aim.ap : s[5], u = t.userData, mine = i === mySeat;
    t.rotation.set(ap, ay, 0, 'YXZ');
    if (s[6] && shoot) {
      u.kick = 1; u.flashT = 0.065; u.n++;
      const fl = u.flashes[u.n % u.flashes.length]; fl.rotation.z = Math.random() * 6; fl.scale.setScalar(0.7 + Math.random() * 0.8);
      fl.getWorldPosition(v1); v2.fromArray(aimDir(ay, ap)).applyQuaternion(plane.quaternion).multiplyScalar(BULLET_SPD); v2.x += pv[0]; v2.y += pv[1]; v2.z += pv[2];
      spawnTracer(v1, v2, false);
      t.getWorldPosition(v1); v2.set((Math.random() - 0.3) * 3, 1 + Math.random(), 1.5).applyQuaternion(plane.quaternion); v2.x += pv[0]; v2.y += pv[1]; v2.z += pv[2]; spawnCasing(v1, v2);
      const d = mine ? 0 : v1.distanceTo(camera.position); gunSound(mine ? 0.3 : clamp(0.5 / (1 + d), 0.03, 0.14));
      if (mine) recoil = 1;
      if (u.n % 3 === 0) { fl.getWorldPosition(v1); puff(v1.x, v1.y, v1.z, 0.12, 0.5, 0xbbbbbb, 4, 0.3); }
    }
    u.kick *= Math.exp(-dt * 22); u.rec.position.z = u.kick * 0.07;
    u.flashes.forEach((f, k) => { f.visible = u.flashT > 0 && k === u.n % u.flashes.length; }); u.flashT -= dt;
  });
  // fighters
  fxT += dt; const fx = fxT > 0.07; if (fx) fxT = 0;
  sync(objs.f, S.f, makeFighter, (o, e) => {
    o.lookAt(e[1] + e[4], e[2] + e[5], e[3] + e[6]);
    if (fx && (e[7] & 2)) { puff(e[1], e[2], e[3], 3, 2.2, 0x2a2a2a, 1.2, 1); if (Math.random() < 0.4) puff(e[1], e[2], e[3], 1.6, 0.3, 0xff8a3a, 2, 0); }
    else if (fx && (e[7] & 4) && Math.random() < 0.6) puff(e[1], e[2], e[3], 1.4, 1.6, 0x8a8a8a, 1.4, 0.5);
    if (shoot && (e[7] & 1)) { v1.set(e[1], e[2], e[3]); v2.set(e[4], e[5], e[6]).normalize().multiplyScalar(700); v2.x += (Math.random() - 0.5) * 25; v2.y += (Math.random() - 0.5) * 25; spawnTracer(v1, v2, true); noise(0.07, 1200, 0.04); }
  });
  // the rest of the formation
  sync(objs.w, S.w, makeWingman, (o, e) => {
    o.rotation.set(e[6], e[4], e[5], 'YXZ'); spinProps(o.userData.air.props, dt, 30, () => !(e[7] & 2));
    if (fx && (e[7] & 2)) puff(e[1], e[2], e[3], 5, 3, 0x1c1c1c, 1.1, 2);
    const f = e[8] && shoot && Math.random() < 0.6 && S.f.find(f => f[0] === e[8]);
    if (f) { v1.set(e[1], e[2] + 1, e[3]); v2.set(f[1] - e[1] + (Math.random() - 0.5) * 30, f[2] - e[2] + (Math.random() - 0.5) * 30, f[3] - e[3] + (Math.random() - 0.5) * 30).normalize().multiplyScalar(BULLET_SPD); spawnTracer(v1, v2, false); }
  });
  sync(objs.b, S.b, makeBomb, o => { o.rotation.x = Math.PI / 2 + 0.6; });
  sync(objs.c, S.c, makeChute, (o, e) => { o.userData.canopy.visible = !!e[5]; });
  // smoke
  if (fx && !pl.crashed) {
    pl.eng.forEach((h, i) => { if (h < 40) { v1.copy(engSmokePos[i]).applyMatrix4(plane.matrixWorld); puff(v1.x, v1.y, v1.z, h <= 0 ? 2.2 : 1.2, 2, h <= 0 ? 0x1c1c1c : 0x777777, 1.3, 1); } });
    if (pl.doomed) { v1.set(0, 1, 16).applyMatrix4(plane.matrixWorld); puff(v1.x, v1.y, v1.z, 4, 3, 0x161616, 1.2, 2); }
    else if (pl.leak) { v1.set(3, -0.9, 0).applyMatrix4(plane.matrixWorld); puff(v1.x, v1.y, v1.z, 0.8, 1.2, 0xd8d8d0, 1.5, 0); }
  }
  // target
  target.position.set(S.tg[0], 0, S.tg[1]); target.visible = true;
  const dead = S.tg[2] <= 0;
  if (target.userData.dead !== dead) { target.userData.dead = dead; target.traverse(o => { if (o.isMesh && o.geometry.type !== 'CircleGeometry') { o.userData.m ??= o.material; o.material = dead ? tgtBurnt : o.userData.m; o.scale.y = dead ? 0.45 : 1; } }); }
  if (dead && fx && Math.random() < 0.5) puff(S.tg[0] + (Math.random() - 0.5) * 200, 10, S.tg[1] + (Math.random() - 0.5) * 200, 14, 7, 0x242220, 0.5, 22);
  if (pl.crashed && fx && Math.random() < 0.4) puff(pl.x, 3, pl.z, 6, 5, 0x1a1a1a, 0.6, 10);
  if (engGain) engGain.gain.value = pl.crashed || !pl.eng.some((h, i) => h > 0) || pl.fuel <= 0 ? 0 : 0.05 + pl.thr * 0.09;
  engOsc.forEach((o, i) => { o.frequency.value = [48, 73, 97.5][i] * (0.7 + pl.thr * 0.45); });
  if (windGain) { const out = foot ? 0.3 : walk ? 0.5 : mySeat === 0 ? 0.6 : 1; windGain.gain.value = pl.crashed ? 0 : clamp(pl.spd / 100, 0, 1.2) * 0.05 * out; windFilt.frequency.value = 300 + pl.spd * 5; }
}

let camYaw = 0, impact = null, camMode = '', blendT = 0;
const fromP = new THREE.Vector3(), fromQ = new THREE.Quaternion(), lastP = new THREE.Vector3(), lastQ = new THREE.Quaternion(), q2 = new THREE.Quaternion(), v3 = new THREE.Vector3();
const BLEND = 0.9;
function setFov(f) { if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } }
function updateCamera(S, dt) {
  const pl = S.pl; camera.up.set(0, 1, 0); impact = null;
  const myChute = S.c.find(c => c[4] === myId);
  let mode, fov = 70, local = true;        // local = this view rides in the aircraft
  if (foot) {
    mode = 'foot'; camera.position.set(foot.x, 2.1 + Math.sin(bob * 3.2) * 0.04, foot.z); camera.rotation.set(foot.pitch, foot.yaw, 0, 'YXZ');
  } else if (walk) {
    mode = 'walk'; fov = 78; camera.position.set(walk.x + Math.cos(bob * 2.1) * 0.012, eyeY(walk.z) + Math.sin(bob * 4.2) * 0.022, walk.z).applyMatrix4(plane.matrixWorld);
    camera.quaternion.copy(plane.quaternion).multiply(q1.setFromEuler(e1.set(walk.pitch, walk.yaw, 0, 'YXZ')));
  } else if (myChute && S.ph !== 'ended') {
    mode = 'chute'; fov = 65; local = false; camera.position.set(myChute[1] + 6, myChute[2] + 3, myChute[3] + 12); camera.lookAt(pl.x, pl.y, pl.z);
  } else if (mySeat > 0 && bombsight) {
    mode = 'sight'; local = false; impact = impactPoint(pl); fov = 22;
    camera.position.set(pl.x, pl.y - 2.5, pl.z); camera.up.set(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw)); camera.lookAt(impact.x, 0, impact.z);
  } else if (mySeat > 0) {
    // eye just behind and above the breech, so the guns fill the bottom of the view
    mode = 'gun' + mySeat; gunWorld(mySeat, aim.ay, aim.ap, v1, v2);
    q1.setFromEuler(e1.set(aim.ap + recoil * 0.006 * (Math.random() - 0.3), aim.ay + recoil * 0.004 * (Math.random() - 0.5), 0, 'YXZ'));
    camera.quaternion.copy(plane.quaternion).multiply(q1);
    camera.position.copy(v1).add(v3.set(0, 0.25, 0.74 + recoil * 0.015).applyQuaternion(camera.quaternion));
  } else if (mySeat === 0 && cockpit) {
    mode = 'pilot'; fov = 75; camera.position.set(-0.62, 1.62, -6.6).applyMatrix4(plane.matrixWorld);
    camera.quaternion.copy(plane.quaternion).multiply(q1.setFromEuler(e1.set(plook.pitch, plook.yaw, 0, 'YXZ')));
  } else {
    mode = 'ext'; fov = 65; local = false; camYaw += wrap(pl.yaw - camYaw) * Math.min(1, 3.5 * dt);
    camera.position.set(pl.x + Math.sin(camYaw) * 42, Math.max(1.5, pl.y + 11 - Math.sin(pl.pitch) * 20), pl.z + Math.cos(camYaw) * 42);
    camera.lookAt(pl.x - Math.sin(pl.yaw) * 10, pl.y + 3, pl.z - Math.cos(pl.yaw) * 10);
  }
  recoil *= Math.exp(-dt * 16);
  // Changing place inside the ship is a move, not a cut: glide from the old viewpoint to the new one
  // (in aircraft space, so it works at 180 mph). Long jumps dip to black instead.
  plane.worldToLocal(v1.copy(camera.position)); q2.copy(plane.quaternion).invert().multiply(camera.quaternion);
  if (mode !== camMode) {
    const ok = camMode && local && camMode !== 'ext' && camMode !== 'chute' && camMode !== 'sight';
    if (ok && v1.distanceTo(lastP) < 5) { blendT = BLEND; fromP.copy(lastP); fromQ.copy(lastQ); } else { blendT = 0; if (camMode) fade = 0.45; }
    if (mode === 'pilot') plook.yaw = plook.pitch = 0;
    camMode = mode;
  }
  if (blendT > 0) {
    blendT -= dt; const k = smooth(clamp(1 - blendT / BLEND, 0, 1));
    v1.lerpVectors(fromP, v1, k); v1.y -= Math.sin(k * Math.PI) * 0.12; q2.slerpQuaternions(fromQ, q2, k);
    camera.position.copy(v1).applyMatrix4(plane.matrixWorld); camera.quaternion.copy(plane.quaternion).multiply(q2);
  }
  lastP.copy(v1); lastQ.copy(q2);
  setFov(fov);
  // engine vibration through the airframe, plus knocks from hits and flak
  if (local && mode !== 'foot' && !pl.crashed) { const vib = 0.0015 + pl.thr * 0.002; camera.position.x += (Math.random() - 0.5) * vib; camera.position.y += (Math.random() - 0.5) * vib; }
  if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - 0.5) * shake * 0.4; camera.position.y += (Math.random() - 0.5) * shake * 0.4; camera.rotateZ((Math.random() - 0.5) * shake * 0.03); }
  camera.updateMatrixWorld();
}

// ------------------------------------------------------------------ HUD
const AMBER = '#f0d77a', PANEL = 'rgba(14,18,10,.62)', FONT = 'ui-monospace, Menlo, Consolas, monospace';
function project(x, y, z) { v1.set(x, y, z).applyMatrix4(camera.matrixWorldInverse); const behind = v1.z > 0; v1.applyMatrix4(camera.projectionMatrix); return { x: (v1.x * 0.5 + 0.5) * W, y: (-v1.y * 0.5 + 0.5) * H, behind }; }
function marker(x, y, z, color, label, dist) {
  const p = project(x, y, z); let sx = p.x, sy = p.y; const m = 34;
  let off = p.behind || sx < m || sx > W - m || sy < m || sy > H - m;
  if (off) { let dx = sx - W / 2, dy = sy - H / 2; if (p.behind) { dx = -dx; dy = -dy; } const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (H / 2 - m) / Math.abs(dy || 1e-3)); sx = W / 2 + dx * k; sy = H / 2 + dy * k; }
  ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx, sy - 9); ctx.lineTo(sx + 9, sy); ctx.lineTo(sx, sy + 9); ctx.lineTo(sx - 9, sy); ctx.closePath(); off ? ctx.fill() : ctx.stroke();
  ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(`${label} ${dist < 1000 ? Math.round(dist) + 'm' : (dist / 1000).toFixed(1) + 'km'}`, clamp(sx, 50, W - 50), sy + (sy > H - 60 ? -14 : 24));
}
function label(x, y, z, color, text) {
  const p = project(x, y, z); if (p.behind) return;
  ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'center'; const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = PANEL; ctx.fillRect(p.x - w / 2, p.y - 14, w, 19); ctx.fillStyle = color; ctx.fillText(text, p.x, p.y);
}
function panel(x, y, w, h) { ctx.fillStyle = PANEL; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(138,132,85,.7)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
function bar(x, y, w, v, color) { ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x, y, w, 7); ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(v, 0, 1), 7); }
function strip(t, y, color = '#c9c3a4', size = 11) { ctx.textAlign = 'center'; ctx.font = `600 ${size}px ${FONT}`; const w = Math.min(W - 16, ctx.measureText(t).width + 20); ctx.fillStyle = PANEL; ctx.fillRect(W / 2 - w / 2, y - 14, w, 20); ctx.fillStyle = color; ctx.fillText(t, W / 2, y, w - 12); }

function objective(S) {
  const pl = S.pl, pilot = mySeat === 0;
  if (bailed) return 'You jumped. Hang on to your chute…';
  if (S.ph === 'ended') {
    if (pl.crashed) return 'The Fortress is lost.';
    if (foot) return `On the field. F at the crew door climbs in · next mission in ${S.endT}s (N)`;
    return `Mission over. Crew door is aft on the right (F) · next mission in ${S.endT}s (N)`;
  }
  if (pl.doomed) return 'WE ARE GOING DOWN. Get to the bomb bay and jump through the open doors!';
  if (S.sl[3] === 0 && S.tg[2] > 0 && pl.bombs > 0) return pilot ? 'Hold your slot in the formation to the TARGET. Fight off the fighters.' : mySeat === 1 ? 'Bay doors (O), bombsight (B), drop on the target (SPACE)' : 'Fight off the fighters. The formation is inbound to the TARGET.';
  if (S.tg[2] > 0) return 'The target survived. Stay with the formation and return to BASE.';
  return pilot ? 'Target destroyed! Follow the formation home, then land at BASE: gear (G), brake (B)' : 'Target destroyed! Hold them off until we are home.';
}
const GUNHELP = 'MOUSE aim (or arrows) · CLICK / SPACE fire';
const HELP = { pilot: 'W/S pitch · A/D roll · Q/E rudder · SHIFT/Z throttle · G gear · B brake · MOUSE look · V view', bomb: 'MOUSE aim · CLICK fire · B bombsight · O bay doors · SPACE drop bombs' };
const FIRE = ['fire at will', 'close range', 'HOLD FIRE'], BOMB = ['auto', 'HOLD', 'SALVO'], AP = ['formation', 'heading home'];

function drawHUD(S, dt) {
  ctx.clearRect(0, 0, W, H); if (!S) return;
  const pl = S.pl, small = W < 760, inside = !!walk, cx = W / 2, cy = H / 2;
  const dT = Math.hypot(S.tg[0] - pl.x, S.tg[1] - pl.z), dB = Math.hypot(pl.x, pl.z), dS = Math.hypot(S.sl[0] - pl.x, S.sl[1] - pl.y, S.sl[2] - pl.z);
  // world markers (not while walking around inside)
  if (!inside) {
    if (S.tg[2] > 0) marker(S.tg[0], 20, S.tg[1], '#ffb347', 'TARGET', dT);
    if (dB > 1500) marker(0, 5, -300, '#8fd0ff', 'BASE', dB);
    if (mySeat === 0 && S.ph === 'flight' && S.sl[3] < 2 && dS > 25) marker(S.sl[0], S.sl[1], S.sl[2], '#b7f0a0', 'YOUR SLOT', dS);
  }
  const gunner = mySeat > 0 && !bombsight, pv = planeVel(pl);
  for (const f of S.f) {
    if (f[7] & 2) continue;
    const d = Math.hypot(f[1] - camera.position.x, f[2] - camera.position.y, f[3] - camera.position.z); if (d > 3500) continue;
    const p = project(f[1], f[2], f[3]); if (p.behind) continue;
    const r = clamp(9000 / d, 7, 26), mark = f[0] === S.od[3]; ctx.strokeStyle = mark ? '#ffe04a' : '#ff5a4a'; ctx.lineWidth = mark ? 3 : 1.5; ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
    if (mark) { ctx.fillStyle = '#ffe04a'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('MARKED', p.x, p.y - r - 5); }
    if (gunner && d < 1100) {
      const t = d / BULLET_SPD, q = project(f[1] + (f[4] - pv[0]) * t, f[2] + (f[5] - pv[1]) * t, f[3] + (f[6] - pv[2]) * t);
      if (!q.behind) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, 7); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
    }
  }
  // reticles
  if (gunner) {
    ctx.strokeStyle = AMBER; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 7); ctx.moveTo(cx - 34, cy); ctx.lineTo(cx - 8, cy); ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 34, cy); ctx.moveTo(cx, cy - 34); ctx.lineTo(cx, cy - 8); ctx.moveTo(cx, cy + 8); ctx.lineTo(cx, cy + 34); ctx.stroke();
    ctx.fillStyle = AMBER; ctx.fillRect(cx - 1, cy - 1, 2, 2);
  } else if (mySeat > 0 && bombsight) {
    const R = Math.min(W, H) * 0.42;
    ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.moveTo(cx + R, cy); ctx.arc(cx, cy, R, Math.PI * 2, 0, true); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.stroke();
    ctx.fillStyle = AMBER; ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(`BOMBSIGHT · impact in ${impact ? impact.t.toFixed(1) : '--'}s · doors ${pl.doors ? 'OPEN' : 'CLOSED (O)'} · ${pl.bombs} bombs`, cx, cy + R - 18);
  } else if (foot || walk) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.stroke(); }
  // objective
  ctx.textAlign = 'center'; ctx.font = `700 ${small ? 12 : 15}px ${FONT}`;
  const obj = objective(S), ow = Math.min(W < 1250 ? W - 24 : W - 300, ctx.measureText(obj).width + 28);
  const ocx = W < 1250 ? cx : Math.min(cx, W - 290 - ow / 2);
  panel(ocx - ow / 2, 10, ow, 30); ctx.fillStyle = pl.doomed ? '#ff7a5a' : AMBER; ctx.fillText(obj, ocx, 30, ow - 16);
  // crew list
  ctx.font = `600 12px ${FONT}`; ctx.textAlign = 'left';
  const n = SEATS.length, cw = 262, cx0 = W - cw - 10, cy0 = W < 1250 ? 48 : 10; panel(cx0, cy0, cw, 20 + 18 * n + 74);
  ctx.fillStyle = '#a9a37f'; ctx.fillText(`CREW ${roomCode} · keys 1-${n} take a station`, cx0 + 8, cy0 + 15);
  S.st.forEach((s, i) => {
    const me = i === mySeat, y = cy0 + 34 + i * 18;
    ctx.fillStyle = me ? AMBER : s[0] ? '#e8e2c8' : s[7] ? '#8a6a5a' : '#9aa08a';
    const who = s[0] ? `${rankAbbr(s[2])} ${s[1]}` : s[7] ? 'bailed out' : `Sgt. ${S.cn[i]}`;
    ctx.fillText(`${me ? '>' : ' '}${i + 1} ${SEATS[i].name.padEnd(11)} ${who}`.slice(0, 33), cx0 + 6, y);
    if (SEATS[i].gun && (s[0] || !s[7])) bar(cx0 + cw - 34, y - 7, 26, s[3] / AMMO_MAX, s[3] < 80 ? '#ff7a5a' : '#b7c97a');
  });
  let y = cy0 + 34 + n * 18;
  ctx.fillStyle = '#a9a37f'; ctx.fillText(`You: ${rankName(missions)}${foot ? ' · on the field' : walk ? ' · walking' : ''}`, cx0 + 8, y, cw - 14);
  ctx.fillStyle = S.od[0] ? '#ffb347' : '#b7c97a'; ctx.fillText(`Gunners: ${FIRE[S.od[0]]}${S.od[3] ? ' · marked' : ''}`, cx0 + 8, y += 18);
  ctx.fillStyle = S.od[1] ? '#ffb347' : '#b7c97a'; ctx.fillText(`Bombardier: ${BOMB[S.od[1]]} · Copilot: ${AP[S.od[2]]}`, cx0 + 8, y += 18, cw - 14);
  ctx.fillStyle = '#a9a37f'; ctx.fillText('C = crew orders', cx0 + 8, y += 18);
  // crew orders menu
  if (menu) {
    const mw = Math.min(W - 20, 400), mh = 34 + ORDERS.length * 19, mx0 = 10, my0 = Math.max(48, cy - mh / 2); panel(mx0, my0, mw, mh);
    ctx.fillStyle = AMBER; ctx.font = `700 13px ${FONT}`; ctx.fillText('CREW ORDERS: press a number (C closes)', mx0 + 10, my0 + 19);
    ctx.font = `600 12px ${FONT}`;
    ORDERS.forEach((o, i) => { const on = (i >= 1 && i <= 3 && S.od[0] === i - 1) || (i >= 5 && i <= 7 && S.od[1] === i - 5) || (i >= 8 && S.od[2] === i - 8) || (i === 0 && pl.doors); ctx.fillStyle = on ? '#b7f0a0' : '#e8e2c8'; ctx.fillText(`${i}  ${o}${i === 0 ? (pl.doors ? ' (open now)' : ' (closed now)') : ''}`, mx0 + 10, my0 + 40 + i * 19, mw - 20); });
  }
  // instruments
  const ih = 132, iw = 250, ix = 10, iy = H - ih - 10; panel(ix, iy, iw, ih);
  const hdg = ((Math.round(-pl.yaw * 180 / Math.PI) % 360) + 360) % 360;
  ctx.font = `700 13px ${FONT}`; ctx.fillStyle = '#e8e2c8'; ctx.textAlign = 'left';
  ctx.fillText(`SPD ${String(Math.round(pl.spd * 2.237)).padStart(3)} mph   ALT ${String(Math.round((pl.y - 3) * 3.28)).padStart(5)} ft`, ix + 10, iy + 20);
  ctx.fillText(`HDG ${String(hdg).padStart(3, '0')}°      GEAR ${pl.gear ? 'DOWN' : 'UP'}`, ix + 10, iy + 38);
  ctx.font = `600 11px ${FONT}`;
  const rows = [['THR', pl.thr, '#b7c97a'], ['FUEL', pl.fuel / 100, pl.fuel < 20 ? '#ff7a5a' : pl.leak ? '#ffb347' : '#b7c97a'], ['HULL', pl.hull / 100, pl.hull < 35 ? '#ff7a5a' : '#b7c97a']];
  rows.forEach(([n, v, c], i) => { ctx.fillStyle = '#a9a37f'; ctx.fillText(n + (n === 'FUEL' && pl.leak ? ' LEAK' : ''), ix + 10, iy + 58 + i * 16); bar(ix + 78, iy + 51 + i * 16, 120, v, c); ctx.fillStyle = '#e8e2c8'; ctx.fillText(Math.round(v * 100) + '%', ix + 206, iy + 58 + i * 16); });
  ctx.fillStyle = '#a9a37f'; ctx.fillText('ENG', ix + 10, iy + 108);
  pl.eng.forEach((h, i) => { ctx.fillStyle = h <= 0 ? '#ff5a4a' : h < 40 ? '#ffb347' : '#b7c97a'; ctx.fillRect(ix + 78 + i * 22, iy + 99, 16, 10); });
  ctx.fillStyle = '#e8e2c8'; ctx.fillText(`BOMBS ${pl.bombs}/${BOMBS_MAX}${pl.doors ? ' · DOORS OPEN' : ''}${mySeat > 0 ? ` · AMMO ${S.st[mySeat][3]}` : ''}`, ix + 10, iy + 124);
  // minimap
  const ms = small ? 110 : 150, mx = W - ms - 10, my = H - ms - 10, mc = ms / 2, sc = (ms / 2 - 8) / 9000; panel(mx, my, ms, ms);
  const mp = (x, z) => { let dx = (x - pl.x) * sc, dy = (z - pl.z) * sc; const l = Math.hypot(dx, dy), mxl = ms / 2 - 7; if (l > mxl) { dx *= mxl / l; dy *= mxl / l; } return [mx + mc + dx, my + mc + dy]; };
  let [ax, ay] = mp(0, -300); ctx.fillStyle = '#8fd0ff'; ctx.fillRect(ax - 4, ay - 4, 8, 8);
  if (S.tg[2] > 0) { [ax, ay] = mp(S.tg[0], S.tg[1]); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(ax, ay - 6); ctx.lineTo(ax + 6, ay + 5); ctx.lineTo(ax - 6, ay + 5); ctx.fill(); }
  ctx.fillStyle = '#b7f0a0'; for (const b of S.w) if (!(b[7] & 2)) { [ax, ay] = mp(b[1], b[3]); ctx.fillRect(ax - 1.5, ay - 1.5, 3, 3); }
  ctx.fillStyle = '#ff5a4a'; for (const f of S.f) if (!(f[7] & 2)) { [ax, ay] = mp(f[1], f[3]); ctx.fillRect(ax - 2, ay - 2, 4, 4); }
  ctx.save(); ctx.translate(mx + mc, my + mc); ctx.rotate(-pl.yaw); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#a9a37f'; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('N', mx + mc, my + 11);
  // messages
  ctx.textAlign = 'left'; ctx.font = `600 12px ${FONT}`; const now = performance.now(); let myy = iy - 12;
  for (let i = msgs.length - 1; i >= 0; i--) { const a = 1 - (now - msgs[i].t - 9000) / 2000; if (a <= 0) continue; ctx.globalAlpha = clamp(a, 0, 1); const w = Math.min(W - 20, ctx.measureText(msgs[i].s).width + 12); ctx.fillStyle = PANEL; ctx.fillRect(10, myy - 13, w, 18); ctx.fillStyle = msgs[i].r ? '#b7f0a0' : '#f3eed6'; ctx.fillText(msgs[i].s, 16, myy, W - 32); myy -= 20; }
  ctx.globalAlpha = 1;
  // prompts and help line
  let help = '';
  if (foot) {
    const o = Math.hypot(foot.x - pl.x, foot.z - pl.z); v1.set(DOOR.x + 0.4, 0, DOOR.z).applyMatrix4(plane.matrixWorld);
    const dd = Math.hypot(foot.x - v1.x, foot.z - v1.z);
    if (!pl.crashed) label(v1.x, v1.y + 0.4, v1.z, '#8fd0ff', dd < 7 ? 'CREW DOOR · press F to climb in' : `CREW DOOR ${Math.round(o)}m`);
    help = 'ON THE FIELD: W/A/S/D walk · SHIFT run · MOUSE or arrows look · F climb in (at the crew door)';
  } else if (walk) {
    // name the stations nearby so you can find your way around
    SEATS.forEach((s, i) => { const d = Math.hypot(walk.x - s.st[0], walk.z - s.st[1]); if (d < 6 && d > 1.1) { v1.set(s.st[0], eyeY(s.st[1]) + 0.25, s.st[1]).applyMatrix4(plane.matrixWorld); label(v1.x, v1.y, v1.z, '#c9c3a4', s.name); } });
    crewFig.forEach((f, k) => { if (!f.visible || f.userData.a < 0.5) return; f.getWorldPosition(v2); if (v2.distanceTo(camera.position) < 2.5) label(v2.x, v2.y + 1.75, v2.z, '#b7f0a0', `Sgt. ${S.cn[k]}`); });
    const i = nearSeat(), inBay = walk.z > BAY.z0 && walk.z < BAY.z1, atDoor = Math.abs(walk.z - DOOR.z) < 1.2;
    let t = '';
    if (inBay) t = pl.doors ? (pl.ground ? 'BOMB BAY: doors open. Step off the catwalk (A/D) to drop to the ground' : 'BOMB BAY: doors open. Step off the catwalk (A/D) to BAIL OUT') : 'BOMB BAY: doors closed. Press O to open them';
    else if (i >= 0) t = S.st[i][0] ? `${SEATS[i].name}: ${S.st[i][1]} is on it` : `Press E to take the ${SEATS[i].name.toUpperCase()}${S.st[i][7] ? '' : ` (Sgt. ${S.cn[i]} steps aside)`}`;
    else if (atDoor) t = pl.ground && pl.spd < 1 ? 'CREW DOOR: press F to climb out' : 'CREW DOOR: stays shut until we are parked';
    if (t) strip(t, cy + 60, AMBER, 13);
    help = 'WALKING: W/A/S/D move · SHIFT hurry · MOUSE or arrows look · E take a station · O bay doors · C crew orders';
  } else if (mySeat >= 0) help = `${SEATS[mySeat].name.toUpperCase()}: ${HELP[SEATS[mySeat].key] || GUNHELP} · F get up and walk · C crew orders${mySeat ? ' · R mark fighter' : ''}`;
  if (help && !small) strip(help, H - 14);
  if (recoil > 0.35 && mySeat > 0 && !bombsight) { const g = ctx.createRadialGradient(cx, cy + 40, 10, cx, cy + 40, 420); g.addColorStop(0, `rgba(255,210,120,${recoil * 0.16})`); g.addColorStop(1, 'rgba(255,210,120,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  if (hitMark > 0) { hitMark -= dt; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(cx + a * 8, cy + b * 8); ctx.lineTo(cx + a * 16, cy + b * 16); } ctx.stroke(); }
  // looking out from inside a dim fuselage
  if (!foot && camMode !== 'ext' && camMode !== 'sight' && camMode !== 'chute') { const g = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.45, cx, cy, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.42)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  if (hitFlash > 0) { hitFlash -= dt; ctx.fillStyle = `rgba(255,40,20,${hitFlash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (fade > 0) { fade -= dt; ctx.fillStyle = `rgba(0,0,0,${clamp(fade / 0.3, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), lobbyA = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.12, (now - last) / 1000); last = now;
  const S = interp(now);
  if (S) { updateWorld(S, dt); updateCamera(S, dt); }
  else { lobbyA += dt * 0.1; setFov(55); camera.up.set(0, 1, 0); camera.position.set(Math.sin(lobbyA) * 46, 9, 500 + Math.cos(lobbyA) * 46); camera.lookAt(0, 3, 500); }
  updEffects(dt);
  renderer.render(scene, camera);
  drawHUD(S, dt);
}
requestAnimationFrame(frame);
