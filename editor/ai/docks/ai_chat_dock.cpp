/**************************************************************************/
/* ai_chat_dock.cpp                                                       */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_chat_dock.h"

#include "core/crypto/crypto_core.h"
#include "core/io/file_access.h"
#include "core/io/json.h"
#include "core/io/resource_loader.h"
#include "core/object/callable_mp.h"
#include "core/object/script_language.h"
#include "core/os/os.h"
#include "editor/ai/tools/ai_tool_rpc.h"
#include "editor/ai/web/editor_web_view.h"
#include "editor/debugger/editor_debugger_node.h"
#include "editor/debugger/script_editor_debugger.h"
#include "editor/editor_interface.h"
#include "editor/gui/editor_file_dialog.h"
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

	} else if (p_action == "bridgeReady") {
		// #region agent log
		print_line("[DBG-fb625c] bridgeReady received");
		// #endregion
	}
}

// ─── WebView lifecycle ────────────────────────────────────────────

void AIChatDock::_on_web_view_ready() {
	// ES modules aren't ready at didFinishNavigation time.
	// Config is pushed via the "bridgeReady" JS message instead.
}

void AIChatDock::_load_chat_html() {
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
		String html = f->get_as_utf8_string();
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
		result = AIToolRPC::execute_command(args);
	} else if (p_tool_name == "get_class_docs") {
		result = AIToolRPC::get_class_docs(args);
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
