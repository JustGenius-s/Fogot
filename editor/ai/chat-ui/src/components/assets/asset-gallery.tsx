import { useEffect, useState, useCallback, type FC } from 'react'
import {
  RefreshCwIcon,
  Trash2Icon,
  ExternalLinkIcon,
  CopyIcon,
  MessageSquarePlusIcon,
  ImageIcon,
  ImageOffIcon,
} from 'lucide-react'
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
import { useAssets } from '@/components/assets/use-assets'
import { type AssetEntry, formatBytes, invalidateAsset, readAssetDataUrl, ASSETS_DIR } from '@/lib/assets'
import { bridgeRPC, openFile, addAttachment, setAppView } from '@/bridge'
import { useTranslation } from '@/lib/i18n'

interface AssetGalleryProps {
  dir?: string
  /** When provided, tiles become selectable and management actions are hidden. */
  onSelect?: (asset: AssetEntry) => void
  /** External reload signal increment (used after generation). */
  reloadToken?: number
}

export const AssetGallery: FC<AssetGalleryProps> = ({ dir = ASSETS_DIR, onSelect, reloadToken }) => {
  const { t } = useTranslation()
  const { assets, exists, loading, error, reload } = useAssets(dir)
  const [preview, setPreview] = useState<AssetEntry | null>(null)

  // Only show the skeleton once loading has lasted long enough to be perceptible.
  // The list RPC is usually near-instant, so showing it immediately causes a
  // jarring skeleton → empty-list flash on fast loads.
  const [showSkeleton, setShowSkeleton] = useState(false)
  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowSkeleton(true), 200)
    return () => clearTimeout(timer)
  }, [loading])

  // Re-run reload when the external token changes.
  const [lastToken, setLastToken] = useState(reloadToken)
  if (reloadToken !== lastToken) {
    setLastToken(reloadToken)
    reload()
  }

  const handleTileClick = (asset: AssetEntry) => {
    if (onSelect) onSelect(asset)
    else setPreview(asset)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {loading ? t('common.loading') : t('assets.assetsCount', { count: assets.length })}
          <span className="ml-1 opacity-60">{dir}</span>
        </span>
        <TooltipIconButton tooltip={t('common.refresh')} side="bottom" onClick={reload}>
          <RefreshCwIcon className="size-3.5" />
        </TooltipIconButton>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {loading && assets.length === 0 ? (
        showSkeleton ? (
          <div className="grid grid-cols-2 gap-2 @[18rem]:grid-cols-3 @[26rem]:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-lg" />
            ))}
          </div>
        ) : null
      ) : !loading && assets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-xs text-muted-foreground/70">
          <ImageOffIcon className="size-6 opacity-50" />
          {exists ? t('assets.noAssets') : t('assets.folderNotFound', { dir })}
          <span className="opacity-60">{t('assets.noAssetsHint')}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 @[18rem]:grid-cols-3 @[26rem]:grid-cols-4">
          {assets.map((asset) => (
            <button
              key={asset.path}
              type="button"
              onClick={() => handleTileClick(asset)}
              className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card text-left transition-all hover:border-border hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <AssetThumb path={asset.path} className="aspect-square w-full" />
              <div className="flex flex-col gap-0.5 px-2 py-1.5">
                <span className="truncate text-xs font-medium">{asset.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {formatBytes(asset.size)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <AssetPreviewDialog
        asset={preview}
        onClose={() => setPreview(null)}
        onChanged={reload}
      />
    </div>
  )
}

// ─── Preview / management dialog ──────────────────────────────────

const AssetPreviewDialog: FC<{
  asset: AssetEntry | null
  onClose: () => void
  onChanged: () => void
}> = ({ asset, onClose, onChanged }) => {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)

  // Load the full-res image data URL when asset changes.
  useEffect(() => {
    if (!asset) {
      setImgSrc(null)
      setImgDims(null)
      return
    }
    let cancelled = false
    setImgSrc(null)
    setImgDims(null)
    readAssetDataUrl(asset.path)
      .then((url) => {
        if (!cancelled) setImgSrc(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [asset])

  // Capture natural image dimensions on load.
  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImgDims({ w: img.naturalWidth, h: img.naturalHeight })
  }, [])

  // ── handlers ──

  const handleDelete = useCallback(async () => {
    if (!asset) return
    setBusy(true)
    try {
      await bridgeRPC('delete_file', { path: asset.path })
      invalidateAsset(asset.path)
      onChanged()
      onClose()
    } finally {
      setBusy(false)
    }
  }, [asset, onClose, onChanged])

  const handleUseInChat = useCallback(async () => {
    if (!asset) return
    try {
      const dataUrl = await readAssetDataUrl(asset.path)
      addAttachment(asset.path, dataUrl)
      setAppView('chat')
      onClose()
    } catch { /* ignore */ }
  }, [asset, onClose])

  const handleCopyPath = useCallback(() => {
    if (!asset) return
    navigator.clipboard?.writeText(asset.path).catch(() => {})
  }, [asset])

  if (!asset) return null

  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{asset.name}</DialogTitle>
        </DialogHeader>

        {/* Image preview — direct <img> so we can capture natural dimensions */}
        <div className="flex items-center justify-center overflow-hidden rounded-lg border bg-muted/20">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={asset.name}
              onLoad={handleImgLoad}
              className="max-h-[55vh] w-full object-contain"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center">
              <ImageIcon className="size-8 text-muted-foreground/20" />
            </div>
          )}
        </div>

        {/* Info bar: path, size, dimensions */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="truncate flex-1" title={asset.path}>{asset.path}</span>
          <span className="shrink-0 tabular-nums">{formatBytes(asset.size)}</span>
          {imgDims && (
            <span className="shrink-0 tabular-nums text-muted-foreground/70">
              {imgDims.w} × {imgDims.h}
            </span>
          )}
        </div>

        {/* ── Primary CTA ── */}
        <Button onClick={handleUseInChat} className="w-full">
          <MessageSquarePlusIcon className="size-4" />
          {t('assets.useInChat')}
        </Button>

        {/* ── Secondary actions ── */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openFile(asset.path)} className="flex-1">
            <ExternalLinkIcon className="size-3.5" />
            {t('assets.openInEditor')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyPath} className="flex-1">
            <CopyIcon className="size-3.5" />
            {t('common.copyPath')}
          </Button>
        </div>

        {/* ── Danger zone — visually separated from main actions ── */}
        <div className="-mx-4 -mb-4 mt-1 flex items-center justify-between rounded-b-xl border-t border-border/40 bg-muted/20 px-4 py-3">
          <span className="text-[11px] text-muted-foreground/50">{t('common.dangerZone')}</span>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={handleDelete}
          >
            <Trash2Icon className="size-3.5" />
            {t('common.delete')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
