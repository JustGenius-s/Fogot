import { useEffect, useRef, useState, type FC } from 'react'
import { ImageIcon } from 'lucide-react'
import { readAssetDataUrl } from '@/lib/assets'
import { cn } from '@/lib/utils'

interface AssetThumbProps {
  path: string
  /** Cache-busting token; change it to force a re-read after the file changes. */
  version?: number
  className?: string
}

/**
 * Lazily-loaded asset thumbnail. Reads the image as a data URL only once it
 * scrolls into view, to avoid reading every binary file over the bridge.
 */
export const AssetThumb: FC<AssetThumbProps> = ({ path, version, className }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setFailed(false)
    readAssetDataUrl(path)
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [visible, path, version])

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-center overflow-hidden bg-muted',
        className,
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={path}
          loading="lazy"
          className="size-full object-contain"
        />
      ) : (
        <ImageIcon
          className={cn(
            'size-6 text-muted-foreground/50',
            failed && 'text-destructive/60',
          )}
        />
      )}
    </div>
  )
}
