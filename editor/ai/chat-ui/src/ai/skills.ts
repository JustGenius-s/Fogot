/**
 * Skill system for Fogot AI Chat (Claude Code style).
 *
 * Skills are on-demand knowledge packs: only a lightweight listing
 * is injected into the system prompt. The full SKILL.md content is
 * loaded when the model calls `use_skill`.
 */

import { bridgeRPC } from '@/bridge'

// ─── Types ────────────────────────────────────────────────────────

export interface SkillConfig {
  id: string
  name: string
  description: string
  content: string
  source: 'builtin' | 'project'
}

// ─── YAML Frontmatter ─────────────────────────────────────────────

function parseFrontmatter(raw: string): { name: string; description: string; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { name: '', description: '', body: raw }
  const attrs: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':')
    if (sep < 0) continue
    const k = line.slice(0, sep).trim()
    const v = line.slice(sep + 1).trim()
    if (k) attrs[k] = v
  }
  return { name: attrs.name || '', description: attrs.description || '', body: match[2].trim() }
}

// ─── Built-in Skills ──────────────────────────────────────────────



const BUILTIN_SKILLS: Omit<SkillConfig, 'source'>[] = [
  {
    id: 'ui-theme',
    name: 'UI 主题设计',
    description: 'Godot Control 主题化、响应式布局、主题资源',
    content: `# Godot UI Theme Designer

## Theme Resources
- \`.tres\` Theme for consistent styling
- Override at Theme level, not per-node
- Theme type variations for component variants
- Export theme properties for runtime switching

## Layout
- Containers drive layout: VBox, HBox, Grid, Margin, Center
- \`size_flags\` = EXPAND + FILL for flexible sizing
- \`custom_minimum_size\` for minimum dimensions

## Responsive Design
- Container auto-layout over manual positioning
- Test at multiple resolutions
- \`stretch_mode = canvas_items\` for scaling

## Styling
- StyleBoxFlat for backgrounds (rounded, borders, shadows)
- \`modulate\` for color variations
- Separate logic (\`.gd\`) from presentation (Theme \`.tres\`)

## Accessibility
- Focusable controls with \`focus_mode = ALL\`
- Keyboard navigation via focus neighbors
- Sufficient contrast ratios`,
  },
]

export function getBuiltinSkills(): SkillConfig[] {
  return BUILTIN_SKILLS.map((s) => ({ ...s, source: 'builtin' as const }))
}

// ─── Project Skill Loading ────────────────────────────────────────

export async function loadProjectSkills(): Promise<SkillConfig[]> {
  try {
    const raw = await bridgeRPC('list_files', { path: 'res://.agents/skills' })
    // list_files returns a plain-text tree, e.g.:
    //   res://.agents/skills
    //     design-taste-frontend/
    //     my-skill/
    const lines = raw.split('\n')
    const dirs: string[] = []
    for (const line of lines) {
      const trimmed = line.trimStart()  // strip leading spaces
      // Directory entries end with "/", files don't
      if (trimmed.endsWith('/')) {
        dirs.push(trimmed.slice(0, -1))  // strip trailing "/"
      }
    }

    const skills: SkillConfig[] = []
    for (const dir of dirs) {
      try {
        const content = await bridgeRPC('read_file', { path: `res://.agents/skills/${dir}/SKILL.md` })
        const { name, description, body } = parseFrontmatter(content)
        skills.push({ id: dir, name: name || dir, description: description || '', content: body, source: 'project' })
      } catch { /* skip */ }
    }
    return skills
  } catch {
    return []
  }
}

// ─── Listing Formatter (lightweight system prompt injection) ──────

export function formatSkillListing(skills: { id: string; description: string }[], lang: 'en' | 'zh' = 'en'): string {
  if (skills.length === 0) return ''
  const list = skills.map((s) => `- ${s.id}: ${s.description}`).join('\n')
  return lang === 'zh'
    ? `可用技能（用 use_skill 加载）：\n${list}`
    : `Available skills (load with use_skill):\n${list}`
}
