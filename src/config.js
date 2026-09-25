// All tunable numbers and rule switches live here. Game logic reads ONLY from
// the config object passed into createGame(), which is a deep copy of this
// (optionally with dev-panel overrides merged in).

export const DEFAULT_CONFIG = {
  // null => pick a random seed at game start. Any integer => reproducible run.
  seed: null,

  board: {
    width: 24,
    height: 24,
    plateauSize: 8, // level-1 hill, centered
    summitSize: 2, // level-2 summit, centered
    // Ramps sit on the plateau's outer ring. `start` is the index along that
    // side of the plateau (0 = the side's first square); null = centered.
    // Add more entries for more ramps; remove entries for fewer.
    ramps: [
      { side: 'N', start: null, width: 2 },
      { side: 'E', start: null, width: 2 },
      { side: 'S', start: null, width: 2 },
      { side: 'W', start: null, width: 2 },
    ],
    // Deployment zone: level-0 ring around the base of the hill.
    deployRingWidth: 1,
  },

  terrain: {
    // Moving DOWN across a cliff edge (a non-ramp elevation change).
    playerCanDescendCliffs: true,
    enemyCanDescendCliffs: false,
  },

  movement: {
    slideRangeBase: 7, // R/B/Q max range when starting on level 0
    hillRangeBonusPerLevel: 1, // +range per elevation level of the start square
    hillRangeBonusPieces: ['R', 'B', 'Q'], // which piece types get the bonus
    enemyHillRangeBonus: false, // hill bonus is a player-only perk
    enemyClimbStops: true, // enemy must end its move on the first higher square it enters
  },

  pieceValues: { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 },

  turn: {
    apPerTurn: 4,
    moveAPCost: 1,
    onePieceMovePerTurn: true, // false => a piece may move repeatedly (each move costs AP)
    carryOverAP: false,
  },

  promotion: {
    // Highest matching minCaptures wins. Order in the array does not matter.
    table: [
      { minCaptures: 0, piece: 'N' },
      { minCaptures: 1, piece: 'B' },
      { minCaptures: 2, piece: 'R' },
      { minCaptures: 4, piece: 'Q' },
    ],
    resetCountOnPromote: true,
    immediateRedeployAPCost: 0, // placement right after promotion
    delayedRedeployAPCost: 1, // "Redeploy" button on a later turn (zone was full)
    redeployedPieceCanMove: false, // may a redeployed piece still move this turn?
  },

  // Starting army. Anchors:
  //  at:'summit'       dx,dy relative to the summit's top-left square
  //  at:'plateauEdge'  square on the plateau's outer ring on `side`; `along` is
  //                    relative to the summit's top-left x (N/S) or y (E/W).
  //                    Pawns face `side` (they advance outward toward that edge).
  startLayout: [
    { type: 'K', at: 'summit', dx: 0, dy: 0 },
    { type: 'Q', at: 'summit', dx: 1, dy: 1 },
    { type: 'R', at: 'summit', dx: -1, dy: 0 },
    { type: 'R', at: 'summit', dx: 2, dy: 1 },
    { type: 'B', at: 'summit', dx: 1, dy: -1 },
    { type: 'B', at: 'summit', dx: 0, dy: 2 },
    { type: 'N', at: 'summit', dx: 0, dy: -1 },
    { type: 'N', at: 'summit', dx: 1, dy: 2 },
    { type: 'P', at: 'plateauEdge', side: 'N', along: -1 },
    { type: 'P', at: 'plateauEdge', side: 'N', along: 2 },
    { type: 'P', at: 'plateauEdge', side: 'E', along: -1 },
    { type: 'P', at: 'plateauEdge', side: 'E', along: 2 },
    { type: 'P', at: 'plateauEdge', side: 'S', along: -1 },
    { type: 'P', at: 'plateauEdge', side: 'S', along: 2 },
    { type: 'P', at: 'plateauEdge', side: 'W', along: -1 },
    { type: 'P', at: 'plateauEdge', side: 'W', along: 2 },
  ],
};

export function cloneConfig(cfg = DEFAULT_CONFIG) {
  return structuredClone(cfg);
}

// Deep-merge `overrides` into a copy of `base`. Arrays are replaced, not merged.
export function mergeConfig(base, overrides) {
  const out = structuredClone(base);
  (function merge(dst, src) {
    for (const [k, v] of Object.entries(src || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) {
        merge(dst[k], v);
      } else {
        dst[k] = structuredClone(v);
      }
    }
  })(out, overrides);
  return out;
}
