const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Test database setup
process.env.DB_PATH = path.join(__dirname, 'test_mobile_combat.sqlite');
if (fs.existsSync(process.env.DB_PATH)) {
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
}

const db = require('../server/database/db');
const { seedDatabase } = require('../server/database/seed');
const { CollisionEngine } = require('../server/game/CollisionEngine');
const { MapData } = require('../server/game/MapData');
const Room = require('../server/game/Room');
const Player = require('../server/game/Player');
const WEAPONS = require('../server/game/WeaponData');

let room = null;
let mobileShooter = null;
let laptopOpponent = null;
let mobileMessages = [];
let laptopMessages = [];

test('Setup Cross-Device Mobile vs Laptop Combat Suite', async () => {
  await db.init();
  seedDatabase();

  room = new Room('COMBAT1', {
    mapId: 'house',
    gameMode: 'ffa',
    scoreLimit: 25,
    matchDuration: 300
  });

  mobileShooter = new Player('user_mob_101', 'MobileGamer', {
    readyState: 1,
    send: (msg) => mobileMessages.push(JSON.parse(msg))
  });

  laptopOpponent = new Player('user_lap_202', 'LaptopIdle', {
    readyState: 1,
    send: (msg) => laptopMessages.push(JSON.parse(msg))
  });

  const join1 = room.addPlayer(mobileShooter);
  const join2 = room.addPlayer(laptopOpponent);

  assert.strictEqual(join1.success, true);
  assert.strictEqual(join2.success, true);
  assert.strictEqual(room.players.size, 2);

  room.startMatch({ countdown: 0 });
  assert.strictEqual(room.state, 'active');
});

test('Scenario 1: Mobile Player Shoots Stationary Laptop Opponent in Line of Sight', () => {
  mobileMessages = [];
  laptopMessages = [];

  // Place laptop player in open yard at (x: 0, y: 0, z: 22)
  laptopOpponent.position = { x: 0, y: 0, z: 22 };
  laptopOpponent.health = 100;
  laptopOpponent.shield = 50;
  laptopOpponent.isAlive = true;
  laptopOpponent.invulnerableUntil = 0;

  // Place mobile shooter 6 meters away at (x: 0, y: 0, z: 16)
  mobileShooter.position = { x: 0, y: 0, z: 16 };
  mobileShooter.isAlive = true;
  mobileShooter.activeWeaponId = 'assault_rifle';

  // Ray origin at mobile eye level (y = 1.7)
  const rayOrigin = [0, 1.7, 16];
  // Target center of laptop opponent torso (y = 1.0, z = 22)
  const dir = [0, 1.0 - 1.7, 22 - 16];
  const dLen = Math.hypot(dir[0], dir[1], dir[2]);
  const rayDir = [dir[0] / dLen, dir[1] / dLen, dir[2] / dLen];

  // Mobile player fires weapon
  room.handlePlayerShoot(mobileShooter.id, {
    origin: rayOrigin,
    dir: rayDir
  });

  // Verify mobile shooter received weapon_fired and hit_confirmed
  const firedMsg = mobileMessages.find(m => m.type === 'weapon_fired');
  assert.ok(firedMsg, 'Shooter must receive weapon_fired confirmation');
  assert.strictEqual(firedMsg.weaponId, 'assault_rifle');

  const hitMsg = mobileMessages.find(m => m.type === 'hit_confirmed');
  assert.ok(hitMsg, 'Mobile shooter must receive hit_confirmed for direct line-of-sight shot');
  assert.strictEqual(String(hitMsg.targetUserId), String(laptopOpponent.id));
  assert.strictEqual(hitMsg.damageApplied > 0, true);
  assert.strictEqual(hitMsg.isHeadshot, false);

  // Verify laptop opponent received damaged notification
  const dmgMsg = laptopMessages.find(m => m.type === 'damaged');
  assert.ok(dmgMsg, 'Laptop opponent must receive damaged packet');
  assert.strictEqual(String(dmgMsg.attackerUserId), String(mobileShooter.id));
  assert.strictEqual(dmgMsg.damageTaken, 26);

  // Verify vitals reduced correctly (shield absorbs 65% first)
  assert.ok(laptopOpponent.shield < 50, 'Laptop opponent shield must be reduced');
  assert.ok(laptopOpponent.health < 100, 'Laptop opponent health must be reduced');
});

test('Scenario 2: Headshot Multiplier Precision for Mobile Aim', () => {
  mobileMessages = [];
  laptopMessages = [];

  // Reset weapon cooldown
  mobileShooter.activeWeaponState.lastFiredAt = 0;

  laptopOpponent.position = { x: 0, y: 0, z: 22 };
  laptopOpponent.health = 100;
  laptopOpponent.shield = 50;
  laptopOpponent.isAlive = true;
  laptopOpponent.invulnerableUntil = 0;

  mobileShooter.position = { x: 0, y: 0, z: 16 };

  // Aim directly at head level (y = 1.65, z = 22)
  const rayOrigin = [0, 1.65, 16];
  const rayDir = [0, 0, 1];

  room.handlePlayerShoot(mobileShooter.id, {
    origin: rayOrigin,
    dir: rayDir
  });

  const hitMsg = mobileMessages.find(m => m.type === 'hit_confirmed');
  assert.ok(hitMsg, 'Headshot must register');
  assert.strictEqual(hitMsg.isHeadshot, true, 'Hit must be classified as headshot');
  assert.strictEqual(hitMsg.damageApplied, 52, 'Headshot with Assault Rifle must apply 52 damage (2x multiplier)');
});

test('Scenario 3: Repeated Mobile Shots Eliminate Laptop Opponent & Trigger Kill Attribution', () => {
  mobileShooter.matchKills = 0;
  laptopOpponent.matchDeaths = 0;
  laptopOpponent.position = { x: 0, y: 0, z: 22 };
  laptopOpponent.health = 30;
  laptopOpponent.shield = 0;
  laptopOpponent.isAlive = true;
  laptopOpponent.invulnerableUntil = 0;

  mobileShooter.activeWeaponState.lastFiredAt = 0;
  mobileShooter.activeWeaponState.ammoInMag = 30;

  mobileMessages = [];
  laptopMessages = [];

  const rayOrigin = [0, 1.4, 16];
  const rayDir = [0, 0, 1];

  // Fatal shot
  room.handlePlayerShoot(mobileShooter.id, { origin: rayOrigin, dir: rayDir });

  const hitMsg = mobileMessages.find(m => m.type === 'hit_confirmed');
  assert.ok(hitMsg, 'Fatal shot must hit');
  assert.strictEqual(hitMsg.targetKilled, true, 'targetKilled must be true on fatal shot');

  assert.strictEqual(laptopOpponent.isAlive, false, 'Laptop opponent must be dead');
  assert.strictEqual(laptopOpponent.health, 0, 'Laptop opponent health must be 0');
  assert.strictEqual(mobileShooter.matchKills, 1, 'Mobile shooter must earn 1 kill');
  assert.strictEqual(laptopOpponent.matchDeaths, 1, 'Laptop opponent must register 1 death');
  assert.ok(laptopOpponent.respawnAt > Date.now(), 'Laptop opponent must have respawnAt scheduled');
});

test('Scenario 4: Bidirectional Combat - Laptop Player Fires Back at Mobile Player', () => {
  // Revive laptop player
  laptopOpponent.health = 100;
  laptopOpponent.shield = 50;
  laptopOpponent.isAlive = true;
  laptopOpponent.invulnerableUntil = 0;
  laptopOpponent.position = { x: 15, y: 0, z: 0 };

  mobileShooter.health = 100;
  mobileShooter.shield = 50;
  mobileShooter.isAlive = true;
  mobileShooter.invulnerableUntil = 0;
  mobileShooter.position = { x: 15, y: 0, z: 6 };

  mobileMessages = [];
  laptopMessages = [];

  // Laptop fires north towards mobile player (+Z)
  const rayOrigin = [15, 1.7, 0];
  const rayDir = [0, 0, 1];

  room.handlePlayerShoot(laptopOpponent.id, { origin: rayOrigin, dir: rayDir });

  const hitMsg = laptopMessages.find(m => m.type === 'hit_confirmed');
  assert.ok(hitMsg, 'Laptop player shot must hit mobile player');
  assert.strictEqual(String(hitMsg.targetUserId), String(mobileShooter.id));

  const dmgMsg = mobileMessages.find(m => m.type === 'damaged');
  assert.ok(dmgMsg, 'Mobile player must receive damaged packet from laptop player');
  assert.strictEqual(mobileShooter.health < 100, true);
});

test('Scenario 5: Solid Obstacle Occlusion Prevents Wall-Hacks Between Devices', () => {
  // House perimeter fence at z = 28 (Fence South: min=[-28,0,28], max=[28,20,29])
  mobileShooter.position = { x: 0, y: 0, z: 25 }; // Inside yard
  laptopOpponent.position = { x: 0, y: 0, z: 35 }; // Outside fence in street
  laptopOpponent.health = 100;
  laptopOpponent.shield = 50;
  laptopOpponent.isAlive = true;
  laptopOpponent.invulnerableUntil = 0;

  mobileMessages = [];

  const rayOrigin = [0, 1.7, 25];
  const rayDir = [0, 0, 1]; // Points directly through fence at z=28

  room.handlePlayerShoot(mobileShooter.id, { origin: rayOrigin, dir: rayDir });

  const hitMsg = mobileMessages.find(m => m.type === 'hit_confirmed');
  assert.strictEqual(hitMsg, undefined, 'Shot through solid wall/fence must NOT hit opponent');
  assert.strictEqual(laptopOpponent.health, 100, 'Opponent behind solid wall must take 0 damage');
});

test('Scenario 6: Cross-Device ID Type Resilience (Mixed Numeric and String User IDs)', () => {
  // Clear open area in house at x = 15, z = 0 to 6
  const numericShooter = new Player(1234, 'NumericShooter', { readyState: 1, send: () => {} });
  const stringTarget = new Player('5678', 'StringTarget', { readyState: 1, send: () => {} });

  numericShooter.position = { x: 15, y: 0, z: 0 };
  stringTarget.position = { x: 15, y: 0, z: 6 };
  stringTarget.isAlive = true;

  const rayOrigin = [15, 1.7, 0];
  const rayDir = [0, 0, 1];

  const hit = CollisionEngine.validateShot(
    numericShooter,
    rayOrigin,
    rayDir,
    [numericShooter, stringTarget],
    WEAPONS.assault_rifle,
    'house'
  );

  assert.ok(hit, 'Shot must hit stringTarget');
  assert.strictEqual(String(hit.targetPlayer.id), '5678');
  assert.notStrictEqual(String(hit.targetPlayer.id), '1234', 'Shooter must not damage self');
});

test('Cleanup Mobile Combat Test Database', () => {
  if (room) room.destroy();
  if (fs.existsSync(process.env.DB_PATH)) {
    try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  }
});
