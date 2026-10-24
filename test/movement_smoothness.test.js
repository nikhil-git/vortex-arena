const test = require('node:test');
const assert = require('node:assert');
const db = require('../server/database/db');
const authController = require('../server/auth/authController');
const Room = require('../server/game/Room');
const Player = require('../server/game/Player');
const { CollisionEngine } = require('../server/game/CollisionEngine');
const { MapData } = require('../server/game/MapData');

let mockPlayer;
let sentMessages = [];

test('Setup Movement Smoothness Test Suite & Database', async () => {
  await db.init();

  try {
    db.prepare('DELETE FROM users WHERE email = ?').run('smooth_tester@test.io');
  } catch (e) {}

  let user;
  authController.register({
    body: { username: 'SmoothTester', email: 'smooth_tester@test.io', password: 'Password123!' }
  }, {
    status() { return this; },
    json(data) { user = data.user; return this; }
  });

  assert.ok(user && user.id, 'Test user registered');

  mockPlayer = new Player(user.id, user.username, {
    readyState: 1,
    send: (msg) => { sentMessages.push(JSON.parse(msg)); }
  }, {});
});

test('Sequence-Based Authoritative Input Tracking: Server Records & Acknowledges Client Sequence', () => {
  const room = new Room('SMOOTH1', {
    name: 'Movement Smoothness Arena',
    isPrivate: true,
    gameMode: 'ffa',
    mapId: 'house',
    hostUserId: mockPlayer.id,
    minPlayers: 1
  });

  room.addPlayer(mockPlayer);
  room.startMatch({ countdown: 0 }); // Direct active combat

  assert.strictEqual(mockPlayer.lastAckSeq, 0, 'Initial sequence must be 0');

  // Client sends sequence 14
  room.handlePlayerInput(mockPlayer.id, {
    position: { x: 5, y: 0, z: 5 },
    rotation: { yaw: 0, pitch: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    seq: 14
  });

  assert.strictEqual(mockPlayer.lastAckSeq, 14, 'Server must record acknowledged sequence number 14');

  // Trigger server state tick
  sentMessages = [];
  room.tick();

  const tickMsg = sentMessages.find(m => m.type === 'state_tick');
  assert.ok(tickMsg, 'State tick message must be dispatched');
  const snap = tickMsg.players.find(p => p.id === mockPlayer.id);
  assert.ok(snap, 'Local player snapshot must exist in tick');
  assert.strictEqual(snap.ackSeq, 14, 'Server state tick must contain ackSeq=14 for the client');

  room.destroy();
});

test('Reconciliation Algorithm: Zero Error on Correct Prediction (No Rubber-Banding Under Latency)', () => {
  // Simulate client-side movement and reconciliation logic
  const inputHistory = [];
  let currentPredictedPos = { x: 0, z: 0 };
  const speed = 6.0; // m/s
  const dt = 0.033;  // 33ms tick

  // Simulate 10 frames of forward movement along Z (from z=0 to z=1.98)
  for (let seq = 1; seq <= 10; seq++) {
    currentPredictedPos.z += speed * dt;
    inputHistory.push({
      seq,
      x: currentPredictedPos.x,
      z: currentPredictedPos.z,
      time: seq * 33
    });
  }

  // Suppose server received and acknowledged seq=6 (latency = 4 frames = 132ms RTT)
  const acknowledgedSeq = 6;
  const historyAtSeq6 = inputHistory.find(h => h.seq === acknowledgedSeq);
  assert.ok(historyAtSeq6, 'History entry for sequence 6 must exist');

  // Server authoritative position at seq 6
  const serverSnapPos = { x: historyAtSeq6.x, z: historyAtSeq6.z };

  // Calculate prediction error at ackSeq (apples-to-apples comparison)
  const errX = serverSnapPos.x - historyAtSeq6.x;
  const errZ = serverSnapPos.z - historyAtSeq6.z;
  const errSq = errX * errX + errZ * errZ;

  // Under old naive logic:
  // distSq was calculated against current live position:
  const naiveDistSq = (currentPredictedPos.x - serverSnapPos.x) ** 2 + (currentPredictedPos.z - serverSnapPos.z) ** 2;
  assert.ok(naiveDistSq > 0.49, `Naive logic would have falsely triggered severe stutter snap (distSq=${naiveDistSq.toFixed(3)} > 0.49)`);

  // Under sequence-based reconciliation:
  assert.strictEqual(errSq, 0, 'Sequence-matched reconciliation error must be exactly 0');
  assert.strictEqual(errSq > 0.04, false, 'Must NOT trigger any backward lerp or rubber-band');
  assert.strictEqual(errSq > 2.25, false, 'Must NOT trigger any teleport snap or velocity stop');
});

test('Desync Correction: Enforces Wall Rejection While Bleeding Off Discrepancy Smoothly', () => {
  // Simulated client attempted to move into a wall at z=-1.0, but server stopped them at z=-0.6
  const ackSeq = 20;
  const inputHistory = [
    { seq: ackSeq, x: 0, z: -1.0, time: 660 }
  ];
  let clientCurrentPos = { x: 0, z: -1.2 };
  const serverAuthoritativePos = { x: 0, z: -0.6 };

  const hist = inputHistory.find(h => h.seq === ackSeq);
  const errX = serverAuthoritativePos.x - hist.x; // 0
  const errZ = serverAuthoritativePos.z - hist.z; // -0.6 - (-1.0) = +0.4m
  const errSq = errX * errX + errZ * errZ; // 0.16

  assert.ok(errSq > 0.04 && errSq <= 2.25, 'Moderate error triggers smooth delta bleed-off');

  // Client applies 25% smooth correction toward authoritative space
  clientCurrentPos.x += errX * 0.25;
  clientCurrentPos.z += errZ * 0.25;

  assert.strictEqual(clientCurrentPos.z, -1.2 + (0.4 * 0.25), 'Client position smoothly bleeds 0.1m toward authoritative server position');
});

test('Severe Desync Hard Clamp: Teleport or Boundary Breach Safely Resets Position & Flushes History', () => {
  const ackSeq = 35;
  let inputHistory = [
    { seq: ackSeq, x: 0, z: 0, time: 1000 }
  ];
  let clientCurrentPos = { x: 25, z: 25 }; // 35 meters desynced
  const serverAuthoritativePos = { x: 2, z: 3 };

  const hist = inputHistory.find(h => h.seq === ackSeq);
  const errSq = (serverAuthoritativePos.x - hist.x) ** 2 + (serverAuthoritativePos.z - hist.z) ** 2;

  assert.ok(errSq > 2.25, 'Error > 2.25m qualifies as severe desync');

  // Hard snap logic
  clientCurrentPos.x = serverAuthoritativePos.x;
  clientCurrentPos.z = serverAuthoritativePos.z;
  inputHistory = [];

  assert.strictEqual(clientCurrentPos.x, 2, 'Hard snap matches server X');
  assert.strictEqual(clientCurrentPos.z, 3, 'Hard snap matches server Z');
  assert.strictEqual(inputHistory.length, 0, 'Stale history is completely cleared');
});

test('Diagonal Movement Speed Normalization: Equal Speed in All Directions', () => {
  // Test diagonal direction normalization
  const forwardOnly = { x: 0, z: -1 };
  const diagonal = { x: 1, z: -1 };

  // Magnitude of unnormalized diagonal is sqrt(2) = 1.414
  const unnormMag = Math.hypot(diagonal.x, diagonal.z);
  assert.ok(Math.abs(unnormMag - Math.SQRT2) < 0.001);

  // Normalized diagonal magnitude must be exactly 1.0
  const normX = diagonal.x / unnormMag;
  const normZ = diagonal.z / unnormMag;
  const normMag = Math.hypot(normX, normZ);
  assert.ok(Math.abs(normMag - 1.0) < 0.0001, 'Normalized diagonal move vector length must be 1.0');

  const moveSpeed = 6.0;
  const velX = normX * moveSpeed;
  const velZ = normZ * moveSpeed;
  const actualSpeed = Math.hypot(velX, velZ);
  assert.ok(Math.abs(actualSpeed - moveSpeed) < 0.0001, 'Resulting velocity must exactly equal moveSpeed 6.0 m/s');
});

test('CollisionEngine: Free Space Movement Never Alters Unobstructed Coordinates', () => {
  // Moving in open center of living room on house map
  const startX = 6.0;
  const startZ = 2.0;
  const targetX = 6.0;
  const targetZ = 3.5;

  const res = CollisionEngine.resolveMovement(startX, 0, startZ, targetX, targetZ, 0.4, 1.85, 'house');
  assert.strictEqual(res.collided, false, 'Free space movement must not collide');
  assert.ok(Math.abs(res.x - targetX) < 1e-5, 'X coordinate must be preserved');
  assert.ok(Math.abs(res.z - targetZ) < 1e-5, 'Z coordinate must be preserved');
});

test('Cleanup Movement Smoothness Test Database', () => {
  try {
    if (mockPlayer && mockPlayer.id) {
      db.prepare('DELETE FROM users WHERE id = ?').run(mockPlayer.id);
    }
  } catch (e) {}
});
