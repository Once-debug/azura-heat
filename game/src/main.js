// AZURA HEAT — a top-down open-world crime game in one canvas.
// This module owns the game state and the loop: player, combat, wanted level, busts
// and hospital visits, ambient traffic, and the glue between the city (world.js), the
// people in it (ai.js), the story (missions.js) and the drawing (render.js).

import { buildCity, losBlocked, collideBuildings, collideProps, isWater, WORLD_W, WORLD_H } from './world.js';
import { makeCar, makePed, makeOfficer, makeThug, updateCarPhysics, collideCarPair, damageCar } from './entities.js';
import { updateTraffic, updatePeds, updatePolice, updateThugs } from './ai.js';
import { createMissionState, updateMissions, failMission, MISSIONS, POST_MISSIONS, DOCK_MISSIONS } from './missions.js';
import { drawGame } from './render.js';
import { stageShot } from './shots.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { Rng, clamp, rand } from './rng.js';

const CITY_SEED = 7;
const STAR_HEAT = [0, 15, 35, 60, 90, 125];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);

const game = {
  screen: 'title',
  view: { w: 1280, h: 720 },
  city: null,
  seed: CITY_SEED,
  rng: new Rng(99),
  time: 0,
  dayT: 0.5,
  frozen: false,
  cameraLock: false,
  camera: { x: 0, y: 0, shakeX: 0, shakeY: 0, shake: 0 },
  player: null,
  cars: [],
  peds: [],
  particles: [],
  tracers: [],
  skids: [],
  pickups: [],
  cash: 120,
  wanted: { heat: 0, stars: 0, losT: 0, bustT: 0 },
  mission: createMissionState(),
  side: null,
  dialogue: null,
  banner: null,
  objective: null,
  markedCar: null,
  repoCar: null,
  targetPed: null,
  duel: null,
  boat: null,
  safehouseOwned: false,
  manifestTruck: null,
  suppressSafehouse: false,
  shopPrompt: null,
  sprayT: 0,
  chatter: null,
  chatterT: 4,
  event: null,
  eventT: 18,
  danger: null,
  policeSpawnT: 0,
  stats: { missions: 0, stolen: 0, fares: 0, parcels: 0, crimes: 0, shots: 0 },
  menuIdx: 0,
  hasSaveFile: false,
  muted: false,
  audio,
  fx: null,
};

function freshPlayer(x, y) {
  return {
    id: 0, kind: 'player', x, y, r: 10, angle: -Math.PI / 2, speed: 0,
    hp: 100, car: null, boat: null, moving: false,
    weapon: 'fist', hasPistol: false, mag: 0, ammo: 0, reloading: 0, atkT: 0,
    hasSMG: false, smgMag: 0, smgAmmo: 0, armor: 0,
    shirt: '#12b5a5', pants: '#2e3440', skin: '#c68863', state: 'walk',
  };
}

// ---------------------------------------------------------------------------
// Spawning helpers (also the hooks ai.js and missions.js call into).

game.spawnCar = (type, x, y, angle, opts) => {
  const car = makeCar(type, x, y, angle, opts);
  game.cars.push(car);
  return car;
};

game.spawnOfficer = (x, y) => {
  const cop = makeOfficer(x, y);
  game.peds.push(cop);
  return cop;
};

game.spawnThugs = (x, y) => {
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    game.peds.push(makeThug(x + Math.cos(a) * 90, y + Math.sin(a) * 90));
  }
};

game.spawnPassenger = () => {
  const spots = [
    { x: 1064, y: 668 }, { x: 1464, y: 1068 }, { x: 664, y: 1468 },
    { x: 2264, y: 668 }, { x: 1864, y: 1468 }, { x: 864, y: 268 },
  ];
  const s = spots[Math.floor(Math.random() * spots.length)];
  const ped = makePed(s.x, s.y);
  ped.tx = s.x;
  ped.ty = s.y;
  game.peds.push(ped);
  return ped;
};

game.spawnMarkedCar = () => {
  const lot = game.city.parkedSpots.filter((s) => s.angle === Math.PI / 2);
  const spot = lot[Math.floor(lot.length / 2)] ?? { x: 2400, y: 800 };
  for (const car of game.cars) {
    if ((car.x - spot.x) ** 2 + (car.y - spot.y) ** 2 < 60 * 60) car.dead = true;
  }
  game.markedCar = game.spawnCar('sports', spot.x, spot.y, Math.PI / 2, { parked: true, marked: true, color: '#c22e3e' });
};

game.spawnRepoCar = () => {
  const lot = game.city.parkedSpots.filter((s) => s.angle === Math.PI / 2);
  const spot = lot[Math.floor(lot.length / 3)] ?? { x: 2400, y: 800 };
  for (const car of game.cars) {
    if ((car.x - spot.x) ** 2 + (car.y - spot.y) ** 2 < 60 * 60) car.dead = true;
  }
  const car = game.spawnCar('sedan', spot.x, spot.y, Math.PI / 2, { parked: true, marked: true, color: '#3a5a7a' });
  game.repoCar = car;
  game.markedCar = car; // shares the minimap dot and fail-cleanup with story targets
  return car;
};

game.spawnGuards = (x, y) => {
  for (const [ox, oy] of [[-46, 20], [52, -14]]) {
    const g = makeThug(x + ox, y + oy);
    game.peds.push(g);
  }
};

/** A rival-crew shore party for the dock turf war, tagged so the mission can count it. */
game.spawnCrew = (x, y, n) => {
  for (let k = 0; k < n; k += 1) {
    const t = makeThug(x + rand(-38, 38), y + rand(-38, 38));
    t.crew = true;
    game.peds.push(t);
  }
};

/** The Dockmaster's own truck, waiting at the Pier 9 warehouse for the circuit. */
game.spawnManifestTruck = () => {
  if (game.manifestTruck && game.player.car !== game.manifestTruck) game.manifestTruck.dead = true;
  const L = game.city.locations;
  const truck = game.spawnCar('truck', L.warehouse.x - 118, L.warehouse.y + 38, 0, { parked: true, color: '#7a6a4f' });
  game.manifestTruck = truck;
  return truck;
};

game.spawnTarget = () => {
  const park = game.city.locations.park;
  const ped = makePed(park.x + rand(-60, 60), park.y + rand(-40, 40));
  ped.kind = 'target';
  ped.hp = 45;
  ped.shirt = '#e8e4da';
  ped.hat = '#c22e3e';
  ped.tx = ped.x;
  ped.ty = ped.y;
  game.peds.push(ped);
  game.targetPed = ped;
  return ped;
};

game.showBanner = (title, sub) => {
  game.banner = { title, sub, t: 3.4 };
};

game.addCash = (n) => {
  game.cash += n;
};

game.startDialogue = (dialogueLines, onDone) => {
  game.dialogue = { lines: dialogueLines, idx: 0, onDone };
};

game.forceStars = (n) => {
  // A forced level lands a little above its threshold, so the stars the game
  // means to show do not evaporate in the first second out of sight.
  game.wanted.heat = Math.max(game.wanted.heat, STAR_HEAT[n] + 6);
};

game.hurtPlayer = (dmg, fromX, fromY) => {
  if (game.screen !== 'play' || game.frozen) return;
  const p = game.player;
  if (p.car) {
    damageCar(p.car, dmg * 0.7);
    p.hp -= dmg * 0.35;
  } else {
    // Body armor eats three quarters of what it can still soak.
    if (p.armor > 0) {
      const soaked = Math.min(p.armor, dmg * 0.75);
      p.armor -= soaked;
      dmg -= soaked;
    }
    p.hp -= dmg;
  }
  game.camera.shake = Math.max(game.camera.shake, 3);
  spawnParticles(p.x, p.y, 4, '#e5484d', 60);
  if (p.hp <= 0) wasted();
};

game.fx = {
  shot(x1, y1, x2, y2) {
    game.tracers.push({ x1, y1, x2, y2, life: 0.07 });
    spawnParticles(x1, y1, 2, '#ffd75e', 30);
    if (Math.hypot(x1 - game.player.x, y1 - game.player.y) < 760) audio.gunshot();
  },
};

game.saveGame = () => {
  writeSave({
    cash: game.cash,
    seed: game.seed,
    missionIdx: game.mission.idx,
    phase: game.mission.phase === 'done' ? 'done' : 'meet',
    postIdx: game.mission.postIdx,
    postPhase: game.mission.postPhase === 'steps' ? 'meet' : game.mission.postPhase,
    dockIdx: game.mission.dockIdx,
    dockPhase: game.mission.dockPhase === 'steps' ? 'meet' : game.mission.dockPhase,
    safehouse: game.safehouseOwned,
    x: Math.round(game.player.x),
    y: Math.round(game.player.y),
    hasPistol: game.player.hasPistol,
    mag: game.player.mag,
    ammo: game.player.ammo,
    hasSMG: game.player.hasSMG,
    smgMag: game.player.smgMag,
    smgAmmo: game.player.smgAmmo,
    armor: Math.round(game.player.armor),
    stats: game.stats,
  });
};

// ---------------------------------------------------------------------------
// World setup.

function populate() {
  const { city } = game;
  const rng = game.rng;
  const spots = [...city.parkedSpots];
  for (let k = spots.length - 1; k > 0; k -= 1) {
    const j = Math.floor(rng.next() * (k + 1));
    [spots[k], spots[j]] = [spots[j], spots[k]];
  }
  const parkedTypes = ['sedan', 'sedan', 'taxi', 'pickup', 'sedan', 'sports', 'moto', 'truck'];
  for (const s of spots.slice(0, 36)) {
    game.spawnCar(rng.pick(parkedTypes), s.x, s.y, s.angle, { parked: true });
  }
  const trafficTypes = ['sedan', 'sedan', 'taxi', 'pickup', 'sedan', 'moto', 'truck', 'bus'];
  for (let k = 0; k < 18; k += 1) {
    const vx = 200 + Math.floor(rng.next() * 8) * 400;
    const vy = 200 + Math.floor(rng.next() * 6) * 400;
    const horizontal = rng.chance(0.5);
    game.spawnCar(rng.pick(trafficTypes), vx + (horizontal ? 0 : 26), vy + (horizontal ? 26 : 0), horizontal ? 0 : Math.PI / 2, { driver: 'traffic', hasDriver: true });
  }
  for (let k = 0; k < 58; k += 1) {
    const p = makePed(0, 0);
    const spot = randomPedSpot();
    p.x = spot.x;
    p.y = spot.y;
    p.tx = spot.x;
    p.ty = spot.y;
    game.peds.push(p);
  }
}

function randomPedSpot() {
  // Sidewalk rings sit 13px outside each block; reuse the world's own picker.
  const blocks = game.city.blocks.filter((b) => b.district !== 'water');
  const b = blocks[Math.floor(Math.random() * blocks.length)];
  const side = Math.floor(Math.random() * 4);
  const t = Math.random();
  if (side === 0) return { x: b.x + t * b.w, y: b.y - 13 };
  if (side === 1) return { x: b.x + t * b.w, y: b.y + b.h + 13 };
  if (side === 2) return { x: b.x - 13, y: b.y + t * b.h };
  return { x: b.x + b.w + 13, y: b.y + t * b.h };
}

function newGame(seed) {
  game.seed = seed;
  game.city = buildCity(seed);
  game.cars = [];
  game.peds = [];
  game.particles = [];
  game.tracers = [];
  game.skids = [];
  game.pickups = [];
  game.markedCar = null;
  game.repoCar = null;
  game.targetPed = null;
  game.duel = null;
  game.manifestTruck = null;
  game.safehouseOwned = false;
  game.suppressSafehouse = false;
  // One speedboat rides at anchor off the east tip of the Pier 9 pier — the
  // harbor's west-shore plank — close enough for her captain standing at
  // the tip to step straight aboard, with open water ahead of her bow.
  game.boat = { kind: 'boat', x: 2348, y: 1600, angle: -Math.PI / 2, speed: 0, len: 54, wid: 20, r: 22 };
  game.event = null;
  game.eventT = 18;
  game.shopPrompt = null;
  game.sprayT = 0;
  game.chatter = null;
  game.side = null;
  game.dialogue = null;
  game.banner = null;
  game.wanted = { heat: 0, stars: 0, losT: 0, bustT: 0 };
  game.mission = createMissionState();
  game.stats = { missions: 0, stolen: 0, fares: 0, parcels: 0, crimes: 0, shots: 0 };
  game.cash = 120;
  const L = game.city.locations;
  game.player = freshPlayer(L.hideout.x, L.hideout.y + 16);
  populate();
  game.centerCamera(true);
}

function continueGame() {
  const save = loadSave();
  if (!save) return false;
  newGame(save.seed ?? CITY_SEED);
  game.cash = save.cash;
  game.mission.idx = clamp(save.missionIdx ?? 0, 0, MISSIONS.length);
  game.mission.phase = save.phase === 'done' || game.mission.idx >= MISSIONS.length ? 'done' : 'meet';
  game.mission.postIdx = clamp(save.postIdx ?? 0, 0, POST_MISSIONS.length);
  game.mission.postPhase = game.mission.phase !== 'done' || game.mission.postIdx >= POST_MISSIONS.length
    ? 'done'
    : (save.postPhase === 'done' ? 'done' : 'meet');
  if (game.mission.phase !== 'done') game.mission.postPhase = 'meet';
  game.mission.dockIdx = clamp(save.dockIdx ?? 0, 0, DOCK_MISSIONS.length);
  game.mission.dockPhase = game.mission.dockIdx >= DOCK_MISSIONS.length
    ? 'done'
    : (game.mission.idx >= 2 ? 'meet' : 'locked');
  game.safehouseOwned = !!save.safehouse;
  game.player.x = save.x ?? game.player.x;
  game.player.y = save.y ?? game.player.y;
  game.player.hasPistol = !!save.hasPistol;
  if (game.player.hasPistol) {
    game.player.weapon = 'pistol';
    game.player.mag = save.mag ?? 12;
    game.player.ammo = save.ammo ?? 24;
  }
  game.player.hasSMG = !!save.hasSMG;
  game.player.smgMag = save.smgMag ?? 0;
  game.player.smgAmmo = save.smgAmmo ?? 0;
  game.player.armor = save.armor ?? 0;
  game.stats = { ...game.stats, ...(save.stats ?? {}) };
  game.centerCamera(true);
  return true;
}

game.centerCamera = (instant) => {
  const p = game.player.car ?? game.player;
  // Look where the action is going: lead the target by a slice of the velocity
  // (capped, so a fast car shows the road ahead without losing itself).
  let leadX = 0;
  let leadY = 0;
  if (game.player.car) {
    leadX = clamp(game.player.car.vx * 0.42, -120, 120);
    leadY = clamp(game.player.car.vy * 0.42, -120, 120);
  } else if (game.player.moving) {
    leadX = Math.cos(game.player.angle) * 26;
    leadY = Math.sin(game.player.angle) * 26;
  }
  const tx = clamp(p.x + leadX - game.view.w / 2, 0, Math.max(0, WORLD_W - game.view.w));
  const ty = clamp(p.y + leadY - game.view.h / 2, 0, Math.max(0, WORLD_H - game.view.h));
  if (instant) {
    game.camera.x = tx;
    game.camera.y = ty;
  } else {
    game.camera.x += (tx - game.camera.x) * 0.09;
    game.camera.y += (ty - game.camera.y) * 0.09;
  }
};

// ---------------------------------------------------------------------------
// Crime and punishment.

function witnessed(x, y) {
  for (const ped of game.peds) {
    if (ped.dead || ped.state === 'down') continue;
    if ((ped.x - x) ** 2 + (ped.y - y) ** 2 < 300 * 300 && !losBlocked(game.city, x, y, ped.x, ped.y)) return true;
  }
  for (const car of game.cars) {
    if (!car.isPolice || car.dead) continue;
    if ((car.x - x) ** 2 + (car.y - y) ** 2 < 560 * 560) return true;
  }
  return false;
}

function commitCrime(points, x, y, scare = true) {
  const seen = witnessed(x, y);
  game.wanted.heat += points * (seen ? 1 : 0.3);
  game.stats.crimes += 1;
  if (scare) game.danger = { x, y, t: game.time };
}

function starsFromHeat(heat) {
  let s = 0;
  for (let k = 1; k <= 5; k += 1) if (heat >= STAR_HEAT[k]) s = k;
  return s;
}

function copSeesPlayer() {
  const p = game.player;
  for (const car of game.cars) {
    if (!car.isPolice || car.dead) continue;
    if ((car.x - p.x) ** 2 + (car.y - p.y) ** 2 < 470 * 470 && !losBlocked(game.city, car.x, car.y, p.x, p.y)) return true;
  }
  for (const ped of game.peds) {
    if (ped.kind !== 'officer' || ped.dead || ped.state === 'down') continue;
    if ((ped.x - p.x) ** 2 + (ped.y - p.y) ** 2 < 380 * 380 && !losBlocked(game.city, ped.x, ped.y, p.x, p.y)) return true;
  }
  return false;
}

function updateWanted(dt) {
  const w = game.wanted;
  w.stars = starsFromHeat(w.heat);
  if (game.player.boat) {
    // Nobody pursues on the water: no bust pressure out here, and the heat
    // simply bleeds away while the cruisers wait on roads they cannot leave.
    w.heat = Math.max(0, w.heat - 3.4 * dt);
    w.bustT = Math.max(0, w.bustT - dt * 1.6);
    w.stars = starsFromHeat(w.heat);
    return;
  }
  if (copSeesPlayer()) w.losT = 0;
  else w.losT += dt;
  if (w.losT > 5 && w.heat > 0) w.heat = Math.max(0, w.heat - 3.4 * dt);
  w.stars = starsFromHeat(w.heat);

  // The bust: an officer (or a cruiser at a standstill) holding the player still.
  const p = game.player;
  let pressure = 0;
  if (!p.car) {
    for (const ped of game.peds) {
      if (ped.kind === 'officer' && !ped.dead && ped.state !== 'down'
        && (ped.x - p.x) ** 2 + (ped.y - p.y) ** 2 < 32 * 32) pressure = 1;
    }
  } else if (Math.abs(p.car.speed) < 26) {
    for (const car of game.cars) {
      if (car.isPolice && !car.dead && (car.x - p.car.x) ** 2 + (car.y - p.car.y) ** 2 < 66 * 66) pressure = 0.8;
    }
  }
  if (pressure > 0 && w.stars > 0) w.bustT += dt * pressure;
  else w.bustT = Math.max(0, w.bustT - dt * 1.6);
  if (w.bustT >= 1.5) busted();
}

function clearHeat() {
  game.wanted.heat = 0;
  game.wanted.stars = 0;
  game.wanted.bustT = 0;
  for (const car of game.cars) if (car.isPolice && car !== game.player.car) car.dead = true;
  game.peds = game.peds.filter((p) => p.kind !== 'officer');
}

function wasted() {
  const fee = Math.min(game.cash, Math.max(40, Math.round(game.cash * 0.12)));
  game.cash -= fee;
  const p = game.player;
  if (p.car) {
    p.car.driver = null;
    p.car = null;
  }
  p.boat = null; // the boat rides at anchor wherever the run ended
  clearHeat();
  failMission(game);
  const L = game.city.locations;
  p.x = L.hospital.x;
  p.y = L.hospital.y;
  p.hp = 100;
  game.screen = 'wasted';
  audio.fail();
  game.saveGame();
}

function busted() {
  const fine = Math.min(game.cash, Math.max(60, Math.round(game.cash * 0.2)));
  game.cash -= fine;
  const p = game.player;
  if (p.car) {
    p.car.driver = null;
    p.car = null;
  }
  clearHeat();
  failMission(game);
  const L = game.city.locations;
  p.x = L.police.x;
  p.y = L.police.y;
  p.hp = Math.max(p.hp, 60);
  game.screen = 'busted';
  audio.fail();
  game.saveGame();
}

// ---------------------------------------------------------------------------
// Particles and short-lived effects.

function spawnParticles(x, y, n, color, speed) {
  for (let k = 0; k < n; k += 1) {
    const a = rand(0, Math.PI * 2);
    const v = rand(speed * 0.3, speed);
    game.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: rand(0.25, 0.6), max: 0.6, size: rand(2, 4.6), color,
    });
  }
}

function updateFx(dt) {
  for (const pt of game.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.9;
    pt.vy *= 0.9;
  }
  game.particles = game.particles.filter((pt) => pt.life > 0);
  for (const t of game.tracers) t.life -= dt;
  game.tracers = game.tracers.filter((t) => t.life > 0);
  if (game.banner) {
    game.banner.t -= dt;
    if (game.banner.t <= 0) game.banner = null;
  }
  // Smoking wrecks and screeching tires.
  for (const car of game.cars) {
    if (car.dead) continue;
    if (car.health < 45 && Math.random() < dt * 6) {
      game.particles.push({
        x: car.x + rand(-8, 8), y: car.y + rand(-8, 8), vx: rand(-8, 8), vy: rand(-26, -14),
        life: rand(0.5, 1), max: 1, size: rand(4, 8), color: 'rgba(40,40,46,0.8)',
      });
    }
    if (car.drift > 52 && Math.abs(car.speed) > 90) {
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const lx = -fy;
      const ly = fx;
      for (const s of [-1, 1]) {
        const wx = car.x - fx * car.len * 0.32 + lx * s * car.wid * 0.45;
        const wy = car.y - fy * car.len * 0.32 + ly * s * car.wid * 0.45;
        const prev = s < 0 ? car.skidL : car.skidR;
        if (prev) game.skids.push({ x1: prev.x, y1: prev.y, x2: wx, y2: wy });
        if (s < 0) car.skidL = { x: wx, y: wy };
        else car.skidR = { x: wx, y: wy };
      }
      if (game.skids.length > 420) game.skids.splice(0, game.skids.length - 420);
      if (Math.random() < dt * 5) {
        game.particles.push({
          x: car.x, y: car.y, vx: rand(-12, 12), vy: rand(-12, 12),
          life: 0.5, max: 0.5, size: rand(5, 9), color: 'rgba(200,200,210,0.5)',
        });
      }
    } else {
      car.skidL = null;
      car.skidR = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Player actions.

function pointInBuilding(x, y) {
  for (const b of game.city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

function damagePed(ped, dmg, byPlayer) {
  ped.hp -= dmg;
  if (ped.hp <= 0 && ped.state !== 'down') {
    ped.state = 'down';
    ped.dead = true;
    if (ped.kind === 'thug') {
      game.pickups.push({ kind: 'ammo', x: ped.x, y: ped.y, amount: 8 });
    }
    if (byPlayer) {
      if (ped.kind === 'officer') {
        commitCrime(30, ped.x, ped.y);
        game.forceStars(2);
      } else if (ped.kind === 'target') {
        commitCrime(20, ped.x, ped.y);
      } else if (ped.kind === 'ped') {
        commitCrime(16, ped.x, ped.y);
      }
    }
  } else if (ped.kind === 'ped') {
    ped.state = 'flee';
    ped.fleeT = 2.4;
    game.danger = { x: ped.x, y: ped.y, t: game.time };
  }
}

const WEAPONS = {
  pistol: { dmg: 34, rate: 0.24, magSize: 12, reload: 1.1, carDmg: 13 },
  smg: { dmg: 21, rate: 0.105, magSize: 30, reload: 1.4, carDmg: 8 },
};

function playerShoot() {
  const p = game.player;
  const smg = p.weapon === 'smg';
  const spec = smg ? WEAPONS.smg : WEAPONS.pistol;
  if (smg) p.smgMag -= 1;
  else p.mag -= 1;
  game.stats.shots += 1;
  const a = p.angle;
  const x0 = p.x + Math.cos(a) * 14;
  const y0 = p.y + Math.sin(a) * 14;
  let hx = x0 + Math.cos(a) * 560;
  let hy = y0 + Math.sin(a) * 560;
  // Step the ray: the first building, person or car it meets takes the bullet.
  outer: for (let d = 12; d < 560; d += 8) {
    const x = x0 + Math.cos(a) * d;
    const y = y0 + Math.sin(a) * d;
    if (pointInBuilding(x, y)) {
      hx = x;
      hy = y;
      spawnParticles(x, y, 3, '#cfd6e4', 50);
      break;
    }
    for (const ped of game.peds) {
      if (ped.dead || ped.state === 'down') continue;
      if ((ped.x - x) ** 2 + (ped.y - y) ** 2 < 12 * 12) {
        hx = x;
        hy = y;
        damagePed(ped, spec.dmg, true);
        spawnParticles(x, y, 5, '#e5484d', 60);
        break outer;
      }
    }
    for (const car of game.cars) {
      if (car.dead || car === p.car) continue;
      if ((car.x - x) ** 2 + (car.y - y) ** 2 < (car.r + 3) ** 2) {
        hx = x;
        hy = y;
        damageCar(car, spec.carDmg);
        spawnParticles(x, y, 4, '#ffd75e', 70);
        if (car.isPolice) commitCrime(24, car.x, car.y);
        break outer;
      }
    }
  }
  game.fx.shot(x0, y0, hx, hy);
  commitCrime(7, p.x, p.y);
  if ((smg ? p.smgMag : p.mag) <= 0) startReload();
}

function startReload() {
  const p = game.player;
  if (p.weapon !== 'pistol' && p.weapon !== 'smg') return;
  const smg = p.weapon === 'smg';
  const spec = smg ? WEAPONS.smg : WEAPONS.pistol;
  const mag = smg ? p.smgMag : p.mag;
  const ammo = smg ? p.smgAmmo : p.ammo;
  if (p.reloading > 0 || mag >= spec.magSize || ammo <= 0) return;
  p.reloading = spec.reload;
  p.reloadWeapon = p.weapon;
  audio.reload();
}

function playerPunch() {
  const p = game.player;
  p.atkT = 0.34;
  audio.punch();
  const fx = p.x + Math.cos(p.angle) * 30;
  const fy = p.y + Math.sin(p.angle) * 30;
  for (const ped of game.peds) {
    if (ped.dead || ped.state === 'down') continue;
    if ((ped.x - fx) ** 2 + (ped.y - fy) ** 2 < 26 * 26) {
      damagePed(ped, 18, true);
      if (ped.kind !== 'thug') commitCrime(ped.kind === 'officer' ? 26 : 13, ped.x, ped.y);
      spawnParticles(ped.x, ped.y, 3, '#ffffff', 40);
      return;
    }
  }
  for (const car of game.cars) {
    if (car.dead) continue;
    if ((car.x - fx) ** 2 + (car.y - fy) ** 2 < (car.r + 8) ** 2) {
      damageCar(car, 4);
      spawnParticles(fx, fy, 3, '#ffd75e', 50);
      return;
    }
  }
}

function nearestEnterableCar() {
  const p = game.player;
  let best = null;
  let bestD = 60 * 60;
  for (const car of game.cars) {
    if (car.dead || car.driver === 'player' || car.driver === 'racer') continue;
    const d = (car.x - p.x) ** 2 + (car.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(car) {
  const p = game.player;
  if (car.hasDriver && car.driver === 'traffic') {
    // The driver bails out and runs; that is very much a crime.
    const driver = makePed(car.x + rand(-14, 14), car.y + rand(-14, 14));
    driver.state = 'flee';
    driver.fleeT = 3;
    game.peds.push(driver);
    commitCrime(car.isPolice ? 26 : 20, car.x, car.y);
    game.stats.stolen += 1;
  } else if (car.parked) {
    commitCrime(car.isPolice ? 26 : 9, car.x, car.y, false);
    game.stats.stolen += 1;
  }
  car.driver = 'player';
  car.hasDriver = false;
  car.parked = false;
  car.route = null;
  if (car.type === 'moto') car.riderShirt = p.shirt;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  audio.blip();
}

function exitCar() {
  const p = game.player;
  const car = p.car;
  if (!car) return;
  car.driver = null;
  car.parked = true;
  // The same E press must not also open the safehouse door on the way out.
  game.suppressSafehouse = true;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * (car.wid + 14);
  p.y = car.y + Math.sin(side) * (car.wid + 14);
  p.car = null;
  audio.blip();
}

// ---------------------------------------------------------------------------
// The speedboat: she lives on the water and nowhere else. Her hull is tested
// at the centre and at bow and stern; a move that would beach her slides
// along the shore instead, and only a pier lets her captain step off.

function boatSpotOk(x, y, angle) {
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  for (const s of [0, 24, -24]) {
    const px = x + fx * s;
    const py = y + fy * s;
    if (!isWater(game.city, px, py)) return false;
    for (const pier of game.city.piers) {
      if (px > pier.x - 7 && px < pier.x + pier.w + 7 && py > pier.y - 7 && py < pier.y + pier.h + 7) return false;
    }
  }
  return true;
}

function boardBoat() {
  const p = game.player;
  p.boat = game.boat;
  p.x = game.boat.x;
  p.y = game.boat.y;
  p.angle = game.boat.angle;
  audio.blip();
}

function exitBoat() {
  const p = game.player;
  const b = game.boat;
  if (!b) {
    p.boat = null;
    return;
  }
  for (const pier of game.city.piers) {
    const nx = clamp(b.x, pier.x, pier.x + pier.w);
    const ny = clamp(b.y, pier.y, pier.y + pier.h);
    if ((nx - b.x) ** 2 + (ny - b.y) ** 2 < 74 * 74) {
      p.x = nx;
      p.y = ny;
      p.boat = null;
      audio.blip();
      return;
    }
  }
  game.showBanner('NO DOCK IN REACH', 'Ease up to a pier to step off');
}

function updateBoatRide(dt) {
  const p = game.player;
  const b = game.boat;
  if (!b) {
    p.boat = null;
    return;
  }
  const throttle = (input.down('w', 'arrowup') ? 1 : 0) + (input.down('s', 'arrowdown') ? -1 : 0);
  const steer = (input.down('a', 'arrowleft') ? -1 : 0) + (input.down('d', 'arrowright') ? 1 : 0);
  if (throttle > 0) b.speed += 205 * dt;
  else if (throttle < 0) b.speed -= (b.speed > 10 ? 250 : 120) * dt;
  b.speed -= b.speed * 0.55 * dt; // water drag
  b.speed = clamp(b.speed, -95, 352);
  if (Math.abs(b.speed) > 3) {
    b.angle += steer * 1.35 * dt * Math.sign(b.speed) * clamp(Math.abs(b.speed) / 130, 0.25, 1);
  }
  const dx = Math.cos(b.angle) * b.speed * dt;
  const dy = Math.sin(b.angle) * b.speed * dt;
  const tryMove = (nx, ny) => {
    if (!boatSpotOk(nx, ny, b.angle)) return false;
    b.x = nx;
    b.y = ny;
    return true;
  };
  if (!tryMove(b.x + dx, b.y + dy) && !tryMove(b.x + dx, b.y) && !tryMove(b.x, b.y + dy)) {
    b.speed *= 0.35; // a soft stop against the shore or a pier
  }
  p.x = b.x;
  p.y = b.y;
  p.angle = b.angle;
  p.moving = Math.abs(b.speed) > 12;
  // The wake: foam astern that breathes out and dies behind her.
  if (Math.abs(b.speed) > 42) {
    const sx = b.x - Math.cos(b.angle) * b.len * 0.5;
    const sy = b.y - Math.sin(b.angle) * b.len * 0.5;
    game.particles.push({
      x: sx + rand(-4, 4), y: sy + rand(-4, 4),
      vx: -Math.cos(b.angle) * 18 + rand(-9, 9), vy: -Math.sin(b.angle) * 18 + rand(-9, 9),
      life: rand(0.7, 1.3), max: 1.3, size: rand(3, 6.5), color: 'rgba(215,238,252,0.85)',
    });
    if (game.particles.length > 900) game.particles.splice(0, game.particles.length - 900);
  }
  if (input.hit('e')) exitBoat();
}

function updatePlayer(dt) {
  const p = game.player;
  p.atkT = Math.max(0, p.atkT - dt);
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const smg = p.reloadWeapon === 'smg';
      const spec = smg ? WEAPONS.smg : WEAPONS.pistol;
      if (smg) {
        const take = Math.min(spec.magSize - p.smgMag, p.smgAmmo);
        p.smgMag += take;
        p.smgAmmo -= take;
      } else {
        const take = Math.min(spec.magSize - p.mag, p.ammo);
        p.mag += take;
        p.ammo -= take;
      }
    }
  }
  if (input.hit('1')) p.weapon = 'fist';
  if (input.hit('2') && p.hasPistol) p.weapon = 'pistol';
  if (input.hit('3') && p.hasSMG) p.weapon = 'smg';
  const mx = input.mouseX + game.camera.x;
  const my = input.mouseY + game.camera.y;

  if (p.car) {
    const car = p.car;
    const control = {
      throttle: (input.down('w', 'arrowup') ? 1 : 0) + (input.down('s', 'arrowdown') ? -1 : 0),
      steer: (input.down('a', 'arrowleft') ? -1 : 0) + (input.down('d', 'arrowright') ? 1 : 0),
      brake: false,
      handbrake: input.down(' '),
    };
    if (car.health <= 0) control.throttle *= 0.22;
    const impact = updateCarPhysics(game.city, car, control, dt);
    if (impact > 90) {
      game.camera.shake = Math.max(game.camera.shake, Math.min(9, impact / 26));
      audio.crash(clamp(impact / 220, 0.2, 1));
      p.hp -= impact > 190 ? 6 : 0;
      if (p.hp <= 0) wasted();
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.moving = Math.abs(car.speed) > 12;
    if (input.hit('e')) exitCar();
    return;
  }

  if (p.boat) {
    updateBoatRide(dt);
    return;
  }

  // On foot.
  let dx = (input.down('d', 'arrowright') ? 1 : 0) - (input.down('a', 'arrowleft') ? 1 : 0);
  let dy = (input.down('s', 'arrowdown') ? 1 : 0) - (input.down('w', 'arrowup') ? 1 : 0);
  const running = input.down('shift');
  const speed = running ? 216 : 136;
  p.moving = dx !== 0 || dy !== 0;
  if (p.moving) {
    const d = Math.hypot(dx, dy);
    dx /= d;
    dy /= d;
    p.x += dx * speed * dt;
    p.y += dy * speed * dt;
    p.speed = speed;
    // Walking into a wall or a crate stops you; sliding is handled by the push-out.
    collideBuildings(game.city, p);
    collideProps(game.city, p);
  } else {
    p.speed = 0;
  }
  p.angle = Math.atan2(my - p.y, mx - p.x);
  p.x = clamp(p.x, 24, WORLD_W - 24);
  p.y = clamp(p.y, 24, WORLD_H - 24);

  if (input.mouseDown && p.atkT <= 0) {
    if ((p.weapon === 'pistol' && p.hasPistol) || (p.weapon === 'smg' && p.hasSMG)) {
      const mag = p.weapon === 'smg' ? p.smgMag : p.mag;
      if (mag > 0 && p.reloading <= 0) playerShoot();
      else if (mag <= 0) startReload();
      p.atkT = p.weapon === 'smg' ? WEAPONS.smg.rate : WEAPONS.pistol.rate;
    } else {
      playerPunch();
    }
  }
  if (input.hit('r')) startReload();
  if (input.hit('e')) {
    const b = game.boat;
    const sh = game.city.locations.safehouse;
    if (b && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < 48 * 48) {
      boardBoat();
    } else if (sh && (p.x - sh.x) ** 2 + (p.y - sh.y) ** 2 < 54 * 54) {
      // The safehouse door: updateShops reads this same press.
    } else {
      const car = nearestEnterableCar();
      if (car) enterCar(car);
    }
  }
  // Ammo pickups are walked over; they feed whichever gun is in hand.
  for (const pk of game.pickups) {
    if ((pk.x - p.x) ** 2 + (pk.y - p.y) ** 2 < 24 * 24) {
      if (p.weapon === 'smg' && p.hasSMG) p.smgAmmo += pk.amount;
      else p.ammo += pk.amount;
      pk.taken = true;
      audio.pickup();
    }
  }
  game.pickups = game.pickups.filter((pk) => !pk.taken);
}

// ---------------------------------------------------------------------------
// Ambient world upkeep: keep traffic and people flowing around the player.

function maintainAmbient(dt) {
  const p = game.player;
  game.ambientT = (game.ambientT || 0) - dt;
  if (game.ambientT > 0) return;
  game.ambientT = 1;
  for (const car of game.cars) {
    if (car.driver !== 'traffic' || car.dead) continue;
    const d2 = (car.x - p.x) ** 2 + (car.y - p.y) ** 2;
    if (d2 > 1250 * 1250) {
      // Recycle far traffic to a road a few blocks from the player.
      const vx = clamp(Math.round((p.x + rand(-700, 700)) / 400) * 400 + 200, 200, 3000);
      const vy = clamp(Math.round((p.y + rand(-700, 700)) / 400) * 400 + 200, 200, 2200);
      car.x = vx + 26;
      car.y = vy;
      car.vx = 0;
      car.vy = 0;
      car.route = null;
    }
  }
  const trafficCount = game.cars.filter((c) => c.driver === 'traffic' && !c.dead).length;
  if (trafficCount < 14) {
    const vx = clamp(Math.round((p.x + rand(-800, 800)) / 400) * 400 + 200, 200, 3000);
    const vy = clamp(Math.round((p.y + rand(-800, 800)) / 400) * 400 + 200, 200, 2200);
    const types = ['sedan', 'sedan', 'taxi', 'pickup', 'sedan', 'moto', 'truck', 'bus'];
    game.spawnCar(types[Math.floor(Math.random() * types.length)], vx + 26, vy, Math.PI / 2, { driver: 'traffic', hasDriver: true });
  }
  // Two APD patrols work their beats while the city is calm.
  const patrols = game.cars.filter((c) => c.driver === 'patrol' && !c.dead).length;
  if (patrols < 2 && game.wanted.stars === 0) {
    const vx = clamp(Math.round((p.x + rand(-900, 900)) / 400) * 400 + 200, 200, 3000);
    const vy = clamp(Math.round((p.y + rand(-900, 900)) / 400) * 400 + 200, 200, 2200);
    game.spawnCar('police', vx, vy + 26, 0, { driver: 'patrol' });
  }
  const nearPeds = game.peds.filter((q) => q.kind === 'ped' && !q.dead).length;
  if (nearPeds < 56) {
    const ped = makePed(p.x + rand(-600, 600), p.y + rand(-600, 600));
    const spot = randomPedSpot();
    ped.x = spot.x;
    ped.y = spot.y;
    ped.tx = spot.x;
    ped.ty = spot.y;
    game.peds.push(ped);
  }
  game.cars = game.cars.filter((c) => !c.dead || c === game.markedCar || c === game.player.car);
  game.peds = game.peds.filter((q) => !q.dead || q.state !== 'down' || Math.random() < 0.9);
}

// ---------------------------------------------------------------------------
// Shops: Sal's respray bay (a clean slate for cash) and Iron & Ivory Arms.

const SPRAY_COST = 150;
const SMG_COST = 600;
const ARMOR_COST = 300;
const SMG_AMMO_COST = 120;
const ARMOR_REPAIR_COST = 150;
const SAFEHOUSE_COST = 2500;

function pickCarColor(notColor) {
  const colors = ['#b8bec9', '#7a4a3a', '#3a5a7a', '#4a7a52', '#8a8f3a', '#6a3a5e', '#c2c7cf', '#37414d', '#94572e', '#2e6f79', '#c22e3e', '#28418c'];
  let c = colors[Math.floor(Math.random() * colors.length)];
  if (c === notColor) c = colors[(colors.indexOf(c) + 1) % colors.length];
  return c;
}

function updateShops() {
  const p = game.player;
  const L = game.city.locations;
  game.shopPrompt = null;
  if (game.sprayT > 0) return;
  if (p.car) {
    if ((p.car.x - L.garage.x) ** 2 + (p.car.y - L.garage.y) ** 2 < 78 * 78 && Math.abs(p.car.speed) < 24) {
      game.shopPrompt = { kind: 'spray', text: `F — Respray at Sal's: $${SPRAY_COST}, new color, no stars` };
      if (input.hit('f')) {
        if (game.cash >= SPRAY_COST) {
          game.cash -= SPRAY_COST;
          p.car.color = pickCarColor(p.car.color);
          clearHeat();
          game.sprayT = 1.1;
          game.showBanner('FRESH PAINT', 'New color, no stars. Sal never saw you.');
          audio.cash();
          game.saveGame();
        } else {
          game.showBanner('NOT ENOUGH CASH', `Sal wants $${SPRAY_COST} up front`);
          audio.fail();
        }
      }
    }
    return;
  }
  if ((p.x - L.gunshop.x) ** 2 + (p.y - L.gunshop.y) ** 2 < 52 * 52) {
    const smgLine = p.hasSMG ? `F — SMG ammo +120 ($${SMG_AMMO_COST})` : `F — Buy the SMG ($${SMG_COST})`;
    const armorLine = p.armor >= 100 ? 'Armor: full' : `G — Body armor ($${p.armor > 0 ? ARMOR_REPAIR_COST : ARMOR_COST})`;
    game.shopPrompt = { kind: 'gun', text: `${smgLine}      ${armorLine}` };
    if (input.hit('f')) {
      if (!p.hasSMG && game.cash >= SMG_COST) {
        game.cash -= SMG_COST;
        p.hasSMG = true;
        p.smgMag = 30;
        p.smgAmmo = 90;
        p.weapon = 'smg';
        game.showBanner('SMG ACQUIRED', 'Press 3 to draw it · R to reload');
        audio.cash();
        game.saveGame();
      } else if (p.hasSMG && game.cash >= SMG_AMMO_COST) {
        game.cash -= SMG_AMMO_COST;
        p.smgAmmo += 120;
        audio.cash();
        game.saveGame();
      } else {
        game.showBanner('NOT ENOUGH CASH', 'Iron & Ivory does not do credit');
        audio.fail();
      }
    }
    if (input.hit('g')) {
      const cost = p.armor > 0 ? ARMOR_REPAIR_COST : ARMOR_COST;
      if (p.armor >= 100) {
        game.showBanner('ARMOR IS FULL', 'Come back when it has holes in it');
      } else if (game.cash >= cost) {
        game.cash -= cost;
        p.armor = 100;
        game.showBanner('ARMORED UP', 'The vest soaks most of what hits you');
        audio.cash();
        game.saveGame();
      } else {
        game.showBanner('NOT ENOUGH CASH', 'Iron & Ivory does not do credit');
        audio.fail();
      }
    }
  }
  // The Palms safehouse: buy it once, then its door is a saved game and a
  // clean slate for as long as Rook owns the keys.
  const sh = L.safehouse;
  if (sh && (p.x - sh.x) ** 2 + (p.y - sh.y) ** 2 < 54 * 54) {
    if (!game.safehouseOwned) {
      game.shopPrompt = { kind: 'safehouse', text: `E — Buy the Palms safehouse: $${SAFEHOUSE_COST} (saves the game, kills the heat)` };
      if (input.hit('e') && !game.suppressSafehouse) {
        if (game.cash >= SAFEHOUSE_COST) {
          game.cash -= SAFEHOUSE_COST;
          game.safehouseOwned = true;
          game.showBanner('SAFEHOUSE BOUGHT', 'The Palms is yours now. Duck in any time: saved, and the heat dies at the door.');
          audio.cash();
          game.saveGame();
        } else {
          game.showBanner('NOT ENOUGH CASH', `The Palms safehouse goes for $${SAFEHOUSE_COST}`);
          audio.fail();
        }
      }
    } else {
      game.shopPrompt = { kind: 'safehouse', text: 'E — Duck into your safehouse: save the game, lose the heat' };
      if (input.hit('e') && !game.suppressSafehouse) {
        clearHeat();
        game.showBanner('SAFEHOUSE', 'Heat\'s off, game saved. The city can wait outside.');
        audio.blip();
        game.saveGame();
      }
    }
  }
  game.suppressSafehouse = false;
}

// ---------------------------------------------------------------------------
// Cop radio chatter while a chase is live, and ambient street events.

const CHATTER = [
  'Dispatch: all units, suspect is {dir}bound through {area}',
  'Unit 4: in pursuit, requesting backup',
  'Dispatch: copy that, keep eyes on the suspect',
  'Unit 2: he is running the lights down the {area} strip',
  'Dispatch: keep the pressure on, do not let him go dark',
  'Unit 7: visual lost — no, there he is, {dir}bound',
  'Dispatch: road units converge, air support is not coming, it is Tuesday',
];

function updateChatter(dt) {
  if (game.chatter) {
    game.chatter.t -= dt;
    if (game.chatter.t <= 0) game.chatter = null;
  }
  if (game.wanted.stars <= 0) return;
  game.chatterT -= dt;
  if (game.chatterT > 0) return;
  game.chatterT = rand(6, 10);
  const p = game.player;
  const a = p.car ? p.car.angle : p.angle;
  const dirs = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const dir = dirs[Math.round((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
  const block = game.city.blocks.find((b) => p.x >= b.x - 52 && p.x <= b.x + b.w + 52 && p.y >= b.y - 52 && p.y <= b.y + b.h + 52);
  const area = block ? block.district : 'the bay';
  const text = CHATTER[Math.floor(Math.random() * CHATTER.length)].replace('{dir}', dir).replace('{area}', area);
  game.chatter = { text, t: 4.2 };
}

function randomPedSpotNear(x, y) {
  for (let k = 0; k < 10; k += 1) {
    const spot = randomPedSpot();
    const d = Math.hypot(spot.x - x, spot.y - y);
    if (d > 280 && d < 580) return spot;
  }
  return null;
}

function updateAmbientEvents(dt) {
  const p = game.player;
  if (!game.event) {
    game.eventT -= dt;
    if (game.eventT <= 0) {
      game.eventT = rand(26, 44);
      const spot = randomPedSpotNear(p.x, p.y);
      if (spot) {
        const victim = makePed(spot.x, spot.y);
        victim.tx = spot.x;
        victim.ty = spot.y;
        victim.eventVictim = true;
        const mugger = makeThug(spot.x + 17, spot.y + 7);
        mugger.eventMugger = true;
        mugger.fireT = 9999;
        game.peds.push(victim, mugger);
        game.event = { kind: 'mugging', victim, mugger, t: 55, hitT: 0.5 };
        game.showBanner('TROUBLE NEARBY', 'Someone is being mugged a few streets over');
      }
    }
    return;
  }
  const ev = game.event;
  if (ev.kind !== 'mugging') {
    game.event = null;
    return;
  }
  const { victim, mugger } = ev;
  ev.t -= dt;
  if (mugger.dead || mugger.state === 'down') {
    game.addCash(70);
    game.showBanner('GOOD SAMARITAN', '+$70 — the whole street saw that');
    audio.cash();
    if (!victim.dead) {
      victim.eventVictim = false;
      victim.state = 'flee';
      victim.fleeT = 2;
    }
    game.event = null;
    game.saveGame();
    return;
  }
  if (victim.dead || ev.t <= 0) {
    victim.eventVictim = false;
    if (!mugger.dead) {
      mugger.eventMugger = false;
      mugger.state = 'flee';
      mugger.fleeT = 3;
    }
    game.event = null;
    return;
  }
  // The mugger stays on the victim and works them over; the victim freezes.
  const d = Math.hypot(victim.x - mugger.x, victim.y - mugger.y);
  if (d > 24) {
    mugger.x += ((victim.x - mugger.x) / d) * 120 * dt;
    mugger.y += ((victim.y - mugger.y) / d) * 120 * dt;
    mugger.angle = Math.atan2(victim.y - mugger.y, victim.x - mugger.x);
  }
  ev.hitT -= dt;
  if (ev.hitT <= 0) {
    ev.hitT = 1.15;
    mugger.angle = Math.atan2(victim.y - mugger.y, victim.x - mugger.x);
    if (victim.hp > 9) damagePed(victim, 3, false);
    victim.state = 'walk';
    victim.tx = victim.x;
    victim.ty = victim.y;
    spawnParticles(victim.x, victim.y, 2, '#ffffff', 30);
  }
}

function carInteractions(dt) {
  const cars = game.cars.filter((c) => !c.dead);
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const rel = collideCarPair(cars[i], cars[j]);
      if (rel > 95) {
        const a = cars[i];
        const b = cars[j];
        if (a === game.player.car || b === game.player.car) {
          game.camera.shake = Math.max(game.camera.shake, 4);
          audio.crash(clamp(rel / 220, 0.2, 1));
          const other = a === game.player.car ? b : a;
          if (other.isPolice) commitCrime(18, other.x, other.y, false);
          spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffd75e', 80);
        }
      }
    }
  }
  // Cars versus people: the grim arithmetic of hit-and-run.
  for (const car of cars) {
    if (Math.abs(car.speed) < 55) continue;
    for (const ped of game.peds) {
      if (ped.dead || ped.state === 'down') continue;
      if ((ped.x - car.x) ** 2 + (ped.y - car.y) ** 2 < (car.r + 8) ** 2) {
        damagePed(ped, 26, car.driver === 'player');
        if (car.driver === 'player') commitCrime(24, ped.x, ped.y);
        spawnParticles(ped.x, ped.y, 5, '#e5484d', 60);
      }
    }
    // And versus the player, when someone else is driving. A player in the
    // boat is out of this arithmetic entirely: cars do not run down boats.
    const p = game.player;
    if (!p.car && !p.boat && car.driver !== 'player' && (p.x - car.x) ** 2 + (p.y - car.y) ** 2 < (car.r + 8) ** 2) {
      game.hurtPlayer(11, car.x, car.y);
      p.x += car.vx * 0.12;
      p.y += car.vy * 0.12;
    }
  }
}

// ---------------------------------------------------------------------------
// The loop.

function update(dt) {
  game.time += dt;
  game.dayT = (Math.sin(game.time * ((Math.PI * 2) / 300)) + 1) / 2;
  if (game.banner) { /* banner timing lives in updateFx */ }

  if (game.screen === 'title' || game.screen === 'help') {
    updateTraffic(game, dt);
    updatePeds(game, dt);
    updateFx(dt);
    if (game.screen === 'title' && !game.cameraLock) {
      // The title drifts: a slow pan across downtown behind the logo, on a
      // long lissajous that never quite repeats. Staged screenshot scenes
      // lock the camera, so the cover framing never moves.
      game.titleT = (game.titleT || 0) + dt;
      const t = game.titleT;
      const cx = 1150 + Math.sin(t * 0.045) * 560;
      const cy = 760 + Math.sin(t * 0.031 + 1.2) * 300;
      game.camera.x = clamp(cx - game.view.w / 2, 0, Math.max(0, WORLD_W - game.view.w));
      game.camera.y = clamp(cy - game.view.h / 2, 0, Math.max(0, WORLD_H - game.view.h));
    }
    return;
  }
  if (game.screen !== 'play') return;

  if (game.dialogue) {
    if (input.hit('e', 'enter') || input.mouseClicked) {
      audio.unlock();
      const d = game.dialogue;
      d.idx += 1;
      audio.blip();
      if (d.idx >= d.lines.length) {
        game.dialogue = null;
        if (d.onDone) d.onDone();
      }
    }
    updateFx(dt);
    return;
  }

  // The respray pause: the world holds still while Sal's crew works.
  if (game.sprayT > 0) {
    game.sprayT -= dt;
    game.shopPrompt = null;
    updateFx(dt);
    return;
  }

  // Grant the pistol the first time Sal's mission starts.
  if (!game.player.hasPistol && game.mission.idx === 1 && game.mission.phase === 'steps') {
    game.player.hasPistol = true;
    game.player.weapon = 'pistol';
    game.player.mag = 12;
    game.player.ammo = 36;
    game.showBanner('PISTOL ACQUIRED', 'Left click to shoot · R to reload');
  }

  updatePlayer(dt);
  if (game.screen !== 'play') { updateFx(dt); return; } // wasted/busted mid-update
  updateTraffic(game, dt);
  updatePolice(game, dt);
  updatePeds(game, dt);
  updateThugs(game, dt);
  carInteractions(dt);
  updateWanted(dt);
  updateMissions(game, dt);
  updateShops();
  updateChatter(dt);
  updateAmbientEvents(dt);
  maintainAmbient(dt);
  updateFx(dt);

  // Sound that follows the action.
  const p = game.player;
  audio.engine(!!p.car || !!p.boat, p.car ? Math.abs(p.car.speed) / p.car.maxSpeed : p.boat && game.boat ? Math.abs(game.boat.speed) / 352 : 0, dt);
  const copNear = game.cars.some((c) => c.isPolice && !c.dead && (c.x - p.x) ** 2 + (c.y - p.y) ** 2 < 480 * 480);
  audio.siren(copNear && game.wanted.stars > 0, dt, game.time);

  if (!game.cameraLock) game.centerCamera(false);
  game.camera.shake = Math.max(0, game.camera.shake - dt * 14);
  game.camera.shakeX = rand(-1, 1) * game.camera.shake;
  game.camera.shakeY = rand(-1, 1) * game.camera.shake;
}

function handleMenus() {
  if (game.screen === 'title') {
    const items = game.hasSaveFile ? 3 : 2;
    if (input.hit('arrowdown', 's')) game.menuIdx = (game.menuIdx + 1) % items;
    if (input.hit('arrowup', 'w')) game.menuIdx = (game.menuIdx + items - 1) % items;
    if (input.hit('enter', 'e') || input.mouseClicked) {
      audio.unlock();
      const labels = game.hasSaveFile ? ['new', 'continue', 'help'] : ['new', 'help'];
      const choice = labels[game.menuIdx];
      if (choice === 'new') {
        clearSave();
        newGame(CITY_SEED);
        game.hasSaveFile = false;
        game.screen = 'play';
        game.startDialogue([
          { who: 'Rook', text: 'Azura Bay. One bag, one hundred and twenty dollars, and a name nobody here knows yet.' },
          { who: 'Vera (phone)', text: 'Rook? Sal gave me this number. Cafe Solana, downtown. Come hungry, leave employed.' },
        ], null);
      } else if (choice === 'continue') {
        if (continueGame()) game.screen = 'play';
      } else {
        game.screen = 'help';
        game.helpFrom = 'title';
      }
    }
    return;
  }
  if (game.screen === 'help') {
    if (input.hit('escape', 'p', 'enter', 'e')) game.screen = game.helpFrom === 'pause' ? 'pause' : 'title';
    return;
  }
  if (game.screen === 'wasted' || game.screen === 'busted') {
    if (input.hit('e', 'enter')) game.screen = 'play';
    return;
  }
  if (input.hit('m')) {
    game.muted = !game.muted;
    audio.setMuted(game.muted);
  }
  if (game.screen === 'play' && input.hit('escape', 'p')) {
    if (!game.dialogue) game.screen = 'pause';
    return;
  }
  if (game.screen === 'pause') {
    if (input.hit('escape', 'p')) game.screen = 'play';
    if (input.hit('h')) {
      game.screen = 'help';
      game.helpFrom = 'pause';
    }
  }
}

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  game.view.w = canvas.width;
  game.view.h = canvas.height;
}

window.addEventListener('resize', fitCanvas);
window.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
window.addEventListener('keydown', () => audio.unlock());

// Boot: a fresh city behind the title screen, or a staged screenshot scene.
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const shotSeed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
game.hasSaveFile = !!loadSave();
fitCanvas();
newGame(shotName ? shotSeed : CITY_SEED);
if (shotName) {
  stageShot(game, shotName);
} else {
  game.screen = 'title';
}
window.__azura = game;

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.06) dt = 0.06;
  if (dt < 0) dt = 0;
  if (!game.frozen) {
    handleMenus();
    if (game.screen !== 'pause' && game.screen !== 'help') update(dt);
    else if (game.screen === 'pause') updateFx(0);
  }
  drawGame(ctx, game);
  input.endFrame();
}
requestAnimationFrame(frame);
