import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, put, targets } from './helpers.js';
import { isInCheck, isCheckmate, legalMoves } from '../src/logic/moves.js';
import { movePiece, endTurn, startPlayerTurn } from '../src/logic/actions.js';

test('check detection on flat ground, blocked by pieces and range', () => {
  const s = emptyState();
  put(s, 'K', 'player', 2, 2);
  const r = put(s, 'R', 'enemy', 2, 9);
  assert.equal(isInCheck(s), true);
  const blocker = put(s, 'P', 'player', 2, 5, 'N');
  assert.equal(isInCheck(s), false);
  delete s.pieces[blocker.id]; s.grid[blocker.sq] = 0;
  s.grid[r.sq] = 0; r.sq = 2 + 10 * 24; s.grid[r.sq] = r.id; // distance 8 > range 7
  assert.equal(isInCheck(s), false);
});

test('enemy on a ramp checks along the plateau row', () => {
  const s = emptyState();
  put(s, 'K', 'player', 13, 10);
  put(s, 'R', 'enemy', 11, 10);
  assert.equal(isInCheck(s), true);
});

test('pawn and knight give check', () => {
  const s = emptyState();
  put(s, 'K', 'player', 5, 5);
  put(s, 'P', 'enemy', 4, 4, 'S');
  assert.equal(isInCheck(s), true);
  const s2 = emptyState();
  put(s2, 'K', 'player', 5, 5);
  put(s2, 'P', 'enemy', 4, 6, 'S'); // attacks forward (south) only
  assert.equal(isInCheck(s2), false);
  put(s2, 'N', 'enemy', 6, 7);
  assert.equal(isInCheck(s2), true);
});

test('king cannot move into check', () => {
  const s = emptyState();
  const k = put(s, 'K', 'player', 2, 2);
  put(s, 'R', 'enemy', 3, 8);
  const t = targets(s, legalMoves(s, k));
  assert.ok(!t.some((m) => m.startsWith('3,')));
  assert.ok(t.includes('1,1'));
});

test('while in check, only resolving moves are legal', () => {
  const s = emptyState();
  put(s, 'K', 'player', 0, 0);
  put(s, 'R', 'enemy', 0, 5);
  const n = put(s, 'N', 'player', 5, 5);
  const b = put(s, 'B', 'player', 4, 1);
  assert.equal(movePiece(s, n.id, 5 + 7 * 24).ok, false);
  assert.deepEqual(targets(s, legalMoves(s, b)), ['0,5'], 'bishop may only capture the checker');
  assert.deepEqual(targets(s, legalMoves(s, n)), [], 'knight cannot help');
});

test('checkmate: king boxed in by two rooks', () => {
  const s = emptyState();
  put(s, 'K', 'player', 0, 0);
  put(s, 'R', 'enemy', 0, 5);
  put(s, 'R', 'enemy', 1, 5);
  assert.equal(isCheckmate(s), true);
});

test('not checkmate if a piece can capture the checker', () => {
  const s = emptyState();
  put(s, 'K', 'player', 0, 0);
  put(s, 'R', 'enemy', 0, 5);
  put(s, 'R', 'enemy', 1, 5);
  put(s, 'R', 'player', 6, 5); // can take (1,5)? blocked... it hits (1,5) first
  assert.equal(isCheckmate(s), true, 'capturing (1,5) still leaves (0,5) checking');
  put(s, 'B', 'player', 3, 2); // bishop can capture (0,5)? diag 3,2->0,5 yes
  assert.equal(isCheckmate(s), false);
});

test('checkmate at turn start ends the game', () => {
  const s = emptyState();
  put(s, 'K', 'player', 0, 0);
  put(s, 'R', 'enemy', 0, 5);
  put(s, 'R', 'enemy', 1, 5);
  startPlayerTurn(s);
  assert.equal(s.status, 'lost');
});

test('cannot end the turn while in check', () => {
  const s = emptyState();
  put(s, 'K', 'player', 0, 0);
  put(s, 'R', 'enemy', 0, 5);
  assert.equal(endTurn(s).ok, false);
});
