/**
 * Model capability adaptation.
 *
 * Mirrors the approach used by opencode / models.dev: every chat model carries
 * a set of capability flags (`vision`, `toolCall`, `reasoning`, `temperature`)
 * that decide what we are allowed to send it. A text-only model must not
 * receive images or tool definitions it can't handle.
 *
 * Resolution priority (per field):
 *   1. Manual override on the model config (`model.capabilities`)
 *   2. Built-in heuristic table, matched against the model id
 *   3. Conservative defaults
 *
 * The conservative default for `vision` is `false` — like opencode, an unknown
 * custom OpenAI-compatible model is assumed to be text-only until proven
 * otherwise, so we never blow up a request with image parts it can't read.
 */

import type { ModelCapabilities, ModelConfig } from '@/bridge'
import { getCatalogModel } from '@/lib/models-catalog'

/** Tools that feed image pixels into the model and therefore require vision. */
export const VISION_REQUIRED_TOOLS = ['read_image'] as const

/** Conservative defaults applied when nothing else matches. */
export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  vision: false,
  toolCall: true,
  reasoning: false,
  temperature: true,
}

interface HeuristicRule {
  /** Lower-cased substrings; a rule matches if any is present in the model id. */
  match: string[]
  caps: Partial<ModelCapabilities>
}

/**
 * Ordered heuristic rules. Earlier rules take precedence on conflicting fields.
 * Keep patterns broad (family-level) so new point releases are covered.
 */
const HEURISTICS: HeuristicRule[] = [
  // ── OpenAI reasoning models: vision + tools, but reject temperature ──
  {
    match: ['o1', 'o3', 'o4-mini', 'gpt-5'],
    caps: { vision: true, toolCall: true, reasoning: true, temperature: false },
  },
  // ── OpenAI multimodal chat ──
  {
    match: ['gpt-4o', 'gpt-4.1', 'gpt-4-turbo', 'gpt-4-vision', 'chatgpt-4o'],
    caps: { vision: true, toolCall: true },
  },
  // ── Anthropic Claude: all current models are multimodal ──
  {
    match: ['claude-3', 'claude-4', 'claude-sonnet', 'claude-opus', 'claude-haiku'],
    caps: { vision: true, toolCall: true },
  },
  // ── Google Gemini ──
  {
    match: ['gemini-1.5', 'gemini-2', 'gemini-3', 'gemini-pro-vision', 'gemini-flash'],
    caps: { vision: true, toolCall: true },
  },
  // ── Explicit vision variants across vendors ──
  {
    match: [
      'qwen-vl', 'qwen2-vl', 'qwen2.5-vl', 'qwen3-vl', 'qvq',
      'glm-4v', 'glm-4.1v', 'glm-4.5v',
      'llava', 'pixtral', 'internvl', 'minicpm-v',
      'grok-vision', 'grok-2-vision', 'grok-4',
      'step-1v', 'step-1o', 'yi-vision', 'doubao-vision', 'ernie-vl',
      'llama-3.2-11b', 'llama-3.2-90b', 'llama-4',
    ],
    caps: { vision: true, toolCall: true },
  },
  // ── Reasoning-first models (text), tools vary; temperature usually ignored ──
  {
    match: ['deepseek-r1', 'deepseek-reasoner', 'qwq', 'glm-z1'],
    caps: { vision: false, reasoning: true, toolCall: false, temperature: false },
  },
  // ── Known text-only chat families ──
  {
    match: [
      'deepseek-chat', 'deepseek-v3', 'deepseek-coder',
      'qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen2.5-coder',
      'glm-4-', 'glm-4.5', 'glm-4.6', 'moonshot-v1', 'kimi-k2',
      'ernie-', 'baichuan', 'yi-large', 'yi-medium',
    ],
    caps: { vision: false, toolCall: true },
  },
]

function heuristicFor(modelId: string): Partial<ModelCapabilities> {
  const id = modelId.toLowerCase()
  // Generic textual hints win nothing extra but help unknown ids stay text-only.
  const acc: Partial<ModelCapabilities> = {}
  for (const rule of HEURISTICS) {
    if (rule.match.some((m) => id.includes(m))) {
      // Earlier rules win: only fill fields not already set.
      for (const [k, v] of Object.entries(rule.caps) as [keyof ModelCapabilities, boolean][]) {
        if (acc[k] === undefined) acc[k] = v
      }
    }
  }
  return acc
}

/**
 * Capabilities sourced from the models.dev catalog entry, if any.
 *
 * `attachment` maps to our `vision` flag (image/file input). Other flags map
 * one-to-one. Returns a partial — only fields the catalog actually specifies.
 */
function catalogCapabilities(model: Pick<ModelConfig, 'providerId' | 'model'>): Partial<ModelCapabilities> {
  if (!model.providerId) return {}
  const entry = getCatalogModel(model.providerId, model.model)
  if (!entry) return {}
  const visionFromModalities = entry.modalities?.input?.includes('image')
  return {
    vision: entry.attachment ?? visionFromModalities,
    toolCall: entry.tool_call,
    reasoning: entry.reasoning,
    temperature: entry.temperature,
  }
}

/**
 * Resolve the effective capabilities for a model.
 *
 * Priority per field: manual override > models.dev catalog > heuristic (by
 * model id) > conservative default.
 */
export function resolveCapabilities(
  model: Pick<ModelConfig, 'model' | 'capabilities' | 'providerId'>,
): ModelCapabilities {
  const override = model.capabilities ?? {}
  const catalog = catalogCapabilities(model)
  const heuristic = heuristicFor(model.model ?? '')
  const pick = (key: keyof ModelCapabilities): boolean =>
    override[key] ?? catalog[key] ?? heuristic[key] ?? DEFAULT_CAPABILITIES[key]
  return {
    vision: pick('vision'),
    toolCall: pick('toolCall'),
    reasoning: pick('reasoning'),
    temperature: pick('temperature'),
  }
}

/** Capabilities derived purely from heuristics + defaults, ignoring overrides. */
export function detectedCapabilities(modelId: string): ModelCapabilities {
  return resolveCapabilities({ model: modelId, capabilities: undefined })
}

export const DEFAULT_CONTEXT_WINDOW = 1_000_000
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096

/**
 * Resolve a model's context window and max output tokens.
 *
 * Priority: explicit value on the config (custom endpoints) > models.dev
 * catalog limits > conservative defaults. Users don't normally fill these in.
 */
export function resolveModelLimits(
  model: Pick<ModelConfig, 'model' | 'providerId' | 'contextWindow' | 'maxTokens'>,
): { contextWindow: number; maxOutputTokens: number } {
  const entry = model.providerId ? getCatalogModel(model.providerId, model.model) : undefined
  return {
    contextWindow: model.contextWindow ?? entry?.limit?.context ?? DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens: model.maxTokens ?? entry?.limit?.output ?? DEFAULT_MAX_OUTPUT_TOKENS,
  }
}
