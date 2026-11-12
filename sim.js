// Authoritative game simulation for one bomber crew ("room").
import { SCALE, SEATS, AMMO_MAX, BOMBS_MAX, BULLET_SPD, G, BAY, DOOR, WALK_Z0, WALK_Z1, halfW, rot, irot, wrap, clamp, aimDir, clampAim, planeVel, impactPoint } from './public/shared.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
const r2 = x => Math.round(x * 100) / 100;
const r3 = x => Math.round(x * 1000) / 1000;
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const IAF_Z = 6000;          // approach fix south of the runway
const BASE_R = 2200;         // radius that counts as "at base"
const ALT = 1200, CRUISE = 82, LEAD_TURN = 0.035;
// formation slots relative to the leader: [right, up, back]
const SLOTS = [[0, 0, 0], [70, 12, 55], [140, 24, 110], [-140, -24, 110], [0, -28, 125], [75, -14, 180], [-75, -40, 185]];
const MY_SLOT = [-70, -12, 55];
const FIRE_RANGE = [650, 320, 0];
export const MAX_PLAYERS = SEATS.length;
const pick = a => a[Math.floor(Math.random() * a.length)];
const NAMES = ['Kowalski', 'Miller', 'O\'Brien', 'Rossi', 'Novak', 'Jensen', 'Baker', 'Morales', 'Sullivan', 'Becker', 'Hayes', 'Dubois', 'Carter', 'Lindqvist', 'Russo', 'Tanner', 'Whitaker', 'Zielinski'];
const TALK = {
  spot: ['Fighter, {c} o\'clock {h}, coming in!', 'Bandit at {c} o\'clock {h}!', 'Here he comes, {c} o\'clock {h}!', 'I got one at {c} o\'clock {h}. Watch him!'],
  kill: ['Got him! Scratch one fighter.', 'He\'s burning! That\'s a kill.', 'Splash one! Did you see that?', 'I got him, I got him!', 'One less to worry about.'],
  hit: ['We\'re taking hits!', 'They\'re chewing us up back here!', 'Holes all over, but I\'m OK.', 'That one was close!', 'Somebody get that guy off us!'],
  ammo: ['I\'m down to my last hundred rounds.', 'Running low on ammo here.'],
  idle: ['Sure is cold up here.', 'Oxygen check. I\'m OK.', 'Keep your eyes peeled, they\'re out there.', 'Formation\'s looking tight, skipper.', 'Quiet. Too quiet.', 'Anybody got eyes on our little friends?'],
  flak: ['Flak! Twelve o\'clock level!', 'Flak ahead. Here we go.', 'That flak is thick enough to walk on.'],
  away: ['Bombs gone! Let\'s get out of here.', 'There they go. Take us home.'],
  boom: ['Look at that! Right on the money.', 'Target\'s burning. Beautiful.'],
  land: ['Nice landing, skipper.', 'Home sweet home.', 'First round is on me, boys.'],
};

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
    const pool = [...NAMES].sort(() => Math.random() - 0.5); this.crew = SEATS.map((s, i) => pool[i]);
    this.newMission();
  }

  level() {
    let m = 0, n = 0;
    for (const p of this.players.values()) { m += p.missions; n++; }
    return n ? Math.floor(m / n) : 0;
  }

  // Every mission starts in the air, in formation, inbound to the target.
  newMission() {
    this.mid++;
    const ta = rnd(0, Math.PI * 2), td = rnd(12000, 14000);
    this.tgt = { x: Math.sin(ta) * td, z: Math.cos(ta) * td, hp: 100 };
    const sa = ta + (Math.random() < 0.5 ? 1 : -1) * rnd(1.3, 1.8), sd = 9500;
    const sx = this.tgt.x + Math.sin(sa) * sd, sz = this.tgt.z + Math.cos(sa) * sd;
    const yaw = Math.atan2(-(this.tgt.x - sx), -(this.tgt.z - sz));
    this.lead = { x: sx, y: ALT, z: sz, yaw, spd: CRUISE, tr: 0, leg: 0, t: 0 };
    this.wing = SLOTS.map(o => ({ id: this.uid++, o, hp: 100, dead: false, x: 0, y: 0, z: 0, yaw, pitch: 0, roll: 0, vy: 0, fid: 0, bombs: 4, dropT: 0 }));
    this.placeWing(0);
    const s = this.slotPos();
    this.pl = { x: s[0], y: s[1], z: s[2], yaw, pitch: 0, roll: 0, spd: CRUISE, vy: 0, thr: 0.44, gear: false, doors: false, ground: false,
      fuel: 100, leak: 0, hull: 100, eng: [100, 100, 100, 100], bombs: BOMBS_MAX, doomed: false, crashed: false };
    this.seats = SEATS.map(d => ({ pid: null, ammo: d.gun ? AMMO_MAX : 0, ay: d.gun ? d.gun.yc : 0, ap: 0, fire: false, cool: 0, out: false, kills: 0, bailT: null,
      tid: 0, react: 0, burst: 1, pause: 0, wob: [0, 0], low: false }));
    this.talkT = 6; this.idleT = rnd(20, 40); this.flakT = 0; this.ctl = { p: 0, r: 0 };
    this.phase = 'flight'; this.dropCool = 0; this.botDropping = false; this.botDoors = false; this.formDrop = false;
    this.ord = { fire: 0, bomb: 0, ap: 0, focus: 0 };
    this.fighters = []; this.bullets = []; this.bombsAir = []; this.chutes = []; this.ev = [];
    this.waveT = 10; this.result = null; this.endT = 0; this.crashT = 0; this.noCrewT = 0; this.kills = 0; this.fkills = 0;
    this.bot = { app: 'iaf', broke: false, said: {} };
    for (const p of this.players.values()) { p.bailed = false; p.foot = null; p.walk = null; const s = p.seat; p.seat = -1; if (s >= 0 && !this.seats[s].pid) { this.seats[s].pid = p.id; p.seat = s; } }
    for (const p of this.players.values()) if (p.seat < 0) this.autoSeat(p);
    this.msg(`Mission ${this.mid}: you are in formation, ${(sd / 1000).toFixed(0)} km from the target. Hold your slot and watch for fighters.`);
  }

  msg(s) { this.ev.push({ k: 'msg', s }); }
  // Intercom: a bot crewman says something. Rate limited so the crew doesn't talk over itself.
  say(i, kind, vars, force) {
    const s = this.seats[i];
    if (i < 0 || s.pid || s.out || this.phase !== 'flight' || (!force && this.talkT > 0)) return;
    let line = pick(TALK[kind]); for (const k in vars || {}) line = line.replace(`{${k}}`, vars[k]);
    this.talkT = rnd(2.5, 4.5); this.ev.push({ k: 'msg', s: `${SEATS[i].name} ${this.crew[i]}: ${line}`, r: 1 });
  }
  anyBot() { const a = this.seats.map((s, i) => i).filter(i => !this.seats[i].pid && !this.seats[i].out); return a.length ? pick(a) : -1; }
  once(key, s) { if (!this.bot.said[key]) { this.bot.said[key] = 1; this.msg(s); } }

  autoSeat(p) {
    const i = this.seats.findIndex(s => !s.pid);
    p.seat = i; if (i >= 0) { this.seats[i].pid = p.id; this.takeAim(p, i); }
  }
  takeAim(p, i) { p.in.f = 0; p.in.d = 0; if (SEATS[i].gun) { p.in.ay = this.seats[i].ay; p.in.ap = this.seats[i].ap; } }
  addPlayer(p) {
    p.in = { p: 0, r: 0, y: 0, th: 0, br: 0, ay: 0, ap: 0, f: 0, d: 0 }; p.bailed = false; p.foot = null; p.walk = null; p.seat = -1;
    this.players.set(p.id, p);
    if (this.pl.crashed || this.phase === 'ended' && this.result.outcome === 'lost') p.bailed = true; else this.autoSeat(p);
    this.msg(`${p.name} joined the crew.`);
  }
  removePlayer(p) {
    if (p.seat >= 0) this.seats[p.seat].pid = null;
    this.players.delete(p.id); this.msg(`${p.name} left the crew.`);
  }
  // Take a station: instantly from another seat (keys 1-7), or by walking up to it.
  setSeat(p, i) {
    const s = this.seats[i];
    if (!s || p.bailed || p.foot || s.pid || this.pl.crashed) return;
    if (p.walk) { const st = SEATS[i].st; if (Math.hypot(p.walk.x - st[0], p.walk.z - st[1]) > 1.5) return; p.walk = null; }
    else if (p.seat < 0) return;
    else this.seats[p.seat].pid = null;
    s.pid = p.id; p.seat = i; this.takeAim(p, i);
  }
  atBase() { return Math.hypot(this.pl.x, this.pl.z + 300) < BASE_R; }
  doorGround() { const pl = this.pl, o = rot([(DOOR.x + 1.6) * SCALE, 0, DOOR.z * SCALE], pl.yaw, 0, 0); return [pl.x + o[0], pl.z + o[2]]; }

  action(p, a, m) {
    const pl = this.pl;
    if (a === 'next') { if (this.phase === 'ended' && this.endT > 0.5) this.endT = 0.5; return; }
    if (pl.crashed || p.bailed) return;
    if (a === 'board') {          // climb in through the crew door
      const d = this.doorGround();
      if (p.foot && pl.ground && pl.spd < 3 && Math.hypot(p.foot.x - d[0], p.foot.z - d[1]) < 7) {
        p.foot = null; p.walk = { x: 0.3, z: DOOR.z, yaw: Math.PI / 2 }; p.in.lx = p.in.lz = p.in.ly = undefined;
        this.msg(`${p.name} climbed aboard.`);
      }
      return;
    }
    if (p.foot) return;
    if (a === 'up') {             // get up from a station and walk
      if (p.seat < 0) return;
      const i = p.seat; this.seats[i].pid = null; p.seat = -1;
      p.walk = { x: SEATS[i].st[0], z: SEATS[i].st[1], yaw: 0 }; p.in.lx = p.in.lz = p.in.ly = undefined;
    } else if (a === 'out') {     // climb out of the crew door (parked only)
      if (p.walk && pl.ground && pl.spd < 1 && Math.abs(p.walk.z - DOOR.z) < 1.2) {
        const d = this.doorGround();
        p.walk = null; p.foot = { x: d[0], z: d[1], yaw: wrap(pl.yaw - Math.PI / 2) }; p.in.fx = p.in.fz = p.in.fy = undefined;
        this.msg(`${p.name} climbed out onto the field.`);
      }
    } else if (a === 'doors') this.setDoors(!pl.doors, p.name);
    else if (a === 'gear') { if (p.seat === 0 && !pl.ground) pl.gear = !pl.gear; }
    else if (a === 'order') this.order(p, m.n | 0, m.id | 0);
  }
  setDoors(open, who) {
    this.pl.doors = open; this.botDoors = false;
    this.msg(`${who}: bomb bay doors ${open ? 'open' : 'closed'}.`);
  }
  // Orders to the bot crew. n indexes ORDERS in shared.js.
  order(p, n, id) {
    const o = this.ord, say = (order, reply) => { this.msg(`${p.name}: ${order}`); if (reply) this.msg(reply); };
    if (this.phase !== 'flight') return;
    if (n === 0) this.setDoors(!this.pl.doors, p.name);
    else if (n === 1) { o.fire = 0; say('Gunners, fire at will!', 'Gunners: roger, weapons free.'); }
    else if (n === 2) { o.fire = 1; say('Gunners, hold until they are close.', 'Gunners: roger, short range only.'); }
    else if (n === 3) { o.fire = 2; say('Gunners, hold your fire!', 'Gunners: holding fire.'); }
    else if (n === 4) {
      const f = this.fighters.find(f => f.id === id && !f.dead);
      if (f) { o.focus = id; say('All guns on the fighter I marked!', 'Gunners: on him.'); }
    }
    else if (n === 5) { o.bomb = 0; say('Bombardier, the drop is yours.', this.seats[1].pid || this.seats[1].out ? '' : 'Bombardier: roger, I have the bomb run.'); }
    else if (n === 6) { o.bomb = 1; this.botDropping = false; say('Bombardier, hold the bombs.', this.seats[1].pid || this.seats[1].out ? '' : 'Bombardier: holding.'); }
    else if (n === 7) {
      if (this.pl.ground || !this.pl.bombs) return;
      o.bomb = 2; this.botDropping = true; if (!this.pl.doors) { this.pl.doors = true; this.botDoors = true; }
      say('Bombardier, salvo! Drop them all!', this.seats[1].pid || this.seats[1].out ? '' : 'Bombardier: salvo!');
    }
    else if (n === 8) { o.ap = 0; this.bot.broke = false; this.bot.app = 'iaf'; say('Copilot, keep us in formation.', 'Copilot: holding our slot.'); }
    else if (n === 9) { o.ap = 1; say('Copilot, take us home.', 'Copilot: heading for base.'); }
  }

  // bot crewman i leaves the ship
  bail(i) {
    const s = this.seats[i], pl = this.pl; if (s.out) return;
    s.out = true;
    if (s.pid) return;            // a player holds the station; the spare crewman just goes
    s.fire = false;
    this.chutes.push({ id: this.uid++, x: pl.x, y: pl.y - 3, z: pl.z, vy: Math.min(pl.vy, -5), pid: 0, t: 0.8 });
    this.msg(`${SEATS[i].name} ${this.crew[i]} bailed out!`);
  }
  // a player went out through the open bomb bay
  dropOut(p) {
    const pl = this.pl, w = p.walk, o = rot([w.x * SCALE, -1.7 * SCALE, w.z * SCALE], pl.yaw, pl.pitch, pl.roll);
    p.walk = null;
    if (pl.ground) {
      p.foot = { x: pl.x + o[0], z: pl.z + o[2], yaw: wrap(pl.yaw + w.yaw) }; p.in.fx = p.in.fz = p.in.fy = undefined;
      this.msg(`${p.name} dropped out of the bomb bay.`);
    } else {
      p.bailed = true;
      this.chutes.push({ id: this.uid++, x: pl.x + o[0], y: pl.y + o[1], z: pl.z + o[2], vy: Math.min(pl.vy, 0) - 4, pid: p.id, t: 1.6 });
      this.msg(`${p.name} jumped from the bomb bay!`);
    }
  }

  // ---------------------------------------------------------------- tick
  tick(dt) {
    if (this.phase === 'ended') { this.endT -= dt; if (this.endT <= 0) this.newMission(); }
    const pl = this.pl;

    // pilot controls
    let c = { p: 0, r: 0, y: 0, th: 0, br: 0 };
    const ps = this.seats[0];
    if (this.phase !== 'ended') {
      if (ps.pid) { const i = this.players.get(ps.pid).in; c = { p: clamp(+i.p || 0, -1, 1), r: clamp(+i.r || 0, -1, 1), y: clamp(+i.y || 0, -1, 1), th: clamp(+i.th || 0, -1, 1), br: i.br ? 1 : 0 }; }
      else if (!ps.out) c = this.botPilot(dt);
    } else c.br = 1;

    this.ctl = c; this.talkT -= dt;
    if (this.phase === 'flight' && (this.idleT -= dt) <= 0) { this.idleT = rnd(35, 70); if (!this.fighters.some(f => !f.dead)) this.say(this.anyBot(), 'idle'); }
    this.moveCrew(dt);
    this.physics(dt, c);
    this.flak(dt);
    this.updFormation(dt);
    this.guns(dt);
    this.bombardier(dt);
    this.updBullets(dt);
    this.updBombs(dt);
    this.updFighters(dt);
    for (const ch of this.chutes) {
      if (ch.y <= 0) continue;
      if (ch.t > 0) { ch.t -= dt; ch.vy -= G * dt; } else ch.vy += (-6.5 - ch.vy) * Math.min(1, 1.5 * dt);
      ch.y = Math.max(0, ch.y + ch.vy * dt);
    }

    // bots abandon a doomed ship
    if (pl.doomed && !pl.ground && !pl.crashed) this.seats.forEach((s, i) => {
      if (s.out) return;
      if (s.bailT == null) s.bailT = rnd(0.6, 3);
      if ((s.bailT -= dt) <= 0) this.bail(i);
    });

    // end conditions
    if (this.phase !== 'ended') {
      let aboard = 0; for (const p of this.players.values()) if (!p.bailed && !p.foot) aboard++;
      if (pl.crashed) { if ((this.crashT += dt) > 3) this.end('lost'); }
      else if (pl.ground && pl.spd < 0.5) this.end(this.atBase() ? (this.tgt.hp <= 0 ? 'success' : 'aborted') : 'ditched');
      else if (aboard === 0 && this.players.size) { if ((this.noCrewT += dt) > 6) this.end('lost'); }
    }
  }

  // Anti-aircraft fire over the target.
  flak(dt) {
    const pl = this.pl;
    if (this.phase !== 'flight' || pl.ground || pl.crashed || Math.hypot(this.tgt.x - pl.x, this.tgt.z - pl.z) > 5000 || this.tgt.hp <= 0) return;
    if (!this.bot.said.flak) { this.bot.said.flak = 1; this.say(this.anyBot(), 'flak', null, true); }
    if ((this.flakT -= dt) > 0) return;
    this.flakT = rnd(0.25, 0.9);
    const v = planeVel(pl), t = rnd(0.3, 1.6), o = [rnd(-220, 220), rnd(-70, 70), rnd(-220, 220)];
    if (Math.random() < 0.12) { o[0] *= 0.15; o[1] *= 0.15; o[2] *= 0.15; }          // now and then one goes off close
    const x = pl.x + v[0] * t + o[0], y = pl.y + o[1], z = pl.z + v[2] * t + o[2];
    this.ev.push({ k: 'flak', x: r2(x), y: r2(y), z: r2(z) });
    if (Math.hypot(...o) < 45 && Math.random() < 0.6) this.applyHit(true);
  }

  end(outcome) {
    this.phase = 'ended'; this.endT = outcome === 'lost' ? 14 : 90;   // after a landing the crew gets time to climb out and walk around
    const res = { outcome, tgt: this.tgt.hp <= 0, kills: this.kills, fkills: this.fkills, lost: this.wing.filter(b => b.dead).length + SLOTS.length - this.wing.length, players: [] };
    for (const p of this.players.values()) {
      const status = p.bailed ? 'bailed' : outcome === 'success' ? 'credit' : outcome === 'lost' ? 'kia' : 'none';
      if (status === 'credit') p.missions++;
      res.players.push({ id: p.id, name: p.name, status, missions: p.missions });
    }
    if (outcome === 'success') this.wins++;
    this.result = res;
  }

  // Crew walking inside the fuselage (plane-local) or on the field (world).
  moveCrew(dt) {
    const pl = this.pl;
    for (const p of this.players.values()) {
      const w = p.walk, f = p.foot;
      if (w) {
        const nx = +p.in.lx, nz = +p.in.lz, ny = +p.in.ly;
        if (Number.isFinite(nx) && Number.isFinite(nz)) {
          const dx = nx - w.x, dz = nz - w.z, l = Math.hypot(dx, dz), max = 6 * dt + 0.3, k = l > max ? max / l : 1;
          w.z = clamp(w.z + dz * k, WALK_Z0, WALK_Z1);
          const hw = halfW(w.z, pl.doors); w.x = clamp(w.x + dx * k, -hw, hw);
        }
        if (Number.isFinite(ny)) w.yaw = wrap(ny);
        if (pl.crashed) continue;
        if (pl.doors && w.z > BAY.z0 && w.z < BAY.z1 && Math.abs(w.x) > BAY.fall) this.dropOut(p);
      } else if (f) {
        const nx = +p.in.fx, nz = +p.in.fz, ny = +p.in.fy;
        if (Number.isFinite(nx) && Number.isFinite(nz)) {
          const dx = nx - f.x, dz = nz - f.z, l = Math.hypot(dx, dz), max = 14 * dt + 0.5, k = l > max ? max / l : 1;
          f.x = clamp(f.x + dx * k, pl.x - 150, pl.x + 150); f.z = clamp(f.z + dz * k, pl.z - 150, pl.z + 150);
        }
        if (Number.isFinite(ny)) f.yaw = wrap(ny);
      }
    }
  }

  // ---------------------------------------------------------------- flight model
  physics(dt, c) {
    const pl = this.pl; if (pl.crashed) return;
    const nEng = pl.eng.filter(e => e > 0).length;
    if (pl.doomed) pl.thr = 0; else pl.thr = clamp(pl.thr + c.th * 0.6 * dt, 0, 1);
    const power = (pl.fuel > 0 ? pl.thr : 0) * nEng / 4;
    if (pl.fuel > 0 && !(pl.ground && pl.thr < 0.02)) {
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
      if (pl.gear && this.phase === 'flight' && ((pl.spd > 47 && pl.pitch > 0.05) || pl.spd > 68)) pl.ground = false;
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
          else if (this.phase === 'flight') { this.msg('Touchdown! Brake (B) to a full stop.'); this.say(this.anyBot(), 'land', null, true); }
        }
      }
    }
  }

  // ---------------------------------------------------------------- formation
  leadVel() { const L = this.lead; return [-Math.sin(L.yaw) * L.spd, 0, -Math.cos(L.yaw) * L.spd]; }
  slotPos() { const L = this.lead, o = rot(MY_SLOT, L.yaw, 0, 0); return [L.x + o[0], L.y + o[1], L.z + o[2]]; }
  placeWing(t) {
    const L = this.lead;
    this.wing.forEach((b, i) => {
      if (b.dead) return;
      const o = rot(b.o, L.yaw, 0, 0);
      b.x = L.x + o[0]; b.y = L.y + o[1] + Math.sin(t * 0.35 + i * 1.7) * 2.5; b.z = L.z + o[2];
      b.yaw = L.yaw; b.roll = L.tr / LEAD_TURN * 0.3 + Math.sin(t * 0.5 + i) * 0.02; b.pitch = 0;
    });
  }
  killWing(b) {
    b.dead = true; b.vy = 0; b.fid = 0;
    this.ev.push({ k: 'kill', x: r2(b.x), y: r2(b.y), z: r2(b.z) });
    for (let i = 0, n = 2 + Math.floor(Math.random() * 5); i < n; i++) this.chutes.push({ id: this.uid++, x: b.x + rnd(-30, 30), y: b.y - 5, z: b.z + i * 25, vy: -6, pid: 0, t: rnd(0.5, 2) });
    this.msg('A Fortress in the formation is going down!');
  }
  updFormation(dt) {
    const L = this.lead, fw = [-Math.sin(L.yaw), -Math.cos(L.yaw)];
    L.t += dt;
    // route: target, then home over the field, then straight on
    const wp = L.leg === 0 ? this.tgt : L.leg === 1 ? { x: 0, z: 0 } : null;
    let tr = 0;
    if (wp) {
      const dx = wp.x - L.x, dz = wp.z - L.z, along = dx * fw[0] + dz * fw[1];
      if (along < -300 && Math.hypot(dx, dz) < 4000) L.leg++;
      else tr = clamp(wrap(Math.atan2(-dx, -dz) - L.yaw) * 0.5, -LEAD_TURN, LEAD_TURN);
    }
    L.tr += (tr - L.tr) * Math.min(1, 0.8 * dt);
    L.yaw = wrap(L.yaw + L.tr * dt);
    L.x += fw[0] * L.spd * dt; L.z += fw[1] * L.spd * dt;
    this.placeWing(L.t);
    // the formation bombs when the leader's sight crosses the target
    if (L.leg === 0 && !this.formDrop) {
      const I = impactPoint({ x: L.x, y: L.y, z: L.z, yaw: L.yaw, pitch: 0, spd: L.spd, vy: 0 });
      if ((this.tgt.x - I.x) * fw[0] + (this.tgt.z - I.z) * fw[1] < 0) { this.formDrop = true; this.msg('Formation leader: bombs away!'); }
    }
    const v = this.leadVel();
    for (const b of this.wing) {
      if (b.dead) {                 // going down
        b.vy -= 5 * dt; b.pitch += (-0.7 - b.pitch) * 0.5 * dt; b.roll += 0.45 * dt;
        b.x += -Math.sin(b.yaw) * 70 * dt; b.z += -Math.cos(b.yaw) * 70 * dt; b.y += b.vy * dt;
        if (b.y <= 0) { b.gone = true; this.ev.push({ k: 'crash', x: r2(b.x), y: 2, z: r2(b.z) }); }
        continue;
      }
      if (this.formDrop && b.bombs > 0 && (b.dropT -= dt) <= 0) {
        b.bombs--; b.dropT = 0.22;
        this.bombsAir.push({ id: this.uid++, x: b.x, y: b.y - 2, z: b.z, vx: v[0], vy: 0, vz: v[2], k: 0.06 });
      }
      // defensive fire at the nearest fighter in range
      let best = null, bd = 600;
      for (const f of this.fighters) { if (f.dead) continue; const d = Math.hypot(f.p[0] - b.x, f.p[1] - b.y, f.p[2] - b.z); if (d < bd) { bd = d; best = f; } }
      b.fid = best ? best.id : 0;
      if (best && Math.random() < 0.1 * dt) this.hitFighter(best, 22, null);
    }
    this.wing = this.wing.filter(b => !b.gone);
  }

  // ---------------------------------------------------------------- bot pilot
  botPilot(dt) {
    const pl = this.pl, b = this.bot, L = this.lead, c = { p: 0, r: 0, y: 0, th: 0, br: 0 };
    let thrDes = pl.thr, yawDes = pl.yaw, pitchDes = null, altDes = pl.y, rollFF = 0;
    if (pl.ground) {
      c.y = clamp(wrap(clamp(pl.x * 0.01, -0.3, 0.3) - pl.yaw) * 2, -1, 1);
      thrDes = 0; c.br = 1;
    } else {
      const dHome = Math.hypot(pl.x, pl.z);
      const need = dHome / 95 * 0.17 * 1.25 + 9;
      const power = pl.fuel > 0 && pl.eng.some(e => e > 0);
      let form = this.ord.ap === 0 && !b.broke && L.leg < 2;
      if (form && (pl.fuel < need || !power)) { form = false; b.broke = true; this.once('bingo', 'Copilot: we can\'t stay with the formation. Heading for base.'); }
      if (form && L.leg >= 1 && dHome < 7500) { form = false; b.broke = true; this.once('break', 'Copilot: field in sight. Breaking formation to land.'); }
      let gearDes = false;
      if (pl.y < 60 && b.app !== 'final') { // too low: climb
        pitchDes = 0.13; thrDes = 1; yawDes = pl.yaw;
      } else if (form) {
        const s = this.slotPos(), rel = irot([s[0] - pl.x, 0, s[2] - pl.z], L.yaw, 0, 0), side = rel[0], ahead = -rel[2];
        if (Math.hypot(side, ahead) > 1500) { yawDes = Math.atan2(-(s[0] - pl.x), -(s[2] - pl.z)); thrDes = 1; }
        else {
          yawDes = L.yaw - clamp(side * 0.0022, -0.45, 0.45);
          rollFF = Math.atan(L.tr * pl.spd / G);
          thrDes = clamp(0.44 + (L.spd + clamp(ahead * 0.1, -14, 26) - pl.spd) * 0.09, 0, 1);
        }
        altDes = s[1]; b.app = 'iaf';
      } else if (b.app !== 'final') {
        const dx = -pl.x, dz = IAF_Z - pl.z, d = Math.hypot(dx, dz);
        yawDes = Math.atan2(-dx, -dz); altDes = 400; thrDes = pl.y > altDes + 100 ? 0.4 : 0.8;
        if (d < 700 || (pl.z > 3000 && pl.z < 7000 && Math.abs(pl.x) < 500 && Math.abs(pl.yaw) < 0.5 && pl.y < 700)) { b.app = 'final'; this.once('final', 'Copilot: on final approach. Gear down.'); }
      } else {
        yawDes = clamp(pl.x * 0.0015, -0.8, 0.8);
        altDes = 3 + clamp((pl.z - 500) * 0.06, 0, 400);
        thrDes = clamp(0.45 + (68 - pl.spd) * 0.06, 0, 1); gearDes = true;
        if (pl.y < 13) { pitchDes = -0.025; thrDes = 0; }
        if (pl.z < 350 && (pl.y > 40 || Math.abs(pl.x) > 40)) { b.app = 'iaf'; }
      }
      pl.gear = gearDes || pl.y < 40 && b.app === 'final';
      if (pitchDes == null) pitchDes = clamp((altDes - pl.y) * 0.004, -0.14, 0.17);
      const rollDes = clamp(wrap(yawDes - pl.yaw) * 1.5 + rollFF, -0.6, 0.6);
      c.r = clamp((rollDes - pl.roll) * 2.5, -1, 1);
      c.p = clamp((pitchDes - pl.pitch) * 4, -1, 1);
    }
    c.th = clamp((thrDes - pl.thr) * 5, -1, 1);
    return c;
  }

  // ---------------------------------------------------------------- guns
  gunOrigin(i) {
    const pl = this.pl, o = rot(SEATS[i].gun.pos.map(v => v * SCALE), pl.yaw, pl.pitch, pl.roll);
    return [pl.x + o[0], pl.y + o[1], pl.z + o[2]];
  }
  guns(dt) {
    const pl = this.pl, pv = planeVel(pl);
    SEATS.forEach((def, i) => {
      const g = def.gun, s = this.seats[i]; if (!g) return;
      s.cool -= dt;
      if ((!s.pid && s.out) || pl.crashed || this.phase === 'ended') { s.fire = false; return; }
      let fire = false;
      if (s.pid) { const inp = this.players.get(s.pid).in;[s.ay, s.ap] = clampAim(g, +inp.ay || 0, +inp.ap || 0); fire = !!inp.f; }
      else fire = this.botAim(i, s, g, dt, pv);
      s.fire = fire && s.ammo >= 1;
      if (s.fire && s.cool <= 0) {
        s.cool = 0.1; s.ammo -= 1;
        const sp = s.pid ? 0.004 : 0.022;
        if (!s.pid && !s.low && s.ammo < 100) { s.low = true; this.say(i, 'ammo', null, true); }
        const d = norm(rot(aimDir(s.ay + gauss() * sp, s.ap + gauss() * sp), pl.yaw, pl.pitch, pl.roll)), o = this.gunOrigin(i);
        this.bullets.push({ x: o[0], y: o[1], z: o[2], vx: d[0] * BULLET_SPD + pv[0], vy: d[1] * BULLET_SPD + pv[1], vz: d[2] * BULLET_SPD + pv[2], life: 1.3, seat: i });
      }
    });
  }
  // Bot gunner: obeys the fire order, prefers the marked fighter, and behaves like a person:
  // takes a moment to pick up a new target, calls it out, wanders a little off the aim point, fires in bursts.
  botAim(i, s, g, dt, pv) {
    const pl = this.pl, o = this.gunOrigin(i), range = FIRE_RANGE[this.ord.fire];
    let best = null, bd = range, bf = null;
    for (const f of this.fighters) {
      if (f.dead) continue;
      const rel = [f.p[0] - o[0], f.p[1] - o[1], f.p[2] - o[2]], dist = Math.hypot(...rel), marked = f.id === this.ord.focus && range > 0 && dist < 900;
      if (dist > bd && !marked) continue;
      const t = dist / BULLET_SPD;
      const l = irot(norm([rel[0] + (f.dir[0] * f.spd - pv[0]) * t, rel[1] + (f.dir[1] * f.spd - pv[1]) * t, rel[2] + (f.dir[2] * f.spd - pv[2]) * t]), pl.yaw, pl.pitch, pl.roll);
      const ay = Math.atan2(-l[0], -l[2]), ap = Math.asin(clamp(l[1], -1, 1));
      if (Math.abs(wrap(ay - g.yc)) > g.yr || ap < g.pmin || ap > g.pmax) continue;
      best = [ay, ap]; bd = marked ? 0 : dist; bf = f;
    }
    if (bf && bf.id !== s.tid) {
      s.tid = bf.id; s.react = rnd(0.2, 0.6); s.burst = rnd(0.7, 1.5); s.pause = 0;
      const l = irot([bf.p[0] - pl.x, 0, bf.p[2] - pl.z], pl.yaw, 0, 0), dy = bf.p[1] - pl.y;
      this.say(i, 'spot', { c: ((Math.round(Math.atan2(l[0], -l[2]) / (Math.PI / 6)) + 12) % 12) || 12, h: dy > 80 ? 'high' : dy < -80 ? 'low' : 'level' });
    } else if (!bf) s.tid = 0;
    for (let k = 0; k < 2; k++) s.wob[k] = clamp(s.wob[k] + gauss() * 0.05 * dt * 6, -0.018, 0.018);
    const want = best ? [best[0] + s.wob[0], best[1] + s.wob[1]] : [g.yc + Math.sin(this.lead.t * 0.4 + i * 2) * Math.min(0.5, g.yr * 0.5), (g.pmin + g.pmax) / 2 * 0.3], rate = (best ? 2.5 : 0.5) * dt;
    const dy = wrap(want[0] - s.ay), dp = want[1] - s.ap;
    s.ay = wrap(s.ay + clamp(dy, -rate, rate)); s.ap = clamp(s.ap + clamp(dp, -rate, rate), g.pmin, g.pmax);
    if (!best || (s.react -= dt) > 0 || Math.abs(dy) > 0.07 || Math.abs(dp) > 0.07) return false;
    if (s.pause > 0) { s.pause -= dt; return false; }
    if ((s.burst -= dt) <= 0) { s.pause = rnd(0.2, 0.55); s.burst = rnd(0.7, 1.5); }
    return true;
  }
  hitFighter(f, dmg, seat) {
    f.hp -= dmg; this.ev.push({ k: 'fhit', id: f.id });
    if (f.hp > 0) return;
    f.dead = true; f.t = 6; f.firing = false;
    if (this.ord.focus === f.id) this.ord.focus = 0;
    this.ev.push({ k: 'kill', x: r2(f.p[0]), y: r2(f.p[1]), z: r2(f.p[2]) });
    if (seat == null) { this.fkills++; this.msg('The formation shot down a fighter.'); return; }
    this.kills++;
    const s = this.seats[seat]; s.kills++;
    if (s.pid) this.msg(`${this.players.get(s.pid).name} shot down a fighter!`); else this.say(seat, 'kill', null, true);
  }
  updBullets(dt) {
    for (const b of this.bullets) {
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
      const sx = nx - b.x, sy = ny - b.y, sz = nz - b.z, sl2 = sx * sx + sy * sy + sz * sz;
      for (const f of this.fighters) {
        if (f.dead) continue;
        const t = clamp(((f.p[0] - b.x) * sx + (f.p[1] - b.y) * sy + (f.p[2] - b.z) * sz) / sl2, 0, 1);
        if (Math.hypot(b.x + sx * t - f.p[0], b.y + sy * t - f.p[1], b.z + sz * t - f.p[2]) < 9) { b.life = 0; this.hitFighter(f, 22, b.seat); break; }
      }
      b.x = nx; b.y = ny; b.z = nz; b.life -= dt;
    }
    this.bullets = this.bullets.filter(b => b.life > 0 && b.y > 0);
  }

  // ---------------------------------------------------------------- bombs
  bombardier(dt) {
    const s = this.seats[1], pl = this.pl, o = this.ord; this.dropCool -= dt;
    if (pl.crashed || this.phase === 'ended') return;
    let drop = false;
    if (s.pid) drop = !!this.players.get(s.pid).in.d;
    else if (!s.out && !pl.ground) {
      if (o.bomb === 0) {
        const d = Math.hypot(this.tgt.x - pl.x, this.tgt.z - pl.z);
        const want = pl.bombs > 0 && this.tgt.hp > 0 && d < 4500;
        if (want && !pl.doors) { pl.doors = true; this.botDoors = true; this.msg('Bombardier: bomb bay doors open.'); }
        if (want) { const I = impactPoint(pl); if (Math.hypot(I.x - this.tgt.x, I.z - this.tgt.z) < 110) this.botDropping = true; }
        else if (!this.botDropping && pl.doors && this.botDoors) { pl.doors = false; this.botDoors = false; this.msg('Bombardier: bomb bay doors closed.'); }
      }
      if (pl.bombs === 0 && this.botDropping) {
        this.botDropping = false; if (o.bomb === 2) o.bomb = 1;
        if (pl.doors && this.botDoors && !pl.doomed) { pl.doors = false; this.botDoors = false; this.msg('Bombardier: bomb bay doors closed.'); }
      }
      drop = this.botDropping && o.bomb !== 1;
    }
    if (drop && pl.doors && pl.bombs > 0 && this.dropCool <= 0 && !pl.ground) {
      if (pl.bombs === BOMBS_MAX) { this.msg('Bombs away!'); this.talkT = 0; }
      if (pl.bombs === 1) this.say(this.anyBot(), 'away', null, true);
      pl.bombs--; this.dropCool = 0.18;
      const v = planeVel(pl);
      this.bombsAir.push({ id: this.uid++, x: pl.x, y: pl.y - 2, z: pl.z, vx: v[0], vy: v[1], vz: v[2], k: 1 });
    }
  }
  updBombs(dt) {
    let mine = false;
    for (const b of this.bombsAir) {
      b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y <= 0) {
        b.done = true; if (b.k === 1) mine = true;
        this.ev.push({ k: 'boom', x: r2(b.x), z: r2(b.z) });
        const d = Math.hypot(b.x - this.tgt.x, b.z - this.tgt.z), dmg = (d < 80 ? 34 : d < 200 ? 20 : d < 350 ? 8 : 0) * b.k;
        if (dmg && this.tgt.hp > 0) { this.tgt.hp = Math.max(0, this.tgt.hp - dmg); if (this.tgt.hp === 0) { this.msg('TARGET DESTROYED! Stay with the formation and head for home.'); this.say(this.anyBot(), 'boom', null, true); } }
      }
    }
    this.bombsAir = this.bombsAir.filter(b => !b.done);
    if (mine && !this.bombsAir.some(b => b.k === 1) && this.pl.bombs === 0 && this.tgt.hp > 0) this.msg(`Target still standing (${Math.round(this.tgt.hp)}%). Mission won't count. Return to base.`);
  }

  // ---------------------------------------------------------------- fighters
  applyHit(flak) {
    const pl = this.pl, r = Math.random();
    if (Math.random() < 0.3) this.say(this.anyBot(), 'hit');
    if (r < 0.6) pl.hull -= 2.5;
    else if (r < 0.85) {
      const i = Math.floor(Math.random() * 4);
      if (pl.eng[i] > 0) { pl.eng[i] = Math.max(0, pl.eng[i] - 17); if (pl.eng[i] === 0) this.msg(`Engine ${i + 1} is knocked out!`); } else pl.hull -= 1.5;
    } else if (r < 0.95) { if (pl.leak < 0.01) this.msg('Fuel tank hit, we\'re leaking fuel!'); pl.leak += 0.06; }
    else pl.hull -= 4;
    this.ev.push({ k: 'hit', f: flak ? 1 : 0 });
    pl.hull = Math.max(0, pl.hull);
    if (pl.hull <= 0 && !pl.doomed) {
      pl.doomed = true; pl.doors = true; this.botDoors = false;
      this.msg('WE\'RE GOING DOWN! Bay doors are open: get to the bomb bay and jump!');
    }
  }
  pickTarget(f, preferMe) {
    const alive = this.wing.filter(b => !b.dead);
    f.tg = preferMe || !alive.length ? 0 : alive[Math.floor(Math.random() * alive.length)].id;
  }
  updFighters(dt) {
    const pl = this.pl, pv = planeVel(pl), lv = this.leadVel(), lvl = this.level();
    const hot = this.phase === 'flight' && !pl.crashed && !pl.ground && Math.hypot(pl.x, pl.z) > 5000;
    if (hot) {
      this.waveT -= dt;
      const alive = this.fighters.filter(f => !f.dead).length;
      if (this.waveT <= 0 && alive < 3) {
        this.waveT = Math.max(20, 32 - lvl);
        const n = Math.min(3 + Math.floor(lvl / 3), 7), brg = Math.random() * Math.PI * 2, hi = rnd(150, 600);
        for (let i = 0; i < n; i++) {
          const a = brg + rnd(-0.25, 0.25), p = [pl.x + Math.sin(a) * 3500, Math.max(300, pl.y + hi + rnd(-80, 80)), pl.z + Math.cos(a) * 3500 + i * 60];
          const f = { id: this.uid++, p, dir: norm([pl.x - p[0], pl.y - p[1], pl.z - p[2]]), spd: rnd(140, 160), hp: 100, state: 'attack', burst: 2.5, t: 0, firing: false, dead: false, tg: 0 };
          this.pickTarget(f, i % 2 === 0); this.fighters.push(f);
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
      let wb = f.tg ? this.wing.find(b => b.id === f.tg && !b.dead) : null;
      if (f.tg && !wb) { this.pickTarget(f, Math.random() < 0.5); wb = f.tg ? this.wing.find(b => b.id === f.tg) : null; }
      const tp = wb ? [wb.x, wb.y, wb.z] : [pl.x, pl.y, pl.z], tv = wb ? lv : pv;
      const rel = [tp[0] - f.p[0], tp[1] - f.p[1], tp[2] - f.p[2]], dist = Math.hypot(...rel);
      if (!hot) f.state = 'flee';
      let des; f.firing = false;
      if (f.state === 'attack') {
        const t = dist / 700;
        des = norm([rel[0] + tv[0] * t, rel[1] + tv[1] * t, rel[2] + tv[2] * t]);
        const ang = Math.acos(clamp(des[0] * f.dir[0] + des[1] * f.dir[1] + des[2] * f.dir[2], -1, 1));
        if (dist < 650 && ang < 0.09) {
          f.firing = true; f.burst -= dt;
          if (Math.random() < 0.04 * dt * 30) { if (wb) { wb.hp -= 5; if (wb.hp <= 0) this.killWing(wb); } else this.applyHit(); }
        }
        if (dist < 170 || f.burst <= 0) {
          f.state = 'break'; f.t = rnd(4, 7);
          f.bdir = norm([f.dir[0] + rnd(-0.5, 0.5), f.dir[1] + rnd(-0.35, 0.35), f.dir[2] + rnd(-0.5, 0.5)]);
        }
      } else if (f.state === 'break') { des = f.bdir; if ((f.t -= dt) <= 0) { f.state = 'attack'; f.burst = 2.5; this.pickTarget(f, Math.random() < 0.5); } }
      else { des = norm([-rel[0], 300, -rel[2]]); if (dist > 6000) f.gone = true; }
      if (f.p[1] < 250) des = norm([des[0], Math.abs(des[1]) + 0.5, des[2]]);
      steer(f.dir, des, 0.9 * dt);
      f.p[0] += f.dir[0] * f.spd * dt; f.p[1] += f.dir[1] * f.spd * dt; f.p[2] += f.dir[2] * f.spd * dt;
    }
    this.fighters = this.fighters.filter(f => !f.gone);
  }

  // ---------------------------------------------------------------- network
  snapshot() {
    const pl = this.pl, o = this.ord, sl = this.slotPos(), ps = [...this.players.values()];
    const s = {
      t: 's', mid: this.mid, ph: this.phase, endT: Math.ceil(this.endT), res: this.result,
      pl: { x: r2(pl.x), y: r2(pl.y), z: r2(pl.z), yaw: r3(pl.yaw), pitch: r3(pl.pitch), roll: r3(pl.roll), spd: r2(pl.spd), vy: r2(pl.vy), thr: r2(pl.thr),
        gear: pl.gear ? 1 : 0, doors: pl.doors ? 1 : 0, ground: pl.ground ? 1 : 0, fuel: r2(pl.fuel), leak: pl.leak > 0.005 ? 1 : 0, hull: Math.round(pl.hull),
        bombs: pl.bombs, doomed: pl.doomed ? 1 : 0, crashed: pl.crashed ? 1 : 0, eng: pl.eng.map(e => Math.round(e)) },
      ft: ps.filter(p => p.foot).map(p => [p.id, r2(p.foot.x), r2(p.foot.z), r3(p.foot.yaw), p.name]),
      wk: ps.filter(p => p.walk).map(p => [p.id, r2(p.walk.x), r2(p.walk.z), r3(p.walk.yaw), p.name]),
      st: this.seats.map(s => { const p = s.pid && this.players.get(s.pid); return [s.pid || 0, p ? p.name : '', p ? p.missions : 0, Math.floor(s.ammo), r3(s.ay), r3(s.ap), s.fire ? 1 : 0, s.out ? 1 : 0, s.kills]; }),
      f: this.fighters.map(f => [f.id, r2(f.p[0]), r2(f.p[1]), r2(f.p[2]), r2(f.dir[0] * f.spd), r2(f.dir[1] * f.spd), r2(f.dir[2] * f.spd), (f.firing ? 1 : 0) | (f.dead ? 2 : 0) | (f.hp <= 50 ? 4 : 0)]),
      w: this.wing.map(b => [b.id, r2(b.x), r2(b.y), r2(b.z), r3(b.yaw), r3(b.roll), r3(b.pitch), b.dead ? 2 : 0, b.fid]),
      b: this.bombsAir.map(b => [b.id, r2(b.x), r2(b.y), r2(b.z)]),
      c: this.chutes.map(c => [c.id, r2(c.x), r2(c.y), r2(c.z), c.pid, c.t > 0 ? 0 : 1]),
      tg: [r2(this.tgt.x), r2(this.tgt.z), Math.round(this.tgt.hp)],
      sl: [r2(sl[0]), r2(sl[1]), r2(sl[2]), this.lead.leg],
      od: [o.fire, o.bomb, o.ap, o.focus],
      cn: this.crew, ct: [r2(this.ctl.p), r2(this.ctl.r)],
      ev: this.ev,
    };
    this.ev = [];
    return s;
  }
}
