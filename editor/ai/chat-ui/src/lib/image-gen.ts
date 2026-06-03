/**
 * Shared image-generation core.
 *
 * Used by both the `generate_image` chat tool and the asset generator panel.
 * Handles the API call, Canvas re-encoding (so the output matches the target
 * extension), and writing the result back into the project via the bridge.
 *
 * Two backend paths:
 *   1. OpenAI-compatible  — sync b64_json / URL / async task_id
 *   2. APIMart            — submit task → poll /v1/tasks/{id}
 */

import { bridgeRPC, getImageModels, type ModelConfig } from '@/bridge'

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

/** Detect image MIME from base64-encoded magic bytes. */
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
  /** Aspect ratio (e.g. "16:9") or pixel size (e.g. "1024x1024"). */
  size?: string
  /** Resolution tier: "1k" | "2k" | "4k". APIMart-specific. */
  resolution?: string
  /** Quality tier: "auto" | "low" | "medium" | "high". */
  quality?: string
  /**
   * Optional reference image(s) for img2img. Accepts either a data URL
   * (`data:image/...;base64,...`) or a project `res://` path.
   * A single string or an array of strings (APIMart supports multiple).
   */
  referenceImage?: string | string[]
  /** Override the image model. Defaults to the first configured image model. */
  model?: ModelConfig
}

export interface GenerateImageDataResult {
  success: boolean
  /** Data URL of the generated image, for preview / later saving. */
  dataUrl?: string
  mediaType?: string
  revisedPrompt?: string
  error?: string
}

export interface GenerateAndSaveOptions extends GenerateImageOptions {
  /** Output res:// path. The image is re-encoded to match its extension. */
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

interface ImageModelCall {
  b64?: string
  mediaType?: string
  revisedPrompt?: string
  error?: string
}

interface ReferenceImageData {
  base64: string
  mime: string
}

// ─── Shared helpers ────────────────────────────────────────────────

function authHeaders(model: ModelConfig): HeadersInit {
  if (model.authMode === 'none') return {}
  return { Authorization: `Bearer ${model.apiKey.trim()}` }
}

async function readReferenceImage(ref: string): Promise<ReferenceImageData> {
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

/** Download an image URL and return it as a base64 ImageModelCall. */
async function downloadImageUrl(
  url: string,
  revisedPrompt?: string,
): Promise<ImageModelCall> {
  const resp = await fetch(url)
  const blob = await resp.blob()
  const b64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  return { b64, mediaType: blob.type || 'image/png', revisedPrompt }
}

function formatApiError(status: number, body: string): string {
  const trimmed = body.trim()
  if (/<html|<!doctype html|you need to enable javascript/i.test(trimmed)) {
    return (
      `API endpoint returned HTML instead of JSON (HTTP ${status}). ` +
      `Please check the API Endpoint in Settings.`
    )
  }
  return `API request failed (${status}): ${trimmed}`
}

/**
 * Walk a loosely-typed JSON response and find the first image URL string.
 *
 * Handles shapes returned by different providers:
 *   - `{ url: "…" }`
 *   - `{ url: ["…"] }`
 *   - `{ result: { url: "…" } }`
 *   - `{ result: { images: [{ url: "…" }] } }`  — APIMart
 *   - `{ result: { images: [{ url: ["…"] }] } }` — APIMart variant
 */
function findImageUrl(data: any): string | undefined {
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

// ─── OpenAI-compatible backend ─────────────────────────────────────

function resolveOpenAIUrls(endpoint: string): { apiBase: string; apiUrl: string } {
  const trimmed = endpoint.trim().replace(/\/+$/, '')
  if (/\/images\/generations$/i.test(trimmed)) {
    return {
      apiBase: trimmed.replace(/\/images\/generations$/i, ''),
      apiUrl: trimmed,
    }
  }
  return { apiBase: trimmed, apiUrl: `${trimmed}/images/generations` }
}

async function pollOpenAITask(
  baseUrl: string,
  taskId: string,
  model: ModelConfig,
  maxAttempts = 60,
  intervalMs = 2000,
): Promise<ImageModelCall> {
  const taskUrl = `${baseUrl}/tasks/${taskId}`

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs))
    try {
      const resp = await fetch(taskUrl, { headers: authHeaders(model) })
      const json = await resp.json()
      const data = Array.isArray(json.data) ? json.data[0] : json.data

      if (data?.status === 'completed' || data?.status === 'succeeded') {
        const b64 = data.b64_json || data.image || data.result?.b64_json
        if (b64) {
          return { b64, mediaType: detectMimeFromB64(b64), revisedPrompt: data.revised_prompt }
        }
        const url = findImageUrl(data)
        if (url) return await downloadImageUrl(url, data.revised_prompt)
        return { error: 'Task completed but no image data found' }
      }

      if (data?.status === 'failed' || data?.status === 'error' || data?.status === 'cancelled') {
        return { error: data.error || data.message || 'Image generation task failed' }
      }
    } catch {
      // Transient network errors — retry on next interval.
    }
  }
  return { error: `Timed out waiting for image generation (task ${taskId})` }
}

async function callOpenAI(opts: GenerateImageOptions): Promise<ImageModelCall> {
  const { prompt, size, resolution, quality, referenceImage: refOpt } = opts
  const model = opts.model ?? getImageModels()[0]
  if (!model) return { error: 'No image model configured.' }

  // OpenAI-compatible path uses only the first reference image.
  const referenceImage = Array.isArray(refOpt) ? refOpt[0] : refOpt

  const { apiBase, apiUrl } = resolveOpenAIUrls(model.apiEndpoint)

  const doRequest = async (body: Record<string, unknown>) => {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(model) },
      body: JSON.stringify(body),
    })
    const text = await resp.text()
    if (!resp.ok) return { ok: false as const, status: resp.status, body: text }
    try {
      return { ok: true as const, json: JSON.parse(text) }
    } catch {
      return { ok: false as const, status: resp.status, body: text }
    }
  }

  try {
    const body: Record<string, unknown> = { model: model.model, prompt, n: 1 }

    if (size?.trim()) {
      const ratio = size.trim()
      const res = resolution?.trim() || '1k'
      const pixels = ratioToPixels(ratio, res)
      body.size = pixels ?? ratio
    }
    if (quality?.trim()) body.quality = quality.trim()

    let refBase64 = ''
    let refMime = 'image/png'
    if (referenceImage) {
      const ref = await readReferenceImage(referenceImage)
      refBase64 = ref.base64
      refMime = ref.mime
      body.image = refBase64
    }

    let res = await doRequest(body)

    // Fallback #1: wrap as data URL
    if (!res.ok && referenceImage && /url/i.test(res.body)) {
      body.image = `data:${refMime};base64,${refBase64}`
      res = await doRequest(body)
    }
    // Fallback #2: image_urls array (GPT-image-2 style)
    if (!res.ok && referenceImage && /pattern|match|unrecogni/i.test(res.body)) {
      delete body.image
      body.image_urls = [`data:${refMime};base64,${refBase64}`]
      res = await doRequest(body)
    }
    // Fallback #3: drop reference image entirely
    if (!res.ok && referenceImage) {
      delete body.image
      delete (body as any).image_urls
      if (size) delete body.size
      res = await doRequest(body)
    }

    if (!res.ok) return { error: formatApiError(res.status, res.body) }

    const data = Array.isArray(res.json.data) ? res.json.data[0] : (res.json.data ?? res.json)

    if (data?.b64_json) {
      return { b64: data.b64_json, mediaType: detectMimeFromB64(data.b64_json), revisedPrompt: data.revised_prompt }
    }
    if (data?.url) {
      try { return await downloadImageUrl(data.url, data.revised_prompt) }
      catch { return { error: 'Failed to download generated image from URL' } }
    }
    if (data?.task_id) {
      return await pollOpenAITask(apiBase, data.task_id, model)
    }
    return { error: 'No image data in API response' }
  } catch (e: unknown) {
    return { error: `Image generation failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// ─── APIMart backend ───────────────────────────────────────────────
//
// Config: apiEndpoint = "https://api.apimart.ai/v1"
//
// Flow:
//   1. (optional) Upload reference image → POST /uploads/images
//   2. Create generation task            → POST /images/generations
//   3. Poll task status                  → GET  /tasks/{id}?language=zh
//   4. Download result image URL

function isApimartEndpoint(url: string): boolean {
  try { return new URL(url).hostname.endsWith('apimart.ai') }
  catch { return /apimart\.ai/i.test(url) }
}

/**
 * APIMart ratio × resolution → pixel mapping (from official docs).
 * Used both for APIMart (pixel fallback) and OpenAI-compatible (size conversion).
 */
const RATIO_PIXEL_MAP: Record<string, Record<string, string>> = {
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

/** Convert an aspect ratio + resolution tier to a pixel size string. */
function ratioToPixels(ratio: string, resolution: string): string | undefined {
  return RATIO_PIXEL_MAP[ratio]?.[resolution]
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** Legacy: convert pixel size `2048x1152` → ratio + resolution on `body`. */
function normalizeApimartSize(body: Record<string, unknown>): void {
  if (typeof body.size !== 'string') return
  const m = body.size.match(/^(\d+)x(\d+)$/)
  if (!m) return

  const w = Number(m[1])
  const h = Number(m[2])
  const d = gcd(w, h)
  body.size = `${w / d}:${h / d}`

  if (!body.resolution) {
    const longest = Math.max(w, h)
    body.resolution = longest <= 1024 ? '1k' : longest <= 2048 ? '2k' : '4k'
  }
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function uploadApimartImage(
  base: string,
  model: ModelConfig,
  ref: ReferenceImageData,
): Promise<string> {
  const form = new FormData()
  form.append('file', base64ToBlob(ref.base64, ref.mime), 'reference.png')

  const resp = await fetch(`${base}/uploads/images`, {
    method: 'POST',
    headers: authHeaders(model),
    body: form,
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(formatApiError(resp.status, text))

  const json = JSON.parse(text)
  const url = json.url ?? json.data?.url
  if (!url) throw new Error('APIMart upload returned no image URL')
  return url
}

async function pollApimartTask(
  base: string,
  taskId: string,
  model: ModelConfig,
  maxAttempts = 90,
  intervalMs = 2000,
): Promise<ImageModelCall> {
  const url = `${base}/tasks/${taskId}?language=zh`

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs))
    try {
      const resp = await fetch(url, { headers: authHeaders(model) })
      if (!resp.ok) continue

      const json = JSON.parse(await resp.text())
      const data = Array.isArray(json.data) ? json.data[0] : (json.data ?? json)
      const status = data?.status ?? json.status

      if (status === 'completed' || status === 'succeeded') {
        const imageUrl = findImageUrl(data)
        if (imageUrl) return await downloadImageUrl(imageUrl)
        return { error: 'APIMart task completed but no image URL was returned' }
      }
      if (status === 'failed' || status === 'error' || status === 'cancelled') {
        return { error: data?.fail_reason || data?.error || data?.message || 'APIMart task failed' }
      }
    } catch {
      // Transient polling error — retry on next interval.
    }
  }
  return { error: `Timed out waiting for APIMart task (${taskId})` }
}

async function callApimart(opts: GenerateImageOptions): Promise<ImageModelCall> {
  const { prompt, size, resolution, quality, referenceImage } = opts
  const model = opts.model ?? getImageModels()[0]
  if (!model) return { error: 'No image model configured.' }

  try {
    const base = model.apiEndpoint.trim().replace(/\/+$/, '')
    const body: Record<string, unknown> = { model: model.model, prompt, n: 1 }

    if (size?.trim()) {
      body.size = size.trim()
      normalizeApimartSize(body)
    }
    if (resolution?.trim()) body.resolution = resolution.trim()
    if (quality?.trim()) body.quality = quality.trim()

    const refs = referenceImage
      ? (Array.isArray(referenceImage) ? referenceImage : [referenceImage])
      : []
    if (refs.length > 0) {
      const uploaded = await Promise.all(
        refs.map(async (r) => {
          const ref = await readReferenceImage(r)
          const url = await uploadApimartImage(base, model, ref)
          return { url }
        }),
      )
      body.image_urls = uploaded
    }

    const resp = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(model) },
      body: JSON.stringify(body),
    })
    const text = await resp.text()
    if (!resp.ok) return { error: formatApiError(resp.status, text) }

    const json = JSON.parse(text)

    const imageUrl = findImageUrl(Array.isArray(json.data) ? json.data[0] : (json.data ?? json))
    if (imageUrl) return await downloadImageUrl(imageUrl)

    const taskData = Array.isArray(json.data) ? json.data[0] : json.data
    const taskId = json.id ?? json.task_id ?? taskData?.id ?? taskData?.task_id
    if (!taskId) return { error: 'APIMart response did not include a task_id' }

    return await pollApimartTask(base, taskId, model)
  } catch (e: unknown) {
    return { error: `APIMart image generation failed: ${e instanceof Error ? e.message : String(e)}` }
  }
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

  if (isApimartEndpoint(model.apiEndpoint)) {
    return await callApimart(opts)
  }
  return await callOpenAI(opts)
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Generate an image and return it for preview, WITHOUT saving to disk.
 * The caller decides whether/where to persist it.
 */
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

/**
 * Generate an image and save it to `output` (re-encoded to match the file
 * extension). Used by the `generate_image` chat tool.
 */
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
