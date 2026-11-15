import { useEffect, useState } from 'react'
import { listScenarios, resetDemo, runScenario } from './api'
import { AI_LABELS as L } from './labels'
import { AI_SCENARIOS, HAZARD_TR } from './scenarios'
import './scenarios-view.css'

type Outcome = { id: string; kind: 'sent' | 'error'; text: string }

/**
 * "Senaryolar" workspace: one large card per backend demo scenario (POST /api/ai/demo/:id).
 * Ids come from the relay (GET /api/ai/demo); the texts come from scenarios.ts.
 */
export function ScenariosView({ onOpenBase }: { onOpenBase: () => void }) {
  const [available, setAvailable] = useState<string[] | null>(null)
  const [offline, setOffline] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  useEffect(() => {
    listScenarios()
      .then((ids) => setAvailable(ids))
      .catch(() => setOffline(true))
  }, [])

  async function run(id: string, action: () => Promise<unknown>, sentText: string) {
    setRunning(id)
    setOutcome(null)
    try {
      await action()
      setOutcome({ id, kind: 'sent', text: sentText })
    } catch (error) {
      setOutcome({ id, kind: 'error', text: error instanceof Error ? error.message : String(error) })
    }
    setRunning(null)
  }

  const scenarios = available ? AI_SCENARIOS.filter(({ id }) => available.includes(id)) : AI_SCENARIOS
  const unlisted = available ? available.filter((id) => !AI_SCENARIOS.some((scenario) => scenario.id === id)) : []

  return (
    <section className="scenarios-view" data-testid="scenarios-view">
      <header className="scenarios-head">
        <div>
          <h1>Senaryolar</h1>
          <p>
            Bir senaryo başlattığında uyarı, ilgili astronotların ekranına ve telefonuna düşer.
            Sonucu Ana üs sekmesindeki uyarı merkezinde görürsün.
          </p>
        </div>
        <div className="scenarios-head-actions">
          <button
            className="scenarios-reset"
            data-testid="ai-demo-reset"
            disabled={running !== null}
            onClick={() => void run('reset', resetDemo, 'Senaryolar sıfırlandı. Uyarılar temizlendi.')}
            type="button"
          >
            ↺ {L.demoReset}
          </button>
          <button className="scenarios-link" onClick={onOpenBase} type="button">
            Uyarı merkezine git
          </button>
        </div>
      </header>

      {offline && (
        <p className="scenarios-note is-error" role="alert">
          {L.offlineHint} Senaryolar yalnızca backend açıkken başlatılabilir.
        </p>
      )}
      {outcome && (
        <p
          className={`scenarios-note ${outcome.kind === 'error' ? 'is-error' : 'is-ok'}`}
          data-testid="ai-demo-error"
          role={outcome.kind === 'error' ? 'alert' : 'status'}
        >
          {outcome.text}
        </p>
      )}

      <div className="scenarios-grid">
        {scenarios.map((scenario) => {
          const isRunning = running === scenario.id
          return (
            <article
              className={`scenario-card severity-${scenario.severity} ${outcome?.id === scenario.id && outcome.kind === 'sent' ? 'is-sent' : ''}`}
              data-testid={`scenario-${scenario.id}`}
              key={scenario.id}
            >
              <div className="scenario-tags">
                <span className={`scenario-tag severity-${scenario.severity}`}>
                  {scenario.severity === 'red' ? 'Kritik' : 'Dikkat'}
                </span>
                <span className="scenario-tag">{scenario.scope === 'cabin' ? 'Tüm kabin' : 'Tek astronot'}</span>
              </div>
              <h2>{scenario.title}</h2>
              <p>{scenario.description}</p>
              <footer>
                <small>{HAZARD_TR[scenario.hazard]}</small>
                <button
                  className="scenario-run"
                  data-testid={`ai-demo-${scenario.id}`}
                  disabled={running !== null || offline}
                  onClick={() => void run(scenario.id, () => runScenario(scenario.id), `“${scenario.title}” başlatıldı. Uyarı Ana üs sekmesinde.`)}
                  type="button"
                >
                  {isRunning ? L.demoRunning : 'Senaryoyu başlat'}
                </button>
              </footer>
            </article>
          )
        })}
        {unlisted.map((id) => (
          <article className="scenario-card" key={id}>
            <h2>{L.scenarios[id] ?? id}</h2>
            <p>Bu senaryo backend’de var; açıklaması henüz eklenmedi.</p>
            <footer>
              <small>{id}</small>
              <button
                className="scenario-run"
                disabled={running !== null || offline}
                onClick={() => void run(id, () => runScenario(id), `“${id}” başlatıldı.`)}
                type="button"
              >
                {running === id ? L.demoRunning : 'Senaryoyu başlat'}
              </button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}
