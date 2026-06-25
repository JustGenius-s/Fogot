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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

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
  const [buffered, setBuffered] = useState(0)
  const [seeking, setSeeking] = useState(false)

  useEffect(() => {
    setSrc(null)
    setPlaying(false)
    setFailed(false)
    setCurrentTime(0)
    setDuration(0)
    setBuffered(0)
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
    requestAnimationFrame(() => {
      audioRef.current?.play().catch(() => setFailed(true))
    })
  }, [playing, ensureLoaded])

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

  const safeDuration = duration > 0 ? duration : 1
  const progress = Math.min(1, currentTime / safeDuration)
  const bufferedProgress = Math.min(1, buffered / safeDuration)
  const fileName = path.split('/').pop() ?? path

  return (
    <div
      data-slot="audio-player"
      className={cn(
        'relative w-full overflow-hidden rounded-2xl bg-card/60 px-4 py-3 shadow-sm ring-1 ring-border/50',
        'transition-shadow hover:shadow-md hover:ring-border',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={failed}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full transition-all',
            failed
              ? 'bg-destructive/15 text-destructive'
              : 'bg-white/10 text-foreground hover:bg-white/20 active:scale-90',
            'disabled:opacity-30',
          )}
          aria-label={playing ? t('common.pause') : t('common.play')}
        >
          {failed ? (
            <AlertCircleIcon className="size-4.5" />
          ) : loading ? (
            <AudioLinesIcon className="size-4.5 animate-pulse" />
          ) : playing ? (
            <PauseIcon className="size-4.5" fill="currentColor" />
          ) : (
            <PlayIcon className="size-4.5" fill="currentColor" />
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-foreground/70" title={path}>
              {label ?? fileName}
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/50">
              {formatTime(currentTime)}
              <span className="mx-0.5 text-muted-foreground/25">/</span>
              {formatTime(duration)}
            </span>
          </div>

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
            className="group relative h-4 cursor-pointer touch-none select-none"
          >
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
              <div
                data-slot="audio-player-buffered"
                className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/25"
                style={{ width: `${bufferedProgress * 100}%` }}
              />
              <div
                data-slot="audio-player-progress"
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-100 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div
              data-slot="audio-player-thumb"
              className={cn(
                'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow',
                'opacity-0 transition-all group-hover:opacity-100 group-hover:scale-110',
              )}
              style={{ left: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>

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
            const el = e.currentTarget
            if (el.buffered.length > 0) {
              setBuffered(el.buffered.end(el.buffered.length - 1))
            }
          }}
          onProgress={() => {
            const el = audioRef.current
            if (el && el.buffered.length > 0) {
              setBuffered(el.buffered.end(el.buffered.length - 1))
            }
          }}
          className="hidden"
        />
      )}
    </div>
  )
}
