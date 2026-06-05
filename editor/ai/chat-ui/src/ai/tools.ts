/**
 * AI tool definitions for Fogot editor.
 *
 * Barrel file — re-exports all tools from category modules.
 * Category layout mirrors editor/ai/tools/ on the C++ side:
 *   tools/files.ts     → ai_tool_files.cpp
 *   tools/scene.ts     → ai_tool_scene.cpp
 *   tools/image.ts     → JS-side image operations
 *   tools/docs.ts      → class docs + debugger
 *   tools/plan.ts      → plan mode tools
 *   tools/delegate.ts  → sub-agent delegation
 *   tools/skill.ts     → skill loading
 */

export {
  readFile,
  writeFile,
  editFile,
  listFiles,
  deleteFile,
  copyFile,
  moveFile,
  searchFiles,
  executeCommand,
  writeFileOldContentCache,
  editFileLineCache,
} from './tools/files'

export {
  sceneListNodes,
  sceneGetNode,
  sceneCreateNode,
  sceneDeleteNode,
  sceneSetProperty,
  sceneReparentNode,
  sceneMoveChild,
  sceneGetClassDocs,
  sceneRun,
  sceneScreenshot,
} from './tools/scene'

export {
  cropImage,
  getImageInfo,
  generateImage,
} from './tools/image'

export {
  getClassDocs,
  getDebuggerErrors,
} from './tools/docs'

export {
  exitPlanMode,
  updatePlan,
} from './tools/plan'

export {
  delegateTask,
  configureDelegateTool,
} from './tools/delegate'

export {
  useSkill,
} from './tools/skill'

// ─── Tool Collections ─────────────────────────────────────────────

import {
  readFile,
  writeFile,
  editFile,
  listFiles,
  deleteFile,
  copyFile,
  moveFile,
  searchFiles,
  executeCommand,
} from './tools/files'

import {
  sceneListNodes,
  sceneGetNode,
  sceneCreateNode,
  sceneDeleteNode,
  sceneSetProperty,
  sceneReparentNode,
  sceneMoveChild,
  sceneGetClassDocs,
  sceneRun,
  sceneScreenshot,
} from './tools/scene'

import {
  cropImage,
  getImageInfo,
  generateImage,
} from './tools/image'

import {
  getClassDocs,
  getDebuggerErrors,
} from './tools/docs'

import {
  exitPlanMode,
  updatePlan,
} from './tools/plan'

import {
  delegateTask,
} from './tools/delegate'

import {
  useSkill,
} from './tools/skill'

export const allTools = {
  // File operations
  read_file: readFile,
  write_file: writeFile,
  edit_file: editFile,
  list_files: listFiles,
  delete_file: deleteFile,
  copy_file: copyFile,
  move_file: moveFile,
  search_files: searchFiles,
  execute_command: executeCommand,

  // Scene operations
  scene_list_nodes: sceneListNodes,
  scene_get_node: sceneGetNode,
  scene_create_node: sceneCreateNode,
  scene_delete_node: sceneDeleteNode,
  scene_set_property: sceneSetProperty,
  scene_reparent_node: sceneReparentNode,
  scene_move_child: sceneMoveChild,
  scene_get_class_docs: sceneGetClassDocs,
  scene_run: sceneRun,
  scene_screenshot: sceneScreenshot,

  // Image operations
  crop_image: cropImage,
  get_image_info: getImageInfo,
  generate_image: generateImage,

  // Docs & debug
  get_class_docs: getClassDocs,
  get_debugger_errors: getDebuggerErrors,

  // Plan mode
  exit_plan_mode: exitPlanMode,
  update_plan: updatePlan,

  // Delegation & skills
  delegate_task: delegateTask,
  use_skill: useSkill,
} as const

export type ToolName = keyof typeof allTools

export function getToolsForAgent(
  allowedNames?: string[],
): Record<string, (typeof allTools)[ToolName]> {
  if (!allowedNames || allowedNames.length === 0) return { ...allTools }
  const filtered: Record<string, (typeof allTools)[ToolName]> = {}
  for (const name of allowedNames) {
    if (name in allTools) {
      filtered[name] = allTools[name as ToolName]
    }
  }
  return filtered
}
