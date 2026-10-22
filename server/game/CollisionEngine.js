/**
 * CollisionEngine provides server-side raycasting and hit validation.
 * Verifies that hits cannot pierce through solid map obstacles or exceed weapon range.
 */

const { MapData } = require('./MapData');

// Arena static obstacle boxes (legacy default for Sector-7 fallback)
const ARENA_OBSTACLES = [
  // Outer perimeter boundary walls
  { min: [-40, 0, -41], max: [40, 8, -40] }, // North Wall
  { min: [-40, 0, 40], max: [40, 8, 41] },   // South Wall
  { min: [-41, 0, -40], max: [-40, 8, 40] }, // West Wall
  { min: [40, 0, -40], max: [41, 8, 40] },   // East Wall

  // Central Compound Walls (Hollow courtyard with 4 entrance archways)
  { min: [-6, 0, -6], max: [-2, 3.5, -5] }, // North-West Pillar
  { min: [2, 0, -6], max: [6, 3.5, -5] },   // North-East Pillar
  { min: [-6, 0, 5], max: [-2, 3.5, 6] },   // South-West Pillar
  { min: [2, 0, 5], max: [6, 3.5, 6] },     // South-East Pillar
  { min: [-6, 0, -2], max: [-5, 3.5, 2] },  // West Barrier
  { min: [5, 0, -2], max: [6, 3.5, 2] },    // East Barrier


  // Tactical Crates & Cover Barriers
  { min: [-18, 0, -18], max: [-14, 2.2, -14] }, // NW Heavy Crates
  { min: [14, 0, -18], max: [18, 2.2, -14] },   // NE Heavy Crates
  { min: [-18, 0, 14], max: [-14, 2.2, 18] },   // SW Heavy Crates
  { min: [14, 0, 14], max: [18, 2.2, 18] },     // SE Heavy Crates

  // Waist-high tactical barricades
  { min: [-8, 0, -15], max: [-4, 1.2, -14] },
  { min: [4, 0, -15], max: [8, 1.2, -14] },
  { min: [-8, 0, 14], max: [-4, 1.2, 15] },
  { min: [4, 0, 14], max: [8, 1.2, 15] },
  { min: [-25, 0, -2], max: [-23, 1.2, 2] },
  { min: [23, 0, -2], max: [25, 1.2, 2] },

  // Elevated sniper platforms / Catwalks
  { min: [-32, 0, -28], max: [-24, 3.5, -20] }, // NW Raised Catwalk
  { min: [24, 0, 20], max: [32, 3.5, 28] },     // SE Raised Catwalk
  { min: [-30, 0, 20], max: [-22, 3.5, 28] },   // SW Platform
  { min: [22, 0, -28], max: [30, 3.5, -20] }    // NE Platform
];

class CollisionEngine {
  /**
   * Ray vs AABB intersection using the fast slab method.
   * Returns distance `t` if hit, or null if no intersection.
   */
  static rayAABB(origin, dir, boxMin, boxMax, maxDist = Infinity) {
    let tmin = 0;
    let tmax = maxDist;

    for (let i = 0; i < 3; i++) {
      const invD = 1.0 / (dir[i] === 0 ? 0.000001 : dir[i]);
      let t0 = (boxMin[i] - origin[i]) * invD;
      let t1 = (boxMax[i] - origin[i]) * invD;

      if (invD < 0) {
        const temp = t0;
        t0 = t1;
        t1 = temp;
      }

      tmin = Math.max(tmin, t0);
      tmax = Math.min(tmax, t1);

      if (tmax <= tmin) return null;
    }

    return tmin >= 0 ? tmin : null;
  }

  /**
   * Cast a ray against static arena obstacles.
   * Returns nearest obstacle distance or Infinity.
   */
  static getNearestObstacleDistance(origin, dir, maxRange = 250, mapIdOrObstacles = null) {
    let nearestDist = maxRange;
    let obstacles = ARENA_OBSTACLES;
    if (Array.isArray(mapIdOrObstacles)) {
      obstacles = mapIdOrObstacles;
    } else if (typeof mapIdOrObstacles === 'string' && MapData) {
      obstacles = MapData.getObstacles(mapIdOrObstacles);
    }

    for (const box of obstacles) {
      const t = this.rayAABB(origin, dir, box.min, box.max, nearestDist);
      if (t !== null && t < nearestDist) {
        nearestDist = t;
      }
    }

    return nearestDist;
  }

  /**
   * Authoritatively validate a shot against all other alive players.
   * Returns `{ hitPlayerId, isHeadshot, distance, hitPoint }` or null.
   */
  static validateShot(shooterPlayer, rayOrigin, rayDir, targetPlayers, weapon, mapId = null) {
    const maxRange = weapon.range || 150;
    const obstacleDist = this.getNearestObstacleDistance(rayOrigin, rayDir, maxRange, mapId);

    let closestHit = null;
    let closestDist = obstacleDist; // Player must be closer than wall/obstacle

    for (const target of targetPlayers) {
      if (target.id === shooterPlayer.id || !target.isAlive) continue;

      // Target bounds: width 0.7m, depth 0.7m, height 1.8m
      const px = target.position.x;
      const py = target.position.y;
      const pz = target.position.z;

      // 1. Check full player AABB
      const bodyMin = [px - 0.45, py, pz - 0.45];
      const bodyMax = [px + 0.45, py + 1.85, pz + 0.45];

      const tBody = this.rayAABB(rayOrigin, rayDir, bodyMin, bodyMax, closestDist);
      if (tBody !== null && tBody < closestDist) {
        // Calculate hit point
        const hitPoint = [
          rayOrigin[0] + rayDir[0] * tBody,
          rayOrigin[1] + rayDir[1] * tBody,
          rayOrigin[2] + rayDir[2] * tBody
        ];

        // Head is defined as upper region: y between (py + 1.45) and (py + 1.85)
        const isHeadshot = hitPoint[1] >= (py + 1.42);

        closestDist = tBody;
        closestHit = {
          targetPlayer: target,
          isHeadshot,
          distance: tBody,
          hitPoint: { x: hitPoint[0], y: hitPoint[1], z: hitPoint[2] }
        };
      }
    }

    return closestHit;
  }
}

module.exports = {
  CollisionEngine,
  ARENA_OBSTACLES
};
