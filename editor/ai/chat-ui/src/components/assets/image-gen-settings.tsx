import { type FC } from 'react'
import { RatioIcon, SparklesIcon, ImageIcon } from 'lucide-react'
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/assistant-ui/select'
import {
  useAgentId,
  useImageSize,
  setImageSize,
  useImageResolution,
  setImageResolution,
  useImageQuality,
  setImageQuality,
} from '@/bridge'

const AUTO = '__auto__'

const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: AUTO, label: 'Auto' },
  { value: '1:1', label: '1:1' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '2:1', label: '2:1' },
  { value: '1:2', label: '1:2' },
  { value: '5:4', label: '5:4' },
  { value: '4:5', label: '4:5' },
  { value: '3:1', label: '3:1' },
  { value: '1:3', label: '1:3' },
  { value: '21:9', label: '21:9' },
  { value: '9:21', label: '9:21' },
]

const RESOLUTION_OPTIONS: { value: string; label: string }[] = [
  { value: AUTO, label: 'Auto' },
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]

const QUALITY_OPTIONS: { value: string; label: string }[] = [
  { value: AUTO, label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

/**
 * Compact image generation settings bar shown above the composer input
 * when in image mode.  Covers size (ratio), resolution, and quality.
 */
export const ImageGenSettings: FC = () => {
  const agentId = useAgentId()
  const size = useImageSize()
  const resolution = useImageResolution()
  const quality = useImageQuality()

  if (agentId !== 'image') return null

  return (
    <div className="flex items-center gap-1.5 px-1 pb-1.5">
      {/* Size / Ratio */}
      <SelectRoot
        value={size || AUTO}
        onValueChange={(v) => setImageSize(v === AUTO ? '' : v)}
      >
        <SelectTrigger variant="ghost" size="sm" className="gap-1">
          <RatioIcon className="size-3.5 shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="top">
          {SIZE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>

      {/* Resolution */}
      <SelectRoot
        value={resolution || AUTO}
        onValueChange={(v) => setImageResolution(v === AUTO ? '' : v)}
      >
        <SelectTrigger variant="ghost" size="sm" className="gap-1">
          <ImageIcon className="size-3.5 shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="top">
          {RESOLUTION_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>

      {/* Quality */}
      <SelectRoot
        value={quality || AUTO}
        onValueChange={(v) => setImageQuality(v === AUTO ? '' : v)}
      >
        <SelectTrigger variant="ghost" size="sm" className="gap-1">
          <SparklesIcon className="size-3.5 shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="top">
          {QUALITY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    </div>
  )
}
