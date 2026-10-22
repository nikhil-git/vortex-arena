import * as THREE from '/vendor/three/three.module.js';

export class InputController {
  constructor(camera, domElement, onShoot, onReload, onSwitchWeapon, onScoreboardToggle) {
    this.camera = camera;
    this.domElement = domElement;
    this.onShoot = onShoot;
    this.onReload = onReload;
    this.onSwitchWeapon = onSwitchWeapon;
    this.onScoreboardToggle = onScoreboardToggle;

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false
    };

    // Camera Angles
    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 0.0022;
    this.invertY = false;

    // Kinematics
    this.position = new THREE.Vector3(0, 1.7, 0);
    this.velocity = new THREE.Vector3();
    this.isGrounded = true;
    this.isLocked = false;
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.touchMove = { x: 0, z: 0 };
    this.touchLookId = null;
    this.touchMoveId = null;
    this.touchJoystickOrigin = { x: 0, y: 0 };
    this.lastTouchLookPos = { x: 0, y: 0 };

    // Active Map Boundaries & Obstacle Colliders
    this.bounds = { minX: -38.5, maxX: 38.5, minZ: -38.5, maxZ: 38.5 };
    this.obstacles = [];

    this.setupListeners();
    if (this.isTouch) {
      this.setupTouchControls();
    }
  }

  setSensitivity(val) {
    // Val between 0.1 and 5.0
    this.sensitivity = (val || 1.0) * 0.002;
  }

  setInvertY(invert) {
    this.invertY = Boolean(invert);
  }

  setupTouchControls() {
    // Show mobile on-screen buttons
    const mobileHud = document.getElementById('mobile-controls');
    if (mobileHud) mobileHud.style.display = 'block';

    const joystickThumb = document.getElementById('joystick-thumb');
    const joystickBase = document.getElementById('joystick-base');

    window.addEventListener('touchstart', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        // Check if touch is on mobile action button or interactive UI
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (target && target.closest('#mobile-controls button, .touch-action-btn, #scoreboard-overlay, .btn, .hud-vitals-box, .hud-weapon-box, .hud-top-bar')) {
          continue;
        }

        const halfWidth = window.innerWidth * 0.45;

        // Left side: Movement Joystick
        if (touch.clientX < halfWidth && this.touchMoveId === null) {
          if (e.cancelable) e.preventDefault();
          this.touchMoveId = touch.identifier;
          this.touchJoystickOrigin = { x: touch.clientX, y: touch.clientY };
          if (joystickBase) {
            joystickBase.style.left = `${touch.clientX - 60}px`;
            joystickBase.style.top = `${touch.clientY - 60}px`;
            joystickBase.style.display = 'block';
          }
        }
        // Right side: Camera Look
        else if (touch.clientX >= halfWidth && this.touchLookId === null) {
          if (e.cancelable) e.preventDefault();
          this.touchLookId = touch.identifier;
          this.lastTouchLookPos = { x: touch.clientX, y: touch.clientY };
        }
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      let isGameTouch = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        // Update joystick
        if (touch.identifier === this.touchMoveId) {
          isGameTouch = true;
          const dx = touch.clientX - this.touchJoystickOrigin.x;
          const dy = touch.clientY - this.touchJoystickOrigin.y;
          const dist = Math.hypot(dx, dy);
          const maxDist = 50;

          const angle = Math.atan2(dy, dx);
          const clampDist = Math.min(dist, maxDist);

          if (joystickThumb) {
            joystickThumb.style.transform = `translate(${Math.cos(angle) * clampDist}px, ${Math.sin(angle) * clampDist}px)`;
          }

          // Normalize to -1 .. 1
          this.touchMove.x = (Math.cos(angle) * (clampDist / maxDist));
          this.touchMove.z = (Math.sin(angle) * (clampDist / maxDist));
        }

        // Update camera look
        if (touch.identifier === this.touchLookId) {
          isGameTouch = true;
          const dx = touch.clientX - this.lastTouchLookPos.x;
          const dy = touch.clientY - this.lastTouchLookPos.y;
          this.lastTouchLookPos = { x: touch.clientX, y: touch.clientY };

          this.yaw -= dx * this.sensitivity * 1.5;
          const yDelta = dy * this.sensitivity * 1.5 * (this.invertY ? 1 : -1);
          this.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch - yDelta));
          this.updateCameraRotation();
        }
      }

      if (isGameTouch && e.cancelable) {
        e.preventDefault();
      }
    }, { passive: false });

    const handleTouchEnd = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.touchMoveId) {
          this.touchMoveId = null;
          this.touchMove = { x: 0, z: 0 };
          if (joystickThumb) joystickThumb.style.transform = 'translate(0, 0)';
          if (joystickBase) joystickBase.style.display = 'none';
        }
        if (touch.identifier === this.touchLookId) {
          this.touchLookId = null;
        }
      }
    };

    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    // Direct Mobile Action Buttons with zero-latency touch listeners
    const fireBtn = document.getElementById('touch-btn-fire');
    if (fireBtn) {
      const handleFireStart = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        this.isShooting = true;
        if (this.onShoot) this.onShoot();
      };
      const handleFireEnd = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        this.isShooting = false;
      };
      fireBtn.addEventListener('touchstart', handleFireStart, { passive: false });
      fireBtn.addEventListener('touchend', handleFireEnd, { passive: false });
      fireBtn.addEventListener('touchcancel', handleFireEnd, { passive: false });
      fireBtn.addEventListener('mousedown', (e) => {
        this.isShooting = true;
        if (this.onShoot) this.onShoot();
      });
      fireBtn.addEventListener('mouseup', () => { this.isShooting = false; });
      fireBtn.addEventListener('mouseleave', () => { this.isShooting = false; });
      fireBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    }

    const jumpBtn = document.getElementById('touch-btn-jump');
    if (jumpBtn) {
      const handleJump = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (this.isGrounded) {
          this.velocity.y = 6.8;
          this.isGrounded = false;
          if (window.soundEngine) window.soundEngine.playJump();
        }
      };
      jumpBtn.addEventListener('touchstart', handleJump, { passive: false });
      jumpBtn.addEventListener('pointerdown', handleJump);
      jumpBtn.addEventListener('click', handleJump);
    }

    const reloadBtn = document.getElementById('touch-btn-reload');
    if (reloadBtn) {
      const handleReload = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (this.onReload) this.onReload();
      };
      reloadBtn.addEventListener('touchstart', handleReload, { passive: false });
      reloadBtn.addEventListener('pointerdown', handleReload);
      reloadBtn.addEventListener('click', handleReload);
    }

    // Allow clicking the HUD ammo box directly to reload weapon on desktop/mobile
    const hudWepBox = document.querySelector('.hud-weapon-box');
    if (hudWepBox) {
      hudWepBox.style.cursor = 'pointer';
      hudWepBox.title = 'Click to Reload Weapon (or press R)';
      hudWepBox.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (this.onReload) this.onReload();
      });
      hudWepBox.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onReload) this.onReload();
      });
    }

    const swapBtn = document.getElementById('touch-btn-swap');
    if (swapBtn) {
      const handleSwap = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (window.app && typeof window.app.cycleWeaponMobile === 'function') {
          window.app.cycleWeaponMobile();
        }
      };
      swapBtn.addEventListener('touchstart', handleSwap, { passive: false });
      swapBtn.addEventListener('pointerdown', handleSwap);
      swapBtn.addEventListener('click', handleSwap);
    }
  }

  setupListeners() {
    // Pointer Lock click
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = (document.pointerLockElement === this.domElement);
    });

    // Mouse Movement
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;

      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      this.yaw -= movementX * this.sensitivity;
      const yDelta = movementY * this.sensitivity * (this.invertY ? 1 : -1);
      this.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch - yDelta));

      this.updateCameraRotation();
    });

    // Mouse Clicks
    this.domElement.addEventListener('mousedown', (e) => {
      if (!this.isLocked) return;
      if (e.button === 0) {
        this.isShooting = true;
        if (this.onShoot) this.onShoot();
      } else if (e.button === 2) {
        this.isADS = true;
      }
    });

    this.domElement.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isShooting = false;
      } else if (e.button === 2) {
        this.isADS = false;
      }
    });

    // Disable context menu on right click
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard Keydown
    window.addEventListener('keydown', (e) => {
      if (!this.isLocked) return;

      switch (e.code) {
        case 'KeyW': this.keys.forward = true; break;
        case 'KeyS': this.keys.backward = true; break;
        case 'KeyA': this.keys.left = true; break;
        case 'KeyD': this.keys.right = true; break;
        case 'Space':
          if (this.isGrounded) {
            this.velocity.y = 6.8;
            this.isGrounded = false;
            if (window.soundEngine) window.soundEngine.playJump();
          }
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = true;
          break;
        case 'KeyR':
          if (this.onReload) this.onReload();
          break;
        case 'Digit1':
          if (this.onSwitchWeapon) this.onSwitchWeapon('assault_rifle');
          break;
        case 'Digit2':
          if (this.onSwitchWeapon) this.onSwitchWeapon('sniper_rifle');
          break;
        case 'Digit3':
          if (this.onSwitchWeapon) this.onSwitchWeapon('shotgun');
          break;
        case 'Digit4':
          if (this.onSwitchWeapon) this.onSwitchWeapon('pistol');
          break;
        case 'Tab':
          e.preventDefault();
          if (this.onScoreboardToggle) this.onScoreboardToggle(true);
          break;
      }
    });

    // Keyboard Keyup
    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = false; break;
        case 'KeyS': this.keys.backward = false; break;
        case 'KeyA': this.keys.left = false; break;
        case 'KeyD': this.keys.right = false; break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = false;
          break;
        case 'Tab':
          e.preventDefault();
          if (this.onScoreboardToggle) this.onScoreboardToggle(false);
          break;
      }
    });

    // Mouse Scroll Wheel weapon swap
    window.addEventListener('wheel', (e) => {
      if (!this.isLocked) return;
      const weaponOrder = ['assault_rifle', 'sniper_rifle', 'shotgun', 'pistol'];
      const currentIndex = weaponOrder.indexOf(this.currentWeaponId || 'assault_rifle');
      let nextIndex;
      if (e.deltaY > 0) {
        nextIndex = (currentIndex + 1) % weaponOrder.length;
      } else {
        nextIndex = (currentIndex - 1 + weaponOrder.length) % weaponOrder.length;
      }
      if (this.onSwitchWeapon) this.onSwitchWeapon(weaponOrder[nextIndex]);
    });
  }

  updateCameraRotation() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  setBounds(bounds) {
    if (bounds) {
      this.bounds = {
        minX: bounds.minX !== undefined ? bounds.minX : -38.5,
        maxX: bounds.maxX !== undefined ? bounds.maxX : 38.5,
        minZ: bounds.minZ !== undefined ? bounds.minZ : -38.5,
        maxZ: bounds.maxZ !== undefined ? bounds.maxZ : 38.5
      };
    }
  }

  setObstacles(obstacles) {
    this.obstacles = Array.isArray(obstacles) ? obstacles : [];
  }

  checkCollision(x, z) {
    const r = 0.45; // Player bounding cylinder radius
    for (let i = 0; i < this.obstacles.length; i++) {
      const box = this.obstacles[i];
      if (box.min && box.max) {
        if (x >= box.min[0] - r && x <= box.max[0] + r &&
            z >= box.min[2] - r && z <= box.max[2] + r) {
          return true;
        }
      }
    }
    return false;
  }

  update(delta) {
    if (!this.isLocked && !this.isTouch) return { isMoving: false, speed: 0 };

    const moveSpeed = this.keys.sprint ? 9.2 : 6.0;
    const moveDir = new THREE.Vector3();

    // Keyboard WASD
    if (this.keys.forward) moveDir.z -= 1;
    if (this.keys.backward) moveDir.z += 1;
    if (this.keys.left) moveDir.x -= 1;
    if (this.keys.right) moveDir.x += 1;

    // Mobile touch joystick
    if (this.isTouch && (this.touchMove.x !== 0 || this.touchMove.z !== 0)) {
      moveDir.x += this.touchMove.x;
      moveDir.z += this.touchMove.z;
    }

    const isMoving = moveDir.lengthSq() > 0;
    if (isMoving) {
      moveDir.normalize();
      // Apply yaw rotation to move direction
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

      this.velocity.x = moveDir.x * moveSpeed;
      this.velocity.z = moveDir.z * moveSpeed;
    } else {
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, 0, delta * 12);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, 0, delta * 12);
    }

    // Gravity
    this.velocity.y -= 19.6 * delta;

    // Apply Velocity with wall sliding collision detection
    const nextX = this.position.x + this.velocity.x * delta;
    const nextZ = this.position.z + this.velocity.z * delta;

    if (!this.checkCollision(nextX, nextZ)) {
      this.position.x = nextX;
      this.position.z = nextZ;
    } else {
      // Slide along X or Z axis if one is clear
      if (!this.checkCollision(nextX, this.position.z)) {
        this.position.x = nextX;
      } else if (!this.checkCollision(this.position.x, nextZ)) {
        this.position.z = nextZ;
      }
    }
    this.position.y += this.velocity.y * delta;

    // Arena Floor Collision
    if (this.position.y <= 1.7) {
      this.position.y = 1.7;
      this.velocity.y = 0;
      this.isGrounded = true;
    }

    // Arena Perimeter Bounds Clamp
    this.position.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.position.x));
    this.position.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, this.position.z));

    this.camera.position.copy(this.position);

    return {
      isMoving,
      speed: (this.keys.sprint ? 1.5 : 1.0)
    };
  }

  getForwardDirection() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(this.camera.rotation);
    return dir.normalize();
  }

  getShootOrigin() {
    return this.camera.position.clone();
  }
}
