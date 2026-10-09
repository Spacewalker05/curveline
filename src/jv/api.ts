// Shared types for the JV analysis UI. Analysis runs in the browser (see core.ts).


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

import { analyzeFiles } from './core'

// Analysis runs fully in the browser (port of the Python backend).
export async function runAnalysis(files: File[], params: AnalysisParams): Promise<AnalysisResponse> {
  return analyzeFiles(files, params)
}
