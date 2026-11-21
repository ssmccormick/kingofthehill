extends RefCounted
## Weapon models from primitive boxes/cylinders (placeholder art). Every
## model points along +Z. Guns store their muzzle offset in meta "muzzle".

static func build(model: String) -> Node3D:
	var metal := _mat(Color(0.16, 0.17, 0.19), 0.8, 0.35)
	var dark := _mat(Color(0.07, 0.07, 0.08), 0.4, 0.6)
	var wood := _mat(Color(0.36, 0.22, 0.12), 0.0, 0.7)
	var steel := _mat(Color(0.75, 0.77, 0.8), 0.9, 0.2)
	var root := Node3D.new()
	root.name = "Weapon_" + model
	var muzzle := Vector3(0, 0, 0.5)
	match model:
		"pistol":
			_box(root, metal, Vector3(0.09, 0.12, 0.38), Vector3(0, 0.04, 0.12))
			_box(root, dark, Vector3(0.08, 0.2, 0.1), Vector3(0, -0.1, 0.0), Vector3(deg_to_rad(15), 0, 0))
			muzzle = Vector3(0, 0.06, 0.32)
		"smg":
			_box(root, metal, Vector3(0.1, 0.14, 0.5), Vector3(0, 0.04, 0.15))
			_box(root, dark, Vector3(0.06, 0.26, 0.08), Vector3(0, -0.14, 0.18))
			_box(root, dark, Vector3(0.08, 0.16, 0.1), Vector3(0, -0.08, -0.02))
			muzzle = Vector3(0, 0.06, 0.42)
		"rifle":
			_box(root, metal, Vector3(0.1, 0.14, 0.85), Vector3(0, 0.04, 0.25))
			_box(root, dark, Vector3(0.07, 0.24, 0.1), Vector3(0, -0.14, 0.3), Vector3(deg_to_rad(-10), 0, 0))
			_box(root, wood, Vector3(0.09, 0.16, 0.32), Vector3(0, -0.02, -0.28))
			muzzle = Vector3(0, 0.06, 0.7)
		"shotgun":
			_cyl(root, metal, 0.045, 0.85, Vector3(-0.04, 0.06, 0.35))
			_cyl(root, metal, 0.045, 0.85, Vector3(0.04, 0.06, 0.35))
			_box(root, wood, Vector3(0.1, 0.16, 0.4), Vector3(0, -0.02, -0.22))
			muzzle = Vector3(0, 0.06, 0.78)
		"sniper":
			_cyl(root, metal, 0.035, 1.25, Vector3(0, 0.05, 0.5))
			_box(root, wood, Vector3(0.1, 0.16, 0.6), Vector3(0, -0.02, -0.1))
			_cyl(root, dark, 0.05, 0.35, Vector3(0, 0.17, 0.12))
			muzzle = Vector3(0, 0.05, 1.12)
		"minigun":
			for i in 6:
				var a := i * TAU / 6.0
				_cyl(root, metal, 0.025, 0.9, Vector3(cos(a) * 0.08, 0.04 + sin(a) * 0.08, 0.4))
			_box(root, dark, Vector3(0.24, 0.24, 0.36), Vector3(0, 0.04, -0.12))
			muzzle = Vector3(0, 0.04, 0.86)
		"dagger":
			_box(root, dark, Vector3(0.05, 0.05, 0.14), Vector3(0, 0, -0.02))
			_box(root, steel, Vector3(0.03, 0.08, 0.32), Vector3(0, 0, 0.2))
		"sword":
			_box(root, dark, Vector3(0.05, 0.05, 0.2), Vector3(0, 0, -0.05))
			_box(root, steel, Vector3(0.24, 0.05, 0.05), Vector3(0, 0, 0.06))
			_box(root, steel, Vector3(0.04, 0.1, 1.1), Vector3(0, 0, 0.63))
		"axe":
			_box(root, wood, Vector3(0.06, 0.06, 1.1), Vector3(0, 0, 0.4))
			_box(root, steel, Vector3(0.04, 0.42, 0.26), Vector3(0, 0.18, 0.85))
		"spear":
			_box(root, wood, Vector3(0.05, 0.05, 2.0), Vector3(0, 0, 0.7))
			_box(root, steel, Vector3(0.03, 0.12, 0.3), Vector3(0, 0, 1.82))
		"hammer":
			_box(root, wood, Vector3(0.07, 0.07, 1.2), Vector3(0, 0, 0.45))
			_box(root, metal, Vector3(0.3, 0.3, 0.42), Vector3(0, 0, 1.08))
	root.set_meta("muzzle", muzzle)
	return root


static func _mat(c: Color, metallic: float, rough: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.metallic = metallic
	m.roughness = rough
	return m


static func _box(parent: Node3D, mat: Material, size: Vector3, pos: Vector3, rot := Vector3.ZERO) -> void:
	var mi := MeshInstance3D.new()
	var m := BoxMesh.new()
	m.size = size
	mi.mesh = m
	mi.material_override = mat
	mi.position = pos
	mi.rotation = rot
	parent.add_child(mi)


## Cylinder lying along Z.
static func _cyl(parent: Node3D, mat: Material, r: float, length: float, pos: Vector3) -> void:
	var mi := MeshInstance3D.new()
	var m := CylinderMesh.new()
	m.top_radius = r
	m.bottom_radius = r
	m.height = length
	m.radial_segments = 12
	mi.mesh = m
	mi.material_override = mat
	mi.position = pos
	mi.rotation = Vector3(PI / 2.0, 0, 0)
	parent.add_child(mi)
