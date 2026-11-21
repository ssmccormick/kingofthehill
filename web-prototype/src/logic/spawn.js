// Enemy spawning: waves, trickle, telegraphed spawn markers, wave clears,
// campaign win. Pure logic, no DOM.
import { edgeSpawnSquares, edgeSide, inwardFacing } from './terrain.js';
import { addPiece, log, sqName, PIECE_NAMES } from './state.js';
import { rngNext, rngInt } from './rng.js';

const TIERS = ['P', 'N', 'B', 'R', 'Q'];
const UPGRADE = { P: 'N', N: 'B', B: 'R', R: 'Q', Q: 'Q', K: 'K' };

export function spawningActive(state) {
  return state.mode === 'campaign' || state.mode === 'endless';
}

export function totalWaves(state) {
  return state.mode === 'campaign' ? state.config.modes.campaignWaves : Infinity;
}

// Piece types for wave `w` (1-based). Past the end of the table (Endless),
// the last row grows in size and pieces may be upgraded a tier.
export function waveComposition(state, w) {
  const { table, endless } = state.config.spawn.waves;
  const row = table[Math.min(w, table.length) - 1];
  const past = Math.max(0, w - table.length);
  const mult = 1 + endless.sizeGrowthPerWave * past;
  let list = [];
  for (const t of [...TIERS, 'K']) {
    const n = Math.round((row[t] || 0) * mult);
    for (let i = 0; i < n; i++) list.push(t);
  }
  if (past) {
    const chance = Math.min(endless.maxUpgradeChance, endless.upgradeChancePerWave * past);
    list = list.map((t) => (rngNext(state) < chance ? UPGRADE[t] : t));
  }
  return list;
}

function weightedPick(state, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let r = rngNext(state) * entries.reduce((a, [, w]) => a + w, 0);
  for (const [type, w] of entries) if ((r -= w) < 0) return type;
  return entries[entries.length - 1][0];
}

// Free spawn squares for `type`, grouped by edge side.
function freeSquaresBySide(state, type, reserved) {
  const by = { N: [], E: [], S: [], W: [] };
  for (const sq of edgeSpawnSquares(state.terrain, state.config.spawn, type)) {
    if (!state.grid[sq] && !reserved.has(sq)) by[edgeSide(state.terrain, sq)].push(sq);
  }
  return by;
}

// Picks a square for one spawn, preferring `side`, else the next side round.
function pickSquare(state, type, side, reserved) {
  const by = freeSquaresBySide(state, type, reserved);
  const order = ['N', 'E', 'S', 'W'];
  const start = order.indexOf(side);
  for (let i = 0; i < 4; i++) {
    const list = by[order[(start + i) % 4]];
    if (list.length) return list[rngInt(state, list.length)];
  }
  return null;
}

// Assigns squares to a list of { type, wave }, spreading them over the four
// sides (rotating from a random starting side). Returns { placed, unplaced }.
function assignSquares(state, items) {
  const order = ['N', 'E', 'S', 'W'];
  const offset = rngInt(state, 4);
  const reserved = new Set();
  const placed = [], unplaced = [];
  items.forEach((item, i) => {
    const sq = pickSquare(state, item.type, order[(offset + i) % 4], reserved);
    if (sq == null) unplaced.push(item);
    else { reserved.add(sq); placed.push({ ...item, sq }); }
  });
  return { placed, unplaced };
}

function trickleDue(state) {
  const sp = state.spawns, tr = state.config.spawn.trickle;
  if (!tr.enabled || sp.wavesSpawned === 0 || sp.wavesSpawned >= totalWaves(state)) return false;
  const since = state.turn - sp.lastWaveTurn;
  return since > 0 && since % tr.interval === 0;
}

// Plans the spawns that will appear at the end of the current turn. Called
// at the start of each player turn; the result is shown as edge markers.
export function planSpawns(state) {
  const sp = state.spawns;
  sp.pendingWave = null;
  if (!spawningActive(state)) { sp.pending = []; return sp.pending; }
  const items = sp.carry.splice(0);
  if (state.turn >= sp.nextWaveTurn && sp.wavesSpawned < totalWaves(state)) {
    sp.pendingWave = sp.wavesSpawned + 1;
    for (const type of waveComposition(state, sp.pendingWave)) items.push({ type, wave: sp.pendingWave });
  } else if (trickleDue(state)) {
    const tr = state.config.spawn.trickle;
    for (let i = 0; i < tr.count; i++) items.push({ type: weightedPick(state, tr.weights), wave: null });
  }
  const { placed, unplaced } = assignSquares(state, items);
  sp.pending = placed;
  sp.carry.push(...unplaced);
  return sp.pending;
}

// Puts the planned spawns on the board (end of the enemy phase). A marked
// square that is now occupied moves the spawn to another free square
// (same side first); if none is free, it is carried over to next turn.
export function executeSpawns(state) {
  const sp = state.spawns;
  const spawned = [];
  const reserved = new Set();
  for (const s of sp.pending) {
    let sq = s.sq;
    if (state.grid[sq]) sq = pickSquare(state, s.type, edgeSide(state.terrain, s.sq), reserved);
    if (sq == null) { sp.carry.push({ type: s.type, wave: s.wave }); continue; }
    const p = addPiece(state, { type: s.type, side: 'enemy', sq, facing: inwardFacing(state.terrain, sq) });
    p.wave = s.wave;
    spawned.push(p);
  }
  if (sp.pendingWave) {
    const w = sp.pendingWave;
    sp.wavesSpawned = w;
    sp.lastWaveTurn = state.turn;
    sp.nextWaveTurn = state.turn + state.config.spawn.waves.interval;
    sp.open.push(w);
    const total = totalWaves(state);
    log(state, `Wave ${w}${Number.isFinite(total) ? `/${total}` : ''} arrives: ${spawned.length} enemies${sp.carry.length ? ` (${sp.carry.length} delayed, edge full)` : ''}`);
  } else {
    for (const p of spawned) log(state, `Enemy ${PIECE_NAMES[p.type]} arrives at ${sqName(state, p.sq)}`);
  }
  sp.pending = [];
  sp.pendingWave = null;
  return spawned;
}

// Wave-clear bonuses and the campaign win. Call after anything that can
// remove enemies or spawn them.
export function checkProgress(state) {
  if (state.status !== 'playing') return;
  const sp = state.spawns;
  const alive = new Set();
  for (const p of Object.values(state.pieces)) if (p.side === 'enemy' && p.wave != null) alive.add(p.wave);
  for (const s of [...sp.pending, ...sp.carry]) if (s.wave != null) alive.add(s.wave);
  for (const w of [...sp.open]) {
    if (alive.has(w)) continue;
    sp.open.splice(sp.open.indexOf(w), 1);
    const bonus = state.config.scoring.waveClearBonus * w;
    state.score += bonus;
    log(state, `Wave ${w} destroyed! +${bonus} score`);
  }
  if (state.mode === 'campaign' && sp.wavesSpawned >= totalWaves(state) && !sp.pending.length && !sp.carry.length
      && !Object.values(state.pieces).some((p) => p.side === 'enemy')) {
    state.status = 'won';
    log(state, `Victory! All ${sp.wavesSpawned} waves survived. Score ${state.score}.`);
  }
}

// Turns until the next wave appears (0 = at the end of this turn), or null if none left.
export function turnsUntilWave(state) {
  const sp = state.spawns;
  if (!spawningActive(state) || sp.wavesSpawned >= totalWaves(state)) return null;
  return Math.max(0, sp.nextWaveTurn - state.turn);
}

// Dev: make the next wave arrive at the end of this turn (markers show now).
export function skipToNextWave(state) {
  const sp = state.spawns;
  if (!spawningActive(state) || sp.wavesSpawned >= totalWaves(state)) return false;
  sp.carry.unshift(...sp.pending.map(({ type, wave }) => ({ type, wave })));
  sp.nextWaveTurn = state.turn;
  planSpawns(state);
  return true;
}
