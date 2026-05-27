/**
 * localStorage-based adapter for assistant-ui's RemoteThreadListRuntime.
 * Stores thread metadata and message history entirely in the WebView.
 */

import { type ReactNode, useMemo } from 'react'
import { RuntimeAdapterProvider, useAui, type RemoteThreadListAdapter } from '@assistant-ui/react'
import React from 'react'
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

function deleteMessages(threadId: string) {
  localStorage.removeItem(MESSAGES_PREFIX + threadId)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ─── Thread History Provider ──────────────────────────────────────

function ThreadHistoryProvider({ children }: { children?: ReactNode }) {
  const aui = useAui()
  const history = useMemo(
    () => ({
      async load() {
        const remoteId = aui.threadListItem().getState().remoteId
        if (!remoteId) return { messages: [] }
        const raw = localStorage.getItem(MESSAGES_PREFIX + remoteId)
        if (!raw) return { messages: [] }
        try {
          return JSON.parse(raw)
        } catch {
          return { messages: [] }
        }
      },
      async append(item: any) {
        const { remoteId } = await aui.threadListItem().initialize()
        const key = MESSAGES_PREFIX + remoteId
        const raw = localStorage.getItem(key)
        const repo = raw ? JSON.parse(raw) : { messages: [] }
        const idx = repo.messages.findIndex((m: any) => m.message.id === item.message.id)
        if (idx >= 0) repo.messages[idx] = item
        else repo.messages.push(item)
        repo.headId = item.message.id
        try {
          localStorage.setItem(key, JSON.stringify(repo))
        } catch {
          // localStorage quota exceeded
        }
      },
    }),
    [aui],
  )

  return (
    <RuntimeAdapterProvider adapters={{ history }}>
      {children}
    </RuntimeAdapterProvider>
  )
}

// ─── Thread List Adapter ──────────────────────────────────────────

export const threadListAdapter: RemoteThreadListAdapter = {
  unstable_Provider: ThreadHistoryProvider,

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

  async generateTitle() {
    // Overridden in App.tsx wrappedAdapter; this is a no-op fallback.
    return new ReadableStream()
  },
}
