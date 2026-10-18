import * as THREE from '/vendor/three/three.module.js';

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.buildMap();
  }

  buildMap() {
    // 1. Floor - 80m x 80m (Bright tactical concrete)
    const floorGeo = new THREE.PlaneGeometry(80, 80, 40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x5c6d80, // Bright clean tactical concrete
      roughness: 0.5,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Floor Grid Overlay for tactical sci-fi aesthetic
    const grid = new THREE.GridHelper(80, 40, 0x00ffff, 0x8298b3);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // 2. Perimeter Walls (North, South, East, West - Bright composite panels)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x7c8da0,
      roughness: 0.45,
      metalness: 0.2
    });

    const createWall = (w, h, d, x, y, z) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };

    // Outer Boundary Walls (8m tall)
    createWall(80, 8, 1, 0, 4, -40.5); // North
    createWall(80, 8, 1, 0, 4, 40.5);  // South
    createWall(1, 8, 80, -40.5, 4, 0); // West
    createWall(1, 8, 80, 40.5, 4, 0);  // East

    // Neon accent stripes along perimeter walls
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const createStripe = (w, h, d, x, y, z) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, stripeMat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
    };
    createStripe(80, 0.15, 0.1, 0, 7.5, -40);
    createStripe(80, 0.15, 0.1, 0, 7.5, 40);
    createStripe(0.1, 0.15, 80, -40, 7.5, 0);
    createStripe(0.1, 0.15, 80, 40, 7.5, 0);

    // 3. Central Compound (4 Pillars + Archways + Tactical Central Cover)
    const bunkerMat = new THREE.MeshStandardMaterial({
      color: 0x8a9baa,
      roughness: 0.45,
      metalness: 0.25
    });

    // NW, NE, SW, SE Pillars
    createWall(4, 3.5, 1, -4, 1.75, -5.5);
    createWall(4, 3.5, 1, 4, 1.75, -5.5);
    createWall(4, 3.5, 1, -4, 1.75, 5.5);
    createWall(4, 3.5, 1, 4, 1.75, 5.5);
    createWall(1, 3.5, 4, -5.5, 1.75, 0);
    createWall(1, 3.5, 4, 5.5, 1.75, 0);

    // Central Monument / Energy Beacon
    const beaconGeo = new THREE.CylinderGeometry(0.8, 1.2, 5, 8);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0x223348,
      roughness: 0.2,
      metalness: 0.9,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.8
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 2.5, 0);
    beacon.castShadow = true;
    this.scene.add(beacon);

    // 4. Tactical Military Crates (NW, NE, SW, SE)
    const crateMat = new THREE.MeshStandardMaterial({
      color: 0x71875c, // Vibrant Military Olive
      roughness: 0.5,
      metalness: 0.2
    });

    const createCrateCluster = (cx, cz) => {
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(2, 2.2, 2), crateMat);
      c1.position.set(cx, 1.1, cz);
      c1.castShadow = true;
      c1.receiveShadow = true;
      this.scene.add(c1);

      const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 1.8), crateMat);
      c2.position.set(cx + 1.8, 1.1, cz + 0.5);
      c2.castShadow = true;
      c2.receiveShadow = true;
      this.scene.add(c2);
    };

    createCrateCluster(-16, -16);
    createCrateCluster(16, -16);
    createCrateCluster(-16, 16);
    createCrateCluster(16, 16);

    // 5. Waist-high Cover Barricades
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0x8294a6,
      roughness: 0.45,
      metalness: 0.3
    });

    const createBarrier = (w, h, d, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), barrierMat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };

    createBarrier(4, 1.2, 1, -6, 0.6, -14.5);
    createBarrier(4, 1.2, 1, 6, 0.6, -14.5);
    createBarrier(4, 1.2, 1, -6, 0.6, 14.5);
    createBarrier(4, 1.2, 1, 6, 0.6, 14.5);
    createBarrier(2, 1.2, 4, -24, 0.6, 0);
    createBarrier(2, 1.2, 4, 24, 0.6, 0);

    // 6. Elevated Sniper Catwalks (NW, NE, SW, SE)
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x7c8da0,
      roughness: 0.4,
      metalness: 0.4
    });

    const createPlatform = (px, pz) => {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 8), platformMat);
      plat.position.set(px, 3.25, pz);
      plat.castShadow = true;
      plat.receiveShadow = true;
      this.scene.add(plat);

      // Support legs
      for (const [lx, lz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.25, 0.5), platformMat);
        leg.position.set(px + lx, 1.625, pz + lz);
        leg.castShadow = true;
        this.scene.add(leg);
      }

      // Ramp leading up
      const rampGeo = new THREE.BoxGeometry(3, 0.4, 8);
      const ramp = new THREE.Mesh(rampGeo, platformMat);
      ramp.position.set(px + (px > 0 ? -5.5 : 5.5), 1.6, pz);
      ramp.rotation.z = px > 0 ? 0.4 : -0.4;
      ramp.receiveShadow = true;
      this.scene.add(ramp);
    };

    createPlatform(-28, -24);
    createPlatform(28, 24);
    createPlatform(-26, 24);
    createPlatform(26, -24);
  }
}
