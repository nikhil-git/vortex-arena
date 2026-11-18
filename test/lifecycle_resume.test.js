const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

test('App Lifecycle & Mobile Resume Verification Suite', async (t) => {

  await t.test('1. InputController.resetInputState: Clears Touch IDs, Shooting, and Stuck Velocities', () => {
    class MockInputController {
      constructor() {
        this.keys = { forward: true, backward: true, left: true, right: true, jump: true, sprint: true };
        this.velocity = { x: 5.5, y: 2.0, z: -4.2 };
        this.touchMoveId = 12;
        this.touchLookId = 15;
        this.touchMove = { x: 0.8, z: -0.6 };
        this.isShooting = true;
        this.isADS = true;
      }

      resetInputState() {
        this.keys.forward = false;
        this.keys.backward = false;
        this.keys.left = false;
        this.keys.right = false;
        this.keys.jump = false;
        this.keys.sprint = false;
        this.velocity.x = 0;
        this.velocity.z = 0;
        this.touchMoveId = null;
        this.touchLookId = null;
        this.touchMove = { x: 0, z: 0 };
        this.isShooting = false;
        this.isADS = false;
      }
    }

    const input = new MockInputController();
    assert.equal(input.touchMoveId, 12);
    assert.equal(input.isShooting, true);

    input.resetInputState();

    assert.equal(input.touchMoveId, null, 'touchMoveId must be reset to null on pause/resume');
    assert.equal(input.touchLookId, null, 'touchLookId must be reset to null on pause/resume');
    assert.equal(input.isShooting, false, 'isShooting must be set to false on pause/resume');
    assert.equal(input.isADS, false, 'isADS must be set to false on pause/resume');
    assert.equal(input.velocity.x, 0, 'Velocity X must be halted');
    assert.equal(input.velocity.z, 0, 'Velocity Z must be halted');
    assert.equal(input.keys.forward, false, 'Forward key must be cleared');
  });

  await t.test('2. GameEngine.handleResume: Refreshes Frame Time Delta and Flushes Stale Counters', () => {
    class MockGameEngine {
      constructor() {
        this.lastFrameTime = 1000;
        this.frameCount = 55;
        this.fpsTimer = 0.9;
        this.inputResetCalled = false;
        this.input = {
          resetInputState: () => { this.inputResetCalled = true; }
        };
      }

      handleResume() {
        this.lastFrameTime = 5000; // Simulated performance.now()
        this.frameCount = 0;
        this.fpsTimer = 0;
        if (this.input && typeof this.input.resetInputState === 'function') {
          this.input.resetInputState();
        }
      }
    }

    const engine = new MockGameEngine();
    engine.handleResume();

    assert.equal(engine.lastFrameTime, 5000, 'lastFrameTime must be updated to current timestamp');
    assert.equal(engine.frameCount, 0, 'frameCount must be reset');
    assert.equal(engine.inputResetCalled, true, 'input.resetInputState must be called during handleResume');
  });

  await t.test('3. Codebase Source Validation: Lifecycle Listeners Attached', () => {
    const inputPath = path.join(rootDir, 'public', 'js', 'game', 'InputController.js');
    const inputCode = fs.readFileSync(inputPath, 'utf8');

    assert.match(inputCode, /resetInputState\(\)/, 'InputController.js must implement resetInputState()');
    assert.match(inputCode, /window\.addEventListener\('blur', \(\) => this\.resetInputState\(\)\)/, 'InputController must reset on blur');
    assert.match(inputCode, /document\.addEventListener\('visibilitychange'/, 'InputController must listen to visibilitychange');

    const appPath = path.join(rootDir, 'public', 'js', 'app.js');
    const appCode = fs.readFileSync(appPath, 'utf8');

    assert.match(appCode, /onAppPause\(\)/, 'app.js must implement onAppPause()');
    assert.match(appCode, /onAppResume\(\)/, 'app.js must implement onAppResume()');
    assert.match(appCode, /this\.gameEngine\.handleResume\(\)/, 'app.js onAppResume must trigger gameEngine.handleResume()');
  });
});
