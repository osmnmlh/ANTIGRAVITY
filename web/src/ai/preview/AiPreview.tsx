// Dev-only sandbox for the AI components (open /ai-preview.html under `npm run dev`).
// It mimics the two web views (cockpit → astronaut) without touching App.tsx. Not part of the production build.

import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import allData from '../../../../shared/mock/all-data.json'
import { AiChat, AiDemoControls, AlertCenter, DevicesPanel, askAi, useAiState } from '..'
import '../../theme.css'
import '../../index.css'
import '../../App.css'
import '../../cosmos-shell.css'

const crew = allData.astronauts.map((a) => ({ id: a.astronautId, name: a.fullName }))
const crewNames = Object.fromEntries(crew.map((c) => [c.id, c.name]))

function Preview() {
  const [selected, setSelected] = useState<string | null>(null)
  const { cabin } = useAiState()
  const person = crew.find((c) => c.id === selected)

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 16px 32px', display: 'grid', gap: 16 }}>
      <AlertCenter
        onOpenAstronaut={setSelected}
        onAskAi={(a) => askAi(`${a.title}. Şimdi ne yapmalıyız?`)}
      />
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="ai-btn" aria-pressed={!selected} onClick={() => setSelected(null)}>Kokpit</button>
        {crew.map((c) => (
          <button key={c.id} type="button" className="ai-btn" aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}>
            {c.name}
          </button>
        ))}
      </nav>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <section style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{person ? person.name : 'Kokpit'}</h1>
          {!person && cabin && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4, fontSize: 14 }}>
              {cabin.readings.map((r) => (
                <li key={r.metric} style={{ color: r.status === 'green' ? 'var(--green)' : r.status === 'amber' ? 'var(--amber)' : 'var(--red)' }}>
                  {r.metric}: {String(r.value)} {r.unit} · {r.status}
                </li>
              ))}
            </ul>
          )}
          <AiDemoControls />
          <DevicesPanel crewNames={crewNames} />
          <section className="ai-demo" aria-label="Test telefonları">
            <p className="ai-list-title">Test telefonları (yeni sekmede aç)</p>
            <div className="ai-demo-grid">
              {crew.map((c) => (
                <a key={c.id} className="ai-chip" href={`/phone.html?crewId=${c.id}`} target="_blank" rel="noreferrer" data-testid={`ai-open-phone-${c.id}`}>
                  {c.name}
                </a>
              ))}
            </div>
          </section>
        </section>
        <AiChat crewId={person?.id} crewName={person?.name} />
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
