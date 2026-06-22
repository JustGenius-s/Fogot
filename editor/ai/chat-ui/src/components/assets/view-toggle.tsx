import { type FC } from 'react'
import { ImagesIcon, MessageSquareIcon } from 'lucide-react'
import { useAppView, setAppView } from '@/bridge'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { useTranslation } from '@/lib/i18n'

/** Header icon button that toggles between the chat and asset views. */
export const ViewToggle: FC = () => {
  const { t } = useTranslation()
  const view = useAppView()
  const toAssets = view === 'chat'

  return (
    <TooltipIconButton
      tooltip={toAssets ? t('assets.title') : t('common.chat')}
      side="bottom"
      className="size-7"
      onClick={() => setAppView(toAssets ? 'assets' : 'chat')}
    >
      {toAssets ? (
        <ImagesIcon className="size-4" />
      ) : (
        <MessageSquareIcon className="size-4" />
      )}
    </TooltipIconButton>
  )
}
