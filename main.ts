// SOLMAR — the entrypoint for "Make GTA 6" (make.fun gta6-01).
//
// A Node 22 program, standard library only. It takes this repository's
// game/ (the playable game: static files, no network) and screenshots/
// (real renders of the game running) and hands them in as /output:
//   game/        -> /output/game/
//   screenshots/ -> /output/screenshots/
//   dossier.json -> /output/dossier.json, built by the vendored make.fun
//                   library so the judge's summary matches the files.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The game itself is served locally with `node serve.ts`, then opened at
// http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's caps for this bounty (gate.json): the text cap shapes the
// dossier's bytes; the rest refuse an entry the scorer would refuse.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

/** Count the files and bytes under a directory, recursively. */
function treeSize(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = treeSize(path);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

// The game must be present and playable: an index.html at the root of
// game/ is what the browser opens, and what the dossier requires.
if (!existsSync(join(gameDir, 'index.html'))) {
  fail('game/index.html is missing — a game is a directory of static files with its index.html at the root');
}
const indexBytes = statSync(join(gameDir, 'index.html')).size;
if (indexBytes > 1024 * 1024) {
  fail(`game/index.html is ${indexBytes} bytes, over the 1 MiB a page may be`);
}
const gameTree = treeSize(gameDir);
if (gameTree.files > CAPS.game_max_files) {
  fail(`game/ holds ${gameTree.files} files, over the ${CAPS.game_max_files} allowed`);
}
if (gameTree.bytes > CAPS.game_max_bytes) {
  fail(`game/ is ${gameTree.bytes} bytes, over the ${CAPS.game_max_bytes} allowed`);
}

// The screenshots are the judge's first look: three or four renders,
// the first by name the cover.
const shots = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort()
  : [];
if (shots.length < 3 || shots.length > 4) {
  fail(`screenshots/ holds ${shots.length} images — this bounty takes 3 or 4`);
}
for (const name of shots) {
  const bytes = statSync(join(shotsDir, name)).size;
  if (bytes > CAPS.screenshots.max_bytes) {
    fail(`screenshots/${name} is ${bytes} bytes, over the ${CAPS.screenshots.max_bytes} allowed`);
  }
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The dossier is built from what was just copied, so it always matches
// the entry the grader sees.
const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

// A short summary for the person running the build.
console.log('SOLMAR handed in:');
console.log(`  game/        -> ${join(out, 'game')} (${gameTree.files} files, ${gameTree.bytes} bytes; index.html ${indexBytes} bytes)`);
console.log(`  screenshots/ -> ${shots.length} images, first is the cover: ${shots[0]}`);
console.log(`  dossier.json -> ${dossier.length} bytes`);
