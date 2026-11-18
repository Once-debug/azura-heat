// Brains for everyone who is not the player: traffic that follows the road grid and
// brakes for trouble, pedestrians who wander the sidewalks and run from danger, police
// cruisers that route across town and ram, officers who chase on foot, and the thugs
// who shoot back during missions.

import { ROAD_HALF, roadRoute, collideBuildings, collideProps, randomSidewalkPoint } from './world.js';
import { updateCarPhysics } from './entities.js';
import { angleDelta, clamp, rand } from './rng.js';
import { audio } from './audio.js';

const LANE = 26;

/** Move a walker toward a point with building slide; returns distance left to it. */
export function stepWalker(city, e, tx, ty, speed, dt) {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) {
    e.speed = 0;
    return 0;
  }
  const step = Math.min(d, speed * dt);
  e.x += (dx / d) * step;
  e.y += (dy / d) * step;
  e.angle = Math.atan2(dy, dx);
  e.speed = speed;
  collideBuildings(city, e);
  collideProps(city, e);
  return d - step;
}

/** Steering control that drives a car toward a world point; shared by traffic and police. */
function steerToward(car, tx, ty, cruise, dt) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const delta = angleDelta(car.angle, want);
  const steer = clamp(delta * 2.4, -1, 1);
  let throttle = Math.abs(delta) > 2.4 ? -0.5 : cruise;
  if (Math.abs(delta) > 1.1) throttle = Math.min(throttle, 0.45);
  return { throttle, steer, brake: false, handbrake: false };
}

/** Is anything solid sitting in the stretch of road just ahead of this car? */
function obstacleAhead(game, car, reach) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const px = car.x + fx * reach;
  const py = car.y + fy * reach;
  for (const other of game.cars) {
    if (other === car || other.dead) continue;
    if ((other.x - px) ** 2 + (other.y - py) ** 2 < 34 * 34) return true;
  }
  const p = game.player;
  if (p.car && p.car !== car && (p.car.x - px) ** 2 + (p.car.y - py) ** 2 < 36 * 36) return true;
  if (!p.car && (p.x - px) ** 2 + (p.y - py) ** 2 < 26 * 26) return true;
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    if ((ped.x - px) ** 2 + (ped.y - py) ** 2 < 28 * 28) return true;
  }
  return false;
}

function lanePoint(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  // One consistent side of the road for a given direction of travel.
  return { x: b.x + (-dy / d) * LANE, y: b.y + (dx / d) * LANE };
}

/** One car cruising the road grid to nowhere in particular; shared by traffic and patrols. */
export function driveTrafficCar(game, car, dt) {
  const { city, player } = game;
  if (!car.route || car.routeIdx >= car.route.length) {
    const dest = { x: 200 + Math.floor(Math.random() * 8) * 400, y: 200 + Math.floor(Math.random() * 6) * 400 };
    car.route = roadRoute(car.x, car.y, dest.x, dest.y);
    car.routeIdx = 0;
  }
  const node = car.route[car.routeIdx];
  const target = car.routeIdx + 1 < car.route.length
    ? lanePoint(node, car.route[car.routeIdx + 1])
    : { x: node.x, y: node.y };
  if ((car.x - target.x) ** 2 + (car.y - target.y) ** 2 < 46 * 46) car.routeIdx += 1;

  let control = steerToward(car, target.x, target.y, 0.62, dt);
  if (obstacleAhead(game, car, 58)) {
    control = { throttle: 0, steer: control.steer, brake: true, handbrake: false };
    car.brakeLight = 0.2;
    car.blockedT = (car.blockedT || 0) + dt;
    if (car.blockedT > 1.6 && Math.random() < dt * 0.5) {
      car.blockedT = 0;
      if (Math.hypot(car.x - player.x, car.y - player.y) < 520) audio.horn();
    }
  } else {
    car.blockedT = 0;
  }
  car.brakeLight = Math.max(0, car.brakeLight - dt);
  updateCarPhysics(city, car, control, dt);
}

export function updateTraffic(game, dt) {
  for (const car of game.cars) {
    if (car.driver !== 'traffic' || car.dead) continue;
    driveTrafficCar(game, car, dt);
  }
}

/** Drive one car straight at a world point (the race opponent's whole brain). */
export function driveCarToPoint(game, car, tx, ty, cruise, dt) {
  let control = steerToward(car, tx, ty, cruise, dt);
  if (obstacleAhead(game, car, 52) && Math.hypot(tx - car.x, ty - car.y) > 130) {
    control = { throttle: 0.1, steer: control.steer, brake: true, handbrake: false };
    car.brakeLight = 0.2;
  }
  if (Math.abs(car.speed) < 9 && control.throttle > 0) {
    car.stuckT = (car.stuckT || 0) + dt;
    if (car.stuckT > 1.1) {
      control = { throttle: -0.8, steer: -control.steer, brake: false, handbrake: false };
      if (car.stuckT > 1.9) car.stuckT = 0;
    }
  } else {
    car.stuckT = 0;
  }
  updateCarPhysics(game.city, car, control, dt);
}

export function updatePeds(game, dt) {
  const { city, player } = game;
  for (const ped of game.peds) {
    if (ped.kind !== 'ped' || ped.dead) continue;
    if (ped.state === 'down') {
      ped.speed = 0;
      continue;
    }
    if (ped.eventVictim) {
      // Frozen with fear while the mugging plays out (main.js runs the scene).
      ped.state = 'walk';
      stepWalker(city, ped, ped.tx, ped.ty, 40, dt);
      continue;
    }
    // Danger sense: a recent scare nearby, or a fast car bearing down, sends them running.
    let fleeX = 0;
    let fleeY = 0;
    let fleeing = false;
    if (game.danger && game.time - game.danger.t < 3.5) {
      const d2 = (ped.x - game.danger.x) ** 2 + (ped.y - game.danger.y) ** 2;
      if (d2 < 230 * 230) {
        fleeX = ped.x - game.danger.x;
        fleeY = ped.y - game.danger.y;
        fleeing = true;
      }
    }
    if (!fleeing) {
      for (const car of game.cars) {
        if (Math.abs(car.speed) < 130 || car.dead) continue;
        const d2 = (ped.x - car.x) ** 2 + (ped.y - car.y) ** 2;
        if (d2 > 110 * 110) continue;
        const toward = (ped.x - car.x) * Math.cos(car.angle) + (ped.y - car.y) * Math.sin(car.angle);
        if (toward > 0) {
          fleeX = ped.x - car.x;
          fleeY = ped.y - car.y;
          fleeing = true;
          break;
        }
      }
    }
    if (fleeing) {
      ped.state = 'flee';
      ped.fleeT = 2.2;
      const d = Math.hypot(fleeX, fleeY) || 1;
      stepWalker(city, ped, ped.x + (fleeX / d) * 190, ped.y + (fleeY / d) * 190, 168, dt);
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      if (ped.fleeT > 0) {
        stepWalker(city, ped, ped.tx, ped.ty, 168, dt);
        continue;
      }
      ped.state = 'walk';
      const p = randomSidewalkPoint(game.rng, city);
      ped.tx = p.x;
      ped.ty = p.y;
    }
    const left = stepWalker(city, ped, ped.tx, ped.ty, 62, dt);
    if (left <= 2) {
      const p = randomSidewalkPoint(game.rng, city);
      ped.tx = p.x;
      ped.ty = p.y;
    }
  }
}

function spawnCruiser(game) {
  const { city, player } = game;
  for (let tries = 0; tries < 12; tries += 1) {
    const a = rand(0, Math.PI * 2);
    const x = clamp(player.x + Math.cos(a) * 720, 80, 3120);
    const y = clamp(player.y + Math.sin(a) * 720, 80, 2320);
    if (game.cars.some((c) => (c.x - x) ** 2 + (c.y - y) ** 2 < 90 * 90)) continue;
    const car = game.spawnCar('police', x, y, rand(0, Math.PI * 2), { driver: 'police' });
    car.route = null;
    return car;
  }
  return null;
}

export function updatePolice(game, dt) {
  const { city, player } = game;
  const stars = game.wanted.stars;
  const cruisers = game.cars.filter((c) => c.isPolice && !c.dead);
  const wantedCruisers = stars === 0 ? 0 : Math.min(1 + stars, 5);
  if (cruisers.length < wantedCruisers) {
    game.policeSpawnT -= dt;
    if (game.policeSpawnT <= 0) {
      spawnCruiser(game);
      game.policeSpawnT = 1.4;
    }
  }
  // Officers pile out when a cruiser gets close to a player on foot.
  const wantedOfficers = stars >= 3 ? Math.min(stars - 1, 3) : 0;
  const officers = game.peds.filter((p) => p.kind === 'officer' && !p.dead && p.state !== 'down');
  if (officers.length < wantedOfficers && !player.car) {
    const near = cruisers.find((c) => (c.x - player.x) ** 2 + (c.y - player.y) ** 2 < 190 * 190);
    if (near && Math.abs(near.speed) < 90) {
      game.spawnOfficer(near.x + rand(-16, 16), near.y + rand(-16, 16));
    }
  }

  for (const car of cruisers) {
    if (car.driver === 'player') continue; // a stolen cruiser is the player's problem now
    // A patrol cruiser just works its beat while the city is calm; the moment
    // stars appear it joins the chase like any other unit.
    if (car.driver === 'patrol') {
      if (stars === 0) {
        driveTrafficCar(game, car, dt);
        continue;
      }
      car.driver = 'police';
      car.route = null;
    }
    const dPlayer = Math.hypot(player.x - car.x, player.y - car.y);
    if (dPlayer > 1250 && stars === 0) {
      car.dead = true; // given up and gone once the heat is fully off
      continue;
    }
    let control;
    if (dPlayer < 320) {
      // Close in: leave the road and drive at the player (or their car) to ram.
      control = steerToward(car, player.x, player.y, 1, dt);
      if (dPlayer < 60 && Math.abs(car.speed) > 40) control.throttle = 0.4;
    } else {
      car.routeT = (car.routeT || 0) - dt;
      if (!car.route || car.routeIdx >= car.route.length || car.routeT <= 0) {
        car.route = roadRoute(car.x, car.y, player.x, player.y);
        car.routeIdx = 0;
        car.routeT = 1.6;
      }
      const node = car.route[Math.min(car.routeIdx, car.route.length - 1)];
      if (node && (car.x - node.x) ** 2 + (car.y - node.y) ** 2 < 52 * 52) car.routeIdx += 1;
      control = steerToward(car, node ? node.x : player.x, node ? node.y : player.y, 0.95, dt);
    }
    // Stuck against a wall or another car: back out and try again.
    if (Math.abs(car.speed) < 10 && control.throttle > 0) {
      car.stuckT = (car.stuckT || 0) + dt;
      if (car.stuckT > 1.1) {
        control = { throttle: -0.8, steer: -control.steer, brake: false, handbrake: false };
        if (car.stuckT > 1.9) car.stuckT = 0;
      }
    } else {
      car.stuckT = 0;
    }
    if (obstacleAhead(game, car, 50) && dPlayer > 200) control.brake = true;
    updateCarPhysics(city, car, control, dt);
  }

  for (const cop of officers) {
    if (cop.state === 'down') continue;
    const target = player.car ?? player;
    stepWalker(city, cop, target.x, target.y, 203, dt);
  }
}

/** Mission thugs: keep their distance, strafe, and shoot at the player on a timer. */
export function updateThugs(game, dt) {
  const { city, player } = game;
  for (const thug of game.peds) {
    if (thug.kind !== 'thug' || thug.dead || thug.state === 'down') continue;
    if (thug.eventMugger) continue; // the ambient-event mugger is run by main.js
    const dx = player.x - thug.x;
    const dy = player.y - thug.y;
    const d = Math.hypot(dx, dy) || 1;
    thug.angle = Math.atan2(dy, dx);
    thug.strafeT -= dt;
    if (thug.strafeT <= 0) {
      thug.strafeDir *= -1;
      thug.strafeT = rand(1, 2.4);
    }
    let mx = (-dy / d) * thug.strafeDir;
    let my = (dx / d) * thug.strafeDir;
    if (d > 210) { mx += dx / d; my += dy / d; }
    if (d < 120) { mx -= dx / d; my -= dy / d; }
    thug.x += mx * 74 * dt;
    thug.y += my * 74 * dt;
    thug.speed = 74;
    collideBuildings(city, thug);
    collideProps(city, thug);

    thug.fireT -= dt;
    if (thug.fireT <= 0 && d < 330) {
      thug.fireT = rand(0.85, 1.5);
      const spread = rand(-0.09, 0.09);
      const a = thug.angle + spread;
      const ex = thug.x + Math.cos(a) * 700;
      const ey = thug.y + Math.sin(a) * 700;
      if (game.fx) game.fx.shot(thug.x, thug.y, ex, ey, true);
      // Accuracy falls off with range and with how fast the player moves.
      const playerSpeed = player.car ? Math.abs(player.car.speed) : (player.moving ? 150 : 0);
      const hitChance = clamp(0.52 - d / 900 - playerSpeed / 1600, 0.08, 0.5);
      if (Math.random() < hitChance) game.hurtPlayer(rand(5, 10), thug.x, thug.y);
    }
  }
}
