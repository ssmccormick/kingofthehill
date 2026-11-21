// Seeded RNG (mulberry32). The generator state is a single uint32 stored on
// the game state (`state.rng`), so snapshots/undo capture it for free.

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function normalizeSeed(seed) {
  if (typeof seed === 'string' && /^\d+$/.test(seed.trim())) return Number(seed.trim()) >>> 0;
  if (typeof seed === 'string') {
    let h = 2166136261;
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  return Number(seed) >>> 0;
}

// Advances holder.rng and returns a float in [0, 1).
export function rngNext(holder) {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngInt(holder, n) {
  return Math.floor(rngNext(holder) * n);
}

export function rngPick(holder, arr) {
  return arr[rngInt(holder, arr.length)];
}
