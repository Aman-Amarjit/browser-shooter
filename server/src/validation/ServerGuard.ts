import {
  MAX_REWIND_MS,
  MAX_TICK_LEAD,
  PlayerInput,
  ShotCommand,
  validatePlayerInput,
  validateShotCommand,
  ValidationResult
} from '@fps/shared';

export class ServerGuard {
  private lastProcessedSequenceMap: Map<string, number> = new Map();
  private lastFireTimeMap: Map<string, number> = new Map();

  public validateInput(
    playerId: string,
    input: PlayerInput,
    currentServerTick: number
  ): ValidationResult {
    const lastSeq = this.lastProcessedSequenceMap.get(playerId) || 0;
    const res = validatePlayerInput(input, lastSeq, currentServerTick);

    if (res.isValid) {
      this.lastProcessedSequenceMap.set(playerId, input.inputSequence);
    }

    return res;
  }

  public validateShot(
    playerId: string,
    shot: ShotCommand,
    isDead: boolean,
    currentServerTimeMs: number
  ): ValidationResult {
    const lastFire = this.lastFireTimeMap.get(playerId) || 0;
    const res = validateShotCommand(shot, isDead, lastFire, currentServerTimeMs);

    if (res.isValid) {
      this.lastFireTimeMap.set(playerId, currentServerTimeMs);
    }

    return res;
  }

  public calculateServerRewindTime(
    clientFireTime: number,
    currentServerTimeMs: number,
    rttMs: number
  ): number {
    // Estimate shot time: Current Server Time - (RTT / 2)
    const estimatedShotTime = currentServerTimeMs - rttMs / 2;

    // Clamp rewind delay to MAX_REWIND_MS (250ms)
    const maxAllowedAge = currentServerTimeMs - MAX_REWIND_MS;
    return Math.max(maxAllowedAge, estimatedShotTime);
  }

  public removePlayer(playerId: string): void {
    this.lastProcessedSequenceMap.delete(playerId);
    this.lastFireTimeMap.delete(playerId);
  }
}
