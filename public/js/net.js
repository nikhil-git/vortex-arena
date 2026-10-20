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
  }

  connect(token) {
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
    };

    this.ws.onerror = (err) => {
      console.error('[Net] WebSocket error:', err);
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
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
  findMatch(gameMode = 'ffa') {
    return this.send('find_match', { gameMode });
  }

  createAiMatch(options = {}) {
    return this.send('create_ai_match', options);
  }

  createRoom(roomName, isPrivate = false, gameMode = 'ffa') {
    return this.send('create_room', { roomName, isPrivate, gameMode });
  }

  joinRoom(roomCode) {
    return this.send('join_room', { roomCode });
  }

  startMatch() {
    return this.send('start_match');
  }

  leaveRoom() {
    return this.send('leave_room');
  }

  sendInput(position, rotation, velocity) {
    return this.send('player_input', { position, rotation, velocity });
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
