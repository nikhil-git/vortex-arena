const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// Use isolated test database
process.env.DB_PATH = path.join(__dirname, 'test_guest_cleanup.sqlite');
if (fs.existsSync(process.env.DB_PATH)) {
  fs.unlinkSync(process.env.DB_PATH);
}

const db = require('../server/database/db');
const { seedDatabase } = require('../server/database/seed');
const config = require('../server/config');
const authController = require('../server/auth/authController');
const { authMiddleware, verifyWsToken } = require('../server/auth/authMiddleware');
const tokenRevocationService = require('../server/auth/tokenRevocationService');
const guestCleanupService = require('../server/services/GuestCleanupService');
const roomManager = require('../server/game/RoomManager');
const Player = require('../server/game/Player');

test('Setup Guest Cleanup Test Suite & Database', async () => {
  await db.init();
  seedDatabase();
  tokenRevocationService.clear();
});

test('Scenario 1: Guest Creation, Data Initialization & Table Storage', () => {
  let guestRes = null;
  authController.guest({}, {
    status(code) {
      assert.strictEqual(code, 201);
      return this;
    },
    json(data) {
      guestRes = data;
      return this;
    }
  });

  assert.ok(guestRes && guestRes.token, 'Guest token issued');
  assert.ok(guestRes.user && guestRes.user.id, 'Guest user ID generated');
  assert.strictEqual(guestRes.user.isGuest, true, 'isGuest flag is true');
  const guestId = guestRes.user.id;

  // Verify database record creation across tables
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(guestId);
  assert.ok(userRow, 'User table row exists');
  assert.strictEqual(userRow.is_guest, 1, 'is_guest column is 1');
  assert.ok(userRow.username.startsWith('Guest_'), 'Username starts with Guest_');

  const statsRow = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(guestId);
  assert.ok(statsRow, 'Stats table row exists');

  const skinsRows = db.prepare('SELECT * FROM user_skins WHERE user_id = ?').all(guestId);
  assert.ok(skinsRows.length > 0, 'User skins assigned to guest');

  // Add dummy friend, report, achievement, and match participant to test full cascade
  db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status, action_user_id) VALUES (?, ?, ?, ?)').run(guestId, 99999, 'pending', guestId);
  db.prepare('INSERT INTO reports (reporter_id, reported_user_id, reason) VALUES (?, ?, ?)').run(guestId, 99999, 'test report');
  db.prepare('INSERT OR IGNORE INTO achievements (user_id, milestone_key, name, description) VALUES (?, ?, ?, ?)').run(guestId, 'test_achieve', 'Test', 'Desc');

  // Verify helper data was inserted
  assert.ok(db.prepare('SELECT * FROM friends WHERE user_id = ?').get(guestId), 'Friend record exists');
  assert.ok(db.prepare('SELECT * FROM reports WHERE reporter_id = ?').get(guestId), 'Report record exists');
  assert.ok(db.prepare('SELECT * FROM achievements WHERE user_id = ?').get(guestId), 'Achievement record exists');

  // Register a dummy mock WebSocket
  let wsClosed = false;
  const mockWs = {
    readyState: 1,
    close(code, reason) { wsClosed = true; }
  };
  roomManager.registerSocket(guestId, mockWs);
  assert.strictEqual(roomManager.getSocket(guestId), mockWs, 'Socket registered in roomManager');

  // Execute explicit guest logout via controller
  let logoutRes = null;
  authController.logout({
    user: { id: guestId, isGuest: true, username: guestRes.user.username },
    rawToken: guestRes.token
  }, {
    status(code) {
      assert.strictEqual(code, 200);
      return this;
    },
    json(data) {
      logoutRes = data;
      return this;
    }
  });

  assert.strictEqual(logoutRes.success, true, 'Logout reports success');
  assert.strictEqual(logoutRes.purged, true, 'Logout confirms guest data purged');

  // Verify complete permanent database purge
  assert.strictEqual(db.prepare('SELECT * FROM users WHERE id = ?').get(guestId), null, 'Users record purged');
  assert.strictEqual(db.prepare('SELECT * FROM stats WHERE user_id = ?').get(guestId), null, 'Stats record purged');
  assert.strictEqual(db.prepare('SELECT * FROM user_skins WHERE user_id = ?').all(guestId).length, 0, 'Skins records purged');
  assert.strictEqual(db.prepare('SELECT * FROM friends WHERE user_id = ? OR friend_id = ?').all(guestId, guestId).length, 0, 'Friends records purged');
  assert.strictEqual(db.prepare('SELECT * FROM reports WHERE reporter_id = ? OR reported_user_id = ?').all(guestId, guestId).length, 0, 'Reports records purged');
  assert.strictEqual(db.prepare('SELECT * FROM achievements WHERE user_id = ?').all(guestId).length, 0, 'Achievements records purged');

  // Verify socket and presence removed
  assert.strictEqual(roomManager.getSocket(guestId), undefined, 'Socket unregistered from roomManager');
  assert.strictEqual(wsClosed, true, 'Active guest WebSocket was closed with 1000');

  // Verify old token cannot be reused
  assert.strictEqual(tokenRevocationService.isRevoked(guestRes.token), true, 'Token is blacklisted in revocation service');
  assert.strictEqual(verifyWsToken(guestRes.token), null, 'Old token rejected for WebSocket authentication');

  // Verify authMiddleware rejects old token
  let middlewareErr = null;
  authMiddleware({
    headers: { authorization: `Bearer ${guestRes.token}` }
  }, {
    status(code) {
      assert.strictEqual(code, 401);
      return { json(payload) { middlewareErr = payload; } };
    }
  }, () => {
    assert.fail('authMiddleware should have rejected purged guest token');
  });
  assert.ok(middlewareErr, 'authMiddleware returned 401 rejection');
});

test('Scenario 2: Idempotent Logout (Logging Out Twice Does Not Error)', () => {
  // Calling purge on an already deleted guest ID
  const result = guestCleanupService.purgeGuest(88888);
  assert.strictEqual(result.success, true, 'Idempotent purge succeeds');
  assert.strictEqual(result.alreadyPurged, true, 'Flags alreadyPurged cleanly');

  // Calling logout via controller with missing/purged user ID
  let logoutRes = null;
  authController.logout({
    user: { id: 88888, isGuest: true, username: 'Guest_8888' },
    rawToken: 'dummy_token'
  }, {
    status(code) {
      assert.strictEqual(code, 200);
      return this;
    },
    json(data) {
      logoutRes = data;
      return this;
    }
  });

  assert.strictEqual(logoutRes.success, true);
});

test('Scenario 3: Registered User Logout Preserves Account & History', () => {
  // Register a permanent registered user
  let regRes = null;
  authController.register({
    body: {
      username: 'PermSoldier',
      email: 'permsoldier@test.com',
      password: 'Password123!'
    }
  }, {
    status(code) {
      assert.strictEqual(code, 201);
      return this;
    },
    json(data) {
      regRes = data;
      return this;
    }
  });

  const regUserId = regRes.user.id;
  assert.ok(regUserId);

  // Update kills and stats
  db.prepare('UPDATE stats SET lifetime_kills = 15, lifetime_wins = 3 WHERE user_id = ?').run(regUserId);

  // Registered user logs out
  let logoutRes = null;
  authController.logout({
    user: { id: regUserId, isGuest: false, username: 'PermSoldier' },
    rawToken: regRes.token
  }, {
    status(code) {
      assert.strictEqual(code, 200);
      return this;
    },
    json(data) {
      logoutRes = data;
      return this;
    }
  });

  assert.strictEqual(logoutRes.success, true);
  assert.strictEqual(logoutRes.isGuest, false, 'Identified as registered user');
  assert.strictEqual(logoutRes.purged, false, 'Registered account was NOT purged');

  // Verify registered account, stats, and skins remain 100% intact
  const userCheck = db.prepare('SELECT * FROM users WHERE id = ?').get(regUserId);
  assert.ok(userCheck, 'Registered user record remains intact');
  assert.strictEqual(userCheck.is_online, 0, 'Online status updated to 0');
  assert.strictEqual(userCheck.current_status, 'offline', 'Status set to offline');

  const statsCheck = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(regUserId);
  assert.ok(statsCheck, 'Stats record preserved');
  assert.strictEqual(statsCheck.lifetime_kills, 15, 'Kills preserved');
  assert.strictEqual(statsCheck.lifetime_wins, 3, 'Wins preserved');

  const skinsCheck = db.prepare('SELECT * FROM user_skins WHERE user_id = ?').all(regUserId);
  assert.ok(skinsCheck.length > 0, 'Skins preserved');
});

test('Scenario 4: Multi-Guest Isolation (Another Active Guest Remains Untouched)', () => {
  // Create Guest 1
  let g1 = null;
  authController.guest({}, {
    status() { return this; },
    json(d) { g1 = d; return this; }
  });

  // Create Guest 2
  let g2 = null;
  authController.guest({}, {
    status() { return this; },
    json(d) { g2 = d; return this; }
  });

  assert.notStrictEqual(g1.user.id, g2.user.id, 'Guests have distinct IDs');

  // Guest 1 logs out
  const purge1 = guestCleanupService.purgeGuest(g1.user.id);
  assert.strictEqual(purge1.success, true);

  // Guest 1 is purged
  assert.strictEqual(db.prepare('SELECT id FROM users WHERE id = ?').get(g1.user.id), null, 'Guest 1 purged');

  // Guest 2 remains completely intact!
  const g2User = db.prepare('SELECT id FROM users WHERE id = ?').get(g2.user.id);
  assert.ok(g2User, 'Guest 2 remains active and intact in database');

  const g2Stats = db.prepare('SELECT user_id FROM stats WHERE user_id = ?').get(g2.user.id);
  assert.ok(g2Stats, 'Guest 2 stats remain intact');

  // Cleanup Guest 2
  guestCleanupService.purgeGuest(g2.user.id);
});

test('Scenario 5: Active Room Participation: Guest Departure Leaves Room & Opponents Intact', () => {
  // Create a room with 1 human player and bots
  const room = roomManager.createRoom({
    name: 'Survival Arena',
    gameMode: 'ffa',
    mapId: 'sector7',
    isPrivate: true
  });

  // Create a guest player
  let guestRes = null;
  authController.guest({}, {
    status() { return this; },
    json(d) { guestRes = d; return this; }
  });
  const guestPlayer = new Player(guestRes.user.id, guestRes.user.username, null);
  room.addPlayer(guestPlayer);
  roomManager.playerToRoom.set(guestPlayer.id, room.code);

  // Create another human player (Player 2)
  let regRes = null;
  authController.register({
    body: {
      username: 'RemainingWarrior',
      email: 'remaining@example.com',
      password: 'StrongPassword123!'
    }
  }, {
    status() { return this; },
    json(d) { regRes = d; return this; }
  });
  const otherPlayer = new Player(regRes.user.id, regRes.user.username, null);
  room.addPlayer(otherPlayer);
  roomManager.playerToRoom.set(otherPlayer.id, room.code);

  assert.strictEqual(room.playerCount, 2, 'Room has 2 players');

  // Guest logs out
  guestCleanupService.handleLogout({ id: guestPlayer.id, isGuest: true, username: guestPlayer.username });

  // Verify Guest was removed from room
  assert.strictEqual(room.players.has(guestPlayer.id), false, 'Guest removed from active room');
  assert.strictEqual(roomManager.playerToRoom.has(guestPlayer.id), false, 'Guest mapping cleared');

  // Verify Remaining player is untouched and room is still active
  assert.strictEqual(room.players.has(otherPlayer.id), true, 'Other player remains active in room');
  assert.strictEqual(room.playerCount, 1, 'Room player count updated to 1');
  assert.strictEqual(room.hostUserId, otherPlayer.id, 'Host reassigned cleanly to remaining player');

  // Cleanup room
  room.destroy();
  roomManager.rooms.delete(room.code);
});

test('Scenario 6: Disconnect Grace Period & Reconnection Handling', async () => {
  // Create guest
  let guestRes = null;
  authController.guest({}, {
    status() { return this; },
    json(d) { guestRes = d; return this; }
  });
  const guestId = guestRes.user.id;

  // Set short grace period of 80ms for testing
  guestCleanupService.setGracePeriod(80);

  // Trigger unexpected disconnect
  guestCleanupService.handleDisconnect(guestId, true);
  assert.ok(guestCleanupService.pendingDisconnects.has(guestId), 'Pending disconnect timer set');

  // Simulate Reconnection within grace period
  guestCleanupService.handleReconnect(guestId);
  assert.strictEqual(guestCleanupService.pendingDisconnects.has(guestId), false, 'Timer cancelled on reconnect');

  // Verify guest is NOT purged
  assert.ok(db.prepare('SELECT id FROM users WHERE id = ?').get(guestId), 'Guest remains alive after reconnect');

  // Now trigger disconnect without reconnect and await grace period expiration
  guestCleanupService.handleDisconnect(guestId, true);
  assert.ok(guestCleanupService.pendingDisconnects.has(guestId), 'Disconnect timer set again');

  await new Promise(resolve => setTimeout(resolve, 120));

  // Verify guest has been automatically purged after grace period
  assert.strictEqual(db.prepare('SELECT id FROM users WHERE id = ?').get(guestId), null, 'Guest purged after grace period');

  // Reset grace period to default
  guestCleanupService.setGracePeriod(5 * 60 * 1000);
});

test('Scenario 7: Startup & Orphaned Guest Sweep (Server Restart Recovery)', () => {
  // Insert 2 orphaned guest accounts directly into DB as if server had crashed
  db.prepare(`
    INSERT INTO users (username, email, password_hash, is_online, current_status, is_guest)
    VALUES (?, ?, ?, 0, 'offline', 1)
  `).run('Guest_Orphan1', 'guest_orphan1@vortex.local', 'hash1');
  const orphan1 = db.prepare('SELECT id FROM users WHERE username = ?').get('Guest_Orphan1').id;
  db.prepare('INSERT INTO stats (user_id) VALUES (?)').run(orphan1);

  db.prepare(`
    INSERT INTO users (username, email, password_hash, is_online, current_status, is_guest)
    VALUES (?, ?, ?, 0, 'offline', 1)
  `).run('Guest_Orphan2', 'guest_orphan2@vortex.local', 'hash2');
  const orphan2 = db.prepare('SELECT id FROM users WHERE username = ?').get('Guest_Orphan2').id;
  db.prepare('INSERT INTO stats (user_id) VALUES (?)').run(orphan2);

  // Run startup recovery sweep
  const purgedCount = guestCleanupService.purgeOrphanedGuests();
  assert.ok(purgedCount >= 2, 'Orphaned guests purged');

  assert.strictEqual(db.prepare('SELECT id FROM users WHERE id = ?').get(orphan1), null, 'Orphan 1 purged from DB');
  assert.strictEqual(db.prepare('SELECT id FROM users WHERE id = ?').get(orphan2), null, 'Orphan 2 purged from DB');
});

test('Cleanup Test Database', () => {
  tokenRevocationService.clear();
  try {
    if (fs.existsSync(process.env.DB_PATH)) {
      fs.unlinkSync(process.env.DB_PATH);
    }
  } catch (e) {}
});
