/**************************************************************************/
/* ai_tool_move_file.cpp                                                  */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"

#include "core/io/dir_access.h"
#include "core/io/file_access.h"
#include "editor/file_system/editor_file_system.h"

String AIToolRPC::move_file(const Dictionary &p_args) {
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
	if (!FileAccess::exists(source) && !DirAccess::dir_exists_absolute(source)) {
		return "Error: Source not found: " + source;
	}

	Ref<DirAccess> da = DirAccess::create(DirAccess::ACCESS_RESOURCES);
	if (da.is_null()) {
		return "Error: Cannot access project directory.";
	}

	bool dest_exists = da->file_exists(destination) || da->dir_exists(destination);
	if (dest_exists) {
		return "Error: Destination already exists: " + destination;
	}

	// Ensure destination directory exists.
	String dest_dir = destination.get_base_dir();
	if (!DirAccess::dir_exists_absolute(dest_dir)) {
		Error err = EditorFileSystem::get_singleton()->make_dir_recursive(dest_dir);
		if (err != OK && err != ERR_ALREADY_EXISTS) {
			return "Error: Cannot create destination directory: " + dest_dir;
		}
	}

	Error err = da->rename(source, destination);
	if (err != OK) {
		return "Error: Failed to move from " + source + " to " + destination;
	}

	// Move accompanying .import and .uid files (same as FileSystemDock).
	if (FileAccess::exists(source + ".import")) {
		da->rename(source + ".import", destination + ".import");
	}
	if (FileAccess::exists(source + ".uid")) {
		da->rename(source + ".uid", destination + ".uid");
	}

	// Notify the editor file system to rescan.
	EditorFileSystem::get_singleton()->scan_changes();

	return "Moved: " + source + " → " + destination;
}
