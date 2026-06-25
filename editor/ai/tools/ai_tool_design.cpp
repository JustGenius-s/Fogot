/**************************************************************************/
/* ai_tool_design.cpp                                                     */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"
#include "../shared/ai_shared_utils.h"

#include "core/io/dir_access.h"
#include "core/io/file_access.h"
#include "core/io/json.h"
#include "core/io/resource_loader.h"
#include "core/io/resource_saver.h"
#include "core/object/object.h"
#include "core/object/script_language.h"
#include "core/templates/hash_map.h"
#include "core/templates/local_vector.h"
#include "editor/file_system/editor_file_system.h"

// --- design_export_resource ---
//
// Turn a parsed design doc into a typed Godot Resource (.tres). The frontend
// generates a per-kind Resource script (`extends Resource` + @export vars) from
// the design schema and passes its path; here we instantiate that script, set
// the exported properties from the design's frontmatter fields, and save the
// resource so the game can `load()` it at runtime.

String AIToolRPC::design_export_resource(const Dictionary &p_args) {
	String tres_path = p_args.get("tres_path", "");
	String script_path = p_args.get("script_path", "");
	String fields_json = p_args.get("fields", "{}");

	if (tres_path.is_empty()) {
		return "Error: 'tres_path' is required.";
	}
	if (script_path.is_empty()) {
		return "Error: 'script_path' is required.";
	}
	normalize_project_path(tres_path);
	normalize_project_path(script_path);

	if (!FileAccess::exists(script_path)) {
		return "Error: Resource script not found at '" + script_path + "'.";
	}

	Variant parsed = JSON::parse_string(fields_json);
	if (parsed.get_type() != Variant::DICTIONARY) {
		return "Error: 'fields' must be a JSON object.";
	}
	Dictionary fields = parsed;

	Ref<Script> script = ResourceLoader::load(script_path, "Script");
	if (script.is_null()) {
		return "Error: Failed to load resource script '" + script_path + "'.";
	}

	Ref<Resource> res;
	res.instantiate();
	res->set_script(script);

	// Collect the script's exported property types for value coercion.
	HashMap<String, Variant::Type> prop_types;
	List<PropertyInfo> plist;
	res->get_property_list(&plist);
	for (const PropertyInfo &pi : plist) {
		if (pi.usage & PROPERTY_USAGE_SCRIPT_VARIABLE) {
			prop_types[pi.name] = pi.type;
		}
	}

	int set_count = 0;
	LocalVector<Variant> keys = fields.get_key_list();
	for (const Variant &k : keys) {
		const String name = k;
		if (!prop_types.has(name)) {
			continue; // Unknown field — kept in the .md but not in the typed resource.
		}
		const Variant::Type target = prop_types[name];
		Variant value = fields[k];

		// JSON arrays of strings -> PackedStringArray (tags / refs). The shared
		// coercion helper covers vector/int/float/color packed arrays but not
		// string ones, so handle that case explicitly here.
		if (target == Variant::PACKED_STRING_ARRAY && value.get_type() == Variant::ARRAY) {
			Array a = value;
			PackedStringArray out;
			for (int i = 0; i < a.size(); i++) {
				out.push_back(String(a[i]));
			}
			value = out;
		} else {
			value = coerce_json_to_type(value, target);
		}

		// Skip asset fields whose path could not be resolved into a resource
		// (a String left where an Object is expected).
		if (target == Variant::OBJECT && value.get_type() == Variant::STRING) {
			continue;
		}

		bool valid = false;
		res->set(name, value, &valid);
		if (valid) {
			set_count++;
		}
	}

	// Ensure the output directory exists.
	const String dir_path = tres_path.get_base_dir();
	if (!DirAccess::dir_exists_absolute(dir_path)) {
		EditorFileSystem::get_singleton()->make_dir_recursive(dir_path);
	}

	const Error err = ResourceSaver::save(res, tres_path);
	if (err != OK) {
		return "Error: Failed to save resource to '" + tres_path + "' (code " + itos(err) + ").";
	}

	EditorFileSystem::get_singleton()->update_file(tres_path);

	Dictionary result;
	result["success"] = true;
	result["path"] = tres_path;
	result["properties_set"] = set_count;
	return "OK: " + JSON::stringify(result);
}
