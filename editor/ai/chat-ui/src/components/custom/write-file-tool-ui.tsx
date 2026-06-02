/**
 * Custom Tool UI for write_file — renders a DiffViewer directly
 * with a clickable file header (no collapsible tool-call wrapper).
 */

import { makeAssistantToolUI } from '@assistant-ui/react'
import { DiffViewer } from '@/components/assistant-ui/diff-viewer'
import { FileHeader } from '@/components/custom/file-header'
import { writeFileOldContentCache } from '@/ai/tools'
import { openFile } from '@/bridge'
import { FileTextIcon, LoaderIcon } from 'lucide-react'

interface WriteFileArgs {
  path: string
  content: string
  binary?: boolean
}

export const WriteFileToolUI = makeAssistantToolUI<WriteFileArgs, string>({
  toolName: 'write_file',
  render: ({ args, status }) => {
    if (!args?.path) return null

    const isRunning = status?.type === 'running'

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

    const oldContent = writeFileOldContentCache.get(args.path) ?? ''
    const newContent = args.content ?? ''
    const fileName = args.path.split('/').pop() ?? args.path
    const isNewFile = !oldContent
    const hasChanges = oldContent !== newContent

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
      <div className="overflow-hidden rounded-lg border">
        <FileHeader
          path={args.path}
          isRunning={isRunning}
          label={isNewFile ? 'New' : 'Write'}
          onFileClick={() => openFile(args.path)}
        />
        {hasChanges && (
          <DiffViewer
            oldFile={{ content: oldContent }}
            newFile={{ content: newContent }}
            variant="ghost"
            size="sm"
            showLineNumbers
            showIcon={false}
            showStats={false}
            contextLines={2}
            maxCollapsedLines={8}
            className="rounded-none"
          />
        )}
      </div>
    )
  },
})
