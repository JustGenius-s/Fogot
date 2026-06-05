/**
 * Scene-editing tools — delegates to C++ via bridge RPC.
 *
 * Corresponds to editor/ai/tools/ai_tool_scene.cpp.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { bridgeRPC } from '@/bridge'

export const sceneListNodes = tool({
  description: [
    'List the current scene node tree as structured JSON.',
    'Returns node hierarchy with key properties (type, path, visibility, children).',
    'Use this to understand the scene structure before editing nodes.',
  ].join('\n'),
  inputSchema: z.object({
    path: z.string().optional().describe('Subtree root path relative to scene root. Defaults to scene root (".").'),
  }),
  execute: async (args) => bridgeRPC('scene_list_nodes', args),
})

export const sceneGetNode = tool({
  description: [
    'Get detailed information about a specific node in the scene.',
    'Returns properties, groups, signals, script info, and method list.',
  ].join('\n'),
  inputSchema: z.object({
    path: z.string().describe('Node path relative to scene root.'),
  }),
  execute: async (args) => bridgeRPC('scene_get_node', args),
})

export const sceneCreateNode = tool({
  description: [
    'Create a new node in the scene (undoable).',
    'The node is added as a child of the specified parent.',
    'Use scene_list_nodes first to find the right parent path.',
  ].join('\n'),
  inputSchema: z.object({
    parent_path: z.string().describe('Parent node path relative to scene root.'),
    node_type: z.string().describe('Godot class name for the new node (e.g. "Node2D", "Sprite2D").'),
    node_name: z.string().describe('Name for the new node.'),
  }),
  execute: async (args) => bridgeRPC('scene_create_node', args),
})

export const sceneDeleteNode = tool({
  description: [
    'Delete a node from the scene (undoable).',
    'Only use when the user explicitly asks to delete a node.',
  ].join('\n'),
  inputSchema: z.object({
    path: z.string().describe('Node path relative to scene root.'),
  }),
  execute: async (args) => bridgeRPC('scene_delete_node', args),
})

export const sceneSetProperty = tool({
  description: [
    'Set a property value on a node (undoable).',
    'The value is JSON-encoded — use string quotes for string values.',
    'Examples: `"Hello"`, `42`, `true`, `[1,2,3]`, `{"x":0,"y":0}`.',
  ].join('\n'),
  inputSchema: z.object({
    path: z.string().describe('Node path relative to scene root.'),
    property: z.string().describe('Property name (e.g. "position", "modulate", "text").'),
    value: z.string().describe('JSON-encoded value. Use quotes for strings, no quotes for numbers/booleans.'),
  }),
  execute: async (args) => bridgeRPC('scene_set_property', args),
})

export const sceneReparentNode = tool({
  description: [
    'Reparent a node to a different parent in the scene (undoable).',
    'The node keeps its transform relative to the new parent.',
  ].join('\n'),
  inputSchema: z.object({
    path: z.string().describe('Node path relative to scene root.'),
    new_parent_path: z.string().describe('New parent node path relative to scene root.'),
  }),
  execute: async (args) => bridgeRPC('scene_reparent_node', args),
})

export const sceneMoveChild = tool({
  description: [
    'Move a node within its parent\'s child order.',
    'Use to reorder UI elements, Node2D siblings, etc.',
  ].join('\n'),
  inputSchema: z.object({
    path: z.string().describe('Node path relative to scene root.'),
    to_position: z.number().describe('Target index in the parent\'s child list (0-based).'),
  }),
  execute: async (args) => bridgeRPC('scene_move_child', args),
})

export const sceneGetClassDocs = tool({
  description: [
    'Get class documentation for a scene node (convenience — auto-detects the node\'s class).',
    'Returns the same format as get_class_docs but you don\'t need to know the class name.',
  ].join('\n'),
  inputSchema: z.object({
    path: z.string().describe('Node path relative to scene root.'),
  }),
  execute: async (args) => bridgeRPC('scene_get_class_docs', args),
})

export const sceneRun = tool({
  description: [
    'Run a specific scene file, or re-run the currently running scene.',
    'Calling with the same scene that is already running will reload it.',
    'Use scene_screenshot afterwards to capture the running game.',
  ].join('\n'),
  inputSchema: z.object({
    scene_path: z.string().optional().describe('Absolute path to the scene file (e.g. "res://scenes/main.tscn"). If omitted, runs the currently open scene.'),
  }),
  execute: async (args) => bridgeRPC('scene_run', args),
})

export const sceneScreenshot = tool({
  description: [
    'Take a screenshot of the currently running scene and save it as a PNG.',
    'Returns JSON with width, height, and the saved file path.',
    'The scene must already be running (use run_scene first).',
  ].join('\n'),
  inputSchema: z.object({
    output_path: z.string().optional().describe('Output path for the screenshot PNG (e.g. "res://screenshots/capture.png"). If omitted, saves to a system temp path.'),
  }),
  execute: async (args) => bridgeRPC('scene_screenshot', args),
})
