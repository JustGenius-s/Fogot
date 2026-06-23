/**
 * Audio tool UI cards — render the audio-mode tools (design_voice,
 * clone_voice, generate_speech, generate_music) as compact cards with an
 * inline player for the generated audio.
 */

import { makeAssistantToolUI } from '@assistant-ui/react'
import {
  LoaderIcon,
  MicIcon,
  CopyIcon,
  AudioLinesIcon,
  MusicIcon,
  AlertCircleIcon,
  type LucideIcon,
} from 'lucide-react'
import { AudioPlayer } from '@/components/assets/audio-player'
import { setAppView } from '@/bridge'
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

const CardShell = ({
  icon: Icon,
  label,
  title,
  running,
  children,
  audioPath,
  error,
  showVoiceLibrary,
}: {
  icon: LucideIcon
  label: string
  title?: string
  running: boolean
  children?: React.ReactNode
  audioPath?: string
  error?: string
  showVoiceLibrary?: boolean
}) => {
  const { t } = useTranslation()
  return (
  <div className="flex flex-col gap-1 py-0.5">
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {running ? (
        <LoaderIcon className="size-3.5 shrink-0 animate-spin" />
      ) : error ? (
        <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" />
      ) : (
        <Icon className="size-3.5 shrink-0" />
      )}
      <span className="shrink-0">{label}</span>
      {title && <span className="truncate">{title}</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
      {showVoiceLibrary && !running && (
        <button
          type="button"
          onClick={() => setAppView('audio')}
          className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-accent hover:text-foreground transition-colors"
        >
          <AudioLinesIcon className="size-3" />
        </button>
      )}
    </div>
    {children && <div className="pl-5 flex flex-col gap-1">{children}</div>}
    {audioPath && <div className="pl-5"><AudioPlayer path={audioPath} /></div>}
  </div>
  )
}

const VoiceIdChip = ({ voiceId }: { voiceId?: string }) => {
  const { t } = useTranslation()
  if (!voiceId) return null
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(voiceId).catch(() => {})}
      title={t('audio.copyVoiceId')}
      className="inline-flex w-fit items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary transition-colors hover:bg-primary/20"
    >
      {voiceId}
      <CopyIcon className="size-2.5" />
    </button>
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
    return (
      <CardShell
        icon={MicIcon}
        label={t('audio.toolDesign')}
        title={args?.name ?? res?.name}
        running={running}
        error={res?.error}
        audioPath={res?.preview}
        showVoiceLibrary={!!res?.success}
      >
        {args?.description && (
          <span className="text-xs text-muted-foreground">{args.description}</span>
        )}
        <VoiceIdChip voiceId={res?.voice_id} />
      </CardShell>
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
    return (
      <CardShell
        icon={MicIcon}
        label={t('audio.toolClone')}
        title={args?.name ?? res?.name}
        running={running}
        error={res?.error}
        audioPath={res?.preview}
        showVoiceLibrary={!!res?.success}
      >
        {args?.reference_audio && (
          <span className="truncate text-xs text-muted-foreground" title={args.reference_audio}>
            {t('audio.referenceLabel', { path: args.reference_audio })}
          </span>
        )}
        <VoiceIdChip voiceId={res?.voice_id} />
        {res?.note && <span className="text-[11px] text-amber-500">{res.note}</span>}
      </CardShell>
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
    return (
      <CardShell
        icon={AudioLinesIcon}
        label={t('audio.toolSpeech')}
        running={running}
        error={res?.error}
        audioPath={res?.path}
      >
        {args?.text && (
          <span className="text-xs text-foreground/80">“{args.text}”</span>
        )}
        <VoiceIdChip voiceId={args?.voice_id ?? res?.voice_id} />
      </CardShell>
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
    return (
      <CardShell
        icon={MusicIcon}
        label={t('audio.toolMusic')}
        running={running}
        error={res?.error}
        audioPath={res?.path}
      >
        {args?.prompt && (
          <span className="text-xs text-muted-foreground">{args.prompt}</span>
        )}
      </CardShell>
    )
  },
})
