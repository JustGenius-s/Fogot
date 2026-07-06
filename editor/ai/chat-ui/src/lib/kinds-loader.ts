/**
 * Project kind loader.
 *
 * Reads `res://.design/kinds/*.md` — each file is a YAML frontmatter block
 * describing a {@link DesignKind} (id / label / labelZh / icon / color / fields),
 * optionally followed by Markdown prose for author notes (not parsed).
 *
 * Loaded kinds are merged over the built-ins via {@link setProjectKinds}:
 *   - a project kind with the same id as a built-in overrides it;
 *   - a project kind with a new id introduces a new type the gallery / sheet /
 *     validator will recognize without any code change.
 *
 * The directory is optional — missing or unreadable folders resolve to an empty
 * overlay (built-ins stay in effect).
 */

import { parse as parseYaml } from 'yaml'
import { bridgeRPC } from '@/bridge'
import {
  type DesignKind,
  type FieldDef,
  type FieldType,
  type KindColor,
  setProjectKinds,
} from '@/lib/design-schema'

/** Default project directory that holds kind definitions. */
export const KINDS_DIR = 'res://.design/kinds/'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

const VALID_FIELD_TYPES: readonly FieldType[] = [
  'string',
  'text',
  'number',
  'enum',
  'tags',
  'ref',
  'asset',
]

const VALID_COLORS: readonly KindColor[] = [
  'blue',
  'amber',
  'violet',
  'red',
  'emerald',
  'cyan',
  'pink',
  'orange',
  'lime',
  'neutral',
]

/** Result of a load pass — the parsed kinds plus any per-file parse errors. */
export interface LoadKindsResult {
  dir: string
  exists: boolean
  kinds: DesignKind[]
  /** Errors keyed by file name, for surfacing in the UI. */
  errors: Record<string, string>
}

/** Normalize a kind id (lowercase kebab-case, no extension). */
function normalizeId(raw: string, fallback: string): string {
  const id = raw
    .trim()
    .replace(/^res:\/\//, '')
    .replace(/^\.design\/kinds\//, '')
    .replace(/\.md$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return id || fallback
}

/** Coerce an unknown value into a `FieldDef`, or return null if unusable. */
function coerceField(raw: unknown): FieldDef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const key = typeof r.key === 'string' ? r.key.trim() : ''
  if (!key) return null
  const type = typeof r.type === 'string' ? (r.type as FieldType) : 'string'
  if (!VALID_FIELD_TYPES.includes(type)) return null
  const label = typeof r.label === 'string' ? r.label : key
  const field: FieldDef = { key, type, label }
  if (typeof r.labelZh === 'string' && r.labelZh) field.labelZh = r.labelZh
  if (r.required === true) field.required = true
  if (Array.isArray(r.options)) {
    field.options = r.options.filter((o): o is string => typeof o === 'string')
  }
  if (typeof r.refKind === 'string' && r.refKind) field.refKind = r.refKind
  if (r.multiple === true) field.multiple = true
  if (typeof r.max === 'number' && Number.isFinite(r.max)) field.max = r.max
  if (r.asset === 'image' || r.asset === 'audio') field.asset = r.asset
  if (Array.isArray(r.fields)) {
    const subs = r.fields
      .map(coerceField)
      .filter((f): f is FieldDef => f !== null)
    if (subs.length) field.fields = subs
  }
  return field
}

/** Parse one kind file's raw content into a {@link DesignKind}, or throw. */
function parseKindFile(name: string, raw: string): DesignKind {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) throw new Error('missing YAML frontmatter')
  let parsed: unknown
  try {
    parsed = parseYaml(match[1])
  } catch (e) {
    throw new Error(`YAML parse error: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('frontmatter must be a YAML mapping')
  }
  const m = parsed as Record<string, unknown>
  const fallbackId = name.replace(/\.md$/i, '')
  const id = normalizeId(typeof m.id === 'string' ? m.id : fallbackId, fallbackId)
  const label = typeof m.label === 'string' && m.label ? m.label : id
  const labelZh = typeof m.labelZh === 'string' && m.labelZh ? m.labelZh : label
  const kind: DesignKind = { id, label, labelZh, fields: [] }
  if (typeof m.icon === 'string' && m.icon) kind.icon = m.icon
  if (typeof m.color === 'string' && VALID_COLORS.includes(m.color as KindColor)) {
    kind.color = m.color as KindColor
  }
  if (Array.isArray(m.fields)) {
    const fields = m.fields
      .map(coerceField)
      .filter((f): f is FieldDef => f !== null)
    kind.fields = fields
  }
  return kind
}

/**
 * Load project kinds from `res://.design/kinds/`. Missing directory resolves to
 * an empty overlay without throwing. Per-file parse errors are collected into
 * {@link LoadKindsResult.errors} rather than aborting the whole load.
 */
export async function loadProjectKinds(dir: string = KINDS_DIR): Promise<LoadKindsResult> {
  let raw: string
  try {
    raw = await bridgeRPC('list_files', { path: dir, recursive: false })
  } catch {
    return { dir, exists: false, kinds: [], errors: {} }
  }

  const files: string[] = []
  for (const line of raw.split('\n')) {
    const name = line.trim()
    if (!name || name.endsWith('/')) continue
    if (!name.toLowerCase().endsWith('.md')) continue
    files.push(name)
  }

  const base = dir.endsWith('/') ? dir : dir + '/'
  const kinds: DesignKind[] = []
  const errors: Record<string, string> = {}
  await Promise.all(
    files.map(async (name) => {
      const path = base + name
      try {
        const content = await bridgeRPC('read_file', { path })
        kinds.push(parseKindFile(name, content))
      } catch (e) {
        errors[name] = e instanceof Error ? e.message : String(e)
      }
    }),
  )

  // Stable order: built-in ids first (so overrides land in their natural slot),
  // then new ids alphabetically.
  kinds.sort((a, b) => a.id.localeCompare(b.id))

  setProjectKinds(kinds)
  return { dir, exists: true, kinds, errors }
}
