/**
 * Context window management: tracks token usage and auto-summarizes
 * conversations when approaching the model's context limit.
 */

import { useSyncExternalStore } from 'react'
import { getSelectedChatModel } from '@/bridge'

// Threshold at which we trigger summarization (percentage of context window)
const SUMMARIZE_THRESHOLD = 0.75

// After summarizing, keep the last N message pairs (user + assistant)
const KEEP_RECENT_PAIRS = 3

const USAGE_STORAGE_PREFIX = 'fogot-usage-'

export interface UsageSnapshot {
  inputTokens: number
  outputTokens: number
  totalTokens: number
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
  if (usage && usage.totalTokens > 0) {
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

export function useUsageSnapshot(): UsageSnapshot | null {
  return useSyncExternalStore(
    (listener) => {
      usageListeners.add(listener)
      return () => usageListeners.delete(listener)
    },
    () => lastUsage,
  )
}

export function shouldSummarize(): boolean {
  if (!lastUsage) return false
  const model = getSelectedChatModel()
  const contextWindow = model?.contextWindow ?? 1_000_000
  return lastUsage.inputTokens > contextWindow * SUMMARIZE_THRESHOLD
}

export function getContextUtilization(): number {
  if (!lastUsage) return 0
  const model = getSelectedChatModel()
  const contextWindow = model?.contextWindow ?? 1_000_000
  return lastUsage.inputTokens / contextWindow
}

/**
 * Builds a summarization prompt from messages to compress the conversation
 * history while preserving key context.
 */
export function buildSummarizationMessages(messages: any[]): any[] {
  const conversationText = messages
    .map((m: any) => {
      const role = m.role ?? 'unknown'
      const textParts = (m.parts ?? m.content ?? [])
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text ?? p.content ?? '')
        .join('\n')
      return `[${role}]: ${textParts}`
    })
    .join('\n\n')

  return [
    {
      role: 'system',
      content: `You are a conversation summarizer. Create a concise but comprehensive summary of the following conversation that preserves:
- Key decisions and conclusions
- Important context (file paths, variable names, technical details)
- Ongoing tasks and their current status
- Any unresolved questions or issues

Format: Write a structured summary in the same language as the conversation. Use bullet points for clarity. Keep it under 500 words.`,
    },
    {
      role: 'user',
      content: `Please summarize this conversation:\n\n${conversationText}`,
    },
  ]
}

/**
 * Given a full message array, splits into "to summarize" and "to keep" portions.
 * Keeps the system prompt (first message if role=system) and the last N message pairs.
 */
export function splitMessagesForSummarization(messages: any[]): {
  toSummarize: any[]
  toKeep: any[]
  systemMessage: any | null
} {
  let systemMessage: any | null = null
  let conversationMessages = [...messages]

  if (conversationMessages.length > 0 && conversationMessages[0].role === 'system') {
    systemMessage = conversationMessages[0]
    conversationMessages = conversationMessages.slice(1)
  }

  // Keep the last KEEP_RECENT_PAIRS * 2 messages
  const keepCount = Math.min(KEEP_RECENT_PAIRS * 2, conversationMessages.length)
  const splitIdx = conversationMessages.length - keepCount

  if (splitIdx <= 0) {
    return {
      toSummarize: [],
      toKeep: conversationMessages,
      systemMessage,
    }
  }

  return {
    toSummarize: conversationMessages.slice(0, splitIdx),
    toKeep: conversationMessages.slice(splitIdx),
    systemMessage,
  }
}

/**
 * Constructs the compressed message array with the summary injected.
 */
export function buildCompressedMessages(
  systemMessage: any | null,
  summary: string,
  recentMessages: any[],
): any[] {
  const result: any[] = []

  if (systemMessage) {
    result.push(systemMessage)
  }

  result.push({
    role: 'system',
    content: `[Context Summary - Earlier conversation was summarized to save context space]\n\n${summary}`,
  })

  result.push(...recentMessages)
  return result
}
