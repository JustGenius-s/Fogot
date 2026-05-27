/**************************************************************************/
/* ai_tool_list_files.cpp                                                 */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"

#include "core/io/dir_access.h"

namespace {

const int MAX_ENTRIES = 500;

struct ListState {
	String output;
	int count = 0;
};

struct ListHelper {
	static void list(const String &p_dir_path, const String &p_prefix,
			ListState &p_state, int p_depth, int p_max_depth) {
		if (p_state.count >= MAX_ENTRIES) {
			return;
		}

		Ref<DirAccess> d = DirAccess::open(p_dir_path);
		if (d.is_null()) {
			return;
		}

		Vector<String> dirs, files;
		d->list_dir_begin();
		String item = d->get_next();
		while (!item.is_empty()) {
			if (item == "." || item == ".." || item.begins_with(".godot") || item.begins_with(".import")) {
				item = d->get_next();
				continue;
			}
			if (d->current_is_dir()) {
				dirs.push_back(item);
			} else {
				files.push_back(item);
			}
			item = d->get_next();
		}
		d->list_dir_end();

		dirs.sort();
		files.sort();

		for (const String &dn : dirs) {
			if (p_state.count >= MAX_ENTRIES) {
				p_state.output += p_prefix + "... [truncated]\n";
				return;
			}
			p_state.output += p_prefix + dn + "/\n";
			p_state.count++;

			if (p_depth < p_max_depth) {
				list(p_dir_path.path_join(dn), p_prefix + "  ", p_state, p_depth + 1, p_max_depth);
			}
		}

		for (const String &fn : files) {
			if (p_state.count >= MAX_ENTRIES) {
				p_state.output += p_prefix + "... [truncated]\n";
				return;
			}
			p_state.output += p_prefix + fn + "\n";
			p_state.count++;
		}
	}
};

} // anonymous namespace

String AIToolRPC::list_files(const Dictionary &p_args) {
	String path = p_args.get("path", "res://");
	bool recursive = p_args.get("recursive", false);

	if (path.is_empty()) {
		path = "res://";
	}
	if (!path.begins_with("res://")) {
		path = "res://" + path;
	}

	Ref<DirAccess> dir = DirAccess::open(path);
	if (dir.is_null()) {
		return "Error: Cannot open directory: " + path;
	}

	ListState state;
	state.output = path + "\n";

	int max_depth = recursive ? 10 : 0;
	ListHelper::list(path, "  ", state, 0, max_depth);

	return state.output;
}
