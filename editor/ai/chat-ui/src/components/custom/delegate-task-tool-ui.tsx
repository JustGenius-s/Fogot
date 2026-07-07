/**
 * Custom Tool UI for delegate_task — compact inline card in the main
 * thread. Clicking opens a full-page child thread with the complete
 * sub-agent transcript (tool calls + text in proper order).
 */

import { useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { makeAssistantToolUI } from '@assistant-ui/react'
import {
  ExternalLinkIcon,
  LoaderCircleIcon,
} from 'lucide-react'
import { getSubAgent } from '@/ai/agents'
import { childThreadMap } from '@/ai/tools/delegate'
import { updateSubAgentParts } from '@/lib/thread-storage'
import { openSubAgentThread } from '@/bridge'
import { cn } from '@/lib/utils'

interface DelegateTaskArgs {
  task: string
  agent_type?: string
}

interface SubAgentMessagePart {
  type: string
  text?: string
  toolCallId?: string
  toolName?: string
  argsText?: string
  args?: unknown
  result?: unknown
  isError?: boolean
  state?: string
  input?: unknown
  output?: unknown
  errorText?: string
}

interface SubAgentMessage {
  parts?: SubAgentMessagePart[]
}

// ─── Tool-call categorisation & summary ────────────────────────────

type ToolCategory = 'read' | 'search' | 'list' | 'edit' | 'write' | 'other'

const CATEGORY_ORDER: ToolCategory[] = [
  'read', 'search', 'list', 'edit', 'write', 'other',
]

const CATEGORY_LABEL: Record<ToolCategory, { one: string; many: string }> = {
  read: { one: 'read', many: 'reads' },
  search: { one: 'search', many: 'searches' },
  list: { one: 'list', many: 'lists' },
  edit: { one: 'edit', many: 'edits' },
  write: { one: 'write', many: 'writes' },
  other: { one: 'tool', many: 'tools' },
}

const TOOL_CALL_LIKE = new Set(['tool-call', 'dynamic-tool'])

function isToolPart(p: SubAgentMessagePart): boolean {
  if (TOOL_CALL_LIKE.has(p.type)) return true
  if (p.type.startsWith('tool-')) return true
  return false
}

function categorise(toolName?: string): ToolCategory | null {
  if (!toolName) return null
  const n = toolName.toLowerCase()
  if (n.includes('read')) return 'read'
  if (n.includes('search')) return 'search'
  if (n.includes('list')) return 'list'
  if (n.includes('edit')) return 'edit'
  if (n.includes('write')) return 'write'
  return 'other'
}

function getToolName(p: SubAgentMessagePart): string | undefined {
  if (p.toolName) return p.toolName
  if (p.type.startsWith('tool-')) return p.type.slice('tool-'.length)
  return undefined
}

function summariseTools(toolParts: SubAgentMessagePart[]): string {
  const counts: Partial<Record<ToolCategory, number>> = {}
  for (const p of toolParts) {
    const c = categorise(getToolName(p))
    if (!c) continue
    counts[c] = (counts[c] ?? 0) + 1
  }
  const segs: string[] = []
  for (const k of CATEGORY_ORDER) {
    const n = counts[k]
    if (!n) continue
    const lbl = CATEGORY_LABEL[k]
    segs.push(`${n} ${n === 1 ? lbl.one : lbl.many}`)
  }
  return segs.join(' · ')
}

// ─── Per-agent tone ────────────────────────────────────────────────

const AGENT_TONE: Record<string, string> = {
  explore: 'oklch(0.78 0.13 200)',
  coder: 'oklch(0.78 0.15 50)',
  general: 'oklch(0.75 0.14 290)',
}

// ─── Main UI ──────────────────────────────────────────────────────

export const DelegateTaskToolUI = makeAssistantToolUI<
  DelegateTaskArgs,
  SubAgentMessage
>({
  toolName: 'delegate_task',
  render: ({ args, result, status }) => {
    const isCancelled =
      status?.type === 'incomplete' && status.reason === 'cancelled'
    const isRunning = status?.type === 'running'

    const agentKey = args?.agent_type ?? ''
    const agentDef = agentKey ? getSubAgent(agentKey) : undefined
    const agentLabel = agentDef?.displayName ?? (agentKey || 'Sub-Agent')
    const tone = AGENT_TONE[agentKey] ?? 'var(--primary)'

    const parts: SubAgentMessagePart[] = result?.parts ?? []
    const toolParts = useMemo(
      () => parts.filter(isToolPart),
      [parts],
    )
    const summary = useMemo(() => summariseTools(toolParts), [toolParts])
    const childThreadId = useMemo(
      () => (args?.task ? childThreadMap.get(args.task) : undefined),
      [args?.task],
    )
    // Allow opening mid-execution (child thread created before sub-agent runs)
    const hasChild = !!childThreadId

    // Persist parts to child thread in memory when execution completes
    useEffect(() => {
      if (!childThreadId || isRunning || isCancelled) return
      if (parts.length === 0) return
      updateSubAgentParts(childThreadId, parts)
    }, [childThreadId, isRunning, isCancelled, parts])

    return (
      <div
        data-slot="delegate-task-trigger"
        role={hasChild ? 'button' : undefined}
        tabIndex={hasChild ? 0 : undefined}
        className={cn(
          'group/trigger',
          'relative flex w-full items-center gap-2 py-0.5 text-left',
          'transition-colors text-muted-foreground hover:text-foreground',
          hasChild && 'cursor-pointer',
          isCancelled && 'opacity-60',
        )}
        style={{ '--agent-tone': tone } as CSSProperties}
        onClick={hasChild ? () => openSubAgentThread(childThreadId!) : undefined}
        onKeyDown={
          hasChild
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  openSubAgentThread(childThreadId!)
                }
              }
            : undefined
        }
      >
        {isRunning ? (
          <span
            className="shrink-0"
            style={{ color: 'var(--agent-tone)' }}
            aria-hidden
          >
            <LoaderCircleIcon className="size-4 animate-spin" />
          </span>
        ) : (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: 'var(--agent-tone)' }}
            aria-hidden
          />
        )}

        <span
          className={cn(
            'shrink-0 text-sm font-medium capitalize',
            isCancelled && 'line-through',
          )}
          style={{ color: 'var(--agent-tone)' }}
        >
          {agentLabel}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {args?.task ?? ''}
        </span>

        {summary && (
          <span className="shrink-0 text-xs text-muted-foreground/40">
            {summary}
          </span>
        )}

        {hasChild && (
          <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground/30 group-hover/trigger:text-muted-foreground/70 transition-colors" />
        )}
      </div>
    )
  },
})
