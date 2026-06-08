/**************************************************************************/
/* ai_tool_rpc.h                                                          */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#pragma once

#include "core/variant/dictionary.h"

namespace AIToolRPC {

/// Read a file from the project. Supports text and binary (base64) modes.
String read_file(const Dictionary &p_args);

/// Write content to a file. Supports text and binary (base64 decode) modes.
String write_file(const Dictionary &p_args);

/// Edit a file by replacing a unique string occurrence with new content.
String edit_file(const Dictionary &p_args);

/// List files/directories under a project path. Supports recursive listing.
String list_files(const Dictionary &p_args);

/// List image assets under a project directory, returning structured JSON
/// (path, name, size, ext) for use by the asset manager UI.
String list_assets(const Dictionary &p_args);

/// Delete a file or empty directory from the project.
String delete_file(const Dictionary &p_args);

/// Copy a file to a new location.
String copy_file(const Dictionary &p_args);

/// Move (rename) a file to a new location.
String move_file(const Dictionary &p_args);

/// Search for text content within project files (grep-like).
String search_files(const Dictionary &p_args);

/// Execute a shell command in the project directory. Synchronous with timeout.
String execute_command(const Dictionary &p_args);

/// Query built-in Godot class documentation (ClassDB / EditorHelp).
/// Supports listing all classes, brief overviews, and full API details.
String get_class_docs(const Dictionary &p_args);

/// List the current scene node tree as JSON.
/// Args: path (optional) — subtree root, defaults to scene root.
String scene_list_nodes(const Dictionary &p_args);

/// Get detailed info about a node (properties, groups, signals, script).
/// Args: path — node path relative to scene root.
String scene_get_node(const Dictionary &p_args);

/// Create a new node in the scene (undoable).
/// Args: parent_path, node_type (class name), node_name.
String scene_create_node(const Dictionary &p_args);

/// Delete a node from the scene (undoable).
/// Args: path — node path relative to scene root.
String scene_delete_node(const Dictionary &p_args);

/// Set a property on a node (undoable).
/// Args: path, property (name), value (JSON-encoded).
String scene_set_property(const Dictionary &p_args);

/// Reparent a node to a different parent (undoable).
/// Args: path, new_parent_path.
String scene_reparent_node(const Dictionary &p_args);

/// Move a node within its parent's child order.
/// Args: path, to_position (int index).
String scene_move_child(const Dictionary &p_args);

/// Get class docs for a scene node (convenience, auto-detects class).
/// Args: path — node path relative to scene root.
String scene_get_class_docs(const Dictionary &p_args);

/// Run a scene (starts a new game process, or re-runs the current scene).
/// Args: scene_path (optional) — path to the .tscn/.scn file. Defaults to the currently open scene.
String scene_run(const Dictionary &p_args);

/// Request a screenshot of the currently running scene.
/// Args: output_path (optional) — where to save the PNG. Defaults to a temp path.
/// NOTE: This tool is async — the result is sent when the game responds.
String scene_screenshot(const Dictionary &p_args);

/// Read an image file and return base64 + dimensions for the AI to "see" it.
/// Args: path — res:// path to the image file.
/// Returns JSON: {"type":"image","path":"...","mimeType":"image/png","width":W,"height":H,"base64":"..."}
String read_image(const Dictionary &p_args);


/// Return a flat list of scene nodes, scene files, and script files
/// for the @ mention autocomplete popover.
/// Args: none.
/// Returns JSON: { nodes: [{path,type,hasScript}], scenes: [{path,name}], scripts: [{path,name}] }
String mention_suggestions(const Dictionary &p_args);

/// Skeleton2D tools — direct scene content editing in the 2D skeleton tree.

/// Get Skeleton2D bone hierarchy, rest poses, and current transform.
/// Args: path (node path to Skeleton2D).
/// Returns JSON: bone_count, bones[] with name, rest, skeleton_rest,
///         global_position, global_rotation, global_scale, length, bone_angle.
String scene_get_skeleton2d_data(const Dictionary &p_args);

/// Set rest transform on a Bone2D (undoable).
/// Args: path (node path to Bone2D),
///       rest (JSON Transform2D: {x:{x,y}, y:{x,y}, origin:{x,y}}).
String scene_set_bone2d_rest(const Dictionary &p_args);

} // namespace AIToolRPC
