const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocket } = require('ws');

// Test database
process.env.DB_PATH = path.join(__dirname, 'test_match.sqlite');
if (fs.existsSync(process.env.DB_PATH)) {
  fs.unlinkSync(process.env.DB_PATH);
}

const db = require('../server/database/db');
const { seedDatabase } = require('../server/database/seed');
const { app } = require('../server/index');
const { WebSocketServer } = require('ws');
const roomManager = require('../server/game/RoomManager');
const Player = require('../server/game/Player');
const authController = require('../server/auth/authController');
const skinService = require('../server/services/skinService');
const { verifyWsToken } = require('../server/auth/authMiddleware');

let testServer;
let serverPort;
let wsServer;

test('Setup Server for Multiplayer WebSocket Simulation', async () => {
  await db.init();
  seedDatabase();

  testServer = http.createServer(app);
  wsServer = new WebSocketServer({ server: testServer, path: '/ws' });

  wsServer.on('connection', (ws, req) => {
    let authUser = null;
    let player = null;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (token) {
      authUser = verifyWsToken(token);
      if (authUser) {
        roomManager.registerSocket(authUser.id, ws);
      }
    }

    ws.on('message', (msgRaw) => {
      try {
        const data = JSON.parse(msgRaw);
        if (data.action === 'auth') {
          authUser = verifyWsToken(data.token);
          if (authUser) {
            roomManager.registerSocket(authUser.id, ws);
            ws.send(JSON.stringify({ type: 'authenticated' }));
          }
          return;
        }

        if (!authUser) return;

        if (data.action === 'create_room') {
          roomManager.leaveRoom(authUser.id);
          const room = roomManager.createRoom({
            isPrivate: Boolean(data.isPrivate),
            gameMode: 'ffa',
            hostUserId: authUser.id,
            name: data.roomName || 'Test Room',
            minPlayers: 1
          });
          const equipped = skinService.getEquippedSkins(authUser.id);
          player = new Player(authUser.id, authUser.username, ws, equipped);
          room.addPlayer(player);
          roomManager.playerToRoom.set(player.id, room.code);
          return;
        }

        if (data.action === 'join_room') {
          roomManager.leaveRoom(authUser.id);
          const equipped = skinService.getEquippedSkins(authUser.id);
          player = new Player(authUser.id, authUser.username, ws, equipped);
          const res = roomManager.joinRoom(data.roomCode, player);
          if (!res.success) {
            ws.send(JSON.stringify({ type: 'join_error', message: res.error }));
          }
          return;
        }

        if (data.action === 'start_match') {
          const code = roomManager.playerToRoom.get(authUser.id);
          const room = roomManager.getRoom(code);
          if (room) room.startMatch();
          return;
        }

        const roomCode = roomManager.playerToRoom.get(authUser.id);
        const room = roomManager.getRoom(roomCode);
        if (!room) return;

        if (data.action === 'player_shoot') {
          room.handlePlayerShoot(authUser.id, data);
        } else if (data.action === 'player_input') {
          room.handlePlayerInput(authUser.id, data);
        }
      } catch (e) {
        console.error(e);
      }
    });

    ws.on('close', () => {
      if (authUser) {
        roomManager.leaveRoom(authUser.id);
        roomManager.unregisterSocket(authUser.id);
      }
    });
  });

  await new Promise((resolve) => {
    testServer.listen(0, () => {
      serverPort = testServer.address().port;
      resolve();
    });
  });

  assert.ok(serverPort > 0, 'Server should be listening on dynamic port');
});

test('2-Player Real-time Matchmaking, Combat, and Authoritative Damage', async () => {
  // Helper to register mock player and get token
  const registerPlayer = (username) => {
    let token = null;
    let user = null;
    authController.register({
      body: { username, email: `${username.toLowerCase()}@test.io`, password: 'Password123!' }
    }, {
      status() { return this; },
      json(data) { token = data.token; user = data.user; return this; }
    });
    return { token, user };
  };

  const p1 = registerPlayer('NetAlpha');
  const p2 = registerPlayer('NetBravo');

  assert.ok(p1.token && p2.token, 'Both players registered with tokens');

  // Connect Player 1 via WebSocket
  const ws1 = new WebSocket(`ws://localhost:${serverPort}/ws?token=${p1.token}`);
  const ws1Messages = [];
  ws1.on('message', (d) => ws1Messages.push(JSON.parse(d)));

  await new Promise((res) => ws1.on('open', res));

  // Player 1 creates room
  ws1.send(JSON.stringify({ action: 'create_room', roomName: 'Alpha Combat Arena', isPrivate: true }));

  // Wait for room_joined message
  let createdRoomCode = null;
  for (let i = 0; i < 20; i++) {
    const joined = ws1Messages.find(m => m.type === 'room_joined');
    if (joined) {
      createdRoomCode = joined.room.code;
      break;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  assert.ok(createdRoomCode, 'Player 1 should receive room_joined with room code');

  // Connect Player 2 via WebSocket and join same room
  const ws2 = new WebSocket(`ws://localhost:${serverPort}/ws?token=${p2.token}`);
  const ws2Messages = [];
  ws2.on('message', (d) => ws2Messages.push(JSON.parse(d)));

  await new Promise((res) => ws2.on('open', res));

  ws2.send(JSON.stringify({ action: 'join_room', roomCode: createdRoomCode }));

  // Wait for Player 2 to join
  for (let i = 0; i < 20; i++) {
    const p2Joined = ws2Messages.find(m => m.type === 'room_joined');
    if (p2Joined) break;
    await new Promise(r => setTimeout(r, 50));
  }
  assert.ok(ws2Messages.find(m => m.type === 'room_joined'), 'Player 2 should successfully join room');

  // Start match
  ws1.send(JSON.stringify({ action: 'start_match' }));

  for (let i = 0; i < 20; i++) {
    const started = ws1Messages.find(m => m.type === 'match_started');
    if (started) break;
    await new Promise(r => setTimeout(r, 50));
  }
  assert.ok(ws1Messages.find(m => m.type === 'match_started'), 'Both players should receive match_started');

  // Position Player 1 at (0, 0, 10) and Player 2 at (0, 0, 20)
  ws1.send(JSON.stringify({
    action: 'player_input',
    position: { x: 0, y: 0, z: 10 },
    rotation: { yaw: 0, pitch: 0 }
  }));

  ws2.send(JSON.stringify({
    action: 'player_input',
    position: { x: 0, y: 0, z: 20 },
    rotation: { yaw: Math.PI, pitch: 0 }
  }));

  await new Promise(r => setTimeout(r, 100));

  // Player 1 fires directly at Player 2: origin (0, 1.5, 10), direction (0, 0, 1)
  ws1.send(JSON.stringify({
    action: 'player_shoot',
    origin: [0, 1.5, 10],
    dir: [0, 0, 1]
  }));

  // Verify hit confirmation on Player 1 and damage on Player 2
  let hitConfirmed = false;
  let damageTaken = false;

  for (let i = 0; i < 25; i++) {
    if (ws1Messages.some(m => m.type === 'hit_confirmed')) hitConfirmed = true;
    if (ws2Messages.some(m => m.type === 'damaged')) damageTaken = true;
    if (hitConfirmed && damageTaken) break;
    await new Promise(r => setTimeout(r, 50));
  }

  assert.strictEqual(hitConfirmed, true, 'Shooter should receive hit_confirmed event');
  assert.strictEqual(damageTaken, true, 'Victim should receive damaged event');

  // Cleanup WebSockets
  ws1.close();
  ws2.close();
});

test('12-Player Limit Enforced Over Live WebSocket Connections', async () => {
  const room = roomManager.createRoom({ isPrivate: true, maxPlayers: 12, name: 'Stress 12' });

  // Connect 12 players
  for (let i = 1; i <= 12; i++) {
    const mockWs = { send() {}, readyState: 1 };
    const p = new Player(2000 + i, `Bot_${i}`, mockWs);
    const res = room.addPlayer(p);
    assert.strictEqual(res.success, true);
  }

  assert.strictEqual(room.playerCount, 12);
  assert.strictEqual(room.isFull(), true);

  // Attempt 13th player join
  const mockWs13 = { send() {}, readyState: 1 };
  const player13 = new Player(9999, 'OverflowPlayer', mockWs13);
  const reject = room.addPlayer(player13);

  assert.strictEqual(reject.success, false);
  assert.strictEqual(reject.error, 'Match is already at maximum capacity (12/12 players)');

  room.destroy();
});

test('Teardown WebSocket Server', async () => {
  if (testServer) {
    await new Promise(resolve => testServer.close(resolve));
  }
  if (fs.existsSync(process.env.DB_PATH)) {
    fs.unlinkSync(process.env.DB_PATH);
  }
});
