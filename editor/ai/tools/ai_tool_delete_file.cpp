/**************************************************************************/
/* ai_tool_delete_file.cpp                                                */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"

#include "core/io/dir_access.h"
#include "core/io/file_access.h"
#include "core/os/os.h"
#include "editor/file_system/editor_file_system.h"

String AIToolRPC::delete_file(const Dictionary &p_args) {
	String path = p_args.get("path", "");

	if (path.is_empty()) {
		return "Error: 'path' argument is required.";
	}
	if (!path.begins_with("res://")) {
		path = "res://" + path;
	}

	bool is_dir = DirAccess::dir_exists_absolute(path);
	bool is_file = FileAccess::exists(path);

	if (!is_dir && !is_file) {
		return "Error: File or directory not found: " + path;
	}

	// Use OS::move_to_trash, same as the editor's file system dock.
	String abs_path = OS::get_singleton()->get_resource_dir() +
			path.replace_first("res://", "/");
	Error err = OS::get_singleton()->move_to_trash(abs_path);
	if (err != OK) {
		return "Error: Failed to delete: " + path;
	}

	// Notify the editor file system.
	if (is_file) {
		EditorFileSystem::get_singleton()->update_file(path);
	} else {
		// Force the parent directory to rescan so that the deleted subdirectory
		// is detected even when the mtime comparison misses the change.
		String parent_path = path.trim_suffix("/").get_base_dir();
		EditorFileSystemDirectory *parent_dir = EditorFileSystem::get_singleton()->get_filesystem_path(parent_path);
		if (parent_dir) {
			parent_dir->force_update();
		}
		EditorFileSystem::get_singleton()->scan_changes();
	}

	return "Deleted: " + path;
}
