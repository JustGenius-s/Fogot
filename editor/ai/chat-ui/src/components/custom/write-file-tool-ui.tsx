/**
 * Custom Tool UI for write_file — renders a diff using @pierre/diffs
 * (Shiki syntax highlighting + bars indicators) with a collapsible file header.
 */

import { useState, useMemo } from 'react'
import { makeAssistantToolUI } from '@assistant-ui/react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { PierreDiff } from '@/components/ui/pierre-diff'
import { FileHeader } from '@/components/custom/file-header'
import { writeFileOldContentCache } from '@/ai/tools'
import { openFile } from '@/bridge'
import { FileTextIcon, LoaderIcon, ChevronRightIcon } from 'lucide-react'
import { diffLines } from 'diff'
import { cn } from '@/lib/utils'

interface WriteFileArgs {
  path: string
  content: string
  binary?: boolean
}

export const WriteFileToolUI = makeAssistantToolUI<WriteFileArgs, string>({
  toolName: 'write_file',
  render: ({ args, status }) => {
    const [open, setOpen] = useState(false)

    const isRunning = status?.type === 'running'

    const oldContent = writeFileOldContentCache.get(args?.path ?? '') ?? ''
    const newContent = args?.content ?? ''
    const hasChanges = oldContent !== newContent

    const stats = useMemo(() => {
      if (!hasChanges) return { additions: 0, deletions: 0 }
      const changes = diffLines(oldContent, newContent)
      let additions = 0
      let deletions = 0
      for (const c of changes) {
        if (c.added) additions += c.value.replace(/\n$/, '').split('\n').length
        if (c.removed) deletions += c.value.replace(/\n$/, '').split('\n').length
      }
      return { additions, deletions }
    }, [oldContent, newContent, hasChanges])

    if (!args?.path) return null

    if (args.binary) {
      return (
        <div className="flex items-center gap-1.5 py-0.5 text-sm text-muted-foreground">
          {isRunning ? (
            <LoaderIcon className="size-3.5 shrink-0 animate-spin" />
          ) : (
            <FileTextIcon className="size-3.5 shrink-0" />
          )}
          <span>Binary file:</span>
          <button
            type="button"
            onClick={() => openFile(args.path)}
            className="cursor-pointer underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground hover:decoration-foreground/60 transition-colors"
          >
            {args.path.split('/').pop() ?? args.path}
          </button>
        </div>
      )
    }

    const fileName = args.path.split('/').pop() ?? args.path
    const isNewFile = !oldContent

    if (!hasChanges && !isRunning) {
      return (
        <div className="flex items-center gap-1.5 py-0.5 text-sm text-muted-foreground">
          <FileTextIcon className="size-3.5 shrink-0" />
          <span>No changes to</span>
          <button
            type="button"
            onClick={() => openFile(args.path)}
            className="cursor-pointer underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground hover:decoration-foreground/60 transition-colors"
          >
            {fileName}
          </button>
        </div>
      )
    }

    return (
      <Collapsible
        open={open}
        onOpenChange={setOpen}
      >
        <CollapsibleTrigger
          disabled={isRunning || !hasChanges}
          className="group/trigger flex w-full items-center data-[disabled]:cursor-default"
        >
          <FileHeader
            path={args.path}
            isRunning={isRunning}
            label={isNewFile ? 'New' : 'Write'}
            additions={stats.additions}
            deletions={stats.deletions}
            onFileClick={() => openFile(args.path)}
          />
          {!isRunning && hasChanges && (
            <ChevronRightIcon
              className={cn(
                'mr-2 size-4 shrink-0 text-muted-foreground/50 transition-transform duration-200',
                'group-data-[state=open]/trigger:rotate-90',
              )}
            />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn(
            'overflow-hidden',
            'data-[state=closed]:animate-collapsible-up',
            'data-[state=open]:animate-collapsible-down',
            'data-[state=closed]:fill-mode-forwards',
          )}
        >
          {hasChanges && (
            <div className="pl-5">
              <PierreDiff
                path={args.path}
                oldContent={oldContent}
                newContent={newContent}
              />
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    )
  },
})