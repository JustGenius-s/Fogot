import { type FC } from 'react'
import { ImagesIcon, MessageSquareIcon } from 'lucide-react'
import { useAppView, setAppView } from '@/bridge'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'

/** Header icon button that toggles between the chat and asset views. */
export const ViewToggle: FC = () => {
  const view = useAppView()
  const toAssets = view === 'chat'

  return (
    <TooltipIconButton
      tooltip={toAssets ? 'Assets' : 'Chat'}
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
