/**
 * Design document helpers.
 *
 * Design docs live under res://.design/ as Markdown files with a YAML
 * frontmatter header. This module lists them via the C++ list_files RPC and
 * parses the lightweight frontmatter needed for gallery cards and chips.
 */

import { bridgeRPC } from '@/bridge'

/** Default project directory that holds design documents. */
export const DESIGN_DIR = 'res://.design/'

/** Structured fields parsed from a design doc's YAML frontmatter. */
export interface DesignMeta {
  name?: string
  type?: string
  role?: string
  rarity?: string
  theme?: string
  tags?: string[]
  portrait?: string
  icon?: string
  [key: string]: unknown
}

export interface DesignEntry {
  /** res:// path to the .md file. */
  path: string
  /** File name without extension. */
  slug: string
  /** Parsed frontmatter fields. */
  meta: DesignMeta
  /** Markdown body (frontmatter stripped). */
  body: string
}

interface ListDesignsResponse {
  dir: string
  exists: boolean
  designs: DesignEntry[]
}

// ─── Frontmatter parsing ──────────────────────────────────────────

/**
 * Split a design doc into its frontmatter block and Markdown body, and parse
 * the top-level frontmatter keys.
 *
 * Only top-level scalar values and inline arrays (`[a, b]`) are parsed; nested
 * maps (e.g. `stats:`) are skipped for listing purposes.
 */
export function parseDesign(raw: string): { meta: DesignMeta; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw.trim() }

  const meta: DesignMeta = {}
  for (const line of match[1].split('\n')) {
    // Skip nested (indented) lines and list items — top-level keys only.
    if (/^\s/.test(line)) continue
    const sep = line.indexOf(':')
    if (sep < 0) continue
    const key = line.slice(0, sep).trim()
    const rawValue = line.slice(sep + 1).trim()
    if (!key) continue
    if (rawValue === '') continue // nested map header (e.g. "stats:")
    meta[key] = parseScalar(rawValue)
  }

  return { meta, body: match[2].trim() }
}

function parseScalar(value: string): string | string[] {
  // Inline array: [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((s) => stripQuotes(s.trim()))
      .filter(Boolean)
  }
  return stripQuotes(value)
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

/** The portrait/icon asset path referenced by a design, if any. */
export function designImagePath(meta: DesignMeta): string | undefined {
  const candidate = meta.portrait ?? meta.icon
  return typeof candidate === 'string' && candidate ? candidate : undefined
}

/** Display name for a design entry (frontmatter name, falling back to slug). */
export function designTitle(entry: DesignEntry): string {
  return entry.meta.name || entry.slug
}

// ─── Listing ──────────────────────────────────────────────────────

/**
 * List design documents under {@link DESIGN_DIR}. Each `.md` file is read and
 * its frontmatter parsed. Missing directory resolves to an empty, non-existing
 * result rather than throwing.
 */
export async function listDesigns(dir: string = DESIGN_DIR): Promise<ListDesignsResponse> {
  let raw: string
  try {
    raw = await bridgeRPC('list_files', { path: dir, recursive: false })
  } catch {
    return { dir, exists: false, designs: [] }
  }

  // list_files returns a plain-text tree; the first line is the dir, children
  // are indented. Files don't end with "/"; directories do.
  const files: string[] = []
  for (const line of raw.split('\n')) {
    const name = line.trim()
    if (!name || name.endsWith('/')) continue
    if (name.toLowerCase().endsWith('.md')) files.push(name)
  }

  const base = dir.endsWith('/') ? dir : dir + '/'
  const designs: DesignEntry[] = []
  await Promise.all(
    files.map(async (name) => {
      const path = base + name
      try {
        const content = await bridgeRPC('read_file', { path })
        const { meta, body } = parseDesign(content)
        designs.push({ path, slug: name.replace(/\.md$/i, ''), meta, body })
      } catch {
        /* unreadable file — skip */
      }
    }),
  )

  designs.sort((a, b) => designTitle(a).localeCompare(designTitle(b)))
  return { dir, exists: true, designs }
}

/** Read the raw content of a single design doc. */
export async function readDesign(path: string): Promise<string> {
  return bridgeRPC('read_file', { path })
}
