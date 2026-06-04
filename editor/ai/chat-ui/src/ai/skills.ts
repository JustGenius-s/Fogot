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

const BUILTIN_SKILLS_EN: Omit<SkillConfig, 'source'>[] = [
  {
    id: 'gdscript-expert',
    name: 'GDScript Expert',
    description: 'Deep GDScript programming: advanced patterns, performance, engine internals',
    content: `# GDScript Expert

## Advanced Patterns
- Static typing everywhere for performance and clarity
- Leverage \`class_name\` for global class registration
- Use \`@tool\` for editor plugins and previews
- Prefer composition with child nodes over deep inheritance
- Use \`StringName\` for frequently compared strings

## Performance
- Cache node references with \`@onready\`
- Use \`_process\` unless physics timing matters
- Avoid \`get_node()\` in loops; cache references
- Object pooling for frequently instantiated scenes
- Profile with Godot profiler before optimizing

## Signals & Architecture
- Prefer signals over direct method calls for loose coupling
- Custom resources (\`Resource\`) for shared data
- Autoloads for global state (use sparingly)
- Observer pattern: nodes emit signals, parents connect

## Error Handling
- \`assert()\` for development-time checks
- \`push_error()\` / \`push_warning()\` for runtime diagnostics
- Check \`is_instance_valid()\` before accessing freed nodes
- Handle \`await\` with proper signal existence checks`,
  },
  {
    id: 'shader-writer',
    name: 'Shader Writer',
    description: 'Godot shaders: canvas_item, spatial, particles, visual shaders',
    content: `# Godot Shader Writer

## Shader Types
- \`shader_type canvas_item\` — 2D sprites, UI, post-processing
- \`shader_type spatial\` — 3D materials
- \`shader_type particles\` — GPU particle behavior

## Canvas Item (2D)
- \`UV\` for texture coords, \`SCREEN_UV\` for screen-space
- \`COLOR\` output; multiply with \`texture(TEXTURE, UV)\`
- \`AT_LIGHT_PASS\` for 2D lighting
- Animate with \`TIME\` uniform

## Spatial (3D)
- \`ALBEDO\`, \`ROUGHNESS\`, \`METALLIC\`, \`NORMAL_MAP\` in \`fragment()\`
- \`vertex()\` for displacement
- \`render_mode unshaded/bland_mix/add/sub/mul\`

## Best Practices
- \`uniform\` with \`hint_*\` for editor integration
- \`group_uniforms\` for organization
- \`varying\` to pass data vertex→fragment
- Prefer built-ins: \`mix\`, \`smoothstep\`, \`clamp\``,
  },
  {
    id: 'scene-designer',
    name: 'Scene Designer',
    description: 'Level design, scene composition, tilemap, world-building',
    content: `# Godot Scene Designer

## Scene Architecture
- One scene per logical unit (player, enemy, UI, level chunk)
- Composition: small scenes instanced into larger ones
- Keep scene trees shallow (< 5 levels)
- Name nodes descriptively

## Node Hierarchy Patterns
- Character: CharacterBody2D > Sprite2D + CollisionShape2D + AnimationPlayer
- Pickup: Area2D > Sprite2D + CollisionShape2D
- UI: Control > MarginContainer > VBoxContainer > children
- Level: Node2D > TileMapLayer + entities + triggers

## TileMap (Godot 4.3+)
- Use TileMapLayer instead of deprecated layer system
- Separate layers: ground, walls, decorations, collision
- Terrain sets for auto-tiling
- Physics layers on collision tiles only

## World Building
- Scene instancing for repeated elements
- NavigationRegion2D for pathfinding
- Groups for batch operations
- Camera2D with limits and smoothing`,
  },
  {
    id: 'ui-theme',
    name: 'UI Theme Designer',
    description: 'Godot Control theming, responsive layout, theme resources',
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
  {
    id: 'plugin-dev',
    name: 'Plugin Developer',
    description: 'Godot editor plugin and GDExtension development',
    content: `# Godot Plugin Developer

## Structure
\`\`\`
addons/my_plugin/
  plugin.cfg          # metadata
  plugin.gd           # extends EditorPlugin
  custom_dock.tscn    # UI scenes
\`\`\`

## plugin.cfg
\`\`\`ini
[plugin]
name="My Plugin"
description="What it does"
script="plugin.gd"
\`\`\`

## EditorPlugin API
- \`_enter_tree()\` / \`_exit_tree()\` — setup/teardown
- \`add_control_to_dock()\` — custom dock panels
- \`add_custom_type()\` — register new node types
- \`add_inspector_plugin()\` — custom inspector
- \`add_tool_menu_item()\` — editor menu entries
- \`get_editor_interface()\` — access editor internals
- \`get_undo_redo()\` — integrate with undo system

## @tool Scripts
- \`@tool\` to run scripts in editor
- Guard with \`if Engine.is_editor_hint(): return\`
- \`_get_configuration_warnings()\` for validation

## Best Practices
- Clean up in \`_exit_tree()\`
- Use EditorUndoRedoManager for modifications
- Test with \`--editor\` flag
- Provide meaningful plugin name and icon`,
  },
]

const BUILTIN_SKILLS_ZH: Omit<SkillConfig, 'source'>[] = [
  { ...BUILTIN_SKILLS_EN[0], name: 'GDScript 专家', description: '深度 GDScript 编程辅助：高级模式、性能优化、引擎内部' },
  { ...BUILTIN_SKILLS_EN[1], name: '着色器编写', description: 'Godot 着色器：canvas_item、spatial、粒子着色器' },
  { ...BUILTIN_SKILLS_EN[2], name: '场景设计', description: '关卡设计、场景组合、瓦片地图、世界构建' },
  { ...BUILTIN_SKILLS_EN[3], name: 'UI 主题设计', description: 'Godot Control 主题化、响应式布局、主题资源' },
  { ...BUILTIN_SKILLS_EN[4], name: '插件开发', description: 'Godot 编辑器插件和 GDExtension 开发' },
]

export function getBuiltinSkills(lang: 'en' | 'zh' = 'en'): SkillConfig[] {
  return (lang === 'zh' ? BUILTIN_SKILLS_ZH : BUILTIN_SKILLS_EN).map((s) => ({ ...s, source: 'builtin' as const }))
}

// ─── Project Skill Loading ────────────────────────────────────────

export async function loadProjectSkills(): Promise<SkillConfig[]> {
  try {
    const raw = await bridgeRPC('list_files', { path: 'res://.agents/skills' })
    const entries: string[] = typeof raw === 'string' ? JSON.parse(raw) : raw
    const dirs = entries.filter((e: string) => !e.includes('.') && e !== '.' && e !== '..')

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
    ? `# 可用技能\n\n当任务需要专业领域知识时，使用 use_skill 工具加载技能指南。\n\n${list}`
    : `# Available Skills\n\nUse the use_skill tool to load a skill's full guide when needed.\n\n${list}`
}
