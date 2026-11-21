extends RefCounted
## Chess pieces built from primitive meshes (placeholder art). Each piece
## faces +Z (the knight's snout points +Z). Sizes are in metres; a board
## square is 2 m.

const HEIGHT := {"P": 1.5, "R": 1.75, "N": 1.9, "B": 2.1, "Q": 2.25, "K": 2.55}


static func height_of(type: String) -> float:
	return HEIGHT.get(type, 1.8)


static func build(type: String, mat: Material) -> Node3D:
	var root := Node3D.new()
	root.name = "Piece_" + type
	# Shared base and collar
	_add(root, _cyl(0.5, 0.62, 0.22), mat, Vector3(0, 0.11, 0))
	_add(root, _cyl(0.42, 0.5, 0.12), mat, Vector3(0, 0.28, 0))
	match type:
		"P":
			_add(root, _cyl(0.2, 0.38, 0.6), mat, Vector3(0, 0.64, 0))
			_add(root, _cyl(0.3, 0.3, 0.08), mat, Vector3(0, 0.96, 0))
			_add(root, _sphere(0.3), mat, Vector3(0, 1.18, 0))
		"R":
			_add(root, _cyl(0.36, 0.44, 0.95), mat, Vector3(0, 0.8, 0))
			_add(root, _cyl(0.48, 0.42, 0.25), mat, Vector3(0, 1.4, 0))
			for i in 4:
				var a := PI / 4.0 + i * PI / 2.0
				_add(root, _box(Vector3(0.22, 0.22, 0.22)), mat, Vector3(cos(a) * 0.32, 1.63, sin(a) * 0.32), Vector3(0, -a, 0))
		"N":
			_add(root, _cyl(0.3, 0.42, 0.55), mat, Vector3(0, 0.62, 0))
			_add(root, _box(Vector3(0.42, 0.8, 0.5)), mat, Vector3(0, 1.18, -0.08), Vector3(deg_to_rad(-18), 0, 0))
			_add(root, _box(Vector3(0.4, 0.36, 0.78)), mat, Vector3(0, 1.5, 0.16), Vector3(deg_to_rad(14), 0, 0))
			_add(root, _box(Vector3(0.1, 0.22, 0.1)), mat, Vector3(0.12, 1.78, -0.12))
			_add(root, _box(Vector3(0.1, 0.22, 0.1)), mat, Vector3(-0.12, 1.78, -0.12))
			_add(root, _box(Vector3(0.12, 0.7, 0.16)), mat, Vector3(0, 1.3, -0.36), Vector3(deg_to_rad(-18), 0, 0))
		"B":
			_add(root, _cyl(0.2, 0.4, 0.9), mat, Vector3(0, 0.79, 0))
			_add(root, _cyl(0.3, 0.3, 0.08), mat, Vector3(0, 1.26, 0))
			var mitre := _add(root, _sphere(0.28), mat, Vector3(0, 1.6, 0))
			mitre.scale = Vector3(1, 1.45, 1)
			_add(root, _sphere(0.08), mat, Vector3(0, 2.03, 0))
		"Q":
			_add(root, _cyl(0.22, 0.44, 1.15), mat, Vector3(0, 0.92, 0))
			_add(root, _cyl(0.34, 0.34, 0.08), mat, Vector3(0, 1.52, 0))
			_add(root, _sphere(0.3), mat, Vector3(0, 1.78, 0))
			var crown := TorusMesh.new()
			crown.inner_radius = 0.2
			crown.outer_radius = 0.32
			_add(root, crown, mat, Vector3(0, 1.98, 0))
			for i in 6:
				var a := i * TAU / 6.0
				_add(root, _sphere(0.06), mat, Vector3(cos(a) * 0.27, 2.06, sin(a) * 0.27))
			_add(root, _sphere(0.09), mat, Vector3(0, 2.14, 0))
		"K":
			_add(root, _cyl(0.24, 0.46, 1.3), mat, Vector3(0, 1.0, 0))
			_add(root, _cyl(0.36, 0.36, 0.1), mat, Vector3(0, 1.68, 0))
			_add(root, _cyl(0.34, 0.26, 0.42), mat, Vector3(0, 1.94, 0))
			_add(root, _box(Vector3(0.1, 0.4, 0.1)), mat, Vector3(0, 2.36, 0))
			_add(root, _box(Vector3(0.3, 0.1, 0.1)), mat, Vector3(0, 2.38, 0))
	return root


static func _add(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation = rot
	parent.add_child(mi)
	return mi


static func _cyl(top: float, bottom: float, h: float) -> CylinderMesh:
	var m := CylinderMesh.new()
	m.top_radius = top
	m.bottom_radius = bottom
	m.height = h
	m.radial_segments = 24
	return m


static func _sphere(r: float) -> SphereMesh:
	var m := SphereMesh.new()
	m.radius = r
	m.height = r * 2.0
	m.radial_segments = 20
	m.rings = 10
	return m


static func _box(size: Vector3) -> BoxMesh:
	var m := BoxMesh.new()
	m.size = size
	return m
