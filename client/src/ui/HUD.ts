import { NetDiagnostics } from '@fps/shared';

export class HUD {
  private hpValEl = document.getElementById('hp-val')!;
  private hpBarEl = document.getElementById('hp-bar')!;
  private armorValEl = document.getElementById('armor-val')!;
  private armorBarEl = document.getElementById('armor-bar')!;
  private weaponNameEl = document.getElementById('weapon-name')!;
  private ammoCurrentEl = document.getElementById('ammo-current')!;
  private ammoMaxEl = document.getElementById('ammo-max')!;
  private hitmarkerEl = document.getElementById('hitmarker')!;
  private scoreRedEl = document.getElementById('score-red')!;
  private scoreBlueEl = document.getElementById('score-blue')!;

  private diagFpsEl = document.getElementById('diag-fps')!;
  private diagPingEl = document.getElementById('diag-ping')!;
  private diagTickEl = document.getElementById('diag-tick')!;
  private diagErrEl = document.getElementById('diag-err')!;

  private damageOverlayEl = document.getElementById('damage-overlay');
  private respawnOverlayEl = document.getElementById('respawn-overlay');
  private respawnTimerTextEl = document.getElementById('respawn-timer-text');
  private damageFlashTimer: ReturnType<typeof setTimeout> | null = null;

  public updatePlayerStats(hp: number, armor: number): void {
    const hpPercent = Math.max(0, Math.min(100, hp));
    const armorPercent = Math.max(0, Math.min(100, armor));

    this.hpValEl.textContent = `${Math.round(hp)} HP`;
    this.hpBarEl.style.width = `${hpPercent}%`;

    this.armorValEl.textContent = `${Math.round(armor)} AP`;
    this.armorBarEl.style.width = `${armorPercent}%`;
  }

  public updateScores(playerKills: number, enemyKills: number): void {
    if (this.scoreBlueEl) this.scoreBlueEl.textContent = `${playerKills}`;
    if (this.scoreRedEl) this.scoreRedEl.textContent = `${enemyKills}`;
  }

  public triggerDamageFlash(): void {
    if (!this.damageOverlayEl) return;
    this.damageOverlayEl.style.opacity = '1';
    if (this.damageFlashTimer) clearTimeout(this.damageFlashTimer);
    this.damageFlashTimer = setTimeout(() => {
      if (this.damageOverlayEl) this.damageOverlayEl.style.opacity = '0';
    }, 180);
  }

  public showRespawnOverlay(show: boolean, secondsRemaining: number = 3): void {
    if (!this.respawnOverlayEl) return;
    if (show) {
      this.respawnOverlayEl.style.opacity = '1';
      this.respawnOverlayEl.style.pointerEvents = 'auto';
      if (this.respawnTimerTextEl) {
        this.respawnTimerTextEl.textContent = `RESPAWNING IN ARENA IN ${Math.ceil(secondsRemaining)}s...`;
      }
    } else {
      this.respawnOverlayEl.style.opacity = '0';
      this.respawnOverlayEl.style.pointerEvents = 'none';
    }
  }

  public updateWeaponInfo(name: string, ammoCurrent: number, ammoMax: number): void {
    this.weaponNameEl.textContent = name.toUpperCase();
    this.ammoCurrentEl.textContent = `${ammoCurrent}`;
    this.ammoMaxEl.textContent = `/ ${ammoMax}`;
  }

  public triggerHitmarker(isHeadshot: boolean = false, durationSec: number = 0.25): void {
    this.hitmarkerEl.classList.add('active');
    this.hitmarkerEl.style.color = isHeadshot ? '#ff3300' : '#ff0055';
    // Auto-remove after duration (converted to ms)
    setTimeout(() => {
      this.hitmarkerEl.classList.remove('active');
    }, durationSec * 1000);
  }

  private slideIndicatorEl = document.getElementById('slide-indicator');

  public setSliding(isSliding: boolean): void {
    if (this.slideIndicatorEl) {
      this.slideIndicatorEl.style.opacity = isSliding ? '1' : '0';
    }
  }

  private minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
  private announcerBannerEl = document.getElementById('announcer-banner');
  private announcerTimer: ReturnType<typeof setTimeout> | null = null;

  public showAnnouncer(text: string, colorHex: string = '#ff0055'): void {
    if (!this.announcerBannerEl) return;
    this.announcerBannerEl.textContent = text;
    this.announcerBannerEl.style.color = colorHex;
    this.announcerBannerEl.style.textShadow = `0 0 25px ${colorHex}`;
    this.announcerBannerEl.style.opacity = '1';
    this.announcerBannerEl.style.transform = 'translate(-50%, -50%) scale(1.1)';

    if (this.announcerTimer) clearTimeout(this.announcerTimer);
    this.announcerTimer = setTimeout(() => {
      if (this.announcerBannerEl) {
        this.announcerBannerEl.style.opacity = '0';
        this.announcerBannerEl.style.transform = 'translate(-50%, -50%) scale(0.8)';
      }
    }, 1800);
  }

  public updateMinimap(
    playerPos: { x: number; z: number },
    playerYaw: number,
    bots: { x: number; z: number; isDead: boolean }[],
    barrels: { x: number; z: number; isDestroyed: boolean }[],
    jumpPads: { x: number; z: number }[]
  ): void {
    if (!this.minimapCanvas) return;
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const scale = w / 160; // 160m map size
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Background radar grid lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.45, 0, Math.PI * 2);
    ctx.arc(cx, cy, w * 0.25, 0, Math.PI * 2);
    ctx.stroke();

    // Map Center Cross
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    // 1. Draw Jump Pads (Glowing Green)
    ctx.fillStyle = '#00ff66';
    for (const jp of jumpPads) {
      const rx = cx + jp.x * scale;
      const ry = cy + jp.z * scale;
      ctx.beginPath();
      ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Draw Explosive Barrels (Glowing Red)
    ctx.fillStyle = '#ffaa00';
    for (const b of barrels) {
      if (b.isDestroyed) continue;
      const rx = cx + b.x * scale;
      const ry = cy + b.z * scale;
      ctx.beginPath();
      ctx.arc(rx, ry, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Draw Enemies (Blinking Red)
    ctx.fillStyle = '#ff0055';
    for (const bot of bots) {
      if (bot.isDead) continue;
      const rx = cx + bot.x * scale;
      const ry = cy + bot.z * scale;
      ctx.beginPath();
      ctx.arc(rx, ry, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Draw Player Position & Direction Arrow (Bright Gold with Pulsing Ring)
    const px = cx + playerPos.x * scale;
    const py = cy + playerPos.z * scale;

    ctx.save();
    ctx.translate(px, py);

    // Outer radar sonar ring for player location
    ctx.strokeStyle = 'rgba(255, 234, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.rotate(-playerYaw);

    ctx.fillStyle = '#ffea00';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  public updateDiagnostics(diag: Partial<NetDiagnostics>): void {
    if (diag.fps !== undefined) this.diagFpsEl.textContent = `${diag.fps}`;
    if (diag.pingMs !== undefined) this.diagPingEl.textContent = `${Math.round(diag.pingMs)} ms`;
    if (diag.serverTickHz !== undefined) this.diagTickEl.textContent = `${diag.serverTickHz} Hz`;
    if (diag.predictionErrorMeters !== undefined) {
      this.diagErrEl.textContent = `${diag.predictionErrorMeters.toFixed(3)} m`;
    }
  }
}

