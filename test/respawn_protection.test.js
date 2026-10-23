const test = require('node:test');
const assert = require('node:assert');
const db = require('../server/database/db');
const authController = require('../server/auth/authController');
const { MAPS, MapData } = require('../server/game/MapData');
const { CollisionEngine } = require('../server/game/CollisionEngine');
const Room = require('../server/game/Room');
const Player = require('../server/game/Player');
const BotPlayer = require('../server/game/BotPlayer');
const config = require('../server/config');

let testUser;
let testPlayer;

test('Setup Respawn Protection Test Suite', async () => {
  await db.init();

  try {
    db.prepare('DELETE FROM users WHERE email = ? OR username = ?').run('protection@test.io', 'ProtectionTester');
  } catch (e) {}

  let user = null;
  authController.register({
    body: { username: 'ProtectionTester', email: 'protection@test.io', password: 'Password123!' }
  }, {
    status() { return this; },
    json(data) { user = data.user; return this; }
  });

  assert.ok(user && user.id, 'Protection test user registered');
  testUser = user;
  testPlayer = new Player(user.id, user.username, { readyState: 1, send: () => {} }, {});
});

test('Deterministic Ground Alignment: Initial and Respawn Coordinates Set Correct Foot and Eye Levels', () => {
  const mapIds = ['house', 'farm', 'forest', 'minecraft', 'cruise', 'sector7'];

  for (const mapId of mapIds) {
    const spawns = MapData.getSpawnPoints(mapId);
    assert.ok(spawns && spawns.length >= 12, `${mapId} has spawn points`);

    for (const sp of spawns) {
      // Foot position on ground surface (>= 0)
      const footY = (sp.y !== undefined && Number.isFinite(sp.y)) ? sp.y : 0;
      assert.ok(footY >= 0, `Map ${mapId} spawn footY should be on or above ground level (>= 0)`);

      // Eye height must be exactly 1.7m above spawn foot level
      const eyeY = footY + 1.7;
      assert.strictEqual(eyeY, footY + 1.7, `Camera eye height on ${mapId} must be 1.7m above foot position`);

      // Spawn point must be clear of collision
      const isColliding = CollisionEngine.isColliding(sp.x, footY, sp.z, 0.4, 1.85, mapId);
      assert.strictEqual(isColliding, false, `Spawn point (${sp.x}, ${sp.z}) on ${mapId} must not collide with obstacles`);
    }
  }
});

test('Safe Spawn Selection: Never Spawns Victims in Close Proximity or Crosshairs of Alive Enemies', () => {
  const room = new Room('TEST_SAFE_SPAWN', {
    name: 'Safe Spawn Arena',
    mapId: 'house',
    isPrivate: true,
    hostUserId: testPlayer.id,
    maxPlayers: 12
  });

  room.addPlayer(testPlayer);
  room.initBots(3, 'hard');
  room.startMatch();

  const bots = Array.from(room.players.values()).filter(p => p.isBot);
  assert.strictEqual(bots.length, 3);

  // Position all 3 bots around the front driveway / porch area (around z = 20)
  bots[0].position = { x: -14, y: 0, z: 20 };
  bots[1].position = { x: 0, y: 0, z: 20 };
  bots[2].position = { x: 18, y: 0, z: 22 };

  // Select safe spawn point for human player
  const safeSpawn = room.getSafeSpawnPoint(testPlayer);

  // Calculate distance from candidate safe spawn to the clustered enemies
  const dist0 = Math.hypot(safeSpawn.x - bots[0].position.x, safeSpawn.z - bots[0].position.z);
  const dist1 = Math.hypot(safeSpawn.x - bots[1].position.x, safeSpawn.z - bots[1].position.z);
  const dist2 = Math.hypot(safeSpawn.x - bots[2].position.x, safeSpawn.z - bots[2].position.z);
  const minDist = Math.min(dist0, dist1, dist2);

  // Must NOT spawn within 10 meters of the clustered enemies
  assert.ok(minDist >= 12, `Safe spawn must maintain distance from enemies, got minDist=${minDist.toFixed(1)}m`);

  room.destroy();
});

test('Respawn Protection Period: Immunity From Enemy Bullets and Instant Eliminations', () => {
  const room = new Room('TEST_INVULN_ROOM', {
    name: 'Invulnerability Test',
    mapId: 'house',
    isPrivate: true,
    hostUserId: testPlayer.id,
    maxPlayers: 8
  });

  room.addPlayer(testPlayer);
  room.startMatch();

  const enemyShooter = new Player('enemy_sniper', 'SniperElite', { readyState: 1, send: () => {} }, {});
  room.addPlayer(enemyShooter);

  // Respawn testPlayer with full 3.0s protection
  const spawn = room.getSafeSpawnPoint(testPlayer);
  testPlayer.respawn(spawn, 3.0);

  assert.strictEqual(testPlayer.isInvulnerable, true, 'Player must be invulnerable immediately upon respawn');

  // Place enemy 5 meters directly in front of victim
  enemyShooter.position = { x: testPlayer.position.x, y: 0, z: testPlayer.position.z - 5 };
  enemyShooter.activeWeaponId = 'sniper_rifle';
  enemyShooter.weapons.sniper_rifle.ammoInMag = 5;

  let hitConfirmedMsg = null;
  let damagedMsg = null;
  enemyShooter.ws.send = (raw) => {
    const parsed = JSON.parse(raw);
    if (parsed.type === 'hit_confirmed') hitConfirmedMsg = parsed;
  };
  testPlayer.ws.send = (raw) => {
    const parsed = JSON.parse(raw);
    if (parsed.type === 'damaged') damagedMsg = parsed;
  };

  // Enemy fires high-caliber sniper rifle directly at victim's head
  room.handlePlayerShoot(enemyShooter.id, {
    origin: [enemyShooter.position.x, 1.7, enemyShooter.position.z],
    dir: [0, 0, 1] // Direct straight headshot vector
  });

  // Verify shot hit was absorbed completely by the respawn protection shield
  assert.strictEqual(testPlayer.isAlive, true, 'Invulnerable player cannot be eliminated');
  assert.strictEqual(testPlayer.health, 100, 'Health must remain untouched at 100%');
  assert.strictEqual(testPlayer.shield, 50, 'Shield must remain untouched at 50');
  assert.strictEqual(enemyShooter.matchKills, 0, 'Shooter earned zero kills');

  assert.ok(hitConfirmedMsg, 'Shooter receives hit confirmation');
  assert.strictEqual(hitConfirmedMsg.isInvulnerable, true, 'Confirmation notifies shooter of target invulnerability');
  assert.strictEqual(hitConfirmedMsg.damageApplied, 0, 'Zero damage applied');

  // Fast-forward protection timer to simulate expiration after 3.0 seconds
  testPlayer.invulnerableUntil = Date.now() - 100;
  assert.strictEqual(testPlayer.isInvulnerable, false, 'Invulnerability expires after configured duration');

  // Enemy fires again after shield expiration
  enemyShooter.weapons.sniper_rifle.lastFiredAt = 0;
  room.handlePlayerShoot(enemyShooter.id, {
    origin: [enemyShooter.position.x, 1.7, enemyShooter.position.z],
    dir: [0, 0, 1]
  });

  // Normal lethal damage resumes immediately after shield expires
  assert.strictEqual(testPlayer.isAlive, false, 'Victim is eliminated by sniper after protection expires');
  assert.strictEqual(enemyShooter.matchKills, 1, 'Shooter confirmed kill recorded');

  room.destroy();
});

test('Bot AI Perception: Holds Fire and Deprioritizes Shielded Players', () => {
  const room = new Room('TEST_AI_PERCEPTION', {
    name: 'AI Perception Room',
    mapId: 'house',
    isPrivate: true,
    hostUserId: testPlayer.id,
    maxPlayers: 8
  });

  room.addPlayer(testPlayer);
  room.initBots(1, 'hard');
  room.startMatch();

  const bot = Array.from(room.players.values()).find(p => p.isBot);
  assert.ok(bot, 'Bot exists');

  // Give player 3.0s protection
  testPlayer.respawn(room.getSafeSpawnPoint(testPlayer), 3.0);
  assert.strictEqual(testPlayer.isInvulnerable, true);

  // Position bot facing player directly at 6m
  bot.position = { x: 0, y: 0, z: 0 };
  testPlayer.position = { x: 0, y: 0, z: 6 };
  bot.rotation.yaw = 0;

  // Track shoot calls
  let botShotFired = false;
  const originalHandleShoot = room.handlePlayerShoot.bind(room);
  room.handlePlayerShoot = (userId, data) => {
    if (userId === bot.id) botShotFired = true;
    return originalHandleShoot(userId, data);
  };

  // Run 30 simulation ticks (1 second)
  for (let i = 0; i < 30; i++) {
    bot.update(1 / 30, room);
  }

  // Bot should NOT shoot at the invulnerable player
  assert.strictEqual(botShotFired, false, 'Bot should hold fire and not shoot at protected player');
  assert.strictEqual(testPlayer.health, 100, 'Player health remains 100%');

  room.destroy();
});

test('Practice Mode: Instant Target Practice Without Invulnerability Delays', () => {
  const room = new Room('TEST_PRACTICE_INVULN', {
    name: 'Practice Sandbox',
    mapId: 'house',
    isPrivate: true,
    isPractice: true,
    hostUserId: testPlayer.id,
    maxPlayers: 8
  });

  testPlayer.respawn({ x: 0, y: 0, z: 0 }, 0);
  room.addPlayer(testPlayer);
  room.initBots(1, 'easy');
  room.startMatch();

  const bot = Array.from(room.players.values()).find(p => p.isBot);
  assert.ok(bot, 'Practice target bot exists');

  // In practice mode, target bots have zero invulnerability on respawn for instant training
  assert.strictEqual(bot.isInvulnerable, false, 'Practice mode bots must not have spawn invulnerability');

  // Position player and bot in open front lawn with clear line of sight
  testPlayer.position = { x: 0, y: 0, z: 20 };
  bot.position = { x: 0, y: 0, z: 24 };
  testPlayer.activeWeaponId = 'sniper_rifle';
  testPlayer.weapons.sniper_rifle.ammoInMag = 5;

  room.handlePlayerShoot(testPlayer.id, {
    origin: [0, 1.7, 20],
    dir: [0, 0, 1]
  });

  assert.strictEqual(bot.isAlive, false, 'Target eliminated immediately in practice mode');

  room.destroy();
});

test('Cleanup Respawn Protection Test Database', () => {
  try {
    if (testUser && testUser.id) {
      db.prepare('DELETE FROM users WHERE id = ?').run(testUser.id);
    }
  } catch (e) {}
});
