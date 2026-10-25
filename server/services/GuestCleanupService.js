/**
 * Vortex Arena - Guest Lifecycle & Session Cleanup Service
 * 
 * Automatically and permanently purges guest user data upon explicit logout
 * or when unexpected disconnects abandon a guest session.
 * 
 * Preserves registered user accounts, shared match records, and active players.
 */

const db = require('../database/db');
const roomManager = require('../game/RoomManager');
const tokenRevocationService = require('../auth/tokenRevocationService');

class GuestCleanupService {
  constructor() {
    // userId -> NodeJS.Timeout
    this.pendingDisconnects = new Map();
    // Default disconnect grace period: 5 minutes (300,000 ms)
    this.gracePeriodMs = 5 * 60 * 1000;
    this.sweepInterval = null;
  }

  /**
   * Set custom grace period for testing or configuration
   */
  setGracePeriod(ms) {
    this.gracePeriodMs = ms;
  }

  /**
   * Handle user logout (handles both guest purge and registered user status update)
   */
  handleLogout(user, rawToken = null) {
    if (!user || !user.id) {
      return { success: false, error: 'Invalid user context for logout' };
    }

    if (rawToken) {
      tokenRevocationService.revokeToken(rawToken);
    }

    // Check if the user is a guest
    const isGuestUser = Boolean(
      user.isGuest ||
      (user.username && user.username.startsWith('Guest_')) ||
      (user.email && user.email.endsWith('@vortex.local'))
    );

    if (isGuestUser) {
      return this.purgeGuest(user.id);
    } else {
      // Registered User: Do NOT delete account or gameplay history
      tokenRevocationService.revokeUser(user.id);
      roomManager.leaveRoom(user.id);
      try {
        db.prepare(`
          UPDATE users 
          SET is_online = 0, current_status = 'offline' 
          WHERE id = ? AND is_guest = 0
        `).run(user.id);
      } catch (err) {
        console.error(`[Logout] Error updating registered user status for #${user.id}:`, err);
      }
      return {
        success: true,
        isGuest: false,
        purged: false,
        message: 'Registered user logged out successfully'
      };
    }
  }

  /**
   * Permanently purge all data belonging exclusively to a single guest user
   */
  purgeGuest(userId) {
    if (!userId) {
      return { success: false, error: 'Missing userId for guest purge' };
    }

    // 1. Verify existence and guest status
    let userRecord = null;
    try {
      userRecord = db.prepare('SELECT id, username, email, is_guest FROM users WHERE id = ?').get(userId);
    } catch (err) {
      console.error(`[GuestCleanup] DB error checking user #${userId}:`, err);
      return { success: false, error: 'Database check failed' };
    }

    // If already purged, return success idempotently
    if (!userRecord) {
      // Invalidate memory references just in case
      this.clearDisconnectTimer(userId);
      tokenRevocationService.revokeUser(userId);
      roomManager.leaveRoom(userId);
      roomManager.unregisterSocket(userId);
      return {
        success: true,
        isGuest: true,
        purged: true,
        alreadyPurged: true,
        message: 'Guest data already purged'
      };
    }

    // Guard against deleting registered users
    const isVerifiedGuest = Boolean(
      userRecord.is_guest === 1 ||
      (userRecord.email && userRecord.email.endsWith('@vortex.local')) ||
      (userRecord.username && userRecord.username.startsWith('Guest_'))
    );

    if (!isVerifiedGuest) {
      console.warn(`[GuestCleanup] Attempted to purge non-guest user #${userId} (${userRecord.username}). Aborted.`);
      return {
        success: false,
        isGuest: false,
        purged: false,
        error: 'Target user is a registered account and cannot be deleted'
      };
    }

    // 2. Invalidate in-memory credentials & cancel pending grace timers
    this.clearDisconnectTimer(userId);
    tokenRevocationService.revokeUser(userId);

    // 3. Clean up active multiplayer room & socket
    try {
      roomManager.leaveRoom(userId);
    } catch (roomErr) {
      console.error(`[GuestCleanup] Error removing guest #${userId} from active room:`, roomErr);
    }

    const ws = roomManager.getSocket(userId);
    if (ws) {
      try {
        ws.close(1000, 'Guest session ended');
      } catch (wsErr) {}
      roomManager.unregisterSocket(userId);
    }

    // 4. Atomic database transaction to remove all guest-owned records
    try {
      const purgeTx = db.transaction((targetId) => {
        // A. Detach guest from shared matches where they were winner (preserves match history)
        db.prepare('UPDATE matches SET winner_id = NULL WHERE winner_id = ?').run(targetId);

        // B. Delete dependent records owned by guest
        db.prepare('DELETE FROM match_participants WHERE user_id = ?').run(targetId);
        db.prepare('DELETE FROM friends WHERE user_id = ? OR friend_id = ?').run(targetId, targetId);
        db.prepare('DELETE FROM reports WHERE reporter_id = ? OR reported_user_id = ?').run(targetId, targetId);
        db.prepare('DELETE FROM user_skins WHERE user_id = ?').run(targetId);
        db.prepare('DELETE FROM achievements WHERE user_id = ?').run(targetId);
        db.prepare('DELETE FROM stats WHERE user_id = ?').run(targetId);

        // C. Delete the guest user record
        const userDel = db.prepare(`
          DELETE FROM users 
          WHERE id = ? AND (is_guest = 1 OR email LIKE '%@vortex.local' OR username LIKE 'Guest_%')
        `).run(targetId);

        return userDel.changes > 0;
      });

      purgeTx(userId);
      console.log(`[GuestCleanup] Successfully purged guest user #${userId} (${userRecord.username})`);

      return {
        success: true,
        isGuest: true,
        purged: true,
        userId,
        username: userRecord.username,
        message: 'Guest user data permanently purged'
      };
    } catch (txErr) {
      console.error(`[GuestCleanup] Transaction failed while purging guest #${userId}:`, txErr);
      return { success: false, error: 'Database transaction failed during purge' };
    }
  }

  /**
   * Handle unexpected WebSocket disconnect (initiates grace period for guest)
   */
  handleDisconnect(userId, isGuest) {
    if (!userId || !isGuest) return;

    this.clearDisconnectTimer(userId);

    if (this.gracePeriodMs <= 0) {
      // Immediate cleanup configured
      this.purgeGuest(userId);
      return;
    }

    const timer = setTimeout(() => {
      this.pendingDisconnects.delete(userId);
      // Verify user has not reconnected before purging
      if (!roomManager.connectedSockets.has(userId)) {
        console.log(`[GuestCleanup] Grace period expired for disconnected guest #${userId}. Purging...`);
        this.purgeGuest(userId);
      }
    }, this.gracePeriodMs);

    if (timer.unref) {
      timer.unref();
    }

    this.pendingDisconnects.set(userId, timer);
  }

  /**
   * Cancel disconnect grace timer if guest reconnects within grace period
   */
  handleReconnect(userId) {
    if (this.pendingDisconnects.has(userId)) {
      this.clearDisconnectTimer(userId);
      console.log(`[GuestCleanup] Guest #${userId} reconnected within grace period. Purge cancelled.`);
    }
  }

  clearDisconnectTimer(userId) {
    if (this.pendingDisconnects.has(userId)) {
      clearTimeout(this.pendingDisconnects.get(userId));
      this.pendingDisconnects.delete(userId);
    }
  }

  /**
   * Purge orphaned guest accounts left in the database (e.g. from previous server run/crash)
   */
  purgeOrphanedGuests() {
    try {
      const orphanedGuests = db.prepare(`
        SELECT id, username, email 
        FROM users 
        WHERE is_guest = 1 OR email LIKE '%@vortex.local' OR username LIKE 'Guest_%'
      `).all();

      if (orphanedGuests.length === 0) return 0;

      let count = 0;
      for (const guest of orphanedGuests) {
        // Do not purge if currently connected via WebSocket
        if (roomManager.connectedSockets.has(guest.id)) continue;

        const res = this.purgeGuest(guest.id);
        if (res.success) count++;
      }

      console.log(`[GuestCleanup] Startup sweep: Purged ${count} orphaned guest accounts.`);
      return count;
    } catch (err) {
      console.error('[GuestCleanup] Error during orphaned guests purge:', err);
      return 0;
    }
  }

  /**
   * Periodic sweep for abandoned guest sessions older than maxAgeMs
   */
  purgeAbandonedGuests(maxAgeMs = 60 * 60 * 1000) {
    try {
      const candidates = db.prepare(`
        SELECT id, username, email, created_at, last_seen 
        FROM users 
        WHERE is_guest = 1 OR email LIKE '%@vortex.local' OR username LIKE 'Guest_%'
      `).all();

      if (candidates.length === 0) return 0;

      const now = Date.now();
      let purgedCount = 0;

      for (const guest of candidates) {
        // Skip active connections or guests currently in a disconnect grace period
        if (roomManager.connectedSockets.has(guest.id)) continue;
        if (this.pendingDisconnects.has(guest.id)) continue;

        let ageMs = maxAgeMs + 1;
        if (guest.created_at) {
          const createdTime = new Date(guest.created_at).getTime();
          if (!isNaN(createdTime)) {
            ageMs = now - createdTime;
          }
        }

        if (ageMs > maxAgeMs) {
          const res = this.purgeGuest(guest.id);
          if (res.success) purgedCount++;
        }
      }

      if (purgedCount > 0) {
        console.log(`[GuestCleanup] Periodic sweep: Purged ${purgedCount} abandoned guest accounts.`);
      }
      return purgedCount;
    } catch (err) {
      console.error('[GuestCleanup] Error during abandoned guests sweep:', err);
      return 0;
    }
  }

  /**
   * Start standing periodic background sweep
   */
  startPeriodicSweep(intervalMs = 15 * 60 * 1000, maxAgeMs = 60 * 60 * 1000) {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
    this.sweepInterval = setInterval(() => {
      this.purgeAbandonedGuests(maxAgeMs);
    }, intervalMs);

    if (this.sweepInterval.unref) {
      this.sweepInterval.unref();
    }
  }

  stopPeriodicSweep() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }
}

module.exports = new GuestCleanupService();
