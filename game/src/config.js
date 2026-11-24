// Port Solace: Neon Tide — the numbers every other module agrees on: the city's grid, the
// simulation step, the tuning of feet and wheels, and the cast of names. Pure data and small
// helpers; nothing here touches the DOM, so the headless simulations import it too.

/** The fixed simulation step, in seconds: the world advances in 1/60 s ticks. */
export const STEP = 1 / 60;

/** localStorage key for the saved game (cash, story progress, packages found). */
export const SAVE_KEY = 'port-solace-neon-tide-save-v1';

// The city grid: COLS by ROWS blocks of city, each BLOCK wide, separated by roads ROAD wide,
// so the pitch (corner to corner of neighbouring blocks) is PITCH_X / PITCH_Y. East of the
// last column the ground gives way to the beach and then the sea.
export const COLS = 9;
export const ROWS = 7;
export const BLOCK = 250;
export const ROAD = 104;
export const PITCH_X = BLOCK + ROAD;
export const PITCH_Y = BLOCK + ROAD;
export const CITY_X = 140;
export const CITY_Y = 140;
export const CITY_W = COLS * BLOCK + (COLS - 1) * ROAD;
export const CITY_H = ROWS * BLOCK + (ROWS - 1) * ROAD;
/** X where the sand starts (just east of the last street). */
export const BEACH_X = CITY_X + CITY_W + ROAD;
/** Width of the sand strip before the water. */
export const BEACH_W = 210;
/** X where the sea starts. */
export const SEA_X = BEACH_X + BEACH_W;
export const WORLD_W = SEA_X + 760;
export const WORLD_H = CITY_Y + CITY_H + ROAD + 130;

/** How far the camera sees: the canvas is treated as a 1280x800 stage. */
export const VIEW_W = 1280;
export const VIEW_H = 800;

// On-foot tuning.
export const WALK_SPEED = 148;
export const SPRINT_SPEED = 238;
export const PLAYER_RADIUS = 13;
export const PLAYER_HEALTH = 100;
export const PLAYER_ARMOUR = 100;

// Wanted tuning: crimes add heat; each STAR_HEAT of heat is one star, five at most. Heat
// bleeds away slowly while no police officer can see the player, faster in the repaint bay.
export const STAR_HEAT = 100;
export const MAX_STARS = 5;
export const HEAT_DECAY = 1.6;
export const REPAINT_COST = 100;

// What things pay and cost.
export const PACKAGE_COUNT = 20;
export const PACKAGE_PAY = 25;

/** Body colours for traffic and parked cars — sun-bleached pastels and a few loud ones. */
export const CAR_COLOURS = [
  '#e8e3d8', '#c94f4f', '#4f7dc9', '#53b06a', '#e0a83c', '#7a5fb0',
  '#3fb6b2', '#e2703a', '#8a8f98', '#2e3440', '#d96cae', '#f2e14c',
];
/** The one vermilion GT the fourth mission is about. */
export const GT_COLOUR = '#e0342b';

/** Shirt colours for pedestrians and the names they answer to. */
export const PED_SHIRTS = ['#d95f43', '#43d9a3', '#4365d9', '#d9c243', '#b043d9', '#43b8d9', '#e8e8e8', '#5c6650'];
export const PED_NAMES = [
  'Marisol', 'Teo', 'Ines', 'Bram', 'Lucia', 'Ondrej', 'Paloma', 'Silas',
  'Verano', 'Kit', 'Alba', 'Ruy', 'Nerea', 'Cas', 'Tomas', 'Lidia',
];

/** A clamp that reads well in physics code. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** The shortest signed turn from angle a to angle b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance between two points. */
export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}
