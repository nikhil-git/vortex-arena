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

export const MAPS = {
  house: {
    id: 'house',
    name: 'Suburban Estate',
    theme: 'Normal House',
    style: 'Close-Quarters Combat (CQB) & Flanking',
    description: 'A realistic residential home featuring a living room with sofas, kitchen with counter island, bedrooms, corridors, and a fenced backyard patio.',
    recommendedWeapons: ['Shotgun', 'Assault Rifle', 'Pistol'],
    dimensions: '60m x 60m',
    bounds: { minX: -27.5, maxX: 27.5, minZ: -27.5, maxZ: 27.5, floorY: 0, ceilingY: 10 },
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
      // Outer Wooden Perimeter Fence (Boundary Barrier, 20m vertical height)
      { min: [-28, 0, -29], max: [28, 20.0, -28], name: 'Fence North', isBoundary: true },
      { min: [-28, 0, 28], max: [28, 20.0, 29], name: 'Fence South', isBoundary: true },
      { min: [-29, 0, -28], max: [-28, 20.0, 28], name: 'Fence West', isBoundary: true },
      { min: [28, 0, -28], max: [29, 20.0, 28], name: 'Fence East', isBoundary: true },

      // Main House Exterior Walls (Height 4.2m)
      { min: [-14, 0, -12.75], max: [14, 4.2, -12.25], name: 'House Back Wall' }, // North exterior
      { min: [-13.75, 0, -12.5], max: [-13.25, 4.2, 13.5], name: 'House West Wall' },
      { min: [13.25, 0, -12.5], max: [13.75, 4.2, 13.5], name: 'House East Wall' },
      // Front Exterior Wall with front door gap at x=[-2, 2]
      { min: [-13.5, 0, 13.25], max: [-2, 4.2, 13.75], name: 'House Front West' },
      { min: [2, 0, 13.25], max: [13.5, 4.2, 13.75], name: 'House Front East' },

      // Interior Dividing Walls (with doorway gaps)
      // East-West Central Corridor Wall (door gaps at x=[-8, -6] and x=[6, 8])
      { min: [-13, 0, -0.25], max: [-8, 3.2, 0.25], name: 'Wall Hall-Guest' },
      { min: [-6, 0, -0.25], max: [6, 3.2, 0.25], name: 'Wall Hallway Center' },
      { min: [8, 0, -0.25], max: [13, 3.2, 0.25], name: 'Wall Hall-Master' },

      // North-South Dividing Wall between Kitchen/Living Room (z > 0, door gap at z=[4, 8])
      { min: [-0.25, 0, 0], max: [0.25, 3.2, 4], name: 'Divider South' },
      { min: [-0.25, 0, 8], max: [0.25, 3.2, 13], name: 'Divider North' },

      // North-South Dividing Wall between Bedrooms (z < 0, door gap at z=[-6, -3])
      { min: [-0.25, 0, -12], max: [0.25, 3.2, -6], name: 'Bedrooms Divider A' },
      { min: [-0.25, 0, -3], max: [0.25, 3.2, 0], name: 'Bedrooms Divider B' },

      // Living Room Furniture
      { min: [4, 0, 8.1], max: [10, 1.1, 9.9], name: 'L-Sofa Main' },
      { min: [8.5, 0, 4.5], max: [10, 1.1, 8.0], name: 'L-Sofa Side' },
      { min: [5, 0, 5.1], max: [7.5, 0.8, 6.9], name: 'Coffee Table' },
      { min: [2, 0, 12.0], max: [6, 1.8, 12.8], name: 'TV Unit' },

      // Kitchen Furniture
      { min: [-12.5, 0, 3], max: [-10, 1.2, 11], name: 'Kitchen Counter Island' },
      { min: [-6.5, 0, 4.6], max: [-3.5, 1.1, 7.4], name: 'Dining Table' },
      { min: [-12.35, 0, 11.1], max: [-10.15, 2.2, 12.7], name: 'Refrigerator' },

      // Bedrooms Furniture
      { min: [6.25, 0, -9.9], max: [10.75, 1.0, -6.1], name: 'Master Bed' },
      { min: [2, 0, -11.5], max: [5, 2.2, -10.1], name: 'Wardrobe Closet' },
      { min: [-10.9, 0, -9.8], max: [-7.1, 1.0, -6.2], name: 'Guest Bed' },
      { min: [-5, 0, -11.5], max: [-2, 1.3, -10.1], name: 'Dresser' },

      // Backyard Furniture & Cover
      { min: [-2, 0, -18.75], max: [2, 1.2, -15.25], name: 'Patio Table & Chairs' },
      { min: [8.25, 0, -23.75], max: [11.75, 1.5, -21.25], name: 'Barbecue Grill' },
      { min: [-24, 0, -19], max: [-19, 2.5, -14], name: 'Garden Shed' },
      { min: [16.25, 0, -16.75], max: [21.75, 1.2, -14.25], name: 'Planter Box East' },
      { min: [-23.75, 0, 17.7], max: [-18.25, 1.9, 20.3], name: 'Front Car/Van Cover' }
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
    bounds: { minX: -37.5, maxX: 37.5, minZ: -37.5, maxZ: 37.5, floorY: 0, ceilingY: 15 },
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
      { x: -1, y: 0, z: -18, yaw: -Math.PI / 2 },   // Grain silo alley
      { x: 10, y: 0, z: -8, yaw: Math.PI },         // Tractor workyard
      { x: 22, y: 0, z: -24, yaw: -Math.PI / 4 },   // North wheat field
      { x: 30, y: 0, z: -4, yaw: -Math.PI / 2 },    // East dirt road
      { x: 10, y: 0, z: 14, yaw: Math.PI / 4 },     // Farmhouse veranda entrance
      { x: 21, y: 0, z: 14, yaw: -3 * Math.PI / 4 },// Farmhouse interior
      { x: 2, y: 0, z: 28, yaw: Math.PI },          // South corn field
      { x: -8, y: 0, z: 30, yaw: 0 },               // South windmill
      { x: -20, y: 0, z: 22, yaw: Math.PI / 4 },    // Tool shed paddock
      { x: -32, y: 0, z: 4, yaw: Math.PI / 2 }      // West pasture
    ],
    obstacles: [
      // Outer Post-and-Rail Fence (Boundary Barrier, 20m vertical height)
      { min: [-38, 0, -39], max: [38, 20.0, -38], name: 'North Fence', isBoundary: true },
      { min: [-38, 0, 38], max: [38, 20.0, 39], name: 'South Fence', isBoundary: true },
      { min: [-39, 0, -38], max: [-38, 20.0, 38], name: 'West Fence', isBoundary: true },
      { min: [38, 0, -38], max: [39, 20.0, 38], name: 'East Fence', isBoundary: true },

      // Big Red Barn (20m x 20m, 7m tall, doors at z=[-10.6, -10])
      { min: [-30, 0, -30], max: [-10, 7.0, -29.4], name: 'Barn North Wall' },
      { min: [-30, 0, -30], max: [-29.4, 7.0, -10], name: 'Barn West Wall' },
      { min: [-10.6, 0, -30], max: [-10, 7.0, -10], name: 'Barn East Wall' },
      // Barn South wall with 6m doorway at x=[-23, -17]
      { min: [-30, 0, -10.6], max: [-23, 7.0, -10], name: 'Barn Front Left' },
      { min: [-17, 0, -10.6], max: [-10, 7.0, -10], name: 'Barn Front Right' },
      // Barn Interior Stalls
      { min: [-29, 0, -21.75], max: [-22, 2.2, -20.25], name: 'Barn Stall Left' },
      { min: [-18, 0, -21.75], max: [-11, 2.2, -20.25], name: 'Barn Stall Right' },

      // Rural Farmhouse (18m x 16m, 5m tall, exact alignment with 3D model)
      { min: [12.0, 0, 21.45], max: [30.0, 5.0, 22.0], name: 'Farmhouse Back Wall' },
      { min: [12.0, 0, 6.0], max: [30.0, 5.0, 6.6], name: 'Farmhouse Front Wall' },
      { min: [29.45, 0, 6.0], max: [30.0, 5.0, 22.0], name: 'Farmhouse East Wall' },
      { min: [12.0, 0, 6.0], max: [12.6, 5.0, 12.0], name: 'Farmhouse West Wall A' },
      { min: [12.0, 0, 16.0], max: [12.6, 5.0, 22.0], name: 'Farmhouse West Wall B' },
      { min: [12.8, 0, 6.8], max: [13.2, 4.0, 7.2], name: 'Porch Pillar A' },
      { min: [16.8, 0, 6.8], max: [17.2, 4.0, 7.2], name: 'Porch Pillar B' },

      // Dual Grain Silos (North & South Silos)
      { min: [-8.4, 0, -28.4], max: [-3.6, 10.0, -23.6], name: 'North Grain Silo' },
      { min: [-8.4, 0, -20.4], max: [-3.6, 10.0, -15.6], name: 'South Grain Silo' },

      // Elevated Water Storage Tank (West Paddock)
      { min: [-30.2, 0, 3.8], max: [-25.8, 7.5, 8.2], name: 'Elevated Water Tank' },

      // Heavy John Deere Farm Tractor
      { min: [4.2, 0, -9.4], max: [7.8, 2.8, -6.6], name: 'Heavy Farm Tractor' },

      // Tactical Hay Bale Clusters
      { min: [-16.5, 0, 4.6], max: [-13.5, 2.2, 10.4], name: 'West Round Hay Bales' },
      { min: [0.2, 0, 12.7], max: [3.8, 2.0, 15.3], name: 'South Square Hay Stack' },
      { min: [-3.8, 0, -16.3], max: [-0.2, 2.0, -13.7], name: 'Silo Square Hay Stack' }
    ],
    waypoints: [
      { id: 'barn_front', x: -20, y: 0, z: -7, isCover: true },
      { id: 'barn_interior', x: -20, y: 0, z: -16, isCover: true },
      { id: 'barn_loft', x: -25, y: 0, z: -16, isCover: true },
      { id: 'silo_alley', x: -1, y: 0, z: -18, isCover: true },
      { id: 'tractor_yard', x: 10, y: 0, z: -8, isCover: true },
      { id: 'hay_stack_north', x: 13, y: 0, z: -19, isCover: true },
      { id: 'north_wheat_field', x: 26, y: 0, z: -28, isCover: false },
      { id: 'east_dirt_road', x: 32, y: 0, z: 0, isCover: false },
      { id: 'farmhouse_porch', x: 10, y: 0, z: 14, isCover: true },
      { id: 'farmhouse_interior', x: 21, y: 0, z: 14, isCover: true },
      { id: 'farmhouse_rear', x: 21, y: 0, z: 24, isCover: true },
      { id: 'center_crossroads', x: 2, y: 0, z: 2, isCover: true },
      { id: 'center_hay', x: 2, y: 0, z: -2, isCover: true },
      { id: 'south_corn_field', x: 2, y: 0, z: 34, isCover: false },
      { id: 'water_tower', x: -24, y: 0, z: 6, isCover: true },
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
    bounds: { minX: -37.5, maxX: 37.5, minZ: -37.5, maxZ: 37.5, floorY: 0, ceilingY: 18 },
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
      { x: 0, y: 0, z: -30, yaw: Math.PI },        // North trail head
      { x: -18, y: 0, z: -26, yaw: Math.PI / 4 }, // NW pine grove
      { x: 22, y: 0, z: -22, yaw: -Math.PI / 4 }, // NE oak clearing
      { x: -30, y: 0, z: -2, yaw: Math.PI / 2 },   // West mossy crags
      { x: 0, y: 0, z: -5, yaw: 0 },               // Campsite clearing
      { x: 30, y: 0, z: 2, yaw: -Math.PI / 2 },    // East granite ridge
      { x: -18, y: 0, z: 24, yaw: -3 * Math.PI / 4 }, // SW shaded hollow
      { x: 0, y: 0, z: 30, yaw: 0 },               // South creek path
      { x: 20, y: 0, z: 28, yaw: 3 * Math.PI / 4 },// SE tall timber
      { x: -14, y: 0, z: -10, yaw: Math.PI / 4 },  // Fallen log trail
      { x: 14, y: 0, z: 10, yaw: -3 * Math.PI / 4 }, // Meadow overlook
      { x: -8, y: 0, z: 18, yaw: 0 }               // South-central grove
    ],
    obstacles: [
      // Natural Perimeter Forest Boundary Walls (20m vertical height)
      { min: [-38, 0, -39], max: [38, 20.0, -38], name: 'North Treeline Boundary', isBoundary: true },
      { min: [-38, 0, 38], max: [38, 20.0, 39], name: 'South Treeline Boundary', isBoundary: true },
      { min: [-39, 0, -38], max: [-38, 20.0, 38], name: 'West Treeline Boundary', isBoundary: true },
      { min: [38, 0, -38], max: [39, 20.0, 38], name: 'East Treeline Boundary', isBoundary: true },

      // Granite Rock Boulders (Exact alignment with 3D models)
      { min: [-16.0, 0, -1.8], max: [-12.0, 2.2, 1.8], name: 'West Granite Boulder' },
      { min: [12.0, 0, -1.8], max: [16.0, 2.2, 1.8], name: 'East Granite Boulder' },
      { min: [-1.8, 0, -16.0], max: [1.8, 2.0, -12.0], name: 'North Granite Boulder' },
      { min: [-1.8, 0, 12.0], max: [1.8, 2.0, 16.0], name: 'South Granite Boulder' },
      { min: [-26.5, 0, -24.0], max: [-21.5, 2.7, -20.0], name: 'NW Granite Crags' },
      { min: [21.5, 0, 20.0], max: [26.5, 2.7, 24.0], name: 'SE Granite Crags' },

      // Fallen Redwood Logs (Across trails)
      { min: [-10.0, 0, -10.0], max: [-2.0, 1.4, -6.0], name: 'NW Fallen Redwood Log' },
      { min: [5.0, 0, 5.0], max: [11.0, 1.4, 11.0], name: 'SE Fallen Redwood Log' },

      // Central Campsite Cover (Tents, Crates & Firepit)
      { min: [-1.4, 0, -1.4], max: [1.4, 0.5, 1.4], name: 'Campfire Ring' },
      { min: [-5.8, 0, 2.4], max: [-2.2, 2.2, 5.6], name: 'Canvas Tent NW' },
      { min: [2.3, 0, -5.5], max: [5.7, 2.1, -2.5], name: 'Canvas Tent SE' },
      { min: [-4.0, 0, -4.2], max: [-2.2, 1.4, -1.2], name: 'Wood Camp Supply Crates' },

      // Tactical Mature Pine Trees (16 Primary Tree Trunks)
      { min: [-14.6, 0, -14.6], max: [-13.4, 8.0, -13.4], name: 'Pine Trunk NW1' },
      { min: [-18.6, 0, -10.6], max: [-17.4, 8.0, -9.4], name: 'Pine Trunk NW2' },
      { min: [-10.6, 0, -18.6], max: [-9.4, 8.0, -17.4], name: 'Pine Trunk NW3' },
      { min: [13.4, 0, -14.6], max: [14.6, 8.0, -13.4], name: 'Pine Trunk NE1' },
      { min: [17.4, 0, -10.6], max: [18.6, 8.0, -9.4], name: 'Pine Trunk NE2' },
      { min: [9.4, 0, -18.6], max: [10.6, 8.0, -17.4], name: 'Pine Trunk NE3' },
      { min: [-14.6, 0, 13.4], max: [-13.4, 8.0, 14.6], name: 'Pine Trunk SW1' },
      { min: [-18.6, 0, 9.4], max: [-17.4, 8.0, 10.6], name: 'Pine Trunk SW2' },
      { min: [-10.6, 0, 17.4], max: [-9.4, 8.0, 18.6], name: 'Pine Trunk SW3' },
      { min: [13.4, 0, 13.4], max: [14.6, 8.0, 14.6], name: 'Pine Trunk SE1' },
      { min: [17.4, 0, 9.4], max: [18.6, 8.0, 10.6], name: 'Pine Trunk SE2' },
      { min: [9.4, 0, 17.4], max: [10.6, 8.0, 18.6], name: 'Pine Trunk SE3' },
      { min: [-22.6, 0, -0.6], max: [-21.4, 8.0, 0.6], name: 'Pine Trunk W' },
      { min: [21.4, 0, -0.6], max: [22.6, 8.0, 0.6], name: 'Pine Trunk E' },
      { min: [-0.6, 0, -22.6], max: [0.6, 8.0, -21.4], name: 'Pine Trunk N' },
      { min: [-0.6, 0, 21.4], max: [0.6, 8.0, 22.6], name: 'Pine Trunk S' }
    ],
    waypoints: [
      { id: 'north_trail', x: 0, y: 0, z: -28, isCover: false },
      { id: 'north_boulders', x: 0, y: 0, z: -18, isCover: true },
      { id: 'nw_clearing', x: -20, y: 0, z: -20, isCover: true },
      { id: 'nw_fallen_log', x: -12, y: 0, z: -10, isCover: true },
      { id: 'ne_pines', x: 18, y: 0, z: -22, isCover: true },
      { id: 'ne_rock_cover', x: 18, y: 0, z: -14, isCover: true },
      { id: 'west_crags', x: -18, y: 0, z: 0, isCover: true },
      { id: 'west_trail', x: -10, y: 0, z: 0, isCover: false },
      { id: 'campsite_center', x: 0, y: 0, z: -4.5, isCover: true },
      { id: 'campsite_north', x: 0, y: 0, z: -7, isCover: false },
      { id: 'campsite_south', x: 0, y: 0, z: 7, isCover: false },
      { id: 'east_ridge', x: 18, y: 0, z: 0, isCover: true },
      { id: 'east_trail', x: 10, y: 0, z: 0, isCover: false },
      { id: 'se_fallen_log', x: 12, y: 0, z: 12, isCover: true },
      { id: 'se_grove', x: 20, y: 0, z: 28, isCover: true },
      { id: 'south_boulders', x: 0, y: 0, z: 18, isCover: true },
      { id: 'sw_clearing', x: -18, y: 0, z: 18, isCover: true },
      { id: 'south_creek', x: 0, y: 0, z: 28, isCover: false },
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
    dimensions: '80m x 80m',
    bounds: { minX: -37.5, maxX: 37.5, minZ: -37.5, maxZ: 37.5, floorY: 0, ceilingY: 16 },
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
      { x: -10, y: 0, z: -15, yaw: Math.PI / 4 },   // West courtyard approach
      { x: -20, y: 0, z: -16, yaw: 0 },            // Voxel cabin interior
      { x: 0, y: 0, z: -20, yaw: Math.PI },         // North canal bank
      { x: 18, y: 0, z: -10, yaw: -Math.PI / 2 },   // Watchtower courtyard
      { x: 18, y: 0, z: -26, yaw: 0 },              // Watchtower north lane
      { x: 0, y: 0, z: -6, yaw: 0 },                // Bridge north approach
      { x: 0, y: 0, z: 6, yaw: Math.PI },           // Bridge south approach
      { x: -24, y: 0, z: -4, yaw: Math.PI / 2 },    // West canal path
      { x: 24, y: 0, z: -2, yaw: -Math.PI / 2 },    // East canal path
      { x: -16, y: 0, z: 20, yaw: 0 },              // SW tree grove
      { x: 16, y: 0, z: 20, yaw: 0 },               // SE tree grove
      { x: 0, y: 0, z: 24, yaw: Math.PI }           // South canal bridge approach
    ],
    obstacles: [
      // Outer Bedrock Boundary Block Walls (20m vertical height)
      { min: [-38, 0, -39], max: [38, 20.0, -38], name: 'North Bedrock', isBoundary: true },
      { min: [-38, 0, 38], max: [38, 20.0, 39], name: 'South Bedrock', isBoundary: true },
      { min: [-39, 0, -38], max: [-38, 20.0, 38], name: 'West Bedrock', isBoundary: true },
      { min: [38, 0, -38], max: [39, 20.0, 38], name: 'East Bedrock', isBoundary: true },

      // Central Water Canal Banks
      { min: [-5.1, 0, -38], max: [-3.9, 0.6, 38], name: 'West Canal Bank' },
      { min: [3.9, 0, -38], max: [5.1, 0.6, 38], name: 'East Canal Bank' },

      // Voxel Oak Cabin (West Side: x=[-26, -14], z=[-22, -10], 4m height)
      { min: [-26, 0, -22], max: [-14, 4.0, -21], name: 'Cabin North Wall' },
      { min: [-26, 0, -22], max: [-25, 4.0, -10], name: 'Cabin West Wall' },
      { min: [-15, 0, -22], max: [-14, 4.0, -10], name: 'Cabin East Wall' },
      { min: [-26, 0, -11], max: [-21, 4.0, -10], name: 'Cabin South Wall A' },
      { min: [-19, 0, -11], max: [-14, 4.0, -10], name: 'Cabin South Wall B' },

      // Cobblestone Watchtower (East Side: x=[14, 22], z=[-22, -14], 8m height)
      { min: [14, 0, -22], max: [22, 8.0, -21], name: 'Watchtower North' },
      { min: [14, 0, -15], max: [22, 8.0, -14], name: 'Watchtower South' },
      { min: [14, 0, -22], max: [15, 8.0, -14], name: 'Watchtower West' },
      { min: [21, 0, -22], max: [22, 8.0, -14], name: 'Watchtower East' },

      // Wooden Arch Bridge over Canal
      { min: [-5, 0, -2.1], max: [5, 1.8, -1.5], name: 'Bridge Railing North' },
      { min: [-5, 0, 1.5], max: [5, 1.8, 2.1], name: 'Bridge Railing South' },

      // Stepped Voxel Hills (Terraces for Tactical Height)
      { min: [-31, 0, 2], max: [-21, 1.8, 10], name: 'West Stepped Hill' },
      { min: [21, 0, 2], max: [31, 1.8, 10], name: 'East Stepped Hill' },

      // Cubic Voxel Trees (6 Wood Trunks)
      { min: [-16.6, 0, 15.4], max: [-15.4, 4.0, 16.6], name: 'Voxel Tree W1' },
      { min: [-24.6, 0, 21.4], max: [-23.4, 4.0, 22.6], name: 'Voxel Tree W2' },
      { min: [-8.6, 0, 25.4], max: [-7.4, 4.0, 26.6], name: 'Voxel Tree W3' },
      { min: [15.4, 0, 15.4], max: [16.6, 4.0, 16.6], name: 'Voxel Tree E1' },
      { min: [23.4, 0, 21.4], max: [24.6, 4.0, 22.6], name: 'Voxel Tree E2' },
      { min: [7.4, 0, 25.4], max: [8.6, 4.0, 26.6], name: 'Voxel Tree E3' }
    ],
    waypoints: [
      { id: 'cabin_interior', x: -20, y: 0, z: -16, isCover: true },
      { id: 'cabin_porch', x: -20, y: 0, z: -8, isCover: true },
      { id: 'north_canal', x: 0, y: 0, z: -16, isCover: false },
      { id: 'tower_base', x: 18, y: 0, z: -10, isCover: true },
      { id: 'bridge_north', x: 0, y: 0, z: -6, isCover: true },
      { id: 'bridge_center', x: 0, y: 0, z: 0, isCover: false },
      { id: 'bridge_south', x: 0, y: 0, z: 6, isCover: true },
      { id: 'west_bank', x: -16, y: 0, z: 0, isCover: false },
      { id: 'east_bank', x: 16, y: 0, z: 0, isCover: false },
      { id: 'hill_west', x: -26, y: 0, z: 0, isCover: true },
      { id: 'hill_east', x: 26, y: 0, z: 0, isCover: true },
      { id: 'south_grove_w', x: -16, y: 0, z: 20, isCover: true },
      { id: 'south_grove_e', x: 16, y: 0, z: 20, isCover: true },
      { id: 'south_trail', x: 0, y: 0, z: 20, isCover: false },
      { id: 'tower_north_lane', x: 18, y: 0, z: -26, isCover: false },
      { id: 'cabin_north_lane', x: -20, y: 0, z: -26, isCover: false }
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
    bounds: { minX: -17.5, maxX: 17.5, minZ: -37.5, maxZ: 37.5, floorY: 0, ceilingY: 16 },
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
      { x: 13, y: 0, z: 4, yaw: -Math.PI / 2 },     // Starboard pool promenade
      { x: -15, y: 0, z: 4, yaw: Math.PI / 2 },     // Port bar promenade
      { x: 10, y: 0, z: 36, yaw: Math.PI },         // Stern lounge starboard
      { x: -10, y: 0, z: 36, yaw: Math.PI },        // Stern lounge port
      { x: 0, y: 0, z: 36, yaw: Math.PI }           // Aft railing center
    ],
    obstacles: [
      // Ship Outer Deck Safety Railings (Boundary Barrier, 20m vertical height - prevent falling overboard)
      { min: [-18.5, 0, -38], max: [-17.5, 20.0, 38], name: 'Port Railing', isBoundary: true },
      { min: [17.5, 0, -38], max: [18.5, 20.0, 38], name: 'Starboard Railing', isBoundary: true },
      { min: [-18, 0, -38.5], max: [18, 20.0, -37.5], name: 'Bow Railing', isBoundary: true },
      { min: [-18, 0, 37.5], max: [18, 20.0, 38.5], name: 'Stern Railing', isBoundary: true },

      // Navigation Bridge & Upper Superstructure (z=[-34, -20], x=[-14, 14], 6.5m tall)
      { min: [-14, 0, -34], max: [14, 6.5, -20], name: 'Bridge Superstructure' },

      // Giant Iconic Red & White Cruise Smokestack Funnel (z=[-15.6, -10.4], x=[-3.6, 3.6], 9m tall)
      { min: [-3.6, 0, -15.6], max: [3.6, 9.0, -10.4], name: 'Smokestack Funnel' },

      // Midship Swimming Pool Basin & Border (z=[-4.5, 12.5], x=[-6.5, 6.5], 0.5m barrier)
      { min: [-6.5, 0, -4.5], max: [6.5, 0.5, 12.5], name: 'Swimming Pool Border' },

      // Poolside Tiki/Cocktail Bar Counter (West of pool)
      { min: [-14.2, 0, 0.5], max: [-11.8, 1.2, 7.5], name: 'Cocktail Bar Counter' },

      // Stern Promenade Cabins & Dining Superstructure (z=[20, 34], x=[-13, 13], 5m tall)
      { min: [-13, 0, 20], max: [13, 5.0, 34], name: 'Stern Superstructure' },

      // Lifeboat Stations (Port & Starboard)
      { min: [-18.0, 0, -9.0], max: [-15.5, 3.2, -3.0], name: 'Lifeboat Port 1' },
      { min: [-18.0, 0, 11.0], max: [-15.5, 3.2, 17.0], name: 'Lifeboat Port 2' },
      { min: [15.5, 0, -9.0], max: [18.0, 3.2, -3.0], name: 'Lifeboat Starboard 1' },
      { min: [15.5, 0, 11.0], max: [18.0, 3.2, 17.0], name: 'Lifeboat Starboard 2' },

      // Yellow Poolside Lounger Deck Chairs (West Row)
      { min: [-10.2, 0, -3.2], max: [-8.8, 0.6, -0.8], name: 'Deck Chair W1' },
      { min: [-10.2, 0, 0.3], max: [-8.8, 0.6, 2.7], name: 'Deck Chair W2' },
      { min: [-10.2, 0, 3.8], max: [-8.8, 0.6, 6.2], name: 'Deck Chair W3' },
      { min: [-10.2, 0, 7.3], max: [-8.8, 0.6, 9.7], name: 'Deck Chair W4' },

      // Yellow Poolside Lounger Deck Chairs (East Row)
      { min: [8.8, 0, -3.2], max: [10.2, 0.6, -0.8], name: 'Deck Chair E1' },
      { min: [8.8, 0, 0.3], max: [10.2, 0.6, 2.7], name: 'Deck Chair E2' },
      { min: [8.8, 0, 3.8], max: [10.2, 0.6, 6.2], name: 'Deck Chair E3' },
      { min: [8.8, 0, 7.3], max: [10.2, 0.6, 9.7], name: 'Deck Chair E4' }
    ],
    waypoints: [
      { id: 'bow_deck', x: 0, y: 0, z: -36, isCover: false },
      { id: 'bow_starboard', x: 12, y: 0, z: -36, isCover: true },
      { id: 'bow_port', x: -12, y: 0, z: -36, isCover: true },
      { id: 'bridge_catwalk', x: 0, y: 0, z: -18, isCover: true },
      { id: 'funnel_deck', x: 0, y: 0, z: -7, isCover: true },
      { id: 'promenade_east_fwd', x: 12, y: 0, z: -10, isCover: true },
      { id: 'promenade_west_fwd', x: -12, y: 0, z: -10, isCover: true },
      { id: 'pool_deck_east', x: 12, y: 0, z: 4, isCover: true },
      { id: 'pool_deck_west', x: -15, y: 0, z: 4, isCover: true },
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
      // Perimeter Walls (20m vertical height)
      { min: [-40, 0, -41], max: [40, 20.0, -40], name: 'North Wall', isBoundary: true },
      { min: [-40, 0, 40], max: [40, 20.0, 41], name: 'South Wall', isBoundary: true },
      { min: [-41, 0, -40], max: [-40, 20.0, 40], name: 'West Wall', isBoundary: true },
      { min: [40, 0, -40], max: [41, 20.0, 40], name: 'East Wall', isBoundary: true },

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

export class MapData {
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
