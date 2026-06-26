import { useEffect, useState, useMemo, useCallback, type FC } from 'react'
import {
  RefreshCwIcon,
  Trash2Icon,
  ExternalLinkIcon,
  CopyIcon,
  MessageSquarePlusIcon,
  ImageIcon,
  ImageOffIcon,
  FolderIcon,
  ChevronDownIcon,
  SearchIcon,
  XIcon,
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

/** Group a flat asset list by parent directory. */
function groupByDir(
  assets: AssetEntry[],
  baseDir: string,
): { dir: string; label: string; assets: AssetEntry[] }[] {
  const map = new Map<string, AssetEntry[]>()
  for (const a of assets) {
    const dir = a.path.slice(0, a.path.lastIndexOf('/') + 1)
    const list = map.get(dir)
    if (list) list.push(a)
    else map.set(dir, [a])
  }
  const base = baseDir.endsWith('/') ? baseDir : baseDir + '/'
  return Array.from(map, ([dir, items]) => ({
    dir,
    label: dir === base ? '/' : dir.slice(base.length).replace(/\/$/, ''),
    assets: items,
  })).sort((a, b) => a.dir.localeCompare(b.dir))
}

/** Fuzzy-match: every character of the query appears in order in the target. */
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

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
  const [query, setQuery] = useState('')

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

  const filtered = useMemo(
    () => query ? assets.filter((a) => fuzzyMatch(query, a.name)) : assets,
    [assets, query],
  )
  const groups = useMemo(() => groupByDir(filtered, dir), [filtered, dir])
  const hasMultipleDirs = groups.length > 1

  const handleTileClick = (asset: AssetEntry) => {
    if (onSelect) onSelect(asset)
    else setPreview(asset)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('assets.search')}
            className="h-7 w-full rounded-md border border-border/60 bg-background pl-7 pr-7 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
            >
              <XIcon className="size-3" />
            </button>
          )}
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
          {loading ? '…' : filtered.length !== assets.length
            ? `${filtered.length}/${assets.length}`
            : assets.length}
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
      ) : hasMultipleDirs ? (
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <AssetDirGroup
              key={g.dir}
              label={g.label}
              assets={g.assets}
              onTileClick={handleTileClick}
            />
          ))}
        </div>
      ) : (
        <AssetGrid assets={assets} onTileClick={handleTileClick} />
      )}

      <AssetPreviewDialog
        asset={preview}
        onClose={() => setPreview(null)}
        onChanged={reload}
      />
    </div>
  )
}

// ─── Shared tile grid ─────────────────────────────────────────────

const AssetGrid: FC<{
  assets: AssetEntry[]
  onTileClick: (a: AssetEntry) => void
}> = ({ assets, onTileClick }) => (
  <div className="grid grid-cols-2 gap-2 @[18rem]:grid-cols-3 @[26rem]:grid-cols-4">
    {assets.map((asset) => (
      <button
        key={asset.path}
        type="button"
        onClick={() => onTileClick(asset)}
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
)

// ─── Collapsible directory group ──────────────────────────────────

const AssetDirGroup: FC<{
  label: string
  assets: AssetEntry[]
  onTileClick: (a: AssetEntry) => void
}> = ({ label, assets, onTileClick }) => {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-xs text-muted-foreground hover:bg-muted/40"
      >
        <ChevronDownIcon
          className={`size-3.5 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <FolderIcon className="size-3.5 shrink-0 opacity-60" />
        <span className="truncate font-medium">{label}</span>
        <span className="ml-auto shrink-0 tabular-nums opacity-50">
          {assets.length}
        </span>
      </button>
      {open && (
        <div className="mt-1">
          <AssetGrid assets={assets} onTileClick={onTileClick} />
        </div>
      )}
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
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {/* ── Hero image ── */}
        <div className="relative w-full shrink-0 overflow-hidden bg-muted sm:rounded-t-xl">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={asset.name}
              onLoad={handleImgLoad}
              className="max-h-[50vh] w-full object-contain"
            />
          ) : (
            <div className="flex h-44 w-full items-center justify-center">
              <ImageIcon className="size-8 animate-pulse text-muted-foreground/20" />
            </div>
          )}
          {imgDims && (
            <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">
              {imgDims.w} × {imgDims.h}
            </span>
          )}
        </div>

        {/* ── Info ── */}
        <div className="flex items-center gap-3 border-b border-border/40 px-5 py-3">
          <div className="min-w-0 flex-1">
            <DialogHeader>
              <DialogTitle className="truncate">{asset.name}</DialogTitle>
            </DialogHeader>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={asset.path}>
              {asset.path}
            </p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatBytes(asset.size)}
          </span>
        </div>

        {/* ── Footer toolbar ── */}
        <div className="flex shrink-0 items-center gap-2 bg-muted/20 px-5 py-3">
          <TooltipIconButton
            tooltip={t('assets.openInEditor')}
            side="top"
            className="size-7"
            onClick={() => openFile(asset.path)}
          >
            <ExternalLinkIcon className="size-3.5" />
          </TooltipIconButton>
          <TooltipIconButton
            tooltip={t('common.copyPath')}
            side="top"
            className="size-7"
            onClick={handleCopyPath}
          >
            <CopyIcon className="size-3.5" />
          </TooltipIconButton>
          <TooltipIconButton
            tooltip={t('common.delete')}
            side="top"
            className="size-7 text-destructive hover:bg-destructive/10"
            disabled={busy}
            onClick={handleDelete}
          >
            <Trash2Icon className="size-3.5" />
          </TooltipIconButton>
          <div className="flex-1" />
          <Button size="sm" onClick={handleUseInChat}>
            <MessageSquarePlusIcon className="size-3.5" />
            {t('assets.useInChat')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
