/**************************************************************************/
/* ai_tool_write_file.cpp                                                 */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"

#include "core/crypto/crypto_core.h"
#include "core/io/dir_access.h"
#include "core/io/file_access.h"
#include "editor/file_system/editor_file_system.h"

String AIToolRPC::write_file(const Dictionary &p_args) {
	String path = p_args.get("path", "");
	String content = p_args.get("content", "");
	bool binary = p_args.get("binary", false);

	if (path.is_empty()) {
		return "Error: 'path' argument is required.";
	}
	if (!path.begins_with("res://")) {
		path = "res://" + path;
	}

	// Ensure parent directory exists via editor API.
	String dir_path = path.get_base_dir();
	if (!DirAccess::dir_exists_absolute(dir_path)) {
		EditorFileSystem::get_singleton()->make_dir_recursive(dir_path);
	}

	Ref<FileAccess> f = FileAccess::open(path, FileAccess::WRITE);
	if (f.is_null()) {
		return "Error: Cannot write to file: " + path;
	}

	if (binary) {
		int decoded_len = content.length() * 3 / 4 + 4;
		PackedByteArray decoded;
		decoded.resize(decoded_len);
		size_t actual_len = 0;
		Error err = CryptoCore::b64_decode(decoded.ptrw(), decoded.size(), &actual_len,
				(const unsigned char *)content.utf8().get_data(), content.utf8().length());
		if (err != OK) {
			return "Error: Invalid base64 content.";
		}
		decoded.resize(actual_len);
		f->store_buffer(decoded);
	} else {
		f->store_string(content);
	}

	f.unref();
	EditorFileSystem::get_singleton()->update_file(path);

	return "Successfully wrote to " + path;
}
