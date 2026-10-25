/**
 * Vortex Arena Real-Time WebSocket Network Controller
 */

class NetClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.isAuthenticated = false;
    this.authenticatedUser = null;
    this.reconnectTimer = null;
    this.token = null;
    this.manualDisconnect = false;
  }

  connect(token) {
    this.manualDisconnect = false;
    const activeToken = token || localStorage.getItem('vortex_token');

    // If already connected, update token and re-authenticate socket immediately
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (activeToken) {
        this.token = activeToken;
        this.send('auth', { token: activeToken });
      }
      return;
    }

    this.token = activeToken;
    if (!this.token) {
      console.warn('Cannot connect WebSocket without auth token');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
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
      if (this.token) {
        this.send('auth', { token: this.token });
      }
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'authenticated') {
          this.isAuthenticated = true;
          this.authenticatedUser = msg.user;
        } else if (msg.type === 'auth_error') {
          this.isAuthenticated = false;
        }
        this.emit(msg.type, msg);
      } catch (e) {
        console.error('[Net] Error parsing server message:', e);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.isAuthenticated = false;
      this.authenticatedUser = null;
      this.ws = null;
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
    this.isAuthenticated = false;
    this.authenticatedUser = null;
  }

  /**
   * Ensures the WebSocket is open and connected before sending actions.
   * Resolves immediately if already connected, or attempts connection with timeout.
   */
  async ensureConnected(timeoutMs = 6000) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.isConnected = true;
      return true;
    }

    const token = this.token || (window.apiClient ? window.apiClient.token : null) || localStorage.getItem('vortex_token');
    if (!token) {
      console.warn('[Net] Cannot ensure connection: Missing auth token');
      return false;
    }

    if (!this.ws || (this.ws.readyState !== WebSocket.OPEN && this.ws.readyState !== WebSocket.CONNECTING)) {
      this.connect(token);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.isConnected = true;
      return true;
    }

    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(Boolean(this.ws && this.ws.readyState === WebSocket.OPEN));
        }
      }, timeoutMs);

      const onOpen = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.isConnected = true;
          resolve(true);
        }
      };
      const onError = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      };

      if (this.ws) {
        this.ws.addEventListener('open', onOpen, { once: true });
        this.ws.addEventListener('error', onError, { once: true });
        this.ws.addEventListener('close', onError, { once: true });
      } else {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    });
  }

  /**
   * Guarantees that the WebSocket connection is authenticated before initiating room actions.
   */
  async ensureAuthenticated(timeoutMs = 4000) {
    const ok = await this.ensureConnected(timeoutMs);
    if (!ok) return false;

    const token = this.token || (window.apiClient ? window.apiClient.token : null) || localStorage.getItem('vortex_token');
    if (!token) return false;

    if (this.isAuthenticated) {
      return true;
    }

    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(this.isAuthenticated);
        }
      }, timeoutMs);

      const onAuth = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          this.isAuthenticated = true;
          resolve(true);
        }
      };

      const onAuthErr = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          resolve(false);
        }
      };

      const unsubAuth = this.on('authenticated', onAuth);
      const unsubErr = this.on('auth_error', onAuthErr);

      const cleanup = () => {
        if (unsubAuth) unsubAuth();
        if (unsubErr) unsubErr();
      };

      this.send('auth', { token });
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
    await this.ensureAuthenticated(3000);
    const token = this.token || (window.apiClient ? window.apiClient.token : null) || localStorage.getItem('vortex_token');
    return this.send('find_match', { gameMode, mapId, token });
  }

  async createAiMatch(options = {}) {
    await this.ensureAuthenticated(3000);
    const token = this.token || (window.apiClient ? window.apiClient.token : null) || localStorage.getItem('vortex_token');
    return this.send('create_ai_match', { ...options, token });
  }

  async createRoom(roomName, isPrivate = false, gameMode = 'ffa', mapId = 'house', timeoutMs = 8000) {
    const ok = await this.ensureConnected();
    if (!ok) {
      return { success: false, error: 'Unable to connect to game server. Please check your connection.' };
    }

    const token = this.token || (window.apiClient ? window.apiClient.token : null) || localStorage.getItem('vortex_token');
    if (token && !this.isAuthenticated) {
      await this.ensureAuthenticated(2500);
    }

    return new Promise((resolve) => {
      let resolved = false;
      let authRetried = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ success: false, error: 'Match room creation timed out. Please try again.' });
        }
      }, timeoutMs);

      const onRoomJoined = (data) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ success: true, room: data.room, data });
        }
      };

      const onJoinError = (data) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ success: false, error: data.message || 'Room creation rejected' });
        }
      };

      const onError = async (data) => {
        if (!resolved && data && data.message) {
          if (data.message === 'Authentication required' && !authRetried) {
            authRetried = true;
            const retryToken = this.token || (window.apiClient ? window.apiClient.token : null) || localStorage.getItem('vortex_token');
            if (retryToken) {
              this.send('auth', { token: retryToken });
              this.send('create_room', { roomName, isPrivate, gameMode, mapId, token: retryToken });
              return;
            }
          }
          resolved = true;
          cleanup();
          resolve({ success: false, error: data.message });
        }
      };

      const unsubJoined = this.on('room_joined', onRoomJoined);
      const unsubError = this.on('join_error', onJoinError);
      const unsubServerError = this.on('error', onError);

      const cleanup = () => {
        clearTimeout(timer);
        if (unsubJoined) unsubJoined();
        if (unsubError) unsubError();
        if (unsubServerError) unsubServerError();
      };

      const sent = this.send('create_room', { roomName, isPrivate, gameMode, mapId, token });
      if (!sent) {
        resolved = true;
        cleanup();
        resolve({ success: false, error: 'Failed to send room creation request' });
      }
    });
  }

  setMap(mapId) {
    const token = this.token || (window.apiClient ? window.apiClient.token : null) || localStorage.getItem('vortex_token');
    return this.send('set_map', { mapId, token });
  }

  async joinRoom(roomCode, timeoutMs = 8000) {
    const ok = await this.ensureConnected();
    if (!ok) {
      return { success: false, error: 'Unable to connect to game server. Please check your connection.' };
    }

    const token = this.token || (window.apiClient ? window.apiClient.token : null) || localStorage.getItem('vortex_token');
    if (token && !this.isAuthenticated) {
      await this.ensureAuthenticated(2500);
    }

    return new Promise((resolve) => {
      let resolved = false;
      let authRetried = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ success: false, error: 'Join room timed out. Please try again.' });
        }
      }, timeoutMs);

      const onRoomJoined = (data) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ success: true, room: data.room, data });
        }
      };

      const onJoinError = (data) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ success: false, error: data.message || 'Match room not found or code expired' });
        }
      };

      const onError = (data) => {
        if (!resolved && data && data.message) {
          if (data.message === 'Authentication required' && !authRetried) {
            authRetried = true;
            const retryToken = this.token || (window.apiClient ? window.apiClient.token : null) || localStorage.getItem('vortex_token');
            if (retryToken) {
              this.send('auth', { token: retryToken });
              this.send('join_room', { roomCode, token: retryToken });
              return;
            }
          }
          resolved = true;
          cleanup();
          resolve({ success: false, error: data.message });
        }
      };

      const unsubJoined = this.on('room_joined', onRoomJoined);
      const unsubError = this.on('join_error', onJoinError);
      const unsubServerError = this.on('error', onError);

      const cleanup = () => {
        clearTimeout(timer);
        if (unsubJoined) unsubJoined();
        if (unsubError) unsubError();
        if (unsubServerError) unsubServerError();
      };

      const sent = this.send('join_room', { roomCode, token });
      if (!sent) {
        resolved = true;
        cleanup();
        resolve({ success: false, error: 'Failed to send room join request' });
      }
    });
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
