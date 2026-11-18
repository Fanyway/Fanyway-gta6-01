// SOLMAR — Dario Voss on foot. Third-person movement relative to the
// camera: walk, sprint, jump, and a pistol stance. The mesh is a simple
// low-poly figure in a teal jacket so the player is easy to spot in the
// crowd — and on the minimap.

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp, lerp } from './utils.js';
import { collideCircle } from './city.js';

export function buildPlayerMesh() {
  const group = new THREE.Group();
  group.name = 'player';
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1f8a7a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const hair = new THREE.MeshLambertMaterial({ color: 0x241a12 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.8, 0.3), pants);
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.62, 0.34), jacket);
  torso.position.y = 1.11;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin);
  head.position.y = 1.62;
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), hair);
  hairTop.position.y = 1.82;
  const armGeo = new THREE.BoxGeometry(0.14, 0.6, 0.14);
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.37, 1.12, 0);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0.37, 1.12, 0);
  // The pistol, held out when aiming.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x14161a }),
  );
  gun.position.set(0.37, 1.05, 0.3);
  gun.visible = false;
  group.add(legs, torso, head, hairTop, armL, armR, gun);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 1.0),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  group.add(blob);
  group.userData.armL = armL;
  group.userData.armR = armR;
  group.userData.gun = gun;
  group.userData.legs = legs;
  return group;
}

export class Player {
  constructor(scene, startX, startZ) {
    this.mesh = buildPlayerMesh();
    this.mesh.position.set(startX, 0, startZ);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.velY = 0;
    this.onGround = true;
    this.heading = 0;
    this.health = PLAYER.maxHealth;
    this.armor = 0;
    this.fireTimer = 0;
    this.walkPhase = 0;
    this.inCar = null;
    this.invulnTimer = 0;
    this.aiming = false;
  }

  get speed2D() {
    return this._speed2D || 0;
  }

  /**
   * Step on foot. `moveX` is strafe, `moveY` is forward, both relative to
   * the camera yaw; `jump` and `sprint` are booleans. Returns the planar
   * speed for the HUD and the pedestrian scare check.
   */
  update(dt, input, cameraYaw, colliders) {
    if (this.inCar) return 0;
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    const mx = input.moveX();
    const my = input.moveY();
    const sprint = input.sprint;
    const speed = sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Camera-relative movement: forward is where the camera looks.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    let dx = (my * -sin + mx * cos) * speed;
    let dz = (my * -cos + mx * -sin) * speed;
    const moving = Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01;
    if (moving) {
      const targetHeading = Math.atan2(dx, dz);
      // Turn toward the movement direction, fast when running.
      let d = targetHeading - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += clamp(d, -10 * dt, 10 * dt);
      this.walkPhase += dt * speed * 1.6;
    }
    const nx = this.pos.x + dx * dt;
    const nz = this.pos.z + dz * dt;
    const probe = { x: nx, z: nz };
    collideCircle(probe, PLAYER.radius, colliders);
    // Stay inside the city (the beach is walkable, the water is not).
    probe.x = clamp(probe.x, -238, 228);
    probe.z = clamp(probe.z, -238, 238);
    this.pos.x = probe.x;
    this.pos.z = probe.z;
    this._speed2D = moving ? speed : 0;

    // Jump and gravity.
    if (input.wasPressed('Space') && this.onGround) {
      this.velY = PLAYER.jumpSpeed;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.velY -= PLAYER.gravity * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.velY = 0;
        this.onGround = true;
      }
    }

    // Pose: arms swing with the walk cycle, gun out while aiming.
    const swing = moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    this.mesh.userData.armL.rotation.x = this.aiming ? -1.2 : swing;
    this.mesh.userData.armR.rotation.x = this.aiming ? -1.2 : -swing;
    this.mesh.userData.gun.visible = this.aiming;
    this.mesh.userData.legs.position.y = 0.4 + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.04 : 0);
    this.mesh.rotation.y = this.heading;
    return this._speed2D;
  }

  /** True when the pistol can fire this frame (rate-limited). */
  canFire() {
    return this.fireTimer <= 0 && !this.inCar;
  }

  /** Mark a shot fired: starts the rate-limit timer. */
  noteFired() {
    this.fireTimer = PLAYER.pistolFireRate;
  }

  /** Damage the player (armor absorbs first). Returns true if killed. */
  damage(amount) {
    if (this.invulnTimer > 0) return false;
    let rest = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, rest);
      this.armor -= absorbed;
      rest -= absorbed;
    }
    this.health -= rest;
    this.invulnTimer = 0.35;
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  addArmor(amount) {
    this.armor = Math.min(PLAYER.maxArmor, this.armor + amount);
  }

  reset(x, z) {
    this.pos.set(x, 0, z);
    this.velY = 0;
    this.onGround = true;
    this.health = PLAYER.maxHealth;
    this.armor = 0;
    this.inCar = null;
    this.invulnTimer = 0;
  }
}
