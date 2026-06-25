import { makeAssistantToolUI } from '@assistant-ui/react'
import {
  LoaderIcon,
  MicIcon,
  CopyIcon,
  AudioLinesIcon,
  MusicIcon,
  ChevronDownIcon,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { AudioPlayer } from '@/components/assets/audio-player'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { setAppView } from '@/bridge'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

interface ToolResult {
  success?: boolean
  error?: string
  note?: string
  voice_id?: string
  name?: string
  preview?: string
  path?: string
}

function parseResult(result: unknown): ToolResult | null {
  if (typeof result !== 'string') return (result as ToolResult) ?? null
  try {
    return JSON.parse(result) as ToolResult
  } catch {
    return null
  }
}

interface DetailItem {
  label?: string
  value: string
  mono?: boolean
  copyable?: boolean
}

function DetailRow({ label, value, mono, copyable }: DetailItem) {
  const handleCopy = () => navigator.clipboard?.writeText(value).catch(() => {})
  const content = (
    <span
      className={cn(
        'text-xs',
        mono ? 'font-mono text-[10px] text-muted-foreground/80' : 'text-muted-foreground',
      )}
    >
      {value}
    </span>
  )

  const inner = (
    <div className="flex items-baseline gap-1.5">
      {label && (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
          {label}
        </span>
      )}
      {content}
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-muted-foreground/40 transition-colors hover:text-foreground"
        >
          <CopyIcon className="size-2.5" />
        </button>
      )}
    </div>
  )

  if (copyable && !mono) return inner
  return inner
}

const CardShell = ({
  icon: Icon,
  label,
  title,
  running,
  error,
  details,
  voiceLibrary,
  audioPath,
}: {
  icon: LucideIcon
  label: string
  title?: string
  running: boolean
  error?: string
  details?: DetailItem[]
  voiceLibrary?: boolean
  audioPath?: string
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (running) {
    return (
      <div className="flex items-center gap-2.5 py-1">
        <LoaderIcon className="size-3.5 shrink-0 animate-spin text-primary/60" />
        <span className="text-sm font-medium text-foreground/70">{label}</span>
      </div>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <span className="relative size-3.5 shrink-0">
          <Icon className="size-3.5 absolute inset-0 transition-opacity group-hover/trigger:opacity-0" />
          <ChevronDownIcon
            className={cn(
              'size-3.5 absolute inset-0 transition-all opacity-0 group-hover/trigger:opacity-100',
              !open && '-rotate-90',
            )}
          />
        </span>
        <span className="shrink-0">{label}</span>
        {title && (
          <span className="truncate text-muted-foreground/70">{title}</span>
        )}
        {error && (
          <span className="shrink-0 text-xs text-destructive/80">{error}</span>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-2 pl-5 mt-1">
          {audioPath && !error && (
            <AudioPlayer path={audioPath} />
          )}

          {details?.map((d, i) => (
            <DetailRow key={i} {...d} />
          ))}

          {voiceLibrary && !error && (
            <button
              type="button"
              onClick={() => setAppView('audio')}
              className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <AudioLinesIcon className="size-3" />
              {t('audio.voiceLibrary')}
            </button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export const DesignVoiceToolUI = makeAssistantToolUI<
  { name?: string; description?: string },
  string
>({
  toolName: 'design_voice',
  render: ({ args, status, result }) => {
    const { t } = useTranslation()
    const running = status?.type === 'running'
    const res = parseResult(result)

    const details: DetailItem[] = []
    if (args?.description) {
      details.push({ label: 'Description', value: args.description })
    }
    if (res?.voice_id) {
      details.push({ label: 'Voice ID', value: res.voice_id, mono: true, copyable: true })
    }

    return (
      <CardShell
        icon={MicIcon}
        label={t('audio.toolDesign')}
        title={args?.name ?? res?.name}
        running={running}
        error={res?.error}
        details={details}
        voiceLibrary={!!res?.success}
        audioPath={res?.preview}
      />
    )
  },
})

export const CloneVoiceToolUI = makeAssistantToolUI<
  { name?: string; reference_audio?: string },
  string
>({
  toolName: 'clone_voice',
  render: ({ args, status, result }) => {
    const { t } = useTranslation()
    const running = status?.type === 'running'
    const res = parseResult(result)

    const details: DetailItem[] = []
    if (args?.reference_audio) {
      details.push({ label: 'Reference', value: args.reference_audio })
    }
    if (res?.voice_id) {
      details.push({ label: 'Voice ID', value: res.voice_id, mono: true, copyable: true })
    }
    if (res?.note) {
      details.push({ label: 'Note', value: res.note })
    }

    return (
      <CardShell
        icon={MicIcon}
        label={t('audio.toolClone')}
        title={args?.name ?? res?.name}
        running={running}
        error={res?.error}
        details={details}
        voiceLibrary={!!res?.success}
        audioPath={res?.preview}
      />
    )
  },
})

export const GenerateSpeechToolUI = makeAssistantToolUI<
  { text?: string; voice_id?: string },
  string
>({
  toolName: 'generate_speech',
  render: ({ args, status, result }) => {
    const { t } = useTranslation()
    const running = status?.type === 'running'
    const res = parseResult(result)

    const details: DetailItem[] = []
    if (res?.voice_id || args?.voice_id) {
      details.push({ label: 'Voice', value: args?.voice_id ?? res?.voice_id ?? '', mono: true, copyable: true })
    }

    return (
      <CardShell
        icon={AudioLinesIcon}
        label={t('audio.toolSpeech')}
        title={args?.text ? `"${args.text}"` : undefined}
        running={running}
        error={res?.error}
        details={details}
        audioPath={res?.path}
      />
    )
  },
})

export const GenerateMusicToolUI = makeAssistantToolUI<
  { prompt?: string; instrumental?: boolean },
  string
>({
  toolName: 'generate_music',
  render: ({ args, status, result }) => {
    const { t } = useTranslation()
    const running = status?.type === 'running'
    const res = parseResult(result)

    const details: DetailItem[] = []
    if (args?.prompt) {
      details.push({ label: 'Prompt', value: args.prompt })
    }
    if (args?.instrumental !== undefined) {
      details.push({ label: 'Instrumental', value: args.instrumental ? 'Yes' : 'No' })
    }

    return (
      <CardShell
        icon={MusicIcon}
        label={t('audio.toolMusic')}
        running={running}
        error={res?.error}
        details={details}
        audioPath={res?.path}
      />
    )
  },
})
