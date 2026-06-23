/**
 * Spinner — animated grid-of-squares loading indicator.
 *
 * Inspired by opencode's `Spinner` (a 4×4 grid of 3px rounded squares with
 * corner 4 hidden, outer ring dimly pulsing, inner cross brightly pulsing).
 *
 * Differentiation: instead of opencode's random per-square delays/durations we
 * use a deterministic phased pattern so each render looks the same and the
 * wave sweeps inward → outward on the cross, giving a sharper "thinking" beat.
 */

interface SquareSpec {
  id: number
  x: number
  y: number
  /** corner squares are hidden */
  corner: boolean
  /** outer ring squares use the dim pulse */
  outer: boolean
  /** wave phase offset in seconds */
  delay: number
  /** animation duration in seconds — outer slightly slower */
  duration: number
}

// 4x4 grid (16 squares) with 4 unit pitch. Corner indices:
//   0  3 12 15
// Outer ring (non-corner): 1 2 4 7 8 11 13 14
// Inner cross (center 4): 5 6 9 10
const cornerIndices = new Set([0, 3, 12, 15])
const outerIndices = new Set([1, 2, 4, 7, 8, 11, 13, 14])

// radial-style wave offset: distance from center (1.5, 1.5) in grid units
function radialDelay(row: number, col: number): number {
  const dx = col - 1.5
  const dy = row - 1.5
  return Math.sqrt(dx * dx + dy * dy) * 0.13
}

function buildSquares(): SquareSpec[] {
  const out: SquareSpec[] = []
  for (let i = 0; i < 16; i++) {
    const row = Math.floor(i / 4)
    const col = i % 4
    out.push({
      id: i,
      x: col * 4,
      y: row * 4,
      corner: cornerIndices.has(i),
      outer: outerIndices.has(i),
      delay: radialDelay(row, col),
      duration: outerIndices.has(i) ? 1.6 : 1.1,
    })
  }
  return out
}

const SQUARES = buildSquares()

export const Spinner = ({
  size = 16,
  className,
  style,
}: {
  size?: number
  className?: string
  style?: React.CSSProperties
}) => {
  return (
    <svg
      viewBox="0 0 15 15"
      width={size}
      height={size}
      data-component="fogot-spinner"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
    >
      {SQUARES.map((sq) => (
        <rect
          key={sq.id}
          x={sq.x}
          y={sq.y}
          width="3"
          height="3"
          rx="1"
          style={{
            opacity: sq.corner ? 0 : undefined,
            animation: sq.corner
              ? undefined
              : `${sq.outer ? 'fogot-spinner-dim' : 'fogot-spinner'} ${sq.duration}s ease-in-out infinite`,
            animationFillMode: 'both',
            animationDelay: `${sq.delay}s`,
          }}
        />
      ))}
    </svg>
  )
}

export default Spinner