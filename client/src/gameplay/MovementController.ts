import RAPIER from '@dimforge/rapier3d-compat';
import {
  GRAVITY,
  PLAYER_CROUCH_MULTIPLIER,
  PLAYER_HEIGHT,
  PLAYER_JUMP_IMPULSE,
  PLAYER_MAX_SPEED,
  PLAYER_RADIUS,
  PLAYER_SPRINT_MULTIPLIER,
  PlayerInput,
  TEST_MAP,
  Vector3Data
} from '@fps/shared';
import { RapierWorld } from '../physics/RapierWorld.js';

const SLIDE_SPEED     = PLAYER_MAX_SPEED * PLAYER_SPRINT_MULTIPLIER * 1.6; // ~23 m/s burst
const SLIDE_DURATION  = 0.75; // seconds
const SLIDE_MIN_SPEED = 2.5;  // below this cancel slide

export class MovementController {
  public position: Vector3Data = { x: 0, y: 1.0, z: 0 };
  public velocity: Vector3Data = { x: 0, y: 0, z: 0 };
  public isGrounded: boolean = false;
  public isCrouching: boolean = false;
  public isSliding: boolean = false;
  public slideProgress: number = 0;   // 0→1 over slide duration (exposed to camera)

  private slideTimer: number = 0;
  private slideDir: { x: number; z: number } = { x: 0, z: 0 };
  private timeSinceGrounded: number = 0;
  private wasCrouchHeld: boolean = false;
  private wasJumpHeld: boolean = false;

  private rigidBody: RAPIER.RigidBody | null = null;
  private collider: RAPIER.Collider | null = null;

  constructor(private physics: RapierWorld, initialPos: Vector3Data) {
    this.position = { ...initialPos };
    this.initPhysicsBody();
  }

  public initPhysicsBody(): void {
    if (this.physics && this.physics.isInitialized) {
      const { rigidBody, collider } = this.physics.createPlayerBody(this.position);
      this.rigidBody = rigidBody;
      this.collider = collider;
    }
  }

  public dashCooldownTimer: number = 0;
  public justDashed: boolean = false;
  public justJumpPadded: boolean = false;
  public jumpPadPos: Vector3Data | null = null;

  private wasDashHeld: boolean = false;
  private timeSinceJumpPad: number = 0;

  public step(input: PlayerInput, dt: number): Vector3Data {
    this.justDashed = false;
    this.justJumpPadded = false;

    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    }
    this.timeSinceJumpPad += dt;

    // ── Check Jump Pad Collisions ──
    for (const jp of TEST_MAP.jumpPads) {
      const dx = this.position.x - jp.position.x;
      const dz = this.position.z - jp.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.6 && Math.abs(this.position.y - jp.position.y) < 1.5 && this.timeSinceJumpPad > 0.4) {
        this.velocity.y = jp.boostY;
        this.isGrounded = false;
        this.justJumpPadded = true;
        this.jumpPadPos = { ...jp.position };
        this.timeSinceJumpPad = 0;
        break;
      }
    }

    // ── Thruster Air-Dash (Sprint key + double tap or Shift edge while moving) ──
    const sprintEdge = input.sprint && !this.wasDashHeld;
    this.wasDashHeld = input.sprint;

    const isMovingForward = input.forward > 0 || Math.abs(input.strafe) > 0;
    if (sprintEdge && isMovingForward && this.dashCooldownTimer <= 0 && !this.isSliding) {
      const sinYaw = Math.sin(input.yaw);
      const cosYaw = Math.cos(input.yaw);
      const fwd = input.forward !== 0 ? input.forward : 1;
      const dirX = input.strafe * cosYaw - fwd * sinYaw;
      const dirZ = -input.strafe * sinYaw - fwd * cosYaw;
      const len = Math.hypot(dirX, dirZ);

      if (len > 0.001) {
        this.velocity.x = (dirX / len) * (PLAYER_MAX_SPEED * 2.2);
        this.velocity.z = (dirZ / len) * (PLAYER_MAX_SPEED * 2.2);
        this.dashCooldownTimer = 2.5; // 2.5s cooldown
        this.justDashed = true;
      }
    }

    // ── Coyote time & Ground checks ──
    if (this.isGrounded) {
      this.timeSinceGrounded = 0;
    } else {
      this.timeSinceGrounded += dt;
    }

    const canGroundAction = this.isGrounded || this.timeSinceGrounded < 0.15;
    const isSprinting     = input.sprint && isMovingForward;
    const crouchEdge      = input.crouch && !this.wasCrouchHeld;
    const jumpEdge        = input.jump && !this.wasJumpHeld;
    this.wasCrouchHeld    = input.crouch;
    this.wasJumpHeld      = input.jump;

    // ── Slide trigger: (sprint + crouch key) OR (crouch while moving fast) while grounded ──
    if (canGroundAction && !this.isSliding) {
      if ((isSprinting && input.crouch) || (crouchEdge && (isSprinting || Math.hypot(this.velocity.x, this.velocity.z) > PLAYER_MAX_SPEED * 0.9))) {
        this.isSliding  = true;
        this.slideTimer = 0;

        // Calculate locked slide direction from yaw & movement vector
        const sinYaw = Math.sin(input.yaw);
        const cosYaw = Math.cos(input.yaw);
        const fwd    = input.forward !== 0 ? input.forward : 1;
        const dirX   = input.strafe * cosYaw - fwd * sinYaw;
        const dirZ   = -input.strafe * sinYaw - fwd * cosYaw;
        const len    = Math.hypot(dirX, dirZ);

        if (len > 0.001) {
          this.slideDir = { x: dirX / len, z: dirZ / len };
        } else {
          this.slideDir = { x: -sinYaw, z: -cosYaw };
        }
      }
    }

    // ── Slide update & Slide-Jump cancel ──
    let moveSpeed = PLAYER_MAX_SPEED;
    if (this.isSliding) {
      this.slideTimer    += dt;
      this.slideProgress = Math.min(this.slideTimer / SLIDE_DURATION, 1.0);

      // Decelerate slide smoothly
      const t        = this.slideProgress;
      const slideSpd = SLIDE_SPEED * (1.0 - t * t * 0.75);

      // Slide-Jump Cancel: Jump out of slide for extra momentum!
      if (jumpEdge && canGroundAction) {
        this.isSliding     = false;
        this.slideProgress = 0;
        this.velocity.y    = PLAYER_JUMP_IMPULSE * 1.15; // Extra jump height
        this.velocity.x    = this.slideDir.x * slideSpd * 1.1; // Retain slide momentum
        this.velocity.z    = this.slideDir.z * slideSpd * 1.1;
        this.isGrounded    = false;
      } else if (slideSpd < SLIDE_MIN_SPEED || this.slideTimer >= SLIDE_DURATION || (!this.isGrounded && this.timeSinceGrounded > 0.25)) {
        this.isSliding     = false;
        this.slideProgress = 0;
        this.isCrouching   = input.crouch;
      } else {
        // Apply slide velocity
        this.velocity.x  = this.slideDir.x * slideSpd;
        this.velocity.z  = this.slideDir.z * slideSpd;
        this.isCrouching = true;
      }
    } else {
      // Normal movement speed modifiers
      if (input.crouch) {
        this.isCrouching = true;
        moveSpeed *= PLAYER_CROUCH_MULTIPLIER;
      } else {
        this.isCrouching = false;
      }
      if (isSprinting && !this.isCrouching) {
        moveSpeed *= PLAYER_SPRINT_MULTIPLIER;
      }

      // Direction vector from WASD input
      const sinYaw = Math.sin(input.yaw);
      const cosYaw = Math.cos(input.yaw);
      const dirX   = input.strafe * cosYaw - input.forward * sinYaw;
      const dirZ   = -input.strafe * sinYaw - input.forward * cosYaw;
      const length = Math.hypot(dirX, dirZ);

      let targetVelX = 0, targetVelZ = 0;
      if (length > 0.001) {
        targetVelX = (dirX / length) * moveSpeed;
        targetVelZ = (dirZ / length) * moveSpeed;
      }

      const accelRate = this.isGrounded ? 14.0 : 3.5;
      this.velocity.x += (targetVelX - this.velocity.x) * Math.min(dt * accelRate, 1.0);
      this.velocity.z += (targetVelZ - this.velocity.z) * Math.min(dt * accelRate, 1.0);
    }

    // ── Gravity & Normal Jump ──
    if (this.isGrounded && !this.isSliding) {
      if (this.velocity.y < 0) this.velocity.y = -0.5;
      if (jumpEdge) {
        this.velocity.y = PLAYER_JUMP_IMPULSE;
        this.isGrounded = false;
      }
    } else if (!this.isGrounded) {
      this.velocity.y += GRAVITY * dt;
    }

    // ── Movement Integration (Sub-stepped for 100% Solid Collisions) ──
    const SUB_STEPS = 4;
    const dtSub     = dt / SUB_STEPS;

    for (let stepIdx = 0; stepIdx < SUB_STEPS; stepIdx++) {
      const desired = {
        x: this.velocity.x * dtSub,
        y: this.velocity.y * dtSub,
        z: this.velocity.z * dtSub
      };

      if (this.collider && this.rigidBody && this.physics.characterController) {
        this.physics.characterController.computeColliderMovement(this.collider, desired);
        const corrected = this.physics.characterController.computedMovement();

        if (this.velocity.y > 0.1) {
          this.isGrounded = false;
        } else {
          const blockedDown = desired.y < -0.001 && Math.abs(corrected.y - desired.y) > 0.0001;
          this.isGrounded   = blockedDown || (this.position.y <= 1.05);
        }

        this.position.x += corrected.x;
        this.position.y += corrected.y;
        this.position.z += corrected.z;

        // Strict floor height safety clamp so player NEVER sinks down below floor level!
        if (this.position.y < 1.0) {
          this.position.y = 1.0;
          this.isGrounded = true;
          if (this.velocity.y < 0) this.velocity.y = 0;
        }

        this.rigidBody.setNextKinematicTranslation(this.position);
      } else {
        // Kinematic Fallback Integration
        this.position.x += desired.x;
        this.position.y += desired.y;
        this.position.z += desired.z;

        if (this.position.y <= 1.0) {
          this.position.y = 1.0;
          this.isGrounded = true;
          if (this.velocity.y < 0) this.velocity.y = 0;
        }
      }

      // Resolve solid obstacle AABB collisions after each sub-step
      this.resolveObstacleCollisions();
    }

    return this.position;
  }

  private resolveObstacleCollisions(): void {
    const pRadius = PLAYER_RADIUS + 0.05;
    // Player position is FEET position. The capsule extends from y to y+PLAYER_HEIGHT.
    // For collision purposes use the capsule center: y + PLAYER_HEIGHT/2
    const playerHalfH = PLAYER_HEIGHT / 2;
    const mapDef = TEST_MAP;

    // 1. Hard perimeter boundary walls
    const maxBound = mapDef.floorSize.width / 2 - 1.2;
    if (this.position.x > maxBound)  { this.position.x = maxBound;  this.velocity.x = Math.min(0, this.velocity.x); }
    if (this.position.x < -maxBound) { this.position.x = -maxBound; this.velocity.x = Math.max(0, this.velocity.x); }
    if (this.position.z > maxBound)  { this.position.z = maxBound;  this.velocity.z = Math.min(0, this.velocity.z); }
    if (this.position.z < -maxBound) { this.position.z = -maxBound; this.velocity.z = Math.max(0, this.velocity.z); }

    // 2. Map Obstacles Collision Resolution
    for (const obs of mapDef.obstacles) {
      // Skip perimeter walls — they're handled by the boundary clamping above
      if (obs.id.startsWith('wall_')) continue;

      // Obstacle bounds in world space
      const obsMinX = obs.position.x - obs.size.x / 2;
      const obsMaxX = obs.position.x + obs.size.x / 2;
      const obsMinY = obs.position.y - obs.size.y / 2;
      const obsMaxY = obs.position.y + obs.size.y / 2;
      const obsMinZ = obs.position.z - obs.size.z / 2;
      const obsMaxZ = obs.position.z + obs.size.z / 2;

      // Player capsule bounds: feet at this.position.y, head at y+PLAYER_HEIGHT
      const pMinX = this.position.x - pRadius;
      const pMaxX = this.position.x + pRadius;
      const pMinY = this.position.y;                   // feet
      const pMaxY = this.position.y + PLAYER_HEIGHT;   // head
      const pMinZ = this.position.z - pRadius;
      const pMaxZ = this.position.z + pRadius;

      // AABB overlap test
      const overlapX = pMaxX > obsMinX && pMinX < obsMaxX;
      const overlapY = pMaxY > obsMinY && pMinY < obsMaxY;
      const overlapZ = pMaxZ > obsMinZ && pMinZ < obsMaxZ;

      if (!overlapX || !overlapY || !overlapZ) continue;

      // Penetration depth on each axis
      const penLeft   = pMaxX - obsMinX;
      const penRight  = obsMaxX - pMinX;
      const penBottom = pMaxY - obsMinY;  // player top into obs bottom
      const penTop    = obsMaxY - pMinY;  // obs top into player feet
      const penBack   = pMaxZ - obsMinZ;
      const penFront  = obsMaxZ - pMinZ;

      const minPen = Math.min(penLeft, penRight, penBottom, penTop, penBack, penFront);

      if (minPen === penLeft) {
        this.position.x = obsMinX - pRadius;
        if (this.velocity.x > 0) this.velocity.x = 0;
      } else if (minPen === penRight) {
        this.position.x = obsMaxX + pRadius;
        if (this.velocity.x < 0) this.velocity.x = 0;
      } else if (minPen === penTop) {
        // Obstacle top is above player feet → player standing on top of obstacle
        this.position.y = obsMaxY;
        this.isGrounded = true;
        if (this.velocity.y < 0) this.velocity.y = 0;
      } else if (minPen === penBottom) {
        // Player hit obstacle from below (head hit ceiling)
        this.position.y = obsMinY - PLAYER_HEIGHT;
        if (this.velocity.y > 0) this.velocity.y = 0;
      } else if (minPen === penBack) {
        this.position.z = obsMinZ - pRadius;
        if (this.velocity.z > 0) this.velocity.z = 0;
      } else if (minPen === penFront) {
        this.position.z = obsMaxZ + pRadius;
        if (this.velocity.z < 0) this.velocity.z = 0;
      }
    }
  }

  public setPosition(pos: Vector3Data): void {
    this.position = { ...pos };
    if (this.rigidBody) this.rigidBody.setTranslation(pos, true);
  }
}

