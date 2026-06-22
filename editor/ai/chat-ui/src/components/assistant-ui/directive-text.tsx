/**
 * Renders `:type[label]{name=id}` directive syntax as inline chips.
 * Used with `ComposerPrimitive.Unstable_TriggerPopover.Directive`.
 *
 * Reads text from the assistant-ui part context (via useAuiState), matching
 * how the default Text component works.
 */

import { Fragment, type FC } from 'react'
import { useAuiState } from '@assistant-ui/react'
import type { TextMessagePartComponent, Unstable_DirectiveFormatter } from '@assistant-ui/react'
import { unstable_defaultDirectiveFormatter } from '@assistant-ui/react'
import { cn } from '@/lib/utils'
import { SparklesIcon, GitBranchIcon, BoxIcon, FileCodeIcon, FolderIcon, PencilRulerIcon } from 'lucide-react'

// ─── Per-type styling ─────────────────────────────────────────────

const TYPE_STYLES: Record<string, string> = {
  node: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  scene: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  script: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  folder: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  design: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
}

const DEFAULT_CHIP_CLS = 'bg-primary/10 text-primary'

const TYPE_ICONS: Record<string, FC<{ className?: string }>> = {
  node: GitBranchIcon,
  scene: BoxIcon,
  script: FileCodeIcon,
  folder: FolderIcon,
  design: PencilRulerIcon,
}

// ─── Chip ─────────────────────────────────────────────────────────

const baseCls = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium align-middle select-none'

const DirectiveChip: FC<{
  icon?: FC<{ className?: string }>
  label: string
  type?: string
  title?: string
}> = ({ icon: Icon, label, type, title }) => {
  const colorCls = (type && TYPE_STYLES[type]) || DEFAULT_CHIP_CLS
  return (
    <span className={cn(baseCls, colorCls)} title={title}>
      {Icon && <Icon className="size-3 shrink-0" />}
      {label}
    </span>
  )
}

// ─── Factory ──────────────────────────────────────────────────────

export type CreateDirectiveTextOptions = {
  iconMap?: Record<string, FC<{ className?: string }>>
  fallbackIcon?: FC<{ className?: string }>
}

export function createDirectiveText(
  formatter: Unstable_DirectiveFormatter,
  options?: CreateDirectiveTextOptions,
): TextMessagePartComponent {
  const iconMap = options?.iconMap
  const fallbackIcon = options?.fallbackIcon

  const Component: TextMessagePartComponent = () => {
    // Read text from context — same as the default Text component
    const text = useAuiState((s) => {
      if (s.part.type !== 'text') return ''
      return s.part.text
    })

    const segments = formatter.parse(text)

    if (segments.length === 1 && segments[0]!.kind === 'text') {
      return <>{text}</>
    }

    return (
      <>
        {segments.map((seg, i) => {
          if (seg.kind === 'text') {
            return <Fragment key={i}>{seg.text}</Fragment>
          }

          const Icon = iconMap?.[seg.type] ?? TYPE_ICONS[seg.type] ?? fallbackIcon ?? SparklesIcon
          const tooltip = seg.id !== seg.label ? seg.id : undefined
          return <DirectiveChip key={i} icon={Icon} label={seg.label} type={seg.type} title={tooltip} />
        })}
      </>
    )
  }
  Component.displayName = 'DirectiveText'
  return Component
}

// ─── Default Export ───────────────────────────────────────────────

export const DirectiveText: TextMessagePartComponent = createDirectiveText(
  unstable_defaultDirectiveFormatter,
)
