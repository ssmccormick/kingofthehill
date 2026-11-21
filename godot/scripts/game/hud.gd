extends CanvasLayer
## Heads-up display and menus, built in code. main.gd calls update(info)
## every frame and the show_* functions; buttons emit the signals below.

signal start_requested(mode: String, seed_text: String)
signal resume_requested
signal restart_requested
signal menu_requested
signal quit_requested

const RED := Color(1.0, 0.22, 0.18)
const GOLD := Color(1.0, 0.82, 0.35)
const INK := Color(0.93, 0.91, 0.86)
const MUTED := Color(0.62, 0.62, 0.66)

var _root: Control
var _hud: Control
var _hp: Label
var _hill_bar: ProgressBar
var _hill_label: Label
var _wave: Label
var _beat_bar: ProgressBar
var _beat_label: Label
var _beat_fill: StyleBoxFlat
var _score: Label
var _weapon: Label
var _ammo: Label
var _slots: Label
var _danger: Label
var _message: Label
var _hint: Label
var _crosshair: Control
var _vignette: ColorRect
var _start: Control
var _pause: Control
var _end: Control
var _end_title: Label
var _end_text: Label
var _seed_edit: LineEdit
var _msg_tween: Tween


func _ready() -> void:
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	_build_hud()
	_build_start()
	_build_pause()
	_build_end()


# ------------------------------------------------------------- builders

func _label(text: String, size: int, color := INK) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	l.add_theme_constant_override("outline_size", 6)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _bar(fill: Color, w: float, h: float) -> ProgressBar:
	var b := ProgressBar.new()
	b.show_percentage = false
	b.custom_minimum_size = Vector2(w, h)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0, 0, 0, 0.55)
	bg.set_corner_radius_all(3)
	var fg := StyleBoxFlat.new()
	fg.bg_color = fill
	fg.set_corner_radius_all(3)
	b.add_theme_stylebox_override("background", bg)
	b.add_theme_stylebox_override("fill", fg)
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return b


func _corner(preset: int, offset: Vector2, grow_left := false) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.set_anchors_preset(preset)
	box.position = offset
	if grow_left:
		box.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	box.add_theme_constant_override("separation", 4)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud.add_child(box)
	return box


func _build_hud() -> void:
	_hud = Control.new()
	_hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	_hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_hud)

	_vignette = ColorRect.new()
	_vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	_vignette.color = Color(0.8, 0.0, 0.0, 0.0)
	_vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud.add_child(_vignette)

	var tl := _corner(Control.PRESET_TOP_LEFT, Vector2(24, 18))
	_hp = _label("", 30, RED)
	tl.add_child(_hp)
	_hill_label = _label("HILL", 15, MUTED)
	tl.add_child(_hill_label)
	_hill_bar = _bar(GOLD, 220, 12)
	tl.add_child(_hill_bar)

	var top := VBoxContainer.new()
	top.set_anchors_preset(Control.PRESET_CENTER_TOP)
	top.position = Vector2(-210, 14)
	top.custom_minimum_size = Vector2(420, 0)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_theme_constant_override("separation", 4)
	_hud.add_child(top)
	_wave = _label("", 20)
	_wave.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	top.add_child(_wave)
	_beat_bar = _bar(RED, 420, 10)
	_beat_fill = _beat_bar.get_theme_stylebox("fill") as StyleBoxFlat
	top.add_child(_beat_bar)
	_beat_label = _label("", 14, MUTED)
	_beat_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	top.add_child(_beat_label)

	var tr := _corner(Control.PRESET_TOP_RIGHT, Vector2(-24, 18), true)
	_score = _label("", 26, GOLD)
	_score.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	tr.add_child(_score)

	var br := _corner(Control.PRESET_BOTTOM_RIGHT, Vector2(-24, -110), true)
	_weapon = _label("", 26)
	_weapon.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	br.add_child(_weapon)
	_ammo = _label("", 22, GOLD)
	_ammo.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	br.add_child(_ammo)

	_slots = _label("", 16, MUTED)
	_slots.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_slots.position = Vector2(-500, -44)
	_slots.custom_minimum_size = Vector2(1000, 0)
	_slots.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hud.add_child(_slots)

	_hint = _label("WASD move one square · Mouse aim · LMB fire · R reload · 1-9 / wheel switch · Q last weapon · Esc pause", 14, MUTED)
	_hint.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_hint.position = Vector2(24, -30)
	_hud.add_child(_hint)

	_danger = _label("YOU'RE ON A RED SQUARE — MOVE!", 24, RED)
	_danger.set_anchors_preset(Control.PRESET_CENTER)
	_danger.position = Vector2(-260, 60)
	_danger.custom_minimum_size = Vector2(520, 0)
	_danger.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_danger.visible = false
	_hud.add_child(_danger)

	_message = _label("", 44, INK)
	_message.set_anchors_preset(Control.PRESET_CENTER)
	_message.position = Vector2(-400, -170)
	_message.custom_minimum_size = Vector2(800, 0)
	_message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_message.modulate.a = 0.0
	_hud.add_child(_message)

	_crosshair = Control.new()
	_crosshair.set_anchors_preset(Control.PRESET_CENTER)
	_crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud.add_child(_crosshair)
	for r in [Rect2(-14, -1, 9, 2), Rect2(5, -1, 9, 2), Rect2(-1, -14, 2, 9), Rect2(-1, 5, 2, 9), Rect2(-1, -1, 2, 2)]:
		var line := ColorRect.new()
		line.color = Color(1, 1, 1, 0.9)
		line.position = r.position
		line.size = r.size
		line.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_crosshair.add_child(line)


func _panel(title: String, subtitle: String) -> Array:
	var shade := ColorRect.new()
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(0.02, 0.02, 0.03, 0.55)
	_root.add_child(shade)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.add_child(center)
	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.07, 0.07, 0.09, 0.94)
	sb.border_color = Color(0.5, 0.12, 0.1)
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(8)
	sb.set_content_margin_all(28)
	panel.add_theme_stylebox_override("panel", sb)
	center.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	box.custom_minimum_size = Vector2(460, 0)
	panel.add_child(box)
	var t := _label(title, 42)
	box.add_child(t)
	var sub := _label(subtitle, 16, MUTED)
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.custom_minimum_size = Vector2(460, 0)
	box.add_child(sub)
	shade.visible = false
	return [shade, box, t, sub]


func _button(box: Container, text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", 20)
	b.custom_minimum_size = Vector2(0, 44)
	b.pressed.connect(cb)
	box.add_child(b)
	return b


func _build_start() -> void:
	var p := _panel("KING OF THE HILL", "You are the last king. Enemy pieces march on the hill from every edge and move every few seconds. Red squares show where they will land. Don't be standing on one. Shoot them before they reach the summit.")
	_start = p[0]
	var box: VBoxContainer = p[1]
	_button(box, "Campaign: survive 10 waves", func(): start_requested.emit("campaign", _seed_edit.text))
	_button(box, "Endless: play for score", func(): start_requested.emit("endless", _seed_edit.text))
	_button(box, "Sandbox: no enemies", func(): start_requested.emit("sandbox", _seed_edit.text))
	var row := HBoxContainer.new()
	row.add_child(_label("Seed", 16, MUTED))
	_seed_edit = LineEdit.new()
	_seed_edit.placeholder_text = "random"
	_seed_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_seed_edit)
	box.add_child(row)
	var keys := _label("WASD move one square (camera-relative) · Mouse aim · LMB fire/swing · R reload · 1-9 or wheel switch weapon · Q last weapon · Esc pause\nDev: F5 next wave · F6 freeze enemies · F7 all weapons · F8 kill all", 13, MUTED)
	keys.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	keys.custom_minimum_size = Vector2(460, 0)
	box.add_child(keys)
	_button(box, "Quit", func(): quit_requested.emit())


func _build_pause() -> void:
	var p := _panel("PAUSED", "")
	_pause = p[0]
	var box: VBoxContainer = p[1]
	_button(box, "Resume", func(): resume_requested.emit())
	_button(box, "Restart (same seed)", func(): restart_requested.emit())
	_button(box, "Main menu", func(): menu_requested.emit())


func _build_end() -> void:
	var p := _panel("", "")
	_end = p[0]
	var box: VBoxContainer = p[1]
	_end_title = p[2]
	_end_text = p[3]
	_button(box, "Play again (new seed)", func(): start_requested.emit("", ""))
	_button(box, "Main menu", func(): menu_requested.emit())


# ------------------------------------------------------------- API

func show_start() -> void:
	_start.visible = true
	_pause.visible = false
	_end.visible = false
	_hud.visible = false


func show_pause(on: bool) -> void:
	_pause.visible = on


func show_end(won: bool, text: String) -> void:
	_end_title.text = "VICTORY" if won else "DEFEAT"
	_end_title.add_theme_color_override("font_color", GOLD if won else RED)
	_end_text.text = text
	_end.visible = true


func show_game() -> void:
	_start.visible = false
	_pause.visible = false
	_end.visible = false
	_hud.visible = true
	_hint.modulate.a = 1.0
	create_tween().tween_interval(12.0).finished.connect(func(): create_tween().tween_property(_hint, "modulate:a", 0.0, 1.5))


func message(text: String, color := INK, duration := 1.8) -> void:
	_message.text = text
	_message.add_theme_color_override("font_color", color)
	if _msg_tween and _msg_tween.is_valid():
		_msg_tween.kill()
	_message.modulate.a = 1.0
	_msg_tween = create_tween()
	_msg_tween.tween_interval(duration)
	_msg_tween.tween_property(_message, "modulate:a", 0.0, 0.6)


func flash_damage() -> void:
	_vignette.color.a = 0.35
	create_tween().tween_property(_vignette, "color:a", 0.0, 0.5)


func kick_crosshair() -> void:
	_crosshair.scale = Vector2(1.6, 1.6)
	create_tween().tween_property(_crosshair, "scale", Vector2.ONE, 0.15)


## info keys: hp, max_hp, hill, max_hill, wave_text, beat_progress, beat_left,
## score, kills, weapon, ammo_text, slots_text, in_danger
func update(info: Dictionary) -> void:
	_hp.text = "♥".repeat(maxi(info.hp, 0)) + "♡".repeat(maxi(info.max_hp - info.hp, 0))
	_hill_bar.max_value = info.max_hill
	_hill_bar.value = info.hill
	_hill_label.text = "HILL  %d / %d" % [info.hill, info.max_hill]
	_wave.text = info.wave_text
	_beat_bar.value = info.beat_progress * 100.0
	_beat_fill.bg_color = Color(0.85, 0.3, 0.2).lerp(Color(1.0, 0.05, 0.05), info.beat_progress)
	_beat_label.text = "ENEMIES MOVE IN %.1fs" % info.beat_left
	_score.text = "%d\n%d kills" % [info.score, info.kills]
	_weapon.text = info.weapon
	_ammo.text = info.ammo_text
	_slots.text = info.slots_text
	_danger.visible = info.in_danger and int(Time.get_ticks_msec() / 150) % 2 == 0
