/**
 * Full-page read-only view for sub-agent child threads.
 *
 * Reuses the main chat's ToolFallback components directly so tool
 * calls look identical to the main thread.
 */

import { useMemo, useState } from 'react'
import { Streamdown } from 'streamdown'
import { ArrowLeftIcon } from 'lucide-react'
import {
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackArgs,
  ToolFallbackResult,
} from '@/components/assistant-ui/tool-fallback'
import { getSubAgentData } from '@/lib/thread-storage'
import { closeSubAgentThread } from '@/bridge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SubAgentMessagePart {
  type: string
  text?: string
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

const TOOL_CALL_LIKE = new Set(['tool-call', 'dynamic-tool'])

function isToolPart(p: SubAgentMessagePart): boolean {
  if (TOOL_CALL_LIKE.has(p.type)) return true
  if (p.type.startsWith('tool-')) return true
  return false
}

function getToolName(p: SubAgentMessagePart): string | undefined {
  if (p.toolName) return p.toolName
  if (p.type.startsWith('tool-')) return p.type.slice('tool-'.length)
  return undefined
}

function getArgsText(p: SubAgentMessagePart): string | undefined {
  if (p.argsText) return p.argsText
  if (p.args != null) return JSON.stringify(p.args)
  if (p.input != null) return JSON.stringify(p.input)
  return undefined
}

function getResult(p: SubAgentMessagePart): unknown {
  if (p.result !== undefined) return p.result
  if (p.output !== undefined) return p.output
  return undefined
}

function getIsError(p: SubAgentMessagePart): boolean {
  if (p.isError === true) return true
  if (p.state === 'output-error') return true
  return false
}

function ToolCallRow({ part }: { part: SubAgentMessagePart }) {
  const [open, setOpen] = useState(false)
  const toolName = getToolName(part) ?? 'tool'
  const argsText = getArgsText(part)
  const result = getResult(part)
  const isFailed = getIsError(part)

  const status = isFailed
    ? ({ type: 'incomplete' as const, reason: 'error' as const })
    : result !== undefined
      ? ({ type: 'complete' as const })
      : ({ type: 'running' as const })

  return (
    <ToolFallbackRoot open={open} onOpenChange={setOpen}>
      <ToolFallbackTrigger toolName={toolName} status={status} />
      <ToolFallbackContent>
        <ToolFallbackArgs argsText={argsText} />
        {result !== undefined && (
          <ToolFallbackResult result={result} />
        )}
        {isFailed && part.errorText && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-destructive/70 uppercase tracking-wider">Error</span>
            <pre className="whitespace-pre-wrap font-mono text-xs text-destructive/80 bg-destructive/5 rounded px-2.5 py-2 leading-relaxed">
              {part.errorText}
            </pre>
          </div>
        )}
      </ToolFallbackContent>
    </ToolFallbackRoot>
  )
}

const AGENT_TONE: Record<string, string> = {
  explore: 'oklch(0.78 0.13 200)',
  coder: 'oklch(0.78 0.15 50)',
  general: 'oklch(0.75 0.14 290)',
}

export function SubAgentThreadView({ threadId }: { threadId: string }) {
  const data = useMemo(() => getSubAgentData(threadId), [threadId])

  if (!data) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
          <Button variant="ghost" size="icon-sm" onClick={closeSubAgentThread}>
            <ArrowLeftIcon className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Sub-agent data not found.</span>
        </div>
      </div>
    )
  }

  const tone = AGENT_TONE[data.agentType] ?? 'var(--primary)'
  const parts = (data.parts ?? []) as SubAgentMessagePart[]
  const agentLabel =
    data.agentType === 'explore' ? 'Explorer'
    : data.agentType === 'coder' ? 'Coder'
    : 'Sub-Agent'

  const ordered = useMemo(() => {
    const result: Array<
      | { kind: 'text'; text: string }
      | { kind: 'tool'; part: SubAgentMessagePart }
    > = []
    for (const p of parts) {
      if (p.type === 'text' && p.text) {
        result.push({ kind: 'text', text: p.text })
      } else if (isToolPart(p)) {
        result.push({ kind: 'tool', part: p })
      }
    }
    return result
  }, [parts])

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={closeSubAgentThread} aria-label="Back to parent thread">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="size-2 rounded-full shrink-0" style={{ background: tone }} aria-hidden />
        <span className="text-sm font-medium capitalize" style={{ color: tone }}>
          {agentLabel}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 px-4 py-4 text-sm leading-relaxed max-w-3xl mx-auto">
          <div className="flex justify-end">
            <div className="wrap-break-word max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-foreground [user-select:text]">
              {data.task}
            </div>
          </div>

          {ordered.length > 0 ? (
            <div className="flex flex-col gap-1 border-l-2 border-border/40 pl-3">
              {ordered.map((item, i) => {
                if (item.kind === 'tool') {
                  return <ToolCallRow key={`t-${i}`} part={item.part} />
                }
                return (
                  <div key={`p-${i}`} className="aui-md py-0.5 text-sm [user-select:text]">
                    <Streamdown mode="static">{item.text}</Streamdown>
                  </div>
                )
              })}
            </div>
          ) : parts.length > 0 ? (
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground/70 bg-muted/30 rounded p-3 leading-relaxed max-h-96 overflow-auto">
              {parts.length} parts loaded, types: [{parts.map((p) => p.type).join(', ')}]
              {'\n\n'}
              {JSON.stringify(parts.slice(0, 3), null, 2)}
              {parts.length > 3 ? '\n…' + (parts.length - 3) + ' more parts' : ''}
            </pre>
          ) : (
            <p className="text-muted-foreground/70 text-xs">No transcript available.</p>
          )}
        </div>
      </div>
    </div>
  )
}
