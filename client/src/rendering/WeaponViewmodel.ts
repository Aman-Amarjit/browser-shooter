import * as THREE from 'three';
import { WEAPON_DEFINITIONS, WeaponDefinition } from '@fps/shared';
import { ParticleSystem } from './Particles.js';

export class WeaponViewmodel {
  public group: THREE.Group;
  private gunMesh: THREE.Group;
  private slideMesh: THREE.Mesh | null = null;
  private muzzleAnchor: THREE.Object3D;
  private muzzleFlashMesh: THREE.Mesh;
  private muzzleFlashLight: THREE.PointLight;
  private activeWeaponDef: WeaponDefinition;
  private currentWeaponId: string = 'assault_rifle';

  private hipPos   = new THREE.Vector3(0.22, -0.20, -0.40);
  private adsPos   = new THREE.Vector3(0.0,  -0.14, -0.30);
  private currentPos = new THREE.Vector3(0.22, -0.20, -0.40);

  private recoilOffset = new THREE.Vector3();
  private recoilRot    = new THREE.Vector3();
  private slideKick: number = 0;

  // Procedural idle animation
  private idleTimer:   number = 0;
  private sprintLean:  number = 0;   // 0→1 when sprinting
  private adsLean:     number = 0;   // 0→1 when ADS
  private prevIsADS:   boolean = false;
  private prevSprint:  boolean = false;

  private muzzleFlashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private camera: THREE.Camera, private particles?: ParticleSystem) {
    this.activeWeaponDef = WEAPON_DEFINITIONS['assault_rifle'];
    this.group           = new THREE.Group();

    const { gunGroup, slideMesh, muzzleAnchorPoint } = this.buildGunMesh('assault_rifle');
    this.gunMesh    = gunGroup;
    this.slideMesh  = slideMesh;
    this.muzzleAnchor = muzzleAnchorPoint;
    this.group.add(this.gunMesh);

    // ── Muzzle flash ──
    const flashGeo  = new THREE.OctahedronGeometry(0.075, 0);
    const flashMat  = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0, depthWrite: false });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.renderOrder = 999;
    this.muzzleAnchor.add(this.muzzleFlashMesh);

    const ringGeo = new THREE.TorusGeometry(0.06, 0.02, 6, 8);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0, depthWrite: false });
    const ring    = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'muzzleRing';
    this.muzzleAnchor.add(ring);

    this.muzzleFlashLight = new THREE.PointLight(0xffc060, 0, 8);
    this.muzzleAnchor.add(this.muzzleFlashLight);

    this.group.position.copy(this.hipPos);
    this.camera.add(this.group);
  }

  // ═══════════════════════════════════════════════════════════════
  //  SHARED MATERIALS
  // ═══════════════════════════════════════════════════════════════
  private static mats = {
    dark:    () => new THREE.MeshStandardMaterial({ color: 0x2d3748, metalness: 0.7, roughness: 0.3 }),
    steel:   () => new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.2 }),
    polymer: () => new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 }),
    neonCyan:() => new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 1.0 }),
    neonRed: () => new THREE.MeshStandardMaterial({ color: 0xff0044, emissive: 0xff0044, emissiveIntensity: 1.0 }),
    brass:   () => new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.3 }),
    wood:    () => new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 }),
    chrome:  () => new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 }),
  };

  // ═══════════════════════════════════════════════════════════════
  //  GUN BUILDER DISPATCHER
  // ═══════════════════════════════════════════════════════════════
  private buildGunMesh(id: string): { gunGroup: THREE.Group; slideMesh: THREE.Mesh | null; muzzleAnchorPoint: THREE.Object3D } {
    switch (id) {
      case 'smg':     return this.buildSMG();
      case 'shotgun': return this.buildShotgun();
      case 'sniper':  return this.buildSniper();
      case 'pistol':  return this.buildPistol();
      default:        return this.buildAssaultRifle();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  1. ASSAULT RIFLE
  // ═══════════════════════════════════════════════════════════════
  private buildAssaultRifle(): { gunGroup: THREE.Group; slideMesh: THREE.Mesh; muzzleAnchorPoint: THREE.Object3D } {
    const g = new THREE.Group();
    const dark = WeaponViewmodel.mats.dark(), steel = WeaponViewmodel.mats.steel(),
          poly = WeaponViewmodel.mats.polymer(), cyan = WeaponViewmodel.mats.neonCyan(),
          brass = WeaponViewmodel.mats.brass();

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x=0, y=0, z=0, rx=0, ry=0, rz=0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.rotation.set(rx,ry,rz);
      m.castShadow=true; g.add(m); return m;
    };

    // Receiver
    add(new THREE.BoxGeometry(0.065,0.085,0.32), dark, 0,0.02,-0.10);
    // Rail
    add(new THREE.BoxGeometry(0.045,0.015,0.38), steel, 0,0.07,-0.12);
    // Slide
    const slideMesh = add(new THREE.BoxGeometry(0.055,0.038,0.18), steel, 0,0.045,-0.05) as THREE.Mesh;
    add(new THREE.BoxGeometry(0.012,0.02,0.045), brass, 0.033,0.045,-0.04);
    // Handguard
    add(new THREE.BoxGeometry(0.058,0.075,0.28), dark, 0,0.02,-0.38);
    for (let i=0;i<3;i++) add(new THREE.BoxGeometry(0.063,0.012,0.022), steel, 0,-0.005,-0.31-i*0.05);
    // Barrel
    add(new THREE.CylinderGeometry(0.016,0.016,0.34,12), steel, 0,0.02,-0.495, Math.PI/2);
    // Muzzle brake
    add(new THREE.CylinderGeometry(0.024,0.022,0.065,10), steel, 0,0.02,-0.648, Math.PI/2);
    // Grip
    add(new THREE.BoxGeometry(0.042,0.14,0.055), poly, 0,-0.08,0.02, -0.3);
    // Mag
    const mg = new THREE.Group(); mg.position.set(0,-0.10,-0.10);
    const mag=new THREE.Mesh(new THREE.BoxGeometry(0.038,0.22,0.065),poly); mag.rotation.x=0.15; mg.add(mag);
    const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.042,0.02,0.07), steel);
    magBase.position.set(0, -0.11, 0.015);
    mg.add(magBase);
    g.add(mg);
    // Optic
    this.addHoloSight(g, 0, 0.095, -0.12, dark, steel);
    // Neon
    add(new THREE.BoxGeometry(0.068,0.008,0.26), cyan, 0,0.055,-0.38);
    add(new THREE.BoxGeometry(0.044,0.005,0.04), cyan, 0,-0.06,0.02);
    // Stock
    add(new THREE.BoxGeometry(0.048,0.06,0.18), dark, 0,0.01,0.22);
    add(new THREE.BoxGeometry(0.044,0.09,0.03), poly, 0,-0.005,0.325);

    const anchor = new THREE.Object3D(); anchor.position.set(0,0.02,-0.685); g.add(anchor);
    return { gunGroup: g, slideMesh, muzzleAnchorPoint: anchor };
  }

  // ═══════════════════════════════════════════════════════════════
  //  2. SMG — compact, boxy, dual magazines
  // ═══════════════════════════════════════════════════════════════
  private buildSMG(): { gunGroup: THREE.Group; slideMesh: THREE.Mesh; muzzleAnchorPoint: THREE.Object3D } {
    const g = new THREE.Group();
    const dark = WeaponViewmodel.mats.dark(), steel = WeaponViewmodel.mats.steel(),
          poly = WeaponViewmodel.mats.polymer(), red = WeaponViewmodel.mats.neonRed();

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x=0, y=0, z=0, rx=0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.rotation.x=rx;
      m.castShadow=true; g.add(m); return m;
    };

    // Compact receiver
    add(new THREE.BoxGeometry(0.060,0.090,0.22), dark, 0,0.02,-0.04);
    // Ejection slot
    add(new THREE.BoxGeometry(0.010,0.018,0.035), steel, 0.035,0.048,-0.02);
    // Short barrel
    add(new THREE.CylinderGeometry(0.013,0.013,0.20,10), steel, 0,0.02,-0.23, Math.PI/2);
    // Suppressor / flash hider
    add(new THREE.CylinderGeometry(0.020,0.018,0.06,8), dark, 0,0.02,-0.365, Math.PI/2);
    // Charging handle slide
    const slideMesh = add(new THREE.BoxGeometry(0.010,0.025,0.14), steel, 0.038,0.05,-0.04) as THREE.Mesh;
    // Grip
    add(new THREE.BoxGeometry(0.040,0.13,0.050), poly, 0,-0.075,-0.01, -0.25);
    // Double stack mag
    add(new THREE.BoxGeometry(0.034,0.18,0.052), poly, 0,-0.105,-0.06, 0.1);
    add(new THREE.BoxGeometry(0.038,0.015,0.055), steel, 0,-0.10,-0.06);
    // Folding stock (flat)
    add(new THREE.BoxGeometry(0.010,0.065,0.18), dark, 0.025,0.04,0.18);
    add(new THREE.BoxGeometry(0.010,0.065,0.18), dark, -0.025,0.04,0.18);
    add(new THREE.BoxGeometry(0.060,0.015,0.015), steel, 0,0.075,0.27);
    // Handguard short
    add(new THREE.BoxGeometry(0.055,0.065,0.16), dark, 0,0.015,-0.19);
    // Rail top
    add(new THREE.BoxGeometry(0.040,0.012,0.18), steel, 0,0.065,-0.05);
    // Neon red accent
    add(new THREE.BoxGeometry(0.062,0.006,0.14), red, 0,0.055,-0.19);
    // Mini red dot
    this.addHoloSight(g, 0, 0.085, -0.05, dark, steel, 0.8);

    const anchor = new THREE.Object3D(); anchor.position.set(0,0.02,-0.40); g.add(anchor);
    return { gunGroup: g, slideMesh, muzzleAnchorPoint: anchor };
  }

  // ═══════════════════════════════════════════════════════════════
  //  3. SHOTGUN — wide pump, thick barrel, wood accents
  // ═══════════════════════════════════════════════════════════════
  private buildShotgun(): { gunGroup: THREE.Group; slideMesh: THREE.Mesh; muzzleAnchorPoint: THREE.Object3D } {
    const g = new THREE.Group();
    const dark = WeaponViewmodel.mats.dark(), steel = WeaponViewmodel.mats.steel(),
          poly = WeaponViewmodel.mats.polymer(), wood = WeaponViewmodel.mats.wood(),
          cyan = WeaponViewmodel.mats.neonCyan();

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x=0, y=0, z=0, rx=0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.rotation.x=rx;
      m.castShadow=true; g.add(m); return m;
    };

    // Receiver — wide and bulky
    add(new THREE.BoxGeometry(0.080,0.095,0.30), dark, 0,0.02,-0.04);
    // Pump fore-end (slides back on pump action)
    const slideMesh = add(new THREE.BoxGeometry(0.075,0.070,0.18), wood, 0,0.01,-0.32) as THREE.Mesh;
    // Wide barrel (shotgun bore)
    add(new THREE.CylinderGeometry(0.022,0.022,0.40,12), steel, 0,0.025,-0.44, Math.PI/2);
    // Barrel rib on top
    add(new THREE.BoxGeometry(0.008,0.006,0.40), steel, 0,0.050,-0.44);
    // Muzzle — slightly flared
    add(new THREE.CylinderGeometry(0.026,0.022,0.04,10), steel, 0,0.025,-0.66, Math.PI/2);
    // Pistol grip
    add(new THREE.BoxGeometry(0.045,0.15,0.060), poly, 0,-0.085,0.02, -0.28);
    // Wood stock
    add(new THREE.BoxGeometry(0.055,0.078,0.22), wood, 0,0.018,0.22);
    add(new THREE.BoxGeometry(0.050,0.10,0.030), wood, 0,-0.010,0.34);
    // Tube magazine under barrel
    add(new THREE.CylinderGeometry(0.016,0.016,0.36,10), steel, 0,-0.008,-0.42, Math.PI/2);
    // Shell carrier
    add(new THREE.BoxGeometry(0.012,0.018,0.16), poly, 0.044,0.018,-0.24);
    // Neon strip on receiver
    add(new THREE.BoxGeometry(0.082,0.005,0.20), cyan, 0,0.058,-0.04);

    const anchor = new THREE.Object3D(); anchor.position.set(0,0.025,-0.68); g.add(anchor);
    return { gunGroup: g, slideMesh, muzzleAnchorPoint: anchor };
  }

  // ═══════════════════════════════════════════════════════════════
  //  4. SNIPER — long, sleek, big scope
  // ═══════════════════════════════════════════════════════════════
  private buildSniper(): { gunGroup: THREE.Group; slideMesh: THREE.Mesh; muzzleAnchorPoint: THREE.Object3D } {
    const g = new THREE.Group();
    const dark = WeaponViewmodel.mats.dark(), steel = WeaponViewmodel.mats.steel(),
          poly = WeaponViewmodel.mats.polymer(), cyan = WeaponViewmodel.mats.neonCyan(),
          chrome = WeaponViewmodel.mats.chrome();

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x=0, y=0, z=0, rx=0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.rotation.x=rx;
      m.castShadow=true; g.add(m); return m;
    };

    // Long receiver
    add(new THREE.BoxGeometry(0.058,0.080,0.42), dark, 0,0.02,-0.04);
    // Bolt handle
    const slideMesh = add(new THREE.BoxGeometry(0.006,0.006,0.08), steel, 0.038,0.055,-0.02) as THREE.Mesh;
    add(new THREE.SphereGeometry(0.012,8,8), chrome, 0.038,0.055,0.02);
    // Long heavy barrel
    add(new THREE.CylinderGeometry(0.013,0.013,0.58,12), steel, 0,0.018,-0.58, Math.PI/2);
    // Muzzle brake — large
    add(new THREE.CylinderGeometry(0.021,0.019,0.08,10), dark, 0,0.018,-0.91, Math.PI/2);
    // Bipod legs
    add(new THREE.BoxGeometry(0.006,0.14,0.006), steel, -0.022,  -0.055,-0.65, 0.18);
    add(new THREE.BoxGeometry(0.006,0.14,0.006), steel,  0.022, -0.055,-0.65, 0.18);
    // Thumbhole stock
    add(new THREE.BoxGeometry(0.045,0.07,0.26), poly, 0,0.01,0.25);
    add(new THREE.BoxGeometry(0.040,0.10,0.030), poly, 0,-0.015,0.40);
    // Pistol grip
    add(new THREE.BoxGeometry(0.040,0.14,0.052), poly, 0,-0.08,0.04, -0.3);
    // Short mag
    add(new THREE.BoxGeometry(0.036,0.12,0.058), dark, 0,-0.09,-0.07, 0.1);
    // ── Big Scope ──
    const scopeGroup = new THREE.Group(); scopeGroup.position.set(0,0.10,-0.08);
    // Tube
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.36,16), dark);
    scopeTube.rotation.x = Math.PI/2; scopeGroup.add(scopeTube);
    // Objective bell (front, larger)
    const objBell = new THREE.Mesh(new THREE.CylinderGeometry(0.030,0.022,0.06,16), dark);
    objBell.rotation.x = Math.PI/2; objBell.position.z = -0.20; scopeGroup.add(objBell);
    // Eyepiece bell (rear)
    const eyeBell = new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.022,0.04,16), dark);
    eyeBell.rotation.x = Math.PI/2; eyeBell.position.z = 0.19; scopeGroup.add(eyeBell);
    // Turrets
    const turretGeo = new THREE.CylinderGeometry(0.009,0.009,0.025,8);
    const turrL = new THREE.Mesh(turretGeo, chrome); turrL.position.set(0.030,0,0); scopeGroup.add(turrL);
    const turrT = new THREE.Mesh(turretGeo, chrome); turrT.rotation.z=Math.PI/2; turrT.position.set(0,0.030,0); scopeGroup.add(turrT);
    // Glass lens (transparent)
    const lensGeo = new THREE.CircleGeometry(0.026,24);
    const lensMat = new THREE.MeshPhysicalMaterial({ color:0x88aaff, transparent:true, opacity:0.08, transmission:0.95, depthWrite:false, side:THREE.DoubleSide });
    const lens = new THREE.Mesh(lensGeo, lensMat); lens.position.z=-0.225; scopeGroup.add(lens);
    // Crosshair dot
    const dotMat = new THREE.MeshBasicMaterial({ color:0xff2200, transparent:true, opacity:0.95, depthWrite:false });
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.003,12), dotMat); dot.position.z=-0.224; scopeGroup.add(dot);
    // Neon ring on scope
    const neonRing = new THREE.Mesh(new THREE.TorusGeometry(0.023,0.003,8,24), cyan);
    neonRing.position.z=-0.25; scopeGroup.add(neonRing);
    g.add(scopeGroup);

    const anchor = new THREE.Object3D(); anchor.position.set(0,0.018,-0.97); g.add(anchor);
    return { gunGroup: g, slideMesh, muzzleAnchorPoint: anchor };
  }

  // ═══════════════════════════════════════════════════════════════
  //  5. PISTOL — compact, elegant sidearm
  // ═══════════════════════════════════════════════════════════════
  private buildPistol(): { gunGroup: THREE.Group; slideMesh: THREE.Mesh; muzzleAnchorPoint: THREE.Object3D } {
    const g = new THREE.Group();
    const dark = WeaponViewmodel.mats.dark(), steel = WeaponViewmodel.mats.steel(),
          poly = WeaponViewmodel.mats.polymer(), cyan = WeaponViewmodel.mats.neonCyan();

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x=0, y=0, z=0, rx=0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.rotation.x=rx;
      m.castShadow=true; g.add(m); return m;
    };

    // Frame
    add(new THREE.BoxGeometry(0.048,0.12,0.18), dark, 0,-0.01,-0.02);
    // Slide (animated)
    const slideMesh = add(new THREE.BoxGeometry(0.050,0.065,0.18), steel, 0,0.055,-0.02) as THREE.Mesh;
    // Barrel (short, pokes out of slide)
    add(new THREE.CylinderGeometry(0.012,0.012,0.16,10), steel, 0,0.045,-0.16, Math.PI/2);
    // Muzzle
    add(new THREE.CylinderGeometry(0.014,0.012,0.024,10), steel, 0,0.045,-0.26, Math.PI/2);
    // Grip — ergonomic curve
    add(new THREE.BoxGeometry(0.044,0.14,0.060), poly, 0,-0.09,0.05, -0.15);
    // Trigger guard
    add(new THREE.TorusGeometry(0.022,0.004,6,12,Math.PI), steel, 0,-0.01,0.04, Math.PI/2);
    // Compact mag
    add(new THREE.BoxGeometry(0.038,0.11,0.052), dark, 0,-0.09,0.045, -0.15);
    // Rail under barrel
    add(new THREE.BoxGeometry(0.052,0.010,0.08), steel, 0,0.012,-0.10);
    // Neon strip
    add(new THREE.BoxGeometry(0.050,0.004,0.15), cyan, 0,0.09,-0.02);
    // Red dot mini optic
    this.addHoloSight(g, 0, 0.10, -0.02, dark, steel, 0.7);

    const anchor = new THREE.Object3D(); anchor.position.set(0,0.045,-0.275); g.add(anchor);
    return { gunGroup: g, slideMesh, muzzleAnchorPoint: anchor };
  }

  // ═══════════════════════════════════════════════════════════════
  //  SHARED: Holo Sight with glass lens + red dot
  // ═══════════════════════════════════════════════════════════════
  private addHoloSight(
    parent: THREE.Group,
    x: number, y: number, z: number,
    dark: THREE.Material, steel: THREE.Material,
    scale = 1.0
  ): void {
    const og = new THREE.Group(); og.position.set(x,y,z); og.scale.setScalar(scale);
    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.03, 0.09), dark);
    og.add(sightBase);

    const housing = new THREE.Mesh(new THREE.TorusGeometry(0.028,0.006,10,24), steel);
    housing.position.set(0,0.038,-0.01); og.add(housing);

    const lensMat = new THREE.MeshPhysicalMaterial({ color:0x88ddff, transparent:true, opacity:0.08, transmission:0.95, depthWrite:false, side:THREE.DoubleSide });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.022,24), lensMat);
    lens.position.set(0,0.038,-0.009); og.add(lens);

    const dotMat = new THREE.MeshBasicMaterial({ color:0xff2200, transparent:true, opacity:0.95, depthWrite:false });
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.003,12), dotMat);
    dot.position.set(0,0.038,-0.008); og.add(dot);

    parent.add(og);
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════
  public setWeapon(weaponId: string): void {
    if (!WEAPON_DEFINITIONS[weaponId] || weaponId === this.currentWeaponId) return;

    // 1. Cancel any pending muzzle flash timer so it doesn't reference stale objects
    if (this.muzzleFlashTimer !== null) {
      clearTimeout(this.muzzleFlashTimer);
      this.muzzleFlashTimer = null;
    }

    // 2. Remove flash children from the old anchor BEFORE removing the gun from the group.
    //    muzzleAnchor is a child of gunMesh, so removing gunMesh from group orphans it —
    //    clear its children first so we don't leak scene objects.
    while (this.muzzleAnchor.children.length > 0) {
      this.muzzleAnchor.remove(this.muzzleAnchor.children[0]);
    }
    this.group.remove(this.gunMesh);

    this.currentWeaponId  = weaponId;
    this.activeWeaponDef  = WEAPON_DEFINITIONS[weaponId];

    const { gunGroup, slideMesh, muzzleAnchorPoint } = this.buildGunMesh(weaponId);
    this.gunMesh      = gunGroup;
    this.slideMesh    = slideMesh;
    this.muzzleAnchor = muzzleAnchorPoint;
    this.group.add(this.gunMesh);

    // Re-attach flash effects to new anchor
    const flashGeo = new THREE.OctahedronGeometry(0.075, 0);
    const flashMat = new THREE.MeshBasicMaterial({ color:0xffd080, transparent:true, opacity:0, depthWrite:false });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.renderOrder = 999;
    this.muzzleAnchor.add(this.muzzleFlashMesh);

    const ringGeo = new THREE.TorusGeometry(0.06,0.02,6,8);
    const ringMat = new THREE.MeshBasicMaterial({ color:0x00f0ff, transparent:true, opacity:0, depthWrite:false });
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.name='muzzleRing';
    this.muzzleAnchor.add(ring);

    this.muzzleFlashLight = new THREE.PointLight(0xffc060,0,8);
    this.muzzleAnchor.add(this.muzzleFlashLight);

    // Reset offsets
    this.recoilOffset.set(0,0,0);
    this.recoilRot.set(0,0,0);
    this.slideKick = 0;
  }

  public setParticleSystem(particles: ParticleSystem): void {
    this.particles = particles;
  }

  public getMuzzleWorldPosition(): THREE.Vector3 {
    const pos = new THREE.Vector3();
    this.muzzleAnchor.getWorldPosition(pos);
    return pos;
  }

  public triggerRecoil(): void {
    const recoilDef = this.activeWeaponDef.recoil;

    this.recoilOffset.z += 0.14;
    this.recoilOffset.y += 0.04;
    this.recoilRot.x += recoilDef.verticalKick * 2.2;
    this.recoilRot.y += (Math.random() - 0.5) * recoilDef.horizontalKick * 2.0;
    this.slideKick = 0.09;

    // Muzzle flash burst
    this.muzzleFlashLight.intensity = 14.0;
    const flashMat = this.muzzleFlashMesh.material as THREE.MeshBasicMaterial;
    flashMat.opacity = 1.0;
    this.muzzleFlashMesh.scale.setScalar(0.8 + Math.random() * 0.6);
    this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI;

    const ring = this.muzzleAnchor.getObjectByName('muzzleRing') as THREE.Mesh | undefined;
    if (ring) {
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.8;
      ring.rotation.z = Math.random() * Math.PI;
    }

    if (this.muzzleFlashTimer !== null) clearTimeout(this.muzzleFlashTimer);
    this.muzzleFlashTimer = setTimeout(() => {
      this.muzzleFlashLight.intensity = 0;
      flashMat.opacity = 0;
      if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = 0;
      this.muzzleFlashTimer = null;
    }, 50);

    // Eject shell
    if (this.particles) {
      const worldPos  = new THREE.Vector3();
      const rightDir  = new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);
      const upDir     = new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion);
      const fwdDir    = new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);
      this.group.getWorldPosition(worldPos);
      worldPos.add(rightDir.clone().multiplyScalar(0.18));
      worldPos.add(upDir.clone().multiplyScalar(0.02));
      worldPos.add(fwdDir.clone().multiplyScalar(-0.15));
      this.particles.spawnEjectedShell(worldPos, rightDir, upDir);
    }
  }

  private static readonly ZERO_V3 = new THREE.Vector3(0, 0, 0);

  public update(isADS: boolean, mouseDeltaX: number, mouseDeltaY: number, dt: number, isSliding = false, isSprinting = false, isMoving = false): void {
    // Advance timers
    this.idleTimer += dt;

    // ── Idle breathing animation ──
    // Slow sine wave: slight y bob + x roll + z push-pull
    const breathY  = Math.sin(this.idleTimer * 1.2) * 0.004;
    const breathX  = Math.cos(this.idleTimer * 0.8) * 0.002;
    const breathRotX = Math.sin(this.idleTimer * 1.0) * 0.008;

    // ── Sprint lean: tilt gun right & forward when sprinting ──
    const sprintTarget = (isSprinting && !isADS) ? 1.0 : 0.0;
    this.sprintLean += (sprintTarget - this.sprintLean) * Math.min(dt * 8.0, 1.0);

    // ── ADS smooth transition tracking ──
    const adsTarget = isADS ? 1.0 : 0.0;
    this.adsLean += (adsTarget - this.adsLean) * Math.min(dt * 12.0, 1.0);

    // Determine target position — do NOT mutate this.hipPos / this.adsPos
    let targetPos: THREE.Vector3;
    if (isSliding) {
      targetPos = new THREE.Vector3(
        this.hipPos.x + 0.06,
        this.hipPos.y - 0.10,
        this.hipPos.z + 0.05
      );
    } else if (isSprinting && !isADS) {
      // Sprint: gun tilts right, raises slightly, pulls back
      targetPos = new THREE.Vector3(
        this.hipPos.x + 0.10,
        this.hipPos.y + 0.05,
        this.hipPos.z + 0.08
      );
    } else {
      targetPos = isADS ? this.adsPos : this.hipPos;
    }

    this.currentPos.lerp(targetPos, Math.min(dt * 16.0, 1.0));

    const swayX = -mouseDeltaX * 0.0003;
    const swayY = -mouseDeltaY * 0.0003;

    const recovery = this.activeWeaponDef.recoil.recoverySpeed;
    this.recoilOffset.lerp(WeaponViewmodel.ZERO_V3, Math.min(dt * recovery, 1.0));
    this.recoilRot.lerp(WeaponViewmodel.ZERO_V3, Math.min(dt * recovery, 1.0));
    this.slideKick += (0 - this.slideKick) * Math.min(dt * 22.0, 1.0);

    if (this.slideMesh) {
      this.slideMesh.position.z = -0.05 + this.slideKick;
    }

    const slideTilt   = isSliding ? 0.35 : 0;
    const sprintTiltZ = this.sprintLean * 0.18;   // roll gun right during sprint
    const sprintTiltX = this.sprintLean * 0.12;   // tip forward during sprint

    // ADS suppresses idle breathing
    const breathScale = 1.0 - this.adsLean;

    this.group.position.set(
      this.currentPos.x + swayX + this.recoilOffset.x + breathX * breathScale,
      this.currentPos.y + swayY + this.recoilOffset.y + breathY * breathScale,
      this.currentPos.z + this.recoilOffset.z
    );

    this.group.rotation.set(
      this.recoilRot.x + breathRotX * breathScale + sprintTiltX,
      swayX * 2 + this.recoilRot.y,
      swayX * -1.5 + slideTilt + sprintTiltZ
    );
  }
}
