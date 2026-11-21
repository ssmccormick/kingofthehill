# King of the Hill (Godot 4.5)

A third-person shooter on a chessboard. You're the last king, alone on the
summit of a hill with a pistol. Waves of enemy chess pieces march toward the
summit and move every 3 seconds. Right after each move, the squares they will
land on next light up **red**. Stand on a red square when the beat hits and
you take a hit. Each enemy that reaches the summit damages the hill. Shoot
or cut them down first, and pick up the weapons that drop.

## Run it

1. Install **Godot 4.5** (standard build, not .NET): <https://godotengine.org/download>.
2. Project Manager → **Import** → choose `godot/project.godot` → **Import & Edit**.
3. Press **F5** (Run Project).

Or from a terminal: `godot --path godot`.

## Controls

| Input | Action |
|---|---|
| W A S D / arrows | Move one square (relative to the camera, 8 directions; hold to keep moving) |
| Mouse | Aim (third-person, over the shoulder) |
| Left mouse | Fire / swing (automatic weapons: hold) |
| R | Reload |
| 1–9, mouse wheel | Switch weapon |
| Q | Previous weapon |
| Esc | Pause |
| F5 / F6 / F7 / F8 | Dev: next wave now · freeze enemies · all weapons · kill all enemies |

## Tests

The rules (board, enemy moves, planning, beats, waves, weapons) are pure
GDScript with no nodes, under `scripts/core/`, and are tested headless:

```sh
godot --headless --path godot -s res://tests/run_tests.gd
```

## Layout

```
scripts/core/        rules only, no nodes or rendering (unit tested)
  game_config.gd     EVERY tunable number: board, beat, player, weapons, enemies, waves, drops, scoring
  board.gd           terrain grid, ramps, climb costs, spawn edges, distance fields
  enemy_rules.gd     per-piece moves for one beat
  enemy_planner.gd   which move each enemy telegraphs
  waves.gd           wave composition
  battle.gd          the game state: beats, attacks, breaches, spawns, pickups, win/loss
scripts/game/        3D presentation and input
  main.gd            beat clock, events -> animations, menus, dev keys
  board_view.gd      terrain meshes, red/orange telegraph squares, weapon pickups
  player.gd          king avatar, camera, grid movement, guns and melee
  enemy_piece.gd     enemy piece node + animations
  piece_meshes.gd    chess pieces from primitives (placeholder art)
  weapon_meshes.gd   weapons from primitives (placeholder art)
  hud.gd             HUD, start / pause / end screens
tests/               headless unit tests
```

Dev screenshots / bot run (after `--`): `--mode=campaign --seed=7 --autoplay --all-weapons --shots=5,15 --out=/tmp/shot`.
