// Game state: a plain, structuredClone-able object. No DOM access.
import { buildTerrain, SIDES } from './terrain.js';
import { normalizeSeed, randomSeed } from './rng.js';

export function sqOf(state, x, y) { return y * state.terrain.width + x; }
export function xyOf(state, sq) { return { x: sq % state.terrain.width, y: Math.floor(sq / state.terrain.width) }; }
export function sqName(state, sq) {
  const { x, y } = xyOf(state, sq);
  return `${x},${y}`;
}

export const PIECE_NAMES = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };

// Creates an empty game (terrain, no pieces). Use setupStartingArmy() for the default army.
// mode: 'campaign' | 'endless' | 'sandbox' (sandbox = no spawns, no win).
export function createEmptyState(config, seed = config.seed, mode = 'sandbox') {
  const s = seed == null ? randomSeed() : normalizeSeed(seed);
  const terrain = buildTerrain(config);
  return {
    config,
    seed: s,
    rng: s,
    terrain,
    grid: new Array(terrain.width * terrain.height).fill(0), // piece id or 0
    pieces: {}, // id -> piece
    nextId: 1,
    turn: 1,
    ap: config.turn.apPerTurn,
    pendingPlacement: null, // { pieceId, apCost, kind: 'promotion'|'redeploy' }
    captured: { player: [], enemy: [] }, // types lost by each side
    mods: { extraAP: 0, extraHillRange: 0, knightsIgnoreClimb: false },
    mode,
    score: 0,
    // Spawn schedule and telegraphed spawns (see spawn.js).
    spawns: {
      nextWaveTurn: config.spawn.waves.firstWaveTurn,
      wavesSpawned: 0,
      lastWaveTurn: null,
      pending: [], // [{ sq, type, wave }] appearing at the end of this turn
      pendingWave: null, // wave number the pending spawns belong to, if a wave
      carry: [], // [{ type, wave }] that found no free square; retried next turn
      open: [], // waves spawned but not yet destroyed
    },
    intents: [], // telegraphed enemy moves for the coming enemy turn (see ai.js)
    log: [],
    status: 'playing', // 'playing' | 'lost'
    lossReason: null,
  };
}

export function createGame(config, seed, mode = 'campaign') {
  const state = createEmptyState(config, seed, mode);
  setupStartingArmy(state);
  log(state, `${mode[0].toUpperCase()}${mode.slice(1)} start — seed ${state.seed}`);
  return state;
}

export function addPiece(state, { type, side, sq, facing = null }) {
  if (state.grid[sq]) throw new Error(`Square ${sqName(state, sq)} is occupied`);
  const id = state.nextId++;
  state.pieces[id] = {
    id, type, side, sq,
    facing: type === 'P' ? facing : null,
    captures: 0,
    hasMoved: false, // for the pawn double step
    movesThisTurn: 0,
    lockedThisTurn: false, // redeployed this turn
    canRedeploy: false, // promoted while the zone was full
    wave: null, // enemy wave number (null for trickle / hand-placed)
  };
  state.grid[sq] = id;
  return state.pieces[id];
}

export function removePiece(state, id) {
  const p = state.pieces[id];
  if (!p) return null;
  state.grid[p.sq] = 0;
  delete state.pieces[id];
  return p;
}

export function relocatePiece(state, id, toSq) {
  const p = state.pieces[id];
  state.grid[p.sq] = 0;
  state.grid[toSq] = id;
  p.sq = toSq;
  p.hasMoved = true;
}

export function pieceAt(state, sq) {
  const id = state.grid[sq];
  return id ? state.pieces[id] : null;
}

export function piecesOf(state, side) {
  return Object.values(state.pieces).filter((p) => p.side === side);
}

export function findKing(state, side = 'player') {
  for (const p of Object.values(state.pieces)) if (p.type === 'K' && p.side === side) return p;
  return null;
}

export function log(state, text) {
  state.log.push({ turn: state.turn, text });
}

export function setupStartingArmy(state) {
  const t = state.terrain;
  for (const e of state.config.startLayout) {
    let x, y, facing = null;
    if (e.at === 'summit') {
      x = t.summit.x0 + e.dx; y = t.summit.y0 + e.dy;
    } else if (e.at === 'plateauEdge') {
      facing = e.side;
      if (e.side === 'N') { x = t.summit.x0 + e.along; y = t.plateau.y0; }
      else if (e.side === 'S') { x = t.summit.x0 + e.along; y = t.plateau.y1; }
      else if (e.side === 'W') { x = t.plateau.x0; y = t.summit.y0 + e.along; }
      else { x = t.plateau.x1; y = t.summit.y0 + e.along; }
    } else if (e.at === 'absolute') {
      x = e.x; y = e.y; facing = e.facing ?? null;
    }
    if (x == null || x < 0 || y < 0 || x >= t.width || y >= t.height) continue;
    const sq = y * t.width + x;
    if (state.grid[sq]) continue;
    if (e.type === 'P' && !SIDES[facing]) facing = 'N';
    addPiece(state, { type: e.type, side: 'player', sq, facing });
  }
}
