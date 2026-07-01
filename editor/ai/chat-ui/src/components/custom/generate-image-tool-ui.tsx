/**
 * Generate Image Tool UI — inline display for generate_image calls.
 *
 * Three states:
 *  1. Running + pending model selection → renders the model picker card
 *     (user selects a model + "Always"/"Once"). Mirrors the ask_user pattern.
 *  2. Running + generating → compact progress indicator.
 *  3. Complete → collapsible summary with output path or error.
 */

import { useState, useSyncExternalStore, type FC, type ReactNode } from 'react'
import { makeAssistantToolUI } from '@assistant-ui/react'
import { ImageIcon, CheckIcon, LoaderIcon, ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ProviderLogo } from '@/components/assistant-ui/provider-logo'
import { cn } from '@/lib/utils'
import { useTranslation, type MessageKey } from '@/lib/i18n'
import {
  getImageResolution,
  getImageQuality,
  getImageBackground,
} from '@/bridge'
import {
  getPendingImageModelSelection,
  subscribeImageModelSelection,
  submitImageModelSelection,
  dismissImageModelSelection,
} from '@/ai/image-model-store'
import type { ModelConfig } from '@/bridge'

interface GenerateImageArgs {
  prompt?: string
  output?: string
  size?: string
  resolution?: string
  quality?: string
  background?: string
}

interface GenerateImageResult {
  success?: boolean
  path?: string
  revised_prompt?: string
  error?: string
  size?: string
  resolution?: string
  quality?: string
  background?: string
}

interface ImageGenSettings {
  resolution?: string
  quality?: string
  background?: string
}

function parseResult(result: unknown): GenerateImageResult | null {
  if (typeof result !== 'string') return (result as GenerateImageResult) ?? null
  try {
    return JSON.parse(result) as GenerateImageResult
  } catch {
    return null
  }
}

function resolveImageSettings(
  args?: GenerateImageArgs,
  res?: GenerateImageResult | null,
): ImageGenSettings {
  return {
    resolution: res?.resolution ?? (args?.resolution || getImageResolution() || undefined),
    quality: res?.quality ?? (args?.quality || getImageQuality() || undefined),
    background: res?.background ?? (args?.background || getImageBackground() || undefined),
  }
}

const RESOLUTION_LABELS: Record<string, string> = {
  '1k': '1K',
  '2k': '2K',
  '4k': '4K',
}

const QUALITY_KEYS: Record<string, MessageKey> = {
  low: 'img.low',
  medium: 'img.medium',
  high: 'img.high',
}

const BACKGROUND_KEYS: Record<string, MessageKey> = {
  transparent: 'img.transparent',
  opaque: 'img.opaque',
}

function ImageSettingsSummary({
  settings,
  className,
}: {
  settings: ImageGenSettings
  className?: string
}) {
  const { t } = useTranslation()

  const resolution = settings.resolution
    ? (RESOLUTION_LABELS[settings.resolution.toLowerCase()] ?? settings.resolution.toUpperCase())
    : t('img.auto')
  const quality = settings.quality
    ? (QUALITY_KEYS[settings.quality] ? t(QUALITY_KEYS[settings.quality]) : settings.quality)
    : t('img.auto')
  const background = settings.background
    ? (BACKGROUND_KEYS[settings.background] ? t(BACKGROUND_KEYS[settings.background]) : settings.background)
    : t('img.auto')

  return (
    <span
      className={cn(
        'truncate text-xs text-muted-foreground/70',
        className,
      )}
    >
      {resolution}
      <span className="mx-1 text-muted-foreground/30">·</span>
      {quality}
      <span className="mx-1 text-muted-foreground/30">·</span>
      {background}
    </span>
  )
}

function DetailRow({
  label,
  children,
  mono,
}: {
  label: string
  children: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
        {label}
      </span>
      <span
        className={cn(
          'text-xs text-muted-foreground',
          mono && 'font-mono text-[10px] text-muted-foreground/80 break-all',
        )}
      >
        {children}
      </span>
    </div>
  )
}

function ModelGlyph({ model, className }: { model: ModelConfig; className?: string }) {
  const fallback = <ImageIcon className={cn('shrink-0', className)} />
  if (!model.providerId) return <span className="flex shrink-0">{fallback}</span>
  return (
    <ProviderLogo
      providerId={model.providerId}
      className={cn('shrink-0', className)}
      fallback={fallback}
    />
  )
}

const ModelSelectionCard: FC<{ models: ModelConfig[] }> = ({ models }) => {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState('')

  const handlePick = (persist: boolean) => {
    if (!selectedId) return
    submitImageModelSelection({ modelId: selectedId, persist })
  }

  return (
    <div className="w-full rounded-lg border border-border/60 bg-card/30 p-4">
      <div className="flex items-center gap-2 pb-3 border-b border-border/40">
        <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">{t('imgModel.selectTitle')}</span>
      </div>
      <p className="pt-2 pb-2 text-xs text-muted-foreground/60">{t('imgModel.selectHint')}</p>
      <div className="flex flex-col gap-1">
        {models.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelectedId(m.id)}
            className={cn(
              'group flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-left transition-colors',
              selectedId === m.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            <ModelGlyph model={m} className="size-4" />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm leading-snug truncate">{m.name}</span>
              <span className="text-[11px] text-muted-foreground/50 truncate">{m.model}</span>
            </div>
            <span
              className={cn(
                'size-3.5 shrink-0 rounded-sm border flex items-center justify-center transition-colors',
                selectedId === m.id
                  ? 'border-primary/60 bg-primary/20 text-primary'
                  : 'border-border',
              )}
            >
              {selectedId === m.id && <CheckIcon className="size-2.5" />}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
        <Button variant="ghost" size="sm" onClick={dismissImageModelSelection}>
          {t('imgModel.cancel')}
        </Button>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedId}
            onClick={() => handlePick(false)}
            title={t('imgModel.onceHint')}
          >
            {t('imgModel.once')}
          </Button>
          <Button
            size="sm"
            disabled={!selectedId}
            onClick={() => handlePick(true)}
            title={t('imgModel.alwaysHint')}
          >
            {t('imgModel.always')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export const GenerateImageToolUI = makeAssistantToolUI<GenerateImageArgs, string>({
  toolName: 'generate_image',
  render: ({ args, status, result }) => {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const isRunning = status?.type === 'running'
    const res = parseResult(result)

    const pending = useSyncExternalStore(
      subscribeImageModelSelection,
      getPendingImageModelSelection,
    )

    if (isRunning && pending) {
      return <ModelSelectionCard models={pending.models} />
    }

    if (isRunning) {
      const settings = resolveImageSettings(args)
      return (
        <div className="flex items-center gap-2.5 py-1 min-w-0">
          <LoaderIcon className="size-3.5 shrink-0 animate-spin text-primary/60" />
          <span className="shrink-0 text-sm font-medium text-foreground/70">
            {t('imgModel.generating')}
          </span>
          <ImageSettingsSummary settings={settings} />
        </div>
      )
    }

    const error = res?.error
    const path = res?.path ?? args?.output
    const prompt = args?.prompt
    const settings = resolveImageSettings(args, res)
    const hasDetails = Boolean(prompt || path || error || res?.revised_prompt)

    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <span className="relative size-3.5 shrink-0">
            <ImageIcon className="size-3.5 absolute inset-0 transition-opacity group-hover/trigger:opacity-0" />
            <ChevronDownIcon
              className={cn(
                'size-3.5 absolute inset-0 transition-all opacity-0 group-hover/trigger:opacity-100',
                !open && '-rotate-90',
              )}
            />
          </span>
          <span className="shrink-0">{t('imgModel.generated')}</span>
          {error ? (
            <span className="shrink-0 text-xs text-destructive/80">{error}</span>
          ) : (
            <ImageSettingsSummary settings={settings} className="min-w-0" />
          )}
        </CollapsibleTrigger>
        {hasDetails && (
          <CollapsibleContent
            className={cn(
              'overflow-hidden',
              'data-[state=closed]:animate-collapsible-up',
              'data-[state=open]:animate-collapsible-down',
              'data-[state=closed]:fill-mode-forwards',
            )}
          >
            <div className="mt-1 flex flex-col gap-2 pl-5">
              {prompt && (
                <DetailRow label={t('imgModel.prompt')}>{prompt}</DetailRow>
              )}
              {path && !error && (
                <DetailRow label={t('imgModel.output')} mono>
                  {path}
                </DetailRow>
              )}
              {res?.revised_prompt && (
                <DetailRow label={t('imgModel.revisedPrompt')}>
                  {res.revised_prompt}
                </DetailRow>
              )}
              {error && (
                <DetailRow label={t('imgModel.error')}>
                  <span className="text-destructive/80">{error}</span>
                </DetailRow>
              )}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    )
  },
})
