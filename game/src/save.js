// SOLMAR — saving. Progress lives in localStorage under one key, so a
// session survives a reload: money, mission progress, the player's
// position, health and the wanted level. The save is plain JSON — the
// player can inspect it, and a corrupt entry is simply ignored.

import { SAVE_KEY } from './config.js';

/** The shape of a save. Everything the game needs to resume mid-story. */
export function emptySave() {
  return {
    version: 1,
    money: 0,
    missionsDone: [],
    currentMission: 0,
    playerX: 150,
    playerZ: -132,
    health: 100,
    armor: 0,
    wanted: 0,
    stashesFound: [],
    savedAt: 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return { ...emptySave(), ...data };
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    const payload = { ...data, savedAt: Date.now() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable (private mode): the game still runs unsaved.
  }
}

/** True when the browser lets us persist at all. */
export function storageAvailable() {
  try {
    localStorage.setItem('__solmar_probe__', '1');
    localStorage.removeItem('__solmar_probe__');
    return true;
  } catch {
    return false;
  }
}
