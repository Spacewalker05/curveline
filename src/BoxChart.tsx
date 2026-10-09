import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import type { MetricKey, Metrics } from './api'
import { ExpandButton } from './Expand'
import { card, cv, minorTicks, paperAxis, sectionLabel } from './ui'

type Col = { label: string; scans: { name: 'reverse' | 'forward'; m: Metrics }[] }
type Metric = { key: MetricKey; label: string; unit: string }

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
const std = (values: number[]) => {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
}

const jitter = (index: number, group: number) => {
  const value = Math.sin((index + 1) * 12.9898 + group * 78.233) * 43758.5453
  return (value - Math.floor(value) - 0.5) * 0.34
}

export default function BoxChart({ metric, columns, dark }: { metric: Metric; columns: Col[]; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const line = cv('--c-line')
    const fg = cv('--c-fg')
    const traces: any[] = []
    ;(['reverse', 'forward'] as const).forEach((dir, i) => {
        const pts = columns.flatMap((c) => c.scans.filter((s) => s.name === dir).map((s) => ({ y: s.m[metric.key], label: c.label }))).filter((p): p is { y: number; label: string } => typeof p.y === 'number' && isFinite(p.y))
        if (!pts.length) return
        const color = i === 0 ? '#555555' : '#f04444'
        const average = mean(pts.map((point) => point.y))
        traces.push({ type: 'scatter', mode: 'markers', name: dir === 'reverse' ? 'Reverse' : 'Forward', x: pts.map((_, index) => i + jitter(index, i)), y: pts.map((point) => point.y), text: pts.map((point) => point.label), marker: { symbol: 'diamond', color, size: 8 }, hovertemplate: '<b>%{text}</b><br>%{y:.4g}<extra></extra>', showlegend: false })
        traces.push({ type: 'scatter', mode: 'lines', x: [i - 0.3, i + 0.3], y: [average, average], line: { color: '#555555', width: 1.2 }, hoverinfo: 'skip', showlegend: false })
        traces.push({ type: 'scatter', mode: 'markers', x: [i], y: [average], marker: { size: 1, opacity: 0 }, error_y: { type: 'data', array: [std(pts.map((point) => point.y))], color: '#666666', thickness: 1, width: 10 }, hoverinfo: 'skip', showlegend: false })
      })
    Plotly.react(
      ref.current,
      traces,
      {
        paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff', margin: { l: 68, r: 18, t: 16, b: 52 },
        font: { family: 'Arial, sans-serif', color: '#171717' }, showlegend: false,
        xaxis: { ...paperAxis('#171717', '#171717'), mirror: 'allticks', ticks: 'inside', ticklen: 7, tickwidth: 1.5, tickmode: 'array', tickvals: [0, 1], ticktext: ['Reverse', 'Forward'], range: [-0.55, 1.55], tickfont: { size: 13, color: '#171717' } },
        yaxis: { ...paperAxis('#171717', '#171717'), mirror: 'allticks', ticks: 'inside', ticklen: 7, tickwidth: 1.5, showgrid: false, minor: minorTicks('#171717'), title: { text: `${metric.label} (${metric.unit})`, font: { size: 15, color: '#171717' } } },
        hoverlabel: { bgcolor: cv('--c-panel'), bordercolor: line, font: { family: 'JetBrains Mono', size: 12, color: fg } },
      },
      { displaylogo: false, responsive: true, displayModeBar: false },
    )
  }, [metric, columns, dark])

  useEffect(() => {
    const el = ref.current
    return () => {
      if (el) Plotly.purge(el)
    }
  }, [])

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between">
        <div className={sectionLabel}>
          {metric.label} <span className="normal-case tracking-normal text-dim">({metric.unit})</span>
        </div>
        <ExpandButton getEl={() => ref.current} title={`${metric.label} (${metric.unit})`} />
      </div>
      <div ref={ref} className="w-full h-[280px] mt-2" />
    </div>
  )
}
