/**
 * @ mention popover. Type "@" to browse and reference scene nodes,
 * scene files (.tscn), script files (.gd), and folders.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react'
import { ComposerPrimitive, unstable_defaultDirectiveFormatter } from '@assistant-ui/react'
import type { Unstable_TriggerAdapter } from '@assistant-ui/core'
import { bridgeRPC } from '@/bridge'
import { listDesigns, designTitle, type DesignEntry } from '@/lib/designs'
import { GitBranchIcon, BoxIcon, FileCodeIcon, FolderIcon, PencilRulerIcon } from 'lucide-react'
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
  folders: FileItem[]
}

const CATEGORY_ICONS: Record<string, FC<{ className?: string }>> = {
  nodes: GitBranchIcon,
  scenes: BoxIcon,
  scripts: FileCodeIcon,
  folders: FolderIcon,
  designs: PencilRulerIcon,
}

const DIRECTIVE_TYPE: Record<string, string> = {
  nodes: 'node',
  scenes: 'scene',
  scripts: 'script',
  folders: 'folder',
  designs: 'design',
}

/** Minimum gap between background refreshes triggered while the popover is open. */
const REFRESH_THROTTLE_MS = 1500

interface MentionItem {
  id: string
  type: string
  label: string
  description: string
  _category: string
  _haystack: string
}

const stripItem = ({ _category, _haystack, ...rest }: MentionItem) => rest

export const MentionPopover: FC = () => {
  const [data, setData] = useState<MentionData>({ nodes: [], scenes: [], scripts: [], folders: [] })
  const [designs, setDesigns] = useState<DesignEntry[]>([])

  // Dedupe identical payloads so the adapter reference stays stable (avoids a
  // setData -> adapter rebuild -> categories() -> refresh feedback loop).
  const lastJsonRef = useRef<string>('')
  const lastDesignKeyRef = useRef<string>('')
  const lastFetchRef = useRef<number>(0)
  const inFlightRef = useRef<boolean>(false)

  const refresh = useCallback(() => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    Promise.all([
      bridgeRPC('mention_suggestions', {})
        .then((json) => {
          if (json === lastJsonRef.current) return // unchanged — keep adapter stable
          lastJsonRef.current = json
          try {
            const parsed = JSON.parse(json) as MentionData
            setData(parsed)
          } catch { /* malformed JSON */ }
        })
        .catch(() => { /* RPC failure — keep stale data */ }),
      listDesigns()
        .then((res) => {
          const key = res.designs.map((d) => d.path).join('|')
          if (key === lastDesignKeyRef.current) return // unchanged
          lastDesignKeyRef.current = key
          setDesigns(res.designs)
        })
        .catch(() => { /* listing failure — keep stale data */ }),
    ]).finally(() => { inFlightRef.current = false })
  }, [])

  // Throttled variant used from the hot path (categories getter, called
  // repeatedly by the popover library while open).
  const throttledRefresh = useCallback(() => {
    const now = Date.now()
    if (now - lastFetchRef.current < REFRESH_THROTTLE_MS) return
    lastFetchRef.current = now
    refresh()
  }, [refresh])

  useEffect(() => { refresh() }, [refresh])

  const throttledRefreshRef = useRef(throttledRefresh)
  throttledRefreshRef.current = throttledRefresh

  const adapter = useMemo<Unstable_TriggerAdapter>(() => {
    const allItems: MentionItem[] = [
      ...data.nodes.map((n) => {
        const label = n.path === '.' ? '(root)' : n.name
        const description = n.type + (n.path !== n.name ? ' · ' + n.path : '')
        return {
          id: n.path,
          type: DIRECTIVE_TYPE.nodes,
          label,
          description,
          _category: 'nodes',
          _haystack: (n.path + '\n' + label + '\n' + description).toLowerCase(),
        }
      }),
      ...data.scenes.map((s) => ({
        id: s.path,
        type: DIRECTIVE_TYPE.scenes,
        label: s.name,
        description: s.path,
        _category: 'scenes',
        _haystack: (s.path + '\n' + s.name).toLowerCase(),
      })),
      ...data.scripts.map((s) => ({
        id: s.path,
        type: DIRECTIVE_TYPE.scripts,
        label: s.name,
        description: s.path,
        _category: 'scripts',
        _haystack: (s.path + '\n' + s.name).toLowerCase(),
      })),
      ...data.folders.map((f) => ({
        id: f.path,
        type: DIRECTIVE_TYPE.folders,
        label: f.name,
        description: f.path,
        _category: 'folders',
        _haystack: (f.path + '\n' + f.name).toLowerCase(),
      })),
      ...designs.map((d) => {
        const label = designTitle(d)
        return {
          id: d.path,
          type: DIRECTIVE_TYPE.designs,
          label,
          description: d.path,
          _category: 'designs',
          _haystack: (d.path + '\n' + label + '\n' + d.slug).toLowerCase(),
        }
      }),
    ]

    return {
      categories: () => {
        throttledRefreshRef.current()
        const cats: { id: string; label: string }[] = []
        if (data.nodes.length > 0) cats.push({ id: 'nodes', label: 'Nodes' })
        if (data.scenes.length > 0) cats.push({ id: 'scenes', label: 'Scenes' })
        if (data.scripts.length > 0) cats.push({ id: 'scripts', label: 'Scripts' })
        if (data.folders.length > 0) cats.push({ id: 'folders', label: 'Folders' })
        if (designs.length > 0) cats.push({ id: 'designs', label: 'Designs' })
        return cats
      },
      categoryItems: (categoryId: string) =>
        allItems.filter((i) => i._category === categoryId).map(stripItem),
      search: (query: string) => {
        const q = query.toLowerCase()
        return allItems.filter((i) => i._haystack.includes(q)).map(stripItem)
      },
    }
  }, [data, designs])

  const isEmpty =
    data.nodes.length === 0 &&
    data.scenes.length === 0 &&
    data.scripts.length === 0 &&
    data.folders.length === 0 &&
    designs.length === 0

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
                  : item.type === 'folder'
                    ? FolderIcon
                    : item.type === 'design'
                      ? PencilRulerIcon
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
