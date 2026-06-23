/**
 * Diff change stats indicator.
 *
 * Two variants, both borrowed from opencode's `DiffChanges`:
 *  - `"text"` (default) — `+N` and `-M` rendered in mono font, colored
 *    green / red.
 *  - `"bars"` — a compact 18×14 SVG of 5 vertical bars whose colors encode
 *    the add/delete ratio (green / red / neutral). Useful in tight trigger
 *    rows where text would crowd the filename.
 */

import { type FC, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export interface DiffChangesProps {
  additions: number
  deletions: number
  variant?: 'text' | 'bars'
  className?: string
  style?: CSSProperties
}

const ADD_COLOR = 'var(--diff-add, oklch(0.65 0.15 145))'
const DEL_COLOR = 'var(--diff-del, oklch(0.62 0.18 25))'
const NEUTRAL_COLOR = 'var(--diff-neutral, oklch(0.45 0.01 250))'

function computeBars(adds: number, dels: number) {
  const TOTAL = 5
  if (adds === 0 && dels === 0) return { added: 0, deleted: 0, neutral: TOTAL }

  const total = adds + dels
  if (total < 5) {
    const added = adds > 0 ? 1 : 0
    const deleted = dels > 0 ? 1 : 0
    return { added, deleted, neutral: TOTAL - added - deleted }
  }

  const ratio = adds > dels ? adds / dels : dels / adds
  let blocks = TOTAL
  if (total < 20 || ratio < 4) blocks = TOTAL - 1

  const pctAdd = adds / total
  const pctDel = dels / total

  let added = adds > 0 ? Math.max(1, Math.round(pctAdd * blocks)) : 0
  let deleted = dels > 0 ? Math.max(1, Math.round(pctDel * blocks)) : 0

  if (adds > 0 && adds <= 5) added = Math.min(added, 1)
  if (adds > 5 && adds <= 10) added = Math.min(added, 2)
  if (dels > 0 && dels <= 5) deleted = Math.min(deleted, 1)
  if (dels > 5 && dels <= 10) deleted = Math.min(deleted, 2)

  if (added + deleted > blocks) {
    if (pctAdd > pctDel) added = blocks - deleted
    else deleted = blocks - added
  }
  return { added, deleted, neutral: Math.max(0, TOTAL - added - deleted) }
}

export const DiffChanges: FC<DiffChangesProps> = ({
  additions,
  deletions,
  variant = 'text',
  className,
  style,
}) => {
  const total = additions + deletions
  if (variant === 'text') {
    if (total === 0) return null
    return (
      <div
        data-component="diff-changes"
        data-variant="text"
        className={cn('flex items-center justify-end gap-2', className)}
        style={style}
      >
        <span
          data-slot="diff-changes-additions"
          className="font-mono text-sm tabular-nums text-[var(--diff-add,oklch(0.65_0.15_145))]"
        >
          +{additions}
        </span>
        <span
          data-slot="diff-changes-deletions"
          className="font-mono text-sm tabular-nums text-[var(--diff-del,oklch(0.62_0.18_25))]"
        >
          -{deletions}
        </span>
      </div>
    )
  }

  // bars variant
  const { added, deleted, neutral } = computeBars(additions, deletions)
  const blocks: string[] = [
    ...Array(added).fill(ADD_COLOR),
    ...Array(deleted).fill(DEL_COLOR),
    ...Array(neutral).fill(NEUTRAL_COLOR),
  ].slice(0, 5)

  return (
    <div
      data-component="diff-changes"
      data-variant="bars"
      className={cn('flex size-[18px_14px] shrink-0 items-center', className)}
      style={style}
      aria-label={`${additions} additions, ${deletions} deletions`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 14" fill="none" className="block size-full">
        {blocks.map((color, i) => (
          <rect key={i} x={i * 4} width="2" height="14" rx="1" fill={color} />
        ))}
      </svg>
    </div>
  )
}

export default DiffChanges