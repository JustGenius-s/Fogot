import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useRunningThreadsStore } from "@/lib/running-threads";
import {
  getChildThreads,
  getSubAgentVersion,
  subscribeSubAgentChanges,
  type StoredThread,
} from "@/lib/thread-storage";
import { openSubAgentThread } from "@/bridge";
import {
  AuiIf,
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArchiveIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  TrashIcon,
} from "lucide-react";
import { type FC, useState, useMemo, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

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
  const threadId = useAuiState((s) => s.threadListItem?.remoteId ?? '')
  const [showChildren, setShowChildren] = useState(false)

  // Re-compute children when sub-agent threads are created/updated
  const subAgentVersion = useSyncExternalStore(
    subscribeSubAgentChanges,
    getSubAgentVersion,
  )

  const children = useMemo(() => {
    if (!threadId) return []
    return getChildThreads(threadId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, subAgentVersion])

  const hasChildren = children.length > 0

  return (
    <>
      <ThreadListItemPrimitive.Root className="aui-thread-list-item group flex h-9 items-center gap-2 rounded-lg transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none data-active:bg-muted">
        {hasChildren && (
          <button
            type="button"
            className="shrink-0 flex items-center justify-center size-5 rounded hover:bg-muted-foreground/10 ml-0.5"
            onClick={(e) => {
              e.stopPropagation()
              setShowChildren(!showChildren)
            }}
            aria-label={showChildren ? "Hide sub-agents" : "Show sub-agents"}
          >
            <ChevronRightIcon
              className={cn("size-3.5 text-muted-foreground/60 transition-transform", showChildren && "rotate-90")}
            />
          </button>
        )}
        <ThreadListSpinner />
        <ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger flex h-full min-w-0 flex-1 items-center px-2 text-start text-sm">
          <span className="aui-thread-list-item-title min-w-0 flex-1 truncate">
            <ThreadListItemPrimitive.Title fallback="New Chat" />
          </span>
        </ThreadListItemPrimitive.Trigger>
        <ThreadListItemMore />
      </ThreadListItemPrimitive.Root>

      {/* Child sub-agent threads indented under parent */}
      {showChildren && children.map((child) => (
        <ChildThreadRow key={child.id} child={child} />
      ))}
    </>
  );
};

function ChildThreadRow({ child }: { child: StoredThread }) {
  const dotColor =
    child.agentType === 'coder'
      ? 'oklch(0.78 0.15 50)'
      : child.agentType === 'explore'
        ? 'oklch(0.78 0.13 200)'
        : 'var(--primary)'

  return (
    <div
      className="group flex h-9 items-center gap-2 rounded-lg transition-colors hover:bg-muted cursor-pointer pl-5"
      onClick={() => openSubAgentThread(child.id)}
    >
      <span className="w-5 shrink-0" />
      <span className="shrink-0 flex size-4 items-center justify-center ml-0.5">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: dotColor }}
          aria-hidden
        />
      </span>
      <span className="flex h-full min-w-0 flex-1 items-center px-2 text-start text-sm">
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {child.title || 'Sub-Agent'}
        </span>
      </span>
    </div>
  )
}

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
