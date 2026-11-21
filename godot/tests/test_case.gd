extends RefCounted
## Minimal test base: methods named test_* are run by run_tests.gd.

const GameConfig = preload("res://scripts/core/game_config.gd")
const Board = preload("res://scripts/core/board.gd")
const EnemyRules = preload("res://scripts/core/enemy_rules.gd")
const EnemyPlanner = preload("res://scripts/core/enemy_planner.gd")
const Waves = preload("res://scripts/core/waves.gd")
const Battle = preload("res://scripts/core/battle.gd")

var failures: Array[String] = []


func check(cond: bool, msg: String = "") -> void:
	if not cond:
		failures.append("check failed: " + msg)


func eq(actual, expected, msg: String = "") -> void:
	if typeof(actual) != typeof(expected) or actual != expected:
		failures.append("%s\n      expected: %s\n      actual:   %s" % [msg, str(expected), str(actual)])


func cfg(overrides: Dictionary = {}) -> Dictionary:
	return GameConfig.make(overrides)


## Moves list -> sorted "x,y" strings (attacks get a trailing "!").
func targets(moves: Array) -> Array:
	var out := []
	for m in moves:
		out.append("%d,%d%s" % [m.to.x, m.to.y, "!" if m.attack else ""])
	out.sort()
	return out


func piece(type: String, x: int, y: int, facing := Vector2i.ZERO, has_moved := false) -> Dictionary:
	return {"id": 1, "type": type, "cell": Vector2i(x, y), "facing": facing, "has_moved": has_moved}


## Sandbox battle (no spawns) with no enemies; player parked far away.
func sandbox(overrides: Dictionary = {}) -> Object:
	var b = Battle.new(cfg(overrides), 1, "sandbox")
	b.player_cell = Vector2i(0, 23)
	b.plan_enemies()
	return b
