import * as THREE from '/vendor/three/three.module.js';

export class WeaponViewModel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.camera.add(this.root);

    this.weapons = {};
    this.activeWeaponId = 'assault_rifle';
    this.weaponSkinData = {};

    // Transform offsets
    this.defaultPos = new THREE.Vector3(0.22, -0.18, -0.42);
    this.adsPos = new THREE.Vector3(0, -0.145, -0.32);
    this.targetPos = this.defaultPos.clone();
    this.currentPos = this.defaultPos.clone();

    // Dedicated subtle viewmodel key light for crisp weapon detail
    const gunLight = new THREE.PointLight(0xffffff, 1.2, 3.0);
    gunLight.position.set(0.15, 0.1, -0.2);
    this.root.add(gunLight);

    // Bobbing and recoil
    this.bobTime = 0;
    this.recoilZ = 0;
    this.recoilRotX = 0;
    this.isADS = false;

    // Reload animation
    this.isReloading = false;
    this.reloadProgress = 0;
    this.reloadDuration = 2.0;

    this.buildWeapons();
  }

  setSkin(skinData) {
    this.weaponSkinData = skinData || {};
    this.updateMaterials();
  }

  buildWeapons() {
    this.weapons.assault_rifle = this.createAssaultRifle();
    this.weapons.sniper_rifle = this.createSniperRifle();
    this.weapons.shotgun = this.createShotgun();
    this.weapons.pistol = this.createPistol();

    for (const [id, grp] of Object.entries(this.weapons)) {
      this.root.add(grp);
      grp.visible = (id === this.activeWeaponId);
    }
  }

  getMaterial() {
    const primary = this.weaponSkinData.color_primary || '#24272e';
    const accent = this.weaponSkinData.color_accent || '#00e5ff';
    const metalness = this.weaponSkinData.metallic !== undefined ? this.weaponSkinData.metallic : 0.6;
    const roughness = this.weaponSkinData.roughness !== undefined ? this.weaponSkinData.roughness : 0.35;
    const emissive = this.weaponSkinData.emissive || '#000000';

    return {
      bodyMat: new THREE.MeshStandardMaterial({
        color: new THREE.Color(primary),
        metalness,
        roughness,
        emissive: new THREE.Color(emissive),
        emissiveIntensity: 0.3
      }),
      accentMat: new THREE.MeshStandardMaterial({
        color: new THREE.Color(accent),
        metalness: 0.8,
        roughness: 0.2,
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.5
      }),
      darkMat: new THREE.MeshStandardMaterial({
        color: 0x111215,
        roughness: 0.7,
        metalness: 0.2
      })
    };
  }

  updateMaterials() {
    // Rebuild active weapon mesh with new skin
    for (const grp of Object.values(this.weapons)) {
      this.root.remove(grp);
    }
    this.weapons = {};
    this.buildWeapons();
    this.switchWeapon(this.activeWeaponId);
  }

  createAssaultRifle() {
    const grp = new THREE.Group();
    const mats = this.getMaterial();

    // Receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.32), mats.bodyMat);
    grp.add(receiver);

    // Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 8), mats.darkMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.28);
    grp.add(barrel);

    // Handguard
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.2), mats.bodyMat);
    handguard.position.set(0, 0.01, -0.2);
    grp.add(handguard);

    // Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.16, 0.07), mats.darkMat);
    mag.position.set(0, -0.1, -0.05);
    mag.rotation.x = 0.15;
    grp.add(mag);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), mats.darkMat);
    grip.position.set(0, -0.09, 0.1);
    grip.rotation.x = -0.3;
    grp.add(grip);

    // Holographic Sight
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 0.08), mats.accentMat);
    sight.position.set(0, 0.065, -0.02);
    grp.add(sight);

    return grp;
  }

  createSniperRifle() {
    const grp = new THREE.Group();
    const mats = this.getMaterial();

    // Heavy Chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.45), mats.bodyMat);
    grp.add(chassis);

    // Long Fluted Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 8), mats.darkMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.48);
    grp.add(barrel);

    // Muzzle Brake
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), mats.accentMat);
    muzzle.position.set(0, 0.02, -0.76);
    grp.add(muzzle);

    // High Magnification Scope
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 12), mats.darkMat);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.085, -0.04);
    grp.add(scopeTube);

    // Scope Lens Mount
    const lensFront = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.025, 0.05, 12), mats.accentMat);
    lensFront.rotation.x = Math.PI / 2;
    lensFront.position.set(0, 0.085, -0.15);
    grp.add(lensFront);

    return grp;
  }

  createShotgun() {
    const grp = new THREE.Group();
    const mats = this.getMaterial();

    // Heavy Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.35), mats.bodyMat);
    grp.add(body);

    // Dual Heavy Barrels
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 8), mats.darkMat);
    b1.rotation.x = Math.PI / 2;
    b1.position.set(0, 0.025, -0.32);
    grp.add(b1);

    // Pump Slide
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), mats.accentMat);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.015, -0.28);
    grp.add(pump);

    return grp;
  }

  createPistol() {
    const grp = new THREE.Group();
    const mats = this.getMaterial();

    // Slide
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.2), mats.bodyMat);
    slide.position.set(0, 0.04, -0.06);
    grp.add(slide);

    // Grip Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.06), mats.darkMat);
    frame.position.set(0, -0.03, 0.01);
    frame.rotation.x = -0.25;
    grp.add(frame);

    // Glow accents
    const laser = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.06), mats.accentMat);
    laser.position.set(0, 0.01, -0.13);
    grp.add(laser);

    return grp;
  }

  switchWeapon(weaponId) {
    if (!this.weapons[weaponId]) return;
    this.activeWeaponId = weaponId;

    for (const [id, grp] of Object.entries(this.weapons)) {
      grp.visible = (id === weaponId);
    }
  }

  triggerRecoil(kickAmount = 0.08) {
    this.recoilZ = kickAmount;
    this.recoilRotX = kickAmount * 1.8;
  }

  triggerReload(durationSec = 2.0) {
    this.isReloading = true;
    this.reloadProgress = 0;
    this.reloadDuration = durationSec;
  }

  setADS(enable) {
    this.isADS = enable;
  }

  update(delta, isMoving = false, speed = 1.0) {
    // 1. Recover recoil smoothly
    this.recoilZ = THREE.MathUtils.lerp(this.recoilZ, 0, delta * 18);
    this.recoilRotX = THREE.MathUtils.lerp(this.recoilRotX, 0, delta * 18);

    // 2. Weapon Bobbing
    let bobX = 0;
    let bobY = 0;
    if (isMoving && !this.isADS) {
      this.bobTime += delta * 11 * speed;
      bobX = Math.sin(this.bobTime * 0.5) * 0.012;
      bobY = Math.abs(Math.sin(this.bobTime)) * 0.015;
    } else {
      this.bobTime = 0;
    }

    // 3. Aim Down Sights (ADS) Position Lerp
    this.targetPos.copy(this.isADS ? this.adsPos : this.defaultPos);
    this.currentPos.lerp(this.targetPos, delta * 14);

    // 4. Reload dip
    let reloadDip = 0;
    if (this.isReloading) {
      this.reloadProgress += delta / this.reloadDuration;
      if (this.reloadProgress >= 1.0) {
        this.isReloading = false;
        this.reloadProgress = 0;
      } else {
        // Smooth sine dip curve
        reloadDip = Math.sin(this.reloadProgress * Math.PI) * 0.22;
      }
    }

    this.root.position.set(
      this.currentPos.x + bobX,
      this.currentPos.y - bobY - reloadDip,
      this.currentPos.z + this.recoilZ
    );

    this.root.rotation.x = this.recoilRotX + (reloadDip * 1.2);
  }
}
