// @ts-nocheck — matches the looser typing of the ported curveline views
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Scan } from './core'
import { inspectFiles, runAnalysis, type AnalysisResponse, type InspectFile } from './api'
import { AnalysisResults } from './Analysis'
import { LineChart } from './Inspect'
import { plotImageName } from './plot-export'
import { card, cv, DropZone, Field, FileChips, pixelColor, Section, sectionLabel, Shell, Toggle, tr } from './ui'

const flip = (s: Scan | undefined, invert: boolean) => (s && invert ? { V: s.V, I: s.I.map((i) => -i) } : s)
const stem = (n: string) => n.replace(/\.[^.]+$/, '')

export default function Dashboard({ onBack, dark, setDark }: { onBack: () => void; dark: boolean; setDark: (v: boolean) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [loaded, setLoaded] = useState<InspectFile[]>([])
  const [res, setRes] = useState<AnalysisResponse | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fi, setFi] = useState(0)
  const [pi, setPi] = useState(0)
  const [area, setArea] = useState('0.1')
  const [irr, setIrr] = useState('100')
  const [vmin, setVmin] = useState('-0.1')
  const [vmax, setVmax] = useState('1.2')
  const [invert, setInvert] = useState(false)
  const [allPixels, setAllPixels] = useState(true)
  const [grid, setGrid] = useState(false)
  const [adv, setAdv] = useState(true)
  const [stats, setStats] = useState(true)

  // Raw scans for plots
  useEffect(() => {
    let live = true
    if (!files.length) { setLoaded([]); return }
    inspectFiles(files, 10)
      .then((r) => live && setLoaded(r))
      .catch((e) => live && setLoaded(files.map((f) => ({ name: f.name, pixels: [], error: e?.message ?? 'Could not read file' }))))
    return () => { live = false }
  }, [files])

  // Parameters, re-run automatically when inputs change
  const cur = loaded[Math.min(fi, loaded.length - 1)]
  const a = parseFloat(area), ir = parseFloat(irr), v0 = parseFloat(vmin), v1 = parseFloat(vmax)
  useEffect(() => {
    let live = true
    const target = cur ? files.find((f) => f.name === cur.name) : undefined
    if (!target) { setRes(null); return }
    if (!(a > 0) || !(ir > 0) || !(v1 > v0)) { setRes(null); setError('Enter a valid area, irradiance and voltage window to calculate parameters.'); return }
    setBusy(true)
    const t = setTimeout(() => {
      runAnalysis([target], { area_cm2: a, irradiance_mw_cm2: ir, v_min: v0, v_max: v1, min_points: 10, invert_current: invert, advanced: adv, output_name: `${stem(target.name)}_results` })
        .then((r) => { if (live) { setRes(r); setError('') } })
        .catch((e) => { if (live) { setRes(null); setError(e?.message ?? 'Analysis failed.') } })
        .finally(() => live && setBusy(false))
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [cur?.name, files, a, ir, v0, v1, invert, adv])

  const pairs = cur?.pixels ?? []
  const pair = pairs[Math.min(pi, pairs.length - 1)]
  const colors = useMemo(() => pairs.map((_, i) => pixelColor(i, pairs.length)), [pairs, dark])
  const scans = useMemo(() => {
    if (!pair) return []
    const out: { name: string; s: Scan; color: string }[] = []
    for (const p of allPixels ? pairs : [pair]) {
      const color = colors[pairs.indexOf(p)] ?? cv('--c-plot-ink')
      const prefix = allPixels && pairs.length > 1 ? (p.label ? `${p.label} · ` : '') : ''
      const f = flip(p.forward, invert), r = flip(p.reverse, invert), s1 = flip(p.single, invert)
      if (f) out.push({ name: `${prefix}Forward`, s: f, color })
      if (r) out.push({ name: `${prefix}Reverse`, s: r, color })
      if (s1) out.push({ name: `${prefix}Scan`, s: s1, color })
    }
    return out
  }, [pair, pairs, allPixels, invert, colors])

  const toMa = useMemo(() => (i: number) => i * 1000, [])
  const toJ = useMemo(() => (i: number, s: Scan) => {
    const nearZero = s.V.reduce((best, v, k) => Math.abs(v) < Math.abs(s.V[best] ?? Infinity) ? k : best, 0)
    const polarity = (s.I[nearZero] ?? 0) < 0 ? -1 : 1
    return polarity * (i / a) * 1000
  }, [a])

  const pixPart = allPixels && pairs.length > 1 ? ' · All pixels' : pair?.label ? ` · ${pair.label}` : ''
  const label = cur ? `${stem(cur.name)}${pixPart}` : ''
  const imgFile = cur?.name ?? ''
  const err = cur?.error ?? (cur && !pairs.length ? 'No voltage / current columns found in this file.' : '')
  const pill = (on: boolean) => `inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium cursor-pointer ${tr} ${on ? 'bg-accent border-accent text-on-accent' : 'border-line text-fg hover:border-accent'}`
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const sidebar = (
    <>
      <div className={sectionLabel}>Scan Files</div>
      <div className="mt-3">
        <DropZone accept=".txt,.csv,.dat,.xlsx,.xls" label="Drop solar simulator scan files" onFiles={(f) => setFiles((x) => [...x, ...f.filter((n) => !x.some((o) => o.name === n.name))])} />
        <FileChips names={files.map((f) => f.name)} onRemove={(i) => { setFiles((x) => x.filter((_, k) => k !== i)); setFi(0); setPi(0) }} />
      </div>
      {loaded.length > 0 && (
        <>
          <Section title="Files" />
          <div className="rounded-xl border border-line overflow-hidden max-h-[220px] overflow-y-auto scroll-quiet">
            {loaded.map((l, i) => (
              <button key={l.name} onClick={() => { setFi(i); setPi(0) }} className={`w-full text-left px-3 py-2 text-xs border-b border-line last:border-b-0 truncate cursor-pointer ${tr} ${i === fi ? 'bg-accent text-on-accent' : 'text-fg hover:bg-panel'}`} title={l.name}>{l.name}</button>
            ))}
          </div>
          {pairs.length > 1 && (
            <>
              <Section title="Pixels" />
              <div className="rounded-xl border border-line overflow-hidden max-h-[260px] overflow-y-auto scroll-quiet">
                <button onClick={() => setAllPixels(true)} className={`w-full text-left px-3 py-2 text-xs border-b border-line cursor-pointer ${tr} ${allPixels ? 'bg-accent text-on-accent' : 'text-fg hover:bg-panel'}`}>All pixels</button>
                {pairs.map((p, i) => (
                  <button key={p.label || i} onClick={() => { setAllPixels(false); setPi(i) }} className={`w-full flex items-center gap-2 text-left px-3 py-2 text-xs border-b border-line last:border-b-0 cursor-pointer ${tr} ${!allPixels && i === pi ? 'bg-accent text-on-accent' : 'text-fg hover:bg-panel'}`}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[i] }} />
                    {p.label || `Pixel ${i + 1}`}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <Section title="Device" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Active area" unit="cm²" value={area} onChange={setArea} />
        <Field label="Irradiance" unit="mW/cm²" value={irr} onChange={setIrr} />
      </div>
      <Section title="Scan Window" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="V min (V)" value={vmin} onChange={setVmin} />
        <Field label="V max (V)" value={vmax} onChange={setVmax} />
      </div>
      <Section title="Options" />
      <Toggle on={allPixels} onChange={setAllPixels} label="All pixels" />
      <Toggle on={invert} onChange={setInvert} label="Invert current sign" />
      <Toggle on={grid} onChange={setGrid} label="Grid lines" />
      <Toggle on={adv} onChange={setAdv} label="Advanced parameters" sub="Rs, Rsh, FF0, dFF, HI" />
      <Toggle on={stats} onChange={setStats} label="Show statistics table" />
    </>
  )

  return (
    <Shell crumb="Dashboard" dark={dark} setDark={setDark} onBack={onBack} sidebar={sidebar}
      action={null}
      status={<>{busy ? 'Calculating…' : loaded.length ? `${loaded.length} file(s) loaded` : 'No files'}</>}>
      <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] w-full mx-auto">
        {!loaded.length ? (
          <div className="min-h-[420px] grid place-items-center text-center">
            <div>
              <div className="text-lg font-semibold">One file, every view</div>
              <p className="text-sm text-muted mt-2 max-w-[440px]">Drop a scan file from the solar simulator to see I–V and J–V plots, all parameters, box plots and exports together.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 sticky top-0 z-20 bg-bg/90 backdrop-blur py-2">
              {[['dash-plots', 'Plots'], ['dash-params', 'Parameters']].map(([id, t]) => (
                <Button variant="ghost" key={id} onClick={() => jump(id)} className={pill(false)}>{t}</Button>
              ))}
            </div>
            <div id="dash-plots" className="space-y-5 scroll-mt-16">
              {err ? <div className={`${card} p-5 text-sm text-bad`}>{err}</div> : (
                <div className="grid xl:grid-cols-2 gap-5">
                  <LineChart title={`Current vs Voltage — ${label}`} yLabel="Current (mA)" filename={plotImageName('current', imgFile, allPixels ? undefined : pair?.label)} scans={scans} yOf={toMa} dark={dark} grid={grid} />
                  {a > 0 ? (
                    <LineChart title={`Current density vs Voltage — ${label}`} yLabel="Current Density (mA cm<sup>−2</sup>)" filename={plotImageName('jsc', imgFile, allPixels ? undefined : pair?.label)} scans={scans} yOf={toJ} dark={dark} grid={grid} positive />
                  ) : <div className={`${card} p-5 text-sm text-muted`}>Enter an active area to show the J–V plot.</div>}
                </div>
              )}
            </div>
            <div id="dash-params" className="space-y-5 scroll-mt-16">
              {error && <div className="rounded-xl border border-bad/40 bg-bad/10 text-bad text-sm px-4 py-3">{error}</div>}
              {res && <AnalysisResults res={res} adv={adv} stats={stats} dark={dark} out={`${stem(cur?.name ?? 'jv')}_results`} />}
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}
