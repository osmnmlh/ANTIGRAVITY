import { useEffect, useState } from 'react'
import { listScenarios, resetDemo, runScenario } from './api'
import { AI_LABELS as L } from './labels'
import './ai.css'

const STAR = ['cabin-gas-leak', 'cabin-hypoxia', 'solar-event', 'orthostatic'] // demo must-haves first

/** Stage buttons that fire the backend demo scenarios (POST /api/ai/demo/:id) and reset them. */
export function AiDemoControls() {
  const [scenarios, setScenarios] = useState<string[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listScenarios()
      .then((ids) => setScenarios([...ids].sort((a, b) => (STAR.includes(b) ? 1 : 0) - (STAR.includes(a) ? 1 : 0))))
      .catch(() => setError(L.offline))
  }, [])

  async function run(id: string, fn: () => Promise<unknown>) {
    setRunning(id)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setRunning(null)
  }

  return (
    <section className="ai-demo" aria-label={L.demoTitle} data-testid="ai-demo">
      <p className="ai-list-title">{L.demoTitle}</p>
      <div className="ai-demo-grid">
        {scenarios.map((id) => (
          <button key={id} type="button" className={`ai-chip ${STAR.includes(id) ? 'is-star' : ''}`}
            disabled={running !== null} onClick={() => void run(id, () => runScenario(id))} data-testid={`ai-demo-${id}`}>
            {running === id ? L.demoRunning : L.scenarios[id] ?? id}
          </button>
        ))}
        <button type="button" className="ai-chip ai-chip-reset" disabled={running !== null}
          onClick={() => void run('reset', resetDemo)} data-testid="ai-demo-reset">
          ↺ {L.demoReset}
        </button>
      </div>
      {error && <p className="ai-error" data-testid="ai-demo-error">{error}</p>}
    </section>
  )
}
