// SOLMAR — the wanted system and the Solmar Bay Police. Crimes raise the
// wanted level (0–5 stars); police cars spawn off-screen, chase the player
// and ram them, while on-foot officers try to bust the player up close.
// Stay clean and out of sight and the heat fades, one star at a time.

import * as THREE from 'three';
import { POLICE, CAR } from './config.js';
import { mulberry32, range, clamp, dist2D } from './utils.js';
import { buildCar } from './vehicles.js';
import { collideCircle } from './city.js';

export class PoliceManager {
  constructor(scene, roadGraph, colliders) {
    this.scene = scene;
    this.graph = roadGraph;
    this.colliders = colliders;
    this.rand = mulberry32(2024);
    this.wanted = 0;
    this.decayTimer = 0;
    this.cars = [];
    this.officers = [];
    this.bustProgress = 0;
    this.time = 0;
    this.flashTimer = 0;
  }

  /** Raise the wanted level by `amount` (clamped to 5). Returns the level. */
  addWanted(amount, reason) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + amount, 0, 5);
    this.decayTimer = POLICE.decaySeconds;
    if (this.wanted > before) this.syncForces();
    return this.wanted;
  }

  clearWanted() {
    this.wanted = 0;
    this.bustProgress = 0;
    this.syncForces();
  }

  /** Match the deployed police to the current wanted level. */
  syncForces() {
    const wantCars = POLICE.carsPerStar[this.wanted] ?? 0;
    const wantFoot = POLICE.footPerStar[this.wanted] ?? 0;
    while (this.cars.length < wantCars) this.spawnCar();
    while (this.cars.length > wantCars) this.removeCar(this.cars[this.cars.length - 1]);
    while (this.officers.length < wantFoot) this.spawnOfficer();
    while (this.officers.length > wantFoot) this.removeOfficer(this.officers[this.officers.length - 1]);
  }

  spawnCar() {
    const car = buildCar('police', 5000 + this.cars.length * 91);
    this.scene.add(car);
    this.cars.push(car);
    car.userData.speed = 0;
    car.userData.heading = 0;
    car.userData.ramCooldown = 0;
    return car;
  }

  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car);
  }

  spawnOfficer() {
    const group = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1d3a5f });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
    const cap = new THREE.MeshLambertMaterial({ color: 0x14263e });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.62, 0.34), navy);
    torso.position.y = 1.11;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.8, 0.3), navy);
    legs.position.y = 0.4;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin);
    head.position.y = 1.62;
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), cap);
    hat.position.y = 1.82;
    group.add(torso, legs, head, hat);
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    group.add(blob);
    this.scene.add(group);
    const officer = { mesh: group, speed: 5.2, heading: 0 };
    this.officers.push(officer);
    return officer;
  }

  removeOfficer(officer) {
    const i = this.officers.indexOf(officer);
    if (i >= 0) this.officers.splice(i, 1);
    this.scene.remove(officer.mesh);
  }

  /** Place a fresh force around the player (used when wanted jumps). */
  placeAround(playerPos) {
    for (const car of this.cars) {
      const angle = this.rand() * Math.PI * 2;
      const r = POLICE.spawnRadius * range(this.rand, 0.8, 1.2);
      car.position.set(playerPos.x + Math.cos(angle) * r, 0, playerPos.z + Math.sin(angle) * r);
      car.position.x = clamp(car.position.x, -235, 210);
      car.position.z = clamp(car.position.z, -235, 235);
      car.userData.speed = 0;
    }
    for (const officer of this.officers) {
      const angle = this.rand() * Math.PI * 2;
      const r = range(this.rand, 25, 45);
      officer.mesh.position.set(playerPos.x + Math.cos(angle) * r, 0, playerPos.z + Math.sin(angle) * r);
    }
  }

  /**
   * Step the chase. Returns an event object when something happens:
   * { rammed: true } when a police car hits the player, { bust: 0..1 }
   * while an officer is closing in on an arrest, { busted: true } on arrest.
   */
  update(dt, player, playerCar) {
    this.time += dt;
    this.flashTimer += dt;
    const px = playerCar ? playerCar.position.x : player.pos.x;
    const pz = playerCar ? playerCar.position.z : player.pos.z;
    const events = { rammed: false, bust: 0, busted: false };

    // Wanted decay: no crime and no officer close for a while.
    if (this.wanted > 0) {
      let officerNear = false;
      for (const o of this.officers) {
        if (dist2D(o.mesh.position.x, o.mesh.position.z, px, pz) < 30) officerNear = true;
      }
      if (!officerNear) {
        this.decayTimer -= dt;
        if (this.decayTimer <= 0) {
          this.wanted -= 1;
          this.decayTimer = POLICE.decaySeconds;
          this.syncForces();
        }
      } else {
        this.decayTimer = POLICE.decaySeconds;
      }
    }

    // Police cars: steer toward the player and ram.
    for (const car of this.cars) {
      const ud = car.userData;
      ud.ramCooldown = Math.max(0, ud.ramCooldown - dt);
      const dx = px - car.position.x;
      const dz = pz - car.position.z;
      const dist = Math.hypot(dx, dz);
      const wantedHeading = Math.atan2(dx, dz);
      let d = wantedHeading - ud.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      ud.heading += clamp(d, -2.6 * dt, 2.6 * dt);
      car.rotation.y = ud.heading - Math.PI / 2;
      const targetSpeed = dist > 60 ? POLICE.carSpeed : POLICE.carSpeed * 0.75;
      ud.speed += clamp(targetSpeed - ud.speed, -20 * dt, 14 * dt);
      const nx = car.position.x + Math.sin(ud.heading) * ud.speed * dt;
      const nz = car.position.z + Math.cos(ud.heading) * ud.speed * dt;
      const probe = { x: nx, z: nz };
      collideCircle(probe, 1.6, this.colliders);
      car.position.x = probe.x;
      car.position.z = probe.z;
      for (const wheel of ud.wheels) wheel.rotation.y += (ud.speed * dt) / 0.36;
      // Ram the player's car or knock the player down.
      if (dist < 4.2 && ud.ramCooldown <= 0) {
        ud.ramCooldown = 1.2;
        events.rammed = true;
        ud.speed *= 0.5;
      }
      // Flash the light bar red/blue.
      if (ud.lightRed && ud.lightBlue) {
        const phase = Math.floor(this.flashTimer * 4) % 2 === 0;
        ud.lightRed.material.emissive.setHex(phase ? 0xff0000 : 0x220000);
        ud.lightBlue.material.emissive.setHex(phase ? 0x000022 : 0x0044ff);
      }
      // Despawn far-away units and respawn them near the player.
      if (dist > POLICE.despawnRadius) {
        const angle = this.rand() * Math.PI * 2;
        car.position.set(px + Math.cos(angle) * POLICE.spawnRadius, 0, pz + Math.sin(angle) * POLICE.spawnRadius);
        ud.speed = 0;
      }
    }

    // On-foot officers: run at the player and bust them up close.
    let nearestBust = 0;
    for (const officer of this.officers) {
      const m = officer.mesh;
      const dx = px - m.position.x;
      const dz = pz - m.position.z;
      const dist = Math.hypot(dx, dz);
      const heading = Math.atan2(dx, dz);
      m.rotation.y = heading;
      if (dist > POLICE.bustRadius) {
        m.position.x += Math.sin(heading) * officer.speed * dt;
        m.position.z += Math.cos(heading) * officer.speed * dt;
      }
      if (dist < 6) {
        nearestBust = Math.max(nearestBust, 1 - dist / 6);
      }
    }
    if (nearestBust > 0 && !playerCar) {
      this.bustProgress += dt / POLICE.bustTime;
      events.bust = clamp(this.bustProgress, 0, 1);
      if (this.bustProgress >= 1) {
        events.busted = true;
        this.bustProgress = 0;
      }
    } else {
      this.bustProgress = Math.max(0, this.bustProgress - dt * 0.5);
    }
    return events;
  }
}
