/**************************************************************************/
/* ai_tool_files.cpp                                                      */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"
#include "../shared/ai_shared_utils.h"

#include "core/crypto/crypto_core.h"
#include "core/io/dir_access.h"
#include "core/io/file_access.h"
#include "core/io/image.h"
#include "core/io/json.h"
#include "core/io/resource_importer.h"
#include "core/os/os.h"
#include "core/os/thread.h"
#include "core/string/ustring.h"
#include "core/templates/safe_refcount.h"
#include "editor/file_system/editor_file_system.h"

namespace {

// --- execute_command helpers ---

const int DEFAULT_TIMEOUT_MS = 30000;
const int MAX_TIMEOUT_MS = 120000;
const int MAX_OUTPUT_CHARS = 50000;

bool _is_blocked_command(const String &p_command) {
	String cmd = p_command.strip_edges();

	static const char *blocked_patterns[] = {
		"rm -rf /",
		"rm -rf /*",
		"rm -rf ~",
		"rm -rf $HOME",
		"mkfs",
		"dd if=",
		":(){",
		"chmod -R 777 /",
		"chown -R ",
		"shutdown",
		"reboot",
		"halt",
		"init ",
		"systemctl",
		"launchctl",
		"> /dev/sda",
		"curl|sh",
		"curl|bash",
		"wget|sh",
		"wget|bash",
		nullptr
	};

	String lower = cmd.to_lower();
	for (int i = 0; blocked_patterns[i]; i++) {
		if (lower.contains(blocked_patterns[i])) {
			return true;
		}
	}

	return false;
}

bool _has_dangerous_path(const String &p_command, const String &p_project_dir) {
	String cmd = p_command.strip_edges();

	static const char *destructive_cmds[] = { "rm ", "mv ", "cp ", nullptr };

	bool has_destructive = false;
	String lower = cmd.to_lower();
	for (int i = 0; destructive_cmds[i]; i++) {
		if (lower.contains(destructive_cmds[i])) {
			has_destructive = true;
			break;
		}
	}

	if (!has_destructive) {
		return false;
	}

	Vector<String> tokens = cmd.split(" ", false);
	for (int i = 1; i < tokens.size(); i++) {
		String token = tokens[i];
		if (token.begins_with("-")) {
			continue;
		}
		if (token.begins_with("/") && !token.begins_with(p_project_dir)) {
			return true;
		}
		if (token.begins_with("~") || token.begins_with("$HOME")) {
			return true;
		}
	}

	return false;
}

struct ExecuteState {
	String command;
	String output;
	int exit_code = -1;
	SafeFlag done;
};

void _execute_thread_func(void *p_userdata) {
	ExecuteState *state = static_cast<ExecuteState *>(p_userdata);

	List<String> args;
#ifdef WINDOWS_ENABLED
	String shell = "cmd.exe";
	args.push_back("/c");
#else
	String shell = OS::get_singleton()->get_environment("SHELL");
	if (shell.is_empty()) {
		shell = "/bin/sh";
	}
	args.push_back("-c");
#endif
	args.push_back(state->command);

	OS::get_singleton()->execute(shell, args, &state->output, &state->exit_code, true);
	state->done.set();
}

// --- list_assets helpers ---

const int MAX_ASSETS = 1000;

bool is_image_ext(const String &p_ext) {
	return !ext_to_mime_type(p_ext).is_empty();
}

void collect_assets(const String &p_dir_path, Array &p_out, bool p_recursive, int p_depth) {
	if (p_out.size() >= MAX_ASSETS || p_depth > 10) {
		return;
	}

	Ref<DirAccess> d = DirAccess::open(p_dir_path);
	if (d.is_null()) {
		return;
	}

	Vector<String> subdirs;
	d->list_dir_begin();
	String item = d->get_next();
	while (!item.is_empty()) {
		if (item == "." || item == ".." || item.begins_with(".godot") || item.begins_with(".import")) {
			item = d->get_next();
			continue;
		}
		if (d->current_is_dir()) {
			subdirs.push_back(item);
		} else if (is_image_ext(item.get_extension().to_lower())) {
			if (p_out.size() >= MAX_ASSETS) {
				break;
			}
			String full_path = p_dir_path.path_join(item);
			uint64_t size = 0;
			Ref<FileAccess> f = FileAccess::open(full_path, FileAccess::READ);
			if (f.is_valid()) {
				size = f->get_length();
			}
			Dictionary entry;
			entry["path"] = full_path;
			entry["name"] = item;
			entry["ext"] = item.get_extension().to_lower();
			entry["size"] = (int64_t)size;
			p_out.push_back(entry);
		}
		item = d->get_next();
	}
	d->list_dir_end();

	if (p_recursive) {
		subdirs.sort();
		for (const String &sd : subdirs) {
			collect_assets(p_dir_path.path_join(sd), p_out, p_recursive, p_depth + 1);
		}
	}
}

// --- list_files helpers ---

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

// --- search_files helpers ---

const int MAX_RESULTS = 100;
const int CONTEXT_CHARS = 80;

struct SearchState {
	String query;
	bool case_sensitive;
	String include_ext;
	String output;
	int match_count = 0;
};

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


String AIToolRPC::delete_file(const Dictionary &p_args) {
	String path = p_args.get("path", "");

	if (path.is_empty()) {
		return "Error: 'path' argument is required.";
	}
	normalize_project_path(path);

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
	normalize_project_path(path);

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


String AIToolRPC::execute_command(const Dictionary &p_args) {
	String command = p_args.get("command", "");
	int timeout_ms = p_args.get("timeout_ms", DEFAULT_TIMEOUT_MS);

	if (command.is_empty()) {
		return "Error: 'command' argument is required.";
	}
	if (timeout_ms <= 0 || timeout_ms > MAX_TIMEOUT_MS) {
		timeout_ms = DEFAULT_TIMEOUT_MS;
	}

	String project_dir = OS::get_singleton()->get_resource_dir();

	// Safety checks.
	if (_is_blocked_command(command)) {
		return "Error: Command blocked for safety reasons. This command could cause system damage.";
	}
	if (_has_dangerous_path(command, project_dir)) {
		return "Error: Command blocked — destructive operations on paths outside the project directory are not allowed.";
	}

	ExecuteState state;
#ifdef WINDOWS_ENABLED
	state.command = "cd /d \"" + project_dir + "\" && " + command;
#else
	state.command = "cd \"" + project_dir + "\" && " + command;
#endif

	Thread thread;
	thread.start(_execute_thread_func, &state);

	uint64_t start = OS::get_singleton()->get_ticks_msec();
	while (!state.done.is_set()) {
		uint64_t elapsed = OS::get_singleton()->get_ticks_msec() - start;
		if (elapsed >= (uint64_t)timeout_ms) {
			return "Error: Command timed out after " + itos(timeout_ms) + "ms. Command: " + command;
		}
		OS::get_singleton()->delay_usec(10000);
	}

	thread.wait_to_finish();

	String output = state.output;
	if (output.length() > MAX_OUTPUT_CHARS) {
		output = output.substr(0, MAX_OUTPUT_CHARS) + "\n... [output truncated, " + itos(state.output.length()) + " total chars]";
	}

	String result;
	result += "Exit code: " + itos(state.exit_code) + "\n";
	if (!output.is_empty()) {
		result += output;
	}

	return result;
}


String AIToolRPC::list_assets(const Dictionary &p_args) {
	String dir = p_args.get("dir", "res://assets/");
	bool recursive = p_args.get("recursive", true);

	if (dir.is_empty()) {
		dir = "res://assets/";
	}
	if (!dir.begins_with("res://")) {
		dir = "res://" + dir;
	}

	Dictionary result;
	result["dir"] = dir;

	bool exists = DirAccess::dir_exists_absolute(dir);
	result["exists"] = exists;

	Array assets;
	if (exists) {
		collect_assets(dir, assets, recursive, 0);
	}
	result["assets"] = assets;

	return JSON::stringify(result);
}


String AIToolRPC::list_files(const Dictionary &p_args) {
	String path = p_args.get("path", "res://");
	bool recursive = p_args.get("recursive", false);

	if (path.is_empty()) {
		path = "res://";
	}
	normalize_project_path(path);

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


String AIToolRPC::read_file(const Dictionary &p_args) {
	String path = p_args.get("path", "");
	bool binary = p_args.get("binary", false);
	int start_line = p_args.get("start_line", 0); // 1-based, 0 means from beginning
	int end_line = p_args.get("end_line", 0); // 1-based, 0 means to end

	if (path.is_empty()) {
		return "Error: 'path' argument is required.";
	}
	normalize_project_path(path);
	if (!FileAccess::exists(path)) {
		return "Error: File not found: " + path;
	}

	Ref<FileAccess> f = FileAccess::open(path, FileAccess::READ);
	if (f.is_null()) {
		return "Error: Cannot open file: " + path;
	}

	if (binary) {
		PackedByteArray data = f->get_buffer(f->get_length());
		return CryptoCore::b64_encode_str(data.ptr(), data.size());
	}

	String content = f->get_as_text();

	// 按行范围读取
	if (start_line > 0 || end_line > 0) {
		Vector<String> lines = content.split("\n");
		int total_lines = lines.size();
		int from = (start_line > 0) ? CLAMP(start_line - 1, 0, total_lines - 1) : 0;
		int to = (end_line > 0) ? CLAMP(end_line - 1, from, total_lines - 1) : (total_lines - 1);

		String result;
		for (int i = from; i <= to; i++) {
			result += itos(i + 1) + "\t" + lines[i];
			if (i < to) {
				result += "\n";
			}
		}

		// 添加元信息
		String meta = "(" + itos(to - from + 1) + " lines shown, " + itos(total_lines) + " total)";
		return meta + "\n" + result;
	}

	static const int MAX_CHARS = 50000;
	if (content.length() > MAX_CHARS) {
		// 计算总行数以便提示
		int total_lines = content.split("\n").size();
		content = content.substr(0, MAX_CHARS) + "\n... [truncated, file too large. Total lines: " + itos(total_lines) + ". Use start_line/end_line to read specific ranges.]";
	}
	return content;
}


String AIToolRPC::search_files(const Dictionary &p_args) {
	String query = p_args.get("query", "");
	String path = p_args.get("path", "res://");
	bool case_sensitive = p_args.get("case_sensitive", false);
	String file_pattern = p_args.get("file_pattern", "");

	if (query.is_empty()) {
		return "Error: 'query' argument is required.";
	}
	normalize_project_path(path);

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


String AIToolRPC::write_file(const Dictionary &p_args) {
	String path = p_args.get("path", "");
	String content = p_args.get("content", "");
	bool binary = p_args.get("binary", false);

	if (path.is_empty()) {
		return "Error: 'path' argument is required.";
	}
	normalize_project_path(path);

	// Ensure parent directory exists via editor API.
	String dir_path = path.get_base_dir();
	if (!DirAccess::dir_exists_absolute(dir_path)) {
		EditorFileSystem::get_singleton()->make_dir_recursive(dir_path);
	}

	Ref<FileAccess> f = FileAccess::open(path, FileAccess::WRITE);
	if (f.is_null()) {
		return "Error: Cannot write to file: " + path;
	}

	if (binary) {
		int decoded_len = content.length() * 3 / 4 + 4;
		PackedByteArray decoded;
		decoded.resize(decoded_len);
		size_t actual_len = 0;
		Error err = CryptoCore::b64_decode(decoded.ptrw(), decoded.size(), &actual_len,
				(const unsigned char *)content.utf8().get_data(), content.utf8().length());
		if (err != OK) {
			return "Error: Invalid base64 content.";
		}
		decoded.resize(actual_len);
		f->store_buffer(decoded);
	} else {
		f->store_string(content);
	}

	f.unref();
	EditorFileSystem::get_singleton()->update_file(path);

	// Trigger Godot resource import for file types that have a registered
	// importer (images, audio, fonts, etc.).  Without this step the engine
	// won't generate the .import metadata and load() will fail at runtime.
	if (ResourceFormatImporter::get_singleton()->get_importer_by_file(path).is_valid()) {
		EditorFileSystem::get_singleton()->reimport_files({ path });
	}

	return "Successfully wrote to " + path;
}

// --- read_image ---

String AIToolRPC::read_image(const Dictionary &p_args) {
	String path = p_args.get("path", "");

	if (path.is_empty()) {
		return "Error: 'path' is required.";
	}
	normalize_project_path(path);

	if (!FileAccess::exists(path)) {
		return "Error: File not found at '" + path + "'.";
	}

	// Determine MIME type from extension.
	String ext = path.get_extension().to_lower();
	String mime_type = ext_to_mime_type(ext);
	if (mime_type.is_empty()) {
		return "Error: Unrecognized image extension '" + ext + "'.";
	}

	// Read raw bytes for base64 encoding.
	Error err;
	Ref<FileAccess> f = FileAccess::open(path, FileAccess::READ, &err);
	if (err != OK || f.is_null()) {
		return "Error: Failed to open file '" + path + "'.";
	}
	PackedByteArray raw_data = f->get_buffer(f->get_length());
	f->close();

	// Encode to base64.
	String base64 = CryptoCore::b64_encode_str(raw_data.ptr(), raw_data.size());

	// Load as Godot Image to get dimensions.
	Ref<Image> img;
	img.instantiate();
	err = img->load(path);
	int width = 0;
	int height = 0;
	if (err == OK) {
		width = img->get_width();
		height = img->get_height();
	}

	Dictionary result;
	result["type"] = "image";
	result["path"] = path;
	result["mimeType"] = mime_type;
	result["width"] = width;
	result["height"] = height;
	result["base64"] = base64;
	return JSON::stringify(result);
}
