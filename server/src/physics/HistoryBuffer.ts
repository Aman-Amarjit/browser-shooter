import { HistoricalPose, HitRegion, MAX_REWIND_MS, TransformData, Vector3Data } from '@fps/shared';

export class HistoryBuffer {
  private poses: HistoricalPose[] = [];

  public addPose(pose: HistoricalPose): void {
    this.poses.push(pose);
    
    // Prune entries older than MAX_REWIND_MS + 50ms buffer
    const cutoffTime = pose.timestamp - (MAX_REWIND_MS + 50);
    while (this.poses.length > 0 && this.poses[0].timestamp < cutoffTime) {
      this.poses.shift();
    }
  }

  public getRewindPose(targetTimestamp: number): HistoricalPose | null {
    if (this.poses.length === 0) return null;

    // Clamp to oldest available pose if target is beyond window (Max rewind check)
    if (targetTimestamp <= this.poses[0].timestamp) {
      return this.poses[0];
    }

    // Return newest if target is in the future
    if (targetTimestamp >= this.poses[this.poses.length - 1].timestamp) {
      return this.poses[this.poses.length - 1];
    }

    // Binary search / Lerp between bounding historical poses
    for (let i = 0; i < this.poses.length - 1; i++) {
      const p0 = this.poses[i];
      const p1 = this.poses[i + 1];

      if (targetTimestamp >= p0.timestamp && targetTimestamp <= p1.timestamp) {
        const factor = (targetTimestamp - p0.timestamp) / (p1.timestamp - p0.timestamp);
        return this.interpolatePose(p0, p1, factor);
      }
    }

    return this.poses[this.poses.length - 1];
  }

  private interpolatePose(p0: HistoricalPose, p1: HistoricalPose, f: number): HistoricalPose {
    const rootPos: Vector3Data = {
      x: p0.rootPosition.x + (p1.rootPosition.x - p0.rootPosition.x) * f,
      y: p0.rootPosition.y + (p1.rootPosition.y - p0.rootPosition.y) * f,
      z: p0.rootPosition.z + (p1.rootPosition.z - p0.rootPosition.z) * f
    };

    const hitboxTransforms: Record<HitRegion, TransformData> = {} as any;
    for (const region of Object.values(HitRegion)) {
      const t0 = p0.hitboxTransforms[region];
      const t1 = p1.hitboxTransforms[region];

      if (t0 && t1) {
        hitboxTransforms[region] = {
          position: {
            x: t0.position.x + (t1.position.x - t0.position.x) * f,
            y: t0.position.y + (t1.position.y - t0.position.y) * f,
            z: t0.position.z + (t1.position.z - t0.position.z) * f
          },
          rotation: t1.rotation // Quaternion slerp fallback
        };
      }
    }

    return {
      tick: p0.tick,
      timestamp: p0.timestamp + (p1.timestamp - p0.timestamp) * f,
      rootPosition: rootPos,
      rootRotation: p1.rootRotation,
      hitboxTransforms
    };
  }
}
