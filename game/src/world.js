// The living world of Port Solace: the player, traffic that follows the streets, parked cars
// waiting to be stolen, pedestrians, guards, foot officers and the police who answer the
// wanted level. Pure simulation — no DOM, no canvas — stepped at a fixed 1/60 s by main.js
// in the browser and by the headless checks in Node. Rendering reads this state; it never
// writes it.

import {
  BEACH_X, CAR_COLOURS, GT_COLOUR, HEAT_DECAY, MAX_STARS, PED_SHIRTS, PLAYER_ARMOUR,
  PLAYER_HEALTH, PLAYER_RADIUS, REPAINT_COST, ROAD, SPRINT_SPEED, STAR_HEAT, WALK_SPEED,
  angleDelta, clamp, dist,
} from './config.js';
import {
  buildCity, groundFactor, nearestIntersection, placeById, resolveCollision, streetX, streetY,
} from './city.js';
import { chance, intRange, pick, range } from './random.js';

export const EVENT_BUSTED = 1;
export const EVENT_WASTED = 2;

const CAR_RADIUS = 25;
const TRAFFIC_TARGET = 9;
const PED_TARGET = 26;

let nextId = 1;

function makeCar(x, y, angle, colour, kind) {
  return {
    id: nextId++, x, y, angle, speed: 0, colour, kind,
    hp: 100, nav: null, wait: 0, emptied: 0, missionTarget: false, name: '',
  };
}

/** The next intersection a road-following car heads for. */
function chooseNextNav(rng, car, city, toward) {
  const here = nearestIntersection(car.x, car.y);
  const options = [];
  if (here.i > 0) options.push({ i: here.i - 1, j: here.j });
  if (here.i < 9) options.push({ i: here.i + 1, j: here.j });
  if (here.j > 0) options.push({ i: here.i, j: here.j - 1 });
  if (here.j < 7) options.push({ i: here.i, j: here.j + 1 });
  let best = options[0];
  if (toward) {
    let bestScore = Infinity;
    for (const o of options) {
      const d = dist(streetX(o.i), streetY(o.j), toward.x, toward.y);
      const score = d + (car.nav && o.i === car.nav.i && o.j === car.nav.j ? 400 : 0) + rng() * 30;
      if (score < bestScore) { bestScore = score; best = o; }
    }
  } else {
    best = pick(rng, options);
  }
  car.nav = { i: best.i, j: best.j, x: streetX(best.i), y: streetY(best.j) };
}

/** Steer a car toward a point with a turn limit; returns the heading error. */
function steerToward(car, tx, ty, dt, turnRate) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const delta = angleDelta(car.angle, want);
  const maxTurn = turnRate * dt * clamp(Math.abs(car.speed) / 120, 0.35, 1);
  car.angle += clamp(delta, -maxTurn, maxTurn);
  return delta;
}

/** Create the whole world from a seed. */
export function createWorld(rng) {
  const city = buildCity(rng);
  const world = {
    city, rng, time: 0,
    player: {
      x: placeById(city, 'diner').door.x, y: placeById(city, 'diner').door.y + 30,
      angle: -Math.PI / 2, health: PLAYER_HEALTH, armour: 0, cash: 60,
      car: null, ammo: 24, punchCd: 0, shootCd: 0, bust: 0, lastCrimeAt: -99,
      packagesFound: 0, dead: false,
    },
    cars: [], peds: [], officers: [], guards: [], pickups: [], packages: [],
    heat: 0, stars: 0, fx: [], tracers: [],
    policeTimer: 0, trafficTimer: 0, pickupTimer: 0,
    stats: { steals: 0, punches: 0, shots: 0, earned: 0 },
  };
  // Parked cars fill most of the marked spots; the rest stay empty kerb.
  for (const spot of city.parkedSpots) {
    if (chance(rng, 0.28)) continue;
    world.cars.push(makeCar(spot.x, spot.y, spot.angle, pick(rng, CAR_COLOURS), 'parked'));
  }
  for (let i = 0; i < PED_TARGET; i += 1) world.peds.push(spawnPed(world));
  for (let i = 0; i < 7; i += 1) spawnTraffic(world, true);
  for (const spot of city.packageSpots) world.packages.push({ ...spot, taken: false });
  const diner = placeById(city, 'diner');
  const hospital = placeById(city, 'hospital');
  const police = placeById(city, 'police');
  const club = placeById(city, 'club');
  const marina = placeById(city, 'marina');
  world.pickups.push(
    { kind: 'health', x: hospital.door.x, y: hospital.door.y, amount: 60, taken: false, timer: 0 },
    { kind: 'health', x: diner.door.x + 30, y: diner.door.y, amount: 40, taken: false, timer: 0 },
    { kind: 'armour', x: police.door.x - 44, y: police.door.y + 10, amount: 60, taken: false, timer: 0 },
    { kind: 'armour', x: marina.door.x, y: marina.door.y + 34, amount: 60, taken: false, timer: 0 },
    { kind: 'ammo', x: club.door.x - 40, y: club.door.y + 6, amount: 18, taken: false, timer: 0 },
    { kind: 'cash', x: marina.door.x + 26, y: marina.door.y - 20, amount: 40, taken: false, timer: 0 },
  );
  return world;
}

/** A pedestrian at a random kerbside, walking. */
function spawnPed(world) {
  const { city, rng } = world;
  const spot = nearestIntersection(range(rng, 200, 3000), range(rng, 200, 2200));
  const x = spot.x + range(rng, -ROAD / 2 - 16, ROAD / 2 + 16);
  const y = spot.y + range(rng, -ROAD / 2 - 16, ROAD / 2 + 16);
  return {
    id: nextId++, x, y, angle: range(rng, 0, Math.PI * 2), speed: 0,
    hp: 30, state: 'walk', timer: range(rng, 1, 4), tx: x, ty: y,
    shirt: pick(rng, PED_SHIRTS), downT: 0,
  };
}

/** A traffic car at an intersection away from the player, already rolling. */
function spawnTraffic(world, anywhere = false) {
  const { rng, player } = world;
  for (let tries = 0; tries < 8; tries += 1) {
    const spot = nearestIntersection(range(rng, 240, 3100), range(rng, 240, 2300));
    if (!anywhere && dist(spot.x, spot.y, player.x, player.y) < 480) continue;
    const car = makeCar(spot.x, spot.y, 0, pick(rng, CAR_COLOURS), 'traffic');
    car.speed = 120;
    chooseNextNav(rng, car, world.city, null);
    car.angle = Math.atan2(car.nav.y - car.y, car.nav.x - car.x);
    world.cars.push(car);
    return car;
  }
  return null;
}

/** A police car joins the hunt from a street corner a few blocks away. */
function spawnPolice(world) {
  const { rng, player } = world;
  const spot = nearestIntersection(
    clamp(player.x + pick(rng, [-640, 640, -420, 420]), 200, 3100),
    clamp(player.y + pick(rng, [-520, 520, -380, 380]), 200, 2300),
  );
  const car = makeCar(spot.x, spot.y, 0, '#f2f4f6', 'police');
  chooseNextNav(rng, car, world.city, player);
  car.angle = Math.atan2(car.nav.y - car.y, car.nav.x - car.x);
  world.cars.push(car);
  return car;
}

/** A guard posted at (x, y): bank and motel security, added by the missions. */
export function addGuard(world, x, y) {
  const guard = {
    id: nextId++, x, y, angle: range(world.rng, 0, Math.PI * 2), speed: 0,
    hp: 60, state: 'patrol', timer: 0, tx: x, ty: y, post: { x, y },
    shootCd: range(world.rng, 0.4, 1), hostile: false,
  };
  world.guards.push(guard);
  return guard;
}

/** A named special car (the vermilion GT) parked at a spot, for the story. */
export function spawnSpecialCar(world, x, y, angle, colour, name) {
  const car = makeCar(x, y, angle, colour, 'parked');
  car.name = name;
  car.missionTarget = true;
  world.cars.push(car);
  return car;
}

/** Is a crime at (x, y) seen or heard? radius covers eyes; gunfire carries further. */
function witnessed(world, x, y, radius) {
  for (const ped of world.peds) if (ped.state !== 'down' && dist(x, y, ped.x, ped.y) < radius) return true;
  for (const o of world.officers) if (dist(x, y, o.x, o.y) < radius + 60) return true;
  for (const car of world.cars) if (car.kind === 'police' && dist(x, y, car.x, car.y) < radius + 60) return true;
  return false;
}

/** Add heat for a crime; unwitnessed crimes are free. Returns the stars now showing. */
export function addHeat(world, amount, x, y, loud = false) {
  if (!witnessed(world, x, y, loud ? 520 : 280)) return world.stars;
  world.heat = clamp(world.heat + amount, 0, STAR_HEAT * MAX_STARS);
  world.player.lastCrimeAt = world.time;
  world.stars = world.heat <= 0 ? 0 : Math.min(MAX_STARS, Math.ceil(world.heat / STAR_HEAT));
  return world.stars;
}

/** Pay the player and keep the lifetime total the save file reports. */
export function giveCash(world, amount) {
  world.player.cash += amount;
  if (amount > 0) world.stats.earned += amount;
  world.fx.push('cash');
}

/**
 * Advance the world one tick. control is the player's intent this tick:
 * {mx, my} a move vector on foot, {throttle, steer} in a car, and the edge-triggered
 * booleans enterPressed, interactPressed, plus held punch / shoot and an aim angle.
 * Returns a bitmask of EVENT_* for the screens main.js owns (busted, wasted).
 */
export function step(world, dt, control) {
  world.time += dt;
  let events = 0;
  updatePlayer(world, dt, control);
  events |= updateConsequences(world, dt);
  for (const car of world.cars) {
    if (car === world.player.car) continue;
    if (car.kind === 'traffic') updateTrafficCar(world, car, dt);
    else if (car.kind === 'police') updatePoliceCar(world, car, dt);
  }
  separateCars(world);
  for (const ped of world.peds) updatePed(world, ped, dt);
  for (const guard of world.guards) updateGuard(world, guard, dt);
  for (const officer of world.officers) updateOfficer(world, officer, dt);
  updateSpawning(world, dt);
  updatePickups(world, dt);
  for (const t of world.tracers) t.life -= dt;
  world.tracers = world.tracers.filter((t) => t.life > 0);
  // Heat bleeds away only while nobody in uniform is close enough to watch.
  const watched = world.officers.some((o) => dist(o.x, o.y, world.player.x, world.player.y) < 430)
    || world.cars.some((c) => c.kind === 'police' && dist(c.x, c.y, world.player.x, world.player.y) < 430);
  if (!watched && world.time - world.player.lastCrimeAt > 3 && world.heat > 0) {
    world.heat = Math.max(0, world.heat - HEAT_DECAY * 2.2 * dt);
    world.stars = world.heat <= 0 ? 0 : Math.min(MAX_STARS, Math.ceil(world.heat / STAR_HEAT));
  }
  return events;
}

/** Integrate one free car (the player's, or one rolling after a crash) and collide it. */
function rollCar(world, car, dt) {
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const before = car.speed;
  if (!resolveCollision(world.city, car, CAR_RADIUS)) return;
  if (Math.abs(before) > 190) {
    car.speed *= 0.35;
    if (car === world.player.car) hurtPlayer(world, (Math.abs(before) - 190) * 0.05, 'crash');
  } else {
    car.speed *= 0.8;
  }
}

/** Traffic: follow the streets, brake for company, stop for a pedestrian in the road. */
function updateTrafficCar(world, car, dt) {
  const { rng } = world;
  if (!car.nav) chooseNextNav(rng, car, world.city, null);
  const d = dist(car.x, car.y, car.nav.x, car.nav.y);
  if (d < 46) chooseNextNav(rng, car, world.city, null);
  steerToward(car, car.nav.x, car.nav.y, dt, 2.4);
  let target = 168 * groundFactor(world.city, car.x, car.y);
  for (const other of world.cars) {
    if (other === car) continue;
    const ahead = dist(car.x + Math.cos(car.angle) * 52, car.y + Math.sin(car.angle) * 52, other.x, other.y);
    if (ahead < 40) target = Math.min(target, Math.max(0, other.speed - 10));
  }
  const p = world.player;
  if (!p.car && dist(car.x + Math.cos(car.angle) * 58, car.y + Math.sin(car.angle) * 58, p.x, p.y) < 30) target = 0;
  car.speed += clamp(target - car.speed, -320 * dt, 130 * dt);
  rollCar(world, car, dt);
}

/**
 * Police: follow the streets toward the player while far, charge straight at them when
 * close, and stop to let officers out when the player is on foot and cornered.
 */
function updatePoliceCar(world, car, dt) {
  const p = world.player;
  const d = dist(car.x, car.y, p.x, p.y);
  if (world.stars === 0) {
    // No longer wanted: the hunt is off, the car leaves the world quietly.
    if (d > 700) car.dead = true;
    car.speed += clamp(120 - car.speed, -200 * dt, 100 * dt);
    if (!car.nav) chooseNextNav(world.rng, car, world.city, null);
    steerToward(car, car.nav.x, car.nav.y, dt, 2.2);
    rollCar(world, car, dt);
    return;
  }
  if (car.emptied > 0) {
    car.emptied -= dt;
    car.speed += clamp(0 - car.speed, -300 * dt, 0);
    rollCar(world, car, dt);
    return;
  }
  const topSpeed = (225 + world.stars * 26) * groundFactor(world.city, car.x, car.y);
  if (d > 250) {
    if (!car.nav || dist(car.x, car.y, car.nav.x, car.nav.y) < 46) chooseNextNav(world.rng, car, world.city, p);
    steerToward(car, car.nav.x, car.nav.y, dt, 2.6);
    car.speed += clamp(topSpeed - car.speed, -280 * dt, 190 * dt);
  } else {
    steerToward(car, p.x, p.y, dt, 2.1);
    const want = !p.car && d < 74 ? 0 : topSpeed * (d < 60 ? 0.45 : 1);
    car.speed += clamp(want - car.speed, -340 * dt, 190 * dt);
    if (!p.car && d < 78 && Math.abs(car.speed) < 30 && world.officers.length < 6) {
      // Cornered on foot: two officers pile out and the car waits with them.
      for (let i = 0; i < 2; i += 1) {
        world.officers.push({
          id: nextId++, x: car.x + range(world.rng, -20, 20), y: car.y + range(world.rng, -20, 20),
          angle: car.angle, speed: 0, hp: 50, shootCd: 0,
        });
      }
      car.emptied = 7;
    }
  }
  rollCar(world, car, dt);
  if (p.car === null && d < CAR_RADIUS + 16 && Math.abs(car.speed) > 120) {
    hurtPlayer(world, 9, 'rammed');
    car.speed *= 0.5;
  }
}

/** Keep cars from occupying the same tarmac: a soft push apart, parked ones stay put. */
function separateCars(world) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const d = dist(a.x, a.y, b.x, b.y);
      if (d === 0 || d >= CAR_RADIUS * 2) continue;
      const push = (CAR_RADIUS * 2 - d) / 2;
      const nx = (b.x - a.x) / d;
      const ny = (b.y - a.y) / d;
      if (a.kind !== 'parked' || a === world.player.car) { a.x -= nx * push; a.y -= ny * push; }
      if (b.kind !== 'parked' || b === world.player.car) { b.x += nx * push; b.y += ny * push; }
      if (a === world.player.car || b === world.player.car) {
        const other = a === world.player.car ? b : a;
        if (Math.abs(other.speed) > 60) other.speed *= 0.6;
      }
    }
  }
}

/** Hurt the player: armour soaks most of a hit before health feels it. */
export function hurtPlayer(world, amount, source) {
  const p = world.player;
  if (p.dead || amount <= 0) return;
  const soaked = Math.min(p.armour, amount * 0.65);
  p.armour -= soaked;
  p.health -= amount - soaked;
  world.fx.push('hurt');
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
  }
}

/** The player: on foot, or driving the car they sit in. */
function updatePlayer(world, dt, control) {
  const p = world.player;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  if (p.car) {
    const car = p.car;
    const top = (car.name === 'Vermilion GT' ? 398 : 348) * groundFactor(world.city, car.x, car.y);
    const throttle = control.throttle ?? 0;
    const steer = control.steer ?? 0;
    if (throttle > 0) car.speed += 265 * throttle * dt * (car.speed < 0 ? 2.2 : 1);
    else if (throttle < 0) car.speed += 300 * throttle * dt * (car.speed > 0 ? 2.4 : 0.55);
    else car.speed -= car.speed * 0.55 * dt;
    car.speed = clamp(car.speed, -128, top);
    if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;
    car.angle += steer * 2.35 * dt * clamp(car.speed / 150, -1, 1);
    rollCar(world, car, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    updateGarage(world, dt);
    if (control.enterPressed) exitCar(world);
    return;
  }
  const mag = Math.hypot(control.mx ?? 0, control.my ?? 0);
  if (mag > 0.01) {
    const speed = control.sprint ? SPRINT_SPEED : WALK_SPEED;
    const nx = (control.mx / mag) * Math.min(1, mag);
    const ny = (control.my / mag) * Math.min(1, mag);
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.angle = Math.atan2(ny, nx);
  }
  if (control.aim != null && (control.shoot || mag < 0.01)) p.angle = control.aim;
  resolveCollision(world.city, p, PLAYER_RADIUS);
  if (control.enterPressed) tryEnterCar(world);
  if (control.punch && p.punchCd <= 0) doPunch(world);
  if (control.shoot && p.shootCd <= 0) doShoot(world, control);
}

/** Step into the nearest car: a theft when it is not already yours to take quietly. */
function tryEnterCar(world) {
  const p = world.player;
  let best = null;
  let bestD = 56;
  for (const car of world.cars) {
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return;
  if (best.kind === 'traffic') {
    // The driver bails out and runs; the street notices.
    const driver = spawnPed(world);
    driver.x = best.x + 24;
    driver.y = best.y + 10;
    driver.state = 'flee';
    driver.timer = 3.5;
    world.peds.push(driver);
    addHeat(world, 22, p.x, p.y);
    world.stats.steals += 1;
    world.fx.push('steal');
  } else if (best.kind === 'parked') {
    addHeat(world, 14, p.x, p.y);
    world.stats.steals += 1;
    world.fx.push('steal');
  }
  p.car = best;
  best.speed = Math.min(best.speed, 40);
}

/** Climb out; the car is left parked where it stands (a police car rejoins the hunt). */
function exitCar(world) {
  const p = world.player;
  const car = p.car;
  if (!car) return;
  if (car.kind === 'traffic') car.kind = 'parked';
  car.speed = 0;
  p.car = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 32;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 32;
  resolveCollision(world.city, p, PLAYER_RADIUS);
}

/** The repaint bay: sit in Rusty's garage and the stars wash off, for a price. */
function updateGarage(world, dt) {
  const p = world.player;
  const garage = placeById(world.city, 'garage');
  const bay = { x: garage.x - 58, y: garage.y + 10, w: 52, h: garage.h - 20 };
  const inside = p.car && p.x > bay.x && p.x < bay.x + bay.w && p.y > bay.y && p.y < bay.y + bay.h;
  if (!inside || world.stars === 0) {
    p.garageT = 0;
    return;
  }
  p.garageT = (p.garageT ?? 0) + dt;
  if (p.garageT > 2.2) {
    const charge = Math.min(p.cash, REPAINT_COST);
    p.cash -= charge;
    world.heat = 0;
    world.stars = 0;
    p.garageT = 0;
    world.fx.push('repaint');
  }
}

/** A swung fist: whoever stands in front of the player takes it. */
function doPunch(world) {
  const p = world.player;
  p.punchCd = 0.35;
  world.stats.punches += 1;
  world.fx.push('punch');
  const reach = 38;
  const tx = p.x + Math.cos(p.angle) * reach;
  const ty = p.y + Math.sin(p.angle) * reach;
  let hit = false;
  for (const target of [...world.peds, ...world.guards, ...world.officers]) {
    if (target.state === 'down' || target.gone) continue;
    if (dist(tx, ty, target.x, target.y) < 24) {
      damagePerson(world, target, 34, p.angle);
      hit = true;
    }
  }
  if (hit) addHeat(world, 12, p.x, p.y);
}

/** A pistol shot along the aim: the first body or car on the line takes it. */
function doShoot(world, control) {
  const p = world.player;
  if (p.ammo <= 0) {
    p.shootCd = 0.3;
    world.fx.push('click');
    return;
  }
  p.shootCd = 0.22;
  p.ammo -= 1;
  world.stats.shots += 1;
  world.lastShotAt = world.time;
  world.fx.push('shot');
  const aim = control.aim ?? p.angle;
  const rangeMax = 430;
  let bestT = rangeMax;
  let bestTarget = null;
  let bestKind = null;
  const consider = (target, radius, kind) => {
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const along = dx * Math.cos(aim) + dy * Math.sin(aim);
    if (along < 8 || along > rangeMax) return;
    const across = Math.abs(-dx * Math.sin(aim) + dy * Math.cos(aim));
    if (across > radius + 4) return;
    if (along < bestT) { bestT = along; bestTarget = target; bestKind = kind; }
  };
  for (const ped of world.peds) if (ped.state !== 'down') consider(ped, 12, 'person');
  for (const g of world.guards) if (!g.gone && g.state !== 'down') consider(g, 12, 'person');
  for (const o of world.officers) consider(o, 12, 'person');
  for (const car of world.cars) consider(car, 27, 'car');
  const endX = p.x + Math.cos(aim) * bestT;
  const endY = p.y + Math.sin(aim) * bestT;
  world.tracers.push({ x1: p.x + Math.cos(aim) * 16, y1: p.y + Math.sin(aim) * 16, x2: endX, y2: endY, life: 0.07 });
  if (bestTarget && bestKind === 'person') damagePerson(world, bestTarget, 40, aim);
  else if (bestTarget && bestKind === 'car') bestTarget.hp -= 12;
  addHeat(world, 16, p.x, p.y, true);
}

/** Shared hurt for peds, guards and officers: knockback, falling, and the heat of it. */
function damagePerson(world, target, amount, fromAngle) {
  target.hp -= amount;
  target.x += Math.cos(fromAngle) * 7;
  target.y += Math.sin(fromAngle) * 7;
  if (target.hp > 0) {
    if ('state' in target && target.state !== 'down') {
      target.state = 'flee';
      target.timer = 2.6;
    }
    if ('hostile' in target) target.hostile = true;
    return;
  }
  target.state = 'down';
  target.downT = 9;
  if ('hostile' in target) addHeat(world, 55, target.x, target.y, true);
  else if ('post' in target) addHeat(world, 55, target.x, target.y, true);
  else if (world.officers.includes(target)) addHeat(world, 50, target.x, target.y, true);
  else addHeat(world, 30, target.x, target.y);
}

/** Pedestrians stroll the kerbs, flee trouble, and get up again after a fall. */
function updatePed(world, ped, dt) {
  const p = world.player;
  if (ped.state === 'down') {
    ped.downT -= dt;
    if (ped.downT <= 0) {
      const fresh = spawnPed(world);
      Object.assign(ped, fresh, { id: ped.id });
    }
    return;
  }
  // Run over: any fast car, the player's above all, puts a pedestrian down.
  for (const car of world.cars) {
    if (Math.abs(car.speed) > 55 && dist(car.x, car.y, ped.x, ped.y) < 23) {
      ped.state = 'down';
      ped.downT = 9;
      ped.hp = 0;
      if (car === p.car) {
        addHeat(world, 55, ped.x, ped.y);
        world.fx.push('thud');
      }
      return;
    }
  }
  const shotScare = world.time - (world.lastShotAt ?? -99) < 0.6 && dist(p.x, p.y, ped.x, ped.y) < 250;
  if (shotScare || (p.car && Math.abs(p.car.speed) > 200 && dist(p.car.x, p.car.y, ped.x, ped.y) < 90)) {
    ped.state = 'flee';
    ped.timer = 2.4;
  }
  if (ped.state === 'flee') {
    ped.timer -= dt;
    const away = Math.atan2(ped.y - p.y, ped.x - p.x);
    ped.angle = away;
    ped.x += Math.cos(away) * 205 * dt;
    ped.y += Math.sin(away) * 205 * dt;
    if (ped.timer <= 0) ped.state = 'walk';
  } else {
    if (dist(ped.x, ped.y, ped.tx, ped.ty) < 14 || (ped.timer -= dt) <= 0) {
      const near = nearestIntersection(ped.x + range(world.rng, -500, 500), ped.y + range(world.rng, -500, 500));
      ped.tx = near.x + range(world.rng, -ROAD / 2 - 14, ROAD / 2 + 14);
      ped.ty = near.y + range(world.rng, -ROAD / 2 - 14, ROAD / 2 + 14);
      ped.timer = range(world.rng, 6, 14);
    }
    const want = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    ped.angle += clamp(angleDelta(ped.angle, want), -6 * dt, 6 * dt);
    ped.x += Math.cos(ped.angle) * 68 * dt;
    ped.y += Math.sin(ped.angle) * 68 * dt;
  }
  resolveCollision(world.city, ped, 11);
}

/** Guards keep their post until provoked; then they keep their distance and shoot. */
function updateGuard(world, guard, dt) {
  const p = world.player;
  if (guard.state === 'down') {
    guard.downT -= dt;
    if (guard.downT <= 0) guard.gone = true;
    return;
  }
  const d = dist(guard.x, guard.y, p.x, p.y);
  const shotNear = world.time - (world.lastShotAt ?? -99) < 1.2 && d < 520;
  if (shotNear || (d < 120 && world.stars >= 2) || (d < 56 && p.punchCd > 0.2)) guard.hostile = true;
  if (!guard.hostile) {
    guard.timer -= dt;
    if (guard.timer <= 0) {
      guard.tx = guard.post.x + range(world.rng, -42, 42);
      guard.ty = guard.post.y + range(world.rng, -42, 42);
      guard.timer = range(world.rng, 2.5, 5);
    }
    movePerson(world, guard, 52, dt);
    return;
  }
  // Hostile: hold a firing range, step closer or back off to keep it, and shoot.
  const want = Math.atan2(p.y - guard.y, p.x - guard.x);
  guard.angle = want;
  if (d > 195) movePerson(world, guard, 128, dt, p.x, p.y);
  else if (d < 110) movePerson(world, guard, 110, dt, guard.x * 2 - p.x, guard.y * 2 - p.y);
  guard.shootCd -= dt;
  if (guard.shootCd <= 0 && d < 300) {
    guard.shootCd = range(world.rng, 0.8, 1.25);
    const hitChance = clamp(0.62 - d / 700, 0.18, 0.6);
    const spread = world.rng() < hitChance ? 6 : range(world.rng, 26, 60);
    world.tracers.push({
      x1: guard.x, y1: guard.y,
      x2: p.x + range(world.rng, -spread, spread), y2: p.y + range(world.rng, -spread, spread),
      life: 0.07,
    });
    world.fx.push('shot');
    if (spread <= 6) hurtPlayer(world, range(world.rng, 5, 10), 'shot');
  }
}

/** Foot officers run the player down and hold them for the bust; they never shoot. */
function updateOfficer(world, officer, dt) {
  const p = world.player;
  if (officer.state === 'down') {
    officer.downT -= dt;
    if (officer.downT <= 0) officer.gone = true;
    return;
  }
  if (world.stars === 0) {
    officer.gone = dist(officer.x, officer.y, p.x, p.y) > 60;
    return;
  }
  const tx = p.car ? p.car.x : p.x;
  const ty = p.car ? p.car.y : p.y;
  const d = dist(officer.x, officer.y, tx, ty);
  if (d > 430) {
    officer.gone = true;
    return;
  }
  movePerson(world, officer, 197, dt, tx, ty);
}

/** Walk a person toward (tx, ty) at a speed, turning smoothly, buildings permitting. */
function movePerson(world, who, speed, dt, tx = who.tx, ty = who.ty) {
  const want = Math.atan2(ty - who.y, tx - who.x);
  who.angle += clamp(angleDelta(who.angle, want), -7 * dt, 7 * dt);
  if (dist(who.x, who.y, tx, ty) > 8) {
    who.x += Math.cos(who.angle) * speed * dt;
    who.y += Math.sin(who.angle) * speed * dt;
  }
  resolveCollision(world.city, who, 11);
}

/** Spawning and despawning: traffic flows, police answer the stars, pickups return. */
function updateSpawning(world, dt) {
  world.cars = world.cars.filter((c) => !c.dead);
  world.officers = world.officers.filter((o) => !o.gone);
  world.guards = world.guards.filter((g) => !g.gone);
  world.trafficTimer -= dt;
  if (world.trafficTimer <= 0) {
    world.trafficTimer = 1.1;
    const traffic = world.cars.filter((c) => c.kind === 'traffic');
    if (traffic.length < TRAFFIC_TARGET) spawnTraffic(world);
    for (const car of traffic) {
      if (car !== world.player.car && dist(car.x, car.y, world.player.x, world.player.y) > 1550) car.dead = true;
    }
  }
  world.policeTimer -= dt;
  if (world.policeTimer <= 0) {
    world.policeTimer = 2.2;
    const desired = [0, 1, 2, 2, 3, 4][world.stars];
    const hunting = world.cars.filter((c) => c.kind === 'police').length;
    if (hunting < desired) spawnPolice(world);
  }
}

/** Pickups and the twenty hidden packages: walk (or roll) over one to take it. */
function updatePickups(world, dt) {
  const p = world.player;
  for (const pickup of world.pickups) {
    if (pickup.taken) {
      pickup.timer -= dt;
      if (pickup.timer <= 0) pickup.taken = false;
      continue;
    }
    if (dist(p.x, p.y, pickup.x, pickup.y) > 26) continue;
    pickup.taken = true;
    pickup.timer = 55;
    if (pickup.kind === 'health') p.health = Math.min(PLAYER_HEALTH, p.health + pickup.amount);
    else if (pickup.kind === 'armour') p.armour = Math.min(PLAYER_ARMOUR, p.armour + pickup.amount);
    else if (pickup.kind === 'ammo') p.ammo += pickup.amount;
    else if (pickup.kind === 'cash') giveCash(world, pickup.amount);
    world.fx.push('pickup');
  }
  for (const pack of world.packages) {
    if (pack.taken) continue;
    if (dist(p.x, p.y, pack.x, pack.y) <= 24) {
      pack.taken = true;
      p.packagesFound += 1;
      giveCash(world, 25);
      world.fx.push('package');
    }
  }
}

/** The bust meter and the flatline: what a tick can end with. */
function updateConsequences(world, dt) {
  const p = world.player;
  if (p.dead) return EVENT_WASTED;
  let threat = false;
  if (!p.car) {
    threat = world.officers.some((o) => o.state !== 'down' && dist(o.x, o.y, p.x, p.y) < 36)
      || world.cars.some((c) => c.kind === 'police' && dist(c.x, c.y, p.x, p.y) < 58);
  } else {
    threat = Math.abs(p.car.speed) < 30
      && world.cars.some((c) => c.kind === 'police' && c !== p.car && dist(c.x, c.y, p.x, p.y) < 62);
  }
  if (world.stars === 0) threat = false;
  p.bust = clamp(p.bust + (threat ? dt / 2.4 : -dt / 1.5), 0, 1);
  if (p.bust >= 1) return EVENT_BUSTED;
  return 0;
}

/** After a bust: a fine, a clean record, and the pavement outside the police station. */
export function applyBust(world) {
  const p = world.player;
  p.cash -= Math.min(p.cash, 150);
  if (p.car && p.car.kind === 'traffic') p.car.kind = 'parked';
  p.car = null;
  world.heat = 0;
  world.stars = 0;
  p.bust = 0;
  p.health = Math.max(p.health, 55);
  const station = placeById(world.city, 'police');
  p.x = station.door.x;
  p.y = station.door.y + 16;
  world.officers = [];
  world.fx.push('busted');
}

/** After a flatline: a hospital bill, full health, and half the heat forgotten. */
export function applyWasted(world) {
  const p = world.player;
  p.cash -= Math.min(p.cash, 100);
  if (p.car && p.car.kind === 'traffic') p.car.kind = 'parked';
  p.car = null;
  p.dead = false;
  p.health = PLAYER_HEALTH;
  p.bust = 0;
  world.heat = Math.floor(world.heat / 2);
  world.stars = world.heat <= 0 ? 0 : Math.min(MAX_STARS, Math.ceil(world.heat / STAR_HEAT));
  const hospital = placeById(world.city, 'hospital');
  p.x = hospital.door.x;
  p.y = hospital.door.y + 16;
  world.fx.push('wasted');
}

