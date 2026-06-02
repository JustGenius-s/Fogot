/**
 * Shared header bar for file tool UIs.
 *
 * Shows: [FileIcon] [clickable filename] [optional line range] [optional stats]
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
  onFileClick?: () => void
  className?: string
}

export function FileHeader({
  path,
  isRunning,
  label,
  lineRange,
  additions,
  deletions,
  onFileClick,
  className,
}: FileHeaderProps) {
  const fileName = path.split('/').pop() ?? path
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const Icon = getFileIcon(ext)
  const hasStats = (additions != null && additions > 0) ||
    (deletions != null && deletions > 0)

  return (
    <div
      className={cn(
        'flex items-center gap-2 bg-muted/60 px-3 py-1.5 text-sm text-muted-foreground',
        className,
      )}
    >
      {isRunning ? (
        <LoaderIcon className="size-4 shrink-0 animate-spin" />
      ) : (
        <Icon className="size-4 shrink-0" />
      )}
      {label && <span className="shrink-0">{label}</span>}
      <button
        type="button"
        onClick={onFileClick}
        className="cursor-pointer truncate font-medium text-foreground/80 hover:text-foreground hover:underline underline-offset-2 transition-colors"
      >
        {fileName}
      </button>
      {lineRange && (
        <span className="shrink-0 text-xs">{lineRange}</span>
      )}
      {hasStats && (
        <span className="ml-auto flex gap-1.5 text-xs shrink-0">
          {additions != null && additions > 0 && (
            <span className="text-green-600 dark:text-green-400">
              +{additions}
            </span>
          )}
          {deletions != null && deletions > 0 && (
            <span className="text-red-600 dark:text-red-400">
              -{deletions}
            </span>
          )}
        </span>
      )}
    </div>
  )
}
