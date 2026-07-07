/**
 * localStorage-based adapter for assistant-ui's RemoteThreadListRuntime.
 * Stores thread metadata and message history entirely in the WebView.
 */

import type {
  RemoteThreadListAdapter,
  TextMessagePart,
  ThreadMessage,
} from '@assistant-ui/react'

// ─── Storage Keys ─────────────────────────────────────────────────

const THREADS_KEY = 'fogot-threads'
const MESSAGES_PREFIX = 'fogot-msgs-'
const SUBAGENT_PREFIX = 'fogot-subagent-'

// ─── Internal Types ───────────────────────────────────────────────

export interface StoredThread {
  id: string
  title: string
  status: 'regular' | 'archived'
  createdAt: number
  /** Parent thread ID — set for sub-agent child threads. */
  parentID?: string
  /** Agent type for sub-agent threads (explore, coder, etc.). */
  agentType?: string
}

export interface StoredSubAgentData {
  agentType: string
  task: string
  parts: unknown[]
}

// ─── Helpers ──────────────────────────────────────────────────────

function loadThreads(): StoredThread[] {
  try {
    const raw = localStorage.getItem(THREADS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveThreads(threads: StoredThread[]) {
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads))
}

function loadMessages(threadId: string): ThreadMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_PREFIX + threadId)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveMessages(threadId: string, messages: ThreadMessage[]) {
  localStorage.setItem(MESSAGES_PREFIX + threadId, JSON.stringify(messages))
}

export function deleteMessages(threadId: string) {
  localStorage.removeItem(MESSAGES_PREFIX + threadId)
  localStorage.removeItem(SUBAGENT_PREFIX + threadId)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ─── Sub-agent thread helpers ─────────────────────────────────────

const subAgentListeners = new Set<() => void>()
let _subAgentVersion = 0

/** In-memory cache of sub-agent parts data — avoids localStorage quota. */
const subAgentDataCache = new Map<string, StoredSubAgentData>()

function notifySubAgentChange() {
  _subAgentVersion++
  subAgentListeners.forEach((fn) => fn())
}

export function getSubAgentVersion(): number {
  return _subAgentVersion
}

export function subscribeSubAgentChanges(listener: () => void): () => void {
  subAgentListeners.add(listener)
  return () => subAgentListeners.delete(listener)
}

export function createSubAgentThread(
  parentID: string,
  agentType: string,
  task: string,
  parts: unknown[],
): string {
  const id = 'sa-' + generateId()
  const threads = loadThreads()
  threads.push({
    id,
    title: task.slice(0, 50) + (task.length > 50 ? '...' : ''),
    status: 'regular',
    createdAt: Date.now(),
    parentID,
    agentType,
  })
  saveThreads(threads)

  // Parts stored in memory (not localStorage) to avoid quota limits
  subAgentDataCache.set(id, { agentType, task, parts })

  notifySubAgentChange()
  return id
}

export function updateSubAgentParts(threadId: string, parts: unknown[]) {
  const existing = subAgentDataCache.get(threadId)
  if (!existing) return
  existing.parts = parts
  notifySubAgentChange()
}

export function getSubAgentData(threadId: string): StoredSubAgentData | null {
  return subAgentDataCache.get(threadId) ?? null
}

export function isSubAgentThread(threadId: string): boolean {
  return threadId.startsWith('sa-')
}

export function getChildThreads(parentID: string): StoredThread[] {
  return loadThreads()
    .filter((t) => t.parentID === parentID)
    .sort((a, b) => b.createdAt - a.createdAt)
}

// ─── Thread List Adapter ──────────────────────────────────────────

export const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const threads = loadThreads()
    return {
      threads: threads
        .filter((t) => !isSubAgentThread(t.id))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((t) => ({
          remoteId: t.id,
          status: t.status,
          title: t.title || undefined,
        })),
    }
  },

  async initialize(localId: string) {
    const threads = loadThreads()
    const existing = threads.find((t) => t.id === localId)
    if (existing) return { remoteId: existing.id, externalId: undefined }

    const id = generateId()
    threads.push({ id, title: '', status: 'regular', createdAt: Date.now() })
    saveThreads(threads)
    return { remoteId: id, externalId: undefined }
  },

  async rename(remoteId: string, newTitle: string) {
    const threads = loadThreads()
    const t = threads.find((x) => x.id === remoteId)
    if (t) {
      t.title = newTitle
      saveThreads(threads)
    }
  },

  async archive(remoteId: string) {
    const threads = loadThreads()
    const t = threads.find((x) => x.id === remoteId)
    if (t) {
      t.status = 'archived'
      saveThreads(threads)
    }
  },

  async unarchive(remoteId: string) {
    const threads = loadThreads()
    const t = threads.find((x) => x.id === remoteId)
    if (t) {
      t.status = 'regular'
      saveThreads(threads)
    }
  },

  async delete(remoteId: string) {
    const threads = loadThreads().filter((x) => x.id !== remoteId)
    saveThreads(threads)
    deleteMessages(remoteId)
  },

  async fetch(threadId: string) {
    const threads = loadThreads()
    const t = threads.find((x) => x.id === threadId)
    if (!t) throw new Error(`Thread ${threadId} not found`)
    return {
      remoteId: t.id,
      status: t.status,
      title: t.title || undefined,
    }
  },

  async generateTitle(_remoteId, messages) {
    const firstUser = messages.find((m) => m.role === 'user')
    if (!firstUser) return new Response('New Chat').body! as never

    const textParts = firstUser.content.filter((p: { type: string }) => p.type === 'text')
    const text = textParts.map((p: unknown) => (p as TextMessagePart).text ?? '').join(' ')
    const title = text.slice(0, 40) + (text.length > 40 ? '...' : '')

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(title))
        controller.close()
      },
    })
    return stream as never
  },
}
