import * as THREE from '../../vendor/three/three.module.js';

/**
 * Procedural military tactical camouflage texture generator.
 * Produces seamless digital camo pattern with ripstop crosshatch fabric weave.
 * Zero external asset dependencies, zero network requests, zero copyright issues.
 */
export function generateCamoTexture(primaryHex = '#384635', secondaryHex = '#1e241c', accentHex = '#4a5b44') {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base uniform color
  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, 128, 128);

  // Digital disruptive camo patches
  const swatch = [secondaryHex, accentHex, '#141813', '#4e5d48', '#2a3328'];
  for (let y = 0; y < 128; y += 8) {
    for (let x = 0; x < 128; x += 8) {
      const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const rand = hash - Math.floor(hash);
      if (rand > 0.40) {
        ctx.fillStyle = swatch[Math.floor(rand * swatch.length) % swatch.length];
        ctx.fillRect(x, y, 8, 8);
      }
    }
  }

  // Tactical ripstop crosshatch weave overlay for realistic military cloth appearance
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let i = 0; i < 128; i += 4) {
    ctx.fillRect(i, 0, 1, 128);
    ctx.fillRect(0, i, 128, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

export class PlayerModel {
  constructor(playerData, isLocal = false) {
    this.id = playerData.id;
    this.username = playerData.username || 'Player';
    this.team = playerData.team || 'solo';
    this.isLocal = isLocal;
    this.isAlive = true;

    this.group = new THREE.Group();
    this.skinData = playerData.characterSkin || {};
    this.weaponSkinData = playerData.weaponSkin || {};

    // Animation state
    this.animTime = 0;
    this.isMoving = false;
    this.deathProgress = 0;

    this.buildCharacterMesh();
    if (!this.isLocal) {
      this.buildNameplate();
    }
  }

  buildCharacterMesh() {
    const primaryColor = this.skinData.color_primary || '#384635';
    const secondaryColor = this.skinData.color_secondary || '#1c221a';
    const accentColor = this.team === 'red' ? '#ff3366' : (this.team === 'blue' ? '#00a8ff' : (this.skinData.color_accent || '#00e5ff'));
    const metallic = this.skinData.metallic !== undefined ? this.skinData.metallic : 0.25;
    const roughness = this.skinData.roughness !== undefined ? this.skinData.roughness : 0.65;
    const emissive = this.skinData.emissive || '#000000';

    // 1. Procedural PBR materials for realistic military operator
    const camoTexture = generateCamoTexture(primaryColor, secondaryColor, accentColor);

    const uniformMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(primaryColor),
      map: camoTexture || null,
      metalness: 0.08,
      roughness: 0.82
    });

    const vestMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(secondaryColor),
      metalness: 0.18,
      roughness: 0.70
    });

    const pouchMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#161a14'),
      metalness: 0.15,
      roughness: 0.75
    });

    const helmetMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(primaryColor),
      metalness: metallic,
      roughness: roughness
    });

    const balaclavaMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1a1d18'),
      metalness: 0.05,
      roughness: 0.90
    });

    const goggleMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0a1520'),
      metalness: 0.95,
      roughness: 0.06,
      emissive: new THREE.Color(accentColor),
      emissiveIntensity: 0.25
    });

    const headsetMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#121411'),
      metalness: 0.35,
      roughness: 0.45
    });

    const padMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#151813'),
      metalness: 0.30,
      roughness: 0.40
    });

    const bootMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#10120f'),
      metalness: 0.20,
      roughness: 0.60
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(accentColor),
      metalness: 0.8,
      roughness: 0.2,
      emissive: new THREE.Color(accentColor),
      emissiveIntensity: 0.7
    });

    // 2. Torso, Tactical Plate Carrier Vest & Backpack
    this.torso = new THREE.Group();
    this.torso.position.y = 1.0;

    // Combat shirt base
    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.64, 0.28), uniformMat);
    chestMesh.castShadow = true;
    this.torso.add(chestMesh);

    // Modular Plate Carrier Vest
    const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.48, 0.32), vestMat);
    vestMesh.position.set(0, 0.04, 0);
    vestMesh.castShadow = true;
    this.torso.add(vestMesh);

    // Triple AR/Rifle Magazine Pouches on lower abdomen
    const pouchOffsets = [-0.12, 0, 0.12];
    pouchOffsets.forEach((px) => {
      const magPouch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.05), pouchMat);
      magPouch.position.set(px, -0.10, 0.175);
      this.torso.add(magPouch);
    });

    // Tactical Radio Unit with antenna on left chest
    const radioMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.05), pouchMat);
    radioMesh.position.set(-0.16, 0.14, 0.175);
    this.torso.add(radioMesh);

    const antennaMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), headsetMat);
    antennaMesh.position.set(-0.16, 0.26, 0.175);
    this.torso.add(antennaMesh);

    // Center Team / Unit ID Velcro patch
    const idPatch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.02), accentMat);
    idPatch.position.set(0.06, 0.15, 0.17);
    this.torso.add(idPatch);

    // Tactical Assault Backpack on back
    const backpackMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.16), vestMat);
    backpackMesh.position.set(0, 0.04, -0.23);
    backpackMesh.castShadow = true;
    this.torso.add(backpackMesh);

    // 3. Head: Ballistic Helmet, Balaclava Mask, Goggles & Comms Headset
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.55, 0);

    // Balaclava-covered head & neck
    const balaclavaHead = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.28, 0.26), balaclavaMat);
    balaclavaHead.position.set(0, 0.02, 0);
    balaclavaHead.castShadow = true;
    this.headGroup.add(balaclavaHead);

    // Tactical Ballistic Helmet shell
    const helmetShell = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.34), helmetMat);
    helmetShell.position.set(0, 0.12, -0.01);
    helmetShell.castShadow = true;
    this.headGroup.add(helmetShell);

    // Helmet front brow / brim
    const helmetBrim = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.04, 0.07), helmetMat);
    helmetBrim.position.set(0, 0.06, 0.165);
    this.headGroup.add(helmetBrim);

    // Night Vision Shroud mount on forehead
    const nvgMount = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), padMat);
    nvgMount.position.set(0, 0.11, 0.17);
    this.headGroup.add(nvgMount);

    // Polarized Ballistic Combat Goggles
    const goggleFrame = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.04), padMat);
    goggleFrame.position.set(0, 0.03, 0.145);
    this.headGroup.add(goggleFrame);

    const goggleLens = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.06, 0.02), goggleMat);
    goggleLens.position.set(0, 0.03, 0.165);
    this.headGroup.add(goggleLens);

    // Tactical Comms Headset
    const earCupL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.07), headsetMat);
    earCupL.position.set(-0.16, 0.03, 0);
    this.headGroup.add(earCupL);

    const earCupR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.07), headsetMat);
    earCupR.position.set(0.16, 0.03, 0);
    this.headGroup.add(earCupR);

    // Headset boom microphone
    const boomMic = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.12, 6), headsetMat);
    boomMic.rotation.x = Math.PI / 3;
    boomMic.position.set(-0.13, -0.03, 0.09);
    this.headGroup.add(boomMic);

    this.torso.add(this.headGroup);

    // 4. Arms, Tactical Uniform Sleeves, Elbow Pads & Combat Gloves
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.34, 0.2, 0);

    const leftBicep = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.30, 0.15), uniformMat);
    leftBicep.position.y = -0.12;
    leftBicep.castShadow = true;
    this.leftArm.add(leftBicep);

    const leftElbowPad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.17), padMat);
    leftElbowPad.position.set(0, -0.24, -0.01);
    this.leftArm.add(leftElbowPad);

    const leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.22, 0.14), uniformMat);
    leftForearm.position.y = -0.36;
    leftForearm.castShadow = true;
    this.leftArm.add(leftForearm);

    // Tactical Glove
    const leftGlove = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), padMat);
    leftGlove.position.y = -0.49;
    this.leftArm.add(leftGlove);

    this.torso.add(this.leftArm);

    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.34, 0.2, 0);

    const rightBicep = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.30, 0.15), uniformMat);
    rightBicep.position.y = -0.12;
    rightBicep.castShadow = true;
    this.rightArm.add(rightBicep);

    const rightElbowPad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.17), padMat);
    rightElbowPad.position.set(0, -0.24, -0.01);
    this.rightArm.add(rightElbowPad);

    const rightForearm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.22, 0.14), uniformMat);
    rightForearm.position.y = -0.36;
    rightForearm.castShadow = true;
    this.rightArm.add(rightForearm);

    // Tactical Glove
    const rightGlove = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), padMat);
    rightGlove.position.y = -0.49;
    this.rightArm.add(rightGlove);

    this.torso.add(this.rightArm);

    // 5. Weapon held in hands (Assault Rifle with receiver, barrel, magazine & optic)
    const gunMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.weaponSkinData.color_primary || '#1c1e22'),
      metalness: this.weaponSkinData.metallic !== undefined ? this.weaponSkinData.metallic : 0.70,
      roughness: 0.28
    });

    this.heldGun = new THREE.Group();
    this.heldGun.position.set(0.2, -0.2, 0.35);

    const gunReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.10, 0.34), gunMat);
    this.heldGun.add(gunReceiver);

    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.32, 8), padMat);
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position.set(0, 0.02, -0.26);
    this.heldGun.add(gunBarrel);

    const gunHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.22), gunMat);
    gunHandguard.position.set(0, 0.01, -0.18);
    this.heldGun.add(gunHandguard);

    const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.08), padMat);
    gunMag.position.set(0, -0.10, -0.04);
    gunMag.rotation.x = 0.20;
    this.heldGun.add(gunMag);

    const gunOptic = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.08), accentMat);
    gunOptic.position.set(0, 0.075, 0.02);
    this.heldGun.add(gunOptic);

    this.torso.add(this.heldGun);

    this.group.add(this.torso);

    // 6. Legs, Cargo Pants, Knee Pads, Thigh Holster & Combat Boots
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.16, 0.7, 0);

    const leftThigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.34, 0.19), uniformMat);
    leftThigh.position.y = -0.17;
    leftThigh.castShadow = true;
    this.leftLeg.add(leftThigh);

    const leftKneePad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.21), padMat);
    leftKneePad.position.set(0, -0.34, 0.02);
    this.leftLeg.add(leftKneePad);

    const leftCalf = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.17), uniformMat);
    leftCalf.position.y = -0.48;
    leftCalf.castShadow = true;
    this.leftLeg.add(leftCalf);

    const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.26), bootMat);
    leftBoot.position.set(0, -0.63, 0.04);
    leftBoot.castShadow = true;
    this.leftLeg.add(leftBoot);

    this.group.add(this.leftLeg);

    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.16, 0.7, 0);

    const rightThigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.34, 0.19), uniformMat);
    rightThigh.position.y = -0.17;
    rightThigh.castShadow = true;
    this.rightLeg.add(rightThigh);

    // Drop-leg sidearm holster on right thigh
    const rightHolster = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.10), padMat);
    rightHolster.position.set(0.11, -0.16, 0.02);
    this.rightLeg.add(rightHolster);

    const rightKneePad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.21), padMat);
    rightKneePad.position.set(0, -0.34, 0.02);
    this.rightLeg.add(rightKneePad);

    const rightCalf = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.17), uniformMat);
    rightCalf.position.y = -0.48;
    rightCalf.castShadow = true;
    this.rightLeg.add(rightCalf);

    const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.26), bootMat);
    rightBoot.position.set(0, -0.63, 0.04);
    rightBoot.castShadow = true;
    this.rightLeg.add(rightBoot);

    this.group.add(this.rightLeg);

    // 7. Respawn Protection Forcefield Bubble (Shimmering energy shield)
    const shieldGeo = new THREE.SphereGeometry(1.25, 16, 16);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
      depthWrite: false
    });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.position.set(0, 0.9, 0);
    this.shieldMesh.visible = false;
    this.group.add(this.shieldMesh);
    this.isInvulnerable = false;
  }

  buildNameplate() {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    this.nameplateCtx = canvas.getContext('2d');
    this.nameplateTexture = new THREE.CanvasTexture(canvas);

    const spriteMat = new THREE.SpriteMaterial({
      map: this.nameplateTexture,
      transparent: true,
      depthTest: false
    });
    this.nameplateSprite = new THREE.Sprite(spriteMat);
    this.nameplateSprite.scale.set(2.2, 0.55, 1);
    this.nameplateSprite.position.set(0, 2.1, 0);
    this.group.add(this.nameplateSprite);

    this.updateNameplate(100, 50);
  }

  updateNameplate(health = 100, shield = 50) {
    if (!this.nameplateCtx) return;
    if (this.lastHp === health && this.lastShield === shield) return;
    this.lastHp = health;
    this.lastShield = shield;

    const ctx = this.nameplateCtx;
    ctx.clearRect(0, 0, 256, 64);

    // Background pill
    ctx.fillStyle = 'rgba(10, 15, 24, 0.75)';
    ctx.roundRect(10, 8, 236, 48, 8);
    ctx.fill();

    // Username
    ctx.fillStyle = this.team === 'red' ? '#ff4d6d' : (this.team === 'blue' ? '#38bdf8' : '#ffffff');
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.username, 128, 28);

    // Health Bar Outline
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(28, 38, 200, 10);

    // Health fill
    const hpFrac = Math.max(0, Math.min(1, health / 100));
    ctx.fillStyle = hpFrac > 0.3 ? '#00e5ff' : '#ff3366';
    ctx.fillRect(28, 38, 200 * hpFrac, 10);

    this.nameplateTexture.needsUpdate = true;
  }

  update(delta, isMoving = false, speed = 1.0) {
    if (!this.isAlive) {
      if (this.deathProgress < 1.0) {
        this.deathProgress += delta * 2.5;
        this.group.rotation.x = Math.min(Math.PI / 2, this.deathProgress * (Math.PI / 2));
        this.group.position.y = Math.max(0.18, 1.0 - this.deathProgress * 0.82);
      } else {
        this.group.position.y = 0.18;
      }
      return;
    }

    if (isMoving) {
      this.animTime += delta * 10 * speed;
      const legSwing = Math.sin(this.animTime) * 0.6;
      this.leftLeg.rotation.x = legSwing;
      this.rightLeg.rotation.x = -legSwing;
      this.leftArm.rotation.x = -legSwing * 0.7;
      this.rightArm.rotation.x = legSwing * 0.7;
    } else {
      // Idle breathing / return to neutral
      this.leftLeg.rotation.x *= 0.8;
      this.rightLeg.rotation.x *= 0.8;
      this.leftArm.rotation.x *= 0.8;
      this.rightArm.rotation.x *= 0.8;
    }

    // Animate active respawn energy shield
    if (this.isInvulnerable && this.shieldMesh) {
      this.shieldMesh.rotation.y += delta * 2.5;
      this.shieldMesh.rotation.x += delta * 1.5;
    }
  }

  setInvulnerable(isInv) {
    this.isInvulnerable = Boolean(isInv);
    if (this.shieldMesh) {
      this.shieldMesh.visible = this.isInvulnerable && this.isAlive;
    }
  }

  setDead() {
    this.isAlive = false;
    this.deathProgress = 0;
    if (this.nameplateSprite) {
      this.nameplateSprite.visible = false;
    }
    if (this.shieldMesh) {
      this.shieldMesh.visible = false;
    }
  }

  setAlive() {
    this.isAlive = true;
    this.deathProgress = 0;
    this.group.rotation.x = 0;
    this.group.position.y = 0;
    if (this.nameplateSprite) {
      this.nameplateSprite.visible = true;
    }
  }
}
