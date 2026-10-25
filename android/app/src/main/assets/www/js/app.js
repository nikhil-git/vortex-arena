import * as THREE from '/vendor/three/three.module.js';
import { GameEngine } from './game/GameEngine.js';
import { PlayerModel } from './game/PlayerModel.js';
import { MapData } from './game/MapData.js';

class App {
  constructor() {
    this.currentUser = null;
    this.currentScreen = 'auth';
    this.gameEngine = null;
    this.currentRoom = null;
    this.matchmakingTimer = null;
    this.matchmakingElapsed = 0;

    // Turntable preview
    this.turntableScene = null;
    this.turntableCamera = null;
    this.turntableRenderer = null;
    this.turntableModel = null;
    this.selectedSkin = null;
    this.allSkins = [];

    // Local weapon state in match
    this.activeWeaponId = 'assault_rifle';
    this.weaponsState = {
      assault_rifle: { name: 'V-44 Striker', mag: 30, reserve: 240 },
      sniper_rifle: { name: 'Hawk-50 Anti-Materiel', mag: 5, reserve: 40 },
      shotgun: { name: 'Breacher-12 Tactical', mag: 8, reserve: 64 },
      pistol: { name: 'Pulse-9 Sidearm', mag: 15, reserve: 120 }
    };

    // Single Player vs AI & Practice match configuration
    this.selectedMapId = 'house';
    this.mapModalContext = 'browse';
    this.spConfig = {
      mode: 'ffa',
      difficulty: 'medium',
      botCount: 5,
      mapId: 'house',
      scoreLimit: 25,
      duration: 300,
      isPractice: false
    };
    this.lastMatchConfig = null;
    this.currentMatchInfo = null;
    this.recentMilestoneReward = null;
    this.currentScreen = 'auth';

    // Match lifecycle & countdown state
    this.matchState = 'lobby'; // 'lobby', 'initializing', 'countdown', 'active', 'finished'
    this.countdownInterval = null;
    this.countdownFadeTimer = null;
    this.countdownSecondsRemaining = 0;

    this.init();
  }

  async init() {
    this.setupNetworkListeners();
    this.setupTurntablePreview();

    // Check if existing token is valid
    if (window.apiClient.token) {
      try {
        const data = await window.apiClient.getMe();
        if (data.user) {
          this.setCurrentUser(data.user);
          this.navigateTo('main-menu');
        }
      } catch (e) {
        window.apiClient.setToken(null);
        this.navigateTo('auth');
      }
    }
  }

  setCurrentUser(user) {
    this.currentUser = user;
    window.netClient.connect(window.apiClient.token);

    // Update Main Menu UI
    const nameEl = document.getElementById('menu-username');
    const tagEl = document.getElementById('menu-usertag');
    const avatarEl = document.getElementById('menu-avatar-initial');

    if (nameEl) nameEl.textContent = user.username;
    if (tagEl) tagEl.textContent = user.tag || `#${String(user.id).padStart(4, '0')}`;
    if (avatarEl) avatarEl.textContent = user.username.charAt(0).toUpperCase();

    // Immediately display stats from user payload if available
    if (user.stats) {
      this.updateStatsDisplay(user.stats, user.progression);
    }

    this.refreshUserStats();
  }

  updateStatsDisplay(stats, progression) {
    if (!stats) return;

    const killsEl = document.getElementById('side-lifetime-kills');
    const kdEl = document.getElementById('side-kd-ratio');
    const matchesEl = document.getElementById('side-matches');
    const winsEl = document.getElementById('side-wins');

    if (killsEl && stats.lifetimeKills !== undefined) killsEl.textContent = stats.lifetimeKills;
    if (kdEl && stats.kdRatio !== undefined) kdEl.textContent = stats.kdRatio;
    if (matchesEl && stats.lifetimeMatches !== undefined) matchesEl.textContent = stats.lifetimeMatches;
    if (winsEl && stats.lifetimeWins !== undefined) winsEl.textContent = stats.lifetimeWins;

    if (progression && progression.nextMilestone) {
      const nextM = progression.nextMilestone;
      const textEl = document.getElementById('side-milestone-text');
      const barEl = document.getElementById('side-milestone-bar');
      const nameEl = document.getElementById('side-milestone-name');

      if (textEl && nextM.progressText) textEl.textContent = nextM.progressText;
      if (barEl && nextM.progressRatio !== undefined) barEl.style.width = `${Math.round(nextM.progressRatio * 100)}%`;
      if (nameEl && nextM.name) nameEl.textContent = nextM.name;
    }
  }

  async refreshUserStats(targetUserId = null) {
    try {
      const data = await window.apiClient.getStats(targetUserId);
      if (!data || !data.stats) return;

      // If refreshing local player, update currentUser
      if (!targetUserId || (this.currentUser && String(targetUserId) === String(this.currentUser.id))) {
        if (this.currentUser) {
          this.currentUser.stats = data.stats;
          this.currentUser.progression = data.progression;
        }
      }

      this.updateStatsDisplay(data.stats, data.progression);
    } catch (e) {
      console.warn('Could not refresh stats:', e);
    }
  }

  navigateTo(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`screen-${screenId}`);
    if (target) {
      target.classList.add('active');
      this.currentScreen = screenId;
      target.scrollTop = 0;
    }

    if (screenId === 'main-menu') {
      this.refreshUserStats();
    } else if (screenId === 'skins') {
      this.loadSkinsCatalog();
    } else if (screenId === 'achievements') {
      this.loadAchievements();
    } else if (screenId === 'friends') {
      this.loadFriendsRoster();
    }

    if (screenId !== 'gameplay') {
      this.hideCountdownDisplay();
    }
  }

  setAuthTab(tab) {
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  }

  async handleLogin(e) {
    e.preventDefault();
    const ident = document.getElementById('login-identifier').value;
    const pass = document.getElementById('login-password').value;

    try {
      const res = await window.apiClient.login(ident, pass);
      this.showToast(`Welcome back, ${res.user.username}!`);
      this.setCurrentUser(res.user);
      this.navigateTo('main-menu');
    } catch (err) {
      this.showToast(err.message, 'danger');
    }
  }

  async handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;

    try {
      const res = await window.apiClient.register(username, email, pass);
      this.showToast(`Account created! Welcome, ${res.user.username}!`);
      this.setCurrentUser(res.user);
      this.navigateTo('main-menu');
    } catch (err) {
      this.showToast(err.message, 'danger');
    }
  }

  async quickLogin(username, password) {
    try {
      const res = await window.apiClient.login(username, password);
      this.showToast(`Logged in as ${username}`);
      this.setCurrentUser(res.user);
      this.navigateTo('main-menu');
    } catch (err) {
      // If doesn't exist, register it automatically
      try {
        const regRes = await window.apiClient.register(username, `${username.toLowerCase()}@vortex.test`, password);
        this.showToast(`Registered & logged in as ${username}`);
        this.setCurrentUser(regRes.user);
        this.navigateTo('main-menu');
      } catch (regErr) {
        this.showToast(regErr.message, 'danger');
      }
    }
  }

  async playAsGuest(targetMode = 'online') {
    try {
      if (!this.currentUser) {
        const res = await window.apiClient.playAsGuest();
        this.setCurrentUser(res.user);
        this.showToast(`🎮 Guest session ready: ${res.user.username}`);
      }

      this.navigateTo('main-menu');

      if (targetMode === 'vs_ai') {
        this.openSinglePlayerModal(false);
      } else if (targetMode === 'practice') {
        this.openSinglePlayerModal(true);
      }
    } catch (err) {
      console.error('Guest play failed:', err);
      this.showToast('Unable to launch guest session: ' + err.message, 'danger');
    }
  }

  scrollToAuth(tab = 'login') {
    this.setAuthTab(tab);
    const card = document.getElementById('landing-auth-card');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async handleLogout() {
    const wasGuest = Boolean(
      this.currentUser &&
      (this.currentUser.isGuest ||
       (this.currentUser.username && this.currentUser.username.startsWith('Guest_')))
    );

    try {
      if (window.apiClient) {
        await window.apiClient.logout();
      }
    } catch (err) {
      console.warn('[App] Logout error:', err);
    }

    if (window.netClient) {
      window.netClient.disconnect();
    }
    if (window.apiClient) {
      window.apiClient.setToken(null);
    }

    // Clean up browser session and guest-specific storage
    localStorage.removeItem('vortex_token');
    sessionStorage.clear();

    this.currentUser = null;
    this.navigateTo('auth');
    this.showToast(wasGuest ? 'Guest session ended & data purged' : 'Logged out');
  }

  // =========================================================================
  // MATCHMAKING & LOBBY
  // =========================================================================

  startMatchmaking() {
    this.navigateTo('matchmaking');
    this.matchmakingElapsed = 0;
    const timerEl = document.getElementById('matchmaking-timer');

    if (this.matchmakingTimer) clearInterval(this.matchmakingTimer);
    this.matchmakingTimer = setInterval(() => {
      this.matchmakingElapsed++;
      const mins = String(Math.floor(this.matchmakingElapsed / 60)).padStart(2, '0');
      const secs = String(this.matchmakingElapsed % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);

    window.netClient.findMatch('ffa');
  }

  cancelMatchmaking() {
    if (this.matchmakingTimer) clearInterval(this.matchmakingTimer);
    window.netClient.leaveRoom();
    this.navigateTo('main-menu');
  }

  openCreateRoomModal() {
    const modal = document.getElementById('modal-create-room');
    if (!modal) {
      this.openMapSelectModal('browse');
      return;
    }

    const nameMap = {
      house: 'Suburban Estate',
      farm: 'Golden Valley Farm',
      forest: 'Whispering Pines',
      minecraft: 'BlockCraft Realm',
      cruise: 'S.S. Oceanic',
      sector7: 'Sector-7 Compound'
    };

    const mapId = this.selectedMapId || 'house';
    const username = this.currentUser ? this.currentUser.username : 'Operative';
    const defaultName = `${username}'s Arena`;

    const nameInput = document.getElementById('custom-room-name-input');
    if (nameInput) nameInput.value = defaultName;

    const mapSelect = document.getElementById('custom-room-map-select');
    if (mapSelect) mapSelect.value = mapId;

    this.customRoomConfig = {
      mode: 'ffa',
      isPrivate: true,
      mapId: mapId
    };

    this.setCustomRoomMode('ffa');
    this.setCustomRoomPrivacy(true);

    modal.style.display = 'flex';
  }

  closeCreateRoomModal() {
    const modal = document.getElementById('modal-create-room');
    if (modal) modal.style.display = 'none';
  }

  browseMapsFromHostModal() {
    this.closeCreateRoomModal();
    this.openMapSelectModal('browse');
  }

  onCustomRoomMapChange(mapId) {
    this.selectMap(mapId);
    if (this.customRoomConfig) this.customRoomConfig.mapId = mapId;
  }

  setCustomRoomMode(mode) {
    if (!this.customRoomConfig) this.customRoomConfig = {};
    this.customRoomConfig.mode = mode;
    const ffaBtn = document.getElementById('custom-mode-ffa');
    const tdmBtn = document.getElementById('custom-mode-tdm');
    if (ffaBtn) ffaBtn.classList.toggle('active', mode === 'ffa');
    if (tdmBtn) tdmBtn.classList.toggle('active', mode === 'tdm');
  }

  setCustomRoomPrivacy(isPrivate) {
    if (!this.customRoomConfig) this.customRoomConfig = {};
    this.customRoomConfig.isPrivate = Boolean(isPrivate);
    const privBtn = document.getElementById('custom-privacy-private');
    const pubBtn = document.getElementById('custom-privacy-public');
    if (privBtn) privBtn.classList.toggle('active', Boolean(isPrivate));
    if (pubBtn) pubBtn.classList.toggle('active', !isPrivate);
  }

  async confirmHostCustomMatch() {
    const nameMap = {
      house: 'Suburban Estate',
      farm: 'Golden Valley Farm',
      forest: 'Whispering Pines',
      minecraft: 'BlockCraft Realm',
      cruise: 'S.S. Oceanic',
      sector7: 'Sector-7 Compound'
    };

    const nameInput = document.getElementById('custom-room-name-input');
    const mapSelect = document.getElementById('custom-room-map-select');

    const mapId = (mapSelect && mapSelect.value) || this.selectedMapId || 'house';
    const mapName = nameMap[mapId] || 'Suburban Estate';
    const username = this.currentUser ? this.currentUser.username : 'Operative';
    const roomName = (nameInput && nameInput.value.trim()) || `${username}'s ${mapName}`;
    const mode = (this.customRoomConfig && this.customRoomConfig.mode) || 'ffa';
    const isPrivate = this.customRoomConfig ? Boolean(this.customRoomConfig.isPrivate) : true;

    this.showToast(`🛡️ Creating custom arena on ${mapName}...`);

    const confirmBtn = document.getElementById('btn-confirm-create-room');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '⏳ Creating Arena...';
    }

    try {
      let res = await window.netClient.createRoom(roomName, isPrivate, mode, mapId);
      if (!res.success && res.error === 'Authentication required') {
        const token = window.apiClient ? window.apiClient.token : localStorage.getItem('vortex_token');
        if (token) {
          await window.netClient.ensureAuthenticated(3000);
          res = await window.netClient.createRoom(roomName, isPrivate, mode, mapId);
        }
      }

      if (res && res.success) {
        this.closeCreateRoomModal();
        this.closeMapSelectModal();
        this.navigateTo('lobby');
        this.showToast(`🛡️ Custom arena ready on ${mapName}!`);
      } else {
        const errMsg = (res && res.error) || 'Unable to create match arena';
        this.showToast(errMsg, 'danger');
      }
    } catch (e) {
      console.error('[App] createRoom error:', e);
      this.showToast('Error creating custom room: ' + e.message, 'danger');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '🚀 Launch Custom Lobby';
      }
    }
  }

  openJoinCodeModal() {
    const modal = document.getElementById('modal-join-room');
    if (!modal) {
      const code = prompt('Enter 6-character Room Code:');
      if (code) window.netClient.joinRoom(code.toUpperCase().trim());
      return;
    }
    const input = document.getElementById('join-room-code-input');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }
    modal.style.display = 'flex';
  }

  closeJoinCodeModal() {
    const modal = document.getElementById('modal-join-room');
    if (modal) modal.style.display = 'none';
  }

  async confirmJoinRoomByCode() {
    const input = document.getElementById('join-room-code-input');
    const code = input ? input.value.trim().toUpperCase() : '';
    if (!code || code.length < 4) {
      this.showToast('Please enter a valid room code (e.g. ABC123)', 'danger');
      return;
    }
    this.showToast(`Joining room ${code}...`);
    const res = await window.netClient.joinRoom(code);
    if (res && res.success) {
      this.closeJoinCodeModal();
      this.navigateTo('lobby');
    } else {
      this.showToast((res && res.error) || 'Failed to join room', 'danger');
    }
  }

  openMobileDownloadModal() {
    const el = document.getElementById('modal-mobile-download');
    if (el) el.style.display = 'flex';
  }

  closeMobileDownloadModal() {
    const el = document.getElementById('modal-mobile-download');
    if (el) el.style.display = 'none';
  }

  openAboutCreatorModal() {
    const el = document.getElementById('modal-about-creator');
    if (el) el.style.display = 'flex';
  }

  closeAboutCreatorModal() {
    const el = document.getElementById('modal-about-creator');
    if (el) el.style.display = 'none';
  }

  // =========================================================================
  // MAP SELECTION & ENVIRONMENTS BROWSER
  // =========================================================================

  openMapSelectModal(context = 'browse') {
    this.mapModalContext = context; // 'browse', 'lobby', 'singleplayer'
    const modal = document.getElementById('modal-map-selection');
    if (!modal) return;

    const targetMapId = (context === 'lobby' && this.currentRoom && this.currentRoom.mapId)
      ? this.currentRoom.mapId
      : (this.selectedMapId || 'house');
    this.selectMap(targetMapId);

    const subtitle = document.getElementById('map-modal-subtitle');
    const footerBar = document.getElementById('map-modal-footer-bar');
    if (subtitle) {
      if (context === 'lobby') {
        subtitle.textContent = 'Room Host: Choose the map for this match. All connected players and late joiners will synchronize to this map.';
      } else if (context === 'singleplayer') {
        subtitle.textContent = 'Select which environment to battle AI bots or practice in.';
      } else {
        subtitle.textContent = 'Browse the 6 distinct combat environments. Select to preview, play vs AI, or host a custom match.';
      }
    }

    if (footerBar) {
      footerBar.style.display = (context === 'lobby') ? 'none' : 'flex';
    }

    modal.style.display = 'flex';
  }

  closeMapSelectModal() {
    const modal = document.getElementById('modal-map-selection');
    if (modal) modal.style.display = 'none';
  }

  selectMap(mapId) {
    this.selectedMapId = mapId;
    document.querySelectorAll('.map-card').forEach(el => el.classList.remove('selected'));
    const targetCard = document.getElementById(`map-card-${mapId}`);
    if (targetCard) targetCard.classList.add('selected');

    const nameMap = {
      house: 'Suburban Estate',
      farm: 'Golden Valley Farm',
      forest: 'Whispering Pines',
      minecraft: 'BlockCraft Realm',
      cruise: 'S.S. Oceanic',
      sector7: 'Sector-7 Compound'
    };

    const labelEl = document.getElementById('map-modal-selected-name');
    if (labelEl) labelEl.textContent = nameMap[mapId] || 'Suburban Estate';

    if (this.mapModalContext === 'lobby' && this.currentRoom && this.currentUser && String(this.currentRoom.hostUserId) === String(this.currentUser.id)) {
      window.netClient.setMap(mapId);
    }

    const spMapSelect = document.getElementById('sp-map-select');
    if (spMapSelect) spMapSelect.value = mapId;

    const customMapSelect = document.getElementById('custom-room-map-select');
    if (customMapSelect) customMapSelect.value = mapId;
  }

  confirmMapChoice(mapId) {
    this.selectMap(mapId);
    if (this.mapModalContext === 'lobby') {
      this.closeMapSelectModal();
      this.showToast(`Selected map set to ${mapId}!`);
    } else if (this.mapModalContext === 'singleplayer') {
      this.closeMapSelectModal();
    }
  }

  launchAiOnSelectedMap() {
    this.closeMapSelectModal();
    this.spConfig.mapId = this.selectedMapId || 'house';
    const spSelect = document.getElementById('sp-map-select');
    if (spSelect) spSelect.value = this.spConfig.mapId;
    this.openSinglePlayerModal(false);
  }

  async launchHostOnSelectedMap() {
    const mapId = this.selectedMapId || 'house';
    const nameMap = {
      house: 'Suburban Estate',
      farm: 'Golden Valley Farm',
      forest: 'Whispering Pines',
      minecraft: 'BlockCraft Realm',
      cruise: 'S.S. Oceanic',
      sector7: 'Sector-7 Compound'
    };
    const mapName = nameMap[mapId] || 'Suburban Estate';
    const username = this.currentUser ? this.currentUser.username : 'Operative';
    const defaultName = `${username}'s ${mapName}`;

    this.showToast(`🛡️ Creating custom arena on ${mapName}...`);

    const hostBtn = document.getElementById('btn-host-match-modal');
    if (hostBtn) {
      hostBtn.disabled = true;
      hostBtn.textContent = '⏳ Creating...';
    }

    try {
      const res = await window.netClient.createRoom(defaultName, true, 'ffa', mapId);
      if (res && res.success) {
        this.closeMapSelectModal();
        this.closeCreateRoomModal();
        this.navigateTo('lobby');
        this.showToast(`🛡️ Custom arena ready on ${mapName}!`);
      } else {
        const errMsg = (res && res.error) || 'Unable to create match arena';
        this.showToast(errMsg, 'danger');
      }
    } catch (err) {
      console.error('[App] launchHostOnSelectedMap error:', err);
      this.showToast('Error creating custom match: ' + err.message, 'danger');
    } finally {
      if (hostBtn) {
        hostBtn.disabled = false;
        hostBtn.textContent = '🛡️ Host Match';
      }
    }
  }

  updateLobbyMapDisplay(mapId, mapName) {
    const iconMap = {
      house: '🏡',
      farm: '🚜',
      forest: '🌲',
      minecraft: '🧱',
      cruise: '🚢',
      sector7: '🏢'
    };
    const nameMap = {
      house: 'Suburban Estate',
      farm: 'Golden Valley Farm',
      forest: 'Whispering Pines',
      minecraft: 'BlockCraft Realm',
      cruise: 'S.S. Oceanic',
      sector7: 'Sector-7 Compound'
    };

    const iconEl = document.getElementById('lobby-active-map-icon');
    const nameEl = document.getElementById('lobby-active-map-name');
    if (iconEl) iconEl.textContent = iconMap[mapId] || '🗺️';
    if (nameEl) nameEl.textContent = mapName || nameMap[mapId] || 'Suburban Estate';

    const changeMapBtn = document.getElementById('btn-lobby-change-map');
    if (changeMapBtn) {
      const isHost = Boolean(this.currentRoom && this.currentUser && String(this.currentRoom.hostUserId) === String(this.currentUser.id));
      changeMapBtn.style.display = isHost ? 'inline-flex' : 'none';
    }
  }

  // =========================================================================
  // SINGLE PLAYER VS COMPUTER & PRACTICE MODE SETUP
  // =========================================================================

  openSinglePlayerModal(isPractice = false) {
    const modal = document.getElementById('modal-singleplayer-setup');
    if (!modal) return;

    this.spConfig.isPractice = Boolean(isPractice);
    this.setSpMode(isPractice ? 'practice' : (this.spConfig.mode === 'practice' ? 'ffa' : this.spConfig.mode));
    this.setSpDifficulty(this.spConfig.difficulty || 'medium');
    this.onSpBotCountChange(this.spConfig.botCount || 5);

    const titleEl = document.getElementById('sp-modal-title');
    const descEl = document.getElementById('sp-modal-desc');
    if (titleEl) {
      titleEl.innerHTML = isPractice ? '🎯 Practice / Target Training' : '🤖 Play vs Computer (Single Player)';
    }
    if (descEl) {
      descEl.textContent = isPractice 
        ? 'Instant respawn aim training sandbox with bots. Practice mechanics and test weapons.'
        : 'Fight against tactical computer-controlled AI bots with difficulty scaling and milestone progression.';
    }

    modal.style.display = 'flex';
  }

  closeSinglePlayerModal() {
    const modal = document.getElementById('modal-singleplayer-setup');
    if (modal) modal.style.display = 'none';
  }

  setSpMode(mode) {
    this.spConfig.mode = mode;
    this.spConfig.isPractice = (mode === 'practice');

    document.querySelectorAll('.btn-mode-pill').forEach(el => el.classList.remove('active'));
    const activeBtn = document.getElementById(`sp-mode-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');

    const scoreSelect = document.getElementById('sp-score-select');
    if (scoreSelect) {
      if (mode === 'practice') {
        scoreSelect.value = '999';
      } else if (scoreSelect.value === '999') {
        scoreSelect.value = '25';
      }
    }
  }

  setSpDifficulty(diff) {
    this.spConfig.difficulty = diff;

    document.querySelectorAll('.btn-diff-pill').forEach(el => el.classList.remove('active'));
    const activeBtn = document.getElementById(`sp-diff-${diff}`);
    if (activeBtn) activeBtn.classList.add('active');

    const descMap = {
      easy: 'Recruit AI: 550ms reaction time, relaxed aim accuracy, limited tactical movement. Great for beginners.',
      medium: 'Veteran AI: 320ms reaction time, steady pursuit, cover seeking, and balanced firearm accuracy.',
      hard: 'Elite AI: 180ms reaction time, dynamic strafing, rapid target acquisition, and tactical weapon switching.',
      expert: 'Nightmare AI: 90ms lightning reactions, pinpoint accuracy, advanced cover maneuvers, and relentless aggression.'
    };

    const infoEl = document.getElementById('sp-diff-info');
    if (infoEl) infoEl.textContent = descMap[diff] || descMap.medium;
  }

  onSpBotCountChange(count) {
    const val = parseInt(count, 10);
    this.spConfig.botCount = val;

    const slider = document.getElementById('sp-bots-slider');
    if (slider) slider.value = val;

    const badge = document.getElementById('sp-bots-count-badge');
    if (badge) {
      badge.textContent = `${val} ${val === 1 ? 'Bot' : 'Bots'} (Total: ${val + 1} / 12 Combatants)`;
    }
  }

  startSinglePlayerMatch() {
    const mapSelect = document.getElementById('sp-map-select');
    const scoreSelect = document.getElementById('sp-score-select');
    const durSelect = document.getElementById('sp-duration-select');

    const botCount = this.spConfig.botCount || 5;
    const difficulty = this.spConfig.difficulty || 'medium';
    const isPractice = this.spConfig.mode === 'practice';
    const gameMode = isPractice ? 'ffa' : (this.spConfig.mode || 'ffa');
    const scoreLimit = scoreSelect ? parseInt(scoreSelect.value, 10) : 25;
    const matchDuration = durSelect ? parseInt(durSelect.value, 10) : 300;
    const mapId = mapSelect ? mapSelect.value : (this.selectedMapId || 'house');

    const nameMap = {
      house: 'Suburban Estate',
      farm: 'Golden Valley Farm',
      forest: 'Whispering Pines',
      minecraft: 'BlockCraft Realm',
      cruise: 'S.S. Oceanic',
      sector7: 'Sector-7 Compound'
    };
    const mapName = nameMap[mapId] || 'Suburban Estate';

    this.lastMatchConfig = {
      botCount,
      difficulty,
      isPractice,
      gameMode,
      scoreLimit,
      matchDuration,
      mapId,
      mapName
    };

    this.closeSinglePlayerModal();
    this.showToast(`Deploying into ${mapName} vs ${difficulty.toUpperCase()} AI...`);

    window.netClient.createAiMatch(this.lastMatchConfig);
  }

  rematchAi() {
    if (!this.lastMatchConfig) {
      this.openSinglePlayerModal();
      return;
    }

    const nameMap = {
      house: 'Suburban Estate',
      farm: 'Golden Valley Farm',
      forest: 'Whispering Pines',
      minecraft: 'BlockCraft Realm',
      cruise: 'S.S. Oceanic',
      sector7: 'Sector-7 Compound'
    };
    const mapName = nameMap[this.lastMatchConfig.mapId] || 'Suburban Estate';
    this.showToast(`Starting AI Rematch on ${mapName}...`);
    window.netClient.createAiMatch(this.lastMatchConfig);
  }

  startLobbyMatch() {
    window.netClient.startMatch();
  }

  leaveLobby() {
    window.netClient.leaveRoom();
    this.navigateTo('main-menu');
  }

  copyRoomCode() {
    if (this.currentRoom && this.currentRoom.code) {
      navigator.clipboard.writeText(this.currentRoom.code);
      this.showToast(`Room code ${this.currentRoom.code} copied!`);
    }
  }

  renderLobbySlots(players = []) {
    const container = document.getElementById('lobby-slots-container');
    if (!container) return;
    container.innerHTML = '';

    const maxSlots = 12; // STRICT 12 PLAYERS

    for (let i = 0; i < maxSlots; i++) {
      const p = players[i];
      const slotDiv = document.createElement('div');
      slotDiv.className = `player-slot ${p ? 'occupied' : ''}`;

      if (p) {
        slotDiv.innerHTML = `
          <div style="font-weight: 800; font-size: 15px; color: #fff;">${p.username}</div>
          <div style="font-size: 11px; color: var(--cyan-glow); margin: 4px 0;">${p.isHost ? '👑 HOST' : 'OPERATIVE'}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${p.characterSkin ? p.characterSkin.name || 'Default' : 'Default'}</div>
        `;
      } else {
        slotDiv.innerHTML = `
          <div style="font-size: 13px; color: var(--text-dark); font-weight: 700;">SLOT ${i + 1}</div>
          <div style="font-size: 11px; color: var(--text-dark);">[ OPEN ]</div>
        `;
      }
      container.appendChild(slotDiv);
    }

    // Capacity pill
    const capEl = document.getElementById('lobby-capacity-pill');
    if (capEl) capEl.textContent = `${players.length} / 12 PLAYERS`;

    // Host controls enabled only if current user is the authoritative host
    const isHost = Boolean(this.currentRoom && this.currentUser && String(this.currentRoom.hostUserId) === String(this.currentUser.id));
    const startBtn = document.getElementById('btn-start-match');
    if (startBtn) {
      startBtn.style.display = isHost ? 'inline-flex' : 'none';
    }

    const changeMapBtn = document.getElementById('btn-lobby-change-map');
    if (changeMapBtn) {
      changeMapBtn.style.display = isHost ? 'inline-flex' : 'none';
    }
  }

  // =========================================================================
  // GAMEPLAY ENGINE INTEGRATION & HUD
  // =========================================================================

  enterGameplay(matchData) {
    this.navigateTo('gameplay');
    this.currentMatchInfo = matchData || {};

    const activeMapId = (matchData && matchData.mapId) || (this.currentRoom && this.currentRoom.mapId) || this.spConfig.mapId || 'house';
    const mapNames = {
      house: 'Suburban Estate',
      farm: 'Golden Valley Farm',
      forest: 'Whispering Pines',
      minecraft: 'BlockCraft Realm',
      cruise: 'S.S. Oceanic',
      sector7: 'Sector-7 Compound'
    };
    const mapName = (matchData && matchData.map && matchData.map.name) || mapNames[activeMapId] || 'Suburban Estate';

    // Update HUD Mode, Target, and AI Difficulty Badge
    const modeLabel = document.getElementById('hud-mode-label');
    const scoreTarget = document.getElementById('hud-score-target');
    const aiBadge = document.getElementById('hud-ai-badge');
    const kCount = document.getElementById('hud-kills-count');
    const dCount = document.getElementById('hud-deaths-count');

    if (kCount) kCount.textContent = '0';
    if (dCount) dCount.textContent = '0';

    if (modeLabel) {
      if (this.currentMatchInfo.isPractice) {
        modeLabel.textContent = `PRACTICE - ${mapName.toUpperCase()}`;
      } else if (this.currentMatchInfo.isAiMatch) {
        const diff = (this.currentMatchInfo.aiDifficulty || 'medium').toUpperCase();
        const mode = (this.currentMatchInfo.gameMode || 'ffa').toUpperCase();
        modeLabel.textContent = `${mapName.toUpperCase()} • VS AI (${diff})`;
      } else {
        const mode = (this.currentMatchInfo.gameMode || 'ffa').toUpperCase();
        modeLabel.textContent = `${mapName.toUpperCase()} • 12P ${mode}`;
      }
    }

    if (scoreTarget) {
      if (this.currentMatchInfo.isPractice) {
        scoreTarget.textContent = 'Unlimited Sandbox • Instant Respawn';
      } else {
        scoreTarget.textContent = `First to ${this.currentMatchInfo.scoreLimit || 25} Kills`;
      }
    }

    if (aiBadge) {
      if (this.currentMatchInfo.isPractice) {
        aiBadge.style.display = 'inline-block';
        aiBadge.textContent = '🎯 PRACTICE SANDBOX';
        aiBadge.style.color = 'var(--emerald-green)';
        aiBadge.style.borderColor = 'rgba(0, 255, 136, 0.4)';
      } else if (this.currentMatchInfo.isAiMatch) {
        aiBadge.style.display = 'inline-block';
        const diff = (this.currentMatchInfo.aiDifficulty || 'medium').toUpperCase();
        aiBadge.textContent = `🤖 AI DIFFICULTY: ${diff}`;
        aiBadge.style.color = 'var(--cyan-glow)';
        aiBadge.style.borderColor = 'rgba(0, 240, 255, 0.4)';
      } else {
        aiBadge.style.display = 'none';
      }
    }

    if (!this.gameEngine) {
      const container = document.getElementById('game-viewport');
      if (container) {
        container.innerHTML = '';
      }
      this.gameEngine = new GameEngine(container);

      // Wire callbacks
      this.gameEngine.onShootCallback = (origin, dir) => {
        // Block shooting while in the countdown phase or initializing
        if (this.matchState === 'countdown' || this.matchState === 'initializing') {
          if (window.soundEngine) window.soundEngine.playClick(window.soundEngine.ctx ? window.soundEngine.ctx.currentTime : 0, 420, 0.03);
          return;
        }

        // Block shooting while in the middle of a reload animation
        if (this.gameEngine && this.gameEngine.weaponView && this.gameEngine.weaponView.isReloading) {
          return;
        }

        const wep = this.weaponsState[this.activeWeaponId];
        if (!wep || wep.mag <= 0) {
          if (window.soundEngine) window.soundEngine.playClick(window.soundEngine.ctx ? window.soundEngine.ctx.currentTime : 0, 750, 0.04);
          // Auto-trigger reload on empty magazine if reserve bullets are available
          if (wep && wep.reserve > 0) {
            window.netClient.sendReload();
          }
          return;
        }

        window.netClient.sendShoot([origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z]);
        wep.mag--;
        this.updateHUDAmmo();
        this.gameEngine.weaponView.triggerRecoil(0.08);
        if (window.soundEngine) window.soundEngine.playShoot(this.activeWeaponId);

        // Local tracer
        const forward = dir.clone().multiplyScalar(60);
        const hitPoint = origin.clone().add(forward);
        this.gameEngine.particles.createBulletTracer(origin, hitPoint);
        this.gameEngine.particles.createMuzzleFlash(origin);
      };

      this.gameEngine.onReloadCallback = () => {
        window.netClient.sendReload();
      };

      this.gameEngine.onSwitchWeaponCallback = (wepId) => {
        this.switchActiveWeapon(wepId);
      };

      this.gameEngine.onScoreboardToggleCallback = (show) => {
        const board = document.getElementById('scoreboard-overlay');
        if (board) {
          board.classList.toggle('active', show);
          if (show && this.lastPlayersSnapshot) {
            this.updateScoreboard(this.lastPlayersSnapshot, true);
          }
        }
      };
    }

    this.gameEngine.loadMap(activeMapId);
    this.gameEngine.setLocalPlayer(this.currentUser.id, this.currentUser.equippedSkins);

    // Deterministically initialize player transform to authoritative spawn point immediately
    const localSnap = (matchData && matchData.players && this.currentUser)
      ? matchData.players.find(p => String(p.id) === String(this.currentUser.id))
      : null;
    if (localSnap && (localSnap.position || localSnap.pos)) {
      const spX = localSnap.position ? localSnap.position.x : localSnap.pos[0];
      const spY = localSnap.position ? (localSnap.position.y || 0) : (localSnap.pos[1] || 0);
      const spZ = localSnap.position ? localSnap.position.z : localSnap.pos[2];
      const spYaw = (localSnap.rotation && localSnap.rotation.yaw !== undefined) ? localSnap.rotation.yaw : (localSnap.rot ? localSnap.rot[0] : 0);
      this.gameEngine.setLocalSpawn(spX, spY, spZ, spYaw);
    } else if (matchData && matchData.spawnPoint) {
      this.gameEngine.setLocalSpawn(matchData.spawnPoint.x, matchData.spawnPoint.y || 0, matchData.spawnPoint.z, matchData.spawnPoint.yaw || 0);
    } else {
      const spawns = MapData.getSpawnPoints(activeMapId);
      if (spawns && spawns.length > 0) {
        this.gameEngine.setLocalSpawn(spawns[0].x, spawns[0].y || 0, spawns[0].z, spawns[0].yaw || 0);
      }
    }

    this.switchActiveWeapon('assault_rifle');
    this.updateHUDVitals(100, 50);

    // If matchData indicates respawn protection, activate HUD indicator
    if (matchData && (matchData.isInvulnerable || matchData.invulnerableSeconds)) {
      this.triggerRespawnProtection(matchData.invulnerableSeconds || 3.0);
    }

    // Check match start countdown (5 -> 4 -> 3 -> 2 -> 1 -> GO!)
    const countdownSecs = (matchData && matchData.countdownSeconds !== undefined)
      ? matchData.countdownSeconds
      : ((matchData && matchData.state === 'countdown') ? 5 : 0);

    if (countdownSecs > 0) {
      this.startCountdownDisplay(countdownSecs);
    } else {
      this.matchState = 'active';
      this.hideCountdownDisplay();
      if (window.soundEngine) window.soundEngine.playMatchStart();
    }
  }

  switchActiveWeapon(weaponId) {
    if (!this.weaponsState[weaponId]) return;
    this.activeWeaponId = weaponId;
    window.netClient.sendSwitchWeapon(weaponId);

    if (this.gameEngine) {
      this.gameEngine.weaponView.switchWeapon(weaponId);
    }

    // Update weapon pills
    const mapping = { assault_rifle: 'slot-1', sniper_rifle: 'slot-2', shotgun: 'slot-3', pistol: 'slot-4' };
    document.querySelectorAll('.weapon-slot-pill').forEach(el => el.classList.remove('active'));
    const targetPill = document.getElementById(mapping[weaponId]);
    if (targetPill) targetPill.classList.add('active');

    this.updateHUDAmmo();
  }

  cycleWeaponMobile() {
    const order = ['assault_rifle', 'sniper_rifle', 'shotgun', 'pistol'];
    const idx = order.indexOf(this.activeWeaponId);
    const nextWep = order[(idx + 1) % order.length];
    this.switchActiveWeapon(nextWep);
  }

  updateHUDVitals(hp, shield) {
    const hpNum = document.getElementById('hud-hp-num');
    const hpFill = document.getElementById('hud-hp-fill');
    const shNum = document.getElementById('hud-shield-num');
    const shFill = document.getElementById('hud-shield-fill');
    const vignette = document.getElementById('damage-vignette');

    if (hpNum) hpNum.textContent = Math.round(hp);
    if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    if (shNum) shNum.textContent = Math.round(shield);
    if (shFill) shFill.style.width = `${Math.max(0, Math.min(100, (shield / 50) * 100))}%`;

    if (vignette) {
      vignette.classList.toggle('critical', hp <= 30 && hp > 0);
    }
  }

  triggerRespawnProtection(durationSeconds = 3.0) {
    if (this.respawnShieldTimer) {
      clearInterval(this.respawnShieldTimer);
      this.respawnShieldTimer = null;
    }

    const badge = document.getElementById('respawn-shield-indicator');
    const timerEl = document.getElementById('respawn-shield-countdown');
    if (!badge) return;

    badge.style.display = 'flex';
    badge.classList.add('active');

    let remainingMs = Math.round(durationSeconds * 1000);
    if (timerEl) timerEl.textContent = `${(remainingMs / 1000).toFixed(1)}s`;

    const start = performance.now();
    this.respawnShieldTimer = setInterval(() => {
      const elapsed = performance.now() - start;
      const left = Math.max(0, remainingMs - elapsed);

      if (timerEl) timerEl.textContent = `${(left / 1000).toFixed(1)}s`;

      if (left <= 0) {
        clearInterval(this.respawnShieldTimer);
        this.respawnShieldTimer = null;
        badge.classList.remove('active');
        badge.style.display = 'none';
        this.showToast('⚔️ Shield Expired — Combat Engaged!');
      }
    }, 100);
  }

  startCountdownDisplay(seconds = 5) {
    this.matchState = 'countdown';
    this.countdownSecondsRemaining = Math.max(1, Math.round(seconds));

    const overlay = document.getElementById('match-countdown-overlay');
    const badgeText = document.getElementById('match-countdown-badge-text');
    const subtitle = document.getElementById('match-countdown-subtitle');
    const numEl = document.getElementById('match-countdown-number');
    const card = overlay ? overlay.querySelector('.match-countdown-card') : null;

    if (!overlay || !numEl) return;

    if (card) card.classList.remove('active-go');
    overlay.classList.remove('fade-out');
    overlay.style.display = 'flex';

    if (badgeText) badgeText.textContent = 'TACTICAL DEPLOYMENT';
    if (subtitle) subtitle.textContent = 'GET READY!';

    numEl.textContent = String(this.countdownSecondsRemaining);
    numEl.className = 'match-countdown-number pop';

    if (window.soundEngine) {
      window.soundEngine.playCountdownBeep(false);
    }

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    this.countdownInterval = setInterval(() => {
      if (this.matchState !== 'countdown') {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        return;
      }

      this.countdownSecondsRemaining--;
      if (this.countdownSecondsRemaining > 0) {
        numEl.textContent = String(this.countdownSecondsRemaining);
        numEl.classList.remove('pop');
        void numEl.offsetWidth; // Force CSS DOM reflow to trigger pop animation
        numEl.classList.add('pop');
        if (window.soundEngine) window.soundEngine.playCountdownBeep(false);
      } else {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        this.triggerGoDisplay();
      }
    }, 1000);
  }

  syncCountdownTick(seconds) {
    if (this.matchState !== 'countdown') return;
    const numEl = document.getElementById('match-countdown-number');
    const rounded = Math.round(seconds);
    if (rounded <= 0) {
      this.triggerGoDisplay();
      return;
    }

    if (this.countdownSecondsRemaining !== rounded) {
      this.countdownSecondsRemaining = rounded;
      if (numEl) {
        numEl.textContent = String(rounded);
        numEl.classList.remove('pop');
        void numEl.offsetWidth;
        numEl.classList.add('pop');
      }
      if (window.soundEngine) window.soundEngine.playCountdownBeep(false);
    }
  }

  triggerGoDisplay() {
    if (this.matchState === 'active') return;
    this.matchState = 'active';

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    const overlay = document.getElementById('match-countdown-overlay');
    const badgeText = document.getElementById('match-countdown-badge-text');
    const subtitle = document.getElementById('match-countdown-subtitle');
    const numEl = document.getElementById('match-countdown-number');
    const card = overlay ? overlay.querySelector('.match-countdown-card') : null;

    if (!overlay || !numEl) return;

    if (card) card.classList.add('active-go');
    if (badgeText) badgeText.textContent = 'COMBAT ACTIVE';
    if (subtitle) subtitle.textContent = 'ALL WEAPONS FREE';

    numEl.textContent = 'GO!';
    numEl.className = 'match-countdown-number go pop';

    if (window.soundEngine) {
      window.soundEngine.playCountdownBeep(true);
    }

    // Smoothly fade out the countdown overlay after 1.2s
    if (this.countdownFadeTimer) clearTimeout(this.countdownFadeTimer);
    this.countdownFadeTimer = setTimeout(() => {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.style.display = 'none';
        overlay.classList.remove('fade-out');
        if (numEl) numEl.classList.remove('go', 'pop');
        if (card) card.classList.remove('active-go');
      }, 400);
    }, 1200);
  }

  hideCountdownDisplay() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.countdownFadeTimer) {
      clearTimeout(this.countdownFadeTimer);
      this.countdownFadeTimer = null;
    }
    const overlay = document.getElementById('match-countdown-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.classList.remove('fade-out');
    }
  }

  updateHUDAmmo() {
    const wep = this.weaponsState[this.activeWeaponId];
    if (!wep) return;

    const nameEl = document.getElementById('hud-weapon-name');
    const curEl = document.getElementById('hud-ammo-current');
    const resEl = document.getElementById('hud-ammo-reserve');

    if (nameEl && nameEl.textContent !== wep.name) nameEl.textContent = wep.name;
    if (curEl && curEl.textContent != wep.mag) curEl.textContent = wep.mag;
    if (resEl) {
      const resStr = `/ ${wep.reserve}`;
      if (resEl.textContent !== resStr) resEl.textContent = resStr;
    }
  }

  showHitmarker(isHeadshot = false) {
    const marker = document.getElementById('hitmarker');
    if (!marker) return;

    marker.className = isHeadshot ? 'show headshot' : 'show';
    if (window.soundEngine) window.soundEngine.playHitmarker(isHeadshot);

    setTimeout(() => {
      marker.className = '';
    }, 120);
  }

  addKillfeedItem(killer, victim, weaponName, isHeadshot) {
    const feed = document.getElementById('killfeed');
    if (!feed) return;

    const item = document.createElement('div');
    item.className = `killfeed-item ${isHeadshot ? 'headshot' : ''}`;
    item.innerHTML = `
      <span class="killfeed-killer">${killer}</span>
      <span class="killfeed-weapon">[${weaponName}${isHeadshot ? ' 💥 HEADSHOT' : ''}]</span>
      <span class="killfeed-victim">${victim}</span>
    `;
    feed.prepend(item);

    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 5000);
  }

  showEliminationBanner(victimName, isHeadshot) {
    const banner = document.getElementById('elimination-banner');
    const title = document.getElementById('banner-title');
    const sub = document.getElementById('banner-subtitle');
    if (!banner) return;

    title.textContent = isHeadshot ? 'HEADSHOT ELIMINATION' : 'ENEMY ELIMINATED';
    title.style.color = isHeadshot ? 'var(--crimson-red)' : 'var(--emerald-green)';
    sub.textContent = victimName;

    banner.classList.add('show');
    if (window.soundEngine) window.soundEngine.playKill();

    setTimeout(() => {
      banner.classList.remove('show');
    }, 2200);
  }

  // =========================================================================
  // NETWORK EVENT ROUTER
  // =========================================================================

  setupNetworkListeners() {
    const net = window.netClient;

    net.on('room_joined', (data) => {
      if (this.matchmakingTimer) clearInterval(this.matchmakingTimer);
      this.currentRoom = data.room;

      // Close all modals so user enters lobby smoothly
      this.closeMapSelectModal();
      this.closeCreateRoomModal();
      this.closeJoinCodeModal();

      const titleEl = document.getElementById('lobby-title');
      const codeEl = document.getElementById('lobby-room-code');
      if (titleEl) titleEl.textContent = data.room.name;
      if (codeEl) codeEl.textContent = data.room.code;

      if (data.room && data.room.mapId) {
        this.selectedMapId = data.room.mapId;
        this.updateLobbyMapDisplay(data.room.mapId, data.room.mapName);
      }

      this.navigateTo('lobby');
    });

    net.on('join_error', (data) => {
      this.showToast(data.message || 'Unable to join custom match', 'danger');
    });

    net.on('error', (data) => {
      if (data && data.message === 'Authentication required') {
        const token = window.apiClient ? window.apiClient.token : localStorage.getItem('vortex_token');
        if (token) {
          window.netClient.send('auth', { token });
        }
      } else if (data && data.message) {
        this.showToast(data.message, 'danger');
      }
    });

    net.on('map_error', (data) => {
      this.showToast(data.message || 'Unable to change map', 'danger');
    });

    net.on('lobby_updated', (data) => {
      this.currentRoom = data.room;
      this.renderLobbySlots(data.players);
      if (data.room && data.room.mapId) {
        this.selectedMapId = data.room.mapId;
        this.updateLobbyMapDisplay(data.room.mapId, data.room.mapName);
      }
    });

    net.on('map_changed', (data) => {
      if (this.currentRoom) {
        this.currentRoom.mapId = data.mapId;
      }
      this.selectedMapId = data.mapId;
      this.updateLobbyMapDisplay(data.mapId, data.map ? data.map.name : null);
      this.showToast(`🗺️ Host changed battleground map to ${data.map ? data.map.name : data.mapId}!`);
    });

    net.on('match_countdown_started', (data) => {
      const statusEl = document.getElementById('lobby-status-msg');
      if (statusEl) statusEl.textContent = `Match starting in ${data.countdownSeconds}s!`;
      this.showToast(`Match starting in ${data.countdownSeconds}s!`);
      if (this.matchState === 'countdown') {
        this.syncCountdownTick(data.countdownSeconds);
      }
    });

    net.on('match_countdown_tick', (data) => {
      const statusEl = document.getElementById('lobby-status-msg');
      if (statusEl) statusEl.textContent = `Match starting in ${data.countdownSeconds}s!`;
      if (this.matchState === 'countdown') {
        this.syncCountdownTick(data.countdownSeconds);
      }
    });

    net.on('match_active', (data) => {
      this.triggerGoDisplay();
    });

    net.on('match_started', (data) => {
      this.enterGameplay(data);
    });

    net.on('state_tick', (data) => {
      this.lastPlayersSnapshot = data.players;
      if (this.gameEngine) {
        this.gameEngine.syncRemotePlayers(data.players);
      }

      // Synchronize match countdown state for late joiners or live sync
      if (data.state === 'countdown' && data.countdownSeconds !== undefined) {
        if (this.matchState !== 'countdown' && this.currentScreen === 'gameplay') {
          this.startCountdownDisplay(data.countdownSeconds);
        } else if (this.matchState === 'countdown') {
          this.syncCountdownTick(data.countdownSeconds);
        }
      } else if (data.state === 'active' && this.matchState === 'countdown') {
        this.triggerGoDisplay();
      }

      // Update match timer display
      const timerEl = document.getElementById('hud-timer');
      if (timerEl && data.timeRemaining !== undefined) {
        const mins = String(Math.floor(data.timeRemaining / 60)).padStart(2, '0');
        const secs = String(data.timeRemaining % 60).padStart(2, '0');
        const formatted = `${mins}:${secs}`;
        if (timerEl.textContent !== formatted) timerEl.textContent = formatted;
      }

      // Update local HUD kills & deaths display live
      if (data.players && this.currentUser) {
        const localSnap = data.players.find(p => String(p.id) === String(this.currentUser.id));
        if (localSnap) {
          const kEl = document.getElementById('hud-kills-count');
          const dEl = document.getElementById('hud-deaths-count');
          if (kEl && kEl.textContent !== String(localSnap.kills)) kEl.textContent = localSnap.kills;
          if (dEl && dEl.textContent !== String(localSnap.deaths)) dEl.textContent = localSnap.deaths;

          // Server authoritative position reconciliation with sequence-matched prediction
          const snapPos = localSnap.pos ? { x: localSnap.pos[0], y: localSnap.pos[1], z: localSnap.pos[2] } : localSnap.position;
          if (snapPos && this.gameEngine && this.gameEngine.input && localSnap.alive && !this.gameEngine.isDead) {
            const inputPos = this.gameEngine.input.position;
            const ackSeq = localSnap.ackSeq;

            if (ackSeq && this.gameEngine.inputHistory && this.gameEngine.inputHistory.length > 0) {
              const histIdx = this.gameEngine.inputHistory.findIndex(h => h.seq === ackSeq);
              if (histIdx !== -1) {
                const hist = this.gameEngine.inputHistory[histIdx];
                const errX = snapPos.x - hist.x;
                const errZ = snapPos.z - hist.z;
                const errSq = errX * errX + errZ * errZ;

                if (errSq > 2.25) { // Severe desync > 1.5m (wall penetration rejection / boundary enforcement / server teleport)
                  this.gameEngine.input.setPosition(snapPos.x, (snapPos.y || 0) + 1.7, snapPos.z);
                  this.gameEngine.inputHistory = [];
                } else if (errSq > 0.04) { // Moderate drift (0.2m - 1.5m), smoothly bleed off discrepancy
                  inputPos.x += errX * 0.25;
                  inputPos.z += errZ * 0.25;
                }
                // Prune history entries up to this ackSeq
                this.gameEngine.inputHistory.splice(0, histIdx + 1);
              }
            } else {
              // Fallback if sequence is missing (e.g. initial spawn or teleportation)
              const distSq = (inputPos.x - snapPos.x) ** 2 + (inputPos.z - snapPos.z) ** 2;
              if (distSq > 16.0) { // Large teleportation / spawn alignment only (> 4m)
                this.gameEngine.input.setPosition(snapPos.x, (snapPos.y || 0) + 1.7, snapPos.z);
              }
            }
          }

          // Continuous authoritative ammo sync: ensure client never gets stuck in desync
          if (localSnap.ammo && this.weaponsState[this.activeWeaponId]) {
            const curWep = this.weaponsState[this.activeWeaponId];
            const isPlayingReload = this.gameEngine && this.gameEngine.weaponView && this.gameEngine.weaponView.isReloading;
            if (!isPlayingReload) {
              if (curWep.mag !== localSnap.ammo[0] || curWep.reserve !== localSnap.ammo[1]) {
                curWep.mag = localSnap.ammo[0];
                curWep.reserve = localSnap.ammo[1];
                this.updateHUDAmmo();
              }
            }
          }
        }
      }

      // Update Scoreboard table (only if visible to eliminate 30Hz DOM thrashing)
      this.updateScoreboard(data.players);
    });

    net.on('weapon_fired', (data) => {
      const wep = this.weaponsState[data.weaponId];
      if (wep) {
        wep.mag = data.ammoInMag;
        wep.reserve = data.reserveAmmo;
        this.updateHUDAmmo();
      }
    });

    net.on('remote_player_fired', (data) => {
      if (this.gameEngine) {
        const origin = new THREE.Vector3(data.origin[0], data.origin[1], data.origin[2]);
        const dir = new THREE.Vector3(data.dir[0], data.dir[1], data.dir[2]);
        const hitPoint = origin.clone().add(dir.multiplyScalar(60));
        this.gameEngine.particles.createBulletTracer(origin, hitPoint);
        this.gameEngine.particles.createMuzzleFlash(origin);
      }
      if (window.soundEngine) window.soundEngine.playShoot(data.weaponId);
    });

    net.on('hit_confirmed', (data) => {
      this.showHitmarker(data.isHeadshot);
      if (data.targetKilled) {
        this.showEliminationBanner(data.targetUsername, data.isHeadshot);
        this.refreshUserStats();
      }
    });

    net.on('damaged', (data) => {
      this.updateHUDVitals(data.health, data.shield);
      const vig = document.getElementById('damage-vignette');
      if (vig) {
        vig.classList.add('hit');
        setTimeout(() => vig.classList.remove('hit'), 150);
      }
      if (window.soundEngine) window.soundEngine.playDamage();
    });

    net.on('player_eliminated', (data) => {
      this.addKillfeedItem(data.killerUsername, data.victimUsername, data.weaponName, data.isHeadshot);

      if (this.currentUser && String(data.killerId) === String(this.currentUser.id)) {
        this.refreshUserStats();
      }

      if (this.currentUser && String(data.victimId) === String(this.currentUser.id)) {
        // Local player died: suspend network inputs and show respawn modal countdown
        if (this.gameEngine) {
          this.gameEngine.isDead = true;
        }

        if (this.respawnModalInterval) {
          clearInterval(this.respawnModalInterval);
          this.respawnModalInterval = null;
        }

        const modal = document.getElementById('respawn-modal');
        const countEl = document.getElementById('respawn-countdown-timer');
        const killerEl = document.getElementById('respawn-killer-text');
        if (modal) modal.classList.add('active');
        if (killerEl) killerEl.textContent = `Eliminated by ${data.killerUsername}`;

        let remaining = data.respawnCountdown || 3;
        if (countEl) countEl.textContent = remaining;

        this.respawnModalInterval = setInterval(() => {
          remaining--;
          if (countEl) countEl.textContent = remaining;
          if (remaining <= 0) {
            clearInterval(this.respawnModalInterval);
            this.respawnModalInterval = null;
            if (modal) modal.classList.remove('active');
          }
        }, 1000);
      }
    });

    net.on('player_respawned', (data) => {
      if (String(data.userId) === String(this.currentUser.id)) {
        if (this.gameEngine) {
          this.gameEngine.isDead = false;
        }

        if (this.respawnModalInterval) {
          clearInterval(this.respawnModalInterval);
          this.respawnModalInterval = null;
        }

        this.updateHUDVitals(data.health, data.shield);

        // Immediately close respawn modal if still open
        const modal = document.getElementById('respawn-modal');
        if (modal) modal.classList.remove('active');

        // Authoritatively restore full weapon loadout ammo on respawn
        if (data.weapons) {
          for (const [wepId, wData] of Object.entries(data.weapons)) {
            if (this.weaponsState[wepId]) {
              this.weaponsState[wepId].mag = wData.ammoInMag;
              this.weaponsState[wepId].reserve = wData.reserveAmmo;
            }
          }
        } else {
          const defaults = { assault_rifle: 30, sniper_rifle: 5, shotgun: 8, pistol: 15 };
          const maxRes = { assault_rifle: 240, sniper_rifle: 40, shotgun: 64, pistol: 120 };
          for (const [wepId, wep] of Object.entries(this.weaponsState)) {
            wep.mag = defaults[wepId] || 30;
            wep.reserve = maxRes[wepId] || 120;
          }
        }

        // Reset reload animation state on respawn
        if (this.gameEngine && this.gameEngine.weaponView) {
          this.gameEngine.weaponView.isReloading = false;
          this.gameEngine.weaponView.reloadProgress = 0;
        }
        this.updateHUDAmmo();

        // Deterministically position local player at spawn point at proper eye height
        if (this.gameEngine) {
          const spY = (data.position && data.position.y !== undefined) ? data.position.y : 0;
          const spYaw = (data.rotation && data.rotation.yaw !== undefined) ? data.rotation.yaw : 0;
          this.gameEngine.setLocalSpawn(data.position.x, spY, data.position.z, spYaw);
        }

        // Activate respawn protection HUD indicator
        if (data.isInvulnerable) {
          this.triggerRespawnProtection(data.invulnerableSeconds || 3.0);
        }
      }
    });

    net.on('reload_started', (data) => {
      if (this.gameEngine) {
        this.gameEngine.weaponView.triggerReload(data.durationMs / 1000);
      }
      if (window.soundEngine) window.soundEngine.playReload();
    });

    net.on('reload_finished', (data) => {
      const wep = this.weaponsState[data.weaponId];
      if (wep) {
        wep.mag = data.ammoInMag;
        wep.reserve = data.reserveAmmo;
        this.updateHUDAmmo();
      }
      if (this.gameEngine && this.gameEngine.weaponView) {
        this.gameEngine.weaponView.isReloading = false;
        this.gameEngine.weaponView.reloadProgress = 0;
      }
    });

    net.on('weapon_switched', (data) => {
      const wep = this.weaponsState[data.weaponId];
      if (wep) {
        wep.mag = data.ammoInMag;
        wep.reserve = data.reserveAmmo;
        this.updateHUDAmmo();
      }
      if (this.gameEngine && this.gameEngine.weaponView) {
        this.gameEngine.weaponView.isReloading = false;
        this.gameEngine.weaponView.reloadProgress = 0;
      }
    });

    net.on('ammo_harvested', (data) => {
      const wep = this.weaponsState[data.weaponId];
      if (wep) {
        wep.mag = data.ammoInMag;
        wep.reserve = data.reserveAmmo;
        this.updateHUDAmmo();
      }
      this.showToast('📦 Ammo Harvested (+1 Mag Reserve)', 'info');
    });

    net.on('combat_resupply', (data) => {
      this.showToast('⚡ Tactical Combat Resupply: Emergency ammo acquired!', 'info');
    });

    net.on('stats_updated', (data) => {
      if (data && data.lifetimeKills !== undefined) {
        const killsEl = document.getElementById('side-lifetime-kills');
        if (killsEl) killsEl.textContent = data.lifetimeKills;
        if (this.currentUser) {
          if (!this.currentUser.stats) this.currentUser.stats = {};
          this.currentUser.stats.lifetimeKills = data.lifetimeKills;
        }
        this.refreshUserStats();
      }
    });

    net.on('milestone_unlocked', (data) => {
      this.recentMilestoneReward = data.reward;
      this.showToast(`🎖️ REWARD UNLOCKED: ${data.reward.name}! (Kills: ${data.totalLifetimeKills})`, 'reward');
      if (window.soundEngine) window.soundEngine.playKill();
      this.refreshUserStats();
    });

    net.on('match_ended', (data) => {
      this.handleMatchEnded(data);
    });

    net.on('match_invitation_received', (data) => {
      const accept = confirm(`Squad invite from ${data.sender.username} to join ${data.roomName} (Room Code: ${data.roomCode})! Accept?`);
      if (accept) {
        window.netClient.joinRoom(data.roomCode);
      }
    });
  }

  updateScoreboard(players, force = false) {
    const board = document.getElementById('scoreboard-overlay');
    if (!force && (!board || !board.classList.contains('active'))) return;
    const tbody = document.getElementById('scoreboard-tbody');
    if (!tbody || !players) return;
    tbody.innerHTML = '';

    const sorted = [...players].sort((a, b) => b.score - a.score || b.kills - a.kills);

    sorted.forEach((p, idx) => {
      const isSelf = this.currentUser && String(p.id) === String(this.currentUser.id);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td style="font-weight: 700; color: ${isSelf ? 'var(--cyan-glow)' : '#fff'};">${p.username || 'Operative'}</td>
        <td style="color: var(--emerald-green);">${p.kills}</td>
        <td style="color: var(--crimson-red);">${p.deaths}</td>
        <td style="font-weight: 800; color: #fff;">${p.score}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  handleMatchEnded(data) {
    this.matchState = 'finished';
    this.hideCountdownDisplay();
    this.navigateTo('results');

    const titleEl = document.getElementById('results-title');
    const isWinner = data.winner && this.currentUser && String(data.winner.id) === String(this.currentUser.id);

    if (titleEl) {
      if (data.isPractice) {
        titleEl.textContent = 'PRACTICE SESSION COMPLETE';
        titleEl.style.color = 'var(--emerald-green)';
      } else {
        titleEl.textContent = isWinner ? 'VICTORY - TOP OPERATIVE' : 'MATCH COMPLETE';
        titleEl.style.color = isWinner ? 'var(--amber-gold)' : 'var(--cyan-glow)';
      }
    }

    // Populate Results Table
    const tbody = document.getElementById('results-tbody');
    if (tbody && data.leaderboard) {
      tbody.innerHTML = '';
      data.leaderboard.forEach(p => {
        const isSelf = this.currentUser && String(p.userId) === String(this.currentUser.id);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.rank}</td>
          <td style="font-weight: 700; color: ${isSelf ? 'var(--cyan-glow)' : '#fff'};">${p.username}</td>
          <td>${p.kills}</td>
          <td>${p.deaths}</td>
          <td>${p.damage}</td>
          <td style="font-weight: 800; color: #fff;">${p.score}</td>
        `;
        tbody.appendChild(tr);

        if (isSelf) {
          document.getElementById('res-kills').textContent = p.kills;
          document.getElementById('res-deaths').textContent = p.deaths;
          document.getElementById('res-kd').textContent = p.kd;
          document.getElementById('res-damage').textContent = p.damage;
        }
      });
    }

    // Duration display
    const durationEl = document.getElementById('res-duration');
    if (durationEl) {
      const dur = data.durationSeconds || 0;
      const mins = String(Math.floor(dur / 60)).padStart(2, '0');
      const secs = String(dur % 60).padStart(2, '0');
      durationEl.textContent = `${mins}:${secs}`;
    }

    // AI match options & Progression details
    const progText = document.getElementById('res-progression-text');
    const btnRematch = document.getElementById('btn-results-rematch');
    const btnSetup = document.getElementById('btn-results-change-setup');

    if (data.isAiMatch || data.isPractice) {
      if (btnRematch) btnRematch.style.display = 'inline-block';
      if (btnSetup) btnSetup.style.display = 'inline-block';

      if (progText) {
        if (data.isPractice) {
          progText.textContent = 'Practice Sandbox: Targets defeated. Aim mechanics drilled without altering ranked stats.';
        } else {
          progText.textContent = `Single Player vs ${((data.aiDifficulty || 'Medium')).toUpperCase()} AI: Confirmed kills recorded authoritatively toward milestone rewards!`;
        }
      }
    } else {
      if (btnRematch) btnRematch.style.display = 'none';
      if (btnSetup) btnSetup.style.display = 'none';
      if (progText) {
        progText.textContent = 'Online Multiplayer: Kills and match records authoritatively verified & persisted.';
      }
    }

    // Rewards earned notice
    const rewardsContainer = document.getElementById('res-rewards-container');
    if (rewardsContainer) {
      if (this.recentMilestoneReward) {
        rewardsContainer.style.display = 'block';
        rewardsContainer.textContent = `🎖️ Milestone Reward Unlocked: ${this.recentMilestoneReward.name}!`;
        this.recentMilestoneReward = null;
      } else {
        rewardsContainer.style.display = 'none';
      }
    }

    this.refreshUserStats();
  }

  // =========================================================================
  // 3D TURNTABLE PREVIEW FOR SKINS
  // =========================================================================

  setupTurntablePreview() {
    const container = document.getElementById('skin-preview-canvas');
    if (!container) return;

    this.turntableScene = new THREE.Scene();
    this.turntableCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 50);
    this.turntableCamera.position.set(0, 1.2, 3.2);

    this.turntableRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.turntableRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.turntableRenderer.domElement);

    // Turntable Lights
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.turntableScene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0x00e5ff, 2.5);
    keyLight.position.set(3, 4, 3);
    this.turntableScene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffae00, 1.5);
    fillLight.position.set(-3, 2, -2);
    this.turntableScene.add(fillLight);

    // Mouse drag rotation
    let isDragging = false;
    let prevMouseX = 0;

    container.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
    });

    window.addEventListener('mouseup', () => isDragging = false);

    window.addEventListener('mousemove', (e) => {
      if (isDragging && this.turntableModel) {
        const deltaX = e.clientX - prevMouseX;
        this.turntableModel.group.rotation.y += deltaX * 0.01;
        prevMouseX = e.clientX;
      }
    });

    const animateTurntable = () => {
      requestAnimationFrame(animateTurntable);
      if (this.currentScreen !== 'skins') return;
      if (this.turntableModel && !isDragging) {
        this.turntableModel.group.rotation.y += 0.008; // Auto rotate
      }
      this.turntableRenderer.render(this.turntableScene, this.turntableCamera);
    };
    animateTurntable();
  }

  updateTurntableModel(skin) {
    if (!this.turntableScene) return;

    if (this.turntableModel) {
      this.turntableScene.remove(this.turntableModel.group);
      this.turntableModel = null;
    }

    const dummyPlayerData = {
      id: 9999,
      username: 'Preview',
      characterSkin: skin.type === 'character' ? skin : { skin_id: 'char_default' },
      weaponSkin: skin.type === 'weapon' ? skin : { skin_id: 'wep_default' }
    };

    this.turntableModel = new PlayerModel(dummyPlayerData, true);
    this.turntableModel.group.position.y = -0.7;
    this.turntableScene.add(this.turntableModel.group);
  }

  async loadSkinsCatalog() {
    try {
      const res = await window.apiClient.getSkins();
      this.allSkins = res.skins || [];
      this.filterSkins('all');
    } catch (e) {
      console.error('Error loading skins:', e);
    }
  }

  filterSkins(category) {
    document.getElementById('tab-skin-all').classList.toggle('active', category === 'all');
    document.getElementById('tab-skin-chars').classList.toggle('active', category === 'character');
    document.getElementById('tab-skin-weps').classList.toggle('active', category === 'weapon');

    const container = document.getElementById('skins-grid-container');
    if (!container) return;
    container.innerHTML = '';

    const filtered = this.allSkins.filter(s => category === 'all' || s.type === category);

    filtered.forEach(skin => {
      const card = document.createElement('div');
      card.className = `skin-card ${skin.is_equipped ? 'selected' : ''} ${!skin.is_unlocked ? 'locked' : ''}`;
      card.onclick = () => this.selectSkinForInspect(skin);

      card.innerHTML = `
        <span class="rarity-pill rarity-${skin.rarity}">${skin.rarity}</span>
        <div style="font-weight: 800; font-size: 15px; margin-bottom: 4px; color: #fff;">${skin.name}</div>
        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">${skin.type} skin</div>
        <div style="margin-top: 12px; font-size: 12px; font-weight: 700; color: ${skin.is_unlocked ? 'var(--emerald-green)' : 'var(--amber-gold)'};">
          ${skin.is_unlocked ? (skin.is_equipped ? 'EQUIPPED' : 'UNLOCKED') : `LOCKED (${skin.required_kills} KILLS)`}
        </div>
      `;
      container.appendChild(card);
    });

    if (filtered.length > 0 && !this.selectedSkin) {
      this.selectSkinForInspect(filtered[0]);
    }
  }

  selectSkinForInspect(skin) {
    this.selectedSkin = skin;
    this.updateTurntableModel(skin);

    const nameEl = document.getElementById('inspect-skin-name');
    const rarityEl = document.getElementById('inspect-skin-rarity');
    const descEl = document.getElementById('inspect-skin-desc');
    const reqEl = document.getElementById('inspect-skin-req');
    const btn = document.getElementById('btn-equip-skin');

    if (nameEl) nameEl.textContent = skin.name;
    if (rarityEl) {
      rarityEl.textContent = skin.rarity.toUpperCase();
      rarityEl.className = `rarity-pill rarity-${skin.rarity}`;
    }
    if (descEl) descEl.textContent = skin.description;
    if (reqEl) {
      reqEl.textContent = skin.is_unlocked ? 'Unlocked and ready for combat' : `Requires ${skin.required_kills} lifetime kills (Progress: ${skin.killsProgress || 0}/${skin.required_kills})`;
      reqEl.style.color = skin.is_unlocked ? 'var(--emerald-green)' : 'var(--amber-gold)';
    }

    if (btn) {
      btn.disabled = !skin.is_unlocked || skin.is_equipped;
      btn.textContent = skin.is_equipped ? 'Already Equipped' : (skin.is_unlocked ? 'Equip Skin' : 'Locked by Achievement');
      btn.className = skin.is_unlocked ? 'btn btn-primary' : 'btn';
    }
  }

  async equipSelectedSkin() {
    if (!this.selectedSkin || !this.selectedSkin.is_unlocked) return;
    try {
      const res = await window.apiClient.equipSkin(this.selectedSkin.skin_id);
      this.showToast(`Equipped: ${this.selectedSkin.name}`);
      await this.loadSkinsCatalog();
      this.selectSkinForInspect(this.selectedSkin);
      const me = await window.apiClient.getMe();
      this.currentUser = me.user;
    } catch (e) {
      this.showToast(e.message, 'danger');
    }
  }

  // =========================================================================
  // ACHIEVEMENTS SCREEN
  // =========================================================================

  async loadAchievements() {
    try {
      const data = await window.apiClient.getStats();
      if (!data) return;

      const p60k = data.progression.progressTo60k;
      document.getElementById('ach-60k-percentage').textContent = `${p60k.percentage}%`;
      document.getElementById('ach-60k-fraction').textContent = `${p60k.current} / 60,000 Kills`;
      document.getElementById('ach-60k-progress-bar').style.width = `${p60k.percentage}%`;

      const container = document.getElementById('achievements-container');
      if (!container) return;
      container.innerHTML = '';

      data.progression.allMilestones.forEach(m => {
        const card = document.createElement('div');
        card.className = `achievement-card ${m.unlocked ? 'completed' : ''}`;
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h4 style="font-size: 17px; font-weight: 800; color: #fff;">${m.name}</h4>
            <span style="font-size: 12px; font-weight: 700; color: ${m.unlocked ? 'var(--amber-gold)' : 'var(--cyan-glow)'};">
              ${m.unlocked ? 'COMPLETED' : `${m.kills} KILLS`}
            </span>
          </div>
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.4;">${m.desc}</p>
          <div style="margin-top: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
              <span>Progress</span>
              <span>${m.progressText}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${Math.round(m.progress * 100)}%;"></div>
            </div>
          </div>
        `;
        container.appendChild(card);
      });
    } catch (e) {
      console.error('Error loading achievements:', e);
    }
  }

  // =========================================================================
  // FRIENDS SYSTEM
  // =========================================================================

  async loadFriendsRoster() {
    try {
      const data = await window.apiClient.getFriendsList();
      const countEl = document.getElementById('friends-count-pill');
      if (countEl) countEl.textContent = `${data.friends.length} Friends`;

      // Friends Roster
      const rosterList = document.getElementById('friends-roster-list');
      if (rosterList) {
        rosterList.innerHTML = '';
        if (data.friends.length === 0) {
          rosterList.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">No friends added yet. Use the search panel on the left to add comrades!</div>';
        } else {
          data.friends.forEach(f => {
            const card = document.createElement('div');
            card.className = 'friend-card';
            card.innerHTML = `
              <div>
                <div style="font-weight: 800; font-size: 15px; color: #fff;">
                  <span class="status-indicator status-${f.currentStatus}"></span>
                  ${f.username} <span style="font-size: 11px; color: var(--cyan-glow);">${f.tag}</span>
                </div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                  Status: <strong>${f.currentStatus.toUpperCase()}</strong> | Lifetime Kills: ${f.lifetimeKills}
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                ${this.currentRoom ? `<button class="btn btn-primary" style="padding: 6px 12px; font-size: 11px;" onclick="app.inviteFriend(${f.id})">Invite</button>` : ''}
                <button class="btn btn-danger" style="padding: 6px 10px; font-size: 11px;" onclick="app.removeFriend(${f.id})">Remove</button>
                <button class="btn" style="padding: 6px 10px; font-size: 11px;" onclick="app.reportFriend(${f.id})">Report</button>
              </div>
            `;
            rosterList.appendChild(card);
          });
        }
      }

      // Incoming Requests
      const reqList = document.getElementById('friend-pending-requests');
      if (reqList) {
        reqList.innerHTML = '';
        if (data.incomingRequests.length === 0) {
          reqList.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">No pending requests.</div>';
        } else {
          data.incomingRequests.forEach(r => {
            const rDiv = document.createElement('div');
            rDiv.style = 'display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 4px;';
            rDiv.innerHTML = `
              <span style="font-size: 13px; font-weight: 700;">${r.username}</span>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-primary" style="padding: 4px 8px; font-size: 10px;" onclick="app.acceptFriend(${r.requestId})">Accept</button>
                <button class="btn btn-danger" style="padding: 4px 8px; font-size: 10px;" onclick="app.declineFriend(${r.requestId})">Decline</button>
              </div>
            `;
            reqList.appendChild(rDiv);
          });
        }
      }
    } catch (e) {
      console.error('Error loading friends:', e);
    }
  }

  async handleFriendSearch() {
    const input = document.getElementById('friend-search-input');
    const query = input ? input.value.trim() : '';
    const container = document.getElementById('friend-search-results');
    if (!container) return;

    if (!query) {
      container.innerHTML = '';
      return;
    }

    try {
      const res = await window.apiClient.searchUsers(query);
      container.innerHTML = '';
      if (!res.users || res.users.length === 0) {
        container.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">No players found.</div>';
        return;
      }

      res.users.forEach(u => {
        const item = document.createElement('div');
        item.style = 'display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 4px;';
        item.innerHTML = `
          <div>
            <div style="font-weight: 700; font-size: 13px;">${u.username} <span style="font-size: 10px; color: var(--cyan-glow);">${u.tag}</span></div>
            <div style="font-size: 11px; color: var(--text-muted);">${u.lifetimeKills} Kills</div>
          </div>
          <div>
            ${u.relationship === 'accepted' ? '<span style="font-size: 11px; color: var(--emerald-green);">Friend</span>' :
              (u.relationship === 'pending' ? '<span style="font-size: 11px; color: var(--amber-gold);">Pending</span>' :
                `<button class="btn btn-primary" style="padding: 4px 10px; font-size: 11px;" onclick="app.sendFriendRequest(${u.id})">Add</button>`)}
          </div>
        `;
        container.appendChild(item);
      });
    } catch (e) {
      console.warn('Search error:', e);
    }
  }

  async sendFriendRequest(targetUserId) {
    try {
      const res = await window.apiClient.sendFriendRequest(targetUserId);
      this.showToast(res.message);
      this.handleFriendSearch();
      this.loadFriendsRoster();
    } catch (e) {
      this.showToast(e.message, 'danger');
    }
  }

  async acceptFriend(requestId) {
    try {
      const res = await window.apiClient.acceptFriendRequest(requestId);
      this.showToast(res.message);
      this.loadFriendsRoster();
    } catch (e) {
      this.showToast(e.message, 'danger');
    }
  }

  async declineFriend(requestId) {
    try {
      const res = await window.apiClient.declineFriendRequest(requestId);
      this.showToast(res.message);
      this.loadFriendsRoster();
    } catch (e) {
      this.showToast(e.message, 'danger');
    }
  }

  async removeFriend(friendUserId) {
    if (!confirm('Remove this friend?')) return;
    try {
      const res = await window.apiClient.removeFriend(friendUserId);
      this.showToast(res.message);
      this.loadFriendsRoster();
    } catch (e) {
      this.showToast(e.message, 'danger');
    }
  }

  async reportFriend(targetUserId) {
    const reason = prompt('Reason for reporting player (Harassment / Cheating / Toxicity):');
    if (!reason) return;
    try {
      const res = await window.apiClient.reportUser(targetUserId, reason, '');
      this.showToast(res.message);
    } catch (e) {
      this.showToast(e.message, 'danger');
    }
  }

  async inviteFriend(targetUserId) {
    if (!this.currentRoom) return;
    try {
      const res = await window.apiClient.sendMatchInvite(targetUserId, this.currentRoom.code);
      this.showToast(`Invite sent to friend!`);
    } catch (e) {
      this.showToast(e.message, 'danger');
    }
  }

  // =========================================================================
  // SETTINGS
  // =========================================================================

  updateSettings() {
    const sens = parseFloat(document.getElementById('setting-sens').value);
    const invertY = document.getElementById('setting-invert-y').checked;
    const fov = parseInt(document.getElementById('setting-fov').value, 10);
    const graphics = document.getElementById('setting-graphics').value;
    const brightnessEl = document.getElementById('setting-brightness');
    const brightness = brightnessEl ? parseFloat(brightnessEl.value) : 1.4;
    const volMaster = parseInt(document.getElementById('setting-vol-master').value, 10) / 100;
    const volSfx = parseInt(document.getElementById('setting-vol-sfx').value, 10) / 100;

    document.getElementById('setting-sens-val').textContent = sens.toFixed(1);
    document.getElementById('setting-fov-val').textContent = `${fov}°`;
    const brightValEl = document.getElementById('setting-brightness-val');
    if (brightValEl) brightValEl.textContent = `${brightness.toFixed(1)}x`;
    document.getElementById('setting-vol-master-val').textContent = `${Math.round(volMaster * 100)}%`;
    document.getElementById('setting-vol-sfx-val').textContent = `${Math.round(volSfx * 100)}%`;

    if (this.gameEngine) {
      this.gameEngine.input.setSensitivity(sens);
      this.gameEngine.input.setInvertY(invertY);
      this.gameEngine.setFieldOfView(fov);
      this.gameEngine.setGraphicsQuality(graphics);
      this.gameEngine.setBrightness(brightness);
    }

    if (window.soundEngine) {
      window.soundEngine.setMasterVolume(volMaster);
      window.soundEngine.setSfxVolume(volSfx);
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }
}

window.app = new App();
