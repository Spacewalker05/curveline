// Shared types + transport for the JV analysis UI.
//
// Inside Streamlit (curveline's streamlit_app.py hosts this UI as a custom component)
// requests go to Python via the component protocol: backend/analyze.py does the work.
// Standalone (e.g. the Lovable preview) the browser port in core.ts is used instead.

import { analyzeFiles, devicePairs, loadFile, splitScans, type Scan } from './core'

export type MetricKey = 'pce' | 'voc' | 'isc' | 'jsc' | 'ff' | 'imp' | 'pmax' | 'vmpp' | 'jmpp' | 'rs' | 'rsh' | 'ff0' | 'dff'
export type Metrics = Partial<Record<MetricKey, number | null>>

export type Pixel = {
  id: string
  label: string
  reverse?: Metrics
  forward?: Metrics
  hysteresis_index?: number | null
}

export type AnalysisParams = {
  area_cm2: number
  irradiance_mw_cm2: number
  v_min: number
  v_max: number
  min_points: number
  invert_current: boolean
  advanced: boolean
  output_name: string
}

export type AnalysisResponse = {
  files: { name: string; pixels: Pixel[] }[]
  summary?: Partial<Record<MetricKey, { mean: number; std?: number | null }>>
  statistics?: { key: MetricKey; mean: number; std: number; min: number; max: number }[]
  log?: { level: 'info' | 'warn' | 'error'; message: string }[]
  exports?: { xlsx?: string; csv?: string }
}

// Raw sweeps for the Inspect screen (current in A, sign as recorded in the file).
export type InspectPixel = { label: string; forward?: Scan; reverse?: Scan; single?: Scan }
export type InspectFile = { name: string; pixels: InspectPixel[]; error?: string }

// ── Streamlit transport ──────────────────────────────────────────────────────

type Pending = { resolve: (r: any) => void; reject: (e: Error) => void }
const pending = new Map<string, Pending>()
let streamlitLive = false
let started = false

const toStreamlit = (type: string, extra: object) => window.parent.postMessage({ isStreamlitMessage: true, type, ...extra }, '*')

function startStreamlit() {
  if (started || typeof window === 'undefined' || window.parent === window) return
  started = true
  window.addEventListener('message', (e) => {
    if (e.data?.type !== 'streamlit:render') return
    streamlitLive = true
    const r = e.data.args?.response
    const p = r && pending.get(r.id)
    if (!p) return
    pending.delete(r.id)
    if (r.error) p.reject(new Error(r.error))
    else p.resolve(r.result)
  })
  toStreamlit('streamlit:componentReady', { apiVersion: 1 })
  let h = 900
  try {
    h = Math.max(700, (window.parent as Window).innerHeight - 24)
  } catch {}
  toStreamlit('streamlit:setFrameHeight', { height: h })
}
startStreamlit()

const b64 = (f: File) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1] ?? '')
    r.onerror = () => no(new Error(`Could not read ${f.name}`))
    r.readAsDataURL(f)
  })

async function viaStreamlit<T>(kind: 'analyze' | 'inspect', files: File[], params: object): Promise<T> {
  const id = Math.random().toString(36).slice(2)
  const payload = { id, kind, params, files: await Promise.all(files.map(async (f) => ({ name: f.name, data: await b64(f) }))) }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    toStreamlit('streamlit:setComponentValue', { value: payload, dataType: 'json' })
  })
}

export async function runAnalysis(files: File[], params: AnalysisParams): Promise<AnalysisResponse> {
  if (streamlitLive) return viaStreamlit('analyze', files, params)
  return analyzeFiles(files, params)
}

export async function inspectFiles(files: File[], minPoints = 10): Promise<InspectFile[]> {
  if (streamlitLive) {
    const r = await viaStreamlit<{ files: InspectFile[] }>('inspect', files, { min_points: minPoints })
    return r.files
  }
  return Promise.all(
    files.map(async (f) => {
      try {
        const t = await loadFile(f)
        const pixels = devicePairs(t).map((p) => ({ label: p.label, ...splitScans(t, p.v, p.i, false, minPoints) }))
        return { name: f.name, pixels }
      } catch (e: any) {
        return { name: f.name, pixels: [], error: e?.message ?? 'Could not read file' }
      }
    }),
  )
}
