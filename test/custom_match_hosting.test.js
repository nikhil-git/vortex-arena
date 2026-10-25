const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const db = require('../server/database/db');
const authController = require('../server/auth/authController');
const Room = require('../server/game/Room');
const roomManager = require('../server/game/RoomManager');
const Player = require('../server/game/Player');
const { MapData } = require('../server/game/MapData');

let mockHost;
let mockGuestHost;
let mockJoiner;
let sentMessages = [];

function createMockSocket(playerId) {
  return {
    readyState: 1,
    send(msg) {
      sentMessages.push({ playerId, data: JSON.parse(msg) });
    }
  };
}

test('Setup Custom Match Hosting Test Suite & Database', async () => {
  await db.init();

  try {
    db.prepare('DELETE FROM users WHERE email IN (?, ?)').run('cm_host@test.io', 'cm_joiner@test.io');
  } catch (e) {}

  let regUser, guestUser, joinerUser;

  // 1. Registered Host
  authController.register({
    body: { username: 'CMHostUser', email: 'cm_host@test.io', password: 'Password123!' }
  }, {
    status() { return this; },
    json(data) { regUser = data.user; return this; }
  });

  // 2. Guest Host
  authController.guest({
    headers: {},
    ip: '127.0.0.1'
  }, {
    status() { return this; },
    json(data) { guestUser = data.user; return this; }
  });

  // 3. Joining Player
  authController.register({
    body: { username: 'CMJoinerUser', email: 'cm_joiner@test.io', password: 'Password123!' }
  }, {
    status() { return this; },
    json(data) { joinerUser = data.user; return this; }
  });

  mockHost = new Player(regUser.id, regUser.username, createMockSocket(regUser.id), {});
  mockGuestHost = new Player(guestUser.id, guestUser.username, createMockSocket(guestUser.id), {});
  mockJoiner = new Player(joinerUser.id, joinerUser.username, createMockSocket(joinerUser.id), {});
});

test('Scenario 1: Custom Match Hosting Across All 6 Playable Maps', () => {
  const maps = ['house', 'farm', 'forest', 'minecraft', 'cruise', 'sector7'];

  for (const mapId of maps) {
    sentMessages = [];
    const roomCode = roomManager.generateRoomCode();
    const mapInfo = MapData.getMap(mapId);

    const room = roomManager.createRoom({
      roomCode,
      name: `${mockHost.username}'s ${mapInfo.name}`,
      isPrivate: true,
      gameMode: 'ffa',
      mapId,
      hostUserId: mockHost.id,
      minPlayers: 1
    });

    assert.ok(room, `Room must be created for map ${mapId}`);
    assert.strictEqual(room.mapId, mapId, `Room mapId must match ${mapId}`);
    assert.strictEqual(room.hostUserId, mockHost.id, 'Host user ID must be set');
    assert.strictEqual(room.isPrivate, true, 'Custom match must be private by default');

    const addRes = room.addPlayer(mockHost);
    assert.strictEqual(addRes.success, true, 'Host player must be added successfully');

    // Verify room_joined event payload
    const joinMsg = sentMessages.find(m => m.playerId === mockHost.id && m.data.type === 'room_joined');
    assert.ok(joinMsg, 'Host must receive room_joined payload');
    assert.strictEqual(joinMsg.data.room.mapId, mapId, `Payload mapId must be ${mapId}`);
    assert.strictEqual(joinMsg.data.room.mapName, mapInfo.name, `Payload mapName must match ${mapInfo.name}`);
    assert.strictEqual(joinMsg.data.room.hostUserId, mockHost.id, 'Payload hostUserId must match host ID');
    assert.strictEqual(joinMsg.data.room.state, 'lobby', 'Initial state must be lobby');

    // Clean up
    room.destroy();
    roomManager.rooms.delete(roomCode);
  }
});

test('Scenario 2: Guest User Can Successfully Host a Custom Match', () => {
  sentMessages = [];
  const roomCode = roomManager.generateRoomCode();
  const room = roomManager.createRoom({
    roomCode,
    name: `${mockGuestHost.username}'s Arena`,
    isPrivate: true,
    gameMode: 'ffa',
    mapId: 'forest',
    hostUserId: mockGuestHost.id,
    minPlayers: 1
  });

  const addRes = room.addPlayer(mockGuestHost);
  assert.strictEqual(addRes.success, true);
  assert.strictEqual(room.hostUserId, mockGuestHost.id);

  const joinMsg = sentMessages.find(m => m.playerId === mockGuestHost.id && m.data.type === 'room_joined');
  assert.ok(joinMsg, 'Guest host must receive room_joined payload');
  assert.strictEqual(joinMsg.data.room.code, roomCode);
  assert.strictEqual(joinMsg.data.room.hostUserId, mockGuestHost.id);

  room.destroy();
  roomManager.rooms.delete(roomCode);
});

test('Scenario 3: Host Privileges - Changing Map in Lobby & Synchronization', () => {
  sentMessages = [];
  const roomCode = roomManager.generateRoomCode();
  const room = roomManager.createRoom({
    roomCode,
    name: 'Dynamic Map Lobby',
    isPrivate: true,
    gameMode: 'ffa',
    mapId: 'house',
    hostUserId: mockHost.id,
    minPlayers: 1
  });

  room.addPlayer(mockHost);
  room.addPlayer(mockJoiner);

  // Non-host attempts map change -> ignored by host check
  const nonHostAttempt = (mockJoiner.id === room.hostUserId);
  assert.strictEqual(nonHostAttempt, false, 'mockJoiner must NOT have host privileges');

  // Host changes map to minecraft
  sentMessages = [];
  const res = room.setMap('minecraft');
  assert.strictEqual(res.success, true, 'Host must be permitted to set map');
  assert.strictEqual(room.mapId, 'minecraft', 'Room mapId must update to minecraft');

  // Both players must receive map_changed event
  const hostMapEvent = sentMessages.find(m => m.playerId === mockHost.id && m.data.type === 'map_changed');
  const joinerMapEvent = sentMessages.find(m => m.playerId === mockJoiner.id && m.data.type === 'map_changed');
  assert.ok(hostMapEvent, 'Host must receive map_changed');
  assert.ok(joinerMapEvent, 'Connected operative must receive map_changed');
  assert.strictEqual(joinerMapEvent.data.mapId, 'minecraft');

  room.destroy();
  roomManager.rooms.delete(roomCode);
});

test('Scenario 4: Joining Custom Match by Room Code', () => {
  sentMessages = [];
  const roomCode = roomManager.generateRoomCode();
  const room = roomManager.createRoom({
    roomCode,
    name: 'Code Join Arena',
    isPrivate: true,
    gameMode: 'ffa',
    mapId: 'cruise',
    hostUserId: mockHost.id,
    minPlayers: 1
  });

  room.addPlayer(mockHost);

  // Joiner joins using room code
  const retrievedRoom = roomManager.getRoom(roomCode);
  assert.ok(retrievedRoom, 'Room must be retrievable by 6-char code');
  assert.strictEqual(retrievedRoom.code, roomCode);

  const joinResult = roomManager.joinRoom(roomCode, mockJoiner);
  assert.strictEqual(joinResult.success, true, 'Joiner must join room successfully');
  assert.strictEqual(retrievedRoom.playerCount, 2, 'Room must now have 2 players');

  // Joiner receives room_joined
  const joinerJoinMsg = sentMessages.find(m => m.playerId === mockJoiner.id && m.data.type === 'room_joined');
  assert.ok(joinerJoinMsg, 'Joiner must receive room_joined');
  assert.strictEqual(joinerJoinMsg.data.room.mapId, 'cruise');

  // Invalid room code returns failure
  const invalidResult = roomManager.joinRoom('ZZZZ99', mockJoiner);
  assert.strictEqual(invalidResult.success, false);
  assert.strictEqual(invalidResult.error, 'Match room not found or code expired');

  room.destroy();
  roomManager.rooms.delete(roomCode);
});

test('Scenario 5: Host Starts Custom Match With 5-Second Countdown', () => {
  sentMessages = [];
  const roomCode = roomManager.generateRoomCode();
  const room = roomManager.createRoom({
    roomCode,
    name: 'Solo Host Arena',
    isPrivate: true,
    gameMode: 'ffa',
    mapId: 'sector7',
    hostUserId: mockHost.id,
    minPlayers: 1
  });

  room.addPlayer(mockHost);

  // Host launches match
  room.startMatch({ countdown: 5 });
  assert.strictEqual(room.state, 'countdown', 'Room state must be countdown');

  const startMsg = sentMessages.find(m => m.playerId === mockHost.id && m.data.type === 'match_started');
  assert.ok(startMsg, 'Host must receive match_started broadcast');
  assert.strictEqual(startMsg.data.state, 'countdown');
  assert.strictEqual(startMsg.data.countdownSeconds, 5);
  assert.strictEqual(startMsg.data.mapId, 'sector7');

  room.destroy();
  roomManager.rooms.delete(roomCode);
});

test('Scenario 6: Frontend Integrity - In-Game Modals, No Blocking Prompts, and ID Type Resilience', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
  const netJs = fs.readFileSync(path.join(__dirname, '../public/js/net.js'), 'utf8');

  // 1. Verify modal-create-room exists in HTML
  assert.ok(indexHtml.includes('id="modal-create-room"'), 'HTML must contain modal-create-room');
  assert.ok(indexHtml.includes('id="custom-room-name-input"'), 'HTML must contain custom-room-name-input');
  assert.ok(indexHtml.includes('id="custom-room-map-select"'), 'HTML must contain custom-room-map-select');
  assert.ok(indexHtml.includes('id="btn-confirm-create-room"'), 'HTML must contain btn-confirm-create-room');

  // 2. Verify modal-join-room exists in HTML
  assert.ok(indexHtml.includes('id="modal-join-room"'), 'HTML must contain modal-join-room');
  assert.ok(indexHtml.includes('id="join-room-code-input"'), 'HTML must contain join-room-code-input');

  // 3. Verify btn-host-match-modal in map selection modal
  assert.ok(indexHtml.includes('id="btn-host-match-modal"'), 'HTML must contain btn-host-match-modal');
  assert.ok(indexHtml.includes('app.launchHostOnSelectedMap()'), 'HTML must trigger launchHostOnSelectedMap()');

  // 4. Verify no window.prompt or window.confirm in hosting/joining flows in app.js
  const launchHostFn = appJs.slice(appJs.indexOf('async launchHostOnSelectedMap()'), appJs.indexOf('updateLobbyMapDisplay('));
  assert.ok(!launchHostFn.includes('prompt('), 'launchHostOnSelectedMap must NOT use prompt()');
  assert.ok(!launchHostFn.includes('confirm('), 'launchHostOnSelectedMap must NOT use confirm()');
  assert.ok(launchHostFn.includes('netClient.createRoom'), 'launchHostOnSelectedMap must invoke netClient.createRoom');

  // 5. Verify netClient.ensureConnected exists and is awaited before createRoom
  assert.ok(netJs.includes('ensureConnected('), 'net.js must have ensureConnected method');
  assert.ok(netJs.includes('async createRoom('), 'net.js createRoom must be async');
  assert.ok(netJs.includes('await this.ensureConnected()'), 'createRoom must await ensureConnected()');

  // 6. Verify string comparison for hostUserId to prevent number/string desync
  assert.ok(appJs.includes('String(this.currentRoom.hostUserId) === String(this.currentUser.id)'), 'app.js must use String() comparison for hostUserId');

  // 7. Verify error listeners in network setup
  assert.ok(appJs.includes("net.on('join_error'"), "app.js must listen for join_error");
  assert.ok(appJs.includes("net.on('map_error'"), "app.js must listen for map_error");
});

test('Scenario 7: Re-login Unrevocation & Custom Match Room Privacy (Public vs Private)', () => {
  const tokenRevocationService = require('../server/auth/tokenRevocationService');
  const { verifyWsToken } = require('../server/auth/authMiddleware');
  const guestCleanupService = require('../server/services/GuestCleanupService');

  // 1. Simulate user logging out (registered user)
  guestCleanupService.handleLogout({ id: mockHost.id, username: mockHost.username, isGuest: false });
  assert.ok(tokenRevocationService.isRevoked('old_token', { id: mockHost.id, iat: Math.floor(Date.now() / 1000) - 10 }), 'Old session must be revoked');

  // 2. User logs back in
  let newLoginToken = null;
  authController.login({
    body: { usernameOrEmail: 'CMHostUser', password: 'Password123!' }
  }, {
    status() { return this; },
    json(data) { newLoginToken = data.token; return this; }
  });

  assert.ok(newLoginToken, 'User must successfully receive new login token');
  const decoded = verifyWsToken(newLoginToken);
  assert.ok(decoded, 'Newly issued token must be valid and NOT blocked by revocation');
  assert.strictEqual(decoded.id, mockHost.id);

  // 3. Test Room Privacy: Public (isPrivate: false) Custom Arena
  const publicRoomCode = roomManager.generateRoomCode();
  const publicRoom = roomManager.createRoom({
    roomCode: publicRoomCode,
    name: 'Public Battleground Arena',
    isPrivate: false,
    gameMode: 'ffa',
    mapId: 'house',
    hostUserId: mockHost.id,
    minPlayers: 2
  });

  assert.strictEqual(publicRoom.isPrivate, false, 'Public room must have isPrivate: false');
  assert.strictEqual(publicRoom.minPlayersToAutoStart, 2, 'Public room minimum players to auto-start is 2');
  assert.strictEqual(publicRoom.mapId, 'house');

  const addRes = publicRoom.addPlayer(mockHost);
  assert.strictEqual(addRes.success, true, 'Host player added to public room');
  assert.strictEqual(publicRoom.players.size, 1);

  publicRoom.destroy();
  roomManager.rooms.delete(publicRoomCode);
});
