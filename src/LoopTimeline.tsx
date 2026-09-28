import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import './LoopTimeline.css'

type Part = 'start' | 'end' | 'range'
type Props = {
  duration: number
  start: number
  end: number
  enabled: boolean
  ready: boolean
  onChange: (start: number, end: number) => void
  onEditingChange: (editing: boolean) => void
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))
const snap = (value: number) => Math.round(value * 10) / 10
const stamp = (value: number) => {
  const ticks = Math.round(value * 10)
  return `${Math.floor(ticks / 600)}:${String(Math.floor(ticks / 10) % 60).padStart(2, '0')}.${ticks % 10}`
}

export default function LoopTimeline({ duration, start, end, enabled, ready, onChange, onEditingChange }: Props) {
  const railRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; part: Part | 'mark'; anchor: number; start: number; end: number } | null>(null)
  const [selected, setSelected] = useState<Part>('range')
  const [dragging, setDragging] = useState(false)
  const max = Math.floor(duration * 10) / 10
  const available = ready && max >= 0.1
  const from = Number.isFinite(start) ? clamp(snap(start), 0, Math.max(0, max - 0.1)) : 0
  const to = Number.isFinite(end) ? clamp(snap(end), from + 0.1, max) : max

  const position = (clientX: number) => {
    const rect = railRef.current!.getBoundingClientRect()
    return clamp((clientX - rect.left) / rect.width * max, 0, max)
  }

  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (!available || event.button !== 0) return
    const target = event.target as HTMLElement
    const part = target.closest<HTMLElement>('[data-part]')?.dataset.part as Part | undefined
    const mode = part || 'mark'
    event.preventDefault()
    const anchor = position(event.clientX)
    dragRef.current = { pointerId: event.pointerId, part: mode, anchor, start: from, end: to }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (mode !== 'mark') {
      setSelected(mode)
      target.closest<HTMLElement>('[data-part]')?.focus()
    } else {
      setSelected('range')
      const nextStart = clamp(snap(anchor), 0, max - 0.1)
      onChange(nextStart, snap(nextStart + 0.1))
    }
    setDragging(true)
    onEditingChange(true)
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = position(event.clientX)
    if (drag.part === 'start') onChange(clamp(snap(drag.start + point - drag.anchor), 0, snap(drag.end - 0.1)), drag.end)
    else if (drag.part === 'end') onChange(drag.start, clamp(snap(drag.end + point - drag.anchor), snap(drag.start + 0.1), max))
    else if (drag.part === 'range') {
      const delta = clamp(snap(point - drag.anchor), -drag.start, snap(max - drag.end))
      onChange(snap(drag.start + delta), snap(drag.end + delta))
    } else {
      const nextStart = clamp(snap(Math.min(drag.anchor, point)), 0, max - 0.1)
      onChange(nextStart, clamp(snap(Math.max(drag.anchor, point)), snap(nextStart + 0.1), max))
    }
  }

  const finish = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    onEditingChange(false)
  }

  const nudge = (part: Part, delta: number) => {
    if (!available) return
    if (part === 'start') onChange(clamp(snap(from + delta), 0, snap(to - 0.1)), to)
    else if (part === 'end') onChange(from, clamp(snap(to + delta), snap(from + 0.1), max))
    else {
      const shift = clamp(delta, -from, snap(max - to))
      onChange(snap(from + shift), snap(to + shift))
    }
  }

  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, part: Part) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const delta = event.key === 'Home' ? -max : event.key === 'End' ? max
      : (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 0.1)
    nudge(part, delta)
  }

  return (
    <div className={`loop-editor${enabled ? ' is-enabled' : ''}${dragging ? ' is-dragging' : ''}`}>
      <div
        ref={railRef}
        className="loop-rail"
        style={{ '--loop-start': `${max > 0 ? from / max * 100 : 0}%`, '--loop-end': `${max > 0 ? to / max * 100 : 100}%` } as CSSProperties}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      >
        <div className="loop-rail-base" />
        <button type="button" data-part="range" className={`loop-region${selected === 'range' ? ' is-selected' : ''}`} disabled={!available}
          aria-label="Mover el tramo completo del bucle" onFocus={() => setSelected('range')} onKeyDown={(event) => keyDown(event, 'range')}>
          <span aria-hidden="true">⠿</span>
        </button>
        {(['start', 'end'] as const).map((part) => (
          <button key={part} type="button" role="slider" data-part={part}
            className={`loop-handle loop-handle-${part}${selected === part ? ' is-selected' : ''}`} disabled={!available}
            aria-label={part === 'start' ? 'Inicio del bucle' : 'Final del bucle'}
            aria-valuemin={part === 'start' ? 0 : snap(from + 0.1)} aria-valuemax={part === 'start' ? Math.max(0, snap(to - 0.1)) : max}
            aria-valuenow={part === 'start' ? from : Math.max(0, to)} aria-valuetext={stamp(part === 'start' ? from : Math.max(0, to))}
            onFocus={() => setSelected(part)} onKeyDown={(event) => keyDown(event, part)}>
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}
