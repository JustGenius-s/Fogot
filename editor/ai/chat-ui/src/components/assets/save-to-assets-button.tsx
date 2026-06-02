import { useState, type FC } from 'react'
import { SaveIcon, CheckIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveGeneratedImage } from '@/lib/assets'

interface SaveToAssetsButtonProps {
  dataUrl: string
  mimeType?: string
}

/** Saves a generated (in-chat) image into the asset library on demand. */
export const SaveToAssetsButton: FC<SaveToAssetsButtonProps> = ({ dataUrl, mimeType }) => {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [path, setPath] = useState('')

  const handleSave = async () => {
    setState('saving')
    try {
      const saved = await saveGeneratedImage(dataUrl, mimeType)
      setPath(saved)
      setState('saved')
    } catch {
      setState('error')
    }
  }

  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
        <CheckIcon className="size-3.5 text-green-600" />
        Saved to {path}
      </span>
    )
  }

  return (
    <Button
      variant="ghost"
      size="xs"
      className="text-muted-foreground"
      disabled={state === 'saving'}
      onClick={handleSave}
    >
      {state === 'saving' ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <SaveIcon className="size-3.5" />
      )}
      {state === 'error' ? 'Save failed, retry' : 'Save to assets'}
    </Button>
  )
}
