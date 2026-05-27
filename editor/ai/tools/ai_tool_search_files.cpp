/**************************************************************************/
/* ai_tool_search_files.cpp                                               */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"

#include "core/io/dir_access.h"
#include "core/io/file_access.h"
#include "core/string/ustring.h"

namespace {

const int MAX_RESULTS = 100;
const int CONTEXT_CHARS = 80;

struct SearchState {
	String query;
	bool case_sensitive;
	String include_ext; // e.g. ".gd" — empty means all text files
	String output;
	int match_count = 0;
};

bool is_text_extension(const String &p_ext) {
	static const char *text_exts[] = {
		"gd", "tscn", "tres", "cfg", "txt", "md", "json", "csv",
		"toml", "yaml", "yml", "xml", "html", "css", "js", "ts",
		"shader", "gdshader", "glsl", "c", "cpp", "h", "hpp",
		"py", "sh", "bat", "ini", "properties", "import", "godot",
		nullptr
	};
	for (int i = 0; text_exts[i]; i++) {
		if (p_ext == text_exts[i]) {
			return true;
		}
	}
	return false;
}

void search_in_file(const String &p_path, SearchState &p_state) {
	if (p_state.match_count >= MAX_RESULTS) {
		return;
	}

	Ref<FileAccess> f = FileAccess::open(p_path, FileAccess::READ);
	if (f.is_null()) {
		return;
	}

	int line_num = 0;
	while (!f->eof_reached() && p_state.match_count < MAX_RESULTS) {
		String line = f->get_line();
		line_num++;

		int pos = -1;
		if (p_state.case_sensitive) {
			pos = line.find(p_state.query);
		} else {
			pos = line.findn(p_state.query);
		}

		if (pos >= 0) {
			p_state.match_count++;
			// Trim long lines to show context around the match.
			String display_line = line.strip_edges();
			if (display_line.length() > CONTEXT_CHARS * 2) {
				int start = MAX(0, pos - CONTEXT_CHARS);
				int end = MIN(display_line.length(), pos + p_state.query.length() + CONTEXT_CHARS);
				display_line = (start > 0 ? "..." : "") +
						display_line.substr(start, end - start) +
						(end < line.length() ? "..." : "");
			}
			p_state.output += p_path + ":" + itos(line_num) + ": " + display_line + "\n";
		}
	}
}

void search_dir(const String &p_dir, SearchState &p_state) {
	if (p_state.match_count >= MAX_RESULTS) {
		return;
	}

	Ref<DirAccess> d = DirAccess::open(p_dir);
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

	for (const String &fn : files) {
		if (p_state.match_count >= MAX_RESULTS) {
			break;
		}
		String ext = fn.get_extension().to_lower();
		if (!p_state.include_ext.is_empty()) {
			if (ext != p_state.include_ext) {
				continue;
			}
		} else if (!is_text_extension(ext)) {
			continue;
		}
		search_in_file(p_dir.path_join(fn), p_state);
	}

	for (const String &dn : dirs) {
		if (p_state.match_count >= MAX_RESULTS) {
			break;
		}
		search_dir(p_dir.path_join(dn), p_state);
	}
}

} // anonymous namespace

String AIToolRPC::search_files(const Dictionary &p_args) {
	String query = p_args.get("query", "");
	String path = p_args.get("path", "res://");
	bool case_sensitive = p_args.get("case_sensitive", false);
	String file_pattern = p_args.get("file_pattern", "");

	if (query.is_empty()) {
		return "Error: 'query' argument is required.";
	}
	if (!path.begins_with("res://")) {
		path = "res://" + path;
	}

	SearchState state;
	state.query = query;
	state.case_sensitive = case_sensitive;

	// Extract extension filter from pattern like "*.gd" or ".gd".
	if (!file_pattern.is_empty()) {
		String ext = file_pattern;
		if (ext.begins_with("*.")) {
			ext = ext.substr(2);
		} else if (ext.begins_with(".")) {
			ext = ext.substr(1);
		}
		state.include_ext = ext.to_lower();
	}

	search_dir(path, state);

	if (state.match_count == 0) {
		return "No matches found for '" + query + "' in " + path;
	}

	String header = "Found " + itos(state.match_count) + " match" +
			(state.match_count > 1 ? "es" : "") +
			(state.match_count >= MAX_RESULTS ? " (limit reached)" : "") + ":\n";
	return header + state.output;
}
