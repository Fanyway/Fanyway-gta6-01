// SOLMAR — cars. buildCar assembles a low-poly car from boxes, wheels and
// glass; TrafficManager drives a fleet of them around the road graph, and
// PoliceCar is the same body with a light bar. Cars are the game's second
// character: the player steals them, drives them and wrecks them.

import * as THREE from 'three';
import { TRAFFIC, CAR } from './config.js';
import { mulberry32, pick, range, clamp, lerp, turnToward, dist2D } from './utils.js';
import { collideCircle, nearestRoad } from './city.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xd9a441, 0x3a9e5f, 0x8a5fc2, 0xd8d3c8, 0x22262c, 0xe07a3a, 0x4db2c2];
const CAR_TYPES = [
  { name: 'Sedan', body: [4.4, 0.75, 1.9], cabin: [2.2, 0.62, 1.7], top: 1.28, speed: 1.0 },
  { name: 'Coupe', body: [4.1, 0.62, 1.85], cabin: [1.9, 0.55, 1.6], top: 1.18, speed: 1.08 },
  { name: 'Pickup', body: [4.8, 0.8, 2.0], cabin: [1.6, 0.7, 1.8], top: 1.32, speed: 0.94 },
  { name: 'Van', body: [4.9, 1.1, 2.0], cabin: [2.4, 0.9, 1.9], top: 1.7, speed: 0.88 },
  { name: 'Taxi', body: [4.4, 0.75, 1.9], cabin: [2.2, 0.62, 1.7], top: 1.28, speed: 1.0, taxi: true },
];

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

/**
 * Build one car. `kind` is 'traffic', 'police' or 'player'. Returns a group
 * whose userData carries the car's state (speed, steering, health, type).
 */
export function buildCar(kind = 'traffic', seed = 1, typeIndex = -1) {
  const rand = mulberry32(seed * 7919 + 13);
  const type = typeIndex >= 0 ? CAR_TYPES[typeIndex] : pick(rand, CAR_TYPES);
  const group = new THREE.Group();
  group.name = `car-${kind}`;

  const paint = kind === 'police'
    ? 0xf2f2f2
    : kind === 'player' && typeIndex === 4
      ? 0xd9a441
      : pick(rand, CAR_COLORS);
  const bodyMat = lambert(paint);
  const glassMat = lambert(0x1c2836);
  const darkMat = lambert(0x14161a);

  const [bw, bh, bd] = type.body;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bodyMat);
  body.position.y = 0.55 + bh / 2;
  group.add(body);
  const [cw, ch, cd] = type.cabin;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), glassMat);
  cabin.position.set(-bw * 0.06, 0.55 + bh + ch / 2 - 0.05, 0);
  group.add(cabin);
  // Bumpers and a front grille.
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, bd - 0.1), darkMat);
  bumperF.position.set(bw / 2 + 0.08, 0.45, 0);
  const bumperR = bumperF.clone();
  bumperR.position.x = -bw / 2 - 0.08;
  group.add(bumperF, bumperR);
  // Headlights (small emissive boxes) and tail lights.
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x554400 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xff2a1a, emissive: 0x550000 });
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.34), lightMat);
    head.position.set(bw / 2 + 0.02, 0.72, s * 0.62);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.34), tailMat);
    tail.position.set(-bw / 2 - 0.02, 0.72, s * 0.62);
    group.add(tail);
  }
  if (type.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), lambert(0xf5d76e));
    sign.position.set(0, 0.55 + bh + ch + 0.08, 0);
    group.add(sign);
  }
  if (kind === 'police') {
    // Black-and-white doors and a red/blue light bar.
    const door = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.5, bh * 0.7, bd + 0.02), lambert(0x1c2836));
    door.position.set(-0.1, 0.55 + bh / 2, 0);
    group.add(door);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 1.2), darkMat);
    bar.position.set(0, 0.55 + bh + ch + 0.05, 0);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0x880000 }));
    red.position.set(0, 0.55 + bh + ch + 0.2, -0.32);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x000088 }));
    blue.position.set(0, 0.55 + bh + ch + 0.2, 0.32);
    group.add(red, blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }

  // Four wheels that spin with speed and steer at the front.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateX(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[bw * 0.32, bd / 2], [bw * 0.32, -bd / 2], [-bw * 0.32, bd / 2], [-bw * 0.32, -bd / 2]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  // A soft blob shadow so cars sit on the ground without shadow maps.
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(bw + 0.6, bd + 0.6),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  group.add(blob);

  group.userData = {
    ...group.userData,
    kind,
    type,
    wheels,
    speed: 0,
    steer: 0,
    health: CAR.maxHealth,
    heading: 0,
    driver: kind === 'traffic',
    honkTimer: 0,
  };
  return group;
}

/** The gold hero car for the final mission — an Aurelio GT coupe. */
export function buildHeroCar() {
  const car = buildCar('player', 4242, 1);
  car.traverse((child) => {
    if (child.isMesh && child.material && child.material.color) {
      if (child.material.color.getHex() !== 0x1c2836 && child.material.color.getHex() !== 0x14161a) {
        child.material = new THREE.MeshLambertMaterial({ color: 0xd9a441, emissive: 0x332200 });
      }
    }
  });
  car.userData.type = { ...CAR_TYPES[1], name: 'Aurelio GT' };
  return car;
}

// ---------------------------------------------------------------- traffic

export class TrafficManager {
  constructor(scene, roadGraph, colliders, seed = 99) {
    this.scene = scene;
    this.graph = roadGraph;
    this.colliders = colliders;
    this.rand = mulberry32(seed);
    this.cars = [];
    this.time = 0;
  }

  spawn(count, playerPos) {
    for (let i = 0; i < count; i += 1) {
      const car = buildCar('traffic', 1000 + i * 37);
      const nodeIdx = Math.floor(this.rand() * this.graph.nodes.length);
      const node = this.graph.nodes[nodeIdx];
      // Start on a random neighbour edge so the car is mid-road, not on a corner.
      const next = this.pickNext(nodeIdx, -1);
      const lane = this.laneOffset(node, this.graph.nodes[next]);
      car.position.set(node.x + lane.x, 0, node.z + lane.z);
      car.userData.node = nodeIdx;
      car.userData.next = next;
      car.userData.speed = TRAFFIC.cruiseSpeed * range(this.rand, 0.8, 1.15);
      const nextNode = this.graph.nodes[next];
      car.userData.heading = Math.atan2(nextNode.x - node.x, nextNode.z - node.z);
      car.rotation.y = car.userData.heading - Math.PI / 2;
      this.scene.add(car);
      this.cars.push(car);
    }
  }

  laneOffset(from, to) {
    // Drive on the right: offset perpendicular to the travel direction.
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: (-dz / len) * 2.75, z: (dx / len) * 2.75 };
  }

  pickNext(node, cameFrom) {
    const options = this.graph.neighbours[node].filter((n) => n !== cameFrom);
    const list = options.length > 0 ? options : this.graph.neighbours[node];
    return list[Math.floor(this.rand() * list.length)];
  }

  /** Step every traffic car along the graph; returns nothing. */
  update(dt, playerPos) {
    this.time += dt;
    for (const car of this.cars) {
      const ud = car.userData;
      const target = this.graph.nodes[ud.next];
      const dx = target.x - car.position.x;
      const dz = target.z - car.position.z;
      const dist = Math.hypot(dx, dz);
      // Slow for the car ahead.
      let speed = ud.speed;
      for (const other of this.cars) {
        if (other === car) continue;
        const d = dist2D(car.position.x, car.position.z, other.position.x, other.position.z);
        if (d < TRAFFIC.minGap) {
          const ahead = (other.position.x - car.position.x) * Math.sin(car.userData.heading) + (other.position.z - car.position.z) * Math.cos(car.userData.heading);
          if (ahead > 0) speed = Math.min(speed, other.userData.speed * 0.5);
        }
      }
      const wantedHeading = Math.atan2(dx, dz);
      car.userData.heading = turnToward(car.userData.heading, wantedHeading, 2.4 * dt);
      car.rotation.y = car.userData.heading - Math.PI / 2;
      const step = speed * dt;
      car.position.x += Math.sin(car.userData.heading) * step;
      car.position.z += Math.cos(car.userData.heading) * step;
      // Spin the wheels.
      for (const wheel of ud.wheels) wheel.rotation.y += (step / 0.36) * 0.5;
      if (dist < 4) {
        ud.node = ud.next;
        ud.next = this.pickNext(ud.node, ud.node);
      }
      // Recycle cars that drifted far from the player.
      if (playerPos && dist2D(car.position.x, car.position.z, playerPos.x, playerPos.z) > TRAFFIC.respawnRadius) {
        const nodeIdx = Math.floor(this.rand() * this.graph.nodes.length);
        const node = this.graph.nodes[nodeIdx];
        const next = this.pickNext(nodeIdx, -1);
        const lane = this.laneOffset(node, this.graph.nodes[next]);
        car.position.set(node.x + lane.x, 0, node.z + lane.z);
        ud.node = nodeIdx;
        ud.next = next;
      }
    }
  }

  /** The nearest drivable car to a point, within `radius`, or null. */
  nearestCar(x, z, radius) {
    let best = null;
    let bestD = radius;
    for (const car of this.cars) {
      if (!car.userData.driver) continue;
      const d = dist2D(x, z, car.position.x, car.position.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  removeCar(car) {
    const index = this.cars.indexOf(car);
    if (index >= 0) this.cars.splice(index, 1);
    this.scene.remove(car);
  }

  /**
   * Take a car out of traffic without removing it from the scene — used
   * when the player steals it (it becomes the player's car, still visible).
   */
  releaseCar(car) {
    const index = this.cars.indexOf(car);
    if (index >= 0) this.cars.splice(index, 1);
  }
}

/**
 * Drive a player car with arcade physics: accelerate, brake, reverse,
 * steering that tightens at low speed, handbrake slides and building
 * collision. `car` is a group from buildCar; `input` gives moveX/moveY.
 */
export function driveCar(car, input, dt, colliders) {
  const ud = car.userData;
  const throttle = input.moveY();
  const steerInput = input.moveX();
  const handbrake = input.held('Space');
  if (throttle > 0) ud.speed += CAR.accel * throttle * dt;
  else if (throttle < 0) {
    if (ud.speed > 0.5) ud.speed -= CAR.brake * dt;
    else ud.speed += CAR.reverseAccel * throttle * dt;
  } else {
    ud.speed -= Math.sign(ud.speed) * Math.min(Math.abs(ud.speed), 8 * dt);
  }
  const max = CAR.maxSpeed * (ud.type?.speed ?? 1);
  ud.speed = clamp(ud.speed, -CAR.maxReverse, max);
  const grip = handbrake ? CAR.handbrakeGrip : CAR.grip;
  // Steering: pressing right turns the nose right; the sign is baked into
  // the heading math (forward is (sin h, cos h), so heading falls on a
  // right turn) and works the same in reverse without a special case.
  const steerTarget = steerInput * CAR.steerMax * clamp(Math.abs(ud.speed) / 8, 0.25, 1);
  ud.steer = lerp(ud.steer, steerTarget, Math.min(1, grip * dt));
  const turnRate = (ud.steer * ud.speed) / 2.6;
  ud.heading -= turnRate * dt;
  car.rotation.y = ud.heading - Math.PI / 2;
  const nx = car.position.x + Math.sin(ud.heading) * ud.speed * dt;
  const nz = car.position.z + Math.cos(ud.heading) * ud.speed * dt;
  const probe = { x: nx, z: nz };
  const hit = collideCircle(probe, 1.6, colliders);
  car.position.x = probe.x;
  car.position.z = probe.z;
  if (hit) {
    if (Math.abs(ud.speed) > 14) ud.health -= CAR.damagePerHit;
    ud.speed *= 0.45;
  }
  for (const wheel of ud.wheels) wheel.rotation.y += (ud.speed * dt) / 0.36;
  return { crashed: hit };
}
