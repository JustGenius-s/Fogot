import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useRunningThreadsStore } from "@/lib/running-threads";
import {
  AuiIf,
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArchiveIcon,
  MoreHorizontalIcon,
  TrashIcon,
} from "lucide-react";
import { type FC } from "react";

export const ThreadList: FC = () => {
  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col gap-1">
      <TrackRunningThreads />
      <AuiIf condition={(s) => s.threads.isLoading}>
        <ThreadListSkeleton />
      </AuiIf>
      <AuiIf condition={(s) => !s.threads.isLoading}>
        <ThreadListPrimitive.Items>
          {() => <ThreadListItem />}
        </ThreadListPrimitive.Items>
      </AuiIf>
    </ThreadListPrimitive.Root>
  );
};



const ThreadListSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading threads"
          className="aui-thread-list-skeleton-wrapper flex h-9 items-center px-3"
        >
          <Skeleton className="aui-thread-list-skeleton h-4 w-full" />
        </div>
      ))}
    </div>
  );
};

const ThreadListItem: FC = () => {
  return (
    <ThreadListItemPrimitive.Root className="aui-thread-list-item group flex h-9 items-center gap-2 rounded-lg transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none data-active:bg-muted">
      <ThreadListSpinner />
      <ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger flex h-full min-w-0 flex-1 items-center px-3 text-start text-sm">
        <span className="aui-thread-list-item-title min-w-0 flex-1 truncate">
          <ThreadListItemPrimitive.Title fallback="New Chat" />
        </span>
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemMore />
    </ThreadListItemPrimitive.Root>
  );
};

/**
 * Fogot-specific working indicator shown on a thread row while its assistant
 * run is actively streaming.
 *
 * - **Main thread**: checked directly via `s.threads.main?.isRunning`
 *   (available at the list level where `s.thread` isn't).
 * - **Background threads**: read from the zustand store, which is set by
 *   {@link TrackRunningThreads} on every main-thread state pulse and
 *   intentionally never cleared for non-main threads so the spinner
 *   survives a tab switch.
 */
const ThreadListSpinner: FC = () => {
  const threadId  = useAuiState((s) => s.threadListItem?.id ?? '')
  const mainId    = useAuiState((s) => s.threads.mainThreadId)
  const mainRunning = useAuiState((s) =>
    threadId === mainId && !!s.threads.main?.isRunning,
  )
  const storeRunning = useRunningThreadsStore((s) => !!s.running[threadId])

  if (!threadId) return null
  if (mainRunning) {
    return <SpinnerCell />
  }
  if (storeRunning && threadId !== mainId) {
    return <SpinnerCell />
  }
  return null
};

const SpinnerCell: FC = () => (
  <span
    data-slot="aui-thread-list-item-spinner"
    className="aui-thread-list-item-spinner ms-3 flex size-4 shrink-0 items-center justify-center text-primary"
  >
    <Spinner size={15} />
  </span>
)

/**
 * Keeps the per-thread `isRunning` zustand store in sync.
 *
 * The only reliable signal in the v0.14 public API is the main thread's
 * `s.threads.main?.isRunning` — that is what `useAuiState` subscribes to
 * here.  For non-main threads we intentionally **never** clear the flag so
 * that a row that was running before the user switched away retains its
 * spinner.  The flag is corrected the instant the user switches back to
 * that thread.
 */
const TrackRunningThreads: FC = () => {
  const set = useRunningThreadsStore((s) => s.set)
  useAuiState((s) => {
    set(s.threads.mainThreadId, !!s.threads.main?.isRunning)
  })
  return null
};

const ThreadListItemMore: FC = () => {
  return (
    <ThreadListItemMorePrimitive.Root>
      <ThreadListItemMorePrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="aui-thread-list-item-more me-2 size-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100 group-data-active:opacity-100"
        >
          <MoreHorizontalIcon className="size-4" />
          <span className="sr-only">More options</span>
        </Button>
      </ThreadListItemMorePrimitive.Trigger>
      <ThreadListItemMorePrimitive.Content
        side="bottom"
        align="start"
        className="aui-thread-list-item-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <ThreadListItemPrimitive.Archive asChild>
          <ThreadListItemMorePrimitive.Item className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
            <ArchiveIcon className="size-4" />
            Archive
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Archive>
        <ThreadListItemPrimitive.Delete asChild>
          <ThreadListItemMorePrimitive.Item className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-destructive text-sm outline-none hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive">
            <TrashIcon className="size-4" />
            Delete
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Delete>
      </ThreadListItemMorePrimitive.Content>
    </ThreadListItemMorePrimitive.Root>
  );
};
