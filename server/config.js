const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'vortex-arena-super-secure-jwt-secret-key-2026',
  DB_PATH: process.env.DB_PATH || path.join(__dirname, 'database', 'vortex_arena.sqlite'),
  MAX_PLAYERS_PER_ROOM: 12,
  TICK_RATE: 30, // 30Hz server tick
  MATCH_DURATION_SECONDS: 300, // 5 minutes
  SCORE_LIMIT: 25, // 25 kills to win FFA or TDM
  RESPAWN_DELAY_SECONDS: 3,
  RESPAWN_PROTECTION_SECONDS: 3.0,
  
  // Starting weapons given to all players on spawn
  DEFAULT_WEAPONS: ['assault_rifle', 'pistol', 'shotgun', 'sniper_rifle']
};
