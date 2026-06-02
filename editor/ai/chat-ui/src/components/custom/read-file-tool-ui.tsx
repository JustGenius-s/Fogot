/**
 * Custom Tool UI for read_file — compact inline display.
 *
 * Renders as "Read filename.ext L12-34" instead of the
 * generic collapsible tool-call card. Clicking the file
 * name opens it in the editor and selects the line range.
 */

import { makeAssistantToolUI } from '@assistant-ui/react'
import {
  LoaderIcon,
  FileIcon,
  FileTextIcon,
  FileCodeIcon,
  FileJsonIcon,
  ImageIcon,
  TerminalIcon,
  BracesIcon,
  CodeIcon,
} from 'lucide-react'
import { openFile } from '@/bridge'
import type { FC } from 'react'

const EXT_ICON_MAP: Record<string, FC<{ className?: string }>> = {
  gd: FileCodeIcon, gdshader: CodeIcon,
  tscn: BracesIcon, tres: BracesIcon,
  ts: FileCodeIcon, tsx: FileCodeIcon, js: FileCodeIcon, jsx: FileCodeIcon,
  py: FileCodeIcon, rs: FileCodeIcon, cpp: FileCodeIcon, c: FileCodeIcon,
  h: FileCodeIcon, hpp: FileCodeIcon, html: FileCodeIcon, css: FileCodeIcon,
  xml: FileCodeIcon,
  json: FileJsonIcon,
  yaml: FileTextIcon, yml: FileTextIcon, toml: FileTextIcon,
  cfg: FileTextIcon, md: FileTextIcon, txt: FileTextIcon,
  svg: ImageIcon, png: ImageIcon, jpg: ImageIcon, jpeg: ImageIcon,
  webp: ImageIcon, gif: ImageIcon, bmp: ImageIcon,
  sh: TerminalIcon, bat: TerminalIcon,
}

interface ReadFileArgs {
  path: string
  binary?: boolean
  start_line?: number
  end_line?: number
}

export const ReadFileToolUI = makeAssistantToolUI<
  ReadFileArgs,
  string
>({
  toolName: 'read_file',
  render: ({ args, status }) => {
    if (!args?.path) return null

    const isRunning = status?.type === 'running'
    const fileName = args.path.split('/').pop() ?? args.path
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    const Icon = EXT_ICON_MAP[ext] ?? FileIcon

    let lineLabel = ''
    if (args.start_line != null && args.end_line != null) {
      lineLabel = ` L${args.start_line}-${args.end_line}`
    } else if (args.start_line != null) {
      lineLabel = ` L${args.start_line}`
    }

    const handleClick = () => {
      openFile(args.path, args.start_line, args.end_line)
    }

    return (
      <div className="flex items-center gap-1.5 py-0.5 text-sm text-muted-foreground">
        {isRunning ? (
          <LoaderIcon className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <Icon className="size-3.5 shrink-0" />
        )}
        <span>Read</span>
        <button
          type="button"
          onClick={handleClick}
          className="cursor-pointer underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground hover:decoration-foreground/60 transition-colors"
        >
          {fileName}{lineLabel}
        </button>
      </div>
    )
  },
})
