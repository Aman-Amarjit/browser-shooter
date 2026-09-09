export class Time {
  public delta: number = 0;
  public elapsed: number = 0;
  private lastTime: number = performance.now();

  public update(): void {
    const now = performance.now();
    this.delta = Math.min((now - this.lastTime) / 1000, 0.1); // Clamp max dt to 100ms
    this.elapsed += this.delta;
    this.lastTime = now;
  }
}
