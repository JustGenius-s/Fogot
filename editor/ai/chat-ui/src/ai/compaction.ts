/**
 * Context compaction — mirrors opencode's two-tier strategy:
 * 1. Prune old tool outputs (cheap, no LLM call)
 * 2. Anchored summarization when approaching the usable context limit
 *
 * @see https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/compaction.ts
 */

import { generateText } from 'ai'
import type { ModelConfig } from '@/bridge'
import { createChatModel } from '@/lib/provider-registry'
import { resolveModelLimits } from '@/lib/model-capabilities'
import type { UsageSnapshot } from '@/ai/context-manager'
import { getCompactionSummary, setCompactionSummary } from '@/ai/context-manager'
import { tokenCount, usableContext, COMPACTION_BUFFER } from '@/ai/context-budget'
export const DEFAULT_TAIL_TURNS = 2
export const MIN_PRESERVE_RECENT_TOKENS = 2_000
export const MAX_PRESERVE_RECENT_TOKENS = 8_000
const TOOL_OUTPUT_MAX_CHARS = 2_000
const PRUNE_PROTECTED_TOOLS = ['skill']

const COMPACTION_SYSTEM = `You are an anchored context summarization assistant for coding sessions.

Summarize only the conversation history you are given. The newest turns may be kept verbatim outside your summary, so focus on the older context that still matters for continuing the work.

If the prompt includes a <previous-summary> block, treat it as the current anchored summary. Update it with the new history by preserving still-true details, removing stale details, and merging in new facts.

Always follow the exact output structure requested by the user prompt. Keep every section, preserve exact file paths and identifiers when known, and prefer terse bullets over paragraphs.

Do not answer the conversation itself. Do not mention that you are summarizing, compacting, or merging context. Respond in the same language as the conversation.`

const SUMMARY_TEMPLATE = `Output exactly this Markdown structure and keep the section order unchanged:
---
## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
### Done
- [completed work or "(none)"]

### In Progress
- [current work or "(none)"]

### Blocked
- [blockers or "(none)"]

## Key Decisions
- [decision and why, or "(none)"]

## Next Steps
- [ordered next actions or "(none)"]

## Critical Context
- [important technical facts, errors, open questions, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
---

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, commands, error strings, and identifiers when known.
- Do not mention the summary process or that context was compacted.`

// ─── Token estimation ───────────────────────────────────────────────

export function estimateTokens(text: string): number {
  if (!text) return 0
  let cjkChars = 0
  for (const ch of text) {
    if (ch.charCodeAt(0) > 0x2e80) cjkChars++
  }
  const latinChars = text.length - cjkChars
  return Math.ceil(latinChars / 4 + cjkChars / 1.5)
}

function partText(part: any): string {
  if (!part || typeof part !== 'object') return ''
  if (part.type === 'text' && part.text) return part.text
  if (part.type === 'reasoning' && (part.text ?? part.reasoning)) {
    return part.text ?? part.reasoning
  }
  if (part.type === 'tool-call' || part.type === 'tool-invocation') {
    const name = part.toolName ?? part.name ?? ''
    const args = JSON.stringify(part.args ?? part.input ?? {})
    const result = part.result ?? part.output
    const resultText =
      typeof result === 'string'
        ? result.slice(0, TOOL_OUTPUT_MAX_CHARS)
        : JSON.stringify(result ?? '').slice(0, TOOL_OUTPUT_MAX_CHARS)
    return `${name}(${args}) => ${resultText}`
  }
  if (part.type === 'tool-result') {
    const out = part.result ?? part.output ?? part.content
    return typeof out === 'string'
      ? out.slice(0, TOOL_OUTPUT_MAX_CHARS)
      : JSON.stringify(out ?? '').slice(0, TOOL_OUTPUT_MAX_CHARS)
  }
  if (part.type === 'file' || part.type === 'image') return '[media]'
  if (typeof part.text === 'string') return part.text
  if (typeof part.content === 'string') return part.content
  return ''
}

function messageText(msg: any): string {
  if (typeof msg.content === 'string') return msg.content
  const parts = msg.parts ?? (Array.isArray(msg.content) ? msg.content : [])
  if (!Array.isArray(parts)) return ''
  return parts.map(partText).filter(Boolean).join('\n')
}

/** Estimate tokens for a message array, including tool I/O. */
export function estimateMessagesTokens(messages: any[]): number {
  let total = 0
  for (const msg of messages) {
    total += estimateTokens(messageText(msg)) + 4
  }
  return total
}

export { tokenCount, usableContext, COMPACTION_BUFFER } from '@/ai/context-budget'

// ─── Constants (from opencode) ────────────────────────────────────

export const PRUNE_MINIMUM = 20_000
export const PRUNE_PROTECT = 40_000

export function isOverflow(
  usage: UsageSnapshot | null,
  limits: { contextWindow: number; maxOutputTokens: number },
): boolean {
  if (!usage) return false
  return tokenCount(usage) >= usableContext(limits)
}

export function isEstimatedOverflow(
  messages: any[],
  limits: { contextWindow: number; maxOutputTokens: number },
): boolean {
  return estimateMessagesTokens(messages) >= usableContext(limits)
}

// ─── Prune old tool outputs ───────────────────────────────────────

function isSummaryMessage(msg: any): boolean {
  const text = messageText(msg)
  return text.startsWith('[Context Summary') || text.includes('## Goal')
}

function pruneToolPart(part: any): any {
  if (part.type === 'tool-call' || part.type === 'tool-invocation') {
    const next = { ...part, _compacted: true }
    if ('result' in next) next.result = '[output pruned to save context]'
    if ('output' in next) next.output = '[output pruned to save context]'
    return next
  }
  if (part.type === 'tool-result') {
    return {
      ...part,
      _compacted: true,
      result: '[output pruned to save context]',
      output: '[output pruned to save context]',
      content: '[output pruned to save context]',
    }
  }
  return part
}

function pruneMessage(msg: any): any {
  if (msg.role === 'tool') {
    const content =
      typeof msg.content === 'string'
        ? '[output pruned to save context]'
        : Array.isArray(msg.content)
          ? msg.content.map(() => ({ type: 'text', text: '[output pruned to save context]' }))
          : msg.content
    return { ...msg, content, _compacted: true }
  }
  const parts = msg.parts ?? (Array.isArray(msg.content) ? msg.content : null)
  if (!Array.isArray(parts)) return msg
  return {
    ...msg,
    parts: parts.map(pruneToolPart),
    content: parts.map(pruneToolPart),
  }
}

/**
 * Strip old tool outputs while keeping the last 2 turns and ~40k tokens of
 * recent tool I/O. Returns a new message array if anything was pruned.
 */
export function pruneToolOutputs(messages: any[]): {
  messages: any[]
  pruned: boolean
} {
  let total = 0
  let prunedTokens = 0
  const toPrune = new Set<number>()
  let turns = 0

  loop: for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'user') turns++
    if (turns < DEFAULT_TAIL_TURNS) continue
    if (msg.role === 'assistant' && isSummaryMessage(msg)) break loop

    const parts = msg.parts ?? (Array.isArray(msg.content) ? msg.content : [])
    const items = Array.isArray(parts) ? parts : []
    for (let j = items.length - 1; j >= 0; j--) {
      const part = items[j]
      if (part?._compacted) break loop
      const toolName = part?.toolName ?? part?.name
      if (toolName && PRUNE_PROTECTED_TOOLS.includes(toolName)) continue
      const isTool =
        part?.type === 'tool-call' ||
        part?.type === 'tool-invocation' ||
        part?.type === 'tool-result' ||
        msg.role === 'tool'
      if (!isTool) continue
      const est = estimateTokens(partText(part))
      total += est
      if (total <= PRUNE_PROTECT) continue
      prunedTokens += est
      toPrune.add(i)
    }
  }

  if (prunedTokens <= PRUNE_MINIMUM) {
    return { messages, pruned: false }
  }

  const next = messages.map((msg, idx) => (toPrune.has(idx) ? pruneMessage(msg) : msg))
  return { messages: next, pruned: true }
}

// ─── Tail selection for compaction ────────────────────────────────

type Turn = { start: number; end: number }

function turns(messages: any[]): Turn[] {
  const result: Turn[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role !== 'user') continue
    if (isSummaryMessage(messages[i])) continue
    result.push({ start: i, end: messages.length })
  }
  for (let i = 0; i < result.length - 1; i++) {
    result[i].end = result[i + 1].start
  }
  return result
}

function preserveRecentBudget(limits: {
  contextWindow: number
  maxOutputTokens: number
}): number {
  const usable = usableContext(limits)
  return Math.min(
    MAX_PRESERVE_RECENT_TOKENS,
    Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usable * 0.25)),
  )
}

export function selectCompactionSplit(
  messages: any[],
  limits: { contextWindow: number; maxOutputTokens: number },
  tailTurns = DEFAULT_TAIL_TURNS,
): { head: any[]; tail: any[] } {
  const budget = preserveRecentBudget(limits)
  const all = turns(messages)
  if (!all.length || tailTurns <= 0) {
    return { head: messages, tail: [] }
  }

  const recent = all.slice(-tailTurns)
  const sizes = recent.map((t) =>
    estimateMessagesTokens(messages.slice(t.start, t.end)),
  )

  let total = 0
  let keepStart: number | undefined

  for (let i = recent.length - 1; i >= 0; i--) {
    const turn = recent[i]!
    const size = sizes[i]!
    if (total + size <= budget) {
      total += size
      keepStart = turn.start
      continue
    }
  }

  if (keepStart === undefined || keepStart === 0) {
    return { head: messages, tail: [] }
  }

  return {
    head: messages.slice(0, keepStart),
    tail: messages.slice(keepStart),
  }
}

function buildCompactionPrompt(input: {
  previousSummary?: string
  context?: string[]
}): string {
  const anchor = input.previousSummary
    ? [
        'Update the anchored summary below using the conversation history above.',
        'Preserve still-true details, remove stale details, and merge in the new facts.',
        '<previous-summary>',
        input.previousSummary,
        '</previous-summary>',
      ].join('\n')
    : 'Create a new anchored summary from the conversation history above.'
  return [anchor, SUMMARY_TEMPLATE, ...(input.context ?? [])].join('\n\n')
}

function historyToText(messages: any[]): string {
  return messages
    .map((m) => {
      const role = m.role ?? 'unknown'
      const text = messageText(m).slice(0, 4000)
      return text ? `[${role}]: ${text}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

// ─── Compaction ───────────────────────────────────────────────────

export async function runCompaction(
  messages: any[],
  model: ModelConfig,
): Promise<string | null> {
  const limits = resolveModelLimits(model)
  const { head, tail } = selectCompactionSplit(messages, limits)
  if (!head.length || head.length === messages.length) return null

  const previousSummary = getCompactionSummary() ?? undefined
  const prompt = buildCompactionPrompt({ previousSummary })

  const llm = createChatModel({
    npm: model.npm,
    baseURL: model.apiEndpoint,
    apiKey: model.apiKey,
    modelId: model.model,
    providerId: model.providerId,
    extraBody: (() => {
      if (!model.extraBody) return undefined
      try {
        return JSON.parse(model.extraBody) as Record<string, unknown>
      } catch {
        return undefined
      }
    })(),
  })

  const historyText = historyToText(head)
  const { text } = await generateText({
    model: llm,
    system: COMPACTION_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `${historyText}\n\n${prompt}`,
      },
    ],
    maxOutputTokens: 2048,
    temperature: 0.3,
  })

  const summary = text.trim()
  if (!summary) return null

  setCompactionSummary(summary)
  return summary
}

export function applyCompaction(
  systemMessage: any | null,
  summary: string,
  tail: any[],
): any[] {
  const result: any[] = []
  if (systemMessage) result.push(systemMessage)
  result.push({
    role: 'user',
    parts: [
      {
        type: 'text',
        text: `[Context Summary — earlier conversation was compacted]\n\n${summary}`,
      },
    ],
  })
  result.push({
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Understood. I have the context from our earlier conversation.',
      },
    ],
  })
  result.push(...tail)
  return result
}

export async function compactIfNeeded(
  messages: any[],
  model: ModelConfig,
  usage: UsageSnapshot | null,
): Promise<any[]> {
  const limits = resolveModelLimits(model)

  const { messages: pruned, pruned: didPrune } = pruneToolOutputs(messages)
  let msgs = pruned

  const needsCompaction =
    isOverflow(usage, limits) || isEstimatedOverflow(msgs, limits)
  if (!needsCompaction) return msgs

  let systemMsg: any | null = null
  let conversation = msgs
  if (conversation[0]?.role === 'system') {
    systemMsg = conversation[0]
    conversation = conversation.slice(1)
  }

  try {
    const summary = await runCompaction(conversation, model)
    if (!summary) return msgs

    const { tail } = selectCompactionSplit(conversation, limits)
    return applyCompaction(systemMsg, summary, tail)
  } catch (e) {
    console.warn('Context compaction failed:', e)
    return didPrune ? msgs : messages
  }
}
