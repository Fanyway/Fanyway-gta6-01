// SOLMAR — small math and random helpers shared by every system.
// Nothing here knows about three.js or the DOM, so it is easy to test.

/** Seeded PRNG (mulberry32): the same seed always deals the same city. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed angle from `from` to `to`, in radians. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Ease an angle toward a target at most `maxStep` radians this frame. */
export function turnToward(from, to, maxStep) {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Pick one entry of `items` using `rand` (a function returning [0,1)). */
export function pick(rand, items) {
  return items[Math.floor(rand() * items.length)];
}

/** A random float in [min, max) from `rand`. */
export function range(rand, min, max) {
  return min + rand() * (max - min);
}

/** Format a dollar amount with thousands separators, e.g. 12500 -> "12,500". */
export function formatMoney(amount) {
  return Math.floor(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format a countdown in seconds as M:SS. */
export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 2D axis-aligned box overlap test, used for building collision. */
export function boxesOverlap(ax, az, aw, ad, bx, bz, bw, bd) {
  return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(az - bz) * 2 < ad + bd;
}
