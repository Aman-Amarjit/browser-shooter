import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TEST_MAP } from '@fps/shared';
import { RapierWorld } from '../physics/RapierWorld.js';

// ─── Animated object handles ────────────────────────────────────────────────
interface SpireAnim    { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; phase: number; speed: number; baseIntensity: number }
interface WaterAnim    { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; }
interface JumpPadAnim  { arrow: THREE.Mesh; ring: THREE.Mesh; phase: number }
interface NeonSignAnim { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; phase: number; colorA: THREE.Color; colorB: THREE.Color }
interface HoloOrb      { group: THREE.Group; phase: number; orbitRadius: number; orbitSpeed: number; bobSpeed: number }
interface WindowLight  { mat: THREE.MeshStandardMaterial; phase: number; row: number; col: number }
interface CityVehicle  { group: THREE.Group; lane: number; speed: number; progress: number; axis: 'x' | 'z'; direction: 1 | -1 }

// ─── Seeded PRNG so the city layout is deterministic ─────────────────────────
function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

export class MapBuilder {
  public mapGroup: THREE.Group;

  // Animation lists — updated every frame via update()
  private spireAnims:    SpireAnim[]    = [];
  private waterAnims:    WaterAnim[]    = [];
  private jumpPadAnims:  JumpPadAnim[]  = [];
  private neonSignAnims: NeonSignAnim[] = [];
  private holoOrbs:      HoloOrb[]      = [];
  private buildingMats:  THREE.MeshStandardMaterial[] = [];
  private starField:     THREE.Points   | null = null;
  // City-specific animation lists
  private windowLights:  WindowLight[]  = [];
  private cityVehicles:  CityVehicle[]  = [];
  private trafficLights: { group: THREE.Group; phase: number; redMat: THREE.MeshStandardMaterial; greenMat: THREE.MeshStandardMaterial }[] = [];
  // Frame counter for throttled updates
  private frameCount: number = 0;

  constructor(private scene: THREE.Scene, private physics: RapierWorld) {
    this.mapGroup = new THREE.Group();

    // Realistic atmospheric haze — matches Renderer's linear fog colour
    this.scene.fog = new THREE.Fog(0xa8c0d0, 80, 380);

    this.buildRealisticSky();
    this.buildMap();
    this.buildProceduralCity();
    this.loadSydneyCityModel();
    // Holographic orbs removed — not realistic

    this.scene.add(this.mapGroup);
  }

  // ─── MAIN UPDATE — call this from game loop ────────────────────────────────
  public update(elapsed: number): void {
    const t = elapsed;
    this.frameCount++;
    const f = this.frameCount;

    // 1. Spire pulse — every frame (only ~10 objects)
    for (const s of this.spireAnims) {
      const pulse = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
      s.mat.emissiveIntensity = s.baseIntensity * (0.6 + 0.4 * pulse);
      s.mesh.rotation.y += 0.008;
    }

    // 2. Water UV scroll — every frame
    for (const w of this.waterAnims) {
      if (w.mat.map) {
        w.mat.map.offset.x = (t * 0.012) % 1;
        w.mat.map.offset.y = (t * 0.008) % 1;
      }
    }

    // 3. Jump pad arrow bob + ring spin — every frame
    for (const jp of this.jumpPadAnims) {
      jp.arrow.position.y = 0.5 + Math.sin(t * 3.0 + jp.phase) * 0.18;
      jp.ring.rotation.z  = t * 1.2 + jp.phase;
      const glow = 1.5 + Math.sin(t * 4.0 + jp.phase) * 0.5;
      (jp.arrow.material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
    }

    // 4. Neon sign flicker — every 3rd frame (20 Hz, imperceptible difference)
    if (f % 3 === 0) {
      for (const ns of this.neonSignAnims) {
        const flicker = 0.75 + 0.25 * Math.sin(t * (5.0 + Math.sin(ns.phase)) + ns.phase);
        ns.mat.emissiveIntensity = flicker * 1.8;
        const lerpFactor = 0.5 + 0.5 * Math.sin(t * 0.4 + ns.phase);
        ns.mat.emissive.lerpColors(ns.colorA, ns.colorB, lerpFactor);
      }
    }

    // 5. Holographic orbs orbit + bob — every frame (only 5)
    for (const orb of this.holoOrbs) {
      const angle = t * orb.orbitSpeed + orb.phase;
      orb.group.position.x = Math.cos(angle) * orb.orbitRadius;
      orb.group.position.z = Math.sin(angle) * orb.orbitRadius;
      orb.group.position.y = 18 + Math.sin(t * orb.bobSpeed + orb.phase) * 3.5;
      orb.group.rotation.y = t * 1.1 + orb.phase;
      orb.group.rotation.x = t * 0.7 + orb.phase * 0.5;
    }

    // 6. Building emissive breathe — every 4th frame (slow 0.35 Hz sine, ~15fps update fine)
    if (f % 4 === 0) {
      const buildingBreath = 0.28 + 0.06 * Math.sin(t * 0.35);
      for (const mat of this.buildingMats) {
        mat.emissiveIntensity = buildingBreath;
      }
    }

    // 7. Starfield slow drift — every frame
    if (this.starField) {
      this.starField.rotation.y = t * 0.00012;
    }

    // 8. Window lights flicker — every 6th frame (10 Hz is plenty for office windows)
    if (f % 6 === 0) {
      for (const w of this.windowLights) {
        const flicker = Math.sin(t * 0.6 + w.phase) > 0.3 ? 1.0 : 0.0;
        w.mat.emissiveIntensity = flicker * (0.8 + 0.2 * Math.sin(t * 3.5 + w.phase));
      }
    }

    // 9. City vehicles — every 2nd frame (30 fps motion fine for background cars)
    if (f % 2 === 0) {
      const CITY_HALF = 95;
      const span = CITY_HALF * 2;
      for (const v of this.cityVehicles) {
        v.progress += v.speed * 0.033;
        if (v.progress > span) v.progress -= span;
        const pos = -CITY_HALF + v.progress;
        if (v.axis === 'x') {
          v.group.position.x = v.direction === 1 ? pos : -pos;
        } else {
          v.group.position.z = v.direction === 1 ? pos : -pos;
        }
      }
    }

    // 10. Traffic lights — every 10th frame (100ms steps are fine for a light cycle)
    if (f % 10 === 0) {
      for (const tl of this.trafficLights) {
        const cycle = (t + tl.phase) % 8.0;
        const isRed = cycle < 4.0;
        tl.redMat.emissiveIntensity   = isRed  ? 3.5 : 0.1;
        tl.greenMat.emissiveIntensity = !isRed ? 3.5 : 0.1;
      }
    }
  }

  // ─── HOLOGRAPHIC FLOATING ORBS ────────────────────────────────────────────
  private spawnHolographicOrbs(): void {
    const orbColors = [0x00f0ff, 0xff0055, 0xffaa00, 0xa855f7, 0x38bdf8];

    for (let i = 0; i < 5; i++) {
      const group = new THREE.Group();
      const color = orbColors[i % orbColors.length];

      // Core sphere
      const coreGeo = new THREE.IcosahedronGeometry(1.2, 2);
      const coreMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 2.2,
        metalness: 0.6,
        roughness: 0.2,
        transparent: true,
        opacity: 0.88
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);

      // Outer wireframe shell
      const shellGeo = new THREE.IcosahedronGeometry(1.7, 1);
      const shellMat = new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.35
      });
      const shell = new THREE.Mesh(shellGeo, shellMat);
      group.add(shell);

      // Equatorial ring
      const ringGeo = new THREE.TorusGeometry(2.0, 0.07, 8, 48);
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      // Point light aura
      const light = new THREE.PointLight(color, 1.5, 22);
      group.add(light);

      this.mapGroup.add(group);

      this.holoOrbs.push({
        group,
        phase: (i / 5) * Math.PI * 2,
        orbitRadius: 28 + i * 8,
        orbitSpeed: 0.18 + i * 0.04,
        bobSpeed:   1.1 + i * 0.25
      });

      // Also track core mat for brightness animation
      this.neonSignAnims.push({
        mesh: core,
        mat: coreMat,
        phase: (i / 5) * Math.PI * 2,
        colorA: new THREE.Color(color),
        colorB: new THREE.Color(orbColors[(i + 2) % orbColors.length])
      });
    }
  }

  // ─── SYDNEY GLB CITY MODEL ────────────────────────────────────────────────
  private loadSydneyCityModel(): void {
    const loader    = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();

    const sydTex = [
      texLoader.load('/models/sydney/Textures/Sydney_CityPart1.jpg'),
      texLoader.load('/models/sydney/Textures/Sydney_CityPart2.jpg'),
      texLoader.load('/models/sydney/Textures/Sydney_CityPart3.jpg'),
    ];
    const waterTex = texLoader.load('/models/sydney/Textures/Watter.png');

    for (const t of sydTex) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    }
    waterTex.colorSpace = THREE.SRGBColorSpace;
    waterTex.wrapS = THREE.RepeatWrapping;
    waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(14, 14);

    loader.load('/models/sydney/sydney_city.glb', (gltf) => {
      const cityRoot = gltf.scene;
      let buildingIdx = 0;

      cityRoot.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;

        mesh.castShadow    = false;
        mesh.receiveShadow = false;

        const name = mesh.name.toLowerCase();

        if (name.startsWith('bld') || name.startsWith('spire') || name.startsWith('tower')) {
          const tex = sydTex[buildingIdx % sydTex.length];

          // Must call computeBoundingBox() before reading boundingBox — it is null until computed.
          mesh.geometry.computeBoundingBox();
          const bb = mesh.geometry.boundingBox;
          const height = bb ? (bb.max.y - bb.min.y) : 40;
          const width  = bb ? (bb.max.x - bb.min.x) : 16;
          tex.repeat.set(Math.max(1, Math.floor(width / 8)), Math.max(1, Math.floor(height / 14)));

          const mat = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.35,
            metalness: 0.7,
            emissiveMap: tex,
            emissive: new THREE.Color(0x112233),
            emissiveIntensity: 0.28,
          });
          mesh.material = mat;
          this.buildingMats.push(mat);
          buildingIdx++;
        } else if (name === 'harbour') {
          const mat = new THREE.MeshStandardMaterial({
            map: waterTex,
            color: 0x051a2e,
            roughness: 0.08,
            metalness: 0.92,
            transparent: true,
            opacity: 0.88,
          });
          mesh.material = mat;
          this.waterAnims.push({ mesh, mat });
        } else if (name === 'road' || name.startsWith('road_')) {
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0x060709, roughness: 0.95, metalness: 0.0,
          });
        } else if (name === 'sidewalk') {
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0x1a1c22, roughness: 0.88, metalness: 0.05,
          });
        } else if (name === 'light') {
          const mat = new THREE.MeshStandardMaterial({
            color: 0xffeebb, emissive: new THREE.Color(0xffe07a), emissiveIntensity: 4.0,
          });
          mesh.material = mat;
          // Street lights flicker gently
          this.neonSignAnims.push({
            mesh, mat,
            phase: Math.random() * Math.PI * 2,
            colorA: new THREE.Color(0xffe07a),
            colorB: new THREE.Color(0x00f0ff)
          });
        } else if (name === 'ground') {
          mesh.material = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.9 });
        }
      });

      cityRoot.scale.setScalar(1.0);
      cityRoot.position.set(0, 0, 0);
      this.mapGroup.add(cityRoot);

      console.log('[MapBuilder] Sydney City 3D model loaded successfully');
    }, undefined, (err) => {
      console.error('[MapBuilder] Failed to load sydney_city.glb:', err);
    });
  }

  // ─── REALISTIC SKY ────────────────────────────────────────────────────────
  private buildRealisticSky(): void {
    // Sky sphere — gradient from deep blue zenith to pale horizon haze
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 1; skyCanvas.height = 512;
    const skyCtx = skyCanvas.getContext('2d')!;
    const grad = skyCtx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0,  '#2a5f9e'); // deep blue zenith
    grad.addColorStop(0.35, '#5490c8'); // mid-sky blue
    grad.addColorStop(0.65, '#8ab4d8'); // pale upper horizon
    grad.addColorStop(0.85, '#c0d8ea'); // hazy near-horizon
    grad.addColorStop(1.0,  '#d8e8f0'); // horizon glow
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 1, 512);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;

    const skyGeo = new THREE.SphereGeometry(380, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
    this.mapGroup.add(new THREE.Mesh(skyGeo, skyMat));

    // Sun disc — warm white glare near horizon (late afternoon)
    const sunCanvas = document.createElement('canvas');
    sunCanvas.width = sunCanvas.height = 256;
    const sunCtx = sunCanvas.getContext('2d')!;
    const sunGrad = sunCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    sunGrad.addColorStop(0.0,  'rgba(255, 255, 220, 1.0)');
    sunGrad.addColorStop(0.12, 'rgba(255, 240, 180, 0.9)');
    sunGrad.addColorStop(0.35, 'rgba(255, 220, 120, 0.4)');
    sunGrad.addColorStop(1.0,  'rgba(255, 200, 80,  0.0)');
    sunCtx.fillStyle = sunGrad;
    sunCtx.fillRect(0, 0, 256, 256);
    const sunTex = new THREE.CanvasTexture(sunCanvas);
    sunTex.colorSpace = THREE.SRGBColorSpace;

    const sunMat = new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    const sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(55, 55), sunMat);
    // Position sun: low in west (matches directional light at 60, 80, -40)
    sunMesh.position.set(200, 60, -140);
    sunMesh.lookAt(0, 0, 0);
    this.mapGroup.add(sunMesh);

    // Procedural cloud layer — flat billboard planes at altitude
    this.addCloudLayer();
  }

  private addCloudLayer(): void {
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = cloudCanvas.height = 512;
    const ctx = cloudCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 512);
    // Draw several overlapping soft white blobs
    const drawBlob = (x: number, y: number, rx: number, ry: number, alpha: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      g.addColorStop(0,   `rgba(255,255,255,${alpha})`);
      g.addColorStop(0.5, `rgba(255,255,255,${alpha * 0.6})`);
      g.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.save(); ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
      ctx.beginPath(); ctx.arc(x / (rx / Math.max(rx, ry)), y / (ry / Math.max(rx, ry)), Math.max(rx, ry), 0, Math.PI * 2);
      ctx.fill(); ctx.restore();
    };
    drawBlob(256, 256, 200, 90, 0.85);
    drawBlob(160, 240, 140, 70, 0.7);
    drawBlob(360, 260, 120, 60, 0.65);
    drawBlob(300, 220, 90,  50, 0.5);
    drawBlob(200, 280, 100, 45, 0.45);
    const cloudTex = new THREE.CanvasTexture(cloudCanvas);

    const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide });
    const cloudPositions: [number, number, number, number][] = [
      [ 30, 95,  80, 0.3],  [ -50, 95,  -60, -0.2],
      [100, 90, -100, 0.5], [ -80, 88,   40,  1.1],
      [ 10, 92,  140, 0.8], [ 140, 86,   10, -0.4],
      [-130, 93, -20, 0.0], [  60, 88, -160,  0.7],
    ];
    for (const [cx, cy, cz, rot] of cloudPositions) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(80 + Math.random() * 40, 22 + Math.random() * 12), cloudMat.clone());
      mesh.position.set(cx, cy, cz);
      mesh.rotation.y = rot;
      mesh.rotation.x = -0.12; // slight tilt upward
      this.mapGroup.add(mesh);
    }
  }

  // ─── SKYSCRAPER BACKDROP ──────────────────────────────────────────────────
  // NOTE: textures are shared from a module-level cache so we don't re-load
  // them from disk again — the GLB loader already triggered network fetches.
  private backdropTexCache: THREE.Texture[] | null = null;
  private backdropWaterTexCache: THREE.Texture | null = null;

  private buildSkyscraperBackdrop(): void {
    const group = new THREE.Group();
    const towerCount = 36;
    const windowColors = [0x00f0ff, 0xff0055, 0xffaa00, 0x38bdf8];

    // Reuse already-loaded textures if available; otherwise create once and cache.
    if (!this.backdropTexCache) {
      const texLoader = new THREE.TextureLoader();
      this.backdropTexCache = [
        texLoader.load('/assets/sydney/Textures/Sydney_CityPart1.jpg'),
        texLoader.load('/assets/sydney/Textures/Sydney_CityPart2.jpg'),
        texLoader.load('/assets/sydney/Textures/Sydney_CityPart3.jpg'),
      ];
      for (const t of this.backdropTexCache) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    }
    if (!this.backdropWaterTexCache) {
      const texLoader = new THREE.TextureLoader();
      this.backdropWaterTexCache = texLoader.load('/assets/sydney/Textures/Watter.png');
      this.backdropWaterTexCache.wrapS = this.backdropWaterTexCache.wrapT = THREE.RepeatWrapping;
      this.backdropWaterTexCache.repeat.set(12, 12);
    }
    const sydTex = this.backdropTexCache;
    const waterTex = this.backdropWaterTexCache;

    // Harbour water ring
    const waterMat = new THREE.MeshStandardMaterial({
      map: waterTex, color: 0x051a2e, roughness: 0.15, metalness: 0.85,
      transparent: true, opacity: 0.85
    });
    const waterMesh = new THREE.Mesh(new THREE.RingGeometry(100, 240, 48), waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = -0.15;
    this.mapGroup.add(waterMesh);
    this.waterAnims.push({ mesh: waterMesh, mat: waterMat });

    for (let i = 0; i < towerCount; i++) {
      const angle = (i / towerCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
      const dist  = 105 + Math.random() * 105;
      const w = 16 + Math.random() * 22;
      const d = 16 + Math.random() * 22;
      const h = 70 + Math.random() * 140;
      const tx = Math.cos(angle) * dist;
      const tz = Math.sin(angle) * dist;

      const bTex = sydTex[i % sydTex.length];

      const towerMat = new THREE.MeshStandardMaterial({
        map: bTex, roughness: 0.35, metalness: 0.75,
        emissiveMap: bTex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.35
      });
      const towerMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), towerMat);
      towerMesh.position.set(tx, h / 2 - 5, tz);
      group.add(towerMesh);
      this.buildingMats.push(towerMat);

      // Animated neon roof spire
      const color = windowColors[i % windowColors.length];
      const spireMat = new THREE.MeshStandardMaterial({
        color, emissive: new THREE.Color(color), emissiveIntensity: 2.0
      });
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.0, 28, 8), spireMat);
      spire.position.set(tx, h + 8, tz);
      group.add(spire);
      this.spireAnims.push({ mesh: spire, mat: spireMat, phase: (i / towerCount) * Math.PI * 2, speed: 1.2 + Math.random() * 1.0, baseIntensity: 2.0 });

      // Wireframe edge highlight
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
      towerMesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.3
      })));
    }

    this.mapGroup.add(group);
  }

  // ─── ARENA MAP ────────────────────────────────────────────────────────────
  private buildMap(): void {
    const mapDef = TEST_MAP;

    // Floor — realistic concrete/asphalt (light grey, no metalness, high roughness)
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(mapDef.floorSize.width, mapDef.floorSize.length),
      new THREE.MeshStandardMaterial({ color: 0x7a7870, roughness: 0.92, metalness: 0.0 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    this.mapGroup.add(floorMesh);
    // No neon grid helper — replaced by natural concrete appearance

    // Obstacles
    for (const obs of mapDef.obstacles) {
      const obsGeo  = new THREE.BoxGeometry(obs.size.x, obs.size.y, obs.size.z);
      const obsMat  = new THREE.MeshStandardMaterial({ color: obs.color, roughness: 0.3, metalness: 0.6 });
      const obsMesh = new THREE.Mesh(obsGeo, obsMat);
      obsMesh.position.set(obs.position.x, obs.position.y, obs.position.z);
      obsMesh.castShadow = obsMesh.receiveShadow = true;
      this.mapGroup.add(obsMesh);

      obsMesh.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(obsGeo),
        new THREE.LineBasicMaterial({ color: obs.color === 0x00f0ff ? 0x00f0ff : 0xff0055, transparent: true, opacity: 0.45 })
      ));

      if (obs.id === 'center_tower') {
        this.addAnimatedNeonSign(obsMesh, 'CYBER-STRIKE 3D', 0x00f0ff, 0xff0055, 0, 3.5, 3.1);
        this.addAnimatedNeonSign(obsMesh, 'SECTOR 7 ARENA',  0xff0055, 0xffaa00, 0, 1.5, -3.1);
      } else if (obs.id === 'north_platform' || obs.id === 'south_platform') {
        this.addAnimatedNeonSign(obsMesh, 'SNIPER NEST', 0xffaa00, 0x00f0ff, 0, 0.8, 4.1);
      }

      this.physics.createStaticBox(obs.position, obs.size);
    }

    // Jump pads
    for (let jpIdx = 0; jpIdx < mapDef.jumpPads.length; jpIdx++) {
      const jp = mapDef.jumpPads[jpIdx];
      const padGroup = new THREE.Group();
      padGroup.position.set(jp.position.x, jp.position.y, jp.position.z);

      padGroup.add(new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.8, 0.2, 16),
        new THREE.MeshStandardMaterial({ color: 0x0a101f, metalness: 0.9, roughness: 0.2 })
      ));

      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 1.3, 16),
        new THREE.MeshBasicMaterial({ color: 0x00ff66, side: THREE.DoubleSide })
      );
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.11;
      padGroup.add(ringMesh);

      const arrowMat = new THREE.MeshStandardMaterial({ color: 0x00ff66, emissive: new THREE.Color(0x00ff66), emissiveIntensity: 2.0 });
      const arrowMesh = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 8), arrowMat);
      arrowMesh.position.y = 0.5;
      padGroup.add(arrowMesh);

      this.mapGroup.add(padGroup);
      this.jumpPadAnims.push({ arrow: arrowMesh, ring: ringMesh, phase: (jpIdx / mapDef.jumpPads.length) * Math.PI * 2 });
    }

    // Barrels & backdrop
    this.buildExplosiveBarrels();
    this.buildSkyscraperBackdrop();
  }

  public barrelGroupMap: Map<string, THREE.Group> = new Map();

  private buildExplosiveBarrels(): void {
    const barrelBodyMat = new THREE.MeshStandardMaterial({ color: 0xcc2200, metalness: 0.8, roughness: 0.3 });
    const stripeMat     = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: new THREE.Color(0xffaa00), emissiveIntensity: 1.5 });
    const barrelBodyGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.5, 14);

    for (const b of TEST_MAP.explosiveBarrels) {
      const g = new THREE.Group();
      g.position.set(b.position.x, b.position.y, b.position.z);

      const body = new THREE.Mesh(barrelBodyGeo, barrelBodyMat);
      body.castShadow = true;
      g.add(body);

      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.25, 14), stripeMat);
      stripe.position.y = 0.1;
      g.add(stripe);

      this.mapGroup.add(g);
      this.barrelGroupMap.set(b.id, g);

      // Barrel emissive pulse — tracked as a neon sign anim
      this.neonSignAnims.push({
        mesh: stripe,
        mat: stripeMat,
        phase: Math.random() * Math.PI * 2,
        colorA: new THREE.Color(0xffaa00),
        colorB: new THREE.Color(0xff0055)
      });
    }
  }

  // ─── ANIMATED NEON SIGN ───────────────────────────────────────────────────
  private addAnimatedNeonSign(
    parent: THREE.Object3D,
    text: string,
    colorHexA: number,
    colorHexB: number,
    x: number, y: number, z: number
  ): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, 512, 128);
      const hexA = `#${colorHexA.toString(16).padStart(6, '0')}`;
      ctx.strokeStyle = hexA; ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, 496, 112);
      ctx.fillStyle = hexA;
      ctx.font = 'bold 42px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, 256, 75);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: new THREE.Color(colorHexA),
      emissiveIntensity: 1.5,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);

    this.neonSignAnims.push({
      mesh, mat,
      phase: Math.random() * Math.PI * 2,
      colorA: new THREE.Color(colorHexA),
      colorB: new THREE.Color(colorHexB)
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCEDURAL 3D CITY
  // 5×5 city block grid (BLOCK_SIZE=34, STREET_W=10) centred on origin.
  // Blocks whose centre falls within r<80 (arena play-space) are skipped.
  // Each block: sidewalk slab + curbs, 1-3 varied buildings (shop/mid/sky),
  //   animated window-light textures, rooftop props, street lamps,
  //   traffic lights, subway steam vents.
  // 40 animated vehicles drive the street grid.
  // ═══════════════════════════════════════════════════════════════════════════
  private buildProceduralCity(): void {
    const rng = seededRng(0xdeadbeef);
    const city = new THREE.Group();
    city.name = 'ProceduralCity';

    const roadMat     = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.92, metalness: 0.0 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x1c1e26, roughness: 0.85, metalness: 0.04 });
    const curbMat     = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, roughness: 0.9 });
    const roofMat     = new THREE.MeshStandardMaterial({ color: 0x111520, roughness: 0.7, metalness: 0.15 });
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x888fa8, metalness: 0.85, roughness: 0.2 });
    const lampLightMat = new THREE.MeshStandardMaterial({
      color: 0xffe07a, emissive: new THREE.Color(0xffe07a), emissiveIntensity: 4.0
    });
    const facadePalette = [0x0d1b2a, 0x112031, 0x0f1824, 0x141c2e, 0x0e1a28, 0x16202e, 0x0b1620, 0x1a1430];
    const accentPalette = [0x00f0ff, 0xff0055, 0xffaa00, 0xa855f7, 0x38bdf8, 0x10b981];

    const BLOCK_SIZE = 34, STREET_W = 10, STRIDE = BLOCK_SIZE + STREET_W;
    const GRID_HALF = 2, ARENA_SAFE = 55;

    // ── Road segments ──
    const hRG = new THREE.BoxGeometry(STRIDE*(GRID_HALF*2+1)+STREET_W, 0.12, STREET_W);
    const vRG = new THREE.BoxGeometry(STREET_W, 0.12, STRIDE*(GRID_HALF*2+1)+STREET_W);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let row = -GRID_HALF; row <= GRID_HALF+1; row++) {
      const z = row*STRIDE - STRIDE/2;
      const rm = new THREE.Mesh(hRG, roadMat); rm.position.set(0, 0.06, z); rm.receiveShadow = true; city.add(rm);
      const cl = new THREE.Mesh(new THREE.BoxGeometry(STRIDE*(GRID_HALF*2+1), 0.01, 0.22), lineMat);
      cl.position.set(0, 0.13, z); city.add(cl);
    }
    for (let col = -GRID_HALF; col <= GRID_HALF+1; col++) {
      const x = col*STRIDE - STRIDE/2;
      const rm = new THREE.Mesh(vRG, roadMat); rm.position.set(x, 0.06, 0); rm.receiveShadow = true; city.add(rm);
      const cl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, STRIDE*(GRID_HALF*2+1)), lineMat);
      cl.position.set(x, 0.13, 0); city.add(cl);
    }

    // ── Crosswalks ──
    const stMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    for (let row = -GRID_HALF; row <= GRID_HALF+1; row++) {
      for (let col = -GRID_HALF; col <= GRID_HALF+1; col++) {
        const ix = col*STRIDE - STRIDE/2, iz = row*STRIDE - STRIDE/2;
        for (let s = 0; s < 4; s++) {
          const sh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, STREET_W*0.85), stMat);
          sh.position.set(ix - 4.2 + s*1.8, 0.14, iz); city.add(sh);
          const sv = new THREE.Mesh(new THREE.BoxGeometry(STREET_W*0.85, 0.02, 1.4), stMat);
          sv.position.set(ix, 0.14, iz - 4.2 + s*1.8); city.add(sv);
        }
      }
    }

    // ── City blocks ──
    for (let row = -GRID_HALF; row <= GRID_HALF; row++) {
      for (let col = -GRID_HALF; col <= GRID_HALF; col++) {
        const cx = col*STRIDE, cz = row*STRIDE;
        if (Math.hypot(cx, cz) < ARENA_SAFE) continue; // keep gameplay area clear
        this.spawnBlock(city, cx, cz, BLOCK_SIZE, rng,
          facadePalette, accentPalette, roofMat, sidewalkMat, curbMat, lampPoleMat, lampLightMat);
      }
    }

    // ── Vehicles ──
    this.spawnCityVehicles(city, rng, STRIDE, GRID_HALF);

    this.mapGroup.add(city);
    console.log('[MapBuilder] Procedural city built');
  }

  // ─── ONE CITY BLOCK ───────────────────────────────────────────────────────
  private spawnBlock(
    parent: THREE.Group, cx: number, cz: number, bs: number, rng: () => number,
    fp: number[], ap: number[], roofMat: THREE.Material, swMat: THREE.Material,
    curbMat: THREE.Material, lampMat: THREE.Material, llMat: THREE.MeshStandardMaterial
  ): void {
    // Sidewalk
    const sw = new THREE.Mesh(new THREE.BoxGeometry(bs, 0.22, bs), swMat);
    sw.position.set(cx, 0.11, cz); sw.receiveShadow = true; parent.add(sw);
    // Curbs
    const h2 = bs/2, cH = 0.18;
    const curbDefs: [boolean,number][] = [[true,1],[true,-1],[false,1],[false,-1]];
    for (const [iz, sg] of curbDefs) {
      const g = iz ? new THREE.BoxGeometry(bs+0.4,cH,0.4) : new THREE.BoxGeometry(0.4,cH,bs+0.4);
      const c = new THREE.Mesh(g, curbMat);
      c.position.set(iz?cx:cx+sg*(h2+0.2), 0.09+cH/2, iz?cz+sg*(h2+0.2):cz); parent.add(c);
    }
    // Buildings
    const sc = Math.floor(rng()*3)+1;
    for (const [lx, lz, bw, bd] of this.subBlockLayout(sc, bs, rng)) {
      const fc = fp[Math.floor(rng()*fp.length)], ac = ap[Math.floor(rng()*ap.length)];
      const roll = rng();
      const bh = roll<0.35 ? 4+rng()*5 : roll<0.72 ? 12+rng()*12 : 30+rng()*42;
      this.spawnBuilding(parent, cx+lx, cz+lz, bw, bd, bh, fc, ac, roofMat, rng);
    }
    // Street lamps (corners)
    const lc = h2-1;
    for (const [lx,lz] of [[-lc,-lc],[lc,-lc],[-lc,lc],[lc,lc]] as [number,number][]) {
      this.spawnStreetLamp(parent, cx+lx, cz+lz, lampMat, llMat, rng);
    }
    // Traffic lights
    this.spawnTrafficLight(parent, cx-lc+2, cz-lc, rng);
    this.spawnTrafficLight(parent, cx-lc+2, cz+lc, rng);
    // Subway vent
    if (rng()>0.5) this.spawnSubwayVent(parent, cx+(rng()-0.5)*(bs-4), cz+(rng()-0.5)*(bs-4));
  }

  private subBlockLayout(n: number, bs: number, rng: () => number): [number,number,number,number][] {
    const inner = bs-4;
    if (n===1) return [[0,0,inner*0.88,inner*0.88]];
    if (n===2) {
      const sp=0.45+rng()*0.1, gap=1.5;
      if (rng()>0.5) return [
        [-(inner*(1-sp))/2+gap/4, 0, inner*sp-gap/2, inner*0.88],
        [ (inner*sp)/2-gap/4,     0, inner*(1-sp)-gap/2, inner*0.88]
      ];
      return [
        [0, -(inner*(1-sp))/2+gap/4, inner*0.88, inner*sp-gap/2],
        [0,  (inner*sp)/2-gap/4,     inner*0.88, inner*(1-sp)-gap/2]
      ];
    }
    const gap=1.5, tH=inner*0.55, bH=inner*0.4, hW=inner/2-gap/2;
    return [
      [0, -(inner-tH)/2+gap/4, inner*0.88, tH-gap/2],
      [-(inner/2-hW/2), (inner-bH)/2-gap/4, hW, bH-gap/2],
      [ (inner/2-hW/2), (inner-bH)/2-gap/4, hW, bH-gap/2]
    ];
  }

  // ─── BUILDING ─────────────────────────────────────────────────────────────
  private spawnBuilding(
    parent: THREE.Group, x: number, z: number, w: number, d: number, h: number,
    fc: number, ac: number, roofMat: THREE.Material, rng: () => number
  ): void {
    const fMat = new THREE.MeshStandardMaterial({
      color: fc, roughness: 0.45+rng()*0.3, metalness: 0.4+rng()*0.4,
      emissive: new THREE.Color(ac), emissiveIntensity: 0.04
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), fMat);
    body.position.set(x, h/2, z); body.castShadow = false; body.receiveShadow = false; parent.add(body);
    this.buildingMats.push(fMat);
    // Window texture on all 4 sides
    const wTex = this.createWindowTexture(Math.max(2,Math.floor(w/3)), Math.max(3,Math.floor(h/4)), ac, rng);
    const wMat = new THREE.MeshStandardMaterial({
      map: wTex, emissiveMap: wTex, emissive: new THREE.Color(ac), emissiveIntensity: 0.7,
      transparent: true, opacity: 0.92
    });
    for (let s = 0; s < 4; s++) {
      const ang = (s/4)*Math.PI*2;
      const off = (s%2===0 ? d : w)/2 + 0.05;
      const wp = new THREE.Mesh(new THREE.PlaneGeometry(s%2===0?w*0.92:d*0.92, h*0.96), wMat);
      wp.position.set(x + Math.sin(ang)*off, h/2, z + Math.cos(ang)*off);
      wp.rotation.y = ang; parent.add(wp);
    }
    this.windowLights.push({ mat: wMat, phase: rng()*Math.PI*2, row: 0, col: 0 });
    // Roof slab
    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), roofMat);
    roofSlab.position.set(x, h + 0.3, z);
    roofSlab.castShadow = true;
    parent.add(roofSlab);
    // Setback
    if (h>25 && rng()>0.4) {
      const [sw,sd,sh] = [w*0.65, d*0.65, h*0.25];
      const sb = new THREE.Mesh(new THREE.BoxGeometry(sw,sh,sd), fMat.clone());
      sb.position.set(x,h+sh/2,z); sb.castShadow=true; parent.add(sb);
      const bMat = new THREE.MeshStandardMaterial({ color:ac, emissive:new THREE.Color(ac), emissiveIntensity:1.8 });
      const band = new THREE.Mesh(new THREE.BoxGeometry(sw+0.3,0.45,sd+0.3), bMat);
      band.position.set(x,h+0.4,z); parent.add(band);
      this.spireAnims.push({ mesh:band, mat:bMat, phase:rng()*Math.PI*2, speed:0.8+rng()*0.6, baseIntensity:1.8 });
    }
    // Rooftop props
    if (h>10) this.spawnRoofProps(parent, x, z, w, d, h, ac, rng);
    // Billboard
    if (h>18 && rng()>0.55) {
      const signs = ['CYBER NET','SECTOR 7','NEON CITY','GRID CORP','OMEGA SYS','NEXUS HQ','DARK WEB','KILLZONE'];
      const text = signs[Math.floor(rng()*signs.length)];
      const side = Math.floor(rng()*4);
      const ang = (side/4)*Math.PI*2;
      const off = (side%2===0?d:w)/2 + 0.25;
      const bx = x+Math.sin(ang)*off, bz = z+Math.cos(ang)*off;
      const ca = rng()>0.5?ac:0x00f0ff, cb = ca===0x00f0ff?0xff0055:0xffaa00;

      const key = `${text}_${ca}`;
      let bTex = this.billboardTexCache.get(key);
      if (!bTex) {
        const bCv = document.createElement('canvas'); bCv.width=512; bCv.height=128;
        const bCtx = bCv.getContext('2d');
        if (bCtx) {
          bCtx.fillStyle='#05070d'; bCtx.fillRect(0,0,512,128);
          const hx=`#${ca.toString(16).padStart(6,'0')}`;
          bCtx.strokeStyle=hx; bCtx.lineWidth=6; bCtx.strokeRect(8,8,496,112);
          bCtx.fillStyle=hx; bCtx.font='bold 46px monospace'; bCtx.textAlign='center'; bCtx.fillText(text,256,80);
        }
        bTex = new THREE.CanvasTexture(bCv);
        this.billboardTexCache.set(key, bTex);
      }

      const bMat=new THREE.MeshStandardMaterial({ map:bTex, emissiveMap:bTex, emissive:new THREE.Color(ca), emissiveIntensity:1.5, side:THREE.DoubleSide });
      const bMsh=new THREE.Mesh(new THREE.PlaneGeometry(7,1.8),bMat);
      bMsh.position.set(bx,h*0.65,bz); bMsh.rotation.y=ang; parent.add(bMsh);
      this.neonSignAnims.push({ mesh:bMsh, mat:bMat, phase:rng()*Math.PI*2, colorA:new THREE.Color(ca), colorB:new THREE.Color(cb) });
    }
  }

  private windowTexCache = new Map<string, THREE.CanvasTexture>();
  private billboardTexCache = new Map<string, THREE.CanvasTexture>();

  private createWindowTexture(cols: number, rows: number, ac: number, rng: () => number): THREE.CanvasTexture {
    const key = `${cols}_${rows}_${ac}`;
    const cached = this.windowTexCache.get(key);
    if (cached) return cached;

    const cv=document.createElement('canvas'); cv.width=256; cv.height=512;
    const ctx=cv.getContext('2d')!;
    ctx.fillStyle='#080c14'; ctx.fillRect(0,0,256,512);
    const hex=`#${ac.toString(16).padStart(6,'0')}`;
    const ww=Math.floor(256/cols), wh=Math.floor(512/rows);
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
      if (rng()<=0.38) continue;
      const br=0.4+rng()*0.6;
      ctx.fillStyle = rng()>0.55
        ? `rgba(255,${180+Math.floor(rng()*75)},80,${br})`
        : `${hex}${Math.floor(br*255).toString(16).padStart(2,'0')}`;
      ctx.fillRect(c*ww+2, r*wh+2, ww-4, wh-4);
    }
    const tex = new THREE.CanvasTexture(cv);
    this.windowTexCache.set(key, tex);
    return tex;
  }

  private spawnRoofProps(parent: THREE.Group, x: number, z: number, w: number, d: number, h: number, ac: number, rng: () => number): void {
    const ry=h+0.6;
    const dkM=new THREE.MeshStandardMaterial({ color:0x1a1e2a, metalness:0.6, roughness:0.4 });
    const rsM=new THREE.MeshStandardMaterial({ color:0x3a1a0a, roughness:0.9 });
    // Water tower
    if (rng()>0.5 && w>8) {
      const tg=new THREE.Group();
      const barrel=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.4,3,10),rsM); barrel.position.y=2.2; tg.add(barrel);
      const cone=new THREE.Mesh(new THREE.ConeGeometry(1.35,1,10),dkM); cone.position.y=4.2; tg.add(cone);
      for (let i=0;i<4;i++) {
        const a=(i/4)*Math.PI*2; const lg=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.8,0.12),dkM);
        lg.position.set(Math.cos(a)*1.2,0.9,Math.sin(a)*1.2); tg.add(lg);
      }
      tg.position.set(x+(rng()-0.5)*(w*0.5),ry,z+(rng()-0.5)*(d*0.5)); parent.add(tg);
    }
    // AC units
    for (let i=0;i<1+Math.floor(rng()*3);i++) {
      const acM=new THREE.Mesh(new THREE.BoxGeometry(1.4+rng()*0.6,0.8+rng()*0.4,0.8+rng()*0.4),dkM);
      acM.position.set(x+(rng()-0.5)*(w*0.7),ry+0.4,z+(rng()-0.5)*(d*0.7)); acM.castShadow=true; parent.add(acM);
    }
    // Dish
    if (rng()>0.6) {
      const dg=new THREE.Group();
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,1.2,6),dkM); pole.position.y=0.6; dg.add(pole);
      const dish=new THREE.Mesh(new THREE.SphereGeometry(0.55,8,5,0,Math.PI*2,0,Math.PI/2),dkM);
      dish.rotation.x=-Math.PI/2+0.4; dish.position.y=1.35; dg.add(dish);
      dg.position.set(x+(rng()-0.5)*(w*0.6),ry,z+(rng()-0.5)*(d*0.6)); parent.add(dg);
    }
    // Antenna + beacon
    if (h>28 && rng()>0.4) {
      const aH=8+rng()*14;
      const aM=new THREE.MeshStandardMaterial({ color:0x8899aa, metalness:0.9, roughness:0.15 });
      const bM=new THREE.MeshStandardMaterial({ color:ac, emissive:new THREE.Color(ac), emissiveIntensity:3.5 });
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.14,aH,8),aM); pole.position.set(x,ry+aH/2,z); parent.add(pole);
      const beacon=new THREE.Mesh(new THREE.SphereGeometry(0.22,8,8),bM); beacon.position.set(x,ry+aH,z); parent.add(beacon);
      this.spireAnims.push({ mesh:beacon, mat:bM, phase:rng()*Math.PI*2, speed:2.2+rng(), baseIntensity:3.5 });
    }
    // Helipad
    if (h>40 && rng()>0.65) {
      const pM=new THREE.MeshStandardMaterial({ color:0x0a0f1a, roughness:0.7 });
      const pad=new THREE.Mesh(new THREE.CylinderGeometry(4,4,0.15,24),pM); pad.position.set(x,ry,z); parent.add(pad);
      const hB=new THREE.Mesh(new THREE.BoxGeometry(3.5,0.01,0.55),new THREE.MeshBasicMaterial({ color:ac }));
      hB.position.set(x,ry+0.09,z); parent.add(hB);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(3.2,0.15,6,32),
        new THREE.MeshStandardMaterial({ color:ac, emissive:new THREE.Color(ac), emissiveIntensity:1.5 }));
      ring.rotation.x=Math.PI/2; ring.position.set(x,ry+0.09,z); parent.add(ring);
    }
  }

  private spawnStreetLamp(parent: THREE.Group, x: number, z: number, poleMat: THREE.Material, lightMat: THREE.MeshStandardMaterial, rng: () => number): void {
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.1,5.5,8),poleMat); pole.position.set(x,2.75,z); pole.castShadow=true; parent.add(pole);
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.4,6),poleMat); arm.rotation.z=Math.PI/2; arm.position.set(x+0.7,5.4,z); parent.add(arm);
    const head=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.25,0.5),poleMat); head.position.set(x+1.4,5.4,z); parent.add(head);
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.18,8,8),lightMat); bulb.position.set(x+1.4,5.2,z); parent.add(bulb);
    this.neonSignAnims.push({ mesh:bulb, mat:lightMat, phase:rng()*Math.PI*2, colorA:new THREE.Color(0xffe07a), colorB:new THREE.Color(0x00f0ff) });
  }

  private spawnTrafficLight(parent: THREE.Group, x: number, z: number, rng: () => number): void {
    const pM=new THREE.MeshStandardMaterial({ color:0x252830, metalness:0.7, roughness:0.3 });
    const bM=new THREE.MeshStandardMaterial({ color:0x151820, roughness:0.6 });
    const rM=new THREE.MeshStandardMaterial({ color:0xff2200, emissive:new THREE.Color(0xff2200), emissiveIntensity:3.5 });
    const gM=new THREE.MeshStandardMaterial({ color:0x00ff44, emissive:new THREE.Color(0x00ff44), emissiveIntensity:0.1 });
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.1,4.5,8),pM); pole.position.set(x,2.25,z); parent.add(pole);
    const box=new THREE.Mesh(new THREE.BoxGeometry(0.45,1.2,0.45),bM); box.position.set(x,4.6,z); parent.add(box);
    const rl=new THREE.Mesh(new THREE.SphereGeometry(0.14,8,8),rM); rl.position.set(x,5.05,z+0.23); parent.add(rl);
    const gl=new THREE.Mesh(new THREE.SphereGeometry(0.14,8,8),gM); gl.position.set(x,4.25,z+0.23); parent.add(gl);
    this.trafficLights.push({ group:new THREE.Group(), phase:rng()*8.0, redMat:rM, greenMat:gM });
  }

  private spawnSubwayVent(parent: THREE.Group, x: number, z: number): void {
    const vM=new THREE.MeshStandardMaterial({ color:0x3a3c48, metalness:0.65, roughness:0.5 });
    const gM=new THREE.MeshStandardMaterial({ color:0x00f0ff, emissive:new THREE.Color(0x00f0ff), emissiveIntensity:0.8, transparent:true, opacity:0.45 });
    const grate=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.12,1.8),vM); grate.position.set(x,0.06,z); parent.add(grate);
    const shaft=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.7,1.4),vM); shaft.position.set(x,0.35,z); parent.add(shaft);
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(1.3,1.3),gM);
    glow.rotation.x=-Math.PI/2; glow.position.set(x,0.72,z); parent.add(glow);
    this.neonSignAnims.push({ mesh:glow, mat:gM, phase:Math.random()*Math.PI*2, colorA:new THREE.Color(0x00f0ff), colorB:new THREE.Color(0xa855f7) });
  }

  private spawnCityVehicles(parent: THREE.Group, rng: () => number, stride: number, gridHalf: number): void {
    const vColors=[0xffcc00,0xff2200,0x2255ff,0xffffff,0x44aa22,0xaa22ff];
    const makeCar=(col: number, isVan: boolean): THREE.Group => {
      const g=new THREE.Group();
      const bM=new THREE.MeshStandardMaterial({ color:col, metalness:0.7, roughness:0.3 });
      const dM=new THREE.MeshStandardMaterial({ color:0x111118, roughness:0.5 });
      const lM=new THREE.MeshStandardMaterial({ color:0xffffff, emissive:new THREE.Color(0xffd080), emissiveIntensity:3.0 });
      const tM=new THREE.MeshStandardMaterial({ color:0xff2200, emissive:new THREE.Color(0xff2200), emissiveIntensity:2.0 });
      const bH=isVan?2.2:1.0, bL=isVan?5.0:4.0;
      const body=new THREE.Mesh(new THREE.BoxGeometry(2.0,bH,bL),bM); body.position.y=bH/2+0.3; body.castShadow=true; g.add(body);
      if (!isVan) { const cab=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.75,2.1),bM); cab.position.set(0,1.45,-0.3); g.add(cab); }
      const wM=new THREE.MeshStandardMaterial({ color:0x151518, metalness:0.4 });
      const wG=new THREE.CylinderGeometry(0.35,0.35,0.22,10);
      for (const [wx,wy,wz] of [[-1.1,0.35,1.2],[1.1,0.35,1.2],[-1.1,0.35,-1.2],[1.1,0.35,-1.2]] as [number,number,number][]) {
        const w=new THREE.Mesh(wG,wM); w.rotation.z=Math.PI/2; w.position.set(wx,wy,wz); g.add(w);
      }
      for (const sx of [-0.65,0.65]) {
        const hl=new THREE.Mesh(new THREE.BoxGeometry(0.35,0.2,0.06),lM); hl.position.set(sx,bH/2+0.35,bL/2+0.02); g.add(hl);
        const tl=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.18,0.06),tM); tl.position.set(sx,bH/2+0.3,-bL/2-0.02); g.add(tl);
      }
      return g;
    };
    const count=Math.min((gridHalf*2+1)*2,20);
    for (let i=0;i<count;i++) {
      const car=makeCar(vColors[Math.floor(rng()*vColors.length)], rng()>0.72);
      const axis: 'x'|'z' = rng()>0.5?'x':'z';
      const dir: 1|-1 = rng()>0.5?1:-1;
      const lIdx=Math.floor(rng()*(gridHalf*2+2))-gridHalf-1;
      const lPos=lIdx*stride-stride/2+(dir===1?2.5:-2.5);
      const spd=8+rng()*12;
      if (axis==='x') { car.position.set(-90+rng()*180,0,lPos); car.rotation.y=dir===1?0:Math.PI; }
      else             { car.position.set(lPos,0,-90+rng()*180); car.rotation.y=dir===1?Math.PI/2:-Math.PI/2; }
      parent.add(car);
      this.cityVehicles.push({ group:car, lane:lPos, speed:spd, progress:rng()*180, axis, direction:dir });
    }
  }

  public rebuildPhysicsColliders(): void {
    const mapDef = TEST_MAP;
    this.physics.createStaticBox({ x: 0, y: -0.5, z: 0 }, { x: mapDef.floorSize.width, y: 1.0, z: mapDef.floorSize.length });
    for (const obs of mapDef.obstacles) {
      this.physics.createStaticBox(obs.position, obs.size);
    }
  }
}
