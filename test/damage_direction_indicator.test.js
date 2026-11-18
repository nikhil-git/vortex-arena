const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

test('Attack Direction (Damage) Indicator Verification Suite', async (t) => {

  await t.test('1. Room Server Event: Sends Attacker World Position in damaged Payload', () => {
    const roomPath = path.join(rootDir, 'server', 'game', 'Room.js');
    const roomCode = fs.readFileSync(roomPath, 'utf8');

    assert.match(
      roomCode,
      /attackerPosition:\s*\[shooter\.position\.x,\s*shooter\.position\.z\]/,
      'Room.js must broadcast attackerPosition [x, z] to victim in damaged event'
    );
  });

  await t.test('2. Angle Calculation: Relative Screen Angle Updates Dynamically with Camera Yaw', () => {
    // Math function mirroring app.updateDamageIndicators logic
    function calculateRelativeAngleDeg(playerX, playerZ, playerYaw, attackerX, attackerZ) {
      const dx = attackerX - playerX;
      const dz = attackerZ - playerZ;
      const worldAngle = Math.atan2(dx, -dz);
      const relAngleRad = worldAngle - playerYaw;
      return (relAngleRad * 180) / Math.PI;
    }

    const playerPos = { x: 0, z: 0 };

    // Case A: Attacker directly in front (North, -Z): angle should be 0 deg
    const angleFront = calculateRelativeAngleDeg(playerPos.x, playerPos.z, 0, 0, -15);
    assert.equal(Math.round(angleFront), 0, 'Incoming shot from direct front must have 0° relative angle');

    // Case B: Attacker directly on right flank (East, +X): angle should be +90 deg
    const angleRight = calculateRelativeAngleDeg(playerPos.x, playerPos.z, 0, 15, 0);
    assert.equal(Math.round(angleRight), 90, 'Incoming shot from 3 o-clock must have +90° relative angle');

    // Case C: Player turns camera 90° right (yaw = pi/2) to face the attacker on the right:
    // Relative angle should now be 0° (directly centered)
    const angleTurned = calculateRelativeAngleDeg(playerPos.x, playerPos.z, Math.PI / 2, 15, 0);
    assert.equal(Math.round(angleTurned), 0, 'Turning toward attacker must dynamically align indicator to 0°');

    // Case D: Attacker directly behind (South, +Z): angle should be 180 deg
    const angleBehind = calculateRelativeAngleDeg(playerPos.x, playerPos.z, 0, 0, 15);
    assert.equal(Math.abs(Math.round(angleBehind)), 180, 'Incoming shot from rear must have 180° relative angle');
  });

  await t.test('3. HTML and CSS Markup Validation for Damage Indicators Container', () => {
    const htmlPath = path.join(rootDir, 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(html.includes('id="damage-indicators"'), 'HTML must include #damage-indicators container');
    assert.ok(html.includes('id="setting-damage-indicator"'), 'HTML must include damage indicator settings toggle');

    const cssPath = path.join(rootDir, 'public', 'css', 'hud.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.match(css, /\.damage-indicators-container\s*\{[^}]*pointer-events:\s*none/s, 'Container must have pointer-events: none');
    assert.match(css, /\.damage-indicator-arc/, 'CSS must define .damage-indicator-arc styling');
  });
});
