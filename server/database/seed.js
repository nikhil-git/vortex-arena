const db = require('./db');

const initialSkins = [
  // Default Free Skins
  {
    skin_id: 'char_default',
    name: 'Recruit Operative',
    type: 'character',
    category: 'default',
    rarity: 'common',
    required_kills: 0,
    weapon_type: null,
    description: 'Standard issue tactical urban combat uniform with lightweight ballistic plates.',
    color_primary: '#2b303c',
    color_secondary: '#1a1d24',
    color_accent: '#00e5ff',
    metallic: 0.3,
    roughness: 0.7,
    emissive: '#002b36'
  },
  {
    skin_id: 'wep_default',
    name: 'Standard Issue Matte',
    type: 'weapon',
    category: 'default',
    rarity: 'common',
    required_kills: 0,
    weapon_type: 'all',
    description: 'Factory standard matte-black polymer firearm finish.',
    color_primary: '#22252a',
    color_secondary: '#111215',
    color_accent: '#556070',
    metallic: 0.4,
    roughness: 0.6,
    emissive: '#000000'
  },

  // 10 Kills Milestone (Required by Prompt)
  {
    skin_id: 'wep_bronze',
    name: 'Bronze Striker',
    type: 'weapon',
    category: 'milestone',
    rarity: 'rare',
    required_kills: 10,
    weapon_type: 'all',
    description: 'Cast from heavy forged bronze with hand-etched tactical engraving. Unlocked at 10 lifetime kills.',
    color_primary: '#cd7f32',
    color_secondary: '#8c501e',
    color_accent: '#ffb366',
    metallic: 0.85,
    roughness: 0.25,
    emissive: '#3d2005'
  },

  // 25 Kills Intermediate Milestone
  {
    skin_id: 'char_desert',
    name: 'Desert Scout',
    type: 'character',
    category: 'milestone',
    rarity: 'rare',
    required_kills: 25,
    weapon_type: null,
    description: 'Arid climate stealth combat suit equipped with dust-resistant ballistic optics.',
    color_primary: '#c2a679',
    color_secondary: '#6d5a3b',
    color_accent: '#ffd79e',
    metallic: 0.2,
    roughness: 0.8,
    emissive: '#2e2413'
  },

  // 50 Kills Milestone (Required by Prompt)
  {
    skin_id: 'char_silver',
    name: 'Silver Vanguard',
    type: 'character',
    category: 'milestone',
    rarity: 'epic',
    required_kills: 50,
    weapon_type: null,
    description: 'Reinforced polished chrome combat plate armor with high-velocity shock dampeners. Unlocked at 50 kills.',
    color_primary: '#d6dcde',
    color_secondary: '#6c757d',
    color_accent: '#00ffff',
    metallic: 0.95,
    roughness: 0.15,
    emissive: '#003344'
  },
  {
    skin_id: 'wep_silver',
    name: 'Silver Alloy',
    type: 'weapon',
    category: 'milestone',
    rarity: 'epic',
    required_kills: 50,
    weapon_type: 'all',
    description: 'Precision machined reflective silver chassis with sapphire cooling trims.',
    color_primary: '#e8ecef',
    color_secondary: '#adb5bd',
    color_accent: '#00d2ff',
    metallic: 0.9,
    roughness: 0.2,
    emissive: '#001926'
  },

  // 100 Kills Milestone
  {
    skin_id: 'char_cyber',
    name: 'Cyber Ninja',
    type: 'character',
    category: 'milestone',
    rarity: 'epic',
    required_kills: 100,
    weapon_type: null,
    description: 'Carbon-composite stealth suit interwoven with reactive ultraviolet neural circuitry.',
    color_primary: '#12131a',
    color_secondary: '#251b3a',
    color_accent: '#bf00ff',
    metallic: 0.7,
    roughness: 0.3,
    emissive: '#52006a'
  },

  // 500 Kills Milestone
  {
    skin_id: 'char_crimson',
    name: 'Crimson Phantom',
    type: 'character',
    category: 'milestone',
    rarity: 'epic',
    required_kills: 500,
    weapon_type: null,
    description: 'Matte blood-crimson composite plating engineered for elite combat marksmen.',
    color_primary: '#850014',
    color_secondary: '#200004',
    color_accent: '#ff2a4d',
    metallic: 0.6,
    roughness: 0.35,
    emissive: '#40000a'
  },

  // 1,000 Kills Milestone
  {
    skin_id: 'char_titanium',
    name: 'Titanium Warlord',
    type: 'character',
    category: 'milestone',
    rarity: 'epic',
    required_kills: 1000,
    weapon_type: null,
    description: 'Heavy battle-tested forged titanium exoskeleton crowned with gold command heraldry.',
    color_primary: '#495057',
    color_secondary: '#212529',
    color_accent: '#ffd700',
    metallic: 0.85,
    roughness: 0.25,
    emissive: '#3a3000'
  },

  // 5,000 Kills Milestone
  {
    skin_id: 'char_void',
    name: 'Void Stalker',
    type: 'character',
    category: 'milestone',
    rarity: 'legendary',
    required_kills: 5000,
    weapon_type: null,
    description: 'Dark-matter infused armor warping incident photons into a shadow shroud.',
    color_primary: '#09090d',
    color_secondary: '#19002e',
    color_accent: '#9d4edd',
    metallic: 0.7,
    roughness: 0.2,
    emissive: '#3c096c'
  },

  // 10,000 Kills Milestone
  {
    skin_id: 'char_plasma',
    name: 'Plasma Drake',
    type: 'character',
    category: 'milestone',
    rarity: 'legendary',
    required_kills: 10000,
    weapon_type: null,
    description: 'Overcharged magma plasma armor venting superheated energy coils along the spinal chassis.',
    color_primary: '#240000',
    color_secondary: '#d00000',
    color_accent: '#ffba08',
    metallic: 0.8,
    roughness: 0.2,
    emissive: '#e85d04'
  },

  // 25,000 Kills Milestone
  {
    skin_id: 'char_cosmic',
    name: 'Cosmic Centurion',
    type: 'character',
    category: 'milestone',
    rarity: 'legendary',
    required_kills: 25000,
    weapon_type: null,
    description: 'Celestial grade composite armor shimmering with deep orbital hyperdrive aurora.',
    color_primary: '#03045e',
    color_secondary: '#0077b6',
    color_accent: '#90e0ef',
    metallic: 0.9,
    roughness: 0.1,
    emissive: '#0096c7'
  },

  // 60,000 Kills Milestone (Ultimate Requirement by Prompt)
  {
    skin_id: 'char_apex_overlord',
    name: 'Apex Overlord',
    type: 'character',
    category: 'milestone',
    rarity: 'legendary',
    required_kills: 60000,
    weapon_type: null,
    description: 'The pinnacle of martial dominance. Radiant golden-hologram armor with an immortal crown and pulsing solar aura. Awarded at 60,000 lifetime kills.',
    color_primary: '#ffd700',
    color_secondary: '#ffae00',
    color_accent: '#ffffff',
    metallic: 0.98,
    roughness: 0.08,
    emissive: '#ff9900'
  },
  {
    skin_id: 'wep_solaris',
    name: 'Solaris Oblivion',
    type: 'weapon',
    category: 'milestone',
    rarity: 'legendary',
    required_kills: 60000,
    weapon_type: 'all',
    description: 'Forged from hyper-dense stellar core alloys that channel blinding white-gold solar energy. Awarded at 60,000 lifetime kills.',
    color_primary: '#ffeedd',
    color_secondary: '#e5a100',
    color_accent: '#00f0ff',
    metallic: 0.95,
    roughness: 0.05,
    emissive: '#ff7700'
  }
];

const milestoneAchievements = [
  { key: 'milestone_10_kills', name: 'Bronze Marksman', desc: 'Eliminate 10 enemies in live combat matches.', kills: 10 },
  { key: 'milestone_25_kills', name: 'Desert Combatant', desc: 'Eliminate 25 enemies in live combat matches.', kills: 25 },
  { key: 'milestone_50_kills', name: 'Silver Vanguard', desc: 'Eliminate 50 enemies in live combat matches.', kills: 50 },
  { key: 'milestone_100_kills', name: 'Cybernetic Lethality', desc: 'Eliminate 100 enemies in live combat matches.', kills: 100 },
  { key: 'milestone_500_kills', name: 'Crimson Executioner', desc: 'Eliminate 500 enemies in live combat matches.', kills: 500 },
  { key: 'milestone_1000_kills', name: 'Titanium Warlord', desc: 'Eliminate 1,000 enemies in live combat matches.', kills: 1000 },
  { key: 'milestone_5000_kills', name: 'Void Annihilator', desc: 'Eliminate 5,000 enemies in live combat matches.', kills: 5000 },
  { key: 'milestone_10000_kills', name: 'Plasma Dragon', desc: 'Eliminate 10,000 enemies in live combat matches.', kills: 10000 },
  { key: 'milestone_25000_kills', name: 'Cosmic Dominator', desc: 'Eliminate 25,000 enemies in live combat matches.', kills: 25000 },
  { key: 'milestone_60000_kills', name: 'Apex Overlord - Godlike Legend', desc: 'Achieve 60,000 lifetime confirmed kills to reach ultimate immortality.', kills: 60000 }
];

function seedDatabase() {
  const insertSkin = db.prepare(`
    INSERT INTO skins (
      skin_id, name, type, category, rarity, required_kills, weapon_type,
      description, color_primary, color_secondary, color_accent, metallic, roughness, emissive
    ) VALUES (
      @skin_id, @name, @type, @category, @rarity, @required_kills, @weapon_type,
      @description, @color_primary, @color_secondary, @color_accent, @metallic, @roughness, @emissive
    ) ON CONFLICT(skin_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      required_kills = excluded.required_kills,
      color_primary = excluded.color_primary,
      color_secondary = excluded.color_secondary,
      color_accent = excluded.color_accent,
      metallic = excluded.metallic,
      roughness = excluded.roughness,
      emissive = excluded.emissive
  `);

  const tx = db.transaction(() => {
    for (const skin of initialSkins) {
      insertSkin.run(skin);
    }
  });

  tx();
  console.log(`[Seed] Successfully seeded ${initialSkins.length} skins into the database.`);
}

module.exports = {
  seedDatabase,
  initialSkins,
  milestoneAchievements
};
