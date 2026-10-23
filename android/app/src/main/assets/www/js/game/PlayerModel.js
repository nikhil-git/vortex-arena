import * as THREE from '/vendor/three/three.module.js';

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
    const primaryColor = this.skinData.color_primary || '#2b303c';
    const secondaryColor = this.skinData.color_secondary || '#1a1d24';
    const accentColor = this.team === 'red' ? '#ff3366' : (this.team === 'blue' ? '#00a8ff' : (this.skinData.color_accent || '#00e5ff'));
    const metallic = this.skinData.metallic !== undefined ? this.skinData.metallic : 0.5;
    const roughness = this.skinData.roughness !== undefined ? this.skinData.roughness : 0.5;
    const emissive = this.skinData.emissive || '#000000';

    const armorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(primaryColor),
      metalness: metallic,
      roughness: roughness,
      emissive: new THREE.Color(emissive),
      emissiveIntensity: 0.3
    });

    const undersuitMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(secondaryColor),
      metalness: 0.2,
      roughness: 0.8
    });

    const visorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(accentColor),
      metalness: 0.9,
      roughness: 0.1,
      emissive: new THREE.Color(accentColor),
      emissiveIntensity: 0.8
    });

    // 1. Torso & Chestplate
    this.torso = new THREE.Group();
    this.torso.position.y = 1.0;

    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), armorMat);
    chestMesh.castShadow = true;
    this.torso.add(chestMesh);

    // Accent armor core on chest
    const coreMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.25, 0.05), visorMat);
    coreMesh.position.set(0, 0.05, 0.16);
    this.torso.add(coreMesh);

    // 2. Head & Helmet
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.55, 0);

    const helmetMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.35, 0.35), armorMat);
    helmetMesh.castShadow = true;
    this.headGroup.add(helmetMesh);

    // Visor
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.08), visorMat);
    visorMesh.position.set(0, 0.04, 0.16);
    this.headGroup.add(visorMesh);

    this.torso.add(this.headGroup);

    // 3. Arms & Pauldrons
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.35, 0.2, 0);
    const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.16), undersuitMat);
    leftArmMesh.position.y = -0.2;
    leftArmMesh.castShadow = true;
    this.leftArm.add(leftArmMesh);
    const leftPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.2), armorMat);
    leftPauldron.position.y = 0.05;
    this.leftArm.add(leftPauldron);
    this.torso.add(this.leftArm);

    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.35, 0.2, 0);
    const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.16), undersuitMat);
    rightArmMesh.position.y = -0.2;
    rightArmMesh.castShadow = true;
    this.rightArm.add(rightArmMesh);
    const rightPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.2), armorMat);
    rightPauldron.position.y = 0.05;
    this.rightArm.add(rightPauldron);
    this.torso.add(this.rightArm);

    // 4. Weapon held in hands
    const gunMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.weaponSkinData.color_primary || '#22252a'),
      metalness: this.weaponSkinData.metallic !== undefined ? this.weaponSkinData.metallic : 0.6,
      roughness: 0.3
    });
    this.heldGun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.7), gunMat);
    this.heldGun.position.set(0.2, -0.2, 0.35);
    this.torso.add(this.heldGun);

    this.group.add(this.torso);

    // 5. Legs & Combat Boots
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.16, 0.7, 0);
    const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.18), undersuitMat);
    leftLegMesh.position.y = -0.35;
    leftLegMesh.castShadow = true;
    this.leftLeg.add(leftLegMesh);
    this.group.add(this.leftLeg);

    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.16, 0.7, 0);
    const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.18), undersuitMat);
    rightLegMesh.position.y = -0.35;
    rightLegMesh.castShadow = true;
    this.rightLeg.add(rightLegMesh);
    this.group.add(this.rightLeg);

    // 6. Respawn Protection Forcefield Bubble (Shimmering energy shield)
    const shieldGeo = new THREE.SphereGeometry(1.25, 16, 16);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35,
      wireframe: true
    });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.position.set(0, 0.9, 0); // Enclose torso and head
    this.shieldMesh.visible = false;
    this.group.add(this.shieldMesh);
    this.isInvulnerable = false;
  }

  buildNameplate() {
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
        this.group.position.y = Math.max(0.15, 1.0 - this.deathProgress * 0.85);
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
      this.shieldMesh.visible = this.isInvulnerable;
    }
  }

  setDead() {
    this.isAlive = false;
    this.deathProgress = 0;
  }

  setAlive() {
    this.isAlive = true;
    this.deathProgress = 0;
    this.group.rotation.x = 0;
    this.group.position.y = 0;
  }
}
