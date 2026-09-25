// Enemy AI: move scoring, telegraphed intent planning, and intent resolution.
// Deterministic: ties go to the lowest piece id, then move-generation order.
import { pseudoMoves, isInCheck, hasAnyLegalMove, attackedSquares, simulate } from './moves.js';
import { distanceField } from './terrain.js';
import { findKing, log, relocatePiece, removePiece, sqName, PIECE_NAMES } from './state.js';

// Per-position data shared by all move scores.
function scoringContext(state) {
  const king = findKing(state, 'player');
  return {
    dist: king ? distanceField(state.terrain, state.config, king.sq) : null,
    playerAttacks: attackedSquares(state, 'player'),
    wasInCheck: isInCheck(state, 'player'),
  };
}

// Scores one enemy move. Returns { score, check, mate, captureKing }.
// `check` means this move puts the king in check (it wasn't before); `mate`
// means the king is in check afterwards with no single legal reply.
export function scoreMove(state, piece, move, ctx = scoringContext(state)) {
  const w = state.config.enemy.weights;
  const values = state.config.pieceValues;
  const out = { score: 0, check: false, mate: false, captureKing: false };
  if (move.capture) {
    const victim = state.pieces[move.capture];
    if (victim.type === 'K') {
      out.captureKing = true;
      out.score = w.captureKing;
      return out;
    }
    out.score += w.capture * (values[victim.type] ?? 0);
  }
  simulate(state, piece.id, move.to, () => {
    if (isInCheck(state, 'player')) {
      if (!ctx.wasInCheck) {
        out.check = true;
        out.score += w.check;
      }
      if (!hasAnyLegalMove(state, 'player')) {
        out.mate = true;
        out.score += w.checkmate;
      }
    }
  });
  if (ctx.dist) {
    const d0 = ctx.dist[move.from], d1 = ctx.dist[move.to];
    if (Number.isFinite(d0) && Number.isFinite(d1)) out.score += w.approach * (d0 - d1);
  }
  if (ctx.playerAttacks.has(move.to)) out.score -= w.attacked * (values[piece.type] ?? 0);
  return out;
}

// Best move for one enemy piece, or null if it has none.
export function bestMoveFor(state, piece, ctx = scoringContext(state)) {
  let best = null;
  for (const move of pseudoMoves(state, piece)) {
    const s = scoreMove(state, piece, move, ctx);
    if (!best || s.score > best.eval.score) best = { move, eval: s };
  }
  return best;
}

// Chooses up to enemiesPerTurn intents. Intents are planned in order on a
// scratch copy of the board, so intent #2 already accounts for intent #1.
export function planIntents(state) {
  state.intents = [];
  const cfg = state.config.enemy;
  if (!cfg.aiEnabled || state.status !== 'playing') return state.intents;
  const sim = structuredClone(state);
  const used = new Set();
  for (let i = 0; i < cfg.enemiesPerTurn; i++) {
    const ctx = scoringContext(sim);
    let pick = null;
    for (const p of Object.values(sim.pieces)) {
      if (p.side !== 'enemy' || used.has(p.id)) continue;
      const b = bestMoveFor(sim, p, ctx);
      if (b && (!pick || b.eval.score > pick.eval.score)) pick = b;
    }
    if (!pick) break;
    const { move } = pick;
    const victim = move.capture ? sim.pieces[move.capture] : null;
    state.intents.push({
      order: i + 1,
      pieceId: move.pieceId,
      from: move.from,
      to: move.to,
      capture: move.capture || 0,
      captureType: victim?.type ?? null,
      check: pick.eval.check,
      mate: pick.eval.mate,
      captureKing: pick.eval.captureKing,
      score: pick.eval.score,
    });
    used.add(move.pieceId);
    if (victim) removePiece(sim, victim.id);
    relocatePiece(sim, move.pieceId, move.to);
  }
  return state.intents;
}

// The move an intent will make right now, or null if it can no longer execute
// as planned: piece gone or moved, destination unreachable, or a planned
// capture whose target is no longer there.
export function intentMove(state, intent) {
  const piece = state.pieces[intent.pieceId];
  if (!piece || piece.sq !== intent.from) return null;
  const move = pseudoMoves(state, piece).find((m) => m.to === intent.to);
  if (!move) return null;
  if (intent.capture && move.capture !== intent.capture) return null;
  return move;
}

// Live status of one intent against the current board, ignoring the others.
//   'dead'    the enemy was captured; its move is cancelled
//   'invalid' will fall back to another move
//   'hit'     will capture a player piece
//   'move'    plain move
export function intentStatus(state, intent) {
  if (!state.pieces[intent.pieceId]) return 'dead';
  const m = intentMove(state, intent);
  if (!m) return 'invalid';
  return m.capture ? 'hit' : 'move';
}

// Statuses for all intents, replaying the sequence in order on a scratch
// board (so intent #2 sees the board after #1, exactly as the enemy turn will).
export function intentStatuses(state) {
  const sim = structuredClone(state);
  return (state.intents || []).map((intent) => {
    const status = intentStatus(sim, intent);
    if (status === 'dead') return status;
    const move = status === 'invalid' ? bestMoveFor(sim, sim.pieces[intent.pieceId])?.move : intentMove(sim, intent);
    if (move) {
      if (move.capture) removePiece(sim, move.capture);
      relocatePiece(sim, move.pieceId, move.to);
    }
    return status;
  });
}

function executeEnemyMove(state, move, note = '') {
  const piece = state.pieces[move.pieceId];
  const wasInCheck = isInCheck(state, 'player');
  let text = `Enemy ${PIECE_NAMES[piece.type]} ${sqName(state, move.from)} → ${sqName(state, move.to)}`;
  if (move.capture) {
    const victim = removePiece(state, move.capture);
    state.captured.player.push(victim.type);
    text += ` captures ${PIECE_NAMES[victim.type]}`;
    if (victim.type === 'K') {
      state.status = 'lost';
      state.lossReason = 'Your king was captured.';
    }
  }
  relocatePiece(state, piece.id, move.to);
  log(state, text + note);
  if (state.status === 'playing' && !wasInCheck && isInCheck(state, 'player')) log(state, 'Check!');
}

// Executes the locked intents in order, with fallbacks.
export function runEnemyTurn(state) {
  for (const intent of state.intents || []) {
    if (state.status !== 'playing') break;
    const piece = state.pieces[intent.pieceId];
    if (!piece) {
      log(state, `Intent #${intent.order} cancelled: that enemy was captured`);
      continue;
    }
    const move = intentMove(state, intent);
    if (move) {
      executeEnemyMove(state, move);
      continue;
    }
    const alt = bestMoveFor(state, piece);
    if (alt) executeEnemyMove(state, alt.move, ` (fallback for intent #${intent.order})`);
    else log(state, `Enemy ${PIECE_NAMES[piece.type]} at ${sqName(state, piece.sq)} has no legal move — skips`);
  }
  if (state.status === 'lost') log(state, state.lossReason);
  state.intents = [];
}
