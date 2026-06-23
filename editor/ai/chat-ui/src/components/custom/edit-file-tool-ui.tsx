/**
 * Custom Tool UI for edit_file — renders an old→new diff using @pierre/diffs
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
import { editFileLineCache } from '@/ai/tools'
import { openFile } from '@/bridge'
import { diffLines } from 'diff'
import { ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditFileArgs {
  path: string
  old_string: string
  new_string: string
}

export const EditFileToolUI = makeAssistantToolUI<EditFileArgs, string>({
  toolName: 'edit_file',
  render: ({ args, status }) => {
    const [open, setOpen] = useState(true)

    const isRunning = status?.type === 'running'
    const oldStr = args?.old_string ?? ''
    const newStr = args?.new_string ?? ''

    const stats = useMemo(() => {
      const changes = diffLines(oldStr, newStr)
      let additions = 0
      let deletions = 0
      for (const c of changes) {
        if (c.added) additions += c.value.replace(/\n$/, '').split('\n').length
        if (c.removed) deletions += c.value.replace(/\n$/, '').split('\n').length
      }
      return { additions, deletions }
    }, [oldStr, newStr])

    if (!args?.path) return null

    const startLine = editFileLineCache.get(args.path)
    const oldLineCount = oldStr.split('\n').length
    const lineRange = startLine != null
      ? `L${startLine}-${startLine + oldLineCount - 1}`
      : undefined

    const hasDiff = !!(oldStr || newStr)

    return (
      <Collapsible
        open={open}
        onOpenChange={setOpen}
      >
        <CollapsibleTrigger
          disabled={isRunning || !hasDiff}
          className="group/trigger flex w-full items-center data-[disabled]:cursor-default"
        >
          <FileHeader
            path={args.path}
            isRunning={isRunning}
            label="Edit"
            lineRange={lineRange}
            additions={stats.additions}
            deletions={stats.deletions}
            onFileClick={() => openFile(args.path, startLine)}
          />
          {!isRunning && hasDiff && (
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
          {hasDiff && (
            <div className="pl-5">
              <PierreDiff
                path={args.path}
                oldContent={oldStr}
                newContent={newStr}
              />
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    )
  },
})