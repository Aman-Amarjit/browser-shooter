import { GamePhase, HitRegion, Team } from './enums.js';

export interface Vector3Data {
  x: number;
  y: number;
  z: number;
}

export interface QuaternionData {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface TransformData {
  position: Vector3Data;
  rotation: QuaternionData;
}

export interface PlayerInput {
  inputSequence: number;
  clientTimeMs: number;
  forward: number;  // -1 to 1
  strafe: number;   // -1 to 1
  yaw: number;      // radians
  pitch: number;    // radians
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  fire: boolean;
  reload: boolean;
  weaponSlot: number;
}

export interface ShotCommand {
  inputSequence: number;
  clientFireTime: number;
  origin: Vector3Data;
  direction: Vector3Data;
  weaponId: string;
}

export interface HistoricalPose {
  tick: number;
  timestamp: number;
  rootPosition: Vector3Data;
  rootRotation: QuaternionData;
  hitboxTransforms: Record<HitRegion, TransformData>;
}

export interface PlayerSnapshot {
  id: string;
  position: Vector3Data;
  velocity: Vector3Data;
  yaw: number;
  pitch: number;
  health: number;
  armor: number;
  activeWeaponId: string;
  ammo: number;
  isReloading: boolean;
  team: Team;
  isDead: boolean;
  kills: number;
  deaths: number;
  damageDealt: number;
}

export interface SnapshotState {
  snapshotSequence: number;
  serverTick: number;
  serverTimeMs: number;
  lastProcessedInput: number;
  players: PlayerSnapshot[];
  redScore: number;
  blueScore: number;
  matchPhase: GamePhase;
  phaseRemainingSeconds: number;
}

export interface DamageResult {
  targetId: string;
  attackerId: string;
  rawDamage: number;
  absorbedDamage: number;
  healthDamage: number;
  hitRegion: HitRegion;
  isFatal: boolean;
}

export interface NetDiagnostics {
  fps: number;
  frameTimeMs: number;
  pingMs: number;
  jitterMs: number;
  packetLossPercent: number;
  serverTickHz: number;
  clientTickHz: number;
  snapshotRateHz: number;
  predictionErrorMeters: number;
  physicsTimeMs: number;
  renderTimeMs: number;
}
