extends "res://tests/test_case.gd"


func _plan(b: Object, pieces: Array, player: Vector2i, busy := {}) -> Array:
	var enemies := {}
	for p in pieces:
		enemies[p.id] = p
	var d: PackedInt32Array = b.distance_field(b.summit_cells())
	return EnemyPlanner.plan(b, cfg(), enemies, busy, player, d)


func _p(id: int, type: String, x: int, y: int, facing := Vector2i.ZERO, moved := true) -> Dictionary:
	return {"id": id, "type": type, "cell": Vector2i(x, y), "facing": facing, "has_moved": moved}


func test_attacks_player_in_reach() -> void:
	var b = Board.new(cfg())
	var plans := _plan(b, [_p(1, "R", 2, 2)], Vector2i(2, 4))
	eq(plans.size(), 1)
	eq(plans[0].to, Vector2i(2, 4))
	check(plans[0].attack, "attack flag")


func test_advances_toward_summit() -> void:
	var b = Board.new(cfg())
	var plans := _plan(b, [_p(1, "P", 11, 0, Vector2i(0, 1), false)], Vector2i(0, 23))
	eq(plans[0].to, Vector2i(11, 2), "double step down the lane")
	plans = _plan(b, [_p(1, "P", 10, 9, Vector2i(0, 1))], Vector2i(0, 23))
	eq(plans[0].to, Vector2i(11, 10), "steers diagonally onto the ramp")


func test_two_enemies_never_plan_the_same_square() -> void:
	var b = Board.new(cfg())
	var plans := _plan(b, [_p(1, "P", 10, 9, Vector2i(0, 1)), _p(2, "P", 12, 9, Vector2i(0, 1))], Vector2i(0, 23))
	eq(plans.size(), 2)
	check(plans[0].to != plans[1].to, "distinct destinations")


func test_follower_may_take_the_leaders_square() -> void:
	var b = Board.new(cfg())
	var plans := _plan(b, [_p(1, "P", 11, 5, Vector2i(0, 1)), _p(2, "P", 11, 4, Vector2i(0, 1))], Vector2i(0, 23))
	eq(plans[0].id, 1, "leader (closer to the summit) plans first")
	eq(plans[0].to, Vector2i(11, 6))
	eq(plans[1].to, Vector2i(11, 5), "follower steps into the vacated square")


func test_waits_when_no_progress_possible() -> void:
	var b = Board.new(cfg())
	# Pawn that has walked past the summit: every forward move goes further away.
	var plans := _plan(b, [_p(1, "P", 11, 16, Vector2i(0, 1))], Vector2i(0, 23))
	eq(plans.size(), 0)


func test_busy_enemies_reserve_their_destination() -> void:
	var b = Board.new(cfg())
	var busy := {1: {"to": Vector2i(11, 10), "beats_left": 2, "attack": false}}
	var plans := _plan(b, [_p(1, "P", 11, 9, Vector2i(0, 1)), _p(2, "P", 10, 8, Vector2i(0, 1))], Vector2i(0, 23), busy)
	eq(plans.size(), 1, "busy enemy isn't re-planned")
	check(plans[0].to != Vector2i(11, 10), "reserved square avoided")
