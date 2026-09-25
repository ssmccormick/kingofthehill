import { DEFAULT_CONFIG, mergeConfig } from '../src/config.js';
import { createEmptyState, createGame, addPiece } from '../src/logic/state.js';

export function cfg(overrides = {}) {
  return mergeConfig(DEFAULT_CONFIG, { seed: 1, ...overrides });
}

// Empty board with default terrain (24x24) unless overridden.
export function emptyState(overrides) {
  return createEmptyState(cfg(overrides), 1);
}

export function fullGame(overrides) {
  return createGame(cfg(overrides), 1);
}

export function put(state, type, side, x, y, facing = null) {
  return addPiece(state, { type, side, sq: y * state.terrain.width + x, facing });
}

export const sq = (state, x, y) => y * state.terrain.width + x;
export const xy = (state, s) => [s % state.terrain.width, Math.floor(s / state.terrain.width)];
export const targets = (state, moves) => moves.map((m) => xy(state, m.to).join(',')).sort();
