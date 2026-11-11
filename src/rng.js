// Seeded random number generator (mulberry32). Same seed = same game,
// so any bug or balance issue can be replayed exactly.

export function createRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    getState: () => s,
    setState: (v) => { s = v >>> 0; },
    // Integer in [min, max] inclusive.
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    // entries: [{ weight, ... }] or [[value, weight]]; returns the entry.
    weighted(entries, getWeight = (e) => e.weight) {
      let total = 0;
      for (const e of entries) total += getWeight(e);
      if (total <= 0) return null;
      let r = next() * total;
      for (const e of entries) {
        r -= getWeight(e);
        if (r < 0) return e;
      }
      return entries[entries.length - 1];
    },
  };
  return rng;
}
