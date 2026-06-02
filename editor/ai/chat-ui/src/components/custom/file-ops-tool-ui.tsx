/**
 * Custom Tool UIs for file operation tools — compact inline display.
 *
 * Covers: read_file, list_files, delete_file, copy_file, move_file, search_files
 */

import type { FC } from 'react'
import { makeAssistantToolUI } from '@assistant-ui/react'
import {
  LoaderIcon,
  FileIcon,
  FileCodeIcon,
  FileJsonIcon,
  FileTextIcon,
  ImageIcon,
  TerminalIcon,
  BracesIcon,
  CodeIcon,
  FolderOpenIcon,
  Trash2Icon,
  CopyIcon,
  ArrowRightIcon,
  SearchIcon,
} from 'lucide-react'
import { openFile } from '@/bridge'

// ─── Shared helpers ───────────────────────────────────────────────

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

function getFileIcon(path: string): FC<{ className?: string }> {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICON_MAP[ext] ?? FileIcon
}

function InlineToolRow({
  icon: Icon,
  isRunning,
  label,
  children,
}: {
  icon: FC<{ className?: string }>
  isRunning?: boolean
  label: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-sm text-muted-foreground">
      {isRunning ? (
        <LoaderIcon className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <Icon className="size-3.5 shrink-0" />
      )}
      <span>{label}</span>
      {children}
    </div>
  )
}

function ClickablePath({
  path,
  startLine,
  suffix,
}: {
  path: string
  startLine?: number
  suffix?: string
}) {
  const name = path.split('/').pop() ?? path
  return (
    <button
      type="button"
      onClick={() => openFile(path, startLine)}
      className="cursor-pointer underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground hover:decoration-foreground/60 transition-colors truncate"
    >
      {name}{suffix}
    </button>
  )
}

// ─── read_file ────────────────────────────────────────────────────

export const ReadFileToolUI = makeAssistantToolUI<
  { path: string; binary?: boolean; start_line?: number; end_line?: number },
  string
>({
  toolName: 'read_file',
  render: ({ args, status }) => {
    if (!args?.path) return null
    const isRunning = status?.type === 'running'

    let lineLabel = ''
    if (args.start_line != null && args.end_line != null) {
      lineLabel = ` L${args.start_line}-${args.end_line}`
    } else if (args.start_line != null) {
      lineLabel = ` L${args.start_line}`
    }

    return (
      <InlineToolRow
        icon={getFileIcon(args.path)}
        isRunning={isRunning}
        label="Read"
      >
        <ClickablePath
          path={args.path}
          startLine={args.start_line}
          suffix={lineLabel}
        />
      </InlineToolRow>
    )
  },
})

// ─── list_files ───────────────────────────────────────────────────

export const ListFilesToolUI = makeAssistantToolUI<
  { path: string; recursive?: boolean },
  string
>({
  toolName: 'list_files',
  render: ({ args, status }) => {
    if (!args?.path) return null
    const isRunning = status?.type === 'running'
    const dirName = args.path.split('/').pop() || args.path
    return (
      <InlineToolRow
        icon={FolderOpenIcon}
        isRunning={isRunning}
        label="List"
      >
        <span className="truncate">{dirName}/</span>
        {args.recursive && (
          <span className="text-xs opacity-60">(recursive)</span>
        )}
      </InlineToolRow>
    )
  },
})

// ─── delete_file ──────────────────────────────────────────────────

export const DeleteFileToolUI = makeAssistantToolUI<
  { path: string },
  string
>({
  toolName: 'delete_file',
  render: ({ args, status }) => {
    if (!args?.path) return null
    const isRunning = status?.type === 'running'
    const fileName = args.path.split('/').pop() ?? args.path
    return (
      <InlineToolRow
        icon={Trash2Icon}
        isRunning={isRunning}
        label="Delete"
      >
        <span className="truncate">{fileName}</span>
      </InlineToolRow>
    )
  },
})

// ─── copy_file ────────────────────────────────────────────────────

export const CopyFileToolUI = makeAssistantToolUI<
  { source: string; destination: string },
  string
>({
  toolName: 'copy_file',
  render: ({ args, status }) => {
    if (!args?.source) return null
    const isRunning = status?.type === 'running'
    return (
      <InlineToolRow
        icon={CopyIcon}
        isRunning={isRunning}
        label="Copy"
      >
        <ClickablePath path={args.source} />
        <ArrowRightIcon className="size-3 shrink-0 opacity-50" />
        <ClickablePath path={args.destination} />
      </InlineToolRow>
    )
  },
})

// ─── move_file ────────────────────────────────────────────────────

export const MoveFileToolUI = makeAssistantToolUI<
  { source: string; destination: string },
  string
>({
  toolName: 'move_file',
  render: ({ args, status }) => {
    if (!args?.source) return null
    const isRunning = status?.type === 'running'
    return (
      <InlineToolRow
        icon={ArrowRightIcon}
        isRunning={isRunning}
        label="Move"
      >
        <ClickablePath path={args.source} />
        <ArrowRightIcon className="size-3 shrink-0 opacity-50" />
        <ClickablePath path={args.destination} />
      </InlineToolRow>
    )
  },
})

// ─── search_files ─────────────────────────────────────────────────

export const SearchFilesToolUI = makeAssistantToolUI<
  { query: string; path?: string; file_pattern?: string },
  string
>({
  toolName: 'search_files',
  render: ({ args, status }) => {
    if (!args?.query) return null
    const isRunning = status?.type === 'running'
    return (
      <InlineToolRow
        icon={SearchIcon}
        isRunning={isRunning}
        label="Search"
      >
        <span className="font-mono truncate">"{args.query}"</span>
        {args.path && (
          <span className="truncate opacity-70">
            in {args.path.split('/').pop() || args.path}/
          </span>
        )}
        {args.file_pattern && (
          <span className="text-xs opacity-60">
            ({args.file_pattern})
          </span>
        )}
      </InlineToolRow>
    )
  },
})
