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
import { SparklesIcon } from 'lucide-react'

// ─── Chip ─────────────────────────────────────────────────────────

const chipCls = cn(
  'inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5',
  'text-xs font-medium text-primary align-middle select-none',
)

const DirectiveChip: FC<{
  icon?: FC<{ className?: string }>
  label: string
}> = ({ icon: Icon, label }) => (
  <span className={chipCls}>
    {Icon && <Icon className="size-3 shrink-0" />}
    {label}
  </span>
)

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

          const Icon = iconMap?.[seg.type] ?? fallbackIcon ?? SparklesIcon
          return <DirectiveChip key={i} icon={Icon} label={seg.label} />
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
