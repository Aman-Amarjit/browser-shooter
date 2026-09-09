import RAPIER from '@dimforge/rapier3d-compat';
import { CollisionGroup, GRAVITY, HitRegion, TEST_MAP, Vector3Data } from '@fps/shared';
import { HistoryBuffer } from './HistoryBuffer.js';

export class ServerPhysics {
  public world!: RAPIER.World;
  public characterController!: RAPIER.KinematicCharacterController;
  public isInitialized: boolean = false;

  private playerBodies: Map<string, RAPIER.RigidBody> = new Map();
  private playerColliders: Map<string, RAPIER.Collider> = new Map();
  private historyBuffers: Map<string, HistoryBuffer> = new Map();

  public async init(): Promise<void> {
    await RAPIER.init();
    
    const gravity = { x: 0.0, y: GRAVITY, z: 0.0 };
    this.world = new RAPIER.World(gravity);

    // Setup kinematic controller
    this.characterController = this.world.createCharacterController(0.05);
    this.characterController.setSlideEnabled(true);

    // Build static environment colliders from TEST_MAP
    this.buildMapColliders();

    this.isInitialized = true;
  }

  private buildMapColliders(): void {
    // Floor
    const floorBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        TEST_MAP.floorSize.width / 2,
        0.5,
        TEST_MAP.floorSize.length / 2
      ).setCollisionGroups((CollisionGroup.WORLD << 16) | 0xffff),
      floorBody
    );

    // Obstacles
    for (const obs of TEST_MAP.obstacles) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(
          obs.position.x,
          obs.position.y,
          obs.position.z
        )
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(obs.size.x / 2, obs.size.y / 2, obs.size.z / 2)
          .setCollisionGroups((CollisionGroup.WORLD << 16) | 0xffff),
        body
      );
    }
  }

  public addPlayer(id: string, initialPos: Vector3Data): void {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(initialPos.x, initialPos.y, initialPos.z);
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.4)
      .setCollisionGroups((CollisionGroup.PLAYER << 16) | (CollisionGroup.WORLD | CollisionGroup.PLAYER));
    const collider = this.world.createCollider(colliderDesc, body);

    this.playerBodies.set(id, body);
    this.playerColliders.set(id, collider);
    this.historyBuffers.set(id, new HistoryBuffer());
  }

  public removePlayer(id: string): void {
    const body = this.playerBodies.get(id);
    if (body) {
      this.world.removeRigidBody(body);
      this.playerBodies.delete(id);
      this.playerColliders.delete(id);
      this.historyBuffers.delete(id);
    }
  }

  public step(dt: number, serverTick: number, serverTimeMs: number): void {
    if (!this.isInitialized) return;

    this.world.timestep = dt;
    this.world.step();

    // Record historical poses for lag compensation rewind
    for (const [id, body] of this.playerBodies.entries()) {
      const pos = body.translation();
      const rot = body.rotation();
      const buffer = this.historyBuffers.get(id);

      if (buffer) {
        // Generate per-region hitbox transforms
        const hitboxTransforms: Record<HitRegion, any> = {
          [HitRegion.HEAD]: { position: { x: pos.x, y: pos.y + 0.7, z: pos.z }, rotation: rot },
          [HitRegion.CHEST]: { position: { x: pos.x, y: pos.y + 0.3, z: pos.z }, rotation: rot },
          [HitRegion.PELVIS]: { position: { x: pos.x, y: pos.y, z: pos.z }, rotation: rot },
          [HitRegion.LEFT_ARM]: { position: { x: pos.x - 0.4, y: pos.y + 0.3, z: pos.z }, rotation: rot },
          [HitRegion.RIGHT_ARM]: { position: { x: pos.x + 0.4, y: pos.y + 0.3, z: pos.z }, rotation: rot },
          [HitRegion.LEFT_LEG]: { position: { x: pos.x - 0.2, y: pos.y - 0.5, z: pos.z }, rotation: rot },
          [HitRegion.RIGHT_LEG]: { position: { x: pos.x + 0.2, y: pos.y - 0.5, z: pos.z }, rotation: rot }
        };

        buffer.addPose({
          tick: serverTick,
          timestamp: serverTimeMs,
          rootPosition: { x: pos.x, y: pos.y, z: pos.z },
          rootRotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
          hitboxTransforms
        });
      }
    }
  }

  public getHistoryBuffer(id: string): HistoryBuffer | undefined {
    return this.historyBuffers.get(id);
  }

  public setPlayerPosition(id: string, pos: Vector3Data): void {
    const body = this.playerBodies.get(id);
    if (body) {
      body.setTranslation(pos, true);
    }
  }
}
