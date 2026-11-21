extends RefCounted
## The whole game state and its rules, independent of rendering and time.
## The 3D layer calls player_step() / damage_enemy() as the player acts and
## do_beat() every beat, then animates the returned events.
##
## Beat flow (do_beat):
##   1. Every planned enemy move resolves, in plan order. A move whose
##      destination is the player's cell at that moment is an attack: the
##      player takes damage and the enemy stays put. Reaching a summit cell
##      is a breach: the hill takes damage and the enemy is removed.
##   2. Telegraphed spawns appear.
##   3. Wave clears / win / loss are checked.
##   4. The next beat's spawns and enemy moves are planned (and telegraphed).

const Board = preload("res://scripts/core/board.gd")
const EnemyPlanner = preload("res://scripts/core/enemy_planner.gd")
const Waves = preload("res://scripts/core/waves.gd")

const KING_DIRS: Array[Vector2i] = [
	Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1),
	Vector2i(1, 1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(-1, -1),
]
const ENDLESS_WAVES := 1 << 30

var cfg: Dictionary
var board
var rng := RandomNumberGenerator.new()
var seed_value: int
var mode: String # "campaign" | "endless" | "sandbox"
var status := "playing" # "playing" | "won" | "lost"
var loss_reason := ""

var beat := 0
var score := 0
var kills := 0
var player_cell: Vector2i
var player_hp: int
var hill_hp: int

var enemies: Dictionary = {} # id -> {id, type, cell, facing, has_moved, hp, wave}
var plans: Dictionary = {} # id -> {to, beats_left, attack}
var plan_order: Array = [] # enemy ids, execution order
var next_id := 1
var summit_dist: PackedInt32Array
var frozen := false # dev: enemies don't plan or move

var waves_spawned := 0
var next_wave_beat: int
var last_wave_beat := -1
var pending_spawns: Array = [] # [{cell, type, wave}] appearing on the next beat
var pending_wave := 0 # wave number of the pending spawns (0 = none / trickle)
var carry: Array = [] # [{type, wave}] that found no free edge cell
var open_waves: Array = [] # waves spawned but not yet destroyed

var inventory: Array = [] # weapon ids the player owns, in slot order
var pickups: Dictionary = {} # Vector2i -> weapon id lying on the board


func _init(config: Dictionary, seed_in: int = -1, mode_in: String = "campaign") -> void:
	cfg = config
	mode = mode_in
	seed_value = seed_in if seed_in >= 0 else randi()
	rng.seed = seed_value
	board = Board.new(cfg)
	summit_dist = board.distance_field(board.summit_cells())
	player_cell = board.summit.position
	player_hp = cfg.player.hp
	hill_hp = cfg.hill.hp
	next_wave_beat = cfg.waves.first_wave_beat
	for w in cfg.loadout.start:
		if cfg.weapons.has(w) and not inventory.has(w):
			inventory.append(w)
	_plan_spawns()
	plan_enemies()


# ---------------------------------------------------------------- queries

func enemy_at(c: Vector2i) -> int:
	for id in enemies:
		if enemies[id].cell == c:
			return id
	return -1


func total_waves() -> int:
	match mode:
		"campaign": return cfg.waves.campaign_waves
		"endless": return ENDLESS_WAVES
		_: return 0


## Beats until the next wave arrives (1 = on the next beat), or -1 if none left.
func beats_until_wave() -> int:
	if waves_spawned >= total_waves():
		return -1
	if pending_wave > 0:
		return 1
	return maxi(1, next_wave_beat - beat)


## Telegraphed danger: cell -> beats until an enemy lands there (1 = next beat).
func danger_cells() -> Dictionary:
	var out := {}
	for id in plans:
		var p: Dictionary = plans[id]
		if not out.has(p.to) or p.beats_left < out[p.to]:
			out[p.to] = p.beats_left
	return out


# ---------------------------------------------------------------- player

## Tries to move the player one square (8 directions). Returns
## {ok, cell, slow, picked} where slow means the step was a costly climb and
## picked is the weapon id picked up there ("" if none).
func player_step(dir: Vector2i) -> Dictionary:
	var fail := {"ok": false, "cell": player_cell, "slow": false, "picked": ""}
	if status != "playing" or not KING_DIRS.has(dir):
		return fail
	var to := player_cell + dir
	if not board.in_bounds(to) or enemy_at(to) != -1:
		return fail
	var slow: bool = board.climb_extra(player_cell, to) > 0
	player_cell = to
	return {"ok": true, "cell": to, "slow": slow, "picked": _take_pickup(to)}


## Picks up the weapon on `c`, if any. Owned weapons are still collected
## (the 3D layer refills that weapon's magazine). Returns the weapon id or "".
func _take_pickup(c: Vector2i) -> String:
	if not pickups.has(c):
		return ""
	var w: String = pickups[c]
	pickups.erase(c)
	if not inventory.has(w) and inventory.size() < int(cfg.loadout.max_slots):
		inventory.append(w)
	return w


## Weapon to drop: one the player doesn't own yet (else any), seeded.
func _drop_choice() -> String:
	var all: Array = cfg.weapons.keys()
	all.sort()
	var fresh: Array = all.filter(func(w): return not inventory.has(w) and not pickups.values().has(w))
	var pool: Array = fresh if not fresh.is_empty() else all
	return pool[rng.randi_range(0, pool.size() - 1)]


## Places a weapon pickup on `c` (or near the hill if c is null). Returns the
## cell used, or null if the board is at its pickup limit / no cell is free.
func drop_weapon(c = null, weapon: String = ""):
	if pickups.size() >= int(cfg.drops.max_on_board):
		return null
	if c == null:
		var lo: int = cfg.drops.near_hill_min
		var hi: int = cfg.drops.near_hill_max
		var options: Array = []
		for y in board.height:
			for x in board.width:
				var cell := Vector2i(x, y)
				var dx := maxi(board.plateau.position.x - x, x - (board.plateau.end.x - 1))
				var dy := maxi(board.plateau.position.y - y, y - (board.plateau.end.y - 1))
				var d := maxi(dx, dy)
				if d >= lo and d <= hi and cell != player_cell and enemy_at(cell) == -1 and not pickups.has(cell):
					options.append(cell)
		if options.is_empty():
			return null
		c = options[rng.randi_range(0, options.size() - 1)]
	elif pickups.has(c):
		return null
	pickups[c] = weapon if weapon != "" else _drop_choice()
	return c


## Applies damage to an enemy. Returns {killed, points, events}; events
## carries wave clears / a win caused by the kill.
func damage_enemy(id: int, amount: int) -> Dictionary:
	var events: Array = []
	if status != "playing" or not enemies.has(id):
		return {"killed": false, "points": 0, "events": events}
	var e: Dictionary = enemies[id]
	e.hp -= amount
	if e.hp > 0:
		return {"killed": false, "points": 0, "events": events}
	var points: int = cfg.scoring.piece_values.get(e.type, 0) * cfg.scoring.points_per_value
	score += points
	kills += 1
	var at: Vector2i = e.cell
	_remove_enemy(id)
	if rng.randf() < float(cfg.drops.kill_drop_chance):
		var c = drop_weapon(at)
		if c != null:
			events.append({"type": "drop", "cell": c, "weapon": pickups[c]})
	_check_progress(events)
	return {"killed": true, "points": points, "events": events}


# ---------------------------------------------------------------- beat

func do_beat() -> Array:
	var events: Array = []
	if status != "playing":
		return events
	beat += 1
	for id in plan_order.duplicate():
		if status != "playing":
			break
		if not enemies.has(id) or not plans.has(id):
			continue
		var p: Dictionary = plans[id]
		p.beats_left -= 1
		if p.beats_left > 0:
			events.append({"type": "climbing", "id": id, "to": p.to})
			continue
		plans.erase(id)
		_resolve_move(id, p, events)
	plan_order = plan_order.filter(func(id): return plans.has(id))
	if status == "playing":
		_execute_spawns(events)
		_check_progress(events)
	if status == "playing":
		_plan_spawns()
		plan_enemies()
	return events


func _resolve_move(id: int, p: Dictionary, events: Array) -> void:
	var e: Dictionary = enemies[id]
	if p.to == player_cell:
		var dmg: int = cfg.enemy.attack_damage
		player_hp -= dmg
		events.append({"type": "attack", "id": id, "to": p.to, "damage": dmg})
		if player_hp <= 0:
			_lose("You were taken by an enemy %s." % _piece_name(e.type), events)
		return
	if enemy_at(p.to) != -1:
		events.append({"type": "blocked", "id": id})
		return
	var from: Vector2i = e.cell
	e.cell = p.to
	e.has_moved = true
	events.append({"type": "move", "id": id, "type_name": e.type, "from": from, "to": p.to})
	if board.is_summit(p.to):
		var dmg: int = cfg.hill.breach_damage.get(e.type, 1)
		hill_hp -= dmg
		events.append({"type": "breach", "id": id, "damage": dmg})
		_remove_enemy(id)
		if hill_hp <= 0:
			_lose("The hill has fallen.", events)


## Plans the next beat's moves for every enemy that isn't mid-way through a
## slow move. Telegraphed immediately via danger_cells().
func plan_enemies() -> void:
	var busy := {}
	var keep: Array = []
	for id in plan_order:
		if plans.has(id) and enemies.has(id):
			busy[id] = plans[id]
			keep.append(id)
	plans = busy.duplicate()
	plan_order = keep
	if frozen or status != "playing":
		return
	for p in EnemyPlanner.plan(board, cfg, enemies, busy, player_cell, summit_dist):
		plans[p.id] = {"to": p.to, "beats_left": p.beats, "attack": p.attack}
		plan_order.append(p.id)


func _remove_enemy(id: int) -> void:
	enemies.erase(id)
	plans.erase(id)
	plan_order.erase(id)


func _lose(reason: String, events: Array) -> void:
	status = "lost"
	loss_reason = reason
	events.append({"type": "lost", "reason": reason})


static func _piece_name(t: String) -> String:
	return {"P": "Pawn", "N": "Knight", "B": "Bishop", "R": "Rook", "Q": "Queen", "K": "King"}.get(t, t)


# ---------------------------------------------------------------- spawning

func add_enemy(type: String, cell: Vector2i, facing: Vector2i = Vector2i.ZERO, wave: int = 0) -> int:
	var id := next_id
	next_id += 1
	enemies[id] = {
		"id": id, "type": type, "cell": cell,
		"facing": facing if facing != Vector2i.ZERO else board.inward_dir(cell),
		"has_moved": false, "hp": cfg.enemy.hp.get(type, 3), "wave": wave,
	}
	return id


func _cell_free(c: Vector2i, reserved: Dictionary) -> bool:
	return c != player_cell and enemy_at(c) == -1 and not reserved.has(c)


## Dev: give the player every weapon.
func grant_all_weapons() -> void:
	var all: Array = cfg.weapons.keys()
	for w in all:
		if not inventory.has(w) and inventory.size() < int(cfg.loadout.max_slots):
			inventory.append(w)


## A free spawn cell for `type`, trying `side` first and then the others.
func _pick_spawn_cell(type: String, side: String, reserved: Dictionary):
	var sides := ["N", "E", "S", "W"]
	var start := sides.find(side)
	var all: Array[Vector2i] = board.spawn_cells(type, cfg.spawn.pawn_lane_width)
	for i in 4:
		var s: String = sides[(start + i) % 4]
		var options: Array = all.filter(func(c): return board.edge_side(c) == s and _cell_free(c, reserved))
		if not options.is_empty():
			return options[rng.randi_range(0, options.size() - 1)]
	return null


func _trickle_due(upcoming: int) -> bool:
	var tr: Dictionary = cfg.trickle
	if not tr.enabled or waves_spawned == 0 or waves_spawned >= total_waves() or last_wave_beat < 0:
		return false
	var since := upcoming - last_wave_beat
	return since > 0 and since % int(tr.interval_beats) == 0


## Plans what appears on the next beat (shown as spawn markers).
func _plan_spawns() -> void:
	pending_wave = 0
	pending_spawns = []
	if mode == "sandbox":
		return
	var items: Array = carry
	carry = []
	var upcoming := beat + 1
	if upcoming >= next_wave_beat and waves_spawned < total_waves():
		pending_wave = waves_spawned + 1
		for t in Waves.composition(cfg, pending_wave, rng):
			items.append({"type": t, "wave": pending_wave})
	elif _trickle_due(upcoming):
		items.append({"type": Waves.weighted_pick(cfg.trickle.weights, rng), "wave": 0})
	var sides := ["N", "E", "S", "W"]
	var offset := rng.randi_range(0, 3)
	var reserved := {}
	for i in items.size():
		var item: Dictionary = items[i]
		var c = _pick_spawn_cell(item.type, sides[(offset + i) % 4], reserved)
		if c == null:
			carry.append(item)
		else:
			reserved[c] = true
			pending_spawns.append({"cell": c, "type": item.type, "wave": item.wave})


func _execute_spawns(events: Array) -> void:
	var spawned := 0
	var reserved := {}
	for s in pending_spawns:
		var c = s.cell
		if not _cell_free(c, reserved):
			c = _pick_spawn_cell(s.type, board.edge_side(s.cell), reserved)
		if c == null:
			carry.append({"type": s.type, "wave": s.wave})
			continue
		reserved[c] = true
		var id := add_enemy(s.type, c, Vector2i.ZERO, s.wave)
		spawned += 1
		events.append({"type": "spawn", "id": id, "type_name": s.type, "cell": c})
	if pending_wave > 0:
		waves_spawned = pending_wave
		last_wave_beat = beat
		next_wave_beat = beat + int(cfg.waves.interval_beats)
		open_waves.append(pending_wave)
		events.append({"type": "wave", "wave": pending_wave, "count": spawned, "delayed": carry.size()})
	pending_spawns = []
	pending_wave = 0


## Wave-clear bonuses, campaign win, and an early next wave on a clear board.
func _check_progress(events: Array) -> void:
	if status != "playing":
		return
	var alive := {}
	for id in enemies:
		if enemies[id].wave > 0:
			alive[enemies[id].wave] = true
	for s in pending_spawns + carry:
		if s.wave > 0:
			alive[s.wave] = true
	for w in open_waves.duplicate():
		if alive.has(w):
			continue
		open_waves.erase(w)
		var bonus: int = cfg.scoring.wave_clear_bonus * w
		score += bonus
		events.append({"type": "wave_cleared", "wave": w, "bonus": bonus})
		if cfg.drops.on_wave_clear:
			var c = drop_weapon()
			if c != null:
				events.append({"type": "drop", "cell": c, "weapon": pickups[c]})
	var board_clear := enemies.is_empty() and pending_spawns.is_empty() and carry.is_empty()
	if mode == "campaign" and waves_spawned >= total_waves() and board_clear:
		status = "won"
		events.append({"type": "won"})
		return
	if board_clear and waves_spawned > 0 and waves_spawned < total_waves():
		next_wave_beat = mini(next_wave_beat, beat + int(cfg.waves.clear_breather_beats))


## Dev: the next wave is telegraphed now and arrives on the next beat.
func skip_to_next_wave() -> bool:
	if waves_spawned >= total_waves():
		return false
	for s in pending_spawns:
		carry.push_front({"type": s.type, "wave": s.wave})
	next_wave_beat = beat + 1
	_plan_spawns()
	return true
