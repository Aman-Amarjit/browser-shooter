import RAPIER from '@dimforge/rapier3d-compat';
import { CollisionGroup, GRAVITY, PLAYER_HEIGHT, PLAYER_RADIUS } from '@fps/shared';

export class RapierWorld {
  public world!: RAPIER.World;
  public characterController!: RAPIER.KinematicCharacterController;
  public isInitialized: boolean = false;

  public async init(): Promise<void> {
    try {
      await RAPIER.init();
      const gravity = { x: 0.0, y: GRAVITY, z: 0.0 };
      this.world = new RAPIER.World(gravity);

      // Set up kinematic character controller
      const offset = 0.05;
      this.characterController = this.world.createCharacterController(offset);
      this.characterController.setSlideEnabled(true);
      this.characterController.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
      this.characterController.setMinSlopeSlideAngle((30 * Math.PI) / 180);
      this.characterController.enableAutostep(0.6, 0.25, true);

      this.isInitialized = true;
      console.log('Rapier 3D physics initialized successfully.');
    } catch (err) {
      console.warn('Rapier WASM physics init failed (using kinematic fallback):', err);
      this.isInitialized = false;
    }
  }

  public step(dt: number): void {
    if (!this.isInitialized || !this.world) return;
    this.world.timestep = dt;
    this.world.step();
  }

  public createPlayerBody(initialPos: { x: number; y: number; z: number }): {
    rigidBody: RAPIER.RigidBody | null;
    collider: RAPIER.Collider | null;
  } {
    if (!this.world) {
      return { rigidBody: null, collider: null };
    }
    // Rigid body (Kinematic position based)
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(initialPos.x, initialPos.y, initialPos.z);
    const rigidBody = this.world.createRigidBody(bodyDesc);

    // Capsule collider for player physics
    const halfHeight = (PLAYER_HEIGHT - 2 * PLAYER_RADIUS) / 2;
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, PLAYER_RADIUS)
      .setCollisionGroups((CollisionGroup.PLAYER << 16) | (CollisionGroup.WORLD | CollisionGroup.PLAYER));
    const collider = this.world.createCollider(colliderDesc, rigidBody);

    return { rigidBody, collider };
  }

  public createStaticBox(
    position: { x: number; y: number; z: number },
    size: { x: number; y: number; z: number }
  ): RAPIER.Collider | null {
    if (!this.world) return null;
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z);
    const rigidBody = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setCollisionGroups((CollisionGroup.WORLD << 16) | 0xffff);
    return this.world.createCollider(colliderDesc, rigidBody);
  }
}
