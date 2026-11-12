// Authoritative game simulation for one bomber crew ("room").
import { SEATS, AMMO_MAX, BOMBS_MAX, BULLET_SPD, G, rot, irot, wrap, clamp, aimDir, clampAim, planeVel, impactPoint } from './public/shared.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
const r2 = x => Math.round(x * 100) / 100;
const r3 = x => Math.round(x * 1000) / 1000;
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const IAF_Z = 6000;          // approach fix south of the runway
const BASE_R = 2200;         // radius that counts as "at base"

function steer(dir, des, maxAng) {
  let dot = clamp(dir[0] * des[0] + dir[1] * des[1] + dir[2] * des[2], -1, 1);
  if (dot < -0.9) { des = norm([des[0] + dir[2], des[1] + 0.3, des[2] - dir[0]]); dot = 0; }
  const ang = Math.acos(dot);
  if (ang < 1e-4) return;
  const t = Math.min(1, maxAng / ang);
  const n = norm([dir[0] + (des[0] - dir[0]) * t, dir[1] + (des[1] - dir[1]) * t, dir[2] + (des[2] - dir[2]) * t]);
  dir[0] = n[0]; dir[1] = n[1]; dir[2] = n[2];
}

export class Room {
  constructor(code) {
    this.code = code; this.players = new Map(); this.mid = 0; this.wins = 0; this.uid = 1;
    this.newMission();
  }

  level() {
    let m = 0, n = 0;
    for (const p of this.players.values()) { m += p.missions; n++; }
    return n ? Math.floor(m / n) : 0;
  }

  newMission() {
    this.mid++;
    const ang = Math.random() * Math.PI * 2, d = rnd(11000, 15000);
    this.tgt = { x: Math.sin(ang) * d, z: Math.cos(ang) * d, hp: 100 };
    this.pl = { x: 0, y: 3, z: 500, yaw: 0, pitch: 0, roll: 0, spd: 0, vy: 0, thr: 0, gear: true, doors: false, ground: true,
      fuel: 15, leak: 0, hull: 100, eng: [100, 100, 100, 100], bombs: 0, doomed: false, crashed: false };
    this.seats = SEATS.map(d => ({ pid: null, ammo: 0, ay: d.gun ? d.gun.yc : 0, ap: 0, fire: false, cool: 0, out: false, kills: 0, bailT: null }));
    this.phase = 'ground'; this.svc = false; this.bombT = 0; this.dropCool = 0; this.botDropping = false;
    this.fighters = []; this.bullets = []; this.bombsAir = []; this.chutes = []; this.ev = [];
    this.waveT = 15; this.result = null; this.endT = 0; this.crashT = 0; this.noCrewT = 0; this.kills = 0;
    this.bot = { wait: 0, app: 'iaf', egress: false, egressYaw: 0, said: {} };
    for (const p of this.players.values()) { p.bailed = false; const s = p.seat; p.seat = -1; if (s >= 0 && !this.seats[s].pid) { this.seats[s].pid = p.id; p.seat = s; } }
    for (const p of this.players.values()) if (p.seat < 0) this.autoSeat(p);
    this.msg(`Mission ${this.mid}: target is ${(d / 1000).toFixed(0)} km out. Fuel up, arm up, and get airborne.`);
  }

  msg(s) { this.ev.push({ k: 'msg', s }); }
  once(key, s) { if (!this.bot.said[key]) { this.bot.said[key] = 1; this.msg(s); } }

  autoSeat(p) {
    const i = this.seats.findIndex(s => !s.pid && !s.out);
    p.seat = i; if (i >= 0) this.seats[i].pid = p.id;
  }
  addPlayer(p) {
    p.in = { p: 0, r: 0, y: 0, th: 0, br: 0, ay: 0, ap: 0, f: 0, d: 0 }; p.bailed = false; p.seat = -1;
    this.players.set(p.id, p); this.autoSeat(p);
    this.msg(`${p.name} joined the crew.`);
  }
  removePlayer(p) {
    if (p.seat >= 0) this.seats[p.seat].pid = null;
    this.players.delete(p.id); this.msg(`${p.name} left the crew.`);
  }
  setSeat(p, i) {
    const s = this.seats[i];
    if (!s || p.bailed || s.pid || s.out || this.phase === 'ended') return;
    if (p.seat >= 0) this.seats[p.seat].pid = null;
    s.pid = p.id; p.seat = i; p.in.f = 0; p.in.d = 0;
    if (SEATS[i].gun) { p.in.ay = s.ay; p.in.ap = s.ap; }
  }
  atBase() { return Math.hypot(this.pl.x, this.pl.z + 300) < BASE_R; }

  action(p, a) {
    const pl = this.pl;
    if (p.seat < 0 || this.phase === 'ended' || pl.crashed) return;
    if (a === 'gear' && p.seat === 0 && !pl.ground) pl.gear = !pl.gear;
    else if (a === 'doors' && p.seat === 1) { pl.doors = !pl.doors; this.msg(`Bomb bay doors ${pl.doors ? 'open' : 'closed'}.`); }
    else if (a === 'svc') {
      if (pl.ground && pl.spd < 0.5 && this.atBase()) { this.svc = !this.svc; if (this.svc) this.msg('Ground crew: fueling and arming the aircraft…'); }
    } else if (a === 'bail' && !pl.ground && pl.y > 30) this.bail(p.seat);
  }

  bail(i) {
    const s = this.seats[i], pl = this.pl; if (s.out) return;
    let pid = 0, name = SEATS[i].name + ' (bot)';
    if (s.pid) { const p = this.players.get(s.pid); pid = p.id; name = p.name; p.bailed = true; p.seat = -1; s.pid = null; }
    s.out = true; s.fire = false;
    this.chutes.push({ id: this.uid++, x: pl.x, y: pl.y - 3, z: pl.z, vy: Math.min(pl.vy, -5), pid });
    this.msg(`${name} bailed out!`);
  }

  // ---------------------------------------------------------------- tick
  tick(dt) {
    const pl = this.pl;
    if (this.phase === 'ended') { this.endT -= dt; if (this.endT <= 0) this.newMission(); }

    // pilot controls
    let c = { p: 0, r: 0, y: 0, th: 0, br: 0 };
    const ps = this.seats[0];
    if (this.phase !== 'ended') {
      if (ps.pid) { const i = this.players.get(ps.pid).in; c = { p: clamp(+i.p || 0, -1, 1), r: clamp(+i.r || 0, -1, 1), y: clamp(+i.y || 0, -1, 1), th: clamp(+i.th || 0, -1, 1), br: i.br ? 1 : 0 }; }
      else if (!ps.out) c = this.botPilot(dt);
    } else c.br = 1;

    this.service(dt);
    this.physics(dt, c);
    if (this.phase === 'ground' && !pl.ground && pl.y > 8) { this.phase = 'flight'; this.msg('Airborne! Gear up (G) and head for the target.'); }
    this.guns(dt);
    this.bombardier(dt);
    this.updBullets(dt);
    this.updBombs(dt);
    this.updFighters(dt);
    for (const ch of this.chutes) { if (ch.y > 0) { ch.vy += (-6.5 - ch.vy) * Math.min(1, 1.5 * dt); ch.y = Math.max(0, ch.y + ch.vy * dt); } }

    // bots abandon a doomed ship
    if (pl.doomed && !pl.ground && !pl.crashed) this.seats.forEach((s, i) => {
      if (s.pid || s.out) return;
      if (s.bailT == null) s.bailT = rnd(0.6, 3);
      if ((s.bailT -= dt) <= 0) this.bail(i);
    });

    // end conditions
    if (this.phase !== 'ended') {
      let aboard = 0; for (const p of this.players.values()) if (!p.bailed) aboard++;
      if (pl.crashed) { if ((this.crashT += dt) > 3) this.end('lost'); }
      else if (this.phase === 'flight' && pl.ground && pl.spd < 0.5) this.end(this.atBase() ? (this.tgt.hp <= 0 ? 'success' : 'aborted') : 'ditched');
      else if (this.phase === 'flight' && aboard === 0 && this.players.size) { if ((this.noCrewT += dt) > 6) this.end('lost'); }
    }
  }

  end(outcome) {
    this.phase = 'ended'; this.endT = 14; this.svc = false;
    const res = { outcome, tgt: this.tgt.hp <= 0, kills: this.kills, players: [] };
    for (const p of this.players.values()) {
      const status = p.bailed ? 'bailed' : outcome === 'success' ? 'credit' : outcome === 'lost' ? 'kia' : 'none';
      if (status === 'credit') p.missions++;
      res.players.push({ id: p.id, name: p.name, status, missions: p.missions });
    }
    if (outcome === 'success') this.wins++;
    this.result = res;
  }

  service(dt) {
    const pl = this.pl; if (!this.svc) return;
    if (!pl.ground || pl.spd > 0.5) { this.svc = false; return; }
    pl.fuel = Math.min(100, pl.fuel + 9 * dt); pl.hull = Math.min(100, pl.hull + 6 * dt); pl.leak = 0;
    pl.eng = pl.eng.map(e => Math.min(100, e + 12 * dt));
    let full = pl.fuel >= 100 && pl.hull >= 100;
    this.seats.forEach((s, i) => { if (SEATS[i].gun) { s.ammo = Math.min(AMMO_MAX, s.ammo + 45 * dt); if (s.ammo < AMMO_MAX) full = false; } });
    if (pl.bombs < BOMBS_MAX) { full = false; if ((this.bombT += dt) > 1.2) { pl.bombs++; this.bombT = 0; } }
    if (full) { this.svc = false; this.msg('Ground crew: fully fueled and armed. Good hunting!'); }
  }
  serviced() {
    return this.pl.fuel >= 99.5 && this.pl.bombs >= BOMBS_MAX && this.seats.every((s, i) => !SEATS[i].gun || s.ammo >= AMMO_MAX - 1);
  }

  // ---------------------------------------------------------------- flight model
  physics(dt, c) {
    const pl = this.pl; if (pl.crashed) return;
    const nEng = pl.eng.filter(e => e > 0).length;
    if (pl.doomed) pl.thr = 0; else pl.thr = clamp(pl.thr + c.th * 0.6 * dt, 0, 1);
    const power = (pl.fuel > 0 ? pl.thr : 0) * nEng / 4;
    if (pl.fuel > 0) {
      pl.fuel = Math.max(0, pl.fuel - ((0.02 + 0.16 * pl.thr) * nEng / 4 + pl.leak) * dt);
      if (pl.fuel === 0) this.msg('OUT OF FUEL! Engines are dead.');
      else if (pl.fuel < 15 && this.phase === 'flight') this.once('lowfuel', 'Warning: fuel below 15%.');
    }
    pl.leak = Math.max(0, pl.leak - 0.003 * dt);
    const drag = 0.00027 * pl.spd * pl.spd * (1 + (pl.gear ? 0.35 : 0) + (pl.doors ? 0.1 : 0));
    let acc = power * 4.2 - drag;
    if (pl.ground) {
      if (pl.spd > 0 || acc < 0) acc -= (pl.gear ? 0.25 : 6) + c.br * 4.5;
      pl.spd = Math.max(0, pl.spd + acc * dt);
      pl.roll *= 1 - Math.min(1, 5 * dt);
      pl.yaw = wrap(pl.yaw + clamp(c.y + c.r, -1, 1) * 0.5 * Math.min(1, pl.spd / 8) * dt);
      const auth = clamp((pl.spd - 30) / 20, 0, 1);
      if (c.p > 0 && auth > 0) pl.pitch = Math.min(0.2, pl.pitch + c.p * 0.35 * auth * dt);
      else pl.pitch = Math.max(0, pl.pitch - 0.3 * dt);
      pl.x += -Math.sin(pl.yaw) * pl.spd * dt; pl.z += -Math.cos(pl.yaw) * pl.spd * dt; pl.y = 3; pl.vy = 0;
      if (pl.gear && ((pl.spd > 47 && pl.pitch > 0.05) || pl.spd > 68)) pl.ground = false;
    } else {
      acc -= G * Math.sin(pl.pitch);
      pl.spd = Math.max(20, pl.spd + acc * dt);
      const auth = clamp(pl.spd / 60, 0.2, 1);
      if (pl.doomed) { pl.pitch += (-0.6 - pl.pitch) * 0.4 * dt; pl.roll += 0.5 * dt; }
      else {
        pl.pitch = clamp(pl.pitch + c.p * 0.45 * auth * dt, -1, 1);
        pl.roll = clamp(pl.roll + c.r * 0.9 * auth * dt, -1.2, 1.2);
        if (c.r === 0) pl.roll -= pl.roll * 0.25 * dt;
      }
      let sink = 0;
      if (pl.spd < 46) { sink = (46 - pl.spd) * 0.7; if (!pl.doomed) pl.pitch += (-0.25 - pl.pitch) * 0.6 * dt; }
      pl.yaw = wrap(pl.yaw + (G * Math.tan(clamp(pl.roll, -1.2, 1.2)) / Math.max(pl.spd, 45) + c.y * 0.12) * dt);
      const cp = Math.cos(pl.pitch);
      pl.vy = Math.sin(pl.pitch) * pl.spd - sink;
      pl.x += -Math.sin(pl.yaw) * cp * pl.spd * dt; pl.z += -Math.cos(pl.yaw) * cp * pl.spd * dt; pl.y += pl.vy * dt;
      if (pl.y <= 3) {
        pl.y = 3;
        const hard = pl.vy < -8 || Math.abs(pl.roll) > 0.45 || pl.pitch < -0.3 || pl.doomed || (!pl.gear && pl.vy < -4);
        if (hard) { pl.crashed = true; pl.spd = 0; this.ev.push({ k: 'crash', x: r2(pl.x), y: 3, z: r2(pl.z) }); this.msg('The aircraft has crashed.'); }
        else {
          pl.ground = true; pl.pitch = Math.max(0, pl.pitch); pl.vy = 0;
          if (!pl.gear) { pl.hull = Math.max(1, pl.hull - 30); this.msg('Belly landing! Gear was up.'); }
          else if (this.phase === 'flight') this.msg('Touchdown! Brake (B) to a full stop.');
        }
      }
    }
  }

  // ---------------------------------------------------------------- bot pilot
  botPilot(dt) {
    const pl = this.pl, b = this.bot, c = { p: 0, r: 0, y: 0, th: 0, br: 0 };
    let thrDes = pl.thr, yawDes = pl.yaw, pitchDes = null, altDes = pl.y;
    if (pl.ground) {
      const hdgDes = clamp(pl.x * 0.01, -0.3, 0.3);
      c.y = clamp(wrap(hdgDes - pl.yaw) * 2, -1, 1);
      if (this.phase === 'ground') {
        if (!b.go && !this.serviced()) {
          thrDes = 0; c.br = 1; b.wait = 0;
          if (!this.svc && pl.spd < 0.5 && this.atBase()) { this.svc = true; this.msg('Pilot: ground crew, fill her up.'); }
        } else if ((b.wait += dt) > 4) {
          b.go = true; this.once('roll', 'Pilot: rolling for takeoff!');
          thrDes = 1; if (pl.spd > 50) c.p = 1;
        } else { thrDes = 0; c.br = 1; }
      } else { thrDes = 0; c.br = 1; }
    } else {
      const dHome = Math.hypot(pl.x, pl.z);
      const need = dHome / 95 * 0.17 * 1.25 + 9;
      const power = pl.fuel > 0 && pl.eng.some(e => e > 0);
      let outbound = pl.bombs > 0 && this.tgt.hp > 0 && this.phase === 'flight';
      if (outbound && (pl.fuel < need || !power)) { outbound = false; this.once('bingo', 'Pilot: we can\'t make the target. Returning to base.'); }
      let gearDes = false;
      if (pl.y < 60 && b.app !== 'final') { // climb-out
        pitchDes = 0.13; thrDes = 1; yawDes = pl.yaw;
      } else if (outbound) {
        const dx = this.tgt.x - pl.x, dz = this.tgt.z - pl.z, d = Math.hypot(dx, dz);
        if (b.egress) { yawDes = b.egressYaw; if (d > 5500) b.egress = false; }
        else { yawDes = Math.atan2(-dx, -dz); if (d < 500) { b.egress = true; b.egressYaw = pl.yaw; } }
        altDes = 1500; thrDes = 0.9; b.app = 'iaf';
      } else if (b.app !== 'final') {
        const dx = -pl.x, dz = IAF_Z - pl.z, d = Math.hypot(dx, dz);
        yawDes = Math.atan2(-dx, -dz); altDes = d > 10000 ? 1500 : 400; thrDes = pl.y > altDes + 100 ? 0.55 : 0.8;
        if (d < 700 || (pl.z > 3000 && pl.z < 7000 && Math.abs(pl.x) < 500 && Math.abs(pl.yaw) < 0.5)) { b.app = 'final'; this.once('final', 'Pilot: on final approach. Gear down.'); }
      } else {
        yawDes = clamp(pl.x * 0.0015, -0.8, 0.8);
        altDes = 3 + clamp((pl.z - 500) * 0.06, 0, 400);
        thrDes = clamp(0.45 + (68 - pl.spd) * 0.06, 0, 1); gearDes = true;
        if (pl.y < 13) { pitchDes = -0.025; thrDes = 0; }
        if (pl.z < 350 && (pl.y > 40 || Math.abs(pl.x) > 40)) { b.app = 'iaf'; }
      }
      pl.gear = gearDes || pl.y < 40 && b.app === 'final';
      if (pitchDes == null) pitchDes = clamp((altDes - pl.y) * 0.004, -0.14, 0.17);
      const rollDes = clamp(wrap(yawDes - pl.yaw) * 1.5, -0.6, 0.6);
      c.r = clamp((rollDes - pl.roll) * 2.5, -1, 1);
      c.p = clamp((pitchDes - pl.pitch) * 4, -1, 1);
    }
    c.th = clamp((thrDes - pl.thr) * 5, -1, 1);
    return c;
  }

  // ---------------------------------------------------------------- guns
  gunOrigin(i) {
    const pl = this.pl, o = rot(SEATS[i].gun.pos, pl.yaw, pl.pitch, pl.roll);
    return [pl.x + o[0], pl.y + o[1], pl.z + o[2]];
  }
  guns(dt) {
    const pl = this.pl, pv = planeVel(pl);
    SEATS.forEach((def, i) => {
      const g = def.gun, s = this.seats[i]; if (!g) return;
      s.cool -= dt;
      if (s.out || pl.crashed || this.phase === 'ended') { s.fire = false; return; }
      let fire = false;
      if (s.pid) { const inp = this.players.get(s.pid).in;[s.ay, s.ap] = clampAim(g, +inp.ay || 0, +inp.ap || 0); fire = !!inp.f; }
      else fire = this.botAim(i, s, g, dt, pv);
      s.fire = fire && s.ammo >= 1;
      if (s.fire && s.cool <= 0) {
        s.cool = 0.1; s.ammo -= 1;
        const sp = s.pid ? 0.004 : 0.028;
        const d = norm(rot(aimDir(s.ay + gauss() * sp, s.ap + gauss() * sp), pl.yaw, pl.pitch, pl.roll)), o = this.gunOrigin(i);
        this.bullets.push({ x: o[0], y: o[1], z: o[2], vx: d[0] * BULLET_SPD + pv[0], vy: d[1] * BULLET_SPD + pv[1], vz: d[2] * BULLET_SPD + pv[2], life: 1.3, seat: i });
      }
    });
  }
  botAim(i, s, g, dt, pv) {
    const pl = this.pl, o = this.gunOrigin(i);
    let best = null, bd = 650;
    for (const f of this.fighters) {
      if (f.dead) continue;
      const rel = [f.p[0] - o[0], f.p[1] - o[1], f.p[2] - o[2]], dist = Math.hypot(...rel);
      if (dist > bd) continue;
      const t = dist / BULLET_SPD;
      const l = irot(norm([rel[0] + (f.dir[0] * f.spd - pv[0]) * t, rel[1] + (f.dir[1] * f.spd - pv[1]) * t, rel[2] + (f.dir[2] * f.spd - pv[2]) * t]), pl.yaw, pl.pitch, pl.roll);
      const ay = Math.atan2(-l[0], -l[2]), ap = Math.asin(clamp(l[1], -1, 1));
      if (Math.abs(wrap(ay - g.yc)) > g.yr || ap < g.pmin || ap > g.pmax) continue;
      best = [ay, ap]; bd = dist;
    }
    const want = best || [g.yc, 0], rate = 2.5 * dt;
    const dy = wrap(want[0] - s.ay), dp = want[1] - s.ap;
    s.ay = wrap(s.ay + clamp(dy, -rate, rate)); s.ap += clamp(dp, -rate, rate);
    return !!best && Math.abs(dy) < 0.07 && Math.abs(dp) < 0.07;
  }
  updBullets(dt) {
    for (const b of this.bullets) {
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
      const sx = nx - b.x, sy = ny - b.y, sz = nz - b.z, sl2 = sx * sx + sy * sy + sz * sz;
      for (const f of this.fighters) {
        if (f.dead) continue;
        const t = clamp(((f.p[0] - b.x) * sx + (f.p[1] - b.y) * sy + (f.p[2] - b.z) * sz) / sl2, 0, 1);
        if (Math.hypot(b.x + sx * t - f.p[0], b.y + sy * t - f.p[1], b.z + sz * t - f.p[2]) < 9) {
          b.life = 0; f.hp -= 22; this.ev.push({ k: 'fhit', id: f.id });
          if (f.hp <= 0) {
            f.dead = true; f.t = 6; f.firing = false; this.kills++;
            const s = this.seats[b.seat]; s.kills++;
            const who = s.pid ? this.players.get(s.pid).name : SEATS[b.seat].name;
            this.ev.push({ k: 'kill', x: r2(f.p[0]), y: r2(f.p[1]), z: r2(f.p[2]) }); this.msg(`${who} shot down a fighter!`);
          }
          break;
        }
      }
      b.x = nx; b.y = ny; b.z = nz; b.life -= dt;
    }
    this.bullets = this.bullets.filter(b => b.life > 0 && b.y > 0);
  }

  // ---------------------------------------------------------------- bombs
  bombardier(dt) {
    const s = this.seats[1], pl = this.pl; this.dropCool -= dt;
    if (s.out || pl.crashed || this.phase === 'ended') return;
    let drop = false;
    if (s.pid) drop = !!this.players.get(s.pid).in.d;
    else if (!pl.ground) {
      const d = Math.hypot(this.tgt.x - pl.x, this.tgt.z - pl.z);
      const want = pl.bombs > 0 && this.tgt.hp > 0 && d < 4500;
      if (pl.doors !== want) { pl.doors = want; this.msg(`Bombardier: bomb bay doors ${want ? 'open' : 'closed'}.`); }
      if (want) { const I = impactPoint(pl); if (Math.hypot(I.x - this.tgt.x, I.z - this.tgt.z) < 110) this.botDropping = true; }
      if (pl.bombs === 0) this.botDropping = false;
      drop = this.botDropping;
    }
    if (drop && pl.doors && pl.bombs > 0 && this.dropCool <= 0 && !pl.ground) {
      if (pl.bombs === BOMBS_MAX) this.msg('Bombs away!');
      pl.bombs--; this.dropCool = 0.18;
      const v = planeVel(pl);
      this.bombsAir.push({ id: this.uid++, x: pl.x, y: pl.y - 2, z: pl.z, vx: v[0], vy: v[1], vz: v[2] });
    }
  }
  updBombs(dt) {
    for (const b of this.bombsAir) {
      b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y <= 0) {
        b.done = true; this.ev.push({ k: 'boom', x: r2(b.x), z: r2(b.z) });
        const d = Math.hypot(b.x - this.tgt.x, b.z - this.tgt.z), dmg = d < 80 ? 34 : d < 200 ? 20 : d < 350 ? 8 : 0;
        if (dmg && this.tgt.hp > 0) { this.tgt.hp = Math.max(0, this.tgt.hp - dmg); if (this.tgt.hp === 0) this.msg('TARGET DESTROYED! Turn for home.'); }
      }
    }
    const had = this.bombsAir.length; this.bombsAir = this.bombsAir.filter(b => !b.done);
    if (had && !this.bombsAir.length && this.pl.bombs === 0 && this.tgt.hp > 0) this.msg(`Target still standing (${Math.round(this.tgt.hp)}%). Mission won't count — return to base.`);
  }

  // ---------------------------------------------------------------- fighters
  applyHit() {
    const pl = this.pl, r = Math.random();
    if (r < 0.6) pl.hull -= 2.5;
    else if (r < 0.85) {
      const i = Math.floor(Math.random() * 4);
      if (pl.eng[i] > 0) { pl.eng[i] = Math.max(0, pl.eng[i] - 17); if (pl.eng[i] === 0) this.msg(`Engine ${i + 1} is knocked out!`); } else pl.hull -= 1.5;
    } else if (r < 0.95) { if (pl.leak < 0.01) this.msg('Fuel tank hit — we\'re leaking fuel!'); pl.leak += 0.06; }
    else pl.hull -= 4;
    this.ev.push({ k: 'hit' });
    pl.hull = Math.max(0, pl.hull);
    if (pl.hull <= 0 && !pl.doomed) { pl.doomed = true; this.msg('WE\'RE GOING DOWN! BAIL OUT! (press J)'); }
  }
  updFighters(dt) {
    const pl = this.pl, pv = planeVel(pl), lvl = this.level();
    const homebound = pl.bombs === 0 || this.tgt.hp <= 0;
    const away = Math.hypot(pl.x, pl.z) > (homebound ? 6500 : 3000) && !pl.ground && !pl.crashed && this.phase === 'flight';
    if (away) {
      this.waveT -= dt;
      const alive = this.fighters.filter(f => !f.dead).length;
      if (this.waveT <= 0 && alive < 2) {
        this.waveT = Math.max(30, 44 - lvl);
        const n = Math.min(2 + Math.floor(lvl / 4), 5), brg = Math.random() * Math.PI * 2, hi = rnd(150, 700);
        for (let i = 0; i < n; i++) {
          const a = brg + rnd(-0.2, 0.2), p = [pl.x + Math.sin(a) * 3500, Math.max(300, pl.y + hi + rnd(-80, 80)), pl.z + Math.cos(a) * 3500 + i * 60];
          this.fighters.push({ id: this.uid++, p, dir: norm([pl.x - p[0], pl.y - p[1], pl.z - p[2]]), spd: rnd(140, 160), hp: 100, state: 'attack', burst: 2.5, t: 0, firing: false, dead: false });
        }
        const l = irot([Math.sin(brg), 0, Math.cos(brg)], pl.yaw, 0, 0);
        const clock = ((Math.round(Math.atan2(l[0], -l[2]) / (Math.PI / 6)) + 12) % 12) || 12;
        this.msg(`Bandits! ${n} fighters, ${clock} o'clock high!`);
      }
    }
    for (const f of this.fighters) {
      if (f.dead) {
        f.dir[1] -= 0.5 * dt; f.dir = norm(f.dir); f.t -= dt;
        f.p[0] += f.dir[0] * f.spd * dt; f.p[1] += f.dir[1] * f.spd * dt; f.p[2] += f.dir[2] * f.spd * dt;
        if (f.t <= 0 || f.p[1] <= 0) { f.gone = true; this.ev.push({ k: 'kill', x: r2(f.p[0]), y: r2(Math.max(0, f.p[1])), z: r2(f.p[2]) }); }
        continue;
      }
      const rel = [pl.x - f.p[0], pl.y - f.p[1], pl.z - f.p[2]], dist = Math.hypot(...rel);
      if (!away) f.state = 'flee';
      let des; f.firing = false;
      if (f.state === 'attack') {
        const t = dist / 700;
        des = norm([rel[0] + pv[0] * t, rel[1] + pv[1] * t, rel[2] + pv[2] * t]);
        const ang = Math.acos(clamp(des[0] * f.dir[0] + des[1] * f.dir[1] + des[2] * f.dir[2], -1, 1));
        if (dist < 650 && ang < 0.09) { f.firing = true; f.burst -= dt; if (Math.random() < 0.045 * dt * 30) this.applyHit(); }
        if (dist < 170 || f.burst <= 0) {
          f.state = 'break'; f.t = rnd(4, 7);
          f.bdir = norm([f.dir[0] + rnd(-0.5, 0.5), f.dir[1] + rnd(-0.35, 0.35), f.dir[2] + rnd(-0.5, 0.5)]);
        }
      } else if (f.state === 'break') { des = f.bdir; if ((f.t -= dt) <= 0) { f.state = 'attack'; f.burst = 2.5; } }
      else { des = norm([-rel[0], 300, -rel[2]]); if (dist > 6000) f.gone = true; }
      if (f.p[1] < 250) des = norm([des[0], Math.abs(des[1]) + 0.5, des[2]]);
      steer(f.dir, des, 0.9 * dt);
      f.p[0] += f.dir[0] * f.spd * dt; f.p[1] += f.dir[1] * f.spd * dt; f.p[2] += f.dir[2] * f.spd * dt;
    }
    this.fighters = this.fighters.filter(f => !f.gone);
  }

  // ---------------------------------------------------------------- network
  snapshot() {
    const pl = this.pl;
    const s = {
      t: 's', mid: this.mid, ph: this.phase, svc: this.svc ? 1 : 0, endT: Math.ceil(this.endT), res: this.result,
      pl: { x: r2(pl.x), y: r2(pl.y), z: r2(pl.z), yaw: r3(pl.yaw), pitch: r3(pl.pitch), roll: r3(pl.roll), spd: r2(pl.spd), vy: r2(pl.vy), thr: r2(pl.thr),
        gear: pl.gear ? 1 : 0, doors: pl.doors ? 1 : 0, ground: pl.ground ? 1 : 0, fuel: r2(pl.fuel), leak: pl.leak > 0.005 ? 1 : 0, hull: Math.round(pl.hull),
        bombs: pl.bombs, doomed: pl.doomed ? 1 : 0, crashed: pl.crashed ? 1 : 0, eng: pl.eng.map(e => Math.round(e)) },
      st: this.seats.map(s => { const p = s.pid && this.players.get(s.pid); return [s.pid || 0, p ? p.name : '', p ? p.missions : 0, Math.floor(s.ammo), r3(s.ay), r3(s.ap), s.fire ? 1 : 0, s.out ? 1 : 0, s.kills]; }),
      f: this.fighters.map(f => [f.id, r2(f.p[0]), r2(f.p[1]), r2(f.p[2]), r2(f.dir[0] * f.spd), r2(f.dir[1] * f.spd), r2(f.dir[2] * f.spd), (f.firing ? 1 : 0) | (f.dead ? 2 : 0)]),
      b: this.bombsAir.map(b => [b.id, r2(b.x), r2(b.y), r2(b.z)]),
      c: this.chutes.map(c => [c.id, r2(c.x), r2(c.y), r2(c.z), c.pid]),
      tg: [r2(this.tgt.x), r2(this.tgt.z), Math.round(this.tgt.hp)],
      ev: this.ev,
    };
    this.ev = [];
    return s;
  }
}
