/**
 * Declarative design-entity schema.
 *
 * A single source of truth that drives:
 *   - frontmatter validation (write_design + gallery)
 *   - schema-driven display (design sheet: stat bars, chips, ref cards)
 *   - in-place structured editing (form fields)
 *   - relationship resolution (ref fields)
 *   - (future) typed .tres export
 *
 * Designs stay genre-agnostic: each `DesignKind` declares its own fields, so
 * adding a new content type is a data-only change here. A `generic` kind is the
 * fallback for any `type` not explicitly registered.
 */

import type { DesignMeta } from '@/lib/designs'

// ─── Field model ──────────────────────────────────────────────────

export type FieldType =
  | 'string' // single-line text
  | 'text' // multi-line text
  | 'number' // numeric (rendered as stat bar when `max` is set)
  | 'enum' // one-of `options`
  | 'tags' // free string array
  | 'ref' // reference(s) to other design ids
  | 'asset' // res:// path to an image/audio asset

export interface FieldDef {
  /** Frontmatter key. */
  key: string
  /** Field value type. */
  type: FieldType
  /** Human label (English fallback; zh via i18n keys when present). */
  label: string
  /** zh label. */
  labelZh?: string
  /** Required for validation (warning only, never blocks the write). */
  required?: boolean
  /** enum options (for `enum`). */
  options?: string[]
  /** For `ref`: which design kind(s) this points at (informational / filter). */
  refKind?: string
  /** Whether the value is an array (tags/ref default to true). */
  multiple?: boolean
  /** For `number` stat bars: upper bound used to size the bar. */
  max?: number
  /** Asset media kind, for rendering. */
  asset?: 'image' | 'audio'
  /** Group nested fields (for a nested map like `stats:`). */
  fields?: FieldDef[]
}

export interface DesignKind {
  /** `type` value in frontmatter (e.g. "character"). */
  id: string
  /** Display label. */
  label: string
  labelZh: string
  /** Lucide icon name hint (resolved by the UI). */
  icon?: string
  /** Type-specific fields (base fields are added automatically). */
  fields: FieldDef[]
}

// ─── Base fields shared by every kind ─────────────────────────────

const BASE_FIELDS: FieldDef[] = [
  { key: 'name', type: 'string', label: 'Name', labelZh: '名称', required: true },
  { key: 'summary', type: 'text', label: 'Summary', labelZh: '一句话简介' },
  { key: 'tags', type: 'tags', label: 'Tags', labelZh: '标签', multiple: true },
]

// ─── Kind registry ────────────────────────────────────────────────

const KINDS: DesignKind[] = [
  {
    id: 'character',
    label: 'Character',
    labelZh: '角色',
    icon: 'User',
    fields: [
      { key: 'role', type: 'string', label: 'Role', labelZh: '定位' },
      { key: 'portrait', type: 'asset', asset: 'image', label: 'Portrait', labelZh: '立绘' },
      {
        key: 'stats',
        type: 'number',
        label: 'Stats',
        labelZh: '数值',
        fields: [
          { key: 'hp', type: 'number', label: 'HP', labelZh: '生命', max: 200 },
          { key: 'attack', type: 'number', label: 'Attack', labelZh: '攻击', max: 100 },
          { key: 'defense', type: 'number', label: 'Defense', labelZh: '防御', max: 100 },
          { key: 'speed', type: 'number', label: 'Speed', labelZh: '速度', max: 20 },
        ],
      },
      { key: 'skills', type: 'ref', refKind: 'skill', label: 'Skills', labelZh: '技能', multiple: true },
      { key: 'voice_id', type: 'string', label: 'Voice ID', labelZh: '音色 ID' },
      { key: 'voice_preview', type: 'asset', asset: 'audio', label: 'Voice', labelZh: '配音' },
      { key: 'bgm', type: 'asset', asset: 'audio', label: 'BGM', labelZh: '背景音乐' },
    ],
  },
  {
    id: 'item',
    label: 'Item',
    labelZh: '道具',
    icon: 'Package',
    fields: [
      {
        key: 'rarity',
        type: 'enum',
        label: 'Rarity',
        labelZh: '稀有度',
        options: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
      },
      { key: 'icon', type: 'asset', asset: 'image', label: 'Icon', labelZh: '图标' },
      { key: 'effects', type: 'tags', label: 'Effects', labelZh: '效果', multiple: true },
    ],
  },
  {
    id: 'skill',
    label: 'Skill',
    labelZh: '技能',
    icon: 'Sparkles',
    fields: [
      { key: 'icon', type: 'asset', asset: 'image', label: 'Icon', labelZh: '图标' },
      { key: 'cooldown', type: 'number', label: 'Cooldown', labelZh: '冷却', max: 60 },
      { key: 'cost', type: 'number', label: 'Cost', labelZh: '消耗', max: 100 },
      { key: 'damage', type: 'number', label: 'Damage', labelZh: '伤害', max: 200 },
    ],
  },
  {
    id: 'enemy',
    label: 'Enemy',
    labelZh: '敌人',
    icon: 'Skull',
    fields: [
      { key: 'portrait', type: 'asset', asset: 'image', label: 'Portrait', labelZh: '立绘' },
      {
        key: 'stats',
        type: 'number',
        label: 'Stats',
        labelZh: '数值',
        fields: [
          { key: 'hp', type: 'number', label: 'HP', labelZh: '生命', max: 500 },
          { key: 'attack', type: 'number', label: 'Attack', labelZh: '攻击', max: 200 },
          { key: 'speed', type: 'number', label: 'Speed', labelZh: '速度', max: 20 },
        ],
      },
      { key: 'skills', type: 'ref', refKind: 'skill', label: 'Skills', labelZh: '技能', multiple: true },
    ],
  },
  {
    id: 'level',
    label: 'Level',
    labelZh: '关卡',
    icon: 'Map',
    fields: [
      { key: 'theme', type: 'string', label: 'Theme', labelZh: '主题' },
      {
        key: 'difficulty',
        type: 'enum',
        label: 'Difficulty',
        labelZh: '难度',
        options: ['easy', 'normal', 'hard', 'nightmare'],
      },
      { key: 'enemies', type: 'ref', refKind: 'enemy', label: 'Enemies', labelZh: '敌人', multiple: true },
      { key: 'objectives', type: 'tags', label: 'Objectives', labelZh: '目标', multiple: true },
      { key: 'bgm', type: 'asset', asset: 'audio', label: 'BGM', labelZh: '背景音乐' },
    ],
  },
]

const GENERIC_KIND: DesignKind = {
  id: 'generic',
  label: 'Design',
  labelZh: '设计',
  icon: 'PencilRuler',
  fields: [],
}

const KIND_BY_ID = new Map<string, DesignKind>(KINDS.map((k) => [k.id, k]))

// ─── Public API ───────────────────────────────────────────────────

/** All registered kinds (excluding the generic fallback). */
export function allKinds(): DesignKind[] {
  return KINDS
}

/** Resolve a frontmatter `type` to its kind, falling back to `generic`. */
export function getKind(type?: string): DesignKind {
  if (type && KIND_BY_ID.has(type)) return KIND_BY_ID.get(type)!
  return GENERIC_KIND
}

/** Full field list for a type: base fields followed by kind-specific fields. */
export function fieldsFor(type?: string): FieldDef[] {
  return [...BASE_FIELDS, ...getKind(type).fields]
}

/** Localized label for a field given the active locale. */
export function fieldLabel(field: FieldDef, locale: 'en' | 'zh'): string {
  return locale === 'zh' ? field.labelZh ?? field.label : field.label
}

/** Localized label for a kind. */
export function kindLabel(kind: DesignKind, locale: 'en' | 'zh'): string {
  return locale === 'zh' ? kind.labelZh : kind.label
}

// ─── Validation (warnings only) ───────────────────────────────────

export interface ValidationIssue {
  /** Dotted field path, e.g. "stats.hp". */
  field: string
  message: string
  severity: 'error' | 'warning'
}

/**
 * Validate a design's frontmatter against its kind. Never throws and never
 * blocks a write — issues are advisory and surfaced to the model / UI so they
 * can be corrected. Unknown fields are allowed (kinds are open).
 */
export function validateDesign(meta: DesignMeta): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const type = typeof meta.type === 'string' ? meta.type : undefined

  if (!meta.name || (typeof meta.name === 'string' && !meta.name.trim())) {
    issues.push({ field: 'name', message: 'name is required', severity: 'error' })
  }
  if (!type) {
    issues.push({ field: 'type', message: 'type is required', severity: 'error' })
  }

  for (const field of getKind(type).fields) {
    const value = meta[field.key]
    if (field.required && (value === undefined || value === null || value === '')) {
      issues.push({
        field: field.key,
        message: `${field.label} is required for ${type}`,
        severity: 'warning',
      })
    }
    if (field.type === 'enum' && typeof value === 'string' && field.options && !field.options.includes(value)) {
      issues.push({
        field: field.key,
        message: `${field.label} "${value}" is not one of: ${field.options.join(', ')}`,
        severity: 'warning',
      })
    }
  }

  return issues
}

// ─── Godot Resource export ────────────────────────────────────────

/** Directory for generated per-kind Resource scripts. */
export const DESIGN_SCHEMA_DIR = 'res://design/schema/'
/** Directory for generated typed Resource data (.tres). */
export const DESIGN_DATA_DIR = 'res://design/data/'

/** res:// path of the generated Resource script for a kind. */
export function scriptPathForKind(kindId: string): string {
  return `${DESIGN_SCHEMA_DIR}${kindId}.gd`
}

/** res:// path of the generated .tres data file for a design slug. */
export function tresPathForSlug(slug: string): string {
  return `${DESIGN_DATA_DIR}${slug}.tres`
}

/** GDScript export type for a field. */
function gdType(field: FieldDef): string {
  if (field.fields) return 'Dictionary'
  switch (field.type) {
    case 'number':
      return 'float'
    case 'tags':
    case 'ref':
      return 'PackedStringArray'
    case 'asset':
      return field.asset === 'audio' ? 'AudioStream' : 'Texture2D'
    case 'string':
    case 'text':
    case 'enum':
    default:
      return 'String'
  }
}

/**
 * Generate the per-kind Resource script (`extends Resource` with typed
 * `@export` vars) from the schema. The .tres data files reference this script so
 * the game gets strongly-typed, editor-inspectable design data.
 */
export function generateKindScript(kind: DesignKind): string {
  const lines: string[] = [
    '# Auto-generated from the Fogot design schema. Do not edit by hand —',
    '# regenerated whenever a design of this kind is synced to the project.',
    'extends Resource',
    '',
    '@export var id: String',
  ]
  for (const field of fieldsFor(kind.id)) {
    lines.push(`@export var ${field.key}: ${gdType(field)}`)
  }
  return lines.join('\n') + '\n'
}

/**
 * Compact schema description injected into the design agent prompt so the model
 * authors frontmatter that matches the kinds/fields the UI understands.
 */
export function describeSchemaForPrompt(): string {
  const lines: string[] = []
  for (const kind of KINDS) {
    const parts = kind.fields.map((f) => {
      if (f.fields) return `${f.key}{${f.fields.map((s) => s.key).join(',')}}`
      if (f.type === 'ref') return `${f.key}(ref->${f.refKind})`
      if (f.type === 'enum') return `${f.key}(${f.options?.join('|')})`
      if (f.type === 'asset') return `${f.key}(asset)`
      return `${f.key}`
    })
    lines.push(`- ${kind.id}: name, type, tags, summary, ${parts.join(', ')}`)
  }
  return lines.join('\n')
}
