/**************************************************************************/
/* ai_shared_utils.cpp                                                    */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_shared_utils.h"

#include "core/variant/dictionary.h"
#include "editor/editor_interface.h"
#include "scene/main/node.h"
#include "scene/main/scene_tree.h"
#include "scene/main/scene_tree.h"


void normalize_project_path(String &p_path) {
	if (!p_path.begins_with("res://") && !p_path.is_absolute_path()) {
		p_path = "res://" + p_path;
	}
}
String strip_bbcode(const String &p_text) {
	String out;
	int i = 0;
	while (i < p_text.length()) {
		if (p_text[i] == '[') {
			int close = p_text.find("]", i);
			if (close != -1) {
				String tag = p_text.substr(i + 1, close - i - 1);
				// Self-closing or content tags we want to skip the tag but keep content.
				// For [param X] style, extract X.
				if (tag.begins_with("param ")) {
					out += tag.substr(6);
				}
				i = close + 1;
				continue;
			}
		}
		out += p_text[i];
		i++;
	}
	return out;
}


String format_method_sig(const DocData::MethodDoc &p_method) {
	String sig;
	if (!p_method.return_type.is_empty()) {
		sig += p_method.return_type + " ";
	}
	sig += p_method.name + "(";
	for (int i = 0; i < p_method.arguments.size(); i++) {
		if (i > 0) {
			sig += ", ";
		}
		const DocData::ArgumentDoc &arg = p_method.arguments[i];
		sig += arg.type + " " + arg.name;
		if (!arg.default_value.is_empty()) {
			sig += " = " + arg.default_value;
		}
	}
	sig += ")";
	if (!p_method.qualifiers.is_empty()) {
		sig += " " + p_method.qualifiers;
	}
	return sig;
}



/// Build a JSON-safe representation of a Variant value.
/// Basic types are used directly; complex types are stringified.
Variant variant_to_json(const Variant &p_val) {
	switch (p_val.get_type()) {
		case Variant::NIL:
			return Variant();
		case Variant::BOOL:
		case Variant::INT:
		case Variant::FLOAT:
		case Variant::STRING:
		case Variant::STRING_NAME:
		case Variant::NODE_PATH:
			return p_val;
		case Variant::VECTOR2: {
			Vector2 v = p_val;
			Dictionary d;
			d["x"] = v.x;
			d["y"] = v.y;
			return d;
		}
		case Variant::VECTOR2I: {
			Vector2i v = p_val;
			Dictionary d;
			d["x"] = v.x;
			d["y"] = v.y;
			return d;
		}
		case Variant::VECTOR3: {
			Vector3 v = p_val;
			Dictionary d;
			d["x"] = v.x;
			d["y"] = v.y;
			d["z"] = v.z;
			return d;
		}
		case Variant::VECTOR3I: {
			Vector3i v = p_val;
			Dictionary d;
			d["x"] = v.x;
			d["y"] = v.y;
			d["z"] = v.z;
			return d;
		}
		case Variant::COLOR: {
			Color c = p_val;
			Dictionary d;
			d["r"] = c.r;
			d["g"] = c.g;
			d["b"] = c.b;
			d["a"] = c.a;
			return d;
		}
		case Variant::RECT2: {
			Rect2 r = p_val;
			Dictionary d;
			Dictionary pos;
			pos["x"] = r.position.x;
			pos["y"] = r.position.y;
			Dictionary size;
			size["x"] = r.size.x;
			size["y"] = r.size.y;
			d["position"] = pos;
			d["size"] = size;
			return d;
		}
		case Variant::RECT2I: {
			Rect2i r = p_val;
			Dictionary d;
			Dictionary pos;
			pos["x"] = r.position.x;
			pos["y"] = r.position.y;
			Dictionary size;
			size["x"] = r.size.x;
			size["y"] = r.size.y;
			d["position"] = pos;
			d["size"] = size;
			return d;
		}
		case Variant::TRANSFORM2D:
		case Variant::TRANSFORM3D:
		case Variant::BASIS:
		case Variant::QUATERNION:
		case Variant::PLANE:
		case Variant::AABB:
		case Variant::PROJECTION:
		case Variant::PACKED_BYTE_ARRAY:
		case Variant::PACKED_INT32_ARRAY:
		case Variant::PACKED_INT64_ARRAY:
		case Variant::PACKED_FLOAT32_ARRAY:
		case Variant::PACKED_FLOAT64_ARRAY:
		case Variant::PACKED_STRING_ARRAY:
		case Variant::PACKED_VECTOR2_ARRAY:
		case Variant::PACKED_VECTOR3_ARRAY:
		case Variant::PACKED_COLOR_ARRAY:
		case Variant::OBJECT: {
			Object *obj = p_val;
			if (obj) {
				Ref<Resource> res = Object::cast_to<Resource>(obj);
				if (res.is_valid() && !res->get_path().is_empty()) {
					return res->get_path();
				}
				return obj->get_class();
			}
			return Variant();
		}
		default:
			return String(p_val);
	}
}

/// List all editable properties of a node as a JSON-compatible Dictionary.
Dictionary list_node_properties(Node *p_node) {
	List<PropertyInfo> props;
	p_node->get_property_list(&props);

	Dictionary result;
	for (const PropertyInfo &pi : props) {
		// Skip internal, category, and group properties.
		if (pi.usage & PROPERTY_USAGE_INTERNAL) {
			continue;
		}
		if (pi.usage & PROPERTY_USAGE_CATEGORY) {
			continue;
		}
		if (pi.usage & PROPERTY_USAGE_GROUP) {
			continue;
		}
		// Skip non-editor properties to keep output focused.
		if (!(pi.usage & PROPERTY_USAGE_EDITOR)) {
			continue;
		}

		Variant val = p_node->get(pi.name);
		result[pi.name] = variant_to_json(val);
	}
	return result;
}

/// Recursively build the node tree JSON.
Dictionary build_node_tree(Node *p_node) {
	Dictionary d;
	d["name"] = p_node->get_name();
	d["type"] = p_node->get_class();
	d["path"] = p_node == p_node->get_tree()->get_edited_scene_root()
			? String(".")
			: String(p_node->get_path()).trim_prefix("./");

	// Index within parent.
	Node *parent = p_node->get_parent();
	if (parent) {
		d["index"] = p_node->get_index();
	} else {
		d["index"] = 0;
	}

	Array children;
	for (int i = 0; i < p_node->get_child_count(); i++) {
		children.push_back(build_node_tree(p_node->get_child(i)));
	}
	d["children"] = children;

	return d;
}

/// Resolve a node from a path relative to the edited scene root.
/// Returns nullptr and sets r_error if not found.
Node *resolve_node(const String &p_path, String *r_error) {
	Node *root = EditorInterface::get_singleton()->get_edited_scene_root();
	if (!root) {
		*r_error = "Error: No scene is currently open.";
		return nullptr;
	}
	if (p_path == "." || p_path.is_empty()) {
		return root;
	}
	Node *node = root->get_node_or_null(NodePath(p_path));
	if (!node) {
		*r_error = "Error: Node not found at path '" + p_path + "'.";
		return nullptr;
	}
	return node;
}
