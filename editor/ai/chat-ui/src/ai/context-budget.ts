/**
 * Shared context-window budget helpers (mirrors opencode/session/overflow.ts).
 */

import type { UsageSnapshot } from '@/ai/context-manager'

export const COMPACTION_BUFFER = 20_000

export function usableContext(limits: {
  contextWindow: number
  maxOutputTokens: number
}): number {
  const reserved = Math.min(COMPACTION_BUFFER, limits.maxOutputTokens)
  return Math.max(0, limits.contextWindow - reserved)
}

export function tokenCount(usage: UsageSnapshot): number {
  return (
    usage.totalTokens ||
    usage.inputTokens +
      usage.outputTokens +
      (usage.cachedInputTokens ?? 0)
  )
}
