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

/**
 * Slug for the optional project-wide design template (`res://.design/_template.md`).
 *
 * The template holds shared world-building / art-style / numeric-scale / tag
 * vocabulary so that subsequent character/scene designs stay consistent. It is
 * excluded from the regular design listing and gallery cards.
 */
export const TEMPLATE_SLUG = '_template'

/** res:// path of the optional template file. */
export const TEMPLATE_PATH = `${DESIGN_DIR}${TEMPLATE_SLUG}.md`

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
  /** Character voice id (audio mode). */
  voice_id?: string
  /** res:// path of the character's voice preview clip. */
  voice_preview?: string
  /** res:// path of the design's associated background music. */
  bgm?: string
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
    if (!name.toLowerCase().endsWith('.md')) continue
    // Skip the project template — it is consumed as context, not as a gallery
    // design entry.
    if (name.toLowerCase() === `${TEMPLATE_SLUG}.md`) continue
    files.push(name)
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

/**
 * Load the optional project design template (`res://.design/_template.md`).
 *
 * Returns the raw Markdown content when present, or `undefined` when the file
 * does not exist / cannot be read. Callers use the returned string as context
 * for the design / audio agents so that subsequent designs inherit the
 * template's world / art style / numeric scale / tag vocabulary.
 */
export async function loadDesignTemplate(): Promise<string | undefined> {
  try {
    const raw = await bridgeRPC('read_file', { path: TEMPLATE_PATH })
    return raw && raw.trim() ? raw : undefined
  } catch {
    return undefined
  }
}
