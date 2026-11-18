// SOLMAR — juice. One particle pool drives muzzle flashes, blood puffs,
// explosions, cash sparkles and crash smoke; the camera shake is a single
// decaying value the camera reads each frame. Cheap, reusable, and the
// difference between a flat scene and a game that feels alive.

import * as THREE from 'three';
import { mulberry32, range } from './utils.js';

const MAX_PARTICLES = 400;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.rand = mulberry32(777);
    this.shake = 0;
    this.particles = [];
    this.pool = [];
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push(mesh);
    }
  }

  spawn(pos, count, color, speed, life, up = 2) {
    for (let i = 0; i < count; i += 1) {
      const mesh = this.pool.pop();
      if (!mesh) return;
      mesh.visible = true;
      mesh.material.color.setHex(color);
      mesh.material.opacity = 1;
      mesh.position.copy(pos);
      mesh.scale.setScalar(range(this.rand, 0.6, 1.6));
      const angle = this.rand() * Math.PI * 2;
      const spread = range(this.rand, 0.2, 1);
      this.particles.push({
        mesh,
        vx: Math.cos(angle) * speed * spread,
        vy: range(this.rand, 0.3, 1) * up,
        vz: Math.sin(angle) * speed * spread,
        life: life * range(this.rand, 0.6, 1.2),
        maxLife: life,
        gravity: 6,
      });
    }
  }

  muzzleFlash(pos) {
    this.spawn(pos, 5, 0xffd34d, 3, 0.12, 0.5);
  }

  bloodBurst(pos) {
    this.spawn(pos, 8, 0xa01818, 2.5, 0.5, 1.5);
  }

  explosion(pos, scale = 1) {
    this.spawn(pos, Math.round(22 * scale), 0xff7a1e, 7 * scale, 0.7, 4);
    this.spawn(pos, Math.round(10 * scale), 0x3a3a3a, 3 * scale, 1.1, 5);
    this.spawn(pos, Math.round(8 * scale), 0xffd34d, 9 * scale, 0.4, 3);
    this.addShake(0.55 * scale);
  }

  crashSmoke(pos) {
    this.spawn(pos, 6, 0x8a8a8a, 1.5, 0.9, 2.5);
  }

  cashSparkle(pos) {
    this.spawn(pos, 12, 0xffd34d, 2, 0.8, 3.5);
  }

  addShake(amount) {
    this.shake = Math.min(1, this.shake + amount);
  }

  /** Current shake offset (decays every frame); the camera adds it. */
  shakeOffset(dt) {
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const s = this.shake * this.shake * 0.5;
    return {
      x: (this.rand() * 2 - 1) * s,
      y: (this.rand() * 2 - 1) * s,
    };
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.pool.push(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.1) {
        p.mesh.position.y = 0.1;
        p.vy = 0;
      }
      p.mesh.material.opacity = p.life / p.maxLife;
    }
  }
}
