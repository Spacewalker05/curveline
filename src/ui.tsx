import { useRef, useState, type ReactNode } from 'react'

export const card = 'rise bg-surface border border-line rounded-2xl shadow-card'
export const sectionLabel = 'text-[10.5px] font-semibold uppercase tracking-[0.14em] text-dim'
export const tr = 'transition-all duration-150 ease-out'
export const ghostBtn = `h-9 px-4 rounded-lg border border-line bg-surface text-xs font-medium text-fg cursor-pointer hover:border-accent hover:scale-[1.02] ${tr}`
export const primaryBtn = `w-full h-12 rounded-xl bg-accent text-on-accent font-semibold text-sm cursor-pointer hover:bg-accent-hover hover:scale-[1.02] hover:shadow-[0_0_24px_rgba(217,119,87,0.35)] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none ${tr} outline-none focus-visible:ring-2 focus-visible:ring-accent/60`
export const cv = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()

export function Section({ title }: { title: string }) {
  return (
    <div className="mt-8 mb-3.5">
      <div className={sectionLabel}>{title}</div>
      <div className="h-px bg-line mt-2" />
    </div>
  )
}

export function Field({ label, unit, value, onChange, placeholder, step = 'any' }: { label: string; unit?: string; value: string; onChange: (v: string) => void; placeholder?: string; step?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1.5">{label}</span>
      <span className={`flex items-center bg-panel border border-line rounded-lg px-3 h-10 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30 ${tr}`}>
        <input type="number" step={step} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full min-w-0 bg-transparent outline-none font-mono text-sm text-fg placeholder:text-dim" />
        {unit && <span className="font-mono text-xs text-dim ml-2 shrink-0">{unit}</span>}
      </span>
    </label>
  )
}

export function TextField({ label, unit, value, onChange, placeholder }: { label: string; unit?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1.5">{label}</span>
      <span className={`flex items-center bg-panel border border-line rounded-lg px-3 h-10 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30 ${tr}`}>
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full min-w-0 bg-transparent outline-none font-mono text-sm text-fg placeholder:text-dim" />
        {unit && <span className="font-mono text-xs text-dim ml-2 shrink-0">{unit}</span>}
      </span>
    </label>
  )
}

export function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-b-0">
      <div>
        <div className="text-sm text-fg">{label}</div>
        {sub && <div className="text-xs text-dim mt-0.5">{sub}</div>}
      </div>
      <button
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative w-9 h-5 rounded-full shrink-0 cursor-pointer border ${tr} focus-visible:ring-2 focus-visible:ring-accent/50 outline-none ${on ? 'bg-accent border-accent' : 'bg-panel border-line'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full ${tr} ${on ? 'translate-x-4 bg-on-accent' : 'bg-muted'}`} />
      </button>
    </div>
  )
}

export function Check({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button onClick={onChange} className={`flex items-center gap-2 text-xs cursor-pointer ${tr} ${on ? 'text-fg' : 'text-dim'} hover:text-fg`}>
      <span className={`w-3.5 h-3.5 rounded border grid place-items-center ${tr} ${on ? 'bg-accent border-accent' : 'border-line'}`}>
        {on && (
          <svg className="text-on-accent" width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 5.5l2 2 4-4.5" />
          </svg>
        )}
      </span>
      {label}
    </button>
  )
}

function PanelToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={open ? 'Hide side panel' : 'Show side panel'} title={open ? 'Hide side panel' : 'Show side panel'} className={`w-9 h-9 -ml-2 grid place-items-center rounded-lg text-muted hover:bg-panel hover:text-fg cursor-pointer ${tr}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
        <path d="M9.5 4.5v15" />
        {open && <path d="M6 9.5v5" strokeWidth="2.2" />}
      </svg>
    </button>
  )
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} aria-label="Back" className={`group -mt-1 mb-5 flex items-center gap-2 h-9 px-3 -ml-1 rounded-lg text-xs font-medium text-muted hover:bg-panel hover:text-fg cursor-pointer ${tr}`}>
      <svg className="transition-transform duration-150 group-hover:-translate-x-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      Back
    </button>
  )
}

export function ThemeButton({ dark, setDark }: { dark: boolean; setDark: (v: boolean) => void }) {
  return (
    <button onClick={() => setDark(!dark)} className={ghostBtn}>
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  )
}

export const Brand = () => <span className="text-[15px] font-semibold tracking-tight">JV Analyzer</span>

export function DropZone({ accept, label, onFiles }: { accept: string; label: string; onFiles: (f: File[]) => void }) {
  const [drag, setDrag] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        onFiles(Array.from(e.dataTransfer.files))
      }}
      onClick={() => ref.current?.click()}
      className={`bg-surface border border-dashed rounded-xl px-4 py-6 text-center cursor-pointer ${tr} ${drag ? 'border-accent bg-panel' : 'border-line hover:border-dim'}`}
    >
      <input
        ref={ref}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <svg className="mx-auto text-muted" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 16V4m0 0L7 9m5-5l5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
      </svg>
      <div className="text-sm text-muted mt-2.5">{label}</div>
      <div className="text-xs text-dim mt-1">or</div>
      <span className={`inline-block mt-2.5 px-5 h-8 leading-8 rounded-lg bg-accent text-on-accent text-xs font-semibold hover:bg-accent-hover ${tr}`}>Browse…</span>
    </div>
  )
}

export function FileChips({ names, onRemove }: { names: string[]; onRemove: (i: number) => void }) {
  if (!names.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {names.map((n, i) => (
        <span key={n + i} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 h-7 rounded-full bg-panel border border-line text-xs font-mono text-fg max-w-full">
          <span className="truncate">{n}</span>
          <button aria-label={`Remove ${n}`} onClick={() => onRemove(i)} className={`w-4 h-4 grid place-items-center rounded-full text-muted hover:bg-line hover:text-fg cursor-pointer ${tr}`}>
            ×
          </button>
        </span>
      ))}
    </div>
  )
}

const asideCls = (open: boolean) =>
  `shrink-0 lg:h-full flex flex-col bg-bg border-line overflow-hidden slide-in transition-[width,opacity] duration-300 ease-out ${open ? 'lg:w-[320px] border-b lg:border-b-0 lg:border-r opacity-100' : 'lg:w-0 h-0 lg:h-full opacity-0 pointer-events-none'}`

export function Shell({ crumb, dark, setDark, onBack, sidebar, action, status, children }: { crumb: string; dark: boolean; setDark: (v: boolean) => void; onBack: () => void; sidebar: ReactNode; action: ReactNode; status: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="h-full flex flex-col bg-bg text-fg">
      <header className="shrink-0 h-16 px-6 flex items-center gap-3.5 bg-bg border-b border-line">
        <PanelToggle open={open} onClick={() => setOpen(!open)} />
        <Brand />
        <span className="text-dim">/</span>
        <div className="text-sm text-muted">{crumb}</div>
        <div className="ml-auto">
          <ThemeButton dark={dark} setDark={setDark} />
        </div>
      </header>
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <aside className={asideCls(open)}>
          <div className="flex flex-col flex-1 min-h-0 lg:w-[320px]">
            <div className="flex-1 overflow-y-auto scroll-quiet px-5 pt-5 pb-4">
              <BackRow onBack={onBack} />
              {sidebar}
            </div>
            <div className="p-5 border-t border-line bg-bg">{action}</div>
          </div>
        </aside>
        <main className="fade-in flex-1 min-w-0 h-full overflow-y-auto scroll-quiet bg-panel/40 flex flex-col">{children}</main>
      </div>
      <footer className="shrink-0 h-8 px-5 flex items-center justify-between bg-surface border-t border-line text-[11px] text-dim">
        <span className="flex items-center gap-2">{status}</span>
        <span className="font-mono">v1.7.2</span>
      </footer>
    </div>
  )
}
