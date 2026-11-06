// @ts-nocheck — matches the looser typing of the ported curveline views
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Scan } from './core'
import { inspectFiles, runAnalysis, type AnalysisResponse, type InspectFile } from './api'
import { AnalysisResults } from './Analysis'
import { LineChart } from './Inspect'
import { PairedFigure, type Block, type Kind } from './Plotting'
import Plotly from 'plotly.js-basic-dist-min'
import { plotImageName } from './plot-export'
import { Analysing, card, Check, cv, primaryBtn, DropZone, Field, FileChips, pixelColor, Section, sectionLabel, Shell, Toggle, tr } from './ui'

const flip = (s: Scan | undefined, invert: boolean) => (s && invert ? { V: s.V, I: s.I.map((i) => -i) } : s)
const PLOT_PARAMS: [string, string][] = [['PCE (%)', 'pce'], ['Voc (V)', 'voc'], ['Jsc (mA/cm²)', 'jsc'], ['FF (%)', 'ff'], ['Rs (Ω·cm²)', 'rs'], ['Rsh (Ω·cm²)', 'rsh']]
const stem = (n: string) => n.replace(/\.[^.]+$/, '')

export default function Dashboard({ onBack, dark, setDark }: { onBack: () => void; dark: boolean; setDark: (v: boolean) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [loaded, setLoaded] = useState<InspectFile[]>([])
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
  const [allRes, setAllRes] = useState<AnalysisResponse | null>(null)
  const [plotKinds, setPlotKinds] = useState<Kind[]>(['both'])
  const [plotParams, setPlotParams] = useState<string[]>(['PCE (%)', 'Voc (V)', 'Jsc (mA/cm²)', 'FF (%)'])

  const [panelOpen, setPanelOpen] = useState(true)
  const [settings, setSettings] = useState({ area: 0.1, invert: false, advanced: true })
  const [fileResults, setFileResults] = useState<AnalysisResponse[]>([])
  const cur = loaded[Math.min(fi, loaded.length - 1)]
  const selectedResult = fileResults[Math.min(fi, fileResults.length - 1)]
  const a = settings.area

  const run = async () => {
    if (busy) return
    const areaValue = Number(area), irradianceValue = Number(irr)
    const low = Number(vmin), high = Number(vmax)
    if (!files.length) { setError('Add at least one scan file.'); return }
    if (!Number.isFinite(areaValue) || !(areaValue > 0) || !Number.isFinite(irradianceValue) || !(irradianceValue > 0) || !vmin.trim() || !vmax.trim() || !Number.isFinite(low) || !Number.isFinite(high) || !(high > low)) {
      setError('Enter a valid area, irradiance and voltage window to calculate parameters.')
      return
    }
    setBusy(true)
    setError('')
    const inputFiles = [...files]
    const params = { area_cm2: areaValue, irradiance_mw_cm2: irradianceValue, v_min: low, v_max: high, min_points: 10, invert_current: invert, advanced: adv, output_name: 'all_results' }
    try {
      const [raw, individual, combined] = await Promise.all([
        inspectFiles(inputFiles, 10),
        Promise.all(inputFiles.map((f) => runAnalysis([f], { ...params, output_name: `${stem(f.name)}_results` }))),
        inputFiles.length === 1 ? Promise.resolve(null) : runAnalysis(inputFiles, params),
      ])
      if (!raw.some((f) => f.pixels.length) || !individual.some((r) => r.files.some((f) => f.pixels.length))) {
        throw new Error(raw.find((f) => f.error)?.error || 'No valid scan data found in these files.')
      }
      setLoaded(raw)
      setFileResults(individual)
      setAllRes(combined ?? individual[0] ?? null)
      setSettings({ area: areaValue, invert, advanced: adv })
      setFi(0)
      setPi(0)
      setPanelOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
    } finally {
      setBusy(false)
    }
  }
  const blocks = useMemo<Block[]>(() => {
    if (!allRes) return []
    const ps = PLOT_PARAMS.filter(([n]) => plotParams.includes(n))
    return ps.map(([param, key]) => ({
      param,
      series: allRes.files.map((f) => {
        const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : null)
        const rev = f.pixels.map((px) => num(px.reverse?.[key]))
        return { sample: stem(f.name), labels: f.pixels.map((px, i) => px.label || `P${i + 1}`), fwd: f.pixels.map((px) => num(px.forward?.[key])), rev: rev.some((v) => v !== null) ? rev : null }
      }).filter((sr) => sr.fwd.some((v) => v !== null) || sr.rev),
    })).filter((b) => b.series.length)
  }, [allRes, plotParams])
  const plotOpts = useMemo(() => ({ meanLine: true, errBars: true, grid, size: 10 }), [grid])
  const plotFile = loaded.length === 1 ? stem(loaded[0].name) : 'samples'
  const downloadPlots = async (format: 'png' | 'svg' = 'png') => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('#dash-multi [data-plot]'))) {
      await Plotly.downloadImage(el, { format, width: +(el.dataset.w || 1400), height: +(el.dataset.h || 800), scale: format === 'png' ? 4 : 1, filename: el.dataset.plot || 'plot' })
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  const pairs = cur?.pixels ?? []
  const pair = pairs[Math.min(pi, pairs.length - 1)]
  const colors = useMemo(() => pairs.map((_, i) => pixelColor(i, pairs.length)), [pairs, dark])
  const scans = useMemo(() => {
    if (!pair) return []
    const out: { name: string; s: Scan; color: string }[] = []
    for (const p of allPixels ? pairs : [pair]) {
      const color = colors[pairs.indexOf(p)] ?? cv('--c-plot-ink')
      const prefix = allPixels && pairs.length > 1 ? (p.label ? `${p.label} · ` : '') : ''
      const f = flip(p.forward, settings.invert), r = flip(p.reverse, settings.invert), s1 = flip(p.single, settings.invert)
      if (f) out.push({ name: `${prefix}Forward`, s: f, color })
      if (r) out.push({ name: `${prefix}Reverse`, s: r, color })
      if (s1) out.push({ name: `${prefix}Scan`, s: s1, color })
    }
    return out
  }, [pair, pairs, allPixels, settings.invert, colors])

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
      <div className={sectionLabel}>Analyse</div>
      <div className={`${sectionLabel} mt-4`}>Scan Files</div>
      <div className="mt-3">
        <DropZone accept=".txt,.csv,.dat,.xlsx,.xls" label="Drop solar simulator scan files" onFiles={(f) => { if (!busy) setFiles((x) => [...x, ...f.filter((n) => !x.some((o) => o.name === n.name))]) }} />
        <FileChips names={files.map((f) => f.name)} onRemove={(i) => { if (!busy) setFiles((x) => x.filter((_, k) => k !== i)) }} />
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
      {loaded.length > 0 && (
        <>
          <Section title="Sample Plots" />
          <div className="grid grid-cols-3 gap-1.5">
            {(['fwd', 'rev', 'both'] as Kind[]).map((k) => {
              const on = plotKinds.length === 1 && plotKinds[0] === k
              return <button key={k} onClick={() => setPlotKinds([k])} className={`h-8 rounded-lg border text-xs font-medium cursor-pointer ${tr} ${on ? 'bg-accent border-accent text-on-accent' : 'border-line text-fg hover:border-accent'}`}>{k === 'fwd' ? 'Forward' : k === 'rev' ? 'Reverse' : 'Both'}</button>
            })}
          </div>
          <div className="space-y-2.5 mt-3">
            {PLOT_PARAMS.map(([n]) => (
              <Check key={n} label={n} on={plotParams.includes(n)} onChange={() => setPlotParams((x) => x.includes(n) ? x.filter((y) => y !== n) : [...x, n])} />
            ))}
          </div>
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
      {error && <div role="alert" className="mt-4 text-sm text-bad">{error}</div>}
    </>
  )

  return (
    <Shell crumb="Dashboard" dark={dark} setDark={setDark} onBack={onBack} sidebar={sidebar} sidePanelOpen={panelOpen} onSidePanelOpenChange={setPanelOpen}
      action={<div className="space-y-2">
        <Button onClick={run} disabled={busy || !files.length} className={primaryBtn}>{busy ? 'Analysing…' : 'Run analysis'}</Button>
        {blocks.length > 0 && <div className="space-y-1.5">
          <div className="text-xs text-muted">Export {plotKinds[0] === 'fwd' ? 'Forward' : plotKinds[0] === 'rev' ? 'Reverse' : 'Both'} plots</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => downloadPlots('png')}>↓ PNG (4×)</Button>
            <Button variant="outline" onClick={() => downloadPlots('svg')}>↓ SVG</Button>
          </div>
        </div>}
      </div>}
      status={<>{busy ? 'Calculating…' : loaded.length ? `${loaded.length} file(s) analysed` : files.length ? `${files.length} file(s) ready` : 'No files'}</>}>
      <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] w-full mx-auto">
        {busy ? <Analysing /> : !loaded.length ? (
          <div className="min-h-[420px] grid place-items-center text-center">
            <div>
              <div className="text-lg font-semibold">{files.length ? `${files.length} file(s) ready for analysis` : 'No analysis yet'}</div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 sticky top-0 z-20 bg-bg/90 backdrop-blur py-2">
              {[['dash-plots', 'Plots'], ['dash-params', 'Parameters'], ['dash-multi', 'Sample plots']].map(([id, t]) => (
                <Button variant="ghost" key={id} onClick={() => jump(id)} className={pill(false)}>{t}</Button>
              ))}
            </div>
            <div id="dash-plots" className="space-y-5 scroll-mt-16">
              {err ? <div className={`${card} p-5 text-sm text-bad`}>{err}</div> : (
                <div className="grid md:grid-cols-2 gap-4">
                  <LineChart title={`Current vs Voltage — ${label}`} yLabel="Current (mA)" filename={plotImageName('current', imgFile, allPixels ? undefined : pair?.label)} scans={scans} yOf={toMa} dark={dark} grid={grid} compact />
                  {a > 0 ? (
                    <LineChart title={`Current density vs Voltage — ${label}`} yLabel="Current Density (mA cm<sup>−2</sup>)" filename={plotImageName('jsc', imgFile, allPixels ? undefined : pair?.label)} scans={scans} yOf={toJ} dark={dark} grid={grid} positive compact />
                  ) : <div className={`${card} p-5 text-sm text-muted`}>Enter an active area to show the J–V plot.</div>}
                </div>
              )}
            </div>
            <div id="dash-params" className="space-y-5 scroll-mt-16">
              {error && <div className="rounded-xl border border-bad/40 bg-bad/10 text-bad text-sm px-4 py-3">{error}</div>}
              {selectedResult && <AnalysisResults res={selectedResult} adv={settings.advanced} stats={stats} dark={dark} out={`${stem(cur?.name ?? 'jv')}_results`} />}
            </div>
            <div id="dash-multi" className="space-y-5 scroll-mt-16">
              {!blocks.length ? <div className={`${card} p-5 text-sm text-muted`}>{allRes ? 'Pick at least one parameter under Sample Plots.' : 'Preparing sample plots…'}</div>
                : !plotKinds.length ? <div className={`${card} p-5 text-sm text-muted`}>Pick Forward, Reverse or Both under Sample Plots.</div>
                : blocks.flatMap((b) => {
                  const paired = b.series.some((sr) => sr.rev)
                  return (paired ? plotKinds : (['fwd'] as Kind[])).filter((k, i, arr) => arr.indexOf(k) === i).map((k) => <PairedFigure key={`${b.param}-${k}`} file={plotFile} block={b} kind={k} opts={plotOpts} dark={dark} />)
                })}
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}
