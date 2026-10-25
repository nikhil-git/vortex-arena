const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const config = require('../config');

class SqliteDatabase {
  constructor() {
    this.rawDb = null;
    this.SQL = null;
    this.dbPath = config.DB_PATH;
    this.isInitialized = false;
    this.saveTimeout = null;
  }

  async init() {
    if (this.isInitialized) return this;

    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.rawDb = new this.SQL.Database(fileBuffer);
    } else {
      this.rawDb = new this.SQL.Database();
      this.saveToDisk();
    }

    this.isInitialized = true;
    this.createSchema();
    return this;
  }

  saveToDisk() {
    try {
      if (!this.rawDb) return;
      const data = this.rawDb.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('[DB] Failed to save database to disk:', err);
    }
  }

  scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveToDisk();
      this.saveTimeout = null;
    }, 250);
  }

  pragma(statement) {
    if (!this.rawDb) return;
    try {
      this.rawDb.run(`PRAGMA ${statement};`);
    } catch (e) {}
  }

  exec(sql) {
    if (!this.rawDb) throw new Error('Database not initialized');
    this.rawDb.run(sql);
    this.scheduleSave();
  }

  createSchema() {
    this.pragma('foreign_keys = ON');
    this.exec(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        email TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        avatar_url TEXT DEFAULT '',
        is_online INTEGER DEFAULT 0,
        current_status TEXT DEFAULT 'offline',
        current_room_code TEXT DEFAULT NULL,
        is_guest INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Lifetime statistics table
      CREATE TABLE IF NOT EXISTS stats (
        user_id INTEGER PRIMARY KEY,
        lifetime_kills INTEGER DEFAULT 0,
        lifetime_deaths INTEGER DEFAULT 0,
        lifetime_headshots INTEGER DEFAULT 0,
        lifetime_damage INTEGER DEFAULT 0,
        lifetime_matches INTEGER DEFAULT 0,
        lifetime_wins INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Skins catalog table
      CREATE TABLE IF NOT EXISTS skins (
        skin_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('character', 'weapon')),
        category TEXT NOT NULL CHECK(category IN ('default', 'milestone', 'special')),
        rarity TEXT NOT NULL CHECK(rarity IN ('common', 'rare', 'epic', 'legendary')),
        required_kills INTEGER DEFAULT 0,
        weapon_type TEXT DEFAULT NULL,
        description TEXT NOT NULL,
        color_primary TEXT NOT NULL,
        color_secondary TEXT NOT NULL,
        color_accent TEXT NOT NULL,
        metallic REAL DEFAULT 0.5,
        roughness REAL DEFAULT 0.5,
        emissive TEXT DEFAULT '#000000',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- User unlocked & equipped skins
      CREATE TABLE IF NOT EXISTS user_skins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        skin_id TEXT NOT NULL,
        is_equipped INTEGER DEFAULT 0,
        unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (skin_id) REFERENCES skins(skin_id) ON DELETE CASCADE,
        UNIQUE(user_id, skin_id)
      );

      -- Friends and requests table
      CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'blocked')),
        action_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, friend_id)
      );

      -- User reports table for abuse reporting
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_id INTEGER NOT NULL,
        reported_user_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        details TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Achievements table
      CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        milestone_key TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, milestone_key)
      );

      -- Matches table
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        room_name TEXT NOT NULL,
        game_mode TEXT NOT NULL,
        map_name TEXT NOT NULL,
        player_count INTEGER NOT NULL,
        winner_id INTEGER DEFAULT NULL,
        duration_seconds INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Match participants table
      CREATE TABLE IF NOT EXISTS match_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        damage INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        team TEXT DEFAULT 'solo',
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- =======================================================
      -- ANALYTICS & TELEMETRY SYSTEM SCHEMA
      -- =======================================================

      -- Unique Website & Game Visitors
      CREATE TABLE IF NOT EXISTS analytics_visitors (
        visitor_id TEXT PRIMARY KEY,
        first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_visits INTEGER DEFAULT 1,
        total_play_time INTEGER DEFAULT 0,
        user_id INTEGER DEFAULT NULL
      );

      -- Browsing & Gameplay Sessions
      CREATE TABLE IF NOT EXISTS analytics_sessions (
        session_id TEXT PRIMARY KEY,
        visitor_id TEXT NOT NULL,
        user_id INTEGER DEFAULT NULL,
        user_type TEXT DEFAULT 'anonymous',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        duration_seconds INTEGER DEFAULT 0,
        device_category TEXT DEFAULT 'desktop',
        browser TEXT DEFAULT 'Unknown',
        os TEXT DEFAULT 'Unknown',
        referrer TEXT DEFAULT '',
        referrer_host TEXT DEFAULT 'direct',
        landing_page TEXT DEFAULT '/',
        exit_page TEXT DEFAULT '/',
        page_views INTEGER DEFAULT 1,
        game_launched INTEGER DEFAULT 0,
        matches_played INTEGER DEFAULT 0
      );

      -- Granular Analytics & Interaction Events
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visitor_id TEXT,
        session_id TEXT,
        user_id INTEGER DEFAULT NULL,
        user_type TEXT DEFAULT 'anonymous',
        category TEXT NOT NULL,
        event_name TEXT NOT NULL,
        event_data TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Android APK Download Tracking
      CREATE TABLE IF NOT EXISTS analytics_apk_downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visitor_id TEXT DEFAULT NULL,
        session_id TEXT DEFAULT NULL,
        ip_hash TEXT DEFAULT NULL,
        version TEXT DEFAULT '1.0.0',
        source TEXT DEFAULT 'direct',
        status TEXT DEFAULT 'served',
        bytes_sent INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        error_message TEXT DEFAULT NULL,
        user_agent TEXT DEFAULT NULL,
        device_category TEXT DEFAULT 'mobile',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Multiplayer & Server Performance Snapshots
      CREATE TABLE IF NOT EXISTS analytics_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        active_players INTEGER DEFAULT 0,
        active_rooms INTEGER DEFAULT 0,
        active_matches INTEGER DEFAULT 0,
        bot_count INTEGER DEFAULT 0,
        ws_clients INTEGER DEFAULT 0,
        ping_median_ms REAL DEFAULT 0,
        ping_p95_ms REAL DEFAULT 0,
        tick_rate REAL DEFAULT 30,
        tick_duration_ms REAL DEFAULT 0,
        memory_rss_mb REAL DEFAULT 0,
        memory_heap_mb REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Reliability & Technical Error Logging
      CREATE TABLE IF NOT EXISTS analytics_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        error_type TEXT NOT NULL,
        status_code INTEGER DEFAULT 500,
        message TEXT NOT NULL,
        stack TEXT DEFAULT NULL,
        path TEXT DEFAULT NULL,
        visitor_id TEXT DEFAULT NULL,
        user_id INTEGER DEFAULT NULL,
        user_agent TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Analytics Performance Indexes
      CREATE INDEX IF NOT EXISTS idx_analytics_sessions_started_at ON analytics_sessions(started_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_sessions_visitor_id ON analytics_sessions(visitor_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);
      CREATE INDEX IF NOT EXISTS idx_analytics_apk_created_at ON analytics_apk_downloads(created_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_performance_created_at ON analytics_performance(created_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_errors_created_at ON analytics_errors(created_at);
    `);

    // Safe migration: Add is_guest column if table existed without it
    try {
      this.rawDb.run('ALTER TABLE users ADD COLUMN is_guest INTEGER DEFAULT 0;');
    } catch (e) {
      // Column already present
    }

    this.saveToDisk();
  }

  prepare(sql) {
    const self = this;
    return {
      run(...args) {
        if (!self.rawDb) throw new Error('Database not initialized');
        const params = self.normalizeParams(sql, args);
        const stmt = self.rawDb.prepare(sql);
        try {
          if (params !== undefined) {
            stmt.run(params);
          } else {
            stmt.run();
          }
          const changes = self.rawDb.getRowsModified();
          const lastIdRes = self.rawDb.exec('SELECT last_insert_rowid() AS id');
          const lastInsertRowid = lastIdRes.length && lastIdRes[0].values.length ? lastIdRes[0].values[0][0] : 0;
          self.scheduleSave();
          return { changes, lastInsertRowid };
        } finally {
          stmt.free();
        }
      },

      get(...args) {
        if (!self.rawDb) throw new Error('Database not initialized');
        const params = self.normalizeParams(sql, args);
        const stmt = self.rawDb.prepare(sql);
        try {
          if (params !== undefined) {
            stmt.bind(params);
          }
          if (stmt.step()) {
            return stmt.getAsObject();
          }
          return null;
        } finally {
          stmt.free();
        }
      },

      all(...args) {
        if (!self.rawDb) throw new Error('Database not initialized');
        const params = self.normalizeParams(sql, args);
        const stmt = self.rawDb.prepare(sql);
        const results = [];
        try {
          if (params !== undefined) {
            stmt.bind(params);
          }
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          return results;
        } finally {
          stmt.free();
        }
      }
    };
  }

  normalizeParams(sql, args) {
    if (args.length === 0) return undefined;
    if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0] !== null) {
      // Named params object: format keys as @param if needed
      const obj = args[0];
      const normalized = {};
      for (const [key, val] of Object.entries(obj)) {
        const paramKey = key.startsWith('@') || key.startsWith(':') || key.startsWith('$') ? key : `@${key}`;
        normalized[paramKey] = val;
      }
      return normalized;
    }
    // Positional array
    return args;
  }

  transaction(fn) {
    const self = this;
    return (...args) => {
      self.exec('BEGIN TRANSACTION;');
      try {
        const result = fn(...args);
        self.exec('COMMIT;');
        return result;
      } catch (err) {
        self.exec('ROLLBACK;');
        throw err;
      }
    };
  }
}

const db = new SqliteDatabase();

// Clean save on process shutdown
process.on('SIGINT', () => {
  db.saveToDisk();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.saveToDisk();
  process.exit(0);
});

module.exports = db;
