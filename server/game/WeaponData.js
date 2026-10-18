const WEAPONS = {
  assault_rifle: {
    id: 'assault_rifle',
    name: 'V-44 Striker',
    category: 'Assault Rifle',
    damage: 26,
    headshotMultiplier: 2.0, // 52 damage headshot
    fireRateMs: 100, // 600 RPM
    magSize: 30,
    maxReserve: 120,
    reloadTimeMs: 2000,
    spread: 0.025,
    range: 120,
    automatic: true,
    pellets: 1,
    audioProfile: 'assault_rifle'
  },
  sniper_rifle: {
    id: 'sniper_rifle',
    name: 'Hawk-50 Anti-Materiel',
    category: 'Sniper Rifle',
    damage: 95,
    headshotMultiplier: 2.0, // 190 damage headshot (instant kill)
    fireRateMs: 1200, // ~50 RPM
    magSize: 5,
    maxReserve: 20,
    reloadTimeMs: 3200,
    spread: 0.005,
    range: 250,
    automatic: false,
    pellets: 1,
    audioProfile: 'sniper_rifle'
  },
  shotgun: {
    id: 'shotgun',
    name: 'Breacher-12 Tactical',
    category: 'Shotgun',
    damage: 18, // per pellet
    headshotMultiplier: 1.5,
    fireRateMs: 750, // 80 RPM
    magSize: 8,
    maxReserve: 32,
    reloadTimeMs: 2400,
    spread: 0.09,
    range: 35,
    automatic: false,
    pellets: 8, // 8 x 18 = 144 max point-blank damage
    audioProfile: 'shotgun'
  },
  pistol: {
    id: 'pistol',
    name: 'Pulse-9 Sidearm',
    category: 'Pistol',
    damage: 24,
    headshotMultiplier: 2.0, // 48 damage headshot
    fireRateMs: 160, // ~375 RPM semi-auto
    magSize: 15,
    maxReserve: 60,
    reloadTimeMs: 1400,
    spread: 0.018,
    range: 60,
    automatic: false,
    pellets: 1,
    audioProfile: 'pistol'
  }
};

module.exports = WEAPONS;
