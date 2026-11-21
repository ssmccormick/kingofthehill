extends RefCounted
## Every tunable number and rule switch lives here. Game logic only reads the
## Dictionary returned by defaults() (optionally merged with overrides).

static func defaults() -> Dictionary:
	return {
		"seed": -1, # -1 = random seed each run

		"board": {
			"width": 24,
			"height": 24,
			"plateau_size": 4, # level-1 hill base, centered
			"summit_size": 2, # level-2 summit, centered: the enemies' goal
			# Ramps sit on the hill base's outer ring. start = index along that
			# side (-1 = centered). Add/remove entries for more/fewer ramps.
			"ramps": [
				{"side": "N", "start": -1, "width": 2},
				{"side": "E", "start": -1, "width": 2},
				{"side": "S", "start": -1, "width": 2},
				{"side": "W", "start": -1, "width": 2},
			],
		},

		"terrain": {
			# Stepping UP one level costs this much extra movement (so a step
			# costs 2), except onto a ramp square from below. Down is free.
			"climb_extra_cost": 1,
		},

		"beat": {
			"seconds": 3.0, # enemies act once per beat
		},

		"player": {
			"hp": 5,
			"step_time": 0.14, # seconds to move one square
			"climb_step_time": 0.34, # seconds to step UP a non-ramp step
		},

		# Weapons. kind "gun": hitscan bullets from the crosshair; "melee": hits
		# enemies within `range` metres inside an `arc` in front of you.
		#   damage per bullet/hit · pellets per shot · spread in degrees ·
		#   cooldown seconds between shots/swings · auto = hold to fire ·
		#   magazine (0 = no reloading) · reload seconds · pierce = enemies a
		#   bullet passes through · cleave = max enemies per swing.
		# Ammo reserves are unlimited; magazines and reloads set the pace.
		"weapons": {
			"pistol": {"name": "Pistol", "kind": "gun", "damage": 2, "pellets": 1, "spread": 1.2, "range": 40.0,
				"cooldown": 0.28, "auto": false, "magazine": 8, "reload": 1.0, "pierce": 1, "model": "pistol"},
			"revolver": {"name": "Revolver", "kind": "gun", "damage": 6, "pellets": 1, "spread": 0.6, "range": 50.0,
				"cooldown": 0.55, "auto": false, "magazine": 6, "reload": 1.8, "pierce": 2, "model": "pistol"},
			"smg": {"name": "SMG", "kind": "gun", "damage": 1, "pellets": 1, "spread": 4.0, "range": 30.0,
				"cooldown": 0.08, "auto": true, "magazine": 30, "reload": 1.4, "pierce": 1, "model": "smg"},
			"rifle": {"name": "Assault Rifle", "kind": "gun", "damage": 2, "pellets": 1, "spread": 1.8, "range": 50.0,
				"cooldown": 0.12, "auto": true, "magazine": 24, "reload": 1.6, "pierce": 1, "model": "rifle"},
			"shotgun": {"name": "Shotgun", "kind": "gun", "damage": 1, "pellets": 8, "spread": 6.0, "range": 30.0,
				"cooldown": 0.5, "auto": false, "magazine": 4, "reload": 1.3, "pierce": 1, "model": "shotgun"},
			"double_barrel": {"name": "Double Barrel", "kind": "gun", "damage": 1, "pellets": 12, "spread": 9.0, "range": 22.0,
				"cooldown": 0.2, "auto": false, "magazine": 2, "reload": 1.5, "pierce": 1, "model": "shotgun"},
			"sniper": {"name": "Sniper Rifle", "kind": "gun", "damage": 14, "pellets": 1, "spread": 0.0, "range": 80.0,
				"cooldown": 1.1, "auto": false, "magazine": 4, "reload": 2.0, "pierce": 3, "model": "sniper"},
			"minigun": {"name": "Minigun", "kind": "gun", "damage": 1, "pellets": 1, "spread": 6.0, "range": 35.0,
				"cooldown": 0.045, "auto": true, "magazine": 120, "reload": 3.2, "pierce": 1, "model": "minigun"},
			"railgun": {"name": "Railgun", "kind": "gun", "damage": 10, "pellets": 1, "spread": 0.0, "range": 90.0,
				"cooldown": 1.4, "auto": false, "magazine": 1, "reload": 1.2, "pierce": 99, "model": "sniper"},
			"dagger": {"name": "Dagger", "kind": "melee", "damage": 2, "range": 2.6, "arc": 60.0, "cooldown": 0.2,
				"cleave": 1, "model": "dagger"},
			"sword": {"name": "Sword", "kind": "melee", "damage": 4, "range": 3.2, "arc": 100.0, "cooldown": 0.45,
				"cleave": 3, "model": "sword"},
			"axe": {"name": "Battle Axe", "kind": "melee", "damage": 6, "range": 3.2, "arc": 140.0, "cooldown": 0.75,
				"cleave": 4, "model": "axe"},
			"spear": {"name": "Spear", "kind": "melee", "damage": 5, "range": 4.8, "arc": 30.0, "cooldown": 0.6,
				"cleave": 2, "model": "spear"},
			"warhammer": {"name": "Warhammer", "kind": "melee", "damage": 10, "range": 3.0, "arc": 80.0, "cooldown": 1.05,
				"cleave": 2, "model": "hammer"},
		},

		"loadout": {
			"start": ["pistol"], # weapons you begin with (first one equipped)
			"max_slots": 9, # number keys 1-9
		},

		"drops": {
			"on_wave_clear": true, # a weapon pickup appears near the hill when a wave is destroyed
			"kill_drop_chance": 0.04, # chance a killed enemy drops a weapon where it stood
			"max_on_board": 3,
			"near_hill_min": 1, # wave-clear drops land this many squares (Chebyshev) from the hill base...
			"near_hill_max": 3, # ...up to this many
		},

		"hill": {
			"hp": 10,
			# Hill damage when an enemy of this type reaches the summit.
			"breach_damage": {"P": 1, "N": 2, "B": 2, "R": 3, "Q": 4, "K": 4},
		},

		"enemy": {
			"hp": {"P": 3, "N": 5, "B": 5, "R": 8, "Q": 12, "K": 10},
			"attack_damage": 1, # damage to the player per hit
			# Max squares per beat for sliders (movement points; a step up costs 2).
			"slide_range": {"R": 3, "B": 3, "Q": 3},
			# An enemy slider that climbs must stop on the first higher square.
			"climb_stops": true,
			# One-square movers (pawn, knight, king) take 2 beats for a move
			# that costs 2 (stepping up a non-ramp step). false = can't climb.
			"slow_climb": true,
			"pawn_double_step": true, # first move may be 2 squares forward
			# Pawns may step diagonally forward (not only capture there), so
			# they can steer toward the summit instead of walking past it.
			"pawn_diagonal_moves": true,
			"attack_player": true, # attack the player when they're in reach
		},

		"spawn": {
			"pawn_lane_width": 4, # pawns spawn only in the middle N squares of each edge
		},

		"waves": {
			"first_wave_beat": 2, # wave 1 arrives on this beat
			"interval_beats": 12, # beats between waves
			"clear_breather_beats": 2, # board cleared early -> next wave this many beats later
			"campaign_waves": 10,
			"table": [
				{"P": 4},
				{"P": 6},
				{"P": 6, "N": 2},
				{"P": 8, "N": 2, "B": 1},
				{"P": 8, "N": 2, "B": 2, "R": 1},
				{"P": 10, "N": 3, "B": 2, "R": 1},
				{"P": 10, "N": 3, "B": 3, "R": 2},
				{"P": 12, "N": 3, "B": 3, "R": 2, "Q": 1},
				{"P": 12, "N": 4, "B": 3, "R": 3, "Q": 1},
				{"P": 14, "N": 4, "B": 4, "R": 3, "Q": 2},
			],
			# Endless, past the end of the table: the last row grows and
			# pieces may be upgraded a tier (P -> N -> B -> R -> Q).
			"endless_growth_per_wave": 0.15,
			"endless_upgrade_chance_per_wave": 0.06,
			"endless_max_upgrade_chance": 0.5,
		},

		"trickle": {
			"enabled": true,
			"interval_beats": 4, # one stray enemy every N beats between waves
			"weights": {"P": 6, "N": 2, "B": 1, "R": 1},
		},

		"scoring": {
			"piece_values": {"P": 1, "N": 3, "B": 3, "R": 5, "Q": 9, "K": 0},
			"points_per_value": 10, # kill score = value x this
			"wave_clear_bonus": 25, # x wave number, when every piece of a wave is dead
		},
	}


## Deep-merges `overrides` into a copy of `base`. Arrays are replaced, not merged.
static func merge(base: Dictionary, overrides: Dictionary) -> Dictionary:
	var out: Dictionary = base.duplicate(true)
	for key in overrides:
		var v = overrides[key]
		if v is Dictionary and out.get(key) is Dictionary:
			out[key] = merge(out[key], v)
		else:
			out[key] = v.duplicate(true) if (v is Dictionary or v is Array) else v
	return out


static func make(overrides: Dictionary = {}) -> Dictionary:
	return merge(defaults(), overrides)
