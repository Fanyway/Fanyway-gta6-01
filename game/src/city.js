// SOLMAR — the city itself. buildCity turns a seeded random stream into
// Solmar Bay: a road grid, downtown towers, suburbs, a park, a beach and
// ocean, street furniture, billboards and the landmarks the missions use.
// It also hands back the collision boxes and the road graph traffic drives
// on, so the gameplay systems never have to know how the city looks.

import * as THREE from 'three';
import { WORLD, PALETTE } from './config.js';
import { mulberry32, pick, range, clamp } from './utils.js';
import {
  buildingTexture, roadTexture, sidewalkTexture, sandTexture,
  grassTexture, waterTexture, billboardTexture,
} from './textures.js';

const ROAD_COORDS = [-240, -180, -120, -60, 0, 60, 120, 180];

// Landmark positions the missions and the minimap point at.
export const LANDMARKS = {
  garage: { x: 150, z: -150, name: "Mara's Garage", start: { x: 150, z: -141 } },
  tower: { x: 30, z: 30, name: 'Solmar Tower', start: { x: 30, z: 16 } },
  docks: { x: 205, z: 150, name: 'The Docks' },
  warehouse: { x: -210, z: 150, name: 'Kings Warehouse', front: { x: -210, z: 138 } },
  marina: { x: 205, z: -140, name: 'Solmar Marina' },
  park: { x: -30, z: 30, name: 'Palm Park' },
  playerStart: { x: 150, z: -132 },
};

function hexColor(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** A simple box mesh with a lambert material, castShadow off (fast). */
function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

export function buildCity(scene, seed = 7) {
  const rand = mulberry32(seed);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // ---- ground: one big sidewalk-coloured slab under everything ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size + 60, WORLD.size + 60),
    new THREE.MeshLambertMaterial({ map: sidewalkTexture(), color: 0xbfc4c6 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(10, 0, 0);
  group.add(ground);

  // ---- roads: dark asphalt strips along every grid line ----
  // Two materials: the dash texture tiles along the road's length, so the
  // along-roads repeat it in U and the across-roads in V.
  const roadMatAlong = new THREE.MeshLambertMaterial({ map: roadTexture(80, 1, true) });
  const roadMatAcross = new THREE.MeshLambertMaterial({ map: roadTexture(1, 80, false) });
  const roadLen = WORLD.size;
  for (const c of ROAD_COORDS) {
    const along = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, WORLD.roadW), roadMatAlong);
    along.rotation.x = -Math.PI / 2;
    along.position.set(0, 0.02, c);
    group.add(along);
    const across = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadW, roadLen), roadMatAcross);
    across.rotation.x = -Math.PI / 2;
    across.position.set(c, 0.02, 0);
    group.add(across);
  }

  // ---- beach and ocean on the +X edge ----
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(34, WORLD.size),
    new THREE.MeshLambertMaterial({ map: sandTexture() }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(WORLD.beachStart + 8, 0.03, 0);
  group.add(sand);
  const waterMat = new THREE.MeshLambertMaterial({ map: waterTexture(), color: 0x9fd4e8 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(120, WORLD.size + 200), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD.waterStart + 62, 0.01, 0);
  group.add(water);

  // ---- buildings, one or two per block ----
  const facadeCache = new Map();
  function facade(base, s, floors) {
    const key = `${base}-${s % 5}`;
    if (!facadeCache.has(key)) {
      facadeCache.set(key, buildingTexture(hexColor(base), s, floors));
    }
    const tex = facadeCache.get(key).clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, Math.max(1, Math.round(floors / 8)));
    return tex;
  }

  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6258 });
  const blockCount = ROAD_COORDS.length - 1;
  for (let i = 0; i < blockCount; i += 1) {
    for (let j = 0; j < blockCount; j += 1) {
      const x0 = ROAD_COORDS[i] + WORLD.roadW / 2 + 2;
      const z0 = ROAD_COORDS[j] + WORLD.roadW / 2 + 2;
      const x1 = ROAD_COORDS[i + 1] - WORLD.roadW / 2 - 2;
      const z1 = ROAD_COORDS[j + 1] - WORLD.roadW / 2 - 2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const w = x1 - x0;
      const d = z1 - z0;

      // The park block stays green.
      if (i === 2 && j === 3) {
        const park = new THREE.Mesh(
          new THREE.PlaneGeometry(w, d),
          new THREE.MeshLambertMaterial({ map: grassTexture() }),
        );
        park.rotation.x = -Math.PI / 2;
        park.position.set(cx, 0.04, cz);
        group.add(park);
        plantTrees(group, rand, cx, cz, w, d, 7);
        continue;
      }
      // The tower block holds Solmar Tower alone.
      if (i === 3 && j === 3) {
        const tower = makeBuilding(group, facade, rand, 30, 30, 26, 26, 64, 0xb7c4cc, 9001);
        colliders.push(tower);
        continue;
      }
      // The warehouse block: one long low shed.
      if (i === 0 && j === 6) {
        const shed = makeBuilding(group, facade, rand, -210, 150, 34, 18, 10, 0x8a7f72, 555);
        colliders.push(shed);
        continue;
      }
      // The garage block: Mara's garage plus a small office.
      if (i === 5 && j === 1) {
        const gar = makeBuilding(group, facade, rand, 150, -150, 22, 14, 8, 0xc94f38, 777);
        colliders.push(gar);
        const off = makeBuilding(group, facade, rand, 138, -128, 10, 10, 14, 0xd8c9b0, 778);
        colliders.push(off);
        continue;
      }

      const downtown = Math.hypot(cx, cz) < WORLD.downtownRadius;
      const tall = downtown ? range(rand, 26, WORLD.maxBuildingH) : range(rand, WORLD.minBuildingH, 26);
      const base = pick(rand, PALETTE.building);
      const b1 = makeBuilding(group, facade, rand, cx - w * 0.22, cz, w * 0.52, d * 0.62, tall, base, Math.floor(rand() * 10000));
      colliders.push(b1);
      if (rand() < 0.6) {
        const b2 = makeBuilding(group, facade, rand, cx + w * 0.24, cz + d * 0.1, w * 0.42, d * 0.5, tall * range(rand, 0.4, 0.8), pick(rand, PALETTE.building), Math.floor(rand() * 10000));
        colliders.push(b2);
      }
      if (rand() < 0.25) plantTrees(group, rand, cx, cz, w, d, 2);
    }
  }

  // ---- street lamps along every road ----
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0x332200 });
  for (const c of ROAD_COORDS) {
    for (let t = -210; t <= 210; t += 60) {
      for (const [x, z] of [[c + 7, t], [t, c + 7]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6), lampPoleMat);
        pole.position.set(x, 3.25, z);
        group.add(pole);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.4), lampHeadMat);
        head.position.set(x, 6.6, z);
        group.add(head);
      }
    }
  }

  // ---- palms along the beachfront ----
  for (let z = -210; z <= 210; z += 30) {
    plantPalm(group, rand, 210, z);
    if (rand() < 0.5) plantPalm(group, rand, 198, z + 12);
  }

  // ---- billboards ----
  addBillboard(group, -60, 26, 0, ['SOLMAR', 'BAY'], '#ff8a1e', '#c94f38', 24, 12);
  addBillboard(group, 60, -40, Math.PI, ['AURELIO', 'GT'], '#2e7f8a', '#123a4a', 20, 10);
  addBillboard(group, 120, 60, -Math.PI / 2, ["MARA'S", 'GARAGE'], '#d9a441', '#7a4a12', 18, 9);

  // ---- marina boats ----
  for (let k = 0; k < 3; k += 1) {
    const boat = new THREE.Group();
    const hull = box(3, 1, 7, 0xf2f0e8, 0, 0.5, 0);
    const cabin = box(2, 1.2, 3, 0x2e7f8a, 0, 1.5, -0.5);
    boat.add(hull, cabin);
    boat.position.set(246, 0.1, -170 + k * 32);
    boat.rotation.y = range(rand, -0.2, 0.2);
    group.add(boat);
  }

  // ---- road graph: intersections and neighbours for traffic ----
  const nodes = [];
  const nodeIndex = new Map();
  for (const x of ROAD_COORDS) {
    for (const z of ROAD_COORDS) {
      nodeIndex.set(`${x},${z}`, nodes.length);
      nodes.push({ x, z });
    }
  }
  const neighbours = nodes.map(() => []);
  for (let n = 0; n < nodes.length; n += 1) {
    const { x, z } = nodes[n];
    for (const [dx, dz] of [[60, 0], [-60, 0], [0, 60], [0, -60]]) {
      const key = `${x + dx},${z + dz}`;
      if (nodeIndex.has(key)) neighbours[n].push(nodeIndex.get(key));
    }
  }

  return {
    group,
    colliders,
    roadGraph: { nodes, neighbours },
    waterMat,
    bounds: { minX: -WORLD.half, maxX: WORLD.half, minZ: -WORLD.half, maxZ: WORLD.half },
  };
}

/** One building: a textured box on a plinth, registered as a collider. */
function makeBuilding(group, facade, rand, cx, cz, w, d, h, base, seed) {
  const floors = Math.max(3, Math.round(h / 3.4));
  const side = new THREE.MeshLambertMaterial({ map: facade(base, seed, floors) });
  const roof = new THREE.MeshLambertMaterial({ color: 0x6b6258 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
  mesh.position.set(cx, h / 2, cz);
  group.add(mesh);
  // A thin plinth so buildings sit on the sidewalk instead of floating.
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(w + 1.2, 0.6, d + 1.2),
    new THREE.MeshLambertMaterial({ color: 0x8a8f92 }),
  );
  plinth.position.set(cx, 0.3, cz);
  group.add(plinth);
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, height: h };
}

/** A few low-poly trees inside a block. */
function plantTrees(group, rand, cx, cz, w, d, count) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4d8a3d });
  for (let i = 0; i < count; i += 1) {
    const x = cx + range(rand, -w / 2 + 4, w / 2 - 4);
    const z = cz + range(rand, -d / 2 + 4, d / 2 - 4);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6), trunkMat);
    trunk.position.set(x, 1.2, z);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(range(rand, 1.4, 2.2), 0), leafMat);
    crown.position.set(x, 3.4, z);
    group.add(trunk, crown);
  }
}

/** A palm tree: curved trunk and a crown of flattened cones. */
function plantPalm(group, rand, x, z) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8a3a });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 7, 6), trunkMat);
  trunk.position.set(x, 3.5, z);
  trunk.rotation.z = range(rand, -0.08, 0.08);
  group.add(trunk);
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(x + Math.cos(a) * 1.4, 7.2, z + Math.sin(a) * 1.4);
    leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
    leaf.scale.set(1, 1, 0.25);
    group.add(leaf);
  }
}

/** A billboard plane on two posts, facing `rotationY`. */
function addBillboard(group, x, z, rotationY, lines, bg1, bg2, w, h) {
  const tex = billboardTexture(lines, bg1, bg2);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  board.position.set(x, 12, z);
  board.rotation.y = rotationY;
  group.add(board);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 12, 6), postMat);
  post.position.set(x, 6, z);
  group.add(post);
}

/**
 * Resolve a circle (x, z, radius) against the building colliders: push it
 * out along the smallest penetration axis. Returns true when a hit happened.
 */
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (const b of colliders) {
    const cx = clamp(pos.x, b.minX, b.maxX);
    const cz = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Centre inside the box: push out along the shallowest side.
      const pushL = pos.x - b.minX + radius;
      const pushR = b.maxX - pos.x + radius;
      const pushU = pos.z - b.minZ + radius;
      const pushD = b.maxZ - pos.z + radius;
      const m = Math.min(pushL, pushR, pushU, pushD);
      if (m === pushL) pos.x = b.minX - radius;
      else if (m === pushR) pos.x = b.maxX + radius;
      else if (m === pushU) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  return hit;
}

/** Is the point (x, z) on a road (within half the road width of a grid line)? */
export function onRoad(x, z) {
  const half = WORLD.roadW / 2;
  for (const c of ROAD_COORDS) {
    if (Math.abs(x - c) < half || Math.abs(z - c) < half) return true;
  }
  return false;
}

/** The nearest road coordinate to a value (used to snap spawns onto roads). */
export function nearestRoad(v) {
  let best = ROAD_COORDS[0];
  for (const c of ROAD_COORDS) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}
