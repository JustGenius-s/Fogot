import { useState, type FC } from 'react'
import {
  RefreshCwIcon,
  Trash2Icon,
  ExternalLinkIcon,
  CopyIcon,
  MessageSquarePlusIcon,
  ImageOffIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { AssetThumb } from '@/components/assets/asset-thumb'
import { useAssets } from '@/components/assets/use-assets'
import { type AssetEntry, formatBytes, invalidateAsset, readAssetDataUrl, ASSETS_DIR } from '@/lib/assets'
import { bridgeRPC, openFile, addAttachment, setAppView } from '@/bridge'

interface AssetGalleryProps {
  dir?: string
  /** When provided, tiles become selectable and management actions are hidden. */
  onSelect?: (asset: AssetEntry) => void
  /** External reload signal increment (used after generation). */
  reloadToken?: number
}

export const AssetGallery: FC<AssetGalleryProps> = ({ dir = ASSETS_DIR, onSelect, reloadToken }) => {
  const { assets, exists, loading, error, reload } = useAssets(dir)
  const [preview, setPreview] = useState<AssetEntry | null>(null)

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
          {loading ? 'Loading…' : `${assets.length} assets`}
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

      {loading && assets.length === 0 ? (
        <div className="grid grid-cols-2 gap-2 @[18rem]:grid-cols-3 @[26rem]:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      ) : !loading && assets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-xs text-muted-foreground/70">
          <ImageOffIcon className="size-6 opacity-50" />
          {exists ? 'No image assets in this folder' : `Folder not found: ${dir}`}
          <span className="opacity-60">Generate in Image mode, or add images to this folder</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 @[18rem]:grid-cols-3 @[26rem]:grid-cols-4">
          {assets.map((asset) => (
            <button
              key={asset.path}
              type="button"
              onClick={() => handleTileClick(asset)}
              className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card text-left transition-colors hover:border-border hover:bg-muted/40"
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
  const [busy, setBusy] = useState(false)

  if (!asset) return null

  const handleDelete = async () => {
    setBusy(true)
    try {
      await bridgeRPC('delete_file', { path: asset.path })
      invalidateAsset(asset.path)
      onClose()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const handleUseInChat = async () => {
    try {
      const dataUrl = await readAssetDataUrl(asset.path)
      addAttachment(asset.path, dataUrl)
      setAppView('chat')
      onClose()
    } catch { /* ignore */ }
  }

  const handleCopyPath = () => {
    navigator.clipboard?.writeText(asset.path).catch(() => {})
  }

  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate">{asset.name}</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[55vh] items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
          <AssetThumb path={asset.path} className="max-h-[55vh] w-full" />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{asset.path}</span>
          <span className="shrink-0 pl-2">{formatBytes(asset.size)}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleUseInChat}>
            <MessageSquarePlusIcon className="size-3.5" />
            Use in chat
          </Button>
          <Button variant="outline" size="sm" onClick={() => openFile(asset.path)}>
            <ExternalLinkIcon className="size-3.5" />
            Open in editor
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyPath}>
            <CopyIcon className="size-3.5" />
            Copy path
          </Button>
        </div>

        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={handleDelete}
          >
            <Trash2Icon className="size-3.5" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
