/**************************************************************************/
/* ai_tool_shell.cpp                                                      */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"

#include "core/os/os.h"
#include "core/string/ustring.h"
#include "core/templates/safe_refcount.h"

namespace {

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

} // namespace

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
