/**************************************************************************/
/* ai_tool_list_assets.cpp                                                */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"

#include "core/io/dir_access.h"
#include "core/io/file_access.h"
#include "core/io/json.h"

namespace {

const int MAX_ASSETS = 1000;

bool is_image_ext(const String &p_ext) {
	static const char *kImageExts[] = { "png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "tga", nullptr };
	for (int i = 0; kImageExts[i]; i++) {
		if (p_ext == kImageExts[i]) {
			return true;
		}
	}
	return false;
}

void collect_assets(const String &p_dir_path, Array &p_out, bool p_recursive, int p_depth) {
	if (p_out.size() >= MAX_ASSETS || p_depth > 10) {
		return;
	}

	Ref<DirAccess> d = DirAccess::open(p_dir_path);
	if (d.is_null()) {
		return;
	}

	Vector<String> subdirs;
	d->list_dir_begin();
	String item = d->get_next();
	while (!item.is_empty()) {
		if (item == "." || item == ".." || item.begins_with(".godot") || item.begins_with(".import")) {
			item = d->get_next();
			continue;
		}
		if (d->current_is_dir()) {
			subdirs.push_back(item);
		} else if (is_image_ext(item.get_extension().to_lower())) {
			if (p_out.size() >= MAX_ASSETS) {
				break;
			}
			String full_path = p_dir_path.path_join(item);
			uint64_t size = 0;
			Ref<FileAccess> f = FileAccess::open(full_path, FileAccess::READ);
			if (f.is_valid()) {
				size = f->get_length();
			}
			Dictionary entry;
			entry["path"] = full_path;
			entry["name"] = item;
			entry["ext"] = item.get_extension().to_lower();
			entry["size"] = (int64_t)size;
			p_out.push_back(entry);
		}
		item = d->get_next();
	}
	d->list_dir_end();

	if (p_recursive) {
		subdirs.sort();
		for (const String &sd : subdirs) {
			collect_assets(p_dir_path.path_join(sd), p_out, p_recursive, p_depth + 1);
		}
	}
}

} // anonymous namespace

String AIToolRPC::list_assets(const Dictionary &p_args) {
	String dir = p_args.get("dir", "res://assets/");
	bool recursive = p_args.get("recursive", true);

	if (dir.is_empty()) {
		dir = "res://assets/";
	}
	if (!dir.begins_with("res://")) {
		dir = "res://" + dir;
	}

	Dictionary result;
	result["dir"] = dir;

	bool exists = DirAccess::dir_exists_absolute(dir);
	result["exists"] = exists;

	Array assets;
	if (exists) {
		collect_assets(dir, assets, recursive, 0);
	}
	result["assets"] = assets;

	return JSON::stringify(result);
}
