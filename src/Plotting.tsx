import { useEffect, useMemo, useRef, useState } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import readExcelFile from 'read-excel-file/browser'
import { card, Check, cv, DropZone, FileChips, primaryBtn, Section, sectionLabel, Shell, Toggle, tr } from './ui'

type Series = { sample: string; labels: string[]; fwd: (number | null)[]; rev: (number | null)[] | null }
type Block = { param: string; series: Series[] }
type Dataset = { file: string; labels: string[]; cols: Record<string, (number | null)[]>; blocks: Block[] }
type Opts = { meanLine: boolean; errBars: boolean; grid: boolean; size: number }

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
const std = (a: number[]) => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1))
}
const safe = (s: string) => s.replace(/[^\w.-]+/g, '_')

const DIR = /(?:[\s_-]+|\s*[([])\s*(fwd|forward|rev|reverse)\s*[)\]]?\s*$/i
function splitDir(h: string): { base: string; dir: 'fwd' | 'rev' | null } {
  const m = h.match(DIR)
  const base = m ? h.slice(0, m.index).trim() : h
  if (!m || !base) return { base: h, dir: null }
  return { base, dir: /^f/i.test(m[1]) ? 'fwd' : 'rev' }
}

async function parseWorkbook(file: File): Promise<Dataset> {
  const res: any = await readExcelFile(file)
  const rows: any[][] = (Array.isArray(res) && res[0] && 'data' in res[0] ? res[0].data : res) as any[][]
  const clean = rows.filter((r) => r.some((c) => c !== null && c !== undefined && c !== ''))
  if (clean.length < 2) throw new Error(`${file.name}: no data rows found`)
  const headers = clean[0].map((h, i) => (h === null || h === undefined || h === '' ? `Column ${i + 1}` : String(h).trim()))
  const body = clean.slice(1)
  const isNum = (v: any) => typeof v === 'number' && isFinite(v)
  const numeric = headers.map((_, c) => {
    const vals = body.map((r) => r[c]).filter((v) => v !== null && v !== undefined && v !== '')
    return vals.length > 0 && vals.filter(isNum).length / vals.length >= 0.6
  })
  const col = (c: number) => body.map((r) => (isNum(r[c]) ? (r[c] as number) : null))
  const trim = (a: (number | null)[]) => {
    let n = a.length
    while (n > 0 && a[n - 1] === null) n--
    return a.slice(0, n)
  }
  const name = file.name.replace(/\.xlsx?$/i, '')
  const dirs = headers.map(splitDir)

  // Layout B: top-left cell names the parameter, each column is a sample's forward or reverse values, rows are pixels
  const firstEmpty = body.every((r) => r[0] === null || r[0] === undefined || r[0] === '')
  if (firstEmpty && dirs.slice(1).some((d) => d.dir)) {
    const order: string[] = []
    const map: Record<string, { fwd?: (number | null)[]; rev?: (number | null)[] }> = {}
    headers.forEach((h, c) => {
      if (c === 0 || !numeric[c]) return
      const { base, dir } = dirs[c]
      if (!map[base]) {
        map[base] = {}
        order.push(base)
      }
      map[base][dir === 'rev' ? 'rev' : 'fwd'] = col(c)
    })
    const series: Series[] = order.map((sample) => {
      const f = map[sample].fwd ?? []
      const r = map[sample].rev ?? null
      const n = Math.max(trim(f).length, r ? trim(r).length : 0)
      return { sample, labels: Array.from({ length: n }, (_, i) => `P${i + 1}`), fwd: f.slice(0, n), rev: r ? r.slice(0, n) : null }
    })
    if (!series.length) throw new Error(`${file.name}: no numeric columns found`)
    return { file: name, labels: [], cols: {}, blocks: [{ param: headers[0], series }] }
  }

  // Layout A: one row per pixel/sample, columns are parameters (optionally split into forward / reverse)
  const labelCol = numeric[0] ? -1 : 0
  const labels = body.map((r, i) => (labelCol >= 0 && r[labelCol] != null && r[labelCol] !== '' ? String(r[labelCol]) : `S${i + 1}`))
  const cols: Dataset['cols'] = {}
  const pairs: Record<string, { fwd?: number; rev?: number }> = {}
  const pairOrder: string[] = []
  headers.forEach((h, c) => {
    if (!numeric[c] || c === labelCol) return
    const { base, dir } = dirs[c]
    if (dir) {
      if (!pairs[base]) {
        pairs[base] = {}
        pairOrder.push(base)
      }
      pairs[base][dir] = c
    } else cols[h] = col(c)
  })
  const blocks: Block[] = []
  pairOrder.forEach((base) => {
    const p = pairs[base]
    if (p.fwd !== undefined && p.rev !== undefined) blocks.push({ param: base, series: [{ sample: name, labels, fwd: col(p.fwd), rev: col(p.rev) }] })
    else {
      const c = (p.fwd ?? p.rev) as number
      cols[headers[c]] = col(c)
    }
  })
  if (!Object.keys(cols).length && !blocks.length) throw new Error(`${file.name}: no numeric columns found`)
  return { file: name, labels, cols, blocks }
}

const seriesColors = () => [cv('--c-accent'), '#6a8caf', '#8a9a5b', '#9b7bb4', '#c9a227', cv('--c-muted')]

function jitter(i: number, n: number) {
  const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453
  return (x - Math.floor(x) - 0.5) * 0.5
}

// One figure, one panel per parameter. 'file': x = samples. 'combined': x = files.
function FigurePlot({ title, subtitle, sets, mode, opts, dark }: { title: string; subtitle: string; sets: Dataset[]; mode: 'file' | 'combined'; opts: Opts; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const params = useMemo(() => Array.from(new Set(sets.flatMap((d) => Object.keys(d.cols)))), [sets])
  const nPts = useMemo(() => sets.reduce((s, d) => s + d.labels.length, 0), [sets])
  const width = Math.max(1400, params.length * 560)

  useEffect(() => {
    if (!ref.current) return
    const line = cv('--c-line')
    const muted = cv('--c-muted')
    const fg = cv('--c-fg')
    const surface = cv('--c-surface')
    const colors = seriesColors()
    const n = params.length
    const gap = 0.05
    const traces: any[] = []
    const layout: any = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      margin: { l: 56, r: 24, t: 64, b: 84 },
      font: { family: 'Inter', color: muted },
      showlegend: mode === 'combined',
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.14, font: { size: 11, color: fg } },
      hoverlabel: { bgcolor: cv('--c-panel'), bordercolor: line, font: { family: 'JetBrains Mono', size: 12, color: fg } },
      annotations: [],
    }
    const ax = { zerolinecolor: line, linecolor: line, tickfont: { family: 'JetBrains Mono', size: 11, color: muted } }

    params.forEach((p, k) => {
      const sfx = k === 0 ? '' : String(k + 1)
      const d0 = k / n + (k === 0 ? 0 : gap / 2)
      const d1 = (k + 1) / n - (k === n - 1 ? 0 : gap / 2)
      const groups = sets.filter((d) => d.cols[p])
      const ticks: { v: number; t: string }[] = []
      groups.forEach((d, gi) => {
        const col = colors[(mode === 'combined' ? sets.indexOf(d) : 0) % colors.length]
        const idx = d.cols[p].map((y, i) => ({ y, i })).filter((q): q is { y: number; i: number } => q.y !== null)
        if (!idx.length) return
        const vals = idx.map((q) => q.y)
        const m = mean(vals)
        const base = { type: 'scatter', xaxis: 'x' + sfx, yaxis: 'y' + sfx }
        const marker = { size: opts.size, color: col, opacity: 0.9, line: { color: surface, width: 1.5 } }
        if (mode === 'file') {
          idx.forEach((q) => ticks.push({ v: q.i, t: d.labels[q.i] }))
          traces.push({ ...base, mode: 'markers', x: idx.map((q) => q.i), y: vals, text: idx.map((q) => d.labels[q.i]), marker, hovertemplate: '<b>%{text}</b><br>%{y:.4g}<extra>' + p + '</extra>', showlegend: false })
          if (opts.meanLine) traces.push({ ...base, mode: 'lines', x: [-0.6, d.labels.length - 0.4], y: [m, m], line: { color: col, width: 1.25, dash: 'dash' }, hoverinfo: 'skip', showlegend: false })
        } else {
          ticks.push({ v: gi, t: d.file })
          traces.push({ ...base, mode: 'markers', x: idx.map((q) => gi + jitter(q.i, gi)), y: vals, text: idx.map((q) => d.labels[q.i]), name: d.file, legendgroup: d.file, marker, hovertemplate: '<b>%{text}</b><br>' + d.file + '<br>%{y:.4g}<extra>' + p + '</extra>', showlegend: k === 0 })
          if (opts.meanLine) traces.push({ ...base, mode: 'lines', x: [gi - 0.34, gi + 0.34], y: [m, m], line: { color: fg, width: 2.5 }, hoverinfo: 'skip', showlegend: false })
          if (opts.errBars) traces.push({ ...base, mode: 'markers', x: [gi], y: [m], marker: { size: 1, opacity: 0, color: fg }, error_y: { type: 'data', array: [std(vals)], color: fg, thickness: 1.5, width: 8 }, hoverinfo: 'skip', showlegend: false })
        }
      })
      const count = mode === 'file' ? Math.max(...groups.map((d) => d.labels.length)) : groups.length
      const uniq = ticks.filter((t, i, arr) => arr.findIndex((u) => u.v === t.v) === i)
      layout['xaxis' + sfx] = { ...ax, domain: [d0, d1], anchor: 'y' + sfx, showgrid: false, tickmode: 'array', tickvals: uniq.map((t) => t.v), ticktext: uniq.map((t) => t.t), tickangle: uniq.length > 4 || mode === 'file' ? -35 : 0, range: [-0.6, count - 0.4] }
      layout['yaxis' + sfx] = { ...ax, domain: [0, 1], anchor: 'x' + sfx, showgrid: opts.grid, gridcolor: line }
      layout.annotations.push({ text: p, xref: 'paper', yref: 'paper', x: (d0 + d1) / 2, y: 1.02, xanchor: 'center', yanchor: 'bottom', showarrow: false, font: { size: 12, color: muted } })
    })
    Plotly.react(ref.current, traces, layout, { displaylogo: false, responsive: true, displayModeBar: false })
  }, [sets, params, mode, opts, dark])

  useEffect(() => {
    const el = ref.current
    return () => {
      if (el) Plotly.purge(el)
    }
  }, [])

  const png = async () => {
    const bg = cv('--c-surface')
    await Plotly.relayout(ref.current, { paper_bgcolor: bg, plot_bgcolor: bg })
    await Plotly.downloadImage(ref.current, { format: 'png', width, height: 800, scale: 2, filename: safe(title) })
    await Plotly.relayout(ref.current, { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' })
  }

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <div className={sectionLabel}>{title}</div>
          <div className="text-xs text-dim mt-1">
            {subtitle} · {nPts} samples · {params.length} parameter{params.length === 1 ? '' : 's'}
          </div>
        </div>
        <PngButton onClick={png} />
      </div>
      <div ref={ref} data-plot={safe(title)} data-w={width} className="w-full h-[400px]" />
    </div>
  )
}


function PngButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className={`h-8 px-3.5 rounded-lg border border-line text-xs font-medium text-fg flex items-center gap-2 cursor-pointer hover:border-accent hover:text-accent hover:scale-[1.02] ${tr}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4v11m0 0l-4-4m4 4l4-4M4 19h16" />
      </svg>
      PNG
    </button>
  )
}

type Kind = 'fwd' | 'rev' | 'both'
const KIND_LABEL: Record<Kind, string> = { fwd: 'Forward', rev: 'Reverse', both: 'Forward + Reverse' }

function PairedFigure({ file, block, kind, opts, dark }: { file: string; block: Block; kind: Kind; opts: Opts; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const title = `${file} · ${block.param} · ${KIND_LABEL[kind]}`
  const multi = block.series.length > 1

  const entries = useMemo(() => {
    const out: { x: number; y: number; dir: 'fwd' | 'rev'; label: string; si: number }[] = []
    let pos = 0
    block.series.forEach((s, si) => {
      const n = Math.max(s.fwd.length, s.rev?.length ?? 0)
      for (let i = 0; i < n; i++) {
        const name = multi ? `${s.sample} ${s.labels[i]}` : s.labels[i]
        const f = s.fwd[i] ?? null
        const r = s.rev ? (s.rev[i] ?? null) : null
        if (kind !== 'rev' && f !== null) out.push({ x: pos++, y: f, dir: 'fwd', label: name, si })
        if (kind !== 'fwd' && r !== null) out.push({ x: pos++, y: r, dir: 'rev', label: name, si })
      }
    })
    return out
  }, [block, kind, multi])

  const width = Math.min(4000, Math.max(1400, entries.length * 22))

  useEffect(() => {
    if (!ref.current) return
    const line = cv('--c-line')
    const muted = cv('--c-muted')
    const fg = cv('--c-fg')
    const surface = cv('--c-surface')
    const pal = seriesColors()
    const dirColor = { fwd: pal[0], rev: pal[1] }
    const splitSeries = multi && kind !== 'both'
    const groups = new Map<string, { name: string; color: string; pts: typeof entries }>()
    entries.forEach((e) => {
      const key = splitSeries ? `s${e.si}` : e.dir
      if (!groups.has(key)) groups.set(key, { name: splitSeries ? block.series[e.si].sample : e.dir === 'fwd' ? 'Forward' : 'Reverse', color: splitSeries ? pal[e.si % pal.length] : dirColor[e.dir], pts: [] })
      groups.get(key)!.pts.push(e)
    })
    const total = entries.length
    const traces: any[] = []
    groups.forEach((g) => {
      traces.push({
        type: 'scatter', mode: 'markers', name: g.name,
        x: g.pts.map((p) => p.x), y: g.pts.map((p) => p.y),
        text: g.pts.map((p) => (kind === 'both' ? `${p.label} ${p.dir}` : p.label)),
        marker: { size: opts.size, color: g.color, opacity: 0.9, line: { color: surface, width: 1.5 } },
        hovertemplate: '<b>%{text}</b><br>%{y:.4g}<extra>' + block.param + '</extra>',
      })
      if (opts.meanLine) {
        const m = mean(g.pts.map((p) => p.y))
        traces.push({ type: 'scatter', mode: 'lines', x: [g.pts[0].x - 0.5, g.pts[g.pts.length - 1].x + 0.5], y: [m, m], line: { color: g.color, width: 1.25, dash: 'dash' }, hoverinfo: 'skip', showlegend: false })
      }
    })
    const step = total <= 30 ? 1 : Math.ceil(total / 16)
    const ticks = entries.filter((_, i) => i % step === 0)
    Plotly.react(
      ref.current,
      traces,
      {
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { l: 60, r: 24, t: 64, b: 96 },
        font: { family: 'Inter', color: muted },
        showlegend: groups.size > 1,
        legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.14, font: { size: 11, color: fg } },
        hoverlabel: { bgcolor: cv('--c-panel'), bordercolor: line, font: { family: 'JetBrains Mono', size: 12, color: fg } },
        annotations: [{ text: block.param, xref: 'paper', yref: 'paper', x: 0, y: 1.02, xanchor: 'left', yanchor: 'bottom', showarrow: false, font: { size: 12, color: muted } }],
        xaxis: { showgrid: false, zerolinecolor: line, linecolor: line, tickfont: { family: 'JetBrains Mono', size: 11, color: muted }, tickmode: 'array', tickvals: ticks.map((t) => t.x), ticktext: ticks.map((t) => (kind === 'both' ? `${t.label} ${t.dir}` : t.label)), tickangle: -35, range: [-0.7, total - 0.3] },
        yaxis: { showgrid: opts.grid, gridcolor: line, zerolinecolor: line, linecolor: line, tickfont: { family: 'JetBrains Mono', size: 11, color: muted } },
      },
      { displaylogo: false, responsive: true, displayModeBar: false },
    )
  }, [entries, opts, dark, kind, multi, block])

  useEffect(() => {
    const el = ref.current
    return () => {
      if (el) Plotly.purge(el)
    }
  }, [])

  const png = async () => {
    const bg = cv('--c-surface')
    await Plotly.relayout(ref.current, { paper_bgcolor: bg, plot_bgcolor: bg })
    await Plotly.downloadImage(ref.current, { format: 'png', width, height: 800, scale: 2, filename: safe(title) })
    await Plotly.relayout(ref.current, { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' })
  }

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <div className={sectionLabel}>{title}</div>
          <div className="text-xs text-dim mt-1">
            {entries.length} points{multi ? ` · ${block.series.length} samples` : ''}
          </div>
        </div>
        <PngButton onClick={png} />
      </div>
      <div ref={ref} data-plot={safe(title)} data-w={width} className="w-full h-[400px]" />
    </div>
  )
}

export default function Plotting({ onBack, dark, setDark }: { onBack: () => void; dark: boolean; setDark: (v: boolean) => void }) {
  const [data, setData] = useState<Dataset[]>([])
  const [err, setErr] = useState('')
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [opts, setOpts] = useState<Opts>({ meanLine: true, errBars: true, grid: true, size: 10 })
  const set = (p: Partial<Opts>) => setOpts((o) => ({ ...o, ...p }))

  const allParams = useMemo(() => Array.from(new Set(data.flatMap((d) => [...d.blocks.map((b) => b.param), ...Object.keys(d.cols)]))), [data])
  const params = useMemo(() => (chosen ? allParams.filter((p) => chosen.includes(p)) : allParams), [chosen, allParams])
  const shown = useMemo(
    () => data.map((d) => ({ ...d, blocks: d.blocks.filter((b) => params.includes(b.param)), cols: Object.fromEntries(Object.entries(d.cols).filter(([k]) => params.includes(k))) })).filter((d) => d.blocks.length || Object.keys(d.cols).length),
    [data, params],
  )
  const plain = useMemo(() => shown.filter((d) => Object.keys(d.cols).length), [shown])

  const addFiles = async (incoming: File[]) => {
    const ok = incoming.filter((f) => /\.xlsx$/i.test(f.name))
    const errors: string[] = ok.length < incoming.length ? ['Only Excel .xlsx files are supported.'] : []
    const parsed: Dataset[] = []
    for (const f of ok) {
      try {
        parsed.push(await parseWorkbook(f))
      } catch (e: any) {
        errors.push(e?.message || `${f.name}: could not be read`)
      }
    }
    setErr(errors.join(' '))
    setData((d) => [...d.filter((x) => !parsed.some((p) => p.file === x.file)), ...parsed])
    setChosen(null)
  }

  const downloadAll = async () => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-plot]'))) {
      const bg = cv('--c-surface')
      await Plotly.relayout(el, { paper_bgcolor: bg, plot_bgcolor: bg })
      await Plotly.downloadImage(el, { format: 'png', width: +(el.dataset.w || 1400), height: 800, scale: 2, filename: el.dataset.plot || 'plot' })
      await Plotly.relayout(el, { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' })
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  const toggleParam = (p: string) => setChosen((c) => ((c ?? allParams).includes(p) ? (c ?? allParams).filter((x) => x !== p) : [...(c ?? allParams), p]))

  const sidebar = (
    <>
      <div className={sectionLabel}>Data Files</div>
      <div className="h-px bg-line mt-2 mb-3" />
      <DropZone accept=".xlsx" label="Drop Excel files (.xlsx)" onFiles={addFiles} />
      <FileChips
        names={data.map((d) => `${d.file}.xlsx`)}
        onRemove={(i) => {
          setData(data.filter((_, k) => k !== i))
          setChosen(null)
        }}
      />
      {err && <div className="text-xs text-bad mt-3">{err}</div>}

      {allParams.length > 0 && (
        <>
          <Section title="Parameters" />
          <div className="space-y-2.5">
            {allParams.map((p) => (
              <Check key={p} label={p} on={params.includes(p)} onChange={() => toggleParam(p)} />
            ))}
          </div>
        </>
      )}

      <Section title="Appearance" />
      <Toggle on={opts.meanLine} onChange={(v) => set({ meanLine: v })} label="Mean line" />
      <Toggle on={opts.errBars} onChange={(v) => set({ errBars: v })} label="± Std error bars" sub="Combined plot" />
      <Toggle on={opts.grid} onChange={(v) => set({ grid: v })} label="Grid" />
      <label className="block mt-3">
        <span className="flex justify-between text-xs font-medium text-muted mb-2">
          Marker size <span className="font-mono text-dim">{opts.size}</span>
        </span>
        <input type="range" min={5} max={18} value={opts.size} onChange={(e) => set({ size: +e.target.value })} className="w-full accent-[var(--c-accent)]" />
      </label>
    </>
  )

  return (
    <Shell
      crumb="Plotting"
      dark={dark}
      setDark={setDark}
      onBack={onBack}
      sidebar={sidebar}
      action={
        <button disabled={!shown.length} onClick={downloadAll} className={primaryBtn}>
          ↓ Download all as PNG
        </button>
      }
      status={
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-ok" />
          {data.length ? `${data.length} file${data.length > 1 ? 's' : ''} · ${params.length} parameter${params.length === 1 ? '' : 's'}` : 'Ready'}
        </>
      }
    >
      <div className="flex-1 p-6 lg:p-8">
        {!shown.length ? (
          <div className="h-full min-h-[420px] grid place-items-center">
            <div className="border border-dashed border-line bg-surface/60 rounded-2xl px-10 py-12 text-center max-w-md">
              <p className="text-muted text-sm">{data.length ? 'Select at least one parameter to plot' : 'No data yet — upload an Excel file to plot your samples'}</p>
              <div className="mt-6 text-left rounded-xl bg-bg border border-line overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-dim border-b border-line">Expected layout</div>
                <table className="w-full text-xs font-mono">
                  <tbody>
                    {[['Sample', 'Parameter 1', 'Parameter 2'], ['…', '…', '…'], ['…', '…', '…']].map((r, i) => (
                      <tr key={i} className={i === 0 ? 'text-accent' : 'text-dim border-t border-line'}>
                        {r.map((c, k) => (
                          <td key={k} className="px-3 py-1.5">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-dim mt-3">Header row, then one row per sample or pixel. Columns named “… Forward / Reverse” (or “S1(fwd)”, “S1(rev)”) are paired automatically.</p>
            </div>
          </div>
        ) : (
          <div className="max-w-[1100px] mx-auto space-y-5">
            {shown.map((d) => (
              <div key={d.file} className="space-y-5">
                {d.blocks.flatMap((b) => {
                  const paired = b.series.some((s) => s.rev)
                  return (paired ? (['fwd', 'rev', 'both'] as Kind[]) : (['fwd'] as Kind[])).map((k) => <PairedFigure key={`${b.param}-${k}`} file={d.file} block={b} kind={k} opts={opts} dark={dark} />)
                })}
                {Object.keys(d.cols).length > 0 && <FigurePlot title={d.file} subtitle="Single file" sets={[d]} mode="file" opts={opts} dark={dark} />}
              </div>
            ))}
            {plain.length > 1 && <FigurePlot title="All files combined" subtitle={`${plain.length} files`} sets={plain} mode="combined" opts={opts} dark={dark} />}
          </div>
        )}
      </div>
    </Shell>
  )
}
