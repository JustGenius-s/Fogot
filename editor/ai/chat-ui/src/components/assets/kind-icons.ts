import type { FC, CSSProperties } from 'react'
import {
  UserIcon,
  PackageIcon,
  SparklesIcon,
  SkullIcon,
  MapIcon,
  PencilRulerIcon,
} from 'lucide-react'

type KindIconProps = { className?: string; style?: CSSProperties }

/**
 * Lucide icon registry for kind `icon` hints. Kinds declare an icon by name
 * (e.g. `"Sword"`); this map resolves supported names to components. Unknown
 * names fall back to the pencil-ruler glyph. Add new entries here when the
 * built-in / project kinds reference new Lucide glyphs.
 */
export const KIND_ICONS: Record<string, FC<KindIconProps>> = {
  User: UserIcon,
  Package: PackageIcon,
  Sparkles: SparklesIcon,
  Skull: SkullIcon,
  Map: MapIcon,
  PencilRuler: PencilRulerIcon,
}

/** Resolve a kind icon name to a component, with a safe fallback. */
export function resolveKindIcon(name?: string): FC<KindIconProps> {
  return (name && KIND_ICONS[name]) || PencilRulerIcon
}
