extends Node3D
## One enemy chess piece: model, hit box, HP pips and its animations.

const PieceMeshes = preload("res://scripts/game/piece_meshes.gd")
const ENEMY_LAYER := 2

var id: int
var type: String
var max_hp: int
var _mat: StandardMaterial3D
var _body: StaticBody3D
var _model: Node3D
var _hp_label: Label3D
var _climb_tween: Tween


func setup(enemy_id: int, piece_type: String, hp: int) -> void:
	id = enemy_id
	type = piece_type
	max_hp = hp
	name = "Enemy_%d_%s" % [id, type]
	_mat = StandardMaterial3D.new()
	_mat.albedo_color = Color(0.08, 0.07, 0.08)
	_mat.metallic = 0.35
	_mat.roughness = 0.3
	_mat.rim_enabled = true
	_mat.rim = 0.6
	_mat.rim_tint = 0.2
	_mat.emission_enabled = true
	_mat.emission = Color(0.9, 0.05, 0.05)
	_mat.emission_energy_multiplier = 0.15
	_model = PieceMeshes.build(type, _mat)
	add_child(_model)
	var h := PieceMeshes.height_of(type)
	_body = StaticBody3D.new()
	_body.collision_layer = ENEMY_LAYER
	_body.collision_mask = 0
	_body.set_meta("enemy_id", id)
	var shape := CollisionShape3D.new()
	var cyl := CylinderShape3D.new()
	cyl.radius = 0.6
	cyl.height = h
	shape.shape = cyl
	shape.position = Vector3(0, h / 2.0, 0)
	_body.add_child(shape)
	add_child(_body)
	_hp_label = Label3D.new()
	_hp_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_hp_label.font_size = 40
	_hp_label.pixel_size = 0.006
	_hp_label.outline_size = 8
	_hp_label.modulate = Color(1.0, 0.3, 0.25)
	_hp_label.position = Vector3(0, h + 0.35, 0)
	add_child(_hp_label)
	set_hp(hp)


func set_hp(hp: int) -> void:
	_hp_label.text = "●".repeat(maxi(hp, 0)) + "○".repeat(maxi(max_hp - hp, 0))
	_hp_label.visible = hp < max_hp


func face(dir: Vector2i) -> void:
	if dir != Vector2i.ZERO:
		_model.rotation.y = atan2(float(dir.x), float(dir.y))


## Rises out of the ground at its spawn square.
func appear(at: Vector3) -> void:
	position = at + Vector3(0, -2.0, 0)
	scale = Vector3.ONE * 0.6
	var t := create_tween().set_parallel()
	t.tween_property(self, "position", at, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(self, "scale", Vector3.ONE, 0.45)


func move_to(to: Vector3, hop: float, duration := 0.35) -> void:
	_stop_climb()
	var from := position
	var t := create_tween()
	t.tween_method(func(k: float): position = from.lerp(to, k) + Vector3.UP * sin(PI * k) * hop, 0.0, 1.0, duration) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


## Wobble while spending a beat climbing a step.
func climbing() -> void:
	_stop_climb()
	_climb_tween = create_tween().set_loops(3)
	_climb_tween.tween_property(_model, "rotation:z", 0.12, 0.12)
	_climb_tween.tween_property(_model, "rotation:z", -0.12, 0.12)
	_climb_tween.finished.connect(func(): _model.rotation.z = 0.0)


func _stop_climb() -> void:
	if _climb_tween and _climb_tween.is_valid():
		_climb_tween.kill()
	_model.rotation.z = 0.0


## Lunges at the player's square and back.
func attack(target: Vector3) -> void:
	var home := position
	var mid := home.lerp(target, 0.55) + Vector3.UP * 0.3
	var t := create_tween()
	t.tween_property(self, "position", mid, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.tween_property(self, "position", home, 0.25).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_flash(Color(1.0, 0.1, 0.05), 3.0)


func hit_flash() -> void:
	_flash(Color(1.0, 0.9, 0.8), 2.5)


func _flash(c: Color, energy: float) -> void:
	_mat.emission = c
	_mat.emission_energy_multiplier = energy
	var t := create_tween()
	t.tween_property(_mat, "emission_energy_multiplier", 0.15, 0.25)
	t.tween_callback(func(): _mat.emission = Color(0.9, 0.05, 0.05))


## Topples over, sinks and frees itself.
func die(push_dir: Vector3) -> void:
	_body.collision_layer = 0
	_hp_label.visible = false
	_stop_climb()
	var axis := Vector3.UP.cross(push_dir.normalized() if push_dir.length() > 0.01 else Vector3.FORWARD)
	if axis.length() < 0.01:
		axis = Vector3.RIGHT
	var start := _model.transform
	var t := create_tween()
	t.tween_method(func(k: float): _model.transform = Transform3D(start.basis.rotated(axis.normalized(), k * PI / 2.0), start.origin), 0.0, 1.0, 0.35) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_flash(Color(1.0, 1.0, 1.0), 4.0)
	t.tween_interval(0.4)
	t.tween_property(self, "position:y", position.y - 2.5, 0.8).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	t.tween_callback(queue_free)


## Reached the summit: flares red and sinks into the hill.
func breach(delay: float) -> void:
	_body.collision_layer = 0
	var t := create_tween()
	t.tween_interval(delay)
	t.tween_callback(func(): _flash(Color(1.0, 0.0, 0.0), 8.0))
	t.tween_property(self, "scale", Vector3(1.4, 0.05, 1.4), 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	t.tween_callback(queue_free)
