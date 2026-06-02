/**
 * Custom Tool UI for edit_file — renders an old→new diff directly
 * with a clickable file header (no collapsible tool-call wrapper).
 */

import { makeAssistantToolUI } from '@assistant-ui/react'
import { DiffViewer } from '@/components/assistant-ui/diff-viewer'
import { FileHeader } from '@/components/custom/file-header'
import { editFileLineCache } from '@/ai/tools'
import { openFile } from '@/bridge'

interface EditFileArgs {
  path: string
  old_string: string
  new_string: string
}

export const EditFileToolUI = makeAssistantToolUI<EditFileArgs, string>({
  toolName: 'edit_file',
  render: ({ args, status }) => {
    if (!args?.path) return null

    const isRunning = status?.type === 'running'
    const oldStr = args.old_string ?? ''
    const newStr = args.new_string ?? ''

    const startLine = editFileLineCache.get(args.path)
    const oldLineCount = oldStr.split('\n').length
    const lineRange = startLine != null
      ? `L${startLine}-${startLine + oldLineCount - 1}`
      : undefined

    return (
      <div className="overflow-hidden rounded-lg border">
        <FileHeader
          path={args.path}
          isRunning={isRunning}
          label="Edit"
          lineRange={lineRange}
          onFileClick={() => openFile(args.path, startLine)}
        />
        {(oldStr || newStr) && (
          <DiffViewer
            oldFile={{ content: oldStr }}
            newFile={{ content: newStr }}
            variant="ghost"
            size="sm"
            showLineNumbers={false}
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
