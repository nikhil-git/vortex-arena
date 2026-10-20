const Room = require('./Room');
const config = require('../config');

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> Room
    this.playerToRoom = new Map(); // userId -> roomCode
    this.connectedSockets = new Map(); // userId -> ws
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  registerSocket(userId, ws) {
    this.connectedSockets.set(userId, ws);
  }

  unregisterSocket(userId) {
    this.connectedSockets.delete(userId);
  }

  getSocket(userId) {
    return this.connectedSockets.get(userId);
  }

  createRoom(options = {}) {
    const roomCode = options.roomCode || this.generateRoomCode();
    const room = new Room(roomCode, options);
    this.rooms.set(roomCode, room);
    return room;
  }

  createAiMatch(options = {}) {
    const roomCode = this.generateRoomCode();
    const botCount = Math.max(1, Math.min(11, options.botCount !== undefined ? options.botCount : 5));
    const difficulty = (options.difficulty || 'medium').toLowerCase();
    const isPractice = Boolean(options.isPractice);

    const room = this.createRoom({
      roomCode,
      name: isPractice ? 'Solo Target Training' : `Sector-7 vs ${difficulty.toUpperCase()} AI`,
      isPrivate: true,
      isAiMatch: true,
      aiDifficulty: difficulty,
      isPractice,
      botCount,
      gameMode: options.gameMode || 'ffa',
      scoreLimit: options.scoreLimit || (isPractice ? 999 : 25),
      matchDuration: options.matchDuration || (isPractice ? 600 : 300),
      minPlayers: 1,
      hostUserId: options.hostUserId
    });

    return room;
  }

  getRoom(roomCode) {
    if (!roomCode) return null;
    return this.rooms.get(roomCode.toUpperCase()) || null;
  }

  /**
   * Find available public match for matchmaking or create a new public room
   */
  findOrCreateMatch(options = {}) {
    // 1. Look for existing open public room with available slot (<12 players)
    for (const room of this.rooms.values()) {
      if (!room.isPrivate && !room.isFull()) {
        return room;
      }
    }

    // 2. No open room found, create fresh public arena
    return this.createRoom({
      isPrivate: false,
      gameMode: options.gameMode || 'ffa',
      name: `Public Sector ${this.rooms.size + 1}`
    });
  }

  joinRoom(roomCode, player) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { success: false, error: 'Match room not found or code expired' };
    }

    const result = room.addPlayer(player);
    if (result.success) {
      this.playerToRoom.set(player.id, room.code);
    }
    return result;
  }

  leaveRoom(userId) {
    const roomCode = this.playerToRoom.get(userId);
    if (!roomCode) return;

    const room = this.rooms.get(roomCode);
    if (room) {
      room.removePlayer(userId);
      if (room.playerCount === 0) {
        room.destroy();
        this.rooms.delete(roomCode);
      }
    }
    this.playerToRoom.delete(userId);
  }

  listPublicRooms() {
    const list = [];
    for (const room of this.rooms.values()) {
      if (!room.isPrivate) {
        list.push({
          code: room.code,
          name: room.name,
          gameMode: room.gameMode,
          playerCount: room.playerCount,
          maxPlayers: room.maxPlayers,
          state: room.state
        });
      }
    }
    return list;
  }

  /**
   * Send match invite directly to friend's live WebSocket connection
   */
  sendMatchInvite(senderUser, targetUserId, roomCode) {
    const targetWs = this.getSocket(targetUserId);
    if (!targetWs || targetWs.readyState !== 1) {
      return { success: false, error: 'Friend is currently offline or not connected' };
    }

    const room = this.getRoom(roomCode);
    if (!room) {
      return { success: false, error: 'Room does not exist' };
    }

    targetWs.send(JSON.stringify({
      type: 'match_invitation_received',
      sender: {
        id: senderUser.id,
        username: senderUser.username
      },
      roomCode: room.code,
      roomName: room.name,
      gameMode: room.gameMode,
      playerCount: room.playerCount,
      maxPlayers: room.maxPlayers
    }));

    return { success: true, message: `Match invitation dispatched to ${targetUserId}` };
  }
}

module.exports = new RoomManager();
