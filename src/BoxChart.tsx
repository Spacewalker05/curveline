import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import type { MetricKey, Metrics } from './api'
import { ExpandButton } from './Expand'
import { card, cv, minorTicks, paperAxis, sectionLabel } from './ui'
import './parameter-chart.css'

type Dir = 'reverse' | 'forward'
type Col = { label: string; scans: { name: Dir; m: Metrics }[] }
type Metric = { key: MetricKey; label: string; unit: string }

const DIR_STYLE: Record<Dir, { name: string; token: string }> = {
  forward: { name: 'Forward', token: '--c-plot-forward' },
  reverse: { name: 'Reverse', token: '--c-plot-reverse' },
}

export const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
/** Sample standard deviation (n − 1). Returns 0 for fewer than two values. */
export const std = (values: number[]) => {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
}

const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Groups valid values per category and direction. Missing/non-finite measurements are dropped. */
export function groupValues(columns: Col[], key: MetricKey) {
  return columns.map((c) => {
    const out: Record<Dir, number[]> = { forward: [], reverse: [] }
    c.scans.forEach((s) => {
      const v = s.m[key]
      if (valid(v)) out[s.name].push(v)
    })
    return { label: c.label, ...out }
  })
}

const wrapLabel = (label: string) => label.replace(/ · /g, '<br>')

export default function BoxChart({ metric, columns, dark }: { metric: Metric; columns: Col[]; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const ink = cv('--c-plot-ink')
    const paper = cv('--c-plot-paper')
    const groups = groupValues(columns, metric.key)
    const dirs = (['forward', 'reverse'] as const).filter((d) => groups.some((g) => g[d].length))
    const offset = dirs.length > 1 ? 0.17 : 0
    const traces: any[] = []

    dirs.forEach((dir, di) => {
      const { name, token } = DIR_STYLE[dir]
      const color = cv(token)
      const shift = dirs.length > 1 ? (di === 0 ? -offset : offset) : 0
      const xs: number[] = []
      const ys: number[] = []
      const text: string[] = []
      const errors: number[] = []
      const counts: number[] = []
      groups.forEach((g, gi) => {
        const vals = g[dir]
        if (!vals.length) return
        xs.push(gi + shift)
        ys.push(mean(vals))
        text.push(g.label)
        errors.push(std(vals))
        counts.push(vals.length)
      })
      traces.push({
        type: 'bar', name, x: xs, y: ys, text, customdata: counts,
        width: dirs.length > 1 ? 0.28 : 0.48,
        marker: { color, line: { color: ink, width: 0.6 } },
        error_y: { type: 'data', array: errors, visible: counts.some((n) => n >= 2), color: ink, thickness: 1.2, width: 6 },
        hovertemplate: `<b>%{text}</b><br>${name}: %{y:.4g} ${metric.unit}<br>n = %{customdata}<extra></extra>`,
        showlegend: dirs.length > 1,
      })
    })

    const n = Math.max(groups.length, 1)
    Plotly.react(
      ref.current,
      traces,
      {
        paper_bgcolor: paper, plot_bgcolor: paper, barmode: 'overlay', margin: { l: 84, r: 28, t: 48, b: groups.some((g) => g.label.includes(' · ')) ? 84 : 64 },
        font: { family: 'Arial, sans-serif', color: ink },
        showlegend: dirs.length > 1,
        legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom', font: { size: 12, color: ink } },
        xaxis: { ...paperAxis(ink, ink), mirror: 'allticks', ticks: 'inside', ticklen: 8, tickwidth: 1.5, linewidth: 1.5, tickmode: 'array', tickvals: groups.map((_, i) => i), ticktext: groups.map((g) => wrapLabel(g.label)), tickangle: 0, range: [-0.6, n - 0.4], showgrid: false, tickfont: { family: 'Arial, sans-serif', size: 14, color: ink } },
        yaxis: { ...paperAxis(ink, ink), mirror: 'allticks', ticks: 'inside', ticklen: 8, tickwidth: 1.5, linewidth: 1.5, showgrid: false, minor: minorTicks(ink), rangemode: 'tozero', tickfont: { family: 'Arial, sans-serif', size: 14, color: ink }, title: { text: `${metric.label} (${metric.unit})`, font: { family: 'Arial, sans-serif', size: 17, color: ink }, standoff: 12 } },
        hoverlabel: { bgcolor: cv('--c-panel'), bordercolor: cv('--c-line'), font: { family: 'JetBrains Mono', size: 12, color: cv('--c-fg') } },
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
      <div className="overflow-x-auto mt-2">
        <div ref={ref} className="w-full h-[400px] min-w-[420px]" />
      </div>
    </div>
  )
}
