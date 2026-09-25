import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, put, sq, xy } from './helpers.js';
import { planIntents, runEnemyTurn, intentStatus, intentStatuses, bestMoveFor, scoreMove } from '../src/logic/ai.js';
import { endTurn, movePiece } from '../src/logic/actions.js';
import { pseudoMoves } from '../src/logic/moves.js';
import { removePiece } from '../src/logic/state.js';

const at = (s, q) => xy(s, q).join(',');

test('plans at most enemiesPerTurn intents, one per enemy', () => {
  const s = emptyState();
  put(s, 'K', 'player', 11, 11);
  for (let x = 1; x <= 6; x++) put(s, 'P', 'enemy', x * 3, 0, 'S');
  const intents = planIntents(s);
  assert.equal(intents.length, 4);
  assert.equal(new Set(intents.map((i) => i.pieceId)).size, 4);
  assert.deepEqual(intents.map((i) => i.order), [1, 2, 3, 4]);
});

test('enemiesPerTurn is configurable; fewer enemies means fewer intents', () => {
  const s = emptyState({ enemy: { enemiesPerTurn: 2 } });
  put(s, 'K', 'player', 11, 11);
  for (let x = 1; x <= 4; x++) put(s, 'P', 'enemy', x * 3, 0, 'S');
  assert.equal(planIntents(s).length, 2);
  const s2 = emptyState();
  put(s2, 'K', 'player', 11, 11);
  put(s2, 'P', 'enemy', 3, 0, 'S');
  assert.equal(planIntents(s2).length, 1);
});

test('prefers capturing the most valuable piece', () => {
  const s = emptyState();
  put(s, 'K', 'player', 23, 23);
  const r = put(s, 'R', 'enemy', 2, 2);
  put(s, 'P', 'player', 2, 5, 'N');
  put(s, 'Q', 'player', 6, 2);
  const [i] = planIntents(s);
  assert.equal(i.pieceId, r.id);
  assert.equal(at(s, i.to), '6,2');
  assert.equal(i.captureType, 'Q');
});

test('gives check when no capture is available, and flags it', () => {
  const s = emptyState();
  put(s, 'K', 'player', 5, 5);
  put(s, 'R', 'enemy', 0, 0);
  const [i] = planIntents(s);
  assert.ok(i.check);
  assert.ok(['0,5', '5,0'].includes(at(s, i.to)));
});

test('finds and flags checkmate; the loss happens after the enemy turn', () => {
  const s = emptyState();
  put(s, 'K', 'player', 0, 0);
  put(s, 'R', 'enemy', 1, 6); // covers file 1
  put(s, 'R', 'enemy', 5, 5);
  const intents = planIntents(s);
  assert.ok(intents[0].mate, 'first intent is the mate');
  assert.equal(at(s, intents[0].to), '0,5');
  assert.ok(endTurn(s).ok);
  assert.equal(s.status, 'lost');
  assert.match(s.lossReason, /Checkmate/);
});

test('approaches the king by path distance (ramps count as the cheap way up)', () => {
  const s = emptyState();
  put(s, 'K', 'player', 11, 11);
  const p = put(s, 'K', 'enemy', 11, 8); // a king-mover: one step at a time
  const [i] = planIntents(s);
  assert.equal(i.pieceId, p.id);
  assert.equal(at(s, i.to), '11,9');
});

test('avoids squares the player attacks when the penalty outweighs the gain', () => {
  const s = emptyState({ enemy: { weights: { attacked: 1000 } } });
  put(s, 'K', 'player', 23, 23);
  put(s, 'R', 'player', 0, 6); // guards row 6
  const e = put(s, 'P', 'enemy', 5, 5, 'S'); // forward is (5,6)
  e.hasMoved = true;
  const moves = pseudoMoves(s, e);
  assert.equal(moves.length, 1);
  assert.ok(scoreMove(s, e, moves[0]).score < -500);
});

test('intents execute in order and new intents are planned', () => {
  const s = emptyState();
  put(s, 'K', 'player', 11, 11);
  const a = put(s, 'P', 'enemy', 3, 0, 'S');
  const b = put(s, 'P', 'enemy', 20, 0, 'S');
  planIntents(s);
  assert.ok(endTurn(s).ok);
  assert.equal(at(s, a.sq), '3,2', 'double step on the first move');
  assert.equal(at(s, b.sq), '20,2');
  assert.equal(s.turn, 2);
  assert.equal(s.intents.length, 2);
});

test('fallback: a blocked intent uses the best alternative move', () => {
  const s = emptyState();
  put(s, 'K', 'player', 11, 11);
  const r = put(s, 'R', 'enemy', 4, 2);
  s.intents = [{ order: 1, pieceId: r.id, from: r.sq, to: sq(s, 4, 8), capture: 0 }];
  put(s, 'N', 'player', 4, 5); // blocks the path
  assert.equal(intentStatus(s, s.intents[0]), 'invalid');
  const expected = bestMoveFor(s, r).move.to;
  runEnemyTurn(s);
  assert.equal(r.sq, expected);
  assert.match(s.log.at(-1).text, /fallback/);
});

test('intents are re-planned after every player move', () => {
  const s = emptyState();
  put(s, 'K', 'player', 23, 23);
  const r = put(s, 'R', 'enemy', 2, 2);
  const q = put(s, 'Q', 'player', 6, 2);
  planIntents(s);
  assert.equal(s.intents[0].capture, q.id);
  assert.ok(movePiece(s, q.id, sq(s, 2, 6)).ok); // still in the rook's reach
  assert.equal(s.intents[0].pieceId, r.id);
  assert.equal(at(s, s.intents[0].to), '2,6', 'rook now aims at the queen\'s new square');
  assert.equal(intentStatus(s, s.intents[0]), 'hit');
});

test('with re-planning off, a capture intent whose target left falls back', () => {
  const s = emptyState({ enemy: { replanAfterPlayerMove: false } });
  put(s, 'K', 'player', 23, 23);
  const r = put(s, 'R', 'enemy', 2, 2);
  const q = put(s, 'Q', 'player', 6, 2);
  planIntents(s);
  assert.equal(s.intents[0].capture, q.id);
  assert.ok(movePiece(s, q.id, sq(s, 6, 9)).ok); // queen steps out of the line
  assert.equal(intentStatus(s, s.intents[0]), 'invalid');
  runEnemyTurn(s);
  assert.notEqual(r.sq, sq(s, 6, 2));
});

test('a plain move intent onto a square the player now occupies becomes a capture', () => {
  const s = emptyState();
  put(s, 'K', 'player', 23, 23);
  const r = put(s, 'R', 'enemy', 2, 2);
  s.intents = [{ order: 1, pieceId: r.id, from: r.sq, to: sq(s, 2, 6), capture: 0 }];
  const n = put(s, 'N', 'player', 2, 6);
  assert.equal(intentStatus(s, s.intents[0]), 'hit');
  runEnemyTurn(s);
  assert.equal(s.pieces[n.id], undefined);
  assert.deepEqual(s.captured.player, ['N']);
});

test('an intent whose enemy was captured is cancelled (no substitute)', () => {
  const s = emptyState();
  put(s, 'K', 'player', 23, 23);
  const a = put(s, 'P', 'enemy', 3, 0, 'S');
  const b = put(s, 'P', 'enemy', 9, 0, 'S');
  s.intents = [{ order: 1, pieceId: a.id, from: a.sq, to: sq(s, 3, 1), capture: 0 }];
  removePiece(s, a.id);
  assert.equal(intentStatus(s, s.intents[0]), 'dead');
  runEnemyTurn(s);
  assert.equal(at(s, b.sq), '9,0');
  assert.match(s.log.at(-1).text, /cancelled/);
});

test('an enemy with no legal move skips', () => {
  const s = emptyState();
  put(s, 'K', 'player', 23, 23);
  const p = put(s, 'P', 'enemy', 13, 9, 'S'); // step ahead, nothing to capture
  s.intents = [{ order: 1, pieceId: p.id, from: p.sq, to: sq(s, 13, 10), capture: 0 }];
  runEnemyTurn(s);
  assert.equal(at(s, p.sq), '13,9');
  assert.match(s.log.at(-1).text, /skips/);
});

test('capturing the king (via fallback) loses the game', () => {
  const s = emptyState();
  const k = put(s, 'K', 'player', 0, 0);
  const r = put(s, 'R', 'enemy', 0, 5);
  s.intents = [{ order: 1, pieceId: r.id, from: r.sq, to: sq(s, 5, 5), capture: 0 }];
  put(s, 'P', 'enemy', 3, 5, 'S'); // blocks the planned move
  runEnemyTurn(s);
  assert.equal(r.sq, k.sq);
  assert.equal(s.status, 'lost');
});

test('planning is deterministic', () => {
  const build = () => {
    const s = emptyState();
    put(s, 'K', 'player', 11, 11);
    for (const [t, x, y] of [['R', 1, 1], ['N', 20, 3], ['B', 5, 20], ['P', 12, 0], ['Q', 23, 12], ['P', 0, 12]]) {
      put(s, t, 'enemy', x, y, t === 'P' ? (y === 0 ? 'S' : 'E') : null);
    }
    return planIntents(s).map((i) => [i.pieceId, i.to]);
  };
  assert.deepEqual(build(), build());
});

test('AI off: no intents and the enemy turn does nothing', () => {
  const s = emptyState({ enemy: { aiEnabled: false } });
  put(s, 'K', 'player', 11, 11);
  const p = put(s, 'P', 'enemy', 3, 0, 'S');
  assert.equal(planIntents(s).length, 0);
  endTurn(s);
  assert.equal(at(s, p.sq), '3,0');
});

test('debug spawner is seeded and uses empty edge squares', async () => {
  const { spawnRandomEnemies } = await import('../src/logic/debug.js');
  const a = emptyState(), b = emptyState();
  const pa = spawnRandomEnemies(a, 8).map((p) => [p.type, p.sq, p.facing]);
  const pb = spawnRandomEnemies(b, 8).map((p) => [p.type, p.sq, p.facing]);
  assert.deepEqual(pa, pb);
  assert.equal(pa.length, 8);
});

test('debug spawner puts pawns only in the pawn lanes, facing the center', async () => {
  const { spawnRandomEnemies } = await import('../src/logic/debug.js');
  const s = emptyState();
  const placed = spawnRandomEnemies(s, 30);
  for (const p of placed.filter((p) => p.type === 'P')) {
    const [x, y] = xy(s, p.sq);
    const lane = (v) => v >= 10 && v <= 13;
    assert.ok((y === 0 && lane(x) && p.facing === 'S') || (y === 23 && lane(x) && p.facing === 'N')
      || (x === 0 && lane(y) && p.facing === 'E') || (x === 23 && lane(y) && p.facing === 'W'), `${x},${y} ${p.facing}`);
  }
});

test('intent statuses replay the sequence (a later intent may depend on an earlier one)', () => {
  const s = emptyState();
  put(s, 'K', 'player', 23, 23);
  const a = put(s, 'N', 'enemy', 2, 4);
  const r = put(s, 'R', 'enemy', 2, 2);
  put(s, 'N', 'player', 2, 7);
  // #1: knight leaves the rook's file; #2: rook takes the knight at (2,7).
  s.intents = [
    { order: 1, pieceId: a.id, from: a.sq, to: sq(s, 4, 5), capture: 0 },
    { order: 2, pieceId: r.id, from: r.sq, to: sq(s, 2, 7), capture: s.grid[sq(s, 2, 7)] },
  ];
  assert.equal(intentStatus(s, s.intents[1]), 'invalid', 'alone, the rook is blocked');
  assert.deepEqual(intentStatuses(s), ['move', 'hit']);
});
