const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const config = require('../config');
const skinService = require('../services/skinService');
const statsService = require('../services/statsService');
const guestCleanupService = require('../services/GuestCleanupService');
const tokenRevocationService = require('./tokenRevocationService');

class AuthController {
  register(req, res) {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3 and 20 characters' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return res.status(400).json({ error: 'Username can only contain alphanumeric characters and underscores' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    try {
      const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(trimmedUsername, trimmedEmail);
      if (existingUser) {
        return res.status(409).json({ error: 'Username or email already in use' });
      }

      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(password, salt);

      // Check if registering user has an existing guest session to upgrade
      let guestUserId = null;
      const authHeader = req.headers && req.headers.authorization;
      const candidateToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : (req.body && req.body.guestToken);
      if (candidateToken) {
        try {
          const decoded = jwt.verify(candidateToken, config.JWT_SECRET);
          if (decoded && decoded.isGuest) {
            const guestRecord = db.prepare('SELECT id, is_guest FROM users WHERE id = ?').get(decoded.id);
            if (guestRecord && guestRecord.is_guest === 1) {
              guestUserId = guestRecord.id;
            }
          }
        } catch (e) {}
      }

      let userId;
      if (guestUserId) {
        // Upgrade existing guest account to registered, preserving unique user ID, lifetime kills, stats, and skins!
        db.prepare(`
          UPDATE users 
          SET username = ?, email = ?, password_hash = ?, is_guest = 0, is_online = 1, current_status = 'online'
          WHERE id = ?
        `).run(trimmedUsername, trimmedEmail, passwordHash, guestUserId);
        userId = guestUserId;
        statsService.ensureStatsRow(userId);
      } else {
        const insertUser = db.prepare(`
          INSERT INTO users (username, email, password_hash, is_online, current_status, is_guest)
          VALUES (?, ?, ?, 1, 'online', 0)
        `);
        const result = insertUser.run(trimmedUsername, trimmedEmail, passwordHash);
        userId = result.lastInsertRowid;
        statsService.ensureStatsRow(userId);
      }

      // Assign default free skins
      skinService.assignDefaultSkins(userId);

      // Un-revoke any previous revocation for this user id so new session is valid
      tokenRevocationService.unrevokeUser(userId);

      const token = jwt.sign(
        { id: userId, username: trimmedUsername, email: trimmedEmail, isGuest: false },
        config.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const equippedSkins = skinService.getEquippedSkins(userId);
      const userStats = statsService.getUserStats(userId);

      return res.status(201).json({
        message: 'Account registered successfully',
        token,
        user: {
          id: userId,
          tag: `#${String(userId).padStart(4, '0')}`,
          username: trimmedUsername,
          email: trimmedEmail,
          isGuest: false,
          avatarUrl: '',
          equippedSkins,
          stats: userStats ? userStats.stats : null,
          progression: userStats ? userStats.progression : null
        }
      });
    } catch (err) {
      console.error('Registration error:', err);
      return res.status(500).json({ error: 'Internal server error during registration' });
    }
  }

  login(req, res) {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: 'Username/Email and password are required' });
    }

    const identifier = usernameOrEmail.trim();

    try {
      const user = db.prepare(`
        SELECT * FROM users WHERE username = ? OR email = ?
      `).get(identifier, identifier.toLowerCase());

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isMatch = bcrypt.compareSync(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Mark user online
      db.prepare('UPDATE users SET is_online = 1, current_status = \'online\', last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

      // Un-revoke any previous revocation for this user id so newly issued session is active
      tokenRevocationService.unrevokeUser(user.id);

      const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email, isGuest: Boolean(user.is_guest) },
        config.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const equippedSkins = skinService.getEquippedSkins(user.id);
      const userStats = statsService.getUserStats(user.id);

      return res.json({
        message: 'Logged in successfully',
        token,
        user: {
          id: user.id,
          tag: `#${String(user.id).padStart(4, '0')}`,
          username: user.username,
          email: user.email,
          isGuest: Boolean(user.is_guest),
          avatarUrl: user.avatar_url || '',
          equippedSkins,
          stats: userStats ? userStats.stats : null,
          progression: userStats ? userStats.progression : null
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Internal server error during login' });
    }
  }

  guest(req, res) {
    try {
      const guestNum = Math.floor(1000 + Math.random() * 9000);
      const guestUsername = `Guest_${guestNum}`;
      const guestEmail = `guest_${Date.now()}_${guestNum}@vortex.local`;
      const tempPass = `GuestPass_${Date.now()}_${Math.random()}`;

      const salt = bcrypt.genSaltSync(8);
      const passwordHash = bcrypt.hashSync(tempPass, salt);

      const insertUser = db.prepare(`
        INSERT INTO users (username, email, password_hash, is_online, current_status, is_guest)
        VALUES (?, ?, ?, 1, 'online', 1)
      `);
      const result = insertUser.run(guestUsername, guestEmail, passwordHash);
      const userId = result.lastInsertRowid;

      // Initialize stats row
      db.prepare('INSERT INTO stats (user_id) VALUES (?)').run(userId);

      // Assign default free skins
      skinService.assignDefaultSkins(userId);

      // Un-revoke any previous revocation for this user id so new session is valid
      tokenRevocationService.unrevokeUser(userId);

      const token = jwt.sign(
        { id: userId, username: guestUsername, email: guestEmail, isGuest: true },
        config.JWT_SECRET,
        { expiresIn: '3d' }
      );

      const equippedSkins = skinService.getEquippedSkins(userId);
      const userStats = statsService.getUserStats(userId);

      return res.status(201).json({
        message: 'Guest session created',
        token,
        user: {
          id: userId,
          tag: `#${String(userId).padStart(4, '0')}`,
          username: guestUsername,
          email: guestEmail,
          isGuest: true,
          avatarUrl: '',
          equippedSkins,
          stats: userStats ? userStats.stats : null,
          progression: userStats ? userStats.progression : null
        }
      });
    } catch (err) {
      console.error('Guest login error:', err);
      return res.status(500).json({ error: 'Failed to create guest session' });
    }
  }

  me(req, res) {
    try {
      const user = db.prepare('SELECT id, username, email, avatar_url, current_status, current_room_code FROM users WHERE id = ?').get(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const equippedSkins = skinService.getEquippedSkins(user.id);
      const userStats = statsService.getUserStats(user.id);

      return res.json({
        user: {
          id: user.id,
          tag: `#${String(user.id).padStart(4, '0')}`,
          username: user.username,
          email: user.email,
          avatarUrl: user.avatar_url || '',
          currentStatus: user.current_status,
          currentRoomCode: user.current_room_code,
          equippedSkins,
          stats: userStats ? userStats.stats : null,
          progression: userStats ? userStats.progression : null
        }
      });
    } catch (err) {
      console.error('Get me error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  logout(req, res) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized: missing user context' });
      }

      const result = guestCleanupService.handleLogout(req.user, req.rawToken);
      return res.status(200).json(result);
    } catch (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Internal server error during logout' });
    }
  }
}

module.exports = new AuthController();
