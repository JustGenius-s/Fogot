/**
 * APIMart image generation provider.
 *
 * Flow:
 *   1. (optional) Upload reference image → POST /uploads/images
 *   2. Create generation task            → POST /images/generations
 *   3. Poll task status                  → GET  /tasks/{id}?language=zh
 *   4. Download result image URL
 */

import type { GenerateImageOptions } from '@/lib/image-gen'
import type { ModelConfig } from '@/bridge'
import {
  type ImageModelCall,
  type ReferenceImageData,
  authHeaders,
  readReferenceImage,
  downloadImageUrl,
  formatApiError,
  findImageUrl,
  base64ToBlob,
  type ImageProvider,
} from '@/lib/image-gen'
import { devProxiedFetch } from '@/lib/dev-proxy'

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

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

async function uploadApimartImage(
  base: string,
  model: ModelConfig,
  ref: ReferenceImageData,
): Promise<string> {
  const form = new FormData()
  form.append('file', base64ToBlob(ref.base64, ref.mime), 'reference.png')

  const resp = await devProxiedFetch(`${base}/uploads/images`, {
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
      const resp = await devProxiedFetch(url, { headers: authHeaders(model) })
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

export class ApimartProvider implements ImageProvider {
  readonly id = 'apimart'

  matches(model: ModelConfig): boolean {
    if (model.provider === 'apimart') return true
    if (!model.provider) {
      try { return new URL(model.apiEndpoint).hostname.endsWith('apimart.ai') }
      catch { return /apimart\.ai/i.test(model.apiEndpoint) }
    }
    return false
  }

  async generate(opts: GenerateImageOptions, model: ModelConfig): Promise<ImageModelCall> {
    const { prompt, size, resolution, quality, referenceImage } = opts

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

      const resp = await devProxiedFetch(`${base}/images/generations`, {
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
}
