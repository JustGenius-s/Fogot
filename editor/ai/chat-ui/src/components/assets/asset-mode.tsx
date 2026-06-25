import { type FC } from 'react'
import { ArrowLeftIcon } from 'lucide-react'
import { setAppView } from '@/bridge'
import { ModelSettings } from '@/components/assistant-ui/model-settings'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { ViewToggle } from '@/components/assets/view-toggle'
import { AssetGallery } from '@/components/assets/asset-gallery'
import { useTranslation } from '@/lib/i18n'

/** Top-level asset view: browse and manage image assets. */
export const AssetMode: FC = () => {
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
        <span className="text-sm font-medium text-foreground">{t('assets.title')}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <ModelSettings />
          <ViewToggle />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <AssetGallery />
      </div>
    </div>
  )
}
