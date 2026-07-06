import { useState, type FC } from 'react'
import { ArrowLeftIcon, LayoutGridIcon, BookHeartIcon } from 'lucide-react'
import { setAppView } from '@/bridge'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { DesignGallery } from '@/components/assets/design-gallery'
import { BibleView } from '@/components/assets/bible-view'
import { useTranslation, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type Tab = 'gallery' | 'bible'

interface TabDef {
  id: Tab
  icon: typeof LayoutGridIcon
  labelKey: MessageKey
}

const TABS: TabDef[] = [
  { id: 'gallery', icon: LayoutGridIcon, labelKey: 'design.tabGallery' },
  { id: 'bible', icon: BookHeartIcon, labelKey: 'design.tabBible' },
]

/**
 * Top-level design view: a tabbed container for Gallery and Bible.
 *
 * - Gallery: browse / edit existing design documents.
 * - Bible:   read / edit the project's `res://.design/_template.md` contract.
 *
 * The active tab is local state; the back button always returns to chat.
 */
export const DesignMode: FC = () => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('gallery')

  return (
    <div className="flex h-full flex-col bg-background @container">
      {/* Header: back + title + tab switcher */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
        <TooltipIconButton
          tooltip={t('common.back')}
          side="bottom"
          className="size-7"
          onClick={() => setAppView('chat')}
        >
          <ArrowLeftIcon className="size-4" />
        </TooltipIconButton>
        <span className="text-sm font-medium text-foreground">{t('thread.designs')}</span>
        <div className="ml-2 flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
          {TABS.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              title={t(labelKey)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                tab === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              <span className="hidden @sm:inline">{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'gallery' && <DesignGallery />}
        {tab === 'bible' && <BibleView onChanged={() => {}} />}
      </div>
    </div>
  )
}
