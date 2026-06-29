/**
 * Shared image-generation core.
 *
 * Used by both the `generate_image` chat tool and the asset generator panel.
 * Handles the API call, Canvas re-encoding (so the output matches the target
 * extension), and writing the result back into the project via the bridge.
 *
 * Providers are registered in priority order — the first match wins.
 * Each provider implements {@link ImageProvider} and lives under `./providers/`.
 */

import { bridgeRPC, getImageModels, type ModelConfig } from '@/bridge'
import { devProxiedFetch } from '@/lib/dev-proxy'
import { OpenAIProvider } from '@/lib/providers/openai'
import { MinimaxProvider } from '@/lib/providers/minimax'
import { ApimartProvider } from '@/lib/providers/apimart'

// ─── Public utilities ──────────────────────────────────────────────

export function getMimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? 'png'
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    tga: 'image/x-tga',
  }
  return map[ext] ?? 'image/png'
}

export function loadImage(base64: string, mime: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:${mime};base64,${base64}`
  })
}

export function detectMimeFromB64(b64: string): string {
  const header = b64.slice(0, 16)
  if (header.startsWith('iVBOR')) return 'image/png'
  if (header.startsWith('/9j/')) return 'image/jpeg'
  if (header.startsWith('UklGR')) return 'image/webp'
  if (header.startsWith('R0lGO')) return 'image/gif'
  if (header.startsWith('Qk')) return 'image/bmp'
  return 'image/png'
}

// ─── Public types ──────────────────────────────────────────────────

export interface GenerateImageOptions {
  prompt: string
  size?: string
  resolution?: string
  quality?: string
  background?: string
  referenceImage?: string | string[]
  model?: ModelConfig
}

export interface GenerateImageDataResult {
  success: boolean
  dataUrl?: string
  mediaType?: string
  revisedPrompt?: string
  error?: string
}

export interface GenerateAndSaveOptions extends GenerateImageOptions {
  output: string
}

export interface GenerateImageResult {
  success: boolean
  path?: string
  dataUrl?: string
  revisedPrompt?: string
  error?: string
}

// ─── Internal types ────────────────────────────────────────────────

export interface ImageModelCall {
  b64?: string
  mediaType?: string
  revisedPrompt?: string
  error?: string
}

export interface ReferenceImageData {
  base64: string
  mime: string
}

// ─── Provider interface ────────────────────────────────────────────

export interface ImageProvider {
  readonly id: string
  matches(model: ModelConfig): boolean
  generate(opts: GenerateImageOptions, model: ModelConfig): Promise<ImageModelCall>
}

// ─── Shared helpers (exported for providers) ───────────────────────

export function authHeaders(model: ModelConfig): HeadersInit {
  if (model.authMode === 'none') return {}
  return { Authorization: `Bearer ${model.apiKey.trim()}` }
}

export async function readReferenceImage(ref: string): Promise<ReferenceImageData> {
  if (ref.startsWith('data:')) {
    return {
      base64: ref.split(',')[1] ?? '',
      mime: ref.match(/^data:([^;,]+)/)?.[1] ?? 'image/png',
    }
  }
  return {
    base64: await bridgeRPC('read_file', { path: ref, binary: true }),
    mime: getMimeFromPath(ref),
  }
}

export async function downloadImageUrl(
  url: string,
  revisedPrompt?: string,
): Promise<ImageModelCall> {
  const resp = await devProxiedFetch(url)
  const blob = await resp.blob()
  const b64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  return { b64, mediaType: blob.type || 'image/png', revisedPrompt }
}

export function formatApiError(status: number, body: string): string {
  const trimmed = body.trim()
  if (/<html|<!doctype html|you need to enable javascript/i.test(trimmed)) {
    return (
      `API endpoint returned HTML instead of JSON (HTTP ${status}). ` +
      `Please check the API Endpoint in Settings.`
    )
  }
  return `API request failed (${status}): ${trimmed}`
}

export function findImageUrl(data: any): string | undefined {
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' ? v : Array.isArray(v) ? v.find((i): i is string => typeof i === 'string') : undefined

  const direct = str(data?.url)
  if (direct) return direct

  const fromResult = str(data?.result?.url)
  if (fromResult) return fromResult

  const images = data?.result?.images
  if (Array.isArray(images)) {
    for (const img of images) {
      const u = str(img?.url)
      if (u) return u
    }
  }
  return undefined
}

export const RATIO_PIXEL_MAP: Record<string, Record<string, string>> = {
  '1:1':  { '1k': '1024x1024',  '2k': '2048x2048',  '4k': '2880x2880' },
  '3:2':  { '1k': '1536x1024',  '2k': '2048x1360',  '4k': '3520x2336' },
  '2:3':  { '1k': '1024x1536',  '2k': '1360x2048',  '4k': '2336x3520' },
  '4:3':  { '1k': '1024x768',   '2k': '2048x1536',  '4k': '3312x2480' },
  '3:4':  { '1k': '768x1024',   '2k': '1536x2048',  '4k': '2480x3312' },
  '5:4':  { '1k': '1280x1024',  '2k': '2560x2048',  '4k': '3216x2576' },
  '4:5':  { '1k': '1024x1280',  '2k': '2048x2560',  '4k': '2576x3216' },
  '16:9': { '1k': '1536x864',   '2k': '2048x1152',  '4k': '3840x2160' },
  '9:16': { '1k': '864x1536',   '2k': '1152x2048',  '4k': '2160x3840' },
  '2:1':  { '1k': '2048x1024',  '2k': '2688x1344',  '4k': '3840x1920' },
  '1:2':  { '1k': '1024x2048',  '2k': '1344x2688',  '4k': '1920x3840' },
  '3:1':  { '1k': '1536x512',   '2k': '3072x1024',  '4k': '3840x1280' },
  '1:3':  { '1k': '512x1536',   '2k': '1024x3072',  '4k': '1280x3840' },
  '21:9': { '1k': '2016x864',   '2k': '2688x1152',  '4k': '3840x1648' },
  '9:21': { '1k': '864x2016',   '2k': '1152x2688',  '4k': '1648x3840' },
}

export function ratioToPixels(ratio: string, resolution: string): string | undefined {
  return RATIO_PIXEL_MAP[ratio]?.[resolution]
}

export function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// ─── Provider registry ─────────────────────────────────────────────
//
// Ordered by specificity — the first matching provider wins.
// OpenAIProvider is last as the catch-all for unknown endpoints.

const registry: ImageProvider[] = [
  new ApimartProvider(),
  new MinimaxProvider(),
  new OpenAIProvider(),
]

function resolveProvider(model: ModelConfig): ImageProvider | undefined {
  return registry.find(p => p.matches(model))
}

// ─── Core dispatcher ───────────────────────────────────────────────

async function callImageModel(opts: GenerateImageOptions): Promise<ImageModelCall> {
  const model = opts.model ?? getImageModels()[0]

  if (!model || !model.apiEndpoint || !model.model) {
    return { error: 'No image model configured. Add one in Settings → Image Models.' }
  }
  if (model.authMode !== 'none' && !model.apiKey) {
    return { error: 'Image model has no API Key configured.' }
  }

  const provider = resolveProvider(model)
  if (!provider) {
    return { error: 'No image provider matched. Set the "provider" field or check the API endpoint.' }
  }
  return await provider.generate(opts, model)
}

// ─── Public API ────────────────────────────────────────────────────

export async function generateImageData(
  opts: GenerateImageOptions,
): Promise<GenerateImageDataResult> {
  const call = await callImageModel(opts)
  if (call.error || !call.b64) {
    return { success: false, error: call.error ?? 'No image data' }
  }
  const mediaType = call.mediaType ?? 'image/png'
  return {
    success: true,
    dataUrl: `data:${mediaType};base64,${call.b64}`,
    mediaType,
    revisedPrompt: call.revisedPrompt,
  }
}

export async function generateImageAsset(
  opts: GenerateAndSaveOptions,
): Promise<GenerateImageResult> {
  const call = await callImageModel(opts)
  if (call.error || !call.b64) {
    return { success: false, error: call.error ?? 'No image data' }
  }

  try {
    const img = await loadImage(call.b64, call.mediaType ?? 'image/png')
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const outMime = getMimeFromPath(opts.output)
    const dataUrl = canvas.toDataURL(outMime)
    const encodedB64 = dataUrl.split(',')[1]!

    await bridgeRPC('write_file', {
      path: opts.output,
      content: encodedB64,
      binary: true,
    })

    return { success: true, path: opts.output, dataUrl, revisedPrompt: call.revisedPrompt }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: `Image generation failed: ${msg}` }
  }
}
