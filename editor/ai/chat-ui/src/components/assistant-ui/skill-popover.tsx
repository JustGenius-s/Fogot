/**
 * Slash-command skill popover. Type "/" to browse and select skills.
 */

import { useMemo, type FC } from 'react'
import { ComposerPrimitive, unstable_defaultDirectiveFormatter } from '@assistant-ui/react'
import type { Unstable_TriggerAdapter } from '@assistant-ui/core'
import { useAvailableSkills, addInvokedSkill } from '@/bridge'
import { SparklesIcon, FolderOpenIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export const SkillPopover: FC = () => {
  const skills = useAvailableSkills()
  const adapter = useMemo<Unstable_TriggerAdapter>(
    () => ({
      categories: () => {
        const cats: { id: string; label: string }[] = []
        if (skills.some((s) => s.source === 'builtin')) cats.push({ id: 'builtin', label: 'Built-in' })
        if (skills.some((s) => s.source === 'project')) cats.push({ id: 'project', label: 'Project' })
        return cats
      },
      categoryItems: (categoryId: string) =>
        skills.filter((s) => s.source === categoryId).map((s) => ({ id: s.id, type: 'skill', label: s.name, description: s.description })),
      search: (query: string) => {
        const q = query.toLowerCase()
        return skills
          .filter((s) => s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
          .map((s) => ({ id: s.id, type: 'skill', label: s.name, description: s.description }))
      },
    }),
    [skills],
  )

  const skillMap = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills])

  if (skills.length === 0) return null

  return (
    <ComposerPrimitive.Unstable_TriggerPopover
      char="/"
      adapter={adapter}
      className={cn(
        'absolute bottom-full left-0 z-50 mb-2 w-72 max-h-64 overflow-y-auto overflow-x-hidden',
        'rounded-lg border bg-popover text-popover-foreground shadow-lg',
      )}
    >
      <ComposerPrimitive.Unstable_TriggerPopover.Directive
        formatter={unstable_defaultDirectiveFormatter}
        onInserted={(item) => {
          const s = skillMap.get(item.id)
          if (!s) return
          addInvokedSkill(s.id)
          window.dispatchEvent(new CustomEvent('skill-inject', { detail: { skillId: s.id, skillName: s.name, content: s.content } }))
        }}
      />

      <ComposerPrimitive.Unstable_TriggerPopoverBack
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent cursor-pointer border-b border-border"
      >
        Back
      </ComposerPrimitive.Unstable_TriggerPopoverBack>

      <ComposerPrimitive.Unstable_TriggerPopoverCategories>
        {(categories) =>
          categories.map((cat) => (
            <ComposerPrimitive.Unstable_TriggerPopoverCategoryItem
              key={cat.id}
              categoryId={cat.id}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent data-highlighted:bg-accent"
            >
              {cat.id === 'builtin' ? <SparklesIcon className="size-4 text-muted-foreground" /> : <FolderOpenIcon className="size-4 text-muted-foreground" />}
              <span>{cat.label}</span>
            </ComposerPrimitive.Unstable_TriggerPopoverCategoryItem>
          ))
        }
      </ComposerPrimitive.Unstable_TriggerPopoverCategories>

      <ComposerPrimitive.Unstable_TriggerPopoverItems>
        {(items) =>
          items.map((item, index) => {
            const s = skillMap.get(item.id)
            return (
              <ComposerPrimitive.Unstable_TriggerPopoverItem
                key={item.id}
                item={item}
                index={index}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-sm cursor-pointer hover:bg-accent data-highlighted:bg-accent"
              >
                <div className="flex items-center gap-2">
                  {s?.source === 'project' ? <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" /> : <SparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />}
                  <span className="font-medium">{item.label}</span>
                </div>
                {item.description && <span className="pl-5.5 text-xs text-muted-foreground line-clamp-1">{item.description}</span>}
              </ComposerPrimitive.Unstable_TriggerPopoverItem>
            )
          })
        }
      </ComposerPrimitive.Unstable_TriggerPopoverItems>
    </ComposerPrimitive.Unstable_TriggerPopover>
  )
}
