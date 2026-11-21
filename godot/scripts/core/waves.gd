extends RefCounted
## Wave composition and weighted picks. Pure logic; randomness comes from the
## RandomNumberGenerator passed in (seeded by the battle).

const TIERS: Array[String] = ["P", "N", "B", "R", "Q", "K"]
const UPGRADE := {"P": "N", "N": "B", "B": "R", "R": "Q", "Q": "Q", "K": "K"}


## Piece types for wave `w` (1-based). Past the end of the table the last row
## grows and pieces may be upgraded one tier.
static func composition(cfg: Dictionary, w: int, rng: RandomNumberGenerator) -> Array[String]:
	var wc: Dictionary = cfg.waves
	var table: Array = wc.table
	var row: Dictionary = table[mini(w, table.size()) - 1]
	var past := maxi(0, w - table.size())
	var mult: float = 1.0 + wc.endless_growth_per_wave * past
	var out: Array[String] = []
	for t in TIERS:
		var n: int = roundi(row.get(t, 0) * mult)
		for i in n:
			out.append(t)
	if past > 0:
		var chance: float = minf(wc.endless_max_upgrade_chance, wc.endless_upgrade_chance_per_wave * past)
		for i in out.size():
			if rng.randf() < chance:
				out[i] = UPGRADE[out[i]]
	return out


static func weighted_pick(weights: Dictionary, rng: RandomNumberGenerator) -> String:
	var total := 0.0
	for k in weights:
		total += maxf(0.0, weights[k])
	var r := rng.randf() * total
	var last := ""
	for k in weights:
		var w: float = maxf(0.0, weights[k])
		if w <= 0.0:
			continue
		last = k
		r -= w
		if r < 0.0:
			return k
	return last
