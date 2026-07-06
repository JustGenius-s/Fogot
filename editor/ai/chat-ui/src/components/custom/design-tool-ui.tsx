/**
 * Design tool UI — compact inline display for write_design calls.
 */

import { makeAssistantToolUI } from '@assistant-ui/react'
import { PencilRulerIcon, LoaderIcon, LayoutGridIcon } from 'lucide-react'
import { parseDesign } from '@/lib/designs'
import { getKind, kindColor, kindLabel, kindTint } from '@/lib/design-schema'
import { resolveKindIcon } from '@/components/assets/kind-icons'
import { setAppView } from '@/bridge'
import { useLocale } from '@/lib/i18n'

interface WriteDesignArgs {
  slug: string
  content: string
}

export const DesignToolUI = makeAssistantToolUI<WriteDesignArgs, string>({
  toolName: 'write_design',
  render: ({ args, status }) => {
    if (!args?.slug) return null

    const locale = useLocale()
    const isRunning = status?.type === 'running'
    const { meta } = parseDesign(args.content ?? '')
    const title = meta.name || args.slug
    const tags = Array.isArray(meta.tags) ? meta.tags : []
    const type = typeof meta.type === 'string' ? meta.type : undefined
    const kind = getKind(type)
    const KindIcon = resolveKindIcon(kind.icon)

    return (
      <div className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground">
        {isRunning ? (
          <LoaderIcon className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <PencilRulerIcon className="size-3.5 shrink-0" />
        )}
        <span className="shrink-0">Design:</span>
        <span className="truncate font-medium text-foreground/90">{title}</span>
        {type && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: kindTint(kind, 0.18), color: kindColor(kind, 0.85, 0.1) }}
          >
            <KindIcon className="size-2.5" />
            {kindLabel(kind, locale)}
          </span>
        )}
        {tags.length > 0 && (
          <span className="truncate text-xs opacity-60">
            {tags.slice(0, 3).join(', ')}
            {tags.length > 3 && ` +${tags.length - 3}`}
          </span>
        )}
        {!isRunning && (
          <button
            type="button"
            onClick={() => setAppView('design')}
            className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-accent hover:text-foreground transition-colors"
          >
            <LayoutGridIcon className="size-3" />
          </button>
        )}
      </div>
    )
  },
})
