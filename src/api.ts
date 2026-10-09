// Contract between this UI and the Python backend.
//
//   (Streamlit: handled by streamlit_app.py via the component protocol; HTTP below is for standalone use)
//   POST {API_URL}/analyze        multipart/form-data
//     files[]  : the uploaded data files (one part per file, repeated)
//     params   : JSON string, see AnalysisParams
//   -> 200 application/json, see AnalysisResponse
//
// Set VITE_API_URL (e.g. http://localhost:8000) or proxy /api to the backend.

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api'

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

// ── Streamlit transport ──────────────────────────────────────────────────────
// When this app is the frontend of a Streamlit custom component (see streamlit_app.py)
// requests go through the component protocol (postMessage) instead of HTTP.

type Pending = { resolve: (r: AnalysisResponse) => void; reject: (e: Error) => void }
const pending = new Map<string, Pending>()
let streamlitLive = false
let started = false

const toStreamlit = (type: string, extra: object) => window.parent.postMessage({ isStreamlitMessage: true, type, ...extra }, '*')

function startStreamlit() {
  if (started || window.parent === window) return
  started = true
  window.addEventListener('message', (e) => {
    if (e.data?.type !== 'streamlit:render') return
    streamlitLive = true
    const r = e.data.args?.response
    const p = r && pending.get(r.id)
    if (!p) return
    pending.delete(r.id)
    if (r.error) p.reject(new Error(r.error))
    else p.resolve(r.result as AnalysisResponse)
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

async function viaStreamlit(files: File[], params: AnalysisParams): Promise<AnalysisResponse> {
  const id = Math.random().toString(36).slice(2)
  const payload = { id, params, files: await Promise.all(files.map(async (f) => ({ name: f.name, data: await b64(f) }))) }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    toStreamlit('streamlit:setComponentValue', { value: payload, dataType: 'json' })
  })
}

export async function runAnalysis(files: File[], params: AnalysisParams): Promise<AnalysisResponse> {
  if (streamlitLive) return viaStreamlit(files, params)
  const body = new FormData()
  files.forEach((f) => body.append('files', f, f.name))
  body.append('params', JSON.stringify(params))
  let res: Response
  try {
    res = await fetch(`${API_URL}/analyze`, { method: 'POST', body })
  } catch {
    throw new Error(`Could not reach the analysis backend at ${API_URL}/analyze`)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = text
    try {
      const j = JSON.parse(text)
      detail = j.detail ?? j.error ?? j.message ?? text
    } catch {}
    throw new Error(`Backend error ${res.status}${detail ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`)
  }
  return res.json()
}
