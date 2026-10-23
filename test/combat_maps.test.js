const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Test database setup
process.env.DB_PATH = path.join(__dirname, 'test_combat.sqlite');
if (fs.existsSync(process.env.DB_PATH)) {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
}

const db = require('../server/database/db');
const { seedDatabase } = require('../server/database/seed');
const { CollisionEngine } = require('../server/game/CollisionEngine');
const { MapData } = require('../server/game/MapData');
const Room = require('../server/game/Room');
const Player = require('../server/game/Player');
const BotPlayer = require('../server/game/BotPlayer');
const WEAPONS = require('../server/game/WeaponData');
const authController = require('../server/auth/authController');

const MAP_IDS = ['house', 'farm', 'forest', 'minecraft', 'cruise', 'sector7'];
let testHumanUser = null;

test('Setup Combat Test Suite & Database', async () => {
  await db.init();
  seedDatabase();

  authController.register({
    body: { username: 'HeroHero', email: 'hero@test.com', password: 'Password123!' }
  }, {
    status() { return this; },
    json(data) { testHumanUser = data.user; return this; }
  });

  assert.ok(testHumanUser && testHumanUser.id, 'Test user registered');
});

test('Combat on All Maps: Zero-Distance Obstacle Trapping Elimination', () => {
  for (const mapId of MAP_IDS) {
    const map = MapData.getMap(mapId);
    assert.ok(map, `Map ${mapId} must exist`);

    // Verify all spawn points are clear of obstacle bounding boxes
    map.spawnPoints.forEach((sp, idx) => {
      const origin = [sp.x, sp.y + 1.5, sp.z];
      const forwardDir = [0, 0, 1];
      const obsDist = CollisionEngine.getNearestObstacleDistance(origin, forwardDir, 0.5, mapId);
      assert.ok(obsDist > 0.05, `Map ${mapId} spawn #${idx} at (${sp.x}, ${sp.y}, ${sp.z}) must not be trapped in obstacle (obsDist=${obsDist})`);
    });

    // Verify all tactical waypoints are clear of obstacle bounding boxes
    map.waypoints.forEach((wp) => {
      const origin = [wp.x, wp.y + 1.5, wp.z];
      const forwardDir = [0, 0, 1];
      const obsDist = CollisionEngine.getNearestObstacleDistance(origin, forwardDir, 0.5, mapId);
      assert.ok(obsDist > 0.05, `Map ${mapId} waypoint '${wp.id}' at (${wp.x}, ${wp.y}, ${wp.z}) must not be trapped in obstacle (obsDist=${obsDist})`);
    });
  }
});

test('Combat on All Maps: Line-of-Sight Hit Registration & Damage Application', () => {
  for (const mapId of MAP_IDS) {
    const map = MapData.getMap(mapId);

    // Pick two spawns that have clear line of sight
    let shooterSpawn = null;
    let targetSpawn = null;
    let losDist = Infinity;

    for (let i = 0; i < map.spawnPoints.length; i++) {
      for (let j = 0; j < map.spawnPoints.length; j++) {
        if (i === j) continue;
        const sp1 = map.spawnPoints[i];
        const sp2 = map.spawnPoints[j];
        const dx = sp2.x - sp1.x;
        const dy = (sp2.y + 1.5) - (sp1.y + 1.5);
        const dz = sp2.z - sp1.z;
        const d = Math.hypot(dx, dy, dz);

        const origin = [sp1.x, sp1.y + 1.5, sp1.z];
        const dir = [dx / d, dy / d, dz / d];
        const obsDist = CollisionEngine.getNearestObstacleDistance(origin, dir, d + 2, mapId);

        if (obsDist >= d - 0.2) {
          shooterSpawn = sp1;
          targetSpawn = sp2;
          losDist = d;
          break;
        }
      }
      if (shooterSpawn) break;
    }

    assert.ok(shooterSpawn && targetSpawn, `Map ${mapId} must have at least one clear line of sight spawn pair`);

    const shooter = new Player('shooter_' + mapId, 'Shooter', null);
    shooter.position = { ...shooterSpawn };

    const victim = new Player('victim_' + mapId, 'Victim', null);
    victim.position = { ...targetSpawn };

    // Aim from shooter's eyes to victim's chest (y = victim.position.y + 1.1)
    const rayOrigin = [shooterSpawn.x, shooterSpawn.y + 1.5, shooterSpawn.z];
    const dx = targetSpawn.x - shooterSpawn.x;
    const dy = (targetSpawn.y + 1.1) - (shooterSpawn.y + 1.5);
    const dz = targetSpawn.z - shooterSpawn.z;
    const dist = Math.hypot(dx, dy, dz);
    const rayDir = [dx / dist, dy / dist, dz / dist];

    const hit = CollisionEngine.validateShot(shooter, rayOrigin, rayDir, [victim], WEAPONS.assault_rifle, mapId);
    assert.ok(hit, `Map ${mapId}: Unobstructed shot at distance ${dist.toFixed(1)}m must hit victim`);
    assert.strictEqual(hit.targetPlayer.id, victim.id, `Hit must identify victim`);

    // Apply damage and verify health reduction
    const initialHp = victim.health;
    const initialShield = victim.shield;
    const dmgResult = victim.takeDamage(WEAPONS.assault_rifle.damage, shooter, hit.isHeadshot);

    assert.ok(dmgResult.damageApplied > 0, `Damage must be applied`);
    assert.ok(victim.health < initialHp || victim.shield < initialShield, `Victim vitals must decrease`);
  }
});

test('Combat on All Maps: Headshot Detection & Fatal Elimination Pipeline', () => {
  for (const mapId of MAP_IDS) {
    const map = MapData.getMap(mapId);

    // Find two spawn points with line of sight for an unobstructed headshot test
    let sp1 = null;
    let sp2 = null;
    for (let i = 0; i < map.spawnPoints.length; i++) {
      for (let j = 0; j < map.spawnPoints.length; j++) {
        if (i === j) continue;
        const p1 = map.spawnPoints[i];
        const p2 = map.spawnPoints[j];
        const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const dir = [(p2.x - p1.x) / dist, 0, (p2.z - p1.z) / dist];
        const obs = CollisionEngine.getNearestObstacleDistance([p1.x, p1.y + 1.6, p1.z], dir, dist + 2, mapId);
        if (obs >= dist - 0.2) {
          sp1 = p1;
          sp2 = p2;
          break;
        }
      }
      if (sp1) break;
    }

    assert.ok(sp1 && sp2, `Map ${mapId} must have an unobstructed line of sight`);

    const shooter = new Player('sniper_' + mapId, 'Sniper', null);
    shooter.position = { x: sp1.x, y: sp1.y, z: sp1.z };

    const victim = new Player('target_' + mapId, 'Target', null);
    victim.position = { x: sp2.x, y: sp2.y, z: sp2.z };

    // Aim directly at target's head (y = victim.position.y + 1.6m)
    const rayOrigin = [sp1.x, sp1.y + 1.6, sp1.z];
    const dx = sp2.x - sp1.x;
    const dy = (sp2.y + 1.6) - (sp1.y + 1.6);
    const dz = sp2.z - sp1.z;
    const dist = Math.hypot(dx, dy, dz);
    const rayDir = [dx / dist, dy / dist, dz / dist];

    const hit = CollisionEngine.validateShot(shooter, rayOrigin, rayDir, [victim], WEAPONS.sniper_rifle, mapId);
    assert.ok(hit, `Map ${mapId}: Shot at distance ${dist.toFixed(1)}m must hit target`);
    assert.strictEqual(hit.isHeadshot, true, `Map ${mapId}: Shot aimed at head must register headshot`);

    // Sniper rifle headshot: 85 * 2.5 = 212.5 damage, fatal against 100hp + 50shield (150 total vitals)
    const dmg = Math.round(WEAPONS.sniper_rifle.damage * WEAPONS.sniper_rifle.headshotMultiplier);
    const killResult = victim.takeDamage(dmg, shooter, true);

    assert.strictEqual(killResult.killed, true, `Victim must be killed by sniper headshot`);
    assert.strictEqual(victim.isAlive, false, `Victim isAlive flag must become false`);
    assert.strictEqual(victim.health, 0, `Victim health must drop to 0`);
    assert.strictEqual(shooter.matchKills, 1, `Shooter kill counter must increment`);
    assert.strictEqual(shooter.matchHeadshots, 1, `Shooter headshot counter must increment`);
  }
});

test('Combat on All Maps: Solid Obstacle Bullet Occlusion (No Wall-Hacks)', () => {
  // Sector-7: North-West Pillar at [-6..-2, 0..3.5, -6..-5]
  const shooterS7 = new Player('shooter_s7', 'Shooter', null);
  shooterS7.position = { x: -4, y: 0, z: -10 };
  const victimS7 = new Player('victim_s7', 'Victim', null);
  victimS7.position = { x: -4, y: 0, z: 0 }; // Behind pillar

  const s7Hit = CollisionEngine.validateShot(
    shooterS7,
    [-4, 1.5, -10],
    [0, 0, 1], // Aiming south through pillar
    [victimS7],
    WEAPONS.assault_rifle,
    'sector7'
  );
  assert.strictEqual(s7Hit, null, 'Solid compound pillar must block bullet');

  // Farm: Red Barn Wall at z=-10, x=-25
  const shooterFarm = new Player('shooter_farm', 'Shooter', null);
  shooterFarm.position = { x: -25, y: 0, z: 0 };
  const victimFarm = new Player('victim_farm', 'Victim', null);
  victimFarm.position = { x: -25, y: 0, z: -25 }; // Deep inside barn behind north/south walls

  const farmWallHit = CollisionEngine.validateShot(
    shooterFarm,
    [-25, 1.5, 0],
    [0, 0, -1],
    [victimFarm],
    WEAPONS.assault_rifle,
    'farm'
  );
  assert.strictEqual(farmWallHit, null, 'Solid red barn exterior wall must block bullet');

  // Cruise Ship: Navigation Bridge Superstructure at z=[-34, -20]
  const shooterCruise = new Player('shooter_cruise', 'Shooter', null);
  shooterCruise.position = { x: 0, y: 0, z: -15 };
  const victimCruise = new Player('victim_cruise', 'Victim', null);
  victimCruise.position = { x: 0, y: 0, z: -36 }; // Bow deck behind bridge

  const cruiseHit = CollisionEngine.validateShot(
    shooterCruise,
    [0, 1.5, -15],
    [0, 0, -1], // Aiming through bridge
    [victimCruise],
    WEAPONS.assault_rifle,
    'cruise'
  );
  assert.strictEqual(cruiseHit, null, 'Cruise ship navigation bridge superstructure must block bullets');
});

test('Combat on All Maps: Full Match Room Simulation & Bot Elimination', () => {
  const heroId = testHumanUser ? testHumanUser.id : 'hero_user_id';

  for (const mapId of MAP_IDS) {
    const room = new Room('SIM_' + mapId.toUpperCase(), {
      hostUserId: heroId,
      name: 'Simulation Room',
      mapId,
      isAiMatch: true,
      aiDifficulty: 'medium',
      botCount: 2
    });

    const human = new Player(heroId, 'HeroHero', {
      readyState: 1,
      send: () => {}
    });

    room.addPlayer(human);
    room.initBots(2, 'medium');
    room.startMatch();

    assert.strictEqual(room.state, 'active', `Room on ${mapId} must be active`);
    assert.strictEqual(room.mapId, mapId, `Room map must be ${mapId}`);

    // Find an AI bot in the room
    const bot = Array.from(room.players.values()).find(p => p.isBot);
    assert.ok(bot, `Room on ${mapId} must contain AI bot`);

    // Position human and bot with clear line of sight at spawn 0 and 1
    const map = MapData.getMap(mapId);
    // Find unobstructed positions
    let p1 = map.spawnPoints[0];
    let p2 = map.spawnPoints[1];
    for (let i = 0; i < map.spawnPoints.length; i++) {
      for (let j = 0; j < map.spawnPoints.length; j++) {
        if (i === j) continue;
        const spA = map.spawnPoints[i];
        const spB = map.spawnPoints[j];
        const dist = Math.hypot(spB.x - spA.x, spB.z - spA.z);
        const dir = [(spB.x - spA.x) / dist, 0, (spB.z - spA.z) / dist];
        const obs = CollisionEngine.getNearestObstacleDistance([spA.x, spA.y + 1.5, spA.z], dir, dist + 2, mapId);
        if (obs >= dist - 0.2) {
          p1 = spA;
          p2 = spB;
          break;
        }
      }
      if (p1 !== map.spawnPoints[0] || p2 !== map.spawnPoints[1]) break;
    }

    human.position = { x: p1.x, y: p1.y, z: p1.z };
    bot.position = { x: p2.x, y: p2.y, z: p2.z };
    bot.health = 100;
    bot.shield = 50;
    bot.isAlive = true;

    const dx = p2.x - p1.x;
    const dy = (p2.y + 1.2) - (p1.y + 1.5);
    const dz = p2.z - p1.z;
    const dist = Math.hypot(dx, dy, dz);
    const shootDir = [dx / dist, dy / dist, dz / dist];

    // Simulate consecutive assault rifle hits to eliminate the bot
    for (let shot = 0; shot < 10; shot++) {
      if (!bot.isAlive) break;
      human.activeWeaponState.lastFiredAt = 0;
      human.activeWeaponState.ammoInMag = 30;
      room.handlePlayerShoot(human.id, {
        origin: [p1.x, p1.y + 1.5, p1.z],
        dir: shootDir
      });
    }

    assert.strictEqual(bot.isAlive, false, `Bot on ${mapId} must be eliminated after consecutive hits`);
    assert.ok(human.matchKills >= 1, `Human killer on ${mapId} must register confirmed kill`);
    assert.ok(bot.matchDeaths >= 1, `Bot victim on ${mapId} must register death`);

    room.destroy();
  }
});

test('Cleanup Combat Test Database', () => {
  if (fs.existsSync(process.env.DB_PATH)) {
    try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  }
});
