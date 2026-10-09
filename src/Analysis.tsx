import { useMemo, useState } from 'react'
import { runAnalysis, type AnalysisResponse, type MetricKey, type Metrics, type Pixel } from './api'
import BoxChart from './BoxChart'
import { card, DropZone, Field, FileChips, primaryBtn, Section, sectionLabel, Shell, TextField, Toggle, tr } from './ui'

const METRICS: { key: MetricKey; label: string; unit: string; dp: number; adv?: boolean }[] = [
  { key: 'voc', label: 'Voc', unit: 'V', dp: 3 },
  { key: 'isc', label: 'Isc', unit: 'mA', dp: 3 },
  { key: 'jsc', label: 'Jsc', unit: 'mA/cm²', dp: 2 },
  { key: 'ff', label: 'FF', unit: '%', dp: 2 },
  { key: 'pce', label: 'PCE', unit: '%', dp: 2 },
  { key: 'vmpp', label: 'Vmp', unit: 'V', dp: 3 },
  { key: 'imp', label: 'Imp', unit: 'mA', dp: 3 },
  { key: 'pmax', label: 'Pmax', unit: 'mW', dp: 3 },
  { key: 'rs', label: 'Rs', unit: 'Ω', dp: 2, adv: true },
  { key: 'rsh', label: 'Rsh', unit: 'Ω', dp: 0, adv: true },
  { key: 'ff0', label: 'FF0', unit: '%', dp: 2, adv: true },
  { key: 'dff', label: 'dFF', unit: '%', dp: 2, adv: true },
]
const KPIS: { key: MetricKey; label: string; unit: string; dp: number; great: number; good: number }[] = [
  { key: 'pce', label: 'PCE', unit: '%', dp: 2, great: 20, good: 15 },
  { key: 'voc', label: 'Voc', unit: 'V', dp: 3, great: 1.1, good: 0.95 },
  { key: 'jsc', label: 'Jsc', unit: 'mA/cm²', dp: 2, great: 24, good: 20 },
  { key: 'ff', label: 'FF', unit: '%', dp: 2, great: 80, good: 70 },
]

const BOX: MetricKey[] = ['voc', 'jsc', 'ff', 'pce']

const fmt = (v: number | null | undefined, dp: number) => (typeof v === 'number' && isFinite(v) ? v.toFixed(dp) : '—')
const tone = (v: number | undefined, great: number, good: number) => (v === undefined ? 'var(--c-dim)' : v >= great ? 'var(--c-ok)' : v >= good ? 'var(--c-accent)' : 'var(--c-warn)')

function Kpi({ label, value, unit, sd, color }: { label: string; value: string; unit: string; sd?: string; color: string }) {
  return (
    <div className={`${card} relative overflow-hidden p-5 pt-7`}>
      <div className="absolute left-5 top-0 h-[3px] w-10 rounded-b-full" style={{ background: color }} />
      <div className={sectionLabel}>{label}</div>
      <div className="font-mono font-semibold text-[32px] tracking-tight leading-none mt-4" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-muted mt-2.5">
        {unit} {sd && <span className="font-mono text-dim">± {sd}</span>}
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="px-5 pt-4 pb-3">
        <div className={sectionLabel}>{title}</div>
      </div>
      <div className="max-h-[420px] overflow-auto scroll-quiet">{children}</div>
    </div>
  )
}

const stripe = (i: number) => `${i % 2 === 0 ? 'bg-panel' : 'bg-surface'} hover:bg-line/50 transition-colors duration-150`
const th = 'px-5 text-[11px] font-bold uppercase tracking-wider text-muted whitespace-nowrap bg-surface'

export default function Analysis({ onBack, dark, setDark }: { onBack: () => void; dark: boolean; setDark: (v: boolean) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [area, setArea] = useState('')
  const [irr, setIrr] = useState('100')
  const [vmin, setVmin] = useState('-0.1')
  const [vmax, setVmax] = useState('1.2')
  const [pts, setPts] = useState('10')
  const [invert, setInvert] = useState(false)
  const [adv, setAdv] = useState(false)
  const [stats, setStats] = useState(true)
  const [out, setOut] = useState('jv_results')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [res, setRes] = useState<AnalysisResponse | null>(null)
  const [logOpen, setLogOpen] = useState(false)

  const pin = (parseFloat(area) || 0) * (parseFloat(irr) || 0)

  const run = async () => {
    const p = { area: parseFloat(area), irr: parseFloat(irr), vmin: parseFloat(vmin), vmax: parseFloat(vmax), pts: parseInt(pts) }
    if (!files.length) return setError('Add at least one data file.')
    if (!(p.area > 0) || !(p.irr > 0)) return setError('Enter a valid active area and irradiance.')
    if (!(p.vmax > p.vmin)) return setError('V max must be greater than V min.')
    setError('')
    setLoading(true)
    try {
      setRes(
        await runAnalysis(files, {
          area_cm2: p.area,
          irradiance_mw_cm2: p.irr,
          v_min: p.vmin,
          v_max: p.vmax,
          min_points: p.pts || 0,
          invert_current: invert,
          advanced: adv,
          output_name: out || 'jv_results',
        }),
      )
    } catch (e: any) {
      setRes(null)
      setError(e?.message ?? 'Analysis failed.')
    } finally {
      setLoading(false)
    }
  }

  const columns = useMemo(() => {
    if (!res) return []
    const multi = res.files.length > 1
    return res.files.flatMap((f) =>
      f.pixels.map((px: Pixel) => ({
        label: multi ? `${f.name} · ${px.label}` : px.label,
        scans: (['reverse', 'forward'] as const).filter((s) => px[s]).map((s) => ({ name: s, m: px[s] as Metrics })),
        hi: px.hysteresis_index,
      })),
    )
  }, [res])
  const grouped = columns.length > 1
  const rows = METRICS.filter((m) => !m.adv || adv)
  const nPix = columns.length

  const sidebar = (
    <>
      <div className={sectionLabel}>Data Files</div>
      <div className="h-px bg-line mt-2 mb-3" />
      <DropZone accept=".csv,.txt,.xlsx,.xls" label="Drop CSV / Excel / TXT files" onFiles={(f) => setFiles((x) => [...x, ...f.filter((n) => !x.some((o) => o.name === n.name))])} />
      <FileChips names={files.map((f) => f.name)} onRemove={(i) => setFiles(files.filter((_, k) => k !== i))} />

      <Section title="Device Geometry" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Active Area" unit="cm²" value={area} onChange={setArea} placeholder="0.049" />
        <Field label="Irradiance" unit="mW/cm²" value={irr} onChange={setIrr} />
      </div>
      <div className="mt-3 flex items-center justify-between px-4 py-3 rounded-xl bg-surface border border-line text-xs">
        <span className="text-muted">P_in (incident power)</span>
        <span className="font-mono text-accent">{pin > 0 ? `${pin.toFixed(2)} mW` : '— mW'}</span>
      </div>

      <Section title="Scan Window" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="V min (V)" value={vmin} onChange={setVmin} />
        <Field label="V max (V)" value={vmax} onChange={setVmax} />
      </div>
      <div className="mt-3">
        <Field label="Min. data points" value={pts} onChange={setPts} step="1" />
        <div className="text-xs text-dim mt-1.5">Scans with fewer points are skipped.</div>
      </div>

      <Section title="Sign Convention" />
      <Toggle on={invert} onChange={setInvert} label="Invert current sign" sub="Enable if photocurrent reads positive" />

      <Section title="Options" />
      <Toggle on={adv} onChange={setAdv} label="Advanced parameters" sub="Rs, Rsh, FF0, dFF, HI" />
      <Toggle on={stats} onChange={setStats} label="Show statistics table" />

      <Section title="Output" />
      <TextField label="Output filename" unit=".xlsx" value={out} onChange={setOut} placeholder="jv_results" />
      <div className="text-xs text-dim mt-1.5">.xlsx is added automatically.</div>
    </>
  )

  return (
    <Shell
      crumb="Parameter Calculation"
      dark={dark}
      setDark={setDark}
      onBack={onBack}
      sidebar={sidebar}
      action={
        <button onClick={run} disabled={loading} className={primaryBtn}>
          {loading ? 'Analysing…' : '▶ Run Analysis'}
        </button>
      }
      status={
        <>
          <span className={`w-1.5 h-1.5 rounded-full ${error ? 'bg-bad' : loading ? 'bg-warn animate-pulse' : 'bg-ok'}`} />
          {error ? 'Error' : loading ? 'Running analysis' : res ? `${nPix} pixel${nPix === 1 ? '' : 's'} · ${res.files.length} file${res.files.length === 1 ? '' : 's'}` : 'Ready'}
        </>
      }
    >
      <div className="flex-1 p-6 lg:p-8">
        {error && <div className="max-w-[1200px] mx-auto mb-5 rounded-xl border border-bad/40 bg-bad/10 text-bad text-sm px-4 py-3">{error}</div>}
        {!res ? (
          <div className="min-h-[420px] h-full grid place-items-center">
            <div className="border border-dashed border-line bg-surface/60 rounded-2xl px-12 py-14 text-center max-w-md">
              <p className="text-muted text-sm">{loading ? 'Analysing your data…' : 'No results yet — upload files and click Run Analysis'}</p>
            </div>
          </div>
        ) : (
          <div className="max-w-[1200px] mx-auto space-y-5">
            {res.summary && (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {KPIS.map((k) => {
                  const s = res.summary?.[k.key]
                  return <Kpi key={k.key} label={k.label} unit={k.unit} value={fmt(s?.mean, k.dp)} sd={typeof s?.std === 'number' ? fmt(s.std, s.std < 0.1 ? 3 : 2) : undefined} color={tone(s?.mean, k.great, k.good)} />
                })}
              </div>
            )}

            <Panel title={`Parameters${grouped ? ` · ${nPix} pixels` : ''}`}>
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10">
                  {grouped && (
                    <tr className="h-8">
                      <th className={`${th} text-left sticky left-0 z-20`} rowSpan={2}>
                        Parameter
                      </th>
                      {columns.map((c) => (
                        <th key={c.label} colSpan={Math.max(c.scans.length, 1)} className={`${th} text-center border-l border-line normal-case tracking-normal text-fg`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  )}
                  <tr className={`h-8 ${grouped ? '' : 'border-y border-line'}`}>
                    {!grouped && <th className={`${th} text-left`}>Parameter</th>}
                    {columns.flatMap((c) =>
                      c.scans.length ? c.scans.map((s) => (
                        <th key={c.label + s.name} className={`${th} text-right ${grouped ? 'border-l border-line first:border-l-0' : ''}`}>
                          {s.name === 'reverse' ? 'Reverse Scan' : 'Forward Scan'}
                        </th>
                      )) : [<th key={c.label} className={`${th} text-right`}>—</th>],
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.key} className={stripe(i)}>
                      <td className={`py-2.5 px-5 text-fg whitespace-nowrap ${grouped ? `sticky left-0 z-[1] ${i % 2 === 0 ? 'bg-panel' : 'bg-surface'}` : ''}`}>
                        {r.label} <span className="text-dim text-xs ml-1">{r.unit}</span>
                      </td>
                      {columns.flatMap((c) =>
                        c.scans.length ? c.scans.map((s) => (
                          <td key={c.label + s.name} className="py-2.5 px-5 text-right font-mono text-fg whitespace-nowrap">
                            {fmt(s.m[r.key], r.dp)}
                          </td>
                        )) : [<td key={c.label} className="py-2.5 px-5 text-right font-mono text-dim">—</td>],
                      )}
                    </tr>
                  ))}
                  {adv && columns.some((c) => typeof c.hi === 'number') && (
                    <tr className={stripe(rows.length)}>
                      <td className={`py-2.5 px-5 text-fg whitespace-nowrap ${grouped ? `sticky left-0 z-[1] ${rows.length % 2 === 0 ? 'bg-panel' : 'bg-surface'}` : ''}`}>
                        HI <span className="text-dim text-xs ml-1">hysteresis index</span>
                      </td>
                      {columns.map((c) => (
                        <td key={c.label} colSpan={Math.max(c.scans.length, 1)} className={`py-2.5 px-5 font-mono text-fg whitespace-nowrap ${c.scans.length > 1 ? 'text-center' : 'text-right'} ${grouped ? 'border-l border-line' : ''}`}>
                          {fmt(c.hi, 3)}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </Panel>

            <div className="grid md:grid-cols-2 gap-5">
              {BOX.map((k) => (
                <BoxChart key={k} metric={METRICS.find((m) => m.key === k)!} columns={columns} dark={dark} />
              ))}
            </div>

            {stats && res.statistics && res.statistics.length > 0 && (
              <Panel title="Statistics">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="h-8 border-y border-line">
                      {['Parameter', 'Mean', 'Std Dev', 'Min', 'Max'].map((h, i) => (
                        <th key={h} className={`${th} ${i === 0 ? 'text-left' : 'text-right'}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...res.statistics].sort((a, b) => METRICS.findIndex((m) => m.key === a.key) - METRICS.findIndex((m) => m.key === b.key)).map((s, i) => {
                      const m = METRICS.find((x) => x.key === s.key)
                      if (!m || (m.adv && !adv)) return null
                      return (
                        <tr key={s.key} className={stripe(i)}>
                          <td className="py-2.5 px-5 text-fg">
                            {m.label} <span className="text-dim text-xs ml-1">{m.unit}</span>
                          </td>
                          {[s.mean, s.std, s.min, s.max].map((v, k) => (
                            <td key={k} className="py-2.5 px-5 text-right font-mono text-fg">
                              {fmt(v, m.dp)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Panel>
            )}

            {res.log && res.log.length > 0 && (
              <div className={`${card} overflow-hidden`}>
                <button onClick={() => setLogOpen(!logOpen)} className={`w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-panel/60 ${tr}`}>
                  <span className={sectionLabel}>Analysis Log</span>
                  <svg className={`text-muted ${tr} ${logOpen ? 'rotate-180' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {logOpen && (
                  <div className="bg-bg border-t border-line px-5 py-4 font-mono text-xs leading-6 max-h-64 overflow-auto scroll-quiet">
                    {res.log.map((l, i) => (
                      <div key={i} className={l.level === 'warn' ? 'text-warn' : l.level === 'error' ? 'text-bad' : 'text-dim'}>
                        <span className="opacity-60">[{l.level.toUpperCase().padEnd(5, ' ')}]</span> {l.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {res && (
        <div className="sticky bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur px-6 lg:px-8 py-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted mr-1">Export Results:</span>
          {[
            ['Download Excel (.xlsx)', res.exports?.xlsx],
            ['Download CSV', res.exports?.csv],
          ].map(([label, href]) =>
            href ? (
              <a key={label} href={href} download={`${out || 'jv_results'}.${label?.includes('xlsx') ? 'xlsx' : 'csv'}`} className={`h-9 px-4 rounded-lg border border-line text-xs font-medium text-fg grid place-items-center hover:border-accent hover:text-accent hover:scale-[1.02] ${tr}`}>
                {label}
              </a>
            ) : (
              <span key={label} title="Not provided by the backend" className="h-9 px-4 rounded-lg border border-line text-xs font-medium text-dim grid place-items-center opacity-50">
                {label}
              </span>
            ),
          )}
        </div>
      )}
    </Shell>
  )
}
