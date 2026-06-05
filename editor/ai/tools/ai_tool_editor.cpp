/**************************************************************************/
/* ai_tool_editor.cpp                                                     */
/**************************************************************************/
/* This file is part of:                                                  */
/*                          FOGOT ENGINE                                  */
/**************************************************************************/

#include "ai_tool_rpc.h"
#include "../shared/ai_shared_utils.h"

#include "core/io/json.h"
#include "editor/doc/editor_help.h"

String AIToolRPC::get_class_docs(const Dictionary &p_args) {
	String class_name = p_args.get("class_name", "");
	bool list_classes = p_args.get("list_classes", false);
	bool brief = p_args.get("brief", false);

	DocTools *doc_data = EditorHelp::get_doc_data();
	if (!doc_data) {
		return "Error: Documentation not yet loaded.";
	}

	// Mode 1: List all available class names.
	if (list_classes) {
		Array names;
		for (const KeyValue<String, DocData::ClassDoc> &E : doc_data->class_list) {
			names.push_back(E.key);
		}
		names.sort();

		Dictionary result;
		result["total"] = names.size();
		result["classes"] = names;
		return JSON::stringify(result);
	}

	// Mode 2: Get documentation for a specific class.
	if (class_name.is_empty()) {
		return "Error: 'class_name' is required (or set list_classes=true to list all classes).";
	}

	if (!doc_data->class_list.has(class_name)) {
		// Try case-insensitive search.
		String found;
		for (const KeyValue<String, DocData::ClassDoc> &E : doc_data->class_list) {
			if (E.key.to_lower() == class_name.to_lower()) {
				found = E.key;
				break;
			}
		}
		if (found.is_empty()) {
			return "Error: Class '" + class_name + "' not found. Use list_classes=true to see available classes.";
		}
		class_name = found;
	}

	const DocData::ClassDoc &cls = doc_data->class_list[class_name];

	Dictionary result;
	result["name"] = cls.name;
	if (!cls.inherits.is_empty()) {
		result["inherits"] = cls.inherits;
	}
	if (!cls.brief_description.is_empty()) {
		result["brief_description"] = strip_bbcode(cls.brief_description);
	}

	// Brief mode: return just the overview without detailed descriptions.
	if (brief) {
		// Properties: name + type only.
		if (!cls.properties.is_empty()) {
			Array props;
			for (const DocData::PropertyDoc &p : cls.properties) {
				props.push_back(p.type + " " + p.name);
			}
			result["properties"] = props;
		}
		// Methods: signatures only.
		if (!cls.methods.is_empty()) {
			Array methods;
			for (const DocData::MethodDoc &m : cls.methods) {
				methods.push_back(format_method_sig(m));
			}
			result["methods"] = methods;
		}
		// Signals: names only.
		if (!cls.signals.is_empty()) {
			Array signals;
			for (const DocData::MethodDoc &s : cls.signals) {
				signals.push_back(format_method_sig(s));
			}
			result["signals"] = signals;
		}
		return JSON::stringify(result);
	}

	// Full mode: include descriptions.
	if (!cls.description.is_empty()) {
		result["description"] = strip_bbcode(cls.description);
	}

	// Properties.
	if (!cls.properties.is_empty()) {
		Array props;
		for (const DocData::PropertyDoc &p : cls.properties) {
			Dictionary pd;
			pd["name"] = p.name;
			pd["type"] = p.type;
			if (!p.default_value.is_empty()) {
				pd["default"] = p.default_value;
			}
			if (!p.description.is_empty()) {
				pd["description"] = strip_bbcode(p.description);
			}
			props.push_back(pd);
		}
		result["properties"] = props;
	}

	// Methods.
	if (!cls.methods.is_empty()) {
		Array methods;
		for (const DocData::MethodDoc &m : cls.methods) {
			Dictionary md;
			md["signature"] = format_method_sig(m);
			if (!m.description.is_empty()) {
				md["description"] = strip_bbcode(m.description);
			}
			methods.push_back(md);
		}
		result["methods"] = methods;
	}

	// Signals.
	if (!cls.signals.is_empty()) {
		Array signals;
		for (const DocData::MethodDoc &s : cls.signals) {
			Dictionary sd;
			sd["signature"] = format_method_sig(s);
			if (!s.description.is_empty()) {
				sd["description"] = strip_bbcode(s.description);
			}
			signals.push_back(sd);
		}
		result["signals"] = signals;
	}

	// Constants & enums.
	if (!cls.constants.is_empty()) {
		Array constants;
		for (const DocData::ConstantDoc &c : cls.constants) {
			Dictionary cd;
			cd["name"] = c.name;
			if (!c.value.is_empty()) {
				cd["value"] = c.value;
			}
			if (!c.enumeration.is_empty()) {
				cd["enum"] = c.enumeration;
			}
			if (!c.description.is_empty()) {
				cd["description"] = strip_bbcode(c.description);
			}
			constants.push_back(cd);
		}
		result["constants"] = constants;
	}

	return JSON::stringify(result);
}
