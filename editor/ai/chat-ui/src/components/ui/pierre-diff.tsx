/**
 * Wrapper around `@pierre/diffs` React bindings.
 *
 * Sets up CSS variables + theme + diff options so the Web Component renders
 * with opencode-identical styling: Shiki syntax highlighting, bars indicators,
 * line-info-basic hunk separators, 13px mono / 24px line-height.
 *
 * Diff-row backgrounds are tinted per line type (green for additions, red for
 * deletions) — pierre handles this natively; the `unsafeCSS` below mirrors
 * opencode's dark-mode overrides so the tints blend naturally with the fogot
 * theme rather than standing out with mismatched saturation.
 */

import { useMemo, type FC, type CSSProperties } from 'react'
import { FileDiff } from '@pierre/diffs/react'
import { parseDiffFromFile, type FileContents, type FileDiffMetadata, type FileDiffOptions } from '@pierre/diffs'

export interface PierreDiffProps {
  /** Full path — used for language detection (e.g. "res://scripts/player.gd" → GDScript). */
  path: string
  oldContent: string
  newContent: string
  className?: string
  style?: CSSProperties
}

// Mirrors opencode's dark-mode unsafeCSS overrides so diff-row backgrounds
// use the same visual weight as opencode desktop.
const UNSAFE_CSS = `
[data-diff] {
  --diffs-bg: transparent;
  --diffs-bg-deletion-override: color-mix(in oklch, transparent 70%, oklch(0.62 0.18 25));
  --diffs-bg-addition-override: color-mix(in oklch, transparent 70%, oklch(0.65 0.15 145));
}
[data-diff] [data-column-number] {
  background-color: var(--background-stronger, oklch(0.20 0.01 250));
}
`

const DEFAULT_OPTIONS: FileDiffOptions<undefined> = {
  theme: 'github-dark',
  themeType: 'dark',
  disableLineNumbers: false,
  overflow: 'scroll',
  diffStyle: 'unified',
  diffIndicators: 'bars',
  hunkSeparators: 'line-info-basic',
  lineDiffType: 'none',
  maxLineDiffLength: 1000,
  expansionLineCount: 20,
  disableFileHeader: true,
  unsafeCSS: UNSAFE_CSS,
} as FileDiffOptions<undefined>

const WRAPPER_STYLE = {
  '--diffs-font-family': 'ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", monospace',
  '--diffs-font-size': '13px',
  '--diffs-line-height': '24px',
  '--diffs-tab-size': '2',
  '--diffs-min-number-column-width': '4ch',
  '--diffs-gap-block': '0',
} as CSSProperties

export const PierreDiff: FC<PierreDiffProps> = ({
  path,
  oldContent,
  newContent,
  className,
  style,
}) => {
  const fileDiff = useMemo<FileDiffMetadata | null>(() => {
    if (!oldContent && !newContent) return null
    try {
      const oldFile: FileContents = {
        name: path,
        contents: oldContent,
        cacheKey: `old:${oldContent.length}`,
      }
      const newFile: FileContents = {
        name: path,
        contents: newContent,
        cacheKey: `new:${newContent.length}`,
      }
      return parseDiffFromFile(oldFile, newFile)
    } catch {
      return null
    }
  }, [path, oldContent, newContent])

  if (!fileDiff) return null

  return (
    <div style={{ ...WRAPPER_STYLE, ...style }} className={className}>
      <FileDiff
        fileDiff={fileDiff}
        options={DEFAULT_OPTIONS}
        disableWorkerPool
      />
    </div>
  )
}

export default PierreDiff