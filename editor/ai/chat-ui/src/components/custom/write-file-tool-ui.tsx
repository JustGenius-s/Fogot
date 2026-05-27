/**
 * Custom Tool UI for write_file — renders a DiffViewer showing changes.
 */

import { makeAssistantToolUI } from '@assistant-ui/react'
import { DiffViewer } from '@/components/assistant-ui/diff-viewer'
import {
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackError,
} from '@/components/assistant-ui/tool-fallback'
import { writeFileOldContentCache } from '@/ai/tools'
import { cn } from '@/lib/utils'

interface WriteFileArgs {
  path: string
  content: string
  binary?: boolean
}

export const WriteFileToolUI = makeAssistantToolUI<WriteFileArgs, string>({
  toolName: 'write_file',
  render: ({ args, result, status }) => {
    const isCancelled =
      status?.type === 'incomplete' && status.reason === 'cancelled'

    if (args?.binary) {
      return (
        <ToolFallbackRoot
          className={cn(isCancelled && 'border-muted-foreground/30 bg-muted/30')}
        >
          <ToolFallbackTrigger toolName="write_file" status={status} />
          <ToolFallbackContent>
            <ToolFallbackError status={status} />
            <div className="px-4 text-sm text-muted-foreground">
              Binary file: {args.path}
            </div>
          </ToolFallbackContent>
        </ToolFallbackRoot>
      )
    }

    const oldContent = writeFileOldContentCache.get(args?.path ?? '') ?? ''
    const newContent = args?.content ?? ''
    const fileName = args?.path?.split('/').pop() ?? args?.path ?? ''
    const hasChanges = oldContent !== newContent

    return (
      <ToolFallbackRoot
        className={cn(isCancelled && 'border-muted-foreground/30 bg-muted/30')}
        defaultOpen={!!result && hasChanges}
      >
        <ToolFallbackTrigger toolName="write_file" status={status} />
        <ToolFallbackContent>
          <ToolFallbackError status={status} />
          {hasChanges ? (
            <div className="px-4">
              <DiffViewer
                oldFile={{ content: oldContent, name: fileName }}
                newFile={{ content: newContent, name: fileName }}
                size="sm"
                showLineNumbers
                showStats
                contextLines={2}
                maxCollapsedLines={5}
              />
            </div>
          ) : (
            <div className="px-4 text-sm text-muted-foreground">
              {oldContent
                ? `No changes to ${args?.path}`
                : `Created new file: ${args?.path}`}
            </div>
          )}
        </ToolFallbackContent>
      </ToolFallbackRoot>
    )
  },
})
