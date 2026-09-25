# King of the Hill — chess survival prototype

A turn-based chess survival prototype. Defend your king on a hill in the middle
of a 24×24 board while enemy pieces close in from the edges.

**Status: Phase 1 of 5**: board, terrain, player army, legal move generation
(range caps, hill bonus, ramps, cliffs), check rules, pawn promotion and redeploy.
There are no enemy turns yet. Use the dev panel to place enemies by hand.

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
  actions.js                 player actions: move, place, redeploy, end turn, AP
  game.js                    Game wrapper with the in-turn undo stack
src/ui/                      canvas renderer + DOM input (the only DOM code)
tests/                       node:test unit tests
DECISIONS.md                 how ambiguous rules were resolved
```

## How to play (phase 1)

- Click one of your pieces to see its legal moves. Dots are moves and red rings are captures.
- Each move costs 1 AP (4 per turn). Each piece moves at most once per turn.
  **Undo** (or `Z`) rewinds within the turn. **End Turn** (or `Enter`) refreshes AP.
- Terrain: thick dark lines are **cliffs**. Chevrons are **ramps** and point uphill.
  The blue dashed ring is the **deployment zone**. Hover a square for its details.
- Pawns face outward (see the small tick). A pawn that reaches the board edge it
  faces promotes based on its capture badge and must be placed in the deployment
  zone right away. If no square is free, it waits on the edge with a ↻ marker.
  Select it and use **Redeploy** (1 AP) on a later turn.
- **Dev panel**: place enemy or player pieces, erase pieces, and change board,
  plateau, ramp, deploy-ring and AP settings (these apply on restart and are
  remembered in localStorage). "Refresh AP & moves" resets the current turn.
