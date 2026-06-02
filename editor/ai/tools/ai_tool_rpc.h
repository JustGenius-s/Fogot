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

} // namespace AIToolRPC
