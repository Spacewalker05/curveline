import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import type { MetricKey, Metrics } from './api'
import { ExpandButton } from './Expand'
import { card, cv, minorTicks, paperAxis, sectionLabel } from './ui'

type Dir = 'reverse' | 'forward'
type Col = { label: string; scans: { name: Dir; m: Metrics }[] }
type Metric = { key: MetricKey; label: string; unit: string }

const INK = '#171717'
const DIR_STYLE: Record<Dir, { name: string; color: string }> = {
  forward: { name: 'Forward', color: '#c0392b' },
  reverse: { name: 'Reverse', color: '#4a4a4a' },
}

export const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
/** Sample standard deviation (n − 1). Returns 0 for fewer than two values. */
export const std = (values: number[]) => {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
}

/** Deterministic pseudo-random horizontal offset in [-amp, amp]. */
const jitter = (index: number, seed: number, amp: number) => {
  const value = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453
  return (value - Math.floor(value) - 0.5) * 2 * amp
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
    const groups = groupValues(columns, metric.key)
    const dirs = (['forward', 'reverse'] as const).filter((d) => groups.some((g) => g[d].length))
    const offset = dirs.length > 1 ? 0.17 : 0
    const traces: any[] = []

    dirs.forEach((dir, di) => {
      const { name, color } = DIR_STYLE[dir]
      const shift = dirs.length > 1 ? (di === 0 ? -offset : offset) : 0
      const xs: number[] = []
      const ys: number[] = []
      const text: string[] = []
      groups.forEach((g, gi) => {
        const vals = g[dir]
        const amp = vals.length > 1 ? 0.07 : 0
        vals.forEach((v, vi) => {
          xs.push(gi + shift + jitter(vi, gi * 2 + di, amp))
          ys.push(v)
          text.push(g.label)
        })
        if (vals.length >= 2) {
          const m = mean(vals)
          traces.push({ type: 'scatter', mode: 'lines', x: [gi + shift - 0.11, gi + shift + 0.11], y: [m, m], line: { color: INK, width: 1.4 }, hoverinfo: 'skip', showlegend: false })
          traces.push({ type: 'scatter', mode: 'markers', x: [gi + shift], y: [m], marker: { size: 1, opacity: 0 }, error_y: { type: 'data', array: [std(vals)], color: INK, thickness: 1, width: 5 }, hovertemplate: `${name} mean %{y:.4g} ± ${std(vals).toPrecision(3)}<extra></extra>`, showlegend: false })
        }
      })
      traces.push({
        type: 'scatter', mode: 'markers', name, x: xs, y: ys, text,
        marker: { symbol: 'diamond', color, size: 9, line: { color: INK, width: 0.6 } },
        hovertemplate: `<b>%{text}</b><br>${name}: %{y:.4g} ${metric.unit}<extra></extra>`,
        showlegend: dirs.length > 1,
      })
    })

    const n = Math.max(groups.length, 1)
    Plotly.react(
      ref.current,
      traces,
      {
        paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff', margin: { l: 70, r: 18, t: 18, b: groups.some((g) => g.label.includes(' · ')) ? 68 : 50 },
        font: { family: 'Arial, Helvetica, sans-serif', color: INK },
        showlegend: dirs.length > 1,
        legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom', font: { size: 12, color: INK }, bgcolor: 'rgba(0,0,0,0)' },
        xaxis: { ...paperAxis(INK, INK), mirror: 'allticks', ticks: 'inside', ticklen: 6, tickwidth: 1.4, linewidth: 1.4, tickmode: 'array', tickvals: groups.map((_, i) => i), ticktext: groups.map((g) => wrapLabel(g.label)), tickangle: 0, range: [-0.6, n - 0.4], showgrid: false, tickfont: { family: 'Arial, Helvetica, sans-serif', size: 12, color: INK } },
        yaxis: { ...paperAxis(INK, INK), mirror: 'allticks', ticks: 'inside', ticklen: 6, tickwidth: 1.4, linewidth: 1.4, showgrid: false, minor: minorTicks(INK), tickfont: { family: 'Arial, Helvetica, sans-serif', size: 12, color: INK }, title: { text: `${metric.label} (${metric.unit})`, font: { size: 15, color: INK } } },
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
      <div ref={ref} className="w-full h-[300px] mt-2" />
    </div>
  )
}
