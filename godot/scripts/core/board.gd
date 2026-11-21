extends RefCounted
## Terrain grid: elevation levels, ramps, climb costs, edges, distance fields.
## Pure logic: no nodes, no rendering. Cells are Vector2i(x, y); x grows east,
## y grows south (y = 0 is the north edge).

const DIRS8: Array[Vector2i] = [
	Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1),
	Vector2i(1, 1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(-1, -1),
]
const SIDE_DIR := {"N": Vector2i(0, -1), "S": Vector2i(0, 1), "E": Vector2i(1, 0), "W": Vector2i(-1, 0)}
const UNREACHABLE := 1 << 30

var width: int
var height: int
var climb_extra_cost: int
var elev: PackedInt32Array
var ramp_side: Dictionary = {} # Vector2i -> "N" | "E" | "S" | "W"
var plateau: Rect2i
var summit: Rect2i


func _init(cfg: Dictionary) -> void:
	var b: Dictionary = cfg.board
	width = b.width
	height = b.height
	climb_extra_cost = cfg.terrain.climb_extra_cost
	elev.resize(width * height)
	elev.fill(0)
	plateau = _centered(b.plateau_size)
	summit = _centered(b.summit_size)
	for y in range(plateau.position.y, plateau.end.y):
		for x in range(plateau.position.x, plateau.end.x):
			elev[y * width + x] = 1
	for y in range(summit.position.y, summit.end.y):
		for x in range(summit.position.x, summit.end.x):
			elev[y * width + x] = 2
	var size: int = b.plateau_size
	for r in b.ramps:
		var start: int = r.start if r.start >= 0 else int((size - r.width) / 2.0)
		for i in r.width:
			var a: int = start + i
			if a < 0 or a >= size:
				continue
			var c: Vector2i
			match r.side:
				"N": c = Vector2i(plateau.position.x + a, plateau.position.y)
				"S": c = Vector2i(plateau.position.x + a, plateau.end.y - 1)
				"W": c = Vector2i(plateau.position.x, plateau.position.y + a)
				_: c = Vector2i(plateau.end.x - 1, plateau.position.y + a)
			if level(c) == 1:
				ramp_side[c] = r.side


func _centered(size: int) -> Rect2i:
	return Rect2i(int((width - size) / 2.0), int((height - size) / 2.0), size, size)


func in_bounds(c: Vector2i) -> bool:
	return c.x >= 0 and c.y >= 0 and c.x < width and c.y < height


func level(c: Vector2i) -> int:
	return elev[c.y * width + c.x]


func is_ramp(c: Vector2i) -> bool:
	return ramp_side.has(c)


func is_summit(c: Vector2i) -> bool:
	return summit.has_point(c)


## Height of the walkable surface, in levels (a ramp square sits halfway up).
func surface_level(c: Vector2i) -> float:
	return level(c) - 0.5 if is_ramp(c) else float(level(c))


## One level up onto a ramp square from below: a free climb.
func is_ramp_climb(from: Vector2i, to: Vector2i) -> bool:
	return level(to) - level(from) == 1 and is_ramp(to)


## Extra movement a step costs beyond the normal 1.
func climb_extra(from: Vector2i, to: Vector2i) -> int:
	var diff := level(to) - level(from)
	if diff <= 0:
		return 0
	if diff == 1 and is_ramp_climb(from, to):
		return 0
	return diff * climb_extra_cost


func step_cost(from: Vector2i, to: Vector2i) -> int:
	return 1 + climb_extra(from, to)


func summit_cells() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for y in range(summit.position.y, summit.end.y):
		for x in range(summit.position.x, summit.end.x):
			out.append(Vector2i(x, y))
	return out


## Edge a cell is on: "N" | "S" | "W" | "E" | "" (corners report N/S).
func edge_side(c: Vector2i) -> String:
	if c.y == 0:
		return "N"
	if c.y == height - 1:
		return "S"
	if c.x == 0:
		return "W"
	if c.x == width - 1:
		return "E"
	return ""


## Direction pointing away from the nearest edge (toward the middle).
func inward_dir(c: Vector2i) -> Vector2i:
	var best := "N"
	var best_d := c.y
	for side in ["S", "W", "E"]:
		var d: int = {"S": height - 1 - c.y, "W": c.x, "E": width - 1 - c.x}[side]
		if d < best_d:
			best = side
			best_d = d
	return -SIDE_DIR[best]


## Edge cells an enemy of `type` may spawn on. Pawns only use the middle
## `lane_width` cells of each edge; other pieces any edge cell except corners.
func spawn_cells(type: String, lane_width: int) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	if type == "P":
		var w := mini(lane_width, width)
		var a := int((width - w) / 2.0)
		for x in range(a, a + w):
			out.append(Vector2i(x, 0))
			out.append(Vector2i(x, height - 1))
		var h := mini(lane_width, height)
		var b := int((height - h) / 2.0)
		for y in range(b, b + h):
			out.append(Vector2i(0, y))
			out.append(Vector2i(width - 1, y))
		return out
	for x in range(1, width - 1):
		out.append(Vector2i(x, 0))
		out.append(Vector2i(x, height - 1))
	for y in range(1, height - 1):
		out.append(Vector2i(0, y))
		out.append(Vector2i(width - 1, y))
	return out


## Movement cost from every cell to the nearest target, stepping one square at
## a time in 8 directions and paying climb costs. Ignores pieces.
func distance_field(targets: Array) -> PackedInt32Array:
	var dist := PackedInt32Array()
	dist.resize(width * height)
	dist.fill(UNREACHABLE)
	var buckets: Array = [[]]
	for t in targets:
		dist[t.y * width + t.x] = 0
		buckets[0].append(t)
	var d := 0
	while d < buckets.size():
		for to in buckets[d]:
			if dist[to.y * width + to.x] != d:
				continue
			for dir in DIRS8:
				var from: Vector2i = to + dir
				if not in_bounds(from):
					continue
				var nd := d + step_cost(from, to)
				var i := from.y * width + from.x
				if nd < dist[i]:
					dist[i] = nd
					while buckets.size() <= nd:
						buckets.append([])
					buckets[nd].append(from)
		d += 1
	return dist


func dist_at(field: PackedInt32Array, c: Vector2i) -> int:
	return field[c.y * width + c.x]
