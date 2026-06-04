/**
 * Custom Tool UI for use_skill — compact inline label.
 */

import { makeAssistantToolUI } from '@assistant-ui/react'
import { SparklesIcon, CheckCircle2Icon, AlertCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UseSkillArgs {
  skill_id: string
}

export const SkillToolUI = makeAssistantToolUI<UseSkillArgs, string>({
  toolName: 'use_skill',
  render: ({ args, result, status }) => {
    const isRunning = status?.type === 'running'
    const isError = typeof result === 'string' && result.startsWith('{"error"')
    const isAlready = typeof result === 'string' && result.startsWith('{"info"')
    const label = args?.skill_id ?? 'skill'

    return (
      <div className={cn('my-1.5 flex items-center gap-2 py-0.5 text-sm text-muted-foreground', isError && 'text-destructive')}>
        {isError ? <AlertCircleIcon className="size-3.5 shrink-0" />
        : isRunning ? <SparklesIcon className="size-3.5 shrink-0 animate-pulse" />
        : <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-500" />}
        <span className="shrink-0 text-foreground/90">Skill: {label}</span>
        <span className="text-xs text-muted-foreground/50">
          {isRunning ? 'Loading…' : isError ? 'Not found' : isAlready ? 'Already loaded' : 'Loaded'}
        </span>
      </div>
    )
  },
})
