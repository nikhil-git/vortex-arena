/**
 * Vortex Arena REST API Client
 */

class ApiClient {
  constructor() {
    this.baseUrl = this.resolveBaseUrl();
    this.token = localStorage.getItem('vortex_token') || null;
  }

  resolveBaseUrl() {
    if (window.Android && typeof window.Android.getServerUrl === 'function') {
      const u = window.Android.getServerUrl();
      if (u) return u.replace(/\/$/, '');
    }
    const saved = localStorage.getItem('vortex_server_url');
    if (saved) return saved.replace(/\/$/, '');

    if (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) {
      return window.location.origin;
    }
    return 'http://192.168.1.3:3000';
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('vortex_token', token);
    } else {
      localStorage.removeItem('vortex_token');
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(url, { ...options, headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server request failed');
      }
      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  }

  // Auth Endpoints
  async register(username, email, password) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
    this.setToken(data.token);
    return data;
  }

  async login(usernameOrEmail, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail, password })
    });
    this.setToken(data.token);
    return data;
  }

  async playAsGuest() {
    const data = await this.request('/api/auth/guest', {
      method: 'POST'
    });
    this.setToken(data.token);
    return data;
  }

  async logout() {
    try {
      if (this.token) {
        await this.request('/api/auth/logout', { method: 'POST' });
      }
    } catch (err) {
      console.warn('[API] Logout request warning:', err);
    } finally {
      this.setToken(null);
    }
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // Friends Endpoints
  async getFriendsList() {
    return this.request('/api/friends/list');
  }

  async searchUsers(query) {
    return this.request(`/api/friends/search?q=${encodeURIComponent(query)}`);
  }

  async sendFriendRequest(targetUserId) {
    return this.request('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify({ targetUserId })
    });
  }

  async acceptFriendRequest(requestId, senderId) {
    return this.request('/api/friends/accept', {
      method: 'POST',
      body: JSON.stringify({ requestId, senderId })
    });
  }

  async declineFriendRequest(requestId, targetUserId) {
    return this.request('/api/friends/decline', {
      method: 'POST',
      body: JSON.stringify({ requestId, targetUserId })
    });
  }

  async removeFriend(friendUserId) {
    return this.request('/api/friends/remove', {
      method: 'POST',
      body: JSON.stringify({ friendUserId })
    });
  }

  async blockUser(targetUserId) {
    return this.request('/api/friends/block', {
      method: 'POST',
      body: JSON.stringify({ targetUserId })
    });
  }

  async reportUser(reportedUserId, reason, details) {
    return this.request('/api/friends/report', {
      method: 'POST',
      body: JSON.stringify({ reportedUserId, reason, details })
    });
  }

  async sendMatchInvite(targetUserId, roomCode) {
    return this.request('/api/friends/invite', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, roomCode })
    });
  }

  // Skins Endpoints
  async getSkins() {
    return this.request('/api/skins/list');
  }

  async equipSkin(skinId) {
    return this.request('/api/skins/equip', {
      method: 'POST',
      body: JSON.stringify({ skinId })
    });
  }

  // Stats & Leaderboard
  async getStats(userId = null) {
    const endpoint = userId ? `/api/stats?userId=${encodeURIComponent(userId)}` : '/api/stats';
    return this.request(endpoint);
  }

  async getLeaderboard() {
    return this.request('/api/stats/leaderboard');
  }

  // Public match browser
  async getPublicMatches() {
    return this.request('/api/matches/public');
  }
}

window.apiClient = new ApiClient();
