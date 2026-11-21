extends RefCounted
## Plans every idle enemy's move for the next beat. Pure logic.
##
## Priorities (config enemy.attack_player):
##   1. Attack the player if their cell is among the piece's moves.
##   2. Otherwise make progress toward the summit: the move with the lowest
##      path distance (climb costs included) that is closer than where the
##      piece stands. Ties go to the faster move, then generation order.
##   3. No move makes progress -> the piece waits.
##
## Enemies nearest the summit plan first, so a follower may plan into a
## square its leader is leaving this beat. Plans execute in the same order.

const EnemyRules = preload("res://scripts/core/enemy_rules.gd")


## enemies: id -> piece Dictionary (all enemies on the board).
## busy: id -> {to, beats_left, attack} for enemies mid-way through a slow move.
## Returns new plans [{id, to, beats, attack}] in execution order.
static func plan(board, cfg: Dictionary, enemies: Dictionary, busy: Dictionary, player_cell: Vector2i, dist: PackedInt32Array) -> Array:
	var occupied := {}
	for id in enemies:
		occupied[enemies[id].cell] = id
	var reserved := {}
	var moving_away := {}
	for id in busy:
		var b: Dictionary = busy[id]
		if not b.attack:
			reserved[b.to] = true
			if b.beats_left == 1:
				moving_away[id] = true

	var order: Array = []
	for id in enemies:
		if not busy.has(id):
			order.append(id)
	order.sort_custom(func(a, b):
		var da: int = board.dist_at(dist, enemies[a].cell)
		var db: int = board.dist_at(dist, enemies[b].cell)
		return da < db if da != db else a < b)

	var out: Array = []
	for id in order:
		var e: Dictionary = enemies[id]
		var blocked := {}
		for c in reserved:
			blocked[c] = true
		for c in occupied:
			var other: int = occupied[c]
			if other != id and not moving_away.has(other):
				blocked[c] = true
		var choice = choose(board, cfg, e, EnemyRules.moves(board, cfg, e, blocked, player_cell), dist)
		if choice == null:
			continue
		out.append({"id": id, "to": choice.to, "beats": choice.beats, "attack": choice.attack})
		if not choice.attack:
			reserved[choice.to] = true
			if choice.beats == 1:
				moving_away[id] = true
	return out


## Best move for one enemy from its candidate list, or null to wait.
static func choose(board, cfg: Dictionary, piece: Dictionary, moves: Array, dist: PackedInt32Array):
	var here: int = board.dist_at(dist, piece.cell)
	var best = null
	var best_key := 0
	for m in moves:
		var key: int
		if m.attack:
			if not cfg.enemy.attack_player:
				continue
			key = -1
		else:
			var d: int = board.dist_at(dist, m.to)
			if d >= here:
				continue
			key = d * 10 + m.beats
		if best == null or key < best_key:
			best = m
			best_key = key
	return best
