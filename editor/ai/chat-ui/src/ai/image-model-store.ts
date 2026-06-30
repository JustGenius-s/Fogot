/**
 * Deferral store for image model selection — bridges the generate_image
 * tool execute function with the React selection card UI.
 *
 * Mirrors the question-store pattern: execute enqueues a pending request
 * and awaits the promise; the tool UI renders the card during "running"
 * status and resolves the promise via {@link submitImageModelSelection}.
 */

import type { ModelConfig } from '@/bridge'

export interface ImageModelSelection {
  modelId: string
  /** true = "Always" (persist as default), false = "Once" (one-time use) */
  persist: boolean
}

interface PendingEntry {
  resolve: (selection: ImageModelSelection) => void
  reject: (error: Error) => void
  models: ModelConfig[]
}

let pending: PendingEntry | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((fn) => fn())
}

/** Request the user to pick an image model. Returns the chosen model + persist flag. */
export function enqueueImageModelSelection(models: ModelConfig[]): Promise<ImageModelSelection> {
  return new Promise((resolve, reject) => {
    pending = { resolve, reject, models }
    emit()
  })
}

export function getPendingImageModelSelection(): PendingEntry | null {
  return pending
}

export function subscribeImageModelSelection(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function submitImageModelSelection(selection: ImageModelSelection): void {
  const entry = pending
  pending = null
  if (entry) {
    entry.resolve(selection)
    emit()
  }
}

export function dismissImageModelSelection(): void {
  const entry = pending
  pending = null
  if (entry) {
    entry.reject(new Error('User dismissed the image model selection'))
    emit()
  }
}
