export enum GamePhase {
  LOBBY = "lobby",
  WARMUP = "warmup",
  PLAYING = "playing",
  ROUND_END = "round_end",
  POST_GAME = "post_game"
}

export enum Team {
  NONE = "none",
  RED = "red",
  BLUE = "blue"
}

export enum CollisionGroup {
  WORLD         = 1 << 0,  // Static geometry, walls, floors, ramps
  PLAYER        = 1 << 1,  // Kinematic Character Controller collision
  PLAYER_HITBOX = 1 << 2,  // Precise multi-region hurtboxes
  PROJECTILE    = 1 << 3,  // Dynamic bullets / grenades
  TRIGGER       = 1 << 4,  // Spawn zones, pickup zones
  BOT           = 1 << 5,  // AI bot physics
  VISION        = 1 << 6   // Line of sight raycasting
}

export enum HitRegion {
  HEAD      = "head",      // 2.0x multiplier
  CHEST     = "chest",     // 1.0x multiplier
  PELVIS    = "pelvis",    // 0.9x multiplier
  LEFT_ARM  = "left_arm",  // 0.7x multiplier
  RIGHT_ARM = "right_arm", // 0.7x multiplier
  LEFT_LEG  = "left_leg",  // 0.7x multiplier
  RIGHT_LEG = "right_leg"  // 0.7x multiplier
}
