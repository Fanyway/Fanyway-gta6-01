// SOLMAR — the HUD. Plain DOM for the bars and text (cheap, readable) and
// one small canvas for the minimap, drawn every frame from the live game
// state: roads, the beach, the player, cars, the mission marker and the
// wanted stars. No images, no network — just canvas and CSS.

import { PALETTE } from './config.js';

export class HUD {
  constructor() {
    this.el = {
      healthFill: document.getElementById('health-fill'),
      armorFill: document.getElementById('armor-fill'),
      money: document.getElementById('money'),
      wanted: document.getElementById('wanted'),
      objective: document.getElementById('objective'),
      timer: document.getElementById('timer'),
      speed: document.getElementById('speed'),
      carHealth: document.getElementById('car-health'),
      carHealthFill: document.getElementById('car-health-fill'),
      toast: document.getElementById('toast'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('banner-title'),
      bannerSub: document.getElementById('banner-sub'),
      prompt: document.getElementById('prompt'),
      damage: document.getElementById('damage'),
      bust: document.getElementById('bust'),
      bustFill: document.getElementById('bust-fill'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.bannerTimer = null;
    this.lastMoney = -1;
    this.lastWanted = -1;
  }

  /** Health, armor, money, wanted, speed — the numbers that change. */
  update(state) {
    const hp = Math.max(0, Math.round(state.health));
    this.el.healthFill.style.width = `${hp}%`;
    this.el.healthFill.style.background = hp > 50 ? '#4caf50' : hp > 25 ? '#ff9800' : '#f44336';
    this.el.armorFill.style.width = `${Math.max(0, Math.round(state.armor))}%`;
    if (state.money !== this.lastMoney) {
      this.el.money.textContent = `$${state.money.toLocaleString('en-US')}`;
      this.lastMoney = state.money;
    }
    if (state.wanted !== this.lastWanted) {
      this.el.wanted.innerHTML = '★'.repeat(state.wanted) + '<span class="dim">★</span>'.repeat(5 - state.wanted);
      this.el.wanted.classList.toggle('hot', state.wanted > 0);
      this.lastWanted = state.wanted;
    }
    this.el.objective.textContent = state.objective;
    if (state.speedKmh != null) {
      this.el.speed.textContent = `${Math.round(state.speedKmh)} km/h`;
      this.el.speed.style.display = 'block';
    } else {
      this.el.speed.style.display = 'none';
    }
    if (state.carHealth != null) {
      this.el.carHealth.style.display = 'block';
      this.el.carHealthFill.style.width = `${Math.max(0, Math.round(state.carHealth))}%`;
    } else {
      this.el.carHealth.style.display = 'none';
    }
    this.el.timer.textContent = state.timerText || '';
    this.el.bust.style.display = state.bust > 0 ? 'block' : 'none';
    if (state.bust > 0) this.el.bustFill.style.width = `${Math.round(state.bust * 100)}%`;
  }

  showPrompt(text) {
    if (text) {
      this.el.prompt.textContent = text;
      this.el.prompt.style.display = 'block';
    } else {
      this.el.prompt.style.display = 'none';
    }
  }

  toast(text, ms = 2600) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.el.toast.style.opacity = '0';
    }, ms);
  }

  banner(title, sub = '', ms = 3200) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.style.opacity = '1';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      this.el.banner.style.opacity = '0';
    }, ms);
  }

  flashDamage() {
    this.el.damage.style.opacity = '0.55';
    setTimeout(() => {
      this.el.damage.style.opacity = '0';
    }, 130);
  }

  /**
   * Draw the minimap. `view` is the world state the map needs:
   * { playerX, playerZ, playerHeading, cars, police, marker, northUp }.
   * The map is a top-down view of the 480 m city: roads as lines, the
   * beach and ocean on the right edge, the player as a white arrow.
   */
  drawMinimap(view) {
    const ctx = this.mapCtx;
    const S = 200;
    const half = 240;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    // Land.
    ctx.fillStyle = '#2c3440';
    ctx.fillRect(0, 0, S, S);
    // Ocean (right strip) and beach.
    ctx.fillStyle = '#1e6f9e';
    ctx.fillRect(S * 0.96, 0, S * 0.04, S);
    ctx.fillStyle = '#d9c48f';
    ctx.fillRect(S * 0.9, 0, S * 0.06, S);
    // Roads.
    ctx.strokeStyle = '#565e6a';
    ctx.lineWidth = 4;
    for (const c of [-240, -180, -120, -60, 0, 60, 120, 180]) {
      const [x] = toMap(c, 0);
      const [, z] = toMap(0, c);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, z);
      ctx.lineTo(S, z);
      ctx.stroke();
    }
    // Park.
    const [px, pz] = toMap(-30, 30);
    ctx.fillStyle = '#3f8a3a';
    ctx.fillRect(px - 10, pz - 10, 20, 20);
    // Mission marker: a pulsing gold diamond.
    if (view.marker) {
      const [mx, mz] = toMap(view.marker.x, view.marker.z);
      const pulse = 5 + Math.sin(performance.now() / 250) * 2;
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.moveTo(mx, mz - pulse);
      ctx.lineTo(mx + pulse, mz);
      ctx.lineTo(mx, mz + pulse);
      ctx.lineTo(mx - pulse, mz);
      ctx.closePath();
      ctx.fill();
    }
    // Police cars as red dots.
    ctx.fillStyle = '#ff3b30';
    for (const car of view.police || []) {
      const [cx, cz] = toMap(car.position.x, car.position.z);
      ctx.beginPath();
      ctx.arc(cx, cz, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic as faint grey dots.
    ctx.fillStyle = 'rgba(200, 210, 220, 0.55)';
    for (const car of view.cars || []) {
      const [cx, cz] = toMap(car.position.x, car.position.z);
      ctx.fillRect(cx - 1.5, cz - 1.5, 3, 3);
    }
    // Player: a white arrow pointing along the heading. The arrow is drawn
    // pointing up (-Y); on the map, +X is right and +Z is down, so the
    // canvas rotation is PI minus the world heading.
    const [ux, uz] = toMap(view.playerX, view.playerZ);
    ctx.save();
    ctx.translate(ux, uz);
    ctx.rotate(Math.PI - view.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
