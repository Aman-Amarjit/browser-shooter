import * as THREE from 'three';

interface EjectedShell {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVel: THREE.Vector3;
  aliveTime: number;
  maxTime: number;
}

interface ImpactDebris {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  aliveTime: number;
  maxTime: number;
}

interface BulletDecal {
  mesh: THREE.Mesh;
  aliveTime: number;
  maxTime: number;
}

export class ParticleSystem {
  private tracers: { line: THREE.Line; aliveTime: number; maxTime: number }[] = [];
  private shells: EjectedShell[] = [];
  private debris: ImpactDebris[] = [];
  private decals: BulletDecal[] = [];
  private brassMaterial: THREE.MeshStandardMaterial;

  constructor(private scene: THREE.Scene) {
    this.brassMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.95,
      roughness: 0.2,
      transparent: true,   // required so opacity fade-out is visible during ejection
      opacity: 1.0
    });
  }

  public spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const points = [from.clone(), to.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.95
    });

    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, aliveTime: 0, maxTime: 0.12 });
  }

  public spawnEnemyTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const points = [from.clone(), to.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0xff0044,
      linewidth: 3,
      transparent: true,
      opacity: 0.95
    });

    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, aliveTime: 0, maxTime: 0.16 });
  }

  public spawnEjectedShell(worldPos: THREE.Vector3, rightDir: THREE.Vector3, upDir: THREE.Vector3): void {
    const shellGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.035, 8);
    const shellMesh = new THREE.Mesh(shellGeo, this.brassMaterial);
    shellMesh.position.copy(worldPos);
    shellMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    this.scene.add(shellMesh);

    const ejectVel = rightDir.clone().multiplyScalar(2.5 + Math.random() * 0.8)
      .add(upDir.clone().multiplyScalar(1.8 + Math.random() * 0.5));

    const angularVel = new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20
    );

    this.shells.push({
      mesh: shellMesh,
      velocity: ejectVel,
      angularVel,
      aliveTime: 0,
      maxTime: 2.2
    });
  }

  public spawnImpactSparks(point: THREE.Vector3, normal: THREE.Vector3): void {
    // 1. Dynamic Impact Flash Ring & Core
    const flashGeo = new THREE.SphereGeometry(0.16, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(point).addScaledVector(normal, 0.05);
    this.scene.add(flash);

    setTimeout(() => {
      this.scene.remove(flash);
      flashGeo.dispose();
      flashMat.dispose();
    }, 70);

    // 2. Spawn 6-8 Flying Debris Chunks along Surface Normal
    for (let i = 0; i < 7; i++) {
      const size = 0.02 + Math.random() * 0.03;
      const dGeo = new THREE.BoxGeometry(size, size, size);
      const dMat = new THREE.MeshStandardMaterial({
        color: Math.random() > 0.5 ? 0x00f0ff : 0xffaa00,
        emissive: 0x00f0ff,
        emissiveIntensity: 0.8
      });
      const dMesh = new THREE.Mesh(dGeo, dMat);
      dMesh.position.copy(point).addScaledVector(normal, 0.04);
      this.scene.add(dMesh);

      // Random cone velocity around surface normal
      const randVec = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
      const vel = normal.clone().multiplyScalar(3.5 + Math.random() * 3.0).add(randVec);

      this.debris.push({
        mesh: dMesh,
        velocity: vel,
        aliveTime: 0,
        maxTime: 0.8 + Math.random() * 0.4
      });
    }

    // 3. Surface Bullet Hole Decal
    this.spawnBulletDecal(point, normal);
  }

  public spawnBulletDecal(point: THREE.Vector3, normal: THREE.Vector3): void {
    // Keep max 40 active decals
    if (this.decals.length > 40) {
      const old = this.decals.shift();
      if (old) {
        this.scene.remove(old.mesh);
        old.mesh.geometry.dispose();
        (old.mesh.material as THREE.Material).dispose();
      }
    }

    const decalGeo = new THREE.RingGeometry(0.02, 0.12, 12);
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });

    const decalMesh = new THREE.Mesh(decalGeo, decalMat);
    decalMesh.position.copy(point).addScaledVector(normal, 0.008);

    // Orient decal ring parallel to surface normal
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    const quat = new THREE.Quaternion().setFromUnitVectors(defaultNormal, normal.clone().normalize());
    decalMesh.quaternion.copy(quat);

    this.scene.add(decalMesh);
    this.decals.push({
      mesh: decalMesh,
      aliveTime: 0,
      maxTime: 6.0
    });
  }

  public spawnExplosionEffect(point: THREE.Vector3): void {
    // 1. Fiery Expansion Sphere
    const sphereGeo = new THREE.SphereGeometry(0.8, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      emissive: 0xffaa00,
      emissiveIntensity: 3.0,
      transparent: true,
      opacity: 0.9
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.copy(point);
    this.scene.add(sphere);

    // Animate expanding sphere
    let t = 0;
    const interval = setInterval(() => {
      t += 0.05;
      const s = 1.0 + t * 7.0;
      sphere.scale.set(s, s, s);
      sphereMat.opacity = Math.max(0, 0.9 - t * 1.8);
      if (t >= 0.5) {
        clearInterval(interval);
        this.scene.remove(sphere);
        sphereGeo.dispose();
        sphereMat.dispose();
      }
    }, 16);

    // 2. 16 Explosive Flying Debris Chunks
    for (let i = 0; i < 16; i++) {
      const size = 0.06 + Math.random() * 0.08;
      const dGeo = new THREE.BoxGeometry(size, size, size);
      const dMat = new THREE.MeshStandardMaterial({
        color: Math.random() > 0.4 ? 0xff0055 : 0xffaa00,
        emissive: 0xff0044,
        emissiveIntensity: 1.5
      });
      const dMesh = new THREE.Mesh(dGeo, dMat);
      dMesh.position.copy(point);
      this.scene.add(dMesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 12.0,
        4.0 + Math.random() * 8.0,
        (Math.random() - 0.5) * 12.0
      );

      this.debris.push({
        mesh: dMesh,
        velocity: vel,
        aliveTime: 0,
        maxTime: 1.2 + Math.random() * 0.5
      });
    }
  }

  public spawnJumpPadEffect(point: THREE.Vector3): void {
    const ringGeo = new THREE.RingGeometry(0.3, 1.4, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(point).setY(point.y + 0.1);
    this.scene.add(ring);

    let t = 0;
    const interval = setInterval(() => {
      t += 0.04;
      ring.position.y += 0.4;
      ringMat.opacity = Math.max(0, 0.95 - t * 3.5);
      if (t >= 0.3) {
        clearInterval(interval);
        this.scene.remove(ring);
        ringGeo.dispose();
        ringMat.dispose();
      }
    }, 16);
  }

  public update(dt: number): void {
    // 1. Update Tracer Lines
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.aliveTime += dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = 1 - (t.aliveTime / t.maxTime);

      if (t.aliveTime >= t.maxTime) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }

    // 2. Update Ejected Shell Casings
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.aliveTime += dt;
      s.velocity.y -= 14.0 * dt;

      s.mesh.position.addScaledVector(s.velocity, dt);
      s.mesh.rotation.x += s.angularVel.x * dt;
      s.mesh.rotation.y += s.angularVel.y * dt;

      if (s.mesh.position.y <= 0.02 && s.velocity.y < 0) {
        s.velocity.y = -s.velocity.y * 0.45;
        s.velocity.x *= 0.6;
        s.velocity.z *= 0.6;
        s.mesh.position.y = 0.02;
      }

      if (s.aliveTime > s.maxTime - 0.5) {
        const fade = (s.maxTime - s.aliveTime) / 0.5;
        (s.mesh.material as THREE.Material).opacity = Math.max(0, fade);
      }

      if (s.aliveTime >= s.maxTime) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        this.shells.splice(i, 1);
      }
    }

    // 3. Update Impact Debris Chunks
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.aliveTime += dt;
      d.velocity.y -= 16.0 * dt;
      d.mesh.position.addScaledVector(d.velocity, dt);

      if (d.mesh.position.y <= 0.02) {
        d.mesh.position.y = 0.02;
        d.velocity.set(0, 0, 0);
      }

      if (d.aliveTime >= d.maxTime) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.debris.splice(i, 1);
      }
    }

    // 4. Update Bullet Decals Fadeout
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const dec = this.decals[i];
      dec.aliveTime += dt;

      if (dec.aliveTime > dec.maxTime - 1.5) {
        const fade = (dec.maxTime - dec.aliveTime) / 1.5;
        (dec.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, fade);
      }

      if (dec.aliveTime >= dec.maxTime) {
        this.scene.remove(dec.mesh);
        dec.mesh.geometry.dispose();
        (dec.mesh.material as THREE.Material).dispose();
        this.decals.splice(i, 1);
      }
    }
  }
}
