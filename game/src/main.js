// Port Solace: Neon Tide — boot and the one loop. The world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), the story steps with it, and the renderer
// paints what is there. Screens: title, play, paused, busted, wasted. The save (seed, cash,
// story progress, packages) lives in localStorage, so Continue rebuilds the same city.
//
// ?seed=N fixes the city. ?shot=cover|city|heist|title (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.

import { SAVE_KEY, STEP, VIEW_H, VIEW_W, clamp } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED, EVENT_WASTED, applyBust, applyWasted, createWorld, step,
} from './world.js';
import { createMissions, failJob, stepMissions } from './missions.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      seed,
      cash: world.player.cash,
      index: missions.index,
      packages: world.packages.filter((pk) => pk.taken).map((pk) => pk.id),
      earned: world.stats.earned,
    }));
  } catch {
    // Storage can be off (private windows): the story then lasts this visit only.
  }
}

function applySave(save) {
  world.player.cash = save.cash ?? world.player.cash;
  missions.index = save.index ?? 0;
  missions.phase = missions.index >= 5 ? 'done' : 'offer';
  for (const pk of world.packages) {
    if (save.packages?.includes(pk.id)) {
      pk.taken = true;
      world.player.packagesFound += 1;
    }
  }
}

let seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
let world = createWorld(createRandom(seed));
let missions = createMissions(world);
let screen = SCREEN_TITLE;
let saveTimer = 0;

function newGame() {
  seed = Math.floor(Math.random() * 4294967296);
  world = createWorld(createRandom(seed));
  missions = createMissions(world);
  screen = SCREEN_PLAY;
  announce('Port Solace. Dario Fenn is waiting outside the Solace Diner.');
}

function continueGame() {
  const save = readSave();
  if (!save) return;
  seed = save.seed;
  world = createWorld(createRandom(seed));
  missions = createMissions(world);
  applySave(save);
  screen = SCREEN_PLAY;
  announce('Welcome back to Port Solace.');
}

function announce(message) {
  status.textContent = message;
}

const IDLE = {
  mx: 0, my: 0, sprint: false, punch: false, shoot: false, aim: null,
  enterPressed: false, interactPressed: false, throttle: 0, steer: 0,
};

function runShot(name) {
  const shotScreen = stageShot(name, world, missions);
  let painted = 0;
  function paint() {
    renderer.draw(world, missions, shotScreen, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();

  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  window.addEventListener('mousedown', () => audio.unlock(), { once: true });

  function camera() {
    return {
      x: clamp(world.player.x - VIEW_W / 2, 0, Math.max(0, world.city.width - VIEW_W)),
      y: clamp(world.player.y - VIEW_H / 2, 0, Math.max(0, world.city.height - VIEW_H)),
    };
  }

  function stepOnce(control) {
    const events = step(world, STEP, control);
    stepMissions(world, missions, STEP, control);
    for (const name of world.fx) audio.play(name);
    world.fx.length = 0;
    if (events & EVENT_BUSTED) {
      failJob(world, missions);
      applyBust(world);
      screen = SCREEN_BUSTED;
      audio.play('busted');
      writeSave();
      announce('Busted. The police take their fine.');
    } else if (events & EVENT_WASTED) {
      failJob(world, missions);
      applyWasted(world);
      screen = SCREEN_WASTED;
      audio.play('wasted');
      writeSave();
      announce('Wasted. Solace General patches you up.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const control = input.control();

    if (screen === SCREEN_TITLE) {
      // The city idles behind the menu; the story waits.
      while (accumulator >= STEP) {
        step(world, STEP, IDLE);
        world.fx.length = 0;
        accumulator -= STEP;
      }
      if (control.confirmPressed) newGame();
      else if (control.continuePressed && readSave()) continueGame();
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      accumulator = 0;
      if (control.confirmPressed) {
        screen = SCREEN_PLAY;
        announce('Back on the street.');
      }
    } else if (screen === SCREEN_PAUSED) {
      accumulator = 0;
      if (control.pausePressed || control.confirmPressed) screen = SCREEN_PLAY;
    } else {
      if (control.pausePressed) {
        screen = SCREEN_PAUSED;
        accumulator = 0;
      } else {
        // Aim from the mouse through the camera, for the steps about to run.
        const cam = camera();
        control.aim = Math.atan2(
          input.mouse.y + cam.y - world.player.y,
          input.mouse.x + cam.x - world.player.x,
        );
        while (accumulator >= STEP) {
          stepOnce(control);
          accumulator -= STEP;
          // Edge presses belong to one tick only; later ticks in this frame see them spent.
          control.enterPressed = false;
          control.interactPressed = false;
          control.confirmPressed = false;
          if (screen !== SCREEN_PLAY) {
            accumulator = 0;
            break;
          }
        }
        saveTimer += 1 / 60;
        if (saveTimer > 2) {
          saveTimer = 0;
          writeSave();
        }
      }
    }

    audio.setSiren(screen === SCREEN_PLAY && world.stars >= 2);
    audio.setEngine(
      screen === SCREEN_PLAY && !!world.player.car,
      world.player.car ? Math.abs(world.player.car.speed) / 360 : 0,
    );
    renderer.draw(world, missions, screen, !!readSave());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
  });

  announce('Port Solace: Neon Tide. Enter starts, C continues.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
