extends "res://tests/test_case.gd"

const FAR := Vector2i(0, 23)


func test_pawn_forward_double_and_diagonal() -> void:
	var b = Board.new(cfg())
	var m = EnemyRules.moves(b, cfg(), piece("P", 5, 0, Vector2i(0, 1)), {}, FAR)
	eq(targets(m), ["4,1", "5,1", "5,2", "6,1"])
	m = EnemyRules.moves(b, cfg(), piece("P", 5, 3, Vector2i(0, 1), true), {}, FAR)
	eq(targets(m), ["4,4", "5,4", "6,4"], "no double step after moving")


func test_pawn_attacks_diagonally_but_is_blocked_ahead() -> void:
	var b = Board.new(cfg())
	var m = EnemyRules.moves(b, cfg(), piece("P", 5, 3, Vector2i(0, 1), true), {}, Vector2i(6, 4))
	eq(targets(m), ["4,4", "5,4", "6,4!"])
	m = EnemyRules.moves(b, cfg(), piece("P", 5, 3, Vector2i(0, 1), true), {}, Vector2i(5, 4))
	eq(targets(m), ["4,4", "6,4"], "player straight ahead blocks the pawn")


func test_pawn_diagonal_moves_can_be_disabled() -> void:
	var c := cfg({"enemy": {"pawn_diagonal_moves": false}})
	var m = EnemyRules.moves(Board.new(c), c, piece("P", 5, 3, Vector2i(0, 1), true), {}, FAR)
	eq(targets(m), ["5,4"])


func test_east_facing_pawn() -> void:
	var b = Board.new(cfg())
	var m = EnemyRules.moves(b, cfg(), piece("P", 0, 11, Vector2i(1, 0), true), {}, FAR)
	eq(targets(m), ["1,10", "1,11", "1,12"])


func test_one_square_movers_take_two_beats_to_climb_a_step() -> void:
	var b = Board.new(cfg())
	var m = EnemyRules.moves(b, cfg(), piece("P", 13, 9, Vector2i(0, 1), true), {}, FAR)
	var by := {}
	for x in m:
		by["%d,%d" % [x.to.x, x.to.y]] = x.beats
	eq(by.get("13,10"), 2, "step up: 2 beats")
	eq(by.get("12,10"), 1, "diagonal onto ramp: 1 beat")
	var k = EnemyRules.moves(b, cfg(), piece("K", 11, 10), {}, FAR)
	for x in k:
		if x.to == Vector2i(11, 11):
			eq(x.beats, 2, "king onto the summit")


func test_slow_climb_off_means_no_climbing() -> void:
	var c := cfg({"enemy": {"slow_climb": false}})
	var m = EnemyRules.moves(Board.new(c), c, piece("P", 13, 9, Vector2i(0, 1), true), {}, FAR)
	eq(targets(m), ["12,10", "14,10"])


func test_slider_range_climb_cost_and_climb_stop() -> void:
	var b = Board.new(cfg())
	var m = EnemyRules.moves(b, cfg(), piece("R", 2, 2), {}, FAR)
	eq(m.size(), 2 + 3 + 2 + 3, "range 3, clipped by the board edge")
	# (10,7): 8 and 9 cost 1 each, the step onto (10,10) costs 2 -> 4 > 3.
	m = EnemyRules.moves(b, cfg(), piece("R", 10, 7), {}, FAR)
	check(targets(m).has("10,9") and not targets(m).has("10,10"), "step out of reach")
	m = EnemyRules.moves(b, cfg(), piece("R", 10, 8), {}, FAR)
	check(targets(m).has("10,10") and not targets(m).has("10,11"), "climb then stop")


func test_slider_attacks_player_and_is_blocked_by_pieces() -> void:
	var b = Board.new(cfg())
	var m = EnemyRules.moves(b, cfg(), piece("R", 2, 2), {Vector2i(3, 2): true}, Vector2i(2, 4))
	var t := targets(m)
	check(not t.has("3,2"), "blocked square")
	check(t.has("2,3") and t.has("2,4!") and not t.has("2,5"), "attack ends the slide")


func test_knight_jumps() -> void:
	var b = Board.new(cfg())
	var m = EnemyRules.moves(b, cfg(), piece("N", 5, 5), {Vector2i(5, 6): true}, FAR)
	eq(m.size(), 8, "jumps over pieces")
	m = EnemyRules.moves(b, cfg(), piece("N", 10, 8), {}, FAR)
	for x in m:
		if x.to == Vector2i(11, 10):
			eq(x.beats, 1, "onto a ramp")
		if x.to == Vector2i(9, 10):
			eq(x.beats, 1, "ground")
