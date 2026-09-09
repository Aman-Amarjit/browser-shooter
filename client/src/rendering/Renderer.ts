import * as THREE from 'three';

export class Renderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public webglRenderer: THREE.WebGLRenderer | null = null;
  public isFallback2D: boolean = false;
  private canvas2d: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    // Realistic overcast/hazy sky colour (blue-grey horizon)
    this.scene.background = new THREE.Color(0x7a9bb5);
    // Linear fog — realistic distance haze, not neon exponential
    this.scene.fog = new THREE.Fog(0xa8c0d0, 80, 380);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 1.6, 0);
    this.scene.add(this.camera);

    try {
      this.webglRenderer = this.createWebGLRenderer();
      this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
      this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      this.webglRenderer.shadowMap.enabled = true;
      this.webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // ACESFilmic gives realistic HDR-to-SDR compression (film look)
      this.webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.webglRenderer.toneMappingExposure = 1.0;
      // sRGB output is physically correct
      this.webglRenderer.outputColorSpace = THREE.SRGBColorSpace;

      const canvas = this.webglRenderer.domElement;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);

      this.setupLighting();
    } catch (e) {
      console.warn('WebGL init failed, falling back to Canvas2D:', e);
      this.isFallback2D = true;
      this.setupFallback2D(container);
    }

    window.addEventListener('resize', () => this.onWindowResize());
  }

  private setupLighting(): void {
    // ── Sky ambient: blue-grey overcast sky light ──────────────────────────
    const ambientLight = new THREE.AmbientLight(0xc8d8e8, 1.8);
    this.scene.add(ambientLight);

    // ── Sun: warm late-afternoon directional light ─────────────────────────
    // Angle: sun low in west (city in shadow on one side)
    const sunLight = new THREE.DirectionalLight(0xfff4e0, 3.5);
    sunLight.position.set(60, 80, -40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width  = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far  = 300;
    const sd = 90;
    sunLight.shadow.camera.left   = -sd;
    sunLight.shadow.camera.right  =  sd;
    sunLight.shadow.camera.top    =  sd;
    sunLight.shadow.camera.bottom = -sd;
    sunLight.shadow.bias = -0.0003;
    sunLight.shadow.normalBias = 0.02;
    this.scene.add(sunLight);

    // ── Sky dome fill: soft blue from above (simulates sky bounce) ─────────
    const skyFill = new THREE.DirectionalLight(0x8ab4d0, 1.2);
    skyFill.position.set(-20, 50, 30);
    this.scene.add(skyFill);

    // ── Ground bounce: very subtle warm fill from below ────────────────────
    const groundBounce = new THREE.HemisphereLight(0xc8d8e8, 0x7a6a50, 0.6);
    this.scene.add(groundBounce);
  }

  private setupFallback2D(container: HTMLElement): void {
    this.canvas2d = document.createElement('canvas');
    this.canvas2d.width  = window.innerWidth;
    this.canvas2d.height = window.innerHeight;
    this.canvas2d.style.cssText = 'display:block;width:100%;height:100%;';
    this.ctx2d = this.canvas2d.getContext('2d');
    container.appendChild(this.canvas2d);
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    if (this.webglRenderer) this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    if (this.canvas2d) { this.canvas2d.width = window.innerWidth; this.canvas2d.height = window.innerHeight; }
  }

  private createWebGLRenderer(): THREE.WebGLRenderer {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    return new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default', failIfMajorPerformanceCaveat: false });
  }

  public render(): void {
    if (this.webglRenderer && !this.isFallback2D) {
      this.webglRenderer.render(this.scene, this.camera);
    } else if (this.ctx2d && this.canvas2d) {
      this.renderFallback2D();
    }
  }

  private renderFallback2D(): void {
    if (!this.ctx2d || !this.canvas2d) return;
    const ctx = this.ctx2d, w = this.canvas2d.width, h = this.canvas2d.height;
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    const horizonY = h / 2 + Math.tan(euler.x) * (h / 2);
    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#4a7fa8'); skyGrad.addColorStop(1, '#a8c0d0');
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, w, horizonY);
    // Ground
    ctx.fillStyle = '#6b7a5a'; ctx.fillRect(0, horizonY, w, h - horizonY);
    // Crosshair dot
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(w/2, h/2, 3, 0, Math.PI*2); ctx.fill();
  }
}

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );
    this.camera.position.set(0, 1.6, 0);
    this.scene.add(this.camera);

    // 2. Try WebGL Renderer; Fallback to Canvas2D Engine if WebGL is disabled
    try {
      this.webglRenderer = this.createWebGLRenderer();
      this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
      this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      this.webglRenderer.shadowMap.enabled = true;
      this.webglRenderer.shadowMap.type = THREE.PCFShadowMap;
      this.webglRenderer.toneMapping = THREE.ReinhardToneMapping;
      this.webglRenderer.toneMappingExposure = 2.2; // raised from 1.5 — scene was too dark

      const canvas = this.webglRenderer.domElement;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);

      this.setupLighting();
    } catch (e) {
      console.warn('WebGL initialization failed. Enabling Cyberpunk Canvas2D Software Engine:', e);
      this.isFallback2D = true;
      this.setupFallback2D(container);
    }

    // 3. Handle Resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0x405068, 4.5); // boosted: city buildings need more ambient to show
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00f0ff, 3.2);
    dirLight.position.set(20, 40, -15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    const d = 60;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xff0055, 2.2);
    fillLight.position.set(-20, 20, 20);
    this.scene.add(fillLight);
  }

  private setupFallback2D(container: HTMLElement): void {
    this.canvas2d = document.createElement('canvas');
    this.canvas2d.width = window.innerWidth;
    this.canvas2d.height = window.innerHeight;
    this.canvas2d.style.display = 'block';
    this.canvas2d.style.width = '100%';
    this.canvas2d.style.height = '100%';
    this.ctx2d = this.canvas2d.getContext('2d');
    container.appendChild(this.canvas2d);
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    if (this.webglRenderer) {
      this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    }
    if (this.canvas2d) {
      this.canvas2d.width = window.innerWidth;
      this.canvas2d.height = window.innerHeight;
    }
  }

  private createWebGLRenderer(): THREE.WebGLRenderer {
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    return new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false
    });
  }

  public render(): void {
    if (this.webglRenderer && !this.isFallback2D) {
      this.webglRenderer.render(this.scene, this.camera);
    } else if (this.ctx2d && this.canvas2d) {
      this.renderFallback2D();
    }
  }

  private renderFallback2D(): void {
    if (!this.ctx2d || !this.canvas2d) return;
    const ctx = this.ctx2d;
    const w = this.canvas2d.width;
    const h = this.canvas2d.height;

    // 1. Skybox Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#060911');
    skyGrad.addColorStop(0.6, '#0d1322');
    skyGrad.addColorStop(1, '#151d30');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Horizon Line
    const camPos = this.camera.position;
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    const horizonY = h / 2 + Math.tan(euler.x) * (h / 2);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();

    // 3. Perspective Grid
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.lineWidth = 1;
    const gridLines = 24;
    for (let i = -gridLines; i <= gridLines; i++) {
      const startX = w / 2 + (i * (w / gridLines));
      ctx.beginPath();
      ctx.moveTo(startX, horizonY);
      ctx.lineTo(w / 2 + i * (w / 3), h);
      ctx.stroke();
    }

    // 4. Render 3D Objects from Scene
    const cameraYaw = euler.y;
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.visible && obj.geometry) {
        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);

        const dx = worldPos.x - camPos.x;
        const dy = worldPos.y - camPos.y;
        const dz = worldPos.z - camPos.z;

        const cosY = Math.cos(-cameraYaw);
        const sinY = Math.sin(-cameraYaw);

        const rx = dx * cosY - dz * sinY;
        const rz = dx * sinY + dz * cosY;

        if (rz < -0.5) {
          const fovFactor = (h / 2) / Math.tan((this.camera.fov * Math.PI / 180) / 2);
          const screenX = w / 2 + (rx * fovFactor / -rz);
          const screenY = h / 2 - (dy * fovFactor / -rz);
          const scale = fovFactor / -rz;

          const rawMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
          const mat = rawMat as THREE.MeshStandardMaterial;
          const colorHex = mat && mat.color && typeof mat.color.getHexString === 'function'
            ? '#' + mat.color.getHexString()
            : '#00f0ff';

          ctx.fillStyle = colorHex;
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 1.5;

          const boxSize = Math.max(4, scale * 1.5);
          ctx.fillRect(screenX - boxSize / 2, screenY - boxSize / 2, boxSize, boxSize);
          ctx.strokeRect(screenX - boxSize / 2, screenY - boxSize / 2, boxSize, boxSize);
        }
      }
    });

    // 5. Draw First Person Cyberpunk Gun Viewmodel
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;

    const gunX = w * 0.72;
    const gunY = h * 0.70;

    // Receiver
    ctx.fillRect(gunX, gunY, 180, 70);
    ctx.strokeRect(gunX, gunY, 180, 70);

    // Barrel
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(gunX - 120, gunY + 15, 120, 25);
    ctx.strokeRect(gunX - 120, gunY + 15, 120, 25);

    // Muzzle Accent Glow
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;
    ctx.fillRect(gunX - 130, gunY + 18, 10, 19);
    ctx.shadowBlur = 0;
  }
}
