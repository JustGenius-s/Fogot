/**************************************************************************/
/*  editor_web_view_macos.mm                                              */
/**************************************************************************/
/*                         This file is part of:                          */
/*                             FOGOT ENGINE                               */
/**************************************************************************/

#ifdef MACOS_ENABLED

// WebKit headers pull in CoreText which defines 'FontVariation', clashing with
// Godot's FontVariation class.  Import WebKit before any Godot headers that
// define FontVariation, or work around with a macro guard.
#define FontVariation __CT_FontVariation
#import <WebKit/WebKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#undef FontVariation

#include "editor_web_view.h"

#include "core/object/callable_mp.h"
#include "servers/display/display_server.h"

// Objective-C delegate that receives messages from the JS side.
@interface FogotWebViewDelegate : NSObject <WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler>
@property (nonatomic, assign) EditorWebView *owner;
@end

// Custom WKWebView subclass that handles standard editing shortcuts (Cmd+C/V/X/A/Z).
// Godot's macOS menu bar has no Edit menu, so performKeyEquivalent: for these
// shortcuts falls through to the main menu which discards them. We override here
// to dispatch the corresponding editing actions through the responder chain.
@interface FogotWKWebView : WKWebView
@end

@implementation FogotWKWebView

- (BOOL)performKeyEquivalent:(NSEvent *)event {
	if ([super performKeyEquivalent:event]) {
		return YES;
	}

	NSResponder *fr = [[self window] firstResponder];
	if (![fr isKindOfClass:[NSView class]] || ![(NSView *)fr isDescendantOf:self]) {
		return NO;
	}

	NSEventModifierFlags flags = [event modifierFlags] & NSEventModifierFlagDeviceIndependentFlagsMask;
	NSString *chars = [event charactersIgnoringModifiers];
	if (!chars || chars.length == 0) {
		return NO;
	}

	unichar c = [[chars lowercaseString] characterAtIndex:0];
	SEL action = nil;

	if (flags == NSEventModifierFlagCommand) {
		switch (c) {
			case 'c': action = @selector(copy:); break;
			case 'v': action = @selector(paste:); break;
			case 'x': action = @selector(cut:); break;
			case 'a': action = @selector(selectAll:); break;
			case 'z': action = @selector(undo:); break;
			default: break;
		}
	} else if (flags == (NSEventModifierFlagCommand | NSEventModifierFlagShift) && c == 'z') {
		action = @selector(redo:);
	}

	if (action) {
		[NSApp sendAction:action to:nil from:self];
		return YES;
	}

	return NO;
}

@end

class EditorWebViewMacOS : public EditorWebView {
	GDCLASS(EditorWebViewMacOS, EditorWebView);

	WKWebView *wk_view = nil;
	FogotWebViewDelegate *delegate = nil;
	bool ready = false;

	// Queued load requests issued before the WKWebView exists.
	String pending_html;
	String pending_url;

	void _update_frame();
	void _create_web_view();
	void _destroy_web_view();

protected:
	void _notification(int p_what);
	static void _bind_methods() {}

public:
	void load_html(const String &p_html) override;
	void load_url(const String &p_url) override;
	void evaluate_js(const String &p_script) override;
	bool is_ready() const override { return ready; }
	void set_web_view_visible(bool p_visible) override;

	void _on_navigation_failed(const String &p_error);
	void _on_page_loaded();
	void _on_js_message(const String &p_body);

	EditorWebViewMacOS();
	~EditorWebViewMacOS();
};

// --- Objective-C delegate implementation ---

@implementation FogotWebViewDelegate

- (void)userContentController:(WKUserContentController *)userContentController
	  didReceiveScriptMessage:(WKScriptMessage *)message {
	if (!self.owner) return;

	if ([message.name isEqualToString:@"fogot"]) {
		NSDictionary *body = nil;
		if ([message.body isKindOfClass:[NSDictionary class]]) {
			body = (NSDictionary *)message.body;
		} else if ([message.body isKindOfClass:[NSString class]]) {
			NSData *data = [(NSString *)message.body dataUsingEncoding:NSUTF8StringEncoding];
			body = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
		}

		if (body) {
			NSString *action = body[@"action"];
			if (action) {
				String action_str = String::utf8([action UTF8String]);
				Dictionary params;
				for (NSString *key in body) {
					if ([key isEqualToString:@"action"]) continue;
					NSString *val = [NSString stringWithFormat:@"%@", body[key]];
					params[String::utf8([key UTF8String])] = String::utf8([val UTF8String]);
				}
				((EditorWebViewMacOS *)self.owner)->_on_js_message(action_str);
				self.owner->_dispatch_js_message(action_str, params);
			}
		}
	}
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
	if (self.owner) {
		((EditorWebViewMacOS *)self.owner)->_on_page_loaded();
	}
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
	if (self.owner) {
		((EditorWebViewMacOS *)self.owner)->_on_navigation_failed(
			String::utf8([[error localizedDescription] UTF8String]));
	}
}

- (void)webView:(WKWebView *)webView
	runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters
	initiatedByFrame:(WKFrameInfo *)frame
	completionHandler:(void (^)(NSArray<NSURL *> * _Nullable URLs))completionHandler {

	NSOpenPanel *panel = [NSOpenPanel openPanel];
	panel.allowsMultipleSelection = parameters.allowsMultipleSelection;
	panel.allowedContentTypes = @[UTTypeImage];

	[panel beginWithCompletionHandler:^(NSModalResponse result) {
		if (result == NSModalResponseOK) {
			NSArray<NSURL *> *urls = panel.URLs;
			completionHandler(urls);

			for (NSURL *url in urls) {
				if (self.owner) {
					Dictionary params;
					params[String("path")] = String::utf8([[url path] UTF8String]);
					self.owner->_dispatch_js_message(String("fileSelected"), params);
				}
			}
		} else {
			completionHandler(nil);
		}
	}];
}

- (void)webView:(WKWebView *)webView
	decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
	decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {

	NSURL *url = navigationAction.request.URL;
	if ([[url scheme] isEqualToString:@"fogot"]) {
		// Intercept fogot:// URLs as JS-to-C++ messages.
		NSString *action = [url host];
		NSURLComponents *components = [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
		Dictionary params;
		for (NSURLQueryItem *item in components.queryItems) {
			params[String::utf8([item.name UTF8String])] = String::utf8([item.value UTF8String]);
		}
		if (self.owner && action) {
			self.owner->_dispatch_js_message(String::utf8([action UTF8String]), params);
		}
		decisionHandler(WKNavigationActionPolicyCancel);
		return;
	}

	NSString *scheme = [url scheme];
	NSString *host = [url host];

	// Allow localhost for dev mode (Vite dev server + HMR WebSocket).
	if (([scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"] ||
		 [scheme isEqualToString:@"ws"] || [scheme isEqualToString:@"wss"]) &&
		(host && ([host isEqualToString:@"127.0.0.1"] || [host isEqualToString:@"localhost"]))) {
		decisionHandler(WKNavigationActionPolicyAllow);
		return;
	}

	// Allow about:blank, data: URIs, and local file:// (the bundled chat UI is
	// loaded from a file in Application Support in normal mode).
	if ([scheme isEqualToString:@"about"] || [scheme isEqualToString:@"data"] ||
		[scheme isEqualToString:@"file"]) {
		decisionHandler(WKNavigationActionPolicyAllow);
	} else {
		decisionHandler(WKNavigationActionPolicyCancel);
	}
}

@end

// --- C++ implementation ---

void EditorWebViewMacOS::_notification(int p_what) {
	switch (p_what) {
		case NOTIFICATION_ENTER_TREE: {
			_create_web_view();
		} break;
		case NOTIFICATION_EXIT_TREE: {
			_destroy_web_view();
		} break;
		case NOTIFICATION_RESIZED:
		case NOTIFICATION_MOVED_IN_PARENT:
		case NOTIFICATION_VISIBILITY_CHANGED: {
			_update_frame();
		} break;
		case NOTIFICATION_DRAW: {
			_update_frame();
		} break;
	}
}

void EditorWebViewMacOS::_create_web_view() {
	if (wk_view) return;

	int64_t view_handle = DisplayServer::get_singleton()->window_get_native_handle(
		DisplayServerEnums::WINDOW_VIEW, DisplayServerEnums::MAIN_WINDOW_ID);
	if (!view_handle) {
		ERR_PRINT("EditorWebViewMacOS: Cannot get native NSView handle.");
		return;
	}

	NSView *parent_view = (__bridge NSView *)(void *)view_handle;

	delegate = [[FogotWebViewDelegate alloc] init];
	delegate.owner = this;

	WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
	[config.userContentController addScriptMessageHandler:delegate name:@"fogot"];

	// Allow inline media and disable default restrictions for a local app.
	config.preferences.javaScriptCanOpenWindowsAutomatically = NO;

	wk_view = [[FogotWKWebView alloc] initWithFrame:NSZeroRect configuration:config];
	wk_view.navigationDelegate = delegate;
	wk_view.UIDelegate = delegate;
	wk_view.autoresizingMask = 0;

	// Transparent background so it blends with Godot if needed.
	[wk_view setValue:@(NO) forKey:@"drawsBackground"];

	[parent_view addSubview:wk_view];
	_update_frame();

	print_line("EditorWebViewMacOS: WKWebView created.");

	// Flush any load request that arrived before the view existed.
	if (!pending_url.is_empty()) {
		String url = pending_url;
		pending_url = "";
		load_url(url);
	} else if (!pending_html.is_empty()) {
		String html = pending_html;
		pending_html = "";
		load_html(html);
	}
}

void EditorWebViewMacOS::_destroy_web_view() {
	if (wk_view) {
		[wk_view removeFromSuperview];
		[wk_view.configuration.userContentController removeScriptMessageHandlerForName:@"fogot"];
		wk_view.navigationDelegate = nil;
		wk_view = nil;
	}
	if (delegate) {
		delegate.owner = nullptr;
		delegate = nil;
	}
	ready = false;
}

void EditorWebViewMacOS::_update_frame() {
	if (!wk_view || !is_inside_tree()) return;

	Rect2 global_rect = get_global_rect();

	NSView *parent = [wk_view superview];
	if (!parent) return;

	CGFloat parent_height = parent.bounds.size.height;
	float scale = DisplayServer::get_singleton()->screen_get_scale(
		DisplayServer::get_singleton()->window_get_current_screen());

	NSRect frame;
	frame.origin.x = global_rect.position.x / scale;
	frame.origin.y = parent_height - (global_rect.position.y + global_rect.size.y) / scale;
	frame.size.width = global_rect.size.width / scale;
	frame.size.height = global_rect.size.height / scale;

	wk_view.frame = frame;
	wk_view.hidden = !is_visible_in_tree();
}

void EditorWebViewMacOS::load_html(const String &p_html) {
	if (!wk_view) {
		// Queue until the view exists; flushed from _create_web_view().
		pending_html = p_html;
		pending_url = "";
		print_line("EditorWebViewMacOS: load_html queued (view not ready).");
		return;
	}

	NSString *appSupport = [NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES) firstObject];
	NSString *fogotDir = [appSupport stringByAppendingPathComponent:@"Fogot"];
	[[NSFileManager defaultManager] createDirectoryAtPath:fogotDir withIntermediateDirectories:YES attributes:nil error:nil];

	// WKWebView's loadHTMLString passes the markup over IPC and fails silently
	// for large documents (our bundled UI is several MB). Write it to a file and
	// load via a file URL, which has no such size limit.
	NSString *htmlPath = [fogotDir stringByAppendingPathComponent:@"ai_chat.html"];
	NSString *html_str = [NSString stringWithUTF8String:p_html.utf8().get_data()];
	NSError *write_err = nil;
	[html_str writeToFile:htmlPath atomically:YES encoding:NSUTF8StringEncoding error:&write_err];
	if (write_err != nil) {
		// Fall back to the in-memory path if the file could not be written.
		ERR_PRINT("EditorWebViewMacOS: failed to write chat HTML, falling back to loadHTMLString.");
		NSURL *baseURL = [NSURL fileURLWithPath:fogotDir isDirectory:YES];
		[wk_view loadHTMLString:html_str baseURL:baseURL];
		return;
	}

	print_line(vformat("EditorWebViewMacOS: loading chat HTML from file (%d bytes).", p_html.length()));
	NSURL *fileURL = [NSURL fileURLWithPath:htmlPath];
	NSURL *dirURL = [NSURL fileURLWithPath:fogotDir isDirectory:YES];
	[wk_view loadFileURL:fileURL allowingReadAccessToURL:dirURL];
}

void EditorWebViewMacOS::load_url(const String &p_url) {
	if (!wk_view) {
		pending_url = p_url;
		pending_html = "";
		return;
	}

	NSString *url_str = [NSString stringWithUTF8String:p_url.utf8().get_data()];
	NSURL *url = [NSURL URLWithString:url_str];
	NSURLRequest *req = [NSURLRequest requestWithURL:url];
	[wk_view loadRequest:req];
}

void EditorWebViewMacOS::evaluate_js(const String &p_script) {
	if (!wk_view || !ready) return;

	NSString *js = [NSString stringWithUTF8String:p_script.utf8().get_data()];
	[wk_view evaluateJavaScript:js completionHandler:nil];
}

void EditorWebViewMacOS::set_web_view_visible(bool p_visible) {
	if (wk_view) {
		wk_view.hidden = !p_visible;
	}
}

void EditorWebViewMacOS::_on_page_loaded() {
	ready = true;
	print_line("EditorWebViewMacOS: page loaded.");
	emit_signal("web_view_ready");
}

void EditorWebViewMacOS::_on_navigation_failed(const String &p_error) {
	ERR_PRINT("EditorWebViewMacOS: Navigation failed: " + p_error);
}

void EditorWebViewMacOS::_on_js_message(const String &p_body) {
	// Handled via _dispatch_js_message in the delegate.
}

EditorWebViewMacOS::EditorWebViewMacOS() {
}

EditorWebViewMacOS::~EditorWebViewMacOS() {
	_destroy_web_view();
}

// Factory function called from EditorWebView::create_platform_view().
EditorWebView *_create_macos_web_view() {
	return memnew(EditorWebViewMacOS);
}

#endif // MACOS_ENABLED
