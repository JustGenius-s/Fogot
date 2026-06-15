/**************************************************************************/
/* ai_shared_utils.h                                                      */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#pragma once

#include "core/doc_data.h"
#include "core/math/transform_2d.h"
#include "core/variant/dictionary.h"
#include "core/variant/variant.h"
#include "core/string/ustring.h"

class Bone2D;
class Node;

/// Shared utilities for AI tool implementations.

/// Ensure a project path starts with "res://". Modifies the string in-place.
void normalize_project_path(String &p_path);

/// Convert a Variant to a JSON-safe representation.
/// Basic types (int, float, bool, string) are used directly.
/// Complex types (Vector2, Color, etc.) are converted to Dict or string form.
Variant variant_to_json(const Variant &p_val);

/// List all editable properties of a node as a JSON-compatible Dictionary.
Dictionary list_node_properties(Node *p_node);

/// Recursively build a node tree as a Dictionary with name, type, path, index, children.
Dictionary build_node_tree(Node *p_node);

/// Resolve a Node pointer from a path relative to the edited scene root.
/// Returns nullptr and sets r_error if not found.
Node *resolve_node(const String &p_path, String *r_error);

/// Strip Godot BBCode tags ([b], [code], [param], etc.) to plain text.
String strip_bbcode(const String &p_text);

/// Format a DocData::MethodDoc as a compact one-liner, e.g.
/// "void move_and_slide()" or "Vector2 get_position() const".
String format_method_sig(const DocData::MethodDoc &p_method);

/// Map a lowercase file extension to its MIME type.
/// Returns empty string if the extension is not a recognized image format.
String ext_to_mime_type(const String &p_ext);

/// Check whether a lowercase file extension is a text-based format
/// (as opposed to binary). Used by search_files to skip binary files.
bool is_text_extension(const String &p_ext);

/// Collect all nodes in a scene tree as a flat Array of Dictionaries.
/// Each entry has: path, type, hasScript.
void collect_nodes_flat(Node *p_node, Node *p_root, Array &r_out);

/// Recursively scan a project directory for files with the given extension.
/// Results are appended to r_out as Dictionaries with: path, name.
void scan_project_files(const String &p_dir, const String &p_ext, Array &r_out, int p_depth = 0);

/// Recursively scan a project directory for subdirectories.
/// Results are appended to r_out as Dictionaries with: path, name.
void scan_project_folders(const String &p_dir, Array &r_out, int p_depth = 0);

/// Parse a JSON Dictionary into a Transform2D (columns layout).
Transform2D parse_transform2d(const Dictionary &p_dict);

/// Convert a Transform2D to a JSON-safe Dictionary (columns layout).
Dictionary transform2d_to_dict(const Transform2D &p_t);

/// Convert a Bone2D node to a JSON-safe Dictionary with all relevant properties.
Dictionary bone2d_to_dict(Bone2D *p_bone);

/// Coerce a JSON-parsed Variant into the type expected by a node property.
/// JSON has no native Vector2/Color/packed-array/resource types, so the chat
/// agent encodes them as dictionaries, arrays and "res://" path strings. This
/// converts those shapes into the concrete Godot types (Vector2, Vector3,
/// Color, PackedVector2Array, PackedInt32Array, PackedFloat32Array,
/// PackedColorArray, loaded resources). Returns the value unchanged when it
/// already matches the target or no rule applies.
Variant coerce_json_to_type(const Variant &p_value, Variant::Type p_target);

/// Call a method on an Object using a JSON-encoded argument array.
/// Parses args_json as a JSON Array, coerces each element to the method's
/// parameter types via coerce_json_to_type, and calls the method.
/// On success returns OK and writes the return value to r_ret.
/// On failure returns an error string (never empty).
String call_method_from_json(Object *p_obj, const String &p_method, const String &p_args_json, Variant *r_ret = nullptr);

/// Recursively set the owner of p_node and all its descendants to p_owner.
/// Useful after adding a subtree to ensure it serializes with the scene.
void set_owner_recursive(Node *p_node, Node *p_owner);
