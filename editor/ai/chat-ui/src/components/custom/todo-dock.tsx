/**
 * Todo Dock — renders the active plan's execution progress ABOVE the
 * composer, mirroring opencode's SessionTodoDock layout.
 *
 * Read-only display — no user interaction. Shows step status as the AI
 * calls update_plan during execution. Collapses with a chevron toggle.
 */

import { useState, useRef, useEffect, type FC } from 'react'
import {
  ListTodoIcon,
  ChevronDownIcon,
  CircleIcon,
  CircleDotIcon,
  SquareFunctionIcon,
  SkipForwardIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActivePlan, type PlanStepState } from '@/bridge'

const StepIcon: FC<{ status: PlanStepState['status'] }> = ({ status }) => {
  switch (status) {
    case 'done':
      return <SquareFunctionIcon className="size-3.5 text-emerald-500 shrink-0" />
    case 'in_progress':
      return <CircleDotIcon className="size-3.5 text-primary shrink-0 animate-pulse" />
    case 'skipped':
      return <SkipForwardIcon className="size-3.5 text-muted-foreground/50 shrink-0" />
    default:
      return <CircleIcon className="size-3.5 text-muted-foreground/40 shrink-0" />
  }
}

export const TodoDock: FC = () => {
  const plan = useActivePlan()
  const [minimized, setMinimized] = useState(false)
  const [bodyH, setBodyH] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Measure the body for collapse animation.
  useEffect(() => {
    if (!bodyRef.current || minimized || !plan) return
    const el = bodyRef.current
    const update = () => setBodyH(el.scrollHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [bodyRef, minimized, plan])

  if (!plan) return null

  const steps = plan.steps
  const total = steps.length
  const done = steps.filter((s) => s.status === 'done').length
  const current = steps.find((s) => s.status === 'in_progress')?.title ?? ''

  return (
    <div
      data-component="todo-dock"
      data-minimized={minimized}
      className="w-full mx-auto rounded-t-(--composer-radius) rounded-b-none border border-border/60 border-b-0 bg-card shadow-lg overflow-hidden"
      style={{ maxWidth: 'calc(100% - var(--composer-radius) * 1.5)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <ListTodoIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground truncate">
            {plan.summary}
          </span>
          <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">
            {done}/{total}
          </span>
          {current && (
            <span className="text-xs text-muted-foreground truncate hidden sm:inline">
              &middot; {current}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMinimized((m) => !m)}
          aria-label={minimized ? 'Restore' : 'Minimize'}
          className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ChevronDownIcon
            className={cn('size-3.5 transition-transform duration-300', minimized && 'rotate-180')}
          />
        </button>
      </div>

      {/* Steps list (animated collapse) */}
      <div
        ref={bodyRef}
        data-slot="question-collapser"
        style={{ maxHeight: minimized ? 0 : Math.max(bodyH, 120) }}
      >
        <div className="px-3 py-2 max-h-[40vh] overflow-y-auto flex flex-col gap-1">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <StepIcon status={step.status} />
              <span
                className={cn(
                  'text-sm',
                  step.status === 'done' && 'text-muted-foreground line-through',
                  step.status === 'skipped' && 'text-muted-foreground/60 line-through',
                  step.status === 'in_progress' && 'text-foreground font-medium',
                  step.status === 'pending' && 'text-foreground',
                )}
              >
                {step.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
