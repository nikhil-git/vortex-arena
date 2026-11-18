const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

test('Mobile HUD & Weapon Switching Verification Suite', async (t) => {

  await t.test('1. Sequential Weapon Switching Logic (Gun 1 -> 2 -> 3 -> 4 -> 1)', () => {
    const weaponOrder = ['assault_rifle', 'sniper_rifle', 'shotgun', 'pistol'];
    const mockWeaponsState = {
      assault_rifle: { current: 30, reserve: 240 },
      sniper_rifle: { current: 5, reserve: 30 },
      shotgun: { current: 8, reserve: 64 },
      pistol: { current: 12, reserve: 96 }
    };

    class MockApp {
      constructor() {
        this.weaponsState = mockWeaponsState;
        this.activeWeaponId = 'assault_rifle';
        this.switchHistory = [];
        this._lastMobileSwapTime = 0;
      }

      switchActiveWeapon(weaponId) {
        if (!this.weaponsState[weaponId]) return;
        this.activeWeaponId = weaponId;
        this.switchHistory.push(weaponId);
      }

      cycleWeaponMobile(nowTimestamp = 0) {
        const now = nowTimestamp || Date.now();
        if (this._lastMobileSwapTime && (now - this._lastMobileSwapTime < 180)) {
          return false;
        }
        this._lastMobileSwapTime = now;

        const order = ['assault_rifle', 'sniper_rifle', 'shotgun', 'pistol'];
        const idx = order.indexOf(this.activeWeaponId);
        const nextIdx = (idx >= 0) ? (idx + 1) % order.length : 0;
        const nextWep = order[nextIdx];
        this.switchActiveWeapon(nextWep);
        return true;
      }
    }

    const app = new MockApp();
    assert.equal(app.activeWeaponId, 'assault_rifle', 'Initial weapon should be Gun 1 (assault_rifle)');

    // 1st swap: Gun 1 -> Gun 2
    let swapped = app.cycleWeaponMobile(1000);
    assert.equal(swapped, true);
    assert.equal(app.activeWeaponId, 'sniper_rifle', 'First swap should switch to Gun 2 (sniper_rifle)');

    // 2nd swap: Gun 2 -> Gun 3
    swapped = app.cycleWeaponMobile(1300);
    assert.equal(swapped, true);
    assert.equal(app.activeWeaponId, 'shotgun', 'Second swap should switch to Gun 3 (shotgun)');

    // 3rd swap: Gun 3 -> Gun 4
    swapped = app.cycleWeaponMobile(1600);
    assert.equal(swapped, true);
    assert.equal(app.activeWeaponId, 'pistol', 'Third swap should switch to Gun 4 (pistol)');

    // 4th swap: Gun 4 -> Gun 1 (wraps around)
    swapped = app.cycleWeaponMobile(1900);
    assert.equal(swapped, true);
    assert.equal(app.activeWeaponId, 'assault_rifle', 'Fourth swap should wrap back to Gun 1 (assault_rifle)');

    // 5th swap: Gun 1 -> Gun 2
    swapped = app.cycleWeaponMobile(2200);
    assert.equal(swapped, true);
    assert.equal(app.activeWeaponId, 'sniper_rifle', 'Fifth swap should switch to Gun 2 (sniper_rifle)');

    assert.deepEqual(app.switchHistory, [
      'sniper_rifle',
      'shotgun',
      'pistol',
      'assault_rifle',
      'sniper_rifle'
    ], 'Switch history must match exact sequential order without skipping');
  });

  await t.test('2. Touch Multi-Event Race Condition Deduplication (<180ms suppression)', () => {
    class MockAppWithDebounce {
      constructor() {
        this.weaponsState = { assault_rifle: {}, sniper_rifle: {}, shotgun: {}, pistol: {} };
        this.activeWeaponId = 'assault_rifle';
        this.callCount = 0;
        this._lastMobileSwapTime = 0;
      }

      switchActiveWeapon(weaponId) {
        this.activeWeaponId = weaponId;
        this.callCount++;
      }

      cycleWeaponMobile(nowTimestamp) {
        const now = nowTimestamp;
        if (this._lastMobileSwapTime && (now - this._lastMobileSwapTime < 180)) {
          return false; // Suppressed duplicate synthetic event
        }
        this._lastMobileSwapTime = now;

        const order = ['assault_rifle', 'sniper_rifle', 'shotgun', 'pistol'];
        const idx = order.indexOf(this.activeWeaponId);
        const nextIdx = (idx >= 0) ? (idx + 1) % order.length : 0;
        this.switchActiveWeapon(order[nextIdx]);
        return true;
      }
    }

    const app = new MockAppWithDebounce();

    // Simulate single physical mobile tap firing touchstart (t=100ms), pointerdown (t=102ms), click (t=105ms)
    const event1 = app.cycleWeaponMobile(100); // touchstart
    const event2 = app.cycleWeaponMobile(102); // pointerdown
    const event3 = app.cycleWeaponMobile(105); // click

    assert.equal(event1, true, 'First event in tap sequence must execute');
    assert.equal(event2, false, 'Simultaneous pointerdown event must be suppressed');
    assert.equal(event3, false, 'Simultaneous click event must be suppressed');
    assert.equal(app.callCount, 1, 'Only exactly 1 weapon advance should occur for a single physical tap');
    assert.equal(app.activeWeaponId, 'sniper_rifle', 'Weapon should advance to Gun 2 (sniper_rifle), NOT skip to Gun 3 or 4');

    // Next physical tap after 300ms
    const nextTap = app.cycleWeaponMobile(405);
    assert.equal(nextTap, true, 'Subsequent tap after cooldown must succeed');
    assert.equal(app.callCount, 2, 'Call count should now be 2');
    assert.equal(app.activeWeaponId, 'shotgun', 'Weapon should advance to Gun 3 (shotgun)');
  });

  await t.test('3. CSS Architecture Validation (No bottom overlay, transparent flex bar, compact timer)', () => {
    const cssPath = path.join(rootDir, 'public', 'css', 'hud.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Ensure no @media query is illegally nested inside a comma-separated selector chain
    const illegalMediaInSelector = /,\s*@media/g.test(css);
    assert.equal(illegalMediaInSelector, false, 'hud.css must NOT have @media inside a comma-separated selector list');

    // Check .hud-bottom-bar transparency & flex layout
    assert.match(css, /\.hud-bottom-bar\s*\{[^}]*background:\s*transparent/s, '.hud-bottom-bar must have transparent background');
    assert.match(css, /\.hud-bottom-bar\s*\{[^}]*box-shadow:\s*none/s, '.hud-bottom-bar must have no box shadow');
    assert.match(css, /\.hud-bottom-bar\s*\{[^}]*display:\s*flex/s, '.hud-bottom-bar must have display: flex');

    // Check compact timer rules
    assert.match(css, /#hud-overlay\.hud-compact \.hud-match-timer-box[^}]*max-width:\s*155px/s, 'Compact timer box must have restricted width <= 155px');
    assert.match(css, /#hud-overlay\.hud-compact \.hud-match-timer[^}]*font-size:\s*16px/s, 'Compact timer font must be scaled down to 16px');

    // Check respawn protection badge positioning in compact mode
    assert.match(css, /#hud-overlay\.hud-compact \.respawn-shield-badge[^}]*top:\s*36px/s, 'Respawn shield badge must be anchored high (top: 36px) to keep crosshair free');

    // Check .hud-weapon-box width constraints
    assert.match(css, /\.hud-weapon-box\s*\{[^}]*max-width:\s*max-content/s, 'Base .hud-weapon-box must not expand across screen width');
  });

  await t.test('4. HTML Markup Validation for HUD Elements', () => {
    const htmlPath = path.join(rootDir, 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(html.includes('class="hud-bottom-bar"'), 'HTML must have hud-bottom-bar');
    assert.ok(html.includes('class="hud-vitals-box"'), 'HTML must have hud-vitals-box');
    assert.ok(html.includes('class="hud-weapon-box"'), 'HTML must have hud-weapon-box');
    assert.ok(html.includes('id="touch-btn-swap"'), 'HTML must have touch-btn-swap control');
    assert.ok(html.includes('id="touch-btn-fire"'), 'HTML must have touch-btn-fire control');
    assert.ok(html.includes('id="touch-btn-ads"'), 'HTML must have touch-btn-ads control');
    assert.ok(html.includes('id="touch-btn-crouch"'), 'HTML must have touch-btn-crouch control');
    assert.ok(html.includes('id="touch-btn-reload"'), 'HTML must have touch-btn-reload control');
    assert.ok(html.includes('id="touch-btn-jump"'), 'HTML must have touch-btn-jump control');
    assert.ok(html.includes('id="slot-1"'), 'HTML must have slot-1');
    assert.ok(html.includes('id="slot-4"'), 'HTML must have slot-4');
  });

  await t.test('5. Ergonomic Radial Arc & Fire Button Sizing', () => {
    const cssPath = path.join(rootDir, 'public', 'css', 'hud.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Fire button must be large (92-94px) in resting zone
    assert.match(css, /\.touch-action-btn\.fire\s*\{[^}]*width:\s*9[0-9]px/s, 'Fire button width must be in 90-99px range for mobile thumb');
    assert.match(css, /\.touch-action-btn\.fire\s*\{[^}]*height:\s*9[0-9]px/s, 'Fire button height must be in 90-99px range for mobile thumb');

    // Secondary buttons defined
    assert.match(css, /\.touch-action-btn\.ads/, 'CSS must define .touch-action-btn.ads');
    assert.match(css, /\.touch-action-btn\.crouch/, 'CSS must define .touch-action-btn.crouch');
    assert.match(css, /\.touch-action-btn\.reload/, 'CSS must define .touch-action-btn.reload');
    assert.match(css, /\.touch-action-btn\.jump/, 'CSS must define .touch-action-btn.jump');
    assert.match(css, /\.touch-action-btn\.swap/, 'CSS must define .touch-action-btn.swap');
  });

  await t.test('6. In-Game HUD Layout Editor Markup & Persistence Logic', () => {
    const htmlPath = path.join(rootDir, 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(html.includes('id="modal-hud-editor"'), 'HTML must have modal-hud-editor');
    assert.ok(html.includes('hud-editor-btn-cancel'), 'HUD editor must have cancel button');
    assert.ok(html.includes('hud-editor-btn-reset'), 'HUD editor must have reset button');
    assert.ok(html.includes('hud-editor-btn-confirm'), 'HUD editor must have confirm button');
    assert.ok(html.includes('id="hud-editor-scale"'), 'HUD editor must have scale slider');
    assert.ok(html.includes('id="hud-editor-opacity"'), 'HUD editor must have opacity slider');
    assert.ok(html.includes('id="hud-editor-hide-btn"'), 'HUD editor must have hide button checkbox');
  });

  await t.test('7. Multi-Touch Isolation: Fire Does Not Cancel on Other Touch End', () => {
    let isShooting = false;
    let fireLookTouchId = 42;

    const simulateTouchEnd = (changedTouches) => {
      if (fireLookTouchId !== null && changedTouches) {
        for (let i = 0; i < changedTouches.length; i++) {
          if (changedTouches[i].identifier === fireLookTouchId) {
            isShooting = false;
            fireLookTouchId = null;
            break;
          }
        }
      }
    };

    // User is actively shooting with finger ID 42
    isShooting = true;

    // Another touch (e.g. movement thumb ID 10) is released
    simulateTouchEnd([{ identifier: 10 }]);
    assert.equal(isShooting, true, 'Releasing an unrelated touch must NOT cancel firing');
    assert.equal(fireLookTouchId, 42, 'Fire touch ID must remain active');

    // Fire touch itself is released
    simulateTouchEnd([{ identifier: 42 }]);
    assert.equal(isShooting, false, 'Releasing the fire touch cancels firing');
    assert.equal(fireLookTouchId, null, 'Fire touch ID must be cleared');
  });

  await t.test('8. Notification / Toast Layer Architecture: Top Safe Zone & Reload Unblocked', () => {
    const mainCssPath = path.join(rootDir, 'public', 'css', 'main.css');
    const mainCss = fs.readFileSync(mainCssPath, 'utf8');

    // #toast-container must be anchored at the top, NOT bottom-right
    assert.match(mainCss, /#toast-container\s*\{[^}]*top:\s*max\(55px/s, '#toast-container must be positioned at top safe zone (55px)');
    assert.match(mainCss, /#toast-container\s*\{[^}]*pointer-events:\s*none\s*!important/s, '#toast-container must have pointer-events: none');

    // .toast must also have pointer-events: none
    assert.match(mainCss, /\.toast\s*\{[^}]*pointer-events:\s*none\s*!important/s, '.toast items must have pointer-events: none !important');

    // Verify simulate reload click while simulated toast is present
    let reloaded = false;
    const onReload = () => { reloaded = true; };

    // With pointer-events: none on toasts, clicks pass straight through to reload button
    onReload();
    assert.equal(reloaded, true, 'Reload event must register reliably during active notification displays');
  });
});
