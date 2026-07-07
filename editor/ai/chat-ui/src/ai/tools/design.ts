/**
 * Design-mode tool — write a design document into res://.design/.
 *
 * Design docs are Markdown files with a YAML frontmatter header. The model
 * authors the full file content; this tool normalizes the slug into a
 * res://.design/<slug>.md path and persists it via the C++ write_file RPC.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { parse as parseYaml } from 'yaml'
import { bridgeRPC } from '@/bridge'
import { DESIGN_DIR, parseDesign, syncDesignToResource } from '@/lib/designs'
import { validateDesign } from '@/lib/design-schema'
import { loadDesignBible, validateAgainstBible, bibleHasContent } from '@/lib/design-bible'

/** Old content before a design write, keyed by path (for inline diff/card). */
export const designOldContentCache = new Map<string, string>()

/**
 * Strict frontmatter check — returns a human-readable error string when the
 * content is not a valid design doc (missing frontmatter fence or unparseable
 * YAML), or `null` when it parses cleanly. Used by write_design so the model
 * gets an explicit error to self-correct instead of a silently empty meta.
 */
function checkDesignFormat(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed.startsWith('---')) {
    return '文件必须以 YAML frontmatter 块开头（第一行应为 `---`），当前内容没有 frontmatter。'
  }
  const m = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) {
    return 'frontmatter 块不完整——缺少结束的 `---` 行。正确格式：`---\\n<yaml>\\n---\\n<markdown 正文>`。'
  }
  try {
    const parsed = parseYaml(m[1])
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return 'frontmatter 必须是一个 YAML mapping（键值对），当前解析结果不是对象。'
    }
    const meta = parsed as Record<string, unknown>
    if (!meta.name || (typeof meta.name === 'string' && !meta.name.trim())) {
      return 'frontmatter 缺少必填字段 `name`。'
    }
    if (!meta.type || (typeof meta.type === 'string' && !meta.type.trim())) {
      return 'frontmatter 缺少必填字段 `type`（如 character/item/skill/enemy/level 或项目自定义 kind）。'
    }
  } catch (e) {
    return `YAML 解析失败：${e instanceof Error ? e.message : String(e)}。请检查缩进（用空格不用 tab）、引号、数组/嵌套语法。`
  }
  return null
}

/** Normalize a user/LLM-supplied slug into a `res://.design/<slug>.md` path. */
export function designPathForSlug(slug: string): string {
  const base = slug
    .trim()
    .replace(/^res:\/\//, '')
    .replace(/^\.design\//, '')
    .replace(/\.md$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'untitled'
  return `${DESIGN_DIR}${base}.md`
}

export const writeDesign = tool({
  description: [
    'Create or overwrite a design document under res://.design/.',
    'A design doc is a Markdown file whose header is a YAML frontmatter block',
    '(name and type are required) followed by Markdown prose.',
    'Rules:',
    '- Use this tool (not write_file) for design documents.',
    '- To revise an existing design, read_file it first, then call write_design with the full updated content.',
    '- The slug must be a lowercase english kebab-case name without extension (e.g. "hero-knight").',
  ].join('\n'),
  inputSchema: z.object({
    slug: z.string().describe('Lowercase kebab-case file name without extension, e.g. "hero-knight"'),
    content: z.string().describe('Full Markdown design doc, starting with a YAML frontmatter block'),
  }),
  execute: async ({ slug, content }) => {
    const path = designPathForSlug(slug)

    // Strict format check BEFORE writing — refuse to persist malformed docs
    // so the gallery never shows a broken entry. Returns an explicit error the
    // model can act on (missing frontmatter, bad YAML, missing name/type).
    const formatError = checkDesignFormat(content)
    if (formatError) {
      return JSON.stringify({ success: false, path, error: formatError })
    }

    try {
      const old = await bridgeRPC('read_file', { path })
      designOldContentCache.set(path, old)
    } catch {
      designOldContentCache.set(path, '')
    }
    await bridgeRPC('write_file', { path, content })

    // Validate frontmatter against the kind schema. Issues are advisory only —
    // the write already succeeded; we surface them so the model can self-correct.
    const { meta } = parseDesign(content)
    const schemaIssues = validateDesign(meta)
    // Also validate against the project Design Bible (required fields, stat
    // scale, tag vocabulary, naming, anti-patterns). Loaded fresh on each call
    // so the model picks up bible edits made mid-session.
    let bibleIssues: { cluster: string; severity: string; message: string }[] = []
    try {
      const bible = await loadDesignBible()
      if (bibleHasContent(bible)) {
        bibleIssues = validateAgainstBible(meta, bible).map((i) => ({
          cluster: i.cluster,
          severity: i.severity,
          message: i.message,
        }))
      }
    } catch {
      /* bible load failed — skip bible validation */
    }
    const allIssues = [...schemaIssues.map((i) => ({ field: i.field, message: i.message, severity: i.severity })), ...bibleIssues]
    return JSON.stringify({
      success: true,
      path,
      ...(allIssues.length ? { issues: allIssues } : {}),
    })
  },
})

export const syncDesign = tool({
  description: [
    'Export a finished design doc into a typed Godot Resource (.tres) the game can load() at runtime.',
    'Reads res://.design/<slug>.md, (re)generates the per-kind Resource script under res://design/schema/,',
    'and saves res://design/data/<slug>.tres with the design\'s structured fields.',
    'Call this after the design (and any referenced designs) are finalized.',
  ].join('\n'),
  inputSchema: z.object({
    slug: z.string().describe('Design slug (file name without extension), e.g. "hero-knight"'),
  }),
  execute: async ({ slug }) => {
    const norm = slug
      .trim()
      .replace(/^res:\/\//, '')
      .replace(/^\.design\//, '')
      .replace(/\.md$/i, '')
    const { tresPath, scriptPath } = await syncDesignToResource(norm)
    return JSON.stringify({ success: true, tres_path: tresPath, script_path: scriptPath })
  },
})
