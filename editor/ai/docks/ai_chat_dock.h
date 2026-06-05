/**************************************************************************/
/* ai_chat_dock.h                                                         */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#pragma once

#include "editor/docks/editor_dock.h"

class EditorFileDialog;
class EditorWebView;

/// AI Chat panel dock using a platform-native WebView (React + assistant-ui).
///
/// Post-refactor: conversation management, LLM streaming, and agent logic
/// are handled entirely in the JS frontend (Vercel AI SDK). This class only:
///   - Hosts the WebView and loads the React app.
///   - Dispatches Tool RPC requests (read_file/write_file/list_files).
///   - Pushes editor config (API keys, model names) to JS.
///   - Handles editor actions (openFile) from JS.
class AIChatDock : public EditorDock {
	GDCLASS(AIChatDock, EditorDock);

	EditorWebView *web_view = nullptr;

	// File dialog (native, triggered by JS request).
	EditorFileDialog *project_file_dialog = nullptr;

	// Escape a string for safe embedding in a JS function call argument.
	static String _js_escape(const String &p_str);

	// JS helper: evaluate chatBridge.method(args...) in the WebView.
	void _js_call(const String &p_method, const Vector<String> &p_args = {});

	// JS → C++ message handler.
	void _on_js_message(const String &p_action, const Dictionary &p_params);

	// WebView lifecycle.
	void _on_web_view_ready();
	void _load_chat_html();

	// File dialog callback.
	void _on_project_file_selected(const String &p_path);

	// ─── Tool RPC ───────────────────────────────────────────────
	void _handle_call_tool(const String &p_request_id, const String &p_tool_name, const String &p_args_json);

	// ─── Async screenshot callback ──────────────────────────────
	void _on_screenshot_result(const String &p_request_id, const String &p_output_path, int64_t p_w, int64_t p_h, const String &p_temp_path, const Rect2i &p_rect);

	// ─── Debugger error forwarding ──────────────────────────────
	Vector<String> pending_debugger_errors;
	bool flush_scheduled = false;
	void _on_debugger_error(const String &p_json);
	void _flush_debugger_errors();

protected:
	void _notification(int p_what);
	static void _bind_methods();

public:
	AIChatDock();
};
