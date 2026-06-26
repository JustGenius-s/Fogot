/**
 * MiniMax image generation provider.
 *
 * Endpoint: POST /v1/image_generation
 * Docs: https://platform.minimax.io/docs/api-reference/image-generation-t2i
 */

import type { GenerateImageOptions } from '@/lib/image-gen'
import type { ModelConfig } from '@/bridge'
import {
  type ImageModelCall,
  authHeaders,
  readReferenceImage,
  downloadImageUrl,
  formatApiError,
  type ImageProvider,
} from '@/lib/image-gen'
import { devProxiedFetch } from '@/lib/dev-proxy'

function apiBase(model: ModelConfig): string {
  return model.apiEndpoint.trim().replace(/\/+$/, '')
}

export class MinimaxProvider implements ImageProvider {
  readonly id = 'minimax'

  matches(model: ModelConfig): boolean {
    if (model.provider === 'minimax') return true
    if (!model.provider) {
      try { return new URL(model.apiEndpoint).hostname.includes('minimaxi') }
      catch { return /minimaxi/i.test(model.apiEndpoint) }
    }
    return false
  }

  async generate(opts: GenerateImageOptions, model: ModelConfig): Promise<ImageModelCall> {
    const { prompt, size, referenceImage } = opts

    try {
      const base = apiBase(model)
      const body: Record<string, unknown> = {
        model: model.model,
        prompt,
        n: 1,
        response_format: 'base64',
        prompt_optimizer: true,
      }

      if (size?.trim()) {
        const s = size.trim()
        if (/^\d+:\d+$/.test(s)) {
          body.aspect_ratio = s
        } else {
          const m = s.match(/^(\d+)x(\d+)$/)
          if (m) {
            body.width = Number(m[1])
            body.height = Number(m[2])
          }
        }
      }

      if (referenceImage) {
        const ref = Array.isArray(referenceImage) ? referenceImage[0] : referenceImage
        const refData = await readReferenceImage(ref)
        body.subject_reference = [
          { type: 'character', image_file: `data:${refData.mime};base64,${refData.base64}` },
        ]
      }

      const resp = await devProxiedFetch(`${base}/image_generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(model) },
        body: JSON.stringify(body),
      })
      const text = await resp.text()
      if (!resp.ok) return { error: formatApiError(resp.status, text) }

      const json = JSON.parse(text)
      if (json.base_resp?.status_code !== 0) {
        return { error: json.base_resp?.status_msg || 'Minimax API error' }
      }

      const b64Items: string[] = json.data?.image_base64
      if (Array.isArray(b64Items) && b64Items.length > 0) {
        return { b64: b64Items[0], mediaType: 'image/jpeg' }
      }
      const urls: string[] = json.data?.image_urls
      if (Array.isArray(urls) && urls.length > 0) {
        return await downloadImageUrl(urls[0])
      }
      return { error: 'No image data in Minimax response' }
    } catch (e: unknown) {
      return { error: `Minimax image generation failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
}
