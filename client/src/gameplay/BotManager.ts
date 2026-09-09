import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { TEST_MAP } from '@fps/shared';
import { AudioEngine } from '../core/AudioEngine.js';
import { ParticleSystem } from '../rendering/Particles.js';

export enum BotState {
  PATROL = 'PATROL',
  CHASE_FLANK = 'CHASE_FLANK',
  ENGAGE = 'ENGAGE',
  TAKE_COVER = 'TAKE_COVER'
}

export type BotRole = 'Aggressor' | 'FlankerLeft' | 'FlankerRight' | 'CoverRifleman';

interface BotDef {
  id: string;
  position: THREE.Vector3;
  patrolRadius: number;
  color: number;
  role: BotRole;
}

interface Bot {
  id: string;
  role: BotRole;
  state: BotState;
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  armLPivot: THREE.Group;
  armRPivot: THREE.Group;
  gunMesh: THREE.Group;
  muzzleAnchor: THREE.Object3D;
  laserLine: THREE.Line;
  healthBarFill: THREE.Mesh;
  healthBarBg: THREE.Mesh;
  badgeCanvas: HTMLCanvasElement;
  badgeTexture: THREE.CanvasTexture;
  health: number;
  maxHealth: number;
  isDead: boolean;
  spawnPos: THREE.Vector3;
  patrolRadius: number;
  patrolAngle: number;
  patrolSpeed: number;
  bobTimer: number;
  hitFlashTimer: number;
  deathTimer: number;
  lastFireTime: number;
  burstCount: number;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  bodyMat: THREE.MeshStandardMaterial;
  originalColor: number;
  zombieMesh?: THREE.Group;
  mixer?: THREE.AnimationMixer;
}

const BOT_DEFINITIONS: BotDef[] = [
  { id: 'bot_1',  position: new THREE.Vector3(18, 0, -18),  patrolRadius: 10, color: 0xff0044, role: 'Aggressor' },
  { id: 'bot_2',  position: new THREE.Vector3(-22, 0, 18),  patrolRadius: 12, color: 0xff0044, role: 'FlankerLeft' },
  { id: 'bot_3',  position: new THREE.Vector3(-58, 0, -55), patrolRadius: 14, color: 0xaa0033, role: 'CoverRifleman' },
  { id: 'bot_4',  position: new THREE.Vector3(62, 0, -58),  patrolRadius: 15, color: 0xaa0033, role: 'FlankerRight' },
  { id: 'bot_5',  position: new THREE.Vector3(-65, 0, 48),  patrolRadius: 12, color: 0xaa0033, role: 'FlankerLeft' },
  { id: 'bot_6',  position: new THREE.Vector3(58, 0, 62),   patrolRadius: 14, color: 0xff2255, role: 'CoverRifleman' },
  { id: 'bot_7',  position: new THREE.Vector3(-35, 0, -10), patrolRadius: 10, color: 0xff2255, role: 'Aggressor' },
  { id: 'bot_8',  position: new THREE.Vector3(38, 0, 12),   patrolRadius: 11, color: 0xff2255, role: 'FlankerRight' },
  { id: 'bot_9',  position: new THREE.Vector3(0, 0, -68),   patrolRadius: 16, color: 0x6366f1, role: 'Aggressor' },
  { id: 'bot_10', position: new THREE.Vector3(0, 0, 68),    patrolRadius: 16, color: 0x6366f1, role: 'FlankerLeft' },
  { id: 'bot_11', position: new THREE.Vector3(-68, 0, -10), patrolRadius: 15, color: 0x38bdf8, role: 'Aggressor' },
  { id: 'bot_12', position: new THREE.Vector3(68, 0, 10),   patrolRadius: 15, color: 0x38bdf8, role: 'FlankerRight' },
  { id: 'bot_13', position: new THREE.Vector3(-40, 0, 50),  patrolRadius: 12, color: 0xa855f7, role: 'Aggressor' },
  { id: 'bot_14', position: new THREE.Vector3(42, 0, -45),  patrolRadius: 13, color: 0xa855f7, role: 'FlankerLeft' },
  { id: 'bot_15', position: new THREE.Vector3(28, 0, -32),  patrolRadius: 9,  color: 0xf59e0b, role: 'Aggressor' },
  { id: 'bot_16', position: new THREE.Vector3(-28, 0, 32),  patrolRadius: 9,  color: 0xf59e0b, role: 'FlankerRight' },
];

export class BotManager {
  private bots: Bot[] = [];
  private lastHitWorldPos: THREE.Vector3 | null = null;

  constructor(private scene: THREE.Scene) {
    for (const def of BOT_DEFINITIONS) {
      this.bots.push(this.createBot(def));
    }
    this.loadZombieAssets();
  }

  private loadZombieAssets(): void {
    const textureLoader = new THREE.TextureLoader();
    const fbxLoader = new FBXLoader();
    const gltfLoader = new GLTFLoader();

    // 1. Load Polyart Zombie FBX model
    textureLoader.load('/models/zombie/textures/world_people_colors.png', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      fbxLoader.load('/models/zombie/source/zombie_ani_player.fbx', (fbx) => {        fbx.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.material = new THREE.MeshStandardMaterial({
              map: texture,
              roughness: 0.55,
              metalness: 0.15
            });
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        // Scale FBX to 1.75m (just under player 1.8m) using bounding box
        const fbxBbox = new THREE.Box3().setFromObject(fbx);
        const fbxRawH = fbxBbox.max.y - fbxBbox.min.y;
        const fbxTargetScale = fbxRawH > 0 ? (1.75 / fbxRawH) : 0.024;
        fbx.scale.setScalar(fbxTargetScale);

        for (let i = 0; i < this.bots.length; i++) {
          const bot = this.bots[i];
          const zombieClone = SkeletonUtils.clone(fbx) as THREE.Group;
          zombieClone.position.set(0, 0, 0);

          const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
          const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
          const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
          const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
          eyeL.position.set(-0.10, 1.68, 0.15);
          eyeR.position.set(0.10, 1.68, 0.15);
          zombieClone.add(eyeL);
          zombieClone.add(eyeR);

          bot.group.add(zombieClone);
          bot.zombieMesh = zombieClone;

          bot.bodyMesh.visible = false;
          bot.headMesh.visible = false;
          bot.legL.visible = false;
          bot.legR.visible = false;

          if (fbx.animations && fbx.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(zombieClone);
            const action = mixer.clipAction(fbx.animations[0]);
            action.play();
            bot.mixer = mixer;
          }
        }

        // 2. Load Zombie Schoolgirl GLB model (extracted from Blender.zip)
        gltfLoader.load('/models/zombie/zombie_schoolgirl.glb', (gltf) => {
          const schoolgirlModel = gltf.scene;
          schoolgirlModel.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Scale Schoolgirl model to 1.75m — matches player height (1.8m) for consistent threat feel
          const bbox = new THREE.Box3().setFromObject(schoolgirlModel);
          const rawHeight = bbox.max.y - bbox.min.y;
          const targetScale = rawHeight > 0 ? (1.75 / rawHeight) : 1.0;
          schoolgirlModel.scale.setScalar(targetScale);

          // Assign Schoolgirl 3D model to even-numbered bots
          for (let i = 0; i < this.bots.length; i += 2) {
            const bot = this.bots[i];
            if (bot.zombieMesh) {
              bot.group.remove(bot.zombieMesh);
            }
            const clone = SkeletonUtils.clone(schoolgirlModel) as THREE.Group;
            clone.position.set(0, 0, 0);

            const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
            const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
            const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
            eyeL.position.set(-0.10, 1.68, 0.15);
            eyeR.position.set(0.10, 1.68, 0.15);
            clone.add(eyeL);
            clone.add(eyeR);

            bot.group.add(clone);
            bot.zombieMesh = clone;

            if (gltf.animations && gltf.animations.length > 0) {
              const mixer = new THREE.AnimationMixer(clone);
              const action = mixer.clipAction(gltf.animations[0]);
              action.play();
              bot.mixer = mixer;
            }
          }
        });
      }, undefined, (fbxErr) => {
        // FBX asset missing or failed to parse — bots remain as procedural meshes
        console.warn('[BotManager] FBX zombie asset failed to load, using procedural bot meshes:', fbxErr);
        // Load GLB schoolgirl only (no FBX dependency)
        gltfLoader.load('/models/zombie/zombie_schoolgirl.glb', (gltf) => {
          const schoolgirlModel = gltf.scene;
          schoolgirlModel.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          const bbox = new THREE.Box3().setFromObject(schoolgirlModel);
          const rawHeight = bbox.max.y - bbox.min.y;
          const targetScale = rawHeight > 0 ? (1.75 / rawHeight) : 1.0;
          schoolgirlModel.scale.setScalar(targetScale);

          for (let i = 0; i < this.bots.length; i++) {
            const bot = this.bots[i];
            const clone = SkeletonUtils.clone(schoolgirlModel) as THREE.Group;
            clone.position.set(0, 0, 0);
            bot.group.add(clone);
            bot.zombieMesh = clone;
            bot.bodyMesh.visible = false;
            bot.headMesh.visible = false;
            bot.legL.visible = false;
            bot.legR.visible = false;
            if (gltf.animations && gltf.animations.length > 0) {
              const mixer = new THREE.AnimationMixer(clone);
              mixer.clipAction(gltf.animations[0]).play();
              bot.mixer = mixer;
            }
          }
        });
      });
    });
  }

  private createBot(def: BotDef): Bot {
    const group = new THREE.Group();
    group.position.copy(def.position).setY(0);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: def.color,
      metalness: 0.3,
      roughness: 0.5,
      emissive: def.color,
      emissiveIntensity: 0.12
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111622, roughness: 0.8 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
    const neonCyanMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 1.8 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xff0055, emissive: 0xff0055, emissiveIntensity: 0.8 });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.52, 0.65, 0.28);
    const bodyMesh = new THREE.Mesh(torsoGeo, bodyMat);
    bodyMesh.position.y = 1.15;
    bodyMesh.castShadow = true;
    bodyMesh.visible = false; // hidden — GLB zombie replaces this
    group.add(bodyMesh);

    // Neon chest stripe (hidden)
    const stripeGeo = new THREE.BoxGeometry(0.54, 0.06, 0.29);
    const stripe = new THREE.Mesh(stripeGeo, glowMat);
    stripe.position.set(0, 1.2, 0);
    stripe.visible = false;
    group.add(stripe);

    // Head
    const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.3);
    const headMesh = new THREE.Mesh(headGeo, bodyMat);
    headMesh.position.y = 1.69;
    headMesh.castShadow = true;
    headMesh.visible = false; // hidden — GLB zombie replaces this
    group.add(headMesh);

    // Visor glow (hidden)
    const visorGeo = new THREE.BoxGeometry(0.28, 0.10, 0.31);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0xff0044, emissive: 0xff0044, emissiveIntensity: 1.5, transparent: true, opacity: 0.9 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.70, 0);
    visor.visible = false;
    group.add(visor);

    // ── Left Arm Pivot — hidden, GLB zombie has its own arms ──
    const armLPivot = new THREE.Group();
    armLPivot.position.set(-0.35, 1.35, 0);
    armLPivot.visible = false;
    const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), darkMat);
    armLMesh.position.set(0, 0, 0.20);
    armLMesh.rotation.x = Math.PI / 2;
    armLPivot.add(armLMesh);
    group.add(armLPivot);

    // ── Right Arm & Weapon Pivot — hidden ──
    const armRPivot = new THREE.Group();
    armRPivot.position.set(0.35, 1.35, 0);
    armRPivot.visible = false;
    const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), darkMat);
    armRMesh.position.set(0, 0, 0.20);
    armRMesh.rotation.x = Math.PI / 2;
    armRPivot.add(armRMesh);
    group.add(armRPivot);

    // Legs — hidden
    const legGeo = new THREE.BoxGeometry(0.18, 0.6, 0.18);
    const legL = new THREE.Mesh(legGeo, darkMat); legL.position.set(-0.14, 0.5, 0); legL.visible = false; group.add(legL);
    const legR = new THREE.Mesh(legGeo, darkMat); legR.position.set(0.14, 0.5, 0); legR.visible = false; group.add(legR);

    // ── 3D CYBERPUNK PLASMA RIFLE (Attached directly to right hand pivot) ──
    const gunMesh = new THREE.Group();

    // Receiver
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.48), darkMat);
    gunBody.castShadow = true;
    gunMesh.add(gunBody);

    // Metallic Barrel (extending forward along +Z)
    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.38, 10), chromeMat);
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position.set(0, 0.02, 0.42);
    gunBarrel.castShadow = true;
    gunMesh.add(gunBarrel);

    // Muzzle Brake
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.08, 10), darkMat);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0, 0.02, 0.63);
    gunMesh.add(muzzleBrake);

    // Glowing Neon Energy Magazine (Cyan)
    const gunMag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.22, 0.10), neonCyanMat);
    gunMag.position.set(0, -0.14, 0.06);
    gunMag.rotation.x = -0.2;
    gunMesh.add(gunMag);

    // Holographic Optic Sight (Neon Red)
    const sightMat = new THREE.MeshStandardMaterial({ color: 0xff0055, emissive: 0xff0055, emissiveIntensity: 1.5 });
    const gunSight = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.06, 0.12), sightMat);
    gunSight.position.set(0, 0.10, 0.08);
    gunMesh.add(gunSight);

    // Position weapon in hand
    gunMesh.position.set(-0.04, 0, 0.25);
    gunMesh.visible = false; // Zombies do not hold guns!
    armRPivot.add(gunMesh);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.02, 0.68);
    gunMesh.add(muzzleAnchor);

    // ── Targeting Laser Sight Beam (pointing forward +Z towards target) ──
    const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 35)]);
    const laserMat = new THREE.LineBasicMaterial({ color: 0xff0044, transparent: true, opacity: 0.65 });
    const laserLine = new THREE.Line(laserGeo, laserMat);
    laserLine.visible = false;
    muzzleAnchor.add(laserLine);

    // ── Health Bar & Tactical Badge Billboard ──
    const hbGroup = new THREE.Group();
    hbGroup.position.set(0, 2.25, 0);

    const bgGeo = new THREE.PlaneGeometry(0.7, 0.1);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x110008, transparent: true, opacity: 0.8, depthWrite: false });
    const healthBarBg = new THREE.Mesh(bgGeo, bgMat);
    hbGroup.add(healthBarBg);

    const fillGeo = new THREE.PlaneGeometry(0.68, 0.08);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.95, depthWrite: false });
    const healthBarFill = new THREE.Mesh(fillGeo, fillMat);
    healthBarFill.position.z = 0.001;
    hbGroup.add(healthBarFill);

    // Dynamic Canvas Badge for AI State
    const badgeCanvas = document.createElement('canvas');
    badgeCanvas.width = 256; badgeCanvas.height = 64;
    const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
    const badgeMat = new THREE.MeshBasicMaterial({ map: badgeTexture, transparent: true, depthWrite: false });
    const badgeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), badgeMat);
    badgeMesh.position.set(0, 0.18, 0.002);
    hbGroup.add(badgeMesh);

    group.add(hbGroup);
    this.scene.add(group);

    return {
      id: def.id,
      role: def.role,
      state: BotState.PATROL,
      group,
      bodyMesh,
      headMesh,
      armLPivot,
      armRPivot,
      gunMesh,
      muzzleAnchor,
      laserLine,
      healthBarFill,
      healthBarBg,
      badgeCanvas,
      badgeTexture,
      health: 100,
      maxHealth: 100,
      isDead: false,
      spawnPos: def.position.clone(),
      patrolRadius: def.patrolRadius,
      patrolAngle: Math.random() * Math.PI * 2,
      patrolSpeed: 0.5 + Math.random() * 0.4,
      bobTimer: Math.random() * Math.PI * 2,
      hitFlashTimer: 0,
      deathTimer: 0,
      lastFireTime: 0,
      burstCount: 0,
      legL,
      legR,
      bodyMat,
      originalColor: def.color
    };
  }

  private rayIntersectAABB(
    rayOrigin: THREE.Vector3,
    rayDir: THREE.Vector3,
    boxPos: { x: number; y: number; z: number },
    boxSize: { x: number; y: number; z: number }
  ): number | null {
    const minX = boxPos.x - boxSize.x / 2;
    const maxX = boxPos.x + boxSize.x / 2;
    const minY = boxPos.y - boxSize.y / 2;
    const maxY = boxPos.y + boxSize.y / 2;
    const minZ = boxPos.z - boxSize.z / 2;
    const maxZ = boxPos.z + boxSize.z / 2;

    const invX = Math.abs(rayDir.x) > 1e-8 ? 1.0 / rayDir.x : (rayDir.x >= 0 ? 1e8 : -1e8);
    const invY = Math.abs(rayDir.y) > 1e-8 ? 1.0 / rayDir.y : (rayDir.y >= 0 ? 1e8 : -1e8);
    const invZ = Math.abs(rayDir.z) > 1e-8 ? 1.0 / rayDir.z : (rayDir.z >= 0 ? 1e8 : -1e8);

    const tx1 = (minX - rayOrigin.x) * invX;
    const tx2 = (maxX - rayOrigin.x) * invX;
    let tmin = Math.min(tx1, tx2);
    let tmax = Math.max(tx1, tx2);

    const ty1 = (minY - rayOrigin.y) * invY;
    const ty2 = (maxY - rayOrigin.y) * invY;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));

    const tz1 = (minZ - rayOrigin.z) * invZ;
    const tz2 = (maxZ - rayOrigin.z) * invZ;
    tmin = Math.max(tmin, Math.min(tz1, tz2));
    tmax = Math.min(tmax, Math.max(tz1, tz2));

    if (tmax >= Math.max(0, tmin) && tmin > 0.05) {
      return tmin;
    }
    return null;
  }

  /** Ray-AABB Box intersection test for Line of Sight checking */
  private checkLineOfSight(fromPos: THREE.Vector3, toPos: THREE.Vector3): boolean {
    const rayDir = toPos.clone().sub(fromPos);
    const maxDist = rayDir.length();
    if (maxDist < 0.2) return true;
    rayDir.normalize();

    for (const obs of TEST_MAP.obstacles) {
      const hitDist = this.rayIntersectAABB(fromPos, rayDir, obs.position, obs.size);
      if (hitDist !== null && hitDist > 0.1 && hitDist < maxDist - 0.4) {
        return false; // Wall blocks line of sight!
      }
    }
    return true; // Clear Line of Sight
  }

  /** Attempt to damage a bot from player weapon hitscan */
  public tryHit(rayOrigin: THREE.Vector3, rayDir: THREE.Vector3, range: number, damage: number): {
    hit: boolean; isHeadshot: boolean; botId: string; isFatal: boolean; distance: number;
  } | null {
    let closestDist = Infinity;
    let closestBot: Bot | null = null;
    let closestIsHead = false;

    const normDir = rayDir.clone().normalize();

    for (const bot of this.bots) {
      if (bot.isDead) continue;

      const botTargetPos = bot.group.position.clone().setY(bot.group.position.y + 0.9);
      if (!this.checkLineOfSight(rayOrigin, botTargetPos)) continue;

      const toBot = botTargetPos.clone().sub(rayOrigin);
      const dot = toBot.dot(normDir);
      if (dot < 0 || dot > range) continue;

      const perpSq = toBot.lengthSq() - dot * dot;
      if (perpSq > 0.55 * 0.55) continue;

      const closestPt = rayOrigin.clone().addScaledVector(normDir, dot);
      const localY = closestPt.y - bot.group.position.y;
      const isHead = localY >= 1.48 && localY <= 1.9;

      if (dot < closestDist) {
        closestDist = dot;
        closestBot = bot;
        closestIsHead = isHead;
      }
    }

    if (!closestBot) return null;

    const mult = closestIsHead ? 2.0 : 1.0;
    const actualDamage = damage * mult;
    closestBot.health = Math.max(0, closestBot.health - actualDamage);
    closestBot.hitFlashTimer = 0.12;
    this.updateHealthBar(closestBot);

    if (closestBot.health < 45) {
      closestBot.state = BotState.TAKE_COVER;
    } else {
      closestBot.state = BotState.ENGAGE;
    }

    this.alertSquad(closestBot.group.position);

    this.lastHitWorldPos = rayOrigin.clone().addScaledVector(normDir, closestDist);

    const isFatal = closestBot.health <= 0;
    if (isFatal) {
      this.killBot(closestBot);
    }

    return { hit: true, isHeadshot: closestIsHead, botId: closestBot.id, isFatal, distance: closestDist };
  }

  public damageInRadius(origin: THREE.Vector3, radius: number, maxDamage: number): { killsCount: number } {
    let killsCount = 0;
    for (const bot of this.bots) {
      if (bot.isDead) continue;
      const dist = bot.group.position.distanceTo(origin);
      if (dist <= radius) {
        const falloff = 1.0 - (dist / radius);
        const damage = maxDamage * Math.max(0.2, falloff);
        bot.health = Math.max(0, bot.health - damage);
        bot.hitFlashTimer = 0.25;
        this.updateHealthBar(bot);
        if (bot.health <= 0) {
          killsCount++;
          this.killBot(bot);
        } else {
          bot.state = BotState.TAKE_COVER;
        }
      }
    }
    return { killsCount };
  }

  public getLastHitWorldPos(): THREE.Vector3 | null {
    return this.lastHitWorldPos;
  }

  private alertSquad(alertPos: THREE.Vector3): void {
    for (const b of this.bots) {
      if (b.isDead || b.state === BotState.TAKE_COVER) continue;
      if (b.group.position.distanceTo(alertPos) < 30) {
        b.state = b.role === 'Aggressor' ? BotState.ENGAGE : BotState.CHASE_FLANK;
      }
    }
  }

  private updateHealthBar(bot: Bot): void {
    const pct = bot.health / bot.maxHealth;
    bot.healthBarFill.scale.x = Math.max(0.001, pct);
    bot.healthBarFill.position.x = -0.34 * (1 - pct);

    const color = new THREE.Color();
    color.setHSL(pct * 0.33, 1.0, 0.5);
    (bot.healthBarFill.material as THREE.MeshBasicMaterial).color.set(color);

    const ctx = bot.badgeCanvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = bot.state === BotState.ENGAGE ? '#ff0055' : bot.state === BotState.TAKE_COVER ? '#ffaa00' : '#00f0ff';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`[${bot.role.toUpperCase()}: ${bot.state}]`, 128, 42);
      bot.badgeTexture.needsUpdate = true;
    }
  }

  private killBot(bot: Bot): void {
    bot.isDead = true;
    bot.deathTimer = 0;
    bot.laserLine.visible = false;
    bot.group.rotation.x = Math.PI / 2;
    bot.group.position.y = -0.3;
    bot.bodyMat.emissiveIntensity = 0;
    bot.bodyMat.color.set(0x222222);
    bot.healthBarBg.visible = false;
    bot.healthBarFill.visible = false;
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    camera: THREE.Camera,
    audioEngine: AudioEngine,
    particles: ParticleSystem,
    onPlayerDamage: (damage: number, attackerPos: THREE.Vector3) => void
  ): void {
    const now = performance.now();

    for (const bot of this.bots) {
      if (bot.mixer && !bot.isDead) {
        bot.mixer.update(dt);
      }

      if (bot.isDead) {
        bot.deathTimer += dt;
        if (bot.deathTimer >= 5.0) {
          this.respawnBot(bot);
        }
        continue;
      }

      const distToPlayer = bot.group.position.distanceTo(playerPos);
      const botHeadPos   = bot.group.position.clone().setY(1.69);
      const hasLOS       = this.checkLineOfSight(botHeadPos, playerPos);

      // Vision cone check (140° forward field of view)
      const botFacing = new THREE.Vector3(Math.sin(bot.group.rotation.y), 0, Math.cos(bot.group.rotation.y));
      const toPlayer  = playerPos.clone().sub(botHeadPos).normalize();
      const inVisionCone = botFacing.dot(toPlayer) > 0.25;

      // ── Strategic Vision & Detection Decision Matrix ──
      // Bot CANNOT spot player through walls or from behind unless player is within close range or shoots
      if (distToPlayer < 32 && hasLOS && inVisionCone && bot.state === BotState.PATROL) {
        bot.state = bot.role === 'Aggressor' ? BotState.ENGAGE : BotState.CHASE_FLANK;
      } else if (!hasLOS && bot.state === BotState.ENGAGE && distToPlayer > 18) {
        // Lost line of sight behind cover: flank or search
        bot.state = BotState.CHASE_FLANK;
      } else if (distToPlayer > 45 && bot.state !== BotState.PATROL) {
        bot.state = BotState.PATROL;
      }

      let targetDest = playerPos.clone();

      if (bot.state === BotState.PATROL) {
        bot.laserLine.visible = false;
        bot.patrolAngle += bot.patrolSpeed * dt;
        targetDest.x = bot.spawnPos.x + Math.cos(bot.patrolAngle) * bot.patrolRadius;
        targetDest.z = bot.spawnPos.z + Math.sin(bot.patrolAngle) * bot.patrolRadius;
      } else if (bot.state === BotState.CHASE_FLANK || bot.state === BotState.ENGAGE) {
        bot.laserLine.visible = false;
        // Surround player from individual 360 degree angles so each zombie model travels on its own path
        const botIndex = this.bots.indexOf(bot);
        const totalBots = this.bots.length;
        const surroundAngle = (botIndex / totalBots) * Math.PI * 2 + Math.sin(now * 0.0008 + botIndex * 1.7) * 0.5;
        const surroundRadius = 1.8 + (botIndex % 5) * 1.1; // Spread out surround distance (1.8m to 6.2m)
        targetDest = playerPos.clone().add(new THREE.Vector3(
          Math.cos(surroundAngle) * surroundRadius,
          0,
          Math.sin(surroundAngle) * surroundRadius
        ));
      } else if (bot.state === BotState.TAKE_COVER) {
        bot.laserLine.visible = false;
        let nearestCover = new THREE.Vector3(TEST_MAP.obstacles[0].position.x, 0, TEST_MAP.obstacles[0].position.z);
        let minDist = Infinity;
        for (const obs of TEST_MAP.obstacles) {
          const d = bot.group.position.distanceTo(new THREE.Vector3(obs.position.x, 0, obs.position.z));
          if (d < minDist) {
            minDist = d;
            nearestCover = new THREE.Vector3(obs.position.x, 0, obs.position.z);
          }
        }
        targetDest = nearestCover;
        if (bot.group.position.distanceTo(nearestCover) < 2.0) {
          bot.health = Math.min(bot.maxHealth, bot.health + dt * 15);
          this.updateHealthBar(bot);
          if (bot.health > 80 && hasLOS) bot.state = BotState.ENGAGE;
        }
      }

      // ── Movement & Zombie Horde Separation Force ──
      const dx = targetDest.x - bot.group.position.x;
      const dz = targetDest.z - bot.group.position.z;
      const moveLen = Math.hypot(dx, dz);

      // Strong Mutual Boids Repulsion to prevent zombies from forming formations or clumping!
      let sepX = 0, sepZ = 0;
      for (const other of this.bots) {
        if (other.id === bot.id || other.isDead) continue;
        const ox = bot.group.position.x - other.group.position.x;
        const oz = bot.group.position.z - other.group.position.z;
        const dSq = ox * ox + oz * oz;
        if (dSq < 25.0 && dSq > 0.01) { // within 5.0 meters radius
          const d = Math.sqrt(dSq);
          sepX += (ox / d) * (5.0 - d) * 3.5;
          sepZ += (oz / d) * (5.0 - d) * 3.5;
        }
      }

      const botIndex = this.bots.indexOf(bot);
      // Unique movement speed per zombie (2.8 to 5.2 m/s) so no two zombies march in sync
      const moveSpeed = 2.8 + (botIndex % 5) * 0.6;

      if (moveLen > 0.2) {
        const vx = (dx / moveLen) * moveSpeed + sepX;
        const vz = (dz / moveLen) * moveSpeed + sepZ;
        const vLen = Math.hypot(vx, vz);
        if (vLen > 0.01) {
          bot.group.position.x += (vx / vLen) * moveSpeed * dt;
          bot.group.position.z += (vz / vLen) * moveSpeed * dt;
        }
      }

      // Face player & raise zombie claw arms
      if (distToPlayer < 40) {
        const lookX = playerPos.x - bot.group.position.x;
        const lookZ = playerPos.z - bot.group.position.z;
        bot.group.rotation.y = Math.atan2(lookX, lookZ);

        bot.armRPivot.rotation.x = -0.6 + Math.sin(bot.bobTimer * 2) * 0.15;
        bot.armLPivot.rotation.x = -0.6 + Math.sin(bot.bobTimer * 2 + Math.PI) * 0.15;
      }

      // ── Zombie Melee Attack Logic (Bite / Claw Slash when close!) ──
      if (distToPlayer < 2.5 && !bot.isDead) {
        if (now - bot.lastFireTime > 850) {
          bot.lastFireTime = now;
          audioEngine.playZombieAttack();

          // Spawn blood claw slash particles
          const clawPos = playerPos.clone();
          particles.spawnImpactSparks(clawPos, new THREE.Vector3(0, 1, 0));

          const rawDamage = 16 + Math.floor(Math.random() * 10);
          onPlayerDamage(rawDamage, bot.group.position);
        }
      } else if (moveLen > 0.1) {
        bot.group.rotation.y = Math.atan2(dx, dz);
        bot.armRPivot.rotation.x = Math.sin(bot.bobTimer) * 0.15;
        bot.armLPivot.rotation.x = Math.sin(bot.bobTimer + Math.PI) * 0.15;
      }

      // Walk bob
      bot.bobTimer += dt * 7.0;
      const bob = Math.sin(bot.bobTimer) * 0.04;
      bot.bodyMesh.position.y = 1.15 + bob;
      bot.headMesh.position.y = 1.69 + bob;
      bot.legL.rotation.x = Math.sin(bot.bobTimer + Math.PI) * 0.6;
      bot.legR.rotation.x = Math.sin(bot.bobTimer) * 0.6;

      // Hit flash
      if (bot.hitFlashTimer > 0) {
        bot.hitFlashTimer -= dt;
        bot.bodyMat.emissive.set(0xffffff);
        bot.bodyMat.emissiveIntensity = 0.9;
      } else {
        bot.bodyMat.emissive.set(bot.bodyMat.color);
        bot.bodyMat.emissiveIntensity = 0.12;
      }

      // Billboard health bar towards camera
      const hbGroup = bot.group.children.find(c => c instanceof THREE.Group && c.children.length === 3) as THREE.Group;
      if (hbGroup) {
        hbGroup.lookAt(camera.position);
      }
    }
  }

  public getBotMapPositions(): { x: number; z: number; isDead: boolean }[] {
    return this.bots.map(b => ({
      x: b.group.position.x,
      z: b.group.position.z,
      isDead: b.isDead
    }));
  }

  private respawnBot(bot: Bot): void {
    bot.health = bot.maxHealth;
    bot.isDead = false;
    bot.state = BotState.PATROL;
    bot.deathTimer = 0;
    bot.group.rotation.x = 0;
    bot.group.position.copy(bot.spawnPos).setY(0);
    bot.bodyMat.emissiveIntensity = 0.12;
    // Restore the bot's original colour, not a hardcoded red
    bot.bodyMat.color.setHex(bot.originalColor);
    bot.healthBarBg.visible = true;
    bot.healthBarFill.visible = true;
    this.updateHealthBar(bot);
  }
}
