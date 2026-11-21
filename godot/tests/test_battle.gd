extends "res://tests/test_case.gd"


func test_player_starts_on_summit_and_steps_one_square() -> void:
	var b = Battle.new(cfg(), 1, "sandbox")
	eq(b.player_cell, Vector2i(11, 11))
	var r: Dictionary = b.player_step(Vector2i(0, -1))
	check(r.ok, "step ok")
	eq(r.cell, Vector2i(11, 10))
	check(not r.slow, "stepping down is quick")
	r = b.player_step(Vector2i(0, 1))
	check(r.slow, "stepping back up onto the summit is a slow climb")
	check(not b.player_step(Vector2i(2, 0)).ok, "one square at a time")


func test_player_cannot_walk_into_enemies_or_off_board() -> void:
	var b = sandbox()
	b.add_enemy("P", Vector2i(1, 23))
	check(not b.player_step(Vector2i(1, 0)).ok, "enemy blocks")
	check(not b.player_step(Vector2i(-1, 0)).ok, "board edge")


func test_telegraphed_attack_hits_if_player_stays() -> void:
	var b = sandbox()
	b.player_cell = Vector2i(5, 5)
	b.add_enemy("R", Vector2i(5, 2))
	b.plan_enemies()
	eq(b.danger_cells().get(Vector2i(5, 5)), 1, "player's square is lit")
	var events: Array = b.do_beat()
	eq(b.player_hp, cfg().player.hp - 1)
	eq(events[0].type, "attack")
	eq(b.enemies.values()[0].cell, Vector2i(5, 2), "attacker stays put")


func test_dodging_avoids_the_hit() -> void:
	var b = sandbox()
	b.player_cell = Vector2i(5, 5)
	b.add_enemy("R", Vector2i(5, 2))
	b.plan_enemies()
	b.player_step(Vector2i(1, 0))
	b.do_beat()
	eq(b.player_hp, cfg().player.hp, "no damage after stepping off the red square")
	eq(b.enemies.values()[0].cell, Vector2i(5, 5), "the rook still moves in")


func test_walking_onto_a_red_square_gets_you_hit() -> void:
	var b = sandbox()
	b.player_cell = Vector2i(3, 6)
	var id: int = b.add_enemy("P", Vector2i(5, 3), Vector2i(0, 1))
	b.enemies[id].has_moved = true
	b.plan_enemies()
	var target: Vector2i = b.plans[id].to
	b.player_cell = target
	b.do_beat()
	eq(b.player_hp, cfg().player.hp - 1)


func test_breach_damages_hill_and_removes_enemy() -> void:
	var b = sandbox()
	var id: int = b.add_enemy("R", Vector2i(11, 10))
	b.plan_enemies()
	eq(b.plans[id].to.y, 11, "rook steps onto the summit")
	var events: Array = b.do_beat()
	eq(b.hill_hp, cfg().hill.hp - cfg().hill.breach_damage.R)
	check(not b.enemies.has(id), "breaching enemy removed")
	check(events.any(func(e): return e.type == "breach"), "breach event")


func test_slow_climb_takes_two_beats() -> void:
	var b = sandbox()
	var id: int = b.add_enemy("K", Vector2i(11, 10))
	b.plan_enemies()
	eq(b.plans[id].beats_left, 2)
	b.do_beat()
	eq(b.enemies[id].cell, Vector2i(11, 10), "still climbing")
	eq(b.danger_cells().size(), 1, "destination still lit")
	b.do_beat()
	check(not b.enemies.has(id), "arrived on the summit and breached")
	eq(b.hill_hp, cfg().hill.hp - cfg().hill.breach_damage.K)


func test_losing_hill_or_hp_ends_the_game() -> void:
	var b = sandbox({"hill": {"hp": 1}})
	b.add_enemy("R", Vector2i(11, 10))
	b.plan_enemies()
	b.do_beat()
	eq(b.status, "lost")
	var c = sandbox({"player": {"hp": 1}})
	c.player_cell = Vector2i(5, 5)
	c.add_enemy("R", Vector2i(5, 2))
	c.plan_enemies()
	c.do_beat()
	eq(c.status, "lost")


func test_killing_enemies_scores_and_cancels_their_move() -> void:
	var b = sandbox()
	b.player_cell = Vector2i(5, 5)
	var id: int = b.add_enemy("R", Vector2i(5, 2))
	b.plan_enemies()
	var r: Dictionary = b.damage_enemy(id, 3)
	check(not r.killed, "rook has 8 hp")
	r = b.damage_enemy(id, 5)
	check(r.killed, "dead")
	eq(b.score, 5 * 10)
	eq(b.danger_cells().size(), 0, "its telegraph is gone")
	b.do_beat()
	eq(b.player_hp, cfg().player.hp)


func test_frozen_enemies_do_nothing() -> void:
	var b = sandbox()
	b.frozen = true
	var id: int = b.add_enemy("P", Vector2i(11, 0))
	b.plan_enemies()
	b.do_beat()
	eq(b.enemies[id].cell, Vector2i(11, 0))
