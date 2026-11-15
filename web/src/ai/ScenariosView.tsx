import { useEffect, useRef, useState } from 'react'
import { astronautProfiles, type ScenarioState } from '../data/useHealthData'
import { getStatus } from '../domain/thresholds'
import { metricDefinitions, type HealthType } from '../domain/types'
import { listScenarios, resetDemo, runScenario } from './api'
import { AI_LABELS as L } from './labels'
import { AI_SCENARIOS, HAZARD_TR } from './scenarios'
import './scenarios-view.css'

interface Playing {
  id: string
  crewIds: string[]
  endsAt: number
  durationMs: number
}

export interface ScenariosViewProps {
  /** The astronaut selected in the web UI: one-astronaut scenarios happen to them. */
  crewId: string
  onCrewChange: (crewId: string) => void
  /** Live scenario state from /api/stream (`scenario` event). */
  scenario: ScenarioState
  onOpenBase: () => void
  onOpenAstronaut: (crewId: string) => void
}

const CABIN_LABELS: Record<string, string> = {
  ppO2: 'Kabin oksijeni',
  ppCO2: 'Kabin CO2',
  pressure: 'Kabin basıncı',
  temperature: 'Kabin sıcaklığı',
  humidity: 'Nem',
  contaminant: 'Gaz (amonyak)',
  radiationRate: 'Radyasyon hızı',
  lifeSupportPower: 'Yaşam destek gücü',
}

const crewName = (id: string) => astronautProfiles.find((a) => a.id === id)?.name ?? id
const fmt = (v: number | string | null | undefined) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v ?? '–'

function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  if (values.length < 2) return <svg className="scenario-spark" aria-hidden="true" viewBox="0 0 100 28" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${26 - ((v - min) / span) * 24}`)
    .join(' ')
  return (
    <svg className={`scenario-spark tone-${tone}`} aria-hidden="true" viewBox="0 0 100 28" preserveAspectRatio="none">
      <polyline points={points} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * "Senaryolar" workspace: the showcase scenarios of the relay (POST /api/ai/demo/:id).
 * A scenario plays for a fixed time (the relay answers with `durationMs`, 15 s by default) on the web,
 * every phone and every watch at once; the relay moves the values once a second, so the live panel below
 * (and the astronaut's own vitals) change while it plays. Then everything goes back to normal by itself.
 */
export function ScenariosView({ crewId, onCrewChange, scenario, onOpenBase, onOpenAstronaut }: ScenariosViewProps) {
  const [available, setAvailable] = useState<string[] | null>(null)
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // Values seen during the playing scenario, per "crewId:type" or "cabin:metric", for the sparklines.
  const history = useRef<{ key: string; values: Map<string, number[]> }>({ key: '', values: new Map() })

  useEffect(() => {
    listScenarios()
      .then((ids) => setAvailable(ids))
      .catch(() => setOffline(true))
  }, [])

  // The relay's state wins: it also covers a scenario started from another screen.
  useEffect(() => {
    if (!scenario.active) {
      setPlaying((current) => (current && Date.now() < current.endsAt - 1500 ? current : null))
      return
    }
    if (!scenario.id || !scenario.endsAt) return
    const endsAt = Date.parse(scenario.endsAt)
    setPlaying({ id: scenario.id, crewIds: scenario.crewIds ?? [], endsAt, durationMs: scenario.durationMs || 15_000 })
  }, [scenario])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= playing.endsAt + 2000) setPlaying(null) // relay did not report the end: stop the countdown anyway
    }, 200)
    return () => window.clearInterval(timer)
  }, [playing])

  if (scenario.active) {
    const key = `${scenario.id}|${scenario.startedAt}`
    if (history.current.key !== key) history.current = { key, values: new Map() }
    const push = (k: string, v: unknown, from: unknown) => {
      if (typeof v !== 'number') return
      const list = history.current.values.get(k) ?? (typeof from === 'number' ? [from] : [])
      if (list[list.length - 1] !== v || list.length < 2) list.push(v)
      history.current.values.set(k, list.slice(-30))
    }
    for (const v of scenario.vitals ?? []) push(`${v.crewId}:${v.type}`, v.value, v.from)
    for (const c of scenario.cabin ?? []) push(`cabin:${c.metric}`, c.value, c.from)
  }

  async function start(id: string, scope: 'cabin' | 'crew') {
    setBusy(true)
    setError(null)
    try {
      const result = await runScenario(id, scope === 'crew' ? crewId : undefined)
      const durationMs = result.durationMs > 0 ? result.durationMs : 15_000
      const startedAt = Date.now()
      setNow(startedAt)
      setPlaying({ id, crewIds: scope === 'crew' ? [crewId] : [], endsAt: startedAt + durationMs, durationMs })
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
  const live = scenario.active ? scenario : null
  const liveCrewIds = live ? [...new Set((live.vitals ?? []).map((v) => v.crewId))] : []

  return (
    <section className="scenarios-view" data-testid="scenarios-view">
      <header className="scenarios-head">
        <div>
          <h1>Senaryolar</h1>
          <p>
            Bir senaryo başlatınca değerler 15 saniye boyunca canlı değişir: burada, astronotun kendi ekranında, iPhone’unda
            ve Apple Watch’unda aynı anda izlenir. Tek astronotluk senaryolar seçili astronotta oynar. Süre dolunca her şey
            kendiliğinden normale döner.
          </p>
        </div>
        <div className="scenarios-head-actions">
          <label className="scenario-crew">
            <span>Seçili astronot</span>
            <select
              data-testid="scenario-crew-select"
              value={crewId}
              onChange={(event) => onCrewChange(event.target.value)}
            >
              {astronautProfiles.map((astronaut) => (
                <option key={astronaut.id} value={astronaut.id}>{astronaut.name}</option>
              ))}
            </select>
          </label>
          {(playing || live) && (
            <button className="scenarios-reset" data-testid="ai-demo-reset" disabled={busy} onClick={() => void reset()} type="button">
              ■ Hemen durdur
            </button>
          )}
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
            <strong>Simülasyon sürüyor: {playingScenario.title}</strong>
            <span>
              {playing.crewIds.length === 1 && playingScenario.scope === 'crew'
                ? `${crewName(playing.crewIds[0])} için`
                : 'Tüm kabinde'}{' '}
              oynatılıyor · {Math.ceil(remainingMs / 1000)} sn kaldı
            </span>
          </div>
          <div className="scenarios-progress" aria-hidden="true">
            <i style={{ width: `${(remainingMs / playing.durationMs) * 100}%` }} />
          </div>
        </div>
      )}

      {live && (
        <section className="scenario-live" data-testid="scenario-live" aria-label="Canlı senaryo verileri">
          <header>
            <h2>Canlı veriler</h2>
            <small>Her saniye güncellenir · simüle edilmiş değerler · demo, tıbbi cihaz değildir</small>
          </header>
          <div className="scenario-live-grid">
            {liveCrewIds.map((id) => (
              <article className="scenario-live-crew" key={id} data-testid={`scenario-live-${id}`}>
                <header>
                  <strong>{crewName(id)}</strong>
                  <button type="button" className="scenarios-link small" onClick={() => onOpenAstronaut(id)}>
                    Astronota git
                  </button>
                </header>
                <ul>
                  {(live.vitals ?? []).filter((v) => v.crewId === id).map((v) => {
                    const status = getStatus(v.type as HealthType, v.value)
                    const def = metricDefinitions[v.type as HealthType]
                    return (
                      <li key={v.type} className={`tone-${status}`}>
                        <span className="scenario-live-label">{def?.shortLabel ?? v.type}</span>
                        <span className="scenario-live-from">{fmt(v.from)} →</span>
                        <b className="scenario-live-value" data-testid={`scenario-value-${id}-${v.type}`}>
                          {fmt(v.value)} <small>{def?.displayUnit ?? v.unit}</small>
                        </b>
                        <Sparkline values={history.current.values.get(`${id}:${v.type}`) ?? []} tone={status} />
                      </li>
                    )
                  })}
                </ul>
              </article>
            ))}
            {(live.cabin ?? []).length > 0 && (
              <article className="scenario-live-crew" data-testid="scenario-live-cabin">
                <header><strong>Kabin</strong></header>
                <ul>
                  {(live.cabin ?? []).map((c) => (
                    <li key={c.metric} className={`tone-${c.status}`}>
                      <span className="scenario-live-label">{CABIN_LABELS[c.metric] ?? c.metric}</span>
                      <span className="scenario-live-from">{fmt(c.from)} →</span>
                      <b className="scenario-live-value">{fmt(c.value)} <small>{c.unit}</small></b>
                      <Sparkline values={history.current.values.get(`cabin:${c.metric}`) ?? []} tone={c.status} />
                    </li>
                  ))}
                </ul>
              </article>
            )}
          </div>
        </section>
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
                <p className="scenario-target" data-testid={`scenario-target-${scenario.id}`}>
                  Kimde oynar: <strong>{crewName(crewId)}</strong> (seçili astronot)
                </p>
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
