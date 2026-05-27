/**************************************************************************/
/*  editor_web_view_windows.cpp                                          */
/**************************************************************************/
/*                         This file is part of:                          */
/*                             FOGOT ENGINE                               */
/**************************************************************************/

#ifdef WINDOWS_ENABLED

#include "editor_web_view.h"

#include "core/io/json.h"
#include "core/object/callable_mp.h"
#include "core/os/os.h"
#include "servers/display/display_server.h"

#include <shlobj.h>
#include <wrl.h>

#include <WebView2.h>

using namespace Microsoft::WRL;

class EditorWebViewWindows : public EditorWebView {
	GDCLASS(EditorWebViewWindows, EditorWebView);

	HWND hwnd = nullptr;
	HWND webview_hwnd = nullptr;
	ComPtr<ICoreWebView2Environment> environment;
	ComPtr<ICoreWebView2Controller> controller;
	ComPtr<ICoreWebView2> webview;

	bool ready = false;
	bool creating = false;

	// Queued operations before WebView is ready.
	String pending_html;
	String pending_url;

	void _update_bounds();
	void _create_web_view();
	void _destroy_web_view();
	void _on_environment_created(HRESULT result, ICoreWebView2Environment *env);
	void _on_controller_created(HRESULT result, ICoreWebView2Controller *ctrl);
	void _on_web_message_received(ICoreWebView2 *sender, ICoreWebView2WebMessageReceivedEventArgs *args);
	void _on_navigation_completed(ICoreWebView2 *sender, ICoreWebView2NavigationCompletedEventArgs *args);

protected:
	void _notification(int p_what);
	static void _bind_methods() {}

public:
	void load_html(const String &p_html) override;
	void load_url(const String &p_url) override;
	void evaluate_js(const String &p_script) override;
	bool is_ready() const override { return ready; }
	void set_web_view_visible(bool p_visible) override;

	EditorWebViewWindows();
	~EditorWebViewWindows();
};

// --- Implementation ---

void EditorWebViewWindows::_notification(int p_what) {
	switch (p_what) {
		case NOTIFICATION_ENTER_TREE: {
			_create_web_view();
		} break;
		case NOTIFICATION_EXIT_TREE: {
			_destroy_web_view();
		} break;
		case NOTIFICATION_RESIZED:
		case NOTIFICATION_MOVED_IN_PARENT:
		case NOTIFICATION_VISIBILITY_CHANGED:
		case NOTIFICATION_DRAW: {
			_update_bounds();
		} break;
	}
}

void EditorWebViewWindows::_create_web_view() {
	if (controller || creating) {
		return;
	}

	int64_t window_handle = DisplayServer::get_singleton()->window_get_native_handle(
			DisplayServerEnums::WINDOW_HANDLE, DisplayServerEnums::MAIN_WINDOW_ID);
	if (!window_handle) {
		ERR_PRINT("EditorWebViewWindows: Cannot get native HWND handle.");
		return;
	}

	hwnd = (HWND)window_handle;
	creating = true;

	// User data folder for WebView2 profile.
	wchar_t app_data[MAX_PATH];
	SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, app_data);
	String user_data_folder = String::utf16((const char16_t *)app_data) + "\\Fogot\\WebView2";

	HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(
			nullptr,
			(LPCWSTR)user_data_folder.utf16().get_data(),
			nullptr,
			Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
					[this](HRESULT result, ICoreWebView2Environment *env) -> HRESULT {
						_on_environment_created(result, env);
						return S_OK;
					})
					.Get());

	if (FAILED(hr)) {
		ERR_PRINT("EditorWebViewWindows: CreateCoreWebView2EnvironmentWithOptions failed.");
		creating = false;
	}
}

void EditorWebViewWindows::_on_environment_created(HRESULT result, ICoreWebView2Environment *env) {
	if (FAILED(result) || !env) {
		ERR_PRINT("EditorWebViewWindows: Environment creation failed.");
		creating = false;
		return;
	}

	environment = env;

	env->CreateCoreWebView2Controller(
			hwnd,
			Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
					[this](HRESULT result, ICoreWebView2Controller *ctrl) -> HRESULT {
						_on_controller_created(result, ctrl);
						return S_OK;
					})
					.Get());
}

void EditorWebViewWindows::_on_controller_created(HRESULT result, ICoreWebView2Controller *ctrl) {
	if (FAILED(result) || !ctrl) {
		ERR_PRINT("EditorWebViewWindows: Controller creation failed.");
		creating = false;
		return;
	}

	controller = ctrl;
	controller->get_CoreWebView2(&webview);
	creating = false;

	// Configure settings.
	ComPtr<ICoreWebView2Settings> settings;
	webview->get_Settings(&settings);
	settings->put_IsScriptEnabled(TRUE);
	settings->put_AreDefaultScriptDialogsEnabled(FALSE);
	settings->put_IsWebMessageEnabled(TRUE);
	settings->put_AreDevToolsEnabled(TRUE);
	settings->put_IsStatusBarEnabled(FALSE);

	// Allow localhost navigation for dev mode (Vite HMR).
	// WebView2 allows all navigations by default so no extra filtering needed.

	// Register web message handler (JS → C++).
	webview->add_WebMessageReceived(
			Callback<ICoreWebView2WebMessageReceivedEventHandler>(
					[this](ICoreWebView2 *sender, ICoreWebView2WebMessageReceivedEventArgs *args) -> HRESULT {
						_on_web_message_received(sender, args);
						return S_OK;
					})
					.Get(),
			nullptr);

	// Register navigation completed handler.
	webview->add_NavigationCompleted(
			Callback<ICoreWebView2NavigationCompletedEventHandler>(
					[this](ICoreWebView2 *sender, ICoreWebView2NavigationCompletedEventArgs *args) -> HRESULT {
						_on_navigation_completed(sender, args);
						return S_OK;
					})
					.Get(),
			nullptr);

	// Register custom scheme filter for fogot:// URLs.
	webview->AddWebResourceRequestedFilter(L"fogot://*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
	webview->add_WebResourceRequested(
			Callback<ICoreWebView2WebResourceRequestedEventHandler>(
					[this](ICoreWebView2 *sender, ICoreWebView2WebResourceRequestedEventArgs *args) -> HRESULT {
						ComPtr<ICoreWebView2WebResourceRequest> request;
						args->get_Request(&request);
						LPWSTR uri_raw = nullptr;
						request->get_Uri(&uri_raw);
						if (uri_raw) {
							String uri = String::utf16((const char16_t *)uri_raw);
							CoTaskMemFree(uri_raw);

							if (uri.begins_with("fogot://")) {
								String rest = uri.substr(8);
								String action;
								Dictionary params;

								int qpos = rest.find("?");
								if (qpos >= 0) {
									action = rest.substr(0, qpos);
									String query = rest.substr(qpos + 1);
									Vector<String> pairs = query.split("&");
									for (int i = 0; i < pairs.size(); i++) {
										int epos = pairs[i].find("=");
										if (epos >= 0) {
											String key = pairs[i].substr(0, epos).uri_decode();
											String val = pairs[i].substr(epos + 1).uri_decode();
											params[key] = val;
										}
									}
								} else {
									action = rest;
								}

								if (!action.is_empty()) {
									_dispatch_js_message(action, params);
								}
							}
						}

						ComPtr<ICoreWebView2WebResourceResponse> response;
						environment->CreateWebResourceResponse(nullptr, 204, L"No Content", L"", &response);
						args->put_Response(response.Get());
						return S_OK;
					})
					.Get(),
			nullptr);

	// Set transparent background.
	ComPtr<ICoreWebView2Controller2> controller2;
	if (SUCCEEDED(controller.As(&controller2))) {
		COREWEBVIEW2_COLOR transparent = { 0, 0, 0, 0 };
		controller2->put_DefaultBackgroundColor(transparent);
	}

	_update_bounds();

	// Process pending load requests.
	if (!pending_url.is_empty()) {
		load_url(pending_url);
		pending_url = "";
	} else if (!pending_html.is_empty()) {
		load_html(pending_html);
		pending_html = "";
	}
}

void EditorWebViewWindows::_on_web_message_received(ICoreWebView2 *sender, ICoreWebView2WebMessageReceivedEventArgs *args) {
	LPWSTR message_raw = nullptr;
	args->TryGetWebMessageAsString(&message_raw);
	if (!message_raw) {
		args->get_WebMessageAsJson(&message_raw);
	}
	if (!message_raw) {
		return;
	}

	String message = String::utf16((const char16_t *)message_raw);
	CoTaskMemFree(message_raw);

	Variant parsed = JSON::parse_string(message);
	if (parsed.get_type() != Variant::DICTIONARY) {
		return;
	}

	Dictionary body = parsed;
	String action = body.get("action", "");
	if (action.is_empty()) {
		return;
	}

	Dictionary params;
	LocalVector<Variant> keys = body.get_key_list();
	for (const Variant &key : keys) {
		String key_str = key;
		if (key_str == "action") {
			continue;
		}
		params[key_str] = String(body[key]);
	}

	_dispatch_js_message(action, params);
}

void EditorWebViewWindows::_on_navigation_completed(ICoreWebView2 *sender, ICoreWebView2NavigationCompletedEventArgs *args) {
	BOOL success = FALSE;
	args->get_IsSuccess(&success);
	if (success) {
		ready = true;
		emit_signal("web_view_ready");
	} else {
		COREWEBVIEW2_WEB_ERROR_STATUS status;
		args->get_WebErrorStatus(&status);
		ERR_PRINT(vformat("EditorWebViewWindows: Navigation failed with error status %d.", (int)status));
	}
}

void EditorWebViewWindows::_update_bounds() {
	if (!controller || !is_inside_tree()) {
		return;
	}

	Rect2 global_rect = get_global_rect();
	float scale = DisplayServer::get_singleton()->screen_get_scale(
			DisplayServer::get_singleton()->window_get_current_screen());

	RECT bounds;
	bounds.left = (LONG)(global_rect.position.x / scale);
	bounds.top = (LONG)(global_rect.position.y / scale);
	bounds.right = (LONG)((global_rect.position.x + global_rect.size.width) / scale);
	bounds.bottom = (LONG)((global_rect.position.y + global_rect.size.height) / scale);

	controller->put_Bounds(bounds);
	controller->put_IsVisible(is_visible_in_tree() ? TRUE : FALSE);
}

void EditorWebViewWindows::_destroy_web_view() {
	if (controller) {
		controller->Close();
		controller = nullptr;
	}
	webview = nullptr;
	environment = nullptr;
	ready = false;
	creating = false;
}

void EditorWebViewWindows::load_html(const String &p_html) {
	if (!webview) {
		pending_html = p_html;
		pending_url = "";
		return;
	}
	webview->NavigateToString((LPCWSTR)p_html.utf16().get_data());
}

void EditorWebViewWindows::load_url(const String &p_url) {
	if (!webview) {
		pending_url = p_url;
		pending_html = "";
		return;
	}
	webview->Navigate((LPCWSTR)p_url.utf16().get_data());
}

void EditorWebViewWindows::evaluate_js(const String &p_script) {
	if (!webview || !ready) {
		return;
	}
	webview->ExecuteScript(
			(LPCWSTR)p_script.utf16().get_data(),
			nullptr);
}

void EditorWebViewWindows::set_web_view_visible(bool p_visible) {
	if (controller) {
		controller->put_IsVisible(p_visible ? TRUE : FALSE);
	}
}

EditorWebViewWindows::EditorWebViewWindows() {
}

EditorWebViewWindows::~EditorWebViewWindows() {
	_destroy_web_view();
}

// Factory function called from EditorWebView::create_platform_view().
EditorWebView *_create_windows_web_view() {
	return memnew(EditorWebViewWindows);
}

#endif // WINDOWS_ENABLED
