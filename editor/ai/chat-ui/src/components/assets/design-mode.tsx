import { type FC } from 'react'
import { ArrowLeftIcon } from 'lucide-react'
import { setAppView } from '@/bridge'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { DesignGallery } from '@/components/assets/design-gallery'
import { useTranslation } from '@/lib/i18n'

/** Top-level design view: browse and manage design documents. */
export const DesignMode: FC = () => {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col bg-background @container">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 shrink-0">
        <TooltipIconButton
          tooltip={t('common.back')}
          side="bottom"
          className="size-7"
          onClick={() => setAppView('chat')}
        >
          <ArrowLeftIcon className="size-4" />
        </TooltipIconButton>
        <span className="text-sm font-medium text-foreground">{t('thread.designs')}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <DesignGallery />
      </div>
    </div>
  )
}
