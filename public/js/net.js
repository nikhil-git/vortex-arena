/**
 * Vortex Arena Real-Time WebSocket Network Controller
 */

class NetClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.reconnectTimer = null;
    this.token = null;
    this.manualDisconnect = false;
  }

  connect(token) {
    this.manualDisconnect = false;
    this.token = token || localStorage.getItem('vortex_token');
    if (!this.token) {
      console.warn('Cannot connect WebSocket without auth token');
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    let wsUrl;
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(this.token)}`;
    } else {
      const base = window.apiClient ? window.apiClient.resolveBaseUrl() : 'http://192.168.1.3:3000';
      const wsBase = base.replace(/^http/, 'ws').replace(/\/$/, '');
      wsUrl = `${wsBase}/ws?token=${encodeURIComponent(this.token)}`;
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      console.log('[Net] Connected to game server');
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.emit(msg.type, msg);
      } catch (e) {
        console.error('[Net] Error parsing server message:', e);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      console.log('[Net] Disconnected from game server');
      this.emit('disconnected');

      // Auto-reconnect if unexpectedly disconnected and user has valid auth token
      if (!this.manualDisconnect && this.token) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          console.log('[Net] Attempting auto-reconnect...');
          this.connect(this.token);
        }, 2000);
      }
    };

    this.ws.onerror = (err) => {
      console.error('[Net] WebSocket error:', err);
    };
  }

  disconnect() {
    this.manualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Ensures the WebSocket is open and connected before sending actions.
   * Resolves immediately if already connected, or attempts connection with timeout.
   */
  async ensureConnected(timeoutMs = 5000) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.isConnected = true;
      return true;
    }

    const token = this.token || (window.apiClient ? window.apiClient.token : null) || localStorage.getItem('vortex_token');
    if (!token) {
      console.warn('[Net] Cannot ensure connection: Missing auth token');
      return false;
    }

    this.connect(token);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.isConnected = true;
      return true;
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(Boolean(this.ws && this.ws.readyState === WebSocket.OPEN));
      }, timeoutMs);

      const onOpen = () => {
        clearTimeout(timer);
        this.isConnected = true;
        resolve(true);
      };
      const onError = () => {
        clearTimeout(timer);
        resolve(false);
      };

      if (this.ws) {
        this.ws.addEventListener('open', onOpen, { once: true });
        this.ws.addEventListener('error', onError, { once: true });
        this.ws.addEventListener('close', onError, { once: true });
      } else {
        clearTimeout(timer);
        resolve(false);
      }
    });
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
    return () => this.listeners.get(type).delete(callback);
  }

  emit(type, data) {
    if (this.listeners.has(type)) {
      for (const cb of this.listeners.get(type)) {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in net listener for '${type}':`, e);
        }
      }
    }
  }

  send(action, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(JSON.stringify({ action, ...payload }));
    return true;
  }

  // Convenience Matchmaking & Game Actions
  async findMatch(gameMode = 'ffa', mapId = null) {
    await this.ensureConnected();
    return this.send('find_match', { gameMode, mapId });
  }

  async createAiMatch(options = {}) {
    await this.ensureConnected();
    return this.send('create_ai_match', options);
  }

  async createRoom(roomName, isPrivate = false, gameMode = 'ffa', mapId = 'house') {
    const ok = await this.ensureConnected();
    if (!ok) return false;
    return this.send('create_room', { roomName, isPrivate, gameMode, mapId });
  }

  setMap(mapId) {
    return this.send('set_map', { mapId });
  }

  async joinRoom(roomCode) {
    const ok = await this.ensureConnected();
    if (!ok) return false;
    return this.send('join_room', { roomCode });
  }

  startMatch() {
    return this.send('start_match');
  }

  leaveRoom() {
    return this.send('leave_room');
  }

  sendInput(position, rotation, velocity, seq = 0) {
    return this.send('player_input', { position, rotation, velocity, seq });
  }

  sendShoot(origin, dir) {
    return this.send('player_shoot', { origin, dir });
  }

  sendReload() {
    return this.send('player_reload');
  }

  sendSwitchWeapon(weaponId) {
    return this.send('switch_weapon', { weaponId });
  }
}

window.netClient = new NetClient();
