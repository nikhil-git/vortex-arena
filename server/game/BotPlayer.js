/**
 * BotPlayer - Extends Player with AI Controller integration
 * Provides autonomous behavior inside tactical rooms
 */

const Player = require('./Player');
const { BotAI } = require('./BotAI');

const BOT_NAMES = [
  'Viper', 'Ghost', 'Phantom', 'Reaper',
  'Hunter', 'Apex', 'Nova', 'Titan',
  'Valkyrie', 'Shadow', 'Nomad', 'Spectre'
];

const BOT_SKINS = [
  { id: 'char_default', name: 'Default Operative', primaryColor: '#2b394d' },
  { id: 'char_desert', name: 'Desert Camo', primaryColor: '#bfa168' },
  { id: 'char_urban', name: 'Urban Shadow', primaryColor: '#4d5b6e' },
  { id: 'char_chrome', name: 'Silver Vanguard', primaryColor: '#d6dde4' },
  { id: 'char_crimson', name: 'Crimson Phantom', primaryColor: '#ff3366' },
  { id: 'char_gold', name: 'Apex Overlord', primaryColor: '#ffb700' }
];

class BotPlayer extends Player {
  constructor(botIndex, difficulty = 'medium', team = 'solo', mapId = 'house') {
    const botId = `bot_${Date.now()}_${botIndex}_${Math.floor(Math.random() * 1000)}`;
    const botName = `[BOT] ${BOT_NAMES[botIndex % BOT_NAMES.length]}`;
    
    // Assign skin
    const skin = BOT_SKINS[botIndex % BOT_SKINS.length];
    const equippedSkins = {
      characterSkin: { skin_id: skin.id, name: skin.name, primary_color: skin.primaryColor },
      weaponSkin: { skin_id: 'wep_default', name: 'Standard Issue' }
    };

    // Safe dummy WebSocket
    const mockWs = {
      readyState: 1, // OPEN
      send: () => {} // Silent no-op
    };

    super(botId, botName, mockWs, equippedSkins);

    this.isBot = true;
    this.team = team;
    this.difficulty = difficulty;
    this.mapId = mapId;
    this.lastDamagedAt = 0;
    this.lastAttackerId = null;

    // Initialize tactical AI controller
    this.ai = new BotAI(this, difficulty, mapId);
  }

  takeDamage(amount, attacker, isHeadshot = false) {
    if (attacker) {
      this.lastAttackerId = attacker.id;
      this.lastDamagedAt = Date.now();
    }
    return super.takeDamage(amount, attacker, isHeadshot);
  }

  respawn(spawnPoint, protectionSeconds = 3.0) {
    super.respawn(spawnPoint, protectionSeconds);
    if (this.ai) {
      this.ai.state = 'patrol';
      this.ai.currentWaypoint = this.ai.getRandomWaypoint();
      this.ai.targetPlayer = null;
      this.ai.isBursting = false;
    }
  }

  update(delta, room) {
    if (this.ai) {
      this.ai.update(delta, room);
    }
  }
}

module.exports = BotPlayer;
