/**
 * Vortex Arena - Analytics, Telemetry & Operations Monitoring Service
 * 
 * Provides end-to-end collection, aggregation, real-time monitoring,
 * and reporting for website traffic, APK downloads, player engagement,
 * multiplayer network performance, and technical reliability.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const config = require('../config');

class AnalyticsService {
  constructor() {
    // In-memory rolling latency buffer for real-time median / p95 calculation
    this.recentPings = [];
    this.maxPingBufferSize = 300;

    // Tick performance tracking
    this.recentTickTimes = [];
    this.maxTickBufferSize = 100;

    // Periodic performance snapshot timer
    this.snapshotTimer = null;
    this.roomManagerRef = null;
    this.wssRef = null;
  }

  init({ roomManager, wss }) {
    this.roomManagerRef = roomManager;
    this.wssRef = wss;

    // Record initial performance snapshot and schedule periodic 60s snapshots
    if (!this.snapshotTimer) {
      this.recordPerformanceSnapshot();
      this.snapshotTimer = setInterval(() => {
        this.recordPerformanceSnapshot();
      }, 60000);
      if (this.snapshotTimer.unref) this.snapshotTimer.unref();
    }
  }

  // =========================================================================
  // PARSING & FINGERPRINTING HELPERS
  // =========================================================================

  parseUserAgent(uaString = '') {
    const ua = String(uaString).toLowerCase();
    
    // Device Category
    let deviceCategory = 'desktop';
    if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
      deviceCategory = 'tablet';
    } else if (/mobile|iphone|ipod|android.*mobile|blackberry|phone|iemobile/i.test(ua)) {
      deviceCategory = 'mobile';
    }

    // Operating System
    let os = 'Unknown';
    if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
    else if (/windows/i.test(ua)) os = 'Windows';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/cros/i.test(ua)) os = 'ChromeOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    // Browser
    let browser = 'Unknown';
    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
    else if (/samsungbrowser/i.test(ua)) browser = 'Samsung Internet';
    else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';

    return { deviceCategory, os, browser };
  }

  parseReferrerHost(referrerUrl = '') {
    if (!referrerUrl || typeof referrerUrl !== 'string' || referrerUrl.trim() === '') {
      return 'direct';
    }
    try {
      const parsed = new URL(referrerUrl);
      const host = parsed.hostname.toLowerCase();
      if (host.includes('google')) return 'Google Search';
      if (host.includes('bing')) return 'Bing Search';
      if (host.includes('duckduckgo')) return 'DuckDuckGo';
      if (host.includes('twitter') || host.includes('x.com')) return 'Twitter / X';
      if (host.includes('facebook') || host.includes('fb.me')) return 'Facebook';
      if (host.includes('reddit')) return 'Reddit';
      if (host.includes('discord')) return 'Discord';
      if (host.includes('youtube')) return 'YouTube';
      if (host.includes('render.com')) return 'Render Internal';
      return host.replace(/^www\./, '');
    } catch (e) {
      return 'other';
    }
  }

  hashIp(ip) {
    if (!ip) return 'anonymous';
    return crypto.createHash('sha256')
      .update(String(ip) + (config.JWT_SECRET || 'salt'))
      .digest('hex')
      .substring(0, 16);
  }

  // =========================================================================
  // DATA INGESTION
  // =========================================================================

  /**
   * Record page visit & session initialization/continuation
   */
  recordVisit({ visitorId, sessionId, userId = null, userType = 'anonymous', path = '/', referrer = '', userAgent = '', screenResolution = '' }) {
    if (!visitorId || !sessionId) return { success: false, error: 'visitorId and sessionId required' };

    const { deviceCategory, os, browser } = this.parseUserAgent(userAgent);
    const referrerHost = this.parseReferrerHost(referrer);

    try {
      // 1. Upsert Visitor
      const existingVisitor = db.prepare('SELECT visitor_id FROM analytics_visitors WHERE visitor_id = ?').get(visitorId);
      if (existingVisitor) {
        db.prepare(`
          UPDATE analytics_visitors 
          SET last_seen_at = CURRENT_TIMESTAMP, 
              total_visits = total_visits + 1,
              user_id = COALESCE(?, user_id)
          WHERE visitor_id = ?
        `).run(userId, visitorId);
      } else {
        db.prepare(`
          INSERT INTO analytics_visitors (visitor_id, first_seen_at, last_seen_at, total_visits, user_id)
          VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, ?)
        `).run(visitorId, userId);
      }

      // 2. Upsert Session
      const existingSession = db.prepare('SELECT session_id, page_views FROM analytics_sessions WHERE session_id = ?').get(sessionId);
      if (existingSession) {
        db.prepare(`
          UPDATE analytics_sessions
          SET last_active_at = CURRENT_TIMESTAMP,
              exit_page = ?,
              page_views = page_views + 1,
              user_id = COALESCE(?, user_id),
              user_type = CASE WHEN ? != 'anonymous' THEN ? ELSE user_type END
          WHERE session_id = ?
        `).run(path, userId, userType, userType, sessionId);
      } else {
        db.prepare(`
          INSERT INTO analytics_sessions (
            session_id, visitor_id, user_id, user_type, started_at, last_active_at,
            device_category, browser, os, referrer, referrer_host, landing_page, exit_page, page_views
          ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          sessionId, visitorId, userId, userType,
          deviceCategory, browser, os, referrer || '', referrerHost, path, path
        );
      }

      // 3. Record page_view event
      db.prepare(`
        INSERT INTO analytics_events (visitor_id, session_id, user_id, user_type, category, event_name, event_data)
        VALUES (?, ?, ?, ?, 'traffic', 'page_view', ?)
      `).run(visitorId, sessionId, userId, userType, JSON.stringify({ path, screenResolution, deviceCategory, browser, os }));

      return { success: true };
    } catch (err) {
      console.error('[Analytics] Error recording visit:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Heartbeat ping to update session duration and last active timestamp accurately
   */
  recordHeartbeat({ visitorId, sessionId, currentPath = '/', playTimeSeconds = 0 }) {
    if (!sessionId) return { success: false };
    try {
      db.prepare(`
        UPDATE analytics_sessions
        SET last_active_at = CURRENT_TIMESTAMP,
            exit_page = ?,
            duration_seconds = MAX(duration_seconds, CAST((strftime('%s', 'now') - strftime('%s', started_at)) AS INTEGER))
        WHERE session_id = ?
      `).run(currentPath, sessionId);

      if (visitorId && playTimeSeconds > 0) {
        db.prepare(`
          UPDATE analytics_visitors
          SET last_seen_at = CURRENT_TIMESTAMP,
              total_play_time = total_play_time + ?
          WHERE visitor_id = ?
        `).run(Math.round(playTimeSeconds), visitorId);
      }

      return { success: true };
    } catch (err) {
      console.error('[Analytics] Error recording heartbeat:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Generic high-value interaction event
   */
  recordEvent({ visitorId, sessionId, userId = null, userType = 'anonymous', category, eventName, data = {} }) {
    if (!category || !eventName) return { success: false, error: 'category and eventName required' };

    try {
      db.prepare(`
        INSERT INTO analytics_events (visitor_id, session_id, user_id, user_type, category, event_name, event_data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        visitorId || null,
        sessionId || null,
        userId || null,
        userType || 'anonymous',
        category,
        eventName,
        data ? JSON.stringify(data) : null
      );

      // Side-effect updates on session
      if (sessionId) {
        if (eventName === 'game_launch') {
          db.prepare('UPDATE analytics_sessions SET game_launched = 1, last_active_at = CURRENT_TIMESTAMP WHERE session_id = ?').run(sessionId);
        } else if (eventName === 'match_start') {
          db.prepare('UPDATE analytics_sessions SET matches_played = matches_played + 1, last_active_at = CURRENT_TIMESTAMP WHERE session_id = ?').run(sessionId);
        }
      }

      return { success: true };
    } catch (err) {
      console.error('[Analytics] Error recording event:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Record APK download click (intent) from website or modal
   */
  recordApkDownloadClick({ visitorId = null, sessionId = null, source = 'direct', version = '1.0.0', userAgent = '' }) {
    const { deviceCategory } = this.parseUserAgent(userAgent);
    try {
      db.prepare(`
        INSERT INTO analytics_apk_downloads (visitor_id, session_id, version, source, status, user_agent, device_category)
        VALUES (?, ?, ?, ?, 'clicked', ?, ?)
      `).run(visitorId, sessionId, version, source, userAgent, deviceCategory);

      this.recordEvent({
        visitorId,
        sessionId,
        category: 'download',
        eventName: 'apk_download_click',
        data: { source, version, deviceCategory }
      });

      return { success: true };
    } catch (err) {
      console.error('[Analytics] Error recording APK download click:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Record completed or interrupted APK download request served by backend
   */
  recordApkDownloadServed({ visitorId = null, sessionId = null, ip = '', version = '1.0.0', source = 'direct', status = 'served', bytesSent = 0, durationMs = 0, errorMessage = null, userAgent = '' }) {
    const { deviceCategory } = this.parseUserAgent(userAgent);
    const ipHash = this.hashIp(ip);

    try {
      db.prepare(`
        INSERT INTO analytics_apk_downloads (
          visitor_id, session_id, ip_hash, version, source, status, bytes_sent, duration_ms, error_message, user_agent, device_category
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(visitorId, sessionId, ipHash, version, source, status, bytesSent, durationMs, errorMessage, userAgent, deviceCategory);

      this.recordEvent({
        visitorId,
        sessionId,
        category: 'download',
        eventName: status === 'served' ? 'apk_download_success' : 'apk_download_error',
        data: { version, source, status, bytesSent, durationMs, errorMessage, deviceCategory }
      });

      return { success: true };
    } catch (err) {
      console.error('[Analytics] Error recording served APK download:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Record client or server technical error
   */
  recordError({ errorType = 'general', statusCode = 500, message = 'Unknown error', stack = null, path = null, visitorId = null, userId = null, userAgent = '' }) {
    try {
      db.prepare(`
        INSERT INTO analytics_errors (error_type, status_code, message, stack, path, visitor_id, user_id, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        errorType,
        statusCode || 500,
        String(message).substring(0, 500),
        stack ? String(stack).substring(0, 2000) : null,
        path || null,
        visitorId || null,
        userId || null,
        userAgent ? String(userAgent).substring(0, 300) : null
      );

      return { success: true };
    } catch (err) {
      console.error('[Analytics] Error logging error record:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Ingest client latency report (ping in ms)
   */
  recordLatencyPing(pingMs) {
    if (typeof pingMs !== 'number' || isNaN(pingMs) || pingMs <= 0 || pingMs > 5000) return;
    this.recentPings.push(Math.round(pingMs));
    if (this.recentPings.length > this.maxPingBufferSize) {
      this.recentPings.shift();
    }
  }

  /**
   * Record server tick timing
   */
  recordTickDuration(ms) {
    if (typeof ms === 'number' && !isNaN(ms)) {
      this.recentTickTimes.push(ms);
      if (this.recentTickTimes.length > this.maxTickBufferSize) {
        this.recentTickTimes.shift();
      }
    }
  }

  /**
   * Capture periodic server & multiplayer state snapshot
   */
  recordPerformanceSnapshot() {
    try {
      const live = this.getLiveStatus();
      db.prepare(`
        INSERT INTO analytics_performance (
          active_players, active_rooms, active_matches, bot_count, ws_clients,
          ping_median_ms, ping_p95_ms, tick_rate, tick_duration_ms, memory_rss_mb, memory_heap_mb
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        live.activePlayers,
        live.activeRooms,
        live.activeMatches,
        live.botCount,
        live.wsConnected,
        live.ping.median,
        live.ping.p95,
        live.serverTickRate,
        live.avgTickDurationMs,
        live.memoryRssMb,
        live.memoryHeapMb
      );
    } catch (err) {
      // Non-fatal snapshot recording error
      console.warn('[Analytics] Snapshot error:', err.message);
    }
  }

  // =========================================================================
  // REAL-TIME MULTIPLAYER PULSE
  // =========================================================================

  getLiveStatus() {
    let activeRooms = 0;
    let activeMatches = 0;
    let activePlayers = 0;
    let botCount = 0;

    if (this.roomManagerRef && this.roomManagerRef.rooms) {
      activeRooms = this.roomManagerRef.rooms.size;
      for (const room of this.roomManagerRef.rooms.values()) {
        if (room.state === 'active' || room.state === 'countdown') {
          activeMatches++;
        }
        for (const p of room.players.values()) {
          if (p.isBot) botCount++;
          else activePlayers++;
        }
      }
    }

    const wsConnected = (this.wssRef && this.wssRef.clients) 
      ? this.wssRef.clients.size 
      : (this.roomManagerRef ? this.roomManagerRef.connectedSockets.size : 0);

    // Calculate median and p95 ping from recent ping buffer
    let medianPing = 0;
    let p95Ping = 0;
    let p99Ping = 0;
    if (this.recentPings.length > 0) {
      const sorted = [...this.recentPings].sort((a, b) => a - b);
      medianPing = sorted[Math.floor(sorted.length * 0.5)];
      p95Ping = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
      p99Ping = sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1];
    }

    // Average tick execution time
    let avgTickDurationMs = 0;
    if (this.recentTickTimes.length > 0) {
      const sum = this.recentTickTimes.reduce((acc, v) => acc + v, 0);
      avgTickDurationMs = Number((sum / this.recentTickTimes.length).toFixed(2));
    }

    const mem = process.memoryUsage();

    return {
      activeRooms,
      activeMatches,
      activePlayers,
      botCount,
      totalCombatants: activePlayers + botCount,
      wsConnected,
      serverTickRate: config.TICK_RATE || 30,
      avgTickDurationMs,
      serverUptimeSeconds: Math.floor(process.uptime()),
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      memoryHeapMb: Math.round(mem.heapUsed / 1024 / 1024),
      ping: {
        median: medianPing,
        p95: p95Ping,
        p99: p99Ping,
        sampleCount: this.recentPings.length
      }
    };
  }

  // =========================================================================
  // DATE RANGE & COMPARISON QUERY UTILITIES
  // =========================================================================

  resolveDateRange(period = '7d', customStart = null, customEnd = null) {
    const now = new Date();
    let end = new Date(now);
    let start = new Date(now);

    if (period === '24h') {
      start.setHours(start.getHours() - 24);
    } else if (period === '7d') {
      start.setDate(start.getDate() - 7);
    } else if (period === '28d') {
      start.setDate(start.getDate() - 28);
    } else if (period === '90d') {
      start.setDate(start.getDate() - 90);
    } else if (period === 'custom' && customStart && customEnd) {
      start = new Date(customStart);
      end = new Date(customEnd);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        end = new Date(now);
      }
    } else {
      start.setDate(start.getDate() - 7);
    }

    // Compute previous equivalent period with identical duration
    const durationMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start);
    const prevStart = new Date(start.getTime() - durationMs);

    const toSql = (d) => d.toISOString().replace('T', ' ').substring(0, 19);

    return {
      period,
      isHourly: durationMs <= (36 * 3600 * 1000), // Hourly aggregation if <= 36 hours
      durationDays: Math.max(1, Math.round(durationMs / (24 * 3600 * 1000))),
      start: toSql(start),
      end: toSql(end),
      prevStart: toSql(prevStart),
      prevEnd: toSql(prevEnd)
    };
  }

  calcPctChange(current, previous) {
    if (!previous || previous === 0) {
      return current > 0 ? '+100%' : '0%';
    }
    const diff = ((current - previous) / previous) * 100;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(1)}%`;
  }

  // =========================================================================
  // REPORT AGGREGATORS
  // =========================================================================

  /**
   * 1. OVERVIEW DASHBOARD METRICS
   */
  getOverviewMetrics({ period = '7d', customStart = null, customEnd = null }) {
    const range = this.resolveDateRange(period, customStart, customEnd);

    // Current period metrics
    const curVisits = db.prepare(`SELECT COUNT(*) as cnt FROM analytics_events WHERE category = 'traffic' AND event_name = 'page_view' AND created_at BETWEEN ? AND ?`).get(range.start, range.end).cnt || 0;
    const prevVisits = db.prepare(`SELECT COUNT(*) as cnt FROM analytics_events WHERE category = 'traffic' AND event_name = 'page_view' AND created_at BETWEEN ? AND ?`).get(range.prevStart, range.prevEnd).cnt || 0;

    const curUniqueVisitors = db.prepare(`SELECT COUNT(DISTINCT visitor_id) as cnt FROM analytics_sessions WHERE started_at BETWEEN ? AND ?`).get(range.start, range.end).cnt || 0;
    const prevUniqueVisitors = db.prepare(`SELECT COUNT(DISTINCT visitor_id) as cnt FROM analytics_sessions WHERE started_at BETWEEN ? AND ?`).get(range.prevStart, range.prevEnd).cnt || 0;

    const curSessions = db.prepare(`SELECT COUNT(*) as cnt FROM analytics_sessions WHERE started_at BETWEEN ? AND ?`).get(range.start, range.end).cnt || 0;
    const prevSessions = db.prepare(`SELECT COUNT(*) as cnt FROM analytics_sessions WHERE started_at BETWEEN ? AND ?`).get(range.prevStart, range.prevEnd).cnt || 0;

    const curGameLaunches = db.prepare(`SELECT COUNT(*) as cnt FROM analytics_events WHERE event_name = 'game_launch' AND created_at BETWEEN ? AND ?`).get(range.start, range.end).cnt || 0;
    const prevGameLaunches = db.prepare(`SELECT COUNT(*) as cnt FROM analytics_events WHERE event_name = 'game_launch' AND created_at BETWEEN ? AND ?`).get(range.prevStart, range.prevEnd).cnt || 0;

    const curApkDownloads = db.prepare(`SELECT COUNT(*) as cnt FROM analytics_apk_downloads WHERE status = 'served' AND created_at BETWEEN ? AND ?`).get(range.start, range.end).cnt || 0;
    const prevApkDownloads = db.prepare(`SELECT COUNT(*) as cnt FROM analytics_apk_downloads WHERE status = 'served' AND created_at BETWEEN ? AND ?`).get(range.prevStart, range.prevEnd).cnt || 0;

    const curErrors = db.prepare(`SELECT COUNT(*) as cnt FROM analytics_errors WHERE created_at BETWEEN ? AND ?`).get(range.start, range.end).cnt || 0;
    const prevErrors = db.prepare(`SELECT COUNT(*) as cnt FROM analytics_errors WHERE created_at BETWEEN ? AND ?`).get(range.prevStart, range.prevEnd).cnt || 0;

    const curConversionRate = curUniqueVisitors > 0 ? ((curGameLaunches / curUniqueVisitors) * 100).toFixed(1) : '0.0';
    const prevConversionRate = prevUniqueVisitors > 0 ? ((prevGameLaunches / prevUniqueVisitors) * 100).toFixed(1) : '0.0';

    // Time-series trend for chart (hourly or daily)
    const timeGroupSql = range.isHourly 
      ? `strftime('%Y-%m-%d %H:00', created_at)`
      : `strftime('%Y-%m-%d', created_at)`;

    const trendRows = db.prepare(`
      SELECT 
        ${timeGroupSql} as time_bucket,
        SUM(CASE WHEN category = 'traffic' AND event_name = 'page_view' THEN 1 ELSE 0 END) as visits,
        SUM(CASE WHEN event_name = 'game_launch' THEN 1 ELSE 0 END) as game_launches,
        SUM(CASE WHEN category = 'download' AND event_name = 'apk_download_success' THEN 1 ELSE 0 END) as apk_downloads
      FROM analytics_events
      WHERE created_at BETWEEN ? AND ?
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `).all(range.start, range.end);

    const live = this.getLiveStatus();

    return {
      dateRange: range,
      livePulse: live,
      kpis: {
        totalVisits: { value: curVisits, change: this.calcPctChange(curVisits, prevVisits) },
        uniqueVisitors: { value: curUniqueVisitors, change: this.calcPctChange(curUniqueVisitors, prevUniqueVisitors) },
        totalSessions: { value: curSessions, change: this.calcPctChange(curSessions, prevSessions) },
        gameLaunches: { value: curGameLaunches, change: this.calcPctChange(curGameLaunches, prevGameLaunches) },
        conversionRate: { value: `${curConversionRate}%`, change: this.calcPctChange(parseFloat(curConversionRate), parseFloat(prevConversionRate)) },
        apkDownloads: { value: curApkDownloads, change: this.calcPctChange(curApkDownloads, prevApkDownloads) },
        activeCombatants: { value: live.totalCombatants, change: 'real-time' },
        systemErrors: { value: curErrors, change: this.calcPctChange(curErrors, prevErrors) }
      },
      trend: trendRows
    };
  }

  /**
   * 2. WEBSITE TRAFFIC ANALYTICS
   */
  getTrafficMetrics({ period = '7d', customStart = null, customEnd = null }) {
    const range = this.resolveDateRange(period, customStart, customEnd);

    const timeGroupSql = range.isHourly 
      ? `strftime('%Y-%m-%d %H:00', started_at)`
      : `strftime('%Y-%m-%d', started_at)`;

    // Traffic volume over time
    const timeSeries = db.prepare(`
      SELECT 
        ${timeGroupSql} as bucket,
        COUNT(session_id) as sessions,
        COUNT(DISTINCT visitor_id) as visitors,
        SUM(page_views) as page_views,
        SUM(CASE WHEN game_launched = 1 THEN 1 ELSE 0 END) as game_launches
      FROM analytics_sessions
      WHERE started_at BETWEEN ? AND ?
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(range.start, range.end);

    // New vs Returning Visitors
    const newVisitorsCount = db.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as cnt
      FROM analytics_visitors
      WHERE first_seen_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    const totalPeriodVisitors = db.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as cnt
      FROM analytics_sessions
      WHERE started_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    const returningVisitorsCount = Math.max(0, totalPeriodVisitors - newVisitorsCount);

    // Top Pages / Screens
    const topPages = db.prepare(`
      SELECT 
        COALESCE(json_extract(event_data, '$.path'), '/') as page_path,
        COUNT(*) as views
      FROM analytics_events
      WHERE category = 'traffic' AND event_name = 'page_view' AND created_at BETWEEN ? AND ?
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT 15
    `).all(range.start, range.end);

    // Traffic Sources / Referrers
    const referrers = db.prepare(`
      SELECT 
        COALESCE(NULLIF(referrer_host, ''), 'direct') as source_host,
        COUNT(*) as session_count
      FROM analytics_sessions
      WHERE started_at BETWEEN ? AND ?
      GROUP BY source_host
      ORDER BY session_count DESC
      LIMIT 12
    `).all(range.start, range.end);

    // Device Category Breakdown
    const devices = db.prepare(`
      SELECT 
        device_category,
        COUNT(*) as count
      FROM analytics_sessions
      WHERE started_at BETWEEN ? AND ?
      GROUP BY device_category
      ORDER BY count DESC
    `).all(range.start, range.end);

    // Browser Breakdown
    const browsers = db.prepare(`
      SELECT 
        browser,
        COUNT(*) as count
      FROM analytics_sessions
      WHERE started_at BETWEEN ? AND ?
      GROUP BY browser
      ORDER BY count DESC
      LIMIT 8
    `).all(range.start, range.end);

    // OS Breakdown
    const operatingSystems = db.prepare(`
      SELECT 
        os,
        COUNT(*) as count
      FROM analytics_sessions
      WHERE started_at BETWEEN ? AND ?
      GROUP BY os
      ORDER BY count DESC
      LIMIT 8
    `).all(range.start, range.end);

    // Landing & Exit Pages
    const landingPages = db.prepare(`
      SELECT landing_page, COUNT(*) as sessions
      FROM analytics_sessions
      WHERE started_at BETWEEN ? AND ?
      GROUP BY landing_page
      ORDER BY sessions DESC
      LIMIT 8
    `).all(range.start, range.end);

    const exitPages = db.prepare(`
      SELECT exit_page, COUNT(*) as exits
      FROM analytics_sessions
      WHERE started_at BETWEEN ? AND ?
      GROUP BY exit_page
      ORDER BY exits DESC
      LIMIT 8
    `).all(range.start, range.end);

    return {
      dateRange: range,
      summary: {
        totalVisitors: totalPeriodVisitors,
        newVisitors: newVisitorsCount,
        returningVisitors: returningVisitorsCount,
        newVsReturningRatio: totalPeriodVisitors > 0 ? ((returningVisitorsCount / totalPeriodVisitors) * 100).toFixed(1) : '0.0'
      },
      timeSeries,
      topPages,
      referrers,
      devices,
      browsers,
      operatingSystems,
      landingPages,
      exitPages
    };
  }

  /**
   * 3. APK DOWNLOAD ANALYTICS
   */
  getDownloadMetrics({ period = '7d', customStart = null, customEnd = null }) {
    const range = this.resolveDateRange(period, customStart, customEnd);

    // Total clicks, served downloads, unique downloaders
    const totalClicks = db.prepare(`
      SELECT COUNT(*) as cnt FROM analytics_apk_downloads 
      WHERE status = 'clicked' AND created_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    const totalServed = db.prepare(`
      SELECT COUNT(*) as cnt FROM analytics_apk_downloads 
      WHERE status = 'served' AND created_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    const uniqueDownloaders = db.prepare(`
      SELECT COUNT(DISTINCT COALESCE(visitor_id, ip_hash)) as cnt 
      FROM analytics_apk_downloads 
      WHERE status = 'served' AND created_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    const failedOrAborted = db.prepare(`
      SELECT COUNT(*) as cnt FROM analytics_apk_downloads 
      WHERE status IN ('failed', 'aborted', 'not_found') AND created_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    // Conversion rates
    const websiteVisitors = db.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as cnt FROM analytics_sessions 
      WHERE started_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    const visitorConversionRate = websiteVisitors > 0 
      ? ((uniqueDownloaders / websiteVisitors) * 100).toFixed(2) 
      : '0.00';

    const gameLandingVisitors = db.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as cnt FROM analytics_sessions 
      WHERE (landing_page = '/' OR landing_page LIKE '/#%') AND started_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    const landingConversionRate = gameLandingVisitors > 0 
      ? ((uniqueDownloaders / gameLandingVisitors) * 100).toFixed(2) 
      : '0.00';

    // Downloads by day / hour
    const timeGroupSql = range.isHourly 
      ? `strftime('%Y-%m-%d %H:00', created_at)`
      : `strftime('%Y-%m-%d', created_at)`;

    const downloadsTimeline = db.prepare(`
      SELECT 
        ${timeGroupSql} as time_bucket,
        SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END) as clicks,
        SUM(CASE WHEN status = 'served' THEN 1 ELSE 0 END) as successful_downloads,
        SUM(CASE WHEN status IN ('failed', 'aborted', 'not_found') THEN 1 ELSE 0 END) as failed_downloads
      FROM analytics_apk_downloads
      WHERE created_at BETWEEN ? AND ?
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `).all(range.start, range.end);

    // Downloads by source placement
    const sourceBreakdown = db.prepare(`
      SELECT 
        source,
        COUNT(*) as total_events,
        SUM(CASE WHEN status = 'served' THEN 1 ELSE 0 END) as served_count
      FROM analytics_apk_downloads
      WHERE created_at BETWEEN ? AND ?
      GROUP BY source
      ORDER BY served_count DESC
    `).all(range.start, range.end);

    // Downloads by Version
    const versionBreakdown = db.prepare(`
      SELECT 
        version,
        COUNT(*) as requests,
        SUM(CASE WHEN status = 'served' THEN 1 ELSE 0 END) as completed
      FROM analytics_apk_downloads
      WHERE created_at BETWEEN ? AND ?
      GROUP BY version
      ORDER BY completed DESC
    `).all(range.start, range.end);

    // Check physical file health on server
    const apkFileStatus = this.getApkFileStatus();

    // Recent download events
    const recentDownloads = db.prepare(`
      SELECT id, version, source, status, bytes_sent, duration_ms, device_category, error_message, created_at
      FROM analytics_apk_downloads
      WHERE created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(range.start, range.end);

    return {
      dateRange: range,
      kpis: {
        totalClicks,
        totalServed,
        uniqueDownloaders,
        failedOrAborted,
        visitorConversionRate: `${visitorConversionRate}%`,
        landingConversionRate: `${landingConversionRate}%`
      },
      fileHealth: apkFileStatus,
      downloadsTimeline,
      sourceBreakdown,
      versionBreakdown,
      recentDownloads,
      installationTelemetryNotice: {
        type: 'info',
        title: 'Download Fulfillment vs Installation',
        message: 'This dashboard measures genuine HTTP APK download requests and completed file transfers. Actual Android device installation can only be confirmed if the user finishes package verification, sideload prompt, and the app launches with native telemetry enabled.'
      }
    };
  }

  getApkFileStatus() {
    const rootApk = path.join(__dirname, '..', '..', 'VortexArena.apk');
    const publicApk = path.join(__dirname, '..', '..', 'public', 'VortexArena.apk');
    const targetPath = fs.existsSync(rootApk) ? rootApk : (fs.existsSync(publicApk) ? publicApk : null);

    if (!targetPath) {
      return {
        exists: false,
        path: 'VortexArena.apk',
        sizeBytes: 0,
        sizeMb: '0.00',
        lastModified: null,
        status: 'Missing - Needs Build'
      };
    }

    try {
      const stats = fs.statSync(targetPath);
      return {
        exists: true,
        path: path.basename(targetPath),
        sizeBytes: stats.size,
        sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
        lastModified: stats.mtime.toISOString(),
        status: 'Available & Healthy'
      };
    } catch (e) {
      return { exists: false, error: e.message, status: 'File Error' };
    }
  }

  /**
   * 4. PLAYER ENGAGEMENT & RETENTION ANALYTICS
   */
  getEngagementMetrics({ period = '28d', customStart = null, customEnd = null }) {
    const range = this.resolveDateRange(period, customStart, customEnd);

    // DAU (Daily Active Users): avg over period
    const dauRows = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d', started_at) as day,
        COUNT(DISTINCT visitor_id) as dau
      FROM analytics_sessions
      WHERE started_at BETWEEN ? AND ?
      GROUP BY day
      ORDER BY day ASC
    `).all(range.start, range.end);

    const avgDau = dauRows.length > 0 
      ? Math.round(dauRows.reduce((acc, r) => acc + r.dau, 0) / dauRows.length)
      : 0;

    // WAU: Rolling 7-day distinct active users
    const wau = db.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as cnt
      FROM analytics_sessions
      WHERE started_at >= datetime('now', '-7 days')
    `).get().cnt || 0;

    // MAU: Rolling 30-day distinct active users
    const mau = db.prepare(`
      SELECT COUNT(DISTINCT visitor_id) as cnt
      FROM analytics_sessions
      WHERE started_at >= datetime('now', '-30 days')
    `).get().cnt || 0;

    const stickinessRatio = mau > 0 ? ((avgDau / mau) * 100).toFixed(1) : '0.0';

    // Session durations
    const sessionStats = db.prepare(`
      SELECT 
        AVG(duration_seconds) as avg_duration,
        COUNT(*) as total_sessions
      FROM analytics_sessions
      WHERE started_at BETWEEN ? AND ? AND duration_seconds > 0
    `).get(range.start, range.end);

    const avgDurationSeconds = Math.round(sessionStats.avg_duration || 0);

    // Median duration
    const allDurations = db.prepare(`
      SELECT duration_seconds 
      FROM analytics_sessions 
      WHERE started_at BETWEEN ? AND ? AND duration_seconds > 0
      ORDER BY duration_seconds ASC
    `).all(range.start, range.end).map(r => r.duration_seconds);

    const medianDurationSeconds = allDurations.length > 0 
      ? allDurations[Math.floor(allDurations.length / 2)] 
      : 0;

    // Matches started & completed
    const matchesStarted = db.prepare(`
      SELECT COUNT(*) as cnt FROM analytics_events 
      WHERE event_name = 'match_start' AND created_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    const matchesCompleted = db.prepare(`
      SELECT COUNT(*) as cnt FROM matches 
      WHERE created_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    const abandonmentRate = matchesStarted > 0 
      ? (Math.max(0, matchesStarted - matchesCompleted) / matchesStarted * 100).toFixed(1) 
      : '0.0';

    const avgMatchesPerSession = sessionStats.total_sessions > 0
      ? (matchesStarted / sessionStats.total_sessions).toFixed(2)
      : '0.00';

    // Guest vs Authenticated User Activity
    const userTypeSplit = db.prepare(`
      SELECT 
        user_type,
        COUNT(*) as sessions,
        SUM(game_launched) as game_launches,
        SUM(matches_played) as matches_played,
        ROUND(AVG(duration_seconds), 1) as avg_duration_sec
      FROM analytics_sessions
      WHERE started_at BETWEEN ? AND ?
      GROUP BY user_type
    `).all(range.start, range.end);

    // 1-Day, 7-Day, 28-Day Retention Cohort Calculation
    const retentionCohorts = this.computeRetentionCohorts();

    return {
      dateRange: range,
      kpis: {
        dau: avgDau,
        wau,
        mau,
        stickinessRatio: `${stickinessRatio}%`,
        avgSessionDurationSec: avgDurationSeconds,
        medianSessionDurationSec: medianDurationSeconds,
        matchesStarted,
        matchesCompleted,
        avgMatchesPerSession,
        abandonmentRate: `${abandonmentRate}%`
      },
      dauTimeline: dauRows,
      userTypeSplit,
      retentionCohorts
    };
  }

  computeRetentionCohorts() {
    try {
      // Find weekly cohorts over the last 6 weeks
      const cohorts = db.prepare(`
        SELECT 
          strftime('%Y-W%W', first_seen_at) as cohort_week,
          MIN(strftime('%Y-%m-%d', first_seen_at)) as cohort_start,
          COUNT(DISTINCT visitor_id) as cohort_size
        FROM analytics_visitors
        WHERE first_seen_at >= datetime('now', '-42 days')
        GROUP BY cohort_week
        ORDER BY cohort_week DESC
        LIMIT 6
      `).all();

      return cohorts.map(c => {
        const cohortSize = c.cohort_size || 1;
        
        // Day 1 Return
        const day1Returns = db.prepare(`
          SELECT COUNT(DISTINCT s.visitor_id) as cnt
          FROM analytics_sessions s
          JOIN analytics_visitors v ON v.visitor_id = s.visitor_id
          WHERE strftime('%Y-W%W', v.first_seen_at) = ?
            AND strftime('%s', s.started_at) - strftime('%s', v.first_seen_at) BETWEEN 86400 AND 172800
        `).get(c.cohort_week).cnt || 0;

        // Day 7 Return
        const day7Returns = db.prepare(`
          SELECT COUNT(DISTINCT s.visitor_id) as cnt
          FROM analytics_sessions s
          JOIN analytics_visitors v ON v.visitor_id = s.visitor_id
          WHERE strftime('%Y-W%W', v.first_seen_at) = ?
            AND strftime('%s', s.started_at) - strftime('%s', v.first_seen_at) BETWEEN 518400 AND 691200
        `).get(c.cohort_week).cnt || 0;

        // Day 28 Return
        const day28Returns = db.prepare(`
          SELECT COUNT(DISTINCT s.visitor_id) as cnt
          FROM analytics_sessions s
          JOIN analytics_visitors v ON v.visitor_id = s.visitor_id
          WHERE strftime('%Y-W%W', v.first_seen_at) = ?
            AND strftime('%s', s.started_at) - strftime('%s', v.first_seen_at) BETWEEN 2332800 AND 2592000
        `).get(c.cohort_week).cnt || 0;

        return {
          cohortWeek: c.cohort_week,
          startDate: c.cohort_start,
          cohortSize,
          day1Retention: `${((day1Returns / cohortSize) * 100).toFixed(1)}%`,
          day7Retention: `${((day7Returns / cohortSize) * 100).toFixed(1)}%`,
          day28Retention: `${((day28Returns / cohortSize) * 100).toFixed(1)}%`
        };
      });
    } catch (e) {
      console.warn('[Analytics] Cohort computation error:', e.message);
      return [];
    }
  }

  /**
   * 5. MULTIPLAYER PERFORMANCE & SERVER RELIABILITY
   */
  getPerformanceMetrics({ period = '24h', customStart = null, customEnd = null }) {
    const range = this.resolveDateRange(period, customStart, customEnd);

    const live = this.getLiveStatus();

    // Historical performance snapshots
    const snapshots = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d %H:%M', created_at) as time_bucket,
        AVG(active_players) as avg_players,
        MAX(active_players) as peak_players,
        AVG(active_rooms) as avg_rooms,
        AVG(ping_median_ms) as avg_ping_median,
        AVG(ping_p95_ms) as avg_ping_p95,
        AVG(tick_rate) as avg_tick_rate,
        AVG(memory_rss_mb) as avg_memory_rss
      FROM analytics_performance
      WHERE created_at BETWEEN ? AND ?
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
      LIMIT 200
    `).all(range.start, range.end);

    // WebSocket Connection Events Summary
    const wsConnects = db.prepare(`
      SELECT COUNT(*) as cnt FROM analytics_events 
      WHERE event_name = 'ws_connect' AND created_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    const wsDisconnects = db.prepare(`
      SELECT COUNT(*) as cnt FROM analytics_events 
      WHERE event_name = 'ws_disconnect' AND created_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    const wsReconnects = db.prepare(`
      SELECT COUNT(*) as cnt FROM analytics_events 
      WHERE event_name = 'ws_reconnect' AND created_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    // Peak concurrent players in period
    const peakRow = db.prepare(`
      SELECT MAX(active_players) as peak
      FROM analytics_performance
      WHERE created_at BETWEEN ? AND ?
    `).get(range.start, range.end);
    const peakConcurrentPlayers = peakRow ? (peakRow.peak || 0) : live.activePlayers;

    return {
      dateRange: range,
      livePulse: live,
      kpis: {
        peakConcurrentPlayers: Math.max(peakConcurrentPlayers, live.activePlayers),
        currentConnectedSockets: live.wsConnected,
        activeMatches: live.activeMatches,
        serverTickRate: `${live.serverTickRate} Hz`,
        avgTickDuration: `${live.avgTickDurationMs} ms`,
        serverUptime: `${Math.floor(live.serverUptimeSeconds / 3600)}h ${Math.floor((live.serverUptimeSeconds % 3600) / 60)}m`,
        memoryRss: `${live.memoryRssMb} MB`,
        wsConnects,
        wsDisconnects,
        wsReconnects
      },
      latencyDistribution: {
        median: live.ping.median,
        p95: live.ping.p95,
        p99: live.ping.p99,
        sampleCount: live.ping.sampleCount
      },
      timeline: snapshots
    };
  }

  /**
   * 6. ERRORS & RELIABILITY
   */
  getErrorMetrics({ period = '7d', customStart = null, customEnd = null }) {
    const range = this.resolveDateRange(period, customStart, customEnd);

    const totalErrors = db.prepare(`
      SELECT COUNT(*) as cnt FROM analytics_errors
      WHERE created_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 0;

    // Error breakdown by category / type
    const byType = db.prepare(`
      SELECT error_type, COUNT(*) as count
      FROM analytics_errors
      WHERE created_at BETWEEN ? AND ?
      GROUP BY error_type
      ORDER BY count DESC
    `).all(range.start, range.end);

    // Error count timeline
    const timeGroupSql = range.isHourly 
      ? `strftime('%Y-%m-%d %H:00', created_at)`
      : `strftime('%Y-%m-%d', created_at)`;

    const errorTimeline = db.prepare(`
      SELECT 
        ${timeGroupSql} as time_bucket,
        COUNT(*) as error_count
      FROM analytics_errors
      WHERE created_at BETWEEN ? AND ?
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `).all(range.start, range.end);

    // Recent individual error records
    const recentErrors = db.prepare(`
      SELECT id, error_type, status_code, message, stack, path, user_agent, created_at
      FROM analytics_errors
      WHERE created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
      LIMIT 30
    `).all(range.start, range.end);

    // System reliability rate (1 - errors/pageviews)
    const pageViews = db.prepare(`
      SELECT COUNT(*) as cnt FROM analytics_events 
      WHERE category = 'traffic' AND created_at BETWEEN ? AND ?
    `).get(range.start, range.end).cnt || 1;

    const errorRate = ((totalErrors / Math.max(1, pageViews)) * 100).toFixed(2);

    return {
      dateRange: range,
      summary: {
        totalErrors,
        errorRate: `${errorRate}%`,
        healthyScore: `${(100 - Math.min(100, parseFloat(errorRate))).toFixed(1)}%`
      },
      byType,
      errorTimeline,
      recentErrors
    };
  }

  // =========================================================================
  // CSV EXPORT GENERATOR
  // =========================================================================

  generateCsv(reportType = 'overview', period = '7d', customStart = null, customEnd = null) {
    const range = this.resolveDateRange(period, customStart, customEnd);

    if (reportType === 'traffic') {
      const rows = db.prepare(`
        SELECT session_id, visitor_id, started_at, duration_seconds, device_category, browser, os, referrer_host, landing_page, page_views, game_launched
        FROM analytics_sessions
        WHERE started_at BETWEEN ? AND ?
        ORDER BY started_at DESC
        LIMIT 5000
      `).all(range.start, range.end);

      const headers = ['Session ID', 'Visitor ID', 'Started At', 'Duration (s)', 'Device', 'Browser', 'OS', 'Referrer Host', 'Landing Page', 'Page Views', 'Game Launched'];
      const lines = [headers.join(',')];
      for (const r of rows) {
        lines.push([
          `"${r.session_id}"`,
          `"${r.visitor_id}"`,
          `"${r.started_at}"`,
          r.duration_seconds,
          `"${r.device_category}"`,
          `"${r.browser}"`,
          `"${r.os}"`,
          `"${r.referrer_host}"`,
          `"${r.landing_page}"`,
          r.page_views,
          r.game_launched
        ].join(','));
      }
      return lines.join('\n');
    }

    if (reportType === 'downloads') {
      const rows = db.prepare(`
        SELECT id, version, source, status, bytes_sent, duration_ms, device_category, error_message, created_at
        FROM analytics_apk_downloads
        WHERE created_at BETWEEN ? AND ?
        ORDER BY created_at DESC
        LIMIT 5000
      `).all(range.start, range.end);

      const headers = ['ID', 'Version', 'Source', 'Status', 'Bytes Sent', 'Duration (ms)', 'Device', 'Error Message', 'Created At'];
      const lines = [headers.join(',')];
      for (const r of rows) {
        lines.push([
          r.id,
          `"${r.version}"`,
          `"${r.source}"`,
          `"${r.status}"`,
          r.bytes_sent,
          r.duration_ms,
          `"${r.device_category}"`,
          `"${r.error_message || ''}"`,
          `"${r.created_at}"`
        ].join(','));
      }
      return lines.join('\n');
    }

    if (reportType === 'performance') {
      const rows = db.prepare(`
        SELECT id, active_players, active_rooms, active_matches, bot_count, ws_clients, ping_median_ms, ping_p95_ms, tick_rate, tick_duration_ms, memory_rss_mb, created_at
        FROM analytics_performance
        WHERE created_at BETWEEN ? AND ?
        ORDER BY created_at DESC
        LIMIT 5000
      `).all(range.start, range.end);

      const headers = ['ID', 'Active Players', 'Active Rooms', 'Active Matches', 'Bots', 'WS Clients', 'Median Ping (ms)', 'P95 Ping (ms)', 'Tick Rate (Hz)', 'Tick Duration (ms)', 'RAM (MB)', 'Timestamp'];
      const lines = [headers.join(',')];
      for (const r of rows) {
        lines.push([
          r.id,
          r.active_players,
          r.active_rooms,
          r.active_matches,
          r.bot_count,
          r.ws_clients,
          r.ping_median_ms,
          r.ping_p95_ms,
          r.tick_rate,
          r.tick_duration_ms,
          r.memory_rss_mb,
          `"${r.created_at}"`
        ].join(','));
      }
      return lines.join('\n');
    }

    if (reportType === 'errors') {
      const rows = db.prepare(`
        SELECT id, error_type, status_code, message, path, user_agent, created_at
        FROM analytics_errors
        WHERE created_at BETWEEN ? AND ?
        ORDER BY created_at DESC
        LIMIT 5000
      `).all(range.start, range.end);

      const headers = ['ID', 'Error Type', 'Status Code', 'Message', 'Path', 'User Agent', 'Timestamp'];
      const lines = [headers.join(',')];
      for (const r of rows) {
        const cleanMsg = (r.message || '').replace(/"/g, '""');
        lines.push([
          r.id,
          `"${r.error_type}"`,
          r.status_code,
          `"${cleanMsg}"`,
          `"${r.path || ''}"`,
          `"${(r.user_agent || '').replace(/"/g, '""')}"`,
          `"${r.created_at}"`
        ].join(','));
      }
      return lines.join('\n');
    }

    // Default: Overview Daily Aggregation CSV
    const rows = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d', created_at) as date,
        SUM(CASE WHEN category = 'traffic' AND event_name = 'page_view' THEN 1 ELSE 0 END) as visits,
        COUNT(DISTINCT visitor_id) as unique_visitors,
        SUM(CASE WHEN event_name = 'game_launch' THEN 1 ELSE 0 END) as game_launches,
        SUM(CASE WHEN category = 'download' AND event_name = 'apk_download_success' THEN 1 ELSE 0 END) as apk_downloads
      FROM analytics_events
      WHERE created_at BETWEEN ? AND ?
      GROUP BY date
      ORDER BY date ASC
    `).all(range.start, range.end);

    const headers = ['Date', 'Visits', 'Unique Visitors', 'Game Launches', 'APK Downloads'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([`"${r.date}"`, r.visits, r.unique_visitors, r.game_launches, r.apk_downloads].join(','));
    }
    return lines.join('\n');
  }
}

module.exports = new AnalyticsService();
