/**************************************************************************/
/* ai_tool_shell.cpp                                                      */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"

#include "core/io/file_access.h"
#include "core/os/os.h"
#include "core/string/ustring.h"

namespace {

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

} // namespace

String AIToolRPC::validate_command(const Dictionary &p_args, String &r_full_command) {
	String command = p_args.get("command", "");

	if (command.is_empty()) {
		return "Error: 'command' argument is required.";
	}

	String project_dir = OS::get_singleton()->get_resource_dir();

	if (_is_blocked_command(command)) {
		return "Error: Command blocked for safety reasons. This command could cause system damage.";
	}
	if (_has_dangerous_path(command, project_dir)) {
		return "Error: Command blocked — destructive operations on paths outside the project directory are not allowed.";
	}

#ifdef WINDOWS_ENABLED
	r_full_command = "cd /d \"" + project_dir + "\" && " + command;
#else
	r_full_command = "cd \"" + project_dir + "\" && " + command;
#endif

	return String();
}

String AIToolRPC::get_shell_temp_path(const String &p_request_id) {
	String cache_dir = OS::get_singleton()->get_cache_path();
	if (cache_dir.is_empty()) {
		cache_dir = "/tmp";
	}
	return cache_dir.path_join("fogot_cmd_" + p_request_id.md5_text().substr(0, 8) + ".out");
}

ProcessID AIToolRPC::start_shell_process(const String &p_full_command, const String &p_output_path) {
	// Wrap command to redirect all output to a temp file.
#ifdef WINDOWS_ENABLED
	String wrapped = "(" + p_full_command + ") > \"" + p_output_path + "\" 2>&1";
	String shell = "cmd.exe";
	List<String> args;
	args.push_back("/c");
#else
	String wrapped = "(" + p_full_command + ") > \"" + p_output_path + "\" 2>&1";
	String shell = OS::get_singleton()->get_environment("SHELL");
	if (shell.is_empty()) {
		shell = "/bin/sh";
	}
	List<String> args;
	args.push_back("-c");
#endif
	args.push_back(wrapped);

	ProcessID pid = 0;
	Error err = OS::get_singleton()->create_process(shell, args, &pid);
	if (err != OK) {
		return 0;
	}
	return pid;
}

String AIToolRPC::read_output_delta(const String &p_path, int64_t &r_offset) {
	Ref<FileAccess> f = FileAccess::open(p_path, FileAccess::READ);
	if (!f.is_valid()) {
		return String();
	}

	int64_t file_len = f->get_length();
	if (file_len <= r_offset) {
		return String();
	}

	f->seek(r_offset);
	int64_t to_read = file_len - r_offset;
	if (to_read > MAX_OUTPUT_CHARS) {
		to_read = MAX_OUTPUT_CHARS;
	}

	PackedByteArray bytes = f->get_buffer(to_read);
	r_offset = file_len;

	return String::utf8((const char *)bytes.ptr(), bytes.size());
}
