import * as THREE from '/vendor/three/three.module.js';
import { MapData } from './MapData.js';

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
    this.bounds = MapData.getBounds('house');
    this.obstacles = MapData.getObstacles('house');

    this.setupListeners();
    if (this.isTouch) {
      this.setupTouchControls();
    }

    // Immediately align camera to initial eye-level position and neutral rotation
    this.camera.position.copy(this.position);
    this.updateCameraRotation();
  }

  setPosition(x, y, z, yaw = null, pitch = null) {
    // If y is ground/foot level (<= 0.5), convert to eye height (y + 1.7)
    const eyeY = (y <= 0.5) ? y + 1.7 : y;
    const footY = Math.max(0, eyeY - 1.7);
    const depen = this.depenetrate(x, footY, z, 0.4, 1.85);

    this.position.set(depen.x, eyeY, depen.z);
    this.velocity.set(0, 0, 0);
    this.isGrounded = true;

    if (yaw !== null && Number.isFinite(yaw)) {
      this.yaw = yaw;
    }
    if (pitch !== null && Number.isFinite(pitch)) {
      this.pitch = pitch;
    }
    this.updateCameraRotation();
    this.camera.position.copy(this.position);
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
      // Only capture touch joystick and look controls when actively in 3D gameplay
      if (window.app && window.app.currentScreen !== 'gameplay') {
        return;
      }

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
      // Only capture touch joystick and look controls when actively in 3D gameplay
      if (window.app && window.app.currentScreen !== 'gameplay') {
        return;
      }

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
          const ySign = this.invertY ? -1 : 1;
          const yDelta = dy * this.sensitivity * 1.5 * ySign;
          this.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch - yDelta));
          this.updateCameraRotation();
        }
      }

      if (isGameTouch && e.cancelable) {
        e.preventDefault();
      }
    }, { passive: false });

    const handleTouchEnd = (e) => {
      if (window.app && window.app.currentScreen !== 'gameplay') {
        return;
      }

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
      let fireLookTouchId = null;
      let lastFireTouchPos = { x: 0, y: 0 };

      const handleFireStart = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        this.isShooting = true;
        if (e.changedTouches && e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          fireLookTouchId = t.identifier;
          lastFireTouchPos = { x: t.clientX, y: t.clientY };
        }
        if (this.onShoot) this.onShoot();
      };

      const handleFireMove = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (fireLookTouchId !== null && e.changedTouches) {
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === fireLookTouchId) {
              const dx = t.clientX - lastFireTouchPos.x;
              const dy = t.clientY - lastFireTouchPos.y;
              lastFireTouchPos = { x: t.clientX, y: t.clientY };

              this.yaw -= dx * this.sensitivity * 1.5;
              const ySign = this.invertY ? -1 : 1;
              const yDelta = dy * this.sensitivity * 1.5 * ySign;
              this.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch - yDelta));
              this.updateCameraRotation();
              break;
            }
          }
        }
      };

      const handleFireEnd = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        this.isShooting = false;
        fireLookTouchId = null;
      };

      fireBtn.addEventListener('touchstart', handleFireStart, { passive: false });
      fireBtn.addEventListener('touchmove', handleFireMove, { passive: false });
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
      if (!this.isLocked) {
        this.keys.forward = false;
        this.keys.backward = false;
        this.keys.left = false;
        this.keys.right = false;
        this.keys.sprint = false;
      }
    });

    // Window blur: reset all movement states when window loses focus
    window.addEventListener('blur', () => {
      this.keys.forward = false;
      this.keys.backward = false;
      this.keys.left = false;
      this.keys.right = false;
      this.keys.jump = false;
      this.keys.sprint = false;
      this.velocity.x = 0;
      this.velocity.z = 0;
    });

    // Mouse Movement
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;

      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      this.yaw -= movementX * this.sensitivity;
      const ySign = this.invertY ? -1 : 1;
      const yDelta = movementY * this.sensitivity * ySign;
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
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          break;
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
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
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
    this.camera.rotation.z = 0;
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

  isColliding(x, y, z, radius = 0.4, height = 1.85) {
    for (let i = 0; i < this.obstacles.length; i++) {
      const box = this.obstacles[i];
      if (box && box.min && box.max) {
        const isVertOverlap = box.isBoundary ? true : (y + height > box.min[1] && y < box.max[1]);
        if (isVertOverlap) {
          if (x >= box.min[0] - radius && x <= box.max[0] + radius &&
              z >= box.min[2] - radius && z <= box.max[2] + radius) {
            return true;
          }
        }
      }
    }
    return false;
  }

  depenetrate(x, y, z, radius = 0.4, height = 1.85, prevX = null, prevZ = null) {
    let resX = x;
    let resZ = z;
    const eps = 0.002;

    for (let iter = 0; iter < 4; iter++) {
      let pushed = false;
      for (let i = 0; i < this.obstacles.length; i++) {
        const box = this.obstacles[i];
        const isVert = box && box.min && box.max && (box.isBoundary ? true : ((y + height > box.min[1]) && (y < box.max[1])));
        if (isVert) {
          const minX = box.min[0] - radius;
          const maxX = box.max[0] + radius;
          const minZ = box.min[2] - radius;
          const maxZ = box.max[2] + radius;

          if (resX >= minX && resX <= maxX && resZ >= minZ && resZ <= maxZ) {
            const dLeft = resX - minX;
            const dRight = maxX - resX;
            const dBottom = resZ - minZ;
            const dTop = maxZ - resZ;

            if (prevX !== null && prevZ !== null) {
              if (prevX <= box.min[0] - radius) {
                resX = minX - eps;
              } else if (prevX >= box.max[0] + radius) {
                resX = maxX + eps;
              } else if (prevZ <= box.min[2] - radius) {
                resZ = minZ - eps;
              } else if (prevZ >= box.max[2] + radius) {
                resZ = maxZ + eps;
              } else {
                const minD = Math.min(dLeft, dRight, dBottom, dTop);
                if (minD === dLeft) resX = minX - eps;
                else if (minD === dRight) resX = maxX + eps;
                else if (minD === dBottom) resZ = minZ - eps;
                else resZ = maxZ + eps;
              }
            } else {
              const minD = Math.min(dLeft, dRight, dBottom, dTop);
              if (minD === dLeft) resX = minX - eps;
              else if (minD === dRight) resX = maxX + eps;
              else if (minD === dBottom) resZ = minZ - eps;
              else resZ = maxZ + eps;
            }

            pushed = true;
          }
        }
      }
      if (!pushed) break;
    }

    const bMinX = this.bounds.minX !== undefined ? this.bounds.minX + radius : -38;
    const bMaxX = this.bounds.maxX !== undefined ? this.bounds.maxX - radius : 38;
    const bMinZ = this.bounds.minZ !== undefined ? this.bounds.minZ + radius : -38;
    const bMaxZ = this.bounds.maxZ !== undefined ? this.bounds.maxZ - radius : 38;

    resX = Math.max(bMinX, Math.min(bMaxX, resX));
    resZ = Math.max(bMinZ, Math.min(bMaxZ, resZ));

    return { x: resX, z: resZ };
  }

  resolveMovement(targetX, targetZ, radius = 0.4, height = 1.85) {
    const bMinX = this.bounds.minX !== undefined ? this.bounds.minX + radius : -38;
    const bMaxX = this.bounds.maxX !== undefined ? this.bounds.maxX - radius : 38;
    const bMinZ = this.bounds.minZ !== undefined ? this.bounds.minZ + radius : -38;
    const bMaxZ = this.bounds.maxZ !== undefined ? this.bounds.maxZ - radius : 38;

    const clampX = (x) => Math.max(bMinX, Math.min(bMaxX, x));
    const clampZ = (z) => Math.max(bMinZ, Math.min(bMaxZ, z));

    const curY = Math.max(0, this.position.y - 1.7);

    const origX = this.position.x;
    const origZ = this.position.z;

    let posX = clampX(origX);
    let posZ = clampZ(origZ);

    if (this.isColliding(posX, curY, posZ, radius, height)) {
      const initialDepen = this.depenetrate(posX, curY, posZ, radius, height);
      posX = initialDepen.x;
      posZ = initialDepen.z;
    }

    const clampedTargetX = clampX(targetX);
    const clampedTargetZ = clampZ(targetZ);

    const dx = clampedTargetX - posX;
    const dz = clampedTargetZ - posZ;
    const dist = Math.hypot(dx, dz);

    if (dist < 1e-5) {
      this.position.x = posX;
      this.position.z = posZ;
      return;
    }

    const maxStep = 0.05;
    const numSteps = Math.min(64, Math.max(1, Math.ceil(dist / maxStep)));
    const stepX = dx / numSteps;
    const stepZ = dz / numSteps;

    for (let s = 0; s < numSteps; s++) {
      const tryX = clampX(posX + stepX);
      const tryZ = clampZ(posZ + stepZ);

      if (!this.isColliding(tryX, curY, tryZ, radius, height)) {
        posX = tryX;
        posZ = tryZ;
      } else {
        const slideX = clampX(posX + stepX);
        const slideZ = clampZ(posZ + stepZ);

        const canSlideX = (stepX !== 0) && !this.isColliding(slideX, curY, posZ, radius, height);
        const canSlideZ = (stepZ !== 0) && !this.isColliding(posX, curY, slideZ, radius, height);

        if (canSlideX && !canSlideZ) {
          posX = slideX;
        } else if (canSlideZ && !canSlideX) {
          posZ = slideZ;
        } else if (canSlideX && canSlideZ) {
          if (Math.abs(stepX) >= Math.abs(stepZ)) {
            posX = slideX;
          } else {
            posZ = slideZ;
          }
        } else {
          break;
        }
      }
    }

    if (this.isColliding(posX, curY, posZ, radius, height)) {
      const finalDepen = this.depenetrate(clampX(posX), curY, clampZ(posZ), radius, height, origX, origZ);
      posX = finalDepen.x;
      posZ = finalDepen.z;
    }
    this.position.x = clampX(posX);
    this.position.z = clampZ(posZ);
  }

  checkCollision(x, z) {
    const curY = Math.max(0, this.position.y - 1.7);
    return this.isColliding(x, curY, z, 0.4, 1.85);
  }

  update(delta) {
    if (!this.isLocked && !this.isTouch) {
      // Even when not locked, enforce ground clearance and synchronize camera position
      if (this.position.y < 1.7) {
        this.position.y = 1.7;
      }
      this.camera.position.copy(this.position);
      return { isMoving: false, speed: 0 };
    }

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
      if (Math.hypot(this.velocity.x, this.velocity.z) < 0.01) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    // Gravity
    this.velocity.y -= 19.6 * delta;

    // Continuous substepped collision resolution & wall sliding
    const targetX = this.position.x + this.velocity.x * delta;
    const targetZ = this.position.z + this.velocity.z * delta;

    this.resolveMovement(targetX, targetZ, 0.4, 1.85);

    this.position.y += this.velocity.y * delta;

    // Arena Floor Collision
    if (this.position.y <= 1.7) {
      this.position.y = 1.7;
      this.velocity.y = 0;
      this.isGrounded = true;
    }

    this.camera.position.copy(this.position);

    return {
      isMoving,
      speed: (this.keys.sprint ? 1.5 : 1.0)
    };
  }

  getForwardDirection() {
    this.updateCameraRotation();
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(this.camera.rotation);
    return dir.normalize();
  }

  getShootOrigin() {
    this.camera.position.copy(this.position);
    return this.camera.position.clone();
  }
}
