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
    this.scene.background = new THREE.Color(0x0d121d);
    this.scene.fog = new THREE.FogExp2(0x0d121d, 0.004);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 1.6, 0);
    this.scene.add(this.camera);

    try {
      this.webglRenderer = this.createWebGLRenderer();
      this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
      this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      this.webglRenderer.shadowMap.enabled = true;
      this.webglRenderer.shadowMap.type = THREE.PCFShadowMap;
      this.webglRenderer.toneMapping = THREE.ReinhardToneMapping;
      this.webglRenderer.toneMappingExposure = 1.6;

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

    window.addEventListener('resize', () => this.onWindowResize());
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0x405068, 3.0);
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

    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#060911');
    skyGrad.addColorStop(0.6, '#0d1322');
    skyGrad.addColorStop(1, '#151d30');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    const camPos = this.camera.position;
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    const horizonY = h / 2 + Math.tan(euler.x) * (h / 2);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();
  }
}
