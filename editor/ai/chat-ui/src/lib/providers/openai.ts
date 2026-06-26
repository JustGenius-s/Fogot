/**
 * OpenAI-compatible image generation provider.
 *
 * Endpoint: POST /images/generations (sync) or poll /tasks/{id} (async).
 * Also serves as the catch-all default for unknown endpoints.
 */

import type { GenerateImageOptions } from '@/lib/image-gen'
import type { ModelConfig } from '@/bridge'
import {
  type ImageModelCall,
  authHeaders,
  readReferenceImage,
  downloadImageUrl,
  formatApiError,
  findImageUrl,
  detectMimeFromB64,
  ratioToPixels,
  type ImageProvider,
} from '@/lib/image-gen'

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

export class OpenAIProvider implements ImageProvider {
  readonly id = 'openai'

  matches(model: ModelConfig): boolean {
    if (model.provider === 'openai' || model.provider === 'openai-compatible') return true
    // Catch-all: if no explicit provider set, we handle anything that
    // didn't match a more specific provider (called last in the registry).
    if (!model.provider) return true
    return false
  }

  async generate(opts: GenerateImageOptions, model: ModelConfig): Promise<ImageModelCall> {
    const { prompt, size, resolution, quality, referenceImage: refOpt } = opts
    const referenceImage = Array.isArray(refOpt) ? refOpt[0] : refOpt

    let endpoint = model.apiEndpoint
    if (import.meta.env.DEV) {
      try {
        const hostname = new URL(endpoint).hostname
        if (hostname === 'api.ofox.io') endpoint = '/api/ofox/v1'
      } catch {}
    }

    const { apiBase, apiUrl } = resolveOpenAIUrls(endpoint)

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

      if (!res.ok && referenceImage && /url/i.test(res.body)) {
        body.image = `data:${refMime};base64,${refBase64}`
        res = await doRequest(body)
      }
      if (!res.ok && referenceImage && /pattern|match|unrecogni/i.test(res.body)) {
        delete body.image
        body.image_urls = [`data:${refMime};base64,${refBase64}`]
        res = await doRequest(body)
      }
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
}
