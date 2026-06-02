/**
 * Shared image-generation core.
 *
 * Used by both the `generate_image` chat tool and the asset generator panel.
 * Handles the API call, Canvas re-encoding (so the output matches the target
 * extension), and writing the result back into the project via the bridge.
 */

import { bridgeRPC, getImageModels, type ModelConfig } from '@/bridge'

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

export interface GenerateImageOptions {
  prompt: string
  size?: string
  /**
   * Optional reference image for img2img. Accepts either a data URL
   * (`data:image/...;base64,...`) or a project `res://` path.
   */
  referenceImage?: string
  /** Override the image model. Defaults to the first configured image model. */
  model?: ModelConfig
}

interface ImageModelCall {
  b64?: string
  mediaType?: string
  revisedPrompt?: string
  error?: string
}

/** Call the image model API and return the raw base64 image (no disk writes). */
async function callImageModel(opts: GenerateImageOptions): Promise<ImageModelCall> {
  const { prompt, size, referenceImage } = opts
  const imgModel = opts.model ?? getImageModels()[0]

  if (!imgModel || !imgModel.apiKey || !imgModel.apiEndpoint || !imgModel.model) {
    return {
      error:
        'No image model configured. Add an "image" type model in Settings → Image Models.',
    }
  }

  try {
    const body: Record<string, unknown> = {
      model: imgModel.model,
      prompt,
      n: 1,
      response_format: 'b64_json',
    }

    // Only send `size` when explicitly set; otherwise let the API use its own
    // default (some models reject sizes that are too small / wrong format).
    if (size && size.trim()) {
      body.size = size.trim()
    }

    if (referenceImage) {
      // Reference images may arrive as a data URL (uploaded files / asset
      // picker previews) or as a project res:// path. Avoid read_file for data
      // URLs — that path isn't a real file and would fail.
      const refBase64 = referenceImage.startsWith('data:')
        ? (referenceImage.split(',')[1] ?? '')
        : await bridgeRPC('read_file', { path: referenceImage, binary: true })
      body.image = refBase64
    }

    const url = `${imgModel.apiEndpoint.replace(/\/+$/, '')}/images/generations`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${imgModel.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      return { error: `API request failed (${resp.status}): ${errText}` }
    }

    const result = await resp.json()
    const imageB64: string | undefined = result.data?.[0]?.b64_json
    if (!imageB64) {
      return { error: 'No image data in API response' }
    }

    return {
      b64: imageB64,
      mediaType: detectMimeFromB64(imageB64),
      revisedPrompt: result.data?.[0]?.revised_prompt,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: `Image generation failed: ${msg}` }
  }
}

export interface GenerateImageDataResult {
  success: boolean
  /** Data URL of the generated image, for preview / later saving. */
  dataUrl?: string
  mediaType?: string
  revisedPrompt?: string
  error?: string
}

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

    return {
      success: true,
      path: opts.output,
      dataUrl,
      revisedPrompt: call.revisedPrompt,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: `Image generation failed: ${msg}` }
  }
}
