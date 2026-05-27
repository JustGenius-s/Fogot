/**************************************************************************/
/*  editor_web_view.cpp                                                   */
/**************************************************************************/
/*                         This file is part of:                          */
/*                             FOGOT ENGINE                               */
/**************************************************************************/

#include "editor_web_view.h"

void EditorWebView::_bind_methods() {
	ADD_SIGNAL(MethodInfo("js_message_received",
			PropertyInfo(Variant::STRING, "action"),
			PropertyInfo(Variant::DICTIONARY, "params")));

	ADD_SIGNAL(MethodInfo("web_view_ready"));
}

void EditorWebView::_dispatch_js_message(const String &p_action, const Dictionary &p_params) {
	emit_signal("js_message_received", p_action, p_params);
}

EditorWebView *EditorWebView::create_platform_view() {
#ifdef MACOS_ENABLED
	// Defined in editor_web_view_macos.mm
	extern EditorWebView *_create_macos_web_view();
	return _create_macos_web_view();
#else
	ERR_PRINT("EditorWebView: No platform implementation available.");
	return nullptr;
#endif
}

EditorWebView::EditorWebView() {
	set_focus_mode(FOCUS_ALL);
}

EditorWebView::~EditorWebView() {
}
