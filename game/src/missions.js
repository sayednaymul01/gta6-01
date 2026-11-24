// The story of Port Solace: five jobs for the fixer Dario Fenn, who waits outside the
// Solace Diner. This module owns the mission state machine — offers, dialogue, objectives,
// checkpoints, the bank job's loot — and reads the world each tick; the world itself knows
// nothing of the story. main.js draws missions.marker and missions.objectiveText() on the
// HUD and calls missions.fail() when the player is busted or wasted mid-job.

import { GT_COLOUR, STAR_HEAT, clamp, dist } from './config.js';
import { placeById, streetX, streetY } from './city.js';
import { addGuard, addHeat, giveCash, spawnSpecialCar } from './world.js';

const DARIO_LINES = [
  null, // missions are 1-based in the story text below
  {
    title: 'First Errand', pay: 150,
    offer: 'Dario Fenn. I move things across this town, and I need a driver who does not ask what is in the box.',
    brief: 'Down at the Marina & Yacht Club a parcel is waiting for me. Bring it to The Velvet Anchor, and there is $150 in it for you.',
    done: 'On time and no questions. I like that. Come back when you want real money.',
  },
  {
    title: 'Hot Property', pay: 250,
    offer: 'A collector left a car in the south lot and forgot he owes me. The marked one — bring it to Rusty.',
    brief: 'Take the marked car and deliver it to Rusty\'s Repaint Garage. Gently, mind. Rusty hates dents almost as much as police.',
    done: 'Rusty sends his regards and a fresh coat of paint. $250, as agreed.',
  },
  {
    title: 'Beach Run', pay: 300,
    offer: 'A buyer at the marina wants proof this town can be crossed quickly. The coast road, top to bottom.',
    brief: 'Start at the north end of the coast road and hit every checkpoint down to the marina. Seventy-five seconds. Any car you like.',
    done: 'Fast and clean. The buyer is impressed, and so am I. $300.',
  },
  {
    title: 'The Vermilion GT', pay: 450,
    offer: 'At the Coral Court Motel sits a vermilion GT that belongs, morally, to me. Its owner hired guards who disagree.',
    brief: 'Steal the vermilion GT from the Coral Court Motel and bring it to the Neon Palms Hotel. The guards will object. Object back.',
    done: 'There she is. Vermilion, as promised. $450 — and keep her, you have earned the car.',
  },
  {
    title: 'The Neon Tide Job', pay: 800,
    offer: 'Last one, and it is the big one. Port Solace Bank keeps its vault light and its guards slow.',
    brief: 'Slip behind the bank, empty the vault, then lose the police however you can — Rusty\'s bay washes stars — and come back to me. $800.',
    done: 'The tide comes in, the tide goes out, and nobody saw a thing. $800. Port Solace is yours now, friend.',
  },
];

/** Where Dario stands: on the pavement outside his diner. */
export function darioSpot(world) {
  const diner = placeById(world.city, 'diner');
  return { x: diner.door.x - 34, y: diner.door.y + 8 };
}

/** Fresh mission state for a new game. */
export function createMissions(world) {
  return {
    index: 0, // 0..4 while the story runs; 5 when it is done
    phase: 'offer', // offer -> talk -> active; 'done' after the fifth job
    lines: [], lineT: 0,
    stage: 0, data: {},
    marker: null, objective: '',
    loot: 0,
  };
}

function say(missions, lines) {
  missions.lines = lines.map(([speaker, text]) => ({ speaker, text }));
  missions.lineT = 3.1;
}

/** The dialogue line on screen now, or null. */
export function currentLine(missions) {
  return missions.lines.length ? missions.lines[0] : null;
}

function setObjective(missions, text, x, y) {
  missions.objective = text;
  missions.marker = x == null ? null : { x, y };
}

/** Start the current mission's work after the talk at the diner. */
function beginJob(world, missions) {
  const job = DARIO_LINES[missions.index + 1];
  missions.phase = 'active';
  missions.stage = 0;
  missions.data = {};
  missions.loot = 0;
  const city = world.city;
  if (missions.index === 0) {
    const marina = placeById(city, 'marina');
    setObjective(missions, 'Pick up Dario\'s parcel at the Marina & Yacht Club', marina.door.x, marina.door.y);
  } else if (missions.index === 1) {
    // Mark the parked car waiting in the south lot (block 3,5).
    let best = null;
    let bestD = Infinity;
    for (const car of world.cars) {
      if (car.kind !== 'parked') continue;
      const d = dist(car.x, car.y, 1300, 2050);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) {
      best.missionTarget = true;
      missions.data.targetCar = best;
      setObjective(missions, 'Steal the marked car', best.x, best.y);
    }
  } else if (missions.index === 2) {
    missions.data.checkpoints = [1, 2, 3, 4, 5].map((j) => ({ x: streetX(9), y: streetY(j) }));
    const marina = placeById(city, 'marina');
    missions.data.checkpoints.push({ x: marina.door.x, y: marina.door.y });
    missions.data.cp = 0;
    missions.data.timer = null;
    setObjective(missions, 'Get a car and reach the top of the coast road', streetX(9), streetY(0));
  } else if (missions.index === 3) {
    const motel = placeById(city, 'motel');
    const gt = spawnSpecialCar(world, motel.door.x + 118, motel.door.y - 6, Math.PI, GT_COLOUR, 'Vermilion GT');
    missions.data.gt = gt;
    missions.data.guards = [
      addGuard(world, motel.door.x + 84, motel.door.y + 26),
      addGuard(world, motel.door.x + 150, motel.door.y - 34),
    ];
    setObjective(missions, 'Steal the vermilion GT from the Coral Court Motel', gt.x, gt.y);
  } else if (missions.index === 4) {
    const bank = placeById(city, 'bank');
    missions.data.guards = [
      addGuard(world, bank.door.x - 52, bank.door.y - 6),
      addGuard(world, bank.door.x + 52, bank.door.y - 6),
    ];
    missions.data.vault = { x: bank.x + bank.w / 2, y: bank.y - 34 };
    setObjective(missions, 'Slip behind Port Solace Bank and empty the vault', missions.data.vault.x, missions.data.vault.y);
  }
  say(missions, [['Dario', job.brief]]);
}

/** Pay out, tidy up, and point the player back to Dario (or to the open road). */
function completeJob(world, missions) {
  const job = DARIO_LINES[missions.index + 1];
  giveCash(world, job.pay);
  world.fx.push('mission');
  if (missions.data.targetCar) missions.data.targetCar.missionTarget = false;
  if (missions.data.gt) missions.data.gt.missionTarget = false;
  missions.index += 1;
  missions.data = {};
  missions.loot = 0;
  if (missions.index >= 5) {
    missions.phase = 'done';
    setObjective(missions, 'Story complete — Port Solace is yours. 20 hidden packages still wait in the alleys.', null);
  } else {
    missions.phase = 'offer';
    const spot = darioSpot(world);
    setObjective(missions, `See Dario at the Solace Diner — next job: ${DARIO_LINES[missions.index + 1].title}`, spot.x, spot.y);
  }
  say(missions, [['Dario', job.done]]);
}

/** A bust or a flatline mid-job ends the job; Dario will offer it again. */
export function failJob(world, missions) {
  if (missions.phase !== 'active') return;
  if (missions.data.targetCar) missions.data.targetCar.missionTarget = false;
  if (missions.data.gt && world.player.car !== missions.data.gt) missions.data.gt.dead = true;
  if (missions.data.guards) for (const g of missions.data.guards) g.gone = true;
  missions.phase = 'offer';
  missions.data = {};
  missions.loot = 0;
  const spot = darioSpot(world);
  setObjective(missions, 'The job fell apart. See Dario at the Solace Diner to try again.', spot.x, spot.y);
  say(missions, [['Dario', 'Rough day. The offer stands — come back and we run it again.']]);
}

/** Advance the story one tick. */
export function stepMissions(world, missions, dt, control) {
  const p = world.player;
  // Dialogue runs down on its own; a press of E hurries it along.
  if (missions.lines.length) {
    missions.lineT -= dt;
    if (missions.lineT <= 0 || control.interactPressed) {
      missions.lines.shift();
      missions.lineT = 3.1;
      if (!missions.lines.length && missions.phase === 'talk') beginJob(world, missions);
    }
  }
  if (missions.phase === 'offer' && missions.index < 5) {
    const spot = darioSpot(world);
    setObjective(missions, missions.index === 0
      ? 'Meet Dario Fenn outside the Solace Diner'
      : `See Dario at the Solace Diner — next job: ${DARIO_LINES[missions.index + 1].title}`, spot.x, spot.y);
    if (!p.car && dist(p.x, p.y, spot.x, spot.y) < 48) {
      missions.phase = 'talk';
      const job = DARIO_LINES[missions.index + 1];
      say(missions, [['Dario', job.offer], ['Dario', job.brief]]);
    }
    return;
  }
  if (missions.phase !== 'active') return;
  const city = world.city;
  const at = (x, y, r) => dist(p.x, p.y, x, y) < r;

  if (missions.index === 0) {
    const marina = placeById(city, 'marina');
    const club = placeById(city, 'club');
    if (missions.stage === 0 && at(marina.door.x, marina.door.y, 44)) {
      missions.stage = 1;
      setObjective(missions, 'Deliver the parcel to The Velvet Anchor', club.door.x, club.door.y);
      say(missions, [['You', 'Got it. Heavy, for a parcel. Best not to ask.']]);
    } else if (missions.stage === 1 && at(club.door.x, club.door.y, 44)) {
      completeJob(world, missions);
    }
  } else if (missions.index === 1) {
    const target = missions.data.targetCar;
    const garage = placeById(city, 'garage');
    if (missions.stage === 0 && target && p.car === target) {
      missions.stage = 1;
      setObjective(missions, 'Deliver the car to Rusty\'s Repaint Garage', garage.door.x, garage.door.y);
    } else if (missions.stage === 1 && target && p.car === target && at(garage.door.x, garage.door.y, 74)) {
      // Delivered: the player keeps neither the car nor the keys.
      target.missionTarget = false;
      missions.data.targetCar = null;
      completeJob(world, missions);
    } else if (missions.stage === 0 && target) {
      missions.marker = { x: target.x, y: target.y };
    }
  } else if (missions.index === 2) {
    const data = missions.data;
    if (missions.stage === 0) {
      if (p.car && at(streetX(9), streetY(0), 110)) {
        missions.stage = 1;
        data.timer = 75;
        setObjective(missions, 'Beach Run: hit every checkpoint down the coast!', data.checkpoints[0].x, data.checkpoints[0].y);
        say(missions, [['You', 'Clock is running. Coast road, all the way down.']]);
      }
    } else {
      data.timer -= dt;
      const cp = data.checkpoints[data.cp];
      if (cp && p.car && at(cp.x, cp.y, 96)) {
        data.cp += 1;
        world.fx.push('checkpoint');
        if (data.cp >= data.checkpoints.length) {
          completeJob(world, missions);
          return;
        }
        setObjective(missions, `Beach Run: checkpoint ${data.cp + 1} of ${data.checkpoints.length} — ${Math.ceil(data.timer)}s left`, data.checkpoints[data.cp].x, data.checkpoints[data.cp].y);
      } else if (cp) {
        missions.marker = { x: cp.x, y: cp.y };
        missions.objective = `Beach Run: checkpoint ${data.cp + 1} of ${data.checkpoints.length} — ${Math.ceil(Math.max(0, data.timer))}s left`;
      }
      if (data.timer <= 0 && missions.phase === 'active') {
        failJob(world, missions);
        say(missions, [['Dario', 'Too slow. The coast road is not going anywhere — run it again.']]);
      }
    }
  } else if (missions.index === 3) {
    const gt = missions.data.gt;
    const hotel = placeById(city, 'hotel');
    if (missions.stage === 0 && gt && p.car === gt) {
      missions.stage = 1;
      for (const g of missions.data.guards) g.hostile = true;
      setObjective(missions, 'Take the GT to the Neon Palms Hotel', hotel.door.x, hotel.door.y);
      say(missions, [['Guard', 'Hey! That is not your car!']]);
    } else if (missions.stage === 1 && gt) {
      missions.marker = { x: p.car === gt ? hotel.door.x : gt.x, y: p.car === gt ? hotel.door.y : gt.y };
      if (p.car === gt && at(hotel.door.x, hotel.door.y, 78)) completeJob(world, missions);
    } else if (missions.stage === 0 && gt) {
      missions.marker = { x: gt.x, y: gt.y };
    }
  } else if (missions.index === 4) {
    const bank = placeById(city, 'bank');
    const vault = missions.data.vault;
    if (missions.stage === 0) {
      if (!p.car && at(vault.x, vault.y, 40)) {
        missions.stage = 1;
        missions.loot = 0;
        for (const g of missions.data.guards) g.hostile = true;
        world.heat = Math.max(world.heat, STAR_HEAT * 3 + 20);
        world.stars = 4;
        p.lastCrimeAt = world.time;
        setObjective(missions, 'Emptying the vault — hold your ground…', vault.x, vault.y);
        say(missions, [['Alarm', 'The bank alarm is screaming. Hold on and fill the bag.']]);
      }
    } else if (missions.stage === 1) {
      if (!p.car && at(vault.x, vault.y, 46)) {
        missions.loot = clamp(missions.loot + dt / 6, 0, 1);
        missions.objective = `Emptying the vault — ${Math.floor(missions.loot * 100)}%`;
        if (missions.loot >= 1) {
          missions.stage = 2;
          const spot = darioSpot(world);
          setObjective(missions, 'Lose the police (stars to zero — Rusty\'s bay washes them), then reach Dario', spot.x, spot.y);
          say(missions, [['You', 'Bag is full. Now disappear.']]);
        }
      } else {
        missions.objective = 'Get back to the vault behind the bank!';
        missions.marker = { x: vault.x, y: vault.y };
      }
    } else if (missions.stage === 2) {
      const spot = darioSpot(world);
      missions.marker = { x: spot.x, y: spot.y };
      missions.objective = world.stars > 0
        ? `Lose the police — ${world.stars} star${world.stars > 1 ? 's' : ''} still burning`
        : 'Clean. Take the money to Dario at the Solace Diner';
      if (world.stars === 0 && !p.car && at(spot.x, spot.y, 50)) completeJob(world, missions);
    }
  }
}
