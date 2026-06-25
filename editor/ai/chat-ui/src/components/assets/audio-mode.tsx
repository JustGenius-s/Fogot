import { useCallback, useEffect, useState, type FC } from 'react'
import {
  ArrowLeftIcon,
  RefreshCwIcon,
  MicIcon,
  Trash2Icon,
  CopyIcon,
  AudioLinesIcon,
} from 'lucide-react'
import { setAppView } from '@/bridge'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { AudioModelSelector } from '@/components/assistant-ui/model-selector'
import { Skeleton } from '@/components/ui/skeleton'
import { AudioPlayer } from '@/components/assets/audio-player'
import { listVoices, removeVoice, type VoiceEntry } from '@/lib/voices'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

/** Display label for a backend provider id. */
const PROVIDER_LABEL: Record<string, string> = {
  minimax: 'MiniMax',
}

function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider
}

/** Group voices by provider, preserving a stable provider order. */
function groupByProvider(voices: VoiceEntry[]): [string, VoiceEntry[]][] {
  const groups = new Map<string, VoiceEntry[]>()
  for (const voice of voices) {
    const key = voice.provider || 'unknown'
    const bucket = groups.get(key)
    if (bucket) bucket.push(voice)
    else groups.set(key, [voice])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

/** Top-level audio view: browse the project voice library. */
export const AudioMode: FC = () => {
  const { t } = useTranslation()
  const [voices, setVoices] = useState<VoiceEntry[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    setLoading(true)
    listVoices()
      .then(setVoices)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const handleDelete = async (voiceId: string) => {
    await removeVoice(voiceId)
    reload()
  }

  return (
    <div className="flex h-full flex-col bg-background @container">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 shrink-0">
        <TooltipIconButton
          tooltip={t('common.back')}
          side="bottom"
          className="size-7"
          onClick={() => setAppView('chat')}
        >
          <ArrowLeftIcon className="size-4" />
        </TooltipIconButton>
        <span className="text-sm font-medium text-foreground">{t('audio.voiceLibrary')}</span>
        <div className="ml-auto flex items-center gap-1">
          <AudioModelSelector />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {loading ? t('common.loading') : t('audio.voicesCount', { count: voices.length })}
            </span>
            <TooltipIconButton tooltip={t('common.refresh')} side="bottom" onClick={reload}>
              <RefreshCwIcon className="size-3.5" />
            </TooltipIconButton>
          </div>

          {loading && voices.length === 0 ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : voices.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-xs text-muted-foreground/70">
              <AudioLinesIcon className="size-6 opacity-50" />
              {t('audio.noVoices')}
              <span className="opacity-60">{t('audio.noVoicesHint')}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groupByProvider(voices).map(([provider, items]) => (
                <div key={provider} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-0.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {providerLabel(provider)}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
                      {items.length}
                    </span>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>
                  {items.map((voice) => (
                    <VoiceCard key={voice.voiceId} voice={voice} onDelete={handleDelete} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const VoiceCard: FC<{ voice: VoiceEntry; onDelete: (id: string) => void }> = ({
  voice,
  onDelete,
}) => {
  const { t } = useTranslation()
  return (
  <div
    data-slot="voice-card"
    className="group flex flex-col gap-3 overflow-hidden rounded-lg border border-border/50 bg-card/80 p-3.5 transition-colors hover:border-border"
  >
    <div className="flex items-start gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
        <MicIcon className="size-4.5 text-primary/70" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{voice.name}</span>
          <span
            className={cn(
              'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
              voice.kind === 'clone'
                ? 'bg-amber-500/10 text-amber-500'
                : 'bg-primary/10 text-primary',
            )}
          >
            {voice.kind === 'clone' ? t('audio.kindClone') : t('audio.kindDesign')}
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(voice.voiceId).catch(() => {})}
          title={t('audio.copyVoiceId')}
          className="flex w-fit items-center gap-1 truncate rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {voice.voiceId}
          <CopyIcon className="size-2.5 shrink-0" />
        </button>
      </div>
      <TooltipIconButton
        tooltip={t('common.delete')}
        side="bottom"
        className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => onDelete(voice.voiceId)}
      >
        <Trash2Icon className="size-3.5" />
      </TooltipIconButton>
    </div>

    {voice.description && (
      <p className="text-xs leading-relaxed text-muted-foreground/80">{voice.description}</p>
    )}
    {voice.preview && (
      <div className="-mx-0.5">
        <AudioPlayer path={voice.preview} label={t('audio.preview')} />
      </div>
    )}
  </div>
  )
}
