import * as THREE from 'three';
import {
  MAX_ARMOR,
  MAX_HEALTH,
  TEST_MAP,
  WEAPON_DEFINITIONS,
  WeaponDefinition
} from '@fps/shared';
import { AudioEngine } from './core/AudioEngine.js';
import { InputManager } from './core/InputManager.js';
import { Time } from './core/Time.js';
import { BotManager } from './gameplay/BotManager.js';
import { MovementController } from './gameplay/MovementController.js';
import { RapierWorld } from './physics/RapierWorld.js';
import { CameraController } from './rendering/CameraController.js';
import { ParticleSystem } from './rendering/Particles.js';
import { Renderer } from './rendering/Renderer.js';
import { WeaponViewmodel } from './rendering/WeaponViewmodel.js';
import { HUD } from './ui/HUD.js';
import { MapBuilder } from './world/MapBuilder.js';

class GameApp {
  private time: Time;
  private renderer!: Renderer;
  private cameraController!: CameraController;
  private physics!: RapierWorld;
  private movement!: MovementController;
  private inputManager!: InputManager;
  private audioEngine!: AudioEngine;
  private viewmodel!: WeaponViewmodel;
  private particles!: ParticleSystem;
  private mapBuilder!: MapBuilder;
  private botManager!: BotManager;
  private hud!: HUD;

  private currentWeapon: WeaponDefinition;
  private ammoCurrent: number;
  private lastFireTimeMs: number = 0;
  private health: number = MAX_HEALTH;
  private armor: number = MAX_ARMOR;

  // Scores & Respawn state
  private playerKills: number = 0;
  private enemyKills: number = 0;
  private isPlayerDead: boolean = false;
  private respawnTimer: number = 0;

  // Hitmarker flash
  private hitmarkerEl!: HTMLElement;
  private hitmarkerTimer: number = 0;

  // FPS counter
  private frameCount: number = 0;
  private lastFpsUpdate: number = performance.now();
  private currentFps: number = 60;

  constructor() {
    this.time          = new Time();
    this.currentWeapon = WEAPON_DEFINITIONS['assault_rifle'];
    this.ammoCurrent   = this.currentWeapon.magazineSize;
  }

  public async start(): Promise<void> {
    const container = document.getElementById('canvas-container')!;

    // 1. Core Systems (Dual WebGL / Canvas2D Engine)
    this.renderer        = new Renderer(container);
    this.cameraController = new CameraController(this.renderer.camera);
    this.inputManager    = new InputManager(container);
    this.audioEngine     = new AudioEngine();
    this.hud             = new HUD();

    // 2. Setup PointerLock & Start Overlay immediately so button works without delay
    const startOverlay = document.getElementById('click-to-play')!;
    const startBtn     = document.getElementById('start-btn')!;

    let gameStarted = false;
    const hideOverlay = () => {
      gameStarted = true;
      this.inputManager.isLocked = true;
      startOverlay.classList.add('hidden');
      startOverlay.style.display       = 'none';
      startOverlay.style.opacity       = '0';
      startOverlay.style.pointerEvents = 'none';
    };

    const showOverlay = () => {
      startOverlay.classList.remove('hidden');
      startOverlay.style.display       = 'flex';
      startOverlay.style.opacity       = '1';
      startOverlay.style.pointerEvents = 'auto';
    };

    const startGame = () => {
      try {
        this.audioEngine.init();
      } catch (e) {
        console.warn('AudioEngine init error:', e);
      }
      this.inputManager.requestPointerLock();
      hideOverlay();
    };

    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startGame();
    });

    startOverlay.addEventListener('click', () => {
      startGame();
    });

    container.addEventListener('click', () => {
      if (gameStarted && !document.pointerLockElement) {
        this.inputManager.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = !!document.pointerLockElement;
      this.inputManager.isLocked = locked || gameStarted;
      if (locked || gameStarted) {
        hideOverlay();
      } else {
        showOverlay();
      }
    });

    document.addEventListener('pointerlockerror', () => {
      // Lock failed — keep overlay visible so user can try again.
      // Do NOT set isLocked = true here; the lock actually failed.
      this.inputManager.isLocked = false;
      showOverlay();
    });

    // 3. World + Particles + Viewmodel + Bots + Physics
    this.physics     = new RapierWorld();
    this.mapBuilder  = new MapBuilder(this.renderer.scene, this.physics);
    this.particles   = new ParticleSystem(this.renderer.scene);
    this.viewmodel   = new WeaponViewmodel(this.renderer.camera, this.particles);
    this.botManager  = new BotManager(this.renderer.scene);

    // 4. Player spawn
    const spawnPos = TEST_MAP.spawnPoints[0].position;
    this.movement  = new MovementController(this.physics, spawnPos);
    this.inputManager.yaw = TEST_MAP.spawnPoints[0].yaw;

    // 5. Hitmarker element
    this.hitmarkerEl = document.getElementById('hitmarker')!;

    // 6. Initial HUD
    this.hud.updatePlayerStats(this.health, this.armor);
    this.hud.updateWeaponInfo(this.currentWeapon.name, this.ammoCurrent, this.currentWeapon.magazineSize);
    this.hud.updateScores(this.playerKills, this.enemyKills);

    // 7. Start render loop IMMEDIATELY on frame 1
    requestAnimationFrame(this.loop.bind(this));

    // 8. Load physics WASM in background (non-blocking)
    this.physics.init().then(() => {
      console.log('Background physics WASM load complete.');
      this.movement.initPhysicsBody();
      this.mapBuilder.rebuildPhysicsColliders();
    }).catch(err => {
      console.warn('Physics WASM background load warning (running kinematic fallback):', err);
    });
  }

  private onPlayerDamage(rawDamage: number): void {
    if (this.isPlayerDead) return;

    // Armor absorbs 66% of damage
    const armorAbsorb = Math.min(this.armor, rawDamage * 0.66);
    this.armor -= armorAbsorb;
    const hpDamage = rawDamage - armorAbsorb;
    this.health = Math.max(0, this.health - hpDamage);

    this.audioEngine.playPlayerHurt();
    this.hud.triggerDamageFlash();
    this.hud.updatePlayerStats(this.health, this.armor);

    if (this.health <= 0) {
      this.isPlayerDead = true;
      this.respawnTimer = 3.0;
      this.enemyKills++;
      this.hud.updateScores(this.playerKills, this.enemyKills);
      this.hud.showRespawnOverlay(true, 3.0);
    }
  }

  private destroyedBarrels: Set<string> = new Set();
  private killStreakCount: number = 0;
  private lastKillTimeMs: number = 0;

  private handleKill(isHeadshot: boolean = false): void {
    const now = performance.now();
    if (now - this.lastKillTimeMs > 4500) {
      this.killStreakCount = 1;
    } else {
      this.killStreakCount++;
    }
    this.lastKillTimeMs = now;

    this.playerKills++;
    this.hud.updateScores(this.playerKills, this.enemyKills);

    if (this.killStreakCount === 1) {
      this.hud.showAnnouncer(isHeadshot ? '💥 HEADSHOT! 💥' : 'ENEMY ELIMINATED', isHeadshot ? '#ff3300' : '#00f0ff');
    } else if (this.killStreakCount === 2) {
      this.hud.showAnnouncer('⚡ DOUBLE KILL! ⚡', '#00f0ff');
    } else if (this.killStreakCount === 3) {
      this.hud.showAnnouncer('🔥 TRIPLE KILL! 🔥', '#ffaa00');
    } else if (this.killStreakCount === 4) {
      this.hud.showAnnouncer('☠️ ULTRA KILL! ☠️', '#ff0055');
    } else {
      this.hud.showAnnouncer('👑 UNSTOPPABLE RAMPAGE! 👑', '#ff00ff');
    }
  }

  private loop(): void {
    requestAnimationFrame(this.loop.bind(this));

    try {
      this.time.update();
      const dt  = this.time.delta;
      const now = performance.now();

      // FPS counter
      this.frameCount++;
      if (now - this.lastFpsUpdate >= 500) {
        this.currentFps    = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
        this.frameCount    = 0;
        this.lastFpsUpdate = now;
        this.hud.updateDiagnostics({ fps: this.currentFps, pingMs: 0, serverTickHz: 60, predictionErrorMeters: 0 });
      }

      // Player Respawn Logic
      if (this.isPlayerDead) {
        this.respawnTimer -= dt;
        this.hud.showRespawnOverlay(true, this.respawnTimer);

        if (this.respawnTimer <= 0) {
          this.isPlayerDead = false;
          this.health = MAX_HEALTH;
          this.armor = MAX_ARMOR;
          this.movement.setPosition(TEST_MAP.spawnPoints[0].position);
          this.hud.updatePlayerStats(this.health, this.armor);
          this.hud.showRespawnOverlay(false);
        }
      }

      // Hitmarker fade
      if (this.hitmarkerTimer > 0) {
        this.hitmarkerTimer -= dt;
        if (this.hitmarkerTimer <= 0) {
          this.hitmarkerEl.classList.remove('active');
        }
      }

      // Fetch input (if dead, movement/firing disabled)
      const rawInput = this.inputManager.getPlayerInput();
      const isLocked = this.inputManager.isLocked && !this.isPlayerDead;

      const input = isLocked ? rawInput : {
        ...rawInput,
        forward: 0,
        strafe: 0,
        jump: false,
        crouch: false,
        sprint: false,
        fire: false,
        reload: false
      };

      const isADS = isLocked && this.inputManager.isADS();

      // ── Weapon switching (1-5 keys) ──
      if (isLocked && input.weaponSlot) {
        const weaponKeys = ['assault_rifle', 'smg', 'shotgun', 'sniper', 'pistol'];
        const selectedId = weaponKeys[input.weaponSlot - 1];
        if (selectedId && WEAPON_DEFINITIONS[selectedId]) {
          this.currentWeapon = WEAPON_DEFINITIONS[selectedId];
          this.ammoCurrent   = this.currentWeapon.magazineSize;
          this.viewmodel.setWeapon(selectedId);
          this.hud.updateWeaponInfo(this.currentWeapon.name, this.ammoCurrent, this.currentWeapon.magazineSize);
        }
      }

      // ── Reload ──
      if (isLocked && input.reload && this.ammoCurrent < this.currentWeapon.magazineSize) {
        this.ammoCurrent = this.currentWeapon.magazineSize;
        this.hud.updateWeaponInfo(this.currentWeapon.name, this.ammoCurrent, this.currentWeapon.magazineSize);
      }

      // ── Physics & Movement ──
      const position   = this.movement.step(input, dt);
      const isSliding  = this.movement.isSliding;
      const slideProg  = this.movement.slideProgress;
      this.hud.setSliding(isSliding);
      this.physics.step(dt);

      // Jump Pad & Air Dash Events
      if (this.movement.justJumpPadded && this.movement.jumpPadPos) {
        this.audioEngine.playJumpPad();
        this.particles.spawnJumpPadEffect(new THREE.Vector3(this.movement.jumpPadPos.x, this.movement.jumpPadPos.y, this.movement.jumpPadPos.z));
      }
      if (this.movement.justDashed) {
        this.audioEngine.playAirDash();
      }

      // ── Firing ──
      if (isLocked && input.fire) {
        if (this.ammoCurrent <= 0) {
          // Auto-reload when attempting to fire with empty mag
          this.ammoCurrent = this.currentWeapon.magazineSize;
          this.hud.updateWeaponInfo(this.currentWeapon.name, this.ammoCurrent, this.currentWeapon.magazineSize);
        } else if (now - this.lastFireTimeMs >= this.currentWeapon.fireIntervalMs) {
          this.lastFireTimeMs = now;
          this.ammoCurrent--;

          this.audioEngine.playGunshot(this.currentWeapon.id);
          this.viewmodel.triggerRecoil();
          this.hud.updateWeaponInfo(this.currentWeapon.name, this.ammoCurrent, this.currentWeapon.magazineSize);

          const rayOrigin = this.renderer.camera.position.clone();
          const rayDir    = new THREE.Vector3(0, 0, -1).applyQuaternion(this.renderer.camera.quaternion);

          // 1. Explosive Barrel Raycasting
          let hitBarrelId: string | null = null;
          let hitBarrelDist = Infinity;
          for (const b of TEST_MAP.explosiveBarrels) {
            if (this.destroyedBarrels.has(b.id)) continue;
            const bPos = new THREE.Vector3(b.position.x, b.position.y, b.position.z);
            const toB = bPos.clone().sub(rayOrigin);
            const dot = toB.dot(rayDir);
            if (dot > 0 && dot < this.currentWeapon.range) {
              const perpSq = toB.lengthSq() - dot * dot;
              if (perpSq < 0.65 * 0.65 && dot < hitBarrelDist) {
                hitBarrelDist = dot;
                hitBarrelId = b.id;
              }
            }
          }

          // 2. Bot hit detection
          const hitResult = this.botManager.tryHit(
            rayOrigin, rayDir,
            this.currentWeapon.range,
            this.currentWeapon.damage
          );

          // 3. Environment obstacle & floor raycasting
          let envHitDist = this.currentWeapon.range;
          for (const obs of TEST_MAP.obstacles) {
            const minX = obs.position.x - obs.size.x / 2;
            const maxX = obs.position.x + obs.size.x / 2;
            const minY = obs.position.y - obs.size.y / 2;
            const maxY = obs.position.y + obs.size.y / 2;
            const minZ = obs.position.z - obs.size.z / 2;
            const maxZ = obs.position.z + obs.size.z / 2;

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

            if (tmax >= Math.max(0, tmin) && tmin > 0.05 && tmin < envHitDist) {
              envHitDist = tmin;
            }
          }

          // Floor raycast (y = 0)
          if (rayDir.y < -0.001) {
            const tFloor = (0 - rayOrigin.y) / rayDir.y;
            if (tFloor > 0.1 && tFloor < envHitDist) {
              envHitDist = tFloor;
            }
          }

          // Determine priorities: Barrel vs Bot vs Wall
          if (hitBarrelId && hitBarrelDist < envHitDist && (!hitResult || hitBarrelDist < hitResult.distance)) {
            // Detonate Barrel!
            const bDef = TEST_MAP.explosiveBarrels.find(b => b.id === hitBarrelId)!;
            const bPos = new THREE.Vector3(bDef.position.x, bDef.position.y, bDef.position.z);
            this.destroyedBarrels.add(hitBarrelId);
            const bMeshGroup = this.mapBuilder.barrelGroupMap.get(hitBarrelId);
            if (bMeshGroup) bMeshGroup.visible = false;

            this.particles.spawnExplosionEffect(bPos);
            this.audioEngine.playExplosion();

            // AoE damage to nearby bots
            const { killsCount } = this.botManager.damageInRadius(bPos, bDef.radius, bDef.damage);
            for (let k = 0; k < killsCount; k++) {
              this.handleKill(false);
            }

            // AoE damage to player if close
            const playerPosVec = new THREE.Vector3(position.x, position.y + 1.6, position.z);
            const playerDistToBarrel = playerPosVec.distanceTo(bPos);
            if (playerDistToBarrel < bDef.radius) {
              const playerBlastDmg = bDef.damage * (1 - playerDistToBarrel / bDef.radius);
              this.onPlayerDamage(playerBlastDmg);
            }

            // Respawn barrel after 15 seconds
            setTimeout(() => {
              this.destroyedBarrels.delete(hitBarrelId!);
              if (bMeshGroup) bMeshGroup.visible = true;
            }, 15000);

            const muzzlePos = this.viewmodel.getMuzzleWorldPosition();
            this.particles.spawnTracer(muzzlePos, bPos);
          } else {
            // Bot or Wall Hit
            const hasBotHit = hitResult !== null && hitResult.distance < envHitDist;

            if (hasBotHit && hitResult) {
              this.audioEngine.playHitmarker(hitResult.isHeadshot);
              // Route through HUD — single authority for hitmarker DOM management
              this.hud.triggerHitmarker(hitResult.isHeadshot, 0.25);
              this.hitmarkerTimer = 0; // no longer needed; HUD owns the timeout

              if (hitResult.isFatal) {
                this.handleKill(hitResult.isHeadshot);
              }
            }

            const muzzlePos = this.viewmodel.getMuzzleWorldPosition();
            const botHitPos = hasBotHit ? this.botManager.getLastHitWorldPos() : null;
            const impactPos = botHitPos ?? rayOrigin.clone().addScaledVector(rayDir, envHitDist);

            const hitNormal = rayDir.y < -0.5 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(-rayDir.x, 0, -rayDir.z).normalize();

            this.particles.spawnTracer(muzzlePos, impactPos);
            this.particles.spawnImpactSparks(impactPos, hitNormal);

            if (!hasBotHit && envHitDist < this.currentWeapon.range) {
              this.audioEngine.playBulletImpact();
            }
          }
        }
      }

      // ── Camera ──
      const isMoving = Math.abs(input.forward) > 0 || Math.abs(input.strafe) > 0;
      this.cameraController.update(
        position, input.yaw, input.pitch,
        isMoving, this.movement.isCrouching, isADS, dt,
        isSliding, slideProg
      );

      // ── Viewmodel ──
      this.viewmodel.update(isADS, 0, 0, dt, isSliding);

      // ── Strategic AI Bots Update ──
      const playerPosVec = new THREE.Vector3(position.x, position.y + 1.6, position.z);
      this.botManager.update(
        dt,
        playerPosVec,
        this.renderer.camera,
        this.audioEngine,
        this.particles,
        (dmg, srcPos) => this.onPlayerDamage(dmg)
      );

      // ── Radar Minimap Update ──
      const barrelPositions = TEST_MAP.explosiveBarrels.map(b => ({
        x: b.position.x,
        z: b.position.z,
        isDestroyed: this.destroyedBarrels.has(b.id)
      }));
      const jumpPadPositions = TEST_MAP.jumpPads.map(j => ({ x: j.position.x, z: j.position.z }));

      this.hud.updateMinimap(
        { x: position.x, z: position.z },
        input.yaw,
        this.botManager.getBotMapPositions(),
        barrelPositions,
        jumpPadPositions
      );

      this.particles.update(dt);

      // ── City & World Animations ──
      this.mapBuilder.update(this.time.elapsed);

    } catch (e) {
      // Log to page so black-screen issues surface without opening DevTools
      console.error('Error in game loop update step:', e);
      const errDiv = document.getElementById('loop-error') || (() => {
        const d = document.createElement('div');
        d.id = 'loop-error';
        d.style.cssText = 'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:9999;background:#ff0044;color:#fff;font:bold 13px monospace;padding:6px 14px;border-radius:4px;max-width:90vw;word-break:break-all;pointer-events:none;';
        document.body.appendChild(d);
        return d;
      })();
      errDiv.textContent = String(e);
    }

    // Always render — outside try/catch so a loop error never blacks the screen
    this.renderer.render();
  }
}

const app = new GameApp();
app.start().catch((err) => {
  console.error('CRITICAL ERROR starting Cyber-Strike 3D:', err?.name, err?.message, err?.stack || err);
});
