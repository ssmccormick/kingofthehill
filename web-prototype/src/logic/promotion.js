// Player pawn promotion + redeploy into the deployment zone. No DOM.
import { isFarEdge } from './terrain.js';
import { leavesKingInCheck } from './moves.js';
import { log, sqName, PIECE_NAMES } from './state.js';

// Highest tier whose minCaptures <= captures.
export function promotionPieceFor(table, captures) {
  let best = null;
  for (const row of table) {
    if (captures >= row.minCaptures && (!best || row.minCaptures > best.minCaptures)) best = row;
  }
  return best ? best.piece : 'N';
}

export function shouldPromote(state, piece) {
  return piece.side === 'player' && piece.type === 'P' && isFarEdge(state.terrain, piece.sq, piece.facing);
}

// Empty deployment-zone squares where placing the piece keeps its king safe.
export function placementSquares(state, pieceId) {
  const t = state.terrain;
  const out = [];
  for (let sq = 0; sq < t.deploy.length; sq++) {
    if (!t.deploy[sq] || state.grid[sq]) continue;
    if (!leavesKingInCheck(state, pieceId, sq)) out.push(sq);
  }
  return out;
}

// Promotes a pawn standing on its far edge. Either opens a placement prompt
// (state.pendingPlacement) or, if nowhere is legal, leaves the promoted piece
// on the edge flagged canRedeploy.
export function promote(state, piece) {
  const cfg = state.config.promotion;
  const newType = promotionPieceFor(cfg.table, piece.captures);
  log(state, `Pawn promotes at ${sqName(state, piece.sq)} (${piece.captures} capture${piece.captures === 1 ? '' : 's'}) → ${PIECE_NAMES[newType]}`);
  piece.type = newType;
  piece.facing = null;
  if (cfg.resetCountOnPromote) piece.captures = 0;
  if (placementSquares(state, piece.id).length) {
    state.pendingPlacement = { pieceId: piece.id, kind: 'promotion', apCost: cfg.immediateRedeployAPCost };
  } else {
    piece.canRedeploy = true;
    log(state, `No legal deployment square — ${PIECE_NAMES[newType]} waits on the edge (Redeploy later)`);
  }
}
