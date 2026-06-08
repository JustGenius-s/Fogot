/**
 * @ mention popover. Type "@" to browse and reference scene nodes,
 * scene files (.tscn), and script files (.gd).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react'
import { ComposerPrimitive, unstable_defaultDirectiveFormatter } from '@assistant-ui/react'
import type { Unstable_TriggerAdapter } from '@assistant-ui/core'
import { bridgeRPC } from '@/bridge'
import { GitBranchIcon, BoxIcon, FileCodeIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NodeItem {
  name: string
  path: string
  type: string
  hasScript: boolean
}

interface FileItem {
  path: string
  name: string
}

interface MentionData {
  nodes: NodeItem[]
  scenes: FileItem[]
  scripts: FileItem[]
}

const CATEGORY_ICONS: Record<string, FC<{ className?: string }>> = {
  nodes: GitBranchIcon,
  scenes: BoxIcon,
  scripts: FileCodeIcon,
}

const DIRECTIVE_TYPE: Record<string, string> = {
  nodes: 'node',
  scenes: 'scene',
  scripts: 'script',
}

export const MentionPopover: FC = () => {
  const [data, setData] = useState<MentionData>({ nodes: [], scenes: [], scripts: [] })

  const refresh = useCallback(() => {
    bridgeRPC('mention_suggestions', {})
      .then((json) => {
        try {
          const parsed = JSON.parse(json) as MentionData
          setData(parsed)
        } catch { /* malformed JSON */ }
      })
      .catch(() => { /* RPC failure — keep stale data */ })
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  const adapter = useMemo<Unstable_TriggerAdapter>(() => {
    const allItems = [
      ...data.nodes.map((n) => ({
        id: n.path,
        type: DIRECTIVE_TYPE.nodes,
        label: n.path === '.' ? '(root)' : n.name,
        description: n.type + (n.path !== n.name ? ' · ' + n.path : ''),
        _category: 'nodes',
      })),
      ...data.scenes.map((s) => ({
        id: s.path,
        type: DIRECTIVE_TYPE.scenes,
        label: s.name,
        description: s.path,
        _category: 'scenes',
      })),
      ...data.scripts.map((s) => ({
        id: s.path,
        type: DIRECTIVE_TYPE.scripts,
        label: s.name,
        description: s.path,
        _category: 'scripts',
      })),
    ]

    return {
      categories: () => {
        refreshRef.current()
        const cats: { id: string; label: string }[] = []
        if (data.nodes.length > 0) cats.push({ id: 'nodes', label: 'Nodes' })
        if (data.scenes.length > 0) cats.push({ id: 'scenes', label: 'Scenes' })
        if (data.scripts.length > 0) cats.push({ id: 'scripts', label: 'Scripts' })
        return cats
      },
      categoryItems: (categoryId: string) =>
        allItems
          .filter((i) => i._category === categoryId)
          .map(({ _category, ...rest }) => rest),
      search: (query: string) => {
        const q = query.toLowerCase()
        return allItems
          .filter(
            (i) =>
              i.id.toLowerCase().includes(q) ||
              i.label.toLowerCase().includes(q) ||
              i.description.toLowerCase().includes(q),
          )
          .map(({ _category, ...rest }) => rest)
      },
    }
  }, [data])

  const isEmpty = data.nodes.length === 0 && data.scenes.length === 0 && data.scripts.length === 0

  return (
    <ComposerPrimitive.Unstable_TriggerPopover
      char="@"
      adapter={adapter}
      className={cn(
        'absolute bottom-full left-0 z-50 mb-2 w-80 max-h-64 overflow-y-auto overflow-x-hidden',
        'rounded-lg border bg-popover text-popover-foreground shadow-lg',
        isEmpty && 'hidden',
      )}
    >
      <ComposerPrimitive.Unstable_TriggerPopover.Directive
        formatter={unstable_defaultDirectiveFormatter}
      />

      <ComposerPrimitive.Unstable_TriggerPopoverBack
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent cursor-pointer border-b border-border"
      >
        Back
      </ComposerPrimitive.Unstable_TriggerPopoverBack>

      <ComposerPrimitive.Unstable_TriggerPopoverCategories>
        {(categories) =>
          categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id] ?? GitBranchIcon
            return (
              <ComposerPrimitive.Unstable_TriggerPopoverCategoryItem
                key={cat.id}
                categoryId={cat.id}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent data-highlighted:bg-accent"
              >
                <Icon className="size-4 text-muted-foreground" />
                <span>{cat.label}</span>
              </ComposerPrimitive.Unstable_TriggerPopoverCategoryItem>
            )
          })
        }
      </ComposerPrimitive.Unstable_TriggerPopoverCategories>

      <ComposerPrimitive.Unstable_TriggerPopoverItems>
        {(items) =>
          items.map((item, index) => {
            const Icon =
              item.type === 'node'
                ? GitBranchIcon
                : item.type === 'scene'
                  ? BoxIcon
                  : FileCodeIcon
            return (
              <ComposerPrimitive.Unstable_TriggerPopoverItem
                key={item.id}
                item={item}
                index={index}
                className="flex w-full items-start gap-2 px-3 py-2 text-sm text-left cursor-pointer hover:bg-accent data-highlighted:bg-accent"
              >
                <Icon className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />
                <div className="min-w-0 flex flex-col">
                  <span className="font-medium truncate">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {item.description}
                    </span>
                  )}
                </div>
              </ComposerPrimitive.Unstable_TriggerPopoverItem>
            )
          })
        }
      </ComposerPrimitive.Unstable_TriggerPopoverItems>
    </ComposerPrimitive.Unstable_TriggerPopover>
  )
}
