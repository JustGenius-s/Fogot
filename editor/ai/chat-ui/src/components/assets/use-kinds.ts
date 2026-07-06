import { useEffect, useState } from 'react'
import { onProjectKindsChanged } from '@/lib/design-schema'

/**
 * Re-render hook for project kind changes.
 *
 * Returns a counter that increments every time `setProjectKinds` / `clearProjectKinds`
 * fires. Components that derive labels, colors or type tabs from the merged kind
 * registry call this so they stay in sync with `res://.design/kinds/*.md` edits.
 */
export function useProjectKindsVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => onProjectKindsChanged(() => setVersion((v) => v + 1)), [])
  return version
}
