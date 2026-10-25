/**
 * Vortex Arena - Client-Side Analytics, Telemetry & Reliability Monitor
 * 
 * Privacy-friendly, non-invasive client telemetry tracking website visits,
 * game launches, APK download intent, session duration, and technical reliability.
 */

(function () {
  'use strict';

  class VortexAnalyticsTracker {
    constructor() {
      this.visitorId = this.getOrCreateVisitorId();
      this.sessionId = this.getOrCreateSessionId();
      this.startTime = Date.now();
      this.lastHeartbeatTime = Date.now();
      this.currentScreen = 'landing';
      this.isInGame = false;
      this.gameStartTime = 0;
      this.totalPlayTime = 0;
      this.recentPings = [];
      this.isInitialized = false;

      this.init();
    }

    // =======================================================================
    // IDENTIFIER MANAGEMENT (PRIVACY-CONSCIOUS PSEUDONYMOUS IDs)
    // =======================================================================

    generateUuid() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return 'vtx_' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

    getCookie(name) {
      const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
      return match ? decodeURIComponent(match[3]) : null;
    }

    setCookie(name, val, days = 365) {
      try {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie = `${name}=${encodeURIComponent(val)}; expires=${expires}; path=/; SameSite=Lax`;
      } catch (e) {}
    }

    getOrCreateVisitorId() {
      let vid = null;
      try {
        vid = localStorage.getItem('vortex_vid');
      } catch (e) {}

      if (!vid) {
        vid = this.getCookie('vortex_vid');
      }

      if (!vid) {
        vid = 'vtx_vis_' + this.generateUuid();
        try {
          localStorage.setItem('vortex_vid', vid);
        } catch (e) {}
        this.setCookie('vortex_vid', vid, 365);
      }
      return vid;
    }

    getOrCreateSessionId() {
      let sid = null;
      try {
        sid = sessionStorage.getItem('vortex_sid');
      } catch (e) {}

      if (!sid) {
        sid = 'vtx_ses_' + this.generateUuid();
        try {
          sessionStorage.setItem('vortex_sid', sid);
        } catch (e) {}
      }
      return sid;
    }

    getUserContext() {
      let userId = null;
      let userType = 'anonymous';

      if (window.app && window.app.currentUser) {
        userId = window.app.currentUser.id || null;
        userType = window.app.currentUser.isGuest ? 'guest' : 'registered';
      }
      return { userId, userType };
    }

    // =======================================================================
    // INITIALIZATION & EVENT LISTENERS
    // =======================================================================

    init() {
      if (this.isInitialized) return;
      this.isInitialized = true;

      // 1. Initial Page View Tracking
      this.trackPageView(window.location.pathname + window.location.hash);

      // 2. Instrument APK Download Buttons
      this.instrumentDownloadLinks();

      // 3. Heartbeat loop (every 30 seconds)
      setInterval(() => this.sendHeartbeat(), 30000);

      // 4. Session Exit Handlers (beforeunload / visibilitychange)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.sendHeartbeat(true);
        }
      });
      window.addEventListener('beforeunload', () => {
        this.sendHeartbeat(true);
      });

      // 5. Global Error Listeners
      window.addEventListener('error', (event) => {
        this.reportError('client_js', event.message, event.error ? event.error.stack : null, event.filename);
      });

      window.addEventListener('unhandledrejection', (event) => {
        const msg = event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled Promise Rejection';
        const stack = event.reason ? event.reason.stack : null;
        this.reportError('client_promise', msg, stack);
      });

      // 6. WebGL Context Loss Listener
      window.addEventListener('webglcontextlost', () => {
        this.reportError('webgl', 'WebGL Rendering Context Lost', null);
      }, false);

      // 7. Hashchange listener
      window.addEventListener('hashchange', () => {
        this.trackPageView(window.location.pathname + window.location.hash);
      });

      // 8. Hook into App screen transitions
      this.hookAppNavigation();

      // 9. Start WebSocket Ping Monitoring
      this.startPingLoop();
    }

    // =======================================================================
    // API CALL HELPERS
    // =======================================================================

    sendBeaconOrFetch(endpoint, data) {
      const payload = JSON.stringify(data);
      if (navigator.sendBeacon) {
        try {
          const blob = new Blob([payload], { type: 'application/json' });
          if (navigator.sendBeacon(endpoint, blob)) {
            return;
          }
        } catch (e) {}
      }

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }

    // =======================================================================
    // TRACKING METHODS
    // =======================================================================

    trackPageView(path) {
      const { userId, userType } = this.getUserContext();
      const payload = {
        type: 'visit',
        visitorId: this.visitorId,
        sessionId: this.sessionId,
        userId,
        userType,
        path: path || window.location.pathname,
        referrer: document.referrer || '',
        screenResolution: `${window.innerWidth}x${window.innerHeight}`
      };
      this.sendBeaconOrFetch('/api/analytics/track', payload);
    }

    trackScreenView(screenName) {
      this.currentScreen = screenName;
      this.trackPageView(`/screen-${screenName}`);
    }

    trackEvent(category, eventName, data = {}) {
      const { userId, userType } = this.getUserContext();
      const payload = {
        type: 'event',
        visitorId: this.visitorId,
        sessionId: this.sessionId,
        userId,
        userType,
        category,
        eventName,
        data
      };
      this.sendBeaconOrFetch('/api/analytics/track', payload);
    }

    trackGameLaunch(mode = 'vs_ai', mapId = 'house') {
      this.isInGame = true;
      this.gameStartTime = Date.now();
      this.trackEvent('game', 'game_launch', {
        mode,
        mapId,
        screen: this.currentScreen
      });
    }

    trackGameEnd(outcome = 'completed') {
      if (this.isInGame && this.gameStartTime > 0) {
        const duration = Math.round((Date.now() - this.gameStartTime) / 1000);
        this.totalPlayTime += duration;
        this.isInGame = false;
        this.trackEvent('game', 'game_session_finished', {
          outcome,
          durationSeconds: duration
        });
      }
    }

    trackDownloadClick(source = 'direct') {
      const payload = {
        visitorId: this.visitorId,
        sessionId: this.sessionId,
        source,
        version: '1.0.0'
      };
      this.sendBeaconOrFetch('/api/analytics/download-click', payload);
    }

    reportError(errorType, message, stack = null, path = null) {
      const { userId } = this.getUserContext();
      const payload = {
        errorType,
        statusCode: 500,
        message: String(message).slice(0, 500),
        stack: stack ? String(stack).slice(0, 2000) : null,
        path: path || window.location.pathname,
        visitorId: this.visitorId,
        userId
      };
      this.sendBeaconOrFetch('/api/analytics/error', payload);
    }

    sendHeartbeat(isExit = false) {
      let playTimeDelta = 0;
      if (this.isInGame && this.gameStartTime > 0) {
        const now = Date.now();
        playTimeDelta = Math.round((now - this.lastHeartbeatTime) / 1000);
        this.totalPlayTime += playTimeDelta;
      }
      this.lastHeartbeatTime = Date.now();

      const payload = {
        visitorId: this.visitorId,
        sessionId: this.sessionId,
        currentPath: window.location.pathname + (window.location.hash || ''),
        playTimeSeconds: playTimeDelta,
        isExit
      };
      this.sendBeaconOrFetch('/api/analytics/heartbeat', payload);
    }

    // =======================================================================
    // AUTOMATIC APK DOWNLOAD LINK INSTRUMENTATION
    // =======================================================================

    instrumentDownloadLinks() {
      const attachListeners = () => {
        const links = document.querySelectorAll('a[href="/download"], a[href="/VortexArena.apk"], a[href*="download"], a[download="VortexArena.apk"], [data-track-download]');
        links.forEach((link) => {
          if (link.dataset.analyticsBound) return;
          link.dataset.analyticsBound = 'true';

          let source = link.getAttribute('data-track-download') || 'direct_url';
          if (!source || source === 'direct_url') {
            const container = link.closest('.creator-showcase-box, .hero-actions, .landing-card, #modal-mobile-download, footer');
            if (container) {
              if (container.classList.contains('creator-showcase-box')) source = 'creator_cta';
              else if (container.id === 'modal-mobile-download') source = 'modal';
              else if (container.tagName.toLowerCase() === 'footer') source = 'footer';
              else if (container.classList.contains('hero-actions')) source = 'hero_actions';
              else source = 'landing_card';
            }
          }

          // Append visitor and session ID parameters to the URL for server correlation
          const href = link.getAttribute('href');
          if (href && (href.startsWith('/download') || href.startsWith('/VortexArena.apk'))) {
            const separator = href.includes('?') ? '&' : '?';
            link.setAttribute('href', `${href}${separator}vid=${encodeURIComponent(this.visitorId)}&sid=${encodeURIComponent(this.sessionId)}&src=${encodeURIComponent(source)}`);
          }

          link.addEventListener('click', () => {
            this.trackDownloadClick(source);
          });
        });
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachListeners);
      } else {
        attachListeners();
      }
    }

    // =======================================================================
    // APP HOOKS & WEBSOCKET PING
    // =======================================================================

    hookAppNavigation() {
      const self = this;
      const tryHook = () => {
        if (!window.app) {
          setTimeout(tryHook, 200);
          return;
        }

        // Hook navigateTo
        const origNavigateTo = window.app.navigateTo.bind(window.app);
        window.app.navigateTo = function (screenId) {
          self.trackScreenView(screenId);
          return origNavigateTo(screenId);
        };

        // Hook enterGameplay
        const origEnterGameplay = window.app.enterGameplay.bind(window.app);
        window.app.enterGameplay = function (matchData) {
          self.trackGameLaunch(matchData?.gameMode || 'ffa', matchData?.mapId || 'house');
          return origEnterGameplay(matchData);
        };

        // Hook handleMatchEnded
        const origHandleMatchEnded = window.app.handleMatchEnded.bind(window.app);
        window.app.handleMatchEnded = function (data) {
          self.trackGameEnd('completed');
          return origHandleMatchEnded(data);
        };

        // Hook leaveLobby / cancelMatchmaking for abandonment tracking
        const origLeaveLobby = window.app.leaveLobby.bind(window.app);
        window.app.leaveLobby = function () {
          self.trackGameEnd('lobby_left');
          return origLeaveLobby();
        };
      };

      tryHook();
    }

    startPingLoop() {
      // Periodically measure real-time latency with game server
      setInterval(() => {
        if (window.netClient && window.netClient.isConnected && window.netClient.ws && window.netClient.ws.readyState === WebSocket.OPEN) {
          const clientTime = Date.now();
          window.netClient.send('ping', { clientTime });
        }
      }, 5000);

      // Listen for pong messages
      const checkNet = () => {
        if (window.netClient) {
          window.netClient.on('pong', (data) => {
            if (data && data.clientTime) {
              const rtt = Date.now() - data.clientTime;
              this.recentPings.push(rtt);
              if (this.recentPings.length > 30) this.recentPings.shift();

              // Calculate median ping
              const sorted = [...this.recentPings].sort((a, b) => a - b);
              const median = sorted[Math.floor(sorted.length / 2)];

              // Report every 30 seconds
              if (this.recentPings.length % 6 === 0) {
                window.netClient.send('latency_report', { ping: median });
                this.sendBeaconOrFetch('/api/analytics/performance', { pingMs: median });
              }
            }
          });
        } else {
          setTimeout(checkNet, 500);
        }
      };
      checkNet();
    }
  }

  // Instantiate globally
  window.vortexAnalytics = new VortexAnalyticsTracker();
})();
