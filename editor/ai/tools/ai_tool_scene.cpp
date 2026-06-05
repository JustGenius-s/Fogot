/**************************************************************************/
/* ai_tool_scene.cpp                                                      */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"
#include "../shared/ai_shared_utils.h"

#include "core/io/file_access.h"
#include "core/io/json.h"
#include "core/object/class_db.h"
#include "editor/doc/editor_help.h"
#include "editor/editor_interface.h"
#include "editor/editor_undo_redo_manager.h"

// --- scene_list_nodes ---

String AIToolRPC::scene_list_nodes(const Dictionary &p_args) {
	Node *root = EditorInterface::get_singleton()->get_edited_scene_root();
	if (!root) {
		return "Error: No scene is currently open.";
	}

	String path = p_args.get("path", ".");
	Node *subtree = root;
	if (path != "." && !path.is_empty()) {
		subtree = root->get_node_or_null(NodePath(path));
		if (!subtree) {
			return "Error: Node not found at path '" + path + "'.";
		}
	}

	Dictionary result = build_node_tree(subtree);
	result["scene_path"] = root->get_scene_file_path();
	return JSON::stringify(result);
}

// --- scene_get_node ---

String AIToolRPC::scene_get_node(const Dictionary &p_args) {
	String path = p_args.get("path", "");
	String error;
	Node *node = resolve_node(path, &error);
	if (!node) {
		return error;
	}

	Dictionary result;
	result["path"] = path == "." ? String(".") : String(node->get_path()).trim_prefix("./");
	result["name"] = node->get_name();
	result["type"] = node->get_class();

	// Properties.
	result["properties"] = list_node_properties(node);

	// Groups.
	Array groups;
	List<Node::GroupInfo> group_list;
	node->get_groups(&group_list);
	for (const Node::GroupInfo &gi : group_list) {
		groups.push_back(gi.name);
	}
	result["groups"] = groups;

	// Signals.
	Array signals;
	List<MethodInfo> signal_list;
	node->get_signal_list(&signal_list);
	for (const MethodInfo &mi : signal_list) {
		signals.push_back(mi.name);
	}
	result["signals"] = signals;

	// Attached script.
	Ref<Script> script = node->get_script();
	if (script.is_valid() && !script->get_path().is_empty()) {
		result["script"] = script->get_path();
	}

	return JSON::stringify(result);
}

// --- scene_create_node ---

String AIToolRPC::scene_create_node(const Dictionary &p_args) {
	String parent_path = p_args.get("parent_path", ".");
	String node_type = p_args.get("node_type", "");
	String node_name = p_args.get("node_name", "");

	if (node_type.is_empty()) {
		return "Error: 'node_type' is required.";
	}
	if (node_name.is_empty()) {
		return "Error: 'node_name' is required.";
	}

	// Validate the class exists.
	if (!ClassDB::class_exists(node_type)) {
		return "Error: Unknown class '" + node_type + "'.";
	}
	if (!ClassDB::is_parent_class(node_type, "Node")) {
		return "Error: '" + node_type + "' is not a Node-derived class.";
	}

	String error;
	Node *parent = resolve_node(parent_path, &error);
	if (!parent) {
		return error;
	}

	// Check for duplicate name.
	if (parent->has_node(NodePath(node_name))) {
		return "Error: Node '" + node_name + "' already exists under '" + parent_path + "'.";
	}

	Object *obj = ClassDB::instantiate(node_type);
	Node *new_node = Object::cast_to<Node>(obj);
	if (!new_node) {
		return "Error: Failed to instantiate '" + node_type + "'.";
	}

	new_node->set_name(node_name);

	EditorUndoRedoManager *undo = EditorUndoRedoManager::get_singleton();
	undo->create_action("Create " + node_type + " '" + node_name + "'");
	undo->add_do_method(parent, "add_child", new_node);
	undo->add_do_reference(new_node);
	undo->add_undo_method(parent, "remove_child", new_node);
	undo->commit_action();

	// Ensure the node is owned by the scene.
	Node *scene_root = EditorInterface::get_singleton()->get_edited_scene_root();
	if (scene_root) {
		new_node->set_owner(scene_root);
	}

	return "OK: Created " + node_type + " at " + String(new_node->get_path()).trim_prefix("./");
}

// --- scene_delete_node ---

String AIToolRPC::scene_delete_node(const Dictionary &p_args) {
	String path = p_args.get("path", "");
	String error;
	Node *node = resolve_node(path, &error);
	if (!node) {
		return error;
	}

	Node *parent = node->get_parent();
	if (!parent) {
		return "Error: Cannot delete the scene root node.";
	}

	String node_path_str = String(node->get_path()).trim_prefix("./");

	EditorUndoRedoManager *undo = EditorUndoRedoManager::get_singleton();
	undo->create_action("Delete node " + node_path_str);
	undo->add_do_method(parent, "remove_child", node);
	undo->add_undo_method(parent, "add_child", node);
	undo->add_undo_reference(node);
	undo->commit_action();

	return "OK: Deleted " + node_path_str;
}

// --- scene_set_property ---

String AIToolRPC::scene_set_property(const Dictionary &p_args) {
	String path = p_args.get("path", "");
	String property = p_args.get("property", "");
	String value_json = p_args.get("value", "");

	if (property.is_empty()) {
		return "Error: 'property' is required.";
	}
	if (value_json.is_empty()) {
		return "Error: 'value' is required.";
	}

	String error;
	Node *node = resolve_node(path, &error);
	if (!node) {
		return error;
	}

	Variant parsed = JSON::parse_string(value_json);
	if (parsed.get_type() == Variant::NIL && value_json != "null") {
		return "Error: Failed to parse value JSON: " + value_json;
	}

	Variant old_value = node->get(property);

	// Try to coerce the value to match the property type.
	List<PropertyInfo> props;
	node->get_property_list(&props);
	for (const PropertyInfo &pi : props) {
		if (pi.name == property) {
			Variant::Type target_type = pi.type;
			if (target_type != Variant::NIL && target_type != parsed.get_type()) {
				// Attempt explicit construction for common types.
				if (target_type == Variant::VECTOR2 && parsed.get_type() == Variant::DICTIONARY) {
					Dictionary d = parsed;
					parsed = Vector2(float(d.get("x", 0)), float(d.get("y", 0)));
				} else if (target_type == Variant::VECTOR3 && parsed.get_type() == Variant::DICTIONARY) {
					Dictionary d = parsed;
					parsed = Vector3(float(d.get("x", 0)), float(d.get("y", 0)), float(d.get("z", 0)));
				} else if (target_type == Variant::COLOR && parsed.get_type() == Variant::DICTIONARY) {
					Dictionary d = parsed;
					parsed = Color(float(d.get("r", 1)), float(d.get("g", 1)), float(d.get("b", 1)), float(d.get("a", 1)));
				}
			}
			break;
		}
	}

	EditorUndoRedoManager *undo = EditorUndoRedoManager::get_singleton();
	undo->create_action("Set " + property + " on " + path);
	undo->add_do_property(node, property, parsed);
	undo->add_undo_property(node, property, old_value);
	undo->commit_action();

	return "OK: Set " + path + "." + property + " = " + String(parsed);
}

// --- scene_reparent_node ---

String AIToolRPC::scene_reparent_node(const Dictionary &p_args) {
	String path = p_args.get("path", "");
	String new_parent_path = p_args.get("new_parent_path", "");

	String error;
	Node *node = resolve_node(path, &error);
	if (!node) {
		return error;
	}
	Node *new_parent = resolve_node(new_parent_path, &error);
	if (!new_parent) {
		return error;
	}

	Node *old_parent = node->get_parent();
	if (!old_parent) {
		return "Error: Cannot reparent the scene root.";
	}
	if (old_parent == new_parent) {
		return "Error: Node is already a child of '" + new_parent_path + "'.";
	}

	// Check for name collision in new parent.
	if (new_parent->has_node(NodePath(node->get_name()))) {
		return "Error: New parent already has a child named '" + node->get_name() + "'.";
	}

	EditorUndoRedoManager *undo = EditorUndoRedoManager::get_singleton();
	undo->create_action("Reparent " + path + " to " + new_parent_path);
	undo->add_do_method(old_parent, "remove_child", node);
	undo->add_do_method(new_parent, "add_child", node);
	undo->add_undo_method(new_parent, "remove_child", node);
	undo->add_undo_method(old_parent, "add_child", node);
	undo->commit_action();

	return "OK: Reparented " + path + " to " + new_parent_path;
}

// --- scene_move_child ---

String AIToolRPC::scene_move_child(const Dictionary &p_args) {
	String path = p_args.get("path", "");
	int to_position = p_args.get("to_position", -1);

	if (to_position < 0) {
		return "Error: 'to_position' must be a non-negative integer.";
	}

	String error;
	Node *node = resolve_node(path, &error);
	if (!node) {
		return error;
	}

	Node *parent = node->get_parent();
	if (!parent) {
		return "Error: Cannot move the scene root.";
	}

	int current_index = node->get_index();
	if (current_index == to_position) {
		return "OK: Node is already at position " + itos(to_position) + ".";
	}

	int child_count = parent->get_child_count();
	if (to_position >= child_count) {
		to_position = child_count - 1;
	}

	EditorUndoRedoManager *undo = EditorUndoRedoManager::get_singleton();
	undo->create_action("Move " + path + " to index " + itos(to_position));
	undo->add_do_method(parent, "move_child", node, to_position);
	undo->add_undo_method(parent, "move_child", node, current_index);
	undo->commit_action();

	return "OK: Moved " + path + " to index " + itos(to_position);
}

// --- scene_get_class_docs ---

String AIToolRPC::scene_get_class_docs(const Dictionary &p_args) {
	String path = p_args.get("path", "");

	String error;
	Node *node = resolve_node(path, &error);
	if (!node) {
		return error;
	}

	String class_name = node->get_class();

	DocTools *doc_data = EditorHelp::get_doc_data();
	if (!doc_data) {
		return "Error: Documentation not yet loaded.";
	}
	if (!doc_data->class_list.has(class_name)) {
		return "Error: No documentation found for '" + class_name + "'.";
	}

	const DocData::ClassDoc &cls = doc_data->class_list[class_name];

	Dictionary result;
	result["class"] = cls.name;
	if (!cls.inherits.is_empty()) {
		result["inherits"] = cls.inherits;
	}
	if (!cls.brief_description.is_empty()) {
		result["brief"] = cls.brief_description;
	}

	// Properties (name + type only for compactness).
	Array props;
	for (const DocData::PropertyDoc &p : cls.properties) {
		Dictionary pd;
		pd["name"] = p.name;
		pd["type"] = p.type;
		if (!p.default_value.is_empty()) {
			pd["default"] = p.default_value;
		}
		props.push_back(pd);
	}
	result["properties"] = props;

	// Methods (signatures only).
	Array methods;
	for (const DocData::MethodDoc &m : cls.methods) {
		String sig;
		if (!m.return_type.is_empty()) {
			sig = m.return_type + " ";
		}
		sig += m.name + "(";
		for (int i = 0; i < m.arguments.size(); i++) {
			if (i > 0) {
				sig += ", ";
			}
			sig += m.arguments[i].type + " " + m.arguments[i].name;
			if (!m.arguments[i].default_value.is_empty()) {
				sig += " = " + m.arguments[i].default_value;
			}
		}
		sig += ")";
		methods.push_back(sig);
	}
	result["methods"] = methods;

	// Signals.
	Array signals;
	for (const DocData::MethodDoc &s : cls.signals) {
		String sig;
		sig += s.name + "(";
		for (int i = 0; i < s.arguments.size(); i++) {
			if (i > 0) {
				sig += ", ";
			}
			sig += s.arguments[i].type + " " + s.arguments[i].name;
		}
		sig += ")";
		signals.push_back(sig);
	}
	result["signals"] = signals;

	return JSON::stringify(result);
}

// --- scene_run ---

String AIToolRPC::scene_run(const Dictionary &p_args) {
	String scene_path = p_args.get("scene_path", "");

	EditorInterface *ei = EditorInterface::get_singleton();

	if (scene_path.is_empty()) {
		Node *root = ei->get_edited_scene_root();
		if (!root) {
			return "Error: No scene is currently open.";
		}
		if (root->get_scene_file_path().is_empty()) {
			return "Error: Current scene has not been saved yet. Save the scene first.";
		}
		scene_path = root->get_scene_file_path();
	}

	if (!FileAccess::exists(scene_path)) {
		return "Error: Scene file not found at '" + scene_path + "'.";
	}

	bool was_running = ei->is_playing_scene();
	String old_scene = ei->get_playing_scene();

	ei->play_custom_scene(scene_path);

	Dictionary result;
	result["action"] = was_running && old_scene == scene_path ? "reloaded" : "started";
	result["scene_path"] = scene_path;
	return JSON::stringify(result);
}

// --- scene_screenshot ---

String AIToolRPC::scene_screenshot(const Dictionary &p_args) {
	EditorInterface *ei = EditorInterface::get_singleton();
	if (!ei->is_playing_scene()) {
		return "Error: No scene is currently running. Start a scene with run_scene first.";
	}

	// The actual async screenshot request is handled in AIChatDock.
	// This function just validates the preconditions.
	return "OK";
}
