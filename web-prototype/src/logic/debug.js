// Dev-only helpers (still pure logic, no DOM).
import { addPiece } from './state.js';
import { inwardFacing, edgeSpawnSquares } from './terrain.js';
import { rngInt, rngPick } from './rng.js';

// Places `count` enemies on random empty edge squares using the game's seeded
// RNG. Pawns only use the middle pawn lanes (config.spawn.pawnLaneWidth); if
// those are full, that spawn is skipped.
export function spawnRandomEnemies(state, count, pool = ['P', 'P', 'P', 'P', 'N', 'N', 'B', 'R']) {
  const placed = [];
  for (let i = 0; i < count; i++) {
    const type = rngPick(state, pool);
    const free = edgeSpawnSquares(state.terrain, state.config.spawn, type).filter((sq) => !state.grid[sq]);
    if (!free.length) continue;
    const sq = free[rngInt(state, free.length)];
    placed.push(addPiece(state, { type, side: 'enemy', sq, facing: inwardFacing(state.terrain, sq) }));
  }
  return placed;
}
