const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Use a temporary test database
process.env.DB_PATH = path.join(__dirname, 'test_vortex_arena.sqlite');
if (fs.existsSync(process.env.DB_PATH)) {
  fs.unlinkSync(process.env.DB_PATH);
}

const db = require('../server/database/db');
const { seedDatabase } = require('../server/database/seed');
const authController = require('../server/auth/authController');
const statsService = require('../server/services/statsService');
const skinService = require('../server/services/skinService');
const friendsService = require('../server/services/friendsService');
const Room = require('../server/game/Room');
const Player = require('../server/game/Player');
const WEAPONS = require('../server/game/WeaponData');
const { CollisionEngine } = require('../server/game/CollisionEngine');

test('Setup Test Database & Seed Data', async () => {
  await db.init();
  seedDatabase();
  const skins = db.prepare('SELECT COUNT(*) as count FROM skins').get();
  assert.ok(skins.count >= 12, 'Skins table should contain at least 12 seeded skins');
});

test('User Registration and Default Skins Assignment', () => {
  let resStatus = 200;
  let resData = null;
  const mockRes = {
    status(code) { resStatus = code; return this; },
    json(data) { resData = data; return this; }
  };

  // Register Player 1
  authController.register({
    body: {
      username: 'SoldierAlpha',
      email: 'alpha@test.com',
      password: 'Password123!'
    }
  }, mockRes);

  assert.strictEqual(resStatus, 201, 'Registration should return 201 Created');
  assert.ok(resData.token, 'Registration should return a JWT session token');
  assert.strictEqual(resData.user.username, 'SoldierAlpha');
  assert.ok(resData.user.equippedSkins.characterSkin, 'User should have an equipped character skin');
  assert.strictEqual(resData.user.equippedSkins.characterSkin.skin_id, 'char_default');
  assert.strictEqual(resData.user.equippedSkins.weaponSkin.skin_id, 'wep_default');

  // Register Player 2
  authController.register({
    body: {
      username: 'SniperBravo',
      email: 'bravo@test.com',
      password: 'Password123!'
    }
  }, mockRes);
  assert.strictEqual(resStatus, 201);
});

test('Duplicate Registration Prevention & Password Security', () => {
  let resStatus = 200;
  let resData = null;
  const mockRes = {
    status(code) { resStatus = code; return this; },
    json(data) { resData = data; return this; }
  };

  // Attempt duplicate username
  authController.register({
    body: {
      username: 'SoldierAlpha',
      email: 'unique@test.com',
      password: 'Password123!'
    }
  }, mockRes);

  assert.strictEqual(resStatus, 409, 'Duplicate username should return 409 Conflict');

  // Attempt invalid password login
  authController.login({
    body: {
      usernameOrEmail: 'SoldierAlpha',
      password: 'WrongPassword'
    }
  }, mockRes);
  assert.strictEqual(resStatus, 401, 'Invalid password should be rejected');
});

test('Friends System Lifecycle (Search, Request, Accept, Status, Block, Report)', () => {
  const alphaUser = db.prepare('SELECT id FROM users WHERE username = ?').get('SoldierAlpha');
  const bravoUser = db.prepare('SELECT id FROM users WHERE username = ?').get('SniperBravo');

  assert.ok(alphaUser && bravoUser, 'Both test users should exist in the database');

  // 1. Search for user
  const searchResults = friendsService.searchUsers(alphaUser.id, 'Bravo');
  assert.ok(searchResults.length >= 1);
  assert.strictEqual(searchResults[0].username, 'SniperBravo');

  // 2. Send Friend Request
  const reqResult = friendsService.sendFriendRequest(alphaUser.id, bravoUser.id);
  assert.strictEqual(reqResult.success, true);

  // 3. Bravo checks incoming requests
  const bravoFriends = friendsService.getFriendsList(bravoUser.id);
  assert.strictEqual(bravoFriends.incomingRequests.length, 1);
  assert.strictEqual(bravoFriends.incomingRequests[0].senderId, alphaUser.id);

  // 4. Bravo accepts request
  const acceptResult = friendsService.acceptFriendRequest(bravoUser.id, bravoFriends.incomingRequests[0].requestId);
  assert.strictEqual(acceptResult.success, true);

  // 5. Verify friendship established
  const alphaFriends = friendsService.getFriendsList(alphaUser.id);
  assert.strictEqual(alphaFriends.friends.length, 1);
  assert.strictEqual(alphaFriends.friends[0].username, 'SniperBravo');

  // 6. Test report abusive player
  const reportResult = friendsService.reportUser(alphaUser.id, bravoUser.id, 'Toxic Voice Chat', 'Detailed statement');
  assert.strictEqual(reportResult.success, true);

  // 7. Test block player
  const blockResult = friendsService.blockUser(alphaUser.id, bravoUser.id);
  assert.strictEqual(blockResult.success, true);
});

test('Authoritative Kill-Based Milestone Progression (10, 50, 60,000 kills)', () => {
  const alphaUser = db.prepare('SELECT id FROM users WHERE username = ?').get('SoldierAlpha');

  // Initial stats
  let userStats = statsService.getUserStats(alphaUser.id);
  assert.strictEqual(userStats.stats.lifetimeKills, 0);
  assert.strictEqual(userStats.progression.nextMilestone.requiredKills, 10);

  // Record 5 kills: should not unlock 10-kill milestone yet
  statsService.recordKills(alphaUser.id, 5);
  userStats = statsService.getUserStats(alphaUser.id);
  assert.strictEqual(userStats.stats.lifetimeKills, 5);
  assert.strictEqual(userStats.progression.nextMilestone.requiredKills, 10);
  assert.strictEqual(userStats.progression.nextMilestone.progressText, '5 / 10 kills');

  // Record 5 more kills (Total = 10): UNLOCKS 10-KILL MILESTONE ('wep_bronze')
  const milestone10Result = statsService.recordKills(alphaUser.id, 5);
  assert.strictEqual(milestone10Result.totalLifetimeKills, 10);
  const unlockedBronze = milestone10Result.unlockedRewards.find(r => r.skinId === 'wep_bronze' || r.key === 'milestone_10_kills');
  assert.ok(unlockedBronze, 'Reaching 10 kills must authoritatively unlock the Bronze reward');

  // Verify skin is in inventory and can be equipped
  const skinsAfter10 = skinService.getUserSkins(alphaUser.id);
  const bronzeSkin = skinsAfter10.find(s => s.skin_id === 'wep_bronze');
  assert.ok(bronzeSkin && bronzeSkin.is_unlocked, 'Bronze weapon skin should be unlocked in inventory');

  const equipBronze = skinService.equipSkin(alphaUser.id, 'wep_bronze');
  assert.strictEqual(equipBronze.success, true);

  const equipped = skinService.getEquippedSkins(alphaUser.id);
  assert.strictEqual(equipped.weaponSkin.skin_id, 'wep_bronze');

  // Record up to 50 kills (Add 40 kills): UNLOCKS 50-KILL MILESTONE ('char_silver')
  const milestone50Result = statsService.recordKills(alphaUser.id, 40);
  assert.strictEqual(milestone50Result.totalLifetimeKills, 50);
  const silverSkin = milestone50Result.unlockedRewards.find(r => r.skinId === 'char_silver');
  assert.ok(silverSkin, 'Reaching 50 kills must authoritatively unlock the Silver Vanguard skin');

  // Verify Silver skin equip
  const equipSilver = skinService.equipSkin(alphaUser.id, 'char_silver');
  assert.strictEqual(equipSilver.success, true);

  // Record up to 60,000 kills: UNLOCKS ULTIMATE 60k MILESTONE ('char_apex_overlord' + 'wep_solaris')
  const milestone60kResult = statsService.recordKills(alphaUser.id, 59950);
  assert.strictEqual(milestone60kResult.totalLifetimeKills, 60000);
  const apexSkin = milestone60kResult.unlockedRewards.find(r => r.skinId === 'char_apex_overlord');
  const solarisWep = milestone60kResult.unlockedRewards.find(r => r.skinId === 'wep_solaris');
  assert.ok(apexSkin, 'Reaching 60,000 kills must unlock the Legendary Apex Overlord character skin');
  assert.ok(solarisWep, 'Reaching 60,000 kills must unlock the Solaris Oblivion exclusive weapon skin');

  // Check 60k progression metrics
  const finalStats = statsService.getUserStats(alphaUser.id);
  assert.strictEqual(finalStats.progression.progressTo60k.percentage, '100.00');
  assert.strictEqual(finalStats.progression.progressTo60k.remaining, 0);
});

test('Multiplayer Room Capacity Enforcement (Hard 12-Player Limit)', () => {
  const room = new Room('TEST12', { isPrivate: true, maxPlayers: 12 });

  // Add 12 players
  for (let i = 1; i <= 12; i++) {
    const mockWs = { send() {}, readyState: 1 };
    const p = new Player(100 + i, `Player_${i}`, mockWs);
    const result = room.addPlayer(p);
    assert.strictEqual(result.success, true, `Player ${i} should be admitted to room`);
  }

  assert.strictEqual(room.playerCount, 12, 'Room should have exactly 12 players');
  assert.strictEqual(room.isFull(), true, 'Room isFull() should be true');

  // Attempt to add 13th player: MUST BE REJECTED
  const mockWs13 = { send() {}, readyState: 1 };
  const player13 = new Player(999, 'Player_13_Overflow', mockWs13);
  const rejectResult = room.addPlayer(player13);

  assert.strictEqual(rejectResult.success, false, '13th player must be rejected');
  assert.match(rejectResult.error, /12\/12/);

  room.destroy();
});

test('Combat Mechanics & Collision Validation', () => {
  const mockWsA = { send() {}, readyState: 1 };
  const mockWsB = { send() {}, readyState: 1 };

  const shooter = new Player(1, 'Shooter', mockWsA);
  const victim = new Player(2, 'Victim', mockWsB);

  // Position shooter at (0, 0, 0) and victim directly in front at (0, 0, 10)
  shooter.position = { x: 0, y: 0, z: 0 };
  victim.position = { x: 0, y: 0, z: 10 };
  victim.health = 100;
  victim.shield = 50;

  // 1. Validate line of sight raycast with assault rifle
  const rayOrigin = [0, 1.5, 0];
  const rayDir = [0, 0, 1]; // Straight at victim

  const hit = CollisionEngine.validateShot(shooter, rayOrigin, rayDir, [victim], WEAPONS.assault_rifle);
  assert.ok(hit, 'Direct shot along clear line of sight should hit victim');
  assert.strictEqual(hit.targetPlayer.id, victim.id);

  // 2. Test shield absorption and damage calculation
  const dmgResult = victim.takeDamage(50, shooter, false);
  assert.ok(victim.shield < 50, 'Shield should absorb part of incoming damage');
  assert.ok(victim.health < 100, 'Health should take remaining damage');
  assert.strictEqual(victim.isAlive, true);

  // 3. Test fatal elimination
  const fatalResult = victim.takeDamage(200, shooter, true);
  assert.strictEqual(fatalResult.killed, true);
  assert.strictEqual(victim.health, 0);
  assert.strictEqual(victim.isAlive, false);
  assert.strictEqual(shooter.matchKills, 1);
});

// Cleanup test DB
test('Cleanup', () => {
  if (fs.existsSync(process.env.DB_PATH)) {
    fs.unlinkSync(process.env.DB_PATH);
  }
});
