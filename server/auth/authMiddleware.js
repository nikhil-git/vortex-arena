const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../database/db');
const tokenRevocationService = require('./tokenRevocationService');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }

  const token = authHeader.split(' ')[1];
  if (tokenRevocationService.isRevoked(token)) {
    return res.status(401).json({ error: 'Session token has been revoked or logged out' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    if (tokenRevocationService.isRevoked(token, decoded)) {
      return res.status(401).json({ error: 'Session token has been revoked or logged out' });
    }

    // If guest, verify user record still exists in database
    if (decoded && decoded.isGuest) {
      try {
        const user = db.prepare('SELECT id, is_guest FROM users WHERE id = ?').get(decoded.id);
        if (!user) {
          return res.status(401).json({ error: 'Guest session has expired or been purged' });
        }
      } catch (dbErr) {
        // If DB not ready yet, continue with decoded token
      }
    }

    req.user = decoded;
    req.rawToken = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }
}

function verifyWsToken(token) {
  try {
    if (!token) return null;
    if (tokenRevocationService.isRevoked(token)) return null;

    const decoded = jwt.verify(token, config.JWT_SECRET);
    if (tokenRevocationService.isRevoked(token, decoded)) return null;

    if (decoded && decoded.isGuest) {
      try {
        const user = db.prepare('SELECT id, is_guest FROM users WHERE id = ?').get(decoded.id);
        if (!user) return null;
      } catch (dbErr) {
        return null;
      }
    }

    return decoded;
  } catch (e) {
    return null;
  }
}

module.exports = {
  authMiddleware,
  verifyWsToken,
  tokenRevocationService
};
