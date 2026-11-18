// SOLMAR — procedural textures. Every surface in the city is painted by
// code onto a canvas and used as a three.js CanvasTexture, so the game
// ships no image files at all.

import * as THREE from 'three';
import { mulberry32, range } from './utils.js';

/** Make a canvas of the given size and hand back its 2D context. */
function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A building facade: base colour, a grid of windows (some lit, some dark),
 * a darker ground floor with a door and an awning stripe.
 */
export function buildingTexture(baseColor, seed, floors = 8) {
  const rand = mulberry32(seed);
  const [canvas, ctx] = makeCanvas(256, 512);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 512);
  // Subtle vertical shading so the face reads as concrete panels.
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = `rgba(0,0,0,${0.04 + rand() * 0.05})`;
    ctx.fillRect(x, 0, 16, 512);
  }
  const cols = 6;
  const rows = Math.max(3, floors);
  const cellW = 256 / cols;
  const cellH = 512 / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = rand() < 0.28;
      const shade = 0.5 + rand() * 0.5;
      ctx.fillStyle = lit
        ? `rgb(${Math.floor(255 * shade)},${Math.floor(214 * shade)},${Math.floor(120 * shade)})`
        : `rgb(${Math.floor(38 * shade)},${Math.floor(58 * shade)},${Math.floor(84 * shade)})`;
      ctx.fillRect(c * cellW + 6, r * cellH + 8, cellW - 12, cellH - 16);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(c * cellW + 6, r * cellH + 8, cellW - 12, 4);
    }
  }
  // Ground floor: darker band, a door, a shop awning.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 512 - 64, 256, 64);
  ctx.fillStyle = '#2c2118';
  ctx.fillRect(108, 512 - 56, 40, 56);
  ctx.fillStyle = ['#c94f38', '#2e7f8a', '#d9a441', '#5b7d4f'][seed % 4];
  ctx.fillRect(0, 512 - 72, 256, 10);
  return toTexture(canvas);
}

/** Asphalt with a dashed centre line, tiled along the road. One tile is
 *  about 6 m of road: a dash, a gap, a dash, a gap. The caller sets the
 *  repeat so the dashes stay road-scale on a long plane. `horizontal`
 *  draws the dash along the texture's U axis (for roads whose length runs
 *  along U); the default draws it along V. */
export function roadTexture(repeatX = 80, repeatY = 1, horizontal = false) {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(0, 0, 128, 128);
  const rand = mulberry32(11);
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.04})`;
    ctx.fillRect(rand() * 128, rand() * 128, 2, 2);
  }
  ctx.fillStyle = '#f5d76e';
  if (horizontal) {
    ctx.fillRect(8, 60, 44, 8);
    ctx.fillRect(76, 60, 44, 8);
  } else {
    ctx.fillRect(60, 8, 8, 44);
    ctx.fillRect(60, 76, 8, 44);
  }
  return toTexture(canvas, repeatX, repeatY);
}

/** Pale pavement slabs with expansion joints. */
export function sidewalkTexture() {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#9aa0a3';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }
  const rand = mulberry32(23);
  for (let i = 0; i < 120; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.05})`;
    ctx.fillRect(rand() * 128, rand() * 128, 3, 3);
  }
  // One tile is about 9 m, so the slab joints read at street scale on the
  // 540 m ground plane.
  return toTexture(canvas, 60, 60);
}

/** Beach sand with speckles and a wet band at the waterline. */
export function sandTexture() {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(0, 0, 256, 256);
  const rand = mulberry32(41);
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(120,90,40,0.12)' : 'rgba(255,255,255,0.14)';
    ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  return toTexture(canvas, 8, 8);
}

/** Park grass with mowing stripes. */
export function grassTexture() {
  const [canvas, ctx] = makeCanvas(128, 128);
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#5da24a' : '#548f42';
    ctx.fillRect(0, i * 16, 128, 16);
  }
  const rand = mulberry32(77);
  for (let i = 0; i < 200; i += 1) {
    ctx.fillStyle = `rgba(0,60,0,${0.05 + rand() * 0.08})`;
    ctx.fillRect(rand() * 128, rand() * 128, 2, 3);
  }
  return toTexture(canvas, 6, 6);
}

/** Ocean surface: deep teal with soft moving swell bands. */
export function waterTexture() {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#1e7fa8';
  ctx.fillRect(0, 0, 256, 256);
  const rand = mulberry32(99);
  for (let i = 0; i < 26; i += 1) {
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + rand() * 0.1})`;
    ctx.lineWidth = 2 + rand() * 3;
    ctx.beginPath();
    const y = rand() * 256;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 6);
    ctx.stroke();
  }
  return toTexture(canvas, 6, 6);
}

/** A glowing billboard face: gradient sky, big letters, a palm silhouette. */
export function billboardTexture(lines, bg1, bg2) {
  const [canvas, ctx] = makeCanvas(512, 256);
  const grad = ctx.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, bg1);
  grad.addColorStop(1, bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillText(line, 256, 84 + i * 72);
  });
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillText('SOLMAR BAY', 256, 226);
  return toTexture(canvas);
}

/** Soft round glow used for headlights, muzzle flashes and markers. */
export function glowTexture() {
  const [canvas, ctx] = makeCanvas(64, 64);
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
