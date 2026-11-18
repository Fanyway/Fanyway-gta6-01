// SOLMAR — pedestrians. Low-poly walkers who stroll the sidewalks, cross
// at corners, chat in pairs, and flee when a gun goes off or a car bears
// down on them. They make the streets feel lived in — and they are the
// witnesses whose screams raise the wanted level.

import * as THREE from 'three';
import { PEDS } from './config.js';
import { mulberry32, pick, range, clamp, dist2D } from './utils.js';
import { nearestRoad, onRoad } from './city.js';

const SHIRTS = [0xd95f4b, 0x4b7fd9, 0x6fbf5a, 0xd9b44b, 0x9b5fd9, 0xe8e2d4, 0x3a3f46, 0xc27aa0];
const SKINS = [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0, 0x6e4423];
const PANTS = [0x2e3a4a, 0x4a3a2e, 0x3a3a3a, 0x5a6b7a];

function buildWalker(seed) {
  const rand = mulberry32(seed * 331 + 7);
  const group = new THREE.Group();
  const shirt = pick(rand, SHIRTS);
  const skin = pick(rand, SKINS);
  const pants = pick(rand, PANTS);
  const tall = range(rand, 1.65, 1.9);

  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, tall * 0.45, 0.3),
    new THREE.MeshLambertMaterial({ color: pants }),
  );
  legs.position.y = tall * 0.225;
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, tall * 0.36, 0.32),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  torso.position.y = tall * 0.45 + tall * 0.18;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = tall * 0.81 + 0.15;
  // Arms swing while walking.
  const armGeo = new THREE.BoxGeometry(0.13, tall * 0.34, 0.13);
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.35, tall * 0.62, 0);
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.position.set(0.35, tall * 0.62, 0);
  group.add(legs, torso, head, armL, armR);
  // Blob shadow.
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  group.add(blob);
  group.userData.armL = armL;
  group.userData.armR = armR;
  group.userData.height = tall;
  return group;
}

export class PedestrianManager {
  constructor(scene, seed = 55) {
    this.scene = scene;
    this.rand = mulberry32(seed);
    this.peds = [];
    this.time = 0;
  }

  spawn(count) {
    for (let i = 0; i < count; i += 1) {
      const mesh = buildWalker(100 + i * 17);
      const x = range(this.rand, -220, 220);
      const z = range(this.rand, -220, 220);
      // Stand on a sidewalk: snap one axis to a road line, offset to the side.
      const onXRoad = this.rand() < 0.5;
      if (onXRoad) {
        mesh.position.set(nearestRoad(x), 0, z);
        mesh.position.x += (this.rand() < 0.5 ? -1 : 1) * PEDS.sidewalkOffset;
      } else {
        mesh.position.set(x, 0, nearestRoad(z));
        mesh.position.z += (this.rand() < 0.5 ? -1 : 1) * PEDS.sidewalkOffset;
      }
      mesh.userData = {
        ...mesh.userData,
        heading: this.rand() * Math.PI * 2,
        speed: PEDS.walkSpeed * range(this.rand, 0.7, 1.3),
        state: 'walk',
        fleeTimer: 0,
        turnTimer: range(this.rand, 2, 8),
        walkPhase: this.rand() * Math.PI * 2,
      };
      mesh.rotation.y = -mesh.userData.heading;
      this.scene.add(mesh);
      this.peds.push(mesh);
    }
  }

  /** Scare every pedestrian within `radius` of a point (gunshots, crashes). */
  scare(x, z, radius) {
    for (const ped of this.peds) {
      const d = dist2D(x, z, ped.position.x, ped.position.z);
      if (d < radius) {
        ped.userData.state = 'flee';
        ped.userData.fleeTimer = range(this.rand, 2.5, 5);
        ped.userData.heading = Math.atan2(ped.position.x - x, ped.position.z - z);
      }
    }
  }

  update(dt, playerPos, playerSpeed) {
    this.time += dt;
    for (const ped of this.peds) {
      const ud = ped.userData;
      let speed = ud.speed;
      if (ud.state === 'flee') {
        speed = PEDS.fleeSpeed;
        ud.fleeTimer -= dt;
        if (ud.fleeTimer <= 0) ud.state = 'walk';
      } else {
        ud.turnTimer -= dt;
        if (ud.turnTimer <= 0) {
          ud.turnTimer = range(this.rand, 3, 9);
          // Turn onto the next sidewalk: pick a cardinal direction.
          ud.heading = Math.floor(this.rand() * 4) * (Math.PI / 2);
        }
      }
      // A speeding car nearby makes them dash out of the road.
      if (playerSpeed > 12 && dist2D(ped.position.x, ped.position.z, playerPos.x, playerPos.z) < 14 && onRoad(ped.position.x, ped.position.z)) {
        ud.state = 'flee';
        ud.fleeTimer = 2;
      }
      const nx = ped.position.x + Math.sin(ud.heading) * speed * dt;
      const nz = ped.position.z + Math.cos(ud.heading) * speed * dt;
      // Stay inside the city and off the beach water.
      if (Math.abs(nx) < 228 && Math.abs(nz) < 228 && nx < 212) {
        ped.position.x = nx;
        ped.position.z = nz;
      } else {
        ud.heading += Math.PI / 2;
      }
      ped.rotation.y = ud.heading;
      // Walk cycle: arms swing, slight bob.
      ud.walkPhase += dt * speed * 3.2;
      const swing = Math.sin(ud.walkPhase) * 0.55;
      ud.armL.rotation.x = swing;
      ud.armR.rotation.x = -swing;
      ped.position.y = Math.abs(Math.sin(ud.walkPhase)) * 0.05;
    }
  }
}
