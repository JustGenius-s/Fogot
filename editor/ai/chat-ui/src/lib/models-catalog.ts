/**
 * models.dev catalog.
 *
 * Mirrors how opencode sources model metadata: we fetch the public
 * `https://models.dev/api.json` database (CORS-open) and use it as the
 * source of truth for providers, their models, capabilities, base URLs and
 * pricing. This replaces hand-typing model ids / endpoints / capabilities.
 *
 * Strategy (per the chosen config): fetch at runtime, cache the last good
 * response in localStorage so the UI is instant on subsequent loads and keeps
 * working offline after the first successful fetch. No snapshot is bundled.
 */

import { useSyncExternalStore } from 'react'
import { devProxiedFetch } from '@/lib/dev-proxy'

export const MODELS_DEV_API = 'https://models.dev/api.json'

export interface CatalogModelModalities {
  input: string[]
  output: string[]
}

export interface CatalogModelLimit {
  context?: number
  output?: number
}

export interface CatalogModelCost {
  input?: number
  output?: number
  cache_read?: number
  cache_write?: number
}

export interface CatalogModel {
  id: string
  name: string
  family?: string
  attachment?: boolean
  reasoning?: boolean
  tool_call?: boolean
  temperature?: boolean
  structured_output?: boolean
  knowledge?: string
  release_date?: string
  last_updated?: string
  modalities?: CatalogModelModalities
  open_weights?: boolean
  limit?: CatalogModelLimit
  cost?: CatalogModelCost
}

export interface CatalogProvider {
  id: string
  name: string
  /** AI SDK npm package this provider speaks, e.g. "@ai-sdk/openai-compatible". */
  npm?: string
  /** Base URL for the provider's API (most providers include this). */
  api?: string
  doc?: string
  env?: string[]
  models: Record<string, CatalogModel>
}

export type Catalog = Record<string, CatalogProvider>

const CACHE_KEY = 'fogot-models-catalog'
/** Refresh in the background when the cache is older than this. */
const STALE_MS = 24 * 60 * 60 * 1000

interface CacheEnvelope {
  fetchedAt: number
  data: Catalog
}

function readCache(): CacheEnvelope | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.data) return parsed as CacheEnvelope
  } catch { /* ignore */ }
  return null
}

function writeCache(data: Catalog) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data }))
  } catch { /* quota, ignore */ }
}

// ─── Reactive store ───────────────────────────────────────────────

const initial = readCache()

interface CatalogState {
  catalog: Catalog | null
  loading: boolean
  error: string | null
  fetchedAt: number | null
}

let state: CatalogState = {
  catalog: initial?.data ?? null,
  loading: false,
  error: null,
  fetchedAt: initial?.fetchedAt ?? null,
}

const listeners = new Set<() => void>()

function setState(patch: Partial<CatalogState>) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

let inFlight: Promise<Catalog> | null = null

/** Fetch the catalog from models.dev, update cache + store. */
export async function fetchCatalog(): Promise<Catalog> {
  if (inFlight) return inFlight
  setState({ loading: true, error: null })
  inFlight = (async () => {
    try {
      const resp = await devProxiedFetch(MODELS_DEV_API, { headers: { Accept: 'application/json' } })
      if (!resp.ok) throw new Error(`models.dev responded ${resp.status}`)
      const data = (await resp.json()) as Catalog
      writeCache(data)
      setState({ catalog: data, loading: false, error: null, fetchedAt: Date.now() })
      return data
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ loading: false, error: msg })
      throw e
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/**
 * Ensure the catalog is available. Returns immediately from cache when present
 * and refreshes in the background if stale; otherwise fetches.
 */
export function ensureCatalog(): void {
  if (state.catalog) {
    const age = state.fetchedAt ? Date.now() - state.fetchedAt : Infinity
    if (age > STALE_MS && !state.loading) fetchCatalog().catch(() => {})
    return
  }
  if (!state.loading) fetchCatalog().catch(() => {})
}

export function getCatalog(): Catalog | null {
  return state.catalog
}

export function useCatalog(): CatalogState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Providers sorted by display name. */
export function getProviders(): CatalogProvider[] {
  const c = state.catalog
  if (!c) return []
  return Object.values(c).sort((a, b) => a.name.localeCompare(b.name))
}

export function getProvider(providerId: string): CatalogProvider | undefined {
  return state.catalog?.[providerId]
}

export function getCatalogModel(providerId: string, modelId: string): CatalogModel | undefined {
  return state.catalog?.[providerId]?.models?.[modelId]
}

/** Models of a provider sorted by display name. */
export function getProviderModels(providerId: string): CatalogModel[] {
  const p = state.catalog?.[providerId]
  if (!p) return []
  return Object.values(p.models).sort((a, b) => a.name.localeCompare(b.name))
}

/** Provider logo URL on models.dev. */
export function providerLogo(providerId: string): string {
  return `https://models.dev/logos/${providerId}.svg`
}
