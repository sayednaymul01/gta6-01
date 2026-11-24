// The game's one source of chance: a seeded mulberry32 generator. Every system that rolls
// dice (the city layout, traffic colours, pedestrian walks, police spawns) draws from the
// stream handed to it, so a seed rebuilds the same city and the same afternoon, and the
// screenshot scenes are the same frames every time they are staged.

/** A mulberry32 stream: call it for a float in [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max). */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** An integer in [min, max], both ends included. */
export function intRange(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of a non-empty array. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/** True with probability p. */
export function chance(rng, p) {
  return rng() < p;
}
