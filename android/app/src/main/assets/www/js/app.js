import * as THREE from '/vendor/three/three.module.js';
import { GameEngine } from './game/GameEngine.js';
import { PlayerModel } from './game/PlayerModel.js';

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
      assault_rifle: { name: 'V-44 Striker', mag: 30, reserve: 120 },
      sniper_rifle: { name: 'Hawk-50 Anti-Materiel', mag: 5, reserve: 20 },
      shotgun: { name: 'Breacher-12 Tactical', mag: 8, reserve: 32 },
      pistol: { name: 'Pulse-9 Sidearm', mag: 15, reserve: 60 }
    };

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

    this.refreshUserStats();
  }

  async refreshUserStats() {
    try {
      const data = await window.apiClient.getStats();
      if (!data) return;

      const killsEl = document.getElementById('side-lifetime-kills');
      const kdEl = document.getElementById('side-kd-ratio');
      const matchesEl = document.getElementById('side-matches');
      const winsEl = document.getElementById('side-wins');

      if (killsEl) killsEl.textContent = data.stats.lifetimeKills;
      if (kdEl) kdEl.textContent = data.stats.kdRatio;
      if (matchesEl) matchesEl.textContent = data.stats.lifetimeMatches;
      if (winsEl) winsEl.textContent = data.stats.lifetimeWins;

      // Milestone progress
      const nextM = data.progression.nextMilestone;
      const textEl = document.getElementById('side-milestone-text');
      const barEl = document.getElementById('side-milestone-bar');
      const nameEl = document.getElementById('side-milestone-name');

      if (textEl) textEl.textContent = nextM.progressText;
      if (barEl) barEl.style.width = `${Math.round(nextM.progressRatio * 100)}%`;
      if (nameEl) nameEl.textContent = nextM.name;
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
    }

    if (screenId === 'skins') {
      this.loadSkinsCatalog();
    } else if (screenId === 'achievements') {
      this.loadAchievements();
    } else if (screenId === 'friends') {
      this.loadFriendsRoster();
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

  handleLogout() {
    window.apiClient.setToken(null);
    window.netClient.disconnect();
    this.currentUser = null;
    this.navigateTo('auth');
    this.showToast('Logged out');
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
    const name = prompt('Enter Custom Arena Name:', `${this.currentUser.username}'s Arena`);
    if (!name) return;
    const isPrivate = confirm('Make this room Private? (Requires Room Code or Invite to join)');
    window.netClient.createRoom(name, isPrivate, 'ffa');
  }

  openJoinCodeModal() {
    const code = prompt('Enter 6-character Room Code:');
    if (!code) return;
    window.netClient.joinRoom(code.toUpperCase().trim());
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

    // Start button enabled only if host
    const startBtn = document.getElementById('btn-start-match');
    if (startBtn && this.currentRoom) {
      startBtn.style.display = (this.currentRoom.hostUserId === this.currentUser.id) ? 'inline-flex' : 'none';
    }
  }

  // =========================================================================
  // GAMEPLAY ENGINE INTEGRATION & HUD
  // =========================================================================

  enterGameplay(matchData) {
    this.navigateTo('gameplay');

    if (!this.gameEngine) {
      const container = document.getElementById('game-viewport');
      this.gameEngine = new GameEngine(container);

      // Wire callbacks
      this.gameEngine.onShootCallback = (origin, dir) => {
        const wep = this.weaponsState[this.activeWeaponId];
        if (!wep || wep.mag <= 0) {
          if (window.soundEngine) window.soundEngine.playClick(window.soundEngine.ctx ? window.soundEngine.ctx.currentTime : 0, 750, 0.04);
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

    this.gameEngine.setLocalPlayer(this.currentUser.id, this.currentUser.equippedSkins);
    this.switchActiveWeapon('assault_rifle');
    this.updateHUDVitals(100, 50);

    if (window.soundEngine) window.soundEngine.playMatchStart();
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

      const titleEl = document.getElementById('lobby-title');
      const codeEl = document.getElementById('lobby-room-code');
      if (titleEl) titleEl.textContent = data.room.name;
      if (codeEl) codeEl.textContent = data.room.code;

      this.navigateTo('lobby');
    });

    net.on('lobby_updated', (data) => {
      this.currentRoom = data.room;
      this.renderLobbySlots(data.players);
    });

    net.on('match_countdown_started', (data) => {
      const statusEl = document.getElementById('lobby-status-msg');
      if (statusEl) statusEl.textContent = `Match starting in ${data.countdownSeconds}s!`;
      this.showToast(`Match starting in ${data.countdownSeconds}s!`);
    });

    net.on('match_started', (data) => {
      this.enterGameplay(data);
    });

    net.on('state_tick', (data) => {
      this.lastPlayersSnapshot = data.players;
      if (this.gameEngine) {
        this.gameEngine.syncRemotePlayers(data.players);
      }

      // Update match timer display
      const timerEl = document.getElementById('hud-timer');
      if (timerEl && data.timeRemaining !== undefined) {
        const mins = String(Math.floor(data.timeRemaining / 60)).padStart(2, '0');
        const secs = String(data.timeRemaining % 60).padStart(2, '0');
        const formatted = `${mins}:${secs}`;
        if (timerEl.textContent !== formatted) timerEl.textContent = formatted;
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

      if (data.victimId === this.currentUser.id) {
        // Local player died: show respawn modal countdown
        const modal = document.getElementById('respawn-modal');
        const countEl = document.getElementById('respawn-countdown-timer');
        const killerEl = document.getElementById('respawn-killer-text');
        if (modal) modal.classList.add('active');
        if (killerEl) killerEl.textContent = `Eliminated by ${data.killerUsername}`;

        let remaining = data.respawnCountdown || 3;
        if (countEl) countEl.textContent = remaining;

        const interval = setInterval(() => {
          remaining--;
          if (countEl) countEl.textContent = remaining;
          if (remaining <= 0) {
            clearInterval(interval);
            if (modal) modal.classList.remove('active');
          }
        }, 1000);
      }
    });

    net.on('player_respawned', (data) => {
      if (data.userId === this.currentUser.id) {
        this.updateHUDVitals(data.health, data.shield);
        // Reset local position
        if (this.gameEngine) {
          this.gameEngine.input.position.set(data.position.x, data.position.y + 1.7, data.position.z);
          this.gameEngine.camera.position.copy(this.gameEngine.input.position);
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
    });

    net.on('milestone_unlocked', (data) => {
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
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td style="font-weight: 700; color: ${p.id === this.currentUser.id ? 'var(--cyan-glow)' : '#fff'};">${p.username || 'Operative'}</td>
        <td style="color: var(--emerald-green);">${p.kills}</td>
        <td style="color: var(--crimson-red);">${p.deaths}</td>
        <td style="font-weight: 800; color: #fff;">${p.score}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  handleMatchEnded(data) {
    this.navigateTo('results');

    const titleEl = document.getElementById('results-title');
    const isWinner = data.winner && data.winner.id === this.currentUser.id;

    if (titleEl) {
      titleEl.textContent = isWinner ? 'VICTORY - TOP OPERATIVE' : 'MATCH COMPLETE';
      titleEl.style.color = isWinner ? 'var(--amber-gold)' : 'var(--cyan-glow)';
    }

    // Populate Results Table
    const tbody = document.getElementById('results-tbody');
    if (tbody && data.leaderboard) {
      tbody.innerHTML = '';
      data.leaderboard.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.rank}</td>
          <td style="font-weight: 700; color: ${p.userId === this.currentUser.id ? 'var(--cyan-glow)' : '#fff'};">${p.username}</td>
          <td>${p.kills}</td>
          <td>${p.deaths}</td>
          <td>${p.damage}</td>
          <td style="font-weight: 800; color: #fff;">${p.score}</td>
        `;
        tbody.appendChild(tr);

        if (p.userId === this.currentUser.id) {
          document.getElementById('res-kills').textContent = p.kills;
          document.getElementById('res-deaths').textContent = p.deaths;
          document.getElementById('res-kd').textContent = p.kd;
          document.getElementById('res-damage').textContent = p.damage;
        }
      });
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
