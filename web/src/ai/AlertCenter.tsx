import { useEffect, useRef, useState } from 'react'
import { ackAlert } from './api'
import { aiStore, useAiState } from './aiStore'
import { AI_LABELS as L } from './labels'
import type { Alert } from './types'
import { announce, isVoiceEnabled, speak, toggleVoice, useVoiceEnabled } from './voice'
import './ai.css'

export interface AlertCenterProps {
  /** Detail view navigation, e.g. (crewId) => setSelected(crewId). Hidden when not given. */
  onOpenAstronaut?: (crewId: string) => void
  /** Opens the chat about this alert. Hidden when not given. */
  onAskAi?: (alert: Alert) => void
  /** Phone mode (phone.html): acknowledge as this device, vibrate, and raise a system notification when the page is hidden. */
  deviceId?: string
}

const ICON = { red: '⚠', amber: '!' } as const

function DeliveryBadge({ alert }: { alert: Alert }) {
  const total = alert.deliveries.length
  if (total === 0) return null // phone fan-out is optional scope: show only when phones are registered
  const delivered = alert.deliveries.filter((d) => d.deliveredAt).length
  const acked = alert.deliveries.filter((d) => d.ackedAt).length
  return <p className="ai-delivery" data-testid="ai-alert-delivery">{L.delivery(delivered, total, acked)}</p>
}

function AlertPopup({ alert, queued, onClose, onOpenAstronaut, onAskAi, deviceId }: {
  alert: Alert
  queued: number
  onClose: () => void
} & AlertCenterProps) {
  const [acking, setAcking] = useState(false)
  const crewTarget = alert.scope === 'crew' ? alert.crewIds[0] : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function ack() {
    setAcking(true)
    try {
      aiStore.replace(await ackAlert(alert.id, deviceId))
    } catch {
      /* offline: still close locally */
    }
    setAcking(false)
    onClose()
  }

  return (
    <div className="ai-overlay" data-testid="ai-alert-overlay">
      <section
        className={`ai-popup ai-sev-${alert.severity}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ai-popup-title"
        data-testid="ai-alert-popup"
        data-scenario={alert.scenarioId}
      >
        <header className="ai-popup-head">
          <span className="ai-sev-chip" data-testid="ai-alert-severity">
            <span aria-hidden="true">{ICON[alert.severity]}</span> {L.severity[alert.severity]}
          </span>
          <span className="ai-popup-scope">{alert.scope === 'cabin' ? L.scopeCabin : L.scopeCrew}</span>
          <button type="button" className="ai-icon-btn" onClick={onClose} aria-label={L.close} data-testid="ai-alert-close">×</button>
        </header>
        <h2 id="ai-popup-title" className="ai-popup-title">{alert.title}</h2>

        {alert.advice ? (
          <div className="ai-advice">
            {alert.advice.summary && (
              <div className="ai-summary" data-testid="ai-alert-summary">
                <span className="ai-summary-label">✦ {L.summary}</span>
                <p>{alert.advice.summary}</p>
              </div>
            )}
            <p><strong>{L.why}:</strong> {alert.advice.why}</p>
            <div>
              <strong>{L.doNow}:</strong>
              <ol>{alert.advice.doNow.map((step) => <li key={step}>{step}</li>)}</ol>
            </div>
            <p className="ai-escalate"><strong>{L.escalate}:</strong> {alert.advice.escalate}</p>
            <p className="ai-source" data-testid="ai-alert-source" data-source={alert.advice.source}>
              {L.interpretedBy(alert.advice.source)} · {alert.disclaimer}
            </p>
          </div>
        ) : (
          <p className="ai-muted">{L.adviceLoading}</p>
        )}

        <DeliveryBadge alert={alert} />

        <footer className="ai-popup-actions">
          <button type="button" className="ai-btn ai-btn-primary" onClick={ack} disabled={acking} data-testid="ai-alert-ack">
            {L.ack}
          </button>
          {crewTarget && onOpenAstronaut && (
            <button type="button" className="ai-btn" data-testid="ai-alert-open-astronaut"
              onClick={() => { onOpenAstronaut(crewTarget); onClose() }}>
              {L.openAstronaut}
            </button>
          )}
          {onAskAi && (
            <button type="button" className="ai-btn" data-testid="ai-alert-ask"
              onClick={() => { onAskAi(alert); onClose() }}>
              {L.askAi}
            </button>
          )}
          {queued > 0 && <span className="ai-muted">{L.moreAlerts(queued)}</span>}
        </footer>
      </section>
    </div>
  )
}

/** Phone only: vibrate, and raise a system notification when the page is in the background (needs the permission asked on start). */
function notifyPhone(alert: Alert) {
  try {
    navigator.vibrate?.(alert.severity === 'red' ? [350, 150, 350, 150, 700] : [250, 150, 250])
    if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(alert.title, { body: alert.spokenText, tag: alert.id, requireInteraction: alert.severity === 'red' })
    }
  } catch {
    /* unsupported on this device: sound and the popup still work */
  }
}

/** Mount once at the top of the app. Listens to /api/ai/stream, speaks and pops up new alerts. */
export function AlertCenter({ onOpenAstronaut, onAskAi, deviceId }: AlertCenterProps) {
  const { connection, alerts, incoming } = useAiState()
  const voice = useVoiceEnabled()
  const [listOpen, setListOpen] = useState(false)
  const announced = useRef(new Set<string>())
  const summarySpoken = useRef(new Set<string>())

  // Announce each new alert once, oldest first so the newest is heard last.
  useEffect(() => {
    for (const id of [...incoming].reverse()) {
      if (announced.current.has(id)) continue
      const alert = alerts.find((a) => a.id === id)
      if (!alert) continue
      announced.current.add(id)
      announce(alert.severity, alert.spokenText)
      if (deviceId) notifyPhone(alert)
    }
  }, [incoming, alerts, deviceId])

  // Gemini's reading arrives a few seconds later: say it once, but only while that alert is still on screen.
  const shownId = incoming[0]
  useEffect(() => {
    if (!shownId || !isVoiceEnabled()) return
    const summary = alerts.find((a) => a.id === shownId)?.advice?.summary
    if (!summary || summarySpoken.current.has(shownId)) return
    summarySpoken.current.add(shownId)
    speak(summary, 400)
  }, [shownId, alerts])

  const queue = incoming.map((id) => alerts.find((a) => a.id === id)).filter((a): a is Alert => Boolean(a))
  const current = queue[0]
  const redCount = alerts.filter((a) => a.severity === 'red').length

  return (
    <>
      <div className="ai-dock" data-testid="ai-alert-dock">
        <span className={`ai-conn ai-conn-${connection}`} data-testid="ai-connection" title={connection === 'offline' ? L.offlineHint : undefined}>
          <span className="ai-dot" aria-hidden="true" />
          {connection === 'live' ? L.live : connection === 'connecting' ? L.connecting : L.offline}
        </span>
        <button
          type="button"
          className={`ai-btn ai-voice ${voice ? 'is-on' : ''}`}
          aria-pressed={voice}
          onClick={() => toggleVoice(L.voiceTest)}
          data-testid="ai-voice-toggle"
        >
          {voice ? '🔊' : '🔇'} {voice ? L.voiceOn : L.voiceOff}
        </button>
        <button
          type="button"
          className={`ai-btn ai-count ${redCount ? 'has-red' : alerts.length ? 'has-amber' : ''}`}
          aria-expanded={listOpen}
          onClick={() => setListOpen((o) => !o)}
          data-testid="ai-alert-count"
        >
          🔔 {alerts.length}
        </button>
        {listOpen && (
          <div className="ai-list" data-testid="ai-alert-list">
            <p className="ai-list-title">{L.activeAlerts}</p>
            {alerts.length === 0 && <p className="ai-muted">{L.noAlerts}</p>}
            {alerts.map((a) => (
              <button key={a.id} type="button" className={`ai-list-item ai-sev-${a.severity}`}
                onClick={() => { announced.current.add(a.id); aiStore.show(a.id); setListOpen(false) }}
                data-testid={`ai-alert-item-${a.scenarioId}`}>
                <span className="ai-sev-chip">{ICON[a.severity]} {L.severity[a.severity]}</span>
                <span>{a.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {current && (
        <AlertPopup
          key={current.id}
          alert={current}
          queued={queue.length - 1}
          onClose={() => aiStore.dismiss(current.id)}
          onOpenAstronaut={onOpenAstronaut}
          onAskAi={onAskAi}
          deviceId={deviceId}
        />
      )}
    </>
  )
}
