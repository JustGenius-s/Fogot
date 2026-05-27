/**
 * AI tool definitions for Fogot editor.
 *
 * - read_file / write_file / list_files: delegate to C++ via bridge RPC
 * - crop_image / get_image_info: pure JS (Canvas/Image API + RPC for file I/O)
 * - generate_image: JS-side API call + RPC for file write
 */

import { tool } from 'ai'
import { z } from 'zod'
import { bridgeRPC, getImageModels } from '@/bridge'

// ─── C++ RPC Tools (filesystem primitives) ───────────────────────

export const readFile = tool({
  description:
    'Read a file from the Godot project. Returns text content, or base64 if binary mode.',
  inputSchema: z.object({
    path: z.string().describe('The res:// path to read'),
    binary: z.boolean().optional().describe('If true, returns base64-encoded content'),
  }),
  execute: async (args) => bridgeRPC('read_file', args),
})

/**
 * Cache of old file content before write, keyed by path.
 * Used by the write_file Tool UI to render diffs.
 */
export const writeFileOldContentCache = new Map<string, string>()

export const writeFile = tool({
  description:
    'Write content to a file in the Godot project. Creates directories as needed. Use edit_file for partial modifications.',
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

export const editFile = tool({
  description:
    'Edit a file by replacing a unique string with new content. More efficient than write_file for partial changes. The old_string must match exactly one location in the file.',
  inputSchema: z.object({
    path: z.string().describe('The res:// path to edit'),
    old_string: z.string().describe('The exact text to find (must be unique in the file)'),
    new_string: z.string().describe('The replacement text'),
  }),
  execute: async (args) => bridgeRPC('edit_file', args),
})

export const listFiles = tool({
  description: 'List files in a Godot project directory.',
  inputSchema: z.object({
    path: z.string().describe('The res:// directory path'),
    recursive: z.boolean().optional().describe('List files recursively'),
  }),
  execute: async (args) => bridgeRPC('list_files', args),
})

export const deleteFile = tool({
  description:
    'Delete a file or empty directory from the Godot project.',
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
  description:
    'Search for text content within project files (grep-like). Returns matching lines with file paths and line numbers.',
  inputSchema: z.object({
    query: z.string().describe('Text to search for'),
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
      .describe('Filter by file extension, e.g. "*.gd" or ".tscn"'),
  }),
  execute: async (args) => bridgeRPC('search_files', args),
})

export const executeCommand = tool({
  description:
    'Execute a shell command in the Godot project directory. Use for running scripts, git operations, build tools, etc. Returns stdout+stderr and exit code.',
  inputSchema: z.object({
    command: z.string().describe('Shell command to execute'),
    timeout_ms: z
      .number()
      .optional()
      .describe('Timeout in milliseconds (default: 30000, max: 120000)'),
  }),
  execute: async (args) => bridgeRPC('execute_command', args),
})

// ─── Helpers ──────────────────────────────────────────────────────

function getMimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? 'png'
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
  }
  return map[ext] ?? 'image/png'
}

function loadImage(base64: string, mime: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:${mime};base64,${base64}`
  })
}

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
      .describe('Image size, e.g. "1024x1024" (default)'),
    reference_image: z
      .string()
      .optional()
      .describe('Optional reference image res:// path for img2img'),
  }),
  execute: async ({ prompt, output, size, reference_image }) => {
    const imageModels = getImageModels()
    const imgModel = imageModels[0]

    if (!imgModel || !imgModel.apiKey || !imgModel.apiEndpoint || !imgModel.model) {
      return JSON.stringify({
        error:
          'No image model configured. Add an "image" type model in Editor Settings → AI → Models.',
      })
    }

    try {
      const body: Record<string, unknown> = {
        model: imgModel.model,
        prompt,
        n: 1,
        size: size || '1024x1024',
        response_format: 'b64_json',
      }

      if (reference_image) {
        const refBase64 = await bridgeRPC('read_file', {
          path: reference_image,
          binary: true,
        })
        body.image = refBase64
      }

      const url = `${imgModel.apiEndpoint.replace(/\/+$/, '')}/images/generations`
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${imgModel.apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        return JSON.stringify({ error: `API request failed (${resp.status}): ${errText}` })
      }

      const result = await resp.json()
      const imageB64: string | undefined = result.data?.[0]?.b64_json
      if (!imageB64) {
        return JSON.stringify({ error: 'No image data in API response', raw: result })
      }

      await bridgeRPC('write_file', {
        path: output,
        content: imageB64,
        binary: true,
      })

      return JSON.stringify({
        success: true,
        path: output,
        revised_prompt: result.data?.[0]?.revised_prompt,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return JSON.stringify({ error: `Image generation failed: ${msg}` })
    }
  },
})

// ─── Sub-agent delegation ─────────────────────────────────────────

import { delegateTask } from './delegate-tool'

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
  delegate_task: delegateTask,
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
