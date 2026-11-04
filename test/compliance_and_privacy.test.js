const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(__dirname, 'test_compliance.sqlite');

if (fs.existsSync(process.env.DB_PATH)) {
  fs.unlinkSync(process.env.DB_PATH);
}

const db = require('../server/database/db');
const { seedDatabase } = require('../server/database/seed');
const authController = require('../server/auth/authController');

test('Setup Compliance Test Suite & Database', async () => {
  await db.init();
  seedDatabase();
});

test('Scenario 1: Privacy Policy and Account Deletion Static Pages Exist', () => {
  const privacyHtml = fs.readFileSync(path.join(__dirname, '../public/privacy.html'), 'utf-8');
  assert.ok(privacyHtml.includes('VORTEX ARENA — PRIVACY POLICY'), 'Privacy policy must contain title');
  assert.ok(privacyHtml.includes('/account-deletion'), 'Privacy policy must link to account deletion');

  const deletionHtml = fs.readFileSync(path.join(__dirname, '../public/account-deletion.html'), 'utf-8');
  assert.ok(deletionHtml.includes('REQUEST ACCOUNT & DATA DELETION'), 'Deletion page must contain header');
  assert.ok(deletionHtml.includes('/api/auth/delete-account'), 'Deletion page must submit to delete-account endpoint');
});

test('Scenario 2: Account Deletion Endpoint Validates Credentials & Purges User Data', () => {
  // 1. Create a test user
  const username = 'DeleteTester';
  const email = 'delete@vortex.test';
  const password = 'SecretPassword123';
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  const res = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email, passwordHash);
  const userId = res.lastInsertRowid;

  // Insert dummy stats and skins
  db.prepare('INSERT INTO stats (user_id, lifetime_kills) VALUES (?, ?)').run(userId, 42);
  db.prepare('INSERT INTO user_skins (user_id, skin_id) VALUES (?, ?)').run(userId, 1);

  // 2. Reject incorrect password
  let mockRes = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };

  authController.deleteAccount({ body: { username, password: 'WrongPassword' } }, mockRes);
  assert.strictEqual(mockRes.statusCode, 401, 'Should reject invalid password');

  // Verify user still exists
  let checkUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  assert.ok(checkUser, 'User must not be deleted on invalid password');

  // 3. Successfully delete with correct password
  mockRes = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };

  authController.deleteAccount({ body: { username, password } }, mockRes);
  assert.strictEqual(mockRes.statusCode, 200, 'Should return 200 on successful deletion');
  assert.strictEqual(mockRes.body.success, true);

  // 4. Verify user and all records are wiped
  checkUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  assert.ok(!checkUser, 'User record must be deleted');

  const checkStats = db.prepare('SELECT user_id FROM stats WHERE user_id = ?').get(userId);
  assert.ok(!checkStats, 'User stats must be deleted');

  const checkSkins = db.prepare('SELECT user_id FROM user_skins WHERE user_id = ?').get(userId);
  assert.ok(!checkSkins, 'User skins must be deleted');
});

test('Cleanup Compliance Test Database', () => {
  if (fs.existsSync(process.env.DB_PATH)) {
    fs.unlinkSync(process.env.DB_PATH);
  }
});
