import * as THREE from '/vendor/three/three.module.js';

/**
 * MapBuilder.js - Procedural 3D Map Environments for Vortex Arena
 * 
 * Generates rich, highly detailed, optimized 3D geometry for all 6 playable maps:
 * 1. Suburban Estate (Normal House)
 * 2. Golden Valley Farm (Farm)
 * 3. Whispering Pines (Forest)
 * 4. BlockCraft Voxel Realm (Minecraft-inspired)
 * 5. S.S. Oceanic (Cruise Ship)
 * 6. Sector-7 Compound (Classic Sci-Fi Tactical Compound)
 */

export class MapBuilder {
  /**
   * Builds and attaches the selected 3D map environment to the scene.
   * Returns the root THREE.Group for the map.
   */
  static buildMap(scene, mapId = 'house') {
    const root = new THREE.Group();
    root.name = `map_${mapId}`;

    switch (mapId) {
      case 'house':
        this.buildHouseMap(root);
        break;
      case 'farm':
        this.buildFarmMap(root);
        break;
      case 'forest':
        this.buildForestMap(root);
        break;
      case 'minecraft':
        this.buildMinecraftMap(root);
        break;
      case 'cruise':
        this.buildCruiseMap(root);
        break;
      case 'sector7':
      default:
        this.buildSector7Map(root);
        break;
    }

    scene.add(root);
    return root;
  }

  /**
   * Safely disposes all geometries and materials to guarantee zero memory leaks
   */
  static disposeMap(scene, mapGroup) {
    if (!mapGroup) return;

    mapGroup.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => {
              if (mat.map) mat.map.dispose();
              mat.dispose();
            });
          } else {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      }
    });

    scene.remove(mapGroup);
  }

  // =========================================================================
  // HELPER MESH FACTORIES
  // =========================================================================

  static createBox(group, w, h, d, x, y, z, mat, castShadow = true, receiveShadow = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
    return mesh;
  }

  static createCylinder(group, rTop, rBot, h, segs, x, y, z, mat, castShadow = true, receiveShadow = true) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, segs);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
    return mesh;
  }

  // =========================================================================
  // MAP 1: SUBURBAN ESTATE (NORMAL HOUSE)
  // =========================================================================
  static buildHouseMap(root) {
    // Shared Materials
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8 });
    const woodFloorMat = new THREE.MeshStandardMaterial({
      color: 0x8d6e63,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -2.0
    });
    const tileFloorMat = new THREE.MeshStandardMaterial({
      color: 0xb0bec5,
      roughness: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits: -4.0
    });
    const drivewayMat = new THREE.MeshStandardMaterial({
      color: 0x78909c,
      roughness: 0.7,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -2.0
    });
    const extWallMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.6 });
    const intWallMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 });
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.7 });
    const sofaMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.8 });
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.4 });
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.6 });
    const pillowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.8, roughness: 0.2 });
    const tvScreenMat = new THREE.MeshBasicMaterial({ color: 0x0a192f });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 });

    // 1. Terrain Base (60m x 60m lawn)
    const lawnGeo = new THREE.PlaneGeometry(60, 60);
    const lawn = new THREE.Mesh(lawnGeo, grassMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.receiveShadow = true;
    root.add(lawn);

    // Front Driveway & concrete walkway
    const driveway = new THREE.Mesh(new THREE.PlaneGeometry(12, 16), drivewayMat);
    driveway.rotation.x = -Math.PI / 2;
    driveway.position.set(-20, 0.03, 20);
    driveway.receiveShadow = true;
    root.add(driveway);

    const path = new THREE.Mesh(new THREE.PlaneGeometry(4, 14), drivewayMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.035, 21);
    path.receiveShadow = true;
    root.add(path);

    // Backyard stone patio
    const patio = new THREE.Mesh(new THREE.PlaneGeometry(28, 12), drivewayMat);
    patio.rotation.x = -Math.PI / 2;
    patio.position.set(0, 0.03, -19);
    patio.receiveShadow = true;
    root.add(patio);

    // Interior House Hardwood & Kitchen Floor (28m x 26m, z=[-13, 13], x=[-14, 14])
    const woodFloor = new THREE.Mesh(new THREE.PlaneGeometry(28, 26), woodFloorMat);
    woodFloor.rotation.x = -Math.PI / 2;
    woodFloor.position.set(0, 0.04, 0.5);
    woodFloor.receiveShadow = true;
    root.add(woodFloor);

    // Kitchen tile zone
    const kitchenTile = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 12), tileFloorMat);
    kitchenTile.rotation.x = -Math.PI / 2;
    kitchenTile.position.set(-6.75, 0.05, 6.5);
    kitchenTile.receiveShadow = true;
    root.add(kitchenTile);

    // 2. Perimeter Wooden Privacy Fence (1.6m tall)
    this.createBox(root, 56, 1.6, 0.3, 0, 0.8, -28.5, fenceMat); // North
    this.createBox(root, 56, 1.6, 0.3, 0, 0.8, 28.5, fenceMat);  // South
    this.createBox(root, 0.3, 1.6, 56, -28.5, 0.8, 0, fenceMat); // West
    this.createBox(root, 0.3, 1.6, 56, 28.5, 0.8, 0, fenceMat);  // East

    // 3. Exterior House Walls (4.2m tall)
    this.createBox(root, 28, 4.2, 0.5, 0, 2.1, -12.5, extWallMat); // Back Wall (North)
    this.createBox(root, 0.5, 4.2, 26, -13.5, 2.1, 0.5, extWallMat); // West Wall
    this.createBox(root, 0.5, 4.2, 26, 13.5, 2.1, 0.5, extWallMat);  // East Wall
    // Front Exterior Wall with front doorway gap at x=[-2, 2]
    this.createBox(root, 11.5, 4.2, 0.5, -7.75, 2.1, 13.5, extWallMat); // Front Left
    this.createBox(root, 11.5, 4.2, 0.5, 7.75, 2.1, 13.5, extWallMat);  // Front Right
    // Front Door Lintel above doorway
    this.createBox(root, 4.0, 1.4, 0.5, 0, 3.5, 13.5, extWallMat);

    // Pitched Roof Gables / Overhang framing
    const roofTrimMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.6 });
    this.createBox(root, 30, 0.4, 28, 0, 4.3, 0.5, roofTrimMat);

    // 4. Interior Dividing Walls (3.2m tall)
    // Central East-West Corridor Wall (door gaps at x=[-8, -6] and x=[6, 8])
    this.createBox(root, 5, 3.2, 0.4, -10.5, 1.6, 0, intWallMat);
    this.createBox(root, 12, 3.2, 0.4, 0, 1.6, 0, intWallMat);
    this.createBox(root, 5, 3.2, 0.4, 10.5, 1.6, 0, intWallMat);

    // Kitchen & Living Room Divider (door gap at z=[4, 8])
    this.createBox(root, 0.4, 3.2, 4, 0, 1.6, 2, intWallMat);
    this.createBox(root, 0.4, 3.2, 5, 0, 1.6, 10.5, intWallMat);

    // Bedrooms Dividing Wall (z < 0)
    this.createBox(root, 0.4, 3.2, 6, 0, 1.6, -9, intWallMat);
    this.createBox(root, 0.4, 3.2, 3, 0, 1.6, -1.5, intWallMat);

    // 5. Living Room Furniture
    // L-Sofa
    this.createBox(root, 6, 0.9, 1.8, 7, 0.45, 9, sofaMat);
    this.createBox(root, 1.5, 0.9, 3.5, 9.25, 0.45, 6.25, sofaMat);
    // Coffee Table
    this.createBox(root, 2.5, 0.5, 1.8, 6.25, 0.25, 6, tableMat);
    // TV Unit & Big Screen TV
    this.createBox(root, 4, 0.8, 0.8, 4, 0.4, 12.4, tableMat);
    this.createBox(root, 3.2, 1.6, 0.15, 4, 1.7, 12.5, tvScreenMat, false);

    // 6. Kitchen Furniture
    // Island Counter
    this.createBox(root, 2.5, 1.05, 8, -11.25, 0.525, 7, tableMat);
    // Refrigerator
    this.createBox(root, 2.2, 2.2, 1.6, -11.25, 1.1, 11.9, steelMat);
    // Dining Table & Chairs
    this.createBox(root, 3.0, 0.85, 2.8, -5, 0.425, 6, tableMat);

    // 7. Bedrooms Furniture
    // Master Bed (King)
    this.createBox(root, 4.5, 0.8, 3.8, 8.5, 0.4, -8, bedMat);
    this.createBox(root, 3.8, 0.25, 1.2, 8.5, 0.9, -9.2, pillowMat);
    this.createBox(root, 3.0, 2.2, 1.4, 3.5, 1.1, -10.8, tableMat); // Wardrobe
    // Guest Bed
    this.createBox(root, 3.8, 0.75, 3.6, -9, 0.375, -8, new THREE.MeshStandardMaterial({ color: 0x00796b }));
    this.createBox(root, 3.0, 1.1, 1.4, -3.5, 0.55, -10.8, tableMat); // Dresser

    // 8. Backyard Cover & Props
    // Patio Table with Parasol
    this.createBox(root, 4, 0.85, 3.5, 0, 0.425, -17, tableMat);
    this.createCylinder(root, 0.05, 0.05, 2.6, 8, 0, 1.3, -17, steelMat);
    this.createCylinder(root, 1.8, 0.1, 0.6, 12, 0, 2.6, -17, new THREE.MeshStandardMaterial({ color: 0xd32f2f })); // Umbrella

    // Barbecue Grill
    this.createBox(root, 3.5, 1.3, 2.5, 10, 0.65, -22.5, steelMat);

    // Garden Shed (West Backyard)
    const shedMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    this.createBox(root, 5, 2.4, 5, -21.5, 1.2, -16.5, shedMat);

    // Front Driveway Parked Tactical Van / SUV Cover
    const carMat = new THREE.MeshStandardMaterial({ color: 0x1e88e5, roughness: 0.3, metalness: 0.4 });
    this.createBox(root, 5.5, 1.7, 2.6, -21, 0.85, 19, carMat);
    // Wheels
    for (const [wx, wz] of [[-19, 17.8], [-23, 17.8], [-19, 20.2], [-23, 20.2]]) {
      this.createCylinder(root, 0.4, 0.4, 0.3, 12, wx, 0.4, wz, new THREE.MeshStandardMaterial({ color: 0x212121 }));
    }

    // Garden Planter boxes with colorful bushes
    this.createBox(root, 5.5, 0.9, 2.5, 19, 0.45, -15.5, tableMat);
    this.createCylinder(root, 1.2, 0.8, 1.0, 8, 19, 1.2, -15.5, foliageMat);
  }

  // =========================================================================
  // MAP 2: GOLDEN VALLEY FARM (FARM & BARN)
  // =========================================================================
  static buildFarmMap(root) {
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
    const barnRedMat = new THREE.MeshStandardMaterial({ color: 0xb71c1c, roughness: 0.65 });
    const barnTrimMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.7 });
    const wheatMat = new THREE.MeshStandardMaterial({
      color: 0xe0b94d,
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -2.0
    });
    const cropGreenMat = new THREE.MeshStandardMaterial({
      color: 0x558b2f,
      roughness: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -2.0
    });
    const dirtRoadMat = new THREE.MeshStandardMaterial({
      color: 0xa1887f,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -3.0
    });
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.8 });
    const hayMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.9 });
    const metalSiloMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.7, roughness: 0.3 });
    const tractorGreenMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.4 });
    const tractorYellowMat = new THREE.MeshStandardMaterial({ color: 0xfbc02d, roughness: 0.3 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    // 1. Terrain Ground (80m x 80m rural soil)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), soilMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);

    // Wheat Field & Green Crop Patches
    const wheatField = new THREE.Mesh(new THREE.PlaneGeometry(28, 26), wheatMat);
    wheatField.rotation.x = -Math.PI / 2;
    wheatField.position.set(22, 0.03, -22);
    wheatField.receiveShadow = true;
    root.add(wheatField);

    const cornField = new THREE.Mesh(new THREE.PlaneGeometry(28, 24), cropGreenMat);
    cornField.rotation.x = -Math.PI / 2;
    cornField.position.set(22, 0.03, 22);
    cornField.receiveShadow = true;
    root.add(cornField);

    // Dirt central tractor road
    const dirtRoad = new THREE.Mesh(new THREE.PlaneGeometry(10, 78), dirtRoadMat);
    dirtRoad.rotation.x = -Math.PI / 2;
    dirtRoad.position.set(0, 0.04, 0);
    dirtRoad.receiveShadow = true;
    root.add(dirtRoad);

    // 2. Perimeter Post-and-Rail Fence (1.4m tall)
    this.createBox(root, 76, 1.4, 0.3, 0, 0.7, -38.5, fenceMat);
    this.createBox(root, 76, 1.4, 0.3, 0, 0.7, 38.5, fenceMat);
    this.createBox(root, 0.3, 1.4, 76, -38.5, 0.7, 0, fenceMat);
    this.createBox(root, 0.3, 1.4, 76, 38.5, 0.7, 0, fenceMat);

    // 3. Big Red Barn (20m x 20m, 7.0m tall, z=[-30, -10], x=[-30, -10])
    this.createBox(root, 20, 7.0, 0.6, -20, 3.5, -29.7, barnRedMat); // North Wall
    this.createBox(root, 0.6, 7.0, 20, -29.7, 3.5, -20, barnRedMat); // West Wall
    this.createBox(root, 0.6, 7.0, 20, -10.3, 3.5, -20, barnRedMat); // East Wall
    // Front South Wall with doorway gap at x=[-23, -17]
    this.createBox(root, 7.0, 7.0, 0.6, -26.5, 3.5, -10.3, barnRedMat);
    this.createBox(root, 7.0, 7.0, 0.6, -13.5, 3.5, -10.3, barnRedMat);
    this.createBox(root, 6.0, 2.0, 0.6, -20, 6.0, -10.3, barnRedMat); // Door lintel
    // White X-braces on barn exterior
    this.createBox(root, 0.2, 5.0, 0.8, -26.5, 3.0, -10.2, barnTrimMat);
    this.createBox(root, 0.2, 5.0, 0.8, -13.5, 3.0, -10.2, barnTrimMat);

    // Barn Gambrel Roof
    this.createBox(root, 22, 0.6, 22, -20, 7.3, -20, roofMat);

    // Barn Interior Stalls (Cover)
    this.createBox(root, 7, 2.2, 1.5, -25.5, 1.1, -21, fenceMat);
    this.createBox(root, 7, 2.2, 1.5, -14.5, 1.1, -21, fenceMat);

    // 4. Two-Story Rural Farmhouse (18m x 16m, 5m tall, z=[6, 22], x=[12, 30])
    const houseWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 });
    this.createBox(root, 18, 5.0, 0.5, 21, 2.5, 21.7, houseWhiteMat); // Back Wall
    this.createBox(root, 18, 5.0, 0.5, 21, 2.5, 6.3, houseWhiteMat);  // Front Wall
    this.createBox(root, 0.5, 5.0, 16, 12.3, 2.5, 14, houseWhiteMat); // West Wall
    this.createBox(root, 0.5, 5.0, 16, 29.7, 2.5, 14, houseWhiteMat); // East Wall
    // Veranda Porch Roof
    this.createBox(root, 20, 0.4, 18, 21, 5.2, 14, roofMat);
    // Veranda Support Pillars
    this.createCylinder(root, 0.15, 0.15, 4.0, 8, 13, 2.0, 7, barnTrimMat);
    this.createCylinder(root, 0.15, 0.15, 4.0, 8, 17, 2.0, 7, barnTrimMat);

    // 5. Tall Grain Silos (North-East of Barn)
    this.createCylinder(root, 2.2, 2.2, 8.5, 16, -6, 4.25, -26, metalSiloMat);
    this.createCylinder(root, 0.1, 2.2, 1.5, 16, -6, 9.25, -26, metalSiloMat); // Dome roof
    this.createCylinder(root, 2.2, 2.2, 8.5, 16, -6, 4.25, -18, metalSiloMat);
    this.createCylinder(root, 0.1, 2.2, 1.5, 16, -6, 9.25, -18, metalSiloMat);

    // 6. John Deere-style Farm Tractor
    // Main Body & Engine Hood
    this.createBox(root, 3.5, 1.6, 2.0, 6, 1.3, -8, tractorGreenMat);
    // Cab Roof
    this.createBox(root, 2.0, 0.2, 1.8, 5.2, 2.6, -8, tractorGreenMat);
    // Cab Posts
    this.createCylinder(root, 0.05, 0.05, 1.0, 6, 4.3, 2.1, -7.2, tractorGreenMat);
    this.createCylinder(root, 0.05, 0.05, 1.0, 6, 6.1, 2.1, -7.2, tractorGreenMat);
    // Exhaust stack
    this.createCylinder(root, 0.06, 0.06, 1.5, 6, 7.2, 2.4, -7.3, tireMat);
    // Large Rear Wheels & Front Wheels
    this.createCylinder(root, 1.0, 1.0, 0.5, 14, 4.8, 1.0, -6.8, tireMat);
    this.createCylinder(root, 1.0, 1.0, 0.5, 14, 4.8, 1.0, -9.2, tireMat);
    this.createCylinder(root, 0.55, 0.55, 0.4, 14, 7.3, 0.55, -6.9, tireMat);
    this.createCylinder(root, 0.55, 0.55, 0.4, 14, 7.3, 0.55, -9.1, tireMat);
    // Yellow Rims
    this.createCylinder(root, 0.5, 0.5, 0.52, 12, 4.8, 1.0, -6.8, tractorYellowMat);
    this.createCylinder(root, 0.5, 0.5, 0.52, 12, 4.8, 1.0, -9.2, tractorYellowMat);

    // 7. Tactical Hay Bales (Round cylinders & square stacks)
    const createHayBale = (x, z, r = 1.2, h = 2.0) => {
      const mesh = this.createCylinder(root, r, r, h, 14, x, r, z, hayMat);
      mesh.rotation.z = Math.PI / 2;
    };
    createHayBale(-15, 6, 1.1, 2.2);
    createHayBale(-15, 9, 1.1, 2.2);
    createHayBale(-15, 7.5, 1.1, 2.2);
    this.createBox(root, 3.5, 1.8, 2.5, 2, 0.9, 14, hayMat); // South square hay stack
    this.createBox(root, 3.5, 1.8, 2.5, -2, 0.9, -15, hayMat); // Silo hay stack

    // 8. Elevated Water Storage Tank
    // Tank body
    this.createCylinder(root, 2.0, 2.0, 3.0, 14, -28, 5.5, 6, metalSiloMat);
    // 4 Wooden Stilt Legs
    for (const [lx, lz] of [[-29.5, 4.5], [-26.5, 4.5], [-29.5, 7.5], [-26.5, 7.5]]) {
      this.createBox(root, 0.35, 4.0, 0.35, lx, 2.0, lz, fenceMat);
    }
  }

  // =========================================================================
  // MAP 3: WHISPERING PINES (FOREST)
  // =========================================================================
  static buildForestMap(root) {
    const forestFloorMat = new THREE.MeshStandardMaterial({ color: 0x2e4726, roughness: 0.9 });
    const dirtTrailMat = new THREE.MeshStandardMaterial({
      color: 0x6d573d,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits: -4.0
    });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.9 });
    const pineMat1 = new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.8 });
    const pineMat2 = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.85 });
    const pineMat3 = new THREE.MeshStandardMaterial({ color: 0x33691e, roughness: 0.8 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x546e7a, roughness: 0.75 });
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 });
    const tentMat1 = new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.6 });
    const tentMat2 = new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.6 });
    const fireEmberMat = new THREE.MeshBasicMaterial({ color: 0xff6f00 });

    // 1. Forest Floor
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), forestFloorMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);

    // Cross-crossing natural dirt hiking trails
    const trailEW = new THREE.Mesh(new THREE.PlaneGeometry(76, 5), dirtTrailMat);
    trailEW.rotation.x = -Math.PI / 2;
    trailEW.position.set(0, 0.03, 0);
    trailEW.receiveShadow = true;
    root.add(trailEW);

    const trailNS = new THREE.Mesh(new THREE.PlaneGeometry(5, 76), dirtTrailMat);
    trailNS.rotation.x = -Math.PI / 2;
    trailNS.position.set(0, 0.045, 0);
    trailNS.receiveShadow = true;
    root.add(trailNS);

    // 2. Procedural Pine Trees Generator
    const createPineTree = (x, z, scale = 1.0) => {
      const trunkH = 3.5 * scale;
      const trunkR = 0.45 * scale;
      // Trunk
      this.createCylinder(root, trunkR, trunkR * 1.2, trunkH, 8, x, trunkH / 2, z, trunkMat);

      // 3 Conical Pine Leaf Foliage Tiers
      const foliageMats = [pineMat1, pineMat2, pineMat3];
      for (let i = 0; i < 3; i++) {
        const tierH = 2.8 * scale;
        const tierR = (3.2 - i * 0.7) * scale;
        const tierY = trunkH + i * (1.8 * scale) + (tierH / 2);
        this.createCylinder(root, 0.1, tierR, tierH, 8, x, tierY, z, foliageMats[i % foliageMats.length]);
      }
    };

    // Dense Perimeter Pine Ring
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const rx = Math.sin(angle) * 36;
      const rz = Math.cos(angle) * 36;
      createPineTree(rx, rz, 1.2);
    }

    // Mid-ground tactical tree clusters
    const treePositions = [
      [-14, -14], [-18, -10], [-10, -18],
      [14, -14], [18, -10], [10, -18],
      [-14, 14], [-18, 10], [-10, 18],
      [14, 14], [18, 10], [10, 18],
      [-22, 0], [22, 0], [0, -22], [0, 22]
    ];
    for (const [tx, tz] of treePositions) {
      createPineTree(tx, tz, 0.9 + Math.random() * 0.3);
    }

    // 3. Granite Boulders (Tactical Cover)
    const createBoulder = (x, z, sx, sy, sz) => {
      this.createBox(root, sx, sy, sz, x, sy / 2, z, rockMat);
    };
    createBoulder(-14, 0, 3.5, 2.0, 3.0);
    createBoulder(14, 0, 3.5, 2.0, 3.0);
    createBoulder(0, -14, 3.0, 1.8, 3.5);
    createBoulder(0, 14, 3.0, 1.8, 3.5);
    createBoulder(-24, -22, 4.0, 2.5, 3.5);
    createBoulder(24, 22, 4.0, 2.5, 3.5);

    // 4. Fallen Redwood Tree Logs (Horizontal Cover)
    const createFallenLog = (x, z, length, yaw = 0) => {
      const log = this.createCylinder(root, 0.65, 0.75, length, 8, x, 0.7, z, logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = yaw;
    };
    createFallenLog(-6, -8, 8, Math.PI / 6);
    createFallenLog(8, 8, 7, -Math.PI / 4);

    // 5. Central Clearing Campsite
    // Firepit ring of stones
    this.createCylinder(root, 1.2, 1.4, 0.4, 10, 0, 0.2, 0, rockMat);
    // Glowing embers
    const ember = this.createCylinder(root, 0.8, 0.8, 0.25, 8, 0, 0.25, 0, fireEmberMat, false);
    // Subtle warm point light from campfire
    const campLight = new THREE.PointLight(0xff6f00, 2.5, 18);
    campLight.position.set(0, 0.8, 0);
    root.add(campLight);

    // Canvas Tents (A-frame wedge)
    this.createBox(root, 3.2, 2.0, 2.8, -4, 1.0, 4, tentMat1);
    this.createBox(root, 3.0, 1.9, 2.6, 4, 0.95, -4, tentMat2);

    // Wooden Camp Supply Crates
    this.createBox(root, 1.4, 1.2, 1.4, -3, 0.6, -2, trunkMat);
    this.createBox(root, 1.2, 1.0, 1.2, -3.2, 0.5, -3.4, trunkMat);
  }

  // =========================================================================
  // MAP 4: BLOCKCRAFT VOXEL REALM (MINECRAFT-INSPIRED)
  // =========================================================================
  static buildMinecraftMap(root) {
    const grassTopMat = new THREE.MeshStandardMaterial({ color: 0x55a034, roughness: 0.9 });
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x866043, roughness: 0.95 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x737373, roughness: 0.8 });
    const woodPlankMat = new THREE.MeshStandardMaterial({ color: 0xb58b53, roughness: 0.7 });
    const woodLogMat = new THREE.MeshStandardMaterial({ color: 0x5e4429, roughness: 0.8 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d7e25, roughness: 0.85 });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2980b9,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -2.0
    });
    const bedrockMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });

    // 1. Voxel Stepped Ground (Grid of 2m x 2m blocks)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), grassTopMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);

    // Central Water Canal running North-South (z=[-38, 38], x=[-4, 4], depth 0.6m)
    const waterCanal = new THREE.Mesh(new THREE.PlaneGeometry(8, 78), waterMat);
    waterCanal.rotation.x = -Math.PI / 2;
    waterCanal.position.set(0, 0.05, 0);
    waterCanal.receiveShadow = true;
    root.add(waterCanal);

    // Canal Banks (Dirt borders)
    this.createBox(root, 1.0, 0.6, 78, -4.5, 0.3, 0, dirtMat);
    this.createBox(root, 1.0, 0.6, 78, 4.5, 0.3, 0, dirtMat);

    // 2. Perimeter Voxel Bedrock Wall (1.8m tall)
    this.createBox(root, 76, 1.8, 1.0, 0, 0.9, -38.5, bedrockMat);
    this.createBox(root, 76, 1.8, 1.0, 0, 0.9, 38.5, bedrockMat);
    this.createBox(root, 1.0, 1.8, 76, -38.5, 0.9, 0, bedrockMat);
    this.createBox(root, 1.0, 1.8, 76, 38.5, 0.9, 0, bedrockMat);

    // 3. Voxel Oak Cabin (West Side: x=[-26, -14], z=[-22, -10], 4m height)
    this.createBox(root, 12, 4.0, 1.0, -20, 2.0, -21.5, woodPlankMat); // North Wall
    this.createBox(root, 1.0, 4.0, 12, -25.5, 2.0, -16, woodPlankMat); // West Wall
    this.createBox(root, 1.0, 4.0, 12, -14.5, 2.0, -16, woodPlankMat); // East Wall
    // Front South Wall with 2m door
    this.createBox(root, 5.0, 4.0, 1.0, -23.5, 2.0, -10.5, woodPlankMat);
    this.createBox(root, 5.0, 4.0, 1.0, -16.5, 2.0, -10.5, woodPlankMat);
    this.createBox(root, 2.0, 1.5, 1.0, -20, 3.25, -10.5, woodPlankMat); // Door lintel
    // Corner Log Pillars
    for (const [cx, cz] of [[-25.5, -21.5], [-14.5, -21.5], [-25.5, -10.5], [-14.5, -10.5]]) {
      this.createBox(root, 1.4, 4.2, 1.4, cx, 2.1, cz, woodLogMat);
    }
    // Cabin Voxel Roof
    this.createBox(root, 14, 0.8, 14, -20, 4.4, -16, stoneMat);

    // 4. Cobblestone Watchtower (East Side: x=[14, 22], z=[-22, -14], 8m height)
    this.createBox(root, 8.0, 8.0, 1.0, 18, 4.0, -21.5, stoneMat); // North Wall
    this.createBox(root, 8.0, 8.0, 1.0, 18, 4.0, -14.5, stoneMat); // South Wall
    this.createBox(root, 1.0, 8.0, 8.0, 14.5, 4.0, -18, stoneMat); // West Wall
    this.createBox(root, 1.0, 8.0, 8.0, 21.5, 4.0, -18, stoneMat); // East Wall
    // Top Tower Battlements (Crenellations)
    this.createBox(root, 8.4, 0.8, 8.4, 18, 8.4, -18, stoneMat);
    this.createBox(root, 1.2, 1.2, 1.2, 14.5, 9.2, -21.5, stoneMat);
    this.createBox(root, 1.2, 1.2, 1.2, 21.5, 9.2, -21.5, stoneMat);
    this.createBox(root, 1.2, 1.2, 1.2, 14.5, 9.2, -14.5, stoneMat);
    this.createBox(root, 1.2, 1.2, 1.2, 21.5, 9.2, -14.5, stoneMat);

    // 5. Voxel Arch Bridge over Canal (Center: x=[-5, 5], z=[-2, 2])
    this.createBox(root, 10, 0.8, 4.0, 0, 1.2, 0, woodPlankMat);
    this.createBox(root, 10, 0.8, 0.4, 0, 1.8, -1.8, woodLogMat); // Railing
    this.createBox(root, 10, 0.8, 0.4, 0, 1.8, 1.8, woodLogMat);  // Railing
    // Bridge ramp steps
    this.createBox(root, 2.5, 0.6, 4.0, -5.5, 0.6, 0, woodPlankMat);
    this.createBox(root, 2.5, 0.6, 4.0, 5.5, 0.6, 0, woodPlankMat);

    // 6. Cubic Voxel Trees
    const createVoxelTree = (x, z) => {
      // 1m x 1m wood log trunk (height 4m)
      this.createBox(root, 1.0, 4.0, 1.0, x, 2.0, z, woodLogMat);
      // Stepped cube leaves
      this.createBox(root, 4.0, 2.0, 4.0, x, 4.5, z, leafMat);
      this.createBox(root, 2.0, 1.5, 2.0, x, 5.8, z, leafMat);
    };
    createVoxelTree(-16, 16);
    createVoxelTree(-24, 22);
    createVoxelTree(-8, 26);
    createVoxelTree(16, 16);
    createVoxelTree(24, 22);
    createVoxelTree(8, 26);

    // 7. Stepped Voxel Hills (Terraces for Tactical Height)
    this.createBox(root, 10, 1.2, 8, -26, 0.6, 6, grassTopMat);
    this.createBox(root, 6, 1.2, 5, -26, 1.8, 6, grassTopMat);

    this.createBox(root, 10, 1.2, 8, 26, 0.6, 6, grassTopMat);
    this.createBox(root, 6, 1.2, 5, 26, 1.8, 6, grassTopMat);
  }

  // =========================================================================
  // MAP 5: S.S. OCEANIC (CRUISE SHIP)
  // =========================================================================
  static buildCruiseMap(root) {
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x01579b,
      roughness: 0.1,
      metalness: 0.3
    });
    const hullWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 });
    const hullBlueMat = new THREE.MeshStandardMaterial({ color: 0x0d47a1, roughness: 0.5 });
    const deckWoodMat = new THREE.MeshStandardMaterial({
      color: 0xa1887f,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -2.0
    });
    const poolTileMat = new THREE.MeshStandardMaterial({ color: 0x00bcd4, roughness: 0.2 });
    const poolWaterMat = new THREE.MeshStandardMaterial({
      color: 0x4dd0e1,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -2.0
    });
    const funnelRedMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.4 });
    const railingSteelMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.85, roughness: 0.2 });
    const chairYellowMat = new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.6 });
    const lifeboatOrangeMat = new THREE.MeshStandardMaterial({ color: 0xff9800, roughness: 0.5 });

    // 1. Endless Ocean Plane
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -4.0; // Ocean water level below ship deck
    ocean.receiveShadow = true;
    root.add(ocean);

    // 2. Cruise Liner Hull (Width 40m, Length 78m, x=[-20, 20], z=[-39, 39])
    // Lower Navy Blue waterline hull
    this.createBox(root, 38, 3.5, 78, 0, -2.0, 0, hullBlueMat);
    // Upper White superstructure hull
    this.createBox(root, 36, 1.5, 76, 0, 0.2, 0, hullWhiteMat);

    // Main Sun Deck (Teak wood flooring)
    const sunDeck = new THREE.Mesh(new THREE.PlaneGeometry(36, 76), deckWoodMat);
    sunDeck.rotation.x = -Math.PI / 2;
    sunDeck.position.set(0, 0.03, 0);
    sunDeck.receiveShadow = true;
    root.add(sunDeck);

    // 3. Perimeter Safety Railings (1.5m tall - preventing falling overboard)
    this.createBox(root, 36, 1.5, 0.2, 0, 0.75, -37.9, railingSteelMat); // Bow railing
    this.createBox(root, 36, 1.5, 0.2, 0, 0.75, 37.9, railingSteelMat);  // Stern railing
    this.createBox(root, 0.2, 1.5, 76, -17.9, 0.75, 0, railingSteelMat); // Port railing (West)
    this.createBox(root, 0.2, 1.5, 76, 17.9, 0.75, 0, railingSteelMat);  // Starboard railing (East)

    // 4. Forward Bridge Superstructure (z=[-34, -20], x=[-14, 14], 6.5m height)
    this.createBox(root, 28, 6.5, 14, 0, 3.25, -27, hullWhiteMat);
    // Observation Deck Glass Windows
    this.createBox(root, 24, 1.8, 0.3, 0, 4.5, -19.8, new THREE.MeshBasicMaterial({ color: 0x80deea }));
    // Bridge Catwalk Extension
    this.createBox(root, 30, 0.4, 3, 0, 3.5, -19.5, deckWoodMat);

    // 5. Giant Iconic Red & White Cruise Smokestack Funnel (z=[-16, -10], x=[-4, 4], 9m height)
    this.createBox(root, 7, 9.0, 5, 0, 4.5, -13, funnelRedMat);
    this.createBox(root, 7.2, 1.8, 5.2, 0, 6.0, -13, hullWhiteMat); // White middle band
    this.createCylinder(root, 0.6, 0.6, 1.5, 8, -1.8, 9.5, -13, railingSteelMat); // Exhaust pipe 1
    this.createCylinder(root, 0.6, 0.6, 1.5, 8, 1.8, 9.5, -13, railingSteelMat);  // Exhaust pipe 2

    // 6. Midship Swimming Pool (z=[-4, 12], x=[-6, 6])
    // Mosaic Pool Coaming & Border
    this.createBox(root, 12.8, 0.4, 16.8, 0, 0.2, 4, poolTileMat);
    // Translucent Blue Pool Water
    const poolWater = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 15.6), poolWaterMat);
    poolWater.rotation.x = -Math.PI / 2;
    poolWater.position.set(0, 0.25, 4);
    root.add(poolWater);

    // Poolside Lounger Deck Chairs
    for (let pz = -2; pz <= 10; pz += 3.5) {
      this.createBox(root, 1.0, 0.45, 2.2, -9.5, 0.225, pz, chairYellowMat);
      this.createBox(root, 1.0, 0.45, 2.2, 9.5, 0.225, pz, chairYellowMat);
    }

    // Poolside Tiki/Cocktail Bar Counter (West of pool)
    this.createBox(root, 2.2, 1.1, 7.0, -13, 0.55, 4, new THREE.MeshStandardMaterial({ color: 0x37474f }));

    // 7. Stern Promenade Cabins & Dining Superstructure (z=[20, 34], x=[-13, 13], 5m height)
    this.createBox(root, 26, 5.0, 14, 0, 2.5, 27, hullWhiteMat);
    // Promenade Canopy Overhang
    this.createBox(root, 28, 0.4, 16, 0, 5.2, 27, deckWoodMat);

    // 8. Lifeboat Stations (Port & Starboard)
    const createLifeboat = (x, z) => {
      // Suspended davit crane arms
      this.createBox(root, 0.3, 3.2, 0.3, x, 1.6, z - 2.5, railingSteelMat);
      this.createBox(root, 0.3, 3.2, 0.3, x, 1.6, z + 2.5, railingSteelMat);
      // Lifeboat hull
      this.createBox(root, 1.8, 1.2, 6.0, x, 1.8, z, lifeboatOrangeMat);
    };
    createLifeboat(-17.0, -6);
    createLifeboat(-17.0, 14);
    createLifeboat(17.0, -6);
    createLifeboat(17.0, 14);
  }

  // =========================================================================
  // MAP 6: SECTOR-7 COMPOUND (TACTICAL SCI-FI ARENA)
  // =========================================================================
  static buildSector7Map(root) {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x5c6d80, roughness: 0.5, metalness: 0.1 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x7c8da0, roughness: 0.45, metalness: 0.2 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x71875c, roughness: 0.5, metalness: 0.2 });
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x8294a6, roughness: 0.45, metalness: 0.3 });
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x7c8da0, roughness: 0.4, metalness: 0.4 });

    // 1. Floor (80m x 80m)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    root.add(floor);

    // Grid Overlay
    const grid = new THREE.GridHelper(80, 40, 0x00ffff, 0x8298b3);
    grid.position.y = 0.02;
    root.add(grid);

    // 2. Perimeter Walls (8m tall)
    this.createBox(root, 80, 8, 1, 0, 4, -40.5, wallMat);
    this.createBox(root, 80, 8, 1, 0, 4, 40.5, wallMat);
    this.createBox(root, 1, 8, 80, -40.5, 4, 0, wallMat);
    this.createBox(root, 1, 8, 80, 40.5, 4, 0, wallMat);

    // Neon stripes
    this.createBox(root, 80, 0.15, 0.1, 0, 7.5, -40, stripeMat, false);
    this.createBox(root, 80, 0.15, 0.1, 0, 7.5, 40, stripeMat, false);
    this.createBox(root, 0.1, 0.15, 80, -40, 7.5, 0, stripeMat, false);
    this.createBox(root, 0.1, 0.15, 80, 40, 7.5, 0, stripeMat, false);

    // 3. Central Compound Pillars
    this.createBox(root, 4, 3.5, 1, -4, 1.75, -5.5, wallMat);
    this.createBox(root, 4, 3.5, 1, 4, 1.75, -5.5, wallMat);
    this.createBox(root, 4, 3.5, 1, -4, 1.75, 5.5, wallMat);
    this.createBox(root, 4, 3.5, 1, 4, 1.75, 5.5, wallMat);
    this.createBox(root, 1, 3.5, 4, -5.5, 1.75, 0, wallMat);
    this.createBox(root, 1, 3.5, 4, 5.5, 1.75, 0, wallMat);

    // Central Energy Beacon
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0x223348,
      roughness: 0.2,
      metalness: 0.9,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.8
    });
    this.createCylinder(root, 0.8, 1.2, 5, 8, 0, 2.5, 0, beaconMat);

    // 4. Tactical Olive Military Crates
    const createCrateCluster = (cx, cz) => {
      this.createBox(root, 2, 2.2, 2, cx, 1.1, cz, crateMat);
      this.createBox(root, 1.8, 2.2, 1.8, cx + 1.8, 1.1, cz + 0.5, crateMat);
    };
    createCrateCluster(-16, -16);
    createCrateCluster(16, -16);
    createCrateCluster(-16, 16);
    createCrateCluster(16, 16);

    // 5. Waist-high Barricades
    this.createBox(root, 4, 1.2, 1, -6, 0.6, -14.5, barrierMat);
    this.createBox(root, 4, 1.2, 1, 6, 0.6, -14.5, barrierMat);
    this.createBox(root, 4, 1.2, 1, -6, 0.6, 14.5, barrierMat);
    this.createBox(root, 4, 1.2, 1, 6, 0.6, 14.5, barrierMat);
    this.createBox(root, 2, 1.2, 4, -24, 0.6, 0, barrierMat);
    this.createBox(root, 2, 1.2, 4, 24, 0.6, 0, barrierMat);

    // 6. Elevated Sniper Catwalk Platforms
    const createCatwalk = (px, pz) => {
      this.createBox(root, 8, 0.5, 8, px, 3.25, pz, platformMat);
      for (const [lx, lz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
        this.createBox(root, 0.5, 3.25, 0.5, px + lx, 1.625, pz + lz, platformMat);
      }
      const ramp = this.createBox(root, 3, 0.4, 8, px + (px > 0 ? -5.5 : 5.5), 1.6, pz, platformMat);
      ramp.rotation.z = px > 0 ? 0.4 : -0.4;
    };
    createCatwalk(-28, -24);
    createCatwalk(28, 24);
    createCatwalk(-26, 24);
    createCatwalk(26, -24);
  }
}
