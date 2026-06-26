/**
 * Live model listing for custom (OpenAI-compatible) provider endpoints.
 *
 * Most providers expose `GET {baseURL}/models` following the OpenAI standard
 * (`{ data: [{ id }] }`). OpenRouter returns the same shape but enriches each
 * entry with `name`, `architecture.{input,output}_modalities` and
 * `supported_parameters`, which we use to infer modality and capabilities.
 */

import type { ModelType } from '@/bridge'

export interface FetchedModel {
  id: string
  name: string
  /** Modality derived from output modalities (image / audio → those; else chat). */
  type: ModelType
  /** Accepts image input (from input modalities). Undefined when unknown. */
  vision?: boolean
  /** Supports tool/function calling (from `supported_parameters`). */
  toolCall?: boolean
  /** Supports reasoning output (from `supported_parameters`). */
  reasoning?: boolean
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function mapEntry(raw: unknown): FetchedModel | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const id = typeof m.id === 'string' ? m.id : ''
  if (!id) return null

  const arch = (m.architecture ?? {}) as Record<string, unknown>
  const inputMods = asStringArray(arch.input_modalities ?? m.input_modalities)
  const outputMods = asStringArray(arch.output_modalities ?? m.output_modalities)
  const params = asStringArray(m.supported_parameters)

  let type: ModelType = 'chat'
  if (outputMods.includes('image')) type = 'image'
  else if (outputMods.includes('audio')) type = 'audio'

  const modality = typeof arch.modality === 'string' ? arch.modality : ''
  const vision = inputMods.length || modality
    ? inputMods.includes('image') || /image/.test(modality.split('->')[0] ?? '')
    : undefined

  const toolCall = params.length ? params.includes('tools') : undefined
  const reasoning = params.length
    ? params.includes('reasoning') || params.includes('include_reasoning')
    : undefined

  return {
    id,
    name: typeof m.name === 'string' && m.name ? m.name : id,
    type,
    vision,
    toolCall,
    reasoning,
  }
}

/**
 * Fetch the model list from an OpenAI-compatible `GET {baseURL}/models`.
 *
 * Throws on network / non-2xx responses so the caller can surface the error.
 */
export async function fetchProviderModels(
  baseURL: string,
  apiKey: string,
): Promise<FetchedModel[]> {
  const base = baseURL.trim().replace(/\/+$/, '')
  if (!base) throw new Error('Missing base URL')

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`

  const resp = await fetch(`${base}/models`, { headers })
  if (!resp.ok) {
    throw new Error(`${resp.status} ${resp.statusText}`.trim())
  }
  const json = (await resp.json()) as unknown
  const list = Array.isArray(json)
    ? json
    : Array.isArray((json as { data?: unknown }).data)
      ? (json as { data: unknown[] }).data
      : []

  const models = list
    .map(mapEntry)
    .filter((m): m is FetchedModel => m !== null)
  models.sort((a, b) => a.name.localeCompare(b.name))
  return models
}
