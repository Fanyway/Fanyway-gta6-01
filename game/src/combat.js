// SOLMAR — combat. The player's pistol (hitscan with a tracer and a
// muzzle flash), the Harbor Kings shooters who guard the warehouse, and
// the damage numbers the HUD shows. Shooting is simple and readable:
// point, click, and the game tells you what you hit.

import * as THREE from 'three';
import { COMBAT, PLAYER } from './config.js';
import { mulberry32, range, dist2D } from './utils.js';

const GANG_SHIRTS = [0x8a2f2f, 0x5a2f6e, 0x2f4a2f];

function buildGangMember(seed) {
  const rand = mulberry32(seed * 977 + 3);
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: GANG_SHIRTS[seed % GANG_SHIRTS.length] });
  const pants = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d5f });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.62, 0.34), shirt);
  torso.position.y = 1.11;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.8, 0.3), pants);
  legs.position.y = 0.4;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin);
  head.position.y = 1.62;
  const bandana = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.1, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x8a2f2f }),
  );
  bandana.position.y = 1.78;
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.46),
    new THREE.MeshLambertMaterial({ color: 0x14161a }),
  );
  gun.position.set(0.36, 1.1, 0.3);
  group.add(torso, legs, head, bandana, gun);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  group.add(blob);
  return group;
}

export class Combat {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;
    this.rand = mulberry32(31337);
    this.enemies = [];
    this.tracers = [];
    this.time = 0;
    // A reusable tracer: a stretched yellow box from muzzle to hit point.
    this.tracerGeo = new THREE.BoxGeometry(0.06, 0.06, 1);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
  }

  /**
   * Spawn `count` Harbor Kings shooters around (x, z). When `facing` is
   * given (an angle in radians), the shooters form a fan facing that
   * direction instead of a circle — used in front of a building, so no
   * shooter spawns inside the walls. Returns the group list.
   */
  spawnGang(x, z, count, facing = null) {
    const made = [];
    for (let i = 0; i < count; i += 1) {
      const mesh = buildGangMember(200 + i * 31);
      let angle;
      if (facing === null) {
        angle = (i / count) * Math.PI * 2;
      } else {
        angle = facing + (count === 1 ? 0 : (i / (count - 1) - 0.5) * 2.2);
      }
      const r = range(this.rand, 5, 9);
      mesh.position.set(x + Math.cos(angle) * r, 0, z + Math.sin(angle) * r);
      this.scene.add(mesh);
      const enemy = {
        mesh,
        health: COMBAT.gangHealth,
        fireTimer: range(this.rand, 0.4, 1.2),
        alive: true,
        strafeDir: this.rand() < 0.5 ? 1 : -1,
        strafeTimer: range(this.rand, 1, 3),
      };
      this.enemies.push(enemy);
      made.push(enemy);
    }
    return made;
  }

  clearGang() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  aliveCount() {
    return this.enemies.filter((e) => e.alive).length;
  }

  /**
   * Fire the player's pistol from `origin` along `dir` (both THREE.Vector3).
   * Returns the enemy hit, if any. Tracer + muzzle flash are spawned here.
   */
  playerShoot(origin, dir) {
    const from = origin.clone();
    let best = null;
    let bestT = PLAYER.pistolRange;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const to = new THREE.Vector3(e.mesh.position.x, 1.2, e.mesh.position.z).sub(from);
      const t = to.dot(dir);
      if (t < 0 || t > bestT) continue;
      const perp = to.clone().addScaledVector(dir, -t);
      if (perp.length() < 1.1) {
        best = e;
        bestT = t;
      }
    }
    const end = from.clone().addScaledVector(dir, best ? bestT : PLAYER.pistolRange);
    this.spawnTracer(from, end);
    this.effects.muzzleFlash(from.clone().addScaledVector(dir, 0.8));
    if (best) {
      best.health -= PLAYER.pistolDamage;
      this.effects.bloodBurst(new THREE.Vector3(best.mesh.position.x, 1.3, best.mesh.position.z));
      if (best.health <= 0) {
        best.alive = false;
        this.effects.explosion(best.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 0.6);
        best.mesh.visible = false;
      }
      return best;
    }
    return null;
  }

  spawnTracer(from, to) {
    const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.lookAt(to);
    mesh.scale.set(1, 1, from.distanceTo(to));
    mesh.userData.life = 0.07;
    this.scene.add(mesh);
    this.tracers.push(mesh);
  }

  /** Gang AI: strafe, shoot at the player when in range and line of sight. */
  update(dt, player, onShot) {
    this.time += dt;
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const t = this.tracers[i];
      t.userData.life -= dt;
      if (t.userData.life <= 0) {
        this.scene.remove(t);
        this.tracers.splice(i, 1);
      }
    }
    if (player.inCar) return;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = player.pos.x - e.mesh.position.x;
      const dz = player.pos.z - e.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      // Strafe sideways, reversing direction on a timer.
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) {
        e.strafeTimer = range(this.rand, 1, 2.5);
        e.strafeDir *= -1;
      }
      if (dist > 14) {
        // Close the distance.
        e.mesh.position.x += (dx / dist) * 3.4 * dt;
        e.mesh.position.z += (dz / dist) * 3.4 * dt;
      } else {
        e.mesh.position.x += Math.cos(e.mesh.rotation.y) * e.strafeDir * 1.6 * dt;
        e.mesh.position.z += -Math.sin(e.mesh.rotation.y) * e.strafeDir * 1.6 * dt;
      }
      // Fire when in range.
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && dist < COMBAT.gangRange) {
        e.fireTimer = 1 / COMBAT.gangFireRate;
        const from = new THREE.Vector3(e.mesh.position.x, 1.3, e.mesh.position.z);
        const dir = new THREE.Vector3(dx / dist, 0, dz / dist);
        this.spawnTracer(from, from.clone().addScaledVector(dir, dist));
        this.effects.muzzleFlash(from.clone().addScaledVector(dir, 0.8));
        if (this.rand() < COMBAT.gangHitChance && onShot) onShot(COMBAT.gangDamage);
      }
    }
  }
}
