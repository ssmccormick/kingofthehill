# Design decisions

When the spec was ambiguous, the simplest interpretation was chosen and made
configurable where it matters. Config keys are in `src/config.js`.

## Terrain
- **Ramp squares are plateau squares** (level 1) on the plateau's outer ring.
  A 0→1 climb is legal only if the square entered is a ramp. Entering it
  diagonally from outside is allowed. (`board.ramps`: side / start / width, any count.)
- **Summit access:** a 1→2 climb is legal from any plateau square that touches
  the summit, including diagonally. Since every square around the summit touches
  it, the summit has no cliffs.
- **Cliff** = any elevation change that isn't a legal climb edge. Climbs of more
  than one level at once are never allowed.
- **Descending:** player pieces may drop down cliffs (`terrain.playerCanDescendCliffs`).
  Enemies may only walk down ramp and summit edges (`terrain.enemyCanDescendCliffs = false`).
- **Knights** follow the same rule for their destination: a jump that lands one
  level higher must land on a ramp (0→1) or start next to the summit (1→2).
  The *Cliff Jumper* upgrade hook is `state.mods.knightsClimbCliffs` (player knights only).
- **Deployment zone** = level-0 squares within `deployRingWidth` (Chebyshev
  distance) of the plateau, corners included. That is 36 squares by default.
- **Attacks obey terrain.** A piece attacks exactly the squares it could move
  to, so an enemy rook below a cliff does not attack or check the plateau.

## Movement
- Range is based on the square where the move **starts**. Player R/B/Q get
  `slideRangeBase + elevation × hillRangeBonusPerLevel` (7 / 8 / 9).
  Enemies never get the bonus (`movement.enemyHillRangeBonus`).
- Player sliders do **not** stop when they climb. Enemy sliders stop on the
  first higher square they enter (`movement.enemyClimbStops`).
- Pawns face a cardinal direction, set per pawn. Player pawns start facing the
  plateau side they stand on. Moves are one step forward, captures are one
  square diagonally forward. No double step, no en passant.
- Enemy pawns placed via the dev panel face inward from their nearest edge.
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
