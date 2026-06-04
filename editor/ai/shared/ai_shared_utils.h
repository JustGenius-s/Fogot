/**************************************************************************/
/* ai_shared_utils.h                                                      */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#pragma once

#include "core/doc_data.h"
#include "core/variant/dictionary.h"
#include "core/variant/variant.h"
#include "core/string/ustring.h"

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
