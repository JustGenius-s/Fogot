/**
 * Question Dock — renders the ask_user question form ABOVE the composer,
 * mirroring opencode's SessionQuestionDock layout.
 *
 * The tool UI (question-tool-ui.tsx) only renders a collapsed summary once
 * the question has been answered; while the tool is "running" it renders
 * nothing and this dock handles all interaction instead.
 */

import { useState, useRef, useEffect, useSyncExternalStore, type FC } from 'react'
import {
  HelpCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import {
  getPending,
  subscribe,
  submitAnswers,
  dismissQuestions,
  type QuestionItem,
} from '@/ai/question-store'

interface AnswerState {
  selected: string[]
  custom: string
  customOn: boolean
  editing: boolean
}

const EMPTY: AnswerState = { selected: [], custom: '', customOn: false, editing: false }

function ensure(len: number, prev: AnswerState[]): AnswerState[] {
  if (prev.length === len) return prev
  return Array.from({ length: len }, (_, i) => prev[i] ?? { ...EMPTY })
}

function Mark({ picked, letter }: { multi?: boolean; picked: boolean; letter?: string }) {
  return (
    <span
      className={cn(
        'size-[18px] mt-px shrink-0 rounded-[4px] border flex items-center justify-center transition-colors text-[11px] font-semibold leading-none',
        picked
          ? 'bg-primary border-primary text-primary-foreground'
          : 'border-border text-muted-foreground group-hover:border-border/80',
      )}
      aria-hidden="true"
    >
      {letter}
    </span>
  )
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function OptionRow({
  label,
  index,
  picked,
  multi,
  onClick,
}: {
  label: string
  index: number
  picked: boolean
  multi: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-picked={picked}
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={picked}
      className={cn(
        'group flex items-center gap-2 w-full rounded-md pl-1 pr-2 py-1.5 text-left transition-colors',
        picked
          ? 'bg-primary/10'
          : 'hover:bg-muted/50',
      )}
    >
      <Mark multi={multi} picked={picked} letter={LETTERS[index] ?? String(index + 1)} />
      <span className="text-sm leading-snug text-foreground">{label}</span>
    </button>
  )
}

function CustomInput({
  picked,
  editing,
  value,
  letter,
  onToggle,
  onEdit,
  onChange,
  onCommit,
  placeholder,
}: {
  picked: boolean
  editing: boolean
  value: string
  letter: string
  onToggle: () => void
  onEdit: () => void
  onChange: (v: string) => void
  onCommit: () => void
  placeholder: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.style.height = '0px'
      ref.current.style.height = `${ref.current.scrollHeight}px`
      ref.current.focus()
    }
  }, [editing])

  const row = cn(
    'group flex items-center gap-2 w-full rounded-md pl-1 pr-2 py-1.5 text-left transition-colors',
    picked
      ? 'bg-primary/10'
      : 'hover:bg-muted/50',
  )

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onCommit()
        }}
        onMouseDown={(e) => {
          if (!(e.target instanceof HTMLTextAreaElement)) ref.current?.focus()
        }}
        className={row}
      >
        <span onClick={(e) => { e.stopPropagation(); onToggle() }}>
          <Mark picked={picked} letter={letter} />
        </span>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            e.currentTarget.style.height = '0px'
            e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onCommit()
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onCommit()
            }
          }}
          placeholder={placeholder}
          rows={1}
          className="flex-1 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none resize-none self-center"
        />
      </form>
    )
  }
  return (
    <button type="button" onClick={onEdit} className={row}>
      <span onClick={(e) => { e.stopPropagation(); onToggle() }}>
        <Mark picked={picked} letter={letter} />
      </span>
      <span className="text-sm leading-snug text-muted-foreground/50 flex-1 text-left">
        {value || placeholder}
      </span>
    </button>
  )
}

export const QuestionDock: FC = () => {
  const { t } = useTranslation()
  const pending = useSyncExternalStore(subscribe, getPending)

  const questions: QuestionItem[] = pending?.questions ?? []
  const total = questions.length

  const [tab, setTab] = useState(0)
  const [answers, setAnswers] = useState<AnswerState[]>(() => questions.map(() => ({ ...EMPTY })))
  const [minimized, setMinimized] = useState(false)
  const [bodyH, setBodyH] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Reset state when a new question request arrives.
  const lastReq = useRef<QuestionItem[] | null>(null)
  useEffect(() => {
    const cur = pending?.questions ?? null
    if (cur !== lastReq.current) {
      lastReq.current = cur
      setTab(0)
      setAnswers((cur ?? []).map(() => ({ ...EMPTY })))
      setMinimized(false)
    }
  }, [pending])

  // Measure the body height so the collapse transition can animate
  // max-height smoothly (mirrors opencode's spring-driven height tween).
  useEffect(() => {
    if (!bodyRef.current || minimized) return
    const el = bodyRef.current
    const update = () => setBodyH(el.scrollHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [bodyRef, minimized, tab, questions, pending])

  if (!pending || total === 0) return null

  const answer = answers[tab] ?? EMPTY
  const isLast = tab >= total - 1
  const q = questions[tab]!
  const opts = q.options ?? []
  const multi = q.multiple === true

  const setAnswer = (patch: Partial<AnswerState>) => {
    setAnswers((prev) => {
      const synced = ensure(total, prev)
      return synced.map((a, i) => (i === tab ? { ...a, ...patch } : a))
    })
  }

  const pick = (label: string) => {
    setAnswers((prev) => {
      const synced = ensure(total, prev)
      if (multi) {
        return synced.map((a, i) =>
          i === tab
            ? {
                ...a,
                selected: a.selected.includes(label)
                  ? a.selected.filter((x) => x !== label)
                  : [...a.selected, label],
                customOn: false,
                editing: false,
              }
            : a,
        )
      }
      return synced.map((a, i) =>
        i === tab ? { ...a, selected: [label], customOn: false, editing: false } : a,
      )
    })
  }

  const commitCustom = () => {
    const val = answer.custom.trim()
    setAnswers((prev) => {
      const synced = ensure(total, prev)
      return synced.map((a, i) =>
        i === tab
          ? multi
            ? {
                ...a,
                selected: val ? Array.from(new Set([...a.selected, val])) : a.selected,
                customOn: true,
                editing: false,
              }
            : { ...a, selected: val ? [val] : [], customOn: true, editing: false }
          : a,
      )
    })
  }

  const next = () => {
    const wasEditing = answer.editing
    const customVal = answer.custom.trim()
    if (wasEditing) commitCustom()
    if (isLast) {
      const arr = ensure(total, answers).map((a, i) => {
        const qm = questions[i]?.multiple === true
        // If this tab was at that moment editing, compute the post-commit state
        if (i === tab && wasEditing) {
          if (!qm) return customVal ? [customVal] : [...a.selected]
          const set = [...a.selected]
          if (customVal && !set.includes(customVal)) set.push(customVal)
          return set
        }
        const cv = a.customOn ? a.custom.trim() : ''
        if (!qm) return cv ? [cv] : [...a.selected]
        const set = [...a.selected]
        if (cv && !set.includes(cv)) set.push(cv)
        return set
      })
      submitAnswers(arr)
      return
    }
    setTab((x) => x + 1)
    setAnswers((prev) => ensure(total, prev).map((a, i) => (i === tab ? { ...a, editing: false } : a)))
  }

  const back = () => {
    if (tab > 0) setTab((t) => t - 1)
  }

  const dismiss = () => {
    dismissQuestions()
  }

  const answered = (i: number) => {
    const a = answers[i]
    if (!a) return false
    return a.selected.length > 0 || (a.customOn && a.custom.trim().length > 0)
  }

  return (
    <div
      data-component="question-dock"
      data-minimized={minimized}
      className="w-full mx-auto rounded-t-(--composer-radius) rounded-b-none border border-border/60 border-b-0 bg-card shadow-lg overflow-hidden"
      style={{ maxWidth: 'calc(100% - var(--composer-radius) * 1.5)' }}
    >
      {/* Header (always visible) */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <HelpCircleIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground truncate">
            {total === 1
              ? t('question.singleTitle')
              : t('question.title', { current: tab + 1, total })}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {total > 1 && (
            <div className="flex items-center gap-1 mr-1">
              {questions.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTab(i)}
                  aria-label={`Question ${i + 1}`}
                  className={cn(
                    'w-4 h-1 rounded-full transition-colors',
                    i === tab
                      ? 'bg-primary'
                      : answered(i)
                        ? 'bg-primary/30'
                        : 'bg-border/60',
                  )}
                />
              ))}
            </div>
          )}
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
      </div>

      {/* Body + footer (animated collapse) */}
      <div
        ref={bodyRef}
        data-slot="question-collapser"
        style={{ maxHeight: minimized ? 0 : Math.max(bodyH, 220) }}
      >
        <div className="px-3 py-2 max-h-[40vh] overflow-y-auto">
          <div className="text-[15px] font-semibold text-foreground pb-2">{q.question}</div>
          <div className="flex flex-col gap-1">
            {opts.map((opt, oi) => (
              <OptionRow
                key={opt.label}
                label={opt.label}
                index={oi}
                picked={answer.selected.includes(opt.label)}
                multi={multi}
                onClick={() => pick(opt.label)}
              />
            ))}
            <CustomInput
              picked={answer.customOn}
              editing={answer.editing}
              value={answer.custom}
              letter={LETTERS[opts.length] ?? String(opts.length + 1)}
              onToggle={() =>
                answer.customOn
                  ? setAnswer({ customOn: false, custom: '', editing: false, selected: [] })
                  : setAnswer(multi
                    ? { customOn: true, editing: true }
                    : { customOn: true, editing: true, selected: [] })
              }
              onEdit={() => setAnswer(multi
                ? { editing: true, customOn: true }
                : { editing: true, customOn: true, selected: [] })}
              onChange={(v) => setAnswer({ custom: v })}
              onCommit={commitCustom}
              placeholder={t('question.typeOwnPlaceholder')}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40">
          <span className="text-[11px] text-muted-foreground/60">
            {multi ? t('question.chooseAny') : t('question.pickOne')}
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={dismiss}>
              {t('common.dismiss')}
            </Button>
            {tab > 0 && (
              <Button variant="ghost" size="sm" onClick={back}>
                <ArrowLeftIcon className="size-3.5" />
                {t('common.back')}
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {isLast ? t('common.submit') : t('common.next')}
              <ArrowRightIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}