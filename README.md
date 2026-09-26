# King of the Hill — chess survival prototype

A turn-based chess survival prototype. Defend your king on a hill in the middle
of a 24×24 board while enemy pieces close in from the edges.

**Status: Phase 3 of 5**:
- Phase 1: board, terrain, player army, legal move generation (range caps, hill
  bonus, ramps, climb costs), check rules, pawn promotion and redeploy.
- Phase 2: action points, turn flow, undo, enemy AI with telegraphed intents and fallbacks.
- Phase 3: waves and trickle spawns with telegraphed markers, win/loss,
  Campaign / Endless / Sandbox modes, scoring.

## Run it

No build step and no dependencies. ES modules need an HTTP server, so use either:

```sh
node serve.js            # http://localhost:8000  (or: npm run serve)
# or
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Add `?seed=123` to the URL to replay a seed.
The current seed is always shown in the header.

## Tests

```sh
npm test                 # node --test tests/*.test.js (Node 18+; uses node:test)
```

## Layout

```
src/config.js                every tunable rule and number (all [Default]s from the spec)
src/logic/                   pure game logic with ZERO DOM access (runs in Node)
  rng.js                     seeded RNG (mulberry32; state lives on game state)
  terrain.js                 elevation, ramps, cliff/climb edges, deployment zone
  state.js                   game state, pieces, starting army from config
  moves.js                   move generation, attacks, check / checkmate
  promotion.js               pawn promotion table + deployment placement
  ai.js                      enemy move scoring, intent planning, enemy turn
  spawn.js                   waves, trickle, spawn markers, wave clears, campaign win
  actions.js                 player actions: move, place, redeploy, end turn, AP
  debug.js                   dev-panel helpers (seeded random enemy spawn)
  game.js                    Game wrapper with the in-turn undo stack
src/ui/                      canvas renderer + DOM input (the only DOM code)
tests/                       node:test unit tests
DECISIONS.md                 how ambiguous rules were resolved
```

## How to play (phase 3)

- Pick a mode from the start menu:
  - **Campaign**: survive 10 waves (adjustable), then clear the board.
  - **Endless**: waves never stop and grow past wave 10. Play for score.
  - **Sandbox**: no spawns, for setting up test positions.
- A wave arrives every 8 turns, starting at the end of turn 1. Between waves,
  one extra enemy arrives every 2 turns. Arrivals are marked on the edge one
  turn ahead with a faded red piece in a dashed box. If you stand on a
  marker, that enemy arrives elsewhere on the same edge.
- Score is the value of the enemies you capture, plus 10 × the wave number for
  each wave you wipe out completely.

- Click one of your pieces to see its legal moves. Dots are moves and red rings are captures.
- Each move costs 1 AP (4 per turn). Each piece moves at most once per turn.
  **Undo** (or `Z`) rewinds within the turn. **End Turn** (or `Enter`) refreshes AP.
- Terrain: the hill is a 4×4 base (level 1) around a 2×2 summit (level 2).
  A thick dark line is a **step up**, which costs 1 extra movement. Chevrons
  are **ramps**, which you can climb for free. Kings, knights and pawns only
  move 1, so they can climb only via ramps. The hill's base is the
  **deployment zone** (blue dashed outline). Hover a square for its details.
- **Enemy intents**: numbered arrows show exactly which enemies will move
  and where, in order, when you end the turn. The enemies re-plan after each
  of your moves, so the arrows always reflect the current board. Red means capture, orange means
  move, and grey dashed means your move blocked it, so that enemy will pick
  another move. Purple + means check and black # means checkmate. The side
  panel lists them too.
- You can't end the turn while your king is in check. You lose if the king
  is checkmated at the start of your turn, or captured.
- Pawns face outward (see the small tick). A pawn that reaches the board edge it
  faces promotes based on its capture badge and must be placed in the deployment
  zone right away. If no square is free, it waits on the edge with a ↻ marker.
  Select it and use **Redeploy** (1 AP) on a later turn.
- **Dev panel**:
  - Place enemy or player pieces anywhere, erase pieces, or spawn 8 random
    enemies (seeded; pawns only in the middle 4 squares of each edge).
  - Turn the enemy AI on or off, and set enemies per turn. Both apply immediately.
  - Skip to next wave: its markers appear now, and it arrives when you end the turn.
  - Change board, plateau, ramp, climb-cost, AP and wave-interval settings. These apply on
    restart and are remembered in localStorage.
  - "Refresh AP & moves" resets the current turn.
