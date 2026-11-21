import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modeState, put, sq, xy } from './helpers.js';
import { planSpawns, executeSpawns, waveComposition, turnsUntilWave, skipToNextWave } from '../src/logic/spawn.js';
import { endTurn, movePiece } from '../src/logic/actions.js';
import { edgeSide } from '../src/logic/terrain.js';

const enemies = (s) => Object.values(s.pieces).filter((p) => p.side === 'enemy');
const lane = (v) => v >= 10 && v <= 13;
function start(mode, overrides) {
  const s = modeState(mode, overrides);
  put(s, 'K', 'player', 11, 11);
  planSpawns(s);
  return s;
}

test('wave composition comes from the config table', () => {
  const s = modeState('campaign');
  assert.deepEqual(waveComposition(s, 1), Array(8).fill('P'));
  const w10 = waveComposition(s, 10);
  const count = (t) => w10.filter((x) => x === t).length;
  assert.deepEqual([count('P'), count('N'), count('B'), count('R'), count('Q')], [16, 4, 4, 4, 2]);
});

test('endless waves past the table grow and get stronger (deterministically)', () => {
  const a = modeState('endless'), b = modeState('endless');
  const w14a = waveComposition(a, 14), w14b = waveComposition(b, 14);
  assert.deepEqual(w14a, w14b);
  assert.equal(w14a.length, Math.round(16 * 1.6) + Math.round(4 * 1.6) * 3 + Math.round(2 * 1.6));
  assert.ok(w14a.filter((t) => t === 'P').length < Math.round(16 * 1.6), 'some pawns upgraded');
});

test('wave 1 is telegraphed on turn 1 and appears at the end of it', () => {
  const s = start('campaign');
  const sp = s.spawns;
  assert.equal(sp.pendingWave, 1);
  assert.equal(sp.pending.length, 8);
  assert.equal(enemies(s).length, 0, 'markers only, nothing on the board yet');
  const sides = {};
  for (const p of sp.pending) {
    const [x, y] = xy(s, p.sq);
    assert.ok((y === 0 || y === 23) ? lane(x) : lane(y), 'pawns in the middle lanes');
    sides[edgeSide(s.terrain, p.sq)] = (sides[edgeSide(s.terrain, p.sq)] || 0) + 1;
  }
  assert.deepEqual(Object.values(sides), [2, 2, 2, 2], 'spread over all four sides');
  const planned = sp.pending.map((p) => p.sq).sort((a, b) => a - b);
  assert.ok(endTurn(s).ok);
  assert.deepEqual(enemies(s).map((p) => p.sq).sort((a, b) => a - b), planned);
  assert.ok(enemies(s).every((p) => p.wave === 1));
  assert.equal(s.spawns.wavesSpawned, 1);
  assert.equal(s.spawns.nextWaveTurn, 9);
});

test('spawned enemies face the center', () => {
  const s = start('campaign');
  endTurn(s);
  for (const p of enemies(s)) {
    const side = edgeSide(s.terrain, p.sq);
    assert.equal(p.facing, { N: 'S', S: 'N', W: 'E', E: 'W' }[side]);
  }
});

test('trickle: one enemy every 2 turns between waves; next wave after the interval', () => {
  const s = start('campaign');
  const perTurn = [];
  for (let i = 0; i < 9; i++) {
    // pending + carry: with the AI off, wave-1 pawns still block some lanes
    perTurn.push([s.turn, s.spawns.pending.length + s.spawns.carry.length, s.spawns.pendingWave]);
    endTurn(s);
  }
  assert.deepEqual(perTurn, [
    [1, 8, 1], [2, 0, null], [3, 1, null], [4, 0, null], [5, 1, null],
    [6, 0, null], [7, 1, null], [8, 0, null], [9, 10, 2],
  ]);
});

test('trickle piece types follow the configured weights', () => {
  const s = start('campaign', { spawn: { trickle: { weights: { P: 0, N: 0, B: 0, R: 1 } } } });
  endTurn(s); endTurn(s);
  assert.equal(s.spawns.pending.length, 1);
  assert.equal(s.spawns.pending[0].type, 'R');
});

test('turns until next wave', () => {
  const s = start('campaign');
  assert.equal(turnsUntilWave(s), 0);
  endTurn(s);
  assert.equal(turnsUntilWave(s), 7);
});

test('a marked square that is occupied at spawn time moves the spawn along the same edge', () => {
  const s = start('campaign');
  const target = s.spawns.pending[0];
  const side = edgeSide(s.terrain, target.sq);
  put(s, 'N', 'player', ...xy(s, target.sq));
  endTurn(s);
  const w1 = enemies(s);
  assert.equal(w1.length, 8);
  assert.ok(w1.every((p) => p.sq !== target.sq));
  assert.equal(w1.filter((p) => edgeSide(s.terrain, p.sq) === side).length, 2);
});

test('enemies never spawn on occupied squares; overflow is carried to the next turn', () => {
  const s = start('campaign', { spawn: { waves: { table: [{ P: 20 }] } } });
  assert.equal(s.spawns.pending.length, 16, 'only 16 pawn-lane squares exist');
  assert.equal(s.spawns.carry.length, 4);
  endTurn(s);
  assert.equal(enemies(s).length, 16);
  assert.equal(s.spawns.pending.length, 0, 'lanes still full: nothing can be placed');
  assert.equal(s.spawns.carry.length, 4);
  // Free two lane squares; the carried pawns take them next turn.
  const lanePawns = enemies(s).filter((p) => edgeSide(s.terrain, p.sq) === 'N');
  for (const p of lanePawns.slice(0, 2)) { s.grid[p.sq] = 0; delete s.pieces[p.id]; }
  endTurn(s);
  assert.equal(s.spawns.pending.length, 2);
  assert.ok(s.spawns.pending.every((p) => p.wave === 1));
});

test('campaign: win when the final wave is destroyed; score = captures + wave bonus', () => {
  const s = start('campaign', { modes: { campaignWaves: 1 }, spawn: { waves: { table: [{ P: 1 }] } } });
  endTurn(s);
  const [e] = enemies(s);
  assert.equal(turnsUntilWave(s), null, 'no waves left');
  assert.equal(s.spawns.pending.length, 0, 'no trickle after the final wave');
  const [x, y] = xy(s, e.sq);
  const r = put(s, 'R', 'player', x, y === 0 ? 3 : y === 23 ? 20 : y);
  if (x === 0 || x === 23) { s.grid[r.sq] = 0; r.sq = sq(s, x === 0 ? 3 : 20, y); s.grid[r.sq] = r.id; }
  assert.ok(movePiece(s, r.id, e.sq).ok);
  assert.equal(s.status, 'won');
  assert.equal(s.score, 1 + 10);
});

test('wave bonus scales with the wave number', () => {
  const s = start('endless', { spawn: { waves: { table: [{ P: 1 }], interval: 2 }, trickle: { enabled: false } } });
  endTurn(s); // wave 1 spawns
  for (const e of enemies(s)) { s.grid[e.sq] = 0; delete s.pieces[e.id]; }
  endTurn(s); // wave 1 cleared (+10); wave 2 planned
  assert.equal(s.score, 10);
  endTurn(s); // wave 2 spawns
  for (const e of enemies(s)) { s.grid[e.sq] = 0; delete s.pieces[e.id]; }
  endTurn(s);
  assert.equal(s.score, 10 + 20);
  assert.equal(s.status, 'playing', 'endless never wins');
});

test('sandbox mode never spawns', () => {
  const s = start('sandbox');
  for (let i = 0; i < 10; i++) endTurn(s);
  assert.equal(enemies(s).length, 0);
  assert.equal(turnsUntilWave(s), null);
});

test('skip to next wave: the next wave is telegraphed this turn', () => {
  const s = start('campaign');
  endTurn(s);
  assert.equal(s.spawns.pendingWave, null);
  assert.ok(skipToNextWave(s));
  assert.equal(s.spawns.pendingWave, 2);
  assert.equal(s.spawns.pending.length, 10);
  endTurn(s);
  assert.equal(s.spawns.wavesSpawned, 2);
  assert.equal(s.spawns.nextWaveTurn, s.turn - 1 + 8);
});

test('spawning is deterministic for a seed', () => {
  const run = () => {
    const s = start('endless');
    const seen = [];
    for (let i = 0; i < 12; i++) { seen.push(s.spawns.pending.map((p) => `${p.type}${p.sq}`).join()); endTurn(s); }
    return seen;
  };
  assert.deepEqual(run(), run());
});

test('full game with AI on runs many turns without errors', async () => {
  const { Game } = await import('../src/logic/game.js');
  const { cfg } = await import('./helpers.js');
  const g = new Game(cfg(), 3, 'endless');
  for (let i = 0; i < 40 && g.state.status === 'playing'; i++) {
    const res = g.endTurn();
    if (!res.ok) break; // king in check: a real player must respond
  }
  assert.ok(g.state.turn > 1);
});
