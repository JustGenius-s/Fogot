/**************************************************************************/
/*  editor_web_view.h                                                     */
/**************************************************************************/
/*                         This file is part of:                          */
/*                             FOGOT ENGINE                               */
/**************************************************************************/

#pragma once

#include "scene/gui/control.h"

/// Abstract base class wrapping a platform-native WebView (WKWebView / WebView2 / WebKitGTK)
/// that can be embedded as a Godot Control node.
///
/// Subclasses implement the platform-specific WebView creation, positioning, and JS bridge.
/// The WebView is overlaid on top of the Godot window at the Control's screen rect and
/// resized/repositioned automatically as the Control's layout changes.
class EditorWebView : public Control {
	GDCLASS(EditorWebView, Control);

protected:
	static void _bind_methods();

public:
	/// Called by platform implementations (including ObjC delegates) when the JS side
	/// sends a message via the fogot:// URL scheme or the webkit message handler.
	void _dispatch_js_message(const String &p_action, const Dictionary &p_params);
	/// Load HTML content directly (as a string). Used for the single-file Vue app.
	virtual void load_html(const String &p_html) = 0;

	/// Load a local file URL.
	virtual void load_url(const String &p_url) = 0;

	/// Execute JavaScript in the WebView context. Used by C++ to call chatBridge methods.
	virtual void evaluate_js(const String &p_script) = 0;

	/// Whether the WebView is ready (loaded and responding).
	virtual bool is_ready() const = 0;

	/// Show or hide the native WebView overlay.
	virtual void set_web_view_visible(bool p_visible) = 0;

	/// Factory method: creates the correct platform-specific subclass.
	static EditorWebView *create_platform_view();

	EditorWebView();
	virtual ~EditorWebView();
};
