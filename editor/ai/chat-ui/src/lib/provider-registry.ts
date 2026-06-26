/**
 * Provider registry: turns a catalog provider + model into an AI SDK language
 * model, picking the right SDK by the provider's `npm` field (like opencode).
 *
 * Most providers (~80% of models.dev) speak `@ai-sdk/openai-compatible`, which
 * is also the fallback for any provider whose SDK we don't bundle. Native
 * adapters are included for the protocols that differ on the wire (Anthropic,
 * Google). Adding another provider SDK is a one-line addition to `FACTORIES`.
 */

import type { LanguageModel } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { devProxiedFetch } from '@/lib/dev-proxy'

export interface ChatModelRequest {
  /** Provider npm from the catalog. Undefined → custom OpenAI-compatible. */
  npm?: string
  /** Base URL. Required for openai-compatible; optional for native SDKs. */
  baseURL?: string
  apiKey: string
  modelId: string
  /** Extra JSON merged into the request body (openai-compatible only). */
  extraBody?: Record<string, unknown>
  /** Provider id, used as the AI SDK provider name. */
  providerId?: string
}

function openAICompatible(req: ChatModelRequest): LanguageModel {
  const provider = createOpenAICompatible({
    name: req.providerId || 'fogot-llm',
    apiKey: req.apiKey,
    baseURL: req.baseURL ?? '',
    fetch: devProxiedFetch,
    transformRequestBody: req.extraBody
      ? (args) => ({ ...req.extraBody, ...args })
      : undefined,
  })
  return provider.chatModel(req.modelId)
}

type Factory = (req: ChatModelRequest) => LanguageModel

/** npm package → AI SDK factory. Falls back to openai-compatible. */
const FACTORIES: Record<string, Factory> = {
  '@ai-sdk/openai-compatible': openAICompatible,
  '@ai-sdk/openai': (req) => {
    const provider = createOpenAI({
      apiKey: req.apiKey,
      fetch: devProxiedFetch,
      ...(req.baseURL ? { baseURL: req.baseURL } : {}),
    })
    return provider.languageModel(req.modelId)
  },
  '@ai-sdk/anthropic': (req) => {
    const provider = createAnthropic({
      apiKey: req.apiKey,
      fetch: devProxiedFetch,
      ...(req.baseURL ? { baseURL: req.baseURL } : {}),
      // Required for direct browser/webview calls to the Anthropic API.
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    })
    return provider.languageModel(req.modelId)
  },
  '@ai-sdk/google': (req) => {
    const provider = createGoogleGenerativeAI({
      apiKey: req.apiKey,
      fetch: devProxiedFetch,
      ...(req.baseURL ? { baseURL: req.baseURL } : {}),
    })
    return provider.languageModel(req.modelId)
  },
}

/** True when we have a real adapter for this provider's protocol. */
export function isProviderSupported(npm?: string): boolean {
  if (!npm) return true // custom → openai-compatible
  return npm in FACTORIES
}

/**
 * Create a chat language model for a configured model. Unknown providers fall
 * back to the OpenAI-compatible transport using the catalog base URL.
 */
export function createChatModel(req: ChatModelRequest): LanguageModel {
  const factory = (req.npm && FACTORIES[req.npm]) || openAICompatible
  return factory(req)
}
