import type { ReactNode } from 'react'
import { Brand, card, sectionLabel, ThemeButton, tr } from './ui'

export type Mode = 'params' | 'plot'

const cards: { mode: Mode; title: string; desc: string; items: string[]; art: ReactNode }[] = [
  {
    mode: 'params',
    title: 'Parameter Calculation',
    desc: 'Extract PCE, Voc, Jsc and fill factor from J–V scans — every pixel in a file, reverse and forward — with statistics and export.',
    items: ['KPI summary with ± std', 'All pixels in one table', 'Rs, Rsh, FF0, dFF', 'Excel and CSV export'],
    art: (
      <div className="grid grid-cols-2 gap-2 w-full">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg bg-bg border border-line px-3 py-2.5 space-y-2">
            <div className="h-1.5 w-8 rounded-full bg-line" />
            <div className="h-3 w-14 rounded-full bg-accent/70" />
          </div>
        ))}
      </div>
    ),
  },
  {
    mode: 'plot',
    title: 'Plotting',
    desc: 'Upload an Excel table of Voc, FF, PCE or any parameter across samples and get clean scatter plots, per file and combined.',
    items: ['One figure per file', 'Combined figure across files', 'Mean and ± std overlays', 'Export every plot as PNG'],
    art: (
      <svg viewBox="0 0 200 90" className="w-full text-accent" fill="none" strokeLinecap="round">
        <path d="M10 10V80H190" stroke="var(--c-line)" strokeWidth="1.5" />
        {[[40, 40], [58, 34], [74, 46], [96, 38], [118, 50], [138, 36], [160, 44]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y + 8} r="5" fill="currentColor" opacity={0.85} />
        ))}
        <path d="M24 52H178" stroke="var(--c-muted)" strokeWidth="1.2" strokeDasharray="4 4" />
      </svg>
    ),
  },
]

export default function Home({ onOpen, dark, setDark }: { onOpen: (m: Mode) => void; dark: boolean; setDark: (v: boolean) => void }) {
  return (
    <div className="h-full flex flex-col bg-bg text-fg overflow-y-auto scroll-quiet">
      <header className="fade-in shrink-0 h-16 px-6 flex items-center border-b border-line">
        <Brand />
        <div className="ml-auto">
          <ThemeButton dark={dark} setDark={setDark} />
        </div>
      </header>
      <main className="flex-1 grid place-items-center px-6 py-12">
        <div className="w-full max-w-[920px]">
          <div className={`${sectionLabel} rise`}>Solar Cell Parameter Extraction</div>
          <h1 style={{ ['--d' as any]: '80ms' }} className="rise mt-4 text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.08] max-w-[640px]">
            What would you like to do today?
          </h1>
          <p style={{ ['--d' as any]: '160ms' }} className="rise mt-4 text-muted max-w-[520px]">
            Calculate device parameters or visualise parameter data across samples. Each workflow has its own workspace.
          </p>
          <div className="grid md:grid-cols-2 gap-5 mt-10">
            {cards.map((c, ci) => (
              <button key={c.mode} style={{ ['--d' as any]: `${260 + ci * 110}ms` }} onClick={() => onOpen(c.mode)} className={`${card} group text-left p-6 cursor-pointer hover:border-accent hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(217,119,87,0.14)] ${tr} outline-none focus-visible:ring-2 focus-visible:ring-accent/50`}>
                <div className="h-[110px] rounded-xl bg-panel/60 border border-line p-4 grid place-items-center">{c.art}</div>
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-lg font-semibold tracking-tight">{c.title}</div>
                  <span className={`w-8 h-8 rounded-full border border-line grid place-items-center text-muted group-hover:bg-accent group-hover:border-accent group-hover:text-on-accent ${tr}`}>→</span>
                </div>
                <p className="text-sm text-muted mt-2 leading-relaxed">{c.desc}</p>
                <ul className="mt-5 space-y-2 border-t border-line pt-4">
                  {c.items.map((i) => (
                    <li key={i} className="flex items-center gap-2.5 text-xs text-fg">
                      <span className="w-1 h-1 rounded-full bg-accent" />
                      {i}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
