// SOLMAR — the story. Five missions from Mara's garage to the big score,
// each with a briefing, an objective marker in the world and on the
// minimap, optional timers and shootouts, and a cash payout. Plus twelve
// hidden cash stashes scattered around the city for explorers. The game
// is free-roam between missions: drive, steal cars, and raise hell.

import * as THREE from 'three';
import { MISSIONS, STASHES, PALETTE } from './config.js';
import { LANDMARKS } from './city.js';
import { dist2D } from './utils.js';

const MARKER_COLORS = {
  start: 0xffd34d,
  goto: 0x4db2ff,
  pickup: 0x7ddc5a,
  escape: 0xff5a3c,
  finish: 0xffd34d,
};

/** A pulsing beacon: a glowing ring on the ground and a vertical beam. */
export function makeMarker(color = 0xffd34d) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.4, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 42, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 21;
  group.add(ring, beam);
  group.userData.ring = ring;
  group.userData.beam = beam;
  group.userData.baseColor = color;
  return group;
}

export class MissionManager {
  constructor(scene, onEvent) {
    this.scene = scene;
    this.onEvent = onEvent; // (type, payload) — 'start' | 'done' | 'fail' | 'step' | 'stash'
    this.missions = MISSIONS;
    this.current = 0;
    this.completed = new Set();
    this.state = 'idle'; // idle | active | done
    this.phase = 0;
    this.timer = 0;
    this.marker = null;
    this.target = null; // { x, z, label, kind }
    this.stashes = [];
    this.stashesFound = new Set();
    this.gangSpawned = false;
    this.goldCar = null;
    this.packageTaken = false;
    this.time = 0;
  }

  /** Restore progress from a save. */
  restore(current, completed, stashesFound) {
    this.current = current;
    this.completed = new Set(completed || []);
    this.stashesFound = new Set(stashesFound || []);
    // Stashes are spawned once by the constructor; drop any already found.
    for (let i = this.stashes.length - 1; i >= 0; i -= 1) {
      if (this.stashesFound.has(this.stashes[i].userData.stashId)) {
        this.scene.remove(this.stashes[i]);
        this.stashes.splice(i, 1);
      }
    }
  }

  get currentMission() {
    return this.missions[this.current] || null;
  }

  get allDone() {
    return this.current >= this.missions.length;
  }

  /** Place the twelve cash stashes; returns their positions for the HUD. */
  spawnStashes() {
    for (const s of STASHES) {
      if (this.stashesFound.has(s.id)) continue;
      const group = new THREE.Group();
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.55, 0.6),
        new THREE.MeshLambertMaterial({ color: 0x2e7f3a, emissive: 0x0a2f10 }),
      );
      bag.position.y = 0.3;
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.18, 0.62),
        new THREE.MeshLambertMaterial({ color: 0xffd34d }),
      );
      band.position.y = 0.32;
      group.add(bag, band);
      group.position.set(s.x, 0, s.z);
      group.userData.stashId = s.id;
      this.scene.add(group);
      this.stashes.push(group);
    }
  }

  /** Collect a stash the player walks over. Returns the amount or 0. */
  checkStash(playerX, playerZ) {
    for (let i = this.stashes.length - 1; i >= 0; i -= 1) {
      const s = this.stashes[i];
      if (dist2D(playerX, playerZ, s.position.x, s.position.z) < 2.2) {
        const def = STASHES.find((d) => d.id === s.userData.stashId);
        this.scene.remove(s);
        this.stashes.splice(i, 1);
        this.stashesFound.add(s.userData.stashId);
        this.onEvent('stash', { amount: def.amount, id: s.userData.stashId });
        return def.amount;
      }
    }
    return 0;
  }

  setMarker(x, z, kind = 'goto') {
    this.clearMarker();
    this.marker = makeMarker(MARKER_COLORS[kind] ?? MARKER_COLORS.goto);
    this.marker.position.set(x, 0, z);
    this.scene.add(this.marker);
  }

  clearMarker() {
    if (this.marker) {
      this.scene.remove(this.marker);
      this.marker = null;
    }
  }

  startMission(index) {
    const mission = this.missions[index];
    if (!mission) return false;
    this.current = index;
    this.state = 'active';
    this.phase = 0;
    this.timer = mission.timeLimit || 0;
    this.gangSpawned = false;
    this.packageTaken = false;
    this.setTargetForPhase();
    this.onEvent('start', { mission });
    return true;
  }

  /** Where the marker goes for the current mission + phase. */
  setTargetForPhase() {
    const m = this.currentMission;
    if (!m) return;
    const phase = m.phases[this.phase];
    const loc = phase.location;
    let x = loc.x;
    let z = loc.z;
    // Landmarks point at their front door, not their centre: the player
    // can never walk inside a building, so a centre target is unreachable.
    if (loc === 'garage') { x = LANDMARKS.garage.start.x; z = LANDMARKS.garage.start.z; }
    if (loc === 'tower') { x = LANDMARKS.tower.start.x; z = LANDMARKS.tower.start.z; }
    if (loc === 'docks') { x = LANDMARKS.docks.x; z = LANDMARKS.docks.z; }
    if (loc === 'warehouse') { x = LANDMARKS.warehouse.front.x; z = LANDMARKS.warehouse.front.z; }
    if (loc === 'marina') { x = LANDMARKS.marina.x; z = LANDMARKS.marina.z; }
    this.target = { x, z, label: phase.label, kind: phase.kind };
    this.setMarker(x, z, phase.kind);
  }

  /** Advance one phase; completes the mission when the phases run out. */
  advancePhase() {
    const m = this.currentMission;
    this.phase += 1;
    if (this.phase >= m.phases.length) {
      this.completeMission();
      return;
    }
    this.setTargetForPhase();
    this.onEvent('step', { mission: m, phase: this.phase });
  }

  completeMission() {
    const m = this.currentMission;
    this.completed.add(m.id);
    this.current += 1;
    this.state = 'idle';
    this.clearMarker();
    this.target = null;
    this.onEvent('done', { mission: m, reward: m.reward });
  }

  failMission(reason) {
    const m = this.currentMission;
    this.state = 'idle';
    this.clearMarker();
    this.target = null;
    this.onEvent('fail', { mission: m, reason });
  }

  /**
   * The per-frame mission brain. `ctx` carries the live game state:
   * { player, playerCar, inCar, combat, police, goldCar }.
   * Returns nothing; progress is reported through onEvent.
   */
  update(dt, ctx) {
    this.time += dt;
    if (this.marker) {
      const pulse = 1 + Math.sin(this.time * 4) * 0.12;
      this.marker.userData.ring.scale.setScalar(pulse);
      this.marker.userData.beam.material.opacity = 0.12 + Math.sin(this.time * 4) * 0.05;
    }
    for (const s of this.stashes) {
      s.rotation.y += dt * 0.8;
      s.position.y = Math.abs(Math.sin(this.time * 2 + s.userData.stashId)) * 0.15;
    }
    if (this.state !== 'active' || !this.currentMission) return;
    const m = this.currentMission;
    const px = ctx.playerCar ? ctx.playerCar.position.x : ctx.player.pos.x;
    const pz = ctx.playerCar ? ctx.playerCar.position.z : ctx.player.pos.z;

    if (m.timeLimit) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.failMission('Time ran out');
        return;
      }
    }

    const phase = m.phases[this.phase];
    const reach = phase.kind === 'goto' ? 5 : 4;
    switch (m.id) {
      case 'wheels': {
        // Phase 0: steal any car — the player must be driving when they
        // reach the junction. Phase 1: bring it back to the garage.
        if (this.phase === 0) {
          if (ctx.inCar && dist2D(px, pz, this.target.x, this.target.z) < reach) this.advancePhase();
        } else if (ctx.inCar && dist2D(px, pz, LANDMARKS.garage.start.x, LANDMARKS.garage.start.z) < 6) {
          this.completeMission();
        }
        break;
      }
      case 'package': {
        if (this.phase === 0) {
          if (!ctx.inCar && dist2D(px, pz, this.target.x, this.target.z) < reach) {
            this.packageTaken = true;
            this.advancePhase();
          }
        } else if (this.phase === 1) {
          // Police heat starts once the package is in hand.
          if (!this.gangSpawned) {
            this.gangSpawned = true;
            ctx.police.addWanted(2, 'package');
            ctx.police.placeAround(ctx.player.pos);
          }
          if (dist2D(px, pz, this.target.x, this.target.z) < reach) this.completeMission();
        }
        break;
      }
      case 'heat': {
        // Survive the timer with the police on you, then lose them.
        if (this.timer <= 0) break; // handled above by fail
        if (ctx.police.wanted <= 0 && this.phase === 0) {
          this.advancePhase();
        }
        break;
      }
      case 'kings': {
        if (this.phase === 0) {
          if (dist2D(px, pz, this.target.x, this.target.z) < 10) {
            if (!this.gangSpawned) {
              this.gangSpawned = true;
              // The shooters hold the yard in front of the warehouse,
              // fanning out toward the north road the player arrives on.
              ctx.combat.spawnGang(LANDMARKS.warehouse.x, 136, 5, -Math.PI / 2);
            }
            if (ctx.combat.aliveCount() === 0) this.advancePhase();
          }
        } else if (this.phase === 1) {
          if (dist2D(px, pz, this.target.x, this.target.z) < reach) this.completeMission();
        }
        break;
      }
      case 'big-score': {
        if (this.phase === 0) {
          if (dist2D(px, pz, this.target.x, this.target.z) < 8) {
            if (!this.gangSpawned) {
              this.gangSpawned = true;
              ctx.combat.spawnGang(LANDMARKS.marina.x, LANDMARKS.marina.z, 4);
              ctx.police.addWanted(1, 'marina');
            }
            if (ctx.combat.aliveCount() === 0) this.advancePhase();
          }
        } else if (this.phase === 1) {
          // Steal the gold Aurelio GT and drive it to the garage.
          const gold = ctx.goldCar;
          if (gold && ctx.inCar === gold) {
            if (dist2D(px, pz, LANDMARKS.garage.start.x, LANDMARKS.garage.start.z) < 6) {
              this.completeMission();
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }

  /** The text the HUD shows for the current objective. */
  objectiveText() {
    if (this.state === 'active' && this.target) {
      const m = this.currentMission;
      const timer = m.timeLimit ? ` — ${Math.max(0, Math.ceil(this.timer))}s` : '';
      return `${m.title}: ${this.target.label}${timer}`;
    }
    if (this.allDone) return 'Story complete — Solmar Bay is yours. Free roam!';
    const next = this.missions[this.current];
    return next ? `Next: ${next.title} — drive to ${"Mara's Garage"} and press E` : '';
  }

  /** Is the player standing at the mission start point? */
  atMissionStart(playerX, playerZ) {
    if (this.state === 'active' || this.allDone) return null;
    const next = this.missions[this.current];
    if (!next) return null;
    // The start point is the landmark's front door, not its centre: the
    // player can never walk inside a building, so the centre of a big
    // building is unreachable.
    const landmark = next.startAt === 'garage' ? LANDMARKS.garage : LANDMARKS.tower;
    const start = landmark.start ?? landmark;
    if (dist2D(playerX, playerZ, start.x, start.z) < 7) return next;
    return null;
  }
}
