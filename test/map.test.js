const test = require('node:test');
const assert = require('node:assert');
const db = require('../server/database/db');
const { MAPS, MapData } = require('../server/game/MapData');
const { CollisionEngine } = require('../server/game/CollisionEngine');
const Room = require('../server/game/Room');
const BotPlayer = require('../server/game/BotPlayer');

test('Setup Map Test Suite & Database', async () => {
  await db.init();
});

test('Map Registry: All 6 playable environments defined with complete data', () => {
  const expectedMaps = ['house', 'farm', 'forest', 'minecraft', 'cruise', 'sector7'];
  
  for (const mapId of expectedMaps) {
    assert.strictEqual(MapData.isValidMap(mapId), true, `Map ${mapId} should be valid`);
    const map = MapData.getMap(mapId);
    assert.ok(map.name, `${mapId} must have name`);
    assert.ok(map.theme, `${mapId} must have theme`);
    assert.ok(map.style, `${mapId} must have combat style`);
    assert.ok(map.description, `${mapId} must have description`);
    assert.ok(map.bounds, `${mapId} must have bounds`);
    assert.ok(map.lighting, `${mapId} must have lighting settings`);

    // Verify 12 fair spawn points
    const spawns = MapData.getSpawnPoints(mapId);
    assert.ok(spawns.length >= 12, `${mapId} must have at least 12 spawn points (has ${spawns.length})`);
    
    // Check that spawns are within map bounds
    const bounds = MapData.getBounds(mapId);
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      assert.ok(s.x >= bounds.minX && s.x <= bounds.maxX, `Spawn ${i} x=${s.x} must be within bounds for ${mapId}`);
      assert.ok(s.z >= bounds.minZ && s.z <= bounds.maxZ, `Spawn ${i} z=${s.z} must be within bounds for ${mapId}`);
    }

    // Verify Waypoints
    const waypoints = MapData.getWaypoints(mapId);
    assert.ok(waypoints.length >= 12, `${mapId} must have at least 12 waypoints for AI navigation`);
    const coverPoints = waypoints.filter(w => w.isCover);
    assert.ok(coverPoints.length >= 4, `${mapId} must have at least 4 cover waypoints`);

    // Verify Obstacles
    const obstacles = MapData.getObstacles(mapId);
    assert.ok(obstacles.length >= 8, `${mapId} must have obstacles for tactical combat`);
    for (const box of obstacles) {
      assert.ok(box.max[0] >= box.min[0], `Obstacle box width positive in ${mapId}`);
      assert.ok(box.max[1] >= box.min[1], `Obstacle box height positive in ${mapId}`);
      assert.ok(box.max[2] >= box.min[2], `Obstacle box depth positive in ${mapId}`);
    }
  }
});

test('CollisionEngine: Map-specific raycast obstacle blocking', () => {
  // Test House: Wall dividing kitchen and living room blocks shots along z=0..4 at x=0
  const houseObstacleDist = CollisionEngine.getNearestObstacleDistance([0, 1.7, 0], [0, 0, 1], 50, 'house');
  assert.ok(houseObstacleDist < 1.0, 'Bullet at house center wall should hit obstacle immediately');

  // Test Farm: Barn wall blocks shot fired at x=-25 along z=-1 toward barn front left wall at z=-10
  const farmObstacleDist = CollisionEngine.getNearestObstacleDistance([-25, 1.7, 0], [0, 0, -1], 50, 'farm');
  assert.ok(farmObstacleDist <= 11.0, 'Bullet fired north toward red barn should hit barn exterior wall');

  // Test Forest: Perimeter trees or boulder blocks long range rays
  const forestObstacleDist = CollisionEngine.getNearestObstacleDistance([0, 1.7, 0], [1, 0, 0], 50, 'forest');
  assert.ok(forestObstacleDist < 50, 'Forest obstacles or perimeter should block distant rays');

  // Test Minecraft: Watchtower or cabin blocks ray
  const mcObstacleDist = CollisionEngine.getNearestObstacleDistance([18, 1.7, 0], [0, 0, -1], 50, 'minecraft');
  assert.ok(mcObstacleDist < 25, 'Voxel tower should block bullet ray');

  // Test Cruise: Superstructure or bulkhead blocks ray
  const cruiseDist = CollisionEngine.getNearestObstacleDistance([0, 1.7, 0], [0, 0, -1], 50, 'cruise');
  assert.ok(cruiseDist < 25, 'Cruise ship superstructure/funnel should block bullet ray');
});

test('Room Map Synchronization & Dynamic Map Switching', () => {
  const room = new Room('TEST01', { mapId: 'house' });
  assert.strictEqual(room.mapId, 'house', 'Room initialized with house map');

  // Verify host can change map in lobby
  const changeRes = room.setMap('cruise');
  assert.strictEqual(changeRes.success, true);
  assert.strictEqual(room.mapId, 'cruise', 'Room map successfully changed to cruise');

  // Changing to invalid map fails gracefully
  const invalidRes = room.setMap('nonexistent_map');
  assert.strictEqual(invalidRes.success, false);
  assert.strictEqual(room.mapId, 'cruise', 'Room retained valid map on invalid change');

  // Start match broadcasts authoritative map
  let matchBroadcastReceived = null;
  const mockPlayer = {
    id: 'user_map_1',
    username: 'TestCaptain',
    characterSkin: { skin_id: 'char_default' },
    weaponSkin: { skin_id: 'wep_default' },
    position: { x: 0, y: 0, z: 0 },
    rotation: { yaw: 0, pitch: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    isAlive: true,
    isReady: true,
    respawn: () => {},
    serialize: () => ({ id: 'user_map_1', username: 'TestCaptain' }),
    send: () => {},
    ws: {
      readyState: 1,
      send: (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'match_started') matchBroadcastReceived = msg;
      }
    }
  };

  room.addPlayer(mockPlayer);
  room.startMatch();

  assert.ok(matchBroadcastReceived, 'Match started broadcast sent to connected player');
  assert.strictEqual(matchBroadcastReceived.mapId, 'cruise', 'Match started broadcast included authoritative mapId');
  assert.strictEqual(matchBroadcastReceived.map.name, 'S.S. Oceanic', 'Match broadcast contained map name');

  // Cannot change map while match is active
  const midMatchChange = room.setMap('forest');
  assert.strictEqual(midMatchChange.success, false, 'Cannot change map during active match');

  room.destroy();
});

test('BotAI updates navigation waypoints and obstacles when map changes', () => {
  const room = new Room('TEST02', { mapId: 'farm' });
  const bot = new BotPlayer(0, 'medium', 'solo', room.mapId);
  room.addPlayer(bot);

  assert.strictEqual(bot.ai.mapId, 'farm');
  assert.ok(bot.ai.waypoints.length >= 12);
  assert.ok(bot.ai.obstacles.length >= 8);

  // Switch map to forest
  room.setMap('forest');
  assert.strictEqual(bot.ai.mapId, 'forest', 'Bot AI map updated to forest');
  assert.strictEqual(bot.ai.waypoints, MapData.getWaypoints('forest'), 'Bot waypoints swapped to forest');

  room.destroy();
});
