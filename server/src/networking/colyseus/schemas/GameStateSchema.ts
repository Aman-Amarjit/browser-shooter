import { MapSchema, Schema, type } from '@colyseus/schema';

export class PlayerSchema extends Schema {
  @type('string') id: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') z: number = 0;
  @type('number') vx: number = 0;
  @type('number') vy: number = 0;
  @type('number') vz: number = 0;
  @type('number') yaw: number = 0;
  @type('number') pitch: number = 0;
  @type('number') health: number = 100;
  @type('number') armor: number = 100;
  @type('string') activeWeaponId: string = 'assault_rifle';
  @type('number') ammo: number = 30;
  @type('string') team: string = 'red';
  @type('boolean') isDead: boolean = false;
  @type('number') kills: number = 0;
  @type('number') deaths: number = 0;
  @type('number') damageDealt: number = 0;
}

export class GameStateSchema extends Schema {
  @type('number') serverTick: number = 0;
  @type('number') serverTimeMs: number = 0;
  @type('number') lastProcessedInput: number = 0;
  @type('number') redScore: number = 0;
  @type('number') blueScore: number = 0;
  @type('string') matchPhase: string = 'warmup';
  @type('number') phaseRemainingSeconds: number = 600;
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
}
