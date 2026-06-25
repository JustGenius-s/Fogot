/**************************************************************************/
/* ai_chat_dock.cpp                                                       */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_chat_dock.h"

#include "core/crypto/crypto_core.h"
#include "core/io/dir_access.h"
#include "core/io/file_access.h"
#include "core/io/json.h"
#include "core/io/resource_loader.h"
#include "core/object/callable_mp.h"
#include "core/object/script_language.h"
#include "core/object/worker_thread_pool.h"
#include "core/os/os.h"
#include "core/string/translation_server.h"
#include "editor/ai/tools/ai_tool_rpc.h"
#include "editor/ai/web/editor_web_view.h"
#include "editor/debugger/editor_debugger_node.h"
#include "editor/debugger/script_editor_debugger.h"
#include "editor/editor_interface.h"
#include "editor/gui/editor_file_dialog.h"

#include "ai_chat_html.gen.h"

void AIChatDock::_bind_methods() {
}

void AIChatDock::_notification(int p_what) {
	switch (p_what) {
		case NOTIFICATION_ENTER_TREE: {
			callable_mp(this, &AIChatDock::_load_chat_html).call_deferred();
		} break;
		case NOTIFICATION_READY: {
			EditorDebuggerNode *dbg_node = EditorDebuggerNode::get_singleton();
			if (dbg_node) {
				ScriptEditorDebugger *dbg = dbg_node->get_default_debugger();
				if (dbg) {
					dbg->connect("error_received", callable_mp(this, &AIChatDock::_on_debugger_error));
				}
			}
		} break;
	}
}

// ─── JS helpers ───────────────────────────────────────────────────

String AIChatDock::_js_escape(const String &p_str) {
	String s = p_str;
	s = s.replace("\\", "\\\\");
	s = s.replace("'", "\\'");
	s = s.replace("\n", "\\n");
	s = s.replace("\r", "\\r");
	s = s.replace("\t", "\\t");
	return s;
}

void AIChatDock::_js_call(const String &p_method, const Vector<String> &p_args) {
	if (!web_view || !web_view->is_ready()) {
		return;
	}

	String script = "window.chatBridge." + p_method + "(";
	for (int i = 0; i < p_args.size(); i++) {
		if (i > 0) {
			script += ", ";
		}
		script += p_args[i];
	}
	script += ")";
	web_view->evaluate_js(script);
}

// ─── JS �?C++ message handler ────────────────────────────────────

void AIChatDock::_on_js_message(const String &p_action, const Dictionary &p_params) {
	if (p_action == "callTool") {
		String request_id = p_params.get("requestId", "");
		String tool_name = p_params.get("toolName", "");
		String args_json = p_params.get("args", "{}");
		_handle_call_tool(request_id, tool_name, args_json);

	} else if (p_action == "editorAction") {
		String type = p_params.get("type", "");
		if (type == "openFile") {
			String path = p_params.get("path", "");
			if (!path.is_empty()) {
				int start_line = String(p_params.get("startLine", "-1")).to_int();
				if (path.get_extension() == "tscn" || path.get_extension() == "scn") {
					EditorInterface::get_singleton()->open_scene_from_path(path);
				} else {
					Ref<Resource> res = ResourceLoader::load(path);
					if (res.is_valid()) {
						Ref<Script> script = res;
						if (script.is_valid()) {
							EditorInterface::get_singleton()->edit_script(script, start_line, 0, true);
						} else {
							EditorInterface::get_singleton()->edit_resource(res);
						}
					}
				}
			}
		}

	} else if (p_action == "clear") {
		// Frontend handles conversation clearing; nothing to do in C++.

	} else if (p_action == "attachFile") {
		project_file_dialog->popup_file_dialog();

	} else if (p_action == "fileSelected") {
		String path = p_params.get("path", "");
		_on_project_file_selected(path);

	} else if (p_action == "removeAttachment") {
		// Attachments are now managed in JS; no C++ state to update.

	} else if (p_action == "debugLog") {
		String payload = p_params.get("payload", "");
		String level = p_params.get("level", "log");
		if (!payload.is_empty()) {
			if (level == "error") {
				ERR_PRINT("[AI Chat] " + payload);
			} else if (level == "warn") {
				WARN_PRINT("[AI Chat] " + payload);
			} else {
				print_line("[AI Chat] " + payload);
			}
		}

	} else if (p_action == "cancelCommand") {
		String request_id = p_params.get("requestId", "");
		if (!request_id.is_empty()) {
			_cancel_command(request_id);
		}

	} else if (p_action == "bridgeReady") {
		// #region agent log
		print_line("[DBG-fb625c] bridgeReady received");
		// #endregion
		// Push the editor UI locale so the chat UI can match it (default en).
		String locale;
		if (TranslationServer::get_singleton()) {
			locale = TranslationServer::get_singleton()->get_tool_locale();
		}
		_js_call("setLocale", { "'" + _js_escape(locale) + "'" });
	}
}

// ─── WebView lifecycle ────────────────────────────────────────────

void AIChatDock::_on_web_view_ready() {
	// ES modules aren't ready at didFinishNavigation time.
	// Config is pushed via the "bridgeReady" JS message instead.
}

void AIChatDock::_load_chat_html() {
	if (!web_view) {
		ERR_PRINT("AIChatDock: web_view is null (platform WebView unavailable).");
		return;
	}

	// Dev mode: load from Vite dev server for hot-reload.
	// Set env FOGOT_AI_DEV=1 and run `npm run dev` in editor/ai/chat-ui.
	if (OS::get_singleton()->has_environment("FOGOT_AI_DEV")) {
		String dev_url = OS::get_singleton()->get_environment("FOGOT_AI_DEV");
		if (dev_url == "1" || dev_url.is_empty()) {
			dev_url = "http://127.0.0.1:5173";
		}
		print_line("AIChatDock: Dev mode �?loading from " + dev_url);
		web_view->load_url(dev_url);
		return;
	}

	String html_path = "res://.godot/editor/ai_chat.html";
	Ref<FileAccess> f = FileAccess::open(html_path, FileAccess::READ);

	if (!f.is_valid()) {
		String exe_path = OS::get_singleton()->get_executable_path();
		String source_root = exe_path.get_base_dir().path_join("..");

		String dev_paths[] = {
			source_root.path_join("editor/ai/chat-ui/dist/index.html"),
			"editor/ai/chat-ui/dist/index.html",
			"../editor/ai/chat-ui/dist/index.html",
		};
		for (const String &path : dev_paths) {
			f = FileAccess::open(path, FileAccess::READ);
			if (f.is_valid()) {
				break;
			}
		}
	}

	if (f.is_valid()) {
		// Disk override (dev / power users): load the on-disk build if present.
		String html = f->get_as_utf8_string();
		print_line(vformat("AIChatDock: loading chat UI from disk (%d bytes).", html.length()));
		web_view->load_html(html);
	} else if (_chat_ui_html_size > 0) {
		// Production: use the copy embedded into the binary at compile time.
		String html = String::utf8((const char *)_chat_ui_html, _chat_ui_html_size);
		print_line(vformat("AIChatDock: loading embedded chat UI (%d bytes).", html.length()));
		web_view->load_html(html);
	} else {
		ERR_PRINT("AIChatDock: Could not find chat UI HTML. Build it with: cd editor/ai/chat-ui && npm run build:fast");
		web_view->load_html("<html><body style='background:#1e2228;color:#c8cdd4;padding:20px;font-family:sans-serif'>"
							"<h3>AI Chat UI not found</h3>"
							"<p>Build it: <code>cd editor/ai/chat-ui && npm run build:fast</code></p>"
							"</body></html>");
	}
}

// ─── File dialog ──────────────────────────────────────────────────

void AIChatDock::_on_project_file_selected(const String &p_path) {
	if (p_path.is_empty()) {
		return;
	}

	String data_url;
	Ref<FileAccess> f = FileAccess::open(p_path, FileAccess::READ);
	if (f.is_valid()) {
		PackedByteArray bytes = f->get_buffer(f->get_length());
		String ext = p_path.get_extension().to_lower();
		String mime = "image/png";
		if (ext == "jpg" || ext == "jpeg") {
			mime = "image/jpeg";
		} else if (ext == "webp") {
			mime = "image/webp";
		} else if (ext == "bmp") {
			mime = "image/bmp";
		} else if (ext == "svg") {
			mime = "image/svg+xml";
		} else if (ext == "tga") {
			mime = "image/x-tga";
		}
		String b64 = CryptoCore::b64_encode_str(bytes.ptr(), bytes.size());
		data_url = "data:" + mime + ";base64," + b64;
	}

	_js_call("addAttachment", {
			"'" + _js_escape(p_path) + "'",
			"'" + _js_escape(data_url) + "'",
	});
}

// ─── Tool RPC ─────────────────────────────────────────────────────

void AIChatDock::_handle_call_tool(const String &p_request_id, const String &p_tool_name, const String &p_args_json) {
	Variant parsed = JSON::parse_string(p_args_json);
	Dictionary args;
	if (parsed.get_type() == Variant::DICTIONARY) {
		args = parsed;
	}

	String result;
	bool is_error = false;

	if (p_tool_name == "read_file") {
		result = AIToolRPC::read_file(args);
	} else if (p_tool_name == "write_file") {
		result = AIToolRPC::write_file(args);
	} else if (p_tool_name == "edit_file") {
		result = AIToolRPC::edit_file(args);
	} else if (p_tool_name == "list_files") {
		result = AIToolRPC::list_files(args);
	} else if (p_tool_name == "list_assets") {
		result = AIToolRPC::list_assets(args);
	} else if (p_tool_name == "delete_file") {
		result = AIToolRPC::delete_file(args);
	} else if (p_tool_name == "copy_file") {
		result = AIToolRPC::copy_file(args);
	} else if (p_tool_name == "move_file") {
		result = AIToolRPC::move_file(args);
	} else if (p_tool_name == "search_files") {
		result = AIToolRPC::search_files(args);
	} else if (p_tool_name == "execute_command") {
		String full_command;
		String validation_error = AIToolRPC::validate_command(args, full_command);
		if (!validation_error.is_empty()) {
			_js_call("onToolResult", {
					"'" + _js_escape(p_request_id) + "'",
					"'" + _js_escape(validation_error) + "'",
					"true",
			});
		} else {
			// Run asynchronously on WorkerThreadPool; deliver result on main thread.
			String req_id = p_request_id;
			WorkerThreadPool::get_singleton()->add_task(
				callable_mp(this, &AIChatDock::_execute_command_async).bind(full_command, req_id),
				false, "AI execute_command");
		}
		return;
	} else if (p_tool_name == "get_class_docs") {
		result = AIToolRPC::get_class_docs(args);
	} else if (p_tool_name == "get_script_errors") {
		result = AIToolRPC::get_script_errors(args);
	} else if (p_tool_name == "scene_list_nodes") {
		result = AIToolRPC::scene_list_nodes(args);
	} else if (p_tool_name == "scene_get_node") {
		result = AIToolRPC::scene_get_node(args);
	} else if (p_tool_name == "scene_create_node") {
		result = AIToolRPC::scene_create_node(args);
	} else if (p_tool_name == "scene_delete_node") {
		result = AIToolRPC::scene_delete_node(args);
	} else if (p_tool_name == "scene_set_property") {
		result = AIToolRPC::scene_set_property(args);
	} else if (p_tool_name == "scene_reparent_node") {
		result = AIToolRPC::scene_reparent_node(args);
	} else if (p_tool_name == "scene_move_child") {
		result = AIToolRPC::scene_move_child(args);
	} else if (p_tool_name == "scene_get_class_docs") {
		result = AIToolRPC::scene_get_class_docs(args);
	} else if (p_tool_name == "scene_run") {
		result = AIToolRPC::scene_run(args);
	} else if (p_tool_name == "scene_open") {
		result = AIToolRPC::scene_open(args);
	} else if (p_tool_name == "read_image") {
		result = AIToolRPC::read_image(args);
	} else if (p_tool_name == "scene_get_skeleton2d_data") {
		result = AIToolRPC::scene_get_skeleton2d_data(args);
	} else if (p_tool_name == "scene_set_bone2d_rest") {
		result = AIToolRPC::scene_set_bone2d_rest(args);
	} else if (p_tool_name == "scene_call_method") {
		result = AIToolRPC::scene_call_method(args);
	} else if (p_tool_name == "scene_connect_signal") {
		result = AIToolRPC::scene_connect_signal(args);
	} else if (p_tool_name == "scene_instance_scene") {
		result = AIToolRPC::scene_instance_scene(args);
	} else if (p_tool_name == "design_export_resource") {
		result = AIToolRPC::design_export_resource(args);
	} else if (p_tool_name == "mention_suggestions") {
		result = AIToolRPC::mention_suggestions(args);
	} else {
		result = "Error: Unknown tool '" + p_tool_name + "'";
		is_error = true;
	}

	if (result.begins_with("Error:")) {
		is_error = true;
	}

	_js_call("onToolResult", {
			"'" + _js_escape(p_request_id) + "'",
			"'" + _js_escape(result) + "'",
			is_error ? "true" : "false",
	});
}

// ─── Debugger error forwarding ────────────────────────────────

void AIChatDock::_on_debugger_error(const String &p_json) {
	pending_debugger_errors.push_back(p_json);
	if (!flush_scheduled) {
		flush_scheduled = true;
		callable_mp(this, &AIChatDock::_flush_debugger_errors).call_deferred();
	}
}

void AIChatDock::_flush_debugger_errors() {
	flush_scheduled = false;
	if (pending_debugger_errors.is_empty()) {
		return;
	}

	String json_array = "[";
	for (int i = 0; i < pending_debugger_errors.size(); i++) {
		if (i > 0) {
			json_array += ",";
		}
		json_array += pending_debugger_errors[i];
	}
	json_array += "]";
	pending_debugger_errors.clear();

	_js_call("onDebuggerErrors", { "'" + _js_escape(json_array) + "'" });
}

// ─── Async command execution (streaming + kill) ──────────────────────

void AIChatDock::_execute_command_async(const String &p_full_command, const String &p_request_id) {
	// Runs on WorkerThreadPool thread.
	String output_path = AIToolRPC::get_shell_temp_path(p_request_id);

	ProcessID pid = AIToolRPC::start_shell_process(p_full_command, output_path);
	if (pid == 0) {
		String err = "Error: Failed to start shell process.";
		callable_mp(this, &AIChatDock::_on_command_completed).bind(p_request_id, err).call_deferred();
		return;
	}

	// Register the running command for cancellation support.
	RunningCommand *cmd = new RunningCommand();
	cmd->pid = pid;
	cmd->output_path = output_path;
	{
		MutexLock lock(_running_commands_mutex);
		_running_commands[p_request_id] = cmd;
	}

	// Poll loop: read output incrementally and push to frontend.
	int64_t read_offset = 0;
	while (OS::get_singleton()->is_process_running(pid)) {
		if (cmd->cancelled.is_set()) {
			OS::get_singleton()->kill(pid);
			break;
		}
		OS::get_singleton()->delay_usec(200'000); // 200ms

		String chunk = AIToolRPC::read_output_delta(output_path, read_offset);
		if (!chunk.is_empty()) {
			callable_mp(this, &AIChatDock::_push_command_output).bind(p_request_id, chunk).call_deferred();
		}
	}

	// Read any remaining output after process exited.
	OS::get_singleton()->delay_usec(50'000); // small delay for file flush
	String final_chunk = AIToolRPC::read_output_delta(output_path, read_offset);
	if (!final_chunk.is_empty()) {
		callable_mp(this, &AIChatDock::_push_command_output).bind(p_request_id, final_chunk).call_deferred();
	}

	// Build final result with exit code.
	int exit_code = cmd->cancelled.is_set() ? -1 : OS::get_singleton()->get_process_exit_code(pid);
	String result = "Exit code: " + itos(exit_code);
	if (cmd->cancelled.is_set()) {
		result += " (cancelled)";
	}

	// Cleanup.
	{
		MutexLock lock(_running_commands_mutex);
		_running_commands.erase(p_request_id);
	}
	delete cmd;

	// Remove temp file.
	Ref<DirAccess> da = DirAccess::create(DirAccess::ACCESS_FILESYSTEM);
	if (da.is_valid()) {
		da->remove(output_path);
	}

	callable_mp(this, &AIChatDock::_on_command_completed).bind(p_request_id, result).call_deferred();
}

void AIChatDock::_push_command_output(const String &p_request_id, const String &p_chunk) {
	_js_call("onCommandOutput", {
			"'" + _js_escape(p_request_id) + "'",
			"'" + _js_escape(p_chunk) + "'",
	});
}

void AIChatDock::_on_command_completed(const String &p_request_id, const String &p_result) {
	bool is_error = p_result.begins_with("Error:");
	_js_call("onToolResult", {
			"'" + _js_escape(p_request_id) + "'",
			"'" + _js_escape(p_result) + "'",
			is_error ? "true" : "false",
	});
}

void AIChatDock::_cancel_command(const String &p_request_id) {
	MutexLock lock(_running_commands_mutex);
	RunningCommand **cmd_ptr = _running_commands.getptr(p_request_id);
	if (cmd_ptr && *cmd_ptr) {
		(*cmd_ptr)->cancelled.set();
	}
}

// ─── Constructor ──────────────────────────────────────────────────

AIChatDock::AIChatDock() {
	set_name(TTRC("AI Chat"));
	set_icon_name("NodeInfo");
	set_default_slot(EditorDock::DOCK_SLOT_RIGHT_UR);

	web_view = EditorWebView::create_platform_view();
	if (web_view) {
		web_view->set_anchors_and_offsets_preset(PRESET_FULL_RECT);
		web_view->set_h_size_flags(SIZE_EXPAND_FILL);
		web_view->set_v_size_flags(SIZE_EXPAND_FILL);
		web_view->set_custom_minimum_size(Size2(100, 200));
		add_child(web_view);
		web_view->connect("js_message_received", callable_mp(this, &AIChatDock::_on_js_message));
		web_view->connect("web_view_ready", callable_mp(this, &AIChatDock::_on_web_view_ready));
	}

	project_file_dialog = memnew(EditorFileDialog);
	project_file_dialog->set_file_mode(FileDialog::FILE_MODE_OPEN_FILE);
	project_file_dialog->set_access(FileDialog::ACCESS_RESOURCES);
	project_file_dialog->set_title(TTRC("Select Image from Project"));
	project_file_dialog->clear_filters();
	project_file_dialog->add_filter("*.png, *.jpg, *.jpeg, *.webp, *.bmp, *.tga", "Images");
	project_file_dialog->connect("file_selected", callable_mp(this, &AIChatDock::_on_project_file_selected));
	add_child(project_file_dialog);
}
