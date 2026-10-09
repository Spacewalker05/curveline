import { useEffect, useState } from 'react'
import Analysis from './Analysis'
import Home, { type Mode } from './Home'
import Plotting from './Plotting'

export default function App() {
  const [mode, setMode] = useState<Mode | null>(null)
  const [dark, setDark] = useState(false)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  const [splash, setSplash] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1500)
    return () => clearTimeout(t)
  }, [])
  const back = () => setMode(null)
  return (
    <>
    {splash && (
      <div className="splash fixed inset-0 z-[100] grid place-items-center bg-bg pointer-events-none">
        <div>
          <div className="splash-word text-4xl font-semibold text-fg">JV Analyzer</div>
          <div className="splash-line h-0.5 mt-3 rounded-full bg-accent" />
        </div>
      </div>
    )}
    {!splash && <div key={mode ?? "home"} className="h-full fade-in">
      {!mode ? <Home onOpen={setMode} dark={dark} setDark={setDark} /> : mode === 'plot' ? <Plotting onBack={back} dark={dark} setDark={setDark} /> : <Analysis onBack={back} dark={dark} setDark={setDark} />}
    </div>}
    </>
  )
}
