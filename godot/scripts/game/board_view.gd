extends Node3D
## Builds the 3D board from a Board (terrain columns, ramps, collision) and
## draws the telegraphs: red squares where enemies land next beat, dim red for
## a slow climb landing in two beats, orange where enemies will spawn, gold
## rings under weapon pickups.

const WeaponMeshes = preload("res://scripts/game/weapon_meshes.gd")

const TILE := 2.0 # metres per square
const LEVEL_H := 1.2 # metres per elevation level
const BASE_Y := -2.5 # bottom of the terrain columns
const TERRAIN_LAYER := 1

var board
var _tiles: Node3D
var _overlays: Node3D
var _pool: Array[MeshInstance3D] = []
var _mat_danger: StandardMaterial3D
var _mat_danger_later: StandardMaterial3D
var _mat_spawn: StandardMaterial3D
var _mat_pickup: StandardMaterial3D
var _pickup_nodes := {} # Vector2i -> Node3D


func _ready() -> void:
	_mat_danger = _overlay_mat(Color(1.0, 0.08, 0.05))
	_mat_danger_later = _overlay_mat(Color(0.75, 0.05, 0.05))
	_mat_spawn = _overlay_mat(Color(1.0, 0.5, 0.08))
	_mat_pickup = _overlay_mat(Color(1.0, 0.82, 0.25))


func _overlay_mat(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = Color(c, 0.6)
	m.emission_enabled = true
	m.emission = c
	m.emission_energy_multiplier = 2.0
	m.no_depth_test = false
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m


# ------------------------------------------------------------- coordinates

func cell_to_world(c: Vector2i) -> Vector3:
	return Vector3((c.x - board.width / 2.0 + 0.5) * TILE, board.surface_level(c) * LEVEL_H, (c.y - board.height / 2.0 + 0.5) * TILE)


# ------------------------------------------------------------- terrain

func build(b) -> void:
	board = b
	for child in get_children():
		child.queue_free()
	_pool.clear()
	_pickup_nodes.clear()
	_tiles = Node3D.new()
	_tiles.name = "Tiles"
	add_child(_tiles)
	_overlays = Node3D.new()
	_overlays.name = "Telegraphs"
	add_child(_overlays)

	var mats := {
		"ground_a": _terrain_mat(Color(0.17, 0.18, 0.2)),
		"ground_b": _terrain_mat(Color(0.12, 0.13, 0.15)),
		"hill_a": _terrain_mat(Color(0.42, 0.38, 0.33)),
		"hill_b": _terrain_mat(Color(0.36, 0.33, 0.29)),
		"summit": _terrain_mat(Color(0.62, 0.52, 0.34)),
		"ramp": _terrain_mat(Color(0.5, 0.45, 0.38)),
	}
	# Dark slab underneath so the gaps between squares read as grid lines.
	var slab := MeshInstance3D.new()
	var slab_mesh := BoxMesh.new()
	slab_mesh.size = Vector3(board.width * TILE + 1.0, 0.5, board.height * TILE + 1.0)
	slab.mesh = slab_mesh
	slab.material_override = _terrain_mat(Color(0.03, 0.03, 0.04))
	slab.position = Vector3(0, -0.3, 0)
	_tiles.add_child(slab)

	for y in board.height:
		for x in board.width:
			var c := Vector2i(x, y)
			var lvl: int = board.level(c)
			var checker: bool = (x + y) % 2 == 0
			var mat: Material
			if board.is_ramp(c):
				mat = mats.ramp
			elif lvl == 2:
				mat = mats.summit
			elif lvl == 1:
				mat = mats.hill_a if checker else mats.hill_b
			else:
				mat = mats.ground_a if checker else mats.ground_b
			_build_tile(c, mat)


func _terrain_mat(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 0.85
	return m


func _build_tile(c: Vector2i, mat: Material) -> void:
	var center := cell_to_world(c)
	var gap := TILE * 0.96
	var body := StaticBody3D.new()
	body.collision_layer = TERRAIN_LAYER
	body.collision_mask = 0
	_tiles.add_child(body)
	var top: float
	if board.is_ramp(c):
		# Column up to the low edge, then a wedge rising toward the summit.
		var low: float = (board.level(c) - 1) * LEVEL_H
		top = low
		var wedge := MeshInstance3D.new()
		var prism := PrismMesh.new()
		prism.left_to_right = 1.0
		prism.size = Vector3(gap, LEVEL_H, gap)
		wedge.mesh = prism
		wedge.material_override = mat
		var up: Vector2i = -board.SIDE_DIR[board.ramp_side[c]]
		wedge.position = Vector3(center.x, low + LEVEL_H / 2.0, center.z)
		wedge.rotation.y = atan2(-float(up.y), float(up.x))
		_tiles.add_child(wedge)
	else:
		top = board.level(c) * LEVEL_H
	var h := top - BASE_Y
	if h > 0.01:
		var col := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(gap, h, gap)
		col.mesh = box
		col.material_override = mat
		col.position = Vector3(center.x, BASE_Y + h / 2.0, center.z)
		_tiles.add_child(col)
	# Collision: a box up to the walkable surface (ramps approximated at mid-height).
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	var surface: float = board.surface_level(c) * LEVEL_H
	bs.size = Vector3(TILE, surface - BASE_Y, TILE)
	shape.shape = bs
	shape.position = Vector3(center.x, BASE_Y + (surface - BASE_Y) / 2.0, center.z)
	body.add_child(shape)


# ------------------------------------------------------------- telegraphs

## danger: cell -> beats until an enemy lands (1 = next beat).
## spawns: [{cell, type, wave}] appearing next beat.
func set_telegraph(danger: Dictionary, spawns: Array) -> void:
	var used := 0
	for c in danger:
		_place_overlay(used, c, _mat_danger if danger[c] <= 1 else _mat_danger_later, 0.92)
		used += 1
	for s in spawns:
		_place_overlay(used, s.cell, _mat_spawn, 0.8)
		used += 1
	for i in range(used, _pool.size()):
		_pool[i].visible = false


func _place_overlay(i: int, c: Vector2i, mat: Material, size: float) -> void:
	while _pool.size() <= i:
		var mi := MeshInstance3D.new()
		var plane := PlaneMesh.new()
		plane.size = Vector2(TILE, TILE)
		mi.mesh = plane
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_overlays.add_child(mi)
		_pool.append(mi)
	var mi := _pool[i]
	mi.visible = true
	mi.material_override = mat
	mi.transform = _surface_transform(c, 0.05)
	mi.scale = Vector3(size, 1, size)


## Transform lying on the square's surface (tilted to the slope on ramps).
func _surface_transform(c: Vector2i, lift: float) -> Transform3D:
	var pos := cell_to_world(c)
	if not board.is_ramp(c):
		return Transform3D(Basis.IDENTITY, pos + Vector3.UP * lift)
	var up: Vector2i = -board.SIDE_DIR[board.ramp_side[c]]
	var slope := Vector3(up.x * TILE, LEVEL_H, up.y * TILE).normalized()
	var side0 := Vector3(up.y, 0, -up.x)
	var n := slope.cross(side0).normalized()
	if n.y < 0:
		n = -n
	var side := n.cross(slope).normalized()
	return Transform3D(Basis(side, n, slope), pos + n * lift)


## Pulses the danger squares as the beat approaches (progress 0..1).
func set_pulse(progress: float) -> void:
	var p := clampf(progress, 0.0, 1.0)
	var flicker := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 1000.0 * lerpf(4.0, 22.0, p))
	_mat_danger.albedo_color.a = lerpf(0.35, 0.8, p) + 0.12 * flicker * p
	_mat_danger.emission_energy_multiplier = lerpf(1.2, 5.0, p * p)
	_mat_danger_later.albedo_color.a = 0.3
	_mat_danger_later.emission_energy_multiplier = 1.0
	_mat_spawn.albedo_color.a = lerpf(0.3, 0.7, p)
	_mat_spawn.emission_energy_multiplier = lerpf(1.0, 3.0, p)


# ------------------------------------------------------------- pickups

func set_pickups(pickups: Dictionary, weapons: Dictionary) -> void:
	for c in _pickup_nodes.keys():
		if not pickups.has(c):
			_pickup_nodes[c].queue_free()
			_pickup_nodes.erase(c)
	for c in pickups:
		if _pickup_nodes.has(c):
			continue
		var node := Node3D.new()
		node.transform = _surface_transform(c, 0.06)
		var ring := MeshInstance3D.new()
		var torus := TorusMesh.new()
		torus.inner_radius = 0.6
		torus.outer_radius = 0.78
		ring.mesh = torus
		ring.material_override = _mat_pickup
		ring.scale = Vector3(1, 0.15, 1)
		node.add_child(ring)
		var spinner := Node3D.new()
		spinner.name = "Spinner"
		spinner.position = Vector3(0, 1.0, 0)
		var model := WeaponMeshes.build(weapons[pickups[c]].model)
		model.scale = Vector3.ONE * 1.4
		spinner.add_child(model)
		node.add_child(spinner)
		var label := Label3D.new()
		label.text = weapons[pickups[c]].name
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.font_size = 48
		label.pixel_size = 0.006
		label.outline_size = 10
		label.modulate = Color(1.0, 0.86, 0.4)
		label.position = Vector3(0, 2.0, 0)
		node.add_child(label)
		var light := OmniLight3D.new()
		light.light_color = Color(1.0, 0.8, 0.3)
		light.light_energy = 1.5
		light.omni_range = 3.0
		light.position = Vector3(0, 1.0, 0)
		node.add_child(light)
		_overlays.add_child(node)
		_pickup_nodes[c] = node


func _process(delta: float) -> void:
	for c in _pickup_nodes:
		var spinner: Node3D = _pickup_nodes[c].get_node("Spinner")
		spinner.rotation.y += delta * 1.6
		spinner.position.y = 1.0 + 0.15 * sin(Time.get_ticks_msec() / 400.0)
