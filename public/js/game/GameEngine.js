import * as THREE from '/vendor/three/three.module.js';
import { Arena } from './Arena.js';
import { MapBuilder } from './MapBuilder.js';
import { PlayerModel } from './PlayerModel.js';
import { WeaponViewModel } from './WeaponViewModel.js';
import { ParticleSystem } from './ParticleSystem.js';
import { InputController } from './InputController.js';

export const WEAPON_COOLDOWNS = {
  assault_rifle: 100, // 600 RPM
  sniper_rifle: 1200, // ~50 RPM
  shotgun: 750,       // 80 RPM
  pistol: 160         // 375 RPM
};

export class GameEngine {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                    (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ab4f8); // Bright sky blue
    this.scene.fog = new THREE.Fog(0x8ab4f8, 65, 250); // Soft distant atmospheric haze

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    this.scene.add(this.camera); // Crucial: enables first-person weapon viewmodel rendering

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isMobile,
      powerPreference: 'high-performance',
      precision: this.isMobile ? 'mediump' : 'highp'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.25 : 2.0));
    this.renderer.shadowMap.enabled = !this.isMobile;
    if (!this.isMobile) {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35; // Cinematic, vibrant daytime exposure
    this.container.appendChild(this.renderer.domElement);

    this.lastShootTime = 0;

    // Systems
    this.setupLighting();
    this.currentMapId = null;
    this.currentMapGroup = null;
    this.particles = new ParticleSystem(this.scene);
    this.weaponView = new WeaponViewModel(this.camera);
    this.loadMap('house');

    this.remotePlayers = new Map(); // userId -> { model, targetPos, targetRot, lastSeen }
    this.localPlayerId = null;

    // Performance tracking
    this.lastFrameTime = performance.now();
    this.fpsCounter = 60;
    this.frameCount = 0;
    this.fpsTimer = 0;

    // Graphics settings
    this.graphicsQuality = 'high';

    // Callbacks
    this.onShootCallback = null;
    this.onReloadCallback = null;
    this.onSwitchWeaponCallback = null;
    this.onScoreboardToggleCallback = null;

    this.input = new InputController(
      this.camera,
      this.renderer.domElement,
      () => this.handleShoot(),
      () => this.handleReload(),
      (wepId) => this.handleSwitchWeapon(wepId),
      (show) => this.handleScoreboardToggle(show)
    );

    // Network input sync rate limiter (30Hz)
    this.lastNetSync = 0;

    window.addEventListener('resize', () => this.onResize());
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupLighting() {
    // 1. Hemisphere Light: Natural sky illumination + soft ground bounce
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x7c8ba1, 1.8);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    // 2. Ambient Light for clear shadow visibility
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(this.ambientLight);

    // 3. Sun Light (Main key light casting crisp directional shadows)
    this.sunLight = new THREE.DirectionalLight(0xfffaed, 2.5);
    this.sunLight.position.set(30, 55, 25);
    this.sunLight.castShadow = !this.isMobile;
    this.sunLight.shadow.mapSize.width = this.isMobile ? 512 : 2048;
    this.sunLight.shadow.mapSize.height = this.isMobile ? 512 : 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 150;
    this.sunLight.shadow.camera.left = -50;
    this.sunLight.shadow.camera.right = 50;
    this.sunLight.shadow.camera.top = 50;
    this.sunLight.shadow.camera.bottom = -50;
    this.scene.add(this.sunLight);

    // 4. Fill Light from opposite quadrant (removes pitch-black shadows)
    this.fillLight = new THREE.DirectionalLight(0xd6e5f8, 1.5);
    this.fillLight.position.set(-30, 40, -25);
    this.scene.add(this.fillLight);

    // 5. Central arena energy beacon
    const centerLight = new THREE.PointLight(0x00e5ff, 3.5, 45);
    centerLight.position.set(0, 5, 0);
    this.scene.add(centerLight);

    // 6. Perimeter floodlights
    const addFloodlight = (x, z) => {
      const flood = new THREE.PointLight(0xffeedd, 2.2, 38);
      flood.position.set(x, 7.5, z);
      this.scene.add(flood);
    };
    addFloodlight(-28, -24);
    addFloodlight(28, 24);
    addFloodlight(-26, 24);
    addFloodlight(26, -24);
  }

  loadMap(mapId = 'house') {
    if (this.currentMapId === mapId && this.currentMapGroup) {
      return;
    }
    this.currentMapId = mapId;

    // 1. Dispose old map cleanly
    if (this.currentMapGroup) {
      MapBuilder.disposeMap(this.scene, this.currentMapGroup);
      this.currentMapGroup = null;
    }

    // 2. Build procedural 3D map environment
    this.currentMapGroup = MapBuilder.buildMap(this.scene, mapId);

    // 3. Apply map lighting, sky, and fog
    this.applyMapLighting(mapId);
  }

  applyMapLighting(mapId) {
    const LIGHTING_CONFIGS = {
      house: {
        sky: 0x90caf9,
        ground: 0x4caf50,
        sunColor: 0xfffaed,
        sunPos: [25, 45, 20],
        ambient: 0xffffff,
        ambientIntensity: 1.3,
        fog: 0xb0bec5,
        fogNear: 55,
        fogFar: 190,
        exposure: 1.35,
        bounds: { minX: -27.5, maxX: 27.5, minZ: -27.5, maxZ: 27.5 }
      },
      farm: {
        sky: 0x87ceeb,
        ground: 0xd4a373,
        sunColor: 0xfff3cf,
        sunPos: [35, 55, 30],
        ambient: 0xffeedd,
        ambientIntensity: 1.4,
        fog: 0xd8c29d,
        fogNear: 70,
        fogFar: 250,
        exposure: 1.4,
        bounds: { minX: -37.5, maxX: 37.5, minZ: -37.5, maxZ: 37.5 }
      },
      forest: {
        sky: 0x78909c,
        ground: 0x2e4726,
        sunColor: 0xfff8e1,
        sunPos: [20, 50, 15],
        ambient: 0xe8f5e9,
        ambientIntensity: 1.25,
        fog: 0x546e7a,
        fogNear: 45,
        fogFar: 160,
        exposure: 1.28,
        bounds: { minX: -37.5, maxX: 37.5, minZ: -37.5, maxZ: 37.5 }
      },
      minecraft: {
        sky: 0x70a5ff,
        ground: 0x55a034,
        sunColor: 0xffffff,
        sunPos: [30, 60, 20],
        ambient: 0xffffff,
        ambientIntensity: 1.5,
        fog: 0x90caf9,
        fogNear: 80,
        fogFar: 260,
        exposure: 1.45,
        bounds: { minX: -37.5, maxX: 37.5, minZ: -37.5, maxZ: 37.5 }
      },
      cruise: {
        sky: 0x64b5f6,
        ground: 0x01579b,
        sunColor: 0xfffde7,
        sunPos: [40, 55, 30],
        ambient: 0xffffff,
        ambientIntensity: 1.4,
        fog: 0x90caf9,
        fogNear: 80,
        fogFar: 300,
        exposure: 1.4,
        bounds: { minX: -17.5, maxX: 17.5, minZ: -37.5, maxZ: 37.5 }
      },
      sector7: {
        sky: 0x8ab4f8,
        ground: 0x7c8ba1,
        sunColor: 0xfffaed,
        sunPos: [30, 55, 25],
        ambient: 0xffffff,
        ambientIntensity: 1.3,
        fog: 0x8ab4f8,
        fogNear: 65,
        fogFar: 250,
        exposure: 1.35,
        bounds: { minX: -38.5, maxX: 38.5, minZ: -38.5, maxZ: 38.5 }
      }
    };

    const cfg = LIGHTING_CONFIGS[mapId] || LIGHTING_CONFIGS.house;

    if (this.scene) {
      this.scene.background = new THREE.Color(cfg.sky);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(cfg.fog);
        this.scene.fog.near = cfg.fogNear;
        this.scene.fog.far = cfg.fogFar;
      }
    }

    if (this.hemiLight) {
      this.hemiLight.color.setHex(cfg.sky);
      this.hemiLight.groundColor.setHex(cfg.ground);
    }

    if (this.ambientLight) {
      this.ambientLight.color.setHex(cfg.ambient);
      this.ambientLight.intensity = cfg.ambientIntensity;
    }

    if (this.sunLight) {
      this.sunLight.color.setHex(cfg.sunColor);
      this.sunLight.position.set(...cfg.sunPos);
    }

    if (this.renderer) {
      this.renderer.toneMappingExposure = cfg.exposure;
    }

    if (this.input) {
      this.input.setBounds(cfg.bounds);
    }
  }

  setBrightness(val) {
    if (this.renderer) {
      this.renderer.toneMappingExposure = val || 1.35;
    }
  }

  setGraphicsQuality(level) {
    this.graphicsQuality = level;
    if (level === 'low') {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1.0);
      this.sunLight.castShadow = false;
    } else if (level === 'medium') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 1024;
      this.sunLight.shadow.mapSize.height = 1024;
    } else { // high or ultra
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = (level === 'ultra') ? 4096 : 2048;
      this.sunLight.shadow.mapSize.height = (level === 'ultra') ? 4096 : 2048;
    }
  }

  setFieldOfView(fov) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setLocalPlayer(id, equippedSkins = {}) {
    this.localPlayerId = id;
    if (equippedSkins.weaponSkin) {
      this.weaponView.setSkin(equippedSkins.weaponSkin);
    }
  }

  syncRemotePlayers(playerSnapshots) {
    const activeIds = new Set();

    for (const snap of playerSnapshots) {
      const pid = snap.id;
      activeIds.add(pid);

      if (pid === this.localPlayerId) {
        // Local player stats update handled by HUD
        continue;
      }

      let entry = this.remotePlayers.get(pid);
      if (!entry) {
        // Instantiate new 3D remote player model
        const model = new PlayerModel(snap, false);
        this.scene.add(model.group);
        entry = {
          model,
          targetPos: new THREE.Vector3(snap.pos[0], snap.pos[1], snap.pos[2]),
          targetRotY: snap.rot[0],
          targetRotX: snap.rot[1],
          lastSeen: performance.now()
        };
        this.remotePlayers.set(pid, entry);
      }

      // Update targets for smooth interpolation
      entry.targetPos.set(snap.pos[0], snap.pos[1], snap.pos[2]);
      entry.targetRotY = snap.rot[0];
      entry.targetRotX = snap.rot[1];
      entry.model.updateNameplate(snap.hp, snap.sh);

      if (!snap.alive && entry.model.isAlive) {
        entry.model.setDead();
      } else if (snap.alive && !entry.model.isAlive) {
        entry.model.setAlive();
      }
    }

    // Remove disconnected remote players
    for (const [id, entry] of this.remotePlayers.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.model.group);
        this.remotePlayers.delete(id);
      }
    }
  }

  handleShoot() {
    const now = performance.now();
    const activeWeaponId = (this.weaponView && this.weaponView.activeWeaponId) || 'assault_rifle';
    const cooldown = WEAPON_COOLDOWNS[activeWeaponId] || 150;
    if (now - this.lastShootTime < cooldown) return false;
    this.lastShootTime = now;

    if (this.onShootCallback) {
      const origin = this.input.getShootOrigin();
      const dir = this.input.getForwardDirection();
      this.onShootCallback(origin, dir);
      return true;
    }
    return false;
  }

  handleReload() {
    if (this.onReloadCallback) {
      this.onReloadCallback();
    }
  }

  handleSwitchWeapon(weaponId) {
    if (this.onSwitchWeaponCallback) {
      this.onSwitchWeaponCallback(weaponId);
    }
  }

  handleScoreboardToggle(show) {
    if (this.onScoreboardToggleCallback) {
      this.onScoreboardToggleCallback(show);
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.25 : 2.0));
  }

  animate(now) {
    requestAnimationFrame(this.animate);
    const delta = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    // Track FPS
    this.frameCount++;
    this.fpsTimer += delta;
    if (this.fpsTimer >= 1.0) {
      this.fpsCounter = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer = 0;
      const fpsEl = document.getElementById('hud-fps');
      if (fpsEl) fpsEl.textContent = `${this.fpsCounter} FPS`;
    }

    // 1. Update Input Controller
    const moveInfo = this.input.update(delta);

    // 2. Continuous fire for automatic weapons
    if (this.input.isShooting && this.weaponView && this.weaponView.activeWeaponId === 'assault_rifle') {
      this.handleShoot();
    }

    // 3. Update Weapon View Model
    this.weaponView.setADS(this.input.isADS);
    this.weaponView.update(delta, moveInfo.isMoving, moveInfo.speed);

    // 4. Update Particle Systems
    this.particles.update(delta);

    // 5. Interpolate Remote Players
    for (const entry of this.remotePlayers.values()) {
      entry.model.group.position.lerp(entry.targetPos, delta * 15);
      entry.model.group.rotation.y = THREE.MathUtils.lerp(entry.model.group.rotation.y, entry.targetRotY, delta * 15);
      if (entry.model.headGroup) {
        entry.model.headGroup.rotation.x = THREE.MathUtils.lerp(entry.model.headGroup.rotation.x, entry.targetRotX, delta * 15);
      }
      entry.model.update(delta, entry.model.group.position.distanceTo(entry.targetPos) > 0.05, 1.0);
    }

    // 6. Network sync player input to server at 30Hz
    if (now - this.lastNetSync >= 33 && window.netClient && window.netClient.isConnected) {
      this.lastNetSync = now;
      window.netClient.sendInput(
        { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
        { yaw: this.input.yaw, pitch: this.input.pitch },
        { x: this.input.velocity.x, y: this.input.velocity.y, z: this.input.velocity.z }
      );
    }

    // 7. Render 3D Scene
    this.renderer.render(this.scene, this.camera);
  }
}
