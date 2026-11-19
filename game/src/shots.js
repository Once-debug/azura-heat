// Deterministic screenshot scenes behind ?shot=start|play|chase|mission&seed=N.
// Each one builds a fresh world from the seed, arranges a real moment of the game in
// it, and freezes the simulation so a screenshot tool captures the same frame every
// time: the title over the bay, a walk downtown, a three-star chase, a mission beat.

import { makeCar } from './entities.js';
import { MISSIONS, DOCK_MISSIONS } from './missions.js';

function placeTrafficNear(game, x, y, count) {
  const traffic = game.cars.filter((c) => c.driver === 'traffic');
  const spots = [
    { x: x - 190, y: y - 52, angle: 0 }, { x: x + 240, y: y + 52, angle: Math.PI },
    { x: x - 52, y: y + 210, angle: -Math.PI / 2 }, { x: x + 52, y: y - 230, angle: Math.PI / 2 },
  ];
  for (let k = 0; k < Math.min(count, traffic.length, spots.length); k += 1) {
    const car = traffic[k];
    car.x = spots[k].x;
    car.y = spots[k].y;
    car.angle = spots[k].angle;
    car.vx = 0;
    car.vy = 0;
    car.speed = 0;
    car.route = null;
  }
}

function placePedsNear(game, x, y, count) {
  const peds = game.peds.filter((p) => p.kind === 'ped');
  for (let k = 0; k < Math.min(count, peds.length); k += 1) {
    peds[k].x = x + (k - 2) * 46 + 18;
    peds[k].y = y + (k % 2 === 0 ? -64 : 58);
    peds[k].tx = peds[k].x;
    peds[k].ty = peds[k].y;
  }
}

export function stageShot(game, name) {
  const L = game.city.locations;
  game.frozen = true;
  if (name === 'play') {
    game.screen = 'play';
    game.player.x = 1060;
    game.player.y = 668;
    game.player.angle = -0.4;
    game.mission.phase = 'meet';
    game.objective = { x: L.cafe.x, y: L.cafe.y, text: MISSIONS[0].meetText };
    placeTrafficNear(game, 1000, 600, 4);
    placePedsNear(game, 1060, 668, 5);
    // One heavy vehicle in frame: the truck/bus traffic sells the city's scale.
    const big = game.cars.find((c) => c.driver === 'traffic' && (c.type === 'truck' || c.type === 'bus'));
    if (big) {
      big.x = 1374;
      big.y = 850;
      big.angle = -Math.PI / 2;
      big.vx = 0;
      big.vy = 0;
      big.speed = 0;
      big.route = null;
    }
  } else if (name === 'beach') {
    game.screen = 'play';
    // The Neon Tide festival beach at dusk: Rook on the sand between the
    // umbrellas, the stage lit at the west end, a package glowing nearby,
    // the clout meter already warm. The camera frames stage and shoreline.
    game.dayT = 0.85;
    game.time = 14;
    game.player.x = 716;
    game.player.y = 2312;
    game.player.angle = 2.85;
    game.clout = 132;
    game.cloutLevel = 1;
    game.objective = { x: L.cafe.x, y: L.cafe.y, text: 'NEON TIDE is live — the whole beach is watching' };
    const goers = game.peds.filter((q) => q.kind === 'ped');
    const spots = [
      { x: 560, y: 2296 }, { x: 618, y: 2346 }, { x: 806, y: 2288 },
      { x: 858, y: 2340 }, { x: 486, y: 2338 }, { x: 902, y: 2306 },
    ];
    for (let k = 0; k < Math.min(spots.length, goers.length); k += 1) {
      goers[k].x = spots[k].x;
      goers[k].y = spots[k].y;
      goers[k].tx = spots[k].x;
      goers[k].ty = spots[k].y;
      goers[k].angle = k % 2 === 0 ? 0.4 : 2.6;
    }
    const filmer = goers[spots.length];
    if (filmer) {
      filmer.x = 668;
      filmer.y = 2276;
      filmer.tx = filmer.x;
      filmer.ty = filmer.y;
      filmer.state = 'film';
      filmer.filmT = 99;
      filmer.angle = Math.atan2(game.player.y - filmer.y, game.player.x - filmer.x);
    }
  } else if (name === 'chase') {
    game.screen = 'play';
    const car = makeCar('sports', 1420, 1000, 0, { driver: 'player', color: '#c22e3e' });
    game.cars.push(car);
    game.player.car = car;
    game.player.x = car.x;
    game.player.y = car.y;
    game.wanted.heat = 72;
    game.wanted.stars = 3;
    const cruisers = [
      { x: 1290, y: 948, angle: 0.15 }, { x: 1330, y: 1064, angle: -0.1 }, { x: 1560, y: 1052, angle: 2.8 },
    ];
    for (const c of cruisers) {
      const cop = makeCar('police', c.x, c.y, c.angle, { driver: 'police' });
      cop.speed = 120;
      game.cars.push(cop);
    }
    game.spawnOfficer(1330, 900);
    game.spawnOfficer(1500, 1090);
    // A bystander films the chase for the Tide: phone up, REC blinking, and
    // Rook's clout meter already warm from the show.
    game.clout = 264;
    game.cloutLevel = 1;
    const filmer = game.peds.find((q) => q.kind === 'ped');
    if (filmer) {
      filmer.x = 1538;
      filmer.y = 928;
      filmer.tx = filmer.x;
      filmer.ty = filmer.y;
      filmer.state = 'film';
      filmer.filmT = 99;
      filmer.angle = Math.atan2(1000 - filmer.y, 1420 - filmer.x);
    }
    placeTrafficNear(game, 1400, 1000, 3);
    placePedsNear(game, 1480, 920, 3);
    // Frozen scenes never tick the radio, so set the dispatch line directly.
    game.chatter = { text: 'Dispatch: copy that, keep eyes on the suspect', t: 4.2 };
    game.objective = { x: L.hideout.x, y: L.hideout.y, text: 'Lose the heat — or make a run for the Boathouse' };
  } else if (name === 'mission') {
    game.screen = 'play';
    game.dayT = 0.72;
    game.clout = 428;
    game.cloutLevel = 2;
    // Pier 9 in one frame: Rook on the plank, the speedboat riding at anchor
    // in the bay, the Dockmaster's warehouse behind, his first job on the table.
    game.player.x = 2306;
    game.player.y = 1564;
    game.player.angle = 0.5;
    game.objective = { x: L.dockmaster.x, y: L.dockmaster.y, text: DOCK_MISSIONS[0].meetText };
    game.startDialogue(DOCK_MISSIONS[0].intro, null);
    placePedsNear(game, L.warehouse.x + 10, L.warehouse.y + 30, 3);
    // Foam lapping at the moored hull (a frozen scene never ticks particles).
    const b = game.boat;
    if (b) {
      for (let k = 0; k < 16; k += 1) {
        const a = (k / 16) * Math.PI * 2;
        game.particles.push({
          x: b.x + Math.cos(a) * (26 + (k % 3) * 7), y: b.y + Math.sin(a) * (15 + (k % 3) * 5),
          vx: 0, vy: 0, life: 1.6, max: 1.6, size: 2 + (k % 4), color: 'rgba(215,238,252,0.8)',
        });
      }
    }
  } else {
    // start: the title screen over a slow look at downtown.
    game.screen = 'title';
    game.dayT = 0.7;
    game.camera.x = 820;
    game.camera.y = 480;
    game.cameraLock = true;
    placeTrafficNear(game, 1000, 600, 4);
    placePedsNear(game, 1000, 660, 5);
  }
  if (name !== 'start') {
    game.cameraLock = false;
    game.centerCamera(true);
  }
}
