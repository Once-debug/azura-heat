// Everything the player sees: the dusk-lit city, cars and people, the HUD with its
// minimap, menus, dialogue boxes and banners. All art is drawn procedurally on the
// canvas: no images, no fonts, no assets leave this file's imagination.

import { ROAD_X, ROAD_Y, ROAD_HALF, WORLD_W, WORLD_H } from './world.js';
import { clamp } from './rng.js';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

const GROUND = {
  downtown: '#484d5c', residential: '#3e5c46', industrial: '#5b5044',
  harbor: '#575046', park: '#3d6b46', parking: '#3b404d', water: '#14486b',
};

function drawGround(ctx, game) {
  const { city } = game;
  const cam = game.camera;
  const vx0 = cam.x - 80;
  const vy0 = cam.y - 80;
  const vx1 = cam.x + game.view.w + 80;
  const vy1 = cam.y + game.view.h + 80;
  const inView = (x, y, w, h) => x + w >= vx0 && x <= vx1 && y + h >= vy0 && y <= vy1;
  ctx.fillStyle = '#2c303c';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  for (const b of city.blocks) {
    if (!inView(b.x - ROAD_HALF, b.y - ROAD_HALF, b.w + ROAD_HALF * 2, b.h + ROAD_HALF * 2)) continue;
    ctx.fillStyle = GROUND[b.district] ?? '#444';
    ctx.fillRect(b.x - ROAD_HALF, b.y - ROAD_HALF, b.w + ROAD_HALF * 2, b.h + ROAD_HALF * 2);
  }
  // Water gets slow-moving light streaks so the harbor reads as water, not paint.
  ctx.fillStyle = '#17557f';
  for (const w of city.waterRects) {
    if (!inView(w.x, w.y, w.w, w.h)) continue;
    ctx.fillRect(w.x, w.y, w.w, w.h);
  }
  ctx.strokeStyle = 'rgba(140,200,235,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const w of city.waterRects) {
    if (!inView(w.x, w.y, w.w, w.h)) continue;
    for (let k = 0; k < 4; k += 1) {
      const y = w.y + 50 + k * 90 + Math.sin(game.time * 0.7 + k * 2 + w.x) * 6;
      ctx.moveTo(w.x + 30, y);
      ctx.lineTo(w.x + w.w - 60, y);
    }
  }
  ctx.stroke();
  // Sparkles: short bright dashes that breathe with the swell.
  ctx.strokeStyle = 'rgba(190,230,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const w of city.waterRects) {
    if (!inView(w.x, w.y, w.w, w.h)) continue;
    for (let k = 0; k < 7; k += 1) {
      const sx = w.x + 30 + hash(w.x * 3 + k * 57) * (w.w - 90);
      const sy = w.y + 26 + hash(w.y * 5 + k * 91) * (w.h - 52);
      const tw = 0.5 + Math.sin(game.time * 1.7 + k * 2.4 + w.x) * 0.5;
      if (tw < 0.45) continue;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 9 + tw * 8, sy);
    }
  }
  ctx.stroke();
  // Sidewalks: a pale frame around every block, with a darker curb line inside it.
  ctx.strokeStyle = '#767d8f';
  ctx.lineWidth = 10;
  for (const b of city.blocks) {
    if (b.district === 'water') continue;
    if (!inView(b.x - 8, b.y - 8, b.w + 16, b.h + 16)) continue;
    ctx.strokeRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
  }
  ctx.strokeStyle = 'rgba(18,20,28,0.4)';
  ctx.lineWidth = 2;
  for (const b of city.blocks) {
    if (b.district === 'water') continue;
    if (!inView(b.x - 8, b.y - 8, b.w + 16, b.h + 16)) continue;
    ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
  }
  // Roads: asphalt strips, dashed centre lines, crosswalks at intersections.
  ctx.fillStyle = '#31353f';
  for (const vx of ROAD_X) ctx.fillRect(vx - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
  for (const hy of ROAD_Y) ctx.fillRect(0, hy - ROAD_HALF, WORLD_W, ROAD_HALF * 2);
  // Asphalt is never one flat colour: patched and re-laid stretches, block by block.
  for (const vx of ROAD_X) {
    for (let j = 0; j < ROAD_Y.length - 1; j += 1) {
      const s = hash(vx * 7 + j * 131);
      if (s < 0.45) continue;
      if (!inView(vx - ROAD_HALF, ROAD_Y[j], ROAD_HALF * 2, 400)) continue;
      ctx.fillStyle = s > 0.78 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.07)';
      ctx.fillRect(vx - ROAD_HALF + 5, ROAD_Y[j] + 8, ROAD_HALF * 2 - 10, 384);
    }
  }
  for (const hy of ROAD_Y) {
    for (let i = 0; i < ROAD_X.length - 1; i += 1) {
      const s = hash(hy * 11 + i * 71);
      if (s < 0.5) continue;
      if (!inView(ROAD_X[i], hy - ROAD_HALF, 400, ROAD_HALF * 2)) continue;
      ctx.fillStyle = s > 0.8 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(ROAD_X[i] + 8, hy - ROAD_HALF + 5, 384, ROAD_HALF * 2 - 10);
    }
  }
  ctx.strokeStyle = 'rgba(232,201,90,0.65)';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (const vx of ROAD_X) { ctx.moveTo(vx, 0); ctx.lineTo(vx, WORLD_H); }
  for (const hy of ROAD_Y) { ctx.moveTo(0, hy); ctx.lineTo(WORLD_W, hy); }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(230,234,240,0.5)';
  for (const vx of ROAD_X) {
    for (const hy of ROAD_Y) {
      if (!inView(vx - ROAD_HALF, hy - ROAD_HALF, ROAD_HALF * 2, ROAD_HALF * 2)) continue;
      for (let k = -2; k <= 2; k += 1) {
        if (k === 0) continue;
        ctx.fillRect(vx - ROAD_HALF + 4, hy + k * 18 - 3, 14, 6);
        ctx.fillRect(vx + ROAD_HALF - 18, hy + k * 18 - 3, 14, 6);
      }
      // Manhole covers, where the hash says the drains run.
      if (hash(vx * 3 + hy * 17) > 0.35) {
        ctx.fillStyle = '#242832';
        ctx.beginPath();
        ctx.arc(vx + 19, hy - 23, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(160,170,190,0.4)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(vx + 19, hy - 23, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(230,234,240,0.5)';
      }
    }
  }
  // Piers over the water.
  for (const p of city.piers) {
    ctx.fillStyle = '#6e5638';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#54402a';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
  }
  // The park's pond and paths.
  const park = city.blocks.find((b) => b.district === 'park');
  if (park) {
    ctx.fillStyle = '#7a6a4f';
    ctx.fillRect(park.x + park.w / 2 - 8, park.y, 16, park.h);
    ctx.fillRect(park.x, park.y + park.h / 2 - 8, park.w, 16);
    ctx.fillStyle = '#1d6d8a';
    ctx.beginPath();
    ctx.ellipse(park.x + park.w * 0.28, park.y + park.h * 0.3, 44, 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Parking lot bays.
  ctx.strokeStyle = 'rgba(230,234,240,0.4)';
  ctx.lineWidth = 2;
  for (const s of city.parkedSpots) {
    if (s.angle !== Math.PI / 2) continue;
    if (s.x < vx0 || s.x > vx1 || s.y < vy0 || s.y > vy1) continue;
    ctx.strokeRect(s.x - 14, s.y - 26, 28, 52);
  }
}

// How lit the city is this frame, set by drawGame from the day cycle: windows,
// signs and headlights all read it, so dusk settles over everything at once.
let nightF = 0.4;

function drawBuilding(ctx, b, time) {
  const ox = b.ht * 0.22;
  const oy = b.ht * 0.34;
  // The shaded side gives the fake height; taller buildings throw a longer side.
  ctx.fillStyle = b.base;
  ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = 'rgba(10,10,18,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  // Rooftop furniture, placed by a hash of the address so it never flickers.
  const s1 = hash(b.x + b.y);
  const s2 = hash(b.x * 3 - b.y);
  if (b.kind === 'tower' || b.kind === 'office' || b.kind === 'special') {
    // An AC box with a pale casing, a smaller vent, and a fan with cross struts.
    const ax = b.x + 12 + s1 * (b.w - 60);
    const ay = b.y + 12 + s2 * (b.h - 50);
    ctx.fillStyle = 'rgba(196,204,218,0.4)';
    ctx.fillRect(ax, ay, 26, 18);
    ctx.strokeStyle = 'rgba(16,18,26,0.5)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(ax, ay, 26, 18);
    ctx.fillStyle = 'rgba(20,24,32,0.35)';
    ctx.fillRect(b.x + b.w - 44 - s2 * 30, b.y + b.h - 36 - s1 * 20, 20, 14);
    const fx2 = b.x + b.w * (0.3 + s1 * 0.4);
    const fy2 = b.y + b.h * (0.3 + s2 * 0.3);
    ctx.beginPath();
    ctx.arc(fx2, fy2, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,226,238,0.35)';
    ctx.beginPath();
    ctx.moveTo(fx2 - 8, fy2);
    ctx.lineTo(fx2 + 8, fy2);
    ctx.moveTo(fx2, fy2 - 8);
    ctx.lineTo(fx2, fy2 + 8);
    ctx.stroke();
  }
  if (b.ht > 110) {
    // Helipad on the tallest roofs.
    ctx.strokeStyle = 'rgba(240,240,230,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,240,230,0.8)';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('H', b.x + b.w / 2, b.y + b.h / 2 + 9);
  }
  if (b.kind === 'house') {
    ctx.fillStyle = 'rgba(30,34,28,0.4)';
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 10);
    ctx.fillRect(b.x + 8, b.y + b.h - 18, b.w - 16, 10);
  }
  if (b.kind === 'warehouse') {
    ctx.strokeStyle = 'rgba(15,16,20,0.35)';
    ctx.beginPath();
    for (let x = b.x + 18; x < b.x + b.w - 8; x += 22) {
      ctx.moveTo(x, b.y + 4);
      ctx.lineTo(x, b.y + b.h - 4);
    }
    ctx.stroke();
    if (s2 > 0.35) {
      // A water tower on the roof: tank ring, cone shading, cross-braced heart.
      const tx = b.x + b.w * (0.25 + s1 * 0.5);
      const ty = b.y + b.h * (0.3 + s2 * 0.35);
      ctx.fillStyle = '#4c4438';
      ctx.beginPath();
      ctx.arc(tx, ty, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6e6350';
      ctx.beginPath();
      ctx.arc(tx, ty, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,18,14,0.6)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tx - 9, ty - 9);
      ctx.lineTo(tx + 9, ty + 9);
      ctx.moveTo(tx + 9, ty - 9);
      ctx.lineTo(tx - 9, ty + 9);
      ctx.stroke();
    }
  }
  // Windows. Towers and offices get a skylight grid on the roof; every tall
  // enough building gets lit windows down its sun side, more of them lit as
  // the night comes on. The hash keeps each window's habit stable.
  if (b.kind === 'tower' || b.kind === 'office') {
    for (let wx = b.x + 12; wx < b.x + b.w - 12; wx += 24) {
      for (let wy = b.y + 10; wy < b.y + b.h - 10; wy += 20) {
        const lit = hash(wx * 1.7 + wy * 2.3) < 0.24 + nightF * 0.4;
        ctx.fillStyle = lit ? `rgba(255,199,110,${0.35 + nightF * 0.6})` : 'rgba(14,20,32,0.45)';
        ctx.fillRect(wx, wy, 10, 6);
      }
    }
  }
  if (oy >= 9) {
    const rows = oy >= 24 ? 2 : 1;
    for (let k = 0; k * 17 + 10 < b.w - 6; k += 1) {
      for (let r = 0; r < rows; r += 1) {
        const lit = hash(b.x * 3 + k * 31 + r * 57) < 0.2 + nightF * 0.5;
        ctx.fillStyle = lit ? `rgba(255,205,120,${0.4 + nightF * 0.6})` : 'rgba(12,16,26,0.5)';
        ctx.fillRect(b.x + ox + 8 + k * 17, b.y + b.h + 4 + r * (oy / (rows + 0.6)), 8, Math.min(9, oy * 0.4));
      }
    }
  }
  // A striped awning over the front door of shops and houses.
  if (b.kind === 'special' || b.kind === 'house') {
    const aw = Math.min(b.w - 26, 92);
    const axx = b.x + b.w / 2 - aw / 2;
    const ayy = b.y + b.h - 1;
    ctx.fillStyle = s1 > 0.5 ? '#a33e4e' : '#2e7d74';
    ctx.fillRect(axx, ayy, aw, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let sx = axx + 6; sx < axx + aw - 3; sx += 12) ctx.fillRect(sx, ayy, 5, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(axx, ayy + 8, aw, 2);
  }
  if (b.name) {
    ctx.fillStyle = 'rgba(12,14,22,0.72)';
    ctx.font = 'bold 13px system-ui, sans-serif';
    const w2 = ctx.measureText(b.name).width + 16;
    ctx.fillRect(b.x + b.w / 2 - w2 / 2, b.y + b.h / 2 - 11, w2, 22);
    // The name is a neon sign: it glows, in the colour the address hashes to.
    const neon = ['#ffd75e', '#40e0ff', '#ff5484', '#8affc1'][Math.floor(s1 * 4) % 4];
    ctx.save();
    ctx.shadowColor = neon;
    ctx.shadowBlur = 10 + nightF * 8;
    ctx.fillStyle = neon;
    ctx.textAlign = 'center';
    ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2 + 5);
    ctx.restore();
  }
  // Downtown neon trim, alternating pink and cyan by address.
  if (b.kind === 'office' || b.kind === 'tower') {
    ctx.strokeStyle = s1 > 0.5 ? `rgba(255,84,164,${0.35 + nightF * 0.4})` : `rgba(64,224,255,${0.35 + nightF * 0.4})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
  }
  void time;
}

function drawProp(ctx, p, game) {
  if (p.kind === 'palm' || p.kind === 'tree') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x + 5, p.y + 7, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(p.x - 2, p.y - 2, 4, 5);
    ctx.strokeStyle = p.kind === 'palm' ? '#3f9e58' : '#2f7a44';
    ctx.lineWidth = 3;
    // Palms breathe in the sea breeze; oaks hold still.
    const sway = p.kind === 'palm' ? Math.sin(game.time * 1.25 + p.x * 0.045 + p.y * 0.03) * 0.09 : 0;
    ctx.beginPath();
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2 + p.x * 0.01 + sway;
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10 - 3, p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16 + 3);
    }
    ctx.stroke();
  } else if (p.kind === 'lamp') {
    ctx.fillStyle = '#22262e';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === 'hydrant') {
    ctx.fillStyle = '#c23b2e';
    ctx.fillRect(p.x - 3, p.y - 4, 6, 8);
  } else if (p.kind === 'crate') {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a || 0);
    ctx.fillStyle = '#8a6f45';
    ctx.fillRect(-10, -10, 20, 20);
    ctx.strokeStyle = '#5f4b2c';
    ctx.lineWidth = 2;
    ctx.strokeRect(-10, -10, 20, 20);
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(10, 10);
    ctx.moveTo(10, -10);
    ctx.lineTo(-10, 10);
    ctx.stroke();
    ctx.restore();
  } else if (p.kind === 'bench') {
    ctx.fillStyle = '#6a5138';
    ctx.fillRect(p.x - 9, p.y - 3, 18, 6);
  }
}

function drawMarkedRing(ctx, car, time) {
  ctx.strokeStyle = `rgba(64,224,255,${0.6 + Math.sin(time * 6) * 0.3})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(car.x, car.y, 40 + Math.sin(time * 6) * 4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMotoShape(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.len;
  const W = car.wid;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, -L / 2 + 2, -W / 2 + 3, L, W + 3, 5);
  ctx.fill();
  // Wheels and the frame line between them.
  ctx.fillStyle = '#101216';
  ctx.beginPath();
  ctx.arc(-L * 0.34, 0, 5.6, 0, Math.PI * 2);
  ctx.arc(L * 0.34, 0, 5.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2c303a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-L * 0.34, 0);
  ctx.lineTo(L * 0.34, 0);
  ctx.stroke();
  // Tank in the bike's colour, dark seat behind it.
  ctx.fillStyle = car.color;
  rr(ctx, -L * 0.06, -W * 0.44, L * 0.32, W * 0.88, 3);
  ctx.fill();
  ctx.fillStyle = '#1d2026';
  rr(ctx, -L * 0.38, -W * 0.36, L * 0.26, W * 0.72, 3);
  ctx.fill();
  // The rider, leaning over the tank: torso, then a helmet with a visor slit.
  ctx.fillStyle = car.riderShirt || '#8a8f3a';
  ctx.beginPath();
  ctx.arc(-L * 0.04, 0, 6.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#22262e';
  ctx.beginPath();
  ctx.arc(L * 0.09, 0, 4.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(165,215,250,0.85)';
  ctx.fillRect(L * 0.12, -2.2, 3.2, 4.4);
  // Headlight and a red tail dot.
  ctx.fillStyle = '#ffeeb0';
  ctx.fillRect(L / 2 - 1, -2.2, 3, 4.4);
  ctx.fillStyle = car.brakeLight > 0 ? '#ff2d20' : '#7a1710';
  ctx.fillRect(-L / 2 - 1, -1.8, 2.6, 3.6);
  if (car.health < 45) {
    ctx.fillStyle = 'rgba(20,20,20,0.35)';
    ctx.beginPath();
    ctx.arc(L * 0.2, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (car.marked) drawMarkedRing(ctx, car, time);
}

function drawCarShape(ctx, car, time) {
  if (car.type === 'moto') {
    drawMotoShape(ctx, car, time);
    return;
  }
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.len;
  const W = car.wid;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, -L / 2 + 3, -W / 2 + 5, L, W, 6);
  ctx.fill();
  ctx.fillStyle = car.color;
  rr(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8,8,14,0.6)';
  ctx.lineWidth = 1.5;
  rr(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.stroke();
  // Wheels.
  ctx.fillStyle = '#14161c';
  for (const [wx, wy] of [[-L * 0.32, -W / 2 - 1], [L * 0.32, -W / 2 - 1], [-L * 0.32, W / 2 - 3], [L * 0.32, W / 2 - 3]]) {
    ctx.fillRect(wx - 5, wy, 10, 4);
  }
  // Cabin and glass.
  ctx.fillStyle = '#1b2635';
  if (car.type === 'pickup') {
    rr(ctx, -L * 0.05, -W * 0.38, L * 0.3, W * 0.76, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-L * 0.46, -W * 0.4, L * 0.36, W * 0.8);
  } else {
    rr(ctx, -L * 0.16, -W * 0.38, L * 0.4, W * 0.76, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,190,230,0.35)';
    ctx.fillRect(L * 0.16, -W * 0.3, 4, W * 0.6);
  }
  // Roof sheen, a door shut-line and mirrors, so the body reads as panels.
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(-L * 0.24, -W * 0.3, L * 0.28, W * 0.6);
  ctx.strokeStyle = 'rgba(10,12,18,0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(L * 0.06, -W / 2 + 2);
  ctx.lineTo(L * 0.06, W / 2 - 2);
  ctx.stroke();
  ctx.fillStyle = '#101216';
  ctx.fillRect(L * 0.12, -W / 2 - 2, 4, 3);
  ctx.fillRect(L * 0.12, W / 2 - 1, 4, 3);
  if (car.type === 'sports') {
    ctx.fillStyle = '#ffd75e';
    ctx.fillRect(-L * 0.2, -2, L * 0.44, 4);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-L / 2 - 2, -W * 0.42, 5, W * 0.84);
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#fff3b0';
    rr(ctx, -6, -5, 12, 10, 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 7px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2.5);
  }
  if (car.isPolice) {
    ctx.fillStyle = '#232a38';
    ctx.fillRect(-L * 0.08, -W / 2, L * 0.2, W);
    const flash = Math.sin(time * 10) > 0;
    ctx.fillStyle = flash ? '#ff3b30' : '#5a1610';
    ctx.fillRect(-5, -W * 0.34, 10, W * 0.3);
    ctx.fillStyle = flash ? '#3a6bff' : '#101f4a';
    ctx.fillRect(-5, W * 0.04, 10, W * 0.3);
  }
  // Headlights and brake lights.
  ctx.fillStyle = '#ffeeb0';
  ctx.fillRect(L / 2 - 2, -W * 0.34, 3, 5);
  ctx.fillRect(L / 2 - 2, W * 0.34 - 5, 3, 5);
  ctx.fillStyle = car.brakeLight > 0 || car.speed < -1 ? '#ff2d20' : '#7a1710';
  ctx.fillRect(-L / 2 - 1, -W * 0.34, 3, 5);
  ctx.fillRect(-L / 2 - 1, W * 0.34 - 5, 3, 5);
  if (car.health < 45) {
    ctx.fillStyle = 'rgba(20,20,20,0.35)';
    ctx.beginPath();
    ctx.arc(L * 0.3, 0, 6 + (45 - car.health) * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (car.marked) drawMarkedRing(ctx, car, time);
}

function drawPerson(ctx, p, isPlayer, time) {
  const sc = p.scale ?? 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(p.x + 2, p.y + 4, 8 * sc, 5 * sc, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.kind === 'target') {
    // The mark: a pulsing red ring so he stands out of any crowd.
    ctx.strokeStyle = `rgba(255,64,48,${0.55 + Math.sin(time * 5) * 0.3})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15 + Math.sin(time * 5) * 2.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.state === 'down') {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = p.shirt;
    rr(ctx, -11, -5, 22, 10, 5);
    ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(13, 0, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = p.speed > 4 ? Math.sin(time * 14 + p.id) * 1.6 : 0;
  ctx.fillStyle = p.pants;
  ctx.beginPath();
  ctx.arc(p.x, p.y + bob * 0.4, 5.6 * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isPlayer ? '#12b5a5' : p.shirt;
  ctx.beginPath();
  ctx.arc(p.x, p.y + bob, 7 * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(p.angle) * 2.4, p.y + Math.sin(p.angle) * 2.4 + bob, 4.2 * sc, 0, Math.PI * 2);
  ctx.fill();
  if (p.hat) {
    // A cap: a coloured dome with the face peeking out toward the facing.
    const hx = p.x + Math.cos(p.angle) * 2.4;
    const hy = p.y + Math.sin(p.angle) * 2.4 + bob;
    ctx.fillStyle = p.hat;
    ctx.beginPath();
    ctx.arc(hx, hy, 4.9 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(hx + Math.cos(p.angle) * 1.6, hy + Math.sin(p.angle) * 1.6, 3 * sc, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.kind === 'officer') {
    ctx.fillStyle = '#16233d';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 2.4, p.y + Math.sin(p.angle) * 2.4 + bob, 4.6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.kind === 'thug') {
    ctx.fillStyle = '#c23b2e';
    ctx.fillRect(p.x - 4, p.y - 6 + bob, 8, 3);
  }
  if (isPlayer) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawStar(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let k = 0; k < 10; k += 1) {
    const rad = k % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = '#ffd75e';
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,215,94,0.9)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function drawMinimap(ctx, game, x, y, w, h) {
  const { city, player } = game;
  ctx.fillStyle = 'rgba(10,14,24,0.82)';
  rr(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,160,200,0.5)';
  ctx.lineWidth = 1.5;
  rr(ctx, x, y, w, h, 8);
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  rr(ctx, x, y, w, h, 8);
  ctx.clip();
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  ctx.fillStyle = '#1d4e6e';
  for (const wr of city.waterRects) ctx.fillRect(x + wr.x * sx, y + wr.y * sy, wr.w * sx, wr.h * sy);
  ctx.strokeStyle = '#59637a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const vx of ROAD_X) { ctx.moveTo(x + vx * sx, y); ctx.lineTo(x + vx * sx, y + h); }
  for (const hy of ROAD_Y) { ctx.moveTo(x, y + hy * sy); ctx.lineTo(x + w, y + hy * sy); }
  ctx.stroke();
  const dot = (wx, wy, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + wx * sx, y + wy * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const c of game.cars) {
    if (c.isPolice && !c.dead) dot(c.x, c.y, Math.sin(game.time * 8) > 0 ? '#ff5040' : '#ff9a8a', 3);
  }
  if (game.markedCar && !game.markedCar.dead) dot(game.markedCar.x, game.markedCar.y, '#40e0ff', 3.4);
  if (game.targetPed && !game.targetPed.dead) dot(game.targetPed.x, game.targetPed.y, '#ff4030', 3.2);
  if (game.event && game.event.mugger && !game.event.mugger.dead) dot(game.event.mugger.x, game.event.mugger.y, '#ff7040', 2.8);
  if (game.objective) dot(game.objective.x, game.objective.y, '#ffd75e', 3.6 + Math.sin(game.time * 5) * 1);
  // Player arrow.
  const pa = player.car ? player.car.angle : player.angle;
  ctx.save();
  ctx.translate(x + player.x * sx, y + player.y * sy);
  ctx.rotate(pa);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawHUD(ctx, game) {
  const { w, h } = game.view;
  const p = game.player;
  ctx.textAlign = 'left';
  // Health and cash, top-left.
  ctx.fillStyle = 'rgba(8,10,18,0.55)';
  rr(ctx, 14, 12, 218, 58, 8);
  ctx.fill();
  ctx.fillStyle = '#3a3f4d';
  rr(ctx, 24, 22, 160, 13, 4);
  ctx.fill();
  ctx.fillStyle = p.hp > 30 ? '#43d17c' : '#e5484d';
  rr(ctx, 24, 22, 160 * clamp(p.hp / 100, 0, 1), 13, 4);
  ctx.fill();
  if (p.armor > 0) {
    // The vest: a steel-blue bar under the health bar.
    ctx.fillStyle = '#2c3444';
    rr(ctx, 24, 39, 160, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#7fb2e5';
    rr(ctx, 24, 39, 160 * clamp(p.armor / 100, 0, 1), 6, 3);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`$${game.cash}`, 24, 60);
  if (p.car) {
    ctx.fillStyle = '#9fb4d8';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${p.car.type === 'police' ? 'APD cruiser' : p.car.type}  ${Math.round(p.car.health)}%`, 92, 60);
  }
  // Wanted stars, top-right.
  for (let k = 0; k < 5; k += 1) {
    drawStar(ctx, w - 30 - k * 34, 32, 13, k < game.wanted.stars);
  }
  if (game.wanted.bustT > 0.05) {
    ctx.fillStyle = 'rgba(8,10,18,0.6)';
    rr(ctx, w / 2 - 110, 64, 220, 20, 6);
    ctx.fill();
    ctx.fillStyle = '#e5484d';
    rr(ctx, w / 2 - 106, 68, 212 * clamp(game.wanted.bustT / 1.5, 0, 1), 12, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', w / 2, 78);
    ctx.textAlign = 'left';
  }
  // Objective line, top-centre.
  if (game.objective) {
    ctx.font = 'bold 15px system-ui, sans-serif';
    const text = game.objective.text;
    const tw = ctx.measureText(text).width + 28;
    ctx.fillStyle = 'rgba(8,10,18,0.55)';
    rr(ctx, w / 2 - tw / 2, 12, tw, 30, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd75e';
    ctx.textAlign = 'center';
    const target = game.objective;
    const dist = Math.round(Math.hypot(target.x - p.x, target.y - p.y) / 10);
    ctx.fillText(`${text}  ·  ${dist}m`, w / 2, 33);
    ctx.textAlign = 'left';
  }
  // Weapon and ammo, bottom-left.
  ctx.fillStyle = 'rgba(8,10,18,0.55)';
  rr(ctx, 14, h - 52, 196, 38, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  if (p.weapon === 'pistol' || p.weapon === 'smg') {
    const name = p.weapon === 'smg' ? 'SMG' : 'PISTOL';
    const mag = p.weapon === 'smg' ? p.smgMag : p.mag;
    const reserve = p.weapon === 'smg' ? p.smgAmmo : p.ammo;
    ctx.fillText(`${name}  ${mag} / ${reserve}`, 26, h - 28);
    if (p.reloading > 0) {
      ctx.fillStyle = '#ffd75e';
      ctx.font = '11px system-ui';
      ctx.fillText('RELOADING…', 140, h - 28);
    }
  } else {
    ctx.fillText('FISTS', 26, h - 28);
  }
  // Cop radio chatter while the chase is on: a quiet line under the objective.
  if (game.chatter && game.screen === 'play') {
    ctx.font = 'italic 13px system-ui, sans-serif';
    const text = `📻 ${game.chatter.text}`;
    const tw = ctx.measureText(text).width + 24;
    const cy = game.objective ? 50 : 16;
    ctx.fillStyle = 'rgba(8,12,24,0.5)';
    rr(ctx, w / 2 - tw / 2, cy, tw, 24, 7);
    ctx.fill();
    ctx.fillStyle = '#aebfe0';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, cy + 17);
    ctx.textAlign = 'left';
  }
  // Shop prompts, bottom-centre: what F (and G) will do right here.
  if (game.shopPrompt && game.screen === 'play' && !game.dialogue) {
    ctx.font = 'bold 14px system-ui, sans-serif';
    const text = game.shopPrompt.text;
    const tw = ctx.measureText(text).width + 30;
    ctx.fillStyle = 'rgba(8,10,18,0.68)';
    rr(ctx, w / 2 - tw / 2, h - 118, tw, 32, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,94,0.55)';
    ctx.lineWidth = 1.4;
    rr(ctx, w / 2 - tw / 2, h - 118, tw, 32, 9);
    ctx.stroke();
    ctx.fillStyle = '#ffd75e';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h - 97);
    ctx.textAlign = 'left';
  }
  // Speed while driving, above the minimap.
  if (p.car) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.36)}`, w - 24, h - 168);
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#9fb4d8';
    ctx.fillText('km/h', w - 24, h - 154);
    ctx.textAlign = 'left';
  }
  drawMinimap(ctx, game, w - 204, h - 146, 190, 132);
  // Off-screen objective arrow.
  if (game.objective) {
    const cam = game.camera;
    const ox = game.objective.x - cam.x;
    const oy = game.objective.y - cam.y;
    if (ox < -20 || oy < -20 || ox > w + 20 || oy > h + 20) {
      const cx = clamp(ox, 30, w - 30);
      const cy = clamp(oy, 60, h - 30);
      const a = Math.atan2(oy - h / 2, ox - w / 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-7, -8);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawBanner(ctx, game) {
  const b = game.banner;
  if (!b || b.t <= 0) return;
  const { w } = game.view;
  const alpha = clamp(b.t / 0.6, 0, 1) * clamp((3.2 - b.t) / 0.8, 0, 1);
  ctx.save();
  ctx.globalAlpha = clamp(alpha + 0.25, 0, 1);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 12;
  ctx.fillText(b.title, w / 2, 150);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(b.sub || '', w / 2, 180);
  ctx.restore();
}

function drawDialogue(ctx, game) {
  const d = game.dialogue;
  if (!d) return;
  const { w, h } = game.view;
  const line = d.lines[d.idx];
  if (!line) return;
  ctx.fillStyle = 'rgba(6,8,16,0.88)';
  rr(ctx, w / 2 - 330, h - 132, 660, 104, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,94,0.6)';
  ctx.lineWidth = 1.5;
  rr(ctx, w / 2 - 330, h - 132, 660, 104, 10);
  ctx.stroke();
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(line.who, w / 2 - 306, h - 102);
  ctx.fillStyle = '#f2f4f8';
  ctx.font = '16px system-ui, sans-serif';
  wrapText(ctx, line.text, w / 2 - 306, h - 76, 612, 22);
  ctx.fillStyle = '#8fa3c8';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText('E ▸', w / 2 + 306, h - 42);
  ctx.textAlign = 'left';
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

function drawTitle(ctx, game) {
  const { w, h } = game.view;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(16,10,34,0.25)');
  grad.addColorStop(0.55, 'rgba(16,10,34,0.45)');
  grad.addColorStop(1, 'rgba(8,6,20,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.font = 'bold 92px system-ui, sans-serif';
  ctx.fillStyle = '#40e0ff';
  ctx.shadowColor = 'rgba(64,224,255,0.65)';
  ctx.shadowBlur = 26;
  ctx.fillText('AZURA', w / 2, h * 0.3);
  ctx.fillStyle = '#ff5484';
  ctx.shadowColor = 'rgba(255,84,132,0.65)';
  ctx.fillText('HEAT', w / 2, h * 0.3 + 88);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText('Rook drove into Azura Bay with a hundred dollars and a past. The city provides the rest.', w / 2, h * 0.3 + 132);
  const items = game.hasSaveFile ? ['NEW GAME', 'CONTINUE', 'HOW TO PLAY'] : ['NEW GAME', 'HOW TO PLAY'];
  ctx.font = 'bold 24px system-ui, sans-serif';
  items.forEach((label, i) => {
    const y = h * 0.62 + i * 44;
    if (i === game.menuIdx) {
      ctx.fillStyle = 'rgba(255,215,94,0.16)';
      rr(ctx, w / 2 - 150, y - 29, 300, 38, 8);
      ctx.fill();
      ctx.fillStyle = '#ffd75e';
      ctx.fillText(`▸ ${label}`, w / 2, y);
    } else {
      ctx.fillStyle = '#c8d2e4';
      ctx.fillText(label, w / 2, y);
    }
  });
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#8fa3c8';
  ctx.fillText('WASD drive · mouse aim · E enter car · 1/2/3 weapons · F shop · Esc pause', w / 2, h - 30);
  ctx.textAlign = 'left';
}

function drawHelp(ctx, game) {
  const { w, h } = game.view;
  ctx.fillStyle = 'rgba(5,6,14,0.9)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('HOW TO PLAY', w / 2, h * 0.2);
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '17px system-ui, sans-serif';
  const rows = [
    'WASD / arrows — move and drive      Shift — run / handbrake is Space',
    'Mouse — aim      Left click — punch or shoot      R — reload',
    '1 / 2 / 3 — fists, pistol, SMG      E — enter / exit car, advance dialogue',
    'Esc / P — pause      M — mute',
    'Follow the gold marker. Finish Vera and Sal\'s jobs to make Rook\'s name.',
    'Crimes raise your stars. Break the police line of sight to cool off.',
    'Get caught standing still by an officer and you are BUSTED.',
    'Die and Azura General patches you up — for a fee.',
    'Fares at the cab stand and parcels at Bay City Couriers pay forever.',
    "Hot? Roll into Sal's bay: $150 buys a respray and a clean slate.",
    'Iron & Ivory Arms sells the SMG and body armor — walk up, press F / G.',
    'After the finale, the city keeps offering work. And races. Bring a fast car.',
  ];
  rows.forEach((row, i) => ctx.fillText(row, w / 2, h * 0.32 + i * 32));
  ctx.fillStyle = '#8fa3c8';
  ctx.font = '14px system-ui';
  ctx.fillText('Press Esc to go back', w / 2, h * 0.32 + rows.length * 32 + 26);
  ctx.textAlign = 'left';
}

function drawEndCard(ctx, game, title, sub, color) {
  const { w, h } = game.view;
  ctx.fillStyle = 'rgba(5,5,10,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 18;
  ctx.fillText(title, w / 2, h * 0.44);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '18px system-ui';
  ctx.fillText(sub, w / 2, h * 0.44 + 44);
  ctx.textAlign = 'left';
}

/** The whole frame: world, actors, light, then the interface on top. */
export function drawGame(ctx, game) {
  const { w, h } = game.view;
  const cam = game.camera;
  nightF = clamp((game.dayT - 0.3) * 2.6, 0, 1);
  ctx.fillStyle = '#10131c';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(-Math.round(cam.x + (cam.shakeX || 0)), -Math.round(cam.y + (cam.shakeY || 0)));

  drawGround(ctx, game);
  // Skid marks under everything that moves.
  ctx.strokeStyle = 'rgba(12,12,16,0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (const s of game.skids) {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.stroke();
  const vx0 = cam.x - 110;
  const vy0 = cam.y - 110;
  const vx1 = cam.x + w + 110;
  const vy1 = cam.y + h + 110;
  for (const b of game.city.buildings) {
    if (b.x + b.w + 60 < vx0 || b.x - 60 > vx1 || b.y + b.h + 60 < vy0 || b.y - 60 > vy1) continue;
    drawBuilding(ctx, b, game.time);
  }
  for (const p of game.city.props) {
    if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
    drawProp(ctx, p, game);
  }

  // Objective beacon: a column of gold light on the target.
  if (game.objective && game.screen === 'play') {
    const o = game.objective;
    const pulse = 0.5 + Math.sin(game.time * 4) * 0.18;
    const grad = ctx.createLinearGradient(0, o.y - 130, 0, o.y);
    grad.addColorStop(0, 'rgba(255,215,94,0)');
    grad.addColorStop(1, `rgba(255,215,94,${pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(o.x - 9, o.y - 130, 18, 130);
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.arc(o.x, o.y, 10 + Math.sin(game.time * 4) * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // A street crime in progress gets its own marker: red ring, floating mark.
  if (game.event && game.event.kind === 'mugging' && game.screen === 'play') {
    const m = game.event.mugger;
    if (m && !m.dead) {
      ctx.strokeStyle = `rgba(255,96,64,${0.6 + Math.sin(game.time * 6) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 24 + Math.sin(game.time * 6) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ff6040';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', m.x, m.y - 30 - Math.sin(game.time * 6) * 2);
      ctx.textAlign = 'left';
    }
  }

  for (const car of game.cars) {
    if (car.dead) continue;
    if (car.x < vx0 || car.x > vx1 || car.y < vy0 || car.y > vy1) continue;
    drawCarShape(ctx, car, game.time);
  }
  for (const ped of game.peds) {
    if (ped.x < vx0 || ped.x > vx1 || ped.y < vy0 || ped.y > vy1) continue;
    drawPerson(ctx, ped, false, game.time);
  }
  if (!game.player.car) drawPerson(ctx, game.player, true, game.time);
  else {
    // A small marker over the player's own car so it is never lost in traffic.
    const c = game.player.car;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - 30 - Math.sin(game.time * 5) * 2);
    ctx.lineTo(c.x - 6, c.y - 40 - Math.sin(game.time * 5) * 2);
    ctx.lineTo(c.x + 6, c.y - 40 - Math.sin(game.time * 5) * 2);
    ctx.closePath();
    ctx.fill();
  }
  // Bullet tracers and particles.
  for (const t of game.tracers) {
    ctx.strokeStyle = `rgba(255,230,150,${clamp(t.life / 0.07, 0, 1)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
  for (const pt of game.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  // Dropped ammo boxes bob gently where a thug went down.
  for (const pk of game.pickups) {
    const bob = Math.sin(game.time * 5 + pk.x) * 2.4;
    ctx.fillStyle = '#2e4a2a';
    rr(ctx, pk.x - 9, pk.y - 7 + bob, 18, 14, 3);
    ctx.fill();
    ctx.fillStyle = '#ffd75e';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A', pk.x, pk.y + 4 + bob);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // Dusk: a blue veil whose depth breathes with the day cycle, then the lights.
  const dark = 0.16 + game.dayT * 0.16;
  ctx.fillStyle = `rgba(16,18,52,${dark})`;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(-Math.round(cam.x + (cam.shakeX || 0)), -Math.round(cam.y + (cam.shakeY || 0)));
  ctx.globalCompositeOperation = 'lighter';
  for (const p of game.city.props) {
    if (p.kind !== 'lamp') continue;
    if (p.x < cam.x - 60 || p.y < cam.y - 60 || p.x > cam.x + w + 60 || p.y > cam.y + h + 60) continue;
    const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 44);
    g.addColorStop(0, `rgba(255,196,110,${0.13 + nightF * 0.27})`);
    g.addColorStop(1, 'rgba(255,196,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 44, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const car of game.cars) {
    if (car.dead) continue;
    if (car.x < cam.x - 90 || car.x > cam.x + w + 90 || car.y < cam.y - 90 || car.y > cam.y + h + 90) continue;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const hx = car.x + fx * car.len * 0.5;
    const hy = car.y + fy * car.len * 0.5;
    const g = ctx.createRadialGradient(hx, hy, 2, hx + fx * 40, hy + fy * 40, 74);
    g.addColorStop(0, `rgba(255,238,176,${0.09 + nightF * 0.19})`);
    g.addColorStop(1, 'rgba(255,238,176,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(hx + fx * 30, hy + fy * 30, 74, 0, Math.PI * 2);
    ctx.fill();
    // Taillights bleed a little red into the dark, more under braking.
    const tx = car.x - fx * car.len * 0.5;
    const ty = car.y - fy * car.len * 0.5;
    const tg = ctx.createRadialGradient(tx, ty, 1, tx, ty, 20);
    tg.addColorStop(0, `rgba(255,60,40,${car.brakeLight > 0 ? 0.34 : 0.1 + nightF * 0.1})`);
    tg.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(tx, ty, 20, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';

  // A gentle vignette keeps the eye in the middle of the frame.
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.74);
  vg.addColorStop(0, 'rgba(4,4,12,0)');
  vg.addColorStop(1, 'rgba(4,4,12,0.3)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  if (game.screen === 'title') {
    drawTitle(ctx, game);
    return;
  }
  if (game.screen === 'help') {
    drawHelp(ctx, game);
    return;
  }
  drawHUD(ctx, game);
  drawBanner(ctx, game);
  drawDialogue(ctx, game);
  if (game.sprayT > 0) {
    ctx.fillStyle = 'rgba(6,8,16,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd75e';
    ctx.font = 'bold 30px system-ui, sans-serif';
    const dots = '.'.repeat(1 + (Math.floor(game.time * 3) % 3));
    ctx.fillText(`REPAINTING${dots}`, w / 2, h * 0.44);
    ctx.fillStyle = '#e8ecf4';
    ctx.font = '15px system-ui';
    ctx.fillText("Sal's crew works fast. The heat dies with the old color.", w / 2, h * 0.44 + 30);
    ctx.textAlign = 'left';
  }
  if (game.screen === 'pause') {
    ctx.fillStyle = 'rgba(5,6,14,0.78)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd75e';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText('PAUSED', w / 2, h * 0.3);
    ctx.fillStyle = '#e8ecf4';
    ctx.font = '17px system-ui';
    const s = game.stats;
    ctx.fillText(`Cash $${game.cash} · Missions ${s.missions} · Cars stolen ${s.stolen} · Fares ${s.fares} · Parcels ${s.parcels}`, w / 2, h * 0.3 + 48);
    ctx.fillText('Esc — resume · H — how to play · M — mute', w / 2, h * 0.3 + 84);
    ctx.textAlign = 'left';
  }
  if (game.screen === 'wasted') drawEndCard(ctx, game, 'WASTED', 'Azura General patched you up. Press E to get back out there.', '#e5484d');
  if (game.screen === 'busted') drawEndCard(ctx, game, 'BUSTED', 'The APD thanks you for your donation. Press E to walk out of Central.', '#5aa2e5');
}
