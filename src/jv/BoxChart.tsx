// @ts-nocheck — ported verbatim from curveline (written for a looser TS config)
import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-cartesian-dist-min'
import type { MetricKey, Metrics } from './api'
import { ExpandButton } from './Expand'
import { card, cv, minorTicks, paperAxis, sectionLabel } from './ui'

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
    const line = cv('--c-line')
    const muted = cv('--c-muted')
    const ink = cv('--c-fg')
    const surface = cv('--c-surface')
    const traces = (['reverse', 'forward'] as const).map((dir) => {
      const values = columns.flatMap((column) => column.scans
        .filter((scan) => scan.name === dir && valid(scan.m[metric.key]))
        .map((scan) => ({ y: scan.m[metric.key], label: column.label })))
      const color = cv(dir === 'reverse' ? '--c-accent' : '--c-plot-parameter-forward')
      return {
        type: 'box', name: DIR_STYLE[dir].name,
        y: values.map((value) => value.y), text: values.map((value) => value.label),
        boxpoints: 'all', jitter: 0.5, pointpos: 0, boxmean: true,
        line: { color, width: 1.5 },
        fillcolor: cv(dir === 'reverse' ? '--c-plot-parameter-reverse-fill' : '--c-plot-parameter-forward-fill'),
        marker: { color, size: 7, opacity: 0.9, line: { color: surface, width: 1 } },
        hovertemplate: `<b>%{text}</b><br>%{y:.4g} ${metric.unit}<extra></extra>`,
      }
    }).filter((trace) => trace.y.length)
    Plotly.react(ref.current, traces, {
      paper_bgcolor: cv('--c-plot-transparent'), plot_bgcolor: cv('--c-plot-transparent'),
      margin: { l: 56, r: 16, t: 12, b: 36 },
      font: { family: 'Inter', color: muted }, showlegend: false,
      xaxis: { ...paperAxis(ink, muted), showgrid: false, ticks: '', tickfont: { size: 12, color: ink } },
      yaxis: { ...paperAxis(ink, muted), showgrid: false, minor: minorTicks(ink) },
      hoverlabel: { bgcolor: cv('--c-panel'), bordercolor: line, font: { family: 'JetBrains Mono', size: 12, color: ink } },
    }, { displaylogo: false, responsive: true, displayModeBar: false })
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
