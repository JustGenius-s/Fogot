/**************************************************************************/
/* ai_tool_edit_file.cpp                                                  */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"

#include "core/io/file_access.h"
#include "editor/file_system/editor_file_system.h"

String AIToolRPC::edit_file(const Dictionary &p_args) {
	String path = p_args.get("path", "");
	String old_string = p_args.get("old_string", "");
	String new_string = p_args.get("new_string", "");

	if (path.is_empty()) {
		return "Error: 'path' argument is required.";
	}
	if (old_string.is_empty()) {
		return "Error: 'old_string' argument is required.";
	}
	if (!path.begins_with("res://")) {
		path = "res://" + path;
	}

	Ref<FileAccess> f = FileAccess::open(path, FileAccess::READ);
	if (f.is_null()) {
		return "Error: Cannot read file: " + path;
	}
	String content = f->get_as_text();
	f.unref();

	int pos = content.find(old_string);
	if (pos == -1) {
		return "Error: 'old_string' not found in " + path;
	}

	// Ensure uniqueness — reject ambiguous edits.
	int second = content.find(old_string, pos + old_string.length());
	if (second != -1) {
		return "Error: 'old_string' matches multiple locations in " + path + ". Provide more context to make it unique.";
	}

	content = content.substr(0, pos) + new_string + content.substr(pos + old_string.length());

	f = FileAccess::open(path, FileAccess::WRITE);
	if (f.is_null()) {
		return "Error: Cannot write to file: " + path;
	}
	f->store_string(content);
	f.unref();

	EditorFileSystem::get_singleton()->update_file(path);
	return "Successfully edited " + path;
}
