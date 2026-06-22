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
import { useTranslation } from '@/lib/i18n'

const AUTO = '__auto__'

const RATIO_VALUES = [
  '1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '2:1',
  '1:2', '5:4', '4:5', '3:1', '1:3', '21:9', '9:21',
]

/**
 * Compact image generation settings bar shown above the composer input
 * when in image mode.  Covers size (ratio), resolution, and quality.
 */
export const ImageGenSettings: FC = () => {
  const { t } = useTranslation()
  const agentId = useAgentId()
  const size = useImageSize()
  const resolution = useImageResolution()
  const quality = useImageQuality()

  const SIZE_OPTIONS = [
    { value: AUTO, label: t('img.auto') },
    ...RATIO_VALUES.map((v) => ({ value: v, label: v })),
  ]
  const RESOLUTION_OPTIONS = [
    { value: AUTO, label: t('img.auto') },
    { value: '1k', label: '1K' },
    { value: '2k', label: '2K' },
    { value: '4k', label: '4K' },
  ]
  const QUALITY_OPTIONS = [
    { value: AUTO, label: t('img.auto') },
    { value: 'low', label: t('img.low') },
    { value: 'medium', label: t('img.medium') },
    { value: 'high', label: t('img.high') },
  ]

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
