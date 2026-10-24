const test = require('node:test');
const assert = require('node:assert');
const db = require('../server/database/db');
const authController = require('../server/auth/authController');
const Room = require('../server/game/Room');
const roomManager = require('../server/game/RoomManager');
const Player = require('../server/game/Player');
const BotPlayer = require('../server/game/BotPlayer');
const { MapData } = require('../server/game/MapData');

let mockHuman;
let mockHuman2;
let sentMessages = [];

test('Setup Match Countdown Test Suite & Database', async () => {
  await db.init();

  try {
    db.prepare('DELETE FROM users WHERE email IN (?, ?)').run('cd_tester1@test.io', 'cd_tester2@test.io');
  } catch (e) {}

  let user1, user2;
  authController.register({
    body: { username: 'CDTester1', email: 'cd_tester1@test.io', password: 'Password123!' }
  }, {
    status() { return this; },
    json(data) { user1 = data.user; return this; }
  });

  authController.register({
    body: { username: 'CDTester2', email: 'cd_tester2@test.io', password: 'Password123!' }
  }, {
    status() { return this; },
    json(data) { user2 = data.user; return this; }
  });

  mockHuman = new Player(user1.id, user1.username, {
    readyState: 1,
    send: (msg) => { sentMessages.push({ userId: user1.id, data: JSON.parse(msg) }); }
  }, {});

  mockHuman2 = new Player(user2.id, user2.username, {
    readyState: 1,
    send: (msg) => { sentMessages.push({ userId: user2.id, data: JSON.parse(msg) }); }
  }, {});
});

test('Match State Lifecycle: Transitions from Lobby to Countdown to Active', () => {
  const room = new Room('TEST_CD_01', {
    name: 'Countdown Lifecycle Arena',
    mapId: 'house',
    isPrivate: true,
    hostUserId: mockHuman.id,
    maxPlayers: 8,
    matchDuration: 300
  });

  room.addPlayer(mockHuman);
  assert.strictEqual(room.state, 'lobby', 'Initial room state must be lobby');

  // Start match with 5-second countdown
  room.startMatch({ countdown: 5 });
  assert.strictEqual(room.state, 'countdown', 'State must be countdown after startMatch with countdown: 5');
  assert.strictEqual(room.countdownTime, 5, 'Countdown time must be 5 seconds');
  assert.strictEqual(room.timeRemaining, 300, 'Match duration must not decrement during countdown');

  // Verify player is spawned deterministically at ground level
  assert.ok(mockHuman.isAlive, 'Player must be alive at spawn');
  assert.ok(Number.isFinite(mockHuman.position.x), 'Player has valid X spawn');
  assert.strictEqual(mockHuman.position.y, 0, 'Player foot level must be on ground surface');

  // Verify transition to active
  room.activateMatch();
  assert.strictEqual(room.state, 'active', 'Room must transition to active');
  assert.strictEqual(room.countdownTime, 0, 'Countdown time resets to 0 when active');

  room.destroy();
});

test('Combat Restriction: Shooting and Damage are Strictly Rejected During Countdown', () => {
  const room = roomManager.createAiMatch({
    difficulty: 'medium',
    botCount: 1,
    hostUserId: mockHuman.id,
    mapId: 'house'
  });

  room.addPlayer(mockHuman);
  room.initBots(1, 'medium');

  // Start with 5-second countdown
  room.startMatch({ countdown: 5 });
  assert.strictEqual(room.state, 'countdown');

  const bot = Array.from(room.players.values()).find(p => p.isBot);
  assert.ok(bot, 'Bot exists');

  // Position mock human and bot facing each other in open living room
  mockHuman.position.x = 6;
  mockHuman.position.y = 0;
  mockHuman.position.z = 2;
  mockHuman.activeWeaponId = 'sniper_rifle';
  mockHuman.weapons.sniper_rifle.ammoInMag = 5;

  bot.position.x = 6;
  bot.position.y = 0;
  bot.position.z = 5;
  const initialBotHp = bot.health;

  // Human attempts to shoot bot during countdown
  room.handlePlayerShoot(mockHuman.id, {
    origin: [6, 1.7, 2],
    dir: [0, 0, 1]
  });

  // Verification: Ammo must NOT be consumed, bot health must NOT change, bot must remain alive
  assert.strictEqual(mockHuman.weapons.sniper_rifle.ammoInMag, 5, 'Ammo must not be consumed during countdown');
  assert.strictEqual(bot.health, initialBotHp, 'Bot must not take damage during countdown');
  assert.strictEqual(bot.isAlive, true, 'Bot must remain alive during countdown');

  // Activate match
  room.activateMatch();
  assert.strictEqual(room.state, 'active');

  // Now fire shot during active match
  room.handlePlayerShoot(mockHuman.id, {
    origin: [6, 1.7, 2],
    dir: [0, 0, 1]
  });

  // Verification: Ammo consumed, bot damaged/eliminated
  assert.strictEqual(mockHuman.weapons.sniper_rifle.ammoInMag, 4, 'Ammo must be consumed during active combat');
  assert.ok(bot.health < initialBotHp || !bot.isAlive, 'Bot must take combat damage once match is active');

  room.destroy();
});

test('Bot AI Restraint: Bots Hold Fire and Do Not Attack During Countdown', () => {
  const room = roomManager.createAiMatch({
    difficulty: 'hard',
    botCount: 2,
    hostUserId: mockHuman.id,
    mapId: 'farm'
  });

  room.addPlayer(mockHuman);
  room.initBots(2, 'hard');

  // Position human right in front of bots
  mockHuman.position.x = 0;
  mockHuman.position.y = 0;
  mockHuman.position.z = 0;
  const initialHumanHp = mockHuman.health;

  room.startMatch({ countdown: 5 });

  // Simulate 30 server ticks (1 second of countdown)
  for (let t = 0; t < 30; t++) {
    room.tick();
  }

  // Human must take ZERO damage from bots during countdown
  assert.strictEqual(mockHuman.health, initialHumanHp, 'Human must take zero damage from bots during countdown');
  assert.strictEqual(mockHuman.isAlive, true, 'Human must not be eliminated during countdown');

  room.destroy();
});

test('Player Maneuvering: Movement Input is Accepted and Collision-Enforced During Countdown', () => {
  const room = new Room('TEST_CD_MOV', {
    name: 'Countdown Movement Arena',
    mapId: 'house',
    isPrivate: true,
    hostUserId: mockHuman.id,
    maxPlayers: 4
  });

  room.addPlayer(mockHuman);
  room.startMatch({ countdown: 5 });

  // Clear anti-stale-packet delay
  mockHuman.respawnTimestamp = Date.now() - 500;
  mockHuman.position.x = 3; // Inside living room area
  mockHuman.position.y = 0;
  mockHuman.position.z = 3;

  // Player maneuvers forward across living room during countdown
  room.handlePlayerInput(mockHuman.id, {
    position: { x: 6, y: 0, z: 3 },
    rotation: { yaw: 0, pitch: 0 }
  });

  assert.ok(Math.abs(mockHuman.position.x - 6) < 0.001, 'Player movement input must be accepted during countdown');

  // Player attempts to move through house perimeter fence (beyond bounds)
  const bounds = MapData.getBounds('house');
  room.handlePlayerInput(mockHuman.id, {
    position: { x: bounds.maxX + 20, y: 0, z: 0 },
    rotation: { yaw: 0, pitch: 0 }
  });

  assert.ok(mockHuman.position.x <= bounds.maxX - 0.4 + 0.01, 'Perimeter bounds must be enforced during countdown');

  room.destroy();
});

test('Match Duration Timer: Does Not Advance or Decrement Until Active Match', () => {
  const room = new Room('TEST_CD_TIMER', {
    name: 'Countdown Timer Arena',
    mapId: 'forest',
    isPrivate: true,
    hostUserId: mockHuman.id,
    maxPlayers: 4,
    matchDuration: 300
  });

  room.addPlayer(mockHuman);
  room.startMatch({ countdown: 5 });

  // During countdown, timeRemaining must not decrement
  assert.strictEqual(room.timeRemaining, 300, 'timeRemaining must stay at initial 300s');

  room.destroy();
});

test('Late-Joining Players: Receive Authoritative Countdown or Active State Synchronously', () => {
  const room = new Room('TEST_CD_LATE', {
    name: 'Late Join Arena',
    mapId: 'minecraft',
    isPrivate: true,
    hostUserId: mockHuman.id,
    maxPlayers: 8
  });

  room.addPlayer(mockHuman);
  room.startMatch({ countdown: 5 });

  // mockHuman2 joins while room is in countdown
  sentMessages = [];
  room.addPlayer(mockHuman2);

  const joinMsg = sentMessages.find(m => m.userId === mockHuman2.id && m.data.type === 'match_started');
  assert.ok(joinMsg, 'Late-joining player must receive match_started');
  assert.strictEqual(joinMsg.data.state, 'countdown', 'Late-joining player must receive countdown state');
  assert.strictEqual(joinMsg.data.countdownSeconds, 5, 'Late-joining player must receive remaining countdown');

  room.destroy();
});

test('Mid-Match Respawns: Do NOT Restart Match Countdown; Retain 3s Respawn Shield', () => {
  const room = new Room('TEST_CD_RESPAWN', {
    name: 'Respawn Lifecycle Arena',
    mapId: 'cruise',
    isPrivate: true,
    hostUserId: mockHuman.id,
    maxPlayers: 4
  });

  room.addPlayer(mockHuman);
  room.startMatch(); // Immediate active match (countdown: 0)
  assert.strictEqual(room.state, 'active');

  // Player is eliminated mid-match
  mockHuman.takeDamage(500);
  assert.strictEqual(mockHuman.isAlive, false);
  assert.strictEqual(room.state, 'active', 'Room must remain active on player elimination');

  // Fast-forward respawn timer
  mockHuman.respawnAt = Date.now() - 100;
  room.tick();

  assert.strictEqual(mockHuman.isAlive, true, 'Player must respawn');
  assert.strictEqual(room.state, 'active', 'Room must stay active after respawn, NOT restart 5s countdown');
  assert.strictEqual(mockHuman.isInvulnerable, true, 'Respawned player must have separate respawn shield');

  room.destroy();
});

test('Cleanup Match Countdown Test Database', () => {
  try {
    if (mockHuman && mockHuman.id) {
      db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(mockHuman.id, mockHuman2.id);
    }
  } catch (e) {}
});
