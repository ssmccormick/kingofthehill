extends RefCounted
## Enemy move generation for one beat. Pure logic.
##
## A piece is a Dictionary: {id, type, cell: Vector2i, facing: Vector2i, has_moved: bool}.
## `blocked` is a Dictionary of cells the piece may not enter (other enemies,
## reserved destinations). The player's cell is never blocked: moving there
## is an attack.
##
## Each move is {to: Vector2i, beats: int, attack: bool}. beats is 2 for a
## one-square mover paying a climb cost of 2 (it spends a beat climbing).

const ORTHO: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
const DIAG: Array[Vector2i] = [Vector2i(1, 1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(-1, -1)]
const KNIGHT: Array[Vector2i] = [
	Vector2i(1, 2), Vector2i(2, 1), Vector2i(2, -1), Vector2i(1, -2),
	Vector2i(-1, -2), Vector2i(-2, -1), Vector2i(-2, 1), Vector2i(-1, 2),
]


## Beats a one-square move takes: 1 normally, 2 for a costly climb when
## slow_climb is on, 0 if impossible.
static func step_beats(board, cfg: Dictionary, from: Vector2i, to: Vector2i) -> int:
	var cost: int = board.step_cost(from, to)
	if cost <= 1:
		return 1
	if cost == 2 and cfg.enemy.slow_climb:
		return 2
	return 0


static func moves(board, cfg: Dictionary, piece: Dictionary, blocked: Dictionary, player_cell: Vector2i) -> Array:
	var out: Array = []
	var cell: Vector2i = piece.cell
	match piece.type:
		"K":
			_jumps(board, cfg, cell, ORTHO + DIAG, blocked, player_cell, out)
		"N":
			_jumps(board, cfg, cell, KNIGHT, blocked, player_cell, out)
		"P":
			_pawn(board, cfg, piece, blocked, player_cell, out)
		"R":
			_slides(board, cfg, piece, ORTHO, blocked, player_cell, out)
		"B":
			_slides(board, cfg, piece, DIAG, blocked, player_cell, out)
		"Q":
			_slides(board, cfg, piece, ORTHO + DIAG, blocked, player_cell, out)
	return out


static func _jumps(board, cfg: Dictionary, cell: Vector2i, offsets: Array[Vector2i], blocked: Dictionary, player_cell: Vector2i, out: Array) -> void:
	for d in offsets:
		var to: Vector2i = cell + d
		if not board.in_bounds(to) or blocked.has(to):
			continue
		var beats := step_beats(board, cfg, cell, to)
		if beats > 0:
			out.append({"to": to, "beats": beats, "attack": to == player_cell})


static func _pawn(board, cfg: Dictionary, piece: Dictionary, blocked: Dictionary, player_cell: Vector2i, out: Array) -> void:
	var cell: Vector2i = piece.cell
	var f: Vector2i = piece.facing
	var perp := Vector2i(absi(f.y), absi(f.x))
	# Forward: never an attack (the player standing ahead just blocks the pawn).
	var fwd := cell + f
	if board.in_bounds(fwd) and not blocked.has(fwd) and fwd != player_cell:
		var beats := step_beats(board, cfg, cell, fwd)
		if beats > 0:
			out.append({"to": fwd, "beats": beats, "attack": false})
		if beats == 1 and cfg.enemy.pawn_double_step and not piece.get("has_moved", false):
			var fwd2 := fwd + f
			if board.in_bounds(fwd2) and not blocked.has(fwd2) and fwd2 != player_cell and board.step_cost(fwd, fwd2) <= 1:
				out.append({"to": fwd2, "beats": 1, "attack": false})
	# Diagonally forward: attack if the player is there, else an optional step.
	for d in [f + perp, f - perp]:
		var to: Vector2i = cell + d
		if not board.in_bounds(to) or blocked.has(to):
			continue
		var beats := step_beats(board, cfg, cell, to)
		if beats == 0:
			continue
		if to == player_cell:
			out.append({"to": to, "beats": beats, "attack": true})
		elif cfg.enemy.pawn_diagonal_moves:
			out.append({"to": to, "beats": beats, "attack": false})


static func _slides(board, cfg: Dictionary, piece: Dictionary, dirs: Array[Vector2i], blocked: Dictionary, player_cell: Vector2i, out: Array) -> void:
	var max_range: int = cfg.enemy.slide_range.get(piece.type, 3)
	for d in dirs:
		var cur: Vector2i = piece.cell
		var used := 0
		while true:
			var to: Vector2i = cur + d
			if not board.in_bounds(to) or blocked.has(to):
				break
			used += board.step_cost(cur, to)
			if used > max_range:
				break
			if to == player_cell:
				out.append({"to": to, "beats": 1, "attack": true})
				break
			out.append({"to": to, "beats": 1, "attack": false})
			if cfg.enemy.climb_stops and board.level(to) > board.level(cur):
				break
			cur = to
