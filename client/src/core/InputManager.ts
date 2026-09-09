import { PlayerInput } from '@fps/shared';

export class InputManager {
  public yaw: number = 0;
  public pitch: number = 0;

  private keys: Record<string, boolean> = {};
  private mouseButtons: Record<number, boolean> = {};
  private inputSequence: number = 0;
  public isLocked: boolean = false;

  private sensitivity: number = 0.0022;

  constructor(private domElement: HTMLElement) {
    this.setupListeners();
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code.toLowerCase()] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code.toLowerCase()] = false;
    });

    window.addEventListener('mousedown', (e) => {
      this.mouseButtons[e.button] = true;
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseButtons[e.button] = false;
    });

    window.addEventListener('blur', () => {
      this.keys = {};
      this.mouseButtons = {};
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;

      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;

      // Clamp pitch between -89 deg and +89 deg
      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    });
  }

  public requestPointerLock(): void {
    try {
      if (this.domElement && typeof this.domElement.requestPointerLock === 'function') {
        this.domElement.requestPointerLock();
      } else if (document.body && typeof document.body.requestPointerLock === 'function') {
        document.body.requestPointerLock();
      }
    } catch (err) {
      console.warn('Pointer lock request ignored:', err);
    }
  }

  public getPlayerInput(): PlayerInput {
    this.inputSequence++;

    let forward = 0;
    let strafe = 0;

    if (this.keys['keyw']) forward += 1;
    if (this.keys['keys']) forward -= 1;
    if (this.keys['keyd']) strafe += 1;
    if (this.keys['keya']) strafe -= 1;

    let weaponSlot = 1;
    if (this.keys['digit1']) weaponSlot = 1;
    if (this.keys['digit2']) weaponSlot = 2;
    if (this.keys['digit3']) weaponSlot = 3;
    if (this.keys['digit4']) weaponSlot = 4;
    if (this.keys['digit5']) weaponSlot = 5;

    return {
      inputSequence: this.inputSequence,
      clientTimeMs: performance.now(),
      forward,
      strafe,
      yaw: this.yaw,
      pitch: this.pitch,
      jump: !!this.keys['space'],
      crouch: !!this.keys['keyc'] || !!this.keys['controlleft'] || !!this.keys['controlright'],
      sprint: !!this.keys['shiftleft'] || !!this.keys['shiftright'],
      fire: !!this.mouseButtons[0],
      reload: !!this.keys['keyr'],
      weaponSlot
    };
  }

  public isADS(): boolean {
    return !!this.mouseButtons[2];
  }
}

