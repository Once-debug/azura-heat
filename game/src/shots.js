// Deterministic screenshot scenes behind ?shot=start|play|chase|mission&seed=N.
// Each one builds a fresh world from the seed, arranges a real moment of the game in
// it, and freezes the simulation so a screenshot tool captures the same frame every
// time: the title over the bay, a walk downtown, a three-star chase, a mission beat.

import { makeCar } from './entities.js';
import { MISSIONS } from './missions.js';

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
    placeTrafficNear(game, 1400, 1000, 3);
    placePedsNear(game, 1480, 920, 3);
    game.objective = { x: L.hideout.x, y: L.hideout.y, text: 'Lose the heat — or make a run for the Boathouse' };
  } else if (name === 'mission') {
    game.screen = 'play';
    game.player.x = L.warehouse.x + 30;
    game.player.y = L.warehouse.y + 66;
    game.player.angle = -1.2;
    game.mission.phase = 'steps';
    game.objective = { x: L.cafe.x, y: L.cafe.y, text: 'Deliver the package to Cafe Solana' };
    game.startDialogue(MISSIONS[0].intro.slice(2), null);
    placeTrafficNear(game, L.warehouse.x, L.warehouse.y + 130, 2);
    placePedsNear(game, L.warehouse.x, L.warehouse.y + 40, 3);
  } else {
    // start: the title screen over a slow look at downtown.
    game.screen = 'title';
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
