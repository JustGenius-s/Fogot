/**
 * Generate Image Tool UI — inline display for generate_image calls.
 *
 * Three states:
 *  1. Running + pending model selection → renders the model picker card
 *     (user selects a model + "Always"/"Once"). Mirrors the ask_user pattern.
 *  2. Running + generating → compact progress indicator.
 *  3. Complete → collapsible summary with output path or error.
 */

import { useState, useSyncExternalStore, type FC } from 'react'
import { makeAssistantToolUI } from '@assistant-ui/react'
import { ImageIcon, CheckIcon, LoaderIcon, ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ProviderLogo } from '@/components/assistant-ui/provider-logo'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
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
}

interface GenerateImageResult {
  success?: boolean
  path?: string
  revised_prompt?: string
  error?: string
}

function parseResult(result: unknown): GenerateImageResult | null {
  if (typeof result !== 'string') return (result as GenerateImageResult) ?? null
  try {
    return JSON.parse(result) as GenerateImageResult
  } catch {
    return null
  }
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
  render: ({ status, result }) => {
    const { t } = useTranslation()
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
      return (
        <div className="flex items-center gap-2.5 py-1">
          <LoaderIcon className="size-3.5 shrink-0 animate-spin text-primary/60" />
          <span className="text-sm font-medium text-foreground/70">
            {t('imgModel.generating')}
          </span>
        </div>
      )
    }

    const error = res?.error
    const path = res?.path

    return (
      <Collapsible>
        <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <span className="relative size-3.5 shrink-0">
            <ImageIcon className="size-3.5 absolute inset-0 transition-opacity group-hover/trigger:opacity-0" />
            <ChevronDownIcon
              className={cn(
                'size-3.5 absolute inset-0 transition-all opacity-0 group-hover/trigger:opacity-100',
                'group-data-[state=closed]/trigger:-rotate-90',
              )}
            />
          </span>
          <span className="shrink-0">{t('imgModel.generating')}</span>
          {error ? (
            <span className="shrink-0 text-xs text-destructive/80">{error}</span>
          ) : path ? (
            <span className="truncate font-mono text-[10px] text-muted-foreground/70">
              {path}
            </span>
          ) : null}
        </CollapsibleTrigger>
        {res?.revised_prompt && (
          <CollapsibleContent>
            <div className="mt-1 pl-5">
              <span className="text-xs text-muted-foreground/60">{res.revised_prompt}</span>
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    )
  },
})
