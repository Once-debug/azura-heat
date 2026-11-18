// The moving things: cars (traffic, parked, police), pedestrians, officers and thugs.
// Cars use a simple arcade model: velocity split into forward and lateral parts, the
// lateral part gripped away each frame (less of it while the handbrake is held: drift).

import { collideBuildings, collideProps } from './world.js';
import { clamp, rand, pick } from './rng.js';

export const CAR_TYPES = {
  sedan: { maxSpeed: 238, accel: 128, len: 46, wid: 22, label: 'Sedan' },
  taxi: { maxSpeed: 238, accel: 128, len: 46, wid: 22, label: 'Taxi' },
  pickup: { maxSpeed: 208, accel: 112, len: 52, wid: 24, label: 'Pickup' },
  sports: { maxSpeed: 336, accel: 192, len: 46, wid: 22, label: 'Sports car' },
  police: { maxSpeed: 292, accel: 168, len: 48, wid: 23, label: 'APD cruiser' },
  moto: { maxSpeed: 322, accel: 214, len: 30, wid: 11, label: 'Motorcycle' },
};

const CAR_COLORS = ['#b8bec9', '#7a4a3a', '#3a5a7a', '#4a7a52', '#8a8f3a', '#6a3a5e', '#c2c7cf', '#37414d', '#94572e', '#2e6f79'];
export const TAXI_COLOR = '#e8b62a';
export const POLICE_COLOR = '#e8ecf2';

let nextId = 1;

export function makeCar(type, x, y, angle, opts = {}) {
  const spec = CAR_TYPES[type];
  return {
    id: nextId++,
    kind: 'car',
    type,
    x, y, angle,
    vx: 0, vy: 0, speed: 0,
    len: spec.len, wid: spec.wid, r: spec.len * 0.36,
    maxSpeed: spec.maxSpeed, accel: spec.accel,
    color: opts.color ?? (type === 'taxi' ? TAXI_COLOR : type === 'police' ? POLICE_COLOR : pick(CAR_COLORS)),
    riderShirt: pick(['#c65b4e', '#4e7ac6', '#5aa469', '#c9a44a', '#8a5fc0']),
    health: 100,
    driver: opts.driver ?? null, // 'traffic' | 'police' | 'player' | null (parked, empty)
    hasDriver: !!opts.hasDriver,
    parked: !!opts.parked,
    isPolice: type === 'police',
    marked: !!opts.marked, // a mission target car
    route: null, routeIdx: 0, // traffic / police road route
    brakeLight: 0,
    hornT: 0,
    dead: false,
  };
}

export function makePed(x, y) {
  return {
    id: nextId++,
    kind: 'ped',
    x, y, angle: rand(0, Math.PI * 2),
    r: 9,
    speed: 0,
    hp: 30,
    state: 'walk', // walk | flee | down
    tx: x, ty: y,
    fleeT: 0, downT: 0, panicT: 0,
    shirt: pick(['#c65b4e', '#4e7ac6', '#5aa469', '#c9a44a', '#8a5fc0', '#d8d3c3', '#4ec6b8', '#c64e8f']),
    pants: pick(['#2e3440', '#4a4238', '#37455e', '#5e4632']),
    skin: pick(['#e8b98d', '#c68863', '#8d5a3b', '#f0c8a0', '#6e4530']),
    hat: Math.random() < 0.3 ? pick(['#22242c', '#c9a44a', '#7a2e2e', '#e8e4da', '#2e5e79']) : null,
    scale: rand(0.9, 1.08),
    dead: false,
  };
}

export function makeOfficer(x, y) {
  const ped = makePed(x, y);
  ped.kind = 'officer';
  ped.hp = 55;
  ped.shirt = '#2c4470';
  ped.pants = '#232c3e';
  ped.state = 'chase';
  return ped;
}

export function makeThug(x, y) {
  const ped = makePed(x, y);
  ped.kind = 'thug';
  ped.hp = 60;
  ped.shirt = pick(['#22242c', '#3a2222', '#22303a']);
  ped.state = 'fight';
  ped.fireT = rand(0.4, 1.2);
  ped.strafeDir = Math.random() < 0.5 ? -1 : 1;
  ped.strafeT = rand(1, 2.4);
  return ped;
}

/**
 * Advance one car by dt under a control input {throttle, steer, brake, handbrake}.
 * Returns the impact speed if the car struck a building or solid prop this step, else 0.
 */
export function updateCarPhysics(city, car, control, dt) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const lx = -fy;
  const ly = fx;
  let vf = car.vx * fx + car.vy * fy;
  let vl = car.vx * lx + car.vy * ly;

  if (control.throttle > 0) vf += car.accel * control.throttle * dt;
  if (control.throttle < 0) {
    // Low speed: the throttle backwards is reverse; at speed it is the brake.
    if (vf > 12) vf -= 260 * dt;
    else vf += car.accel * 0.55 * control.throttle * dt;
  }
  if (control.brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 320 * dt);
  vf -= vf * 0.45 * dt; // drag and rolling resistance
  vf = clamp(vf, -car.maxSpeed * 0.38, car.maxSpeed);

  const steerAuthority = clamp(vf / 46, -1.4, 1.4);
  const turn = control.steer * 1.9 * steerAuthority * (control.handbrake ? 1.45 : 1);
  car.angle += turn * dt * (vf < 0 ? -1 : 1) * (Math.abs(vf) > 1 ? 1 : 0);

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  const nlx = -nfy;
  const nly = nfx;
  vl *= Math.exp(-(control.handbrake ? 1.7 : 7.5) * dt); // grip kills the slide
  car.vx = nfx * vf + nlx * vl;
  car.vy = nfy * vf + nly * vl;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = vf;
  car.drift = Math.abs(vl);

  // Collide as two circles, nose and tail, so long cars clip corners like cars do.
  let impact = 0;
  for (const s of [0.62, -0.62]) {
    const body = { x: car.x + nfx * car.len * s * 0.5, y: car.y + nfy * car.len * s * 0.5, r: car.wid * 0.62 };
    const before = { x: body.x, y: body.y };
    const hitB = collideBuildings(city, body);
    const hitP = collideProps(city, body);
    if (hitB || hitP) {
      car.x += body.x - before.x;
      car.y += body.y - before.y;
      const closing = Math.abs(vf);
      if (closing > impact) impact = closing;
      vf *= -0.22;
      vl *= 0.4;
      car.vx = nfx * vf + nlx * vl;
      car.vy = nfy * vf + nly * vl;
      car.speed = vf;
    }
  }
  car.x = clamp(car.x, 30, 3170);
  car.y = clamp(car.y, 30, 2370);
  if (impact > 60) damageCar(car, (impact - 50) * 0.16);
  return impact;
}

export function damageCar(car, amount) {
  // A motorcycle has no bodywork to sacrifice: everything hurts it more.
  if (car.type === 'moto') amount *= 1.6;
  car.health = Math.max(0, car.health - amount);
}

/** Circle push-out between two cars; returns closing speed for damage and sound. */
export function collideCarPair(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 < 0.01) return 0;
  const d = Math.sqrt(d2);
  const push = (rr - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
  // Bleed the approach velocity so they rest against each other instead of jittering.
  const blend = 0.35;
  const avx = (a.vx + b.vx) / 2;
  const avy = (a.vy + b.vy) / 2;
  a.vx = a.vx + (avx - a.vx) * blend;
  a.vy = a.vy + (avy - a.vy) * blend;
  b.vx = b.vx + (avx - b.vx) * blend;
  b.vy = b.vy + (avy - b.vy) * blend;
  if (rel > 70) {
    damageCar(a, (rel - 60) * 0.1);
    damageCar(b, (rel - 60) * 0.1);
  }
  return rel;
}
