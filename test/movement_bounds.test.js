const test = require('node:test');
const assert = require('node:assert');
const db = require('../server/database/db');
const authController = require('../server/auth/authController');
const { MAPS, MapData } = require('../server/game/MapData');
const { CollisionEngine } = require('../server/game/CollisionEngine');
const Room = require('../server/game/Room');
const Player = require('../server/game/Player');
const BotPlayer = require('../server/game/BotPlayer');

let mockHuman;

test('Setup Movement & Bounds Test Suite', async () => {
  await db.init();

  try {
    db.prepare('DELETE FROM users WHERE email = ? OR username = ?').run('boundary@test.io', 'BoundaryTester');
  } catch (e) {}

  let user = null;
  authController.register({
    body: { username: 'BoundaryTester', email: 'boundary@test.io', password: 'Password123!' }
  }, {
    status() { return this; },
    json(data) { user = data.user; return this; }
  });

  assert.ok(user && user.id, 'Boundary test user registered');
  mockHuman = new Player(user.id, user.username, { readyState: 1, send: () => {} }, {});
});

test('CollisionEngine.resolveMovement: Prevents Tunneling Through Thin Walls at Extreme Velocities', () => {
  // Thin wall at z=0 with thickness 0.4m: minZ=-0.2, maxZ=0.2, spanning x=[-10, 10]
  const wallObstacle = [
    { min: [-10, 0, -0.2], max: [10, 3.5, 0.2] }
  ];
  const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
  const radius = 0.4;
  const height = 1.85;

  // Extreme speed jump: moving 6 meters in one frame from z=-3 to z=3 (straight through the wall)
  const result = CollisionEngine.resolveMovement(
    0, 0, -3,
    0, 3,
    radius, height,
    wallObstacle,
    bounds
  );

  assert.strictEqual(result.collided, true, 'Collision should be triggered');
  // Character must be halted in front of wall: z <= minZ - radius = -0.2 - 0.4 = -0.6
  assert.ok(result.z <= -0.6, `Player must stop before wall, got z=${result.z}`);
  assert.ok(result.z >= -0.75, `Player should stop close to wall surface, got z=${result.z}`);
  assert.strictEqual(result.x, 0, 'X position should remain aligned');
});

test('CollisionEngine.resolveMovement: Smooth Wall Sliding Along Obstacle Faces', () => {
  // Wall along Z=0, spanning X=[-10, 10]
  const obstacles = [
    { min: [-10, 0, -0.2], max: [10, 3.5, 0.2] }
  ];
  const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };

  // Diagonal movement from (-2, 0, -2) toward (5, 0, 2)
  const result = CollisionEngine.resolveMovement(
    -2, 0, -2,
    5, 2,
    0.4, 1.85,
    obstacles,
    bounds
  );

  assert.strictEqual(result.collided, true, 'Collision should be detected');
  // X axis should slide freely toward target 5
  assert.ok(result.x > 4.5, `Player should slide along X axis, got x=${result.x}`);
  // Z axis must be stopped by the wall surface at z <= -0.6
  assert.ok(result.z <= -0.6, `Z position must be stopped by wall, got z=${result.z}`);
});

test('CollisionEngine.resolveMovement: Strict Perimeter Boundary Enforcement Across All 6 Maps', () => {
  const mapIds = ['house', 'farm', 'forest', 'minecraft', 'cruise', 'sector7'];
  const radius = 0.4;

  for (const mapId of mapIds) {
    const bounds = MapData.getBounds(mapId);

    // Attempt to move far beyond map boundaries in all directions
    const attempts = [
      { cur: [0, 0, 0], target: [bounds.maxX + 50, bounds.maxZ + 50] },
      { cur: [0, 0, 0], target: [bounds.minX - 50, bounds.minZ - 50] },
      { cur: [0, 0, 0], target: [bounds.maxX + 100, 0] },
      { cur: [0, 0, 0], target: [0, bounds.maxZ + 100] }
    ];

    for (const att of attempts) {
      const res = CollisionEngine.resolveMovement(
        att.cur[0], 0, att.cur[2],
        att.target[0], att.target[1],
        radius, 1.85,
        mapId
      );

      // Verify character center is inside effective bounds (accounting for radius)
      assert.ok(res.x >= bounds.minX + radius - 0.001, `Map ${mapId}: X=${res.x} must be >= minX + radius (${bounds.minX + radius})`);
      assert.ok(res.x <= bounds.maxX - radius + 0.001, `Map ${mapId}: X=${res.x} must be <= maxX - radius (${bounds.maxX - radius})`);
      assert.ok(res.z >= bounds.minZ + radius - 0.001, `Map ${mapId}: Z=${res.z} must be >= minZ + radius (${bounds.minZ + radius})`);
      assert.ok(res.z <= bounds.maxZ - radius + 0.001, `Map ${mapId}: Z=${res.z} must be <= maxZ - radius (${bounds.maxZ - radius})`);
    }
  }
});

test('CollisionEngine.depenetrate: Safely Pushes Embedded Character to Nearest Free Playable Space', () => {
  const obstacles = [
    { min: [-5, 0, -2], max: [5, 3.5, 2] }
  ];
  const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
  const radius = 0.4;
  const height = 1.85;

  // Character starts embedded inside obstacle at (0, 0, 1.8) (closer to positive Z surface at 2.0)
  const freed = CollisionEngine.depenetrate(0, 0, 1.8, radius, height, obstacles, bounds);

  // Must be pushed outside obstacle: z >= 2.0 + 0.4 = 2.4
  assert.ok(freed.z >= 2.4, `Character must be pushed out past maxZ + radius, got z=${freed.z}`);
  assert.strictEqual(
    CollisionEngine.isColliding(freed.x, 0, freed.z, radius, height, obstacles),
    false,
    'Character must no longer intersect obstacle after depenetration'
  );
});

test('CollisionEngine: 3D Elevation Respects Vertical Overlap (Walking Under Catwalks / Jumping Over Low Barriers)', () => {
  const obstacles = [
    // Low 0.4m high flower bed / curb
    { min: [-3, 0, -3], max: [3, 0.4, 3] },
    // High overhead archway / catwalk from y=3.0 to y=5.0
    { min: [-3, 3.0, 5], max: [3, 5.0, 8] }
  ];

  // 1. Jumping over the low obstacle: player feet at y=0.5
  assert.strictEqual(
    CollisionEngine.isColliding(0, 0.5, 0, 0.4, 1.85, obstacles),
    false,
    'Player feet above low barrier height should not collide'
  );

  // 2. Walking on floor (y=0) hits the low obstacle
  assert.strictEqual(
    CollisionEngine.isColliding(0, 0, 0, 0.4, 1.85, obstacles),
    true,
    'Player at ground level should collide with low barrier'
  );

  // 3. Walking on floor under high catwalk: player head is at 1.85m, catwalk starts at 3.0m
  assert.strictEqual(
    CollisionEngine.isColliding(0, 0, 6, 0.4, 1.85, obstacles),
    false,
    'Player walking under high archway should not collide'
  );
});

test('Server-Side Authoritative Room Validation: Blocks Illegal Client Positions and Wall-Clipping', () => {
  const room = new Room('TEST_MOV_01', {
    name: 'Movement Test',
    mapId: 'house',
    isPrivate: true,
    hostUserId: mockHuman.id,
    maxPlayers: 8
  });

  room.addPlayer(mockHuman);
  room.startMatch();

  // House perimeter fence is at [-28, 28]. Effective bounds with radius 0.4 are [-27.6, 27.6].
  // Client maliciously or erroneously sends an out-of-bounds position at x=40, z=40
  room.handlePlayerInput(mockHuman.id, {
    position: { x: 40, y: 0, z: 40 },
    rotation: { yaw: 0, pitch: 0 }
  });

  // Verify server authoritatively constrained player within house boundaries
  assert.ok(mockHuman.position.x <= 27.6, `Server must clamp X position inside house bounds, got ${mockHuman.position.x}`);
  assert.ok(mockHuman.position.z <= 27.6, `Server must clamp Z position inside house bounds, got ${mockHuman.position.z}`);

  // Now attempt to move player through house exterior wall: back wall at z=[-13, -12] spanning x=[-14, 14]
  mockHuman.position.x = 0;
  mockHuman.position.y = 0;
  mockHuman.position.z = -10; // Inside house near back wall

  // Client attempts to jump through the solid back wall to z=-18 (backyard)
  room.handlePlayerInput(mockHuman.id, {
    position: { x: 0, y: 0, z: -18 },
    rotation: { yaw: 0, pitch: 0 }
  });

  // Wall is at z=-13. With radius 0.4, player must be blocked at z >= -11.6
  assert.ok(mockHuman.position.z >= -11.65, `Player must be blocked by house exterior back wall, got z=${mockHuman.position.z}`);

  room.destroy();
});

test('AI Bots: Continuous Navigation and Strafing Stays Inside Playable Boundaries on All Maps', () => {
  const mapIds = ['house', 'farm', 'forest', 'minecraft', 'cruise', 'sector7'];

  for (const mapId of mapIds) {
    const room = new Room(`BOT_BND_${mapId.toUpperCase()}`, {
      name: `Bot Boundary ${mapId}`,
      mapId,
      isPrivate: true,
      hostUserId: mockHuman.id,
      maxPlayers: 12
    });

    room.addPlayer(mockHuman);
    room.initBots(4, 'hard');
    room.startMatch();

    const bounds = MapData.getBounds(mapId);
    const bots = Array.from(room.players.values()).filter(p => p.isBot);

    // Run 60 simulation ticks (2 seconds of aggressive AI movement & strafing)
    for (let tick = 0; tick < 60; tick++) {
      for (const bot of bots) {
        bot.update(1 / 30, room);
      }
    }

    // Verify all bots stayed strictly within the map boundaries
    for (const bot of bots) {
      assert.ok(
        bot.position.x >= bounds.minX - 0.01 && bot.position.x <= bounds.maxX + 0.01,
        `Bot ${bot.username} on ${mapId} X=${bot.position.x} out of bounds [${bounds.minX}, ${bounds.maxX}]`
      );
      assert.ok(
        bot.position.z >= bounds.minZ - 0.01 && bot.position.z <= bounds.maxZ + 0.01,
        `Bot ${bot.username} on ${mapId} Z=${bot.position.z} out of bounds [${bounds.minZ}, ${bounds.maxZ}]`
      );
    }

    room.destroy();
  }
});

test('Map Objects & Structures: Collision Detection Prevents Passing Through Furniture, Silos, Tractors, Cabins, Tents, Trees & Loungers', () => {
  const objectChecks = [
    // House: Furniture
    { mapId: 'house', name: 'Living Room Sofa', testPos: [7, 0, 9], approachFrom: [7, 0, 5] },
    { mapId: 'house', name: 'Kitchen Counter Island', testPos: [-11, 0, 6], approachFrom: [-6, 0, 6] },
    { mapId: 'house', name: 'Dining Table', testPos: [-5, 0, 6], approachFrom: [-1, 0, 6] },
    { mapId: 'house', name: 'Master Bed', testPos: [8.5, 0, -8], approachFrom: [4, 0, -8] },

    // Farm: Structures, Tractor, Tank, Silos, Hay
    { mapId: 'farm', name: 'Farmhouse Front Wall', testPos: [20, 0, 6.3], approachFrom: [20, 0, 2] },
    { mapId: 'farm', name: 'Heavy Farm Tractor', testPos: [6.0, 0, -8.0], approachFrom: [6.0, 0, -3.0] },
    { mapId: 'farm', name: 'Elevated Water Tank', testPos: [-28.0, 0, 6.0], approachFrom: [-28.0, 0, 0.0] },
    { mapId: 'farm', name: 'Grain Silo', testPos: [-6.0, 0, -18.0], approachFrom: [-6.0, 0, -10.0] },
    { mapId: 'farm', name: 'Hay Bale Stacks', testPos: [-15.0, 0, 7.5], approachFrom: [-15.0, 0, 2.0] },

    // Forest: Boulders, Pine Trees, Campsite Tents, Supply Crates
    { mapId: 'forest', name: 'Boulder Alpha', testPos: [-14, 0, 0], approachFrom: [-14, 0, -5] },
    { mapId: 'forest', name: 'Mature Pine Tree Trunk', testPos: [-14, 0, -14], approachFrom: [-14, 0, -9] },
    { mapId: 'forest', name: 'Campsite Tent', testPos: [-4, 0, 4], approachFrom: [-4, 0, 0] },
    { mapId: 'forest', name: 'Supply Crates', testPos: [-3.1, 0, -2.7], approachFrom: [-3.1, 0, 2] },

    // Minecraft: Cabin, Stepped Hills, Cubic Tree Trunks
    { mapId: 'minecraft', name: 'Voxel Oak Cabin Wall', testPos: [-20, 0, -21.5], approachFrom: [-20, 0, -17] },
    { mapId: 'minecraft', name: 'Stepped Voxel Hill', testPos: [-26, 0, 6], approachFrom: [-16, 0, 6] },
    { mapId: 'minecraft', name: 'Cubic Pine Trunk', testPos: [-16, 0, 16], approachFrom: [-16, 0, 10] },

    // Cruise Ship: Loungers, Bar, Funnel, Bridge
    { mapId: 'cruise', name: 'Deck Chair E3', testPos: [9.5, 0, 5.0], approachFrom: [14, 0, 5.0] },
    { mapId: 'cruise', name: 'Deck Chair W3', testPos: [-9.5, 0, 5.0], approachFrom: [-6, 0, 5.0] },
    { mapId: 'cruise', name: 'Cocktail Bar Counter', testPos: [-13, 0, 4.0], approachFrom: [-16, 0, 4.0] },
    { mapId: 'cruise', name: 'Smokestack Funnel', testPos: [0, 0, -13], approachFrom: [0, 0, -8] },
    { mapId: 'cruise', name: 'Swimming Pool Border', testPos: [0, 0, 4.0], approachFrom: [0, 0, -7] }
  ];

  for (const obj of objectChecks) {
    // 1. Position inside object must trigger collision
    const col = CollisionEngine.isColliding(obj.testPos[0], obj.testPos[1], obj.testPos[2], 0.4, 1.85, obj.mapId);
    assert.strictEqual(col, true, `Map ${obj.mapId}: position inside ${obj.name} must register collision`);

    // 2. Direct approach movement into object must be blocked before penetrating
    const moveRes = CollisionEngine.resolveMovement(
      obj.approachFrom[0], obj.approachFrom[1], obj.approachFrom[2],
      obj.testPos[0], obj.testPos[2],
      0.4, 1.85,
      obj.mapId
    );

    assert.strictEqual(moveRes.collided, true, `Map ${obj.mapId}: moving toward ${obj.name} must trigger collision`);
    // Resulting position must NOT be inside the object
    const finalCol = CollisionEngine.isColliding(moveRes.x, obj.testPos[1], moveRes.z, 0.4, 1.85, obj.mapId);
    assert.strictEqual(finalCol, false, `Map ${obj.mapId}: resolved position against ${obj.name} must be in free space`);
  }
});

test('Perimeter Boundary Jumping: Players Cannot Jump Over Perimeter Fences or Railings Into Non-Playable Void or Ocean', () => {
  const mapIds = ['house', 'farm', 'forest', 'minecraft', 'cruise', 'sector7'];
  const jumpFootHeight = 1.65; // High jump foot elevation above typical fence (1.4m)

  for (const mapId of mapIds) {
    const obstacles = MapData.getObstacles(mapId);
    const boundaryObstacles = obstacles.filter(o => o.isBoundary);
    assert.ok(boundaryObstacles.length >= 4, `Map ${mapId} must have at least 4 perimeter boundary barriers`);

    for (const bObs of boundaryObstacles) {
      // Calculate a point within the boundary wall
      const midX = (bObs.min[0] + bObs.max[0]) / 2;
      const midZ = (bObs.min[2] + bObs.max[2]) / 2;

      // Jumping in the air at foot height 1.65m inside the boundary barrier MUST still collide
      const colAtJumpApex = CollisionEngine.isColliding(midX, jumpFootHeight, midZ, 0.4, 1.85, mapId);
      assert.strictEqual(
        colAtJumpApex,
        true,
        `Map ${mapId}: Jumping player at y=${jumpFootHeight} must collide with boundary barrier '${bObs.name}'`
      );
    }

    // Test running and jumping over perimeter boundary to escape map
    const bounds = MapData.getBounds(mapId);
    // Start inside perimeter, jump toward 50m outside bounds
    const escapeResult = CollisionEngine.resolveMovement(
      0, jumpFootHeight, 0,
      bounds.maxX + 30, bounds.maxZ + 30,
      0.4, 1.85,
      mapId
    );

    assert.strictEqual(escapeResult.collided, true, `Map ${mapId}: Leap outside boundaries must be blocked`);
    assert.ok(
      escapeResult.x <= bounds.maxX - 0.4 + 0.001,
      `Map ${mapId}: Jumping player X=${escapeResult.x} must be stopped inside maxX=${bounds.maxX}`
    );
    assert.ok(
      escapeResult.z <= bounds.maxZ - 0.4 + 0.001,
      `Map ${mapId}: Jumping player Z=${escapeResult.z} must be stopped inside maxZ=${bounds.maxZ}`
    );
  }
});

test('Cleanup Movement & Bounds Test Database', () => {
  try {
    if (mockHuman && mockHuman.id) {
      db.prepare('DELETE FROM users WHERE id = ?').run(mockHuman.id);
    }
  } catch (e) {}
});
