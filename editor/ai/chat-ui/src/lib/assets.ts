/**
 * Asset (image) management helpers.
 *
 * Lists image assets from the project via the structured `list_assets` C++ RPC
 * and lazily loads thumbnails as data URLs (cached, since reading binary files
 * over the bridge is relatively expensive).
 */

import { bridgeRPC } from '@/bridge'
import { getMimeFromPath } from '@/lib/image-gen'

/** Default project directory that holds managed assets. */
export const ASSETS_DIR = 'res://assets/'

export interface AssetEntry {
  path: string
  name: string
  ext: string
  size: number
}

interface ListAssetsResponse {
  dir: string
  exists: boolean
  assets: AssetEntry[]
}

/** List image assets under a directory (defaults to {@link ASSETS_DIR}). */
export async function listAssets(dir: string = ASSETS_DIR): Promise<ListAssetsResponse> {
  const raw = await bridgeRPC('list_assets', { dir, recursive: true })
  try {
    const parsed = JSON.parse(raw) as ListAssetsResponse
    return {
      dir: parsed.dir ?? dir,
      exists: !!parsed.exists,
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    }
  } catch {
    return { dir, exists: false, assets: [] }
  }
}

// ─── Thumbnail / data-URL cache ───────────────────────────────────

const dataUrlCache = new Map<string, string>()

/**
 * Read an asset as a data URL, suitable for `<img src>` previews and chat
 * attachments. Results are cached by path; call {@link invalidateAsset} after
 * a write/delete to refresh.
 */
export async function readAssetDataUrl(path: string): Promise<string> {
  const cached = dataUrlCache.get(path)
  if (cached) return cached

  const base64 = await bridgeRPC('read_file', { path, binary: true })
  const dataUrl = `data:${getMimeFromPath(path)};base64,${base64}`
  dataUrlCache.set(path, dataUrl)
  return dataUrl
}

/** Map a file extension to an audio MIME type. */
export function getAudioMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? 'mp3'
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    pcm: 'audio/L16',
  }
  return map[ext] ?? 'audio/mpeg'
}

/**
 * Read an audio asset as a data URL, suitable for `<audio src>` playback.
 * Cached by path (shares the image data-URL cache); use {@link invalidateAsset}
 * to refresh after the file changes.
 */
export async function readAudioDataUrl(path: string): Promise<string> {
  const cached = dataUrlCache.get(path)
  if (cached) return cached

  const base64 = await bridgeRPC('read_file', { path, binary: true })
  const dataUrl = `data:${getAudioMime(path)};base64,${base64}`
  dataUrlCache.set(path, dataUrl)
  return dataUrl
}

/** Drop a cached data URL (e.g. after the file was overwritten or deleted). */
export function invalidateAsset(path: string) {
  dataUrlCache.delete(path)
}

export function clearAssetCache() {
  dataUrlCache.clear()
}

// ─── Saving generated images ──────────────────────────────────────

function extFromMime(mime?: string): string {
  switch (mime) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/bmp':
      return 'bmp'
    default:
      return 'png'
  }
}

/**
 * Persist a generated image (data URL) into the asset library under
 * `res://assets/generated/`. Returns the saved res:// path.
 */
export async function saveGeneratedImage(
  dataUrl: string,
  mimeType?: string,
): Promise<string> {
  const mime = mimeType ?? dataUrl.match(/^data:([^;,]+)/)?.[1] ?? 'image/png'
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
  const path = `${ASSETS_DIR}generated/img-${Date.now()}.${extFromMime(mime)}`
  await bridgeRPC('write_file', { path, content: base64, binary: true })
  invalidateAsset(path)
  return path
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
