const db = require('../database/db');
const { milestoneAchievements } = require('../database/seed');

class StatsService {
  /**
   * Helper to resolve any format of user identifier (number, numeric string, tag #0001, or username)
   * to authoritative numeric user ID.
   */
  normalizeUserId(userId) {
    if (userId === null || userId === undefined) return null;
    if (typeof userId === 'number') {
      return Number.isInteger(userId) ? userId : Math.floor(userId);
    }
    if (typeof userId === 'string') {
      const trimmed = userId.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('#')) {
        const parsed = parseInt(trimmed.slice(1), 10);
        if (!isNaN(parsed)) return parsed;
      }
      if (/^\d+$/.test(trimmed)) {
        const parsed = parseInt(trimmed, 10);
        if (!isNaN(parsed)) return parsed;
      }
      // If a username was supplied, look up the user's ID
      try {
        const u = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(trimmed);
        if (u) return u.id;
      } catch (e) {}
    }
    return userId;
  }

  /**
   * Ensure a stats record exists for this user in SQLite
   */
  ensureStatsRow(userId) {
    const id = this.normalizeUserId(userId);
    if (!id) return;
    try {
      db.prepare(`
        INSERT INTO stats (user_id, lifetime_kills, lifetime_deaths, lifetime_headshots, lifetime_damage, lifetime_matches, lifetime_wins)
        VALUES (?, 0, 0, 0, 0, 0, 0)
        ON CONFLICT(user_id) DO NOTHING
      `).run(id);
    } catch (e) {
      // Ignore if user does not exist in users table (foreign key constraint)
    }
  }

  /**
   * Get user lifetime stats and computed progression milestones
   */
  getUserStats(userId) {
    const id = this.normalizeUserId(userId);
    if (!id) return null;
    this.ensureStatsRow(id);

    const stats = db.prepare(`
      SELECT s.*, u.username, u.email, u.created_at as registered_at
      FROM stats s
      JOIN users u ON u.id = s.user_id
      WHERE s.user_id = ?
    `).get(id);

    if (!stats) return null;

    const lifetimeKills = stats.lifetime_kills || 0;

    // Determine upcoming milestone
    const sortedMilestones = [...milestoneAchievements].sort((a, b) => a.kills - b.kills);
    let nextMilestone = null;
    let prevMilestoneKills = 0;

    for (const m of sortedMilestones) {
      if (lifetimeKills < m.kills) {
        nextMilestone = m;
        break;
      }
      prevMilestoneKills = m.kills;
    }

    let progressRatio = 1.0;
    let killsTowardsNext = lifetimeKills;
    let neededForNext = lifetimeKills;

    if (nextMilestone) {
      const span = nextMilestone.kills - prevMilestoneKills;
      const currentInSpan = lifetimeKills - prevMilestoneKills;
      progressRatio = Math.min(1.0, Math.max(0, currentInSpan / span));
      killsTowardsNext = lifetimeKills;
      neededForNext = nextMilestone.kills;
    }

    // Intermediate progress indicators towards 60,000 kills
    const progressTo60k = {
      target: 60000,
      current: lifetimeKills,
      ratio: Math.min(1.0, lifetimeKills / 60000),
      percentage: ((Math.min(1.0, lifetimeKills / 60000)) * 100).toFixed(2),
      remaining: Math.max(0, 60000 - lifetimeKills)
    };

    // Fetch unlocked achievements
    const achievements = db.prepare(`
      SELECT * FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC
    `).all(id);

    return {
      stats: {
        userId: stats.user_id,
        tag: `#${String(stats.user_id).padStart(4, '0')}`,
        username: stats.username,
        lifetimeKills: stats.lifetime_kills,
        lifetimeDeaths: stats.lifetime_deaths,
        lifetimeHeadshots: stats.lifetime_headshots,
        lifetimeDamage: stats.lifetime_damage,
        lifetimeMatches: stats.lifetime_matches,
        lifetimeWins: stats.lifetime_wins,
        kdRatio: stats.lifetime_deaths > 0 ? (stats.lifetime_kills / stats.lifetime_deaths).toFixed(2) : stats.lifetime_kills.toFixed(2),
        registeredAt: stats.registered_at
      },
      progression: {
        currentKills: lifetimeKills,
        nextMilestone: nextMilestone ? {
          key: nextMilestone.key,
          name: nextMilestone.name,
          desc: nextMilestone.desc,
          requiredKills: nextMilestone.kills,
          progressText: `${lifetimeKills} / ${nextMilestone.kills} kills`,
          progressRatio,
          remaining: nextMilestone.kills - lifetimeKills
        } : {
          key: 'maxed',
          name: 'Apex Overlord Transcended',
          desc: 'Maximum combat milestone attained.',
          requiredKills: 60000,
          progressText: `${lifetimeKills} / 60,000 kills (MAX)`,
          progressRatio: 1.0,
          remaining: 0
        },
        progressTo60k,
        allMilestones: sortedMilestones.map(m => {
          const unlocked = lifetimeKills >= m.kills;
          return {
            ...m,
            unlocked,
            progress: Math.min(1.0, lifetimeKills / m.kills),
            progressText: unlocked ? 'Completed' : `${lifetimeKills} / ${m.kills} kills`
          };
        })
      },
      achievements
    };
  }

  /**
   * Authoritatively record confirmed combat kills and evaluate milestone unlocks.
   * Can ONLY be invoked by the authoritative game server upon match conclusion or kill confirmation.
   */
  recordKills(userId, killsToAdd, isHeadshot = false, damageDealt = 0) {
    const id = this.normalizeUserId(userId);
    if (!id || killsToAdd <= 0) return { totalLifetimeKills: 0, unlockedRewards: [] };
    this.ensureStatsRow(id);

    const updateStats = db.prepare(`
      UPDATE stats
      SET lifetime_kills = lifetime_kills + ?,
          lifetime_headshots = lifetime_headshots + ?,
          lifetime_damage = lifetime_damage + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `);

    updateStats.run(killsToAdd, isHeadshot ? 1 : 0, damageDealt, id);

    // Get updated lifetime kills
    const row = db.prepare('SELECT lifetime_kills FROM stats WHERE user_id = ?').get(id);
    const totalKills = row ? row.lifetime_kills : 0;

    // Check and grant milestone rewards
    const unlockedRewards = this.evaluateMilestoneRewards(id, totalKills);

    return {
      totalLifetimeKills: totalKills,
      unlockedRewards
    };
  }

  recordDeath(userId) {
    const id = this.normalizeUserId(userId);
    if (!id) return;
    this.ensureStatsRow(id);
    db.prepare('UPDATE stats SET lifetime_deaths = lifetime_deaths + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(id);
  }

  recordMatchFinished(userId, won = false) {
    const id = this.normalizeUserId(userId);
    if (!id) return;
    this.ensureStatsRow(id);
    db.prepare(`
      UPDATE stats
      SET lifetime_matches = lifetime_matches + 1,
          lifetime_wins = lifetime_wins + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(won ? 1 : 0, id);
  }

  /**
   * Checks milestones and unlocks corresponding skins and achievements in SQLite
   */
  evaluateMilestoneRewards(userId, lifetimeKills) {
    const id = this.normalizeUserId(userId);
    if (!id) return [];

    const newlyUnlocked = [];

    // Milestone rule mappings
    const rewardRules = [
      { kills: 10, skins: ['wep_bronze'], achKey: 'milestone_10_kills', achName: 'Bronze Marksman', achDesc: 'Achieved 10 confirmed combat kills.' },
      { kills: 25, skins: ['char_desert'], achKey: 'milestone_25_kills', achName: 'Desert Scout', achDesc: 'Achieved 25 confirmed combat kills.' },
      { kills: 50, skins: ['char_silver', 'wep_silver'], achKey: 'milestone_50_kills', achName: 'Silver Vanguard', achDesc: 'Achieved 50 confirmed combat kills.' },
      { kills: 100, skins: ['char_cyber'], achKey: 'milestone_100_kills', achName: 'Cybernetic Lethality', achDesc: 'Achieved 100 confirmed combat kills.' },
      { kills: 500, skins: ['char_crimson'], achKey: 'milestone_500_kills', achName: 'Crimson Executioner', achDesc: 'Achieved 500 confirmed combat kills.' },
      { kills: 1000, skins: ['char_titanium'], achKey: 'milestone_1000_kills', achName: 'Titanium Warlord', achDesc: 'Achieved 1,000 confirmed combat kills.' },
      { kills: 5000, skins: ['char_void'], achKey: 'milestone_5000_kills', achName: 'Void Annihilator', achDesc: 'Achieved 5,000 confirmed combat kills.' },
      { kills: 10000, skins: ['char_plasma'], achKey: 'milestone_10000_kills', achName: 'Plasma Dragon', achDesc: 'Achieved 10,000 confirmed combat kills.' },
      { kills: 25000, skins: ['char_cosmic'], achKey: 'milestone_25000_kills', achName: 'Cosmic Dominator', achDesc: 'Achieved 25,000 confirmed combat kills.' },
      { kills: 60000, skins: ['char_apex_overlord', 'wep_solaris'], achKey: 'milestone_60000_kills', achName: 'Apex Overlord - Godlike Legend', achDesc: 'Achieved 60,000 lifetime kills. Ultimate mastery.' }
    ];

    const unlockSkinStmt = db.prepare(`
      INSERT OR IGNORE INTO user_skins (user_id, skin_id) VALUES (?, ?)
    `);

    const unlockAchStmt = db.prepare(`
      INSERT OR IGNORE INTO achievements (user_id, milestone_key, name, description)
      VALUES (?, ?, ?, ?)
    `);

    for (const rule of rewardRules) {
      if (lifetimeKills >= rule.kills) {
        // Check achievement
        const achResult = unlockAchStmt.run(id, rule.achKey, rule.achName, rule.achDesc);
        if (achResult.changes > 0) {
          newlyUnlocked.push({
            type: 'achievement',
            key: rule.achKey,
            name: rule.achName,
            description: rule.achDesc,
            requiredKills: rule.kills
          });
        }

        // Check skins
        for (const skinId of rule.skins) {
          const skinResult = unlockSkinStmt.run(id, skinId);
          if (skinResult.changes > 0) {
            const skinInfo = db.prepare('SELECT name, type, rarity, description FROM skins WHERE skin_id = ?').get(skinId);
            newlyUnlocked.push({
              type: 'skin',
              skinId,
              name: skinInfo ? skinInfo.name : skinId,
              skinType: skinInfo ? skinInfo.type : 'skin',
              rarity: skinInfo ? skinInfo.rarity : 'rare',
              requiredKills: rule.kills
            });
          }
        }
      }
    }

    return newlyUnlocked;
  }
}

module.exports = new StatsService();
