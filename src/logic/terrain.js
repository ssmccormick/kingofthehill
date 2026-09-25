// Terrain: elevation grid, ramps, cliffs, deployment zone. Pure data, no DOM.

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
  const { width: W, height: H, plateauSize: P, summitSize: S, ramps, deployRingWidth: ring } = cfg.board;
  const n = W * H;
  const elev = new Array(n).fill(0);
  const rampSide = new Array(n).fill(null); // 'N'|'E'|'S'|'W' on ramp squares
  const deploy = new Array(n).fill(false);
  const summitAdj = new Array(n).fill(false);

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
      if (elev[i] === 0 && x >= px0 - ring && x <= px1 + ring && y >= py0 - ring && y <= py1 + ring) deploy[i] = true;
      if (elev[i] === 1) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && elev[ny * W + nx] === 2) summitAdj[i] = true;
        }
      }
    }
  }

  return {
    width: W, height: H, elev, rampSide, deploy, summitAdj,
    plateau: { x0: px0, y0: py0, x1: px1, y1: py1 },
    summit: { x0: sx0, y0: sy0, x1: sx1, y1: sy1 },
  };
}

// True if a piece may climb from `low` up to `high` (exactly one level) without
// crossing a cliff: 0->1 only onto a ramp square, 1->2 only from a plateau
// square adjacent to the summit.
export function isClimbEdge(t, low, high) {
  const el = t.elev[low], eh = t.elev[high];
  if (eh - el !== 1) return false;
  if (eh === 1) return t.rampSide[high] !== null;
  if (eh === 2) return t.summitAdj[low];
  return false;
}

// Classifies the boundary between two ORTHOGONALLY adjacent squares for rendering.
export function edgeKind(t, a, b) {
  if (t.elev[a] === t.elev[b]) return 'flat';
  const [low, high] = t.elev[a] < t.elev[b] ? [a, b] : [b, a];
  return isClimbEdge(t, low, high) ? 'passable' : 'cliff';
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
