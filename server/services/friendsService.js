const db = require('../database/db');

class FriendsService {
  /**
   * Search players by username or user ID (excluding self and blocked users)
   */
  searchUsers(currentUserId, query) {
    if (!query || query.trim().length === 0) return [];
    const trimmed = query.trim();

    // Check if searching by exact numeric ID (#123 or 123)
    let numericId = null;
    if (trimmed.startsWith('#')) {
      numericId = parseInt(trimmed.slice(1), 10);
    } else if (/^\d+$/.test(trimmed)) {
      numericId = parseInt(trimmed, 10);
    }

    let rows;
    if (numericId && !isNaN(numericId)) {
      rows = db.prepare(`
        SELECT u.id, u.username, u.avatar_url, u.is_online, u.current_status, u.current_room_code,
               s.lifetime_kills, s.lifetime_wins
        FROM users u
        LEFT JOIN stats s ON u.id = s.user_id
        WHERE u.id = ? AND u.id != ?
      `).all(numericId, currentUserId);
    } else {
      rows = db.prepare(`
        SELECT u.id, u.username, u.avatar_url, u.is_online, u.current_status, u.current_room_code,
               s.lifetime_kills, s.lifetime_wins
        FROM users u
        LEFT JOIN stats s ON u.id = s.user_id
        WHERE u.username LIKE ? AND u.id != ?
        LIMIT 20
      `).all(`%${trimmed}%`, currentUserId);
    }

    // Attach relationship status with each user found
    return rows.map(user => {
      const relationship = this.getRelationship(currentUserId, user.id);
      return {
        id: user.id,
        tag: `#${String(user.id).padStart(4, '0')}`,
        username: user.username,
        avatarUrl: user.avatar_url,
        isOnline: Boolean(user.is_online),
        currentStatus: user.current_status || 'offline',
        currentRoomCode: user.current_room_code,
        lifetimeKills: user.lifetime_kills || 0,
        relationship: relationship ? relationship.status : 'none',
        isSender: relationship ? relationship.action_user_id === currentUserId : false
      };
    });
  }

  /**
   * Get relationship between two users
   */
  getRelationship(user1, user2) {
    return db.prepare(`
      SELECT * FROM friends
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).get(user1, user2, user2, user1);
  }

  /**
   * Send a friend request
   */
  sendFriendRequest(senderId, targetUserId) {
    if (senderId === targetUserId) {
      return { success: false, error: 'You cannot send a friend request to yourself' };
    }

    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) {
      return { success: false, error: 'User does not exist' };
    }

    const existing = this.getRelationship(senderId, targetUserId);
    if (existing) {
      if (existing.status === 'accepted') {
        return { success: false, error: 'You are already friends with this player' };
      }
      if (existing.status === 'blocked') {
        return { success: false, error: 'Unable to send friend request' };
      }
      if (existing.status === 'pending') {
        if (existing.action_user_id === senderId) {
          return { success: false, error: 'Friend request already sent and pending' };
        } else {
          // If the other user already sent a request, auto-accept it!
          return this.acceptFriendRequest(senderId, existing.id);
        }
      }
    }

    const insert = db.prepare(`
      INSERT INTO friends (user_id, friend_id, status, action_user_id)
      VALUES (?, ?, 'pending', ?)
    `);

    insert.run(senderId, targetUserId, senderId);

    return {
      success: true,
      message: `Friend request sent to ${targetUser.username}`,
      targetUser: { id: targetUser.id, username: targetUser.username }
    };
  }

  /**
   * Accept friend request
   */
  acceptFriendRequest(currentUserId, requestIdOrFriendUserId) {
    let relationship;
    if (typeof requestIdOrFriendUserId === 'number' && requestIdOrFriendUserId < 100000) {
      relationship = db.prepare(`
        SELECT * FROM friends
        WHERE (id = ? OR ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)))
          AND status = 'pending'
      `).get(requestIdOrFriendUserId, currentUserId, requestIdOrFriendUserId, requestIdOrFriendUserId, currentUserId);
    } else {
      relationship = db.prepare('SELECT * FROM friends WHERE id = ? AND status = \'pending\'').get(requestIdOrFriendUserId);
    }

    if (!relationship) {
      return { success: false, error: 'Friend request not found or already processed' };
    }

    // Only recipient can accept
    if (relationship.action_user_id === currentUserId) {
      return { success: false, error: 'You cannot accept your own friend request' };
    }

    const otherUserId = relationship.user_id === currentUserId ? relationship.friend_id : relationship.user_id;

    db.prepare(`
      UPDATE friends
      SET status = 'accepted', action_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(currentUserId, relationship.id);

    const otherUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(otherUserId);

    return {
      success: true,
      message: `You are now friends with ${otherUser ? otherUser.username : 'player'}`,
      friend: otherUser
    };
  }

  /**
   * Decline / cancel a friend request
   */
  declineOrCancelRequest(currentUserId, relationshipIdOrTargetId) {
    const relationship = db.prepare(`
      SELECT * FROM friends
      WHERE id = ? OR ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
    `).get(relationshipIdOrTargetId, currentUserId, relationshipIdOrTargetId, relationshipIdOrTargetId, currentUserId);

    if (!relationship) {
      return { success: false, error: 'Request not found' };
    }

    db.prepare('DELETE FROM friends WHERE id = ?').run(relationship.id);
    return { success: true, message: 'Friend request removed' };
  }

  /**
   * Remove an accepted friend
   */
  removeFriend(currentUserId, friendUserId) {
    const result = db.prepare(`
      DELETE FROM friends
      WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted'
    `).run(currentUserId, friendUserId, friendUserId, currentUserId);

    if (result.changes === 0) {
      return { success: false, error: 'Friend connection not found' };
    }

    return { success: true, message: 'Friend removed successfully' };
  }

  /**
   * Block a user
   */
  blockUser(currentUserId, targetUserId) {
    if (currentUserId === targetUserId) {
      return { success: false, error: 'You cannot block yourself' };
    }

    const existing = this.getRelationship(currentUserId, targetUserId);
    if (existing) {
      db.prepare(`
        UPDATE friends
        SET status = 'blocked', action_user_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(currentUserId, existing.id);
    } else {
      db.prepare(`
        INSERT INTO friends (user_id, friend_id, status, action_user_id)
        VALUES (?, ?, 'blocked', ?)
      `).run(currentUserId, targetUserId, currentUserId);
    }

    return { success: true, message: 'User blocked' };
  }

  /**
   * Report abusive player
   */
  reportUser(reporterId, reportedUserId, reason, details) {
    if (reporterId === reportedUserId) {
      return { success: false, error: 'You cannot report yourself' };
    }

    db.prepare(`
      INSERT INTO reports (reporter_id, reported_user_id, reason, details)
      VALUES (?, ?, ?, ?)
    `).run(reporterId, reportedUserId, reason || 'Harassment / Exploits', details || '');

    return { success: true, message: 'Report submitted. Our moderation team will investigate.' };
  }

  /**
   * Get all friends and pending requests for the current user
   */
  getFriendsList(currentUserId) {
    // 1. Accepted friends
    const friendsRows = db.prepare(`
      SELECT 
        f.id as friendship_id,
        CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END as friend_user_id,
        f.status,
        f.updated_at as friends_since
      FROM friends f
      WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
    `).all(currentUserId, currentUserId, currentUserId);

    const friends = friendsRows.map(f => {
      const friendUser = db.prepare(`
        SELECT u.id, u.username, u.avatar_url, u.is_online, u.current_status, u.current_room_code,
               s.lifetime_kills, s.lifetime_wins
        FROM users u
        LEFT JOIN stats s ON u.id = s.user_id
        WHERE u.id = ?
      `).get(f.friend_user_id);

      return {
        friendshipId: f.friendship_id,
        id: friendUser.id,
        tag: `#${String(friendUser.id).padStart(4, '0')}`,
        username: friendUser.username,
        avatarUrl: friendUser.avatar_url,
        isOnline: Boolean(friendUser.is_online),
        currentStatus: friendUser.current_status || 'offline',
        currentRoomCode: friendUser.current_room_code,
        lifetimeKills: friendUser.lifetime_kills || 0,
        lifetimeWins: friendUser.lifetime_wins || 0,
        canJoin: friendUser.current_status === 'in_lobby' || friendUser.current_status === 'in_match'
      };
    });

    // 2. Incoming pending requests
    const incomingRows = db.prepare(`
      SELECT f.id, f.action_user_id, f.created_at, u.id as sender_id, u.username, s.lifetime_kills
      FROM friends f
      JOIN users u ON u.id = f.action_user_id
      LEFT JOIN stats s ON s.user_id = u.id
      WHERE (f.user_id = ? OR f.friend_id = ?)
        AND f.status = 'pending'
        AND f.action_user_id != ?
    `).all(currentUserId, currentUserId, currentUserId);

    // 3. Outgoing pending requests
    const outgoingRows = db.prepare(`
      SELECT f.id, f.created_at, 
             CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END as target_user_id
      FROM friends f
      WHERE (f.user_id = ? OR f.friend_id = ?)
        AND f.status = 'pending'
        AND f.action_user_id = ?
    `).all(currentUserId, currentUserId, currentUserId, currentUserId);

    const outgoing = outgoingRows.map(row => {
      const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(row.target_user_id);
      return {
        id: row.id,
        targetUserId: row.target_user_id,
        username: targetUser ? targetUser.username : 'Unknown',
        createdAt: row.created_at
      };
    });

    return {
      friends,
      incomingRequests: incomingRows.map(r => ({
        requestId: r.id,
        senderId: r.sender_id,
        username: r.username,
        lifetimeKills: r.lifetime_kills || 0,
        createdAt: r.created_at
      })),
      outgoingRequests: outgoing
    };
  }

  /**
   * Update online status of a user in database
   */
  updateUserStatus(userId, isOnline, status = 'online', roomCode = null) {
    if (!userId) return;
    const codeStr = (roomCode && typeof roomCode === 'object') ? (roomCode.code || null) : (roomCode ? String(roomCode) : null);
    db.prepare(`
      UPDATE users
      SET is_online = ?,
          current_status = ?,
          current_room_code = ?,
          last_seen = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(isOnline ? 1 : 0, isOnline ? status : 'offline', isOnline ? codeStr : null, userId);
  }
}

module.exports = new FriendsService();
