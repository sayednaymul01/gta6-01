// The four screenshot scenes behind ?shot=cover|city|heist|title. Each arranges a real
// moment — the chase, the meeting, the robbery — and then plays the actual simulation
// forward for a few seconds under a simple autopilot, so the frame is the game as it is
// really played, and the same seed always stages the same frame.

import { STAR_HEAT, angleDelta, clamp, dist } from './config.js';
import { placeById, streetX, streetY } from './city.js';
import { addGuard, step } from './world.js';
import { stepMissions } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const IDLE = {
  mx: 0, my: 0, sprint: false, punch: false, shoot: false, aim: null,
  enterPressed: false, interactPressed: false, throttle: 0, steer: 0,
};

/** Run the world (and the story, when asked) forward under one control for a while. */
function play(world, missions, seconds, control, withMissions = true) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    const c = typeof control === 'function' ? control(i) : control;
    step(world, 1 / 60, c);
    if (withMissions && missions) stepMissions(world, missions, 1 / 60, c);
  }
}

/** The cover: a five-star chase down the coast road in the vermilion GT, sea alongside. */
function stageCover(world, missions) {
  const p = world.player;
  // Put the player in the GT (any parked car, repainted and renamed for the scene).
  const car = world.cars.find((c) => c.kind === 'parked');
  car.colour = '#e0342b';
  car.name = 'Vermilion GT';
  car.x = streetX(9);
  car.y = streetY(0) + 70;
  car.angle = Math.PI / 2;
  car.speed = 300;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.cash = 1240;
  world.heat = STAR_HEAT * 4 + 60;
  world.stars = 5;
  missions.index = 2;
  missions.phase = 'active';
  missions.objective = 'Beach Run: checkpoint 3 of 6 — 41s left';
  missions.marker = { x: streetX(9), y: streetY(3) };
  missions.lines = [{ speaker: 'You', text: 'Half the force is behind me. The coast road is mine — keep it pinned.' }];
  missions.lineT = 99;
  // The autopilot holds the coast road: aim a little east or west of due south, as the
  // car's offset from the centre line asks, and steer toward that heading.
  const drive = () => {
    const desired = Math.PI / 2 - clamp((streetX(9) - car.x) / 110, -0.5, 0.5);
    return { ...IDLE, throttle: 1, steer: clamp(angleDelta(car.angle, desired) * 1.6, -1, 1) };
  };
  play(world, null, 3.4, drive, false);
  // Frame the pursuit: the two nearest police cars drop into the lane behind the GT,
  // close enough to read as a chase, and the run plays on for a breath.
  const cops = world.cars
    .filter((c) => c.kind === 'police')
    .sort((a, b) => dist(a.x, a.y, car.x, car.y) - dist(b.x, b.y, car.x, car.y));
  cops.forEach((cop, i) => {
    cop.x = car.x - 13 + i * 29;
    cop.y = car.y - 108 - i * 96;
    cop.angle = Math.PI / 2;
    cop.speed = 288;
    cop.nav = null;
  });
  if (p.car !== car) p.car = car;
  p.bust = 0;
  world.heat = STAR_HEAT * 4 + 60;
  world.stars = 5;
  play(world, null, 0.8, drive, false);
  return SCREEN_PLAY;
}

/** The meeting: on foot outside the Solace Diner, Dario talking, the town alive around. */
function stageCity(world, missions) {
  const p = world.player;
  p.cash = 60;
  play(world, missions, 2.5, IDLE);
  missions.lines = [{
    speaker: 'Dario',
    text: 'Dario Fenn. I move things across this town, and I need a driver who does not ask what is in the box.',
  }];
  missions.lineT = 99;
  return SCREEN_PLAY;
}

/** The robbery: the vault half empty, guards closing in, the alarm already raised. */
function stageHeist(world, missions) {
  const city = world.city;
  const bank = placeById(city, 'bank');
  const vault = { x: bank.x + bank.w / 2, y: bank.y - 34 };
  const p = world.player;
  p.x = vault.x + 8;
  p.y = vault.y + 6;
  p.cash = 860;
  p.armour = 40;
  addGuard(world, bank.door.x - 52, bank.door.y - 6);
  addGuard(world, bank.door.x + 52, bank.door.y - 6);
  for (const g of world.guards) g.hostile = true;
  world.heat = STAR_HEAT * 3 + 20;
  world.stars = 4;
  missions.index = 4;
  missions.phase = 'active';
  missions.loot = 0.62;
  missions.objective = 'Emptying the vault — hold your ground…';
  missions.marker = { x: vault.x, y: vault.y };
  missions.lines = [{ speaker: 'Alarm', text: 'The bank alarm is screaming. Hold on and fill the bag.' }];
  missions.lineT = 99;
  play(world, null, 2.2, IDLE, false);
  // The guards have closed in on the vault by now: bring them round the back of the bank,
  // and a patrol car onto the street above, then let the standoff breathe for half a second.
  const [g1, g2] = world.guards;
  if (g1) { g1.x = vault.x - 96; g1.y = vault.y + 34; }
  if (g2) { g2.x = vault.x + 102; g2.y = vault.y + 26; }
  const cop = world.cars.find((c) => c.kind === 'police');
  if (cop) {
    cop.x = vault.x - 210;
    cop.y = streetY(2);
    cop.angle = 0;
    cop.speed = 60;
  }
  play(world, null, 0.5, IDLE, false);
  missions.loot = 0.62; // the staging above is the moment the shot names
  return SCREEN_PLAY;
}

/** The title: the living city idling behind the menu. */
function stageTitle(world, missions) {
  play(world, null, 4, IDLE, false);
  return SCREEN_TITLE;
}

/** Stage the named scene on a fresh world and return the screen to draw over it. */
export function stageShot(name, world, missions) {
  if (name === 'city') return stageCity(world, missions);
  if (name === 'heist') return stageHeist(world, missions);
  if (name === 'title') return stageTitle(world, missions);
  return stageCover(world, missions);
}
