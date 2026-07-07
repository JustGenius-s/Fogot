/**
 * Question Tool UI — renders a collapsed summary of ask_user calls once they
 * are answered. The interactive question form lives in QuestionDock (above the
 * composer) so this tool UI renders NOTHING while the tool is running — the
 * dock handles the live interaction, then this summary appears in the message
 * stream after the tool resolves.
 */

import { makeAssistantToolUI } from '@assistant-ui/react'
import { HelpCircleIcon, ChevronDownIcon } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { getLastSubmitted, type QuestionItem } from '@/ai/question-store'
import { useTranslation } from '@/lib/i18n'

interface AskUserArgs { questions: QuestionItem[] }

function parseArgs(args: unknown): QuestionItem[] {
  if (!args || typeof args !== 'object') return []
  return Array.isArray((args as AskUserArgs).questions) ? (args as AskUserArgs).questions : []
}

export const QuestionToolUI = makeAssistantToolUI<AskUserArgs, string>({
  toolName: 'ask_user',
  render: ({ args, status }) => {
    const { t } = useTranslation()
    const questions = parseArgs(args)
    const isRunning = status?.type === 'running'

    if (!questions.length) return null

    if (isRunning) return null

    const submitted = getLastSubmitted()

    return (
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <HelpCircleIcon className="size-3.5 shrink-0" />
          <span>
            {questions.length === 1
              ? t('question.askedOne')
              : t('question.askedMany', { count: questions.length })}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 transition-transform duration-200 group-data-[state=closed]/trigger:-rotate-90 group-data-[state=open]/trigger:rotate-0" />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down data-[state=closed]:fill-mode-forwards">
          <div className="mt-1 flex flex-col gap-2 pl-5">
            {questions.map((q, i) => {
              const labels = submitted?.[i] ?? []
              return (
                <div key={i} className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground/80">{q.question}</span>
                  <span className="text-xs text-muted-foreground">
                    {labels.length > 0 ? labels.join(', ') : t('question.unanswered')}
                  </span>
                </div>
              )
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  },
})
