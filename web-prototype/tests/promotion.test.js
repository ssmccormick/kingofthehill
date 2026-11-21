import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, put, sq, xy } from './helpers.js';
import { promotionPieceFor, placementSquares } from '../src/logic/promotion.js';
import { movePiece, placePending, availableMoves, endTurn, startRedeploy, currentPlacementSquares } from '../src/logic/actions.js';
import { removePiece } from '../src/logic/state.js';
import { Game } from '../src/logic/game.js';
import { cfg } from './helpers.js';

function kingAway(s) { return put(s, 'K', 'player', 23, 23); }

test('promotion table tiers (default config)', () => {
  const t = cfg().promotion.table;
  assert.equal(promotionPieceFor(t, 0), 'N');
  assert.equal(promotionPieceFor(t, 1), 'B');
  assert.equal(promotionPieceFor(t, 2), 'R');
  assert.equal(promotionPieceFor(t, 3), 'R');
  assert.equal(promotionPieceFor(t, 4), 'Q');
  assert.equal(promotionPieceFor(t, 11), 'Q');
});

for (const [captures, expected] of [[0, 'N'], [1, 'B'], [2, 'R'], [3, 'R'], [4, 'Q']]) {
  test(`pawn with ${captures} captures promotes to ${expected}, count resets`, () => {
    const s = emptyState();
    kingAway(s);
    const p = put(s, 'P', 'player', 3, 1, 'N');
    p.captures = captures;
    assert.ok(movePiece(s, p.id, sq(s, 3, 0)).ok);
    assert.equal(p.type, expected);
    assert.equal(p.captures, 0);
    assert.equal(s.pendingPlacement.pieceId, p.id);
  });
}

test('capturing onto the edge counts toward the promotion', () => {
  const s = emptyState();
  kingAway(s);
  const p = put(s, 'P', 'player', 3, 1, 'N');
  put(s, 'P', 'enemy', 4, 0, 'S');
  assert.ok(movePiece(s, p.id, sq(s, 4, 0)).ok);
  assert.equal(p.type, 'B');
  assert.deepEqual(s.captured.enemy, ['P']);
});

test('capture count accumulates across moves', () => {
  const s = emptyState();
  kingAway(s);
  const p = put(s, 'P', 'player', 5, 5, 'N');
  put(s, 'P', 'enemy', 4, 4, 'S');
  movePiece(s, p.id, sq(s, 4, 4));
  endTurn(s);
  put(s, 'P', 'enemy', 5, 3, 'S');
  movePiece(s, p.id, sq(s, 5, 3));
  assert.equal(p.captures, 2);
});

test('promotion happens at each of the four edges', () => {
  const cases = [['N', [3, 1], [3, 0]], ['S', [3, 22], [3, 23]], ['W', [1, 3], [0, 3]], ['E', [22, 3], [23, 3]]];
  for (const [facing, from, to] of cases) {
    const s = emptyState();
    put(s, 'K', 'player', 12, 12);
    const p = put(s, 'P', 'player', ...from, facing);
    assert.ok(movePiece(s, p.id, sq(s, ...to)).ok, facing);
    assert.equal(p.type, 'N', facing);
    assert.ok(s.pendingPlacement, facing);
  }
});

test('a pawn reaching a non-facing edge does not promote', () => {
  const s = emptyState();
  kingAway(s);
  const p = put(s, 'P', 'player', 1, 5, 'W');
  put(s, 'N', 'enemy', 0, 4);
  movePiece(s, p.id, sq(s, 0, 4)); // reaches W edge -> promotes
  assert.equal(p.type, 'B');
  const s2 = emptyState();
  kingAway(s2);
  const q = put(s2, 'P', 'player', 3, 1, 'E');
  put(s2, 'N', 'enemy', 4, 0);
  movePiece(s2, q.id, sq(s2, 4, 0)); // on N edge, but faces E
  assert.equal(q.type, 'P');
});

test('promotion table is read from config', () => {
  const s = emptyState({ promotion: { table: [{ minCaptures: 0, piece: 'Q' }] } });
  kingAway(s);
  const p = put(s, 'P', 'player', 3, 1, 'N');
  movePiece(s, p.id, sq(s, 3, 0));
  assert.equal(p.type, 'Q');
});

test('placement: only empty deployment squares; costs no AP; piece cannot move again this turn', () => {
  const s = emptyState();
  kingAway(s);
  put(s, 'N', 'enemy', 10, 10); // occupies a deploy square
  const p = put(s, 'P', 'player', 3, 1, 'N');
  movePiece(s, p.id, sq(s, 3, 0));
  const squares = currentPlacementSquares(s);
  assert.equal(squares.length, 12 - 1);
  assert.ok(squares.every((q) => s.terrain.deploy[q] && !s.grid[q]));
  assert.equal(placePending(s, sq(s, 3, 3)).ok, false, 'not a deploy square');
  const apBefore = s.ap;
  assert.ok(placePending(s, sq(s, 11, 10)).ok);
  assert.equal(s.ap, apBefore);
  assert.equal(p.sq, sq(s, 11, 10));
  assert.equal(s.grid[sq(s, 3, 0)], 0);
  assert.deepEqual(availableMoves(s, p.id), []);
  endTurn(s);
  assert.ok(availableMoves(s, p.id).length > 0);
});

test('redeployed piece cannot move even when repeat moves are allowed', () => {
  const s = emptyState({ turn: { onePieceMovePerTurn: false } });
  kingAway(s);
  const p = put(s, 'P', 'player', 3, 1, 'N');
  movePiece(s, p.id, sq(s, 3, 0));
  placePending(s, sq(s, 11, 10));
  assert.deepEqual(availableMoves(s, p.id), []);
});

test('other actions are blocked until the promoted piece is placed', () => {
  const s = emptyState();
  const k = kingAway(s);
  const p = put(s, 'P', 'player', 3, 1, 'N');
  movePiece(s, p.id, sq(s, 3, 0));
  assert.deepEqual(availableMoves(s, k.id), []);
  assert.equal(endTurn(s).ok, false);
});

test('placement cannot leave the king in check (only blocking squares are legal)', () => {
  // Small board with a wide deploy ring so the edge row is in the zone.
  const s = emptyState({ board: { width: 12, height: 12, plateauSize: 4, deployZone: 'ring', deployRingWidth: 4 } });
  put(s, 'K', 'player', 0, 0);
  put(s, 'R', 'enemy', 5, 0);
  const p = put(s, 'P', 'player', 2, 1, 'N');
  assert.ok(movePiece(s, p.id, sq(s, 2, 0)).ok, 'pawn blocks the check');
  const squares = currentPlacementSquares(s).map((q) => xy(s, q).join(',')).sort();
  assert.deepEqual(squares, ['1,0', '3,0', '4,0']);
});

test('full-zone fallback: promoted piece waits on the edge with Redeploy (1 AP) later', () => {
  const s = emptyState();
  kingAway(s);
  const blockers = [];
  s.terrain.deploy.forEach((d, i) => { if (d) blockers.push(put(s, 'P', 'player', i % 24, Math.floor(i / 24), 'N')); });
  const p = put(s, 'P', 'player', 3, 1, 'N');
  assert.ok(movePiece(s, p.id, sq(s, 3, 0)).ok);
  assert.equal(s.pendingPlacement, null);
  assert.equal(p.type, 'N');
  assert.equal(p.sq, sq(s, 3, 0));
  assert.equal(p.canRedeploy, true);
  assert.equal(startRedeploy(s, p.id).ok, false, 'already moved this turn');
  endTurn(s);
  assert.equal(startRedeploy(s, p.id).ok, false, 'zone still full');
  removePiece(s, blockers[0].id);
  const ap = s.ap;
  assert.ok(startRedeploy(s, p.id).ok);
  assert.deepEqual(currentPlacementSquares(s), [blockers[0].sq]);
  assert.ok(placePending(s, blockers[0].sq).ok);
  assert.equal(s.ap, ap - 1);
  assert.equal(p.canRedeploy, false);
  assert.deepEqual(availableMoves(s, p.id), []);
});

test('no legal placement (would expose king) also falls back to edge', () => {
  const s = emptyState();
  put(s, 'K', 'player', 0, 0);
  put(s, 'R', 'enemy', 5, 0);
  const p = put(s, 'P', 'player', 2, 1, 'N');
  assert.ok(movePiece(s, p.id, sq(s, 2, 0)).ok);
  assert.equal(s.pendingPlacement, null);
  assert.equal(p.canRedeploy, true);
  assert.equal(placementSquares(s, p.id).length, 0);
});

test('Game undo restores pre-move state including promotion', () => {
  const g = new Game(cfg(), 1);
  const s = g.state;
  for (const p of Object.values(s.pieces)) if (p.type !== 'K') { s.grid[p.sq] = 0; delete s.pieces[p.id]; }
  const p = put(s, 'P', 'player', 3, 1, 'N');
  assert.ok(g.move(p.id, sq(s, 3, 0)).ok);
  assert.ok(g.place(sq(g.state, 11, 10)).ok);
  assert.equal(g.state.pieces[p.id].type, 'N');
  g.undo();
  assert.ok(g.state.pendingPlacement);
  g.undo();
  assert.equal(g.state.pieces[p.id].type, 'P');
  assert.equal(g.state.pieces[p.id].sq, sq(g.state, 3, 1));
  assert.equal(g.state.ap, 4);
});

test('AP and one-move-per-piece limits', () => {
  const s = emptyState();
  kingAway(s);
  const rooks = [1, 3, 5, 7, 9].map((x) => put(s, 'R', 'player', x, 1));
  for (let i = 0; i < 4; i++) assert.ok(movePiece(s, rooks[i].id, sq(s, rooks[i].sq % 24, 2)).ok);
  assert.equal(s.ap, 0);
  assert.equal(movePiece(s, rooks[4].id, sq(s, 9, 2)).ok, false);
  endTurn(s);
  assert.equal(s.ap, 4);
  assert.ok(movePiece(s, rooks[0].id, sq(s, 1, 3)).ok);
  assert.equal(movePiece(s, rooks[0].id, sq(s, 1, 4)).ok, false, 'already moved');
});
