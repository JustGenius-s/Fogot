import { type FC } from 'react'
import { RatioIcon } from 'lucide-react'
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/assistant-ui/select'
import { useAgentId, useImageSize, setImageSize } from '@/bridge'

/** Sentinel value for "use the API default size" (empty string). */
const AUTO = '__auto__'

const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: AUTO, label: 'Default' },
  { value: '1024x1024', label: '1024×1024' },
  { value: '1536x1536', label: '1536×1536' },
  { value: '2048x2048', label: '2048×2048' },
  { value: '2048x1152', label: '2048×1152 (16:9)' },
  { value: '1152x2048', label: '1152×2048 (9:16)' },
]

/** Composer control to pick the image size per generation. Only in image mode. */
export const ImageSizeSelector: FC = () => {
  const agentId = useAgentId()
  const size = useImageSize()

  if (agentId !== 'image') return null

  return (
    <SelectRoot
      value={size || AUTO}
      onValueChange={(v) => setImageSize(v === AUTO ? '' : v)}
    >
      <SelectTrigger variant="ghost" size="sm" className="gap-1">
        <RatioIcon className="size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SIZE_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  )
}
