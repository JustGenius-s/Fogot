/**
 * Custom Tool UI for delegate_task — shows sub-agent execution.
 *
 * Styled after opencode desktop's `task` tool, which uses `hideDetails`:
 * no inline expand. The card in the main thread is compact (title shown in
 * full, status + tool-call summary on the right). Clicking opens a large
 * right-side drawer with the full sub-agent transcript — native page-level
 * scroll, comfortable height, markdown-rendered text parts — so reading a
 * long Explorer / Coder trace is not crammed into a 200 px inline box.
 */

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { makeAssistantToolUI } from '@assistant-ui/react'
import { Streamdown } from 'streamdown'
import {
  ChevronRightIcon,
  LoaderCircleIcon,
  PanelRightIcon,
  XIcon,
} from 'lucide-react'
import { getSubAgent } from '@/ai/agents'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DelegateTaskArgs {
  task: string
  agent_type?: string
}

interface SubAgentMessagePart {
  type: string
  text?: string
  toolName?: string
  argsText?: string
  result?: unknown
}

interface SubAgentMessage {
  parts?: SubAgentMessagePart[]
}

// ─── Tool-call categorisation & summary ────────────────────────────

type ToolCategory = 'read' | 'search' | 'list' | 'edit' | 'write' | 'other'

const CATEGORY_ORDER: ToolCategory[] = ['read', 'search', 'list', 'edit', 'write', 'other']

const CATEGORY_LABEL: Record<ToolCategory, { one: string; many: string }> = {
  read: { one: 'read', many: 'reads' },
  search: { one: 'search', many: 'searches' },
  list: { one: 'list', many: 'lists' },
  edit: { one: 'edit', many: 'edits' },
  write: { one: 'write', many: 'writes' },
  other: { one: 'tool', many: 'tools' },
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

function summariseTools(toolParts: SubAgentMessagePart[]): string {
  const counts: Partial<Record<ToolCategory, number>> = {}
  for (const p of toolParts) {
    const c = categorise(p.toolName)
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

export const DelegateTaskToolUI = makeAssistantToolUI<
  DelegateTaskArgs,
  SubAgentMessage
>({
  toolName: 'delegate_task',
  render: ({ args, result, status }) => {
    const [open, setOpen] = useState(false)

    const isCancelled =
      status?.type === 'incomplete' && status.reason === 'cancelled'
    const isRunning = status?.type === 'running'

    const agentKey = args?.agent_type ?? ''
    const agentDef = agentKey ? getSubAgent(agentKey) : undefined
    const agentLabel = agentDef?.displayName ?? (agentKey || 'Sub-Agent')
    const tone = AGENT_TONE[agentKey] ?? 'var(--primary)'

    const parts = result?.parts ?? []
    const textParts = useMemo(
      () => parts.filter((p) => p.type === 'text' && p.text),
      [parts],
    )
    const toolParts = useMemo(
      () => parts.filter((p) => p.type === 'tool-call'),
      [parts],
    )
    const summary = useMemo(() => summariseTools(toolParts), [toolParts])
    const hasContent = textParts.length > 0 || toolParts.length > 0

    // While the sub-agent is still streaming, locking the drawer would show a
    // half-empty transcript. We still allow opening it (so the user can watch
    // progress) — opencode navigates to live sessions too.
    const canOpen = !isCancelled && (hasContent || isRunning)

    return (
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        {/* ─── Card in the main thread ─────────────────────────────── */}
        <DialogPrimitive.Trigger
          data-slot="delegate-task-trigger"
          disabled={!canOpen}
          className={cn(
            'group/trigger',
            'relative flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left',
            'border-border/60 bg-card/40 transition-colors',
            'hover:border-border hover:bg-muted/30',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-default disabled:opacity-70',
            'data-open:bg-muted/40',
          )}
          style={{ '--agent-tone': tone } as CSSProperties}
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

          <span
            className={cn(
              'flex shrink-0 items-center gap-0.5',
              'text-muted-foreground/40 transition-colors',
              'group-hover/trigger:text-muted-foreground/80',
            )}
          >
            <PanelRightIcon className="size-3.5" />
            <ChevronRightIcon className="size-3.5" />
          </span>
        </DialogPrimitive.Trigger>

        {/* ─── Drawer with the full transcript ────────────────────── */}
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop
            data-slot="delegate-task-overlay"
            className={cn(
              'fixed inset-0 isolate z-50 bg-black/20',
              'supports-backdrop-filter:backdrop-blur-xs',
              'duration-200 data-open:animate-in data-open:fade-in-0',
              'data-closed:animate-out data-closed:fade-out-0 data-closed:delay-100',
            )}
          />
          <DialogPrimitive.Popup
            data-slot="delegate-task-popup"
            className={cn(
              'fixed top-2 right-2 bottom-2 z-50 flex flex-col',
              'w-[min(640px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)]',
              'overflow-hidden rounded-lg border border-border/70',
              'bg-card text-card-foreground shadow-xl ring-1 ring-foreground/10',
              'duration-200 outline-none',
              'data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-right-full',
              'data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-right-full',
            )}
          >
            {/* Drawer header — minimal agent line + close */}
            <div
              data-slot="delegate-task-header"
              className={cn(
                'flex items-center gap-2 border-b border-border/50 px-3 py-2',
              )}
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
              <DialogPrimitive.Title
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 text-sm font-medium capitalize',
                  isCancelled && 'line-through',
                )}
                style={{ color: 'var(--agent-tone)' }}
              >
                {agentLabel}
                {(summary || isRunning) && (
                  <span
                    className="flex items-center gap-1.5 truncate text-xs font-normal text-muted-foreground/70"
                    style={{ color: undefined }}
                  >
                    {summary && <span>{summary}</span>}
                    {isRunning && <span>working…</span>}
                  </span>
                )}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Sub-agent transcript
              </DialogPrimitive.Description>
              <DialogPrimitive.Close
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="-mr-1 shrink-0"
                  />
                }
                aria-label="Close"
              >
                <XIcon />
              </DialogPrimitive.Close>
            </div>

            {/* Drawer body — chat-style transcript, native scroll */}
            <div
              data-slot="delegate-task-body"
              className={cn(
                'flex-1 overflow-y-auto px-3 py-3 text-sm leading-relaxed',
              )}
            >
              <DrawerTranscript
                task={args?.task}
                toolParts={toolParts}
                textParts={textParts}
                isRunning={isRunning}
                isCancelled={isCancelled}
              />
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    )
  },
})

/**
 * Sub-agent transcript rendered like the main chat:
 *  - the user's task is the first message bubble (right-aligned, muted bg)
 *  - tool calls compact rows (left-aligned, → prefix)
 *  - text parts rendered as markdown reply blocks (left-aligned)
 */
function DrawerTranscript({
  task,
  toolParts,
  textParts,
  isRunning,
  isCancelled,
}: {
  task?: string
  toolParts: SubAgentMessagePart[]
  textParts: SubAgentMessagePart[]
  isRunning: boolean
  isCancelled: boolean
}) {
  const ordered = useMemo(() => {
    const merged: Array<
      | { kind: 'tool'; toolName?: string; argsText?: string }
      | { kind: 'text'; text?: string }
    > = []
    for (const p of toolParts) {
      merged.push({ kind: 'tool', toolName: p.toolName, argsText: p.argsText })
    }
    for (const p of textParts) {
      merged.push({ kind: 'text', text: p.text })
    }
    return merged
  }, [toolParts, textParts])

  const hasAny = !!task || ordered.length > 0 || isRunning || isCancelled

  return (
    <div className="flex flex-col gap-3">
      {/* Task as a user message bubble */}
      {task && (
        <div className="flex justify-end">
          <div className="aui-user-message-content wrap-break-word max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-foreground [user-select:text]">
            {task}
          </div>
        </div>
      )}

      {/* Sub-agent reply zone */}
      {(ordered.length > 0 || isRunning) && (
        <div className="flex flex-col gap-2 border-l-2 border-border/40 ps-3">
          {ordered.map((item, i) => {
            if (item.kind === 'tool') {
              return (
                <div
                  key={`t-${i}`}
                  className="flex items-baseline gap-2 rounded-sm px-1 py-0.5 text-xs text-muted-foreground/80 [user-select:text] hover:bg-muted/30"
                >
                  <span className="shrink-0 text-muted-foreground/40">→</span>
                  <span className="shrink-0 font-medium text-foreground/80">
                    {item.toolName ?? 'tool'}
                  </span>
                  {item.argsText && (
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground/50">
                      {item.argsText}
                    </span>
                  )}
                </div>
              )
            }
            return (
              <div
                key={`p-${i}`}
                className="aui-md text-sm [user-select:text]"
              >
                <Streamdown mode="static">{item.text ?? ''}</Streamdown>
              </div>
            )
          })}

          {isRunning && (
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground/70">
              <LoaderCircleIcon className="size-3 animate-spin" />
              <span>working…</span>
            </div>
          )}
        </div>
      )}

      {isCancelled && (
        <p className="text-xs text-muted-foreground/60">— cancelled —</p>
      )}

      {!hasAny && (
        <p className="text-muted-foreground/70">No transcript available.</p>
      )}
    </div>
  )
}