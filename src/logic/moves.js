// Move generation, attacks, check detection. Pure logic, no DOM.
import { SIDES, climbExtra, isOnBoard } from './terrain.js';
import { findKing } from './state.js';

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL8 = [...ORTHO, ...DIAG];
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const SLIDE_DIRS = { R: ORTHO, B: DIAG, Q: ALL8 };

export const opponent = (side) => (side === 'player' ? 'enemy' : 'player');

// Movement cost of a single step or knight jump: 1, plus extra for climbing
// (see terrain.climbExtra). Player knights with the Cliff Jumper mod ignore it.
export function stepCost(state, piece, from, to) {
  if (piece.type === 'N' && piece.side === 'player' && state.mods.knightsIgnoreClimb) return 1;
  return 1 + climbExtra(state.terrain, state.config, from, to);
}

const climbs = (state, from, to) => state.terrain.elev[to] > state.terrain.elev[from];

export function slideRange(state, piece) {
  const m = state.config.movement;
  let range = m.slideRangeBase;
  const eligible = piece.side === 'player' || m.enemyHillRangeBonus;
  if (eligible && m.hillRangeBonusPieces.includes(piece.type)) {
    const perLevel = m.hillRangeBonusPerLevel + (piece.side === 'player' ? state.mods.extraHillRange : 0);
    range += state.terrain.elev[piece.sq] * perLevel;
  }
  return range;
}

// Calls cb(toSq) for every square `piece` attacks (i.e. could capture on if an
// opponent stood there). Includes squares occupied by friendly pieces.
export function forEachAttack(state, piece, cb) {
  const t = state.terrain, W = t.width;
  const x0 = piece.sq % W, y0 = Math.floor(piece.sq / W);
  const budget = state.config.movement.stepPieceBudget;
  const jump = (offsets) => {
    for (const [dx, dy] of offsets) {
      const x = x0 + dx, y = y0 + dy;
      if (!isOnBoard(t, x, y)) continue;
      const to = y * W + x;
      if (stepCost(state, piece, piece.sq, to) <= budget) cb(to);
    }
  };
  switch (piece.type) {
    case 'K': jump(ALL8); break;
    case 'N': jump(KNIGHT); break;
    case 'P': {
      const f = SIDES[piece.facing];
      if (!f) break;
      // perpendicular offsets to the facing direction
      jump(f.dx === 0 ? [[-1, f.dy], [1, f.dy]] : [[f.dx, -1], [f.dx, 1]]);
      break;
    }
    default: {
      const dirs = SLIDE_DIRS[piece.type];
      const range = slideRange(state, piece);
      const climbStops = piece.side === 'enemy' && state.config.movement.enemyClimbStops;
      for (const [dx, dy] of dirs) {
        let cur = piece.sq, x = x0, y = y0, used = 0;
        for (;;) {
          x += dx; y += dy;
          if (!isOnBoard(t, x, y)) break;
          const to = y * W + x;
          used += stepCost(state, piece, cur, to);
          if (used > range) break;
          cb(to);
          if (state.grid[to]) break;
          if (climbStops && climbs(state, cur, to)) break;
          cur = to;
        }
      }
    }
  }
}

// Pseudo-legal moves (ignores own-king safety). Returns [{pieceId, from, to, capture}]
export function pseudoMoves(state, piece) {
  const moves = [];
  const push = (to) => {
    const occ = state.grid[to];
    moves.push({ pieceId: piece.id, from: piece.sq, to, capture: occ || 0 });
  };
  if (piece.type === 'P') {
    forEachAttack(state, piece, (to) => {
      const occ = state.grid[to];
      if (occ && state.pieces[occ].side !== piece.side) push(to);
    });
    const f = SIDES[piece.facing];
    if (f) {
      const W = state.terrain.width;
      const x = (piece.sq % W) + f.dx, y = Math.floor(piece.sq / W) + f.dy;
      if (isOnBoard(state.terrain, x, y)) {
        const to = y * W + x;
        if (!state.grid[to] && stepCost(state, piece, piece.sq, to) <= state.config.movement.stepPieceBudget) push(to);
      }
    }
    return moves;
  }
  forEachAttack(state, piece, (to) => {
    const occ = state.grid[to];
    if (!occ || state.pieces[occ].side !== piece.side) push(to);
  });
  return moves;
}

export function isSquareAttacked(state, sq, bySide) {
  for (const p of Object.values(state.pieces)) {
    if (p.side !== bySide) continue;
    let hit = false;
    forEachAttack(state, p, (to) => { if (to === sq) hit = true; });
    if (hit) return true;
  }
  return false;
}

// Set of squares attacked by `bySide` (for the threat overlay and AI).
export function attackedSquares(state, bySide) {
  const set = new Set();
  for (const p of Object.values(state.pieces)) if (p.side === bySide) forEachAttack(state, p, (to) => set.add(to));
  return set;
}

export function isInCheck(state, side = 'player') {
  const k = findKing(state, side);
  return k ? isSquareAttacked(state, k.sq, opponent(side)) : false;
}

// Temporarily moves pieceId to toSq (capturing whatever is there), runs fn, restores.
export function simulate(state, pieceId, toSq, fn) {
  const p = state.pieces[pieceId];
  const from = p.sq;
  const capId = state.grid[toSq];
  const cap = capId && capId !== pieceId ? state.pieces[capId] : null;
  if (cap) delete state.pieces[capId];
  state.grid[from] = 0;
  state.grid[toSq] = pieceId;
  p.sq = toSq;
  try {
    return fn();
  } finally {
    p.sq = from;
    state.grid[toSq] = cap ? capId : 0;
    state.grid[from] = pieceId;
    if (cap) state.pieces[capId] = cap;
  }
}

// Would moving pieceId to toSq leave `side`'s king in check?
export function leavesKingInCheck(state, pieceId, toSq) {
  const side = state.pieces[pieceId].side;
  return simulate(state, pieceId, toSq, () => isInCheck(state, side));
}

// Chess-legal moves: pseudo-legal moves that don't leave own king in check.
// Enemies have no king, so all their pseudo-legal moves are legal.
export function legalMoves(state, piece) {
  const moves = pseudoMoves(state, piece);
  if (!findKing(state, piece.side)) return moves;
  return moves.filter((m) => !leavesKingInCheck(state, piece.id, m.to));
}

export function hasAnyLegalMove(state, side) {
  for (const p of Object.values(state.pieces)) {
    if (p.side === side && legalMoves(state, p).length) return true;
  }
  return false;
}

// v1 checkmate: in check and no single legal move resolves it.
export function isCheckmate(state, side = 'player') {
  return isInCheck(state, side) && !hasAnyLegalMove(state, side);
}
