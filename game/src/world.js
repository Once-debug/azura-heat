// Azura Bay: a 3200x2400 top-down city on a regular road grid. Blocks between the roads
// belong to districts (downtown, harbor, residential, industrial, a park, a parking lot,
// open water), and each district grows its own buildings and props. Everything here is
// generated from a seed, so a given seed always builds the same city.

import { Rng, clamp } from './rng.js';

export const WORLD_W = 3200;
export const WORLD_H = 2400;
/** Road centre-lines: verticals and horizontals. Blocks sit between neighbouring lines. */
export const ROAD_X = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const ROAD_Y = [200, 600, 1000, 1400, 1800, 2200];
export const ROAD_HALF = 52;
const PITCH = 400;

export function districtOf(i, j) {
  if (i >= 5 && j >= 3) return 'water';
  if (i === 3 && j === 2) return 'park';
  if (i === 5 && j === 1) return 'parking';
  if (j >= 3) return 'harbor';
  if (i === 0) return 'industrial';
  if (j === 0 && i >= 4) return 'industrial';
  if (i <= 3 && j <= 2) return 'downtown';
  return 'residential';
}

/** Marquee names for the four quarters a driver learns by name (district banner). */
export const DISTRICT_NAMES = {
  downtown: 'DOWNTOWN',
  residential: 'THE PALMS',
  harbor: 'SOUTH HARBOR',
  industrial: 'FOUNDRY DISTRICT',
};

/** The Neon Tide festival beach: a sand band along the south shore (below the
 *  last east-west road), open ground with no buildings — umbrellas, loungers,
 *  volley nets, the festival stage at its west end, string lights overhead. */
export const BEACH = { x: 0, y: 2196, w: WORLD_W, h: WORLD_H - 2196 };
export const FESTIVAL_STAGE = { x: 330, y: 2332 };
export const FERRIS = { x: 2500, y: 1372, r: 104 };

/** Stunt ramps: {x, y, angle, target} — angle is the launch heading and
 *  target is the airtime (seconds) its stunt challenge asks for. Driving the
 *  player's car or motorcycle over one fast, facing along it, throws the
 *  vehicle into the air (main.js owns the hop). All six sit on open ground.
 *  Targets are calibrated to the hop physics: the fastest car in Azura Bay
 *  tops out near 0.9s of air, so the series runs 0.58s up to 0.82s. */
export const RAMPS = [
  { x: 1000, y: 2050, angle: -Math.PI / 2, target: 0.7 },
  { x: 2400, y: 800, angle: 0, target: 0.64 },
  { x: 2200, y: 1620, angle: Math.PI / 2, target: 0.76 },
  { x: 1500, y: 2296, angle: Math.PI / 2, target: 0.58 },
  { x: 400, y: 1000, angle: 0, target: 0.68 },
  { x: 1800, y: 600, angle: Math.PI, target: 0.82 },
];

/** The 25 hidden packages: fixed, deterministic, every one reachable on foot
 *  (roads, sidewalks, the park, the parking lot, piers, the beach). Kept well
 *  clear of shop/mission interaction points so a pickup is always a choice. */
export const PACKAGE_SPOTS = [
  { x: 1500, y: 1120 }, { x: 215, y: 215 }, { x: 2300, y: 750 }, { x: 2450, y: 880 },
  { x: 2185, y: 1564 }, { x: 2735, y: 1480 }, { x: 500, y: 2315 }, { x: 1500, y: 2340 },
  { x: 2700, y: 2320 }, { x: 600, y: 1200 }, { x: 1000, y: 470 }, { x: 1000, y: 880 },
  { x: 1400, y: 880 }, { x: 1800, y: 810 }, { x: 400, y: 1400 }, { x: 1600, y: 2200 },
  { x: 2600, y: 1210 }, { x: 200, y: 574 }, { x: 615, y: 1015 }, { x: 200, y: 1428 },
  { x: 2200, y: 1670 }, { x: 615, y: 615 }, { x: 1815, y: 1015 }, { x: 2615, y: 1815 },
  { x: 350, y: 2290 },
];

const TOWER_COLORS = [
  ['#3d4a6b', '#54648c'], ['#4a3f63', '#655782'], ['#2f4f5e', '#44707f'],
  ['#5e4632', '#7d5f45'], ['#37474f', '#50636e'], ['#513f56', '#6f5573'],
];
const HOUSE_COLORS = [
  ['#7a5c48', '#a3805f'], ['#5f7263', '#7f9684'], ['#746a55', '#968a6e'],
  ['#63536b', '#857290'], ['#71564e', '#93746a'],
];
const WAREHOUSE_COLORS = [
  ['#5a5348', '#736b5c'], ['#4e5a63', '#687680'], ['#63584a', '#7e7260'],
];

function blockRect(i, j) {
  return {
    x: ROAD_X[i] + ROAD_HALF,
    y: ROAD_Y[j] + ROAD_HALF,
    w: PITCH - ROAD_HALF * 2,
    h: PITCH - ROAD_HALF * 2,
  };
}

/** One building record: footprint rect, visual height for the fake-3D side shading, colours. */
function building(x, y, w, h, ht, palette, kind) {
  return { x, y, w, h, ht, base: palette[0], roof: palette[1], kind, name: '' };
}

function addBuildingRow(city, rect, rng, district) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  if (district === 'downtown') {
    if (rng.chance(0.45)) {
      const w = rng.range(150, 210);
      const h = rng.range(150, 210);
      city.buildings.push(building(cx - w / 2, cy - h / 2, w, h, rng.range(90, 150), rng.pick(TOWER_COLORS), 'tower'));
    } else {
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const w = rng.range(104, 128);
        const h = rng.range(104, 128);
        const bx = rect.x + 22 + ox * (rect.w / 2) + rng.range(0, 10);
        const by = rect.y + 22 + oy * (rect.h / 2) + rng.range(0, 10);
        city.buildings.push(building(bx, by, w, h, rng.range(45, 95), rng.pick(TOWER_COLORS), 'office'));
      }
    }
  } else if (district === 'industrial' || district === 'harbor') {
    const w = rng.range(190, 250);
    const h = rng.range(120, 170);
    city.buildings.push(building(cx - w / 2, cy - h / 2, w, h, rng.range(16, 30), rng.pick(WAREHOUSE_COLORS), 'warehouse'));
    if (rng.chance(0.6)) {
      city.buildings.push(building(rect.x + 26, rect.y + rect.h - 96, 90, 66, 14, rng.pick(WAREHOUSE_COLORS), 'warehouse'));
    }
    for (let k = 0; k < 5; k += 1) {
      city.props.push({ kind: 'crate', x: rect.x + rng.range(24, rect.w - 24), y: rect.y + rng.range(24, rect.h - 24), r: 10, a: rng.range(0, 3) });
    }
  } else if (district === 'residential') {
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const w = rng.range(96, 118);
      const h = rng.range(80, 100);
      const bx = rect.x + 24 + ox * (rect.w / 2) + rng.range(0, 8);
      const by = rect.y + 26 + oy * (rect.h / 2) + rng.range(0, 8);
      city.buildings.push(building(bx, by, w, h, rng.range(9, 16), rng.pick(HOUSE_COLORS), 'house'));
    }
    for (let k = 0; k < 3; k += 1) {
      city.props.push({ kind: 'palm', x: rect.x + rng.range(14, rect.w - 14), y: rect.y + rng.range(14, rect.h - 14), r: 7 });
    }
  }
}

/** Replace a block's generated buildings with one named special building; returns its front point. */
function specialBuilding(city, i, j, name, kind, palette, ht) {
  const rect = blockRect(i, j);
  city.buildings = city.buildings.filter((b) => !(b.x >= rect.x - 1 && b.x < rect.x + rect.w && b.y >= rect.y - 1 && b.y < rect.y + rect.h));
  const w = kind === 'small' ? 150 : 220;
  const h = kind === 'small' ? 110 : 170;
  const b = building(rect.x + (rect.w - w) / 2, rect.y + 26, w, h, ht, palette, 'special');
  b.name = name;
  city.buildings.push(b);
  return { x: rect.x + rect.w / 2, y: rect.y + 26 + h + 22 };
}

export function buildCity(seed) {
  const rng = new Rng(seed);
  const city = {
    seed,
    buildings: [],
    props: [],
    waterRects: [],
    piers: [],
    parkedSpots: [],
    locations: {},
    blocks: [],
    beach: BEACH,
    ferris: FERRIS,
    stage: FESTIVAL_STAGE,
    ramps: RAMPS,
    packages: PACKAGE_SPOTS,
  };

  for (let i = 0; i < ROAD_X.length - 1; i += 1) {
    for (let j = 0; j < ROAD_Y.length - 1; j += 1) {
      const district = districtOf(i, j);
      const rect = blockRect(i, j);
      city.blocks.push({ i, j, district, ...rect });
      if (district === 'water') {
        city.waterRects.push({ x: ROAD_X[i], y: ROAD_Y[j], w: PITCH, h: PITCH });
        // Wooden piers reach into the water from its west and north shores.
        if (i === 5) city.piers.push({ x: ROAD_X[i] - 30, y: rect.y + 60 + j * 13, w: 150, h: 26 });
        if (j === 3 && i > 5) city.piers.push({ x: rect.x + 70, y: ROAD_Y[j] - 26, w: 26, h: 130 });
        for (let k = 0; k < 3; k += 1) {
          city.props.push({ kind: 'crate', x: rect.x + rng.range(20, rect.w - 20), y: rect.y + rng.range(20, rect.h - 20), r: 10, a: rng.range(0, 3) });
        }
      } else if (district === 'park') {
        for (let k = 0; k < 9; k += 1) {
          city.props.push({ kind: rng.chance(0.6) ? 'palm' : 'tree', x: rect.x + rng.range(20, rect.w - 20), y: rect.y + rng.range(20, rect.h - 20), r: 8 });
        }
        for (let k = 0; k < 4; k += 1) {
          city.props.push({ kind: 'bench', x: rect.x + rng.range(30, rect.w - 30), y: rect.y + rng.range(30, rect.h - 30), r: 6 });
        }
      } else if (district === 'parking') {
        for (let r = 0; r < 3; r += 1) {
          for (let c = 0; c < 4; c += 1) {
            city.parkedSpots.push({ x: rect.x + 52 + c * 62, y: rect.y + 58 + r * 92, angle: Math.PI / 2 });
          }
        }
      } else {
        addBuildingRow(city, rect, rng, district);
      }
      // Streetlights at block corners and hydrants downtown dress the sidewalks.
      city.props.push({ kind: 'lamp', x: rect.x - 8, y: rect.y - 8, r: 4 });
      city.props.push({ kind: 'lamp', x: rect.x + rect.w + 8, y: rect.y + rect.h + 8, r: 4 });
      if (district === 'downtown' && rng.chance(0.8)) {
        city.props.push({ kind: 'hydrant', x: rect.x + rng.range(6, rect.w - 6), y: rect.y - 10, r: 4 });
      }
      // Street furniture, dressed per district: food carts where people gather,
      // newspaper boxes on downtown corners, benches along the walks. All of it
      // is scenery — light enough to walk past, so none of it collides.
      if (district === 'downtown') {
        if (rng.chance(0.55)) city.props.push({ kind: 'foodcart', x: rect.x + rect.w / 2, y: rect.y + rect.h + 12, r: 9 });
        if (rng.chance(0.7)) city.props.push({ kind: 'newsbox', x: rect.x - 13, y: rect.y + rect.h + 12, r: 5 });
        if (rng.chance(0.5)) city.props.push({ kind: 'bench', x: rect.x + rng.range(30, rect.w - 30), y: rect.y - 12, r: 6 });
      } else if (district === 'residential') {
        if (rng.chance(0.4)) city.props.push({ kind: 'bench', x: rect.x + rng.range(30, rect.w - 30), y: rect.y + rect.h + 12, r: 6 });
        if (rng.chance(0.3)) city.props.push({ kind: 'foodcart', x: rect.x + rect.w / 2, y: rect.y - 12, r: 9 });
        if (rng.chance(0.5)) city.props.push({ kind: 'hydrant', x: rect.x + rng.range(6, rect.w - 6), y: rect.y + rect.h + 10, r: 4 });
      } else if (district === 'harbor') {
        if (rng.chance(0.4)) city.props.push({ kind: 'foodcart', x: rect.x + rng.range(40, rect.w - 40), y: rect.y - 12, r: 9 });
        if (rng.chance(0.4)) city.props.push({ kind: 'bench', x: rect.x + rng.range(30, rect.w - 30), y: rect.y + rect.h + 12, r: 6 });
      }
      if (district === 'harbor') {
        for (let k = 0; k < 3; k += 1) {
          city.props.push({ kind: 'palm', x: rect.x + rng.range(12, rect.w - 12), y: rect.y + rect.h - 12, r: 7 });
        }
      }
    }
  }

  // Named places the story and the respawn rules revolve around.
  const L = city.locations;
  L.hospital = { name: 'Azura General Hospital', ...specialBuilding(city, 2, 0, 'AZURA GENERAL', 'big', ['#8b93a3', '#c9d1de'], 60) };
  L.police = { name: 'APD Central Station', ...specialBuilding(city, 3, 1, 'APD CENTRAL', 'big', ['#3c4a63', '#5a6d8f'], 52) };
  L.bank = { name: 'Bank of Azura', ...specialBuilding(city, 2, 1, 'BANK OF AZURA', 'big', ['#8a6d2f', '#c8a44a'], 84) };
  L.cafe = { name: 'Cafe Solana', ...specialBuilding(city, 1, 2, 'CAFE SOLANA', 'small', ['#7a4a35', '#a86a4a'], 22) };
  L.gunshop = { name: 'Iron & Ivory Arms', ...specialBuilding(city, 4, 1, 'IRON & IVORY', 'small', ['#4c4438', '#6e6350'], 26) };
  L.garage = { name: "Sal's Chop Garage", ...specialBuilding(city, 0, 2, "SAL'S GARAGE", 'big', ['#5c4a3a', '#7d6650'], 24) };
  L.warehouse = { name: 'Pier 9 Warehouse', ...specialBuilding(city, 4, 3, 'PIER 9', 'big', ['#54606a', '#71808c'], 26) };
  L.hideout = { name: 'The Boathouse Hideout', ...specialBuilding(city, 3, 4, 'BOATHOUSE', 'small', ['#4a5e57', '#68857c'], 18) };
  L.safehouse = { name: 'Palms Safehouse', ...specialBuilding(city, 6, 2, 'PALMS SAFEHOUSE', 'small', ['#5f7263', '#7f9684'], 14) };
  const dropRect = blockRect(0, 0);
  L.dropoff = { name: 'Harborlight Storage', x: dropRect.x + dropRect.w / 2, y: dropRect.y + dropRect.h + 26 };
  L.dockmaster = { name: 'The Dockmaster', x: L.warehouse.x + 78, y: L.warehouse.y + 10 };
  const taxiRect = blockRect(1, 1);
  L.taxiStand = { name: 'Azura Cabs Stand', x: taxiRect.x + taxiRect.w / 2, y: taxiRect.y + taxiRect.h + 26 };
  const courierRect = blockRect(0, 3);
  L.courier = { name: 'Bay City Couriers', x: courierRect.x + courierRect.w / 2, y: courierRect.y - 24 };
  const parkRect = blockRect(3, 2);
  L.park = { name: 'Palmetto Park', x: parkRect.x + parkRect.w / 2, y: parkRect.y + parkRect.h / 2 };

  // Parked cars line the curbs: spots along the south and east edge of most blocks.
  for (const b of city.blocks) {
    if (b.district === 'water' || b.district === 'parking') continue;
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k += 1) {
      city.parkedSpots.push({ x: b.x + 40 + k * 96 + rng.range(0, 20), y: b.y + b.h + ROAD_HALF - 18, angle: 0 });
    }
    if (rng.chance(0.6)) {
      city.parkedSpots.push({ x: b.x + b.w + ROAD_HALF - 18, y: b.y + rng.range(40, 120), angle: Math.PI / 2 });
    }
  }
  // The festival beach dresses itself: umbrellas, loungers and towels in
  // loose rows on the sand, two volley nets, and a line of string-light
  // poles along the promenade. All pass-through scenery (collideProps only
  // stops on crates, trees and palms), placed from the city seed.
  const beachCols = ['#ff5484', '#40e0ff', '#ffd75e', '#ff8c42', '#8affc1', '#c65b8f'];
  for (let k = 0; k < 39; k += 1) {
    const bx = 90 + (k % 13) * 245 + rng.range(-40, 40);
    const by = 2246 + Math.floor(k / 13) * 55 + rng.range(-10, 10);
    city.props.push({ kind: 'umbrella', x: bx, y: by, r: 12, color: beachCols[k % beachCols.length], a: rng.range(0, 3) });
    city.props.push({ kind: 'lounger', x: bx + 17, y: by + 9, r: 7, a: rng.range(-0.5, 0.5) });
    if (k % 2 === 0) city.props.push({ kind: 'towel', x: bx - 18, y: by + 12, r: 6, color: beachCols[(k + 3) % beachCols.length], a: rng.range(0, 3) });
  }
  for (const vx of [950, 2150]) {
    city.props.push({ kind: 'volley', x: vx, y: 2318, r: 16 });
  }
  for (let px = 130; px < WORLD_W; px += 232) {
    city.props.push({ kind: 'lightpole', x: px, y: 2268, r: 4 });
  }
  return city;
}

/** True when the point sits on open water (one of the harbor's water blocks). */
export function isWater(city, x, y) {
  for (const w of city.waterRects) {
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  }
  return false;
}

/** True when the point sits on a road (either a vertical or a horizontal strip). */
export function isRoad(x, y) {
  for (const vx of ROAD_X) if (Math.abs(x - vx) <= ROAD_HALF) return true;
  for (const hy of ROAD_Y) if (Math.abs(y - hy) <= ROAD_HALF) return true;
  return false;
}

/** The intersection (road-centre crossing) nearest to a point, as grid indices. */
export function nearestIntersection(x, y) {
  let bi = 0;
  let bj = 0;
  let best = Infinity;
  for (let i = 0; i < ROAD_X.length; i += 1) {
    for (let j = 0; j < ROAD_Y.length; j += 1) {
      const d = (ROAD_X[i] - x) ** 2 + (ROAD_Y[j] - y) ** 2;
      if (d < best) { best = d; bi = i; bj = j; }
    }
  }
  return { i: bi, j: bj, x: ROAD_X[bi], y: ROAD_Y[bj] };
}

/** Breadth-first route over the intersection grid from one point to another; returns waypoints. */
export function roadRoute(x0, y0, x1, y1) {
  const start = nearestIntersection(x0, y0);
  const goal = nearestIntersection(x1, y1);
  const key = (i, j) => i * 16 + j;
  const prev = new Map();
  const seen = new Set([key(start.i, start.j)]);
  const queue = [[start.i, start.j]];
  while (queue.length) {
    const [i, j] = queue.shift();
    if (i === goal.i && j === goal.j) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= ROAD_X.length || nj >= ROAD_Y.length) continue;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, key(i, j));
      queue.push([ni, nj]);
    }
  }
  const points = [];
  let k = key(goal.i, goal.j);
  const startKey = key(start.i, start.j);
  while (k !== undefined) {
    points.push({ x: ROAD_X[Math.floor(k / 16)], y: ROAD_Y[k % 16] });
    if (k === startKey) break;
    k = prev.get(k);
  }
  points.reverse();
  return points;
}

/** Push a circle out of every building footprint it overlaps; reports whether it hit anything. */
export function collideBuildings(city, body) {
  let hit = false;
  for (const b of city.buildings) {
    const nx = clamp(body.x, b.x, b.x + b.w);
    const ny = clamp(body.y, b.y, b.y + b.h);
    const dx = body.x - nx;
    const dy = body.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= body.r * body.r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      body.x = nx + (dx / d) * body.r;
      body.y = ny + (dy / d) * body.r;
    } else {
      // Centre inside the footprint: leave by the shallowest side.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) body.x = b.x - body.r;
      else if (m === right) body.x = b.x + b.w + body.r;
      else if (m === top) body.y = b.y - body.r;
      else body.y = b.y + b.h + body.r;
    }
  }
  return hit;
}

/** Solid props (crates, trees) push circles out too; streetlights and hydrants are walked past. */
export function collideProps(city, body) {
  let hit = false;
  for (const p of city.props) {
    if (p.kind !== 'crate' && p.kind !== 'tree' && p.kind !== 'palm') continue;
    const dx = body.x - p.x;
    const dy = body.y - p.y;
    const rr = body.r + p.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 0.0001) continue;
    const d = Math.sqrt(d2);
    body.x = p.x + (dx / d) * rr;
    body.y = p.y + (dy / d) * rr;
    hit = true;
  }
  return hit;
}

function segmentHitsRect(x1, y1, x2, y2, b) {
  // Slab test: does the segment cross the rect at all?
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < b.x || x1 > b.x + b.w) return false;
  } else {
    let t1 = (b.x - x1) / dx;
    let t2 = (b.x + b.w - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y1 < b.y || y1 > b.y + b.h) return false;
  } else {
    let t1 = (b.y - y1) / dy;
    let t2 = (b.y + b.h - y1) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** Line of sight between two points, blocked by any building footprint in between. */
export function losBlocked(city, x1, y1, x2, y2) {
  const minx = Math.min(x1, x2);
  const maxx = Math.max(x1, x2);
  const miny = Math.min(y1, y2);
  const maxy = Math.max(y1, y2);
  for (const b of city.buildings) {
    if (b.x > maxx || b.x + b.w < minx || b.y > maxy || b.y + b.h < miny) continue;
    if (segmentHitsRect(x1, y1, x2, y2, b)) return true;
  }
  return false;
}

/** A random point on a random block's sidewalk ring (where pedestrians live). */
export function randomSidewalkPoint(rng, city) {
  const walkable = city.blocks.filter((b) => b.district !== 'water');
  const b = walkable[Math.floor(rng.next() * walkable.length) % walkable.length];
  const side = rng.int(0, 3);
  const t = rng.next();
  const inset = 13;
  if (side === 0) return { x: b.x + t * b.w, y: b.y - inset };
  if (side === 1) return { x: b.x + t * b.w, y: b.y + b.h + inset };
  if (side === 2) return { x: b.x - inset, y: b.y + t * b.h };
  return { x: b.x + b.w + inset, y: b.y + t * b.h };
}
