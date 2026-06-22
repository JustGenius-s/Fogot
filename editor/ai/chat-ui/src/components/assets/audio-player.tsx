import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import { PlayIcon, PauseIcon, AudioLinesIcon, AlertCircleIcon } from 'lucide-react'
import { readAudioDataUrl } from '@/lib/assets'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

interface AudioPlayerProps {
  /** res:// path of the audio asset to play. */
  path: string
  /** Optional label shown above the progress bar. */
  label?: string
  /** Cache-busting token; change it to re-read after the file changes. */
  version?: number
  className?: string
}

/** Format seconds as `m:ss` (e.g. 75 → "1:15"). */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Compact inline audio player for a project audio asset. Reads the file as a
 * data URL on first play (binary bridge reads are relatively expensive) and
 * shows a seekable progress bar with elapsed / total time.
 */
export const AudioPlayer: FC<AudioPlayerProps> = ({ path, label, version, className }) => {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [seeking, setSeeking] = useState(false)

  useEffect(() => {
    setSrc(null)
    setPlaying(false)
    setFailed(false)
    setCurrentTime(0)
    setDuration(0)
  }, [path, version])

  const ensureLoaded = useCallback(async (): Promise<string | null> => {
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
  }, [src, path])

  const toggle = useCallback(async () => {
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
  }, [playing, ensureLoaded])

  // Translate a pointer x-position on the track into a 0..1 ratio.
  const ratioFromPointer = useCallback((clientX: number): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

  const seekTo = useCallback(
    async (ratio: number) => {
      const url = await ensureLoaded()
      if (!url) return
      const apply = () => {
        const el = audioRef.current
        if (!el || !Number.isFinite(el.duration)) return
        el.currentTime = ratio * el.duration
        setCurrentTime(el.currentTime)
      }
      // If metadata isn't ready yet, apply once it loads.
      if (audioRef.current && Number.isFinite(audioRef.current.duration)) apply()
      else requestAnimationFrame(apply)
    },
    [ensureLoaded],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      setSeeking(true)
      void seekTo(ratioFromPointer(e.clientX))
    },
    [ratioFromPointer, seekTo],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!seeking) return
      void seekTo(ratioFromPointer(e.clientX))
    },
    [seeking, ratioFromPointer, seekTo],
  )

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setSeeking(false)
  }, [])

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0
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

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-xs text-muted-foreground" title={path}>
          {label ?? fileName}
        </span>
        <div
          ref={trackRef}
          role="slider"
          aria-label={label ?? fileName}
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(currentTime)}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="group relative h-2 cursor-pointer touch-none"
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
      </div>

      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setCurrentTime(0)
          }}
          onError={() => setFailed(true)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => {
            if (!seeking) setCurrentTime(e.currentTarget.currentTime)
          }}
          className="hidden"
        />
      )}
    </div>
  )
}
