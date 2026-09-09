export interface RecoilProfile {
  verticalKick: number;     // Vertical camera pitch kick in radians
  horizontalKick: number;   // Horizontal random yaw spread in radians
  recoverySpeed: number;    // Speed at which recoil returns to center
}

export interface WeaponDefinition {
  id: string;
  name: string;
  damage: number;           // Base raw damage per shot
  fireRate: number;         // Shots per minute
  fireIntervalMs: number;   // Calculated MS between shots
  magazineSize: number;
  reloadTimeMs: number;
  range: number;            // Max raycast range in meters
  spread: number;           // Base hipfire spread angle in radians
  adsSpreadMultiplier: number; // Spread reduction when ADS
  recoil: RecoilProfile;
}

export const WEAPON_DEFINITIONS: Record<string, WeaponDefinition> = {
  assault_rifle: {
    id: "assault_rifle",
    name: "VFX-44 Assault Rifle",
    damage: 32,
    fireRate: 600,
    fireIntervalMs: 1000 / (600 / 60), // 100ms
    magazineSize: 30,
    reloadTimeMs: 2200,
    range: 150,
    spread: 0.025,
    adsSpreadMultiplier: 0.2,
    recoil: {
      verticalKick: 0.03,
      horizontalKick: 0.012,
      recoverySpeed: 12.0
    }
  },
  smg: {
    id: "smg",
    name: "Pulse SMG-9",
    damage: 22,
    fireRate: 900,
    fireIntervalMs: 1000 / (900 / 60), // 66.6ms
    magazineSize: 36,
    reloadTimeMs: 1800,
    range: 80,
    spread: 0.04,
    adsSpreadMultiplier: 0.35,
    recoil: {
      verticalKick: 0.02,
      horizontalKick: 0.025,
      recoverySpeed: 15.0
    }
  },
  shotgun: {
    id: "shotgun",
    name: "Apex Shotgun",
    damage: 14, // 8 pellets * 14 = 112 max raw damage
    fireRate: 90,
    fireIntervalMs: 1000 / (90_60 / 3600), // ~666ms
    magazineSize: 8,
    reloadTimeMs: 3000,
    range: 30,
    spread: 0.08,
    adsSpreadMultiplier: 0.6,
    recoil: {
      verticalKick: 0.12,
      horizontalKick: 0.04,
      recoverySpeed: 8.0
    }
  },
  sniper: {
    id: "sniper",
    name: "Hyperion Bolt Sniper",
    damage: 85, // Headshot = 170 (instant kill)
    fireRate: 50,
    fireIntervalMs: 1200,
    magazineSize: 5,
    reloadTimeMs: 3200,
    range: 300,
    spread: 0.12,
    adsSpreadMultiplier: 0.01,
    recoil: {
      verticalKick: 0.18,
      horizontalKick: 0.02,
      recoverySpeed: 6.0
    }
  },
  pistol: {
    id: "pistol",
    name: "Titan 9mm Pistol",
    damage: 28,
    fireRate: 400,
    fireIntervalMs: 150,
    magazineSize: 12,
    reloadTimeMs: 1400,
    range: 75,
    spread: 0.018,
    adsSpreadMultiplier: 0.25,
    recoil: {
      verticalKick: 0.04,
      horizontalKick: 0.01,
      recoverySpeed: 16.0
    }
  }
};
