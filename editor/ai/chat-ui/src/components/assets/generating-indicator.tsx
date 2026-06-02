import { useEffect, useRef, useState, type FC, type RefObject } from 'react'

const STAGES = [
  'Creating image',
  'Sketching',
  'Generating draft',
  'Refining details',
  'Almost done',
]

/**
 * Animated dot grid forming square wavefronts that spiral outward.
 *
 * Each dot's radius and opacity follow a traveling sine wave keyed to its
 * Chebyshev distance from the center (which produces square rings) plus an
 * angular term (which twists the rings into a rotating square spiral).
 * Dots overlapping {@link excludeRef} are skipped so the label stays legible.
 */
const DotGridWave: FC<{ excludeRef: RefObject<HTMLElement | null> }> = ({
  excludeRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Let the canvas parse the resolved theme color (may be oklch / rgb);
    // opacity is applied per-dot via globalAlpha instead of parsing channels.
    const color = getComputedStyle(canvas).color

    const gap = 16
    const start = performance.now()
    let width = 0
    let height = 0
    let raf = 0
    let running = true

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const frame = (now: number) => {
      if (!running) return
      const t = (now - start) / 1000
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = color

      // Rectangle (in canvas coords) covered by the label, to keep dots clear.
      let ex = -1
      let ey = -1
      let ew = 0
      let eh = 0
      const el = excludeRef.current
      if (el) {
        const cr = canvas.getBoundingClientRect()
        const lr = el.getBoundingClientRect()
        ex = lr.left - cr.left - 6
        ey = lr.top - cr.top - 4
        ew = lr.width + 12
        eh = lr.height + 8
      }

      const cols = Math.max(1, Math.floor(width / gap))
      const rows = Math.max(1, Math.floor(height / gap))
      const offsetX = (width - (cols - 1) * gap) / 2
      const offsetY = (height - (rows - 1) * gap) / 2
      const cx = width / 2
      const cy = height / 2

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = offsetX + i * gap
          const y = offsetY + j * gap

          if (x >= ex && x <= ex + ew && y >= ey && y <= ey + eh) continue

          const dx = x - cx
          const dy = y - cy
          const cheb = Math.max(Math.abs(dx), Math.abs(dy))
          const angle = Math.atan2(dy, dx)
          const phase = cheb / 24 - t * 2 + angle * 2
          const wave = 0.5 + 0.5 * Math.sin(phase)
          const radius = 0.5 + wave * wave * 2.2
          const alpha = 0.06 + wave * wave * 0.34

          ctx.globalAlpha = alpha
          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [excludeRef])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 size-full text-foreground"
    />
  )
}

/** Loading placeholder shown in chat while an image is being generated. */
export const GeneratingImageIndicator: FC = () => {
  const [stage, setStage] = useState(0)
  const labelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (stage >= STAGES.length - 1) return
    const id = setTimeout(() => setStage((s) => s + 1), 2200)
    return () => clearTimeout(id)
  }, [stage])

  return (
    <div className="relative mt-1 aspect-square w-full max-w-[20rem] overflow-hidden rounded-2xl bg-muted/40">
      <DotGridWave excludeRef={labelRef} />
      <span
        ref={labelRef}
        className="absolute left-4 top-3 font-semibold text-foreground/90 text-sm"
      >
        {STAGES[stage]}…
      </span>
    </div>
  )
}
