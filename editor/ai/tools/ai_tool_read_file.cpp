/**************************************************************************/
/* ai_tool_read_file.cpp                                                  */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"

#include "core/crypto/crypto_core.h"
#include "core/io/file_access.h"

String AIToolRPC::read_file(const Dictionary &p_args) {
	String path = p_args.get("path", "");
	bool binary = p_args.get("binary", false);

	if (path.is_empty()) {
		return "Error: 'path' argument is required.";
	}
	if (!path.begins_with("res://")) {
		path = "res://" + path;
	}
	if (!FileAccess::exists(path)) {
		return "Error: File not found: " + path;
	}

	Ref<FileAccess> f = FileAccess::open(path, FileAccess::READ);
	if (f.is_null()) {
		return "Error: Cannot open file: " + path;
	}

	if (binary) {
		PackedByteArray data = f->get_buffer(f->get_length());
		return CryptoCore::b64_encode_str(data.ptr(), data.size());
	}

	String content = f->get_as_text();
	static const int MAX_CHARS = 50000;
	if (content.length() > MAX_CHARS) {
		content = content.substr(0, MAX_CHARS) + "\n... [truncated, file too large]";
	}
	return content;
}
