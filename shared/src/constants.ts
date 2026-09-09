export const TICK_RATE = 60;                   // 60 Hz server physics tick rate
export const TICK_INTERVAL_MS = 1000 / TICK_RATE; // 16.666ms per tick
export const SNAPSHOT_RATE = 30;               // 30 Hz server snapshot emission
export const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_RATE;

export const MAX_REWIND_MS = 250;              // 250 ms maximum lag compensation rewind window
export const MAX_TICK_LEAD = 3;                // Maximum client ticks ahead of server allowed

// Physics & Movement parameters
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.6;
export const PLAYER_MAX_SPEED = 7.5;           // meters per second
export const PLAYER_SPRINT_MULTIPLIER = 1.4;
export const PLAYER_CROUCH_MULTIPLIER = 0.5;
export const PLAYER_JUMP_IMPULSE = 6.8;
export const GRAVITY = -18.0;

// Health & Damage constants
export const MAX_HEALTH = 100;
export const MAX_ARMOR = 100;
export const ARMOR_ABSORPTION_RATIO = 0.60;   // 60% absorbed by armor

// Dynamic Hitbox Multipliers
export const HITBOX_MULTIPLIERS: Record<string, number> = {
  head: 2.0,
  chest: 1.0,
  pelvis: 0.9,
  left_arm: 0.7,
  right_arm: 0.7,
  left_leg: 0.7,
  right_leg: 0.7
};

// Reconciliation thresholds (meters)
export const RECONCILE_IGNORE_THRESHOLD = 0.02;  // < 2 cm -> ignore
export const RECONCILE_SMOOTH_THRESHOLD = 0.10;  // 2 - 10 cm -> lerp smoothly over 100ms
export const RECONCILE_SNAP_THRESHOLD = 1.00;    // > 10 cm -> hard snap
export const RECONCILE_DESYNC_ALERT = 1.00;      // > 100 cm -> desync alert / flag
