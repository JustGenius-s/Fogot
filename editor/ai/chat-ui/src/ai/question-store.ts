/**
 * Deferral store for question (ask_user) tool — bridges the AI tool
 * execute function with the React UI.
 */

export interface QuestionOption {
  label: string
  description: string
}

export interface QuestionItem {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
}

interface PendingEntry {
  resolve: (answers: string[][]) => void
  reject: (error: Error) => void
  questions: QuestionItem[]
}

let pending: PendingEntry | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((fn) => fn())
}

/** Ask questions and wait for user answers. Returns answers per question. */
export function enqueueQuestions(questions: QuestionItem[]): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    pending = { resolve, reject, questions }
    emit()
  })
}

export function getPending(): PendingEntry | null {
  return pending
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function submitAnswers(answers: string[][]): void {
  const entry = pending
  pending = null
  if (entry) {
    entry.resolve(answers)
    emit()
  }
}

export function dismissQuestions(): void {
  const entry = pending
  pending = null
  if (entry) {
    entry.reject(new Error('User dismissed the questions'))
    emit()
  }
}
