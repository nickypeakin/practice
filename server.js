// HTTP static server + WebSocket game server. Run: npm start  (PORT env var optional, default 3000)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, MAX_PLAYERS, MAX_FIGHTERS } from './sim.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 3000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const root = p.startsWith('/three/') ? path.join(DIR, 'node_modules/three/build') : path.join(DIR, 'public');
  const file = path.join(root, p.replace(/^\/three\//, '/'));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const rooms = new Map();
let nextPid = 1;
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  let player = null, room = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join' && !player) {
      let code = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (!code) do { code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); } while (rooms.has(code));
      room = rooms.get(code);
      if (!room) rooms.set(code, room = new Room(code));
      const side = m.side === 'f' ? 'f' : 'b', n = [...room.players.values()].filter(p => p.side === side).length;
      if (n >= (side === 'f' ? MAX_FIGHTERS : MAX_PLAYERS)) { ws.send(JSON.stringify({ t: 'err', s: side === 'f' ? `That fight already has ${MAX_FIGHTERS} fighter pilots.` : `That crew is full (${MAX_PLAYERS} players).` })); room = null; return; }
      const name = String(m.name || '').replace(/[^\w .\-']/g, '').trim().slice(0, 16) || 'Rookie';
      player = { id: nextPid++, name, missions: Math.max(0, Math.min(999, m.missions | 0)), ws, side };
      room.addPlayer(player);
      ws.send(JSON.stringify({ t: 'welcome', id: player.id, room: code, side: player.side }));
    } else if (player) {
      if (m.t === 'in') Object.assign(player.in, { p: m.p, r: m.r, y: m.y, th: m.th, br: m.br, ay: m.ay, ap: m.ap, f: m.f, d: m.d, fx: m.fx, fz: m.fz, fy: m.fy, lx: m.lx, lz: m.lz, ly: m.ly });
      else if (m.t === 'seat') room.setSeat(player, m.i | 0);
      else if (m.t === 'act') room.action(player, String(m.a), m);
    }
  });
  ws.on('close', () => {
    if (!player) return;
    room.removePlayer(player);
    if (!room.players.size) rooms.delete(room.code);
  });
});

let n = 0;
const SPEED = +process.env.SPEED || 1;   // >1 fast-forwards the simulation (testing only)
setInterval(() => {
  n++;
  for (const room of rooms.values()) {
    for (let i = 0; i < SPEED; i++) room.tick(1 / 30);
    if (n % 2) continue;
    const snap = JSON.stringify(room.snapshot());
    for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(snap);
  }
}, 1000 / 30);

server.listen(PORT, () => console.log(`B-17 crew server on http://localhost:${PORT}`));
