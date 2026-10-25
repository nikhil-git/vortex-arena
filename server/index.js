const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const config = require('./config');
const db = require('./database/db');
const { seedDatabase } = require('./database/seed');

// Services & Controllers
const authController = require('./auth/authController');
const { authMiddleware, verifyWsToken } = require('./auth/authMiddleware');
const friendsService = require('./services/friendsService');
const skinService = require('./services/skinService');
const statsService = require('./services/statsService');
const guestCleanupService = require('./services/GuestCleanupService');
const analyticsService = require('./services/analyticsService');
const analyticsController = require('./controllers/analyticsController');

// Game Engine
const roomManager = require('./game/RoomManager');
const Player = require('./game/Player');
const { MapData } = require('./game/MapData');

// Seed database and start server
async function startServer() {
  try {
    await db.init();
    seedDatabase();

    // Clean up any orphaned guest accounts from prior runs/crashes
    guestCleanupService.purgeOrphanedGuests();
    guestCleanupService.startPeriodicSweep();

    // Initialize real-time analytics monitoring & snapshots
    analyticsService.init({ roomManager, wss });

    server.listen(config.PORT, '0.0.0.0', () => {
      console.log(`=======================================================`);
      console.log(` Vortex Arena Multiplayer Server Running`);
      console.log(` Port: ${config.PORT}`);
      console.log(` Web Client: http://0.0.0.0:${config.PORT}`);
      console.log(` WebSocket: ws://0.0.0.0:${config.PORT}/ws`);
      console.log(` Analytics: http://0.0.0.0:${config.PORT}/analytics`);
      console.log(` Database: ${config.DB_PATH}`);
      console.log(` Max Players Per Room: ${config.MAX_PLAYERS_PER_ROOM}`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Support reverse proxies (Render, Koyeb, Railway, Fly.io, Cloudflare)
app.set('trust proxy', 1);

// Global SEO & Search Indexing response headers
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
  next();
});

// HTTP Request Error Monitoring & Telemetry Middleware
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400 && 
        !req.path.startsWith('/vendor/') && 
        !req.path.endsWith('.ico') && 
        !req.path.endsWith('.png') && 
        !req.path.endsWith('.svg') &&
        !req.path.endsWith('.map')) {
      analyticsService.recordError({
        errorType: res.statusCode >= 500 ? 'api_5xx' : 'api_4xx',
        statusCode: res.statusCode,
        path: req.originalUrl || req.url,
        message: `HTTP ${res.statusCode} ${res.statusMessage || ''}`.trim(),
        userAgent: req.headers['user-agent'] || ''
      });
    }
  });
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Dedicated Analytics & Operations Dashboard routes
app.get(['/analytics', '/admin/analytics'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'analytics', 'index.html'));
});

// Cloud container health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: Math.floor(process.uptime()), timestamp: Date.now() });
});

// Serve three.js modules cleanly for browser import
app.use('/vendor/three', express.static(path.join(__dirname, '..', 'node_modules', 'three', 'build')));

// Direct APK download routes with detailed telemetry & completion verification
function handleApkDownload(req, res) {
  const rootApk = path.join(__dirname, '..', 'VortexArena.apk');
  const publicApk = path.join(__dirname, '..', 'public', 'VortexArena.apk');
  const apkPath = fs.existsSync(rootApk) ? rootApk : (fs.existsSync(publicApk) ? publicApk : rootApk);

  const visitorId = req.query.vid || null;
  const sessionId = req.query.sid || null;
  const source = req.query.src || 'direct_url';
  const clientIp = req.ip || req.headers['x-forwarded-for'] || (req.socket ? req.socket.remoteAddress : '');
  const userAgent = req.headers['user-agent'] || '';
  const startTime = Date.now();

  if (!fs.existsSync(apkPath)) {
    analyticsService.recordApkDownloadServed({
      visitorId,
      sessionId,
      ip: clientIp,
      version: '1.0.0',
      source,
      status: 'not_found',
      errorMessage: 'VortexArena.apk not found on server disk',
      userAgent
    });
    if (!res.headersSent) {
      res.status(404).send('VortexArena.apk not found. Please build it first.');
    }
    return;
  }

  let stats = { size: 0 };
  try {
    stats = fs.statSync(apkPath);
  } catch (e) {}

  let completed = false;

  res.on('finish', () => {
    completed = true;
    const durationMs = Date.now() - startTime;
    analyticsService.recordApkDownloadServed({
      visitorId,
      sessionId,
      ip: clientIp,
      version: '1.0.0',
      source,
      status: 'served',
      bytesSent: stats.size,
      durationMs,
      userAgent
    });
  });

  req.on('close', () => {
    if (!completed && !res.writableEnded) {
      const durationMs = Date.now() - startTime;
      analyticsService.recordApkDownloadServed({
        visitorId,
        sessionId,
        ip: clientIp,
        version: '1.0.0',
        source,
        status: 'aborted',
        bytesSent: res.socket ? (res.socket.bytesWritten || 0) : 0,
        durationMs,
        errorMessage: 'Client closed connection before transfer finished',
        userAgent
      });
    }
  });

  res.download(apkPath, 'VortexArena.apk');
}

app.get('/download', handleApkDownload);
app.get('/VortexArena.apk', handleApkDownload);

// iOS WebClip profile routes disabled - redirect to homepage
app.get(['/vortex-arena.mobileconfig', '/download-ios'], (req, res) => res.redirect(301, '/'));

// -------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------

// Analytics & Telemetry Routes
app.post('/api/analytics/auth', (req, res) => analyticsController.login(req, res));
app.post('/api/analytics/track', (req, res) => analyticsController.track(req, res));
app.post('/api/analytics/heartbeat', (req, res) => analyticsController.heartbeat(req, res));
app.post('/api/analytics/download-click', (req, res) => analyticsController.recordDownloadClick(req, res));
app.post('/api/analytics/error', (req, res) => analyticsController.reportError(req, res));
app.post('/api/analytics/performance', (req, res) => analyticsController.reportPerformance(req, res));

// Protected Analytics Dashboard Query APIs
app.get('/api/analytics/overview', (req, res) => analyticsController.adminMiddleware(req, res, () => analyticsController.getOverview(req, res)));
app.get('/api/analytics/traffic', (req, res) => analyticsController.adminMiddleware(req, res, () => analyticsController.getTraffic(req, res)));
app.get('/api/analytics/downloads', (req, res) => analyticsController.adminMiddleware(req, res, () => analyticsController.getDownloads(req, res)));
app.get('/api/analytics/engagement', (req, res) => analyticsController.adminMiddleware(req, res, () => analyticsController.getEngagement(req, res)));
app.get('/api/analytics/performance', (req, res) => analyticsController.adminMiddleware(req, res, () => analyticsController.getPerformance(req, res)));
app.get('/api/analytics/errors', (req, res) => analyticsController.adminMiddleware(req, res, () => analyticsController.getErrors(req, res)));
app.get('/api/analytics/live', (req, res) => analyticsController.adminMiddleware(req, res, () => analyticsController.getLive(req, res)));
app.get('/api/analytics/export/csv', (req, res) => analyticsController.adminMiddleware(req, res, () => analyticsController.exportCsv(req, res)));

// Auth Routes
app.post('/api/auth/register', (req, res) => authController.register(req, res));
app.post('/api/auth/login', (req, res) => authController.login(req, res));
app.post('/api/auth/guest', (req, res) => authController.guest(req, res));
app.post('/api/auth/logout', authMiddleware, (req, res) => authController.logout(req, res));
app.get('/api/auth/me', authMiddleware, (req, res) => authController.me(req, res));

// Stats & Progression
app.get('/api/stats', authMiddleware, (req, res) => {
  const data = statsService.getUserStats(req.user.id);
  res.json(data);
});

app.get('/api/stats/leaderboard', (req, res) => {
  const topPlayers = db.prepare(`
    SELECT u.id, u.username, s.lifetime_kills, s.lifetime_deaths, s.lifetime_wins, s.lifetime_matches
    FROM stats s
    JOIN users u ON u.id = s.user_id
    ORDER BY s.lifetime_kills DESC, s.lifetime_wins DESC
    LIMIT 25
  `).all();

  res.json({
    leaderboard: topPlayers.map((p, idx) => ({
      rank: idx + 1,
      id: p.id,
      username: p.username,
      kills: p.lifetime_kills,
      deaths: p.lifetime_deaths,
      wins: p.lifetime_wins,
      kd: p.lifetime_deaths > 0 ? (p.lifetime_kills / p.lifetime_deaths).toFixed(2) : p.lifetime_kills.toFixed(2)
    }))
  });
});

// Skins & Customization
app.get('/api/skins/list', authMiddleware, (req, res) => {
  const skins = skinService.getUserSkins(req.user.id);
  res.json({ skins });
});

app.post('/api/skins/equip', authMiddleware, (req, res) => {
  const { skinId } = req.body;
  if (!skinId) return res.status(400).json({ error: 'skinId required' });
  const result = skinService.equipSkin(req.user.id, skinId);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// Friends API
app.get('/api/friends/list', authMiddleware, (req, res) => {
  const list = friendsService.getFriendsList(req.user.id);
  res.json(list);
});

app.get('/api/friends/search', authMiddleware, (req, res) => {
  const query = req.query.q || '';
  const users = friendsService.searchUsers(req.user.id, query);
  res.json({ users });
});

app.post('/api/friends/request', authMiddleware, (req, res) => {
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
  const result = friendsService.sendFriendRequest(req.user.id, targetUserId);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/friends/accept', authMiddleware, (req, res) => {
  const { requestId, senderId } = req.body;
  const result = friendsService.acceptFriendRequest(req.user.id, requestId || senderId);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/friends/decline', authMiddleware, (req, res) => {
  const { requestId, targetUserId } = req.body;
  const result = friendsService.declineOrCancelRequest(req.user.id, requestId || targetUserId);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/friends/remove', authMiddleware, (req, res) => {
  const { friendUserId } = req.body;
  if (!friendUserId) return res.status(400).json({ error: 'friendUserId required' });
  const result = friendsService.removeFriend(req.user.id, friendUserId);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/friends/block', authMiddleware, (req, res) => {
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
  const result = friendsService.blockUser(req.user.id, targetUserId);
  res.json(result);
});

app.post('/api/friends/report', authMiddleware, (req, res) => {
  const { reportedUserId, reason, details } = req.body;
  if (!reportedUserId) return res.status(400).json({ error: 'reportedUserId required' });
  const result = friendsService.reportUser(req.user.id, reportedUserId, reason, details);
  res.json(result);
});

app.post('/api/friends/invite', authMiddleware, (req, res) => {
  const { targetUserId, roomCode } = req.body;
  if (!targetUserId || !roomCode) return res.status(400).json({ error: 'targetUserId and roomCode required' });
  const result = roomManager.sendMatchInvite(req.user, targetUserId, roomCode);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// Match Browser API
app.get('/api/matches/public', (req, res) => {
  const rooms = roomManager.listPublicRooms();
  res.json({ rooms });
});

// Playable Maps Registry API
app.get('/api/maps', (req, res) => {
  res.json({ maps: MapData.getAllMapsSummary() });
});

// -------------------------------------------------------------
// WEBSOCKET REAL-TIME MULTIPLAYER ENGINE
// -------------------------------------------------------------

wss.on('connection', (ws, req) => {
  let authenticatedUser = null;
  let player = null;

  analyticsService.recordEvent({
    category: 'multiplayer',
    eventName: 'ws_connect'
  });

  // Extract token from URL query string if provided
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (token) {
    const decoded = verifyWsToken(token);
    if (decoded) {
      authenticatedUser = decoded;
      guestCleanupService.handleReconnect(decoded.id);
      roomManager.registerSocket(decoded.id, ws);
      friendsService.updateUserStatus(decoded.id, true, 'online');
    }
  }

  ws.on('message', (messageRaw) => {
    try {
      const data = JSON.parse(messageRaw);
      const action = data.action;

      // Real-time ping/pong round-trip latency measurement
      if (action === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          clientTime: data.clientTime,
          serverTime: Date.now()
        }));
        return;
      }

      // Latency report from client
      if (action === 'latency_report') {
        if (typeof data.ping === 'number') {
          analyticsService.recordLatencyPing(data.ping);
        }
        return;
      }

      // Handle Authentication handshake if sent via message
      if (action === 'auth') {
        const decoded = verifyWsToken(data.token);
        if (decoded) {
          authenticatedUser = decoded;
          guestCleanupService.handleReconnect(decoded.id);
          roomManager.registerSocket(decoded.id, ws);
          friendsService.updateUserStatus(decoded.id, true, 'online');
          ws.send(JSON.stringify({ type: 'authenticated', user: decoded }));
        } else {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
        }
        return;
      }

      if (!authenticatedUser) {
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
        return;
      }

      // MATCHMAKING / ROOM ACTIONS
      if (action === 'find_match') {
        // Leave any existing room
        roomManager.leaveRoom(authenticatedUser.id);

        const room = roomManager.findOrCreateMatch({ gameMode: data.gameMode || 'ffa', mapId: data.mapId });
        const equippedSkins = skinService.getEquippedSkins(authenticatedUser.id);
        player = new Player(authenticatedUser.id, authenticatedUser.username, ws, equippedSkins);

        const joinResult = room.addPlayer(player);
        if (!joinResult.success) {
          ws.send(JSON.stringify({ type: 'join_error', message: joinResult.error }));
        } else {
          roomManager.playerToRoom.set(player.id, room.code);
        }
        return;
      }

      if (action === 'create_ai_match') {
        roomManager.leaveRoom(authenticatedUser.id);

        const room = roomManager.createAiMatch({
          difficulty: data.difficulty || 'medium',
          botCount: data.botCount !== undefined ? data.botCount : 5,
          gameMode: data.gameMode || 'ffa',
          scoreLimit: data.scoreLimit || 25,
          matchDuration: data.matchDuration || 300,
          isPractice: Boolean(data.isPractice),
          mapId: data.mapId || 'house',
          hostUserId: authenticatedUser.id
        });

        const equippedSkins = skinService.getEquippedSkins(authenticatedUser.id);
        player = new Player(authenticatedUser.id, authenticatedUser.username, ws, equippedSkins);

        const joinResult = room.addPlayer(player);
        if (!joinResult.success) {
          ws.send(JSON.stringify({ type: 'join_error', message: joinResult.error }));
          return;
        }

        roomManager.playerToRoom.set(player.id, room.code);

        // Populate bots and start single player match with tactical 5-second countdown
        room.initBots(room.botCount, room.aiDifficulty);
        room.startMatch({ countdown: 5 });
        return;
      }

      if (action === 'create_room') {
        roomManager.leaveRoom(authenticatedUser.id);

        const room = roomManager.createRoom({
          isPrivate: Boolean(data.isPrivate),
          gameMode: data.gameMode || 'ffa',
          mapId: data.mapId || 'sector7',
          hostUserId: authenticatedUser.id,
          name: data.roomName || `${authenticatedUser.username}'s Arena`,
          minPlayers: data.isPrivate ? 1 : 2
        });

        const equippedSkins = skinService.getEquippedSkins(authenticatedUser.id);
        player = new Player(authenticatedUser.id, authenticatedUser.username, ws, equippedSkins);
        room.addPlayer(player);
        roomManager.playerToRoom.set(player.id, room.code);
        return;
      }

      if (action === 'set_map') {
        const roomCode = roomManager.playerToRoom.get(authenticatedUser.id);
        const room = roomManager.getRoom(roomCode);
        if (room && room.hostUserId === authenticatedUser.id) {
          const res = room.setMap(data.mapId);
          if (!res.success) {
            ws.send(JSON.stringify({ type: 'map_error', message: res.error }));
          }
        }
        return;
      }

      if (action === 'join_room') {
        const roomCode = data.roomCode ? data.roomCode.toUpperCase().trim() : null;
        if (!roomCode) {
          ws.send(JSON.stringify({ type: 'join_error', message: 'Room code required' }));
          return;
        }

        roomManager.leaveRoom(authenticatedUser.id);
        const equippedSkins = skinService.getEquippedSkins(authenticatedUser.id);
        player = new Player(authenticatedUser.id, authenticatedUser.username, ws, equippedSkins);

        const joinResult = roomManager.joinRoom(roomCode, player);
        if (!joinResult.success) {
          ws.send(JSON.stringify({ type: 'join_error', message: joinResult.error }));
        }
        return;
      }

      if (action === 'start_match') {
        const roomCode = roomManager.playerToRoom.get(authenticatedUser.id);
        const room = roomManager.getRoom(roomCode);
        if (room && room.hostUserId === authenticatedUser.id && (room.state === 'lobby' || room.state === 'waiting')) {
          room.startMatch({ countdown: 5 });
        }
        return;
      }

      if (action === 'leave_room') {
        roomManager.leaveRoom(authenticatedUser.id);
        ws.send(JSON.stringify({ type: 'room_left' }));
        return;
      }

      // IN-GAME REALTIME COMBAT ACTIONS
      const currentRoomCode = roomManager.playerToRoom.get(authenticatedUser.id);
      const room = roomManager.getRoom(currentRoomCode);
      if (!room) return;

      if (action === 'player_input') {
        room.handlePlayerInput(authenticatedUser.id, data);
      } else if (action === 'player_shoot') {
        room.handlePlayerShoot(authenticatedUser.id, data);
      } else if (action === 'player_reload') {
        room.handlePlayerReload(authenticatedUser.id);
      } else if (action === 'switch_weapon') {
        room.handlePlayerSwitchWeapon(authenticatedUser.id, data.weaponId);
      }

    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    analyticsService.recordEvent({
      category: 'multiplayer',
      eventName: 'ws_disconnect',
      userId: authenticatedUser ? authenticatedUser.id : null
    });

    if (authenticatedUser) {
      roomManager.leaveRoom(authenticatedUser.id);
      roomManager.unregisterSocket(authenticatedUser.id);
      friendsService.updateUserStatus(authenticatedUser.id, false, 'offline');
      if (authenticatedUser.isGuest) {
        guestCleanupService.handleDisconnect(authenticatedUser.id, true);
      }
    }
  });

  ws.on('error', (err) => {
    analyticsService.recordError({
      errorType: 'websocket',
      statusCode: 500,
      message: err.message || 'WebSocket client error',
      stack: err.stack,
      userId: authenticatedUser ? authenticatedUser.id : null
    });
  });
});

// Start Server
if (require.main === module) {
  startServer();
}

module.exports = { app, server, startServer };

