/**
 * Custom Tool UI for execute_command — Cursor-style terminal display
 * with streaming output, elapsed time, and stop button.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { makeAssistantToolUI, useScrollLock } from '@assistant-ui/react'
import {
  ChevronDownIcon,
  SquareIcon,
  SquareTerminalIcon,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  cancelCommand,
  getCommandOutput,
  getCommandRequestId,
  onCommandOutputChange,
} from '@/bridge'
import { cn } from '@/lib/utils'

const ANIMATION_DURATION = 200

function useElapsed(running: boolean): string {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    if (!running) return
    startRef.current = Date.now()
    const timer = setInterval(() => {
      setElapsed(Date.now() - startRef.current)
    }, 100)
    return () => clearInterval(timer)
  }, [running])

  if (!running && elapsed === 0) return ''
  const seconds = (elapsed / 1000).toFixed(1)
  return `${seconds}s`
}

function ExitCodeBadge({ code }: { code: number | null }) {
  if (code === null) return null
  const isSuccess = code === 0
  return (
    <span
      className={cn(
        'ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium',
        isSuccess
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-red-500/15 text-red-400',
      )}
    >
      {isSuccess ? 'exit 0' : `exit ${code}`}
    </span>
  )
}

function parseExitCode(result: string | undefined): number | null {
  if (!result) return null
  const match = result.match(/^Exit code: (-?\d+)/)
  return match ? parseInt(match[1], 10) : null
}

export const ExecuteCommandToolUI = makeAssistantToolUI<
  { command: string },
  string
>({
  toolName: 'execute_command',
  render: ({ args, result, status }) => {
    const collapsibleRef = useRef<HTMLDivElement>(null)
    const outputRef = useRef<HTMLPreElement>(null)
    const [open, setOpen] = useState(true)
    const [streamOutput, setStreamOutput] = useState('')
    const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION)

    const isCancelled =
      status?.type === 'incomplete' && status.reason === 'cancelled'
    const isRunning = status?.type === 'running'
    const elapsedStr = useElapsed(isRunning)

    const requestId = getCommandRequestId(args?.command ?? '')

    useEffect(() => {
      if (!requestId) return
      setStreamOutput(getCommandOutput(requestId))
      const unsub = onCommandOutputChange((id, fullOutput) => {
        if (id === requestId) {
          setStreamOutput(fullOutput)
        }
      })
      return unsub
    }, [requestId])

    useEffect(() => {
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight
      }
    }, [streamOutput])

    const handleOpenChange = useCallback(
      (next: boolean) => {
        if (!next) lockScroll()
        setOpen(next)
      },
      [lockScroll],
    )

    const handleStop = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        if (requestId) {
          cancelCommand(requestId)
        }
      },
      [requestId],
    )

    const command = args?.command ?? ''
    const exitCode = parseExitCode(result)
    const displayOutput = isRunning ? streamOutput : streamOutput || ''

    return (
      <Collapsible
        ref={collapsibleRef}
        open={open}
        onOpenChange={handleOpenChange}
        className={cn(isCancelled && 'opacity-60')}
      >
        <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2 py-0.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground">
          <span className="relative size-3.5 shrink-0">
            <SquareTerminalIcon className="size-3.5 absolute inset-0 transition-opacity group-hover/trigger:opacity-0" />
            <ChevronDownIcon
              className={cn(
                'size-3.5 absolute inset-0 transition-all opacity-0 group-hover/trigger:opacity-100',
                !open && '-rotate-90',
              )}
            />
          </span>
          <code className="flex-1 truncate font-mono text-xs">
            {command}
          </code>
          {isRunning && (
            <>
              <span className="text-[11px] tabular-nums">
                {elapsedStr}
              </span>
              <div
                role="button"
                tabIndex={0}
                onClick={handleStop}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStop(e as any) }}
                className="ml-1 flex size-5 items-center justify-center rounded hover:bg-destructive/20 transition-colors cursor-pointer"
                aria-label="Stop command"
              >
                <SquareIcon className="size-3 fill-current hover:text-destructive" />
              </div>
            </>
          )}
          {!isRunning && <ExitCodeBadge code={exitCode} />}
          {isRunning && (
            <div className="size-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="pl-5">
          <pre
            ref={outputRef}
            className="mt-1 max-h-[300px] overflow-auto bg-zinc-900 px-3 py-2.5 font-mono text-xs leading-relaxed text-zinc-200 rounded scrollbar-thin"
          >
            {displayOutput || (
              isRunning
                ? <span className="text-zinc-500 italic">Waiting for output...</span>
                : <span className="text-zinc-500 italic">No output</span>
            )}
          </pre>
          {isCancelled && (
            <div className="bg-zinc-900 rounded-b px-3 py-1.5 text-[11px] text-amber-400">
              Command cancelled
            </div>
          )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  },
})
