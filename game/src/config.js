// SOLMAR — world and gameplay constants. One place for every number the
// rest of the game tunes against, so a designer can rebalance without
// hunting through the systems.

export const WORLD = {
  // City footprint in metres. The playable grid is centred on the origin.
  size: 480,
  half: 240,
  // Road grid: roads run every BLOCK metres; each road is ROAD_W wide.
  block: 60,
  roadW: 11,
  sidewalkW: 3.5,
  // Beach strip on the +X edge, then open water.
  beachStart: 216,
  waterStart: 232,
  // Building heights by district (downtown is tall, suburbs low).
  downtownRadius: 90,
  maxBuildingH: 64,
  minBuildingH: 9,
};

export const PLAYER = {
  walkSpeed: 6.5,
  runSpeed: 11,
  jumpSpeed: 8.2,
  gravity: 24,
  radius: 0.55,
  height: 1.8,
  maxHealth: 100,
  maxArmor: 100,
  punchDamage: 12,
  pistolDamage: 34,
  pistolRange: 70,
  pistolFireRate: 0.22,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 42,
  maxReverse: 12,
  steerMax: 0.55,
  grip: 8,
  handbrakeGrip: 2.2,
  damagePerHit: 9,
  maxHealth: 100,
  // How close the player must be to jack a car.
  enterRadius: 4.2,
};

export const TRAFFIC = {
  count: 16,
  cruiseSpeed: 9,
  minGap: 7,
  // Cars despawn and respawn this far behind the player.
  respawnRadius: 190,
};

export const PEDS = {
  count: 26,
  walkSpeed: 1.6,
  fleeSpeed: 4.2,
  // Pedestrians wander on sidewalks, this far from a road centre line.
  sidewalkOffset: WORLD.roadW / 2 + 1.6,
};

export const POLICE = {
  // Wanted stars 0..5. Each level lists how many police cars hunt the player.
  carsPerStar: [0, 1, 2, 3, 4, 5],
  // On-foot officers appear from 2 stars up.
  footPerStar: [0, 0, 1, 2, 3, 4],
  carSpeed: 34,
  ramDamage: 14,
  bustRadius: 2.4,
  bustTime: 2.0,
  // Seconds without a crime (and no officer nearby) before one star falls.
  decaySeconds: 26,
  spawnRadius: 85,
  despawnRadius: 260,
};

export const COMBAT = {
  gangHealth: 70,
  gangDamage: 9,
  gangFireRate: 0.9,
  gangRange: 42,
  // A gang member's shots land this often when the player is exposed.
  gangHitChance: 0.42,
};

export const MISSIONS = [
  {
    id: 'wheels',
    title: 'Wheels',
    giver: 'Mara Quinn',
    startAt: 'garage',
    brief: 'You need wheels. Jack any car on the street and bring it to my garage on Harbor Row.',
    reward: 500,
    phases: [
      { kind: 'goto', label: 'Steal any car and drive to the junction', location: { x: 120, z: -120 } },
      { kind: 'finish', label: 'Bring the car back to the garage', location: 'garage' },
    ],
  },
  {
    id: 'package',
    title: 'The Package',
    giver: 'Mara Quinn',
    startAt: 'garage',
    brief: 'A crate is waiting at the docks. Pick it up and deliver it to the Solmar Tower lobby — 100 seconds, no detours.',
    reward: 800,
    timeLimit: 100,
    phases: [
      { kind: 'pickup', label: 'Pick up the package at the docks', location: 'docks' },
      { kind: 'goto', label: 'Deliver it to Solmar Tower before the timer ends', location: 'tower' },
    ],
  },
  {
    id: 'heat',
    title: 'Heat',
    giver: 'Mara Quinn',
    startAt: 'garage',
    brief: 'The Bay Police are on you. Three stars and counting. Lose them — break line of sight, stay clean, and the heat fades.',
    reward: 600,
    timeLimit: 120,
    phases: [
      { kind: 'survive', label: 'Lose the heat — get back to zero stars', location: 'garage' },
      { kind: 'finish', label: 'Return to Mara at the garage', location: 'garage' },
    ],
  },
  {
    id: 'kings',
    title: 'Harbor Kings',
    giver: 'Mara Quinn',
    startAt: 'garage',
    brief: 'The Harbor Kings took my warehouse. Five of their shooters are holed up there. Go in on foot and clear them out.',
    reward: 1200,
    phases: [
      { kind: 'goto', label: 'Reach the Kings warehouse', location: 'warehouse' },
      { kind: 'finish', label: 'Clear the shooters, then return to Mara', location: 'garage' },
    ],
  },
  {
    id: 'big-score',
    title: 'The Big Score',
    giver: 'Mara Quinn',
    startAt: 'garage',
    brief: 'A gold coupe — the Aurelio GT — is parked at the marina, guarded. Take it, and bring it to my garage while the whole bay chases you.',
    reward: 2500,
    phases: [
      { kind: 'goto', label: 'Reach the marina and clear the guards', location: 'marina' },
      { kind: 'finish', label: 'Steal the Aurelio GT and bring it to the garage', location: 'garage' },
    ],
  },
];

// Twelve cash stashes hidden around the city, each worth $100. Positions
// sit on sidewalks, in the park and on the beach — never inside a building.
export const STASHES = [
  { id: 1, x: 7, z: -60, amount: 100 },
  { id: 2, x: -53, z: 120, amount: 100 },
  { id: 3, x: 67, z: 180, amount: 100 },
  { id: 4, x: -173, z: -60, amount: 100 },
  { id: 5, x: 127, z: 60, amount: 100 },
  { id: 6, x: -30, z: 30, amount: 100 },
  { id: 7, x: 205, z: -60, amount: 100 },
  { id: 8, x: 205, z: 60, amount: 100 },
  { id: 9, x: -233, z: -150, amount: 100 },
  { id: 10, x: 150, z: -233, amount: 100 },
  { id: 11, x: -60, z: -173, amount: 100 },
  { id: 12, x: 60, z: 173, amount: 100 },
];

export const SAVE_KEY = 'solmar-save-v1';

export const DAY_LENGTH = 360; // seconds of game time per in-world day
export const START_HOUR = 8; // the story opens at 08:00

// Palette of the city: sun-bleached pastels, teal water, warm asphalt.
export const PALETTE = {
  sky: 0x8ec9e8,
  fog: 0xa8c8dd,
  sun: 0xfff2cf,
  road: 0x3a3f46,
  roadLine: 0xf5d76e,
  sidewalk: 0x9aa0a3,
  sand: 0xe8d29a,
  water: 0x1e7fa8,
  grass: 0x5da24a,
  building: [0xd8c9b0, 0xc9b8a3, 0xb7c4cc, 0xd9a08a, 0xa8b8a0, 0xcfc4d6, 0xe0d3b8],
  glass: 0x9fd4e8,
};
