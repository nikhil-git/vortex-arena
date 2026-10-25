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
   * Invalidate all tokens associated with a given user ID
   */
  revokeUser(userId) {
    if (userId) {
      this.revokedUsers.add(userId);
    }
  }

  /**
   * Check if a token or user ID is revoked
   */
  isRevoked(token, decoded = null) {
    if (token && this.revokedTokens.has(token)) {
      return true;
    }
    if (decoded && decoded.id && this.revokedUsers.has(decoded.id)) {
      return true;
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
  }
}

module.exports = new TokenRevocationService();
