import { PLAYER_MAX_SPEED, PLAYER_SPRINT_MULTIPLIER, MAX_TICK_LEAD } from './constants.js';
import { PlayerInput, ShotCommand } from './types.js';
import { WEAPON_DEFINITIONS } from './weapons.js';

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

export function validatePlayerInput(
  input: PlayerInput,
  lastProcessedSequence: number,
  currentServerTick: number
): ValidationResult {
  // 1. Monotonic sequence check
  if (input.inputSequence <= lastProcessedSequence) {
    return { isValid: false, reason: "Duplicate or out-of-order sequence" };
  }

  // 2. Future tick lead check
  if (input.inputSequence > currentServerTick + MAX_TICK_LEAD) {
    return { isValid: false, reason: "Future tick lead exceeds threshold" };
  }

  // 3. Movement range bounds (-1 to 1)
  if (Math.abs(input.forward) > 1.05 || Math.abs(input.strafe) > 1.05) {
    return { isValid: false, reason: "Forward or strafe input out of bounds" };
  }

  // 4. Pitch bounds check (-PI/2 to PI/2)
  const maxPitch = Math.PI / 2 + 0.05;
  if (Math.abs(input.pitch) > maxPitch) {
    return { isValid: false, reason: "Pitch angle out of physical limits" };
  }

  return { isValid: true };
}

export function validateShotCommand(
  shot: ShotCommand,
  isDead: boolean,
  lastFireTimeMs: number,
  currentServerTimeMs: number
): ValidationResult {
  // 1. Dead player check
  if (isDead) {
    return { isValid: false, reason: "Dead player cannot fire" };
  }

  // 2. Unknown weapon check
  const weaponDef = WEAPON_DEFINITIONS[shot.weaponId];
  if (!weaponDef) {
    return { isValid: false, reason: `Unknown weapon ID: ${shot.weaponId}` };
  }

  // 3. Fire-rate limit check (allowing 10% buffer for net jitter)
  const minInterval = weaponDef.fireIntervalMs * 0.90;
  if (currentServerTimeMs - lastFireTimeMs < minInterval) {
    return { isValid: false, reason: "Fire rate exceeds weapon maximum" };
  }

  return { isValid: true };
}
