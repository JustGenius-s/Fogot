/**
 * Per-thread "isRunning" store.
 *
 * assistant-ui v0.14's `useAuiState((s) => s.thread.isRunning)` only reflects
 * the *active* thread.  When the user switches away while a run is in flight,
 * tthe old thread's runtime stays alive (RemoteThreadListHookInstanceManager
 * keeps one `ThreadRuntimeCore` per switched-to thread), but the store state
 * doesn't expose it.
 *
 * This zustand map bridges that gap.  A watcher in the thread-list tree polls
 * `ThreadListRuntime.getThreadRuntimeCore(id).isRunning` on every thread-list
 * state change and updates this store so every `ThreadListItem` row can show
 * its own spinner independently.
 */

import { create } from 'zustand'

type RunningState = Record<string, boolean>

interface RunningThreadsStore {
  running: RunningState
  set: (threadId: string, value: boolean) => void
  clear: (threadId: string) => void
}

export const useRunningThreadsStore = create<RunningThreadsStore>((set) => ({
  running: {},

  set(threadId, value) {
    set((s) => {
      if (s.running[threadId] === value) return s
      return { running: { ...s.running, [threadId]: value } }
    })
  },

  clear(threadId) {
    set((s) => {
      if (!(threadId in s.running)) return s
      const next = { ...s.running }
      delete next[threadId]
      return { running: next }
    })
  },
}))
