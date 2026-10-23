/**
 * BotAI - Tactical Navigation, Perception, and Decision-Making System
 * Powering Computer-Controlled Opponents in Vortex Arena
 */

const { CollisionEngine, ARENA_OBSTACLES } = require('./CollisionEngine');
const { MapData } = require('./MapData');
const WEAPONS = require('./WeaponData');

// Tactical Waypoint Graph covering Sector-7 Arena (-38 to +38 on X & Z)
const ARENA_WAYPOINTS = [
  // Center Compound Interior & Entrances
  { id: 'center', x: 0, y: 0, z: 0, isCover: false },
  { id: 'center_n', x: 0, y: 0, z: -8, isCover: true },
  { id: 'center_s', x: 0, y: 0, z: 8, isCover: true },
  { id: 'center_w', x: -8, y: 0, z: 0, isCover: true },
  { id: 'center_e', x: 8, y: 0, z: 0, isCover: true },

  // Crate Clusters (Heavy Cover Zones)
  { id: 'crates_nw', x: -16, y: 0, z: -16, isCover: true },
  { id: 'crates_ne', x: 16, y: 0, z: -16, isCover: true },
  { id: 'crates_sw', x: -16, y: 0, z: 16, isCover: true },
  { id: 'crates_se', x: 16, y: 0, z: 16, isCover: true },

  // Low Barricades (Waist-High Cover)
  { id: 'barricade_n1', x: -6, y: 0, z: -14.5, isCover: true },
  { id: 'barricade_n2', x: 6, y: 0, z: -14.5, isCover: true },
  { id: 'barricade_s1', x: -6, y: 0, z: 14.5, isCover: true },
  { id: 'barricade_s2', x: 6, y: 0, z: 14.5, isCover: true },
  { id: 'barricade_w', x: -24, y: 0, z: 0, isCover: true },
  { id: 'barricade_e', x: 24, y: 0, z: 0, isCover: true },

  // Raised Catwalk Platforms (Sniper Vantage Points)
  { id: 'platform_nw', x: -28, y: 3.5, z: -24, isCover: true },
  { id: 'platform_se', x: 28, y: 3.5, z: 24, isCover: true },
  { id: 'platform_sw', x: -26, y: 3.5, z: 24, isCover: true },
  { id: 'platform_ne', x: 26, y: 3.5, z: -24, isCover: true },

  // Flank Lanes & Outer Perimeter Routes
  { id: 'flank_n', x: 0, y: 0, z: -30, isCover: false },
  { id: 'flank_s', x: 0, y: 0, z: 30, isCover: false },
  { id: 'flank_w', x: -30, y: 0, z: 0, isCover: false },
  { id: 'flank_e', x: 30, y: 0, z: 0, isCover: false },
  { id: 'corner_nw', x: -30, y: 0, z: -30, isCover: true },
  { id: 'corner_ne', x: 30, y: 0, z: -30, isCover: true },
  { id: 'corner_sw', x: -30, y: 0, z: 30, isCover: true },
  { id: 'corner_se', x: 30, y: 0, z: 30, isCover: true }
];

// Difficulty Tuning Specifications
const DIFFICULTY_CONFIG = {
  easy: {
    reactionTimeMs: 750,
    aimInaccuracy: 0.16,      // Radians of aim error
    headshotChance: 0.05,
    visionRange: 35,
    visionAngle: Math.PI / 2, // 90 degrees FOV
    moveSpeed: 4.8,
    burstDurationMs: 400,
    burstPauseMs: 1200,
    coverTendency: 0.15,      // Rarely retreats
    weaponSwitchRange: false, // Stays with default weapon
    canSprint: false,
    strafing: false
  },
  medium: {
    reactionTimeMs: 450,
    aimInaccuracy: 0.08,
    headshotChance: 0.18,
    visionRange: 50,
    visionAngle: (Math.PI / 180) * 130, // 130 degrees FOV
    moveSpeed: 6.0,
    burstDurationMs: 650,
    burstPauseMs: 700,
    coverTendency: 0.55,      // Retreats when HP < 40
    weaponSwitchRange: true,
    canSprint: true,
    strafing: true
  },
  hard: {
    reactionTimeMs: 240,
    aimInaccuracy: 0.035,
    headshotChance: 0.35,
    visionRange: 65,
    visionAngle: (Math.PI / 180) * 170, // 170 degrees FOV
    moveSpeed: 7.5,
    burstDurationMs: 950,
    burstPauseMs: 350,
    coverTendency: 0.85,      // Proactive cover on reload & low HP
    weaponSwitchRange: true,
    canSprint: true,
    strafing: true
  },
  expert: {
    reactionTimeMs: 130,
    aimInaccuracy: 0.015,
    headshotChance: 0.55,
    visionRange: 80,
    visionAngle: (Math.PI / 180) * 220, // 220 degrees FOV (audio awareness)
    moveSpeed: 8.5,
    burstDurationMs: 1200,
    burstPauseMs: 180,
    coverTendency: 0.95,      // Tactical peeking, tactical retreat, lethal accuracy
    weaponSwitchRange: true,
    canSprint: true,
    strafing: true
  }
};

class BotAI {
  constructor(botPlayer, difficulty = 'medium', mapId = 'house') {
    this.bot = botPlayer;
    this.difficulty = difficulty.toLowerCase();
    this.config = DIFFICULTY_CONFIG[this.difficulty] || DIFFICULTY_CONFIG.medium;
    this.mapId = mapId || 'house';
    this.waypoints = MapData.getWaypoints(this.mapId);
    this.obstacles = MapData.getObstacles(this.mapId);
    this.bounds = MapData.getBounds(this.mapId);

    // AI State Machine: 'patrol', 'pursue', 'combat', 'cover'
    this.state = 'patrol';

    // Navigation state
    this.currentWaypoint = this.getRandomWaypoint();
    this.pathTimer = 0;
    this.stuckTimer = 0;
    this.lastPosition = { x: 0, y: 0, z: 0 };

    // Perception & Target
    this.targetPlayer = null;
    this.targetAcquiredAt = 0;
    this.lastSeenTargetPos = null;

    // Combat state
    this.burstTimer = 0;
    this.isBursting = false;
    this.strafeDirection = 1;
    this.strafeTimer = 0;
  }

  setMap(mapId) {
    if (!mapId) return;
    this.mapId = mapId;
    this.waypoints = MapData.getWaypoints(mapId);
    this.obstacles = MapData.getObstacles(mapId);
    this.bounds = MapData.getBounds(mapId);
    this.currentWaypoint = this.getRandomWaypoint();
  }

  getRandomWaypoint(excludeId = null) {
    const list = (this.waypoints && this.waypoints.length > 0) ? this.waypoints : ARENA_WAYPOINTS;
    const pool = excludeId ? list.filter(w => w.id !== excludeId) : list;
    return pool[Math.floor(Math.random() * pool.length)] || list[0];
  }

  getNearestCoverWaypoint(excludePos = null) {
    let nearest = null;
    let minDist = Infinity;
    const list = (this.waypoints && this.waypoints.length > 0) ? this.waypoints : ARENA_WAYPOINTS;

    for (const wp of list) {
      if (!wp.isCover) continue;
      const dx = wp.x - this.bot.position.x;
      const dz = wp.z - this.bot.position.z;
      const dist = Math.hypot(dx, dz);

      // If excludePos provided, prefer cover that puts distance between bot and attacker
      if (excludePos) {
        const distToEnemy = Math.hypot(wp.x - excludePos.x, wp.z - excludePos.z);
        if (distToEnemy < 10) continue; // Don't take cover right next to enemy
      }

      if (dist < minDist) {
        minDist = dist;
        nearest = wp;
      }
    }
    return nearest || this.getRandomWaypoint();
  }

  /**
   * Main AI decision tick called at 30Hz
   */
  update(delta, room) {
    if (!this.bot.isAlive || room.state !== 'active') return;

    if (room.mapId && room.mapId !== this.mapId) {
      this.setMap(room.mapId);
    }

    const now = Date.now();

    // Check if bot was damaged recently (react to attacks)
    if (this.bot.lastAttackerId && now - this.bot.lastDamagedAt < 2000) {
      const attacker = room.players.get(this.bot.lastAttackerId);
      if (attacker && attacker.isAlive) {
        this.targetPlayer = attacker;
        this.lastSeenTargetPos = { ...attacker.position };
      }
    }

    // Target Selection / Perception
    this.evaluatePerception(room, now);

    // State Transitions
    this.updateState(now);

    // Execute state behavior
    switch (this.state) {
      case 'combat':
        this.executeCombat(delta, room, now);
        break;
      case 'pursue':
        this.executePursue(delta, room, now);
        break;
      case 'cover':
        this.executeCover(delta, room, now);
        break;
      case 'patrol':
      default:
        this.executePatrol(delta, room, now);
        break;
    }

    // Keep bot within active map bounds
    const bounds = this.bounds || MapData.getBounds(this.mapId);
    this.bot.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.bot.position.x));
    this.bot.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, this.bot.position.z));
  }

  /**
   * Find nearest enemy within vision range & angle without obstacle occlusion
   */
  evaluatePerception(room, now) {
    let bestTarget = null;
    let minDistance = Infinity;

    for (const player of room.players.values()) {
      if (player.id === this.bot.id || !player.isAlive) continue;
      if (room.gameMode === 'tdm' && player.team === this.bot.team) continue; // Same team

      const dx = player.position.x - this.bot.position.x;
      const dz = player.position.z - this.bot.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist > this.config.visionRange) continue;

      // Check field of view angle
      const angleToPlayer = Math.atan2(dx, dz);
      let angleDiff = Math.abs(angleToPlayer - this.bot.rotation.yaw);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

      // If player is outside FOV and not making noise/shooting, ignore
      if (angleDiff > this.config.visionAngle / 2 && dist > 12) continue;

      // Check line of sight (no solid arena obstacles blocking view)
      const hasLOS = this.hasLineOfSight(player.position);
      // Prioritize vulnerable targets over shielded targets
      const effectiveDist = player.isInvulnerable ? (dist + 50) : dist;
      if (hasLOS && effectiveDist < minDistance) {
        minDistance = effectiveDist;
        bestTarget = player;
      }
    }

    if (bestTarget) {
      if (this.targetPlayer !== bestTarget) {
        this.targetPlayer = bestTarget;
        this.targetAcquiredAt = now;
      }
      this.lastSeenTargetPos = { ...bestTarget.position };
    } else if (this.targetPlayer && !this.targetPlayer.isAlive) {
      this.targetPlayer = null;
    }
  }

  hasLineOfSight(targetPos) {
    const origin = [this.bot.position.x, this.bot.position.y + 1.5, this.bot.position.z];
    const dx = targetPos.x - this.bot.position.x;
    const dy = (targetPos.y + 1.5) - (this.bot.position.y + 1.5);
    const dz = targetPos.z - this.bot.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist === 0) return true;

    const dir = [dx / dist, dy / dist, dz / dist];
    const nearestObstacle = CollisionEngine.getNearestObstacleDistance(origin, dir, dist, this.mapId);
    return nearestObstacle >= dist - 0.2;
  }

  updateState(now) {
    // If low health and difficulty enables cover, seek cover
    const lowHealth = (this.bot.health < 45);
    const isReloading = this.bot.activeWeaponState.isReloading;

    if ((lowHealth || isReloading) && Math.random() < this.config.coverTendency) {
      if (this.state !== 'cover') {
        this.state = 'cover';
        this.currentWaypoint = this.getNearestCoverWaypoint(this.lastSeenTargetPos);
      }
      return;
    }

    if (this.targetPlayer && this.targetPlayer.isAlive) {
      const dist = Math.hypot(
        this.targetPlayer.position.x - this.bot.position.x,
        this.targetPlayer.position.z - this.bot.position.z
      );

      // Reaction time delay
      if (now - this.targetAcquiredAt >= this.config.reactionTimeMs) {
        if (this.hasLineOfSight(this.targetPlayer.position)) {
          this.state = 'combat';
          return;
        } else if (dist < 45) {
          this.state = 'pursue';
          return;
        }
      }
    }

    this.state = 'patrol';
  }

  executeCombat(delta, room, now) {
    if (!this.targetPlayer || !this.targetPlayer.isAlive) return;

    const targetPos = this.targetPlayer.position;
    const dx = targetPos.x - this.bot.position.x;
    const dz = targetPos.z - this.bot.position.z;
    const dist = Math.hypot(dx, dz);

    // 1. Dynamic Weapon Switching (if supported by difficulty)
    if (this.config.weaponSwitchRange) {
      if (dist < 10 && this.bot.activeWeaponId !== 'shotgun') {
        room.handlePlayerSwitchWeapon(this.bot.id, 'shotgun');
      } else if (dist > 28 && this.bot.activeWeaponId !== 'sniper_rifle') {
        room.handlePlayerSwitchWeapon(this.bot.id, 'sniper_rifle');
      } else if (dist >= 10 && dist <= 28 && this.bot.activeWeaponId !== 'assault_rifle') {
        room.handlePlayerSwitchWeapon(this.bot.id, 'assault_rifle');
      }
    }

    // 2. Smooth Aiming towards Target
    const baseYaw = Math.atan2(dx, dz);
    const targetAimY = (this.targetPlayer.position.y + 1.5) - (this.bot.position.y + 1.5);
    const basePitch = Math.atan2(targetAimY, dist);

    // Apply difficulty aim inaccuracy & headshot probability
    const isHeadshotShot = (Math.random() < this.config.headshotChance);
    const spread = (Math.random() - 0.5) * 2 * this.config.aimInaccuracy;

    this.bot.rotation.yaw = baseYaw + spread;
    this.bot.rotation.pitch = basePitch + (isHeadshotShot ? 0.05 : spread * 0.5);

    // 3. Tactical Movement (Strafing & Distance Maintenance)
    if (this.config.strafing) {
      this.strafeTimer -= delta;
      if (this.strafeTimer <= 0) {
        this.strafeDirection *= -1;
        this.strafeTimer = 1.0 + Math.random() * 1.5;
      }

      // Perpendicular strafe vector
      const strafeAngle = baseYaw + (Math.PI / 2 * this.strafeDirection);
      const strafeSpeed = this.config.moveSpeed * 0.85;

      const strafeTargetX = this.bot.position.x + Math.sin(strafeAngle) * strafeSpeed * delta;
      const strafeTargetZ = this.bot.position.z + Math.cos(strafeAngle) * strafeSpeed * delta;

      const resolved = CollisionEngine.resolveMovement(
        this.bot.position.x,
        this.bot.position.y,
        this.bot.position.z,
        strafeTargetX,
        strafeTargetZ,
        0.4,
        1.85,
        this.obstacles,
        this.bounds
      );

      this.bot.position.x = resolved.x;
      this.bot.position.z = resolved.z;

      if (resolved.collided) {
        this.strafeDirection *= -1;
        this.strafeTimer = 0.8 + Math.random() * 0.8;
      }
    }

    // 4. Shooting Cadence & Magazine Management
    const wepState = this.bot.activeWeaponState;
    if (wepState.ammoInMag <= 0 && !wepState.isReloading) {
      room.handlePlayerReload(this.bot.id);
      return;
    }

    // Burst firing management
    this.burstTimer -= delta * 1000;
    if (this.burstTimer <= 0) {
      if (this.isBursting) {
        this.isBursting = false;
        this.burstTimer = this.config.burstPauseMs;
      } else {
        this.isBursting = true;
        this.burstTimer = this.config.burstDurationMs;
      }
    }

    if (this.isBursting && !this.targetPlayer.isInvulnerable) {
      // Calculate ray origin and direction
      const origin = [this.bot.position.x, this.bot.position.y + 1.5, this.bot.position.z];
      const dirX = Math.sin(this.bot.rotation.yaw) * Math.cos(this.bot.rotation.pitch);
      const dirY = Math.sin(this.bot.rotation.pitch);
      const dirZ = Math.cos(this.bot.rotation.yaw) * Math.cos(this.bot.rotation.pitch);

      room.handlePlayerShoot(this.bot.id, {
        origin,
        dir: [dirX, dirY, dirZ]
      });
    }
  }

  executePursue(delta, room, now) {
    if (!this.lastSeenTargetPos) {
      this.state = 'patrol';
      return;
    }

    this.moveTo(this.lastSeenTargetPos.x, this.lastSeenTargetPos.z, delta, this.config.moveSpeed);

    // If close enough or regained LOS, transition to combat
    const dist = Math.hypot(
      this.lastSeenTargetPos.x - this.bot.position.x,
      this.lastSeenTargetPos.z - this.bot.position.z
    );

    if (dist < 8 || (this.targetPlayer && this.hasLineOfSight(this.targetPlayer.position))) {
      this.state = 'combat';
    }
  }

  executeCover(delta, room, now) {
    if (!this.currentWaypoint) {
      this.currentWaypoint = this.getNearestCoverWaypoint(this.lastSeenTargetPos);
    }

    this.moveTo(this.currentWaypoint.x, this.currentWaypoint.z, delta, this.config.moveSpeed * 1.15); // Sprint to cover

    const dist = Math.hypot(
      this.currentWaypoint.x - this.bot.position.x,
      this.currentWaypoint.z - this.bot.position.z
    );

    // Once in cover, reload weapon
    if (dist < 2.5) {
      if (this.bot.activeWeaponState.ammoInMag < this.bot.activeWeaponConfig.magSize && !this.bot.activeWeaponState.isReloading) {
        room.handlePlayerReload(this.bot.id);
      }

      // If health restored or reloaded, resume patrol/combat
      if (!this.bot.activeWeaponState.isReloading && this.bot.health > 60) {
        this.state = 'patrol';
      }
    }
  }

  executePatrol(delta, room, now) {
    if (!this.currentWaypoint) {
      this.currentWaypoint = this.getRandomWaypoint();
    }

    this.moveTo(this.currentWaypoint.x, this.currentWaypoint.z, delta, this.config.moveSpeed * 0.8);

    const dist = Math.hypot(
      this.currentWaypoint.x - this.bot.position.x,
      this.currentWaypoint.z - this.bot.position.z
    );

    // Check stuck detection
    const movedDist = Math.hypot(
      this.bot.position.x - this.lastPosition.x,
      this.bot.position.z - this.lastPosition.z
    );
    if (movedDist < 0.05 * delta) {
      this.stuckTimer += delta;
      if (this.stuckTimer > 1.5) {
        // Unstuck by picking another random waypoint
        this.currentWaypoint = this.getRandomWaypoint(this.currentWaypoint.id);
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastPosition = { ...this.bot.position };

    if (dist < 2.0) {
      this.currentWaypoint = this.getRandomWaypoint(this.currentWaypoint.id);
    }
  }

  moveTo(targetX, targetZ, delta, speed) {
    const dx = targetX - this.bot.position.x;
    const dz = targetZ - this.bot.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.1) return;

    // Face movement direction
    this.bot.rotation.yaw = Math.atan2(dx, dz);
    this.bot.rotation.pitch = 0;

    const moveStep = Math.min(dist, speed * delta);
    const stepTargetX = this.bot.position.x + (dx / dist) * moveStep;
    const stepTargetZ = this.bot.position.z + (dz / dist) * moveStep;

    const resolved = CollisionEngine.resolveMovement(
      this.bot.position.x,
      this.bot.position.y,
      this.bot.position.z,
      stepTargetX,
      stepTargetZ,
      0.4,
      1.85,
      this.obstacles,
      this.bounds
    );

    const actualDist = Math.hypot(resolved.x - this.bot.position.x, resolved.z - this.bot.position.z);
    this.bot.position.x = resolved.x;
    this.bot.position.z = resolved.z;

    if (resolved.collided && actualDist < 0.02) {
      // Pick new waypoint if path is completely blocked
      this.currentWaypoint = this.getRandomWaypoint(this.currentWaypoint ? this.currentWaypoint.id : null);
    }
  }

  checkWallCollision(x, z, y = null) {
    const py = y !== null ? y : (this.bot ? this.bot.position.y : 0);
    const bounds = this.bounds || MapData.getBounds(this.mapId);
    const r = 0.4;
    if (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r) {
      return true;
    }

    const obstacles = (this.obstacles && this.obstacles.length > 0) ? this.obstacles : ARENA_OBSTACLES;
    return CollisionEngine.isColliding(x, py, z, r, 1.85, obstacles);
  }
}

module.exports = {
  BotAI,
  ARENA_WAYPOINTS,
  DIFFICULTY_CONFIG
};
