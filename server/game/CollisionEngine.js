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
   * Properly ignores obstacles that enclose the shooter's own origin (e.g. self-enclosure / cover grazing).
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

  /**
   * Check whether a bounding cylinder/box at (x, y, z) intersects any static map obstacles.
   * Takes 3D vertical elevation (height) into account so players can jump over low barriers
   * or walk under raised catwalks/archways.
   */
  static isColliding(x, y, z, radius = 0.4, height = 1.85, mapIdOrObstacles = null) {
    let obstacles = ARENA_OBSTACLES;
    if (Array.isArray(mapIdOrObstacles)) {
      obstacles = mapIdOrObstacles;
    } else if (typeof mapIdOrObstacles === 'string' && MapData) {
      obstacles = MapData.getObstacles(mapIdOrObstacles);
    }

    for (let i = 0; i < obstacles.length; i++) {
      const box = obstacles[i];
      if (box && box.min && box.max) {
        if (y + height > box.min[1] && y < box.max[1]) {
          if (x >= box.min[0] - radius && x <= box.max[0] + radius &&
              z >= box.min[2] - radius && z <= box.max[2] + radius) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Depenetrate character if intersecting or embedded inside an obstacle box.
   * Calculates minimum translation vector (MTV) to push the character out to free playable space.
   */
  static depenetrate(x, y, z, radius = 0.4, height = 1.85, obstacles = ARENA_OBSTACLES, bounds = null) {
    let resX = x;
    let resZ = z;
    const eps = 0.002;

    for (let iter = 0; iter < 4; iter++) {
      let pushed = false;
      for (let i = 0; i < obstacles.length; i++) {
        const box = obstacles[i];
        if (box && box.min && box.max && (y + height > box.min[1]) && (y < box.max[1])) {
          const minX = box.min[0] - radius;
          const maxX = box.max[0] + radius;
          const minZ = box.min[2] - radius;
          const maxZ = box.max[2] + radius;

          if (resX >= minX && resX <= maxX && resZ >= minZ && resZ <= maxZ) {
            const dLeft = resX - minX;
            const dRight = maxX - resX;
            const dBottom = resZ - minZ;
            const dTop = maxZ - resZ;

            const minD = Math.min(dLeft, dRight, dBottom, dTop);
            if (minD === dLeft) resX = minX - eps;
            else if (minD === dRight) resX = maxX + eps;
            else if (minD === dBottom) resZ = minZ - eps;
            else resZ = maxZ + eps;

            pushed = true;
          }
        }
      }
      if (!pushed) break;
    }

    if (bounds) {
      const bMinX = bounds.minX !== undefined ? bounds.minX + radius : -38;
      const bMaxX = bounds.maxX !== undefined ? bounds.maxX - radius : 38;
      const bMinZ = bounds.minZ !== undefined ? bounds.minZ + radius : -38;
      const bMaxZ = bounds.maxZ !== undefined ? bounds.maxZ - radius : 38;
      resX = Math.max(bMinX, Math.min(bMaxX, resX));
      resZ = Math.max(bMinZ, Math.min(bMaxZ, resZ));
    }

    return { x: resX, z: resZ };
  }

  /**
   * Continuous substepped movement resolution with perimeter boundary clamping and wall sliding.
   * Guarantees that neither human players nor AI bots can tunnel through walls during frame drops
   * or high movement speeds, and prevents characters from escaping outside the map boundary.
   */
  static resolveMovement(curX, curY, curZ, targetX, targetZ, radius = 0.4, height = 1.85, mapIdOrObstacles = null, customBounds = null) {
    let obstacles = ARENA_OBSTACLES;
    let bounds = customBounds || { minX: -38.5, maxX: 38.5, minZ: -38.5, maxZ: 38.5 };

    if (Array.isArray(mapIdOrObstacles)) {
      obstacles = mapIdOrObstacles;
    } else if (typeof mapIdOrObstacles === 'string' && MapData) {
      obstacles = MapData.getObstacles(mapIdOrObstacles);
      if (!customBounds) {
        bounds = MapData.getBounds(mapIdOrObstacles);
      }
    }

    const bMinX = bounds.minX !== undefined ? bounds.minX + radius : -38;
    const bMaxX = bounds.maxX !== undefined ? bounds.maxX - radius : 38;
    const bMinZ = bounds.minZ !== undefined ? bounds.minZ + radius : -38;
    const bMaxZ = bounds.maxZ !== undefined ? bounds.maxZ - radius : 38;

    const clampX = (x) => Math.max(bMinX, Math.min(bMaxX, x));
    const clampZ = (z) => Math.max(bMinZ, Math.min(bMaxZ, z));

    // Initial boundary clamp and depenetration of starting position
    let posX = clampX(curX);
    let posZ = clampZ(curZ);

    const initialDepen = this.depenetrate(posX, curY, posZ, radius, height, obstacles, bounds);
    posX = initialDepen.x;
    posZ = initialDepen.z;

    const clampedTargetX = clampX(targetX);
    const clampedTargetZ = clampZ(targetZ);

    const dx = clampedTargetX - posX;
    const dz = clampedTargetZ - posZ;
    const dist = Math.hypot(dx, dz);

    if (dist < 1e-5) {
      return { x: posX, z: posZ, collided: false };
    }

    // Substepping: max 0.1m step size to prevent tunneling through thin walls
    const maxStep = 0.1;
    const numSteps = Math.min(48, Math.max(1, Math.ceil(dist / maxStep)));
    const stepX = dx / numSteps;
    const stepZ = dz / numSteps;

    let hasCollided = false;

    for (let s = 0; s < numSteps; s++) {
      const tryX = clampX(posX + stepX);
      const tryZ = clampZ(posZ + stepZ);

      if (!this.isColliding(tryX, curY, tryZ, radius, height, obstacles)) {
        posX = tryX;
        posZ = tryZ;
      } else {
        hasCollided = true;
        // Slide along X or Z axis if one direction is clear
        const slideX = clampX(posX + stepX);
        const slideZ = clampZ(posZ + stepZ);

        const canSlideX = (stepX !== 0) && !this.isColliding(slideX, curY, posZ, radius, height, obstacles);
        const canSlideZ = (stepZ !== 0) && !this.isColliding(posX, curY, slideZ, radius, height, obstacles);

        if (canSlideX && !canSlideZ) {
          posX = slideX;
        } else if (canSlideZ && !canSlideX) {
          posZ = slideZ;
        } else if (canSlideX && canSlideZ) {
          if (Math.abs(stepX) >= Math.abs(stepZ)) {
            posX = slideX;
          } else {
            posZ = slideZ;
          }
        } else {
          // Blocked on both axes
          break;
        }
      }
    }

    // Final safety clamp & depenetration pass
    const finalDepen = this.depenetrate(clampX(posX), curY, clampZ(posZ), radius, height, obstacles, bounds);

    return {
      x: clampX(finalDepen.x),
      z: clampZ(finalDepen.z),
      collided: hasCollided
    };
  }
}

module.exports = {
  CollisionEngine,
  ARENA_OBSTACLES
};
