import { useCallback, useEffect, useState } from 'react'
import { listAssets, type AssetEntry, ASSETS_DIR } from '@/lib/assets'

interface UseAssetsState {
  assets: AssetEntry[]
  exists: boolean
  loading: boolean
  error: string | null
  reload: () => void
}

/** Load and refresh the image asset list for a directory. */
export function useAssets(dir: string = ASSETS_DIR): UseAssetsState {
  const [assets, setAssets] = useState<AssetEntry[]>([])
  const [exists, setExists] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listAssets(dir)
      .then((res) => {
        if (cancelled) return
        setAssets(res.assets)
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

  return { assets, exists, loading, error, reload }
}
