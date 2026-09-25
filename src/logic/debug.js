// Dev-only helpers (still pure logic, no DOM).
import { addPiece } from './state.js';
import { inwardFacing } from './terrain.js';
import { rngInt, rngPick } from './rng.js';

// Places `count` enemies on random empty edge squares using the game's seeded RNG.
export function spawnRandomEnemies(state, count, pool = ['P', 'P', 'P', 'P', 'N', 'N', 'B', 'R']) {
  const t = state.terrain;
  const edge = [];
  for (let sq = 0; sq < t.width * t.height; sq++) {
    const x = sq % t.width, y = Math.floor(sq / t.width);
    if ((x === 0 || y === 0 || x === t.width - 1 || y === t.height - 1) && !state.grid[sq]) edge.push(sq);
  }
  const placed = [];
  for (let i = 0; i < count && edge.length; i++) {
    const sq = edge.splice(rngInt(state, edge.length), 1)[0];
    const type = rngPick(state, pool);
    placed.push(addPiece(state, { type, side: 'enemy', sq, facing: inwardFacing(t, sq) }));
  }
  return placed;
}
