extends Node3D
## Game orchestrator: owns the Battle (rules), runs the beat clock, turns
## battle events into animations, and wires the player, board view and HUD.
##
## Dev command line (after `--`):
##   --mode=campaign|endless|sandbox  start immediately
##   --seed=N                         fixed seed
##   --autoplay                       a simple bot aims, shoots and dodges
##   --all-weapons                    start with every weapon
##   --shots=4,12,30 --out=/path/pre  save screenshots at those seconds, then quit

const GameConfig = preload("res://scripts/core/game_config.gd")
const Battle = preload("res://scripts/core/battle.gd")
const BoardView = preload("res://scripts/game/board_view.gd")
const EnemyPiece = preload("res://scripts/game/enemy_piece.gd")
const Player = preload("res://scripts/game/player.gd")
const Hud = preload("res://scripts/game/hud.gd")

const KING_DIRS: Array[Vector2i] = [
	Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1),
	Vector2i(1, 1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(-1, -1),
]

var cfg: Dictionary
var battle
var board_view
var player
var hud
var enemy_nodes := {} # enemy id -> EnemyPiece
var menu_camera: Camera3D
var running := false # a game is in progress (possibly ended, showing the board)
var paused := false
var beat_time := 0.0
var mode := "campaign"
var last_seed := -1
var _menu_angle := 0.0
var _args := {}
var _bot_weapon_timer := 0.0


func _ready() -> void:
	_setup_input()
	_build_environment()
	cfg = GameConfig.make()
	board_view = BoardView.new()
	add_child(board_view)
	player = Player.new()
	add_child(player)
	player.setup(self, cfg)
	player.visible = false
	menu_camera = Camera3D.new()
	menu_camera.fov = 60.0
	add_child(menu_camera)
	menu_camera.current = true
	hud = Hud.new()
	add_child(hud)
	player.fired.connect(func(_w): hud.kick_crosshair())
	hud.start_requested.connect(_on_start_requested)
	hud.resume_requested.connect(func(): _set_paused(false))
	hud.restart_requested.connect(func(): _start(mode, last_seed))
	hud.menu_requested.connect(_to_menu)
	hud.quit_requested.connect(func(): get_tree().quit())
	battle = Battle.new(cfg, 1, "sandbox") # menu backdrop
	board_view.build(battle.board)
	_to_menu()
	_parse_args()


# ------------------------------------------------------------- setup

func _setup_input() -> void:
	_bind_keys("move_forward", [KEY_W, KEY_UP])
	_bind_keys("move_back", [KEY_S, KEY_DOWN])
	_bind_keys("move_left", [KEY_A, KEY_LEFT])
	_bind_keys("move_right", [KEY_D, KEY_RIGHT])
	_bind_keys("reload", [KEY_R])
	_bind_keys("pause", [KEY_ESCAPE])
	if not InputMap.has_action("fire"):
		InputMap.add_action("fire")
		var mb := InputEventMouseButton.new()
		mb.button_index = MOUSE_BUTTON_LEFT
		InputMap.action_add_event("fire", mb)


func _bind_keys(action: String, keys: Array) -> void:
	if InputMap.has_action(action):
		return
	InputMap.add_action(action)
	for k in keys:
		var e := InputEventKey.new()
		e.physical_keycode = k
		InputMap.action_add_event(action, e)


func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color(0.04, 0.05, 0.09)
	sm.sky_horizon_color = Color(0.32, 0.15, 0.13)
	sm.ground_horizon_color = Color(0.18, 0.09, 0.08)
	sm.ground_bottom_color = Color(0.01, 0.01, 0.02)
	sky.sky_material = sm
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.8
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.glow_enabled = true
	env.glow_intensity = 0.9
	env.glow_bloom = 0.05
	env.fog_enabled = true
	env.fog_light_color = Color(0.16, 0.09, 0.09)
	env.fog_density = 0.006
	env.ssao_enabled = true
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -38, 0)
	sun.light_color = Color(1.0, 0.86, 0.72)
	sun.light_energy = 1.3
	sun.shadow_enabled = true
	add_child(sun)
	var rim := DirectionalLight3D.new()
	rim.rotation_degrees = Vector3(-25, 140, 0)
	rim.light_color = Color(0.55, 0.65, 1.0)
	rim.light_energy = 0.35
	add_child(rim)


# ------------------------------------------------------------- game flow

func _on_start_requested(m: String, seed_text: String) -> void:
	if m == "":
		_start(mode, -1) # "play again": same mode, new seed
		return
	var s := -1
	var t := seed_text.strip_edges()
	if t.is_valid_int():
		s = int(t)
	elif t != "":
		s = hash(t) & 0x7fffffff
	_start(m, s)


func _start(m: String, s: int) -> void:
	for n in enemy_nodes.values():
		n.queue_free()
	enemy_nodes.clear()
	mode = m
	battle = Battle.new(cfg, s, m)
	last_seed = battle.seed_value
	if _args.has("all-weapons"):
		battle.grant_all_weapons()
	board_view.build(battle.board)
	player.visible = true
	player.reset(_world(battle.player_cell), battle.inventory)
	player.camera.current = true
	beat_time = 0.0
	running = true
	paused = false
	hud.show_game()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_refresh_board()
	hud.message("HOLD THE HILL", Hud.GOLD, 2.0)


func _to_menu() -> void:
	running = false
	paused = false
	player.visible = false
	menu_camera.current = true
	for n in enemy_nodes.values():
		n.queue_free()
	enemy_nodes.clear()
	battle = Battle.new(cfg, 1, "sandbox")
	_refresh_board()
	hud.show_start()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _set_paused(on: bool) -> void:
	if not running or battle.status != "playing":
		return
	paused = on
	hud.show_pause(on)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if on else Input.MOUSE_MODE_CAPTURED


func _end_game() -> void:
	var won: bool = battle.status == "won"
	var total: int = battle.total_waves()
	var waves: String = ("%d / %d" % [battle.waves_spawned, total]) if mode == "campaign" else str(battle.waves_spawned)
	var text := "%s\n\nScore %d   ·   %d kills   ·   wave %s   ·   %d beats" % [
		"You held the hill." if won else battle.loss_reason, battle.score, battle.kills, waves, battle.beat]
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	get_tree().create_timer(1.2).timeout.connect(func(): hud.show_end(won, text))


func can_act() -> bool:
	return running and not paused and battle.status == "playing"


func _process(delta: float) -> void:
	if not running:
		_menu_angle += delta * 0.12
		menu_camera.position = Vector3(cos(_menu_angle) * 34.0, 24.0, sin(_menu_angle) * 34.0)
		menu_camera.look_at(Vector3(0, 1, 0))
		board_view.set_pulse(0.5)
		return
	var beat_len: float = cfg.beat.seconds
	if can_act():
		beat_time += delta
		if beat_time >= beat_len:
			beat_time -= beat_len
			_do_beat()
	board_view.set_pulse(beat_time / beat_len)
	hud.update(_hud_info())
	if _args.has("autoplay"):
		_autoplay(delta)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		_set_paused(not paused)
		return
	if not (event is InputEventKey and event.pressed and not event.echo) or not can_act():
		return
	match event.keycode:
		KEY_F5:
			if battle.skip_to_next_wave():
				hud.message("NEXT WAVE INCOMING", Hud.RED, 1.2)
				_refresh_board()
		KEY_F6:
			battle.frozen = not battle.frozen
			battle.plan_enemies()
			hud.message("ENEMIES FROZEN" if battle.frozen else "ENEMIES UNFROZEN", Hud.MUTED, 1.0)
			_refresh_board()
		KEY_F7:
			battle.grant_all_weapons()
			hud.message("ALL WEAPONS", Hud.GOLD, 1.0)
		KEY_F8:
			var all := {}
			for id in battle.enemies:
				all[id] = 999
			apply_hits(all, Vector3.FORWARD)


# ------------------------------------------------------------- beats & events

func _do_beat() -> void:
	_apply_events(battle.do_beat())
	_refresh_board()
	if battle.status != "playing":
		_end_game()


func _apply_events(events: Array) -> void:
	for ev in events:
		var node = enemy_nodes.get(ev.get("id", -1))
		match ev.type:
			"move":
				if node:
					node.face(ev.to - ev.from)
					node.move_to(_world(ev.to), 1.6 if ev.type_name == "N" else 0.25)
			"climbing":
				if node:
					node.climbing()
			"attack":
				if node:
					node.attack(player.position)
				player.take_hit()
				hud.flash_damage()
			"breach":
				if node:
					enemy_nodes.erase(ev.id)
					node.breach(0.35)
				player.shake(0.25)
				hud.message("THE HILL IS BREACHED  −%d" % ev.damage, Hud.RED, 1.4)
			"spawn":
				var e: Dictionary = battle.enemies[ev.id]
				var n := EnemyPiece.new()
				add_child(n)
				n.setup(ev.id, e.type, e.hp)
				n.face(e.facing)
				n.appear(_world(ev.cell))
				enemy_nodes[ev.id] = n
			"wave":
				var total: int = battle.total_waves()
				var label := ("WAVE %d / %d" % [ev.wave, total]) if mode == "campaign" else ("WAVE %d" % ev.wave)
				hud.message(label, Hud.RED, 2.0)
			"wave_cleared":
				hud.message("WAVE %d DESTROYED   +%d" % [ev.wave, ev.bonus], Hud.GOLD, 2.0)
			"drop":
				if ev.get("cell") != null:
					hud.message("%s DROPPED" % String(cfg.weapons[ev.weapon].name).to_upper(), Hud.GOLD, 1.6)


func _refresh_board() -> void:
	board_view.set_telegraph(battle.danger_cells(), battle.pending_spawns)
	board_view.set_pickups(battle.pickups, cfg.weapons)


func _world(c: Vector2i) -> Vector3:
	return board_view.cell_to_world(c)


# ------------------------------------------------------------- player API

func request_player_step(dir: Vector2i) -> Dictionary:
	if not can_act():
		return {"ok": false}
	var had: Array = battle.inventory.duplicate()
	var res: Dictionary = battle.player_step(dir)
	if not res.ok:
		return res
	res["world"] = _world(res.cell)
	if res.picked != "":
		var is_new: bool = not had.has(res.picked) and battle.inventory.has(res.picked)
		player.on_pickup(res.picked, is_new)
		var wname := String(cfg.weapons[res.picked].name).to_upper()
		hud.message(("NEW WEAPON: %s" % wname) if is_new else ("%s REFILLED" % wname), Hud.GOLD, 1.4)
		board_view.set_pickups(battle.pickups, cfg.weapons)
	return res


func apply_hits(hits: Dictionary, dir: Vector3) -> void:
	for id in hits:
		if not enemy_nodes.has(id) or not battle.enemies.has(id):
			continue
		var node = enemy_nodes[id]
		var r: Dictionary = battle.damage_enemy(id, hits[id])
		if r.killed:
			enemy_nodes.erase(id)
			node.die(dir)
			_apply_events(r.events)
		else:
			node.hit_flash()
			node.set_hp(battle.enemies[id].hp)
	_refresh_board()
	if battle.status != "playing":
		_end_game()


func inventory() -> Array:
	return battle.inventory


func enemy_positions() -> Dictionary:
	var out := {}
	for id in enemy_nodes:
		if battle.enemies.has(id):
			out[id] = enemy_nodes[id].global_position
	return out


# ------------------------------------------------------------- HUD

func _hud_info() -> Dictionary:
	var beat_len: float = cfg.beat.seconds
	var wave_text := "SANDBOX"
	if mode != "sandbox":
		var total: int = battle.total_waves()
		wave_text = ("WAVE %d / %d" % [battle.waves_spawned, total]) if mode == "campaign" else ("WAVE %d" % battle.waves_spawned)
		var until: int = battle.beats_until_wave()
		if until < 0:
			wave_text += "   ·   FINAL WAVE: CLEAR THE BOARD"
		elif until == 1:
			wave_text += "   ·   NEXT WAVE ON THE NEXT BEAT"
		else:
			wave_text += "   ·   next wave in %d beats" % until
	var w: Dictionary = cfg.weapons[player.current]
	var ammo_text := "MELEE"
	if w.kind == "gun":
		ammo_text = "%d / %d" % [player.ammo.get(player.current, 0), w.magazine]
		if player.reload_left > 0.0:
			ammo_text = "RELOADING %d%%" % roundi(player.reload_progress() * 100.0)
	var slots := []
	for i in battle.inventory.size():
		var id: String = battle.inventory[i]
		var label := "%d %s" % [i + 1, cfg.weapons[id].name]
		slots.append(("[ %s ]" % label) if id == player.current else label)
	return {
		"hp": battle.player_hp, "max_hp": cfg.player.hp,
		"hill": battle.hill_hp, "max_hill": cfg.hill.hp,
		"wave_text": wave_text,
		"beat_progress": beat_time / beat_len, "beat_left": beat_len - beat_time,
		"score": battle.score, "kills": battle.kills,
		"weapon": String(w.name).to_upper(), "ammo_text": ammo_text,
		"slots_text": "    ".join(slots),
		"in_danger": battle.danger_cells().get(battle.player_cell, 0) == 1,
	}


# ------------------------------------------------------------- dev tools

func _parse_args() -> void:
	for a in OS.get_cmdline_user_args():
		var s: String = a.trim_prefix("--")
		var kv := s.split("=", true, 1)
		_args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	if _args.has("mode"):
		_start(_args.mode, int(_args.get("seed", "-1")))
	if _args.has("shots"):
		var out: String = _args.get("out", "user://shot")
		var times: PackedStringArray = String(_args.shots).split(",")
		var last := 0.0
		for i in times.size():
			var t := float(times[i])
			last = maxf(last, t)
			get_tree().create_timer(t).timeout.connect(_capture.bind("%s_%02d.png" % [out, i]))
		get_tree().create_timer(last + 0.5).timeout.connect(func(): get_tree().quit())


func _capture(path: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(path)
	print("saved ", path, "  beat=", battle.beat, " status=", battle.status, " hp=", battle.player_hp,
		" hill=", battle.hill_hp, " enemies=", battle.enemies.size(), " score=", battle.score, " weapon=", player.current)


## Very simple bot for headless checks: aims at the nearest enemy, fires,
## steps off red squares, and cycles weapons now and then.
func _autoplay(delta: float) -> void:
	if not can_act():
		return
	var best = null
	var best_d := INF
	for id in enemy_nodes:
		if not battle.enemies.has(id):
			continue
		var d: float = enemy_nodes[id].global_position.distance_to(player.global_position)
		if d < best_d:
			best_d = d
			best = enemy_nodes[id]
	if best:
		player.look_at_point(best.global_position + Vector3.UP * 0.9)
		player.trigger()
	var danger: Dictionary = battle.danger_cells()
	if danger.get(battle.player_cell, 0) == 1 and not player.moving:
		var dirs := KING_DIRS.duplicate()
		dirs.sort_custom(func(a, b):
			return battle.board.dist_at(battle.summit_dist, battle.player_cell + a) < battle.board.dist_at(battle.summit_dist, battle.player_cell + b) \
				if battle.board.in_bounds(battle.player_cell + a) and battle.board.in_bounds(battle.player_cell + b) else battle.board.in_bounds(battle.player_cell + a))
		for d in dirs:
			var to: Vector2i = battle.player_cell + d
			if battle.board.in_bounds(to) and not danger.has(to) and battle.enemy_at(to) == -1:
				player.step(d)
				break
	_bot_weapon_timer += delta
	if _bot_weapon_timer > 6.0:
		_bot_weapon_timer = 0.0
		player.cycle(1)
