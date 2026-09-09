import { type Client, Room } from '@colyseus/core';
import {
  ARMOR_ABSORPTION_RATIO,
  CollisionGroup,
  DamageResult,
  GamePhase,
  HitRegion,
  HITBOX_MULTIPLIERS,
  MAX_HEALTH,
  PlayerInput,
  RoomMessageKey,
  ShotCommand,
  TEST_MAP,
  TICK_INTERVAL_MS,
  WEAPON_DEFINITIONS
} from '@fps/shared';
import { ServerPhysics } from '../../physics/ServerPhysics.js';
import { MatchStateMachine } from '../../state/MatchStateMachine.js';
import { ServerGuard } from '../../validation/ServerGuard.js';
import { GameStateSchema, PlayerSchema } from './schemas/GameStateSchema.js';

export class FPSGameRoom extends Room<GameStateSchema> {
  public maxClients = 12;
  private physics: ServerPhysics = new ServerPhysics();
  private stateMachine: MatchStateMachine = new MatchStateMachine();
  private guard: ServerGuard = new ServerGuard();

  private serverTick = 0;
  private startTimeMs = Date.now();

  async onCreate(options: any) {
    this.setState(new GameStateSchema());

    // 1. Initialize Server Rapier WASM Physics
    await this.physics.init();

    // 2. Start Match State Machine
    this.stateMachine.transitionTo(GamePhase.WARMUP, 30);

    // 3. Register Room Message Handlers
    this.onMessage(RoomMessageKey.PLAYER_INPUT, (client, input: PlayerInput) => {
      this.handlePlayerInput(client, input);
    });

    this.onMessage(RoomMessageKey.SHOT_COMMAND, (client, shot: ShotCommand) => {
      this.handleShotCommand(client, shot);
    });

    // 4. Set Fixed 60Hz Simulation Tick Loop
    this.setSimulationInterval((deltaTimeMs) => {
      this.updateSimulation(deltaTimeMs / 1000);
    }, TICK_INTERVAL_MS);
  }

  onJoin(client: Client, options: any) {
    console.log(`[FPSGameRoom] Player joined: ${client.sessionId}`);

    // Assign Team (Alternating Red/Blue)
    const team = this.state.players.size % 2 === 0 ? 'red' : 'blue';
    const spawnIndex = this.state.players.size % TEST_MAP.spawnPoints.length;
    const spawnPos = TEST_MAP.spawnPoints[spawnIndex].position;

    // Create Schema state
    const playerSchema = new PlayerSchema();
    playerSchema.id = client.sessionId;
    playerSchema.x = spawnPos.x;
    playerSchema.y = spawnPos.y;
    playerSchema.z = spawnPos.z;
    playerSchema.team = team;
    playerSchema.health = MAX_HEALTH;
    playerSchema.armor = 100;

    this.state.players.set(client.sessionId, playerSchema);

    // Add to Server Rapier physics world
    this.physics.addPlayer(client.sessionId, spawnPos);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`[FPSGameRoom] Player left: ${client.sessionId}`);
    this.state.players.delete(client.sessionId);
    this.physics.removePlayer(client.sessionId);
    this.guard.removePlayer(client.sessionId);
  }

  private handlePlayerInput(client: Client, input: PlayerInput) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.isDead) return;

    // Validate Input with ServerGuard
    const validation = this.guard.validateInput(client.sessionId, input, this.serverTick);
    if (!validation.isValid) return;

    // Calculate Movement vector
    const speed = 7.5 * (input.sprint ? 1.4 : input.crouch ? 0.5 : 1.0);
    const sinYaw = Math.sin(input.yaw);
    const cosYaw = Math.cos(input.yaw);

    const dirX = input.strafe * cosYaw - input.forward * sinYaw;
    const dirZ = -input.strafe * sinYaw - input.forward * cosYaw;

    const len = Math.hypot(dirX, dirZ);
    if (len > 0.001) {
      player.vx = (dirX / len) * speed;
      player.vz = (dirZ / len) * speed;
    } else {
      player.vx = 0;
      player.vz = 0;
    }

    player.yaw = input.yaw;
    player.pitch = input.pitch;
    this.state.lastProcessedInput = input.inputSequence;
  }

  private handleShotCommand(client: Client, shot: ShotCommand) {
    const attacker = this.state.players.get(client.sessionId);
    if (!attacker || attacker.isDead) return;

    const now = Date.now() - this.startTimeMs;
    const validation = this.guard.validateShot(
      client.sessionId,
      shot,
      attacker.isDead,
      now
    );
    if (!validation.isValid) return;

    const weaponDef = WEAPON_DEFINITIONS[shot.weaponId];
    if (!weaponDef) return;

    // Server-derived lag compensation rewind time
    const rewindTimeMs = this.guard.calculateServerRewindTime(
      shot.clientFireTime,
      now,
      (client as any).ping || 30
    );

    // Perform Raycast check against all target hitboxes
    for (const [targetId, target] of this.state.players.entries()) {
      if (targetId === client.sessionId || target.isDead || target.team === attacker.team) {
        continue;
      }

      // Retrieve target's historical pose at rewindTimeMs
      const historyBuffer = this.physics.getHistoryBuffer(targetId);
      const pose = historyBuffer ? historyBuffer.getRewindPose(rewindTimeMs) : null;
      const targetPos = pose ? pose.rootPosition : { x: target.x, y: target.y, z: target.z };

      // Simple raycast sphere distance test to target center
      const toTarget = {
        x: targetPos.x - shot.origin.x,
        y: targetPos.y + 0.9 - shot.origin.y,
        z: targetPos.z - shot.origin.z
      };

      const dot =
        toTarget.x * shot.direction.x +
        toTarget.y * shot.direction.y +
        toTarget.z * shot.direction.z;

      if (dot > 0 && dot <= weaponDef.range) {
        const perpDistSq =
          (toTarget.x * toTarget.x + toTarget.y * toTarget.y + toTarget.z * toTarget.z) -
          dot * dot;

        // Hitbox collision radius ~0.45m
        if (perpDistSq <= 0.20) {
          // Determine HitRegion (Headshot check if hit height > 1.4m)
          const hitHeight = shot.origin.y + shot.direction.y * dot - targetPos.y;
          const hitRegion = hitHeight > 1.3 ? HitRegion.HEAD : HitRegion.CHEST;
          const multiplier = HITBOX_MULTIPLIERS[hitRegion] || 1.0;

          const rawDamage = weaponDef.damage * multiplier;

          // Apply Armor reduction formula (60% absorbed by armor)
          let absorbed = 0;
          let healthDamage = rawDamage;

          if (target.armor > 0) {
            absorbed = Math.min(target.armor, rawDamage * ARMOR_ABSORPTION_RATIO);
            target.armor -= absorbed;
            healthDamage = rawDamage - absorbed;
          }

          target.health = Math.max(0, target.health - healthDamage);
          attacker.damageDealt += Math.round(rawDamage);

          const isFatal = target.health <= 0;
          if (isFatal) {
            target.isDead = true;
            target.deaths++;
            attacker.kills++;

            // Broadcast Killfeed event
            this.broadcast(RoomMessageKey.KILLFEED_EVENT, {
              killerId: attacker.id,
              killerName: `PLAYER ${attacker.id.slice(0, 4)}`,
              victimId: target.id,
              victimName: `PLAYER ${target.id.slice(0, 4)}`,
              weaponId: weaponDef.id,
              isHeadshot: hitRegion === HitRegion.HEAD
            });

            // Schedule Respawn after 3 seconds
            setTimeout(() => {
              target.health = MAX_HEALTH;
              target.armor = 100;
              target.isDead = false;
              target.x = TEST_MAP.spawnPoints[0].position.x;
              target.y = TEST_MAP.spawnPoints[0].position.y;
              target.z = TEST_MAP.spawnPoints[0].position.z;
              this.physics.setPlayerPosition(target.id, { x: target.x, y: target.y, z: target.z });
            }, 3000);
          }

          // Send Hitmarker confirmation to shooter
          client.send(RoomMessageKey.HITMARKER_EVENT, {
            targetId,
            damageDealt: Math.round(rawDamage),
            isHeadshot: hitRegion === HitRegion.HEAD,
            isFatal
          });

          break; // Stop after hitting first target
        }
      }
    }
  }

  private updateSimulation(dt: number) {
    this.serverTick++;
    const now = Date.now() - this.startTimeMs;

    this.state.serverTick = this.serverTick;
    this.state.serverTimeMs = now;
    this.state.matchPhase = this.stateMachine.phase;
    this.state.phaseRemainingSeconds = this.stateMachine.remainingSeconds;

    // Step physics & update state positions
    this.physics.step(dt, this.serverTick, now);

    for (const [id, player] of this.state.players.entries()) {
      if (player.isDead) continue;

      player.x += player.vx * dt;
      player.z += player.vz * dt;

      this.physics.setPlayerPosition(id, { x: player.x, y: player.y, z: player.z });
    }
  }
}
