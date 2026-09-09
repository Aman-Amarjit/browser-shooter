import { PlayerInput, ShotCommand, SnapshotState } from './types.js';

export enum RoomMessageKey {
  PLAYER_INPUT = "player_input",
  SHOT_COMMAND = "shot_command",
  RELOAD_REQUEST = "reload_request",
  SWITCH_WEAPON = "switch_weapon",
  HITMARKER_EVENT = "hitmarker_event",
  KILLFEED_EVENT = "killfeed_event",
  DESYNC_ALERT = "desync_alert"
}

export interface HitmarkerPayload {
  targetId: string;
  damageDealt: number;
  isHeadshot: boolean;
  isFatal: boolean;
}

export interface KillfeedPayload {
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  weaponId: string;
  isHeadshot: boolean;
}

export interface ClientToServerMessages {
  [RoomMessageKey.PLAYER_INPUT]: PlayerInput;
  [RoomMessageKey.SHOT_COMMAND]: ShotCommand;
  [RoomMessageKey.RELOAD_REQUEST]: { weaponId: string };
  [RoomMessageKey.SWITCH_WEAPON]: { weaponSlot: number };
}

export interface ServerToClientMessages {
  [RoomMessageKey.HITMARKER_EVENT]: HitmarkerPayload;
  [RoomMessageKey.KILLFEED_EVENT]: KillfeedPayload;
  [RoomMessageKey.DESYNC_ALERT]: { predictedSequence: number; errorDistanceMeters: number };
}
