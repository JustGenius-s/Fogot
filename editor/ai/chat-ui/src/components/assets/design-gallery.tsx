import { useEffect, useState, type FC } from 'react'
import {
  RefreshCwIcon,
  Trash2Icon,
  CopyIcon,
  PencilRulerIcon,
  FileQuestionIcon,
} from 'lucide-react'
import { Streamdown } from 'streamdown'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { AssetThumb } from '@/components/assets/asset-thumb'
import { useDesigns } from '@/components/assets/use-designs'
import {
  type DesignEntry,
  DESIGN_DIR,
  designImagePath,
  designTitle,
} from '@/lib/designs'
import { bridgeRPC } from '@/bridge'

/** Browse design documents stored under res://.design/. */
export const DesignGallery: FC<{ dir?: string }> = ({ dir = DESIGN_DIR }) => {
  const { designs, exists, loading, error, reload } = useDesigns(dir)
  const [preview, setPreview] = useState<DesignEntry | null>(null)

  const [showSkeleton, setShowSkeleton] = useState(false)
  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowSkeleton(true), 200)
    return () => clearTimeout(timer)
  }, [loading])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {loading ? 'Loading…' : `${designs.length} designs`}
          <span className="ml-1 opacity-60">{dir}</span>
        </span>
        <TooltipIconButton tooltip="Refresh" side="bottom" onClick={reload}>
          <RefreshCwIcon className="size-3.5" />
        </TooltipIconButton>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {loading && designs.length === 0 ? (
        showSkeleton ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : null
      ) : !loading && designs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-xs text-muted-foreground/70">
          <FileQuestionIcon className="size-6 opacity-50" />
          {exists ? 'No designs yet' : `Folder not found: ${dir}`}
          <span className="opacity-60">Switch to Design mode and ask the AI to design something</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {designs.map((design) => {
            const image = designImagePath(design.meta)
            const tags = Array.isArray(design.meta.tags) ? design.meta.tags : []
            return (
              <button
                key={design.path}
                type="button"
                onClick={() => setPreview(design)}
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
                    {typeof design.meta.type === 'string' && design.meta.type && (
                      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {design.meta.type}
                      </span>
                    )}
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tags.slice(0, 5).map((tag) => (
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
              </button>
            )
          })}
        </div>
      )}

      <DesignPreviewDialog
        design={preview}
        onClose={() => setPreview(null)}
        onChanged={reload}
      />
    </div>
  )
}

// ─── Preview dialog ───────────────────────────────────────────────

const DesignPreviewDialog: FC<{
  design: DesignEntry | null
  onClose: () => void
  onChanged: () => void
}> = ({ design, onClose, onChanged }) => {
  const [busy, setBusy] = useState(false)

  if (!design) return null

  const image = designImagePath(design.meta)

  const handleDelete = async () => {
    setBusy(true)
    try {
      await bridgeRPC('delete_file', { path: design.path })
      onChanged()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const handleCopyPath = () => {
    navigator.clipboard?.writeText(design.path).catch(() => {})
  }

  return (
    <Dialog open={!!design} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{designTitle(design)}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {image && (
            <div className="mb-3 overflow-hidden rounded-lg border bg-muted/20">
              <AssetThumb path={image} className="max-h-64 w-full" />
            </div>
          )}
          <div className="aui-md text-sm">
            <Streamdown mode="static">{design.body}</Streamdown>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex-1 truncate" title={design.path}>{design.path}</span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyPath} className="flex-1">
            <CopyIcon className="size-3.5" />
            Copy Path
          </Button>
        </div>

        <div className="-mx-4 -mb-4 mt-1 flex items-center justify-between rounded-b-xl border-t border-border/40 bg-muted/20 px-4 py-3">
          <span className="text-[11px] text-muted-foreground/50">Danger zone</span>
          <Button variant="destructive" size="sm" disabled={busy} onClick={handleDelete}>
            <Trash2Icon className="size-3.5" />
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
