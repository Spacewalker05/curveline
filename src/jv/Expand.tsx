// @ts-nocheck — ported verbatim from curveline (written for a looser TS config)
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Plotly from 'plotly.js-cartesian-dist-min'
import { tr } from './ui'

export function ExpandButton({ getEl, title }: { getEl: () => HTMLElement | null; title: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} title="Enlarge and interact" className={`h-8 w-8 rounded-lg border border-line text-fg grid place-items-center cursor-pointer hover:border-accent hover:text-accent hover:scale-[1.04] ${tr}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
      {open && <Modal getEl={getEl} title={title} onClose={() => setOpen(false)} />}
    </>
  )
}

function Modal({ getEl, title, onClose }: { getEl: () => HTMLElement | null; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const src: any = getEl()
    const el = ref.current
    if (!src || !el) return
    const data = JSON.parse(JSON.stringify(src.data ?? []))
    const layout = JSON.parse(JSON.stringify(src.layout ?? {}))
    delete layout.width
    delete layout.height
    layout.autosize = true
    layout.margin = { ...layout.margin, t: Math.max(layout.margin?.t ?? 0, 56) }
    layout.dragmode = 'zoom'
    Plotly.react(el, data, layout, { displaylogo: false, responsive: true, displayModeBar: true, scrollZoom: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'] })
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', key)
      document.body.style.overflow = ''
      Plotly.purge(el)
    }
  }, [])

  return createPortal(
    <div className="fade-in fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm p-4 sm:p-8 grid" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rise bg-surface border border-line rounded-2xl shadow-card flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-line">
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="flex items-center gap-3 text-xs text-dim">
            <span className="hidden sm:inline">Drag to zoom · double-click to reset · Esc to close</span>
            <button onClick={onClose} className={`h-8 w-8 rounded-lg border border-line text-fg grid place-items-center cursor-pointer hover:border-accent hover:text-accent ${tr}`} aria-label="Close">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div ref={ref} className="flex-1 min-h-0 p-2" />
      </div>
    </div>,
    document.body,
  )
}
