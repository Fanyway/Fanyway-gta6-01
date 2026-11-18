// SOLMAR — the game itself. main.js wires every system together: it owns
// the renderer, the camera, the game states (menu / playing / paused /
// dead / busted), the enter-and-steal-car flow, shooting, saving, the day
// cycle and the debug hooks the screenshots use. It is the only file that
// knows about all the others.

import * as THREE from 'three';
import { DAY_LENGTH } from './config.js';
import { clamp, lerp, dist2D } from './utils.js';
import { buildCity, LANDMARKS, collideCircle } from './city.js';
import { TrafficManager, buildCar, buildHeroCar, driveCar } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { Player } from './player.js';
import { PoliceManager } from './police.js';
import { Combat } from './combat.js';
import { MissionManager } from './missions.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { loadSave, writeSave, clearSave, emptySave, storageAvailable } from './save.js';

const SKY_DAY = new THREE.Color(0x87b5d9);
const SKY_SUNSET = new THREE.Color(0xe88a4d);
const SKY_NIGHT = new THREE.Color(0x1c2a44);

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.scene.background = SKY_DAY.clone();
    this.scene.fog = new THREE.Fog(0x87b5d9, 90, 320);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

    // Sun + sky fill so the city reads at any hour of the day cycle.
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    this.sun.position.set(120, 180, 60);
    this.scene.add(this.sun);
    this.scene.add(new THREE.HemisphereLight(0xbdd8f0, 0x4a4238, 0.9));

    this.input = new Input(this.canvas);
    this.hud = new HUD();
    this.sounds = new SoundBank();
    this.effects = new Effects(this.scene);

    const city = buildCity(this.scene, 7);
    this.city = city;
    this.colliders = city.colliders;
    this.traffic = new TrafficManager(this.scene, city.roadGraph, city.colliders);
    this.traffic.spawn(14, null);
    this.peds = new PedestrianManager(this.scene);
    this.peds.spawn(26);
    this.player = new Player(this.scene, LANDMARKS.playerStart.x, LANDMARKS.playerStart.z);
    this.police = new PoliceManager(this.scene, city.roadGraph, city.colliders);
    this.combat = new Combat(this.scene, this.effects);
    this.missions = new MissionManager(this.scene, (type, payload) => this.onMissionEvent(type, payload));

    this.money = 0;
    this.state = 'menu'; // menu | playing | paused | dead | busted
    this.cameraYaw = Math.PI * 0.75;
    this.cameraPitch = 0.32;
    this.dayTime = 0.15; // 0 = dawn, 0.5 = noon, 1 = night
    this.autosaveTimer = 0;
    this.enterCooldown = 0;
    this.parkedCars = [];
    this.goldCar = null;
    this.save = null;

    this.spawnParkedCars();
    this.missions.spawnStashes();
    this.bindMenus();
    this.bindResize();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------- setup

  spawnParkedCars() {
    const spots = [
      { x: 138, z: -118, seed: 11 },
      { x: 186, z: -132, seed: 12 },
      { x: -58, z: 132, seed: 13 },
      { x: 64, z: -176, seed: 14 },
    ];
    for (const spot of spots) {
      const car = buildCar('parked', spot.seed);
      car.position.set(spot.x, 0, spot.z);
      car.rotation.y = (spot.seed % 4) * (Math.PI / 2);
      car.userData.driver = false;
      car.userData.parked = true;
      car.userData.heading = 0;
      this.scene.add(car);
      this.parkedCars.push(car);
    }
  }

  spawnGoldCar() {
    if (this.goldCar) return this.goldCar;
    const car = buildHeroCar();
    car.position.set(LANDMARKS.marina.x - 6, 0, LANDMARKS.marina.z + 8);
    car.rotation.y = Math.PI / 2;
    car.userData.driver = false;
    car.userData.parked = true;
    car.userData.heading = 0;
    this.scene.add(car);
    this.parkedCars.push(car);
    this.goldCar = car;
    return car;
  }

  bindMenus() {
    const $ = (id) => document.getElementById(id);
    $('start-btn').addEventListener('click', () => {
      this.sounds.ensure();
      this.newGame();
    });
    $('continue-btn').addEventListener('click', () => {
      this.sounds.ensure();
      this.continueGame();
    });
    $('how-btn').addEventListener('click', () => {
      $('how-panel').style.display = $('how-panel').style.display === 'block' ? 'none' : 'block';
    });
    $('resume-btn').addEventListener('click', () => this.setState('playing'));
    $('restart-btn').addEventListener('click', () => {
      clearSave();
      this.newGame();
    });
    $('quit-btn').addEventListener('click', () => this.setState('menu'));
    $('respawn-btn').addEventListener('click', () => this.respawn());
    $('menu-btn').addEventListener('click', () => this.setState('menu'));
    $('mute-btn').addEventListener('click', () => {
      this.sounds.ensure();
      this.sounds.setMuted(!this.sounds.muted);
      $('mute-btn').textContent = this.sounds.muted ? '🔇 Sound: Off' : '🔊 Sound: On';
    });
    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyM') {
        this.sounds.ensure();
        this.sounds.setMuted(!this.sounds.muted);
      }
      if (event.code === 'Escape' && this.state === 'playing') this.setState('paused');
      else if (event.code === 'Escape' && this.state === 'paused') this.setState('playing');
    });
    // Show Continue only when a save exists.
    const save = loadSave();
    if (save) {
      $('continue-btn').style.display = 'block';
      $('continue-btn').textContent = `Continue — $${save.money.toLocaleString('en-US')} · ${save.missionsDone.length}/5 missions`;
      $('save-note').textContent = `Saved ${new Date(save.savedAt).toLocaleString('en-US')}`;
    }
    if (!storageAvailable()) {
      $('save-note').textContent = 'Saving is unavailable in this browser — progress will not persist.';
    }
  }

  bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ---------------------------------------------------------- states

  setState(next) {
    this.state = next;
    const show = (id, on) => { document.getElementById(id).style.display = on ? 'flex' : 'none'; };
    show('menu-screen', next === 'menu');
    show('pause-screen', next === 'paused');
    show('over-screen', next === 'dead' || next === 'busted');
    // The HUD only belongs to the game itself, not the title screen.
    document.getElementById('hud').style.display = next === 'menu' ? 'none' : 'block';
    if (next === 'dead') {
      document.getElementById('over-title').textContent = 'WASTED';
      document.getElementById('over-sub').textContent = 'Dario went down. The city keeps moving without him.';
    }
    if (next === 'busted') {
      document.getElementById('over-title').textContent = 'BUSTED';
      document.getElementById('over-sub').textContent = 'The Solmar Bay Police took Dario in. Bail was not cheap.';
    }
    if (next === 'playing' || next === 'menu') {
      if (document.pointerLockElement) document.exitPointerLock();
      this.input.flush();
    }
  }

  newGame() {
    this.save = emptySave();
    this.applySave(this.save);
    this.setState('playing');
    this.hud.banner('SOLMAR BAY', 'Welcome back to the city, Dario. Mara is waiting at the garage.');
    this.hud.toast("Drive to Mara's Garage and press E to start your first job.");
  }

  continueGame() {
    const save = loadSave();
    if (!save) return this.newGame();
    this.save = save;
    this.applySave(save);
    this.setState('playing');
    this.hud.banner('WELCOME BACK', `${save.missionsDone.length}/5 missions done · $${save.money.toLocaleString('en-US')}`);
  }

  applySave(save) {
    this.money = save.money || 0;
    this.missions.restore(save.currentMission || 0, save.missionsDone || [], save.stashesFound || []);
    this.player.reset(save.playerX ?? LANDMARKS.playerStart.x, save.playerZ ?? LANDMARKS.playerStart.z);
    this.player.health = save.health ?? 100;
    this.player.armor = save.armor ?? 0;
    this.police.clearWanted();
    if (save.wanted > 0) this.police.addWanted(save.wanted, 'save');
    this.combat.clearGang();
    if (this.missions.currentMission?.id === 'big-score') this.spawnGoldCar();
  }

  respawn() {
    const fine = Math.min(this.money, 100);
    this.money -= fine;
    this.player.reset(LANDMARKS.tower.x + 12, LANDMARKS.tower.z + 12);
    this.police.clearWanted();
    this.combat.clearGang();
    this.setState('playing');
    this.hud.banner('BACK ON YOUR FEET', fine > 0 ? `Hospital bill: $${fine}.` : 'No charge this time.');
  }

  saveGame() {
    if (!this.save) this.save = emptySave();
    this.save.money = this.money;
    this.save.missionsDone = [...this.missions.completed];
    this.save.currentMission = this.missions.current;
    this.save.playerX = this.player.pos.x;
    this.save.playerZ = this.player.pos.z;
    this.save.health = Math.round(this.player.health);
    this.save.armor = Math.round(this.player.armor);
    this.save.wanted = this.police.wanted;
    this.save.stashesFound = [...this.missions.stashesFound];
    writeSave(this.save);
  }

  // ---------------------------------------------------------- missions

  onMissionEvent(type, payload) {
    if (type === 'start') {
      const m = payload.mission;
      this.sounds.missionStart();
      this.hud.banner(m.title.toUpperCase(), m.brief);
      if (m.id === 'heat') {
        this.police.addWanted(3, 'heat');
        this.police.placeAround(this.player.pos);
      }
      if (m.id === 'big-score') this.spawnGoldCar();
      this.saveGame();
    }
    if (type === 'step') {
      this.hud.toast(payload.mission.phases[payload.phase].label);
    }
    if (type === 'done') {
      this.money += payload.reward;
      this.sounds.missionDone();
      this.effects.cashSparkle(this.player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)));
      this.hud.banner('MISSION PASSED', `${payload.mission.title} — +$${payload.reward.toLocaleString('en-US')}`);
      this.saveGame();
    }
    if (type === 'fail') {
      this.sounds.missionFail();
      this.hud.banner('MISSION FAILED', payload.reason);
    }
    if (type === 'stash') {
      this.money += payload.amount;
      this.sounds.cash();
      this.effects.cashSparkle(this.player.pos.clone().add(new THREE.Vector3(0, 1, 0)));
      this.hud.toast(`Cash stash found: +$${payload.amount}`);
      this.saveGame();
    }
  }

  // ---------------------------------------------------------- interaction

  nearestEnterableCar() {
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    let best = null;
    let bestD = 4.5;
    const consider = (car) => {
      const d = dist2D(px, pz, car.position.x, car.position.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    };
    for (const car of this.traffic.cars) consider(car);
    for (const car of this.parkedCars) consider(car);
    return best;
  }

  tryEnterCar() {
    const car = this.nearestEnterableCar();
    if (!car) return;
    this.sounds.doorSlam();
    const wasDriven = !!car.userData.driver;
    car.userData.driver = false;
    if (this.traffic.cars.includes(car)) this.traffic.releaseCar(car);
    this.player.inCar = car;
    this.player.mesh.visible = false;
    this.cameraYaw = car.userData.heading + Math.PI;
    // Stealing a car the driver was sitting in is a crime if anyone sees it.
    const seen = this.peds.peds.some((p) => dist2D(p.position.x, p.position.z, car.position.x, car.position.z) < 15)
      || this.police.cars.some((c) => dist2D(c.position.x, c.position.z, car.position.x, car.position.z) < 60);
    if (wasDriven && seen) {
      this.police.addWanted(1, 'theft');
      this.hud.toast('Someone saw you steal that car!');
    }
    if (car === this.goldCar) this.hud.toast('The Aurelio GT is yours. Get it to the garage!');
  }

  exitCar() {
    const car = this.player.inCar;
    if (!car) return;
    this.player.inCar = null;
    this.player.mesh.visible = true;
    const side = Math.PI / 2;
    const x = car.position.x + Math.sin(car.userData.heading + side) * 2.4;
    const z = car.position.z + Math.cos(car.userData.heading + side) * 2.4;
    const probe = { x, z };
    collideCircle(probe, 0.6, this.colliders);
    this.player.pos.set(clamp(probe.x, -238, 228), 0, clamp(probe.z, -238, 238));
    this.player.heading = car.userData.heading;
    car.userData.driver = false;
    car.userData.parked = true;
    if (!this.parkedCars.includes(car)) this.parkedCars.push(car);
    this.sounds.doorSlam();
  }

  shoot() {
    if (!this.player.canFire()) return;
    this.player.noteFired();
    this.player.aiming = true;
    this.sounds.shoot();
    // Aim from the camera through the screen centre, flattened to the ground.
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const origin = this.player.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const hit = this.combat.playerShoot(origin, dir);
    this.peds.scare(this.player.pos.x, this.player.pos.z, 40);
    // Firing a gun in the open is a crime.
    this.police.addWanted(1, 'shots');
    if (hit && !hit.alive) {
      this.hud.toast('Harbor Kings shooter down.');
    }
  }

  // ---------------------------------------------------------- frame

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'playing') this.update(dt);
    // The menu still renders the city behind it, slowly orbiting.
    if (this.state === 'menu') {
      this.cameraYaw += dt * 0.02;
      this.dayTime = (this.dayTime + dt / DAY_LENGTH) % 1;
      this.updateDayCycle(dt);
      this.traffic.update(dt, null);
      this.positionCamera(dt, true);
      this.renderer.render(this.scene, this.camera);
    }
  }

  update(dt) {
    this.enterCooldown = Math.max(0, this.enterCooldown - dt);
    this.dayTime = (this.dayTime + dt / DAY_LENGTH) % 1;
    this.updateDayCycle(dt);

    // Mouse look.
    const { dx, dy } = this.input.takeMouse();
    this.cameraYaw -= dx * 0.0032;
    this.cameraPitch = clamp(this.cameraPitch + dy * 0.0022, 0.06, 1.05);

    const inCar = !!this.player.inCar;
    let speedKmh = null;
    let carHealth = null;

    if (inCar) {
      const car = this.player.inCar;
      const healthBefore = car.userData.health;
      const { crashed } = driveCar(car, this.input, dt, this.colliders);
      if (crashed && Math.abs(car.userData.speed) > 10) {
        this.effects.crashSmoke(car.position.clone().add(new THREE.Vector3(0, 0.8, 0)));
        this.sounds.crash();
        this.effects.addShake(0.25);
        this.peds.scare(car.position.x, car.position.z, 25);
        if (car.userData.health < healthBefore) this.hud.flashDamage();
      }
      // Running over a pedestrian is a crime.
      for (const ped of this.peds.peds) {
        if (dist2D(ped.position.x, ped.position.z, car.position.x, car.position.z) < 1.6) {
          this.police.addWanted(1, 'hit-ped');
          this.effects.bloodBurst(ped.position.clone().add(new THREE.Vector3(0, 1, 0)));
          ped.position.x += 30; // the crowd scatters; the victim is gone
          ped.position.z += 30;
          this.peds.scare(car.position.x, car.position.z, 30);
        }
      }
      speedKmh = Math.abs(car.userData.speed) * 3.6;
      carHealth = car.userData.health;
      if (car.userData.health <= 0) {
        this.effects.explosion(car.position.clone().add(new THREE.Vector3(0, 1, 0)), 1.4);
        this.sounds.explosion();
        this.scene.remove(car);
        const idx = this.parkedCars.indexOf(car);
        if (idx >= 0) this.parkedCars.splice(idx, 1);
        this.player.inCar = null;
        this.player.mesh.visible = true;
        this.player.pos.set(car.position.x + 3, 0, car.position.z + 3);
        if (this.player.damage(35)) this.die();
        this.hud.banner('CAR DESTROYED', 'That one is scrap now.');
      }
      this.sounds.setEngine(Math.abs(car.userData.speed) / 30, true);
    } else {
      this.player.update(dt, this.input, this.cameraYaw, this.colliders);
      this.sounds.setEngine(0, false);
      // Aiming follows the camera while the mouse is held.
      this.player.aiming = this.input.mouseDown;
      if (this.input.mouseDown || this.input.takeClick()) this.shoot();
      if (this.input.wasPressed('KeyF') || this.input.wasPressed('KeyE')) {
        if (this.enterCooldown <= 0) {
          this.enterCooldown = 0.35;
          // Mission start takes priority over stealing a car.
          const mission = this.missions.atMissionStart(this.player.pos.x, this.player.pos.z);
          if (mission) this.missions.startMission(this.missions.current);
          else this.tryEnterCar();
        }
      }
    }
    if (inCar && (this.input.wasPressed('KeyF') || this.input.wasPressed('KeyE'))) {
      if (this.enterCooldown <= 0) {
        this.enterCooldown = 0.35;
        this.exitCar();
      }
    }

    // World systems.
    const playerPos = this.player.pos;
    this.traffic.update(dt, playerPos);
    this.peds.update(dt, playerPos, inCar ? Math.abs(this.player.inCar?.userData.speed || 0) : this.player.speed2D);
    const policeEvents = this.police.update(dt, this.player, this.player.inCar);
    if (policeEvents.rammed) {
      this.effects.addShake(0.5);
      this.sounds.crash();
      this.hud.flashDamage();
      if (inCar && this.player.inCar) {
        this.player.inCar.userData.health -= 8;
      } else if (!inCar) {
        if (this.player.damage(12)) this.die();
      }
    }
    if (policeEvents.busted) {
      this.sounds.busted();
      this.setState('busted');
    }
    this.combat.update(dt, this.player, (damage) => {
      this.sounds.enemyShoot();
      if (this.player.damage(damage)) this.die();
      this.hud.flashDamage();
    });

    // Missions and stashes.
    this.missions.update(dt, {
      player: this.player,
      playerCar: this.player.inCar,
      inCar: this.player.inCar,
      combat: this.combat,
      police: this.police,
      goldCar: this.goldCar,
    });
    this.missions.checkStash(playerPos.x, playerPos.z);

    // Prompts.
    let prompt = '';
    if (!inCar) {
      const mission = this.missions.atMissionStart(playerPos.x, playerPos.z);
      if (mission) prompt = `Press E — Start "${mission.title}"`;
      else if (this.nearestEnterableCar()) prompt = 'Press E — Steal car';
    } else {
      prompt = 'E — Get out   ·   Space — Handbrake';
    }
    this.hud.showPrompt(prompt);

    // HUD + minimap.
    const mission = this.missions.currentMission;
    this.hud.update({
      health: this.player.health,
      armor: this.player.armor,
      money: this.money,
      wanted: this.police.wanted,
      objective: this.missions.objectiveText(),
      speedKmh,
      carHealth,
      timerText: this.missions.state === 'active' && mission?.timeLimit
        ? `⏱ ${Math.max(0, Math.ceil(this.missions.timer))}s`
        : '',
      bust: policeEvents.bust,
    });
    this.hud.drawMinimap({
      playerX: playerPos.x,
      playerZ: playerPos.z,
      // The player can get out of the car mid-frame (E), so read the
      // current car instead of the frame's stale `inCar` snapshot.
      playerHeading: this.player.inCar ? this.player.inCar.userData.heading : this.player.heading,
      cars: this.traffic.cars,
      police: this.police.cars,
      marker: this.missions.target,
    });

    // Siren + effects + camera.
    this.sounds.setSiren(this.police.wanted > 0);
    this.effects.update(dt);
    this.positionCamera(dt, false);

    // Autosave.
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 15) {
      this.autosaveTimer = 0;
      this.saveGame();
    }

    this.renderer.render(this.scene, this.camera);
  }

  die() {
    if (this.state !== 'playing') return;
    this.sounds.explosion();
    this.setState('dead');
  }

  updateDayCycle(dt) {
    // 0 = dawn, 0.25 = morning, 0.5 = noon, 0.75 = sunset, 1 = night.
    const t = this.dayTime;
    const sunHeight = Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    const sunset = clamp(1 - Math.abs(t - 0.78) * 6, 0, 1);
    const night = clamp(1 - Math.abs(t - 1) * 8, 0, 1) + clamp(1 - Math.abs(t) * 8, 0, 1);
    const sky = SKY_DAY.clone().lerp(SKY_SUNSET, sunset).lerp(SKY_NIGHT, clamp(night, 0, 1) * 0.8);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.sun.intensity = lerp(0.25, 1.5, sunHeight);
    this.sun.color.setHex(sunset > 0.4 ? 0xffb36b : 0xfff2d8);
    this.sun.position.set(Math.cos(t * Math.PI * 2) * 180, 60 + sunHeight * 160, Math.sin(t * Math.PI * 2) * 120);
    // The water shimmers a little as the day passes.
    if (this.city.waterMat?.map) {
      this.city.waterMat.map.offset.x = (this.dayTime * 0.05) % 1;
      this.city.waterMat.map.offset.y = (this.dayTime * 0.03) % 1;
    }
  }

  positionCamera(dt, menuMode) {
    const target = this.player.inCar
      ? this.player.inCar.position
      : this.player.pos;
    const inCar = !!this.player.inCar;
    // In a car the camera swings behind the car; on foot it follows the mouse.
    if (inCar && !menuMode) {
      const wantYaw = this.player.inCar.userData.heading + Math.PI;
      let d = wantYaw - this.cameraYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.cameraYaw += d * Math.min(1, 2.2 * dt);
    }
    const dist = inCar ? 11 : 7.5;
    const height = Math.sin(this.cameraPitch) * dist + (inCar ? 2.2 : 1.6);
    const flat = Math.cos(this.cameraPitch) * dist;
    const shake = this.effects.shakeOffset(dt);
    const cx = target.x + Math.sin(this.cameraYaw) * flat + shake.x;
    const cz = target.z + Math.cos(this.cameraYaw) * flat;
    const cy = target.y + height + shake.y;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(target.x, target.y + (inCar ? 1.4 : 1.5), target.z);
  }
}

// Boot: the title screen shows first; a ?shot= URL jumps straight into a
// staged scene so the screenshots are real renders of the game running.
const game = new Game();
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  game.newGame();
  game.setState('playing');
  stageShot(game, shot);
}

function stageShot(game, shot) {
  const P = game.player;
  const setPlayer = (x, z, heading) => {
    P.pos.set(x, 0, z);
    P.heading = heading;
    game.cameraYaw = heading + Math.PI;
  };
  if (shot === 'cover') {
    // Downtown on foot at golden hour: the tower ahead, traffic on the
    // road, peds on the sidewalks. The player stands on the central
    // junction so no building collider pushes them out of frame.
    game.dayTime = 0.72;
    setPlayer(0, -6, 0.69);
    game.cameraPitch = 0.42;
  } else if (shot === 'chase') {
    // Wanted 3, police on the tail, mission live, downtown.
    game.dayTime = 0.6;
    P.pos.set(0, 0, -60);
    const car = game.traffic.cars[0];
    game.player.inCar = car;
    game.player.mesh.visible = false;
    car.userData.driver = false;
    game.traffic.releaseCar(car);
    car.position.set(0, 0, -60);
    car.userData.heading = 0;
    car.userData.speed = 18;
    game.police.addWanted(3, 'shot');
    game.police.placeAround(P.pos);
    game.missions.startMission(1);
  } else if (shot === 'mission') {
    // The warehouse shootout: gang spawned, mission live, player aiming
    // at the warehouse (southwest of the player, heading about -0.74).
    game.dayTime = 0.45;
    setPlayer(-190, 128, -0.74);
    game.missions.startMission(3);
    game.combat.spawnGang(-210, 136, 5, -Math.PI / 2);
    game.missions.gangSpawned = true;
    P.aiming = true;
  } else if (shot === 'street') {
    // Cruising the beach road at sunset in a coupe.
    game.dayTime = 0.78;
    const car = game.parkedCars[1];
    game.player.inCar = car;
    game.player.mesh.visible = false;
    car.userData.driver = false;
    car.position.set(180, 0, 60);
    car.userData.heading = Math.PI / 2;
    car.userData.speed = 16;
    P.pos.set(180, 0, 60);
  }
  // Let the world settle one frame before the screenshot is taken.
  game.update(0.1);
  window.__shotReady = true;
}

window.__solmar = game;
