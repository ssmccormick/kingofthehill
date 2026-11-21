// Terrain: elevation grid, ramps, climb costs, deployment zone. Pure data, no DOM.

export const SIDES = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};
export const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

function centeredSpan(total, size) {
  const a = Math.floor((total - size) / 2);
  return [a, a + size - 1];
}

export function buildTerrain(cfg) {
  const { width: W, height: H, plateauSize: P, summitSize: S, ramps, deployZone, deployRingWidth: ring } = cfg.board;
  const n = W * H;
  const elev = new Array(n).fill(0);
  const rampSide = new Array(n).fill(null); // 'N'|'E'|'S'|'W' on ramp squares
  const deploy = new Array(n).fill(false);

  const [px0, px1] = centeredSpan(W, P);
  const [py0, py1] = centeredSpan(H, P);
  const [sx0, sx1] = centeredSpan(W, S);
  const [sy0, sy1] = centeredSpan(H, S);

  for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) elev[y * W + x] = 1;
  for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) elev[y * W + x] = 2;

  for (const r of ramps) {
    const start = r.start ?? Math.floor((P - r.width) / 2);
    for (let i = 0; i < r.width; i++) {
      const a = start + i;
      if (a < 0 || a >= P) continue;
      let x, y;
      if (r.side === 'N') { x = px0 + a; y = py0; }
      else if (r.side === 'S') { x = px0 + a; y = py1; }
      else if (r.side === 'W') { x = px0; y = py0 + a; }
      else { x = px1; y = py0 + a; }
      if (elev[y * W + x] === 1) rampSide[y * W + x] = r.side;
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (deployZone === 'plateau') deploy[i] = elev[i] === 1;
      else deploy[i] = elev[i] === 0 && x >= px0 - ring && x <= px1 + ring && y >= py0 - ring && y <= py1 + ring;
    }
  }

  return {
    width: W, height: H, elev, rampSide, deploy,
    plateau: { x0: px0, y0: py0, x1: px1, y1: py1 },
    summit: { x0: sx0, y0: sy0, x1: sx1, y1: sy1 },
  };
}

// Is from->to a ramp climb (one level up, onto a ramp square)? Ramp climbs are free.
export function isRampClimb(t, from, to) {
  return t.elev[to] - t.elev[from] === 1 && t.rampSide[to] !== null;
}

// Extra movement a climb costs, beyond the normal 1 per square. 0 for flat,
// downhill and ramp climbs; climbExtraCost per level otherwise.
export function climbExtra(t, cfg, from, to) {
  const diff = t.elev[to] - t.elev[from];
  if (diff <= 0) return 0;
  if (diff === 1 && isRampClimb(t, from, to)) return 0;
  return diff * cfg.terrain.climbExtraCost;
}

// Classifies the boundary between two ORTHOGONALLY adjacent squares for rendering.
export function edgeKind(t, a, b) {
  if (t.elev[a] === t.elev[b]) return 'flat';
  const [low, high] = t.elev[a] < t.elev[b] ? [a, b] : [b, a];
  return isRampClimb(t, low, high) ? 'ramp' : 'step';
}

export function isOnBoard(t, x, y) {
  return x >= 0 && y >= 0 && x < t.width && y < t.height;
}

// The square a pawn facing `facing` must reach to promote.
export function isFarEdge(t, sq, facing) {
  const x = sq % t.width, y = Math.floor(sq / t.width);
  if (facing === 'N') return y === 0;
  if (facing === 'S') return y === t.height - 1;
  if (facing === 'W') return x === 0;
  if (facing === 'E') return x === t.width - 1;
  return false;
}

// Direction an enemy spawned near this square faces: away from its nearest edge.
export function inwardFacing(t, sq) {
  const x = sq % t.width, y = Math.floor(sq / t.width);
  const d = [['N', y], ['S', t.height - 1 - y], ['W', x], ['E', t.width - 1 - x]];
  d.sort((a, b) => a[1] - b[1]);
  return OPPOSITE[d[0][0]];
}

// Edge squares an enemy of `type` may spawn on. Pawns are limited to the
// middle `pawnLaneWidth` squares of each edge; other pieces may use any edge square.
export function edgeSpawnSquares(t, spawnCfg, type) {
  const W = t.width, H = t.height;
  const out = [];
  if (type === 'P') {
    const lane = (len) => {
      const w = Math.min(spawnCfg.pawnLaneWidth, len);
      const a = Math.floor((len - w) / 2);
      return Array.from({ length: w }, (_, i) => a + i);
    };
    for (const x of lane(W)) out.push(x, (H - 1) * W + x); // N and S edges
    for (const y of lane(H)) out.push(y * W, y * W + W - 1); // W and E edges
    return out;
  }
  for (let sq = 0; sq < W * H; sq++) {
    const x = sq % W, y = Math.floor(sq / W);
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) out.push(sq);
  }
  return out;
}

// Which board edge a square is on ('N'|'S'|'W'|'E'), or null. Corners report N/S.
export function edgeSide(t, sq) {
  const x = sq % t.width, y = Math.floor(sq / t.width);
  if (y === 0) return 'N';
  if (y === t.height - 1) return 'S';
  if (x === 0) return 'W';
  if (x === t.width - 1) return 'E';
  return null;
}

// Movement-cost distance from every square to `target`, moving one square at a
// time (8 directions) and paying climb costs. Ignores pieces. Used by the AI.
export function distanceField(t, cfg, target) {
  const W = t.width, H = t.height, n = W * H;
  const dist = new Array(n).fill(Infinity);
  dist[target] = 0;
  // Costs are small integers (1..3), so a bucket queue is enough.
  const buckets = [[target]];
  for (let d = 0; d < buckets.length; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (const to of bucket) {
      if (dist[to] !== d) continue;
      const tx = to % W, ty = Math.floor(to / W);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const from = y * W + x; // stepping from `from` into `to`
        const nd = d + 1 + climbExtra(t, cfg, from, to);
        if (nd < dist[from]) {
          dist[from] = nd;
          (buckets[nd] ||= []).push(from);
        }
      }
    }
  }
  return dist;
}
