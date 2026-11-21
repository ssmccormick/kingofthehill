extends SceneTree
## Headless test runner:
##   godot --headless --path godot -s res://tests/run_tests.gd

const FILES := [
	"res://tests/test_board.gd",
	"res://tests/test_enemy_rules.gd",
	"res://tests/test_planner.gd",
	"res://tests/test_battle.gd",
	"res://tests/test_waves.gd",
	"res://tests/test_weapons.gd",
]


func _init() -> void:
	var passed := 0
	var failed := 0
	for path in FILES:
		var script: Script = load(path)
		if script == null or not script.can_instantiate():
			print("FAIL could not load or compile ", path)
			failed += 1
			continue
		for m in script.get_script_method_list():
			var name: String = m.name
			if not name.begins_with("test_"):
				continue
			var inst = script.new()
			inst.call(name)
			if inst.failures.is_empty():
				passed += 1
			else:
				failed += 1
				print("FAIL %s :: %s" % [path.get_file(), name])
				for f in inst.failures:
					print("    ", f)
	print("\n%d passed, %d failed" % [passed, failed])
	quit(1 if failed > 0 else 0)
