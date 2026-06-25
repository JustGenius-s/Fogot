/**
 * Design document helpers.
 *
 * Design docs live under res://.design/ as Markdown files with a YAML
 * frontmatter header. This module lists them via the C++ list_files RPC and
 * parses the lightweight frontmatter needed for gallery cards and chips.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { bridgeRPC } from '@/bridge'
import {
  fieldsFor,
  getKind,
  generateKindScript,
  scriptPathForKind,
  tresPathForSlug,
} from '@/lib/design-schema'

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

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/**
 * Split a design doc into its frontmatter block and Markdown body, and parse
 * the frontmatter with a real YAML parser.
 *
 * Unlike the previous regex parser, nested maps (e.g. `stats:`), block lists and
 * inline arrays are all parsed, so the gallery / design sheet can read numeric
 * stats and references. Malformed YAML resolves to an empty meta rather than
 * throwing.
 */
export function parseDesign(raw: string): { meta: DesignMeta; body: string } {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) return { meta: {}, body: raw.trim() }

  let meta: DesignMeta = {}
  try {
    const parsed = parseYaml(match[1])
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      meta = parsed as DesignMeta
    }
  } catch {
    /* malformed frontmatter — fall back to empty meta */
  }

  return { meta, body: match[2].trim() }
}

/**
 * Serialize structured frontmatter + Markdown body back into a full design doc.
 * Used by the design sheet's in-place field editing so edits round-trip without
 * the model in the loop.
 */
export function serializeDesign(meta: DesignMeta, body: string): string {
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'string' && v.trim() === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    cleaned[k] = v
  }
  const fm = stringifyYaml(cleaned).trimEnd()
  return `---\n${fm}\n---\n\n${body.trim()}\n`
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

// ─── Resource export (design → .tres) ─────────────────────────────

export interface SyncResult {
  /** res:// path of the generated .tres data file. */
  tresPath: string
  /** res:// path of the generated per-kind Resource script. */
  scriptPath: string
}

/**
 * Export a design doc to a typed Godot Resource (.tres).
 *
 * Reads the .md, generates/refreshes the per-kind Resource script from the
 * schema, then asks the C++ side to instantiate that script, set its exported
 * properties from the frontmatter, and save the .tres. The .md stays the source
 * of truth; the .tres is a derived artifact the game can `load()` at runtime.
 */
export async function syncDesignToResource(slug: string): Promise<SyncResult> {
  const path = `${DESIGN_DIR}${slug}.md`
  const raw = await bridgeRPC('read_file', { path })
  const { meta } = parseDesign(raw)

  const type = typeof meta.type === 'string' ? meta.type : undefined
  const kind = getKind(type)
  const scriptPath = scriptPathForKind(kind.id)
  const tresPath = tresPathForSlug(slug)

  // (Re)generate the per-kind Resource script so it always matches the schema.
  await bridgeRPC('write_file', { path: scriptPath, content: generateKindScript(kind) })

  const fields = { ...meta, id: slug }
  await bridgeRPC('design_export_resource', {
    tres_path: tresPath,
    script_path: scriptPath,
    fields: JSON.stringify(fields),
  })

  return { tresPath, scriptPath }
}

// ─── Relationship graph ───────────────────────────────────────────

/** A single outgoing reference from one design to another. */
export interface DesignRef {
  /** The frontmatter field the reference came from (e.g. "skills"). */
  field: string
  /** Referenced design id (slug). */
  to: string
  /** Whether a design with that id exists in the set. */
  exists: boolean
}

/** A single incoming reference (backlink) to a design. */
export interface DesignBacklink {
  /** Slug of the design that points here. */
  from: string
  /** The field on the source design that holds the reference. */
  field: string
}

export interface DesignGraph {
  /** Outgoing refs keyed by source slug. */
  refs: Map<string, DesignRef[]>
  /** Incoming refs keyed by target slug. */
  backlinks: Map<string, DesignBacklink[]>
  /** Refs whose target id does not exist, keyed by source slug. */
  dangling: Map<string, DesignRef[]>
}

function refValues(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
  }
  return []
}

/**
 * Build the reference graph across a set of designs. For each design, the `ref`
 * fields declared by its kind are resolved against the known id set to produce
 * forward refs, backlinks and dangling (unresolved) references.
 */
export function buildDesignGraph(designs: DesignEntry[]): DesignGraph {
  const ids = new Set(designs.map((d) => d.slug))
  const refs = new Map<string, DesignRef[]>()
  const backlinks = new Map<string, DesignBacklink[]>()
  const dangling = new Map<string, DesignRef[]>()

  for (const design of designs) {
    const type = typeof design.meta.type === 'string' ? design.meta.type : undefined
    const refFields = fieldsFor(type).filter((f) => f.type === 'ref')
    const out: DesignRef[] = []
    const bad: DesignRef[] = []

    for (const field of refFields) {
      for (const to of refValues(design.meta[field.key])) {
        const exists = ids.has(to)
        const ref: DesignRef = { field: field.key, to, exists }
        out.push(ref)
        if (exists) {
          const list = backlinks.get(to) ?? []
          list.push({ from: design.slug, field: field.key })
          backlinks.set(to, list)
        } else {
          bad.push(ref)
        }
      }
    }

    if (out.length) refs.set(design.slug, out)
    if (bad.length) dangling.set(design.slug, bad)
  }

  return { refs, backlinks, dangling }
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
