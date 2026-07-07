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
  sceneOpen,
  sceneGetSkeleton2dData,
  sceneSetBone2dRest,
  sceneCallMethod,
  sceneConnectSignal,
  sceneInstanceScene,
} from './tools/scene'

export {
  cropImage,
  getImageInfo,
  generateImage,
} from './tools/image'

export {
  getClassDocs,
  getDebuggerErrors,
  getScriptErrors,
} from './tools/docs'

export {
  exitPlanMode,
  updatePlan,
} from './tools/plan'

export {
  delegateTask,
  configureDelegateTool,
  configureParentThreadIdProvider,
  childThreadMap,
} from './tools/delegate'

export {
  useSkill,
} from './tools/skill'

export {
  writeDesign,
  syncDesign,
  designOldContentCache,
  designPathForSlug,
} from './tools/design'

export {
  writeKind,
  listKinds,
  kindPathForId,
} from './tools/kinds'

export {
  designVoiceTool,
  cloneVoiceTool,
  generateSpeechTool,
  generateMusicTool,
  listVoicesTool,
} from './tools/audio'

export {
  readImage,
} from './tools/image-read'

export {
  askUser,
} from './tools/question'

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
  sceneOpen,
  sceneGetSkeleton2dData,
  sceneSetBone2dRest,
  sceneCallMethod,
  sceneConnectSignal,
  sceneInstanceScene,
} from './tools/scene'

import {
  cropImage,
  getImageInfo,
  generateImage,
} from './tools/image'

import {
  getClassDocs,
  getDebuggerErrors,
  getScriptErrors,
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

import {
  writeDesign,
  syncDesign,
} from './tools/design'

import {
  writeKind,
  listKinds,
} from './tools/kinds'

import {
  designVoiceTool,
  cloneVoiceTool,
  generateSpeechTool,
  generateMusicTool,
  listVoicesTool,
} from './tools/audio'

import {
  readImage,
} from './tools/image-read'

import {
  askUser,
} from './tools/question'

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
  scene_open: sceneOpen,
  scene_get_skeleton2d_data: sceneGetSkeleton2dData,
  scene_set_bone2d_rest: sceneSetBone2dRest,
  scene_call_method: sceneCallMethod,
  scene_connect_signal: sceneConnectSignal,
  scene_instance_scene: sceneInstanceScene,

  // Image operations
  crop_image: cropImage,
  get_image_info: getImageInfo,
  generate_image: generateImage,

  // Docs & debug
  get_class_docs: getClassDocs,
  get_debugger_errors: getDebuggerErrors,
  get_script_errors: getScriptErrors,

  // Plan mode
  exit_plan_mode: exitPlanMode,
  update_plan: updatePlan,

  // Delegation & skills
  delegate_task: delegateTask,
  use_skill: useSkill,

  // Design mode
  write_design: writeDesign,
  sync_design: syncDesign,
  write_kind: writeKind,
  list_kinds: listKinds,

  // Audio mode
  design_voice: designVoiceTool,
  clone_voice: cloneVoiceTool,
  generate_speech: generateSpeechTool,
  generate_music: generateMusicTool,
  list_voices: listVoicesTool,

  // Image reading (multimodal)
  read_image: readImage,

  // Question
  ask_user: askUser,
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
