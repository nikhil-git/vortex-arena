const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Use isolated test database
process.env.DB_PATH = path.join(__dirname, 'test_analytics.sqlite');
if (fs.existsSync(process.env.DB_PATH)) {
  fs.unlinkSync(process.env.DB_PATH);
}

const db = require('../server/database/db');
const { seedDatabase } = require('../server/database/seed');
const config = require('../server/config');
const analyticsService = require('../server/services/analyticsService');
const analyticsController = require('../server/controllers/analyticsController');

test('Setup Analytics Test Database & Schema', async () => {
  await db.init();
  seedDatabase();
  assert.ok(db.isInitialized, 'Database initialized with analytics schema');
});

test('Scenario 1: Website Traffic Ingestion, Sessions & Visitor Counting', () => {
  const visitor1 = 'vtx_vis_test_user_alpha';
  const session1 = 'vtx_ses_alpha_01';

  // Record initial visit
  const res1 = analyticsService.recordVisit({
    visitorId: visitor1,
    sessionId: session1,
    path: '/#about',
    referrer: 'https://www.google.com/search?q=vortex+arena',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    screenResolution: '1920x1080'
  });

  assert.strictEqual(res1.success, true, 'Visit recorded successfully');

  // Verify visitor row
  const visRow = db.prepare('SELECT * FROM analytics_visitors WHERE visitor_id = ?').get(visitor1);
  assert.ok(visRow, 'Visitor row created');
  assert.strictEqual(visRow.total_visits, 1);

  // Verify session row
  const sesRow = db.prepare('SELECT * FROM analytics_sessions WHERE session_id = ?').get(session1);
  assert.ok(sesRow, 'Session row created');
  assert.strictEqual(sesRow.device_category, 'desktop');
  assert.strictEqual(sesRow.browser, 'Chrome');
  assert.strictEqual(sesRow.os, 'macOS');
  assert.strictEqual(sesRow.referrer_host, 'Google Search');

  // Record second visit from same visitor in new session (returning visitor)
  const session2 = 'vtx_ses_alpha_02';
  analyticsService.recordVisit({
    visitorId: visitor1,
    sessionId: session2,
    path: '/#maps',
    referrer: '',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    screenResolution: '390x844'
  });

  const updatedVis = db.prepare('SELECT * FROM analytics_visitors WHERE visitor_id = ?').get(visitor1);
  assert.strictEqual(updatedVis.total_visits, 2, 'Visitor visit count incremented');

  const sesRow2 = db.prepare('SELECT * FROM analytics_sessions WHERE session_id = ?').get(session2);
  assert.strictEqual(sesRow2.device_category, 'mobile');
  assert.strictEqual(sesRow2.browser, 'Safari');
  assert.strictEqual(sesRow2.os, 'iOS');
});

test('Scenario 2: Session Heartbeat & Accurate Duration Tracking', () => {
  const sessionId = 'vtx_ses_alpha_01';
  const visitorId = 'vtx_vis_test_user_alpha';

  const hbRes = analyticsService.recordHeartbeat({
    visitorId,
    sessionId,
    currentPath: '/#weapons',
    playTimeSeconds: 45
  });

  assert.strictEqual(hbRes.success, true, 'Heartbeat recorded');

  const sesRow = db.prepare('SELECT * FROM analytics_sessions WHERE session_id = ?').get(sessionId);
  assert.strictEqual(sesRow.exit_page, '/#weapons');

  const visRow = db.prepare('SELECT * FROM analytics_visitors WHERE visitor_id = ?').get(visitor1 = visitorId);
  assert.strictEqual(visRow.total_play_time, 45, 'Play time accumulated on visitor');
});

test('Scenario 3: APK Download Tracking & Conversion Accounting', () => {
  const visitor = 'vtx_vis_dl_tester';
  const session = 'vtx_ses_dl_tester';

  // 1. Click download button on hero badge
  const clickRes = analyticsService.recordApkDownloadClick({
    visitorId: visitor,
    sessionId: session,
    source: 'hero_badge',
    version: '1.0.0',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
  });
  assert.strictEqual(clickRes.success, true, 'Download click recorded');

  // 2. Serve download from server
  const servedRes = analyticsService.recordApkDownloadServed({
    visitorId: visitor,
    sessionId: session,
    ip: '198.51.100.42',
    version: '1.0.0',
    source: 'hero_badge',
    status: 'served',
    bytesSent: 371712,
    durationMs: 420,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36'
  });
  assert.strictEqual(servedRes.success, true, 'Served download recorded');

  // 3. Verify download metrics report
  const metrics = analyticsService.getDownloadMetrics({ period: '24h' });
  assert.ok(metrics.kpis.totalClicks >= 1, 'Total clicks counted');
  assert.ok(metrics.kpis.totalServed >= 1, 'Total served counted');
  assert.ok(metrics.kpis.uniqueDownloaders >= 1, 'Unique downloaders counted');
  assert.ok(metrics.fileHealth, 'Physical file health reported');
});

test('Scenario 4: Game Launches, Match Tracking & Engagement Metrics', () => {
  const visitor = 'vtx_vis_gamer_01';
  const session = 'vtx_ses_gamer_01';

  // Record visit
  analyticsService.recordVisit({
    visitorId: visitor,
    sessionId: session,
    path: '/',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0'
  });

  // Launch game
  analyticsService.recordEvent({
    visitorId: visitor,
    sessionId: session,
    category: 'game',
    eventName: 'game_launch',
    data: { mode: 'ffa', mapId: 'sector7' }
  });

  // Verify session updated with game_launched flag
  const ses = db.prepare('SELECT game_launched FROM analytics_sessions WHERE session_id = ?').get(session);
  assert.strictEqual(ses.game_launched, 1, 'game_launched flagged on session');

  // Start & complete match
  analyticsService.recordEvent({
    visitorId: visitor,
    sessionId: session,
    category: 'game',
    eventName: 'match_start',
    data: { roomCode: 'ROOM01', gameMode: 'ffa' }
  });

  db.prepare(`
    INSERT INTO matches (id, room_name, game_mode, map_name, player_count, duration_seconds)
    VALUES ('match_test_01', 'Test Arena', 'ffa', 'Sector 7', 4, 180)
  `).run();

  const engMetrics = analyticsService.getEngagementMetrics({ period: '7d' });
  assert.ok(engMetrics.kpis.dau >= 1, 'DAU reported');
  assert.ok(engMetrics.kpis.matchesStarted >= 1, 'Matches started counted');
  assert.ok(engMetrics.kpis.matchesCompleted >= 1, 'Matches completed counted');
  assert.ok(Array.isArray(engMetrics.retentionCohorts), 'Retention cohorts array returned');
});

test('Scenario 5: Real-Time Multiplayer Monitoring, Latency & Tick Rates', () => {
  // Feed latency ping samples
  analyticsService.recordLatencyPing(28);
  analyticsService.recordLatencyPing(34);
  analyticsService.recordLatencyPing(42);
  analyticsService.recordLatencyPing(65);
  analyticsService.recordLatencyPing(110);

  analyticsService.recordTickDuration(2.4);
  analyticsService.recordTickDuration(3.1);

  const live = analyticsService.getLiveStatus();
  assert.ok(live.ping.median > 0, 'Median ping computed');
  assert.ok(live.ping.p95 > 0, 'P95 ping computed');
  assert.strictEqual(live.serverTickRate, 30, 'Server tick rate is 30Hz');
  assert.ok(live.avgTickDurationMs > 0, 'Average tick duration recorded');

  // Performance snapshot
  analyticsService.recordPerformanceSnapshot();
  const perfMetrics = analyticsService.getPerformanceMetrics({ period: '24h' });
  assert.ok(perfMetrics.latencyDistribution.median > 0, 'Latency distribution median reported');
  assert.ok(perfMetrics.timeline.length >= 1, 'Performance timeline recorded');
});

test('Scenario 6: Technical Error Ingestion & Reliability Reporting', () => {
  analyticsService.recordError({
    errorType: 'client_js',
    statusCode: 500,
    message: 'Cannot read property position of undefined',
    stack: 'TypeError at GameEngine.js:142',
    path: '/#gameplay'
  });

  analyticsService.recordError({
    errorType: 'api_4xx',
    statusCode: 404,
    message: 'HTTP 404 Not Found',
    path: '/api/unknown'
  });

  const errMetrics = analyticsService.getErrorMetrics({ period: '7d' });
  assert.strictEqual(errMetrics.summary.totalErrors, 2, '2 errors recorded and aggregated');
  assert.ok(errMetrics.byType.length >= 2, 'Error categories grouped');
  assert.strictEqual(errMetrics.recentErrors.length, 2, 'Recent errors list returned');
});

test('Scenario 7: CSV Report Generation for All Report Types', () => {
  const trafficCsv = analyticsService.generateCsv('traffic', '7d');
  assert.ok(trafficCsv.includes('Session ID'), 'Traffic CSV has header');
  assert.ok(trafficCsv.includes('vtx_ses_alpha_01'), 'Traffic CSV contains recorded session');

  const downloadsCsv = analyticsService.generateCsv('downloads', '7d');
  assert.ok(downloadsCsv.includes('Version'), 'Downloads CSV has header');

  const performanceCsv = analyticsService.generateCsv('performance', '7d');
  assert.ok(performanceCsv.includes('Median Ping (ms)'), 'Performance CSV has header');

  const errorsCsv = analyticsService.generateCsv('errors', '7d');
  assert.ok(errorsCsv.includes('Error Type'), 'Errors CSV has header');

  const overviewCsv = analyticsService.generateCsv('overview', '7d');
  assert.ok(overviewCsv.includes('Unique Visitors'), 'Overview CSV has header');
});

test('Scenario 8: Admin Authentication & Controller Access Control', () => {
  let authRes = null;
  let authStatus = 0;

  // 1. Invalid key attempt
  analyticsController.login({
    body: { key: 'wrong-key-123' }
  }, {
    status(s) { authStatus = s; return this; },
    json(d) { authRes = d; return this; }
  });
  assert.strictEqual(authStatus, 401, 'Invalid admin key rejected with 401');

  // 2. Valid key attempt
  analyticsController.login({
    body: { key: config.ADMIN_KEY }
  }, {
    status(s) { authStatus = s; return this; },
    json(d) { authRes = d; return this; }
  });
  assert.strictEqual(authStatus, 200, 'Valid admin key accepted with 200');
  assert.ok(authRes.token, 'Admin JWT token issued');

  // 3. Middleware rejection with missing token
  let mwRejected = false;
  analyticsController.adminMiddleware({
    headers: {}
  }, {
    status(s) {
      if (s === 401) mwRejected = true;
      return this;
    },
    json() { return this; }
  }, () => {});
  assert.strictEqual(mwRejected, true, 'Unauthenticated request rejected with 401');

  // 4. Middleware acceptance with valid token
  let mwPassed = false;
  const mockReq = {
    headers: { authorization: `Bearer ${authRes.token}` }
  };
  analyticsController.adminMiddleware(mockReq, {}, () => {
    mwPassed = true;
  });
  assert.strictEqual(mwPassed, true, 'Valid admin token passed middleware');
  assert.strictEqual(mockReq.isAdmin, true, 'isAdmin set on request');
});

test('Cleanup Analytics Test Database', () => {
  if (fs.existsSync(process.env.DB_PATH)) {
    fs.unlinkSync(process.env.DB_PATH);
  }
});
