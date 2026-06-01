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
	int start_line = p_args.get("start_line", 0); // 1-based, 0 means from beginning
	int end_line = p_args.get("end_line", 0); // 1-based, 0 means to end

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

	// 按行范围读取
	if (start_line > 0 || end_line > 0) {
		Vector<String> lines = content.split("\n");
		int total_lines = lines.size();
		int from = (start_line > 0) ? CLAMP(start_line - 1, 0, total_lines - 1) : 0;
		int to = (end_line > 0) ? CLAMP(end_line - 1, from, total_lines - 1) : (total_lines - 1);

		String result;
		for (int i = from; i <= to; i++) {
			result += itos(i + 1) + "\t" + lines[i];
			if (i < to) {
				result += "\n";
			}
		}

		// 添加元信息
		String meta = "(" + itos(to - from + 1) + " lines shown, " + itos(total_lines) + " total)";
		return meta + "\n" + result;
	}

	static const int MAX_CHARS = 50000;
	if (content.length() > MAX_CHARS) {
		// 计算总行数以便提示
		int total_lines = content.split("\n").size();
		content = content.substr(0, MAX_CHARS) + "\n... [truncated, file too large. Total lines: " + itos(total_lines) + ". Use start_line/end_line to read specific ranges.]";
	}
	return content;
}
