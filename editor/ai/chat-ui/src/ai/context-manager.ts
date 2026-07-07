/**
 * Context window management: tracks per-thread token usage reported by the
 * provider and persists anchored compaction summaries.
 */

import { useSyncExternalStore } from 'react'
import { getSelectedChatModel, setActivePlan } from '@/bridge'
import { resolveModelLimits } from '@/lib/model-capabilities'
import { tokenCount, usableContext } from '@/ai/context-budget'

const USAGE_STORAGE_PREFIX = 'fogot-usage-'
const SUMMARY_STORAGE_PREFIX = 'fogot-summary-'

export interface UsageSnapshot {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens?: number
  reasoningTokens?: number
}

let lastUsage: UsageSnapshot | null = null
let currentThreadId: string | null = null
const usageListeners = new Set<() => void>()

function emitUsage() {
  usageListeners.forEach((fn) => fn())
}

function persistUsage() {
  if (!currentThreadId) return
  if (lastUsage) {
    localStorage.setItem(USAGE_STORAGE_PREFIX + currentThreadId, JSON.stringify(lastUsage))
  } else {
    localStorage.removeItem(USAGE_STORAGE_PREFIX + currentThreadId)
  }
}

export function setCurrentThreadId(threadId: string | null) {
  if (threadId === currentThreadId) return
  currentThreadId = threadId
  setActivePlan(null)
  if (threadId) {
    const raw = localStorage.getItem(USAGE_STORAGE_PREFIX + threadId)
    if (raw) {
      try {
        lastUsage = JSON.parse(raw)
        emitUsage()
        return
      } catch { /* ignore corrupt data */ }
    }
  }
  lastUsage = null
  emitUsage()
}

export function updateUsageSnapshot(usage: UsageSnapshot | null) {
  if (usage && (usage.inputTokens > 0 || usage.outputTokens > 0 || usage.totalTokens > 0)) {
    lastUsage = usage
    persistUsage()
    emitUsage()
  }
}

export function getLastUsage(): UsageSnapshot | null {
  return lastUsage
}

export function clearUsageSnapshot() {
  lastUsage = null
  persistUsage()
  emitUsage()
}

export function getCompactionSummary(): string | null {
  if (!currentThreadId) return null
  return localStorage.getItem(SUMMARY_STORAGE_PREFIX + currentThreadId)
}

export function setCompactionSummary(summary: string) {
  if (!currentThreadId) return
  localStorage.setItem(SUMMARY_STORAGE_PREFIX + currentThreadId, summary)
}

export function clearCompactionSummary() {
  if (!currentThreadId) return
  localStorage.removeItem(SUMMARY_STORAGE_PREFIX + currentThreadId)
}

export function useUsageSnapshot(): UsageSnapshot | null {
  return useSyncExternalStore(
    (listener) => {
      usageListeners.add(listener)
      return () => usageListeners.delete(listener)
    },
    () => lastUsage,
  )
}

export function getContextUtilization(): number {
  if (!lastUsage) return 0
  const model = getSelectedChatModel()
  if (!model) return 0
  const limits = resolveModelLimits(model)
  const usable = usableContext(limits)
  if (usable <= 0) return 0
  return tokenCount(lastUsage) / usable
}
