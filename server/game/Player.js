const WEAPONS = require('./WeaponData');

class Player {
  constructor(userId, username, ws, equippedSkins = {}) {
    this.id = userId;
    this.username = username;
    this.ws = ws;
    this.team = 'solo'; // 'solo', 'red', 'blue'
    this.isReady = false;

    // Equipped cosmetics
    this.characterSkin = equippedSkins.characterSkin || { skin_id: 'char_default' };
    this.weaponSkin = equippedSkins.weaponSkin || { skin_id: 'wep_default' };

    // Transform
    this.position = { x: 0, y: 0, z: 0 };
    this.rotation = { yaw: 0, pitch: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.lastAckSeq = 0;

    // Health & Vitals
    this.maxHealth = 100;
    this.health = 100;
    this.maxShield = 50;
    this.shield = 50;
    this.isAlive = true;
    this.respawnAt = 0;
    this.invulnerableUntil = 0; // Timestamp (ms) until which player is protected from damage

    // Match Scoring
    this.matchKills = 0;
    this.matchDeaths = 0;
    this.matchHeadshots = 0;
    this.matchDamage = 0;
    this.matchScore = 0;

    // Weapons Loadout
    this.weapons = {};
    for (const [wepId, data] of Object.entries(WEAPONS)) {
      this.weapons[wepId] = {
        ammoInMag: data.magSize,
        reserveAmmo: data.maxReserve,
        isReloading: false,
        reloadCompleteAt: 0,
        lastFiredAt: 0
      };
    }
    this.activeWeaponId = 'assault_rifle';
  }

  get activeWeaponConfig() {
    return WEAPONS[this.activeWeaponId] || WEAPONS.assault_rifle;
  }

  get activeWeaponState() {
    return this.weapons[this.activeWeaponId];
  }

  canFire(now) {
    if (!this.isAlive) return { allowed: false, reason: 'dead' };
    const state = this.activeWeaponState;
    const config = this.activeWeaponConfig;

    if (state.isReloading) {
      if (now >= state.reloadCompleteAt) {
        this.finishReload();
      } else {
        return { allowed: false, reason: 'reloading' };
      }
    }

    if (state.ammoInMag <= 0) {
      return { allowed: false, reason: 'empty_magazine' };
    }

    if (now - state.lastFiredAt < config.fireRateMs - 15) { // 15ms leniency for network jitter
      return { allowed: false, reason: 'fire_rate_limit' };
    }

    return { allowed: true };
  }

  consumeAmmo(now) {
    const state = this.activeWeaponState;
    if (state.ammoInMag > 0) {
      state.ammoInMag -= 1;
      state.lastFiredAt = now;
    }
  }

  startReload(now) {
    if (!this.isAlive) return false;
    const state = this.activeWeaponState;
    const config = this.activeWeaponConfig;

    if (state.isReloading) {
      if (now >= state.reloadCompleteAt) {
        this.finishReload();
        if (state.ammoInMag >= config.magSize) return false;
      } else {
        return false;
      }
    }

    if (state.ammoInMag >= config.magSize) return false;
    if (state.reserveAmmo <= 0) return false;

    state.isReloading = true;
    state.reloadCompleteAt = now + config.reloadTimeMs;
    return true;
  }

  finishReload() {
    const state = this.activeWeaponState;
    const config = this.activeWeaponConfig;

    if (!state.isReloading) return;

    const needed = config.magSize - state.ammoInMag;
    const toTake = Math.min(needed, state.reserveAmmo);
    state.ammoInMag += toTake;
    state.reserveAmmo -= toTake;
    state.isReloading = false;
    state.reloadCompleteAt = 0;
  }

  switchWeapon(weaponId) {
    if (!this.isAlive) return false;
    if (WEAPONS[weaponId] && this.weapons[weaponId]) {
      // Cancel ongoing reload on switch for both previous and new weapons
      this.activeWeaponState.isReloading = false;
      this.activeWeaponState.reloadCompleteAt = 0;
      this.weapons[weaponId].isReloading = false;
      this.weapons[weaponId].reloadCompleteAt = 0;
      this.activeWeaponId = weaponId;
      return true;
    }
    return false;
  }

  get isInvulnerable() {
    return Date.now() < this.invulnerableUntil;
  }

  takeDamage(amount, attackerPlayer = null, isHeadshot = false) {
    if (!this.isAlive) return { damageApplied: 0, killed: false, isHeadshot: false, isInvulnerable: false };

    // Respawn Protection: 100% damage immunity while invulnerable timer is active
    if (this.isInvulnerable) {
      return { damageApplied: 0, killed: false, isHeadshot: false, isInvulnerable: true };
    }

    let remaining = amount;
    let damageApplied = 0;

    // Shield absorbs 65% of damage first if active
    if (this.shield > 0) {
      const shieldAbsorb = Math.min(this.shield, remaining * 0.65);
      this.shield = Math.max(0, this.shield - shieldAbsorb);
      remaining -= shieldAbsorb;
      damageApplied += shieldAbsorb;
    }

    const healthDmg = Math.min(this.health, remaining);
    this.health = Math.max(0, this.health - healthDmg);
    damageApplied += healthDmg;

    if (attackerPlayer && attackerPlayer.id !== this.id) {
      attackerPlayer.matchDamage += Math.round(damageApplied);
      attackerPlayer.matchScore += Math.round(damageApplied);
    }

    if (this.health <= 0) {
      this.isAlive = false;
      this.matchDeaths += 1;

      if (attackerPlayer && attackerPlayer.id !== this.id) {
        attackerPlayer.matchKills += 1;
        attackerPlayer.matchScore += 100; // 100 points per kill
        if (isHeadshot) {
          attackerPlayer.matchHeadshots += 1;
          attackerPlayer.matchScore += 50; // 50 bonus for headshot
        }
      }

      return { damageApplied, killed: true, isHeadshot, isInvulnerable: false };
    }

    return { damageApplied, killed: false, isHeadshot, isInvulnerable: false };
  }

  respawn(spawnPoint, protectionSeconds = 3.0) {
    this.health = this.maxHealth;
    this.shield = this.maxShield;
    this.isAlive = true;
    this.respawnTimestamp = Date.now();
    this.invulnerableUntil = Date.now() + Math.max(0, protectionSeconds * 1000);
    this.position = {
      x: spawnPoint.x,
      y: (spawnPoint.y !== undefined && Number.isFinite(spawnPoint.y)) ? spawnPoint.y : 0,
      z: spawnPoint.z
    };
    this.rotation = { yaw: spawnPoint.yaw || 0, pitch: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.lastAckSeq = 0;

    // Refill active magazine and reset reload timers
    for (const [wepId, data] of Object.entries(WEAPONS)) {
      this.weapons[wepId].ammoInMag = data.magSize;
      this.weapons[wepId].reserveAmmo = data.maxReserve;
      this.weapons[wepId].isReloading = false;
      this.weapons[wepId].reloadCompleteAt = 0;
    }
  }

  send(type, payload) {
    if (this.ws && this.ws.readyState === 1) { // OPEN
      this.ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  serialize() {
    return {
      id: this.id,
      username: this.username,
      team: this.team,
      isReady: this.isReady,
      position: this.position,
      rotation: this.rotation,
      isAlive: this.isAlive,
      isInvulnerable: this.isInvulnerable,
      invulnerableUntil: this.invulnerableUntil,
      health: this.health,
      shield: this.shield,
      activeWeaponId: this.activeWeaponId,
      characterSkin: this.characterSkin,
      weaponSkin: this.weaponSkin,
      matchKills: this.matchKills,
      matchDeaths: this.matchDeaths,
      matchScore: this.matchScore
    };
  }
}

module.exports = Player;
