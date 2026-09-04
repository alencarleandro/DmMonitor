import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { localDate } from './api'
import type { Measurement } from './api'

const HOUR_WIDTH = 64
const DAY_WIDTH = HOUR_WIDTH * 24
const PADDING = 24
const HEIGHT = 280
const TOP = 20
const BOTTOM = 40
const HEADER_HEIGHT = 40
const calendarDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000

export function GlucoseChart({ measurements, from, to, loading }: {
  measurements: Measurement[]; from: string; to: string; loading: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [viewport, setViewport] = useState({ left: 0, width: 800 })
  const rows = useMemo(() => [...measurements]
    .filter(row => { const date = localDate(new Date(row.measuredAt)); return date >= from && date <= to })
    .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt)), [measurements, from, to])
  const startDay = calendarDay(from)
  const dayCount = Math.max(1, calendarDay(to) - startDay + 1)
  const width = PADDING * 2 + dayCount * DAY_WIDTH
  // Use local calendar dates and clock hours so every day keeps its own 00–23 scale.
  const xFor = (measuredAt: string) => {
    const date = new Date(measuredAt)
    const day = calendarDay(localDate(date)) - startDay
    const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
    return PADDING + day * DAY_WIDTH + hour * HOUR_WIDTH
  }
  const latestX = rows.length ? xFor(rows[rows.length - 1].measuredAt) : 0
  const yMax = Math.max(600, Math.ceil(Math.max(0, ...rows.map(row => row.value)) / 150) * 150)
  const ticks = Array.from({ length: 5 }, (_, index) => ({
    y: TOP + index * (HEIGHT - TOP - BOTTOM) / 4,
    value: yMax - index * yMax / 4,
  }))
  const points = rows.map(row => ({ x: xFor(row.measuredAt), y: TOP + (1 - row.value / yMax) * (HEIGHT - TOP - BOTTOM), row }))
  const path = points.reduce((result, point, index) => {
    if (!index) return `M ${point.x} ${point.y}`
    const previous = points[index - 1]
    const middle = (previous.x + point.x) / 2
    return `${result} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`
  }, '')

  useEffect(() => {
    const element = scrollRef.current
    if (!element || loading || !rows.length) return
    element.scrollLeft = Math.max(0, latestX - element.clientWidth * .72)
    setViewport({ left: element.scrollLeft, width: element.clientWidth })
    setHoveredId(null)
    const observer = new ResizeObserver(() => setViewport({ left: element.scrollLeft, width: element.clientWidth }))
    observer.observe(element)
    const scrollHorizontally = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      event.preventDefault()
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? element.clientWidth : 1
      element.scrollLeft += event.deltaY * unit
    }
    const wheelTarget = element.parentElement || element
    wheelTarget.addEventListener('wheel', scrollHorizontally, { passive: false })
    return () => { observer.disconnect(); wheelTarget.removeEventListener('wheel', scrollHorizontally) }
  }, [from, to, loading, latestX, rows.length])

  if (loading) return <div className="chart-state" role="status"><span className="spinner" />Carregando curva glicêmica…</div>
  if (!rows.length) return <div className="chart-state"><span className="empty-droplet"><Activity size={25} /></span><strong>Sem pontos para desenhar</strong><span>As medições do intervalo aparecerão aqui.</span></div>

  // Only draw the nearby day grids, even when the selected range spans a year.
  const firstVisibleDay = Math.max(0, Math.floor((viewport.left - PADDING) / DAY_WIDTH) - 1)
  const lastVisibleDay = Math.min(dayCount - 1, Math.floor((viewport.left + viewport.width - PADDING) / DAY_WIDTH) + 1)
  const days = Array.from({ length: lastVisibleDay - firstVisibleDay + 1 }, (_, index) => {
    const day = firstVisibleDay + index
    const date = new Date((startDay + day) * 86400000)
    return { day, label: date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) }
  })
  const activePoint = points.find(point => point.row.id === hoveredId && point.x >= viewport.left && point.x <= viewport.left + viewport.width)
  const popupWidth = Math.min(178, viewport.width - 16)
  const popupX = activePoint ? Math.max(viewport.left + 8, Math.min(activePoint.x + 14, viewport.left + viewport.width - popupWidth - 8)) : 0
  const popupY = activePoint ? Math.max(TOP, activePoint.y - 66) : 0
  const scrollByDay = (direction: number) => scrollRef.current?.scrollBy({ left: direction * DAY_WIDTH, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })

  return <div className="chart-wrap">
    <div className="timeline-toolbar">
      <span><ArrowLeftRight size={15} />Role ou deslize para explorar as horas e os dias</span>
      <div className="timeline-navigation">
        <button className="icon-button" aria-label="Voltar 24 horas no gráfico" title="Voltar 24 horas" disabled={viewport.left <= 0} onClick={() => scrollByDay(-1)}><ChevronLeft size={17} /></button>
        <button className="timeline-latest" onClick={() => scrollRef.current?.scrollTo({ left: Math.max(0, latestX - viewport.width * .72), behavior: 'auto' })}>Última medição</button>
        <button className="icon-button" aria-label="Avançar 24 horas no gráfico" title="Avançar 24 horas" disabled={viewport.left + viewport.width >= width - 1} onClick={() => scrollByDay(1)}><ChevronRight size={17} /></button>
      </div>
    </div>
    <div className="timeline-frame">
      <svg className="timeline-y-axis" width="48" height={HEIGHT + HEADER_HEIGHT} aria-hidden="true">
        <text x="39" y="25" textAnchor="end" className="chart-axis-label chart-unit">mg/dL</text>
        {ticks.map(tick => <text key={tick.value} x="39" y={HEADER_HEIGHT + tick.y + 4} textAnchor="end" className="chart-axis-label">{tick.value.toLocaleString('pt-BR')}</text>)}
      </svg>
      <div className="timeline-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label="Linha do tempo da glicemia. Use as setas para rolar pelas horas."
        onScroll={event => setViewport({ left: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth })}>
        <div className="timeline-content" style={{ width }}>
          <div className="timeline-day-headers" style={{ height: HEADER_HEIGHT }}>
            {days.map(({ day, label }) => <div key={day} className={`timeline-day-header day-palette-${day % 2}`} style={{ left: PADDING + day * DAY_WIDTH, width: DAY_WIDTH }}><span>{label}</span></div>)}
          </div>
          <svg className="glucose-chart" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="group" aria-label={`Curva glicêmica com ${rows.length} medições; horas de 00 a 23 em cada dia`}>
            {days.map(({ day }) => <g key={day} aria-hidden="true">
              <rect x={PADDING + day * DAY_WIDTH} y="0" width={DAY_WIDTH} height={HEIGHT} className={`timeline-day-background day-palette-${day % 2}`} />
              {Array.from({ length: 24 }, (_, hour) => {
                const x = PADDING + day * DAY_WIDTH + hour * HOUR_WIDTH
                return <g key={hour}><line x1={x} y1="0" x2={x} y2={HEIGHT - BOTTOM} className={hour === 0 ? 'chart-day-divider' : 'chart-hour-line'} /><text x={x} y={HEIGHT - 14} textAnchor="middle" className={`chart-axis-label ${hour === 0 ? 'chart-midnight' : ''}`}>{String(hour).padStart(2, '0')}</text></g>
              })}
            </g>)}
            {ticks.map(tick => <line key={tick.value} x1={PADDING} y1={tick.y} x2={width - PADDING} y2={tick.y} className="chart-grid-line" />)}
            <path d={path} className="chart-line" />
            {points.map(point => <circle key={point.row.id} cx={point.x} cy={point.y} r="5" className="chart-point" tabIndex={0} role="img"
              aria-label={`${point.row.value} mg/dL em ${new Date(point.row.measuredAt).toLocaleString('pt-BR')}`}
              onMouseEnter={() => setHoveredId(point.row.id)} onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(point.row.id)} onBlur={() => setHoveredId(null)}
              onClick={() => setHoveredId(point.row.id)} />)}
            {activePoint && <g pointerEvents="none" className="chart-tooltip">
              <rect x={popupX} y={popupY} width={popupWidth} height="54" rx="8" fill="#203f31" />
              <text x={popupX + 11} y={popupY + 21} fill="#fff" fontSize="12" fontWeight="600">{activePoint.row.value} mg/dL</text>
              <text x={popupX + 11} y={popupY + 40} fill="#dce8d4" fontSize="10">{new Date(activePoint.row.measuredAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</text>
            </g>}
          </svg>
        </div>
      </div>
    </div>
    <p className="timeline-caption"><span className="timeline-palette" aria-hidden="true"><i /><i /></span>Cada faixa é um dia · após 23h, começa 00h do dia seguinte</p>
  </div>
}
