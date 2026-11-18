import * as THREE from '../../vendor/three/three.module.js';
import { generateCamoTexture } from './PlayerModel.js';

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

    // Dedicated subtle viewmodel key light for crisp weapon & glove detail
    const gunLight = new THREE.PointLight(0xffffff, 1.3, 3.5);
    gunLight.position.set(0.18, 0.12, -0.22);
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

    // Operator Arms
    this.armsGroup = new THREE.Group();
    this.root.add(this.armsGroup);
    this.leftArmTargetPos = new THREE.Vector3(0, 0, 0);
    this.rightArmTargetPos = new THREE.Vector3(0, 0, 0);

    this.buildWeapons();
    this.buildOperatorArms();
    this.switchWeapon(this.activeWeaponId);
  }

  setSkin(skinData) {
    this.weaponSkinData = skinData || {};
    this.updateMaterials();
  }

  getMaterial() {
    const primary = this.weaponSkinData.color_primary || '#24272e';
    const accent = this.weaponSkinData.color_accent || '#00e5ff';
    const metalness = this.weaponSkinData.metallic !== undefined ? this.weaponSkinData.metallic : 0.72;
    const roughness = this.weaponSkinData.roughness !== undefined ? this.weaponSkinData.roughness : 0.28;
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
        metalness: 0.85,
        roughness: 0.15,
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.75
      }),
      darkMat: new THREE.MeshStandardMaterial({
        color: 0x111215,
        roughness: 0.65,
        metalness: 0.25
      }),
      steelMat: new THREE.MeshStandardMaterial({
        color: 0x3a3d45,
        metalness: 0.85,
        roughness: 0.20
      }),
      glowMat: new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent)
      })
    };
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

  buildOperatorArms() {
    // Clear any existing arms
    while (this.armsGroup.children.length > 0) {
      this.armsGroup.remove(this.armsGroup.children[0]);
    }

    const camoTexture = generateCamoTexture('#334130', '#1c241a', '#445540');

    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x384635,
      map: camoTexture || null,
      roughness: 0.82,
      metalness: 0.06
    });

    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x191c1f,
      roughness: 0.62,
      metalness: 0.18
    });

    const knuckleMat = new THREE.MeshStandardMaterial({
      color: 0x0f1113,
      roughness: 0.35,
      metalness: 0.30
    });

    const strapMat = new THREE.MeshStandardMaterial({
      color: 0x22262b,
      roughness: 0.75,
      metalness: 0.10
    });

    // 1. Right Arm & Tactical Glove (Gripping the weapon pistol grip)
    this.rightArmGroup = new THREE.Group();

    // Forearm coming from lower right screen
    const rightForearm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.30), sleeveMat);
    rightForearm.position.set(0.16, -0.16, 0.25);
    rightForearm.rotation.set(-0.25, 0.35, -0.15);
    this.rightArmGroup.add(rightForearm);

    // Wrist cinch strap
    const rightWrist = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.04), strapMat);
    rightWrist.position.set(0.05, -0.11, 0.14);
    rightWrist.rotation.set(-0.25, 0.35, -0.15);
    this.rightArmGroup.add(rightWrist);

    // Glove Palm / Back of Hand
    const rightHandBack = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.09), gloveMat);
    rightHandBack.position.set(0.02, -0.09, 0.10);
    this.rightArmGroup.add(rightHandBack);

    // Molded knuckle protection plate
    const rightKnuckles = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.08), knuckleMat);
    rightKnuckles.position.set(0.035, -0.06, 0.10);
    this.rightArmGroup.add(rightKnuckles);

    // Fingers wrapped around front of pistol grip
    const rightFingers = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.075, 0.04), gloveMat);
    rightFingers.position.set(0, -0.10, 0.125);
    this.rightArmGroup.add(rightFingers);

    // Index trigger finger alongside receiver
    const rightTriggerFinger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.065), gloveMat);
    rightTriggerFinger.position.set(0.026, -0.05, 0.065);
    this.rightArmGroup.add(rightTriggerFinger);

    this.armsGroup.add(this.rightArmGroup);

    // 2. Left Arm & Tactical Glove (Supporting handguard / pump)
    this.leftArmGroup = new THREE.Group();

    // Forearm coming from lower left screen
    const leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.34), sleeveMat);
    leftForearm.position.set(-0.22, -0.18, 0.12);
    leftForearm.rotation.set(-0.35, -0.45, 0.20);
    this.leftArmGroup.add(leftForearm);

    // Wrist cinch strap
    const leftWrist = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.04), strapMat);
    leftWrist.position.set(-0.08, -0.09, -0.03);
    leftWrist.rotation.set(-0.35, -0.45, 0.20);
    this.leftArmGroup.add(leftWrist);

    // Glove Palm cupping underneath the weapon handguard
    const leftGlovePalm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.10), gloveMat);
    leftGlovePalm.position.set(0, -0.045, -0.18);
    this.leftArmGroup.add(leftGlovePalm);

    // Molded knuckle plate
    const leftKnuckles = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.08), knuckleMat);
    leftKnuckles.position.set(0, -0.07, -0.18);
    this.leftArmGroup.add(leftKnuckles);

    // Fingers curled up the right side of handguard
    const leftFingers = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.065, 0.09), gloveMat);
    leftFingers.position.set(0.038, -0.015, -0.18);
    this.leftArmGroup.add(leftFingers);

    // Thumb resting along left side of handguard
    const leftThumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.075), gloveMat);
    leftThumb.position.set(-0.038, 0.01, -0.18);
    this.leftArmGroup.add(leftThumb);

    this.armsGroup.add(this.leftArmGroup);
  }

  updateMaterials() {
    for (const grp of Object.values(this.weapons)) {
      this.root.remove(grp);
    }
    this.weapons = {};
    this.buildWeapons();
    this.buildOperatorArms();
    this.switchWeapon(this.activeWeaponId);
  }

  createAssaultRifle() {
    const grp = new THREE.Group();
    const mats = this.getMaterial();

    // 1. Upper & Lower Receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.095, 0.34), mats.bodyMat);
    receiver.position.set(0, 0, 0.02);
    grp.add(receiver);

    // Top Picatinny Rail
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, 0.46), mats.darkMat);
    topRail.position.set(0, 0.056, -0.04);
    grp.add(topRail);

    // 2. Quad-Rail Handguard
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.068, 0.24), mats.bodyMat);
    handguard.position.set(0, 0.01, -0.21);
    grp.add(handguard);

    // Fluted Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 8), mats.steelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.38);
    grp.add(barrel);

    // Tactical Flash Hider / Compensator
    const flashHider = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.017, 0.06, 8), mats.accentMat);
    flashHider.rotation.x = Math.PI / 2;
    flashHider.position.set(0, 0.02, -0.52);
    grp.add(flashHider);

    // 3. Curved 30-round STANAG Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.17, 0.085), mats.darkMat);
    mag.position.set(0, -0.11, -0.04);
    mag.rotation.x = 0.18;
    grp.add(mag);

    // Magazine Base Plate Accent
    const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.02, 0.09), mats.accentMat);
    magBase.position.set(0, -0.20, -0.06);
    magBase.rotation.x = 0.18;
    grp.add(magBase);

    // 4. Tactical Pistol Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.13, 0.055), mats.darkMat);
    grip.position.set(0, -0.095, 0.10);
    grip.rotation.x = -0.32;
    grp.add(grip);

    // 5. Tactical Collapsible Stock
    const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8), mats.steelMat);
    bufferTube.rotation.x = Math.PI / 2;
    bufferTube.position.set(0, 0.015, 0.24);
    grp.add(bufferTube);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.11, 0.14), mats.bodyMat);
    stock.position.set(0, -0.01, 0.32);
    grp.add(stock);

    // 6. Holographic Optic Sight with Illuminated Center Reticle
    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.11), mats.darkMat);
    sightBase.position.set(0, 0.072, -0.03);
    grp.add(sightBase);

    const sightHood = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.048, 0.09), mats.accentMat);
    sightHood.position.set(0, 0.098, -0.03);
    grp.add(sightHood);

    const reticle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.01), mats.glowMat);
    reticle.position.set(0, 0.098, -0.03);
    grp.add(reticle);

    return grp;
  }

  createSniperRifle() {
    const grp = new THREE.Group();
    const mats = this.getMaterial();

    // 1. Heavy Precision Chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.095, 0.48), mats.bodyMat);
    chassis.position.set(0, 0, 0.02);
    grp.add(chassis);

    // Long Free-Floating Fluted Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.58, 8), mats.steelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.48);
    grp.add(barrel);

    // Ported Heavy Muzzle Brake
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.044, 0.10), mats.accentMat);
    muzzle.position.set(0, 0.02, -0.80);
    grp.add(muzzle);

    // 2. High-Magnification Sniper Scope
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.28, 12), mats.darkMat);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.095, -0.04);
    grp.add(scopeTube);

    // Front Objective Lens Sunshade
    const lensFront = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.026, 0.07, 12), mats.accentMat);
    lensFront.rotation.x = Math.PI / 2;
    lensFront.position.set(0, 0.095, -0.19);
    grp.add(lensFront);

    // Ocular Eye Piece Lens
    const lensRear = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.05, 12), mats.accentMat);
    lensRear.rotation.x = Math.PI / 2;
    lensRear.position.set(0, 0.095, 0.11);
    grp.add(lensRear);

    // Glowing scope crosshair dot
    const scopeReticle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.01), mats.glowMat);
    scopeReticle.position.set(0, 0.095, -0.04);
    grp.add(scopeReticle);

    // Dual Scope Ring Mounts
    const mountFront = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.04, 0.025), mats.darkMat);
    mountFront.position.set(0, 0.065, -0.10);
    grp.add(mountFront);

    const mountRear = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.04, 0.025), mats.darkMat);
    mountRear.position.set(0, 0.065, 0.04);
    grp.add(mountRear);

    // 3. Ergonomic Target Pistol Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.13, 0.055), mats.darkMat);
    grip.position.set(0, -0.095, 0.10);
    grip.rotation.x = -0.32;
    grp.add(grip);

    // 4. Detachable Box Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.14, 0.07), mats.darkMat);
    mag.position.set(0, -0.095, -0.04);
    grp.add(mag);

    // 5. Precision Buttstock with Cheek Rest
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.22), mats.bodyMat);
    stock.position.set(0, -0.01, 0.35);
    grp.add(stock);

    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.03, 0.12), mats.darkMat);
    cheekRest.position.set(0, 0.065, 0.32);
    grp.add(cheekRest);

    return grp;
  }

  createShotgun() {
    const grp = new THREE.Group();
    const mats = this.getMaterial();

    // 1. Heavy Combat Receiver
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.10, 0.36), mats.bodyMat);
    body.position.set(0, 0, 0.02);
    grp.add(body);

    // 2. Heavy 12-Gauge Main Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.44, 8), mats.steelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.34);
    grp.add(barrel);

    // Perforated Steel Heat Shield on top of barrel
    const heatShield = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.022, 0.32), mats.darkMat);
    heatShield.position.set(0, 0.052, -0.30);
    grp.add(heatShield);

    // High-Capacity Tubular Under-Barrel Magazine
    const tubeMag = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.40, 8), mats.darkMat);
    tubeMag.rotation.x = Math.PI / 2;
    tubeMag.position.set(0, -0.015, -0.32);
    grp.add(tubeMag);

    // Ribbed Polymer Pump Slide Forend
    const pumpSlide = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.064, 0.16), mats.accentMat);
    pumpSlide.position.set(0, -0.015, -0.28);
    grp.add(pumpSlide);

    // 3. Ergonomic Pistol Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.13, 0.055), mats.darkMat);
    grip.position.set(0, -0.095, 0.08);
    grip.rotation.x = -0.32;
    grp.add(grip);

    // 4. Ghost-Ring Tactical Iron Sights
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.02), mats.darkMat);
    rearSight.position.set(0, 0.062, 0.08);
    grp.add(rearSight);

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.025, 0.015), mats.glowMat);
    frontSight.position.set(0, 0.058, -0.48);
    grp.add(frontSight);

    return grp;
  }

  createPistol() {
    const grp = new THREE.Group();
    const mats = this.getMaterial();

    // 1. Serrated Steel Slide
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.052, 0.22), mats.bodyMat);
    slide.position.set(0, 0.04, -0.06);
    grp.add(slide);

    // Slide Top Serrations & Ejection Port
    const ejectPort = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.022, 0.06), mats.darkMat);
    ejectPort.position.set(0.014, 0.052, -0.06);
    grp.add(ejectPort);

    // Barrel tip
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), mats.steelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.038, -0.18);
    grp.add(barrel);

    // 2. Polymer Grip Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.12, 0.065), mats.darkMat);
    frame.position.set(0, -0.035, 0.01);
    frame.rotation.x = -0.28;
    grp.add(frame);

    // Trigger Guard & Trigger
    const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 0.05), mats.darkMat);
    triggerGuard.position.set(0, -0.01, -0.04);
    grp.add(triggerGuard);

    // 3. Under-barrel tactical accessory rail & laser unit
    const laserUnit = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.026, 0.075), mats.accentMat);
    laserUnit.position.set(0, 0.005, -0.12);
    grp.add(laserUnit);

    const laserLens = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.01), mats.glowMat);
    laserLens.position.set(0, 0.005, -0.16);
    grp.add(laserLens);

    // 4. Three-Dot Combat Night Sights
    const rearNightSight = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.018, 0.015), mats.darkMat);
    rearNightSight.position.set(0, 0.074, 0.04);
    grp.add(rearNightSight);

    const frontNightSight = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.018, 0.015), mats.glowMat);
    frontNightSight.position.set(0, 0.074, -0.155);
    grp.add(frontNightSight);

    return grp;
  }

  switchWeapon(weaponId) {
    if (!this.weapons[weaponId]) return;
    this.activeWeaponId = weaponId;

    for (const [id, grp] of Object.entries(this.weapons)) {
      grp.visible = (id === weaponId);
    }

    // Adapt operator hands to match specific weapon ergonomics
    if (this.leftArmGroup && this.rightArmGroup) {
      if (weaponId === 'pistol') {
        // Two-handed tactical pistol grip (thumbs forward stance)
        this.leftArmTargetPos.set(0.02, 0.05, 0.17);
        this.rightArmTargetPos.set(0, 0.05, -0.08);
      } else if (weaponId === 'shotgun') {
        // Holding pump-action slide
        this.leftArmTargetPos.set(0, 0, -0.08);
        this.rightArmTargetPos.set(0, 0, 0);
      } else if (weaponId === 'sniper_rifle') {
        // Supporting long chassis
        this.leftArmTargetPos.set(0, 0, -0.06);
        this.rightArmTargetPos.set(0, 0, 0);
      } else {
        // Standard assault rifle forend grip
        this.leftArmTargetPos.set(0, 0, 0);
        this.rightArmTargetPos.set(0, 0, 0);
      }

      this.leftArmGroup.position.copy(this.leftArmTargetPos);
      this.rightArmGroup.position.copy(this.rightArmTargetPos);
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

    // 4. Reload animation (smooth weapon dip & left hand magazine swap cycle)
    let reloadDip = 0;
    if (this.isReloading) {
      this.reloadProgress += delta / this.reloadDuration;
      if (this.reloadProgress >= 1.0) {
        this.isReloading = false;
        this.reloadProgress = 0;
        if (this.leftArmGroup) {
          this.leftArmGroup.position.copy(this.leftArmTargetPos);
          this.leftArmGroup.rotation.x = 0;
        }
      } else {
        // Smooth sine dip curve for the weapon
        reloadDip = Math.sin(this.reloadProgress * Math.PI) * 0.22;

        // Left arm dips down to grab a fresh magazine and insert it
        if (this.leftArmGroup) {
          const magCycle = Math.sin(this.reloadProgress * Math.PI);
          this.leftArmGroup.position.y = this.leftArmTargetPos.y - magCycle * 0.16;
          this.leftArmGroup.position.z = this.leftArmTargetPos.z + magCycle * 0.08;
          this.leftArmGroup.rotation.x = -magCycle * 0.45;
        }
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
