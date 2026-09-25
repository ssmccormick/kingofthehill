# Design decisions

When the spec was ambiguous, the simplest interpretation was chosen and made
configurable where it matters. Config keys are in `src/config.js`.

## Terrain (revised in phase 2)
- **Hill:** the base (level 1) is a 4×4 ring around the 2×2 summit
  (`board.plateauSize = 4`). The base is also the deployment zone
  (`board.deployZone = 'plateau'`). The old level-0 ring is still available
  with `deployZone: 'ring'`.
- **No cliffs.** Stepping up one level costs `terrain.climbExtraCost` (1)
  extra movement, so a climb step costs 2 range. Stepping onto a **ramp**
  square from the level below costs nothing extra. Moving down never costs
  extra, for either side.
- **Ramp squares** sit on the base's outer ring, 2 wide and centered on each
  side (`board.ramps`). Entering one diagonally from below also counts as a
  ramp climb. The summit has no ramps, so reaching it always costs the extra point.
- **Kings, knights and pawns** have a movement budget of 1
  (`movement.stepPieceBudget`). A knight's jump counts as one move. So these
  pieces can climb only via ramps, and nothing but a slider can get onto the
  summit. The *Cliff Jumper* upgrade hook is `state.mods.knightsIgnoreClimb`
  (player knights only).
- **Attacks obey terrain.** A piece attacks exactly the squares it could move
  to, so the climb cost also shortens how far up the hill an enemy can reach.
- **Starting army:** with only 16 squares on the hill, it's packed. K, Q and
  both rooks hold the summit, bishops and knights hold the base corners, and
  the pawns stand on the ramps facing outward. The deployment zone starts full.

## Movement
- Range is based on the square where the move **starts**. Player R/B/Q get
  `slideRangeBase + elevation × hillRangeBonusPerLevel` (7 / 8 / 9).
  Enemies never get the bonus (`movement.enemyHillRangeBonus`).
- Sliders pay climb costs out of their range. Player sliders keep going after
  a climb. Enemy sliders also stop on the first higher square they enter
  (`movement.enemyClimbStops`).
- Pawns face a cardinal direction, set per pawn. Player pawns start facing the
  plateau side they stand on. Moves are one step forward, captures are one
  square diagonally forward. No en passant.
- **Double step** (`movement.pawnDoubleStep`): any pawn that has never moved
  (`piece.hasMoved`, set on its first move) may advance two squares. This
  applies to both sides. Both squares must be empty, and each step must obey
  the climb rules on its own, so a double step can climb a ramp but not a
  step. Promoted pieces aren't pawns, so this never matters for them.
- **Enemy pawn lanes** (`spawn.pawnLaneWidth` = 4): enemy pawns spawn only on
  the middle 4 squares of each board edge (x or y = 10..13 on 24×24),
  facing the center, so marching forward takes them toward the hill.
  Corners are never pawn squares. Other enemy types may spawn on any edge
  square. The dev panel's random spawner follows this rule. Placing one piece
  by hand in the dev panel doesn't, so you can still build test positions.
- Enemy pawns placed by hand in the dev panel face inward from their nearest edge.
  On ties, N/S wins over E/W.

## Turn / AP (pulled into phase 1 because redeploy rules depend on it)
- Every move costs `turn.moveAPCost` (1). `turn.onePieceMovePerTurn` limits
  each piece to one move per turn.
- Undo keeps full-state snapshots within the current turn. Ending the turn
  clears the undo stack. Dev-panel edits also clear it.
- Checkmate (v1) is checked when a player turn starts: the king is in check and
  no single legal move gets it out.

## Promotion & redeploy
- A pawn promotes when it reaches the **board edge it faces**. Reaching any
  other edge does nothing. A capture made on the promoting move counts.
- The tier is the promotion-table row with the highest `minCaptures` at or
  below the pawn's count. The count resets (`promotion.resetCountOnPromote`).
- The promoted piece stays on the edge square while the player places it. No
  other action is possible until it's placed, and **End Turn** is disabled.
  Undo can take back the pawn move.
- Legal placement squares are empty deployment squares where the king is not
  in check after placement. This also covers the rare case where the pawn on
  the edge was blocking a check.
- If there is **no legal square** (the zone is full, or every square would leave
  the king in check), the piece stays on the edge with `canRedeploy`. On a
  later turn, if it has not moved yet, **Redeploy** costs
  `promotion.delayedRedeployAPCost` (1) and counts as that piece's move.
  `canRedeploy` lasts until used, even if the piece moves normally in between.
- A redeployed piece is locked for the rest of the turn
  (`promotion.redeployedPieceCanMove = false`), even when repeat moves are enabled.

## Enemy AI & intents (phase 2)
- **Scoring:** each enemy move is scored with weights from `enemy.weights`:
  - capture = `capture` × value of the piece taken
  - newly giving check = `check`
  - checkmate (v1 definition) = `checkmate`
  - approach = `approach` × reduction in path distance to the king
  - landing on a square the player attacks = −`attacked` × own value

  Path distance uses 8-direction steps with climb costs (ramps are the cheap
  way up) and ignores pieces.
- **Re-planning** (`enemy.replanAfterPlayerMove`, on by default): the
  intents are re-planned after every player move, promotion placement and
  redeploy, so the arrows always show what the enemies will do from the
  current board. Undo restores the earlier plan along with the board.
  Because of re-planning, a grey dashed ("falls back") arrow can only appear
  when an earlier enemy move in the same sequence blocks a later one. With
  re-planning off, intents stay locked for the whole player turn, which is
  the original Into the Breach behaviour.
- **Planning:** the top-scoring enemy and its best move become intent #1.
  That move is applied to a scratch board, then #2 is planned, and so on up to
  `enemy.enemiesPerTurn`. Each enemy moves at most once. Planning intents in
  order keeps them consistent: two enemies never plan the same square, and
  #2 already sees #1's capture.
- **Ties:** a tie goes to the lowest piece id, then to move-generation order.
  No randomness, so the same position always gives the same plan.
- **Validity at execution:**
  - An intent executes if its enemy is still on its start square and can
    still reach the destination.
  - A planned capture needs the same target still on that square.
  - A planned plain move onto a square a player piece has since moved onto
    executes as a capture. Stepping into a telegraphed arrow gets you hit.
  - Anything else falls back to the enemy's best current move by the same
    scoring, or it skips.
  - If the enemy was captured, its intent is cancelled with no replacement.
- **Loss:** you can't end the turn while in check. You lose if you're
  checkmated at the start of your turn (v1 definition) or the king is
  captured. Capture can only happen through a fallback move or a discovered
  line during the enemy's sequence.
- **Dev panel:** turning the AI off clears the intents, and the enemy turn
  does nothing. Dev edits re-plan the intents immediately.
