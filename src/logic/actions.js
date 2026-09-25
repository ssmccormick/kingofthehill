// Player actions and turn flow. Each action mutates `state` and returns
// { ok: true } or { ok: false, error }. No DOM.
import { legalMoves, isInCheck, isCheckmate } from './moves.js';
import { log, relocatePiece, removePiece, sqName, PIECE_NAMES } from './state.js';
import { shouldPromote, promote, placementSquares } from './promotion.js';

const fail = (error) => ({ ok: false, error });

export function apPerTurn(state) {
  return state.config.turn.apPerTurn + state.mods.extraAP;
}

// Why can't this piece act right now? null if it can.
export function pieceBlockedReason(state, piece) {
  if (!piece || piece.side !== 'player') return 'Not your piece';
  if (state.status !== 'playing') return 'Game over';
  if (state.pendingPlacement) return 'Place the promoted piece first';
  if (piece.lockedThisTurn && !state.config.promotion.redeployedPieceCanMove) return 'Redeployed this turn';
  if (state.config.turn.onePieceMovePerTurn && piece.movesThisTurn > 0) return 'Already moved this turn';
  if (state.ap < state.config.turn.moveAPCost) return 'No AP left';
  return null;
}

export function availableMoves(state, pieceId) {
  const piece = state.pieces[pieceId];
  if (pieceBlockedReason(state, piece)) return [];
  return legalMoves(state, piece);
}

export function movePiece(state, pieceId, toSq) {
  const piece = state.pieces[pieceId];
  const blocked = pieceBlockedReason(state, piece);
  if (blocked) return fail(blocked);
  const move = legalMoves(state, piece).find((m) => m.to === toSq);
  if (!move) return fail('Illegal move');

  const from = piece.sq;
  let text = `${PIECE_NAMES[piece.type]} ${sqName(state, from)} → ${sqName(state, toSq)}`;
  if (move.capture) {
    const victim = removePiece(state, move.capture);
    state.captured[victim.side].push(victim.type);
    text += ` captures ${PIECE_NAMES[victim.type]}`;
    if (piece.type === 'P') piece.captures++;
  }
  relocatePiece(state, pieceId, toSq);
  piece.movesThisTurn++;
  state.ap -= state.config.turn.moveAPCost;
  log(state, text);

  if (shouldPromote(state, piece)) promote(state, piece);
  return { ok: true, move };
}

// Begin a delayed redeploy for a promoted piece stuck on the edge.
export function startRedeploy(state, pieceId) {
  const piece = state.pieces[pieceId];
  if (!piece?.canRedeploy) return fail('This piece cannot redeploy');
  const blocked = pieceBlockedReason(state, piece);
  const cost = state.config.promotion.delayedRedeployAPCost;
  if (blocked && blocked !== 'No AP left') return fail(blocked);
  if (state.ap < cost) return fail('Not enough AP');
  if (!placementSquares(state, pieceId).length) return fail('No free deployment square');
  state.pendingPlacement = { pieceId, kind: 'redeploy', apCost: cost };
  return { ok: true };
}

export function cancelPlacement(state) {
  if (state.pendingPlacement?.kind !== 'redeploy') return fail('Promotion placement cannot be cancelled');
  state.pendingPlacement = null;
  return { ok: true };
}

export function currentPlacementSquares(state) {
  return state.pendingPlacement ? placementSquares(state, state.pendingPlacement.pieceId) : [];
}

export function placePending(state, sq) {
  const pp = state.pendingPlacement;
  if (!pp) return fail('Nothing to place');
  if (!placementSquares(state, pp.pieceId).includes(sq)) return fail('Not a legal deployment square');
  const piece = state.pieces[pp.pieceId];
  const from = piece.sq;
  relocatePiece(state, piece.id, sq);
  piece.lockedThisTurn = true;
  piece.canRedeploy = false;
  if (pp.kind === 'redeploy') piece.movesThisTurn++;
  state.ap -= pp.apCost;
  state.pendingPlacement = null;
  log(state, `${PIECE_NAMES[piece.type]} redeployed ${sqName(state, from)} → ${sqName(state, sq)}${pp.apCost ? ` (${pp.apCost} AP)` : ''}`);
  return { ok: true };
}

// Phase 1: ends the turn and starts the next player turn (no enemy phase yet).
export function endTurn(state) {
  if (state.pendingPlacement?.kind === 'promotion') return fail('Place the promoted piece first');
  state.pendingPlacement = null;
  log(state, `— End of turn ${state.turn} —`);
  state.turn++;
  startPlayerTurn(state);
  return { ok: true };
}

export function startPlayerTurn(state) {
  const carry = state.config.turn.carryOverAP ? state.ap : 0;
  state.ap = apPerTurn(state) + carry;
  for (const p of Object.values(state.pieces)) {
    p.movesThisTurn = 0;
    p.lockedThisTurn = false;
  }
  if (isCheckmate(state, 'player')) {
    state.status = 'lost';
    log(state, 'Checkmate — the king has fallen.');
  } else if (isInCheck(state, 'player')) {
    log(state, 'Your king is in check!');
  }
}
