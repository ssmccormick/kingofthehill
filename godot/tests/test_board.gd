extends "res://tests/test_case.gd"
# Default 24x24: hill base (level 1) x,y 10..13; summit (level 2) 11..12.
# Ramps: N (11,10)(12,10) · S (11,13)(12,13) · W (10,11)(10,12) · E (13,11)(13,12).


func test_elevations_and_ramps() -> void:
	var b = Board.new(cfg())
	eq(b.level(Vector2i(9, 9)), 0, "ground")
	eq(b.level(Vector2i(10, 10)), 1, "hill base corner")
	eq(b.level(Vector2i(11, 11)), 2, "summit")
	eq(b.level(Vector2i(12, 12)), 2, "summit")
	var ramps := []
	for c in b.ramp_side:
		ramps.append("%s:%d,%d" % [b.ramp_side[c], c.x, c.y])
	ramps.sort()
	eq(ramps, ["E:13,11", "E:13,12", "N:11,10", "N:12,10", "S:11,13", "S:12,13", "W:10,11", "W:10,12"], "ramps")


func test_climb_costs() -> void:
	var b = Board.new(cfg())
	eq(b.step_cost(Vector2i(11, 9), Vector2i(11, 10)), 1, "onto a ramp is free")
	eq(b.step_cost(Vector2i(10, 9), Vector2i(10, 10)), 2, "a step up costs 2")
	eq(b.step_cost(Vector2i(11, 10), Vector2i(11, 11)), 2, "summit has no ramps")
	eq(b.step_cost(Vector2i(11, 11), Vector2i(11, 10)), 1, "down is free")
	eq(b.surface_level(Vector2i(11, 10)), 0.5, "ramps sit halfway up")


func test_climb_cost_configurable() -> void:
	var b = Board.new(cfg({"terrain": {"climb_extra_cost": 0}}))
	eq(b.step_cost(Vector2i(10, 9), Vector2i(10, 10)), 1)


func test_distance_to_summit() -> void:
	var b = Board.new(cfg())
	var d: PackedInt32Array = b.distance_field(b.summit_cells())
	eq(b.dist_at(d, Vector2i(11, 11)), 0)
	eq(b.dist_at(d, Vector2i(11, 10)), 2, "ramp -> summit is a step")
	eq(b.dist_at(d, Vector2i(11, 9)), 3, "ground -> ramp free, then the step")
	eq(b.dist_at(d, Vector2i(11, 0)), 12)


func test_edges_and_inward_direction() -> void:
	var b = Board.new(cfg())
	eq(b.edge_side(Vector2i(5, 0)), "N")
	eq(b.edge_side(Vector2i(23, 7)), "E")
	eq(b.edge_side(Vector2i(5, 5)), "")
	eq(b.inward_dir(Vector2i(11, 0)), Vector2i(0, 1))
	eq(b.inward_dir(Vector2i(0, 12)), Vector2i(1, 0))
	eq(b.inward_dir(Vector2i(23, 12)), Vector2i(-1, 0))


func test_pawn_lanes() -> void:
	var b = Board.new(cfg())
	var cells: Array[Vector2i] = b.spawn_cells("P", 4)
	eq(cells.size(), 16)
	for c in cells:
		var along: int = c.x if (c.y == 0 or c.y == 23) else c.y
		check(along >= 10 and along <= 13, "pawn lane %s" % c)
	eq(b.spawn_cells("R", 4).size(), 4 * 22, "other pieces: any edge cell but corners")
