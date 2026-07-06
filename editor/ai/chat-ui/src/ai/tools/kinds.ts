/**
 * Kind-mode tools — author and inspect design-entity kinds.
 *
 * Kinds live as Markdown files under `res://.design/kinds/<id>.md` (YAML
 * frontmatter). Built-in kinds (character/item/skill/enemy/level) are always
 * available; project kinds override them by id or introduce new types. These
 * tools let the model create new kinds (e.g. `weapon`, `quest`, `faction`)
 * without code changes, and re-read the live merged schema on demand.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { stringify as stringifyYaml } from 'yaml'
import { bridgeRPC } from '@/bridge'
import { KINDS_DIR, loadProjectKinds } from '@/lib/kinds-loader'
import { allKinds, type DesignKind, type FieldDef } from '@/lib/design-schema'

/** Normalize a kind id into a `res://.design/kinds/<id>.md` path. */
export function kindPathForId(id: string): string {
  const base = id
    .trim()
    .replace(/^res:\/\//, '')
    .replace(/^\.design\/kinds\//, '')
    .replace(/\.md$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'kind'
  return `${KINDS_DIR}${base}.md`
}

/** Serialize a kind's fields back to YAML frontmatter. */
function fieldToYaml(f: FieldDef): Record<string, unknown> {
  const out: Record<string, unknown> = { key: f.key, type: f.type, label: f.label }
  if (f.labelZh) out.labelZh = f.labelZh
  if (f.required) out.required = true
  if (f.options) out.options = f.options
  if (f.refKind) out.refKind = f.refKind
  if (f.multiple) out.multiple = true
  if (typeof f.max === 'number') out.max = f.max
  if (f.asset) out.asset = f.asset
  if (f.fields) out.fields = f.fields.map(fieldToYaml)
  return out
}

function kindToFrontmatter(kind: {
  id: string
  label: string
  labelZh?: string
  icon?: string
  color?: string
  fields: FieldDef[]
}): string {
  const m: Record<string, unknown> = {
    id: kind.id,
    label: kind.label,
    fields: kind.fields.map(fieldToYaml),
  }
  if (kind.labelZh) m.labelZh = kind.labelZh
  if (kind.icon) m.icon = kind.icon
  if (kind.color) m.color = kind.color
  return `---\n${stringifyYaml(m).trimEnd()}\n---\n`
}

/** Compact JSON description of a kind for tool output. */
function describeKind(k: DesignKind): object {
  return {
    id: k.id,
    label: k.label,
    labelZh: k.labelZh,
    icon: k.icon,
    color: k.color,
    fields: k.fields.map((f) => ({
      key: f.key,
      type: f.type,
      label: f.label,
      ...(f.refKind ? { refKind: f.refKind } : {}),
      ...(f.options ? { options: f.options } : {}),
      ...(typeof f.max === 'number' ? { max: f.max } : {}),
      ...(f.asset ? { asset: f.asset } : {}),
      ...(f.multiple ? { multiple: true } : {}),
      ...(f.fields ? { fields: f.fields.map((s) => ({ key: s.key, label: s.label, ...(typeof s.max === 'number' ? { max: s.max } : {}) })) } : {}),
    })),
  }
}

export const writeKind = tool({
  description: [
    'Create or overwrite a design-entity kind under res://.design/kinds/<id>.md.',
    'A kind file is a Markdown file whose header is a YAML frontmatter block',
    'describing id, label, labelZh, icon, color and fields. Project kinds override',
    'built-in kinds (character/item/skill/enemy/level) by id and can introduce new types.',
    'Rules:',
    '- Use this tool (not write_file) for kind definitions so the schema overlay reloads.',
    '- id must be lowercase kebab-case (e.g. "weapon", "quest").',
    '- Each field needs at least key + type + label. type ∈ string|text|number|enum|tags|ref|asset.',
    '- color ∈ blue|amber|violet|red|emerald|cyan|pink|orange|lime|neutral.',
  ].join('\n'),
  inputSchema: z.object({
    id: z.string().describe('Lowercase kebab-case kind id, e.g. "weapon"'),
    label: z.string().describe('English display label'),
    labelZh: z.string().optional().describe('Chinese display label'),
    icon: z.string().optional().describe('Lucide icon name, e.g. "Sword"'),
    color: z.string().optional().describe('Accent color bucket (blue|amber|violet|red|emerald|cyan|pink|orange|lime|neutral)'),
    fields: z
      .array(
        z.object({
          key: z.string(),
          type: z.enum(['string', 'text', 'number', 'enum', 'tags', 'ref', 'asset']),
          label: z.string(),
          labelZh: z.string().optional(),
          required: z.boolean().optional(),
          options: z.array(z.string()).optional(),
          refKind: z.string().optional(),
          multiple: z.boolean().optional(),
          max: z.number().optional(),
          asset: z.enum(['image', 'audio']).optional(),
          fields: z.array(z.object({ key: z.string(), type: z.enum(['string', 'text', 'number', 'enum', 'tags', 'ref', 'asset']), label: z.string(), labelZh: z.string().optional(), max: z.number().optional() })).optional(),
        }),
      )
      .describe('Type-specific fields (base fields name/summary/tags are added automatically)'),
    notes: z.string().optional().describe('Optional Markdown body for author notes (not parsed)'),
  }),
  execute: async ({ id, label, labelZh, icon, color, fields, notes }) => {
    const path = kindPathForId(id)
    const normalizedId = path.split('/').pop()!.replace(/\.md$/i, '')
    const content =
      kindToFrontmatter({ id: normalizedId, label, labelZh, icon, color, fields }) +
      '\n' +
      (notes?.trim() ?? '') +
      '\n'
    await bridgeRPC('write_file', { path, content })
    // Re-read the whole kinds dir so the overlay reflects the new file (and any
    // concurrent edits the loader hadn't picked up).
    const result = await loadProjectKinds()
    return JSON.stringify({
      success: true,
      path,
      id: normalizedId,
      ...(Object.keys(result.errors).length ? { errors: result.errors } : {}),
    })
  },
})

export const listKinds = tool({
  description: [
    'List the currently active design-entity kinds (built-in + project overlay).',
    'Use this when the user asks which types exist, or before authoring a design',
    'whose type might have been added at runtime.',
  ].join('\n'),
  inputSchema: z.object({}),
  execute: async () => {
    return JSON.stringify({ kinds: allKinds().map(describeKind) })
  },
})
