import { useEffect, useState } from 'react'
import { astronautProfiles } from '../data/useHealthData'
import { listScenarios, resetDemo, runScenario } from './api'
import { AI_LABELS as L } from './labels'
import { AI_SCENARIOS, HAZARD_TR } from './scenarios'
import './scenarios-view.css'

interface Playing {
  id: string
  crewName: string | null
  endsAt: number
  durationMs: number
}

/**
 * "Senaryolar" workspace: the showcase scenarios of the relay (POST /api/ai/demo/:id).
 * A scenario plays for a fixed time (the relay answers with `durationMs`, 15 s by default) on the web,
 * every phone and every watch at once, then everything goes back to normal by itself.
 */
export function ScenariosView({ onOpenBase }: { onOpenBase: () => void }) {
  const [available, setAvailable] = useState<string[] | null>(null)
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [crewId, setCrewId] = useState(astronautProfiles[0].id)

  useEffect(() => {
    listScenarios()
      .then((ids) => setAvailable(ids))
      .catch(() => setOffline(true))
  }, [])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= playing.endsAt) setPlaying(null)
    }, 200)
    return () => window.clearInterval(timer)
  }, [playing])

  async function start(id: string, scope: 'cabin' | 'crew') {
    setBusy(true)
    setError(null)
    try {
      const result = await runScenario(id, scope === 'crew' ? crewId : undefined)
      const durationMs = result.durationMs > 0 ? result.durationMs : 15_000
      const crew = astronautProfiles.find(({ id: profileId }) => profileId === crewId)
      const startedAt = Date.now()
      setNow(startedAt)
      setPlaying({ id, crewName: scope === 'crew' ? crew?.name ?? null : null, endsAt: startedAt + durationMs, durationMs })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  async function reset() {
    setBusy(true)
    setError(null)
    try {
      await resetDemo()
      setPlaying(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const scenarios = available ? AI_SCENARIOS.filter(({ id }) => available.includes(id)) : AI_SCENARIOS
  const remainingMs = playing ? Math.max(0, playing.endsAt - now) : 0
  const playingScenario = playing ? AI_SCENARIOS.find(({ id }) => id === playing.id) : null

  return (
    <section className="scenarios-view" data-testid="scenarios-view">
      <header className="scenarios-head">
        <div>
          <h1>Senaryolar</h1>
          <p>
            Bir senaryo başlatınca uyarı web’de, ilgili astronotların iPhone’unda ve Apple Watch’unda aynı anda çalışır.
            Süre dolunca her şey kendiliğinden normale döner.
          </p>
        </div>
        <div className="scenarios-head-actions">
          <button className="scenarios-reset" data-testid="ai-demo-reset" disabled={busy} onClick={() => void reset()} type="button">
            ■ Hemen durdur
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
      {error && (
        <p className="scenarios-note is-error" data-testid="ai-demo-error" role="alert">
          {error}
        </p>
      )}
      {playing && playingScenario && (
        <div className="scenarios-playing" data-testid="scenario-playing" role="status">
          <div>
            <strong>{playingScenario.title}</strong>
            <span>
              {playing.crewName ? `${playing.crewName} için` : 'Tüm kabinde'} oynatılıyor · {Math.ceil(remainingMs / 1000)} sn kaldı
            </span>
          </div>
          <div className="scenarios-progress" aria-hidden="true">
            <i style={{ width: `${(remainingMs / playing.durationMs) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="scenarios-grid">
        {scenarios.map((scenario) => {
          const isPlaying = playing?.id === scenario.id
          return (
            <article
              className={`scenario-card severity-${scenario.severity} ${isPlaying ? 'is-playing' : ''}`}
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
              {scenario.scope === 'crew' && (
                <label className="scenario-crew">
                  <span>Kimde olsun</span>
                  <select value={crewId} onChange={(event) => setCrewId(event.target.value)}>
                    {astronautProfiles.map((astronaut) => (
                      <option key={astronaut.id} value={astronaut.id}>{astronaut.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <footer>
                <small>{HAZARD_TR[scenario.hazard]}</small>
                <button
                  className="scenario-run"
                  data-testid={`ai-demo-${scenario.id}`}
                  disabled={busy || offline || playing !== null}
                  onClick={() => void start(scenario.id, scenario.scope)}
                  type="button"
                >
                  {isPlaying ? 'Oynatılıyor…' : 'Senaryoyu başlat'}
                </button>
              </footer>
            </article>
          )
        })}
      </div>
    </section>
  )
}
