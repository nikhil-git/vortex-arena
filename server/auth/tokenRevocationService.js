/**
 * Vortex Arena - In-Memory Token Revocation & Session Invalidation Service
 * 
 * Ensures that revoked JWT tokens (from explicit guest logout or session invalidation)
 * cannot authenticate any future REST API calls or WebSocket multiplayer handshakes.
 */

class TokenRevocationService {
  constructor() {
    this.revokedTokens = new Map(); // token -> expMs
    this.revokedUsers = new Set(); // userId
    this.userRevokedAt = new Map(); // userId -> revokedAtTimestampMs
    
    // Prune expired entries every 10 minutes
    this.pruneInterval = setInterval(() => this.prune(), 10 * 60 * 1000);
    if (this.pruneInterval.unref) {
      this.pruneInterval.unref();
    }
  }

  /**
   * Immediately blacklist a specific JWT token string
   */
  revokeToken(token, expMs = null) {
    if (!token) return;
    // Default expiration retention: 3 days from now if not specified
    const expiresAt = expMs || (Date.now() + 3 * 24 * 60 * 60 * 1000);
    this.revokedTokens.set(token, expiresAt);
  }

  /**
   * Invalidate all existing tokens issued for a given user ID prior to now
   */
  revokeUser(userId) {
    if (userId) {
      const numId = Number(userId);
      this.revokedUsers.add(numId);
      this.userRevokedAt.set(numId, Date.now());
    }
  }

  /**
   * Un-revoke a user upon new successful login/registration so fresh tokens are accepted
   */
  unrevokeUser(userId) {
    if (!userId) return;
    const numId = Number(userId);
    this.revokedUsers.delete(numId);
    this.revokedUsers.delete(String(userId));
    this.userRevokedAt.delete(numId);
    this.userRevokedAt.delete(String(userId));
  }

  /**
   * Check if a token or user ID is revoked
   */
  isRevoked(token, decoded = null) {
    if (token && this.revokedTokens.has(token)) {
      return true;
    }
    if (decoded && decoded.id) {
      const numId = Number(decoded.id);
      const revokedAt = this.userRevokedAt.get(numId) || this.userRevokedAt.get(String(decoded.id));
      if (revokedAt) {
        // If JWT has iat (issued at in seconds), check if it was issued before revocation
        if (decoded.iat && (decoded.iat * 1000) < (revokedAt - 1000)) {
          return true;
        }
        // If issued after revocation, it is a newly authenticated session
        return false;
      }
      if (this.revokedUsers.has(numId) || this.revokedUsers.has(String(decoded.id))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Periodic pruning of tokens whose JWT lifetime has naturally expired
   */
  prune() {
    const now = Date.now();
    for (const [tok, exp] of this.revokedTokens.entries()) {
      if (exp <= now) {
        this.revokedTokens.delete(tok);
      }
    }
  }

  /**
   * Reset in-memory revocation stores (for testing)
   */
  clear() {
    this.revokedTokens.clear();
    this.revokedUsers.clear();
    this.userRevokedAt.clear();
  }
}

module.exports = new TokenRevocationService();
