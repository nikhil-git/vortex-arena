const config = require('../config');
const WEAPONS = require('./WeaponData');
const { CollisionEngine } = require('./CollisionEngine');
const { MapData } = require('./MapData');
const statsService = require('../services/statsService');
const friendsService = require('../services/friendsService');
const analyticsService = require('../services/analyticsService');
const db = require('../database/db');
const BotPlayer = require('./BotPlayer');

// Spawn points across the tactical arena
const SPAWN_POINTS = [
  { x: -30, y: 0, z: -30, yaw: Math.PI / 4 },
  { x: 30, y: 0, z: 30, yaw: -3 * Math.PI / 4 },
  { x: -30, y: 0, z: 30, yaw: -Math.PI / 4 },
  { x: 30, y: 0, z: -30, yaw: 3 * Math.PI / 4 },
  { x: 0, y: 0, z: -32, yaw: Math.PI },
  { x: 0, y: 0, z: 32, yaw: 0 },
  { x: -32, y: 0, z: 0, yaw: Math.PI / 2 },
  { x: 32, y: 0, z: 0, yaw: -Math.PI / 2 },
  { x: -26, y: 3.5, z: -24, yaw: Math.PI / 4 },  // NW platform
  { x: 26, y: 3.5, z: 24, yaw: -3 * Math.PI / 4 }, // SE platform
  { x: -10, y: 0, z: -20, yaw: Math.PI },
  { x: 10, y: 0, z: 20, yaw: 0 }
];

class Room {
  constructor(roomCode, options = {}) {
    this.code = roomCode;
    this.name = options.name || `Arena ${roomCode}`;
    this.isPrivate = Boolean(options.isPrivate);
    this.gameMode = options.gameMode || 'ffa'; // 'ffa' (Free For All) or 'tdm' (Team Deathmatch)
    this.maxPlayers = Math.min(config.MAX_PLAYERS_PER_ROOM, options.maxPlayers || 12); // STRICT 12 CAP
    this.minPlayersToAutoStart = options.minPlayers || 2;
    this.hostUserId = options.hostUserId || null;

    // Room States: 'lobby', 'countdown', 'active', 'ended'
    this.state = 'lobby';
    this.players = new Map(); // userId -> Player
    this.spectators = new Set();

    // Match rules
    this.scoreLimit = options.scoreLimit || config.SCORE_LIMIT;
    this.matchDuration = options.matchDuration || config.MATCH_DURATION_SECONDS;
    this.timeRemaining = this.matchDuration;
    this.countdownTime = 5; // 5-second match start countdown
    this.countdownTimer = null;

    this.tickInterval = null;
    this.timerInterval = null;
    this.spawnIndex = 0;

    // AI / Single Player configurations
    this.mapId = options.mapId && MapData.isValidMap(options.mapId) ? options.mapId : (options.mapId || 'sector7');
    this.isAiMatch = Boolean(options.isAiMatch);
    this.aiDifficulty = options.aiDifficulty || 'medium';
    this.isPractice = Boolean(options.isPractice);
    this.botCount = options.botCount || 0;
    this.lastTickTime = Date.now();
  }

  initBots(count, difficulty = 'medium') {
    this.aiDifficulty = difficulty;
    const availableSlots = this.maxPlayers - this.players.size;
    const targetBots = Math.max(0, Math.min(count, availableSlots));

    for (let i = 0; i < targetBots; i++) {
      let botTeam = 'solo';
      if (this.gameMode === 'tdm') {
        let red = 0, blue = 0;
        for (const p of this.players.values()) {
          if (p.team === 'red') red++;
          else if (p.team === 'blue') blue++;
        }
        botTeam = red <= blue ? 'red' : 'blue';
      }

      const bot = new BotPlayer(i, difficulty, botTeam, this.mapId);
      const spawn = this.getNextSpawnPoint();
      bot.respawn(spawn);
      this.players.set(bot.id, bot);
    }

    this.notifyLobbyUpdate();
  }

  get playerCount() {
    return this.players.size;
  }

  isFull() {
    return this.players.size >= this.maxPlayers;
  }

  addPlayer(player) {
    if (this.isFull()) {
      return { success: false, error: 'Match is already at maximum capacity (12/12 players)' };
    }

    if (this.players.has(player.id)) {
      // Reconnection: update player's socket
      const existing = this.players.get(player.id);
      existing.ws = player.ws;
      this.notifyLobbyUpdate();
      return { success: true, player: existing, reconnected: true };
    }

    // Assign team for TDM
    if (this.gameMode === 'tdm') {
      let redCount = 0, blueCount = 0;
      for (const p of this.players.values()) {
        if (p.team === 'red') redCount++;
        else if (p.team === 'blue') blueCount++;
      }
      player.team = redCount <= blueCount ? 'red' : 'blue';
    } else {
      player.team = 'solo';
    }

    // Set initial host if none
    if (!this.hostUserId) {
      this.hostUserId = player.id;
    }

    // Assign initial spawn point
    const spawn = this.getNextSpawnPoint();
    player.respawn(spawn);

    this.players.set(player.id, player);

    // Update database status
    friendsService.updateUserStatus(player.id, true, this.state === 'active' ? 'in_match' : 'in_lobby', this.code);

    // Send join confirmation to new player
    player.send('room_joined', {
      room: this.serializeInfo(),
      localPlayerId: player.id,
      state: this.state,
      countdownSeconds: this.state === 'countdown' ? Math.max(0, this.countdownTime) : 0,
      timeRemaining: this.timeRemaining
    });

    // If joining a match in progress (or countdown), immediately dispatch match_started
    if (this.state === 'active' || this.state === 'countdown') {
      player.send('match_started', {
        state: this.state,
        countdownSeconds: this.state === 'countdown' ? Math.max(0, this.countdownTime) : 0,
        timeRemaining: this.timeRemaining,
        scoreLimit: this.scoreLimit,
        gameMode: this.gameMode,
        mapId: this.mapId,
        map: MapData.getMap(this.mapId),
        isAiMatch: this.isAiMatch,
        aiDifficulty: this.aiDifficulty,
        isPractice: this.isPractice,
        botCount: this.botCount,
        players: Array.from(this.players.values()).map(p => p.serialize())
      });
    }

    // Notify all players in room
    this.broadcast('player_joined', {
      player: player.serialize(),
      playerCount: this.playerCount,
      maxPlayers: this.maxPlayers
    });

    this.notifyLobbyUpdate();

    // Auto-start if min players reached in public match
    if (!this.isPrivate && this.state === 'lobby' && this.playerCount >= this.minPlayersToAutoStart) {
      this.startMatch({ countdown: 5 });
    }

    return { success: true, player };
  }

  removePlayer(userId) {
    const player = this.players.get(userId);
    if (!player) return;

    this.players.delete(userId);
    friendsService.updateUserStatus(userId, true, 'online', null);

    this.broadcast('player_left', {
      userId,
      username: player.username,
      playerCount: this.playerCount,
      maxPlayers: this.maxPlayers
    });

    // Reassign host if host left
    if (this.hostUserId === userId && this.players.size > 0) {
      this.hostUserId = this.players.keys().next().value;
      this.broadcast('host_changed', { hostUserId: this.hostUserId });
    }

    this.notifyLobbyUpdate();

    // If active and 0 players left, cleanup match
    if (this.players.size === 0) {
      this.destroy();
    }
  }

  getNextSpawnPoint(playerToSpawn = null) {
    return this.getSafeSpawnPoint(playerToSpawn);
  }

  getSafeSpawnPoint(playerToSpawn = null) {
    const points = MapData.getSpawnPoints(this.mapId);
    if (!points || points.length === 0) {
      return { x: 0, y: 0, z: 0, yaw: 0 };
    }

    // Collect alive opponents to calculate safe distance
    const enemies = [];
    for (const p of this.players.values()) {
      if (!p.isAlive) continue;
      if (playerToSpawn && p.id === playerToSpawn.id) continue;
      if (this.gameMode === 'tdm' && playerToSpawn && p.team === playerToSpawn.team) continue;
      enemies.push(p);
    }

    // If no active enemies in the match, pick sequentially for fair initial distribution
    if (enemies.length === 0) {
      const spawn = points[this.spawnIndex % points.length];
      this.spawnIndex++;
      return spawn;
    }

    // Score candidate spawn points based on safety from enemies and obstacle cover
    const scoredPoints = points.map(sp => {
      let minEnemyDist = Infinity;
      let hasEnemyLOS = false;

      for (const enemy of enemies) {
        const dx = enemy.position.x - sp.x;
        const dz = enemy.position.z - sp.z;
        const dist = Math.hypot(dx, dz);
        if (dist < minEnemyDist) {
          minEnemyDist = dist;
        }

        // Check line of sight from enemy to candidate spawn
        const origin = [enemy.position.x, (enemy.position.y || 0) + 1.5, enemy.position.z];
        const dir = [sp.x - enemy.position.x, 0, sp.z - enemy.position.z];
        const dirLen = Math.hypot(dir[0], dir[2]);
        if (dirLen > 0.01) {
          dir[0] /= dirLen;
          dir[2] /= dirLen;
          const obsDist = CollisionEngine.getNearestObstacleDistance(origin, dir, dist, this.mapId);
          if (obsDist >= dist - 0.5) {
            hasEnemyLOS = true;
          }
        }
      }

      // Safety score: higher is better
      let score = minEnemyDist;
      if (hasEnemyLOS) score *= 0.35; // Penalize open sightlines
      if (minEnemyDist < 10) score *= 0.2; // Severely penalize dangerous close proximity
      else if (minEnemyDist >= 18) score *= 1.4; // Reward safe tactical standoff

      // Add small random noise to prevent always picking the exact same point
      score += Math.random() * 4.0;

      return { sp, score };
    });

    scoredPoints.sort((a, b) => b.score - a.score);
    return scoredPoints[0].sp;
  }

  setMap(mapId) {
    if (this.state !== 'lobby') {
      return { success: false, error: 'Cannot change map during active match' };
    }
    if (!MapData.isValidMap(mapId)) {
      return { success: false, error: 'Invalid map ID' };
    }
    this.mapId = mapId;
    this.spawnIndex = 0;

    for (const player of this.players.values()) {
      const spawn = this.getNextSpawnPoint();
      player.respawn(spawn);
      if (player.isBot && player.ai) {
        player.ai.setMap(mapId);
      }
    }

    this.broadcast('map_changed', {
      mapId: this.mapId,
      map: MapData.getMap(this.mapId)
    });
    this.notifyLobbyUpdate();
    return { success: true, mapId: this.mapId };
  }

  startCountdown(seconds = 5) {
    this.startMatch({ countdown: seconds });
  }

  startMatch(options = {}) {
    const countdownSecs = (typeof options === 'number')
      ? options
      : ((options && options.countdown !== undefined)
          ? (options.countdown === true ? 5 : Number(options.countdown))
          : 0);

    // Position all players at safe tactical spawn points ready for match combat
    for (const player of this.players.values()) {
      const spawn = this.getSafeSpawnPoint(player);
      player.respawn(spawn, 0); // Match start: combat ready
      friendsService.updateUserStatus(player.id, true, 'in_match', this.code);
    }

    // Start server tick loop (30 Hz) so player positions, rotations, and movement synchronize in real-time
    if (!this.tickInterval) {
      const tickMs = Math.round(1000 / config.TICK_RATE);
      this.tickInterval = setInterval(() => this.tick(), tickMs);
    }

    analyticsService.recordEvent({
      category: 'game',
      eventName: 'match_start',
      data: {
        roomCode: this.code,
        gameMode: this.gameMode,
        mapId: this.mapId,
        playerCount: this.playerCount,
        isAiMatch: this.isAiMatch,
        isPractice: this.isPractice
      }
    });

    if (countdownSecs > 0) {
      this.state = 'countdown';
      this.countdownTime = countdownSecs;

      this.broadcast('match_started', {
        state: 'countdown',
        countdownSeconds: this.countdownTime,
        timeRemaining: this.matchDuration,
        scoreLimit: this.scoreLimit,
        gameMode: this.gameMode,
        mapId: this.mapId,
        map: MapData.getMap(this.mapId),
        isAiMatch: this.isAiMatch,
        aiDifficulty: this.aiDifficulty,
        isPractice: this.isPractice,
        botCount: this.botCount,
        players: Array.from(this.players.values()).map(p => p.serialize())
      });

      this.broadcast('match_countdown_started', {
        countdownSeconds: this.countdownTime,
        state: this.state
      });

      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }

      this.countdownTimer = setInterval(() => {
        this.countdownTime--;
        this.broadcast('match_countdown_tick', {
          countdownSeconds: this.countdownTime,
          state: this.state
        });

        if (this.countdownTime <= 0) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
          this.activateMatch();
        }
      }, 1000);
    } else {
      this.activateMatch(true);
    }
  }

  activateMatch(broadcastStart = false) {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    this.state = 'active';
    this.countdownTime = 0;
    this.timeRemaining = this.matchDuration;

    if (broadcastStart) {
      this.broadcast('match_started', {
        state: 'active',
        countdownSeconds: 0,
        timeRemaining: this.timeRemaining,
        scoreLimit: this.scoreLimit,
        gameMode: this.gameMode,
        mapId: this.mapId,
        map: MapData.getMap(this.mapId),
        isAiMatch: this.isAiMatch,
        aiDifficulty: this.aiDifficulty,
        isPractice: this.isPractice,
        botCount: this.botCount,
        players: Array.from(this.players.values()).map(p => p.serialize())
      });
    }

    this.broadcast('match_active', {
      timeRemaining: this.timeRemaining,
      state: 'active'
    });

    // Start match duration countdown timer
    if (!this.timerInterval) {
      this.timerInterval = setInterval(() => {
        this.timeRemaining--;
        if (this.timeRemaining <= 0) {
          this.endMatch('time_limit');
        }
      }, 1000);
    }
  }

  tick() {
    if (this.state !== 'active' && this.state !== 'countdown') return;

    const now = Date.now();
    const delta = Math.min(0.1, (now - this.lastTickTime) / 1000);
    this.lastTickTime = now;

    // 1. Update Autonomous AI Bots ONLY when match is active (hold fire during countdown)
    if (this.state === 'active') {
      for (const player of this.players.values()) {
        if (player.isBot && player.isAlive) {
          player.update(delta, this);
        }
      }
    }

    const playerSnapshots = [];

    // Process respawns and reload completions
    for (const player of this.players.values()) {
      if (this.state === 'active' && !player.isAlive && player.respawnAt > 0 && now >= player.respawnAt) {
        const respawnProtection = this.isPractice ? 0 : (config.RESPAWN_PROTECTION_SECONDS || 3.0);
        const spawn = this.getSafeSpawnPoint(player);
        player.respawn(spawn, respawnProtection);

        const weaponsAmmo = {};
        for (const [wepId, wState] of Object.entries(player.weapons)) {
          weaponsAmmo[wepId] = {
            ammoInMag: wState.ammoInMag,
            reserveAmmo: wState.reserveAmmo
          };
        }

        this.broadcast('player_respawned', {
          userId: player.id,
          position: player.position,
          rotation: player.rotation,
          health: player.health,
          shield: player.shield,
          weapons: weaponsAmmo,
          isInvulnerable: true,
          invulnerableSeconds: respawnProtection
        });
      }

      // Check weapon reload finish
      if (player.activeWeaponState.isReloading && now >= player.activeWeaponState.reloadCompleteAt) {
        player.finishReload();
        player.send('reload_finished', {
          weaponId: player.activeWeaponId,
          ammoInMag: player.activeWeaponState.ammoInMag,
          reserveAmmo: player.activeWeaponState.reserveAmmo
        });
      }

      playerSnapshots.push({
        id: player.id,
        pos: [player.position.x, player.position.y, player.position.z],
        rot: [player.rotation.yaw, player.rotation.pitch],
        vel: [player.velocity.x, player.velocity.y, player.velocity.z],
        hp: player.health,
        sh: player.shield,
        alive: player.isAlive,
        inv: player.isInvulnerable,
        wep: player.activeWeaponId,
        ammo: [player.activeWeaponState.ammoInMag, player.activeWeaponState.reserveAmmo],
        kills: player.matchKills,
        deaths: player.matchDeaths,
        score: player.matchScore,
        ackSeq: player.lastAckSeq || 0
      });
    }

    // Broadcast world state tick to all clients (includes countdownSeconds and matchState)
    this.broadcast('state_tick', {
      timestamp: now,
      players: playerSnapshots,
      timeRemaining: this.timeRemaining,
      state: this.state,
      countdownSeconds: this.state === 'countdown' ? Math.max(0, this.countdownTime) : 0
    });

    analyticsService.recordTickDuration(Date.now() - now);
  }

  handlePlayerInput(userId, input) {
    const player = this.players.get(userId);
    if (!player || !player.isAlive || (this.state !== 'active' && this.state !== 'countdown')) return;

    // Track authoritative input sequence acknowledgement
    if (input.seq !== undefined && Number.isFinite(input.seq)) {
      player.lastAckSeq = input.seq;
    }

    // Discard stale in-flight input packets sent right before respawn
    const timeSinceRespawn = Date.now() - (player.respawnTimestamp || 0);
    if (timeSinceRespawn < 400 && input.position) {
      const distFromSpawn = Math.hypot(input.position.x - player.position.x, input.position.z - player.position.z);
      if (distFromSpawn > 3.0) {
        return; // Drop stale pre-death position packet
      }
    }

    // Update position with authoritative wall collision & boundary resolution
    if (input.position) {
      const curX = typeof player.position.x === 'number' ? player.position.x : 0;
      const curY = typeof player.position.y === 'number' ? player.position.y : 0;
      const curZ = typeof player.position.z === 'number' ? player.position.z : 0;

      const targetX = Number.isFinite(input.position.x) ? input.position.x : curX;
      const targetY = Number.isFinite(input.position.y) ? input.position.y : curY;
      const targetZ = Number.isFinite(input.position.z) ? input.position.z : curZ;

      // Authoritative collision & boundary resolution prevents clipping or walking outside map
      const resolved = CollisionEngine.resolveMovement(
        curX, curY, curZ,
        targetX, targetZ,
        0.4, 1.85,
        this.mapId
      );

      player.position.x = resolved.x;
      player.position.y = Math.max(0, targetY);
      player.position.z = resolved.z;
    }
    if (input.rotation) {
      player.rotation.yaw = Number.isFinite(input.rotation.yaw) ? input.rotation.yaw : player.rotation.yaw;
      player.rotation.pitch = Number.isFinite(input.rotation.pitch) ? input.rotation.pitch : player.rotation.pitch;
    }
    if (input.velocity) {
      player.velocity.x = Number.isFinite(input.velocity.x) ? input.velocity.x : 0;
      player.velocity.y = Number.isFinite(input.velocity.y) ? input.velocity.y : 0;
      player.velocity.z = Number.isFinite(input.velocity.z) ? input.velocity.z : 0;
    }
  }

  handlePlayerShoot(userId, shootData) {
    const shooter = this.players.get(userId);
    if (!shooter || !shooter.isAlive || this.state !== 'active') return;

    const now = Date.now();
    const canFireCheck = shooter.canFire(now);
    if (!canFireCheck.allowed) return;

    shooter.consumeAmmo(now);
    const weaponConfig = shooter.activeWeaponConfig;

    // Send ammo update to shooter
    shooter.send('weapon_fired', {
      weaponId: shooter.activeWeaponId,
      ammoInMag: shooter.activeWeaponState.ammoInMag,
      reserveAmmo: shooter.activeWeaponState.reserveAmmo
    });

    const rayOrigin = shootData.origin || [shooter.position.x, shooter.position.y + 1.5, shooter.position.z];
    const rayDir = shootData.dir || [0, 0, 1];

    // Broadcast muzzle flash and sound to other players in room
    this.broadcastExcept(userId, 'remote_player_fired', {
      userId,
      weaponId: shooter.activeWeaponId,
      origin: rayOrigin,
      dir: rayDir
    });

    // Authoritative hit verification
    const targets = Array.from(this.players.values()).filter(p => {
      if (p.id === shooter.id || !p.isAlive) return false;
      if (this.gameMode === 'tdm' && p.team === shooter.team) return false; // Friendly fire disabled
      return true;
    });

    const hit = CollisionEngine.validateShot(shooter, rayOrigin, rayDir, targets, weaponConfig, this.mapId);

    if (hit) {
      const targetPlayer = hit.targetPlayer;
      const baseDmg = weaponConfig.damage * (weaponConfig.pellets || 1);
      const damage = hit.isHeadshot ? Math.round(baseDmg * weaponConfig.headshotMultiplier) : baseDmg;

      const dmgResult = targetPlayer.takeDamage(damage, shooter, hit.isHeadshot);

      // Hit confirmation to shooter
      shooter.send('hit_confirmed', {
        targetUserId: targetPlayer.id,
        targetUsername: targetPlayer.username,
        damageApplied: dmgResult.damageApplied,
        isHeadshot: hit.isHeadshot,
        hitPoint: hit.hitPoint,
        targetKilled: dmgResult.killed,
        isInvulnerable: Boolean(dmgResult.isInvulnerable)
      });

      // Damage notification to victim
      targetPlayer.send('damaged', {
        attackerUserId: shooter.id,
        attackerUsername: shooter.username,
        damageTaken: dmgResult.damageApplied,
        health: targetPlayer.health,
        shield: targetPlayer.shield,
        isHeadshot: hit.isHeadshot,
        isInvulnerable: Boolean(dmgResult.isInvulnerable)
      });

      // If killed, handle death & authoritative progression
      if (dmgResult.killed) {
        this.handlePlayerElimination(shooter, targetPlayer, weaponConfig, hit.isHeadshot);
      }
    }
  }

  handlePlayerElimination(killer, victim, weaponConfig, isHeadshot) {
    const now = Date.now();
    // In practice mode, instant 1.2s respawn for continuous target training
    const respawnDelay = this.isPractice ? 1.2 : config.RESPAWN_DELAY_SECONDS;
    victim.respawnAt = now + (respawnDelay * 1000);

    // Broadcast kill feed event
    this.broadcast('player_eliminated', {
      killerId: killer.id,
      killerUsername: killer.username,
      victimId: victim.id,
      victimUsername: victim.username,
      weaponId: weaponConfig.id,
      weaponName: weaponConfig.name,
      isHeadshot,
      respawnCountdown: respawnDelay
    });

    // SCAVENGER AMMO HARVEST: replenish 1 full magazine to killer's reserve ammo
    if (killer && killer.isAlive) {
      const kState = killer.activeWeaponState;
      const kConfig = killer.activeWeaponConfig;
      if (kState && kConfig) {
        kState.reserveAmmo = Math.min(kConfig.maxReserve, kState.reserveAmmo + kConfig.magSize);
        killer.send('ammo_harvested', {
          weaponId: killer.activeWeaponId,
          ammoInMag: kState.ammoInMag,
          reserveAmmo: kState.reserveAmmo
        });
      }
    }

    // AUTHORITATIVE PROGRESSION: Record confirmed kill in database if not practice mode and killer is human
    if (!this.isPractice && !killer.isBot) {
      const progressResult = statsService.recordKills(killer.id, 1, isHeadshot, weaponConfig.damage);

      // If killer unlocked a milestone reward, notify killer and entire match!
      if (progressResult.unlockedRewards && progressResult.unlockedRewards.length > 0) {
        for (const reward of progressResult.unlockedRewards) {
          killer.send('milestone_unlocked', {
            reward,
            totalLifetimeKills: progressResult.totalLifetimeKills
          });

          // Broadcast celebratory announcement in kill feed
          this.broadcast('server_announcement', {
            message: `🎖️ ${killer.username} reached a combat milestone! Unlocked: ${reward.name}`
          });
        }
      }
    }

    // Only record death in database for human players
    if (!victim.isBot && !this.isPractice) {
      statsService.recordDeath(victim.id);
    }

    // Check score limit condition
    if (killer.matchKills >= this.scoreLimit) {
      this.endMatch('score_limit', killer);
    }
  }

  handlePlayerReload(userId) {
    const player = this.players.get(userId);
    if (!player || !player.isAlive) return;

    const now = Date.now();
    const state = player.activeWeaponState;
    const config = player.activeWeaponConfig;

    // 1. If currently marked as reloading and timer already elapsed, finish now
    if (state.isReloading && now >= state.reloadCompleteAt) {
      player.finishReload();
      player.send('reload_finished', {
        weaponId: player.activeWeaponId,
        ammoInMag: state.ammoInMag,
        reserveAmmo: state.reserveAmmo
      });
      return;
    }

    // 2. If already in active reload animation, ignore duplicate keypress
    if (state.isReloading) {
      return;
    }

    // 3. If magazine is already full, immediately sync client to resolve any client-side desync
    if (state.ammoInMag >= config.magSize) {
      player.send('reload_finished', {
        weaponId: player.activeWeaponId,
        ammoInMag: state.ammoInMag,
        reserveAmmo: state.reserveAmmo
      });
      return;
    }

    // 4. Reserve ammo depletion recovery
    if (state.reserveAmmo <= 0) {
      if (this.isPractice) {
        state.reserveAmmo = config.maxReserve;
      } else {
        // Tactical emergency combat resupply (+1 full mag)
        state.reserveAmmo = config.magSize;
        player.send('combat_resupply', {
          weaponId: player.activeWeaponId,
          message: 'Tactical combat ammo resupply acquired!'
        });
      }
    }

    const started = player.startReload(now);
    if (started) {
      player.send('reload_started', {
        weaponId: player.activeWeaponId,
        durationMs: config.reloadTimeMs
      });
      this.broadcastExcept(userId, 'remote_player_reloading', {
        userId,
        weaponId: player.activeWeaponId
      });
    } else {
      player.send('reload_finished', {
        weaponId: player.activeWeaponId,
        ammoInMag: state.ammoInMag,
        reserveAmmo: state.reserveAmmo
      });
    }
  }

  handlePlayerSwitchWeapon(userId, weaponId) {
    const player = this.players.get(userId);
    if (!player || !player.isAlive) return;

    if (player.switchWeapon(weaponId)) {
      player.send('weapon_switched', {
        weaponId: player.activeWeaponId,
        ammoInMag: player.activeWeaponState.ammoInMag,
        reserveAmmo: player.activeWeaponState.reserveAmmo
      });
      this.broadcastExcept(userId, 'remote_player_switched_weapon', {
        userId,
        weaponId: player.activeWeaponId
      });
    }
  }

  endMatch(reason, winnerPlayer = null) {
    if (this.state === 'ended') return;
    this.state = 'ended';

    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.timerInterval) clearInterval(this.timerInterval);

    // Determine final rankings
    const playersList = Array.from(this.players.values());
    playersList.sort((a, b) => b.matchScore - a.matchScore || b.matchKills - a.matchKills);

    const winner = winnerPlayer || playersList[0] || null;

    // Record match in database
    const matchId = `match_${Date.now()}_${this.code}`;
    try {
      db.prepare(`
        INSERT INTO matches (id, room_name, game_mode, map_name, player_count, winner_id, duration_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        matchId,
        this.name,
        this.gameMode,
        MapData.getMap(this.mapId).name,
        playersList.length,
        winner ? winner.id : null,
        this.matchDuration - this.timeRemaining
      );

      const insertParticipant = db.prepare(`
        INSERT INTO match_participants (match_id, user_id, kills, deaths, damage, score, team)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const p of playersList) {
        if (!p.isBot) {
          insertParticipant.run(matchId, p.id, p.matchKills, p.matchDeaths, p.matchDamage, p.matchScore, p.team);
          const won = winner && winner.id === p.id;
          statsService.recordMatchFinished(p.id, won);
          friendsService.updateUserStatus(p.id, true, 'in_lobby', this.code);
        }
      }

      analyticsService.recordEvent({
        category: 'game',
        eventName: 'match_complete',
        data: {
          matchId,
          roomCode: this.code,
          gameMode: this.gameMode,
          mapId: this.mapId,
          playerCount: playersList.length,
          winnerId: winner ? winner.id : null,
          durationSeconds: this.matchDuration - this.timeRemaining
        }
      });
    } catch (err) {
      console.error('Failed to save match results:', err);
    }

    const leaderboard = playersList.map((p, index) => ({
      rank: index + 1,
      userId: p.id,
      username: p.username,
      isBot: Boolean(p.isBot),
      team: p.team,
      kills: p.matchKills,
      deaths: p.matchDeaths,
      damage: p.matchDamage,
      score: p.matchScore,
      kd: p.matchDeaths > 0 ? (p.matchKills / p.matchDeaths).toFixed(2) : p.matchKills.toFixed(2),
      isWinner: winner && winner.id === p.id
    }));

    this.broadcast('match_ended', {
      reason,
      winner: winner ? { id: winner.id, username: winner.username, isBot: Boolean(winner.isBot) } : null,
      leaderboard,
      durationSeconds: this.matchDuration - this.timeRemaining,
      isAiMatch: this.isAiMatch,
      aiDifficulty: this.aiDifficulty,
      isPractice: this.isPractice
    });

    // Reset back to lobby after 12 seconds so players can play another round
    setTimeout(() => {
      this.resetToLobby();
    }, 12000);
  }

  resetToLobby() {
    this.state = 'lobby';
    this.timeRemaining = this.matchDuration;

    for (const player of this.players.values()) {
      player.matchKills = 0;
      player.matchDeaths = 0;
      player.matchDamage = 0;
      player.matchScore = 0;
      player.isReady = false;
      const spawn = this.getNextSpawnPoint();
      player.respawn(spawn);
    }

    this.notifyLobbyUpdate();
  }

  notifyLobbyUpdate() {
    this.broadcast('lobby_updated', {
      room: this.serializeInfo(),
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        team: p.team,
        isReady: p.isReady,
        isHost: p.id === this.hostUserId,
        characterSkin: p.characterSkin,
        weaponSkin: p.weaponSkin
      }))
    });
  }

  broadcast(type, payload) {
    const msg = JSON.stringify({ type, ...payload });
    for (const player of this.players.values()) {
      if (player.ws && player.ws.readyState === 1) {
        player.ws.send(msg);
      }
    }
  }

  broadcastExcept(excludeUserId, type, payload) {
    const msg = JSON.stringify({ type, ...payload });
    for (const player of this.players.values()) {
      if (player.id !== excludeUserId && player.ws && player.ws.readyState === 1) {
        player.ws.send(msg);
      }
    }
  }

  serializeInfo() {
    return {
      code: this.code,
      name: this.name,
      isPrivate: this.isPrivate,
      gameMode: this.gameMode,
      mapId: this.mapId,
      mapName: MapData.getMap(this.mapId).name,
      maxPlayers: this.maxPlayers,
      playerCount: this.playerCount,
      hostUserId: this.hostUserId,
      state: this.state,
      isAiMatch: this.isAiMatch,
      aiDifficulty: this.aiDifficulty,
      isPractice: this.isPractice,
      scoreLimit: this.scoreLimit,
      matchDuration: this.matchDuration
    };
  }

  destroy() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.players.clear();
  }
}

module.exports = Room;
