import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, put, targets, sq } from './helpers.js';
import { movePiece } from '../src/logic/actions.js';
import { pseudoMoves, legalMoves, slideRange } from '../src/logic/moves.js';

test('rook on flat ground is capped at range 7', () => {
  const s = emptyState();
  const r = put(s, 'R', 'player', 2, 2);
  assert.equal(slideRange(s, r), 7);
  const t = targets(s, pseudoMoves(s, r));
  assert.ok(t.includes('9,2'));
  assert.ok(!t.includes('10,2'));
  assert.ok(t.includes('2,9'));
  assert.ok(!t.includes('2,10'));
  assert.equal(t.length, 2 + 7 + 2 + 7);
});

test('bishop on flat ground capped at 7 diagonally', () => {
  const s = emptyState();
  const b = put(s, 'B', 'player', 0, 20);
  const t = targets(s, pseudoMoves(s, b));
  assert.deepEqual(t, ['1,19', '1,21', '2,18', '2,22', '3,17', '3,23', '4,16', '5,15', '6,14', '7,13'].sort());
});

test('player slider gets +1 range per elevation level (plateau 8, summit 9)', () => {
  const s = emptyState();
  const rook = put(s, 'R', 'player', 10, 10); // plateau
  assert.equal(slideRange(s, rook), 8);
  const t = targets(s, pseudoMoves(s, rook));
  assert.ok(t.includes('2,10'), 'slides 8 squares west, stepping down off the hill');
  assert.ok(!t.includes('1,10'));
  const q = put(s, 'Q', 'player', 12, 12); // summit
  assert.equal(slideRange(s, q), 9);
});

test('knight, king and pawns get no hill range bonus; enemies get none either', () => {
  const s = emptyState();
  const n = put(s, 'N', 'player', 12, 12);
  assert.equal(pseudoMoves(s, n).length <= 8, true);
  const er = put(s, 'R', 'enemy', 9, 14); // enemy rook on plateau
  assert.equal(slideRange(s, er), 7);
});

test('Long Sight mod adds extra hill range per level', () => {
  const s = emptyState();
  s.mods.extraHillRange = 1;
  const q = put(s, 'Q', 'player', 12, 12);
  assert.equal(slideRange(s, q), 7 + 2 * 2);
  const flat = put(s, 'R', 'player', 1, 1);
  assert.equal(slideRange(s, flat), 7);
});

test('sliders are blocked by pieces and capture opponents only', () => {
  const s = emptyState();
  const r = put(s, 'R', 'player', 2, 2);
  put(s, 'P', 'player', 5, 2, 'N');
  put(s, 'P', 'enemy', 2, 4, 'S');
  const t = targets(s, pseudoMoves(s, r));
  assert.ok(t.includes('4,2') && !t.includes('5,2'));
  assert.ok(t.includes('2,4') && !t.includes('2,5'));
});

test('knight jumps over pieces', () => {
  const s = emptyState();
  const n = put(s, 'N', 'player', 3, 3);
  put(s, 'P', 'player', 3, 4, 'N');
  put(s, 'P', 'player', 4, 3, 'N');
  assert.equal(pseudoMoves(s, n).length, 8);
});

test('king moves one square in 8 directions', () => {
  const s = emptyState();
  const k = put(s, 'K', 'player', 3, 3);
  assert.equal(pseudoMoves(s, k).length, 8);
  const corner = put(s, 'K', 'enemy', 0, 0);
  assert.equal(pseudoMoves(s, corner).length, 3);
});

test('player pawn moves outward along its facing, captures diagonally forward', () => {
  const s = emptyState();
  const p = put(s, 'P', 'player', 3, 5, 'N');
  p.hasMoved = true;
  assert.deepEqual(targets(s, pseudoMoves(s, p)), ['3,4']);
  put(s, 'N', 'enemy', 2, 4);
  put(s, 'N', 'enemy', 4, 6); // behind-diagonal: not capturable
  assert.deepEqual(targets(s, pseudoMoves(s, p)), ['2,4', '3,4']);
  put(s, 'N', 'enemy', 3, 4); // blocked straight ahead
  assert.deepEqual(targets(s, pseudoMoves(s, p)), ['2,4']);

  const e = put(s, 'P', 'player', 20, 3, 'E');
  put(s, 'B', 'enemy', 21, 2);
  assert.deepEqual(targets(s, pseudoMoves(s, e)), ['21,2', '21,3', '22,3'], 'first move may double-step');
});

test('enemy pawn moves inward per its facing', () => {
  const s = emptyState();
  const p = put(s, 'P', 'enemy', 5, 0, 'S');
  put(s, 'R', 'player', 6, 1);
  assert.deepEqual(targets(s, pseudoMoves(s, p)), ['5,1', '5,2', '6,1']);
});

test('pawn double step: first move only, both squares empty', () => {
  const s = emptyState();
  const p = put(s, 'P', 'enemy', 5, 0, 'S');
  assert.deepEqual(targets(s, pseudoMoves(s, p)), ['5,1', '5,2']);
  put(s, 'N', 'player', 5, 2);
  assert.deepEqual(targets(s, pseudoMoves(s, p)), ['5,1'], 'far square occupied');
  put(s, 'N', 'player', 5, 1);
  assert.deepEqual(targets(s, pseudoMoves(s, p)), [], 'near square occupied: no jumping');
  const q = put(s, 'P', 'player', 8, 8, 'N');
  q.hasMoved = true;
  assert.deepEqual(targets(s, pseudoMoves(s, q)), ['8,7']);
});

test('pawn loses the double step once it has moved', () => {
  const s = emptyState();
  put(s, 'K', 'player', 23, 23);
  const p = put(s, 'P', 'player', 3, 10, 'N');
  assert.ok(movePiece(s, p.id, sq(s, 3, 9)).ok);
  assert.deepEqual(targets(s, pseudoMoves(s, p)), ['3,8']);
});

test('pawnDoubleStep can be turned off', () => {
  const s = emptyState({ movement: { pawnDoubleStep: false } });
  const p = put(s, 'P', 'enemy', 5, 0, 'S');
  assert.deepEqual(targets(s, pseudoMoves(s, p)), ['5,1']);
});

test('pawn double step obeys climb rules on each step', () => {
  const s = emptyState();
  const up = put(s, 'P', 'enemy', 13, 8, 'S'); // (13,10) is a non-ramp step
  assert.deepEqual(targets(s, pseudoMoves(s, up)), ['13,9']);
  const ramp = put(s, 'P', 'enemy', 12, 8, 'S'); // (12,10) is a ramp: free climb
  assert.deepEqual(targets(s, pseudoMoves(s, ramp)), ['12,10', '12,9']);
  const ramp2 = put(s, 'P', 'enemy', 11, 9, 'S');
  assert.deepEqual(targets(s, pseudoMoves(s, ramp2)), ['11,10'], 'ramp then summit step: stops at the ramp');
});

test('legal moves exclude moves that expose the king (pin)', () => {
  const s = emptyState();
  put(s, 'K', 'player', 2, 2);
  const r = put(s, 'R', 'player', 2, 4);
  put(s, 'R', 'enemy', 2, 7);
  const t = targets(s, legalMoves(s, r));
  assert.deepEqual(t, ['2,3', '2,5', '2,6', '2,7']);
});
