/**
 * AI tool definitions for Fogot editor.
 *
 * - read_file / write_file / list_files: delegate to C++ via bridge RPC
 * - crop_image / get_image_info: pure JS (Canvas/Image API + RPC for file I/O)
 * - generate_image: JS-side API call + RPC for file write
 */

import { tool } from 'ai'
import { z } from 'zod'
import { bridgeRPC } from '@/bridge'
import { getDebuggerErrors as getDebuggerErrorBuffer, clearDebuggerErrors } from '@/bridge'
import { getMimeFromPath, loadImage, generateImageAsset } from '@/lib/image-gen'

// ─── Enhanced Tool Descriptions ───────────────────────────────────
// Tool descriptions are always in English (part of API schema, all models understand).
// Language switching only affects the system prompt in agents.ts.

// ─── C++ RPC Tools (filesystem primitives) ───────────────────────

export const readFile = tool({
  description: [
    'Read a file from the Godot project. Returns text content, or base64 if binary mode.',
    'Always read a file before editing it.',
    'For large files, use start_line/end_line to read specific ranges instead of the entire file.',
    'When a file is truncated, the output will indicate total line count — use line ranges to read the rest.',
  ].join(' '),
  inputSchema: z.object({
    path: z.string().describe('The res:// path to read'),
    binary: z.boolean().optional().describe('If true, returns base64-encoded content'),
    start_line: z.number().optional().describe('Start reading from this line number (1-based, inclusive)'),
    end_line: z.number().optional().describe('Stop reading at this line number (1-based, inclusive)'),
  }),
  execute: async (args) => bridgeRPC('read_file', args),
})

/**
 * Cache of old file content before write, keyed by path.
 * Used by the write_file Tool UI to render diffs.
 */
export const writeFileOldContentCache = new Map<string, string>()

export const writeFile = tool({
  description: [
    'Write content to a file in the Godot project. Creates directories as needed.',
    'Rules:',
    '- Use edit_file for partial modifications (preferred over rewriting the whole file)',
    '- Only use write_file for creating NEW files or complete rewrites',
    '- ALWAYS prefer editing existing files over creating new ones',
  ].join('\n'),
  inputSchema: z.object({
    path: z.string().describe('The res:// path to write'),
    content: z.string().describe('Text content, or base64 for binary mode'),
    binary: z.boolean().optional().describe('If true, content is base64-encoded'),
  }),
  execute: async (args) => {
    if (!args.binary) {
      try {
        const old = await bridgeRPC('read_file', { path: args.path })
        writeFileOldContentCache.set(args.path, old)
      } catch {
        writeFileOldContentCache.set(args.path, '')
      }
    }
    return bridgeRPC('write_file', args)
  },
})

/**
 * Cache of edit location info, keyed by path.
 * Stores the 1-based start line of the last edit_file old_string match.
 */
export const editFileLineCache = new Map<string, number>()

export const editFile = tool({
  description: [
    'Edit a file by replacing a unique string with new content. More efficient than write_file for partial changes.',
    'Rules:',
    '- You MUST read the file first before editing.',
    '- The old_string must match exactly one location in the file. Include enough surrounding context (2-4 lines) to make it unique.',
    '- Preserve exact indentation (tabs/spaces) as it appears in the file.',
    '- ALWAYS prefer edit_file over write_file when only changing part of a file.',
    '- If old_string is not unique, include more context to disambiguate.',
  ].join('\n'),
  inputSchema: z.object({
    path: z.string().describe('The res:// path to edit'),
    old_string: z.string().describe('The exact text to find (must be unique in the file). Include 2-4 lines of surrounding context.'),
    new_string: z.string().describe('The replacement text. Preserve original indentation.'),
  }),
  execute: async (args) => {
    try {
      const content = await bridgeRPC('read_file', { path: args.path })
      const idx = content.indexOf(args.old_string)
      if (idx >= 0) {
        const linesBefore = content.slice(0, idx).split('\n')
        editFileLineCache.set(args.path, linesBefore.length)
      }
    } catch { /* file unreadable, skip */ }
    return bridgeRPC('edit_file', args)
  },
})

export const listFiles = tool({
  description: 'List files in a Godot project directory. Use recursive option to explore subdirectories.',
  inputSchema: z.object({
    path: z.string().describe('The res:// directory path'),
    recursive: z.boolean().optional().describe('List files recursively'),
  }),
  execute: async (args) => bridgeRPC('list_files', args),
})

export const deleteFile = tool({
  description: 'Delete a file or empty directory from the Godot project. Only use when the user explicitly asks to delete.',
  inputSchema: z.object({
    path: z.string().describe('The res:// path to delete'),
  }),
  execute: async (args) => bridgeRPC('delete_file', args),
})

export const copyFile = tool({
  description:
    'Copy a file to a new location in the Godot project. Creates directories as needed.',
  inputSchema: z.object({
    source: z.string().describe('Source res:// path'),
    destination: z.string().describe('Destination res:// path'),
  }),
  execute: async (args) => bridgeRPC('copy_file', args),
})

export const moveFile = tool({
  description:
    'Move (rename) a file to a new location in the Godot project. Creates directories as needed.',
  inputSchema: z.object({
    source: z.string().describe('Source res:// path'),
    destination: z.string().describe('Destination res:// path'),
  }),
  execute: async (args) => bridgeRPC('move_file', args),
})

export const searchFiles = tool({
  description: [
    'Search for text content within project files (grep-like). Returns matching lines with file paths and line numbers.',
    'Tips:',
    '- Use file_pattern to narrow scope (e.g. "*.gd" for scripts only)',
    '- Start broad, then narrow down if too many results',
    '- Try multiple search terms if the first does not yield results',
  ].join('\n'),
  inputSchema: z.object({
    query: z.string().describe('Text or pattern to search for'),
    path: z
      .string()
      .optional()
      .describe('Directory to search in (default: res://)'),
    case_sensitive: z
      .boolean()
      .optional()
      .describe('Case-sensitive search (default: false)'),
    file_pattern: z
      .string()
      .optional()
      .describe('Filter by file extension, e.g. "*.gd" or "*.tscn"'),
  }),
  execute: async (args) => bridgeRPC('search_files', args),
})

export const executeCommand = tool({
  description: [
    'Execute a shell command in the Godot project directory. Returns stdout+stderr and exit code.',
    'Rules:',
    '- Only use for operations that genuinely require shell execution (git, build tools, running scripts)',
    '- Do NOT use for: reading files (use read_file), searching (use search_files), listing dirs (use list_files)',
    '- Be cautious with destructive commands',
  ].join('\n'),
  inputSchema: z.object({
    command: z.string().describe('Shell command to execute'),
    timeout_ms: z
      .number()
      .optional()
      .describe('Timeout in milliseconds (default: 30000, max: 120000)'),
  }),
  execute: async (args) => bridgeRPC('execute_command', args),
})

// ─── Pure JS Tools ────────────────────────────────────────────────

export const cropImage = tool({
  description: 'Crop a rectangular region from a project image and save it.',
  inputSchema: z.object({
    path: z.string().describe('Source image res:// path'),
    x: z.number().describe('X offset'),
    y: z.number().describe('Y offset'),
    w: z.number().describe('Width'),
    h: z.number().describe('Height'),
    output: z.string().describe('Output res:// path'),
  }),
  execute: async ({ path, x, y, w, h, output }) => {
    const base64 = await bridgeRPC('read_file', { path, binary: true })
    const img = await loadImage(base64, getMimeFromPath(path))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h)

    const outMime = getMimeFromPath(output)
    const dataUrl = canvas.toDataURL(outMime)
    const outBase64 = dataUrl.split(',')[1]!
    await bridgeRPC('write_file', { path: output, content: outBase64, binary: true })

    return JSON.stringify({ success: true, path: output, width: w, height: h })
  },
})

export const getImageInfo = tool({
  description: 'Get dimensions and format of a project image file.',
  inputSchema: z.object({
    path: z.string().describe('Image res:// path'),
  }),
  execute: async ({ path }) => {
    const base64 = await bridgeRPC('read_file', { path, binary: true })
    const img = await loadImage(base64, getMimeFromPath(path))
    return JSON.stringify({
      width: img.naturalWidth,
      height: img.naturalHeight,
      format: path.split('.').pop()?.toLowerCase(),
      path,
    })
  },
})

export const generateImage = tool({
  description: 'Generate an image using AI and save it to the project.',
  inputSchema: z.object({
    prompt: z.string().describe('Text prompt for image generation'),
    output: z.string().describe('Output res:// path'),
    size: z
      .string()
      .optional()
      .describe('Aspect ratio (e.g. "16:9", "1:1") or pixel size (e.g. "1024x1024")'),
    resolution: z
      .string()
      .optional()
      .describe('Resolution tier: "1k", "2k", or "4k"'),
    quality: z
      .string()
      .optional()
      .describe('Quality: "auto", "low", "medium", or "high"'),
    reference_image: z
      .string()
      .optional()
      .describe('Optional reference image res:// path for img2img'),
  }),
  execute: async ({ prompt, output, size, resolution, quality, reference_image }) => {
    const result = await generateImageAsset({
      prompt,
      output,
      size,
      resolution,
      quality,
      referenceImage: reference_image,
    })
    if (!result.success) {
      return JSON.stringify({ error: result.error })
    }
    return JSON.stringify({
      success: true,
      path: result.path,
      revised_prompt: result.revisedPrompt,
    })
  },
})

export const getClassDocs = tool({
  description: [
    'Query built-in Godot class documentation. Use this to look up API details for any engine class.',
    'Three modes:',
    '- list_classes=true: Returns all available class names',
    '- class_name + brief=true: Returns a compact overview (signatures only, no descriptions)',
    '- class_name only: Returns full documentation with descriptions',
    'Use brief mode first to get an overview, then query full docs if you need method details.',
  ].join('\n'),
  inputSchema: z.object({
    class_name: z
      .string()
      .optional()
      .describe('The class name to look up (e.g. "Node2D", "CharacterBody2D")'),
    list_classes: z
      .boolean()
      .optional()
      .describe('If true, returns a list of all available class names'),
    brief: z
      .boolean()
      .optional()
      .describe('If true, returns a compact overview without descriptions'),
  }),
  execute: async (args) => bridgeRPC('get_class_docs', args),
})

export const getDebuggerErrors = tool({
  description:
    'Get runtime errors and warnings from the Godot debugger. Use this to diagnose issues when the game is running or has just crashed.',
  inputSchema: z.object({
    max_count: z
      .number()
      .optional()
      .describe('Maximum number of errors to return (default: 50)'),
    errors_only: z
      .boolean()
      .optional()
      .describe('If true, filter out warnings and return only errors'),
    clear: z
      .boolean()
      .optional()
      .describe('If true, clear the error buffer after reading'),
  }),
  execute: async ({ max_count, errors_only, clear }) => {
    let errors = getDebuggerErrorBuffer()
    if (errors_only) {
      errors = errors.filter((e) => e.type === 'error')
    }
    const limit = max_count ?? 50
    const result = errors.slice(-limit)
    if (clear) {
      clearDebuggerErrors()
    }
    return JSON.stringify({
      total: errors.length,
      returned: result.length,
      errors: result,
    })
  },
})

// ─── Plan Mode Tool ───────────────────────────────────────────────

export const exitPlanMode = tool({
  description:
    'Signal that the plan is complete and ready for user approval. ' +
    'You MUST call this tool after writing your plan. ' +
    'Include the plan steps for progress tracking.',
  inputSchema: z.object({
    plan_summary: z
      .string()
      .describe('Brief one-line summary of the plan (shown in the approval header)'),
    steps: z.array(
      z.string().describe('Step title (concise, actionable)'),
    ).min(1).describe('Implementation steps from the plan, in execution order'),
  }),
  execute: async ({ plan_summary, steps }) => {
    return JSON.stringify({ summary: plan_summary, steps })
  },
})

// ─── Plan Execution Tool ──────────────────────────────────────────

import { getActivePlan, updatePlanStep } from '@/bridge'

export const updatePlan = tool({
  description:
    'Update the progress of the active plan. Call this after completing or starting each step.',
  inputSchema: z.object({
    step_index: z.number().describe('Zero-based index of the step to update'),
    status: z.enum(['in_progress', 'done', 'skipped']).describe('New status for the step'),
  }),
  execute: async ({ step_index, status }) => {
    const plan = getActivePlan()
    if (!plan) return JSON.stringify({ error: 'No active plan' })
    if (step_index < 0 || step_index >= plan.steps.length) {
      return JSON.stringify({ error: `Invalid step index: ${step_index}. Plan has ${plan.steps.length} steps.` })
    }
    updatePlanStep(step_index, status)
    const updated = getActivePlan()!
    const done = updated.steps.filter((s) => s.status === 'done').length
    return JSON.stringify({
      success: true,
      step: updated.steps[step_index].title,
      progress: `${done}/${updated.steps.length} steps done`,
    })
  },
})

// ─── Sub-agent delegation ─────────────────────────────────────────

import { delegateTask } from './delegate-tool'

import { useSkill } from './skill-tool'

// ─── Tool Collections ─────────────────────────────────────────────

export const allTools = {
  read_file: readFile,
  write_file: writeFile,
  edit_file: editFile,
  list_files: listFiles,
  delete_file: deleteFile,
  copy_file: copyFile,
  move_file: moveFile,
  search_files: searchFiles,
  execute_command: executeCommand,
  crop_image: cropImage,
  get_image_info: getImageInfo,
  generate_image: generateImage,
  get_class_docs: getClassDocs,
  get_debugger_errors: getDebuggerErrors,
  exit_plan_mode: exitPlanMode,
  update_plan: updatePlan,
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
