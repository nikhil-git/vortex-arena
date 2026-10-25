const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Configure isolated test database
process.env.DB_PATH = path.join(__dirname, 'test_lifetime_kills.sqlite');
if (fs.existsSync(process.env.DB_PATH)) {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
}

const db = require('../server/database/db');
const { seedDatabase } = require('../server/database/seed');
const authController = require('../server/auth/authController');
const statsService = require('../server/services/statsService');
const skinService = require('../server/services/skinService');
const Room = require('../server/game/Room');
const Player = require('../server/game/Player');

let testUser1;
let testGuestUser;
let wsMessages = [];

function createMockSocket(playerId) {
  return {
    readyState: 1,
    send(raw) {
      wsMessages.push({ playerId, data: JSON.parse(raw) });
    }
  };
}

test('Setup Lifetime Kills Test Suite & Database', async () => {
  await db.init();
  seedDatabase();

  // Create registered test user
  authController.register({
    body: { username: 'UniqueHunter', email: 'hunter@test.io', password: 'Password123!' }
  }, {
    status() { return this; },
    json(data) { testUser1 = data.user; return this; }
  });

  assert.ok(testUser1 && testUser1.id, 'Registered user created');

  // Create guest user
  authController.guest({
    headers: {},
    ip: '127.0.0.1'
  }, {
    status() { return this; },
    json(data) {
      testGuestUser = data.user;
      testGuestUser.token = data.token;
      return this;
    }
  });

  assert.ok(testGuestUser && testGuestUser.id && testGuestUser.token, 'Guest user created with token');
});

test('Scenario 1: normalizeUserId resolves all user ID formats', () => {
  const numericId = testUser1.id;
  const tag = `#${String(numericId).padStart(4, '0')}`;
  const username = 'UniqueHunter';

  assert.strictEqual(statsService.normalizeUserId(numericId), numericId, 'Numeric ID preserved');
  assert.strictEqual(statsService.normalizeUserId(String(numericId)), numericId, 'String numeric ID parsed to integer');
  assert.strictEqual(statsService.normalizeUserId(tag), numericId, 'User tag #000X parsed to integer');
  assert.strictEqual(statsService.normalizeUserId(username), numericId, 'Username resolved to user ID');
  assert.strictEqual(statsService.normalizeUserId('unknown_user_999'), 'unknown_user_999', 'Unknown returns fallback');
  assert.strictEqual(statsService.normalizeUserId(null), null, 'Null returns null');
});

test('Scenario 2: Auto-healing & updating lifetime kills when stats row was uninitialized', () => {
  // Directly insert user without stats row to simulate edge-case
  const insertRaw = db.prepare(`
    INSERT INTO users (username, email, password_hash, is_online, current_status, is_guest)
    VALUES ('UnseededUser', 'unseeded@test.io', 'hash123', 1, 'online', 0)
  `).run();
  const rawUserId = insertRaw.lastInsertRowid;

  // Verify no row in stats initially
  const initialRow = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(rawUserId);
  assert.strictEqual(initialRow, null, 'Stats row initially absent');

  // recordKills should auto-heal and record 3 kills
  const result = statsService.recordKills(rawUserId, 3, false, 150);
  assert.strictEqual(result.totalLifetimeKills, 3, 'Lifetime kills updated to 3');

  const healedRow = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(rawUserId);
  assert.ok(healedRow, 'Stats row auto-created');
  assert.strictEqual(healedRow.lifetime_kills, 3);
  assert.strictEqual(healedRow.lifetime_damage, 150);

  // getUserStats should retrieve complete data
  const userStats = statsService.getUserStats(rawUserId);
  assert.strictEqual(userStats.stats.lifetimeKills, 3);
  assert.strictEqual(userStats.progression.currentKills, 3);
});

test('Scenario 3: Updating lifetime kills using user tag, string ID, and username', () => {
  const userId = testUser1.id;
  const tag = `#${String(userId).padStart(4, '0')}`;

  // Record 2 kills using tag
  const tagResult = statsService.recordKills(tag, 2);
  assert.strictEqual(tagResult.totalLifetimeKills, 2, 'Kills updated via tag');

  // Record 3 kills using string ID
  const strResult = statsService.recordKills(String(userId), 3);
  assert.strictEqual(strResult.totalLifetimeKills, 5, 'Kills updated via string ID');

  // Record 5 kills using username (Total = 10 kills -> triggers milestone unlock)
  const userResult = statsService.recordKills('UniqueHunter', 5);
  assert.strictEqual(userResult.totalLifetimeKills, 10, 'Kills updated via username');

  // Check 10-kill milestone reward unlocked
  const unlocked = userResult.unlockedRewards.find(r => r.requiredKills === 10);
  assert.ok(unlocked, '10-kill milestone reward unlocked');

  // Check skin is unlocked in inventory
  const skins = skinService.getUserSkins(tag);
  const bronze = skins.find(s => s.skin_id === 'wep_bronze');
  assert.ok(bronze && bronze.is_unlocked, 'Bronze skin unlocked in inventory via tag lookup');
  assert.strictEqual(bronze.killsProgress, 10, 'Kills progress accurately reflects 10 kills');
});

test('Scenario 4: Authoritative in-game combat emits stats_updated to killer in real-time', () => {
  wsMessages = [];
  const room = new Room('ARENA_KILL_TEST', {
    name: 'Authoritative Arena',
    gameMode: 'ffa',
    mapId: 'house',
    hostUserId: testUser1.id
  });

  const killerPlayer = new Player(testUser1.id, testUser1.username, createMockSocket(testUser1.id), {});
  const victimPlayer = new Player(99999, 'BotTarget', createMockSocket(99999), {});
  victimPlayer.isBot = true;

  room.addPlayer(killerPlayer);
  room.addPlayer(victimPlayer);
  room.state = 'active';

  // Position killer and victim with clear sightline in open front lawn
  killerPlayer.position = { x: 18, y: 0, z: 20 };
  victimPlayer.position = { x: 18, y: 0, z: 23 };
  victimPlayer.health = 50;
  victimPlayer.shield = 0;
  killerPlayer.activeWeaponId = 'sniper_rifle'; // 95 dmg

  room.handlePlayerShoot(killerPlayer.id, {
    origin: [18, 1.5, 20],
    dir: [0, 0, 1]
  });

  // Verify victim died
  assert.strictEqual(victimPlayer.isAlive, false, 'Victim was eliminated');

  // Verify killer received real-time stats_updated event
  const statsUpdated = wsMessages.find(m => m.playerId === testUser1.id && m.data.type === 'stats_updated');
  assert.ok(statsUpdated, 'Killer received stats_updated packet');
  assert.strictEqual(statsUpdated.data.lifetimeKills, 11, 'Lifetime kills increased from 10 to 11');

  room.destroy();
});

test('Scenario 5: Guest account registration preserves exact unique user ID and lifetime kills', () => {
  // Give guest user 8 lifetime kills
  statsService.recordKills(testGuestUser.id, 8);
  const guestStatsBefore = statsService.getUserStats(testGuestUser.id);
  assert.strictEqual(guestStatsBefore.stats.lifetimeKills, 8, 'Guest has 8 kills');

  // Guest upgrades to registered account using their existing user ID
  let upgradedUser;
  authController.register({
    headers: { authorization: `Bearer ${testGuestUser.token}` },
    body: {
      username: 'PromotedOperative',
      email: 'promoted@test.io',
      password: 'SecurePassword99!'
    }
  }, {
    status(code) { return this; },
    json(data) { upgradedUser = data.user; return this; }
  });

  assert.ok(upgradedUser, 'Registration succeeded');
  assert.strictEqual(upgradedUser.id, testGuestUser.id, 'User ID preserved through registration');
  assert.strictEqual(upgradedUser.username, 'PromotedOperative', 'Username updated');
  assert.strictEqual(upgradedUser.isGuest, false, 'No longer marked as guest');

  // Verify lifetime kills preserved
  const statsAfter = statsService.getUserStats(upgradedUser.id);
  assert.strictEqual(statsAfter.stats.lifetimeKills, 8, 'All 8 lifetime kills preserved after registration');
});

test('Scenario 6: Querying stats by unique user ID via service and parameter formats', () => {
  // Query by numeric ID
  const stats1 = statsService.getUserStats(testUser1.id);
  assert.strictEqual(stats1.stats.lifetimeKills, 11);
  assert.strictEqual(stats1.stats.tag, `#${String(testUser1.id).padStart(4, '0')}`);

  // Query by user tag string
  const statsTag = statsService.getUserStats(`#${String(testUser1.id).padStart(4, '0')}`);
  assert.strictEqual(statsTag.stats.lifetimeKills, 11);

  // Query by username
  const statsUser = statsService.getUserStats('UniqueHunter');
  assert.strictEqual(statsUser.stats.lifetimeKills, 11);

  // Query promoted guest
  const statsGuest = statsService.getUserStats(testGuestUser.id);
  assert.strictEqual(statsGuest.stats.lifetimeKills, 8);
});

test('Cleanup Lifetime Kills Test Database', () => {
  if (fs.existsSync(process.env.DB_PATH)) {
    try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  }
});
