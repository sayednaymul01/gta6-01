// The city of Port Solace, built from a seed: a 9x7 grid of blocks between straight streets,
// a beach and the sea down the east side, a marina on piles over the water, and eight named
// places the story visits. This module is pure geometry — it decides where things stand and
// answers collision and road questions for the world; it draws nothing and simulates nothing.

import {
  BEACH_W, BEACH_X, BLOCK, CITY_H, CITY_W, CITY_X, CITY_Y, COLS, PITCH_X, PITCH_Y,
  ROAD, ROWS, SEA_X, WORLD_H, WORLD_W,
} from './config.js';
import { chance, intRange, pick, range } from './random.js';

const WALL_COLOURS = ['#e8d8b0', '#dfa06a', '#c96f4a', '#e5e0d5', '#9fb6c3', '#d98cb3', '#8fc1a9', '#b08968', '#7fb3d5', '#f0e6cc'];
const ROOF_COLOURS = ['#a34a3a', '#5d6d7e', '#7a4a2b', '#4a6b5d', '#86592e', '#546a7a'];

/** Blocks with a job: [col, row] -> place id. The marina stands on the beach, not a block. */
const PLACE_BLOCKS = new Map([
  ['7,0', 'hotel'], ['5,0', 'police'], ['1,1', 'diner'], ['4,2', 'bank'],
  ['3,3', 'club'], ['6,4', 'garage'], ['2,5', 'motel'], ['0,6', 'hospital'],
]);
const PARK_BLOCKS = new Set(['5,3', '1,4']);
const LOT_BLOCKS = new Set(['6,1', '3,5']);

const PLACE_DEFS = {
  hotel: { name: 'Neon Palms Hotel', short: 'HOTEL' },
  police: { name: 'Port Solace Police', short: 'POLICE' },
  diner: { name: 'Solace Diner', short: 'DINER' },
  bank: { name: 'Port Solace Bank', short: 'BANK' },
  club: { name: 'The Velvet Anchor', short: 'CLUB' },
  garage: { name: "Rusty's Repaint Garage", short: 'GARAGE' },
  motel: { name: 'Coral Court Motel', short: 'MOTEL' },
  hospital: { name: 'Solace General Hospital', short: 'HOSPITAL' },
  marina: { name: 'Marina & Yacht Club', short: 'MARINA' },
};

/** The x centre of the i-th north-south street (0..COLS). */
export function streetX(i) {
  return CITY_X - ROAD / 2 + i * PITCH_X;
}

/** The y centre of the j-th east-west street (0..ROWS). */
export function streetY(j) {
  return CITY_Y - ROAD / 2 + j * PITCH_Y;
}

function building(rng, x, y, w, h, placeId) {
  return {
    x, y, w, h,
    colour: pick(rng, WALL_COLOURS),
    roof: pick(rng, ROOF_COLOURS),
    floors: intRange(rng, 2, 9),
    placeId: placeId ?? null,
  };
}

/** Fill one block with buildings (or palms, or parked rows) and return its record. */
function buildBlock(rng, col, row) {
  const x = CITY_X + col * PITCH_X;
  const y = CITY_Y + row * PITCH_Y;
  const key = `${col},${row}`;
  const block = { x, y, w: BLOCK, h: BLOCK, buildings: [], palms: [], kind: 'built', placeId: PLACE_BLOCKS.get(key) ?? null };
  if (PARK_BLOCKS.has(key)) {
    block.kind = 'park';
    for (let i = 0; i < 7; i += 1) block.palms.push({ x: x + range(rng, 26, BLOCK - 26), y: y + range(rng, 26, BLOCK - 26) });
    return block;
  }
  if (LOT_BLOCKS.has(key)) {
    block.kind = 'lot';
    return block;
  }
  const pattern = block.placeId ? 'place' : pick(rng, ['tower', 'quad', 'pair', 'quad']);
  if (pattern === 'place' || pattern === 'tower') {
    block.buildings.push(building(rng, x + 34, y + 34, BLOCK - 68, BLOCK - 68, block.placeId));
  } else if (pattern === 'quad') {
    const w = (BLOCK - 96) / 2;
    for (const [dx, dy] of [[30, 30], [66 + w, 30], [30, 66 + w], [66 + w, 66 + w]]) {
      block.buildings.push(building(rng, x + dx, y + dy, w, w));
    }
  } else {
    block.buildings.push(building(rng, x + 30, y + 30, BLOCK - 60, 92));
    block.buildings.push(building(rng, x + 30, y + 158, BLOCK - 60, 62));
  }
  return block;
}

/** Build the whole city from a seeded stream. */
export function buildCity(rng) {
  const blocks = [];
  const places = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const block = buildBlock(rng, col, row);
      blocks.push(block);
      if (block.placeId) {
        const main = block.buildings[0];
        places.push({
          id: block.placeId,
          ...PLACE_DEFS[block.placeId],
          x: main.x, y: main.y, w: main.w, h: main.h,
          door: { x: main.x + main.w / 2, y: main.y + main.h + 22 },
          col, row,
        });
      }
    }
  }
  // The marina: a boardwalk point on the sand and three piers reaching into the sea.
  const marinaY = streetY(5);
  places.push({
    id: 'marina', ...PLACE_DEFS.marina,
    x: BEACH_X + 30, y: marinaY - 60, w: 120, h: 120,
    door: { x: BEACH_X + 60, y: marinaY },
    col: COLS, row: 5,
  });
  const piers = [];
  for (let i = 0; i < 3; i += 1) {
    piers.push({ x: SEA_X + 30, y: marinaY - 190 + i * 170, w: 300, h: 26 });
  }
  const palms = [];
  for (let i = 0; i < 26; i += 1) {
    palms.push({ x: BEACH_X + range(rng, 24, BEACH_W - 30), y: range(rng, 60, WORLD_H - 80) });
  }
  for (const block of blocks) palms.push(...block.palms);
  // Hidden packages hide in the corners of blocks, down the alleys between buildings.
  const packageSpots = [];
  const corners = [];
  for (const block of blocks) {
    corners.push(
      { x: block.x + 16, y: block.y + 16 }, { x: block.x + BLOCK - 16, y: block.y + 16 },
      { x: block.x + 16, y: block.y + BLOCK - 16 }, { x: block.x + BLOCK - 16, y: block.y + BLOCK - 16 },
    );
  }
  for (let i = 0; i < 20; i += 1) {
    const spot = corners.splice(Math.floor(rng() * corners.length), 1)[0];
    packageSpots.push({ id: i, x: spot.x, y: spot.y });
  }
  // Parked cars: rows in the two lots, and a kerb line along a few streets.
  const parkedSpots = [];
  for (const block of blocks) {
    if (block.kind !== 'lot') continue;
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        parkedSpots.push({ x: block.x + 44 + c * 52, y: block.y + 48 + r * 78, angle: Math.PI / 2 });
      }
    }
  }
  for (let i = 0; i < COLS; i += 2) {
    parkedSpots.push({ x: streetX(i) + ROAD / 2 - 16, y: streetY(2) + 60 + i * 40, angle: Math.PI });
    parkedSpots.push({ x: streetX(i) - ROAD / 2 + 16, y: streetY(4) - 60 - i * 40, angle: 0 });
  }
  return {
    width: WORLD_W, height: WORLD_H,
    blocks, places, piers, palms, packageSpots, parkedSpots,
    beach: { x: BEACH_X, y: 0, w: BEACH_W, h: WORLD_H },
    sea: { x: SEA_X, y: 0, w: WORLD_W - SEA_X, h: WORLD_H },
    cityRect: { x: CITY_X - ROAD, y: CITY_Y - ROAD, w: CITY_W + ROAD * 2, h: CITY_H + ROAD * 2 },
  };
}

/** A place by id ('bank', 'diner', ...), or null. */
export function placeById(city, id) {
  return city.places.find((p) => p.id === id) ?? null;
}

/** True when the point is inside any building (with a small skin of tolerance). */
export function pointInBuilding(city, x, y, skin = 0) {
  for (const block of city.blocks) {
    if (x < block.x - skin || x > block.x + block.w + skin || y < block.y - skin || y > block.y + block.h + skin) continue;
    for (const b of block.buildings) {
      if (x >= b.x - skin && x <= b.x + b.w + skin && y >= b.y - skin && y <= b.y + b.h + skin) return b;
    }
  }
  return null;
}

/**
 * Push a circle at (e.x, e.y) out of every building it overlaps and keep it in the world
 * and out of the deep sea; e is mutated. Returns true when anything pushed.
 */
export function resolveCollision(city, e, radius) {
  let pushed = false;
  for (const block of city.blocks) {
    if (e.x < block.x - radius || e.x > block.x + block.w + radius || e.y < block.y - radius || e.y > block.y + block.h + radius) continue;
    for (const b of block.buildings) {
      const nx = Math.max(b.x, Math.min(e.x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(e.y, b.y + b.h));
      const dx = e.x - nx;
      const dy = e.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        e.x = nx + (dx / d) * radius;
        e.y = ny + (dy / d) * radius;
      } else {
        // Centre inside the box: leave by the shortest side.
        const left = e.x - b.x;
        const right = b.x + b.w - e.x;
        const top = e.y - b.y;
        const bottom = b.y + b.h - e.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) e.x = b.x - radius;
        else if (m === right) e.x = b.x + b.w + radius;
        else if (m === top) e.y = b.y - radius;
        else e.y = b.y + b.h + radius;
      }
      pushed = true;
    }
  }
  const maxX = SEA_X + 46;
  if (e.x < radius) { e.x = radius; pushed = true; }
  if (e.y < radius) { e.y = radius; pushed = true; }
  if (e.x > maxX) { e.x = maxX; pushed = true; }
  if (e.y > city.height - radius) { e.y = city.height - radius; pushed = true; }
  return pushed;
}

/** True when the point is on a street (asphalt), for speed and spawn decisions. */
export function isOnRoad(city, x, y) {
  if (x < city.cityRect.x || x > city.cityRect.x + city.cityRect.w || y < city.cityRect.y || y > city.cityRect.y + city.cityRect.h) return false;
  for (let i = 0; i <= COLS; i += 1) if (Math.abs(x - streetX(i)) <= ROAD / 2) return true;
  for (let j = 0; j <= ROWS; j += 1) if (Math.abs(y - streetY(j)) <= ROAD / 2) return true;
  return false;
}

/** How fast a car may go on this ground: full on asphalt, poor on sand and grass. */
export function groundFactor(city, x, y) {
  if (isOnRoad(city, x, y)) return 1;
  if (x >= BEACH_X) return 0.55;
  return 0.78;
}

/** The intersection nearest a point, as {i, j, x, y} indices into the street grid. */
export function nearestIntersection(x, y) {
  const i = Math.max(0, Math.min(COLS, Math.round((x - (CITY_X - ROAD / 2)) / PITCH_X)));
  const j = Math.max(0, Math.min(ROWS, Math.round((y - (CITY_Y - ROAD / 2)) / PITCH_Y)));
  return { i, j, x: streetX(i), y: streetY(j) };
}
