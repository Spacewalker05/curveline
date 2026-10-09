import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import type { MetricKey, Metrics } from './api'
import { card, cv, sectionLabel } from './ui'

type Col = { label: string; scans: { name: 'reverse' | 'forward'; m: Metrics }[] }
type Metric = { key: MetricKey; label: string; unit: string }

export default function BoxChart({ metric, columns, dark }: { metric: Metric; columns: Col[]; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const line = cv('--c-line')
    const muted = cv('--c-muted')
    const fg = cv('--c-fg')
    const surface = cv('--c-surface')
    const traces = (['reverse', 'forward'] as const)
      .map((dir, i) => {
        const pts = columns.flatMap((c) => c.scans.filter((s) => s.name === dir).map((s) => ({ y: s.m[metric.key], label: c.label }))).filter((p): p is { y: number; label: string } => typeof p.y === 'number' && isFinite(p.y))
        const color = i === 0 ? cv('--c-accent') : '#6a8caf'
        return {
          type: 'box', name: dir === 'reverse' ? 'Reverse' : 'Forward', y: pts.map((p) => p.y), text: pts.map((p) => p.label),
          boxpoints: 'all', jitter: 0.5, pointpos: 0, boxmean: true,
          line: { color, width: 1.5 }, fillcolor: color + '26',
          marker: { color, size: 7, opacity: 0.9, line: { color: surface, width: 1 } },
          hovertemplate: '<b>%{text}</b><br>%{y:.4g}<extra></extra>', n: pts.length,
        }
      })
      .filter((t) => t.y.length)
    Plotly.react(
      ref.current,
      traces,
      {
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', margin: { l: 56, r: 16, t: 12, b: 36 },
        font: { family: 'Inter', color: muted }, showlegend: false,
        xaxis: { showgrid: false, linecolor: line, tickfont: { size: 12, color: fg } },
        yaxis: { gridcolor: line, zerolinecolor: line, linecolor: line, tickfont: { family: 'JetBrains Mono', size: 11, color: muted } },
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
      <div className={sectionLabel}>
        {metric.label} <span className="normal-case tracking-normal text-dim">({metric.unit})</span>
      </div>
      <div ref={ref} className="w-full h-[280px] mt-2" />
    </div>
  )
}
