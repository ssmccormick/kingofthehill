extends "res://tests/test_case.gd"


func test_start_with_pistol_only() -> void:
	var b = Battle.new(cfg(), 1, "campaign")
	eq(b.inventory, ["pistol"])


func test_every_weapon_is_well_formed() -> void:
	var w: Dictionary = cfg().weapons
	check(w.size() >= 12, "a big arsenal")
	var guns := 0
	var melee := 0
	for id in w:
		var d: Dictionary = w[id]
		check(d.has("name") and d.has("damage") and d.has("cooldown") and d.has("model"), id)
		if d.kind == "gun":
			guns += 1
			check(d.has("pellets") and d.has("magazine") and d.has("reload") and d.has("range") and d.has("pierce"), id)
		else:
			melee += 1
			eq(d.kind, "melee", id)
			check(d.has("range") and d.has("arc") and d.has("cleave"), id)
	check(guns >= 6 and melee >= 4, "guns %d melee %d" % [guns, melee])


func test_walking_onto_a_pickup_takes_it() -> void:
	var b = sandbox()
	b.drop_weapon(Vector2i(1, 23), "sword")
	var r: Dictionary = b.player_step(Vector2i(1, 0))
	eq(r.picked, "sword")
	eq(b.inventory, ["pistol", "sword"])
	check(b.pickups.is_empty(), "pickup gone")


func test_owned_weapon_pickup_is_collected_without_duplicating() -> void:
	var b = sandbox()
	b.drop_weapon(Vector2i(1, 23), "pistol")
	eq(b.player_step(Vector2i(1, 0)).picked, "pistol")
	eq(b.inventory, ["pistol"])


func test_wave_clear_drops_a_new_weapon_near_the_hill() -> void:
	var c := cfg({"waves": {"campaign_waves": 2}, "drops": {"kill_drop_chance": 0.0}})
	var b = Battle.new(c, 4, "campaign")
	b.frozen = true
	b.do_beat()
	b.do_beat()
	var last := {}
	for id in b.enemies.keys():
		last = b.damage_enemy(id, 99)
	var drops: Array = last.events.filter(func(e): return e.type == "drop")
	eq(drops.size(), 1)
	var cell: Vector2i = drops[0].cell
	var w: String = drops[0].weapon
	check(w != "pistol", "a weapon you don't own")
	check(b.board.level(cell) == 0 and cell.x >= 7 and cell.x <= 16 and cell.y >= 7 and cell.y <= 16, "near the hill: %s" % cell)


func test_kill_drop_chance() -> void:
	var b = sandbox({"drops": {"kill_drop_chance": 1.0}})
	var id: int = b.add_enemy("P", Vector2i(5, 5))
	var r: Dictionary = b.damage_enemy(id, 99)
	eq(b.pickups.get(Vector2i(5, 5), "") != "", true, "dropped where it died")
	check(r.events.any(func(e): return e.type == "drop"), "drop event")


func test_pickup_limit() -> void:
	var b = sandbox({"drops": {"max_on_board": 2}})
	check(b.drop_weapon(Vector2i(1, 1)) != null, "1")
	check(b.drop_weapon(Vector2i(2, 2)) != null, "2")
	check(b.drop_weapon(Vector2i(3, 3)) == null, "limit")


func test_grant_all() -> void:
	var b = sandbox()
	b.grant_all_weapons()
	eq(b.inventory.size(), 9, "capped at 9 slots")
