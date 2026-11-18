// The story of Rook in Azura Bay: five chained missions with dialogue, markers and
// cash rewards, plus two repeatable side jobs (taxi fares, courier runs) that keep the
// city worth driving in after the finale. Mission state lives on the game object; this
// module advances it and keeps game.objective pointing at the next thing to do.

import { rand } from './rng.js';

const L = (game) => game.city.locations;

function lines(...pairs) {
  return pairs.map(([who, text]) => ({ who, text }));
}

export const MISSIONS = [
  {
    id: 'welcome',
    title: 'Welcome to Azura',
    giver: 'cafe',
    meetText: 'Meet Vera at Cafe Solana',
    intro: lines(
      ['Vera', 'You must be Rook. Heard you used to drive. Azura Bay eats drivers alive, or it makes them rich.'],
      ['Rook', 'I am done with rich. I just need work that pays rent.'],
      ['Vera', 'Then start small. Pier 9 warehouse, south harbor. Pick up a package, bring it back here. No questions, no detours.'],
    ),
    steps: [
      { kind: 'goto', at: 'warehouse', label: 'Pick up the package at Pier 9', radius: 52 },
      { kind: 'goto', at: 'cafe', label: 'Deliver the package to Cafe Solana', radius: 52 },
    ],
    reward: 250,
    outro: lines(['Vera', 'Clean and quick. Sal at the chop garage has been asking for someone like you. Go see him.']),
  },
  {
    id: 'wheels',
    title: 'Borrowed Wheels',
    giver: 'garage',
    meetText: "See Sal at Sal's Chop Garage",
    intro: lines(
      ['Sal', 'Vera says you can drive. A collector owes me, and his sports car sits in the Palms parking lot, east side.'],
      ['Sal', 'Take this pistol. For confidence only. Bring me the car, paint intact if you can manage it.'],
      ['Rook', 'And if the owner objects?'],
      ['Sal', 'Then drive faster than his objections.'],
    ),
    steps: [
      { kind: 'steal', at: 'parking', label: 'Steal the marked sports car', radius: 60 },
      { kind: 'goto', at: 'garage', label: "Deliver the car to Sal's garage", radius: 64, needMarkedCar: true },
    ],
    reward: 400,
    outro: lines(['Sal', 'Beautiful. You are not a driver, Rook, you are a rumor with a steering wheel. Vera has something bigger.']),
  },
  {
    id: 'clock',
    title: 'Against the Clock',
    giver: 'cafe',
    meetText: 'Meet Vera at Cafe Solana',
    intro: lines(
      ['Vera', 'A client pays for speed, not excuses. Six checkpoints, one timer, whole city watching.'],
      ['Rook', 'And the car?'],
      ['Vera', 'Yours to find. That is rather the point of the test.'],
    ),
    steps: [
      { kind: 'race', label: 'Hit every checkpoint before the timer runs out', time: 110 },
    ],
    reward: 350,
    outro: lines(['Vera', 'The client is impressed. So am I, and I do not impress. One more job, then the real one.']),
  },
  {
    id: 'property',
    title: 'Hot Property',
    giver: 'cafe',
    meetText: 'Meet Vera at Cafe Solana',
    intro: lines(
      ['Vera', 'A briefcase changes hands in Palmetto Park at dusk. The other crew intends to keep it. Persuade them.'],
      ['Rook', 'Four of them, one of me.'],
      ['Vera', 'You have a pistol and a reputation now. Spend both wisely.'],
    ),
    steps: [
      { kind: 'shootout', at: 'park', label: 'Take the briefcase in Palmetto Park', radius: 240 },
      { kind: 'goto', at: 'cafe', label: 'Bring the briefcase to Vera', radius: 52 },
    ],
    reward: 600,
    outro: lines(['Vera', 'The park crew will not trouble anyone again. Rest tonight, Rook. Tomorrow we rob the Bank of Azura.']),
  },
  {
    id: 'score',
    title: 'The Big Score',
    giver: 'garage',
    meetText: 'See Sal for the big one',
    intro: lines(
      ['Sal', 'Bank of Azura moves its vault cash at dusk. The score sits by the front steps, guarded by every cop in the city.'],
      ['Sal', 'Grab it, and every star in the sky lights up. Lose them, get to the Boathouse. Then we are all rich and quiet.'],
      ['Rook', 'One last drive, then.'],
    ),
    steps: [
      { kind: 'goto', at: 'bank', label: 'Grab the score at the Bank of Azura', radius: 56, grab: true },
      { kind: 'escape', at: 'hideout', label: 'Escape to the Boathouse hideout', radius: 64 },
    ],
    reward: 1500,
    outro: lines(
      ['Sal', 'You did it. Half this city will tell stories about tonight and get every detail wrong.'],
      ['Vera', 'Welcome to Azura, Rook. The city is yours now. Drive it well.'],
    ),
  },
];

const RACE_POINTS = [
  { x: 600, y: 600 }, { x: 1800, y: 200 }, { x: 2600, y: 600 },
  { x: 2200, y: 1400 }, { x: 1000, y: 1800 }, { x: 400, y: 1400 },
];

export function createMissionState() {
  return {
    idx: 0, // next story mission to run
    phase: 'meet', // meet | steps | done (story finished)
    stepIdx: 0,
    raceIdx: 0,
    raceT: 0,
    shootoutSpawned: false,
    carrying: '',
  };
}

function playerPos(game) {
  return game.player.car ?? game.player;
}

function atPoint(game, x, y, radius) {
  const p = playerPos(game);
  return (p.x - x) ** 2 + (p.y - y) ** 2 < radius * radius;
}

function setObjective(game, x, y, text) {
  game.objective = { x, y, text };
}

function beginMission(game, def) {
  const m = game.mission;
  m.phase = 'steps';
  m.stepIdx = 0;
  m.raceIdx = 0;
  m.shootoutSpawned = false;
  m.carrying = '';
  game.startDialogue(def.intro, () => prepareStep(game, def));
}

function prepareStep(game, def) {
  const m = game.mission;
  const step = def.steps[m.stepIdx];
  if (!step) return;
  if (step.kind === 'race') {
    m.raceIdx = 0;
    m.raceT = step.time;
  }
  if (step.kind === 'steal') {
    game.spawnMarkedCar();
  }
  if (step.kind === 'escape' && game.forceStars) {
    game.forceStars(3);
  }
}

function completeMission(game, def) {
  const m = game.mission;
  game.addCash(def.reward);
  game.stats.missions += 1;
  game.showBanner('MISSION COMPLETE', `${def.title}  +$${def.reward}`);
  game.audio?.missionComplete?.();
  m.idx += 1;
  m.phase = m.idx >= MISSIONS.length ? 'done' : 'meet';
  m.stepIdx = 0;
  m.carrying = '';
  game.startDialogue(def.outro, null);
  game.saveGame();
}

function advanceStep(game, def) {
  const m = game.mission;
  m.stepIdx += 1;
  m.carrying = '';
  if (m.stepIdx >= def.steps.length) {
    completeMission(game, def);
  } else {
    game.audio?.pickup?.();
    prepareStep(game, def);
  }
}

/** Restart the current mission after a bust or a hospital visit. */
export function failMission(game) {
  const m = game.mission;
  if (m.phase === 'steps') {
    m.phase = 'meet';
    m.stepIdx = 0;
    m.carrying = '';
    if (game.markedCar) game.markedCar.marked = false;
    game.markedCar = null;
  }
  game.side = null;
}

export function updateMissions(game, dt) {
  const m = game.mission;
  if (game.dialogue) return; // the world holds its breath while people talk
  if (m.phase === 'done') {
    updateSideJobs(game, dt, true);
    if (!game.side) setObjective(game, L(game).taxiStand.x, L(game).taxiStand.y, 'Free roam: fares at the cab stand, parcels at Bay City Couriers');
    return;
  }
  const def = MISSIONS[m.idx];
  if (m.phase === 'meet') {
    const g = L(game)[def.giver];
    setObjective(game, g.x, g.y, def.meetText);
    if (atPoint(game, g.x, g.y, 56)) beginMission(game, def);
    return;
  }
  // phase === 'steps'
  const step = def.steps[m.stepIdx];
  if (!step) return;
  if (step.kind === 'goto' || step.kind === 'escape') {
    const at = L(game)[step.at];
    setObjective(game, at.x, at.y, step.label);
    if (atPoint(game, at.x, at.y, step.radius)) {
      if (step.kind === 'goto' && m.stepIdx === 0 && def.id === 'welcome') m.carrying = 'package';
      if (step.grab) {
        m.carrying = 'score';
        if (game.forceStars) game.forceStars(3); // the vault alarm lights up the sky
      }
      advanceStep(game, def);
    }
    return;
  }
  if (step.kind === 'steal') {
    const car = game.markedCar;
    if (car) {
      setObjective(game, car.x, car.y, step.label);
      if (game.player.car === car) advanceStep(game, def);
    }
    return;
  }
  if (step.kind === 'race') {
    const pt = RACE_POINTS[m.raceIdx];
    m.raceT -= dt;
    setObjective(game, pt.x, pt.y, `${step.label} — checkpoint ${m.raceIdx + 1}/${RACE_POINTS.length}, ${Math.max(0, Math.ceil(m.raceT))}s`);
    if (m.raceT <= 0) {
      game.showBanner('OUT OF TIME', 'The client walks away. Meet Vera to try again.');
      game.audio?.fail?.();
      m.phase = 'meet';
      return;
    }
    if (atPoint(game, pt.x, pt.y, 62)) {
      m.raceIdx += 1;
      game.audio?.pickup?.();
      if (m.raceIdx >= RACE_POINTS.length) advanceStep(game, def);
    }
    return;
  }
  if (step.kind === 'shootout') {
    const at = L(game)[step.at];
    if (!m.shootoutSpawned) {
      setObjective(game, at.x, at.y, step.label);
      if (atPoint(game, at.x, at.y, step.radius)) {
        m.shootoutSpawned = true;
        game.spawnThugs(at.x, at.y);
        game.showBanner('AMBUSH', 'The other crew is here. Take the briefcase.');
      }
      return;
    }
    const alive = game.peds.some((p) => p.kind === 'thug' && !p.dead && p.state !== 'down');
    if (alive) {
      const first = game.peds.find((p) => p.kind === 'thug' && !p.dead && p.state !== 'down');
      setObjective(game, first.x, first.y, 'Drop the park crew and take the briefcase');
    } else {
      setObjective(game, at.x, at.y, 'Grab the briefcase');
      if (atPoint(game, at.x, at.y, 44)) {
        m.carrying = 'briefcase';
        advanceStep(game, def);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Side jobs: taxi fares from the cab stand, courier parcels from the harbor.

const DEST_SPOTS = ['cafe', 'bank', 'hospital', 'garage', 'warehouse', 'hideout', 'police', 'park'];

function randomDest(game, notKey) {
  const keys = DEST_SPOTS.filter((k) => k !== notKey);
  const key = keys[Math.floor(Math.random() * keys.length)];
  return { key, ...L(game)[key] };
}

export function updateSideJobs(game, dt, storyDone) {
  const p = game.player;
  const loc = L(game);
  if (!game.side) {
    // Offer a fare when the player rolls up to the cab stand in any car.
    if (p.car && atPoint(game, loc.taxiStand.x, loc.taxiStand.y, 70)) {
      const dest = randomDest(game, 'cafe');
      game.side = { kind: 'taxi', stage: 'pickup', x: 0, y: 0, dest, t: 0, passenger: game.spawnPassenger() };
      game.showBanner('TAXI FARE', `Pick up your passenger, then take them to ${dest.name}`);
    } else if (!p.car && atPoint(game, loc.courier.x, loc.courier.y, 54)) {
      const dest = randomDest(game, 'warehouse');
      const dist = Math.hypot(dest.x - loc.courier.x, dest.y - loc.courier.y);
      game.side = { kind: 'courier', stage: 'deliver', dest, t: dist / 95 + 25 };
      game.showBanner('COURIER RUN', `Deliver the parcel to ${dest.name} — fast pays double`);
      game.audio?.pickup?.();
    }
    return;
  }
  const s = game.side;
  if (s.kind === 'taxi') {
    if (s.stage === 'pickup') {
      const ped = s.passenger;
      if (!ped || ped.dead) { game.side = null; return; }
      setObjective(game, ped.x, ped.y, 'Pick up your passenger');
      if (p.car && Math.abs(p.car.speed) < 24 && atPoint(game, ped.x, ped.y, 56)) {
        ped.dead = true; // they climb in; the ped leaves the street
        s.stage = 'deliver';
        s.t = Math.hypot(s.dest.x - ped.x, s.dest.y - ped.y) / 90 + 30;
        game.audio?.blip?.();
      }
    } else {
      s.t -= dt;
      setObjective(game, s.dest.x, s.dest.y, `Fare: ${s.dest.name}${s.t > 0 ? ` — ${Math.ceil(s.t)}s for a tip` : ''}`);
      if (p.car && Math.abs(p.car.speed) < 24 && atPoint(game, s.dest.x, s.dest.y, 62)) {
        const fare = 26 + Math.round(Math.hypot(s.dest.x - loc.taxiStand.x, s.dest.y - loc.taxiStand.y) / 30);
        const tip = s.t > 0 ? Math.round(fare * 0.5) : 0;
        game.addCash(fare + tip);
        game.stats.fares += 1;
        game.showBanner('FARE PAID', `$${fare}${tip ? ` + $${tip} tip` : ''}`);
        game.audio?.cash?.();
        game.side = null;
        game.saveGame();
      }
    }
    return;
  }
  // courier
  s.t -= dt;
  setObjective(game, s.dest.x, s.dest.y, `Parcel for ${s.dest.name} — ${Math.max(0, Math.ceil(s.t))}s`);
  if (s.t <= 0) {
    game.showBanner('TOO SLOW', 'The parcel goes back. Bay City Couriers has more.');
    game.audio?.fail?.();
    game.side = null;
    return;
  }
  if (atPoint(game, s.dest.x, s.dest.y, 54)) {
    const pay = s.t > 20 ? 90 : 55;
    game.addCash(pay);
    game.stats.parcels += 1;
    game.showBanner('DELIVERED', `+$${pay}`);
    game.audio?.cash?.();
    game.side = null;
    game.saveGame();
  }
}
