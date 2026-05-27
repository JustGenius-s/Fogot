/**************************************************************************/
/* ai_tool_copy_file.cpp                                                  */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"

#include "core/io/dir_access.h"
#include "core/io/file_access.h"
#include "editor/file_system/editor_file_system.h"

String AIToolRPC::copy_file(const Dictionary &p_args) {
	String source = p_args.get("source", "");
	String destination = p_args.get("destination", "");

	if (source.is_empty() || destination.is_empty()) {
		return "Error: 'source' and 'destination' arguments are required.";
	}
	if (!source.begins_with("res://")) {
		source = "res://" + source;
	}
	if (!destination.begins_with("res://")) {
		destination = "res://" + destination;
	}

	bool src_is_dir = DirAccess::dir_exists_absolute(source);
	bool src_is_file = FileAccess::exists(source);

	if (!src_is_dir && !src_is_file) {
		return "Error: Source not found: " + source;
	}

	// Ensure destination parent directory exists.
	String dest_dir = destination.get_base_dir();
	if (!DirAccess::dir_exists_absolute(dest_dir)) {
		Error err = EditorFileSystem::get_singleton()->make_dir_recursive(dest_dir);
		if (err != OK && err != ERR_ALREADY_EXISTS) {
			return "Error: Cannot create destination directory: " + dest_dir;
		}
	}

	Error err;
	if (src_is_dir) {
		err = EditorFileSystem::get_singleton()->copy_directory(source, destination);
	} else {
		err = EditorFileSystem::get_singleton()->copy_file(source, destination);
	}

	if (err != OK) {
		return "Error: Failed to copy from " + source + " to " + destination;
	}

	return "Copied: " + source + " → " + destination;
}
