/**
 * Custom Tool UI for delegate_task — shows sub-agent execution progress.
 */

import { makeAssistantToolUI } from '@assistant-ui/react'
import {
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackError,
} from '@/components/assistant-ui/tool-fallback'
import { getSubAgent } from '@/ai/agents'
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

export const DelegateTaskToolUI = makeAssistantToolUI<
  DelegateTaskArgs,
  SubAgentMessage
>({
  toolName: 'delegate_task',
  render: ({ args, result, status }) => {
    const isCancelled =
      status?.type === 'incomplete' && status.reason === 'cancelled'
    const isRunning = status?.type === 'running'

    const agentDef = args?.agent_type
      ? getSubAgent(args.agent_type)
      : undefined
    const agentLabel = agentDef?.displayName ?? args?.agent_type ?? 'Sub-Agent'
    const triggerLabel = `delegate_task → ${agentLabel}`

    const parts = result?.parts ?? []
    const textParts = parts.filter((p) => p.type === 'text' && p.text)
    const toolParts = parts.filter((p) => p.type === 'tool-call')
    const lastText = textParts[textParts.length - 1]?.text

    return (
      <ToolFallbackRoot
        className={cn(
          isCancelled && 'border-muted-foreground/30 bg-muted/30',
          isRunning && 'border-primary/30',
        )}
        defaultOpen={isRunning}
      >
        <ToolFallbackTrigger toolName={triggerLabel} status={status} />
        <ToolFallbackContent>
          <ToolFallbackError status={status} />

          {args?.task && (
            <div className="px-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Task: </span>
              {args.task.length > 200
                ? args.task.slice(0, 200) + '...'
                : args.task}
            </div>
          )}

          {toolParts.length > 0 && (
            <div className="px-4 text-xs text-muted-foreground space-y-0.5">
              {toolParts.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-muted-foreground/60">↳</span>
                  <span>{p.toolName}</span>
                </div>
              ))}
            </div>
          )}

          {lastText && (
            <div className="px-4 border-t border-dashed pt-2 text-sm whitespace-pre-wrap">
              {lastText}
            </div>
          )}
        </ToolFallbackContent>
      </ToolFallbackRoot>
    )
  },
})
