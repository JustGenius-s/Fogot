import { type FC } from 'react'
import { ModelSettings } from '@/components/assistant-ui/model-settings'
import { ViewToggle } from '@/components/assets/view-toggle'
import { AssetGallery } from '@/components/assets/asset-gallery'

/** Top-level asset view: browse and manage image assets. */
export const AssetMode: FC = () => {
  return (
    <div className="flex h-full flex-col bg-background @container">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 shrink-0">
        <span className="text-sm font-medium text-foreground">Assets</span>
        <div className="flex items-center gap-0.5">
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
