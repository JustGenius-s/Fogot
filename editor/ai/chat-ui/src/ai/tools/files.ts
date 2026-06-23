/**
 * File-system tools — delegates to C++ via bridge RPC.
 *
 * Corresponds to editor/ai/tools/ai_tool_files.cpp.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { bridgeRPC } from '@/bridge'

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

/** Cache of old file content before write, keyed by path. Persisted so diffs survive restarts. */
export const writeFileOldContentCache = new Map<string, string>()

{
  // Restore from localStorage on module init
  try {
    const raw = localStorage.getItem('fogot-file-write-cache')
    if (raw) {
      const data = JSON.parse(raw)
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string') writeFileOldContentCache.set(k, v)
      }
    }
  } catch {}
}

function persistWriteCache(path: string, content: string) {
  writeFileOldContentCache.set(path, content)
  try {
    const data: Record<string, string> = {}
    for (const [k, v] of writeFileOldContentCache) data[k] = v
    localStorage.setItem('fogot-file-write-cache', JSON.stringify(data))
  } catch {}
}

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
        persistWriteCache(args.path, old)
      } catch {
        persistWriteCache(args.path, '')
      }
    }
    return bridgeRPC('write_file', args)
  },
})

/** Cache of edit location info, keyed by path. Persisted so diffs survive restarts. */
export const editFileLineCache = new Map<string, number>()

{
  try {
    const raw = localStorage.getItem('fogot-file-edit-cache')
    if (raw) {
      const data = JSON.parse(raw)
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'number') editFileLineCache.set(k, v)
      }
    }
  } catch {}
}

function persistEditCache(path: string, line: number) {
  editFileLineCache.set(path, line)
  try {
    const data: Record<string, number> = {}
    for (const [k, v] of editFileLineCache) data[k] = v
    localStorage.setItem('fogot-file-edit-cache', JSON.stringify(data))
  } catch {}
}

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
        persistEditCache(args.path, linesBefore.length)
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
  description: 'Copy a file to a new location in the Godot project. Creates directories as needed.',
  inputSchema: z.object({
    source: z.string().describe('Source res:// path'),
    destination: z.string().describe('Destination res:// path'),
  }),
  execute: async (args) => bridgeRPC('copy_file', args),
})

export const moveFile = tool({
  description: 'Move (rename) a file to a new location in the Godot project. Creates directories as needed.',
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
    path: z.string().optional().describe('Directory to search in (default: res://)'),
    case_sensitive: z.boolean().optional().describe('Case-sensitive search (default: false)'),
    file_pattern: z.string().optional().describe('Filter by file extension, e.g. "*.gd" or "*.tscn"'),
  }),
  execute: async (args) => bridgeRPC('search_files', args),
})

export const executeCommand = tool({
  description: [
    'Execute a shell command in the Godot project directory. Returns stdout+stderr and exit code.',
    'Commands run asynchronously — the editor stays responsive during execution.',
    'Multiple commands can run in parallel.',
    'Rules:',
    '- Only use for operations that genuinely require shell execution (git, build tools, running scripts)',
    '- Do NOT use for: reading files (use read_file), searching (use search_files), listing dirs (use list_files)',
    '- Be cautious with destructive commands',
  ].join('\n'),
  inputSchema: z.object({
    command: z.string().describe('Shell command to execute'),
  }),
  execute: async (args) => bridgeRPC('execute_command', args),
})
