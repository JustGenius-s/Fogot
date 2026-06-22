/**
 * Design card Tool UI — renders write_design calls as a compact design card
 * showing the portrait, name, type and tags, with shortcuts to open the doc
 * in the design view or the editor.
 */

import { makeAssistantToolUI } from '@assistant-ui/react'
import { PencilRulerIcon, LoaderIcon, LayoutGridIcon } from 'lucide-react'
import { AssetThumb } from '@/components/assets/asset-thumb'
import { parseDesign, designImagePath } from '@/lib/designs'
import { designPathForSlug } from '@/ai/tools'
import { setAppView } from '@/bridge'
import { useTranslation } from '@/lib/i18n'

interface WriteDesignArgs {
  slug: string
  content: string
}

export const DesignToolUI = makeAssistantToolUI<WriteDesignArgs, string>({
  toolName: 'write_design',
  render: ({ args, status }) => {
    const { t } = useTranslation()
    if (!args?.slug) return null

    const isRunning = status?.type === 'running'
    const path = designPathForSlug(args.slug)
    const { meta } = parseDesign(args.content ?? '')
    const title = meta.name || args.slug
    const image = designImagePath(meta)
    const tags = Array.isArray(meta.tags) ? meta.tags : []

    return (
      <div className="w-full overflow-hidden rounded-lg border">
        <div className="flex items-center gap-2 border-b border-border/50 bg-muted/40 px-3 py-1.5 text-xs">
          {isRunning ? (
            <LoaderIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <PencilRulerIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium text-muted-foreground">{t('design.label')}</span>
          <span className="truncate text-muted-foreground/60">{path}</span>
        </div>

        <div className="flex gap-3 p-3">
          <div className="size-16 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
            {image ? (
              <AssetThumb path={image} className="size-full" />
            ) : (
              <div className="flex size-full items-center justify-center">
                <PencilRulerIcon className="size-5 text-muted-foreground/40" />
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm font-semibold">{title}</span>
              {typeof meta.type === 'string' && meta.type && (
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {meta.type}
                </span>
              )}
            </div>

            {typeof meta.role === 'string' && meta.role && (
              <span className="truncate text-xs text-muted-foreground">{meta.role}</span>
            )}

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 6).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {!isRunning && (
          <div className="flex items-center justify-end gap-1 border-t border-border/40 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setAppView('design')}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <LayoutGridIcon className="size-3.5" />
              {t('design.openView')}
            </button>
          </div>
        )}
      </div>
    )
  },
})
