"""Functions used to generate source files during build time.

Embeds the prebuilt AI chat UI (editor/ai/chat-ui/dist/index.html) into the
editor binary as a byte array so the panel works without any runtime file
dependency. Mirrors the approach used for builtin editor fonts.
"""

import methods


def make_chat_html_header(target, source, env):
    buffer = methods.get_buffer(str(source[0])) if source else b""
    with methods.generated_wrapper(str(target[0])) as file:
        if len(buffer) == 0:
            # Avoid a zero-sized array (invalid in C++); size stays 0 so the
            # runtime can fall back to its "not found" message.
            file.write(
                "inline constexpr int _chat_ui_html_size = 0;\n"
                "inline constexpr unsigned char _chat_ui_html[] = { 0 };\n"
            )
        else:
            file.write(f"""\
inline constexpr int _chat_ui_html_size = {len(buffer)};
inline constexpr unsigned char _chat_ui_html[] = {{
	{methods.format_buffer(buffer, 1)}
}};
""")
