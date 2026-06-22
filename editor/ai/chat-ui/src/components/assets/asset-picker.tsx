import { useState, type FC } from 'react'
import { ImagesIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { AssetGallery } from '@/components/assets/asset-gallery'
import { readAssetDataUrl, type AssetEntry } from '@/lib/assets'
import { addAttachment } from '@/bridge'
import { useTranslation } from '@/lib/i18n'

/** Composer button that opens the asset library to attach an image to chat. */
export const AssetPicker: FC = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const handleSelect = async (asset: AssetEntry) => {
    try {
      const dataUrl = await readAssetDataUrl(asset.path)
      addAttachment(asset.path, dataUrl)
    } catch { /* ignore */ }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipIconButton
        tooltip={t('assets.chooseFromAssets')}
        side="top"
        variant="ghost"
        size="icon"
        className="size-8 rounded-full p-1 hover:bg-muted-foreground/15 dark:hover:bg-muted-foreground/30"
        onClick={() => setOpen(true)}
      >
        <ImagesIcon className="size-4" />
      </TooltipIconButton>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('assets.selectAsset')}</DialogTitle>
        </DialogHeader>
        <div className="@container max-h-[60vh] overflow-y-auto">
          <AssetGallery onSelect={handleSelect} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
