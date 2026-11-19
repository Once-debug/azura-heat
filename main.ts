// A working gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. Only the plumbing, not an open world: Block
// Dodger, a plain 2D canvas game where a paddle dodges falling blocks and catches coins, with a
// title screen, score, lives and levels, game over and restart, flat colours and no sound. Build
// your own open-world crime game in its place (three.js or any library you vendor under game/),
// put your 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// --- Build self-verification -------------------------------------------------
// Before anything is copied, walk the package on disk and hold it against the
// packaging rules the scorer enforces, so a broken entry fails here — loudly,
// with the offending file named — instead of being refused after submission.
// The limits below mirror the caps handed to buildDossier at the bottom of
// this file; if those ever change, change them here too and keep them equal.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';

const LIMITS = {
  gameFiles: 993, // most files allowed under game/
  gameBytes: 50331648, // 48 MiB across all of game/
  gamePathBytes: 1000, // longest allowed path under game/, in bytes
  indexBytes: 1048576, // 1 MiB for game/index.html itself
  shotsMin: 3, // fewest screenshots handed in
  shotsMax: 4, // most screenshots handed in
  shotBytes: 262144, // 256 KiB per screenshot
};

// Recursively list every file under dir as { path, bytes }, where path is
// relative to the package root, so messages read like a scorer's report.
function walkFiles(root, dir, found) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) walkFiles(root, full, found);
    else if (name.isFile()) found.push({ path: relative(root, full), bytes: statSync(full).size });
  }
  return found;
}

function verifyPackage(root) {
  const problems = [];
  const gameDir = join(root, 'game');
  const shotsDir = join(root, 'screenshots');

  // game/: presence, file count, total size, per-path length, index size.
  let gameFiles = [];
  if (!existsSync(gameDir)) {
    problems.push('game/ is missing');
  } else {
    gameFiles = walkFiles(root, gameDir, []);
    const totalBytes = gameFiles.reduce((sum, f) => sum + f.bytes, 0);
    if (gameFiles.length > LIMITS.gameFiles)
      problems.push(`game/ holds ${gameFiles.length} files, over the ${LIMITS.gameFiles} cap`);
    if (totalBytes > LIMITS.gameBytes)
      problems.push(`game/ totals ${totalBytes} bytes, over the ${LIMITS.gameBytes} byte cap`);
    for (const f of gameFiles) {
      const pathBytes = Buffer.byteLength(f.path, 'utf8');
      if (pathBytes > LIMITS.gamePathBytes)
        problems.push(`${f.path} runs ${pathBytes} bytes, over the ${LIMITS.gamePathBytes} byte path cap`);
    }
    const index = gameFiles.find((f) => f.path === join('game', 'index.html'));
    if (!index) problems.push('game/index.html is missing');
    else if (index.bytes > LIMITS.indexBytes)
      problems.push(`game/index.html is ${index.bytes} bytes, over the ${LIMITS.indexBytes} byte cap`);
  }

  // screenshots/: count, per-file size, and image extension.
  let shotFiles = [];
  if (!existsSync(shotsDir)) {
    problems.push('screenshots/ is missing');
  } else {
    shotFiles = walkFiles(root, shotsDir, []);
    if (shotFiles.length < LIMITS.shotsMin || shotFiles.length > LIMITS.shotsMax)
      problems.push(
        `screenshots/ holds ${shotFiles.length} files, outside the ${LIMITS.shotsMin}-${LIMITS.shotsMax} allowed`,
      );
    for (const f of shotFiles) {
      if (f.bytes > LIMITS.shotBytes)
        problems.push(`${f.path} is ${f.bytes} bytes, over the ${LIMITS.shotBytes} byte screenshot cap`);
      if (!/\.(png|jpe?g)$/i.test(f.path)) problems.push(`${f.path} is not a PNG or JPEG screenshot`);
    }
  }

  // shots.json: it must parse, and every screenshot it names must be on disk.
  const shotsList = join(root, 'shots.json');
  if (!existsSync(shotsList)) {
    problems.push('shots.json is missing');
  } else {
    let planned = null;
    try {
      planned = JSON.parse(readFileSync(shotsList, 'utf8'));
    } catch {
      problems.push('shots.json does not parse as JSON');
    }
    if (Array.isArray(planned)) {
      const onDisk = new Set(shotFiles.map((f) => f.path.split('/').pop()));
      for (const entry of planned) {
        if (!entry || typeof entry.name !== 'string') problems.push('shots.json has an entry with no file name');
        else if (!onDisk.has(entry.name))
          problems.push(`shots.json names ${entry.name}, which is not in screenshots/`);
      }
    } else if (planned !== null) {
      problems.push('shots.json is not a list of screenshots');
    }
  }

  if (problems.length > 0) {
    throw new Error(`package self-verification failed:\n  - ${problems.join('\n  - ')}`);
  }
  const gameBytes = gameFiles.reduce((sum, f) => sum + f.bytes, 0);
  console.log(
    `[azura-heat] verified: game/ ${gameFiles.length} files, ${gameBytes} bytes; ` +
      `screenshots/ ${shotFiles.length} files, all within limits`,
  );
}

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

console.log('[azura-heat] build: verifying the package before handing it in');
verifyPackage(here);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`[azura-heat] build: game, screenshots and dossier.json written to ${out}`);
