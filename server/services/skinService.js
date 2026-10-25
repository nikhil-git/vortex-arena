const db = require('../database/db');

function normalizeId(userId) {
  if (userId === null || userId === undefined) return null;
  if (typeof userId === 'number') return Number.isInteger(userId) ? userId : Math.floor(userId);
  if (typeof userId === 'string') {
    const trimmed = userId.trim();
    if (trimmed.startsWith('#')) {
      const p = parseInt(trimmed.slice(1), 10);
      if (!isNaN(p)) return p;
    }
    if (/^\d+$/.test(trimmed)) {
      const p = parseInt(trimmed, 10);
      if (!isNaN(p)) return p;
    }
    try {
      const u = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(trimmed);
      if (u) return u.id;
    } catch (e) {}
  }
  return userId;
}

class SkinService {
  /**
   * Assign default starter skins to a new user
   */
  assignDefaultSkins(userId) {
    const id = normalizeId(userId);
    if (!id) return;

    const insertDefault = db.prepare(`
      INSERT OR IGNORE INTO user_skins (user_id, skin_id, is_equipped)
      VALUES (?, ?, 1)
    `);

    insertDefault.run(id, 'char_default');
    insertDefault.run(id, 'wep_default');
  }

  /**
   * Get all skins catalog with the user's unlock and equipped status
   */
  getUserSkins(userId) {
    const id = normalizeId(userId);
    if (!id) return [];

    const allSkins = db.prepare(`
      SELECT 
        s.*,
        CASE WHEN us.id IS NOT NULL THEN 1 ELSE 0 END AS is_unlocked,
        COALESCE(us.is_equipped, 0) AS is_equipped,
        us.unlocked_at
      FROM skins s
      LEFT JOIN user_skins us ON s.skin_id = us.skin_id AND us.user_id = ?
      ORDER BY s.type ASC, s.required_kills ASC, s.name ASC
    `).all(id);

    // Get user's current lifetime kills for context
    const statsRow = db.prepare('SELECT lifetime_kills FROM stats WHERE user_id = ?').get(id);
    const currentKills = statsRow ? statsRow.lifetime_kills : 0;

    return allSkins.map(skin => ({
      ...skin,
      is_unlocked: Boolean(skin.is_unlocked),
      is_equipped: Boolean(skin.is_equipped),
      killsProgress: currentKills,
      canUnlock: currentKills >= skin.required_kills
    }));
  }

  /**
   * Get currently equipped character and weapon skin for a user
   */
  getEquippedSkins(userId) {
    const id = normalizeId(userId);
    if (!id) {
      return {
        characterSkin: db.prepare('SELECT * FROM skins WHERE skin_id = ?').get('char_default'),
        weaponSkin: db.prepare('SELECT * FROM skins WHERE skin_id = ?').get('wep_default')
      };
    }

    const equipped = db.prepare(`
      SELECT s.*
      FROM user_skins us
      JOIN skins s ON us.skin_id = s.skin_id
      WHERE us.user_id = ? AND us.is_equipped = 1
    `).all(id);

    let characterSkin = equipped.find(s => s.type === 'character');
    let weaponSkin = equipped.find(s => s.type === 'weapon');

    if (!characterSkin) {
      characterSkin = db.prepare('SELECT * FROM skins WHERE skin_id = ?').get('char_default');
    }
    if (!weaponSkin) {
      weaponSkin = db.prepare('SELECT * FROM skins WHERE skin_id = ?').get('wep_default');
    }

    return {
      characterSkin,
      weaponSkin
    };
  }

  /**
   * Equip a skin if unlocked
   */
  equipSkin(userId, skinId) {
    // 1. Verify skin exists and is unlocked by this user
    const ownership = db.prepare(`
      SELECT us.id, s.type, s.name
      FROM user_skins us
      JOIN skins s ON us.skin_id = s.skin_id
      WHERE us.user_id = ? AND us.skin_id = ?
    `).get(userId, skinId);

    if (!ownership) {
      return { success: false, error: 'Skin is locked or not owned' };
    }

    const skinType = ownership.type;

    // 2. Transaction: unequip all skins of this type for this user, then equip target skin
    const unequipAllOfType = db.prepare(`
      UPDATE user_skins
      SET is_equipped = 0
      WHERE user_id = ? AND skin_id IN (
        SELECT skin_id FROM skins WHERE type = ?
      )
    `);

    const equipTarget = db.prepare(`
      UPDATE user_skins
      SET is_equipped = 1
      WHERE user_id = ? AND skin_id = ?
    `);

    const tx = db.transaction(() => {
      unequipAllOfType.run(userId, skinType);
      equipTarget.run(userId, skinId);
    });

    tx();

    return {
      success: true,
      equippedSkinId: skinId,
      skinType,
      name: ownership.name
    };
  }
}

module.exports = new SkinService();
