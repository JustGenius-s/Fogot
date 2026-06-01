/**
 * localStorage-based adapter for assistant-ui's RemoteThreadListRuntime.
 * Stores thread metadata and message history entirely in the WebView.
 */

import type {
  RemoteThreadListAdapter,
  TextMessagePart,
  ThreadHistoryAdapter,
  ThreadMessage,
} from '@assistant-ui/react'

// ─── Storage Keys ─────────────────────────────────────────────────

const THREADS_KEY = 'fogot-threads'
const MESSAGES_PREFIX = 'fogot-msgs-'

// ─── Internal Types ───────────────────────────────────────────────

interface StoredThread {
  id: string
  title: string
  status: 'regular' | 'archived'
  createdAt: number
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

function saveThreads(threads: StoredThread[]) {
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

function deleteMessages(threadId: string) {
  localStorage.removeItem(MESSAGES_PREFIX + threadId)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ─── Thread List Adapter ──────────────────────────────────────────

export const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const threads = loadThreads()
    return {
      threads: threads
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

// ─── Thread History Adapter ───────────────────────────────────────

export function createHistoryAdapter(
  getRemoteId: () => string | undefined,
): ThreadHistoryAdapter {
  return {
    async load() {
      const remoteId = getRemoteId()
      if (!remoteId) return { messages: [] }
      const msgs = loadMessages(remoteId)
      return {
        messages: msgs.map((m) => ({
          message: m,
          parentId: null as string | null,
        })),
      }
    },
    async append({ message, parentId }) {
      void parentId
      const remoteId = getRemoteId()
      if (!remoteId) return
      const messages = loadMessages(remoteId)
      const existingIdx = messages.findIndex((m) => m.id === message.id)
      if (existingIdx >= 0) {
        messages[existingIdx] = message
      } else {
        messages.push(message)
      }
      saveMessages(remoteId, messages)
    },
  }
}
