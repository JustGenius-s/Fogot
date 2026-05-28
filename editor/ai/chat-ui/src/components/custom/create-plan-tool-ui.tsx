/**
 * Plan card Tool UI — a single card showing plan steps with live status updates.
 */

import { makeAssistantToolUI, useAui } from '@assistant-ui/react'
import { cn } from '@/lib/utils'
import {
  CheckCircle2Icon,
  CircleIcon,
  CircleDotIcon,
  SkipForwardIcon,
  PlayIcon,
  ListTodoIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  setAgentId,
  setActivePlan,
  useActivePlan,
  type PlanStepState,
} from '@/bridge'
import { type FC, useState } from 'react'

// ─── Step Status Icon ────────────────────────────────────────────

const StepIcon: FC<{ status: PlanStepState['status'] }> = ({ status }) => {
  switch (status) {
    case 'done':
      return <CheckCircle2Icon className="size-4 text-emerald-500 shrink-0" />
    case 'in_progress':
      return <CircleDotIcon className="size-4 text-primary shrink-0 animate-pulse" />
    case 'skipped':
      return <SkipForwardIcon className="size-4 text-muted-foreground/50 shrink-0" />
    default:
      return <CircleIcon className="size-4 text-muted-foreground/40 shrink-0" />
  }
}

// ─── exit_plan_mode Tool UI ──────────────────────────────────────

interface ExitPlanModeArgs {
  plan_summary: string
  steps: string[]
}

const ApprovalActions: FC<{ args: ExitPlanModeArgs }> = ({ args }) => {
  const aui = useAui()
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null)

  const handleApprove = () => {
    setDecided('approved')
    const steps = args.steps ?? []
    setActivePlan({
      summary: args.plan_summary,
      steps: steps.map((s) => ({ title: s, status: 'pending' })),
    })

    setAgentId('agent')

    const thread = aui.thread()
    const messages = thread.getState().messages
    let planContent = ''
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant') {
        const textParts = msg.content?.filter((p: any) => p.type === 'text') ?? []
        planContent = textParts.map((p: any) => p.text).join('\n')
        break
      }
    }

    const stepsRef = steps.map((s, i) => `${i}. ${s}`).join('\n')
    const execMsg = planContent
      ? `[PLAN_EXEC]\nImplement the following plan:\n\n${planContent}\n\n---\nStep indices for update_plan:\n${stepsRef}`
      : `[PLAN_EXEC]\nExecute the plan: ${args.plan_summary}\n\nSteps:\n${stepsRef}`

    const composer = thread.composer()
    composer.setText(execMsg)
    composer.send()
  }

  if (decided === 'approved') return null

  return (
    <div className="flex items-center justify-end px-4">
      <Button size="sm" onClick={handleApprove} disabled={decided !== null}>
        <PlayIcon data-icon="inline-start" />
        Execute
      </Button>
    </div>
  )
}

/** The plan card — reads live status from the plan store. */
const PlanCardContent: FC<{ args: ExitPlanModeArgs; isDone: boolean }> = ({ args, isDone }) => {
  const activePlan = useActivePlan()
  const steps = activePlan?.steps ?? (args.steps ?? []).map((s) => ({ title: s, status: 'pending' as const }))
  const total = steps.length
  const done = steps.filter((s) => s.status === 'done').length
  const showButtons = !activePlan && (args.steps ?? []).length > 0

  return (
    <div className="aui-tool-fallback-root w-full rounded-lg border py-3">
      <div className="flex items-center gap-2 px-4 pb-2 text-sm">
        <ListTodoIcon className="size-4 text-muted-foreground" />
        <span className="font-medium">Plan</span>
      </div>

      <div className="px-4 space-y-1.5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <StepIcon status={step.status} />
            <span className={cn(
              'text-sm',
              step.status === 'done' && 'text-muted-foreground line-through',
              step.status === 'skipped' && 'text-muted-foreground/60 line-through',
              step.status === 'in_progress' && 'text-foreground font-medium',
              step.status === 'pending' && 'text-foreground',
            )}>
              {step.title}
            </span>
          </div>
        ))}
      </div>

      {showButtons && <ApprovalActions args={args} />}
    </div>
  )
}

export const ExitPlanModeToolUI = makeAssistantToolUI<ExitPlanModeArgs, unknown>({
  toolName: 'exit_plan_mode',
  render: ({ args, status }) => {
    if (!args) return null
    const isDone = status?.type === 'complete'
    return <PlanCardContent args={args} isDone={isDone} />
  },
})
