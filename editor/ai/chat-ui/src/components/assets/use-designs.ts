import { useCallback, useEffect, useState } from 'react'
import { listDesigns, type DesignEntry, DESIGN_DIR } from '@/lib/designs'

interface UseDesignsState {
  designs: DesignEntry[]
  exists: boolean
  loading: boolean
  error: string | null
  reload: () => void
}

/** Load and refresh the design document list for a directory. */
export function useDesigns(dir: string = DESIGN_DIR): UseDesignsState {
  const [designs, setDesigns] = useState<DesignEntry[]>([])
  const [exists, setExists] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listDesigns(dir)
      .then((res) => {
        if (cancelled) return
        setDesigns(res.designs)
        setExists(res.exists)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dir, nonce])

  return { designs, exists, loading, error, reload }
}
