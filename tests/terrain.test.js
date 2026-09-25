import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, fullGame, put, sq, targets } from './helpers.js';
import { pseudoMoves, isInCheck } from '../src/logic/moves.js';
import { edgeKind, distanceField, edgeSpawnSquares } from '../src/logic/terrain.js';

// Default geometry on 24x24: plateau (level 1) x,y 10..13; summit (level 2) 11..12.
// Ramps: N (11,10)(12,10) · S (11,13)(12,13) · W (10,11)(10,12) · E (13,11)(13,12).

test('default terrain: 4x4 hill base, 2x2 summit, 2-wide ramps centered on each side', () => {
  const s = emptyState();
  const t = s.terrain;
  assert.equal(t.elev[sq(s, 9, 9)], 0);
  assert.equal(t.elev[sq(s, 10, 10)], 1);
  assert.equal(t.elev[sq(s, 13, 13)], 1);
  assert.equal(t.elev[sq(s, 14, 13)], 0);
  for (const [x, y] of [[11, 11], [12, 11], [11, 12], [12, 12]]) assert.equal(t.elev[sq(s, x, y)], 2);
  const ramps = [];
  t.rampSide.forEach((r, i) => r && ramps.push(`${r}:${i % 24},${Math.floor(i / 24)}`));
  assert.deepEqual(ramps.sort(), ['E:13,11', 'E:13,12', 'N:11,10', 'N:12,10', 'S:11,13', 'S:12,13', 'W:10,11', 'W:10,12'].sort());
});

test('deployment zone is the hill base (all 12 level-1 squares)', () => {
  const s = emptyState();
  const d = s.terrain.deploy;
  assert.equal(d.filter(Boolean).length, 12);
  assert.ok(d[sq(s, 10, 10)] && d[sq(s, 11, 10)] && d[sq(s, 13, 13)]);
  assert.ok(!d[sq(s, 11, 11)] && !d[sq(s, 9, 9)]);
});

test("deployZone 'ring' uses the level-0 ring of configurable width", () => {
  const s = emptyState({ board: { deployZone: 'ring', deployRingWidth: 1 } });
  assert.equal(s.terrain.deploy.filter(Boolean).length, 6 * 6 - 4 * 4);
  const s2 = emptyState({ board: { deployZone: 'ring', deployRingWidth: 2 } });
  assert.equal(s2.terrain.deploy.filter(Boolean).length, 8 * 8 - 4 * 4);
});

test('ramp count/width/position configurable', () => {
  const s = emptyState({ board: { ramps: [{ side: 'N', start: 0, width: 3 }] } });
  assert.equal(s.terrain.rampSide.filter(Boolean).length, 3);
  assert.equal(s.terrain.rampSide[sq(s, 10, 10)], 'N');
  assert.equal(s.terrain.rampSide[sq(s, 13, 10)], null);
});

test('edge kinds: ramps vs steps', () => {
  const t = emptyState().terrain;
  const s = { terrain: t };
  assert.equal(edgeKind(t, sq(s, 11, 9), sq(s, 11, 10)), 'ramp');
  assert.equal(edgeKind(t, sq(s, 10, 9), sq(s, 10, 10)), 'step');
  assert.equal(edgeKind(t, sq(s, 11, 10), sq(s, 11, 11)), 'step', 'summit has no ramps');
  assert.equal(edgeKind(t, sq(s, 3, 3), sq(s, 4, 3)), 'flat');
});

test('a step up costs 2 movement for sliders', () => {
  const s = emptyState();
  // 4 flat squares (y 6..9) + step onto (10,10) = 6, + (10,11) = 7 = range.
  const r = put(s, 'R', 'player', 10, 5);
  const t = targets(s, pseudoMoves(s, r));
  assert.ok(t.includes('10,10') && t.includes('10,11'));
  assert.ok(!t.includes('10,12'));
  // From (10,3): 6 flat + 2 for the step = 8 > 7, so it can't reach the hill.
  const r2 = put(s, 'R', 'player', 9, 3);
  s.grid[r2.sq] = 0; r2.sq = sq(s, 13, 3); s.grid[r2.sq] = r2.id;
  const t2 = targets(s, pseudoMoves(s, r2));
  assert.ok(t2.includes('13,9') && !t2.includes('13,10'));
});

test('climbing a ramp costs nothing extra', () => {
  const s = emptyState();
  // y 6..9 = 4, ramp (11,10) = 5, summit step (11,11) = 7.
  const r = put(s, 'R', 'player', 11, 5);
  const t = targets(s, pseudoMoves(s, r));
  assert.ok(t.includes('11,10') && t.includes('11,11') && !t.includes('11,12'));
});

test('king, pawns and knights can only climb via ramps', () => {
  const s = emptyState();
  const k = put(s, 'K', 'player', 10, 9);
  const kt = targets(s, pseudoMoves(s, k));
  assert.ok(kt.includes('11,10'), 'diagonal onto ramp');
  assert.ok(!kt.includes('10,10'), 'no stepping up onto a non-ramp square');
  const k2 = put(s, 'K', 'enemy', 12, 10); // standing on a ramp
  assert.ok(!targets(s, pseudoMoves(s, k2)).includes('12,11'), 'summit has no ramp');

  const p = put(s, 'P', 'enemy', 13, 9, 'S');
  assert.deepEqual(targets(s, pseudoMoves(s, p)), [], 'blocked by the step');
  const p2 = put(s, 'P', 'enemy', 12, 8, 'S');
  assert.deepEqual(targets(s, pseudoMoves(s, p2)), ['12,9']);

  const n = put(s, 'N', 'enemy', 10, 8);
  const nt = targets(s, pseudoMoves(s, n));
  assert.ok(nt.includes('11,10'), 'knight onto ramp');
  const n2 = put(s, 'N', 'enemy', 14, 8);
  assert.ok(!targets(s, pseudoMoves(s, n2)).includes('13,10'), 'knight onto a non-ramp step');
});

test('enemy pawn may capture diagonally onto a ramp but not up a step', () => {
  const s = emptyState();
  const p = put(s, 'P', 'enemy', 10, 9, 'S');
  put(s, 'N', 'player', 11, 10);
  put(s, 'N', 'player', 9, 10);
  assert.deepEqual(targets(s, pseudoMoves(s, p)), ['11,10', '9,10']);
  const s2 = emptyState();
  const p3 = put(s2, 'P', 'enemy', 14, 9, 'S');
  put(s2, 'N', 'player', 13, 10); // corner step
  assert.ok(!targets(s2, pseudoMoves(s2, p3)).includes('13,10'));
});

test('Cliff Jumper mod: player knights ignore climb cost, enemy knights do not', () => {
  const s = emptyState();
  const pn = put(s, 'N', 'player', 13, 10);
  const en = put(s, 'N', 'enemy', 10, 13);
  assert.ok(!targets(s, pseudoMoves(s, pn)).includes('12,12'));
  s.mods.knightsIgnoreClimb = true;
  assert.ok(targets(s, pseudoMoves(s, pn)).includes('12,12'));
  assert.ok(!targets(s, pseudoMoves(s, en)).includes('11,11'));
});

test('moving down costs nothing extra, for both sides', () => {
  const s = emptyState();
  const pr = put(s, 'R', 'player', 10, 10); // range 8 on the plateau
  const t = targets(s, pseudoMoves(s, pr));
  assert.ok(t.includes('2,10') && !t.includes('1,10'));
  const er = put(s, 'R', 'enemy', 13, 13);
  const et = targets(s, pseudoMoves(s, er));
  assert.ok(et.includes('13,20') && !et.includes('13,21'));
});

test('enemy climb stop: an enemy slider ends its move on the first higher square', () => {
  const s = emptyState();
  const er = put(s, 'R', 'enemy', 10, 5);
  const t = targets(s, pseudoMoves(s, er));
  assert.ok(t.includes('10,10') && !t.includes('10,11'));
  const eq = put(s, 'Q', 'enemy', 11, 7);
  const qt = targets(s, pseudoMoves(s, eq));
  assert.ok(qt.includes('11,10') && !qt.includes('11,11'), 'stops on the ramp too');
});

test('enemyClimbStops and climbExtraCost are configurable', () => {
  const s = emptyState({ movement: { enemyClimbStops: false } });
  const er = put(s, 'R', 'enemy', 10, 5);
  assert.ok(targets(s, pseudoMoves(s, er)).includes('10,11'));
  const s2 = emptyState({ terrain: { climbExtraCost: 0 } });
  const p = put(s2, 'P', 'enemy', 13, 9, 'S');
  p.hasMoved = true;
  assert.deepEqual(targets(s2, pseudoMoves(s2, p)), ['13,10']);
});

test('climb cost also limits attacks (and so check)', () => {
  const s = emptyState();
  put(s, 'K', 'player', 10, 10);
  const r = put(s, 'R', 'enemy', 10, 3); // 6 flat + 2 = 8 > 7
  assert.equal(isInCheck(s), false);
  s.grid[r.sq] = 0; r.sq = sq(s, 10, 4); s.grid[r.sq] = r.id; // 5 + 2 = 7
  assert.equal(isInCheck(s), true);
});

test('distance field charges climb costs', () => {
  const s = emptyState();
  const d = distanceField(s.terrain, s.config, sq(s, 11, 11));
  assert.equal(d[sq(s, 11, 11)], 0);
  assert.equal(d[sq(s, 11, 10)], 2, 'ramp -> summit is a step');
  assert.equal(d[sq(s, 11, 9)], 3, 'ground -> ramp is free, then the step');
  assert.equal(d[sq(s, 11, 5)], 7);
});

test('starting army: summit K/Q/R/R, bishops and knights on corners, pawns on ramps facing out', () => {
  const s = fullGame();
  const ps = Object.values(s.pieces);
  assert.equal(ps.length, 16);
  const count = (t) => ps.filter((p) => p.type === t).length;
  assert.deepEqual([count('K'), count('Q'), count('R'), count('B'), count('N'), count('P')], [1, 1, 2, 2, 2, 8]);
  for (const p of ps.filter((p) => 'KQR'.includes(p.type))) assert.equal(s.terrain.elev[p.sq], 2);
  for (const p of ps.filter((p) => 'BN'.includes(p.type))) assert.equal(s.terrain.elev[p.sq], 1);
  for (const p of ps.filter((p) => p.type === 'P')) assert.equal(s.terrain.rampSide[p.sq], p.facing);
});

test('enemy pawns spawn only in the middle 4 squares of each edge', () => {
  const s = emptyState();
  const pawn = edgeSpawnSquares(s.terrain, s.config.spawn, 'P').map((q) => `${q % 24},${Math.floor(q / 24)}`).sort();
  const expected = [];
  for (const i of [10, 11, 12, 13]) expected.push(`${i},0`, `${i},23`, `0,${i}`, `23,${i}`);
  assert.deepEqual(pawn, expected.sort());
  assert.equal(edgeSpawnSquares(s.terrain, s.config.spawn, 'R').length, 4 * 24 - 4);
  const s6 = emptyState({ spawn: { pawnLaneWidth: 6 } });
  assert.equal(edgeSpawnSquares(s6.terrain, s6.config.spawn, 'P').length, 24);
});
