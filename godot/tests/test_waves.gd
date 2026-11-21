extends "res://tests/test_case.gd"


func _count(arr: Array, t: String) -> int:
	return arr.filter(func(x): return x == t).size()


func test_composition_from_table() -> void:
	var rng := RandomNumberGenerator.new()
	eq(Waves.composition(cfg(), 1, rng).size(), 4)
	var w10 := Waves.composition(cfg(), 10, rng)
	eq([_count(w10, "P"), _count(w10, "N"), _count(w10, "B"), _count(w10, "R"), _count(w10, "Q")], [14, 4, 4, 3, 2])


func test_endless_waves_grow() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	var w14 := Waves.composition(cfg(), 14, rng)
	eq(w14.size(), roundi(14 * 1.6) + roundi(4 * 1.6) * 2 + roundi(3 * 1.6) + roundi(2 * 1.6))


func test_wave_telegraphed_a_beat_ahead_in_pawn_lanes() -> void:
	var b = Battle.new(cfg(), 7, "campaign")
	eq(b.pending_spawns.size(), 0, "beat 0: nothing yet")
	b.do_beat()
	eq(b.pending_wave, 1, "wave 1 marked during beat 1")
	eq(b.pending_spawns.size(), 4)
	for s in b.pending_spawns:
		var along: int = s.cell.x if (s.cell.y == 0 or s.cell.y == 23) else s.cell.y
		check(along >= 10 and along <= 13, "pawn lane")
	var marked: Array = b.pending_spawns.map(func(s): return s.cell)
	var events: Array = b.do_beat()
	eq(b.enemies.size(), 4)
	for e in b.enemies.values():
		check(marked.has(e.cell), "spawned where marked")
		eq(e.wave, 1)
	check(events.any(func(e): return e.type == "wave"), "wave event")
	eq(b.next_wave_beat, 2 + 12)


func test_spawns_avoid_occupied_squares() -> void:
	var b = Battle.new(cfg(), 7, "campaign")
	b.do_beat()
	var first: Vector2i = b.pending_spawns[0].cell
	b.player_cell = first
	b.do_beat()
	for e in b.enemies.values():
		check(e.cell != first, "not on the player's square")
	eq(b.enemies.size(), 4, "relocated, not lost")


func test_trickle_between_waves() -> void:
	var c := cfg({"trickle": {"weights": {"P": 0, "N": 0, "B": 0, "R": 1}}})
	var b = Battle.new(c, 3, "campaign")
	b.frozen = true
	b.do_beat()
	b.do_beat() # wave 1 lands on beat 2
	var trickles := []
	for i in 8:
		if b.pending_spawns.size() == 1 and b.pending_wave == 0:
			trickles.append(b.beat + 1)
			eq(b.pending_spawns[0].type, "R", "trickle weights")
		b.do_beat()
	eq(trickles, [6, 10], "every 4 beats after the wave")


func test_wave_clear_bonus_and_campaign_win() -> void:
	var c := cfg({"waves": {"campaign_waves": 1}})
	var b = Battle.new(c, 3, "campaign")
	b.frozen = true
	b.do_beat()
	b.do_beat()
	eq(b.enemies.size(), 4)
	eq(b.beats_until_wave(), -1, "no waves left")
	var last := {}
	for id in b.enemies.keys():
		last = b.damage_enemy(id, 99)
	eq(b.status, "won")
	eq(b.score, 4 * 10 + 25)
	check(last.events.any(func(e): return e.type == "wave_cleared"), "clear event")


func test_clear_board_brings_next_wave_early() -> void:
	var b = Battle.new(cfg(), 3, "endless")
	b.frozen = true
	b.do_beat()
	b.do_beat()
	for id in b.enemies.keys():
		b.damage_enemy(id, 99)
	eq(b.next_wave_beat, b.beat + 2, "breather instead of the full interval")
	b.do_beat()
	eq(b.pending_wave, 2)
	eq(b.status, "playing", "endless never wins")


func test_skip_to_next_wave() -> void:
	var b = Battle.new(cfg(), 3, "campaign")
	check(b.skip_to_next_wave(), "skip")
	eq(b.pending_wave, 1)
	b.do_beat()
	eq(b.waves_spawned, 1)


func test_same_seed_same_game() -> void:
	var run := func():
		var b = Battle.new(cfg(), 11, "endless")
		var log := []
		for i in 30:
			b.do_beat()
			log.append(str(b.pending_spawns) + str(b.plans))
		return log
	eq(run.call(), run.call())


func test_sandbox_never_spawns() -> void:
	var b = sandbox()
	for i in 20:
		b.do_beat()
	eq(b.enemies.size(), 0)
