import { useEffect, useMemo, useState, type FC } from 'react'
import {
  RefreshCwIcon,
  PencilRulerIcon,
  FileQuestionIcon,
  SearchIcon,
  LayoutGridIcon,
  ListIcon,
  AlertTriangleIcon,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { AssetThumb } from '@/components/assets/asset-thumb'
import { DesignSheetDialog } from '@/components/assets/design-sheet'
import { useDesigns } from '@/components/assets/use-designs'
import {
  type DesignEntry,
  DESIGN_DIR,
  buildDesignGraph,
  designImagePath,
  designTitle,
} from '@/lib/designs'
import { getKind, kindLabel } from '@/lib/design-schema'
import { useTranslation, useLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type ViewMode = 'list' | 'grid'

/** Browse design documents stored under res://.design/. */
export const DesignGallery: FC<{ dir?: string }> = ({ dir = DESIGN_DIR }) => {
  const { t } = useTranslation()
  const locale = useLocale()
  const { designs, exists, loading, error, reload } = useDesigns(dir)

  const [previewSlug, setPreviewSlug] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('__all__')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ViewMode>('list')

  const [showSkeleton, setShowSkeleton] = useState(false)
  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowSkeleton(true), 200)
    return () => clearTimeout(timer)
  }, [loading])

  const graph = useMemo(() => buildDesignGraph(designs), [designs])

  // Type tabs derived from the actual designs present.
  const types = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of designs) {
      const ty = typeof d.meta.type === 'string' && d.meta.type ? d.meta.type : '__untyped__'
      counts.set(ty, (counts.get(ty) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [designs])

  // Tag cloud across the current type filter.
  const tags = useMemo(() => {
    const set = new Set<string>()
    for (const d of designs) {
      if (typeFilter !== '__all__') {
        const ty = typeof d.meta.type === 'string' && d.meta.type ? d.meta.type : '__untyped__'
        if (ty !== typeFilter) continue
      }
      const arr = Array.isArray(d.meta.tags) ? d.meta.tags : []
      for (const tg of arr) if (typeof tg === 'string') set.add(tg)
    }
    return Array.from(set).sort()
  }, [designs, typeFilter])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return designs.filter((d) => {
      if (typeFilter !== '__all__') {
        const ty = typeof d.meta.type === 'string' && d.meta.type ? d.meta.type : '__untyped__'
        if (ty !== typeFilter) return false
      }
      if (tagFilter) {
        const arr = Array.isArray(d.meta.tags) ? d.meta.tags : []
        if (!arr.includes(tagFilter)) return false
      }
      if (q) {
        const hay = `${designTitle(d)} ${d.slug} ${d.body}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [designs, typeFilter, tagFilter, query])

  const preview = previewSlug ? designs.find((d) => d.slug === previewSlug) ?? null : null
  const typeLabel = (ty: string) =>
    ty === '__untyped__' ? t('design.untyped') : kindLabel(getKind(ty), locale)

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar: count + view toggle + refresh */}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {loading ? t('common.loading') : t('design.designsCount', { count: filtered.length })}
          <span className="ml-1 opacity-60">{dir}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex items-center rounded-md border border-border/60 p-0.5">
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn('rounded p-1', view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground')}
              title={t('design.viewList')}
            >
              <ListIcon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              className={cn('rounded p-1', view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground')}
              title={t('design.viewGrid')}
            >
              <LayoutGridIcon className="size-3.5" />
            </button>
          </div>
          <TooltipIconButton tooltip={t('common.refresh')} side="bottom" onClick={reload}>
            <RefreshCwIcon className="size-3.5" />
          </TooltipIconButton>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('design.search')}
          className="w-full rounded-md border border-border/60 bg-background py-1.5 pl-7 pr-2 text-sm outline-none focus:border-border"
        />
      </div>

      {/* Type tabs */}
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1">
          <TypeTab active={typeFilter === '__all__'} onClick={() => setTypeFilter('__all__')}>
            {t('design.allTypes')} {designs.length}
          </TypeTab>
          {types.map(([ty, count]) => (
            <TypeTab key={ty} active={typeFilter === ty} onClick={() => { setTypeFilter(ty); setTagFilter(null) }}>
              {typeLabel(ty)} {count}
            </TypeTab>
          ))}
        </div>
      )}

      {/* Tag filter */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tg) => (
            <button
              key={tg}
              type="button"
              onClick={() => setTagFilter(tagFilter === tg ? null : tg)}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] transition-colors',
                tagFilter === tg
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {tg}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Body */}
      {loading && designs.length === 0 ? (
        showSkeleton ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : null
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-xs text-muted-foreground/70">
          <FileQuestionIcon className="size-6 opacity-50" />
          {exists ? t('design.noDesigns') : t('design.folderNotFound', { dir })}
          <span className="opacity-60">{t('design.noDesignsHint')}</span>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-2 @md:grid-cols-3">
          {filtered.map((design) => (
            <DesignGridCard
              key={design.path}
              design={design}
              dangling={(graph.dangling.get(design.slug)?.length ?? 0) > 0}
              onClick={() => setPreviewSlug(design.slug)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((design) => (
            <DesignListRow
              key={design.path}
              design={design}
              locale={locale}
              dangling={(graph.dangling.get(design.slug)?.length ?? 0) > 0}
              onClick={() => setPreviewSlug(design.slug)}
            />
          ))}
        </div>
      )}

      <DesignSheetDialog
        design={preview}
        designs={designs}
        graph={graph}
        onClose={() => setPreviewSlug(null)}
        onChanged={reload}
        onNavigate={(slug) => setPreviewSlug(slug)}
      />
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────

const TypeTab: FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
      active ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted',
    )}
  >
    {children}
  </button>
)

const DesignListRow: FC<{
  design: DesignEntry
  locale: 'en' | 'zh'
  dangling: boolean
  onClick: () => void
}> = ({ design, locale, dangling, onClick }) => {
  const image = designImagePath(design.meta)
  const tags = Array.isArray(design.meta.tags) ? design.meta.tags : []
  const type = typeof design.meta.type === 'string' ? design.meta.type : undefined
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 overflow-hidden rounded-lg border border-border/60 bg-card p-2 text-left transition-all hover:border-border hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="size-14 shrink-0 overflow-hidden rounded-md border border-border/50 bg-muted">
        {image ? (
          <AssetThumb path={image} className="size-full" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <PencilRulerIcon className="size-5 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{designTitle(design)}</span>
          {type && (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {kindLabel(getKind(type), locale)}
            </span>
          )}
          {dangling && (
            <AlertTriangleIcon className="size-3 shrink-0 text-amber-500" />
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 5).map((tag) => (
              <span key={String(tag)} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {String(tag)}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

const DesignGridCard: FC<{ design: DesignEntry; dangling: boolean; onClick: () => void }> = ({
  design,
  dangling,
  onClick,
}) => {
  const image = designImagePath(design.meta)
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card text-left transition-all hover:border-border hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {image ? (
          <AssetThumb path={image} className="size-full [&_img]:object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <PencilRulerIcon className="size-6 text-muted-foreground/40" />
          </div>
        )}
        {dangling && (
          <span className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5">
            <AlertTriangleIcon className="size-3 text-amber-500" />
          </span>
        )}
      </div>
      <span className="truncate px-2 py-1.5 text-xs font-medium">{designTitle(design)}</span>
    </button>
  )
}
