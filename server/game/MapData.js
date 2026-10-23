/**
 * MapData.js - Authoritative Map Definitions for Vortex Arena
 * 
 * Provides map metadata, collision bounding boxes (AABBs), fair spawn points,
 * AI waypoint graphs, and lighting/sky configurations for all playable environments:
 * 1. Suburban Estate (Normal House)
 * 2. Golden Valley Farm (Farm)
 * 3. Whispering Pines (Forest)
 * 4. BlockCraft Voxel Realm (Minecraft-inspired)
 * 5. S.S. Oceanic (Cruise Ship)
 * 6. Sector-7 Compound (Classic Tactical Compound)
 */

const MAPS = {
  house: {
    id: 'house',
    name: 'Suburban Estate',
    theme: 'Normal House',
    style: 'Close-Quarters Combat (CQB) & Flanking',
    description: 'A realistic residential home featuring a living room with sofas, kitchen with counter island, bedrooms, corridors, and a fenced backyard patio.',
    recommendedWeapons: ['Shotgun', 'Assault Rifle', 'Pistol'],
    dimensions: '60m x 60m',
    bounds: { minX: -28, maxX: 28, minZ: -28, maxZ: 28, floorY: 0, ceilingY: 10 },
    lighting: {
      skyColor: 0x90caf9,
      groundColor: 0x4caf50,
      sunColor: 0xfffaed,
      sunPos: [25, 45, 20],
      ambientColor: 0xffffff,
      ambientIntensity: 1.3,
      fogColor: 0xb0bec5,
      fogNear: 50,
      fogFar: 180,
      exposure: 1.35
    },
    spawnPoints: [
      { x: -14, y: 0, z: 20, yaw: -Math.PI / 4 }, // Front driveway
      { x: 0, y: 0, z: 20, yaw: Math.PI },        // Front porch
      { x: 18, y: 0, z: 22, yaw: Math.PI / 4 },   // Front lawn east
      { x: 6, y: 0, z: 3, yaw: -Math.PI / 2 },    // Living room entrance
      { x: -7, y: 0, z: 2, yaw: Math.PI / 2 },    // Kitchen open floor
      { x: 0, y: 0, z: 6, yaw: Math.PI },         // Central hallway doorway
      { x: 5, y: 0, z: -4, yaw: 0 },              // Master bedroom open floor
      { x: -5, y: 0, z: -4, yaw: 0 },             // Guest bedroom open floor
      { x: 6, y: 0, z: -15, yaw: 0 },             // Back patio walkway
      { x: -18, y: 0, z: -22, yaw: Math.PI / 4 }, // Backyard west
      { x: 18, y: 0, z: -22, yaw: -Math.PI / 4 }, // Backyard east
      { x: -16, y: 0, z: -14, yaw: Math.PI / 2 }  // Garden shed yard
    ],
    obstacles: [
      // Outer Wooden Perimeter Fence (1.6m tall)
      { min: [-28, 0, -29], max: [28, 1.6, -28], name: 'Fence North' },
      { min: [-28, 0, 28], max: [28, 1.6, 29], name: 'Fence South' },
      { min: [-29, 0, -28], max: [-28, 1.6, 28], name: 'Fence West' },
      { min: [28, 0, -28], max: [29, 1.6, 28], name: 'Fence East' },

      // Main House Exterior Walls (Height 4.2m)
      { min: [-14, 0, -13], max: [14, 4.2, -12], name: 'House Back Wall' }, // North exterior
      { min: [-14, 0, -12], max: [-13, 4.2, 14], name: 'House West Wall' },
      { min: [13, 0, -12], max: [14, 4.2, 14], name: 'House East Wall' },
      // Front Exterior Wall with front door gap at x=[-2, 2]
      { min: [-14, 0, 13], max: [-2, 4.2, 14], name: 'House Front West' },
      { min: [2, 0, 13], max: [14, 4.2, 14], name: 'House Front East' },

      // Interior Dividing Walls (with doorway gaps)
      // East-West Central Corridor Wall (z=0, door gaps at x=[-8, -6] and x=[6, 8])
      { min: [-13, 0, -0.4], max: [-8, 3.2, 0.4], name: 'Wall Hall-Guest' },
      { min: [-6, 0, -0.4], max: [6, 3.2, 0.4], name: 'Wall Hallway Center' },
      { min: [8, 0, -0.4], max: [13, 3.2, 0.4], name: 'Wall Hall-Master' },

      // North-South Dividing Wall between Kitchen/Living Room (z > 0, door gap at z=[4, 8])
      { min: [-0.4, 0, 0], max: [0.4, 3.2, 4], name: 'Divider South' },
      { min: [-0.4, 0, 8], max: [0.4, 3.2, 13], name: 'Divider North' },

      // North-South Dividing Wall between Bedrooms (z < 0, door gap at z=[-6, -3])
      { min: [-0.4, 0, -12], max: [0.4, 3.2, -6], name: 'Bedrooms Divider A' },
      { min: [-0.4, 0, -3], max: [0.4, 3.2, 0], name: 'Bedrooms Divider B' },

      // Living Room Furniture
      { min: [4, 0, 8], max: [10, 1.1, 10], name: 'L-Sofa Main' },
      { min: [8.5, 0, 4.5], max: [10, 1.1, 8], name: 'L-Sofa Side' },
      { min: [5, 0, 5], max: [7.5, 0.6, 7], name: 'Coffee Table' },
      { min: [2, 0, 12], max: [6, 1.6, 12.8], name: 'TV Unit' },

      // Kitchen Furniture
      { min: [-12.5, 0, 3], max: [-10, 1.1, 11], name: 'Kitchen Counter Island' },
      { min: [-6.5, 0, 4.5], max: [-3.5, 1.1, 7.5], name: 'Dining Table' },
      { min: [-12.5, 0, 11], max: [-10, 2.2, 12.8], name: 'Refrigerator' },

      // Bedrooms Furniture
      { min: [6, 0, -10], max: [11, 0.9, -6], name: 'Master Bed' },
      { min: [2, 0, -11.5], max: [5, 2.2, -10], name: 'Wardrobe Closet' },
      { min: [-11, 0, -10], max: [-7, 0.8, -6], name: 'Guest Bed' },
      { min: [-5, 0, -11.5], max: [-2, 1.2, -10], name: 'Dresser' },

      // Backyard Furniture & Cover
      { min: [-3, 0, -19], max: [3, 0.9, -15], name: 'Patio Table & Chairs' },
      { min: [8, 0, -24], max: [12, 1.4, -21], name: 'Barbecue Grill' },
      { min: [-24, 0, -19], max: [-19, 2.4, -14], name: 'Garden Shed' },
      { min: [16, 0, -17], max: [22, 1.0, -14], name: 'Planter Box East' },
      { min: [-24, 0, 16], max: [-18, 1.8, 22], name: 'Front Car/Van Cover' }
    ],
    waypoints: [
      { id: 'front_driveway', x: -14, y: 0, z: 19, isCover: true },
      { id: 'front_porch', x: 0, y: 0, z: 16, isCover: true },
      { id: 'front_lawn', x: 16, y: 0, z: 20, isCover: false },
      { id: 'living_room_center', x: 6, y: 0, z: 3, isCover: false },
      { id: 'living_room_sofa', x: 8, y: 0, z: 6, isCover: true },
      { id: 'kitchen_center', x: -6, y: 0, z: 2, isCover: false },
      { id: 'kitchen_island', x: -8, y: 0, z: 2.5, isCover: true },
      { id: 'central_hallway', x: 0, y: 0, z: 6, isCover: false },
      { id: 'master_bedroom', x: 5, y: 0, z: -4, isCover: false },
      { id: 'master_bed_corner', x: 5, y: 0, z: -8, isCover: true },
      { id: 'guest_bedroom', x: -5, y: 0, z: -4, isCover: false },
      { id: 'guest_closet', x: -5, y: 0, z: -8, isCover: true },
      { id: 'back_patio', x: 6, y: 0, z: -15, isCover: false },
      { id: 'patio_table', x: -5, y: 0, z: -17, isCover: true },
      { id: 'backyard_west', x: -16, y: 0, z: -20, isCover: true },
      { id: 'garden_shed', x: -16, y: 0, z: -16, isCover: true },
      { id: 'backyard_east', x: 16, y: 0, z: -20, isCover: true },
      { id: 'bbq_area', x: 6, y: 0, z: -22, isCover: true },
      { id: 'side_alley_west', x: -18, y: 0, z: 0, isCover: false },
      { id: 'side_alley_east', x: 18, y: 0, z: 0, isCover: false }
    ]
  },

  farm: {
    id: 'farm',
    name: 'Golden Valley Farm',
    theme: 'Farm',
    style: 'Mixed Long-Range Fields & Close-Range Barn',
    description: 'A countryside agricultural estate with a massive red barn, rural farmhouse, crop fields, tractors, hay bales, and water silos.',
    recommendedWeapons: ['Sniper Rifle', 'Assault Rifle', 'Shotgun'],
    dimensions: '80m x 80m',
    bounds: { minX: -38, maxX: 38, minZ: -38, maxZ: 38, floorY: 0, ceilingY: 15 },
    lighting: {
      skyColor: 0x87ceeb,
      groundColor: 0xd4a373,
      sunColor: 0xfff3cf,
      sunPos: [35, 55, 30],
      ambientColor: 0xffeedd,
      ambientIntensity: 1.4,
      fogColor: 0xd8c29d,
      fogNear: 70,
      fogFar: 250,
      exposure: 1.4
    },
    spawnPoints: [
      { x: -20, y: 0, z: -8, yaw: 0 },              // Barn south entrance
      { x: -20, y: 0, z: -16, yaw: Math.PI / 2 },   // Inside big barn aisle
      { x: -4, y: 0, z: -18, yaw: -Math.PI / 2 },   // Grain silo alley
      { x: 7, y: 0, z: -6, yaw: Math.PI },          // Tractor workyard
      { x: 22, y: 0, z: -24, yaw: -Math.PI / 4 },   // North wheat field
      { x: 30, y: 0, z: -4, yaw: -Math.PI / 2 },    // East dirt road
      { x: 14, y: 0, z: 8, yaw: Math.PI / 4 },      // Farmhouse veranda
      { x: 20, y: 0, z: 18, yaw: -3 * Math.PI / 4 },// Farmhouse interior
      { x: 2, y: 0, z: 28, yaw: Math.PI },          // South corn field
      { x: -8, y: 0, z: 30, yaw: 0 },               // South windmill
      { x: -20, y: 0, z: 22, yaw: Math.PI / 4 },    // Tool shed paddock
      { x: -32, y: 0, z: 4, yaw: Math.PI / 2 }      // West pasture
    ],
    obstacles: [
      // Outer Post-and-Rail Fence (1.4m tall)
      { min: [-38, 0, -39], max: [38, 1.4, -38], name: 'North Fence' },
      { min: [-38, 0, 38], max: [38, 1.4, 39], name: 'South Fence' },
      { min: [-39, 0, -38], max: [-38, 1.4, 38], name: 'West Fence' },
      { min: [38, 0, -38], max: [39, 1.4, 38], name: 'East Fence' },

      // Big Red Barn (20m x 20m, 7m tall, doors at z=-10 and z=-30)
      { min: [-30, 0, -30], max: [-10, 7.0, -29], name: 'Barn North Wall' },
      { min: [-30, 0, -30], max: [-29, 7.0, -10], name: 'Barn West Wall' },
      { min: [-11, 0, -30], max: [-10, 7.0, -10], name: 'Barn East Wall' },
      // Barn South wall with 6m doorway in middle
      { min: [-30, 0, -11], max: [-23, 7.0, -10], name: 'Barn Front Left' },
      { min: [-17, 0, -11], max: [-10, 7.0, -10], name: 'Barn Front Right' },
      // Barn Interior Stalls
      { min: [-29, 0, -22], max: [-22, 2.2, -20], name: 'Barn Stall Left' },
      { min: [-18, 0, -22], max: [-11, 2.2, -20], name: 'Barn Stall Right' },

      // Farmhouse (18m x 16m, 5m tall)
      { min: [12, 0, 10], max: [30, 5.0, 11], name: 'Farmhouse North' },
      { min: [12, 0, 25], max: [30, 5.0, 26], name: 'Farmhouse South' },
      { min: [29, 0, 10], max: [30, 5.0, 26], name: 'Farmhouse East' },
      // Farmhouse West with doorway
      { min: [12, 0, 10], max: [13, 5.0, 16], name: 'Farmhouse West A' },
      { min: [12, 0, 20], max: [13, 5.0, 26], name: 'Farmhouse West B' },
      // Porch railing
      { min: [9, 0, 12], max: [12, 1.1, 24], name: 'Farmhouse Porch' },

      // Grain Silo & Water Tank
      { min: [-7, 0, -27], max: [-1, 10.0, -21], name: 'Grain Silo' },
      { min: [6, 0, 26], max: [11, 6.0, 31], name: 'Water Tower' },

      // Green Tractor
      { min: [4, 0, -15], max: [10, 2.8, -10], name: 'Heavy Tractor' },

      // Hay Bale Clusters (Waist & Head-High Cover)
      { min: [16, 0, -22], max: [22, 2.2, -16], name: 'Hay Bale Stack North' },
      { min: [-6, 0, -4], max: [0, 1.8, 2], name: 'Hay Bales Center' },
      { min: [-24, 0, 12], max: [-18, 2.2, 18], name: 'Hay Bale Stack South' },
      { min: [22, 0, -8], max: [26, 1.5, -4], name: 'Hay Bales Road' },

      // Tool Shed
      { min: [-32, 0, 18], max: [-24, 3.2, 26], name: 'Tool Shed' },

      // Interior Fences dividing crop fields
      { min: [-10, 0, 4], max: [12, 1.3, 5], name: 'Field Fence Center' },
      { min: [4, 0, -38], max: [5, 1.3, -16], name: 'North Road Fence' }
    ],
    waypoints: [
      { id: 'barn_front', x: -20, y: 0, z: -7, isCover: true },
      { id: 'barn_interior', x: -20, y: 0, z: -16, isCover: true },
      { id: 'barn_loft', x: -25, y: 0, z: -16, isCover: true },
      { id: 'silo_alley', x: -4, y: 0, z: -17, isCover: true },
      { id: 'tractor_yard', x: 7, y: 0, z: -6, isCover: true },
      { id: 'hay_stack_north', x: 13, y: 0, z: -19, isCover: true },
      { id: 'north_wheat_field', x: 26, y: 0, z: -28, isCover: false },
      { id: 'east_dirt_road', x: 32, y: 0, z: 0, isCover: false },
      { id: 'farmhouse_porch', x: 6, y: 0, z: 18, isCover: true },
      { id: 'farmhouse_interior', x: 20, y: 0, z: 18, isCover: true },
      { id: 'farmhouse_rear', x: 20, y: 0, z: 28, isCover: true },
      { id: 'center_crossroads', x: 2, y: 0, z: 2, isCover: true },
      { id: 'center_hay', x: 2, y: 0, z: -2, isCover: true },
      { id: 'south_corn_field', x: 2, y: 0, z: 34, isCover: false },
      { id: 'water_tower', x: 2, y: 0, z: 26, isCover: true },
      { id: 'south_windmill', x: -8, y: 0, z: 28, isCover: true },
      { id: 'south_hay_stack', x: -15, y: 0, z: 15, isCover: true },
      { id: 'tool_shed', x: -21, y: 0, z: 22, isCover: true },
      { id: 'west_pasture', x: -32, y: 0, z: 0, isCover: false },
      { id: 'west_road_lane', x: -16, y: 0, z: 0, isCover: false }
    ]
  },

  forest: {
    id: 'forest',
    name: 'Whispering Pines',
    theme: 'Forest',
    style: 'Stealth, Natural Terrain & Tactical Ambush',
    description: 'A dense woodland featuring tall pine and oak trees, granite boulders, fallen tree trunks, and a central clearing with campfire ring.',
    recommendedWeapons: ['Sniper Rifle', 'Assault Rifle', 'Pulse Pistol'],
    dimensions: '80m x 80m',
    bounds: { minX: -38, maxX: 38, minZ: -38, maxZ: 38, floorY: 0, ceilingY: 18 },
    lighting: {
      skyColor: 0x78909c,
      groundColor: 0x2e7d32,
      sunColor: 0xffecb3,
      sunPos: [20, 60, 20],
      ambientColor: 0xc8e6c9,
      ambientIntensity: 1.3,
      fogColor: 0x90a4ae,
      fogNear: 45,
      fogFar: 200,
      exposure: 1.3
    },
    spawnPoints: [
      { x: 0, y: 0, z: -32, yaw: Math.PI },        // North trail head
      { x: -24, y: 0, z: -24, yaw: Math.PI / 4 },  // NW pine grove
      { x: 24, y: 0, z: -24, yaw: -Math.PI / 4 }, // NE oak clearing
      { x: -30, y: 0, z: -2, yaw: Math.PI / 2 },   // West mossy crags
      { x: 0, y: 0, z: -5, yaw: 0 },               // Campsite clearing
      { x: 30, y: 0, z: 2, yaw: -Math.PI / 2 },    // East granite ridge
      { x: -18, y: 0, z: 26, yaw: -3 * Math.PI / 4 }, // SW shaded hollow
      { x: 0, y: 0, z: 32, yaw: 0 },               // South creek path
      { x: 24, y: 0, z: 24, yaw: 3 * Math.PI / 4 },// SE tall timber
      { x: -14, y: 0, z: -10, yaw: Math.PI / 4 },  // Fallen log trail
      { x: 14, y: 0, z: 10, yaw: -3 * Math.PI / 4 }, // Meadow overlook
      { x: -8, y: 0, z: 18, yaw: 0 }               // South-central grove
    ],
    obstacles: [
      // Natural Perimeter Forest Boundary Walls
      { min: [-38, 0, -39], max: [38, 6.0, -38], name: 'North Dense Treeline' },
      { min: [-38, 0, 38], max: [38, 6.0, 39], name: 'South Dense Treeline' },
      { min: [-39, 0, -38], max: [-38, 6.0, 38], name: 'West Dense Treeline' },
      { min: [38, 0, -38], max: [39, 6.0, 38], name: 'East Dense Treeline' },

      // Granite Rock Boulders (Solid Cover)
      { min: [-6, 0, -28], max: [6, 3.2, -22], name: 'North Rock Outcrop' },
      { min: [-28, 0, -6], max: [-22, 2.8, 4], name: 'West Granite Crags' },
      { min: [22, 0, -4], max: [28, 3.5, 6], name: 'East Granite Ridge' },
      { min: [-12, 0, 22], max: [-4, 2.5, 28], name: 'South Boulders' },
      { min: [18, 0, -22], max: [24, 2.2, -16], name: 'NE Mossy Rock' },
      { min: [-26, 0, 18], max: [-20, 2.0, 24], name: 'SW Small Crags' },

      // Central Campsite Rock Ring & Wood Benches
      { min: [-3.5, 0, -3.5], max: [3.5, 0.8, 3.5], name: 'Campfire Ring' },
      { min: [-5, 0, -1], max: [-4, 0.9, 1], name: 'Log Bench West' },
      { min: [4, 0, -1], max: [5, 0.9, 1], name: 'Log Bench East' },

      // Fallen Tree Trunks across trails
      { min: [-18, 0, -15], max: [-10, 1.2, -13], name: 'NW Fallen Trunk' },
      { min: [10, 0, 14], max: [18, 1.2, 16], name: 'SE Fallen Trunk' },

      // Primary Mature Tree Trunks (Cylinder approximations as AABBs, diameter 1.6m)
      { min: [-16, 0, -26], max: [-14.2, 8.0, -24.2], name: 'Tree NW1' },
      { min: [-8, 0, -18], max: [-6.2, 8.0, -16.2], name: 'Tree NW2' },
      { min: [10, 0, -26], max: [11.8, 8.0, -24.2], name: 'Tree NE1' },
      { min: [16, 0, -12], max: [17.8, 8.0, -10.2], name: 'Tree NE2' },
      { min: [-24, 0, -16], max: [-22.2, 8.0, -14.2], name: 'Tree W1' },
      { min: [-18, 0, 4], max: [-16.2, 8.0, 5.8], name: 'Tree W2' },
      { min: [14, 0, -4], max: [15.8, 8.0, -2.2], name: 'Tree E1' },
      { min: [26, 0, 14], max: [27.8, 8.0, 15.8], name: 'Tree E2' },
      { min: [-16, 0, 18], max: [-14.2, 8.0, 19.8], name: 'Tree SW1' },
      { min: [-6, 0, 12], max: [-4.2, 8.0, 13.8], name: 'Tree SW2' },
      { min: [6, 0, 24], max: [7.8, 8.0, 25.8], name: 'Tree SE1' },
      { min: [18, 0, 24], max: [19.8, 8.0, 25.8], name: 'Tree SE2' }
    ],
    waypoints: [
      { id: 'north_trail', x: 0, y: 0, z: -30, isCover: false },
      { id: 'north_boulders', x: 0, y: 0, z: -20, isCover: true },
      { id: 'nw_clearing', x: -22, y: 0, z: -22, isCover: true },
      { id: 'nw_fallen_log', x: -14, y: 0, z: -11, isCover: true },
      { id: 'ne_pines', x: 16, y: 0, z: -24, isCover: true },
      { id: 'ne_rock_cover', x: 16, y: 0, z: -15, isCover: true },
      { id: 'west_crags', x: -19, y: 0, z: 0, isCover: true },
      { id: 'west_trail', x: -16, y: 0, z: 0, isCover: false },
      { id: 'campsite_center', x: 0, y: 0, z: -4.5, isCover: true },
      { id: 'campsite_north', x: 0, y: 0, z: -6, isCover: false },
      { id: 'campsite_south', x: 0, y: 0, z: 6, isCover: false },
      { id: 'east_ridge', x: 19, y: 0, z: 0, isCover: true },
      { id: 'east_trail', x: 16, y: 0, z: 0, isCover: false },
      { id: 'se_fallen_log', x: 14, y: 0, z: 12, isCover: true },
      { id: 'se_grove', x: 24, y: 0, z: 22, isCover: true },
      { id: 'south_boulders', x: -2, y: 0, z: 24, isCover: true },
      { id: 'sw_clearing', x: -18, y: 0, z: 20, isCover: true },
      { id: 'south_creek', x: 0, y: 0, z: 30, isCover: false },
      { id: 'ranger_hollow', x: -8, y: 0, z: 12, isCover: true },
      { id: 'overlook_point', x: 12, y: 0, z: -8, isCover: true }
    ]
  },

  minecraft: {
    id: 'minecraft',
    name: 'BlockCraft Voxel Realm',
    theme: 'Minecraft-Inspired World',
    style: 'Vertical Platforms & Cubic Tactical Combat',
    description: 'A colorful voxel world featuring blocky grass and stone cliffs, pixel-style trees, a block house, wooden footbridge, and watchtower.',
    recommendedWeapons: ['Assault Rifle', 'Sniper Rifle', 'Breacher-12 Shotgun'],
    dimensions: '70m x 70m',
    bounds: { minX: -34, maxX: 34, minZ: -34, maxZ: 34, floorY: 0, ceilingY: 16 },
    lighting: {
      skyColor: 0x5c94fc,
      groundColor: 0x58b030,
      sunColor: 0xffffff,
      sunPos: [30, 60, 25],
      ambientColor: 0xffffff,
      ambientIntensity: 1.5,
      fogColor: 0x7ca8f8,
      fogNear: 60,
      fogFar: 220,
      exposure: 1.45
    },
    spawnPoints: [
      { x: -11, y: 0, z: -22, yaw: Math.PI / 4 },   // NW hill base
      { x: -22, y: 3.0, z: -16, yaw: Math.PI / 2 }, // NW hill plateau (elevated)
      { x: 0, y: 0, z: -20, yaw: Math.PI },         // North canal bank
      { x: 18, y: 0, z: -12, yaw: -Math.PI / 2 },   // Watchtower courtyard
      { x: 14, y: 0, z: -20, yaw: -3 * Math.PI / 4 }, // Watchtower battlements approach
      { x: 0, y: 0, z: -6, yaw: 0 },                // Bridge north approach
      { x: 0, y: 0, z: 6, yaw: Math.PI },           // Bridge south approach
      { x: -24, y: 0, z: -4, yaw: Math.PI / 2 },    // West canal path
      { x: 24, y: 0, z: 4, yaw: -Math.PI / 2 },     // East canal path
      { x: -14, y: 0, z: 18, yaw: 0 },              // Block house porch
      { x: -19, y: 0, z: 19, yaw: Math.PI / 2 },    // Block house interior
      { x: 15, y: 0, z: 22, yaw: -3 * Math.PI / 4 } // SE block quarry
    ],
    obstacles: [
      // Outer Bedrock Boundary Block Walls (4m tall)
      { min: [-34, 0, -35], max: [34, 4.0, -34], name: 'North Bedrock' },
      { min: [-34, 0, 34], max: [34, 4.0, 35], name: 'South Bedrock' },
      { min: [-35, 0, -34], max: [-34, 4.0, 34], name: 'West Bedrock' },
      { min: [34, 0, -34], max: [35, 4.0, 34], name: 'East Bedrock' },

      // Elevated Plateau / Stepped Hills (North-West)
      { min: [-30, 0, -30], max: [-14, 3.0, -14], name: 'NW Voxel Plateau' },

      // Cobblestone Watchtower (North-East, 6m tall)
      { min: [16, 0, -24], max: [24, 6.0, -16], name: 'Cobblestone Tower' },

      // Voxel Block House (South-West, 10m x 10m, 4m tall, with door opening)
      { min: [-24, 0, 14], max: [-14, 4.0, 15], name: 'House North Wall' },
      { min: [-24, 0, 23], max: [-14, 4.0, 24], name: 'House South Wall' },
      { min: [-24, 0, 14], max: [-23, 4.0, 24], name: 'House West Wall' },
      // East wall with 2m door gap in middle
      { min: [-15, 0, 14], max: [-14, 4.0, 17], name: 'House East Wall A' },
      { min: [-15, 0, 21], max: [-14, 4.0, 24], name: 'House East Wall B' },

      // Wooden Arch Bridge across center canal
      { min: [-3, 0, -4], max: [-2, 1.2, 4], name: 'Bridge Railing West' },
      { min: [2, 0, -4], max: [3, 1.2, 4], name: 'Bridge Railing East' },

      // Pixel Trees (Cubic Wood Trunks, 1.5m x 1.5m base, 6m tall)
      { min: [-8, 0, -22], max: [-6.5, 6.0, -20.5], name: 'Voxel Tree N1' },
      { min: [6, 0, -24], max: [7.5, 6.0, -22.5], name: 'Voxel Tree N2' },
      { min: [-26, 0, -4], max: [-24.5, 6.0, -2.5], name: 'Voxel Tree W' },
      { min: [24, 0, -6], max: [25.5, 6.0, -4.5], name: 'Voxel Tree E' },
      { min: [-6, 0, 18], max: [-4.5, 6.0, 19.5], name: 'Voxel Tree S1' },
      { min: [12, 0, 14], max: [13.5, 6.0, 15.5], name: 'Voxel Tree S2' },

      // Cubic Cover Boulders (1m to 2m cubes)
      { min: [-12, 0, -8], max: [-9, 2.0, -6], name: 'Stone Blocks NW' },
      { min: [9, 0, -8], max: [12, 2.0, -6], name: 'Cobble Blocks NE' },
      { min: [-8, 0, 6], max: [-6, 1.5, 9], name: 'Dirt Blocks SW' },
      { min: [7, 0, 6], max: [10, 1.5, 9], name: 'Wood Blocks SE' },
      { min: [18, 0, 20], max: [24, 2.5, 26], name: 'SE Quarry Blocks' }
    ],
    waypoints: [
      { id: 'nw_hill_base', x: -11, y: 0, z: -20, isCover: true },
      { id: 'nw_plateau', x: -22, y: 3.0, z: -20, isCover: true },
      { id: 'north_canal', x: 0, y: 0, z: -16, isCover: false },
      { id: 'ne_tower_base', x: 18, y: 0, z: -12, isCover: true },
      { id: 'ne_tower_top', x: 14, y: 0, z: -20, isCover: true },
      { id: 'bridge_north', x: 0, y: 0, z: -6, isCover: true },
      { id: 'bridge_center', x: 0, y: 0, z: 0, isCover: false },
      { id: 'bridge_south', x: 0, y: 0, z: 6, isCover: true },
      { id: 'west_bank', x: -20, y: 0, z: 0, isCover: false },
      { id: 'east_bank', x: 20, y: 0, z: 0, isCover: false },
      { id: 'voxel_house_door', x: -13, y: 0, z: 19, isCover: true },
      { id: 'voxel_house_room', x: -19, y: 0, z: 19, isCover: true },
      { id: 'se_quarry', x: 15, y: 0, z: 20, isCover: true },
      { id: 'south_trail', x: 0, y: 0, z: 20, isCover: false },
      { id: 'center_cover_nw', x: -10, y: 0, z: -4, isCover: true },
      { id: 'center_cover_ne', x: 10, y: 0, z: -4, isCover: true },
      { id: 'center_cover_sw', x: -7, y: 0, z: 4, isCover: true },
      { id: 'center_cover_se', x: 8, y: 0, z: 4, isCover: true },
      { id: 'tree_line_west', x: -25, y: 0, z: 10, isCover: true },
      { id: 'tree_line_east', x: 25, y: 0, z: 12, isCover: true }
    ]
  },

  cruise: {
    id: 'cruise',
    name: 'S.S. Oceanic',
    theme: 'Cruise Ship',
    style: 'Multi-Level Deck Skirmish & Long Flanking Corridors',
    description: 'A grand ocean liner sailing deep blue seas with multi-tier sun decks, swimming pool, navigation bridge, cabins promenade, and lifeboats.',
    recommendedWeapons: ['Assault Rifle', 'Shotgun', 'Sniper Rifle'],
    dimensions: '38m x 78m',
    bounds: { minX: -18, maxX: 18, minZ: -38, maxZ: 38, floorY: 0, ceilingY: 16 },
    lighting: {
      skyColor: 0x4fc3f7,
      groundColor: 0x0288d1,
      sunColor: 0xfffde7,
      sunPos: [25, 50, 35],
      ambientColor: 0xe1f5fe,
      ambientIntensity: 1.4,
      fogColor: 0x81d4fa,
      fogNear: 70,
      fogFar: 300,
      exposure: 1.4
    },
    spawnPoints: [
      { x: 0, y: 0, z: -36, yaw: 0 },               // Forward bow deck
      { x: 12, y: 0, z: -36, yaw: -Math.PI / 4 },   // Starboard bow
      { x: -12, y: 0, z: -36, yaw: Math.PI / 4 },   // Port bow
      { x: 0, y: 0, z: -18, yaw: 0 },               // Bridge overlook promenade
      { x: 12, y: 0, z: 0, yaw: Math.PI },          // Starboard promenade
      { x: -12, y: 0, z: 0, yaw: Math.PI },         // Port promenade
      { x: 0, y: 0, z: -7, yaw: Math.PI },          // Funnel deck sun court
      { x: 10, y: 0, z: 4, yaw: -Math.PI / 2 },     // Pool deck starboard
      { x: -9, y: 0, z: 4, yaw: Math.PI / 2 },      // Pool deck port
      { x: 10, y: 0, z: 36, yaw: Math.PI },         // Stern lounge starboard
      { x: -10, y: 0, z: 36, yaw: Math.PI },        // Stern lounge port
      { x: 0, y: 0, z: 36, yaw: Math.PI }           // Aft railing center
    ],
    obstacles: [
      // Ship Outer Deck Safety Railings (1.5m tall all around the hull perimeter)
      { min: [-18.5, 0, -38], max: [-17.5, 1.5, 38], name: 'Port Railing' },
      { min: [17.5, 0, -38], max: [18.5, 1.5, 38], name: 'Starboard Railing' },
      { min: [-18, 0, -38.5], max: [18, 1.5, -37.5], name: 'Bow Railing' },
      { min: [-18, 0, 37.5], max: [18, 1.5, 38.5], name: 'Stern Railing' },

      // Navigation Bridge & Upper Superstructure (z=[-34, -20], x=[-14, 14], 6.5m tall)
      { min: [-14, 0, -34], max: [14, 6.5, -20], name: 'Bridge Superstructure' },

      // Giant Iconic Red & White Cruise Smokestack Funnel (z=[-16, -10], x=[-3.5, 3.5], 9m tall)
      { min: [-3.5, 0, -16], max: [3.5, 9.0, -10], name: 'Smokestack Funnel' },

      // Midship Swimming Pool Basin & Border (z=[-4, 12], x=[-6.4, 6.4], 0.5m barrier)
      { min: [-6.4, 0, -4], max: [6.4, 0.5, 12], name: 'Swimming Pool Border' },

      // Poolside Tiki/Cocktail Bar Counter (West of pool)
      { min: [-14.5, 0, 0.5], max: [-11.5, 1.2, 7.5], name: 'Cocktail Bar Counter' },

      // Stern Promenade Cabins & Dining Superstructure (z=[20, 34], x=[-13, 13], 5m tall)
      { min: [-13, 0, 20], max: [13, 5.0, 34], name: 'Stern Superstructure' },

      // Lifeboat Stations (Port & Starboard)
      { min: [-18, 0, -9], max: [-15.5, 2.5, -3], name: 'Lifeboat Port 1' },
      { min: [-18, 0, 11], max: [-15.5, 2.5, 17], name: 'Lifeboat Port 2' },
      { min: [15.5, 0, -9], max: [18, 2.5, -3], name: 'Lifeboat Starboard 1' },
      { min: [15.5, 0, 11], max: [18, 2.5, 17], name: 'Lifeboat Starboard 2' }
    ],
    waypoints: [
      { id: 'bow_deck', x: 0, y: 0, z: -36, isCover: false },
      { id: 'bow_starboard', x: 12, y: 0, z: -36, isCover: true },
      { id: 'bow_port', x: -12, y: 0, z: -36, isCover: true },
      { id: 'bridge_catwalk', x: 0, y: 0, z: -18, isCover: true },
      { id: 'funnel_deck', x: 0, y: 0, z: -7, isCover: true },
      { id: 'promenade_east_fwd', x: 12, y: 0, z: -10, isCover: true },
      { id: 'promenade_west_fwd', x: -12, y: 0, z: -10, isCover: true },
      { id: 'pool_deck_east', x: 10, y: 0, z: 4, isCover: true },
      { id: 'pool_deck_west', x: -9, y: 0, z: 4, isCover: true },
      { id: 'promenade_east_mid', x: 12, y: 0, z: 14, isCover: true },
      { id: 'promenade_west_mid', x: -12, y: 0, z: 14, isCover: true },
      { id: 'stern_deck_north', x: 0, y: 0, z: 16, isCover: true },
      { id: 'stern_lounge_east', x: 10, y: 0, z: 36, isCover: true },
      { id: 'stern_lounge_west', x: -10, y: 0, z: 36, isCover: true },
      { id: 'aft_railings', x: 0, y: 0, z: 36, isCover: false }
    ]
  },

  sector7: {
    id: 'sector7',
    name: 'Sector-7 Compound',
    theme: 'Sci-Fi Industrial',
    style: 'Symmetrical Competitive Arena & Bunker Sightlines',
    description: 'The classic competitive training compound with high-tech central bunker, elevated sniper catwalks, and heavy military crate clusters.',
    recommendedWeapons: ['Hawk-50 Sniper', 'V-44 Striker', 'Pulse-9 Pistol'],
    dimensions: '80m x 80m',
    bounds: { minX: -38.5, maxX: 38.5, minZ: -38.5, maxZ: 38.5, floorY: 0, ceilingY: 15 },
    lighting: {
      skyColor: 0x8ab4f8,
      groundColor: 0x5c6d80,
      sunColor: 0xfffaed,
      sunPos: [30, 55, 25],
      ambientColor: 0xffffff,
      ambientIntensity: 1.2,
      fogColor: 0x8ab4f8,
      fogNear: 65,
      fogFar: 250,
      exposure: 1.35
    },
    spawnPoints: [
      { x: -30, y: 0, z: -30, yaw: Math.PI / 4 },
      { x: 30, y: 0, z: 30, yaw: -3 * Math.PI / 4 },
      { x: -30, y: 0, z: 30, yaw: -Math.PI / 4 },
      { x: 30, y: 0, z: -30, yaw: 3 * Math.PI / 4 },
      { x: 0, y: 0, z: -32, yaw: Math.PI },
      { x: 0, y: 0, z: 32, yaw: 0 },
      { x: -32, y: 0, z: 0, yaw: Math.PI / 2 },
      { x: 32, y: 0, z: 0, yaw: -Math.PI / 2 },
      { x: -26, y: 3.5, z: -24, yaw: Math.PI / 4 },
      { x: 26, y: 3.5, z: 24, yaw: -3 * Math.PI / 4 },
      { x: -10, y: 0, z: -20, yaw: Math.PI },
      { x: 10, y: 0, z: 20, yaw: 0 }
    ],
    obstacles: [
      { min: [-40, 0, -41], max: [40, 8, -40], name: 'North Wall' },
      { min: [-40, 0, 40], max: [40, 8, 41], name: 'South Wall' },
      { min: [-41, 0, -40], max: [-40, 8, 40], name: 'West Wall' },
      { min: [40, 0, -40], max: [41, 8, 40], name: 'East Wall' },
      { min: [-6, 0, -6], max: [-2, 3.5, -5], name: 'North-West Pillar' },
      { min: [2, 0, -6], max: [6, 3.5, -5], name: 'North-East Pillar' },
      { min: [-6, 0, 5], max: [-2, 3.5, 6], name: 'South-West Pillar' },
      { min: [2, 0, 5], max: [6, 3.5, 6], name: 'South-East Pillar' },
      { min: [-6, 0, -2], max: [-5, 3.5, 2], name: 'West Barrier' },
      { min: [5, 0, -2], max: [6, 3.5, 2], name: 'East Barrier' },
      { min: [-18, 0, -18], max: [-14, 2.2, -14], name: 'NW Heavy Crates' },
      { min: [14, 0, -18], max: [18, 2.2, -14], name: 'NE Heavy Crates' },
      { min: [-18, 0, 14], max: [-14, 2.2, 18], name: 'SW Heavy Crates' },
      { min: [14, 0, 14], max: [18, 2.2, 18], name: 'SE Heavy Crates' },
      { min: [-8, 0, -15], max: [-4, 1.2, -14], name: 'Barricade N1' },
      { min: [4, 0, -15], max: [8, 1.2, -14], name: 'Barricade N2' },
      { min: [-8, 0, 14], max: [-4, 1.2, 15], name: 'Barricade S1' },
      { min: [4, 0, 14], max: [8, 1.2, 15], name: 'Barricade S2' },
      { min: [-25, 0, -2], max: [-23, 1.2, 2], name: 'Barricade W' },
      { min: [23, 0, -2], max: [25, 1.2, 2], name: 'Barricade E' },
      { min: [-32, 0, -28], max: [-24, 3.5, -20], name: 'NW Raised Catwalk' },
      { min: [24, 0, 20], max: [32, 3.5, 28], name: 'SE Raised Catwalk' },
      { min: [-30, 0, 20], max: [-22, 3.5, 28], name: 'SW Platform' },
      { min: [22, 0, -28], max: [30, 3.5, -20], name: 'NE Platform' }
    ],
    waypoints: [
      { id: 'center', x: 0, y: 0, z: 0, isCover: false },
      { id: 'center_n', x: 0, y: 0, z: -8, isCover: true },
      { id: 'center_s', x: 0, y: 0, z: 8, isCover: true },
      { id: 'center_w', x: -8, y: 0, z: 0, isCover: true },
      { id: 'center_e', x: 8, y: 0, z: 0, isCover: true },
      { id: 'crates_nw', x: -11, y: 0, z: -16, isCover: true },
      { id: 'crates_ne', x: 11, y: 0, z: -16, isCover: true },
      { id: 'crates_sw', x: -11, y: 0, z: 16, isCover: true },
      { id: 'crates_se', x: 11, y: 0, z: 16, isCover: true },
      { id: 'barricade_n1', x: -6, y: 0, z: -12, isCover: true },
      { id: 'barricade_n2', x: 6, y: 0, z: -12, isCover: true },
      { id: 'barricade_s1', x: -6, y: 0, z: 12, isCover: true },
      { id: 'barricade_s2', x: 6, y: 0, z: 12, isCover: true },
      { id: 'barricade_w', x: -21, y: 0, z: 0, isCover: true },
      { id: 'barricade_e', x: 21, y: 0, z: 0, isCover: true },
      { id: 'platform_nw', x: -28, y: 3.5, z: -24, isCover: true },
      { id: 'platform_se', x: 28, y: 3.5, z: 24, isCover: true },
      { id: 'platform_sw', x: -26, y: 3.5, z: 24, isCover: true },
      { id: 'platform_ne', x: 26, y: 3.5, z: -24, isCover: true },
      { id: 'flank_n', x: 0, y: 0, z: -30, isCover: false },
      { id: 'flank_s', x: 0, y: 0, z: 30, isCover: false },
      { id: 'flank_w', x: -30, y: 0, z: 0, isCover: false },
      { id: 'flank_e', x: 30, y: 0, z: 0, isCover: false },
      { id: 'corner_nw', x: -30, y: 0, z: -30, isCover: true },
      { id: 'corner_ne', x: 30, y: 0, z: -30, isCover: true },
      { id: 'corner_sw', x: -30, y: 0, z: 30, isCover: true },
      { id: 'corner_se', x: 30, y: 0, z: 30, isCover: true }
    ]
  }
};

class MapData {
  static getAllMaps() {
    return Object.values(MAPS).map(m => ({
      id: m.id,
      name: m.name,
      theme: m.theme,
      style: m.style,
      description: m.description,
      recommendedWeapons: m.recommendedWeapons,
      dimensions: m.dimensions
    }));
  }

  static getMap(mapId) {
    return MAPS[mapId] || MAPS.house;
  }

  static getObstacles(mapId) {
    const map = this.getMap(mapId);
    return map.obstacles || [];
  }

  static getSpawnPoints(mapId) {
    const map = this.getMap(mapId);
    return map.spawnPoints || [];
  }

  static getWaypoints(mapId) {
    const map = this.getMap(mapId);
    return map.waypoints || [];
  }

  static getBounds(mapId) {
    const map = this.getMap(mapId);
    return map.bounds || { minX: -38, maxX: 38, minZ: -38, maxZ: 38, floorY: 0 };
  }

  static isValidMap(mapId) {
    return Boolean(MAPS[mapId]);
  }
}

module.exports = {
  MAPS,
  MapData
};
