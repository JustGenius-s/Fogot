/**
 * Custom Tool UI for delegate_task — shows sub-agent execution
 * in a compact, borderless inline style with expandable output.
 */

import { useCallback, useRef, useState } from 'react'
import { makeAssistantToolUI, useScrollLock } from '@assistant-ui/react'
import { ChevronDownIcon } from 'lucide-react'
import { getSubAgent } from '@/ai/agents'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

const ANIMATION_DURATION = 200

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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

function AgentIndicator({ running }: { running: boolean }) {
  if (running) {
    return <div className="agent-orbit" />
  }
  return (
    <div className="flex size-[14px] shrink-0 items-center justify-center">
      <div className="size-[5px] rounded-full bg-muted-foreground/50" />
    </div>
  )
}

export const DelegateTaskToolUI = makeAssistantToolUI<
  DelegateTaskArgs,
  SubAgentMessage
>({
  toolName: 'delegate_task',
  render: ({ args, result, status }) => {
    const collapsibleRef = useRef<HTMLDivElement>(null)
    const [open, setOpen] = useState(false)
    const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION)

    const handleOpenChange = useCallback(
      (next: boolean) => {
        if (!next) lockScroll()
        setOpen(next)
      },
      [lockScroll],
    )

    const isCancelled =
      status?.type === 'incomplete' && status.reason === 'cancelled'
    const isRunning = status?.type === 'running'

    const agentDef = args?.agent_type
      ? getSubAgent(args.agent_type)
      : undefined
    const agentLabel =
      agentDef?.displayName ?? args?.agent_type ?? 'Sub-Agent'

    const parts = result?.parts ?? []
    const textParts = parts.filter((p) => p.type === 'text' && p.text)
    const toolParts = parts.filter((p) => p.type === 'tool-call')
    const lastText = textParts[textParts.length - 1]?.text

    const taskLabel = args?.task
      ? truncate(args.task, 60)
      : 'Sub-agent task'

    const statusLine = isRunning
      ? toolParts.length > 0
        ? toolParts[toolParts.length - 1]?.toolName ?? 'Working…'
        : lastText
          ? truncate(lastText, 80)
          : 'Working…'
      : isCancelled
        ? 'Cancelled'
        : lastText
          ? truncate(lastText, 80)
          : 'Done'

    return (
      <Collapsible
        ref={collapsibleRef}
        open={open}
        onOpenChange={handleOpenChange}
        className={cn('my-1.5 w-full', isCancelled && 'opacity-50')}
        style={{ '--animation-duration': `${ANIMATION_DURATION}ms` } as React.CSSProperties}
      >
        {/* Trigger — single row: indicator + task + agent + status + chevron */}
        <CollapsibleTrigger
          className={cn(
            'group/trigger flex w-full items-center gap-2 py-0.5 text-sm',
            'text-muted-foreground transition-colors hover:text-foreground',
          )}
        >
          <AgentIndicator running={isRunning} />

          <span
            className={cn(
              'shrink-0 text-foreground/90',
              isCancelled && 'line-through',
            )}
          >
            {taskLabel}
          </span>

          <span className="shrink-0 text-muted-foreground/50 text-xs">
            {agentLabel}
          </span>

          <ChevronDownIcon
            className={cn(
              'size-3.5 shrink-0 transition-transform ease-out',
              'duration-(--animation-duration)',
              'group-data-[state=closed]/trigger:-rotate-90',
              'group-data-[state=open]/trigger:rotate-0',
            )}
          />
        </CollapsibleTrigger>

        {/* Expandable content */}
        <CollapsibleContent
          className={cn(
            'relative overflow-hidden text-xs text-muted-foreground outline-none',
            'group/collapsible-content ease-out',
            'data-[state=closed]:animate-collapsible-up',
            'data-[state=open]:animate-collapsible-down',
            'data-[state=closed]:fill-mode-forwards',
            'data-[state=closed]:pointer-events-none',
            'data-[state=open]:duration-(--animation-duration)',
            'data-[state=closed]:duration-(--animation-duration)',
          )}
        >
          <div className="relative max-h-48 space-y-1 overflow-y-auto ps-[22px] pt-1.5 pb-1 leading-relaxed">
            {toolParts.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5 text-muted-foreground/60">
                <span>→</span>
                <span>{p.toolName}</span>
              </div>
            ))}
            {lastText && (
              <div className="whitespace-pre-wrap text-muted-foreground/80">
                {lastText}
              </div>
            )}
          </div>
          {/* Bottom fade */}
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6',
              'bg-[linear-gradient(to_top,var(--color-background),transparent)]',
              'fade-in-0 animate-in',
              'group-data-[state=open]/collapsible-content:animate-out',
              'group-data-[state=open]/collapsible-content:fade-out-0',
              'group-data-[state=open]/collapsible-content:delay-[calc(var(--animation-duration)*0.75)]',
              'group-data-[state=open]/collapsible-content:fill-mode-forwards',
              'duration-(--animation-duration)',
              'group-data-[state=open]/collapsible-content:duration-(--animation-duration)',
            )}
          />
        </CollapsibleContent>
      </Collapsible>
    )
  },
})
