import * as THREE from 'three';
import { PLAYER_EYE_HEIGHT, Vector3Data } from '@fps/shared';

export class CameraController {
  private bobTimer: number = 0;
  private currentFov: number = 75;
  private targetFov: number = 75;
  private currentRoll: number = 0;       // Z-roll for slide tilt
  private currentEyeOffset: number = PLAYER_EYE_HEIGHT;  // Y offset for eye height

  constructor(private camera: THREE.PerspectiveCamera) {}

  public update(
    position: Vector3Data,
    yaw: number,
    pitch: number,
    isMoving: boolean,
    isCrouching: boolean,
    isADS: boolean,
    dt: number,
    isSliding: boolean = false,
    slideProgress: number = 0
  ): void {
    // 1. Rotation: yaw + pitch + slide roll
    const targetRoll = isSliding ? -0.22 : 0;  // tilt left during slide
    this.currentRoll += (targetRoll - this.currentRoll) * Math.min(dt * 14.0, 1.0);

    const euler = new THREE.Euler(pitch, yaw, this.currentRoll, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // 2. Eye height: slide = low crouch
    const normalEye  = PLAYER_EYE_HEIGHT;
    const crouchEye  = PLAYER_EYE_HEIGHT * 0.55;
    const slideEye   = PLAYER_EYE_HEIGHT * 0.40;  // lower than crouch
    const targetEyeH = isSliding ? slideEye : isCrouching ? crouchEye : normalEye;
    this.currentEyeOffset += (targetEyeH - this.currentEyeOffset) * Math.min(dt * 14.0, 1.0);

    // 3. Head bob
    let bobX = 0, bobY = 0;
    if (isMoving && !isSliding) {
      const bobRate = isCrouching ? 6.0 : 12.0;
      this.bobTimer += dt * bobRate;
      bobY = Math.sin(this.bobTimer) * 0.035;
      bobX = Math.cos(this.bobTimer * 0.5) * 0.018;
    } else {
      this.bobTimer = 0;
    }

    this.camera.position.set(
      position.x + bobX,
      position.y + this.currentEyeOffset + bobY,
      position.z
    );

    // 4. FOV: ADS narrows, slide widens slightly for speed feel
    const targetFovBase = isADS ? 45 : 75;
    this.targetFov = isSliding ? targetFovBase + 8 : targetFovBase;
    this.currentFov += (this.targetFov - this.currentFov) * Math.min(dt * 14.0, 1.0);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
  }
}
