import { useEffect, useMemo, useRef, useState } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import { Button } from '@/components/ui/button'
import type { Scan } from './core'
import { inspectFiles, type InspectFile } from './api'
import { ExpandButton } from './Expand'
import { plotImageName } from './plot-export'
import { card, cv, DropZone, Field, FileChips, gridStyle, minorTicks, paperAxis, pixelColor, Section, sectionLabel, Shell, Toggle, tr } from './ui'

const flip = (s: Scan | undefined, invert: boolean) => (s && invert ? { V: s.V, I: s.I.map((i) => -i) } : s)

function LineChart({ title, yLabel, filename, scans, yOf, dark, grid, positive = false }: { title: string; yLabel: string; filename: string; scans: { name: string; s: Scan; color: string }[]; yOf: (i: number, s: Scan) => number; dark: boolean; grid: boolean; positive?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ink = cv('--c-plot-ink'), paper = cv('--c-plot-paper')
    const font = { family: 'Arial, sans-serif', size: 14, color: ink }
    const g = gridStyle(grid)
    const axis = (t: string) => ({
      ...paperAxis(ink, ink), mirror: 'allticks', ticks: 'inside', ticklen: 8, tickwidth: 1.5, linewidth: 1.5, ...g.major,
      minor: { ...minorTicks(ink), ...g.minor, nticks: 5 }, zeroline: true, zerolinecolor: cv('--c-dim'), zerolinewidth: 1,
      tickfont: font, title: { text: t, font: { ...font, size: 16 }, standoff: 10 },
    })
    Plotly.react(
      el,
      scans.map(({ name, s, color }) => ({
        type: 'scatter', mode: 'lines', name, x: s.V, y: s.I.map((i) => yOf(i, s)), line: { color, width: 2 },
        hovertemplate: `${name}<br>V = %{x:.4f} V<br>${yLabel.split(' (')[0]} = %{y:.4f}<extra></extra>`,
      })),
      {
        paper_bgcolor: paper, plot_bgcolor: paper, font, height: 420, margin: { l: 72, r: 24, t: 20, b: 60 },
        xaxis: { ...axis('Voltage (V)'), ...(positive ? { rangemode: 'nonnegative' } : {}) },
        yaxis: { ...axis(yLabel), ...(positive ? { range: [0, Math.max(1, ...scans.flatMap(({ s }) => s.I.map((i) => yOf(i, s)))) * 1.08] } : {}) },
        hovermode: 'closest', dragmode: 'zoom', showlegend: false,
      },
      { displaylogo: false, displayModeBar: false, responsive: true, scrollZoom: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'], toImageButtonOptions: { filename, scale: 3 } },
    )
  }, [scans, yOf, yLabel, title, filename, dark, grid, positive])
  useEffect(() => () => { if (ref.current) Plotly.purge(ref.current) }, [])
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <div className={sectionLabel}>{title}</div>
        <ExpandButton getEl={() => ref.current} title={title} />
      </div>
      <div ref={ref} data-image-name={filename} className="rounded-lg overflow-hidden" />
    </div>
  )
}

export default function Inspect({ onBack, dark, setDark }: { onBack: () => void; dark: boolean; setDark: (v: boolean) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [loaded, setLoaded] = useState<InspectFile[]>([])
  const [fi, setFi] = useState(0)
  const [pi, setPi] = useState(0)
  const [area, setArea] = useState('0.1')
  const [invert, setInvert] = useState(false)
  const [allPixels, setAllPixels] = useState(true)
  const [grid, setGrid] = useState(false)
  const [compare, setCompare] = useState(false)
  const [ci, setCi] = useState(1)

  useEffect(() => {
    let live = true
    if (!files.length) { setLoaded([]); return }
    inspectFiles(files, 10)
      .then((r) => live && setLoaded(r))
      .catch((e) => live && setLoaded(files.map((f) => ({ name: f.name, pixels: [], error: e?.message ?? 'Could not read file' }))))
    return () => { live = false }
  }, [files])

  const cur = loaded[Math.min(fi, loaded.length - 1)]
  const pairs = cur?.pixels ?? []
  const pair = pairs[Math.min(pi, pairs.length - 1)]
  const canCompare = loaded.length >= 2
  const cmpIdx = canCompare ? (ci === fi || ci >= loaded.length ? (fi === 0 ? 1 : 0) : ci) : -1
  const other = compare && cmpIdx >= 0 ? loaded[cmpIdx] : undefined
  const err = cur?.error ?? (cur && !pairs.length ? 'No voltage / current columns found in this file.' : '')

  const colors = useMemo(() => pairs.map((_, i) => pixelColor(i, pairs.length)), [pairs, dark])
  const fileColors = useMemo(() => [cv('--c-plot-ink'), cv('--c-plot-forward')], [dark])
  const stem = (n: string) => n.replace(/\.[^.]+$/, '')

  const scans = useMemo(() => {
    if (!pair) return []
    const out: { name: string; s: Scan; color: string }[] = []
    const add = (p: typeof pair, color: string, filePrefix: string) => {
      const prefix = `${filePrefix}${p.label ? `${p.label} · ` : ''}`
      const f = flip(p.forward, invert), r = flip(p.reverse, invert), s1 = flip(p.single, invert)
      if (f) out.push({ name: `${prefix}Forward`, s: f, color })
      if (r) out.push({ name: `${prefix}Reverse`, s: r, color })
      if (s1) out.push({ name: `${prefix}Scan`, s: s1, color })
    }
    if (other && cur) {
      // Compare mode: colour by sample so the two files read apart at a glance.
      const sets: [InspectFile, string][] = [[cur, fileColors[0] ?? ''], [other, fileColors[1] ?? '']]
      for (const [file, color] of sets) {
        const px = file.pixels ?? []
        const match = px.find((p) => p.label === pair.label) ?? px[Math.min(pi, px.length - 1)]
        const chosen = allPixels ? px : match ? [match] : []
        for (const p of chosen) add(p, color, `${stem(file.name)} · `)
      }
      return out
    }
    for (const p of allPixels ? pairs : [pair]) add(p, colors[pairs.indexOf(p)] ?? cv('--c-plot-ink'), '')
    return out
  }, [pair, pairs, allPixels, invert, dark, colors, other, cur, fileColors, pi])

  const a = parseFloat(area)
  const toMa = useMemo(() => (i: number) => i * 1000, [])
  // Orient the whole scan using current nearest V=0, preserving its zero crossing.
  // Pointwise modulus would incorrectly fold the post-Voc tail upward.
  const toJ = useMemo(() => (i: number, s: Scan) => {
    const nearZero = s.V.reduce((best, v, k) => Math.abs(v) < Math.abs(s.V[best] ?? Infinity) ? k : best, 0)
    const polarity = (s.I[nearZero] ?? 0) < 0 ? -1 : 1
    return polarity * (i / a) * 1000
  }, [a])
  const pixPart = allPixels && pairs.length > 1 ? ' · All pixels' : pair?.label ? ` · ${pair.label}` : ''
  const label = cur ? (other ? `${stem(cur.name)} vs ${stem(other.name)}${pixPart}` : `${stem(cur.name)}${pixPart}`) : ''
  const imgFile = other ? `${stem(cur?.name ?? '')}_vs_${other.name}` : cur?.name ?? ''

  const pill = (on: boolean) => `inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer ${tr} ${on ? 'bg-accent border-accent text-on-accent' : 'border-line text-fg hover:border-accent'}`

  const sidebar = (
    <>
      <div className={sectionLabel}>Scan Files</div>
      <div className="mt-3">
        <DropZone accept=".txt,.csv,.dat,.xlsx,.xls" label="Drop J–V text files" onFiles={(f) => setFiles((x) => [...x, ...f.filter((n) => !x.some((o) => o.name === n.name))])} />
        <FileChips names={files.map((f) => f.name)} onRemove={(i) => { setFiles((x) => x.filter((_, k) => k !== i)); setFi(0); setPi(0) }} />
      </div>
      <Section title="Device" />
      <Field label="Active area" unit="cm²" value={area} onChange={setArea} />
      <div className="mt-3">
        <Toggle on={allPixels} onChange={setAllPixels} label="All pixels" />
        <Toggle on={invert} onChange={setInvert} label="Invert current sign" />
        <Toggle on={grid} onChange={setGrid} label="Grid lines" sub="Major lines solid, minor lines faint" />
        <Toggle on={compare && canCompare} onChange={setCompare} label="Compare two files" sub={canCompare ? 'Overlay I–V and J–V of two samples' : 'Add a second file to compare'} />
      </div>
    </>
  )

  return (
    <Shell crumb="Inspect" dark={dark} setDark={setDark} onBack={onBack} sidebar={sidebar}
      action={<div className="text-xs text-dim text-center">Charts update as you change files and settings.</div>}
      status={<>{loaded.length ? `${loaded.length} file(s) loaded` : 'No files'}</>}>
      <div className="p-6 lg:p-8 space-y-5 max-w-[1100px] w-full mx-auto">
        {!loaded.length ? (
          <div className="min-h-[420px] grid place-items-center text-center">
            <div>
              <div className="text-lg font-semibold">Inspect J–V scans</div>
              <p className="text-sm text-muted mt-2 max-w-[420px]">Add a scan file to see forward and reverse sweeps as current–voltage and Jsc–voltage line plots.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {loaded.map((l, i) => <Button variant="ghost" key={l.name} onClick={() => { setFi(i); setPi(0) }} className={pill(i === fi)}>{other && i === fi && <span className="w-2 h-2 rounded-full" style={{ background: fileColors[0] }} />}{l.name}</Button>)}
            </div>
            {other && (
              <div className={`${card} p-4`}>
                <div className={`${sectionLabel} mb-3`}>Compare with</div>
                <div className="flex flex-wrap gap-2">
                  {loaded.map((l, i) => i === fi ? null : (
                    <Button variant="ghost" key={l.name} onClick={() => setCi(i)} className={pill(i === cmpIdx)}>
                      {i === cmpIdx && <span className="w-2 h-2 rounded-full" style={{ background: fileColors[1] }} />}{l.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {pairs.length > 1 && (
              <div className={`${card} p-4`}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className={sectionLabel}>Pixels</div>
                  <div className="text-[11px] text-dim">Hover a line to see its pixel and sweep</div>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[116px] overflow-y-auto scroll-quiet pr-1">
                  <Button variant="ghost" onClick={() => setAllPixels(true)} className={pill(allPixels)}>All</Button>
                  {pairs.map((p, i) => (
                    <Button variant="ghost" key={p.label} onClick={() => { setAllPixels(false); setPi(i) }} className={pill(!allPixels && i === pi)}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[i] }} />
                      {p.label || `Pixel ${i + 1}`}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {err ? (
              <div className={`${card} p-5 text-sm text-bad`}>{err}</div>
            ) : (
              <>
                <LineChart title={`Current vs Voltage — ${label}`} yLabel="Current (mA)" filename={plotImageName('current', imgFile, allPixels ? undefined : pair?.label)} scans={scans} yOf={toMa} dark={dark} grid={grid} />
                {a > 0 ? (
                  <LineChart title={`Current density vs Voltage — ${label}`} yLabel="Current Density (mA/cm²)" filename={plotImageName('jsc', imgFile, allPixels ? undefined : pair?.label)} scans={scans} yOf={toJ} dark={dark} grid={grid} positive />
                ) : (
                  <div className={`${card} p-5 text-sm text-muted`}>Enter an active area to show the J–V plot.</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Shell>
  )
}
