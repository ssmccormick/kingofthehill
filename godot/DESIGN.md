# Design: rules and defaults

Everything below lives in `scripts/core/game_config.gd`. Where the brief was
open, I picked the simplest rule that fits it, made it a config value, and
noted it here.

## The pitch
Third-person shooter on a chessboard, inspired by *Shotgun King*. Not turn
based: you move freely in real time, but one square at a time. Enemy pieces
move together every **3 seconds** (a "beat"), and their next moves are
telegraphed as **red squares**. It plays like tower defense with no towers:
just you, against pieces trying to reach the top of the hill. You start with
no friendly pieces and just a **pistol**.

## Board (carried over from the web prototype)
- 24×24 squares, 2 m each. The hill base (level 1) is a 4×4 ring around the
  2×2 summit (level 2).
- **Ramps:** 2 squares in the middle of each side of the hill base. Climbing
  onto a ramp is free.
- **Steps:** any other step up costs 1 extra movement. Down is free.

## Beats and telegraphs
- Every `beat.seconds` (3 s) all enemy plans resolve at once.
- Right after a beat, every idle enemy plans its next move and the
  destination lights **red**. The red brightens and flickers as the next
  beat approaches. The HUD bar counts down and warns
  "YOU'RE ON A RED SQUARE — MOVE!".
- **Plans are locked for the whole beat.** Enemies don't re-aim while you
  move (the turn-based prototype re-planned after every move). Re-planning
  in real time would make the red squares chase you and attacks couldn't be
  dodged.
- **Hits:** if you're on an enemy's destination square when the beat lands,
  that's an attack. You take `enemy.attack_damage` (1), and the enemy stays
  where it is. This also applies if you walk onto a red square.
- **Slow climbs:** stepping up a non-ramp step costs 2 movement. A
  one-square mover (pawn, knight, king) spends **2 beats** on it, and the
  target square stays dim red for the first beat (`enemy.slow_climb`).
- **Pawns:**
  - They spawn only in the middle 4 squares of each edge
    (`spawn.pawn_lane_width`) and march inward.
  - First move may be 2 squares (`enemy.pawn_double_step`).
  - They attack diagonally forward only. You standing straight ahead just
    blocks them.
  - They may also *step* diagonally forward (`enemy.pawn_diagonal_moves`).
    Otherwise pawns in the outer lanes would walk straight past the summit.
- **Sliders** (rook, bishop, queen) move up to `enemy.slide_range` = 3 per
  beat, not chess's unlimited range, so waves take time to arrive. A step up
  costs 2 of that range, and they stop after climbing (`enemy.climb_stops`).
- **AI:**
  - An enemy attacks you if your square is among its moves.
  - Otherwise it takes the move that gets it closest to the summit by path
    distance (climb costs count, so ramps are the cheap way up).
  - If no move gets it closer, it waits.
  - Front-runners plan first, so pieces in a line advance together, and two
    enemies never target the same square.

## Win / lose
- **Breach:** an enemy that reaches a summit square damages the hill by
  `hill.breach_damage[type]` (pawn 1 … queen 4) and is removed. The hill
  has 10 HP.
- **Lose:** the hill reaches 0, or you do (5 HP).
- **Campaign:** 10 waves. You win when the last wave has spawned and every
  enemy is dead.
- **Endless:** waves keep growing past the table: +15% pieces per wave and a
  rising chance of tier upgrades (P→N→B→R→Q).
- **Sandbox:** no spawns, for trying weapons.

## Waves
- Wave 1 arrives on beat 2, then every 12 beats (36 s). If you clear the
  board early, the next wave comes 2 beats later.
- Between waves, one stray enemy arrives every 4 beats (mostly pawns).
- Spawn squares glow **orange** one beat ahead. If the square is taken when
  the beat lands, the enemy arrives elsewhere on the same edge.
- Wave sizes go from 4 pawns up to 14P 4N 4B 3R 2Q (`waves.table`).
- **Enemy HP:** pawn 3, knight/bishop 5, rook 8, queen 12. Pips appear over
  a piece once it's damaged.

## Weapons
- **Pistol to start** (`loadout.start`).
- **New weapons drop as pickups:**
  - when you destroy a wave (near the hill, preferring ones you don't have);
  - with a 4% chance when you kill an enemy (where it fell).
  - Walk onto a pickup to take it. New weapons are equipped straight away;
    one you already own refills.
- **Switching:** 9 slots, number keys or the mouse wheel, Q for the last weapon.
- **Guns** are hitscan from the crosshair. Each has damage, pellets, spread,
  range, cooldown, auto/semi, magazine, reload and pierce. Reserve ammo is
  unlimited: magazines and reloads set the pace.
- **Melee** hits up to `cleave` enemies within `range` metres inside an `arc`
  in front of you. 3.2 m reaches the 8 surrounding squares; the spear's 4.8 m
  reaches 2 squares.

| Weapon | Type | Notes |
|---|---|---|
| Pistol | gun | 2 dmg, 8 rounds, semi-auto |
| Revolver | gun | 6 dmg, pierces 2, slow |
| SMG | gun | 1 dmg, full auto, 30 rounds, wide spread |
| Assault Rifle | gun | 2 dmg, full auto, accurate |
| Shotgun | gun | 8 pellets, 4 shells |
| Double Barrel | gun | 12 pellets, 2 shells, wide |
| Sniper Rifle | gun | 14 dmg, pierces 3, slow |
| Minigun | gun | 1 dmg, 120 rounds, very fast, long reload |
| Railgun | gun | 10 dmg, pierces everything, 1 shot then reload |
| Dagger | melee | fast, single target |
| Sword | melee | 100° arc, 3 targets |
| Battle Axe | melee | 140° arc, 4 targets |
| Spear | melee | 2-square reach, narrow |
| Warhammer | melee | 10 dmg, slow |

## Scoring
- Kills score the piece value × 10 (pawn 10 … queen 90).
- Destroying a wave scores 25 × the wave number.

## Not in this milestone
Sound, real art and animation, enemy ranged attacks, upgrades/perks, saving.
