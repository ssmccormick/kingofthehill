// All tunable numbers and rule switches live here. Game logic reads ONLY from
// the config object passed into createGame(), which is a deep copy of this
// (optionally with dev-panel overrides merged in).

export const DEFAULT_CONFIG = {
  // null => pick a random seed at game start. Any integer => reproducible run.
  seed: null,

  board: {
    width: 24,
    height: 24,
    plateauSize: 4, // level-1 hill base, centered (a 1-wide ring around the summit)
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
    // Deployment zone: 'plateau' = every level-1 square (the hill's base).
    // 'ring' = level-0 squares within deployRingWidth of the plateau.
    deployZone: 'plateau',
    deployRingWidth: 1,
  },

  terrain: {
    // Stepping UP one level costs this much extra movement (so a climb step
    // costs 2), except stepping onto a ramp square from below, which is free.
    // Moving down is never extra.
    climbExtraCost: 1,
  },

  movement: {
    slideRangeBase: 7, // R/B/Q max range when starting on level 0
    hillRangeBonusPerLevel: 1, // +range per elevation level of the start square
    hillRangeBonusPieces: ['R', 'B', 'Q'], // which piece types get the bonus
    enemyHillRangeBonus: false, // hill bonus is a player-only perk
    enemyClimbStops: true, // enemy must end its move on the first higher square it enters
    // Movement budget of K, N and P per move. With climbExtraCost 1 they can
    // only climb via ramps.
    stepPieceBudget: 1,
    // A pawn that hasn't moved yet may advance two squares (both empty, each
    // step obeying the climb rules). No en passant.
    pawnDoubleStep: true,
  },

  modes: {
    campaignWaves: 10, // Campaign: win once the final wave has spawned and the board is clear
  },

  spawn: {
    // Enemy pawns spawn only on the middle N squares of each board edge, so
    // marching forward takes them toward the hill. Other pieces use any edge square.
    pawnLaneWidth: 4,
    // Spawns are planned at the start of a player turn (shown as markers on
    // the edge) and appear at the end of that turn's enemy phase.
    waves: {
      firstWaveTurn: 1, // wave 1 appears at the end of this turn
      interval: 8, // turns between waves
      // Composition per wave (piece type -> count). Spread across all four sides.
      table: [
        { P: 8 },
        { P: 8, N: 2 },
        { P: 8, N: 2, B: 2 },
        { P: 10, N: 2, B: 2, R: 1 },
        { P: 10, N: 3, B: 2, R: 2 },
        { P: 12, N: 3, B: 3, R: 2 },
        { P: 12, N: 3, B: 3, R: 2, Q: 1 },
        { P: 14, N: 4, B: 3, R: 3, Q: 1 },
        { P: 14, N: 4, B: 4, R: 3, Q: 2 },
        { P: 16, N: 4, B: 4, R: 4, Q: 2 },
      ],
      // Endless mode, waves past the end of the table: the last row is scaled.
      endless: {
        sizeGrowthPerWave: 0.15, // counts x (1 + growth x wavesPastTable)
        upgradeChancePerWave: 0.06, // chance each piece is upgraded one tier (P->N->B->R->Q)
        maxUpgradeChance: 0.5,
      },
    },
    // Between waves: `count` enemies every `interval` turns on a random edge.
    trickle: {
      enabled: true,
      interval: 2,
      count: 1,
      weights: { P: 6, N: 2, B: 1, R: 1 },
    },
  },

  scoring: {
    // Score = sum of captured enemy piece values (pieceValues)
    //       + waveClearBonus x wave number for each wave fully destroyed.
    waveClearBonus: 10,
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

  enemy: {
    aiEnabled: true,
    enemiesPerTurn: 4,
    // Re-plan the telegraphed intents after every player move / placement, so
    // the arrows always show what the enemy will do from the current board.
    replanAfterPlayerMove: true,
    // Enemy move scoring. Each enemy's best move is scored; the top
    // `enemiesPerTurn` enemies become the telegraphed intents, planned in order
    // (each intent is planned on the board after the earlier ones).
    weights: {
      captureKing: 100000, // only possible if the king walks onto an intent square
      checkmate: 50000,
      capture: 100, // x value of the captured piece
      check: 300,
      approach: 10, // per unit of path distance closer to the king
      attacked: 40, // penalty x own piece value when landing on a square the player attacks
    },
  },

  // Starting army. Anchors:
  //  at:'summit'       dx,dy relative to the summit's top-left square
  //  at:'plateauEdge'  square on the plateau's outer ring on `side`; `along` is
  //                    relative to the summit's top-left x (N/S) or y (E/W).
  //                    Pawns face `side` (they advance outward toward that edge).
  // Default: K, Q and both rooks fill the summit; bishops and knights hold the
  // plateau corners; two pawns stand on each ramp, facing outward.
  startLayout: [
    { type: 'K', at: 'summit', dx: 0, dy: 0 },
    { type: 'Q', at: 'summit', dx: 1, dy: 1 },
    { type: 'R', at: 'summit', dx: 1, dy: 0 },
    { type: 'R', at: 'summit', dx: 0, dy: 1 },
    { type: 'B', at: 'summit', dx: -1, dy: -1 },
    { type: 'B', at: 'summit', dx: 2, dy: 2 },
    { type: 'N', at: 'summit', dx: 2, dy: -1 },
    { type: 'N', at: 'summit', dx: -1, dy: 2 },
    { type: 'P', at: 'plateauEdge', side: 'N', along: 0 },
    { type: 'P', at: 'plateauEdge', side: 'N', along: 1 },
    { type: 'P', at: 'plateauEdge', side: 'E', along: 0 },
    { type: 'P', at: 'plateauEdge', side: 'E', along: 1 },
    { type: 'P', at: 'plateauEdge', side: 'S', along: 0 },
    { type: 'P', at: 'plateauEdge', side: 'S', along: 1 },
    { type: 'P', at: 'plateauEdge', side: 'W', along: 0 },
    { type: 'P', at: 'plateauEdge', side: 'W', along: 1 },
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
