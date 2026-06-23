/**
 * Question Tool UI — renders ask_user calls inline. refresh
 * Tab-based multi-question with radio/checkbox options and
 * toggleable custom text input. Styled after opencode's design.
 */

import { useState, useRef, useEffect } from 'react'
import { makeAssistantToolUI } from '@assistant-ui/react'
import { HelpCircleIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { submitAnswers, type QuestionItem } from '@/ai/question-store'

interface AskUserArgs { questions: QuestionItem[] }

function parseArgs(args: unknown): QuestionItem[] {
  if (!args || typeof args !== 'object') return []
  return Array.isArray((args as AskUserArgs).questions) ? (args as AskUserArgs).questions : []
}

interface AnswerState { selected: string[]; custom: string; customOn: boolean; editing: boolean }

const EMPTY: AnswerState = { selected: [], custom: '', customOn: false, editing: false }

function ensure(len: number, prev: AnswerState[]): AnswerState[] {
  if (prev.length === len) return prev
  return Array.from({ length: len }, (_, i) => prev[i] ?? { ...EMPTY })
}

function Mark({ picked }: { multi: boolean; picked: boolean }) {
  return (
    <span className={cn('size-3.5 shrink-0 rounded-sm border flex items-center justify-center transition-colors',
      picked ? 'border-primary/60 bg-primary/20 text-primary' : 'border-border group-hover:border-border/80')}>
      {picked && <CheckIcon className="size-2.5" />}
    </span>
  )
}

function OptionRow({ label, description, picked, onClick }: {
  label: string; description?: string; picked: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn('group flex items-start gap-2.5 w-full rounded-md px-2.5 py-2 text-left transition-colors',
        picked ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')}>
      <Mark multi={false} picked={picked} />
      <div className="flex flex-col min-w-0">
        <span className="text-sm leading-snug">{label}</span>
        {description && <span className="text-[11px] text-muted-foreground/60 leading-snug mt-0.5">{description}</span>}
      </div>
    </button>
  )
}

function CustomInput({ picked, editing, value, onToggle, onEdit, onChange, onCommit, placeholder }: {
  picked: boolean; editing: boolean; value: string
  onToggle: () => void; onEdit: () => void; onChange: (v: string) => void
  onCommit: () => void; placeholder: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.style.height = '0px'
      ref.current.style.height = `${ref.current.scrollHeight}px`
      ref.current.focus()
    }
  }, [editing])

  const row = cn('group flex items-start gap-2.5 w-full rounded-md px-2.5 py-2 text-left transition-colors',
    picked ? 'bg-primary/10' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')

  if (editing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); onCommit() }} className={row}
        onMouseDown={(e) => { if (!(e.target instanceof HTMLTextAreaElement)) ref.current?.focus() }}>
        <span onClick={(e) => { e.stopPropagation(); onToggle() }}><Mark multi={false} picked={picked} /></span>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm leading-snug">Type your own answer</span>
          <textarea ref={ref} value={value}
            onChange={(e) => { onChange(e.target.value); e.currentTarget.style.height = '0px'; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px` }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCommit() }; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit() } }}
            placeholder={placeholder} rows={1}
            className="mt-1 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none resize-none" />
        </div>
      </form>
    )
  }
  return (
    <button type="button" onClick={onEdit} className={row}>
      <span onClick={(e) => { e.stopPropagation(); onToggle() }}><Mark multi={false} picked={picked} /></span>
      <div className="flex flex-col min-w-0">
        <span className="text-sm leading-snug">Type your own answer</span>
        <span className="text-[11px] text-muted-foreground/40 leading-snug mt-0.5">{value || placeholder}</span>
      </div>
    </button>
  )
}

export const QuestionToolUI = makeAssistantToolUI<AskUserArgs, string>({
  toolName: 'ask_user',
  render: ({ args, status }) => {
    const questions = parseArgs(args)
    const isRunning = status?.type === 'running'

    const [tab, setTab] = useState(0)
    const [answers, setAnswers] = useState<AnswerState[]>(() =>
      questions.map(() => ({ ...EMPTY })),
    )

    const lastLen = useRef(questions.length)
    if (lastLen.current !== questions.length) {
      lastLen.current = questions.length
      // Trigger sync on next microtask — but state setters already handle the gap via ensure()
    }

    if (!questions.length) return null
    if (!isRunning) {
      const resultAnswers = answers
      return (
        <Collapsible>
          <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <HelpCircleIcon className="size-3.5 shrink-0" />
            <span>Asked {questions.length} question{questions.length > 1 ? 's' : ''}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 transition-transform duration-200 group-data-[state=closed]/trigger:-rotate-90 group-data-[state=open]/trigger:rotate-0" />
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down data-[state=closed]:fill-mode-forwards">
            <div className="mt-1 flex flex-col gap-2 pl-5">
              {questions.map((q, i) => {
                const a = resultAnswers[i]
                const labels = a ? [...a.selected, ...(a.customOn && a.custom.trim() ? [a.custom.trim()] : [])] : []
                return (
                  <div key={i} className="flex flex-col gap-0.5">
                    <span className="text-sm text-foreground/80">{q.question}</span>
                    <span className="text-xs text-muted-foreground">
                      {labels.length > 0 ? labels.join(', ') : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )
    }

    const answer = answers[tab] ?? EMPTY
    const total = questions.length
    const isLast = tab >= total - 1

    const handleSubmit = () => {
      const arr = ensure(total, answers).map((a) => {
        const c = [...a.selected]
        if (a.customOn && a.custom.trim()) c.push(a.custom.trim())
        return c
      })
      submitAnswers(arr)
    }

    const setAnswer = (patch: Partial<AnswerState>) => {
      setAnswers((prev) => {
        const synced = ensure(total, prev)
        return synced.map((a, i) => i === tab ? { ...a, ...patch } : a)
      })
    }

    const pick = (label: string) => {
      setAnswers((prev) => {
        const synced = ensure(total, prev)
        return synced.map((a, i) => i === tab ? { ...a, selected: [label], customOn: false, editing: false } : a)
      })
    }

    const commitCustom = () => {
      const val = answer.custom.trim()
      setAnswers((prev) => {
        const synced = ensure(total, prev)
        return synced.map((a, i) => i === tab ? { ...a, selected: val ? [val] : [], customOn: true, editing: false } : a)
      })
    }

    const next = () => {
      if (answer.editing) commitCustom()
      if (isLast) { handleSubmit(); return }
      setTab((t) => t + 1)
      setAnswers((prev) => {
        const synced = ensure(total, prev)
        return synced.map((a, i) => i === tab ? { ...a, editing: false } : a)
      })
    }

    const back = () => { if (tab > 0) setTab((t) => t - 1) }

    const answered = (i: number) => {
      const a = answers[i]
      if (!a) return false
      return a.selected.length > 0 || (a.customOn && a.custom.trim().length > 0)
    }

    const q = questions[tab]!
    const opts = q.options ?? []

    return (
      <div className="w-full rounded-lg border border-border/60 bg-card/30 p-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <HelpCircleIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium">
              {total === 1 ? 'Question' : `Question ${tab + 1} of ${total}`}
            </span>
          </div>
          {total > 1 && (
            <div className="flex items-center gap-1">
              {questions.map((_, i) => (
                <button key={i} type="button" onClick={() => setTab(i)}
                  className={cn('w-6 h-1.5 rounded-full transition-colors',
                    i === tab ? 'bg-primary' : answered(i) ? 'bg-primary/30' : 'bg-border/60')}
                  aria-label={`Question ${i + 1}`} />
              ))}
            </div>
          )}
        </div>
        <div className="pt-3 pb-2 text-sm font-medium text-foreground/90">{q.question}</div>
        <div className="flex flex-col gap-0.5">
          {opts.map((opt) => (
            <OptionRow key={opt.label} label={opt.label} description={opt.description}
              picked={answer.selected.includes(opt.label)} onClick={() => pick(opt.label)} />
          ))}
          <CustomInput picked={answer.customOn} editing={answer.editing} value={answer.custom}
            onToggle={() => answer.customOn
              ? setAnswer({ customOn: false, custom: '', selected: [], editing: false })
              : setAnswer({ customOn: true, editing: true })}
            onEdit={() => setAnswer({ editing: true, customOn: true })}
            onChange={(v) => setAnswer({ custom: v })} onCommit={commitCustom}
            placeholder="Type your own answer…" />
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
          <span className="text-[11px] text-muted-foreground/50">
            {q.multiple ? 'Choose any' : 'Pick one'}
          </span>
          <div className="flex items-center gap-1.5">
            {tab > 0 && <Button variant="ghost" size="sm" onClick={back}><ArrowLeftIcon className="size-3.5" />Back</Button>}
            <Button size="sm" onClick={next}>{isLast ? 'Submit' : 'Next'}<ArrowRightIcon className="size-3.5" /></Button>
          </div>
        </div>
      </div>
    )
  },
})
