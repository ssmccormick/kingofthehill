extends Node3D
## The player: a white king with whatever weapon is equipped, a third-person
## over-the-shoulder camera, one-square-at-a-time movement relative to the
## camera, and hitscan guns / arc melee weapons driven by config.weapons.
##
## Talks to the game (main.gd) through: can_act(), request_player_step(dir),
## apply_hits(hits, dir), inventory(), enemy_positions().

const PieceMeshes = preload("res://scripts/game/piece_meshes.gd")
const WeaponMeshes = preload("res://scripts/game/weapon_meshes.gd")
const TERRAIN_LAYER := 1
const ENEMY_LAYER := 2
const MOUSE_SENS := 0.0025
const PITCH_MIN := deg_to_rad(-65.0)
const PITCH_MAX := deg_to_rad(25.0)

signal fired(weapon_id: String)

var game
var cfg: Dictionary
var camera: Camera3D
var yaw := 0.0
var pitch := deg_to_rad(-24.0)
var moving := false

var current := "" # equipped weapon id
var ammo := {} # weapon id -> rounds in the magazine
var reload_left := 0.0
var cooldown_left := 0.0
var _queued_fire := 0.0 # buffered semi-auto click
var _last_weapon := ""

var _yaw_node: Node3D
var _pitch_node: Node3D
var _arm: SpringArm3D
var _avatar: Node3D
var _hand: Node3D
var _weapon_node: Node3D
var _muzzle_light: OmniLight3D
var _mat: StandardMaterial3D
var _tracer_mat: StandardMaterial3D
var _shake := 0.0
var _swinging := false


func setup(game_ref, config: Dictionary) -> void:
	game = game_ref
	cfg = config
	_mat = StandardMaterial3D.new()
	_mat.albedo_color = Color(0.92, 0.89, 0.8)
	_mat.roughness = 0.35
	_mat.emission_enabled = true
	_mat.emission = Color(1, 0.2, 0.15)
	_mat.emission_energy_multiplier = 0.0
	_avatar = PieceMeshes.build("K", _mat)
	add_child(_avatar)
	_hand = Node3D.new()
	_hand.position = Vector3(-0.55, 1.35, 0.3) # right hand (the avatar faces +Z)
	_avatar.add_child(_hand)
	_muzzle_light = OmniLight3D.new()
	_muzzle_light.light_color = Color(1.0, 0.75, 0.35)
	_muzzle_light.light_energy = 0.0
	_muzzle_light.omni_range = 6.0
	_hand.add_child(_muzzle_light)

	_yaw_node = Node3D.new()
	_yaw_node.position = Vector3(0, 3.1, 0)
	add_child(_yaw_node)
	_pitch_node = Node3D.new()
	_yaw_node.add_child(_pitch_node)
	_arm = SpringArm3D.new()
	_arm.spring_length = 7.5
	_arm.collision_mask = TERRAIN_LAYER
	_arm.margin = 0.3
	_arm.position = Vector3(1.4, 0.6, 0) # over the right shoulder
	_pitch_node.add_child(_arm)
	camera = Camera3D.new()
	camera.fov = 74.0
	camera.far = 300.0
	_arm.add_child(camera)

	_tracer_mat = StandardMaterial3D.new()
	_tracer_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_tracer_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_tracer_mat.albedo_color = Color(1.0, 0.85, 0.45, 0.9)
	_tracer_mat.emission_enabled = true
	_tracer_mat.emission = Color(1.0, 0.75, 0.3)
	_tracer_mat.emission_energy_multiplier = 3.0


func reset(at: Vector3, inventory: Array) -> void:
	position = at
	moving = false
	yaw = 0.0
	pitch = deg_to_rad(-24.0)
	ammo.clear()
	reload_left = 0.0
	cooldown_left = 0.0
	_last_weapon = ""
	current = ""
	equip(inventory[0])
	_apply_look()


# ------------------------------------------------------------- input

func _unhandled_input(event: InputEvent) -> void:
	if game == null or not game.can_act():
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw -= event.relative.x * MOUSE_SENS
		pitch = clampf(pitch - event.relative.y * MOUSE_SENS, PITCH_MIN, PITCH_MAX)
		_apply_look()
	elif event is InputEventKey and event.pressed and not event.echo:
		var k: int = event.keycode
		if k >= KEY_1 and k <= KEY_9:
			var inv: Array = game.inventory()
			var i := k - KEY_1
			if i < inv.size():
				equip(inv[i])
		elif k == KEY_Q and _last_weapon != "":
			equip(_last_weapon)
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			cycle(-1)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			cycle(1)


func _apply_look() -> void:
	_yaw_node.rotation.y = yaw
	_pitch_node.rotation.x = pitch
	_avatar.rotation.y = yaw + PI
	_hand.rotation.x = -pitch * 0.8


## World-space look direction of the camera, flattened.
func aim_flat() -> Vector3:
	return Vector3(-sin(yaw), 0, -cos(yaw))


## Points the crosshair (the camera ray) at a world point. Iterates because
## the over-the-shoulder camera moves as the rig turns.
func look_at_point(p: Vector3) -> void:
	for i in 4:
		var d := p - camera.global_position
		yaw = atan2(-d.x, -d.z)
		pitch = clampf(atan2(d.y, Vector2(d.x, d.z).length()), PITCH_MIN, PITCH_MAX)
		_apply_look()


func _process(delta: float) -> void:
	if game == null:
		return
	cooldown_left -= delta
	_queued_fire -= delta
	if reload_left > 0.0:
		reload_left -= delta
		if reload_left <= 0.0:
			ammo[current] = int(cfg.weapons[current].magazine)
	_muzzle_light.light_energy = maxf(0.0, _muzzle_light.light_energy - delta * 60.0)
	_update_shake(delta)
	if not game.can_act():
		return
	_try_move()
	if Input.is_action_just_pressed("reload"):
		start_reload()
	var w: Dictionary = cfg.weapons[current]
	if Input.is_action_just_pressed("fire"):
		_queued_fire = 0.25
	var want: bool = Input.is_action_pressed("fire") if w.get("auto", false) else _queued_fire > 0.0
	if want:
		trigger()


func _try_move() -> void:
	if moving:
		return
	var v := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	if v.length() < 0.4:
		return
	var b := _yaw_node.global_basis
	var w := b.x * v.x + b.z * v.y
	var a := snappedf(atan2(w.z, w.x), PI / 4.0)
	step(Vector2i(roundi(cos(a)), roundi(sin(a))))


## Moves one square in grid direction `dir` if the game allows it.
func step(dir: Vector2i) -> bool:
	if moving:
		return false
	var res: Dictionary = game.request_player_step(dir)
	if not res.ok:
		return false
	moving = true
	var dur: float = cfg.player.climb_step_time if res.slow else cfg.player.step_time
	var from := position
	var to: Vector3 = res.world
	var hop := 0.5 if res.slow else 0.15
	var t := create_tween()
	t.tween_method(func(k: float): position = from.lerp(to, k) + Vector3.UP * sin(PI * k) * hop, 0.0, 1.0, dur)
	t.tween_callback(func(): moving = false)
	return true


# ------------------------------------------------------------- weapons

func equip(w: String) -> void:
	if w == current or not cfg.weapons.has(w):
		return
	if current != "":
		_last_weapon = current
	current = w
	reload_left = 0.0
	cooldown_left = maxf(cooldown_left, 0.15)
	if not ammo.has(w):
		ammo[w] = int(cfg.weapons[w].get("magazine", 0))
	if _weapon_node:
		_weapon_node.queue_free()
	_weapon_node = WeaponMeshes.build(cfg.weapons[w].model)
	_hand.add_child(_weapon_node)
	_muzzle_light.position = _weapon_node.get_meta("muzzle")


func cycle(step_by: int) -> void:
	var inv: Array = game.inventory()
	if inv.size() < 2:
		return
	var i := inv.find(current)
	equip(inv[(i + step_by + inv.size()) % inv.size()])


## Called when a weapon is picked up: new weapons are equipped, owned ones refilled.
func on_pickup(w: String, is_new: bool) -> void:
	ammo[w] = int(cfg.weapons[w].get("magazine", 0))
	if w == current:
		reload_left = 0.0
	if is_new:
		equip(w)


func start_reload() -> void:
	var w: Dictionary = cfg.weapons[current]
	if w.kind != "gun" or reload_left > 0.0 or ammo.get(current, 0) >= int(w.magazine):
		return
	reload_left = float(w.reload)


func reload_progress() -> float:
	if reload_left <= 0.0:
		return 1.0
	return 1.0 - reload_left / float(cfg.weapons[current].reload)


## Fires / swings the current weapon if it's ready.
func trigger() -> bool:
	if cooldown_left > 0.0 or reload_left > 0.0 or _swinging:
		return false
	var w: Dictionary = cfg.weapons[current]
	_queued_fire = 0.0
	if w.kind == "melee":
		_melee(w)
		return true
	if ammo.get(current, 0) <= 0:
		start_reload()
		return false
	_fire_gun(w)
	return true


func _fire_gun(w: Dictionary) -> void:
	ammo[current] -= 1
	cooldown_left = float(w.cooldown)
	var origin := camera.global_position
	var fwd := -camera.global_basis.z
	var muzzle: Vector3 = _weapon_node.to_global(_weapon_node.get_meta("muzzle"))
	var hits := {}
	for i in int(w.pellets):
		var dir := _spread(fwd, float(w.spread))
		var end := _trace(origin, dir, float(w.range), int(w.pierce), int(w.damage), hits)
		_tracer(muzzle, end)
	_muzzle_light.light_energy = 6.0
	pitch = clampf(pitch + deg_to_rad(0.6 + 0.25 * float(w.damage) * float(w.pellets) / 2.0), PITCH_MIN, PITCH_MAX)
	_apply_look()
	_kick_weapon(0.12)
	fired.emit(current)
	game.apply_hits(hits, fwd)
	if ammo[current] <= 0:
		start_reload()


## Follows one bullet through up to `pierce` enemies; returns where it stopped.
func _trace(origin: Vector3, dir: Vector3, max_range: float, pierce: int, damage: int, hits: Dictionary) -> Vector3:
	var space := get_world_3d().direct_space_state
	var to := origin + dir * max_range
	var exclude: Array[RID] = []
	var left := pierce
	while true:
		var q := PhysicsRayQueryParameters3D.create(origin, to, TERRAIN_LAYER | ENEMY_LAYER, exclude)
		var r := space.intersect_ray(q)
		if r.is_empty():
			return to
		var collider: Object = r.collider
		if collider.has_meta("enemy_id"):
			var id: int = collider.get_meta("enemy_id")
			hits[id] = hits.get(id, 0) + damage
			left -= 1
			exclude.append(r.rid)
			if left <= 0:
				return r.position
		else:
			return r.position
	return to


func _spread(fwd: Vector3, degrees: float) -> Vector3:
	if degrees <= 0.0:
		return fwd
	var r := fwd.cross(Vector3.UP)
	if r.length() < 0.01:
		r = Vector3.RIGHT
	r = r.normalized()
	var u := r.cross(fwd).normalized()
	var a := randf() * TAU
	var t := tan(deg_to_rad(degrees) * sqrt(randf()))
	return (fwd + (r * cos(a) + u * sin(a)) * t).normalized()


func _tracer(from: Vector3, to: Vector3) -> void:
	var im := ImmediateMesh.new()
	im.surface_begin(Mesh.PRIMITIVE_LINES, _tracer_mat)
	im.surface_add_vertex(from)
	im.surface_add_vertex(to)
	im.surface_end()
	var mi := MeshInstance3D.new()
	mi.mesh = im
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.top_level = true
	add_child(mi)
	get_tree().create_timer(0.06).timeout.connect(mi.queue_free)


func _melee(w: Dictionary) -> void:
	cooldown_left = float(w.cooldown)
	var fwd := aim_flat()
	var fwd2 := Vector2(fwd.x, fwd.z)
	var found: Array = []
	var positions: Dictionary = game.enemy_positions()
	for id in positions:
		var d: Vector3 = positions[id] - global_position
		var flat := Vector2(d.x, d.z)
		var dist := flat.length()
		if dist > float(w.range):
			continue
		if dist > 0.01 and absf(rad_to_deg(fwd2.angle_to(flat))) > float(w.arc) / 2.0:
			continue
		found.append([dist, id])
	found.sort_custom(func(a, b): return a[0] < b[0])
	var hits := {}
	for i in mini(found.size(), int(w.cleave)):
		hits[found[i][1]] = int(w.damage)
	_swing(float(w.arc), float(w.cooldown))
	fired.emit(current)
	game.apply_hits(hits, fwd)


func _swing(arc: float, cooldown: float) -> void:
	_swinging = true
	var half := deg_to_rad(clampf(arc, 40.0, 160.0) / 2.0)
	var dur := clampf(cooldown * 0.45, 0.1, 0.3)
	var t := create_tween()
	t.tween_property(_hand, "rotation:y", half, dur * 0.3)
	t.tween_property(_hand, "rotation:y", -half, dur * 0.4).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.tween_property(_hand, "rotation:y", 0.0, dur * 0.3)
	t.tween_callback(func(): _swinging = false)


func _kick_weapon(amount: float) -> void:
	if _weapon_node == null:
		return
	var t := create_tween()
	t.tween_property(_weapon_node, "position:z", -amount, 0.04)
	t.tween_property(_weapon_node, "position:z", 0.0, 0.12)


# ------------------------------------------------------------- damage feedback

func take_hit() -> void:
	_shake = 0.35
	_mat.emission_energy_multiplier = 3.0
	create_tween().tween_property(_mat, "emission_energy_multiplier", 0.0, 0.4)


func shake(amount: float) -> void:
	_shake = maxf(_shake, amount)


func _update_shake(delta: float) -> void:
	if _shake <= 0.0:
		camera.h_offset = 0.0
		camera.v_offset = 0.0
		return
	_shake = maxf(0.0, _shake - delta)
	camera.h_offset = randf_range(-1.0, 1.0) * _shake * 0.5
	camera.v_offset = randf_range(-1.0, 1.0) * _shake * 0.5
