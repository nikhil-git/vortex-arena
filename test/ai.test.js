const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Test database setup
process.env.DB_PATH = path.join(__dirname, 'test_ai.sqlite');
if (fs.existsSync(process.env.DB_PATH)) {
  fs.unlinkSync(process.env.DB_PATH);
}

const db = require('../server/database/db');
const { seedDatabase } = require('../server/database/seed');
const roomManager = require('../server/game/RoomManager');
const Player = require('../server/game/Player');
const BotPlayer = require('../server/game/BotPlayer');
const { BotAI, DIFFICULTY_CONFIG } = require('../server/game/BotAI');
const authController = require('../server/auth/authController');

let mockHuman;

test('Setup AI Test Suite & Database', async () => {
  await db.init();
  seedDatabase();

  // Register mock test player
  let token = null;
  let user = null;
  authController.register({
    body: { username: 'AiCommander', email: 'commander@test.io', password: 'Password123!' }
  }, {
    status() { return this; },
    json(data) { token = data.token; user = data.user; return this; }
  });

  assert.ok(user && user.id, 'Commander user created');
  mockHuman = new Player(user.id, user.username, { readyState: 1, send: () => {} }, {});
});

test('BotPlayer Creation and Difficulty Configuration', () => {
  const easyBot = new BotPlayer(0, 'easy', 'solo');
  const mediumBot = new BotPlayer(1, 'medium', 'solo');
  const hardBot = new BotPlayer(2, 'hard', 'solo');
  const expertBot = new BotPlayer(3, 'expert', 'solo');

  assert.strictEqual(easyBot.isBot, true);
  assert.strictEqual(easyBot.difficulty, 'easy');
  assert.strictEqual(easyBot.ai.config.reactionTimeMs, DIFFICULTY_CONFIG.easy.reactionTimeMs);

  assert.strictEqual(expertBot.difficulty, 'expert');
  assert.strictEqual(expertBot.ai.config.reactionTimeMs, DIFFICULTY_CONFIG.expert.reactionTimeMs);
  assert.ok(expertBot.ai.config.reactionTimeMs < easyBot.ai.config.reactionTimeMs, 'Expert bot reacts faster than Easy bot');
  assert.ok(expertBot.ai.config.aimInaccuracy < easyBot.ai.config.aimInaccuracy, 'Expert bot has higher aim accuracy');
});

test('Single Player vs AI Room Creation & 12-Player Limit', () => {
  const room = roomManager.createAiMatch({
    difficulty: 'hard',
    botCount: 11, // 1 human + 11 bots = 12 max
    gameMode: 'ffa',
    scoreLimit: 25,
    matchDuration: 300,
    hostUserId: mockHuman.id
  });

  assert.strictEqual(room.isAiMatch, true);
  assert.strictEqual(room.aiDifficulty, 'hard');
  assert.strictEqual(room.maxPlayers, 12);

  // Add human
  const joinRes = room.addPlayer(mockHuman);
  assert.strictEqual(joinRes.success, true);

  // Populate 11 bots
  room.initBots(11, 'hard');
  assert.strictEqual(room.playerCount, 12, 'Room holds exactly 12 combatants');
  assert.strictEqual(room.isFull(), true, 'Room is at full 12/12 capacity');

  // Verify trying to add 13th player fails
  const extraBot = new BotPlayer(99, 'hard', 'solo');
  const overflowRes = room.addPlayer(extraBot);
  assert.strictEqual(overflowRes.success, false, '13th player rejected');
});

test('AI Navigation, Perception, and Obstacle Avoidance', () => {
  const room = roomManager.createAiMatch({
    difficulty: 'medium',
    botCount: 2,
    hostUserId: mockHuman.id
  });

  room.addPlayer(mockHuman);
  room.initBots(2, 'medium');
  room.startMatch();

  const bots = Array.from(room.players.values()).filter(p => p.isBot);
  assert.strictEqual(bots.length, 2);

  const testBot = bots[0];
  const startX = testBot.position.x;
  const startZ = testBot.position.z;

  // Simulate 30 server frames (1 second of game time)
  for (let i = 0; i < 30; i++) {
    testBot.update(1 / 30, room);
  }

  // Verify bot moved
  const distMoved = Math.hypot(testBot.position.x - startX, testBot.position.z - startZ);
  assert.ok(distMoved > 0.1, 'Bot successfully moved across arena waypoints');

  // Verify bot stays within perimeter bounds
  assert.ok(testBot.position.x >= -38.5 && testBot.position.x <= 38.5);
  assert.ok(testBot.position.z >= -38.5 && testBot.position.z <= 38.5);

  room.destroy();
});

test('Combat Engagement: Human Eliminates Bot & Earns Authoritative Progression', () => {
  const room = roomManager.createAiMatch({
    difficulty: 'medium',
    botCount: 1,
    hostUserId: mockHuman.id
  });

  room.addPlayer(mockHuman);
  room.initBots(1, 'medium');
  room.startMatch();

  const bot = Array.from(room.players.values()).find(p => p.isBot);
  assert.ok(bot, 'Bot exists');

  // Position human close to bot facing bot
  mockHuman.position.x = 0;
  mockHuman.position.y = 0;
  mockHuman.position.z = 0;

  bot.position.x = 0;
  bot.position.y = 0;
  bot.position.z = 5; // 5 meters away in direct line of sight

  // Human fires sniper rifle directly at bot's head
  mockHuman.activeWeaponId = 'sniper_rifle';
  mockHuman.weapons.sniper_rifle.ammoInMag = 5;

  const shootData = {
    origin: [0, 1.7, 0],
    dir: [0, 0, 1] // Straight forward along +Z axis towards bot
  };

  room.handlePlayerShoot(mockHuman.id, shootData);

  // Sniper rifle deals 110 dmg (instakill)
  assert.strictEqual(bot.isAlive, false, 'Bot was eliminated by human sniper headshot');
  assert.strictEqual(mockHuman.matchKills, 1, 'Human match kills incremented to 1');

  // Verify kill persisted to database
  const stats = db.prepare('SELECT lifetime_kills FROM stats WHERE user_id = ?').get(mockHuman.id);
  assert.strictEqual(stats.lifetime_kills, 1, 'Confirmed kill was authoritatively saved to SQLite stats');

  room.destroy();
});

test('Practice Mode: Sandbox with Instant Respawn and No Death Penalty', () => {
  const room = roomManager.createAiMatch({
    difficulty: 'easy',
    botCount: 1,
    isPractice: true,
    hostUserId: mockHuman.id
  });

  assert.strictEqual(room.isPractice, true);
  room.addPlayer(mockHuman);
  room.initBots(1, 'easy');
  room.startMatch();

  const bot = Array.from(room.players.values()).find(p => p.isBot);
  bot.position.x = 0;
  bot.position.y = 0;
  bot.position.z = 4;

  mockHuman.position.x = 0;
  mockHuman.position.y = 0;
  mockHuman.position.z = 0;
  mockHuman.activeWeaponId = 'sniper_rifle';
  mockHuman.weapons.sniper_rifle.ammoInMag = 5;
  mockHuman.weapons.sniper_rifle.lastFiredAt = 0;

  const killsBefore = db.prepare('SELECT lifetime_kills FROM stats WHERE user_id = ?').get(mockHuman.id).lifetime_kills;

  room.handlePlayerShoot(mockHuman.id, {
    origin: [0, 1.7, 0],
    dir: [0, 0, 1]
  });

  assert.strictEqual(bot.isAlive, false, 'Bot eliminated in practice mode');
  // In practice mode, lifetime stats are not altered (prevents fake stat padding)
  const killsAfter = db.prepare('SELECT lifetime_kills FROM stats WHERE user_id = ?').get(mockHuman.id).lifetime_kills;
  assert.strictEqual(killsAfter, killsBefore, 'Practice mode eliminations do not pad lifetime ranked kills');

  room.destroy();
});

test('Team Deathmatch (TDM): Auto-balancing AI bots across Red and Blue squads', () => {
  const room = roomManager.createAiMatch({
    difficulty: 'hard',
    gameMode: 'tdm',
    botCount: 7,
    hostUserId: mockHuman.id
  });

  mockHuman.team = 'red';
  room.addPlayer(mockHuman);
  room.initBots(7, 'hard');

  let redCount = 0;
  let blueCount = 0;

  for (const p of room.players.values()) {
    if (p.team === 'red') redCount++;
    else if (p.team === 'blue') blueCount++;
  }

  // 1 human (red) + 7 bots = 8 players total -> 4 red, 4 blue
  assert.strictEqual(room.players.size, 8, 'Total room players is 8');
  assert.strictEqual(redCount, 4, 'Red team has 4 players');
  assert.strictEqual(blueCount, 4, 'Blue team has 4 players');

  room.destroy();
});

test('AI Tactical Weapon Switching & Dynamic Range Adaptation', () => {
  const room = roomManager.createAiMatch({
    difficulty: 'expert',
    botCount: 1,
    hostUserId: mockHuman.id
  });

  room.addPlayer(mockHuman);
  room.initBots(1, 'expert');
  const bot = Array.from(room.players.values()).find(p => p.isBot);

  // Position target at very close range (3m) -> AI should switch to shotgun
  bot.ai.state = 'combat';
  bot.ai.targetPlayer = mockHuman;
  bot.position.x = 0;
  bot.position.y = 0;
  bot.position.z = 0;
  mockHuman.position.x = 0;
  mockHuman.position.y = 0;
  mockHuman.position.z = 3;
  bot.ai.executeCombat(0.033, room, Date.now());
  assert.strictEqual(bot.activeWeaponId, 'shotgun', 'Bot switches to shotgun at close range');

  // Position target at extreme range (35m) -> AI should switch to sniper rifle
  mockHuman.position.z = 35;
  bot.ai.executeCombat(0.033, room, Date.now());
  assert.strictEqual(bot.activeWeaponId, 'sniper_rifle', 'Bot switches to sniper rifle at long range');

  room.destroy();
});

test('AI Difficulty Comparison: Accuracy & Reaction Speed Across All 4 Tiers', () => {
  assert.ok(DIFFICULTY_CONFIG.easy.reactionTimeMs > DIFFICULTY_CONFIG.medium.reactionTimeMs);
  assert.ok(DIFFICULTY_CONFIG.medium.reactionTimeMs > DIFFICULTY_CONFIG.hard.reactionTimeMs);
  assert.ok(DIFFICULTY_CONFIG.hard.reactionTimeMs > DIFFICULTY_CONFIG.expert.reactionTimeMs);

  assert.ok(DIFFICULTY_CONFIG.easy.aimInaccuracy > DIFFICULTY_CONFIG.medium.aimInaccuracy);
  assert.ok(DIFFICULTY_CONFIG.medium.aimInaccuracy > DIFFICULTY_CONFIG.hard.aimInaccuracy);
  assert.ok(DIFFICULTY_CONFIG.hard.aimInaccuracy > DIFFICULTY_CONFIG.expert.aimInaccuracy);

  assert.strictEqual(DIFFICULTY_CONFIG.easy.weaponSwitchRange, false);
  assert.strictEqual(DIFFICULTY_CONFIG.expert.weaponSwitchRange, true);
});

test('Weapon Reload Reliability, Emergency Resupply & Scavenger Harvest', () => {
  const room = roomManager.createAiMatch({
    difficulty: 'medium',
    botCount: 1,
    hostUserId: mockHuman.id
  });

  room.addPlayer(mockHuman);
  room.initBots(1, 'medium');

  const arState = mockHuman.weapons.assault_rifle;
  mockHuman.activeWeaponId = 'assault_rifle';

  // 1. Partial reload consumes from reserve and sets reloading
  arState.ammoInMag = 10;
  arState.reserveAmmo = 100;
  arState.isReloading = false;

  let messagesSent = [];
  mockHuman.ws = {
    readyState: 1,
    send: (msg) => { messagesSent.push(JSON.parse(msg)); }
  };

  room.handlePlayerReload(mockHuman.id);
  assert.strictEqual(arState.isReloading, true, 'Reload started');
  assert.ok(messagesSent.some(m => m.type === 'reload_started'), 'reload_started message dispatched');

  // Fast forward past reload time
  const finishTime = Date.now() + 3000;
  mockHuman.finishReload();
  assert.strictEqual(arState.ammoInMag, 30, 'Magazine refilled to 30');
  assert.strictEqual(arState.reserveAmmo, 80, '20 bullets deducted from reserve');
  assert.strictEqual(arState.isReloading, false, 'isReloading reset to false');

  // 2. Full magazine reload attempt immediately syncs client without stalling
  messagesSent = [];
  room.handlePlayerReload(mockHuman.id);
  assert.strictEqual(arState.isReloading, false, 'Full magazine does not enter stuck reload state');
  assert.ok(messagesSent.some(m => m.type === 'reload_finished'), 'reload_finished synced to client');

  // 3. Emergency combat resupply when reserve is 0
  arState.ammoInMag = 0;
  arState.reserveAmmo = 0;
  messagesSent = [];
  room.handlePlayerReload(mockHuman.id);
  assert.ok(arState.reserveAmmo > 0, 'Emergency combat resupply granted reserve ammo');
  assert.strictEqual(arState.isReloading, true, 'Reload successfully initiated with resupply');

  // 4. Scavenger ammo harvest on confirmed elimination
  const initialReserve = arState.reserveAmmo;
  const bot = Array.from(room.players.values()).find(p => p.isBot);
  bot.isAlive = true;
  room.handlePlayerElimination(mockHuman, bot, mockHuman.activeWeaponConfig, false);
  assert.ok(arState.reserveAmmo >= initialReserve, 'Scavenger harvest replenished killer reserve ammo');

  // 5. Weapon switch clears stuck reload flags
  arState.isReloading = true;
  arState.reloadCompleteAt = 9999999999;
  mockHuman.switchWeapon('pistol');
  assert.strictEqual(arState.isReloading, false, 'Previous weapon reload canceled');
  assert.strictEqual(mockHuman.weapons.pistol.isReloading, false, 'Switched weapon reload clean');

  room.destroy();
});

test('Cleanup AI Test Database', () => {
  if (fs.existsSync(process.env.DB_PATH)) {
    fs.unlinkSync(process.env.DB_PATH);
  }
});
