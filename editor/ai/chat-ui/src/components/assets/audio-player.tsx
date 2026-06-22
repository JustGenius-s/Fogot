import { useEffect, useRef, useState, type FC } from 'react'
import { PlayIcon, PauseIcon, AudioLinesIcon, AlertCircleIcon } from 'lucide-react'
import { readAudioDataUrl } from '@/lib/assets'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

interface AudioPlayerProps {
  /** res:// path of the audio asset to play. */
  path: string
  /** Optional label shown next to the play button. */
  label?: string
  /** Cache-busting token; change it to re-read after the file changes. */
  version?: number
  className?: string
}

/**
 * Compact inline audio player for a project audio asset. Reads the file as a
 * data URL on first play (binary bridge reads are relatively expensive) and
 * toggles play/pause with a single button.
 */
export const AudioPlayer: FC<AudioPlayerProps> = ({ path, label, version, className }) => {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setSrc(null)
    setPlaying(false)
    setFailed(false)
  }, [path, version])

  const ensureLoaded = async (): Promise<string | null> => {
    if (src) return src
    setLoading(true)
    setFailed(false)
    try {
      const url = await readAudioDataUrl(path)
      setSrc(url)
      return url
    } catch {
      setFailed(true)
      return null
    } finally {
      setLoading(false)
    }
  }

  const toggle = async () => {
    const el = audioRef.current
    if (playing) {
      el?.pause()
      return
    }
    const url = await ensureLoaded()
    if (!url) return
    // Wait a tick so the <audio> element binds the freshly-set src.
    requestAnimationFrame(() => {
      audioRef.current?.play().catch(() => setFailed(true))
    })
  }

  const fileName = path.split('/').pop() ?? path

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5',
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={failed}
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
        aria-label={playing ? t('common.pause') : t('common.play')}
      >
        {failed ? (
          <AlertCircleIcon className="size-3.5 text-destructive" />
        ) : loading ? (
          <AudioLinesIcon className="size-3.5 animate-pulse" />
        ) : playing ? (
          <PauseIcon className="size-3.5" />
        ) : (
          <PlayIcon className="size-3.5" />
        )}
      </button>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={path}>
        {label ?? fileName}
      </span>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setFailed(true)}
          className="hidden"
        />
      )}
    </div>
  )
}
