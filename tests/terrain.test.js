import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, fullGame, put, sq, targets } from './helpers.js';
import { pseudoMoves } from '../src/logic/moves.js';
import { edgeKind } from '../src/logic/terrain.js';

test('default terrain: 8x8 plateau, 2x2 summit, 2-wide ramps centered on each side', () => {
  const s = emptyState();
  const t = s.terrain;
  assert.equal(t.elev[sq(s, 7, 7)], 0);
  assert.equal(t.elev[sq(s, 8, 8)], 1);
  assert.equal(t.elev[sq(s, 15, 15)], 1);
  assert.equal(t.elev[sq(s, 16, 15)], 0);
  for (const [x, y] of [[11, 11], [12, 11], [11, 12], [12, 12]]) assert.equal(t.elev[sq(s, x, y)], 2);
  assert.equal(t.elev[sq(s, 10, 11)], 1);
  const ramps = [];
  t.rampSide.forEach((r, i) => r && ramps.push(`${r}:${i % 24},${Math.floor(i / 24)}`));
  assert.deepEqual(ramps.sort(), ['E:15,11', 'E:15,12', 'N:11,8', 'N:12,8', 'S:11,15', 'S:12,15', 'W:8,11', 'W:8,12'].sort());
});

test('deployment zone is the 1-wide level-0 ring around the hill', () => {
  const s = emptyState();
  const d = s.terrain.deploy;
  assert.ok(d[sq(s, 7, 7)] && d[sq(s, 7, 12)] && d[sq(s, 16, 16)] && d[sq(s, 12, 16)]);
  assert.ok(!d[sq(s, 6, 12)] && !d[sq(s, 8, 8)] && !d[sq(s, 12, 17)]);
  assert.equal(d.filter(Boolean).length, 10 * 10 - 8 * 8);
});

test('deploy ring width is configurable', () => {
  const s = emptyState({ board: { deployRingWidth: 2 } });
  assert.equal(s.terrain.deploy.filter(Boolean).length, 12 * 12 - 8 * 8);
});

test('ramp count/width/position configurable', () => {
  const s = emptyState({ board: { ramps: [{ side: 'N', start: 0, width: 3 }] } });
  const ramps = s.terrain.rampSide.filter(Boolean);
  assert.equal(ramps.length, 3);
  assert.equal(s.terrain.rampSide[sq(s, 8, 8)], 'N');
  assert.equal(s.terrain.rampSide[sq(s, 11, 8)], null);
});

test('edge kinds: cliffs vs ramps vs summit steps', () => {
  const s = emptyState();
  const t = s.terrain;
  assert.equal(edgeKind(t, sq(s, 9, 7), sq(s, 9, 8)), 'cliff');
  assert.equal(edgeKind(t, sq(s, 11, 7), sq(s, 11, 8)), 'passable');
  assert.equal(edgeKind(t, sq(s, 11, 10), sq(s, 11, 11)), 'passable');
  assert.equal(edgeKind(t, sq(s, 3, 3), sq(s, 4, 3)), 'flat');
});

test('nobody slides up a cliff', () => {
  const s = emptyState();
  const pr = put(s, 'R', 'player', 9, 3);
  const er = put(s, 'R', 'enemy', 10, 3);
  assert.ok(!targets(s, pseudoMoves(s, pr)).includes('9,8'));
  assert.ok(targets(s, pseudoMoves(s, pr)).includes('9,7'));
  assert.ok(!targets(s, pseudoMoves(s, er)).includes('10,8'));
});

test('king cannot step up a cliff but can use a ramp', () => {
  const s = emptyState();
  const k = put(s, 'K', 'player', 10, 7);
  const t = targets(s, pseudoMoves(s, k));
  assert.ok(t.includes('11,8'), 'diagonal onto ramp');
  assert.ok(!t.includes('10,8') && !t.includes('9,8'));
});

test('player may drop down a cliff; enemy may not (but may walk down a ramp)', () => {
  const s = emptyState();
  const pr = put(s, 'R', 'player', 9, 9);
  assert.ok(targets(s, pseudoMoves(s, pr)).includes('9,7'));
  const er = put(s, 'R', 'enemy', 10, 9);
  const et = targets(s, pseudoMoves(s, er));
  assert.ok(et.includes('10,8') && !et.includes('10,7'));
  const ramp = put(s, 'R', 'enemy', 11, 8);
  assert.ok(targets(s, pseudoMoves(s, ramp)).includes('11,3'));
});

test('enemy climb cost: slider stops on the first higher square it enters', () => {
  const s = emptyState();
  const er = put(s, 'R', 'enemy', 11, 3);
  const t = targets(s, pseudoMoves(s, er));
  assert.ok(t.includes('11,8'));
  assert.ok(!t.includes('11,9'));
  // Onto the summit from the plateau: also stops.
  const er2 = put(s, 'R', 'enemy', 12, 14);
  const t2 = targets(s, pseudoMoves(s, er2));
  assert.ok(t2.includes('12,13') && t2.includes('12,12') && !t2.includes('12,11'));
});

test('player sliders do not stop when climbing', () => {
  const s = emptyState();
  const pr = put(s, 'R', 'player', 11, 3);
  const t = targets(s, pseudoMoves(s, pr));
  assert.ok(t.includes('11,8') && t.includes('11,9') && t.includes('11,10'));
  const pr2 = put(s, 'R', 'player', 12, 14);
  assert.ok(targets(s, pseudoMoves(s, pr2)).includes('12,10'));
});

test('enemyClimbStops is configurable', () => {
  const s = emptyState({ movement: { enemyClimbStops: false } });
  const er = put(s, 'R', 'enemy', 11, 3);
  assert.ok(targets(s, pseudoMoves(s, er)).includes('11,9'));
});

test('knights: onto ramps and summit only via legal climbs; Cliff Jumper lifts it for player knights', () => {
  const s = emptyState();
  const n1 = put(s, 'N', 'enemy', 10, 6);
  assert.ok(targets(s, pseudoMoves(s, n1)).includes('11,8'), 'onto ramp');
  assert.ok(!targets(s, pseudoMoves(s, n1)).includes('9,8'), 'not up a cliff');
  const n2 = put(s, 'N', 'enemy', 13, 10); // summit-adjacent
  assert.ok(targets(s, pseudoMoves(s, n2)).includes('12,12'));
  const n3 = put(s, 'N', 'player', 14, 13); // not summit-adjacent
  assert.ok(!targets(s, pseudoMoves(s, n3)).includes('12,12'));
  s.mods.knightsClimbCliffs = true;
  assert.ok(targets(s, pseudoMoves(s, n3)).includes('12,12'));
  assert.ok(!targets(s, pseudoMoves(s, n1)).includes('9,8'), 'enemy knights still cannot');
});

test('attacks respect terrain: an enemy below a cliff does not attack the plateau', () => {
  const s = emptyState();
  put(s, 'K', 'player', 9, 8);
  put(s, 'R', 'enemy', 9, 3);
  assert.equal(pseudoMoves(s, s.pieces[2]).some((m) => m.to === sq(s, 9, 8)), false);
});

test('starting army: 16 pieces, K+Q on summit, pawns flanking each ramp facing outward', () => {
  const s = fullGame();
  const ps = Object.values(s.pieces);
  assert.equal(ps.length, 16);
  const count = (t) => ps.filter((p) => p.type === t).length;
  assert.deepEqual([count('K'), count('Q'), count('R'), count('B'), count('N'), count('P')], [1, 1, 2, 2, 2, 8]);
  for (const p of ps.filter((p) => p.type === 'K' || p.type === 'Q')) assert.equal(s.terrain.elev[p.sq], 2);
  for (const p of ps.filter((p) => p.type === 'P')) {
    assert.equal(s.terrain.elev[p.sq], 1);
    assert.equal(s.terrain.rampSide[p.sq], null);
  }
  const north = ps.filter((p) => p.type === 'P' && p.facing === 'N').map((p) => p.sq).sort((a, b) => a - b);
  assert.deepEqual(north, [sq(s, 10, 8), sq(s, 13, 8)]);
});
