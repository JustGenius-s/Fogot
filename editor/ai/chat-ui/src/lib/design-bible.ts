/**
 * Project Design Bible.
 *
 * The Bible is the project-wide contract stored at `res://.design/_template.md`.
 * It is a plain Markdown file (YAML frontmatter + body) so anyone can edit it
 * by hand, but the editor and the AI agent parse it into a structured document
 * organized into **four themed clusters**, not a flat field list:
 *
 *   1. WORLD    — logline + long-form world & tone notes (the body)
 *   2. LOOK     — art-style keywords + ordered palette swatches
 *   3. NUMBERS  — stat magnitude anchors so designs stay balanced
 *   4. VOICE    — naming conventions + tag vocabulary + required frontmatter
 *      & RULES    + explicit anti-patterns
 *
 * Each cluster maps to a section in the Bible document UI and to a block in
 * the prompt injected into the design agent. The Bible is optional; missing
 * or unreadable files resolve to `undefined` without throwing.
 *
 * The Bible also drives compliance validation: {@link validateAgainstBible}
 * checks a design's frontmatter against the Bible's required fields, stat
 * scale, tag vocabulary, naming conventions and anti-patterns, returning
 * structured issues the agent can self-correct and the UI can surface.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { bridgeRPC } from '@/bridge'
import type { DesignMeta } from '@/lib/designs'

/** Slug and path constants for the project Design Bible. */
export const BIBLE_SLUG = '_template'
export const BIBLE_PATH = 'res://.design/_template.md'

/** A single color entry in the `palette` section. */
export interface BiblePaletteEntry {
  /** Original token from frontmatter (hex / named / oklch / res:// path). */
  raw: string
  /** Optional human label, parsed from `name: color` mapping form. */
  label?: string
}

/**
 * The four themed clusters of the Bible. Each cluster groups related fields so
 * the document reads as a structured contract rather than a flat form. Used by
 * the UI to render sections and by the prompt builder to group guidance.
 */
export type BibleClusterId = 'world' | 'look' | 'numbers' | 'voice'

/** Parsed, structured representation of the Design Bible. */
export interface DesignBible {
  // ── WORLD ──
  /** Project title (display only). */
  title?: string
  /** One-sentence logline / subtitle. */
  logline?: string
  /** Long-form world & tone notes — the Markdown body of the file. */
  world?: string

  // ── LOOK ──
  /** Art-direction keywords, free-form array. */
  artStyle?: string[]
  /** Ordered palette swatches the AI should reuse. */
  palette?: BiblePaletteEntry[]

  // ── NUMBERS ──
  /** Numeric magnitude anchors per stat key (e.g. { hp: 100, attack: 20 }). */
  statScale?: Record<string, number>

  // ── VOICE & RULES ──
  /** Naming convention hints (language, syllable style, prefixes, forbidden). */
  naming?: string
  /** Preferred tag lexicon so designs stay consistent. */
  tagVocabulary?: string[]
  /** Frontmatter fields every design should carry. */
  requiredFields?: string[]
  /** Explicit "don't do this" rules. */
  antiPatterns?: string[]

  /** Raw file content, for prompt injection / round-tripping. */
  raw?: string
}

/** A compliance issue produced by {@link validateAgainstBible}. */
export interface BibleIssue {
  /** Which Bible cluster the issue belongs to. */
  cluster: BibleClusterId
  /** Human-readable message (zh or en depending on caller). */
  message: string
  /** 'error' blocks good practice, 'warning' is advisory. */
  severity: 'error' | 'warning'
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

// ─── Parsing helpers ──────────────────────────────────────────────

function asStringArray(value: unknown): string[] | undefined {
  if (typeof value === 'string' && value.trim()) {
    const arr = value.split(',').map((s) => s.trim()).filter(Boolean)
    return arr.length ? arr : undefined
  }
  if (Array.isArray(value)) {
    const arr = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((s) => s.trim())
    return arr.length ? arr : undefined
  }
  return undefined
}

function asNumberRecord(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const rec = value as Record<string, unknown>
  const out: Record<string, number> = {}
  let any = false
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v
      any = true
    } else if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) {
      out[k] = Number(v)
      any = true
    }
  }
  return any ? out : undefined
}

function asPalette(value: unknown): BiblePaletteEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: BiblePaletteEntry[] = []
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      out.push({ raw: entry.trim() })
    } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const rec = entry as Record<string, unknown>
      const [label, color] = Object.entries(rec)[0] ?? []
      if (typeof color === 'string' && color.trim()) {
        out.push({ raw: color.trim(), label: typeof label === 'string' ? label : undefined })
      }
    }
  }
  return out.length ? out : undefined
}

/**
 * Parse a raw Bible file's content into a structured {@link DesignBible}.
 * Malformed YAML resolves to an empty bible rather than throwing.
 */
export function parseBible(raw: string): DesignBible {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) return { world: raw.trim() || undefined, raw }
  let fm: Record<string, unknown> = {}
  try {
    const parsed = parseYaml(match[1])
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      fm = parsed as Record<string, unknown>
    }
  } catch {
    /* malformed — fall back to empty */
  }
  const world = match[2].trim() || undefined
  const bible: DesignBible = { world, raw }
  if (typeof fm.title === 'string' && fm.title) bible.title = fm.title
  // Accept legacy `subtitle` as an alias for `logline`.
  if (typeof fm.logline === 'string' && fm.logline) bible.logline = fm.logline
  else if (typeof fm.subtitle === 'string' && fm.subtitle) bible.logline = fm.subtitle
  // Legacy `world` field in frontmatter (one-liner) merges into the cluster
  // but the body takes precedence for the long-form world notes.
  if (typeof fm.world === 'string' && fm.world && !world) bible.world = fm.world
  if (typeof fm.naming === 'string' && fm.naming) bible.naming = fm.naming
  bible.artStyle = asStringArray(fm.art_style ?? fm.artStyle)
  bible.tagVocabulary = asStringArray(fm.tag_vocabulary ?? fm.tagVocabulary)
  bible.requiredFields = asStringArray(fm.required_fields ?? fm.requiredFields)
  bible.antiPatterns = asStringArray(fm.anti_patterns ?? fm.antiPatterns)
  bible.statScale = asNumberRecord(fm.stat_scale ?? fm.statScale)
  bible.palette = asPalette(fm.palette)
  return bible
}

/** Serialize a {@link DesignBible} back to a full Markdown file. */
export function serializeBible(bible: DesignBible): string {
  const fm: Record<string, unknown> = {}
  if (bible.title) fm.title = bible.title
  if (bible.logline) fm.logline = bible.logline
  if (bible.naming) fm.naming = bible.naming
  if (bible.artStyle?.length) fm.art_style = bible.artStyle
  if (bible.tagVocabulary?.length) fm.tag_vocabulary = bible.tagVocabulary
  if (bible.requiredFields?.length) fm.required_fields = bible.requiredFields
  if (bible.antiPatterns?.length) fm.anti_patterns = bible.antiPatterns
  if (bible.statScale) fm.stat_scale = bible.statScale
  if (bible.palette?.length) {
    fm.palette = bible.palette.map((p) => (p.label ? { [p.label]: p.raw } : p.raw))
  }
  const fmStr = stringifyYaml(fm).trimEnd()
  const body = (bible.world ?? '').trim()
  return `---\n${fmStr}\n---\n\n${body}\n`
}

/**
 * Load the project Design Bible. Returns `undefined` when the file does not
 * exist or cannot be read. Callers use the parsed structure to render the
 * Bible tab and inject guidance into the design agent prompt.
 */
export async function loadDesignBible(): Promise<DesignBible | undefined> {
  try {
    const raw = await bridgeRPC('read_file', { path: BIBLE_PATH })
    if (!raw || !raw.trim()) return undefined
    return parseBible(raw)
  } catch {
    return undefined
  }
}

/** Whether a bible has any structured content (not just an empty file). */
export function bibleHasContent(b?: DesignBible): b is DesignBible {
  if (!b) return false
  return Boolean(
    b.title ||
      b.logline ||
      b.world?.trim() ||
      b.artStyle?.length ||
      b.palette?.length ||
      b.statScale ||
      b.naming ||
      b.tagVocabulary?.length ||
      b.requiredFields?.length ||
      b.antiPatterns?.length,
  )
}

// ─── Prompt summary ───────────────────────────────────────────────

/** Compact human-readable summary of the bible, grouped by cluster, for prompt
 *  injection. Falls back to the raw file content when present. */
export function describeBibleForPrompt(b: DesignBible): string {
  const blocks: string[] = []
  if (b.title || b.logline) {
    blocks.push(`【世界观】${b.title ?? ''}${b.title && b.logline ? ' — ' : ''}${b.logline ?? ''}`.trim())
  }
  if (b.world?.trim()) {
    blocks.push(`【世界设定】\n${b.world.trim()}`)
  }
  if (b.artStyle?.length) {
    blocks.push(`【画风】${b.artStyle.join('、')}`)
  }
  if (b.palette?.length) {
    blocks.push(`【调色板】${b.palette.map((p) => (p.label ? `${p.label}=${p.raw}` : p.raw)).join('、')}`)
  }
  if (b.statScale) {
    const entries = Object.entries(b.statScale)
    if (entries.length) blocks.push(`【数值量级】${entries.map(([k, v]) => `${k}≈${v}`).join('、')}`)
  }
  if (b.naming) blocks.push(`【命名约定】${b.naming}`)
  if (b.tagVocabulary?.length) blocks.push(`【标签词表】${b.tagVocabulary.join('、')}`)
  if (b.requiredFields?.length) blocks.push(`【必填字段】${b.requiredFields.join('、')}`)
  if (b.antiPatterns?.length) {
    blocks.push(`【反模式】\n${b.antiPatterns.map((a) => `- ${a}`).join('\n')}`)
  }
  return blocks.join('\n\n')
}

// ─── Compliance validation ────────────────────────────────────────

/**
 * Validate a design's frontmatter against the Bible.
 *
 * Checks (only when the corresponding Bible section is present):
 *   - VOICE: every `requiredFields` entry exists in `meta`.
 *   - VOICE: every tag in `meta.tags` is in `tagVocabulary` (warning).
 *   - NUMBERS: every numeric stat in `meta.stats` (or top-level numbers) does
 *     not exceed the Bible's `statScale` anchor for that key by more than 2×
 *     (warning) — outright impossible values (>5×) are errors.
 *   - VOICE: `meta.name` is a non-empty string.
 *   - VOICE: `meta.name` does not match any anti-pattern substring (warning).
 *
 * Never throws. Returns an empty array when the bible has no relevant rules.
 */
export function validateAgainstBible(meta: DesignMeta, bible?: DesignBible): BibleIssue[] {
  if (!bible || !bibleHasContent(bible)) return []
  const issues: BibleIssue[] = []

  // VOICE — required fields.
  if (bible.requiredFields?.length) {
    for (const field of bible.requiredFields) {
      const v = meta[field]
      const missing = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
      if (missing) {
        issues.push({
          cluster: 'voice',
          severity: 'error',
          message: `缺少必填字段：${field}`,
        })
      }
    }
  }

  // VOICE — tag vocabulary (advisory).
  if (bible.tagVocabulary?.length && Array.isArray(meta.tags)) {
    const allowed = new Set(bible.tagVocabulary.map((t) => t.toLowerCase()))
    for (const tag of meta.tags) {
      if (typeof tag === 'string' && !allowed.has(tag.toLowerCase())) {
        issues.push({
          cluster: 'voice',
          severity: 'warning',
          message: `标签 "${tag}" 不在 Bible 词表里，建议改用：${bible.tagVocabulary.slice(0, 5).join('、')}`,
        })
      }
    }
  }

  // VOICE — name presence.
  if (!meta.name || (typeof meta.name === 'string' && !meta.name.trim())) {
    issues.push({ cluster: 'voice', severity: 'error', message: 'name 必填' })
  }

  // VOICE — anti-pattern substring match (advisory).
  if (bible.antiPatterns?.length && typeof meta.name === 'string') {
    for (const rule of bible.antiPatterns) {
      // Simple heuristic: if the rule contains a quoted token, treat it as a
      // literal substring to check against the name; otherwise skip substring
      // matching (the rule is a free-form don't and we can't enforce it here).
      const quoted = rule.match(/[「"]([^」"]+)[」"]|["']([^"']+)["']/)
      const token = quoted?.[1] ?? quoted?.[2]
      if (token && meta.name.includes(token)) {
        issues.push({
          cluster: 'voice',
          severity: 'warning',
          message: `name 命中反模式："${token}"（规则：${rule}）`,
        })
      }
    }
  }

  // NUMBERS — stat scale anchors.
  if (bible.statScale) {
    const check = (key: string, value: number) => {
      const anchor = bible.statScale?.[key]
      if (typeof anchor !== 'number' || anchor <= 0) return
      const ratio = value / anchor
      if (ratio > 5) {
        issues.push({
          cluster: 'numbers',
          severity: 'error',
          message: `${key}=${value} 远超 Bible 量级 ${anchor}（${ratio.toFixed(1)}×），疑似单位错误`,
        })
      } else if (ratio > 2) {
        issues.push({
          cluster: 'numbers',
          severity: 'warning',
          message: `${key}=${value} 超出 Bible 量级 ${anchor} 较多（${ratio.toFixed(1)}×），确认是否有意`,
        })
      }
    }
    // Top-level numeric fields.
    for (const [k, v] of Object.entries(meta)) {
      if (typeof v === 'number') check(k, v)
    }
    // Nested stats map (e.g. stats: { hp, attack }).
    const stats = meta.stats
    if (stats && typeof stats === 'object' && !Array.isArray(stats)) {
      for (const [k, v] of Object.entries(stats as Record<string, unknown>)) {
        if (typeof v === 'number') check(k, v)
      }
    }
  }

  return issues
}

/** Count issues by severity for a quick badge. */
export function summarizeIssues(issues: BibleIssue[]): {
  errors: number
  warnings: number
  total: number
  level: 'ok' | 'warn' | 'error'
} {
  let errors = 0
  let warnings = 0
  for (const i of issues) {
    if (i.severity === 'error') errors++
    else warnings++
  }
  const level = errors > 0 ? 'error' : warnings > 0 ? 'warn' : 'ok'
  return { errors, warnings, total: errors + warnings, level }
}

// ─── Defaults & examples ──────────────────────────────────────────

/**
 * A starter Bible with realistic example content. Used by the Bible tab's
 * "create" action so users see the shape of a real contract, not a blank form.
 * Editing from examples is much easier than authoring from scratch.
 */
export function exampleBible(): DesignBible {
  return {
    title: '以太编年史',
    logline: '一座随情绪改变重力的浮空群岛，少年驭风者追寻失落的晨星。',
    world:
      '## 世界观\n\n浮空群岛悬浮于以太海之上，岛屿的重力由居住者的情绪共鸣决定——悲怆让岛下沉，狂喜让岛升腾。三百年前的"晨星坠落"事件让群岛失去了定锚，正在缓慢四散。\n\n## 语气\n\n少年向、热血但克制；对话避免现代俚语与网络梗；旁白偏诗意，战斗描写干净利落。',
    artStyle: ['手绘水彩', '柔和赛璐璐', '暖色调', '低饱和天空'],
    palette: [
      { label: '晨星金', raw: '#f5c451' },
      { label: '以太青', raw: '#4a8db0' },
      { label: '岛岩褐', raw: '#5b4632' },
      { label: '夜空墨', raw: '#1a2238' },
    ],
    statScale: { hp: 100, attack: 20, defense: 20, speed: 10 },
    naming: '西式奇幻，双音节为主；主角名避免撇号；地名可用三音节复合',
    tagVocabulary: ['近战', '远程', '坦克', '法师', '辅助', 'Boss', '小怪', '友方', '敌对'],
    requiredFields: ['name', 'type', 'portrait', 'tags'],
    antiPatterns: ['不要在台词里用现代俚语', '不要给主角名加撇号（如 Khäel）', 'HP 不要超过 500，除非是 Boss'],
  }
}

/** A truly empty bible (for users who want to start from scratch). */
export function emptyBible(): DesignBible {
  return {
    title: '',
    logline: '',
    world: '',
    artStyle: [],
    palette: [],
    statScale: {},
    naming: '',
    tagVocabulary: [],
    requiredFields: [],
    antiPatterns: [],
  }
}
