/**
 * Shared file header bar for file tool UIs (edit / write / apply_patch).
 *
 * Styled after opencode desktop's `edit-trigger` / `write-trigger` /
 * `apply-patch-trigger-content`:
 *   [status-icon] [Label] [filename] [directory rtl-ellipsis] — [DiffChanges bars]
 *
 * The directory part is rendered separately from the filename with
 * `direction: rtl` + ellipsis so long paths trim from the left, leaving
 * the leaf filename readable.
 */

import type { FC } from 'react'
import {
  LoaderIcon,
  FileIcon,
  FileTextIcon,
  FileCodeIcon,
  FileJsonIcon,
  ImageIcon,
  FileTypeIcon,
  TerminalIcon,
  BracesIcon,
  CodeIcon,
} from 'lucide-react'
import { DiffChanges } from '@/components/ui/diff-changes'
import { cn } from '@/lib/utils'

const EXT_ICON_MAP: Record<string, FC<{ className?: string }>> = {
  gd: FileCodeIcon,
  gdshader: CodeIcon,
  tscn: BracesIcon,
  tres: BracesIcon,
  ts: FileCodeIcon,
  tsx: FileCodeIcon,
  js: FileCodeIcon,
  jsx: FileCodeIcon,
  py: FileCodeIcon,
  rs: FileCodeIcon,
  cpp: FileCodeIcon,
  c: FileCodeIcon,
  h: FileCodeIcon,
  hpp: FileCodeIcon,
  json: FileJsonIcon,
  yaml: FileTextIcon,
  yml: FileTextIcon,
  toml: FileTextIcon,
  cfg: FileTextIcon,
  md: FileTextIcon,
  txt: FileTextIcon,
  html: FileCodeIcon,
  css: FileCodeIcon,
  xml: FileCodeIcon,
  svg: ImageIcon,
  png: ImageIcon,
  jpg: ImageIcon,
  jpeg: ImageIcon,
  webp: ImageIcon,
  gif: ImageIcon,
  bmp: ImageIcon,
  sh: TerminalIcon,
  bat: TerminalIcon,
  import: FileTypeIcon,
}

function getFileIcon(ext: string): FC<{ className?: string }> {
  return EXT_ICON_MAP[ext] ?? FileIcon
}

interface FileHeaderProps {
  path: string
  isRunning?: boolean
  label?: string
  lineRange?: string
  additions?: number
  deletions?: number
  /** Default `"bars"`. Pass `"text"` for the `+N -M` mono variant. */
  changesVariant?: 'text' | 'bars'
  onFileClick?: () => void
  className?: string
}

export function FileHeader({
  path,
  isRunning,
  label,
  lineRange,
  additions = 0,
  deletions = 0,
  changesVariant = 'text',
  onFileClick,
  className,
}: FileHeaderProps) {
  const fileName = path.split('/').pop() ?? path
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const Icon = getFileIcon(ext)
  const directory = path.includes('/')
    ? path.slice(0, path.length - fileName.length).replace(/\/$/, '')
    : ''
  const hasStats = additions > 0 || deletions > 0

  return (
    <div
      data-component="file-header"
      className={cn(
        'flex h-8 w-full items-center gap-2 px-1 text-sm',
        'min-w-0',
        className,
      )}
    >
      {/* status icon (spinner while running, file-type icon otherwise) */}
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        {isRunning ? (
          <LoaderIcon className="size-4 animate-spin" />
        ) : (
          <Icon className="size-4" />
        )}
      </span>

      {/* title row: label + filename + directory + line range */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {label && (
          <span
            data-slot="file-header-label"
            className="shrink-0 text-sm font-medium capitalize text-foreground"
          >
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onFileClick?.()
          }}
          className="flex min-w-0 shrink items-center gap-2 cursor-pointer text-sm transition-colors hover:text-foreground"
        >
          <span
            data-slot="file-header-filename"
            className="shrink-0 truncate font-normal text-foreground/90"
          >
            {fileName}
          </span>
          {directory && (
            <span
              data-slot="file-header-directory"
              className="min-w-0 flex-1 truncate text-muted-foreground/50"
              style={{ direction: 'rtl', textAlign: 'left' }}
              title={directory}
            >
              {directory}
            </span>
          )}
        </button>
        {lineRange && (
          <span
            data-slot="file-header-line-range"
            className="shrink-0 font-mono text-xs text-muted-foreground/50"
          >
            {lineRange}
          </span>
        )}
      </div>

      {/* right-aligned diff stats */}
      {hasStats && (
        <DiffChanges
          additions={additions}
          deletions={deletions}
          variant={changesVariant}
          className="shrink-0"
        />
      )}
    </div>
  )
}

export default FileHeader