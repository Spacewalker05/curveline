// @ts-nocheck — numeric array code; indices are bounds-checked by the algorithm
// Browser port of backend/jv_analysis_core.py + analyze.py (same algorithms).
import * as XLSX from 'xlsx'
import type { AnalysisParams, AnalysisResponse, MetricKey, Metrics, Pixel } from './api'

const V_CANDIDATES = ['voltage', 'v', 'volt', 'potential', 'e', 'ewe', 'ew', 'evs', 'we1potential', 'potentialapplied', 'vf', 'vm', 'volts', 'smuvoltage', 'smuv', 'vr', 'vapplied', 'pot', 'evolt', 'voltage_v', 'v_v']
const I_CANDIDATES = ['current', 'i', 'curr', 'ampere', 'amp', 'ima', 'ia', 'we1current', 'currentapplied', 'if', 'im', 'ir', 'amps', 'smucurrent', 'smui', 'current_a', 'i_a', 'iapplied', 'cur', 'current_ma', 'i_ma']

const alnum = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const V_NORM = V_CANDIDATES.map(alnum)
const I_NORM = I_CANDIDATES.map(alnum)
const ALL_KW = [...V_NORM, ...I_NORM]

export type Table = { columns: string[]; rows: (number | null)[][] }

function detectHeader(lines: string[], maxScan = 20) {
  for (let li = 0; li < Math.min(lines.length, maxScan); li++) {
    const toks = lines[li].trim().toLowerCase().split(/[\t,;|\s]+/).map(alnum)
    for (const t of toks) {
      if (!t) continue
      for (const kw of ALL_KW) if (kw.length <= 2 ? t === kw : t === kw || t.startsWith(kw)) return li
    }
  }
  return 0
}

const num = (s: unknown): number | null => {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  const t = String(s ?? '').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function uniqueCols(cols: string[]) {
  const seen = new Map<string, number>()
  return cols.map((c, i) => {
    const base = c.trim() || `Unnamed: ${i}`
    const k = seen.get(base) ?? 0
    seen.set(base, k + 1)
    return k ? `${base}.${k}` : base
  })
}

function fromLines(lines: string[]): Table {
  const hdr = detectHeader(lines)
  for (const sep of ['\t', ',', ';', /\s+/] as (string | RegExp)[]) {
    const split = (l: string) => (sep instanceof RegExp ? l.trim().split(sep) : l.split(sep))
    const head = split(lines[hdr] ?? '')
    if (head.length < 2) continue
    const columns = uniqueCols(head)
    const rows: (number | null)[][] = []
    for (const l of lines.slice(hdr + 1)) {
      if (!l.trim()) continue
      const cells = split(l)
      if (cells.length > columns.length) continue
      const r = columns.map((_, i) => num(cells[i]))
      if (r.some((x) => x !== null)) rows.push(r)
    }
    return { columns, rows }
  }
  throw new Error('Could not parse the file as a delimited table. Check the delimiter / format.')
}

export async function loadFile(file: File): Promise<Table> {
  if (/\.xlsx?$/i.test(file.name)) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })
    const lines = aoa.map((r) => r.map((v) => String(v)).join('\t'))
    const hdr = detectHeader(lines)
    const columns = uniqueCols((aoa[hdr] ?? []).map(String))
    const rows = aoa.slice(hdr + 1).map((r) => columns.map((_, i) => num(r[i]))).filter((r) => r.some((x) => x !== null))
    return { columns, rows }
  }
  return fromLines((await file.text()).split(/\r?\n/))
}

function findColumn(cols: string[], cands: string[]) {
  const norm = cols.map(alnum)
  for (const c of cands.map(alnum)) {
    let i = norm.indexOf(c)
    if (i >= 0) return cols[i]
    if (c.length > 2) {
      i = norm.findIndex((n) => n.startsWith(c))
      if (i >= 0) return cols[i]
      i = norm.findIndex((n) => n.includes(c))
      if (i >= 0) return cols[i]
    }
  }
  return null
}

const isKind = (norms: string[]) => (col: string) => {
  const cn = alnum(col)
  return norms.some((nc) => cn === nc || cn.startsWith(nc) || (nc.length >= 3 && cn.includes(nc)))
}

export type Pair = { v: string; i: string; label: string }

export function findPairs(cols: string[]): Pair[] {
  const isV = isKind(V_NORM), isI = isKind(I_NORM)
  const pairs: Pair[] = []
  let pv: string | null = null
  for (const c of cols) {
    const iv = isV(c), ii = isI(c) && !iv
    if (iv) pv = c
    else if (ii && pv) {
      pairs.push({ v: pv, i: c, label: `Pixel ${pairs.length + 1}` })
      pv = null
    }
  }
  if (pairs.length >= 2) return pairs
  const vs = cols.filter(isV), is = cols.filter((c) => isI(c) && !isV(c))
  if (vs.length >= 2 && is.length >= 2) return vs.slice(0, Math.min(vs.length, is.length)).map((v, n) => ({ v, i: is[n], label: `Pixel ${n + 1}` }))
  if (vs.length === 1 && is.length >= 2) return is.map((i, n) => ({ v: vs[0], i, label: `Pixel ${n + 1}` }))
  return []
}

export type Scan = { V: number[]; I: number[] }
export type SplitScans = { forward?: Scan; reverse?: Scan; single?: Scan }

/** Extract V/I for a pair and split into forward / reverse at the turning point. */
export function splitScans(t: Table, vCol: string, iCol: string, invert: boolean, minPoints: number): SplitScans {
  const vi = t.columns.indexOf(vCol), ii = t.columns.indexOf(iCol)
  const V: number[] = [], I: number[] = []
  for (const r of t.rows) {
    const v = r[vi], i = r[ii]
    if (v === null || i === null) continue
    V.push(v)
    I.push(invert ? -i : i)
  }
  const n = V.length
  let turning: number[] = []
  if (n >= 4) {
    const s = V.slice(1).map((v, k) => Math.sign(v - V[k]))
    for (let i = 1; i < s.length; i++) {
      if (s[i] !== 0 && s[i - 1] !== 0 && s[i] !== s[i - 1]) {
        let run = 1, j = i + 1
        while (j < s.length && (s[j] === s[i] || s[j] === 0)) run++, j++
        if (run >= Math.max(2, minPoints - 1)) {
          turning.push(i)
          break
        }
      }
    }
    if (!turning.length) {
      const iMax = V.indexOf(Math.max(...V)), iMin = V.indexOf(Math.min(...V))
      turning = [iMax, iMin].filter((i) => i > 0 && i < n - 1)
    }
  }
  if (!turning.length) return { single: { V, I } }
  const sp = Math.min(...turning) + 1
  const a = { V: V.slice(0, sp), I: I.slice(0, sp) }, b = { V: V.slice(sp), I: I.slice(sp) }
  return a.V[0] > a.V[a.V.length - 1] ? { reverse: a, forward: b } : { forward: a, reverse: b }
}

// ── Cubic spline (not-a-knot, like scipy CubicSpline) ───────────────────────
type Spline = { f: (x: number) => number; d: (x: number) => number }
function spline(x: number[], y: number[]): Spline {
  const n = x.length
  const h = x.slice(1).map((v, i) => v - x[i])
  const M = new Array(n).fill(0)
  if (n >= 4) {
    const dd = h.map((hi, i) => (y[i + 1] - y[i]) / hi)
    const m = n - 2
    const a = new Array(m).fill(0), b = new Array(m).fill(0), c = new Array(m).fill(0), r = new Array(m).fill(0)
    for (let k = 0; k < m; k++) {
      const i = k + 1
      a[k] = h[i - 1]; b[k] = 2 * (h[i - 1] + h[i]); c[k] = h[i]; r[k] = 6 * (dd[i] - dd[i - 1])
    }
    const h0 = h[0], h1 = h[1]
    b[0] = h0 * (h0 + h1) / h1 + 2 * (h0 + h1); c[0] = h1 - (h0 * h0) / h1
    const A = h[n - 3], B = h[n - 2]
    if (m === 2) {
      // both end substitutions touch the same 2x2 system
      a[1] = A - (B * B) / A; b[1] = 2 * (A + B) + (B * (A + B)) / A
    } else {
      a[m - 1] = A - (B * B) / A; b[m - 1] = 2 * (A + B) + (B * (A + B)) / A
    }
    // Thomas algorithm
    for (let k = 1; k < m; k++) {
      const w = a[k] / b[k - 1]
      b[k] -= w * c[k - 1]
      r[k] -= w * r[k - 1]
    }
    const sol = new Array(m).fill(0)
    sol[m - 1] = r[m - 1] / b[m - 1]
    for (let k = m - 2; k >= 0; k--) sol[k] = (r[k] - c[k] * sol[k + 1]) / b[k]
    for (let k = 0; k < m; k++) M[k + 1] = sol[k]
    M[0] = ((h0 + h1) * M[1] - h0 * M[2]) / h1
    M[n - 1] = ((A + B) * M[n - 2] - B * M[n - 3]) / A
  }
  const seg = (v: number) => {
    let lo = 0, hi = n - 2
    if (v <= x[0]) return 0
    if (v >= x[n - 1]) return n - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (x[mid] <= v) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  const f = (v: number) => {
    const i = seg(v), hi = h[i], t1 = x[i + 1] - v, t0 = v - x[i]
    return (M[i] * t1 ** 3 + M[i + 1] * t0 ** 3) / (6 * hi) + (y[i] / hi - (M[i] * hi) / 6) * t1 + (y[i + 1] / hi - (M[i + 1] * hi) / 6) * t0
  }
  const d = (v: number) => {
    const i = seg(v), hi = h[i], t1 = x[i + 1] - v, t0 = v - x[i]
    return (-M[i] * t1 ** 2 + M[i + 1] * t0 ** 2) / (2 * hi) - (y[i] / hi - (M[i] * hi) / 6) + (y[i + 1] / hi - (M[i + 1] * hi) / 6)
  }
  return { f, d }
}

function root(fn: (x: number) => number, a: number, b: number) {
  let fa = fn(a)
  for (let k = 0; k < 200 && b - a > 1e-12; k++) {
    const m = (a + b) / 2, fm = fn(m)
    if (fa * fm <= 0) b = m
    else a = m, fa = fm
  }
  return (a + b) / 2
}

const lerpExtrap = (xs: number[], ys: number[], x0: number) => {
  // xs need not be sorted for Voc case: sort pairs
  const p = xs.map((x, i) => [x, ys[i]]).sort((u, v) => u[0] - v[0])
  const n = p.length
  let i = p.findIndex((q) => q[0] >= x0)
  if (i <= 0) i = i === 0 ? 1 : n - 1
  const [x1, y1] = p[i - 1], [x2, y2] = p[i]
  return y1 + ((y2 - y1) * (x0 - x1)) / (x2 - x1)
}

type Log = { level: 'info' | 'warn' | 'error'; message: string }
type Cfg = { area: number; irr: number; vmin: number; vmax: number; minPoints: number; advanced: boolean }

export function calcParams(scan: Scan, label: string, c: Cfg, logs: Log[]): Metrics | null {
  const PIN = c.area * c.irr
  let pts = scan.V.map((v, k) => [v, scan.I[k]]).filter(([v]) => v >= c.vmin && v <= c.vmax)
  if (pts.length < c.minPoints) {
    logs.push({ level: 'warn', message: `Only ${pts.length} point(s) in [${c.vmin}, ${c.vmax}] V for '${label}' (need >= ${c.minPoints}). Skipped.` })
    return null
  }
  pts.sort((a, b) => a[0] - b[0])
  pts = pts.filter((p, k) => k === 0 || p[0] !== pts[k - 1][0])
  if (pts.length < 2) return null
  const Vs = pts.map((p) => p[0]), Is = pts.map((p) => p[1])
  const cs = spline(Vs, Is)
  const lo = Vs[0], hi = Vs[Vs.length - 1]
  let Isc: number
  if (lo <= 0 && 0 <= hi) Isc = cs.f(0)
  else {
    Isc = lerpExtrap(Vs, Is, 0)
    logs.push({ level: 'info', message: `'${label}': Isc extrapolated (V=0 outside measured range).` })
  }
  let Voc: number
  let last = -1
  for (let k = 0; k < Is.length - 1; k++) if (Math.sign(Is[k]) !== Math.sign(Is[k + 1])) last = k
  if (last >= 0) Voc = root(cs.f, Vs[last], Vs[last + 1])
  else if (Is.some((v) => v === 0)) Voc = Vs[Is.lastIndexOf(0)]
  else {
    Voc = lerpExtrap(Is, Vs, 0)
    logs.push({ level: 'info', message: `'${label}': Voc extrapolated (no I=0 crossing in data).` })
  }
  if (Voc <= 0) logs.push({ level: 'warn', message: `'${label}': Voc <= 0 (${Voc.toFixed(6)} V) — results unreliable.` })
  let pl = Math.max(lo, 0), ph = Math.min(hi, Voc)
  if (ph <= pl) {
    logs.push({ level: 'info', message: `'${label}': PV quadrant empty; using full window for MPP.` })
    pl = lo; ph = hi
  }
  const dPdV = (v: number) => -(cs.f(v) + v * cs.d(v))
  const nP = Math.max(Math.floor((ph - pl) / 0.001) + 1, 2)
  let best = -Infinity, Vc = pl
  for (let k = 0; k < nP; k++) {
    const v = pl + ((ph - pl) * k) / (nP - 1), P = -v * cs.f(v)
    if (P > best) best = P, Vc = v
  }
  const lb = Math.max(pl + 1e-9, Vc - 0.02), hb = Math.min(ph - 1e-9, Vc + 0.02)
  const Vmp = lb < hb && dPdV(lb) * dPdV(hb) < 0 ? root(dPdV, lb, hb) : Vc
  const Imp = cs.f(Vmp)
  const Pmax = -Vmp * Imp
  let FF = NaN
  if (Voc > 0 && Isc !== 0) FF = Pmax / (Voc * Math.abs(Isc))
  else logs.push({ level: 'warn', message: `'${label}': Voc or Isc is zero — FF/PCE unreliable.` })
  const PCE = ((Pmax * 1000) / PIN) * 100
  let Rs = NaN, Rsh = NaN, FF0 = NaN, dFF = NaN
  if (c.advanced) {
    const g = cs.d(Voc)
    Rs = Math.abs(g) > 1e-10 ? Math.abs(-1 / g) : NaN
    const g0 = cs.d(lo <= 0 && 0 <= hi ? 0 : lo)
    Rsh = Math.abs(g0) > 1e-10 ? Math.abs(-1 / g0) : NaN
    const voc = Voc / 0.02585
    if (voc > 2) {
      FF0 = (voc - Math.log(voc + 0.72)) / (voc + 1)
      dFF = FF0 - FF
    }
  }
  const r = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : null)
  return {
    voc: r(Voc), isc: r(Math.abs(Isc) * 1000), jsc: r(Math.abs((Isc / c.area) * 1000)),
    vmpp: r(Vmp), imp: r(Math.abs(Imp) * 1000), jmpp: r(Math.abs((Imp / c.area) * 1000)),
    pmax: r(Pmax * 1000), ff: r(FF * 100), pce: r(PCE),
    rs: r(Rs), rsh: r(Rsh), ff0: r(FF0 * 100), dff: r(dFF * 100),
  }
}

export function devicePairs(t: Table): Pair[] {
  const p = findPairs(t.columns)
  if (p.length) return p
  const v = findColumn(t.columns, V_CANDIDATES), i = findColumn(t.columns, I_CANDIDATES)
  if (!v) throw new Error(`Could not find Voltage column. Available: ${t.columns.join(', ')}`)
  if (!i) throw new Error(`Could not find Current column. Available: ${t.columns.join(', ')}`)
  return [{ v, i, label: '' }]
}

const KEYS: [string, MetricKey][] = [['Voc (V)', 'voc'], ['Isc (mA)', 'isc'], ['Jsc (mA/cm2)', 'jsc'], ['FF (%)', 'ff'], ['PCE (%)', 'pce'], ['Vmp (V)', 'vmpp'], ['Imp (mA)', 'imp'], ['Pmax (mW)', 'pmax'], ['Rs (Ohm)', 'rs'], ['Rsh (Ohm)', 'rsh'], ['FF0 (%)', 'ff0'], ['dFF (%)', 'dff']]
const ADV = new Set<MetricKey>(['rs', 'rsh', 'ff0', 'dff'])

const toDataUrl = (blob: Blob) => new Promise<string>((ok) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result))
  r.readAsDataURL(blob)
})

export async function analyzeFiles(files: File[], p: AnalysisParams): Promise<AnalysisResponse> {
  const cfg: Cfg = { area: p.area_cm2, irr: p.irradiance_mw_cm2, vmin: p.v_min, vmax: p.v_max, minPoints: p.min_points, advanced: p.advanced }
  const log: Log[] = []
  const out: { name: string; pixels: Pixel[] }[] = []
  for (const f of files) {
    const stem = f.name.replace(/\.[^.]+$/, '')
    try {
      const t = await loadFile(f)
      log.push({ level: 'info', message: `${f.name}: Loaded (${t.rows.length} rows × ${t.columns.length} columns)` })
      const pairs = devicePairs(t)
      const pixels: Pixel[] = []
      for (const pr of pairs) {
        const label = pr.label || stem
        const logs: Log[] = []
        try {
          const s = splitScans(t, pr.v, pr.i, p.invert_current, p.min_points)
          const px: Pixel = { id: pr.label ? `${stem}-${pr.label}` : stem, label, hysteresis_index: null }
          if (s.single) px.reverse = calcParams(s.single, 'single scan', cfg, logs) ?? undefined
          else {
            px.reverse = calcParams(s.reverse!, 'reverse scan', cfg, logs) ?? undefined
            px.forward = calcParams(s.forward!, 'forward scan', cfg, logs) ?? undefined
            const pr_ = px.reverse?.pce, pf = px.forward?.pce
            if (pr_ != null && pf != null && pr_ !== 0) px.hysteresis_index = (pr_ - pf) / pr_
          }
          pixels.push(px)
        } catch (e: any) {
          logs.push({ level: 'warn', message: `${label}: skipped — ${e?.message ?? e}` })
        }
        logs.forEach((l) => log.push({ ...l, message: `${f.name}: ${pr.label ? `[${pr.label}] ` : ''}${l.message}` }))
      }
      if (!pixels.length) throw new Error('All devices failed analysis. Check your data file.')
      out.push({ name: f.name, pixels })
    } catch (e: any) {
      log.push({ level: 'error', message: `${f.name}: ${e?.message ?? e}` })
    }
  }
  if (!out.length) throw new Error(log.map((l) => l.message).join('; ') || 'No files could be analysed')

  const pick = (px: Pixel) => px.reverse ?? px.forward ?? {}
  const summary: AnalysisResponse['summary'] = {}
  const statistics: NonNullable<AnalysisResponse['statistics']> = []
  for (const [, k] of KEYS) {
    const vals = out.flatMap((f) => f.pixels.map((px) => pick(px)[k])).filter((v): v is number => v != null)
    if (!vals.length) continue
    const m = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = vals.length > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1)) : 0
    summary[k] = { mean: m, std: sd }
    statistics.push({ key: k, mean: m, std: sd, min: Math.min(...vals), max: Math.max(...vals) })
  }

  const order = KEYS.filter(([, k]) => p.advanced || !ADV.has(k))
  const wb = XLSX.utils.book_new()
  const val = (px: Pixel, d: 'forward' | 'reverse', k: MetricKey) => px[d]?.[k] ?? null
  if (out.length === 1) {
    const pxs = out[0].pixels, hasF = pxs.some((x) => x.forward)
    const rows = pxs.map((px) => {
      const r: Record<string, unknown> = { Pixel: px.label }
      for (const [n, k] of order) {
        if (hasF) { r[`${n}  Forward`] = val(px, 'forward', k); r[`${n}  Reverse`] = val(px, 'reverse', k) }
        else r[n] = val(px, 'reverse', k)
      }
      return r
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'JV Parameters')
  } else {
    for (const [n, k] of order) {
      const len = Math.max(...out.map((f) => f.pixels.length))
      const cols: [string, (number | null)[]][] = [[n, new Array(len).fill(null)]]
      for (const f of out) {
        const stem = f.name.replace(/\.[^.]+$/, ''), pad = (v: (number | null)[]) => [...v, ...new Array(len - v.length).fill(null)]
        if (f.pixels.some((x) => x.forward)) {
          cols.push([`${stem}(fwd)`, pad(f.pixels.map((x) => val(x, 'forward', k)))], [`${stem}(rev)`, pad(f.pixels.map((x) => val(x, 'reverse', k)))])
        } else cols.push([stem, pad(f.pixels.map((x) => val(x, 'reverse', k)))])
      }
      const aoa = [cols.map((c) => c[0]), ...Array.from({ length: len }, (_, r) => cols.map((c) => c[1][r]))]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n.replace(/[[\]:*?/\\]/g, '_').slice(0, 31))
    }
  }
  const xbuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const head = ['File', 'Pixel', 'Scan', ...KEYS.map(([, k]) => k)]
  const lines = [head.join(',')]
  for (const f of out) for (const px of f.pixels) for (const d of ['reverse', 'forward'] as const) {
    if (px[d]) lines.push([JSON.stringify(f.name), JSON.stringify(px.label), d, ...KEYS.map(([, k]) => px[d]![k] ?? '')].join(','))
  }
  return {
    files: out, summary, statistics, log,
    exports: {
      xlsx: await toDataUrl(new Blob([xbuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
      csv: await toDataUrl(new Blob([lines.join('\n')], { type: 'text/csv' })),
    },
  }
}
