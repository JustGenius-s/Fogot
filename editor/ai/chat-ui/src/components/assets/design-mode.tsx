import { type FC } from 'react'
import { MessageSquareIcon } from 'lucide-react'
import { setAppView } from '@/bridge'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { DesignGallery } from '@/components/assets/design-gallery'

/** Top-level design view: browse and manage design documents. */
export const DesignMode: FC = () => {
  return (
    <div className="flex h-full flex-col bg-background @container">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 shrink-0">
        <span className="text-sm font-medium text-foreground">Designs</span>
        <TooltipIconButton
          tooltip="Chat"
          side="bottom"
          className="size-7"
          onClick={() => setAppView('chat')}
        >
          <MessageSquareIcon className="size-4" />
        </TooltipIconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <DesignGallery />
      </div>
    </div>
  )
}
